// Money canvas — every goal gets an honest check. When you add a goal (on the canvas or in words), the canvas does not
// simply approve it: it weighs it against your real numbers — free cash after your safety reserve, what you can save
// each month after spending and instalments, the goals already ahead of it, what the card or Halan would cost — and
// tells you, in this order:
//   1. Feasibility — achievable, a stretch, or not now;
//   2. Assessment — why, with the constraints and risks;
//   3. Requirements — the money, the monthly amount and the time it takes;
//   4. Execution plan — step by step, with milestones and dates (when it is achievable or a stretch);
//   5. Optimisation — what to change to make it achievable (a later date, saving more and where it could come from, a
//      smaller budget, putting it first), with one-tap buttons.
// Only numbers from your records are used; when something is not known (income, spending) the check says so instead of
// guessing. The check opens beside the new goal, and stays in the goal's details.

const FIN_GC_VERDICT = { yes: ['✅', 'Achievable', 'good'], stretch: ['⚠️', 'A stretch', 'warn'], no: ['⛔', 'Not now', 'bad'] };
const finMonthsTo = (from, to) => { const [a, b] = [from, to].map(s => s.slice(0, 7).split('-').map(Number)); return (b[0] - a[0]) * 12 + (b[1] - a[1]); };
const finMonAdd = (m, k) => { const [y, mo] = m.split('-').map(Number), t = y * 12 + (mo - 1) + k; return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}`; };

function finGoalAssess(id) {
  const plan = finBuyPlan(), n = finNow(), it = plan.items.find(z => z.id === id); if (!it) return null;
  const today = finToday(), cur = today.slice(0, 7), cap = Math.max(0, n.capacity || 0), inc = n.income || 0, idx = plan.items.indexOf(it), ahead = plan.items.slice(0, idx);
  const aheadNeed = ahead.reduce((s, x) => s + (x.need || 0), 0), want = it.wantBy ? it.wantBy.slice(0, 7) : null, monthsTo = want ? Math.max(0, finMonthsTo(cur, want)) : null;
  const lateBy = want && it.ready ? finMonthsTo(want, it.ready) : null, credit = it.rec === 'card_plan' || it.rec === 'halan', q = it.rec === 'card_plan' ? it.options.cardPlan : it.rec === 'halan' ? it.options.halan : null;
  const unknown = []; if (!inc) unknown.push('your income is not known yet'); if (!n.spending) unknown.push('your usual spending is not known yet');
  // 1. the verdict
  let v = 'yes';
  if (it.rec === 'not_yet' || !it.ready || cap <= 0 && it.need > 0 || (lateBy !== null && lateBy > 6)) v = 'no';
  else if (credit || (lateBy !== null && lateBy > 0) || (it.required && it.required > cap * 0.5) || (it.months !== null && it.months > 24) || unknown.length) v = 'stretch';
  // 2. why
  const why = [];
  why.push(it.fromCash >= it.price ? `Your free cash (${fk(n.free)}, after a ${fk(n.reserve)} safety reserve) covers it today.` : it.fromCash > 0 ? `Your free cash covers ${fk(it.fromCash)} of it (${Math.round(it.fromCash / it.price * 100)}%); ${fk(it.need)} is still needed.` : `There is no free cash for it now (free cash ${fk(n.free)} after the ${fk(n.reserve)} reserve${ahead.length ? ' and the goals ahead of it' : ''}).`);
  if (it.need > 0) why.push(cap > 0 ? `You can save about ${fk(cap)} a month (income ${fk(inc)} − spending ${fk(n.spending)} − instalments ${fk(n.instMonthly || 0)}${n.goalsMonthly ? ' − other savings goals' : ''}).` : `Nothing is left to save each month: spending ${fk(n.spending)} and instalments ${fk(n.instMonthly || 0)} take ${inc ? fk(inc) + ' of income' : 'everything'}.`);
  if (ahead.length) why.push(`${ahead.length} goal${ahead.length === 1 ? '' : 's'} ahead of it (${ahead.map(x => x.name).slice(0, 3).join(', ')}${ahead.length > 3 ? '…' : ''}) still need ${fk(aheadNeed)} first.`);
  if (want && it.ready) why.push(lateBy > 0 ? `At this pace it is ready in ${fmon(it.ready)} — ${lateBy} month${lateBy === 1 ? '' : 's'} after the ${fmon(want)} you want.` : `It is ready by ${fmon(it.ready)}, in time for ${fmon(want)}.`);
  if (credit && q) why.push(`On time only with ${it.rec === 'halan' ? 'Halan' : 'card'} instalments: ${fk(q.monthly)} a month for ${q.months} months, ${fk(q.cost)} extra cost — a new liability (money out of your pocket every month).`);
  if (inc && n.instMonthly / inc > 0.2) why.push(`Instalments already take ${Math.round(n.instMonthly / inc * 100)}% of your income — more debt is a risk.`);
  if (inc && it.price > inc * 3) why.push(`It costs ${(it.price / inc).toFixed(1)} months of income.`);
  why.push('It is a purchase, not an asset: it will not pay you back — the Rich Dad way is to buy it from what your assets earn, or after them.');
  for (const u of unknown) why.push(`Uncertain: ${u} — tell the canvas, and the check gets sharper.`);
  // 3. requirements
  const need = [['Price', fk(it.price), it.wantBy ? 'by ' + fday(it.wantBy) : 'no date'], ['From cash now', fk(it.fromCash), ''], ['Still to save', fk(it.need), ''],
    ['A month', it.need > 0 ? fk(it.required || it.monthly || 0) : '—', it.required && want ? `to be on time` : it.monthly ? 'planned' : ''], ['Ready', it.ready ? fmon(it.ready) : 'not within reach', it.months ? `${it.months} month${it.months === 1 ? '' : 's'}` : it.ready ? 'now' : '']];
  // 4. the plan, with milestones
  const steps = [];
  if (v !== 'no') {
    if (it.fromCash > 0) steps.push([fday(today), `Set aside ${fk(it.fromCash)} from your free cash for ${it.name}.`]);
    if (it.rec === 'card_full') steps.push([fmon(cur), `Buy it with the card; pay the full ${fk(it.need)} at the next due date — no interest.`]);
    else if (credit && q) { steps.push([fmon(cur), `Buy it on ${it.rec === 'halan' ? 'Halan' : 'the card'} instalments.`]); steps.push([fmon(finMonAdd(cur, q.months)), `Last of ${q.months} payments of ${fk(q.monthly)} — then that money goes back to your assets.`]); }
    else if (it.need > 0) {
      const m = it.monthly || it.required || 0;
      if (m > 0) { steps.push([fmon(finMonAdd(cur, 1)), `Start saving ${fk(m)} a month for it — on payday, before spending.`]);
        for (const pct of [25, 50, 75]) { const k = Math.ceil(Math.max(0, it.price * pct / 100 - it.fromCash) / m); if (k > 0 && k < (it.months || 999)) steps.push([fmon(finMonAdd(cur, k)), `${pct}% saved (${fk(Math.round(it.price * pct / 100))}).`]); } }
      if (it.ready) steps.push([fmon(it.ready), `100% saved — buy ${it.name} with cash.`]);
    } else steps.push([fday(today), `Buy it — the money is there, and your safety reserve stays untouched.`]);
  }
  // 5. what would make it achievable
  const fix = [];
  if (v !== 'yes') {
    if (it.ready && want && lateBy > 0) fix.push({ t: `Move the date to ${fmon(it.ready)} — reachable by saving, no debt.`, act: { k: 'wantBy', v: it.ready + '-28' } });
    if (want && monthsTo > 0 && it.need > 0) { const req = Math.ceil(it.need / monthsTo), extra = Math.max(0, req - (it.monthly || 0));
      if (extra > 0 && cap > 0 && req > cap * 1.5) fix.push({ t: `Being on time would take ${fk(req)} a month — ${(req / cap).toFixed(1)}× what you can save. Not realistic by cutting spending: change the date or the budget.` });
      else if (extra > 0) { const cuts = finGoalCuts(extra); fix.push({ t: `Save ${fk(extra)} more a month to be on time${cuts ? ` — for example from ${cuts}` : ''}.` }); }
      const afford = Math.max(0, it.fromCash + (it.monthly || 0) * monthsTo); if (afford > 0 && afford < it.price) fix.push({ t: `Or set a budget of ${fk(Math.floor(afford / 100) * 100)} — what you can have by ${fmon(want)} without debt.` }); }
    if (ahead.length) fix.push({ t: `Put it first — the ${ahead.length} goal${ahead.length === 1 ? '' : 's'} ahead of it wait instead.`, act: { k: 'first' } });
    if (cap <= 0) fix.push({ t: 'First make room each month: see Budget & control for the categories to cut.' });
    if (credit) fix.push({ t: `Avoid the ${fk(q ? q.cost : 0)} interest: wait until ${it.ready ? fmon(it.ready) : 'you have saved it'} and pay cash.` });
  }
  return { it, v, why, need, steps, fix };
}
// where extra savings could come from: the biggest discretionary categories of the last three months
function finGoalCuts(extra) {
  const all = finAll(), cur = finToday().slice(0, 7), done = all.months.filter(b => b.covered && b.m < cur).slice(-3); if (!done.length) return '';
  const byCat = {}; for (const b of done) for (const [k, v] of Object.entries(b.byCat || {})) { const c = finCat(k); if (c && c.kind === 'expense' && (c.prio || 'discretionary') === 'discretionary') byCat[k] = (byCat[k] || 0) + v / done.length; }
  const top = Object.entries(byCat).filter(([, v]) => v > 1).sort((a, b) => b[1] - a[1]).slice(0, 3); if (!top.length) return '';
  return top.map(([k, v]) => `${finCat(k).name} (${fk(Math.round(v))} a month)`).join(', ');
}
function finGoalCheckHTML(id) {
  const A = finGoalAssess(id); if (!A) return '';
  const [ic, word, cls] = FIN_GC_VERDICT[A.v];
  return `<div class="fin-gc ${cls}">
    <div class="fin-gc-v"><span class="ic" aria-hidden="true">${ic}</span><div><small>1 · Feasibility</small><b>${word}</b></div></div>
    <h4>2 · Assessment</h4><ul class="fin-gc-why">${A.why.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
    <h4>3 · Requirements</h4>${finKv(A.need)}
    ${A.steps.length ? `<h4>4 · Execution plan</h4><ol class="fin-gc-steps">${A.steps.map(([d, t]) => `<li><span class="d">${esc(d)}</span><span>${esc(t)}</span></li>`).join('')}</ol>` : `<h4>4 · Execution plan</h4><p class="small muted">Not yet — first make it achievable (below).</p>`}
    ${A.fix.length ? `<h4>5 · To make it achievable</h4><ul class="fin-gc-fix">${A.fix.map(f => `<li><span>${esc(f.t)}</span>${f.act ? `<button class="btn sm" data-act="fin-gc-apply" data-id="${esc(id)}" data-k="${f.act.k}" data-v="${esc(f.act.v || '')}">${f.act.k === 'first' ? 'Put it first' : 'Use this date'}</button>` : ''}</li>`).join('')}</ul>` : ''}
  </div>`;
}
// the one-line summary that goes in the conversation
function finGoalCheckLine(id) { const A = finGoalAssess(id); if (!A) return ''; const [ic, word] = FIN_GC_VERDICT[A.v]; return `${ic} ${A.it.name} (${fk(A.it.price)}): ${word} — ${A.why[A.why.length > 2 ? 1 : 0]}`; }

const FGC = { touch: 0 }; document.addEventListener('pointerdown', () => { FGC.touch = Date.now(); }, true); document.addEventListener('keydown', () => { FGC.touch = Date.now(); }, true);
// a goal you just added: checked, the check opened beside it, and said in the conversation (after any presentation)
HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance') return;
  const ids = (finP().buys || []).filter(b => !b.done).map(b => b.id);
  if (!UI.fin.goalSeen) { UI.fin.goalSeen = new Set(ids); return; }   // the goals you already had are not "new"
  const fresh = ids.filter(id => !UI.fin.goalSeen.has(id)); ids.forEach(id => UI.fin.goalSeen.add(id)); if (!fresh.length) return;
  for (const id of fresh) { const line = finGoalCheckLine(id); if (line) finTalkPush({ id: E.uid('tk'), at: nowISO(), who: 'claude', reply: 'Goal check — ' + line, notes: [], done: [], changes: [] }); }
  // opened beside the goal only while you are not busy with something else: within a few seconds, and only if you have
  // not touched the page since (otherwise it waits in the conversation and in the goal's details)
  const id = fresh[fresh.length - 1], at = Date.now(), open = () => { if (!finBuyPlan().items.some(z => z.id === id) || (FGC.touch > at) || UI.fin.pop || UI.fin.cvEdit) return; UI.fin.pop = 'b:' + id; UI.fin.popAt = Date.now(); render(); };
  let tries = 0; const wait = () => { if (Date.now() - at > 15000 || FGC.touch > at) return; const P = window.__FIN.presentation && window.__FIN.presentation(); if (P && P.on && tries++ < 60) return setTimeout(wait, 400); open(); };
  setTimeout(wait, 600);
});
Object.assign(ACT, { 'fin-gc-apply': el => {
  const id = el.dataset.id, k = el.dataset.k, snap = finSnapshot(), before = typeof finChangeIndex === 'function' ? finChangeIndex() : null, b = (finP().buys || []).find(x => x.id === id); if (!b) return;
  finSave(q => { const x = q.buys.find(z => z.id === id); if (!x) return; if (k === 'wantBy' && FIN.validDate(el.dataset.v)) x.wantBy = el.dataset.v; if (k === 'first') { q.buys.forEach(z => { if (z.id !== id && (+z.priority || 2) <= 1) z.priority = 2; }); x.priority = 1; } });
  const m = { id: E.uid('tk'), at: nowISO(), who: 'edit', text: k === 'first' ? `${b.name}: now first in line` : `${b.name}: wanted by ${fday(el.dataset.v)}`, undoable: true }; UI.fin.undo.set(m.id, snap); finTalkPush(m);
  if (before && typeof finPresent === 'function') finPresent(before, ['b:' + id]); UI.fin.pop = 'b:' + id; UI.fin.popAt = Date.now(); render();
} });
Object.assign(window.__FIN, { goalCheck: id => { const A = finGoalAssess(id); return A && { verdict: A.v, why: A.why, need: A.need, steps: A.steps, fix: A.fix.map(f => f.t) }; } });
