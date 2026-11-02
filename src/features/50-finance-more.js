// What makes the Money canvas complete: what is coming up and what needs attention, finding anything on it, a minimap
// and quick jumps between rooms, small trend lines on the cards, cash over time, and keys for everything.

/* --- coming up: the next 60 days, and the cash they leave --- */
function finUpcoming() {
  const n = finNow(), key = finNow.k + '|' + (St.cols.fintalk && (St.cols.fintalk.get('log') || {}).updatedAt);
  if (finUpcoming.k === key) return finUpcoming.v;
  const A = finUpcomingArgs(), today = finToday();
  const v = { ...FIN.upcoming({ today, days: 60, cash: n.cashKnown ? FIN.r2(n.cash - n.held) : null, ...A }), reserve: n.reserve };
  finUpcoming.k = key; finUpcoming.v = v; return v;
}
// what is expected, and when: repeating income and bills running today, instalments, the card bill, dated events
// (shared with "How can I manage the rest of this month?")
function finUpcomingArgs() {
  const n = finNow(), p = finP(), today = finToday(), all = finAll(), cur = today.slice(0, 7);
  const cardIds = new Set(p.accounts.filter(a => a.kind === 'credit_card' || a.kind === 'bnpl').map(a => a.id));
  const ins = (p.inputs || []).filter(i => i.kind === 'income' && (!i.from || i.from <= today) && (!i.to || i.to >= today));
  const instKeys = n.inst.map(i => FIN.norm(i.name).slice(0, 10));
  const byId = new Map((all.entries || []).map(e => [e.id, e]));
  const recNow = typeof finRec === 'function' ? new Map(finRec().items.map(i => [i.key, i.status])) : null;   // only payments running today — not every one an old statement shows
  const onlySal = finSalaryOnly(ins), isPay = e => e.flow === 'inc' && e.v > 0 && (e.cat === 'salary' || FIN_PAYROLL.test(e.desc || ''));
  // income you stated replaces what the statements show: your salary replaces your pay alone, anything else all of it
  const rec = FIN.recurring(all.entries || []).filter(r => r.freq === 'monthly' && !(ins.length && r.dir > 0 && (!onlySal || r.cat === 'salary' || FIN_PAYROLL.test(r.name))) && !instKeys.some(k => k && FIN.norm(FIN.cleanDesc(r.name)).startsWith(k)) && (r.dir > 0 || !recNow || recNow.get('r:' + r.key) === 'active'))   // a payment counts only when the recurring audit finds it running (shopping that varies is spending, not a bill)
    .map(r => ({ ...r, name: FIN.cleanDesc(r.name), onCard: r.ids.length > 0 && r.ids.every(id => cardIds.has((byId.get(id) || {}).acct)) }));
  // income you entered arrives on the day the salary usually comes in
  const salDay = (() => { const s = (all.entries || []).filter(isPay).map(e => e.date).sort().pop(); return s ? +s.slice(8, 10) : 1; })();
  // a salary already received this month is not expected again before next month
  const gotThisMonth = (all.entries || []).some(e => isPay(e) && e.m === cur), from = gotThisMonth ? FIN.addMonths(cur, 1) : cur;
  const incomes = ins.map(i => ({ label: i.label, amount: +i.amount, day: salDay, from }));
  // a salary whose line changes each month ("SALARY OCTOBER", "SALARY NOVEMBER") is not seen as repeating: expect it anyway
  if (!ins.length && !rec.some(r => r.dir > 0 && r.cat === 'salary')) { const ib = FIN.incomeBase(all, today); if (ib.salary) incomes.push({ label: 'Salary (expected)', amount: ib.salary, day: salDay, from }); }
  // the card bill: its due date, or a month after it when that has passed (the statement balance, as an estimate)
  let card = null;
  if (n.card && n.card.owed > 0) { const st = n.card.a.stmt || {}; let due = st.dueDate || null; while (due && due < today) due = FIN.addMonthsDate(due, 1); if (due) card = { dueDate: due, amount: n.card.owed, minDue: st.minDue || null, label: due === st.dueDate ? 'Card bill' : 'Card bill (estimate)' }; }
  const plan = finBuyPlan(), dated = [];
  for (const it of plan.items) if (it.ready && it.ready > cur) dated.push({ date: it.ready + '-01', label: `${it.name} becomes affordable`, kind: 'goal' });
  for (const h of p.holdings) if (h.handover && h.handover >= today) dated.push({ date: h.handover.slice(0, 10), label: `${h.name}: handover`, kind: 'event' });
  for (const g of p.goals || []) if (g.date && g.date >= today) dated.push({ date: g.date, label: `${g.name}: goal date`, kind: 'goal' });
  const insts = n.inst.map(i => ({ ...i, onCard: i.acct ? cardIds.has(i.acct) : !!n.card }));
  return { recurring: rec, installments: insts, incomes, card, dated };
}

