/* =====================================================================
   MarketScope — Supabase project keys (browser, anon public key only).

   REPLACE THE TWO PLACEHOLDERS BELOW before accounts can go live:
     1. SUPABASE_URL       — Project URL
        (Supabase dashboard → Project Settings → API → Project URL)
        Example: "https://xxxxxxxxxxxxxxxxxxxx.supabase.co"
     2. SUPABASE_ANON_KEY  — anon / public API key
        (same page → Project API keys → anon public)
        Never put the service_role key in this file or anywhere in this
        static site. That key bypasses Row Level Security.

   Until both values are set, login, sign-up and account pages show
   “Accounts launching soon” and the rest of the site keeps working.
   Step-by-step: docs/SETUP.md
   ===================================================================== */

export const SUPABASE_URL = "YOUR_SUPABASE_URL";
export const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";

const PLACEHOLDER = /YOUR_SUPABASE_|changeme|placeholder/i;

/**
 * True only when both values look like a real project URL + anon key.
 * Placeholder strings, empty values, or a non-https URL stay “unset”.
 */
export function isSupabaseConfigured() {
  if (typeof SUPABASE_URL !== "string" || typeof SUPABASE_ANON_KEY !== "string") return false;
  var url = SUPABASE_URL.trim();
  var key = SUPABASE_ANON_KEY.trim();
  if (!url || !key) return false;
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(key)) return false;
  if (url.indexOf("https://") !== 0) return false;
  if (url.indexOf(".supabase.co") === -1 && url.indexOf("localhost") === -1 && url.indexOf("127.0.0.1") === -1) {
    // Still allow a custom domain or local Kong; require https (or http for localhost).
  }
  if (key.length < 20) return false;
  return true;
}

export function isConfigured() {
  return isSupabaseConfigured();
}
