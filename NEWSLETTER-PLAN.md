# Bama Hub — Newsletter: Where We Stand & Plan

Written 2026-09-04. Read this before touching anything newsletter-related.

---

## 1. Decision: keep Brevo, but only as the mail pipe

Brevo is **not** the newsletter system. It is the thing that physically delivers
email. Everything else — the branded template, the subscriber list, the weekly
schedule, the approve/skip step, unsubscribe — already lives in this repo and in
Supabase. Nothing needs rebuilding.

Brevo still does two jobs we cannot drop:

1. **Login emails.** Supabase auth sends its magic-link emails through Brevo's
   SMTP. Supabase's built-in mailer is capped at a few emails per hour, so a real
   SMTP provider is mandatory.
2. **Transactional sends.** The contact-request nudges and the weekly digest are
   sent through Brevo's API (`api/*.js`).

Brevo's template builder, contact lists, and campaign tools are **unused**. We do
not paste anything into Brevo anymore. Free tier (300 emails/day) is plenty.

---

## 2. What is already built and verified live (2026-09-04)

Verified against https://www.bamahub.co.il, DNS, and the Supabase REST API.

| Piece | Status |
|---|---|
| Branded HTML digest template (bilingual, RTL-aware) | Built — `api/_digest-lib.js` |
| Weekly cron, Thursdays 06:00 UTC → `/api/digest-prepare` | Configured — `vercel.json` |
| Review email to admin with **Approve & send** / **Skip** links | Built — `digest-prepare.js`, `digest-send.js`, `digest-skip.js` |
| Subscribe box on Bulletin page → `subscribers` table | Built — `index.html` |
| Unsubscribe link in every digest → `/api/unsubscribe` | Built |
| Vercel env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`) | Set — all 5 endpoints answer "Missing link", not "Not configured" |
| DB tables `subscribers`, `reports`, `digest_runs`, column `posts.digested_at` | Exist — `supabase-fixes.sql` was run |
| Brevo domain authentication for `bamahub.co.il` | Complete — ownership TXT, brevo1/brevo2 DKIM CNAMEs, DMARC |

**Flow:** Thursday morning Larissa gets a preview email. She clicks Approve →
every row in `subscribers` gets the digest. She clicks Skip → nothing sends and
the posts roll into next week. Nothing reaches subscribers without that click.

---

## 3. Where analytics and list management live

- **Delivered / opened / clicked:** Brevo → Transactional → Statistics. Also
  available through the Brevo API (`GET /v3/smtp/statistics/*`), so Claude can
  pull a weekly report if the API key is available in the session. *Not yet
  verified:* that open/click tracking is switched on in Brevo's transactional
  settings.
- **Subscriber list, resubscribe, manual removal:** Supabase table
  `subscribers`. Managed via the Supabase dashboard or SQL. Brevo's contact
  lists are not involved at all.

---

## 4. Loose ends (not blockers)

1. **Newer digest template is sitting unused.** The root-level `_digest-lib.js`
   is a newer version than the deployed `api/_digest-lib.js`: adds a warm
   greeting line, a "Connect with <first name> →" link per post, and a
   "This week on Bama Hub: N new posts!" subject. It is not in `api/` and its
   helpers (`digestSubject`, `digestTitleHtml`) are not wired into
   `digest-prepare.js`.
2. **Dead manual flow still in `index.html`.** The admin "Build newsletter →
   Copy for Brevo" modal predates the automation and should be removed.
3. **`MAINTENANCE-AND-ROADMAP.md` is stale.** Still says haaruga-hub.vercel.app,
   a Gmail sender, and "paste into Brevo".
4. **No MX record on `bamahub.co.il`.** Replies to `hello@bamahub.co.il` bounce.
   Either add a reply-to of Larissa's Gmail in the sender config or set up
   forwarding for the domain.
5. **First cron run unconfirmed.** The cron should have fired Thursday
   2026-09-03. Only Larissa's inbox can confirm a review email arrived.

---

## 5. Plan

### Step 0 — Confirm the pipeline actually ran (Larissa, 2 min)
Check the inbox (and spam) for a **"Bama Hub weekly digest"** email from
Thursday 2026-09-03. If it arrived, the system works and only steps 1–4 remain.
If it did not, that is the first bug to chase: Vercel → project → Cron Jobs →
last run status.

### Step 1 — Ship the newer template (30 min)
- Move root `_digest-lib.js` into `api/_digest-lib.js` (replace the old one).
- In `digest-prepare.js`, use `digestSubject(posts.length)` for the stored
  subject and `digestTitleHtml(...)` for the on-screen heading.
- Delete the root-level copy so there is one source of truth.
- Add a `replyTo` of Larissa's Gmail to every `sendBrevoEmail` call (fixes
  loose end 4 without DNS work).

### Step 2 — Remove the dead manual flow (15 min)
Delete the `digestModal`, `openDigest` / `copyDigest` / `refreshDigestButton`
functions and the `#digestBtn` button from `index.html`. Keep `ADMIN_EMAILS`
only if something else uses it.

### Step 3 — Turn on and check analytics (10 min, Larissa in Brevo)
Brevo → Transactional → Settings: confirm **open tracking** and **click
tracking** are enabled. After the first real send, confirm numbers appear under
Transactional → Statistics.

### Step 4 — Update the runbook (10 min)
Fix `MAINTENANCE-AND-ROADMAP.md`: live URL is www.bamahub.co.il, sender is
hello@bamahub.co.il, the newsletter is automated (no more pasting into Brevo),
and add "check Brevo statistics" as a monthly item.

### Later (optional)
- Go fully automatic (no weekly Approve click) once a few weeks have sent
  cleanly: have `digest-prepare.js` call the send logic directly.
- Weekly analytics summary pulled from the Brevo API into a short report.

---

## 6. Things that cannot be done from Meir's machine

- The **Vercel project and GitHub repo are in Larissa's accounts**. Meir's
  Vercel CLI cannot read env vars or cron logs for this site. (An empty
  `haaruga-hub` project was accidentally created under Meir's `meir-labs` team
  on 2026-09-04 and should be deleted from the Vercel dashboard — it has no
  deployments.)
- The Supabase project for this site is `lhmzsbhwtdwpuncrdvvc`. Any Supabase
  MCP connection on Meir's machine points at a different project; use the
  Supabase dashboard or REST with the site's anon key instead.
