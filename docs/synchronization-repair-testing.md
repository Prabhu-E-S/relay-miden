# Relay Miden — Synchronization Repair Test Guide

This guide verifies the repaired PaperBridge QR and LAN synchronization paths without deleting browser or server data.

## Before testing

1. Put the laptop and phone on the same private Wi-Fi or hotspot. Public internet is not required.
2. In PowerShell, run `ipconfig` and use the IPv4 address on the active Wi-Fi adapter. Do not use `127.0.0.1` on the phone.
3. Generate a trusted development certificate once with `npm run cert:gen`. Install and trust the generated local CA on the phone as described in [pwa-offline-setup.md](pwa-offline-setup.md).
4. Start both app and coordinator with `npm run dev:https`.
5. On the phone, open `https://<laptop-ip>:5173` and accept the trusted certificate. Confirm `https://<laptop-ip>:3001/health` opens successfully. The server binds to `0.0.0.0`; that is a bind address, not the address entered on the phone.

If a connection fails, inspect the browser console for Socket.IO errors and confirm Windows Firewall permits private-network inbound TCP 5173 and 3001. Use the same scheme in both places: an HTTPS app must use an `https://<laptop-ip>:3001` LAN server address.

## PaperBridge QR return update

1. On Device A, create a task and open **Send via QR**. Scan or upload its **Send Task** QR on Device B and import it.
2. On Device B, edit the imported task or advance its status.
3. Open **Send via QR** on Device B. It now defaults to **Send Update** when durable local changes exist. Scan or upload that update QR on Device A.
4. On Device A, select **Apply Update**. The existing task must update in place; it must not show “Already exists.”
5. Scan the generated acknowledgment QR on Device B. Re-scanning the same update or acknowledgment must be harmless.

## LAN automatic and manual sync

1. On both devices, open **Connections** and enter `https://<laptop-ip>:3001` plus the optional matching session token when the host uses `LAN_SESSION_TOKEN`.
2. Use **Connect to LAN**. Both screens should show `CONNECTED`.
3. Create or update a task on Device A. It should appear on Device B without refresh. Repeat in the other direction.
4. For recovery testing, disconnect Device B, create or edit a task, then reconnect. The durable outbox should replay in parent-first order automatically.
5. To force reconciliation, enter or correct the LAN address and click **Connect & Sync**. This saves the edited address, reconnects if necessary, sends local pending operations, retrieves missed operations, and applies them through the same causal engine.
6. A success message means no local operation is pending, in flight, blocked, or failed. If any remain, Relay Miden reports that action is still required; use the queue panel and **Retry Blocked & Failed Operations** only after resolving the stated dependency or conflict.

## Persistence and conflict check

- Reload either device after creating offline tasks; tasks and queue records must remain.
- Make conflicting edits on both devices while disconnected. On reconnection, preserve the conflict, resolve it in Task Details, then synchronize the resulting resolution operation.
- Do not clear IndexedDB or the SQLite database while testing; doing so removes the durable history needed for causal synchronization.

## Physical validation status

Automated browser and loopback integration tests cover the repaired paths. Actual phone networking, certificate trust, firewall configuration, and camera scanning require this device-level procedure and are not asserted by automated tests.
