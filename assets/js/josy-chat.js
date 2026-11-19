/* Josy Market — chat page */
import {
  requireSession, callJosy, $, $$, esc, dirOf, isRtl, toast, copyText, download, slug, confirmDialog,
  renderMarkdown, bindCodeCopy, sourceChips, demandCard, icon, relTime, JOSY_LIMITS, PLAN_NAMES
} from "./josy-core.js";
import { autoBell } from "./josy-notify.js";

var S = { sb: null, user: null, convs: [], current: null, messages: [], busy: false, market: "US", usage: null, credits: null, starterLang: "en" };

var STARTERS = {
  en: [
    { ico: "search", t: "Check demand for a niche", d: "Compare live search demand for a few product ideas.", p: "Check US demand for: posture corrector, back stretcher, lumbar support pillow. Which one should I market first and why?", cost: true },
    { ico: "cal", t: "Build a 2-week content calendar", d: "Ready-to-post short videos and posts, saved to My plans.", p: "Create and save a 2-week organic content calendar for my store that sells eco-friendly kitchen products. Instagram + TikTok, 4 posts a week." },
    { ico: "video", t: "10 short-video ideas", d: "Hooks, scripts and shot lists for short-video feeds.", p: "Give me 10 short-video ideas with a strong 2-second hook and a 20-second script outline for a magnetic phone mount." },
    { ico: "seo", t: "SEO plan from real demand", d: "Find keywords with real volume, then get article briefs.", p: "I sell handmade leather wallets in the US. Find keyword opportunities with real search demand and give me 5 blog article briefs.", cost: true },
    { ico: "pen", t: "Write launch posts", d: "Captions + hashtags for a product launch week.", p: "Write 5 Instagram captions with hashtags for the launch week of a new insulated water bottle. Friendly, energetic tone." },
    { ico: "plan", t: "Full organic marketing plan", d: "Audience, positioning, channels and a 30-day action list.", p: "Build and save a 30-day organic marketing plan for a new online store selling pet grooming tools. Include audience, positioning, channels and weekly actions." }
  ],
  he: [
    { ico: "search", t: "בדיקת ביקוש לנישה", d: "השוואת ביקוש חי בחיפוש לכמה רעיונות למוצר.", p: "תבדקי ביקוש בישראל ל: מעמד לטלפון לרכב, מטען אלחוטי, כבל טעינה מהיר. על איזה כדאי לי לעשות שיווק קודם ולמה?", cost: true },
    { ico: "cal", t: "לוח תוכן לשבועיים", d: "סרטונים קצרים ופוסטים מוכנים — נשמר בתוכניות שלי.", p: "תבני ותשמרי לוח תוכן אורגני לשבועיים לחנות שמוכרת מוצרי מטבח ידידותיים לסביבה. אינסטגרם + טיקטוק, 4 פוסטים בשבוע." },
    { ico: "video", t: "10 רעיונות לסרטונים קצרים", d: "הוקים, תסריטים ורשימת צילומים לסרטונים קצרים.", p: "תני לי 10 רעיונות לסרטונים קצרים עם הוק חזק ב-2 השניות הראשונות ותסריט של 20 שניות למעמד מגנטי לטלפון." },
    { ico: "seo", t: "תוכנית SEO לפי ביקוש אמיתי", d: "מילות מפתח עם נפח חיפוש אמיתי + בריפים למאמרים.", p: "אני מוכר ארנקי עור בעבודת יד בישראל. תמצאי הזדמנויות למילות מפתח עם ביקוש אמיתי ותני לי 5 בריפים למאמרים בבלוג.", cost: true },
    { ico: "pen", t: "פוסטים להשקה", d: "כיתובים + האשטגים לשבוע השקה של מוצר.", p: "תכתבי 5 כיתובים לאינסטגרם עם האשטגים לשבוע ההשקה של בקבוק מים תרמי חדש. טון חברי ואנרגטי." },
    { ico: "plan", t: "תוכנית שיווק אורגנית מלאה", d: "קהל יעד, מיצוב, ערוצים ותוכנית פעולה ל-30 יום.", p: "תבני ותשמרי תוכנית שיווק אורגנית ל-30 יום לחנות אונליין חדשה של כלי טיפוח לחיות מחמד. כולל קהל יעד, מיצוב, ערוצים ופעולות שבועיות." }
  ]
};

