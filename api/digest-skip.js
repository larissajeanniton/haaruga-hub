// Reached via the "Skip this week" link in the admin's review email. Marks the
// digest run as skipped WITHOUT sending — the posts stay un-digested, so they
// automatically roll into next week's digest instead of being lost.

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

  const token = (req.query && req.query.token) || '';
  if (!token) { res.status(400).send(page('Missing link', '<p>This link is missing its token.</p>')); return; }

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init && init.headers) } });

  try {
    const runRes = await sb(`digest_runs?select=*&token=eq.${encodeURIComponent(token)}&limit=1`);
    const runs = await runRes.json();
    const run = Array.isArray(runs) ? runs[0] : null;
    if (!run) { res.status(404).send(page('Link not found', '<p>This link is invalid or already used.</p>')); return; }
    if (run.status !== 'pending') {
      res.status(200).send(page('Already handled', `<p>This digest was already marked <strong>${run.status}</strong>.</p>`));
      return;
    }

    await sb(`digest_runs?id=eq.${run.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'skipped', resolved_at: new Date().toISOString() })
    });

    res.status(200).send(page('Skipped', '<p>Nothing was sent. Those posts are still marked as new, so they’ll be included in next week’s digest automatically.</p>'));
  } catch (e) {
    res.status(500).send(page('Something went wrong', `<p>${String(e)}</p>`));
  }
}
