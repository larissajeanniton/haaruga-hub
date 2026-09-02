// Shared helpers for the weekly-digest serverless functions.
// Mirrors the logic in index.html's "Newsletter digest builder" (search that file
// for POST_TYPES / isHebrew / esc) so the emailed digest looks the same as the
// in-app preview. Kept as one small file so admin-preview and subscriber-send
// can't drift apart.

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function isHebrew(text) { return /[֐-׿]/.test(text || ''); }

export const POST_TYPES = {
  screening: { icon: '\u{1F3A5}', en: 'Screening', he: 'הקרנה' },
  crew:      { icon: '\u{1F3AC}', en: 'Crew Needed', he: 'דרוש צוות' },
  cast:      { icon: '\u{1F3AD}', en: 'Cast Needed', he: 'דרושים שחקנים' },
  space:     { icon: '\u{1F3E0}', en: 'Resource', he: 'משאב' },
  other:     { icon: '\u{1F4CC}', en: 'Notice', he: 'הודעה' }
};

const SITE = 'https://bamahub.co.il';

// One post -> one HTML block, in its own original language/direction. Links to
// the poster's profile so a reader can request their contact info in one click
// from the email, then a second click there to actually send the request (same
// approve/decline flow the site already uses — this doesn't hand out anyone's
// email directly, it just jumps straight to where they'd ask for it).
export function postBlockHtml(p) {
  const he = isHebrew((p.title || '') + ' ' + (p.details || ''));
  const t = POST_TYPES[p.type] || POST_TYPES.other;
  const label = he ? t.he : t.en;
  const date = (p.created_at || '').slice(0, 10);
  const byline = [esc(p.author_name || ''), esc(p.track || ''), date].filter(Boolean).join(' · ');
  const firstName = (p.author_name || '').trim().split(/\s+/)[0] || (he ? 'המפרסם/ת' : 'the poster');
  const connectLink = p.author_id
    ? `<a href="${SITE}/profile/${encodeURIComponent(p.author_id)}" style="font-size:12.5px;color:#c0392b;text-decoration:none;font-weight:500;">${he ? `✉ יצירת קשר עם ${esc(firstName)}` : `✉ Connect with ${esc(firstName)}`} →</a>`
    : '';
  return `<div dir="${he ? 'rtl' : 'ltr'}" style="padding:0 0 16px;margin-bottom:16px;border-bottom:1px solid #e5e2d8;text-align:${he ? 'right' : 'left'};">
    <div style="font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:#c0392b;font-weight:600;margin-bottom:4px;">${t.icon} ${esc(label)}</div>
    <h3 style="font-family:Georgia,'Playfair Display',serif;font-weight:400;font-size:17px;margin:0 0 4px;color:#2b2b24;">${esc(p.title || '')}</h3>
    <p style="font-size:14px;color:#5c5c50;line-height:1.6;margin:0 0 8px;">${esc(p.details || '').replace(/\n/g, '<br>')}</p>
    <div style="font-size:11px;color:#8a8a7c;margin-bottom:6px;">${byline}</div>
    ${connectLink}
  </div>`;
}

// A short, warm intro line above the posts — so subscribers get a friendly note,
// not a raw list. The post count lives in the subject/title instead (see
// digest-prepare.js), so this stays a fixed, charming line.
export function digestGreeting() {
  return `<p style="font-family:Georgia,'Playfair Display',serif;font-style:italic;font-size:15px;color:#4a5c4e;line-height:1.6;margin:0 0 18px;">Every great film starts with the right people finding each other. Stay in the loop.</p>`;
}

// Full compiled digest body (used both for the admin preview email and the real send).
export function digestBodyHtml(posts) {
  if (!posts.length) return '<p style="font-size:14px;color:#5c5c50;">No new posts this week.</p>';
  return digestGreeting() + posts.map(postBlockHtml).join('');
}

// Plain-text subject line (used as the actual email Subject header — must stay
// plain text, no HTML) and the same wording as HTML with the count in red, used
// for the on-screen heading a subscriber sees.
export function digestSubject(count) {
  return `This week on Bama Hub: ${count} new post${count === 1 ? '' : 's'}!`;
}
export function digestTitleHtml(count) {
  return `This week on Bama Hub: <span style="color:#c0392b;">${count}</span> new post${count === 1 ? '' : 's'}!`;
}

// Wrap a body in the shared email shell (simple, inline-styled — safe across email clients).
// `titleHtml`, when given, is trusted HTML (e.g. to color part of the heading)
// and takes over from the plain-text `title` — which still gets escaped normally
// when titleHtml isn't provided.
export function wrapEmailHtml({ preheader = '', title, titleHtml, bodyHtml, ctaHtml = '', footerHtml = '' }) {
  const heading = titleHtml || esc(title);
  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;background:#faf8f2;padding:32px 24px;">
    <span style="display:none;font-size:0;color:#faf8f2;">${esc(preheader)}</span>
    <h2 style="font-family:Georgia,'Playfair Display',serif;font-weight:400;font-size:22px;margin:0 0 20px;color:#2b2b24;">${heading}</h2>
    <div style="background:#fff;border:1px solid #e5e2d8;border-radius:6px;padding:20px;">${bodyHtml}</div>
    ${ctaHtml}
    <div style="margin-top:24px;font-size:11px;color:#9a9a8c;line-height:1.6;">${footerHtml}</div>
  </div>`;
}

export async function sendBrevoEmail({ apiKey, sender, to, subject, html }) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html })
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Brevo send failed (${r.status}): ${body.slice(0, 300)}`);
  }
}

export function randomToken() {
  const bytes = new Uint8Array(32);
  (globalThis.crypto || require('crypto').webcrypto).getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