/* ---------- boot ---------- */
async function boot() {
  var r = await requireSession("josy-chat.html");
  if (!r.session) {
    if (!r.sb) $("[data-gate]").innerHTML = "<p>Accounts are not configured yet.</p>";
    return;
  }
  S.sb = r.sb; S.user = r.session.user;
  autoBell(S.sb);
  S.market = localStorage.getItem("josy.market") || "US";
  S.starterLang = localStorage.getItem("josy.lang") || ((navigator.language || "").toLowerCase().indexOf("he") === 0 ? "he" : "en");
  $("[data-gate]").hidden = true;
  $("[data-shell]").hidden = false;
  document.body.classList.add("josy-app");
  var sel = $("[data-market]"); sel.value = S.market;
  sel.addEventListener("change", function () { S.market = sel.value; localStorage.setItem("josy.market", S.market); });

  bindUi();
  refreshStatus();
  await loadConversations();
  var m = location.hash.match(/c=([0-9a-f-]{36})/i);
  if (m && S.convs.some(function (c) { return c.id === m[1]; })) await openConversation(m[1]);
  else renderWelcome();
}

/* ---------- status / usage ---------- */
async function refreshStatus() {
  var r = await callJosy(S.sb, { action: "status" });
  if (!r.ok) return;
  S.usage = r.data.usage; S.credits = r.data.credits;
  renderUsage();
  if (r.data.ai_configured === false) banner("Josy's AI is being set up and can't answer yet. Please check back soon.", false);
}
function renderUsage() {
  var u = S.usage; if (!u) return;
  var left = Math.max(0, u.limit - u.used);
  var pct = u.limit ? Math.min(100, (u.used / u.limit) * 100) : 0;
  $("[data-usage-left]").textContent = left + " / " + u.limit;
  var bar = $("[data-usage-bar]"); bar.style.width = pct + "%";
  bar.parentNode.classList.toggle("low", left <= Math.max(1, Math.round(u.limit * 0.1)));
  var planName = PLAN_NAMES[u.plan] || u.plan;
  var upsell = u.plan === "pro" ? "" : ' · <a href="pricing.html">Upgrade</a>';
  $("[data-usage-note]").innerHTML = esc(planName) + " plan · messages left today (resets 00:00 UTC)<br>" +
    "Credits: <b>" + esc(S.credits == null ? "—" : S.credits) + "</b> · 1 per live demand check" + upsell;
}

/* ---------- conversations ---------- */
async function loadConversations() {
  var r = await S.sb.from("josy_conversations").select("id, title, updated_at").order("updated_at", { ascending: false }).limit(100);
  S.convs = r.data || [];
  renderConvs();
}
function renderConvs() {
  var list = $("[data-conv-list]");
  if (!S.convs.length) {
    list.innerHTML = '<div class="conv-empty">No chats yet. Your conversations with Josy will appear here.</div>';
    return;
  }
  list.innerHTML = S.convs.map(function (c) {
    return '<div class="conv' + (c.id === S.current ? " active" : "") + '" data-id="' + c.id + '">' +
      '<button type="button" class="conv-open" data-open dir="auto" title="' + esc(c.title) + '">' + esc(c.title) + "<small>" + esc(relTime(c.updated_at)) + "</small></button>" +
      '<span class="conv-act"><button type="button" class="icon-btn" data-rename aria-label="Rename chat">' + icon("edit") + "</button>" +
      '<button type="button" class="icon-btn danger" data-del aria-label="Delete chat">' + icon("trash") + "</button></span></div>";
  }).join("");
}
async function openConversation(id) {
  S.current = id;
  history.replaceState(null, "", "#c=" + id);
  renderConvs();
  closeSide();
  var conv = S.convs.find(function (c) { return c.id === id; });
  setTitle(conv ? conv.title : "Chat");
  var col = $("[data-chat]");
  col.innerHTML = '<div class="typing" style="justify-content:center;padding:40px 0"><span class="dots"><i></i><i></i><i></i></span>Loading chat…</div>';
  var r = await S.sb.from("josy_messages").select("id, role, content, meta, created_at").eq("conversation_id", id).order("id", { ascending: true }).limit(500);
  S.messages = r.data || [];
  renderMessages();
}
function newChat() {
  S.current = null; S.messages = [];
  history.replaceState(null, "", location.pathname);
  renderConvs(); setTitle("New chat"); renderWelcome(); closeSide();
  $("[data-input]").focus();
}
function setTitle(t) { var h = $("[data-chat-title]"); h.textContent = t; h.setAttribute("dir", "auto"); }

