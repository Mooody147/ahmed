// Money canvas — the card layout "Mind map", built on the ideas of Rich Dad Poor Dad.
// In the centre: financial freedom — how much of your expenses passive income already covers (out of the rat race when
// it covers all of them), your cash-flow pattern, and the wealth moves that matter most now.
// Left, where money comes from and what makes it: earned income (you work for money), passive income (money works for
// you) and your assets (what puts money in your pocket — the ones that pay you, and the money that only sits).
// Right, where money goes: expenses, liabilities (what takes money out of your pocket — the card, Halan, instalments,
// debt) and your choices (goals and purchases — doodads unless they pay you back).
// The channels carry the money live, as thick as it is and as fast: your job and your assets feed you; savings flow
// into assets; expenses, debt and purchases drain. Two channels show what the book is about: assets paying you
// (passive income) and liabilities costing you every month; when your assets already pay a liability, a channel shows
// that too. Each channel says what share of your income it is. A change makes its branch pulse.
// Everything on the canvas works the same here: details, pop-outs, the card menu, editing, search, Tell the canvas.

const FMM = { GAPX: 430, GAPY: 54, W: 640, WIDE: 1120, CENTER: 900, HEAD: 92, OUT: 270 };
// a card's amount, from what it shows ("EGP 3,267", "owes EGP 7,960", "EGP 3,000/mo")
const finMindAmt = c => { const m = /(-?[\d,]+(?:\.\d+)?)/.exec(String(c.val || '').replace(/ /g, ' ')); return m ? Math.abs(parseFloat(m[1].replace(/,/g, ''))) || 0 : 0; };
const finPct = (v, of) => of > 0 ? Math.round(v / of * 100) : null;
const fkr = v => fk(Math.round(v)).replace(/\.00$/, '');   // whole pounds

// what a holding is, the Rich Dad way: an asset that pays you, or one that does not pay you yet
const finHoldPays = h => (+h.rate > 0 && +h.principal > 0) || +h.myShareMonthly > 0;

// the numbers behind the map: cash flow, assets that pay, idle money, debt, doodads, and the road to freedom
function finWealth() {
  const R = finRdNumbers(), n = R.n, p = finP(), plan = finBuyPlan();
  const mine = (p.holdings || []).filter(h => (!h.owner || h.owner === 'me') && h.kind !== 'liability');
  // the stated return of your assets that have one (a weighted average) — only from rates you entered
  const rated = mine.filter(h => +h.rate > 0 && +h.principal > 0 && (!h.currency || h.currency === p.base)), rp = rated.reduce((s, h) => s + +h.principal, 0);
  const yld = rp > 0 ? rated.reduce((s, h) => s + +h.principal * +h.rate, 0) / rp / 100 : null;
  // assets whose return already pays a liability (e.g. interest allocated to instalments): expected minus your share
  const payL = mine.filter(h => h.allocTo && +h.rate > 0 && +h.principal > 0).map(h => ({ h, amt: Math.max(0, +h.principal * +h.rate / 100 / 12 - (+h.myShareMonthly || 0)) })).filter(x => x.amt > 0);
  const payLiab = payL.reduce((s, x) => s + x.amt, 0);
  const idle = Math.max(0, n.free || 0), gap = Math.max(0, R.expenses - R.passive);
  // the next instalment to end: when it ends, its money can go to assets
  const ending = (n.inst || []).filter(i => i.status === 'active' && i.end).sort((a, b) => a.end < b.end ? -1 : 1)[0] || null;
  // the road to freedom — an estimate only when a rate is known: free cash invested now and the monthly surplus
  // invested every month, at your assets' stated average return; expenses and returns assumed to stay as they are
  let months = null;
  if (gap > 0 && yld) { const g2 = gap - idle * yld / 12, step = R.save * yld / 12; months = g2 <= 0 ? 0 : step > 0 ? Math.ceil(g2 / step) : null; }
  // of the monthly surplus, what goes to purchases and what is left to buy assets
  const toBuy = Math.min(R.save, plan.monthly || 0), toAssets = Math.max(0, R.save - toBuy);
  return { R, n, plan, yld, rated, payL, payLiab, idle, gap, ending, months, toBuy, toAssets, doodads: plan.items || [] };
}

