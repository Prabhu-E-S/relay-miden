import { Download, QrCode } from 'lucide-react';
export function QRDisplayPlaceholder() {
  return (
    <div className="mt-6">
      <div className="mx-auto flex aspect-square w-full max-w-56 flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center">
        <QrCode size={80} strokeWidth={1} className="text-brand" aria-hidden="true" />
        <p className="text-xs font-medium">QR preview area</p>
        <p className="text-[11px] text-muted">No scannable code generated</p>
      </div>
      <button disabled className="button-primary mt-6 w-full">
        <Download size={17} />
        Download QR · Coming soon
      </button>
      <p className="mx-auto mt-4 max-w-xs text-center text-xs leading-relaxed text-muted">
        In Phase 3, you’ll show a task code for another device to scan. No shared network required.
      </p>
    </div>
  );
}
