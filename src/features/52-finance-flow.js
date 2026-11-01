// Money canvas — the card layout "Rich Dad": your money as the financial statement of Rich Dad Poor Dad.
// An income statement (income beside expenses) above a balance sheet (assets — what puts money in your pocket —
// beside liabilities — what takes money out of it). Every card is marked for what it is: earned income, passive
// income, an asset, a liability, or a doodad (something bought that does not pay you back). Arrows show the cash
// flow live: your job and your assets feed income; income drains to expenses; liabilities drain to expenses;
// savings flow into assets. A scorecard tells your cash-flow pattern (poor, middle class, building, rich) and how far
// you are from leaving the rat race — when passive income covers every expense.
// Rooms, Flow and the Mind map are the other layouts; everything on the canvas works the same in all of them.

const FRD = { LM: 240, COL: 1260, GAP: 80, TOP: 760, NEXT: 760, HEAD: 92, FRAME: 70 };
const FIN_CV_MODES = ['rooms', 'flow', 'rich', 'mind'];
try { const m = localStorage.getItem('ar-fin-cv-mode'); if (FIN_CV_MODES.includes(m)) UI.fin.cv.mode = m; else if (m === 'res' || m === 'tree') UI.fin.cv.mode = 'rich'; } catch {}
try { indexedDB.deleteDatabase('ar-tree'); } catch {}

// what a card is, the Rich Dad way
function finRdKind(c, roomId) {
  const id = c.id || '', label = String(c.label || ''), passive = /interest|rent|dividend|profit|return|share|عائد|فائد|ايجار|إيجار|ارباح|أرباح/i;
  if (roomId === 'inc') { if (/none$/.test(id) || (c.cls || '').includes('tool')) return null; return id === 'in:salary' || !(id === 'in:cib' || passive.test(label)) ? 'earned' : 'passive'; }
  if (roomId === 'accts') { if (!id.startsWith('a:')) return null; const a = finAcct(id.slice(2)); return a && ['credit_card', 'bnpl'].includes(a.kind) ? 'liability' : 'asset'; }
  if (roomId === 'own') return id.startsWith('l:') ? 'liability' : id.startsWith('h:') && !/none$/.test(id) ? 'asset' : null;
  if (roomId === 'com') return /none$/.test(id) ? null : 'liability';
  if (roomId === 'exp') return id.startsWith('c:') && !/none$/.test(id) || id.startsWith('r:') ? 'expense' : null;
  if (roomId === 'buy' && id.startsWith('b:') && !/none$/.test(id)) return 'doodad';
  return null;
}
// the numbers behind the scorecard
function finRdNumbers() {
  const n = finNow(), root = finCvModel(), room = id => (root.children.find(b => b.id === id) || { children: [] }).children, leaves = list => list.flatMap(c => c.type === 'branch' ? leaves(c.children) : [c]);
  const amt = c => { const m = /(-?[\d,]+(?:\.\d+)?)/.exec(String(c.val || '').replace(/ /g, ' ')); return m ? Math.abs(parseFloat(m[1].replace(/,/g, ''))) || 0 : 0; };
  let passive = 0, earned = 0; for (const c of leaves(room('inc'))) { const k = finRdKind(c, 'inc'); if (k === 'passive') passive += amt(c); else if (k === 'earned') earned += amt(c); }
  const own = leaves(room('own')), assets = (n.cash || 0) + own.filter(c => finRdKind(c, 'own') === 'asset').reduce((s, c) => s + amt(c), 0);
  const liab = (n.card && n.card.owed || 0) + (n.halan && n.halan.owed || 0) + own.filter(c => finRdKind(c, 'own') === 'liability').reduce((s, c) => s + amt(c), 0);
  const expenses = (n.spending || 0) + (n.instMonthly || 0), income = n.income || passive + earned, save = Math.max(0, n.capacity || 0);
  const freedom = expenses > 0 ? Math.min(1, passive / expenses) : passive > 0 ? 1 : 0;
  const pattern = passive >= expenses && expenses > 0 ? 'rich' : (n.instMonthly || 0) >= income * 0.2 || liab > assets ? 'middle' : income > 0 && save < income * 0.1 ? 'poor' : 'building';
  return { n, passive, earned, assets, liab, expenses, income, save, freedom, pattern };
}
const FIN_RD_PATTERN = { rich: ['Rich', 'your assets pay for your life — passive income covers your expenses'], middle: ['Middle class', 'much of your income goes to liabilities — instalments and debt'], poor: ['Poor', 'income goes straight to expenses — little is left to buy assets'], building: ['Building', 'you save — now turn savings into assets that pay you every month'] };
// the scorecard, as a detail on the canvas
function finRdScoreHTML() {
  const R = finRdNumbers(), [pt, why] = FIN_RD_PATTERN[R.pattern], pct = Math.round(R.freedom * 100), need = Math.max(0, R.expenses - R.passive);
  return `<div class="fin-rd-score ${R.pattern}"><div class="fin-rd-pat"><span class="small muted">Your cash-flow pattern</span><b>${pt}</b><span class="small">${esc(why)}</span></div>
    <div class="fin-rd-free"><div class="row"><b>Out of the rat race</b><span class="spacer"></span><b class="num">${pct}%</b></div><div class="fin-rd-bar"><i style="width:${pct}%"></i></div>
      <span class="small muted">passive income ${fk(R.passive)} a month of ${fk(R.expenses)} expenses${need ? ` — ${fk(need)} a month more passive income and you are free` : ' — you are free'}</span></div></div>`
    + finKv([['Earned income', fk(R.earned), 'a month — you work for money'], ['Passive income', fk(R.passive), 'a month — money works for you'], ['Assets', fk(R.assets), 'put money in your pocket'], ['Liabilities', fk(R.liab), 'take money out of your pocket'], ['Saved toward assets', fk(R.save), 'a month']]);
}

