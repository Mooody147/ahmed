// Money is one canvas: the whole picture drawn from the data (accounts, income, spending, card and instalments,
// investments, other people's money, goals, what Claude sorted out) — like the To-do canvas is drawn from the tasks.
// Every former tab lives on it: tap a branch or a card and that part opens in a panel inside the canvas.
// Below the canvas you talk to it (48-finance-talk.js) and it redraws from what you say.
FIN_ICON.map = '🧭';
UI.fin.cv = { x: 20, y: 20, k: 1, fitted: false, focus: null, dir: 'v', full: false };
UI.fin.panel = null; UI.fin.panelScroll = {}; UI.fin.flash = { ids: new Set(), until: 0 };
const FIN_CV_LS = 'ar-fin-cv';
(() => { try { const s = JSON.parse(localStorage.getItem(FIN_CV_LS) || '{}'); UI.fin.cvCol = new Set(s.col || []); if (s.dir === 'h') UI.fin.cv.dir = 'h'; } catch { UI.fin.cvCol = new Set(); } })();
const finCvKeep = () => { try { localStorage.setItem(FIN_CV_LS, JSON.stringify({ col: [...UI.fin.cvCol], dir: UI.fin.cv.dir })); } catch {} };
const finTxt = h => String(h || '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const finSecLabel = k => (FIN_SECS.find(s => s[0] === k) || [k, k])[1];
// which canvas node stands for each part, so the open one is marked
const FIN_SEC_NODE = { dash: 'root', accounts: 'accts', inc: 'inc', exp: 'exp', credit: 'com', own: 'own', buy: 'buy', settings: 'set', import: 't:import', ledger: 't:ledger', update: 't:update', budget: 't:budget', sim: 't:sim', forecast: 't:forecast' };

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
    const credit = a.kind === 'credit_card' || a.kind === 'bnpl', when = l.date ? `${l.source === 'you' ? 'your update' : 'statement'} · ${fday(l.date)}` : 'no balance yet';
    if (credit) return leaf('a:' + a.id, a.name, typeof l.owed === 'number' ? `owes ${fk(l.owed)}` : '—', l.available !== null && l.available !== undefined ? `${fk(l.available)} available · ${when}` : a.kind === 'bnpl' ? 'tell the canvas what the app shows' : when, { act: 'fin-acct-ledger', id: a.id }, typeof l.owed === 'number' && l.owed > 0 ? 'neg' : '');
    return leaf('a:' + a.id, a.name, typeof l.balance === 'number' ? fk(l.balance) : '—', when, { act: 'fin-acct-ledger', id: a.id }, typeof l.balance === 'number' && l.balance < 0 ? 'neg' : '');
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
  const sp = cats.map(([k, v]) => leaf('c:' + k, (finCat(k) || { name: k }).name, fk(v), 'a month · last ' + done.length + ' complete month' + (done.length === 1 ? '' : 's'), { act: 'fin-drill-cat', k }));
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

  B.push(branch('set', '⚙️', 'Settings & backup', 220, 'settings', `${p.base} · categories, rules, backup`, []));

  const root = { id: 'root', type: 'root', label: 'My money', sec: 'dash', sum: `net worth ${own.net !== null ? fk(own.net) : '—'} · free cash ${fk(n.free)} · saving ${fk(n.capacity)} a month`, children: B };
  const f = UI.fin.cv.focus && B.find(b => b.id === UI.fin.cv.focus);
  if (f) root.children = [f]; else UI.fin.cv.focus = null;
  return root;
}
// every node's label, value and line, to see what a change moved
function finCvIndex(root) { const m = new Map(), walk = n => { m.set(n.id, [n.label, n.val || '', n.sub || '', n.sum || ''].join('|')); (n.children || []).forEach(walk); }; walk(root || finCvModel()); return m; }

