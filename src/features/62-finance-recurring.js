// Money — recurring payments, as they stand TODAY. Old statements are for finding what repeats and how it behaved; they
// never make a payment current by themselves. Every repeating payment and instalment found in your statements is checked
// against what your statements actually cover (and against what you said): active, to verify, or stopped — and only the
// active ones count in your current obligations, spending and savings, on every canvas.
// Grouped as: Subscriptions (YouTube, Spotify and other digital services), Fixed commitments (your monthly الجمعية,
// instalments, rent, loans) and Other recurring payments. Month by month you see what was running, what was added,
// what you stopped — and how much each stopped payment saves you.

const FIN_REC_GROUPS = { subs: ['📺', 'Subscriptions', 'YouTube, Spotify and other digital services'], fixed: ['📌', 'Fixed commitments', 'الجمعية, instalments, rent, loans and other regular obligations'], other: ['🔁', 'Other recurring payments', 'everything else that repeats'] };
const FIN_REC_DIGITAL = /youtube|spotify|netflix|shahid|osn|anghami|deezer|apple|icloud|google|microsoft|xbox|playstation|psn|steam|adobe|openai|chat ?gpt|anthropic|claude|canva|notion|dropbox|zoom|linkedin|duolingo|coursera|udemy|disney|hbo|crunchyroll|watch ?it|tik ?tok|snapchat|x premium|telegram premium|subscription|اشتراك/i;
const FIN_REC_FIXED = /جمعي|جمعيه|جمعية|gam'?e?y[ae]|gamaeya|association|قسط|اقساط|أقساط|install?ment|loan|قرض|\brent\b|إيجار|ايجار|mortgage|valu|souhoola|sympl|halan|حالا|aman|premium finance/i;
function finRecGroup(name, cat, inst) {
  if (inst || ['debt', 'prop_inst', 'housing'].includes(cat) || FIN_REC_FIXED.test(name)) return 'fixed';
  if (cat === 'subs' || FIN_REC_DIGITAL.test(name)) return 'subs';
  return 'other';
}
// how far your statements reach, per account (the newest statement end, or the newest transaction)
function finCoverage(tx) {
  const m = {}; for (const t of tx) if (t.acct && t.date && (!m[t.acct] || t.date > m[t.acct])) m[t.acct] = t.date;
  for (const b of colList('finbatch')) if (!b.undone && b.acct && FIN.validDate(b.to) && (!m[b.acct] || b.to > m[b.acct])) m[b.acct] = b.to;
  return m;
}
// the model every canvas reads: computed once per change of your data (called from finNow)
function finRecurringModel({ tx, all, inst, today, p }) {
  const by = new Map(tx.map(t => [t.id, t])), cov = finCoverage(tx), marks = p.recMarks || {}, cur = today.slice(0, 7), items = [];
  const instIds = new Set((inst || []).flatMap(i => i.ids || []));
  const months = ids => [...new Set(ids.map(id => by.get(id)).filter(Boolean).map(t => t.date.slice(0, 7)))].sort();
  const covOf = ids => ids.map(id => by.get(id)).filter(Boolean).map(t => cov[t.acct]).filter(Boolean).sort().pop() || null;
  for (const r of FIN.recurring((all.entries || []).filter(e => e.flow === 'exp'))) {
    if ((r.ids || []).some(id => instIds.has(id))) continue;   // an instalment: listed once, as an instalment
    const grp = finRecGroup(r.name, r.cat, false); if (grp === 'other' && !r.fixed) continue;   // shopping somewhere every month (a varying amount) is spending, not a recurring payment
    const covered = covOf(r.ids || []), st = FIN.recurringStatus(r, covered, today, marks['r:' + r.key]), ms = months(r.ids || []);
    items.push({ key: 'r:' + r.key, kind: 'rec', name: r.name, cat: r.cat, amount: r.amount, perMonth: r.perMonth, freq: r.freq, first: ms[0] || null, last: r.last, next: r.next, n: r.n, ids: r.ids || [], months: ms, covered,
      group: grp, status: st.status, since: st.since || null, why: st.why || '', by: st.by });
  }
  for (const i of inst || []) {
    if (i.status === 'completed' || i.status === 'discontinued') continue;
    const k = (p.installments || []).find(x => x.key === i.key) || {}, ms = months(i.ids || []);
    const status = i.status === 'stopped' ? 'ended' : i.status === 'missing' ? 'verify' : 'active';
    items.push({ key: 'i:' + i.key, kind: 'inst', name: i.name, cat: 'debt', amount: i.amount, perMonth: i.amount, freq: 'monthly', first: ms[0] || i.first || null, last: i.last, next: null, n: i.n, of: i.of, remaining: i.remaining, end: i.end, ids: i.ids || [], months: ms,
      group: 'fixed', status, since: status === 'ended' ? (k.since || (i.last ? FIN.addMonths(i.last.slice(0, 7), 1) : cur)) : null, why: status === 'verify' ? 'not seen in your latest statements' : '', by: i.status === 'stopped' || k.status ? 'you' : 'statements' });
  }
  items.sort((a, b) => ({ active: 0, verify: 1, ended: 2 })[a.status] - ({ active: 0, verify: 1, ended: 2 })[b.status] || b.perMonth - a.perMonth);
  // what each month paid in recurring payments (to take them out of past spending: they are counted at today's value)
  const byMonth = {}; for (const it of items) for (const id of it.ids) { const t = by.get(id); if (t && typeof t.amount === 'number' && t.amount < 0) byMonth[t.date.slice(0, 7)] = FIN.r2((byMonth[t.date.slice(0, 7)] || 0) - t.amount); }
  const act = items.filter(i => i.status === 'active'), sumOf = l => FIN.r2(l.reduce((s, i) => s + i.perMonth, 0));
  const monthly = { subs: sumOf(act.filter(i => i.group === 'subs')), fixed: sumOf(act.filter(i => i.group === 'fixed')), other: sumOf(act.filter(i => i.group === 'other')) };
  monthly.total = FIN.r2(monthly.subs + monthly.fixed + monthly.other);
  return { items, byMonth, monthly, activeNonInst: sumOf(act.filter(i => i.kind !== 'inst')), activeInst: sumOf(act.filter(i => i.kind === 'inst')), verify: items.filter(i => i.status === 'verify'), ended: items.filter(i => i.status === 'ended') };
}
const finRec = () => finNow().rec || { items: [], monthly: { subs: 0, fixed: 0, other: 0, total: 0 }, verify: [], ended: [] };

