// api/send-email.js — Gmail SMTP
const nodemailer = require('nodemailer');

const INTERNAL_SECRET = process.env.EMAIL_INTERNAL_SECRET || 'pl-internal-2026';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = req.headers['x-internal-secret'];
  if (secret !== INTERNAL_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  const { to, subject, html } = req.body;
  if (!to || !subject || !html) return res.status(400).json({ error: 'Missing fields' });
  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS
      }
    });
    await transporter.sendMail({
      from: `"פריים לדג'ר" <${process.env.GMAIL_USER}>`,
      to, subject, html
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Email error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