/* --- layout: down (branches in a row, their cards stacked below) or across (root on the left) --- */
const FCV_W = { root: 250, branch: 240, leaf: 260 }, FCV_H = { root: 76, branch: 62, leaf: 56 };
function finCvLayout(root) {
  const nodes = [], edges = [], col = UI.fin.cvCol;
  const kidsOf = n => n.type === 'root' || !col.has(n.id) ? n.children : [];
  const size = n => { n.w = FCV_W[n.type]; n.h = FCV_H[n.type]; };
  if (UI.fin.cv.dir === 'v') {
    size(root); let cx = 0; const top = root.h + 60;
    const stack = (n, x, y) => { let iy = y; for (const k of kidsOf(n)) { size(k); k.x = x; k.y = iy; nodes.push(k); edges.push({ a: n, b: k, v: true, hue: n.hue }); iy += k.h + 10; if (k.type === 'branch') iy = stack(k, x + 24, iy); } return iy; };
    for (const b of root.children) { size(b); b.x = cx; b.y = top; nodes.push(b); edges.push({ a: root, b, hue: b.hue }); stack(b, cx + 18, top + b.h + 16); cx += b.w + 40; }
    root.x = Math.max(0, (cx - 40) / 2 - root.w / 2); root.y = 0;
  } else {
    let cursor = 0;
    const place = (n, x) => {
      size(n); n.x = x; const ks = kidsOf(n), nx = x + n.w + 70;
      if (!ks.length) { n.y = cursor; cursor += n.h + (n.type === 'leaf' ? 10 : 18); }
      else { ks.forEach(k => place(k, nx)); const a = ks[0], b = ks[ks.length - 1]; n.y = (a.y + b.y + b.h) / 2 - n.h / 2; cursor += n.type === 'root' ? 0 : 16; ks.forEach(k => edges.push({ a: n, b: k, hue: k.type === 'branch' ? k.hue : n.hue })); }
      nodes.push(n);
    };
    place(root, 0);
    const y0 = Math.min(...nodes.map(n => n.y)); if (y0 < 0) nodes.forEach(n => { n.y -= y0; });
  }
  if (!nodes.includes(root)) nodes.push(root);
  UI.fin.cvRoot = { x: root.x, y: root.y, w: root.w, h: root.h };
  UI.fin.cvPos = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y, w: n.w, h: n.h }]));
  const w = Math.max(...nodes.map(n => n.x + n.w)), h = Math.max(...nodes.map(n => n.y + n.h));
  return { nodes, edges, w, h };
}

