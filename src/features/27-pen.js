/* ---------- tablet: finger shortcuts on the canvas ---------- */
// Two-finger tap undoes, three-finger tap redoes (as in drawing apps). Pinch and two-finger drag still zoom and move;
// the stylus itself — pressure, eraser end, side button, palm rejection — is handled with the other canvas pointers.
const FT = { n: 0, max: 0, t0: 0, moved: false, start: new Map() };
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch' || MP.penDown || !e.target.closest || !e.target.closest('#map-vp')) return;
  if (!FT.n) { FT.max = 0; FT.t0 = Date.now(); FT.moved = false; FT.start.clear(); }
  FT.n++; FT.max = Math.max(FT.max, FT.n); FT.start.set(e.pointerId, [e.clientX, e.clientY]);
}, true);
document.addEventListener('pointermove', e => {
  const s = FT.start.get(e.pointerId); if (s && Math.hypot(e.clientX - s[0], e.clientY - s[1]) > 12) FT.moved = true;
}, true);
const ftEnd = e => {
  if (!FT.start.has(e.pointerId)) return;
  FT.start.delete(e.pointerId); FT.n = Math.max(0, FT.n - 1);
  if (FT.n || FT.moved || Date.now() - FT.t0 > 350 || FT.max < 2 || e.type === 'pointercancel') return;
  if (FT.max === 2) { if (UI.cvUndo.length) { cvUndo(); toast('↶ Undone'); } }
  else if (UI.cvRedo.length) { cvRedo(); toast('↷ Redone'); }
};
document.addEventListener('pointerup', ftEnd, true);
document.addEventListener('pointercancel', ftEnd, true);
