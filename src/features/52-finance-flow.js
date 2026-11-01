// Money canvas — the card layout "Reservoirs": your money as water.
// Each account is a glass tank filled to its balance (your card and Halan are debt tanks: red, filled to what is owed
// of the limit). Income pours in from the top as streams; under the tanks a pipe carries money out to spending,
// commitments and your goals — each pipe as thick as that money is per month, water moving through it and the amount
// on it. My money and what is coming up sit at the top either side; what you own and others' money below.
// Calm and light — a clean diagram, readable at Fit (the whole of it shows when it opens). Rooms and Flow are the
// other layouts; everything on the canvas (details, pop-outs, the card menu, editing, search, the minimap, Tell the
// canvas) works the same in all of them.

const FRS = { W: 2520, SIDE: 700, MID: 1000, GAP: 60, STREAM: 150, PIPE: 190, TANK_W: 236, TANK_H: 250, HEAD: 92 };
const FIN_CV_MODES = ['rooms', 'flow', 'res', 'mind'];
try { const m = localStorage.getItem('ar-fin-cv-mode'); if (FIN_CV_MODES.includes(m)) UI.fin.cv.mode = m; else if (m === 'tree') UI.fin.cv.mode = 'res'; } catch {}
try { indexedDB.deleteDatabase('ar-tree'); } catch {}   // the Tree's saved pictures are not needed any more