// the centre: financial freedom, your pattern, your cash flow, and the moves that build wealth
function finFreeHTML() {
  const W = finWealth(), R = W.R, n = W.n, [pt, why] = FIN_RD_PATTERN[R.pattern], pct = Math.round(R.freedom * 100), C = 2 * Math.PI * 52;
  const ring = `<svg class="fin-free-ring" viewBox="0 0 128 128" aria-hidden="true"><circle cx="64" cy="64" r="52" class="bg"/><circle cx="64" cy="64" r="52" class="fg" style="stroke-dasharray:${(C * R.freedom).toFixed(1)} ${C.toFixed(1)}"/><text x="64" y="62" text-anchor="middle" class="p">${pct}%</text><text x="64" y="82" text-anchor="middle" class="s">free</text></svg>`;
  const years = W.months === null ? '' : W.months === 0 ? 'now, if your free cash were invested' : W.months > 600 ? 'more than 50 years at this pace' : W.months < 24 ? `in about ${W.months} months` : `in about ${(W.months / 12).toFixed(W.months < 120 ? 1 : 0)} years`;
  const moves = [];
  if (W.idle > 0) moves.push(['🏗️', 'Put idle money to work', `${fk(W.idle)} sits in your accounts beyond your ${fk(n.reserve)} safety reserve.${W.yld ? ` At your assets’ stated ${(W.yld * 100).toFixed(1)}% a year it would pay about ${fkr(W.idle * W.yld / 12)} a month (estimate).` : ' An asset that pays you would turn it into passive income.'}`, 'own']);
  if (R.save > 0) moves.push(['🌱', 'Pay yourself first', W.toBuy >= R.save ? `All of your ${fk(R.save)} monthly surplus is planned for purchases — nothing goes to assets. Send part of it to assets first; purchases can wait a little.` : `${fk(R.save)} a month is left after expenses and your goals${W.toBuy ? `; ${fk(W.toBuy)} of it is planned for purchases` : ''} — send ${fk(W.toAssets)} to assets before it turns into spending.`, 'forecast']);
  const owed = n.card && n.card.owed > 0 ? n.card.owed : 0;
  if (owed || n.instMonthly > 0) moves.push(['✂️', 'Cut liabilities', `${owed ? `The card owes ${fk(owed)}. ` : ''}${n.instMonthly > 0 ? `Instalments take ${fk(n.instMonthly)} a month (${finPct(n.instMonthly, R.income) ?? '—'}% of income). ` : ''}${W.ending ? `${W.ending.name} ends ${fmon(W.ending.end)} — send its ${fk(W.ending.amount)} to assets, not to new spending.` : ''}`, 'credit']);
  if (W.doodads.length) moves.push(['🛍️', 'Let assets buy your doodads', `${W.doodads.length} planned purchase${W.doodads.length === 1 ? '' : 's'} (${fk(W.plan.total)}) will not pay you back. The book’s rule: buy assets first, and let their income pay for the luxuries.`, 'buy']);
  moves.push(W.gap > 0 ? ['📈', 'Grow passive income', `${fk(W.gap)} a month more passive income covers every expense — then you are out of the rat race${years ? `: ${years} (estimate — assumes your surplus and free cash go to assets at today’s stated return, and expenses stay as they are)` : '. Enter what your assets earn (a rate) to see when.'}`, 'own'] : ['🏆', 'You are out of the rat race', 'Passive income covers your expenses. Keep buying assets before luxuries.', 'own']);
  if (W.payLiab > 0) moves.push(['🔁', 'Your assets already pay a liability', `${W.payL.map(x => x.h.name).join(', ')}: about ${fk(W.payLiab)} a month of the return goes to your instalments (estimate) — the rich let assets pay for liabilities.`, 'own']);
  const flow = [['Earned income', '+' + fk(R.earned), 'work'], ['Passive income', '+' + fk(R.passive), 'gold'], ['Expenses', '−' + fk(n.spending || 0), 'drain'], ['Instalments (liabilities)', '−' + fk(n.instMonthly || 0), 'debt'], ['Surplus → assets', fkr(W.toAssets), 'green']];
  const m = UI.fin.cv.mode || 'mind', views = `<div class="seg fin-free-views" role="group" aria-label="See your wealth map as">${[['mind', '🧠 Map'], ['rich', '💼 Statement']].map(([k, l]) => `<button class="btn sm" data-act="fin-cv-mode" data-v="${k}" aria-pressed="${m === k}">${l}</button>`).join('')}</div>`;
  return `<div class="fin-free ${R.pattern}">${views}
    <div class="fin-free-top">${ring}<div class="fin-free-pat"><span class="small muted">Your cash-flow pattern</span><b>${pt}</b><span class="small">${esc(why)}</span>
      <span class="small muted">Out of the rat race when passive income covers your expenses: ${fk(R.passive)} of ${fk(R.expenses)} a month.</span></div></div>
    <div class="fin-free-cf">${flow.map(([l, v, c]) => `<div class="${c}"><span>${esc(l)}</span><b class="num">${v}</b></div>`).join('')}<small class="muted">a month</small></div>
    <div class="fin-free-bs"><div class="asset"><span>Assets</span><b class="num">${fk(R.assets)}</b><small>put money in your pocket</small></div><div class="liab"><span>Liabilities</span><b class="num">${fk(R.liab)}</b><small>take money out of it</small></div></div>
    <h4>Wealth moves</h4><ol class="fin-moves">${moves.slice(0, 5).map(([i, t, w, s]) => `<li><span class="ic" aria-hidden="true">${i}</span><div><b>${esc(t)}</b><span class="small">${esc(w)}</span></div><button class="btn sm ghost" data-act="fin-cv-sec" data-s="${s}">Open</button></li>`).join('')}</ol>
    <div class="fin-free-key small muted"><i class="work"></i>earned <i class="gold"></i>passive <i class="green"></i>asset that pays <i class="cash"></i>cash <i class="idle"></i>asset not paying yet <i class="red"></i>liability <i class="exp"></i>expense <i class="doodad"></i>doodad</div>
  </div>`;
}

