// Money canvas — every change, shown as a short live presentation. After you ask for a change (in words, with the
// card menu, by editing, or with Undo) the canvas keeps the WHOLE canvas in view (it glides out to fit, never zooms in
// on one thing); whatever moved because of the change slides from where it was to where it is now; then each change
// is spotlit in turn — the rest dims a little, a caption says what changed ("Salary: EGP 30,000 → EGP 36,000",
// "New box: Subscriptions", "Removed: Phone" over the place it used to be) — step by step, like a presenter
// walking through it. A small player shows "Change 2 of 5" with pause, next and skip; Esc ends it. At the end
// everything that changed keeps a soft glow for a moment. Reduced motion: no sliding, the steps still play.

const FPR = { steps: [], i: -1, timer: 0, paused: false, raf: 0, until: 0 };
const FPR_STEP = 1300, FPR_MAX = 14;

// what the canvas showed: every card and branch (label, value, line), your boxes, and where everything stood
function finChangeIndex() {
  const m = finCvIndex();
  if (typeof finCanvasP === 'function') for (const b of finCanvasP().boxes) m.set('box:' + b.id, [b.title || '', '', JSON.stringify(b.show || {}) + (b.note || '') + (b.branch || ''), ''].join('|'));
  if (typeof finMonthRoom === 'function') m.set('month', ['', '', finMonthRoom().sum, ''].join('|'));   // the rest of this month moves with every change
  m.pos = new Map(UI.fin.cvPos || []); m.mode = UI.fin.cv.mode;
  return m;
}
// ask for the presentation of what changed since "before" (it plays after the next drawing of the canvas)
function finPresent(before, ids) {
  if (!before || UI.view !== 'finance') return;
  UI.fin.present = { before, ids: [...(ids || [])] };
  UI.fin.goto = null; UI.fin.cv.fitted = false; UI.fin.cv.user = false;   // the whole canvas, not one part of it
}
function finPresentEnd(keepGlow) {
  clearTimeout(FPR.timer); cancelAnimationFrame(FPR.raf); FPR.raf = 0;
  const ids = FPR.steps.filter(s => !s.gone).map(s => s.id);
  FPR.steps = []; FPR.i = -1; FPR.paused = false;
  for (const el of document.querySelectorAll('.fin-spot')) el.classList.remove('fin-spot');
  const vp = $('#fin-cv-vp'); if (vp) vp.classList.remove('presenting');
  const o = document.getElementById('fin-show'); if (o) o.remove();
  if (keepGlow && ids.length) { UI.fin.flash = { ids: new Set(ids), until: Date.now() + 4000 }; for (const id of ids) { const el = finPresentEl(id); if (el) el.classList.add('fresh'); } clearTimeout(UI.fin.flashT); UI.fin.flashT = setTimeout(() => document.querySelectorAll('.fin-cvn.fresh, .fin-room.fresh').forEach(n => n.classList.remove('fresh')), 4000); }
}
const finPresentEl = id => document.querySelector(`#fin-cv-world .fin-leaf[data-node="${CSS.escape(id)}"], #fin-cv-world .fin-room[data-room="${CSS.escape(id)}"]`);

// the spotlight: the card or room of the step (and a box's own content)
function finPresentSpot(s) { if (!s || !s.id || s.gone) return; const el = finPresentEl(s.id); if (el) el.classList.add('fin-spot'); const d = document.querySelector(`#fin-cv-world .fin-det[data-det="${CSS.escape(s.id)}"]`); if (d) d.classList.add('fin-spot'); }
// the steps: what changed, in reading order across the canvas
function finPresentSteps(before, extra) {
  const after = finChangeIndex(), split = s => String(s || '').split('|'), steps = [], seen = new Set();
  const label = (id, parts) => parts[0] || id;
  const add = s => { if (seen.has(s.id) || steps.length >= 60) return; seen.add(s.id); steps.push(s); };
  for (const [id, v] of after) {
    if (id === 'root') continue;
    const was = before.get(id); if (was === v) continue;
    if (!finPresentEl(id)) continue;   // not drawn in this layout
    const a = split(v), b = was === undefined ? null : split(was), box = id.startsWith('box:');
    let text;
    if (!b) text = box ? `New box: ${a[0]}` : `New: ${label(id, a)}${a[1] ? ' · ' + a[1] : ''}`;
    else if (a[0] !== b[0] && a[1] === b[1]) text = `Renamed: ${b[0]} → ${a[0]}`;
    else if (a[1] !== b[1] && a[1] && b[1]) text = `${label(id, a)}: ${b[1]} → ${a[1]}`;
    else if (box) text = `Changed box: ${a[0]}`;
    else text = `${label(id, a)}: ${a[1] || a[3] || a[2] || 'updated'}`;
    add({ id, text, kind: b ? 'changed' : 'new' });
  }
  for (const id of extra || []) if (!seen.has(id) && finPresentEl(id)) { const a = split(after.get(id)); add({ id, text: `${a[0] || id}: ${a[1] || 'updated'}`, kind: 'changed' }); }
  // removed: shown over the place it used to be
  for (const [id, v] of before) if (!after.has(id) && id !== 'root' && before.pos && before.pos.get(id) && before.mode === UI.fin.cv.mode) { const b = split(v); add({ id, text: `Removed: ${b[0] || id}`, kind: 'gone', gone: before.pos.get(id) }); }
  // reading order: rows from the top, left to right within a row
  const P = UI.fin.cvPos || new Map(), at = s => s.gone || P.get(s.id) || { x: 0, y: 0 };
  steps.sort((p, q) => Math.round(at(p).y / 260) - Math.round(at(q).y / 260) || at(p).x - at(q).x);
  // a change that is only a room's total moving with the cards inside it is left out when its cards are shown
  return steps.length > FPR_MAX ? steps.slice(0, FPR_MAX).concat([{ id: '', text: `and ${steps.length - FPR_MAX} more — all glowing`, kind: 'more' }]) : steps;
}

