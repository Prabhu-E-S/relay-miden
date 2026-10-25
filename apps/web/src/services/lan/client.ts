import type { OutboxEntry, OutboxStatus } from '@relay-miden/shared';
import { LanOperationBroadcastSchema, type LanConnectionStatus } from './protocol';
import { lanConnection, type LanConnectionState } from './connection';
import {
  applyIncomingLanOperation,
  submitLocalOperation,
  requestLanSync,
  getUnsynchronizedOperations,
  recordServerAcceptance,
} from './sync';
import {
  getOutboxStats,
  getOutboxEntries,
  retryBlockedAndFailed,
  type OutboxStats,
} from './outbox';
import { taskRepository } from '../../db/task-repository';

export class LanSyncClient {
  private removeOpListener: (() => void) | null = null;
  private isSyncing = false;

  constructor() {
    this.setupLocalOperationListener();
    this.setupConnectionListener();
  }

  private setupLocalOperationListener(): void {
    this.removeOpListener = taskRepository.addOperationListener(async () => {
      if (lanConnection.isConnected()) {
        try {
          await this.syncNow();
        } catch (err) {
          console.error('Failed to trigger synchronization on local operation:', err);
        }
      }
    });
  }

  private setupConnectionListener(): void {
    let prevStatus: LanConnectionStatus = lanConnection.getState().status;

    lanConnection.subscribe(async (state) => {
      if (state.status === 'CONNECTED' && prevStatus !== 'CONNECTED') {
        this.setupSocketListeners();
        // Trigger initial catch-up and outbox replay upon connection
        void this.syncNow();
      }
      prevStatus = state.status;
    });
  }

  private setupSocketListeners(): void {
    const socket = lanConnection.getSocket();
    if (!socket) return;

    socket.off('operation:broadcast');
    socket.on('operation:broadcast', async (data: unknown) => {
      const parsed = LanOperationBroadcastSchema.safeParse(data);
      if (parsed.success) {
        try {
          await applyIncomingLanOperation(parsed.data.operation);
          if (parsed.data.sequence > lanConnection.getSyncCursor()) {
            lanConnection.setSyncCursor(parsed.data.sequence);
          }
        } catch (err) {
          console.error('Failed to apply broadcast operation from LAN:', err);
        }
      }
    });
  }

  getState(): LanConnectionState {
    return lanConnection.getState();
  }

  subscribe(listener: (state: LanConnectionState) => void): () => void {
    return lanConnection.subscribe(listener);
  }

  async connect(url?: string, token?: string, customDeviceId?: string): Promise<boolean> {
    return lanConnection.connect(url, token, customDeviceId);
  }

  disconnect(): void {
    lanConnection.disconnect();
  }

  async reconnectNow(): Promise<boolean> {
    return lanConnection.reconnectNow();
  }

  setServerUrl(url: string): void {
    lanConnection.setServerUrl(url);
  }

  setSessionToken(token: string): void {
    lanConnection.setSessionToken(token);
  }

  async syncNow(): Promise<{
    success: boolean;
    operationsApplied?: number | undefined;
    outboxReplayed?: number | undefined;
    pending?: number | undefined;
    blocked?: number | undefined;
    failed?: number | undefined;
    error?: string | undefined;
  }> {
    if (this.isSyncing) {
      return { success: false, error: 'Synchronization already in progress.' };
    }

    this.isSyncing = true;
    try {
      if (!lanConnection.isConnected()) {
        if (!lanConnection.getServerUrl()) {
          return { success: false, error: 'Set a LAN server address before syncing.' };
        }
        const reconnected = await lanConnection.reconnectNow();
        if (!reconnected) {
          return {
            success: false,
            error: lanConnection.getState().lastError ?? 'Could not connect to the LAN server.',
          };
        }
      }
      const result = await requestLanSync();
      const outbox = await getOutboxStats();
      const unresolved = outbox.pending + outbox.inFlight + outbox.blocked + outbox.failed;

      if (unresolved > 0) {
        return {
          success: false,
          operationsApplied: result.operationsApplied,
          outboxReplayed: result.outboxReplayed,
          pending: outbox.pending + outbox.inFlight,
          blocked: outbox.blocked,
          failed: outbox.failed,
          error: `Sync completed, but ${unresolved} local operation(s) still need attention.`,
        };
      }

      return {
        success: true,
        operationsApplied: result.operationsApplied,
        outboxReplayed: result.outboxReplayed,
        pending: 0,
        blocked: 0,
        failed: 0,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Synchronization failed.';
      return { success: false, error: msg };
    } finally {
      this.isSyncing = false;
    }
  }

  async getOutboxStats(): Promise<OutboxStats> {
    return getOutboxStats();
  }

  async getOutboxEntries(status?: OutboxStatus): Promise<OutboxEntry[]> {
    return getOutboxEntries(status);
  }

  async retryBlockedAndFailed(): Promise<number> {
    const count = await retryBlockedAndFailed();
    if (count > 0 && lanConnection.isConnected()) {
      void this.syncNow();
    }
    return count;
  }

  async getUnsynchronizedOperations() {
    return getUnsynchronizedOperations();
  }

  async submitOperationById(operationId: string) {
    return submitLocalOperation(operationId);
  }

  async recordAcceptance(operationId: string, sequence: number) {
    return recordServerAcceptance(operationId, sequence);
  }

  getSyncCursor(): number {
    return lanConnection.getSyncCursor();
  }

  destroy(): void {
    if (this.removeOpListener) {
      this.removeOpListener();
      this.removeOpListener = null;
    }
    this.disconnect();
  }
}

export const lanSyncClient = new LanSyncClient();
