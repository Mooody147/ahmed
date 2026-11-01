// Money canvas — every window on the canvas moves where you want it. Drag a card's pop-out, the add / edit form
// ("New purchase goal", …) or the Balances window by its title: it stays where you put it while it is open (the canvas
// can move under it); a moved pop-out no longer points at its card. Tell the canvas's window moves the same way.

const FWIN = { drag: null };
// which window a title belongs to, and the key its place is kept under (a new card's pop-out / form starts beside it again)
function finWinOf(t) {
  const h = t.closest && t.closest('#fin-pop .fin-pop-h, #fin-cv-ed .fin-cv-ed-t, #fin-bal-win .fin-talk-win-h, #fin-health-win .fin-talk-win-h'); if (!h) return null;
  const el = h.closest('#fin-pop, #fin-cv-ed, #fin-bal-win, #fin-health-win'), E0 = UI.fin.cvEdit;
  const key = el.id === 'fin-pop' ? 'pop:' + UI.fin.pop : el.id === 'fin-cv-ed' ? 'ed:' + (E0 ? E0.add || E0.id : '') : el.id === 'fin-health-win' ? 'health' : 'bal';
  return { h, el, key };
}
const finWinPos = key => (UI.fin.winPos || {})[key] || null;
document.addEventListener('pointerdown', e => {
  if (e.button > 0 || (e.target.closest && e.target.closest('button, input, select, textarea, a'))) return;
  const w = finWinOf(e.target); if (!w) return;
  e.preventDefault(); e.stopPropagation();   // not a drag of the canvas under it
  FWIN.drag = { id: e.pointerId, key: w.key, el: w.el, dx: e.clientX - w.el.offsetLeft, dy: e.clientY - w.el.offsetTop }; w.el.classList.add('dragging');
  try { w.h.setPointerCapture(e.pointerId); } catch {}
}, true);
document.addEventListener('pointermove', e => {
  const D = FWIN.drag; if (!D || e.pointerId !== D.id) return;
  const el = document.getElementById(D.el.id) || D.el, st = el.offsetParent; if (!st) return;
  const x = Math.max(0, Math.min(st.clientWidth - 60, e.clientX - D.dx)), y = Math.max(0, Math.min(st.clientHeight - 40, e.clientY - D.dy));
  (UI.fin.winPos = UI.fin.winPos || {})[D.key] = { x, y };
  Object.assign(el.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' }); el.classList.add('moved', 'far');
});
const finWinEnd = e => { const D = FWIN.drag; if (D && e.pointerId === D.id) { (document.getElementById(D.el.id) || D.el).classList.remove('dragging'); FWIN.drag = null; } };
document.addEventListener('pointerup', finWinEnd); document.addEventListener('pointercancel', finWinEnd);
// after every drawing (and every move of the canvas): a moved window stays where you put it
function finWinKeep() {
  const pop = $('#fin-pop'), p1 = pop && finWinPos('pop:' + UI.fin.pop);
  if (p1) { Object.assign(pop.style, { left: p1.x + 'px', top: p1.y + 'px' }); pop.classList.add('moved', 'far'); }
  const ed = $('#fin-cv-ed'), E0 = UI.fin.cvEdit, p2 = ed && E0 && finWinPos('ed:' + (E0.add || E0.id));
  if (p2) { Object.assign(ed.style, { left: p2.x + 'px', top: p2.y + 'px' }); ed.classList.add('moved'); }
  const bw = $('#fin-bal-win'), p3 = bw && finWinPos('bal');
  if (p3) Object.assign(bw.style, { left: p3.x + 'px', top: p3.y + 'px', right: 'auto', bottom: 'auto' });
  const hw = $('#fin-health-win'), p4 = hw && finWinPos('health');
  if (p4) Object.assign(hw.style, { left: p4.x + 'px', top: p4.y + 'px', right: 'auto', bottom: 'auto' });
}
HOOKS.afterRender.push(finWinKeep);
Object.assign(window.__FIN, { winPos: () => UI.fin.winPos || {} });
