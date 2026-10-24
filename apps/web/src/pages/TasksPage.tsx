import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TaskPriority, TaskStatus } from '@relay-miden/shared';
import { PageHeader } from '../components/ui/PageHeader';
import { TaskList } from '../components/tasks/TaskList';
import { applyTaskFilters, taskRepository, type TaskSort } from '../db/task-repository';
import { useLanguage } from '../hooks/use-language';

const statuses: readonly (TaskStatus | 'active' | 'all')[] = [
  'all',
  'active',
  'pending',
  'acknowledged',
  'in_progress',
  'completed',
];
const priorities: readonly (TaskPriority | 'all')[] = ['all', 'low', 'medium', 'high', 'urgent'];
const sorts: readonly TaskSort[] = ['recently_updated', 'newest', 'oldest', 'priority'];

export function TasksPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [params, setParams] = useSearchParams();
  const tasks = useLiveQuery(() => taskRepository.getAllTasks(), []);

  const requestedStatus = params.get('status');
  const requestedPriority = params.get('priority');
  const requestedSort = params.get('sort');
  const status = statuses.includes(requestedStatus as (typeof statuses)[number])
    ? (requestedStatus as (typeof statuses)[number])
    : 'all';
  const priority = priorities.includes(requestedPriority as (typeof priorities)[number])
    ? (requestedPriority as (typeof priorities)[number])
    : 'all';
  const sort = sorts.includes(requestedSort as TaskSort)
    ? (requestedSort as TaskSort)
    : 'recently_updated';

  const filtered = useMemo(
    () => applyTaskFilters(tasks ?? [], { search, status, priority, sort }),
    [priority, search, sort, status, tasks],
  );

  function setFilter(key: 'status' | 'priority' | 'sort', value: string) {
    const next = new URLSearchParams(params);
    if (value === 'all' || (key === 'sort' && value === 'recently_updated')) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  return (
    <>
      <PageHeader
        title={t.tasks}
        description="Search, filter, and manage the tasks stored on this device."
        action={
          <Link to="/create" className="button-primary">
            <Plus size={17} /> Create Task
          </Link>
        }
      />
      <div className="mb-5 grid max-w-5xl gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_170px_150px_190px]">
        <label className="relative sm:col-span-2 xl:col-span-1">
          <Search size={18} className="absolute left-3 top-3.5 text-muted" aria-hidden="true" />
          <span className="sr-only">Search tasks</span>
          <input
            type="search"
            className="control bg-surface pl-10"
            placeholder="Search title, location, or description…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filter by status</span>
          <select
            className="control bg-surface"
            value={status}
            onChange={(event) => setFilter('status', event.target.value)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active tasks</option>
            <option value="pending">Pending</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Filter by priority</span>
          <select
            className="control bg-surface"
            value={priority}
            onChange={(event) => setFilter('priority', event.target.value)}
          >
            <option value="all">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Sort tasks</span>
          <select
            className="control bg-surface"
            value={sort}
            onChange={(event) => setFilter('sort', event.target.value)}
          >
            <option value="recently_updated">Recently updated</option>
            <option value="newest">Newest created</option>
            <option value="oldest">Oldest created</option>
            <option value="priority">Priority</option>
          </select>
        </label>
      </div>
      <div className="max-w-5xl">
        {tasks ? (
          <TaskList
            tasks={filtered}
            emptyTitle={tasks.length ? 'No tasks match these filters' : 'No tasks yet'}
            emptyDescription={
              tasks.length
                ? 'Adjust the search, status, priority, or sorting controls to find another task.'
                : 'Create your first local task. It will remain available after refreshes and server restarts.'
            }
            emptyActionLabel={tasks.length ? 'Clear filters' : 'Create a task'}
            emptyActionTo={tasks.length ? '/tasks' : '/create'}
          />
        ) : (
          <div className="panel p-5" role="status">
            Loading tasks from this device…
          </div>
        )}
      </div>
      {tasks && (
        <p className="mt-4 text-xs text-muted" aria-live="polite">
          Showing {filtered.length} of {tasks.length} local {tasks.length === 1 ? 'task' : 'tasks'}.
        </p>
      )}
    </>
  );
}
