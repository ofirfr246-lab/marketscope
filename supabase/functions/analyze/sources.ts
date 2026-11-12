/**
 * Plan → data-source entitlements and a pluggable source registry.
 *
 *   Free / Starter = Google Shopping + Google Search + Amazon
 *   Plus           = those + Meta Ad Library + TikTok
 *   Pro            = those + AliExpress
 *
 * Only collectors marked `implemented: true` are invoked. Amazon
 * (DataForSEO Amazon products/sellers), Meta, TikTok and AliExpress are
 * registered as stubs so they can be wired later without changing gating.
 * Keep this file in the analyze function — do not put these constants in
 * the public pricing/config pages (those are edited separately).
 */

export type PlanId = "free" | "starter" | "plus" | "pro";

export type SourceId =
  | "google_shopping"
  | "google_search"
  | "amazon"
  | "meta_ad_library"
  | "tiktok"
  | "aliexpress";

export type SourceStatus = "ok" | "empty" | "error" | "timeout" | "skipped" | "planned";

export type SourceDescriptor = {
  id: SourceId;
  label: string;
  implemented: boolean;
  notes: string;
};

export const PLAN_SOURCES: Record<PlanId, SourceId[]> = {
  free: ["google_shopping", "google_search", "amazon"],
  starter: ["google_shopping", "google_search", "amazon"],
  plus: ["google_shopping", "google_search", "amazon", "meta_ad_library", "tiktok"],
  pro: ["google_shopping", "google_search", "amazon", "meta_ad_library", "tiktok", "aliexpress"],
};

export const SOURCE_REGISTRY: Record<SourceId, SourceDescriptor> = {
  google_shopping: {
    id: "google_shopping",
    label: "Google Shopping",
    implemented: true,
    notes: "DataForSEO Merchant Google products, priority queue + task_get/advanced.",
  },
  google_search: {
    id: "google_search",
    label: "Google Search",
    implemented: true,
    notes: "Google Ads search volume, DataForSEO Labs related keywords, Google organic SERP.",
  },
  amazon: {
    id: "amazon",
    label: "Amazon",
    implemented: false,
    notes: "Planned: DataForSEO Amazon products / sellers (live/advanced). Hook: add a collector and set implemented true.",
  },
  meta_ad_library: {
    id: "meta_ad_library",
    label: "Meta Ad Library",
    implemented: false,
    notes: "Plus+ planned. Not called until a collector is registered.",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    implemented: false,
    notes: "Plus+ planned. Not called until a collector is registered.",
  },
  aliexpress: {
    id: "aliexpress",
    label: "AliExpress",
    implemented: false,
    notes: "Pro planned. Not called until a collector is registered.",
  },
};

export function isPlan(value: string): value is PlanId {
  return value === "free" || value === "starter" || value === "plus" || value === "pro";
}

export function sourcesForPlan(plan: string): SourceId[] {
  const id: PlanId = isPlan(plan) ? plan : "free";
  return PLAN_SOURCES[id].slice();
}

export function isEntitled(plan: string, source: SourceId): boolean {
  return sourcesForPlan(plan).includes(source);
}

export function willRun(plan: string, source: SourceId): boolean {
  return isEntitled(plan, source) && SOURCE_REGISTRY[source].implemented;
}

export type SourceRun = {
  id: SourceId;
  label: string;
  entitled: boolean;
  implemented: boolean;
  used: boolean;
  status: SourceStatus;
  notes: string;
};

/**
 * Build the per-source run list for a report. `runtime` is the status of
 * collectors that actually ran (or failed) in this request.
 */
export function describeSourceRuns(
  plan: string,
  runtime: Partial<Record<SourceId, SourceStatus>> = {},
): SourceRun[] {
  return (Object.keys(SOURCE_REGISTRY) as SourceId[]).map((id) => {
    const meta = SOURCE_REGISTRY[id];
    const entitled = isEntitled(plan, id);
    if (!entitled) {
      return { id, label: meta.label, entitled: false, implemented: meta.implemented, used: false, status: "skipped", notes: "Not included in this plan." };
    }
    if (!meta.implemented) {
      return { id, label: meta.label, entitled: true, implemented: false, used: false, status: "planned", notes: meta.notes };
    }
    const status = runtime[id] || "skipped";
    const used = status !== "skipped" && status !== "planned";
    return { id, label: meta.label, entitled: true, implemented: true, used, status, notes: meta.notes };
  });
}
