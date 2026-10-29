/* ---------- Money: accounts and reconciliation, what I own and owe, others' money, settings and backup ---------- */
function finRecon() { const p = finP(), tx = finTx(), bs = colList('finbatch').filter(b => !b.undone); return Object.fromEntries(p.accounts.map(a => [a.id, FIN.reconcile(a, tx, bs)])); }
// an installment plan: what is still owed = my share of the contract − payments recorded (from my accounts, from
// interest allocated to it, and before these records); unknown until the contract total is entered
function finLiab(h) {
  const p = finP(), tx = finTx().filter(t => t.holding === h.id && typeof t.amount === 'number' && t.amount < 0);
  const fromMe = -tx.reduce((s, t) => s + t.amount, 0);
  const fromAlloc = p.holdings.filter(x => x.allocTo === h.id).flatMap(x => x.log || []).reduce((s, l) => s + (+l.allocated || 0), 0);
  const before = +h.paidBefore || 0, total = +h.total || 0;
  return { fromMe: FIN.r2(fromMe), fromAlloc: FIN.r2(fromAlloc), before, paid: FIN.r2(fromMe + fromAlloc + before), total: total || null, remaining: total ? FIN.r2(Math.max(0, total - fromMe - fromAlloc - before)) : null, n: tx.length, ids: tx.map(t => t.id) };
}
function finPosition() {
  const p = finP(), tx = finTx();
  const holdings = p.holdings.map(h => h.kind === 'liability' ? { ...h, remaining: finLiab(h).remaining } : h);
  return FIN.position({ base: p.base, rates: p.rates, accounts: p.accounts, recon: finRecon(), thirdParty: FIN.thirdParty(tx, p.parties), parties: p.parties, holdings, txs: tx });
}
const finPartyName = id => id === 'me' || !id ? 'Me' : (finP().parties.find(x => x.id === id) || { name: id }).name;

