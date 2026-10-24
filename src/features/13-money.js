/* ---------- Money: income and expenses, budgets, recurring items, bank statements, receipts, expense claims ---------- */
addCols('money');
VIEWS.push('money');
UI.mon = { tab: 'overview', month: new Date().toISOString().slice(0, 7), q: '', kind: '', cat: '', imp: null, rcpt: null, edit: null };

const MON_CATS = {
  expense: ['Food & groceries', 'Transport & fuel', 'Housing & rent', 'Utilities', 'Phone & internet', 'Health', 'Education', 'Family', 'Shopping', 'Eating out', 'Entertainment', 'Travel', 'Work expenses', 'Gifts & charity', 'Fees & charges', 'Savings & investments', 'Other'],
  income: ['Salary', 'Bonus', 'Overtime', 'Allowance', 'Freelance / consulting', 'Expense claim paid', 'Refund', 'Investment income', 'Gift', 'Other income'],
};
const MON_CURR = ['EGP', 'USD', 'EUR', 'SAR', 'AED', 'KWD', 'QAR', 'GBP'];
const monPrefs = () => ({ currency: 'EGP', rates: {}, accounts: ['Cash', 'Bank', 'Card'], cats: { expense: [], income: [] }, budgets: {}, rules: [], recurring: [], ...(St.cols.prefs.get('money') || {}) });
const monSave = mut => { const p = clone(monPrefs()); mut(p); colPut('prefs', { ...p, id: 'money' }); };
const monCats = kind => [...new Set([...(MON_CATS[kind] || []), ...((monPrefs().cats || {})[kind] || [])])];
const monTx = () => colList('money').filter(x => x && x.date && !x.deleted);
// amounts in the main currency; a transaction in another currency needs a rate (Setup in Money › Budgets)
function monBase(x) {
  const p = monPrefs(); if (!x.currency || x.currency === p.currency) return +x.amount || 0;
  const r = +(p.rates || {})[x.currency]; return r > 0 ? (+x.amount || 0) * r : null;
}
function monFmt(v, cur) {
  cur = cur || monPrefs().currency;
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2 }).format(v); }
  catch { return `${(+v).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${cur}`; }
}
const monMonthLabel = m => fmtDate(m + '-15', { month: 'long', year: 'numeric' });
const monAddMonths = (m, n) => { const d = new Date(m + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return d.toISOString().slice(0, 7); };

/* --- numbers and dates as banks write them --- */
const AR_DIGITS = s => String(s).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
function monNum(v) {
  if (typeof v === 'number') return v;
  let s = AR_DIGITS(v).trim(); if (!s || s === '-') return null;
  const neg = /^\(.*\)$/.test(s) || /^-|-$|\bDR\b|\bdebit\b/i.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return null;
  // "1.234,50" (comma decimal) vs "1,234.50"
  if (/,\d{1,2}$/.test(s) && (s.match(/\./g) || []).length !== 1) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = parseFloat(s); return isNaN(n) ? null : neg ? -n : n;
}
function monDate(v, order) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10); // Excel serial
  const s = AR_DIGITS(v).trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(s);
  if (m) { let [a, b, y] = [+m[1], +m[2], +m[3]]; if (y < 100) y += 2000; const [d, mo] = order === 'mdy' ? [b, a] : [a, b]; if (mo > 12 || d > 31) return null; return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
  m = /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-,]*(\d{2,4})/.exec(s);
  if (m) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].slice(0, 3).toLowerCase()) / 3 + 1; let y = +m[3]; if (y < 100) y += 2000; if (mo > 0) return `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  const t = Date.parse(s); return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}
// dd/mm or mm/dd: decided once per statement from the values that can only be one of them
function monDateOrder(vals) {
  let dmy = 0, mdy = 0;
  for (const v of vals) { const m = /^(\d{1,2})[-/.](\d{1,2})[-/.]\d{2,4}/.exec(AR_DIGITS(v || '').trim()); if (!m) continue; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; }
  return mdy > dmy ? 'mdy' : 'dmy';
}

/* --- categories: your rules, then what you chose for the same payee before --- */
const monKey = s => E.normMatch(String(s || '').replace(/\d{3,}/g, ' ')).trim();
function monGuess(desc, kind) {
  const d = E.normMatch(desc || '');
  for (const r of monPrefs().rules || []) if (r.word && d.includes(E.normMatch(r.word)) && (!r.kind || r.kind === kind)) return r.category;
  const k = monKey(desc); if (!k) return '';
  const hit = monTx().filter(x => x.kind === kind && x.category && monKey(x.payee) === k).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  if (hit) return hit.category;
  const BUILTIN = [[/uber|careem|didi|indrive|fuel|petrol|benzin|بنزين|gas station|wataniya|chillout|total ?energies|metro|parking/i, 'Transport & fuel'], [/carrefour|spinneys|hyper|kazyon|oscar|seoudi|metro market|grocery|supermarket|بقال|خضار/i, 'Food & groceries'], [/talabat|elmenus|mcdonald|kfc|starbucks|cafe|coffee|restaurant|pizza|مطعم/i, 'Eating out'], [/vodafone|orange|etisalat|e&|we\b|telecom|internet|fiber/i, 'Phone & internet'], [/electric|كهرباء|water|مياه|gas bill|غاز/i, 'Utilities'], [/pharma|صيدلي|hospital|clinic|doctor|lab\b|dental/i, 'Health'], [/school|university|course|udemy|coursera|tuition/i, 'Education'], [/amazon|noon|jumia|shein|ikea|mall/i, 'Shopping'], [/netflix|spotify|shahid|osn|cinema|playstation|steam/i, 'Entertainment'], [/fee|charge|commission|عمولة|رسوم|interest/i, 'Fees & charges'], [/salary|payroll|راتب|مرتب/i, 'Salary'], [/rent|إيجار|ايجار/i, 'Housing & rent'], [/airline|egyptair|hotel|booking\.com|airbnb|flydubai/i, 'Travel']];
  for (const [re, c] of BUILTIN) if (re.test(desc || '') && monCats(kind).includes(c)) return c;
  return '';
}

/* --- recurring items (salary, rent, subscriptions) are added on their day --- */
function monRecurDue(r, today) {
  const out = []; let d = r.start || today;
  for (let i = 0; i < 400 && d <= today; i++) {
    if (!r.last || d > r.last) out.push(d);
    if (r.freq === 'weekly') d = E.addDays(d, 7);
    else if (r.freq === 'yearly') d = String(+d.slice(0, 4) + 1) + d.slice(4);
    else { const m = monAddMonths(d.slice(0, 7), 1); const day = Math.min(+r.day || +d.slice(8), new Date(+m.slice(0, 4), +m.slice(5), 0).getDate()); d = `${m}-${String(day).padStart(2, '0')}`; }
  }
  return out;
}
function monRunRecurring() {
  const p = monPrefs(), today = T(); let changed = false;
  for (const r of p.recurring || []) {
    if (r.paused || !(+r.amount > 0)) continue;
    for (const d of monRecurDue(r, today)) {
      const id = 'mr_' + r.id + '_' + d.replace(/-/g, '');
      if (!St.cols.money.has(id)) colPut('money', { id, kind: r.kind, date: d, amount: +r.amount, currency: r.currency || p.currency, category: r.category, payee: r.payee, account: r.account || '', note: 'Recurring', recurringId: r.id, createdAt: nowISO() });
      r.last = d; changed = true;
    }
  }
  if (changed) colPut('prefs', { ...p, id: 'money' });
}
HOOKS.afterRender.push(() => { if (UI.view === 'money' && !UI.mon.recurRan && St.ready) { UI.mon.recurRan = true; setTimeout(monRunRecurring, 0); } });

/* --- the view --- */
const MON_TABS = [['overview', '📊 Overview'], ['list', '📋 Transactions'], ['budgets', '🎯 Budgets'], ['recurring', '🔁 Recurring'], ['import', '🏦 Bank statement'], ['receipts', '🧾 Receipts'], ['claims', '💼 Expense claims']];
VIEW_FN.money = () => `<div class="wrap money">
  <div class="page-head"><div><h1>Money</h1><div class="sub">Your income and expenses, budgets, salary and bills that repeat, bank statements, receipts and work expenses to claim back.</div></div>
    <div class="row"><button class="btn primary" data-act="mon-new" data-kind="expense">${I.plus} Expense</button><button class="btn" data-act="mon-new" data-kind="income">${I.plus} Income</button></div></div>
  <div class="seg tabs" role="tablist">${MON_TABS.map(([k, l]) => `<button role="tab" data-act="mon-tab" data-tab="${k}" aria-pressed="${UI.mon.tab === k}">${l}</button>`).join('')}</div>
  ${({ overview: monOverview, list: monList, budgets: monBudgets, recurring: monRecurring, import: monImport, receipts: monReceipts, claims: monClaims }[UI.mon.tab] || monOverview)()}
