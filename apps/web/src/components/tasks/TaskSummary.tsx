import type { Task } from '@relay-miden/shared';
import { TaskIcon } from './TaskIcon';
import { PriorityIndicator } from './PriorityIndicator';
import { useLanguage } from '../../hooks/use-language';

export function TaskSummary({ task }: { task: Task }) {
  const { formatTaskTitle, dict } = useLanguage();
  const displayTitle = formatTaskTitle(task);
  const unitLabel = task.instruction?.unitCode
    ? (dict.units[task.instruction.unitCode] ?? task.unit)
    : task.unit;
  const location = task.instruction?.locationText ?? task.location;

  return (
    <div className="panel flex items-start gap-3 p-4">
      <TaskIcon action={task.action} />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold">{displayTitle}</h2>
        {task.quantity !== undefined && (
          <p className="mt-1 text-xs text-muted">
            {task.quantity} {unitLabel}
          </p>
        )}
        <p className="mt-1 text-xs text-muted">{location}</p>
      </div>
      <PriorityIndicator priority={task.priority} />
    </div>
  );
}
