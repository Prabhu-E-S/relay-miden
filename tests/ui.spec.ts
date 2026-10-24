import { expect, test } from '@playwright/test';

const routes = [
  '/',
  '/create',
  '/tasks',
  '/tasks/water',
  '/send',
  '/receive',
  '/connections',
  '/settings',
];
for (const width of [320, 375, 390, 430, 768, 1024, 1440]) {
  test(`all routes render without overflow at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
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

test('form validates, previews, and does not persist a task', async ({ page }) => {
  await page.goto('/create');
  await page.getByLabel('Quantity', { exact: true }).fill('0');
  await page.getByLabel('Location', { exact: true }).fill('   ');
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page.getByText('Enter a whole number between 1 and 100,000.')).toBeVisible();
  await expect(page.getByText('Add a location so people know where to help.')).toBeVisible();
  await expect(page.getByLabel('Quantity', { exact: true })).toBeFocused();
  await page.getByLabel('Quantity', { exact: true }).fill('12');
  await page.getByLabel('Location', { exact: true }).fill('Community Hall');
  await page.getByRole('radio', { name: 'Urgent', exact: true }).check();
  await page.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('not saved');
  await expect(page.getByRole('status')).toContainText('Community Hall');
  await page.reload();
  await expect(page.getByText('Task preview ready')).toHaveCount(0);
  await page.goto('/tasks');
  await expect(page.getByText('4 records')).toBeVisible();
});

test('task search, status filters, empty and missing task states work', async ({ page }) => {
  await page.goto('/tasks');
  await page.getByRole('searchbox').fill('water');
  await expect(
    page.getByRole('link', { name: 'Deliver drinking water, high priority' }),
  ).toBeVisible();
  await expect(page.getByText('1 record', { exact: true })).toBeVisible();
  await page.getByLabel('Filter by status').selectOption('completed');
  await expect(page.getByRole('heading', { name: 'No matching example tasks' })).toBeVisible();
  await page.getByRole('searchbox').fill('');
  await expect(page.getByRole('link', { name: 'Distribute blankets, low priority' })).toBeVisible();
  await page.goto('/tasks/missing');
  await expect(page.getByRole('heading', { name: 'Task not found' })).toBeVisible();
  await page.goto('/unknown');
  await expect(page.getByRole('heading', { name: 'This page isn’t here' })).toBeVisible();
});

test('QR controls stay disabled and status preview does not change the task', async ({ page }) => {
  await page.goto('/send?task=medical');
  await expect(page.getByRole('heading', { name: 'Medical volunteers needed' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Download QR/ })).toBeDisabled();
  await page.goto('/receive');
  await expect(page.getByRole('button', { name: 'Use camera' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Upload image' })).toBeDisabled();
  await page.goto('/tasks/water');
  await page.getByRole('button', { name: 'Preview status update' }).click();
  await page.getByLabel('Next status').selectOption('completed');
  await page.getByRole('button', { name: 'Preview selection' }).click();
  await expect(page.getByRole('status')).toContainText('No changes were saved or sent');
  await expect(page.locator('li').filter({ hasText: 'Current example status' })).toContainText(
    'Pending',
  );
});

test('mobile navigation and all three languages remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/settings');
  for (const language of ['Malayalam', 'Tamil', 'English']) {
    await page.getByRole('radio', { name: new RegExp(language) }).check();
    await expect(page.getByRole('status')).toContainText(`${language} navigation selected`);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  const nav = page.getByRole('navigation', { name: 'Mobile navigation' });
  await nav.getByRole('link', { name: 'Home', exact: true }).click();
  await nav.getByRole('link', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/create$/);
  await expect(page.locator('h1')).toBeFocused();
  await nav.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(page).toHaveURL(/\/receive$/);
});

test('brand tokens and unfilled indicators match design rules', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const colors = await page.evaluate(() => {
    // Compare rendered colors: the production minifier may shorten a hex to a named color.
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
  await expect(page.getByText('Example states · not live connectivity')).toBeVisible();
});
