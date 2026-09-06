"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const request = require("supertest");

const {
  createApp,
  createEmailSender,
  escapeHtml,
  validateContactPayload,
} = require("./server");

const validPayload = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+234 800 000 0000",
  projectType: "Residential",
  message: "A new family home in Lagos.",
  website: "",
};

test("health check and security headers are available", async () => {
  const app = createApp({
    sendContactEmail: async () => {},
    contactRateLimit: 100,
  });
  const response = await request(app).get("/api/health").expect(200);

  assert.deepEqual(response.body, { status: "ok" });
  assert.equal(response.headers["x-content-type-options"], "nosniff");
  assert.equal(response.headers["x-powered-by"], undefined);
  assert.match(
    response.headers["content-security-policy"],
    /default-src 'self'/,
  );
});

test("server files are not exposed by the static site", async () => {
  const app = createApp({
    sendContactEmail: async () => {},
    contactRateLimit: 100,
  });
  const response = await request(app).get("/server.js").expect(404);

  assert.doesNotMatch(response.text, /createMailTransport/);
});

test("valid contact enquiries are normalized and delivered", async () => {
  let delivered;
  const app = createApp({
    sendContactEmail: async (payload) => {
      delivered = payload;
    },
    contactRateLimit: 100,
  });

  const response = await request(app)
    .post("/api/contact")
    .set("Origin", "https://dovafutures.com")
    .set("Host", "dovafutures.com")
    .send({ ...validPayload, firstName: "  Ada  " })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(delivered.firstName, "Ada");
});

test("invalid, oversized, and cross-origin enquiries are rejected", async () => {
  const app = createApp({
    sendContactEmail: async () => {},
    contactRateLimit: 100,
  });

  await request(app).post("/api/contact").send({}).expect(400);
  await request(app)
    .post("/api/contact")
    .send({ ...validPayload, projectType: "Unknown" })
    .expect(400);
  await request(app)
    .post("/api/contact")
    .send({ ...validPayload, message: "x".repeat(5001) })
    .expect(400);
  await request(app)
    .post("/api/contact")
    .set("Origin", "https://attacker.example")
    .send(validPayload)
    .expect(403);

  await request(app)
    .post("/api/contact")
    .set("Content-Type", "application/json")
    .send('{"broken"')
    .expect(400);

  await request(app)
    .post("/api/contact")
    .set("Content-Type", "application/json")
    .send(JSON.stringify({ message: "x".repeat(40_000) }))
    .expect(413);
});

test("honeypot submissions are accepted without delivery", async () => {
  let deliveryCount = 0;
  const app = createApp({
    sendContactEmail: async () => {
      deliveryCount += 1;
    },
    contactRateLimit: 100,
  });

  const response = await request(app)
    .post("/api/contact")
    .send({ ...validPayload, website: "https://spam.example" })
    .expect(200);

  assert.equal(response.body.success, true);
  assert.equal(deliveryCount, 0);
});

test("delivery failures use a safe service-unavailable response", async () => {
  const app = createApp({
    sendContactEmail: async () => {
      throw new Error("SMTP secret detail");
    },
    contactRateLimit: 100,
  });

  const response = await request(app)
    .post("/api/contact")
    .send(validPayload)
    .expect(503);
  assert.equal(response.body.success, false);
  assert.doesNotMatch(response.text, /SMTP secret detail/);
});

test("email HTML is escaped and external access is disabled", async () => {
  let message;
  const transport = {
    sendMail: async (payload) => {
      message = payload;
    },
  };
  const sendEmail = createEmailSender(transport);

  await sendEmail({ ...validPayload, firstName: "<script>alert(1)</script>" });

  assert.doesNotMatch(message.html, /<script>/);
  assert.match(message.html, /&lt;script&gt;/);
  assert.equal(message.disableFileAccess, true);
  assert.equal(message.disableUrlAccess, true);
});

test("validation and escaping helpers handle hostile input", () => {
  assert.equal(
    validateContactPayload({
      ...validPayload,
      email: "a@example.com\r\nBcc:x@y.com",
    }).error,
    "Please enter a valid email address.",
  );
  assert.equal(escapeHtml("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
});
