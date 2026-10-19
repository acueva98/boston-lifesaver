# Supabase: restaurants, deals, accounts, reviews and photos

Boston Lifesaver (formerly Cambridge Eats) stays a static page. Restaurants, deals, logins, reviews and photos live in a free Supabase project.

## One-time setup (about 5 minutes)

1. **Create a project** at <https://supabase.com> → New project (free plan is fine). Pick a region near Boston (e.g. East US).
2. **Create the tables, rules and photo bucket:** open **SQL Editor → New query**, paste all of [`setup.sql`](setup.sql), click **Run**.
3. **Turn off email confirmation** (people sign up with a username, not a real email):
   **Authentication → Sign In / Providers → Email** → switch off **Confirm email** → Save.
   If you skip this, sign-ups will fail.
4. **Connect the site:** open **Project Settings → API Keys** (and **Data API** for the URL). Copy the **Project URL** and the **publishable / anon** key into [`web/config.js`](../web/config.js), then commit.
   Never use the `service_role` / secret key there.
5. Optional: under **Authentication → Rate Limits**, keep sign-up limits low to slow down spam accounts.

## How it works

- **Usernames:** 3–20 characters, lowercase letters, numbers and `_`. Behind the scenes each username is stored as `username@users.cambridge-eats.app` (the old Cambridge Eats name, kept so existing accounts keep working) because Supabase logins need an email-shaped ID. No email is ever sent, so **forgotten passwords can't be reset by the user**. An admin can set a new password from **Authentication → Users**.
- **Reviews:** one per person per restaurant (1–5 stars, up to 1000 characters, up to 3 photos). People can edit or delete only their own.
- **Photos:** resized in the browser to max 1600 px JPEG before upload, stored in the public `food-photos` bucket under the uploader's own folder.
- **Moderation:** to remove an abusive review or photo, delete it in **Table Editor → reviews** or **Storage → food-photos**. To ban someone, delete their user in **Authentication → Users** (their reviews go with it).

## Restaurants and deals (added Oct 13, 2026)

The site now reads restaurants and deals from two tables, set up with [`restaurants_deals.sql`](restaurants_deals.sql):

- **`restaurants`**: one row per restaurant (same fields as `data/restaurants.json`), plus `is_closed` / `closed_source`, and `deal_check` (`unchecked`, `deals`, `none`) with `deal_notes` on what was found.
- **`deals`**: one row per deal: `type`, `description`, `source_url`, and a verification `status`:
  - `sourced`: found on a public source but not yet checked by the team (shown on the site)
  - `verified`: a team member confirmed it; fill in `verified_by` and `verified_at` (shown on the site)
  - `rejected`: wrong or expired (hidden)
  
  Optional columns `days_of_week` (0 = Sunday), `start_time`, `end_time`, `valid_from`, `valid_to` are there for date / time search later.

**To edit:** Supabase → **Table Editor** → `restaurants` or `deals`. Changes show on the site on the next page load; no pull request needed. The public key can only read these tables.

**Backup copy:** the lists in `data/` and inside `web/index.html` are a fallback the page uses only if Supabase can't be reached (for example if the free project is paused). They don't update automatically, so refresh them now and then.

## Daily deals check (added Oct 19, 2026)

Every day at 7am Boston time, GitHub Actions ([`refresh-deals.yml`](../.github/workflows/refresh-deals.yml)) runs [`scripts/refresh-deals.js`](../scripts/refresh-deals.js). It is free (public repo, no AI) and visits the `source_url` of every live deal (`sourced` or `verified`):

- **Deal still on the page** (its prices and at least half of its key words appear): `last_checked` is set to today, so the site shows a fresh "Checked" date.
- **Page loads but the deal is gone 3 days in a row:** `status` becomes `rejected`, which hides it. To bring one back, set it to `sourced` again in **Table Editor → deals**.
- **Page blocks bots or is down** (e.g. Don't Tell Aunty, WOW TIKKA return 403): nothing changes. Check those by hand.

It only re-checks deals already in the table. **Finding new deals is still done by hand** (as in `deals_refresh_2026-10-19.sql`). It can also miss a changed price when the same number appears elsewhere on a menu.

**Setup (repo owner, once):** Supabase → **Project Settings → API Keys** → copy the **secret / service_role** key. In GitHub → **Settings → Secrets and variables → Actions → New repository secret**, name it `SUPABASE_SERVICE_ROLE_KEY`. Never put this key in the code.

**See results:** GitHub → **Actions → Daily deals check** → open a run; the summary lists each deal. The **Run workflow** button runs it now. Locally, `node scripts/refresh-deals.js` does a dry run that writes nothing.

GitHub turns off scheduled workflows after 60 days with no commits to the repo; if that happens, re-enable it from the Actions tab. Its daily read of the database also helps keep the free Supabase project from pausing.

**Free-plan pausing:** free projects pause after about a week with little traffic. If that happens, the site falls back to the built-in list and sign-in/reviews stop working until the owner clicks **Resume project** in the dashboard.
