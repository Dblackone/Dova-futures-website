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
const axeSource = require("fs").readFileSync(
  require.resolve("axe-core/axe.min.js"),
  "utf8",
);

async function injectAxe(page) {
  await page.route("**/__axe.js", (route) =>
    route.fulfill({
      contentType: "application/javascript; charset=utf-8",
      body: axeSource,
    }),
  );
  await page.addScriptTag({ url: `${BASE_URL}/__axe.js` });
}

test.describe.configure({ timeout: 120_000 });

test("history, merged project aliases and keyboard menu work", async ({
  page,
}) => {
  await page.goto(BASE_URL);
  await page.evaluate(() => navigateTo("about"));
  await page.reload();
  await expect(page.locator("#page-about")).toBeVisible();
  await page.evaluate(() => navigateTo("projects"));
  await page
    .locator('#projectsGrid [data-project="body-shop-nigeria"]')
    .click();
  await expect(page.locator("#projectDetail")).toContainText(
    "Ikeja City Mall & Circle Mall",
  );
  await page.goBack();
  await expect(page.locator("#projectsGrid")).toBeVisible();
  await expect(page.locator("#projectDetail")).toBeHidden();
  await page.goForward();
  await expect(page.locator("#projectDetail")).toBeVisible();
  await page.locator('#projectDetail [data-navigate="contact"]').click();
  await page.reload();
  await expect(page.locator("#page-contact")).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.locator(".menu-trigger").focus();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement.closest("#mobileMenu")),
    ),
  ).toBe(false);
  await page.locator(".menu-trigger").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#mobileMenu")).toBeHidden();
  await expect(page.locator(".menu-trigger")).toBeFocused();
  await page.goto(BASE_URL + "/?project=alko-home-yaba");
  await expect(page.locator("#projectDetail")).toContainText("Alcove Homes");
  await page.goto(BASE_URL + "/?project=premium-residential-interior");
  await expect(page.locator("#projectDetail")).toContainText("Crown Estate");
});

test("missing project script cannot leak form fields into a GET URL", async ({
  page,
}) => {
  await page.route("**/data/projects.js", (route) => route.abort());
  let method;
  await page.route("**/api/contact", (route) => {
    method = route.request().method();
    return route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({ success: true, message: "Enquiry received." }),
    });
  });
  await page.goto(BASE_URL + "/?page=contact");
  await page.locator("#firstName").fill("QA");
  await page.locator("#lastName").fill("Only");
  await page.locator("#email").fill("qa@example.com");
  await page.locator("#projectType").selectOption("Other");
  await page.locator("#message").fill("Intercepted only");
  await page.locator("#sendEmailButton").click();
  await expect(page.locator("#formStatus")).toContainText("received");
  expect(method).toBe("POST");
  expect(page.url()).not.toContain("firstName");
});

