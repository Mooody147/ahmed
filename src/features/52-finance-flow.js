// Money canvas — the second card layout, "Tree": your money as a living tree.
// Above the ground: your accounts are the trunk; branches carry money out to spending (left) and commitments (right);
// the crown holds your goals and purchases — the fruit. Below the ground the roots reach into what feeds the tree:
// your income and what you own. My money and what is coming up stand beside the tree as its signpost. Gold sap
// (particles) runs up the roots and out along the branches, the way the money moves; each root and branch is as
// thick as that money is per month. Daylight colours: a soft sky, grass and warm soil.
// Easy to read: it is wide rather than tall, with two cards to a row, so Fit shows the whole tree large; zoomed out,
// cards show only their name and figure in big type and room titles grow (zoom in for everything).
// Rooms (the first layout) is unchanged; everything on the canvas works the same in both.

const FTR = { SIGN: 700, GAP: 100, CROWN: 1120, BR: 580, TRUNK: 580, ROOT: 600, HEAD: 92, SKY: 100, SOIL: 140, ARM: 210, TOP: 520 };
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

/* --- drawing the tree: a monster of a real tree ---
   A massive gnarled trunk on buttress roots, deep bark furrows, burls, a hollow and moss; nine great limbs that fork
   again and again into a huge layered crown of thousands of leaves lit from the top left, with twigs and sprays
   pushing out of its edge and vines hanging from it; side branches that hold spending and commitments; snaking
   surface roots, a deep tap root and a fan of rootlets in layered soil with stones; grass tufts, fallen leaves and
   mushrooms at the foot. Drawn ONCE into a picture (in the background, kept until the layout changes) that the canvas
   only slides and scales — so moving never makes it redraw. Only the gold sap and the labels stay live on top. */
function finRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const FTREE = { key: '', url: '', urlKey: '', box: null, busy: '', fail: false, art: '' };
function finTreeGeom(L) {
  const T = L.tree, { G, cx } = T, cr = T.crown, ac = T.acc;
  const ccx = cr ? cr.x + cr.w / 2 : cx, ccy = cr ? cr.y + cr.h / 2 : G - 900, RX = cr ? cr.w / 2 + 360 : 700, RY = cr ? cr.h / 2 + 250 : 480;
  const topY = cr ? cr.y + cr.h + 40 : (ac ? ac.y - 80 : G - 600);
  return { G, cx, cr, ac, ccx, ccy, RX, RY, topY };
}
// the picture's area: the whole tree, its crown above the canvas and its roots below
const finTreeBox = (L, g) => ({ x: -400, y: Math.floor(Math.min(-200, g.ccy - g.RY * 1.25 - 120)), w: L.w + 800, h: 0 });
function finTreeArt(L) {
  const g = finTreeGeom(L), { G, cx, cr, ccx, ccy, RX, RY, topY } = g, W = L.w, box = finTreeBox(L, g); box.h = Math.ceil(Math.max(L.h, G + 1300) + 200 - box.y);
  const R = finRng(20261101), rnd = (a, b) => a + (b - a) * R(), pick = arr => arr[Math.floor(R() * arr.length)], f1 = v => Math.round(v * 10) / 10;
  const X0 = box.x, X1 = box.x + box.w, Y1 = box.y + box.h;
  const leafTile = (id, size, n, palette, rx0, rx1) => {
    let out = '';
    for (let i = 0; i < n; i++) {
      const x = rnd(0, size), y = rnd(0, size), rx = rnd(rx0, rx1), ry = rx * rnd(0.36, 0.55), a = rnd(0, 180), c = pick(palette);
      for (const [dx, dy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) { const X = x + dx, Y = y + dy; if (X < -rx1 || X > size + rx1 || Y < -rx1 || Y > size + rx1) continue; out += `<ellipse cx="${f1(X)}" cy="${f1(Y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${Math.round(a)} ${f1(X)} ${f1(Y)})" fill="${c}"/>`; }
    }
    return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">${out}</pattern>`;
  };
  const blob = (x, y, r, k = 20) => { const pts = Array.from({ length: k }, (_, i) => { const a = (i / k) * Math.PI * 2, rr = r * rnd(0.78, 1.14); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.9]; });
    let d = `M${f1((pts[0][0] + pts[k - 1][0]) / 2)},${f1((pts[0][1] + pts[k - 1][1]) / 2)}`; for (let i = 0; i < k; i++) { const p = pts[i], q = pts[(i + 1) % k]; d += ` Q${f1(p[0])},${f1(p[1])} ${f1((p[0] + q[0]) / 2)},${f1((p[1] + q[1]) / 2)}`; } return d + 'Z'; };
  const limb = (a, b, t0, t1, bend = 0) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    const m1 = { x: a.x + dx / 3 + nx * bend, y: a.y + dy / 3 + ny * bend }, m2 = { x: a.x + dx * 2 / 3 + nx * bend * 0.6, y: a.y + dy * 2 / 3 + ny * bend * 0.6 };
    const P = (q, s, t) => `${f1(q.x + nx * t * s)},${f1(q.y + ny * t * s)}`, ta = (t0 * 2 + t1) / 3, tb = (t0 + t1 * 2) / 3;
    return `M${P(a, 1, t0 / 2)} C${P(m1, 1, ta / 2)} ${P(m2, 1, tb / 2)} ${P(b, 1, t1 / 2)} L${P(b, -1, t1 / 2)} C${P(m2, -1, tb / 2)} ${P(m1, -1, ta / 2)} ${P(a, -1, t0 / 2)} Z`;
  };
  const pal = { deep: ['#16300f', '#1c3a14', '#203f17', '#173311'], back: ['#24461b', '#2c5421', '#335f26', '#2a4d1f', '#3a6a2a'], mid: ['#3f7a2b', '#4a8a33', '#55963a', '#3a6f28', '#5fa040', '#4d8233', '#68a845'], light: ['#78b552', '#86c25c', '#6aa947', '#93cd66', '#a2d675', '#7dbb57', '#b0dc84'] };
  const bark = (id, c) => `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${c[0]}"/><stop offset=".22" stop-color="${c[1]}"/><stop offset=".42" stop-color="${c[2]}"/><stop offset=".6" stop-color="${c[3]}"/><stop offset=".85" stop-color="${c[4]}"/><stop offset="1" stop-color="${c[5]}"/></linearGradient>`;
  let defs = `<defs>${bark('ftBark', ['#24180e', '#4a3422', '#6d5036', '#563e29', '#352516', '#1d130b'])}${bark('ftBarkL', ['#3a2817', '#5e4630', '#82654a', '#6a4f36', '#45311f', '#2c1e12'])}
    <linearGradient id="ftRoot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f3725"/><stop offset="1" stop-color="#2a1d13"/></linearGradient>
    <linearGradient id="ftSoil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b4d34"/><stop offset=".06" stop-color="#5d4230"/><stop offset=".35" stop-color="#4b3526"/><stop offset="1" stop-color="#2a1e16"/></linearGradient>
    <linearGradient id="ftTurf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f7d33"/><stop offset=".5" stop-color="#3f652a"/><stop offset="1" stop-color="#5d4230"/></linearGradient>
    <radialGradient id="ftShade" cx=".33" cy=".22" r=".85"><stop offset="0" stop-color="#fffbe0" stop-opacity=".25"/><stop offset=".42" stop-color="#fffbe0" stop-opacity="0"/><stop offset=".78" stop-color="#0b1d06" stop-opacity=".2"/><stop offset="1" stop-color="#0b1d06" stop-opacity=".42"/></radialGradient>
    <radialGradient id="ftStone" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#a39d92"/><stop offset="1" stop-color="#4a4540"/></radialGradient>
    <radialGradient id="ftHollow" cx=".5" cy=".55" r=".6"><stop offset="0" stop-color="#050302"/><stop offset=".7" stop-color="#1a110a"/><stop offset="1" stop-color="#3a2817"/></radialGradient>
    ${leafTile('ftLeafD', 160, 70, pal.deep, 10, 18)}${leafTile('ftLeafB', 150, 80, pal.back, 9, 17)}${leafTile('ftLeafM', 140, 90, pal.mid, 8, 15)}${leafTile('ftLeafL', 130, 70, pal.light, 7, 13)}
    <pattern id="ftGrain" width="70" height="70" patternUnits="userSpaceOnUse">${Array.from({ length: 56 }, () => `<circle cx="${f1(rnd(0, 70))}" cy="${f1(rnd(0, 70))}" r="${f1(rnd(0.6, 2.2))}" fill="${pick(['#8a6a4c', '#3a291c', '#9b7d5d', '#2c1f15', '#77593f'])}" opacity="${f1(rnd(0.3, 0.8))}"/>`).join('')}</pattern>
    <pattern id="ftGrass" width="120" height="58" patternUnits="userSpaceOnUse">${Array.from({ length: 60 }, () => { const x = rnd(0, 120), h = rnd(18, 54), b = rnd(-10, 10); return `<path d="M${f1(x)},58 Q${f1(x + b * 0.4)},${f1(58 - h * 0.55)} ${f1(x + b)},${f1(58 - h)}" stroke="${pick(['#3f6b26', '#4f7f2f', '#5f9238', '#6ea444', '#365d22', '#7cb04c', '#2f5520'])}" stroke-width="${f1(rnd(1.2, 2.8))}" fill="none" stroke-linecap="round"/>`; }).join('')}</pattern>`;
  // ---- the trunk: massive, twisting, flaring into buttresses at the foot and into limbs at the top
  const tb = 300, tm = 210, tt = 165, mid = (G + topY) / 2;
  const trunk = `M${cx - tb - 220},${G + 60} C${cx - tb - 60},${G + 10} ${cx - tb + 10},${G - 60} ${cx - tm - 30},${G - 220} C${cx - tm + 30},${mid + 120} ${cx - tm - 50},${mid - 120} ${cx - tt},${topY + 80} C${cx - tt - 40},${topY - 10} ${cx - tt - 140},${topY - 90} ${cx - tt - 250},${topY - 170} L${cx + tt + 250},${topY - 170} C${cx + tt + 140},${topY - 90} ${cx + tt + 40},${topY - 10} ${cx + tt},${topY + 80} C${cx + tm + 50},${mid - 120} ${cx + tm - 30},${mid + 120} ${cx + tm + 30},${G - 220} C${cx + tb - 10},${G - 60} ${cx + tb + 60},${G + 10} ${cx + tb + 220},${G + 60} Z`;
  defs += `<clipPath id="ftTrunkClip"><path d="${trunk}"/></clipPath></defs>`;
  let barkLines = '';
  for (let i = 0; i < 150; i++) { const u = rnd(-1, 1), x0 = cx + u * (tb + 40), x1 = cx + u * tt, w1 = rnd(-26, 26), w2 = rnd(-22, 22); barkLines += `<path d="M${f1(x0)},${G + 50} C${f1(x0 + w1)},${f1(G - (G - topY) * 0.33)} ${f1(x1 + w2)},${f1(G - (G - topY) * 0.68)} ${f1(x1 + w1 * 0.5)},${f1(topY - 120)}" stroke="${R() < 0.62 ? `rgba(14,8,3,${f1(rnd(0.25, 0.55))})` : `rgba(255,230,200,${f1(rnd(0.06, 0.14))})`}" stroke-width="${f1(rnd(1.2, 6))}" fill="none" stroke-linecap="round"/>`; }
  for (let i = 0; i < 7; i++) { const x = cx + rnd(-140, 140), y = rnd(topY + 140, G - 200), rx = rnd(14, 34), ry = rx * rnd(1.2, 1.8); barkLines += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" fill="#1e140b" opacity=".75"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx * 1.6)}" ry="${f1(ry * 1.4)}" fill="none" stroke="rgba(255,228,196,.13)" stroke-width="4"/><ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx * 2.3)}" ry="${f1(ry * 1.9)}" fill="none" stroke="rgba(10,6,2,.25)" stroke-width="5"/>`; }
  const hx = cx + 60, hy = G - 330;
  barkLines += `<ellipse cx="${hx}" cy="${hy}" rx="64" ry="110" fill="url(#ftHollow)"/><ellipse cx="${hx}" cy="${hy}" rx="78" ry="126" fill="none" stroke="#6d5036" stroke-width="12" opacity=".8"/>`;
  for (let i = 0; i < 70; i++) { const x = cx + rnd(-tb - 120, -40), y = G - rnd(0, 420) * Math.pow(R(), 1.6); barkLines += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(rnd(3, 11))}" fill="${pick(['#4f7a2a', '#5f8f35', '#3e6a22', '#6f9d3f'])}" opacity="${f1(rnd(0.45, 0.85))}"/>`; }
  // ---- the great limbs, forking again and again; leaf sprays at their tips
  let limbs = '', tips = [];
  const grow = (a, ang, len, t, depth) => {
    const b = { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
    limbs += `<path d="${limb(a, b, t, Math.max(2, t * 0.62), rnd(-40, 40) * (len / 400))}" fill="url(#${depth < 2 ? 'ftBark' : 'ftBarkL'})"/>`;
    if (depth >= 4 || t < 7) { tips.push(b); return; }
    const kids = depth < 2 ? 3 : 2;
    for (let i = 0; i < kids; i++) grow(b, ang + rnd(-0.62, 0.62) + (i - (kids - 1) / 2) * 0.32, len * rnd(0.56, 0.72), t * rnd(0.52, 0.66), depth + 1);
  };
  if (cr) for (let i = 0; i < 9; i++) { const ang = -Math.PI * (0.06 + 0.88 * (i / 8)) + rnd(-0.08, 0.08), a = { x: cx + Math.cos(ang) * 60, y: topY - 120 }; grow(a, ang, rnd(420, 640), rnd(80, 120), 0); }
  // ---- the crown: deep shade, the body, sunlit clumps, a ragged leafy edge, light and shade over it, hanging vines
  let crownBack = '', crownFront = '', edge = '', vines = '';
  if (cr) {
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2 + rnd(-0.1, 0.1), f = rnd(0.86, 1.06), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f; const d = blob(x, y, rnd(180, 290)); crownBack += `<path d="${d}" fill="#132a0d"/><path d="${d}" fill="url(#ftLeafD)"/>`; }
    crownBack += `<ellipse cx="${ccx}" cy="${ccy}" rx="${RX}" ry="${RY * 0.96}" fill="#1c3815"/><ellipse cx="${ccx}" cy="${ccy}" rx="${RX}" ry="${RY * 0.96}" fill="url(#ftLeafB)"/>`;
    for (let i = 0; i < 34; i++) { const a = rnd(0, Math.PI * 2), f = Math.sqrt(R()) * 0.8, x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f; crownBack += `<path d="${blob(x, y, rnd(140, 230))}" fill="url(#ftLeafB)"/>`; }
    for (let i = 0; i < 56; i++) { const a = (i / 56) * Math.PI * 2 + rnd(-0.15, 0.15), f = rnd(0.5, 0.97), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f - 24; crownFront += `<path d="${blob(x, y, rnd(120, 210))}" fill="url(#ftLeafM)"/>`; }
    for (let i = 0; i < 34; i++) { const a = rnd(Math.PI * 1.0, Math.PI * 1.8), f = rnd(0.45, 1.02), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f; crownFront += `<path d="${blob(x, y, rnd(70, 140))}" fill="url(#ftLeafL)" opacity=".96"/>`; }
    for (let i = 0; i < 900; i++) { const a = rnd(0, Math.PI * 2), f = rnd(0.96, 1.2), x = ccx + Math.cos(a) * RX * f, y = ccy + Math.sin(a) * RY * f, up = Math.sin(a) < -0.1 && Math.cos(a) < 0.3, rx = rnd(6, 14); edge += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(rx * rnd(0.36, 0.52))}" transform="rotate(${Math.round(rnd(0, 180))} ${f1(x)} ${f1(y)})" fill="${pick(up ? pal.light : R() < 0.5 ? pal.mid : pal.back)}"/>`; }
    crownFront += `<ellipse cx="${ccx}" cy="${ccy}" rx="${RX * 1.12}" ry="${RY * 1.1}" fill="url(#ftShade)"/>`;
    for (let i = 0; i < 16; i++) { const x = ccx + rnd(-RX * 0.85, RX * 0.85), y0 = ccy + RY * rnd(0.55, 0.85), len = rnd(120, 300), sw = rnd(-30, 30); let leaves = ''; for (let k = 1; k < 9; k++) { const q = k / 9, lx = x + sw * q * q, ly = y0 + len * q; leaves += `<ellipse cx="${f1(lx + rnd(-6, 6))}" cy="${f1(ly)}" rx="${f1(rnd(5, 8))}" ry="${f1(rnd(2.5, 3.5))}" transform="rotate(${Math.round(rnd(20, 160))} ${f1(lx)} ${f1(ly)})" fill="${pick(pal.mid)}"/>`; }
      vines += `<path d="M${f1(x)},${f1(y0)} Q${f1(x + sw * 0.3)},${f1(y0 + len * 0.5)} ${f1(x + sw)},${f1(y0 + len)}" stroke="#3a5a24" stroke-width="2" fill="none" opacity=".8"/>${leaves}`; }
  }
  const spray = (x, y, r) => `<path d="${blob(x, y, r, 14)}" fill="#24461b"/><path d="${blob(x, y - 4, r * 0.9, 14)}" fill="url(#ftLeafM)"/><path d="${blob(x - r * 0.25, y - r * 0.3, r * 0.5, 12)}" fill="url(#ftLeafL)"/>`;
  const tipSprays = tips.map(b => spray(b.x, b.y, rnd(36, 70))).join('');
  // ---- side branches to spending and commitments, with twigs and sprays
  let branches = '', roots = '';
  for (const f of L.flows || []) {
    if (f.kind === 'branch') {
      const a = { x: cx + Math.sign(f.b.x - cx) * 80, y: f.a.y }, b = f.b, bend = -50 * Math.sign(b.x - cx);
      branches += `<path d="${limb(a, b, f.t * 0.9 + 40, 12, bend)}" fill="url(#ftBark)"/>`;
      for (let i = 0; i < 5; i++) { const q = 0.25 + i * 0.15, p = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q - 8 }, side = i % 2 ? 1 : -1, e = { x: p.x + Math.sign(b.x - a.x) * rnd(30, 120), y: p.y + side * rnd(90, 190) * (side < 0 ? 1 : 0.6) };
        branches += `<path d="${limb(p, e, rnd(12, 20), 2, rnd(-24, 24))}" fill="url(#ftBarkL)"/>` + spray(e.x, e.y, rnd(40, 70)); }
    } else if (f.kind === 'root') {
      const b = { x: cx + Math.sign(f.a.x - cx) * 120, y: G + 30 }, a = f.a, t = f.still ? 44 : f.t * 0.75 + 34, bend = 40 * Math.sign(a.x - cx);
      roots += `<path d="${limb(b, a, t, 9, bend)}" fill="url(#ftRoot)"/>` + finTreeRootlets(b, a, t, 0, R, limb, G);
    }
  }
  // snaking surface roots and buttresses, a deep tap root
  for (let i = 0; i < 12; i++) { const side = i % 2 ? 1 : -1, b = { x: cx + side * rnd(150, 330), y: G - rnd(10, 60) }, e = { x: cx + side * rnd(420, 1200), y: G + rnd(40, 320) }; roots += `<path d="${limb(b, e, rnd(40, 100), 3, side * rnd(-30, 60))}" fill="url(#ftRoot)"/>` + finTreeRootlets(b, e, 26, 1, R, limb, G); }
  roots += `<path d="${limb({ x: cx, y: G + 40 }, { x: cx + rnd(-60, 60), y: G + rnd(900, 1150) }, 150, 6, 30)}" fill="url(#ftRoot)"/>` + finTreeRootlets({ x: cx, y: G + 60 }, { x: cx, y: G + 1000 }, 60, 0, R, limb, G);
  // soil, grass, the foot of the tree
  let soil = `<rect x="${X0}" y="${G}" width="${box.w}" height="${Y1 - G}" fill="url(#ftSoil)"/><rect x="${X0}" y="${G}" width="${box.w}" height="${Y1 - G}" fill="url(#ftGrain)" opacity=".75"/>`;
  for (let i = 0; i < 6; i++) { const y = G + 130 + i * rnd(150, 230); soil += `<path d="M${X0},${f1(y)} ${Array.from({ length: 16 }, (_, k) => `Q${f1(X0 + (k + 0.25) * box.w / 16)},${f1(y + rnd(-20, 20))} ${f1(X0 + (k + 0.5) * box.w / 16)},${f1(y + rnd(-10, 10))}`).join(' ')} L${X1},${f1(y)}" stroke="rgba(18,10,4,.24)" stroke-width="${f1(rnd(2, 6))}" fill="none"/>`; }
  for (let i = 0; i < 70; i++) { const x = rnd(X0 + 200, X1 - 200), y = rnd(G + 60, Math.min(Y1 - 40, G + 1300)), r = rnd(4, 22); soil += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r)}" ry="${f1(r * rnd(0.5, 0.8))}" fill="url(#ftStone)" opacity=".88"/>`; }
  let grass = `<rect x="${X0}" y="${G - 6}" width="${box.w}" height="24" fill="url(#ftTurf)"/><rect x="${X0}" y="${G - 54}" width="${box.w}" height="58" fill="url(#ftGrass)"/><rect x="${X0}" y="${G - 38}" width="${box.w}" height="58" fill="url(#ftGrass)" transform="translate(41 0)" opacity=".9"/>`;
  for (let i = 0; i < 160; i++) { const x = rnd(X0 + 100, X1 - 100), y = G + rnd(-4, 6); let tuft = ''; for (let k = 0; k < 6; k++) { const h = rnd(24, 70), b = rnd(-16, 16), xx = x + rnd(-8, 8); tuft += `<path d="M${f1(xx)},${f1(y)} Q${f1(xx + b * 0.4)},${f1(y - h * 0.55)} ${f1(xx + b)},${f1(y - h)}" stroke="${pick(['#3f6b26', '#4f7f2f', '#5f9238', '#6ea444', '#2f5520'])}" stroke-width="${f1(rnd(1.4, 3))}" fill="none" stroke-linecap="round"/>`; } grass += tuft; }
  for (let i = 0; i < 60; i++) { const x = cx + rnd(-900, 900), y = G + rnd(-8, 8), r = rnd(5, 10); grass += `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(r)}" ry="${f1(r * 0.45)}" transform="rotate(${Math.round(rnd(0, 180))} ${f1(x)} ${f1(y)})" fill="${pick(['#b5651d', '#c98a2e', '#8e4f1c', '#a8752f', '#d39a3a'])}" opacity=".85"/>`; }
  for (let i = 0; i < 7; i++) { const x = cx + (i % 2 ? 1 : -1) * rnd(260, 520), y = G + 2, h = rnd(18, 34), r = h * rnd(0.6, 0.9); grass += `<path d="M${f1(x - 3)},${f1(y)} L${f1(x - 3)},${f1(y - h)} L${f1(x + 3)},${f1(y - h)} L${f1(x + 3)},${f1(y)} Z" fill="#efe6d6"/><path d="M${f1(x - r)},${f1(y - h + 2)} Q${f1(x)},${f1(y - h - r * 1.2)} ${f1(x + r)},${f1(y - h + 2)} Z" fill="${pick(['#a3472e', '#8a5a3a', '#c06a3a'])}"/>`; }
  void W;
  // drawn in stages (each its own small picture over the last), so the page never stops for long
  const layers = [soil + roots, crownBack, limbs + `<path d="${trunk}" fill="url(#ftBark)"/><g clip-path="url(#ftTrunkClip)">${barkLines}</g>`, crownFront + tipSprays, edge + vines + branches, grass];
  const wrap = body => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" width="${box.w}" height="${box.h}">${defs}${body}</svg>`;
  return { box, layers: layers.map(wrap), svg: wrap(layers.join('')) };
}
// fine roots: forks from a root, then forks of those, then hairs
function finTreeRootlets(a, b, t, depth, R, limb, G) {
  let out = ''; if (depth > 3) return out;
  const rnd = (x, y) => x + (y - x) * R(), n = depth === 0 ? 6 : depth === 1 ? 3 : 2;
  for (let i = 0; i < n; i++) {
    const q = rnd(0.2, 0.92), p = { x: a.x + (b.x - a.x) * q, y: a.y + (b.y - a.y) * q }, side = R() < 0.5 ? -1 : 1, len = depth === 0 ? rnd(140, 300) : depth === 1 ? rnd(70, 160) : rnd(30, 80);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) + side * rnd(0.45, 1.15), e = { x: p.x + Math.cos(ang) * len, y: Math.max(G + 26, p.y + Math.abs(Math.sin(ang)) * len * 0.9 + 16) };
    const w = Math.max(0.9, t * (depth === 0 ? 0.3 : 0.42));
    out += `<path d="${limb(p, e, w, 0.6, side * rnd(6, 26))}" fill="#3a291b"/>` + finTreeRootlets(p, e, w, depth + 1, R, limb, G);
  }
  return out;
}
// the finished picture is kept in this browser too (a few, newest first), so the tree is there at once next time
const FTDB = { db: null };
function finTreeDB() { if (FTDB.db) return FTDB.db; FTDB.db = new Promise((ok, no) => { try { const r = indexedDB.open('ar-tree', 1); r.onupgradeneeded = () => r.result.createObjectStore('pics'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }); return FTDB.db; }
async function finTreeCacheGet(key) { try { const db = await finTreeDB(); return await new Promise(ok => { const q = db.transaction('pics').objectStore('pics').get(key); q.onsuccess = () => ok(q.result || null); q.onerror = () => ok(null); }); } catch { return null; } }
async function finTreeCachePut(key, val) { try { const db = await finTreeDB(); const st = db.transaction('pics', 'readwrite').objectStore('pics'); st.put({ ...val, at: Date.now() }, key);
  const all = await new Promise(ok => { const q = st.getAllKeys(); q.onsuccess = () => ok(q.result || []); q.onerror = () => ok([]); }); if (all.length > 3) for (const k of all.filter(k => k !== key).slice(0, all.length - 3)) st.delete(k); } catch {} }
function finTreeShow(key, blob, box) {
  if (FTREE.key !== key) return;
  const old = FTREE.url; FTREE.url = URL.createObjectURL(blob); FTREE.urlKey = key; FTREE.box = box;
  const el = document.getElementById('fin-tree-art'); if (el) el.outerHTML = finTreeImgHTML(true);   // fades in once, when it arrives
  if (old) setTimeout(() => URL.revokeObjectURL(old), 2000);
}
// draw the picture once, in the background; the live canvas shows it as soon as it is ready
async function finTreeBake(key, art) {
  if (FTREE.busy === key) return; FTREE.busy = key;
  try {
    const hit = await finTreeCacheGet(key); if (hit && hit.blob) { finTreeShow(key, hit.blob, hit.box); return; }
    const { box } = art, small = (navigator.deviceMemory && navigator.deviceMemory <= 4) || innerWidth < 700;
    const scale = Math.min(1.25, Math.sqrt((small ? 7e6 : 13e6) / (box.w * box.h)));
    const c = document.createElement('canvas'); c.width = Math.round(box.w * scale); c.height = Math.round(box.h * scale);
    const ctx = c.getContext('2d'), idle = () => new Promise(r => (window.requestIdleCallback ? requestIdleCallback(() => r(), { timeout: 400 }) : setTimeout(r, 30)));
    for (const layer of art.layers) {
      if (FTREE.key !== key) return;                     // the layout changed meanwhile: that picture is not needed
      await idle();
      const src = URL.createObjectURL(new Blob([layer], { type: 'image/svg+xml' })), img = new Image();
      img.src = src; await img.decode(); ctx.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(src);
    }
    const blob = await new Promise(r => c.toBlob(r, 'image/webp', 0.9)) || await new Promise(r => c.toBlob(r, 'image/png'));
    if (!blob) throw new Error('no picture');
    finTreeCachePut(key, { blob, box }); finTreeShow(key, blob, box);
  } catch (e) { console.warn('tree picture', e); FTREE.fail = true; if (FTREE.key === key && UI.fin.cv.mode === 'tree') render(); }
  finally { if (FTREE.busy === key) FTREE.busy = ''; }
}
const finTreeImgHTML = fresh => { const b = FTREE.box; return `<img id="fin-tree-art" class="fin-tree-img${fresh ? ' fresh' : ''}${FTREE.urlKey === FTREE.key ? '' : ' stale'}" src="${FTREE.url}" alt="" draggable="false" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px">`; };
function finTreeSVG(L) {
  const T = L.tree; if (!T) return '';
  const g = finTreeGeom(L), key = JSON.stringify([L.w, L.h, T, (L.flows || []).map(f => [f.id, f.a, f.b, f.t, f.empty, f.still])]);
  if (FTREE.key !== key) { FTREE.key = key; FTREE.art = finTreeArt(L); if (!FTREE.fail) setTimeout(() => finTreeBake(key, FTREE.art), 0); }
  // under everything: plain soil and grass that run on beyond the picture
  const far = `<div class="fin-tree-far" aria-hidden="true" style="top:${g.G}px"></div>`;
  const art = FTREE.fail ? `<div id="fin-tree-art" class="fin-tree-vec" style="left:${FTREE.art.box.x}px;top:${FTREE.art.box.y}px">${FTREE.art.svg}</div>`
    : FTREE.url ? finTreeImgHTML() : finTreeSketch(g, L);
  return far + art + finTreeLive(L, g);
}
// while the picture is being drawn: a soft outline of the same tree (a handful of shapes), replaced by the picture
function finTreeSketch(g, L) {
  const { G, cx, cr, ccx, ccy, RX, RY, topY } = g, tb = 300, tt = 165;
  const trunk = `M${cx - tb - 200},${G + 50} C${cx - tb},${G - 40} ${cx - 210},${G - 260} ${cx - tt},${topY + 60} L${cx - tt - 220},${topY - 160} L${cx + tt + 220},${topY - 160} L${cx + tt},${topY + 60} C${cx + 210},${G - 260} ${cx + tb},${G - 40} ${cx + tb + 200},${G + 50} Z`;
  return `<svg id="fin-tree-art" class="fin-tree-vec sketch" width="${L.w}" height="${L.h}" aria-hidden="true" style="left:0;top:0;overflow:visible">
    ${cr ? `<ellipse cx="${ccx}" cy="${ccy}" rx="${RX * 1.08}" ry="${RY * 1.05}" fill="#2e5a22"/><ellipse cx="${ccx - RX * 0.18}" cy="${ccy - RY * 0.2}" rx="${RX * 0.8}" ry="${RY * 0.75}" fill="#4f8a35"/>` : ''}
    <path d="${trunk}" fill="#4a3422"/><path d="M${cx - 120},${G + 30} C${cx - 400},${G + 120} ${cx - 700},${G + 200} ${cx - 900},${G + 320} M${cx + 120},${G + 30} C${cx + 400},${G + 120} ${cx + 700},${G + 200} ${cx + 900},${G + 320}" stroke="#3a291b" stroke-width="40" fill="none" stroke-linecap="round"/></svg>`;
}
// what stays live on top of the picture: the gold sap and the labels
function finTreeLive(L, g) {
  const { G, cx, ac } = g; let sap = '', labels = '';
  const centre = (a, b, bend = 0) => { const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; return `M${a.x},${a.y} C${a.x + dx / 3 + nx * bend},${a.y + dy / 3 + ny * bend} ${a.x + dx * 2 / 3 + nx * bend * 0.6},${a.y + dy * 2 / 3 + ny * bend * 0.6} ${b.x},${b.y}`; };
  for (const f of L.flows || []) {
    if (f.kind === 'up') { sap += `<path class="sap" d="M${f.a.x},${f.a.y} L${f.b.x},${f.b.y}" style="animation-duration:3.2s"/>`; labels += finTreeLabel(f, f.a.x - 190, (f.a.y + f.b.y) / 2 - 8, 'end', 'sky'); continue; }
    if (f.kind === 'branch') { const a = { x: cx + Math.sign(f.b.x - cx) * 80, y: f.a.y }, b = f.b, bend = -50 * Math.sign(b.x - cx); if (!f.empty) sap += `<path class="sap" d="${centre(a, b, bend)}" style="animation-duration:${Math.max(1.8, 5 - f.t / 18).toFixed(1)}s"/>`;
      const edge = ac ? (b.x < cx ? ac.x : ac.x + ac.w) : a.x; labels += finTreeLabel(f, (edge + b.x) / 2, Math.max(a.y, b.y) + f.t / 2 + 56, 'middle', 'sky'); continue; }
    const b = { x: cx + Math.sign(f.a.x - cx) * 120, y: G + 30 }, a = f.a, bend = 40 * Math.sign(a.x - cx);
    if (!f.empty && !f.still) sap += `<path class="sap" d="${centre(a, b, -bend)}" style="animation-duration:${Math.max(1.8, 5 - f.t / 18).toFixed(1)}s"/>`;
    labels += finTreeLabel(f, (a.x + b.x) / 2 + Math.sign(a.x - cx) * 40, (a.y + b.y) / 2 + 10, a.x < cx ? 'end' : 'start', 'soil');
  }
  return `<svg class="fin-tree" width="${L.w}" height="${L.h}" aria-hidden="true">${sap}${labels}
    <text class="fin-tree-h" x="${ac ? ac.x + ac.w + 80 : L.tree.TX}" y="${G - 80}">↑ Above the ground — your accounts and where money goes</text>
    <text class="fin-tree-h soil" x="${L.tree.TX}" y="${G + 74}">↓ The roots — what feeds your money</text></svg>`;
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
