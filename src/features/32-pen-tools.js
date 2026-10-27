/* ---------- smart pen: gestures, shapes that snap clean, lasso ---------- */
// With the pen tool (or the stylus on empty canvas):
//  • draw a ✓ over a task → it is done          • scribble over a box → it is deleted
//  • a line from one box to another → a link    • a loop around boxes → they are selected
//  • draw a rough shape or line and hold the pen still for a moment at the end → it snaps into a clean rectangle,
//    ellipse, diamond, triangle or straight line
// Anything that is not one of these stays as ink, exactly as drawn. Every gesture can be undone. The Lasso tool (Q)
// selects whatever you draw around — notes, drawings and tasks — for moving, grouping, aligning or deleting together.
const PEN = { holdT: null, last: null };
const penSmart = () => (St.settings.ui || {}).penGestures !== false;
TOOLS.push(['lasso', 'Q', 'Lasso — draw around boxes, notes and drawings to select them', '<path d="M12 4c5 0 8 2.5 8 5.5S16.4 15 12 15s-8-2.2-8-5.5S7 4 12 4z" stroke-dasharray="3 2.5"/><path d="M7 14c-1 2-1 4 1 5"/>']);
TOOL_KEY.q = 'lasso';
TOOL_GROUPS.splice(1, 0, ['lasso']);
TOOL_HINT.lasso = 'Draw around notes, drawings or tasks to select them all';
TOOL_HINT.pen = 'Draw freehand · ✓ on a task marks it done · scribble over a box deletes it · a line between two boxes links them · hold still at the end to snap a clean shape';

