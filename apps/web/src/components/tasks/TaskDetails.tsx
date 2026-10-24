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
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TASK_STATUS_SEQUENCE,
  type Task,
  type TaskOperation,
  type TaskOperationType,
  type TaskStatus,
} from '@relay-miden/shared';
import { TaskSummary } from './TaskSummary';
import { QuickTaskForm } from './QuickTaskForm';
import { actionLabels, formatDateTime } from '../../lib/task-display';
import { readableDatabaseError } from '../../db/errors';
import { taskRepository } from '../../db/task-repository';
import { useLanguage } from '../../hooks/use-language';
import { db } from '../../db/database';
import { syncRepository } from '../../services/sync/sync-repository';

export function TaskDetails({ task, operations }: { task: Task; operations: TaskOperation[] }) {
  const navigate = useNavigate();
  const deleteDialog = useRef<HTMLDialogElement>(null);
  const { dict, formatTask } = useLanguage();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const activeIndex = TASK_STATUS_SEQUENCE.indexOf(task.status);
  const nextStatus = TASK_STATUS_SEQUENCE[activeIndex + 1];
  const conflicts = useLiveQuery(() => syncRepository.getConflicts(task.id), [task.id]);
  const outgoing = useLiveQuery(
    () => db.outgoing.where('taskId').equals(task.id).toArray(),
    [task.id],
  );

  const operationLabels: Record<TaskOperationType, string> = {
    TASK_CREATE: dict.task.taskCreatedActivity,
    TASK_UPDATE: dict.task.taskUpdatedActivity,
    TASK_DELETE: dict.task.taskDeletedActivity,
    TASK_IMPORT: dict.task.taskImportedActivity,
    TASK_RESOLVE: 'Conflict resolved',
  };

  async function changeStatus(status: TaskStatus, allowReopen = false) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await taskRepository.updateTaskStatus(task.id, status, { allowReopen });
      const statusLabel = dict.statuses[status] ?? status;
      setMessage(dict.task.statusUpdatedNotice(statusLabel));
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
      navigate('/tasks', { replace: true, state: { notice: dict.task.deletedNotice } });
    } catch (cause) {
      setError(readableDatabaseError(cause));
      setBusy(false);
    }
  }

  async function resolveConflict(id: string, choice: 'KEEP_LOCAL' | 'ACCEPT_INCOMING') {
    setBusy(true);
    setError('');
    try {
      await syncRepository.resolveConflict(id, choice);
      setMessage('Conflict resolved locally. Send the resolution QR to the other device.');
    } catch (cause) {
      setError(readableDatabaseError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid max-w-5xl items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
      <div>
        <section className="panel p-4 md:p-6">
          <TaskSummary task={task} />

          {/* Formatted instruction box if structured task */}
          {task.instruction && (
            <div className="mt-4 rounded-lg border border-line bg-surface p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">
                {dict.form.modeStructured}
              </span>
              <p className="mt-1.5 text-sm font-semibold leading-relaxed text-foreground">
                {formatTask(task.instruction)}
              </p>
            </div>
          )}

          <h2 className="mb-4 mt-7 text-sm font-semibold">
            {dict.form.statusLabel}{' '}
            <span className="ml-2 text-xs font-normal text-muted">{dict.task.timelineTitle}</span>
          </h2>
          <ol className="ml-2">
            {TASK_STATUS_SEQUENCE.map((status, index) => {
              const Icon =
                index === activeIndex ? CircleDot : index < activeIndex ? CircleCheck : Circle;
              const statusLabel = dict.statuses[status] ?? status;
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
                    <span className="status-label text-sm">{statusLabel}</span>
                    {index === activeIndex && (
                      <p className="mt-1 text-xs text-muted">
                        {dict.task.currentStatus} · {dict.task.revision} {task.revision}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Additional notes / description */}
          <div className="mb-6 border-t border-line pt-4">
            <h3 className="text-xs font-semibold">
              {task.instruction ? dict.form.notesLabel : dict.form.descriptionLabel}
            </h3>
            {task.instruction?.additionalNotes ? (
              <>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                  {task.instruction.additionalNotes}
                </p>
                <span className="mt-1 block text-[10px] text-muted">
                  {dict.form.untranslatedNoteNotice}
                </span>
              </>
            ) : task.description ? (
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">
                {task.description}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted">{dict.task.noDescription}</p>
            )}
          </div>

          {nextStatus ? (
            <button
              className="button-primary w-full"
              disabled={busy}
              onClick={() => void changeStatus(nextStatus)}
            >
              <ArrowRight size={18} />
              {busy
                ? dict.form.savingButton
                : dict.task.markStatusButton(dict.statuses[nextStatus] ?? nextStatus)}
            </button>
          ) : (
            <button
              className="button-secondary w-full"
              disabled={busy}
              onClick={() => void changeStatus('pending', true)}
            >
              <RotateCcw size={17} /> {dict.task.reopenButton}
            </button>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            <button className="button-secondary" onClick={() => setEditing((value) => !value)}>
              <Pencil size={17} /> {dict.task.editButton}
            </button>
            <button
              className="button-secondary text-danger"
              onClick={() => deleteDialog.current?.showModal()}
            >
              <Trash2 size={17} /> {dict.task.deleteButton}
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
            <QrCode size={17} /> {dict.task.viewQRLink}
          </Link>
          <Link to={`/send?task=${task.id}&mode=update`} className="button-secondary mt-3 w-full">
            <QrCode size={17} /> Send Update via QR
          </Link>
          {outgoing && outgoing.length > 0 && (
            <p className="mt-3 text-xs text-muted">
              {outgoing.filter((item) => !item.acknowledgedAt).length} pending outgoing update(s)
              {outgoing.some((item) => item.acknowledgedAt) &&
                ` · Last acknowledged ${formatDateTime(outgoing.filter((item) => item.acknowledgedAt).at(-1)!.acknowledgedAt!)}`}
            </p>
          )}
        </section>

        {conflicts?.map((conflict) => (
          <section key={conflict.id} className="panel mt-5 p-4 md:p-6">
            <h2 className="text-base font-semibold">Resolve Task Conflict</h2>
            <p className="mt-2 text-xs text-muted">
              Both branches were preserved. Choose the state to keep, then send the resolution QR.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-line p-3 text-xs">
                <h3 className="font-semibold">Current local version</h3>
                <p className="mt-2">{conflict.localTask.title}</p>
                <p>Status: {dict.statuses[conflict.localTask.status]}</p>
                <p>Priority: {dict.priorities[conflict.localTask.priority]}</p>
                <p>Revision: {conflict.localTask.revision}</p>
                <p className="mt-1 break-all font-mono text-[10px]">
                  Device: {conflict.localTask.createdBy}
                </p>
              </div>
              <div className="rounded-lg border border-line p-3 text-xs">
                <h3 className="font-semibold">Incoming version</h3>
                <p className="mt-2">
                  {conflict.incoming.changes.title ?? conflict.localTask.title}
                </p>
                <p>
                  Status:{' '}
                  {conflict.incoming.changes.status
                    ? dict.statuses[conflict.incoming.changes.status]
                    : 'Unchanged'}
                </p>
                <p>
                  Priority:{' '}
                  {conflict.incoming.changes.priority
                    ? dict.priorities[conflict.incoming.changes.priority]
                    : 'Unchanged'}
                </p>
                <p>Base revision: {conflict.incoming.baseRevision}</p>
                <p className="mt-1 break-all font-mono text-[10px]">
                  Device: {conflict.incoming.originDeviceId}
                </p>
                <p className="mt-1 break-all font-mono text-[10px]">
                  Operation: {conflict.incomingOperationId}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="button-secondary"
                disabled={busy}
                onClick={() => void resolveConflict(conflict.id, 'KEEP_LOCAL')}
              >
                Keep Local Version
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={busy}
                onClick={() => void resolveConflict(conflict.id, 'ACCEPT_INCOMING')}
              >
                Accept Incoming Version
              </button>
            </div>
          </section>
        ))}

        {editing && (
          <div className="mt-5">
            <QuickTaskForm
              key={`${task.id}-${task.revision}`}
              task={task}
              onSaved={() => {
                setEditing(false);
                setMessage(dict.form.savedNotice);
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}
      </div>

      <aside className="grid gap-5">
        <section className="panel p-5">
          <h2 className="text-base font-semibold">{dict.task.infoTitle}</h2>
          <dl className="mt-4 grid gap-4 text-xs">
            <div>
              <dt className="text-muted">{dict.form.actionLabel}</dt>
              <dd className="mt-1 font-medium">
                {task.instruction
                  ? (dict.actions[task.instruction.actionCode] ?? task.instruction.actionCode)
                  : (dict.legacyActions[task.action] ?? actionLabels[task.action])}
              </dd>
            </div>
            {task.instruction?.itemCode && (
              <div>
                <dt className="text-muted">{dict.form.itemLabel}</dt>
                <dd className="mt-1 font-medium">
                  {dict.items[task.instruction.itemCode] ?? task.instruction.itemCode}
                </dd>
              </div>
            )}
            {task.quantity !== undefined && (
              <div>
                <dt className="text-muted">
                  {dict.form.quantityLabel} &amp; {dict.form.unitLabel}
                </dt>
                <dd className="mt-1 font-medium">
                  {task.quantity}{' '}
                  {task.instruction?.unitCode
                    ? (dict.units[task.instruction.unitCode] ?? task.instruction.unitCode)
                    : (task.unit ?? '')}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted">{dict.task.createdLabel}</dt>
              <dd className="mt-1 font-medium">{formatDateTime(task.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">{dict.task.updatedLabel}</dt>
              <dd className="mt-1 font-medium">{formatDateTime(task.updatedAt)}</dd>
            </div>
            <div>
              <dt className="text-muted">{dict.task.deviceLabel}</dt>
              <dd className="mt-1 break-all font-mono text-[10px]">{task.createdBy}</dd>
            </div>
            <div>
              <dt className="text-muted">{dict.task.revision}</dt>
              <dd className="mt-1 font-medium">{task.revision}</dd>
            </div>
            {operations.some((op) => op.operationType === 'TASK_IMPORT') && (
              <div>
                <dt className="text-muted">Origin</dt>
                <dd className="mt-1 font-medium text-xs">{dict.task.originPaperBridge}</dd>
              </div>
            )}
          </dl>
        </section>

        <section className="panel p-5">
          <h2 className="text-base font-semibold">{dict.task.activityTitle}</h2>
          <ol className="mt-4 space-y-4">
            {[...operations].reverse().map((operation) => (
              <li
                key={operation.operationId}
                className="border-b border-line pb-4 last:border-0 last:pb-0"
              >
                <p className="text-xs font-medium">{operationLabels[operation.operationType]}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {dict.task.revision} {operation.revision} · {formatDateTime(operation.timestamp)}
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
          <h2 className="text-lg font-semibold">{dict.task.deleteDialogTitle}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {dict.task.deleteDialogDescription}
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
              {dict.form.cancelButton}
            </button>
            <button className="button-primary" disabled={busy} onClick={() => void confirmDelete()}>
              <Trash2 size={17} /> {busy ? dict.form.savingButton : dict.task.deleteConfirmButton}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
