# HaAruga Hub — Admin Maintenance & Roadmap

Your one-stop reference for running the site after launch. Keep this file.
Last updated: 2026-09-01.

---

## 1. Your accounts at a glance

You log into four free services. Each does one job:

| Service | What it does | Where |
|---|---|---|
| **Vercel** | Hosts the live website | vercel.com → project `haaruga-hub` |
| **GitHub** | Stores the website code (master copy) | github.com → repo `haaruga-hub` |
| **Supabase** | Database, student logins, file storage | supabase.com → your project |
| **Brevo** | Sends the login emails (and future newsletter) | brevo.com |

- **Live site (share this):** https://haaruga-hub.vercel.app
- **Supabase project URL:** https://lhmzsbhwtdwpuncrdvvc.supabase.co
- **Brevo sender email:** larissa.jeanniton@gmail.com (display name: HaAruga)

---

## 2. Security rules — never break these

- [ ] **NEVER** put the **Brevo API key**, **Brevo SMTP key**, or **Supabase database password** into the website file (`index.html`) or share them in chat. They go ONLY into a service's dashboard.
- [ ] The **Supabase publishable/anon key** *is* safe to be public (it's in the site by design).
- [ ] Keep the security rules (RLS policies) in place — they ensure students can only edit *their own* profile/posts. Don't disable Row Level Security.

---

## 3. Right after the demo (cleanup)

- [x] **Remove the example student profiles.** Already done — the demo profiles
  (Maya, Ron, Tamar) are gone from `profiles`. Note: the SQL that used to be here
  (`delete from profiles where is_example = true`) referenced a column that was
  never actually added to the table, so if you ever need to bulk-remove seeded
  profiles again, delete them by name/id instead — there's no `is_example` flag.
- [ ] (Optional) The 4 **demo bulletin posts** are built into the page as static examples. Removing them is a code edit — ask for help when you want them gone, or leave them as a guide for students.

---

## 4. Routine maintenance — things to keep an eye on

### ⏰ Time-sensitive
- [ ] **Brevo SMTP key expiry.** If you set it to "1 year," it expires around **June 2027** — and login emails will stop until you regenerate it. Also note: Brevo keys expire after **90 days of zero email activity**. An active site won't hit that, but over a long break (e.g. summer with no logins) it could.
  - **If login emails ever stop working:** Brevo → SMTP & API → SMTP → generate a new key → paste it into Supabase → Project Settings → Authentication → SMTP Settings → save.
  - 💡 Consider setting the key to "no expiry" if Brevo allows, to avoid this.

### 🔋 Inactivity
- [ ] **Supabase free project pauses after ~7 days of zero activity.** If the site is used regularly this won't happen. If it ever shows "project paused," just log into Supabase and click to resume (one click, no data lost).

### 📧 Email deliverability
- [ ] Login emails come from a Gmail-via-Brevo address, so some land in students' **spam/promotions** folders. Always tell new users: *"check spam for the login email from HaAruga."*
- [ ] **Best long-term fix:** use a school-domain email as the sender (see Roadmap #4). It clears Brevo's DKIM/DMARC warnings and dramatically improves inbox delivery.

### 📊 Free-tier limits (you're nowhere near these, but monitor as you grow)
- Auth: 50,000 monthly active users
- Database: 500 MB
- File storage (gallery): 1 GB
- Brevo email: 300 emails/day

---

## 5. How to publish an update

Any change to the site = re-upload + auto-deploy:
1. Get the updated `index.html`.
2. GitHub → repo `haaruga-hub` → **Add file → Upload files** → drag `index.html` → **Commit changes**.
3. Vercel redeploys automatically (~1 min).
4. Hard-refresh the live site (**Cmd+Shift+R**) to see changes.

💡 *Future convenience:* installing **GitHub Desktop** would make updates a one-click "push" instead of a manual upload. Worth setting up if you'll edit often.

---

## 6. Roadmap — features to build after the demo

Not urgent. Tackle in any order when you're ready.

- [x] **1. Automatic weekly newsletter send.** Built 2026-09-01 — see "Weekly
  newsletter" section below for how it works and what to check if it ever stops.
- [ ] **2. Restrict signups to your class roster.** Currently anyone with the link can create a profile. Lock it to approved student emails (Supabase invite-only / allowlist) so only real HaAruga students can join.
- [ ] **3. Branded login email.** Customize the Supabase email templates (Magic Link / Confirm signup) with HaAruga's logo and friendly wording. (Supabase → Authentication → Emails → Templates.)
- [ ] **4. School-domain email sender.** Switch the sender from your Gmail to a school address (e.g. via the `arugaschool.com` domain). Improves deliverability and looks official.
- [ ] **5. Custom domain.** Point something like `hub.arugaschool.com` at the site (~$12/yr, or free if the school already owns the domain). Note: changing the domain means updating the Redirect URLs in Supabase → Authentication → URL Configuration.
- [ ] **6. Move profile photos to file storage.** Profile photos are currently stored in the database (fine for a school's size). If the directory ever grows large and feels slow, move them to Supabase Storage like the gallery already uses.
- [ ] **7. Add faculty bios / contact.** The faculty page shows names, photos, and subjects (all that the school site publishes). If you gather bios or contact emails from lecturers, they can be added to the cards.
- [ ] **8. Edit/delete buttons.** Students can already re-save their profile to edit it. Adding visible "edit/delete" buttons for their own bulletin posts would be a nice polish (the security rules already allow it).

---

## 6a. Weekly newsletter (automated, review-then-approve)

**How it works:** every Thursday around 9am Israel time, a Vercel Cron job hits
`/api/digest-prepare`, which gathers every bulletin post added since the last
digest and emails **you** (larissa.jeanniton@gmail.com) a preview with two links:
**Approve & send** (emails everyone in `subscribers`) and **Skip this week**
(nothing sends; those posts roll into next week automatically). Nothing ever
reaches subscribers without you clicking Approve first.

- If there are no new posts that week, you just get a short "nothing new" note
  — there's nothing to approve.
- Every digest email to a subscriber includes an **Unsubscribe** link
  (`/api/unsubscribe`), so people can opt out without asking you.
- Files: `api/_digest-lib.js` (shared HTML builder), `api/digest-prepare.js`
  (the cron target), `api/digest-send.js` (Approve link), `api/digest-skip.js`
  (Skip link), `api/unsubscribe.js`.
- Needs the **same three environment variables** as the contact-notify function
  (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `BREVO_API_KEY`) — nothing new to
  configure in Vercel if contact-request emails already work.
- **Before this works at all**, run `supabase-fixes.sql` (in this folder) once in
  Supabase → SQL Editor. It creates the `subscribers` and `reports` tables (both
  were missing — see the troubleshooting table below), adds a `digested_at`
  column to `posts` so old posts don't repeat forever, and adds a `digest_runs`
  table to track each week's approve/skip decision.
- ⚠️ **DST note:** the cron schedule (`0 6 * * 4` in `vercel.json`) is fixed in
  UTC. 06:00 UTC = 9:00am Israel time in summer (DST) but 8:00am in winter —
  Vercel cron doesn't support named timezones, so the send time will shift by an
  hour twice a year unless you update the schedule manually.
- To change the day/time: edit the `schedule` cron expression in `vercel.json`
  (format: `minute hour day-of-month month day-of-week`, all UTC) and re-deploy.
- To go fully automatic later (no weekly click needed): change `digest-prepare.js`
  to call the same logic as `digest-send.js` directly instead of emailing an
  Approve link. Worth doing once you've seen a few weeks send correctly.

## 7. Quick troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Login email never arrives | Check spam. If truly missing, check Brevo SMTP key hasn't expired (§4). |
| "permission denied for table…" | A table is missing GRANTs. Re-run the permission grant SQL for that table. |
| "Could not find the table… in schema cache" | The table wasn't created — run its setup SQL. |
| Site shows old version after an edit | You didn't re-upload `index.html`, or need a hard-refresh (Cmd+Shift+R). |
| Supabase says "project paused" | Inactivity — log in and click resume. |
| Newsletter subscribe box / report button shows a raw database error | The `subscribers` or `reports` table is missing — run `supabase-fixes.sql` in Supabase → SQL Editor. |
| Weekly digest review email never arrives | Check Vercel → your project → Cron Jobs to confirm `/api/digest-prepare` is running; check the three env vars are set; check Brevo hasn't hit its daily send limit. |

---

*Built with: a single `index.html` file, hosted on Vercel, backed by Supabase (database + auth + storage), with Brevo for email. Setup walkthrough is in `SETUP-GUIDE.md`.*
