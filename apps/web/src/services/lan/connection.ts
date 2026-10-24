import { io, type Socket } from 'socket.io-client';
import {
  LAN_PROTOCOL_VERSION,
  LanDeviceRegistrationSchema,
  LanRegistrationResultSchema,
  type LanConnectionStatus,
} from './protocol';
import { taskRepository } from '../../db/task-repository';
import { calculateBackoffDelay } from './outbox';

export interface LanConnectionState {
  status: LanConnectionStatus;
  serverUrl: string;
  sessionToken: string;
  lastError: string | null;
  lastSyncAt: string | null;
  serverSequence: number;
  reconnectAttempt: number;
  nextRetrySeconds: number | null;
}

const STORAGE_KEYS = {
  SERVER_URL: 'relay-miden-lan-url',
  SESSION_TOKEN: 'relay-miden-lan-token',
  SYNC_CURSOR: 'relay-miden-lan-cursor',
  LAST_SYNC: 'relay-miden-lan-last-sync',
};

function readStorage(key: string, defaultValue = ''): string {
  try {
    return localStorage.getItem(key) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // In memory or restricted storage
  }
}

export class LanConnectionManager {
  private socket: Socket | null = null;
  private state: LanConnectionState;
  private listeners: Set<(state: LanConnectionState) => void> = new Set();
  private isExplicitlyDisconnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownInterval: ReturnType<typeof setInterval> | null = null;
  private cachedDeviceId: string | undefined;

  constructor() {
    const savedUrl = readStorage(STORAGE_KEYS.SERVER_URL);
    const savedToken = readStorage(STORAGE_KEYS.SESSION_TOKEN);
    const savedCursor = Number(readStorage(STORAGE_KEYS.SYNC_CURSOR, '0')) || 0;
    const savedLastSync = readStorage(STORAGE_KEYS.LAST_SYNC) || null;

    this.state = {
      status: savedUrl ? 'DISCONNECTED' : 'NOT_CONFIGURED',
      serverUrl: savedUrl,
      sessionToken: savedToken,
      lastError: null,
      lastSyncAt: savedLastSync,
      serverSequence: savedCursor,
      reconnectAttempt: 0,
      nextRetrySeconds: null,
    };

    this.setupLifecycleListeners();
  }