/* --- what needs your attention --- */
function finAlerts() {
  const n = finNow(), p = finP(), today = finToday(), all = finAll(), up = finUpcoming(), plan = finBuyPlan(), out = [];
  const A = (id, sev, icon, label, val, sub, sec, more) => out.push({ id: 'al:' + id, sev, icon, label, val, sub, sec, more: more || '' });
  if (n.card && n.card.a.stmt && n.card.a.stmt.dueDate) {
    const d = n.card.a.stmt.dueDate, days = FIN.dnum(d) - FIN.dnum(today);
    if (days >= 0 && days <= 7) A('carddue', days <= 2 ? 'crit' : 'warn', '💳', days === 0 ? 'Card bill due today' : `Card bill due in ${days} day${days === 1 ? '' : 's'}`, fk(n.card.owed), `minimum ${fk(n.card.a.stmt.minDue || 0)} · by ${fday(d)}`, 'credit', 'Paying the whole statement balance avoids interest.');
  }
  if (n.card && n.card.limit && typeof n.card.owed === 'number') { const u = n.card.owed / n.card.limit; if (u > 0.3) A('util', u > 0.7 ? 'crit' : 'warn', '📈', `Card ${Math.round(u * 100)}% used`, fk(n.card.owed), `of a ${fk(n.card.limit)} limit`, 'credit', 'Keeping it under 30% leaves room for emergencies and keeps the bill easy to pay in full.'); }
  if (up.low && up.low.bal < n.reserve) A('lowcash', up.low.bal < 0 ? 'crit' : 'warn', '⚠️', up.low.bal < 0 ? 'Cash may run out' : 'Cash dips below your reserve', fk(up.low.bal), `on ${fday(up.low.date)} · reserve ${fk(n.reserve)}`, 'update', 'From the bills, instalments and card bill coming up. Move money in, or put something off.');
  try {
    const plan2 = FIN.budgetPlan(all, { cats: finCats(), today, strategy: p.strategy, budgets: p.budgets }), mc = FIN.monthControl(all, plan2, { today, commitments: p.commitments });
    mc.over.slice(0, 3).forEach(o => A('over:' + o.id, 'crit', '🎯', `${o.name}: over budget`, '+' + fk(o.over), `this month, ${mc.daysLeft} day${mc.daysLeft === 1 ? '' : 's'} left`, 'budget'));
    mc.pace.slice(0, 2).forEach(o => A('pace:' + o.id, 'warn', '⏱️', `${o.name}: spending fast`, fk(o.projected), `on course for ${fk(o.projected)} against ${fk(o.budget)}`, 'budget'));
  } catch {}
  const from = FIN.addDays(today, -45);
  FIN.unusual(all.entries || []).filter(u => u.date >= from).slice(-3).forEach(u => { const t = FS.by.get(u.id) || {}; A('odd:' + u.id, 'warn', '🔎', 'Unusual payment', fk(u.amount), `${FIN.cleanDesc(t.desc || '')} · ${fday(u.date)} · ${u.times}× the usual ${(finCat(u.cat) || {}).name || ''}`, 'exp'); });
  plan.items.filter(i => i.late).slice(0, 2).forEach(i => A('late:' + i.id, 'warn', '🛍️', `${i.name} after the date you want`, fk(i.price), i.ready ? `ready ${fmon(i.ready)}` : 'not affordable yet', 'buy'));
  n.inst.filter(i => i.status === 'missing').slice(0, 2).forEach(i => A('miss:' + i.key, 'warn', '🧾', `${i.name} not seen lately`, fk(i.amount), `last ${fday(i.last)}`, 'credit'));
  n.accts.filter(x => ['current', 'savings'].includes(x.a.kind)).forEach(({ a, l }) => { if (!l.date) A('nobal:' + a.id, 'info', '✍️', `${a.name}: no balance yet`, '—', 'tell the canvas today’s balance, or add a statement', 'update'); else if (FIN.dnum(today) - FIN.dnum(l.date) > 35) A('old:' + a.id, 'info', '🕰️', `${a.name}: balance is old`, fk(l.balance), `last ${fday(l.date)}`, 'update'); });
  if (!out.some(a => a.sev !== 'info')) A('ok', 'ok', '✅', 'Nothing needs you right now', '', 'bills, budgets and cash all look fine', 'dash');
  const rank = { crit: 0, warn: 1, info: 2, ok: 3 }; out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  UI.fin.alerts = new Map(out.map(a => [a.id, a])); return out;
}
function finNextSum() { const al = finAlerts().filter(a => a.sev === 'crit' || a.sev === 'warn').length, up = finUpcoming(); return `${al ? al + ' need attention' : 'all clear'} · ${up.events.length} things in the next 60 days`; }
// the room: attention cards on top, then the next 60 days
function finNextLayout(r, x0, y, iw, cards, dets, subs, grid) {
  const al = finAlerts().map(a => ({ id: a.id, type: 'leaf', icon: a.icon, label: a.label, val: a.val, sub: a.sub, cls: 'alert ' + a.sev, act: { act: 'fin-cv-det', id: a.id } }));
  grid(al, x0, y, iw); y = subs.y2 + 4;
  const h = UI.fin.detH.up || 420; dets.push({ id: 'up', x: x0, y, w: iw, h }); return y + h;
}
function finAlertDetail(id) {
  const a = UI.fin.alerts && UI.fin.alerts.get(id); if (!a) return '';
  return `<p class="fin-al-sub">${esc(a.sub)}</p>${a.more ? `<p class="small">${esc(a.more)}</p>` : ''}<div class="row">${a.sec ? finBtn('fin-cv-sec', 'Open ' + esc(finSecLabel(a.sec)), { s: a.sec }) : ''}</div>`;
}
function finUpcomingHTML() {
  const up = finUpcoming(), today = finToday();
  const wk = d => { const days = FIN.dnum(d) - FIN.dnum(today); return days < 7 ? 'This week' : days < 14 ? 'Next week' : 'Later — ' + fmon(d.slice(0, 7)); };
  const groups = []; for (const e of up.events) { const g = wk(e.date); let G = groups.find(x => x.g === g); if (!G) groups.push(G = { g, ev: [] }); G.ev.push(e); }
  const icon = { income: '💼', bill: '🧾', instalment: '🔁', card: '💳', goal: '🛍️', event: '📅' };
  const chart = up.points.length > 1 ? finLines([{ name: 'Your cash (estimate)', pts: up.points.map(p => ({ k: p.date, v: p.bal, est: true, label: fday(p.date) })) }, { name: 'Safety reserve', cls: 'muted', pts: up.points.map(p => ({ k: p.date, v: up.reserve, label: fday(p.date) })) }], { title: 'cash ahead', h: 190, label: k => fday(k).replace(/\s\d{4}$/, '') }) : '<p class="small muted">Add balances or statements to see the cash line.</p>';
  return finKv([['Cash now', up.points.length ? fk(up.points[0].bal) : '—', 'your own money in the accounts'], ['Coming in', fk(up.cashIn), 'next 60 days'], ['Going out', fk(up.cashOut), 'bills, instalments, card bill'], ['Lowest point', up.low ? fk(up.low.bal) : '—', up.low ? fday(up.low.date) : ''], ['In 60 days', up.last !== null ? fk(up.last) : '—', 'if nothing else changes']])
    + `<div class="fin-up-grid"><div><h4>Cash in the coming weeks</h4>${chart}</div>
    <div class="fin-up-list">${groups.length ? groups.map(G => `<h4>${esc(G.g)}</h4>${G.ev.map(e => `<div class="fin-up-ev ${e.amount > 0 ? 'in' : e.amount < 0 ? 'out' : 'info'}"><span class="fin-up-d">${fday(e.date).replace(/\s\d{4}$/, '')}</span><span aria-hidden="true">${icon[e.kind] || '•'}</span><span class="fin-up-l">${esc(e.label)}${e.onCard ? ' <small class="fin-tag">on the card</small>' : ''}</span><b class="num">${e.amount ? fm(e.amount, null, { plus: true, dec: 0 }) : ''}</b></div>`).join('')}`).join('') : '<p class="small muted">Nothing known yet.</p>'}</div></div>`;
}

