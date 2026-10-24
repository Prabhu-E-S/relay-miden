import { Sprout, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router';
export function MissionNote() {
  return (
    <div className="flex min-h-36 items-center gap-4 rounded-lg border border-line px-5 py-6">
      <Sprout size={48} strokeWidth={1} className="text-brand opacity-60" aria-hidden="true" />
      <div>
        <h2 className="text-lg font-semibold">Works Anyway</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          No internet. No shared network.
          <br />
          Different languages. Still together.
        </p>
        <Link to="/connections" className="text-link mt-1">
          Explore the vision <ArrowUpRight size={13} />
        </Link>
      </div>
    </div>
  );
}
