/* ---------- Money: analysis, budgets, this month, income growth, forecast, goals, recommendations ---------- */
const FIN_PRIO = [['essential', 'Essential'], ['important', 'Important'], ['discretionary', 'Discretionary'], ['optional', 'Optional']];
const finEst = '<span class="fin-est">estimate</span>';
// complete months with a statement, newest last
const finDone = (an, n) => an.months.filter(b => b.covered && b.m < finToday().slice(0, 7)).slice(-(n || 1200));
const finMedian = a => a.length ? FIN.r2(FIN.median(a)) : null;

/* --- category metrics (expense and income analytics share the table) --- */
function finCatTable(an, kind) {
  const rows = Object.values(an.cats).filter(c => c.kind === kind).sort((a, b) => b.total - a.total);
  if (!rows.length) return '<p class="muted small">Nothing in this period.</p>';
  const tot = rows.reduce((s, c) => s + c.total, 0);
  return `<div class="tbl-wrap"><table class="tbl fin-tbl fin-metrics"><thead><tr><th>Category</th><th class="num">Total</th><th class="num">Monthly avg</th><th class="num">Daily avg</th><th class="num">Peak month</th><th class="num">Lowest month</th><th class="num">Count</th><th class="num">Avg each</th><th class="num">Share</th><th class="num">vs previous period</th><th>First</th><th>Latest</th><th class="num">Annualised ${finEst}</th></tr></thead><tbody>
    ${rows.map(c => `<tr><td><button class="linkish" data-act="fin-drill-cat" data-k="${esc(c.id)}">${esc(c.name)}</button>${c.refunds ? `<small class="muted"> · refunds ${fm(c.refunds)}</small>` : ''}</td><td class="num">${fm(c.total)}</td><td class="num">${fm(c.monthly)}</td><td class="num">${fm(c.daily)}</td>
      <td class="num">${c.peak ? `${fm(c.peak.v)}<small class="muted"> ${fmon(c.peak.m)}</small>` : '—'}</td><td class="num">${c.low ? `${fm(c.low.v)}<small class="muted"> ${fmon(c.low.m)}</small>` : '—'}</td><td class="num">${c.count}</td><td class="num">${fm(c.avgTx)}</td><td class="num">${fpct(c.share)}</td>
      <td class="num">${c.change === null ? '<span class="muted small">no earlier data</span>' : `<span class="${(kind === 'expense' ? c.change > 0 : c.change < 0) ? 'fin-neg' : 'fin-pos'}">${c.change > 0 ? '+' : ''}${fpct(c.change)}</span>`}</td><td class="nowrap small">${fday(c.firstDate)}</td><td class="nowrap small">${fday(c.lastDate)}</td><td class="num">${fm(c.annual)}</td></tr>`).join('')}
    <tr class="fin-total"><td>Total</td><td class="num">${fm(tot)}</td><td class="num">${fm(tot / an.totals.months)}</td><td class="num">${fm(tot / an.totals.days)}</td><td colspan="9"></td></tr></tbody></table></div>
    <p class="small muted">Monthly average = total ÷ ${an.totals.months} calendar months (${fday(an.from)} – ${fday(an.to)}); daily = total ÷ ${an.totals.days} days; peak and lowest months use months with a statement, where a month with no spending counts as a real zero${an.totals.gaps.length ? `; ${an.totals.gaps.length} month${an.totals.gaps.length === 1 ? '' : 's'} without any statement ${an.totals.gaps.length === 1 ? 'is' : 'are'} left out of peak/lowest` : ''}. “vs previous period” compares with the same number of days just before.</p>`;
}
function finCatTrend(an, kind) {
  const cats = Object.values(an.cats).filter(c => c.kind === kind).sort((a, b) => b.total - a.total);
  if (!cats.length) return '';
  const k = kind === 'expense' ? 'expCat' : 'incCat', sel = an.cats[UI.fin[k]] ? UI.fin[k] : cats[0].id, c = an.cats[sel];
  return `<section class="card fin-card"><div class="row"><h2>Monthly trend</h2><span class="spacer"></span><select class="input" data-chg="fin-ui" data-k="${k}" aria-label="Category">${cats.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
    ${finBars(c.series.map(s => ({ k: `${sel}|${s.m}`, label: fmon(s.m), short: fmtDate(s.m + '-15', { month: 'short' }), a: kind === 'income' ? s.v : 0, b: kind === 'expense' ? s.v : 0, missing: s.v === null })), { act: 'fin-drill-catmonth', la: c.name, lb: c.name, title: c.name + ' by month' })}
    <p class="small">Peak ${c.peak ? `<b>${fm(c.peak.v)}</b> in ${fmon(c.peak.m)}` : '—'} · lowest ${c.low ? `<b>${fm(c.low.v)}</b> in ${fmon(c.low.m)}` : '—'} · average <b>${fm(c.monthly)}</b> a month</p></section>`;
}
function finGranChart(an) {
  const g = UI.fin.gran, rows = FIN.series(an.entries || [], g, an.from, an.to);
  const lab = k => g === 'day' ? fmtDate(k, { day: 'numeric', month: 'short' }) : g === 'week' ? 'w/c ' + fmtDate(k, { day: 'numeric', month: 'short' }) : g === 'month' ? fmon(k) : k;
  return `<section class="card fin-card"><div class="row"><h2>Income and expenses over time</h2><span class="spacer"></span><div class="seg">${[['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly'], ['quarter', 'Quarterly'], ['year', 'Yearly']].map(([k, l]) => `<button data-act="fin-gran" data-g="${k}" aria-pressed="${g === k}">${l}</button>`).join('')}</div></div>
    ${rows.length > 400 ? '<p class="small muted">Too many days to draw — choose weekly or monthly.</p>' : finBars(rows.map(r => ({ k: r.k, label: lab(r.k), short: lab(r.k), a: r.inc, b: r.exp, net: r.net })), { net: true, title: 'Income and expenses over time' })}</section>`;
}

