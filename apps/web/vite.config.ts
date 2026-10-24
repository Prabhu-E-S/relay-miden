import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

function getHttpsConfig() {
  if (process.env.HTTPS !== 'true' && !process.env.SSL_KEY_FILE) {
    return undefined;
  }

  const rootDir = fileURLToPath(new URL('../../', import.meta.url));
  const keyPath = process.env.SSL_KEY_FILE
    ? path.resolve(rootDir, process.env.SSL_KEY_FILE)
    : path.resolve(rootDir, 'certs/dev-key.pem');
  const certPath = process.env.SSL_CRT_FILE
    ? path.resolve(rootDir, process.env.SSL_CRT_FILE)
    : path.resolve(rootDir, 'certs/dev-cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }
  return undefined;
}

const httpsConfig = getHttpsConfig();
const host = process.env.VITE_HOST ?? process.env.HOST ?? undefined;

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: [
        'favicon.ico',
        'favicon.svg',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'pwa-192x192.png',
        'pwa-512x512.png',
        'pwa-maskable-512x512.png',
      ],
      manifest: {
        name: 'Relay Miden',
        short_name: 'Relay Miden',
        description: 'Offline-first multilingual volunteer and task coordination',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F5F5DC',
        theme_color: '#004225',
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/socket\.io/, /^\/api/, /^\/health/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^\/(api|socket\.io|health)/,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: {
    port: 5173,
    strictPort: true,
    ...(host !== undefined ? { host } : {}),
    ...(httpsConfig ? { https: httpsConfig } : {}),
  },
  preview: {
    port: 4173,
    strictPort: true,
    ...(host !== undefined ? { host } : {}),
    ...(httpsConfig ? { https: httpsConfig } : {}),
  },
});
