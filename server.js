require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || 'info@dovafutures.com';
const CONTACT_FROM_EMAIL = process.env.CONTACT_FROM_EMAIL || 'no-reply@dovafutures.com';

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

function validatePayload(payload = {}) {
  const requiredFields = ['firstName', 'lastName', 'email', 'projectType', 'message'];

  for (const field of requiredFields) {
    if (!String(payload[field] || '').trim()) {
      return `Missing required field: ${field}`;
    }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(payload.email).trim())) {
    return 'Invalid email format';
  }

  if (String(payload.website || '').trim()) {
    return 'Spam detected';
  }

  return '';
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error('SMTP credentials are not configured');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: { user, pass }
  });
}

app.post('/api/contact', async (req, res) => {
  const payload = req.body || {};
  const validationError = validatePayload(payload);

  if (validationError) {
    const statusCode = validationError === 'Spam detected' ? 200 : 400;
    return res.status(statusCode).json({
      success: validationError === 'Spam detected',
      message: validationError === 'Spam detected' ? 'Message accepted.' : validationError
    });
  }

  const {
    firstName,
    lastName,
    email,
    phone = 'Not provided',
    projectType,
    message
  } = payload;

  const fullName = `${firstName} ${lastName}`.trim();

  const htmlBody = `
    <h2>New Contact Form Submission</h2>
    <p><strong>Name:</strong> ${fullName}</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Phone:</strong> ${phone || 'Not provided'}</p>
    <p><strong>Project Type:</strong> ${projectType}</p>
    <p><strong>Details:</strong></p>
    <p>${String(message).replace(/\n/g, '<br>')}</p>
  `;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: CONTACT_FROM_EMAIL,
      to: CONTACT_TO_EMAIL,
      replyTo: email,
      subject: `Website Inquiry: ${projectType} | ${fullName}`,
      text: `New Contact Form Submission\n\nName: ${fullName}\nEmail: ${email}\nPhone: ${phone || 'Not provided'}\nProject Type: ${projectType}\n\nDetails:\n${message}`,
      html: htmlBody
    });

    return res.status(200).json({
      success: true,
      message: 'Message sent successfully.'
    });
  } catch (error) {
    console.error('[CONTACT_FORM_ERROR]', {
      message: error.message,
      stack: error.stack,
      payload: {
        firstName,
        lastName,
        email,
        phone,
        projectType
      }
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to send message.'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Dova Futures website running on http://localhost:${PORT}`);
});
