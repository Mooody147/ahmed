// Money canvas — "How can I manage the rest of this month?". A section on every canvas (under Spending on the Mind map
// and in Rich Dad, in the "Goes out" lane of Flow) that forecasts the days left in this month from two things only:
// your current balances (the money that is yours — other people's money set aside) and your own spending history.
//   Facts: the money in your accounts on the day your figures reach, and the bills, instalments, card bill and income
//   still due this month, each on its date (only payments running today — the same list as everywhere else).
//   Estimates: what the remaining days usually cost you — the same stretch of each recent complete month, the median
//   month, with a range — spread over the days the way you usually spend (FIN.restOfMonth).
// From them: what you can spend a day and keep your safety reserve, how long the money must last until the next
// income, the lowest point, the month end, a week-by-week plan, where to hold back, and what to do. Anything not
// known (no balance, no complete month) is said, never guessed. Card purchases are counted when you make them.

function finMonth() {
  const n = finNow(), key = finNow.k;
  if (finMonth.k === key) return finMonth.v;
  const p = finP(), today = finToday(), cur = today.slice(0, 7), all = finAll(), rec = n.rec || { items: [] };
  // the day your money is known to: the oldest of your own accounts' latest figures (a balance, or transactions after it)
  const cov = typeof finCoverage === 'function' ? finCoverage(finTx()) : {};
  const mine = n.accts.filter(x => ['current', 'savings', 'cash'].includes(x.a.kind) && (!x.a.owner || x.a.owner === 'me') && typeof x.l.balance === 'number');
  const eff = mine.map(x => [x.l.date, cov[x.a.id]].filter(Boolean).sort().pop()).filter(Boolean).map(d => d > today ? today : d);
  const asOf = eff.length ? eff.sort()[0] : null, start = asOf && asOf < today ? FIN.addDays(asOf, 1) : today, end = FIN.monthEnd(cur);
  // what is still due and still coming, from the day after your figures to the month end
  let events = [];
  try { const A = finUpcomingArgs(); events = FIN.upcoming({ today: start, days: FIN.dnum(end) - FIN.dnum(start), recurring: A.recurring, installments: A.installments, incomes: A.incomes, card: A.card }).events.filter(e => ['income', 'bill', 'instalment', 'card'].includes(e.kind) && e.amount); } catch (e) { console.error(e); }
  // your spending, as it varies: every expense except the recurring payments and instalments (those come as dated bills),
  // purchases on instalment financing (they come as instalments) and card payments standing in for unread card statements
  const recIds = new Set(rec.items.flatMap(i => i.ids || [])), bnpl = new Set(p.accounts.filter(a => a.kind === 'bnpl').map(a => a.id));
  const spend = (all.entries || []).filter(e => e.flow === 'exp' && !recIds.has(e.id) && !bnpl.has(e.acct) && e.cat !== 'cc_unitem').map(e => ({ date: e.date, amount: -e.v, cat: e.cat, id: e.id, desc: e.desc || '' }));
  const months = all.months.filter(b => b.covered && b.m < cur).slice(-6).map(b => b.m);
  const prio = Object.fromEntries([...new Set(spend.map(s => s.cat))].map(c => [c, (finCat(c) || {}).prio || '']));
  const cash = n.cashKnown ? FIN.r2(n.cash - n.held) : null;
  const R = FIN.restOfMonth({ today, asOf, cash, reserve: n.reserve, events, spend, months, prio });
  R.spend = spend; R.inputs = (p.inputs || []).filter(i => i.kind === 'income' && (!i.from || i.from <= today) && (!i.to || i.to >= today));
  R.held = n.held; R.noBalance = n.cashAccts - n.cashKnown; R.verify = (rec.verify || []).length; R.verifyMonthly = FIN.r2((rec.verify || []).reduce((s, i) => s + (i.perMonth || 0), 0));
  R.subs = rec.items.filter(i => i.status === 'active' && i.group === 'subs'); R.goalsMonthly = n.goalsMonthly || 0; R.card = n.card;
  R.cuts = finMonthCuts(R);
  finMonth.k = key; finMonth.v = R; return R;
}
// where to hold back when the money is short or tight: the flexible categories down to your cheaper months
function finMonthCuts(R) {
  if (!(R.verdict === 'short' || R.verdict === 'tight')) return { list: [], saves: 0, enough: true };
  const order = { optional: 0, discretionary: 1, important: 2 }, list = []; let saves = 0;
  for (const c of R.cats.filter(c => c.prio in order && c.usual - c.low >= 1).sort((a, b) => order[a.prio] - order[b.prio] || (b.usual - b.low) - (a.usual - a.low))) {
    if (saves >= R.need) break; const cut = FIN.r2(c.usual - c.low); list.push({ ...c, cap: c.low, cut }); saves = FIN.r2(saves + cut);
  }
  return { list, saves, enough: saves >= R.need };
}
const finMoCat = c => (finCat(c) || { name: c }).name;
const finMoDay = d => fday(d).replace(/\s\d{4}$/, '');