</div>`;
function monMonthPicker() {
  return `<div class="row mon-month"><button class="icon-btn" data-act="mon-month" data-d="-1" aria-label="Previous month">‹</button><b>${esc(monMonthLabel(UI.mon.month))}</b><button class="icon-btn" data-act="mon-month" data-d="1" aria-label="Next month">›</button></div>`;
}
function monMonthModel(month) {
  const rows = monTx().filter(x => x.date.slice(0, 7) === month);
  let inc = 0, exp = 0, noRate = 0; const byCat = {};
  for (const x of rows) { const v = monBase(x); if (v === null) { noRate++; continue; } if (x.kind === 'income') inc += v; else { exp += v; byCat[x.category || 'Other'] = (byCat[x.category || 'Other'] || 0) + v; } }
  return { rows, inc, exp, net: inc - exp, byCat, noRate };
}
function monOverview() {
  const p = monPrefs(), M = monMonthModel(UI.mon.month), prev = monMonthModel(monAddMonths(UI.mon.month, -1));
  const months = Array.from({ length: 12 }, (_, i) => monAddMonths(UI.mon.month, i - 11));
  const series = months.map(m => ({ m, ...monMonthModel(m) }));
  const budgets = Object.entries(p.budgets || {}).filter(([, v]) => +v > 0);
  const tile = (label, v, sub, cls = '') => `<div class="card pad mon-tile ${cls}"><span class="label">${esc(label)}</span><b>${esc(monFmt(v))}</b>${sub ? `<span class="small muted">${esc(sub)}</span>` : ''}</div>`;
  const delta = (a, b) => b ? `${a >= b ? '▲' : '▼'} ${Math.abs(Math.round((a - b) / b * 100))}% vs last month` : '';
  const claimOpen = monTx().filter(x => x.claim && !x.claimPaid).reduce((s, x) => s + (monBase(x) || 0), 0);
  if (!monTx().length) return `${monMonthPicker()}<section class="card pad empty-state"><h2>Start with what you earn and spend</h2><p class="muted">Add an expense or income with the buttons above, add your salary and rent once under Recurring, or import a bank statement (CSV or Excel). A photo of a receipt can be read for you under Receipts.</p><div class="row"><button class="btn" data-act="mon-tab" data-tab="recurring">🔁 Add salary and bills</button><button class="btn" data-act="mon-tab" data-tab="import">🏦 Import a statement</button></div></section>`;
  return `${monMonthPicker()}
    <div class="mon-tiles">${tile('Income', M.inc, delta(M.inc, prev.inc))}${tile('Expenses', M.exp, delta(M.exp, prev.exp))}${tile('Left over', M.net, M.inc > 0 ? `${Math.round(M.net / M.inc * 100)}% of income saved` : '', M.net < 0 ? 'neg' : 'pos')}${claimOpen ? tile('To claim from work', claimOpen, 'work expenses not paid back yet') : ''}</div>
    ${M.noRate ? callout('warn', `<p>${M.noRate} transaction${M.noRate > 1 ? 's are' : ' is'} in another currency without an exchange rate, so not counted. Add the rate under Budgets.</p>`) : ''}
    ${budgets.length ? `<section class="card pad"><div class="section-title"><h2>Budgets this month</h2></div><div class="mon-budgets">${budgets.map(([c, v]) => { const used = M.byCat[c] || 0, pct = Math.round(used / v * 100); return `<div class="mon-bud"><div class="row"><b>${esc(c)}</b><span class="spacer"></span><span class="small ${pct >= 100 ? 'crit' : pct >= 80 ? 'warn' : 'muted'}">${esc(monFmt(used))} of ${esc(monFmt(+v))} · ${pct}%</span></div><div class="progress"><i style="width:${Math.min(100, pct)}%;${pct >= 100 ? 'background:var(--crit)' : pct >= 80 ? 'background:var(--warn)' : ''}"></i></div></div>`; }).join('')}</div></section>` : ''}
    <div class="grid2 mon-charts">
      <section class="card pad"><div class="section-title"><h2>Where the money went</h2></div>${barList(Object.entries(M.byCat).sort((a, b) => b[1] - a[1]).map(([label, v]) => ({ label, v: Math.round(v) })), 'Expenses per category', p.currency)}</section>
      <section class="card pad"><div class="section-title"><h2>Last 12 months</h2></div>${columnChart(series.map(s => ({ label: monMonthLabel(s.m), short: fmtDate(s.m + '-15', { month: 'short' }), v: Math.round(s.exp), tip: `${monMonthLabel(s.m)}: spent ${monFmt(s.exp)}, earned ${monFmt(s.inc)}` })), 'Expenses per month', p.currency)}</section>
    </div>
    <section class="card pad"><div class="section-title"><h2>Latest this month</h2><span class="spacer"></span><button class="btn ghost sm" data-act="mon-tab" data-tab="list">All transactions</button></div>${monTable(M.rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8))}</section>
    <div class="row"><button class="btn" data-act="mon-export">⬇ Excel (all transactions)</button></div>`;
}
function monTable(rows, opts = {}) {
  if (!rows.length) return '<p class="small muted" style="margin:0">Nothing here yet.</p>';
  return `<div class="mon-scroll"><table class="tbl mon-tbl"><thead><tr>${opts.pick ? '<th></th>' : ''}<th>Date</th><th>Description</th><th>Category</th><th>Account</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rows.map(x => `<tr class="${x.kind}">
    ${opts.pick ? `<td><input type="checkbox" data-chg="mon-claim-pick" data-id="${esc(x.id)}" ${UI.mon.claimSel && UI.mon.claimSel.has(x.id) ? 'checked' : ''} aria-label="Select"></td>` : ''}
    <td class="nowrap">${esc(fmtDate(x.date))}</td><td dir="auto">${esc(x.payee || '')}${x.note && x.note !== 'Recurring' ? `<div class="small muted" dir="auto">${esc(E.clip(x.note, 80))}</div>` : ''}${x.project ? ` <span class="chip proj">${esc(x.project)}</span>` : ''}${x.claim ? ` <span class="chip ${x.claimPaid ? 'ok' : 'warn'}">${x.claimPaid ? 'Claim paid' : x.claimedAt ? 'Claimed' : 'To claim'}</span>` : ''}${x.recurringId ? ' <span class="chip">Recurring</span>' : ''}</td>
    <td>${esc(x.category || '—')}</td><td>${esc(x.account || '')}</td>
    <td class="num nowrap ${x.kind === 'income' ? 'pos' : ''}">${x.kind === 'income' ? '+' : '−'}${esc(monFmt(+x.amount, x.currency))}</td>
    <td class="nowrap">${x.receiptId ? `<button class="icon-btn" data-act="mon-receipt-open" data-id="${esc(x.id)}" aria-label="Open receipt" title="Receipt">🧾</button>` : ''}<button class="icon-btn" data-act="mon-edit" data-id="${esc(x.id)}" aria-label="Edit">✎</button></td></tr>`).join('')}</tbody></table></div>`;
}
function monList() {
  const q = E.normMatch(UI.mon.q || '');
  const rows = monTx().filter(x => (!UI.mon.kind || x.kind === UI.mon.kind) && (!UI.mon.cat || x.category === UI.mon.cat) && (UI.mon.all || x.date.slice(0, 7) === UI.mon.month) && (!q || E.normMatch([x.payee, x.note, x.category, x.project, x.account].join(' ')).includes(q))).sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const tot = rows.reduce((s, x) => { const v = monBase(x); if (v !== null) s[x.kind] += v; return s; }, { income: 0, expense: 0 });
  return `${UI.mon.all ? '' : monMonthPicker()}
    <div class="toolbar row"><label class="search">${I.search}<input class="input" id="mon-q" type="search" placeholder="Search description, category, project…" value="${esc(UI.mon.q)}" data-chg="mon-f" data-f="q"></label>
      <select class="input" data-chg="mon-f" data-f="kind" aria-label="Type"><option value="">Income and expenses</option><option value="expense" ${UI.mon.kind === 'expense' ? 'selected' : ''}>Expenses</option><option value="income" ${UI.mon.kind === 'income' ? 'selected' : ''}>Income</option></select>
      <select class="input" data-chg="mon-f" data-f="cat" aria-label="Category"><option value="">All categories</option>${[...monCats('expense'), ...monCats('income')].map(c => `<option ${UI.mon.cat === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
      <label class="check small"><input type="checkbox" data-chg="mon-f" data-f="all" ${UI.mon.all ? 'checked' : ''}>All months</label></div>
    <section class="card pad"><div class="row small muted">${rows.length} transaction${rows.length === 1 ? '' : 's'} · in ${esc(monFmt(tot.income))} · out ${esc(monFmt(tot.expense))}<span class="spacer"></span><button class="btn sm" data-act="mon-export">⬇ Excel</button></div>${monTable(rows)}</section>`;
}

/* --- add / edit --- */
function monForm(x) {
  const p = monPrefs(), kind = x.kind || 'expense', cats = monCats(kind);
  return `<div class="card mon-form" role="dialog" aria-label="${kind === 'income' ? 'Income' : 'Expense'}">
    <div class="row"><b>${x.id && St.cols.money.has(x.id) ? 'Edit' : 'New'} ${kind === 'income' ? 'income' : 'expense'}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <div class="seg"><button data-act="mon-kind" data-kind="expense" aria-pressed="${kind === 'expense'}">Expense</button><button data-act="mon-kind" data-kind="income" aria-pressed="${kind === 'income'}">Income</button></div>
    <div class="grid2">
      <label class="field"><span>Amount</span><div class="row" style="gap:6px"><input class="input" id="mf-amount" inputmode="decimal" value="${x.amount ?? ''}" style="flex:1" autofocus><select class="input" id="mf-cur" style="width:auto">${[...new Set([p.currency, ...MON_CURR, x.currency].filter(Boolean))].map(c => `<option ${(x.currency || p.currency) === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div></label>
      <label class="field"><span>Date</span><input class="input" id="mf-date" type="date" value="${esc(x.date || T())}"></label>
      <label class="field"><span>${kind === 'income' ? 'From' : 'Paid to / what'}</span><input class="input" id="mf-payee" value="${esc(x.payee || '')}" dir="auto" data-chg="mon-payee"></label>
      <label class="field"><span>Category</span><input class="input" id="mf-cat" list="mf-cats" value="${esc(x.category || '')}"><datalist id="mf-cats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span>Account</span><input class="input" id="mf-acc" list="mf-accs" value="${esc(x.account || '')}"><datalist id="mf-accs">${(p.accounts || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span>Project (for work expenses)</span><input class="input" id="mf-proj" list="mf-projs" value="${esc(x.project || '')}"><datalist id="mf-projs">${projectsList().map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    </div>
    <label class="field"><span>Note</span><input class="input" id="mf-note" value="${esc(x.note || '')}" dir="auto"></label>
    ${kind === 'expense' ? `<label class="check small"><input type="checkbox" id="mf-claim" ${x.claim ? 'checked' : ''}>Work expense — I will claim it back from the company</label>` : ''}
    <div class="row"><label class="btn sm" for="mf-file">🧾 ${x.receiptId ? 'Replace receipt' : 'Attach receipt'}</label><input id="mf-file" type="file" accept="image/*,application/pdf" hidden data-chg="mon-file">${x.receiptId || UI.mon.edit.file ? `<span class="small muted">${esc((UI.mon.edit.file && UI.mon.edit.file.name) || x.receiptName || 'Receipt attached')}</span>` : ''}</div>
    <div class="row">${x.id && St.cols.money.has(x.id) ? `<button class="btn ghost danger" data-act="mon-del" data-id="${esc(x.id)}">${I.trash} Delete</button>` : ''}<span class="spacer"></span><button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="mon-save">Save</button></div>
  </div>`;
}
function monOpenForm(x) { UI.mon.edit = { x: { ...x }, file: UI.mon.edit && UI.mon.edit.keepFile ? UI.mon.edit.file : null }; const m = $('#modal'); m.innerHTML = deco(monForm(UI.mon.edit.x)); m.hidden = false; const a = $("#mf-amount"); if (a) a.focus(); }
function monFormRead() {
  const v = id => (($('#' + id) || {}).value || '').trim();
  return { ...UI.mon.edit.x, amount: monNum(v('mf-amount')), currency: v('mf-cur'), date: v('mf-date'), payee: v('mf-payee'), category: v('mf-cat'), account: v('mf-acc'), project: v('mf-proj'), note: v('mf-note'), claim: !!($('#mf-claim') || {}).checked };
}
async function monSaveForm() {
  const x = monFormRead();
  if (!(x.amount > 0) && !(x.amount < 0)) { toast('Enter the amount.', { err: true }); return; }
  if (x.amount < 0) x.amount = -x.amount;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(x.date)) { toast('Enter the date.', { err: true }); return; }
  x.id = x.id || E.uid('mn'); x.createdAt = x.createdAt || nowISO();
  if (!x.category) x.category = monGuess(x.payee, x.kind) || (x.kind === 'income' ? 'Other income' : 'Other');
  if (!x.claim) { delete x.claimedAt; delete x.claimPaid; }
  const f = UI.mon.edit.file;
  if (f) { const rid = 'rc_' + x.id; await FILES.save('receipts', rid, f.bytes, { name: f.name, txId: x.id }); x.receiptId = rid; x.receiptName = f.name; }
  // a new category you typed is remembered
  if (!monCats(x.kind).includes(x.category)) monSave(p => { p.cats = p.cats || { expense: [], income: [] }; (p.cats[x.kind] = p.cats[x.kind] || []).push(x.category); });
  colPut('money', x); $('#modal').hidden = true; UI.mon.edit = null; UI.mon.month = x.date.slice(0, 7);
  toast(`${x.kind === 'income' ? 'Income' : 'Expense'} saved: ${monFmt(x.amount, x.currency)}.`); render();
}
Object.assign(ACT, {
  'mon-tab': el => { UI.mon.tab = el.dataset.tab; render(); },
  'mon-month': el => { UI.mon.month = monAddMonths(UI.mon.month, +el.dataset.d); render(); },
  'mon-new': el => monOpenForm({ kind: el.dataset.kind, date: T(), currency: monPrefs().currency }),
  'mon-edit': el => { const x = St.cols.money.get(el.dataset.id); if (x) monOpenForm(x); },
  'mon-kind': el => { const x = monFormRead(); x.kind = el.dataset.kind; if (!monCats(x.kind).includes(x.category)) x.category = ''; UI.mon.edit.x = x; UI.mon.edit.keepFile = true; monOpenForm(x); },
  'mon-save': () => monSaveForm().catch(e => toast('Not saved: ' + (e.message || e), { err: true })),
  'mon-del': el => { const x = St.cols.money.get(el.dataset.id); if (!x) return; colDel('money', x.id); if (x.receiptId) FILES.remove('receipts', x.receiptId).catch(() => {}); $('#modal').hidden = true; toast('Deleted.'); render(); },
  'mon-receipt-open': el => { const x = St.cols.money.get(el.dataset.id); if (x && x.receiptId) FILES.open('receipts', x.receiptId, x.receiptName || 'receipt'); },
  'mon-export': () => monExport().catch(e => toast('Export failed: ' + (e.message || e), { err: true })),
});
Object.assign(CHG, {
  'mon-f': el => { UI.mon[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; render(); },
  'mon-payee': el => { const c = $('#mf-cat'); if (c && !c.value) c.value = monGuess(el.value, UI.mon.edit.x.kind || 'expense'); },
  'mon-file': async el => { const f = el.files[0]; if (!f) return; const x = monFormRead(); UI.mon.edit = { x, file: { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }, keepFile: true }; monOpenForm(x); },
});
async function monExport() {
  const X = await E.need('xlsx'), p = monPrefs();
  const rows = monTx().sort((a, b) => a.date.localeCompare(b.date)).map(x => ({ Date: x.date, Type: x.kind === 'income' ? 'Income' : 'Expense', Description: x.payee || '', Category: x.category || '', Account: x.account || '', Project: x.project || '', Amount: (x.kind === 'income' ? 1 : -1) * (+x.amount || 0), Currency: x.currency || p.currency, [`Amount (${p.currency})`]: monBase(x) === null ? '' : (x.kind === 'income' ? 1 : -1) * monBase(x), Note: x.note || '', 'Work expense': x.claim ? (x.claimPaid ? 'paid back' : x.claimedAt ? 'claimed' : 'to claim') : '' }));
  const wb = X.utils.book_new(); const ws = X.utils.json_to_sheet(rows); ws['!cols'] = [12, 9, 36, 20, 12, 18, 12, 9, 14, 30, 12].map(w => ({ wch: w }));
  X.utils.book_append_sheet(wb, ws, 'Transactions');
  const months = [...new Set(monTx().map(x => x.date.slice(0, 7)))].sort();
  const cats = [...new Set(monTx().filter(x => x.kind === 'expense').map(x => x.category || 'Other'))].sort();
  const sum = months.map(m => { const M = monMonthModel(m); const r = { Month: m, Income: Math.round(M.inc * 100) / 100, Expenses: Math.round(M.exp * 100) / 100, 'Left over': Math.round(M.net * 100) / 100 }; for (const c of cats) r[c] = Math.round((M.byCat[c] || 0) * 100) / 100; return r; });
  X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sum), 'By month');
  await offerFile(`money-${T()}.xlsx`, new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* --- budgets, currency, rules --- */
function monBudgets() {
  const p = monPrefs(), M = monMonthModel(UI.mon.month);
  return `<section class="card pad"><div class="section-title"><h2>Monthly budget per category</h2></div>
      <p class="small muted" style="margin:0">Leave empty for no budget. The Overview shows how much of each is used; at 80% and 100% you get a note there.</p>
      <div class="mon-bud-edit">${monCats('expense').map(c => `<label class="field"><span>${esc(c)} <span class="muted small">· ${esc(monFmt(M.byCat[c] || 0))} this month</span></span><input class="input hold-render" inputmode="decimal" value="${esc((p.budgets || {})[c] || '')}" data-chg="mon-budget" data-c="${esc(c)}"></label>`).join('')}</div></section>
    <section class="card pad"><div class="section-title"><h2>Currency and accounts</h2></div>
      <div class="grid2"><label class="field"><span>Main currency</span><select class="input" data-chg="mon-pref" data-k="currency">${[...new Set([p.currency, ...MON_CURR])].map(c => `<option ${p.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
      <label class="field"><span>Accounts (comma separated)</span><input class="input hold-render" value="${esc((p.accounts || []).join(', '))}" data-chg="mon-pref" data-k="accounts"></label></div>
      <p class="small muted" style="margin:0">Exchange rates — how many ${esc(p.currency)} one unit is worth (used for totals; update them when you like):</p>
      <div class="row">${MON_CURR.filter(c => c !== p.currency).map(c => `<label class="field" style="width:120px"><span>1 ${c} =</span><input class="input hold-render" inputmode="decimal" value="${esc((p.rates || {})[c] || '')}" data-chg="mon-rate" data-c="${c}" placeholder="${esc(p.currency)}"></label>`).join('')}</div></section>
    <section class="card pad"><div class="section-title"><h2>Category rules</h2></div>
      <p class="small muted" style="margin:0">When the description contains a word, use a category (for bank statements and new entries). Otherwise the app uses what you chose last time for the same payee.</p>
      ${(p.rules || []).map((r, i) => `<div class="row"><input class="input hold-render" value="${esc(r.word)}" placeholder="description contains…" data-chg="mon-rule" data-i="${i}" data-k="word"><span>→</span><input class="input hold-render" list="mon-allcats" value="${esc(r.category)}" data-chg="mon-rule" data-i="${i}" data-k="category"><button class="icon-btn" data-act="mon-rule-del" data-i="${i}" aria-label="Delete rule">${I.x}</button></div>`).join('')}
      <datalist id="mon-allcats">${[...monCats('expense'), ...monCats('income')].map(c => `<option value="${esc(c)}">`).join('')}</datalist>
      <div class="row"><button class="btn sm" data-act="mon-rule-add">${I.plus} Add rule</button></div></section>`;
}
Object.assign(CHG, {
  'mon-budget': el => monSave(p => { p.budgets = p.budgets || {}; const v = monNum(el.value); if (v > 0) p.budgets[el.dataset.c] = v; else delete p.budgets[el.dataset.c]; }),
  'mon-rate': el => monSave(p => { p.rates = p.rates || {}; const v = monNum(el.value); if (v > 0) p.rates[el.dataset.c] = v; else delete p.rates[el.dataset.c]; }),
  'mon-pref': el => { monSave(p => { p[el.dataset.k] = el.dataset.k === 'accounts' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value; }); render(); },
  'mon-rule': el => monSave(p => { p.rules[+el.dataset.i][el.dataset.k] = el.value.trim(); }),
});
Object.assign(ACT, {
  'mon-rule-add': () => { monSave(p => { p.rules = [...(p.rules || []), { word: '', category: '' }]; }); render(); },
  'mon-rule-del': el => { monSave(p => { p.rules.splice(+el.dataset.i, 1); }); render(); },
});

/* --- recurring --- */
function monRecurring() {
  const p = monPrefs(), list = p.recurring || [];
  return `<section class="card pad"><div class="section-title"><h2>Salary, rent, bills and subscriptions</h2></div>
    <p class="small muted" style="margin:0">Each is added to your transactions on its day (also for days the app was closed). Change one entry in Transactions if a month was different.</p>
    ${list.length ? `<table class="tbl"><thead><tr><th>Type</th><th>Description</th><th>Category</th><th class="num">Amount</th><th>Every</th><th>Day</th><th>From</th><th></th></tr></thead><tbody>${list.map(r => `<tr>
      <td><select class="input" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="kind"><option value="expense" ${r.kind === 'expense' ? 'selected' : ''}>Expense</option><option value="income" ${r.kind === 'income' ? 'selected' : ''}>Income</option></select></td>
      <td><input class="input hold-render" value="${esc(r.payee || '')}" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="payee" dir="auto"></td>
      <td><input class="input hold-render" list="mon-rc-cats" value="${esc(r.category || '')}" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="category"></td>
      <td><input class="input hold-render num" inputmode="decimal" value="${esc(r.amount || '')}" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="amount" style="width:110px"></td>
      <td><select class="input" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="freq">${[['monthly', 'Month'], ['weekly', 'Week'], ['yearly', 'Year']].map(([k, l]) => `<option value="${k}" ${r.freq === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><input class="input hold-render" type="number" min="1" max="31" value="${esc(r.day || '')}" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="day" style="width:64px"></td>
      <td><input class="input hold-render" type="date" value="${esc(r.start || '')}" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="start"></td>
      <td class="nowrap"><label class="check small"><input type="checkbox" data-chg="mon-rc" data-id="${esc(r.id)}" data-k="paused" ${r.paused ? 'checked' : ''}>Paused</label><button class="icon-btn" data-act="mon-rc-del" data-id="${esc(r.id)}" aria-label="Delete">${I.x}</button></td></tr>`).join('')}</tbody></table><datalist id="mon-rc-cats">${[...monCats('expense'), ...monCats('income')].map(c => `<option value="${esc(c)}">`).join('')}</datalist>` : ''}
    <div class="row"><button class="btn sm" data-act="mon-rc-add" data-kind="income" data-cat="Salary" data-payee="Salary">${I.plus} Salary</button><button class="btn sm" data-act="mon-rc-add" data-kind="expense" data-cat="Housing & rent" data-payee="Rent">${I.plus} Rent</button><button class="btn sm" data-act="mon-rc-add" data-kind="expense" data-cat="Phone & internet" data-payee="Mobile and internet">${I.plus} Bill</button><button class="btn sm" data-act="mon-rc-add" data-kind="expense" data-cat="" data-payee="">${I.plus} Other</button><span class="spacer"></span><button class="btn sm primary" data-act="mon-rc-run">Add what is due now</button></div></section>`;
}
Object.assign(ACT, {
  'mon-rc-add': el => { const today = T(); monSave(p => { p.recurring = [...(p.recurring || []), { id: E.uid('rc'), kind: el.dataset.kind, payee: el.dataset.payee, category: el.dataset.cat, amount: '', freq: 'monthly', day: +today.slice(8), start: today, currency: p.currency }]; }); render(); },
  'mon-rc-del': el => { monSave(p => { p.recurring = (p.recurring || []).filter(r => r.id !== el.dataset.id); }); render(); },
  'mon-rc-run': () => { const n = monTx().length; monRunRecurring(); const added = monTx().length - n; toast(added ? `${added} recurring item${added > 1 ? 's' : ''} added.` : 'Nothing is due.'); render(); },
});
Object.assign(CHG, {
  'mon-rc': el => {
    monSave(p => { const r = (p.recurring || []).find(x => x.id === el.dataset.id); if (!r) return; const k = el.dataset.k;
      r[k] = el.type === 'checkbox' ? el.checked : k === 'amount' ? monNum(el.value) : k === 'day' ? Math.max(1, Math.min(31, +el.value || 1)) : el.value;
      if (k === 'start' && el.value) { r.day = +el.value.slice(8); delete r.last; } if (k === 'amount') delete r.last; });
  },
});

/* --- bank statement (CSV / Excel) --- */
function monImport() {
  const s = UI.mon.imp;
  if (!s) return `<section class="card pad"><div class="section-title"><h2>Import a bank or card statement</h2></div>
      <p class="small muted" style="margin:0">Download the statement from your online banking as CSV or Excel (most Egyptian and Gulf banks offer it under “Statements” or “Export”), then choose it here. The app finds the date, description and amount columns; you check them before anything is added. Lines already imported are skipped.</p>
      <div class="row"><label class="btn primary" for="mon-imp-file">${I.upload} Choose statement</label><input id="mon-imp-file" type="file" accept=".csv,.xlsx,.xls,.txt" hidden data-chg="mon-imp-file"></div></section>`;
  const cols = s.header.map((h, i) => `<option value="${i}">${esc(h || 'Column ' + (i + 1))}</option>`).join('');
  const sel = (k, label, opt) => `<label class="field"><span>${label}</span><select class="input" data-chg="mon-imp-map" data-k="${k}">${opt ? '<option value="-1">—</option>' : ''}${cols.replace(`value="${s.map[k]}"`, `value="${s.map[k]}" selected`)}</select></label>`;
  const rows = monImpRows();
  const n = rows.filter(r => r.pick && !r.dup).length;
  return `<section class="card pad"><div class="section-title"><h2>${esc(s.name)}</h2><span class="spacer"></span><button class="btn ghost sm" data-act="mon-imp-cancel">Cancel</button></div>
    <div class="grid2 mon-imp-map">${sel('date', 'Date')}${sel('desc', 'Description')}${sel('amount', 'Amount (+ in, − out)', true)}${sel('debit', 'Or: money out (debit)', true)}${sel('credit', 'Or: money in (credit)', true)}
      <label class="field"><span>Dates are written</span><select class="input" data-chg="mon-imp-map" data-k="order"><option value="dmy" ${s.map.order === 'dmy' ? 'selected' : ''}>day/month/year</option><option value="mdy" ${s.map.order === 'mdy' ? 'selected' : ''}>month/day/year</option></select></label>
      <label class="field"><span>Account</span><input class="input" list="mon-imp-accs" value="${esc(s.account || '')}" data-chg="mon-imp-map" data-k="account"><datalist id="mon-imp-accs">${(monPrefs().accounts || []).map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
      <label class="field"><span>Currency</span><select class="input" data-chg="mon-imp-map" data-k="currency">${[...new Set([monPrefs().currency, ...MON_CURR])].map(c => `<option ${s.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
    ${s.map.amount < 0 && s.map.debit < 0 && s.map.credit < 0 ? callout('warn', '<p>Choose the amount column, or the debit and credit columns.</p>') : ''}
    <div class="row small"><span>${rows.length} lines · ${rows.filter(r => r.dup).length} already imported · ${rows.filter(r => !r.category && !r.dup).length} without a category</span><span class="spacer"></span>${St.sample && rows.some(r => !r.category && !r.dup) ? `<button class="btn sm" data-act="mon-imp-ai" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Sorting…' : '✨ Sort the rest with AI'}</button>` : ''}<button class="btn sm primary" data-act="mon-imp-go" ${n ? '' : 'disabled'}>Add ${n} transaction${n === 1 ? '' : 's'}</button></div>
    <div class="mon-imp-wrap"><table class="tbl mon-tbl"><thead><tr><th></th><th>Date</th><th>Description</th><th>Category</th><th class="num">Amount</th></tr></thead><tbody>${rows.slice(0, 500).map((r, i) => `<tr class="${r.kind} ${r.dup ? 'dup' : ''}">
      <td><input type="checkbox" data-chg="mon-imp-pick" data-i="${i}" ${r.pick && !r.dup ? 'checked' : ''} ${r.dup || !r.ok ? 'disabled' : ''} aria-label="Import this line"></td>
      <td class="nowrap">${r.date ? esc(fmtDate(r.date)) : `<span class="crit">${esc(String(r.rawDate || '?'))}</span>`}</td><td dir="auto">${esc(r.desc)}${r.dup ? ' <span class="chip">already imported</span>' : ''}</td>
      <td><input class="input hold-render" list="mon-imp-cats-${r.kind}" value="${esc(r.category)}" data-chg="mon-imp-cat" data-i="${i}" ${r.dup ? 'disabled' : ''}></td>
      <td class="num nowrap ${r.kind === 'income' ? 'pos' : ''}">${r.amount === null ? '?' : (r.kind === 'income' ? '+' : '−') + esc(monFmt(r.amount, s.currency))}</td></tr>`).join('')}</tbody></table>
      <datalist id="mon-imp-cats-expense">${monCats('expense').map(c => `<option value="${esc(c)}">`).join('')}</datalist><datalist id="mon-imp-cats-income">${monCats('income').map(c => `<option value="${esc(c)}">`).join('')}</datalist></div></section>`;
}
// header row = the first row with a date-like and an amount-like column name (statements start with account details)
function monImpParse(name, grid) {
  grid = grid.map(r => (r || []).map(c => (c === null || c === undefined ? '' : c)));
  const isH = r => r.some(c => /date|تاريخ|value d|posting|transaction d/i.test(String(c))) && r.some(c => /amount|debit|credit|مدين|دائن|المبلغ|withdraw|deposit/i.test(String(c)));
  let h = grid.findIndex(isH); if (h < 0) h = 0;
  const header = grid[h].map(String), body = grid.slice(h + 1).filter(r => r.some(c => String(c).trim()));
  const find = re => header.findIndex(c => re.test(c));
  const map = { date: Math.max(0, find(/^(transaction |posting |value )?date|تاريخ/i)), desc: find(/descr|details|narrat|particular|memo|merchant|payee|البيان|الوصف|تفاصيل/i), amount: find(/^amount|المبلغ|^value$/i), debit: find(/debit|withdraw|out|مدين|سحب/i), credit: find(/credit|deposit|\bin\b|دائن|إيداع|ايداع/i) };
  if (map.desc < 0) map.desc = header.findIndex((_, i) => i !== map.date && body.slice(0, 20).some(r => /[a-zA-Z؀-ۿ]{3,}/.test(String(r[i]))));
  if (map.desc < 0) map.desc = map.date === 0 ? 1 : 0;
  if (map.debit >= 0 || map.credit >= 0) map.amount = -1;
  map.order = monDateOrder(body.map(r => r[map.date]));
  const cur = MON_CURR.find(c => grid.slice(0, h + 3).flat().some(x => new RegExp('\\b' + c + '\\b').test(String(x)))) || monPrefs().currency;
  return { name, header, body, map, currency: cur, account: /card|visa|master/i.test(name) ? 'Card' : 'Bank', cats: {}, picks: {} };
}
function monImpRows() {
  const s = UI.mon.imp, m = s.map;
  const seen = new Set(monTx().map(x => `${x.date}|${Math.round(x.amount * 100)}|${monKey(x.payee)}`));
  return s.body.map((r, i) => {
    let amount = null, kind = 'expense';
    if (m.amount >= 0) { const v = monNum(r[m.amount]); if (v !== null) { amount = Math.abs(v); kind = v >= 0 ? 'income' : 'expense'; } }
    else { const d = m.debit >= 0 ? monNum(r[m.debit]) : null, c = m.credit >= 0 ? monNum(r[m.credit]) : null; if (c) { amount = Math.abs(c); kind = 'income'; } else if (d) { amount = Math.abs(d); kind = 'expense'; } }
    const date = monDate(r[m.date], m.order), desc = String(r[m.desc] || '').replace(/\s+/g, ' ').trim();
    const dup = !!(date && amount !== null && seen.has(`${date}|${Math.round(amount * 100)}|${monKey(desc)}`));
    const category = s.cats[i] !== undefined ? s.cats[i] : monGuess(desc, kind);
    const ok = !!(date && amount);
    return { i, date, rawDate: r[m.date], desc, amount, kind, category, dup, ok, pick: ok && s.picks[i] !== false };
  });
}
async function monImpFile(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const X = await E.need('xlsx');
  const wb = /\.csv$|\.txt$/i.test(f.name) ? X.read(new TextDecoder().decode(bytes), { type: 'string', raw: true }) : X.read(bytes, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  UI.mon.imp = monImpParse(f.name, grid); render();
}
async function monImpAI() {
  const s = UI.mon.imp; const rows = monImpRows().filter(r => !r.category && !r.dup && r.ok).slice(0, 150);
  if (!rows.length || !St.sample) return;
  s.busy = true; render();
  try {
    const prompt = `Put each bank statement line into one category. Expense categories: ${JSON.stringify(monCats('expense'))}. Income categories: ${JSON.stringify(monCats('income'))}. Use "" when you cannot tell.\nLines (i, type, description):\n${rows.map(r => `${r.i}\t${r.kind}\t${r.desc}`).join('\n')}\nAnswer JSON: {"items":[{"i":0,"category":"…"}]}`;
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    for (const it of (r && r.items) || []) { const row = rows.find(x => x.i === +it.i); if (row && monCats(row.kind).includes(it.category)) s.cats[row.i] = it.category; }
  } catch (e) { toast('Sorting failed: ' + (e.message || e.code), { err: true }); }
  s.busy = false; render();
}
Object.assign(CHG, {
  'mon-imp-file': el => { const f = el.files[0]; if (f) monImpFile(f).catch(e => toast('Could not read the statement: ' + (e.message || e), { err: true })); },
  'mon-imp-map': el => { const k = el.dataset.k; if (['account', 'currency'].includes(k)) UI.mon.imp[k] = el.value; else UI.mon.imp.map[k] = k === 'order' ? el.value : +el.value; render(); },
  'mon-imp-pick': el => { UI.mon.imp.picks[+el.dataset.i] = el.checked; render(); },
  'mon-imp-cat': el => { UI.mon.imp.cats[+el.dataset.i] = el.value.trim(); },
});
Object.assign(ACT, {
  'mon-imp-cancel': () => { UI.mon.imp = null; render(); },
  'mon-imp-ai': () => monImpAI(),
  'mon-imp-go': () => {
    const s = UI.mon.imp; let n = 0;
    for (const r of monImpRows()) if (r.pick && !r.dup) { colPut('money', { id: E.uid('mn'), kind: r.kind, date: r.date, amount: r.amount, currency: s.currency, category: r.category || (r.kind === 'income' ? 'Other income' : 'Other'), payee: r.desc, account: s.account, note: '', source: s.name, createdAt: nowISO() }); n++; }
    UI.mon.imp = null; UI.mon.tab = 'list'; UI.mon.all = true; toast(`${n} transaction${n === 1 ? '' : 's'} added from the statement.`); render();
  },
});

/* --- receipts: a photo or PDF is read for the amount, date and shop --- */
function monReceipts() {
  const r = UI.mon.rcpt, list = monTx().filter(x => x.receiptId).sort((a, b) => b.date.localeCompare(a.date));
  return `<section class="card pad"><div class="section-title"><h2>Add from a receipt or invoice</h2></div>
      <p class="small muted" style="margin:0">Take a photo of the receipt (or choose a PDF invoice). ${St.sample ? 'The AI reads the shop, date, total and category; you check them before saving.' : 'You fill in the amount; the receipt is kept with the expense.'} The file is kept with the expense.</p>
      <div class="row"><label class="btn primary" for="mon-rc-file">🧾 Choose receipt</label><input id="mon-rc-file" type="file" accept="image/*,application/pdf" multiple hidden data-chg="mon-rcpt">${r && r.busy ? `<span class="small muted">Reading ${esc(r.name)}…</span><div class="progress indet" style="width:90px"><i></i></div>` : ''}</div></section>
    <section class="card pad"><div class="section-title"><h2>Expenses with a receipt</h2></div>${monTable(list.slice(0, 100))}</section>`;
}
async function monReadReceipt(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const file = { name: f.name, type: f.type, bytes };
  let guess = {};
  if (St.sample) {
    UI.mon.rcpt = { busy: true, name: f.name }; render();
    try {
      const lim = St.limits && St.limits.images;
      const res = await E.extract({ name: f.name, mime: f.type, bytes }, { vision: !!lim, maxImageBytes: lim ? lim.maxInputBytes : 0, maxPageImages: 2 });
      const images = (res.images || []).slice(0, 2).map(x => x.blob);
      const prompt = `Read this receipt or invoice${images.length ? ' (image IMG1)' : ''} and answer JSON: {"payee": shop or company name, "date": "YYYY-MM-DD", "total": number (the amount paid, including tax), "currency": ISO code like "EGP", "category": one of ${JSON.stringify(monCats('expense'))}, "note": short list of what was bought}. Use null for anything you cannot read. Today is ${T()}.${res.text ? '\nText of the document:\n' + E.clip(res.text, 12000) : ''}`;
      guess = await St.sample.json(prompt, { modelTier: 'quick', ...(images.length ? { images } : {}) }) || {};
    } catch (e) { toast('The receipt could not be read automatically — please fill it in. (' + (e.message || e.code) + ')', { err: true }); }
    UI.mon.rcpt = null;
  }
  const p = monPrefs();
  const cur = /^[A-Z]{3}$/.test(guess.currency || '') ? guess.currency : p.currency;
  UI.mon.edit = { x: {}, file, keepFile: true };
  monOpenForm({ kind: 'expense', amount: monNum(guess.total) ?? '', date: monDate(guess.date || '') || T(), currency: cur, payee: guess.payee || '', category: monCats('expense').includes(guess.category) ? guess.category : monGuess(guess.payee, 'expense'), note: guess.note ? String(guess.note).slice(0, 200) : '' });
}
Object.assign(CHG, { 'mon-rcpt': async el => { for (const f of [...el.files].slice(0, 1)) await monReadReceipt(f).catch(e => toast(String(e.message || e), { err: true })); } });

/* --- work expenses to claim back --- */
function monClaims() {
  const open = monTx().filter(x => x.claim && !x.claimPaid).sort((a, b) => a.date.localeCompare(b.date));
  const paid = monTx().filter(x => x.claim && x.claimPaid).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  UI.mon.claimSel = UI.mon.claimSel || new Set(open.filter(x => !x.claimedAt).map(x => x.id));
  const sel = open.filter(x => UI.mon.claimSel.has(x.id)), tot = sel.reduce((s, x) => s + (monBase(x) || 0), 0);
  return `<section class="card pad"><div class="section-title"><h2>Work expenses to claim back</h2></div>
      <p class="small muted" style="margin:0">Expenses you ticked as “work expense”. Make a claim sheet (Excel, with each receipt) for the selected ones, then mark them as claimed and, when the money arrives, as paid back — that adds the income too.</p>
      ${monTable(open, { pick: true })}
      ${open.length ? `<div class="row"><b>${sel.length} selected · ${esc(monFmt(tot))}</b><span class="spacer"></span><button class="btn" data-act="mon-claim-sheet" ${sel.length ? '' : 'disabled'}>⬇ Claim sheet + receipts</button><button class="btn" data-act="mon-claim-mark" ${sel.length ? '' : 'disabled'}>Mark as claimed</button><button class="btn primary" data-act="mon-claim-paid" ${sel.length ? '' : 'disabled'}>Paid back</button></div>` : ''}</section>
    ${paid.length ? `<section class="card pad"><div class="section-title"><h2>Paid back</h2></div>${monTable(paid)}</section>` : ''}`;
}
Object.assign(CHG, { 'mon-claim-pick': el => { const s = UI.mon.claimSel; el.checked ? s.add(el.dataset.id) : s.delete(el.dataset.id); render(); } });
const monClaimSel = () => monTx().filter(x => x.claim && !x.claimPaid && UI.mon.claimSel && UI.mon.claimSel.has(x.id));
Object.assign(ACT, {
  'mon-claim-mark': () => { for (const x of monClaimSel()) colPut('money', { ...x, claimedAt: x.claimedAt || nowISO() }); toast('Marked as claimed.'); render(); },
  'mon-claim-paid': () => {
    const sel = monClaimSel(); if (!sel.length) return;
    const byCur = {}; for (const x of sel) { colPut('money', { ...x, claimedAt: x.claimedAt || nowISO(), claimPaid: T() }); byCur[x.currency] = (byCur[x.currency] || 0) + (+x.amount || 0); }
    for (const [cur, amount] of Object.entries(byCur)) colPut('money', { id: E.uid('mn'), kind: 'income', date: T(), amount: Math.round(amount * 100) / 100, currency: cur, category: 'Expense claim paid', payee: `Expense claim (${sel.length} item${sel.length > 1 ? 's' : ''})`, account: 'Bank', note: '', createdAt: nowISO() });
    UI.mon.claimSel = null; toast('Marked as paid back; the income was added.'); render();
  },
  'mon-claim-sheet': () => monClaimSheet().catch(e => toast('Not saved: ' + (e.message || e), { err: true })),
});
async function monClaimSheet() {
  const sel = monClaimSel(), p = monPrefs(), X = await E.need('xlsx');
  const rows = sel.map((x, i) => ({ No: i + 1, Date: x.date, Description: x.payee || '', Category: x.category || '', Project: x.project || '', Amount: +x.amount, Currency: x.currency || p.currency, [`Amount (${p.currency})`]: monBase(x) ?? '', Receipt: x.receiptId ? `${String(i + 1).padStart(2, '0')} ${x.receiptName || 'receipt'}` : 'no receipt', Note: x.note || '' }));
  const total = rows.reduce((s, r) => s + (+r[`Amount (${p.currency})`] || 0), 0);
  const aoa = [[`Expense claim — ${St.settings.me.name || ''}`], [`Prepared ${fmtDate(T())}`], [], Object.keys(rows[0]), ...rows.map(r => Object.values(r)), [], ['', '', '', '', '', '', 'Total', Math.round(total * 100) / 100]];
  const wb = X.utils.book_new(); const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = [5, 12, 34, 18, 18, 11, 9, 14, 30, 30].map(w => ({ wch: w }));
  X.utils.book_append_sheet(wb, ws, 'Claim');
  const xlsx = new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' }));
  const withR = sel.filter(x => x.receiptId);
  if (!withR.length) return offerFile(`expense-claim-${T()}.xlsx`, new Blob([xlsx]));
  const JSZip = await E.need('jszip'); const z = new JSZip();
  z.file(`expense-claim-${T()}.xlsx`, xlsx);
  for (const x of withR) { const b = await FILES.load('receipts', x.receiptId); if (b) z.file(`receipts/${String(sel.indexOf(x) + 1).padStart(2, '0')} ${(x.receiptName || 'receipt').replace(/[\\/:*?"<>|]/g, '_')}`, b); }
  await offerFile(`expense-claim-${T()}.zip`, await z.generateAsync({ type: 'blob' }));
}

/* --- search palette and home --- */
HOOKS.afterRender.push(() => {
  const n = document.querySelector('.rail [data-nav="money"] .count');
  if (n) { const c = monTx().filter(x => x.claim && !x.claimPaid).length; n.hidden = !c; n.textContent = c; }
});
window.__AR_MON = { rows: () => monImpRows() }; // test hook
