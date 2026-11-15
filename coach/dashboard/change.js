// change.js: "Today changed?" on Today's plan card (6.64.0; roadmap priority 3, Closed loops; the athlete's pick on the
// Sprint Review page, option 4 of five, Nov 15, 2026: "Plan B now, and a reason tap replans the week").
// A closed disclosure under the size control (#t-chg-btn, #t-chg). Inside: one reason (Gym closed, Traveling, Less time, Swap
// order, Something else), an optional line for the coach, and "Do the Min size today", the Plan B for today there and then (it
// picks the Min size in the size control above; the Min size counts as done). Send saves one store document a day,
// day_change/<today> {date, reason, note, use_min, saved_at}; Undo saves the same document with cleared true.
// The coach's side (coach/tools/day_change.py; RUNBOOK "Today changed"): the next daytime refresh, or the morning run, copies the
// document into coach/day_changes.csv, replans the rest of the week by RUNBOOK "Day-of answers" step 3 and closes it with a note.
// The line under the disclosure (#t-chg-st) then reads "Replanned 11:41 AM: <note>" from the coach row kind day_change; until
// then it reads "Traveling, sent 10:12 AM. The rest of the week is replanned by 11:41 AM" (fresh.js CX.nextUpdate).
// No store, no disclosure: the coach chat is the way to say it then.
(() => {
  const CX = window.CX;
  const A = () => CX.app;
  const $ = (id) => document.getElementById(id);
  // the same five reasons, in the same order, as coach/tools/day_change.py REASONS (test_day_change checks they match)
  const REASONS = [['gym_closed', 'Gym closed'], ['travel', 'Traveling'], ['less_time', 'Less time'], ['swap_order', 'Swap order'], ['other', 'Something else']];
  const word = (k) => (REASONS.find(([v]) => v === k) || [k, 'Something else'])[1];
  const clock = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
  let db = null, built = false, saved = null, pick = '', minApplied = false;

  function minRadio() { return document.querySelector('#t-bounds input[value=fallback]'); }
  function useMin() {
    const r = minRadio(); if (!r || r.disabled || r.checked) return;
    r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); // app.js listens and redraws the size line
  }
  function paintChips() {
    const box = $('t-chg-r'); box.replaceChildren();
    for (const [k, w] of REASONS) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qc-chip' + (pick === k ? ' sel' : ''); b.textContent = w;
      b.setAttribute('aria-pressed', String(pick === k));
      b.addEventListener('click', () => { pick = pick === k ? '' : k; paintChips(); $('t-chg-save').disabled = !pick; const f = $('t-chg-r').children[REASONS.findIndex(([v]) => v === k)]; if (f) f.focus(); });
      box.append(b);
    }
  }
  // the line under the disclosure: the coach's replan when it is newer than the tap, else the tap and when the replan lands
  function paintStatus() {
    const { TODAY, rowsOk } = A(), st = $('t-chg-st'), w = $('t-chg-w');
    const row = (rowsOk('coach') || []).find((r) => r.kind === 'day_change' && r.date === TODAY) || null;
    st.replaceChildren(); ['data-source', 'data-field', 'data-where', 'data-derived'].forEach((a) => st.removeAttribute(a));
    const live = saved && !saved.cleared ? saved : null;
    const coachNewer = row && row.status === 'done' && (!live || String(row.saved_at || '') >= String(live.saved_at || ''));
    if (coachNewer) {
      st.append(`Replanned ${clock(row.done_at)}: `, row.done_note || 'the rest of the week is updated.');
      st.setAttribute('data-source', 'coach'); st.setAttribute('data-field', 'done_note'); st.setAttribute('data-where', 'kind=day_change&date=' + TODAY);
      w.textContent = 'Today changed: ' + (row.reason_text || word(row.reason));
    } else if (live) {
      const next = CX.nextUpdate ? CX.nextUpdate() : 'the next update';
      st.append(`${word(live.reason)}, sent ${clock(live.saved_at)}. The rest of the week is replanned by ${next}.`);
      st.setAttribute('data-derived', 'day-change-pending'); st.setAttribute('data-rule', 'change.js: your day_change tap; the time is fresh.js nextRun, the next scheduled refresh');
      w.textContent = 'Today changed: ' + word(live.reason);
    } else w.textContent = 'Today changed?';
    st.hidden = !st.childNodes.length;
    $('t-chg-undo').hidden = !live;
  }
  function paintMin() {
    const r = minRadio(), on = r && !r.disabled, l = $('t-chg-minl');
    l.hidden = !on; $('t-chg-minv').textContent = on ? ($('t-bm-fallback').textContent || '').trim() : '';
  }

  async function send(cleared) {
    const { TODAY } = A(), s = $('t-chg-save'), st = $('t-chg-st');
    const doc = cleared
      ? { date: TODAY, reason: saved ? saved.reason : 'other', note: '', use_min: false, cleared: true, saved_at: new Date().toISOString() }
      : { date: TODAY, reason: pick, note: $('t-chg-note').value.trim().slice(0, 200), use_min: !$('t-chg-minl').hidden && $('t-chg-min').checked, saved_at: new Date().toISOString() };
    s.disabled = true;
    try {
      await db.doc('day_change/' + TODAY).set(doc);
      saved = doc;
      if (!cleared && doc.use_min) useMin();
      const btn = $('t-chg-btn'); btn.setAttribute('aria-expanded', 'false'); $('t-chg').hidden = true;
      if (cleared) { pick = ''; $('t-chg-note').value = ''; paintChips(); }
      paintStatus(); btn.focus();
    } catch (e) {
      st.hidden = false; st.textContent = 'Not saved. Try again, or tell the coach in chat.';
    }
    s.disabled = !pick;
  }

  CX.renderChange = async function () {
    if (!$('t-chg-btn') || !A()) return;
    if (!built) {
      built = true;
      try { db = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('db') : null; } catch (e) { db = null; }
      if (!db) return; // nowhere to save: say it in chat
      try { const d = await db.doc('day_change/' + A().TODAY).get(); saved = d.exists ? d.data() : null; } catch (e) { saved = null; }
      if (saved && !saved.cleared) { pick = REASONS.some(([v]) => v === saved.reason) ? saved.reason : ''; $('t-chg-note').value = saved.note || ''; $('t-chg-min').checked = !!saved.use_min; }
      else $('t-chg-min').checked = true; // Plan B is the usual answer to a changed day; untick to keep the size
      paintChips();
      $('t-chg-save').disabled = !pick;
      $('t-chg-save').addEventListener('click', () => send(false));
      $('t-chg-undo').addEventListener('click', () => send(true));
      $('t-chg-note').addEventListener('keydown', (e) => { if (e.key === 'Enter' && pick) { e.preventDefault(); send(false); } });
      $('t-chg-btn').hidden = false;
    }
    if (!db) return;
    paintMin(); paintStatus();
    // a saved Plan B keeps the Min size picked for the day, once per page load, after the coach's own pick is drawn
    if (!minApplied && saved && !saved.cleared && saved.use_min) { minApplied = true; useMin(); }
  };
})();