test("all sections, project detail and card pass automated WCAG checks", async ({
  page,
}) => {
  await page.goto(BASE_URL);
  await injectAxe(page);
  const issues = [];
  for (const name of pages) {
    await page.evaluate((n) => navigateTo(n), name);
    await page.waitForTimeout(500);
    const result = await page.evaluate(() =>
      axe.run(document, {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
        },
      }),
    );
    issues.push(
      ...result.violations.map((v) => ({
        page: name,
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    );
  }
  await page.evaluate(() => openProject("alcove-homes-yaba"));
  await page.waitForTimeout(500);
  let result = await page.evaluate(() =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  issues.push(
    ...result.violations.map((v) => ({
      page: "detail",
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  await page.goto(BASE_URL + "/vollmann/");
  await injectAxe(page);
  result = await page.evaluate(() =>
    axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"],
      },
    }),
  );
  issues.push(
    ...result.violations.map((v) => ({
      page: "card",
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  );
  expect(issues).toEqual([]);
});

test("server project metadata, sitemap, privacy and publication boundaries", async ({
  request,
}) => {
  const response = await request.get(BASE_URL + "/?project=alcove-homes-yaba");
  expect(await response.text()).toContain("<title>Alcove Homes");
  expect((await request.get(BASE_URL + "/sitemap.xml")).status()).toBe(200);
  expect((await request.get(BASE_URL + "/privacy.html")).status()).toBe(200);
  for (const path of [
    "/data/README.md",
    "/assets/README.md",
    "/.git/config",
    "/not-a-page",
    "/_pages/alcove-homes-yaba.html",
  ])
    expect((await request.get(BASE_URL + path)).status()).toBe(404);
});

test("responsive navigation, imagery, and page states are healthy", async ({
  page,
}) => {
  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on(
    "requestfailed",
    (request) =>
      request.failure()?.errorText !== "net::ERR_ABORTED" &&
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

test("project catalogue filters and opens a direct detail view", async ({
  page,
}) => {
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.evaluate(() => navigateTo("projects"));

  await expect(
    page.getByRole("link", { name: /View Ikotun 6-Flat Apartment/i }),
  ).toBeVisible();
  await expect(
    page
      .locator("#page-projects")
      .getByText("NGO Complex Landscape Development", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Landscape" }).click();
  const projectCatalogue = page.locator("#page-projects");
  await expect(
    projectCatalogue.locator('.project-item[data-category="landscape"]'),
  ).toBeVisible();
  await expect(
    projectCatalogue
      .locator('.project-item[data-category="commercial"]')
      .first(),
  ).toBeHidden();

  await page.getByRole("button", { name: "All work" }).click();
  await page
    .getByRole("link", { name: /View Ikotun 6-Flat Apartment/i })
    .click();
  await expect(page.locator("#projectDetail")).toBeVisible();
  await expect(page.locator("#projectDetail")).toContainText(
    "Carcass Completed",
  );
  await expect(page).toHaveURL(/\?project=ikotun-6-flat-apartment$/);

  await page.goto(`${BASE_URL}/?project=body-shop-circle-mall`, {
    waitUntil: "networkidle",
  });
  await expect(page.locator("#projectDetail")).toContainText(
    "The Body Shop Nigeria",
  );
  await expect(page.locator("#projectDetail .project-gallery img")).toHaveCount(
    3,
  );
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

  await expect(page.locator("#formStatus")).toContainText(
    "Message sent successfully.",
  );
  expect(submittedPayload.projectType).toBe("Residential");
});

test("backend health, validation, and source-file isolation are correct", async ({
  request,
}) => {
  const homepage = await request.get(BASE_URL);
  expect(homepage.headers()["content-security-policy"]).toContain(
    "default-src 'self'",
  );

  const health = await request.get(`${BASE_URL}/api/health`);
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok" });
  expect(health.headers()["x-content-type-options"]).toBe("nosniff");

  const invalid = await request.post(`${BASE_URL}/api/contact`, { data: {} });
  expect(invalid.status()).toBe(400);

  const sourceAttempt = await request.get(`${BASE_URL}/worker.mjs`);
  expect(sourceAttempt.status()).toBe(404);
  expect(await sourceAttempt.text()).not.toContain("deliverContactEmail");
});

test("personal digital card exposes working contact and portfolio actions", async ({
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

  for (const width of [320, 375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("http://127.0.0.1:3000/vollmann/", {
      waitUntil: "networkidle",
    });
    await expect(
      page.getByRole("heading", { name: /Vollmann Akarakiri/i }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }

  await expect(
    page.getByRole("link", { name: /Open full portfolio/i }),
  ).toHaveAttribute("href", "../assets/vollmann-akarakiri-portfolio.pdf");
  await expect(
    page.getByRole("link", { name: /Save contact/i }),
  ).toHaveAttribute("download", "");
  await expect(page.getByRole("link", { name: /Call ·/i })).toHaveAttribute(
    "href",
    "tel:+2348163675439",
  );
  await expect(page.getByRole("link", { name: /Email ·/i })).toHaveAttribute(
    "href",
    "mailto:vollmannakarakiri0@gmail.com",
  );
  await expect(page.getByRole("img", { name: /QR code/i })).toHaveAttribute(
    "src",
    "qr-vollmann.svg",
  );
  await expect(
    page.getByRole("link", { name: /Open Vollmann Akarakiri's digital card/i }),
  ).toHaveAttribute("href", "https://dovafutures.com/vollmann/");

  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Sharing unavailable", "NotAllowedError");
      },
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value) => {
          window.__copiedCardUrl = value;
        },
      },
    });
  });
  await page.getByRole("button", { name: /Share this card/i }).click();
  await expect(page.locator("#shareStatus")).toHaveText("Card link copied.");
  expect(await page.evaluate(() => window.__copiedCardUrl)).toBe(
    "https://dovafutures.com/vollmann/",
  );

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new DOMException("Clipboard unavailable", "NotAllowedError");
        },
      },
    });
  });
  await page.getByRole("button", { name: /Share this card/i }).click();
  await expect(page.locator("#shareStatus")).toHaveText(
    "Copy this link: dovafutures.com/vollmann/",
  );

  await page.locator(".contact-link").first().focus();
  const focusColours = await page
    .locator(".contact-link")
    .first()
    .evaluate((element) => ({
      outline: getComputedStyle(element).outlineColor,
      contactText: getComputedStyle(element.closest(".contact")).color,
    }));
  expect(focusColours.outline).toBe(focusColours.contactText);

  for (const asset of [
    {
      path: "/vollmann/vollmann-akarakiri.vcf",
      type: "text/x-vcard",
      signature: "BEGIN:VCARD",
    },
    {
      path: "/vollmann/og-vollmann.png",
      type: "image/png",
      signature: "89504e470d0a1a0a",
    },
    {
      path: "/vollmann/qr-vollmann.svg",
      type: "image/svg+xml",
      signature: "<?xml",
    },
    {
      path: "/assets/vollmann-akarakiri-portfolio.pdf",
      type: "application/pdf",
      signature: "25504446",
    },
    {
      path: "/assets/vollmann-akarakiri-construction-portfolio.pdf",
      type: "application/pdf",
      signature: "25504446",
    },
    {
      path: "/assets/vollmann-akarakiri-interior-portfolio.pdf",
      type: "application/pdf",
      signature: "25504446",
    },
  ]) {
    const response = await page.request.get(
      `http://127.0.0.1:3000${asset.path}`,
    );
    const body = await response.body();
    expect(response.ok(), `${asset.path} should load`).toBeTruthy();
    expect(response.headers()["content-type"]).toContain(asset.type);
    if (asset.type === "text/x-vcard" || asset.type === "image/svg+xml") {
      expect(body.toString("utf8").startsWith(asset.signature)).toBeTruthy();
    } else {
      expect(body.subarray(0, asset.signature.length / 2).toString("hex")).toBe(
        asset.signature,
      );
    }
  }

  const brokenImages = await page
    .locator("img")
    .evaluateAll((images) =>
      images
        .filter((image) => image.complete && image.naturalWidth === 0)
        .map((image) => image.getAttribute("src")),
    );
  expect(brokenImages).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});