// where a step is on the screen now (the canvas may be moving)
function finPresentRect(s) {
  if (!s || !s.id) return null;
  if (s.gone) { const vp = $('#fin-cv-vp'); if (!vp) return null; const r = vp.getBoundingClientRect(), cv = UI.fin.cv; return { left: r.left + cv.x + s.gone.x * cv.k, top: r.top + cv.y + s.gone.y * cv.k, width: s.gone.w * cv.k, height: s.gone.h * cv.k }; }
  const el = finPresentEl(s.id); return el ? el.getBoundingClientRect() : null;
}
function finPresentHUD() {
  let o = document.getElementById('fin-show');
  if (!o) { o = document.createElement('div'); o.id = 'fin-show'; o.innerHTML = '<div class="fin-show-ring"></div><div class="fin-show-cap"></div><div class="fin-show-bar"></div>'; document.body.appendChild(o); }
  const s = FPR.steps[FPR.i], n = FPR.steps.filter(x => x.kind !== 'more').length;
  o.querySelector('.fin-show-bar').innerHTML = `<span class="fin-show-n">✨ Change ${Math.min(FPR.i + 1, n)} of ${n}</span><span class="fin-show-dots">${FPR.steps.map((x, j) => `<i class="${j < FPR.i ? 'done' : j === FPR.i ? 'on' : ''}"></i>`).join('')}</span>
    <button class="btn sm ghost" data-act="fin-show" data-v="${FPR.paused ? 'play' : 'pause'}" aria-label="${FPR.paused ? 'Play' : 'Pause'}">${FPR.paused ? '▶' : '⏸'}</button><button class="btn sm ghost" data-act="fin-show" data-v="next" aria-label="Next change">⏭</button><button class="btn sm ghost" data-act="fin-show" data-v="end" aria-label="Skip the presentation">✕</button>`;
  const cap = o.querySelector('.fin-show-cap'); cap.textContent = s ? s.text : ''; cap.className = 'fin-show-cap ' + (s ? s.kind : '');
  o.querySelector('.fin-show-ring').className = 'fin-show-ring ' + (s ? s.kind : '') + (s && s.gone ? ' ghost' : '');
  if (s && s.gone) o.querySelector('.fin-show-ring').textContent = s.text.replace(/^Removed: /, ''); else o.querySelector('.fin-show-ring').textContent = '';
  finPresentPlace();
}
// the ring around the step, the caption beside it, the player at the top of the canvas — kept in place every frame
function finPresentPlace() {
  const o = document.getElementById('fin-show'), vp = $('#fin-cv-vp'); if (!o || !vp) return;
  // only the part of the canvas you can see: not under the sticky bar at the top, not below the window
  const R = vp.getBoundingClientRect(), rail = document.querySelector('.rail'), railB = rail && getComputedStyle(rail).position === 'sticky' ? rail.getBoundingClientRect().bottom : 0;
  const V = { left: R.left, right: R.right, top: Math.max(R.top, railB, 0), bottom: Math.min(R.bottom, innerHeight) }; V.width = V.right - V.left;
  const s = FPR.steps[FPR.i], r = finPresentRect(s), ring = o.querySelector('.fin-show-ring'), cap = o.querySelector('.fin-show-cap'), bar = o.querySelector('.fin-show-bar');
  bar.style.left = Math.round(V.left + V.width / 2 - bar.offsetWidth / 2) + 'px'; bar.style.top = Math.round(V.bottom - bar.offsetHeight - 12) + 'px';
  if (!r) { ring.style.opacity = 0; cap.style.opacity = s && s.kind === 'more' ? 1 : 0; if (s && s.kind === 'more') { cap.style.left = Math.round(V.left + V.width / 2 - cap.offsetWidth / 2) + 'px'; cap.style.top = Math.round(V.top + 16) + 'px'; } return; }
  const pad = 6; ring.style.opacity = 1;
  Object.assign(ring.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + 2 * pad + 'px', height: r.height + 2 * pad + 'px' });
  cap.style.opacity = 1; const cw = cap.offsetWidth, ch = cap.offsetHeight;
  let cx = r.left + r.width / 2 - cw / 2, cy = r.top - ch - 14; if (cy < V.top + 8) cy = r.top + r.height + 14;
  cx = Math.max(V.left + 8, Math.min(V.right - cw - 8, cx)); cy = Math.max(V.top + 8, Math.min(V.bottom - ch - 64, cy));
  cap.style.left = Math.round(cx) + 'px'; cap.style.top = Math.round(cy) + 'px';
}
function finPresentLoop() { cancelAnimationFrame(FPR.raf); const tick = () => { if (!FPR.steps.length) return; finPresentPlace(); FPR.raf = requestAnimationFrame(tick); }; FPR.raf = requestAnimationFrame(tick); }
function finPresentGo(i) {
  clearTimeout(FPR.timer);
  for (const el of document.querySelectorAll('.fin-spot')) el.classList.remove('fin-spot');
  if (i >= FPR.steps.length) return finPresentEnd(true);
  FPR.i = i; const s = FPR.steps[i]; finPresentSpot(s);
  finPresentHUD();
  if (!FPR.paused) FPR.timer = setTimeout(() => finPresentGo(FPR.i + 1), s.kind === 'more' ? 1600 : FPR_STEP);
}
function finPresentStart(P) {
  finPresentEnd(false);
  const steps = finPresentSteps(P.before, P.ids); if (!steps.length) return;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } })();
  // the whole canvas in view, gliding there
  if (typeof finCvGlide === 'function') finCvGlide(); finCvFit(true);
  // what moved because of the change slides from where it was
  if (!reduce && P.before.pos && P.before.mode === UI.fin.cv.mode) {
    const moved = [];
    for (const el of document.querySelectorAll('#fin-cv-world .fin-leaf[data-node], #fin-cv-world .fin-room[data-room]')) {
      const id = el.dataset.node || el.dataset.room, b = P.before.pos.get(id), x = parseFloat(el.style.left) || 0, y = parseFloat(el.style.top) || 0;
      if (b && (Math.abs(b.x - x) > 1 || Math.abs(b.y - y) > 1)) { el.style.transition = 'none'; el.style.transform = `translate(${b.x - x}px, ${b.y - y}px)`; moved.push(el); }
    }
    if (moved.length) { void document.body.offsetWidth; requestAnimationFrame(() => { for (const el of moved) { el.style.transition = 'transform .8s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; } setTimeout(() => moved.forEach(el => { el.style.transition = ''; }), 900); }); }
  }
  FPR.steps = steps; const vp = $('#fin-cv-vp'); if (vp) vp.classList.add('presenting');
  finPresentLoop(); FPR.i = -1; FPR.timer = setTimeout(() => finPresentGo(0), reduce ? 150 : 850);
}
// after every drawing: start a presentation that was asked for; keep the spotlight on its step (a redraw replaces the cards)
HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance' || !$('#fin-cv-world')) { if (FPR.steps.length) finPresentEnd(false); return; }
  if (UI.fin.present) { const P = UI.fin.present; UI.fin.present = null; setTimeout(() => finPresentStart(P), 0); return; }
  if (FPR.steps.length) { const vp = $('#fin-cv-vp'); if (vp) vp.classList.add('presenting'); finPresentSpot(FPR.steps[FPR.i]); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && FPR.steps.length) finPresentEnd(true); }, true);
Object.assign(ACT, { 'fin-show': el => { const v = el.dataset.v; if (v === 'end') return finPresentEnd(true); if (v === 'next') return finPresentGo(FPR.i + 1); FPR.paused = v === 'pause'; if (FPR.paused) { clearTimeout(FPR.timer); finPresentHUD(); } else finPresentGo(FPR.i + 1); } });
Object.assign(window.__FIN, { presentEnd: () => finPresentEnd(true), presentation: () => ({ on: FPR.steps.length > 0, i: FPR.i, steps: FPR.steps.map(s => ({ id: s.id, text: s.text, kind: s.kind })) }) });
