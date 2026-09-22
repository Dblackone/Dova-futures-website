const PROJECT_TYPES = new Set([
  "Residential",
  "Commercial",
  "Industrial",
  "Infrastructure",
  "Interior Finishing",
  "Other",
]);

const FIELD_LIMITS = {
  firstName: 80,
  lastName: 80,
  email: 254,
  phone: 40,
  projectType: 40,
  message: 5000,
  website: 200,
};

import projects from "./data/projects.json" with { type: "json" };
import aliases from "./data/project-aliases.json" with { type: "json" };
import {
  rateLimit,
  saveEnquiry,
  processEnquiry,
  maintainEnquiries,
} from "./enquiry-store.mjs";

function cleanText(value, maxLength, multiline = false) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  text = multiline
    ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    : text.replace(/[\u0000-\u001f\u007f]/g, " ");
  return text.trim().slice(0, maxLength);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function validateContactPayload(body = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    return { error: "Request must be a JSON object." };
  if (Object.keys(body).some((key) => !Object.hasOwn(FIELD_LIMITS, key)))
    return { error: "Unexpected request field." };
  if (
    Object.keys(FIELD_LIMITS).some(
      (key) => body[key] !== undefined && typeof body[key] !== "string",
    )
  )
    return { error: "Contact fields must be text." };
  const payload = Object.fromEntries(
    Object.entries(FIELD_LIMITS).map(([field, maxLength]) => [
      field,
      cleanText(body[field], maxLength, field === "message"),
    ]),
  );

  if (payload.website) return { isSpam: true, payload };

  const requiredFields = [
    "firstName",
    "lastName",
    "email",
    "projectType",
    "message",
  ];
  if (requiredFields.some((field) => !payload[field])) {
    return { error: "Please complete all required fields." };
  }

  if (!/^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/.test(payload.email)) {
    return { error: "Please enter a valid email address." };
  }
  if (!PROJECT_TYPES.has(payload.projectType)) {
    return { error: "Please select a valid project type." };
  }
  for (const [field, maxLength] of Object.entries(FIELD_LIMITS)) {
    if (String(body[field] ?? "").trim().length > maxLength) {
      return { error: `${field} is too long.` };
    }
  }
  return { payload };
}

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=UTF-8",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      ...headers,
    },
  });
}

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  const allowed = String(env.CONTACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  try {
    return origin === new URL(request.url).origin || allowed.includes(origin);
  } catch {
    return false;
  }
}

export async function deliverContactEmail(payload, env, id) {
  if (!env.RESEND_API_KEY) throw new Error("Email delivery is not configured");

  const fullName = `${payload.firstName} ${payload.lastName}`;
  const safe = Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)]),
  );
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `enquiry/${id}`,
    },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL || "Dova Futures <no-reply@dovafutures.com>",
      to: [env.CONTACT_TO_EMAIL || "info@dovafutures.com"],
      reply_to: payload.email,
      subject: `Website inquiry: ${payload.projectType} | ${fullName}`,
      text: [
        "New website enquiry",
        "",
        `Name: ${fullName}`,
        `Email: ${payload.email}`,
        `Phone: ${payload.phone || "Not provided"}`,
        `Project type: ${payload.projectType}`,
        "",
        "Details:",
        payload.message,
      ].join("\n"),
      html: `<h2>New website enquiry</h2><p><strong>Name:</strong> ${safe.firstName} ${safe.lastName}</p><p><strong>Email:</strong> ${safe.email}</p><p><strong>Phone:</strong> ${safe.phone || "Not provided"}</p><p><strong>Project type:</strong> ${safe.projectType}</p><p><strong>Details:</strong></p><p>${safe.message.replace(/\n/g, "<br>")}</p>`,
    }),
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
  const result = await response.json();
  if (typeof result.id !== "string" || !result.id)
    throw new Error("Invalid provider response");
  return result.id;
}

