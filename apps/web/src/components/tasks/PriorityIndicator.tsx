import type { TaskPriority } from '@relay-miden/shared';
import { useLanguage } from '../../hooks/use-language';

export function PriorityIndicator({ priority }: { priority: TaskPriority }) {
  const { dict } = useLanguage();
  const label = dict.priorities[priority] ?? priority;
  return <span className={`priority-label priority-${priority} text-xs capitalize`}>{label}</span>;
}
