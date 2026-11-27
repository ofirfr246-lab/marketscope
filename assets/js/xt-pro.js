/* MarketScope Exchange pro chart layer. Simulation only. No TradingView branding.
   Draws on a canvas over Lightweight Charts; oscillators use sibling chart panes. */
var FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
var AMBER = "#ffb000", TEXT = "#e9ecef", MUTED = "#a8b0bb", DIM = "#8f99a6";
var UP = "#19d27c", DOWN = "#ff4d5e";

export var INDICATORS = [
  { id: "sma", name: "SMA", pane: false, params: { period: 9 }, hint: "Simple moving average on the price pane" },
  { id: "ema", name: "EMA", pane: false, params: { period: 21 }, hint: "Exponential moving average on the price pane" },
  { id: "bb", name: "Bollinger Bands", pane: false, params: { period: 20, stdev: 2 }, hint: "SMA ± standard deviations" },
  { id: "rsi", name: "RSI", pane: true, params: { period: 14 }, hint: "Relative Strength Index (0–100)" },
  { id: "macd", name: "MACD", pane: true, params: { fast: 12, slow: 26, signal: 9 }, hint: "MACD, signal and histogram" },
  { id: "vol", name: "Volume", pane: false, params: {}, hint: "Monthly search volume as histogram (when present in snapshots)" },
  { id: "vwap", name: "VWAP-like", pane: false, params: {}, hint: "Cumulative typical-price × search volume / volume. Equal-weight if volume is missing." },
  { id: "stoch", name: "Stochastic", pane: true, params: { k: 14, d: 3, smooth: 3 }, hint: "Stochastic %K and %D" },
  { id: "atr", name: "ATR", pane: true, params: { period: 14 }, hint: "Average True Range of the index series" }
];

export function heikinAshi(candles) {
  var out = [];
  for (var i = 0; i < candles.length; i++) {
    var c = candles[i];
    var close = (c.open + c.high + c.low + c.close) / 4;
    var open = i === 0 ? (c.open + c.close) / 2 : (out[i - 1].open + out[i - 1].close) / 2;
    out.push({
      time: c.time,
      open: open,
      close: close,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      vol: c.vol, n: c.n, demand: c.demand, comp: c.comp
    });
  }
  return out;
}

function smaVals(closes, n) {
  var out = new Array(closes.length).fill(null);
  var s = 0;
  for (var i = 0; i < closes.length; i++) {
    s += closes[i];
    if (i >= n) s -= closes[i - n];
    if (i >= n - 1) out[i] = s / n;
  }
  return out;
}
function emaVals(closes, n) {
  var out = new Array(closes.length).fill(null);
  var k = 2 / (n + 1), prev = null;
  for (var i = 0; i < closes.length; i++) {
    prev = prev == null ? closes[i] : closes[i] * k + prev * (1 - k);
    if (i >= n - 1) out[i] = prev;
  }
  return out;
}

