/* MarketScope — Paste & Analyze (Import from URL).
   Client-side source detection only. Does not fetch or scrape the page.
   Product / category / price guesses come from the URL string itself
   and are labelled Early access. Live extraction is not connected. */
(function (global) {
  "use strict";
  var STORE_KEY = "ms_import_url";

  var SOURCES = [
    { id: "amazon", name: "Amazon", color: "#ffb000", hosts: /(^|\.)amazon\.[a-z.]+$/i, extra: /(^|\.)(amzn\.to|amzn\.com|a\.co)$/i },
    { id: "aliexpress", name: "AliExpress", color: "#ff8a3d", hosts: /(^|\.)aliexpress\.[a-z.]+$/i, extra: /(^|\.)(ali\.pub|s\.click\.aliexpress\.com)$/i },
    { id: "tiktok", name: "TikTok", color: "#ff4d5e", hosts: /(^|\.)tiktok\.com$/i, extra: /(^|\.)(vm|vt)\.tiktok\.com$/i },
    { id: "ebay", name: "eBay", color: "#4da3ff", hosts: /(^|\.)ebay\.[a-z.]+$/i, extra: /(^|\.)ebayto\.[a-z.]+$/i },
    { id: "etsy", name: "Etsy", color: "#ff8a3d", hosts: /(^|\.)etsy\.com$/i, extra: /(^|\.)etsy\.me$/i },
    { id: "walmart", name: "Walmart", color: "#4da3ff", hosts: /(^|\.)walmart\.[a-z.]+$/i },
    { id: "shopify", name: "Shopify store", color: "#19d27c", hosts: /(^|\.)myshopify\.com$/i }
  ];

  var MARKET_FROM_HOST = [
    [/amazon\.co\.uk$|ebay\.co\.uk$/i, "United Kingdom"],
    [/amazon\.de$|ebay\.de$|amazon\.at$/i, "Germany"],
    [/amazon\.fr$|ebay\.fr$/i, "France"],
    [/amazon\.it$|ebay\.it$/i, "Italy"],
    [/amazon\.es$|ebay\.es$/i, "Spain"],
    [/amazon\.ca$|walmart\.ca$|ebay\.ca$/i, "Canada"],
    [/amazon\.com\.au$|ebay\.com\.au$/i, "Australia"],
    [/amazon\.nl$|bol\.com$/i, "Netherlands"],
    [/amazon\.co\.il$|\.co\.il$/i, "Israel"],
    [/amazon\.com$|walmart\.com$|ebay\.com$|etsy\.com$/i, "United States"]
  ];

  function trim(s) { return String(s == null ? "" : s).trim(); }

  function normalizeUrl(raw) {
    var s = trim(raw);
    if (!s) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s)) s = "https://" + s;
    return s;
  }

  function parseUrl(raw) {
    var s = normalizeUrl(raw);
    if (!s) return { ok: false, error: "Paste a product link to get started." };
    var u;
    try { u = new URL(s); } catch (e) {
      return { ok: false, error: "That doesn’t look like a valid URL." };
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "Use an http or https product link." };
    }
    if (!u.hostname || u.hostname.indexOf(".") === -1) {
      return { ok: false, error: "That doesn’t look like a valid URL." };
    }
    return { ok: true, url: u.href, parsed: u };
  }

  function hostOf(u) {
    return (u.hostname || "").replace(/^www\./i, "").toLowerCase();
  }

  function matchSource(u) {
    var host = hostOf(u);
    var i, s;
    for (i = 0; i < SOURCES.length; i++) {
      s = SOURCES[i];
      if (s.hosts && s.hosts.test(host)) return s;
      if (s.extra && s.extra.test(host)) return s;
    }
    /* Shopify-style stores often use /products/<handle> on a custom domain. */
    if (/\/products\/[^/]+/i.test(u.pathname || "")) {
      return { id: "shopify", name: "Shopify store", color: "#19d27c", guessed: true };
    }
    if (/shop\.tiktok\.com|\/view\/product|\/shop\//i.test(u.href)) {
      return SOURCES.filter(function (x) { return x.id === "tiktok"; })[0];
    }
    return { id: "other", name: "Other site", color: "#8b95a3", guessed: true };
  }

  function humanize(slug) {
    try { slug = decodeURIComponent(slug); } catch (e) { /* keep raw */ }
    slug = String(slug || "")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[_+/]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\d+-/, ""); /* leading ids like 12345-product-name */
    var words = slug.split("-").filter(function (w) { return w && !/^(dp|gp|itm|ip|listing|product|products|item|shop)$/i.test(w) && !/^[A-Z0-9]{8,}$/.test(w); });
    if (!words.length) return "";
    return words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(" ");
  }

  function guessProduct(u, sourceId) {
    var path = u.pathname || "";
    var parts = path.split("/").filter(Boolean);
    var m;
    if (sourceId === "amazon") {
      m = path.match(/\/(?:gp\/product|dp|gp\/aw\/d)\/[A-Z0-9]{8,}/i);
      /* slug often sits just before /dp/ASIN */
      var pre = path.match(/\/([^/]+)\/(?:dp|gp\/product)\//i);
      if (pre) return humanize(pre[1]);
    }
    if (sourceId === "ebay") {
      m = path.match(/\/itm\/(?:[^/]+-)?(\d+)/i);
      var name = path.match(/\/itm\/([^/]+)\/\d+/i);
      if (name) return humanize(name[1]);
    }
    if (sourceId === "etsy") {
      m = path.match(/\/listing\/\d+\/([^/?#]+)/i);
      if (m) return humanize(m[1]);
    }
    if (sourceId === "walmart") {
      m = path.match(/\/ip\/([^/]+)(?:\/|$)/i);
      if (m) return humanize(m[1]);
    }
    if (sourceId === "shopify") {
      m = path.match(/\/products\/([^/?#]+)/i);
      if (m) return humanize(m[1]);
    }
    if (sourceId === "aliexpress") {
      m = path.match(/\/item\/(?:[^/]+\/)?([^/?#]+?)(?:\.html)?$/i);
      if (m) return humanize(m[1].replace(/_\d+$/, ""));
      /* many Ali URLs are just /item/123456.html — no title in the path */
    }
    if (sourceId === "tiktok") {
      m = path.match(/\/(product|view\/product|shop\/[^/]+\/[^/]+)\/([^/?#]+)/i);
      if (m) return humanize(m[2] || m[1]);
    }
    /* generic: last meaningful segment */
    for (var i = parts.length - 1; i >= 0; i--) {
      var h = humanize(parts[i]);
      if (h && h.length > 2 && !/^\d+$/.test(h)) return h;
    }
    return "";
  }

  function guessMarket(u) {
    var host = hostOf(u);
    for (var i = 0; i < MARKET_FROM_HOST.length; i++) {
      if (MARKET_FROM_HOST[i][0].test(host)) return MARKET_FROM_HOST[i][1];
    }
    return "";
  }

  function detect(raw) {
    var parsed = parseUrl(raw);
    if (!parsed.ok) return parsed;
    var source = matchSource(parsed.parsed);
    var product = guessProduct(parsed.parsed, source.id);
    var market = guessMarket(parsed.parsed);
    return {
      ok: true,
      url: parsed.url,
      source: source.id,
      sourceName: source.name,
      sourceColor: source.color,
      sourceGuessed: !!source.guessed,
      product: product,
      market: market,
      category: null,
      price: null,
      earlyAccess: true,
      note: "Early access: we detected the store from the URL pattern. Product name is guessed from the link. Price and category need live extraction, which is not connected yet."
    };
  }

  function hasSessionHint() {
    try {
      var keys = Object.keys(global.localStorage || {});
      return keys.some(function (k) { return /^sb-/.test(k) && /auth-token/.test(k); });
    } catch (e) { return false; }
  }

  function persist(url) {
    try { global.sessionStorage.setItem(STORE_KEY, url); } catch (e) { /* ignore */ }
  }

  function consume(alsoQuery) {
    var url = "";
    if (alsoQuery !== false) {
      try { url = new URLSearchParams(global.location.search).get("url") || ""; } catch (e) { url = ""; }
    }
    if (!url) {
      try { url = global.sessionStorage.getItem(STORE_KEY) || ""; } catch (e) { url = ""; }
    }
    if (url) persist(url);
    return url;
  }

  function destination(url) {
    var q = "url=" + encodeURIComponent(url) + "&tab=link";
    return (hasSessionHint() ? "dashboard.html?" : "signup.html?") + q;
  }

  function chipHtml(info) {
    if (!info || !info.ok) return "";
    var label = info.sourceName || "Unknown";
    return '<span class="source-chip-in" style="--chip:' + (info.sourceColor || "#ffb000") + '">' +
      '<i aria-hidden="true"></i>' + label + "</span>";
  }

  function bindInput(input, chip, msg) {
    if (!input) return;
    function paint() {
      var raw = input.value;
      if (!trim(raw)) {
        if (chip) { chip.hidden = true; chip.innerHTML = ""; }
        if (msg && msg.dataset.auto) { msg.textContent = ""; msg.className = "form-msg"; }
        return null;
      }
      var info = detect(raw);
      if (chip) {
        if (info.ok) { chip.hidden = false; chip.innerHTML = chipHtml(info); }
        else { chip.hidden = true; chip.innerHTML = ""; }
      }
      return info;
    }
    input.addEventListener("input", paint);
    input.addEventListener("paste", function () { setTimeout(paint, 0); });
    paint();
    return paint;
  }

  function bindHero() {
    var form = document.querySelector("[data-import-form]");
    if (!form) return;
    var input = form.querySelector("input[name=url], input[type=url], #hero-url");
    var chip = form.querySelector("[data-source-chip]");
    var msg = form.querySelector(".form-msg");
    bindInput(input, chip, msg);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var info = detect(input && input.value);
      if (!info.ok) {
        if (msg) { msg.className = "form-msg"; msg.textContent = info.error; }
        if (input) input.focus();
        return;
      }
      persist(info.url);
      global.location.href = destination(info.url);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindHero);
  } else {
    bindHero();
  }

  global.MSImport = {
    sources: SOURCES,
    detect: detect,
    normalizeUrl: normalizeUrl,
    persist: persist,
    consume: consume,
    destination: destination,
    bindInput: bindInput,
    chipHtml: chipHtml,
    hasSessionHint: hasSessionHint
  };
})(window);
