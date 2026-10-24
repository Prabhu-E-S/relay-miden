import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { CreateTaskInput } from '@relay-miden/shared';
import { RelayMidenDatabase } from './database';
import { TaskRepository, applyTaskFilters } from './task-repository';

const databases: RelayMidenDatabase[] = [];
const validInput: CreateTaskInput = {
  action: 'DELIVER_SUPPLIES',
  title: 'Deliver drinking water',
  description: 'Bring sealed bottles to the main gate.',
  quantity: 20,
  unit: 'Bottles',
  location: 'Relief Camp, Block A',
  priority: 'high',
};

function createRepository(
  name = `relay-miden-test-${crypto.randomUUID()}`,
  dependencies: ConstructorParameters<typeof TaskRepository>[1] = {},
) {
  const database = new RelayMidenDatabase(name);
  databases.push(database);
  return { database, repository: new TaskRepository(database, dependencies) };
}

afterEach(async () => {
  for (const database of databases.splice(0)) {
    database.close();
    await database.delete();
  }
});

describe('TaskRepository', () => {
  it('creates, validates, saves, and retrieves a task', async () => {
    const { repository } = createRepository();
    const created = await repository.createTask(validInput);
    expect(created).toMatchObject({
      ...validInput,
      status: 'pending',
      revision: 1,
      deletedAt: null,
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(new Date(created.createdAt).toISOString()).toBe(created.createdAt);
    expect(await repository.getTaskById(created.id)).toEqual(created);
  });

  it('rejects invalid titles and quantities before persistence', async () => {
    const { repository } = createRepository();
    await expect(repository.createTask({ ...validInput, title: ' ' })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(repository.createTask({ ...validInput, quantity: -2 })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(await repository.getAllTasks()).toHaveLength(0);
  });

  it('generates unique task and operation identifiers', async () => {
    const { repository } = createRepository();
    const first = await repository.createTask(validInput);
    const second = await repository.createTask({ ...validInput, title: 'Deliver blankets' });
    expect(first.id).not.toBe(second.id);
    const operations = [
      ...(await repository.getTaskOperations(first.id)),
      ...(await repository.getTaskOperations(second.id)),
    ];
    expect(new Set(operations.map((operation) => operation.operationId)).size).toBe(2);
  });

  it('updates editable fields and increments the revision', async () => {
    const { repository } = createRepository();
    const created = await repository.createTask(validInput);
    const updated = await repository.updateTask(created.id, {
      title: 'Deliver potable water',
      priority: 'urgent',
      description: null,
    });
    expect(updated.title).toBe('Deliver potable water');
    expect(updated.priority).toBe('urgent');
    expect(updated.description).toBeUndefined();
    expect(updated.revision).toBe(2);
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.createdBy).toBe(created.createdBy);
  });

  it('advances status through valid transitions and rejects skipped states', async () => {
    const { repository } = createRepository();
    const created = await repository.createTask(validInput);
    await expect(repository.updateTaskStatus(created.id, 'in_progress')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const acknowledged = await repository.updateTaskStatus(created.id, 'acknowledged');
    const inProgress = await repository.updateTaskStatus(created.id, 'in_progress');
    const completed = await repository.updateTaskStatus(created.id, 'completed');
    expect([acknowledged.revision, inProgress.revision, completed.revision]).toEqual([2, 3, 4]);
  });

  it('requires an explicit reopen and records it as a new revision', async () => {
    const { repository } = createRepository();
    const created = await repository.createTask(validInput);
    await repository.updateTaskStatus(created.id, 'acknowledged');
    await repository.updateTaskStatus(created.id, 'in_progress');
    await repository.updateTaskStatus(created.id, 'completed');
    await expect(repository.updateTaskStatus(created.id, 'pending')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    const reopened = await repository.updateTaskStatus(created.id, 'pending', {
      allowReopen: true,
    });
    expect(reopened).toMatchObject({ status: 'pending', revision: 5 });
  });

  it('soft-deletes tasks and excludes them from normal queries', async () => {
    const { repository } = createRepository();
    const created = await repository.createTask(validInput);
    const deleted = await repository.deleteTask(created.id);
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.revision).toBe(2);
    expect(await repository.getTaskById(created.id)).toBeUndefined();
    expect(await repository.getTaskById(created.id, true)).toEqual(deleted);
    expect(await repository.getAllTasks()).toEqual([]);
  });

  it('records exactly one append-only operation per successful mutation', async () => {
    const { repository, database } = createRepository();
    const created = await repository.createTask(validInput);
    await repository.updateTask(created.id, { location: 'Community Hall' });
    await repository.updateTaskStatus(created.id, 'acknowledged');
    await repository.deleteTask(created.id);
    const operations = await repository.getTaskOperations(created.id);
    expect(operations.map((operation) => operation.operationType)).toEqual([
      'TASK_CREATE',
      'TASK_UPDATE',
      'TASK_UPDATE',
      'TASK_DELETE',
    ]);
    expect(operations.map((operation) => operation.revision)).toEqual([1, 2, 3, 4]);
    expect(operations.map((operation) => operation.parentRevision)).toEqual([null, 1, 2, 3]);
    expect(await database.operations.count()).toBe(4);
    expect(() => JSON.stringify(operations)).not.toThrow();
  });

  it('rolls back a task write when its operation cannot be inserted', async () => {
    const duplicateOperationId = crypto.randomUUID();
    const { repository, database } = createRepository(undefined, {
      operationId: () => duplicateOperationId,
    });
    await repository.createTask(validInput);
    await expect(
      repository.createTask({ ...validInput, title: 'Second task' }),
    ).rejects.toBeDefined();
    expect(await database.tasks.count()).toBe(1);
    expect(await database.operations.count()).toBe(1);
  });

  it('calculates dashboard statistics from active local records', async () => {
    const { repository } = createRepository();
    const pending = await repository.createTask(validInput);
    const inProgress = await repository.createTask({ ...validInput, title: 'Medical support' });
    const completed = await repository.createTask({ ...validInput, title: 'Road report' });
    await repository.updateTaskStatus(inProgress.id, 'acknowledged');
    await repository.updateTaskStatus(inProgress.id, 'in_progress');
    await repository.updateTaskStatus(completed.id, 'acknowledged');
    await repository.updateTaskStatus(completed.id, 'in_progress');
    await repository.updateTaskStatus(completed.id, 'completed');
    await repository.deleteTask(pending.id);
    expect(await repository.getTaskStatistics()).toEqual({
      active: 1,
      inProgress: 1,
      completed: 1,
    });
  });

  it('searches title, location, and description and filters priority/status', async () => {
    const { repository } = createRepository();
    const water = await repository.createTask(validInput);
    await repository.createTask({
      ...validInput,
      title: 'Request medical volunteers',
      description: 'First aid support',
      location: 'Main Shelter',
      priority: 'urgent',
    });
    expect((await repository.searchTasks('sealed')).map((task) => task.id)).toEqual([water.id]);
    expect(await repository.filterTasks({ priority: 'urgent' })).toHaveLength(1);
    expect(await repository.filterTasks({ status: 'pending' })).toHaveLength(2);
  });

  it('sorts priority and date views deterministically', () => {
    const base = {
      id: crypto.randomUUID(),
      action: 'CUSTOM' as const,
      title: 'Task',
      location: 'Location',
      status: 'pending' as const,
      createdAt: '2026-10-24T10:00:00.000Z',
      updatedAt: '2026-10-24T10:00:00.000Z',
      createdBy: crypto.randomUUID(),
      revision: 1,
      deletedAt: null,
    };
    const low = { ...base, id: crypto.randomUUID(), title: 'Low', priority: 'low' as const };
    const urgent = {
      ...base,
      id: crypto.randomUUID(),
      title: 'Urgent',
      priority: 'urgent' as const,
      createdAt: '2026-10-24T11:00:00.000Z',
      updatedAt: '2026-10-24T11:00:00.000Z',
    };
    expect(applyTaskFilters([low, urgent], { sort: 'priority' }).map((task) => task.title)).toEqual(
      ['Urgent', 'Low'],
    );
    expect(applyTaskFilters([low, urgent], { sort: 'oldest' }).map((task) => task.title)).toEqual([
      'Low',
      'Urgent',
    ]);
  });

  it('preserves tasks when the database is reopened', async () => {
    const name = `relay-miden-reopen-${crypto.randomUUID()}`;
    const first = createRepository(name);
    const created = await first.repository.createTask(validInput);
    first.database.close();
    const second = createRepository(name);
    expect(await second.repository.getTaskById(created.id)).toEqual(created);
  });

  it('keeps a stable device identity across repository instances', async () => {
    const name = `relay-miden-device-${crypto.randomUUID()}`;
    const first = createRepository(name);
    const deviceId = await first.repository.getDeviceId();
    first.database.close();
    const second = createRepository(name);
    expect(await second.repository.getDeviceId()).toBe(deviceId);
  });

  it('repairs a corrupted device setting without clearing tasks', async () => {
    const { repository, database } = createRepository();
    const created = await repository.createTask(validInput);
    await database.settings.put({
      key: 'device-id',
      value: { invalid: true },
      updatedAt: new Date().toISOString(),
    });
    const repaired = await repository.getDeviceId();
    expect(repaired).toMatch(/^[0-9a-f-]{36}$/i);
    expect(await repository.getTaskById(created.id)).toEqual(created);
  });
});