/* --- accounts and reconciliation --- */
FIN_VIEW.accounts = () => {
  const p = finP(), rec = finRecon(), tx = finTx();
  const unpaired = tx.filter(t => ['transfer', 'ccpay', 'savings', 'invest'].includes(t.cat) && !t.pair && p.accounts.length > 1);
  return `<section class="card fin-card"><h2>Accounts</h2>
    ${p.accounts.length ? `<div class="tbl-wrap"><table class="tbl fin-acct"><thead><tr><th>Name</th><th>Bank</th><th>Type</th><th>Currency</th><th>Account no.</th><th>Belongs to</th><th>In the name of</th><th>Opening balance</th><th>on</th><th></th></tr></thead><tbody>${p.accounts.map((a, i) => `<tr>
      <td><input class="input sm" data-chg="fin-acct" data-i="${i}" data-k="name" value="${esc(a.name)}"></td><td><input class="input sm" data-chg="fin-acct" data-i="${i}" data-k="bank" value="${esc(a.bank || '')}"></td>
      <td><select class="input sm" data-chg="fin-acct" data-i="${i}" data-k="kind">${FIN_AKINDS.map(([k, l]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><select class="input sm" data-chg="fin-acct" data-i="${i}" data-k="currency">${FIN.CURRENCIES.map(k => `<option ${a.currency === k ? 'selected' : ''}>${k}</option>`).join('')}</select></td>
      <td><input class="input sm mono" data-chg="fin-acct" data-i="${i}" data-k="number" value="${esc(a.number || '')}"></td>
      <td><select class="input sm" data-chg="fin-acct" data-i="${i}" data-k="owner"><option value="me">Me</option>${p.parties.map(x => `<option value="${esc(x.id)}" ${a.owner === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></td>
      <td><input class="input sm" data-chg="fin-acct" data-i="${i}" data-k="holder" value="${esc(a.holder && a.holder !== 'me' ? a.holder : '')}" placeholder="me"></td>
      <td><input class="input num sm" data-chg="fin-acct" data-i="${i}" data-k="opening" value="${esc(a.opening ?? '')}" inputmode="decimal"></td><td><input class="input sm" type="date" data-chg="fin-acct" data-i="${i}" data-k="openingDate" value="${esc(a.openingDate || '')}"></td>
      <td><button class="icon-btn" data-act="fin-acct-del" data-i="${i}" aria-label="Remove">${I.x}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">No accounts yet — importing a statement creates one, or add it here.</p>'}
    <button class="btn sm" data-act="fin-acct-add">${I.plus} Account</button>
    <p class="small muted">The opening balance is optional: it lets the app calculate a balance between statements (shown as an estimate). Statement balances are always preferred.</p></section>
  ${p.accounts.map(a => { const r = rec[a.id], st = r.status; const card = a.kind === 'credit_card' ? FIN.cardOwed(a, r, tx) : null;
    return `<section class="card fin-card"><div class="row"><h2>${esc(a.name)} <small class="muted">${esc(a.currency)}</small></h2><span class="fin-tag ${st === 'reconciled' ? 'ok' : st === 'differences' ? 'crit' : ''}">${st === 'reconciled' ? '✓ reconciled' : st === 'differences' ? 'differences found' : 'not enough data'}</span><span class="spacer"></span><button class="btn sm ghost" data-act="fin-acct-ledger" data-id="${esc(a.id)}">${r.count} transactions</button></div>
      <div class="fin-grid2"><div>
        <div class="fin-kv"><span>Balance on the latest statement<small class="muted">confirmed</small></span><b class="num">${r.confirmed ? `${fm(r.confirmed.balance, a.currency)}<small class="muted"> ${fday(r.confirmed.date)}</small>` : '—'}</b></div>
        <div class="fin-kv"><span>Calculated balance<small class="muted">${r.basis ? esc(r.basis) : 'set an opening balance to calculate'}</small></span><b class="num">${r.computed !== null ? fm(r.computed, a.currency) + ' ' + finEst : '—'}</b></div>
        ${r.diff !== null ? `<div class="fin-kv"><span>Difference</span><b class="num ${Math.abs(r.diff) >= 0.005 ? 'fin-neg' : 'fin-pos'}">${fm(r.diff, a.currency)}</b></div>` : ''}
        ${card ? `<div class="fin-kv"><span>Owed on the card${card.verified ? '' : '<small class="muted">estimate</small>'}</span><b class="num">${fm(card.owed, a.currency)}</b></div>` : ''}
        ${r.incomplete ? `<p class="small fin-neg">${r.incomplete} incomplete transaction${r.incomplete === 1 ? '' : 's'} not counted.</p>` : ''}
      </div><div>
        ${r.mismatches.length ? `<p class="small fin-neg">${r.mismatches.length} line${r.mismatches.length === 1 ? '' : 's'} where the running balance does not add up — a line may be missing or misread. <button class="btn sm" data-act="fin-drill-ids" data-ids="${esc(r.mismatches.join(','))}" data-t="Balance does not add up">Show</button></p>` : ''}
        ${r.gaps.length ? `<p class="small">Missing periods (no statement): ${r.gaps.map(g => `${fday(g.from)} – ${fday(g.to)}`).join(', ')}</p>` : ''}
        ${r.dups.length ? `<p class="small fin-neg">${r.dups.length} group${r.dups.length === 1 ? '' : 's'} of identical transactions (same date, amount, payee, reference). ${r.dups.map((g, i) => `<button class="btn sm" data-act="fin-drill-ids" data-ids="${esc(g.join(','))}" data-t="Identical transactions">Group ${i + 1}</button><button class="btn sm ghost" data-act="fin-dup-ok" data-ids="${esc(g.join(','))}">Both are real</button>`).join(' ')}</p>` : ''}
      </div></div>
      ${a.kind === 'credit_card' ? (() => { const cyc = r.statements.map(s => { const tt = tx.filter(t => t.acct === a.id && t.date >= s.from && t.date <= s.to && typeof t.amount === 'number'); return { s, buy: -tt.filter(t => t.amount < 0).reduce((x, t) => x + t.amount, 0), paid: tt.filter(t => t.amount > 0 && t.cat === 'ccpay').reduce((x, t) => x + t.amount, 0), from: tt.filter(t => t.amount > 0 && t.cat === 'ccpay' && t.pair).map(t => FS.by.get(t.pair)).filter(Boolean) }; });
        return cyc.length ? `<h3>Purchases and repayments</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Statement</th><th class="num">Purchases (counted as spending)</th><th class="num">Repaid (not spending again)</th><th>Paid from</th><th class="num">Owed at the end</th></tr></thead><tbody>${cyc.map(c => `<tr><td class="small nowrap">${fday(c.s.from)} – ${fday(c.s.to)}</td><td class="num">${fm(c.buy, a.currency)}</td><td class="num">${fm(c.paid, a.currency)}</td><td class="small">${c.from.map(t => `${esc((finAcct(t.acct) || {}).name || '')} ${fday(t.date)}`).join(', ') || '—'}</td><td class="num">${c.s.closing === null ? '—' : fm(-c.s.closing, a.currency)}</td></tr>`).join('')}</tbody></table></div>` : ''; })() : ''}
      ${r.statements.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Statement</th><th>Period</th><th class="num">Opening</th><th class="num">Closing</th><th class="num">Opening + lines − closing</th><th>Status</th></tr></thead><tbody>${r.statements.map(s => `<tr><td class="small">${esc(s.file)}</td><td class="small nowrap">${fday(s.from)} – ${fday(s.to)}</td><td class="num">${s.opening === null ? '—' : fm(s.opening, a.currency)}</td><td class="num">${s.closing === null ? '—' : fm(s.closing, a.currency)}</td><td class="num">${s.diff === null ? '—' : fm(s.diff, a.currency)}</td><td>${s.status === 'reconciled' ? '<span class="fin-pos">✓ reconciled</span>' : s.status === 'differences' ? `<span class="fin-neg">differences${s.mismatches ? ` (${s.mismatches} lines)` : ''}</span>` : '<span class="muted">not enough data</span>'}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </section>`; }).join('')}
  ${unpaired.length ? `<section class="card fin-card"><h2>Movements without their other side (${unpaired.length})</h2><p class="small muted">Marked as transfers or card payments, but the matching amount was not found in your other accounts — the other statement may not be imported yet.</p>${finMiniList(unpaired)}</section>` : ''}`;
};
const finMiniList = list => `<div class="fin-mini">${list.slice(0, 100).map(t => `<button class="fin-mini-r" data-act="fin-edit" data-id="${esc(t.id)}"><span class="muted small">${fday(t.date)}</span><span>${esc(FIN.cleanDesc(t.desc || ''))}<small class="muted"> · ${esc((finAcct(t.acct) || {}).name || '')}</small></span>${fmc(t.amount, t.currency || (finAcct(t.acct) || {}).currency)}</button>`).join('')}</div>`;

/* --- what I own, what I owe, what is someone else's --- */
const FIN_HKINDS = [['deposit', 'Deposit / savings'], ['cd', 'Certificate of deposit'], ['managed', 'Money I manage for someone'], ['property', 'Property'], ['liability', 'Installments / debt'], ['other', 'Other asset']];
function finTemplate() {
  // only what you told me; everything else is left for you to fill in from the documents
  const at = nowISO();
  return {
    parties: [{ id: 'ahmed', name: 'Ahmed (brother)', match: 'ahmed, أحمد' }],
    holdings: [
      { id: 'cd63', kind: 'cd', name: 'Certificate of deposit', owner: 'me', custodian: 'me', principal: 63000, currency: 'EGP', rate: '', payDay: 26, maturity: '', match: 'certificate interest, عائد شهادة', verified: false, note: 'Return credited to my bank account on the 26th of each month. Rate and maturity date not verified — enter them from the certificate.', at },
      { id: 'mom', kind: 'deposit', name: 'Deposit in my mother’s account', owner: 'me', custodian: 'my mother', principal: 1380000, currency: 'EGP', rate: 17.25, rateIndicative: true, myShareMonthly: 1300, allocTo: 'inst', match: '', verified: false, log: [], note: 'I am the economic owner; my mother is the account holder. About EGP 1,300 a month of the interest is mine; the rest is allocated to the office installments.', at },
      { id: 'box', kind: 'managed', name: 'Brother’s investment box', owner: 'ahmed', custodian: 'me', principal: 187000, currency: 'EGP', rate: 21, rateIndicative: true, match: '', verified: false, note: 'Owner set to Ahmed — change it if the box belongs to another brother. Returns are his and are paid to him monthly. 21% a year on 187,000 is 3,272.50 a month before any deduction; the ~2,780 you mentioned is about 85% of that — the statements will show the real amount.', at },
      { id: 'off1', kind: 'property', name: 'Office 1', owner: 'me', area: 79, share: 50, soldArea: 0, rentRate: 19, rentCurrency: 'USD', handover: '2027-03-01', rentStart: '', occupancy: 100, mgmtPct: 0, costs: 0, valuation: '', includeValue: false, events: [], unverified: [], note: 'Handover expected March 2027. Verify ownership and rental entitlement against the contract.', at },
      { id: 'off2', kind: 'property', name: 'Office 2', owner: 'me', area: 79, share: 9.5, soldArea: 3, rentRate: 19, rentCurrency: 'USD', handover: '2027-03-01', rentStart: '', occupancy: 100, mgmtPct: 0, costs: 0, valuation: '', includeValue: false,
        events: [{ id: 'sale3', kind: 'sale', area: 3, date: '', proceeds: '', note: 'Sold 3 m² of my share.' }], unverified: [{ amount: 3000000, currency: 'EGP', note: 'Associated with Office 2 — meaning, ownership and link to the installments not verified. Not used in any calculation.' }],
        note: 'Assumes the 3 m² sold comes off my original 7.505 m² and rent is shared by area. Verify against the contract.', at },
      { id: 'inst', kind: 'liability', name: 'Office installments (my share)', owner: 'me', start: '2022-01-01', years: 7, total: '', paidBefore: '', currency: 'EGP', verified: false, note: 'Seven-year plan from 2022. Enter my share of the contract and what was paid before these records, from the contract and the payment history.', at },
    ],
  };
}
FIN_VIEW.own = () => {
  const p = finP(), pos = finPosition(), tp = FIN.thirdParty(finTx(), p.parties), months = Array.from({ length: 12 }, (_, i) => FIN.addMonths(finToday().slice(0, 7), i - 11));
  const line = (x, sign = '') => `<div class="fin-kv"><span>${esc(x.name)}<small class="muted">${x.verified ? 'verified' : 'not verified'}${x.date ? ' · ' + fday(x.date) : ''}${x.note ? ' · ' + esc(x.note) : ''}</small></span><b class="num">${sign}${fm(x.amount, x.currency)}</b></div>`;
  return `${!p.holdings.length ? `<div class="callout">You described a certificate of deposit, money in your mother’s account, your brother’s investment box, two offices and their installments. <button class="btn sm primary" data-act="fin-template">Add them as records</button> — marked “not verified” until you confirm them from the documents.</div>` : ''}
  <section class="card fin-card"><h2>Net worth — your own money</h2><div class="fin-grid2"><div><h3>What you own</h3>${pos.assets.map(a => line(a)).join('') || '<p class="small muted">Nothing yet.</p>'}
    ${pos.insideMine.length ? `<h3>Less: others’ money inside your accounts</h3>${pos.insideMine.map(x => `<div class="fin-kv"><span>${esc(x.name)}</span><b class="num fin-neg">${fm(x.amount, x.currency)}</b></div>`).join('')}` : ''}</div>
    <div><h3>What you owe</h3>${pos.liabilities.map(l => line(l, '−')).join('') || '<p class="small muted">Nothing recorded.</p>'}
      <h3>Net worth</h3>${pos.perCurrency.map(c => `<div class="fin-kv"><span>In ${esc(c.cur)}</span><b class="num">${fm(c.net, c.cur)}</b></div>`).join('')}
      <div class="fin-kv fin-big"><span>Total in ${esc(pos.base)}${pos.estimated ? ' ' + finEst : ''}</span><b class="num">${pos.net !== null ? fm(pos.net) : '—'}</b></div>
      ${pos.missingRates.length ? `<p class="small fin-neg">No total: add a rate for ${pos.missingRates.join(', ')} in Settings. Currencies are never added together without one.</p>` : ''}
      ${pos.notes.map(n => `<p class="small muted">${esc(n)}</p>`).join('')}
      <p class="small muted">Excluded: money held for others, your brother’s investment box, transfers between your accounts, card payments already counted as purchases, property values (unless you include them).</p></div></div></section>
  <section class="card fin-card"><h2>Others’ money</h2><p class="small muted">Money that passes through your accounts but belongs to someone else. Never counted as your income, spending, savings or net worth.</p>
    ${tp.length ? tp.map(x => `<div class="fin-party"><div class="row"><h3>${esc(x.name)}</h3><span class="spacer"></span><span class="small">in <b>${fm(x.in)}</b> · out <b>${fm(x.out)}</b> · still held <b class="${x.held < 0 ? 'fin-neg' : ''}">${fm(x.held)}</b></span></div>
      ${x.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Out</th><th>Matched with</th></tr></thead><tbody>${x.items.map(t => { const ls = x.links.filter(l => l.to === t.id || l.from === t.id); return `<tr><td class="nowrap small">${fday(t.date)}</td><td><button class="linkish" data-act="fin-edit" data-id="${esc(t.id)}">${esc(FIN.cleanDesc(t.desc || ''))}</button></td><td class="num">${t.amount > 0 ? fm(t.amount) : ''}</td><td class="num">${t.amount < 0 ? fm(-t.amount) : ''}</td><td class="small">${ls.map(l => l.from === null ? `<span class="fin-neg">${fm(l.amount)} more paid out than received</span>` : l.to === t.id ? `${fm(l.amount)} from ${fday((FS.by.get(l.from) || {}).date)}` : `${fm(l.amount)} paid out ${fday((FS.by.get(l.to) || {}).date)}`).join('<br>')}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="small muted">No transactions marked yet. Mark them in Transactions (select → “Money of…”).</p>'}</div>`).join('') : ''}
    <h3>People</h3>${p.parties.map((x, i) => `<div class="row"><input class="input" data-chg="fin-party" data-i="${i}" data-k="name" value="${esc(x.name)}"><input class="input" data-chg="fin-party" data-i="${i}" data-k="match" value="${esc(x.match || '')}" placeholder="words in the statement, e.g. his name"><button class="icon-btn" data-act="fin-party-del" data-i="${i}" aria-label="Remove">${I.x}</button></div>`).join('')}
    <button class="btn sm" data-act="fin-party-add">${I.plus} Person</button><p class="small muted">Incoming lines with these words are marked as their money; money going out to them or withdrawn for them you mark in Transactions.</p></section>
  ${p.holdings.map((h, i) => finHoldingHTML(h, i, months)).join('')}
  <div class="row"><select class="input" id="fin-hk">${FIN_HKINDS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select><button class="btn" data-act="fin-hold-add">${I.plus} Holding</button></div>`;
};
function finHoldingHTML(h, i, months) {
  const p = finP(), f = (k, l, o = {}) => `<label class="field"><span class="label">${l}</span><input class="input ${o.num ? 'num' : ''}" ${o.type ? `type="${o.type}"` : ''} data-chg="fin-hold" data-i="${i}" data-k="${k}" value="${esc(h[k] ?? '')}" ${o.num ? 'inputmode="decimal"' : ''} placeholder="${esc(o.ph || '')}"></label>`;
  const owner = `<label class="field"><span class="label">Belongs to</span><select class="input" data-chg="fin-hold" data-i="${i}" data-k="owner"><option value="me">Me</option>${p.parties.map(x => `<option value="${esc(x.id)}" ${h.owner === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>`;
  const ver = `<label class="check"><input type="checkbox" data-chg="fin-hold" data-i="${i}" data-k="verified" ${h.verified ? 'checked' : ''}> verified from documents</label>`;
  let body = '', extra = '';
  if (h.kind === 'property') {
    const s = FIN.propertyShare(h);
    body = `${f('area', 'Total area m²', { num: 1 })}${f('share', 'My original share %', { num: 1 })}${f('soldArea', 'Area I sold m²', { num: 1 })}${f('rentRate', 'Expected rent per m² / month', { num: 1 })}${f('rentCurrency', 'Rent currency')}${f('handover', 'Expected handover', { type: 'date' })}${f('rentStart', 'Rent starts (if known)', { type: 'date' })}${f('occupancy', 'Occupancy %', { num: 1 })}${f('mgmtPct', 'Management fee %', { num: 1 })}${f('costs', 'Maintenance and other costs / month', { num: 1 })}${f('valuation', 'Value (only if verified)', { num: 1 })}`;
    extra = `<p class="small">My area: ${s.origArea} m² original − ${+h.soldArea || 0} m² sold = <b>${s.myArea} m²</b> (${s.effPct}% of the office). Rent ${finEst}: gross <b>${fm(s.grossMonthly, s.currency)}</b> a month (${fm(s.grossAnnual, s.currency)} a year), net <b>${fm(s.netMonthly, s.currency)}</b> after occupancy, fees and costs. Rent counts as income only when it is received.</p>
      <label class="check small"><input type="checkbox" data-chg="fin-hold" data-i="${i}" data-k="includeValue" ${h.includeValue ? 'checked' : ''}> include the value in net worth</label>
      ${(h.events || []).map((e, j) => `<div class="fin-note">📝 ${e.kind === 'sale' ? `Sale of ${e.area} m²` : esc(e.kind)} — ${e.date ? fday(e.date) : 'date not entered'}; proceeds ${e.proceeds ? fm(+e.proceeds) : 'not entered'}. ${esc(e.note || '')} Proceeds that arrive in a statement: categorise them as “Property sale proceeds” and link them to ${esc(h.name)} — they are shown apart, never as income or rent. <input class="input sm" type="date" data-chg="fin-hev" data-i="${i}" data-j="${j}" data-k="date" value="${esc(e.date || '')}"><input class="input num sm" data-chg="fin-hev" data-i="${i}" data-j="${j}" data-k="proceeds" value="${esc(e.proceeds || '')}" placeholder="proceeds" inputmode="decimal"></div>`).join('')}
      ${(h.unverified || []).map(u => `<div class="fin-note">❓ ${fm(u.amount, u.currency)} — ${esc(u.note)}</div>`).join('')}`;
    const proceeds = finTx().filter(t => t.holding === h.id && t.cat === 'prop_sale'); if (proceeds.length) extra += `<p class="small">Sale proceeds recorded: ${proceeds.map(t => `${fm(t.amount)} on ${fday(t.date)}`).join(', ')}</p>`;
  } else if (h.kind === 'liability') {
    const L = finLiab(h);
    body = `${f('total', 'My share of the contract (total)', { num: 1 })}${f('paidBefore', 'Paid before these records', { num: 1 })}${f('start', 'Plan started', { type: 'date' })}${f('years', 'Years', { num: 1 })}`;
    extra = `<p class="small">Paid: from my accounts <b>${fm(L.fromMe)}</b> (${L.n} payment${L.n === 1 ? '' : 's'} linked)${L.fromAlloc ? ` + from allocated interest <b>${fm(L.fromAlloc)}</b>` : ''}${L.before ? ` + before ${fm(L.before)}` : ''} = ${fm(L.paid)}. Still owed: <b>${L.remaining === null ? 'unknown — enter the contract total' : fm(L.remaining)}</b>.</p>${L.n ? `<button class="btn sm ghost" data-act="fin-drill-ids" data-ids="${esc(L.ids.join(','))}" data-t="${esc(h.name)}">Payments</button>` : ''}<p class="small muted">Link each installment payment in Transactions (category “Property installments”, linked holding “${esc(h.name)}”); split it there into principal, financing charges and fees when the receipt shows them.</p>`;
  } else {
    const R = FIN.holdingReturns(h, finTx(), months), last = R.rows.filter(r => r.n || r.expected !== null).slice(-6);
    body = `${owner}${f('custodian', 'Account in the name of', { ph: 'me' })}${f('principal', 'Principal', { num: 1 })}${f('currency', 'Currency')}${f('rate', 'Return % a year (as stated)', { num: 1 })}${f('payDay', 'Paid on day', { num: 1 })}${f('maturity', 'Matures', { type: 'date' })}${f('match', 'Words that identify its payments', { ph: 'e.g. certificate interest' })}${h.kind === 'deposit' ? f('myShareMonthly', 'My share of the interest / month', { num: 1 }) : ''}`;
    extra = `<p class="small">${R.expectedMonthly !== null ? `Expected return ${finEst}: <b>${fm(R.expectedMonthly, h.currency)}</b> a month (${h.principal} × ${h.rate}% ÷ 12${h.rateIndicative ? ', indicative rate' : ''}).` : 'No rate entered — expected return not calculated.'} Received so far: <b>${fm(R.received, h.currency)}</b>${R.paidOut ? `, paid out <b>${fm(R.paidOut, h.currency)}</b>, not yet paid out <b>${fm(R.received - R.paidOut, h.currency)}</b>` : ''}.</p>
      ${last.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Month</th><th class="num">Expected</th><th class="num">Received</th><th class="num">Difference</th>${R.paidOut ? '<th class="num">Paid out</th>' : ''}</tr></thead><tbody>${last.map(r => `<tr><td>${fmon(r.m)}</td><td class="num">${r.expected === null ? '—' : fm(r.expected, h.currency)}</td><td class="num">${fm(r.actual, h.currency)}</td><td class="num">${r.gap === null ? '—' : fmc(r.gap, h.currency)}</td>${R.paidOut ? `<td class="num">${fm(r.paidOut, h.currency)}</td>` : ''}</tr>`).join('')}</tbody></table></div>` : ''}
      ${h.kind === 'deposit' && h.custodian && h.custodian !== 'me' ? `<h4>Interest log (the account is not yours, so enter what the bank paid)</h4>${(h.log || []).map((l, j) => `<div class="row"><input class="input sm" type="month" data-chg="fin-hlog" data-i="${i}" data-j="${j}" data-k="m" value="${esc(l.m || '')}"><label class="small">paid <input class="input num sm" data-chg="fin-hlog" data-i="${i}" data-j="${j}" data-k="received" value="${esc(l.received || '')}" inputmode="decimal"></label><label class="small">mine <input class="input num sm" data-chg="fin-hlog" data-i="${i}" data-j="${j}" data-k="mine" value="${esc(l.mine || '')}" inputmode="decimal"></label><label class="small">to installments <input class="input num sm" data-chg="fin-hlog" data-i="${i}" data-j="${j}" data-k="allocated" value="${esc(l.allocated || '')}" inputmode="decimal"></label><button class="icon-btn" data-act="fin-hlog-del" data-i="${i}" data-j="${j}" aria-label="Remove">${I.x}</button></div>`).join('')}<button class="btn sm" data-act="fin-hlog-add" data-i="${i}">${I.plus} Month</button>
        <p class="small muted">Only your share is your income; the part allocated to installments is counted against the installments, not as disposable income. When your share reaches your own account, link that transaction to this holding.</p>` : ''}`;
  }
  return `<section class="card fin-card fin-hold"><div class="row"><h2><input class="input fin-h-name" data-chg="fin-hold" data-i="${i}" data-k="name" value="${esc(h.name)}" aria-label="Name"></h2><span class="fin-tag">${esc((FIN_HKINDS.find(k => k[0] === h.kind) || [, ''])[1])}</span>${h.owner && h.owner !== 'me' ? `<span class="fin-tag warn">belongs to ${esc(finPartyName(h.owner))}</span>` : ''}${h.custodian && h.custodian !== 'me' ? `<span class="fin-tag">held by ${esc(h.custodian)}</span>` : ''}<span class="spacer"></span>${ver}<button class="icon-btn" data-act="fin-hold-del" data-i="${i}" aria-label="Remove">${I.x}</button></div>
    <div class="fin-form-g">${body}</div>${extra}${h.note ? `<p class="small muted">${esc(h.note)}</p>` : ''}</section>`;
}

/* --- settings and backup --- */
FIN_VIEW.settings = () => {
  const p = finP(), cats = finCats(), used = new Map(); for (const t of finTx()) used.set(t.cat, (used.get(t.cat) || 0) + 1);
  const curs = [...new Set([...p.accounts.map(a => a.currency), ...p.holdings.map(h => h.rentCurrency || h.currency).filter(Boolean)])].filter(c => c && c !== p.base);
  return `<section class="card fin-card"><h2>Currency</h2>
    <label class="field"><span class="label">Report in</span><select class="input" data-chg="fin-base">${FIN.CURRENCIES.map(k => `<option ${p.base === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
    <h3>Exchange rates you supply</h3><p class="small muted">Other currencies are kept apart until you enter a rate. Nothing is looked up online.</p>
    ${[...new Set([...curs, ...Object.keys(p.rates)])].map(c => `<div class="row"><span class="mono">1 ${esc(c)} =</span><input class="input num sm" data-chg="fin-rate" data-c="${esc(c)}" value="${esc(p.rates[c] ?? '')}" inputmode="decimal"><span class="mono">${esc(p.base)}</span><input class="input sm" type="date" data-chg="fin-rate-date" data-c="${esc(c)}" value="${esc((p.rateDates || {})[c] || '')}" aria-label="Rate date"><small class="muted">rate date</small></div>`).join('') || '<p class="small muted">All your accounts are in ' + esc(p.base) + '.</p>'}
    <div class="row"><input class="input sm" id="fin-newcur" placeholder="USD" maxlength="3"><button class="btn sm" data-act="fin-rate-add">Add a currency</button></div></section>
  <section class="card fin-card"><h2>Categories</h2><p class="small muted">Rename, set priority (what budgets protect first), add subcategories, merge or delete. Movements, others’ money and asset sales are never counted as income or spending.</p>
    ${['expense', 'income', 'move', 'third', 'capital'].map(k => `<h3>${{ expense: 'Expenses', income: 'Income', move: 'Movements', third: 'Others’ money', capital: 'Asset sales' }[k]}</h3><div class="fin-cats">${cats.filter(c => c.kind === k).map(c => `<div class="row fin-cat-r"><input class="input sm" data-chg="fin-cat" data-id="${esc(c.id)}" data-k="name" value="${esc(c.name)}">
      ${k === 'expense' ? `<select class="input sm" data-chg="fin-cat" data-id="${esc(c.id)}" data-k="prio">${FIN_PRIO.map(([v, l]) => `<option value="${v}" ${c.prio === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
      <input class="input sm" data-chg="fin-cat" data-id="${esc(c.id)}" data-k="subs" value="${esc((c.subs || []).join(', '))}" placeholder="subcategories, comma-separated">
      <small class="muted">${used.get(c.id) || 0} used</small>
      ${!used.get(c.id) && !FIN.DEFAULT_CATS.some(d => d.id === c.id) ? `<button class="icon-btn" data-act="fin-cat-del" data-id="${esc(c.id)}" aria-label="Delete category">${I.x}</button>` : ''}
      ${!c.code && c.id !== 'other_exp' && c.id !== 'other_inc' && c.id !== 'cc_unitem' ? `<select class="input sm" data-chg="fin-cat-merge" data-id="${esc(c.id)}" aria-label="Merge into"><option value="">Merge into…</option>${cats.filter(x => x.kind === c.kind && x.id !== c.id).map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select>` : ''}</div>`).join('')}</div>`).join('')}
    <div class="row"><select class="input sm" id="fin-nc-kind"><option value="expense">Expense</option><option value="income">Income</option></select><input class="input sm" id="fin-nc-name" placeholder="New category name"><button class="btn sm" data-act="fin-cat-add">${I.plus} Category</button></div></section>
  <section class="card fin-card"><h2>Rules</h2><p class="small muted">Your rules run before the built-in words; the ones learned from your corrections apply to the same payee in the same direction.</p>
    ${p.rules.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>When the description ${'' }…</th><th>Direction</th><th>Category</th><th></th></tr></thead><tbody>${p.rules.map((r, i) => `<tr><td>${r.learned ? 'is from payee' : 'contains'} <b>${esc(r.match)}</b>${r.learned ? ' <small class="muted">(learned)</small>' : ''}</td><td>${r.dir > 0 ? 'money in' : r.dir < 0 ? 'money out' : 'any'}</td><td>${esc((finCat(r.cat) || {}).name || r.cat)}</td><td><button class="icon-btn" data-act="fin-rule-del" data-i="${i}" aria-label="Remove">${I.x}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">None yet.</p>'}
    <div class="row"><input class="input sm" id="fin-nr-match" placeholder="text in the description"><select class="input sm" id="fin-nr-dir"><option value="0">any direction</option><option value="-1">money out</option><option value="1">money in</option></select><select class="input sm" id="fin-nr-cat">${finCatOptions('', null)}</select><button class="btn sm" data-act="fin-rule-add">${I.plus} Rule</button><button class="btn sm ghost" data-act="fin-reclassify">Apply rules to unchecked transactions</button></div></section>
  <section class="card fin-card"><h2>Privacy and storage</h2>
    <ul class="small fin-list">
      <li><b>Where it is kept:</b> ${St.mode === 'db' ? 'in your Claude account, in a private area of this page that only you can read. People you share the page with cannot see it. It is there on any device where you open this page signed in.' : 'in this browser only (cloud saving is not available in this view). Export a backup regularly — clearing the browser deletes it.'}</li>
      <li><b>Limits:</b> each month of transactions is one stored record (up to about 180 KB, split when larger); the page can hold 25,000 records in total, shared with your tasks and emails. ${St.mode === 'db' ? '' : 'Browser storage is usually limited to about 5 MB.'}</li>
      <li><b>Sent to Claude:</b> nothing, unless you press “Read with Claude” for a photo or a scanned statement — then that file’s pages (or text) are sent to read its lines. Everything else is calculated on this device.</li>
      <li><b>Original statements:</b> <label class="check"><input type="checkbox" data-chg="fin-keep-orig" ${p.keepOriginals ? 'checked' : ''}> keep the original file of each import</label> ${St.assets ? 'in this page’s file storage (private while the page is private; anyone you give edit access could open them).' : '— file storage is not available in this view, so originals are not kept here; every transaction still keeps its original line.'}</li>
    </ul></section>
  <section class="card fin-card"><h2>Backup and restore</h2>
    <p class="small">A backup file holds all Money data: transactions with their history and sources, imports, accounts, categories, rules, people, holdings, budgets, goals and settings (${finTx().length} transactions now). It does not include the original statement files.</p>
    <div class="row"><button class="btn primary" data-act="fin-backup">Download a backup</button><label class="btn">Restore from a backup…<input type="file" accept=".json,application/json" data-chg="fin-restore" hidden></label></div>
    ${UI.fin.restore ? finRestoreHTML() : ''}
    <details class="small"><summary>Delete all Money data</summary><p>Removes every transaction, import and setting of the Money tab from this page. Download a backup first.</p><button class="btn danger" data-act="fin-wipe">Delete all Money data…</button></details></section>`;
};
function finRestoreHTML() {
  const r = UI.fin.restore;
  if (!r.v.ok) return `<div class="fin-note bad">This file cannot be restored: ${r.v.errors.map(esc).join(' ')}</div>`;
  const have = new Set(finTx().map(t => t.id)), add = r.data.tx.filter(t => !have.has(t.id)).length;
  return `<div class="fin-note">Backup from ${fmtDateTime(r.data.exportedAt)}: ${r.v.counts.tx} transactions, ${r.v.counts.accounts} accounts, ${r.v.counts.batches} imports. ${add} of the transactions are not here now.
    <div class="row"><button class="btn sm primary" data-act="fin-restore-go" data-how="merge">Add what is missing</button><button class="btn sm danger" data-act="fin-restore-go" data-how="replace">Replace everything with the backup</button><button class="btn sm ghost" data-act="fin-restore-x">Cancel</button></div></div>`;
}
function finBackupData() {
  const p = St.cols.prefs.get('finance') || {};
  return { app: 'action-register-money', version: 1, exportedAt: nowISO(), prefs: p, tx: finTx(), batches: colList('finbatch'), log: colList('finlog') };
}
function finRestore(how) {
  const d = UI.fin.restore && UI.fin.restore.data; if (!d) return;
  if (how === 'replace') {
    if (!confirm('Replace all Money data on this page with the backup?')) return;
    for (const x of colList('fintx')) colDel('fintx', x.id); for (const x of colList('finbatch')) colDel('finbatch', x.id);
    FS.key = ''; FS.by = new Map(); FS.list = [];
    colPut('prefs', { ...(d.prefs || {}), id: 'finance' });
    finWrite(d.tx); for (const b of d.batches || []) colPut('finbatch', b);
  } else {
    const have = new Set(finTx().map(t => t.id)); finWrite(d.tx.filter(t => !have.has(t.id)));
    const bs = new Set(colList('finbatch').map(b => b.id)); for (const b of d.batches || []) if (!bs.has(b.id)) colPut('finbatch', b);
    if (!St.cols.prefs.get('finance') && d.prefs) colPut('prefs', { ...d.prefs, id: 'finance' });
  }
  for (const l of d.log || []) if (!St.cols.finlog.get(l.id)) colPut('finlog', l);
  finLog('restored', { how, file: UI.fin.restore.name, tx: d.tx.length });
  UI.fin.restore = null; render(); toast('Backup restored.');
}

Object.assign(ACT, {
  'fin-acct-add': () => { finSave(p => { p.accounts.push({ id: E.uid('ac'), name: 'New account', bank: '', kind: 'current', currency: p.base, number: '', owner: 'me', holder: 'me', createdAt: nowISO() }); }); render(); },
  'fin-acct-del': el => { const p = finP(), a = p.accounts[+el.dataset.i]; if (!a) return; const n = finTx().filter(t => t.acct === a.id).length; if (n) { toast(`${a.name} has ${n} transactions — delete or move them first.`, { err: true }); return; } finSave(q => { q.accounts.splice(+el.dataset.i, 1); }); render(); },
  'fin-acct-ledger': el => { UI.fin.l = { ...UI.fin.l, acct: el.dataset.id, ids: null, page: 0 }; UI.fin.sec = 'ledger'; render(); },
  'fin-dup-ok': el => { const ch = el.dataset.ids.split(',').map(id => FS.by.get(id)).filter(Boolean).map(o => { const t = clone(o); t.flags = [...new Set([...(t.flags || []), 'dup_ok'])]; finHist(t, 'duplicate check', null, 'both are real', 'you confirmed'); return t; }); finWrite(ch); render(); },
  'fin-template': () => { const t = finTemplate(); finSave(p => { for (const x of t.parties) if (!p.parties.find(y => y.id === x.id)) p.parties.push(x); for (const h of t.holdings) if (!p.holdings.find(y => y.id === h.id)) p.holdings.push(h); }); render(); toast('Added — check each record against your documents.'); },
  'fin-hold-add': () => { const k = ($('#fin-hk') || {}).value || 'deposit'; finSave(p => { p.holdings.push({ id: E.uid('h'), kind: k, name: (FIN_HKINDS.find(x => x[0] === k) || [, 'Holding'])[1], owner: 'me', custodian: 'me', currency: p.base, verified: false, log: [], events: [], unverified: [] }); }); render(); },
  'fin-hold-del': el => { const h = finP().holdings[+el.dataset.i]; if (!h || !confirm(`Remove “${h.name}”?`)) return; finSave(p => { p.holdings.splice(+el.dataset.i, 1); }); render(); },
  'fin-hlog-add': el => { finSave(p => { const h = p.holdings[+el.dataset.i]; h.log = [...(h.log || []), { m: finToday().slice(0, 7), received: '', mine: h.myShareMonthly || '', allocated: '' }]; }); render(); },
  'fin-hlog-del': el => { finSave(p => { p.holdings[+el.dataset.i].log.splice(+el.dataset.j, 1); }); render(); },
  'fin-party-add': () => { finSave(p => { p.parties.push({ id: E.uid('pt'), name: 'New person', match: '' }); }); render(); },
  'fin-party-del': el => { const x = finP().parties[+el.dataset.i]; if (!x) return; if (finTx().some(t => t.party === x.id)) { toast(`Transactions are marked as ${x.name}’s money — change them first.`, { err: true }); return; } finSave(p => { p.parties.splice(+el.dataset.i, 1); }); render(); },
  'fin-rate-add': () => { const c = (($('#fin-newcur') || {}).value || '').trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) return toast('Enter a 3-letter currency code.', { err: true }); finSave(p => { p.rates[c] = p.rates[c] || ''; }); render(); },
  'fin-cat-add': () => { const name = (($('#fin-nc-name') || {}).value || '').trim(), kind = ($('#fin-nc-kind') || {}).value; if (!name) return; finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS); p.cats.push({ id: E.uid('c'), name, kind, prio: kind === 'expense' ? 'discretionary' : '', code: '', subs: [] }); }); render(); },
  'fin-cat-del': el => { if (finTx().some(t => t.cat === el.dataset.id)) return toast('It is in use — merge it into another category instead.', { err: true }); finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS).filter(c => c.id !== el.dataset.id); delete p.budgets[el.dataset.id]; }); render(); },
  'fin-rule-add': () => { const m = (($('#fin-nr-match') || {}).value || '').trim(), cat = ($('#fin-nr-cat') || {}).value, dir = +($('#fin-nr-dir') || {}).value; if (!m || !cat) return toast('Enter the text and choose a category.', { err: true }); finSave(p => { p.rules.unshift({ id: E.uid('r'), match: m, dir: dir || 0, cat, learned: false }); }); render(); },
  'fin-rule-del': el => { finSave(p => { p.rules.splice(+el.dataset.i, 1); }); render(); },
  'fin-reclassify': () => { const p = finP(), ctx = { rules: p.rules, cats: finCats(), parties: p.parties, holdings: p.holdings }, ch = []; for (const o of finTx()) { if (o.catSrc === 'manual' || o.catSrc === 'pair' || !o.review) continue; const c = FIN.classify({ desc: o.desc, amount: o.amount || 0 }, ctx); if (c.cat !== o.cat || c.party !== (o.party || undefined)) { const t = clone(o); finHist(t, 'cat', t.cat, c.cat, 'rules applied'); t.cat = c.cat; t.catSrc = c.src; t.party = c.party || ''; t.holding = c.holding || t.holding || ''; t.review = c.review; ch.push(t); } } finWrite(ch); render(); toast(`${ch.length} transaction${ch.length === 1 ? '' : 's'} re-categorised.`); },
  'fin-backup': () => offerFile(`money-backup-${finToday()}.json`, JSON.stringify(finBackupData(), null, 1), 'application/json'),
  'fin-restore-go': el => finRestore(el.dataset.how),
  'fin-restore-x': () => { UI.fin.restore = null; render(); },
  'fin-wipe': () => { if (!confirm('Delete ALL Money data on this page? This cannot be undone.') || !confirm('Really delete every transaction, import and Money setting?')) return; for (const x of colList('fintx')) colDel('fintx', x.id); for (const x of colList('finbatch')) colDel('finbatch', x.id); for (const x of colList('finlog')) colDel('finlog', x.id); colDel('prefs', 'finance'); FS.key = ''; render(); toast('Money data deleted.'); },
});
Object.assign(CHG, {
  'fin-acct': el => { finSave(p => { const a = p.accounts[+el.dataset.i]; if (!a) return; const k = el.dataset.k; a[k] = k === 'opening' ? finNum(el.value) : k === 'holder' ? (el.value.trim() || 'me') : el.value; }); render(); },
  'fin-hold': el => { finSave(p => { const h = p.holdings[+el.dataset.i]; if (!h) return; const k = el.dataset.k; h[k] = el.type === 'checkbox' ? el.checked : ['principal', 'rate', 'payDay', 'myShareMonthly', 'area', 'share', 'soldArea', 'rentRate', 'occupancy', 'mgmtPct', 'costs', 'valuation', 'total', 'paidBefore', 'years'].includes(k) ? finNum(el.value) : el.value; if (k === 'rate') h.rateIndicative = false; }); render(); },
  'fin-hlog': el => { finSave(p => { const l = p.holdings[+el.dataset.i].log[+el.dataset.j]; if (l) l[el.dataset.k] = el.dataset.k === 'm' ? el.value : finNum(el.value); }); render(); },
  'fin-hev': el => { finSave(p => { const e = p.holdings[+el.dataset.i].events[+el.dataset.j]; if (e) e[el.dataset.k] = el.dataset.k === 'date' ? el.value : finNum(el.value); }); render(); },
  'fin-party': el => { finSave(p => { const x = p.parties[+el.dataset.i]; if (x) x[el.dataset.k] = el.value; }); render(); },
  'fin-base': el => { finSave(p => { p.base = el.value; }); render(); },
  'fin-rate': el => { finSave(p => { const v = finNum(el.value); p.rates[el.dataset.c] = v; p.rateDates = { ...(p.rateDates || {}), [el.dataset.c]: (p.rateDates || {})[el.dataset.c] || finToday() }; }); render(); },
  'fin-rate-date': el => { finSave(p => { p.rateDates = { ...(p.rateDates || {}), [el.dataset.c]: el.value }; }); render(); },
  'fin-cat': el => { finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS); const c = p.cats.find(x => x.id === el.dataset.id); if (!c) return; c[el.dataset.k] = el.dataset.k === 'subs' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : el.value; }); render(); },
  'fin-cat-merge': el => {
    const from = el.dataset.id, to = el.value; if (!to) return; const n = finTx().filter(t => t.cat === from).length;
    if (!confirm(`Move ${n} transaction${n === 1 ? '' : 's'} from “${(finCat(from) || {}).name}” to “${(finCat(to) || {}).name}” and remove the category?`)) { el.value = ''; return; }
    const ch = finTx().filter(t => t.cat === from).map(o => { const t = clone(o); finHist(t, 'cat', from, to, 'categories merged'); t.cat = to; return t; });
    finWrite(ch); finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS).filter(c => c.id !== from); p.rules = p.rules.map(r => r.cat === from ? { ...r, cat: to } : r); if (p.budgets[from] !== undefined) { p.budgets[to] = (+p.budgets[to] || 0) + (+p.budgets[from] || 0); delete p.budgets[from]; } });
    finLog('categories merged', { from, to, n }); render(); toast('Merged.');
  },
  'fin-keep-orig': el => { finSave(p => { p.keepOriginals = el.checked; }); },
  'fin-restore': el => { const f = el.files && el.files[0]; el.value = ''; if (!f) return; f.text().then(t => { let d = null; try { d = JSON.parse(t); } catch {} UI.fin.restore = { name: f.name, data: d, v: FIN.validateBackup(d) }; render(); }); },
});
