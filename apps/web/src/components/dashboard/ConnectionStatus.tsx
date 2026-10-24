import { WifiOff, Network, QrCode } from 'lucide-react';
export function ConnectionStatus() {
  return (
    <section className="panel p-4 md:p-5" aria-labelledby="connection-title">
      <h2 id="connection-title" className="text-base font-semibold">
        Connection Status
      </h2>
      <p className="mt-1 text-[10px] text-muted">Example states · not live connectivity</p>
      <dl className="mt-4 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <WifiOff size={19} aria-hidden="true" />
            Internet
          </dt>
          <dd className="status-label text-right text-[11px] text-danger">Not available</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <Network size={19} aria-hidden="true" />
            Local Network
          </dt>
          <dd className="status-label text-right text-[11px] text-brand">
            Connected<span className="block text-[10px] text-muted">3 demo devices</span>
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="flex items-center gap-2.5 text-xs font-medium">
            <QrCode size={19} aria-hidden="true" />
            QR Transfer
          </dt>
          <dd className="status-label text-right text-[11px] text-brand">
            Ready<span className="block text-[10px] text-muted">Preview only</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
