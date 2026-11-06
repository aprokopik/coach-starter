/* cockpit.js: Cockpit design system behaviours (window.CK). BUILT FILE: a copy of src/cockpit/components.js (sh src/build-cockpit.sh). */
/* Phase 5 page copy (Nov 4, 2026) of the Phase 3 components.js, byte-identical except for one marked edit (search "Phase 5 edit"):
   CK.onModeChange, which tells the page when the live host flips its own light or dark toggle ([data-mode] on an ancestor),
   so scripts that read colours (charts.js, app.js) redraw. The built page file is ../../cockpit.js (a plain copy). */
/* Cockpit design system: reference behaviour for the components (Phase 3, Nov 4, 2026).
   Plain script, no modules, no network. Phase 5 folds these few functions into the page's own scripts (app.js);
   they are here so the catalogue works and the behaviour is written down once. Exposes window.CK. */
(function () {
  'use strict';
  var CK = window.CK = window.CK || {};

  // Scroll behaviour: every scripted scroll goes through this, so Reduce Motion stops smooth scrolling (Phase 0 item 17).
  CK.scrollBehavior = function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; }
  };

  // One-time fills: add .ck-first-draw on the first draw of a given key only; removed after 450 ms (motion.css).
  var drawn = {};
  CK.firstDraw = function (el, key) {
    if (!el || drawn[key]) return;
    drawn[key] = true; el.classList.add('ck-first-draw');
    setTimeout(function () { el.classList.remove('ck-first-draw'); }, 450);
  };

  // Tab strip: role=tablist; Left/Right move, Home/End jump, selection follows focus; render in place (no page jump).
  CK.tabs = function (list) {
    var tabs = Array.prototype.slice.call(list.querySelectorAll('[role=tab]'));
    function select(t, focus) {
      tabs.forEach(function (x) {
        var on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1;
        var p = document.getElementById(x.getAttribute('aria-controls')); if (p) p.hidden = !on;
      });
      if (focus) t.focus({ preventScroll: true });
      t.scrollIntoView({ behavior: CK.scrollBehavior(), block: 'nearest', inline: 'nearest' });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t, false); });
      t.addEventListener('keydown', function (e) {
        var k = e.key, n = tabs.length, j = null;
        if (k === 'ArrowRight') j = (i + 1) % n; else if (k === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (k === 'Home') j = 0; else if (k === 'End') j = n - 1;
        if (j !== null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  };

  // Disclosure: a button with aria-expanded and aria-controls; the chevron turns by CSS.
  CK.disclosure = function (btn) {
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      var p = document.getElementById(btn.getAttribute('aria-controls')); if (p) p.hidden = !open;
    });
  };

  // Segmented control (native radios): show the panel for the checked option. Arrow keys come free with radios.
  CK.segmented = function (fs) {
    function sync() {
      Array.prototype.forEach.call(fs.querySelectorAll('input[type=radio]'), function (r) {
        var p = r.getAttribute('aria-controls') && document.getElementById(r.getAttribute('aria-controls')); if (p) p.hidden = !r.checked;
      });
    }
    fs.addEventListener('change', sync); sync();
  };

  // Slider: the visible value follows the input (output element), and aria-valuetext says it in words when given.
  CK.slider = function (input) {
    var out = document.querySelector('output[for="' + input.id + '"]');
    var words = (input.getAttribute('data-words') || '').split('|');
    function sync() { var v = input.value; if (out) out.textContent = v; var w = words[Number(v) - Number(input.min || 0)]; if (w) input.setAttribute('aria-valuetext', v + ', ' + w); }
    input.addEventListener('input', sync); sync();
  };

  // Set ticks (Lifts): done / skip are toggle buttons (aria-pressed); one per set may be pressed. Updates the Finish bar count.
  CK.ticks = function (root, onChange) {
    root.addEventListener('click', function (e) {
      var b = e.target.closest('.ck-tick'); if (!b || !root.contains(b)) return;
      var on = b.getAttribute('aria-pressed') !== 'true';
      Array.prototype.forEach.call(b.parentNode.querySelectorAll('.ck-tick'), function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', String(on)); if (onChange) onChange();
    });
  };

  // Phase 5 edit: host theme toggle. The live host marks dark or light with [data-mode] on an ancestor of the page
  // (.cds-root); the phone setting is a media query that charts.js already follows. fn runs once per change of either.
  CK.onModeChange = function (fn) {
    var last = null;
    function now() { var r = document.querySelector('.ck'), e = r && r.closest ? r.closest('[data-mode]') : null; return e ? e.getAttribute('data-mode') : ''; }
    last = now();
    try {
      new MutationObserver(function () { var m = now(); if (m !== last) { last = m; fn(m); } })
        .observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['data-mode'] });
    } catch (e) { /* no MutationObserver: the host's own redraw covers it */ }
  };

  // Wire everything inside a root by data-ck attributes (idempotent).
  CK.init = function (root) {
    root = root || document;
    Array.prototype.forEach.call(root.querySelectorAll('[role=tablist][data-ck=tabs]:not([data-ck-on])'), function (x) { x.setAttribute('data-ck-on', ''); CK.tabs(x); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ck=disc]:not([data-ck-on])'), function (x) { x.setAttribute('data-ck-on', ''); CK.disclosure(x); });
    Array.prototype.forEach.call(root.querySelectorAll('[data-ck=seg]:not([data-ck-on])'), function (x) { x.setAttribute('data-ck-on', ''); CK.segmented(x); });
    Array.prototype.forEach.call(root.querySelectorAll('input[type=range][data-ck=slider]:not([data-ck-on])'), function (x) { x.setAttribute('data-ck-on', ''); CK.slider(x); });
  };
})();