async function readJson(request) {
  if (Number(request.headers.get("Content-Length")) > 32768)
    throw Object.assign(new Error("Request body is too large."), {
      status: 413,
    });
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request body");
  let bytes = 0;
  const chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 32768) {
        await reader.cancel();
        throw Object.assign(new Error("Request body is too large."), {
          status: 413,
        });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
}

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ status: "ok" });
  }
  if (url.pathname === "/api/ready" && request.method === "GET") {
    try {
      if (!env.DB || !env.RESEND_API_KEY)
        throw new Error("Configuration missing");
      await env.DB.prepare("SELECT id FROM enquiries LIMIT 1").first();
      const trouble = await env.DB.prepare(
        "SELECT COUNT(*) AS count FROM enquiries WHERE status IN ('failed','bounced','complained') OR (status='pending' AND created_at < ?)",
      )
        .bind(Date.now() - 3600000)
        .first();
      return json(
        {
          status: trouble.count ? "degraded" : "ready",
          delivery: "Inbox delivery is monitored separately.",
        },
        trouble.count ? 503 : 200,
      );
    } catch {
      return json({ status: "unavailable" }, 503);
    }
  }
  if (url.pathname !== "/api/contact") {
    return json({ success: false, message: "API endpoint not found." }, 404);
  }
  if (request.method !== "POST") {
    return json({ success: false, message: "Method not allowed." }, 405, {
      Allow: "POST",
    });
  }
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .split(";")[0]
      .trim()
      .match(/^application\/json$/)
  ) {
    return json(
      { success: false, message: "Content-Type must be application/json." },
      415,
    );
  }
  if (!allowedOrigin(request, env)) {
    return json(
      { success: false, message: "Request origin is not allowed." },
      403,
    );
  }
  if (Number(request.headers.get("Content-Length") || 0) > 32 * 1024) {
    return json({ success: false, message: "Request body is too large." }, 413);
  }

  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return json(
      {
        success: false,
        message:
          error.status === 413
            ? error.message
            : "Request body is not valid JSON.",
      },
      error.status === 413 ? 413 : 400,
    );
  }
  const validation = validateContactPayload(body);
  if (validation.isSpam)
    return json({ success: true, message: "Message accepted." });
  if (validation.error)
    return json({ success: false, message: validation.error }, 400);

  try {
    if (!env.DB || !env.RESEND_API_KEY)
      throw new Error("Contact service not configured");
    const id = request.headers.get("Idempotency-Key");
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        id || "",
      )
    )
      return json(
        { success: false, message: "Please reload the form and try again." },
        400,
      );
    if (!(await rateLimit(request, env)))
      return json(
        {
          success: false,
          message: "Too many enquiries. Please try again in 15 minutes.",
        },
        429,
        { "Retry-After": "900" },
      );
    const saved = await saveEnquiry(id, validation.payload, env);
    if (!saved)
      return json(
        {
          success: false,
          message:
            "This submission reference has already been used. Please reload and try again.",
        },
        409,
      );
    await processEnquiry(saved, env, deliverContactEmail);
    return json(
      {
        success: true,
        message:
          "Thank you. Your enquiry has been received and saved for our team.",
      },
      202,
    );
  } catch (error) {
    console.error(
      "[contact-delivery-failed]",
      error instanceof Error ? error.message : "Unknown error",
    );
    return json(
      {
        success: false,
        message:
          "Email delivery is temporarily unavailable. Please use WhatsApp or try again later.",
      },
      503,
    );
  }
}

export default {
  async scheduled(_event, env) {
    await maintainEnquiries(env, deliverContactEmail);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (
      ["dovafutures.com", "www.dovafutures.com"].includes(url.hostname) &&
      (url.protocol !== "https:" || url.hostname !== "dovafutures.com")
    ) {
      url.protocol = "https:";
      url.hostname = "dovafutures.com";
      return Response.redirect(url.href, 308);
    }
    let response;
    if (url.pathname.startsWith("/api/"))
      response = await handleApiRequest(request, env);
    else if (!["GET", "HEAD"].includes(request.method))
      response = json({ message: "Method not allowed." }, 405, {
        Allow: "GET, HEAD",
      });
    else if (
      url.pathname.startsWith("/_pages/") ||
      url.pathname.includes("/.") ||
      /\.(md|toml|mjs|env)$/i.test(url.pathname)
    )
      response = new Response("Not found", { status: 404 });
    else {
      let assetUrl = new URL(request.url);
      if (["/", "/index.html"].includes(url.pathname)) {
        const id = url.searchParams.get("project");
        const page = url.searchParams.get("page");
        if (id && aliases[id]) {
          url.search = "?project=" + aliases[id];
          return Response.redirect(url.href, 301);
        }
        if (id) {
          if (!projects.some((p) => p.id === id && p.published !== false))
            return new Response(
              "Project not found. Browse https://dovafutures.com/?page=projects",
              {
                status: 404,
                headers: { "Content-Type": "text/plain; charset=utf-8" },
              },
            );
          assetUrl.pathname = "/_pages/" + id + ".html";
        } else if (page) {
          if (
            ![
              "home",
              "about",
              "services",
              "projects",
              "process",
              "why",
              "contact",
            ].includes(page)
          )
            return new Response("Page not found", { status: 404 });
          assetUrl.pathname = "/_pages/page-" + page + ".html";
        }
      }
      assetUrl.search = "";
      response = await env.ASSETS.fetch(
        new Request(assetUrl, { method: request.method }),
      );
      if (response.status === 404)
        response = new Response(
          "Page not found. Visit https://dovafutures.com/",
          {
            status: 404,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          },
        );
    }
    const headers = new Headers(response.headers);
    headers.set("Strict-Transport-Security", "max-age=31536000");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return new Response(response.body, { status: response.status, headers });
  },
};
