import { useEffect, useState } from 'react';
import { Check, Copy, Download, RefreshCw, AlertTriangle } from 'lucide-react';
import type { Task } from '@relay-miden/shared';
import {
  encodeTaskForQR,
  generateQRCodeDataUrl,
  PaperBridgeError,
  type EncodeTaskResult,
} from '../../services/paperbridge';
import { useLanguage } from '../../hooks/use-language';

export function QRDisplay({ task, deviceId }: { task: Task; deviceId: string }) {
  const { dict, formatTaskTitle } = useLanguage();
  const [encoding, setEncoding] = useState<EncodeTaskResult | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshSeed, setRefreshSeed] = useState(0);

  const displayTitle = formatTaskTitle(task);

  useEffect(() => {
    let cancelled = false;

    async function generate() {
      try {
        const result = await encodeTaskForQR(task, deviceId);
        if (cancelled) return;
        setEncoding(result);
        setError(null);

        const dataUrl = await generateQRCodeDataUrl(result.rawJson, {
          width: 320,
          margin: 4,
          darkColor: '#004225',
          lightColor: '#ffffff',
        });
        if (cancelled) return;
        setQrDataUrl(dataUrl);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof PaperBridgeError) {
          setError(err.message);
        } else {
          setError('Failed to generate PaperBridge QR code.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void generate();

    return () => {
      cancelled = true;
    };
  }, [task, deviceId, refreshSeed]);

  async function handleCopyPayload() {
    if (!encoding) return;
    try {
      await navigator.clipboard.writeText(encoding.rawJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  }

  function handleRegenerate() {
    setRefreshSeed((prev) => prev + 1);
  }

  const downloadFilename = `relay-miden-task-${task.id.slice(0, 8)}.png`;

  return (
    <div className="mt-6 border-t border-line pt-6">
      {loading ? (
        <div
          className="mx-auto flex aspect-square w-full max-w-64 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--color-border-strong)] p-6 text-center"
          role="status"
        >
          <RefreshCw size={28} className="animate-spin text-brand" aria-hidden="true" />
          <p className="text-xs font-medium">{dict.paperbridge.generatingQR}</p>
        </div>
      ) : error ? (
        <div
          className="rounded-lg border border-[var(--color-error)]/30 bg-surface p-4 text-center"
          role="alert"
        >
          <div className="flex items-center justify-center gap-2 text-danger">
            <AlertTriangle size={18} />
            <span className="text-xs font-semibold">{dict.paperbridge.qrErrorTitle}</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{error}</p>
        </div>
      ) : qrDataUrl && encoding ? (
        <div>
          <div className="mx-auto flex w-full max-w-72 flex-col items-center rounded-lg border border-line bg-white p-4 shadow-none">
            <img
              src={qrDataUrl}
              alt={`PaperBridge QR code for task: ${displayTitle}`}
              className="aspect-square w-full max-w-64 object-contain"
            />
            <div className="mt-3 flex w-full items-center justify-between text-[11px] text-muted">
              <span>{dict.paperbridge.bytesLabel(encoding.byteSize)}</span>
              <span className="font-mono text-[10px]">
                {encoding.envelope.checksum.slice(0, 10)}…
              </span>
            </div>
          </div>

          <p className="mx-auto mt-4 max-w-xs text-center text-xs leading-relaxed text-muted">
            {dict.paperbridge.scanInstructions}
          </p>

          <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <a
              href={qrDataUrl}
              download={downloadFilename}
              className="button-primary justify-center text-center no-underline"
            >
              <Download size={17} />
              {dict.paperbridge.downloadQRButton}
            </a>
            <button
              type="button"
              onClick={() => void handleCopyPayload()}
              className="button-secondary justify-center"
            >
              {copied ? <Check size={17} className="text-brand" /> : <Copy size={17} />}
              {copied ? dict.paperbridge.copiedPayloadButton : dict.paperbridge.copyPayloadButton}
            </button>
          </div>

          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={handleRegenerate}
              className="text-[11px] text-muted underline hover:text-brand"
            >
              {dict.paperbridge.regenerateButton}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