/* --- cash in your accounts, month by month (for the overview) --- */
function finCashMonthsHTML() {
  const p = finP(), all = finAll(), accts = p.accounts.filter(a => ['current', 'savings', 'cash'].includes(a.kind) && (!a.owner || a.owner === 'me'));
  const tx = finTx(), snaps = typeof finSnaps === 'function' ? finSnaps() : [];
  const rows = all.months.slice(-12).map(b => { const end = FIN.monthEnd(b.m); let sum = 0, known = 0;
    for (const a of accts) { const t = tx.filter(x => x.acct === a.id && typeof x.balance === 'number' && x.date <= end).sort((x, y) => x.date.localeCompare(y.date)).pop(), s = snaps.filter(x => x.acct === a.id && typeof x.balance === 'number' && x.date <= end).sort((x, y) => x.date.localeCompare(y.date)).pop();
      const v = s && (!t || s.date >= t.date) ? s.balance : t ? t.balance : null; if (v !== null) { sum += v; known++; } }
    return { k: b.m, v: known ? FIN.r2(sum) : null, label: fmon(b.m) }; });
  if (rows.filter(r => r.v !== null).length < 2) return '';
  return `<div class="fin-ov-chart"><h4>Cash in your accounts, month by month</h4>${finLines([{ name: 'Cash at month end', pts: rows }], { title: 'cash months', h: 160, label: k => fmon(k).split(' ')[0] })}</div>`;
}
// small trend lines inside the cards
function finAcctSpark(id) { const an = finAn({ from: null, to: null, acctIds: [id], catIds: null }); return (an.months || []).slice(-8).map(b => FIN.r2((b.inc || 0) - (b.exp || 0))); }
function finSparkSVG(vals, cls) {
  const v = (vals || []).filter(x => typeof x === 'number'); if (v.length < 2) return '';
  const lo = Math.min(...v, 0), hi = Math.max(...v, 0), span = hi - lo || 1, W = 100, H = 24;
  const pts = v.map((x, i) => `${(i / (v.length - 1) * W).toFixed(1)},${(H - (x - lo) / span * (H - 3) - 1.5).toFixed(1)}`);
  return `<svg class="fin-spark ${cls || ''}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="M0,${H} L${pts.join(' L')} L${W},${H} Z"/><path class="l" d="M${pts.join(' L')}"/></svg>`;
}

