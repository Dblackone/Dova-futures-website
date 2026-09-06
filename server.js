"use strict";

require("dotenv").config();

const path = require("path");
const compression = require("compression");
const express = require("express");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const nodemailer = require("nodemailer");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT || 3000);
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

function cleanText(value, maxLength, multiline = false) {
  let text = String(value ?? "").replace(/\r\n?/g, "\n");
  text = multiline
    ? text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    : text.replace(/[\u0000-\u001f\u007f]/g, " ");
  return text.trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function validateContactPayload(body = {}) {
  const payload = Object.fromEntries(
    Object.entries(FIELD_LIMITS).map(([field, maxLength]) => [
      field,
      cleanText(body[field], maxLength, field === "message"),
    ]),
  );

  if (payload.website) {
    return { isSpam: true, payload };
  }

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

  const emailPattern = /^[^\s@\r\n]+@[^\s@\r\n]+\.[^\s@\r\n]+$/;
  if (!emailPattern.test(payload.email)) {
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

function createMailTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 50,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function createEmailSender(transport = createMailTransport()) {
  const to = process.env.CONTACT_TO_EMAIL || "info@dovafutures.com";
  const from = process.env.CONTACT_FROM_EMAIL || "no-reply@dovafutures.com";

  return async function sendContactEmail(payload) {
    if (!transport) {
      throw new Error("Email delivery is not configured");
    }

    const fullName = `${payload.firstName} ${payload.lastName}`;
    const safe = Object.fromEntries(
      Object.entries(payload).map(([key, value]) => [key, escapeHtml(value)]),
    );

    await transport.sendMail({
      from,
      to,
      replyTo: payload.email,
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
      html: `
        <h2>New website enquiry</h2>
        <p><strong>Name:</strong> ${safe.firstName} ${safe.lastName}</p>
        <p><strong>Email:</strong> ${safe.email}</p>
        <p><strong>Phone:</strong> ${safe.phone || "Not provided"}</p>
        <p><strong>Project type:</strong> ${safe.projectType}</p>
        <p><strong>Details:</strong></p>
        <p>${safe.message.replace(/\r?\n/g, "<br>")}</p>
      `,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
  };
}

function isAllowedOrigin(req) {
  const origin = req.get("origin");
  if (!origin) return true;

  const configuredOrigins = String(process.env.CONTACT_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  try {
    const originUrl = new URL(origin);
    return (
      originUrl.host === req.get("host") ||
      configuredOrigins.includes(originUrl.origin)
    );
  } catch {
    return false;
  }
}

function createApp(options = {}) {
  const app = express();
  const sendContactEmail = options.sendContactEmail || createEmailSender();
  const contactRateLimit = Number(
    options.contactRateLimit || process.env.CONTACT_RATE_LIMIT || 5,
  );

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "32kb", strict: true }));
  app.use((error, _req, res, next) => {
    if (error?.type === "entity.too.large") {
      return res
        .status(413)
        .json({ success: false, message: "Request body is too large." });
    }
    if (error instanceof SyntaxError && "body" in error) {
      return res
        .status(400)
        .json({ success: false, message: "Request body is not valid JSON." });
    }
    return next(error);
  });

  app.get("/api/health", (_req, res) => {
    res.set("Cache-Control", "no-store").json({ status: "ok" });
  });

  app.post(
    "/api/contact",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: contactRateLimit,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: {
        success: false,
        message: "Too many enquiries. Please try again later.",
      },
    }),
    async (req, res) => {
      res.set("Cache-Control", "no-store");

      if (!req.is("application/json")) {
        return res.status(415).json({
          success: false,
          message: "Content-Type must be application/json.",
        });
      }

      if (!isAllowedOrigin(req)) {
        return res
          .status(403)
          .json({ success: false, message: "Request origin is not allowed." });
      }

      const validation = validateContactPayload(req.body);
      if (validation.isSpam) {
        return res.json({ success: true, message: "Message accepted." });
      }
      if (validation.error) {
        return res
          .status(400)
          .json({ success: false, message: validation.error });
      }

      try {
        await sendContactEmail(validation.payload);
        return res.json({
          success: true,
          message: "Message sent successfully.",
        });
      } catch (error) {
        console.error("[contact-delivery-failed]", {
          message:
            error instanceof Error ? error.message : "Unknown delivery error",
        });
        return res.status(503).json({
          success: false,
          message:
            "Email delivery is temporarily unavailable. Please use WhatsApp or try again later.",
        });
      }
    },
  );

  app.use(
    "/assets",
    express.static(path.join(ROOT_DIR, "assets"), {
      dotfiles: "deny",
      etag: true,
      fallthrough: false,
      maxAge: "30d",
    }),
  );

  app.get("/tokens.css", (_req, res) => {
    res.set("Cache-Control", "public, max-age=2592000");
    return res.sendFile(path.join(ROOT_DIR, "tokens.css"));
  });

  app.get(["/vollmann", "/vollmann/"], (_req, res) => {
    res.set("Cache-Control", "no-cache");
    return res.sendFile(path.join(ROOT_DIR, "vollmann", "index.html"));
  });

  app.use(
    "/vollmann",
    express.static(path.join(ROOT_DIR, "vollmann"), {
      dotfiles: "deny",
      etag: true,
      fallthrough: false,
      index: false,
      maxAge: "30d",
    }),
  );

  app.use("/api", (_req, res) => {
    res
      .status(404)
      .json({ success: false, message: "API endpoint not found." });
  });

  app.get("/{*path}", (_req, res) => {
    if (path.extname(_req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    res.set("Cache-Control", "no-cache");
    return res.sendFile(path.join(ROOT_DIR, "index.html"));
  });

  return app;
}

const app = createApp();

if (require.main === module) {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Dova Futures website listening on port ${PORT}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; closing HTTP server`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

module.exports = {
  createApp,
  createEmailSender,
  escapeHtml,
  validateContactPayload,
};