export function computeIndicator(id, candles, params) {
  params = params || {};
  var t = candles.map(function (c) { return c.time; });
  var c = candles.map(function (x) { return x.close; });
  function line(vals) {
    return t.map(function (tm, i) { return vals[i] == null ? null : { time: tm, value: +vals[i].toFixed(4) }; }).filter(Boolean);
  }
  if (id === "sma") return { overlay: [{ name: "SMA " + (params.period || 9), color: AMBER, data: line(smaVals(c, +params.period || 9)) }] };
  if (id === "ema") return { overlay: [{ name: "EMA " + (params.period || 21), color: "#c0c5cd", data: line(emaVals(c, +params.period || 21)) }] };
  if (id === "bb") {
    var p = +params.period || 20, sd = +params.stdev || 2;
    var mid = smaVals(c, p), up = [], dn = [];
    for (var i = 0; i < c.length; i++) {
      if (mid[i] == null) { up[i] = dn[i] = null; continue; }
      var v = 0;
      for (var j = i - p + 1; j <= i; j++) v += Math.pow(c[j] - mid[i], 2);
      var s = Math.sqrt(v / p);
      up[i] = mid[i] + sd * s; dn[i] = mid[i] - sd * s;
    }
    return { overlay: [
      { name: "BB mid", color: MUTED, data: line(mid) },
      { name: "BB up", color: DIM, data: line(up) },
      { name: "BB dn", color: DIM, data: line(dn) }
    ] };
  }
  if (id === "vwap") {
    var cumPV = 0, cumV = 0, vals = [];
    var anyVol = candles.some(function (x) { return x.vol != null && x.vol > 0; });
    for (var i = 0; i < candles.length; i++) {
      var typ = (candles[i].high + candles[i].low + candles[i].close) / 3;
      var vol = anyVol ? (candles[i].vol || 0) : 1;
      cumPV += typ * vol; cumV += vol;
      vals[i] = cumV ? cumPV / cumV : typ;
    }
    return { overlay: [{ name: anyVol ? "VWAP-like" : "VWAP-like (equal weight)", color: "#c8b896", data: line(vals) }] };
  }
  if (id === "rsi") {
    var n = +params.period || 14, ag = 0, al = 0, vals = [];
    for (var i = 1; i < c.length; i++) {
      var ch = c[i] - c[i - 1], g = Math.max(ch, 0), l = Math.max(-ch, 0);
      if (i <= n) { ag += g; al += l; vals[i] = i === n ? 100 - 100 / (1 + (ag / n) / ((al / n) || 1e-9)) : null; }
      else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; vals[i] = 100 - 100 / (1 + ag / (al || 1e-9)); }
    }
    return { pane: { name: "RSI " + n, min: 0, max: 100, series: [{ name: "RSI", color: AMBER, data: line(vals) }], levels: [30, 70] } };
  }
  if (id === "macd") {
    var f = +params.fast || 12, s = +params.slow || 26, sig = +params.signal || 9;
    var ef = emaVals(c, f), es = emaVals(c, s), macd = c.map(function (_, i) { return ef[i] != null && es[i] != null ? ef[i] - es[i] : null; });
    var macdNums = macd.map(function (v) { return v == null ? 0 : v; });
    var signal = emaVals(macdNums, sig);
    for (var i = 0; i < signal.length; i++) if (macd[i] == null) signal[i] = null;
    var hist = macd.map(function (v, i) { return v != null && signal[i] != null ? v - signal[i] : null; });
    return { pane: { name: "MACD", series: [
      { name: "MACD", color: AMBER, data: line(macd) },
      { name: "Signal", color: "#c0c5cd", data: line(signal) },
      { name: "Hist", type: "hist", data: t.map(function (tm, i) { return hist[i] == null ? null : { time: tm, value: +hist[i].toFixed(4), color: hist[i] >= 0 ? "rgba(25,210,124,.55)" : "rgba(255,77,94,.55)" }; }).filter(Boolean) }
    ] } };
  }
  if (id === "stoch") {
    var kN = +params.k || 14, dN = +params.d || 3, sm = +params.smooth || 3;
    var kRaw = [];
    for (var i = 0; i < candles.length; i++) {
      if (i < kN - 1) { kRaw[i] = null; continue; }
      var hi = -1e9, lo = 1e9;
      for (var j = i - kN + 1; j <= i; j++) { hi = Math.max(hi, candles[j].high); lo = Math.min(lo, candles[j].low); }
      kRaw[i] = hi === lo ? 50 : 100 * (candles[i].close - lo) / (hi - lo);
    }
    var kS = smaVals(kRaw.map(function (v) { return v == null ? 0 : v; }), sm);
    for (var i = 0; i < kS.length; i++) if (kRaw[i] == null || i < kN - 2 + sm) kS[i] = null;
    var dS = smaVals(kS.map(function (v) { return v == null ? 0 : v; }), dN);
    for (var i = 0; i < dS.length; i++) if (kS[i] == null) dS[i] = null;
    return { pane: { name: "Stoch", min: 0, max: 100, series: [
      { name: "%K", color: AMBER, data: line(kS) },
      { name: "%D", color: "#c0c5cd", data: line(dS) }
    ], levels: [20, 80] } };
  }
  if (id === "atr") {
    var n = +params.period || 14, tr = [0], vals = [];
    for (var i = 1; i < candles.length; i++) {
      var prev = candles[i - 1].close;
      tr[i] = Math.max(candles[i].high - candles[i].low, Math.abs(candles[i].high - prev), Math.abs(candles[i].low - prev));
    }
    var s = 0;
    for (var i = 1; i < candles.length; i++) {
      s += tr[i];
      if (i >= n) { s -= tr[i - n]; vals[i] = s / n; }
      else vals[i] = null;
    }
    return { pane: { name: "ATR " + n, series: [{ name: "ATR", color: MUTED, data: line(vals) }] } };
  }
  return {};
}

