// Money canvas — the third card layout, "Flow": your money as one river from left to right.
// My money stays on top. Below it, where money comes from (income) flows into where it is (your accounts), and from
// there into where it goes (spending, commitments) and down into your goals; what needs attention, what you own and
// others' money sit on a rail on the right. Glowing ribbons join them, as thick as that money is per month, with
// particles running the way the money moves. Rooms are glass on a slowly moving night sky; cards tilt toward the
// pointer. Switching layouts (52-finance-flow.js) moves every card to its new place.

const FFL = { A: { x: 0, w: 320 }, B: { x: 470, w: 320 }, C: { x: 940, w: 400 }, D: { x: 1460, w: 332 }, TOP: 96, LANE: 120, HEAD: 102 };
const FIN_FLOW_COL = { inc: 'A', accts: 'B', exp: 'C', com: 'C', next: 'D', own: 'D', third: 'D' };

function finFlowLayout(rooms, plan, n) {
  const { PAD, CG, CW, CH } = FR, FULL = FR.FULL, cards = [], dets = [], edges = [], subs = [];
  // narrow lanes: the title, and its summary on up to three lines, need a taller header
  const headOf = r => r.w < 600 ? FFL.HEAD : FR.HEAD;
  // cards one under the other in a narrow room (as wide as the room), in rows where there is room for more
  const grid = (list, x0, y, w) => {
    const per = Math.max(1, Math.floor((w + CG) / (CW + CG))), cw = per === 1 ? w : CW; let row = [];
    const flush = () => { if (!row.length) return; y += CH + CG; row = []; };
    for (const c of list) {
      if (c.type === 'branch') { flush(); subs.push({ id: c.id, label: `${c.icon} ${c.label}`, sum: c.sum, x: x0, y, w }); y += 34; grid(c.children, x0, y, w); y = subs.y2; continue; }
      c.x = x0 + row.length * (cw + CG); c.y = y; c.w = cw; c.h = CH; cards.push(c); row.push(c); if (row.length === per) flush();
    }
    flush(); subs.y2 = y; return [];
  };
  const fill = (r, x, y, w) => {
    r.x = x; r.y = y; r.w = w; const HEAD = headOf(r), x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov') { const h = finDetH('ov', 420); dets.push({ id: 'ov', x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'sec') { const h = finDetH(r.id, 640); dets.push({ id: r.id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    return y + r.h;
  };
  const by = id => rooms.find(r => r.id === id);
  let y = 0;
  const ov = by('ov'); if (ov) y = fill(ov, 0, 0, FULL) + FFL.TOP;
  // the river: four lanes side by side
  const lanes = { A: [], B: [], C: [], D: [] }, rest = [];
  for (const r of rooms) {
    if (r.id === 'ov' || r.kind === 'goals' || r.kind === 'sec') continue;
    (lanes[FIN_FLOW_COL[r.id] || 'D'] || rest).push(r);
  }
  const riverTop = y, bottoms = {};
  for (const [k, list] of Object.entries(lanes)) { let yy = riverTop; for (const r of list) yy = fill(r, FFL[k].x, yy, FFL[k].w) + 40; bottoms[k] = yy - 40; }
  y = Math.max(riverTop, ...Object.values(bottoms)) + FFL.LANE;
  const buy = rooms.find(r => r.kind === 'goals'); if (buy) y = fill(buy, 0, y, FULL) + 60;
  for (const r of rooms) if (r.kind === 'sec') y = fill(r, 0, y, FULL) + 44;
  // the ribbons: how much flows each month
  const flows = [], lab = { A: 'Comes in', B: 'Where it is', C: 'Goes out', D: 'Watch & own' };
  const v = { inc: n.income || 0, exp: n.spending || 0, com: n.instMonthly || 0, save: Math.max(0, n.capacity || 0) }, max = Math.max(1, ...Object.values(v));
  const th = x => x > 0 ? Math.round(8 + 38 * Math.sqrt(x / max)) : 4;
  const span = (r, at) => Math.min(r.y + r.h - 24, r.y + headOf(r) + at);
  const inc = by('inc'), acc = by('accts'), exp = by('exp'), com = by('com');
  if (inc && acc) flows.push({ id: 'inc', a: { x: inc.x + inc.w, y: span(inc, 40) }, b: { x: acc.x, y: span(acc, 40) }, t: th(v.inc), h0: inc.hue, h1: acc.hue, amt: v.inc ? fk(v.inc) : '—', what: v.inc ? 'in a month' : 'income not known yet', empty: !v.inc });
  let off = 40;
  for (const [r, val, what] of [[exp, v.exp, 'spent a month'], [com, v.com, 'instalments a month']]) {
    if (!acc || !r) continue; const t = th(val);
    flows.push({ id: r.id, a: { x: acc.x + acc.w, y: span(acc, off) }, b: { x: r.x, y: span(r, 40) }, t, h0: acc.hue, h1: r.hue, amt: val ? fk(val) : '—', what: val ? what : 'none yet', empty: !val });
    off += Math.max(t, 10) + 70;
  }
  if (acc && buy) flows.push({ id: 'save', down: true, a: { x: acc.x + acc.w / 2, y: acc.y + acc.h }, b: { x: acc.x + acc.w / 2, y: buy.y }, t: th(v.save), h0: acc.hue, h1: buy.hue, amt: v.save ? fk(v.save) : '—', what: v.save ? 'a month to your goals' : 'nothing left to save yet', empty: !v.save });
  const heads = Object.entries(lanes).filter(([, l]) => l.length).map(([k]) => ({ x: FFL[k].x + 6, y: riverTop - 30, label: lab[k] }));
  const w = FULL, h = Math.max(y - 44, 200);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('ov');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, flows, heads };
}

