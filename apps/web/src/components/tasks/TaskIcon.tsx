import { Droplet, Users, TriangleAlert, Package } from 'lucide-react';
import type { TaskKind } from '@relay-miden/shared';
const icons = { water: Droplet, medical: Users, road: TriangleAlert, supplies: Package };
const colors = {
  water: 'text-info',
  medical: 'text-info',
  road: 'text-danger',
  supplies: 'text-warning',
};
export function TaskIcon({ kind }: { kind: TaskKind }) {
  const Icon = icons[kind];
  return <Icon size={26} className={colors[kind]} aria-hidden="true" />;
}
