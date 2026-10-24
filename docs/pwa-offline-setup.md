# Relay Miden — PWA Offline & Secure LAN Setup Guide

This guide describes how to configure, run, install, and verify Relay Miden as an offline-first Progressive Web App (PWA) with secure LAN access for mobile devices and live camera scanning.

---

## 1. Overview & Core Architecture

Relay Miden is designed to operate completely offline in crisis environments where public internet infrastructure is severed:

- **App Shell Cache**: Static web application assets (HTML, CSS, JavaScript, local fonts, icons) are precached locally by a Workbox-powered Service Worker. Once cached, the application launches instantly without requiring an internet or LAN connection.
- **Durable Local Storage**: All tasks, operation logs, conflict metadata, and synchronization queues are durably stored in browser **IndexedDB** via Dexie. Task data is never cached in Cache Storage and never deleted during application updates.
- **PaperBridge QR Channel**: Offline device-to-device task handoffs run locally using generated QR codes and optical scanning (or image uploads) without any network transport.
- **Secure LAN Synchronization**: Devices connected to the same Wi-Fi router or mobile hotspot synchronize in real time using Express, Socket.IO, and SQLite over LAN.

---

## 2. Why Secure Context (HTTPS) is Required for Mobile Devices

Modern mobile browsers (Chrome on Android, Safari on iOS) enforce strict security boundaries around sensitive device capabilities:

1. **Camera Access (`navigator.mediaDevices.getUserMedia`)**: The camera API is disabled by mobile browsers on insecure origins. While `http://localhost` and `http://127.0.0.1` are treated as secure contexts, a mobile device opening `http://10.10.19.44:5173` is considered an **insecure context** (`isSecureContext = false`). As a result, live camera scanning is blocked.
2. **Service Worker Registration (`navigator.serviceWorker.register`)**: Mobile browsers only permit service worker registration and PWA installation prompts on secure origins.
3. **Mixed-Content Protection**: An HTTPS frontend (`https://<LAN-IP>:5173`) cannot make unencrypted WebSocket or HTTP requests to an insecure backend (`http://<LAN-IP>:3001`). Both frontend and server must be configured with HTTPS.

---

## 3. Host IP Identification on Windows

When running Relay Miden on a development machine (e.g. laptop) and connecting from a phone on the same Wi-Fi network:

1. Open PowerShell or Command Prompt on Windows.
2. Run `ipconfig`:
   ```powershell
   ipconfig
   ```
3. Look for your active network adapter (e.g., `Wireless LAN adapter Wi-Fi` or `Ethernet adapter`).
4. Note the **IPv4 Address**, for example: `10.10.19.44` or `192.168.1.100`.

> **Why `127.0.0.1` and `localhost` do not work on other devices:**
> `127.0.0.1` is the loopback interface representing "this computer only". When a phone tries to connect to `127.0.0.1:5173`, it attempts to connect to a web server running on the phone itself, which fails. You must use the host laptop's actual LAN IP address.

---

## 4. Local TLS Certificate Generation Workflow

To satisfy the secure-context requirement without security warnings on mobile devices, use locally trusted development certificates.

### Method A: Automated Generation with mkcert (Recommended)

`mkcert` creates and manages a local Certificate Authority (CA) that mobile operating systems can trust directly.

1. **Install mkcert** (if not already installed):
   - Windows (Chocolatey): `choco install mkcert`
   - Windows (Scoop): `scoop bucket add extras && scoop install mkcert`
   - macOS: `brew install mkcert`
2. **Install the Local Root CA on your laptop**:
   ```bash
   mkcert -install
   ```
3. **Generate SAN Certificate for your LAN IP**:
   Run the project generator helper:
   ```bash
   npm run cert:gen
   ```
   Or run `mkcert` manually with your detected LAN IP:
   ```bash
   mkcert -key-file certs/dev-key.pem -cert-file certs/dev-cert.pem localhost 127.0.0.1 10.10.19.44
   ```
