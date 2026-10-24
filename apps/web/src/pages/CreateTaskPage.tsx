import { PageHeader } from '../components/ui/PageHeader';
import { QuickTaskForm } from '../components/tasks/QuickTaskForm';
import { useLanguage } from '../hooks/use-language';
export function CreateTaskPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t.createTask}
        description="A little coordination goes a long way. Save a task privately on this device."
      />
      <QuickTaskForm />
      <p className="mt-4 max-w-xl text-xs leading-relaxed text-muted">
        Tasks are written directly to IndexedDB. No backend or internet connection is used.
      </p>
    </>
  );
}
