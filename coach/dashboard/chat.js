// chat.js: Talk to the coach, the round button at the bottom right of every tab (#cx-chat; alpha float_chat, 6.119.0).
// the athlete, Nov 16, 2026 (Release Board note, epic talk_anywhere): "add a floating text button in the bottom right to open a
// floating chat"; he picked "A. Ask now in comment box" on the rendered options. The dashboard's page type lets a page open
// Claude's own comment box (comments, composer only) but not send to Claude or ask Claude itself, so a tap opens that box
// at the button; the athlete types and taps Send to Claude; a coach chat watching the dashboard answers in the same thread
// (coach/ops/DASHBOARD-CHAT.md). Nothing is written by the page.
// 6.119.2: a sticky dock at the end of #cx holds it (fixed scrolled with the page on iPhone).
(() => {
  const CX = window.CX;
  const alpha = (id) => !!(CX.app && CX.app.kind('alpha').some((b) => b.id === id));
  let btn = null, tip = null, cm, tipT = 0;
  const say = (t) => { tip.textContent = t; tip.hidden = false; clearTimeout(tipT); tipT = setTimeout(() => { tip.hidden = true; }, 6000); };
  async function open(at) {
    if (cm === undefined) { try { cm = window.claude && window.claude.use ? await window.claude.use('comments') : null; } catch (e) { cm = null; } }
    let ok = false;
    if (cm && cm.openComposer) { try { ok = !!(await cm.openComposer({ element: at && at.nodeType === 1 ? at : btn })).opened; } catch (e) { ok = false; } }
    if (!ok) say('Tap the comment tool at the top, then Send to Claude. The coach answers there.');
  }
  function mount() {
    if (btn || !alpha('float_chat')) return;
    const root = document.getElementById('cx'); if (!root) return;
    btn = document.createElement('button'); btn.type = 'button'; btn.id = 'cx-chat'; btn.className = 'cx-chat';
    btn.setAttribute('aria-label', 'Talk to the coach'); btn.title = 'Talk to the coach';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12z"/></svg>';
    tip = document.createElement('p'); tip.className = 'cx-chat-tip'; tip.setAttribute('role', 'status'); tip.hidden = true;
    btn.addEventListener('click', () => open(btn));
    CX.chatOpen = (at) => open(at); // Make your own on the Lifts tab opens the same box (6.131.0)
    const dock = document.createElement('div'); dock.className = 'cx-chat-dock';
    dock.append(tip, btn); root.append(dock);
  }
  dash.onData(mount);
})();
