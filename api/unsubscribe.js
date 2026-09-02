// One-click unsubscribe link included in every digest email. `id` is the
// subscriber's row id (a UUID — effectively unguessable, same pattern most
// small transactional-email setups use instead of a separate secret token).

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
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(500).send(page('Not configured', '<p>Missing server environment variables.</p>')); return; }

  const id = (req.query && req.query.id) || '';
  if (!id) { res.status(400).send(page('Missing link', '<p>This link is missing its subscriber id.</p>')); return; }

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/subscribers?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: sbHeaders });
    if (!r.ok) { res.status(500).send(page('Something went wrong', `<p>${await r.text()}</p>`)); return; }
    res.status(200).send(page("You're unsubscribed", '<p>You won’t get the Bama Hub weekly digest anymore. You can re-subscribe any time from the Bulletin page.</p>'));
  } catch (e) {
    res.status(500).send(page('Something went wrong', `<p>${String(e)}</p>`));
  }
}
