import type { TaskPriority } from '@relay-miden/shared';
const priorities: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
export function PrioritySelector({
  value,
  onChange,
  name,
}: {
  value: TaskPriority;
  onChange: (priority: TaskPriority) => void;
  name: string;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold">Priority</legend>
      <div className="grid grid-cols-4 gap-1">
        {priorities.map((priority) => (
          <label
            key={priority}
            className={`priority-label priority-${priority} relative flex min-h-11 cursor-pointer items-center justify-center border-b-2 text-xs capitalize ${value === priority ? 'border-current font-semibold' : 'border-transparent'}`}
          >
            <input
              type="radio"
              className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
              name={name}
              value={priority}
              checked={value === priority}
              onChange={() => onChange(priority)}
            />
            <span className="pointer-events-none rounded-sm px-1 py-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              {priority.charAt(0).toUpperCase() + priority.slice(1)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
