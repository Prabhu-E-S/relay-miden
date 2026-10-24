import { z } from 'zod';
import {
  CreateTaskInputSchema,
  isValidStatusTransition,
  TaskOperationSchema,
  TaskSchema,
  TaskStatusSchema,
  UpdateTaskInputSchema,
  type CreateTaskInput,
  type Task,
  type TaskOperation,
  type TaskOperationType,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskInput,
} from '@relay-miden/shared';
import { db, type RelayMidenDatabase } from './database';
import { TaskRepositoryError } from './errors';

const DeviceIdSchema = z.uuid();
const DEVICE_ID_KEY = 'device-id';

export type TaskSort = 'newest' | 'oldest' | 'priority' | 'recently_updated';
export interface TaskFilters {
  search?: string;
  status?: TaskStatus | 'active' | 'all';
  priority?: TaskPriority | 'all';
  sort?: TaskSort;
}

export interface TaskStatistics {
  active: number;
  inProgress: number;
  completed: number;
}

export interface TaskRepositoryDependencies {
  now?: () => string;
  taskId?: () => string;
  operationId?: () => string;
}

const priorityRank: Record<TaskPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

export function applyTaskFilters(tasks: readonly Task[], filters: TaskFilters = {}): Task[] {
  const query = filters.search?.trim().toLocaleLowerCase() ?? '';
  const status = filters.status ?? 'all';
  const priority = filters.priority ?? 'all';
  const sort = filters.sort ?? 'recently_updated';

  return tasks
    .filter((task) => !task.deletedAt)
    .filter((task) => {
      if (status === 'all') return true;
      if (status === 'active') return task.status !== 'completed';
      return task.status === status;
    })
    .filter((task) => priority === 'all' || task.priority === priority)
    .filter((task) => {
      if (!query) return true;
      return [task.title, task.location, task.description ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(query),
      );
    })
    .sort((left, right) => {
      if (sort === 'oldest') return left.createdAt.localeCompare(right.createdAt);
      if (sort === 'newest') return right.createdAt.localeCompare(left.createdAt);
      if (sort === 'priority') {
        return (
          priorityRank[right.priority] - priorityRank[left.priority] ||
          right.updatedAt.localeCompare(left.updatedAt)
        );
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    });
}

export class TaskRepository {
  private readonly now: () => string;
  private readonly taskId: () => string;
  private readonly operationId: () => string;

  constructor(
    readonly database: RelayMidenDatabase = db,
    dependencies: TaskRepositoryDependencies = {},
  ) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
    this.taskId = dependencies.taskId ?? (() => crypto.randomUUID());
    this.operationId = dependencies.operationId ?? (() => crypto.randomUUID());
  }

  async open(): Promise<void> {
    try {
      await this.database.open();
      await this.getDeviceId();
    } catch (error) {
      throw this.wrapDatabaseError(error, 'The local task database could not be opened.');
    }
  }

  async getDeviceId(): Promise<string> {
    try {
      return await this.database.transaction('rw', this.database.settings, async () => {
        const existing = await this.database.settings.get(DEVICE_ID_KEY);
        const parsed = DeviceIdSchema.safeParse(existing?.value);
        if (parsed.success) return parsed.data;

        const deviceId = crypto.randomUUID();
        await this.database.settings.put({
          key: DEVICE_ID_KEY,
          value: deviceId,
          updatedAt: this.now(),
        });
        return deviceId;
      });
    } catch (error) {
      throw this.wrapDatabaseError(error, 'The anonymous device identity could not be stored.');
    }
  }

  async createTask(input: CreateTaskInput): Promise<Task> {
    const parsed = CreateTaskInputSchema.safeParse(input);
    if (!parsed.success) throw this.invalidInput(parsed.error);
    const actorId = await this.getDeviceId();
    const timestamp = this.now();
    const task = TaskSchema.parse({
      ...parsed.data,
      id: this.taskId(),
      status: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: actorId,
      revision: 1,
      deletedAt: null,
    });
    const operation = this.createOperation(task, actorId, 'TASK_CREATE', null);

    try {
      await this.database.transaction(
        'rw',
        [this.database.tasks, this.database.operations],
        async () => {
          await this.database.tasks.add(task);
          await this.database.operations.add(operation);
        },
      );
      return task;
    } catch (error) {
      throw this.wrapDatabaseError(error, 'The task could not be created locally.');
    }
  }

  async getTaskById(id: string, includeDeleted = false): Promise<Task | undefined> {
    const task = await this.database.tasks.get(id);
    if (!task || (!includeDeleted && task.deletedAt)) return undefined;
    const parsed = TaskSchema.safeParse(task);
    if (!parsed.success) {
      throw new TaskRepositoryError(
        'This task contains invalid local data and cannot be displayed safely.',
        'INVALID_INPUT',
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }

  async getAllTasks(filters: TaskFilters = {}): Promise<Task[]> {
    const records = await this.database.tasks.toArray();
    const tasks = records.map((record) => TaskSchema.parse(record));
    return applyTaskFilters(tasks, filters);
  }

  async getRecentTasks(limit = 4): Promise<Task[]> {
    return (await this.getAllTasks({ sort: 'recently_updated' })).slice(0, Math.max(0, limit));
  }

  async searchTasks(query: string): Promise<Task[]> {
    return this.getAllTasks({ search: query });
  }

  async filterTasks(filters: TaskFilters): Promise<Task[]> {
    return this.getAllTasks(filters);
  }

  async getTaskStatistics(): Promise<TaskStatistics> {
    const tasks = await this.getAllTasks();
    return {
      active: tasks.filter((task) => task.status !== 'completed').length,
      inProgress: tasks.filter((task) => task.status === 'in_progress').length,
      completed: tasks.filter((task) => task.status === 'completed').length,
    };
  }

  async updateTask(id: string, changes: UpdateTaskInput): Promise<Task> {
    const parsed = UpdateTaskInputSchema.safeParse(changes);
    if (!parsed.success) throw this.invalidInput(parsed.error);
    const actorId = await this.getDeviceId();

    try {
      return await this.database.transaction(
        'rw',
        [this.database.tasks, this.database.operations],
        async () => {
          const existing = await this.requireActiveTask(id);
          const candidate: Record<string, unknown> = {
            ...existing,
            ...parsed.data,
            updatedAt: this.now(),
            revision: existing.revision + 1,
          };
          for (const field of ['description', 'quantity', 'unit'] as const) {
            if (candidate[field] === null) delete candidate[field];
          }
          if (candidate.quantity === undefined) delete candidate.unit;
          const task = TaskSchema.parse(candidate);
          const operation = this.createOperation(task, actorId, 'TASK_UPDATE', existing.revision);
          await this.database.tasks.put(task);
          await this.database.operations.add(operation);
          return task;
        },
      );
    } catch (error) {
      if (error instanceof TaskRepositoryError) throw error;
      throw this.wrapDatabaseError(error, 'The task changes could not be saved locally.');
    }
  }

  async updateTaskStatus(
    id: string,
    nextStatus: TaskStatus,
    options: { allowReopen?: boolean } = {},
  ): Promise<Task> {
    const parsedStatus = TaskStatusSchema.safeParse(nextStatus);
    if (!parsedStatus.success) throw this.invalidInput(parsedStatus.error);
    const actorId = await this.getDeviceId();

    try {
      return await this.database.transaction(
        'rw',
        [this.database.tasks, this.database.operations],
        async () => {
          const existing = await this.requireActiveTask(id);
          if (!isValidStatusTransition(existing.status, parsedStatus.data, options.allowReopen)) {
            throw new TaskRepositoryError(
              `The status cannot move from ${existing.status} to ${parsedStatus.data}.`,
              'INVALID_TRANSITION',
            );
          }
          const task = TaskSchema.parse({
            ...existing,
            status: parsedStatus.data,
            updatedAt: this.now(),
            revision: existing.revision + 1,
          });
          const operation = this.createOperation(task, actorId, 'TASK_UPDATE', existing.revision);
          await this.database.tasks.put(task);
          await this.database.operations.add(operation);
          return task;
        },
      );
    } catch (error) {
      if (error instanceof TaskRepositoryError) throw error;
      throw this.wrapDatabaseError(error, 'The task status could not be saved locally.');
    }
  }

  async deleteTask(id: string): Promise<Task> {
    const actorId = await this.getDeviceId();
    try {
      return await this.database.transaction(
        'rw',
        [this.database.tasks, this.database.operations],
        async () => {
          const existing = await this.requireActiveTask(id);
          const timestamp = this.now();
          const task = TaskSchema.parse({
            ...existing,
            deletedAt: timestamp,
            updatedAt: timestamp,
            revision: existing.revision + 1,
          });
          const operation = this.createOperation(task, actorId, 'TASK_DELETE', existing.revision);
          await this.database.tasks.put(task);
          await this.database.operations.add(operation);
          return task;
        },
      );
    } catch (error) {
      if (error instanceof TaskRepositoryError) throw error;
      throw this.wrapDatabaseError(error, 'The task could not be deleted locally.');
    }
  }

  async getTaskOperations(taskId: string): Promise<TaskOperation[]> {
    const operations = await this.database.operations
      .where('taskId')
      .equals(taskId)
      .sortBy('revision');
    return operations.map((operation) => TaskOperationSchema.parse(operation));
  }

  private async requireActiveTask(id: string): Promise<Task> {
    const existing = await this.database.tasks.get(id);
    if (!existing || existing.deletedAt) {
      throw new TaskRepositoryError('The task was not found or has been deleted.', 'NOT_FOUND');
    }
    return TaskSchema.parse(existing);
  }

  private createOperation(
    task: Task,
    actorId: string,
    operationType: TaskOperationType,
    parentRevision: number | null,
  ): TaskOperation {
    return TaskOperationSchema.parse({
      operationId: this.operationId(),
      taskId: task.id,
      actorId,
      operationType,
      timestamp: task.updatedAt,
      revision: task.revision,
      parentRevision,
      payload: task,
    });
  }

  private invalidInput(error: z.ZodError): TaskRepositoryError {
    return new TaskRepositoryError(
      error.issues[0]?.message ?? 'The task data is invalid.',
      'INVALID_INPUT',
      {
        cause: error,
      },
    );
  }

  private wrapDatabaseError(error: unknown, message: string): TaskRepositoryError {
    if (error instanceof TaskRepositoryError) return error;
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      return new TaskRepositoryError(
        'Local storage is full. Free browser storage before trying again.',
        'STORAGE_FULL',
        { cause: error },
      );
    }
    if (error instanceof DOMException && error.name === 'ConstraintError') {
      return new TaskRepositoryError(
        'A duplicate local record was rejected. No partial task data was saved.',
        'DUPLICATE',
        { cause: error },
      );
    }
    return new TaskRepositoryError(message, 'TRANSACTION_FAILED', { cause: error });
  }
}

export const taskRepository = new TaskRepository();
