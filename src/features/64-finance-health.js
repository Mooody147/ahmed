// Money canvas — "Check my financial health". One button in the Financial freedom centre (Mind map and Rich Dad) opens a
// window that (1) evaluates where you stand today on six measures, each against a healthy target; (2) shows the optimal
// position for you, in your own numbers; (3) lays out the road to it, step by step, in the order that matters — a safety
// reserve first, expensive debt next, then fewer liabilities, then every pound of surplus into assets until passive
// income covers your expenses. Only today's figures are used (the same ones every canvas shows); anything not known is
// said, never guessed. Targets are common rules of thumb, not advice tailored by a professional.

function finHealth() {
  const W = finWealth(), R = W.R, n = W.n, inc = n.income || 0, exp = R.expenses || 0, today = finToday(), cur = today.slice(0, 7);
  const essential = n.essential || 0, reserveT = essential * 6, haveReserve = Math.max(0, (n.cash || 0) - (n.held || 0));
  const save = Math.max(0, n.capacity || 0), card = n.card || null, util = card && card.limit ? (card.owed || 0) / card.limit : null;
  const pct = (v, of) => of > 0 ? v / of : null, unk = 'not known yet';
  // the measures: value, healthy target, status
  const M = [];
  const sr = pct(save, inc); M.push({ k: 'save', label: 'Savings rate', now: sr === null ? unk : Math.round(sr * 100) + '% of income', target: '20% or more', ok: sr === null ? null : sr >= 0.2 ? 'good' : sr >= 0.1 ? 'warn' : 'bad', score: sr === null ? null : Math.min(1, sr / 0.2) });
  const dl = pct(n.instMonthly || 0, inc); M.push({ k: 'debt', label: 'Instalments', now: dl === null ? unk : Math.round(dl * 100) + '% of income', target: '20% or less', ok: dl === null ? null : dl <= 0.2 ? 'good' : dl <= 0.35 ? 'warn' : 'bad', score: dl === null ? null : Math.max(0, 1 - Math.max(0, dl - 0.2) / 0.3) });
  const em = essential > 0 ? haveReserve / essential : null; M.push({ k: 'reserve', label: 'Emergency fund', now: em === null ? unk : em.toFixed(1) + ' months of essentials', target: '3–6 months', ok: em === null ? null : em >= 3 ? 'good' : em >= 1 ? 'warn' : 'bad', score: em === null ? null : Math.min(1, em / 3) });
  M.push({ k: 'card', label: 'Card used', now: util === null ? (card ? unk : 'no card') : Math.round(util * 100) + '% of the limit', target: '30% or less', ok: util === null ? (card ? null : 'good') : util <= 0.3 ? 'good' : util <= 0.6 ? 'warn' : 'bad', score: util === null ? (card ? null : 1) : Math.max(0, 1 - Math.max(0, util - 0.3) / 0.7) });
  M.push({ k: 'passive', label: 'Passive income covers', now: exp > 0 ? Math.round(R.freedom * 100) + '% of expenses' : unk, target: '100% = financially free', ok: exp > 0 ? (R.freedom >= 1 ? 'good' : R.freedom >= 0.25 ? 'warn' : 'bad') : null, score: exp > 0 ? Math.min(1, R.freedom) : null });
  M.push({ k: 'bs', label: 'Assets vs liabilities', now: `${fk(R.assets)} vs ${fk(R.liab)}`, target: 'assets well above', ok: R.liab <= 0 || R.assets >= R.liab * 3 ? 'good' : R.assets >= R.liab ? 'warn' : 'bad', score: R.liab <= 0 ? 1 : Math.min(1, R.assets / (R.liab * 3)) });
  const known = M.filter(m => m.score !== null), score = known.length ? Math.round(known.reduce((s, m) => s + m.score, 0) / known.length * 100) : null;
  const grade = score === null ? ['Not known yet', 'unknown'] : score >= 80 ? ['Healthy', 'good'] : score >= 55 ? ['Fair — room to improve', 'warn'] : ['Needs attention', 'bad'];
  // the optimal position, in your numbers
  const opt = [];
  if (inc) opt.push(['Save each month', fk(Math.round(inc * 0.2)), `20% of income · now ${fk(save)}`]);
  if (inc) opt.push(['Instalments at most', fk(Math.round(inc * 0.2)), `a month · now ${fk(n.instMonthly || 0)}`]);
  if (essential) opt.push(['Emergency fund', fk(Math.round(reserveT)), `6 months of essentials · now ${fk(haveReserve)}`]);
  if (card && card.limit) opt.push(['Card owed at most', fk(Math.round(card.limit * 0.3)), `30% of the limit · now ${fk(card.owed || 0)}`]);
  if (exp) opt.push(['Passive income', fk(Math.round(exp)), `a month = every expense covered · now ${fk(R.passive)}`]);
  // the road there, in order
  const steps = []; let t = cur; const spare = save, dateAfter = k => { t = FIN.addMonths(t, Math.max(1, Math.ceil(k))); return fmon(t); };
  if (!inc || !n.spending) steps.push({ s: 'next', t: 'Tell the canvas your income and spending (or add your statements)', why: 'without them the roadmap cannot be dated', when: 'now' });
  if (essential && haveReserve < essential * 3) { const gap = essential * 3 - haveReserve; steps.push({ s: 'next', t: `Build a 3-month safety reserve: ${fk(Math.round(gap))} more`, why: 'one surprise should never push you into debt', when: spare > 0 ? 'by ' + dateAfter(gap / spare) : 'once you have a surplus' }); }
  else if (essential) steps.push({ s: 'done', t: 'A 3-month safety reserve', why: `${fk(haveReserve)} set aside`, when: 'done' });
  if (card && (card.owed || 0) > 0) steps.push({ s: steps.some(x => x.s === 'next') ? 'later' : 'next', t: `Clear the credit card: ${fk(card.owed)}`, why: 'card interest is the most expensive money there is', when: spare > 0 ? 'by ' + dateAfter((card.owed || 0) / spare) : 'once you have a surplus' });
  const W2 = W.ending; if ((n.instMonthly || 0) > 0) steps.push({ s: steps.some(x => x.s === 'next') ? 'later' : 'next', t: `Take on no new instalments; let the current ones end${W2 ? ` (${W2.name} ends ${fmon(W2.end)})` : ''}`, why: `${fk(n.instMonthly)} a month leaves your pocket for liabilities`, when: W2 ? fmon(W2.end) : 'ongoing' });
  if (essential && haveReserve < reserveT) steps.push({ s: 'later', t: `Grow the reserve to 6 months: ${fk(Math.round(reserveT))}`, why: 'a full cushion before taking risks', when: spare > 0 ? 'by ' + dateAfter(Math.max(0, reserveT - Math.max(haveReserve, essential * 3)) / spare) : 'later' });
  if (exp) for (const f of [0.25, 0.5, 1]) if (R.freedom < f) { const need = exp * f - R.passive, months = W.yld && spare > 0 ? need / (spare * W.yld / 12) : null;
    steps.push({ s: 'later', t: `Buy assets that pay you until passive income reaches ${Math.round(f * 100)}% of expenses (${fk(Math.round(exp * f))} a month)`, why: f === 1 ? 'out of the rat race: your assets pay for your life' : 'every asset you buy keeps paying you', when: months !== null ? (months > 600 ? 'over 50 years at this pace' : 'about ' + dateAfter(months)) + (W.yld ? ` (estimate at ${(W.yld * 100).toFixed(1)}% a year)` : '') : 'enter what your assets earn to date it' }); }
  if (steps.length && !steps.some(x => x.s === 'next')) { const f = steps.find(x => x.s === 'later'); if (f) f.s = 'next'; }
  return { M, score, grade, opt, steps };
}
function finHealthHTML() {
  const H = finHealth();
  return `<section class="fin-talk-win fin-health-win" id="fin-health-win" role="dialog" aria-label="Your financial health">
    <div class="fin-talk-win-h"><span aria-hidden="true">🩺</span><b>Your financial health</b><span class="spacer"></span><button class="icon-btn" data-act="fin-health" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b fin-health">
      <div class="fin-health-top ${H.grade[1]}"><div class="fin-health-score"><b>${H.score === null ? '—' : H.score}</b><small>of 100</small></div><div><small>1 · Where you stand today</small><b>${esc(H.grade[0])}</b><span class="small muted">from today’s figures — the same ones every canvas shows</span></div></div>
      <div class="fin-health-m">${H.M.map(m => `<div class="${m.ok || 'unknown'}"><span>${esc(m.label)}</span><b>${esc(m.now)}</b><small>healthy: ${esc(m.target)}</small></div>`).join('')}</div>
      <h4>2 · Your optimal position</h4>${H.opt.length ? finKv(H.opt) : '<p class="small muted">Tell the canvas your income and spending to see it.</p>'}
      <h4>3 · Your roadmap</h4><ol class="fin-gc-steps fin-health-road">${H.steps.map(x => `<li class="${x.s}"><span class="d">${esc(x.when)}</span><span><b>${esc(x.t)}</b><br><small class="muted">${esc(x.why)}</small></span></li>`).join('')}</ol>
      <p class="small muted">Targets are common rules of thumb (save 20%, instalments under 20% of income, 3–6 months of essentials set aside, card under 30% of its limit), not professional advice. Dates are estimates from today’s surplus.</p>
    </div></section>`;
}
Object.assign(ACT, { 'fin-health': el => { UI.fin.healthWin = el.dataset.v === 'close' ? false : !UI.fin.healthWin; render(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.fin.healthWin && UI.view === 'finance') { UI.fin.healthWin = false; render(); } }, true);
Object.assign(window.__FIN, { health: () => { const H = finHealth(); return { score: H.score, grade: H.grade[0], measures: H.M.map(m => [m.k, m.ok, m.now]), opt: H.opt.map(o => o[0]), steps: H.steps.map(s => [s.s, s.t, s.when]) }; } });
