import { PageHeader } from '../components/ui/PageHeader';
import { QRScannerPlaceholder } from '../components/ui/QRScannerPlaceholder';
import { useLanguage } from '../hooks/use-language';
export function ReceivePage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t.receive}
        description="One scan. A shared understanding. The PaperBridge receiver is coming in Phase 3."
      />
      <section className="max-w-md">
        <QRScannerPlaceholder />
        <p className="mt-4 text-xs leading-relaxed text-muted">
          This is a layout preview. No camera permission is requested, images cannot be uploaded,
          and no task is received.
        </p>
      </section>
    </>
  );
}