const finCvAttrs = a => a ? Object.entries(a).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ') : '';
function finCvNode(n, hue) {
  const st = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;--h:${hue ?? 200}`;
  const open = UI.fin.panel && FIN_SEC_NODE[UI.fin.panel] === n.id ? ' sel' : '', fresh = Date.now() < UI.fin.flash.until && UI.fin.flash.ids.has(n.id) ? ' fresh' : '';
  if (n.type === 'root') return `<div class="mnode root fin-cvn${open}${fresh}" role="button" tabindex="0" data-act="fin-sec" data-s="dash" data-node="root" title="Overview" style="${st}"><span class="gicon fin-cv-ic" aria-hidden="true">💰</span><div class="mtxt"><b>${esc(n.label)}</b><small>${esc(n.sum)}</small></div></div>`;
  if (n.type === 'branch') {
    const hidden = UI.fin.cvCol.has(n.id), kids = n.children.length;
    return `<div class="mnode project fin-cvn fin-cv-br${open}${fresh}" role="button" tabindex="0" data-act="fin-sec" data-s="${esc(n.sec)}" data-node="${esc(n.id)}" title="Open ${esc(n.label)}" style="${st}">
      <span class="gicon fin-cv-ic" aria-hidden="true">${n.icon}</span><div class="mtxt"><b>${esc(n.label)}</b><small>${esc(n.sum)}</small></div>
      ${hidden && kids ? `<span class="mmore">+${kids}</span>` : ''}
      ${kids ? `<button class="fin-cv-btn tg" data-act="fin-cv-tog" data-id="${esc(n.id)}" aria-expanded="${!hidden}" title="${hidden ? 'Unfold' : 'Fold'}" aria-label="${hidden ? 'Unfold' : 'Fold'} ${esc(n.label)}">${hidden ? '▸' : '▾'}</button>` : ''}${n.id !== 'rec' && n.id !== 'set' ? `<button class="fin-cv-btn fo" data-act="fin-cv-focus" data-id="${esc(n.id)}" title="${UI.fin.cv.focus === n.id ? 'Show everything' : 'Show only this'}" aria-label="${UI.fin.cv.focus === n.id ? 'Show everything' : 'Show only ' + esc(n.label)}">⤢</button>` : ''}</div>`;
  }
  return `<button class="mnode fin-cvn fin-leaf ${n.cls}${open}${fresh}" ${finCvAttrs(n.act)} data-node="${esc(n.id)}" title="${esc(n.label)}${n.val ? ' — ' + esc(n.val) : ''}${n.sub ? '\n' + esc(n.sub) : ''}" style="${st}">
    <div class="mtxt"><b>${n.cls.includes('tool') ? '<span class="fin-tool-i" aria-hidden="true">' + (FIN_ICON[n.act.s] || '') + '</span>' : ''}${esc(n.label)}</b>${n.sub ? `<small>${esc(n.sub)}</small>` : ''}</div>${n.val ? `<span class="fin-cv-v num">${esc(n.val)}</span>` : ''}</button>`;
}
function finCvBoard() {
  const cv = UI.fin.cv, root = finCvModel(), L = finCvLayout(root);
  const hueOf = new Map(); const walk = (n, h) => { const hh = n.type === 'branch' ? n.hue : h; hueOf.set(n, hh); (n.children || []).forEach(k => walk(k, hh)); }; walk(root, 200);
  const path = e => {
    const { a, b } = e;
    if (cv.dir === 'v') {
      if (e.v) return `M${a.x + 14},${a.y + a.h} V${b.y + b.h / 2} H${b.x}`;
      const x0 = a.x + a.w / 2, y0 = a.y + a.h, x1 = b.x + b.w / 2, y1 = b.y, my = (y0 + y1) / 2; return `M${x0},${y0} C${x0},${my} ${x1},${my} ${x1},${y1}`;
    }
    const x0 = a.x + a.w, y0 = a.y + a.h / 2, x1 = b.x, y1 = b.y + b.h / 2, mx = (x0 + x1) / 2; return `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  };
  UI.fin.cvSize = { w: L.w, h: L.h };
  return `<div class="fin-cv-vp" id="fin-cv-vp"><div class="fin-cv-world" id="fin-cv-world" style="width:${L.w}px;height:${L.h}px;transform:translate(${cv.x}px,${cv.y}px) scale(${cv.k})">
      <svg class="fin-cv-edges" width="${L.w}" height="${L.h}" aria-hidden="true">${L.edges.map(e => `<path d="${path(e)}" style="--h:${e.hue ?? 200}"/>`).join('')}</svg>
      ${L.nodes.map(n => finCvNode(n, hueOf.get(n))).join('')}</div></div>`;
}
// the part you opened, inside the canvas
function finPanelHTML() {
  const k = UI.fin.panel; if (!k || !FIN_VIEW[k]) return '';
  const label = finSecLabel(k), filt = ['dash', 'ledger', 'exp', 'inc'].includes(k);
  let body; try { body = FIN_VIEW[k](); } catch (e) { console.error(e); body = `<p class="small muted">This part could not be drawn (${esc(e.message || String(e))}). Everything else keeps working.</p>`; }
  return `<aside class="fin-panel ${UI.fin.panelWide ? 'wide' : ''}" id="fin-panel" role="region" aria-label="${esc(label)}">
    <div class="fin-panel-h"><span class="fin-panel-ic" aria-hidden="true">${FIN_ICON[k] || ''}</span><h2>${esc(label)}</h2><span class="spacer"></span>
      <button class="icon-btn fin-panel-w" data-act="fin-panel-wide" title="${UI.fin.panelWide ? 'Narrower' : 'Wider'}" aria-label="${UI.fin.panelWide ? 'Make the panel narrower' : 'Make the panel wider'}">⇔</button>
      <button class="icon-btn" data-act="fin-panel-x" title="Close (Esc)" aria-label="Close ${esc(label)}">${I.x}</button></div>
    <div class="fin-panel-b" id="fin-panel-b">${filt ? finFilterBar() : ''}${body}</div></aside>`;
}

