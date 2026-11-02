// Money — "Additional expenses": at most ONE box per month, open from the 1st. Whenever a balance you enter for a bank or
// cash account is lower than your transactions explain, the difference lands in that month's box (no question, no new
// line each time): the box grows with every drop and keeps each one (date, account, balance before → after). Open it to
// say where the money went — split across as many categories as needed (or "moved to my other account", "someone else's
// money", which are not spending); what you have not explained yet stays "not explained yet" and counts as spending.
// One record per month (id xe-YYYY-MM) in your transactions, so every canvas, total and forecast follows it.

const FIN_XE_KINDS = ['current', 'savings', 'cash'];
const finXeId = m => 'xe-' + m;
const finXeAll = () => finTx().filter(t => (t.flags || []).includes('extra_box')).sort((a, b) => b.date.localeCompare(a.date));
const finXeGet = id => { finTx(); return FS.by.get(id) || null; };
const finXeOpen = t => FIN.r2((t.parts || []).filter(p => p.open).reduce((s, p) => s - p.amount, 0));   // not explained yet (positive)
const finXeTotal = t => FIN.r2(-t.amount);
// the parts: what you explained, then what is still open
function finXeParts(explained, total) {
  const done = explained.filter(p => Math.abs(p.amount) >= 0.005).map(p => ({ amount: -Math.abs(FIN.r2(p.amount)), cat: p.cat, note: p.note || '' }));
  const rest = FIN.r2(total - done.reduce((s, p) => s - p.amount, 0));
  return [...done, ...(rest >= 0.005 ? [{ amount: -rest, cat: 'other_exp', open: true }] : [])];
}
// a drop: added to the month's box (made on the first drop of the month)
function finXeAdd(acct, date, amount, info = {}) {
  if (!(amount < 0)) return null;
  const m = date.slice(0, 7), id = finXeId(m), old = finXeGet(id), a = finAcct(acct) || {};
  const t = old ? clone(old) : { id, acct, date, desc: `Additional expenses — ${fmon(m)}`, amount: 0, currency: a.currency || finP().base, cat: 'other_exp', catSrc: 'manual', flags: ['from_balance', 'extra_box'], manual: true, src: { f: '', manual: true }, createdAt: nowISO(), drops: [], parts: [], hist: [] };
  t.drops = [...(t.drops || []), { acct, date, amount: FIN.r2(amount), at: nowISO(), from: info.from || null, prev: info.prev ?? null, now: info.now ?? null }];
  t.amount = FIN.r2((t.amount || 0) + amount); if (date > t.date) t.date = date;
  const explained = (t.parts || []).filter(p => !p.open);
  if (info.cat && info.cat !== 'other_exp') explained.push({ amount, cat: info.cat, note: info.note || '' });
  t.parts = finXeParts(explained, finXeTotal(t));
  t.hist = [...(t.hist || []), { at: nowISO(), f: 'amount', from: old ? old.amount : null, to: t.amount, why: `${a.name || 'an account'} was ${fm(-amount)} lower than its transactions explain (${fday(date)})` }];
  finWrite([t]); return t;
}
// your explanation: the parts you give replace the earlier ones; the rest stays open
function finXeSplit(id, rows) {
  const t0 = finXeGet(id); if (!t0) return 'This box is gone.';
  const total = finXeTotal(t0), clean = rows.filter(r => r.cat && +r.amount > 0), sum = FIN.r2(clean.reduce((s, r) => s + +r.amount, 0));
  if (rows.some(r => (r.cat && !(+r.amount > 0)) || (!r.cat && +r.amount > 0))) return 'Give each line a category and an amount.';
  if (sum > total + 0.005) return `That is ${fm(sum)} — more than the ${fm(total)} in this box.`;
  const snap = finSnapshot(), before = typeof finChangeIndex === 'function' ? finChangeIndex() : null, t = clone(t0);
  t.parts = finXeParts(clean.map(r => ({ amount: +r.amount, cat: r.cat, note: r.note || '' })), total);
  t.hist = [...(t.hist || []), { at: nowISO(), f: 'parts', to: t.parts.filter(p => !p.open).map(p => `${(finCat(p.cat) || { name: p.cat }).name} ${fm(-p.amount)}`).join(', ') || 'nothing explained', why: 'you explained where it went' }];
  finWrite([t]);
  const open = finXeOpen(t), line = `${t.desc}: ${clean.length ? clean.map(r => `${(finCat(r.cat) || { name: r.cat }).name} ${fm(+r.amount)}`).join(' · ') : 'explanation cleared'}${open ? ` — ${fm(open)} not explained yet` : ' — all explained'}`;
  const m = { id: E.uid('tk'), at: nowISO(), who: 'edit', text: line, undoable: true }; UI.fin.undo.set(m.id, snap); finTalkPush(m);
  UI.fin.xeEdit = null; if (before && typeof finPresent === 'function') finPresent(before, ['xe']); render(); return '';
}

