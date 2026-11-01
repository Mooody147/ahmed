/* ---------- Money: my accounts now, updates in plain words or screenshots, card / Halan / instalments, purchases ---------- */
// One state (finNow) feeds every page: the latest balance of each account (a balance you give today beats an older
// statement; older ones stay as history), money held for others taken out, what is still paid in instalments, what
// comes in each month (your inputs, with the dates they apply from), and what is left to save. Updates written in
// plain words or shown in screenshots are read by Claude into proposed changes; nothing applies before you see the
// preview, and anything unclear becomes a question instead of a guess.
addCols('finbal');
FIN_SECS.splice(1, 0, ['update', 'Balances & history']);
FIN_SECS.splice(FIN_SECS.findIndex(s => s[0] === 'forecast') + 1, 0, ['buy', 'Purchase goals'], ['credit', 'Card, Halan & instalments']);
Object.assign(FIN_ICON, { update: '✍️', buy: '🛍️', credit: '💳' });
FIN_AKINDS.splice(3, 0, ['bnpl', 'Instalment financing (Halan)']);

/* --- your five accounts, set up once from what you told me --- */
function finEnsurePresets() {
  // only once the saved settings are here: writing before that would replace them
  if (St.mode === 'viewer' || (St.mode === 'db' && !St.colsLoaded.has('prefs'))) return;
  const p = finP(); if (p.presetsV1) return;
  finSave(q => {
    const has = (pred) => q.accounts.find(pred);
    const add = a => q.accounts.push({ id: E.uid('ac'), currency: 'EGP', owner: 'me', holder: 'me', bank: '', preset: true, createdAt: nowISO(), ...a });
    if (!has(a => FIN.last4(a.number) === '0012')) add({ name: 'Primary account ••0012', kind: 'current', number: '0012', role: 'salary', note: 'Your main account: salary and other money in.' });
    if (!has(a => FIN.last4(a.number) === '0013')) add({ name: 'Account ••0013', kind: 'current', number: '0013', note: 'Spent from directly with your debit card (shared with ••0012), and pays the credit card.' });
    const card = has(a => a.kind === 'credit_card');
    if (!card) add({ name: 'Credit card', kind: 'credit_card', number: '', limit: 50400, limitSet: true, terms: { method: 'none', months: 12 }, note: 'Limit EGP 50,400 when nothing is used.' });
    else { card.limit = card.limit || 50400; card.preset = true; }
    if (!has(a => a.kind === 'bnpl')) add({ name: 'Halan', kind: 'bnpl', number: '', limit: null, terms: { method: 'flat', rate: '', months: 12 }, note: 'Instalment financing with interest.' });
    // the CIB investment held in your mother's account: yours by ownership, hers by name
    // everything else you described before (Ahmed, the certificate, the box, the offices), once, if missing
    const tpl = typeof finTemplate === 'function' ? finTemplate() : { parties: [], holdings: [] };
    if (!q.templateAdded) { for (const x of tpl.parties) if (!q.parties.find(y => y.id === x.id)) q.parties.push(x); for (const h of tpl.holdings) if (!q.holdings.find(y => y.id === h.id)) q.holdings.push(h); q.templateAdded = true; }
    const mom = q.holdings.find(h => h.id === 'mom'); if (mom) Object.assign(mom, { name: 'CIB investment (in my mother’s account)', bank: 'CIB', custodian: 'my mother', owner: 'me', principal: mom.principal || 1380000, rate: mom.rate || 17.25, myShareMonthly: mom.myShareMonthly || 1300, allocTo: mom.allocTo || 'inst' });
    q.presetsV1 = true;
  });
}
// ••0013 is spent from like ••0012 (one debit card for both, and both pay the card): an everyday account, so
// money moved between them is a transfer, not savings (once; what you change later stays)
function finPresetsV2() {
  if (St.mode === 'viewer' || (St.mode === 'db' && !St.colsLoaded.has('prefs'))) return;
  const p = finP(); if (!p.presetsV1 || p.presetsV2) return;
  finSave(q => {
    const s = q.accounts.find(a => a.preset && FIN.last4(a.number) === '0013' && a.kind === 'savings');
    if (s) { s.kind = 'current'; if (s.name === 'Savings account ••0013') s.name = 'Account ••0013'; s.note = 'Spent from directly with your debit card (shared with ••0012), and pays the credit card.'; }
    const m = q.accounts.find(a => a.preset && FIN.last4(a.number) === '0012');
    if (m && m.note === 'Your main account: salary and other money in.') m.note = 'Your main account: salary in; spent from directly with your debit card (shared with ••0013), and pays the credit card.';
    q.presetsV2 = true;
  });
}
function finDefaultV1() {
  if (St.mode === 'viewer' || (St.mode === 'db' && !St.colsLoaded.has('prefs'))) return;
  const p = finP(); if (!p.presetsV1 || p.defaultSet) return;
  finSave(q => { const m = q.accounts.find(a => FIN.last4(a.number) === '0012' && a.kind === 'current'); if (m && !q.defaultAcct) q.defaultAcct = m.id; q.defaultSet = true; });
}
HOOKS.ready.push(() => setTimeout(finEnsurePresets, 800));
HOOKS.ready.push(() => setTimeout(finPresetsV2, 1200));
HOOKS.ready.push(() => setTimeout(finDefaultV1, 1400));
HOOKS.beforeRender.push(() => { if (UI.view === 'finance' && St.ready && finP().presetsV1 && !finP().defaultSet) setTimeout(finDefaultV1, 0); });
HOOKS.beforeRender.push(() => { if (UI.view === 'finance' && St.ready && finP().presetsV1 && !finP().presetsV2) setTimeout(finPresetsV2, 0); });

/* --- one account saved twice: joined into one ---
   Two accounts of the same kind with the same account or card number (and bank and currency) are the same account —
   e.g. a card whose statements were read before their number could be read. Everything that pointed at the copy
   (its transactions, statements and saved balances) moves to the one kept (the preset one, else the oldest);
   nothing is removed or counted twice, the conversation says what was joined, and Undo puts it back. */
const finNumKey = n => { const d = String(n || '').replace(/[\s-]/g, ''); return d.replace(/\D/g, '').length >= 4 ? d.slice(-4) : ''; };
const finAcctKey = a => { const n = finNumKey(a.number); return n && a.kind ? [a.kind, a.currency || '', n, FIN.norm(a.bank || '')].join('|') : null; };
// an account already there for this kind and number (before a statement makes a new one)
function finAcctSameNumber(kind, number, bank, currency) {
  const k = finAcctKey({ kind, number, bank, currency: currency || finP().base }); if (!k) return null;
  return finP().accounts.find(a => finAcctKey({ ...a, currency: a.currency || finP().base }) === k) || finP().accounts.find(a => a.kind === kind && (a.aliases || []).includes(finNumKey(number))) || null;
}
function finJoinDupAccts() {
  if (St.mode === 'viewer' || (St.mode === 'db' && St.colsLoaded && !['prefs', 'fintx', 'finbatch', 'finbal'].every(n => St.colsLoaded.has(n)))) return 0;
  const p = finP(), groups = new Map();
  UI.fin.joinSkip = UI.fin.joinSkip || new Set();
  for (const a of p.accounts) { const k = finAcctKey({ ...a, currency: a.currency || p.base }); if (k) groups.set(k, [...(groups.get(k) || []), a]); }
  for (const [k, g] of groups) if (g.some(a => UI.fin.joinSkip.has(a.id))) groups.delete(k);
  const sets = [...groups.values()].filter(g => g.length > 1); if (!sets.length) return 0;
  const to = new Map(), lines = [];
  for (const g of sets) {
    const keep = g.slice().sort((x, y) => (y.preset ? 1 : 0) - (x.preset ? 1 : 0) || String(x.createdAt || '').localeCompare(String(y.createdAt || '')))[0];
    for (const a of g) if (a !== keep) to.set(a.id, keep.id);
    const n = finTx().filter(t => g.some(a => a !== keep && a.id === t.acct)).length;
    lines.push(`${keep.name}${finNumKey(keep.number) ? ' ••' + finNumKey(keep.number) : ''}: ${g.length} copies of the same ${keep.kind === 'credit_card' ? 'card' : 'account'} joined into one — ${n} transaction${n === 1 ? '' : 's'} moved to it, nothing removed`);
  }
  finMergeAccts(to, 'One account was saved twice — I joined the copies:', lines);
  return sets.length;
}
// Joins accounts that are one and the same: everything that named a copy (transactions, statements, balances,
// settings) is pointed at the one kept; what only a copy knew is kept, its number is remembered as another number of
// the same account (so a statement or screenshot showing it lands there); the conversation says so, with Undo.
function finMergeAccts(to, reply, lines) {
  if (!to.size) return 0;
  const snap = finSnapshot(), p0 = finP(), tails = new Map();
  for (const [from, keep] of to) { const a = p0.accounts.find(x => x.id === from); const t = a && finNumKey(a.number); if (t) tails.set(keep, [...(tails.get(keep) || []), t, ...((a && a.aliases) || [])]); }
  // ids are unique random strings, so every place that names a copy is found and pointed at the one kept
  const swap = d => { let j = JSON.stringify(d), hit = false; for (const [from, keep] of to) { const q = JSON.stringify(from); if (j.includes(q)) { j = j.split(q).join(JSON.stringify(keep)); hit = true; } } return hit ? JSON.parse(j) : null; };
  for (const n of ['fintx', 'finbatch', 'finbal']) for (const d of colList(n)) { const x = swap(d); if (x) colPut(n, x); }
  finSave(q => {
    const accts = q.accounts; delete q.accounts; Object.assign(q, swap(q) || {});
    const out = [];
    for (const a of [...accts.filter(x => !to.has(x.id)), ...accts.filter(x => to.has(x.id))]) {   // the one kept first, the copies after
      const id = to.get(a.id) || a.id, k = out.find(x => x.id === id);
      if (!k) { out.push(to.has(a.id) ? { ...a, id } : a); continue; }
      for (const [f, v] of Object.entries(a)) if (!['id', 'name', 'preset', 'number', 'aliases', 'kind'].includes(f) && (k[f] === undefined || k[f] === null || k[f] === '')) k[f] = v;   // what only the copy knew is kept
    }
    for (const k of out) if (tails.has(k.id)) k.aliases = [...new Set([...(k.aliases || []), ...tails.get(k.id)])].filter(t => t && t !== finNumKey(k.number));
    q.accounts = out;
  });
  FS.key = '';
  const m = { id: E.uid('tk'), at: nowISO(), who: 'claude', reply, done: [], notes: lines, undoable: true, joined: [...to.keys()] };
  UI.fin.undo.set(m.id, snap); finTalkPush(m); render();
  return to.size;
}
// you choose it: "this account is the same as that one" (Settings › Accounts, or in words to the canvas)
function finSameAccount(copyId, keepId, how) {
  const p = finP(), c = p.accounts.find(a => a.id === copyId), k = p.accounts.find(a => a.id === keepId); if (!c || !k || c === k) return 0;
  const keep = k.preset || !c.preset ? k : c, copy = keep === k ? c : k, n = finTx().filter(t => t.acct === copy.id).length;
  return finMergeAccts(new Map([[copy.id, keep.id]]), how || 'Joined as one account:', [`${copy.name} → ${keep.name}: ${n} transaction${n === 1 ? '' : 's'} and its balances moved, nothing removed${finNumKey(copy.number) ? `; ${finNumKey(copy.number)} is now another number of ${keep.name}` : ''}`]);
}
document.addEventListener('change', e => { const el = e.target; if (!el || el.dataset.chg !== 'fin-acct-same' || !el.value) return; finSameAccount(el.dataset.id, el.value); toast('Joined — the conversation has Undo.'); });
// every number an account goes by: its own and the ones it was joined with
const finAcctTails = a => [finNumKey(a.number), ...(a.aliases || [])].filter(t => t && t.length === 4);
// you said: Account ••0120 is your Primary account ••0012 (one account, two numbers) — joined once
function finSameAs0120() {
  if (St.mode === 'viewer' || (St.mode === 'db' && St.colsLoaded && !['prefs', 'fintx', 'finbatch', 'finbal'].every(n => St.colsLoaded.has(n)))) return 0;
  const p = finP(); if (!p.presetsV1 || p.same0120) return 0;
  const keep = p.accounts.find(a => a.preset && finNumKey(a.number) === '0012' && a.kind === 'current');
  if (!keep) return 0;
  const copies = p.accounts.filter(a => a !== keep && a.kind === 'current' && finAcctTails(a).includes('0120'));
  finSave(q => { q.same0120 = true; const k = q.accounts.find(a => a.id === keep.id); if (k) k.aliases = [...new Set([...(k.aliases || []), '0120'])]; });
  if (!copies.length) return 0;
  const n = finTx().filter(t => copies.some(c => c.id === t.acct)).length;
  return finMergeAccts(new Map(copies.map(c => [c.id, keep.id])), 'You said ••0120 is your Primary account ••0012 — I joined them:', [`${copies.map(c => c.name).join(', ')} → ${keep.name}: ${n} transaction${n === 1 ? '' : 's'} and its balances moved, nothing removed; statements or screenshots showing 0120 go to ${keep.name} from now on`]);
}
HOOKS.beforeRender.push(() => { if (UI.view === 'finance' && St.ready && !finP().presetsV1) setTimeout(finEnsurePresets, 0); });

