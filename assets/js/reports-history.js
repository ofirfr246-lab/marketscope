/* MarketScope report history UI. No secrets. Talks to the page only;
   auth.js loads the signed-in user's rows and wires delete. */
(function (root) {
  "use strict";

  var SOURCE_DEFS = [
    { id: "google_shopping", label: "Google Shopping", short: "Shopping" },
    { id: "google_search", label: "Google Search", short: "Search" },
    { id: "amazon", label: "Amazon", short: "Amazon" },
    { id: "meta_ad_library", label: "Meta Ad Library", short: "Meta" },
    { id: "tiktok", label: "TikTok", short: "TikTok" },
    { id: "aliexpress", label: "AliExpress", short: "AliExpress" },
    { id: "shopify", label: "Shopify", short: "Shopify" }
  ];

  var SOURCE_IDS = SOURCE_DEFS.map(function (s) { return s.id; });
  var PINS_KEY = "ms_report_pins";
  var VIEW_KEY = "ms_report_view";

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function contentOf(row) {
    return (row && (row.content || row.result)) || {};
  }

  function sourcesUsed(row) {
    var c = contentOf(row);
    var found = [];
    function add(id) {
      if (id && SOURCE_IDS.indexOf(id) !== -1 && found.indexOf(id) === -1) found.push(id);
    }
    var plan = c.sources && c.sources.plan;
    if (Array.isArray(plan)) {
      plan.forEach(function (s) {
        if (!s) return;
        if (s.used === true || s.status === "ok") add(s.id);
      });
    }
    var src = c.sources || {};
    if (src.shopping === "ok" || src.google_shopping === "ok") add("google_shopping");
    if (src.search_volume === "ok" || src.related_keywords === "ok" || src.serp === "ok" || src.google_search === "ok") add("google_search");
    if (src.amazon === "ok") add("amazon");
    if (src.meta_ad_library === "ok") add("meta_ad_library");
    if (src.tiktok === "ok") add("tiktok");
    if (src.aliexpress === "ok") add("aliexpress");
    if (src.shopify === "ok") add("shopify");
    return found;
  }

  function sourceLabel(id) {
    for (var i = 0; i < SOURCE_DEFS.length; i++) if (SOURCE_DEFS[i].id === id) return SOURCE_DEFS[i].label;
    return id || "";
  }

  function sourceShort(id) {
    for (var i = 0; i < SOURCE_DEFS.length; i++) if (SOURCE_DEFS[i].id === id) return SOURCE_DEFS[i].short;
    return id || "";
  }

  function opportunity(row) {
    var scores = (row && row.scores) || contentOf(row).scores || {};
    var n = scores.opportunity;
    return n == null || n === "" || isNaN(Number(n)) ? null : Number(n);
  }

  function scoreOf(row, key) {
    var scores = (row && row.scores) || contentOf(row).scores || {};
    var n = scores[key];
    return n == null || n === "" || isNaN(Number(n)) ? null : Number(n);
  }

  function pricesOf(row) {
    return contentOf(row).prices || {};
  }

  function medianPrice(row) {
    var p = pricesOf(row);
    return p.median == null || isNaN(Number(p.median)) ? null : Number(p.median);
  }

  function isLive(row) {
    if (!row) return false;
    if (row.is_example === true) return false;
    var c = contentOf(row);
    if (c.sample === true || c.is_example === true) return false;
    if (row.is_example === false && c.sample !== true) return true;
    return false;
  }

  function formatWhen(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return iso || "—";
      return d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso || "—"; }
  }

  function formatMoney(n, currency) {
    if (n == null || n === "" || isNaN(Number(n))) return "—";
    var cur = currency || "USD";
    try {
      return new Intl.NumberFormat("en-US", { style: "currency", currency: cur, maximumFractionDigits: Number(n) >= 100 ? 0 : 2 }).format(Number(n));
    } catch (e) {
      return cur + " " + Number(n);
    }
  }

  function verdictClass(v) {
    var x = String(v || "").toUpperCase().replace(/\s+/g, "");
    if (x === "STRONGBUY") return "v-sbuy";
    if (x === "BUY") return "v-buy";
    if (x === "HOLD") return "v-hold";
    if (x === "UNDERPERFORM") return "v-under";
    if (x === "AVOID") return "v-avoid";
    return "v-hold";
  }

  function dayStamp(iso) {
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var day = String(d.getDate()).padStart(2, "0");
      return y + "-" + m + "-" + day;
    } catch (e) { return ""; }
  }

  function readPins(userId) {
    try {
      var raw = JSON.parse(localStorage.getItem(PINS_KEY) || "{}");
      if (Array.isArray(raw)) raw = { default: raw };
      var key = userId || "default";
      return Array.isArray(raw[key]) ? raw[key].slice() : [];
    } catch (e) { return []; }
  }

  function writePins(userId, ids) {
    try {
      var raw = {};
      try { raw = JSON.parse(localStorage.getItem(PINS_KEY) || "{}"); } catch (e2) { raw = {}; }
      if (Array.isArray(raw)) raw = { default: raw };
      raw[userId || "default"] = ids;
      localStorage.setItem(PINS_KEY, JSON.stringify(raw));
    } catch (e) { /* private mode */ }
  }

  function readView() {
    try {
      var v = localStorage.getItem(VIEW_KEY);
      return v === "list" ? "list" : "grid";
    } catch (e) { return "grid"; }
  }

  function writeView(v) {
    try { localStorage.setItem(VIEW_KEY, v === "list" ? "list" : "grid"); } catch (e) { /* ignore */ }
  }

  function csvCell(v) {
    var s = v == null ? "" : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(rows) {
    var header = ["created_at", "product", "market", "verdict", "opportunity", "median_price", "currency", "cost", "sources", "input_source", "is_example", "status", "id"];
    var lines = [header.join(",")];
    rows.forEach(function (r) {
      var p = pricesOf(r);
      lines.push([
        r.created_at || "",
        r.product || "",
        r.market || "",
        r.verdict || "",
        opportunity(r) == null ? "" : opportunity(r),
        medianPrice(r) == null ? "" : medianPrice(r),
        p.currency || "",
        r.cost == null ? "" : r.cost,
        sourcesUsed(r).map(sourceLabel).join("; "),
        r.source || "",
        r.is_example ? "yes" : "no",
        r.status || "",
        r.id || ""
      ].map(csvCell).join(","));
    });
    return lines.join("\n");
  }

  function applyFilters(rows, state) {
    state = state || {};
    var q = String(state.q || "").trim().toLowerCase();
    var market = state.market || "";
    var kind = state.kind || "all";
    var from = state.from || "";
    var to = state.to || "";
    var sources = state.sources || [];
    var pinnedOnly = !!state.pinnedOnly;
    var pins = state.pins || [];
    return rows.filter(function (r) {
      if (pinnedOnly && pins.indexOf(r.id) === -1) return false;
      if (kind === "live" && !isLive(r)) return false;
      if (kind === "example" && isLive(r)) return false;
      if (market && String(r.market || "") !== market) return false;
      if (from && dayStamp(r.created_at) && dayStamp(r.created_at) < from) return false;
      if (to && dayStamp(r.created_at) && dayStamp(r.created_at) > to) return false;
      if (sources.length) {
        var used = sourcesUsed(r);
        for (var i = 0; i < sources.length; i++) {
          if (used.indexOf(sources[i]) === -1) return false;
        }
      }
      if (q) {
        var blob = [r.product, r.market, r.verdict, r.source, r.source_url].join(" ").toLowerCase();
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortRows(rows, sort, pins) {
    var list = rows.slice();
    var pinSet = pins || [];
    list.sort(function (a, b) {
      var ap = pinSet.indexOf(a.id) !== -1;
      var bp = pinSet.indexOf(b.id) !== -1;
      if (ap !== bp) return ap ? -1 : 1;
      if (sort === "oldest") {
        return String(a.created_at || "").localeCompare(String(b.created_at || ""));
      }
      if (sort === "score") {
        var ao = opportunity(a), bo = opportunity(b);
        if (ao == null && bo == null) return 0;
        if (ao == null) return 1;
        if (bo == null) return -1;
        return bo - ao;
      }
      if (sort === "price") {
        var apx = medianPrice(a), bpx = medianPrice(b);
        if (apx == null && bpx == null) return 0;
        if (apx == null) return 1;
        if (bpx == null) return -1;
        return bpx - apx;
      }
      return String(b.created_at || "").localeCompare(String(a.created_at || ""));
    });
    return list;
  }

  function stats(rows) {
    var live = rows.filter(isLive);
    var credits = 0;
    live.forEach(function (r) {
      var n = Number(r.cost);
      if (!isNaN(n) && n > 0) credits += n;
    });
    var sourceSet = {};
    rows.forEach(function (r) {
      sourcesUsed(r).forEach(function (id) { sourceSet[id] = true; });
    });
    var sourceCount = Object.keys(sourceSet).length;
    return {
      total: rows.length,
      live: live.length,
      examples: rows.length - live.length,
      credits: credits,
      sources: sourceCount,
      sourceIds: Object.keys(sourceSet)
    };
  }

  var ctx = null;

  function stateFromDom() {
    var sources = $$("[data-source-chip].is-on").map(function (b) { return b.getAttribute("data-source-chip"); });
    return {
      q: ($("[data-hist-search]") && $("[data-hist-search]").value) || "",
      market: ($("[data-hist-market]") && $("[data-hist-market]").value) || "",
      kind: ($("[data-hist-kind]") && $("[data-hist-kind]").value) || "all",
      from: ($("[data-hist-from]") && $("[data-hist-from]").value) || "",
      to: ($("[data-hist-to]") && $("[data-hist-to]").value) || "",
      sort: ($("[data-hist-sort]") && $("[data-hist-sort]").value) || "newest",
      sources: sources,
      pinnedOnly: !!( $("[data-hist-pinned]") && $("[data-hist-pinned]").checked ),
      pins: ctx ? ctx.pins : []
    };
  }

  function activeFilterCount(state) {
    var n = 0;
    if (state.q) n += 1;
    if (state.market) n += 1;
    if (state.kind && state.kind !== "all") n += 1;
    if (state.from || state.to) n += 1;
    if (state.sources.length) n += 1;
    if (state.pinnedOnly) n += 1;
    return n;
  }

  function paintStats(rows) {
    var s = stats(rows);
    var t = $("[data-hist-total]");
    var l = $("[data-hist-live]");
    var c = $("[data-hist-credits]");
    var u = $("[data-hist-sources]");
    if (t) t.textContent = String(s.total);
    if (l) l.textContent = String(s.live);
    if (c) c.textContent = String(s.credits);
    if (u) {
      u.textContent = String(s.sources);
      var note = $("[data-hist-sources-note]");
      if (note) {
        note.textContent = s.sourceIds.length
          ? s.sourceIds.map(sourceLabel).join(", ")
          : "No collector data on saved reports yet";
      }
    }
  }

  function paintSourceCounts(rows) {
    SOURCE_DEFS.forEach(function (def) {
      var n = rows.filter(function (r) { return sourcesUsed(r).indexOf(def.id) !== -1; }).length;
      $$('[data-source-chip="' + def.id + '"]').forEach(function (b) {
        var c = $("[data-source-count]", b);
        if (c) c.textContent = String(n);
        b.classList.toggle("is-empty", n === 0);
      });
    });
  }

  function fillMarkets(rows) {
    var sel = $("[data-hist-market]");
    if (!sel) return;
    var current = sel.value;
    var markets = [];
    rows.forEach(function (r) {
      var m = r.market;
      if (m && markets.indexOf(m) === -1) markets.push(m);
    });
    markets.sort(function (a, b) { return a.localeCompare(b); });
    sel.innerHTML = '<option value="">All markets</option>' + markets.map(function (m) {
      return '<option value="' + escapeHtml(m) + '">' + escapeHtml(m) + "</option>";
    }).join("");
    if (current && markets.indexOf(current) !== -1) sel.value = current;
  }

  function cardHtml(r) {
    var opp = opportunity(r);
    var used = sourcesUsed(r);
    var live = isLive(r);
    var pinned = ctx.pins.indexOf(r.id) !== -1;
    var selected = ctx.selected.indexOf(r.id) !== -1;
    var price = medianPrice(r);
    var currency = pricesOf(r).currency || "USD";
    var chips = used.map(function (id) {
      return '<span class="hist-src" title="' + escapeHtml(sourceLabel(id)) + '">' + escapeHtml(sourceShort(id)) + "</span>";
    }).join("");
    if (!chips) chips = '<span class="hist-src is-dim">Sources not stored</span>';
    return '<article class="hist-card' + (pinned ? " is-pinned" : "") + (selected ? " is-picked" : "") + '" data-card-id="' + escapeHtml(r.id) + '">' +
      '<div class="hist-card-top">' +
        '<label class="hist-pick"><input type="checkbox" data-pick="' + escapeHtml(r.id) + '"' + (selected ? " checked" : "") + '><span>Compare</span></label>' +
        '<button type="button" class="hist-pin" data-pin="' + escapeHtml(r.id) + '" aria-pressed="' + (pinned ? "true" : "false") + '" title="' + (pinned ? "Unpin on this device" : "Pin on this device") + '">' + (pinned ? "Pinned" : "Pin") + "</button>" +
      "</div>" +
      "<h3>" + escapeHtml(r.product || "Untitled") + "</h3>" +
      '<p class="hist-meta"><span class="amber">' + escapeHtml(r.market || "—") + "</span> · " + escapeHtml(formatWhen(r.created_at)) + "</p>" +
      '<div class="hist-kpis">' +
        '<span class="pill ' + verdictClass(r.verdict) + '">' + escapeHtml(r.verdict || "—") + "</span>" +
        '<span class="hist-opp mono"><b>' + (opp == null ? "—" : escapeHtml(String(opp))) + "</b><small>OPP</small></span>" +
        (price == null ? "" : '<span class="hist-price mono">' + escapeHtml(formatMoney(price, currency)) + "</span>") +
        (live ? '<span class="hist-live">Live</span>' : '<span class="hist-sample">Example</span>') +
      "</div>" +
      '<div class="hist-srcs">' + chips + "</div>" +
      '<div class="hist-card-actions">' +
        '<a class="btn btn-sm btn-amber" href="' + escapeHtml(ctx.openUrl(r.id)) + '">Open report</a>' +
        (ctx.canDelete ? '<button type="button" class="btn btn-sm btn-ghost hist-del" data-del="' + escapeHtml(r.id) + '">Delete</button>' : "") +
      "</div>" +
    "</article>";
  }

  function listRowHtml(r) {
    var opp = opportunity(r);
    var used = sourcesUsed(r);
    var live = isLive(r);
    var pinned = ctx.pins.indexOf(r.id) !== -1;
    var selected = ctx.selected.indexOf(r.id) !== -1;
    var price = medianPrice(r);
    var currency = pricesOf(r).currency || "USD";
    return '<div class="hist-row' + (pinned ? " is-pinned" : "") + (selected ? " is-picked" : "") + '" data-card-id="' + escapeHtml(r.id) + '">' +
      '<label class="hist-pick"><input type="checkbox" data-pick="' + escapeHtml(r.id) + '"' + (selected ? " checked" : "") + '><span class="sr">Compare</span></label>' +
      '<div class="hist-row-main"><b>' + escapeHtml(r.product || "Untitled") + "</b>" +
        '<span class="muted">' + escapeHtml(r.market || "—") + " · " + escapeHtml(formatWhen(r.created_at)) + "</span></div>" +
      '<span class="pill ' + verdictClass(r.verdict) + '">' + escapeHtml(r.verdict || "—") + "</span>" +
      '<span class="mono muted">Opp ' + (opp == null ? "—" : escapeHtml(String(opp))) + "</span>" +
      '<span class="mono muted">' + (price == null ? "—" : escapeHtml(formatMoney(price, currency))) + "</span>" +
      '<span class="hist-srcs">' + used.map(function (id) { return '<span class="hist-src">' + escapeHtml(sourceShort(id)) + "</span>"; }).join("") + (live ? "" : '<span class="hist-sample">Example</span>') + "</span>" +
      '<div class="hist-row-actions">' +
        '<button type="button" class="hist-pin" data-pin="' + escapeHtml(r.id) + '" aria-pressed="' + (pinned ? "true" : "false") + '">' + (pinned ? "Pinned" : "Pin") + "</button>" +
        '<a class="btn btn-sm btn-amber" href="' + escapeHtml(ctx.openUrl(r.id)) + '">Open</a>' +
        (ctx.canDelete ? '<button type="button" class="btn btn-sm btn-ghost hist-del" data-del="' + escapeHtml(r.id) + '">Delete</button>' : "") +
      "</div></div>";
  }

  function compareHtml(a, b) {
    function cell(label, va, vb, gold) {
      return "<tr><th>" + escapeHtml(label) + "</th><td" + (gold ? ' class="amber"' : "") + ">" + va + "</td><td" + (gold ? ' class="amber"' : "") + ">" + vb + "</td></tr>";
    }
    function scoreCell(key) {
      var va = scoreOf(a, key), vb = scoreOf(b, key);
      return cell(key.charAt(0).toUpperCase() + key.slice(1), va == null ? "—" : String(va), vb == null ? "—" : String(vb));
    }
    function priceLine(row) {
      var p = pricesOf(row);
      if (p.min == null && p.median == null && p.max == null) return "—";
      var cur = p.currency || "USD";
      var bits = [];
      if (p.min != null) bits.push("Min " + formatMoney(p.min, cur));
      if (p.median != null) bits.push("Median " + formatMoney(p.median, cur));
      if (p.max != null) bits.push("Max " + formatMoney(p.max, cur));
      return bits.join(" · ");
    }
    return '<div class="hist-compare-in">' +
      "<h2>Compare reports</h2>" +
      '<button type="button" class="btn btn-sm btn-ghost" data-clear-compare>Clear selection</button>' +
      '<div class="hist-compare-table-wrap"><table class="hist-compare-table"><thead><tr><th></th>' +
        "<th>" + escapeHtml(a.product || "Report A") + "<div class='muted'>" + escapeHtml(a.market || "") + " · " + escapeHtml(formatWhen(a.created_at)) + "</div></th>" +
        "<th>" + escapeHtml(b.product || "Report B") + "<div class='muted'>" + escapeHtml(b.market || "") + " · " + escapeHtml(formatWhen(b.created_at)) + "</div></th>" +
      "</tr></thead><tbody>" +
      cell("Verdict", '<span class="pill ' + verdictClass(a.verdict) + '">' + escapeHtml(a.verdict || "—") + "</span>", '<span class="pill ' + verdictClass(b.verdict) + '">' + escapeHtml(b.verdict || "—") + "</span>") +
      scoreCell("opportunity") +
      scoreCell("demand") +
      scoreCell("competition") +
      scoreCell("saturation") +
      cell("Price range", escapeHtml(priceLine(a)), escapeHtml(priceLine(b))) +
      cell("Credits", a.cost == null ? "—" : String(a.cost), b.cost == null ? "—" : String(b.cost)) +
      cell("Kind", isLive(a) ? "Live" : "Example", isLive(b) ? "Live" : "Example") +
      cell("Collectors used", escapeHtml(sourcesUsed(a).map(sourceLabel).join(", ") || "—"), escapeHtml(sourcesUsed(b).map(sourceLabel).join(", ") || "—")) +
      cell("Started from", escapeHtml(a.source || "—"), escapeHtml(b.source || "—")) +
      "</tbody></table></div>" +
      '<div class="hist-compare-actions">' +
        '<a class="btn btn-sm btn-amber" href="' + escapeHtml(ctx.openUrl(a.id)) + '">Open first</a>' +
        '<a class="btn btn-sm btn-amber" href="' + escapeHtml(ctx.openUrl(b.id)) + '">Open second</a>' +
      "</div></div>";
  }

  function emptyHtml(state, hasAny) {
    if (!hasAny) {
      return '<div class="hist-empty">' +
        "<h2>No reports yet</h2>" +
        "<p>Run your first market report from the dashboard. Live reports are saved to your account and will show up here. You will only see your own reports.</p>" +
        '<a class="btn btn-amber" href="dashboard.html">Run a report</a>' +
      "</div>";
    }
    var n = activeFilterCount(state);
    return '<div class="hist-empty">' +
      "<h2>No reports match these filters</h2>" +
      "<p>" + (n ? "Try clearing a filter or search term." : "Nothing to show.") + "</p>" +
      '<button type="button" class="btn btn-ghost" data-clear-filters>Clear filters</button>' +
    "</div>";
  }

  function render() {
    if (!ctx) return;
    var state = stateFromDom();
    var view = ctx.view;
    var filtered = sortRows(applyFilters(ctx.rows, state), state.sort, ctx.pins);
    paintStats(ctx.rows);
    paintSourceCounts(ctx.rows);
    var list = $("[data-hist-list]");
    var empty = $("[data-hist-empty]");
    var count = $("[data-hist-count]");
    var compare = $("[data-hist-compare]");
    if (count) {
      var cap = ctx.capped ? " Showing the 500 most recent." : "";
      count.textContent = filtered.length === ctx.rows.length
        ? (ctx.rows.length ? filtered.length + " report" + (filtered.length === 1 ? "" : "s") + "." + cap : "")
        : filtered.length + " of " + ctx.rows.length + " reports match." + cap;
    }
    var toolbar = $("[data-hist-toolbar]");
    if (toolbar) toolbar.hidden = ctx.rows.length === 0;
    var statsEl = $("[data-hist-stats]");
    if (statsEl) statsEl.hidden = ctx.rows.length === 0;

    if (!filtered.length) {
      if (list) list.innerHTML = "";
      if (empty) { empty.hidden = false; empty.innerHTML = emptyHtml(state, ctx.rows.length > 0); }
    } else {
      if (empty) { empty.hidden = true; empty.innerHTML = ""; }
      if (list) {
        list.className = view === "list" ? "hist-list" : "hist-grid";
        list.setAttribute("data-hist-list", "");
        list.innerHTML = filtered.map(view === "list" ? listRowHtml : cardHtml).join("");
      }
    }

    $$("[data-view-btn]").forEach(function (b) {
      var on = b.getAttribute("data-view-btn") === view;
      b.classList.toggle("active", on);
      b.setAttribute("aria-pressed", String(on));
    });

    var selectedRows = ctx.selected.map(function (id) {
      return ctx.rows.filter(function (r) { return r.id === id; })[0];
    }).filter(Boolean);
    if (compare) {
      if (selectedRows.length === 2) {
        compare.hidden = false;
        compare.innerHTML = compareHtml(selectedRows[0], selectedRows[1]);
      } else {
        compare.hidden = true;
        compare.innerHTML = selectedRows.length === 1
          ? '<p class="muted hist-compare-hint">Select one more report to compare them side by side.</p>'
          : "";
        if (selectedRows.length === 1) compare.hidden = false;
      }
    }

    $$("[data-clear-filters]").forEach(function (clearBtn) {
      if (clearBtn.closest("[data-hist-empty]")) return;
      clearBtn.hidden = activeFilterCount(state) === 0;
    });
    bindDynamic();
  }

  function bindDynamic() {
    $$("[data-pick]").forEach(function (inp) {
      inp.addEventListener("change", function () {
        var id = inp.getAttribute("data-pick");
        var on = inp.checked;
        ctx.selected = ctx.selected.filter(function (x) { return x !== id; });
        if (on) {
          ctx.selected.push(id);
          if (ctx.selected.length > 2) ctx.selected = ctx.selected.slice(-2);
        }
        render();
      });
    });
    $$("[data-pin]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var id = btn.getAttribute("data-pin");
        var i = ctx.pins.indexOf(id);
        if (i === -1) ctx.pins.push(id);
        else ctx.pins.splice(i, 1);
        writePins(ctx.userId, ctx.pins);
        render();
      });
    });
    $$("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var id = btn.getAttribute("data-del");
        var row = ctx.rows.filter(function (r) { return r.id === id; })[0];
        var name = row && row.product ? row.product : "this report";
        if (!window.confirm("Delete “" + name + "” permanently? This cannot be undone.")) return;
        Promise.resolve(ctx.onDelete ? ctx.onDelete(id) : null).then(function (res) {
          if (res && res.error) {
            window.alert(res.error);
            return;
          }
          ctx.rows = ctx.rows.filter(function (r) { return r.id !== id; });
          ctx.selected = ctx.selected.filter(function (x) { return x !== id; });
          ctx.pins = ctx.pins.filter(function (x) { return x !== id; });
          writePins(ctx.userId, ctx.pins);
          fillMarkets(ctx.rows);
          render();
        }).catch(function (err) {
          window.alert((err && err.message) || "The report could not be deleted.");
        });
      });
    });
    var clearCmp = $("[data-clear-compare]");
    if (clearCmp) clearCmp.addEventListener("click", function () { ctx.selected = []; render(); });
    var clearF = $("[data-clear-filters]");
    if (clearF) clearF.addEventListener("click", clearFilters);
  }

  function clearFilters() {
    var s = $("[data-hist-search]"); if (s) s.value = "";
    var m = $("[data-hist-market]"); if (m) m.value = "";
    var k = $("[data-hist-kind]"); if (k) k.value = "all";
    var f = $("[data-hist-from]"); if (f) f.value = "";
    var t = $("[data-hist-to]"); if (t) t.value = "";
    var p = $("[data-hist-pinned]"); if (p) p.checked = false;
    $$("[data-source-chip]").forEach(function (b) { b.classList.remove("is-on"); b.setAttribute("aria-pressed", "false"); });
    render();
  }

  function bindStatic() {
    ["data-hist-search", "data-hist-market", "data-hist-kind", "data-hist-from", "data-hist-to", "data-hist-sort"].forEach(function (attr) {
      var el = $("[" + attr + "]");
      if (!el || el.getAttribute("data-hist-bound")) return;
      el.setAttribute("data-hist-bound", "1");
      el.addEventListener(attr === "data-hist-search" ? "input" : "change", render);
    });
    var pinOnly = $("[data-hist-pinned]");
    if (pinOnly && !pinOnly.getAttribute("data-hist-bound")) {
      pinOnly.setAttribute("data-hist-bound", "1");
      pinOnly.addEventListener("change", render);
    }
    $$("[data-source-chip]").forEach(function (b) {
      if (b.getAttribute("data-hist-bound")) return;
      b.setAttribute("data-hist-bound", "1");
      b.addEventListener("click", function () {
        b.classList.toggle("is-on");
        b.setAttribute("aria-pressed", b.classList.contains("is-on") ? "true" : "false");
        render();
      });
    });
    $$("[data-view-btn]").forEach(function (b) {
      if (b.getAttribute("data-hist-bound")) return;
      b.setAttribute("data-hist-bound", "1");
      b.addEventListener("click", function () {
        ctx.view = b.getAttribute("data-view-btn") === "list" ? "list" : "grid";
        writeView(ctx.view);
        render();
      });
    });
    var exp = $("[data-hist-export]");
    if (exp && !exp.getAttribute("data-hist-bound")) {
      exp.setAttribute("data-hist-bound", "1");
      exp.addEventListener("click", function () {
        var state = stateFromDom();
        var rows = sortRows(applyFilters(ctx.rows, state), state.sort, ctx.pins);
        var csv = toCsv(rows);
        var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "marketscope-reports-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      });
    }
    var clear = $("[data-clear-filters]");
    if (clear && !clear.getAttribute("data-hist-bound")) {
      clear.setAttribute("data-hist-bound", "1");
      clear.addEventListener("click", clearFilters);
    }
  }

  function init(opts) {
    opts = opts || {};
    ctx = {
      rows: (opts.rows || []).slice(),
      userId: opts.userId || "default",
      canDelete: !!opts.canDelete,
      onDelete: opts.onDelete || null,
      openUrl: opts.openUrl || function (id) { return "dashboard.html?report=" + encodeURIComponent(id); },
      pins: readPins(opts.userId),
      selected: [],
      view: opts.view || readView(),
      capped: !!opts.capped
    };
    fillMarkets(ctx.rows);
    bindStatic();
    if (opts.state) applyState(opts.state);
    render();
    return ctx;
  }

  function applyState(st) {
    st = st || {};
    var s = $("[data-hist-search]"); if (s && st.q != null) s.value = st.q;
    var m = $("[data-hist-market]"); if (m && st.market != null) m.value = st.market;
    var k = $("[data-hist-kind]"); if (k && st.kind != null) k.value = st.kind;
    var f = $("[data-hist-from]"); if (f && st.from != null) f.value = st.from;
    var t = $("[data-hist-to]"); if (t && st.to != null) t.value = st.to;
    var o = $("[data-hist-sort]"); if (o && st.sort != null) o.value = st.sort;
    var p = $("[data-hist-pinned]"); if (p && st.pinnedOnly != null) p.checked = !!st.pinnedOnly;
    if (st.view) ctx.view = st.view === "list" ? "list" : "grid";
    if (Array.isArray(st.pins)) ctx.pins = st.pins.slice();
    if (Array.isArray(st.selected)) ctx.selected = st.selected.slice(0, 2);
    (st.sources || []).forEach(function (id) {
      var b = $('[data-source-chip="' + id + '"]');
      if (b) { b.classList.add("is-on"); b.setAttribute("aria-pressed", "true"); }
    });
  }

  root.MSReportHistory = {
    SOURCE_DEFS: SOURCE_DEFS,
    sourcesUsed: sourcesUsed,
    opportunity: opportunity,
    medianPrice: medianPrice,
    isLive: isLive,
    applyFilters: applyFilters,
    sortRows: sortRows,
    stats: stats,
    toCsv: toCsv,
    init: init,
    render: render,
    getContext: function () { return ctx; }
  };
})(typeof window !== "undefined" ? window : this);
