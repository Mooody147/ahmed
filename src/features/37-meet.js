/* ---------- see more and meet: heat, critical path, laser & frames presenting, live cursors, comment pins, A3 PDF ---------- */
// 🔥 Heat: every open task glows by how stuck it is — overdue days, or days with nothing happening.
// ⛓ Critical path: the longest chain of linked tasks (by date), the one that decides when the work is finished.
// 🔴 Laser: a red dot with a short trail follows your pen or mouse — for meetings on a big screen; people viewing the
//    shared canvas at the same time see it too. Present frames: walk through the frames on a board like slides.
// 👥 Live cursors: whoever has the canvas open at the same time (you on another device, your manager on the shared
//    view) appears as a named cursor. 💬 Pins: comments placed on a task or note stay pinned to it as the canvas moves.
// 📄 A3 PDF: the board as a print-ready A3 landscape PDF.
const uiOpt = k => (St.settings.ui || {})[k];

/* --- heat --- */
function heatLevel(t) {
  if (t.status === 'done') return 0;
  if (t.deadline && t.deadline < T()) { const d = E.dayDiff(t.deadline, T()); return d >= 7 ? 4 : d >= 3 ? 3 : 2; }
  const last = (t.history || []).reduce((m, h) => (h.at || '') > m ? h.at : m, t.updatedAt || t.createdAt || '');
  const idle = last ? E.dayDiff(last.slice(0, 10), T()) : 0;
  return idle > 21 ? 3 : idle > 10 ? 2 : idle > 5 ? 1 : 0;
}
NODE_CLASS.push(t => uiOpt('mapHeat') ? `heat heat-${heatLevel(t)}` : '');

/* --- critical path --- */
function critChain() {
  const open = [...St.tasks.values()].filter(t => t.status !== 'done'), byId = new Map(open.map(t => [t.id, t]));
  const key = t => t.deadline || (t.createdAt || '').slice(0, 10) || '9999';
  const out = new Map(open.map(t => [t.id, []]));
  for (const t of open) for (const r of relIds(t)) { const u = byId.get(r); if (!u) continue; const [a, b] = key(t) <= key(u) ? [t, u] : [u, t]; if (!out.get(a.id).includes(b.id)) out.get(a.id).push(b.id); }
  const memo = new Map();
  const best = id => { if (memo.has(id)) return memo.get(id); memo.set(id, [id]); let b = [id]; for (const n of out.get(id) || []) { const c = [id, ...best(n)]; if (c.length > b.length || (c.length === b.length && key(byId.get(c[c.length - 1])) > key(byId.get(b[b.length - 1])))) b = c; } memo.set(id, b); return b; };
  let chain = []; for (const t of open) { const c = best(t.id); if (c.length > chain.length) chain = c; }
  return chain.length > 1 ? chain : [];
}
let CRIT = null;
NODE_CLASS.push(t => CRIT && CRIT.includes(t.id) ? 'crit-path' : '');
WORLD_EXTRA.push(M => {
  if (!CRIT || CRIT.length < 2) return '';
  const k = UI.map.k, seg = [];
  for (let i = 0; i + 1 < CRIT.length; i++) { const a = M.byId.get('t:' + CRIT[i]), b = M.byId.get('t:' + CRIT[i + 1]); if (a && b) seg.push(smartPath(a, b)); }
  return `<svg class="cv-crit" width="${M.w}" height="${M.h}" aria-hidden="true">${seg.map(d => `<path d="${d}" stroke-width="${Math.max(3, 4 / k)}"/>`).join('')}</svg>`;
});
HOOKS.beforeRender.push(() => { CRIT = uiOpt('mapCrit') ? critChain() : null; });

MORE_SECTIONS.push(() => `<div class="mt-sec"><div class="label">See more</div>
  <label class="check small"><input type="checkbox" data-chg="ui-opt" data-k="mapHeat" ${uiOpt('mapHeat') ? 'checked' : ''}>🔥 Heat — tasks glow by how stuck they are</label>
  <label class="check small"><input type="checkbox" data-chg="ui-opt" data-k="mapCrit" ${uiOpt('mapCrit') ? 'checked' : ''}>⛓ Critical path — the chain of linked tasks that sets the finish date</label>
  <label class="check small"><input type="checkbox" data-chg="ui-opt" data-k="laser" ${UI.laser ? 'checked' : ''}>🔴 Laser pointer</label>
  ${boardEls().some(e => e.type === 'frame') ? '<button class="btn sm ghost" data-act="present-frames">🖥 Present this board frame by frame</button>' : ''}
  <button class="btn sm ghost" data-act="map-export-a3">📄 PDF for printing (A3)</button></div>`);
