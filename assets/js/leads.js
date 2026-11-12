/* MarketScope — waitlist / contact / newsletter leads.
   Inserts into public.leads (INSERT only; do not .select()).
   Failures are swallowed so the existing localStorage + thank-you UI still works. */
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from "./supabase-config.js";

var CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
var clientPromise = null;

async function getClient() {
  if (!isSupabaseConfigured()) return null;
  if (!clientPromise) {
    clientPromise = import(CDN).then(function (mod) {
      return mod.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    });
  }
  return clientPromise;
}

/**
 * @param {{ email: string, source?: string, name?: string, message?: string, page?: string }} payload
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: unknown }>}
 */
async function submit(payload) {
  try {
    var email = String((payload && payload.email) || "").trim().toLowerCase();
    if (!email) return { ok: false, skipped: true };
    var sb = await getClient();
    if (!sb) return { ok: false, skipped: true };
    var row = {
      email: email,
      source: String((payload && payload.source) || "waitlist").slice(0, 40),
      page: (payload && payload.page) || (typeof location !== "undefined" ? location.pathname : "")
    };
    if (payload && payload.name) row.name = String(payload.name).trim();
    if (payload && payload.message) row.message = String(payload.message).trim();
    var res = await sb.from("leads").insert(row);
    if (res.error) return { ok: false, error: res.error };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}

window.MSLeads = { submit: submit };
