import type { Task } from '@relay-miden/shared';
import { TaskForm } from './TaskForm';

export function QuickTaskForm({
  quick = false,
  task,
  onSaved,
  onCancel,
}: {
  quick?: boolean;
  task?: Task;
  onSaved?: (saved: Task) => void;
  onCancel?: () => void;
}) {
  return (
    <TaskForm
      quick={quick}
      {...(task ? { task } : {})}
      {...(onSaved ? { onSaved } : {})}
      {...(onCancel ? { onCancel } : {})}
    />
  );
}
