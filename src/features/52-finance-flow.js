// Money canvas — the second card layout, "Tree": your money as a living tree.
// Above the ground: your accounts are the trunk; branches carry money out to spending (left) and commitments (right);
// the crown holds your goals and purchases — the fruit. Below the ground the roots reach into what feeds the tree:
// your income and what you own. My money and what is coming up stand beside the tree as its signpost. Gold sap
// (particles) runs up the roots and out along the branches, the way the money moves; each root and branch is as
// thick as that money is per month. Daylight colours: a soft sky, grass and warm soil.
// Easy to read: it is wide rather than tall, with two cards to a row, so Fit shows the whole tree large; zoomed out,
// cards show only their name and figure in big type and room titles grow (zoom in for everything).
// Rooms (the first layout) is unchanged; everything on the canvas works the same in both.

const FTR = { SIGN: 700, GAP: 100, CROWN: 1120, BR: 580, TRUNK: 580, ROOT: 600, HEAD: 92, SKY: 100, SOIL: 140, ARM: 210, TOP: 110 };
const FIN_CV_MODES = ['rooms', 'flow', 'tree'];
try { const m = localStorage.getItem('ar-fin-cv-mode'); if (FIN_CV_MODES.includes(m)) UI.fin.cv.mode = m; } catch {}