/* ---------- persistence ---------- */
function userKey(uid, base) { return base + ":" + (uid || "anon"); }
export function loadLayout(uid, symbol) {
  try { return JSON.parse(localStorage.getItem(userKey(uid, "ms_xt_layout") + ":" + symbol) || "null"); } catch (e) { return null; }
}
export function saveLayout(uid, symbol, data) {
  try { localStorage.setItem(userKey(uid, "ms_xt_layout") + ":" + symbol, JSON.stringify(data)); } catch (e) {}
}

export function alertStore(uid) {
  var key = userKey(uid, "ms_xt_alerts");
  function all() { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(key, JSON.stringify(a)); } catch (e) {} }
  return {
    list: all,
    add: function (row) { var a = all(); row.id = row.id || ("a" + Date.now() + Math.random().toString(36).slice(2, 6)); a.push(row); write(a); return row; },
    remove: function (id) { write(all().filter(function (x) { return x.id !== id; })); },
    markFired: function (id) {
      write(all().map(function (x) { if (x.id === id) { x.firedAt = new Date().toISOString(); x.active = false; } return x; }));
    }
  };
}
export function stopStore(uid) {
  var key = userKey(uid, "ms_xt_stops");
  function all() { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function write(a) { try { localStorage.setItem(key, JSON.stringify(a)); } catch (e) {} }
  return {
    list: all,
    add: function (row) { var a = all(); row.id = row.id || ("s" + Date.now()); row.status = "open"; a.push(row); write(a); return row; },
    remove: function (id) { write(all().filter(function (x) { return x.id !== id; })); },
    mark: function (id, status) { write(all().map(function (x) { if (x.id === id) x.status = status; return x; })); }
  };
}

/* Check price alerts against a last-value map {symbol: number}. Returns newly fired. */
export function checkAlerts(store, lastMap) {
  var fired = [];
  store.list().forEach(function (a) {
    if (a.active === false) return;
    var px = lastMap[a.symbol];
    if (px == null) return;
    var hit = a.op === ">=" ? px >= a.price : px <= a.price;
    if (hit) { store.markFired(a.id); fired.push(Object.assign({}, a, { last: px })); }
  });
  return fired;
}
export function checkStops(store, lastMap) {
  var hit = [];
  store.list().forEach(function (s) {
    if (s.status !== "open") return;
    var px = lastMap[s.symbol];
    if (px == null) return;
    var ok = s.side === "buy" ? px >= s.stop : px <= s.stop;
    if (ok) hit.push(s);
  });
  return hit;
}

/* ---------- drawing overlay ---------- */
export function DrawingOverlay(opts) {
  this.wrap = opts.wrap;
  this.getChart = opts.getChart;
  this.getSeries = opts.getSeries;
  this.getCandles = opts.getCandles || function () { return []; };
  this.onChange = opts.onChange || function () {};
  this.tool = "cursor";
  this.stay = false;
  this.magnet = false;
  this.locked = false;
  this.hidden = false;
  this.items = [];
  this.undo = [];
  this.redo = [];
  this.draft = null;
  this.hover = null;
  this.canvas = document.createElement("canvas");
  this.canvas.className = "xt-draw-cv";
  this.canvas.setAttribute("aria-hidden", "true");
  this.wrap.appendChild(this.canvas);
  this.ctx = this.canvas.getContext("2d");
  this._ro = new ResizeObserver(this.resize.bind(this));
  this._ro.observe(this.wrap);
  this.resize();
  this._bind();
  this._syncPointer();
}
DrawingOverlay.prototype.setTool = function (t) {
  this.tool = t || "cursor";
  this.draft = null;
  this._syncPointer();
  this.redraw();
};
DrawingOverlay.prototype._syncPointer = function () {
  this.canvas.style.pointerEvents = this.tool === "cursor" ? "none" : "auto";
  this.canvas.style.cursor = this.tool === "cursor" ? "default" : (this.tool === "eraser" ? "cell" : "crosshair");
};
DrawingOverlay.prototype.resize = function () {
  var r = this.wrap.getBoundingClientRect();
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
  this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
  this.canvas.style.width = r.width + "px";
  this.canvas.style.height = r.height + "px";
  this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  this.redraw();
};
DrawingOverlay.prototype.coord = function (time, price) {
  var ch = this.getChart(), s = this.getSeries();
  if (!ch || !s || time == null || price == null) return null;
  var x = ch.timeScale().timeToCoordinate(time);
  var y = s.priceToCoordinate(price);
  if (x == null || y == null) return null;
  return { x: x, y: y };
};
DrawingOverlay.prototype.atPoint = function (cx, cy) {
  var ch = this.getChart(), s = this.getSeries();
  if (!ch || !s) return null;
  var time = ch.timeScale().coordinateToTime(cx);
  var price = s.coordinateToPrice(cy);
  if (time == null || price == null) return null;
  if (this.magnet) {
    var bars = this.getCandles() || [];
    var best = null, bd = 1e9;
    for (var i = 0; i < bars.length; i++) {
      var x = ch.timeScale().timeToCoordinate(bars[i].time);
      if (x == null) continue;
      var d = Math.abs(x - cx);
      if (d < bd) { bd = d; best = bars[i]; }
    }
    if (best && bd < 16) {
      time = best.time;
      var opts = [best.open, best.high, best.low, best.close];
      var py = opts.map(function (p) { return s.priceToCoordinate(p); });
      var bi = 0, bdy = 1e9;
      for (var j = 0; j < py.length; j++) if (py[j] != null && Math.abs(py[j] - cy) < bdy) { bdy = Math.abs(py[j] - cy); bi = j; }
      price = opts[bi];
    }
  }
  return { time: time, price: price };
};
DrawingOverlay.prototype._pushUndo = function () {
  this.undo.push(JSON.stringify(this.items));
  if (this.undo.length > 80) this.undo.shift();
  this.redo = [];
};
DrawingOverlay.prototype.undoLast = function () {
  if (!this.undo.length || this.locked) return;
  this.redo.push(JSON.stringify(this.items));
  this.items = JSON.parse(this.undo.pop());
  this.redraw(); this.onChange();
};
DrawingOverlay.prototype.redoLast = function () {
  if (!this.redo.length || this.locked) return;
  this.undo.push(JSON.stringify(this.items));
  this.items = JSON.parse(this.redo.pop());
  this.redraw(); this.onChange();
};
DrawingOverlay.prototype.clearAll = function () {
  if (this.locked || !this.items.length) return;
  this._pushUndo(); this.items = []; this.redraw(); this.onChange();
};
DrawingOverlay.prototype.serialize = function () { return this.items.slice(); };
DrawingOverlay.prototype.restore = function (items) { this.items = Array.isArray(items) ? items.slice() : []; this.undo = []; this.redo = []; this.redraw(); };
DrawingOverlay.prototype._bind = function () {
  var self = this;
  function pos(e) {
    var r = self.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  this.canvas.addEventListener("pointerdown", function (e) {
    if (self.tool === "cursor" || self.locked && self.tool !== "measure") return;
    var p = pos(e), pt = self.atPoint(p.x, p.y);
    if (!pt) return;
    if (self.tool === "eraser") {
      var hit = self._hit(p.x, p.y);
      if (hit >= 0) { self._pushUndo(); self.items.splice(hit, 1); self.redraw(); self.onChange(); }
      return;
    }
    if (self.tool === "text") {
      var txt = window.prompt("Note text");
      if (txt) { self._pushUndo(); self.items.push({ type: "text", points: [pt], text: txt }); self.redraw(); self.onChange(); }
      if (!self.stay) self.setTool("cursor");
      return;
    }
    if (self.tool === "hline" || self.tool === "vline") {
      self._pushUndo();
      self.items.push({ type: self.tool, points: [pt] });
      self.redraw(); self.onChange();
      if (!self.stay) self.setTool("cursor");
      return;
    }
    self.draft = { type: self.tool, points: [pt, pt] };
    self.canvas.setPointerCapture(e.pointerId);
    self.redraw();
  });
  this.canvas.addEventListener("pointermove", function (e) {
    var p = pos(e);
    if (self.draft) {
      var pt = self.atPoint(p.x, p.y);
      if (pt) self.draft.points[1] = pt;
      self.redraw();
    }
  });
  function finish() {
    if (!self.draft) return;
    var a = self.draft.points[0], b = self.draft.points[1];
    if (a && b && (a.time !== b.time || a.price !== b.price)) {
      self._pushUndo();
      self.items.push({ type: self.draft.type, points: self.draft.points.slice() });
      self.onChange();
    }
    self.draft = null;
    if (!self.stay && self.tool !== "measure") self.setTool("cursor");
    if (self.tool === "measure") self.redraw();
    else self.redraw();
  }
  this.canvas.addEventListener("pointerup", finish);
  this.canvas.addEventListener("pointercancel", function () { self.draft = null; self.redraw(); });
};
DrawingOverlay.prototype._hit = function (x, y) {
  for (var i = this.items.length - 1; i >= 0; i--) {
    var it = this.items[i], pts = (it.points || []).map(function (p) { return this.coord(p.time, p.price); }, this).filter(Boolean);
    if (!pts.length) continue;
    if (it.type === "rectangle" && pts.length >= 2) {
      var x0 = Math.min(pts[0].x, pts[1].x), x1 = Math.max(pts[0].x, pts[1].x);
      var y0 = Math.min(pts[0].y, pts[1].y), y1 = Math.max(pts[0].y, pts[1].y);
      if (x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4) return i;
    } else if (it.type === "hline") {
      if (Math.abs(y - pts[0].y) < 6) return i;
    } else if (it.type === "vline") {
      if (Math.abs(x - pts[0].x) < 6) return i;
    } else if (it.type === "text") {
      if (Math.hypot(x - pts[0].x, y - pts[0].y) < 18) return i;
    } else if (pts.length >= 2) {
      if (distToSeg(x, y, pts[0].x, pts[0].y, pts[1].x, pts[1].y) < 6) return i;
    }
  }
  return -1;
};
function distToSeg(px, py, x1, y1, x2, y2) {
  var A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1, len = C * C + D * D, t = len ? Math.max(0, Math.min(1, (A * C + B * D) / len)) : 0;
  return Math.hypot(px - (x1 + t * C), py - (y1 + t * D));
}
DrawingOverlay.prototype.redraw = function () {
  var ctx = this.ctx, w = this.canvas.width, h = this.canvas.height, dpr = Math.min(window.devicePixelRatio || 1, 2);
  ctx.clearRect(0, 0, w, h);
  if (this.hidden) return;
  var all = this.items.concat(this.draft ? [this.draft] : []);
  all.forEach(function (it) { this._paint(it); }, this);
};
DrawingOverlay.prototype._paint = function (it) {
  var ctx = this.ctx;
  ctx.save();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = AMBER;
  ctx.fillStyle = "rgba(255,176,0,.12)";
  ctx.font = "11px JetBrains Mono, ui-monospace, monospace";
  var pts = (it.points || []).map(function (p) { return this.coord(p.time, p.price); }, this);
  if (it.type === "hline" && pts[0]) {
    ctx.beginPath(); ctx.moveTo(0, pts[0].y); ctx.lineTo(this.canvas.clientWidth, pts[0].y); ctx.stroke();
    label(ctx, 8, pts[0].y - 4, String(round(it.points[0].price)));
  } else if (it.type === "vline" && pts[0]) {
    ctx.beginPath(); ctx.moveTo(pts[0].x, 0); ctx.lineTo(pts[0].x, this.canvas.clientHeight); ctx.stroke();
  } else if (it.type === "text" && pts[0]) {
    ctx.fillStyle = TEXT; ctx.fillText(it.text || "", pts[0].x + 4, pts[0].y - 4);
    ctx.strokeStyle = AMBER; ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, 3, 0, Math.PI * 2); ctx.stroke();
  } else if (it.type === "rectangle" && pts[0] && pts[1]) {
    var x = Math.min(pts[0].x, pts[1].x), y = Math.min(pts[0].y, pts[1].y);
    var w = Math.abs(pts[1].x - pts[0].x), h = Math.abs(pts[1].y - pts[0].y);
    ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
  } else if (it.type === "fib" && pts[0] && pts[1] && it.points[0] && it.points[1]) {
    var p0 = it.points[0].price, p1 = it.points[1].price, x0 = pts[0].x, x1 = this.canvas.clientWidth;
    FIB.forEach(function (f) {
      var price = p1 + (p0 - p1) * f, c = this.coord(it.points[0].time, price);
      if (!c) return;
      ctx.strokeStyle = f === 0 || f === 0.5 || f === 1 ? AMBER : MUTED;
      ctx.beginPath(); ctx.moveTo(Math.min(x0, pts[1].x), c.y); ctx.lineTo(x1, c.y); ctx.stroke();
      label(ctx, Math.min(x0, pts[1].x) + 4, c.y - 3, (f * 100).toFixed(1) + "  " + round(price));
    }, this);
  } else if (it.type === "measure" && pts[0] && pts[1] && it.points[0] && it.points[1]) {
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y); ctx.stroke();
    ctx.setLineDash([]);
    var dp = it.points[1].price - it.points[0].price;
    var pct = it.points[0].price ? (dp / it.points[0].price) * 100 : 0;
    var bars = this.getCandles() || [];
    var i0 = indexOfTime(bars, it.points[0].time), i1 = indexOfTime(bars, it.points[1].time);
    var n = (i0 >= 0 && i1 >= 0) ? Math.abs(i1 - i0) : "—";
    var msg = (dp >= 0 ? "+" : "") + round(dp) + "  (" + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%)  " + n + " bars";
    label(ctx, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2 - 8, msg);
  } else if (pts[0] && pts[1]) {
    ctx.beginPath();
    if (it.type === "ray") {
      var dx = pts[1].x - pts[0].x, dy = pts[1].y - pts[0].y;
      var len = Math.hypot(dx, dy) || 1;
      var k = 4000 / len;
      ctx.moveTo(pts[0].x, pts[0].y);
      ctx.lineTo(pts[0].x + dx * k, pts[0].y + dy * k);
    } else {
      ctx.moveTo(pts[0].x, pts[0].y); ctx.lineTo(pts[1].x, pts[1].y);
    }
    ctx.stroke();
  }
  ctx.restore();
};
function label(ctx, x, y, text) {
  ctx.save();
  ctx.font = "10px JetBrains Mono, ui-monospace, monospace";
  var w = ctx.measureText(text).width + 8;
  ctx.fillStyle = "rgba(7,8,10,.82)";
  ctx.fillRect(x, y - 11, w, 14);
  ctx.fillStyle = TEXT;
  ctx.fillText(text, x + 4, y);
  ctx.restore();
}
function round(n) { return Math.round(n * 100) / 100; }
function indexOfTime(bars, time) {
  var s = typeof time === "object" ? (time.year + "-" + pad(time.month) + "-" + pad(time.day)) : String(time);
  for (var i = 0; i < bars.length; i++) if (String(bars[i].time) === s) return i;
  return -1;
}
function pad(n) { return n < 10 ? "0" + n : String(n); }