// the section, as a room
function finMonthRoom() {
  const R = finMonth();
  const sum = R.cash === null ? 'enter your balances to see it'
    : R.verdict === 'unknown' ? `${R.leftDays} day${R.leftDays === 1 ? '' : 's'} left · add statements to learn your spending`
    : R.verdict === 'short' ? `${R.leftDays} day${R.leftDays === 1 ? '' : 's'} left · short by about ${fkr(R.need)}${R.firstNeg ? ' · runs out around ' + finMoDay(R.firstNeg) : ''}`
    : `${R.leftDays} day${R.leftDays === 1 ? '' : 's'} left · about ${fkr(R.perDay)} a day · month ends near ${fkr(R.endBal)}`;
  return { id: 'month', kind: 'box', sys: true, icon: '🗓️', title: 'How can I manage the rest of this month?', sum, hue: 190, branch: 'mm-assets' };
}

function finMonthHTML() {
  const R = finMonth(), today = finToday(), stale = R.asOf && R.gapDays > 0;
  const V = {
    ok: ['✅', 'You can manage the rest of the month', R.endBal !== null ? `At your usual pace you end ${fmon(today.slice(0, 7))} with about ${fkr(R.endBal)} — ${fkr(Math.max(0, R.endBal - R.reserve))} above your safety reserve.` : ''],
    tight: ['⚠️', 'Tight — your safety reserve gets used', `At your usual pace the month ends at about ${fkr(R.endBal)}, ${fkr(R.need)} inside your ${fkr(R.reserve)} reserve. Spend at most ${fkr(R.perDayAll)} a day to stay above zero, ${fkr(R.perDay)} to keep the reserve.`],
    short: ['🛑', `Short by about ${fkr(R.need)}`, R.firstNeg ? `At your usual pace the money runs out around ${finMoDay(R.firstNeg)}${R.untilPay && R.firstNeg < R.untilPay.date ? `, before ${esc(R.untilPay.label)} on ${finMoDay(R.untilPay.date)}` : ''}. The plan below shows where to hold back.` : 'At your usual pace the month ends below zero. The plan below shows where to hold back.'],
    unknown: ['❔', 'Not known yet', R.cash === null ? 'Enter today’s balances so the forecast can start from the money you have.' : 'There is no complete month in your statements to learn your spending from — add statements (or tell the canvas what a month costs you).'],
  }[R.verdict];
  let ki = 0; const KEYS = ['cash', 'in', 'bills', 'usual', 'end', 'day'];
  const k = (l, v, s, cls = '') => `<button class="${cls}" data-act="fin-mo-k" data-k="${KEYS[ki++]}" title="Where this comes from and how it is worked out"><span>${l}</span><b class="num">${v}</b><small>${s}</small><i class="fin-mo-how">How? ›</i></button>`;
  const tiles = [
    k('Money to live on now', R.cash === null ? '—' : fkr(R.cash), R.cash === null ? 'no balance yet' : `${R.asOf ? 'as of ' + finMoDay(R.asOf) : ''}${R.held > 0 ? ` · ${fkr(R.held)} of others’ money set aside` : ''}`, 'fact'),
    k('Still coming in', fkr(R.income), [...R.events.filter(e => e.amount > 0).map(e => `${esc(e.label)} ${finMoDay(e.date)}`), ...R.assumedIn.map(e => `${esc(e.label)} of today taken as already in your balance`)].join(' · ') || 'nothing expected this month', 'fact'),
    k('Bills still due', fkr(R.bills), `${R.events.filter(e => e.amount < 0).length} bill${R.events.filter(e => e.amount < 0).length === 1 ? '' : 's'}, instalments & card`, 'fact'),
    k('Usual spending to month end', R.usualFromToday === null ? '—' : fkr(R.usualFromToday), R.expected === null ? 'not known yet' : `estimate · usually ${fkr(R.lowS - R.gapSpend > 0 ? R.lowS - R.gapSpend : R.lowS)}–${fkr(R.highS - R.gapSpend > 0 ? R.highS - R.gapSpend : R.highS)}`, 'est'),
    k('End of the month', R.endBal === null ? '—' : fkr(R.endBal), R.endIfHigh !== null ? `estimate · ${fkr(R.endIfHigh)} to ${fkr(R.endIfLow)}` : R.endBal !== null ? 'before your day-to-day spending' : '', `est ${R.endBal !== null && R.endBal < 0 ? 'neg' : ''}`),
    k('You can spend a day', R.perDay === null ? '—' : fkr(R.perDay), R.perDay === null ? '' : `for ${R.leftDays} day${R.leftDays === 1 ? '' : 's'}, keeping your ${fkr(R.reserve)} reserve`, 'key'),
  ].join('');
  // the line: your money day by day at your usual pace, against the reserve
  const chart = R.points.length > 1 ? finLines([{ name: 'Your money (estimate)', pts: R.points.map(p => ({ k: p.date, v: p.bal, est: true, label: fday(p.date) })) }, { name: 'Safety reserve', cls: 'muted', pts: R.points.map(p => ({ k: p.date, v: R.reserve, label: fday(p.date) })) }], { title: 'rest of month', h: 180, label: k2 => finMoDay(k2) }) : '';
  const pay = R.untilPay && R.perDay !== null && R.untilPay.perDay !== null && R.untilPay.perDay < R.perDay
    ? `<p class="fin-mo-pay">💼 <b>Until ${esc(R.untilPay.label)} on ${finMoDay(R.untilPay.date)}:</b> at most <b>${fkr(R.untilPay.perDay)} a day</b> — ${fkr(Math.max(0, R.untilPay.room))} has to last ${R.untilPay.days} day${R.untilPay.days === 1 ? '' : 's'} (you usually spend ${fkr(R.untilPay.usual)} in them).</p>` : '';
  const pace = R.pace && R.pace.ratio !== null ? `<p class="small fin-mo-pace ${R.pace.ratio > 1.15 ? 'warn' : R.pace.ratio < 0.85 ? 'good' : ''}">So far this month: ${fkr(R.pace.spent)} in ${R.pace.days} days — ${Math.round(R.pace.ratio * 100)}% of what you usually spend by this day (${fkr(R.pace.usual)}).</p>` : '';
  const logo = t => typeof finLogo === 'function' ? finLogo(t, 'sm') : '';
  const todo = finMoActions(R);
  return `<div class="fin-mo ${R.verdict}">
    <div class="fin-mo-top"><span class="ic" aria-hidden="true">${V[0]}</span><div><b>${esc(V[1])}</b><span class="small">${V[2]}</span></div></div>
    ${stale ? `<p class="fin-mo-stale small">Your figures stop on ${finMoDay(R.asOf)}: the ${R.gapDays} day${R.gapDays === 1 ? '' : 's'} since are estimated (${fkr(R.gapSpend)} of usual spending). <button class="btn sm" data-act="fin-bal-win">🏦 Enter today’s balances</button></p>` : ''}
    <div class="fin-mo-k">${tiles}</div>${pay}${pace}
    ${chart ? `<div class="fin-mo-chart">${chart}</div>` : ''}
    ${todo.length ? `<h4>What to do</h4><ol class="fin-mo-do">${todo.map(t => `<li>${t}</li>`).join('')}</ol>` : ''}
    <p class="small fin-mo-more">Tap any number above to see where it comes from — the week-by-week plan, where to hold back and every bill and income are there.</p>
    <p class="small muted fin-mo-basis"><b>Facts:</b> your balances${R.asOf ? ` (to ${finMoDay(R.asOf)})` : ''}, and the bills, instalments, card bill and income still due — only payments running today. <b>Estimates:</b> the usual spending, from the same days of your last ${R.months} complete month${R.months === 1 ? '' : 's'} (the median month; the range is your cheaper and dearer quarter), with recurring payments and instalments taken out because they are counted as bills. Card purchases count when you make them. Dates of bills and income are estimated from when they came before.</p>
  </div>`;
}

