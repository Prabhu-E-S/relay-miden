import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { QRDisplay } from '../components/qr/QRDisplay';
import { TaskSummary } from '../components/tasks/TaskSummary';
import { taskRepository } from '../db/task-repository';
import { useLanguage } from '../hooks/use-language';

export function SendPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tasks = useLiveQuery(() => taskRepository.getAllTasks(), []);
  const [deviceId, setDeviceId] = useState<string>();
  const requestedId = params.get('task');
  const task = tasks?.find((item) => item.id === requestedId) ?? tasks?.[0];

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
        title={t.send}
        description="Transfer tasks across devices via offline QR codes. No internet, Wi-Fi, or cloud server required."
      />
      {!tasks ? (
        <div className="panel max-w-md p-5" role="status">
          Loading local tasks…
        </div>
      ) : task ? (
        <section className="panel max-w-md p-4 md:p-6">
          <label className="field mb-4">
            Local task
            <select
              className="control"
              value={task.id}
              onChange={(event) => setParams({ task: event.target.value })}
            >
              {tasks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <TaskSummary task={task} />
          {deviceId ? (
            <QRDisplay task={task} deviceId={deviceId} />
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