// the ribbons, drawn under the rooms
function finFlowSVG(L) {
  if (!L.flows) return '';
  const col = h => `hsl(${h ?? 200} 80% 62%)`;
  const ribbon = f => {
    const t = f.t / 2;
    if (f.down) { const my = (f.a.y + f.b.y) / 2; return `M${f.a.x - t},${f.a.y} C${f.a.x - t},${my} ${f.b.x - t},${my} ${f.b.x - t},${f.b.y} L${f.b.x + t},${f.b.y} C${f.b.x + t},${my} ${f.a.x + t},${my} ${f.a.x + t},${f.a.y} Z`; }
    const mx = (f.a.x + f.b.x) / 2;
    return `M${f.a.x},${f.a.y - t} C${mx},${f.a.y - t} ${mx},${f.b.y - t} ${f.b.x},${f.b.y - t} L${f.b.x},${f.b.y + t} C${mx},${f.b.y + t} ${mx},${f.a.y + t} ${f.a.x},${f.a.y + t} Z`;
  };
  const mid = f => f.down ? `M${f.a.x},${f.a.y} C${f.a.x},${(f.a.y + f.b.y) / 2} ${f.b.x},${(f.a.y + f.b.y) / 2} ${f.b.x},${f.b.y}` : `M${f.a.x},${f.a.y} C${(f.a.x + f.b.x) / 2},${f.a.y} ${(f.a.x + f.b.x) / 2},${f.b.y} ${f.b.x},${f.b.y}`;
  return `<svg class="fin-flow" width="${L.w}" height="${L.h}" aria-hidden="true"><defs>${L.flows.map(f => `<linearGradient id="ffg-${f.id}" gradientUnits="userSpaceOnUse" x1="${f.a.x}" y1="${f.a.y}" x2="${f.b.x}" y2="${f.b.y}"><stop offset="0" stop-color="${col(f.h0)}"/><stop offset="1" stop-color="${col(f.h1)}"/></linearGradient>`).join('')}</defs>
    ${L.flows.map(f => `<g class="fin-flow-r ${f.empty ? 'empty' : ''}"><path class="glow" d="${ribbon(f)}" fill="url(#ffg-${f.id})" stroke="url(#ffg-${f.id})"/><path class="body" d="${ribbon(f)}" fill="url(#ffg-${f.id})"/>${f.empty ? '' : `<path class="dots" d="${mid(f)}" style="animation-duration:${Math.max(1.6, 5 - f.t / 12).toFixed(1)}s"/>`}
      ${finFlowLabel(f)}</g>`).join('')}
    ${(L.heads || []).map(h => `<text class="fin-flow-h" x="${h.x}" y="${h.y}">${esc(h.label)}</text>`).join('')}</svg>`;
}
// the amount and what it is, on two short lines: in the gap between two lanes (beside the ribbon going down)
function finFlowLabel(f) {
  const x = f.down ? f.a.x + f.t / 2 + 14 : f.a.x + 18, y = f.down ? (f.a.y + f.b.y) / 2 - 6 : Math.max(f.a.y, f.b.y) + f.t / 2 + 26;
  return `<text class="fin-flow-l" x="${x}" y="${y}"><tspan class="amt">${esc(f.amt)}</tspan><tspan class="what" x="${x}" dy="18">${esc(f.what)}</tspan></text>`;
}
// the night sky behind the Flow layout (it does not move with the canvas, so moving stays light)
const finFlowSky = () => '<div class="fin-flow-sky" aria-hidden="true"><i></i><i></i><i></i></div>';