function finTreeLayout(rooms, plan, n) {
  const { PAD, CG, CW } = FR, CH = 66, cards = [], dets = [], edges = [], subs = [];   // a little taller: name over figure in big type when zoomed out
  const grid = (list, x0, y, w) => {
    const per = Math.max(1, Math.floor((w + CG) / (CW + CG))), cw = per === 1 ? w : Math.floor((w - (per - 1) * CG) / per); let row = [];
    const flush = () => { if (!row.length) return; y += CH + CG; row = []; };
    for (const c of list) {
      if (c.type === 'branch') { flush(); subs.push({ id: c.id, label: `${c.icon} ${c.label}`, sum: c.sum, x: x0, y, w }); y += 34; grid(c.children, x0, y, w); y = subs.y2; continue; }
      c.x = x0 + row.length * (cw + CG); c.y = y; c.w = cw; c.h = CH; cards.push(c); row.push(c); if (row.length === per) flush();
    }
    flush(); subs.y2 = y; return [];
  };
  const fill = (r, x, y, w, cls) => {
    r.x = x; r.y = y; r.w = w; r.cls = cls || ''; const HEAD = FTR.HEAD, x0 = x + PAD, iw = w - 2 * PAD; let yy = y + HEAD;
    if (UI.fin.cvCol.has(r.id)) r.h = HEAD + 6;
    else if (r.kind === 'ov') { const h = finDetH('ov', 520); dets.push({ id: 'ov', x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'sec') { const h = finDetH(r.id, 640); dets.push({ id: r.id, x: x0, y: yy, w: iw, h }); r.h = yy + h + PAD - y; }
    else if (r.kind === 'next') { yy = finNextLayout(r, x0, yy, iw, cards, dets, subs, grid); r.h = yy + PAD - y; }
    else if (r.kind === 'goals') { yy = finGoalsLayout(r, plan, n, x0, yy, iw, cards, dets, edges, subs, grid); r.h = yy + PAD - y; }
    else { grid(r.node.children, x0, yy, iw); r.h = Math.max(subs.y2 - CG, y + HEAD + 20) + PAD - y; }
    return y + r.h;
  };
  const by = id => rooms.find(r => r.id === id), placed = new Set(), put = (r, ...a) => { if (!r) return null; placed.add(r.id); fill(r, ...a); return r; };
  // the signpost on the left: My money, then what is coming up
  const SX = 0, TX = FTR.SIGN + FTR.GAP;                         // the tree starts right of the signpost
  // My money on the left of the tree, what is coming up on its right: wide rather than tall, so Fit shows it large
  const ov = put(by('ov'), SX, 40, FTR.SIGN, 'sign');
  // the tree: crown, branches, trunk
  const TW = FTR.BR * 2 + FTR.TRUNK + 2 * FTR.ARM, cx = TX + TW / 2;
  const buy = rooms.find(r => r.kind === 'goals'); if (buy) put(buy, cx - FTR.CROWN / 2, FTR.TOP, FTR.CROWN, 'crown');
  const crownB = buy ? buy.y + buy.h : FTR.TOP, brY = crownB + FTR.SKY;
  const left = [by('exp'), ...rooms.filter(r => (r.id === 'q' || r.id === 'auto'))].filter(Boolean), right = [by('com'), by('third')].filter(Boolean);
  let ly = brY; for (const r of left) { put(r, TX, ly, FTR.BR, 'branch'); ly = r.y + r.h + 36; }
  let ry = brY; for (const r of right) { put(r, TX + TW - FTR.BR, ry, FTR.BR, 'branch'); ry = r.y + r.h + 36; }
  // the trunk just under the crown; the ground under whichever is lowest
  const acc = put(by('accts'), cx - FTR.TRUNK / 2, brY + 120, FTR.TRUNK, 'trunk');
  const nx = put(by('next'), TX + TW + FTR.GAP, 40, FTR.SIGN, 'sign'), signB = Math.max(ov ? ov.y + ov.h : 0, nx ? nx.y + nx.h : 0);
  const G = Math.max(acc ? acc.y + acc.h + 80 : 0, ly + 30, ry + 30);
  // below the ground: the roots
  const ru = [by('inc'), by('own')].filter(Boolean), RY = G + FTR.SOIL; let rootB = RY;
  ru.forEach((r, i) => { const x = ru.length === 1 ? cx - FTR.ROOT / 2 : i === 0 ? cx - FTR.ROOT - 50 : cx + 50; put(r, x, RY, FTR.ROOT, 'root'); rootB = Math.max(rootB, r.y + r.h); });
  // anything else (new rooms) beside the roots; parts opened as rooms at the very bottom, full width
  let ox = TX; const others = rooms.filter(r => !placed.has(r.id) && r.kind !== 'sec');
  for (const r of others) { put(r, ox, Math.max(rootB, signB) + 60, FTR.BR, 'root'); ox += FTR.BR + 40; rootB = Math.max(rootB, r.y + r.h); }
  const W = TX + TW + (nx ? FTR.GAP + FTR.SIGN : 0); let y = Math.max(rootB, signB) + 70;
  for (const r of rooms) if (r.kind === 'sec') y = put(r, 0, y, W, 'cellar').y + r.h + 44;
  // the sap: roots up into the trunk, branches out of it, up into the crown
  const v = { inc: n.income || 0, exp: n.spending || 0, com: n.instMonthly || 0, save: Math.max(0, n.capacity || 0) }, max = Math.max(1, ...Object.values(v));
  const th = x => x > 0 ? Math.round(16 + 54 * Math.sqrt(x / max)) : 10;
  const flows = [], inc = by('inc'), own = by('own'), exp = by('exp'), com = by('com');
  if (acc) {
    if (inc) flows.push({ id: 'inc', kind: 'root', a: { x: inc.x + inc.w / 2, y: inc.y }, b: { x: cx - 40, y: G - 10 }, t: th(v.inc), amt: v.inc ? fk(v.inc) : '—', what: v.inc ? 'comes in a month' : 'income not known yet', empty: !v.inc });
    if (own) flows.push({ id: 'own', kind: 'root', a: { x: own.x + own.w / 2, y: own.y }, b: { x: cx + 40, y: G - 10 }, t: 18, amt: '', what: 'what you own', empty: false, still: true });
    if (exp) flows.push({ id: 'exp', kind: 'branch', a: { x: acc.x + 30, y: acc.y + Math.min(acc.h - 40, 150) }, b: { x: exp.x + exp.w - 16, y: exp.y + Math.min(exp.h - 40, 120) }, t: th(v.exp), amt: v.exp ? fk(v.exp) : '—', what: v.exp ? 'spent a month' : 'none yet', empty: !v.exp });
    if (com) flows.push({ id: 'com', kind: 'branch', a: { x: acc.x + acc.w - 30, y: acc.y + Math.min(acc.h - 40, 150) }, b: { x: com.x + 16, y: com.y + Math.min(com.h - 40, 120) }, t: th(v.com), amt: v.com ? fk(v.com) : '—', what: v.com ? 'instalments a month' : 'none yet', empty: !v.com });
    if (buy) flows.push({ id: 'save', kind: 'up', a: { x: cx, y: acc.y + 10 }, b: { x: cx, y: crownB - 10 }, t: th(v.save), amt: v.save ? fk(v.save) : '—', what: v.save ? 'a month to your goals' : 'nothing left to save yet', empty: !v.save });
  }
  const w = W, h = Math.max(y - 44, G + 400);
  UI.fin.cvPos = new Map([...rooms.map(r => [r.id, { x: r.x, y: r.y, w: r.w, h: r.h }]), ...cards.map(c => [c.id, { x: c.x, y: c.y, w: c.w, h: c.h }]), ...dets.map(d => [d.id + ':det', d])]);
  UI.fin.cvRoot = UI.fin.cvPos.get('ov');
  UI.fin.cvRoomsList = rooms.map(r => ({ id: r.id, kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, hue: r.hue, icon: r.icon, title: r.title }));
  return { rooms, cards, dets, edges, subs, w, h, flows, tree: { G, cx, TX, TW, crown: buy ? { x: buy.x, y: buy.y, w: buy.w, h: buy.h } : null, acc: acc ? { x: acc.x, y: acc.y, w: acc.w, h: acc.h } : null, signB } };
}

/* --- drawing the tree: a real one, under the rooms (it moves with the canvas) ---
   A trunk that widens into buttress roots at the ground, round shading and bark grain; main limbs that run up into a
   dense crown of thousands of small leaves in many greens, lit from the top left; side branches with twigs and leaf
   sprays that hold spending and commitments; roots that fork into fine rootlets in layered, grainy soil; grass blades
   at the ground. The same every time (a seeded random) and kept until the layout changes, so moving stays light. */
function finRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FTREE = { key: '', svg: '' };
function finTreeSVG(L) {
  const T = L.tree; if (!T) return '';
  const key = JSON.stringify([L.w, L.h, T, (L.flows || []).map(f => [f.id, f.a, f.b, f.t, f.amt, f.what, f.empty])]);
  if (FTREE.key === key) return FTREE.svg;
  const R = finRng(20261101), rnd = (a, b) => a + (b - a) * R(), pick = arr => arr[Math.floor(R() * arr.length)], f1 = v => Math.round(v * 10) / 10;
  const { G, cx } = T, cr = T.crown, ac = T.acc, W = L.w;
  const ccx = cr ? cr.x + cr.w / 2 : cx, ccy = cr ? cr.y + cr.h / 2 : G - 900, RX = cr ? cr.w / 2 + 150 : 500, RY = cr ? cr.h / 2 + 130 : 360;
  const topY = cr ? cr.y + cr.h + 30 : (ac ? ac.y - 80 : G - 600);
  // leaves: a tile of small leaves, repeated (seamless at its edges)
  const leafTile = (id, size, n, palette, rx0, rx1) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const x = rnd(0, size), y = rnd(0, size), rx = rnd(rx0, rx1), ry = rx * rnd(0.38, 0.55), a = rnd(0, 180), c = pick(palette);
      for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { const X = x + dx, Y = y + dy; if (X < -rx1 || X > size + rx1 || Y < -rx1 || Y > size + rx1) continue; out += `<ellipse cx="${f1(X)}" cy="${f1(Y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${Math.round(a)} ${f1(X)} ${f1(Y)})" fill="${c}"/>`; }
    }
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${out}</pattern>`;
  };
  // an irregular rounded clump
  const blob = (x, y, r, k = 20) => { const pts = Array.from({ length: k }, (_, i) => { const a = (i / k) * Math.PI * 2, rr = r * rnd(0.8, 1.12); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.92]; });
    let d = `M${f1((pts[0][0] + pts[k - 1][0]) / 2)},${f1((pts[0][1] + pts[k - 1][1]) / 2)}`; for (let i = 0; i < k; i++) { const p = pts[i], q = pts[(i + 1) % k]; d += ` Q${f1(p[0])},${f1(p[1])} ${f1((p[0] + q[0]) / 2)},${f1((p[1] + q[1]) / 2)}`; } return d + 'Z'; };
  // a limb (branch or root): thick where it starts, thin where it ends, along a gentle curve
  const limb = (a, b, t0, t1, bend = 0) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const m1 = { x: a.x + dx / 3 + nx * bend, y: a.y + dy / 3 + ny * bend }, m2 = { x: a.x + dx * 2 / 3 + nx * bend * 0.6, y: a.y + dy * 2 / 3 + ny * bend * 0.6 };
    const P = (q, s, t) => `${f1(q.x + nx * t * s)},${f1(q.y + ny * t * s)}`, ta = (t0 * 2 + t1) / 3, tb = (t0 + t1 * 2) / 3;
    return `M${P(a, 1, t0 / 2)} C${P(m1, 1, ta / 2)} ${P(m2, 1, tb / 2)} ${P(b, 1, t1 / 2)} L${P(b, -1, t1 / 2)} C${P(m2, -1, tb / 2)} ${P(m1, -1, ta / 2)} ${P(a, -1, t0 / 2)} Z`;
  };
  const centre = (a, b, bend = 0) => { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; return `M${f1(a.x)},${f1(a.y)} C${f1(a.x + dx / 3 + nx * bend)},${f1(a.y + dy / 3 + ny * bend)} ${f1(a.x + dx * 2 / 3 + nx * bend * 0.6)},${f1(a.y + dy * 2 / 3 + ny * bend * 0.6)} ${f1(b.x)},${f1(b.y)}`; };
  // fine roots: forks from a root, then hairs from the forks
  const rootlets = (a, b, t, depth) => {
    let out = ''; if (depth > 2) return out;
    const n = depth === 0 ? 5 : 2;
    for (let i = 0; i < n; i++) {
      const q = rnd(0.25, 0.9), p = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q }, side = R() < 0.5 ? -1 : 1, len = (depth === 0 ? rnd(110, 240) : rnd(50, 120));
      const ang = Math.atan2(b.y - a.y, b.x - a.x) + side * rnd(0.5, 1.1), e = { x: p.x + Math.cos(ang) * len, y: Math.max(G + 30, p.y + Math.abs(Math.sin(ang)) * len * 0.9 + 20) };
      const w = Math.max(1.2, t * (depth === 0 ? 0.32 : 0.45));
      out += `<path class="rootlet" d="${limb(p, e, w, 0.8, side * rnd(8, 24))}"/>` + rootlets(p, e, w, depth + 1);
    }
    return out;
  };
  const pal = { back: ['#24461b', '#2c5421', '#335f26', '#2a4d1f'], mid: ['#3f7a2b', '#4a8a33', '#55963a', '#3a6f28', '#5fa040', '#4d8233'], light: ['#78b552', '#86c25c', '#6aa947', '#93cd66', '#a2d675', '#7dbb57'] };
  const defs = `<defs>
    <linearGradient id="ftBark" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2b1d12"/><stop offset=".22" stop-color="#4f3825"/><stop offset=".42" stop-color="#6e5136"/><stop offset=".6" stop-color="#5a412b"/><stop offset=".85" stop-color="#3a2919"/><stop offset="1" stop-color="#22170e"/></linearGradient>
    <linearGradient id="ftRoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4b3423"/><stop offset="1" stop-color="#2e2015"/></linearGradient>
    <linearGradient id="ftSoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4d34"/><stop offset=".08" stop-color="#5d4230"/><stop offset=".4" stop-color="#4b3526"/><stop offset="1" stop-color="#2f2219"/></linearGradient>
    <linearGradient id="ftTurf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7d33"/><stop offset=".5" stop-color="#3f652a"/><stop offset="1" stop-color="#5d4230"/></linearGradient>
    <radialGradient id="ftShade" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fffbe0" stop-opacity=".22"/><stop offset=".45" stop-color="#fffbe0" stop-opacity="0"/><stop offset=".8" stop-color="#0d2208" stop-opacity=".18"/><stop offset="1" stop-color="#0d2208" stop-opacity=".38"/></radialGradient>
    <radialGradient id="ftStone" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9a948a"/><stop offset="1" stop-color="#4d4842"/></radialGradient>
    ${leafTile('ftLeafB', 150, 70, pal.back, 9, 17)}${leafTile('ftLeafM', 140, 80, pal.mid, 8, 15)}${leafTile('ftLeafL', 130, 60, pal.light, 7, 13)}
    <pattern id="ftGrain" width="70" height="70" patternUnits="userSpaceOnUse">${Array.from({ length: 46 }, () => `<circle cx="${f1(rnd(0, 70))}" cy="${f1(rnd(0, 70))}" r="${f1(rnd(0.6, 2))}" fill="${pick(['#8a6a4c', '#3a291c', '#9b7d5d', '#2c1f15', '#77593f'])}" opacity="${f1(rnd(0.3, 0.8))}"/>`).join('')}</pattern>
    <pattern id="ftGrass" width="120" height="56" patternUnits="userSpaceOnUse">${Array.from({ length: 46 }, () => { const x = rnd(0, 120), h = rnd(18, 50), b = rnd(-9, 9); return `<path d="M${f1(x)},56 Q${f1(x + b * 0.4)},${f1(56 - h * 0.55)} ${f1(x + b)},${f1(56 - h)}" stroke="${pick(['#3f6b26', '#4f7f2f', '#5f9238', '#6ea444', '#365d22', '#7cb04c'])}" stroke-width="${f1(rnd(1.2, 2.6))}" fill="none" stroke-linecap="round"/>`; }).join('')}</pattern>
    <clipPath id="ftTrunkClip"><path d="TRUNK"/></clipPath></defs>`;
  // the trunk, with a slight sway and buttress roots at the ground
  const sw = 18, trunk = `M${cx - 280},${G + 36} C${cx - 190},${G + 10} ${cx - 150},${G - 40} ${cx - 132},${G - 150} C${cx - 118 + sw},${(G + topY) / 2 + 60} ${cx - 104 - sw},${(G + topY) / 2 - 80} ${cx - 92},${topY + 40} C${cx - 110},${topY - 20} ${cx - 150},${topY - 70} ${cx - 190},${topY - 120} L${cx + 190},${topY - 120} C${cx + 150},${topY - 70} ${cx + 110},${topY - 20} ${cx + 92},${topY + 40} C${cx + 104 - sw},${(G + topY) / 2 - 80} ${cx + 118 + sw},${(G + topY) / 2 + 60} ${cx + 132},${G - 150} C${cx + 150},${G - 40} ${cx + 190},${G + 10} ${cx + 280},${G + 36} Z`;
  let bark = ''; for (let i = 0; i < 46; i++) { const u = rnd(-1, 1), x0 = cx + u * 150, x1 = cx + u * 90, wig = rnd(-14, 14); bark += `<path d="M${f1(x0)},${G + 30} C${f1(x0 + wig)},${f1(G - (G - topY) * 0.35)} ${f1(x1 - wig)},${f1(G - (G - topY) * 0.7)} ${f1(x1)},${f1(topY - 60)}" stroke="${R() < 0.6 ? 'rgba(18,10,4,.38)' : 'rgba(255,230,200,.10)'}" stroke-width="${f1(rnd(1.2, 4.5))}" fill="none"/>`; }
  for (let i = 0; i < 3; i++) { const x = cx + rnd(-60, 60), y = rnd(topY + 120, G - 160); bark += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rnd(10, 18))}" ry="${f1(rnd(16, 28))}" fill="#24170d" opacity=".7"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rnd(20, 28))}" ry="${f1(rnd(30, 40))}" fill="none" stroke="rgba(255,230,200,.12)" stroke-width="3"/>`; }
  // the main limbs, from the top of the trunk up into the crown
  const scaffold = cr ? [[-0.62, 0.15, 64], [-0.28, -0.35, 52], [0.05, -0.6, 48], [0.35, -0.3, 52], [0.66, 0.1, 60]].map(([u, v, t]) => `<path class="limb" d="${limb({ x: cx + u * 60, y: topY - 60 }, { x: ccx + u * RX * 0.85, y: ccy + v * RY * 0.8 }, t, 12, u * 40)}" fill="url(#ftBark)"/>`).join('') : '';
  // the crown: dark depth behind, the body, sunlit clumps on the upper left, then light and shade over it all
  let crownB = '', crownM = '', crownL = '';
  if (cr) {
    for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2 + rnd(-0.1, 0.1), f = rnd(0.82, 1.02), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f; const d = blob(x, y, rnd(150, 230)); crownB += `<path d="${d}" fill="#1f3d17"/><path d="${d}" fill="url(#ftLeafB)"/>`; }
    crownB += `<ellipse cx="${ccx}" cy="${ccy}" rx="${RX * 0.95}" ry="${RY * 0.92}" fill="#25461b"/><ellipse cx="${ccx}" cy="${ccy}" rx="${RX * 0.95}" ry="${RY * 0.92}" fill="url(#ftLeafB)"/>`;
    for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2 + rnd(-0.15, 0.15), f = rnd(0.55, 0.95), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f - 20; crownM += `<path d="${blob(x, y, rnd(110, 175))}" fill="url(#ftLeafM)"/>`; }
    for (let i = 0; i < 16; i++) { const a = rnd(Math.PI * 1.02, Math.PI * 1.75), f = rnd(0.55, 1.0), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f; crownL += `<path d="${blob(x, y, rnd(70, 125))}" fill="url(#ftLeafL)" opacity=".95"/>`; }
    crownL += `<ellipse cx="${ccx}" cy="${ccy}" rx="${RX * 1.08}" ry="${RY * 1.06}" fill="url(#ftShade)"/>`;
  }
  // branches out to spending and commitments, with twigs and sprays of leaves; roots down to income and what you own
  let branches = '', roots = '', sap = '', labels = '';
  for (const f of L.flows || []) {
    if (f.kind === 'up') { sap += `<path class="sap" d="M${f.a.x},${f.a.y} L${f.b.x},${f.b.y}" style="animation-duration:3.2s"/>`; labels += finTreeLabel(f, f.a.x - 150, (f.a.y + f.b.y) / 2 - 8, 'end', 'sky'); continue; }
    if (f.kind === 'branch') {
      const a = { x: cx + Math.sign(f.b.x - cx) * 60, y: f.a.y }, b = f.b, bend = -40 * Math.sign(b.x - cx);
      branches += `<path class="limb" d="${limb(a, b, f.t * 0.9 + 22, 9, bend)}" fill="url(#ftBark)"/>`;
      for (let i = 0; i < 3; i++) { const q = 0.35 + i * 0.22, p = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q - 6 }, e = { x: p.x + Math.sign(b.x - a.x) * rnd(40, 110), y: p.y - rnd(90, 170) };
        branches += `<path class="limb" d="${limb(p, e, rnd(9, 14), 2, rnd(-20, 20))}" fill="url(#ftBark)"/><path d="${blob(e.x, e.y - 10, rnd(46, 66), 14)}" fill="#2b5420"/><path d="${blob(e.x, e.y - 14, rnd(40, 58), 14)}" fill="url(#ftLeafM)"/><path d="${blob(e.x - 10, e.y - 26, rnd(22, 32), 12)}" fill="url(#ftLeafL)"/>`; }
      if (!f.empty) sap += `<path class="sap" d="${centre(a, b, bend)}" style="animation-duration:${Math.max(1.8, 5 - f.t / 18).toFixed(1)}s"/>`;
      { const edge = ac ? (b.x < cx ? ac.x : ac.x + ac.w) : a.x; labels += finTreeLabel(f, (edge + b.x) / 2, Math.max(a.y, b.y) + f.t / 2 + 46, 'middle', 'sky'); }   // in the open stretch of the branch
      continue;
    }
    // a root: from the room up to the base of the trunk (so the sap runs up)
    const b = { x: cx + Math.sign(f.a.x - cx) * 70, y: G + 20 }, a = f.a, t = f.still ? 26 : f.t * 0.7 + 18, bend = 30 * Math.sign(a.x - cx);
    roots += `<path class="root" d="${limb(b, a, t, 7, bend)}" fill="url(#ftRoot)"/>` + rootlets(b, a, t, 0);
    if (!f.empty && !f.still) sap += `<path class="sap" d="${centre(a, b, -bend)}" style="animation-duration:${Math.max(1.8, 5 - f.t / 18).toFixed(1)}s"/>`;
    labels += finTreeLabel(f, (a.x + b.x) / 2 + Math.sign(a.x - cx) * 34, (a.y + b.y) / 2 + 10, a.x < cx ? 'end' : 'start', 'soil');
  }
  // shallow roots spreading at the base of the trunk
  for (let i = 0; i < 8; i++) { const side = i % 2 ? 1 : -1, b = { x: cx + side * rnd(90, 200), y: G + 26 }, e = { x: cx + side * rnd(300, 620), y: G + rnd(60, 220) }; roots += `<path class="root" d="${limb(b, e, rnd(16, 30), 2, side * rnd(10, 40))}" fill="url(#ftRoot)"/>` + rootlets(b, e, 12, 1); }
  // soil in layers, grain and stones; grass on top
  let soil = `<rect x="-8000" y="${G}" width="${W + 16000}" height="${L.h - G + 8000}" fill="url(#ftSoil)"/><rect x="-8000" y="${G}" width="${W + 16000}" height="${L.h - G + 8000}" fill="url(#ftGrain)" opacity=".7"/>`;
  for (let i = 0; i < 4; i++) { const y = G + 140 + i * rnd(150, 230); soil += `<path d="M-8000,${f1(y)} ${Array.from({ length: 12 }, (_, k) => `Q${f1(-2000 + k * (W + 4000) / 12)},${f1(y + rnd(-18, 18))} ${f1(-2000 + (k + 0.5) * (W + 4000) / 12)},${f1(y + rnd(-10, 10))}`).join(' ')} L${W + 8000},${f1(y)}" stroke="rgba(20,12,6,.22)" stroke-width="${f1(rnd(2, 5))}" fill="none"/>`; }
  for (let i = 0; i < 26; i++) { const x = rnd(T.TX - 600, T.TX + T.TW + 600), y = rnd(G + 70, G + 1100), r = rnd(5, 16); soil += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r)}" ry="${f1(r * rnd(0.55, 0.8))}" fill="url(#ftStone)" opacity=".85"/>`; }
  const grass = `<rect x="-8000" y="${G - 6}" width="${W + 16000}" height="22" fill="url(#ftTurf)"/><rect x="-8000" y="${G - 50}" width="${W + 16000}" height="56" fill="url(#ftGrass)"/><rect x="-8000" y="${G - 34}" width="${W + 16000}" height="56" fill="url(#ftGrass)" transform="translate(37 0)" opacity=".9"/>`;
  const out = `<svg class="fin-tree real" width="${W}" height="${L.h}" aria-hidden="true">${defs.replace('d="TRUNK"', `d="${trunk}"`)}
    ${soil}${roots}${crownB}<path d="${trunk}" fill="url(#ftBark)"/><g clip-path="url(#ftTrunkClip)">${bark}</g>${scaffold}${crownM}${crownL}
    ${branches}${grass}${sap}${labels}
    <text class="fin-tree-h" x="${ac ? ac.x + ac.w + 60 : T.TX}" y="${G - 70}">↑ Above the ground — your accounts and where money goes</text>
    <text class="fin-tree-h soil" x="${T.TX}" y="${G + 70}">↓ The roots — what feeds your money</text></svg>`;
  FTREE.key = key; FTREE.svg = out; return out;
}
// the amount and what it is, readable when zoomed out
function finTreeLabel(f, x, y, anchor, on) {
  if (!f.amt && !f.what) return '';
  return `<text class="fin-tree-l ${on}" x="${x}" y="${y}" text-anchor="${anchor}">${f.amt ? `<tspan class="amt">${esc(f.amt)}</tspan>` : ''}<tspan class="what" x="${x}" dy="${f.amt ? 26 : 0}">${esc(f.what)}</tspan></text>`;
}
// the sky behind (it does not move with the canvas): soft light, slow clouds
const finTreeSky = () => '<div class="fin-tree-sky" aria-hidden="true"><i class="sun"></i><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i></div>';