// the box on the canvas: this month's, under Spending (and the earlier months' to explain)
function finXeRoom() {
  const cur = finToday().slice(0, 7), t = finXeGet(finXeId(cur)), open = t ? finXeOpen(t) : 0;
  return { id: 'xe', kind: 'box', sys: true, icon: '🧩', title: `Additional expenses — ${fmon(cur)}`, hue: 30, branch: 'exp',
    sum: t ? `${fk(finXeTotal(t))} from 1 ${fmon(cur).split(' ')[0]}${open ? ` · ${fk(open)} not explained yet` : ' · all explained'}` : `nothing unexplained since 1 ${fmon(cur).split(' ')[0]}` };
}
function finXeCatName(c) { return c === 'other_exp' ? 'Not explained yet' : (finCat(c) || { name: c }).name; }
function finXeBoxHTML(t, big) {
  const total = finXeTotal(t), open = finXeOpen(t), done = FIN.r2(total - open), pct = total ? Math.round(done / total * 100) : 100;
  const logo = n => typeof finLogo === 'function' ? finLogo(n, 'sm') : '';
  return `<div class="fin-xe-box ${open ? 'open' : 'done'}">
    ${finKv([['In this box', fk(total), `${(t.drops || []).length} lower balance${(t.drops || []).length === 1 ? '' : 's'} since the 1st`], ['Explained', fk(done), `${pct}%`], ['Not explained yet', fk(open), open ? 'counts as spending until you say' : 'nothing left']])}
    <div class="fin-xe-bar" role="img" aria-label="${pct}% explained"><i style="width:${pct}%"></i></div>
    <h4>Where it went</h4><div class="fin-box-list">${(t.parts || [{ amount: t.amount, cat: t.cat, open: true }]).map(p => `<div class="${p.open ? 'open' : ''}"><span><b>${esc(finXeCatName(p.cat))}</b>${p.note ? `<small>${esc(p.note)}</small>` : p.open ? '<small>tap “Explain” to say where it went</small>' : ''}</span><b class="num">${fk(-p.amount)}</b></div>`).join('')}</div>
    <div class="row"><button class="btn ${open ? 'primary' : ''} sm" data-act="fin-xe" data-id="${esc(t.id)}">✎ ${open ? 'Explain where it went' : 'Change the explanation'}</button></div>
    ${big ? `<h4>How it got here</h4><div class="fin-box-list">${(t.drops || []).slice().reverse().map(d => { const a = finAcct(d.acct) || { name: d.acct }; return `<div>${logo(a.name)}<span><b>${esc(a.name)}</b><small>${fday(d.date)}${typeof d.prev === 'number' && typeof d.now === 'number' ? ` · ${fk(d.prev)} expected → ${fk(d.now)} you entered` : ''}</small></span><b class="num">${fk(-d.amount)}</b></div>`; }).join('')}</div>` : ''}
  </div>`;
}
function finXeHTML() {
  const cur = finToday().slice(0, 7), t = finXeGet(finXeId(cur)), earlier = finXeAll().filter(x => x.id !== finXeId(cur));
  return `<div class="fin-xe">${t ? finXeBoxHTML(t, true) : `<p class="small">Nothing unexplained since 1 ${esc(fmon(cur).split(' ')[0])}. When a balance you enter for a bank or cash account is lower than your transactions explain, the difference lands here — one box for the whole month — and you can say where it went, split across categories.</p><div class="row"><button class="btn sm" data-act="fin-bal-win">🏦 Enter today’s balances</button></div>`}
    ${earlier.length ? `<h4>Earlier months</h4><div class="fin-box-list">${earlier.slice(0, 6).map(x => { const o = finXeOpen(x); return `<div class="${o ? 'open' : ''}"><span><b>${esc(fmon(x.id.slice(3)))}</b><small>${o ? `${fk(o)} not explained yet` : 'all explained'}</small></span><b class="num">${fk(finXeTotal(x))}</b><button class="btn sm ghost" data-act="fin-xe" data-id="${esc(x.id)}">✎ Explain</button></div>`; }).join('')}</div>` : ''}
    ${finXeAcctsHTML()}
    <p class="small muted">Only bank and cash accounts. A drop matched by the same rise in another of your accounts is a transfer and never lands here. Nothing is guessed: what you do not explain stays “not explained yet”.</p></div>`;
}