// the plan in detail (shown in the windows behind the six numbers, so the section on the canvas stays short)
function finMoWeeksHTML(R) {
  const logo = t => typeof finLogo === 'function' ? finLogo(t, 'sm') : '';
  return R.weeks.length ? `<h4>Week by week</h4><div class="fin-box-scroll"><table class="fin-box-t fin-mo-wk"><thead><tr><th>Days</th><th>Due</th><th class="num">Spend up to</th><th class="num">Usual</th></tr></thead><tbody>${R.weeks.map(w => `<tr><td>${finMoDay(w.from)}${w.days > 1 ? ' – ' + finMoDay(w.to) : ''}</td><td>${[...w.income.map(e => `<span class="fin-rec-chip add">${esc(e.label)} +${fkr(e.amount)}</span>`), ...w.bills.map(e => `<span class="fin-rec-chip">${logo(e.label)}${esc(e.label)} ${fkr(-e.amount)}</span>`)].join(' ') || '<span class="muted">—</span>'}</td><td class="num">${w.cap === null ? '—' : fkr(w.cap)}</td><td class="num muted">${R.expected === null ? '—' : fkr(w.usual)}</td></tr>`).join('')}</tbody></table></div>` : '';
}
function finMoCatsHTML(R) {
  const cut = new Map(R.cuts.list.map(c => [c.cat, c]));
  return R.cats.length ? `<h4>${R.cuts.list.length ? 'Where to hold back' : 'What these days usually cost'}</h4><div class="fin-box-scroll"><table class="fin-box-t fin-mo-cat"><thead><tr><th>Category</th><th class="num">Usual for these days</th><th class="num">Aim for</th></tr></thead><tbody>${R.cats.slice(0, 8).map(c => { const x = cut.get(c.cat);
  return `<tr class="${x ? 'cut' : ''}"><td>${esc(finMoCat(c.cat))}${c.prio ? ` <small class="muted">${esc(c.prio)}</small>` : ''}</td><td class="num">${fkr(c.usual)}</td><td class="num">${x ? `<b>${fkr(x.cap)}</b><br><small>saves ${fkr(x.cut)}</small>` : fkr(c.usual)}</td></tr>`; }).join('')}</tbody></table></div>` : '';
}
// what to do, in order
function finMoActions(R) {
  const out = [], b = (act, label) => ` <button class="btn sm ghost" data-act="${act}">${label}</button>`;
  if (R.cash === null || R.noBalance > 0) out.push(`<b>Enter your balances</b>${R.noBalance > 0 && R.cash !== null ? ` — ${R.noBalance} account${R.noBalance === 1 ? ' has' : 's have'} none, so the money now may be more than shown` : ''}.${b('fin-bal-win', '🏦 Balances')}`);
  else if (R.gapDays > 1) out.push(`<b>Update today’s balances</b> — the forecast then starts from what your bank shows now, not from ${finMoDay(R.asOf)}.${b('fin-bal-win', '🏦 Balances')}`);
  if (R.verdict === 'short') {
    out.push(`<b>Find about ${fkr(R.need)} by the month end</b>${R.firstNeg ? ` — at your usual pace the money runs out around ${finMoDay(R.firstNeg)}` : ''}: hold back below, put off anything that can wait until next month, or move money from savings.`);
    const ess = FIN.r2(R.cats.filter(c => c.prio === 'essential').reduce((t, c) => t + c.usual, 0));
    if (ess > 0) out.push(`<b>Keep to essentials</b> — they usually cost about ${fkr(ess)} in these days (${fkr(ess / Math.max(1, R.leftDays))} a day).`);
    if (R.untilPay) out.push(`<b>Until ${esc(R.untilPay.label)} (${finMoDay(R.untilPay.date)}), spend at most ${fkr(R.untilPay.perDay || 0)} a day.</b>`);
  } else if (R.verdict === 'tight') out.push(`<b>Spend at most ${fkr(R.perDay)} a day</b> to keep your safety reserve — you usually spend about ${fkr(R.usualFromToday / Math.max(1, R.leftDays))} a day in these days.`);
  else if (R.verdict === 'ok') out.push(`<b>Keep to about ${fkr(R.perDay)} a day</b> and your reserve stays whole${R.untilPay && R.untilPay.perDay !== null && R.untilPay.perDay < R.perDay ? ` — less (${fkr(R.untilPay.perDay)}) until ${finMoDay(R.untilPay.date)}` : ''}.`);
  if (R.cuts.list.length) out.push(`<b>Hold back on ${R.cuts.list.map(c => esc(finMoCat(c.cat))).join(', ')}</b> to your cheaper months: saves about ${fkr(R.cuts.saves)}${R.cuts.enough ? '' : ` — not the whole ${fkr(R.need)}; the rest needs bigger changes or money from savings`}.`);
  if ((R.verdict === 'short' || R.verdict === 'tight') && R.subs.length) out.push(`<b>Pause a subscription you do not use</b>: ${R.subs.slice(0, 4).map(s => `${esc(s.name)} ${fkr(s.perMonth)}`).join(', ')}.`);
  if ((R.verdict === 'short' || R.verdict === 'tight') && R.card && (R.card.owed > 0 || R.card.available > 0)) out.push('<b>Use the card only for what you can pay in full</b> — card spending is still spending, and next month’s bill pays for it.');
  if (R.pace && R.pace.ratio > 1.15) out.push(`<b>You are spending faster than usual</b> this month (${Math.round(R.pace.ratio * 100)}% of your usual by this day).`);
  if (R.verdict === 'ok' && R.endBal - R.reserve > 1) out.push(`<b>Put the spare ${fkr(R.endBal - R.reserve)} to work</b> — into savings or a goal${R.goalsMonthly ? ` (your goals plan ${fkr(R.goalsMonthly)} a month)` : ''}, or into an asset that pays you.`);
  if (R.verify) out.push(`<b>${R.verify} recurring payment${R.verify === 1 ? ' is' : 's are'} waiting for you to confirm</b> — not counted; if still running ${R.verify === 1 ? 'it adds' : 'they add'} up to ${fkr(R.verifyMonthly)} a month. Check them in Recurring payments.`);
  return out;
}
Object.assign(window.__FIN, { month: () => { const R = finMonth(); return { start: R.start, end: R.end, asOf: R.asOf, leftDays: R.leftDays, gapDays: R.gapDays, months: R.months, cash: R.cash, income: R.income, bills: R.bills, expected: R.expected, usualFromToday: R.usualFromToday, endBal: R.endBal, perDay: R.perDay, perDayAll: R.perDayAll, verdict: R.verdict, need: R.need, lowPoint: R.lowPoint, untilPay: R.untilPay, events: R.events.map(e => [e.date, e.kind, e.label, e.amount]), cats: R.cats.map(c => [c.cat, c.usual, c.low, c.prio]), cuts: R.cuts.list.map(c => [c.cat, c.cap]), weeks: R.weeks.map(w => [w.from, w.to, w.cap]), actions: finMoActions(R).map(finTxt) }; } });

