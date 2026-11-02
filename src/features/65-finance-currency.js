// Money — a currency beside every price or amount. Every money field in the canvas's forms (and in the Balances window)
// has a currency list beside it: your base currency first, then the currencies you use, then common ones. Choose another
// and a rate box appears ("1 USD = … EGP"), filled with the rate you saved before if there is one. The amount is changed
// into the account's / your base currency at YOUR rate — nothing is looked up online, nothing guessed: with no rate the
// form asks for one. A rate you type is kept (with its date) for next time, and the conversation says what was changed.

const FIN_MONEY_KEYS = new Set(['price', 'amount', 'balance', 'owed', 'limit', 'available', 'budget', 'target', 'saved', 'value', 'principal', 'outstanding']);
const FIN_COMMON_CUR = ['USD', 'EUR', 'SAR', 'AED', 'GBP', 'KWD', 'QAR'];
function finCurList(base) {
  const p = finP(), b = base || p.base;
  return [...new Set([b, p.base, ...p.accounts.map(a => a.currency).filter(Boolean), ...Object.keys(p.rates || {}), ...FIN_COMMON_CUR])].filter(c => /^[A-Z]{3}$/.test(c));
}
// value of 1 unit of `cur` in `to` — from your own rates only (each rate is "1 X = n base")
function finRate(cur, to) {
  const p = finP(), base = p.base, r = c => c === base ? 1 : +(p.rates || {})[c] > 0 ? +p.rates[c] : null;
  if (cur === to) return 1; const a = r(cur), b = r(to); return a && b ? a / b : null;
}
// the currency list and (for another currency) the rate box, for one field
function finCurPicker(scope, k, base, state) {
  const cur = (state || {})[k] || base, list = finCurList(base);
  return `<span class="fin-cur-pick"><select class="input sm fin-cur" data-chg="fin-cur" data-scope="${esc(scope)}" data-cur-k="${esc(k)}" aria-label="Currency">${list.map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select>${cur !== base ? `<input class="input sm num fin-cur-rate" data-rate-scope="${esc(scope)}" data-rate-k="${esc(k)}" placeholder="1 ${cur} = ? ${base}" value="${esc(((state || {})['rate:' + k]) ?? (finRate(cur, base) ? +finRate(cur, base).toFixed(4) : ''))}" inputmode="decimal" aria-label="1 ${cur} in ${base}">` : ''}</span>`;
}
// read the rate typed (or saved) for a field; keep a newly typed rate; null when there is none
function finCurApply(scope, k, amountStr, base, state) {
  const cur = (state || {})[k] || base; if (cur === base || amountStr === '' || amountStr === undefined) return { value: amountStr, note: '' };
  const box = document.querySelector(`[data-rate-scope="${CSS.escape(scope)}"][data-rate-k="${CSS.escape(k)}"]`), typed = box ? (FIN.parseNum(box.value) || {}).n : null;
  const rate = typed > 0 ? typed : finRate(cur, base); if (!(rate > 0)) return { error: `Enter the rate: 1 ${cur} = how many ${base}?` };
  const amt = (FIN.parseNum(String(amountStr)) || {}).n; if (amt === null || amt === undefined) return { value: amountStr, note: '' };
  if (typed > 0 && base === finP().base && Math.abs(typed - (finRate(cur, base) || 0)) > 1e-9) finSave(q => { q.rates = { ...(q.rates || {}), [cur]: typed }; q.rateDates = { ...(q.rateDates || {}), [cur]: finToday() }; });
  return { value: String(FIN.r2(amt * rate)), note: `${cur} ${amt.toLocaleString('en-US', { maximumFractionDigits: 2 })} at ${rate} = ${fm(FIN.r2(amt * rate), base)}` };
}
Object.assign(CHG, { 'fin-cur': el => {
  const scope = el.dataset.scope, k = el.dataset.curK;
  if (scope === 'ed' && UI.fin.cvEdit) { const E0 = UI.fin.cvEdit; document.querySelectorAll('#fin-cv-ed [data-k]').forEach(i => { E0.v[i.dataset.k] = i.value; }); E0.cur = { ...(E0.cur || {}), [k]: el.value }; }
  else if (scope.startsWith('bal:')) { UI.fin.balCur = { ...(UI.fin.balCur || {}), [scope.slice(4) + ':' + k]: el.value }; }
  render(); setTimeout(() => { const r = document.querySelector(`[data-rate-scope="${CSS.escape(scope)}"][data-rate-k="${CSS.escape(k)}"]`); if (r && !r.value) r.focus(); }, 30);
} });
