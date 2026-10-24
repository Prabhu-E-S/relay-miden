import { expect, test, type Page } from '@playwright/test';

const routes = [
  '/',
  '/create',
  '/tasks',
  '/tasks/missing',
  '/send',
  '/receive',
  '/connections',
  '/settings',
];

async function createTask(
  page: Page,
  overrides: {
    title?: string;
    quantity?: string;
    unit?: string;
    location?: string;
    priority?: 'Low' | 'Medium' | 'High' | 'Urgent';
    description?: string;
  } = {},
) {
  await page.goto('/create');
  await page.getByRole('button', { name: 'Free Text / Custom', exact: true }).click();
  await page.getByLabel('Task Title').fill(overrides.title ?? 'Deliver drinking water');
  await page.getByLabel('Quantity', { exact: false }).fill(overrides.quantity ?? '20');
  await page.getByLabel('Unit', { exact: true }).fill(overrides.unit ?? 'Bottles');
  await page.getByLabel('Location', { exact: true }).fill(overrides.location ?? 'Relief Camp');
  await page.getByRole('radio', { name: overrides.priority ?? 'High', exact: true }).check();
  await page
    .getByLabel('Description', { exact: false })
    .fill(overrides.description ?? 'Bring sealed bottles to the main gate.');
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/i);
  await expect(page.getByText('Task saved on this device.')).toBeVisible();
  return page.url().split('/').pop()!;
}

for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`all routes render without overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1'), `Expected a page heading on ${route}`).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        route,
      ).toBe(true);
      if ((width === 390 || width === 1440 || width === 768) && (route === '/' || width === 390)) {
        await page.screenshot({
          path: info.outputPath(`${route.replaceAll('/', '-') || 'dashboard'}-${width}.png`),
          fullPage: true,
        });
      }
    }
    expect(errors).toEqual([]);
  });
}

test('full task creation validates, persists, and updates the dashboard without a backend', async ({
  page,
}) => {
  await page.goto('/create');
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page.getByText('Enter a task title.')).toBeVisible();
  await expect(page.getByText('Add a location.')).toBeVisible();
  await expect(page.getByLabel('Task Title')).toBeFocused();

  const id = await createTask(page);
  await expect(page.getByRole('heading', { name: 'Deliver drinking water' })).toBeVisible();
  await expect(page.getByText(/Current status · revision 1/i)).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/tasks/${id}$`));
  await expect(page.getByRole('heading', { name: 'Deliver drinking water' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: /1 Active Tasks/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /0 In Progress/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /0 Completed/ })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Deliver drinking water, high priority/i }),
  ).toBeVisible();
});

test('dashboard quick form uses the same repository and updates live metrics', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
  const form = page.getByRole('heading', { name: 'Create Quick Task' }).locator('..').locator('..');
  await form.getByLabel('Task Title').fill('Distribute blankets');
  await form.getByLabel('Quantity', { exact: false }).fill('30');
  await form.getByLabel('Unit', { exact: true }).fill('Blankets');
  await form.getByLabel('Location', { exact: true }).fill('Ward 3');
  await form.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(form.getByRole('status')).toContainText('saved on this device');
  await expect(page.getByRole('link', { name: /1 Active Tasks/ })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Distribute blankets, high priority/i }),
  ).toBeVisible();
});

test('task list searches descriptions and filters status and priority', async ({ page }) => {
  await createTask(page, {
    title: 'Deliver water',
    priority: 'Low',
    description: 'Sealed bottles',
  });
  await createTask(page, {
    title: 'Medical volunteers',
    priority: 'Urgent',
    location: 'Main Shelter',
    description: 'First aid support',
  });
  await page.goto('/tasks');
  await expect(page.getByText('Showing 2 of 2 local tasks.')).toBeVisible();
  await page.getByRole('searchbox').fill('first aid');
  await expect(
    page.getByRole('link', { name: /Medical volunteers, urgent priority/i }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Deliver water/ })).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('Filter by priority').selectOption('low');
  await expect(page.getByRole('link', { name: /Deliver water, low priority/i })).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('completed');
  await expect(page.getByRole('heading', { name: 'No tasks match these filters' })).toBeVisible();
});

