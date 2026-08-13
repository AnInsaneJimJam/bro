import { expect, test } from '@playwright/test';

test('demo workspace labels data and navigates principal surfaces', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Ideas', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Topic opportunities' })
  ).toBeVisible();
  await expect(
    page.getByText('Opportunity', { exact: true }).first()
  ).toBeVisible();
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Scripts', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Scripts', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'New 45s draft' }).click();
  await expect(page.getByLabel('Working title')).toBeVisible();
});

test('chat asks for missing script duration instead of guessing', async ({
  page,
}) => {
  await page.goto('/');
  const composer = page.getByPlaceholder(/Ask Bro/);
  await composer.fill('Write a script for topic 2');
  await composer.press('Enter');
  await expect(
    page.getByText('How long should the short be—15, 30, 45, or 60 seconds?')
  ).toBeVisible();
});

test('auto-publish defaults off and requires explicit browser confirmation', async ({
  page,
}) => {
  await page.goto('/#Settings');
  const youtube = page.getByRole('button', {
    name: 'Enable YouTube auto-publish',
  });
  await expect(youtube).toHaveAttribute('aria-pressed', 'false');
  page.once('dialog', (dialog) => dialog.dismiss());
  await youtube.click();
  await expect(youtube).toHaveAttribute('aria-pressed', 'false');
  page.once('dialog', (dialog) => dialog.accept());
  const update = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/settings/auto-publish') &&
      response.request().method() === 'PATCH'
  );
  await youtube.click();
  expect((await update).ok()).toBe(true);
  await expect(
    page.getByRole('button', { name: 'Disable YouTube auto-publish' })
  ).toHaveAttribute('aria-pressed', 'true');
});

test('mobile navigation exposes calendar and keeps manual slot usable', async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes('mobile'),
    'Mobile-specific acceptance path'
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Manual future slot')).toBeVisible();
});

test('caption editor supports split merge delete and overlap validation', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Videos', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Videos & captions', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Split' }).first().click();
  await expect(page.locator('.cue')).toHaveCount(3);
  await page.getByRole('button', { name: 'Merge' }).first().click();
  await expect(page.locator('.cue')).toHaveCount(2);
  await page.locator('.cue').nth(1).getByLabel('Start').fill('1');
  await expect(page.getByText(/overlaps cue/)).toBeVisible();
  await page.locator('.cue').nth(1).getByLabel('Start').fill('2.2');
  await expect(page.getByText(/overlaps cue/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.locator('.cue')).toHaveCount(1);
});

test('security headers are present', async ({ request }) => {
  const response = await request.get('/');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'"
  );
});
