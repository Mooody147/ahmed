// Money engine: every number below is worked out by hand in the comment next to it
const F = require('../../src/fin-core.js');
let n = 0, bad = 0;
const eq = (a, b, what) => { n++; const ok = JSON.stringify(a) === JSON.stringify(b); if (!ok) { bad++; console.error('FAIL', what, '\n  got     ', JSON.stringify(a), '\n  expected', JSON.stringify(b)); } };
const near = (a, b, what) => { n++; if (a === null || Math.abs(a - b) > 0.006) { bad++; console.error('FAIL', what, 'got', a, 'expected', b); } };
const yes = (v, what) => { n++; if (!v) { bad++; console.error('FAIL', what); } };

/* amounts and dates as banks print them */
eq(F.parseNum('1,234.50').n, 1234.5, 'thousands comma');
eq(F.parseNum('(1,234.50)').n, -1234.5, 'brackets are negative');
eq(F.parseNum('1.234,50').n, 1234.5, 'comma decimal');
eq(F.parseNum('500.00 CR').mark, 1, 'CR marks a credit');
eq(F.parseNum('75.25 Dr').mark, -1, 'Dr marks a debit');
eq(F.parseNum('٢٬٥٠٠٫٧٥').n, 2500.75, 'Arabic digits');
eq(F.parseNum('-45.00').n, -45, 'minus');
eq(F.parseNum('45.00-').n, -45, 'trailing minus');
eq(F.parseNum(''), null, 'empty is no number');
eq(F.parseDate('05/10/2026', 'dmy').iso, '2026-10-05', 'dd/mm/yyyy');
eq(F.parseDate('10/05/2026', 'mdy').iso, '2026-10-05', 'mm/dd/yyyy');
eq(F.parseDate('5 Oct 2026').iso, '2026-10-05', 'd Mon yyyy');
eq(F.parseDate('05-Oct-26').iso, '2026-10-05', 'dd-Mon-yy');
eq(F.parseDate('١٥/١٠/٢٠٢٦').iso, '2026-10-15', 'Arabic digits date');
eq(F.parseDate('31/02/2026'), null, 'an impossible date is not read');
eq(F.parseDate('05 Oct').iso, null, 'no year and no statement year: not guessed');
eq(F.parseDate('05 Oct', 'dmy', 2026).iso, '2026-10-05', 'year from the statement period');
eq(F.dateOrder(['13/01/2026', '02/03/2026']), 'dmy', 'a day above 12 decides the order');
eq(F.dateOrder(['01/13/2026']), 'mdy', 'month-first statement');

/* 1. reading a statement (CSV/Excel grid) with a review of every row */
const gridA = [
  ['Bank of Test — Statement', '', '', '', '', ''], ['Account No: 1002003004', 'Currency: EGP', '', '', '', ''], ['Period from 01/08/2026 to 30/09/2026', '', '', '', '', ''],
  ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'],
  ['', 'Opening balance', '', '', '', '20,000.00'],
  ['01/08/2026', 'SALARY AUGUST ACME CO', 'R100', '', '30,000.00', '50,000.00'],
  ['03/08/2026', 'POS CARREFOUR MAADI 4455', 'R101', '1,200.00', '', '48,800.00'],
  ['03/08/2026', 'POS COSTA COFFEE ZAMALEK', 'R102', '80.00', '', '48,720.00'],
  ['03/08/2026', 'POS COSTA COFFEE ZAMALEK', 'R103', '80.00', '', '48,640.00'],
  ['', 'branch Zamalek', '', '', '', ''],
  ['10/08/2026', 'NETFLIX.COM', 'R104', '250.00', '', '48,390.00'],
  ['15/08/2026', 'TRANSFER TO OWN ACCOUNT 9988', 'R105', '10,000.00', '', '38,390.00'],
  ['20/08/2026', 'CREDIT CARD PAYMENT', 'R106', '5,000.00', '', '33,390.00'],
  ['25/08/2026', 'TRANSFER FROM AHMED MOHAMED', 'R107', '', '100,000.00', '133,390.00'],
  ['26/08/2026', 'CERTIFICATE INTEREST 63000', 'R108', '', '1,000.00', '134,390.00'],
  ['28/08/2026', 'CASH WITHDRAWAL ATM', 'R109', '60,000.00', '', '74,390.00'],
  ['01/09/2026', 'SALARY SEPTEMBER ACME CO', 'R110', '', '30,000.00', '104,390.00'],
  ['05/09/2026', 'REFUND CARREFOUR MAADI', 'R111', '', '200.00', '104,590.00'],
  ['xx/09/2026', 'SMUDGED LINE', 'R112', '??', '', ''],
  ['', 'Closing balance', '', '', '', '104,590.00'],
];
const det = F.detectGrid(gridA);
eq(det.header, 3, 'header row found below the bank heading');
eq([det.map.date, det.map.desc, det.map.ref, det.map.debit, det.map.credit, det.map.balance], [0, 1, 2, 3, 4, 5], 'columns recognised');
eq(det.meta.currency, 'EGP', 'currency from the heading');
const rdA = F.rowsFromGrid(gridA, det);
eq(rdA.rows.length, 13, 'every transaction line comes back: 12 dated + the smudged one (the wrapped line joins its row)');
eq(rdA.meta.opening, 20000, 'opening balance kept as a statement fact');
eq(rdA.meta.closing, 104590, 'closing balance kept');
eq(rdA.skipped.map(s => s.why), ['statement total or balance line', 'statement total or balance line'], 'skipped lines say why');
eq(rdA.rows[1].amount, -1200, 'debit is money out');
eq(rdA.rows[0].amount, 30000, 'credit is money in');
yes(rdA.rows[3].desc.endsWith('branch Zamalek'), 'wrapped description joined');
eq(rdA.rows.filter(r => r.flags.includes('balance_mismatch')).length, 0, 'running balance agrees on every row');
const smudge = rdA.rows[12];
eq([smudge.date, smudge.amount, smudge.flags.includes('no_date'), smudge.flags.includes('no_amount')], [null, null, true, true], 'an unreadable row is flagged, not guessed and not dropped');
const chkA = F.statementCheck(rdA.rows, rdA.meta);
eq([chkA.from, chkA.to, chkA.diff], ['2026-08-01', '2026-09-05', 0], 'statement period and opening + rows = closing');