/* --- balances you give (dated snapshots, kept as history) --- */
const finSnaps = () => colList('finbal').flatMap(d => d.snaps || []);
function finAddSnaps(list) {
  const byM = {}; for (const s of list) (byM[s.date.slice(0, 7)] = byM[s.date.slice(0, 7)] || []).push(s);
  for (const [m, ss] of Object.entries(byM)) { const id = 'b-' + m, d = clone(St.cols.finbal.get(id) || { id, snaps: [] });
    for (const s of ss) { const same = d.snaps.find(x => x.acct === s.acct && x.date === s.date && x.balance === s.balance && x.available === s.available && x.outstanding === s.outstanding); if (!same) d.snaps.push(s); }
    colPut('finbal', d); }
}
// the latest known figure for an account: your newest balance, or the latest statement — whichever is newer
// An account's balance now: the last balance known for sure (a statement, or one you gave) with everything paid or
// received after it applied at once — what you tell the canvas, what you add by hand, statement lines after it —
// until a newer statement or balance replaces it. { base: true } gives the last balance known for sure alone (what
// a new balance is compared with, so nothing is counted twice).
function finLatest(a, opt) {
  const base = finLatestBase(a); if (opt && opt.base) return base;
  const out = { ...base }; if (!out.date) return out;
  const credit = a.kind === 'credit_card' || a.kind === 'bnpl';
  const later = finTx().filter(t => t.acct === a.id && typeof t.amount === 'number' && !isNaN(t.amount) && FIN.validDate(t.date) && !(t.flags || []).includes('direction_unknown') && !(t.flags || []).some(f => f === 'in_balance' || f === 'from_balance')
    && (t.date > out.date || (t.date === out.date && out.source === 'you' && t.manual && out.at && (t.createdAt || '') > out.at)));
  if (!later.length) return out;
  const sum = FIN.r2(later.reduce((s, t) => s + t.amount, 0));
  out.since = { n: later.length, sum, from: out.date, base: credit ? out.owed : out.balance };
  if (credit) {
    if (typeof out.owed === 'number') out.owed = Math.max(0, FIN.r2(out.owed - sum));
    if (typeof out.available === 'number') out.available = FIN.r2(out.available + sum);
    if (typeof out.balance === 'number') out.balance = FIN.r2(out.balance + sum);
  } else if (typeof out.balance === 'number') { out.balance = FIN.r2(out.balance + sum); if (typeof out.available === 'number') out.available = FIN.r2(out.available + sum); }
  return out;
}
function finLatestBase(a) {
  const tx = finTx(), snaps = finSnaps().filter(s => s.acct === a.id).sort((x, y) => x.date.localeCompare(y.date) || (x.at || '').localeCompare(y.at || ''));
  const snap = snaps[snaps.length - 1], out = { date: null, source: null };
  const rec = FIN.reconcile(a, tx, colList('finbatch').filter(b => !b.undone));
  const st = rec.confirmed ? { date: rec.confirmed.date, balance: rec.confirmed.balance } : null;
  const fromStmt = a.stmt && typeof a.stmt.closing === 'number' && (!st || a.stmt.date >= st.date) ? { date: a.stmt.date, balance: a.stmt.closing } : st;
  if (snap && (!fromStmt || snap.date >= fromStmt.date)) Object.assign(out, { date: snap.date, at: snap.at || '', balance: snap.balance, available: snap.available, outstanding: snap.outstanding, source: 'you' });
  else if (fromStmt) Object.assign(out, { date: fromStmt.date, balance: fromStmt.balance, source: 'statement' });
  if (a.kind === 'credit_card' || a.kind === 'bnpl') {
    const owed = out.outstanding !== undefined && out.outstanding !== null ? +out.outstanding : typeof out.balance === 'number' ? Math.max(0, -out.balance) : null;
    out.owed = owed; out.limit = a.limit || (a.stmt && a.stmt.limit) || null;
    out.available = out.available !== undefined && out.available !== null ? +out.available : out.limit && owed !== null ? FIN.r2(out.limit - owed) : null;
  }
  return out;
}

/* --- the one state every page uses --- */
function finNow() {
  const p = finP(), today = finToday(), cur = today.slice(0, 7), key = JSON.stringify([FS.key, (St.cols.prefs.get('finance') || {}).updatedAt, colList('finbal').map(d => d.updatedAt).join(), today]);
  if (finNow.k === key) return finNow.v;
  const tx = finTx(), all = finAll(), done = all.months.filter(b => b.covered && b.m < cur).slice(-6);
  const accts = p.accounts.map(a => ({ a, l: finLatest(a) }));
  const personal = accts.filter(x => ['current', 'savings', 'cash'].includes(x.a.kind) && (!x.a.owner || x.a.owner === 'me'));
  const cashKnown = personal.filter(x => typeof x.l.balance === 'number'), cash = FIN.r2(cashKnown.reduce((s, x) => s + x.l.balance, 0));
  const held = FIN.r2(FIN.thirdParty(tx, p.parties).reduce((s, x) => s + Math.max(0, x.held), 0));
  const card = accts.find(x => x.a.kind === 'credit_card'), halan = accts.find(x => x.a.kind === 'bnpl');
  const inst = FIN.detectInstallments(tx, today, p.installments), instMonthly = FIN.installmentLoad(inst, cur);
  // income: your inputs when you gave them, otherwise what the statements show (salary + other repeating income)
  const ins = (p.inputs || []).filter(i => i.kind === 'income' && (!i.from || i.from <= today) && (!i.to || i.to >= today));
  const ib = FIN.incomeBase(all, today), mom = p.holdings.find(h => h.id === 'mom');
  let income, incomeBasis;
  if (ins.length) { income = FIN.r2(ins.reduce((s, i) => s + (+i.amount || 0), 0)); incomeBasis = ins.map(i => `${i.label} ${fm(+i.amount)}`).join(' + '); }
  else { income = FIN.r2((ib.salary || 0) + ib.otherRecurringMonthly); incomeBasis = ib.salary !== null ? `salary ${fm(ib.salary)} (${ib.verified ? 'verified' : 'not verified'}) from the statements` : 'no salary found yet'; }
  if (mom && +mom.myShareMonthly && !ins.some(i => i.key === 'cib_share') && !tx.some(t => t.holding === 'mom' && t.amount > 0)) { income = FIN.r2(income + +mom.myShareMonthly); incomeBasis += ` + CIB share ${fm(+mom.myShareMonthly)}`; }
  const expIn = FIN.activeInput(p.inputs, 'expenses', today);
  const spending = expIn ? +expIn.amount : FIN.median(done.map(b => b.exp)) || 0;
  const essential = FIN.median(done.map(b => Object.entries(b.byCat).filter(([k]) => (finCat(k) || {}).prio === 'essential').reduce((s, [, v]) => s + v, 0))) || 0;
  const goalsMonthly = FIN.r2(FIN.goalPlan(p.goals || [], 0, today).reduce((s, g) => s + (+g.monthly || (g.required || 0)), 0));
  const reserve = FIN.r2(essential * (+p.emergencyMonths || 3));
  const capacity = FIN.r2(Math.max(0, income - spending - goalsMonthly));
  const free = FIN.r2(Math.max(0, cash - held - reserve));
  const v = { today, accts, cash, cashKnown: cashKnown.length, cashAccts: personal.length, held, free, reserve, essential, income, incomeBasis, spending: FIN.r2(spending), spendBasis: expIn ? 'your input' : `median of the last ${done.length} complete months`, goalsMonthly, capacity,
    card: card ? { a: card.a, ...card.l, terms: card.a.terms || {} } : null, halan: halan ? { a: halan.a, ...halan.l, terms: halan.a.terms || {} } : null, inst, instMonthly,
    health: FIN.health({ income, spending, essential, cash: Math.max(0, cash - held), installments: instMonthly, cardOwed: card ? card.l.owed : null, cardLimit: card ? card.l.limit : null }) };
  finNow.k = key; finNow.v = v; return v;
}