/* ---------- rendering ---------- */
function renderWelcome() {
  var items = STARTERS[S.starterLang] || STARTERS.en;
  var he = S.starterLang === "he";
  $("[data-chat]").innerHTML =
    '<div class="welcome"><span class="josy-mark xl"><img src="favicon.svg" alt=""></span>' +
    "<h2>" + (he ? "היי, אני Josy 👋" : "Hi, I'm Josy 👋") + "</h2>" +
    '<p class="sub">' + (he ? "עוזרת השיווק האורגני של MarketScope. אני בודקת ביקוש אמיתי, כותבת תוכן ובונה תוכניות — ושומרת אותן בשבילך." : "MarketScope's organic marketing assistant. I check real demand, write the content, and build plans — then save them for you.") + "</p>" +
    '<div class="src-row"><span class="src-chip ai">' + icon("spark") + 'Josy AI</span><span class="src-chip data">' + icon("search") + "Search data · DataForSEO via MarketScope</span></div>" +
    '<div class="lang-tabs" role="group" aria-label="Starter language"><button type="button" data-lang="en" aria-pressed="' + !he + '">English</button><button type="button" data-lang="he" aria-pressed="' + he + '">עברית</button></div>' +
    '<div class="starters" dir="' + (he ? "rtl" : "ltr") + '">' + items.map(function (s, i) {
      return '<button type="button" class="starter" data-starter="' + i + '"><span class="ico">' + icon(s.ico) + "</span><span><b>" + esc(s.t) + "</b><span>" + esc(s.d) + "</span>" +
        (s.cost ? '<span class="cost">' + (he ? "בדיקת ביקוש חי · קרדיט 1" : "Live demand check · 1 credit") + "</span>" : "") + "</span></button>";
    }).join("") + "</div></div>";
}
function msgHtml(m, idx, isLast) {
  if (m.role === "user") {
    return '<div class="m m-user" data-idx="' + idx + '"><div class="bubble" dir="' + dirOf(m.content) + '">' + esc(m.content) + "</div></div>";
  }
  var meta = m.meta || {};
  var demand = (meta.demand || []).map(demandCard).join("");
  var actions = '<div class="m-actions">' +
    '<button type="button" class="icon-btn" data-copy aria-label="Copy reply" title="Copy">' + icon("copy") + "</button>" +
    '<button type="button" class="icon-btn" data-export aria-label="Download reply as Markdown" title="Download .md">' + icon("dl") + "</button>" +
    (isLast ? '<button type="button" class="icon-btn" data-regen aria-label="Regenerate reply" title="Regenerate (uses 1 message)">' + icon("redo") + "</button>" : "") +
    "</div>";
  return '<div class="m m-ai" data-idx="' + idx + '"><span class="josy-mark sm"><img src="favicon.svg" alt=""></span><div class="body">' +
    '<div class="meta"><b>Josy</b>' + (m.created_at ? "<span>" + esc(relTime(m.created_at)) + "</span>" : "") + (meta.credits_charged ? '<span>· ' + meta.credits_charged + " credit used</span>" : "") + "</div>" +
    '<div class="md" dir="' + dirOf(m.content) + '">' + renderMarkdown(m.content) + "</div>" + demand + sourceChips(meta) + actions + "</div></div>";
}
function renderMessages() {
  var col = $("[data-chat]");
  if (!S.messages.length) { renderWelcome(); return; }
  var lastAi = -1;
  S.messages.forEach(function (m, i) { if (m.role === "assistant") lastAi = i; });
  col.innerHTML = S.messages.map(function (m, i) { return msgHtml(m, i, i === lastAi && i === S.messages.length - 1); }).join("");
  scrollDown();
}
function scrollDown() { var sc = $("[data-scroll]"); requestAnimationFrame(function () { sc.scrollTop = sc.scrollHeight; }); }

var typingTimer = null;
function showTyping() {
  var col = $("[data-chat]");
  var w = $(".welcome", col); if (w) w.remove();
  var el = document.createElement("div");
  el.className = "m m-ai"; el.setAttribute("data-typing", "");
  el.innerHTML = '<span class="josy-mark sm"><img src="favicon.svg" alt=""></span><div class="body"><div class="meta"><b>Josy</b></div><div class="typing"><span class="dots"><i></i><i></i><i></i></span><span class="typing-step" data-step>Thinking…</span></div></div>';
  col.appendChild(el); scrollDown();
  var t0 = Date.now();
  typingTimer = setInterval(function () {
    var s = (Date.now() - t0) / 1000, step = $("[data-step]", el); if (!step) return;
    step.textContent = s < 8 ? "Thinking…" : s < 25 ? "Working on it — running tools if needed…" : s < 60 ? "Still working — bigger plans take longer…" : "Almost there — the AI is busy right now…";
  }, 1000);
}
function hideTyping() { clearInterval(typingTimer); var t = $("[data-typing]"); if (t) t.remove(); }

