# Supabase: restaurants, deals, accounts, reviews and photos

Cambridge Eats stays a static page. Restaurants, deals, logins, reviews and photos live in a free Supabase project.

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

- **Usernames:** 3–20 characters, lowercase letters, numbers and `_`. Behind the scenes each username is stored as `username@users.cambridge-eats.app` because Supabase logins need an email-shaped ID. No email is ever sent, so **forgotten passwords can't be reset by the user**. An admin can set a new password from **Authentication → Users**.
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

**Free-plan pausing:** free projects pause after about a week with little traffic. If that happens, the site falls back to the built-in list and sign-in/reviews stop working until the owner clicks **Resume project** in the dashboard.