CHG['ui-opt'] = el => {
  const k = el.dataset.k;
  if (k === 'laser') { UI.laser = !!el.checked; laserSetup(); return; }
  saveSettingsUi({ [k]: !!el.checked }); render();
  if (k === 'mapCrit' && el.checked && !critChain().length) toast('No linked tasks yet — link tasks with the ● handle or the Link tool to see the chain.');
};

/* --- laser --- */
const LZ = { pts: [], raf: 0, remote: new Map() };
function laserSetup() {
  const vp = document.getElementById('map-vp'); if (!vp) return;
  let c = vp.querySelector(':scope > canvas.cv-laser');
  if (!UI.laser && !LZ.remote.size) { if (c) c.remove(); return; }
  if (!c) { c = document.createElement('canvas'); c.className = 'cv-laser cv-overlay'; vp.appendChild(c); }
  const dpr = Math.min(3, devicePixelRatio || 1); c.width = vp.clientWidth * dpr; c.height = vp.clientHeight * dpr;
  if (!LZ.raf) LZ.raf = requestAnimationFrame(laserDraw);
}
function laserDraw() {
  LZ.raf = 0; const vp = document.getElementById('map-vp'), c = vp && vp.querySelector(':scope > canvas.cv-laser'); if (!c) return;
  const ctx = c.getContext('2d'), dpr = c.width / vp.clientWidth, now = Date.now(); ctx.clearRect(0, 0, c.width, c.height);
  const r = vp.getBoundingClientRect();
  const draw = (pts, col) => {
    const live = pts.filter(p => now - p.t < 700); if (!live.length) return;
    for (let i = 1; i < live.length; i++) { const a = live[i - 1], b = live[i], age = (now - b.t) / 700; ctx.strokeStyle = col.replace('A', String(0.55 * (1 - age))); ctx.lineWidth = 6 * dpr * (1 - age * 0.6); ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(a.x * dpr, a.y * dpr); ctx.lineTo(b.x * dpr, b.y * dpr); ctx.stroke(); }
    const h = live[live.length - 1]; ctx.fillStyle = col.replace('A', '1'); ctx.shadowColor = col.replace('A', '.9'); ctx.shadowBlur = 14 * dpr; ctx.beginPath(); ctx.arc(h.x * dpr, h.y * dpr, 7 * dpr, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
  };
  if (UI.laser) draw(LZ.pts, 'rgba(229,32,48,A)');
  for (const [, pts] of LZ.remote) draw(pts.map(p => ({ x: p.wx * UI.map.k + UI.map.x, y: p.wy * UI.map.k + UI.map.y, t: p.t })), 'rgba(229,32,48,A)');
  LZ.pts = LZ.pts.filter(p => now - p.t < 700);
  if (LZ.pts.length || [...LZ.remote.values()].some(p => p.length && now - p[p.length - 1].t < 700)) LZ.raf = requestAnimationFrame(laserDraw);
  void r;
}
document.addEventListener('pointermove', e => {
  const vp = document.getElementById('map-vp'); if (!vp || !e.target.closest || !e.target.closest('#map-vp')) return;
  const r = vp.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  if (UI.laser) { LZ.pts.push({ x, y, t: Date.now() }); if (LZ.pts.length > 60) LZ.pts.shift(); if (!LZ.raf) LZ.raf = requestAnimationFrame(laserDraw); }
  roomMove((x - UI.map.x) / UI.map.k, (y - UI.map.y) / UI.map.k);
}, { passive: true });
HOOKS.afterRender.push(() => { if (UI.laser || LZ.remote.size) laserSetup(); });

/* --- present frames like slides --- */
const presentBarProjects = presentBarHTML, presentGoProjects = presentGo;
presentBarHTML = function () {
  const P = UI.present; if (!P || !P.frames) return presentBarProjects();
  const f = St.board.get(P.frames[P.i]);
  return `<div class="present-bar" role="toolbar" aria-label="Presentation"><button class="btn sm ghost" data-act="present-step" data-d="-1" ${P.i ? '' : 'disabled'} aria-label="Previous">◀</button>
    <span class="small"><b dir="auto">${esc(f ? f.text || 'Frame' : '')}</b> <span class="muted">${P.i + 1} / ${P.frames.length}</span></span>
    <button class="btn sm ghost" data-act="present-step" data-d="1" ${P.i < P.frames.length - 1 ? '' : 'disabled'} aria-label="Next">▶</button>
    <button class="btn sm ${UI.laser ? 'primary' : 'ghost'}" data-act="laser-toggle" title="Laser pointer">🔴</button><button class="btn sm" data-act="present-exit">Exit</button></div>`;
};
presentGo = function (i) {
  const P = UI.present; if (!P || !P.frames) return presentGoProjects(i);
  P.i = Math.max(0, Math.min(P.frames.length - 1, i));
  const bar = $('.present-bar'); if (bar) bar.outerHTML = deco(presentBarHTML());
  const f = St.board.get(P.frames[P.i]); if (f) fitBox(elBox(f));
  roomEmitPresent();
};
ACT['present-frames'] = () => {
  closeMenus(); const fr = boardEls().filter(e => e.type === 'frame').sort((a, b) => (Math.abs(a.y - b.y) > 120 ? a.y - b.y : a.x - b.x)).map(e => e.id);
  if (!fr.length) { toast('Add frames to this board first (Frame tool, F).'); return; }
  UI.present = { i: 0, frames: fr }; UI.tool = 'select'; if (!UI.mapFull) toggleFull(true); else render();
  requestAnimationFrame(() => requestAnimationFrame(() => presentGo(0)));
};
ACT['laser-toggle'] = () => { UI.laser = !UI.laser; laserSetup(); const bar = $('.present-bar'); if (bar) bar.outerHTML = deco(presentBarHTML()); };
document.addEventListener('keydown', e => { if (e.key && e.key.toLowerCase() === 'l' && e.shiftKey && UI.view === 'todo' && UI.todoMode === 'map' && !e.target.closest('input,textarea,[contenteditable]')) { e.preventDefault(); ACT['laser-toggle'](); } });

/* --- live cursors (and the laser) through the room --- */
const RM = { room: null, user: null, peers: new Map(), names: {}, last: 0, color: ['#E5484D', '#0A6B74', '#C26100', '#7A3EC8', '#2F6FB0'][Math.floor(Math.random() * 5)] };
function roomMove(wx, wy) {
  if (!RM.room || Date.now() - RM.last < 60) return; RM.last = Date.now();
  RM.room.presence({ cur: { x: Math.round(wx), y: Math.round(wy), p: curPage() }, c: RM.color, lz: !!UI.laser }).catch(() => {});
}
function roomEmitPresent() { if (RM.room && UI.present && UI.present.frames) RM.room.presence({ show: { p: curPage(), f: UI.present.frames[UI.present.i] } }).catch(() => {}); }
function cursorsHTML() {
  const out = [];
  for (const [peer, p] of RM.peers) {
    const cur = p.presence && p.presence.cur; if (!cur || cur.p !== curPage() || p.isMe) continue;
    const x = cur.x * UI.map.k + UI.map.x, y = cur.y * UI.map.k + UI.map.y, name = (p.by && RM.names[p.by]) || (p.guest ? 'Guest' : 'Viewer');
    out.push(`<div class="cv-cursor" style="left:${x}px;top:${y}px;--c:${esc(String(p.presence.c || '#E5484D'))}"><svg width="18" height="18" viewBox="0 0 24 24"><path d="M3 2l7 19 2.5-8.5L21 10z" fill="var(--c)" stroke="#fff" stroke-width="1.5"/></svg><span>${esc(name)}</span></div>`);
    void peer;
  }
  return out.join('');
}
function drawCursors() {
  const vp = document.getElementById('map-vp'); if (!vp) return;
  let layer = vp.querySelector(':scope > .cv-cursors');
  if (!RM.peers.size) { if (layer) layer.remove(); return; }
  if (!layer) { layer = document.createElement('div'); layer.className = 'cv-cursors cv-overlay'; vp.appendChild(layer); }
  layer.innerHTML = cursorsHTML();
  const n = [...RM.peers.values()].filter(p => !p.isMe).length, ind = document.querySelector('.board-bar .bb-here');
  if (ind) ind.textContent = n ? `👥 ${n + 1} here` : '';
}
const applyCam0 = applyCam;
applyCam = function (animate) { applyCam0(animate); if (RM.peers.size) drawCursors(); if (CM.ctrl) cmPlace(); };
HOOKS.afterRender.push(() => { drawCursors(); const bar = document.querySelector('#map-vp > .board-bar'); if (bar && RM.room && !bar.querySelector('.bb-here')) bar.insertAdjacentHTML('beforeend', '<span class="bb-here small"></span>'); drawCursors(); });
async function roomStart() {
  if (typeof claude === 'undefined' || !claude.use) return;
  const room = await claude.use('room').catch(() => null); if (!room) return;
  RM.room = room; RM.user = await claude.use('user').catch(() => null);
  room.onPeers(ch => {
    RM.peers = new Map(ch.peers.filter(p => !p.isMe && p.kind === 'viewer').map(p => [p.peer, p]));
    // someone presenting with the laser on: their dot shows here too
    for (const p of ch.updated || []) {
      if (p.isMe || !p.presence || !p.presence.cur) continue;
      if (p.presence.lz && p.presence.cur.p === curPage()) { const pts = LZ.remote.get(p.peer) || []; pts.push({ wx: p.presence.cur.x, wy: p.presence.cur.y, t: Date.now() }); LZ.remote.set(p.peer, pts.slice(-40)); laserSetup(); if (!LZ.raf) LZ.raf = requestAnimationFrame(laserDraw); }
      // a viewer of the shared canvas follows the presenter's frames
      if (St.mode === 'viewer' && p.presence.show && p.presence.show.f) { const f = St.board.get(p.presence.show.f); if (f) { UI.page = p.presence.show.p; render(); fitBox(elBox(f)); } }
    }
    const ids = [...RM.peers.values()].map(p => p.by).filter(id => id && !(id in RM.names));
    if (ids.length && RM.user && RM.user.profiles) RM.user.profiles(ids).then(ps => { for (const id of ids) RM.names[id] = (ps && ps[id] && ps[id].name) || ''; drawCursors(); }).catch(() => {});
    drawCursors();
  }, () => { RM.room = null; RM.peers.clear(); drawCursors(); });
}
let meetStarted = false;
const meetStart = () => { if (meetStarted) return; meetStarted = true; roomStart(); cmStart(); };
HOOKS.ready.push(meetStart);
setTimeout(meetStart, 4000); // the shared (viewer) page starts here too

/* --- comment pins that follow the canvas --- */
const CM = { api: null, ctrl: null, on: false, threads: [] };
const anchorEl = a => { const m = /^(task|el):(.+)$/.exec(a || ''); if (!m) return null; return m[1] === 'task' ? document.querySelector(`.mnode.task[data-tid="${CSS.escape(m[2])}"]`) : document.querySelector(`[data-el="${CSS.escape(m[2])}"]`); };
function cmPlace() {
  if (!CM.ctrl) return; const map = {};
  for (const th of CM.threads) { const el = anchorEl(th.anchor); if (!el) continue; const r = el.getBoundingClientRect(); map[th.id] = { x: r.right - 6 + scrollX, y: r.top + 6 + scrollY }; }
  try { CM.ctrl.placed(map); } catch {}
}
async function cmStart() {
  if (typeof claude === 'undefined' || !claude.use) return;
  const api = await claude.use('comments').catch(() => null); if (!api || typeof api.customAnchors !== 'function') return;
  CM.api = api;
  try {
    CM.ctrl = await api.customAnchors({
      mode: on => { CM.on = on; document.body.classList.toggle('cm-on', on); if (!on) CM.threads = []; },
      threads: list => { CM.threads = list; cmPlace(); },
      reveal: id => {
        const th = CM.threads.find(t => t.id === id); if (!th) return; const m = /^(task|el):(.+)$/.exec(th.anchor || ''); if (!m) return;
        if (m[1] === 'task') { UI.page = 'main'; UI.mapFocus = 'all'; render(); const n = UI.mapLayout && UI.mapLayout.byId.get('t:' + m[2]); if (n) fitBox({ x: n.x - 200, y: n.y - 150, w: n.w + 400, h: n.h + 300 }); }
        else { const el = St.board.get(m[2]); if (el) { UI.page = el.page || 'main'; render(); fitBox(elBox(el)); } }
        cmPlace();
      },
    });
    cmPlace();
  } catch { CM.ctrl = null; }
}
HOOKS.afterRender.push(() => { if (CM.ctrl) requestAnimationFrame(cmPlace); });
// in comment mode a press on a task or note opens the comment box there instead of selecting or moving it
document.addEventListener('pointerdown', e => {
  if (!CM.on || !CM.ctrl || !e.target.closest) return;
  const node = e.target.closest('.mnode.task'), bel = e.target.closest('[data-el]'); if (!node && !bel) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (node) { const t = St.tasks.get(node.dataset.tid); CM.ctrl.compose('task:' + node.dataset.tid, node, { label: t ? `${t.ref || ''} ${E.clip(t.title, 80)}`.trim() : 'Task' }).catch(() => {}); }
  else { const el = St.board.get(bel.dataset.el); CM.ctrl.compose('el:' + bel.dataset.el, bel, { label: el ? E.clip(el.text || el.name || el.type, 80) : 'Note' }).catch(() => {}); }
}, true);
// a 💬 on a selected task opens the comment box (for you, or your manager on the shared view)
CTX_EXTRA.push((els, one) => CM.ctrl && one ? `<button class="btn sm ghost" data-act="cm-here" data-a="el:${esc(one.id)}" title="Comment here">💬</button>` : '');
ACT['cm-here'] = el => { const a = el.dataset.a, at = anchorEl(a); if (CM.ctrl && at) CM.ctrl.compose(a, at, { label: 'Canvas' }).catch(() => {}); };
MAP_BTN.comment = id => { const n = document.querySelector(`.mnode.task[data-tid="${CSS.escape(id)}"]`), t = St.tasks.get(id); if (CM.ctrl && n) CM.ctrl.compose('task:' + id, n, { label: t ? `${t.ref || ''} ${E.clip(t.title, 80)}`.trim() : 'Task' }).catch(() => {}); };
NODE_EXTRA.push(t => CM.ctrl ? `<button class="mitems mcomment" data-map="comment" title="Comment on this task">💬</button>` : '');

/* --- A3 PDF: the board drawn sharp on an A3 landscape page --- */
function jpegPDF(jpegBytes, imgW, imgH) {
  const pw = 1190.55, ph = 841.89, m = 24, s = Math.min((pw - 2 * m) / imgW, (ph - 2 * m) / imgH), dw = imgW * s, dh = imgH * s, dx = (pw - dw) / 2, dy = (ph - dh) / 2;
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`); push(jpegBytes); push('\nendstream'); });
  const cs = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
  const xref = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
function exportLayout() {
  const M = UI.mapLayout || buildMap();
  if (curPage() === 'main') return M;
  const els = boardEls().filter(e => e.type !== 'connector'); let x0 = 0, y0 = 0, x1 = 800, y1 = 600;
  if (els.length) { x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity; for (const e of els) { const b = elBox(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); } }
  return { ...M, nodes: [], edges: [], links: [], projects: [], x0: x0 - 40, y0: y0 - 40, w: x1 - x0 + 80, h: y1 - y0 + 80 };
}
ACT['map-export-a3'] = async () => {
  closeMenus(); toast('📄 Preparing the A3 PDF…');
  try {
    const M = exportLayout(), x = mapSVG(M);
    for (const im of [...x.svg.matchAll(/<image href="([^"]+)"/g)]) if (!/^data:/.test(im[1])) { try { x.svg = x.svg.replace(im[1], await srcDataURL(im[1])); } catch {} }
    const target = 4961, scale = Math.min(6, target / Math.max(x.w, x.h)); // A3 at 300 dpi along the long side
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(x.svg); await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(x.w * scale); c.height = Math.round(x.h * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    const jpg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const name = curPage() === 'main' ? 'canvas' : E.normMatch((boards().find(b => b.id === curPage()) || {}).name || 'board').replace(/\s+/g, '-');
    await offerFile(`action-register-${name}-${T()}-A3.pdf`, jpegPDF(jpg, c.width, c.height), 'application/pdf');
  } catch (e) { toast('Could not make the PDF.', { err: true }); }
};