// the branches of the map: the Rich Dad statement, made of the canvas's own cards
function finMindRooms(rooms) {
  const by = id => rooms.find(r => r.id === id), kids = id => (by(id) && by(id).node ? by(id).node.children : []), W = finWealth(), R = W.R, n = W.n;
  const mark = (c, k) => { if (k && !(c.cls || '').includes(' rd-')) c.cls = (c.cls || '') + ' rd-' + k; return c; };
  const syn = (id, icon, title, sum, hue, sec, addId, children) => ({ id, kind: 'room', syn: true, node: { id, children }, icon, title, sum, hue, sec, addId });
  const inc = kids('inc'), isP = c => !(c.cls || '').includes('tool') && finRdKind(c, 'inc') === 'passive';
  const earned = inc.filter(c => !isP(c)).map(c => mark(c, finRdKind(c, 'inc'))), passive = inc.filter(isP).map(c => mark(c, 'passive'));
  const p = finP(), hold = id => (p.holdings || []).find(h => 'h:' + h.id === id);
  const assets = [...kids('accts').filter(c => !c.id.startsWith('a:') || finRdKind(c, 'accts') === 'asset').map(c => c.id.startsWith('a:') ? mark(c, 'asset rd-cash') : c),
    ...kids('own').filter(c => !c.id.startsWith('l:')).map(c => { const h = hold(c.id); return h ? mark(c, finHoldPays(h) ? 'asset' : 'asset rd-idle') : c; })];
  const liab = [...kids('accts').filter(c => c.id.startsWith('a:') && finRdKind(c, 'accts') === 'liability'), ...kids('com').filter(c => !/none$/.test(c.id)), ...kids('own').filter(c => c.id.startsWith('l:'))].map(c => mark(c, 'liability'));
  for (const c of kids('exp')) if (c.type !== 'branch') mark(c, finRdKind(c, 'exp')); else c.children.forEach(x => mark(x, 'expense'));
  const out = [];
  const has = (...ids) => ids.some(id => by(id));   // with one room in focus, only the branches made from it
  if (has('inc')) out.push(syn('mm-earn', '💼', 'Earned income', `${fk(R.earned)} a month · you work for money`, 210, 'inc', 'inc', earned));
  if (has('inc')) out.push(syn('mm-pass', '🌱', 'Passive income', R.passive ? `${fk(R.passive)} a month · money works for you` : 'none yet — buy assets that pay you', 45, 'own', null, passive));
  if (has('accts', 'own')) out.push(syn('mm-assets', '🏛️', 'Assets', `${fk(R.assets)} · put money in your pocket`, 150, 'accounts', 'accts', assets));
  const exp = by('exp'); if (exp) out.push({ ...exp, sum: `${fk(n.spending)} a month · ${finPct(n.spending, R.income) ?? '—'}% of income` });
  if (has('accts', 'com', 'own')) out.push(syn('mm-liab', '⛓️', 'Liabilities', `${fk(R.liab)} owed · ${fk(n.instMonthly)} a month · take money out of your pocket`, 0, 'credit', 'com', liab));
  const buy = by('buy'); if (buy) out.push({ ...buy, title: 'Your choices — goals & purchases', sum: W.doodads.length ? `${W.doodads.length} doodad${W.doodads.length === 1 ? '' : 's'} · ${fk(W.plan.total)} · assets first` : buy.sum });
  // your own boxes hang under the branch you put them on; the rest go under the map
  const used = new Set(['inc', 'accts', 'own', 'com', 'exp', 'buy']), ids = new Set(out.map(r => r.id)), boxes = new Map();
  for (const r of rooms) if (r.kind === 'box' && ids.has(r.branch)) { if (!boxes.has(r.branch)) boxes.set(r.branch, []); boxes.get(r.branch).push(r); used.add(r.id); }
  const rest = rooms.filter(r => !used.has(r.id));
  const left = new Set(['mm-earn', 'mm-pass', 'mm-assets']);
  return { side: { L: out.filter(r => left.has(r.id)), R: out.filter(r => !left.has(r.id)) }, rest, W, boxes };
}

