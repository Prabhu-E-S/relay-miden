import { PageHeader } from '../components/ui/PageHeader';
import { QRReceiver } from '../components/qr/QRReceiver';
import { useLanguage } from '../hooks/use-language';

export function ReceivePage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t.receive}
        description="One scan. A shared understanding. Receive and import tasks completely offline."
      />
      <section className="max-w-md">
        <QRReceiver />
        <p className="mt-4 text-xs leading-relaxed text-muted">
          PaperBridge decodes and validates tasks locally in your browser. All imported tasks are
          saved directly to your device's IndexedDB database without sending data over the network.
        </p>
      </section>
    </>
  );
}