function banner(text, isError) {
  var b = $("[data-banner]");
  b.className = "banner" + (isError ? "" : " info");
  b.innerHTML = text; b.hidden = false;
}

/* ---------- send ---------- */
async function send(text, opts) {
  opts = opts || {};
  if (S.busy) return;
  text = (text || "").trim();
  if (!opts.regenerate && !text) return;
  if (S.usage && S.usage.used >= S.usage.limit) {
    banner("You've used all " + S.usage.limit + " Josy messages for today. They reset at 00:00 UTC — or <a href=\"pricing.html\">upgrade your plan</a> for more.", true);
    return;
  }
  S.busy = true; setBusy(true);
  $("[data-banner]").hidden = true;
  if (!opts.regenerate) {
    S.messages.push({ role: "user", content: text, created_at: new Date().toISOString() });
    renderMessages();
    var inp = $("[data-input]"); inp.value = ""; autosize(inp);
  }
  showTyping();
  var payload = opts.regenerate ? { conversation_id: S.current, regenerate: true, market: S.market } :
    { message: text, conversation_id: S.current, market: S.market, lang: isRtl(text) ? "he" : "en" };
  var r = await callJosy(S.sb, payload);
  hideTyping();
  S.busy = false; setBusy(false);
  if (r.data && r.data.usage) { S.usage = r.data.usage; }
  if (r.data && typeof r.data.credits === "number") S.credits = r.data.credits;
  renderUsage();

  if (!r.ok) {
    var err = (r.data && r.data.error) || "Josy could not answer right now.";
    if (r.status === 401) { location.replace("login.html?next=josy-chat.html"); return; }
    if (!opts.regenerate) {
      S.messages.pop(); renderMessages();
      var inp2 = $("[data-input]"); inp2.value = text; autosize(inp2);
    } else renderMessages();
    var col = $("[data-chat]");
    var w = $(".welcome", col); if (w && S.messages.length) w.remove();
    var el = document.createElement("div");
    el.className = "m m-ai m-error";
    el.innerHTML = '<span class="josy-mark sm"><img src="favicon.svg" alt=""></span><div class="body"><div class="meta"><b>Josy</b></div><div class="bubble-err">' + esc(err) +
      (r.data && r.data.code === "daily_limit" ? ' <a href="pricing.html" style="color:var(--amber)">See plans</a>' : "") +
      '</div><div class="m-actions" style="opacity:1"><button type="button" class="btn btn-sm btn-ghost" data-retry style="margin:0">' + icon("redo", "") + " Try again</button></div></div>";
    el.querySelector("[data-retry]").onclick = function () { el.remove(); if (opts.regenerate) send("", { regenerate: true }); else send($("[data-input]").value); };
    col.appendChild(el); scrollDown();
    return;
  }
  var d = r.data;
  var wasNew = !S.current;
  S.current = d.conversation_id;
  if (opts.regenerate && S.messages.length && S.messages[S.messages.length - 1].role === "assistant") S.messages.pop();
  S.messages.push({ id: d.message_id, role: "assistant", content: d.reply, created_at: new Date().toISOString(),
    meta: { sources: d.sources, demand: d.demand, plan_ids: d.plan_ids, credits_charged: d.credits_charged } });
  renderMessages();
  if (d.plan_ids && d.plan_ids.length) toast(d.plan_ids.length > 1 ? "Plans saved to My plans" : "Saved to My plans");
  if (wasNew) { history.replaceState(null, "", "#c=" + S.current); await loadConversations(); var c = S.convs.find(function (x) { return x.id === S.current; }); setTitle(c ? c.title : "Chat"); }
  else { var cv = S.convs.find(function (x) { return x.id === S.current; }); if (cv) { cv.updated_at = new Date().toISOString(); S.convs.sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; }); renderConvs(); } }
}
function setBusy(b) { $("[data-send]").disabled = b || !$("[data-input]").value.trim(); $("[data-input]").setAttribute("aria-busy", String(b)); }

function autosize(el) {
  el.style.height = "auto"; el.style.height = Math.min(220, el.scrollHeight) + "px";
  el.setAttribute("dir", el.value.trim() ? dirOf(el.value) : "auto");
  var n = el.value.length; var c = $("[data-count]");
  c.textContent = n > 3200 ? n + " / 4000" : "Enter to send · Shift+Enter for a new line";
  $("[data-send]").disabled = S.busy || !el.value.trim() || n > 4000;
}