// each of the six numbers, opened: where it comes from and how it is worked out
const FIN_MO_WIN = { cash: ['🏦', 'Money to live on now'], in: ['💼', 'Still coming in'], bills: ['🧾', 'Bills still due'], usual: ['🛒', 'Usual spending to month end'], end: ['📅', 'End of the month'], day: ['🎯', 'You can spend a day'] };
function finMoWinHTML() {
  const key = UI.fin.moWin, W = FIN_MO_WIN[key]; if (!W) return '';
  const R = finMonth(), n = finNow(), p = finP(), today = finToday(), cur = today.slice(0, 7);
  const row = (l, v, s, cls = '') => `<div class="${cls}"><span><b>${l}</b>${s ? `<small>${s}</small>` : ''}</span><b class="num">${v}</b></div>`;
  const eq = list => `<div class="fin-mo-eq">${list.map(([op, l, v, s, cls]) => `<div class="${cls || ''}"><span class="op">${op}</span><span><b>${l}</b>${s ? `<small>${s}</small>` : ''}</span><b class="num">${v}</b></div>`).join('')}</div>`;
  const logo = t => typeof finLogo === 'function' ? finLogo(t, 'sm') : '';
  const A = (() => { try { return finUpcomingArgs(); } catch { return { recurring: [], installments: [] }; } })();
  let body = '';
  if (key === 'cash') {
    const mine = n.accts.filter(x => ['current', 'savings', 'cash'].includes(x.a.kind) && (!x.a.owner || x.a.owner === 'me'));
    const third = FIN.thirdParty(finTx(), p.parties).filter(x => x.held > 0.5);
    body = `<p>The money in your own bank and cash accounts, as far as your figures reach, minus money you hold for other people.</p>`
      + eq([...mine.map(({ a, l }) => ['+', `${logo(a.name)}${esc(a.name)}`, typeof l.balance === 'number' ? fk(l.balance) : '—', typeof l.balance !== 'number' ? 'no balance yet — not counted' : `${l.source === 'you' ? 'the balance you entered' : 'the statement’s closing balance'} on ${fday(l.date)}${l.since ? ` · then ${l.since.n} transaction${l.since.n === 1 ? '' : 's'} (${fm(l.since.sum, null, { plus: true, dec: 0 })}) after it` : ''}`, typeof l.balance !== 'number' ? 'muted' : '']),
        ...third.map(x => ['−', `Held for ${esc(x.name)}`, fk(x.held), 'other people’s money in your accounts — not yours to spend', 'neg']),
        ['=', 'Money to live on now', R.cash === null ? '—' : fk(R.cash), R.asOf ? `as of ${fday(R.asOf)}` : '', 'tot']])
      + `<p class="small muted">Your card and Halan are not here: what you owe on them is counted as a bill when it is due. Savings you keep as your safety reserve are included here and protected in “You can spend a day”.</p>
        <div class="row"><button class="btn sm" data-act="fin-bal-win">🏦 Update today’s balances</button></div>`;
  } else if (key === 'in') {
    const ins = R.events.filter(e => e.amount > 0), rec = new Map((A.recurring || []).filter(r => r.dir > 0).map(r => [r.name, r]));
    const paid = (finAll().entries || []).filter(e => e.flow === 'inc' && e.v > 0 && e.m === cur && (e.cat === 'salary' || FIN_PAYROLL.test(e.desc || '')));
    body = `<p>Income still expected between ${fday(R.start)} and ${fday(R.end)}, each on the day it usually arrives.</p>`
      + (ins.length ? eq([...ins.map(e => { const r = rec.get(e.label);
          return ['+', `${logo(e.label)}${esc(e.label)}`, fk(e.amount), `expected ${fday(e.date)} · ${e.manual ? 'the amount you told the canvas; the day your pay usually arrives' : r ? `repeats every month in your statements (${r.n} times, last ${fday(r.last)})${R.inputs.some(i => i.key === 'salary') && FIN_PAYROLL.test(e.label) ? ' · amount as you told the canvas' : ''}` : 'from your statements'}`]; }),
          ['=', 'Still coming in', fk(R.income), '', 'tot']]) : '<p class="muted">Nothing more is expected this month.</p>')
      + (R.assumedIn.length ? `<p class="small">${R.assumedIn.map(e => esc(e.label)).join(', ')} of today is taken as already in the balance you gave today.</p>` : '')
      + (paid.length ? `<p class="small">Already arrived this month (so it is in your money now, not counted again): ${paid.map(e => `${esc(FIN.cleanDesc(e.desc))} ${fk(e.v)} on ${fday(e.date)}`).join(', ')}.</p>` : '')
      + `<h4>Your salary</h4><p class="small">${R.inputs.length ? `You told the canvas: ${R.inputs.map(i => `${esc(i.label)} ${fk(+i.amount)} a month from ${fday(i.from)}`).join(', ')}.` : 'Taken from your statements — tell the canvas if it changed.'} Your monthly income now: ${fk(n.income)} (${esc(n.incomeBasis)}).</p>
        <div class="row"><button class="btn sm" data-act="fin-cv-edit" data-id="in:salary">✎ My salary is different</button></div>`;
  } else if (key === 'bills') {
    const items = (n.rec || { items: [] }).items, find = e => items.find(i => i.status === 'active' && (i.name === e.label || FIN.norm(i.name).startsWith(FIN.norm(e.label).slice(0, 10))));
    const out = R.events.filter(e => e.amount < 0), V = (n.rec || {}).verify || [];
    body = `<p>Payments still due between ${fday(R.start)} and ${fday(R.end)}, each on its date — only payments the recurring audit finds running today.</p>`
      + (out.length ? eq([...out.map(e => { const it = find(e);
          const how = e.kind === 'card' ? `your card owes ${fk(-e.amount)}; due ${fday(e.date)}${e.min ? ` (minimum ${fk(e.min)})` : ''} — counted in full` : e.kind === 'instalment' ? `instalment${it && it.of ? ` · ${it.n} of ${it.of} paid` : ''}${it && it.end ? ` · ends ${fmon(it.end)}` : ''} · a month after the last one` : it ? `${(FIN_REC_GROUPS[it.group] || [])[1] || 'recurring'} · every ${it.freq === 'monthly' ? 'month' : it.freq} since ${it.first ? fmon(it.first) : '—'} · last ${fday(it.last)}` : 'repeats every month in your statements';
          return ['−', `${logo(e.label)}${esc(e.label)}`, fk(-e.amount), `${fday(e.date)} · ${how}${e.onCard ? ' · on the card' : ''}${e.date < today ? ' · may already be paid (after your latest figures)' : ''}`]; }),
          ['=', 'Bills still due', fk(R.bills), '', 'tot']]) : '<p class="muted">No more bills expected this month.</p>')
      + (V.length ? `<h4>Not counted — waiting for you</h4><div class="fin-box-list">${V.map(i => row(`${logo(i.name)}${esc(i.name)}`, fk(i.perMonth), `${esc(i.why || 'to verify')} — mark it “Still paying” in Recurring payments to count it`, 'muted')).join('')}</div>` : '');
  } else if (key === 'usual') {
    const med = R.expected, perM = R.perM || [], sorted = perM.map(x => x.amount).sort((a, b) => a - b), mids = new Set(sorted.length ? [sorted[(sorted.length - 1) >> 1], sorted[sorted.length >> 1]] : []), learn = new Set(perM.map(x => x.m)), fromOf = new Map(perM.map(x => [x.m, x.from[0]]));
    const big = R.spend.filter(s => learn.has(s.date.slice(0, 7)) && +s.date.slice(8, 10) >= fromOf.get(s.date.slice(0, 7))).sort((a, b) => b.amount - a.amount).slice(0, 8);
    body = `<p>An estimate from your own history: what the same days of the month cost you in your last ${R.months} complete month${R.months === 1 ? '' : 's'} (from day ${perM[0] ? perM[0].from[0] : '—'} to the month end). The middle month is used — not the average, so one unusual month does not swing it. Recurring payments and instalments are taken out: they are counted as bills.</p>`
      + (perM.length ? `<div class="fin-box-scroll"><table class="fin-box-t"><thead><tr><th>Month</th><th>Days</th><th class="num">Spent in those days</th></tr></thead><tbody>${perM.slice().reverse().map(x => `<tr class="${mids.has(x.amount) ? 'mid' : ''}"><td>${fmon(x.m)}</td><td>${x.from[0]}–${FIN.dim(x.m)}</td><td class="num">${fk(x.amount)}${mids.has(x.amount) ? ` <small>← ${mids.size > 1 ? 'middle (the usual is halfway between these two)' : 'middle month'}</small>` : ''}</td></tr>`).join('')}</tbody></table></div>`
        + eq([['', 'Usual for these days', med === null ? '—' : fk(med), `your cheaper months ${fk(R.lowS)} · dearer months ${fk(R.highS)}`], ...(R.gapSpend > 0 ? [['−', 'Days already gone but not in your figures', fk(R.gapSpend), `${R.gapDays} day${R.gapDays === 1 ? '' : 's'} after ${fday(R.asOf)}`]] : []), ['=', 'Usual spending to month end', fk(R.usualFromToday), 'from today', 'tot']]) : '<p class="muted">No complete month to learn from yet.</p>')
      + finMoCatsHTML(R)
      + (big.length ? `<h4>The biggest payments in those days</h4><p class="small muted">If one of these was not really spending (money moved between your accounts, or paid out for someone else), change its category in All transactions and every number follows.</p><div class="fin-box-list">${big.map(s => row(`${logo(s.desc)}${esc(FIN.cleanDesc(s.desc))}`, fk(s.amount), `${fday(s.date)} · ${esc(finMoCat(s.cat))}`)).join('')}</div><div class="row"><button class="btn sm ghost" data-act="fin-sec" data-s="ledger">📒 All transactions</button></div>` : '');
  } else if (key === 'end') {
    body = `<p>Where the month ends if you spend as usual — your money now, plus what still comes in, minus what is still due and your usual spending.</p>`
      + eq([['', 'Money to live on now', R.cash === null ? '—' : fk(R.cash), 'fact'], ['+', 'Still coming in', fk(R.income), 'fact'], ['−', 'Bills still due', fk(R.bills), 'fact'], ['−', 'Usual spending to month end', R.expected === null ? '—' : fk(R.expected), R.gapSpend > 0 ? `estimate · incl. ${fk(R.gapSpend)} for the days since your figures` : 'estimate'], ['=', `End of ${fmon(cur)}`, R.endBal === null ? '—' : fk(R.endBal), 'estimate', `tot ${R.endBal !== null && R.endBal < 0 ? 'neg' : ''}`]])
      + (R.endIfHigh !== null ? `<p class="small">In a dearer month like your dearest quarter: ${fk(R.endIfHigh)} · in a cheaper one: ${fk(R.endIfLow)}.</p>` : '')
      + (R.lowPoint ? `<p class="small">Lowest point on the way: <b>${fk(R.lowPoint.bal)}</b> on ${fday(R.lowPoint.date)}${R.untilPay ? ` — before ${esc(R.untilPay.label)} arrives on ${fday(R.untilPay.date)}` : ''}.</p>` : '')
      + `<p class="small muted">Compared with your safety reserve of ${fk(R.reserve)}: ${R.endBal === null ? '—' : R.endBal >= R.reserve ? `${fk(R.endBal - R.reserve)} above it` : `${fk(R.reserve - R.endBal)} below it`}.</p>`;
  } else if (key === 'day') {
    const months = +p.emergencyMonths || 3;
    body = `<p>How much you can spend each day from today to the month end and still keep your safety reserve untouched.</p>`
      + eq([['', 'Money to live on now', R.cash === null ? '—' : fk(R.cash), ''], ['+', 'Still coming in', fk(R.income), ''], ['−', 'Bills still due', fk(R.bills), ''], ...(R.gapSpend > 0 ? [['−', 'Days already gone but not in your figures', fk(R.gapSpend), 'estimated']] : []),
          ['=', 'Money for the rest of the month', R.room === null ? '—' : fk(R.room), ''], ['−', 'Safety reserve — keep it', fk(R.reserve), `${months} months of essentials (usually ${fk(n.essential)} a month)`], ['÷', 'Days left, today included', String(R.leftDays), ''],
          ['=', 'You can spend a day', R.perDay === null ? '—' : fk(R.perDay), R.room !== null && R.room - R.reserve <= 0 ? 'nothing is left above the reserve' : '', 'tot']])
      + `<p class="small">Without keeping the reserve: ${R.perDayAll === null ? '—' : fk(R.perDayAll)} a day. You usually spend about ${R.usualFromToday === null ? '—' : fk(R.usualFromToday / Math.max(1, R.leftDays))} a day in these days.</p>`
      + (R.untilPay && R.untilPay.perDay !== null ? `<p class="small">Until ${esc(R.untilPay.label)} on ${fday(R.untilPay.date)} the money has to last on its own: ${fk(Math.max(0, R.untilPay.room))} for ${R.untilPay.days} day${R.untilPay.days === 1 ? '' : 's'} = <b>${fk(R.untilPay.perDay)} a day</b>.</p>` : '')
      + `<p class="small muted">The reserve follows your settings (months of essentials). Card spending counts too — it is paid from next month’s bill.</p>`
      + finMoWeeksHTML(R);
  }
  return `<section class="fin-talk-win fin-mo-win" id="fin-mo-win" role="dialog" aria-label="${esc(W[1])}">
    <div class="fin-talk-win-h"><span aria-hidden="true">${W[0]}</span><b>${esc(W[1])} — where from, and how</b><span class="spacer"></span><button class="icon-btn" data-act="fin-mo-k" data-k="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b fin-mo-w">${body}<nav class="fin-mo-tabs" aria-label="The six numbers">${Object.entries(FIN_MO_WIN).map(([k2, [ic, l]]) => `<button class="${k2 === key ? 'on' : ''}" data-act="fin-mo-k" data-k="${k2}">${ic} ${esc(l)}</button>`).join('')}</nav></div></section>`;
}
Object.assign(ACT, { 'fin-mo-k': el => { const k = el.dataset.k; UI.fin.moWin = k === 'close' || (k === UI.fin.moWin && el.closest('#fin-cv-world')) ? null : k; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.fin.moWin && UI.view === 'finance') { UI.fin.moWin = null; render(); } }, true);
Object.assign(window.__FIN, { moWin: () => { const w = document.getElementById('fin-mo-win'); return w ? w.innerText : null; } });
