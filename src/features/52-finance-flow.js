// Money canvas — the card layout "Rich Dad": your money as the financial statement of Rich Dad Poor Dad.
// An income statement (income beside expenses) above a balance sheet (assets — what puts money in your pocket —
// beside liabilities — what takes money out of it). Every card is marked for what it is: earned income, passive
// income, an asset, a liability, or a doodad (something bought that does not pay you back). Arrows show the cash
// flow live: your job and your assets feed income; income drains to expenses; liabilities drain to expenses;
// savings flow into assets. A scorecard tells your cash-flow pattern (poor, middle class, building, rich) and how far
// you are from leaving the rat race — when passive income covers every expense.
// Rooms, Flow and the Mind map are the other layouts; everything on the canvas works the same in all of them.

const FRD = { LM: 460, COL: 1260, GAP: 520, HEAD: 92, FRAME: 70 };   // room left of the columns for your job, and between them for the channels' words
const FIN_CV_MODES = ['mind', 'rich', 'flow'];
// the Mind map is the default; a saved Rooms (removed) opens the Mind map, a saved Reservoirs or Tree opens Rich Dad
UI.fin.cv.mode = 'mind';
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
  const n = finNow(), f0 = UI.fin.cv.focus; UI.fin.cv.focus = null; let root; try { root = finCvModel(); } finally { UI.fin.cv.focus = f0; }   // all of it, even when one room is in focus
  const room = id => (root.children.find(b => b.id === id) || { children: [] }).children, leaves = list => list.flatMap(c => c.type === 'branch' ? leaves(c.children) : [c]);
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
// Rich Dad and the Mind map are one wealth map seen two ways: the same branches (earned income, passive income, assets,
// expenses, liabilities, your choices), the same cards, the same centre (financial freedom) and the same channels.
// Here they are set out as the book's financial statement; switching moves every card to its place in the other.
function finRichLayout(rooms0, plan, n) {
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
    else if (r.kind === 'ov' || r.kind === 'sec' || r.kind === 'free' || r.kind === 'box') { const id = r.kind === 'ov' ? 'ov' : r.id, h = finDetH(id, r.kind === 'sec' ? 640 : r.kind === 'free' ? 760 : r.kind === 'box' ? 360 : 520); dets.push({ id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    if (r.kind === 'goals') for (let i = c0; i < cards.length; i++) { const k = finRdKind(cards[i], 'buy'); if (k && !(cards[i].cls || '').includes(' rd-')) cards[i].cls = (cards[i].cls || '') + ' rd-' + k; }
    return y + r.h;
  };
  const M = finMindRooms(rooms0), W = M.W, R = W.R, all = [...M.side.L, ...M.side.R], by = id => all.find(r => r.id === id);
  const center = { id: 'free', kind: 'free', icon: '🗽', title: 'Financial freedom', sum: `${FIN_RD_PATTERN[R.pattern][0]} pattern · ${Math.round(R.freedom * 100)}% out of the rat race`, hue: 45 };
  const L0 = FRD.LM, C2 = L0 + FRD.COL + FRD.GAP, Wd = C2 + FRD.COL, CWd = 1100;
  // the top: financial freedom
  fill(center, Math.round((L0 + Wd - CWd) / 2), 0, CWd);
  // the income statement: income (earned, then passive) | expenses
  // a column: its branches, each followed by the boxes you hung under it
  const bx = id => M.boxes.get(id) || [], col = (list, x, y) => { for (const r of list) if (r) { fill(r, x, y, FRD.COL); y = r.y + r.h + 40; } return y - 40; };
  const y1 = center.h + FRD.FRAME + 90, exp = by('exp');
  const isB = Math.max(col([by('mm-earn'), ...bx('mm-earn'), by('mm-pass'), ...bx('mm-pass')], L0, y1), col([exp, ...bx('exp')], C2, y1), y1);
  // the balance sheet: assets | liabilities
  const y2 = isB + FRD.FRAME + 170, A = by('mm-assets'), Lb = by('mm-liab');
  const bsB = Math.max(col([A, ...bx('mm-assets')], L0, y2), col([Lb, ...bx('mm-liab')], C2, y2), y2);
  // below: your choices; then the rest in a row; then opened parts
  let y = bsB + 120; const buy = by('buy'); if (buy) { fill(buy, L0, y, Wd - L0); y = buy.y + buy.h + 80; }
  for (const r of bx('buy')) { fill(r, L0, y, Wd - L0); y = r.y + r.h + 60; }
  let x = L0, rowH = 0;
  for (const r of M.rest.filter(r => r.kind !== 'sec')) { const w = r.kind === 'ov' ? 1100 : 640; if (x + w > Wd && x > L0) { x = L0; y += rowH + 50; rowH = 0; } fill(r, x, y, w); x += w + 50; rowH = Math.max(rowH, r.h); }
  y += rowH + 60;
  for (const r of M.rest) if (r.kind === 'sec') { fill(r, L0, y, Wd - L0); y = r.y + r.h + 44; }
  const rooms = [center, ...all, ...[...M.boxes.values()].flat(), ...M.rest];
  // the cash flow, as the book draws it — the same channels as on the Mind map
  const max = Math.max(1, R.income, R.expenses), th = v => v > 0 ? Math.round(8 + 26 * Math.sqrt(v / max)) : 5, flows = [], pc = v => finPct(v, R.income || 1);
  const E = by('mm-earn'), P = by('mm-pass');
  if (E) flows.push({ id: 'job', cls: 'earned', a: { x: 40, y: E.y + 70 }, b: { x: E.x, y: E.y + 70 }, t: th(R.earned), label: [fk(R.earned), ' a month'], line: 'from your job — you work for money', job: true });
  if (E && exp) flows.push({ id: 'spend', cls: 'expense', a: { x: E.x + E.w, y: E.y + 70 }, b: { x: exp.x, y: exp.y + 70 }, t: th(n.spending || 0), label: [fk(n.spending || 0), ' a month'], line: `to expenses · ${pc(n.spending) ?? '—'}% of income` });
  const up = P || E;
  if (up && A) flows.push({ id: 'save', cls: W.toAssets > 0 ? 'save' : 'save none', a: { x: up.x + up.w * 0.28, y: up.y + up.h }, b: { x: A.x + A.w * 0.28, y: A.y }, t: th(W.toAssets), label: [fk(W.toAssets).replace(/\.00$/, ''), ' a month'], line: W.toAssets > 0 ? 'into assets' : 'into assets — purchases take all your surplus', v: true });
  if (up && A) flows.push({ id: 'passive', cls: 'passive', a: { x: A.x + A.w * 0.72, y: A.y }, b: { x: up.x + up.w * 0.72, y: up.y + up.h }, t: th(R.passive), label: [fk(R.passive), ' a month'], line: R.passive ? 'your assets pay you' : 'no asset pays you yet', v: true });
  const expEnd = [exp, ...bx('exp')].filter(Boolean).pop();   // the bottom of the whole expenses column (recurring payments hang there)
  if (Lb && expEnd) flows.push({ id: 'debt', cls: 'liability', a: { x: Lb.x + Lb.w * 0.5, y: Lb.y }, b: { x: expEnd.x + expEnd.w * 0.5, y: expEnd.y + expEnd.h }, t: th(n.instMonthly || 0), label: [fk(n.instMonthly || 0), ' a month'], line: `your liabilities cost you · ${pc(n.instMonthly) ?? '—'}% of income`, v: true });
  if (A && Lb && W.payLiab > 0) flows.push({ id: 'assetpays', cls: 'save', a: { x: A.x + A.w, y: A.y + 70 }, b: { x: Lb.x, y: Lb.y + 70 }, t: th(W.payLiab), label: [fk(Math.round(W.payLiab)), ' a month'], line: 'your assets pay a liability (estimate)' });
  const frames = [
    E || exp ? { x: L0 - 30, y: y1 - FRD.FRAME, w: Wd - L0 + 60, h: isB - y1 + FRD.FRAME + 30, title: 'INCOME STATEMENT', cols: [[L0, 'Income — earned and passive'], [C2, 'Expenses']] } : null,
    { x: L0 - 30, y: y2 - FRD.FRAME, w: Wd - L0 + 60, h: bsB - y2 + FRD.FRAME + 30, title: 'BALANCE SHEET', cols: [[L0, 'Assets — put money in your pocket'], [C2, 'Liabilities — take money out of your pocket']] }].filter(Boolean);
  const w = Wd, h = Math.max(y - 44, 400);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('free');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, rich: { flows, frames } };
}
// the statement frames and the cash-flow channels, under the rooms
function finRichSVG(L) {
  const D = L.rich; if (!D) return '';
  let out = '';
  for (const f of D.frames) out += `<rect class="rd-frame" x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="28"/><text class="rd-ft" x="${f.x + 30}" y="${f.y + 36}">${f.title}</text>${f.cols.map(([x, t]) => `<text class="rd-ct" x="${x}" y="${f.y + 60}">${esc(t)}</text>`).join('')}`;
  const curve = (a, b, v) => v ? `M${a.x},${a.y} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y}` : `M${a.x},${a.y} C${(a.x + b.x) / 2},${a.y} ${(a.x + b.x) / 2},${b.y} ${b.x},${b.y}`;
  for (const f of D.flows) {
    const d = curve(f.a, f.b, f.v), lx = f.job ? f.a.x - 30 : f.v ? (f.a.x + f.b.x) / 2 + f.t / 2 + 16 : (f.a.x + f.b.x) / 2, ly = f.job ? f.a.y - 64 : f.v ? (f.a.y + f.b.y) / 2 - 8 : f.a.y - f.t / 2 - 38, anchor = f.v || f.job ? 'start' : 'middle';
    out += `<g class="rd-flow ${f.cls}" data-ch="${esc(f.id)}"><path class="pipe" d="${d}" style="stroke-width:${f.t}px"/><path class="flow" d="${d}"/>
      ${f.job ? `<rect class="rd-job" x="${f.a.x - 30}" y="${f.a.y - 22}" width="150" height="44" rx="22"/><text class="rd-jobt" x="${f.a.x + 45}" y="${f.a.y + 6}" text-anchor="middle">💼 Your job</text>` : ''}
      <text class="rd-l" x="${lx}" y="${ly}" text-anchor="${anchor}">${esc(f.label[0])}<tspan class="per">${esc(f.label[1])}</tspan></text>${f.line ? `<text class="rd-i" x="${lx}" y="${ly + 22}" text-anchor="${anchor}">${esc(f.line)}</text>` : ''}</g>`;
  }
  return `<svg class="fin-rich" width="${L.w}" height="${L.h}" aria-hidden="true">${out}</svg>`;
}

/* --- switching: every card moves from its place in one layout to its place in the other --- */
function finCvMode(mode) {
  mode = FIN_CV_MODES.includes(mode) ? mode : 'mind'; if ((UI.fin.cv.mode || 'mind') === mode) return;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } })();
  const key = el => (el.dataset.room ? 'r:' : 'n:') + (el.dataset.room || el.dataset.node);
  const before = new Map(); if (!reduce) for (const el of document.querySelectorAll('#fin-cv-world [data-node], #fin-cv-world [data-room]')) { if (el.closest('.fin-room-h')) continue; before.set(key(el), { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 }); }
  // each layout keeps the heights its own opened details measured (they are as wide as that layout makes them)
  UI.fin.detHBy = UI.fin.detHBy || {}; UI.fin.detHBy[UI.fin.cv.mode || 'mind'] = UI.fin.detH; UI.fin.detH = UI.fin.detHBy[mode] || {};
  UI.fin.fwBy = UI.fin.fwBy || {}; UI.fin.fwBy[UI.fin.cv.mode || 'mind'] = { ...FIN_W }; for (const k of Object.keys(FIN_W)) delete FIN_W[k]; Object.assign(FIN_W, UI.fin.fwBy[mode] || {});
  UI.fin.cv.mode = mode; try { localStorage.setItem('ar-fin-cv-mode', mode); } catch {}
  // the card you had open stays open and comes into view in the other layout (the Mind map and Rich Dad share every card)
  const keep = UI.fin.pop; if (keep) setTimeout(() => { if (UI.fin.cvPos && UI.fin.cvPos.get(keep) && UI.fin.cv.mode === mode) { UI.fin.pop = keep; finCvGoto(keep); render(); } }, reduce ? 50 : 780);
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
  const m = UI.fin.cv.mode || 'mind', tip = { mind: 'Mind map: financial freedom in the centre; where money comes from on the left (earned, passive, assets), where it goes on the right (expenses, liabilities, your choices); live channels between them',
    rich: 'Rich Dad: the same map as a financial statement — an income statement above a balance sheet; switching moves every card to its place', flow: 'Flow: your money as a river, from income to goals' };
  return `<div class="seg fin-cv-modes" role="group" aria-label="Card layout">${[['mind', '🧠', 'Mind map'], ['rich', '💼', 'Rich Dad'], ['flow', '✦', 'Flow']].map(([k, i, l]) => `<button data-act="fin-cv-mode" data-v="${k}" aria-pressed="${m === k}" title="${tip[k]} ( L )"><span aria-hidden="true">${i}</span> ${l}</button>`).join('')}</div>`;
}
Object.assign(ACT, { 'fin-cv-mode': el => finCvMode(el.dataset.v) });
Object.assign(window.__FIN, { mode: m => (m ? finCvMode(m) : UI.fin.cv.mode || 'mind') });
