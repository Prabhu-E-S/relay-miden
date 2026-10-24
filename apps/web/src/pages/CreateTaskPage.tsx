import { PageHeader } from '../components/ui/PageHeader';
import { QuickTaskForm } from '../components/tasks/QuickTaskForm';
import { useLanguage } from '../hooks/use-language';
export function CreateTaskPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t.createTask}
        description="A little coordination goes a long way. Prepare a task for your community."
      />
      <QuickTaskForm />
      <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted">
        This form demonstrates validation and an unsaved preview. Offline storage and real task
        creation are planned for Phase 2.
      </p>
    </>
  );
}
