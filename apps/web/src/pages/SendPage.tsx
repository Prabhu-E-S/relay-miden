import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { QRDisplayPlaceholder } from '../components/ui/QRDisplayPlaceholder';
import { TaskSummary } from '../components/tasks/TaskSummary';
import { taskRepository } from '../db/task-repository';
import { useLanguage } from '../hooks/use-language';

export function SendPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const tasks = useLiveQuery(() => taskRepository.getAllTasks(), []);
  const requestedId = params.get('task');
  const task = tasks?.find((item) => item.id === requestedId) ?? tasks?.[0];

  useEffect(() => {
    if (!requestedId && task) setParams({ task: task.id }, { replace: true });
  }, [requestedId, setParams, task]);

  return (
    <>
      <PageHeader
        title={t.send}
        description="PaperBridge export is planned for Phase 3. This screen only selects a real local task for the existing placeholder."
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
          <QRDisplayPlaceholder />
        </section>
      ) : (
        <div className="max-w-md">
          <EmptyState
            title="No local task to share"
            description="Create a task first. QR generation remains disabled until Phase 3."
          />
        </div>
      )}
    </>
  );
}
