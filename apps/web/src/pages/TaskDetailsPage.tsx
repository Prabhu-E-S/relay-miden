import { useLocation, useParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskDetails } from '../components/tasks/TaskDetails';
import { taskRepository } from '../db/task-repository';

export function TaskDetailsPage() {
  const { id } = useParams();
  const location = useLocation();
  const data = useLiveQuery(async () => {
    if (!id) return { task: undefined, operations: [] };
    const [task, operations] = await Promise.all([
      taskRepository.getTaskById(id),
      taskRepository.getTaskOperations(id),
    ]);
    return { task, operations };
  }, [id]);
  const notice = (location.state as { notice?: string } | null)?.notice;

  return (
    <>
      <PageHeader
        title="Task Details"
        description="Review, update, edit, or remove a task stored on this device."
      />
      {notice && (
        <p role="status" className="mb-4 max-w-xl text-sm text-brand">
          {notice}
        </p>
      )}
      {!data ? (
        <div className="panel max-w-xl p-5" role="status">
          Loading task from this device…
        </div>
      ) : data.task ? (
        <TaskDetails task={data.task} operations={data.operations} />
      ) : (
        <EmptyState
          title="Task not found"
          description="This task does not exist or has been deleted from active lists."
          actionLabel="View local tasks"
          actionTo="/tasks"
        />
      )}
    </>
  );
}
