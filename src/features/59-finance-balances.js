// Money canvas — a floating tab for today's balances. A small tab on the canvas ("🏦 Balances · 3 days ago") asks for
// your accounts' balances — it glows when one is more than a day old. It opens a window over the canvas with every
// account: what was last known, and a box for what the bank shows now (owed and available for the card and Halan).
// Save (or Enter) records them exactly as Balances & history does — each new figure compared with the last one and
// with the transactions since, anything unexplained settled or asked about — so every card, total and channel on
// every layout (Mind map, Rich Dad, Flow, Financial freedom) follows at once. The change is presented on the canvas
// and has Undo, like any other.

const finBalKinds = ['current', 'savings', 'credit_card', 'bnpl', 'cash', 'investment'];
// how old the newest of your balances is, in days (null: none yet)
function finBalAge() {
  const n = finNow(), today = finToday(), ds = n.accts.filter(x => finBalKinds.includes(x.a.kind)).map(x => x.l && x.l.date).filter(Boolean);
  if (!ds.length) return null;
  const oldest = ds.sort()[0]; return Math.max(0, Math.round((Date.parse(today) - Date.parse(oldest)) / 864e5));
}
function finBalTabHTML() {
  if (UI.fin.balWin || UI.fin.pop) return '';   // out of the way while a card is open
  const age = finBalAge(), stale = age === null || age >= 1;
  return `<button class="fin-bal-tab${stale ? ' ask' : ''}" data-act="fin-bal-win" title="Enter your accounts' balances ( B )"><span aria-hidden="true">🏦</span> Balances<small>${age === null ? 'none yet — add them' : age === 0 ? 'up to date' : age === 1 ? 'oldest is from yesterday' : `oldest is ${age} days old`}</small></button>`;
}
function finBalWinHTML() {
  if (!UI.fin.balWin) return '';
  const n = finNow(), U = UI.fin.daily = UI.fin.daily || { date: finToday(), v: {} }, rows = n.accts.filter(x => finBalKinds.includes(x.a.kind));
  const field = (id, k, label) => `<label class="fin-bal-f"><span>${label}</span><input class="input num sm" data-chg="fin-daily" data-id="${esc(id)}" data-k="${k}" value="${esc((U.v[id] || {})[k] ?? '')}" inputmode="decimal" enterkeyhint="done" aria-label="${esc(label)}"></label>`;
  const last = (a, l) => !l.date ? 'no balance yet' : (a.kind === 'credit_card' || a.kind === 'bnpl' ? `${typeof l.owed === 'number' ? 'owes ' + fk(l.owed) : ''}${l.available !== null && l.available !== undefined ? ' · ' + fk(l.available) + ' available' : ''}` : typeof l.balance === 'number' ? fk(l.balance) : '—') + ` · ${fday(l.date)}`;
  return `<section class="fin-talk-win fin-bal-win" id="fin-bal-win" role="dialog" aria-label="Today's balances">
    <div class="fin-talk-win-h"><span aria-hidden="true">🏦</span><b>Today’s balances</b><span class="spacer"></span><label class="small">as of <input class="input sm" type="date" data-chg="fin-daily-date" value="${esc(U.date)}"></label>
      <button class="icon-btn" data-act="fin-bal-win" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b"><p class="small muted">Type what each bank app shows now — only the ones you checked. Everything on the canvas follows.</p>
      <div class="fin-bal-rows">${rows.map(({ a, l }) => `<div class="fin-bal-r"><div class="fin-bal-n"><b>${esc(a.name)}</b><small>last: ${esc(last(a, l))}</small></div>
        <div class="fin-bal-in">${a.kind === 'credit_card' || a.kind === 'bnpl' ? field(a.id, 'outstanding', 'Owed') + field(a.id, 'available', 'Available') : field(a.id, 'balance', 'Balance')}</div></div>`).join('')}</div>
      <div class="row end"><button class="btn ghost" data-act="fin-bal-win" data-v="close">Cancel</button><button class="btn primary" data-act="fin-bal-save">Save balances</button></div></div></section>`;
}
function finBalSave() {
  // the box you are typing in lets go first: its last value counts, and a redraw cannot report it again later
  if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#fin-bal-win')) document.activeElement.blur();
  const U = UI.fin.daily; if (!U || !Object.values(U.v || {}).some(v => Object.values(v).some(x => String(x ?? '').trim() !== ''))) { toast('Type at least one balance.', { err: true }); return; }
  const before = typeof finChangeIndex === 'function' ? finChangeIndex() : null, snap = finSnapshot();
  finDailyCheck(); const P = (UI.fin.daily.preview || []).slice(); if (!P.length) return;
  finDailySave();
  // a line in the conversation, with Undo — and the change presented across the canvas
  const line = 'Balances: ' + P.map(r => `${r.name} ${r.balance !== null && r.balance !== undefined ? fm(r.balance) : r.outstanding !== null && r.outstanding !== undefined ? 'owes ' + fm(r.outstanding) : fm(r.available)}`).join(' · ');
  const m = { id: E.uid('tk'), at: nowISO(), who: 'edit', text: line, undoable: true }; UI.fin.undo.set(m.id, snap); finTalkPush(m);
  UI.fin.balWin = false; UI.fin.fixTried.clear();
  if (before && typeof finPresent === 'function') finPresent(before, P.map(r => 'a:' + r.id));
  render();
}
Object.assign(ACT, {
  'fin-bal-win': el => { UI.fin.balWin = el.dataset.v === 'close' ? false : !UI.fin.balWin; render(); if (UI.fin.balWin) setTimeout(() => { const i = document.querySelector('#fin-bal-win input[data-chg="fin-daily"]'); if (i) i.focus(); }, 30); },
  'fin-bal-save': () => finBalSave(),
});
// Enter in a balance saves; Esc closes
document.addEventListener('keydown', e => {
  if (!UI.fin.balWin || UI.view !== 'finance') return;
  if (e.key === 'Escape') { e.stopPropagation(); UI.fin.balWin = false; render(); return; }
  const w = e.target.closest && e.target.closest('#fin-bal-win'); if (!w) return;
  if (e.key === 'Enter' && e.target.matches('input[data-chg="fin-daily"]')) { e.preventDefault(); CHG['fin-daily'](e.target); setTimeout(() => ACT['fin-bal-save'](), 0); }
}, true);
Object.assign(window.__FIN, { balAge: () => finBalAge() });
