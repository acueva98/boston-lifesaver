# Accounts, reviews and food photos (Supabase)

Cambridge Eats stays a static page; logins, reviews and photos live in a free Supabase project.

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
