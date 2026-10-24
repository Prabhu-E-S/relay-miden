import { WifiOff, Network, QrCode } from 'lucide-react';
import { useLanSync } from '../../hooks/use-lan-sync';

export function ConnectionStatus() {
  const { status, lastError, lastSyncAt, isConnected } = useLanSync();

  const getLanDisplay = () => {
    switch (status) {
      case 'CONNECTED':
        return {
          label: 'Connected',
          color: 'text-brand',
          subtitle: lastSyncAt
            ? `Synced ${new Date(lastSyncAt).toLocaleTimeString()}`
            : 'Live network',
        };
      case 'SYNCING':
        return {
          label: 'Syncing...',
          color: 'text-brand',
          subtitle: 'Transferring data',
        };
      case 'CONNECTING':
        return {
          label: 'Connecting...',
          color: 'text-muted',
          subtitle: 'Registering device',
        };
      case 'ERROR':
        return {
          label: 'Error',
          color: 'text-danger',
          subtitle: lastError ? `${lastError.slice(0, 32)}...` : 'Connection failed',
        };
      case 'DISCONNECTED':
        return {
          label: 'Disconnected',
          color: 'text-muted',
          subtitle: 'Local mode active',
        };
      case 'NOT_CONFIGURED':
      default:
        return {
          label: 'Not configured',
          color: 'text-muted',
          subtitle: 'Setup in Connections',
        };
    }
  };

  const lan = getLanDisplay();

  return (
    <section className="panel p-4 md:p-5" aria-labelledby="connection-title">
      <h2 id="connection-title" className="text-base font-semibold">
        Connection Status
      </h2>
      <p className="mt-1 text-[10px] text-muted">
        {isConnected ? 'Local network active' : 'Offline-first · Local IndexedDB primary'}
      </p>
      <dl className="mt-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <WifiOff size={19} aria-hidden="true" />
            Internet
          </dt>
          <dd className="status-label text-right text-[11px] text-danger">Not required</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <Network size={19} aria-hidden="true" />
            Local Network
          </dt>
          <dd className={`status-label text-right text-[11px] ${lan.color}`}>
            {lan.label}
            <span className="block text-[10px] text-muted">{lan.subtitle}</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <QrCode size={19} aria-hidden="true" />
            QR Transfer
          </dt>
          <dd className="status-label text-right text-[11px] text-brand">
            Ready<span className="block text-[10px] text-muted">PaperBridge active</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