function finResLayout(rooms, plan, n) {
  const { PAD, CG, CW, CH } = FR, cards = [], dets = [], edges = [], subs = [], HEAD = FRS.HEAD;
  const grid = (list, x0, y, w) => {
    const per = Math.max(1, Math.floor((w + CG) / (CW + CG))), cw = per === 1 ? w : Math.floor((w - (per - 1) * CG) / per); let row = [];
    const flush = () => { if (!row.length) return; y += CH + CG; row = []; };
    for (const c of list) {
      if (c.type === 'branch') { flush(); subs.push({ id: c.id, label: `${c.icon} ${c.label}`, sum: c.sum, x: x0, y, w }); y += 34; grid(c.children, x0, y, w); y = subs.y2; continue; }
      c.x = x0 + row.length * (cw + CG); c.y = y; c.w = cw; c.h = CH; cards.push(c); row.push(c); if (row.length === per) flush();
    }
    flush(); subs.y2 = y; return [];
  };
  // the accounts room: its tools in a row, then one tank per account
  const tanks = (r, x0, y, iw) => {
    const all = r.node.children, accts = all.filter(c => c.type === 'leaf' && c.id.startsWith('a:')), rest = all.filter(c => !accts.includes(c));
    grid(rest, x0, y, iw); y = subs.y2 + 10;
    const bank = accts.map(c => { const a = finAcct(c.id.slice(2)); const l = a ? finLatest(a) : {}; return { c, a, l }; });
    const top = Math.max(1, ...bank.filter(x => x.a && !['credit_card', 'bnpl'].includes(x.a.kind)).map(x => typeof x.l.balance === 'number' ? x.l.balance : 0));
    const per = Math.max(1, Math.floor((iw + 30) / (FRS.TANK_W + 30))), rows = Math.ceil(bank.length / per);
    bank.forEach(({ c, a, l }, i) => {
      const row = Math.floor(i / per), inRow = Math.min(per, bank.length - row * per), col = i % per, span = inRow * FRS.TANK_W + (inRow - 1) * 30;
      c.x = x0 + (iw - span) / 2 + col * (FRS.TANK_W + 30); c.y = y + row * (FRS.TANK_H + 30); c.w = FRS.TANK_W; c.h = FRS.TANK_H;
      const debt = a && ['credit_card', 'bnpl'].includes(a.kind), lim = debt ? (+a.limit || +l.limit || 0) : 0;
      c.tank = debt ? { kind: 'debt', lvl: lim && typeof l.owed === 'number' ? Math.max(0, Math.min(1, l.owed / lim)) : 0 } : { kind: 'water', lvl: typeof l.balance === 'number' ? Math.max(0, Math.min(1, l.balance / top * 0.9)) : 0 };
      cards.push(c);
    });
    return y + rows * (FRS.TANK_H + 30) - 30;
  };
  const fill = (r, x, y, w) => {
    r.x = x; r.y = y; r.w = w; r.cls = 'res'; const x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov') { const h = finDetH('ov', 520); dets.push({ id: 'ov', x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'sec') { const h = finDetH(r.id, 640); dets.push({ id: r.id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else if (r.id === 'accts') { yy = tanks(r, x0, yy, iw); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    return y + r.h;
  };
  const by = id => rooms.find(r => r.id === id), placed = new Set(), put = (r, ...a) => { if (!r) return null; placed.add(r.id); fill(r, ...a); return r; };
  const { W, SIDE, MID, GAP } = FRS, midX = SIDE + GAP + (W - 2 * SIDE - 2 * GAP - MID) / 2;
  // the top: My money · the income springs · coming up
  const ov = put(by('ov'), 0, 0, SIDE), inc = put(by('inc'), midX, 0, MID), nx = put(by('next'), W - SIDE, 0, SIDE);
  const topB = Math.max(...[ov, inc, nx].filter(Boolean).map(r => r.y + r.h), 0);
  // the tanks
  const acc = put(by('accts'), 0, Math.max(topB, inc ? inc.y + inc.h : 0) + FRS.STREAM, W);
  const accB = acc ? acc.y + acc.h : topB;
  // the outlets: spending · commitments · goals; then what you own · others' money · anything else
  const yO = accB + FRS.PIPE, exp = put(by('exp'), 0, yO, SIDE), com = put(by('com'), SIDE + GAP, yO, 560), buy = rooms.find(r => r.kind === 'goals');
  const bx = SIDE + GAP + 560 + GAP; if (buy) put(buy, bx, yO, W - bx);
  const colA = [by('own')], colB = [by('third'), ...rooms.filter(r => !placed.has(r.id) && r.kind !== 'sec' && !['own', 'third'].includes(r.id))];
  let ya = exp ? exp.y + exp.h + 50 : yO, yb = com ? com.y + com.h + 50 : yO;
  for (const r of colA) if (r) { put(r, 0, ya, SIDE); ya = r.y + r.h + 40; }
  for (const r of colB) if (r && !placed.has(r.id)) { put(r, SIDE + GAP, yb, 560); yb = r.y + r.h + 40; }
  let y = Math.max(ya, yb, buy ? buy.y + buy.h + 50 : yO);
  for (const r of rooms) if (r.kind === 'sec') y = put(r, 0, y, W).y + r.h + 44;
  // what flows: income in, spending, instalments and savings out
  const v = { inc: n.income || 0, exp: n.spending || 0, com: n.instMonthly || 0, save: Math.max(0, n.capacity || 0) }, max = Math.max(1, ...Object.values(v));
  const th = x => x > 0 ? Math.round(10 + 34 * Math.sqrt(x / max)) : 6;
  const pipes = [], tanksIn = cards.filter(c => c.tank);
  const manifold = accB + 70;
  if (acc && inc) pipes.push({ id: 'inc', kind: 'stream', a: { x: inc.x + inc.w / 2, y: inc.y + inc.h }, b: { x: inc.x + inc.w / 2, y: acc.y }, t: th(v.inc) * 1.6, amt: v.inc ? fk(v.inc) : '—', what: v.inc ? 'comes in a month' : 'income not known yet', empty: !v.inc });
  if (acc) for (const [r, val, what, id] of [[exp, v.exp, 'spent a month', 'exp'], [com, v.com, 'instalments a month', 'com'], [buy, v.save, 'a month to your goals', 'save']]) {
    if (!r) continue; const x = r.id === 'buy' || r.kind === 'goals' ? r.x + 180 : r.x + r.w / 2;
    pipes.push({ id, kind: 'drain', a: { x, y: manifold }, b: { x, y: r.y }, t: th(val), amt: val ? fk(val) : '—', what: val ? what : 'none yet', empty: !val });
  }
  const span = tanksIn.length ? [Math.min(...tanksIn.map(c => c.x + c.w / 2), ...pipes.filter(p => p.kind === 'drain').map(p => p.a.x)), Math.max(...tanksIn.map(c => c.x + c.w / 2), ...pipes.filter(p => p.kind === 'drain').map(p => p.a.x))] : null;
  const w = W, h = Math.max(y - 44, 400);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('ov');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, res: { pipes, manifold, span, tanks: tanksIn.map(c => ({ x: c.x + c.w / 2, y: c.y + c.h })), accB } };
}
// the water: streams from income, stubs from each tank into the pipe under them, drains to the outlets
function finResSVG(L) {
  const R = L.res; if (!R) return '';
  const lab = (p, x, y, anchor) => `<text class="fin-res-l" x="${x}" y="${y}" text-anchor="${anchor}">${p.amt ? `<tspan class="amt">${esc(p.amt)}</tspan>` : ''}<tspan class="what" x="${x}" dy="${p.amt ? 24 : 0}">${esc(p.what)}</tspan></text>`;
  let out = '';
  for (const p of R.pipes.filter(p => p.kind === 'stream')) out += `<g class="fin-res-stream ${p.empty ? 'empty' : ''}"><path class="fall" d="M${p.a.x},${p.a.y} L${p.b.x},${p.b.y}" style="stroke-width:${p.t}px"/>${p.empty ? '' : `<path class="drops" d="M${p.a.x},${p.a.y} L${p.b.x},${p.b.y}"/><path class="drops d2" d="M${p.a.x - p.t / 4},${p.a.y} L${p.a.x - p.t / 4},${p.b.y}"/><path class="drops d3" d="M${p.a.x + p.t / 4},${p.a.y} L${p.a.x + p.t / 4},${p.b.y}"/>`}${lab(p, p.a.x + p.t + 22, (p.a.y + p.b.y) / 2 - 6, 'start')}</g>`;
  if (R.span) {
    const pipe = (d, t, flow, cls) => `<path class="shell" d="${d}" style="stroke-width:${t + 10}px"/><path class="core" d="${d}" style="stroke-width:${t}px"/>${flow ? `<path class="flow ${cls || ''}" d="${d}"/>` : ''}`;
    out += `<g class="fin-res-pipes">`;
    for (const t of R.tanks) out += pipe(`M${t.x},${t.y - 6} L${t.x},${R.manifold}`, 12, true, 'slow');
    out += pipe(`M${R.span[0] - 20},${R.manifold} L${R.span[1] + 20},${R.manifold}`, 22, true);
    for (const p of R.pipes.filter(p => p.kind === 'drain')) out += `<g class="${p.empty ? 'empty' : ''}">${pipe(`M${p.a.x},${p.a.y} L${p.b.x},${p.b.y}`, p.t, !p.empty)}${lab(p, p.a.x + p.t / 2 + 20, (p.a.y + p.b.y) / 2 - 4, 'start')}</g>`;
    for (const t of R.tanks) out += `<circle class="valve" cx="${t.x}" cy="${R.manifold}" r="13"/>`;
    out += `</g>`;
  }
  return `<svg class="fin-res" width="${L.w}" height="${L.h}" aria-hidden="true">${out}</svg>`;
}

