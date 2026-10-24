import type { TaskPriority } from '@relay-miden/shared';
export function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`priority-label priority-${priority} text-xs capitalize`}>{priority}</span>
  );
}
