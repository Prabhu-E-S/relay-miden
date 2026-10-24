import { Activity, ClipboardList, CircleCheck, QrCode, ScanLine } from 'lucide-react';
import { Link } from 'react-router';
import { DashboardHeader } from '../components/dashboard/DashboardHeader';
import { StatCard } from '../components/dashboard/StatCard';
import { ConnectionStatus } from '../components/dashboard/ConnectionStatus';
import { MissionNote } from '../components/dashboard/MissionNote';
import { TaskList } from '../components/tasks/TaskList';
import { QuickTaskForm } from '../components/tasks/QuickTaskForm';
import { demoTasks, demoMetrics } from '../lib/demo-data';
export function DashboardPage() {
  return (
    <>
      <DashboardHeader />
      <div className="dashboard-grid">
        <div className="dashboard-overview">
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <StatCard
              label="Active Tasks"
              shortLabel="Active"
              value={demoMetrics.active}
              icon={ClipboardList}
              filter="active"
            />
            <StatCard
              label="In Progress"
              shortLabel="In Progress"
              value={demoMetrics.inProgress}
              icon={Activity}
              filter="in-progress"
              warning
            />
            <StatCard
              label="Completed"
              shortLabel="Completed"
              value={demoMetrics.completed}
              icon={CircleCheck}
              filter="completed"
            />
          </div>
          <div className="dashboard-lower">
            <div className="min-w-0">
              <TaskList tasks={demoTasks} recent />
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
