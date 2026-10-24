import { useRef, useState } from 'react';
import {
  ArrowRight,
  Circle,
  CircleCheck,
  CircleDot,
  Pencil,
  QrCode,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  TASK_STATUS_SEQUENCE,
  type Task,
  type TaskOperation,
  type TaskStatus,
} from '@relay-miden/shared';
import { TaskSummary } from './TaskSummary';
import { QuickTaskForm } from './QuickTaskForm';
import { actionLabels, formatDateTime, statusLabels } from '../../lib/task-display';
import { readableDatabaseError } from '../../db/errors';
import { taskRepository } from '../../db/task-repository';

const operationLabels = {
  TASK_CREATE: 'Task created',
  TASK_UPDATE: 'Task updated',
  TASK_DELETE: 'Task deleted',
} as const;

export function TaskDetails({ task, operations }: { task: Task; operations: TaskOperation[] }) {
  const navigate = useNavigate();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const activeIndex = TASK_STATUS_SEQUENCE.indexOf(task.status);
  const nextStatus = TASK_STATUS_SEQUENCE[activeIndex + 1];

  async function changeStatus(status: TaskStatus, allowReopen = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await taskRepository.updateTaskStatus(task.id, status, { allowReopen });
      setMessage(`Status updated to ${statusLabels[status]}.`);
    } catch (cause) {
      setError(readableDatabaseError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    setError('');
    try {
      await taskRepository.deleteTask(task.id);
      deleteDialog.current?.close();
      navigate('/tasks', { replace: true, state: { notice: 'Task deleted from active lists.' } });
    } catch (cause) {
      setError(readableDatabaseError(cause));
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
      <div>
        <section className="panel p-4 md:p-6">
          <TaskSummary task={task} />
          <h2 className="mb-4 mt-7 text-sm font-semibold">
            Status <span className="ml-2 text-xs font-normal text-muted">Local task timeline</span>
          </h2>
          <ol className="ml-2">
            {TASK_STATUS_SEQUENCE.map((status, index) => {
              const Icon =
                index === activeIndex ? CircleDot : index < activeIndex ? CircleCheck : Circle;
              return (
                <li
                  key={status}
                  className={`relative flex min-h-16 gap-4 ${index > activeIndex ? 'text-muted' : 'text-brand'}`}
                >
                  {index < TASK_STATUS_SEQUENCE.length - 1 && (
                    <span className="absolute bottom-0 left-[9px] top-5 w-px bg-[var(--color-border-strong)]" />
                  )}
                  <Icon
                    size={20}
                    className={`relative bg-surface ${index === activeIndex && task.status !== 'completed' ? 'text-warning' : ''}`}
                  />
                  <div>
                    <span className="status-label text-sm">{statusLabels[status]}</span>
                    {index === activeIndex && (
                      <p className="mt-1 text-xs text-muted">
                        Current status · revision {task.revision}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mb-6 border-t border-line pt-4">
            <h3 className="text-xs font-semibold">Description</h3>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
              {task.description || 'No description was added.'}
            </p>
          </div>

          {nextStatus ? (
            <button
              className="button-primary w-full"
              disabled={busy}
              onClick={() => void changeStatus(nextStatus)}
            >
              <ArrowRight size={18} />
              {busy ? 'Saving locally…' : `Mark ${statusLabels[nextStatus]}`}
            </button>
          ) : (
            <button
              className="button-secondary w-full"
              disabled={busy}
              onClick={() => void changeStatus('pending', true)}
            >
              <RotateCcw size={17} /> Reopen as Pending
            </button>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className="button-secondary" onClick={() => setEditing((value) => !value)}>
              <Pencil size={17} /> Edit
            </button>
            <button
              className="button-secondary text-danger"
              onClick={() => deleteDialog.current?.showModal()}
            >
              <Trash2 size={17} /> Delete
            </button>
          </div>
          {message && (
            <p role="status" className="mt-4 text-sm text-brand">
              {message}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <Link to={`/send?task=${task.id}`} className="button-secondary mt-3 w-full">
            <QrCode size={17} /> View QR transfer placeholder
          </Link>
        </section>

        {editing && (
          <div className="mt-5">
            <QuickTaskForm
              key={`${task.id}-${task.revision}`}
              task={task}
              onSaved={() => {
                setEditing(false);
                setMessage('Task changes saved on this device.');
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}
      </div>

      <aside className="grid gap-5">
        <section className="panel p-5">
          <h2 className="text-base font-semibold">Task information</h2>
          <dl className="mt-4 grid gap-4 text-xs">
            <div>
              <dt className="text-muted">Action</dt>
              <dd className="mt-1 font-medium">{actionLabels[task.action]}</dd>
            </div>
            <div>
              <dt className="text-muted">Created</dt>
              <dd className="mt-1 font-medium">{formatDateTime(task.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Last updated</dt>
              <dd className="mt-1 font-medium">{formatDateTime(task.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">Device</dt>
              <dd className="mt-1 break-all font-mono text-[10px]">{task.createdBy}</dd>
            </div>
            <div>
              <dt className="text-muted">Revision</dt>
              <dd className="mt-1 font-medium">{task.revision}</dd>
            </div>
          </dl>
        </section>
        <section className="panel p-5">
          <h2 className="text-base font-semibold">Activity</h2>
          <ol className="mt-4 space-y-4">
            {[...operations].reverse().map((operation) => (
              <li
                key={operation.operationId}
                className="border-b border-line pb-4 last:border-0 last:pb-0"
              >
                <p className="text-xs font-medium">{operationLabels[operation.operationType]}</p>
                <p className="mt-1 text-[11px] text-muted">
                  Revision {operation.revision} · {formatDateTime(operation.timestamp)}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <dialog
        ref={deleteDialog}
        className="confirmation-dialog panel w-[min(92vw,420px)] p-0 backdrop:bg-[color:rgb(0_0_0/35%)]"
      >
        <div className="p-6">
          <h2 className="text-lg font-semibold">Delete this task?</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            It will disappear from normal lists but remain in local history for future recovery and
            synchronization.
          </p>
          {error && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              className="button-secondary"
              disabled={busy}
              onClick={() => deleteDialog.current?.close()}
            >
              Cancel
            </button>
            <button className="button-primary" disabled={busy} onClick={() => void confirmDelete()}>
              <Trash2 size={17} /> {busy ? 'Deleting…' : 'Delete Task'}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
