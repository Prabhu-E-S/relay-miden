import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { Task } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
import { EmptyState } from '../ui/EmptyState';
import { formatRelativeTime } from '../../lib/task-display';
import { useLanguage } from '../../hooks/use-language';

export function TaskRow({ task }: { task: Task }) {
  const { formatTaskTitle, dict } = useLanguage();
  const displayTitle = formatTaskTitle(task);
  const statusLabel = dict.statuses[task.status] ?? task.status;
  const location = task.instruction?.locationText ?? task.location;

  return (
    <Link
      to={`/tasks/${task.id}`}
      className="task-row"
      aria-label={`${displayTitle}, ${dict.priorities[task.priority] ?? task.priority} priority`}
    >
      <TaskIcon action={task.action} />
      <div className="min-w-0">
        <h3 className="text-xs font-semibold leading-relaxed tracking-tight">{displayTitle}</h3>
        <p className="mt-0.5 text-[11px] text-muted">
          {location} · <span className="status-label">{statusLabel}</span>
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
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionTo = '/create',
}: {
  tasks: readonly Task[];
  recent?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyActionLabel?: string;
  emptyActionTo?: string;
}) {
  const { dict } = useLanguage();

  if (tasks.length === 0)
    return (
      <EmptyState
        title={emptyTitle ?? dict.task.noTasksTitle}
        description={emptyDescription ?? dict.task.noTasksDescription}
        actionLabel={emptyActionLabel ?? dict.task.createTaskAction}
        actionTo={emptyActionTo}
      />
    );

  return (
    <section
      className="panel min-w-0 px-4 py-2 md:px-5"
      aria-label={recent ? dict.task.recentHeading : dict.nav.tasks}
    >
      <div className="panel-heading border-b border-line py-1">
        <h2>{recent ? dict.task.recentHeading : dict.nav.tasks}</h2>
        {recent ? (
          <Link to="/tasks" className="text-link">
            {dict.task.viewAllLink} <ArrowRight size={14} />
          </Link>
        ) : (
          <span className="py-3 text-xs font-normal text-muted">
            {dict.task.recordsCount(tasks.length)}
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