export function downloadPng(chart, overlay, name) {
  var src = chart && chart.takeScreenshot ? chart.takeScreenshot() : null;
  if (!src) return false;
  var out = document.createElement("canvas");
  out.width = src.width; out.height = src.height;
  var ctx = out.getContext("2d");
  ctx.fillStyle = "#07090c"; ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(src, 0, 0);
  if (overlay && overlay.canvas) {
    ctx.drawImage(overlay.canvas, 0, 0, out.width, out.height);
  }
  ctx.fillStyle = DIM;
  ctx.font = "12px JetBrains Mono, monospace";
  ctx.fillText("MarketScope Exchange · simulation · " + (name || ""), 12, out.height - 10);
  var a = document.createElement("a");
  a.href = out.toDataURL("image/png");
  a.download = (name || "marketscope-chart").replace(/[^\w.-]+/g, "_") + ".png";
  a.click();
  return true;
}

export var TOOLS = [
  { id: "cursor", label: "Cursor", key: "Escape", icon: "pointer" },
  { id: "trend", label: "Trend line", key: "Alt+T", icon: "trend" },
  { id: "hline", label: "Horizontal line", key: "Alt+H", icon: "hline" },
  { id: "vline", label: "Vertical line", key: "Alt+V", icon: "vline" },
  { id: "ray", label: "Ray", key: "Alt+R", icon: "ray" },
  { id: "rectangle", label: "Rectangle", key: "Alt+B", icon: "rect" },
  { id: "fib", label: "Fibonacci retracement", key: "Alt+F", icon: "fib" },
  { id: "text", label: "Text note", key: "Alt+N", icon: "text" },
  { id: "measure", label: "Measure", key: "Alt+M", icon: "measure" },
  { id: "eraser", label: "Eraser", key: "Alt+E", icon: "eraser" },
  { id: "clear", label: "Clear drawings", key: "Alt+Backspace", icon: "clear" }
];

export function toolIcon(id) {
  var s = 'xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"';
  var p = {
    pointer: "<path d='M3 2l5 11 1.5-4.5L14 7z'/>",
    trend: "<path d='M2 13 L14 3'/>",
    hline: "<path d='M1 8 H15'/>",
    vline: "<path d='M8 1 V15'/>",
    ray: "<path d='M2 13 L10 5'/><path d='M10 5 L15 2'/>",
    rect: "<rect x='3' y='4' width='10' height='8' rx='1'/>",
    fib: "<path d='M2 13 L14 3'/><path d='M2 10 H14'/><path d='M2 7 H14'/>",
    text: "<path d='M4 4 H12 M8 4 V13'/>",
    measure: "<path d='M3 12 L13 4'/><circle cx='3' cy='12' r='1.2' fill='currentColor'/><circle cx='13' cy='4' r='1.2' fill='currentColor'/>",
    eraser: "<path d='M4 10 l5-5 3 3-5 5 H4 z'/>",
    clear: "<path d='M4 5 h8 v9 H4z M6 3 h4 M6 8 v4 M10 8 v4'/>"
  };
  return "<svg " + s + " aria-hidden='true'>" + (p[id] || "") + "</svg>";
}
