const { test, expect } = require('@playwright/test');

const pages = ['home', 'about', 'services', 'projects', 'process', 'why', 'contact'];
const widths = [320, 375, 414, 768, 1280];

test.describe.configure({ timeout: 120000 });

test('responsive navigation, imagery, and page states are healthy', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}`));

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
    await expect(page.locator('#page-home')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();

    for (const pageName of pages) {
      await page.evaluate(name => navigateTo(name), pageName);
      await expect(page.locator(`#page-${pageName}`)).toBeVisible();
      await page.locator(`#page-${pageName}`).evaluate(element => element.scrollTop = element.scrollHeight);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    }
  }

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.locator('.menu-trigger').click();
  await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
  await expect(page.locator('.menu-trigger')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.menu-trigger').click();
  await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);

  await page.evaluate(() => navigateTo('projects'));
  await page.locator('[data-filter="residential"]').click();
  await expect(page.locator('.project-item[data-category="commercial"]').first()).toBeHidden();
  await expect(page.locator('.project-item[data-category="residential"]').first()).toBeVisible();

  await page.evaluate(() => navigateTo('contact'));
  await page.locator('#sendEmailButton').click();
  expect(await page.locator('#contactForm').evaluate(form => form.checkValidity())).toBeFalsy();

  const badApiResponse = await page.request.post('http://127.0.0.1:3000/api/contact', { data: {} });
  expect(badApiResponse.status()).toBe(400);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('all rendered image sources load', async ({ page }) => {
  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  for (const pageName of pages) {
    await page.evaluate(name => navigateTo(name), pageName);
    await page.locator(`#page-${pageName}`).evaluate(element => element.scrollIntoView({ block: 'end' }));
  }
  const brokenImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.complete && image.naturalWidth === 0)
    .map(image => image.getAttribute('src')));
  expect(brokenImages).toEqual([]);
});
