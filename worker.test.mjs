import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  processEnquiry,
  maintainEnquiries,
  rateLimit,
} from "./enquiry-store.mjs";
import worker from "./worker.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync("migrations/0001_enquiries.sql", "utf8"));
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      let args = [];
      const query = {
        bind(...values) {
          args = values;
          return query;
        },
        async first() {
          return stmt.get(...args) || null;
        },
        async run() {
          return stmt.run(...args);
        },
        async all() {
          return { results: stmt.all(...args) };
        },
      };
      return query;
    },
    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
  };
}

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
  DB: database(),
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
      "Idempotency-Key": crypto.randomUUID(),
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
  assert.equal(response.status, 202);
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

test("schema rejects null, arrays, wrong types and unknown fields", async () => {
  for (const payload of [
    null,
    [],
    true,
    123,
    { ...validPayload, firstName: {} },
    { ...validPayload, lastName: [] },
    { ...validPayload, extra: "x" },
  ]) {
    assert.equal(
      (await handleApiRequest(contactRequest(payload), env)).status,
      400,
    );
  }
});
test("body limit measures actual bytes and content type is exact", async () => {
  assert.equal(
    (
      await handleApiRequest(
        contactRequest({ ...validPayload, extra: "x".repeat(40000) }),
        env,
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await handleApiRequest(
        contactRequest(validPayload, {
          "Content-Type": "application/json-junk",
        }),
        env,
      )
    ).status,
    415,
  );
});
test("durable rate limit is shared and expires by window", async () => {
  const local = { ...env, DB: database(), CONTACT_RATE_LIMIT: "2" },
    r = contactRequest(validPayload);
  assert.equal(await rateLimit(r, local), true);
  assert.equal(await rateLimit(r, { ...local }), true);
  assert.equal(await rateLimit(r, local), false);
});
test("provider failure saves enquiry; retry uses same idempotency key", async (t) => {
  const local = { ...env, DB: database() },
    id = crypto.randomUUID();
  let calls = 0,
    keys = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    keys.push(options.headers["Idempotency-Key"]);
    if (calls === 1) throw new Error("offline");
    return Response.json({ id: "provider-test" });
  });
  const response = await handleApiRequest(
    contactRequest(validPayload, { "Idempotency-Key": id }),
    local,
  );
  assert.equal(response.status, 202);
  let row = await local.DB.prepare("SELECT * FROM enquiries WHERE id=?")
    .bind(id)
    .first();
  assert.equal(row.status, "pending");
  await local.DB.prepare("UPDATE enquiries SET next_attempt=0 WHERE id=?")
    .bind(id)
    .run();
  row = await local.DB.prepare("SELECT * FROM enquiries WHERE id=?")
    .bind(id)
    .first();
  const { deliverContactEmail } = await import("./worker.mjs");
  await processEnquiry(row, local, deliverContactEmail);
  assert.deepEqual(keys, ["enquiry/" + id, "enquiry/" + id]);
  const repeat = await handleApiRequest(
    contactRequest(validPayload, { "Idempotency-Key": id }),
    local,
  );
  assert.equal(repeat.status, 202);
  assert.equal(calls, 2);
  const conflict = await handleApiRequest(
    contactRequest(
      { ...validPayload, message: "different" },
      { "Idempotency-Key": id },
    ),
    local,
  );
  assert.equal(conflict.status, 409);
});
test("scheduled delivery tracking and retention use persisted records", async (t) => {
  const local = { ...env, DB: database() },
    now = Date.now();
  await local.DB.prepare(
    "INSERT INTO enquiries(id,payload_hash,payload,created_at,next_attempt,status,provider_id) VALUES ('track','h','{}',?,0,'submitted','email')",
  )
    .bind(now)
    .run();
  await local.DB.prepare(
    "INSERT INTO enquiries(id,payload_hash,payload,created_at,next_attempt,status) VALUES ('old','h','{}',?,0,'delivered')",
  )
    .bind(now - 8 * 86400000)
    .run();
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ last_event: "delivered" }),
  );
  await maintainEnquiries(local, () => {
    throw Error("Unexpected send");
  });
  assert.equal(
    (
      await local.DB.prepare(
        "SELECT status FROM enquiries WHERE id='track'",
      ).first()
    ).status,
    "delivered",
  );
  assert.equal(
    await local.DB.prepare("SELECT * FROM enquiries WHERE id='old'").first(),
    null,
  );
});
test("canonical redirects and unknown paths do not become homepages", async () => {
  const e = {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  };
  assert.equal(
    (await worker.fetch(new Request("http://dovafutures.com/"), e)).headers.get(
      "Location",
    ),
    "https://dovafutures.com/",
  );
  assert.equal(
    (await worker.fetch(new Request("https://www.dovafutures.com/"), e)).status,
    308,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://dovafutures.com/?project=body-shop-ikeja"),
        e,
      )
    ).headers.get("Location"),
    "https://dovafutures.com/?project=body-shop-nigeria",
  );
  assert.equal(
    (await worker.fetch(new Request("https://dovafutures.com/no-such-page"), e))
      .status,
    404,
  );
  assert.equal(
    (
      await worker.fetch(
        new Request("https://dovafutures.com/?project=no-such-project"),
        e,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await handleApiRequest(
        new Request("https://dovafutures.com/api/ready"),
        {},
      )
    ).status,
    503,
  );
});
