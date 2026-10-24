import { useState } from 'react';
import { ArrowRight, QrCode, Circle, CircleCheck, CircleDot } from 'lucide-react';
import { Link } from 'react-router';
import type { DemoTask, TaskStatus } from '@relay-miden/shared';
import { TaskSummary } from './TaskSummary';
const statuses: { value: TaskStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];
export function TaskDetails({ task }: { task: DemoTask }) {
  const [editing, setEditing] = useState(false);
  const [nextStatus, setNextStatus] = useState<TaskStatus>(task.status);
  const [message, setMessage] = useState('');
  const activeIndex = statuses.findIndex((status) => status.value === task.status);
  return (
    <section className="panel max-w-xl p-4 md:p-6">
      <TaskSummary task={task} />
      <h2 className="mb-4 mt-7 text-sm font-semibold">
        Status <span className="ml-2 text-xs font-normal text-muted">Example timeline</span>
      </h2>
      <ol className="ml-2">
        {statuses.map((status, index) => {
          const Icon =
            index === activeIndex ? CircleDot : index < activeIndex ? CircleCheck : Circle;
          return (
            <li
              key={status.value}
              className={`relative flex min-h-16 gap-4 ${index > activeIndex ? 'text-muted' : 'text-brand'}`}
            >
              {index < statuses.length - 1 && (
                <span className="absolute bottom-0 left-[9px] top-5 w-px bg-[var(--color-border-strong)]" />
              )}
              <Icon
                size={20}
                className={`relative bg-surface ${index === activeIndex && task.status !== 'completed' ? 'text-warning' : ''}`}
              />
              <div>
                <span className="status-label text-sm">{status.label}</span>
                {index === activeIndex && (
                  <p className="mt-1 text-xs text-muted">Current example status</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mb-6 border-t border-line pt-4">
        <h3 className="text-xs font-semibold">Notes</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{task.notes}</p>
      </div>
      <button
        className="button-primary w-full"
        onClick={() => {
          setEditing(!editing);
          setMessage('');
        }}
        aria-expanded={editing}
      >
        <ArrowRight size={18} />
        Preview status update
      </button>
      {editing && (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(
              `Preview: ${statuses.find((status) => status.value === nextStatus)?.label}. No changes were saved or sent.`,
            );
          }}
        >
          <label className="field">
            Next status
            <select
              className="control"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value as TaskStatus)}
            >
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>
          <button className="button-secondary">Preview selection</button>
        </form>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-brand">
          {message}
        </p>
      )}
      <Link to={`/send?task=${task.id}`} className="button-secondary mt-3 w-full">
        <QrCode size={17} />
        View QR transfer preview
      </Link>
      <p className="mt-4 text-center text-[11px] text-muted">
        Demonstration task. Task updates arrive in a future phase.
      </p>
    </section>
  );
}
