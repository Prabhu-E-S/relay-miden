import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Task } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
import { EmptyState } from '../ui/EmptyState';
import { formatRelativeTime, statusLabels } from '../../lib/task-display';

export function TaskRow({ task }: { task: Task }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="task-row"
      aria-label={`${task.title}, ${task.priority} priority`}
    >
      <TaskIcon action={task.action} />
      <div className="min-w-0">
        <h3 className="text-xs font-semibold leading-relaxed tracking-tight">{task.title}</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {task.location} · <span className="status-label">{statusLabels[task.status]}</span>
        </p>
      </div>
      <PriorityIndicator priority={task.priority} />
      <span className="hidden text-right text-[10px] text-muted md:block">
        {formatRelativeTime(task.updatedAt)}
      </span>
      <ChevronRight size={15} className="hidden md:block" aria-hidden="true" />
    </Link>
  );
}
export function TaskList({
  tasks,
  recent = false,
  emptyTitle = 'No tasks yet',
  emptyDescription = 'Create your first local task. It will be saved privately on this device.',
  emptyActionLabel = 'Create a task',
  emptyActionTo = '/create',
}: {
  tasks: readonly Task[];
  recent?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionTo?: string;
}) {
  if (tasks.length === 0)
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        actionLabel={emptyActionLabel}
        actionTo={emptyActionTo}
      />
    );
  return (
    <section
      className="panel min-w-0 px-4 py-2 md:px-5"
      aria-label={recent ? 'Recent tasks' : 'Tasks'}
    >
      <div className="panel-heading border-b border-line py-1">
        <h2>{recent ? 'Recent Tasks' : 'Tasks'}</h2>
        {recent ? (
          <Link to="/tasks" className="text-link">
            View all <ArrowRight size={14} />
          </Link>
        ) : (
          <span className="py-3 text-xs font-normal text-muted">
            {tasks.length} {tasks.length === 1 ? 'record' : 'records'}
          </span>
        )}
      </div>
      <div>
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} />
        ))}
      </div>
    </section>
  );
}
