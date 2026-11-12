# MarketScope website

Static multi-page marketing site for MarketScope, the Bloomberg Terminal for e-commerce.
Plain HTML/CSS/JS, so there's no build step. It can be hosted anywhere, including GitHub Pages.

Live: https://ofirfr246-lab.github.io/marketscope/

## Edit prices & plans
All prices, credits, plan features, the comparison matrix and credit top-ups are in **`assets/js/config.js`**.

## Accounts (Supabase)
Email/password and Google sign-in run entirely in the browser with [supabase-js v2](https://github.com/supabase/supabase-js) (CDN ESM). Keys live in **`assets/js/supabase-config.js`**.

Until `SUPABASE_URL` and `SUPABASE_ANON_KEY` are replaced, login and sign-up show **“Accounts launching soon”** and the rest of the site keeps working.

Beginner setup (create a project, run `supabase/schema.sql`, paste the two keys, set Auth URLs, enable Google): **`docs/SETUP.md`**.

**Paid plan credits** (Starter / Plus / Pro monthly allowances and credit packs) will be granted later via **Paddle webhooks**, handled server-side (for example a Supabase Edge Function using the service role key). A stub is in `supabase/functions/paddle-webhook/` and is **not deployed**. Do not put the service role key or a Paddle webhook secret in this static site.

## Deploy to GitHub Pages
1. Push the contents of this folder to the root of a repo (`.nojekyll` included).
2. Settings → Pages → Deploy from branch → `main` / `(root)`.
3. All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

`screenshots/` is QA output only and is excluded via `.gitignore`.


## Market Terminal
The Terminal desk (`terminal.html` and related pages) is a capital-markets-style workspace: tape, charts, screener, heatmap, indices, watchlist, portfolio, backtest and calendar. **Every series is labelled example data.**

Watchlists and portfolios persist in Supabase (`watchlist`, `portfolio` tables in `supabase/schema.sql`) when the two keys are set and the user is signed in; otherwise they use `localStorage`.

### Plan mapping (data sources)
Live today: **Google Shopping** and **Google Search** on every plan. Amazon, Meta Ad Library, TikTok and AliExpress keep the tier mapping below and are labelled Coming soon until their collectors are connected.
- **Free & Starter** — Google Shopping, Google Search (Live) and Amazon (Coming soon; listings and pricing on both; Amazon BSR and review velocity on Starter). Starter answers “Is there demand?”
- **Plus** — everything in Starter, plus Meta Ad Library and TikTok ads and Creative Center trends (Coming soon). Answers “How is it being sold?”
- **Pro** — everything in Plus, plus AliExpress supplier cost, order volume and a true margin calculator (Coming soon). Answers “How much will I make?”

### Plan mapping (Terminal features)
- **Free** — Terminal desk (tape, movers, news feed), 7-day charts, 1 Watchlist slot
- **Starter** — alert rules (5 Watchlist slots, 5 email alerts), category indices, events calendar, compare 2 names, analyst ratings & target range, 30-day history
- **Plus** — Screener, heatmap, backtest, sentiment gauge, niche ‘earnings’, compare up to 4, 20 watch slots, 20 email alerts, 12-month history
- **Pro** — Portfolio desk (allocation, risk, diversification), unlimited watch slots, unlimited tracked stores, 24-month history
- **Store Intelligence** — directory visible on all plans (example data). Tracked stores: Starter 1, Plus 10, Pro unlimited. Plus+ for the full profile (catalog, ads, sentiment) when live collection ships.

## Front-end notes
- Waitlist & newsletter forms save to `localStorage` (`marketscope_waitlist`).
- Contact form saves to `localStorage` (`marketscope_contact`) and isn't sent anywhere.
- Login, sign-up, password reset, dashboard and account talk to Supabase once the two keys are set. Forms do not create accounts while keys are still placeholders.
- Cookie banner stores the choice in `localStorage` (`ms_consent`). No analytics are loaded.
- Dashboard reports use **live Google Shopping and Google Search** data when the analyze function is configured. Amazon, Meta, TikTok and AliExpress are coming soon.
- All market data, customers/testimonials, status and API samples on marketing pages are illustrative examples.
