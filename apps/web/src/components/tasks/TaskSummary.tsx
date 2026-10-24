import type { DemoTask } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
export function TaskSummary({ task }: { task: DemoTask }) {
  return (
    <div className="panel flex items-start gap-3 p-4">
      <TaskIcon kind={task.kind} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{task.title}</h2>
        <p className="mt-1 text-xs text-muted">
          {task.quantity} {task.unit}
        </p>
        <p className="mt-1 text-xs text-muted">{task.location}</p>
      </div>
      <PriorityIndicator priority={task.priority} />
    </div>
  );
}