/* --- expense analytics --- */
FIN_VIEW.exp = () => {
  const an = finAn(); if (an.empty) return finNotices(an) + '<p class="muted">No transactions yet.</p>';
  const ex = Object.values(an.cats).filter(c => c.kind === 'expense' && c.total > 0).sort((a, b) => b.total - a.total);
  const rec = FIN.recurring(an.entries || []).filter(r => r.dir < 0);
  const p = finP(), accts = p.accounts.map(a => { const E = (an.entries || []).filter(e => e.acct === a.id); return { a, inc: E.filter(e => e.v > 0).reduce((s, e) => s + e.v, 0), out: E.filter(e => e.v < 0).reduce((s, e) => s - e.v, 0), rec: FIN.reconcile(a, finTx(), colList('finbatch')) }; }).filter(x => x.inc || x.out || x.rec.confirmed);
  return finNotices(an) + `<section class="card fin-card"><h2>Every expense category</h2>${an.totals.expProperty ? `<p class="small">Living expenses <b>${fm(an.totals.expLiving)}</b> · property installments and charges <b>${fm(an.totals.expProperty)}</b> (kept apart from living costs)</p>` : ''}${finCatTable(an, 'expense')}</section>
    ${finCatTrend(an, 'expense')}
    <div class="fin-grid2"><section class="card fin-card"><h2>Highest spending categories</h2>${finHBars(ex.slice(0, 5).map(c => ({ id: c.id, label: c.name, v: c.total, sub: fpct(c.share) })), { act: 'fin-drill-cat', cls: 's2' })}</section>
      <section class="card fin-card"><h2>Lowest spending categories</h2>${finHBars(ex.slice(-5).reverse().map(c => ({ id: c.id, label: c.name, v: c.total, sub: fpct(c.share) })), { act: 'fin-drill-cat', cls: 's2' })}</section></div>
    ${finGranChart(an)}
    <section class="card fin-card"><h2>Repeating payments and subscriptions</h2>${rec.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Payee</th><th>Category</th><th>How often</th><th class="num">Usual amount</th><th class="num">Per month</th><th class="num">Per year</th><th>Last</th><th>Next expected ${finEst}</th><th></th></tr></thead><tbody>${rec.map(r => `<tr><td>${esc(r.name)}</td><td>${esc((finCat(r.cat) || {}).name || '')}</td><td>${r.freq}${r.fixed ? '' : ` <small class="muted">(varies ±${Math.round(r.spread)}%)</small>`}</td><td class="num">${fm(r.amount)}</td><td class="num">${fm(r.perMonth)}</td><td class="num">${fm(r.annual)}</td><td class="nowrap small">${fday(r.last)}</td><td class="nowrap small">${fday(r.next)}</td><td><button class="btn sm ghost" data-act="fin-drill-ids" data-ids="${esc(r.ids.join(','))}" data-t="${esc(r.name)}">${r.n} payments</button></td></tr>`).join('')}</tbody></table></div><p class="small muted">Found when the same payee is paid in at least 3 different months at a steady interval.</p>` : '<p class="muted small">None found yet (needs 3 months of the same payee).</p>'}</section>
    <section class="card fin-card"><h2>By account</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th class="num">Money in</th><th class="num">Money out</th><th class="num">Net</th><th class="num">Latest statement balance</th></tr></thead><tbody>${accts.map(x => `<tr><td>${esc(x.a.name)} <small class="muted">${esc(x.a.currency)}</small></td><td class="num">${fm(x.inc)}</td><td class="num">${fm(x.out)}</td><td class="num">${fmc(x.inc - x.out)}</td><td class="num">${x.rec.confirmed ? `${fm(x.rec.confirmed.balance, x.a.currency)} <small class="muted">${fday(x.rec.confirmed.date)}</small>` : '—'}</td></tr>`).join('')}</tbody></table></div><p class="small muted">In and out here include every entry counted in this period (in ${esc(p.base)}); movements between your own accounts are not counted.</p></section>`;
};

/* --- income and the current position --- */
FIN_VIEW.inc = () => {
  const an = finAn(), all = finAll(), today = finToday(), p = finP(); if (an.empty) return finNotices(an) + '<p class="muted">No transactions yet.</p>';
  const inc = Object.values(an.cats).filter(c => c.kind === 'income' && c.total > 0).sort((a, b) => b.total - a.total);
  const ib = FIN.incomeBase(all, today), done = finDone(all, 6);
  const catMed = prio => finMedian(done.map(b => Object.entries(b.byCat).filter(([k]) => { const c = finCat(k); return c && c.kind === 'expense' && (c.prio || 'discretionary') === prio && c.group !== 'property'; }).reduce((s, [, v]) => s + v, 0)));
  const ess = catMed('essential'), imp = catMed('important'), disc = (catMed('discretionary') || 0) + (catMed('optional') || 0);
  const rec = FIN.recurring(all.entries || []).filter(r => r.dir < 0), fixed = rec.filter(r => r.fixed).reduce((s, r) => s + r.perMonth, 0) + p.commitments.reduce((s, c) => s + (+c.amount || 0), 0);
  const prop = finMedian(done.map(b => b.expProp || 0));
  const last = done[done.length - 1], netMed = finMedian(done.map(b => b.net));
  const base = ib.salary !== null ? ib.salary : (+p.sim.base || null);
  const disp = base !== null ? FIN.r2(base + ib.otherRecurringMonthly - (finMedian(done.map(b => b.exp)) || 0)) : null;
  const pos = finPosition();
  const sr = all.months.filter(b => b.covered && b.inc > 0).map(b => ({ k: b.m, v: FIN.r2((b.inc - b.exp) / b.inc * 100), label: fmon(b.m) }));
  const kv = (l, v, note) => `<div class="fin-kv"><span>${l}${note ? `<small class="muted">${note}</small>` : ''}</span><b class="num">${v}</b></div>`;
  return finNotices(an) + `<section class="card fin-card"><h2>How much do I earn, spend, and can I save?</h2>
    <div class="fin-grid2"><div>
      ${kv('Latest complete month’s income', last ? fm(last.inc) : '—', last ? fmon(last.m) + ' — not assumed to be the salary' : '')}
      ${kv('Average monthly income', fm(all.totals.avgInc), `all months since ${fday(all.first)}`)}
      ${kv('Recurring salary', ib.salary !== null ? fm(ib.salary) : '—', ib.salary === null ? 'no salary found — enter it below' : ib.verified ? `verified: ${ib.basis}` : `NOT verified: only ${ib.salaryMonths} of the last 4 months`)}
      ${kv('Other recurring income', fm(ib.otherRecurringMonthly), ib.otherRecurring.length ? ib.otherRecurring.map(r => esc(r.name)).join(', ') : 'none found')}
      ${kv('Irregular income (bonuses, other)', fm(ib.irregularMonthly), 'monthly average, last 12 months')}
      ${base === null ? `<label class="field"><span class="label">Your monthly net income (when the statements do not show a salary)</span><input class="input num" data-chg="fin-sim" data-k="base" value="${esc(p.sim.base)}" inputmode="decimal"></label>` : ''}
    </div><div>
      ${kv('Essential expenses / month', fm(ess), 'median of the last 6 complete months')}
      ${kv('Important expenses / month', fm(imp), 'median')}
      ${kv('Discretionary and optional / month', fm(disc), 'median')}
      ${kv('Fixed commitments / month', fm(fixed), `${rec.filter(r => r.fixed).length} repeating payments${p.commitments.length ? ' + entered' : ''}`)}
      ${prop ? kv('Property installments / month', fm(prop), 'median, kept apart from living costs') : ''}
      ${kv('Last complete month’s net cash flow', last ? fmc(last.net) : '—', last ? fmon(last.m) : '')}
      ${kv('Disposable income ' + finEst, disp !== null ? fmc(disp) : '—', 'recurring income − median monthly spending')}
      ${kv('Historical savings capacity', netMed !== null ? fmc(netMed) : '—', 'median monthly net of the last 6 complete months')}
      ${kv('Account balances (statements)', pos.assets.filter(a => a.kind === 'bank' && a.verified).map(a => fm(a.amount, a.currency)).join(' + ') || '—', 'confirmed by the latest statement')}
    </div></div></section>
    <section class="card fin-card"><h2>Every income category</h2>${finCatTable(an, 'income')}
      <p class="small muted">Not income: refunds (${fm(an.totals.refunds)}, they reduce the expense they reverse), money held for others (${an.totals.thirdCount} transactions), sale proceeds (${fm(an.totals.capital)}, shown apart).</p></section>
    ${finCatTrend(an, 'income')}
    <div class="fin-grid2"><section class="card fin-card"><h2>Income by source</h2>${finHBars(inc.map(c => ({ id: c.id, label: c.name, v: c.total, sub: fpct(c.share) })), { act: 'fin-drill-cat' })}</section>
      <section class="card fin-card"><h2>Savings rate by month</h2>${finLines([{ name: 'Savings rate', pts: sr }], { title: 'Savings rate by month', pct: true, label: k => fmtDate(k + '-15', { month: 'short' }) })}<p class="small muted">(income − expenses) ÷ income, months with income only.</p></section></div>`;
};

/* --- budgets and this month --- */
function finPlan() { const p = finP(); return FIN.budgetPlan(finAll(), { cats: finCats(), today: finToday(), strategy: p.strategy, budgets: p.budgets }); }
FIN_VIEW.budget = () => {
  const p = finP(), plan = finPlan(), all = finAll(), today = finToday();
  const ib = FIN.incomeBase(all, today), expected = ib.salary !== null ? FIN.r2(ib.salary + ib.otherRecurringMonthly) : (+p.sim.base || null);
  const mc = FIN.monthControl(all, plan, { today, month: UI.fin.month, expectedIncome: expected, saveTarget: p.saveTarget, commitments: p.commitments });
  const un = FIN.unusual(all.entries || []).filter(u => u.date.slice(0, 7) === mc.month);
  const sumRec = plan.rows.reduce((s, r) => s + (r.recommended || 0), 0);
  const left = expected !== null ? FIN.r2(expected - (plan.totalBudget || sumRec)) : null;
  return `<section class="card fin-card"><h2>This month: ${fmon(mc.month)}</h2>
    <div class="row"><button class="btn sm" data-act="fin-month" data-d="-1">‹</button><button class="btn sm" data-act="fin-month" data-d="0">This month</button><button class="btn sm" data-act="fin-month" data-d="1">›</button><span class="small muted">day ${mc.day} of ${FIN.dim(mc.month)}${mc.daysLeft > 0 ? ` · ${mc.daysLeft} days left` : ''}</span></div>
    <div class="fin-kpis">
      ${finKpi('Income: actual vs expected', `${fm(mc.inc)} <span class="muted">/ ${expected !== null ? fm(expected) : '—'}</span>`, expected === null ? 'no recurring income known yet' : mc.incGap < 0 ? `${fm(-mc.incGap)} not received yet` : 'received', { act: 'fin-drill-month', data: { k: mc.month } })}
      ${finKpi('Spending: actual vs budget', `${fm(mc.exp)} <span class="muted">/ ${plan.totalBudget ? fm(plan.totalBudget) : '—'}</span>`, plan.totalBudget ? `${fm(mc.budgetLeft)} of the budget left` : 'no budgets set', { cls: plan.totalBudget && mc.budgetLeft < 0 ? 'bad' : '' })}
      ${finKpi('Still disposable', fmc(mc.disposable), `income − spending − ${fm(mc.committed)} still due`, { est: true })}
      ${finKpi('Saved this month', `${fmc(mc.saved)}${mc.saveTarget ? ` <span class="muted">/ ${fm(mc.saveTarget)}</span>` : ''}`, `income − spending so far${mc.savedMoved ? ` · ${fm(mc.savedMoved)} moved to savings` : ''}`)}
      ${mc.perDay !== null ? finKpi('Flexible spending per day', fm(mc.perDay), `${fm(mc.flexLeft)} left in discretionary budgets ÷ ${mc.daysLeft} days`) : ''}
    </div>
    ${mc.over.length ? `<div class="fin-note bad">🔴 Over budget: ${mc.over.map(o => `<b>${esc(o.name)}</b> by ${fm(o.over)}`).join(', ')}</div>` : ''}
    ${mc.pace.length ? `<div class="fin-note">🟠 On pace to go over: ${mc.pace.map(o => `<b>${esc(o.name)}</b> (heading for ${fm(o.projected)} vs ${fm(o.budget)})`).join(', ')}</div>` : ''}
    ${un.length ? `<div class="fin-note">⚠️ Unusual: ${un.map(u => `<button class="linkish" data-act="fin-edit" data-id="${esc(u.id)}">${fm(u.amount)} ${esc((finCat(u.cat) || {}).name || '')} on ${fday(u.date)}</button> (${u.times}× its usual ${fm(u.median)})`).join(', ')}</div>` : ''}
    <h3>Still to come this month ${finEst}</h3>${mc.upcoming.length ? `<ul class="fin-list">${mc.upcoming.map(u => `<li>${esc(u.name)} — <b class="num">${fm(u.amount)}</b> · ${u.late ? `expected ${fday(u.date)}, not seen yet` : fday(u.date)}${u.manual ? ' <small class="muted">(you entered it)</small>' : ''}</li>`).join('')}</ul>` : '<p class="small muted">Nothing known.</p>'}
    <h3>For the rest of the month</h3><ul class="fin-list">${finMonthActions(mc, plan).map(a => `<li>${a}</li>`).join('') || '<li class="muted">Nothing to change.</li>'}</ul>
  </section>
  <section class="card fin-card"><h2>Budget by category</h2>
    <div class="row fin-strat">${Object.entries(FIN.STRATEGY).map(([k, s]) => `<button class="btn ${p.strategy === k ? 'primary' : ''}" data-act="fin-strategy" data-s="${k}">${s.label}</button>`).join('')}<span class="spacer"></span><label class="small">Monthly savings target <input class="input num sm" data-chg="fin-pref" data-k="saveTarget" value="${esc(p.saveTarget)}" inputmode="decimal"></label></div>
    <p class="small"><b>${FIN.STRATEGY[p.strategy].label}:</b> ${esc(plan.why)} Based on your last ${plan.months} complete month${plan.months === 1 ? '' : 's'} with a statement — not on fixed percentages. Fixed repeating payments are never set below what they cost.</p>
    <div class="tbl-wrap"><table class="tbl fin-tbl fin-budget"><thead><tr><th>Category</th><th>Priority</th><th class="num">Monthly average</th><th class="num">Recommended</th><th class="num">Your budget</th><th class="num">Spent this month</th><th class="num">Left</th><th>Used</th><th class="num">Could save / month</th><th class="num">/ year</th><th>Trend</th></tr></thead><tbody>
    ${plan.rows.map(r => `<tr><td><button class="linkish" data-act="fin-drill-cat" data-k="${esc(r.id)}">${esc(r.name)}</button>${r.fixed ? `<small class="muted"> · fixed ${fm(r.fixed)}</small>` : ''}</td><td><select class="input sm" data-chg="fin-prio" data-id="${esc(r.id)}">${FIN_PRIO.map(([k, l]) => `<option value="${k}" ${r.prio === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td class="num">${fm(r.avg)}</td><td class="num">${fm(r.recommended)}</td><td class="num"><input class="input num sm" data-chg="fin-budget" data-id="${esc(r.id)}" value="${r.budget ?? ''}" placeholder="${r.recommended ?? ''}" inputmode="decimal" aria-label="Budget for ${esc(r.name)}"></td>
      <td class="num">${fm(r.spent)}</td><td class="num">${r.remaining === null ? '—' : fmc(r.remaining)}</td><td>${r.util === null ? '' : `<span class="fin-util ${r.util > 100 ? 'over' : r.util > 80 ? 'near' : ''}"><i style="width:${Math.min(100, r.util)}%"></i></span><small class="num">${fpct(r.util)}</small>`}</td>
      <td class="num">${r.saveMonthly ? fm(r.saveMonthly) : '—'}</td><td class="num">${r.saveAnnual ? fm(r.saveAnnual) : '—'}</td><td>${r.trend === 'up' ? `<span class="fin-neg">↑ ${fpct(r.trendPct)}</span>` : r.trend === 'down' ? `<span class="fin-pos">↓ ${fpct(r.trendPct)}</span>` : r.trend === 'stable' ? '→ stable' : '<small class="muted">needs 6 months</small>'}</td></tr>`).join('')}
    <tr class="fin-total"><td>Total</td><td></td><td></td><td class="num">${fm(sumRec)}</td><td class="num">${fm(plan.totalBudget)}</td><td class="num">${fm(plan.totalSpent)}</td><td colspan="5"></td></tr></tbody></table></div>
    <div class="row"><button class="btn primary" data-act="fin-apply-rec">Use the recommended budgets</button><button class="btn ghost" data-act="fin-clear-budgets">Clear my budgets</button><span class="spacer"></span>${left !== null ? `<span class="small">Expected income ${fm(expected)} − budgets ${fm(plan.totalBudget || sumRec)} = <b>${fmc(left)}</b> a month to save${p.saveTarget ? ` (target ${fm(+p.saveTarget)}: ${left >= +p.saveTarget ? '✓ reachable' : `<span class="fin-neg">${fm(+p.saveTarget - left)} short</span>`})` : ''}</span>` : ''}</div>
    <h3>Actual vs budget, ${fmon(finToday().slice(0, 7))}</h3>${finBars(plan.rows.filter(r => r.budget !== null || r.spent).map(r => ({ k: r.id, label: r.name, short: r.name.split(/[ &,]/)[0], a: r.budget || 0, b: r.spent })), { la: 'Budget', lb: 'Spent', act: 'fin-drill-cat', title: 'Actual vs budget' })}
  </section>
  <section class="card fin-card"><h2>Known commitments</h2><p class="small muted">Payments you know are coming every month (rent, installments) that the statements may not show yet.</p>
    ${p.commitments.map((c, i) => `<div class="row fin-commit"><input class="input" data-chg="fin-commit" data-i="${i}" data-k="name" value="${esc(c.name)}" placeholder="Name"><input class="input num sm" data-chg="fin-commit" data-i="${i}" data-k="amount" value="${esc(c.amount)}" placeholder="Amount" inputmode="decimal"><label class="small">day <input class="input num sm" data-chg="fin-commit" data-i="${i}" data-k="day" value="${esc(c.day || 1)}" type="number" min="1" max="31"></label><label class="small">until <input class="input sm" type="month" data-chg="fin-commit" data-i="${i}" data-k="endM" value="${esc((c.end || '').slice(0, 7))}"></label><button class="icon-btn" data-act="fin-commit-del" data-i="${i}" aria-label="Remove">${I.x}</button></div>`).join('')}
    <button class="btn sm" data-act="fin-commit-add">${I.plus} Commitment</button></section>`;
};
function finMonthActions(mc, plan) {
  const out = [];
  if (mc.perDay !== null && mc.daysLeft > 0) out.push(`Keep flexible spending to about <b>${fm(mc.perDay)}</b> a day for the next ${mc.daysLeft} days to stay inside your discretionary budgets.`);
  for (const o of mc.over) out.push(`<b>${esc(o.name)}</b> is ${fm(o.over)} over: stop spending in it this month, or move budget from another category.`);
  for (const o of mc.pace) out.push(`<b>${esc(o.name)}</b>: slow down — at this pace it ends the month at ${fm(o.projected)} (budget ${fm(o.budget)}).`);
  if (mc.saveTarget && mc.saved < mc.saveTarget && mc.daysLeft > 0) out.push(`To reach your savings target of ${fm(mc.saveTarget)}, ${fm(mc.saveTarget - mc.saved)} more has to stay unspent this month.`);
  if (mc.committed) out.push(`Keep ${fm(mc.committed)} aside for the payments still due.`);
  return out;
}

/* --- income growth --- */
function finSimInput() {
  const p = finP(), all = finAll(), ib = FIN.incomeBase(all, finToday()), s = p.sim, done = finDone(all, 6);
  const base = s.base !== '' && s.base !== null && s.base !== undefined && s.baseSrc === 'manual' ? +s.base : ib.salary !== null ? ib.salary : s.base !== '' ? +s.base : null;
  const expMed = finMedian(done.map(b => b.exp)), netMed = finMedian(done.map(b => b.net));
  return { ...s, base, baseFrom: s.baseSrc === 'manual' && s.base !== '' ? 'entered by you' : ib.salary !== null ? (ib.verified ? 'your verified salary' : 'your salary (not verified)') : s.base !== '' ? 'entered by you' : '', expenses: s.expenses !== '' ? +s.expenses : expMed || 0, expFrom: s.expenses !== '' ? 'entered by you' : `median of the last ${done.length} complete months`,
    baseSave: s.baseSave !== undefined && s.baseSave !== '' ? +s.baseSave : Math.max(0, netMed || 0), horizon: +s.horizon || 12, scenarios: s.scenarios || undefined };
}
function finSimRun() { const si = finSimInput(); if (si.base === null || !(si.changes || []).length) return null; return FIN.simulate(si, { today: finToday() }); }
FIN_VIEW.sim = () => {
  const p = finP(), s = p.sim, si = finSimInput(), today = finToday();
  const sc = { ...FIN.SCEN, ...(s.scenarios || {}) };
  const res = si.base !== null ? FIN.simulate(si, { today }) : null, sens = res && (s.changes || []).length ? FIN.sensitivity(si, { today }) : null;
  const hist = finDone(finAll(), 12).map(b => ({ k: b.m, v: b.inc, label: fmon(b.m) }));
  const SC = [['conservative', 'Conservative'], ['expected', 'Expected'], ['optimistic', 'Optimistic']];
  const ch = (s.changes || []);
  const inp = (k, ph, o = {}) => `<input class="input num ${o.sm ? 'sm' : ''}" data-chg="fin-sim" data-k="${k}" value="${esc(s[k] ?? '')}" placeholder="${esc(ph ?? '')}" inputmode="decimal">`;
  return `<div class="fin-banner">🔭 Everything on this page is a projection from what you enter — not a promise. No increase is assumed unless you add it.</div>
  <section class="card fin-card"><h2>Your starting point</h2><div class="fin-form-g">
    <label class="field"><span class="label">Current monthly net income</span>${inp('base', si.base ?? '')}<small class="muted">${si.base !== null ? `using ${fm(si.base)} — ${esc(si.baseFrom)}` : 'no salary found in the statements: enter it'}</small>${s.baseSrc === 'manual' ? '<button class="btn sm ghost" data-act="fin-sim-auto">Use the statements</button>' : ''}</label>
    <label class="field"><span class="label">Monthly expenses now</span>${inp('expenses', si.expenses)}<small class="muted">${esc(si.expFrom)}</small></label>
    <label class="field"><span class="label">Saved each month now</span>${inp('baseSave', si.baseSave)}<small class="muted">${s.baseSave !== undefined && s.baseSave !== '' ? 'entered by you' : 'median monthly net of recent months'}</small></label>
    <label class="field"><span class="label">Extra monthly costs that come with the raise</span>${inp('extraExpenses', '0')}</label>
    <label class="field"><span class="label">Inflation (% a year, optional)</span>${inp('inflation', '')}</label>
    <label class="field"><span class="label">Share of extra income saved (%)</span>${inp('saveShare', '50')}</label>
    <label class="field"><span class="label">Savings you have now</span>${inp('saved', '0')}</label>
    <label class="field"><span class="label">Savings target</span>${inp('target', '')}</label>
    <label class="field"><span class="label">Look ahead</span><select class="input" data-chg="fin-sim" data-k="horizon">${[3, 6, 12, 24, 36].map(h => `<option value="${h}" ${+s.horizon === h ? 'selected' : ''}>${h} months</option>`).join('')}</select></label>
  </div></section>
  <section class="card fin-card"><h2>Expected income changes</h2>
    ${ch.length ? `<div class="tbl-wrap"><table class="tbl fin-sim-t"><thead><tr><th>What</th><th>Type</th><th>% or amount</th><th class="num">Value</th><th>From</th><th>Repeats</th><th class="num">Deductions %</th><th>How sure</th><th></th></tr></thead><tbody>${ch.map((c, i) => `<tr>
      <td><input class="input sm" data-chg="fin-ch" data-i="${i}" data-k="label" value="${esc(c.label || '')}" placeholder="e.g. Annual raise"></td>
      <td><select class="input sm" data-chg="fin-ch" data-i="${i}" data-k="kind">${[['raise', 'Salary raise'], ['promotion', 'Promotion'], ['bonus', 'Bonus / incentive'], ['side', 'Extra work / freelance'], ['other', 'Other income']].map(([k, l]) => `<option value="${k}" ${c.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><select class="input sm" data-chg="fin-ch" data-i="${i}" data-k="mode"><option value="pct" ${c.mode === 'pct' ? 'selected' : ''}>% of pay</option><option value="amt" ${c.mode !== 'pct' ? 'selected' : ''}>amount</option></select></td>
      <td><input class="input num sm" data-chg="fin-ch" data-i="${i}" data-k="value" value="${esc(c.value ?? '')}" inputmode="decimal"></td>
      <td><input class="input sm" type="date" data-chg="fin-ch" data-i="${i}" data-k="date" value="${esc(c.date || '')}"></td>
      <td><select class="input sm" data-chg="fin-ch" data-i="${i}" data-k="freq"><option value="monthly" ${c.recurring && (c.freq || 'monthly') === 'monthly' ? 'selected' : ''}>every month</option><option value="quarterly" ${c.recurring && c.freq === 'quarterly' ? 'selected' : ''}>every quarter</option><option value="yearly" ${c.recurring && c.freq === 'yearly' ? 'selected' : ''}>every year</option><option value="once" ${!c.recurring ? 'selected' : ''}>once</option></select></td>
      <td><input class="input num sm" data-chg="fin-ch" data-i="${i}" data-k="deduct" value="${esc(c.deduct ?? '')}" placeholder="0" inputmode="decimal"></td>
      <td><select class="input sm" data-chg="fin-ch" data-i="${i}" data-k="status">${[['confirmed', 'Confirmed'], ['probable', 'Probable'], ['speculative', 'Speculative']].map(([k, l]) => `<option value="${k}" ${(c.status || 'confirmed') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><button class="icon-btn" data-act="fin-ch-del" data-i="${i}" aria-label="Remove">${I.x}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">None yet.</p>'}
    <button class="btn sm" data-act="fin-ch-add">${I.plus} Income change</button>
    <details class="fin-scen"><summary class="small">Scenario assumptions</summary><table class="tbl"><thead><tr><th>Scenario</th><th>Confirmed counts</th><th>Probable counts</th><th>Speculative counts</th><th>Unconfirmed changes start later by</th></tr></thead><tbody>${SC.map(([k, l]) => `<tr><td>${l}</td>${['confirmed', 'probable', 'speculative'].map(st => `<td><input class="input num sm" data-chg="fin-scen" data-s="${k}" data-k="${st}" value="${sc[k][st]}" inputmode="decimal">%</td>`).join('')}<td><input class="input num sm" data-chg="fin-scen" data-s="${k}" data-k="delay" value="${sc[k].delay}" type="number" min="0"> months</td></tr>`).join('')}</tbody></table></details>
  </section>
  ${!res ? '<p class="muted">Enter your current monthly income to see projections.</p>' : `
  <section class="card fin-card"><h2>Results over ${si.horizon} months ${finEst}</h2>
    <div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr><th></th>${SC.map(([, l]) => `<th class="num">${l}</th>`).join('')}</tr></thead><tbody>
    ${[['Current monthly net income', x => fm(x.current)], ['Projected monthly income (end)', x => fm(x.projected)], ['Monthly increase', x => fm(x.monthlyIncrease)], ['Annualised increase', x => fm(x.annualIncrease)], ['Extra disposable income / month', x => fmc(x.addDisposable)], ['Cumulative extra income', x => fm(x.cumIncr)], ['Extra savings from it', x => fm(x.addSavings)], ['Total savings at the end', x => fm(x.cumAll)], ['Savings target progress', x => x.progress === null ? '—' : fpct(x.progress)], ['Target reached', x => s.target ? (x.targetMonth ? fmon(x.targetMonth) : 'not within ' + si.horizon + ' months') : '—']].map(([l, f]) => `<tr><td>${l}</td>${SC.map(([k]) => `<td class="num">${f(res.scenarios[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="small muted">Projected income = current + recurring increases in effect (a change dated mid-month counts for the days left in that month); one-off amounts are added only in their month; deductions are taken off the increase; percentage raises apply to the pay just before them. Savings at the end = savings now + what you save now each month (${fm(si.baseSave)}) + ${si.saveShare}% of the extra income left after extra costs. Investment returns are not included.</p>
    <h3>Income: actual and projected</h3>${finLines([{ name: 'Actual income', pts: hist }, ...SC.map(([k, l], i) => ({ name: l, cls: ['s2', 's1', 's3'][i], pts: [...(hist.length ? [hist[hist.length - 1]] : []), ...res.scenarios[k].rows.map(r => ({ k: r.m, v: r.income, est: true, label: fmon(r.m) }))] }))], { title: 'Income actual and projected', label: k => fmtDate(k + '-15', { month: 'short', year: '2-digit' }) })}
    <h3>Changes on the timeline</h3><ul class="fin-list">${res.scenarios.expected.changes.map(c => `<li><b>${fday(c.date)}</b> — ${esc(c.label || c.kind)}: ${c.mode === 'pct' ? c.value + '%' : fm(+c.value)}${c.recurring ? ` ${c.freq || 'monthly'}` : ' once'}${c.deduct ? `, ${c.deduct}% deducted` : ''} · <i>${esc(c.status || 'confirmed')}</i></li>`).join('') || '<li class="muted">None in the expected scenario.</li>'}</ul>
    <h3>Cumulative savings ${finEst}</h3>${finLines(SC.map(([k, l], i) => ({ name: l, cls: ['s2', 's1', 's3'][i], pts: res.scenarios[k].rows.map(r => ({ k: r.m, v: r.cumAll, est: true, label: fmon(r.m) })) })).concat([{ name: 'Without any increase', cls: 'muted', pts: res.none.rows.map(r => ({ k: r.m, v: r.cumAll, est: true, label: fmon(r.m) })) }]), { title: 'Cumulative savings', label: k => fmtDate(k + '-15', { month: 'short', year: '2-digit' }) })}
    <h3>With and without each increase (expected)</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Left out</th><th class="num">Extra income over ${si.horizon} months</th><th class="num">Savings at the end</th><th class="num">Difference</th></tr></thead><tbody>
      <tr><td>Nothing (all changes)</td><td class="num">${fm(res.scenarios.expected.cumIncr)}</td><td class="num">${fm(res.scenarios.expected.cumAll)}</td><td></td></tr>
      ${ch.map(c => res.without[c.id] ? `<tr><td>${esc(c.label || c.kind)}</td><td class="num">${fm(res.without[c.id].cumIncr)}</td><td class="num">${fm(res.without[c.id].cumAll)}</td><td class="num fin-neg">${fm(res.without[c.id].cumAll - res.scenarios.expected.cumAll)}</td></tr>` : '').join('')}
      <tr><td>All of them</td><td class="num">${fm(res.none.cumIncr)}</td><td class="num">${fm(res.none.cumAll)}</td><td class="num fin-neg">${fm(res.none.cumAll - res.scenarios.expected.cumAll)}</td></tr></tbody></table></div>
    ${sens ? `<h3>Sensitivity (expected scenario, ${esc(sens.change || 'first change')})</h3><div class="fin-grid3">
      <table class="tbl"><thead><tr><th>Raise</th><th class="num">Extra savings</th></tr></thead><tbody>${sens.raise.map(x => `<tr><td>${x.value}${ch.find(c => c.label === sens.change || c.kind === sens.change) && (ch.find(c => c.label === sens.change || c.kind === sens.change).mode === 'pct') ? '%' : ''}</td><td class="num">${fm(x.addSavings)}</td></tr>`).join('')}</tbody></table>
      <table class="tbl"><thead><tr><th>Starts later by</th><th class="num">Extra income</th></tr></thead><tbody>${sens.delay.map(x => `<tr><td>${x.months} month${x.months === 1 ? '' : 's'}</td><td class="num">${fm(x.cumIncr)}</td></tr>`).join('')}</tbody></table>
      <table class="tbl"><thead><tr><th>Share saved</th><th class="num">Extra savings</th><th>Target</th></tr></thead><tbody>${sens.save.map(x => `<tr><td>${x.share}%</td><td class="num">${fm(x.addSavings)}</td><td class="small">${x.targetMonth ? fmon(x.targetMonth) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>
  ${finLifeHTML(res, si)}`}`;
};
// what the increase changes in practice; the shares are examples you set, they must total 100%
function finLifeHTML(res, si) {
  const p = finP(), all = finAll(), done = finDone(all, 6);
  const essential = finMedian(done.map(b => Object.entries(b.byCat).filter(([k]) => (finCat(k) || {}).prio === 'essential').reduce((s, [, v]) => s + v, 0))) || 0;
  const efTarget = FIN.r2(essential * (+p.emergencyMonths || 3));
  const tot = p.alloc.reduce((s, b) => s + (+b.pct || 0), 0);
  const SC = [['conservative', 'Conservative'], ['expected', 'Expected'], ['optimistic', 'Optimistic']];
  const extra = k => Math.max(0, res.scenarios[k].addDisposable);
  const inst = +UI.fin.inst || 0;
  const goals = p.goals;
  const ok = Math.abs(tot - 100) < 0.001;
  return `<section class="card fin-card"><h2>How the increase changes your finances ${finEst}</h2>
    <p class="small muted">Split the extra money as you like — these shares are only examples. Spending limits are not raised by themselves: you approve any change below.</p>
    <div class="fin-alloc">${p.alloc.map((b, i) => `<div class="row"><input class="input" data-chg="fin-alloc" data-i="${i}" data-k="name" value="${esc(b.name)}"><input class="input num sm" data-chg="fin-alloc" data-i="${i}" data-k="pct" value="${esc(b.pct)}" inputmode="decimal">%<button class="icon-btn" data-act="fin-alloc-del" data-i="${i}" aria-label="Remove">${I.x}</button></div>`).join('')}
      <div class="row"><button class="btn sm" data-act="fin-alloc-add">${I.plus} Share</button><b class="${ok ? 'fin-pos' : 'fin-neg'}">Total ${fpct(tot)}${ok ? ' ✓' : ' — must be 100%'}</b></div></div>
    ${!ok ? '<p class="fin-neg">Results are hidden until the shares add up to exactly 100%.</p>' : `
    <div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr><th></th>${SC.map(([, l]) => `<th class="num">${l} / month</th><th class="num">/ year</th>`).join('')}</tr></thead><tbody>
      <tr><td>Extra income received (after deductions)</td>${SC.map(([k]) => `<td class="num">${fm(res.scenarios[k].monthlyIncrease)}</td><td class="num">${fm(res.scenarios[k].annualIncrease)}</td>`).join('')}</tr>
      <tr><td>…left after the extra costs</td>${SC.map(([k]) => `<td class="num">${fm(extra(k))}</td><td class="num">${fm(extra(k) * 12)}</td>`).join('')}</tr>
      ${p.alloc.map(b => `<tr><td>→ ${esc(b.name)} (${fpct(+b.pct)})</td>${SC.map(([k]) => { const v = extra(k) * (+b.pct || 0) / 100; return `<td class="num">${fm(v)}</td><td class="num">${fm(v * 12)}</td>`; }).join('')}</tr>`).join('')}
      ${si.inflation ? `<tr><td>Spending power of today’s income in ${si.horizon} months (inflation ${si.inflation}%)</td>${SC.map(() => `<td class="num" colspan="2">${fm(si.base / Math.pow(1 + si.inflation / 100, si.horizon / 12))}</td>`).join('')}</tr>` : ''}
      <tr><td>Monthly safety margin (income − expenses) at the end</td>${SC.map(([k]) => { const r = res.scenarios[k].rows[res.scenarios[k].rows.length - 1]; return `<td class="num" colspan="2">${fmc(r.disposable)} <small class="muted">(now ${fmc(si.base - si.expenses)})</small></td>`; }).join('')}</tr>
    </tbody></table></div>
    <div class="fin-grid2"><div><h3>Emergency fund</h3><p class="small">Target: <label><input class="input num sm" data-chg="fin-pref" data-k="emergencyMonths" value="${esc(p.emergencyMonths)}" type="number" min="1" max="24"> months</label> of essential costs (${fm(essential)} a month, your median) = <b>${fm(efTarget)}</b>.</p>
      ${(() => { const savedNow = +si.saved || 0, now = FIN.monthsTo(efTarget, savedNow, si.baseSave), share = (p.alloc.find(b => /emergen|saving/i.test(b.name)) || p.alloc[0]); return `<ul class="fin-list"><li>Saving ${fm(si.baseSave)} a month as now: ${now === null ? 'never reached' : now === 0 ? 'already reached' : `${now} months`}</li>${SC.map(([k, l]) => { const m = FIN.monthsTo(efTarget, savedNow, si.baseSave + extra(k) * (+share.pct || 0) / 100); return `<li>${l}, adding the “${esc(share.name)}” share: ${m === null ? 'never reached' : m === 0 ? 'already reached' : `${m} months`}${now && m !== null ? ` (${now - m} months sooner)` : ''}</li>`; }).join('')}</ul>`; })()}</div>
    <div><h3>Can I afford a new installment?</h3><label class="small">Monthly installment <input class="input num sm" data-chg="fin-ui" data-k="inst" value="${esc(UI.fin.inst || '')}" inputmode="decimal"></label>
      ${inst ? `<ul class="fin-list">${SC.map(([k, l]) => { const r = res.scenarios[k].rows[res.scenarios[k].rows.length - 1], margin = r.disposable - inst; return `<li>${l}: margin after it ${fmc(margin)} a month — ${margin < 0 ? '<b class="fin-neg">not affordable</b>' : margin < si.expenses * 0.1 ? '<b class="fin-neg">very tight</b> (under 10% of your monthly costs left)' : 'affordable'}</li>`; }).join('')}</ul>` : ''}</div></div>
    ${goals.length ? `<h3>Goals</h3><ul class="fin-list">${goals.map(g => { const base = FIN.goalPlan([g], Math.max(0, si.baseSave), finToday())[0], withX = FIN.goalPlan([g], Math.max(0, si.baseSave + extra('expected') * (+((p.alloc.find(b => /goal/i.test(b.name)) || {}).pct) || 0) / 100), finToday())[0]; return `<li><b>${esc(g.name)}</b>: ${base.eta ? fmon(base.eta) : 'not reached'} → with the goals share of the raise ${withX.eta ? fmon(withX.eta) : 'not reached'}${base.months && withX.months !== null ? ` (${base.months - withX.months} months sooner)` : ''}</li>`; }).join('')}</ul>` : ''}
    ${(() => { const life = p.alloc.find(b => /life|spend|style/i.test(b.name)); if (!life) return ''; const v = FIN.r2(extra('expected') * (+life.pct || 0) / 100); return v > 0 ? `<p>Sustainable lifestyle increase (expected): <b>${fm(v)}</b> a month. <button class="btn sm" data-act="fin-lifestyle" data-v="${v}">Propose a higher discretionary budget…</button></p>` : ''; })()}`}
  </section>`;
}

/* --- forecast, goals, recommendations --- */
function finGoals() {
  const p = finP(); if (!p.goals.length) return [];
  const sx = finSimRun(), si = finSimInput(), surplus = si.baseSave || 0;
  const alt = sx ? { conservative: surplus + Math.max(0, sx.scenarios.conservative.addDisposable) * (+si.saveShare || 0) / 100, optimistic: surplus + Math.max(0, sx.scenarios.optimistic.addDisposable) * (+si.saveShare || 0) / 100 } : {};
  return FIN.goalPlan(p.goals, surplus, finToday(), alt);
}
function finRentEGP(rows) { const p = finP(), props = p.holdings.filter(h => h.kind === 'property'), cur = (props[0] || {}).rentCurrency || 'USD', rate = cur === p.base ? 1 : +p.rates[cur]; return { cur, rate: rate > 0 ? rate : null, rows }; }
FIN_VIEW.forecast = () => {
  const p = finP(), all = finAll(), today = finToday(), si = finSimInput(), H = +UI.fin.fcH || 12, sx = finSimRun();
  // the income projection runs as long as the forecast
  const sxF = si.base !== null && (si.changes || []).length ? FIN.simulate({ ...si, horizon: Math.max(si.horizon, H + 1) }, { today }) : null;
  const pos = finPosition(), spendBal = pos.assets.filter(a => a.kind === 'bank'), allVerified = p.accounts.filter(a => !['credit_card', 'loan', 'investment'].includes(a.kind)).every(a => spendBal.find(x => x.id === a.id && x.verified && (x.currency || p.base) === p.base));
  const bal = allVerified && spendBal.length ? spendBal.reduce((s, a) => s + a.amount, 0) - pos.insideMine.reduce((s, x) => s - x.amount, 0) : null;
  const props = p.holdings.filter(h => h.kind === 'property' && (!h.owner || h.owner === 'me'));
  const rentRows = FIN.rentForecast(props, { today, horizon: H, scenario: {} }), rent = finRentEGP(rentRows);
  const incomeRows = Array.from({ length: H }, (_, i) => { const sr = sxF && sxF.scenarios.expected.rows; const m = FIN.addMonths(today.slice(0, 7), i + 1); const s = sr && sr.find(r => r.m === m); const r = rentRows[i]; return { income: si.base === null ? null : FIN.r2((s ? s.income : si.base) + (rent.rate ? r.net * rent.rate : 0)) }; });
  const fc = FIN.forecast(all, { cats: finCats(), today, horizon: H, income: si.base, incomeRows: si.base === null ? null : incomeRows, balance: bal, inflation: si.inflation });
  const goals = finGoals();
  const histCum = []; let c = 0; for (const b of finDone(all, 12)) { c += b.net; histCum.push({ k: b.m, v: FIN.r2(c), label: fmon(b.m) }); }
  const fcCum = fc.rows.filter(r => r.cum !== null).map(r => ({ k: r.m, v: FIN.r2(c + r.cum), est: true, label: fmon(r.m) }));
  return `<div class="fin-banner">🔭 Forecasts are estimates. Actual figures are in the other sections; here every number is projected from the assumptions listed.</div>
  <section class="card fin-card"><div class="row"><h2>Next months</h2><span class="spacer"></span><div class="seg">${[3, 6, 12, 24, 36].map(h => `<button data-act="fin-fch" data-h="${h}" aria-pressed="${H === h}">${h} months</button>`).join('')}</div></div>
    ${si.base === null ? '<p class="fin-neg">No recurring income known — enter your monthly income in Income growth to forecast.</p>' : ''}
    <div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr><th>Month</th><th class="num">Expected income</th><th class="num">Expected expenses</th><th class="num">Disposable</th><th class="num">Cumulative savings</th><th class="num">Month-end cash ${bal === null ? '' : ''}</th></tr></thead><tbody>
    ${fc.rows.map(r => `<tr class="${r.shortfall ? 'fin-short' : ''}"><td>${fmon(r.m)} <span class="fin-est">forecast</span></td><td class="num">${fm(r.income)}</td><td class="num">${fm(r.expenses)}</td><td class="num">${r.net === null ? '—' : fmc(r.net)}${r.shortfall ? ' ⚠️' : ''}</td><td class="num">${r.cum === null ? '—' : fmc(r.cum)}</td><td class="num">${r.balance === null ? '—' : fmc(r.balance)}</td></tr>`).join('')}</tbody></table></div>
    <p class="small">Expected annual spending: <b>${fm(fc.annualSpend)}</b>${fc.rows.some(r => r.shortfall) ? ` · <b class="fin-neg">shortfall in ${fc.rows.filter(r => r.shortfall).map(r => fmon(r.m)).join(', ')}</b>` : ''}</p>
    <details class="small"><summary>Assumptions</summary><ul>
      <li>Income: ${si.base === null ? 'unknown' : `${fm(si.base)} a month (${esc(si.baseFrom)})`}${sx ? ' plus the expected-scenario changes from Income growth' : ''}${props.length ? (rent.rate ? `, plus net rent from the offices converted at ${rent.rate} ${esc(p.base)} per ${rent.cur}` : `; office rent (in ${rent.cur}) is NOT added — no ${rent.cur} rate given`) : ''}.</li>
      <li>Expenses: ${esc(fc.basis)}${si.inflation ? `, growing with ${si.inflation}% inflation a year` : ''}. By category: ${Object.entries(fc.byCat).map(([k, v]) => `${esc((finCat(k) || {}).name || k)} ${fm(v)}`).join(', ') || '—'}.</li>
      <li>Month-end cash: ${bal === null ? 'not shown — it needs a statement-confirmed balance for every everyday account in ' + esc(p.base) : `from today’s confirmed balances ${fm(bal)} (others’ money taken out)`}.</li></ul></details>
    <h3>Savings: actual and forecast</h3>${finLines([{ name: 'Cumulative savings', pts: [...histCum, ...fcCum] }], { title: 'Savings actual and forecast', label: k => fmtDate(k + '-15', { month: 'short', year: '2-digit' }) })}
  </section>
  ${props.length ? finHandoverHTML(props, si) : ''}
  <section class="card fin-card"><h2>Goals</h2>
    ${goals.length ? `<div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr><th>Goal</th><th class="num">Target</th><th class="num">Saved</th><th>By</th><th class="num">Monthly put in</th><th>Reached ${finEst}</th><th class="num">Needed / month</th><th>Status</th><th></th></tr></thead><tbody>${goals.map((g, i) => `<tr>
      <td><input class="input sm" data-chg="fin-goal" data-i="${i}" data-k="name" value="${esc(g.name)}"><small class="muted">${esc({ emergency: 'emergency fund', save: 'save an amount', purchase: 'a purchase', debt: 'repay debt', invest: 'investing' }[g.kind] || '')}</small></td>
      <td class="num"><input class="input num sm" data-chg="fin-goal" data-i="${i}" data-k="target" value="${esc(g.target)}" inputmode="decimal"></td><td class="num"><input class="input num sm" data-chg="fin-goal" data-i="${i}" data-k="saved" value="${esc(p.goals[i].saved ?? '')}" inputmode="decimal"></td>
      <td><input class="input sm" type="date" data-chg="fin-goal" data-i="${i}" data-k="date" value="${esc(g.date || '')}"></td><td class="num"><input class="input num sm" data-chg="fin-goal" data-i="${i}" data-k="monthly" value="${esc(p.goals[i].monthly ?? '')}" placeholder="${FIN.r2(g.monthly)}" inputmode="decimal"></td>
      <td>${g.eta ? fmon(g.eta) : 'not at this rate'}${Object.keys(g.alts).length ? `<small class="muted"><br>conservative ${g.alts.conservative ? fmon(g.alts.conservative) : '—'} · optimistic ${g.alts.optimistic ? fmon(g.alts.optimistic) : '—'}</small>` : ''}</td>
      <td class="num">${g.required === null ? '—' : fm(g.required)}</td><td>${g.ok ? '<span class="fin-pos">✓ on track</span>' : g.date ? `<span class="fin-neg">${fm(g.extra)} more a month needed</span>` : ''} <span class="fin-prog"><i style="width:${g.progress || 0}%"></i></span></td><td><button class="icon-btn" data-act="fin-goal-del" data-i="${i}" aria-label="Remove">${I.x}</button></td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Goals without their own monthly amount share what you save now (${fm(si.baseSave)} a month) equally.</p>` : '<p class="small muted">No goals yet.</p>'}
    <div class="row">${[['emergency', 'Emergency fund'], ['save', 'Save an amount'], ['purchase', 'A purchase'], ['debt', 'Repay debt'], ['invest', 'Investing']].map(([k, l]) => `<button class="btn sm" data-act="fin-goal-add" data-k="${k}">${I.plus} ${l}</button>`).join('')}</div>
  </section>
  <section class="card fin-card"><h2>Recommendations</h2>${finRecsHTML(20)}</section>`;
};
function finHandoverHTML(props, si) {
  const p = finP(), today = finToday(), rp = p.rent || {}, sc0 = rp.scenario || {}, H = +rp.horizon || 24;
  const rate = (() => { const cur = props[0].rentCurrency || 'USD'; return cur === p.base ? 1 : +p.rates[cur] > 0 ? +p.rates[cur] : null; })(), cur = props[0].rentCurrency || 'USD';
  const S = [['As entered', {}], ['Handover 6 months late', { delay: 6 }], ['Rent 20% lower', { rentCut: 20 }], ['30% vacancy', { vacancy: 30 }], ['Costs 50% higher', { costUp: 50 }], ['Your scenario', sc0]];
  const runs = S.map(([l, sc]) => ({ l, rows: FIN.rentForecast(props, { today, horizon: H, scenario: sc }) }));
  const first = r => (r.find(x => x.gross > 0) || {}).m;
  const share = props.map(h => ({ h, s: FIN.propertyShare(h) }));
  return `<section class="card fin-card"><h2>Before and after the office handover ${finEst}</h2>
    <p class="small muted">Rent is a forecast and never counted as income until it arrives in a statement. Property values are not shown.</p>
    <div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr><th>Scenario</th><th>Rent starts</th><th class="num">Gross / month</th><th class="num">Net / month</th><th class="num">Net over ${H} months</th>${rate ? `<th class="num">Net / month in ${esc(p.base)}</th><th class="num">Disposable after (expected)</th>` : ''}</tr></thead><tbody>
    ${runs.map(r => { const last = r.rows[r.rows.length - 1], tot = r.rows.reduce((s, x) => s + x.net, 0); return `<tr><td>${esc(r.l)}</td><td>${first(r.rows) ? fmon(first(r.rows)) : 'not within ' + H + ' months'}</td><td class="num">${fm(last.gross, cur)}</td><td class="num">${fm(last.net, cur)}</td><td class="num">${fm(tot, cur)}</td>${rate ? `<td class="num">${fm(last.net * rate)}</td><td class="num">${si.base !== null ? fmc(si.base - si.expenses + last.net * rate) : '—'}</td>` : ''}</tr>`; }).join('')}</tbody></table></div>
    ${!rate ? `<p class="small">To compare with your ${esc(p.base)} income, add a ${esc(cur)} rate in Settings. Until then rent is kept in ${esc(cur)}.</p>` : `<p class="small">Disposable now (before handover): <b>${si.base !== null ? fmc(si.base - si.expenses) : '—'}</b> a month.</p>`}
    <div class="fin-form-g"><label class="field"><span class="label">Your scenario: handover later by (months)</span><input class="input num sm" data-chg="fin-rent" data-k="delay" value="${esc(sc0.delay || 0)}" type="number" min="0"></label><label class="field"><span class="label">Rent lower by %</span><input class="input num sm" data-chg="fin-rent" data-k="rentCut" value="${esc(sc0.rentCut || 0)}" inputmode="decimal"></label><label class="field"><span class="label">Extra vacancy %</span><input class="input num sm" data-chg="fin-rent" data-k="vacancy" value="${esc(sc0.vacancy || 0)}" inputmode="decimal"></label><label class="field"><span class="label">Costs higher by %</span><input class="input num sm" data-chg="fin-rent" data-k="costUp" value="${esc(sc0.costUp || 0)}" inputmode="decimal"></label></div>
    <p class="small muted">From the office records: ${share.map(x => `${esc(x.h.name)} — ${x.s.myArea} m² (${x.s.effPct}%) × ${x.h.rentRate} ${esc(cur)}/m² = ${fm(x.s.grossMonthly, cur)} gross, ${fm(x.s.netMonthly, cur)} net a month`).join('; ')}. Edit them under Ownership.</p></section>`;
}
// each recommendation: the data, the calculation, the action, the monthly and yearly effect, the assumptions
function finRecs() {
  const p = finP(), all = finAll(), today = finToday(), out = [];
  if (all.empty) return out;
  const plan = FIN.budgetPlan(all, { cats: finCats(), today, strategy: 'balanced', budgets: p.budgets }), done = finDone(all, 6);
  const cut = plan.rows.filter(r => ['discretionary', 'optional'].includes(r.prio) && r.saveMonthly > 0).sort((a, b) => b.saveMonthly - a.saveMonthly).slice(0, 3);
  if (cut.length) out.push({ t: 'Reduce these first', data: cut.map(r => `${r.name}: average ${fm(r.avg)} over ${r.months} months; your cheaper months cost ${fm(r.p25)} or less`).join('; '), calc: 'average − your own 25th-percentile month', act: cut.map(r => `set ${r.name} to ${fm(r.recommended)}`).join(', '), m: cut.reduce((s, r) => s + r.saveMonthly, 0), a: cut.reduce((s, r) => s + r.saveAnnual, 0), as: 'you can repeat the spending of your cheaper months' });
  const nets = done.map(b => b.net);
  if (nets.length >= 2) { const md = FIN.median(nets); out.push({ t: 'How much you can realistically save each month', data: `net cash flow of the last ${nets.length} complete months: ${nets.map(v => fm(v)).join(', ')}`, calc: 'median of those months', act: md > 0 ? `set a monthly savings target of ${fm(md)} (Budget & control)` : 'spending is above income in a typical month: start with the reductions above', m: Math.max(0, md), a: Math.max(0, md) * 12, as: 'income and spending stay like recent months' }); }
  const si = finSimInput();
  if (si.base !== null) { const ess = plan.rows.filter(r => ['essential', 'important'].includes(r.prio)).reduce((s, r) => s + (r.median || 0), 0), tgt = +p.saveTarget || 0, lim = FIN.r2(si.base - ess - tgt); out.push({ t: 'Your affordable discretionary limit', data: `income ${fm(si.base)} (${si.baseFrom}); essential and important costs ${fm(ess)} a month (medians)${tgt ? `; savings target ${fm(tgt)}` : ''}`, calc: 'income − essential and important costs − savings target', act: lim > 0 ? `keep discretionary and optional spending under ${fm(lim)} a month` : 'essentials and your target already use all the income: lower the target or the important costs', m: null, a: null, as: 'medians of the last complete months' });
    out.push({ t: 'Reserve for essentials and installments', data: `essential costs (median) ${fm(plan.rows.filter(r => r.prio === 'essential').reduce((s, r) => s + (r.median || 0), 0))}, including installments`, calc: 'sum of the essential categories’ medians', act: `keep ${fm(plan.rows.filter(r => r.prio === 'essential').reduce((s, r) => s + (r.median || 0), 0))} available at the start of each month before other spending`, m: null, a: null, as: 'essential categories as marked in Budget' }); }
  const subs = FIN.recurring(all.entries || []).filter(r => r.dir < 0 && ['optional', 'discretionary'].includes((finCat(r.cat) || {}).prio));
  if (subs.length) out.push({ t: 'Repeating payments you could cut', data: subs.map(r => `${r.name} ${fm(r.amount)} ${r.freq}`).join('; '), calc: 'their monthly equivalents added', act: 'cancel the ones you no longer use', m: subs.reduce((s, r) => s + r.perMonth, 0), a: subs.reduce((s, r) => s + r.annual, 0), as: 'up to this much, if all of them are cancelled' });
  const sx = finSimRun();
  if (sx && sx.scenarios.expected.monthlyIncrease > 0) { const ex = Math.max(0, sx.scenarios.expected.addDisposable); out.push({ t: 'How to use your salary increase', data: `expected increase ${fm(sx.scenarios.expected.monthlyIncrease)} a month; ${fm(ex)} left after extra costs`, calc: 'the increase × your shares (Income growth)', act: p.alloc.map(b => `${fm(ex * (+b.pct || 0) / 100)} to ${b.name}`).join(', '), m: ex, a: ex * 12, as: 'the expected scenario' });
    const lost = sx.scenarios.expected.cumAll - sx.none.cumAll; out.push({ t: 'If the increase is late or does not happen', data: `expected savings in ${si.horizon} months ${fm(sx.scenarios.expected.cumAll)}; conservative ${fm(sx.scenarios.conservative.cumAll)}; with no increase ${fm(sx.none.cumAll)}`, calc: 'the same plan run with the changes left out', act: `plan spending on today’s income: without the increase you have ${fm(lost)} less saved after ${si.horizon} months`, m: -lost / si.horizon, a: -lost / si.horizon * 12, as: 'everything else as entered' }); }
  const mc = FIN.monthControl(all, plan, { today, commitments: p.commitments, saveTarget: p.saveTarget });
  const acts = finMonthActions(mc, plan); if (acts.length) out.push({ t: 'For the rest of this month', data: `${fm(mc.exp)} spent in ${fmon(mc.month)} so far; ${mc.daysLeft} days left`, calc: 'remaining budgets ÷ days left; spending pace × days in month', act: acts.join(' '), m: null, a: null, as: 'budgets as set' });
  for (const g of finGoals().filter(g => !g.ok && g.date)) out.push({ t: `Reach “${g.name}” by ${fday(g.date)}`, data: `${fm(g.need)} still to save, ${g.monthsLeft} months left, ${fm(g.monthly)} a month planned`, calc: 'amount still needed ÷ months left', act: `put in ${fm(g.required)} a month (${fm(g.extra)} more), or move the date to ${g.eta ? fmon(g.eta) : 'later'}`, m: -g.extra, a: -g.extra * 12, as: 'no investment returns' });
  const flex = plan.rows.filter(r => ['discretionary', 'optional'].includes(r.prio) && r.avg);
  if (flex.length) { const base = flex.reduce((s, r) => s + r.avg, 0); out.push({ t: 'Cutting discretionary spending by 5%, 10% or 15%', data: `${flex.map(r => r.name).join(', ')}: ${fm(base)} a month on average`, calc: 'average × 5% / 10% / 15%', act: [5, 10, 15].map(x => `${x}% → ${fm(base * x / 100)} a month (${fm(base * x / 100 * 12)} a year)`).join(' · '), m: base * 0.1, a: base * 1.2, as: 'the 10% case shown in the totals' }); }
  return out;
}
function finRecsHTML(n) {
  const r = finRecs().slice(0, n); if (!r.length) return '<p class="muted small">Import a few months of statements to get recommendations.</p>';
  return `<div class="fin-recs">${r.map(x => `<details class="fin-rec"><summary><b>${esc(x.t)}</b>${x.m !== null && x.m !== undefined ? ` <span class="num ${x.m < 0 ? 'fin-neg' : 'fin-pos'}">${fm(x.m, null, { plus: true })} / month</span>` : ''}</summary>
    <dl class="fin-dl"><dt>Data</dt><dd>${esc(x.data)}</dd><dt>Calculation</dt><dd>${esc(x.calc)}</dd><dt>Action</dt><dd>${x.act}</dd><dt>Effect</dt><dd>${x.m === null || x.m === undefined ? '—' : `${fm(x.m)} a month · ${fm(x.a)} a year`}</dd><dt>Assumes</dt><dd>${esc(x.as)}</dd></dl></details>`).join('')}</div>`;
}

Object.assign(ACT, {
  'fin-gran': el => { UI.fin.gran = el.dataset.g; render(); },
  'fin-drill-ids': el => finDrill({ kind: 'ids', ids: el.dataset.ids.split(','), title: el.dataset.t }),
  'fin-month': el => { const d = +el.dataset.d; UI.fin.month = d === 0 ? '' : FIN.addMonths(UI.fin.month || finToday().slice(0, 7), d); if (UI.fin.month > finToday().slice(0, 7)) UI.fin.month = ''; render(); },
  'fin-strategy': el => { finSave(p => { p.strategy = el.dataset.s; }); render(); },
  'fin-apply-rec': () => { const plan = finPlan(); if (!confirm(`Set ${plan.rows.filter(r => r.recommended !== null).length} category budgets to the ${FIN.STRATEGY[finP().strategy].label} recommendation?`)) return; finSave(p => { for (const r of plan.rows) if (r.recommended !== null) p.budgets[r.id] = r.recommended; }); render(); toast('Budgets set.'); },
  'fin-clear-budgets': () => { if (!confirm('Clear all your category budgets?')) return; finSave(p => { p.budgets = {}; }); render(); },
  'fin-commit-add': () => { finSave(p => { p.commitments.push({ name: '', amount: '', day: 1 }); }); render(); },
  'fin-commit-del': el => { finSave(p => { p.commitments.splice(+el.dataset.i, 1); }); render(); },
  'fin-ch-add': () => { finSave(p => { p.sim.changes = [...(p.sim.changes || []), { id: E.uid('ch'), label: '', kind: 'raise', mode: 'pct', value: '', date: '', recurring: true, freq: 'monthly', deduct: '', status: 'confirmed' }]; }); render(); },
  'fin-ch-del': el => { finSave(p => { p.sim.changes.splice(+el.dataset.i, 1); }); render(); },
  'fin-sim-auto': () => { finSave(p => { p.sim.baseSrc = 'auto'; p.sim.base = ''; }); render(); },
  'fin-alloc-add': () => { finSave(p => { p.alloc.push({ name: 'New share', pct: 0 }); }); render(); },
  'fin-alloc-del': el => { finSave(p => { p.alloc.splice(+el.dataset.i, 1); }); render(); },
  'fin-lifestyle': el => { const v = +el.dataset.v, plan = finPlan(), disc = plan.rows.filter(r => r.prio === 'discretionary'); if (!disc.length) return toast('No discretionary category to raise.'); const each = FIN.r2(v / disc.length); if (!confirm(`Raise ${disc.length} discretionary budget${disc.length === 1 ? '' : 's'} by ${fm(each)} each (${fm(v)} in total)? Nothing changes unless you confirm.`)) return; finSave(p => { for (const r of disc) p.budgets[r.id] = FIN.r2((r.budget ?? r.recommended ?? 0) + each); }); render(); toast('Budgets raised.'); },
  'fin-fch': el => { UI.fin.fcH = +el.dataset.h; render(); },
  'fin-goal-add': el => { const n = { emergency: 'Emergency fund', save: 'Savings goal', purchase: 'Purchase', debt: 'Repay debt', invest: 'Investing' }[el.dataset.k]; finSave(p => { p.goals.push({ id: E.uid('g'), kind: el.dataset.k, name: n, target: '', saved: '', date: '', monthly: '' }); }); render(); },
  'fin-goal-del': el => { finSave(p => { p.goals.splice(+el.dataset.i, 1); }); render(); },
});
const finNum = v => { if (v === '' || v === null || v === undefined) return ''; const n = FIN.parseNum(v); return n ? n.n : ''; };
Object.assign(CHG, {
  'fin-ui': el => { UI.fin[el.dataset.k] = el.value; render(); },
  'fin-pref': el => { finSave(p => { p[el.dataset.k] = el.type === 'number' ? +el.value : finNum(el.value); }); render(); },
  'fin-prio': el => { finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS); const c = p.cats.find(x => x.id === el.dataset.id); if (c) c.prio = el.value; }); render(); },
  'fin-budget': el => { finSave(p => { const v = finNum(el.value); if (v === '') delete p.budgets[el.dataset.id]; else p.budgets[el.dataset.id] = v; }); render(); },
  'fin-commit': el => { finSave(p => { const c = p.commitments[+el.dataset.i]; if (!c) return; if (el.dataset.k === 'endM') c.end = el.value ? FIN.monthEnd(el.value) : ''; else c[el.dataset.k] = el.dataset.k === 'name' ? el.value : finNum(el.value); }); render(); },
  'fin-sim': el => { finSave(p => { const k = el.dataset.k; p.sim[k] = k === 'horizon' ? +el.value : finNum(el.value); if (k === 'base') p.sim.baseSrc = el.value === '' ? 'auto' : 'manual'; }); render(); },
  'fin-ch': el => { finSave(p => { const c = p.sim.changes[+el.dataset.i]; if (!c) return; const k = el.dataset.k; if (k === 'freq') { c.recurring = el.value !== 'once'; c.freq = el.value === 'once' ? 'once' : el.value; } else c[k] = ['value', 'deduct'].includes(k) ? finNum(el.value) : el.value; }); render(); },
  'fin-scen': el => { finSave(p => { p.sim.scenarios = clone(p.sim.scenarios || FIN.SCEN); p.sim.scenarios[el.dataset.s][el.dataset.k] = +el.value || 0; }); render(); },
  'fin-alloc': el => { finSave(p => { const b = p.alloc[+el.dataset.i]; if (b) b[el.dataset.k] = el.dataset.k === 'pct' ? (finNum(el.value) === '' ? 0 : finNum(el.value)) : el.value; }); render(); },
  'fin-goal': el => { finSave(p => { const g = p.goals[+el.dataset.i]; if (g) g[el.dataset.k] = ['name', 'date'].includes(el.dataset.k) ? el.value : finNum(el.value); }); render(); },
  'fin-rent': el => { finSave(p => { p.rent.scenario = { ...(p.rent.scenario || {}), [el.dataset.k]: +finNum(el.value) || 0 }; }); render(); },
});
