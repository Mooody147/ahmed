/* ---------- organise the canvas: several boards, saved views, layers, align & snap ---------- */
// Boards: the Tasks board holds the task map; any number of extra boards hold notes, drawings, tables and images —
// a scratch board, a weekly plan, one per project — switched with the tabs at the bottom of the canvas.
// Saved views: a named place on a board (where and how close), one tap to jump back.
// Layers: ink, notes & shapes, and tasks can each be hidden (e.g. before showing your manager) or locked.
// Align & snap: while moving, edges and centres snap to other boxes with guide lines (and to a grid if switched
// on); two or more selected items can be aligned and spaced evenly.
const boards = () => (St.layout.pages || []);
const viewsList = () => (St.layout.views || []);
const BRD = { menu: false, renaming: null, confirmDel: null, viewsOpen: false, naming: false };
function boardBarHTML() {
  const pg = curPage(), all = [{ id: 'main', name: 'Tasks' }, ...boards()];
  const cnt = id => [...St.board.values()].filter(e => (e.page || 'main') === id && e.type !== 'connector').length;
  return `<div class="board-bar" role="tablist" aria-label="Boards">
    ${all.map(b => b.id === pg && BRD.renaming === b.id ? `<span class="bb-tab on"><input class="input bb-name" id="bb-name" value="${esc(b.name)}" data-board="${esc(b.id)}" aria-label="Board name" maxlength="40"></span>`
      : `<button class="bb-tab ${b.id === pg ? 'on' : ''}" role="tab" aria-selected="${b.id === pg}" data-act="board-go" data-id="${esc(b.id)}" title="${b.id === 'main' ? 'Your task map' : 'Double-click to rename'}">${b.id === 'main' ? '🧠 ' : ''}<span dir="auto">${esc(b.name)}</span>${b.id !== 'main' && cnt(b.id) ? `<small>${cnt(b.id)}</small>` : ''}</button>`).join('')}
    ${St.mode !== 'viewer' ? `<button class="bb-tab bb-add" data-act="board-add" title="New board" aria-label="New board">＋</button>` : ''}
    ${pg !== 'main' && St.mode !== 'viewer' ? (BRD.confirmDel === pg ? `<span class="bb-confirm small">Delete “${esc((boards().find(b => b.id === pg) || {}).name || '')}” and everything on it? <button class="btn sm danger" data-act="board-del-yes">Delete</button><button class="btn sm ghost" data-act="board-del-no">Keep</button></span>`
      : `<button class="bb-tab bb-ic" data-act="board-rename" title="Rename this board" aria-label="Rename board">✎</button><button class="bb-tab bb-ic" data-act="board-del" title="Delete this board" aria-label="Delete board">${I.trash}</button>`) : ''}
    <span class="bb-spacer"></span>
    <div class="bb-views">
      <button class="bb-tab ${BRD.viewsOpen ? 'on' : ''}" data-act="views-toggle" aria-expanded="${BRD.viewsOpen}" title="Saved views">☆ Views${viewsList().length ? ` <small>${viewsList().length}</small>` : ''}</button>
      ${BRD.viewsOpen ? `<div class="bb-pop" role="menu">
        ${viewsList().map(v => `<div class="bb-view"><button class="btn sm ghost" data-act="view-go" data-id="${esc(v.id)}" dir="auto">★ ${esc(v.name)}<small class="muted"> · ${esc(v.page === 'main' ? 'Tasks' : ((boards().find(b => b.id === v.page) || {}).name || 'board'))}</small></button>${St.mode !== 'viewer' ? `<button class="icon-btn" data-act="view-del" data-id="${esc(v.id)}" aria-label="Remove view">✕</button>` : ''}</div>`).join('') || '<p class="small muted" style="margin:4px 8px">No saved views yet.</p>'}
        ${St.mode !== 'viewer' ? (BRD.naming ? `<div class="row" style="padding:6px"><input class="input" id="view-name" placeholder="Name this view" maxlength="40"><button class="btn sm primary" data-act="view-save">Save</button></div>` : `<button class="btn sm" data-act="view-new" style="margin:6px">＋ Save this view</button>`) : ''}
      </div>` : ''}
    </div>
  </div>`;
}
HOOKS.afterRender.push(() => {
  const vp = document.getElementById('map-vp'); if (!vp) return;
  let bar = vp.querySelector(':scope > .board-bar'); const html = deco(boardBarHTML());
  if (!bar) { vp.insertAdjacentHTML('beforeend', html); } else bar.outerHTML = html;
  const inp = document.getElementById('bb-name'); if (inp && document.activeElement !== inp) { inp.focus(); inp.select(); }
});
function rerenderBar() { const bar = document.querySelector('#map-vp > .board-bar'); if (bar) bar.outerHTML = deco(boardBarHTML()); const inp = document.getElementById('bb-name') || document.getElementById('view-name'); if (inp) { inp.focus(); if (inp.select) inp.select(); } }
function goBoard(id) {
  if (id !== 'main' && !boards().some(b => b.id === id)) id = 'main';
  UI.page = id; UI.cvSel.clear(); if (UI.lassoTasks) UI.lassoTasks.clear(); UI.mapSel = null; BRD.confirmDel = null; BRD.renaming = null; BRD.viewsOpen = false;
  UI.map.fitted = false; render(); requestAnimationFrame(() => fitBoard());
}
// fit the camera to what is on this board (the task map fits itself)
function fitBoard() {
  if (curPage() === 'main') { mapFit(); return; }
  const els = boardEls().filter(e => e.type !== 'connector'); if (!els.length) { UI.map.k = 1; UI.map.x = 80; UI.map.y = 60; applyCam(true); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const e of els) { const b = elBox(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  if (typeof fitBox === 'function') fitBox({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
}
function newBoard(name, els) {
  const id = E.uid('pg'), L = newLayout(); L.pages = [...boards(), { id, name: name || `Board ${boards().length + 1}` }];
  const ch = { layout: L }; if (els && els.length) { ch.els = {}; for (const el of els) ch.els[el.id] = { ...el, page: id }; }
  cvApply(ch); return id;
}
Object.assign(ACT, {
  'board-go': el => { if (el.dataset.id === curPage() && el.dataset.id !== 'main' && Date.now() - (BRD.lastTab || 0) < 450) { BRD.renaming = curPage(); rerenderBar(); return; } BRD.lastTab = Date.now(); if (el.dataset.id !== curPage()) goBoard(el.dataset.id); },
  'board-add': () => { const id = newBoard(); goBoard(id); BRD.renaming = id; rerenderBar(); },
  'board-rename': () => { BRD.renaming = curPage(); rerenderBar(); },
  'board-del': () => { BRD.confirmDel = curPage(); rerenderBar(); },
  'board-del-no': () => { BRD.confirmDel = null; rerenderBar(); },
  'board-del-yes': () => {
    const id = curPage(); const L = newLayout(); L.pages = boards().filter(b => b.id !== id); L.views = viewsList().filter(v => v.page !== id);
    const ch = { layout: L, els: {} }; for (const e of St.board.values()) if (e.page === id) ch.els[e.id] = null;
    cvApply(ch); BRD.confirmDel = null; goBoard('main'); toast('Board deleted.', { action: 'Undo', fn: () => { cvUndo(); goBoard(id); } });
  },
  'views-toggle': () => { BRD.viewsOpen = !BRD.viewsOpen; BRD.naming = false; rerenderBar(); },
  'view-new': () => { BRD.naming = true; rerenderBar(); const i = document.getElementById('view-name'); if (i) i.value = `View ${viewsList().length + 1}`, i.select(); },
  'view-save': () => {
    const vp = $('#map-vp'); if (!vp) return; const name = (($('#view-name') || {}).value || '').trim() || `View ${viewsList().length + 1}`;
    const k = UI.map.k, v = { id: E.uid('v'), name: E.clip(name, 40), page: curPage(), cx: (vp.clientWidth / 2 - UI.map.x) / k, cy: (vp.clientHeight / 2 - UI.map.y) / k, k };
    const L = newLayout(); L.views = [...viewsList(), v]; cvApply({ layout: L }); BRD.naming = false; rerenderBar(); toast(`★ “${v.name}” saved.`);
  },
  'view-go': el => {
    const v = viewsList().find(x => x.id === el.dataset.id); if (!v) return;
    BRD.viewsOpen = false; if (v.page !== curPage()) { UI.page = boards().some(b => b.id === v.page) ? v.page : 'main'; UI.map.fitted = true; render(); }
    const vp = $('#map-vp'); if (!vp) return; UI.map.k = v.k; UI.map.x = vp.clientWidth / 2 - v.cx * v.k; UI.map.y = vp.clientHeight / 2 - v.cy * v.k; UI.map.fitted = true; applyCam(true); rerenderBar();
  },
  'view-del': el => { const L = newLayout(); L.views = viewsList().filter(v => v.id !== el.dataset.id); cvApply({ layout: L }); rerenderBar(); },
});
document.addEventListener('keydown', e => {
  if (e.target && (e.target.id === 'bb-name' || e.target.id === 'view-name')) {
    if (e.key === 'Enter') { e.preventDefault(); e.target.id === 'bb-name' ? finishRename(e.target) : ACT['view-save'](); }
    if (e.key === 'Escape') { BRD.renaming = null; BRD.naming = false; rerenderBar(); }
    e.stopPropagation();
  }
}, true);
document.addEventListener('focusout', e => {
  if (!e.target || e.target.id !== 'bb-name') return;
  const inp = e.target;
  // the bar being drawn again also takes focus away; only a real blur (the field still on the page) finishes renaming
  setTimeout(() => { if (inp.isConnected) finishRename(inp); }, 0);
});
function finishRename(inp) {
  const id = inp.dataset.board, name = inp.value.trim(); BRD.renaming = null;
  const cur = boards().find(b => b.id === id);
  if (cur && name && name !== cur.name) { const L = newLayout(); L.pages = boards().map(b => (b.id === id ? { ...b, name: E.clip(name, 40) } : b)); cvApply({ layout: L }); }
  rerenderBar();
}

/* --- layers --- */
const LAYERS = [['ink', '✏️ Ink (pen, highlighter, lines)'], ['notes', '🗒 Notes, shapes, frames, tables'], ['tasks', '🧠 Task map']];
function layersHTML() {
  return `<div class="mt-sec"><div class="label">Layers</div>${LAYERS.map(([k, l]) => { const s = layerSet(k); return `<div class="layer-row"><span class="small">${l}</span><button class="icon-btn ${s.hide ? 'off' : ''}" data-act="layer" data-k="${k}" data-f="hide" aria-pressed="${!s.hide}" title="${s.hide ? 'Show' : 'Hide'}">${s.hide ? '🙈' : '👁'}</button><button class="icon-btn ${s.lock ? 'on' : ''}" data-act="layer" data-k="${k}" data-f="lock" aria-pressed="${!!s.lock}" title="${s.lock ? 'Unlock' : 'Lock — cannot be picked or moved'}">${s.lock ? '🔒' : '🔓'}</button></div>`; }).join('')}
    <label class="check small"><input type="checkbox" id="snap-grid" data-chg="snap-grid" ${(St.settings.ui || {}).snapGrid ? 'checked' : ''}>Snap to a grid while moving</label></div>`;
}
ACT.layer = el => { const k = el.dataset.k, f = el.dataset.f; const cur = { ...((St.settings.ui || {}).layers || {}) }; cur[k] = { ...(cur[k] || {}), [f]: !(cur[k] || {})[f] }; saveSettingsUi({ layers: cur }); UI.cvSel.clear(); render(); };
CHG['snap-grid'] = el => { saveSettingsUi({ snapGrid: !!el.checked }); };
MORE_SECTIONS.push(layersHTML);

/* --- snap while moving, with guide lines --- */
const GRID = 20;
SNAP.fn = (ids, dx, dy) => {
  const mov = [...ids].map(id => St.board.get(id)).filter(e => e && !['connector'].includes(e.type)); if (!mov.length) return [dx, dy];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of mov) { const b = e.type === 'stroke' || e.type === 'line' ? elBox({ ...e }) : { x: e.x, y: e.y, w: e.w, h: e.h }; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  const w = x1 - x0, h = y1 - y0, tol = 7 / UI.map.k, guides = [];
  let nx = x0 + dx, ny = y0 + dy;
  if ((St.settings.ui || {}).snapGrid) { nx = Math.round(nx / GRID) * GRID; ny = Math.round(ny / GRID) * GRID; }
  else {
    const others = [];
    for (const e of boardEls()) if (!ids.has(e.id) && !['connector', 'stroke', 'line'].includes(e.type)) others.push(elBox(e));
    if (UI.mapLayout && curPage() === 'main') for (const n of UI.mapLayout.nodes) others.push({ x: n.x, y: n.y, w: n.w, h: n.h || 40 });
    let bx = null, by = null;
    for (const o of others) {
      for (const [mine, theirs] of [[0, o.x], [0, o.x + o.w], [w / 2, o.x + o.w / 2], [w, o.x + o.w], [w, o.x]]) { const d = theirs - (nx + mine); if (Math.abs(d) < tol && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: theirs, o }; }
      for (const [mine, theirs] of [[0, o.y], [0, o.y + o.h], [h / 2, o.y + o.h / 2], [h, o.y + o.h], [h, o.y]]) { const d = theirs - (ny + mine); if (Math.abs(d) < tol && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: theirs, o }; }
    }
    if (bx) { nx += bx.d; guides.push({ x: bx.at, y0: Math.min(ny, bx.o.y) - 20, y1: Math.max(ny + h, bx.o.y + bx.o.h) + 20 }); }
    if (by) { ny += by.d; guides.push({ y: by.at, x0: Math.min(nx, by.o.x) - 20, x1: Math.max(nx + w, by.o.x + by.o.w) + 20 }); }
  }
  UI.guides = guides;
  return [nx - x0, ny - y0];
};
WORLD_EXTRA.push(M => {
  const g = UI.guides; if (!g || !g.length || !UI.cvTemp) return '';
  const k = UI.map.k;
  return `<svg class="cv-guides" width="${M.w}" height="${M.h}" aria-hidden="true">${g.map(l => l.x !== undefined ? `<line x1="${l.x}" y1="${l.y0}" x2="${l.x}" y2="${l.y1}"/>` : `<line x1="${l.x0}" y1="${l.y}" x2="${l.x1}" y2="${l.y}"/>`).join('')}</svg>`.replace(/<line /g, `<line stroke-width="${1.5 / k}" `);
});
document.addEventListener('pointerup', () => { UI.guides = null; }, true);

/* --- align and space evenly --- */
CTX_EXTRA.push(els => {
  const boxy = els.filter(e => !['connector'].includes(e.type)); if (boxy.length < 2) return '';
  const b = (a, t, l) => `<button class="btn sm ghost" data-act="cv-align" data-a="${a}" title="${t}" aria-label="${t}">${l}</button>`;
  return `<span class="ctx-group">${b('l', 'Align left', '⇤')}${b('c', 'Align centres', '↔')}${b('r', 'Align right', '⇥')}${b('t', 'Align top', '⤒')}${b('m', 'Align middles', '↕')}${b('b', 'Align bottom', '⤓')}${boxy.length > 2 ? b('dh', 'Space evenly across', '⋯') + b('dv', 'Space evenly down', '⋮') : ''}</span>`;
});
ACT['cv-align'] = el => {
  const a = el.dataset.a, items = [...UI.cvSel].map(id => St.board.get(id)).filter(e => e && e.type !== 'connector').map(e => ({ e, b: elBox(e) }));
  if (items.length < 2) return;
  const L = Math.min(...items.map(i => i.b.x)), R = Math.max(...items.map(i => i.b.x + i.b.w)), T0 = Math.min(...items.map(i => i.b.y)), B = Math.max(...items.map(i => i.b.y + i.b.h));
  const ch = { els: {} };
  const put = (i, dx, dy) => { if (dx || dy) ch.els[i.e.id] = moveEl(i.e, Math.round(dx), Math.round(dy)); };
  if (a === 'dh' || a === 'dv') {
    const h = a === 'dh', s = items.slice().sort((p, q) => h ? p.b.x - q.b.x : p.b.y - q.b.y);
    const total = s.reduce((n, i) => n + (h ? i.b.w : i.b.h), 0), gap = ((h ? R - L : B - T0) - total) / (s.length - 1);
    let at = h ? L : T0; for (const i of s) { put(i, h ? at - i.b.x : 0, h ? 0 : at - i.b.y); at += (h ? i.b.w : i.b.h) + gap; }
  } else for (const i of items) put(i, a === 'l' ? L - i.b.x : a === 'r' ? R - (i.b.x + i.b.w) : a === 'c' ? (L + R) / 2 - (i.b.x + i.b.w / 2) : 0, a === 't' ? T0 - i.b.y : a === 'b' ? B - (i.b.y + i.b.h) : a === 'm' ? (T0 + B) / 2 - (i.b.y + i.b.h / 2) : 0);
  if (Object.keys(ch.els).length) { cvApply(ch); render(); }
};

// Fit fits what is on the board you are looking at
const mapFitAct = ACT['map-fit'];
ACT['map-fit'] = el => { if (curPage() !== 'main') { fitBoard(); return; } mapFitAct(el); };
