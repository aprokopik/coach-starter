/* charts.js: the Cockpit chart grammar (Phase 4, Nov 4, 2026). One drawing library for every chart on the page; the
   rules are in CHARTS.md. Plain script, no modules, no network. Needs d3 v7 (the host loads it) and the Phase 3 tokens
   (charts.css puts them on .ck). Exposes window.CKC.
   Never here: a literal colour (every colour is a token name, read with getComputedStyle at draw time) or a threshold
   (thresholds, baselines, gates and floors arrive in the spec, from data rows or from the caller's script-held list). */
(function () {
  'use strict';
  var CKC = window.CKC = window.CKC || {};
  var NS = 'http://www.w3.org/2000/svg';
  var reg = new Map(), drawn = {}, openHide = null, live = null, uid = 0;
  // short names for the label strings used most (keeps the build under 40 KB)
  var TH = 'ck-c-thlabel', THR = 'chart-threshold', ST = 'start', MID = 'middle', NODATA = 'No data in this range yet.', EASE = 'cubic-bezier(.2,.8,.2,1)', ENDL = 'ck-c-endlabel', S1 = 'series-1', DASH = 'stroke-dasharray', AXIS = 'chart-axis';
  CKC.stats = {};
  var fDay = d3.utcFormat('%b %-d'), fWd = d3.utcFormat('%a %b %-d'), fMon = d3.utcFormat('%b');
  var P = function (s) { return s instanceof Date ? s : new Date(String(s).slice(0, 10) + 'T00:00:00Z'); };
  var dayGap = function (a, b) { return Math.round((P(b) - P(a)) / 864e5); };
  var num = function (v) { if (v === null || v === undefined || v === '') return null; var n = +v; return isFinite(n) ? n : null; };
  CKC.num = num; CKC.fDay = fDay;

  // ---------- small helpers ----------
  function mk(parent, tag, a, text) {
    var e = document.createElementNS(NS, tag);
    // fill and stroke go inline so page stylesheets (.cx .chart text and the like) never repaint a chart
    for (var k in a) if (a[k] !== null && a[k] !== undefined) { if (k === 'fill' || k === 'stroke') e.style.setProperty(k, a[k]); else e.setAttribute(k, a[k]); }
    // a trailing space (not rendered in SVG) keeps neighbouring labels apart in textContent, so marks read clean numbers
    if (text !== undefined && text !== null) e.textContent = String(text) + (tag === 'text' ? ' ' : '');
    if (parent) parent.appendChild(e);
    return e;
  }
  function hel(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
  // Reduced motion: no draw-in at all (matchMedia missing counts as reduce)
  function mq(q) { try { return window.matchMedia(q).matches; } catch (e) { return true; } }
  CKC.still = function () { return mq('(prefers-reduced-motion: reduce)'); };
  // Token names: 'fg', S1, 'run', THR read --ck-<name>; a name that starts with -- is read as is
  function toner(host) {
    var cs = getComputedStyle(host), memo = {};
    return function (n) {
      n = n || 'fg'; if (memo[n]) return memo[n];
      var v = cs.getPropertyValue(n.slice(0, 2) === '--' ? n : '--ck-' + n).trim();
      return (memo[n] = v || 'currentColor');
    };
  }
  CKC.tone = function (host, n) { return toner(host)(n); };
  function lum(c) {
    var m = String(c).match(/rgba?\(([^)]+)\)/), h = String(c).match(/^#([0-9a-f]{6})$/i), p;
    if (m) p = m[1].split(/[ ,/]+/).map(Number); else if (h) p = [0, 2, 4].map(function (i) { return parseInt(h[1].substr(i, 2), 16); }); else return null;
    var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]);
  }
  // Text widths at the rendered size: a probe inside the drawing, with the class the label will carry
  function measurer(svg) {
    var t = mk(svg, 'text', { x: -999, y: -999, 'aria-hidden': 'true' });
    var f = function (s, cls) { t.setAttribute('class', cls || ''); t.textContent = String(s); return t.getComputedTextLength(); };
    f.max = function (arr, cls) { var w = 0; for (var i = 0; i < arr.length; i++) w = Math.max(w, f(arr[i], cls)); return w; };
    f.done = function () { t.remove(); };
    return f;
  }
  // Does the shown text carry the row value (rounded to the shown decimals)? Only then a label gets data-field.
  function shows(text, v) {
    v = num(v); if (v === null) return false;
    var ns = String(text).replace(/−/g, '-').match(/-?\d+(?:\.\d+)?/g) || [];
    return ns.some(function (s) { var d = (s.split('.')[1] || '').length, f = Math.pow(10, d); return Math.abs(Math.round(v * f) / f - Number(s)) < 0.5 / f + 1e-9; });
  }
  // Data marks: m = {source, field, where, key, keyVal, derived, held}
  function mark(node, m, value, text) {
    if (!m) return;
    if (m.held) { node.setAttribute('data-derived', 'held'); node.setAttribute('data-held', m.held); return; }
    if (m.source) node.setAttribute('data-source', m.source);
    var w = m.where || '';
    if (m.key && m.keyVal !== undefined && m.keyVal !== null) w = (w ? w + '&' : '') + m.key + '=' + encodeURIComponent(m.keyVal);
    if (w) node.setAttribute('data-where', w);
    if (m.field && !m.derived && w && shows(text, value)) node.setAttribute('data-field', m.field);
    else if (m.field || m.derived) node.setAttribute('data-derived', m.derived || 'formatted');
  }
  CKC.mark = mark;
  function announce(t) {
    if (!live) { live = hel('div', 'ck-live'); live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status'); (document.getElementById('dash-root') || document.body).appendChild(live); }
    live.textContent = t;
  }
  CKC.announce = announce;

  // ---------- one resize listener and one colour-scheme listener for every chart ----------
  function redrawAll(force) {
    reg.forEach(function (r, host) {
      // a box that left the page, or that its caller has since filled with something else (a note, another view),
      // is dropped, never redrawn: only a box that still holds this chart's own svg is redrawn
      if (!host.isConnected || r.svg.parentNode !== host) { reg.delete(host); return; }
      var w = inner(host); if (!w) return;
      if (force || Math.abs(w - r.w) > 1) { try { r.draw(); } catch (e) { if (window.console) console.error('[charts] redraw failed: ' + e); } }
    });
  }
  CKC.redrawAll = redrawAll;
  // A caller that empties a box or puts something else in it unregisters the chart first
  CKC.clear = function (host) { if (!host) return; reg.delete(host); if (openHide) openHide(); };
  var rT = null;
  window.addEventListener('resize', function () { clearTimeout(rT); rT = setTimeout(function () { redrawAll(false); }, 150); });
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () { redrawAll(true); }); } catch (e) { /* old engines: the host redraw covers it */ }
  document.addEventListener('pointerdown', function (e) { if (openHide && !(e.target.closest && e.target.closest('.ck-chart'))) openHide(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && openHide) openHide(); });

  // ---------- the frame every chart shares ----------
  // content width: the box minus its padding, so the drawing grid equals the rendered pixels (text stays 11 px)
  function inner(host) { if (!host.clientWidth) return 0; var cs = getComputedStyle(host), w = host.getBoundingClientRect().width - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0); return Math.round((w - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0)) * 100) / 100; }
  function frame(host, s, type, redraw) {
    var t0 = performance.now();
    host.classList.add('ck', 'ck-chart'); host.classList.toggle('ck-chart--in', !s.standalone);
    Array.prototype.slice.call(host.children).forEach(function (c) { if (/(^|\s)(ck-chart-svg|ck-chart-cap|ck-chart-key|ck-tip|ck-note|tip|fail)(\s|$)/.test(c.getAttribute('class') || '') || c.tagName.toLowerCase() === 'svg' || (c.matches && c.matches('p.note'))) c.remove(); });
    var W = Math.max(s.minW || 200, inner(host) || s.fallbackW || 300);
    // narrow: {h}: under the 480 px breakpoint the chart takes this height (level charts; CHARTS.md 5)
    var nar = !!(s.narrow && !s.spark && !mq('(min-width: 480px)')), H = nar ? s.narrow.h : s.h || 160;
    var svg = mk(null, 'svg', { 'class': 'ck-chart-svg' + (s.spark ? ' ck-spark' : ''), width: '100%', height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', tabindex: s.interactive === false ? null : 0, focusable: 'false' });
    var cap = hel('p', 'ck-chart-cap'); cap.setAttribute('data-derived', 'sentence');
    var tip = hel('div', 'ck-tip'); tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
    var before = host.querySelector(':scope > .seg.zoom'); [svg, cap, tip].forEach(function (n) { host.insertBefore(n, before); });
    if (s.caption === false) cap.hidden = true;
    var c = { host: host, svg: svg, cap: cap, tip: tip, W: W, H: H, s: s, type: type, t0: t0, T: toner(host), redraw: redraw, narrow: nar };
    c.m = measurer(svg);
    return c;
  }
  function note(host, text, s) {
    host.classList.add('ck', 'ck-chart'); host.classList.toggle('ck-chart--in', !s.standalone);
    Array.prototype.slice.call(host.children).forEach(function (c) { if (/(^|\s)(ck-chart-svg|ck-chart-cap|ck-chart-key|ck-tip|ck-note)(\s|$)/.test(c.getAttribute('class') || '')) c.remove(); });
    var p = hel('p', 'ck-note note', text); p.setAttribute('data-derived', 'sentence'); p.setAttribute('role', 'note'); host.appendChild(p);
    reg.delete(host); return { withheld: true, sentence: text };
  }
  function finish(c, sentence, marks, mval, mtext) {
    c.m.done();
    c.svg.setAttribute('aria-label', sentence); c.cap.textContent = sentence;
    if (marks) mark(c.svg, marks, mval, mtext);
    reg.set(c.host, { w: c.W, draw: c.redraw, svg: c.svg });
    var k = c.s.key || c.type, ms = performance.now() - c.t0, st = CKC.stats[k] || (CKC.stats[k] = { n: 0, last: 0, max: 0 });
    st.n++; st.last = Math.round(ms * 100) / 100; st.max = Math.max(st.max, st.last);
    return { sentence: sentence, W: c.W };
  }
  // One 200 ms path draw on first paint only (never on resize, refresh or range change), none under reduced motion
  function drawIn(c, path) {
    var k = (c.s.key || c.type) + ':' + (c.host.id || ''); if (drawn[k]) return; drawn[k] = true;
    if (!path || CKC.still() || !path.getTotalLength || !path.animate) return;
    try { var L = path.getTotalLength(); if (!(L > 0)) return; path.animate([{ strokeDasharray: L + ' ' + L, strokeDashoffset: L }, { strokeDasharray: L + ' ' + L, strokeDashoffset: 0 }], { duration: 200, easing: EASE }); } catch (e) { /* no animation */ }
  }
  function grow(c, nodes, attr) {
    var k = (c.s.key || c.type) + ':' + (c.host.id || ''); if (drawn[k]) return; drawn[k] = true;
    if (CKC.still() || !nodes.length || !nodes[0].animate) return;
    nodes.forEach(function (n) { try { n.animate([{ transform: attr === 'x' ? 'scaleX(0)' : 'scaleY(0)' }, { transform: 'none' }], { duration: 200, easing: EASE }); } catch (e) { /* none */ } });
  }

  // ---------- tooltip: tap and keyboard, one open at a time, Escape closes, never on a timer ----------
  function interact(c, items, o) {
    var svg = c.svg, tip = c.tip, T = c.T, idx = -1, isOpen = false;
    var rule = o.rule ? mk(svg, 'line', { 'class': 'ck-c-focus', y1: c.top, y2: c.bottom, x1: -99, x2: -99, stroke: T(AXIS), opacity: 0 }) : null;
    var dot = o.dot ? mk(svg, 'circle', { r: 4.5, cx: -99, cy: -99, fill: T(o.dotTone || 'fg'), stroke: T('surface'), 'stroke-width': 2, opacity: 0 }) : null;
    var hl = o.box ? mk(svg, 'rect', { x: -99, y: c.top, width: 0, height: Math.max(0, c.bottom - c.top), rx: 4, fill: 'none', stroke: T('focus'), 'stroke-width': 2, opacity: 0 }) : null;
    function hide() { tip.hidden = true; isOpen = false; [rule, dot, hl].forEach(function (n) { if (n) n.setAttribute('opacity', 0); }); if (openHide === hide) openHide = null; }
    function place(it) {
      if (rule) { rule.setAttribute('x1', it.x); rule.setAttribute('x2', it.x); rule.setAttribute('opacity', 1); }
      if (dot) { if (it.y === null || it.y === undefined) dot.setAttribute('opacity', 0); else { dot.setAttribute('cx', it.x); dot.setAttribute('cy', it.y); dot.setAttribute('opacity', 1); } }
      if (hl && it.bw) { hl.setAttribute('x', it.x - it.bw / 2 - 2); hl.setAttribute('width', it.bw + 4); hl.setAttribute('opacity', 1); }
    }
    function show(it) {
      if (openHide && openHide !== hide) openHide();
      tip.replaceChildren(hel('span', 'ck-tip-h', it.head));
      (it.lines || []).forEach(function (l) { if (!l) return; var r = hel('span', 'ck-tip-r'); if (l.tone) { var k = hel('i', 'ck-tip-k'); k.style.background = T(l.tone); r.appendChild(k); } r.appendChild(hel('span', null, l.text)); tip.appendChild(r); });
      tip.hidden = false; isOpen = true; openHide = hide;
      var sr = svg.getBoundingClientRect(), hr = c.host.getBoundingClientRect(), sc = (sr.width || c.W) / c.W;
      var px = sr.left - hr.left + it.x * sc, py = sr.top - hr.top + (it.y === null || it.y === undefined ? c.H / 2 : it.y) * sc;
      var w = c.host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      tip.style.left = Math.min(Math.max(0, px - tw / 2), Math.max(0, w - tw)) + 'px';
      tip.style.top = (py - th - 12 < 0 ? py + 14 : py - th - 12) + 'px';
    }
    function focus(i, open, speak) {
      var it = items[i]; if (!it) return; idx = i; place(it);
      if (open) show(it); else if (isOpen) show(it);
      if (speak) announce(open || isOpen ? [it.head].concat((it.lines || []).filter(Boolean).map(function (l) { return l.text; })).join('. ') : it.short || it.head);
    }
    function at(ev) { var r = svg.getBoundingClientRect(); return (ev.clientX - r.left) * c.W / (r.width || c.W); }
    function atY(ev) { var r = svg.getBoundingClientRect(); return (ev.clientY - r.top) * c.W / (r.width || c.W); }
    function pick(ev) { var i = o.pick(at(ev), atY(ev)); return i < 0 || i >= items.length ? -1 : i; }
    var onMove = function (ev) { var i = pick(ev); if (i < 0) { hide(); return; } focus(i, true, false); };
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerdown', onMove);
    svg.addEventListener('pointerleave', function (ev) { if (ev.pointerType === 'mouse') hide(); });
    if (o.click) svg.addEventListener('click', function (ev) { var i = pick(ev); if (i >= 0) o.click(items[i].row, i); });
    svg.addEventListener('keydown', function (e) {
      var k = e.key, n = items.length; if (!n) return;
      if (k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Home' || k === 'End') {
        e.preventDefault();
        var j = k === 'Home' ? 0 : k === 'End' ? n - 1 : idx < 0 ? n - 1 : Math.max(0, Math.min(n - 1, idx + (k === 'ArrowRight' ? 1 : -1)));
        focus(j, false, true);
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        if (isOpen && o.click && idx >= 0) { o.click(items[idx].row, idx); return; }
        focus(idx < 0 ? n - 1 : idx, true, true);
      } else if (k === 'Escape') { if (isOpen) { e.stopPropagation(); hide(); announce('Closed'); } }
    });
    svg.addEventListener('blur', function () { if (!isOpen) [rule, dot, hl].forEach(function (n) { if (n) n.setAttribute('opacity', 0); }); });
    return { hide: hide, focus: focus };
  }

  // ---------- time axis: day ticks up to ~2.5 months, then months (every 1, 2, 3, 6 or 12) with the year ----------
  function timeTicks(x, xd, w) {
    var span = (xd[1] - xd[0]) / 864e5;
    if (span <= 75) return { ticks: x.ticks(Math.max(2, Math.floor(w / 80))), fmt: fDay };
    var fit = Math.max(2, Math.floor(w / 46)), months = span / 30.4;
    var step = [1, 2, 3, 6, 12].find(function (k) { return months / k <= fit; }) || 12;
    var fY = d3.utcFormat("%b '%y"), fYY = d3.utcFormat('%Y');
    return { ticks: x.ticks(d3.utcMonth.every(step)), fmt: step === 12 ? fYY : span > 300 ? function (d) { return d.getUTCMonth() === 0 || step >= 3 ? fY(d) : fMon(d); } : fMon };
  }
  // Labels on the right edge: stack by y with a minimum gap, then pull back inside the plot
  function spread(labels, lo, hi, gap) {
    labels.sort(function (a, b) { return a.y - b.y; });
    for (var i = 1; i < labels.length; i++) if (labels[i].y < labels[i - 1].y + gap) labels[i].y = labels[i - 1].y + gap;
    if (labels.length && labels[labels.length - 1].y > hi) { labels[labels.length - 1].y = hi; for (var j = labels.length - 2; j >= 0; j--) if (labels[j].y > labels[j + 1].y - gap) labels[j].y = labels[j + 1].y - gap; }
    labels.forEach(function (l) { l.y = Math.max(lo, l.y); });
    return labels;
  }
  // Inside labels: most important first. Each label tries its own place, then its alternatives (lb.alts: the other side
  // of its line, then the other end); the first place that touches no data (ob: rects and line segments) and no label
  // already placed wins. If every place touches data, the one touching least is used; a label with no free place is dropped.
  function hitSeg(b, s) {
    var x1 = s[0], y1 = s[1], x2 = s[2], y2 = s[3], t0 = 0, t1 = 1, dx = x2 - x1, dy = y2 - y1;
    var p = [-dx, dx, -dy, dy], q = [x1 - b.x0, b.x1 - x1, y1 - b.y0, b.y1 - y1];
    for (var i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; } else { var r = q[i] / p[i]; if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } } }
    return true;
  }
  function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
  function placeInside(c, labels, ob) {
    var placed = ((ob && ob.hard) || []).slice(), fs = 11, out = [], rects = (ob && ob.rects) || [], segs = (ob && ob.segs) || [];
    labels.sort(function (a, b) { return b.prio - a.prio; }).forEach(function (lb) {
      var w = c.m(lb.text, lb.cls) + 2, best = null, bestHits = Infinity;
      [A(lb.x, lb.y, lb.anchor)].concat(lb.alts || []).some(function (cand) {
        var an = cand.anchor || lb.anchor, x0 = an === ST ? cand.x : an === MID ? cand.x - w / 2 : cand.x - w, b = { x0: x0, x1: x0 + w, y0: cand.y - fs, y1: cand.y + 2 };
        if (b.x0 < 0 || b.x1 > (c.xMax || c.W) + 1 || b.y0 < 0 || (c.bottom && b.y1 > (c.labelBottom || c.bottom) + 3) || placed.some(function (p) { return overlap(b, p); })) return false;
        var hits = 0; rects.forEach(function (r) { if (overlap(b, r)) hits++; }); segs.forEach(function (sg) { if (hitSeg(b, sg)) hits++; });
        if (hits < bestHits) { bestHits = hits; best = { cand: cand, an: an, b: b }; }
        return hits === 0;
      });
      if (!best) return;
      placed.push(best.b); out.push(Object.assign({}, lb, { x: best.cand.x, y: best.cand.y, anchor: best.an }));
    });
    return out;
  }
  // the drawn data of a line chart as obstacles for labels: each series' segments and dots
  function lineObstacles(series, pts, x, y) {
    var ob = { rects: [], segs: [] };
    series.forEach(function (q) {
      var d = pts.filter(function (p) { return num(p.r[q.key]) !== null; }).map(function (p) { return [x(p.d), y(num(p.r[q.key]))]; });
      if (q.line !== false) for (var i = 1; i < d.length; i++) ob.segs.push([d[i - 1][0], d[i - 1][1], d[i][0], d[i][1]]);
      if (q.dots || d.length === 1) d.forEach(function (p) { var r = (q.r || 2.5) + 1; ob.rects.push({ x0: p[0] - r, x1: p[0] + r, y0: p[1] - r, y1: p[1] + r }); });
    });
    return ob;
  }
  // y tick labels never overlap: keep every k-th tick, k the smallest stride that leaves one label height (plus 2 px) between
  function thinTicks(ticks, y, gap) {
    if (ticks.length < 3) return ticks;
    gap = gap || 13;
    var sorted = ticks.slice().sort(function (a, b) { return a - b; });
    for (var k = 1; k < sorted.length; k++) {
      var kept = sorted.filter(function (t, i) { return i % k === 0; }), ok = true;
      for (var i = 1; i < kept.length; i++) if (Math.abs(y(kept[i]) - y(kept[i - 1])) < gap) { ok = false; break; }
      if (ok) return kept;
    }
    return [sorted[0]];
  }
  function bandPick(x, rows) {
    return function (mx) {
      if (!rows.length) return -1;
      var st = x.step(), gap = st * x.paddingInner() / 2, i = Math.floor((mx - x(rows[0].x) + gap) / st);
      return Math.max(0, Math.min(rows.length - 1, i));
    };
  }
  // in: tick labels sit inside the plot on their gridline at the left edge (narrow level charts), with a surface halo
  // inn (phone level charts): the gridlines only; the line chart places the tick labels itself, over the data
  function gridY(g, ticks, y, x0, x1, fmt, T, inn) { ticks.forEach(function (t) { mk(g, 'line', { 'class': 'ck-c-grid', x1: x0, x2: x1, y1: y(t), y2: y(t), stroke: T('chart-grid') }); if (!inn) mk(g, 'text', { x: x0 - 6, y: y(t), dy: '0.32em', 'text-anchor': 'end', fill: T('chart-tick') }, fmt(t)); }); }
  function drawLabels(g, list, T) { list.forEach(function (lb) { var t = mk(g, 'text', { 'class': lb.cls, x: lb.x, y: lb.y, 'text-anchor': lb.anchor || 'end', fill: T(lb.tone), 'font-weight': lb.bold ? 680 : null, 'paint-order': 'stroke', stroke: T('surface'), 'stroke-width': 3 }, lb.text); if (lb.marks) mark(t, lb.marks, lb.value, lb.text); }); }
  // label place: x, y and the text anchor
  function A(x, y, an) { return { x: x, y: y, anchor: an }; }
  function uniq(ticks, fmt) { var seen = {}; return ticks.filter(function (t) { var k = fmt(t); if (seen[k]) return false; seen[k] = 1; return true; }); }
  // words: [up, down], e.g. ['slower', 'faster'] for a pace
  function trendWords(fmt, a, b, firstDate, words) {
    if (a === null || b === null || a === undefined || b === undefined) return '';
    var d = b - a, w = words || ['up', 'down']; if (fmt(Math.abs(d)) === fmt(0) || fmt(a) === fmt(b)) return ', level since ' + fDay(P(firstDate));
    return ', ' + (d > 0 ? w[0] : w[1]) + ' ' + fmt(Math.abs(d)) + ' since ' + fDay(P(firstDate));
  }
  // Without pos: compared on the shown (rounded) values, so the words never contradict the printed numbers.
  // With pos ('above', 'below', 'inside': the caller's own comparison, the one its tile text uses): that word is said, and
  // the band edges get one more decimal when rounding would make the printed numbers contradict it.
  // a default k-decimal format: the page's shared half-up formatter (window.CX.fmt, calc.js) when it is there, else d3's
  function dfmt(k) { var cx = window.CX; return cx && cx.fmt ? cx.fmt('.' + k + 'f') : d3.format('.' + k + 'f'); }
  function shownN(x, f) { var t = String(f(x)), n = Number(t.replace(/[^0-9.\-]/g, '')); return t.indexOf(':') < 0 && isFinite(n) && t.trim() !== '' ? n : x; }
  function edgeFmt(v, a, b, fmt, pos) {
    if (!pos || v === null || String(fmt(v)).indexOf(':') >= 0) return fmt;
    var V = shownN(v, fmt), A = shownN(a, fmt), B = shownN(b, fmt);
    var ok = pos === 'below' ? V < A : pos === 'above' ? V > B : V >= A && V <= B;
    return ok ? fmt : dfmt((String(fmt(b)).split('.')[1] || '').length + 1);
  }
  function bandWords(v, lo, hi, fmt, unit, pos) {
    if (v === null || lo === null || hi === null) return '';
    var a = Math.min(lo, hi), b = Math.max(lo, hi);
    if (!pos) pos = v < a ? 'below' : v > b ? 'above' : 'inside'; // the exact values decide; edgeFmt keeps the printed edges from contradicting
    var ef = edgeFmt(v, a, b, fmt, pos);
    return ', ' + pos + ' your usual ' + ef(a) + ' to ' + ef(b) + (unit ? ' ' + unit : '');
  }
  // The change in a line's sentence (one rule for every line chart):
  // 1. a smoothed series (smooth: true, or a label that says "average") carries the change: the headline itself when it
  //    is the smoothed one (named too unless the title already says average), otherwise named ("28-night average down 2 since Aug 6"); the latest single value stays first;
  // 2. no smoothed series: the mean of the first 7 points against the mean of the last 7 ("7-night average"), from 14 points;
  // 3. fewer points: the first against the last.
  function isSmooth(q) { return q.smooth === true || (q.smooth !== false && /average/i.test(q.label || '')); }
  function lineTrend(s, series, head, pts, fmt, xk) {
    var vals = function (q) { return pts.filter(function (p) { return num(p.r[q.key]) !== null; }); };
    var sm = isSmooth(head) ? head : series.filter(function (q) { return q !== head && isSmooth(q); })[0];
    if (sm) {
      var d = vals(sm); if (d.length < 2) return '';
      var t = trendWords(fmt, num(d[0].r[sm.key]), num(d[d.length - 1].r[sm.key]), d[0].r[xk], s.words);
      return sm === head && (/average/i.test(s.title || '') || !/average/i.test(sm.label || '')) ? t : t.replace(/^, /, ', ' + String(sm.label).replace(/^./, function (ch) { return ch.toLowerCase(); }) + ' ');
    }
    var h = vals(head), k = s.trendN || 7;
    if (h.length < 2 * k) return trendWords(fmt, num(h[0].r[head.key]), num(h[h.length - 1].r[head.key]), h[0].r[xk], s.words);
    var mean = function (a) { return d3.mean(a, function (p) { return num(p.r[head.key]); }); };
    return trendWords(fmt, mean(h.slice(0, k)), mean(h.slice(-k)), h[0].r[xk], s.words).replace(/^, /, ', ' + k + '-' + (s.per || 'reading') + ' average ');
  }
  function uw(v, unit, vf) { var t = vf(v); return t + (unit ? ' ' + (t === '1' && /s$/.test(unit) ? unit.slice(0, -1) : unit) : ''); }
  CKC.say = { trend: trendWords, band: bandWords };

  // =====================================================================================================
  // LINE with personal band (headline trend). Sparkline = the same with spark: true.
  // =====================================================================================================
  CKC.line = function (host, s) {
    var redraw = function () { return CKC.line(host, s); };
    var rows = s.rows || [], xk = s.x || 'date';
    var pts = rows.map(function (r) { return { d: P(r[xk]), r: r }; }).filter(function (p) { return !isNaN(p.d); });
    var series = s.series || [];
    var hi0 = s.head !== undefined ? s.head : Math.max(0, series.findIndex(function (q) { return q.line !== false; }));
    var head = series[hi0] || series[0];
    var mainS = series[s.main !== undefined ? s.main : hi0] || head;
    var defined = head ? pts.filter(function (p) { return num(p.r[head.key]) !== null; }) : [];
    if (!pts.length || !head) return note(host, s.empty || NODATA, s);
    if (s.minPoints && defined.length < s.minPoints) return note(host, s.withheld || ((s.title || 'This chart') + ' is withheld: it needs ' + s.minPoints + ' readings and has ' + defined.length + '.'), s);
    var unit = s.unit || '', endUnit = s.endUnit !== undefined ? s.endUnit : unit;
    var spk = !!s.spark;
    var c = frame(host, s, 'line', redraw), svg = c.svg, W = c.W, H = c.H, T = c.T, m = c.m;
    var vals = [];
    series.forEach(function (q) { pts.forEach(function (p) { var v = num(p.r[q.key]); if (v !== null) vals.push(v); }); });
    (s.bands || []).forEach(function (b) { pts.forEach(function (p) { var lo = num(p.r[b.lo]), hi = num(p.r[b.hi]); if (lo !== null) vals.push(lo); if (hi !== null) vals.push(hi); }); });
    (s.hbands || []).forEach(function (hb) { vals.push(hb[0], hb[1]); });
    (s.thresholds || []).forEach(function (t) { if (s.thresholdsInDomain && num(t.value) !== null) vals.push(num(t.value)); });
    if (s.yInclude) vals.push.apply(vals, s.yInclude);
    var ext = d3.extent(vals), lo = ext[0], hi = ext[1], pad = (hi - lo) * 0.1 || 1; lo -= pad; hi += pad;
    if (s.yMin !== undefined && lo < s.yMin) lo = s.yMin;
    var stripH = (s.strips || []).length ? 8 : 0, stripSeen = {}, stripOb = [];
    var top = spk ? 3 : (unit || s.axisLabel ? 22 : 8), bottom = spk ? H - 3 : H - 20 - stripH - (stripH ? 4 : 0);
    var yr = [bottom, top];
    var y = s.yFixed ? d3.scaleLinear(s.yFixed, yr) : s.yDomain ? d3.scaleLinear(s.yDomain, yr) : s.nice === false || spk ? d3.scaleLinear([lo, hi], yr) : d3.scaleLinear([lo, hi], yr).nice(4);
    var fmt = s.fmt || (s.digits ? dfmt(s.digits) : d3.format('d'));
    // lvl: a level chart on a phone (narrow, with tbands): full-width plot, ticks inside, band names in a right column
    var lvl = c.narrow && !spk && (s.tbands || []).length > 0;
    var ticks = spk ? [] : thinTicks(uniq(s.yTicks || y.ticks(s.nice === false ? 3 : 4), fmt).filter(function (t) { var yy = y(t); return yy >= (lvl ? top + 12 : top - 1) && yy <= bottom + 1; }), y, lvl ? 40 : 0);
    var left = spk || lvl ? 2 : m.max(ticks.map(fmt)) + 8;
    // end labels: value and unit on the headline series; other lines get their name and value (direct labels, no legend)
    var endFmt = function (q, v) { return (q.endFmt || fmt)(v); };
    var ends = [];
    series.forEach(function (q, i) {
      var isHead = q === head; if (q.end === false && !isHead) return; if (!isHead && q.line === false && q.end !== true) return;
      if (isHead && s.endLabel === false) return;
      var lp = null; for (var j = pts.length - 1; j >= 0; j--) if (num(pts[j].r[q.key]) !== null) { lp = pts[j]; break; }
      if (!lp) return;
      var v = num(lp.r[q.key]);
      var t = isHead ? endFmt(q, v) + (endUnit ? (/^[%/]/.test(endUnit) ? '' : ' ') + endUnit : '') : (q.short || q.label || '') + ' ' + endFmt(q, v);
      ends.push({ q: q, i: i, p: lp, v: v, text: t, head: isHead, cls: isHead ? ENDL : 'ck-c-serlabel' });
    });
    var right = spk ? (ends.length ? m.max(ends.map(function (e) { return e.text; }), ENDL) + 8 : 6) : Math.max(8, m.max(ends.map(function (e) { return e.text; }), ENDL) + 10);
    if (W - left - right < 80) { ends = ends.filter(function (e) { return e.head; }); right = Math.max(8, m.max(ends.map(function (e) { return e.text; }), ENDL) + 10); }
    // narrow level chart: the band labels leave the plot for a right column as wide as the longest word (at most 30%);
    // the end label moves into the plot beside its dot, so no end gutter is kept
    var colW = 0, colL = [];
    if (lvl) { ends = ends.filter(function (e) { return e.head; }); colW = Math.round(Math.min(W * 0.3, Math.max(64, m.max([].concat.apply([], s.tbands.map(function (t) { return String(t.label).split(' '); })), TH) + 12))); right = colW + 4; c.xMax = W - colW; }
    var xd = s.xDomain ? s.xDomain.map(P) : d3.extent(pts, function (p) { return p.d; });
    if (+xd[0] === +xd[1]) xd = [new Date(+xd[0] - 864e5 * 3), new Date(+xd[1] + 864e5 * 3)];
    var x = d3.scaleUtc(xd, [left, W - right]);
    c.top = top; c.bottom = bottom;
    var g = mk(svg, 'g', { 'class': 'ck-c-under' });
    if (!spk) {
      gridY(g, ticks, y, left, W - right, fmt, T, lvl);
      if (unit || s.axisLabel) mk(g, 'text', { 'class': 'ck-c-unit', x: 0, y: 10, fill: T('fg-3') }, s.axisLabel || unit);
      var tt = timeTicks(x, xd, W - left - right);
      tt.ticks.forEach(function (t) { mk(g, 'text', { x: x(t), y: H - 4, 'text-anchor': MID, fill: T('chart-tick') }, tt.fmt(t)); });
    }
    var yd = y.domain(), ylo = Math.min(yd[0], yd[1]), yhi = Math.max(yd[0], yd[1]);
    var labels = [];
    (s.hbands || []).forEach(function (hb) { mk(g, 'rect', { x: left, width: W - right - left, y: y(hb[1]), height: Math.max(1, y(hb[0]) - y(hb[1])), fill: T(THR), opacity: 0.16 }); });
    (s.sublines || []).filter(function (v) { return v > ylo && v < yhi; }).forEach(function (v) { mk(g, 'line', { x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: T(THR), 'stroke-width': 1, 'stroke-dasharray': '1 4', opacity: lvl ? 0.25 : 0.6 }); });
    (s.tbands || []).forEach(function (tb, i) {
      var a = tb.lo === null ? ylo : Math.max(ylo, tb.lo), b = tb.hi === null ? yhi : Math.min(yhi, tb.hi); if (b <= a) return;
      var yTop = Math.min(y(a), y(b)), hgt = Math.abs(y(a) - y(b)), col = T(tb.tone || THR);
      mk(g, 'rect', { x: left, width: W - right - left, y: yTop, height: hgt, fill: col, opacity: i % 2 ? 0.07 : 0.16 });
      // a sub-level band (Close up, tb.sub: its upper edge is inside its parent band) ends in a solid hairline; a band edge stays dashed
      if (tb.hi !== null && tb.hi < yhi && tb.hi > ylo) mk(g, 'line', { x1: left, x2: W - right, y1: y(tb.hi), y2: y(tb.hi), stroke: col, 'stroke-dasharray': tb.sub ? null : '4 3', opacity: tb.sub ? 0.4 : lvl ? 0.5 : null });
      var tbAlts = [A(left + 4, yTop + 10, ST), A((left + W - right) / 2, yTop + 10, MID)];
      if (hgt >= 24) tbAlts = [A(W - right - 2, yTop + hgt - 3)].concat(tbAlts, [A(left + 4, yTop + hgt - 3, ST)]);
      if (colW) colL.push({ tb: tb, y0: yTop, h: hgt, col: col });
      else if (hgt >= 12) labels.push({ prio: tb.now ? 2 : 0, x: W - right - 2, y: yTop + 10, tone: THR, bold: tb.now, text: tb.label, cls: TH + (tb.now ? '' : ' ck-c-light'), alts: tbAlts });
    });
    var bxs = [], refL = [], RW = { Target: 0, Baseline: 1, Strong: 2 };
    (s.blocks || []).forEach(function (bk) {
      var x0 = Math.max(left, x(P(bk.start))), x1 = Math.min(W - right, x(new Date(+P(bk.end) + 864e5))); if (x1 <= x0 + 2) return;
      var col = T(bk.tone || THR);
      // on a phone: one dashed marker per boundary inside the plot, and a name only on the current and coming blocks
      if (!lvl || x0 > left + 1) { mk(g, 'line', { x1: x0, x2: x0, y1: top - 6, y2: bottom, stroke: col, opacity: 0.6, 'stroke-dasharray': lvl ? '3 3' : null }); bxs.push(x0); }
      var wpx = x1 - x0, lbl = lvl && !bk.current && !bk.provisional ? '' : wpx > 150 ? bk.label + (bk.provisional ? ' (provisional)' : '') : wpx > 36 ? String(bk.label).split(' · ')[0] + (bk.provisional ? '*' : '') : '';
      if (lbl) labels.push({ prio: 6, x: x0 + 3, y: top + 4, anchor: ST, tone: bk.tone || THR, bold: bk.current, text: lbl, cls: TH });
      // the lines carry no text in the plot; the named block's figures (bk.goal) go to a key under the chart (CHARTS.md 5)
      if (bk.goal) (bk.lines || []).forEach(function (l) { if (l.v !== null) refL.push({ v: l.v, w: String(l.label).split(' ')[0], f: String(l.label).split(' ').slice(1).join(' '), tone: bk.tone || THR, dash: l.solid ? null : bk.provisional ? '2 3' : '4 3', sw: l.solid ? 1.5 : 1, marks: l.marks, when: bk.goal }); });
      (bk.shade || []).forEach(function (sh) { var ya = y(Math.max(ylo, Math.min(yhi, sh[0]))), yb = y(Math.max(ylo, Math.min(yhi, sh[1]))); mk(g, 'rect', { x: x0, width: x1 - x0, y: Math.min(ya, yb), height: Math.abs(ya - yb), fill: col, opacity: sh[2] }); });
      (bk.lines || []).filter(function (l) { return l.v !== null && l.v > ylo && l.v < yhi; }).forEach(function (l) {
        mk(g, 'line', { x1: x0, x2: x1, y1: y(l.v), y2: y(l.v), stroke: col, 'stroke-width': l.solid ? 1.5 : 1, 'stroke-dasharray': l.solid ? null : bk.provisional ? '2 3' : '4 3', opacity: bk.provisional ? 0.7 : 1 });
      });
    });
    // thresholds and baselines: only from the spec ({value, label, marks}); dashed hairline plus a direct label
    (s.thresholds || []).forEach(function (t) {
      var v = num(t.value); if (v === null || v <= ylo || v >= yhi) return;
      mk(g, 'line', { 'class': 'ck-c-threshold', x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: T(t.tone || THR) });
      if (t.label && !spk) labels.push({ prio: 3, x: W - right - 2, y: y(v) - 3, tone: t.tone || THR, text: t.label, cls: TH, marks: t.marks, value: v,
        alts: [A(W - right - 2, y(v) + 12), A(left + 4, y(v) - 3, ST), A(left + 4, y(v) + 12, ST), A((left + W - right) / 2, y(v) - 3, MID), A((left + W - right) / 2, y(v) + 12, MID)] });
    });
    var bandLast = null;
    (s.bands || []).forEach(function (b) {
      var bp = pts.filter(function (p) { return num(p.r[b.lo]) !== null && num(p.r[b.hi]) !== null; }); if (!bp.length) return;
      var area = d3.area().x(function (p) { return x(p.d); }).y0(function (p) { return y(num(p.r[b.lo])); }).y1(function (p) { return y(num(p.r[b.hi])); });
      if (b.personal !== false && !b.tone) mk(g, 'path', { 'class': 'ck-c-band', d: area(bp), fill: T('chart-band'), stroke: T(AXIS), 'stroke-dasharray': '3 3' });
      else mk(g, 'path', { d: area(bp), fill: T(b.tone || 'chart-band'), opacity: b.opacity || 0.18 });
      if (!bandLast && b.personal !== false && !b.tone) bandLast = { b: b, p: bp[bp.length - 1] };
      if (b.label && !spk) {
        var p0 = bp[0], bAlts = [];
        [0, 0.25, 0.5, 0.75, 1].forEach(function (f) { var q = bp[Math.round(f * (bp.length - 1))], an = f === 0 ? ST : f === 1 ? 'end' : MID, xx = x(q.d) + (f === 0 ? 2 : f === 1 ? -2 : 0); bAlts.push(A(xx, y(num(q.r[b.hi])) - 3, an), A(xx, y(num(q.r[b.lo])) + 12, an)); });
        if (top >= 20) bAlts.push(A(W - right - 2, 10, 'end')); // last: the top margin, clear of all data
        labels.push({ prio: 1, x: x(p0.d) + 2, y: y(num(p0.r[b.hi])) - 3, anchor: ST, tone: 'fg-3', text: b.label, cls: 'ck-c-light', alts: bAlts });
      }
    });
    (s.boxes || []).forEach(function (bx) {
      var x0 = Math.max(left, x(P(bx.start))), x1 = Math.min(W - right, x(P(bx.end))); if (x1 <= x0) return;
      mk(g, 'rect', { x: x0, width: x1 - x0, y: y(bx.hi), height: Math.max(1, y(bx.lo) - y(bx.hi)), fill: T(THR), 'fill-opacity': 0.14, stroke: T(THR), 'stroke-dasharray': '3 3' });
      if (bx.label) labels.push({ prio: 7, x: x1 - 2, y: y(bx.hi) - 3, tone: THR, text: bx.label, cls: TH, marks: bx.marks, value: bx.hi,
        alts: [A(x1 - 2, y(bx.lo) + 12), A(x0 + 2, y(bx.hi) - 3, ST), A(x0 + 2, y(bx.lo) + 12, ST)] });
    });
    if (stripH) (s.strips || []).forEach(function (st, i) {
      var sy = bottom + 4, x0 = Math.max(left, x(P(st.start))), x1 = Math.min(W - right, x(new Date(+P(st.end) + 864e5))); if (x1 <= x0) return;
      mk(g, 'rect', { x: x0, width: x1 - x0, y: sy, height: stripH, rx: 2, fill: T(st.tone || 'fg-3'), opacity: st.opacity || 0.35 });
      // a strip names itself once (direct label just above it), e.g. "recovery deficit"
      stripOb.push({ x0: x0, x1: x1, y0: sy, y1: sy + stripH });
      if (st.label && !spk && !stripSeen[st.label]) { stripSeen[st.label] = 1; labels.push({ prio: 4, x: x0 + 2, y: bottom - 3, anchor: ST, text: st.label, tone: 'fg-2', cls: TH, alts: [A(x1 - 2, bottom - 3, 'end'), A(x1 + 3, sy + 8, ST), A(x0 - 3, sy + 8, 'end')] }); }
    });
    // series tags: a direct name beside a series (no legend), e.g. "best 90-day effort" on a line, "each run" on dots
    series.forEach(function (q) {
      if (!q.tag || spk) return;
      var d = pts.filter(function (p) { return num(p.r[q.key]) !== null; }); if (!d.length) return;
      var cands = [];
      [0, 0.33, 0.66, 0.15, 0.5].forEach(function (f) { var p = d[Math.round(f * (d.length - 1))], px = x(p.d), py = y(num(p.r[q.key])); cands.push(A(px + 5, py - 7, ST), A(px + 5, py + 15, ST)); });
      labels.push({ prio: 5, x: cands[0].x, y: cands[0].y, anchor: ST, text: q.tag, tone: q.tagTone || 'fg-2', cls: TH, alts: cands.slice(1) });
    });
    if (s.today) { var tx = x(P(s.today)); if (tx > left && tx < W - right && !(lvl && bxs.some(function (bx) { return Math.abs(bx - tx) < 6; }))) { mk(g, 'line', { x1: tx, x2: tx, y1: top - 4, y2: bottom, stroke: T(AXIS) }); bxs.push(tx); } }
    var gl = spread(ends.map(function (e) { return { e: e, y: y(e.v) + 4 }; }), top + 4, bottom + 4, 13);
    gl.forEach(function (l) {
      var e = l.e; e.ex = Math.min(W - right, x(e.p.d)); e.tw = m(e.text, e.cls); e.near = W - right - e.ex > e.tw + 14; e.tx = e.near ? e.ex + 7 : W - right + 6; e.ty = e.near ? y(e.v) - 6 : l.y;
      if (lvl && !e.near) { e.halo = 1; e.tx = Math.max(left + 2, e.ex - 7 - e.tw); e.ty = y(e.v) - 8 < top + 10 ? y(e.v) + 17 : y(e.v) - 8; }
    });
    // collision rule (phone level charts): a value label (block line, threshold) within 14 px of the end label's line is not
    // placed on its own; it is stacked as its own line beside the end label, away from the dot, with its full name and marks
    var lob0 = lineObstacles(series, pts, x, y), stack = [], he = gl.length ? gl[0].e : null, tickL = [];
    var hitsOf = function (b) { var n = 0; lob0.rects.forEach(function (r) { if (overlap(b, r)) n++; }); lob0.segs.forEach(function (sg) { if (hitSeg(b, sg)) n++; }); return n; };
    var tbox = function (x0, w, yy) { return { x0: x0 - 2, x1: x0 + w + 2, y0: yy - 12, y1: yy + 3 }; };
    if (lvl && he) {
      labels = labels.filter(function (lb) { if (lb.value === undefined || Math.abs(y(lb.value) - y(he.v)) >= 14) return true; stack.push(lb); return false; });
      var dir = he.ty < y(he.v) ? -1 : 1;
      stack.forEach(function (lb, i) { lb.st = lb.full || lb.text; lb.w = m(lb.st, TH); lb.sy = he.ty + dir * 13 * (i + 1); lb.sx = Math.max(left + 2, Math.min(he.tx, W - right - 2 - lb.w)); });
      // the end label and its stack never cross a block boundary or the today line: when they would, the group moves as one
      // into the nearest gap between those lines that holds it (left-aligned right of the dot, right-aligned left of it),
      // counting the dots and lines it would touch; with no such gap it stays beside the dot
      var grp = [he].concat(stack), gx0 = Math.min.apply(null, [he.tx].concat(stack.map(function (lb) { return lb.sx; }))), gw = Math.max.apply(null, [he.tw].concat(stack.map(function (lb) { return lb.w; })));
      var gx1 = Math.max.apply(null, [he.tx + he.tw].concat(stack.map(function (lb) { return lb.sx + lb.w; }))), vx = bxs.filter(function (v) { return v > left + 1 && v < W - right - 1; });
      var crosses = function (a, b) { return vx.some(function (v) { return v > a - 3 && v < b + 3; }); };
      if (crosses(gx0, gx1)) {
        var edges = [left].concat(vx, [W - right]).sort(function (a, b) { return a - b; }), best = null;
        var ey = y(he.v), up = ey - 8 - 13 * stack.length >= top + 10, dn = ey + 17 + 13 * stack.length <= bottom - 2;
        for (var k = 1; k < edges.length; k++) {
          var a0 = edges[k - 1] + 4, a1 = edges[k] - 4; if (a1 - a0 < gw) continue;
          var right1 = a0 >= he.ex ? true : a1 <= he.ex ? false : a1 - (he.ex + 7) >= gw;
          var gx0 = right1 ? Math.max(a0, Math.min(he.ex + 7, a1 - gw)) : Math.min(a1 - gw, Math.max(a0, he.ex - 7 - gw));
          // above the dot (the stack upward) or below it (the stack downward), and stepped away from the dot 6 px at a time
          // inside the gap, whichever touches least data nearest the dot
          for (var st = 0; st < 12; st++) [-1, 1].forEach(function (d2) {
            var gx = gx0 + (right1 ? 1 : -1) * 6 * st; if (gx < a0 || gx + gw > a1) return;
            if ((d2 < 0 && !up) || (d2 > 0 && !dn)) return;
            var ty = d2 < 0 ? ey - 8 : ey + 17, hits = 0;
            grp.forEach(function (o, i) { var ww = o === he ? he.tw : o.w, xx = right1 ? gx : gx + gw - ww; hits += hitsOf(tbox(xx, ww, ty + d2 * 13 * i)); });
            var sc = Math.min(Math.abs(gx - he.ex), Math.abs(gx + gw - he.ex)) + 40 * hits + (d2 === dir ? 0 : 1);
            if (!best || sc < best.sc) best = { sc: sc, gx: gx, r: right1, ty: ty, d: d2 };
          });
        }
        if (best) { he.tx = best.r ? best.gx : best.gx + gw - he.tw; he.ty = best.ty; he.halo = 1; stack.forEach(function (lb, i) { lb.sx = best.r ? best.gx : best.gx + gw - lb.w; lb.sy = best.ty + best.d * 13 * (i + 1); }); }
      }
    }
    var lob = { rects: lob0.rects.concat(stripOb, gl.map(function (l) { var e = l.e; return tbox(e.tx, e.tw, e.ty); })), segs: lob0.segs }; c.labelBottom = bottom + stripH + 4;
    // on a phone level chart the end label and its stack are hard: a label that would touch one is moved or left out; the
    // inside ticks are placed after the labels and keep clear of them
    if (lvl) {
      lob.hard = gl.map(function (l) { var e = l.e; return tbox(e.tx, e.tw, e.ty); }).concat(stack.map(function (lb) { return tbox(lb.sx, lb.w, lb.sy); }));
    }
    var placedL = placeInside(c, labels, lob); drawLabels(g, placedL, T);
    if (lvl) {
      placedL.forEach(function (lb) { var w = m(lb.text, lb.cls) + 2, x0 = lb.anchor === ST ? lb.x : lb.anchor === MID ? lb.x - w / 2 : lb.x - w; lob.hard.push({ x0: x0, x1: x0 + w, y0: lb.y - 11, y1: lb.y + 2 }); });
      // an inside tick label sits on its gridline at the left end, or at the right end when the left end would touch a dot,
      // the line, the end label, its stack or a placed label, then 8 px further in from either end, up to 64 px; the first
      // free place wins, else the one touching least. It is drawn over the data with a surface halo
      ticks.forEach(function (t) {
        var w = m(fmt(t)), yy = y(t) - 3, best = null;
        for (var k = 0; k < 9 && !(best && !best.sc); k++) [0, 1].forEach(function (r) {
          if (best && !best.sc) return;
          var x0 = r ? W - right - w - 6 - 8 * k : left + 8 * k, b = { x0: x0, x1: x0 + w + 6, y0: yy - 11, y1: yy + 2 };
          var sc = hitsOf(b) + (lob.hard.some(function (h) { return overlap(b, h); }) ? 9 : 0);
          if (!best || sc < best.sc) best = { sc: sc, b: b, x: r ? b.x1 - 2 : x0 + 2, an: r ? 'end' : ST };
        });
        tickL.push({ t: t, x: best.x, y: yy, an: best.an }); lob.hard.push(best.b);
      });
    }
    var drawStack = function () { stack.forEach(function (lb) { var t = mk(svg, 'text', { 'class': TH, x: lb.sx, y: lb.sy, fill: T(lb.tone), 'paint-order': 'stroke', stroke: T('surface'), 'stroke-width': 3 }, lb.st); if (lb.marks) mark(t, lb.marks, lb.value, lb.st); }); };
    // the band column: a bar level with each band and its name beside it, wrapped by word. Every band with a bar is named:
    // the names keep their order and sit as close to their band's middle as the column allows (pushed apart 2 px at least);
    // a name pushed off its own band gets a short leader from its bar. When the full names do not fit the column's height,
    // every name drops its basis in brackets; when that still does not fit, the names of the smallest bands are left out
    // (the bar stays; Scale and the tooltip name it)
    if (colW) {
      var cx0 = W - colW + 4, cLo = Math.max(2, top - 14), cHi = bottom + 8, cW = colW - 14;
      colL.sort(function (a, b) { return a.y0 - b.y0; });
      colL.forEach(function (l) { mk(g, 'rect', { x: cx0, y: l.y0 + 1, width: 3, height: Math.max(1, l.h - 2), rx: 1.5, fill: l.col }); });
      var wrap = function (txt) { var ln = [], cur = ''; txt.split(' ').forEach(function (wd) { var t2 = cur ? cur + ' ' + wd : wd; if (cur && m(t2, TH) > cW) { ln.push(cur); cur = wd; } else cur = t2; }); ln.push(cur); return ln; };
      var lay = function (list) {
        var bx = list.map(function (o) { var h = 12 * o.ln.length + 1; return { o: o, h: h, y: o.l.y0 + o.l.h / 2 - h / 2 }; }), i;
        if (bx.reduce(function (a, b) { return a + b.h + 2; }, -2) > cHi - cLo) return null;
        for (i = 0; i < bx.length; i++) bx[i].y = Math.max(bx[i].y, i ? bx[i - 1].y + bx[i - 1].h + 2 : cLo);
        for (i = bx.length - 1; i >= 0; i--) bx[i].y = Math.min(bx[i].y, i < bx.length - 1 ? bx[i + 1].y - bx[i].h - 2 : cHi - bx[i].h);
        return bx;
      };
      var all = colL.map(function (l) { return { l: l, ln: wrap(String(l.tb.label)) }; }), boxes = lay(all);
      if (!boxes) { all = colL.map(function (l) { return { l: l, ln: wrap(String(l.tb.label).replace(/\s*\(.*\)$/, '')) }; }); boxes = lay(all); }
      while (!boxes && all.length > 1) { var sm = all.filter(function (o) { return !o.l.tb.now; }).sort(function (a, b) { return a.l.h - b.l.h; })[0] || all[0]; all.splice(all.indexOf(sm), 1); boxes = lay(all); }
      (boxes || []).forEach(function (b) {
        var l = b.o.l, mid = b.y + b.h / 2, tx0 = cx0 + 10;
        if (b.y + b.h < l.y0 + 1 || b.y > l.y0 + l.h - 1) mk(g, 'path', { d: 'M' + (cx0 + 3) + ',' + (l.y0 + l.h / 2) + 'H' + (cx0 + 6) + 'V' + mid + 'H' + (cx0 + 8), stroke: l.col, 'stroke-width': 1, fill: 'none' });
        var t = mk(g, 'text', { 'class': TH + (l.tb.now ? '' : ' ck-c-light'), x: tx0, y: b.y + 10, fill: T(THR) });
        b.o.ln.forEach(function (tx, i) { mk(t, 'tspan', { x: tx0, dy: i ? 12 : 0 }, tx + ' '); });
      });
    }
    // series
    var plot = svg;
    if (s.clip) { var cid = 'ckclip' + (++uid); mk(mk(svg, 'clipPath', { id: cid }), 'rect', { x: left, y: 0, width: Math.max(0, W - right - left), height: bottom + 2 }); plot = mk(svg, 'g', { 'clip-path': 'url(#' + cid + ')' }); }
    var headPath = null;
    series.forEach(function (q) {
      var def = pts.filter(function (p) { return num(p.r[q.key]) !== null; }), col = T(q.tone || S1);
      if (q.line !== false && def.length > 1) {
        var ln = d3.line().defined(function (p) { return num(p.r[q.key]) !== null; }).x(function (p) { return x(p.d); }).y(function (p) { return y(num(p.r[q.key])); });
        var path = mk(plot, 'path', { 'class': 'ck-c-line', d: ln(q.connect ? def : pts), fill: 'none', stroke: col, 'stroke-width': q.width || 2, 'stroke-linecap': q.dashed ? 'butt' : 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': q.dashed ? '5 4' : null });
        if (q === head && !q.dashed) headPath = path;
      }
      var dense = def.length > (W - left - right) / 3;
      if (q.dots || (q.line !== false && def.length === 1)) {
        var dg = mk(plot, 'g', { fill: col, opacity: dense && def.length > 1 ? 0.55 : null });
        def.forEach(function (p) { mk(dg, 'circle', { cx: x(p.d), cy: y(num(p.r[q.key])), r: dense && def.length > 1 ? Math.min(1.4, q.r || 2.5) : q.r || 2.5 }); });
      }
    });
    drawStack(); // over the data, like the end label and the inside ticks
    tickL.forEach(function (k) { mk(svg, 'text', { x: k.x, y: k.y, 'text-anchor': k.an, fill: T('chart-tick'), 'paint-order': 'stroke', stroke: T('surface'), 'stroke-width': 3 }, fmt(k.t)); });
    // end labels in the right gutter, nudged apart
    var endNode = null;
    gl.forEach(function (l) {
      var e = l.e, ex = e.ex, near = e.near;
      if (e.head) mk(svg, 'circle', { cx: ex, cy: y(e.v), r: spk ? 2.6 : 3.2, fill: T(e.q.tone || S1), stroke: T('surface'), 'stroke-width': 1.5 });
      var hl = near || e.halo, t = mk(svg, 'text', { 'class': e.cls, x: e.tx, y: e.ty, fill: T(e.head ? 'chart-label' : 'fg-2'), 'paint-order': hl ? 'stroke' : null, stroke: hl ? T('surface') : null, 'stroke-width': hl ? 3 : null }, e.text);
      if (e.head) { endNode = t; if (s.marks) mark(t, Object.assign({}, s.marks, { field: s.marks.field || e.q.key, keyVal: e.p.r[s.marks.key || xk] }), e.v, e.text); }
    });
    // sentence: what and when, the latest value, the trend over the view, and the comparison with the personal range
    var lastP = defined[defined.length - 1], firstP = defined[0], lastV = num(lastP.r[head.key]);
    var sentence = typeof s.sentence === 'function' ? s.sentence({ last: lastP.r, first: firstP.r, value: lastV, fmt: fmt }) : s.sentence;
    if (!sentence) {
      var bw = bandLast ? bandWords(lastV, num(bandLast.p.r[bandLast.b.lo]), num(bandLast.p.r[bandLast.b.hi]), fmt, unit) : '';
      sentence = (s.title || head.label || 'Trend') + (s.window ? ', ' + s.window : '') + ': ' + (s.lead ? s.lead + ' ' : '') + endFmt(head, lastV) + (unit ? (/^[%/]/.test(unit) ? '' : ' ') + unit : '') + ' on ' + fDay(lastP.d) +
        (defined.length > 1 ? lineTrend(s, series, head, pts, fmt, xk) : ', the only reading') + bw + (s.extra ? '; ' + s.extra : '') + '.';
    }
    if (s.interactive !== false && !spk) {
      var bis = d3.bisector(function (p) { return p.d; }).center;
      var items = pts.map(function (p) {
        var mv = num(p.r[mainS.key]);
        var lines = s.tipLines ? s.tipLines(p.r) : series.map(function (q) { var v = num(p.r[q.key]); return { tone: series.length > 1 ? q.tone : null, text: (q.label ? q.label + ': ' : series.length > 1 ? q.key + ': ' : '') + (v === null ? 'unknown' : fmt(v) + (s.tipUnit !== undefined ? s.tipUnit : unit ? ' ' + unit : '')) }; });
        return { x: x(p.d), y: mv === null ? null : y(mv), head: fWd(p.d), lines: lines, row: p.r, short: fWd(p.d) + ': ' + (mainS.label ? mainS.label + ' ' : '') + (mv === null ? 'no reading' : fmt(mv) + (unit ? ' ' + unit : '')) };
      });
      interact(c, items, { rule: true, dot: true, dotTone: mainS.tone || 'fg', pick: function (mx) { return bis(pts, x.invert(mx)); } });
    }
    drawIn(c, headPath);
    var res = finish(c, sentence, s.marks ? Object.assign({}, s.marks, { field: s.marks.field || head.key, keyVal: lastP.r[s.marks.key || xk] }) : null, lastV, endNode ? endNode.textContent : '');
    if (refL.length && !spk) {
      // the key (Phase 6 round 2, L-A): one line under the plot, Target, Baseline, Strong, each figure after a short sample of
      // its line; every figure keeps its line's marks
      refL.sort(function (a, b) { return RW[a.w] - RW[b.w]; });
      var kp = hel('p', 'ck-chart-key ck-refkey');
      kp.append(hel('span', 'ck-vh', 'For ' + refL[0].when + ': ')); // the block is named for screen readers; on screen the key stays one line
      refL.forEach(function (r) {
        var it = hel('span'), sw = document.createElementNS(NS, 'svg'); sw.setAttribute('class', 'ck-refsw'); sw.setAttribute('width', 14); sw.setAttribute('height', 8); sw.setAttribute('aria-hidden', 'true');
        mk(sw, 'line', { x1: 0, x2: 14, y1: 4, y2: 4, stroke: T(r.tone), 'stroke-width': r.sw + 0.5, 'stroke-dasharray': r.dash });
        var f = hel('span', null, r.f); mark(f, r.marks || null, r.v, r.f); it.append(sw, r.w + ' ', f); kp.append(it);
      });
      host.insertBefore(kp, c.cap);
    }
    res.x = x; res.y = y; res.left = left; res.right = right; res.svg = svg;
    return res;
  };
  CKC.spark = function (host, s) {
    return CKC.line(host, Object.assign({ h: 32, spark: true, interactive: false, nice: false, minW: 80 }, s, { spark: true }));
  };

  // =====================================================================================================
  // BAR: volume per period; stacked when parts sum to the period total; "so far" marker on the partial period
  // rows: [{x, label?, v?, parts?: {key: value}}]; stack: [{key, label, tone, outline}]
  // =====================================================================================================
  CKC.bar = function (host, s) {
    var redraw = function () { return CKC.bar(host, s); };
    var rows = s.rows || [];
    if (!rows.length) return note(host, s.empty || NODATA, s);
    var stack = s.stack || [{ key: 'v', label: s.label || '', tone: s.tone || 'fg-3' }];
    var keys = stack.map(function (k) { return k.key; });
    var tot = function (r) { return r.parts ? keys.reduce(function (a, k) { return a + (num(r.parts[k]) || 0); }, 0) : num(r.v) || 0; };
    var c = frame(host, s, 'bar', redraw), svg = c.svg, W = c.W, H = c.H, T = c.T, m = c.m;
    var unit = s.unit || '', spk = !!s.spark;
    var refMax = d3.max(rows, function (r) { return Math.max(tot(r), num(r.ref) || 0); }) || 0;
    var tmax = d3.max((s.thresholds || []).map(function (t) { return num(t.value) || 0; })) || 0;
    var maxY = Math.max(s.floor || 0, refMax, s.thresholdsInDomain === false ? 0 : tmax) || 1;
    var partial = s.partial || null, top = spk ? 3 : (unit || s.axisLabel ? 22 : 10) + (partial ? 4 : 0), bottom = spk ? H - 2 : H - 20;
    var y = d3.scaleLinear([0, maxY], [bottom, top]); if (s.nice !== false) y.nice(4);
    if (s.yMax !== undefined) y.domain([0, Math.max(s.yMax, refMax)]);
    var fmt = s.fmt || d3.format('~g'), vf = s.vfmt || fmt, u = unit ? ' ' + unit : '';
    var ticks = spk ? [] : thinTicks(s.yTicks || y.ticks(s.tickCount || 4), y);
    var left = spk ? 0 : m.max(ticks.map(fmt)) + 8;
    // direct labels for the stack parts at the newest bar that has data (no legend)
    var lastI = -1; for (var i = rows.length - 1; i >= 0; i--) if (tot(rows[i]) > 0 && !(s.partial && rows[i].x === s.partial.x)) { lastI = i; break; }
    if (lastI < 0) for (var i2 = rows.length - 1; i2 >= 0; i2--) if (tot(rows[i2]) > 0) { lastI = i2; break; }
    var focusI = s.selected !== undefined ? rows.findIndex(function (r) { return r.x === s.selected; }) : -1;
    var labI = s.labelAt === 'selected' && focusI >= 0 ? focusI : lastI;
    // every part on the chart is named: directly where its segment at that bar is tall enough for a label (12 px),
    // otherwise in a one-line key under the chart
    var partLabels = [], keyed = [], direct = {};
    if (s.stack && s.directLabels !== false) stack.forEach(function (k) {
      var v = labI >= 0 ? num(rows[labI].parts[k.key]) || 0 : 0;
      if (s.partKey !== 'all' && v > 0 && y(0) - y(v) >= 12) { direct[k.key] = 1; partLabels.push({ k: k, text: k.label }); }
      else if (rows.some(function (r) { return (num(r.parts && r.parts[k.key]) || 0) > 0; })) keyed.push(k);
    });
    (s.refLabel && rows.some(function (r) { return num(r.ref); })) && partLabels.push({ ref: true, text: s.refLabel });
    // band and threshold labels sit in the right margin, level with their line, so they never print over a bar
    var dTop = Math.max(y.domain()[0], y.domain()[1]), gut = [];
    if (!spk) {
      (s.bands || []).forEach(function (b) { if (!b.label) return; var lo = Math.max(num(b.lo), 0), hi = Math.min(num(b.hi), dTop); if (hi <= lo) return; gut.push({ text: b.label, y: y((lo + hi) / 2) + 4, tone: THR, cls: TH, marks: b.marks, value: b.hi }); });
      (s.thresholds || []).forEach(function (t) { var v = num(t.value); if (!t.label || v === null || v <= 0 || v > dTop) return; gut.push({ text: t.label, y: y(v) + 4, tone: THR, cls: TH, marks: t.marks, value: v }); });
    }
    var gutTexts = partLabels.map(function (p) { return p.text; }).concat(gut.map(function (q) { return q.text; }));
    var right = spk ? 2 : gutTexts.length ? Math.min(W * 0.34, Math.max(m.max(partLabels.map(function (p) { return p.text; }), 'ck-c-serlabel'), m.max(gut.map(function (q) { return q.text; }), TH)) + 10) : 4;
    var x = d3.scaleBand(rows.map(function (r) { return r.x; }), [left, W - right]).padding(s.padding !== undefined ? s.padding : 0.28);
    var bw = Math.min(s.barMax || 24, x.bandwidth()), off = (x.bandwidth() - bw) / 2;
    // x labels on a weekly date axis (rows 7 days apart, no row labels): the full date under every bar when it fits;
    // otherwise two rows, the day of the month under every bar and the month name under the first bar of each month;
    // when even the day number is wider than a bar, the month name at each month's first bar. Never a skipped week.
    var xtier = null;
    if (!spk && s.xTiers !== false && rows.length > 1 && rows.every(function (r, i) { return !r.label && /^\d{4}-\d{2}-\d{2}$/.test(r.x) && (!i || dayGap(rows[i - 1].x, r.x) === 7); })) {
      var fullW = d3.max(rows, function (r) { return m(fDay(P(r.x)), ''); });
      var dw = m('28', '') + 3; xtier = fullW + 6 <= x.step() ? 'full' : dw <= x.step() ? 'day' : dw <= 2 * x.step() ? 'day2' : 'month';
      if (xtier === 'day' || xtier === 'day2') { H += 14; c.H = H; svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); }
    }
    c.top = top; c.bottom = bottom;
    var g = mk(svg, 'g', {}), labels = [];
    if (!spk) {
      gridY(g, ticks, y, left, W - right, fmt, T);
      if (unit || s.axisLabel) mk(g, 'text', { 'class': 'ck-c-unit', x: 0, y: 10, fill: T('fg-3') }, s.axisLabel || unit);
      mk(g, 'line', { 'class': 'ck-c-axis', x1: left, x2: W - right, y1: y(0), y2: y(0), stroke: T(AXIS) });
    }
    (s.bands || []).forEach(function (b, i) {
      var a = y(Math.min(num(b.hi), y.domain()[1])), z = y(Math.max(num(b.lo), 0)); if (z <= a) return;
      mk(g, 'rect', { x: left, width: W - right - left, y: a, height: z - a, fill: T(b.tone || THR), opacity: b.opacity || 0.12 });
    });
    var selRect = null;
    if (focusI >= 0 && !spk) selRect = mk(g, 'rect', { x: x(rows[focusI].x) - 2, width: x.bandwidth() + 4, y: top - 8, height: bottom - top + 8, rx: 6, fill: T('fg'), opacity: 0.07 });
    var pid = null;
    if (partial) { pid = 'ckhatch' + (++uid); var pat = mk(mk(svg, 'defs', {}), 'pattern', { id: pid, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }); mk(pat, 'rect', { width: 5, height: 5, fill: T('surface') }); mk(pat, 'line', { x1: 0, x2: 0, y1: 0, y2: 5, stroke: T('fg-2'), 'stroke-width': 2 }); }
    var bars = [];
    rows.forEach(function (r, ri) {
      var x0 = x(r.x) + off, acc = 0, isP = partial && r.x === partial.x;
      stack.forEach(function (k) {
        var v = r.parts ? num(r.parts[k.key]) || 0 : num(r.v) || 0; if (v <= 0) return;
        var tone = typeof s.toneOf === 'function' ? s.toneOf(r, ri) : k.tone;
        var y1 = y(acc + v), y0 = y(acc); acc += v;
        var hgt = Math.max(1, y0 - y1 - (s.stack ? 2 : 0));
        var rc = mk(g, 'rect', { x: x0, width: bw, y: y1 + (s.stack ? 1 : 0), height: hgt, rx: Math.min(3, bw / 4), fill: isP ? 'url(#' + pid + ')' : T(tone || 'fg-3'), stroke: isP ? T(tone || 'fg-2') : k.outline ? T('edge') : null, 'stroke-width': isP ? 1.5 : k.outline ? 1 : null, 'class': isP ? 'ck-c-partial' : null });
        if (isP) rc.setAttribute(DASH, 'none');
        bars.push(rc);
      });
      if (num(r.ref) && !spk) mk(g, 'line', { x1: x0 - 3, x2: x0 + bw + 3, y1: y(num(r.ref)), y2: y(num(r.ref)), stroke: T('fg'), 'stroke-width': 2, 'stroke-dasharray': '3 2' });
    });
    (s.thresholds || []).forEach(function (t) {
      var v = num(t.value); if (v === null || v <= 0 || v > y.domain()[1]) return;
      mk(g, 'line', { 'class': 'ck-c-threshold', x1: left, x2: W - right, y1: y(v), y2: y(v), stroke: T(t.tone || THR) });
    });
    // "so far": hatched fill, outlined, and labelled with the day count (never colour alone)
    if (partial && !spk) {
      var pr = rows.find(function (r) { return r.x === partial.x; });
      if (pr) {
        var px = x(pr.x) + off + bw, lab = partial.label || ('so far, ' + partial.days + ' of ' + partial.of + ' days');
        var lw = m(lab, TH);
        var sx = Math.min(W - 2, Math.max(lw + 2, px)), sy = Math.max(11, top - 5);
        labels.push({ prio: 9, x: sx, y: sy, text: lab, tone: 'fg-2', cls: 'ck-c-thlabel ck-c-sofar', alts: [A(Math.min(W - 2, sx + bw + 4), sy), A(Math.max(lw + 2, sx - bw - 4), sy)] });
      }
    }
    var barOb = { rects: bars.map(function (rc) { var bx = +rc.getAttribute('x'), by = +rc.getAttribute('y'); return { x0: bx, x1: bx + +rc.getAttribute('width'), y0: by, y1: by + +rc.getAttribute('height') }; }) };
    drawLabels(g, placeInside(c, labels, barOb), T);
    // x labels: every nth, newest always
    if (xtier) {
      var mon0 = null;
      // day2: the day under every other bar (the newest always) when one under every bar would touch, on the narrowest phones
      rows.forEach(function (r, i) {
        var d = P(r.x), cx = x(r.x) + x.bandwidth() / 2, mo = r.x.slice(0, 7), first = mo !== mon0; mon0 = mo;
        if (xtier === 'full') { mk(g, 'text', { x: cx, y: H - 4, 'text-anchor': MID, fill: T('chart-tick') }, fDay(d)); return; }
        if (xtier === 'month') return;
        if (xtier === 'day' || (rows.length - 1 - i) % 2 === 0) mk(g, 'text', { x: cx, y: H - 18, 'text-anchor': MID, fill: T('chart-tick') }, String(d.getUTCDate()));
        if (first) mk(g, 'text', { x: cx - m('28', '') / 2, y: H - 4, 'text-anchor': 'start', fill: T('chart-tick') }, fMon(d));
      });
      if (xtier === 'month') {
        // month names at each month's first bar, thinned to every 2nd, 3rd, 6th or 12th month when they would touch;
        // past 40 weeks the name carries the year
        var long = rows.length > 40, mf = long ? d3.utcFormat("%b '%y") : fMon, starts = [], seen = {};
        rows.forEach(function (r) { var mo = r.x.slice(0, 7); if (!seen[mo]) { seen[mo] = 1; starts.push(r); } });
        var need = d3.max(starts, function (r) { return m(mf(P(r.x)), ''); }) + 8, per = x.step() * 52 / 12;
        var kk = [1, 2, 3, 6, 12].find(function (k) { return k * per >= need; }) || 12;
        starts.forEach(function (r) { var mo = P(r.x).getUTCMonth(); if (mo % kk === 0 || kk === 1) mk(g, 'text', { x: x(r.x) + x.bandwidth() / 2, y: H - 4, 'text-anchor': MID, fill: T('chart-tick') }, mf(P(r.x))); });
      }
    } else if (!spk) {
      var every = Math.ceil(rows.length / Math.max(1, Math.floor((W - left - right) / (s.xGap || 56)))), xf = s.xfmt || function (v) { return fDay(P(v)); };
      rows.forEach(function (r, i) { if ((rows.length - 1 - i) % every === 0) mk(g, 'text', { x: x(r.x) + x.bandwidth() / 2, y: H - 4, 'text-anchor': MID, fill: T('chart-tick') }, r.label || xf(r.x)); });
    }
    // direct labels for parts and the reference tick, at the right gutter, level with their segment
    if ((partLabels.length || gut.length) && !spk) {
      var acc = 0, lr = labI >= 0 ? rows[labI] : null, list = gut.slice();
      if (partLabels.length && lr) stack.forEach(function (k) { var v = num(lr.parts[k.key]) || 0; if (v > 0) { if (direct[k.key]) list.push({ text: k.label, y: y(acc + v / 2) + 4, tone: 'fg-2' }); acc += v; } });
      var refRow = null; for (var q = rows.length - 1; q >= 0; q--) if (num(rows[q].ref)) { refRow = rows[q]; break; }
      if (s.refLabel && refRow) list.push({ text: s.refLabel, y: y(num(refRow.ref)) + 4, tone: 'fg-2' });
      spread(list, top + 4, bottom, 13).forEach(function (l) { var t = mk(svg, 'text', { 'class': l.cls || 'ck-c-serlabel', x: W - right + 6, y: l.y, fill: T(l.tone) }, l.text); if (l.marks) mark(t, l.marks, l.value, l.text); });
    }
    if (keyed.length && !spk) {
      var kp = hel('p', 'ck-chart-key');
      keyed.forEach(function (k) { var it = hel('span'), sw = hel('i', 'ck-chart-sw'); sw.style.background = T(k.tone || 'fg-3'); if (k.outline) sw.style.borderColor = T('edge'); it.append(sw, k.label); kp.append(it); });
      host.insertBefore(kp, c.cap);
    }
    if (s.valueLabel && focusI >= 0 && !spk) { var fr = rows[focusI], ft = tot(fr); if (ft > 0) mk(svg, 'text', { 'class': ENDL, x: x(fr.x) + x.bandwidth() / 2, y: y(ft) - 6, 'text-anchor': MID, fill: T('chart-label') }, s.valueLabel(ft)); }
    // sentence: the newest period (so far, with its day count), the last full period, and the average when given
    var full = rows.filter(function (r) { return !(partial && r.x === partial.x); }), lf = full[full.length - 1];
    var sentence = typeof s.sentence === 'function' ? s.sentence({ rows: rows, tot: tot }) : s.sentence;
    if (!sentence) {
      var per = s.period || 'week', parts = [];
      var pRow = partial ? rows.find(function (r) { return r.x === partial.x; }) : null;
      if (pRow) parts.push('this ' + per + ' ' + uw(tot(pRow), unit, vf) + ' so far (' + partial.days + ' of ' + partial.of + ' days)');
      if (lf) parts.push((pRow ? 'last full ' + per + ' ' : 'latest ' + per + ' ') + uw(tot(lf), unit, vf));
      if (s.avg !== undefined && s.avg !== null) parts.push('average ' + uw(s.avg, unit, vf));
      sentence = (s.title || 'By ' + per) + (s.window ? ', ' + s.window : '') + ': ' + parts.join('; ') + (s.extra ? '; ' + s.extra : '') + '.';
    }
    if (s.interactive !== false && !spk) {
      var items = rows.map(function (r) {
        var t = tot(r), tip = s.tip ? s.tip(r) : { head: r.label || fDay(P(r.x)), lines: [{ text: vf(t) + u + (partial && r.x === partial.x ? ' so far' : '') }] };
        return { x: x(r.x) + x.bandwidth() / 2, bw: bw, y: y(Math.max(t, num(r.ref) || 0)), head: tip.head, lines: tip.lines, row: r, short: tip.head + ': ' + (tip.lines[0] ? tip.lines[0].text : '') };
      });
      interact(c, items, { box: true, click: s.onPick, pick: bandPick(x, rows) });
    }
    var lastRow = lf || rows[rows.length - 1];
    return finish(c, sentence, s.marks ? Object.assign({}, s.marks, { keyVal: s.marks.key ? lastRow.x : undefined }) : null, null, '');
  };

  // =====================================================================================================
  // SHARE: stacked bar on a fixed 0 to 100 axis, ordered ramp, segment labels, thin separators (zone time share)
  // rows: [{label, parts: [{key, label, value, tip}]}]; parts in ramp order
  // =====================================================================================================
  CKC.share = function (host, s) {
    var redraw = function () { return CKC.share(host, s); };
    var rows = (s.rows || []).filter(function (r) { return d3.sum(r.parts, function (p) { return num(p.value) || 0; }) > 0; });
    if (!rows.length) return note(host, s.empty || 'No time recorded in this period.', s);
    var barH = 20, rowH = barH + 34, h = 8 + rows.length * rowH + 18;
    var c = frame(host, Object.assign({}, s, { h: h }), 'share', redraw), svg = c.svg, W = c.W, T = c.T, m = c.m;
    var left = 0, right = 8, x = d3.scaleLinear([0, 100], [left, W - right]);
    var ramp = s.ramp || 'seq', items = [], g = mk(svg, 'g', {});
    var segs = [];
    c.top = 4; c.bottom = h - 18;
    rows.forEach(function (r, ri) {
      var total = d3.sum(r.parts, function (p) { return num(p.value) || 0; }), y0 = 8 + ri * rowH, acc = 0, placed = [];
      mk(g, 'text', { 'class': 'ck-c-rowlabel', x: left, y: y0 + 10, fill: T('fg-2') }, r.label);
      var by = y0 + 16;
      mk(g, 'rect', { x: left, y: by, width: W - right - left, height: barH, rx: 3, fill: T('surface-2'), stroke: T('edge'), 'stroke-width': 1 });
      r.parts.forEach(function (p, pi) {
        var v = num(p.value) || 0, pct = v / total * 100, xa = x(acc), xb = x(acc + pct); acc += pct;
        if (pct > 0) {
          var rc = mk(g, 'rect', { 'class': 'ck-c-seg', x: xa, y: by, width: Math.max(0.5, xb - xa), height: barH, fill: T(p.tone || ramp + '-' + (pi + 1)), stroke: T('surface'), 'stroke-width': 1.5 });
          segs.push(rc);
        }
        var txt = (p.label || p.key) + ' ' + Math.round(pct) + '%', tw = m(txt), cx = (xa + xb) / 2, lx = Math.max(left, Math.min(W - right - tw, cx - tw / 2));
        if (pct > 0 && !placed.some(function (q) { return lx < q[1] + 6 && lx + tw > q[0] - 6; })) { placed.push([lx, lx + tw]); mk(g, 'text', { x: lx, y: by + barH + 13, fill: T('fg-2'), 'class': 'ck-c-seglabel' }, txt); }
        items.push({ ri: ri, xa: xa, xb: xb, x: cx, y: by, head: r.label + ': ' + (p.label || p.key), lines: [{ text: p.tip || Math.round(pct) + '% of the time' }], row: p, short: r.label + ', ' + (p.label || p.key) + ' ' + Math.round(pct) + '%', pct: pct });
      });
    });
    [0, 50, 100].forEach(function (t, i) { mk(g, 'text', { x: x(t), y: h - 4, 'text-anchor': i === 0 ? ST : i === 2 ? 'end' : MID, fill: T('chart-tick') }, t + (i === 2 ? '% of time' : '')); });
    var r0 = rows[0], tot0 = d3.sum(r0.parts, function (p) { return num(p.value) || 0; });
    var sh = r0.parts.map(function (p) { return { p: p, pct: Math.round((num(p.value) || 0) / tot0 * 100) }; });
    var topP = sh.slice().sort(function (a, b) { return b.pct - a.pct; })[0];
    var sentence = s.sentence || ((s.title || 'Time share') + (s.window ? ', ' + s.window : '') + ': most time in ' + (topP.p.name || topP.p.label) + ' at ' + topP.pct + '%; ' +
      sh.filter(function (q) { return q !== topP; }).map(function (q) { return (q.p.label || q.p.key) + ' ' + q.pct + '%'; }).join(', ') + (rows[1] ? '. ' + rows[1].label + ': ' + rows[1].parts.map(function (p) { return (p.label || p.key) + ' ' + Math.round((num(p.value) || 0) / d3.sum(rows[1].parts, function (q) { return num(q.value) || 0; }) * 100) + '%'; }).join(', ') : '') + '.');
    interact(c, items, { pick: function (mx, my) {
      var ri = Math.max(0, Math.min(rows.length - 1, Math.floor((my - 8) / rowH))), best = -1, bd = Infinity;
      items.forEach(function (it, i) { if (it.ri !== ri || !(it.pct > 0)) return; if (mx >= it.xa && mx < it.xb) { best = i; bd = -1; } else if (bd >= 0) { var d = Math.min(Math.abs(mx - it.xa), Math.abs(mx - it.xb)); if (d < bd) { bd = d; best = i; } } });
      return best; } });
    grow(c, segs, 'x');
    return finish(c, sentence, s.marks || null);
  };

  // =====================================================================================================
  // DOT AND WHISKER: a range per period (min to max) with the typical value as a dot, over the personal band
  // rows: [{x, label?, lo, mid, hi}]
  // =====================================================================================================
  CKC.whisker = function (host, s) {
    var redraw = function () { return CKC.whisker(host, s); };
    var rows = (s.rows || []).filter(function (r) { return num(r.mid) !== null; });
    if (!rows.length) return note(host, s.empty || NODATA, s);
    if (s.minPoints && rows.length < s.minPoints) return note(host, s.withheld || ((s.title || 'This chart') + ' is withheld: it needs ' + s.minPoints + ' periods and has ' + rows.length + '.'), s);
    var c = frame(host, s, 'whisker', redraw), svg = c.svg, W = c.W, H = c.H, T = c.T, m = c.m;
    var unit = s.unit || '', fmt = s.fmt || dfmt(1);
    var vals = []; rows.forEach(function (r) { [r.lo, r.mid, r.hi].forEach(function (v) { if (num(v) !== null) vals.push(num(v)); }); });
    if (s.band) vals.push(num(s.band.lo), num(s.band.hi));
    var ext = d3.extent(vals), pad = (ext[1] - ext[0]) * 0.1 || 1, top = unit ? 22 : 8, bottom = H - 20;
    var y = d3.scaleLinear([ext[0] - pad, ext[1] + pad], [bottom, top]).nice(4), ticks = y.ticks(4);
    var left = m.max(ticks.map(fmt)) + 8;
    var last = rows[rows.length - 1], endText = fmt(num(last.mid)) + (unit ? ' ' + unit : ''), right = m(endText, ENDL) + 12;
    var x = d3.scaleBand(rows.map(function (r) { return r.x; }), [left, W - right]).padding(0.4), cx = function (r) { return x(r.x) + x.bandwidth() / 2; };
    c.top = top; c.bottom = bottom;
    var g = mk(svg, 'g', {});
    gridY(g, ticks, y, left, W - right, fmt, T);
    if (unit) mk(g, 'text', { 'class': 'ck-c-unit', x: 0, y: 10, fill: T('fg-3') }, unit);
    if (s.band) { var bl = num(s.band.lo), bh = num(s.band.hi); mk(g, 'rect', { 'class': 'ck-c-band', x: left, width: W - right - left, y: y(bh), height: Math.max(1, y(bl) - y(bh)), fill: T('chart-band'), stroke: T(AXIS), 'stroke-dasharray': '3 3' }); }
    var every = Math.ceil(rows.length / Math.max(1, Math.floor((W - left - right) / 56))), xf = s.xfmt || function (v) { return fDay(P(v)); };
    var wg = mk(svg, 'g', {});
    rows.forEach(function (r, i) {
      var X = cx(r), lo = num(r.lo), hi = num(r.hi);
      if (lo !== null && hi !== null) { mk(wg, 'line', { x1: X, x2: X, y1: y(lo), y2: y(hi), stroke: T(s.tone || S1), 'stroke-width': 2 }); [lo, hi].forEach(function (v) { mk(wg, 'line', { x1: X - 4, x2: X + 4, y1: y(v), y2: y(v), stroke: T(s.tone || S1), 'stroke-width': 2 }); }); }
      mk(wg, 'circle', { cx: X, cy: y(num(r.mid)), r: 4, fill: T(s.tone || S1), stroke: T('surface'), 'stroke-width': 1.5 });
      if ((rows.length - 1 - i) % every === 0) mk(g, 'text', { x: X, y: H - 4, 'text-anchor': MID, fill: T('chart-tick') }, r.label || xf(r.x));
    });
    var wl = [];
    if (s.band && s.band.label) { var wbl = y(num(s.band.lo)) + 12, wbh = y(num(s.band.hi)) - 3; wl.push({ prio: 1, x: W - right - 2, y: wbl, text: s.band.label, tone: 'fg-3', cls: 'ck-c-light', alts: [A(W - right - 2, wbh), A(left + 4, wbl, ST), A(left + 4, wbh, ST), A((left + W - right) / 2, wbl, MID), A((left + W - right) / 2, wbh, MID)] }); }
    if (rows.length > 1) wl.push({ prio: 2, x: cx(rows[0]) + 7, anchor: ST, y: y(num(rows[0].mid)) + 4, text: fmt(num(rows[0].mid)), tone: 'fg-2', cls: 'ck-c-serlabel' });
    var wob = { rects: [], segs: [] };
    rows.forEach(function (r) { var X = cx(r), lo = num(r.lo), hi = num(r.hi); if (lo !== null && hi !== null) wob.rects.push({ x0: X - 5, x1: X + 5, y0: y(hi) - 1, y1: y(lo) + 1 }); wob.rects.push({ x0: X - 5, x1: X + 5, y0: y(num(r.mid)) - 5, y1: y(num(r.mid)) + 5 }); });
    drawLabels(svg, placeInside(c, wl, wob), T);
    var et = mk(svg, 'text', { 'class': ENDL, x: W - right + 6, y: Math.max(top + 4, Math.min(bottom, y(num(last.mid)) + 4)), fill: T('chart-label') }, endText);
    if (s.marks) mark(et, Object.assign({}, s.marks, { keyVal: last.x }), last.mid, endText);
    var lab = function (r) { return r.label || xf(r.x); }, per = function (r) { return r.label || 'the ' + (s.period || 'week') + ' of ' + xf(r.x); };
    var sentence = s.sentence || ((s.title || 'Range by period') + (s.window ? ', ' + s.window : '') + ': typical ' + endText + ' in ' + per(last) + (num(last.lo) !== null ? ' (range ' + fmt(num(last.lo)) + ' to ' + fmt(num(last.hi)) + ')' : '') +
      (rows.length > 1 ? trendWords(fmt, num(rows[0].mid), num(last.mid), rows[0].x).replace(/ since .*/, ' since ' + per(rows[0])) : '') + (s.band ? bandWords(num(last.mid), num(s.band.lo), num(s.band.hi), fmt, unit) : '') + '.');
    var items = rows.map(function (r) { return { x: cx(r), y: y(num(r.mid)), head: lab(r), lines: [{ text: 'Typical ' + fmt(num(r.mid)) + (unit ? ' ' + unit : '') }, num(r.lo) !== null ? { text: 'Range ' + fmt(num(r.lo)) + ' to ' + fmt(num(r.hi)) } : null], row: r, short: lab(r) + ': ' + fmt(num(r.mid)) + (unit ? ' ' + unit : '') }; });
    interact(c, items, { rule: true, pick: bandPick(x, rows) });
    return finish(c, sentence, s.marks ? Object.assign({}, s.marks, { keyVal: last.x }) : null, last.mid, endText);
  };

  // =====================================================================================================
  // RANGE BAR: the Phase 3 ck-rb component (track = average +/- span SD, band = usual range, tick = average, dot = latest)
  // =====================================================================================================
  CKC.rangeBar = function (el, s) {
    var t0 = performance.now(), fmt = s.fmt || function (v) { return String(v); }, u = s.unit ? ' ' + s.unit : '';
    var v = num(s.value), mean = num(s.mean), sd = num(s.sd), n = num(s.n);
    el.className = 'ck ck-rb'; el.setAttribute('role', 'img'); el.replaceChildren();
    var bLo = num(s.lo), bHi = num(s.hi); // the usual range comes from the spec, like every other band
    var empty = mean === null || bLo === null || bHi === null || (s.minN && (n === null || n < s.minN));
    var track = hel('span', 'ck-rb-track'), scale = hel('span', 'ck-rb-scale'); el.append(track, scale);
    if (empty) {
      el.classList.add('is-empty'); scale.append(hel('span', null, 'No band yet'), hel('span', null, s.minN ? 'needs ' + s.minN + ' ' + (s.per || 'nights') : 'no average yet'));
      var se = (s.label || 'Value') + ': ' + (v === null ? 'no reading' : fmt(v) + u) + '; no usual range yet' + (s.minN ? ', it needs ' + s.minN + ' ' + (s.per || 'nights') + (n !== null ? ' and has ' + n : '') : '') + '.';
      el.setAttribute('aria-label', se); return { sentence: se };
    }
    // track: the average plus or minus span SD when sd is given, else the band widened by half its width each side
    var span = s.span || 1, half = sd !== null ? span * sd : (bHi - bLo), lo = Math.min(bLo, mean - half), hi = Math.max(bHi, mean + half), pct = function (x) { return Math.max(0, Math.min(100, (x - lo) / (hi - lo) * 100)); };
    var band = hel('span', 'ck-rb-band'); band.style.left = pct(bLo) + '%'; band.style.width = (pct(bHi) - pct(bLo)) + '%';
    var mid = hel('span', 'ck-rb-mid'); mid.style.left = pct(mean) + '%';
    var tg = hel('span', 'ck-rb-target'); tg.hidden = true;
    if (num(s.target) !== null) { tg.hidden = false; tg.style.left = pct(num(s.target)) + '%'; }
    track.append(band, mid, tg);
    if (v !== null) { var dot = hel('span', 'ck-rb-dot'); dot.style.left = pct(v) + '%'; track.append(dot); }
    var ef = edgeFmt(v, bLo, bHi, fmt, s.position), l1 = hel('span', 'ck-rb-lo', ef(bLo)), l2 = hel('span', 'ck-rb-hi', ef(bHi)); l1.style.left = pct(bLo) + '%'; l2.style.left = pct(bHi) + '%';
    l1.setAttribute('data-derived', 'band-lo'); l2.setAttribute('data-derived', 'band-hi'); scale.append(l1, l2);
    var sentence = s.sentence || ((s.label || 'Value') + (s.when ? ' ' + s.when : '') + ': ' + (v === null ? 'no reading' : fmt(v) + u) + (v !== null ? bandWords(v, bLo, bHi, fmt, s.unit || '', s.position) : '') + ' (average ' + fmt(mean) + (n !== null ? ', ' + n + ' ' + (s.per || 'nights') : '') + ').');
    el.setAttribute('aria-label', sentence); el.setAttribute('data-derived', 'rb');
    if (s.marks) { if (s.marks.source) el.setAttribute('data-source', s.marks.source); if (s.marks.where) el.setAttribute('data-where', s.marks.where); }
    if (s.key && !drawn['rb:' + s.key]) { drawn['rb:' + s.key] = true; if (!CKC.still()) { el.classList.add('ck-first-draw'); setTimeout(function () { el.classList.remove('ck-first-draw'); }, 450); } }
    var st = CKC.stats.rangeBar || (CKC.stats.rangeBar = { n: 0, last: 0, max: 0 }); st.n++; st.last = Math.round((performance.now() - t0) * 100) / 100; st.max = Math.max(st.max, st.last);
    return { sentence: sentence };
  };

  // =====================================================================================================
  // CUSTOM: the shared frame (measured width, resize, sentence, role=img, marks, tones) around a drawing that is not
  // one of the types above (season timeline, year strip). draw(ctx) gets {svg, W, H, T, m, mk}.
  // =====================================================================================================
  CKC.custom = function (host, s) {
    var redraw = function () { return CKC.custom(host, s); };
    var c = frame(host, s, 'custom', redraw);
    var out = s.draw({ svg: c.svg, W: c.W, H: c.H, T: c.T, m: c.m, mk: mk }) || {};
    if (out.H && out.H !== c.H) { c.svg.setAttribute('viewBox', '0 0 ' + c.W + ' ' + out.H); c.svg.setAttribute('height', out.H); }
    var sentence = out.sentence || (typeof s.sentence === 'function' ? s.sentence() : s.sentence) || '';
    if (s.caption === false) c.cap.hidden = true;
    return finish(c, sentence, s.marks || null);
  };
  // A CSS meter (progress fill) or a grid of cells: no drawing, but role=img, a sentence and marks
  CKC.meter = function (el, s) {
    var f = Math.max(0, Math.min(1, num(s.frac) || 0)), fill = el.querySelector(s.fill || 'i');
    if (fill) fill.style.width = Math.round(f * 100) + '%';
    if (s.tone && fill) fill.style.background = CKC.tone(el, s.tone);
    if (s.decorative) { el.setAttribute('aria-hidden', 'true'); return { sentence: '' }; }
    CKC.describe(el, s.sentence, s.marks); return { sentence: s.sentence };
  };
  CKC.describe = function (el, sentence, marks) {
    if (!el) return; el.setAttribute('role', 'img'); el.setAttribute('aria-label', sentence || ''); el.removeAttribute('aria-hidden');
    if (marks) { if (marks.source) el.setAttribute('data-source', marks.source); if (marks.where) el.setAttribute('data-where', marks.where); el.setAttribute('data-derived', marks.derived || 'meter'); }
  };
  // Text colour that reads on a filled token (for labels inside marks): the page text or the surface, whichever contrasts more
  CKC.inkOn = function (host, fillTone) {
    var T = toner(host), f = lum(T(fillTone)), a = lum(T('fg')), b = lum(T('surface'));
    if (f === null || a === null || b === null) return T('fg');
    var r = function (p, q) { return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
    return r(f, a) >= r(f, b) ? T('fg') : T('surface');
  };
  CKC.version = '4.0.0';
})();