function finMindLayout(rooms0, plan, n) {
  const { PAD, CG, CW, CH } = FR, cards = [], dets = [], edges = [], subs = [], HEAD = FMM.HEAD;
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
    r.x = x; r.y = y; r.w = w; r.cls = 'mind'; const x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD; const c0 = cards.length;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov' || r.kind === 'sec' || r.kind === 'free' || r.kind === 'box') { const id = r.kind === 'ov' ? 'ov' : r.id, h = finDetH(id, r.kind === 'sec' ? 640 : r.kind === 'free' ? 820 : r.kind === 'box' ? 360 : 520); dets.push({ id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    for (let i = c0; i < cards.length; i++) cards[i].room = r.id;
    if (r.kind === 'goals') for (let i = c0; i < cards.length; i++) { const k = finRdKind(cards[i], 'buy'); if (k && !(cards[i].cls || '').includes(' rd-')) cards[i].cls = (cards[i].cls || '') + ' rd-' + k; }
    return y + r.h;
  };
  const measure = r => { const c0 = cards.length, d0 = dets.length, s0 = subs.length, e0 = edges.length; fill(r, 0, 0, r.mw); cards.length = c0; dets.length = d0; subs.length = s0; edges.length = e0; return r.h; };
  const M = finMindRooms(rooms0), W = M.W, R = W.R;
  const center = { id: 'free', kind: 'free', icon: '🗽', title: 'Financial freedom', sum: `${FIN_RD_PATTERN[R.pattern][0]} pattern · ${Math.round(R.freedom * 100)}% out of the rat race`, hue: 45, mw: FMM.CENTER };
  // each side: its branches, each followed by the boxes you hung under it
  const stack = { L: M.side.L.flatMap(r => [r, ...(M.boxes.get(r.id) || [])]), R: M.side.R.flatMap(r => [r, ...(M.boxes.get(r.id) || [])]) };
  for (const s of ['L', 'R']) for (const r of stack[s]) { r.mw = r.kind === 'goals' ? FMM.WIDE : FMM.W; r.mh = measure(r); }
  const hgt = s => stack[s].reduce((t, r) => t + r.mh + FMM.GAPY, 0) - FMM.GAPY, leftW = Math.max(FMM.W, ...stack.L.map(r => r.mw)) + FMM.OUT;
  const ch = measure(center), colH = Math.max(hgt('L'), hgt('R'), ch), midY = colH / 2, cx0 = leftW + FMM.GAPX;
  fill(center, cx0, Math.round(midY - ch / 2), FMM.CENTER);
  for (const s of ['L', 'R']) {
    let y = Math.round(midY - hgt(s) / 2);
    for (const r of stack[s]) { fill(r, s === 'L' ? leftW - r.mw : cx0 + FMM.CENTER + FMM.GAPX, y, r.mw); r.side = s; y = r.y + r.h + FMM.GAPY; }
  }
  const W0 = cx0 + FMM.CENTER + FMM.GAPX + Math.max(FMM.W, ...stack.R.map(r => r.mw)) + FMM.OUT;
  // the rest — my money in detail, coming up, others' money, what Claude sorted — in a row below the map
  const rest = M.rest.filter(r => r.kind !== 'sec'), mapB = Math.max(...[center, ...stack.L, ...stack.R].map(r => r.y + r.h));
  let x = FMM.OUT, y = mapB + 260, rowH = 0;
  for (const r of rest) { const w = r.kind === 'ov' ? FMM.CENTER : r.kind === 'next' ? 760 : FMM.W; if (x + w > W0 - FMM.OUT && x > FMM.OUT) { x = FMM.OUT; y += rowH + 50; rowH = 0; } fill(r, x, y, w); x += w + 50; rowH = Math.max(rowH, r.h); }
  y += rowH + 80;
  for (const r of M.rest) if (r.kind === 'sec') { fill(r, FMM.OUT, y, W0 - 2 * FMM.OUT); y = r.y + r.h + 44; }
  const rooms = [center, ...stack.L, ...stack.R, ...M.rest];
  // a box joined to its branch by a thin line
  for (const [bid, list] of M.boxes) { let up = [...M.side.L, ...M.side.R].find(r => r.id === bid); if (up) for (const bx of list) { edges.push({ x0: bx.x + bx.w / 2, y0: up.y + up.h, x1: bx.x + bx.w / 2, y1: bx.y, cls: 'fin-twig calm tw2 box-link', title: `${up.title} → ${bx.title}` }); up = bx; } }

  // the channels: from the centre to each branch, as thick as the money on it a month, and the way the money goes
  const all = [...M.side.L, ...M.side.R], inc = R.income || 1, ins = id => all.find(r => r.id === id);
  const spendH = n.income > 0 ? (n.spending > n.income ? 'red' : n.spending > n.income * 0.8 ? 'amber' : 'green') : 'amber';
  const debtH = n.income > 0 ? (n.instMonthly > n.income * 0.35 ? 'red' : n.instMonthly > n.income * 0.2 ? 'amber' : 'green') : 'calm';
  const pc = v => finPct(v, inc), info = {
    'mm-earn': { m: R.earned, dir: 'in', health: 'work', line: 'you work for money' },
    'mm-pass': { m: R.passive, dir: 'in', health: 'gold', line: R.passive ? `money works for you · covers ${Math.round(R.freedom * 100)}% of expenses` : 'nothing yet — the goal' },
    'mm-assets': { m: W.toAssets, dir: 'out', health: W.toAssets > 0 ? 'green' : 'amber', line: (W.toAssets > 0 ? 'a month into assets' : 'into assets — purchases take all your surplus') + (W.idle ? ` · ${fk(W.idle)} idle` : '') },
    exp: { m: n.spending || 0, dir: 'out', health: spendH, line: `expenses · ${pc(n.spending) ?? '—'}% of income` },
    'mm-liab': { m: n.instMonthly || 0, dir: 'out', health: debtH === 'green' && R.liab > 0 ? 'amber' : debtH, line: `to debt · ${pc(n.instMonthly) ?? '—'}% of income` },
    buy: { m: plan.monthly || 0, dir: 'out', health: W.doodads.length ? 'amber' : 'green', line: W.doodads.length ? `put aside for doodads · assets first` : 'put aside for goals' },
  };
  const maxM = Math.max(1, ...all.map(r => (info[r.id] || {}).m || 0)), thick = v => v > 0 ? Math.round(8 + 30 * Math.sqrt(v / maxM)) : 5;
  const hot = new Set(); if (Date.now() < UI.fin.flash.until) { for (const c of cards) if (UI.fin.flash.ids.has(c.id)) hot.add(c.room); for (const r of all) if (UI.fin.flash.ids.has(r.id)) hot.add(r.id); }
  const C = { x: center.x, y: center.y, w: center.w, h: center.h };
  const main = all.map(r => {
    const I = info[r.id] || { m: 0, dir: 'none', health: 'calm', line: '' }, L = r.side === 'L', hub = { x: L ? r.x + r.w : r.x, y: r.y + 44 }, from = { x: L ? C.x : C.x + C.w, y: Math.min(C.y + C.h - 40, Math.max(C.y + 40, hub.y)) };
    return { id: r.id, a: from, b: hub, t: thick(I.m), health: I.health, dir: I.dir, label: [fk(I.m).replace(/\.00$/, ''), ' a month'], line: I.line, hot: hot.has(r.id), side: r.side };
  });
  // the channels the book is about: assets paying you, liabilities costing you, assets paying liabilities
  const cross = [], A = ins('mm-assets'), P = ins('mm-pass'), Lb = ins('mm-liab'), Ex = ins('exp');
  if (A && P) cross.push({ id: 'pays', cls: 'gold', side: 'L', a: { x: A.x, y: A.y + 50 }, b: { x: P.x, y: P.y + 50 }, t: thick(R.passive), label: R.passive ? [fk(R.passive), ' a month'] : ['—', ''], line: R.passive ? 'your assets pay you' : 'no asset pays you yet' });
  if (Lb && Ex) cross.push({ id: 'costs', cls: 'red', side: 'R', a: { x: Lb.x + Lb.w, y: Lb.y + 50 }, b: { x: Ex.x + Ex.w, y: Ex.y + 50 }, t: thick(n.instMonthly || 0), label: [fk(n.instMonthly || 0), ' a month'], line: 'your liabilities cost you' });
  // assets paying a liability: from the inner edge of Assets to the inner edge of Liabilities, dipping under the centre —
  // never across a box that hangs under either of them
  if (A && Lb && W.payLiab > 0) cross.push({ id: 'assetpays', cls: 'green under', a: { x: A.x + A.w, y: A.y + A.h - 36 }, b: { x: Lb.x, y: Lb.y + Lb.h - 36 }, low: mapB + 150, side: 'in', t: thick(W.payLiab), label: [fk(W.payLiab), ' a month'], line: 'your assets pay a liability (estimate)' });
  for (const r of all) {
    const L = r.side === 'L', hub = { x: L ? r.x + r.w - 9 : r.x + 9, y: r.y + FMM.HEAD - 2 }, own = cards.filter(c => c.room === r.id), mx = Math.max(1, ...own.map(finMindAmt)), h = (info[r.id] || {}).health || 'calm';
    // a comb along the box's inner edge: one trunk down from the title, a short rounded stub into each row of cards (the
    // card nearest the edge), as thick as the row's biggest amount — no line runs across other cards
    if (r.kind === 'goals') continue;   // your choices have their own links: from each money source to the goals it pays for
    const rows = new Map(); for (const c of own) { const key = Math.round(c.y); if (!rows.has(key)) rows.set(key, []); rows.get(key).push(c); }
    const ys = [...rows.keys()].sort((p, q) => p - q), R0 = 10;
    if (ys.length) {
      const lastY = ys[ys.length - 1] + own[0].h / 2;
      edges.push({ d: `M${hub.x},${hub.y} V${lastY - R0}`, cls: `fin-twig ${h} tw2 trunk`, title: `${r.title}` });
      for (const y0 of ys) {
        const row = rows.get(y0), near = row.reduce((p, q) => (L ? q.x + q.w > p.x + p.w : q.x < p.x) ? q : p), ym = y0 + near.h / 2, xe = L ? near.x + near.w : near.x, dir = L ? -1 : 1;
        const k = 1 + Math.round(3 * Math.sqrt(Math.max(...row.map(finMindAmt)) / mx));
        edges.push({ d: `M${hub.x},${Math.max(hub.y, ym - R0)} Q${hub.x},${ym} ${hub.x + dir * R0},${ym} H${xe}`, cls: `fin-twig ${h} tw${k}`, title: `${r.title} → ${row.map(c => c.label).join(', ')}` });
      }
    }
  }
  const w = W0, h = Math.max(y - 44, colH);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('free');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, mind: { main, cross } };
}

