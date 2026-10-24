import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
export function EmptyState({
  title,
  description,
  actionLabel = 'Create a task',
  actionTo = '/create',
}: {
  title: string;
  description: string;
  actionLabel?: string;
  actionTo?: string;
}) {
  return (
    <div className="panel px-6 py-12 text-center">
      <SearchX className="mx-auto mb-4 text-muted" size={28} />
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{description}</p>
      <Link to={actionTo} className="text-link mt-4">
        {actionLabel}
      </Link>
    </div>
  );
}