/* --- questions: anything unclear is asked, never guessed --- */
function finQuestions() {
  const p = finP(), out = [], today = finToday(), tx = finTx();
  for (const q of p.questions || []) if (!q.answered) out.push(q);
  // deposits whose owner or purpose is not clear (not salary, returns, refunds, own transfers, held money)
  const from = FIN.addDays(today, -120);
  for (const t of tx) if (t.amount >= 1000 && t.date >= from && !t.asked && t.catSrc !== 'manual' && ['other_inc', 'transfer'].includes(t.cat) && !t.pair) out.push({ id: 'dep:' + t.id, kind: 'deposit', tx: t.id, text: `${fm(t.amount)} came into ${esc((finAcct(t.acct) || {}).name || '')} on ${fday(t.date)} (“${FIN.cleanDesc(t.desc || '')}”). Whose money is it?` });
  // instalments whose count is unknown or that stopped appearing
  for (const i of finNow().inst) if (i.ask) out.push({ id: 'inst:' + i.key, kind: 'inst', key: i.key, text: i.status === 'missing' ? `“${i.name}” (${fm(i.amount)} a month) has not appeared since ${fday(i.last)}. Is it still being paid?` : `“${i.name}” is paid every month (${fm(i.amount)}). Is it an instalment, and how many payments are left?` });
  return out;
}
function finAnswer(id, how, extra = {}) {
  const p = finP();
  if (id.startsWith('dep:')) {
    const t = clone(FS.by.get(id.slice(4))); if (!t) return;
    const map = { income: extra.cat || 'other_inc', own: 'transfer', invest: 'interest', theirs: 'held' };
    finHist(t, 'cat', t.cat, map[how], 'you said: ' + { income: 'my income', own: 'from my own account', invest: 'investment return', theirs: 'someone else’s money' }[how]);
    t.cat = map[how]; t.catSrc = 'manual'; t.asked = true; t.review = false;
    if (how === 'theirs') { let pid = extra.party; if (!pid && extra.name) { pid = E.uid('pt'); finSave(q => { q.parties.push({ id: pid, name: extra.name, match: '' }); }); } t.party = pid || ''; }
    finWrite([t]); finLog('classified a deposit', { id: t.id, as: how });
  } else if (id.startsWith('inst:')) {
    const key = id.slice(5);
    finSave(q => { q.installments = (q.installments || []).filter(k => k.key !== key); q.installments.push({ key, status: how === 'ended' ? 'completed' : how === 'stopped' ? 'discontinued' : 'active', remaining: extra.remaining === '' || extra.remaining === undefined ? null : +extra.remaining, end: extra.end || null, at: nowISO() }); });
  } else {
    finSave(q => { const x = (q.questions || []).find(z => z.id === id); if (x) Object.assign(x, { answered: nowISO(), answer: how, ...extra }); q.questions = (q.questions || []).filter(z => !z.answered || z.answered > FIN.addDays(finToday(), -60)); });
    const x = (p.questions || []).find(z => z.id === id);
    if (x && x.kind === 'balance' && ['spend', 'income', 'theirs'].includes(how)) {
      const amt = x.diff, a = finAcct(x.acct);
      const t = { id: E.uid('tx'), acct: x.acct, date: x.date, desc: how === 'spend' ? 'Spending seen in the balance' : how === 'income' ? 'Money in seen in the balance' : 'Someone else’s money (balance)', amount: amt, currency: (a || {}).currency, cat: how === 'spend' ? (extra.cat || 'other_exp') : how === 'income' ? 'other_inc' : 'held', party: how === 'theirs' ? (extra.party || '') : '', catSrc: 'manual', flags: ['from_balance'], manual: true, src: { f: '', manual: true }, createdAt: nowISO(), hist: [{ at: nowISO(), f: 'created', to: 'from a balance update', why: 'you explained a balance change' }] };
      finWrite([t]);
    }
  }
  render();
}