test('task details enforce transitions, edit data, reopen, and soft-delete', async ({ page }) => {
  const id = await createTask(page);
  await page.getByRole('button', { name: 'Mark Acknowledged' }).click();
  await expect(page.getByText('Status updated to Acknowledged.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark In Progress' }).click();
  await expect(page.getByText('Status updated to In Progress.')).toBeVisible();
  await page.getByRole('button', { name: 'Mark Completed' }).click();
  await expect(page.getByText('Status updated to Completed.')).toBeVisible();
  await expect(page.getByText('Current status · revision 4')).toBeVisible();
  await page.getByRole('button', { name: 'Reopen as Pending' }).click();
  await expect(page.getByText('Status updated to Pending.')).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Task Title').fill('Deliver potable water');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByRole('heading', { name: 'Deliver potable water' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete Task' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await expect(page.getByRole('heading', { name: 'No tasks yet' })).toBeVisible();
  await page.goto(`/tasks/${id}`);
  await expect(page.getByRole('heading', { name: 'Task not found' })).toBeVisible();
});

test('PaperBridge QR features generate scannable codes and enable camera/upload receiving', async ({
  page,
}) => {
  const id = await createTask(page, { title: 'Prepare supply packs' });
  await page.goto(`/send?task=${id}`);
  await expect(page.getByRole('heading', { name: 'Prepare supply packs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download QR' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy Payload' })).toBeVisible();
  await expect(page.getByAltText(/PaperBridge QR code for task/)).toBeVisible();
  await page.goto('/receive');
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Upload image' })).toBeEnabled();
});

test('mobile navigation, device identity, and all three languages remain usable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/settings');
  await expect(page.getByLabel('Device identifier')).toHaveText(/^[0-9a-f-]{36}$/i);
  const firstDeviceId = await page.getByLabel('Device identifier').textContent();
  expect(firstDeviceId).toMatch(/^[0-9a-f-]{36}$/i);
  await page.reload();
  await expect(page.getByLabel('Device identifier')).toHaveText(firstDeviceId!);
  for (const language of ['Malayalam', 'Tamil', 'English']) {
    await page.getByRole('radio', { name: new RegExp(language) }).check();
    await expect(page.getByRole('status')).toContainText(`${language} navigation selected`);
  }
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await nav.getByRole('link', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.locator('h1')).toBeFocused();
  await nav.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(page).toHaveURL(/\/receive$/);
});

test('structured instructions persist locally and re-render in Malayalam and Tamil', async ({
  page,
}) => {
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Malayalam/ }).check();
  await page.goto('/create');

  await page.getByRole('button', { name: 'സ്ട്രക്ചേർഡ് ടെംപ്ലേറ്റ്', exact: true }).click();
  await expect(page.getByLabel(/പ്രവർത്തനം/)).toBeVisible();
  await page.getByLabel(/അളവ്/).fill('20');
  await page.getByLabel('Unit code selection').selectOption('BOTTLE');
  await page.getByLabel(/സ്ഥലം/).fill('Gate B');
  await expect(page.getByText('Gate B-ലേക്ക് 20 കുപ്പി വെള്ളം എത്തിക്കുക.')).toBeVisible();
  await page.getByRole('button', { name: 'ടാസ്ക് സൃഷ്ടിക്കുക', exact: true }).click();
  await expect(page).toHaveURL(/\/tasks\/[0-9a-f-]{36}$/i);
  await expect(
    page.getByRole('heading', { name: 'Gate B-ലേക്ക് 20 കുപ്പി വെള്ളം എത്തിക്കുക.' }),
  ).toBeVisible();

  const taskPath = new URL(page.url()).pathname;
  await page.goto('/settings');
  await page.getByRole('radio', { name: /Tamil/ }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: /Tamil/ })).toBeChecked();

  await page.goto(taskPath);
  await expect(
    page.getByRole('heading', { name: 'Gate B-க்கு 20 பாட்டில் தண்ணீர் வழங்கவும்.' }),
  ).toBeVisible();
});

