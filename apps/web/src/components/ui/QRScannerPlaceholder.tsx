import { Camera, ImagePlus, ScanLine } from 'lucide-react';
export function QRScannerPlaceholder() {
  return (
    <div className="overflow-hidden rounded-lg bg-brand text-[var(--color-on-primary)]">
      <div className="px-6 pb-6 pt-4">
        <p className="text-center text-[10px] uppercase tracking-[.14em] text-[var(--color-sidebar-muted)]">
          Scanner preview · Camera inactive
        </p>
        <div className="scanner-frame flex flex-col items-center justify-center gap-5 px-6 text-center">
          <ScanLine
            size={48}
            strokeWidth={1}
            className="text-[var(--color-sidebar-muted)]"
            aria-hidden="true"
          />
          <p className="text-sm">
            A task can begin
            <br />
            with a simple scan.
          </p>
        </div>
        <p className="text-center text-xs text-[var(--color-sidebar-muted)]">
          QR scanning will be available in Phase 3.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-[var(--color-sidebar-active)] p-4">
        <button disabled className="button-secondary flex-col border-transparent">
          <Camera size={21} />
          Use camera
        </button>
        <button disabled className="button-secondary flex-col border-transparent">
          <ImagePlus size={21} />
          Upload image
        </button>
      </div>
    </div>
  );
}