// at the bottom of the box: each account's net balance now (what a card or Halan owes counts against you), and the total
function finXeAcctsHTML() {
  const n = finNow(), rows = n.accts.filter(x => !x.a.owner || x.a.owner === 'me').map(({ a, l }) => {
    const credit = a.kind === 'credit_card' || a.kind === 'bnpl', v = credit ? (typeof l.owed === 'number' ? -l.owed : null) : (typeof l.balance === 'number' ? l.balance : null);
    return { a, v, credit, when: l.date ? fday(l.date) + (l.since ? ` · ${l.since.n} transaction${l.since.n === 1 ? '' : 's'} since` : '') : '' }; });
  const known = rows.filter(r => r.v !== null), net = FIN.r2(known.reduce((s, r) => s + r.v, 0)), logo = t => typeof finLogo === 'function' ? finLogo(t, 'sm') : '';
  return `<h4>Your accounts now — net balance</h4><div class="fin-box-list fin-xe-accts">${rows.map(r => `<div class="${r.v === null ? 'muted' : ''}">${logo(r.a.name)}<span><b>${esc(r.a.name)}</b><small>${r.v === null ? 'no balance yet' : `${r.credit ? 'owed' : 'balance'} · ${r.when}`}</small></span><b class="num ${r.v !== null && r.v < 0 ? 'fin-neg' : ''}">${r.v === null ? '—' : fk(r.v)}</b></div>`).join('')}
    <div class="tot"><span><b>Net across your accounts</b><small>${known.length} of ${rows.length} with a balance${n.held > 0 ? ` · includes ${fk(n.held)} you hold for others` : ''}</small></span><b class="num ${net < 0 ? 'fin-neg' : ''}">${fk(net)}</b></div></div>`;
}
// the window: split the box across categories
function finXeCats() {
  const cats = finCats(), spend = cats.filter(c => c.kind === 'expense' && c.id !== 'other_exp' && c.id !== 'cc_unitem'), not = cats.filter(c => ['transfer', 'savings', 'held'].includes(c.id));
  return { spend, not };
}
function finXeWinHTML() {
  const E0 = UI.fin.xeEdit; if (!E0) return ''; const t = finXeGet(E0.id); if (!t) return '';
  const total = finXeTotal(t), { spend, not } = finXeCats();
  const opt = (c, sel) => `<option value="${esc(c.id)}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`;
  const sum = FIN.r2(E0.rows.reduce((s, r) => s + (+r.amount > 0 ? +r.amount : 0), 0)), left = FIN.r2(total - sum);
  return `<section class="fin-talk-win fin-xe-win" id="fin-xe-win" role="dialog" aria-label="Explain ${esc(t.desc)}">
    <div class="fin-talk-win-h"><span aria-hidden="true">🧩</span><b>Where did ${fk(total)} go?</b><span class="spacer"></span><button class="icon-btn" data-act="fin-xe" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b fin-xe-w">
      <p class="small">${esc(t.desc)} · ${(t.drops || []).length} lower balance${(t.drops || []).length === 1 ? '' : 's'}. Split it across as many categories as you need; what you leave stays “not explained yet”.</p>
      <div class="fin-xe-rows">${E0.rows.map((r, i) => `<div class="fin-xe-row">
        <select class="input sm" data-chg="fin-xe-row" data-i="${i}" data-k="cat" aria-label="Category"><option value="">Category…</option><optgroup label="Spending">${spend.map(c => opt(c, r.cat)).join('')}</optgroup><optgroup label="Not spending">${not.map(c => opt(c, r.cat)).join('')}</optgroup></select>
        <input class="input sm num" data-chg="fin-xe-row" data-i="${i}" data-k="amount" value="${esc(r.amount ?? '')}" placeholder="Amount" inputmode="decimal" aria-label="Amount">
        <input class="input sm" data-chg="fin-xe-row" data-i="${i}" data-k="note" value="${esc(r.note || '')}" placeholder="Note (optional)" aria-label="Note">
        <button class="icon-btn" data-act="fin-xe-del" data-i="${i}" aria-label="Remove this line">${I.x}</button></div>`).join('')}</div>
      <div class="row"><button class="btn sm ghost" data-act="fin-xe-add">＋ Another category</button><button class="btn sm ghost" data-act="fin-xe-rest">Put whatever is left on the last line</button></div>
      <p class="fin-xe-left ${left < -0.004 ? 'neg' : ''}" id="fin-xe-left">${left < -0.004 ? `${fk(-left)} more than the box holds` : left > 0.004 ? `${fk(left)} not explained yet` : 'All of it explained ✓'}</p>
      <div class="row end"><button class="btn ghost" data-act="fin-xe" data-v="close">Cancel</button><button class="btn primary" data-act="fin-xe-save">Save</button></div>
    </div></section>`;
}
const finXeLeftNow = () => { const E0 = UI.fin.xeEdit, t = E0 && finXeGet(E0.id), el = document.getElementById('fin-xe-left'); if (!t || !el) return; const left = FIN.r2(finXeTotal(t) - E0.rows.reduce((s, r) => s + (+r.amount > 0 ? +r.amount : 0), 0));
  el.className = 'fin-xe-left' + (left < -0.004 ? ' neg' : ''); el.textContent = left < -0.004 ? `${fm(-left)} more than the box holds` : left > 0.004 ? `${fm(left)} not explained yet` : 'All of it explained ✓'; };
