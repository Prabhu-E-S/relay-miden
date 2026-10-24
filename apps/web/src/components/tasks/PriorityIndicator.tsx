import type { Priority } from '@relay-miden/shared';
export function PriorityIndicator({ priority }: { priority: Priority }) {
  return (
    <span className={`priority-label priority-${priority} text-xs capitalize`}>{priority}</span>
  );
}
