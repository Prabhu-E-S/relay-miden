import { useState } from 'react';
import { RefreshCw, X, ShieldCheck } from 'lucide-react';
import { usePwa } from '../../hooks/use-pwa';

export function UpdateNotification() {
  const { needRefresh, updateServiceWorker, isUpdating } = usePwa();
  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) {
    return null;
  }

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-label="Application update notification"
      className="panel mb-4 border-l-4 border-l-[var(--color-action)] p-4 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <RefreshCw
            size={20}
            className={`mt-0.5 text-brand ${isUpdating ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          <div>
            <h3 className="text-sm font-semibold text-brand">App Update Available</h3>
            <p className="mt-0.5 text-xs text-muted">
              A newer version of Relay Miden is ready to install.
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
              <ShieldCheck size={14} className="text-brand" aria-hidden="true" />
              <span>Local IndexedDB tasks, outbox operations, and QR history remain safe.</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            disabled={isUpdating}
            className="btn-primary min-h-10 px-4 py-2 text-xs font-semibold"
          >
            {isUpdating ? 'Updating…' : 'Update Now'}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update notification for this session"
            className="btn-secondary flex min-h-10 min-w-10 items-center justify-center p-2 text-xs"
          >
            <X size={16} aria-hidden="true" />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
