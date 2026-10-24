import { useSearchParams } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
import { QRDisplayPlaceholder } from '../components/ui/QRDisplayPlaceholder';
import { TaskSummary } from '../components/tasks/TaskSummary';
import { demoTasks } from '../lib/demo-data';
import { useLanguage } from '../hooks/use-language';
export function SendPage() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const task = demoTasks.find((item) => item.id === params.get('task')) ?? demoTasks[0];
  if (!task) return null;
  return (
    <>
      <PageHeader
        title={t.send}
        description="PaperBridge will carry a task from one device to another, even without a connection."
      />
      <section className="panel max-w-md p-4 md:p-6">
        <label className="field mb-4">
          Example task
          <select
            className="control"
            value={task.id}
            onChange={(event) => setParams({ task: event.target.value })}
          >
            {demoTasks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <TaskSummary task={task} />
        <QRDisplayPlaceholder />
      </section>
    </>
  );
}