/* --- switching: every card moves from its place in one layout to its place in the other --- */
function finCvMode(mode) {
  mode = FIN_CV_MODES.includes(mode) ? mode : 'rooms'; if ((UI.fin.cv.mode || 'rooms') === mode) return;
  const reduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return true; } })();
  const key = el => (el.dataset.room ? 'r:' : 'n:') + (el.dataset.room || el.dataset.node);
  const before = new Map(); if (!reduce) for (const el of document.querySelectorAll('#fin-cv-world [data-node], #fin-cv-world [data-room]')) { if (el.closest('.fin-room-h')) continue; before.set(key(el), { x: parseFloat(el.style.left) || 0, y: parseFloat(el.style.top) || 0 }); }
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
  for (const d of document.querySelectorAll('#fin-cv-world .fin-det, #fin-cv-world .fin-room-sub, #fin-cv-world .fin-tree, #fin-cv-world .fin-flow')) { d.style.transition = 'none'; d.style.opacity = '0'; moved.push(d); }
  void document.body.offsetWidth;
  requestAnimationFrame(() => {
    for (const el of moved) { el.style.transition = 'transform .7s cubic-bezier(.2,.8,.2,1), opacity .5s ease .15s'; el.style.transform = ''; el.style.opacity = ''; }
    setTimeout(() => { for (const el of moved) el.style.transition = ''; }, 900);
  });
}

