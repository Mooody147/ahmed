// Money canvas — the card layout "Mind map", with money flowing on it.
// My money is the centre; branches go out to the left and right like a classic mind map: accounts, income,
// spending, commitments, what you own, others' money, what is coming up, goals. Each main branch is as thick as that
// money is per month and coloured by its health (green fine, amber watch it, red needs you); the most urgent and the
// biggest sit at the top. Money moves on the branches: income flows in toward My money; spending, instalments and
// savings flow out — particles running the way the money goes, faster on bigger branches. Inside each branch a thin
// branch reaches every card, as thick as its amount. When something changes, its branch pulses brighter for a moment.
// Everything on the canvas works the same here: details, pop-outs, the card menu, editing, search, Tell the canvas.

const FMM = { GAPX: 300, GAPY: 46, W: 620, WIDE: 1120, NEXT: 720, CENTER: 820, HEAD: 92 };
// a card's amount, from what it shows ("EGP 3,267", "owes EGP 7,960", "EGP 3,000/mo")
const finMindAmt = c => { const m = /(-?[\d,]+(?:\.\d+)?)/.exec(String(c.val || '').replace(/ /g, ' ')); return m ? Math.abs(parseFloat(m[1].replace(/,/g, ''))) || 0 : 0; };

function finMindLayout(rooms, plan, n) {
  const { PAD, CG, CW, CH } = FR, cards = [], dets = [], edges = [], subs = [], HEAD = FMM.HEAD;
  const grid = (list, x0, y, w) => {
    const per = Math.max(1, Math.floor((w + CG) / (CW + CG))), cw = per === 1 ? w : Math.floor((w - (per - 1) * CG) / per); let row = [];
    const flush = () => { if (!row.length) return; y += CH + CG; row = []; };
    for (const c of list) {
      if (c.type === 'branch') { flush(); subs.push({ id: c.id, label: `${c.icon} ${c.label}`, sum: c.sum, x: x0, y, w }); y += 34; grid(c.children, x0, y, w); y = subs.y2; continue; }
      c.x = x0 + row.length * (cw + CG); c.y = y; c.w = cw; c.h = CH; c.room = c.room || null; cards.push(c); row.push(c); if (row.length === per) flush();
    }
    flush(); subs.y2 = y; return [];
  };
  const fill = (r, x, y, w) => {
    r.x = x; r.y = y; r.w = w; r.cls = 'mind'; const x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD; const c0 = cards.length;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov') { const h = finDetH('ov', 520); dets.push({ id: 'ov', x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'sec') { const h = finDetH(r.id, 640); dets.push({ id: r.id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    for (let i = c0; i < cards.length; i++) cards[i].room = r.id;
    return y + r.h;
  };
  // the centre: My money
  const ov = rooms.find(r => r.id === 'ov');
  const al = typeof finAlerts === 'function' ? finAlerts() : [], late = (plan.items || []).some(i => i.late);
  // how each branch is doing, and how much money moves on it a month
  const health = id => {
    if (id === 'next') return al.some(a => a.sev === 'crit') ? 'red' : al.some(a => a.sev === 'warn') ? 'amber' : 'green';
    if (id === 'exp') return n.income > 0 ? (n.spending > n.income ? 'red' : n.spending > n.income * 0.8 ? 'amber' : 'green') : 'amber';
    if (id === 'com') return n.income > 0 ? (n.instMonthly > n.income * 0.35 ? 'red' : n.instMonthly > n.income * 0.2 ? 'amber' : 'green') : 'green';
    if (id === 'accts') return (n.free ?? 0) < 0 ? 'red' : (n.free ?? 0) < (n.reserve || 0) ? 'amber' : 'green';
    if (id === 'inc') return n.income > 0 ? 'green' : 'amber';
    if (id === 'buy') return late ? 'amber' : 'green';
    return 'calm';
  };
  const money = id => id === 'inc' ? n.income : id === 'exp' ? n.spending : id === 'com' ? n.instMonthly : id === 'buy' ? Math.max(0, n.capacity || 0) : id === 'accts' ? Math.min(n.cash || 0, (n.income || 0) * 1.5 || n.cash || 0) : 0;
  const dir = id => id === 'inc' ? 'in' : ['exp', 'com', 'buy'].includes(id) ? 'out' : id === 'accts' ? 'both' : 'none';
  const rank = id => ({ red: 0, amber: 1, green: 2, calm: 3 })[health(id)];
  // every other room is a branch; sizes first, then each side stacked (the most urgent and biggest at the top)
  const branches = rooms.filter(r => r.kind !== 'ov' && r.kind !== 'sec').map(r => ({ r, w: r.kind === 'goals' ? FMM.WIDE : r.kind === 'next' ? FMM.NEXT : FMM.W }));
  for (const b of branches) { const c0 = cards.length, d0 = dets.length, s0 = subs.length, e0 = edges.length; fill(b.r, 0, 0, b.w); b.h = b.r.h; cards.length = c0; dets.length = d0; subs.length = s0; edges.length = e0; }
  branches.sort((a, b) => rank(a.r.id) - rank(b.r.id) || money(b.r.id) - money(a.r.id) || a.h - b.h);
  const sides = { R: [], L: [] }, hgt = { R: 0, L: 0 };
  for (const b of branches) { const s = hgt.R <= hgt.L ? 'R' : 'L'; sides[s].push(b); hgt[s] += b.h + FMM.GAPY; }
  const colH = Math.max(hgt.R, hgt.L) - FMM.GAPY, leftW = Math.max(0, ...sides.L.map(b => b.w)), cx0 = leftW + FMM.GAPX;
  let ovH = 0; if (ov) { const c0 = cards.length, d0 = dets.length, s0 = subs.length; fill(ov, cx0, 0, FMM.CENTER); ovH = ov.h; cards.length = c0; dets.length = d0; subs.length = s0; }
  const midY = Math.max(colH, ovH) / 2; if (ov) { const dy = Math.round(midY - ovH / 2); fill(ov, cx0, dy, FMM.CENTER); }
  const center = ov ? { x: ov.x, y: ov.y, w: ov.w, h: ov.h } : { x: cx0, y: midY - 60, w: FMM.CENTER, h: 120 };
  for (const s of ['R', 'L']) {
    let y = Math.round(midY - (hgt[s] - FMM.GAPY) / 2);
    for (const b of sides[s]) { const x = s === 'R' ? center.x + center.w + FMM.GAPX : leftW - b.w; fill(b.r, x, y, b.w); b.side = s; y = b.r.y + b.r.h + FMM.GAPY; }
  }
  const all = [...sides.R, ...sides.L];
  let y = Math.max(colH, ovH) + 80; const W = center.x + center.w + FMM.GAPX + Math.max(0, ...sides.R.map(b => b.w));
  for (const r of rooms) if (r.kind === 'sec') { fill(r, 0, y, W); y = r.y + r.h + 44; }
  // the branches: from My money to each room, and from each room's title to its cards
  const maxM = Math.max(1, ...all.map(b => money(b.r.id))), thick = v => v > 0 ? Math.round(8 + 30 * Math.sqrt(v / maxM)) : 5;
  const hot = new Set(); if (Date.now() < UI.fin.flash.until) for (const c of cards) if (UI.fin.flash.ids.has(c.id)) hot.add(c.room); for (const b of all) if (Date.now() < UI.fin.flash.until && UI.fin.flash.ids.has(b.r.id)) hot.add(b.r.id);
  const main = all.map(b => {
    const r = b.r, R = b.side === 'R', hub = { x: R ? r.x : r.x + r.w, y: r.y + 44 }, from = { x: R ? center.x + center.w : center.x, y: Math.min(center.y + center.h - 40, Math.max(center.y + 40, hub.y)) };
    const label = r.id === 'accts' ? (n.cash ? [fk(n.cash), ' cash now'] : null) : money(r.id) ? [fk(money(r.id)), ' a month'] : null;
    return { id: r.id, a: from, b: hub, t: thick(money(r.id)), health: health(r.id), dir: dir(r.id), label, hot: hot.has(r.id), side: b.side };
  });
  const twigs = [];
  for (const b of all) {
    const r = b.r, R = b.side === 'R', hub = { x: R ? r.x + 9 : r.x + r.w - 9, y: r.y + FMM.HEAD - 2 }, own = cards.filter(c => c.room === r.id), mx = Math.max(1, ...own.map(finMindAmt));
    // a thin branch to each card, drawn over the room and under the cards (as the canvas's links)
    for (const c of own) { const k = 1 + Math.round(3 * Math.sqrt(finMindAmt(c) / mx)); edges.push({ x0: hub.x, y0: hub.y, x1: R ? c.x : c.x + c.w, y1: c.y + c.h / 2, cls: `fin-twig ${health(r.id)} tw${k}`, title: `${r.title} → ${c.label}` }); }
  }
  const w = W, h = Math.max(y - 44, Math.max(colH, ovH));
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('ov');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, mind: { main, twigs } };
}

