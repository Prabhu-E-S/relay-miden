import { useParams } from 'react-router';
import { PageHeader } from '../components/ui/PageHeader';
import { EmptyState } from '../components/ui/EmptyState';
import { TaskDetails } from '../components/tasks/TaskDetails';
import { demoTasks } from '../lib/demo-data';
export function TaskDetailsPage() {
  const { id } = useParams();
  const task = demoTasks.find((item) => item.id === id);
  return (
    <>
      <PageHeader
        title="Task Details"
        description="The information that brings a community together. Demonstration record."
      />
      {task ? (
        <TaskDetails key={task.id} task={task} />
      ) : (
        <EmptyState
          title="Task not found"
          description="This example task does not exist. Choose a task from the demonstration list."
        />
      )}
    </>
  );
}
