import { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  lanSyncClient,
  getOutboxStats,
  type LanConnectionState,
  type OutboxStats,
} from '../services/lan';

const DEFAULT_OUTBOX_STATS: OutboxStats = {
  pending: 0,
  inFlight: 0,
  acknowledged: 0,
  blocked: 0,
  failed: 0,
  total: 0,
};

export function useLanSync() {
  const [state, setState] = useState<LanConnectionState>(lanSyncClient.getState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncMessageIsError, setSyncMessageIsError] = useState(false);

  const outboxStats = useLiveQuery(() => getOutboxStats(), [], DEFAULT_OUTBOX_STATS);

  useEffect(() => {
    return lanSyncClient.subscribe((next) => {
      setState(next);
    });
  }, []);

  const connect = useCallback(async (url?: string, token?: string) => {
    setSyncMessage(null);
    setSyncMessageIsError(false);
    return lanSyncClient.connect(url, token);
  }, []);

  const disconnect = useCallback(() => {
    setSyncMessage(null);
    setSyncMessageIsError(false);
    lanSyncClient.disconnect();
  }, []);

  const reconnectNow = useCallback(async () => {
    setSyncMessage(null);
    setSyncMessageIsError(false);
    return lanSyncClient.reconnectNow();
  }, []);

  const retryBlockedAndFailed = useCallback(async () => {
    setSyncMessage(null);
    setSyncMessageIsError(false);
    const count = await lanSyncClient.retryBlockedAndFailed();
    if (count > 0) {
      setSyncMessage(`Re-queued ${count} blocked or failed operation(s).`);
    } else {
      setSyncMessage('No blocked or failed operations to retry.');
    }
    return count;
  }, []);

  const setServerUrl = useCallback((url: string) => {
    lanSyncClient.setServerUrl(url);
  }, []);

  const setSessionToken = useCallback((token: string) => {
    lanSyncClient.setSessionToken(token);
  }, []);

  const syncNow = useCallback(async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    setSyncMessageIsError(false);
    try {
      const res = await lanSyncClient.syncNow();
      if (res.success) {
        setSyncMessage(
          `Synchronized successfully (${res.operationsApplied ?? 0} operations applied, ${res.outboxReplayed ?? 0} outbox replayed).`,
        );
      } else {
        setSyncMessageIsError(true);
        setSyncMessage(res.error ?? 'Sync failed.');
      }
    } catch (err) {
      setSyncMessageIsError(true);
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    status: state.status,
    serverUrl: state.serverUrl,
    sessionToken: state.sessionToken,
    lastError: state.lastError,
    lastSyncAt: state.lastSyncAt,
    serverSequence: state.serverSequence,
    reconnectAttempt: state.reconnectAttempt,
    nextRetrySeconds: state.nextRetrySeconds,
    outboxStats,
    pendingCount: outboxStats.pending,
    blockedCount: outboxStats.blocked,
    failedCount: outboxStats.failed,
    inFlightCount: outboxStats.inFlight,
    acknowledgedCount: outboxStats.acknowledged,
    isConnected: state.status === 'CONNECTED' || state.status === 'SYNCING',
    isReconnecting: state.status === 'RECONNECTING',
    isSyncing,
    syncMessage,
    syncMessageIsError,
    connect,
    disconnect,
    reconnectNow,
    retryBlockedAndFailed,
    setServerUrl,
    setSessionToken,
    syncNow,
  };
}