// --- geometry ---
const bboxOf = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
const plen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
function inPoly(x, y, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]]; let dmax = 0, idx = 0;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  for (let i = 1; i < pts.length - 1; i++) { const d = Math.abs((b[1] - a[1]) * pts[i][0] - (b[0] - a[0]) * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / L; if (d > dmax) { dmax = d; idx = i; } }
  if (dmax <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
// every box on the board shown now: task map boxes (not on other boards) and note-like elements; frames last
function boxesNow() {
  const out = [], M = UI.mapLayout;
  if (M && curPage() === 'main' && !layerSet('tasks').hide) for (const n of M.nodes) if (n.type !== 'root') out.push({ kind: 'n', id: n.id, n, x: n.x, y: n.y, w: n.w, h: n.h || 40 });
  for (const el of boardEls()) if (!['stroke', 'line', 'connector'].includes(el.type) && !elLocked(el)) out.push({ kind: 'e', id: el.id, el, frame: el.type === 'frame', ...elBox(el) });
  return out.sort((a, b) => (a.frame ? 1 : 0) - (b.frame ? 1 : 0));
}
const boxAt = (x, y, list) => (list || boxesNow()).find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;

// --- recognisers (world coordinates; sizes judged on screen so they work at any zoom) ---
function isTick(pts, bb, k) {
  if (pts.length < 5 || bb.w * k < 12 || bb.h * k < 10 || bb.w * k > 220 || bb.h * k > 220) return false;
  let lo = 0; pts.forEach((p, i) => { if (p[1] > pts[lo][1]) lo = i; });
  const s = pts[0], m = pts[lo], e = pts[pts.length - 1];
  if (lo < 1 || lo > pts.length - 2) return false;
  const down = m[1] - s[1], up = m[1] - e[1];
  return m[0] > s[0] && e[0] > m[0] && down > 0 && up > down * 1.15 && plen(pts) < 2.6 * (bb.w + bb.h);
}
function isScribble(pts, bb, k) {
  if (pts.length < 12 || bb.w * k < 24) return false;
  let rev = 0, dir = 0, anchor = pts[0][0];
  for (const [x] of pts) { const d = x - anchor; if (Math.abs(d) * k < 8) continue; const nd = Math.sign(d); if (dir && nd !== dir) rev++; dir = nd; anchor = x; }
  return rev >= 5 && plen(pts) > 3.2 * Math.max(bb.w, bb.h);
}
const isClosed = (pts, bb) => Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 0.28 * Math.max(bb.w, bb.h) && plen(pts) > 2.2 * Math.max(bb.w, bb.h);
// the clean shape a rough drawing stands for
function cleanShape(pts, bb) {
  const diag = Math.hypot(bb.w, bb.h) || 1, chord = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
  const simple = rdp(pts, diag * 0.06);
  if (!isClosed(pts, bb) && simple.length <= 3 && chord > 0.85 * plen(pts) * 0.9) return { kind: 'line', a: pts[0], b: pts[pts.length - 1] };
  if (!isClosed(pts, bb)) return null;
  let corners = simple.length - 1; // first and last coincide
  if (corners >= 3 && Math.hypot(simple[0][0] - simple[simple.length - 1][0], simple[0][1] - simple[simple.length - 1][1]) > diag * 0.12) corners++;
  if (corners === 3) return { kind: 'triangle' };
  if (corners === 4) {
    // corners near the middle of each side → diamond, near the box corners → rectangle
    const mid = simple.slice(0, 4).filter(p => (Math.abs(p[0] - (bb.x + bb.w / 2)) < bb.w * 0.22) || (Math.abs(p[1] - (bb.y + bb.h / 2)) < bb.h * 0.22)).length;
    return { kind: mid >= 3 ? 'diamond' : 'rect' };
  }
  return { kind: 'ellipse' };
}
// hold the pen still at the end of a stroke: show the clean shape it will become
document.addEventListener('pointermove', e => {
  if (MP.mode !== 'draw' || MP.tool !== 'pen' || !penSmart()) return;
  const p = [e.clientX, e.clientY];
  if (PEN.last && Math.hypot(p[0] - PEN.last[0], p[1] - PEN.last[1]) < 4) return;
  PEN.last = p; MP.hold = false; clearTimeout(PEN.holdT);
  PEN.holdT = setTimeout(() => {
    if (MP.mode !== 'draw' || MP.pts.length < 6) return;
    const bb = bboxOf(MP.pts), sh = cleanShape(MP.pts, bb); if (!sh) return;
    MP.hold = true;
    const k = UI.map.k, st = `stroke="var(--accent)" stroke-width="${2.5 / k}" fill="none" stroke-dasharray="${8 / k} ${5 / k}"`;
    const g = sh.kind === 'line' ? `<path d="M${sh.a[0]} ${sh.a[1]} L${sh.b[0]} ${sh.b[1]}" ${st}/>` : sh.kind === 'ellipse' ? `<ellipse cx="${bb.x + bb.w / 2}" cy="${bb.y + bb.h / 2}" rx="${bb.w / 2}" ry="${bb.h / 2}" ${st}/>`
      : sh.kind === 'diamond' ? `<path d="M${bb.x + bb.w / 2} ${bb.y}L${bb.x + bb.w} ${bb.y + bb.h / 2}L${bb.x + bb.w / 2} ${bb.y + bb.h}L${bb.x} ${bb.y + bb.h / 2}z" ${st}/>`
        : sh.kind === 'triangle' ? `<path d="M${bb.x + bb.w / 2} ${bb.y}L${bb.x + bb.w} ${bb.y + bb.h}L${bb.x} ${bb.y + bb.h}z" ${st}/>` : `<rect x="${bb.x}" y="${bb.y}" width="${bb.w}" height="${bb.h}" rx="${4 / k}" ${st}/>`;
    const lv = document.getElementById('cv-live'); if (lv) lv.innerHTML += g;
  }, 520);
});
document.addEventListener('pointerup', () => { clearTimeout(PEN.holdT); PEN.last = null; }, true);

function selectInside(poly) {
  const list = boxesNow();
  const els = new Set(), tasks = new Set();
  for (const b of list) { if (inPoly(b.x + b.w / 2, b.y + b.h / 2, poly)) { if (b.kind === 'e') els.add(b.id); else if (b.n.type === 'task') tasks.add(b.n.t.id); } }
  for (const el of boardEls()) if (['stroke', 'line'].includes(el.type) && !elLocked(el)) { const bb = elBox(el); if (inPoly(bb.x + bb.w / 2, bb.y + bb.h / 2, poly)) els.add(el.id); }
  UI.cvSel = els; UI.lassoTasks = tasks; UI.mapSel = null;
  return els.size + tasks.size;
}
STROKE_HOOKS.push((pts, info) => {
  const bb = bboxOf(pts), k = UI.map.k;
  if (info.tool === 'lasso') {
    const n = pts.length > 3 ? selectInside(pts) : 0;
    UI.tool = 'select'; render(); if (!n) toast('Nothing inside — draw around the boxes to select them.');
    return true;
  }
  if (info.tool !== 'pen' || !penSmart()) return false;
  const boxes = boxesNow();
  // ✓ over a task
  if (isTick(pts, bb, k)) {
    const b = boxAt(bb.x + bb.w / 2, bb.y + bb.h / 2, boxes) || boxAt(pts[0][0], pts[0][1], boxes);
    if (b && b.kind === 'n' && b.n.type === 'task') {
      const t = b.n.t; undoable({ [t.id]: true }, () => ACT['toggle-done']({ dataset: { id: t.id } }));
      toast(`${t.status === 'done' ? '↺ Reopened' : '✓ Done'}: ${t.ref || ''} ${E.clip(t.title, 50)}`, { action: 'Undo', fn: cvUndo }); return true;
    }
    if (b && b.kind === 'n' && b.n.type === 'item') { const t = b.n.t && St.tasks.get(b.n.t.id); if (t && b.n.s) { undoable({ [t.id]: true }, () => toggleSub(t.id, b.n.s.id)); render(); return true; } }
  }
  // scribble over a box
  if (isScribble(pts, bb, k)) {
    const b = boxAt(bb.x + bb.w / 2, bb.y + bb.h / 2, boxes);
    if (b && b.kind === 'n' && ['task', 'item', 'topic', 'project'].includes(b.n.type)) { const node = document.querySelector(`.mnode[data-node="${CSS.escape(b.id)}"]`); if (node) { deleteNode(node); return true; } }
    if (b && b.kind === 'e') {
      const ch = { els: { [b.id]: null } };
      for (const c of St.board.values()) if (c.type === 'connector' && (c.from.id === b.id || c.to.id === b.id)) ch.els[c.id] = null;
      cvApply(ch); render(); toast('Deleted.', { action: 'Undo', fn: cvUndo }); return true;
    }
  }
  const closed = isClosed(pts, bb);
  // a line from one box to another
  if (!closed && !info.hold) {
    const a = boxAt(pts[0][0], pts[0][1], boxes), z = boxAt(pts[pts.length - 1][0], pts[pts.length - 1][1], boxes);
    if (a && z && a.id !== z.id && !(a.frame && z.frame) && Math.hypot(bb.w, bb.h) * k > 40) {
      const ref = b => b.kind === 'n' ? { k: 'n', id: b.id } : { k: 'e', id: b.id };
      const el = newEl('connector', { from: ref(a), to: ref(z), width: 2.5 });
      cvApply({ els: { [el.id]: el } }); render(); return true;
    }
  }
  // a loop around boxes selects them (a loop drawn from inside a box stays ink: you were circling it on purpose)
  if (closed && !info.hold && !boxAt(pts[0][0], pts[0][1], boxes)) {
    const inside = boxes.filter(b => !b.frame && inPoly(b.x + b.w / 2, b.y + b.h / 2, pts) && b.w < bb.w && b.h < bb.h);
    if (inside.length) { selectInside(pts); render(); toast(`${UI.cvSel.size + UI.lassoTasks.size} selected.`); return true; }
  }
  // held still at the end: the clean shape
  if (info.hold) {
    const sh = cleanShape(pts, bb); if (!sh) return false;
    const col = UI.cvColor;
    const el = sh.kind === 'line' ? newEl('line', { x1: sh.a[0], y1: sh.a[1], x2: sh.b[0], y2: sh.b[1], width: UI.cvWidth, color: col })
      : newEl('shape', { kind: sh.kind, x: Math.round(bb.x), y: Math.round(bb.y), w: Math.max(24, Math.round(bb.w)), h: Math.max(24, Math.round(bb.h)), text: '', color: col });
    cvApply({ els: { [el.id]: el } }); render(); return true;
  }
  return false;
});
// several tasks picked with the lasso
UI.lassoTasks = UI.lassoTasks || new Set();
CTX_PRE.push(() => {
  const ts = [...(UI.lassoTasks || [])].filter(id => St.tasks.has(id)); if (!ts.length) return '';
  const els = [...UI.cvSel].filter(id => St.board.has(id)).length;
  return `<div class="cv-ctx" role="toolbar" aria-label="Selection"><span class="small muted">${ts.length} task${ts.length > 1 ? 's' : ''}${els ? ` + ${els} item${els > 1 ? 's' : ''}` : ''} selected</span>
    <button class="btn sm" data-act="lasso-done">✓ Mark done</button><button class="btn sm ghost" data-act="lasso-mine">🙋 Mine</button>
    <button class="btn sm ghost danger" data-act="lasso-del" title="Delete">${I.trash}</button><button class="btn sm ghost" data-act="lasso-clear">✕</button></div>`;
});
Object.assign(ACT, {
  'lasso-done': () => { const ids = [...UI.lassoTasks].filter(id => St.tasks.has(id)); const ch = { tasks: {} }, now = nowISO(); ids.forEach(id => { const t = clone(St.tasks.get(id)); if (t.status !== 'done') { t.status = 'done'; t.completedAt = now; (t.history = t.history || []).push({ at: now, text: 'Marked done on the canvas' }); ch.tasks[id] = t; } }); cvApply(ch); UI.lassoTasks.clear(); render(); toast(`${Object.keys(ch.tasks).length} done.`, { action: 'Undo', fn: cvUndo }); },
  'lasso-mine': () => { const ids = [...UI.lassoTasks].filter(id => St.tasks.has(id)); const ch = { tasks: {} }; ids.forEach(id => { const t = clone(St.tasks.get(id)); t.ownership = 'mine'; t.owner = 'me'; if (t.status === 'waiting') t.status = 'todo'; ch.tasks[id] = t; }); cvApply(ch); render(); },
  'lasso-del': () => { const ch = { tasks: {}, els: {} }; [...UI.lassoTasks].forEach(id => { ch.tasks[id] = null; }); [...UI.cvSel].forEach(id => { ch.els[id] = null; }); cvApply(ch); UI.lassoTasks.clear(); UI.cvSel.clear(); render(); toast('Deleted.', { action: 'Undo', fn: cvUndo }); },
  'lasso-clear': () => { UI.lassoTasks.clear(); UI.cvSel.clear(); renderWorld(); },
});
// a click on empty canvas also clears a lasso of tasks
document.addEventListener('pointerdown', e => { if (UI.lassoTasks && UI.lassoTasks.size && e.target.closest && e.target.closest('#map-vp') && !e.target.closest('.cv-ctx,.mnode,[data-el],.cv-tools')) { UI.lassoTasks.clear(); } }, true);
NODE_CLASS.push(t => UI.lassoTasks && UI.lassoTasks.has(t.id) ? 'lassoed' : '');

CHG['pen-gestures'] = el => { saveSettingsUi({ penGestures: !!el.checked }); };
