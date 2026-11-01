// Money is one canvas: the whole picture drawn from the data (accounts, income, spending, card and instalments,
// investments, other people's money, goals, what Claude sorted out) — like the To-do canvas is drawn from the tasks.
// It is laid out in rooms (overview, goals and purchases with their map, accounts, income, spending, card and
// instalments, investments, others' money, what Claude sorted). Tapping a card unfolds its details and charts right
// there; tapping a room's title or a tool card opens that whole part as a room of its own — all on the canvas.
// Below the canvas you talk to it (48-finance-talk.js) and it redraws from what you say.
FIN_ICON.map = '🧭';
UI.fin.cv = { x: 20, y: 20, k: 1, fitted: false, focus: null, dir: 'v', full: false };
UI.fin.panel = null; UI.fin.cvOpen = []; UI.fin.detH = {}; UI.fin.flash = { ids: new Set(), until: 0 };
const FIN_CV_LS = 'ar-fin-cv';
(() => { try { const s = JSON.parse(localStorage.getItem(FIN_CV_LS) || '{}'); UI.fin.cvCol = new Set(s.col || []); if (s.dir === 'h') UI.fin.cv.dir = 'h'; } catch { UI.fin.cvCol = new Set(); } })();
const finCvKeep = () => { try { localStorage.setItem(FIN_CV_LS, JSON.stringify({ col: [...UI.fin.cvCol], dir: UI.fin.cv.dir })); } catch {} };
const finTxt = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const finSecLabel = k => (FIN_SECS.find(s => s[0] === k) || [k, k])[1];
// which canvas node stands for each part, so the open one is marked
const FIN_SEC_NODE = { dash: 'root', accounts: 'accts', inc: 'inc', exp: 'exp', credit: 'com', own: 'own', buy: 'buy', import: 't:import', ledger: 't:ledger', update: 't:update', budget: 't:budget', sim: 't:sim', forecast: 't:forecast' };

