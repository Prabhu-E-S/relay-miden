import { LanOperationBroadcastSchema, type LanConnectionStatus } from './protocol';
import { lanConnection, type LanConnectionState } from './connection';
import {
  applyIncomingLanOperation,
  submitLocalOperation,
  requestLanSync,
  getUnsynchronizedOperations,
  recordServerAcceptance,
} from './sync';
import { taskRepository } from '../../db/task-repository';

export class LanSyncClient {
  private removeOpListener: (() => void) | null = null;
  private isSyncing = false;

  constructor() {
    this.setupLocalOperationListener();
    this.setupConnectionListener();
  }

  private setupLocalOperationListener(): void {
    this.removeOpListener = taskRepository.addOperationListener(async (operation) => {
      if (lanConnection.isConnected()) {
        try {
          await submitLocalOperation(operation.operationId);
        } catch (err) {
          console.error('Failed to submit local operation to LAN:', err);
        }
      }
    });
  }

  private setupConnectionListener(): void {
    let prevStatus: LanConnectionStatus = lanConnection.getState().status;

    lanConnection.subscribe(async (state) => {
      if (state.status === 'CONNECTED' && prevStatus !== 'CONNECTED') {
        this.setupSocketListeners();
        // Trigger initial sync upon connection
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

  async connect(url?: string, token?: string): Promise<boolean> {
    return lanConnection.connect(url, token);
  }

  disconnect(): void {
    lanConnection.disconnect();
  }

  setServerUrl(url: string): void {
    lanConnection.setServerUrl(url);
  }

  setSessionToken(token: string): void {
    lanConnection.setSessionToken(token);
  }

  async syncNow(): Promise<{ success: boolean; operationsApplied?: number; error?: string }> {
    if (!lanConnection.isConnected()) {
      return { success: false, error: 'LAN server is not connected.' };
    }

    if (this.isSyncing) {
      return { success: false, error: 'Synchronization already in progress.' };
    }

    this.isSyncing = true;
    try {
      const result = await requestLanSync();
      return { success: true, operationsApplied: result.operationsApplied };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Synchronization failed.';
      return { success: false, error: msg };
    } finally {
      this.isSyncing = false;
    }
  }

  // Phase 7 Readiness Interfaces
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
