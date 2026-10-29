/* ---------- Money: a separate tab for personal finance (bank statements, analysis, budgets, forecasts) ---------- */
// Every number comes from the engine in src/fin-core.js (FIN), from the transactions and settings stored here.
// Storage: transactions are kept grouped by month (one document per month, split when large) because the page's
// database holds at most 25,000 documents; statements imported are listed in `finbatch`, deletions and bulk changes
// in `finlog`; settings, accounts, categories, rules, people, holdings, budgets and goals in the prefs doc 'finance'.
addCols('fintx', 'finbatch', 'finlog');
VIEWS.push('finance');
UI.fin = { sec: 'dash', f: { from: '', to: '', acct: '', cat: '' }, l: { q: '', type: '', cat: '', acct: '', status: '', sort: 'date', dir: -1, page: 0, ids: null, idsLabel: '' }, sel: new Set(), imp: null, gran: 'month', expCat: '', simH: 12, fcH: 12 };

const FIN_DEF = () => ({
  base: 'EGP', rates: {}, rateDates: {}, accounts: [], cats: null, rules: [], parties: [], holdings: [], budgets: {}, strategy: 'balanced', saveTarget: '', commitments: [], goals: [],
  sim: { base: '', baseSrc: 'auto', horizon: 12, expenses: '', extraExpenses: '', inflation: '', saveShare: 50, saved: '', target: '', changes: [], scenarios: null },
  alloc: [{ name: 'Savings & investments', pct: 50 }, { name: 'Financial goals', pct: 30 }, { name: 'Lifestyle', pct: 20 }], emergencyMonths: 3, keepOriginals: true, rent: { scenario: { delay: 0, rentCut: 0, vacancy: 0, costUp: 0 }, horizon: 24 },
});
const finP = () => { const p = { ...FIN_DEF(), ...(St.cols.prefs.get('finance') || {}) }; p.sim = { ...FIN_DEF().sim, ...(p.sim || {}) }; p.rent = { ...FIN_DEF().rent, ...(p.rent || {}) }; return p; };
const finSave = mut => { const p = clone(finP()); mut(p); colPut('prefs', { ...p, id: 'finance' }); };
const finCats = () => finP().cats || FIN.DEFAULT_CATS;
const finCat = id => finCats().find(c => c.id === id) || null;
const finAcct = id => finP().accounts.find(a => a.id === id) || null;
const finToday = () => E.todayISO();

/* --- transactions, grouped by month --- */
const FS = { key: '', list: [], by: new Map() };
function finTx() {
  const docs = colList('fintx'), key = docs.length + '|' + docs.map(d => d.id + d.updatedAt).join(',');
  if (key !== FS.key) { FS.list = docs.flatMap(d => (d.tx || []).filter(t => !t.deleted)); FS.by = new Map(FS.list.map(t => [t.id, t])); FS.key = key; FS.memo = {}; }
  return FS.list;
}
const finMonthKey = t => FIN.validDate(t.date) ? t.date.slice(0, 7) : 'undated';
// rewrite the month documents that hold any of these transactions (a document stays under ~180 KB)
function finWrite(changed, removed = []) {
  finTx();
  const all = new Map(FS.by), months = new Set();
  for (const id of removed) { const t = all.get(id); if (t) { months.add(finMonthKey(t)); all.delete(id); } }
  for (const t of changed) { const old = all.get(t.id); if (old) months.add(finMonthKey(old)); months.add(finMonthKey(t)); all.set(t.id, t); }
  const byM = {}; for (const t of all.values()) { const k = finMonthKey(t); if (months.has(k)) (byM[k] = byM[k] || []).push(t); }
  for (const k of months) {
    const list = (byM[k] || []).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id));
    const parts = [[]]; let size = 0;
    for (const t of list) { const s = JSON.stringify(t).length; if (size + s > 180000 && parts[parts.length - 1].length) { parts.push([]); size = 0; } parts[parts.length - 1].push(t); size += s; }
    const ids = parts.map((_, i) => i ? `m-${k}~${i}` : `m-${k}`);
    for (const d of colList('fintx').filter(d => d.month === k && !ids.includes(d.id))) colDel('fintx', d.id);
    if (!list.length) { if (St.cols.fintx.has(`m-${k}`)) colDel('fintx', `m-${k}`); continue; }
    parts.forEach((p, i) => colPut('fintx', { id: ids[i], month: k, tx: p }));
  }
  FS.key = '';
}
function finLog(what, detail) {
  const m = finToday().slice(0, 7), id = 'log-' + m, d = clone(St.cols.finlog.get(id) || { id, entries: [] });
  d.entries.push({ at: nowISO(), what, ...detail }); if (d.entries.length > 2000) d.entries = d.entries.slice(-2000);
  colPut('finlog', d);
}
const finHist = (t, f, from, to, why) => { t.hist = [...(t.hist || []), { at: nowISO(), f, from: from ?? null, to: to ?? null, why }]; };

/* --- the numbers, for the current filters --- */
function finCtx() { const p = finP(); return { cats: finCats(), accounts: p.accounts, base: p.base, rates: p.rates, batches: colList('finbatch'), today: finToday() }; }
function finAn(over = {}) {
  const f = UI.fin.f, o = { ...finCtx(), from: f.from || null, to: f.to || null, acctIds: f.acct ? [f.acct] : null, catIds: f.cat ? [f.cat] : null, ...over };
  const tx = finTx(), k = JSON.stringify([FS.key, (St.cols.prefs.get('finance') || {}).updatedAt, colList('finbatch').length, o.from, o.to, o.acctIds, o.catIds, o.today]);
  FS.memo = FS.memo || {};
  return FS.memo[k] || (FS.memo[k] = FIN.analyze(tx, o));
}
// the whole history, unfiltered (budgets, income base, forecasts)
const finAll = () => finAn({ from: null, to: null, acctIds: null, catIds: null });