// a CSV with one unsigned amount column: the balance decides the direction
const gridU = [['Txn Date', 'Narration', 'Amount', 'Balance'], ['2026-08-01', 'Opening', '', '1,000.00'], ['2026-08-02', 'UBER TRIP', '100.00', '900.00'], ['2026-08-03', 'GIFT FROM FRIEND', '50.00', '950.00'], ['2026-08-04', 'MISC', '10.00', '']];
const rdU = F.rowsFromGrid(gridU, F.detectGrid(gridU));
eq(rdU.rows.map(r => [r.amount, r.dirFrom || '', r.flags.join()]), [[-100, 'balance', ''], [50, 'balance', ''], [10, '', 'direction_unknown']], 'direction from the running balance; unknown stays flagged');

// a text PDF
const pdf = `[Page 1]
Statement of account   Account number: 55667788   Currency EGP
Statement period from 01/10/2026 to 31/10/2026
Date   Value date   Description   Debit   Credit   Balance
Opening balance   5,000.00
02/10/2026   02/10/2026   TALABAT ORDER 77812   350.00   4,650.00
05/10/2026   05/10/2026   SALARY OCTOBER   30,000.00   34,650.00
07/10/2026   07/10/2026   VODAFONE BILL   400.00   34,250.00
Closing balance   34,250.00`;
const rdP = F.rowsFromText(pdf);
eq(rdP.rows.map(r => [r.date, r.amount, r.balance]), [['2026-10-02', -350, 4650], ['2026-10-05', 30000, 34650], ['2026-10-07', -400, 34250]], 'PDF lines read; directions from the running balance');
eq([rdP.meta.opening, rdP.meta.closing, rdP.meta.currency], [5000, 34250, 'EGP'], 'PDF opening/closing/currency');
// a card statement prints what is owed as a positive balance
const card = `Date Description Amount Balance
Opening balance 0.00
03/08/2026 AMAZON EG 5,000.00 5,000.00
12/08/2026 TALABAT 300.00 5,300.00
21/08/2026 PAYMENT RECEIVED THANK YOU 5,000.00 300.00`;
const rdC = F.rowsFromText(card, { card: true });
eq(rdC.rows.map(r => [r.amount, r.balance]), [[-5000, -5000], [-300, -5300], [5000, -300]], 'card: purchases out, payment in; owed balance stored as negative');
yes(rdC.meta.balanceFlipped, 'card balance sign detected');

/* 3. importing again never counts twice (the final acceptance test) */
const mk = (rows, acct, batch) => rows.filter(r => r.date && r.amount !== null).map((r, i) => ({ id: `${batch}-${i}`, acct, date: r.date, desc: r.desc, amount: r.amount, balance: r.balance, ref: r.ref, src: { b: batch, r: r.r, raw: r.raw } }));
const ledger = mk(rdA.rows, 'A', 'b1');
ledger.push({ id: 'b1-x', acct: 'A', date: null, amount: null, desc: smudge.desc, src: { b: 'b1', r: smudge.r, raw: smudge.raw }, flags: ['no_date', 'no_amount'] });
const again = F.matchImport(F.rowsFromGrid(gridA, det).rows, ledger, 'A');
eq(F.importCounts(again), { reviewed: 13, added: 0, dup: 13, updated: 0, review: 0, incomplete: 0 }, 'the same statement again adds nothing');
// the same statement plus two more months, one corrected description, and a third coffee
const gridX = gridA.slice(0, -1).filter(r => r[1] !== 'SMUDGED LINE').concat([
  ['xx/09/2026', 'SMUDGED LINE', 'R112', '??', '', ''],
  ['01/10/2026', 'SALARY OCTOBER ACME CO', 'R113', '', '30,000.00', '134,590.00'],
  ['02/10/2026', 'POS COSTA COFFEE ZAMALEK', 'R114', '80.00', '', '134,510.00'],
  ['01/11/2026', 'SALARY NOVEMBER ACME CO', 'R115', '', '30,000.00', '164,510.00'],
  ['', 'Closing balance', '', '', '', '164,510.00']]);
gridX[10] = ['10/08/2026', 'NETFLIX.COM SUBSCRIPTION', 'R104', '250.00', '', '48,390.00'];
const expd = F.matchImport(F.rowsFromGrid(gridX, F.detectGrid(gridX)).rows, ledger, 'A');
eq(F.importCounts(expd), { reviewed: 16, added: 3, dup: 12, updated: 1, review: 0, incomplete: 0 }, 'only the new months are added; the corrected line updates its record');
eq(expd.find(r => r.act === 'update').changes.map(c => c.f), ['desc'], 'the correction is the description');
eq(expd.filter(r => r.act === 'new').map(r => r.ref), ['R113', 'R114', 'R115'], 'the genuinely new rows');
// without references: two equal coffees on one day are two; a re-import matches them one to one
const noRef = g => g.map((r, i) => i < 4 ? r : [r[0], r[1], '', r[3], r[4], r[5]]);
const led2 = mk(F.rowsFromGrid(noRef(gridA), det).rows, 'A', 'b2');
const re2 = F.matchImport(F.rowsFromGrid(noRef(gridA), det).rows, led2, 'A');
eq([F.importCounts(re2).dup, F.importCounts(re2).added], [12, 0], 'no references: still nothing added again');
// no balances either: an extra equal coffee in a later file is new, the two known ones are repeats
const bare = [{ acct: 'C', id: 'c1', date: '2026-08-03', amount: -80, desc: 'COSTA COFFEE' }, { acct: 'C', id: 'c2', date: '2026-08-03', amount: -80, desc: 'COSTA COFFEE' }];
const rowsC = [1, 2, 3].map(i => ({ r: i, date: '2026-08-03', amount: -80, desc: 'COSTA COFFEE', balance: null, ref: '', flags: [] }));
eq(F.matchImport(rowsC, bare, 'C').map(r => r.act), ['dup', 'dup', 'new'], 'same amount and date alone is not a duplicate: the third coffee is new');
// a different shop for the same amount on the same day is a different transaction
eq(F.matchImport([{ r: 1, date: '2026-08-03', amount: -80, desc: 'UBER TRIP', balance: null, ref: '', flags: [] }], bare, 'C')[0].act, 'new', 'different payee, same amount and day: new');
// the same reference with another amount is a conflict for the user, never an overwrite
const conf = F.matchImport([{ r: 1, date: '2026-08-03', amount: -1250, desc: 'POS CARREFOUR MAADI', balance: null, ref: 'R101', flags: [] }], ledger, 'A')[0];
eq([conf.act, conf.conflicts[0].f], ['review', 'amount'], 'same reference, different amount: flagged');
// the same purchase exported in another format with other wording and its posting date two days later
const fmt = F.matchImport([{ r: 1, date: '2026-08-05', amount: -1200, desc: 'Carrefour Maadi Cairo', balance: null, ref: '', flags: [] }], ledger.filter(t => t.ref !== 'R101' || true).map(t => ({ ...t, ref: '' })), 'A')[0];
eq(fmt.act, 'review', 'a likely repeat dated differently is held for review, not added');

