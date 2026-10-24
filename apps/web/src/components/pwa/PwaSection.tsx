import { useState } from 'react';
import {
  Download,
  Smartphone,
  CheckCircle2,
  HardDriveDownload,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { usePwa } from '../../hooks/use-pwa';

export function PwaSection() {
  const {
    offlineReady,
    needRefresh,
    isUpdating,
    isInstallable,
    isInstalled,
    isStandalone,
    isIos,
    browserOnline,
    swRegistrationError,
    updateServiceWorker,
    promptInstall,
  } = usePwa();

  const [installStatusMsg, setInstallStatusMsg] = useState<string | null>(null);

  const isSecure =
    typeof window !== 'undefined' &&
    (window.isSecureContext ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1');

  const handleInstallClick = async () => {
    setInstallStatusMsg(null);
    const result = await promptInstall();
    if (result === 'accepted') {
      setInstallStatusMsg('Installation accepted. Relay Miden is now installed.');
    } else if (result === 'dismissed') {
      setInstallStatusMsg('Installation prompt was dismissed.');
    } else {
      setInstallStatusMsg('Installation prompt is unavailable in this browser session.');
    }
  };

  return (
    <section className="panel mt-4 p-5" aria-labelledby="pwa-section-title">
      <div className="flex items-center gap-2">
        <Smartphone size={18} className="text-brand" aria-hidden="true" />
        <h2 id="pwa-section-title" className="text-base font-semibold">
          Progressive Web App & Offline Launch
        </h2>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-muted">
        Relay Miden functions completely offline once the application shell is cached. All task
        records and outbox operations are preserved in IndexedDB.
      </p>

      <dl className="mt-4 divide-y divide-[var(--color-border)] text-xs">
        {/* 1. App Shell Offline Status */}
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-2 text-muted">
            <HardDriveDownload size={15} aria-hidden="true" />
            <span>App Shell Cache</span>
          </dt>
          <dd className="font-medium">
            {offlineReady ? (
              <span className="flex items-center gap-1.5 text-brand">
                <CheckCircle2 size={14} aria-hidden="true" />
                Ready for offline launch
              </span>
            ) : (
              <span className="text-muted">Caching resources…</span>
            )}
          </dd>
        </div>

        {/* 2. Device Network Context */}
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-2 text-muted">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Device Network</span>
          </dt>
          <dd className="font-medium">
            {browserOnline ? (
              <span className="text-brand">Online (device connected)</span>
            ) : (
              <span className="text-muted">Offline (device disconnected)</span>
            )}
          </dd>
        </div>

        {/* 3. Secure Context */}
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-2 text-muted">
            <ShieldCheck size={15} aria-hidden="true" />
            <span>Security Origin</span>
          </dt>
          <dd className="font-medium">
            {isSecure ? (
              <span className="text-brand">Secure context (HTTPS / localhost)</span>
            ) : (
              <span className="text-muted">Insecure HTTP (Camera restricted)</span>
            )}
          </dd>
        </div>

        {/* 4. Installation State */}
        <div className="flex items-center justify-between py-2.5">
          <dt className="flex items-center gap-2 text-muted">
            <Download size={15} aria-hidden="true" />
            <span>App Mode</span>
          </dt>
          <dd className="font-medium">
            {isStandalone ? (
              <span className="flex items-center gap-1.5 text-brand">
                <CheckCircle2 size={14} aria-hidden="true" />
                Standalone (Installed)
              </span>
            ) : isInstalled ? (
              <span className="text-brand">Installed</span>
            ) : (
              <span className="text-muted">Browser window</span>
            )}
          </dd>
        </div>
      </dl>

      {/* Installation Controls */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        {isInstallable && !isStandalone && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => void handleInstallClick()}
              className="btn-primary flex min-h-10 w-full items-center justify-center gap-2 text-xs font-semibold"
            >
              <Download size={16} aria-hidden="true" />
              Install Relay Miden on this Device
            </button>
            <p className="text-[11px] text-muted">
              Installs Relay Miden as a standalone offline application on your home screen or
              desktop.
            </p>
          </div>
        )}

        {isIos && !isStandalone && (
          <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-brand">
              <Share2 size={14} aria-hidden="true" />
              Install on iOS (Safari)
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted">
              Tap the <strong className="text-brand">Share</strong> icon in Safari's toolbar, then
              scroll down and select <strong className="text-brand">Add to Home Screen</strong>.
            </p>
          </div>
        )}

        {isStandalone && (
          <p className="text-xs text-brand">
            ✓ Currently running as an installed standalone application.
          </p>
        )}

        {installStatusMsg && (
          <p role="status" className="mt-2 text-xs text-muted">
            {installStatusMsg}
          </p>
        )}
      </div>

      {/* Update Controls */}
      <div className="mt-4 border-t border-[var(--color-border)] pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand">Application Version</p>
            <p className="text-[11px] text-muted">
              {needRefresh
                ? 'A new version is available.'
                : 'App is running the latest cached version.'}
            </p>
          </div>
          {needRefresh && (
            <button
              type="button"
              onClick={() => void updateServiceWorker(true)}
              disabled={isUpdating}
              className="btn-primary min-h-9 px-3 py-1.5 text-xs font-semibold"
            >
              {isUpdating ? (
                <span className="flex items-center gap-1.5">
                  <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                  Updating…
                </span>
              ) : (
                'Apply Update'
              )}
            </button>
          )}
        </div>

        {swRegistrationError && (
          <p
            role="alert"
            className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-error)]"
          >
            <AlertCircle size={14} aria-hidden="true" />
            {swRegistrationError}
          </p>
        )}
      </div>
    </section>
  );
}