test('brand tokens and unfilled indicators still match the approved design', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await createTask(page);
  await page.goto('/');
  const colors = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const result = ['primary', 'background', 'action', 'accent'].map((name) => {
      probe.style.color = `var(--color-${name})`;
      return getComputedStyle(probe).color;
    });
    probe.remove();
    return result;
  });
  expect(colors).toEqual([
    'rgb(0, 66, 37)',
    'rgb(245, 245, 220)',
    'rgb(255, 176, 0)',
    'rgb(255, 207, 157)',
  ]);
  const fills = await page
    .locator('.metric-icon, .priority-label, .status-label')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).backgroundColor),
    );
  expect(fills.length).toBeGreaterThan(8);
  expect(fills.every((color) => color === 'rgba(0, 0, 0, 0)')).toBe(true);
});

test('end-to-end multi-device PaperBridge transfer via QR image file upload', async ({
  browser,
}) => {
  // Device A (Sender)
  const contextA = await browser.newContext();
  const pageA = await contextA.newPage();
  const id = await createTask(pageA, {
    title: 'Emergency Medical Supplies',
    quantity: '50',
    unit: 'Kits',
    location: 'Sector 4 Field Hospital',
    priority: 'Urgent',
    description: 'Trauma kits and saline drips needed immediately.',
  });
  await pageA.goto(`/send?task=${id}`);
  const qrImg = pageA.getByAltText(/PaperBridge QR code for task/);
  await expect(qrImg).toBeVisible();
  const dataUrl = await qrImg.getAttribute('src');
  expect(dataUrl).toMatch(/^data:image\/png;base64,/);

  // Convert base64 data URL to buffer for upload simulation
  const base64Data = dataUrl!.replace(/^data:image\/png;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  // Device B (Receiver) with completely separate storage and IndexedDB
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await pageB.goto('/receive');
  await expect(pageB.getByText('PaperBridge Offline Receiver')).toBeVisible();

  // Upload the QR image
  const fileChooserPromise = pageB.waitForEvent('filechooser');
  await pageB.getByRole('button', { name: 'Upload image' }).click();
  const fileChooser = await fileChooserPromise;
  await fileChooser.setFiles({
    name: 'transfer-qr.png',
    mimeType: 'image/png',
    buffer: imageBuffer,
  });

  // Verify decoded task preview
  await expect(pageB.getByRole('heading', { name: 'QR Decoded Successfully' })).toBeVisible();
  await expect(pageB.getByRole('heading', { name: 'Emergency Medical Supplies' })).toBeVisible();
  await expect(pageB.getByText('Sector 4 Field Hospital')).toBeVisible();
  await expect(pageB.getByText('50 Kits')).toBeVisible();
  await expect(pageB.getByText('Urgent')).toBeVisible();

  // Confirm import
  await pageB.getByRole('button', { name: 'Import Task' }).click();
  await expect(pageB.getByRole('heading', { name: 'Task Imported Successfully' })).toBeVisible();

  // Verify task appears on Tasks page
  await pageB.goto('/tasks');
  await expect(pageB.getByRole('link', { name: /Emergency Medical Supplies/ })).toBeVisible();

  // Refresh and verify persistence
  await pageB.reload();
  await expect(pageB.getByRole('link', { name: /Emergency Medical Supplies/ })).toBeVisible();

  // Duplicate scan test: upload the same QR image again
  await pageB.goto('/receive');
  const duplicateChooserPromise = pageB.waitForEvent('filechooser');
  await pageB.getByRole('button', { name: 'Upload image' }).click();
  const duplicateChooser = await duplicateChooserPromise;
  await duplicateChooser.setFiles({
    name: 'transfer-qr.png',
    mimeType: 'image/png',
    buffer: imageBuffer,
  });

  // Confirm duplicate import
  await expect(pageB.getByRole('heading', { name: 'QR Decoded Successfully' })).toBeVisible();
  await pageB.getByRole('button', { name: 'Import Task' }).click();
  await expect(pageB.getByRole('heading', { name: 'Task Already Present' })).toBeVisible();

  // Verify task count is still 1
  await pageB.goto('/tasks');
  await expect(pageB.getByText(/Showing 1 of 1 local task/)).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test('two devices exchange task update and acknowledgment QR codes', async ({ browser }) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  async function uploadQR(page: Page, image: string) {
    await page.goto('/receive');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Upload image' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'transfer.png',
      mimeType: 'image/png',
      buffer: Buffer.from(image.replace(/^data:image\/png;base64,/, ''), 'base64'),
    });
  }
  try {
    const id = await createTask(a, { title: 'QR return update' });
    await a.goto(`/send?task=${id}`);
    const createQR = a.getByAltText(/PaperBridge QR code for task/);
    await expect(createQR).toBeVisible();
    await expect
      .poll(() =>
        createQR.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
      )
      .toBe(true);
    const createImage = (await createQR.getAttribute('src'))!;
    await uploadQR(b, createImage);
    await expect(b.getByRole('heading', { name: 'QR Decoded Successfully' })).toBeVisible();
    await b.getByRole('button', { name: 'Import Task' }).click();
    await expect(b.getByRole('heading', { name: 'Task Imported Successfully' })).toBeVisible();
    await b.goto(`/tasks/${id}`);
    await b.getByRole('button', { name: 'Mark Acknowledged' }).click();
    await expect(b.getByText('Status updated to Acknowledged.')).toBeVisible();
    await b.setViewportSize({ width: 390, height: 780 });
    await b.goto(`/send?task=${id}&mode=update`);
    await expect(b.getByAltText('Task update PaperBridge QR code')).toBeVisible();
    expect(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const updateImage = (await b
      .getByAltText('Task update PaperBridge QR code')
      .getAttribute('src'))!;
    await a.setViewportSize({ width: 320, height: 740 });
    await uploadQR(a, updateImage);
    await expect(a.getByRole('heading', { name: 'Review Task Update' })).toBeVisible();
    expect(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await a.getByRole('button', { name: 'Apply Update' }).click();
    await expect(a.getByRole('heading', { name: 'Task Update Applied' })).toBeVisible();
    const ackImage = (await a
      .getByAltText('Acknowledgment PaperBridge QR code')
      .getAttribute('src'))!;
    await a.goto(`/tasks/${id}`);
    await expect(a.getByText('Current status · revision 2')).toBeVisible();
    await uploadQR(b, ackImage);
    await expect(b.getByRole('heading', { name: 'Review Acknowledgment' })).toBeVisible();
    await b.getByRole('button', { name: 'Record Acknowledgment' }).click();
    await expect(b.getByRole('heading', { name: 'Acknowledgment Recorded' })).toBeVisible();
    await b.goto(`/tasks/${id}`);
    await expect(b.getByText(/0 pending outgoing update/)).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('concurrent device edits remain intact until a QR conflict resolution converges them', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  async function transfer(from: Page, to: Page, alt: string) {
    const image = from.getByAltText(alt);
    await expect(image).toBeVisible();
    const data = (await image.getAttribute('src'))!;
    await to.goto('/receive');
    const chooser = to.waitForEvent('filechooser');
    await to.getByRole('button', { name: 'Upload image' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'conflict-qr.png',
      mimeType: 'image/png',
      buffer: Buffer.from(data.replace(/^data:image\/png;base64,/, ''), 'base64'),
    });
  }
  try {
    const id = await createTask(a, { title: 'Original task' });
    await a.goto(`/send?task=${id}`);
    await transfer(a, b, 'PaperBridge QR code for task: Original task');
    await expect(b.getByRole('heading', { name: 'QR Decoded Successfully' })).toBeVisible();
    await b.getByRole('button', { name: 'Import Task' }).click();
    await expect(b.getByRole('heading', { name: 'Task Imported Successfully' })).toBeVisible();

    await a.goto(`/tasks/${id}`);
    await a.getByRole('button', { name: 'Edit' }).click();
    await a.getByLabel('Task Title').fill('A local choice');
    await a.getByRole('button', { name: 'Save Changes' }).click();
    await expect(a.getByRole('heading', { name: 'A local choice' })).toBeVisible();
    await b.goto(`/tasks/${id}`);
    await b.getByRole('button', { name: 'Mark Acknowledged' }).click();
    await expect(b.getByText('Status updated to Acknowledged.')).toBeVisible();
    await b.goto(`/send?task=${id}&mode=update`);
    await transfer(b, a, 'Task update PaperBridge QR code');
    await expect(a.getByRole('heading', { name: 'Review Task Update' })).toBeVisible();
    await a.getByRole('button', { name: 'Apply Update' }).click();
    await expect(a.getByRole('heading', { name: 'Resolve Task Conflict' })).toBeVisible();
    await a.getByRole('link', { name: 'Resolve Conflict' }).click();
    await expect(a.getByRole('heading', { name: 'Resolve Task Conflict' })).toBeVisible();
    await a.getByRole('button', { name: 'Keep Local Version' }).click();
    await expect(a.getByText(/Conflict resolved locally/)).toBeVisible();
    await a.goto(`/send?task=${id}&mode=update`);
    await expect(a.getByAltText('Task update PaperBridge QR code')).toBeVisible();
    await transfer(a, b, 'Task update PaperBridge QR code');
    await expect(b.getByRole('heading', { name: 'Review Task Update' })).toBeVisible();
    await b.getByRole('button', { name: 'Apply Update' }).click();
    await expect(b.getByRole('heading', { name: 'Task Update Applied' })).toBeVisible();
    await b.goto(`/tasks/${id}`);
    await expect(b.getByRole('heading', { name: 'A local choice' })).toBeVisible();
    await expect(b.getByText('Current status · revision 3')).toBeVisible();
  } finally {
    await contextA.close();
    await contextB.close();
  }
});

test('connections page provides LAN server configuration and status controls', async ({ page }) => {
  await page.goto('/connections');
  await expect(page.getByRole('heading', { name: 'Local Network Synchronization' })).toBeVisible();
  await expect(page.getByLabel('LAN Server Address')).toBeVisible();
  await expect(page.getByLabel(/Session Token/)).toBeVisible();

  const urlInput = page.getByLabel('LAN Server Address');
  await urlInput.fill('http://192.168.1.100:3001');
  await expect(page.getByRole('button', { name: 'Connect to LAN' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Sync Now' })).toBeDisabled();

  // Test invalid URL input handling
  await urlInput.fill('invalid-url');
  await page.getByRole('button', { name: 'Connect to LAN' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Invalid LAN server URL');
});

test('phase 7: durable offline queue displays pending operations and retry actions', async ({
  page,
}) => {
  // 1. Visit Dashboard and verify initial connection status
  await page.goto('/');
  await expect(page.getByText('Offline Queue')).toBeVisible();
  await expect(page.getByText('All committed')).toBeVisible();

  // 2. Create a task while offline
  await createTask(page, { title: 'Offline water delivery' });

  // 3. Visit Dashboard and verify Offline Queue indicator reflects the pending operation
  await page.goto('/');
  await expect(page.getByText('1 pending')).toBeVisible();

  // 4. Visit Connections page and verify outbox queue panel
  await page.goto('/connections');
  await expect(
    page.getByRole('heading', { name: 'Durable Offline Operation Queue', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Pending', { exact: true })).toBeVisible();
  await expect(page.getByText('Awaiting replay')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry Blocked & Failed Operations' }),
  ).toBeVisible();
});
