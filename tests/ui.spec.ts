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
  await expect(page.getByText(/^Revision 1 ·/)).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(new RegExp(`/tasks/${id}$`));
  await expect(page.getByRole('heading', { name: 'Deliver drinking water' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByRole('link', { name: /1 Active Tasks/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /0 In Progress/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /0 Completed/ })).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Deliver drinking water, high priority/ }),
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
    page.getByRole('link', { name: /Distribute blankets, high priority/ }),
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
    page.getByRole('link', { name: /Medical volunteers, urgent priority/ }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /Deliver water/ })).toHaveCount(0);
  await page.getByRole('searchbox').fill('');
  await page.getByLabel('Filter by priority').selectOption('low');
  await expect(page.getByRole('link', { name: /Deliver water, low priority/ })).toBeVisible();
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
  await expect(page.getByText('Task changes saved on this device.')).toBeVisible();
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

test('QR features remain placeholders while using local task summaries', async ({ page }) => {
  const id = await createTask(page, { title: 'Prepare supply packs' });
  await page.goto(`/send?task=${id}`);
  await expect(page.getByRole('heading', { name: 'Prepare supply packs' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download QR/ })).toBeDisabled();
  await page.goto('/receive');
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Upload image' })).toBeDisabled();
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