/* --- Claude reads your words and screenshots into proposed changes --- */
function finDraftContext() {
  const p = finP(), n = finNow(), today = finToday(), from = FIN.addDays(today, -90);
  return {
    today, baseCurrency: p.base,
    accounts: n.accts.map(x => ({ id: x.a.id, name: x.a.name, kind: x.a.kind, number: x.a.number || '', default: x.a.id === (finDefAcct() || {}).id || undefined, limit: x.a.limit || null, holder: x.a.holder || 'me', last: { balance: x.l.balance ?? null, available: x.l.available ?? null, outstanding: x.l.owed ?? null, date: x.l.date } })),
    holdings: p.holdings.filter(h => h.kind !== 'property').map(h => ({ id: h.id, name: h.name, principal: h.principal || null, myShareMonthly: h.myShareMonthly || null, rate: h.rate || null, owner: h.owner || 'me', heldBy: h.custodian || 'me' })),
    inputs: (p.inputs || []).filter(i => !i.to || i.to >= today).map(i => ({ key: i.key, label: i.label, kind: i.kind, amount: i.amount, from: i.from })),
    statementIncome: { salary: FIN.incomeBase(finAll(), today).salary },
    installments: n.inst.map(i => ({ key: i.key, name: i.name, amount: i.amount, remaining: i.remaining, end: i.end, status: i.status })),
    recentDeposits: finTx().filter(t => t.amount > 0 && t.date >= from && t.cat !== 'held').slice(-60).map(t => ({ txId: t.id, date: t.date, amount: t.amount, account: t.acct, desc: FIN.cleanDesc(t.desc || '') })),
    people: p.parties.map(x => ({ id: x.id, name: x.name })), purchaseGoals: (p.buys || []).map(b => ({ id: b.id, name: b.name, price: b.price })),
  };
}
const FIN_DRAFT_PROMPT = ctx => `You update a personal finance tool from its owner's message and screenshots of banking apps. Today is ${ctx.today}; amounts are in ${ctx.baseCurrency} unless shown otherwise.
CURRENT RECORDS: ${JSON.stringify(ctx)}
Read the message and every screenshot. Return JSON only:
{"balances":[{"account":"id from accounts or null","newAccount":null or {"name":"","kind":"current|savings|credit_card|bnpl|investment","number":""},"date":"YYYY-MM-DD","balance":number or null,"available":number or null,"outstanding":number or null,"limit":number or null,"evidence":"which sentence or screenshot"}],
"holdings":[{"id":"id from holdings","principal":number or null,"myShareMonthly":number or null,"rate":number or null,"evidence":""}],
"inputs":[{"key":"existing key when it updates one (e.g. salary), else a new snake_case key","label":"","kind":"income|expense|saving|commitment","amount":number,"from":"YYYY-MM-DD","permanent":true or false,"evidence":""}],
"thirdParty":[{"txId":"id from recentDeposits or null","amount":number,"date":"YYYY-MM-DD","account":"id or null","person":"name or ''","note":""}],
"installments":[{"key":"existing key or null","name":"","amount":number,"remaining":number or null,"endMonth":"YYYY-MM or null","status":"active|completed|discontinued"}],
"terms":[{"account":"id","method":"flat|reducing|none","rate":number or null,"months":number or null,"feePct":number or null,"feeFixed":number or null,"conditions":""}],
"goals":[{"name":"","price":number,"priority":1-3,"wantBy":"YYYY-MM-DD or null"}],
"questions":[{"text":"a short question to the owner","about":""}]}
Rules: take only what the message or screenshots actually state — never invent or estimate a value. A new value for something already recorded (salary, a return, an expense, a balance) uses that record's key/id: it replaces it from its date; a temporary change has "permanent": false. Resolve "today"/"yesterday"/month names to dates from today's date. Identify the account of each screenshot from its number, name or app (CIB, Halan, the card ••). Credit card: "outstanding" is what is owed, "available" what can still be spent. A bank account (current or savings): its balance is the AVAILABLE balance ("Available Balance", "Available", "الرصيد المتاح") — put that number in both "balance" and "available"; an amount on hold, unclear or uncleared funds, an overdraft or utilised limit and an "equivalent balance" line are not the balance. An IBAN or a long account number belongs to the account whose number it ends with (…00012 is the account ••0012): use that account's id, not a new account. When the owner says money in their account belongs to someone else, put it in thirdParty and match it to a recentDeposits txId when the amount and date fit. If anything is unclear, incomplete or contradictory (which account, whether a change is permanent, whose money), do not guess: add a question. Empty lists when nothing applies.`;
async function finDraftRead() {
  const D = UI.fin.draft2 = UI.fin.draft2 || { text: '', files: [] };
  if (!St.sample) return toast('Reading by Claude is not available in this view.', { err: true });
  if (!D.text.trim() && !D.files.length) return toast('Write something or add a screenshot.', { err: true });
  D.busy = true; D.preview = null; render();
  try {
    const ctx = finDraftContext(), lim = St.limits && St.limits.images, images = [];
    for (const f of D.files.slice(0, lim ? lim.maxCount || 10 : 0)) { const r = await E.extract({ name: f.name, bytes: f.bytes }, { vision: true, maxImageBytes: lim ? lim.maxInputBytes : 0, maxPageImages: 4 }); for (const im of r.images || []) if (im.blob) images.push(im.blob); }
    const res = await St.sample.json(FIN_DRAFT_PROMPT(ctx) + '\n\nOWNER’S MESSAGE:\n' + (D.text || '(only screenshots)') + (D.answers ? '\n\nANSWERS TO YOUR EARLIER QUESTIONS:\n' + D.answers : ''), { modelTier: 'default', ...(images.length ? { images } : {}) });
    D.preview = finDraftCheck(res || {}); D.includes = {};
  } catch (e) { toast('Could not read it: ' + (e.message || e.code || e), { err: true }); }
  D.busy = false; render();
}
// what Claude proposed, checked against the records: unknown accounts, impossible numbers and dates become questions
function finDraftCheck(r) {
  const p = finP(), today = finToday(), out = { balances: [], holdings: [], inputs: [], thirdParty: [], installments: [], terms: [], goals: [], questions: [] };
  const num = v => v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : (FIN.parseNum(v) || {}).n ?? null;
  const day = v => FIN.validDate(v) ? v : today;
  for (const b of r.balances || []) {
    let a = b.account && finAcct(b.account);
    // a new account whose IBAN or long number ends like one of yours is that account
    if (!a && b.newAccount && b.newAccount.number) { const d = String(b.newAccount.number).replace(/\D/g, '').slice(-7), m = p.accounts.filter(x => FIN.last4(x.number).length === 4 && d.includes(FIN.last4(x.number))); if (m.length === 1) a = m[0]; }
    if (!a && !(b.newAccount && b.newAccount.name)) { out.questions.push({ text: `Which account is this balance for${b.evidence ? ` (${b.evidence})` : ''}?`, about: 'balance' }); continue; }
    const v = { account: a ? a.id : null, newAccount: a ? null : b.newAccount, date: day(b.date), balance: num(b.balance), available: num(b.available), outstanding: num(b.outstanding), limit: num(b.limit), evidence: b.evidence || '' };
    // a bank account's balance is what is available (not what is on hold, nor an "equivalent" line)
    const bankKind = a ? !['credit_card', 'bnpl'].includes(a.kind) : !['credit_card', 'bnpl'].includes((b.newAccount || {}).kind);
    if (bankKind && v.available !== null) v.balance = v.available;
    if (v.balance === null && v.available === null && v.outstanding === null && v.limit === null) continue;
    if (a && v.balance !== null) { const prev = finLatest(a, { base: true }); v.prev = finLatest(a); v.change = FIN.balanceChange(prev.date ? { balance: prev.balance, date: prev.date } : null, { balance: v.balance, date: v.date }, finTx().filter(t => t.acct === a.id)); }
    out.balances.push(v);
  }
  for (const h of r.holdings || []) { const x = p.holdings.find(z => z.id === h.id); if (x) out.holdings.push({ id: x.id, name: x.name, principal: num(h.principal), myShareMonthly: num(h.myShareMonthly), rate: num(h.rate), prev: { principal: x.principal, myShareMonthly: x.myShareMonthly, rate: x.rate }, evidence: h.evidence || '' }); }
  for (const i of r.inputs || []) { const amount = num(i.amount); if (amount === null || !i.key) continue; const prev = FIN.activeInput(p.inputs, i.key, today); out.inputs.push({ key: String(i.key).toLowerCase().replace(/[^a-z0-9_]+/g, '_'), label: i.label || (prev && prev.label) || i.key, kind: ['income', 'expense', 'saving', 'commitment'].includes(i.kind) ? i.kind : (prev && prev.kind) || 'income', amount, from: day(i.from), permanent: i.permanent !== false, prev, evidence: i.evidence || '' }); }
  for (const t of r.thirdParty || []) {
    let tx = t.txId && FS.by.get(t.txId);
    if (!tx) { const amt = num(t.amount), d = day(t.date); const c = finTx().filter(x => x.amount > 0 && amt !== null && Math.abs(x.amount - amt) < 0.01 && Math.abs(FIN.dnum(x.date) - FIN.dnum(d)) <= 3 && (!t.account || x.acct === t.account)); if (c.length === 1) tx = c[0]; else { out.questions.push({ text: c.length ? `${c.length} deposits of ${fm(amt)} around ${fday(d)} — which one belongs to ${t.person || 'someone else'}?` : `No deposit of ${fm(amt)} around ${fday(d)} is recorded yet. Add the statement, or tell me the account and date.`, about: 'third party' }); continue; } }
    out.thirdParty.push({ txId: tx.id, tx, person: t.person || '', note: t.note || '' });
  }
  for (const i of r.installments || []) { const amount = num(i.amount); if (!i.name && !i.key) continue; out.installments.push({ key: i.key || null, name: i.name || '', amount, remaining: num(i.remaining), end: /^\d{4}-\d{2}$/.test(i.endMonth || '') ? i.endMonth : null, status: ['active', 'completed', 'discontinued'].includes(i.status) ? i.status : 'active' }); }
  for (const t of r.terms || []) { const a = finAcct(t.account); if (a) out.terms.push({ account: a.id, name: a.name, method: ['flat', 'reducing', 'none'].includes(t.method) ? t.method : (a.terms || {}).method || 'flat', rate: num(t.rate), months: num(t.months), feePct: num(t.feePct), feeFixed: num(t.feeFixed), conditions: t.conditions || '' }); }
  for (const g of r.goals || []) { const price = num(g.price); if (g.name && price) out.goals.push({ name: g.name, price, priority: [1, 2, 3].includes(+g.priority) ? +g.priority : 2, wantBy: FIN.validDate(g.wantBy) ? g.wantBy : '' }); }
  for (const q of r.questions || []) if (q && q.text) out.questions.push({ text: String(q.text).slice(0, 400), about: q.about || '' });
  return out;
}
// applies what Claude read; from the talk box (P given) everything is applied at once and the list of changes returned
function finDraftApply(P0, src) {
  const D = UI.fin.draft2 || {}, P = P0 || D.preview; if (!P) return [];
  const inc = (k, i) => P0 ? true : !(D.includes && D.includes[k + i] === false), at = nowISO(), done = [];
  const snaps = [];
  P.balances.forEach((b, i) => {
    if (!inc('b', i)) return; let acct = b.account;
    if (!acct && b.newAccount) { acct = E.uid('ac'); finSave(q => { q.accounts.push({ id: acct, name: b.newAccount.name, kind: b.newAccount.kind || 'current', number: b.newAccount.number || '', currency: finP().base, owner: 'me', holder: 'me', createdAt: at }); }); }
    if (b.limit !== null) finSave(q => { const a = q.accounts.find(x => x.id === acct); if (a) { a.limit = b.limit; a.limitSet = true; } });
    if (b.balance !== null || b.available !== null || b.outstanding !== null) snaps.push({ id: E.uid('bl'), acct, date: b.date, balance: b.balance, available: b.available, outstanding: b.outstanding, source: 'draft', note: b.evidence, at });
    if (b.change && b.change.unexplained) finSave(q => { (q.questions = q.questions || []).push({ id: E.uid('q'), kind: 'balance', acct, date: b.date, diff: b.change.unexplained, at, text: `${(finAcct(acct) || {}).name}: ${fm(Math.abs(b.change.unexplained))} ${b.change.unexplained < 0 ? 'left' : 'came into'} the account by ${fday(b.date)} that no statement shows yet. What was it?` }); });
    done.push(`balance of ${(finAcct(acct) || { name: b.newAccount && b.newAccount.name }).name}`);
  });
  if (snaps.length) finAddSnaps(snaps);
  finSave(q => {
    P.holdings.forEach((h, i) => { if (!inc('h', i)) return; const x = q.holdings.find(z => z.id === h.id); if (!x) return; x.history = [...(x.history || []), { at, principal: x.principal, myShareMonthly: x.myShareMonthly, rate: x.rate }]; for (const k of ['principal', 'myShareMonthly', 'rate']) if (h[k] !== null) x[k] = h[k]; done.push(x.name); });
    P.inputs.forEach((x, i) => { if (!inc('i', i)) return; q.inputs = FIN.setInput(q.inputs || [], { id: E.uid('in'), key: x.key, label: x.label, kind: x.kind, amount: x.amount, from: x.from, permanent: x.permanent }, finToday()); done.push(x.label); });
    P.installments.forEach((x, i) => { if (!inc('n', i)) return; const key = x.key || 'm:' + FIN.payeeKey(x.name); q.installments = (q.installments || []).filter(k => k.key !== key); q.installments.push({ key, name: x.name, amount: x.amount, remaining: x.remaining, end: x.end, status: x.status, manual: !x.key, last: finToday(), at }); done.push('instalment ' + x.name); });
    P.terms.forEach((t, i) => { if (!inc('t', i)) return; const a = q.accounts.find(z => z.id === t.account); if (!a) return; a.terms = { ...(a.terms || {}), ...Object.fromEntries(Object.entries({ method: t.method, rate: t.rate, months: t.months, feePct: t.feePct, feeFixed: t.feeFixed, conditions: t.conditions }).filter(([, v]) => v !== null && v !== '')) }; done.push('terms of ' + a.name); });
    P.goals.forEach((g, i) => { if (!inc('g', i)) return; q.buys = [...(q.buys || []), { id: E.uid('by'), ...g, at }]; done.push('goal ' + g.name); });
    if (!P0) P.questions.forEach(x => { (q.questions = q.questions || []).push({ id: E.uid('q'), kind: 'draft', text: x.text, about: x.about, at }); });
    q.drafts = [...(q.drafts || []), { at, text: String((src || D).text || '').slice(0, 2000), files: ((src || D).files || []).map(f => f.name), applied: done }].slice(-30);
  });
  const ch = []; P.thirdParty.forEach((t, i) => { if (!inc('p', i)) return; const x = clone(FS.by.get(t.txId)); if (!x) return; let pid = (finP().parties.find(z => FIN.norm(z.name) === FIN.norm(t.person)) || {}).id; if (!pid && t.person) { pid = E.uid('pt'); finSave(q => { q.parties.push({ id: pid, name: t.person, match: '' }); }); } finHist(x, 'cat', x.cat, 'held', 'you said it belongs to ' + (t.person || 'someone else')); x.cat = 'held'; x.party = pid || ''; x.catSrc = 'manual'; x.asked = true; x.note = [x.note, t.note].filter(Boolean).join(' · '); ch.push(x); done.push('someone else’s money ' + fm(x.amount)); });
  if (ch.length) finWrite(ch);
  finLog('position update', { applied: done });
  if (P0) return done;
  UI.fin.draft2 = { text: '', files: [], lastApplied: done }; render(); toast(done.length ? `Updated: ${done.join(', ')}.` : 'Nothing to change.');
  return done;
}