// month by month: what was running, what was added, what you stopped, and what stopping saves
function finRecTimeline(n = 12) {
  const R = finRec(), cur = finToday().slice(0, 7), first = R.items.map(i => i.first).filter(Boolean).sort()[0]; if (!first) return [];
  const list = []; for (let m = FIN.addMonths(cur, -(n - 1)); m <= cur; m = FIN.addMonths(m, 1)) if (m >= first) list.push(m);
  return list.map(m => {
    const running = R.items.filter(i => i.months.includes(m) || (i.status !== 'ended' && i.first && i.first <= m && m > (i.months[i.months.length - 1] || '') && i.status === 'active'));
    const added = R.items.filter(i => i.first === m && m > first), stopped = R.items.filter(i => i.status === 'ended' && i.since === m);
    const savedSoFar = FIN.r2(R.ended.filter(i => i.since && i.since <= m).reduce((s, i) => s + i.perMonth, 0));
    return { m, running, added, stopped, total: FIN.r2(running.reduce((s, i) => s + i.perMonth, 0)), stoppedMonthly: FIN.r2(stopped.reduce((s, i) => s + i.perMonth, 0)), savedSoFar };
  });
}
function finRecTimelineHTML() {
  const T = finRecTimeline(), R = finRec(); if (!T.length) return '<p class="small muted">No recurring payments found in your statements yet.</p>';
  const cur = finToday().slice(0, 7), savedTotal = FIN.r2(R.ended.reduce((s, i) => s + i.perMonth * Math.max(0, i.since ? finMonthsTo(i.since, cur) + 1 : 1), 0));
  return finKv([['Committed now', fk(R.monthly.total) + '/mo', 'active recurring payments'], ['Stopped', String(R.ended.length), `saves ${fk(FIN.r2(R.ended.reduce((s, i) => s + i.perMonth, 0)))} a month`], ['Saved so far', fk(savedTotal), 'since each was stopped'], ['To verify', String(R.verify.length), R.verify.length ? 'not counted until you confirm' : 'none']])
    + `<div class="fin-box-scroll"><table class="fin-box-t fin-rec-t"><thead><tr><th>Month</th><th class="num">Recurring</th><th>Added</th><th>Stopped</th><th class="num">Less a month</th></tr></thead><tbody>
    ${T.slice().reverse().map((r, i, a) => { const prev = a[i + 1]; const d = prev ? FIN.r2(r.total - prev.total) : 0;
      return `<tr><td>${fmon(r.m)}</td><td class="num">${fk(r.total)}<br><small class="muted">${r.running.length} running${d ? ` · ${d > 0 ? '▲' : '▼'} ${fk(Math.abs(d))}` : ''}</small></td><td>${r.added.map(x => `<span class="fin-rec-chip add">${typeof finLogo === 'function' ? finLogo(x.name, 'sm') : ''}${esc(x.name)} +${fk(x.perMonth)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
        <td>${r.stopped.map(x => `<span class="fin-rec-chip stop">${typeof finLogo === 'function' ? finLogo(x.name, 'sm') : ''}${esc(x.name)} −${fk(x.perMonth)}</span>`).join(' ') || '<span class="muted">—</span>'}</td><td class="num">${r.stoppedMonthly ? fk(r.stoppedMonthly) : ''}${r.savedSoFar ? `<br><small class="muted">${fk(r.savedSoFar)}/mo less than before</small>` : ''}</td></tr>`; }).join('')}</tbody></table></div>`;
}

// the canvas: one room for your recurring payments, by group, with what to verify and what you stopped
function finRecBranch(leaf, branch) {
  const R = finRec(), cur = finToday().slice(0, 7);
  const card = it => leaf('rc:' + it.key, it.name, `${fk(it.perMonth)}/mo`, it.status === 'active' ? (it.kind === 'inst' ? `instalment${it.of ? ` · ${it.n} of ${it.of}` : ''}${it.end ? ' · ends ' + fmon(it.end) : ''}` : `${it.freq}${it.first ? ' · since ' + fmon(it.first) : ''}${it.next && it.next.slice(0, 7) >= cur ? ' · next ~' + fday(it.next) : ''}`)
    : it.status === 'verify' ? `to verify — ${it.why}` : `stopped ${it.since ? fmon(it.since) : ''} · saves ${fk(it.perMonth)} a month`, { act: 'fin-cv-det', id: 'rc:' + it.key }, it.status === 'verify' ? 'warn' : it.status === 'ended' ? 'muted' : '');
  const kids = [leaf('rc~months', 'Month by month', '', 'what runs, what was added, what you stopped and saved', { act: 'fin-cv-det', id: 'rc~months' }, '')];
  for (const [g, [ic, label]] of Object.entries(FIN_REC_GROUPS)) { const l = R.items.filter(i => i.status === 'active' && i.group === g); if (l.length) kids.push(branch('rc-' + g, ic, label, 20, 'exp', `${fk(R.monthly[g])}/mo`, l.map(card))); }
  if (R.verify.length) kids.push(branch('rc-verify', '❔', 'To verify', 40, 'exp', 'not counted yet', R.verify.map(card)));
  if (R.ended.length) kids.push(branch('rc-ended', '✂️', 'Stopped', 140, 'exp', `saves ${fk(R.ended.reduce((s, i) => s + i.perMonth, 0))}/mo`, R.ended.map(card)));
  return branch('recur', '🔁', 'Recurring payments', 20, 'exp', `${fk(R.monthly.total)} a month now · ${R.items.filter(i => i.status === 'active').length} running${R.verify.length ? ` · ${R.verify.length} to verify` : ''}`, kids);
}
function finRecDetail(id) {
  if (id === 'rc~months') return finRecTimelineHTML();
  const key = id.slice(3), it = finRec().items.find(i => i.key === key); if (!it) return '';
  const txs = it.ids.map(i => FS.by.get(i)).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  const [gi, gl] = FIN_REC_GROUPS[it.group];
  return finKv([['A month', fk(it.perMonth), it.freq], ['Status', it.status === 'active' ? 'Active' : it.status === 'verify' ? 'To verify' : 'Stopped', it.status === 'ended' ? `since ${it.since ? fmon(it.since) : '—'} · saves ${fk(it.perMonth)}/mo` : it.why || (it.by === 'you' ? 'as you said' : 'seen in your latest statements')], ['Group', `${gi} ${gl}`, ''], ['Seen', `${it.months.length} month${it.months.length === 1 ? '' : 's'}`, it.first ? `${fmon(it.first)} – ${fmon(it.last.slice(0, 7))}` : '']])
    + `<p class="small muted">${it.status === 'active' ? 'Counted in your current obligations on every canvas.' : it.status === 'verify' ? 'Not counted in your current obligations until you confirm it is still running.' : 'No longer counted — only kept as history.'}</p>`
    + `<div class="row">${it.status !== 'active' ? finBtn('fin-rec-mark', '✓ Still paying', { id: it.key, v: 'active' }) : ''}${it.status !== 'ended' ? finBtn('fin-rec-mark', '✂️ Stopped — I no longer pay it', { id: it.key, v: 'stopped' }) : ''}${it.by === 'you' ? finBtn('fin-rec-mark', 'Let the statements decide', { id: it.key, v: 'clear' }) : ''}</div>`
    + `<h4>Payments</h4>${finTxList(txs, 8)}`;
}
// still paying / stopped: what you say is kept, with Undo, and shown on the canvas
function finRecMark(key, v, since) {
  const it = finRec().items.find(i => i.key === key || i.key === 'r:' + key || i.key === 'i:' + key); if (!it) return '';
  const before = typeof finChangeIndex === 'function' ? finChangeIndex() : null, snap = finSnapshot(), cur = finToday().slice(0, 7), when = /^\d{4}-\d{2}$/.test(since || '') ? since : cur;
  if (it.kind === 'inst') finSave(q => { const k = it.key.slice(2), old = (q.installments || []).find(x => x.key === k) || {}; q.installments = (q.installments || []).filter(x => x.key !== k); if (v !== 'clear') q.installments.push({ ...old, key: k, status: v === 'stopped' ? 'stopped' : 'active', since: v === 'stopped' ? when : null, at: nowISO(), by: 'you' }); else if (old.remaining !== undefined) q.installments.push({ key: k, remaining: old.remaining, at: nowISO() }); });
  else finSave(q => { q.recMarks = { ...(q.recMarks || {}) }; if (v === 'clear') delete q.recMarks[it.key]; else q.recMarks[it.key] = { status: v === 'stopped' ? 'stopped' : 'active', since: v === 'stopped' ? when : null, at: nowISO() }; });
  const line = v === 'clear' ? `${it.name}: back to what the statements show` : v === 'stopped' ? `${it.name}: stopped from ${fmon(when)} — ${fk(it.perMonth)} a month less in your obligations` : `${it.name}: still paying — counted in your current obligations`;
  const m = { id: E.uid('tk'), at: nowISO(), who: 'edit', text: line, undoable: true }; UI.fin.undo.set(m.id, snap); finTalkPush(m);
  UI.fin.pop = null; if (before && typeof finPresent === 'function') finPresent(before, ['rc:' + it.key]); render(); return line;
}
Object.assign(ACT, { 'fin-rec-mark': el => finRecMark(el.dataset.id, el.dataset.v) });
Object.assign(window.__FIN, { rec: () => finRec(), recTimeline: () => finRecTimeline().map(r => ({ m: r.m, total: r.total, running: r.running.map(i => i.name), added: r.added.map(i => i.name), stopped: r.stopped.map(i => i.name), stoppedMonthly: r.stoppedMonthly, savedSoFar: r.savedSoFar })), recMark: (k, v, s) => finRecMark(k, v, s) });