/* --- finding anything on the canvas, and jumping between rooms --- */
UI.fin.cvQ = ''; UI.fin.cvQi = 0;
function finCvToolsHTML() {
  const rooms = (UI.fin.cvRoomsList || []).filter(r => r.kind !== 'sec');
  return `<div class="fin-cv-find" role="search"><input class="input sm" id="fin-cv-q" type="search" placeholder="Find on the canvas…  ( / )" value="${esc(UI.fin.cvQ)}" aria-label="Find on the canvas" autocomplete="off"><span class="small muted" id="fin-cv-qn"></span></div>
    <select class="input sm fin-cv-goto" data-chg="fin-cv-goto-room" aria-label="Go to a room"><option value="">Go to…</option>${rooms.map(r => `<option value="${esc(r.id)}">${r.icon} ${esc(r.title)}</option>`).join('')}</select>
    ${typeof finCvModeHTML === 'function' ? finCvModeHTML() : ''}
    <button class="btn sm" data-act="fin-talk-win" aria-pressed="${!!UI.fin.talk.win}" title="Tell the canvas, in a window on it ( T )">💬 Tell the canvas</button>
    <button class="btn sm" data-act="fin-cv-help" aria-pressed="${!!UI.fin.help}" title="Keys and gestures ( ? )">?</button>`;
}
function finCvSearchApply() {
  const w = $('#fin-cv-world'), qn = $('#fin-cv-qn'); if (!w) return;
  const q = FIN.norm(UI.fin.cvQ || ''); w.classList.toggle('searching', !!q);
  let hits = []; w.querySelectorAll('.fin-cvn[data-node]').forEach(el => { const on = !!q && FIN.norm(el.textContent + ' ' + (el.getAttribute('title') || '')).includes(q); el.classList.toggle('hit', on); if (on) hits.push(el.dataset.node); });
  UI.fin.cvHits = hits;
  const ntx = q ? finTx().filter(t => FIN.norm(`${t.desc || ''} ${t.note || ''}`).includes(q)).length : 0;
  if (qn) qn.innerHTML = q ? `${hits.length} on the canvas${ntx ? ` · <button class="linkish" data-act="fin-cv-q-tx">${ntx} transaction${ntx === 1 ? '' : 's'}</button>` : ''}` : '';
}
document.addEventListener('input', e => { if (e.target && e.target.id === 'fin-cv-q') { UI.fin.cvQ = e.target.value; UI.fin.cvQi = 0; finCvSearchApply(); } });
document.addEventListener('keydown', e => {
  if (UI.view !== 'finance') return;
  const own = () => { e.preventDefault(); e.stopImmediatePropagation(); };   // the canvas's own keys: not also the app's
  if (e.target && e.target.id === 'fin-cv-q') {
    if (e.key === 'Enter') { e.preventDefault(); const h = UI.fin.cvHits || []; if (h.length) { const id = h[UI.fin.cvQi++ % h.length]; UI.fin.flash = { ids: new Set([id]), until: Date.now() + 1800 }; finCvGoto(id); document.querySelectorAll('.fin-cvn.fresh').forEach(x => x.classList.remove('fresh')); const el = document.querySelector(`.fin-cvn[data-node="${CSS.escape(id)}"]`); if (el) el.classList.add('fresh'); } }
    else if (e.key === 'Escape') { e.stopImmediatePropagation(); UI.fin.cvQ = ''; e.target.value = ''; finCvSearchApply(); e.target.blur(); }
    return;
  }
  // keys on the canvas (not while typing)
  if ((UI.fin.tab || 'canvas') !== 'canvas' || e.ctrlKey || e.metaKey || e.altKey || (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
  const k = e.key;
  if (k === '/') { own(); const q = $('#fin-cv-q'); if (q) q.focus(); else { UI.fin.cv.full = false; render(); setTimeout(() => { const x = $('#fin-cv-q'); if (x) x.focus(); }, 0); } }
  else if (k === 'f' || k === 'F') { own(); finCvFull(!UI.fin.cv.full); }
  else if (k === '0') { own(); UI.fin.cv.user = false; finCvGlide(); finCvFit(true); }
  else if (k === '+' || k === '=') { own(); finCvZoomSmooth(1.15); }
  else if (k === '-' || k === '_') { own(); finCvZoomSmooth(1 / 1.15); }
  else if (k === '?') { own(); UI.fin.help = !UI.fin.help; render(); }
  else if (k === 't' || k === 'T') { own(); finTalkWin(!UI.fin.talk.win); }
  else if ((k === 'b' || k === 'B') && typeof finBalWinHTML === 'function') { own(); UI.fin.balWin = !UI.fin.balWin; render(); }
  else if ((k === 'l' || k === 'L') && typeof finCvMode === 'function') { own(); finCvMode(FIN_CV_MODES[(FIN_CV_MODES.indexOf(UI.fin.cv.mode || 'mind') + 1) % FIN_CV_MODES.length]); }
  else if (/^Arrow(Left|Right|Up|Down)$/.test(k)) { e.preventDefault(); const d = e.shiftKey ? 420 : 160; FCAM.pan(k === 'ArrowLeft' ? d : k === 'ArrowRight' ? -d : 0, k === 'ArrowUp' ? d : k === 'ArrowDown' ? -d : 0); }   // glides
  else if (/^[1-9]$/.test(k)) { const r = (UI.fin.cvRoomsList || []).filter(x => x.kind !== 'sec')[+k - 1]; if (r) { own(); finCvZoomRoom(r.id); } }
}, true);
function finCvHelpHTML() {
  if (!UI.fin.help) return '';
  return `<div class="fin-cv-keys" role="dialog" aria-label="Keys and gestures"><div class="row"><b>Keys and gestures</b><span class="spacer"></span><button class="icon-btn" data-act="fin-cv-help" aria-label="Close">${I.x}</button></div>
    <dl>${[['Drag, or scroll', 'move around (let go while moving: it slides on)'], ['Right-click a card, or press and hold it', 'its menu — and Tell the canvas about that card only'], ['T', 'Tell the canvas, in a window'], ['L', 'next card layout: Rooms, Flow, Tree'], ['Arrow keys (Shift: further)', 'move around'], ['Ctrl + scroll, or pinch', 'zoom'], ['Tap a card', 'its details pop out'], ['Double-tap a card, or F2', 'edit it'], ['Double-click a room’s title', 'zoom to the room'], ['/', 'find on the canvas (Enter: next)'], ['1 – 9', 'jump to a room'], ['+  −  0', 'zoom in, out, fit'], ['F', 'full screen'], ['Esc', 'close the last thing opened']].map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl></div>`;
}
// zoom so a whole room fits the window
function finCvZoomRoom(id) {
  const vp = $('#fin-cv-vp'), b = UI.fin.cvPos && UI.fin.cvPos.get(id), cv = UI.fin.cv; if (!vp || !b) return;
  const W = vp.clientWidth, H = vp.clientHeight, k = Math.max(0.2, Math.min(1.1, (W - 40) / b.w, (H - 40) / b.h));
  finCvGlide(); cv.k = k; cv.x = (W - b.w * k) / 2 - b.x * k; cv.y = Math.max(20 - b.y * k, (H - b.h * k) / 2 - b.y * k); cv.user = true; finCvApply();
}
document.addEventListener('dblclick', e => { const t = e.target.closest && e.target.closest('#fin-cv-vp .fin-room-t'); if (!t) return; e.preventDefault(); clearTimeout(UI.fin.secT); finCvZoomRoom(t.dataset.node); });

/* --- the minimap: every room, and where you are --- */
function finCvMiniHTML() {
  const R = UI.fin.cvRoomsList || [], s = UI.fin.cvSize; if (!R.length || !s || UI.fin.miniOff) return UI.fin.miniOff ? `<button class="btn sm fin-cvmini-show" data-act="fin-mini" title="Show the minimap">🗺️</button>` : '';
  const k = Math.min(150 / s.w, 120 / s.h), W = Math.max(40, Math.round(s.w * k)), H = Math.max(30, Math.round(s.h * k));
  return `<div class="fin-cvmini" id="fin-mini" title="Click to go there" style="width:${W}px;height:${H}px" data-k="${k}"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" aria-hidden="true">
    ${R.map(r => `<rect x="${(r.x * k).toFixed(1)}" y="${(r.y * k).toFixed(1)}" width="${Math.max(2, r.w * k).toFixed(1)}" height="${Math.max(2, r.h * k).toFixed(1)}" rx="3" style="--h:${r.hue ?? 200}"/>`).join('')}
    <rect class="vpr" id="fin-mini-vp" x="0" y="0" width="10" height="10" rx="2"/></svg><button class="fin-cvmini-x" data-act="fin-mini" aria-label="Hide the minimap">×</button></div>`;
}
function finMiniPlace() {
  const m = $('#fin-mini-vp'), mini = $('#fin-mini'), vp = $('#fin-cv-vp'), cv = UI.fin.cv; if (!m || !mini || !vp) return;
  const k = +mini.dataset.k, x = -cv.x / cv.k * k, y = -cv.y / cv.k * k, w = vp.clientWidth / cv.k * k, h = vp.clientHeight / cv.k * k;
  m.setAttribute('x', x.toFixed(1)); m.setAttribute('y', y.toFixed(1)); m.setAttribute('width', Math.max(4, w).toFixed(1)); m.setAttribute('height', Math.max(4, h).toFixed(1));
}
document.addEventListener('pointerdown', e => {
  const mini = e.target.closest && e.target.closest('#fin-mini'); if (!mini || e.target.closest('button')) return;
  e.preventDefault(); const go = ev => { const r = mini.getBoundingClientRect(), k = +mini.dataset.k, vp = $('#fin-cv-vp'), cv = UI.fin.cv; if (!vp) return; const wx = (ev.clientX - r.left) / k, wy = (ev.clientY - r.top) / k; cv.x = vp.clientWidth / 2 - wx * cv.k; cv.y = vp.clientHeight / 2 - wy * cv.k; cv.user = true; finCvApply(); };
  go(e); const mv = ev => go(ev), up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); }; document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
});

HOOKS.afterRender.push(() => { if (UI.view !== 'finance') return; finCvSearchApply(); finMiniPlace(); });
Object.assign(ACT, {
  'fin-cv-help': () => { UI.fin.help = !UI.fin.help; render(); },
  'fin-mini': () => { UI.fin.miniOff = !UI.fin.miniOff; try { localStorage.setItem('ar-fin-mini', UI.fin.miniOff ? '0' : '1'); } catch {} render(); },
  'fin-cv-q-tx': () => { UI.fin.l = { ...UI.fin.l, q: UI.fin.cvQ, ids: null, page: 0 }; finOpen('ledger'); },
});
Object.assign(CHG, { 'fin-cv-goto-room': el => { const id = el.value; el.value = ''; if (id) finCvZoomRoom(id); } });
try { UI.fin.miniOff = localStorage.getItem('ar-fin-mini') === '0'; } catch {}
Object.assign(window.__FIN, { upcoming: () => finUpcoming(), alerts: () => finAlerts() });
