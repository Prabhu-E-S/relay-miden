import { Route, Routes } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { LanguageProvider } from './components/layout/LanguageProvider';
import { DatabaseProvider } from './components/layout/DatabaseProvider';
import { DashboardPage } from './pages/DashboardPage';
import { CreateTaskPage } from './pages/CreateTaskPage';
import { TasksPage } from './pages/TasksPage';
import { TaskDetailsPage } from './pages/TaskDetailsPage';
import { SendPage } from './pages/SendPage';
import { ReceivePage } from './pages/ReceivePage';
import { ConnectionsPage } from './pages/ConnectionsPage';
import { SettingsPage } from './pages/SettingsPage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  return (
    <DatabaseProvider>
      <LanguageProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="create" element={<CreateTaskPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="tasks/:id" element={<TaskDetailsPage />} />
            <Route path="send" element={<SendPage />} />
            <Route path="receive" element={<ReceivePage />} />
            <Route path="connections" element={<ConnectionsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </LanguageProvider>
    </DatabaseProvider>
  );
}
