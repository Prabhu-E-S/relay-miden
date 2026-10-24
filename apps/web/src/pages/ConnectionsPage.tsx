import { useState } from 'react';
import {
  Network,
  QrCode,
  WifiOff,
  RefreshCw,
  Unplug,
  Radio,
  Inbox,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
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
    reconnectAttempt,
    nextRetrySeconds,
    outboxStats,
    pendingCount,
    blockedCount,
    failedCount,
    inFlightCount,
    acknowledgedCount,
    isConnected,
    isReconnecting,
    isSyncing,
    syncMessage,
    connect,
    disconnect,
    reconnectNow,
    retryBlockedAndFailed,
    setServerUrl,
    setSessionToken,
    syncNow,
  } = useLanSync();

  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [inputToken, setInputToken] = useState(sessionToken);
  const [isRetryingQueue, setIsRetryingQueue] = useState(false);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerUrl(inputUrl);
    setSessionToken(inputToken);
    await connect(inputUrl, inputToken);
  };

  const handleRetryQueue = async () => {
    setIsRetryingQueue(true);
    try {
      await retryBlockedAndFailed();
    } finally {
      setIsRetryingQueue(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t.connections}
        description="Local Wi-Fi, durable offline queue, and PaperBridge channels. Offline operations replay automatically upon LAN reconnection."
      />
      <div className="grid max-w-4xl items-start gap-5 md:grid-cols-[300px_1fr]">
        <ConnectionStatus />
        <div className="space-y-5">
          {/* LAN Connection Panel */}
          <section className="panel p-4 md:p-5" aria-labelledby="lan-heading">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 id="lan-heading" className="text-base font-semibold flex items-center gap-2">
                <Network size={20} className="text-brand" aria-hidden="true" />
                Local Network Synchronization
              </h2>
              <span
                className={`text-xs font-medium px-2.5 py-1 rounded border border-line ${
                  isConnected
                    ? 'text-brand'
                    : isReconnecting
                      ? 'text-accent'
                      : status === 'ERROR'
                        ? 'text-danger'
                        : 'text-muted'
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

              {isReconnecting && (
                <div
                  className="rounded border border-line bg-surface p-3 text-xs text-accent"
                  role="status"
                >
                  <p className="font-semibold flex items-center gap-1.5">
                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    Automatic Reconnection Active
                  </p>
                  <p className="mt-1 text-muted">
                    Attempt #{reconnectAttempt}.{' '}
                    {nextRetrySeconds !== null && nextRetrySeconds > 0
                      ? `Retrying in ${nextRetrySeconds}s with exponential backoff...`
                      : 'Connecting shortly...'}
                  </p>
                </div>
              )}

              {lastError && (
                <div
                  className="rounded border border-line bg-surface p-3 text-xs text-danger"
                  role="alert"
                >
                  <p className="font-semibold">Connection Notice</p>
                  <p className="mt-0.5 text-muted break-words">{lastError}</p>
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
                  <>
                    <button
                      type="submit"
                      className="button-primary"
                      disabled={status === 'CONNECTING' || !inputUrl.trim()}
                    >
                      <Radio size={16} aria-hidden="true" />
                      {status === 'CONNECTING' ? 'Connecting...' : 'Connect to LAN'}
                    </button>
                    {isReconnecting && (
                      <button type="button" onClick={reconnectNow} className="button-secondary">
                        <RefreshCw size={16} aria-hidden="true" />
                        Retry Now
                      </button>
                    )}
                  </>
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

          {/* Phase 7 Durable Outbox Queue Panel */}
          <section className="panel p-4 md:p-5" aria-labelledby="outbox-heading">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="outbox-heading" className="text-base font-semibold flex items-center gap-2">
                <Inbox size={20} className="text-brand" aria-hidden="true" />
                Durable Offline Operation Queue
              </h2>
              <span className="text-xs text-muted font-medium">
                {outboxStats.total} total recorded
              </span>
            </div>

            <p className="mb-4 text-xs leading-relaxed text-muted">
              Every locally generated task creation, update, deletion, and conflict resolution is
              stored atomically in the IndexedDB outbox. When LAN connectivity returns, pending
              operations replay in strict causal order.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
              <div className="rounded border border-line bg-surface p-3">
                <span className="block text-[11px] text-muted">Pending</span>
                <span className="text-lg font-semibold text-accent">{pendingCount}</span>
                <span className="block text-[10px] text-muted mt-0.5">Awaiting replay</span>
              </div>
              <div className="rounded border border-line bg-surface p-3">
                <span className="block text-[11px] text-muted">In Flight</span>
                <span className="text-lg font-semibold text-brand">{inFlightCount}</span>
                <span className="block text-[10px] text-muted mt-0.5">Submitting now</span>
              </div>
              <div className="rounded border border-line bg-surface p-3">
                <span className="block text-[11px] text-muted">Blocked / Error</span>
                <span
                  className={`text-lg font-semibold ${
                    blockedCount > 0 || failedCount > 0 ? 'text-danger' : 'text-foreground'
                  }`}
                >
                  {blockedCount + failedCount}
                </span>
                <span className="block text-[10px] text-muted mt-0.5">
                  {blockedCount} blocked · {failedCount} failed
                </span>
              </div>
              <div className="rounded border border-line bg-surface p-3">
                <span className="block text-[11px] text-muted">Acknowledged</span>
                <span className="text-lg font-semibold text-brand">{acknowledgedCount}</span>
                <span className="block text-[10px] text-muted mt-0.5">Server accepted</span>
              </div>
            </div>

            {(blockedCount > 0 || failedCount > 0) && (
              <div className="rounded border border-line bg-surface p-3 mb-4 text-xs">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-accent shrink-0 mt-0.5" />
                  <div className="text-muted">
                    <p className="font-semibold text-foreground">Action Required</p>
                    <p className="mt-0.5">
                      Some operations are blocked due to missing parent dependencies or concurrent
                      conflicts. Check the Conflicts tab or retry queue entries.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                onClick={handleRetryQueue}
                className="button-secondary text-xs"
                disabled={isRetryingQueue || (blockedCount === 0 && failedCount === 0)}
              >
                <RotateCcw
                  size={14}
                  className={isRetryingQueue ? 'animate-spin' : ''}
                  aria-hidden="true"
                />
                Retry Blocked & Failed Operations
              </button>
            </div>
          </section>

          {/* Architecture Information */}
          <section className="panel p-4 md:p-5">
            <h2 className="mb-5 text-base font-semibold">Reliability & Multi-Transport Strategy</h2>
            <div className="space-y-6">
              {[
                {
                  icon: WifiOff,
                  title: 'Durable offline operation queue',
                  text: 'Local mutations persist in IndexedDB with transactional consistency. No operation is dropped on transport loss.',
                },
                {
                  icon: Network,
                  title: 'Automatic reconnection & causal replay',
                  text: 'Exponential backoff with jitter reconnects automatically. Operations replay strictly in parent-first dependency order.',
                },
                {
                  icon: QrCode,
                  title: 'QR & LAN transport interoperability',
                  text: 'PaperBridge QR transfers work independently. Remote QR imports preserve provenance without false outbox re-publishing.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <Icon size={21} className="text-brand shrink-0" aria-hidden="true" />
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