/* 5–6. classification: income, expenses, transfers, refunds, card payments; nothing counted twice */
const ctx = { parties: [{ id: 'ahmed', name: 'Ahmed (brother)', match: 'ahmed' }], holdings: [{ id: 'cd', name: 'Certificate 63,000', owner: 'me', match: 'certificate interest', cat: 'interest', principal: 63000, rate: null }] };
const cls = d => { const r = F.classify({ desc: d[0], amount: d[1] }, ctx); return r.cat + (r.party ? ':' + r.party : '') + (r.holding ? '@' + r.holding : ''); };
eq([['SALARY AUGUST ACME CO', 30000], ['POS CARREFOUR MAADI', -1200], ['NETFLIX.COM', -250], ['REFUND CARREFOUR MAADI', 200], ['CREDIT CARD PAYMENT', -5000], ['TRANSFER FROM AHMED MOHAMED', 100000], ['CERTIFICATE INTEREST 63000', 1000], ['SOMETHING ODD', -10], ['راتب شهر اغسطس', 30000], ['صيدلية العزبي', -150]].map(cls),
  ['salary', 'groceries', 'subs', 'refund', 'ccpay', 'held:ahmed', 'interest@cd', 'other_exp', 'salary', 'health'], 'categories from the wording');
yes(F.classify({ desc: 'SOMETHING ODD', amount: -10 }).review, 'an unknown line is flagged for review');
const learned = F.learnRule([], { desc: 'POS ZED CLUB 991', amount: -900 }, 'fitness');
eq(F.classify({ desc: 'ZED CLUB 3321', amount: -900 }, { rules: learned }).cat, 'fitness', 'a correction is applied to the same payee next time');
eq(F.classify({ desc: 'ZED CLUB 3321', amount: 900 }, { rules: learned }).cat, 'other_inc', '…only in the same direction');

// both sides of movements between my own accounts
const accounts = [{ id: 'A', name: 'Bank A', kind: 'current', currency: 'EGP' }, { id: 'B', name: 'Bank B', kind: 'current', currency: 'EGP' }, { id: 'K', name: 'Card', kind: 'credit_card', currency: 'EGP' }];
const pool = [
  { id: 'a1', acct: 'A', date: '2026-08-15', amount: -10000, desc: 'TRANSFER TO OWN ACCOUNT' }, { id: 'b1', acct: 'B', date: '2026-08-16', amount: 10000, desc: 'INCOMING TRANSFER' },
  { id: 'a2', acct: 'A', date: '2026-08-20', amount: -5000, desc: 'CREDIT CARD PAYMENT' }, { id: 'k1', acct: 'K', date: '2026-08-21', amount: 5000, desc: 'PAYMENT RECEIVED THANK YOU' },
  { id: 'a3', acct: 'A', date: '2026-08-01', amount: 30000, desc: 'SALARY' }, { id: 'b2', acct: 'B', date: '2026-08-01', amount: -30000, desc: 'RENT LANDLORD' },
];
eq(F.pairMoves(pool, accounts), [{ a: 'a1', b: 'b1', code: 'transfer' }, { a: 'a2', b: 'k1', code: 'ccpay' }], 'transfer and card payment paired; salary and rent of the same amount are not');

// card purchase 5,000 then paid from the bank: one expense of 5,000
const cats = F.DEFAULT_CATS;
const tx6 = [
  { id: 'k0', acct: 'K', date: '2026-08-03', amount: -5000, desc: 'AMAZON', cat: 'shopping' },
  { id: 'a2', acct: 'A', date: '2026-08-20', amount: -5000, desc: 'CREDIT CARD PAYMENT', cat: 'ccpay' }, { id: 'k1', acct: 'K', date: '2026-08-21', amount: 5000, desc: 'PAYMENT RECEIVED', cat: 'ccpay' },
  { id: 'a1', acct: 'A', date: '2026-08-15', amount: -10000, desc: 'TRANSFER TO OWN', cat: 'transfer' }, { id: 'b1', acct: 'B', date: '2026-08-16', amount: 10000, desc: 'TRANSFER IN', cat: 'transfer' },
  { id: 'a3', acct: 'A', date: '2026-08-01', amount: 30000, desc: 'SALARY', cat: 'salary' },
  { id: 'a4', acct: 'A', date: '2026-08-03', amount: -1200, desc: 'CARREFOUR', cat: 'groceries' }, { id: 'a5', acct: 'A', date: '2026-08-05', amount: 200, desc: 'REFUND CARREFOUR', cat: 'refund', rcat: 'groceries' },
  { id: 'a6', acct: 'A', date: '2026-08-25', amount: 100000, desc: 'FROM AHMED', cat: 'held', party: 'ahmed' }, { id: 'a7', acct: 'A', date: '2026-08-28', amount: -60000, desc: 'ATM', cat: 'held', party: 'ahmed' },
  { id: 'a8', acct: 'A', date: '2026-08-29', amount: 250000, desc: 'OFFICE 2 SALE 3M2', cat: 'prop_sale' },
  { id: 'a9', acct: 'A', date: '2026-08-30', amount: -20000, desc: 'DEVELOPER INSTALLMENT', cat: 'prop_inst' },
];
const an6 = F.analyze(tx6, { cats, accounts, base: 'EGP' });
eq([an6.totals.inc, an6.totals.exp, an6.totals.net], [30000, 26000, 4000], 'income 30,000; expenses 5,000 card + 1,200 − 200 refund + 20,000 installment = 26,000');
eq([an6.totals.expLiving, an6.totals.expProperty, an6.totals.capital, an6.totals.third], [6000, 20000, 250000, 40000], 'living vs property, sale proceeds and Ahmed’s money kept apart');
eq(an6.cats.groceries.total, 1000, 'the refund reduces groceries');
eq(an6.cats.refund, undefined, 'a refund is not income');
// a card payment with no card statement for that month is the only record of that spending
const an6b = F.analyze(tx6.filter(t => t.acct !== 'K'), { cats, accounts, base: 'EGP' });
eq(an6b.cats.cc_unitem && an6b.cats.cc_unitem.total, 5000, 'card bill counted once when its purchases were not imported');

