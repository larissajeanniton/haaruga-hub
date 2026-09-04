# Bama Hub — Newsletter: Where We Stand & Plan

Written 2026-09-04, updated the same day after the security-hardening pass.
Read this before touching anything newsletter-related.

> **Pending, not yet deployed (as of 2026-09-04):** a separate security-audit
> session has uncommitted hardening edits in the working tree that touch the
> newsletter: subscribe now goes through `/api/subscribe` with **double opt-in**
> (POST `{email}` sends a confirm link; GET `?token=` confirms), `digest-send`
> only mails rows with `confirmed_at` set, `digest-prepare` requires a new
> **`CRON_SECRET`** env var, the `#digest` admin backdoor is gone, and the root
> `_digest-lib.js` was folded into `api/_digest-lib.js` and deleted. Section 4
> and the plan below assume those land.

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

1. **Newer digest template is merged but not wired.** `api/_digest-lib.js`
   now carries the greeting line, the "Connect with <first name> →" link per
   post, and `digestSubject` / `digestTitleHtml` ("This week on Bama Hub: N new
   posts!"). `digest-prepare.js` still uses the old fixed subject and does not
   call those helpers.
2. **Dead manual flow still in `index.html`.** The admin "Build newsletter →
   Copy for Brevo" modal predates the automation and should be removed (the
   `#digest` hash backdoor is already gone in the hardening edits).
3. **`MAINTENANCE-AND-ROADMAP.md` is stale.** Still says haaruga-hub.vercel.app,
   a Gmail sender, and "paste into Brevo".
4. **No MX record on `bamahub.co.il`.** Replies to `hello@bamahub.co.il` bounce.
   Either add a reply-to of Larissa's Gmail in the sender config or set up
   forwarding for the domain.
5. **First cron run unconfirmed.** The cron should have fired Thursday
   2026-09-03. Only Larissa's inbox can confirm a review email arrived.
6. **`CRON_SECRET` must be added in Vercel before the hardening deploys.**
   Without it `digest-prepare` will reject the Thursday cron call and the
   review email stops. Vercel → project → Settings → Environment Variables.
7. **Existing subscribers have no `confirmed_at`.** After the double opt-in
   change, `digest-send` skips unconfirmed rows, so anyone who subscribed before
   the change gets nothing until backfilled or re-confirmed.

---

## 5. Plan

### Step 0 — Confirm the pipeline actually ran (Larissa, 2 min)
Check the inbox (and spam) for a **"Bama Hub weekly digest"** email from
Thursday 2026-09-03. If it arrived, the system works and only steps 1–4 remain.
If it did not, that is the first bug to chase: Vercel → project → Cron Jobs →
last run status.

### Step 0b — Land the hardening safely (Larissa + Meir, 15 min)
Strict order, because pushing to `main` auto-deploys production within a minute:
1. Larissa runs `supabase-security-hardening.sql` in Supabase → SQL Editor
   (it also adds the new `sending` status that `digest-send` now uses to claim
   a run before mailing, so a double-click on Approve can't send twice).
2. Larissa adds `CRON_SECRET` in Vercel → project → Settings → Environment
   Variables (loose end 6).
3. Only then push `index.html`, `api/`, `vercel.json`, and the updated
   `MAINTENANCE-AND-ROADMAP.md`.
4. Decide what to do with existing `subscribers` rows (loose end 7): either set
   `confirmed_at = now()` for the handful of known-good emails, or leave them
   and have them re-subscribe.

Meir's Supabase access token does not cover this project, so step 1 must be
done from Larissa's Supabase login (or Meir gets added to her org first).

### Step 1 — Wire the newer template (20 min)
- In `digest-prepare.js`, use `digestSubject(posts.length)` for the stored
  subject and `digestTitleHtml(posts.length)` for the on-screen heading (the
  helpers already exist in `api/_digest-lib.js`).
- Add a `replyTo` of Larissa's Gmail to every `sendBrevoEmail` call (fixes
  loose end 4 without DNS work).
- Do this only after the security session's edits are committed, to avoid
  editing the same files twice.

### Step 2 — Remove the dead manual flow (15 min)
Delete the `digestModal`, `openDigest` / `copyDigest` / `refreshDigestButton`
functions and the `#digestBtn` button from `index.html`. Keep `ADMIN_EMAILS`
only if something else uses it. Same rule: wait for the hardening edits to be
committed first.

### Step 2b — Test the subscribe flow end to end (10 min)
After deploy: subscribe with a test address on the Bulletin page, confirm the
double opt-in email arrives and the link sets `confirmed_at`, then unsubscribe
from a digest link and confirm the row is gone.

### Step 3 — Turn on and check analytics (10 min, Larissa in Brevo)
Brevo → Transactional → Settings: confirm **open tracking** and **click
tracking** are enabled. After the first real send, confirm numbers appear under
Transactional → Statistics.

### Step 4 — Update the runbook (10 min)
Fix `MAINTENANCE-AND-ROADMAP.md`: live URL is www.bamahub.co.il, sender is
hello@bamahub.co.il, the newsletter is automated (no more pasting into Brevo),
subscribers must confirm by email, `CRON_SECRET` is a fourth required env var,
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
