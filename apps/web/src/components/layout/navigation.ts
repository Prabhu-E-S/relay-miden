import {
  House,
  ClipboardPlus,
  QrCode,
  ScanLine,
  Network,
  ClipboardList,
  Settings,
} from 'lucide-react';
export const navigation = [
  { to: '/', key: 'dashboard', icon: House },
  { to: '/create', key: 'createTask', icon: ClipboardPlus },
  { to: '/send', key: 'send', icon: QrCode },
  { to: '/receive', key: 'receive', icon: ScanLine },
  { to: '/connections', key: 'connections', icon: Network },
  { to: '/tasks', key: 'tasks', icon: ClipboardList },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;
