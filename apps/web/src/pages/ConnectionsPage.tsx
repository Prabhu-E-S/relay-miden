import { Network, QrCode, WifiOff } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ConnectionStatus } from '../components/dashboard/ConnectionStatus';
import { useLanguage } from '../hooks/use-language';
export function ConnectionsPage() {
  const { t } = useLanguage();
  return (
    <>
      <PageHeader
        title={t.connections}
        description="Different ways to stay coordinated. Connectivity statuses remain demonstration values, not device readings."
      />
      <div className="grid max-w-4xl items-start gap-5 md:grid-cols-[300px_1fr]">
        <ConnectionStatus />
        <section className="panel p-5">
          <h2 className="mb-5 text-base font-semibold">Designed for the unexpected</h2>
          <div className="space-y-6">
            {[
              {
                icon: WifiOff,
                title: 'No internet',
                text: 'Task CRUD and status changes now work through local IndexedDB.',
              },
              {
                icon: QrCode,
                title: 'No shared network',
                text: 'PaperBridge will transfer task data through QR codes. Planned for Phase 3.',
              },
              {
                icon: Network,
                title: 'A nearby connection',
                text: 'Devices will exchange tasks over local Wi-Fi. Planned for Phase 6.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-3">
                <Icon size={21} className="text-brand" aria-hidden="true" />
                <div>
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
