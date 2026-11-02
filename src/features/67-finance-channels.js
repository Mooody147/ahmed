// Money canvas — the pipelines between the boxes, explained. Every channel on every layout (Mind map, Rich Dad, Flow)
// says on the canvas, in its own words:
//   ① its step in the money's journey, and where the money goes: "Earned income → your pocket"
//   ② how much moves along it a month, and what share of your income that is
//   ③ what happens at that hand-off: "your pay lands in your accounts"
// and an arrowhead shows which way the money moves. Tapping a channel's words opens a small window: what moves, from
// where to where, what happens there, what it is made of (the cards behind it), why it matters, and the whole journey
// step by step — tap any step to follow the money. The same channel means the same thing on every layout.

const FIN_STEP = ['', '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
// which channel each layout draws (its own id) → the one meaning behind it
const FIN_CH_OF = {
  mind: { 'mm-earn': 'earn', 'mm-pass': 'passive', exp: 'spend', 'mm-liab': 'debt', buy: 'choices', 'mm-assets': 'invest', pays: 'pays', costs: 'costs', assetpays: 'assetpays' },
  rich: { job: 'job', spend: 'spendR', save: 'investR', passive: 'pays', debt: 'costs', assetpays: 'assetpays' },
  flow: { inc: 'rin', exp: 'rexp', com: 'rcom', save: 'rsave' },
};
const finChKey = (mode, id) => (FIN_CH_OF[mode] || {})[id] || null;

function finChans() {
  const key = finNow.k; if (finChans.k === key) return finChans.v;
  const W = finWealth(), R = W.R, n = W.n, inc = n.income || R.income || 0, pc = v => inc > 0 && v > 0 ? Math.round(v / inc * 100) : null;
  const D = {
    earn: { n: 1, from: 'Earned income', to: 'your pocket', amt: R.earned, what: 'your salary and any other pay for work', how: 'your pay lands in your accounts', why: 'You work for money: it stops when you stop working. Rich Dad’s first lesson is to turn part of it into assets.' },
    job: { n: 1, from: 'Your job', to: 'Earned income', amt: R.earned, what: 'your salary and any other pay for work', how: 'you trade your time for pay', why: 'You work for money: it stops when you stop working. Rich Dad’s first lesson is to turn part of it into assets.' },
    passive: { n: 2, from: 'Passive income', to: 'your pocket', amt: R.passive, what: 'returns from what you own: interest, rent, profits', how: R.passive ? 'arrives without you working' : 'nothing flows yet — the goal', why: 'Money working for you. When this covers your expenses you are financially free.' },
    spend: { n: 3, from: 'your pocket', to: 'Expenses', amt: n.spending || 0, what: 'money for living: shops, bills, transport, subscriptions', how: 'paid out for living — gone for good', why: 'Expenses leave your pocket for good. Every pound kept out of here can go to assets instead.' },
    spendR: { n: 3, from: 'Income', to: 'Expenses', amt: n.spending || 0, what: 'money for living: shops, bills, transport, subscriptions', how: 'paid out for living — gone for good', why: 'Expenses leave your pocket for good. Every pound kept out of here can go to assets instead.' },
    debt: { n: 4, from: 'your pocket', to: 'Liabilities', amt: n.instMonthly || 0, what: 'instalments and card repayments', how: 'repays what you owe, month by month', why: 'Liabilities take money out of your pocket every month until they are paid off.' },
    choices: { n: 5, from: 'your pocket', to: 'Your choices', amt: W.plan.monthly || 0, what: 'savings set aside for your goals and purchases', how: W.doodads.length ? 'set aside until each one is affordable' : 'set aside for your goals', why: 'Things you buy that do not pay you back (Rich Dad calls them doodads) are better bought after assets, not instead of them.' },
    invest: { n: 6, from: 'your pocket', to: 'Assets', amt: W.toAssets, what: 'the surplus left after expenses, debts and goals', how: W.toAssets > 0 ? 'kept or invested — it becomes an asset' : 'nothing is left over yet', why: 'Every asset you buy can pay you back (step ⑦) — this is the channel that builds wealth.' },
    investR: { n: 6, from: 'Income', to: 'Assets', amt: W.toAssets, what: 'the surplus left after expenses, debts and goals', how: W.toAssets > 0 ? 'the surplus buys assets' : 'nothing is left over yet', why: 'Every asset you buy can pay you back (step ⑦) — this is the channel that builds wealth.' },
    pays: { n: 7, from: 'Assets', to: 'Passive income', amt: R.passive, what: 'interest, rent and profits from what you own', how: R.passive ? 'your assets pay you back' : 'no asset pays you yet', why: 'The loop that makes you free: assets → passive income → more assets.' },
    costs: { n: 8, from: 'Liabilities', to: 'Expenses', amt: n.instMonthly || 0, what: 'the monthly instalments on what you owe', how: 'what you owe becomes a monthly cost', why: 'Each liability adds a cost to every month — fewer liabilities, more money left to invest.' },
    assetpays: { n: 9, from: 'Assets', to: 'Liabilities', amt: W.payLiab, what: 'the part of an asset’s return set to pay a debt', how: 'an asset’s income pays a debt (estimate)', why: 'Letting an asset pay a liability keeps your own income free — an estimate from the rate you entered.' },
    rin: { n: 1, from: 'Income', to: 'Accounts', amt: inc, what: 'your salary and other income', how: 'lands in your bank accounts', short: 'lands in your bank', why: 'Everything starts here: the money you have to work with each month.' },
    rexp: { n: 3, from: 'Accounts', to: 'Spending', amt: n.spending || 0, what: 'money for living: shops, bills, transport, subscriptions', how: 'paid out for living', short: 'paid out for living', why: 'Spending leaves your accounts for good — the river’s biggest outflow for most people.' },
    rcom: { n: 4, from: 'Accounts', to: 'Card & instalments', amt: n.instMonthly || 0, what: 'instalments and card repayments', how: 'repays what you owe', short: 'repays what you owe', why: 'Each instalment takes its share every month until it ends.' },
    rsave: { n: 5, from: 'Accounts', to: 'Goals', amt: Math.max(0, n.capacity || 0), what: 'what is left after spending and instalments', how: 'what’s left goes to your goals', short: 'what’s left is saved', why: 'Whatever reaches the end of the river is yours to save, invest or spend on a goal.' },
  };
  for (const [k, d] of Object.entries(D)) { d.key = k; d.pct = pc(d.amt); d.title = `${FIN_STEP[d.n]} ${d.from} → ${d.to}`; }
  finChans.k = key; finChans.v = D; return D;
}
const finChan = key => key ? finChans()[key] || null : null;
// the words on the canvas: the step and where the money goes, the amount, what happens — tap them to read more
function finChanWords(key, x, y, anchor, cls, lab, line2) {
  const c = finChan(key); if (!c) return '';
  const a = anchor || 'middle', amt = lab || [fk(c.amt).replace(/\.00$/, ''), ' a month'];
  return `<g class="ch-tag" data-act="fin-ch" data-id="${esc(key)}"><title>${esc(c.title)} — tap to see what moves here</title>
    <text class="${cls}-t" x="${x}" y="${y - 26}" text-anchor="${a}">${esc(c.title)}</text>
    <text class="${cls}-l" x="${x}" y="${y}" text-anchor="${a}">${esc(amt[0])}<tspan class="per">${esc(amt[1])}${c.pct !== null ? ` · ${c.pct}% of income` : ''}</tspan></text>
    <text class="${cls}-i" x="${x}" y="${y + 24}" text-anchor="${a}">${esc(c.how)}</text>${line2 ? `<text class="${cls}-i" x="${x}" y="${y + 44}" text-anchor="${a}">${esc(line2)}</text>` : ''}</g>`;
}
// an arrowhead at the end the money flows to
function finArrowHead(p, dx, dy, t, cls) {
  const L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = Math.max(16, Math.min(34, (t || 10) * 0.7 + 12)), w = s * 0.62;
  const bx = p.x - ux * s, by = p.y - uy * s;
  return `<path class="ch-head ${cls || ''}" d="M${p.x.toFixed(1)},${p.y.toFixed(1)} L${(bx - uy * w).toFixed(1)},${(by + ux * w).toFixed(1)} L${(bx + uy * w).toFixed(1)},${(by - ux * w).toFixed(1)} Z"/>`;
}

// what a channel is made of: the cards behind it
function finChanMade(key) {
  const f0 = UI.fin.cv.focus; UI.fin.cv.focus = null; let root; try { root = finCvModel(); } finally { UI.fin.cv.focus = f0; }
  const room = id => (root.children.find(b => b.id === id) || { children: [] }).children, leaves = list => list.flatMap(c => c.type === 'branch' ? leaves(c.children) : [c]);
  const real = c => !/(none|more)$/.test(c.id) && !(c.cls || '').includes('tool') && !(c.cls || '').includes('muted');
  const pick = (list, f) => leaves(list).filter(real).filter(f || (() => true)).slice(0, 6).map(c => [c.label, c.val || '', c.sub || '']);
  const isP = c => finRdKind(c, 'inc') === 'passive';
  switch (key) {
    case 'earn': case 'job': return pick(room('inc'), c => !isP(c));
    case 'rin': return pick(room('inc'));
    case 'passive': case 'pays': return pick(room('inc'), isP);
    case 'spend': case 'spendR': case 'rexp': return pick(room('exp'));
    case 'debt': case 'costs': case 'rcom': return pick(room('com'));
    case 'choices': case 'rsave': return pick(room('buy'));
    case 'invest': case 'investR': return pick(room('own'), c => finRdKind(c, 'own') === 'asset');
    case 'assetpays': return finWealth().payL.map(x => [x.h.name, fk(x.amt), 'a month (estimate)']);
  }
  return [];
}
// the window: one channel, explained — and the whole journey
function finChanWinHTML() {
  const key = UI.fin.chWin, c = finChan(key); if (!c) return '';
  const mode = UI.fin.cv.mode || 'mind', keys = [...new Set(Object.values(FIN_CH_OF[mode] || {}))].map(finChan).filter(Boolean).sort((a, b) => a.n - b.n);
  const made = finChanMade(key);
  return `<section class="fin-talk-win fin-ch-win" id="fin-ch-win" role="dialog" aria-label="${esc(c.title)}">
    <div class="fin-talk-win-h"><span aria-hidden="true">🔀</span><b>${esc(c.title)}</b><span class="spacer"></span><button class="icon-btn" data-act="fin-ch" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b fin-ch">
      <div class="fin-ch-strip"><div class="box">${esc(c.from)}</div><div class="pipe"><b class="num">${fk(c.amt).replace(/\.00$/, '')}</b><small>a month${c.pct !== null ? ` · ${c.pct}% of income` : ''}</small><i aria-hidden="true"></i></div><div class="box">${esc(c.to)}</div></div>
      <dl class="fin-ch-kv"><dt>What moves</dt><dd>${esc(c.what)}</dd><dt>What happens here</dt><dd>${esc(c.how)}</dd><dt>Why it matters</dt><dd>${esc(c.why)}</dd></dl>
      ${made.length ? `<h4>Made of</h4><div class="fin-box-list">${made.map(([l, v, s]) => `<div>${typeof finLogo === 'function' ? finLogo(l, 'sm') : ''}<span><b>${esc(l)}</b>${s ? `<small>${esc(s)}</small>` : ''}</span><b class="num">${esc(v)}</b></div>`).join('')}</div>` : ''}
      <h4>The whole journey${mode === 'flow' ? ' on this river' : ''}</h4>
      <ol class="fin-ch-steps">${keys.map(k => `<li class="${k.key === key ? 'on' : ''}"><button class="linkish" data-act="fin-ch" data-id="${esc(k.key)}"><span class="n">${FIN_STEP[k.n]}</span><span><b>${esc(k.from)} → ${esc(k.to)}</b><small>${esc(k.how)}</small></span><b class="num">${fk(k.amt).replace(/\.00$/, '')}</b></button></li>`).join('')}</ol>
      <p class="small muted">Amounts are a usual month, from the same figures as every card. Arrows on the canvas point the way the money moves; the thicker a channel, the more money moves along it.</p>
    </div></section>`;
}
// the chosen channel stands out on the canvas; the others step back
function finChanMark() {
  const w = document.getElementById('fin-cv-world'); if (!w) return; const key = UI.fin.chWin, mode = UI.fin.cv.mode || 'mind';
  w.classList.toggle('ch-focus', !!key);
  for (const g of w.querySelectorAll('[data-ch]')) g.classList.toggle('ch-sel', !!key && finChKey(mode, g.dataset.ch) === key);
}
HOOKS.afterRender.push(finChanMark);
Object.assign(ACT, { 'fin-ch': el => { UI.fin.chWin = el.dataset.v === 'close' || (el.dataset.id === UI.fin.chWin && el.closest('#fin-cv-world')) ? null : el.dataset.id; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.fin.chWin && UI.view === 'finance') { UI.fin.chWin = null; render(); } }, true);
Object.assign(window.__FIN, { chans: () => Object.fromEntries(Object.entries(finChans()).map(([k, c]) => [k, { title: c.title, amt: c.amt, pct: c.pct, how: c.how, what: c.what }])), chanMade: k => finChanMade(k) });
