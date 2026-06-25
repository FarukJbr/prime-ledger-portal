// Vercel serverless function — receives incoming WhatsApp messages from Twilio
// and relays them to Supabase, where the actual logic (receipt OCR via Claude,
// account matching, record creation) happens.
//
// Why this file exists here and not in Supabase: Twilio needs a public URL to
// POST incoming messages to. Supabase Edge Functions weren't available when
// this was built, but this site is already on Vercel — which supports this
// exact thing (a serverless function alongside the static site) with zero
// extra hosting needed.
//
// Why image handling happens HERE and not in Supabase: Postgres' http
// extension can't reliably carry raw binary image bytes (confirmed by testing
// — a real image got truncated to 8 bytes when fetched that way). Node.js
// handles binary safely, so the image is downloaded and base64-encoded here,
// then passed to Supabase as plain text (base64 is ASCII-safe).
//
// Setup needed in Vercel (Project Settings -> Environment Variables):
//   TWILIO_ACCOUNT_SID  — from your Twilio console
//   TWILIO_AUTH_TOKEN   — from your Twilio console
// (No Anthropic key needed here — that stays safely in Supabase Vault, never
// touches this file or Vercel's environment.)

const SUPABASE_URL = 'https://urpzikwromhwtuffkhyr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycHppa3dyb21od3R1ZmZraHlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5Njk4MDEsImV4cCI6MjA5NTU0NTgwMX0.lnnmGDSkQ8hPR0QGP2WnJAhDO2qIZSfJWaXh15c7Obo';

export default async function handler(req, res) {
  // Always answer Twilio with empty, valid TwiML — regardless of what happens
  // inside. We send any actual replies ourselves via the Twilio API from
  // Supabase, not via the TwiML response, so this just needs to be a clean 200.
  const replyEmptyTwiML = () => {
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  };

  try {
    if (req.method !== 'POST') {
      return replyEmptyTwiML();
    }

    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body || {};

    let imageBase64 = null;
    let imageType = null;

    if (NumMedia && parseInt(NumMedia, 10) > 0 && MediaUrl0) {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      const imgResp = await fetch(MediaUrl0, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });

      if (imgResp.ok) {
        const arrayBuffer = await imgResp.arrayBuffer();
        imageBase64 = Buffer.from(arrayBuffer).toString('base64');
        imageType = MediaContentType0 || imgResp.headers.get('content-type') || 'image/jpeg';
      }
    }

    await fetch(`${SUPABASE_URL}/rest/v1/rpc/handle_whatsapp_message`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_from: From || '',
        p_body: Body || '',
        p_image_base64: imageBase64,
        p_image_type: imageType,
      }),
    });

    return replyEmptyTwiML();
  } catch (err) {
    console.error('whatsapp-webhook error:', err);
    return replyEmptyTwiML();
  }
}
