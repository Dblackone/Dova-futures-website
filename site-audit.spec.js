const { test, expect } = require("@playwright/test");

const BASE_URL = "http://127.0.0.1:3000";
const pages = [
  "home",
  "about",
  "services",
  "projects",
  "process",
  "why",
  "contact",
];
const widths = [320, 375, 414, 768, 1280];

test.describe.configure({ timeout: 120_000 });

test("responsive navigation, imagery, and page states are healthy", async ({
  page,
}) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) =>
    failedRequests.push(`${request.method()} ${request.url()}`),
  );

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await expect(page.locator("#page-home")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();

    for (const pageName of pages) {
      await page.evaluate((name) => navigateTo(name), pageName);
      await expect(page.locator(`#page-${pageName}`)).toBeVisible();
      await page
        .locator(`#page-${pageName}`)
        .evaluate((element) => element.scrollIntoView({ block: "end" }));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBeTruthy();
    }
  }

  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.locator(".menu-trigger").click();
  await expect(page.locator("#mobileMenu")).toHaveClass(/active/);
  await expect(page.locator(".menu-trigger")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator(".menu-trigger").click();
  await expect(page.locator("#mobileMenu")).not.toHaveClass(/active/);

  await page.evaluate(() => navigateTo("projects"));
  await page.locator('[data-filter="residential"]').click();
  await expect(
    page.locator('.project-item[data-category="commercial"]').first(),
  ).toBeHidden();
  await expect(
    page.locator('.project-item[data-category="residential"]').first(),
  ).toBeVisible();

  await page.evaluate(() => navigateTo("contact"));
  await page.locator("#sendEmailButton").click();
  expect(
    await page.locator("#contactForm").evaluate((form) => form.checkValidity()),
  ).toBeFalsy();

  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test("all rendered image sources load within the asset budget", async ({
  page,
}) => {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  for (const pageName of pages) {
    await page.evaluate((name) => navigateTo(name), pageName);
    await page
      .locator(`#page-${pageName}`)
      .evaluate((element) => element.scrollIntoView({ block: "end" }));
    await page.waitForTimeout(100);
  }

  const brokenImages = await page
    .locator("img")
    .evaluateAll((images) =>
      images
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    );
  expect(brokenImages).toEqual([]);

  const imageTransferBytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.initiatorType === "img")
      .reduce((total, entry) => total + entry.transferSize, 0),
  );
  expect(imageTransferBytes).toBeLessThan(4 * 1024 * 1024);
});

test("contact form uses the backend contract and reports success", async ({
  page,
}) => {
  let submittedPayload;
  await page.route("**/api/contact", async (route) => {
    submittedPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        message: "Message sent successfully.",
      }),
    });
  });

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => navigateTo("contact"));
  await page.locator("#firstName").fill("Ada");
  await page.locator("#lastName").fill("Lovelace");
  await page.locator("#email").fill("ada@example.com");
  await page.locator("#projectType").selectOption({ label: "Residential" });
  await page.locator("#message").fill("A family home in Lagos.");
  await page.locator("#sendEmailButton").click();

  await expect(page.locator("#formStatus")).toContainText("has been sent");
  expect(submittedPayload.projectType).toBe("Residential");
});

test("backend health, validation, and source-file isolation are correct", async ({
  request,
}) => {
  const health = await request.get(`${BASE_URL}/api/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");

  const invalid = await request.post(`${BASE_URL}/api/contact`, { data: {} });
  expect(invalid.status()).toBe(400);

  const sourceAttempt = await request.get(`${BASE_URL}/server.js`);
  expect(sourceAttempt.status()).toBe(404);
  expect(await sourceAttempt.text()).not.toContain("createMailTransport");
});
