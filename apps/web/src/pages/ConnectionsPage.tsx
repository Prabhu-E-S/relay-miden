import { useState } from 'react';
import { Network, QrCode, WifiOff, RefreshCw, Unplug, Radio } from 'lucide-react';
import { PageHeader } from '../components/ui/PageHeader';
import { ConnectionStatus } from '../components/dashboard/ConnectionStatus';
import { useLanguage } from '../hooks/use-language';
import { useLanSync } from '../hooks/use-lan-sync';

export function ConnectionsPage() {
  const { t } = useLanguage();
  const {
    status,
    serverUrl,
    sessionToken,
    lastError,
    lastSyncAt,
    serverSequence,
    isConnected,
    isSyncing,
    syncMessage,
    connect,
    disconnect,
    setServerUrl,
    setSessionToken,
    syncNow,
  } = useLanSync();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(sessionToken);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerUrl(inputUrl);
    setSessionToken(inputToken);
    await connect(inputUrl, inputToken);
  };

  return (
    <>
      <PageHeader
        title={t.connections}
        description="Local Wi-Fi and PaperBridge offline channels. Synchronization occurs entirely without public cloud access."
      />
      <div className="grid max-w-4xl items-start gap-5 md:grid-cols-[300px_1fr]">
        <ConnectionStatus />
        <div className="space-y-5">
          <section className="panel p-4 md:p-5" aria-labelledby="lan-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="lan-heading" className="text-base font-semibold flex items-center gap-2">
                <Network size={20} className="text-brand" aria-hidden="true" />
                Local Network Synchronization
              </h2>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded border border-line ${
                  isConnected ? 'text-brand' : 'text-muted'
                }`}
              >
                {status}
              </span>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-muted">
              Connect to a local coordinator host running on your Wi-Fi or mobile hotspot. No public
              internet is required.
            </p>

            <form onSubmit={handleConnect} className="space-y-4">
              <div className="field">
                <label htmlFor="lan-server-url">LAN Server Address</label>
                <input
                  id="lan-server-url"
                  type="text"
                  className="control"
                  placeholder="http://192.168.1.10:3001"
                  value={inputUrl}
                  onChange={(e) => setInputUrl(e.target.value)}
                  disabled={isConnected || isSyncing}
                />
                <span className="text-[11px] text-muted">
                  Use the host IP and port where relay-miden LAN server is running.
                </span>
              </div>

              <div className="field">
                <label htmlFor="lan-session-token">
                  Session Token <span className="font-normal text-muted">(Optional)</span>
                </label>
                <input
                  id="lan-session-token"
                  type="text"
                  className="control"
                  placeholder="Host-configured LAN token"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  disabled={isConnected || isSyncing}
                />
              </div>

              {lastError && (
                <div
                  className="rounded border border-line bg-surface p-3 text-xs text-danger"
                  role="alert"
                >
                  <p className="font-semibold">Connection Error</p>
                  <p className="mt-0.5 text-muted">{lastError}</p>
                </div>
              )}

              {syncMessage && (
                <div
                  className="rounded border border-line bg-surface p-3 text-xs text-brand"
                  role="status"
                >
                  <p className="font-semibold">Sync Status</p>
                  <p className="mt-0.5 text-muted">{syncMessage}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2.5 pt-1">
                {!isConnected ? (
                  <button
                    type="submit"
                    className="button-primary"
                    disabled={status === 'CONNECTING' || !inputUrl.trim()}
                  >
                    <Radio size={16} aria-hidden="true" />
                    {status === 'CONNECTING' ? 'Connecting...' : 'Connect to LAN'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={disconnect}
                    className="button-secondary text-danger"
                  >
                    <Unplug size={16} aria-hidden="true" />
                    Disconnect
                  </button>
                )}

                <button
                  type="button"
                  onClick={syncNow}
                  className="button-secondary"
                  disabled={!isConnected || isSyncing}
                >
                  <RefreshCw
                    size={16}
                    className={isSyncing ? 'animate-spin' : ''}
                    aria-hidden="true"
                  />
                  {isSyncing ? 'Synchronizing...' : 'Sync Now'}
                </button>
              </div>
            </form>

            <div className="mt-5 border-t border-line pt-4 text-[11px] text-muted grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <span className="font-medium text-foreground">Last Sync:</span>{' '}
                {lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString() : 'Not synchronized yet'}
              </div>
              <div>
                <span className="font-medium text-foreground">Server Sequence:</span> #
                {serverSequence}
              </div>
            </div>
          </section>

          <section className="panel p-4 md:p-5">
            <h2 className="mb-5 text-base font-semibold">Designed for the unexpected</h2>
            <div className="space-y-6">
              {[
                {
                  icon: WifiOff,
                  title: 'No internet',
                  text: 'Task CRUD and status changes work through local IndexedDB without interruption.',
                },
                {
                  icon: QrCode,
                  title: 'No shared network',
                  text: 'PaperBridge transfers task data through bidirectional high-density QR codes.',
                },
                {
                  icon: Network,
                  title: 'A nearby connection',
                  text: 'Exchange operations in real-time over local Wi-Fi or hotspot via the Phase 6 LAN server.',
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
      </div>
    </>
  );
}
