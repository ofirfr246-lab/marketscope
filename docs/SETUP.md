# Set up accounts (Supabase) — beginner walkthrough

The MarketScope site is static (HTML/CSS/JS on GitHub Pages). Accounts, Google
sign-in, credit balances and saved reports are handled by a free [Supabase](https://supabase.com)
project, talking to the browser with the **public anon key** only.

Until you paste the two keys below, login and sign-up pages show
**“Accounts launching soon”** and the rest of the site keeps working.

You will provide exactly two values in the site, plus a Google Cloud setup
if you want “Continue with Google”.

---

## 1. Create a Supabase project

1. Open [https://supabase.com](https://supabase.com) and sign in (GitHub login is fine).
2. Click **New project**.
3. Choose an organization, a project name (for example `marketscope`), a
   strong database password (save it in a password manager — you won’t need
   it for this site), and a region close to you.
4. Wait until the project is ready (usually about a minute).

## 2. Run the database schema

1. In the left sidebar, open **SQL Editor**.
2. Click **New query**.
3. Open the file `supabase/schema.sql` from this repo, copy its entire
   contents, paste into the editor, and click **Run**.
4. You should see a success message. This creates:
   - a `profiles` table (plan starts at `free`, 5 credits)
   - a `reports` table
   - Row Level Security so each user can only see their own rows
   - a trigger that creates a profile when someone signs up
   - a `spend_credits(cost)` function that deducts credits safely

## 3. Copy the two values into the site

1. In the sidebar, open **Project Settings** (the gear), then **API**.
2. Copy these two values:
   - **Project URL** — looks like `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`
   - **anon public** key — a long JWT starting with `eyJ...`
3. On your computer, open `assets/js/supabase-config.js`.
4. Replace the placeholders:

```js
export const SUPABASE_URL = "https://YOUR-PROJECT-REF.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
```

**Never** paste the `service_role` key into this file or any other file that
is uploaded to GitHub Pages. That key bypasses security and must stay secret
(it is only for a future server-side Paddle webhook).

5. Commit and push, or upload the edited `supabase-config.js` to the repo
   (same way you upload other site files).

## 4. Auth URL configuration

The live site is served from a subpath, so these URLs must be exact.

1. In Supabase, open **Authentication** → **URL Configuration**.
2. Set **Site URL** to:

   `https://ofirfr246-lab.github.io/marketscope/`

3. Under **Redirect URLs**, add:

   - `https://ofirfr246-lab.github.io/marketscope/`
   - `https://ofirfr246-lab.github.io/marketscope/dashboard.html`
   - `https://ofirfr246-lab.github.io/marketscope/reset-password.html`
   - `https://ofirfr246-lab.github.io/marketscope/login.html`
   - `http://localhost:4173/**`  (optional, for local preview)

4. Confirm **Authentication** → **Providers** → **Email** is enabled.
   Leave “Confirm email” on if you want new users to click a link before
   they can log in (the site already shows that message).

## 5. Enable Google sign-in (optional, but recommended)

Supabase does not talk to Google until you create an OAuth client and paste
its ID and secret into Supabase.

### A. Create an OAuth client in Google Cloud

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create
   or select a project.
2. Open **APIs & Services** → **OAuth consent screen**.
   - User type: **External** is fine for a public product.
   - App name: `MarketScope`.
   - Add your email as a developer contact.
   - Scopes: the default email / profile / openid scopes are enough.
   - While the app is in **Testing**, only listed test users can sign in.
     Publish the app when you are ready for anyone with a Google account.
3. Open **APIs & Services** → **Credentials** → **Create credentials** →
   **OAuth client ID**.
4. Application type: **Web application**.
5. **Authorized JavaScript origins** — add:

   `https://YOUR-PROJECT-REF.supabase.co`

   (Use the same project ref as in your Project URL.)

6. **Authorized redirect URIs** — add exactly:

   `https://YOUR-PROJECT-REF.supabase.co/auth/v1/callback`

7. Create the client and copy the **Client ID** and **Client secret**.

### B. Turn the provider on in Supabase

1. Supabase → **Authentication** → **Providers** → **Google**.
2. Enable it, paste the Client ID and Client secret, and save.
3. The site’s “Continue with Google” button uses `signInWithOAuth` and
   sends users back to `dashboard.html` on this GitHub Pages subpath.

## 6. Check that it works

1. Open `https://ofirfr246-lab.github.io/marketscope/signup.html`.
2. The “Accounts launching soon” notice should be gone.
3. Create an account with email and password.
4. Confirm the email if asked, then log in. You should land on the dashboard
   with 5 credits.
5. Try **Continue with Google** after step 5 is done.

If something fails, the most common causes are: the two keys still have the
placeholder text, Site URL / Redirect URLs don’t match the GitHub Pages
address (including the `/marketscope/` subpath), or the Google redirect URI
is not exactly `https://<project>.supabase.co/auth/v1/callback`.

## What you, the owner, must provide

1. **Project URL** (`SUPABASE_URL`)
2. **anon public key** (`SUPABASE_ANON_KEY`)
3. **Google setup** (Cloud OAuth client + enable the Google provider in
   Supabase, with the callback URI above) if you want Google sign-in.

## Paid credits later (Paddle)

New accounts always start on the **Free** plan with 5 credits, even if the
visitor picked Starter / Plus / Pro on the sign-up form. Paid plan credits
will be granted later by Paddle webhooks, handled server-side (for example a
Supabase Edge Function). A stub is in `supabase/functions/paddle-webhook/`
and is **not deployed**. See the project README.

## 8. Live reports (DataForSEO secrets)

The `analyze` Edge Function is deployed at:

`https://izcqyzrzjtogsfrffknp.supabase.co/functions/v1/analyze`

It will not charge credits or call DataForSEO until both secrets below are set.

1. Open [Edge Function secrets](https://supabase.com/dashboard/project/izcqyzrzjtogsfrffknp/functions/secrets).
2. Add these two secrets (names must match exactly):
   - `DATAFORSEO_LOGIN` — your DataForSEO API login (usually the account email).
   - `DATAFORSEO_PASSWORD` — the **API password** from DataForSEO’s [API Access](https://app.dataforseo.com/api-access) page. This is **not** the same as the password you use to log into the DataForSEO website.
3. Save. New reports from the dashboard then run against live Google Shopping and Search data (1 credit each). Until the secrets are set, the dashboard shows “Live data is being connected” and falls back to a labelled example without charging credits.