/* --- formatting --- */
function fm(v, cur, o = {}) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  cur = cur || finP().base; const a = Math.abs(v), dec = o.dec !== undefined ? o.dec : 2;
  let s; try { s = new Intl.NumberFormat(DLOC(), { style: 'currency', currency: cur, minimumFractionDigits: dec, maximumFractionDigits: dec }).format(a); } catch { s = a.toLocaleString(DLOC(), { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ' + cur; }
  return (v < 0 ? '−' : o.plus && v > 0 ? '+' : '') + s;
}
// tiles: whole units from 1,000 up (tables keep the cents)
const fkc = v => `<span class="num ${v < 0 ? 'fin-neg' : ''}">${fk(v)}</span>`;
const fk = (v, cur) => fm(v, cur, { dec: v !== null && v !== undefined && Math.abs(v) >= 1000 ? 0 : 2 });
const fmc = (v, cur) => `<span class="num ${v < 0 ? 'fin-neg' : ''}">${fm(v, cur)}</span>`;
const fpct = v => v === null || v === undefined || isNaN(v) ? '—' : (Math.round(v * 10) / 10).toLocaleString(DLOC()) + '%';
const fmon = m => m === 'undated' ? 'No date' : /^\d{4}-\d{2}$/.test(m) ? fmtDate(m + '-15', { month: 'short', year: 'numeric' }) : m;
const fday = d => d ? fmtDate(d, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const FIN_KIND = { income: 'Income', expense: 'Expense', move: 'Movement', third: 'Someone else’s money', capital: 'Sale of an asset' };
function finType(t) {
  if (!FIN.validDate(t.date) || typeof t.amount !== 'number' || (t.flags || []).includes('direction_unknown')) return 'Incomplete';
  const c = finCat(t.cat); if (!c) return t.amount > 0 ? 'Income' : 'Expense';
  if (c.code === 'refund') return 'Refund';
  return { transfer: 'Own transfer', savings: 'Savings move', invest: 'Investment move', ccpay: 'Card payment', principal: 'Debt principal', held: 'Held for someone', sale: 'Sale proceeds', property: 'Property' }[c.code] || FIN_KIND[c.kind] || '';
}
const finStatus = t => !FIN.validDate(t.date) || typeof t.amount !== 'number' || (t.flags || []).includes('direction_unknown') ? 'incomplete' : t.review ? 'review' : 'ok';
const FIN_ICON = { dash: '📊', import: '🏦', ledger: '📒', exp: '🧾', inc: '💼', budget: '🎯', sim: '📈', forecast: '🔭', accounts: '🏛️', own: '🤝', settings: '⚙️' };
const FIN_SECS = [['dash', 'Dashboard'], ['import', 'Import statements'], ['ledger', 'Transactions'], ['exp', 'Expense analytics'], ['inc', 'Income & position'], ['budget', 'Budget & control'], ['sim', 'Income growth'], ['forecast', 'Forecast & goals'], ['accounts', 'Accounts & reconciliation'], ['own', 'Ownership & others’ money'], ['settings', 'Settings & backup']];
const FIN_VIEW = {};   // section → html (filled by the Money feature files)

VIEW_FN.finance = () => {
  const s = UI.fin.sec, p = finP(), filt = ['dash', 'ledger', 'exp', 'inc'].includes(s);
  return `<div class="wrap fin">
  <div class="page-head"><div><h1>Money</h1><div class="sub">Your bank and card statements in one ledger, every number traced to its transactions. Your own money is kept apart from money you hold for others, and actual figures apart from forecasts.</div></div>
    <div class="row"><button class="btn" data-act="fin-new-tx">${I.plus} Transaction</button><button class="btn primary" data-act="fin-sec" data-s="import">🏦 Import statement</button></div></div>
  <nav class="fin-nav" aria-label="Money sections">${FIN_SECS.map(([k, l]) => `<button data-act="fin-sec" data-s="${k}" aria-current="${s === k ? 'page' : 'false'}"><span aria-hidden="true">${FIN_ICON[k]}</span>${l}</button>`).join('')}</nav>
  ${filt ? finFilterBar() : ''}
  ${!p.accounts.length && s !== 'accounts' && s !== 'settings' && s !== 'import' ? `<div class="callout"><b>Start here:</b> import a bank or card statement — the account is created from it — or <button class="btn sm" data-act="fin-sec" data-s="accounts">add your accounts</button> first.</div>` : ''}
  ${(FIN_VIEW[s] || FIN_VIEW.dash)()}
</div>`;
};

/* --- filters: dates, account, category — every section below them uses the same ones --- */
function finFilterBar() {
  const f = UI.fin.f, an = finAll(), p = finP();
  return `<div class="fin-filters" role="group" aria-label="Filters">
    <label>From <input class="input" type="date" data-chg="fin-f" data-k="from" value="${esc(f.from)}" placeholder="${esc(an.first || '')}"></label>
    <label>To <input class="input" type="date" data-chg="fin-f" data-k="to" value="${esc(f.to)}"></label>
    <label>Account <select class="input" data-chg="fin-f" data-k="acct"><option value="">All accounts</option>${p.accounts.map(a => `<option value="${esc(a.id)}" ${f.acct === a.id ? 'selected' : ''}>${esc(a.name)} · ${esc(a.currency)}</option>`).join('')}</select></label>
    <label>Category <select class="input" data-chg="fin-f" data-k="cat"><option value="">All categories</option>${finCatOptions(f.cat, ['income', 'expense'])}</select></label>
    ${f.from || f.to || f.acct || f.cat ? `<button class="btn sm ghost" data-act="fin-f-reset">Clear filters</button>` : ''}
    <span class="small muted fin-period">${an.first ? `Data from ${fday(an.first)} to ${fday(an.last)}${f.from || f.to ? '' : ' — showing all of it'}` : 'No transactions yet'}</span>
  </div>`;
}
function finCatOptions(sel, kinds) {
  const groups = { income: 'Income', expense: 'Expenses', move: 'Movements (not income or spending)', third: 'Other people’s money', capital: 'Asset sales' };
  return Object.entries(groups).filter(([k]) => !kinds || kinds.includes(k)).map(([k, l]) => `<optgroup label="${l}">${finCats().filter(c => c.kind === k).map(c => `<option value="${esc(c.id)}" ${sel === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
}
// warnings that change how to read the numbers
function finNotices(an) {
  const out = [];
  if (an.noRate && an.noRate.length) out.push(`${an.noRate.map(x => `${x.n} transaction${x.n === 1 ? '' : 's'} in ${x.cur}`).join(', ')} ${an.noRate.reduce((s, x) => s + x.n, 0) === 1 ? 'is' : 'are'} left out of these totals: no exchange rate to ${finP().base} was given. <button class="btn sm" data-act="fin-sec" data-s="settings">Add a rate</button>`);
  if (an.incomplete && an.incomplete.length) out.push(`${an.incomplete.length} transaction${an.incomplete.length === 1 ? ' has' : 's have'} no readable date, amount or direction and ${an.incomplete.length === 1 ? 'is' : 'are'} not counted. <button class="btn sm" data-act="fin-ledger-status" data-v="incomplete">Fix them</button>`);
  if (an.totals && an.totals.gaps && an.totals.gaps.length) out.push(`No statement covers ${an.totals.gaps.length > 4 ? an.totals.gaps.length + ' months' : an.totals.gaps.map(fmon).join(', ')} — those months are shown as missing, not as zero.`);
  const rv = finTx().filter(t => t.review).length; if (rv) out.push(`${rv} transaction${rv === 1 ? '' : 's'} to check (unsure category or possible repeat). <button class="btn sm" data-act="fin-ledger-status" data-v="review">Review</button>`);
  const pend = colList('finbatch').reduce((s, b) => s + (b.pending || []).filter(r => !r.done).length, 0); if (pend) out.push(`${pend} imported line${pend === 1 ? '' : 's'} held for your decision (might already be recorded). <button class="btn sm" data-act="fin-sec" data-s="import">Decide</button>`);
  return out.length ? `<div class="fin-notes">${out.map(n => `<div class="fin-note">⚠️ <span>${n}</span></div>`).join('')}</div>` : '';
}

/* --- charts (SVG, one axis each; every mark has a tooltip and opens its transactions) --- */
function niceMax(v) { if (!(v > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
const fshort = v => { const a = Math.abs(v), t = (x, u) => (Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) : (Math.round(x * 10) / 10).toFixed(1)) + u; return (v < 0 ? '−' : '') + (a >= 1e6 ? t(a / 1e6, 'M') : a >= 1e3 ? t(a / 1e3, 'k') : Math.round(a)); };
// grouped bars for income and expenses per period, with net as a dot; missing periods drawn as a hatched gap
const FIN_W = {};
function finBars(rows, o = {}) {
  if (!rows.length) return '<p class="muted small">No data for this period.</p>';
  const W = FIN_W[o.title] || 760, H = o.h || 230, L = 52, R = 10, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
  const hi = niceMax(Math.max(...rows.map(r => Math.max(r.a || 0, r.b || 0, r.net || 0)))), lo = Math.min(0, ...rows.map(r => r.net || 0)), loN = lo < 0 ? -niceMax(-lo) : 0;
  const y = v => T + ih * (hi - v) / (hi - loN), bw = Math.max(2, Math.min(26, iw / rows.length / 2.6)), step = iw / rows.length;
  const ticks = [0, 1, 2, 3, 4].map(i => loN + (hi - loN) * i / 4);
  const every = Math.ceil(rows.length / 12);
  let s = `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" data-key="${esc(o.title || '')}" data-w="${W}" role="img" aria-label="${esc(o.title || 'Chart')}">`;
  for (const t of ticks) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fshort(t)}</text>`;
  s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  rows.forEach((r, i) => {
    const x = L + step * i + step / 2;
    if (r.missing) s += `<rect class="gap" x="${x - step / 2 + 1}" y="${T}" width="${step - 2}" height="${ih}"><title>${esc(r.label)}: no statement covers this period</title></rect>`;
    else {
      if (r.a) s += `<rect class="s1" x="${x - bw - 1}" y="${y(r.a)}" width="${bw}" height="${Math.max(0, y(0) - y(r.a))}" rx="3"/>`;
      if (r.b) s += `<rect class="s2" x="${x + 1}" y="${y(r.b)}" width="${bw}" height="${Math.max(0, y(0) - y(r.b))}" rx="3"/>`;
      if (o.net && r.net !== undefined && r.net !== null) s += `<circle class="s3" cx="${x}" cy="${y(r.net)}" r="4"/>`;
    }
    if (i % every === 0) s += `<text class="ax" x="${x}" y="${H - 10}" text-anchor="middle">${esc(r.short || r.label)}</text>`;
    s += `<rect class="hit" x="${x - step / 2}" y="${T}" width="${step}" height="${ih}" ${o.act && !r.missing ? `data-act="${o.act}" data-k="${esc(r.k)}" tabindex="0"` : ''}><title>${esc(r.label)}${r.missing ? ' — no data' : `\n${o.la || 'Income'}: ${fm(r.a)}\n${o.lb || 'Expenses'}: ${fm(r.b)}${o.net ? `\nNet: ${fm(r.net)}` : ''}`}</title></rect>`;
  });
  s += '</svg>';
  const legend = `<div class="fin-legend">${rows.some(r => r.a) ? `<span><i class="k s1"></i>${esc(o.la || 'Income')}</span>` : ''}${rows.some(r => r.b) ? `<span><i class="k s2"></i>${esc(o.lb || 'Expenses')}</span>` : ''}${o.net ? '<span><i class="k s3 dot"></i>Net</span>' : ''}${rows.some(r => r.missing) ? '<span><i class="k gap"></i>No statement</span>' : ''}</div>`;
  return legend + s + finTable(rows.map(r => [r.label, r.missing ? 'no data' : fm(r.a), r.missing ? '' : fm(r.b), ...(o.net ? [r.missing ? '' : fm(r.net)] : [])]), ['Period', o.la || 'Income', o.lb || 'Expenses', ...(o.net ? ['Net'] : [])]);
}
// lines over time (actual solid, estimate dashed)
function finLines(series, o = {}) {
  const keys = [...new Set(series.flatMap(s => s.pts.map(p => p.k)))]; if (!keys.length) return '<p class="muted small">No data.</p>';
  const W = FIN_W[o.title] || 760, H = o.h || 220, L = 52, R = 10, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
  const vals = series.flatMap(s => s.pts.map(p => p.v)).filter(v => v !== null && v !== undefined);
  const hi = niceMax(Math.max(0, ...vals)), lo = Math.min(0, ...vals), loN = lo < 0 ? -niceMax(-lo) : 0;
  const x = k => L + (keys.length === 1 ? iw / 2 : iw * keys.indexOf(k) / (keys.length - 1)), y = v => T + ih * (hi - v) / (hi - loN);
  let s = `<svg class="fin-chart" viewBox="0 0 ${W} ${H}" data-key="${esc(o.title || '')}" data-w="${W}" role="img" aria-label="${esc(o.title || 'Chart')}">`;
  for (const t of [0, 1, 2, 3, 4].map(i => loN + (hi - loN) * i / 4)) s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="ax" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${o.pct ? Math.round(t) + '%' : fshort(t)}</text>`;
  s += `<line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
  series.forEach((se, si) => {
    const seg = (est) => { const pts = se.pts.filter((p, i) => p.v !== null && p.v !== undefined && (est ? p.est || (se.pts[i + 1] && se.pts[i + 1].est) : !p.est)); return pts.length > 1 ? `<polyline class="ln ${se.cls || 's' + (si + 1)} ${est ? 'est' : ''}" points="${pts.map(p => `${x(p.k)},${y(p.v)}`).join(' ')}"/>` : ''; };
    s += seg(false) + seg(true);
    for (const p of se.pts) if (p.v !== null && p.v !== undefined) s += `<circle class="pt ${se.cls || 's' + (si + 1)} ${p.est ? 'est' : ''}" cx="${x(p.k)}" cy="${y(p.v)}" r="${keys.length > 40 ? 2 : 3.5}"><title>${esc(se.name)} · ${esc(p.label || p.k)}: ${o.pct ? fpct(p.v) : fm(p.v)}${p.est ? ' (estimate)' : ''}</title></circle>`;
  });
  const every = Math.ceil(keys.length / 12);
  keys.forEach((k, i) => { if (i % every === 0) s += `<text class="ax" x="${x(k)}" y="${H - 10}" text-anchor="middle">${esc(o.label ? o.label(k) : k)}</text>`; });
  s += '</svg>';
  return `<div class="fin-legend">${series.map((se, i) => `<span><i class="k ${se.cls || 's' + (i + 1)} line"></i>${esc(se.name)}</span>`).join('')}${series.some(se => se.pts.some(p => p.est)) ? '<span><i class="k line est"></i>Estimate</span>' : ''}</div>` + s;
}
// horizontal bars (one hue: magnitude), each row opens its transactions
function finHBars(rows, o = {}) {
  if (!rows.length) return '<p class="muted small">Nothing in this period.</p>';
  const max = Math.max(...rows.map(r => Math.abs(r.v))) || 1;
  return `<div class="fin-hbars">${rows.map(r => `<button class="fin-hb" ${o.act ? `data-act="${o.act}" data-k="${esc(r.id)}"` : ''} title="${esc(r.label)}: ${fm(r.v)}${r.sub ? ' · ' + esc(r.sub) : ''}"><span class="fin-hb-l">${esc(r.label)}</span><span class="fin-hb-bar"><i class="${o.cls || 's1'}" style="width:${Math.max(0.5, Math.abs(r.v) / max * 100)}%"></i></span><span class="fin-hb-v num">${fm(r.v)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span></button>`).join('')}</div>`;
}
function finTable(rows, head, o = {}) {
  return `<details class="fin-tbl-d" ${o.open ? 'open' : ''}><summary class="small">${o.label || 'Show as a table'}</summary><div class="tbl-wrap"><table class="tbl fin-tbl"><thead><tr>${head.map((h, i) => `<th ${i ? 'class="num"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td ${i ? 'class="num"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
const finKpi = (label, value, sub, o = {}) => `<${o.act ? 'button' : 'div'} class="fin-kpi ${o.cls || ''}" ${o.act ? `data-act="${o.act}" ${Object.entries(o.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}` : ''}><span class="fin-kpi-l">${esc(label)}${o.est ? ' <i class="fin-est">estimate</i>' : ''}</span><b class="num">${value}</b>${sub ? `<small>${sub}</small>` : ''}</${o.act ? 'button' : 'div'}>`;

/* --- dashboard --- */
FIN_VIEW.dash = () => {
  const an = finAn(), t = an.totals || {}, p = finP(), today = finToday(), cur = today.slice(0, 7);
  if (an.empty) return finNotices(an) + `<div class="empty"><p>No transactions yet.</p><button class="btn primary" data-act="fin-sec" data-s="import">Import your first statement</button></div>`;
  const all = finAll(), plan = FIN.budgetPlan(all, { cats: finCats(), today, strategy: p.strategy, budgets: p.budgets });
  const curM = all.months.find(b => b.m === cur) || { inc: 0, exp: 0 };
  const ib = FIN.incomeBase(all, today), rec = FIN.recurring(all.entries || []).filter(r => r.dir < 0);
  const fixed = rec.filter(r => r.fixed).reduce((s, r) => s + r.perMonth, 0) + p.commitments.reduce((s, c) => s + (+c.amount || 0), 0);
  const committedLeft = FIN.monthControl(all, plan, { today, commitments: p.commitments }).committed;
  const own = finPosition(), simX = finSimRun();
  const goals = finGoals();
  const kp = [
    finKpi('Total income', fk(t.inc), `${fday(an.from)} – ${fday(an.to)} · refunds not counted`, { act: 'fin-drill', data: { kind: 'flow', k: 'inc' } }),
    finKpi('Total expenses', fk(t.exp), t.expProperty ? `living ${fk(t.expLiving)} · property ${fk(t.expProperty)}` : 'net of refunds', { act: 'fin-drill', data: { kind: 'flow', k: 'exp' } }),
    finKpi('Net cash flow', fkc(t.net), 'income − expenses (own transfers, card payments and others’ money excluded)', { act: 'fin-drill', data: { kind: 'flow', k: 'both' }, cls: t.net < 0 ? 'bad' : '' }),
    finKpi('Average monthly income', fk(t.avgInc), `total ÷ ${t.months} calendar month${t.months === 1 ? '' : 's'}${t.gaps.length ? ` (${t.gaps.length} without data)` : ''}`),
    finKpi('Average monthly expenses', fk(t.avgExp), `total ÷ ${t.months} calendar months`),
    finKpi('This month', `${fk(curM.inc)} <span class="muted">in</span> · ${fk(curM.exp)} <span class="muted">out</span>`, fmon(cur), { act: 'fin-drill', data: { kind: 'month', k: cur } }),
    finKpi('Budget left this month', plan.totalBudget ? fkc(plan.totalBudget - plan.rows.filter(r => r.budget !== null).reduce((s, r) => s + r.spent, 0)) : '—', plan.totalBudget ? `of ${fk(plan.totalBudget)} budgeted` : '<button class="btn sm" data-act="fin-sec" data-s="budget">Set budgets</button>'),
    finKpi('Disposable this month', fkc(r2(curM.inc - curM.exp - committedLeft)), `income − spending so far − ${fk(committedLeft)} still due`, { est: true }),
    finKpi('Account balances', own.assets.filter(x => x.kind === 'bank' && x.verified).map(x => fk(x.amount, x.currency)).join(' + ') || '—', own.assets.some(x => x.kind === 'bank' && x.verified) ? 'latest statement balances — bank-confirmed' : 'no statement balance yet', { act: 'fin-sec', data: { s: 'accounts' } }),
    finKpi('Put into savings', fk(t.save), 'savings and investment moves out of my accounts, net'),
    finKpi('Savings rate', fpct(t.rate), '(income − expenses) ÷ income'),
    finKpi('Highest spending month', t.peakExp ? fk(t.peakExp.exp) : '—', t.peakExp ? fmon(t.peakExp.m) : '', t.peakExp ? { act: 'fin-drill', data: { kind: 'month', k: t.peakExp.m } } : {}),
    finKpi('Lowest spending month', t.lowExp ? fk(t.lowExp.exp) : '—', t.lowExp ? fmon(t.lowExp.m) + ' (months with a statement)' : '', t.lowExp ? { act: 'fin-drill', data: { kind: 'month', k: t.lowExp.m } } : {}),
    finKpi('Fixed monthly commitments', fk(fixed), `${rec.filter(r => r.fixed).length} repeating payment${rec.filter(r => r.fixed).length === 1 ? '' : 's'} found${p.commitments.length ? ` + ${p.commitments.length} you entered` : ''}`, { act: 'fin-sec', data: { s: 'exp' } }),
    finKpi('Variable expenses (monthly)', fk(Math.max(0, t.avgExp - fixed)), 'average monthly expenses − fixed commitments', { est: true }),
    finKpi('Salary (recurring)', ib.salary !== null ? fk(ib.salary) : '—', ib.salary === null ? 'no salary found yet' : ib.verified ? `verified: ${ib.basis}` : `not verified (${ib.salaryMonths} of the last 4 months)`),
    finKpi('Expected income changes', simX && simX.scenarios.expected.monthlyIncrease ? fk(simX.scenarios.expected.monthlyIncrease, null) + ' /month' : '—', simX ? `${(p.sim.changes || []).length} change${(p.sim.changes || []).length === 1 ? '' : 's'} entered · forecast` : '<button class="btn sm" data-act="fin-sec" data-s="sim">Add a raise</button>', { est: true, act: 'fin-sec', data: { s: 'sim' } }),
    finKpi('Net worth (own money)', own.net !== null ? fk(own.net) : '—', own.net === null ? (own.missingRates.length ? 'needs a rate for ' + own.missingRates.join(', ') : 'no balances yet') : `${own.estimated ? 'includes balances or holdings not yet verified' : 'from statement balances and verified holdings'} · others’ money excluded`, { est: own.estimated, act: 'fin-sec', data: { s: 'own' } }),
    finKpi('Projected savings in 12 months', (() => { const si = finSimInput(); if (si.base === null) return '—'; const fc = FIN.forecast(all, { cats: finCats(), today, horizon: 12, income: si.base }); const last = fc.rows[fc.rows.length - 1]; return last && last.cum !== null ? fkc(last.cum) : '—'; })(), 'recurring income − usual spending, 12 months', { est: true, act: 'fin-sec', data: { s: 'forecast' } }),
    finKpi('Goals', goals.length ? `${goals.filter(g => g.ok).length} of ${goals.length} on track` : '—', goals.length ? goals.slice(0, 2).map(g => `${esc(g.name)} ${fpct(g.progress)}`).join(' · ') : '<button class="btn sm" data-act="fin-sec" data-s="forecast">Add a goal</button>', { est: true }),
  ];
  const rows = an.months.map(b => ({ k: b.m, label: fmon(b.m), short: fmtDate(b.m + '-15', { month: 'short' }) + (b.m.endsWith('-01') ? ' ' + b.m.slice(2, 4) : ''), a: b.inc, b: b.exp, net: b.net, missing: !b.covered }));
  const expCats = Object.values(an.cats).filter(c => c.kind === 'expense' && c.total).sort((a, b) => b.total - a.total);
  const third = FIN.thirdParty(finTx(), p.parties).filter(x => Math.abs(x.held) >= 0.005);
  return finNotices(an) + `<div class="fin-kpis">${kp.join('')}</div>
    <div class="fin-grid2">
      <section class="card fin-card"><h2>Income and expenses by month</h2>${finBars(rows, { act: 'fin-drill-month', net: true, title: 'Income and expenses by month' })}</section>
      <section class="card fin-card"><h2>Where the money goes</h2>${finHBars(expCats.slice(0, 10).map(c => ({ id: c.id, label: c.name, v: c.total, sub: fpct(c.share) })), { act: 'fin-drill-cat', cls: 's2' })}${expCats.length > 10 ? `<button class="btn sm ghost" data-act="fin-sec" data-s="exp">All ${expCats.length} categories</button>` : ''}</section>
    </div>
    ${third.length ? `<section class="card fin-card"><h2>Money held for others <span class="muted small">— not yours, not counted anywhere above</span></h2>${third.map(x => `<div class="fin-kv"><span>${esc(x.name)}</span><b class="num">${fm(x.held)}</b></div>`).join('')}<button class="btn sm ghost" data-act="fin-sec" data-s="own">Details</button></section>` : ''}
    <section class="card fin-card"><h2>Recommendations</h2>${finRecsHTML(3)}<button class="btn sm ghost" data-act="fin-sec" data-s="forecast">All recommendations</button></section>`;
};
const r2 = FIN.r2;

/* --- drill-down: any number opens the transactions behind it --- */
function finDrill(spec) {
  const an = finAn(), cats = FIN.catMap(finCats());
  let ids = [], title = '';
  const E = an.entries || [];
  if (spec.kind === 'month') { ids = E.filter(e => e.m === spec.k && (e.flow === 'inc' || e.flow === 'exp')).map(e => e.id); title = fmon(spec.k); }
  else if (spec.kind === 'cat') { ids = E.filter(e => e.cat === spec.k && (e.flow === 'inc' || e.flow === 'exp')).map(e => e.id); title = (cats[spec.k] || { name: spec.k }).name; }
  else if (spec.kind === 'catmonth') { const [c, m] = spec.k.split('|'); ids = E.filter(e => e.cat === c && e.m === m).map(e => e.id); title = `${(cats[c] || { name: c }).name} · ${fmon(m)}`; }
  else if (spec.kind === 'flow') { ids = E.filter(e => spec.k === 'both' ? e.flow === 'inc' || e.flow === 'exp' : e.flow === spec.k).map(e => e.id); title = { inc: 'Income', exp: 'Expenses', both: 'Income and expenses', move: 'Movements between accounts', third: 'Others’ money', capital: 'Asset sales' }[spec.k]; }
  else if (spec.kind === 'ids') { ids = spec.ids; title = spec.title; }
  UI.fin.drill = { title, ids: [...new Set(ids)] };
  openDrawer('findrill', 'x');
}
DRAWER_FN.findrill = () => {
  const d = UI.fin.drill; if (!d) return null;
  const tx = d.ids.map(id => FS.by.get(id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const byCur = {}; for (const t of tx) { const c = t.currency || (finAcct(t.acct) || {}).currency || finP().base; byCur[c] = (byCur[c] || 0) + (t.amount || 0); }
  return `<div class="drawer-h"><h2>${esc(d.title)}</h2><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
    <div class="drawer-b"><p class="small muted">${tx.length} transaction${tx.length === 1 ? '' : 's'} · sum of the amounts as recorded: ${Object.entries(byCur).map(([c, v]) => fm(v, c)).join(' · ')}</p>
    <button class="btn sm" data-act="fin-drill-ledger">Show in Transactions</button>
    <div class="fin-mini">${tx.slice(0, 300).map(t => `<button class="fin-mini-r" data-act="fin-edit" data-id="${esc(t.id)}"><span class="muted small">${fday(t.date)}</span><span>${esc(t.clean || FIN.cleanDesc(t.desc))}<small class="muted"> · ${esc((finCat(t.cat) || {}).name || '')}</small></span>${fmc(t.amount, t.currency || (finAcct(t.acct) || {}).currency)}</button>`).join('')}${tx.length > 300 ? `<p class="small muted">First 300 shown — open in Transactions for all.</p>` : ''}</div></div>`;
};

/* --- the ledger --- */
const FIN_COLS = [['id', 'ID'], ['date', 'Date'], ['acct', 'Account'], ['desc', 'Original description'], ['clean', 'Cleaned description'], ['type', 'Type'], ['cat', 'Category'], ['debit', 'Debit'], ['credit', 'Credit'], ['amount', 'Net'], ['cur', 'Cur.'], ['balance', 'Balance'], ['src', 'Source'], ['note', 'Notes'], ['status', 'Status']];
function finLedgerRows() {
  const L = UI.fin.l, f = UI.fin.f, q = FIN.norm(L.q || '');
  let rows = finTx().slice();
  if (L.ids) { const s = new Set(L.ids); rows = rows.filter(t => s.has(t.id)); }
  else {
    if (f.from) rows = rows.filter(t => !t.date || t.date >= f.from); if (f.to) rows = rows.filter(t => !t.date || t.date <= f.to);
    if (f.acct || L.acct) rows = rows.filter(t => t.acct === (L.acct || f.acct));
    if (f.cat || L.cat) rows = rows.filter(t => t.cat === (L.cat || f.cat));
  }
  if (L.type) rows = rows.filter(t => finType(t) === L.type);
  if (L.status) rows = rows.filter(t => finStatus(t) === L.status);
  if (q) rows = rows.filter(t => FIN.norm([t.desc, t.clean, t.note, t.ref, t.id, (finCat(t.cat) || {}).name, t.sub].join(' ')).includes(q));
  const key = { date: t => t.date || '', amount: t => t.amount || 0, acct: t => (finAcct(t.acct) || {}).name || '', desc: t => t.desc || '', cat: t => (finCat(t.cat) || {}).name || '', type: finType, status: finStatus, id: t => t.id, balance: t => t.balance ?? -Infinity }[L.sort] || (t => t.date || '');
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : a.id.localeCompare(b.id)) * L.dir; });
  return rows;
}
const finShortId = id => id.slice(-6).toUpperCase();
FIN_VIEW.ledger = () => {
  const L = UI.fin.l, rows = finLedgerRows(), per = 100, pages = Math.max(1, Math.ceil(rows.length / per)), page = Math.min(L.page, pages - 1), sel = UI.fin.sel, p = finP();
  const shown = rows.slice(page * per, page * per + per);
  const types = ['Income', 'Expense', 'Refund', 'Own transfer', 'Savings move', 'Investment move', 'Card payment', 'Debt principal', 'Held for someone', 'Sale proceeds', 'Incomplete'];
  const th = (k, l) => `<th><button class="fin-sort" data-act="fin-sort" data-k="${k}">${l}${L.sort === k ? (L.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  return `${L.ids ? `<div class="callout">Showing ${L.ids.length} transactions: <b>${esc(L.idsLabel)}</b> <button class="btn sm" data-act="fin-ledger-all">Show all</button></div>` : ''}
  <div class="toolbar fin-ltools">
    <label class="search">${I.search}<span class="sr">Search transactions</span><input class="input" id="fin-q" type="search" placeholder="Search description, notes, reference, ID…" value="${esc(L.q)}"></label>
    <select class="input" data-chg="fin-l" data-k="type" aria-label="Type"><option value="">All types</option>${types.map(t => `<option ${L.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    <select class="input" data-chg="fin-l" data-k="status" aria-label="Status"><option value="">Any status</option><option value="review" ${L.status === 'review' ? 'selected' : ''}>To check</option><option value="incomplete" ${L.status === 'incomplete' ? 'selected' : ''}>Incomplete</option><option value="ok" ${L.status === 'ok' ? 'selected' : ''}>Checked</option></select>
    <span class="spacer"></span><span class="small muted">${rows.length} transaction${rows.length === 1 ? '' : 's'}</span>
    <button class="btn sm" data-act="fin-export" data-f="csv">Export CSV</button><button class="btn sm" data-act="fin-export" data-f="xlsx">Export Excel</button>
  </div>
  ${sel.size ? `<div class="fin-bulk"><b>${sel.size} selected</b>
    <select class="input" id="fin-bulk-cat" aria-label="Category for the selected"><option value="">Set category…</option>${finCatOptions('', null)}</select><button class="btn sm primary" data-act="fin-bulk-cat">Apply</button>
    ${p.parties.length ? `<select class="input" id="fin-bulk-party" aria-label="Person"><option value="">Money of…</option>${p.parties.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button class="btn sm" data-act="fin-bulk-party">Assign</button>` : ''}
    <button class="btn sm" data-act="fin-bulk-ok">Mark checked</button><button class="btn sm danger" data-act="fin-bulk-del">Delete…</button><button class="btn sm ghost" data-act="fin-sel-none">Clear selection</button></div>` : ''}
  <div class="tbl-wrap fin-ledger"><table class="tbl"><thead><tr><th><input type="checkbox" aria-label="Select all on this page" data-chg="fin-sel-page" ${shown.length && shown.every(t => sel.has(t.id)) ? 'checked' : ''}></th>${FIN_COLS.map(([k, l]) => ['id', 'date', 'acct', 'desc', 'cat', 'type', 'amount', 'balance', 'status'].includes(k) ? th(k, l) : `<th>${l}</th>`).join('')}</tr></thead>
  <tbody>${shown.map(t => { const a = finAcct(t.acct) || {}, c = finCat(t.cat) || {}, cur = t.currency || a.currency || p.base, st = finStatus(t);
    return `<tr class="${st !== 'ok' ? 'fin-' + st : ''}"><td><input type="checkbox" data-chg="fin-sel" data-id="${esc(t.id)}" ${sel.has(t.id) ? 'checked' : ''} aria-label="Select"></td>
      <td class="mono"><button class="linkish" data-act="fin-edit" data-id="${esc(t.id)}">${finShortId(t.id)}</button></td><td class="nowrap">${t.date ? fday(t.date) : '<span class="fin-neg">no date</span>'}</td><td>${esc(a.name || t.acct)}</td>
      <td class="fin-desc" title="${esc(t.desc)}">${esc(t.desc || '')}</td><td>${esc(t.clean || FIN.cleanDesc(t.desc || ''))}</td><td>${esc(finType(t))}</td><td>${esc(c.name || '')}${t.sub ? ` › ${esc(t.sub)}` : ''}${t.party ? ` <span class="fin-tag">${esc((p.parties.find(x => x.id === t.party) || { name: t.party }).name)}</span>` : ''}</td>
      <td class="num">${typeof t.amount === 'number' && t.amount < 0 ? fm(-t.amount, cur) : ''}</td><td class="num">${typeof t.amount === 'number' && t.amount > 0 ? fm(t.amount, cur) : ''}</td><td class="num">${typeof t.amount === 'number' ? fmc(t.amount, cur) : '<span class="fin-neg">?</span>'}</td><td>${esc(cur)}</td>
      <td class="num">${typeof t.balance === 'number' ? fm(t.balance, cur) : ''}</td><td class="small">${t.src && t.src.f ? `${esc(t.src.f)}${t.src.r ? ` · line ${t.src.r}` : ''}` : t.manual ? 'entered by hand' : ''}${(t.srcs || []).length ? ` <span class="muted">+${t.srcs.length}</span>` : ''}</td>
      <td class="small">${esc(t.note || '')}</td><td>${st === 'review' ? '<span class="fin-tag warn">to check</span>' : st === 'incomplete' ? '<span class="fin-tag crit">incomplete</span>' : '<span class="fin-tag ok">✓</span>'}</td></tr>`; }).join('') || `<tr><td colspan="${FIN_COLS.length + 1}" class="muted">No transactions match.</td></tr>`}</tbody></table></div>
  ${pages > 1 ? `<div class="row"><button class="btn sm" data-act="fin-page" data-d="-1" ${page ? '' : 'disabled'}>‹ Previous</button><span class="small">Page ${page + 1} of ${pages}</span><button class="btn sm" data-act="fin-page" data-d="1" ${page < pages - 1 ? '' : 'disabled'}>Next ›</button></div>` : ''}`;
};

/* --- one transaction: edit, split, see where it came from and what changed --- */
DRAWER_FN.fintx = dr => {
  const isNew = dr.id === 'new', p = finP();
  const t = isNew ? (UI.fin.draft || { id: 'new', date: finToday(), acct: (p.accounts[0] || {}).id || '', amount: null, desc: '', cat: '', manual: true }) : FS.by.get(dr.id);
  if (!t) return null;
  const a = finAcct(t.acct) || {}, cur = t.currency || a.currency || p.base, c = finCat(t.cat) || {};
  const parts = t.parts || [];
  return `<div class="drawer-h"><h2>${isNew ? 'New transaction' : esc(FIN.cleanDesc(t.desc || 'Transaction'))}</h2><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b fin-form">
    ${!isNew ? `<p class="small muted mono">ID ${esc(t.id)}</p>` : ''}
    <div class="grid2">
      <label class="field"><span class="label">Date</span><input class="input" type="date" id="ft-date" value="${esc(t.date || '')}"></label>
      <label class="field"><span class="label">Account</span><select class="input" id="ft-acct">${p.accounts.map(x => `<option value="${esc(x.id)}" ${x.id === t.acct ? 'selected' : ''}>${esc(x.name)} · ${esc(x.currency)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Amount (${esc(cur)})</span><input class="input num" id="ft-amt" inputmode="decimal" value="${typeof t.amount === 'number' ? Math.abs(t.amount) : ''}" placeholder="0.00"></label>
      <label class="field"><span class="label">Direction</span><select class="input" id="ft-dir"><option value="out" ${!(t.amount > 0) ? 'selected' : ''}>Money out</option><option value="in" ${t.amount > 0 ? 'selected' : ''}>Money in</option></select></label>
    </div>
    <label class="field"><span class="label">Original description</span>${isNew ? `<input class="input" id="ft-desc" value="${esc(t.desc)}">` : `<div class="src-text small">${esc(t.desc || '')}${t.desc0 && t.desc0 !== t.desc ? `<br><span class="muted">first imported as: ${esc(t.desc0)}</span>` : ''}</div>`}</label>
    <label class="field"><span class="label">Cleaned description</span><input class="input" id="ft-clean" value="${esc(t.clean || FIN.cleanDesc(t.desc || ''))}"></label>
    <div class="grid2">
      <label class="field"><span class="label">Category</span><select class="input" id="ft-cat"><option value="">— choose —</option>${finCatOptions(t.cat, null)}</select></label>
      <label class="field"><span class="label">Subcategory</span><input class="input" id="ft-sub" list="ft-subs" value="${esc(t.sub || '')}"><datalist id="ft-subs">${(c.subs || []).map(s => `<option value="${esc(s)}">`).join('')}</datalist></label>
      <label class="field"><span class="label">Refund of (category)</span><select class="input" id="ft-rcat"><option value="">—</option>${finCatOptions(t.rcat, ['expense'])}</select></label>
      <label class="field"><span class="label">Whose money</span><select class="input" id="ft-party"><option value="">Mine</option>${p.parties.map(x => `<option value="${esc(x.id)}" ${t.party === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Linked holding / property</span><select class="input" id="ft-hold"><option value="">—</option>${p.holdings.map(h => `<option value="${esc(h.id)}" ${t.holding === h.id ? 'selected' : ''}>${esc(h.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="label">Status</span><select class="input" id="ft-review"><option value="0">Checked</option><option value="1" ${t.review ? 'selected' : ''}>To check</option></select></label>
    </div>
    <label class="field"><span class="label">Notes</span><textarea class="input autogrow" id="ft-note">${esc(t.note || '')}</textarea></label>
    <details class="fin-split" ${parts.length ? 'open' : ''}><summary>Split into parts (e.g. installment principal, interest and fees)</summary>
      <p class="small muted">The parts must add up to the amount. Leave empty for no split.</p>
      ${[0, 1, 2, 3].map(i => `<div class="row"><input class="input num" id="ft-p${i}-a" inputmode="decimal" placeholder="amount" value="${parts[i] ? Math.abs(parts[i].amount) : ''}"><select class="input" id="ft-p${i}-c"><option value="">— category —</option>${finCatOptions(parts[i] && parts[i].cat, null)}</select></div>`).join('')}
    </details>
    ${!isNew ? `<details><summary>Where it came from</summary>${t.src ? `<p class="small">${t.src.f ? `<b>${esc(t.src.f)}</b>${t.src.r ? ` · line ${t.src.r}` : ''}` : t.manual ? 'Entered by hand' : ''}${t.src.raw ? `<br><span class="mono small">${esc(t.src.raw)}</span>` : ''}</p>` : ''}${(t.srcs || []).map(s => `<p class="small muted">Also in <b>${esc(s.f)}</b>${s.r ? ` · line ${s.r}` : ''}</p>`).join('')}${t.pair ? `<p class="small">Other side: <button class="linkish" data-act="fin-edit" data-id="${esc(t.pair)}">${finShortId(t.pair)}</button></p>` : ''}</details>
    <details><summary>History (${(t.hist || []).length})</summary><ul class="small fin-hist">${(t.hist || []).slice().reverse().map(h => `<li><span class="muted">${fmtDateTime(h.at)}</span> ${esc(h.why || '')}: ${esc(h.f)} ${h.from !== null && h.from !== undefined ? `<s>${esc(String(h.from))}</s> → ` : ''}${esc(String(h.to ?? ''))}</li>`).join('') || '<li class="muted">No changes since it was recorded.</li>'}</ul></details>` : ''}
    <div class="row end">${!isNew ? `<button class="btn danger" data-act="fin-del" data-id="${esc(t.id)}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary" data-act="fin-save-tx" data-id="${esc(t.id)}">${isNew ? 'Add' : 'Save'}</button></div>
  </div>`;
};
function finSaveTx(id) {
  const v = k => ($('#' + k) || {}).value || '';
  const isNew = id === 'new', old = isNew ? null : FS.by.get(id); if (!isNew && !old) return;
  const t = isNew ? { id: E.uid('tx'), manual: true, createdAt: nowISO(), src: { f: '', manual: true }, hist: [] } : clone(old);
  const amtN = FIN.parseNum(v('ft-amt')), amt = amtN ? Math.abs(amtN.n) * (v('ft-dir') === 'in' ? 1 : -1) : null;
  const set = (f, val, why) => { const cur = t[f] ?? null; if (JSON.stringify(cur) === JSON.stringify(val ?? null)) return; if (!isNew) finHist(t, f, cur, val, why || 'edited'); t[f] = val; };
  set('date', v('ft-date') || null); set('acct', v('ft-acct')); set('amount', amt === null ? null : FIN.r2(amt));
  if (isNew) t.desc = v('ft-desc').trim();
  set('clean', v('ft-clean').trim() || null); set('sub', v('ft-sub').trim()); set('rcat', v('ft-rcat') || ''); set('party', v('ft-party') || ''); set('holding', v('ft-hold') || ''); set('note', v('ft-note').trim()); set('review', v('ft-review') === '1');
  const cat = v('ft-cat') || (amt > 0 ? 'other_inc' : 'other_exp'), catChanged = !isNew && cat !== old.cat;
  set('cat', cat, 'category changed by you'); if (catChanged || isNew) t.catSrc = 'manual';
  if ((t.flags || []).length && amt !== null && t.date) t.flags = (t.flags || []).filter(f => !['no_date', 'no_amount', 'no_year', 'direction_unknown'].includes(f));
  const parts = [0, 1, 2, 3].map(i => ({ a: FIN.parseNum(v(`ft-p${i}-a`)), c: v(`ft-p${i}-c`) })).filter(x => x.a && x.c).map(x => ({ amount: FIN.r2(Math.abs(x.a.n) * Math.sign(amt || -1)), cat: x.c }));
  if (parts.length) { const s = parts.reduce((a, b) => a + b.amount, 0); if (Math.abs(s - amt) > 0.005) { toast(`The parts add up to ${fm(s)}, not ${fm(amt)}.`, { err: true }); return; } set('parts', parts, 'split'); }
  else if (t.parts && t.parts.length) set('parts', null, 'split removed');
  if (!finAcct(t.acct)) { toast('Choose an account (add one in Accounts).', { err: true }); return; }
  t.updatedAt = nowISO();
  finWrite([t]);
  // a category you choose is remembered for that payee
  if (catChanged && t.desc) {
    finSave(p => { p.rules = FIN.learnRule(p.rules, t, cat, t.sub); });
    const key = FIN.payeeKey(t.desc), same = finTx().filter(x => x.id !== t.id && x.catSrc !== 'manual' && x.cat !== cat && FIN.payeeKey(x.desc) === key && Math.sign(x.amount) === Math.sign(t.amount));
    if (same.length) UI.fin.offer = { cat, ids: same.map(x => x.id), name: FIN.cleanDesc(t.desc) };
  }
  closeDrawer(); render();
  if (UI.fin.offer) finOfferToast();
  else toast(isNew ? 'Transaction added.' : 'Saved.');
}
function finOfferToast() {
  const o = UI.fin.offer; if (!o) return;
  toast(`${o.ids.length} other transaction${o.ids.length === 1 ? '' : 's'} from “${o.name}” — use ${(finCat(o.cat) || {}).name} for ${o.ids.length === 1 ? 'it' : 'them'} too?`, { action: 'Apply', fn: () => { finBulkCat(o.ids, o.cat, 'same payee as your correction'); UI.fin.offer = null; } });
}
function finBulkCat(ids, cat, why) {
  const ch = []; for (const id of ids) { const o = FS.by.get(id); if (!o) continue; const t = clone(o); if (t.cat !== cat) { finHist(t, 'cat', t.cat, cat, why || 'bulk change'); t.cat = cat; t.catSrc = 'manual'; t.review = false; ch.push(t); } }
  if (ch.length) { finWrite(ch); finLog('bulk category', { ids: ch.map(t => t.id), cat }); toast(`${ch.length} transaction${ch.length === 1 ? '' : 's'} updated.`); }
  render();
}
function finExport(kind) {
  const rows = finLedgerRows(), p = finP();
  const head = ['ID', 'Date', 'Account', 'Original description', 'Cleaned description', 'Type', 'Category', 'Subcategory', 'Debit', 'Credit', 'Net', 'Currency', 'Balance', 'Source file', 'Source line', 'Notes', 'Status', 'Whose money'];
  const data = rows.map(t => { const a = finAcct(t.acct) || {}; return [t.id, t.date || '', a.name || t.acct, t.desc || '', t.clean || FIN.cleanDesc(t.desc || ''), finType(t), (finCat(t.cat) || {}).name || '', t.sub || '', t.amount < 0 ? -t.amount : '', t.amount > 0 ? t.amount : '', t.amount ?? '', t.currency || a.currency || p.base, t.balance ?? '', t.src && t.src.f || (t.manual ? 'entered by hand' : ''), t.src && t.src.r || '', t.note || '', finStatus(t), t.party ? (p.parties.find(x => x.id === t.party) || { name: t.party }).name : 'me']; });
  const name = `money-transactions-${finToday()}`;
  if (kind === 'csv') return offerFile(name + '.csv', '﻿' + [head, ...data].map(r => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
  E.need('xlsx').then(X => {
    const ws = X.utils.aoa_to_sheet([head, ...data]); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Transactions');
    const out = X.write(wb, { type: 'array', bookType: 'xlsx' });
    offerFile(name + '.xlsx', new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }).catch(e => toast('Excel export failed: ' + (e.message || e), { err: true }));
}

Object.assign(ACT, {
  'fin-sec': el => { UI.fin.sec = el.dataset.s; UI.fin.sel.clear(); if (UI.view !== 'finance') go('finance'); else { render(); window.scrollTo(0, 0); } },
  'fin-f-reset': () => { UI.fin.f = { from: '', to: '', acct: '', cat: '' }; render(); },
  'fin-drill': el => { if (el.dataset.kind) finDrill({ kind: el.dataset.kind, k: el.dataset.k }); },
  'fin-drill-month': el => finDrill({ kind: 'month', k: el.dataset.k }),
  'fin-drill-cat': el => finDrill({ kind: 'cat', k: el.dataset.k }),
  'fin-drill-catmonth': el => finDrill({ kind: 'catmonth', k: el.dataset.k }),
  'fin-drill-ledger': () => { const d = UI.fin.drill; closeDrawer(); UI.fin.l = { ...UI.fin.l, ids: d.ids, idsLabel: d.title, page: 0 }; UI.fin.sec = 'ledger'; render(); },
  'fin-ledger-all': () => { UI.fin.l.ids = null; render(); },
  'fin-ledger-status': el => { UI.fin.l = { ...UI.fin.l, status: el.dataset.v, ids: null, page: 0 }; UI.fin.sec = 'ledger'; render(); },
  'fin-sort': el => { const L = UI.fin.l; if (L.sort === el.dataset.k) L.dir = -L.dir; else { L.sort = el.dataset.k; L.dir = el.dataset.k === 'date' || el.dataset.k === 'amount' ? -1 : 1; } render(); },
  'fin-page': el => { UI.fin.l.page = Math.max(0, UI.fin.l.page + +el.dataset.d); render(); },
  'fin-edit': el => { UI.fin.draft = null; openDrawer('fintx', el.dataset.id); },
  'fin-new-tx': () => { if (!finP().accounts.length) { UI.fin.sec = 'accounts'; go('finance'); toast('Add an account first.'); return; } UI.fin.draft = null; openDrawer('fintx', 'new'); },
  'fin-save-tx': el => finSaveTx(el.dataset.id),
  'fin-del': el => { const t = FS.by.get(el.dataset.id); if (!t || !confirm('Delete this transaction? It is removed from every total; the deletion is kept in the log.')) return; finLog('deleted', { ids: [t.id], tx: [t] }); finWrite([], [t.id]); closeDrawer(); render(); toast('Deleted.'); },
  'fin-export': el => finExport(el.dataset.f),
  'fin-sel-none': () => { UI.fin.sel.clear(); render(); },
  'fin-bulk-cat': () => { const c = ($('#fin-bulk-cat') || {}).value; if (!c) return toast('Choose a category.', { err: true }); finBulkCat([...UI.fin.sel], c, 'bulk change'); UI.fin.sel.clear(); render(); },
  'fin-bulk-party': () => { const pid = ($('#fin-bulk-party') || {}).value; if (!pid) return; const ch = [...UI.fin.sel].map(id => FS.by.get(id)).filter(Boolean).map(o => { const t = clone(o); finHist(t, 'party', t.party || '', pid, 'bulk change'); t.party = pid; t.cat = 'held'; t.catSrc = 'manual'; return t; }); finWrite(ch); finLog('assigned to a person', { ids: ch.map(t => t.id), party: pid }); UI.fin.sel.clear(); render(); toast(`${ch.length} marked as money of ${(finP().parties.find(x => x.id === pid) || {}).name}.`); },
  'fin-bulk-ok': () => { const ch = [...UI.fin.sel].map(id => FS.by.get(id)).filter(t => t && t.review).map(o => { const t = clone(o); finHist(t, 'review', true, false, 'checked'); t.review = false; return t; }); finWrite(ch); UI.fin.sel.clear(); render(); toast(`${ch.length} marked as checked.`); },
  'fin-bulk-del': () => { const ids = [...UI.fin.sel]; if (!ids.length || !confirm(`Delete ${ids.length} transaction${ids.length === 1 ? '' : 's'}? The deletion is kept in the log.`)) return; finLog('deleted', { ids, tx: ids.map(id => FS.by.get(id)).filter(Boolean) }); finWrite([], ids); UI.fin.sel.clear(); render(); toast(`${ids.length} deleted.`); },
});
Object.assign(CHG, {
  'fin-f': el => { UI.fin.f[el.dataset.k] = el.value; UI.fin.l.page = 0; render(); },
  'fin-l': el => { UI.fin.l[el.dataset.k] = el.value; UI.fin.l.page = 0; render(); },
  'fin-sel': el => { if (el.checked) UI.fin.sel.add(el.dataset.id); else UI.fin.sel.delete(el.dataset.id); render(); },
  'fin-sel-page': el => { const rows = finLedgerRows(), per = 100, page = UI.fin.l.page, shown = rows.slice(page * per, page * per + per); shown.forEach(t => el.checked ? UI.fin.sel.add(t.id) : UI.fin.sel.delete(t.id)); render(); },
});
// live search in the ledger
document.addEventListener('input', e => { if (e.target && e.target.id === 'fin-q') { UI.fin.l.q = e.target.value; UI.fin.l.page = 0; clearTimeout(UI.fin.qT); UI.fin.qT = setTimeout(() => { const pos = e.target.selectionStart; render(); const n = $('#fin-q'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }, 200); } });
// charts are drawn at the width they get, so their text stays at its size on any screen
HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance') return;
  let again = false; const now = Date.now(); FIN_W._n = now - (FIN_W._t || 0) < 1500 ? (FIN_W._n || 0) + 1 : 0; FIN_W._t = now;
  if (FIN_W._n > 3) return;   // never chase a size in a loop
  document.querySelectorAll('.fin-chart[data-key]:not([data-key=""])').forEach(svg => { const w = Math.round(svg.getBoundingClientRect().width); if (w > 120 && Math.abs(w - +svg.dataset.w) > 24) { FIN_W[svg.dataset.key] = Math.max(300, w); again = true; } });
  if (again) scheduleRender();
  const cur = document.querySelector('.fin-nav [aria-current="page"]'); if (cur && cur.scrollIntoView && document.querySelector('.fin-nav').scrollWidth > document.querySelector('.fin-nav').clientWidth) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
});
// a test hook
window.__FIN = { tx: () => finTx(), an: o => finAn(o || {}), prefs: () => finP(), pos: () => finPosition(), third: id => FIN.thirdParty(finTx(), finP().parties).find(x => x.id === (id || 'ahmed')), sim: () => finSimRun(), batches: () => colList('finbatch') };