VIEW_FN.finance = () => {
  const cv = UI.fin.cv;
  return `<div class="wrap fin fin-canvas-page">
  <section class="fin-cvwrap ${cv.full ? 'full' : ''} ${UI.fin.panel ? 'has-panel' : ''}" id="fin-s-map" aria-label="Money canvas">
    <div class="fin-cv-bar"><h1>Money</h1><span class="small muted fin-cv-hint">Tap any part to open it · tell the canvas below what changed</span><span class="spacer"></span>
      ${cv.focus ? `<button class="btn sm" data-act="fin-cv-focus" data-id="">Show everything</button>` : ''}
      <button class="btn sm" data-act="fin-new-tx" title="Add a transaction by hand">${I.plus} Transaction</button>
      <div class="seg" role="group" aria-label="Direction"><button data-act="fin-cv-dir" data-v="v" aria-pressed="${cv.dir === 'v'}" title="Branches down">↓ Down</button><button data-act="fin-cv-dir" data-v="h" aria-pressed="${cv.dir === 'h'}" title="Branches across">→ Across</button></div>
      <button class="btn sm" data-act="fin-cv-all" data-v="open" title="Unfold every branch">Unfold all</button><button class="btn sm" data-act="fin-cv-all" data-v="fold" title="Fold every branch">Fold all</button>
      <div class="seg zoom" role="group" aria-label="Zoom"><button data-act="fin-cv-zoom" data-v="out" aria-label="Zoom out">−</button><button data-act="fin-cv-fit" title="Fit to the screen"><span id="fin-cv-z">${Math.round(cv.k * 100)}%</span></button><button data-act="fin-cv-zoom" data-v="in" aria-label="Zoom in">+</button></div>
      <button class="btn sm" data-act="fin-cv-full" aria-pressed="${cv.full}" title="${cv.full ? 'Back (Esc)' : 'Full screen'}">${cv.full ? '✕ Close' : '⤢ Full screen'}</button></div>
    <div class="fin-cv-stage">${finCvBoard()}${finPanelHTML()}</div>
    ${typeof finTalkHTML === 'function' ? finTalkHTML() : ''}
  </section>
</div>`;
};