4. **Trust the Root CA on your Phone**:
   - Find the root CA location: `mkcert -CAROOT`
   - Copy `rootCA.pem` to your phone (via USB cable, local download, or email).
   - **Android**: Go to _Settings → Security → Encryption & credentials → Install a certificate → CA certificate_. Select `rootCA.pem`.
   - **iOS**: Send `rootCA.pem` via AirDrop. Go to _Settings → Profile Downloaded → Install_. Then go to _Settings → General → About → Certificate Trust Settings_ and enable full trust for the mkcert certificate.

### Method B: OpenSSL Fallback

If `mkcert` is unavailable, `npm run cert:gen` automatically falls back to OpenSSL (installed with Git for Windows):

```bash
npm run cert:gen
```

This creates `certs/dev-key.pem` and `certs/dev-cert.pem` with Subject Alternative Names (SAN) for all active LAN interfaces. Note that mobile browsers may display a self-signed warning until the certificate is imported.

---

## 5. Starting the Development Environment

### Localhost Only (Default)

Starts Vite frontend on `http://127.0.0.1:5173` and LAN server on `http://0.0.0.0:3001`:

```bash
npm run dev
```

### LAN HTTP Mode (Testing on LAN without HTTPS)

Binds frontend and server to all interfaces:

```bash
npm run dev:lan
```

- Frontend: `http://<LAN-IP>:5173`
- Server: `http://<LAN-IP>:3001`
- _Note:_ In this mode, camera scanning requires image file upload fallback due to browser security restrictions.

### Secure LAN HTTPS Mode (Full Mobile PWA & Live Camera)

Runs both Vite frontend and Express Socket.IO server with TLS:

```bash
npm run dev:https
```

- Frontend: `https://<LAN-IP>:5173`
- Server: `https://<LAN-IP>:3001`
- _Features enabled:_ Live camera scanning, Service Worker registration, Android install prompt, standalone launch.

---

## 6. Installing the Progressive Web App

### Android (Google Chrome)

1. Navigate to `https://<LAN-IP>:5173` (or `http://localhost:5173`).
2. Chrome will display an install badge in the omnibox, or you can open the menu (three dots) and select **Install App** / **Add to Home screen**.
3. Alternatively, navigate to **Settings** in Relay Miden and tap **Install Relay Miden on this Device**.
4. The app is added to the application drawer and home screen. When launched, it runs in standalone display mode without URL bars.

### iOS (Apple Safari)

1. Navigate to `https://<LAN-IP>:5173` in Safari.
2. Tap the **Share** button in the Safari navigation bar.
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**. Relay Miden opens as an independent standalone web app.

### Desktop (Chrome, Edge, Brave)

1. Navigate to the app URL.
2. Click the install icon in the address bar.
3. Relay Miden runs in a dedicated desktop window.

---

## 7. Completely Offline Operation & Launch

Once the app shell is cached:

1. **Verify Offline Readiness**:
   - Check the **Connection Status** panel on the Dashboard: `PWA Shell: Ready offline`.
   - Or navigate to **Settings**: `App Shell Cache: Ready for offline launch`.
2. **Simulate Disconnection**:
   - Turn off Wi-Fi and mobile data on your phone or laptop.
   - Close the browser or standalone app window.
3. **Relaunch**:
   - Open Relay Miden from your home screen or bookmarks.
   - The application shell loads immediately from Service Worker Cache Storage.
   - All tasks, priorities, notes, and causal history render from IndexedDB.
4. **Create & Edit Tasks Offline**:
   - Create new tasks or update task statuses.
   - Mutations persist in IndexedDB and enqueue into the durable Phase 7 outbox.
   - PaperBridge QR generation works offline for optical handoffs.
5. **Reconnection & Convergence**:
   - When LAN connectivity returns, the client reconnects with exponential backoff and jitter, replaying all queued offline mutations to the server in strict causal order.

---

## 8. Application Update Handling

Relay Miden uses a safe update strategy:

- When an updated build is deployed, the Service Worker installs in the background.
- A non-intrusive banner notification appears: **"App Update Available"**.
- Clicking **"Update Now"** instructs the waiting Service Worker to activate (`skipWaiting`) and reloads the application shell.
- **Data Guarantee**: Application updates never clear or modify IndexedDB task tables, outbox records, or conflict states.
