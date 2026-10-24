import { Activity, ClipboardList, CircleCheck, QrCode, ScanLine } from 'lucide-react';
import { Link } from 'react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { StatCard } from '../components/dashboard/StatCard';
import { ConnectionStatus } from '../components/dashboard/ConnectionStatus';
import { MissionNote } from '../components/dashboard/MissionNote';
import { TaskList } from '../components/tasks/TaskList';
import { QuickTaskForm } from '../components/tasks/QuickTaskForm';
import { taskRepository } from '../db/task-repository';
export function DashboardPage() {
  const dashboard = useLiveQuery(async () => {
    const [statistics, recentTasks] = await Promise.all([
      taskRepository.getTaskStatistics(),
      taskRepository.getRecentTasks(4),
    ]);
    return { statistics, recentTasks };
  }, []);
  const statistics = dashboard?.statistics ?? { active: 0, inProgress: 0, completed: 0 };
  return (
    <>
      <DashboardHeader />
      <div className="dashboard-grid">
        <div className="dashboard-overview">
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <StatCard
              label="Active Tasks"
              shortLabel="Active"
              value={statistics.active}
              icon={ClipboardList}
              filter="active"
            />
            <StatCard
              label="In Progress"
              shortLabel="In Progress"
              value={statistics.inProgress}
              icon={Activity}
              filter="in_progress"
              warning
            />
            <StatCard
              label="Completed"
              shortLabel="Completed"
              value={statistics.completed}
              icon={CircleCheck}
              filter="completed"
            />
          </div>
          <div className="dashboard-lower">
            <div className="min-w-0">
              {dashboard ? (
                <TaskList tasks={dashboard.recentTasks} recent />
              ) : (
                <div className="panel p-5" role="status" aria-label="Loading recent tasks">
                  <div className="h-4 w-28 animate-pulse rounded bg-[var(--color-disabled)]" />
                  <div className="mt-5 space-y-4">
                    {[1, 2, 3].map((item) => (
                      <div
                        key={item}
                        className="h-12 animate-pulse rounded bg-[var(--color-disabled)]"
                      />
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-4 grid grid-cols-2 gap-3 md:hidden">
                <Link to="/send" className="button-secondary">
                  <QrCode size={17} />
                  Send via QR
                </Link>
                <Link to="/receive" className="button-secondary">
                  <ScanLine size={17} />
                  Receive via QR
                </Link>
              </div>
            </div>
            <div className="grid content-start gap-4">
              <ConnectionStatus />
              <MissionNote />
            </div>
          </div>
        </div>
        <div className="hidden md:block">
          <QuickTaskForm quick />
        </div>
      </div>
    </>
  );
}
