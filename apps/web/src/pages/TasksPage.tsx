import { Search, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useState } from 'react';
import { PageHeader } from '../components/ui/PageHeader';
import { TaskList } from '../components/tasks/TaskList';
import { demoTasks } from '../lib/demo-data';
import { useLanguage } from '../hooks/use-language';
export function TasksPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const requestedStatus = params.get('status') ?? 'all';
  const status = ['all', 'active', 'pending', 'in-progress', 'completed'].includes(requestedStatus)
    ? requestedStatus
    : 'all';
  const filtered = demoTasks.filter(
    (task) =>
      (status === 'all' ||
        (status === 'active' ? task.status !== 'completed' : task.status === status)) &&
      `${task.title} ${task.location}`.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <>
      <PageHeader
        title={t.tasks}
        description="A shared view of what needs doing. Explore four example tasks."
        action={
          <Link to="/create" className="button-primary">
            <Plus size={17} />
            Create Task
          </Link>
        }
      />
      <div className="mb-5 flex max-w-4xl flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search size={18} className="absolute left-3 top-3.5 text-muted" aria-hidden="true" />
          <span className="sr-only">Search tasks</span>
          <input
            type="search"
            className="control bg-surface pl-10"
            placeholder="Search tasks or locations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            className="control bg-surface sm:w-44"
            value={status}
            onChange={(event) =>
              setParams(event.target.value === 'all' ? {} : { status: event.target.value })
            }
          >
            <option value="all">All statuses</option>
            <option value="active">Active tasks</option>
            <option value="pending">Pending</option>
            <option value="in-progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>
      </div>
      <div className="max-w-4xl">
        <TaskList tasks={filtered} />
      </div>
      <p className="mt-4 text-xs text-muted" aria-live="polite">
        Showing {filtered.length} of 4 sample tasks. Dashboard totals are separate design fixtures.
      </p>
    </>
  );
}