Object.assign(ACT, {
  'fin-xe': el => { if (el.dataset.v === 'close') { UI.fin.xeEdit = null; render(); return; } const t = finXeGet(el.dataset.id); if (!t) return;
    const rows = (t.parts || []).filter(p => !p.open).map(p => ({ cat: p.cat, amount: String(-p.amount), note: p.note || '' }));
    UI.fin.xeEdit = { id: t.id, rows: rows.length ? rows : [{ cat: '', amount: String(finXeOpen(t) || ''), note: '' }] }; render(); },
  'fin-xe-add': () => { const E0 = UI.fin.xeEdit; if (!E0) return; E0.rows.push({ cat: '', amount: '', note: '' }); render(); },
  'fin-xe-del': el => { const E0 = UI.fin.xeEdit; if (!E0) return; E0.rows.splice(+el.dataset.i, 1); if (!E0.rows.length) E0.rows.push({ cat: '', amount: '', note: '' }); render(); },
  'fin-xe-rest': () => { const E0 = UI.fin.xeEdit, t = E0 && finXeGet(E0.id); if (!t) return; const r = E0.rows[E0.rows.length - 1], others = E0.rows.slice(0, -1).reduce((s, x) => s + (+x.amount > 0 ? +x.amount : 0), 0); r.amount = String(FIN.r2(finXeTotal(t) - others)); render(); },
  'fin-xe-save': () => { const E0 = UI.fin.xeEdit; if (!E0) return; if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#fin-xe-win')) document.activeElement.blur();
    const err = finXeSplit(E0.id, E0.rows.map(r => ({ cat: r.cat, amount: (FIN.parseNum(String(r.amount || '')) || {}).n, note: r.note }))); if (err) toast(err, { err: true }); },
});
Object.assign(CHG, { 'fin-xe-row': el => { const E0 = UI.fin.xeEdit; if (!E0 || !E0.rows[+el.dataset.i]) return; E0.rows[+el.dataset.i][el.dataset.k] = el.value; finXeLeftNow(); } });
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('#fin-xe-win [data-chg="fin-xe-row"][data-k="amount"]')) CHG['fin-xe-row'](e.target); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.fin.xeEdit && UI.view === 'finance') { UI.fin.xeEdit = null; render(); } }, true);
Object.assign(window.__FIN, { xe: m => { const t = finXeGet(finXeId(m || finToday().slice(0, 7))); return t ? { id: t.id, total: finXeTotal(t), open: finXeOpen(t), parts: (t.parts || []).map(p => [p.cat, -p.amount, !!p.open]), drops: (t.drops || []).map(d => [d.acct, d.date, d.amount]) } : null; }, xeAll: () => finXeAll().map(t => t.id) });
