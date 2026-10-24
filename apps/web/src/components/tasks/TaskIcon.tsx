import {
  ClipboardCheck,
  HeartHandshake,
  MapPin,
  Package,
  TriangleAlert,
  Users,
} from 'lucide-react';
import type { TaskAction } from '@relay-miden/shared';
const icons = {
  REQUEST_VOLUNTEERS: Users,
  DELIVER_SUPPLIES: Package,
  REPORT_ISSUE: TriangleAlert,
  REQUEST_ASSISTANCE: HeartHandshake,
  MOVE_TO_LOCATION: MapPin,
  CUSTOM: ClipboardCheck,
};
const colors = {
  REQUEST_VOLUNTEERS: 'text-info',
  DELIVER_SUPPLIES: 'text-warning',
  REPORT_ISSUE: 'text-danger',
  REQUEST_ASSISTANCE: 'text-info',
  MOVE_TO_LOCATION: 'text-brand',
  CUSTOM: 'text-brand',
};
export function TaskIcon({ action }: { action: TaskAction }) {
  const Icon = icons[action];
  return <Icon size={26} className={colors[action]} aria-hidden="true" />;
}