// the branches, drawn under the rooms: tapered, coloured by health, with money running along them
function finMindSVG(L) {
  const M = L.mind; if (!M) return '';
  const curve = (a, b) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`; };
  const taper = (a, b, t0, t1) => { const mx = (a.x + b.x) / 2; return `M${a.x},${a.y - t0 / 2} C${mx},${a.y - t0 / 2} ${mx},${b.y - t1 / 2} ${b.x},${b.y - t1 / 2} L${b.x},${b.y + t1 / 2} C${mx},${b.y + t1 / 2} ${mx},${a.y + t0 / 2} ${a.x},${a.y + t0 / 2} Z`; };
  let out = '';
  for (const b of M.main) {
    const d = curve(b.a, b.b), speed = Math.max(1.4, 4.2 - b.t / 12).toFixed(1);
    out += `<g class="mm-branch ${b.health}${b.hot ? ' hot' : ''}"><path class="limb" d="${taper(b.a, b.b, b.t + 6, Math.max(4, b.t * 0.55))}"/>`;
    if (b.dir === 'out' || b.dir === 'both') out += `<path class="flow" d="${d}" style="animation-duration:${speed}s"/>`;
    if (b.dir === 'in' || b.dir === 'both') out += `<path class="flow in" d="${curve(b.b, b.a)}" style="animation-duration:${speed}s"/>`;
    if (b.label) { const lx = (b.a.x + b.b.x) / 2, ly = (b.a.y + b.b.y) / 2 - b.t / 2 - 12; out += `<text class="mm-l" x="${lx}" y="${ly}" text-anchor="middle">${esc(b.label[0])}<tspan class="per">${esc(b.label[1])}</tspan></text>`; }
    out += `</g>`;
  }
  return `<svg class="fin-mind" width="${L.w}" height="${L.h}" aria-hidden="true">${out}</svg>`;
}