/* --- the Update page --- */
FIN_VIEW.update = () => {
  const p = finP(), n = finNow(), D = UI.fin.draft2 = UI.fin.draft2 || { text: '', files: [] }, Q = finQuestions();
  const auto = p.autoFix !== false, log = (typeof finAutoLog === 'function' ? finAutoLog() : []).slice().reverse();
  return `${auto ? `<section class="card fin-card"><h2>Sorted by Claude${log.length ? ` (${log.length})` : ''}</h2>
    <p class="small muted">Anything unclear — a deposit nobody explained, a repeated payment, a balance that moved, a line that could not be read — is decided by Claude straight away, so nothing waits for you. Each decision is listed here; tell the canvas if one is wrong and it is changed.</p>
    ${log.length ? `<div class="tbl-wrap"><table class="tbl fin-autolog"><thead><tr><th>When</th><th>What</th><th>Decided</th><th>Why</th><th></th></tr></thead><tbody>${log.slice(0, 60).map(x => `<tr><td class="nowrap small">${fmtDateTime(x.at)}</td><td>${esc(x.label)}</td><td><b>${esc(x.how)}</b>${x.by === 'rule' ? ' <span class="fin-tag">rule</span>' : ''}</td><td class="small">${esc(x.why || '')}</td><td>${x.sec ? `<button class="btn sm ghost" data-act="fin-sec" data-s="${esc(x.sec)}">Open</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Nothing needed deciding yet.</p>'}</section>`
    : `<section class="card fin-card"><h2>Questions for you${Q.length ? ` (${Q.length})` : ''}</h2>${Q.length ? `<div class="fin-qs">${Q.slice(0, 20).map(finQuestionHTML).join('')}</div>` : '<p class="small muted">Nothing unclear right now.</p>'}</section>`}
  ${finDailyHTML(n)}
  <section class="card fin-card"><h2>What I use for planning</h2>
    <div class="fin-kpis">${finKpi('Income a month', fk(n.income), esc(n.incomeBasis))}${finKpi('Usual spending a month', fk(n.spending), esc(n.spendBasis))}${finKpi('Instalments a month', fk(n.instMonthly), `${n.inst.filter(i => i.status === 'active' || i.status === 'missing').length} active`, { act: 'fin-sec', data: { s: 'credit' } })}${finKpi('Left to save a month', fk(n.capacity), `income − spending${n.goalsMonthly ? ` − goals ${fk(n.goalsMonthly)}` : ''}`, { est: true })}${finKpi('Free cash now', fk(n.free), `${fk(n.cash)} in your accounts${n.held ? ` − ${fk(n.held)} others’ money` : ''} − ${fk(n.reserve)} safety reserve`)}${finKpi('Financial health', n.health.score === null ? '—' : n.health.score + '/100', n.health.items.filter(x => x.g).map(x => `${x.label}: ${x.g}`).join(' · '))}</div>
    <details><summary class="small">Your inputs and their history</summary>${(p.inputs || []).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>What</th><th class="num">Amount</th><th>From</th><th>Until</th><th></th></tr></thead><tbody>${p.inputs.slice().sort((a, b) => a.key.localeCompare(b.key) || (b.from || '').localeCompare(a.from || '')).map(i => `<tr class="${i.to && i.to < finToday() ? 'muted' : ''}"><td>${esc(i.label)} <small class="muted">${esc(i.kind)}${i.temp ? ' · temporary' : ''}</small></td><td class="num">${fm(+i.amount)}</td><td>${fday(i.from)}</td><td>${i.to ? fday(i.to) : 'now'}</td><td><button class="icon-btn" data-act="fin-input-del" data-id="${esc(i.id)}" aria-label="Remove">${I.x}</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">None yet — the statements are used. Write e.g. “my salary is 30,000”.</p>'}</details>
    <details><summary class="small">Earlier updates</summary><ul class="small fin-list">${(p.drafts || []).slice().reverse().map(d => `<li><span class="muted">${fmtDateTime(d.at)}</span> — ${esc(d.text.slice(0, 160))}${d.files.length ? ` <span class="muted">(${d.files.length} screenshot${d.files.length === 1 ? '' : 's'})</span>` : ''} → ${esc(d.applied.join(', ') || 'nothing')}</li>`).join('') || '<li class="muted">None yet.</li>'}</ul></details>
  </section>`;
};
function finDraftPreviewHTML(D) {
  const P = D.preview, chk = (k, i) => `<input type="checkbox" data-chg="fin-draft-inc" data-k="${k}${i}" ${D.includes && D.includes[k + i] === false ? '' : 'checked'}>`;
  const total = P.balances.length + P.holdings.length + P.inputs.length + P.thirdParty.length + P.installments.length + P.terms.length + P.goals.length;
  const rows = [];
  P.balances.forEach((b, i) => { const a = b.account && finAcct(b.account); const prev = b.prev || {}; rows.push(`<tr><td>${chk('b', i)}</td><td>Balance</td><td><b>${esc(a ? a.name : (b.newAccount || {}).name + ' (new account)')}</b><br><small class="muted">${esc(b.evidence)}</small></td><td class="num">${prev.date ? `${fm(prev.balance)}<br><small class="muted">${fday(prev.date)}</small>` : '—'}</td><td class="num">${b.balance !== null ? fm(b.balance) : ''}${b.available !== null ? `<br><small>available ${fm(b.available)}</small>` : ''}${b.outstanding !== null ? `<br><small>owed ${fm(b.outstanding)}</small>` : ''}${b.limit !== null ? `<br><small>limit ${fm(b.limit)}</small>` : ''}<br><small class="muted">${fday(b.date)}</small></td><td class="small">${b.change && !b.change.first ? `${fmc(b.change.diff)} · ${b.change.n} recorded transaction${b.change.n === 1 ? '' : 's'} explain ${fm(b.change.recorded)}${b.change.unexplained ? ` · <b class="fin-neg">${fm(b.change.unexplained)} unexplained — you will be asked</b>` : ' ✓'}` : 'first balance for this account'}</td></tr>`); });
  P.holdings.forEach((h, i) => rows.push(`<tr><td>${chk('h', i)}</td><td>Holding</td><td><b>${esc(h.name)}</b></td><td class="num small">${['principal', 'myShareMonthly', 'rate'].filter(k => h[k] !== null).map(k => `${k}: ${h.prev[k] ?? '—'}`).join('<br>')}</td><td class="num small">${['principal', 'myShareMonthly', 'rate'].filter(k => h[k] !== null).map(k => `${k}: ${h[k]}`).join('<br>')}</td><td class="small">${esc(h.evidence)}</td></tr>`));
  P.inputs.forEach((x, i) => rows.push(`<tr><td>${chk('i', i)}</td><td>${esc(x.kind)}</td><td><b>${esc(x.label)}</b>${x.prev ? '' : ' <span class="fin-tag">new</span>'}<br><small class="muted">${esc(x.evidence)}</small></td><td class="num">${x.prev ? fm(+x.prev.amount) : '—'}</td><td class="num">${fm(x.amount)}<br><small class="muted">from ${fday(x.from)}${x.permanent ? '' : ' · temporary'}</small></td><td class="small">${x.prev ? 'replaces the current value from that date; the old one is kept as history' : 'added'}</td></tr>`));
  P.thirdParty.forEach((t, i) => rows.push(`<tr><td>${chk('p', i)}</td><td>Not your money</td><td><b>${fm(t.tx.amount)}</b> on ${fday(t.tx.date)} · ${esc(FIN.cleanDesc(t.tx.desc || ''))}</td><td>${esc((finCat(t.tx.cat) || {}).name || '')}</td><td>held for ${esc(t.person || 'someone else')}</td><td class="small">left out of your income, savings and net worth</td></tr>`));
  P.installments.forEach((x, i) => rows.push(`<tr><td>${chk('n', i)}</td><td>Instalment</td><td><b>${esc(x.name)}</b></td><td></td><td class="num">${x.amount !== null ? fm(x.amount) + ' / month' : ''}${x.remaining !== null ? `<br><small>${x.remaining} left</small>` : ''}${x.end ? `<br><small>until ${fmon(x.end)}</small>` : ''}</td><td class="small">${esc(x.status)}</td></tr>`));
  P.terms.forEach((t, i) => rows.push(`<tr><td>${chk('t', i)}</td><td>Terms</td><td><b>${esc(t.name)}</b></td><td></td><td class="small">${esc([t.method, t.rate !== null ? t.rate + '%' : '', t.months ? t.months + ' months' : '', t.feePct ? 'fee ' + t.feePct + '%' : '', t.feeFixed ? 'fee ' + t.feeFixed : ''].filter(Boolean).join(' · '))}</td><td class="small">${esc(t.conditions)}</td></tr>`));
  P.goals.forEach((g, i) => rows.push(`<tr><td>${chk('g', i)}</td><td>Purchase goal</td><td><b>${esc(g.name)}</b></td><td></td><td class="num">${fm(g.price)}${g.wantBy ? `<br><small>by ${fday(g.wantBy)}</small>` : ''}</td><td class="small">priority ${g.priority}</td></tr>`));
  const unchanged = finP().accounts.filter(a => !P.balances.some(b => b.account === a.id));
  return `<div class="fin-preview"><h3>Preview — nothing is saved yet</h3>
    ${total ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Type</th><th>What</th><th class="num">Now</th><th class="num">New</th><th>Effect</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>` : '<p class="small">No changes found in what you wrote.</p>'}
    ${unchanged.length ? `<p class="small muted">Left as they are: ${unchanged.map(a => esc(a.name)).join(', ')}.</p>` : ''}
    ${P.questions.length ? `<div class="fin-note">❓ ${P.questions.map(q => esc(q.text)).join('<br>❓ ')}<br><small>Answer below and press “Understand” again, or apply the rest now.</small><textarea class="input" id="fin-draft-ans" placeholder="Your answers">${esc(D.answers || '')}</textarea></div>` : ''}
    <div class="row end"><button class="btn ghost" data-act="fin-draft-x">Discard</button>${total ? `<button class="btn primary" data-act="fin-draft-apply">Apply ${total} change${total === 1 ? '' : 's'}</button>` : ''}</div></div>`;
}
function finQuestionHTML(q) {
  const p = finP(), id = esc(q.id);
  if (q.kind === 'deposit') return `<div class="fin-q-item"><p>${q.text}</p><div class="row"><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="income">My income</button><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="own">From my own account</button><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="invest">Investment return</button><select class="input sm" data-chg="fin-ans-party" data-id="${id}"><option value="">Someone else’s money…</option>${p.parties.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}<option value="__new">Another person…</option></select></div></div>`;
  if (q.kind === 'inst') return `<div class="fin-q-item"><p>${esc(q.text)}</p><div class="row"><label class="small">payments left <input class="input num sm" id="qa-${id}" inputmode="numeric"></label><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="active">Still active</button><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="ended">Finished</button><button class="btn sm ghost" data-act="fin-ans" data-id="${id}" data-how="stopped">Stopped / cancelled</button></div></div>`;
  if (q.kind === 'balance') return `<div class="fin-q-item"><p>${esc(q.text)}</p><div class="row">${q.diff < 0 ? `<select class="input sm" id="qc-${id}">${finCatOptions('other_exp', ['expense'])}</select><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="spend">Spending</button>` : `<button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="income">My income</button>`}<button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="own">Moved between my accounts</button><button class="btn sm" data-act="fin-ans" data-id="${id}" data-how="theirs">Someone else’s money</button><button class="btn sm ghost" data-act="fin-ans" data-id="${id}" data-how="later">It will be in a statement</button></div></div>`;
  return `<div class="fin-q-item"><p>${esc(q.text)}</p><div class="row"><button class="btn sm" data-act="fin-ans-draft" data-id="${id}">Answer in the box above</button><button class="btn sm ghost" data-act="fin-ans" data-id="${id}" data-how="dismiss">Not needed</button></div></div>`;
}

/* --- daily balances, account by account --- */
function finDailyHTML(n) {
  const p = finP(), U = UI.fin.daily = UI.fin.daily || { date: finToday(), v: {} };
  const rows = n.accts.filter(x => ['current', 'savings', 'credit_card', 'bnpl', 'cash', 'investment'].includes(x.a.kind));
  const mom = p.holdings.find(h => h.id === 'mom');
  const field = (id, k, ph) => `<input class="input num sm" data-chg="fin-daily" data-id="${esc(id)}" data-k="${k}" value="${esc((U.v[id] || {})[k] ?? '')}" placeholder="${esc(ph ?? '')}" inputmode="decimal">`;
  return `<section class="card fin-card"><div class="row"><h2>Today’s balances</h2><span class="spacer"></span><label class="small">as of <input class="input sm" type="date" data-chg="fin-daily-date" value="${esc(U.date)}"></label></div>
    <p class="small muted">Fill in only the accounts you checked — the others stay as they are. Each new figure is compared with the last one and with the transactions recorded since.</p>
    <div class="tbl-wrap"><table class="tbl fin-daily"><thead><tr><th>Account</th><th class="num">Last known</th><th>New balance</th><th></th></tr></thead><tbody>
    ${rows.map(({ a, l }) => `<tr><td><b>${esc(a.name)}</b>${a.holder && a.holder !== 'me' ? `<br><small class="muted">in ${esc(a.holder)}’s name</small>` : ''}</td>
      <td class="num">${a.kind === 'credit_card' || a.kind === 'bnpl' ? `${l.owed !== null && l.owed !== undefined ? `owed ${fm(l.owed)}` : '—'}${l.available !== null && l.available !== undefined ? `<br><small>available ${fm(l.available)}${l.limit ? ` of ${fm(l.limit)}` : ''}</small>` : ''}` : typeof l.balance === 'number' ? fm(l.balance) : '—'}<br><small class="muted">${l.date ? `${fday(l.date)} · ${l.source === 'you' ? 'you' : 'statement'}` : 'never'}</small></td>
      <td>${a.kind === 'credit_card' || a.kind === 'bnpl' ? `<div class="row">${field(a.id, 'outstanding', 'owed')}${field(a.id, 'available', 'available')}</div>` : field(a.id, 'balance', typeof l.balance === 'number' ? l.balance : '')}</td>
      <td class="small">${finBalTrend(a.id)}</td></tr>`).join('')}
    ${mom ? `<tr><td><b>${esc(mom.name)}</b><br><small class="muted">your money: ${fm(+mom.principal || 0)} · in your mother’s name</small></td><td class="num">${fm(+mom.principal || 0)}<br><small class="muted">principal</small></td><td>${field('h:mom', 'balance', 'principal')}</td><td></td></tr>` : ''}
    </tbody></table></div>
    <div class="row end"><button class="btn primary" data-act="fin-daily-check">${p.autoFix !== false ? 'Save balances' : 'Check the changes'}</button></div>
    ${U.preview ? finDailyPreviewHTML(U) : ''}
    ${finBalHistoryHTML()}
  </section>`;
}
function finBalTrend(acct) { const s = finSnaps().filter(x => x.acct === acct).sort((a, b) => a.date.localeCompare(b.date)).slice(-2); if (s.length < 2 || typeof s[0].balance !== 'number' || typeof s[1].balance !== 'number') return ''; const d = FIN.r2(s[1].balance - s[0].balance); return `${d >= 0 ? '▲' : '▼'} ${fm(Math.abs(d))} since ${fday(s[0].date)}`; }
function finDailyCheck() {
  const U = UI.fin.daily, n = finNow(), out = [];
  for (const [id, v] of Object.entries(U.v || {})) {
    const num = k => v[k] === '' || v[k] === undefined ? null : (FIN.parseNum(v[k]) || {}).n ?? null;
    if (id === 'h:mom') { const b = num('balance'); if (b !== null) out.push({ id, name: (finP().holdings.find(h => h.id === 'mom') || {}).name, balance: b, holding: true }); continue; }
    const x = n.accts.find(z => z.a.id === id); if (!x) continue;
    const r = { id, name: x.a.name, kind: x.a.kind, balance: num('balance'), available: num('available'), outstanding: num('outstanding'), prev: x.l };
    if (r.balance === null && r.available === null && r.outstanding === null) continue;
    const newBal = r.balance !== null ? r.balance : r.outstanding !== null ? -r.outstanding : null;
    const xb = finLatest(x.a, { base: true });   // compared with the last balance known for sure (later lines are counted below, once)
    if (newBal !== null) r.change = FIN.balanceChange(xb.date && typeof (xb.balance ?? (xb.owed !== undefined && xb.owed !== null ? -xb.owed : null)) === 'number' ? { balance: xb.balance ?? -xb.owed, date: xb.date } : null, { balance: newBal, date: U.date }, finTx().filter(t => t.acct === id));
    out.push(r);
  }
  // an unexplained drop in one account matched by the same rise in another: money moved between your accounts
  for (const a of out) for (const b of out) if (a !== b && a.change && b.change && a.change.unexplained && b.change.unexplained && Math.abs(a.change.unexplained + b.change.unexplained) < 0.01) { a.transfer = b.name; }
  U.preview = out; render();
}
function finDailyPreviewHTML(U) {
  const P = U.preview; if (!P.length) return '<p class="small muted">Nothing filled in.</p>';
  const cls = r => { const c = r.change; if (!c || c.first) return 'first balance recorded'; if (!c.unexplained) return c.n ? `matches ${c.n} recorded transaction${c.n === 1 ? '' : 's'} ✓` : 'no change'; if (r.transfer) return `moved to/from ${esc(r.transfer)} (between your accounts)`; return c.unexplained < 0 ? `${fm(-c.unexplained)} not in any statement: spending, a withdrawal or a transfer? — you will be asked` : `${fm(c.unexplained)} not in any statement: income, a deposit, a transfer or someone else’s money? — you will be asked`; };
  const left = finNow().accts.filter(x => !P.some(r => r.id === x.a.id)).map(x => x.a.name);
  return `<div class="fin-preview"><h3>Check before saving</h3><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th class="num">Previous</th><th class="num">New</th><th class="num">Difference</th><th>What it looks like</th></tr></thead><tbody>
    ${P.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.holding ? '' : r.prev && r.prev.date ? `${fm(r.prev.balance ?? (r.prev.owed !== undefined ? -r.prev.owed : null))}<br><small class="muted">${fday(r.prev.date)}</small>` : '—'}</td><td class="num">${r.balance !== null ? fm(r.balance) : ''}${r.outstanding !== null && r.outstanding !== undefined ? `owed ${fm(r.outstanding)}` : ''}${r.available !== null && r.available !== undefined ? `<br><small>available ${fm(r.available)}</small>` : ''}</td><td class="num">${r.change && !r.change.first ? fmc(r.change.diff) : ''}</td><td class="small">${r.holding ? 'principal updated' : cls(r)}</td></tr>`).join('')}</tbody></table></div>
    ${left.length ? `<p class="small muted">Unchanged: ${left.map(esc).join(', ')}.</p>` : ''}
    <div class="row end"><button class="btn ghost" data-act="fin-daily-x">Cancel</button><button class="btn primary" data-act="fin-daily-save">Save these balances</button></div></div>`;
}
function finDailySave() {
  const U = UI.fin.daily, at = nowISO(), snaps = [], qs = [];
  for (const r of U.preview || []) {
    if (r.holding) { finSave(q => { const h = q.holdings.find(x => x.id === 'mom'); if (h) { h.history = [...(h.history || []), { at, principal: h.principal }]; h.principal = r.balance; } }); continue; }
    snaps.push({ id: E.uid('bl'), acct: r.id, date: U.date, balance: r.balance, available: r.available, outstanding: r.outstanding, source: 'daily', at });
    if (r.change && r.change.unexplained && !r.transfer) qs.push({ id: E.uid('q'), kind: 'balance', acct: r.id, date: U.date, diff: r.change.unexplained, at, text: `${r.name}: ${fm(Math.abs(r.change.unexplained))} ${r.change.unexplained < 0 ? 'left' : 'came into'} the account by ${fday(U.date)} that no statement shows yet. What was it?` });
  }
  if (snaps.length) finAddSnaps(snaps);
  if (qs.length) finSave(q => { q.questions = [...(q.questions || []), ...qs]; });
  finLog('balances updated', { n: snaps.length });
  UI.fin.daily = { date: finToday(), v: {} }; render(); toast(`${snaps.length} balance${snaps.length === 1 ? '' : 's'} saved${qs.length ? ` · ${qs.length} question${qs.length === 1 ? '' : 's'} for you` : ''}.`);
}
// balances over time and between two dates
function finBalHistoryHTML() {
  const p = finP(), H = UI.fin.hist = UI.fin.hist || { a: '', b: '' };
  const at = (acct, d) => { const s = finSnaps().filter(x => x.acct === acct && x.date <= d && typeof x.balance === 'number').sort((x, y) => x.date.localeCompare(y.date)).pop(); const t = finTx().filter(x => x.acct === acct && typeof x.balance === 'number' && x.date <= d).sort((x, y) => x.date.localeCompare(y.date)).pop(); const c = [s && { date: s.date, v: s.balance }, t && { date: t.date, v: t.balance }].filter(Boolean).sort((x, y) => x.date.localeCompare(y.date)).pop(); return c || null; };
  const snaps = finSnaps().slice().sort((a, b) => b.date.localeCompare(a.date) || (b.at || '').localeCompare(a.at || '')).slice(0, 40);
  return `<details class="fin-hist-d"><summary class="small">Balance history and comparing two dates</summary>
    <div class="row"><label class="small">from <input class="input sm" type="date" data-chg="fin-hist" data-k="a" value="${esc(H.a)}"></label><label class="small">to <input class="input sm" type="date" data-chg="fin-hist" data-k="b" value="${esc(H.b)}"></label></div>
    ${H.a && H.b ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Account</th><th class="num">${fday(H.a)}</th><th class="num">${fday(H.b)}</th><th class="num">Change</th></tr></thead><tbody>${p.accounts.map(a => { const x = at(a.id, H.a), y = at(a.id, H.b); return `<tr><td>${esc(a.name)}</td><td class="num">${x ? fm(x.v) : '—'}</td><td class="num">${y ? fm(y.v) : '—'}</td><td class="num">${x && y ? fmc(y.v - x.v) : '—'}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
    <ul class="small fin-list">${snaps.map(s => `<li>${fday(s.date)} · ${esc((finAcct(s.acct) || { name: s.acct === 'h:mom' ? 'CIB investment' : s.acct }).name)}: ${typeof s.balance === 'number' ? fm(s.balance) : ''}${typeof s.outstanding === 'number' ? ` owed ${fm(s.outstanding)}` : ''}${typeof s.available === 'number' ? ` · available ${fm(s.available)}` : ''} <span class="muted">(${esc(s.source)})</span></li>`).join('') || '<li class="muted">No balances given yet.</li>'}</ul></details>`;
}

/* --- card, Halan and instalments --- */
FIN_VIEW.credit = () => {
  const n = finNow(), p = finP(), cur = finToday().slice(0, 7);
  const facc = (x, title) => { if (!x) return ''; const a = x.a, t = a.terms || {}, i = p.accounts.findIndex(z => z.id === a.id), util = x.limit && x.owed !== null && x.owed !== undefined ? FIN.r2(x.owed / x.limit * 100) : null;
    const tf = (k, l, o = {}) => `<label class="field"><span class="label">${l}</span><input class="input ${o.num ? 'num' : ''}" data-chg="fin-terms" data-i="${i}" data-k="${k}" value="${esc(t[k] ?? '')}" ${o.num ? 'inputmode="decimal"' : ''} placeholder="${esc(o.ph || '')}"></label>`;
    return `<section class="card fin-card"><h2>${FIN.norm(a.name).startsWith(FIN.norm(title)) ? esc(a.name) : `${esc(title)} — ${esc(a.name)}`}</h2>
      <div class="fin-kpis">${finKpi('Limit', x.limit ? fk(x.limit) : '—', a.kind === 'credit_card' ? 'when nothing is used' : 'financing you can use')}${finKpi('Owed now', x.owed !== null && x.owed !== undefined ? fk(x.owed) : '—', x.date ? `${fday(x.date)} · ${x.source === 'you' ? 'you' : 'statement'}` : 'no figure yet')}${finKpi('Available now', x.available !== null && x.available !== undefined ? fk(x.available) : '—', 'never assumed to be the full limit')}${util !== null ? finKpi('Used', fpct(util), util > 60 ? 'high — keep it under about a third' : util > 30 ? 'moderate' : 'low') : ''}${a.stmt && a.stmt.dueDate ? finKpi('Next payment', a.stmt.minDue ? `${fk(a.stmt.minDue)} minimum` : '—', `due ${fday(a.stmt.dueDate)} · statement of ${fday(a.stmt.date)}`) : ''}</div>
      <div class="fin-form-g"><label class="field"><span class="label">Limit</span><input class="input num" data-chg="fin-limit" data-i="${i}" value="${esc(a.limit ?? '')}" inputmode="decimal"></label>
        <label class="field"><span class="label">How interest is charged</span><select class="input" data-chg="fin-terms" data-i="${i}" data-k="method"><option value="none" ${t.method === 'none' ? 'selected' : ''}>No interest (0%)</option><option value="flat" ${t.method === 'flat' ? 'selected' : ''}>Flat % a month</option><option value="reducing" ${t.method === 'reducing' ? 'selected' : ''}>% a year on balance</option></select></label>
        ${tf('rate', t.method === 'reducing' ? 'Rate % a year' : 'Rate % a month', { num: 1 })}${tf('months', 'Usual months', { num: 1 })}${tf('feePct', 'Fees % of the price', { num: 1 })}${tf('feeFixed', 'Fixed fees', { num: 1 })}</div><div class="fin-form-g">${tf('conditions', 'Repayment conditions', { ph: 'e.g. 3, 6, 12 or 24 months; early repayment fee' }).replace('class="field"', 'class="field fin-wide"')}</div>
      ${(() => { const q = FIN.financeQuote(10000, t, +t.months || 12); return `<p class="small">Example: <b>${fm(10000)}</b> over ${q.months} months → <b>${fm(q.monthly)}</b> a month, interest ${fm(q.interest)}, fees ${fm(q.fees)}, total <b>${fm(q.total)}</b>.${x.available ? ` You can finance up to <b>${fm(x.available)}</b> now.` : ''}</p>`; })()}
    </section>`; };
  const inst = n.inst, ln = Array.from({ length: 12 }, (_, k) => { const m = FIN.addMonths(cur, k); return { k: m, label: fmon(m), short: fmtDate(m + '-15', { month: 'short' }), a: 0, b: FIN.installmentLoad(inst, m) }; });
  return `${facc(n.card, 'Credit card')}${facc(n.halan, 'Halan')}
    <section class="card fin-card"><h2>Instalments</h2><p class="small muted">Found in your statements — “06 OF 12” lines are counted by the bank; other fixed monthly payments are asked about. A payment missing for a month or two is still counted until you say it ended.</p>
    ${inst.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>What</th><th class="num">A month</th><th>Paid</th><th class="num">Left</th><th>Ends</th><th class="num">Still to pay</th><th>Status</th><th></th></tr></thead><tbody>${inst.map(i => `<tr><td>${esc(i.name)}<br><small class="muted">${i.source === 'count' ? 'counted on the statement' : i.source === 'you' ? 'you told me' : 'repeats every month'}</small></td><td class="num">${fm(i.amount)}</td><td>${i.of ? `${i.n} of ${i.of}` : i.n ? `${i.n} seen` : ''}</td><td class="num">${i.remaining ?? '?'}</td><td>${i.end ? fmon(i.end) : '?'}</td><td class="num">${i.outstanding !== null && i.outstanding !== undefined ? fm(i.outstanding) : '?'}</td>
      <td>${{ active: '<span class="fin-tag ok">active</span>', missing: '<span class="fin-tag warn">not seen lately</span>', completed: '<span class="fin-tag">finished</span>', discontinued: '<span class="fin-tag">stopped</span>' }[i.status] || esc(i.status)}</td><td class="nowrap"><input class="input num sm" id="il-${esc(i.key)}" placeholder="left" inputmode="numeric" aria-label="Payments left"><button class="btn sm ghost" data-act="fin-inst-set" data-key="${esc(i.key)}">Set</button><button class="btn sm ghost" data-act="fin-ans" data-id="inst:${esc(i.key)}" data-how="ended">Finished</button></td></tr>`).join('')}
      <tr class="fin-total"><td>Total this month</td><td class="num">${fm(n.instMonthly)}</td><td colspan="3"></td><td class="num">${fm(inst.reduce((s, i) => s + (i.status !== 'completed' && i.outstanding ? i.outstanding : 0), 0))}</td><td colspan="2"></td></tr></tbody></table></div>
      <h3>Instalments in the coming months ${finEst}</h3>${finBars(ln, { la: '', lb: 'Instalments', title: 'Instalments by month' })}` : '<p class="small muted">None found yet.</p>'}</section>`;
};

/* --- purchase goals: one plan for everything you want to buy --- */
function finBuyPlan() {
  const p = finP(), n = finNow(), today = finToday();
  const cardT = n.card ? { available: n.card.available || 0, terms: n.card.terms && n.card.terms.method ? n.card.terms : null } : {}, halT = n.halan ? { available: n.halan.available || 0, terms: n.halan.terms && n.halan.terms.method && (n.halan.terms.method === 'none' || +n.halan.terms.rate) ? n.halan.terms : null } : {};
  return FIN.planPurchases(p.buys || [], { cash: n.free, capacity: n.capacity, card: cardT, halan: halT }, today, { focus: !!p.buyFocus });
}
const FIN_REC = { cash: ['Buy now with cash', 's3'], card_full: ['Card now, pay it in full', 's1'], card_plan: ['Card instalments', 's1'], halan: ['Halan instalments', 's2'], save: ['Save first', 's3'], not_yet: ['Not affordable yet', 'muted'] };
FIN_VIEW.buy = () => {
  const p = finP(), n = finNow(), plan = finBuyPlan(), focus = !!p.buyFocus;
  const items = plan.items, E0 = UI.fin.buyEdit;
  return `<section class="card fin-card"><div class="row"><h2>Purchase goals</h2><span class="spacer"></span><div class="seg" role="group" aria-label="Plan for"><button data-act="fin-buy-focus" data-v="0" aria-pressed="${!focus}">All goals</button><button data-act="fin-buy-focus" data-v="1" aria-pressed="${focus}">Focus first</button></div></div>
    <div class="fin-kpis">${finKpi('Total to buy', fk(plan.total), `${items.length} item${items.length === 1 ? '' : 's'}`)}${finKpi('From cash now', fk(plan.fromCash), `free cash ${fk(n.free)} (after a ${fk(n.reserve)} safety reserve${n.held ? ' and others’ money' : ''})`)}${finKpi('Saving a month', fk(plan.monthly), `of ${fk(n.capacity)} you can save${plan.cardRepay ? ` · plus ${fk(plan.cardRepay)} once to clear the card` : ''}${n.goalsMonthly ? ` · after ${fk(n.goalsMonthly)} for your other goals` : ''}`, { est: true })}${finKpi('Everything bought by', plan.allBy ? fmon(plan.allBy) : '—', plan.late.length ? `${plan.late.length} later than you want` : 'on your dates', { est: true, cls: plan.late.length ? 'bad' : '' })}${finKpi('Card available', n.card && n.card.available !== null && n.card.available !== undefined ? fk(n.card.available) : '—', n.card && n.card.limit ? `of ${fk(n.card.limit)}` : '')}${finKpi('Halan available', n.halan && n.halan.available !== null && n.halan.available !== undefined ? fk(n.halan.available) : '—', n.halan && (n.halan.available === null || n.halan.available === undefined) ? 'tell the canvas what the Halan app shows' : n.halan && n.halan.terms && n.halan.terms.rate ? `${n.halan.terms.rate}% ${n.halan.terms.method === 'reducing' ? 'a year' : 'a month'}` : 'add its terms', { act: 'fin-sec', data: { s: n.halan && (n.halan.available === null || n.halan.available === undefined) ? 'update' : 'credit' } })}</div>
    ${items.length ? finBuyMap(plan, n) : '<p class="small muted">No purchase goals yet — add one below, or tell the canvas below (e.g. “I want a laptop for 40,000 by March”).</p>'}
    ${plan.late.length || n.capacity <= 0 ? `<div class="fin-note bad">${n.capacity <= 0 ? 'Nothing is left to save each month after your usual spending, instalments and other goals — purchases can only come from free cash or financing. ' : ''}${plan.late.length ? `Later than you want: ${items.filter(i => i.late).map(i => `<b>${esc(i.name)}</b> (${i.ready ? fmon(i.ready) : 'not reached'} instead of ${fmon(i.wantBy.slice(0, 7))})`).join(', ')}. Options: move the date, focus on it first, or use instalments if they fit.` : ''}</div>` : ''}
  </section>
  ${items.length ? `<section class="card fin-card"><h2>Each item</h2><div class="tbl-wrap"><table class="tbl fin-buy"><thead><tr><th>Item</th><th class="num">Price</th><th>Best way</th><th class="num">Cash now</th><th class="num">Save a month</th><th>Ready</th><th>Card</th><th>Halan</th><th></th></tr></thead><tbody>${items.map(it => { const o = it.options; return `<tr class="${it.late ? 'fin-short' : ''}"><td><label class="check"><input type="checkbox" data-chg="fin-buy-f" data-id="${esc(it.id)}" ${it.focus ? 'checked' : ''} aria-label="Focus"> <b>${esc(it.name)}</b></label><br><small class="muted">priority ${it.priority || 2}${it.wantBy ? ` · wanted by ${fday(it.wantBy)}` : ''}</small></td><td class="num">${fm(it.price)}</td><td><span class="fin-tag ${it.rec === 'not_yet' ? 'crit' : 'ok'}">${FIN_REC[it.rec][0]}</span><br><small>${esc(it.why)}</small></td><td class="num">${fm(it.fromCash)}</td><td class="num">${it.monthly ? fm(it.monthly) : '—'}${it.required ? `<br><small class="muted">needs ${fm(it.required)}</small>` : ''}</td><td>${it.ready ? fmon(it.ready) : 'not reached'}</td>
    <td class="small">${o.cardFull ? 'pay in full ✓' : it.price <= o.cardAvailable ? 'fits the limit' : 'over the available limit'}${o.cardPlan ? `<br>${fm(o.cardPlan.monthly)} × ${o.cardPlan.months}, total ${fm(o.cardPlan.total)}` : ''}</td><td class="small">${o.halan ? `${fm(o.halan.monthly)} × ${o.halan.months}<br>total ${fm(o.halan.total)} (cost ${fm(o.halan.cost)})` : it.price <= o.halanAvailable ? 'add Halan’s terms' : 'over what Halan allows'}</td><td class="nowrap"><button class="btn sm ghost" data-act="fin-buy-edit" data-id="${esc(it.id)}">Edit</button><button class="btn sm ghost" data-act="fin-buy-done" data-id="${esc(it.id)}">Bought</button></td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
  <section class="card fin-card"><h2>${E0 && E0 !== 'new' ? 'Edit goal' : 'Add a purchase goal'}</h2>${(() => { const g = E0 && E0 !== 'new' ? (p.buys || []).find(b => b.id === E0) || {} : {}; return `<div class="fin-form-g"><label class="field"><span class="label">What</span><input class="input" id="by-name" value="${esc(g.name || '')}"></label><label class="field"><span class="label">Price</span><input class="input num" id="by-price" value="${esc(g.price || '')}" inputmode="decimal"></label><label class="field"><span class="label">Priority</span><select class="input" id="by-prio">${[[1, 'High'], [2, 'Normal'], [3, 'Low']].map(([v, l]) => `<option value="${v}" ${(+g.priority || 2) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label class="field"><span class="label">Wanted by (optional)</span><input class="input" type="date" id="by-date" value="${esc(g.wantBy || '')}"></label></div><div class="row end">${E0 && E0 !== 'new' ? `<button class="btn danger" data-act="fin-buy-del" data-id="${esc(E0)}">Delete</button><button class="btn ghost" data-act="fin-buy-cancel">Cancel</button>` : ''}<button class="btn primary" data-act="fin-buy-save">${E0 && E0 !== 'new' ? 'Save' : 'Add'}</button></div>`; })()}
    <p class="small muted">Free cash keeps a safety reserve of ${p.emergencyMonths || 3} months of essential costs (${fm(n.reserve)}); monthly savings come from your income minus usual spending, instalments and your other goals (Forecast & goals). Instalment costs use the terms under “Card, Halan & instalments”.</p></section>
  ${(p.buys || []).some(b => b.done) ? `<details class="card fin-card"><summary>Bought (${p.buys.filter(b => b.done).length})</summary><ul class="fin-list">${p.buys.filter(b => b.done).map(b => `<li>${esc(b.name)} — ${fm(+b.price)} · ${fday(b.done)}</li>`).join('')}</ul></details>` : ''}`;
};
// the map: where the money comes from on the left, each item on the right, joined by how it is best paid
function finBuyMap(plan, n) {
  const W = FIN_W['Purchase map'] || 760, items = plan.items, rowH = 64, H = Math.max(4, items.length) * rowH + 30;
  const src = [['cash', 'Cash now', fm(n.free)], ['save', 'Monthly savings', fm(n.capacity) + ' / month'], ['card', 'Credit card', n.card && n.card.available !== null && n.card.available !== undefined ? fm(n.card.available) + ' available' : '—'], ['halan', 'Halan', n.halan && n.halan.available !== null && n.halan.available !== undefined ? fm(n.halan.available) + ' available' : '—']];
  const sx = 12, sw = Math.min(210, W * 0.3), ix = W - Math.min(330, W * 0.48) - 8, iw = W - ix - 8, sy = i => 15 + i * (H - 30) / 4 + 6, iy = i => 15 + i * rowH;
  // text is cut to the box it sits in (about 0.58 of the font size per character), so nothing runs into its neighbour on a phone
  const fit = (t, px, size) => { t = String(t); const n = Math.max(3, Math.floor(px / (size * 0.58))); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  const from = it => it.rec === 'cash' ? [0] : it.rec === 'save' ? (it.fromCash ? [0, 1] : [1]) : it.rec === 'card_full' || it.rec === 'card_plan' ? (it.fromCash ? [0, 2] : [2]) : it.rec === 'halan' ? [3] : [];
  let s = `<svg class="fin-chart fin-map" viewBox="0 0 ${W} ${H}" data-key="Purchase map" data-w="${W}" role="img" aria-label="Purchase map">`;
  items.forEach((it, i) => from(it).forEach(k => { const y1 = sy(k) + 22, y2 = iy(i) + 26, x1 = sx + sw, x2 = ix; s += `<path class="fin-link ${FIN_REC[it.rec][1]}" d="M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}"/>`; }));
  src.forEach(([k, l, v], i) => { s += `<g class="fin-src"><rect x="${sx}" y="${sy(i)}" width="${sw}" height="44" rx="10"/><text x="${sx + 12}" y="${sy(i) + 19}" class="t1">${esc(fit(l, sw - 20, 13))}</text><text x="${sx + 12}" y="${sy(i) + 36}" class="t2">${esc(fit(v, sw - 20, 11.5))}</text><title>${esc(l)}: ${esc(v)}</title></g>`; });
  items.forEach((it, i) => { const y = iy(i), price = fm(it.price, null, { dec: 0 }), pw = price.length * 13 * 0.58, sub = `${FIN_REC[it.rec][0]}${it.ready ? ' · ' + fmon(it.ready) : ''}${it.monthly ? ' · ' + fm(it.monthly, null, { dec: 0 }) + '/mo' : ''}`; s += `<g class="fin-item ${it.focus ? 'focus' : ''} ${it.late ? 'late' : ''}" data-act="fin-buy-edit" data-id="${esc(it.id)}" tabindex="0"><rect x="${ix}" y="${y}" width="${iw}" height="52" rx="10"/><text x="${ix + 12}" y="${y + 20}" class="t1">${esc(fit(it.name + (it.focus ? ' ★' : ''), iw - 36 - pw, 13))}</text><text x="${ix + iw - 12}" y="${y + 20}" class="t1" text-anchor="end">${esc(price)}</text><text x="${ix + 12}" y="${y + 39}" class="t2">${esc(fit(sub, iw - 24, 11.5))}</text><title>${esc(it.name)} — ${esc(it.why)}</title></g>`; });
  s += '</svg>';
  // a timeline of when each item becomes affordable
  const months = [...new Set(items.map(i => i.ready).filter(Boolean))].sort();
  return s + (months.length ? `<div class="fin-tl">${months.map(m => `<div class="fin-tl-m"><b>${fmon(m)}</b>${items.filter(i => i.ready === m).map(i => `<span class="fin-tag ${i.late ? 'crit' : 'ok'}">${esc(i.name)}</span>`).join('')}</div>`).join('')}</div>` : '');
}

/* --- actions --- */
Object.assign(ACT, {
  'fin-draft-read': () => { const D = UI.fin.draft2; D.text = ($('#fin-draft') || {}).value || D.text; const a = $('#fin-draft-ans'); if (a) D.answers = a.value; finDraftRead(); },
  'fin-draft-apply': () => finDraftApply(),
  'fin-draft-x': () => { UI.fin.draft2.preview = null; render(); },
  'fin-draft-file-x': el => { UI.fin.draft2.files.splice(+el.dataset.i, 1); render(); },
  'fin-ans': el => { const id = el.dataset.id, how = el.dataset.how; if (how === 'later' || how === 'dismiss' || how === 'own') { if (id.startsWith('dep:')) return finAnswer(id, how); finSave(q => { const x = (q.questions || []).find(z => z.id === id); if (x) Object.assign(x, { answered: nowISO(), answer: how }); }); return render(); }
    const extra = {}; const c = $('#qc-' + id); if (c) extra.cat = c.value; const r = $('#qa-' + id); if (r) extra.remaining = r.value; finAnswer(id, how, extra); },
  'fin-ans-draft': el => { const q = (finP().questions || []).find(x => x.id === el.dataset.id); const t = $('#fin-draft'); if (t && q) { t.value = (t.value ? t.value + '\n' : '') + q.text + ' → '; t.focus(); } },
  'fin-daily-check': () => finDailyCheck(),
  'fin-daily-save': () => finDailySave(),
  'fin-daily-x': () => { UI.fin.daily.preview = null; render(); },
  'fin-input-del': el => { if (!finAsk('Remove this input? (Its history goes with it.)')) return; finSave(q => { q.inputs = (q.inputs || []).filter(i => i.id !== el.dataset.id); }); render(); },
  'fin-inst-set': el => { const v = ($('#il-' + el.dataset.key) || {}).value; if (v === '' || v === undefined) return toast('Enter how many payments are left.', { err: true }); finAnswer('inst:' + el.dataset.key, 'active', { remaining: v }); },
  'fin-buy-focus': el => { finSave(q => { q.buyFocus = el.dataset.v === '1'; }); render(); },
  'fin-buy-edit': el => { UI.fin.buyEdit = el.dataset.id; UI.fin.sec = 'buy'; render(); const n = $('#by-name'); if (n) n.scrollIntoView({ block: 'center' }); },
  'fin-buy-cancel': () => { UI.fin.buyEdit = null; render(); },
  'fin-buy-save': () => { const name = (($('#by-name') || {}).value || '').trim(), price = (FIN.parseNum(($('#by-price') || {}).value || '') || {}).n; if (!name || !(price > 0)) return toast('Enter what and its price.', { err: true });
    const g = { name, price: Math.abs(price), priority: +($('#by-prio') || {}).value || 2, wantBy: ($('#by-date') || {}).value || '' }, id = UI.fin.buyEdit && UI.fin.buyEdit !== 'new' ? UI.fin.buyEdit : null;
    finSave(q => { q.buys = q.buys || []; if (id) Object.assign(q.buys.find(b => b.id === id) || {}, g); else q.buys.push({ id: E.uid('by'), ...g, at: nowISO() }); }); UI.fin.buyEdit = null; render(); },
  'fin-buy-del': el => { if (!finAsk('Delete this purchase goal?')) return; finSave(q => { q.buys = (q.buys || []).filter(b => b.id !== el.dataset.id); }); UI.fin.buyEdit = null; render(); },
  'fin-buy-done': el => { finSave(q => { const b = (q.buys || []).find(x => x.id === el.dataset.id); if (b) b.done = finToday(); }); render(); toast('Marked as bought — the plan moves on to the next item.'); },
});
Object.assign(CHG, {
  'fin-draft-files': async el => { const fs = [...(el.files || [])]; el.value = ''; const D = UI.fin.draft2 = UI.fin.draft2 || { text: '', files: [] }; D.text = ($('#fin-draft') || {}).value || D.text; for (const f of fs) D.files.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }); render(); },
  'fin-draft-inc': el => { const D = UI.fin.draft2; D.includes = D.includes || {}; D.includes[el.dataset.k] = el.checked; },
  'fin-ans-party': el => { const v = el.value; if (!v) return; if (v === '__new') { const name = prompt('Whose money is it?'); if (name) finAnswer(el.dataset.id, 'theirs', { name }); } else finAnswer(el.dataset.id, 'theirs', { party: v }); },
  'fin-daily': el => { const U = UI.fin.daily; U.v[el.dataset.id] = { ...(U.v[el.dataset.id] || {}), [el.dataset.k]: el.value }; U.preview = null; },
  'fin-daily-date': el => { UI.fin.daily.date = el.value || finToday(); UI.fin.daily.preview = null; render(); },
  'fin-hist': el => { UI.fin.hist[el.dataset.k] = el.value; render(); },
  'fin-terms': el => { finSave(q => { const a = q.accounts[+el.dataset.i]; if (!a) return; a.terms = { ...(a.terms || {}), [el.dataset.k]: ['rate', 'months', 'feePct', 'feeFixed'].includes(el.dataset.k) ? finNum(el.value) : el.value }; }); render(); },
  'fin-limit': el => { finSave(q => { const a = q.accounts[+el.dataset.i]; if (a) { a.limit = finNum(el.value); a.limitSet = true; } }); render(); },
  'fin-buy-f': el => { finSave(q => { const b = (q.buys || []).find(x => x.id === el.dataset.id); if (b) b.focus = el.checked; if (el.checked) q.buyFocus = true; }); render(); },
});
// keep the draft text while typing (the page redraws on other changes)
document.addEventListener('input', e => { if (e.target && e.target.id === 'fin-draft' && UI.fin.draft2) UI.fin.draft2.text = e.target.value; });
Object.assign(window.__FIN, { now: () => finNow(), questions: () => finQuestions(), buy: () => finBuyPlan(), latest: (id, o) => finLatest(finAcct(id), o) });
