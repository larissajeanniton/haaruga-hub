// Reached only via the one-time "Approve & send" link in the admin's review
// email (see digest-prepare.js). GET so it works as a plain email link.
// Sends the already-compiled digest to every row in `subscribers`, then marks
// the included posts + this digest run as done so they never go out twice.

import { wrapEmailHtml, sendBrevoEmail } from './_digest-lib.js';

const SENDER = { name: 'Bama Hub', email: 'hello@bamahub.co.il' };
const SITE = 'https://bamahub.co.il';

function page(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
  <body style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:480px;margin:60px auto;padding:0 20px;color:#2b2b24;">
  <h2 style="font-family:Georgia,serif;font-weight:400;">${title}</h2>${bodyHtml}
  <p style="margin-top:24px;"><a href="${SITE}" style="color:#c0392b;">← Back to Bama Hub</a></p></body></html>`;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY || !BREVO_KEY) { res.status(500).send(page('Not configured', '<p>Missing server environment variables.</p>')); return; }

  const token = (req.query && req.query.token) || '';
  if (!token) { res.status(400).send(page('Missing link', '<p>This link is missing its token.</p>')); return; }

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init && init.headers) } });

  try {
    const runRes = await sb(`digest_runs?select=*&token=eq.${encodeURIComponent(token)}&limit=1`);
    const runs = await runRes.json();
    const run = Array.isArray(runs) ? runs[0] : null;
    if (!run) { res.status(404).send(page('Link not found', '<p>This approval link is invalid or already used.</p>')); return; }
    if (run.status !== 'pending') {
      res.status(200).send(page('Already handled', `<p>This digest was already marked <strong>${run.status}</strong> on ${new Date(run.resolved_at).toLocaleString()}.</p>`));
      return;
    }

    const subsRes = await sb('subscribers?select=id,email');
    const subscribers = await subsRes.json();
    const list = Array.isArray(subscribers) ? subscribers : [];

    // Send in small concurrent batches (not all at once, not one-by-one) so a
    // large subscriber list still finishes comfortably inside the function's
    // execution time limit.
    let sent = 0, failed = 0;
    const BATCH_SIZE = 10;
    for (let i = 0; i < list.length; i += BATCH_SIZE) {
      const batch = list.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(s => {
        const footer = `You're getting this because you subscribed to the Bama Hub newsletter.<br><a href="${SITE}/api/unsubscribe?id=${s.id}" style="color:#9a9a8c;">Unsubscribe</a>`;
        const html = wrapEmailHtml({ title: run.subject, bodyHtml: run.html, footerHtml: footer, preheader: run.subject });
        return sendBrevoEmail({ apiKey: BREVO_KEY, sender: SENDER, to: s.email, subject: run.subject, html });
      }));
      for (const r of results) { if (r.status === 'fulfilled') sent++; else failed++; }
    }

    const ids = Array.isArray(run.post_ids) ? run.post_ids : [];
    if (ids.length) {
      const orFilter = ids.map(id => `id.eq.${id}`).join(',');
      await sb(`posts?or=(${orFilter})`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ digested_at: new Date().toISOString() })
      });
    }

    await sb(`digest_runs?id=eq.${run.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'sent', resolved_at: new Date().toISOString(), recipient_count: sent })
    });

    res.status(200).send(page('✅ Sent!', `<p>Sent to <strong>${sent}</strong> subscriber${sent === 1 ? '' : 's'}${failed ? ` (${failed} failed — check Brevo)` : ''}.</p>`));
  } catch (e) {
    res.status(500).send(page('Something went wrong', `<p>${String(e)}</p>`));
  }
}
