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

test('personal digital card exposes working contact and portfolio actions', async ({ page }) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}`));

  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://127.0.0.1:3000/vollmann/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: /Vollmann Akarakiri/i })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  }

  await expect(page.getByRole('link', { name: /Open full portfolio/i })).toHaveAttribute('href', '../assets/vollmann-akarakiri-portfolio.pdf');
  await expect(page.getByRole('link', { name: /Save contact/i })).toHaveAttribute('download', '');
  await expect(page.getByRole('link', { name: /Call ·/i })).toHaveAttribute('href', 'tel:+2348163675439');
  await expect(page.getByRole('link', { name: /Email ·/i })).toHaveAttribute('href', 'mailto:vollmannakarakiri0@gmail.com');
  await expect(page.getByRole('img', { name: /QR code/i })).toHaveAttribute('src', 'qr-vollmann.svg');
  await expect(page.getByRole('link', { name: /Open Vollmann Akarakiri's digital card/i })).toHaveAttribute('href', 'https://dovafutures.com/vollmann/');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async () => { throw new DOMException('Sharing unavailable', 'NotAllowedError'); }
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async value => { window.__copiedCardUrl = value; } }
    });
  });
  await page.getByRole('button', { name: /Share this card/i }).click();
  await expect(page.locator('#shareStatus')).toHaveText('Card link copied.');
  expect(await page.evaluate(() => window.__copiedCardUrl)).toBe('https://dovafutures.com/vollmann/');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new DOMException('Clipboard unavailable', 'NotAllowedError'); } }
    });
  });
  await page.getByRole('button', { name: /Share this card/i }).click();
  await expect(page.locator('#shareStatus')).toHaveText('Copy this link: dovafutures.com/vollmann/');

  await page.locator('.contact-link').first().focus();
  const focusColours = await page.locator('.contact-link').first().evaluate(element => ({
    outline: getComputedStyle(element).outlineColor,
    contactText: getComputedStyle(element.closest('.contact')).color
  }));
  expect(focusColours.outline).toBe(focusColours.contactText);

  for (const asset of [
    { path: '/vollmann/vollmann-akarakiri.vcf', type: 'text/x-vcard', signature: 'BEGIN:VCARD\r\n' },
    { path: '/vollmann/og-vollmann.png', type: 'image/png', signature: '89504e470d0a1a0a' },
    { path: '/vollmann/qr-vollmann.svg', type: 'image/svg+xml', signature: '<?xml' },
    { path: '/assets/vollmann-akarakiri-portfolio.pdf', type: 'application/pdf', signature: '25504446' },
    { path: '/assets/vollmann-akarakiri-construction-portfolio.pdf', type: 'application/pdf', signature: '25504446' },
    { path: '/assets/vollmann-akarakiri-interior-portfolio.pdf', type: 'application/pdf', signature: '25504446' }
  ]) {
    const response = await page.request.get(`http://127.0.0.1:3000${asset.path}`);
    const body = await response.body();
    expect(response.ok(), `${asset.path} should load`).toBeTruthy();
    expect(response.headers()['content-type']).toContain(asset.type);
    if (asset.type === 'text/x-vcard' || asset.type === 'image/svg+xml') {
      expect(body.toString('utf8').startsWith(asset.signature)).toBeTruthy();
    } else {
      expect(body.subarray(0, asset.signature.length / 2).toString('hex')).toBe(asset.signature);
    }
  }

  const brokenImages = await page.locator('img').evaluateAll(images => images
    .filter(image => image.complete && image.naturalWidth === 0)
    .map(image => image.getAttribute('src')));
  expect(brokenImages).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
