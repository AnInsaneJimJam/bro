import { expect, test } from '@playwright/test';

test('landing page leads into YouTube and Instagram connection onboarding', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Your content workflow, handled/ })
  ).toBeVisible();
  await expect(
    page.getByText('Official APIs. Your approval before publishing.')
  ).toBeVisible();
  await page
    .locator('.landing-hero')
    .getByRole('link', { name: 'Connect YouTube + Instagram' })
    .click();
  await expect(page).toHaveURL(/\/onboarding\?step=connections/);
  await expect(
    page.getByRole('heading', { name: 'Connect your creator accounts' })
  ).toBeVisible();
  await expect(page.getByText('YouTube', { exact: true })).toBeVisible();
  await expect(page.getByText('Instagram', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Connect' }).first().click();
  await expect(page.getByText(/Demo mode does not call YouTube/)).toBeVisible();
});

test('demo workspace labels data and navigates principal surfaces', async ({
  page,
}, testInfo) => {
  await page.goto('/app');
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
  await page.goto('/app');
  const composer = page.getByPlaceholder(/Ask Bro/);
  await composer.fill('Write a script for topic 2');
  await composer.press('Enter');
  await expect(
    page.getByText('How long should the short be—15, 30, 45, or 60 seconds?')
  ).toBeVisible();
});

test('chat routes the latest-video caption command', async ({ page }) => {
  await page.goto('/app');
  const composer = page.getByPlaceholder(/Ask Bro/);
  await composer.fill('Create captions for my latest uploaded video');
  await composer.press('Enter');
  await expect(
    page.getByText(
      'The labeled demo video has editable caption cues ready in Videos.'
    )
  ).toBeVisible();
});

test('auto-publish defaults off and requires explicit browser confirmation', async ({
  page,
}) => {
  await page.goto('/app#Settings');
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
  await page.goto('/app');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Calendar', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Manual future slot')).toBeVisible();
});

test('demo calendar completes a clearly labeled local schedule', async ({
  page,
}, testInfo) => {
  await page.goto('/app');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.locator('.slot-editor select').first()).toHaveValue(
    '30000000-0000-4000-8000-000000000001'
  );
  await page.getByLabel('YouTube title').fill('Demo Short');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Review schedule' }).click();
  await expect(
    page.getByText(
      'Demo schedule added to this calendar only. No platform request was made.'
    )
  ).toBeVisible();
  await expect(page.getByText(/scheduled · demo/)).toBeVisible();
});

test('video workspace exposes direct multi-platform metadata publishing', async ({
  page,
}, testInfo) => {
  await page.goto('/app');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Videos', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Upload & publish', exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('YouTube title')).toBeVisible();
  await expect(page.getByLabel('YouTube description')).toBeVisible();
  await expect(page.getByLabel('Instagram caption')).toBeVisible();
  await expect(
    page.getByText('Subtitle editing will be added later')
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Publish now' })
  ).toBeDisabled();
});

test('comment analysis shows sample caveat and representative evidence', async ({
  page,
}, testInfo) => {
  await page.goto('/app');
  if (testInfo.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Comments', exact: true }).click();
  await expect(page.getByText(/12 stored comments/)).toBeVisible();
  await page.getByRole('button', { name: 'Analyze selected comments' }).click();
  await expect(
    page.getByText('Viewers want clearer privacy and setup explanations.')
  ).toBeVisible();
  await expect(
    page.getByText('“Where does it store the memory?”')
  ).toBeVisible();
  await expect(page.getByText(/Sample: 12 retrieved comments/)).toBeVisible();
  await expect(
    page.getByText(/Sentiment is an approximate model classification/)
  ).toBeVisible();
});

test('security headers are present', async ({ request }) => {
  const response = await request.get('/app');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'"
  );
});
