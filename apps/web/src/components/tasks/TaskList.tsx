import { ArrowRight, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import type { DemoTask } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
import { EmptyState } from '../ui/EmptyState';

export function TaskRow({ task }: { task: DemoTask }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="task-row"
      aria-label={`${task.title}, ${task.priority} priority`}
    >
      <TaskIcon kind={task.kind} />
      <div className="min-w-0">
        <h3 className="text-xs font-semibold leading-relaxed tracking-tight">{task.title}</h3>
        <p className="mt-0.5 text-[11px] text-muted">{task.location}</p>
      </div>
      <PriorityIndicator priority={task.priority} />
      <span className="hidden text-right text-[10px] text-muted md:block">{task.relativeTime}</span>
      <ChevronRight size={15} className="hidden md:block" aria-hidden="true" />
    </Link>
  );
}
export function TaskList({
  tasks,
  recent = false,
}: {
  tasks: readonly DemoTask[];
  recent?: boolean;
}) {
  if (tasks.length === 0)
    return (
      <EmptyState
        title="No matching example tasks"
        description="Try a different search or status filter. This workspace contains four demonstration records."
      />
    );
  return (
    <section
      className="panel min-w-0 px-4 py-2 md:px-5"
      aria-label={recent ? 'Recent tasks' : 'Example tasks'}
    >
      <div className="panel-heading border-b border-line py-1">
        <h2>{recent ? 'Recent Tasks' : 'Example Tasks'}</h2>
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
