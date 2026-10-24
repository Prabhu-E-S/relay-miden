import { useEffect, useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { generateQRCodeDataUrl } from '../../services/paperbridge';

export function QRMessageDisplay({
  rawJson,
  label,
  filename,
}: {
  rawJson: string;
  label: string;
  filename: string;
}) {
  const [url, setUrl] = useState<string>();
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-primary')
      .trim();
    generateQRCodeDataUrl(rawJson, {
      width: 1024,
      margin: 4,
      darkColor: color,
      lightColor: '#ffffff',
    })
      .then((value) => {
        if (active) {
          setUrl(value);
          setError('');
        }
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : 'QR generation failed.');
      });
    return () => {
      active = false;
    };
  }, [rawJson]);

  return (
    <div className="mt-5 border-t border-line pt-5">
      {error && (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      )}
      {!url && !error && (
        <p className="text-xs text-muted" role="status">
          Generating QR…
        </p>
      )}
      {url && (
        <>
          <div className="mx-auto w-full max-w-[26rem] rounded-lg border border-line bg-white p-4">
            <img
              src={url}
              alt={`${label} PaperBridge QR code`}
              className="aspect-square w-full object-contain"
            />
            <p className="mt-2 text-center text-[11px] text-muted">
              {new TextEncoder().encode(rawJson).length} bytes
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <a
              href={url}
              download={filename}
              className="button-primary justify-center text-center no-underline"
            >
              <Download size={17} /> Download QR
            </a>
            <button
              className="button-secondary justify-center"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(rawJson).then(() => setCopied(true));
              }}
            >
              {copied ? <Check size={17} /> : <Copy size={17} />}
              {copied ? 'Copied' : 'Copy payload'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