function finCvMode(mode) {
  mode = FIN_CV_MODES.includes(mode) ? mode : 'rooms'; if ((UI.fin.cv.mode || 'rooms') === mode) return;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } })();
  const key = el => (el.dataset.room ? 'r:' : 'n:') + (el.dataset.room || el.dataset.node);
  const before = new Map(); if (!reduce) for (const el of document.querySelectorAll('#fin-cv-world [data-node], #fin-cv-world [data-room]')) { if (el.closest('.fin-room-h')) continue; before.set(key(el), { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 }); }
  // each layout keeps the heights its own opened details measured (they are as wide as that layout makes them)
  UI.fin.detHBy = UI.fin.detHBy || {}; UI.fin.detHBy[UI.fin.cv.mode || 'rooms'] = UI.fin.detH; UI.fin.detH = UI.fin.detHBy[mode] || {};
  UI.fin.fwBy = UI.fin.fwBy || {}; UI.fin.fwBy[UI.fin.cv.mode || 'rooms'] = { ...FIN_W }; for (const k of Object.keys(FIN_W)) delete FIN_W[k]; Object.assign(FIN_W, UI.fin.fwBy[mode] || {});
  UI.fin.cv.mode = mode; try { localStorage.setItem('ar-fin-cv-mode', mode); } catch {}
  UI.fin.menu = null; UI.fin.cv.user = false; UI.fin.cv.fitted = false; finCvGlide(); render();
  if (reduce) return;
  const moved = [];
  for (const el of document.querySelectorAll('#fin-cv-world [data-node], #fin-cv-world [data-room]')) {
    if (el.closest('.fin-room-h')) continue;
    const b = before.get(key(el)), x = parseFloat(el.style.left) || 0, y = parseFloat(el.style.top) || 0;
    el.style.transition = 'none';
    if (b) el.style.transform = `translate(${b.x - x}px, ${b.y - y}px)`; else { el.style.opacity = '0'; el.style.transform = 'scale(.92)'; }
    moved.push(el);
  }
  for (const d of document.querySelectorAll('#fin-cv-world .fin-det, #fin-cv-world .fin-room-sub, #fin-cv-world .fin-res, #fin-cv-world .fin-flow, #fin-cv-world .fin-mind')) { d.style.transition = 'none'; d.style.opacity = '0'; moved.push(d); }
  void document.body.offsetWidth;
  requestAnimationFrame(() => {
    for (const el of moved) { el.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1), opacity .5s ease .15s'; el.style.transform = ''; el.style.opacity = ''; }
    setTimeout(() => { for (const el of moved) el.style.transition = ''; }, 900);
  });
}