/* --- moving around --- */
function finCvApply() {
  const w = $('#fin-cv-world'), cv = UI.fin.cv; if (w) w.style.transform = `translate(${cv.x}px,${cv.y}px) scale(${cv.k})`;
  const z = $('#fin-cv-z'); if (z) z.textContent = Math.round(cv.k * 100) + '%';
}
// on opening: a readable size (all of it when it fits, else starting from "My money"); Fit shows all of it
function finCvFit(all) {
  const vp = $('#fin-cv-vp'), s = UI.fin.cvSize, cv = UI.fin.cv, r = UI.fin.cvRoot; if (!vp || !s) return;
  const W = vp.clientWidth, H = vp.clientHeight; if (!W || !H) return;
  const k0 = Math.min(1, (W - 32) / s.w, (H - 32) / s.h);
  if (all || k0 >= 0.5 || !r) { cv.k = Math.max(0.12, k0); cv.x = (W - s.w * cv.k) / 2; cv.y = (H - s.h * cv.k) / 2; }
  else {
    cv.k = Math.min(1, Math.max(0.5, Math.min((W - 32) / s.w, (H - 32) / s.h)));
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    cv.x = Math.min(16, Math.max(W - 16 - s.w * cv.k, W / 2 - cx * cv.k));
    cv.y = cv.dir === 'v' ? 16 : Math.min(16, Math.max(H - 16 - s.h * cv.k, H / 2 - cy * cv.k));
    if (cv.dir !== 'v' && s.w * cv.k > W) cv.x = 16;
  }
  cv.fitted = true; finCvApply();
}
function finCvZoomAt(f, cx, cy) {
  const vp = $('#fin-cv-vp'), cv = UI.fin.cv; if (!vp) return; const r = vp.getBoundingClientRect();
  const px = cx === undefined ? r.width / 2 : cx - r.left, py = cy === undefined ? r.height / 2 : cy - r.top, k2 = Math.max(0.2, Math.min(2.5, cv.k * f));
  cv.x = px - (px - cv.x) * (k2 / cv.k); cv.y = py - (py - cv.y) * (k2 / cv.k); cv.k = k2; cv.user = true; finCvApply();
}
// bring a card into view (left of an open panel) and make it glow
function finCvGoto(id) {
  const vp = $('#fin-cv-vp'), b = UI.fin.cvPos && UI.fin.cvPos.get(id), cv = UI.fin.cv; if (!vp || !b) return;
  const pan = $('#fin-panel'), W = vp.clientWidth - (pan && pan.offsetWidth < vp.clientWidth ? pan.offsetWidth : 0), H = vp.clientHeight;
  cv.k = Math.max(cv.k, 0.6); cv.x = W / 2 - (b.x + b.w / 2) * cv.k; cv.y = H / 2 - (b.y + b.h / 2) * cv.k; cv.user = true; finCvApply();
}
const FCV = { ptrs: new Map(), start: null, pinch: null, moved: false };
document.addEventListener('pointerdown', e => {
  if (!e.target.closest || !e.target.closest('#fin-cv-vp') || e.button > 0) return;
  FCV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (FCV.ptrs.size === 1) { FCV.moved = false; FCV.start = { x: e.clientX, y: e.clientY, ox: UI.fin.cv.x, oy: UI.fin.cv.y }; }
  if (FCV.ptrs.size === 2) { const [a, b] = [...FCV.ptrs.values()]; FCV.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: UI.fin.cv.k }; FCV.start = null; }
});
document.addEventListener('pointermove', e => {
  if (!FCV.ptrs.has(e.pointerId)) return; FCV.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (FCV.pinch && FCV.ptrs.size >= 2) { const [a, b] = [...FCV.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y); FCV.moved = true; finCvZoomAt(FCV.pinch.k * d / FCV.pinch.d / UI.fin.cv.k, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
  const s = FCV.start; if (!s) return; const dx = e.clientX - s.x, dy = e.clientY - s.y;
  if (!FCV.moved && Math.hypot(dx, dy) < 5) return;
  FCV.moved = true; UI.fin.cv.user = true; UI.fin.cv.x = s.ox + dx; UI.fin.cv.y = s.oy + dy; finCvApply(); const vp = $('#fin-cv-vp'); if (vp) vp.classList.add('panning');
});
const finCvEnd = e => {
  if (!FCV.ptrs.delete(e.pointerId)) return;
  if (FCV.ptrs.size < 2) FCV.pinch = null;
  if (FCV.ptrs.size === 1) { const [q] = [...FCV.ptrs.values()]; FCV.start = { x: q.x, y: q.y, ox: UI.fin.cv.x, oy: UI.fin.cv.y }; }
  if (!FCV.ptrs.size) { FCV.start = null; const vp = $('#fin-cv-vp'); if (vp) vp.classList.remove('panning'); }
};
document.addEventListener('pointerup', finCvEnd); document.addEventListener('pointercancel', finCvEnd);
// a drag that ends on a card is not a tap on it
document.addEventListener('click', e => { if (FCV.moved && e.target.closest && e.target.closest('#fin-cv-vp')) { e.stopPropagation(); e.preventDefault(); FCV.moved = false; } }, true);
// scrolling over the canvas zooms it (the canvas is the page); Ctrl + scroll and a trackpad pinch too
document.addEventListener('wheel', e => {
  if (!e.target.closest || !e.target.closest('#fin-cv-vp')) return;
  e.preventDefault(); finCvZoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
}, { passive: false });
document.addEventListener('keydown', e => {
  if (UI.view !== 'finance') return;
  if (e.key === 'Escape') { if (UI.drawer || !$('#modal').hidden) return; if (UI.fin.panel) { UI.fin.panel = null; render(); return; } if (UI.fin.cv.full) { finCvFull(false); return; } }
  const br = e.target.closest && e.target.closest('.fin-cvn[role="button"]'); if (br && (e.key === 'Enter' || e.key === ' ') && e.target === br) { e.preventDefault(); br.click(); }
});
function finCvFull(on) { UI.fin.cv.full = on; UI.fin.cv.fitted = false; document.documentElement.classList.toggle('fin-cv-lock', on); render(); }
function finOpen(k) { if (k === 'map') k = null; UI.fin.panel = k && FIN_VIEW[k] ? k : null; if (k) UI.fin.sec = k; if (UI.view !== 'finance') go('finance'); else render(); }

// a redraw keeps where you were in the open panel
HOOKS.beforeRender.push(() => { const b = $('#fin-panel-b'); if (b && UI.fin.panel) UI.fin.panelScroll[UI.fin.panel] = b.scrollTop; });
HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance') { document.documentElement.classList.remove('fin-cv-lock'); return; }
  { const r = document.querySelector('.rail'), w = document.querySelector('.fin'); if (r && w) { const b = r.getBoundingClientRect(); w.style.setProperty('--fin-top', (getComputedStyle(r).position === 'sticky' && b.height < 160 ? Math.round(b.bottom) : 0) + 'px'); } }
  if (UI.fin.jump) { const k = UI.fin.jump; UI.fin.jump = null; UI.fin.panel = FIN_VIEW[k] ? k : null; scheduleRender(); return; }
  const b = $('#fin-panel-b'); if (b && UI.fin.panelScroll[UI.fin.panel]) b.scrollTop = UI.fin.panelScroll[UI.fin.panel];
  // the card you opened stays in sight, left of the panel
  if (UI.fin.panelGoto) { const id = UI.fin.panelGoto; UI.fin.panelGoto = null; const pan = $('#fin-panel'), el = document.querySelector(`.fin-cvn[data-node="${CSS.escape(id)}"]`); if (pan && el && el.getBoundingClientRect().right > pan.getBoundingClientRect().left - 8 && pan.offsetWidth < ($('#fin-cv-vp') || {}).clientWidth) finCvGoto(id); }
  // the view follows the tree as it grows, until you move or zoom it yourself
  const sz = UI.fin.cvSize ? UI.fin.cvSize.w + 'x' + UI.fin.cvSize.h : ''; if (!UI.fin.cv.fitted || (!UI.fin.cv.user && sz !== UI.fin.cv.sz)) finCvFit(); UI.fin.cv.sz = sz;
  if (UI.fin.flash.until > Date.now()) { clearTimeout(UI.fin.flashT); UI.fin.flashT = setTimeout(() => { if (UI.view === 'finance') document.querySelectorAll('.fin-cvn.fresh').forEach(n => n.classList.remove('fresh')); }, UI.fin.flash.until - Date.now()); }
});