/* --- cards lean toward the pointer (Flow and Tree) --- */
const FTL = { el: null, raf: 0, x: 0, y: 0 };
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || !['tree', 'flow'].includes(UI.fin.cv.mode) || UI.view !== 'finance') return;
  const c = e.target.closest && e.target.closest('.mode-tree #fin-cv-world .fin-leaf, .mode-flow #fin-cv-world .fin-leaf');
  if (FTL.el && FTL.el !== c) { FTL.el.style.removeProperty('--rx'); FTL.el.style.removeProperty('--ry'); FTL.el = null; }
  if (!c || e.buttons) return; FTL.el = c; FTL.x = e.clientX; FTL.y = e.clientY;
  if (!FTL.raf) FTL.raf = requestAnimationFrame(() => { FTL.raf = 0; const el = FTL.el; if (!el) return; const r = el.getBoundingClientRect(); const px = (FTL.x - r.left) / r.width - 0.5, py = (FTL.y - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', (-py * 6).toFixed(2) + 'deg'); el.style.setProperty('--ry', (px * 8).toFixed(2) + 'deg'); el.style.setProperty('--gx', Math.round((px + 0.5) * 100) + '%'); });
});

function finCvModeHTML() {
  const m = UI.fin.cv.mode || 'rooms', tip = { rooms: 'Rooms: every topic in its own room', flow: 'Flow: your money as a river, from income to goals', tree: 'Tree: your accounts the trunk, income and what you own the roots, spending and commitments the branches, goals the crown' };
  return `<div class="seg fin-cv-modes" role="group" aria-label="Card layout">${[['rooms', '▦', 'Rooms'], ['flow', '✦', 'Flow'], ['tree', '🌳', 'Tree']].map(([k, i, l]) => `<button data-act="fin-cv-mode" data-v="${k}" aria-pressed="${m === k}" title="${tip[k]} ( L )"><span aria-hidden="true">${i}</span> ${l}</button>`).join('')}</div>`;
}
Object.assign(ACT, { 'fin-cv-mode': el => finCvMode(el.dataset.v) });
Object.assign(window.__FIN, { mode: m => (m ? finCvMode(m) : UI.fin.cv.mode || 'rooms') });