function convToMarkdown() {
  var conv = S.convs.find(function (c) { return c.id === S.current; });
  var md = "# " + (conv ? conv.title : "Josy chat") + "\n\n_Exported from Josy · MarketScope · " + new Date().toLocaleString() + "_\n\n";
  S.messages.forEach(function (m) { md += (m.role === "user" ? "## You\n\n" : "## Josy\n\n") + m.content + "\n\n"; });
  return md;
}

/* ---------- events ---------- */
function closeSide() { $("[data-side]").classList.remove("open"); var s = $(".side-scrim"); if (s) s.remove(); }
function bindUi() {
  var inp = $("[data-input]");
  inp.addEventListener("input", function () { autosize(inp); });
  inp.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(inp.value); }
  });
  $("[data-composer]").addEventListener("submit", function (e) { e.preventDefault(); send(inp.value); });
  $$("[data-new]").forEach(function (b) { b.addEventListener("click", newChat); });
  $("[data-export-chat]").addEventListener("click", function () {
    if (!S.messages.length) { toast("Nothing to export yet"); return; }
    var conv = S.convs.find(function (c) { return c.id === S.current; });
    download("josy-" + slug(conv ? conv.title : "chat") + ".md", convToMarkdown());
  });
  $("[data-side-toggle]").addEventListener("click", function () {
    var side = $("[data-side]");
    if (side.classList.contains("open")) { closeSide(); return; }
    side.classList.add("open");
    var scrim = document.createElement("div"); scrim.className = "side-scrim"; scrim.onclick = closeSide; document.body.appendChild(scrim);
  });

  $("[data-conv-list]").addEventListener("click", async function (e) {
    var row = e.target.closest(".conv"); if (!row) return;
    var id = row.getAttribute("data-id");
    if (e.target.closest("[data-open]")) { if (id !== S.current && !S.busy) openConversation(id); return; }
    if (e.target.closest("[data-del]")) {
      var ok = await confirmDialog("Delete this chat?", "The conversation and its messages will be removed. Plans you saved stay in My plans.", "Delete chat");
      if (!ok) return;
      var r = await S.sb.from("josy_conversations").delete().eq("id", id);
      if (r.error) { toast("Could not delete the chat"); return; }
      S.convs = S.convs.filter(function (c) { return c.id !== id; });
      if (id === S.current) newChat(); else renderConvs();
      toast("Chat deleted");
      return;
    }
    if (e.target.closest("[data-rename]")) {
      var conv = S.convs.find(function (c) { return c.id === id; });
      var open = $("[data-open]", row);
      var input = document.createElement("input");
      input.className = "conv-rename"; input.value = conv.title; input.maxLength = 120; input.setAttribute("dir", "auto"); input.setAttribute("aria-label", "Chat name");
      open.replaceWith(input); input.focus(); input.select();
      var finish = async function (save) {
        input.onblur = null;
        var v = input.value.trim().slice(0, 120);
        if (save && v && v !== conv.title) {
          var r2 = await S.sb.from("josy_conversations").update({ title: v }).eq("id", id);
          if (!r2.error) { conv.title = v; if (id === S.current) setTitle(v); toast("Chat renamed"); } else toast("Could not rename");
        }
        renderConvs();
      };
      input.onkeydown = function (ev) { if (ev.key === "Enter") finish(true); if (ev.key === "Escape") finish(false); };
      input.onblur = function () { finish(true); };
    }
  });

  $("[data-chat]").addEventListener("click", function (e) {
    var st = e.target.closest("[data-starter]");
    if (st) { var s = (STARTERS[S.starterLang] || STARTERS.en)[+st.getAttribute("data-starter")]; inp.value = s.p; autosize(inp); inp.focus(); return; }
    var lg = e.target.closest("[data-lang]");
    if (lg) { S.starterLang = lg.getAttribute("data-lang"); localStorage.setItem("josy.lang", S.starterLang); renderWelcome(); return; }
    var rel = e.target.closest("[data-rel]");
    if (rel) { var kw = rel.getAttribute("data-rel"); inp.value = (isRtl(kw) ? "תבדקי ביקוש ל: " : "Check demand for: ") + kw; autosize(inp); inp.focus(); return; }
    var m = e.target.closest(".m"); if (!m) return;
    var msg = S.messages[+m.getAttribute("data-idx")];
    if (e.target.closest("[data-copy]") && msg) copyText(msg.content);
    if (e.target.closest("[data-export]") && msg) download("josy-reply-" + new Date().toISOString().slice(0, 10) + ".md", msg.content);
    if (e.target.closest("[data-regen]") && !S.busy) send("", { regenerate: true });
  });
  bindCodeCopy($("[data-chat]"));
  autosize(inp);
}

boot();