/* 7. category metrics from the oldest date, zero months and gaps */
const tx7 = [
  { id: 1, acct: 'A', date: '2026-01-10', amount: -300, cat: 'dining' }, { id: 2, acct: 'A', date: '2026-01-20', amount: -100, cat: 'dining' },
  { id: 3, acct: 'A', date: '2026-02-05', amount: 5000, cat: 'salary' },                          // February: covered, dining 0
  { id: 4, acct: 'A', date: '2026-04-12', amount: -600, cat: 'dining' }, { id: 5, acct: 'A', date: '2026-04-12', amount: -1000, cat: 'groceries' },
];
const batches7 = [{ id: 'x', acct: 'A', from: '2026-01-01', to: '2026-02-28' }, { id: 'y', acct: 'A', from: '2026-04-01', to: '2026-04-30' }];   // March missing
const an7 = F.analyze(tx7, { cats, accounts, base: 'EGP', batches: batches7 });
const d7 = an7.cats.dining;
eq([an7.from, an7.to, an7.totals.months, an7.totals.days], ['2026-01-10', '2026-04-12', 4, 93], 'period = oldest to latest transaction: 4 calendar months, 93 days');
eq([d7.total, d7.monthly, d7.daily, d7.count, d7.avgTx], [1000, 250, 10.75, 3, 333.33], 'total 1,000; monthly 1,000 ÷ 4; daily 1,000 ÷ 93; 3 transactions; 333.33 each');
eq([d7.peak, d7.low], [{ m: '2026-04', v: 600 }, { m: '2026-02', v: 0 }], 'peak April 600; minimum is the genuine zero of February');
eq(d7.series.find(s => s.m === '2026-03').v, null, 'March has no statement: shown as missing, not zero');
eq(an7.totals.gaps, ['2026-03'], 'the gap is listed');
near(d7.share, 50, 'dining share 1,000 ÷ 2,000 expenses');
eq(d7.annual, 3000, 'annualised 250 × 12');
eq(d7.change, null, 'no earlier period: no change shown');
const an7b = F.analyze(tx7, { cats, accounts, base: 'EGP', batches: batches7, from: '2026-04-01', to: '2026-04-30' });
eq([an7b.cats.dining.total, an7b.cats.dining.prev, an7b.cats.dining.change], [600, null, null], 'April vs March: March has no statement, so no comparison');
const an7c = F.analyze(tx7, { cats, accounts, base: 'EGP', batches: batches7, from: '2026-01-20', to: '2026-02-18' });
eq([an7c.cats.dining.total, an7c.cats.dining.prev, an7c.cats.dining.change], [100, 300, -66.67], '30 days vs the 30 before: 100 vs 300 = −66.67%');
/* 8. filters change every number together */
const an8 = F.analyze(tx7, { cats, accounts, base: 'EGP', batches: batches7, catIds: ['groceries'] });
eq([an8.totals.exp, Object.keys(an8.cats)], [1000, ['groceries']], 'category filter');

/* 14. currencies are never added together without a rate */
const tx14 = [{ id: 1, acct: 'A', date: '2026-05-01', amount: -100, cat: 'dining' }, { id: 2, acct: 'U', date: '2026-05-02', amount: -10, cat: 'dining' }, { id: 3, acct: 'A', date: '2026-05-03', amount: null, cat: 'dining' }];
const acc14 = [{ id: 'A', currency: 'EGP', kind: 'current' }, { id: 'U', currency: 'USD', kind: 'current' }];
const an14 = F.analyze(tx14, { cats, accounts: acc14, base: 'EGP' });
eq([an14.totals.exp, an14.noRate, an14.incomplete], [100, [{ cur: 'USD', n: 1, sum: -10 }], [3]], 'USD left out and counted; the incomplete row too');
eq(F.analyze(tx14, { cats, accounts: acc14, base: 'EGP', rates: { USD: 50 } }).totals.exp, 600, 'with a rate of 50: 100 + 500');

/* 10. budgets from my own months */
const hist = []; ['2026-03', '2026-04', '2026-05', '2026-06'].forEach((m, i) => { hist.push({ id: 'd' + i, acct: 'A', date: m + '-10', amount: -[400, 800, 600, 1000][i], cat: 'dining' }); hist.push({ id: 'g' + i, acct: 'A', date: m + '-11', amount: -2000, cat: 'groceries' }); });
hist.push({ id: 'now', acct: 'A', date: '2026-07-05', amount: -450, cat: 'dining' });
const an10 = F.analyze(hist, { cats, accounts, base: 'EGP' });
const bp = F.budgetPlan(an10, { cats, today: '2026-07-15', strategy: 'balanced', budgets: { dining: 600 } });
const din = bp.rows.find(r => r.id === 'dining');
// dining months 400, 800, 600, 1000 → sorted 400 600 800 1000: median 700, 25th percentile 550
eq([din.avg, din.median, din.p25, din.recommended], [700, 700, 550, 550], 'balanced: discretionary at its own 25th percentile');
eq([din.budget, din.spent, din.remaining, din.util], [600, 450, 150, 75], 'budget 600, spent 450: 150 left, 75% used');
eq([din.saveMonthly, din.saveAnnual], [150, 1800], 'potential saving 700 − 550 = 150 a month, 1,800 a year');
eq(F.budgetPlan(an10, { cats, today: '2026-07-15', strategy: 'aggressive' }).rows.find(r => r.id === 'dining').recommended, 460, 'aggressive: 10th percentile = 400 + 0.3 × 200');
eq(F.budgetPlan(an10, { cats, today: '2026-07-15', strategy: 'conservative' }).rows.find(r => r.id === 'groceries').recommended, 2000, 'essentials never cut');

