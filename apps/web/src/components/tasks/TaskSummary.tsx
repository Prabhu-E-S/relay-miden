import type { Task } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
export function TaskSummary({ task }: { task: Task }) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <TaskIcon action={task.action} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{task.title}</h2>
        {task.quantity !== undefined && (
          <p className="mt-1 text-xs text-muted">
            {task.quantity} {task.unit}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">{task.location}</p>
      </div>
      <PriorityIndicator priority={task.priority} />
    </div>
  );
}