// the channels, drawn under the rooms: tapered, coloured by what they mean, with money running along them
function finMindSVG(L) {
  const M = L.mind; if (!M) return '';
  const curve = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };
  const taper = (a, b, t0, t1) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y - t0 / 2} C${mx},${a.y - t0 / 2} ${mx},${b.y - t1 / 2} ${b.x},${b.y - t1 / 2} L${b.x},${b.y + t1 / 2} C${mx},${b.y + t1 / 2} ${mx},${a.y + t0 / 2} ${a.x},${a.y + t0 / 2} Z`; };
  const speed = t => Math.max(1.2, 4.2 - t / 12).toFixed(1);
  const text = (x, y, lab, line, anchor) => `<text class="mm-l" x="${x}" y="${y}" text-anchor="${anchor || 'middle'}">${esc(lab[0])}<tspan class="per">${esc(lab[1])}</tspan></text>${line ? `<text class="mm-i" x="${x}" y="${y + 24}" text-anchor="${anchor || 'middle'}">${esc(line)}</text>` : ''}`;
  let out = '';
  for (const b of M.main) {
    const d = curve(b.a, b.b), dl = b.dir === 'in' ? curve(b.b, b.a) : d;
    out += `<g class="mm-branch ${b.health}${b.hot ? ' hot' : ''}" data-ch="${esc(b.id)}"><path class="limb" d="${taper(b.a, b.b, b.t + 6, Math.max(4, b.t * 0.55))}"/>`;
    if (b.dir !== 'none') out += `<path class="flow${b.dir === 'in' ? ' in' : ''}" d="${dl}" style="animation-duration:${speed(b.t)}s"/>`;
    out += text((b.a.x + b.b.x) / 2, (b.a.y + b.b.y) / 2 - b.t / 2 - 40, b.label, b.line) + `</g>`;
  }
  for (const c of M.cross) {
    let d, lx, ly, anchor = 'middle';
    if (c.low && c.side === 'in') { const k = Math.max(160, (c.b.x - c.a.x) * 0.22); d = `M${c.a.x},${c.a.y} C${c.a.x + k},${c.a.y} ${c.a.x + k},${c.low} ${(c.a.x + c.b.x) / 2},${c.low} S${c.b.x - k},${c.b.y} ${c.b.x},${c.b.y}`; lx = (c.a.x + c.b.x) / 2; ly = c.low - c.t / 2 - 40; }
    else if (c.low) { d = `M${c.a.x},${c.a.y} C${c.a.x},${c.low} ${c.b.x},${c.low} ${c.b.x},${c.b.y}`; lx = (c.a.x + c.b.x) / 2; ly = c.low - c.t / 2 - 50; }
    else { const L = c.side === 'L', o = L ? -(FMM.OUT - 110) : FMM.OUT - 110, ox = c.a.x + o; d = `M${c.a.x},${c.a.y} C${ox},${c.a.y} ${ox},${c.b.y} ${c.b.x},${c.b.y}`; lx = c.a.x + o * 0.75 + (L ? -1 : 1) * (c.t / 2 + 40); ly = (c.a.y + c.b.y) / 2; }
    // beside the outer channels the words run along the channel, so they stay on the canvas
    const words = c.low ? text(lx, ly, c.label, c.line, anchor) : `<g transform="translate(${lx},${ly}) rotate(${c.side === 'L' ? -90 : 90})">${text(0, 0, c.label, c.line, 'middle')}</g>`;
    out += `<g class="mm-cross ${c.cls}" data-ch="${esc(c.id)}"><path class="pipe" d="${d}" style="stroke-width:${c.t}px"/><path class="flow" d="${d}" style="animation-duration:${speed(c.t)}s"/>${words}</g>`;
  }
  return `<svg class="fin-mind" width="${L.w}" height="${L.h}" aria-hidden="true">${out}</svg>`;
}