  private setupLifecycleListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (!this.isExplicitlyDisconnected && this.state.serverUrl && !this.isConnected()) {
          void this.reconnectNow();
        }
      });

      document.addEventListener('visibilitychange', () => {
        if (
          document.visibilityState === 'visible' &&
          !this.isExplicitlyDisconnected &&
          this.state.serverUrl &&
          !this.isConnected()
        ) {
          void this.reconnectNow();
        }
      });
    }
  }

  getState(): LanConnectionState {
    return { ...this.state };
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.state.status === 'CONNECTED' || this.state.status === 'SYNCING';
  }

  isConnecting(): boolean {
    return (
      this.state.status === 'CONNECTING' ||
      this.state.status === 'REGISTERING' ||
      this.state.status === 'RECONNECTING'
    );
  }

  getServerUrl(): string {
    return this.state.serverUrl;
  }

  setServerUrl(url: string): void {
    const trimmed = url.trim();
    writeStorage(STORAGE_KEYS.SERVER_URL, trimmed);
    this.updateState({
      serverUrl: trimmed,
      status: trimmed
        ? this.socket?.connected
          ? this.state.status
          : 'DISCONNECTED'
        : 'NOT_CONFIGURED',
      lastError: null,
    });
  }

  getSessionToken(): string {
    return this.state.sessionToken;
  }

  setSessionToken(token: string): void {
    const trimmed = token.trim();
    writeStorage(STORAGE_KEYS.SESSION_TOKEN, trimmed);
    this.updateState({ sessionToken: trimmed });
  }

  getSyncCursor(): number {
    return this.state.serverSequence;
  }

  setSyncCursor(sequence: number): void {
    writeStorage(STORAGE_KEYS.SYNC_CURSOR, String(sequence));
    this.updateState({ serverSequence: sequence });
  }

  getLastSyncAt(): string | null {
    return this.state.lastSyncAt;
  }

  setLastSyncAt(iso: string): void {
    writeStorage(STORAGE_KEYS.LAST_SYNC, iso);
    this.updateState({ lastSyncAt: iso });
  }

  subscribe(listener: (state: LanConnectionState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<LanConnectionState>): void {
    this.state = { ...this.state, ...partial };
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('Connection state listener error:', err);
      }
    }
  }

  validateUrl(url: string): void {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('LAN URL must use http: or https:');
      }
    } catch {
      throw new Error(`Invalid LAN server URL: ${url}. Example: http://192.168.1.10:3001`);
    }
  }

  private clearReconnectionTimers(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  private scheduleReconnection(): void {
    if (this.isExplicitlyDisconnected || !this.state.serverUrl) return;

    this.clearReconnectionTimers();
    const nextAttempt = this.state.reconnectAttempt + 1;
    const delayMs = calculateBackoffDelay(nextAttempt);
    let secondsLeft = Math.ceil(delayMs / 1000);

    this.updateState({
      status: 'RECONNECTING',
      reconnectAttempt: nextAttempt,
      nextRetrySeconds: secondsLeft,
    });

    this.countdownInterval = setInterval(() => {
      secondsLeft = Math.max(0, secondsLeft - 1);
      this.updateState({ nextRetrySeconds: secondsLeft });
      if (secondsLeft === 0 && this.countdownInterval) {
        clearInterval(this.countdownInterval);
        this.countdownInterval = null;
      }
    }, 1000);

    this.reconnectTimer = setTimeout(() => {
      this.clearReconnectionTimers();
      if (!this.isExplicitlyDisconnected && !this.isConnected()) {
        void this.connect(undefined, undefined, this.cachedDeviceId);
      }
    }, delayMs);
  }

  async reconnectNow(): Promise<boolean> {
    this.clearReconnectionTimers();
    return this.connect(undefined, undefined, this.cachedDeviceId);
  }

  async connect(url?: string, token?: string, customDeviceId?: string): Promise<boolean> {
    const targetUrl = (url ?? this.state.serverUrl).trim();
    const sessionToken = (token ?? this.state.sessionToken).trim();
    if (customDeviceId) {
      this.cachedDeviceId = customDeviceId;
    }

    if (!targetUrl) {
      this.clearReconnectionTimers();
      this.updateState({
        status: 'NOT_CONFIGURED',
        lastError: 'LAN server URL is not configured.',
        reconnectAttempt: 0,
        nextRetrySeconds: null,
      });
      return false;
    }

    try {
      this.validateUrl(targetUrl);
    } catch (err) {
      this.clearReconnectionTimers();
      this.updateState({
        status: 'ERROR',
        lastError: err instanceof Error ? err.message : 'Invalid LAN server URL',
        reconnectAttempt: 0,
        nextRetrySeconds: null,
      });
      return false;
    }

    this.setServerUrl(targetUrl);
    this.setSessionToken(sessionToken);
    this.isExplicitlyDisconnected = false;

    // Disconnect existing socket and cleanup listeners
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.updateState({ status: 'CONNECTING', lastError: null });

    return new Promise((resolve) => {
      let resolved = false;

      const finish = (success: boolean, error?: string) => {
        if (!resolved) {
          resolved = true;
          if (success) {
            this.clearReconnectionTimers();
            this.updateState({
              status: 'CONNECTED',
              lastError: null,
              reconnectAttempt: 0,
              nextRetrySeconds: null,
            });
          } else {
            if (error) {
              this.updateState({ lastError: error });
            }
            if (!this.isExplicitlyDisconnected) {
              this.scheduleReconnection();
            } else {
              this.updateState({ status: 'ERROR' });
            }
          }
          resolve(success);
        }
      };

      const socket = io(targetUrl, {
        transports: ['websocket', 'polling'],
        reconnection: false, // We control reconnection explicitly with exponential backoff & jitter
        timeout: 10000,
        autoConnect: false,
      });

      this.socket = socket;

      socket.on('connect', async () => {
        this.updateState({ status: 'REGISTERING' });
        try {
          const deviceId = customDeviceId ?? (await taskRepository.getDeviceId());
          const registrationPayload = LanDeviceRegistrationSchema.parse({
            protocolVersion: LAN_PROTOCOL_VERSION,
            deviceId,
            displayName: `Device-${deviceId.slice(0, 6)}`,
            appVersion: '1.0.0',
            ...(sessionToken ? { sessionToken } : {}),
          });

          socket.emit('device:register', registrationPayload);
        } catch (err) {
          finish(
            false,
            `Failed to prepare device registration: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      });

      socket.on('device:registered', (data: unknown) => {
        const parsed = LanRegistrationResultSchema.safeParse(data);
        if (parsed.success && parsed.data.success) {
          finish(true);
        } else {
          const msg = parsed.success
            ? (parsed.data.message ?? 'Device registration failed on LAN server.')
            : 'Device registration rejected by LAN server.';
          socket.disconnect();
          finish(false, msg);
        }
      });

      socket.on('connect_error', (err) => {
        const msg = `Connection failed: ${err.message || 'Server unreachable'}`;
        finish(false, msg);
      });

      socket.on('disconnect', (reason) => {
        if (this.isExplicitlyDisconnected) {
          this.updateState({
            status: 'DISCONNECTED',
            lastError: null,
            reconnectAttempt: 0,
            nextRetrySeconds: null,
          });
        } else {
          const msg = `Disconnected: ${reason}`;
          this.updateState({ lastError: msg });
          this.scheduleReconnection();
        }
      });

      socket.on('server:error', (error: unknown) => {
        const message =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message: unknown }).message)
            : 'LAN server error';
        this.updateState({ lastError: message });
      });

      socket.connect();
    });
  }

  disconnect(): void {
    this.isExplicitlyDisconnected = true;
    this.clearReconnectionTimers();

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.updateState({
      status: this.state.serverUrl ? 'DISCONNECTED' : 'NOT_CONFIGURED',
      lastError: null,
      reconnectAttempt: 0,
      nextRetrySeconds: null,
    });
  }
}

export const lanConnection = new LanConnectionManager();