/* --- cards lean toward the pointer (Flow) --- */
const FTL = { el: null, raf: 0, x: 0, y: 0 };
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || UI.fin.cv.mode !== 'flow' || UI.view !== 'finance') return;
  const c = e.target.closest && e.target.closest('.mode-flow #fin-cv-world .fin-leaf');
  if (FTL.el && FTL.el !== c) { FTL.el.style.removeProperty('--rx'); FTL.el.style.removeProperty('--ry'); FTL.el = null; }
  if (!c || e.buttons) return; FTL.el = c; FTL.x = e.clientX; FTL.y = e.clientY;
  if (!FTL.raf) FTL.raf = requestAnimationFrame(() => { FTL.raf = 0; const el = FTL.el; if (!el) return; const r = el.getBoundingClientRect(); const px = (FTL.x - r.left) / r.width - 0.5, py = (FTL.y - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', (-py * 6).toFixed(2) + 'deg'); el.style.setProperty('--ry', (px * 8).toFixed(2) + 'deg'); el.style.setProperty('--gx', Math.round((px + 0.5) * 100) + '%'); });
});

function finCvModeHTML() {
  const m = UI.fin.cv.mode || 'rooms', tip = { rooms: 'Rooms: every topic in its own room', flow: 'Flow: your money as a river, from income to goals', res: 'Reservoirs: each account a tank filled to its balance; income flows in from the top, pipes carry money out to spending, commitments and goals', mind: 'Mind map: My money in the centre, branches as thick as their money and coloured by health, money flowing along them' };
  return `<div class="seg fin-cv-modes" role="group" aria-label="Card layout">${[['rooms', '▦', 'Rooms'], ['flow', '✦', 'Flow'], ['res', '💧', 'Reservoirs'], ['mind', '🧠', 'Mind map']].map(([k, i, l]) => `<button data-act="fin-cv-mode" data-v="${k}" aria-pressed="${m === k}" title="${tip[k]} ( L )"><span aria-hidden="true">${i}</span> ${l}</button>`).join('')}</div>`;
}
Object.assign(ACT, { 'fin-cv-mode': el => finCvMode(el.dataset.v) });
Object.assign(window.__FIN, { mode: m => (m ? finCvMode(m) : UI.fin.cv.mode || 'rooms') });
