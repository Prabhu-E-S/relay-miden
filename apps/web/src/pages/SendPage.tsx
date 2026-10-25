import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { QRDisplay } from '../components/qr/QRDisplay';
import { QRMessageDisplay } from '../components/qr/QRMessageDisplay';
import { TaskSummary } from '../components/tasks/TaskSummary';
import { taskRepository } from '../db/task-repository';
import { useLanguage } from '../hooks/use-language';
import { syncRepository } from '../services/sync/sync-repository';
import { db } from '../db/database';

type SendMode = 'task' | 'update' | 'ack';

export function SendPage() {
  const { dict, formatTaskTitle } = useLanguage();
  const [params, setParams] = useSearchParams();
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const [deviceId, setDeviceId] = useState<string>();
  const requestedId = params.get('task');
  const requestedMode = params.get('mode');
  const [mode, setMode] = useState<SendMode>(
    requestedMode === 'update' || requestedMode === 'ack' ? requestedMode : 'task',
  );
  const tasks = allTasks?.filter((item) => mode === 'update' || !item.deletedAt);
  const task = tasks?.find((item) => item.id === requestedId) ?? tasks?.[0] ?? allTasks?.[0];
  const operations = useLiveQuery(
    () => (task ? syncRepository.getOutgoingOperations(task.id) : Promise.resolve([])),
    [task?.id],
  );
  const defaultOperation =
    operations?.at(-1)?.operationType === 'TASK_RESOLVE' ? operations.at(-1) : operations?.[0];
  const acknowledgable = useLiveQuery(
    () => (task ? syncRepository.getAcknowledgableUpdates(task.id) : Promise.resolve([])),
    [task?.id],
  );
  const [selectedOperation, setSelectedOperation] = useState('');
  const [selectedAcknowledgment, setSelectedAcknowledgment] = useState('');
  const [encoded, setEncoded] = useState<{ rawJson: string; messageId: string } | null>(null);
  const [exportError, setExportError] = useState('');
  // A task that has changed locally must be shared as its durable operation,
  // not as a legacy v1 task snapshot. A v1 snapshot has no operation identity
  // and an existing receiver cannot safely infer which change it represents.
  const effectiveMode: SendMode =
    requestedMode === null && mode === 'task' && operations?.length ? 'update' : mode;

  useEffect(() => {
    if (!task || effectiveMode === 'task') return;
    let active = true;
    const selected =
      effectiveMode === 'update'
        ? selectedOperation || defaultOperation?.operationId
        : selectedAcknowledgment || acknowledgable?.[0]?.messageId;
    if (!selected) return;
    (effectiveMode === 'update'
      ? syncRepository.createOutgoingTaskUpdate(task.id, selected)
      : syncRepository.createAcknowledgmentForMessage(selected)
    )
      .then((result) => {
        if (active) {
          setEncoded({ rawJson: result.rawJson, messageId: result.envelope.messageId });
          setExportError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setEncoded(null);
          setExportError(cause instanceof Error ? cause.message : 'QR export failed.');
        }
      });
    return () => {
      active = false;
    };
  }, [
    task,
    effectiveMode,
    selectedOperation,
    selectedAcknowledgment,
    defaultOperation,
    operations,
    acknowledgable,
  ]);

  useEffect(() => {
    let active = true;
    taskRepository.getDeviceId().then(
      (value) => active && setDeviceId(value),
      () => active && setDeviceId(undefined),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!requestedId && task) setParams({ task: task.id }, { replace: true });
  }, [requestedId, setParams, task]);

  return (
    <>
      <PageHeader
        title={dict.paperbridge.sendTitle}
        description={dict.paperbridge.sendDescription}
      />
      {!tasks ? (
        <div className="panel max-w-md p-5" role="status">
          Loading local tasks…
        </div>
      ) : task ? (
        <section className="panel max-w-md p-4 md:p-6">
          <label className="field mb-4">
            {dict.paperbridge.selectTaskToSend}
            <select
              className="control"
              value={task.id}
              onChange={(event) => {
                setEncoded(null);
                setSelectedOperation('');
                setSelectedAcknowledgment('');
                setParams({ task: event.target.value });
              }}
            >
              {(tasks?.length ? tasks : (allTasks ?? [])).map((item) => (
                <option key={item.id} value={item.id}>
                  {formatTaskTitle(item)}
                  {item.deletedAt ? ' (deleted)' : ''}
                </option>
              ))}
            </select>
          </label>
          <TaskSummary task={task} />
          {task.deletedAt && (
            <p className="mt-3 text-xs text-muted">
              This task is deleted locally. Its deletion update can still be shared.
            </p>
          )}
          <div
            className="mt-5 flex flex-wrap gap-2 border-t border-line pt-5"
            role="group"
            aria-label="PaperBridge message type"
          >
            {(
              [
                ['task', 'Send Task'],
                ['update', 'Send Update'],
                ['ack', 'Send Acknowledgment'],
              ] as const
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setMode(value);
                  if (value === 'update') setParams({ task: task.id, mode: 'update' });
                  else setParams({ task: task.id, mode: value });
                  setEncoded(null);
                  setExportError('');
                }}
                aria-pressed={effectiveMode === value}
                className={
                  effectiveMode === value ? 'button-primary text-xs' : 'button-secondary text-xs'
                }
              >
                {label}
              </button>
            ))}
          </div>
          {deviceId ? (
            effectiveMode === 'task' ? (
              task.deletedAt ? (
                <p className="mt-4 text-xs text-muted">
                  Deleted tasks cannot be sent as new task QRs. Choose Send Update.
                </p>
              ) : (
                <QRDisplay task={task} deviceId={deviceId} />
              )
            ) : (
              <div>
                {effectiveMode === 'update' ? (
                  operations?.length ? (
                    <label className="field mt-4">
                      Choose a local change (send in revision order)
                      <select
                        className="control"
                        value={selectedOperation || defaultOperation!.operationId}
                        onChange={(event) => {
                          setEncoded(null);
                          setSelectedOperation(event.target.value);
                        }}
                      >
                        {operations.map((operation) => (
                          <option key={operation.operationId} value={operation.operationId}>
                            Revision {operation.revision} ·{' '}
                            {operation.operationType.replace('TASK_', '').toLowerCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="mt-4 text-xs text-muted">
                      No local update is available. Edit or advance this task first.
                    </p>
                  )
                ) : acknowledgable?.length ? (
                  <label className="field mt-4">
                    Acknowledgment for received update
                    <select
                      className="control"
                      value={selectedAcknowledgment || acknowledgable[0]!.messageId}
                      onChange={(event) => {
                        setEncoded(null);
                        setSelectedAcknowledgment(event.target.value);
                      }}
                    >
                      {acknowledgable.map((item) => (
                        <option key={item.messageId} value={item.messageId}>
                          {item.messageId.slice(0, 8)}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="mt-4 text-xs text-muted">
                    No applied incoming update needs an acknowledgment.
                  </p>
                )}
                {exportError && (
                  <p className="mt-3 text-xs text-danger" role="alert">
                    {exportError}
                  </p>
                )}
                {encoded && !exportError && (
                  <QRMessageDisplay
                    rawJson={encoded.rawJson}
                    label={effectiveMode === 'update' ? 'Task update' : 'Acknowledgment'}
                    filename={`relay-miden-${effectiveMode}-${encoded.messageId.slice(0, 8)}.png`}
                  />
                )}
              </div>
            )
          ) : (
            <div className="mt-6 border-t border-line pt-6 text-center text-xs text-muted">
              Loading device identity…
            </div>
          )}
        </section>
      ) : (
        <div className="max-w-md">
          <EmptyState
            title="No local task to share"
            description="Create a task first to generate a PaperBridge QR code."
            actionLabel="Create a task"
            actionTo="/create"
          />
        </div>
      )}
    </>
  );
}
