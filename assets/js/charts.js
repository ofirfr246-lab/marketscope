/* MarketScope — hand-rolled SVG charts (no heavy libraries). */
(function (g) {
  "use strict";
  function svgEl(name, attrs, parent) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", name);
    if (attrs) Object.keys(attrs).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(e);
    return e;
  }
  function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
  function host(el) {
    if (!el) return null;
    if (el.tagName && el.tagName.toLowerCase() === "svg") return el;
    var s = el.querySelector("svg") || svgEl("svg", { viewBox: "0 0 100 40", preserveAspectRatio: "none" }, el);
    return s;
  }
  function minMax(arr, pick) {
    var mn = Infinity, mx = -Infinity;
    arr.forEach(function (v) {
      var n = pick ? pick(v) : v;
      if (typeof n !== "number") return;
      if (n < mn) mn = n; if (n > mx) mx = n;
    });
    if (mn === Infinity) { mn = 0; mx = 1; }
    if (mn === mx) { mn -= 1; mx += 1; }
    return { min: mn, max: mx };
  }
  function tip(el, html, x, y) {
    var t = document.getElementById("ms-chart-tip");
    if (!t) {
      t = document.createElement("div");
      t.id = "ms-chart-tip";
      t.className = "chart-tip mono";
      t.hidden = true;
      document.body.appendChild(t);
    }
    if (!html) { t.hidden = true; return; }
    t.hidden = false;
    t.innerHTML = html;
    var r = (el.getBoundingClientRect && el.getBoundingClientRect()) || { left: 0, top: 0 };
    t.style.left = Math.min(window.innerWidth - 180, r.left + x + 12) + "px";
    t.style.top = Math.max(8, r.top + y - 36) + "px";
  }

  function line(el, opts) {
    opts = opts || {};
    var svg = host(el);
    if (!svg) return;
    clear(svg);
    var W = 300, H = 110, pad = { l: 8, r: 8, t: 8, b: 8 };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    var series = opts.series || [{ data: opts.values || [], color: opts.color || "#ffb000", area: !!opts.area }];
    var all = [];
    series.forEach(function (s) { (s.data || []).forEach(function (v) { all.push(v); }); });
    var mm = minMax(all);
    var n = (series[0] && series[0].data && series[0].data.length) || 0;
    function x(i) { return pad.l + (n <= 1 ? 0 : i / (n - 1)) * (W - pad.l - pad.r); }
    function y(v) { return pad.t + (1 - (v - mm.min) / (mm.max - mm.min)) * (H - pad.t - pad.b); }
    /* grid */
    for (var gline = 1; gline <= 3; gline++) {
      var gy = pad.t + gline * (H - pad.t - pad.b) / 4;
      svgEl("line", { x1: pad.l, x2: W - pad.r, y1: gy, y2: gy, stroke: "rgba(255,255,255,.06)", "stroke-width": 1, "vector-effect": "non-scaling-stroke" }, svg);
    }
    series.forEach(function (s) {
      var d = s.data || [];
      if (!d.length) return;
      var pts = d.map(function (v, i) { return x(i) + "," + y(v); }).join(" ");
      if (s.area) {
        var area = "M" + x(0) + "," + y(d[0]) + " L" + d.map(function (v, i) { return x(i) + "," + y(v); }).join(" ") + " L" + x(d.length - 1) + "," + (H - pad.b) + " L" + x(0) + "," + (H - pad.b) + " Z";
        svgEl("path", { d: area, fill: s.color || "#ffb000", opacity: 0.18 }, svg);
      }
      svgEl("polyline", { points: pts, fill: "none", stroke: s.color || "#ffb000", "stroke-width": s.width || 2, "stroke-dasharray": s.dash || null, "vector-effect": "non-scaling-stroke" }, svg);
    });
  }

  function candles(el, opts) {
    opts = opts || {};
    var svg = host(el);
    if (!svg) return;
    clear(svg);
    var data = opts.candles || [];
    var W = 320, H = 140, pad = { l: 6, r: 6, t: 8, b: 8 };
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    if (!data.length) return;
    var mm = minMax(data, function (c) { return c.h; });
    var mm2 = minMax(data, function (c) { return c.l; });
    var lo = mm2.min, hi = mm.max;
    function y(v) { return pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b); }
    var slot = (W - pad.l - pad.r) / data.length;
    var bw = Math.max(1.2, slot * 0.62);
    data.forEach(function (c, i) {
      var cx = pad.l + slot * i + slot / 2;
      var up = c.c >= c.o;
      var color = up ? (opts.up || "#19d27c") : (opts.down || "#ff4d5e");
      svgEl("line", { x1: cx, x2: cx, y1: y(c.h), y2: y(c.l), stroke: color, "stroke-width": 1, "vector-effect": "non-scaling-stroke" }, svg);
      var top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
      var h = Math.max(0.8, bot - top);
      svgEl("rect", { x: cx - bw / 2, y: top, width: bw, height: h, fill: color }, svg);
    });
  }

  function spark(el, values, color) {
    values = values || [];
    var svg = host(el);
    if (!svg) return;
    clear(svg);
    svg.setAttribute("viewBox", "0 0 80 24");
    svg.setAttribute("preserveAspectRatio", "none");
    if (values.length < 2) return;
    var mm = minMax(values);
    var pts = values.map(function (v, i) {
      var x = (i / (values.length - 1)) * 80;
      var y = 2 + (1 - (v - mm.min) / (mm.max - mm.min)) * 20;
      return x + "," + y;
    }).join(" ");
    var up = values[values.length - 1] >= values[0];
    svgEl("polyline", { points: pts, fill: "none", stroke: color || (up ? "#19d27c" : "#ff4d5e"), "stroke-width": 1.5, "vector-effect": "non-scaling-stroke" }, svg);
  }

  function donut(el, slices, opts) {
    opts = opts || {};
    var svg = host(el);
    if (!svg) return;
    clear(svg);
    var size = opts.size || 140, cx = size / 2, cy = size / 2, r = size * 0.36, w = size * 0.14;
    svg.setAttribute("viewBox", "0 0 " + size + " " + size);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    var total = 0;
    slices.forEach(function (s) { total += s.value; });
    if (!total) return;
    var ang = -Math.PI / 2;
    slices.forEach(function (s) {
      var sweep = (s.value / total) * Math.PI * 2;
      var a2 = ang + sweep;
      var large = sweep > Math.PI ? 1 : 0;
      var p1 = [cx + Math.cos(ang) * r, cy + Math.sin(ang) * r];
      var p2 = [cx + Math.cos(a2) * r, cy + Math.sin(a2) * r];
      var d = "M " + p1[0] + " " + p1[1] + " A " + r + " " + r + " 0 " + large + " 1 " + p2[0] + " " + p2[1];
      svgEl("path", { d: d, fill: "none", stroke: s.color, "stroke-width": w, "stroke-linecap": "butt" }, svg);
      ang = a2;
    });
    if (opts.center) {
      var tx = svgEl("text", { x: cx, y: cy + 4, "text-anchor": "middle", fill: "#e9ecef", "font-size": 12, "font-family": "JetBrains Mono, monospace" }, svg);
      tx.textContent = opts.center;
    }
  }

  function gauge(el, opts) {
    opts = opts || {};
    var svg = host(el);
    if (!svg) return;
    clear(svg);
    var W = 160, H = 100, cx = 80, cy = 86, r = 64;
    svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    function pt(a) { return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
    function arc(a0, a1, color, width, op) {
      var p0 = pt(a0), p1 = pt(a1), large = (a1 - a0) > Math.PI ? 1 : 0;
      svgEl("path", { d: "M " + p0[0] + " " + p0[1] + " A " + r + " " + r + " 0 " + large + " 1 " + p1[0] + " " + p1[1], fill: "none", stroke: color, "stroke-width": width || 10, opacity: op || 1, "stroke-linecap": "round" }, svg);
    }
    var start = Math.PI, end = 2 * Math.PI;
    arc(start, end, "rgba(255,255,255,.08)", 10);
    var v = Math.max(0, Math.min(100, opts.value || 0)) / 100;
    var col = v >= 0.66 ? "#19d27c" : v >= 0.45 ? "#ffb000" : "#ff4d5e";
    arc(start, start + v * Math.PI, col, 10);
    var lab = svgEl("text", { x: cx, y: 58, "text-anchor": "middle", fill: col, "font-size": 22, "font-family": "JetBrains Mono, monospace", "font-weight": 700 }, svg);
    lab.textContent = String(Math.round(opts.value || 0));
    var sub = svgEl("text", { x: cx, y: 74, "text-anchor": "middle", fill: "#8b95a3", "font-size": 8, "font-family": "JetBrains Mono, monospace" }, svg);
    sub.textContent = opts.label || "SENTIMENT";
  }

  function heatmap(el, opts) {
    opts = opts || {};
    var wrap = el;
    if (!wrap) return;
    wrap.innerHTML = "";
    wrap.classList.add("heat-grid");
    var rows = opts.rows || [], cols = opts.cols || [], cells = opts.cells || [];
    var table = document.createElement("table");
    table.className = "heat-table mono";
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    hr.appendChild(document.createElement("th"));
    cols.forEach(function (c) { var th = document.createElement("th"); th.textContent = typeof c === "string" ? c : (c.abbr || c.name || c); hr.appendChild(th); });
    thead.appendChild(hr); table.appendChild(thead);
    var body = document.createElement("tbody");
    rows.forEach(function (rName, ri) {
      var tr = document.createElement("tr");
      var th = document.createElement("th"); th.textContent = rName; tr.appendChild(th);
      cols.forEach(function (c, ci) {
        var cell = cells.filter(function (x) { return x.r === ri && x.c === ci; })[0] || {};
        var td = document.createElement("td");
        var v = cell.opportunity != null ? cell.opportunity : 50;
        var t = v / 100;
        var col = t >= 0.6 ? "rgba(25,210,124," + (0.25 + (t - 0.6) * 1.2) + ")" : t >= 0.45 ? "rgba(255,176,0," + (0.2 + (0.6 - t)) + ")" : "rgba(255,77,94," + (0.25 + (0.45 - t) * 1.1) + ")";
        td.style.background = col;
        td.innerHTML = "<b>" + v + "</b><small>" + (cell.chg > 0 ? "+" : "") + (cell.chg != null ? cell.chg : "—") + "%</small>";
        td.tabIndex = 0;
        function show() {
          tip(td, "<b>" + (cell.categoryName || rName) + " · " + (cell.market || "") + "</b><br>Opportunity " + v + " · " + (cell.chg > 0 ? "+" : "") + cell.chg + "% (example)" + (cell.product ? "<br>" + cell.product : (cell.ticker ? "<br>" + cell.ticker : "")), td.offsetWidth / 2, 0);
          if (opts.onHover) opts.onHover(cell);
        }
        td.addEventListener("mouseenter", show);
        td.addEventListener("focus", show);
        td.addEventListener("mouseleave", function () { tip(td, null); });
        td.addEventListener("blur", function () { tip(td, null); });
        if (opts.onClick) td.addEventListener("click", function () { opts.onClick(cell); });
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    table.appendChild(body);
    wrap.appendChild(table);
  }

  g.MSCharts = { line: line, candles: candles, spark: spark, donut: donut, gauge: gauge, heatmap: heatmap, tip: tip };
})(window);
