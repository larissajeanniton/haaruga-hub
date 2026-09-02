// Vercel Cron target: runs weekly (see vercel.json's "crons"), compiles the new
// bulletin posts since the last digest into a preview, and emails the admin an
// Approve & Send / Skip link. Nothing goes to subscribers from this function —
// that only happens if the admin clicks Approve (see digest-send.js).
//
// Safe to hit more than once: if a digest is already waiting for a decision,
// this just no-ops instead of sending a second review email.
//
// Required Vercel environment variables (same three contact-notify.js already needs):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BREVO_API_KEY

import { digestBodyHtml, wrapEmailHtml, sendBrevoEmail, randomToken } from './_digest-lib.js';

const ADMIN_EMAIL = 'larissa.jeanniton@gmail.com';
const SENDER = { name: 'Bama Hub', email: 'hello@bamahub.co.il' };
const SITE = 'https://bamahub.co.il';

export default async function handler(req, res) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY || !BREVO_KEY) { res.status(500).json({ error: 'Server not configured' }); return; }

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const sb = (path, init) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...sbHeaders, ...(init && init.headers) } });

  try {
    // Don't stack a second review email if one is already waiting on a decision.
    const pendingRes = await sb('digest_runs?select=id&status=eq.pending&order=created_at.desc&limit=1');
    const pending = await pendingRes.json();
    if (Array.isArray(pending) && pending.length) {
      res.status(200).json({ ok: true, skipped: 'a digest is already pending approval', id: pending[0].id });
      return;
    }

    const postsRes = await sb('posts?select=*&digested_at=is.null&order=created_at.asc');
    const posts = await postsRes.json();
    if (!Array.isArray(posts)) { res.status(500).json({ error: 'Could not load posts' }); return; }

    const subsCountRes = await sb('subscribers?select=id', { headers: { Prefer: 'count=exact' } });
    const subsRange = subsCountRes.headers.get('content-range') || '';
    const subCount = Number(subsRange.split('/')[1] || 0);

    if (!posts.length) {
      await sendBrevoEmail({
        apiKey: BREVO_KEY, sender: SENDER, to: ADMIN_EMAIL,
        subject: 'Bama Hub weekly digest — nothing new this week',
        html: wrapEmailHtml({
          title: 'No new bulletin posts this week',
          bodyHtml: `<p style="font-size:14px;color:#5c5c50;">No posts were added to the bulletin since the last digest, so nothing was sent to your ${subCount} subscriber${subCount === 1 ? '' : 's'}. Next check is next Thursday.</p>`
        })
      });
      res.status(200).json({ ok: true, sent: 0, note: 'no new posts — admin notified, nothing to approve' });
      return;
    }

    const token = randomToken();
    const publicSubject = `Bama Hub — this week's bulletin`;
    const bodyHtml = digestBodyHtml(posts);

    const insertRes = await sb('digest_runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ post_ids: posts.map(p => p.id), subject: publicSubject, html: bodyHtml, token, status: 'pending' })
    });
    if (!insertRes.ok) { res.status(500).json({ error: 'Could not save digest run', detail: await insertRes.text() }); return; }

    await sendBrevoEmail({
      apiKey: BREVO_KEY, sender: SENDER, to: ADMIN_EMAIL,
      subject: `Bama Hub weekly digest ready — ${posts.length} new post${posts.length === 1 ? '' : 's'} (review & approve)`,
      html: wrapEmailHtml({
        title: `This week's digest is ready to review`,
        bodyHtml: `<p style="font-size:14px;color:#5c5c50;margin:0 0 16px;">${posts.length} new post${posts.length === 1 ? '' : 's'} since the last digest. Preview below — this is exactly what your ${subCount} subscriber${subCount === 1 ? '' : 's'} will get.</p>${bodyHtml}`,
        ctaHtml: `<div style="margin-top:20px;text-align:center;">
          <a href="${SITE}/api/digest-send?token=${token}" style="display:inline-block;background:#c0392b;color:#fff;text-decoration:none;padding:12px 28px;border-radius:4px;font-size:14px;margin:0 6px 8px;">✅ Approve &amp; send to ${subCount} subscriber${subCount === 1 ? '' : 's'}</a><br>
          <a href="${SITE}/api/digest-skip?token=${token}" style="display:inline-block;color:#8a8a7c;text-decoration:underline;font-size:13px;margin-top:8px;">Skip this week (posts roll into next week)</a>
        </div>`
      })
    });

    res.status(200).json({ ok: true, prepared: posts.length, token });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
