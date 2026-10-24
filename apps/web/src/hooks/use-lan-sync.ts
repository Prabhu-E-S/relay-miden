import { useState, useEffect, useCallback } from 'react';
import { lanSyncClient, type LanConnectionState } from '../services/lan';

export function useLanSync() {
  const [state, setState] = useState<LanConnectionState>(lanSyncClient.getState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    return lanSyncClient.subscribe((next) => {
      setState(next);
    });
  }, []);

  const connect = useCallback(async (url?: string, token?: string) => {
    setSyncMessage(null);
    return lanSyncClient.connect(url, token);
  }, []);

  const disconnect = useCallback(() => {
    setSyncMessage(null);
    lanSyncClient.disconnect();
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
    try {
      const res = await lanSyncClient.syncNow();
      if (res.success) {
        setSyncMessage(
          `Synchronized successfully (${res.operationsApplied ?? 0} operations applied).`,
        );
      } else {
        setSyncMessage(res.error ?? 'Sync failed.');
      }
    } catch (err) {
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
    isConnected: state.status === 'CONNECTED' || state.status === 'SYNCING',
    isSyncing,
    syncMessage,
    connect,
    disconnect,
    setServerUrl,
    setSessionToken,
    syncNow,
  };
}
