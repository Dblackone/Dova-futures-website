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

const rateLimitWindows = new Map();

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

function withinRateLimit(request, env) {
  const limit = Number(env.CONTACT_RATE_LIMIT || 5);
  const windowMs = 15 * 60 * 1000;
  const now = Date.now();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const key = `contact:${ip}`;
  const entry = rateLimitWindows.get(key);
  if (!entry || now >= entry.resetAt) {
    rateLimitWindows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}

async function deliverContactEmail(payload, env) {
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
    },
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
}

export async function handleApiRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/api/health" && request.method === "GET") {
    return json({ status: "ok" });
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
      .startsWith("application/json")
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
  if (!withinRateLimit(request, env)) {
    return json(
      {
        success: false,
        message: "Too many enquiries. Please try again later.",
      },
      429,
    );
  }
  if (Number(request.headers.get("Content-Length") || 0) > 32 * 1024) {
    return json({ success: false, message: "Request body is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      { success: false, message: "Request body is not valid JSON." },
      400,
    );
  }
  const validation = validateContactPayload(body);
  if (validation.isSpam)
    return json({ success: true, message: "Message accepted." });
  if (validation.error)
    return json({ success: false, message: validation.error }, 400);

  try {
    await deliverContactEmail(validation.payload, env);
    return json({ success: true, message: "Message sent successfully." });
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return handleApiRequest(request, env);
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404 || /\.[^/]+$/.test(url.pathname))
      return response;
    return env.ASSETS.fetch(new URL("/index.html", request.url));
  },
};