/* 11–12. income growth: effective dates, partial months, one-off vs recurring, scenarios */
const sim = { base: 30000, horizon: 6, expenses: 20000, saveShare: 50, changes: [
  { id: 'r1', label: 'Raise', mode: 'pct', value: 10, date: '2026-12-15', recurring: true, freq: 'monthly', status: 'confirmed' },
  { id: 'b1', label: 'Bonus', mode: 'amt', value: 10000, date: '2027-01-20', recurring: false, deduct: 10, status: 'confirmed' },
  { id: 'p1', label: 'Promotion', mode: 'pct', value: 5, date: '2027-03-01', recurring: true, freq: 'monthly', status: 'probable' } ] };
const s11 = F.simulate(sim, { today: '2026-11-10' });
const ex = s11.scenarios.expected.rows;
eq(ex.map(r => r.m), ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04'], '6 months from now');
// December: 3,000 × 17/31 days = 1,645.16; January: 3,000 + bonus 9,000; March: 3,000 + 5% of 33,000 = 4,650
eq(ex.map(r => r.recurInc), [0, 1645.16, 3000, 3000, 4650, 4650], 'raise prorated in its first month; the promotion compounds on the raised pay');
eq(ex.map(r => r.once), [0, 0, 9000, 0, 0, 0], 'bonus once, after 10% deductions');
eq([s11.scenarios.expected.current, s11.scenarios.expected.projected, s11.scenarios.expected.monthlyIncrease, s11.scenarios.expected.annualIncrease], [30000, 34650, 4650, 55800], 'projected 34,650; +4,650 a month; 55,800 a year');
near(s11.scenarios.expected.cumIncr, 1645.16 + 3000 + 9000 + 3000 + 4650 + 4650, 'cumulative extra income');
// conservative: the probable promotion counts 50% and two months late (May, outside the horizon)
eq(s11.scenarios.conservative.rows.map(r => r.recurInc), [0, 1645.16, 3000, 3000, 3000, 3000], 'conservative leaves out the delayed promotion');
eq(s11.scenarios.expected.rows[4].recurInc > s11.scenarios.conservative.rows[4].recurInc, true, 'expected above conservative');
eq(s11.none.cumIncr, 0, 'without any increase: nothing extra');
eq(s11.without.b1.cumIncr, s11.scenarios.expected.cumIncr - 9000, 'without the bonus: 9,000 less');
near(s11.scenarios.expected.addSavings, (1645.16 + 12000 + 3000 + 4650 + 4650) * 0.5, 'half of the extra income is saved');
/* 13. allocation must total 100 */
eq(F.allocate([{ name: 'Savings', pct: 50 }, { name: 'Goals', pct: 30 }, { name: 'Lifestyle', pct: 20 }], 4650).rows.map(r => r.monthly), [2325, 1395, 930], '50/30/20 of 4,650');
eq(F.allocate([{ name: 'Savings', pct: 50 }, { name: 'Goals', pct: 30 }, { name: 'Lifestyle', pct: 10 }], 4650).ok, false, 'shares adding to 90% are refused');
const goals = F.goalPlan([{ id: 'g', name: 'Emergency fund', target: 60000, saved: 10000, date: '2027-06-30' }], 5000, '2026-11-10');
eq([goals[0].months, goals[0].eta, goals[0].ok], [10, '2027-09', false], '50,000 at 5,000 a month: 10 months, after the target date');
eq([goals[0].monthsLeft, goals[0].required, goals[0].extra], [7, 7142.86, 2142.86], '7 months left: 7,142.86 a month needed, 2,142.86 more');
eq(F.goalPlan([{ id: 'g', target: 60000, saved: 10000, date: '2027-06-30' }], 7500, '2026-11-10')[0].ok, true, 'with 7,500 a month it is reached in time');

/* reconciliation */
const rec = F.reconcile({ id: 'A', opening: 20000, openingDate: '2026-08-01' }, ledger.filter(t => t.date), [{ id: 'b1', acct: 'A', from: '2026-08-01', to: '2026-09-05', opening: 20000, closing: 104590, diff: 0 }]);
eq([rec.confirmed.balance, rec.computed, rec.diff, rec.status], [104590, 104590, 0, 'reconciled'], 'calculated balance agrees with the statement');

/* third-party money and net worth */
const tp = F.thirdParty(tx6, ctx.parties);
eq([tp[0].in, tp[0].out, tp[0].held, tp[0].links.length], [100000, 60000, 40000, 1], 'Ahmed: 100,000 in, 60,000 out, 40,000 still held');
const pos = F.position({ base: 'EGP', accounts: [{ id: 'A', name: 'Bank A', kind: 'current', currency: 'EGP' }, { id: 'K', name: 'Card', kind: 'credit_card', currency: 'EGP' }],
  recon: { A: { confirmed: { balance: 150000, date: '2026-08-31' } }, K: { confirmed: { balance: -5300, date: '2026-08-31' } } }, thirdParty: tp, parties: [{ id: 'brother', name: 'My brother' }],
  holdings: [{ id: 'cd', kind: 'cd', name: 'Certificate', owner: 'me', principal: 63000 }, { id: 'mom', kind: 'deposit', name: 'Deposit in my mother’s account', owner: 'me', custodian: 'my mother', principal: 1380000 },
    { id: 'box', kind: 'managed', name: 'Brother’s investment box', owner: 'brother', principal: 187000 }, { id: 'o1', kind: 'property', name: 'Office 1', owner: 'me', valuation: 2000000, includeValue: false }] });
// 150,000 bank − 40,000 of Ahmed's + 63,000 + 1,380,000 − 5,300 card = 1,547,700; the box and the office value stay out
eq(pos.net, 1547700, 'net worth: own money only, principal counted once, card owed deducted');
eq(pos.third.map(x => x.id), ['ahmed', 'box'], 'other people’s money shown apart');
yes(pos.assets.find(a => a.id === 'mom').note.includes('mother'), 'custody shown');
eq(F.position({ base: 'EGP', accounts: [{ id: 'U', name: 'USD acct', kind: 'current', currency: 'USD' }], recon: { U: { confirmed: { balance: 100, date: '2026-08-31' } } } }).net, null, 'no USD rate: no total');

/* offices */
const o1 = F.propertyShare({ area: 79, share: 50, rentRate: 19 }), o2 = F.propertyShare({ area: 79, share: 9.5, soldArea: 3, rentRate: 19 });
eq([o1.myArea, o1.grossMonthly, o1.grossAnnual], [39.5, 750.5, 9006], 'office 1: 39.5 m² × 19 = 750.50 a month');
eq([o2.origArea, o2.myArea, o2.effPct, o2.grossMonthly, o2.grossAnnual], [7.505, 4.505, 5.7025, 85.595, 1027.14], 'office 2 after selling 3 m²');
eq(Math.round((o1.grossMonthly + o2.grossMonthly) * 100) / 100, 836.1, 'combined about USD 836.10 a month');
eq(F.propertyShare({ area: 79, share: 50, rentRate: 19, occupancy: 90, mgmtPct: 10, costs: 50 }).netMonthly, 557.905, 'net: 750.50 × 90% × 90% − 50');
const rf = F.rentForecast([{ area: 79, share: 50, rentRate: 19, handover: '2027-03-15' }], { today: '2027-01-10', horizon: 5 });
eq(rf.map(r => [r.m, r.gross]), [['2027-02', 0], ['2027-03', 0], ['2027-04', 750.5], ['2027-05', 750.5], ['2027-06', 750.5]], 'rent only after the March 2027 handover');
eq(F.rentForecast([{ area: 79, share: 50, rentRate: 19, handover: '2027-03-15' }], { today: '2027-01-10', horizon: 5, scenario: { delay: 2 } }).map(r => r.gross), [0, 0, 0, 0, 750.5], 'handover delayed two months');


/* repeating payments, the verified salary, this month, the forecast, unusual spending */
const tr = [];
['2026-03', '2026-04', '2026-05', '2026-06'].forEach((m, i) => {
  tr.push({ id: 's' + i, acct: 'A', date: m + '-01', amount: 30000, desc: 'SALARY ACME', cat: 'salary' });
  tr.push({ id: 'n' + i, acct: 'A', date: m + '-10', amount: -250, desc: 'NETFLIX.COM 88' + i, cat: 'subs' });
  tr.push({ id: 'r' + i, acct: 'A', date: m + '-03', amount: -8000, desc: 'RENT LANDLORD', cat: 'housing' });
  for (let k = 0; k < 3; k++) tr.push({ id: `g${i}${k}`, acct: 'A', date: `${m}-1${k + 2}`, amount: -(500 + k * 10), desc: 'CARREFOUR', cat: 'groceries' });
});
tr.push({ id: 'big', acct: 'A', date: '2026-07-04', amount: -9000, desc: 'CARREFOUR', cat: 'groceries' });
tr.push({ id: 'sal7', acct: 'A', date: '2026-07-01', amount: 30000, desc: 'SALARY ACME', cat: 'salary' });
const anT = F.analyze(tr, { cats, accounts, base: 'EGP' });
const recs = F.recurring(anT.entries);
const nf = recs.find(r => r.cat === 'subs');
eq([nf.freq, nf.amount, nf.fixed, nf.annual, nf.next], ['monthly', 250, true, 3000, '2026-07-11'], 'Netflix: 250 a month, 3,000 a year, next about 11 July');
const ib = F.incomeBase(anT, '2026-07-15');
eq([ib.verified, ib.salary, ib.salaryMonths], [true, 30000, 4], 'salary verified: it came in each of the last 4 months');
eq(F.incomeBase(F.analyze(tr.filter(t => !['s1', 's2'].includes(t.id)), { cats, accounts, base: 'EGP' }), '2026-07-15').verified, false, 'two months of salary is not enough to call it recurring');
const plan = F.budgetPlan(anT, { cats, today: '2026-07-15', budgets: { groceries: 2000, subs: 250 } });
const mc = F.monthControl(anT, plan, { today: '2026-07-15', expectedIncome: 30000, saveTarget: 5000 });
eq([mc.inc, mc.exp, mc.over.map(o => o.id)], [30000, 9000, ['groceries']], 'July: salary in, 9,000 spent, groceries over budget');
eq(mc.upcoming.map(u => [u.name, u.date, u.late]), [['Rent Landlord', '2026-07-04', true], ['Netflix.com', '2026-07-11', true]], 'rent and Netflix expected this month and not seen yet');
eq(F.unusual(anT.entries).map(u => u.id), ['big'], 'the 9,000 grocery bill stands out from about 510 a visit');
const fc = F.forecast(anT, { cats, today: '2026-07-15', horizon: 3, income: 30000, balance: 20000 });
// medians of the last 4 complete months: rent 8,000 + groceries 1,530 + Netflix 250 = 9,780
eq([fc.expBase, fc.rows.map(r => r.net), fc.rows.map(r => r.balance)], [9780, [20220, 20220, 20220], [40220, 60440, 80660]], 'forecast: 30,000 − 9,780 a month on top of 20,000');
eq(F.forecast(anT, { cats, today: '2026-07-15', horizon: 2, income: 30000 }).rows[0].balance, null, 'no opening balance: no month-end balance shown');
const sens = F.sensitivity(sim, { today: '2026-11-10' });
eq([sens.raise.length, sens.delay.length, sens.save.map(x => x.share)], [5, 4, [25, 50, 75, 100]], 'sensitivity tables');
yes(sens.delay[0].cumIncr > sens.delay[3].cumIncr, 'a later raise adds less');

eq(F.refundOf({ id: 'x', desc: 'REFUND CARREFOUR MAADI', date: '2026-09-05', amount: 200 }, [{ id: 'g', desc: 'POS CARREFOUR MAADI 4455', date: '2026-09-03', amount: -1500, cat: 'groceries' }, { id: 'n', desc: 'NETFLIX', date: '2026-09-04', amount: -250, cat: 'subs' }]), 'groceries', 'a refund reverses the earlier purchase from the same shop');
eq([F.detectBank('Commercial International Bank — Account statement'), F.detectBank('البنك الأهلي المصري كشف حساب'), F.detectBank('Bank of Test — Statement of account'), F.detectBank('QNB Alahli card statement'), F.detectBank('Statement of account')], ['CIB', 'NBE', 'Bank of Test', 'QNB', ''], 'the bank from the heading');
eq([F.looksLikeCard('Card statement Card number: 4111'), F.looksLikeCard('Statement of account')], [true, false], 'a card statement recognised');

/* a card statement read by column position (layout like a real one; figures invented) */
const it = (x, s, w) => ({ x, w: w || s.length * 5, s });
const layout = [[
  { y: 700, items: [it(31, 'Card Number'), it(173, '512345******1111')] },
  { y: 680, items: [it(31, 'Opening Balance'), it(173, '1000.00'), it(300, 'Closing Balance'), it(442, '2380.00')] },
  { y: 660, items: [it(31, 'Total of Credit'), it(173, '9999.99'), it(300, 'Total of Debit'), it(442, '8888.88')] },
  { y: 640, items: [it(31, 'Due Date'), it(173, '27 October 2026'), it(300, 'Credit Limit'), it(442, '50400')] },
  { y: 620, items: [it(31, 'Minimum Payment Due'), it(173, '300'), it(300, 'Statement Date'), it(442, '30 September 2026')] },
  { y: 540, items: [it(32, 'Transaction Date', 57), it(109, 'Posting Date', 42), it(185, 'Description', 38), it(341, 'Debit', 18), it(392, 'Credit', 20), it(443, 'Original', 26), it(486, 'Posting', 25), it(528, 'Auth Code', 35)] },
  { y: 530, items: [it(443, 'Currency', 30), it(486, 'Amount', 27)] },
  { y: 515, items: [it(31, '30 September 2026', 66), it(108, '30 September 2026', 66), it(184, 'SHOP ONE EGY', 70), it(272, '06 OF 12', 29), it(340, '1000.00', 26), it(442, 'EGP', 13), it(485, '1000', 20)] },
  { y: 500, items: [it(31, '28 September 2026', 66), it(108, '28 September 2026', 66), it(184, 'EB-00CC1-CARD', 90), it(391, '1500.00', 26), it(442, 'EGP', 13), it(485, '1500', 20)] },
  { y: 490, items: [it(184, 'PAYMENT:0001', 60)] },
  { y: 475, items: [it(31, '02 September 2026', 66), it(108, '02 September 2026', 66), it(184, 'SOFTWARE SUB SAN', 90), it(340, '20.00', 20), it(442, 'USD', 13), it(485, '1000.00', 26), it(527, '488098', 24)] },
  { y: 460, items: [it(31, '01 September 2026', 66), it(108, '02 September 2026', 66), it(184, 'CAFE', 30), it(340, '880.00', 24), it(442, 'EGP', 13), it(485, '880', 15), it(527, '123456', 24)] },
  { y: 40, items: [it(31, 'Page No. 1', 40)] },
]];
const L = F.rowsFromLayout(layout, { card: true });
eq(L.rows.map(r => [r.date, r.amount]), [['2026-09-30', -1000], ['2026-09-28', 1500], ['2026-09-02', -1000], ['2026-09-01', -880]], 'debit and credit by column; a foreign purchase charged at its posting amount');
eq([L.rows[1].desc, L.rows[0].inst, L.rows[2].orig], ['EB-00CC1-CARD PAYMENT:0001', { n: 6, of: 12 }, { amount: 20, cur: 'USD' }], 'wrapped description joined; instalment 6 of 12; original currency kept');
eq([L.meta.opening, L.meta.closing, L.meta.limit, L.meta.minDue, L.meta.dueDate, L.meta.statementDate, F.last4(L.meta.account)], [-1000, -2380, 50400, 300, '2026-10-27', '2026-09-30', '1111'], 'labelled facts: owed balances negative, limit, minimum, due date');
eq(F.statementCheck(L.rows, L.meta).diff, 0, 'opening + lines = closing');

/* financing quotes */
eq(F.financeQuote(12000, { method: 'flat', rate: 2, feePct: 1 }, 12), { price: 12000, months: 12, monthly: 1240, interest: 2880, fees: 120, total: 15000, cost: 3000, method: 'flat', rate: 2 }, 'flat 2% a month for 12 months: 2,880 interest, 1,240 a month');
near(F.financeQuote(12000, { method: 'reducing', rate: 24 }, 12).monthly, 1134.72, 'reducing 24% a year: 1,134.72 a month');
eq(F.financeQuote(6000, { method: 'none' }, 6).monthly, 1000, '0% instalments');

/* instalments from the statements */
const itx = [['2026-07-30', 4], ['2026-08-30', 5], ['2026-09-30', 6]].map(([d, n], i) => ({ id: 'i' + i, acct: 'K', date: d, amount: -2500, desc: `Shop One Cairo EGY ${String(n).padStart(2, '0')} OF 12`, cat: 'shopping' }));
const ins = F.detectInstallments(itx, '2026-10-30');
eq(ins.map(i => [i.name, i.amount, i.n, i.of, i.remaining, i.end, i.status, i.outstanding]), [['Shop One Cairo EGY', 2500, 6, 12, 6, '2027-03', 'active', 15000]], 'Shop One 6 of 12: 6 left, ends March 2027, 19,978.98 still to pay');
eq(F.detectInstallments(itx, '2027-01-15')[0].status, 'missing', 'not seen for months: missing, not finished');
eq(F.detectInstallments(itx, '2027-01-15', [{ key: ins[0].key, status: 'completed' }])[0].status, 'completed', 'finished only when you say so');
eq(F.installmentLoad(ins, '2027-03'), 2500, 'still paid in March 2027');
eq(F.installmentLoad(ins, '2027-04'), 0, 'not after its end');

/* inputs with the dates they apply from */
let inp = F.setInput([], { id: 'a', key: 'salary', label: 'Salary', amount: 30000, from: '2026-01-01' }, '2026-01-01');
inp = F.setInput(inp, { id: 'b', key: 'salary', amount: 36000, from: '2026-11-01' }, '2026-10-30');
eq([F.activeInput(inp, 'salary', '2026-10-15').amount, F.activeInput(inp, 'salary', '2026-11-02').amount, inp.length, inp[0].to], [30000, 36000, 2, '2026-10-31'], 'a new salary replaces the old from its date; the old one stays as history');

/* a balance against the last one */
const bc = F.balanceChange({ balance: 25000, date: '2026-10-28' }, { balance: 21000, date: '2026-10-30' }, [{ id: 'x', date: '2026-10-29', amount: -1000 }]);
eq([bc.diff, bc.recorded, bc.unexplained], [-4000, -1000, -3000], '4,000 less: 1,000 is recorded, 3,000 is unexplained (asked, not assumed)');

/* buying: cash, card, Halan or save */
const pp = F.planPurchases([{ id: 'tv', name: 'TV', price: 20000, priority: 1 }, { id: 'ph', name: 'Phone', price: 30000, priority: 2, wantBy: '2027-01-31' }, { id: 'lp', name: 'Laptop', price: 40000, priority: 3 }],
  { cash: 25000, capacity: 10000, card: { available: 39000 }, halan: { available: 60000, terms: { method: 'flat', rate: 2, months: 12 } } }, '2026-10-30');
const byId = Object.fromEntries(pp.items.map(i => [i.id, i]));
eq([byId.tv.rec, byId.tv.fromCash, byId.ph.fromCash, byId.ph.need], ['cash', 20000, 5000, 25000], 'TV from cash now; 5,000 left goes to the phone');
eq([byId.ph.required, byId.ph.ready, byId.ph.late], [8333.34, '2027-01', false], 'phone needs 8,333.33 a month for 3 months: ready January');
eq([byId.lp.ready, pp.allBy], ['2027-05', '2027-05'], 'laptop after the phone, as savings move on to it');
eq(F.planPurchases([{ id: 'x', name: 'X', price: 10000 }], { cash: 3000, capacity: 8000, card: { available: 20000 } }, '2026-10-30').items[0].rec, 'card_full', 'card now, cleared at the due date from savings');
eq(F.planPurchases([{ id: 'x', name: 'X', price: 60000, wantBy: '2026-12-31' }], { cash: 0, capacity: 6000, halan: { available: 80000, terms: { method: 'flat', rate: 1, months: 12 } } }, '2026-10-30').items[0].rec, 'halan', 'too late by saving; Halan instalments fit');
const pf = F.planPurchases([{ id: 'a', name: 'A', price: 10000, priority: 1 }, { id: 'b', name: 'B', price: 10000, priority: 3, focus: true }], { cash: 10000, capacity: 1000 }, '2026-10-30', { focus: true });
eq(pf.items.map(i => [i.id, i.rec]), [['b', 'cash'], ['a', 'save']], 'focus mode: the focused item goes first');
eq(F.health({ income: 30000, spending: 24000, essential: 10000, cash: 40000, installments: 6000, cardOwed: 11000, cardLimit: 50400 }).items.map(x => [x.k, x.v, x.g]), [['liquidity', 4, 'fair'], ['dti', 20, 'good'], ['util', 21.83, 'good'], ['save', 20, 'good']], 'health indicators');

const both = F.planPurchases([{ id: 'l', name: 'Laptop', price: 40000, priority: 1 }, { id: 'p', name: 'Phone', price: 15000, priority: 2 }], { cash: 0, capacity: 45000, card: { available: 42440 } }, '2026-10-30');
eq(both.items.map(i => [i.id, i.rec]), [['l', 'card_full'], ['p', 'save']], 'together: the card covers the laptop; the phone no longer fits the limit left');
eq(both.items.find(i => i.id === 'p').ready, '2026-12', 'November: 40,000 repays the card, 5,000 towards the phone; ready in December');
/* coming up: events in the next days and the cash they leave */
eq([F.addMonthsDate('2026-01-31', 1), F.addMonthsDate('2026-11-15', 2)], ['2026-02-28', '2027-01-15'], 'same day next month; the 31st becomes the month end');
const up = F.upcoming({ today: '2026-11-01', days: 45, cash: 20000,
  recurring: [{ name: 'Salary', dir: 1, amount: 30000, freq: 'monthly', next: '2026-11-25' }, { name: 'Netflix', dir: -1, amount: 250, freq: 'monthly', next: '2026-11-10', onCard: true }, { name: 'Gym', dir: -1, amount: 1500, freq: 'monthly', next: '2026-11-03' }, { name: 'Odd', dir: -1, amount: 99, freq: 'weekly', next: '2026-11-02' }],
  installments: [{ name: 'Shop One', amount: 3000, last: '2026-10-30', end: '2027-03', status: 'active', onCard: true }, { name: 'Done', amount: 500, last: '2026-10-05', status: 'completed' }],
  card: { dueDate: '2026-11-27', amount: 7960, minDue: 400 }, dated: [{ date: '2026-11-20', label: 'Laptop affordable', kind: 'goal' }] });
eq(up.events.map(e => [e.date, e.kind, e.label, e.amount]), [['2026-11-03', 'bill', 'Gym', -1500], ['2026-11-10', 'bill', 'Netflix', -250], ['2026-11-20', 'goal', 'Laptop affordable', 0], ['2026-11-25', 'income', 'Salary', 30000], ['2026-11-27', 'card', 'Card bill', -7960], ['2026-11-30', 'instalment', 'Shop One', -3000], ['2026-12-03', 'bill', 'Gym', -1500], ['2026-12-10', 'bill', 'Netflix', -250]],
  'monthly bills and income on their dates, instalments after their last payment, the card bill on its due date; weekly and finished ones left out');
eq([up.low, up.last, up.cashIn, up.cashOut], [{ date: '2026-11-03', bal: 18500 }, 39040, 30000, 10960], 'card purchases reach cash only through the card bill; the lowest point and the end');
eq(F.upcoming({ today: '2026-11-01', incomes: [{ label: 'Salary', amount: 36000, day: 25 }] }).events.map(e => e.date), ['2026-11-25', '2026-12-25'], 'income you entered, on its day');
eq(F.upcoming({ today: '2026-11-01', incomes: [{ label: 'Salary', amount: 36000, day: 1, from: '2026-12' }] }).events.map(e => e.date), ['2026-12-01'], 'a salary already in this month is expected from next month');
eq(F.upcoming({ today: '2026-11-01', installments: [{ name: 'X', amount: 100, last: '2026-10-15', end: '2026-11', status: 'active' }] }).events.length, 1, 'an instalment stops after its last month');
/* 15. backups */
eq(F.validateBackup({ app: 'action-register-money', tx: [{ id: 'a', acct: 'A' }], prefs: {} }).ok, true, 'a backup is accepted');
eq(F.validateBackup({ tx: 'x' }).ok, false, 'a damaged file is refused');

console.log(`${n - bad}/${n} money checks passed`); if (bad) process.exit(1);
