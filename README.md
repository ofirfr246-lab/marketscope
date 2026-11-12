# MarketScope website

Static multi-page marketing site for MarketScope, the Bloomberg Terminal for e-commerce.
Plain HTML/CSS/JS, so there's no build step. It can be hosted anywhere, including GitHub Pages.

## Edit prices & plans
All prices, credits, plan features, the comparison matrix and credit top-ups are in **`assets/js/config.js`**.

## Deploy to GitHub Pages
1. Push the contents of this folder to the root of a repo (`.nojekyll` included).
2. Settings → Pages → Deploy from branch → `main` / `(root)`.
3. All paths are relative, so it works under `https://<user>.github.io/<repo>/`.

`screenshots/` is QA output only and is excluded via `.gitignore`.

## Front-end only (not wired to a backend)
- Waitlist & newsletter forms save to `localStorage` (`marketscope_waitlist`).
- Contact form saves to `localStorage` (`marketscope_contact`) and isn't sent anywhere.
- Login / sign-up are UI only and create no accounts.
- Cookie banner stores the choice in `localStorage` (`ms_consent`). No analytics are loaded.
- All market data, customers/testimonials, status and API samples are illustrative examples.