function finRichLayout(rooms, plan, n) {
  const { PAD, CG, CW, CH } = FR, cards = [], dets = [], edges = [], subs = [], HEAD = FRD.HEAD;
  const grid = (list, x0, y, w) => {
    const per = Math.max(1, Math.floor((w + CG) / (CW + CG))), cw = per === 1 ? w : Math.floor((w - (per - 1) * CG) / per); let row = [];
    const flush = () => { if (!row.length) return; y += CH + CG; row = []; };
    for (const c of list) {
      if (c.type === 'branch') { flush(); subs.push({ id: c.id, label: `${c.icon} ${c.label}`, sum: c.sum, x: x0, y, w }); y += 34; grid(c.children, x0, y, w); y = subs.y2; continue; }
      c.x = x0 + row.length * (cw + CG); c.y = y; c.w = cw; c.h = CH; cards.push(c); row.push(c); if (row.length === per) flush();
    }
    flush(); subs.y2 = y; return [];
  };
  const fill = (r, x, y, w) => {
    r.x = x; r.y = y; r.w = w; r.cls = 'rich'; const x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD; const c0 = cards.length;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov' || r.kind === 'sec' || r.kind === 'rd') { const id = r.kind === 'ov' ? 'ov' : r.id, h = finDetH(id, r.kind === 'sec' ? 640 : r.kind === 'rd' ? 320 : 520); dets.push({ id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    for (let i = c0; i < cards.length; i++) { const k = finRdKind(cards[i], r.kind === 'goals' ? 'buy' : r.id); if (k && !(cards[i].cls || '').includes(' rd-')) cards[i].cls = (cards[i].cls || '') + ' rd-' + k; }
    return y + r.h;
  };
  // the scorecard is a room of its own here
  const rd = { id: 'rd', kind: 'rd', icon: '💼', title: 'Rich Dad scorecard', sum: FIN_RD_PATTERN[finRdNumbers().pattern][0] + ' pattern · how far from the rat race', hue: 45 };
  rooms = [...rooms.slice(0, 1), rd, ...rooms.slice(1)];
  const by = id => rooms.find(r => r.id === id), placed = new Set(), put = (r, ...a) => { if (!r) return null; placed.add(r.id); fill(r, ...a); return r; };
  const L0 = FRD.LM, C2 = L0 + FRD.COL + FRD.GAP, W = C2 + FRD.COL;
  // the top: My money · the scorecard · coming up
  const ov = put(by('ov'), L0, 0, FRD.TOP), sc = put(rd, L0 + FRD.TOP + 60, 0, W - L0 - FRD.TOP - FRD.NEXT - 120), nx = put(by('next'), W - FRD.NEXT, 0, FRD.NEXT);
  const topB = Math.max(...[ov, sc, nx].filter(Boolean).map(r => r.y + r.h), 0);
  // the income statement: income | expenses
  const y1 = topB + FRD.FRAME + 60, inc = put(by('inc'), L0, y1, FRD.COL), exp = put(by('exp'), C2, y1, FRD.COL);
  const isB = Math.max(inc ? inc.y + inc.h : y1, exp ? exp.y + exp.h : y1);
  // the balance sheet: assets (your accounts, what you own) | liabilities (commitments)
  const y2 = isB + FRD.FRAME + 150; let ya = y2, yl = y2;
  for (const r of [by('accts'), by('own')]) if (r) { put(r, L0, ya, FRD.COL); ya = r.y + r.h + 40; }
  for (const r of [by('com')]) if (r) { put(r, C2, yl, FRD.COL); yl = r.y + r.h + 40; }
  const bsB = Math.max(ya, yl) - 40;
  // below: your plans (goals) · others' money · anything else
  const y3 = bsB + 110, GX = L0 + FRD.COL + FRD.GAP + 520 + FRD.GAP; let yr = y3; const buy = rooms.find(r => r.kind === 'goals'); if (buy) put(buy, L0, y3, FRD.COL + FRD.GAP + 520);
  for (const r of rooms) if (!placed.has(r.id) && r.kind !== 'sec') { put(r, GX, yr, W - GX); yr = r.y + r.h + 40; }
  let y = Math.max(buy ? buy.y + buy.h : y3, yr) + 60;
  for (const r of rooms) if (r.kind === 'sec') { put(r, L0, y, W - L0); y = r.y + r.h + 44; }
  // the cash flow, as the book draws it
  const R = finRdNumbers(), max = Math.max(1, R.income, R.expenses), th = v => v > 0 ? Math.round(8 + 26 * Math.sqrt(v / max)) : 5, flows = [];
  const acc = by('accts'), com = by('com');
  if (inc) flows.push({ id: 'job', cls: 'earned', a: { x: 40, y: inc.y + 70 }, b: { x: inc.x, y: inc.y + 70 }, t: th(R.earned), label: [fk(R.earned), 'from your job'], job: true });
  if (inc && exp) flows.push({ id: 'spend', cls: 'expense', a: { x: inc.x + inc.w, y: inc.y + 70 }, b: { x: exp.x, y: exp.y + 70 }, t: th(R.expenses), label: [fk(R.expenses), 'to expenses'] });
  if (inc && acc) flows.push({ id: 'save', cls: 'save', a: { x: inc.x + inc.w * 0.3, y: inc.y + inc.h }, b: { x: acc.x + acc.w * 0.3, y: acc.y }, t: th(R.save), label: [fk(R.save), 'saved toward assets'], v: true });
  if (inc && acc) flows.push({ id: 'passive', cls: 'passive', a: { x: acc.x + acc.w * 0.72, y: acc.y }, b: { x: inc.x + inc.w * 0.72, y: inc.y + inc.h }, t: th(R.passive), label: [fk(R.passive), 'passive income from assets'], v: true });
  if (com && exp) flows.push({ id: 'debt', cls: 'liability', a: { x: com.x + com.w * 0.5, y: com.y }, b: { x: exp.x + exp.w * 0.5, y: exp.y + exp.h }, t: th(R.n.instMonthly || 0), label: [fk(R.n.instMonthly || 0), 'to liabilities'], v: true });
  const frames = [
    inc || exp ? { x: L0 - 30, y: y1 - FRD.FRAME, w: W - L0 + 60, h: isB - y1 + FRD.FRAME + 30, title: 'INCOME STATEMENT', cols: [[L0, 'Income — earned and passive'], [C2, 'Expenses']] } : null,
    { x: L0 - 30, y: y2 - FRD.FRAME, w: W - L0 + 60, h: bsB - y2 + FRD.FRAME + 30, title: 'BALANCE SHEET', cols: [[L0, 'Assets — put money in your pocket'], [C2, 'Liabilities — take money out of your pocket']] }].filter(Boolean);
  const w = W, h = Math.max(y - 44, 400);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('ov');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, rich: { flows, frames } };
}
// the statement frames and the cash-flow arrows, under the rooms
function finRichSVG(L) {
  const D = L.rich; if (!D) return '';
  let out = '';
  for (const f of D.frames) out += `<rect class="rd-frame" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="28"/><text class="rd-ft" x="${f.x + 30}" y="${f.y + 36}">${f.title}</text>${f.cols.map(([x, t]) => `<text class="rd-ct" x="${x}" y="${f.y + 60}">${esc(t)}</text>`).join('')}`;
  const curve = (a, b, v) => v ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}` : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
  for (const f of D.flows) {
    const d = curve(f.a, f.b, f.v), lx = f.v ? (f.a.x + f.b.x) / 2 + f.t / 2 + 16 : (f.a.x + f.b.x) / 2, ly = f.v ? (f.a.y + f.b.y) / 2 : f.a.y - f.t / 2 - 14;
    out += `<g class="rd-flow ${f.cls}"><path class="pipe" d="${d}" style="stroke-width:${f.t}px"/><path class="flow" d="${d}"/>
      ${f.job ? `<rect class="rd-job" x="${f.a.x - 30}" y="${f.a.y - 22}" width="150" height="44" rx="22"/><text class="rd-jobt" x="${f.a.x + 45}" y="${f.a.y + 6}" text-anchor="middle">💼 Your job</text>` : ''}
      <text class="rd-l" x="${f.job ? f.a.x - 30 : lx}" y="${f.job ? f.a.y - 40 : ly}" text-anchor="${f.v || f.job ? 'start' : 'middle'}">${esc(f.label[0])}<tspan class="per"> ${esc(f.label[1])}</tspan></text></g>`;
  }
  return `<svg class="fin-rich" width="${L.w}" height="${L.h}" aria-hidden="true">${out}</svg>`;
}

/* --- switching: every card moves from its place in one layout to its place in the other --- */
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
  for (const d of document.querySelectorAll('#fin-cv-world .fin-det, #fin-cv-world .fin-room-sub, #fin-cv-world .fin-rich, #fin-cv-world .fin-flow, #fin-cv-world .fin-mind')) { d.style.transition = 'none'; d.style.opacity = '0'; moved.push(d); }
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
  const m = UI.fin.cv.mode || 'rooms', tip = { rooms: 'Rooms: every topic in its own room', flow: 'Flow: your money as a river, from income to goals', rich: 'Rich Dad: your money as an income statement and a balance sheet — assets put money in your pocket, liabilities take it out', mind: 'Mind map: My money in the centre, branches as thick as their money and coloured by health, money flowing along them' };
  return `<div class="seg fin-cv-modes" role="group" aria-label="Card layout">${[['rooms', '▦', 'Rooms'], ['flow', '✦', 'Flow'], ['rich', '💼', 'Rich Dad'], ['mind', '🧠', 'Mind map']].map(([k, i, l]) => `<button data-act="fin-cv-mode" data-v="${k}" aria-pressed="${m === k}" title="${tip[k]} ( L )"><span aria-hidden="true">${i}</span> ${l}</button>`).join('')}</div>`;
}
Object.assign(ACT, { 'fin-cv-mode': el => finCvMode(el.dataset.v) });
Object.assign(window.__FIN, { mode: m => (m ? finCvMode(m) : UI.fin.cv.mode || 'rooms') });
