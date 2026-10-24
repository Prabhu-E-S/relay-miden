import type { TaskAction, TaskStatus } from '@relay-miden/shared';

export const actionLabels: Record<TaskAction, string> = {
  REQUEST_VOLUNTEERS: 'Request volunteers',
  DELIVER_SUPPLIES: 'Deliver supplies',
  REPORT_ISSUE: 'Report an issue',
  REQUEST_ASSISTANCE: 'Request assistance',
  MOVE_TO_LOCATION: 'Move to location',
  CUSTOM: 'Custom task',
};

export const statusLabels: Record<TaskStatus, string> = {
  pending: 'Pending',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function formatRelativeTime(value: string, now = Date.now()): string {
  const difference = Math.max(0, now - new Date(value).getTime());
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(value),
  );
}

export function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