Object.assign(ACT, {
  'fin-sec': el => { UI.fin.sel.clear(); const n = el.closest && el.closest('#fin-cv-vp [data-node]'); UI.fin.panelGoto = n ? n.dataset.node : null; finOpen(el.dataset.s); },
  'fin-panel-x': () => { UI.fin.panel = null; render(); },
  'fin-panel-wide': () => { UI.fin.panelWide = !UI.fin.panelWide; render(); },
  'fin-buy-edit': el => { UI.fin.buyEdit = el.dataset.id; UI.fin.panel = 'buy'; UI.fin.panelScroll.buy = 0; render(); const n = $('#by-name'); if (n) n.scrollIntoView({ block: 'center' }); },
  'fin-cv-tog': (el, e) => { e && e.stopPropagation && e.stopPropagation(); const id = el.dataset.id, c = UI.fin.cvCol; c.has(id) ? c.delete(id) : c.add(id); finCvKeep(); render(); },
  'fin-cv-all': el => { const c = UI.fin.cvCol; c.clear(); if (el.dataset.v === 'fold') { const r = finCvModel(); const add = n => (n.children || []).forEach(k => { if (k.type === 'branch' && k.children.length) { c.add(k.id); add(k); } }); add(r); } finCvKeep(); UI.fin.cv.fitted = false; render(); },
  'fin-cv-focus': el => { const id = el.dataset.id || null; UI.fin.cv.focus = UI.fin.cv.focus === id ? null : id; if (id) UI.fin.cvCol.delete(id); UI.fin.cv.fitted = false; render(); },
  'fin-cv-dir': el => { UI.fin.cv.dir = el.dataset.v === 'h' ? 'h' : 'v'; finCvKeep(); UI.fin.cv.fitted = false; render(); },
  'fin-cv-zoom': el => finCvZoomAt(el.dataset.v === 'in' ? 1.25 : 0.8),
  'fin-cv-fit': () => { UI.fin.cv.user = false; finCvFit(true); },
  'fin-cv-full': () => finCvFull(!UI.fin.cv.full),
  'fin-cv-goto': el => { const id = el.dataset.id; UI.fin.flash = { ids: new Set([id]), until: Date.now() + 2500 }; const br = id.split(':')[0]; render(); finCvGoto(id); },
});
Object.assign(window.__FIN, { open: k => finOpen(k), model: () => finCvModel(), show: id => finCvGoto(id) });
