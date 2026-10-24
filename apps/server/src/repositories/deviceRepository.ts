import type { DatabaseSync } from 'node:sqlite';
import type { LanDeviceRegistration } from '@relay-miden/shared';

export interface DeviceRecord {
  device_id: string;
  display_name: string | null;
  protocol_version: number;
  app_version: string | null;
  registered_at: string;
  last_seen_at: string;
}

export class DeviceRepository {
  constructor(private readonly db: DatabaseSync) {}

  registerOrUpdate(reg: LanDeviceRegistration): void {
    const now = new Date().toISOString();
    const existing = this.getDevice(reg.deviceId);

    if (existing) {
      const stmt = this.db.prepare(`
        UPDATE devices
        SET display_name = COALESCE(?, display_name),
            protocol_version = ?,
            app_version = COALESCE(?, app_version),
            last_seen_at = ?
        WHERE device_id = ?
      `);
      stmt.run(
        reg.displayName ?? null,
        reg.protocolVersion,
        reg.appVersion ?? null,
        now,
        reg.deviceId,
      );
    } else {
      const stmt = this.db.prepare(`
        INSERT INTO devices (device_id, display_name, protocol_version, app_version, registered_at, last_seen_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      stmt.run(
        reg.deviceId,
        reg.displayName ?? null,
        reg.protocolVersion,
        reg.appVersion ?? null,
        now,
        now,
      );
    }
  }

  getDevice(deviceId: string): DeviceRecord | null {
    const stmt = this.db.prepare('SELECT * FROM devices WHERE device_id = ?');
    const row = stmt.get(deviceId) as DeviceRecord | undefined;
    return row ?? null;
  }

  touchDevice(deviceId: string): void {
    const stmt = this.db.prepare('UPDATE devices SET last_seen_at = ? WHERE device_id = ?');
    stmt.run(new Date().toISOString(), deviceId);
  }
}
