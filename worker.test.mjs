import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeHtml,
  handleApiRequest,
  validateContactPayload,
} from "./worker.mjs";

const validPayload = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+234 800 000 0000",
  projectType: "Residential",
  message: "A new family home in Lagos.",
  website: "",
};

const env = {
  CONTACT_RATE_LIMIT: "100",
  RESEND_API_KEY: "test-key",
  CONTACT_TO_EMAIL: "info@dovafutures.com",
  CONTACT_FROM_EMAIL: "Dova Futures <no-reply@dovafutures.com>",
};

function contactRequest(payload, headers = {}) {
  return new Request("https://dovafutures.com/api/contact", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": crypto.randomUUID(),
      ...headers,
    },
    body: JSON.stringify(payload),
  });
}

test("health check returns a non-cacheable success response", async () => {
  const response = await handleApiRequest(
    new Request("https://dovafutures.com/api/health"),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
});

test("valid contact enquiries are normalized and sent through Resend", async (t) => {
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return new Response(JSON.stringify({ id: "email_123" }), { status: 200 });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const response = await handleApiRequest(
    contactRequest({ ...validPayload, firstName: "  Ada  " }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).success, true);
  assert.equal(sent.reply_to, "ada@example.com");
  assert.match(sent.html, /Ada/);
});

test("invalid, cross-origin, and oversized enquiries are rejected", async () => {
  assert.equal((await handleApiRequest(contactRequest({}), env)).status, 400);
  assert.equal(
    (
      await handleApiRequest(
        contactRequest(validPayload, { Origin: "https://attacker.example" }),
        env,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleApiRequest(
        contactRequest({ ...validPayload, message: "x".repeat(5001) }),
        env,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await handleApiRequest(
        contactRequest(validPayload, { "Content-Length": "40000" }),
        env,
      )
    ).status,
    413,
  );
});

test("honeypot submissions never trigger email delivery", async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response();
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const response = await handleApiRequest(
    contactRequest({ ...validPayload, website: "https://spam.example" }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 0);
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
