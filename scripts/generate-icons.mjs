import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../apps/web/public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Write favicon.svg
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 42 34" fill="none">
  <rect width="42" height="34" rx="6" fill="#004225"/>
  <path
    d="M3 29 16 6l12 23M18 17l8-13 13 25"
    stroke="#fffef4"
    stroke-width="2.6"
    stroke-linejoin="round"
  />
  <path
    d="m16 17 4 6h-5l5 8"
    stroke="#FFB000"
    stroke-width="2.6"
    stroke-linejoin="round"
  />
</svg>`;

fs.writeFileSync(path.join(publicDir, 'favicon.svg'), faviconSvg, 'utf8');

// HTML template for generating PNGs
function renderHtml(width, height, iconScale = 0.6) {
  const iconW = Math.round(width * iconScale);
  const iconH = Math.round(iconW * (34 / 42));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      background: #004225;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }
    svg {
      width: ${iconW}px;
      height: ${iconH}px;
    }
  </style>
</head>
<body>
  <svg viewBox="0 0 42 34" fill="none">
    <path
      d="M3 29 16 6l12 23M18 17l8-13 13 25"
      stroke="#fffef4"
      stroke-width="2.6"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
    <path
      d="m16 17 4 6h-5l5 8"
      stroke="#FFB000"
      stroke-width="2.6"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  </svg>
</body>
</html>`;
}

async function generatePngs() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const targets = [
    { name: 'pwa-192x192.png', width: 192, height: 192, scale: 0.6 },
    { name: 'pwa-512x512.png', width: 512, height: 512, scale: 0.6 },
    { name: 'pwa-maskable-512x512.png', width: 512, height: 512, scale: 0.5 }, // 50% scale ensures it fits safely inside the 80% circle
    { name: 'apple-touch-icon.png', width: 180, height: 180, scale: 0.6 },
    { name: 'favicon-32x32.png', width: 32, height: 32, scale: 0.7 },
  ];

  for (const target of targets) {
    await page.setViewportSize({ width: target.width, height: target.height });
    await page.setContent(renderHtml(target.width, target.height, target.scale));
    const outputPath = path.join(publicDir, target.name);
    await page.screenshot({ path: outputPath, omitBackground: false });
    console.log(`Generated ${target.name} (${target.width}x${target.height})`);
  }

  // Also create a basic favicon.ico copy from favicon-32x32.png
  const png32 = fs.readFileSync(path.join(publicDir, 'favicon-32x32.png'));
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), png32);
  console.log('Created favicon.ico');

  await browser.close();
}

generatePngs().catch((err) => {
  console.error('Failed to generate PNG icons:', err);
  process.exit(1);
});