/* --- the tree: built fresh from the numbers every part uses --- */
function finCvModel() {
  const p = finP(), n = finNow(), tx = finTx(), today = finToday(), cur = today.slice(0, 7), all = finAll();
  const own = finPosition(), MAX = 8;
  const leaf = (id, label, val, sub, act, cls) => ({ id, type: 'leaf', label, val, sub, act, cls: cls || '', children: [] });
  const tool = (sec, icon, label, sub) => leaf('t:' + sec, label, '', sub, { act: 'fin-sec', s: sec }, 'tool'), tl = {};
  const branch = (id, icon, label, hue, sec, sum, kids, tools = []) => {
    // long lists show the first ones and a card that opens the part for the rest
    const more = kids.length > MAX ? kids.length - MAX + 1 : 0;
    return { id, type: 'branch', icon, label, hue, sec, sum, children: [...tools, ...(more ? [...kids.slice(0, MAX - 1), leaf(id + ':more', `${more} more`, '', 'open to see them all', { act: 'fin-sec', s: sec }, 'more')] : kids)] };
  };
  const B = [], batches = colList('finbatch').filter(b => !b.undone), lastB = batches.map(b => b.to || b.at || '').sort().pop();

  // accounts, with the statements, every transaction and today's balances
  B.push(branch('accts', '🏦', 'Accounts', 210, 'accounts', `cash ${fk(n.cash)}${n.cashKnown < n.cashAccts ? ` · ${n.cashAccts - n.cashKnown} without a balance` : ''}`, n.accts.map(({ a, l }) => {
    const credit = a.kind === 'credit_card' || a.kind === 'bnpl', when = l.date ? `${l.source === 'you' ? 'your update' : 'statement'} · ${fday(l.date)}${l.since ? ` · ${fm(l.since.sum, null, { plus: true, dec: 0 })} since` : ''}` : 'no balance yet';
    if (credit) return leaf('a:' + a.id, a.name, typeof l.owed === 'number' ? `owes ${fk(l.owed)}` : '—', l.available !== null && l.available !== undefined ? `${fk(l.available)} available · ${when}` : a.kind === 'bnpl' ? 'tell the canvas what the app shows' : when, { act: 'fin-acct-ledger', id: a.id }, typeof l.owed === 'number' && l.owed > 0 ? 'neg' : '');
    return leaf('a:' + a.id, a.name, typeof l.balance === 'number' ? fk(l.balance) : '—', (a.id === (finDefAcct() || {}).id ? 'default · ' : '') + when, { act: 'fin-acct-ledger', id: a.id }, typeof l.balance === 'number' && l.balance < 0 ? 'neg' : '');
  }), [tool('import', '🏦', 'Statements', batches.length ? `${batches.length} read${lastB ? ' · latest ' + fday(lastB.slice(0, 10)) : ''}` : 'add one below or here'),
    tool('ledger', '📒', 'All transactions', `${tx.length} recorded`), tool('update', '✍️', 'Balances & history', 'today’s balances, what changed')]));

  // income: what you said, otherwise what the statements show
  const ins = (p.inputs || []).filter(i => i.kind === 'income' && (!i.from || i.from <= today) && (!i.to || i.to >= today));
  const inc = [];
  if (ins.length) ins.forEach(i => inc.push(leaf('in:' + i.id, i.label || 'Income', fk(+i.amount), `you said so${i.from ? ' · from ' + fday(i.from) : ''}`, { act: 'fin-sec', s: 'inc' })));
  else {
    const ib = FIN.incomeBase(all, today);
    if (ib.salary !== null) inc.push(leaf('in:salary', 'Salary', fk(ib.salary), ib.verified ? 'verified in the statements' : 'from the statements', { act: 'fin-sec', s: 'inc' }));
    FIN.recurring(all.entries || []).filter(r => r.dir > 0 && (r.cat || '') !== 'salary').slice(0, 5).forEach(r => inc.push(leaf('in:' + r.key, FIN.cleanDesc(r.name), fk(r.perMonth), `about every ${r.freq === 'monthly' ? 'month' : r.freq || 'month'} · last ${fday(r.last)}`, { act: 'fin-sec', s: 'inc' })));
  }
  const mom = p.holdings.find(h => h.id === 'mom'); if (mom && +mom.myShareMonthly) inc.push(leaf('in:cib', 'CIB investment — my share', fk(+mom.myShareMonthly), 'a month, from the investment', { act: 'fin-sec', s: 'own' }));
  if (!inc.length) inc.push(leaf('in:none', 'No income found yet', '', 'tell the canvas your salary or add the salary account', { act: 'fin-sec', s: 'inc' }, 'muted'));
  B.push(branch('inc', '💼', 'Income', 150, 'inc', `${fk(n.income)} a month`, inc, [tool('sim', '📈', 'Income growth', 'raises and new income ahead')]));

  // spending: categories of the last three complete months, a month on average; then repeating payments
  const done = all.months.filter(b => b.covered && b.m < cur).slice(-3), byCat = {};
  for (const b of done) for (const [k, v] of Object.entries(b.byCat || {})) if ((finCat(k) || {}).kind === 'expense') byCat[k] = (byCat[k] || 0) + v / done.length;
  const cats = Object.entries(byCat).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const rec = FIN.recurring(all.entries || []).filter(r => r.dir < 0 && r.fixed);
  // each category: its average, how the last month compares with the months before, and a small trend line
  const sp = cats.map(([k, v]) => {
    const last = done.length ? (done[done.length - 1].byCat || {})[k] || 0 : 0, prev = done.slice(0, -1), pAvg = prev.length ? prev.reduce((s2, b) => s2 + ((b.byCat || {})[k] || 0), 0) / prev.length : 0;
    const pct = pAvg > 0 && last > 0 ? Math.round((last - pAvg) / pAvg * 100) : null, trend = pct === null ? '' : Math.abs(pct) < 5 ? '≈ as usual · ' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% last month · `;
    const l = leaf('c:' + k, (finCat(k) || { name: k }).name, fk(v), trend + 'a month on average', { act: 'fin-drill-cat', k }, pct !== null && pct >= 15 ? 'trend-up' : pct !== null && pct <= -15 ? 'trend-down' : '');
    l.spark = all.months.slice(-8).map(b => (b.byCat || {})[k] || 0); l.sparkCls = 'exp'; return l; });
  const spB = branch('exp', '🧾', 'Spending', 20, 'exp', `${fk(n.spending)} usual a month`, sp.length ? sp : [leaf('c:none', 'No complete month yet', '', 'add statements to see where money goes', { act: 'fin-sec', s: 'import' }, 'muted')], [tool('budget', '🎯', 'Budget & control', 'limits, this month, savings plan')]);
  if (rec.length) spB.children.push(branch('rec', '🔁', 'Repeating payments', 20, 'exp', `${fk(rec.reduce((s, r) => s + r.perMonth, 0))} a month`, rec.map(r => leaf('r:' + r.key, FIN.cleanDesc(r.name), fk(r.amount), `${r.freq || 'monthly'} · next about ${fday(r.next)}`, { act: 'fin-sec', s: 'budget' }))));
  B.push(spB);

  // card, Halan and instalments
  const com = [];
  if (n.card && n.card.a.stmt && n.card.a.stmt.minDue) { const st = n.card.a.stmt, late = st.dueDate && st.dueDate < today; com.push(leaf('cm:card', 'Card payment due', `${fk(st.minDue)} min.`, st.dueDate ? `due ${fday(st.dueDate)}${late ? ' · next statement shows if it was paid' : ''}` : '', { act: 'fin-sec', s: 'credit' }, late ? 'warn' : '')); }
  n.inst.filter(i => i.status === 'active' || i.status === 'missing').forEach(i => com.push(leaf('i:' + i.key, i.name, `${fk(i.amount)}/mo`, i.of ? `${i.n} of ${i.of} paid · ends ${fmon(i.end)}${i.status === 'missing' ? ' · missing lately' : ''}` : i.end ? `ends ${fmon(i.end)}` : 'end not known', { act: 'fin-sec', s: 'credit' }, i.status === 'missing' ? 'warn' : '')));
  if (n.halan) com.push(leaf('cm:halan', 'Halan', n.halan.available !== null && n.halan.available !== undefined ? `${fk(n.halan.available)} free` : '—', n.halan.terms && n.halan.terms.method ? `terms set · ${n.halan.terms.method}` : 'tell the canvas its limit and terms', { act: 'fin-sec', s: 'credit' }));
  if (!com.length) com.push(leaf('cm:none', 'No instalments found', '', 'they appear here from your statements', { act: 'fin-sec', s: 'credit' }, 'muted'));
  B.push(branch('com', '💳', 'Card, Halan & instalments', 280, 'credit', `${fk(n.instMonthly)} instalments a month`, com));

  // what you own beyond the accounts
  const mine = p.holdings.filter(h => (!h.owner || h.owner === 'me') && h.kind !== 'liability'), liab = p.holdings.filter(h => h.kind === 'liability');
  const hv = h => +h.principal > 0 ? fk(+h.principal, h.currency) : +h.valuation > 0 ? fk(+h.valuation, h.currency) : '—';
  const hs = h => [h.rate ? h.rate + '% a year' : '', h.custodian && h.custodian !== 'me' ? `in ${h.custodian}’s account` : '', h.share ? `${h.share}% share${h.area ? ` of ${h.area - (+h.soldArea || 0)} m²` : ''}` : '', h.handover ? 'handover ' + fmon(h.handover.slice(0, 7)) : ''].filter(Boolean).join(' · ') || ((FIN_HKINDS.find(x => x[0] === h.kind) || [])[1] || '');
  B.push(branch('own', '🏛️', 'Investments & property', 45, 'own', own.net !== null ? `net worth ${fk(own.net)}` : 'net worth needs a rate', [
    ...mine.map(h => leaf('h:' + h.id, h.name, hv(h), hs(h), { act: 'fin-sec', s: 'own' })),
    ...liab.map(h => { const r = finLiab(h).remaining; return leaf('l:' + h.id, h.name, r ? `owes ${fk(r, h.currency)}` : '—', 'still to pay', { act: 'fin-sec', s: 'own' }, r ? 'neg' : ''); }),
  ].concat(mine.length || liab.length ? [] : [leaf('h:none', 'Nothing entered yet', '', 'tell the canvas about certificates, property, investments', { act: 'fin-sec', s: 'own' }, 'muted')])));

  // other people's money: never counted as yours
  const third = FIN.thirdParty(tx, p.parties).filter(x => Math.abs(x.held) >= 0.01).map(x => leaf('t:' + x.id, x.name, fk(x.held), `held for them · in ${fk(x.in)} · out ${fk(x.out)}`, { act: 'fin-sec', s: 'own' }));
  const theirs = p.holdings.filter(h => h.owner && h.owner !== 'me').map(h => leaf('th:' + h.id, h.name, hv(h), `belongs to ${finPartyName(h.owner)} · not counted as yours`, { act: 'fin-sec', s: 'own' }));
  if (third.length || theirs.length) B.push(branch('third', '🤝', 'Others’ money', 330, 'own', `${fk(n.held)} held in your accounts`, [...third, ...theirs]));

  // goals and purchases, with the forecast
  const plan = finBuyPlan();
  const gl = [...plan.items.map(it => leaf('b:' + it.id, it.name + (it.focus ? ' ★' : ''), fk(it.price), `${FIN_REC[it.rec][0]}${it.ready ? ' · ' + fmon(it.ready) : ''}`, { act: 'fin-buy-edit', id: it.id }, it.late ? 'warn' : it.rec === 'not_yet' ? 'muted' : '')),
    ...(p.goals || []).map(g => leaf('g:' + g.id, g.name, fk(+g.target), g.by ? 'by ' + fday(g.by) : 'savings goal', { act: 'fin-sec', s: 'forecast' }))];
  B.push(branch('buy', '🛍️', 'Goals & purchases', 190, 'buy', plan.items.length ? `${fk(plan.total)} to buy${plan.allBy ? ' · all by ' + fmon(plan.allBy) : ''}` : 'nothing planned yet', gl.length ? gl : [leaf('b:none', 'Tell the canvas what you want to buy', '', 'it plans how and when to pay', { act: 'fin-sec', s: 'buy' }, 'muted')], [tool('forecast', '🔭', 'Forecast & savings', 'the months ahead, before and after handover')]));

  // what Claude sorted out by itself (open questions too, when automatic sorting is off)
  const log = (typeof finAutoLog === 'function' ? finAutoLog() : []).slice(-6).reverse(), qs = p.autoFix === false ? finQuestions() : [];
  if (qs.length) B.push(branch('q', '❓', 'Questions for you', 0, 'update', `${qs.length} to answer`, qs.map(q => leaf('q:' + q.id, E.clip(finTxt(q.text), 70), '', 'answer in Balances & history', { act: 'fin-sec', s: 'update' }, 'warn'))));
  else if (log.length) B.push(branch('auto', '🤖', 'Sorted by Claude', 260, 'update', `${(typeof finAutoLog === 'function' ? finAutoLog() : []).length} decision${(typeof finAutoLog === 'function' ? finAutoLog() : []).length === 1 ? '' : 's'} · change any`, log.map(x => leaf('d:' + x.id, x.label, '', x.how + (x.why ? ' · ' + x.why : ''), { act: 'fin-sec', s: x.sec || 'update' }))));


  // trend lines inside the cards: an account's money in minus out by month, the salary month by month
  if (typeof finAcctSpark === 'function') for (const br of B) for (const c of br.children) {
    if (c.id.startsWith('a:')) { const a = finAcct(c.id.slice(2)); if (a && !['credit_card', 'bnpl'].includes(a.kind)) c.spark = finAcctSpark(a.id); }
    else if (c.id === 'in:salary' || (c.id.startsWith('in:') && c.id !== 'in:cib')) { c.spark = all.months.slice(-8).map(b => b.inc || 0); c.sparkCls = 'inc'; }
  }
  const root = { id: 'root', type: 'root', label: 'My money', sec: 'dash', sum: `net worth ${own.net !== null ? fk(own.net) : '—'} · free cash ${fk(n.free)} · saving ${fk(n.capacity)} a month`, children: B };
  if (typeof finAgentModel === 'function') finAgentModel(root);   // the names, hidden cards and moved cards you asked for
  const f = UI.fin.cv.focus && B.find(b => b.id === UI.fin.cv.focus);
  if (f) root.children = [f]; else UI.fin.cv.focus = null;
  return root;
}
// every node's label, value and line, to see what a change moved
function finCvIndex(root) { const m = new Map(), walk = n => { m.set(n.id, [n.label, n.val || '', n.sub || '', n.sum || ''].join('|')); (n.children || []).forEach(walk); }; walk(root || finCvModel()); return m; }

/* --- rooms: each topic its own area of the canvas, laid out in columns; the big ones span the whole width --- */
const FR = { W: 568, GAP: 44, COLS: 3, PAD: 18, HEAD: 70, CG: 12, CW: 260, CH: 56, SW: 360, SH: 64, IW: 560, IH: 64 };
FR.FULL = FR.COLS * FR.W + (FR.COLS - 1) * FR.GAP;
// which room a part opens next to
const FIN_SEC_ROOM = { dash: 'ov', accounts: 'accts', import: 'accts', ledger: 'accts', update: 'accts', inc: 'inc', sim: 'inc', exp: 'exp', budget: 'exp', credit: 'com', own: 'own', forecast: 'buy' };
const finIsOpen = id => UI.fin.cvOpen.includes(id);
// at most three parts open as rooms at once (the oldest closes), so the canvas stays quick
function finSetOpen(id, on) { let o = UI.fin.cvOpen.filter(x => x !== id); if (on === undefined ? !finIsOpen(id) : on) o.push(id); const secs = o.filter(x => x.startsWith('sec:')); if (secs.length > 3) o = o.filter(x => x !== secs[0]); UI.fin.cvOpen = o; return o.includes(id); }
const finSecOpen = k => finIsOpen('sec:' + k);

function finCvRooms(root) {
  const R = [{ id: 'ov', kind: 'ov', full: true, icon: '💰', title: 'My money', sum: root.sum, hue: 340, sec: 'dash' }];
  const buy = root.children.find(b => b.id === 'buy');
  if (buy) R.push({ id: 'buy', kind: 'goals', full: true, node: buy, icon: buy.icon, title: buy.label, sum: buy.sum, hue: buy.hue });
  for (const b of root.children) if (b.id !== 'buy') R.push({ id: b.id, kind: 'room', node: b, icon: b.icon, title: b.label, sum: b.sum, hue: b.hue, sec: b.sec });
  if (typeof finBoxRooms === 'function') R.push(...finBoxRooms());   // your own boxes, made with Tell the canvas
  // parts opened as rooms, each right after the room it belongs to
  const out = [];
  for (const r of R) {
    out.push(r);
    for (const id of UI.fin.cvOpen) { if (!id.startsWith('sec:')) continue; const k = id.slice(4); if ((FIN_SEC_ROOM[k] || 'ov') === r.id && FIN_VIEW[k]) out.push({ id, kind: 'sec', full: true, icon: FIN_ICON[k] || '', title: finSecLabel(k), sum: '', hue: r.hue, sec: k, parent: r.id }); }
  }
  const f = UI.fin.cv.focus; return f ? out.filter(r => r.id === f || r.parent === f) : out;
}
const finDetH = (id, est) => UI.fin.detH[id] || est;
// goals and purchases: where the money comes from on the left, each goal on the right, joined by how it is best paid;
// the timeline and the savings goals below
function finGoalsLayout(r, plan, n, x0, y, iw, cards, dets, edges, subs, grid) {
  const { CG, SW, SH, IW, IH } = FR;
  const kh = finDetH('gk', 120); dets.push({ id: 'gk', x: x0, y, w: iw, h: kh }); y += kh + 18;
  const srcs = [['src:cash', '💵', 'Cash now', fk(n.free), `after a ${fk(n.reserve)} safety reserve and others’ money`],
    ['src:save', '🐖', 'Monthly savings', fk(n.capacity) + ' / month', 'income − usual spending − instalments − goals'],
    ['src:card', '💳', 'Credit card', n.card && n.card.available !== null && n.card.available !== undefined ? fk(n.card.available) + ' free' : '—', n.card && n.card.limit ? `limit ${fk(n.card.limit)}` : 'no card statement yet'],
    ['src:halan', '🛒', 'Halan', n.halan && n.halan.available !== null && n.halan.available !== undefined ? fk(n.halan.available) + ' free' : '—', n.halan && n.halan.terms && n.halan.terms.method ? 'terms set' : 'tell the canvas its limit and terms']];
  const ix = x0 + iw - IW, top = y; let iy = y;
  const items = plan.items.map(it => {
    const c = { id: 'b:' + it.id, type: 'leaf', kind: 'goal', label: it.name + (it.focus ? ' ★' : ''), val: fk(it.price), sub: `${FIN_REC[it.rec][0]}${it.ready ? ' · ' + fmon(it.ready) : ''}${it.monthly ? ' · ' + fk(it.monthly) + '/mo' : ''}`, cls: 'goal ' + (it.late ? 'warn' : it.rec === 'not_yet' ? 'muted' : ''), prog: it.price ? Math.min(1, (it.fromCash || 0) / it.price) : 0, x: ix, y: iy, w: IW, h: IH, it, act: { act: 'fin-cv-det', id: 'b:' + it.id } };
    cards.push(c); iy += IH + 14;
    return c;
  });
  if (!items.length) { const c = { id: 'b:none', type: 'leaf', label: 'Nothing to buy yet', val: '', sub: 'press ＋ above, or tell the canvas “I want a laptop for 40,000 by March”', cls: 'muted', x: ix, y: iy, w: IW, h: IH, act: { act: 'fin-cv-add', id: 'buy' } }; cards.push(c); iy += IH + 14; }
  const blockH = Math.max(iy - top, srcs.length * (SH + 16)), step = blockH / srcs.length;
  srcs.forEach(([id, icon, label, val, sub], i) => { const c = { id, type: 'leaf', kind: 'src', icon, label, val, sub, cls: 'src', x: x0, y: top + i * step + (step - SH) / 2, w: SW, h: SH, act: { act: 'fin-cv-det', id } }; cards.push(c); });
  const from = it => it.rec === 'cash' ? ['src:cash'] : it.rec === 'save' ? (it.fromCash ? ['src:cash', 'src:save'] : ['src:save']) : it.rec === 'card_full' || it.rec === 'card_plan' ? (it.fromCash ? ['src:cash', 'src:card'] : ['src:card']) : it.rec === 'halan' ? ['src:halan'] : [];
  for (const c of items) for (const s of from(c.it)) { const a = cards.find(x => x.id === s); if (a) edges.push({ x0: a.x + a.w, y0: a.y + a.h / 2, x1: c.x, y1: c.y + c.h / 2, cls: 'fin-link ' + FIN_REC[c.it.rec][1], title: `${a.label} → ${c.it.name}` }); }
  y = top + blockH + 22;
  const th = finDetH('gt', 96); dets.push({ id: 'gt', x: x0, y, w: iw, h: th }); y += th + 18;
  // savings goals and the forecast
  const p = finP(), sg = [{ id: 't:forecast', type: 'leaf', label: 'Forecast & savings', val: '', sub: 'the months ahead, before and after handover', cls: 'tool', act: { act: 'fin-cv-sec', s: 'forecast' } },
    ...(p.goals || []).map(g => ({ id: 'g:' + g.id, type: 'leaf', label: g.name, val: g.target ? fk(+g.target) : '—', sub: g.date ? 'by ' + fday(g.date) : 'savings goal', cls: '', act: { act: 'fin-cv-det', id: 'g:' + g.id } }))];
  subs.push({ id: 'sg', label: '🎯 Savings goals and the forecast', sum: '', x: x0, y, w: iw }); y += 34;
  grid(sg, x0, y, iw); return subs.y2 - CG;
}

/* --- details unfolded on the canvas --- */
const finKv = list => `<div class="fin-det-kpis">${list.filter(Boolean).map(([l, v, s]) => `<div class="fin-det-k"><span>${esc(l)}</span><b class="num">${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('')}</div>`;
const finTxList = (tx, n = 6) => tx.length ? `<div class="fin-det-tx">${tx.slice(0, n).map(t => `<div><span class="muted">${fday(t.date)}</span><span>${typeof finLogo === 'function' ? finLogo(t.desc, 'sm') : ''}${esc(FIN.cleanDesc(t.desc || ''))}</span><b class="num ${t.amount < 0 ? '' : 'fin-pos'}">${fm(t.amount)}</b></div>`).join('')}</div>` : '<p class="small muted">No transactions yet.</p>';
const finBar = (v, max, cls) => `<div class="fin-det-bar"><i class="${cls || ''}" style="width:${Math.max(0, Math.min(100, max ? v / max * 100 : 0))}%"></i></div>`;
const finBtn = (act, label, data = {}) => `<button class="btn sm" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${label}</button>`;
const finMonthsRows = (months, f) => months.slice(-12).map(b => ({ label: fmon(b.m), short: fmon(b.m).split(' ')[0], k: b.m, missing: !b.covered, ...f(b) }));
function finCardDetail(id) {
  const p = finP(), n = finNow(), today = finToday(), all = finAll(), [kind, ...rest] = id.split(':'), key = rest.join(':');
  const edit = typeof finCvSpec === 'function' && finCvSpec(id) ? finBtn('fin-cv-edit', '✎ Edit', { id }) : '';
  if (kind === 'a') {
    const a = finAcct(key); if (!a) return ''; const l = finLatest(a), credit = a.kind === 'credit_card' || a.kind === 'bnpl';
    const an = finAn({ from: null, to: null, acctIds: [a.id], catIds: null }), tx = finTx().filter(t => t.acct === a.id).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    return finKv([credit ? ['Owed now', typeof l.owed === 'number' ? fk(l.owed) : '—', l.date ? fday(l.date) : ''] : ['Balance', typeof l.balance === 'number' ? fk(l.balance) : '—', l.date ? `${l.source === 'you' ? 'your update' : 'statement'} · ${fday(l.date)}` : 'no balance yet'],
      credit && ['Available', l.available !== null && l.available !== undefined ? fk(l.available) : '—', l.limit ? 'limit ' + fk(l.limit) : ''], ['Transactions', String(tx.length), esc(a.bank || '')], a.number && ['Number', '••' + FIN.last4(a.number), FIN_AKINDS.concat([['bnpl', 'Buy now, pay later']]).find(x => x[0] === a.kind)?.[1] || '']])
      + (credit && l.limit ? finBar(l.owed || 0, l.limit, 's2') : '')
      + (an.months && an.months.length ? `<h4>Money in and out by month</h4>${finBars(finMonthsRows(an.months, b => ({ a: b.inc, b: b.exp })), { title: 'acct ' + a.id, h: 170, la: 'In', lb: 'Out' })}` : '')
      + `<h4>Latest</h4>${finTxList(tx)}<div class="row">${edit}${finBtn('fin-acct-ledger', '📒 All its transactions', { id: a.id })}</div>`;
  }
  if (kind === 'in') {
    const inp = (p.inputs || []).find(i => i.id === key), hist = inp ? (p.inputs || []).filter(i => i.key === inp.key).sort((x, y) => (y.from || '').localeCompare(x.from || '')) : [];
    const mom = key === 'cib' ? p.holdings.find(h => h.id === 'mom') : null;
    return finKv([['A month', fk(n.income), esc(n.incomeBasis)], mom && ['CIB share', fk(+mom.myShareMonthly), `of ${fk(+mom.principal)} at ${mom.rate}%`]])
      + `<h4>Income by month</h4>${finBars(finMonthsRows(all.months, b => ({ a: b.inc })), { title: 'income months', h: 160, la: 'Income' })}`
      + (hist.length ? `<h4>History</h4><div class="fin-det-tx">${hist.map(i => `<div><span class="muted">from ${fday(i.from)}</span><span>${esc(i.label)}</span><b class="num">${fm(+i.amount)}</b></div>`).join('')}</div>` : '')
      + `<div class="row">${edit}${finBtn('fin-cv-sec', '📈 Income growth', { s: 'sim' })}</div>`;
  }
  if (kind === 'c') {
    const c = finCat(key); if (!c) return ''; const tx = finTx().filter(t => t.cat === key).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
    const by = {}; for (const t of tx) { const k = FIN.cleanDesc(t.desc || '').slice(0, 40); by[k] = (by[k] || 0) + Math.abs(t.amount || 0); }
    const top = Object.entries(by).sort((x, y) => y[1] - x[1]).slice(0, 5), max = top.length ? top[0][1] : 1, bud = (p.budgets || {})[key], cur = (all.months.find(b => b.m === today.slice(0, 7)) || { byCat: {} }).byCat[key] || 0;
    return finKv([['This month', fk(cur), fmon(today.slice(0, 7))], ['Budget', bud !== undefined ? fk(bud) : '—', bud !== undefined ? (cur > bud ? `<span class="fin-neg">over by ${fk(cur - bud)}</span>` : `${fk(bud - cur)} left`) : 'set one with ✎'], ['Transactions', String(tx.length), c.prio || '']])
      + (bud ? finBar(cur, bud, cur > bud ? 'neg' : 's1') : '')
      + `<h4>By month</h4>${finBars(finMonthsRows(all.months, b => ({ b: (b.byCat || {})[key] || 0 })), { title: 'cat ' + key, h: 160, lb: c.name })}`
      + (top.length ? `<h4>Where it goes</h4><div class="fin-det-top">${top.map(([k, v]) => `<div><span>${esc(k)}</span>${finBar(v, max, 's2')}<b class="num">${fk(v)}</b></div>`).join('')}</div>` : '')
      + `<h4>Latest</h4>${finTxList(tx)}<div class="row">${edit}${finBtn('fin-cat-ledger', '📒 Its transactions', { k: key })}</div>`;
  }
  if (kind === 'r') {
    const r = FIN.recurring(all.entries || []).find(x => x.key === key); if (!r) return '';
    return finKv([['Each time', fk(r.amount), r.freq || 'monthly'], ['A year', fk(r.annual), `${r.n} times so far`], ['Next', fday(r.next), 'about'], ['Last', fday(r.last), '']]) + `<h4>Payments</h4>${finTxList(r.ids.map(i => FS.by.get(i)).filter(Boolean).sort((x, y) => y.date.localeCompare(x.date)))}`;
  }
  if (kind === 'i') {
    const i = n.inst.find(x => x.key === key); if (!i) return '';
    const months = []; for (let k = 0, m = today.slice(0, 7); k < 12; k++, m = FIN.addMonths ? FIN.addMonths(m, 1) : m) months.push(m);
    return finKv([['A month', fk(i.amount), i.status], ['Paid', i.of ? `${i.n} of ${i.of}` : '—', i.remaining !== null && i.remaining !== undefined ? `${i.remaining} left` : 'count not known'], ['Still to pay', i.outstanding ? fk(i.outstanding) : '—', i.end ? 'until ' + fmon(i.end) : '']])
      + (i.of ? finBar(i.n, i.of, 's3') : '')
      + `<h4>The coming months</h4>${finBars(months.map(m => ({ label: fmon(m), short: fmon(m).split(' ')[0], k: m, b: FIN.installmentLoad([i], m) })), { title: 'inst ' + key, h: 150, lb: i.name })}<div class="row">${edit}${finBtn('fin-cv-sec', '💳 Card, Halan & instalments', { s: 'credit' })}</div>`;
  }
  if (id === 'cm:card' && n.card) { const st = n.card.a.stmt || {}; return finKv([['Owed', fk(n.card.owed), st.date ? 'statement ' + fday(st.date) : ''], ['Available', fk(n.card.available), 'limit ' + fk(n.card.limit)], ['Minimum due', st.minDue ? fk(st.minDue) : '—', st.dueDate ? 'by ' + fday(st.dueDate) : '']]) + finBar(n.card.owed || 0, n.card.limit || 1, 's2') + `<div class="row">${finBtn('fin-cv-det', '💳 The card', { id: 'a:' + n.card.a.id })}</div>`; }
  if (id === 'cm:halan' && n.halan) { const t = n.halan.terms || {}; let q = null; try { q = t.method ? FIN.financeQuote(10000, t, t.months || 12) : null; } catch {} return finKv([['Limit', n.halan.limit ? fk(n.halan.limit) : '—', ''], ['Available', n.halan.available !== null && n.halan.available !== undefined ? fk(n.halan.available) : '—', ''], ['Terms', t.method ? `${t.rate || 0}% ${t.method === 'reducing' ? 'a year' : 'a month'}` : 'not set', t.months ? t.months + ' months' : '']]) + (q ? `<p class="small">10,000 over ${q.months} months → <b>${fm(q.monthly)}</b> a month, ${fm(q.cost)} extra.</p>` : '') + `<div class="row">${edit}</div>`; }
  if (kind === 'h' || kind === 'th' || kind === 'l') {
    const h = p.holdings.find(x => x.id === key); if (!h) return ''; const amt = +(h.principal || h.valuation || 0);
    return finKv([['Amount', amt ? fk(amt, h.currency) : '—', h.kind === 'property' ? 'value you entered' : ''], h.rate && ['Return', h.rate + '% a year', `${fk(amt * h.rate / 100)} a year · ${fk(amt * h.rate / 1200)} a month`], h.myShareMonthly && ['Your share', fk(+h.myShareMonthly) + ' / month', ''], h.share && ['Share', h.share + '%', h.area ? `of ${h.area - (+h.soldArea || 0)} m²` : ''], h.handover && ['Handover', fmon(h.handover.slice(0, 7)), ''], kind === 'l' && ['Still to pay', fk(finLiab(h).remaining), ''], ['Held', h.custodian && h.custodian !== 'me' ? `in ${esc(h.custodian)}’s name` : 'by you', h.owner && h.owner !== 'me' ? 'belongs to ' + esc(finPartyName(h.owner)) : '']])
      + (h.note ? `<p class="small muted">${esc(h.note)}</p>` : '') + ((h.history || []).length ? `<h4>Changes</h4><div class="fin-det-tx">${h.history.slice(-5).reverse().map(x => `<div><span class="muted">${fday((x.at || '').slice(0, 10))}</span><span>before</span><b class="num">${x.principal ? fm(+x.principal) : x.valuation ? fm(+x.valuation) : '—'}</b></div>`).join('')}</div>` : '')
      + `<div class="row">${edit}${finBtn('fin-cv-sec', '🏛️ Ownership', { s: 'own' })}</div>`;
  }
  if (kind === 't') { const x = FIN.thirdParty(finTx(), p.parties).find(z => z.id === key); if (!x) return ''; return finKv([['Came in', fk(x.in), ''], ['Went out', fk(x.out), ''], ['Still held', fk(x.held), 'not yours']]) + `<h4>Their money</h4>${finTxList(x.items.slice().sort((a, b) => b.date.localeCompare(a.date)))}<div class="row">${edit}</div>`; }
  if (kind === 'b') {
    const it = finBuyPlan().items.find(z => z.id === key); if (!it) return ''; const o = it.options || {};
    const opt = (label, ok, q) => `<tr class="${it.rec === label[1] ? 'on' : ''}"><td>${label[0]}</td><td>${ok ? '✓' : '—'}</td><td class="num">${q ? fm(q.monthly) + ' × ' + q.months : ''}</td><td class="num">${q ? fm(q.cost) : ''}</td></tr>`;
    return finKv([['Price', fk(it.price), it.wantBy ? 'wanted by ' + fday(it.wantBy) : 'no date'], ['Best way', FIN_REC[it.rec][0], it.ready ? 'ready ' + fmon(it.ready) : ''], ['From cash now', fk(it.fromCash), ''], ['A month', it.monthly ? fk(it.monthly) : '—', it.months ? it.months + ' months' : '']])
      + finBar(it.fromCash || 0, it.price, 's3') + `<p class="small">${esc(it.why)}</p>`
      + `<table class="tbl fin-det-opt"><thead><tr><th>Way to pay</th><th>Fits</th><th class="num">A month</th><th class="num">Extra cost</th></tr></thead><tbody>${opt(['Cash now', 'cash'], o.cash)}${opt(['Card, paid in full', 'card_full'], o.cardFull)}${opt(['Card instalments', 'card_plan'], !!o.cardPlan, o.cardPlan)}${opt(['Halan instalments', 'halan'], !!o.halan, o.halan)}</tbody></table>`
      + `<div class="row">${edit}${finBtn('fin-buy-star', it.focus ? '☆ Not first' : '★ Do this first', { id: key })}${finBtn('fin-buy-done', '✓ Bought', { id: key })}</div>`;
  }
  if (kind === 'g') { const g = (p.goals || []).find(z => z.id === key); if (!g) return ''; const t = +g.target || 0, sv = +g.saved || 0; return finKv([['Target', t ? fk(t) : '—', g.date ? 'by ' + fday(g.date) : ''], ['Saved', fk(sv), t ? Math.round(sv / t * 100) + '%' : ''], ['A month', g.monthly ? fk(+g.monthly) : '—', '']]) + (t ? finBar(sv, t, 's3') : '') + `<div class="row">${edit}${finBtn('fin-cv-sec', '🔭 Forecast', { s: 'forecast' })}</div>`; }
  if (kind === 'src') {
    const map = { cash: [['Free cash now', fk(n.free), `cash ${fk(n.cash)} − reserve ${fk(n.reserve)} − others’ ${fk(n.held)}`]], save: [['Income', fk(n.income), esc(n.incomeBasis)], ['Usual spending', fk(n.spending), esc(n.spendBasis)], ['Instalments', fk(n.instMonthly), ''], ['Left to save', fk(n.capacity), 'a month']], card: [['Available', n.card ? fk(n.card.available) : '—', n.card ? 'limit ' + fk(n.card.limit) : '']], halan: [['Available', n.halan && n.halan.available !== null && n.halan.available !== undefined ? fk(n.halan.available) : '—', '']] }[key] || [];
    return finKv(map) + (key === 'card' || key === 'halan' ? `<div class="row">${finBtn('fin-cv-sec', '💳 Terms', { s: 'credit' })}</div>` : '');
  }
  if (kind === 'al') return finAlertDetail(id);
  if (kind === 'd') { const x = (typeof finAutoLog === 'function' ? finAutoLog() : []).find(z => z.id === key); if (!x) return ''; return `<p><b>${esc(x.label)}</b></p><p>Decided: <b>${esc(x.how)}</b> ${x.by === 'rule' ? '<span class="fin-tag">rule</span>' : '<span class="fin-tag">Claude</span>'}</p>${x.why ? `<p class="small muted">${esc(x.why)}</p>` : ''}<p class="small">${fmtDateTime(x.at)} · tell the canvas if it is wrong.</p>`; }
  if (kind === 'q') { const q = finQuestions().find(z => z.id === key); return q ? `<p>${q.text}</p>${finBtn('fin-cv-sec', '✍️ Answer', { s: 'update' })}` : ''; }
  return '';
}
function finOverviewHTML() {
  const n = finNow(), own = finPosition(), all = finAll();
  return finKv([['Net worth', own.net !== null ? fk(own.net) : '—', own.estimated ? 'includes estimates' : 'own money only'], ['Cash', fk(n.cash), `${n.cashKnown} of ${n.cashAccts} accounts known`], ['Free cash', fk(n.free), `after a ${fk(n.reserve)} reserve`], ['Income', fk(n.income) + '/mo', esc(n.incomeBasis)], ['Usual spending', fk(n.spending) + '/mo', esc(n.spendBasis)], ['Saving', fk(n.capacity) + '/mo', 'what is left'], ['Instalments', fk(n.instMonthly) + '/mo', `${n.inst.filter(i => i.status === 'active' || i.status === 'missing').length} running`], n.card && ['Card', 'owes ' + fk(n.card.owed), fk(n.card.available) + ' free'], n.health.score !== null && ['Health', n.health.score + '/100', '']])
    + `<div class="fin-ov-chart"><h4>Income and spending by month</h4>${finBars(finMonthsRows(all.months, b => ({ a: b.inc, b: b.exp, net: b.covered ? FIN.r2(b.inc - b.exp) : null })), { title: 'overview months', h: 190, net: true })}</div>`
    + (typeof finCashMonthsHTML === 'function' ? finCashMonthsHTML() : '')
    + `<div class="row">${finBtn('fin-cv-sec', '📊 Full dashboard', { s: 'dash' })}${finBtn('fin-cv-sec', '🎯 Budget', { s: 'budget' })}${finBtn('fin-cv-sec', '🔭 Forecast', { s: 'forecast' })}${finBtn('fin-cv-sec', '✍️ Balances', { s: 'update' })}</div>`;
}
function finGoalsHead(plan, n) {
  const focus = !!finP().buyFocus;
  return finKv([['To buy', fk(plan.total), `${plan.items.length} item${plan.items.length === 1 ? '' : 's'}`], ['From cash now', fk(plan.fromCash), `free cash ${fk(n.free)}`], ['Saving a month', fk(plan.monthly), `of ${fk(n.capacity)} you can save`], ['Card repayments', fk(plan.cardRepay), 'paid in full next statement'], ['Everything by', plan.allBy ? fmon(plan.allBy) : '—', (() => { const late = plan.items.filter(i => i.late).length; return late ? `${late} after the date you want` : 'on your dates'; })()]])
    + `<div class="row"><div class="seg" role="group" aria-label="Order"><button data-act="fin-buy-focus" data-v="0" aria-pressed="${!focus}">All goals</button><button data-act="fin-buy-focus" data-v="1" aria-pressed="${focus}">★ Focus first</button></div>${finBtn('fin-cv-add', '＋ Add a goal', { id: 'buy' })}</div>`;
}
function finGoalsTimeline(plan) {
  const months = [...new Set(plan.items.map(i => i.ready).filter(Boolean))].sort();
  return `<h4>When each becomes affordable</h4>${months.length ? `<div class="fin-tl">${months.map(m => `<div class="fin-tl-m"><b>${fmon(m)}</b>${plan.items.filter(i => i.ready === m).map(i => `<span class="fin-tag ${i.late ? 'crit' : 'ok'}">${esc(i.name)}</span>`).join('')}</div>`).join('')}</div>` : '<p class="small muted">Nothing planned yet.</p>'}`;
}
function finDetBody(id, plan, n) {
  if (id === 'ov') return finOverviewHTML();
  if (id === 'free' && typeof finFreeHTML === 'function') return finFreeHTML();
  if (id.startsWith('box:') && typeof finBoxHTML === 'function') return finBoxHTML(id);
  if (id === 'gk') return finGoalsHead(plan, n);
  if (id === 'gt') return finGoalsTimeline(plan);
  if (id === 'up') return finUpcomingHTML();
  if (id.startsWith('sec:')) { const k = id.slice(4); try { return (['dash', 'ledger', 'exp', 'inc'].includes(k) ? finFilterBar() : '') + FIN_VIEW[k](); } catch (e) { console.error(e); return `<p class="small muted">This part could not be drawn (${esc(e.message || String(e))}).</p>`; } }
  try { return finCardDetail(id) || '<p class="small muted">Nothing more to show.</p>'; } catch (e) { console.error(e); return `<p class="small muted">Could not show this (${esc(e.message || String(e))}).</p>`; }
}

/* --- a card's details pop out beside it: the canvas stays where it is, and stays usable --- */
UI.fin.pop = null;
function finPopHTML() {
  const id = UI.fin.pop, c = id && UI.fin.cvCards && UI.fin.cvCards.get(id); if (!c) return '';
  const body = finDetBody(id, finBuyPlan(), finNow()), enter = Date.now() - (UI.fin.popAt || 0) < 450 ? ' enter' : '';
  return `<div class="fin-pop${enter}" id="fin-pop" data-pop="${esc(id)}" role="dialog" aria-label="${esc(c.label)}" style="--h:${c.hue ?? 200}">
    <div class="fin-pop-h">${c.icon ? `<span class="fin-pop-ic" aria-hidden="true">${c.icon}</span>` : ''}<div class="fin-pop-t"><b>${esc(c.label)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</div>${c.val ? `<span class="fin-pop-v num">${esc(c.val)}</span>` : ''}<button class="icon-btn" data-act="fin-pop-x" title="Close (Esc)" aria-label="Close">${I.x}</button></div>
    <div class="fin-pop-b">${body}</div></div>`;
}
// beside its card, sized to the canvas window, kept inside the part of the canvas you can see — never cut off
// (right or left of the card where there is room, else below or above; when nothing fits, centred over the canvas).
// It grows out of the card itself the first time it opens, and goes back into it when it closes.
function finPopGeom() {
  const vp = $('#fin-cv-vp'), b = UI.fin.pop && UI.fin.cvPos && UI.fin.cvPos.get(UI.fin.pop); if (!vp || !b) return null;
  const cv = UI.fin.cv, W = vp.clientWidth, H = vp.clientHeight, R = vp.getBoundingClientRect();
  const rail = document.querySelector('.rail'), railB = rail && getComputedStyle(rail).position === 'sticky' ? rail.getBoundingClientRect().bottom : 0;
  const top = Math.max(0, railB - R.top, -R.top) + 8, bottom = Math.min(H, innerHeight - R.top) - 8;   // what you can see of the canvas
  return { vp, W, H, top, bottom, ax: cv.x + b.x * cv.k, ay: cv.y + b.y * cv.k, aw: b.w * cv.k, ah: b.h * cv.k };
}
function finPopPlace() {
  const el = $('#fin-pop'), G = finPopGeom(); if (!el || !G) return;
  const { W, top, bottom, ax, ay, aw, ah } = G, VH = Math.max(160, bottom - top), gap = 16, acx = ax + aw / 2, acy = ay + ah / 2;
  // its size follows the window: a column on a wide canvas, nearly the whole width on a narrow one; never taller than what you see
  const w = W < 700 ? W - 16 : Math.round(Math.min(560, Math.max(360, W * 0.38)));
  el.style.width = w + 'px'; el.style.maxHeight = VH + 'px';
  const h = Math.min(el.scrollHeight, VH);
  const room = { r: W - 8 - (ax + aw + gap), l: ax - gap - 8, b: bottom - (ay + ah + gap), t: ay - gap - top };
  let side, x, y;
  if (room.r >= w && room.r >= room.l) side = 'r'; else if (room.l >= w) side = 'l'; else if (room.r >= w) side = 'r';
  else if (room.b >= Math.min(h, VH * 0.55) && room.b >= room.t) side = 'b'; else if (room.t >= Math.min(h, VH * 0.55)) side = 't'; else side = 'c';
  if (side === 'r' || side === 'l') { x = side === 'r' ? ax + aw + gap : ax - gap - w; y = Math.max(top, Math.min(bottom - h, acy - h / 2)); }
  else if (side === 'b' || side === 't') { x = Math.max(8, Math.min(W - w - 8, acx - w / 2)); y = side === 'b' ? Math.min(bottom - h, ay + ah + gap) : Math.max(top, ay - gap - h); }
  else { x = Math.max(8, (W - w) / 2); y = top + Math.max(0, (VH - h) / 2); }
  el.classList.remove('r', 'l', 'b', 't', 'c'); el.classList.add(side);
  const py = Math.max(18, Math.min(h - 18, acy - y)), px = Math.max(18, Math.min(w - 18, acx - x));
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  el.style.setProperty('--py', py + 'px'); el.style.setProperty('--px', px + 'px');
  // the pointer hides when its card has left the window, or the pop-out is centred
  el.classList.toggle('far', side === 'c' || acx < 0 || acx > W || acy < top || acy > bottom);
  // the first time: it grows out of the card — from the card's own size and place on the screen to its own
  const key = UI.fin.pop + '@' + UI.fin.popAt, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (UI.fin.popGrown !== key && el.classList.contains('enter')) UI.fin.popGrown = key, UI.fin.popGrow = { t: performance.now(), ax, ay, aw, ah, el: null };
  // (the canvas may redraw while it grows — the new pop-out carries on from the same moment)
  const GR = UI.fin.popGrow, since = GR ? performance.now() - GR.t : 1e9;
  if (UI.fin.popGrown === key && GR && GR.el !== el && since < 440 && !reduce && el.animate && GR.aw > 2 && GR.ah > 2) {
    GR.el = el; const sx = Math.max(0.05, GR.aw / w), sy = Math.max(0.05, GR.ah / Math.max(1, h));
    const an = el.animate([{ transformOrigin: '0 0', transform: `translate(${GR.ax - x}px, ${GR.ay - y}px) scale(${sx}, ${sy})`, opacity: 0.35, borderRadius: '10px' },
      { transformOrigin: '0 0', transform: 'none', opacity: 1, borderRadius: '20px' }], { duration: 440, easing: 'cubic-bezier(.2, .9, .22, 1)' });
    an.currentTime = since;
  }
}
function finPopOpen(id) { UI.fin.pop = id; UI.fin.popAt = Date.now(); render(); }
function finPopClose() {
  const el = $('#fin-pop'); if (!el || !UI.fin.pop) { UI.fin.pop = null; render(); return; }
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.classList.remove('enter');
  // back into its card: the reverse of how it came out
  const G = finPopGeom(), r = el.getBoundingClientRect(), V = G && G.vp.getBoundingClientRect();
  if (!reduce && G && el.animate && G.aw > 2 && G.ah > 2) {
    const x = r.left - V.left, y = r.top - V.top;
    el.animate([{ transformOrigin: '0 0', transform: 'none', opacity: 1 }, { transformOrigin: '0 0', transform: `translate(${G.ax - x}px, ${G.ay - y}px) scale(${Math.max(0.05, G.aw / r.width)}, ${Math.max(0.05, G.ah / r.height)})`, opacity: 0.2 }], { duration: 260, easing: 'cubic-bezier(.4, 0, .7, .2)', fill: 'forwards' });
  } else el.classList.add('leave');
  setTimeout(() => { UI.fin.pop = null; render(); }, reduce ? 0 : 250);
}
// a tap on an empty part of the canvas puts the pop-out away
document.addEventListener('click', e => { if (UI.view !== 'finance' || !UI.fin.pop || !e.target.closest) return; if (e.target.closest('#fin-cv-vp') && !e.target.closest('.fin-cvn, .fin-det, button, a, input, select, textarea, label')) finPopClose(); });

/* --- drawing --- */
const finCvAttrs = a => a ? Object.entries(a).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : '';
function finCvCard(c, hue) {
  const st = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;--h:${hue ?? 200}`;
  const tool = c.cls.includes('tool'), open = UI.fin.pop === c.id || (tool && c.act && finSecOpen(c.act.s)) ? ' sel' : '', fresh = Date.now() < UI.fin.flash.until && UI.fin.flash.ids.has(c.id) ? ' fresh' : '';
  const act = tool || c.cls.includes('more') ? { act: 'fin-cv-sec', s: (c.act && c.act.s) || 'ledger' } : c.act && c.act.act === 'fin-cv-add' ? c.act : { act: 'fin-cv-det', id: c.id };
  const editable = typeof finCvSpec === 'function' && !tool && !c.cls.includes('more') && !!finCvSpec(c.id);
  const brand = typeof finCardBrand === 'function' ? finCardBrand(c) : null;   // a company's card shows its logo
  return `<div class="mnode fin-cvn fin-leaf ${c.cls}${open}${fresh}${editable ? ' editable' : ''}" role="button" tabindex="0" aria-expanded="${!!open}" ${finCvAttrs(act)} data-node="${esc(c.id)}" title="${esc(c.label)}${c.val ? ' — ' + esc(c.val) : ''}${c.sub ? '\n' + esc(c.sub) : ''}" style="${st}">
    ${brand ? finLogo(brand, 'card') : c.icon ? `<span class="gicon fin-cv-ic" aria-hidden="true">${c.icon}</span>` : ''}<div class="mtxt"><b>${tool ? '<span class="fin-tool-i" aria-hidden="true">' + (FIN_ICON[act.s] || '') + '</span>' : ''}${esc(c.label)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</div>${c.val ? `<span class="fin-cv-v num">${esc(c.val)}</span>` : ''}${c.spark && typeof finSparkSVG === 'function' ? finSparkSVG(c.spark, c.sparkCls) : ''}${c.prog ? `<i class="fin-prog" style="width:${Math.round(c.prog * 100)}%" title="${Math.round(c.prog * 100)}% from cash now"></i>` : ''}${editable ? `<button class="fin-cv-btn ed" data-act="fin-cv-edit" data-id="${esc(c.id)}" title="Edit (or double-tap, F2)" aria-label="Edit ${esc(c.label)}">✎</button>` : ''}</div>`;
}
function finCvRoom(r) {
  const folded = UI.fin.cvCol.has(r.id), fresh = Date.now() < UI.fin.flash.until && UI.fin.flash.ids.has(r.id) ? ' fresh' : '';
  const hasKids = r.kind === 'room' ? r.node.children.length : r.kind !== 'sec';   // overview, coming up and goals fold too
  const aid = r.addId === undefined ? r.id : r.addId, solo = !r.syn && r.kind !== 'free' && r.kind !== 'box';   // the Mind map's own branches and centre: no "only this room"
  const titleAct = r.kind === 'sec' ? `data-act="fin-cv-sec" data-s="${esc(r.sec)}"` : r.sec ? `data-act="fin-cv-sec" data-s="${esc(r.sec)}"` : '';
  return `<section class="fin-room ${r.kind}${r.cls ? ' tr-' + r.cls : ''}${fresh}" data-room="${esc(r.id)}" style="left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;--h:${r.hue ?? 200}">
    <div class="fin-room-h">
      <div class="fin-room-t fin-cvn${r.sec && r.kind !== 'sec' && finSecOpen(r.sec) ? ' sel' : ''}" data-node="${esc(r.id)}" ${titleAct} role="button" tabindex="0" title="${r.kind === 'sec' ? 'Close' : r.sec ? 'Open ' + esc(finSecLabel(r.sec)) + ' here' : ''}"><span class="fin-room-ic" aria-hidden="true">${r.icon}</span><div><b>${esc(r.title)}</b>${r.sum ? `<small>${esc(r.sum)}</small>` : ''}</div>${r.sec && r.kind !== 'sec' ? `<span class="fin-room-go">${finSecOpen(r.sec) ? '▴ close' : '▾ open'}</span>` : ''}</div>
      <span class="spacer"></span>
      ${typeof finCvAddSpec === 'function' && aid && finCvAddSpec(aid) ? `<button class="btn sm ghost" data-act="fin-cv-add" data-id="${esc(aid)}" title="Add" aria-label="Add to ${esc(r.title)}">＋</button>` : ''}
      ${r.kind === 'sec' ? `<button class="btn sm ghost" data-act="fin-cv-sec" data-s="${esc(r.sec)}" aria-label="Close ${esc(r.title)}">✕</button>`
        : `${r.kind === 'box' ? `<button class="btn sm ghost" data-act="fin-box-del" data-id="${esc(r.id)}" title="Remove this box" aria-label="Remove ${esc(r.title)}">✕</button>` : ''}${hasKids ? `<button class="btn sm ghost" data-act="fin-cv-tog" data-id="${esc(r.id)}" aria-expanded="${!folded}" title="${folded ? 'Unfold' : 'Fold'}" aria-label="${folded ? 'Unfold' : 'Fold'} ${esc(r.title)}">${folded ? '▸' : '▾'}</button>` : ''}${solo ? `<button class="btn sm ghost" data-act="fin-cv-focus" data-id="${esc(r.id)}" title="${UI.fin.cv.focus === r.id ? 'Show everything' : 'Show only this room'}" aria-label="${UI.fin.cv.focus === r.id ? 'Show everything' : 'Show only ' + esc(r.title)}">⤢</button>` : ''}`}
    </div></section>`;
}
function finCvBoard() {
  const cv = UI.fin.cv, root = finCvModel(), n = finNow(), plan = finBuyPlan(), rooms = finCvRooms(root), rich = cv.mode === 'rich' && typeof finRichLayout === 'function', flow = cv.mode === 'flow' && typeof finFlowLayout === 'function', L = rich ? finRichLayout(rooms, plan, n) : flow ? finFlowLayout(rooms, plan, n) : finMindLayout(rooms, plan, n);   // the Mind map unless another layout is chosen
  const hueOf = new Map(); for (const r of rooms) { const walk = k => { hueOf.set(k.id, r.hue); (k.children || []).forEach(walk); }; if (r.node) walk(r.node); }
  const T = typeof finCanvasP === 'function' ? finCanvasP().titles : {}; for (const r of L.rooms) if (T[r.id]) r.title = T[r.id];   // branch names you chose
  UI.fin.cvSize = { w: L.w, h: L.h }; UI.fin.cvCards = new Map(L.cards.map(c => [c.id, c]));
  if (UI.fin.pop && !UI.fin.cvCards.has(UI.fin.pop)) UI.fin.pop = null;
  const path = e => { const mx = (e.x0 + e.x1) / 2; return `M${e.x0},${e.y0} C${mx},${e.y0} ${mx},${e.y1} ${e.x1},${e.y1}`; };
  // the entrance plays when you open the canvas (within its first moment), not on every redraw after
  const now = Date.now(); if (!UI.fin.cvShownAt) UI.fin.cvShownAt = now; const intro = now - UI.fin.cvShownAt < 700;
  return `<div class="fin-cv-vp cosmic${rich ? ' mode-rich' : flow ? ' mode-flow' : ' mode-mind'}${intro ? ' intro' : ''}${cv.k < 0.62 ? ' z-far' : ''}" id="fin-cv-vp">${typeof finFlowSky === 'function' ? finFlowSky() : ''}<div class="fin-cv-world" id="fin-cv-world" style="width:${L.w}px;height:${L.h}px;transform:translate(${cv.x}px,${cv.y}px) scale(${cv.k})">
      ${rich ? finRichSVG(L) : flow ? finFlowSVG(L) : finMindSVG(L)}${L.rooms.map(finCvRoom).join('')}
      <svg class="fin-cv-edges" width="${L.w}" height="${L.h}" aria-hidden="true">${L.edges.map(e => `<path class="${e.cls}" d="${path(e)}"><title>${esc(e.title)}</title></path>`).join('')}</svg>
      ${L.subs.map(s => `<div class="fin-room-sub" style="left:${s.x}px;top:${s.y}px;width:${s.w}px"><b>${esc(s.label)}</b>${s.sum ? ` <small>${esc(s.sum)}</small>` : ''}</div>`).join('')}
      ${L.cards.map(c => finCvCard(c, hueOf.get(c.id) ?? (c.id.startsWith('b:') || c.id.startsWith('src:') || c.id.startsWith('g:') ? 190 : 200))).join('')}
      ${L.dets.map(d => `<div class="fin-det ${d.id.startsWith('sec:') ? 'sec' : ''}" data-det="${esc(d.id)}" style="left:${d.x}px;top:${d.y}px;width:${d.w}px" ${d.id.startsWith('sec:') ? `id="fin-${esc(d.id.replace(':', '-'))}"` : ''}><div class="fin-det-in">${finDetBody(d.id, plan, n)}</div></div>`).join('')}
    </div></div>`;
}

const finTabs = () => `<div class="seg fin-tabs" role="tablist" aria-label="Money">${[['canvas', '🧭 Canvas'], ['settings', '⚙️ Settings']].map(([k, l]) => `<button role="tab" data-act="fin-tab" data-v="${k}" aria-selected="${(UI.fin.tab || 'canvas') === k}" aria-pressed="${(UI.fin.tab || 'canvas') === k}">${l}</button>`).join('')}</div>`;
VIEW_FN.finance = () => {
  const cv = UI.fin.cv;
  // full screen: the canvas alone — no title, no description, no talk box; a few controls float in its corner
  if (cv.full) return `<div class="wrap fin fin-canvas-page"><section class="fin-cvwrap full" id="fin-s-map" aria-label="Money canvas, full screen">
    <div class="fin-cv-stage">${finCvBoard()}${finPopHTML()}${typeof finCvMiniHTML === 'function' ? finCvMiniHTML() + finCvHelpHTML() : ''}${typeof finCvEditorHTML === 'function' ? finCvEditorHTML() : ''}${typeof finTalkWinHTML === 'function' ? finTalkWinHTML() + finMenuHTML() : ''}${typeof finBalWinHTML === 'function' ? finBalTabHTML() + finBalWinHTML() : ''}
      <div class="fin-cv-float" role="toolbar" aria-label="Canvas controls">${typeof finCvToolsHTML === 'function' ? finCvToolsHTML() : ''}
        ${UI.fin.cvOpen.length || UI.fin.pop ? `<button class="btn sm" data-act="fin-cv-close-all" title="Fold every opened detail and part">Close details</button>` : ''}
        <div class="seg zoom" role="group" aria-label="Zoom"><button data-act="fin-cv-zoom" data-v="out" aria-label="Zoom out">−</button><button data-act="fin-cv-fit" title="Fit to the screen"><span id="fin-cv-z">${Math.round(cv.k * 100)}%</span></button><button data-act="fin-cv-zoom" data-v="in" aria-label="Zoom in">+</button></div>
        <button class="btn sm" data-act="fin-cv-full" aria-pressed="true" title="Back (Esc)">✕ Exit full screen</button>
      </div></div>
  </section></div>`;
  if (UI.fin.tab === 'settings') return `<div class="wrap fin fin-settings-page"><div class="fin-cv-bar"><h1>Money</h1>${finTabs()}</div>${FIN_VIEW.settings()}</div>`;
  return `<div class="wrap fin fin-canvas-page">
  <section class="fin-cvwrap ${cv.full ? 'full' : ''}" id="fin-s-map" aria-label="Money canvas">
    <div class="fin-cv-bar"><h1>Money</h1>${finTabs()}<span class="spacer"></span>
      ${typeof finCvToolsHTML === 'function' ? finCvToolsHTML() : ''}
      ${cv.focus ? `<button class="btn sm" data-act="fin-cv-focus" data-id="">Show everything</button>` : ''}
      ${UI.fin.cvOpen.length || UI.fin.pop ? `<button class="btn sm" data-act="fin-cv-close-all" title="Fold every opened detail and part">Close details</button>` : ''}
      <button class="btn sm" data-act="fin-new-tx" title="Add a transaction by hand">${I.plus} Transaction</button>
      <button class="btn sm" data-act="fin-cv-all" data-v="open" title="Unfold every room">Unfold all</button><button class="btn sm" data-act="fin-cv-all" data-v="fold" title="Fold every room to its title">Fold all</button>
      <div class="seg zoom" role="group" aria-label="Zoom"><button data-act="fin-cv-zoom" data-v="out" aria-label="Zoom out">−</button><button data-act="fin-cv-fit" title="Fit to the screen"><span id="fin-cv-z">${Math.round(cv.k * 100)}%</span></button><button data-act="fin-cv-zoom" data-v="in" aria-label="Zoom in">+</button></div>
      <button class="btn sm" data-act="fin-cv-full" aria-pressed="${cv.full}" title="${cv.full ? 'Back (Esc)' : 'Full screen'}">${cv.full ? '✕ Close' : '⤢ Full screen'}</button></div>
    <div class="fin-cv-stage">${finCvBoard()}${finPopHTML()}${typeof finCvMiniHTML === 'function' ? finCvMiniHTML() + finCvHelpHTML() : ''}${typeof finCvEditorHTML === 'function' ? finCvEditorHTML() : ''}${typeof finTalkWinHTML === 'function' ? finTalkWinHTML() + finMenuHTML() : ''}${typeof finBalWinHTML === 'function' ? finBalTabHTML() + finBalWinHTML() : ''}</div>
  </section>
  ${typeof finTalkHTML === 'function' ? `<section class="card fin-card fin-talk-card" aria-label="Tell the canvas"><div class="row"><h2>Tell the canvas</h2><span class="spacer"></span>${UI.fin.talk.win ? '' : `<button class="btn sm ghost" data-act="fin-talk-win" title="Open it in a window on the canvas ( T )">⧉ Open on the canvas</button>`}</div>${UI.fin.talk.win ? finTalkDockedHTML() : finTalkHTML()}</section>` : ''}
</div>`;
};

HOOKS.beforeRender.push(() => { if (UI.view !== 'finance' || (UI.fin.tab || 'canvas') !== 'canvas') UI.fin.cvShownAt = 0; });
/* --- moving around --- */
function finCvGlide() { FCAM.stop(); const w = $('#fin-cv-world'); if (!w) return; w.classList.add('glide'); clearTimeout(UI.fin.glideT); UI.fin.glideT = setTimeout(() => { const x = $('#fin-cv-world'); if (x) x.classList.remove('glide'); finPopPlace(); }, 420); }
// drawn once per screen frame however many pointer or trackpad events arrive
let finCvRaf = 0;
function finCvApplySoon() { if (!finCvRaf) finCvRaf = requestAnimationFrame(() => { finCvRaf = 0; finCvApply(); }); }
function finCvApply() {
  const w = $('#fin-cv-world'), cv = UI.fin.cv; if (w) w.style.transform = `translate(${cv.x}px,${cv.y}px) scale(${cv.k})`;
  // a fast moving layer only while it moves; a moment after, text and lines are drawn sharp at the new size
  if (w) { w.classList.add('moving'); clearTimeout(UI.fin.sharpT); UI.fin.sharpT = setTimeout(() => { const x = $('#fin-cv-world'); if (x) x.classList.remove('moving'); }, 160); }
  const z = $('#fin-cv-z'); if (z) z.textContent = Math.round(cv.k * 100) + '%';
  const vpz = $('#fin-cv-vp'); if (vpz) vpz.classList.toggle('z-far', cv.k < 0.62);
  finPopPlace(); if (typeof finMiniPlace === 'function') finMiniPlace();
  if (typeof finCvEditorPlace === 'function') finCvEditorPlace();
}
// on opening: as wide as the screen allows (readable), from the top; Fit shows all of it
function finCvFit(all) {
  if (UI.fin.cv.mode === 'rich' || UI.fin.cv.mode === 'mind') all = true;   // the whole system of tanks and pipes at once
  const vp = $('#fin-cv-vp'), s = UI.fin.cvSize, cv = UI.fin.cv; if (!vp || !s) return;
  const W = vp.clientWidth, H = vp.clientHeight; if (!W || !H) return;
  if (all) { const top = cv.full ? 64 : 16; cv.k = Math.max(0.1, Math.min(1, (W - 32) / s.w, (H - top - 16) / s.h)); cv.x = (W - s.w * cv.k) / 2; cv.y = Math.max(top, top + (H - top - 16 - s.h * cv.k) / 2); }   // full screen: below the floating controls
  else { cv.k = Math.min(1, Math.max(0.42, (W - 32) / s.w)); cv.x = Math.max(16, (W - s.w * cv.k) / 2); cv.y = cv.full ? 64 : 16; }   // full screen: below the floating controls
  cv.fitted = true; finCvApply();
}
// smooth movement (smoothCam): zoom glides around the pointer, wheel notches glide, a drag let go keeps sliding
const FCAM = smoothCam({ cam: () => UI.fin.cv, apply: () => { UI.fin.cv.user = true; $('#fin-cv-world')?.classList.remove('glide'); finCvApply(); }, min: 0.1, max: 2.5 });
function finCvZoomSmooth(f, cx, cy) {
  const vp = $('#fin-cv-vp'); if (!vp) return; const r = vp.getBoundingClientRect();
  FCAM.zoom(f, cx === undefined ? r.width / 2 : cx - r.left, cy === undefined ? r.height / 2 : cy - r.top);
}
function finCvZoomAt(f, cx, cy) {
  const vp = $('#fin-cv-vp'), cv = UI.fin.cv; if (!vp) return; const r = vp.getBoundingClientRect();
  const px = cx === undefined ? r.width / 2 : cx - r.left, py = cy === undefined ? r.height / 2 : cy - r.top, k2 = Math.max(0.1, Math.min(2.5, cv.k * f));
  cv.x = px - (px - cv.x) * (k2 / cv.k); cv.y = py - (py - cv.y) * (k2 / cv.k); cv.k = k2; cv.user = true; finCvApply();
}
// bring a card, a room or an opened detail into view (a tall one from its top) and make it glow
function finCvGoto(id, onlyIfHidden) {
  const vp = $('#fin-cv-vp'), P = UI.fin.cvPos, cv = UI.fin.cv; if (!vp || !P) return;
  const b = P.get(id), d = P.get(id + ':det'); if (!b) return;
  const box = d ? { x: Math.min(b.x, d.x), y: b.y, w: Math.max(b.x + b.w, d.x + d.w) - Math.min(b.x, d.x), h: d.y + d.h - b.y } : b;
  const W = vp.clientWidth, H = vp.clientHeight, k = Math.max(cv.k, Math.min(0.75, (W - 40) / box.w));
  if (onlyIfHidden) { const sx = cv.x + box.x * cv.k, sy = cv.y + box.y * cv.k; if (sx >= 0 && sy >= 0 && sx + box.w * cv.k <= W && sy + Math.min(box.h, H / cv.k * 0.9) * cv.k <= H) return; }
  finCvGlide(); cv.k = k; cv.x = box.w * k < W ? W / 2 - (box.x + box.w / 2) * k : 20 - box.x * k; cv.y = box.h * k < H - 40 ? H / 2 - (box.y + box.h / 2) * k : 20 - box.y * k; cv.user = true; finCvApply();
}
const FCV = { ptrs: new Map(), start: null, pinch: null, moved: false };
document.addEventListener('pointerdown', e => {
  if (!e.target.closest || !e.target.closest('#fin-cv-vp') || e.button > 0) return;
  if (e.target.closest('input, select, textarea, [contenteditable]')) return;   // typing and choosing inside an unfolded part
  FCV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  FCAM.stop();
  if (FCV.ptrs.size === 1) { FCV.moved = false; FCV.start = { x: e.clientX, y: e.clientY, ox: UI.fin.cv.x, oy: UI.fin.cv.y }; }
  if (FCV.ptrs.size === 2) { const [a, b] = [...FCV.ptrs.values()]; FCV.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: UI.fin.cv.k }; FCV.start = null; }
});
document.addEventListener('pointermove', e => {
  if (!FCV.ptrs.has(e.pointerId)) return; FCV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (FCV.pinch && FCV.ptrs.size >= 2) { const [a, b] = [...FCV.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); FCV.moved = true; finCvZoomAt(FCV.pinch.k * d / FCV.pinch.d / UI.fin.cv.k, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  const s = FCV.start; if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!FCV.moved && Math.hypot(dx, dy) < 5) return;
  FCV.moved = true; UI.fin.cv.user = true; UI.fin.cv.x = s.ox + dx; UI.fin.cv.y = s.oy + dy; FCAM.track(e.clientX, e.clientY, e.timeStamp); finCvApplySoon(); const vp = $('#fin-cv-vp'); if (vp) vp.classList.add('panning');
});
const finCvEnd = e => {
  if (!FCV.ptrs.delete(e.pointerId)) return;
  if (FCV.ptrs.size < 2) FCV.pinch = null;
  if (FCV.ptrs.size === 1) { const [q] = [...FCV.ptrs.values()]; FCV.start = { x: q.x, y: q.y, ox: UI.fin.cv.x, oy: UI.fin.cv.y }; }
  if (!FCV.ptrs.size) { if (FCV.start && FCV.moved && e.type === 'pointerup') FCAM.release(e.timeStamp); FCV.start = null; const vp = $('#fin-cv-vp'); if (vp) vp.classList.remove('panning'); }
};
document.addEventListener('pointerup', finCvEnd); document.addEventListener('pointercancel', finCvEnd);
// a drag that ends on a card is not a tap on it
document.addEventListener('click', e => { if (FCV.moved && e.target.closest && e.target.closest('#fin-cv-vp')) { e.stopImmediatePropagation(); e.preventDefault(); FCV.moved = false; } }, true);
// scrolling moves around the canvas (it is the page); Ctrl + scroll, and a trackpad pinch, zoom
document.addEventListener('wheel', e => {
  if (!e.target.closest || !e.target.closest('#fin-cv-vp')) return;
  e.preventDefault();
  // a wheel notch (about 100) zooms about 12%; a trackpad pinch sends many small steps — all of it glides
  if (e.ctrlKey || e.metaKey) { const dy = Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1))); finCvZoomSmooth(Math.exp(-dy * 0.0022), e.clientX, e.clientY); }
  else {
    const dx = -wheelPx(e, e.shiftKey ? e.deltaY : e.deltaX), dy = e.shiftKey ? 0 : -wheelPx(e, e.deltaY);
    if (wheelNotch(e)) FCAM.pan(dx, dy);                                  // a mouse wheel notch glides
    else { FCAM.stop(); UI.fin.cv.x += dx; UI.fin.cv.y += dy; UI.fin.cv.user = true; finCvApplySoon(); }   // a trackpad follows the fingers
  }
}, { passive: false });
document.addEventListener('keydown', e => {
  if (UI.view !== 'finance') return;
  if (e.key === 'Escape') { if (UI.drawer || !$('#modal').hidden) return; if (UI.fin.pop) { finPopClose(); return; } if (UI.fin.cvOpen.length) { UI.fin.cvOpen = UI.fin.cvOpen.slice(0, -1); render(); return; } if (UI.fin.cv.full) { finCvFull(false); return; } }
  const br = e.target.closest && e.target.closest('.fin-cvn[role="button"]'); if (br && (e.key === 'Enter' || e.key === ' ') && e.target === br) { e.preventDefault(); br.click(); }
});
function finCvFull(on) { UI.fin.cv.full = on; UI.fin.cv.fitted = false; document.documentElement.classList.toggle('fin-cv-lock', on); render(); }
// a part asked for (from a button, a sentence, an old link) opens as a room on the canvas
function finOpen(k) {
  if (k === 'settings') { UI.fin.tab = 'settings'; if (UI.view !== 'finance') go('finance'); else { render(); window.scrollTo(0, 0); } return; }
  UI.fin.tab = 'canvas';
  if (!k || k === 'map') UI.fin.cvOpen = UI.fin.cvOpen.filter(x => !x.startsWith('sec:'));
  else if (k === 'buy') { UI.fin.cvCol.delete('buy'); UI.fin.goto = 'buy'; }
  else if (FIN_VIEW[k]) { finSetOpen('sec:' + k, true); UI.fin.sec = k; UI.fin.goto = 'sec:' + k; }
  if (UI.view !== 'finance') go('finance'); else render();
}

HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance') { document.documentElement.classList.remove('fin-cv-lock'); return; }
  { const r = document.querySelector('.rail'), w = document.querySelector('.fin'); if (r && w) { const b = r.getBoundingClientRect(); w.style.setProperty('--fin-top', (getComputedStyle(r).position === 'sticky' && b.height < 160 ? Math.round(b.bottom) : 0) + 'px'); } }
  if (UI.fin.jump) { const k = UI.fin.jump; UI.fin.jump = null; finOpen(k); return; }
  // unfolded details take the room they need: measured, and the canvas laid out again (a few times at most)
  UI.fin.detChain = UI.fin.detSelf ? (UI.fin.detChain || 0) + 1 : 0; UI.fin.detSelf = false;
  if (UI.fin.detChain <= 4) { let again = false; document.querySelectorAll('#fin-cv-world .fin-det').forEach(d => { const h = d.offsetHeight; if (Math.abs(h - (UI.fin.detH[d.dataset.det] || 0)) > 3) { UI.fin.detH[d.dataset.det] = h; again = true; } }); if (again) { UI.fin.detSelf = true; scheduleRender(); return; } }
  const w = UI.fin.cvSize ? UI.fin.cvSize.w : 0; if (!UI.fin.cv.fitted || (!UI.fin.cv.user && w !== UI.fin.cv.sw)) finCvFit(); UI.fin.cv.sw = w;
  finPopPlace();
  if (UI.fin.goto) { const id = UI.fin.goto; UI.fin.goto = null; finCvGoto(id, true); }
  if (UI.fin.flash.until > Date.now()) { clearTimeout(UI.fin.flashT); UI.fin.flashT = setTimeout(() => { if (UI.view === 'finance') document.querySelectorAll('.fin-cvn.fresh, .fin-room.fresh').forEach(n => n.classList.remove('fresh')); }, UI.fin.flash.until - Date.now()); }
});

Object.assign(ACT, {
  'fin-sec': el => { UI.fin.sel.clear(); finOpen(el.dataset.s); },
  'fin-cv-sec': (el, e) => { const k = el.dataset.s;
    if (el.classList.contains('fin-room-t')) { clearTimeout(UI.fin.secT); if (e && e.detail > 1) return; UI.fin.secT = setTimeout(() => { if (k === 'buy') return finOpen('buy'); if (finSetOpen('sec:' + k)) UI.fin.goto = 'sec:' + k; render(); }, 240); return; } if (k === 'buy') return finOpen('buy'); if (finSetOpen('sec:' + k)) UI.fin.goto = 'sec:' + k; render(); },
  'fin-cv-det': el => { const id = el.dataset.id; if (UI.fin.pop === id) finPopClose(); else finPopOpen(id); },
  'fin-pop-x': () => finPopClose(),
  'fin-cv-close-all': () => { UI.fin.cvOpen = []; UI.fin.pop = null; render(); },
  'fin-panel-x': () => { UI.fin.cvOpen = UI.fin.cvOpen.filter(x => !x.startsWith('sec:')); render(); },
  'fin-tab': el => { if (el.dataset.v === 'settings') finOpen('settings'); else { UI.fin.tab = 'canvas'; UI.fin.cv.fitted = false; render(); } },
  'fin-buy-edit': el => { if (typeof finCvEditOpen === 'function') finCvEditOpen('b:' + el.dataset.id); },
  'fin-buy-star': el => { finSave(q => { const b = (q.buys || []).find(x => x.id === el.dataset.id); if (b) { b.focus = !b.focus; if (b.focus) q.buyFocus = true; } }); render(); },
  'fin-cat-ledger': el => { UI.fin.l = { ...UI.fin.l, cat: el.dataset.k, acct: '', ids: null, page: 0 }; finOpen('ledger'); },
  'fin-cv-tog': (el, e) => { e && e.stopPropagation && e.stopPropagation(); const id = el.dataset.id, c = UI.fin.cvCol; c.has(id) ? c.delete(id) : c.add(id); finCvKeep(); render(); },
  'fin-cv-all': el => { const c = UI.fin.cvCol; c.clear(); if (el.dataset.v === 'fold') { finCvRooms(finCvModel()).forEach(r => { if (r.kind !== 'sec') c.add(r.id); }); UI.fin.cvOpen = []; } finCvKeep(); UI.fin.cv.fitted = false; UI.fin.cv.user = false; render(); },
  'fin-cv-focus': el => { const id = el.dataset.id || null; UI.fin.cv.focus = UI.fin.cv.focus === id ? null : id; if (id) UI.fin.cvCol.delete(id); UI.fin.cv.fitted = false; UI.fin.cv.user = false; render(); },
  'fin-cv-zoom': el => finCvZoomSmooth(el.dataset.v === 'in' ? 1.15 : 1 / 1.15),
  'fin-cv-fit': () => { UI.fin.cv.user = false; finCvGlide(); finCvFit(true); },
  'fin-cv-full': () => finCvFull(!UI.fin.cv.full),
  'fin-cv-goto': el => { const id = el.dataset.id; UI.fin.flash = { ids: new Set([id]), until: Date.now() + 2500 }; render(); finCvGoto(id); },
});
Object.assign(window.__FIN, { open: k => finOpen(k), model: () => finCvModel(), show: id => finCvGoto(id) });
