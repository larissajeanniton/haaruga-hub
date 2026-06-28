// Vercel serverless function: emails contact-request nudges via Brevo.
// Triggered by the site after a request is made (type:"request") or approved (type:"approved").
// Reads emails/contact server-side with the Supabase service-role key, so nothing sensitive is exposed to the browser.
//
// Required Vercel environment variables:
//   SUPABASE_URL                 e.g. https://lhmzsbhwtdwpuncrdvvc.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase -> Settings -> API -> service_role (SECRET)
//   BREVO_API_KEY                Brevo -> SMTP & API -> API Keys

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const BREVO_KEY = process.env.BREVO_API_KEY;
  const SENDER = { name: 'HaAruga Hub', email: 'larissa.jeanniton@gmail.com' };
  const SITE = 'https://haaruga-hub.vercel.app';

  if (!SUPABASE_URL || !SERVICE_KEY || !BREVO_KEY) { res.status(500).json({ error: 'Server not configured' }); return; }

  const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  const getProfile = async (id) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${id}&select=first_name,last_name,email,contact_email,phone,whatsapp,instagram`, { headers: sbHeaders });
    const a = await r.json();
    return Array.isArray(a) ? a[0] : null;
  };
  const sendEmail = async (to, subject, html) => {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: SENDER, to: [{ email: to }], subject, htmlContent: html })
    });
  };

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // Diagnostic: POST {"test":true} — sends a test email to the sender address and reports
    // exactly what Brevo replied (status + message). Safe: only ever emails the configured sender.
    if (body.test) {
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: SENDER, to: [{ email: SENDER.email }], subject: 'HaAruga test email', htmlContent: '<p>Test from the contact-notify function.</p>' })
      });
      const txt = await r.text();
      res.status(200).json({ test: true, brevoStatus: r.status, brevoBody: txt.slice(0, 600), sender: SENDER.email });
      return;
    }

    const { requestId, type } = body;
    if (!requestId || !type) { res.status(400).json({ error: 'Missing fields' }); return; }

    const crRes = await fetch(`${SUPABASE_URL}/rest/v1/contact_requests?id=eq.${requestId}&select=owner_id,requester_id,requester_name,status`, { headers: sbHeaders });
    const crArr = await crRes.json();
    const cr = Array.isArray(crArr) ? crArr[0] : null;
    if (!cr) { res.status(404).json({ error: 'Request not found' }); return; }

    if (type === 'request' && cr.status === 'pending') {
      const owner = await getProfile(cr.owner_id);
      if (owner && owner.email) {
        await sendEmail(owner.email,
          'Someone wants your contact info · מישהו מבקש את פרטי הקשר שלכם',
          `<p>Hi ${owner.first_name || ''},</p>
           <p><strong>${cr.requester_name || 'Someone'}</strong> would like your contact info on the HaAruga hub. Approve or decline it on your profile page.</p>
           <p style="color:#6b6b5e;">‏${cr.requester_name || 'מישהו'} מבקש/ת את פרטי הקשר שלכם במרכז הערוגה. אפשר לאשר או לדחות בעמוד הפרופיל.</p>
           <p><a href="${SITE}" style="color:#c0392b;">Open the hub → / פתחו את המרכז</a></p>`);
      }
    } else if (type === 'approved' && cr.status === 'approved') {
      const owner = await getProfile(cr.owner_id);
      const requester = await getProfile(cr.requester_id);
      if (requester && requester.email && owner) {
        const lines = [];
        if (owner.contact_email) lines.push(`Email: ${owner.contact_email}`);
        if (owner.whatsapp) lines.push(`WhatsApp: +${owner.whatsapp}`);
        if (owner.phone) lines.push(`Phone: ${owner.phone}`);
        if (owner.instagram) lines.push(`Instagram: @${owner.instagram}`);
        await sendEmail(requester.email,
          `${owner.first_name || 'Your contact'} approved your request · אושרה הבקשה שלכם`,
          `<p><strong>${owner.first_name || ''} ${owner.last_name || ''}</strong> approved your contact request on the HaAruga hub:</p>
           <p>${lines.join('<br>') || '(no details listed)'}</p>
           <p style="color:#6b6b5e;">‏הבקשה שלכם לפרטי קשר אושרה. הפרטים מופיעים למעלה.</p>
           <p>Reach out and make something together. 🎬</p>`);
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
