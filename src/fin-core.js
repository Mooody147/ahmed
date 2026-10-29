/* Money engine: statement reading, classification and every calculation of the Money tab.
   Pure and deterministic — no clock, no network, no randomness: the caller passes "today" and the data, so the
   same inputs always give the same numbers, and the unit tests (test/unit/fin.test.js) check them by hand.
   Amounts are signed: + money in, − money out. Nothing here invents a value: a row it cannot read is returned
   with a flag, never dropped and never guessed. */
const FIN = (() => {
const EPS = 0.005;
const r2 = x => Math.round((x + (x >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
const sum = a => a.reduce((s, x) => s + x, 0);
const AR = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/٫/g, '.').replace(/٬/g, ',');
const norm = s => AR(s).toLowerCase().normalize('NFKD').replace(/[ً-ٰٟـ̀-ͯ]/g, '').replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[^\p{L}\p{N}&]+/gu, ' ').trim();
const CURRENCIES = ['EGP', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'JOD', 'TRY', 'CHF', 'CAD', 'AUD', 'JPY', 'CNY', 'INR'];

/* ---------- dates ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => { if (!ISO.test(s || '')) return false; const d = new Date(s + 'T00:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const dnum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
const fromDnum = n => new Date(Math.round(n) * 864e5).toISOString().slice(0, 10);
const addDays = (s, n) => fromDnum(dnum(s) + n);
const spanDays = (a, b) => dnum(b) - dnum(a) + 1;
const ym = s => s.slice(0, 7);
function addMonths(m, n) { let y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return `${y}-${String(mo + 1).padStart(2, '0')}`; }
function monthList(a, b) { const out = []; for (let m = a, i = 0; m <= b && i < 1200; m = addMonths(m, 1), i++) out.push(m); return out; }
const dim = m => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
const monthEnd = m => `${m}-${String(dim(m)).padStart(2, '0')}`;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  'يناير': 1, 'فبراير': 2, 'مارس': 3, 'ابريل': 4, 'أبريل': 4, 'إبريل': 4, 'مايو': 5, 'يونيو': 6, 'يونيه': 6, 'يوليو': 7, 'يوليه': 7, 'اغسطس': 8, 'أغسطس': 8, 'سبتمبر': 9, 'اكتوبر': 10, 'أكتوبر': 10, 'نوفمبر': 11, 'ديسمبر': 12 };
const mkISO = (y, m, d) => { if (y < 100) y += 2000; const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return validDate(s) ? s : null; };
// one date as banks write it. order: 'dmy' | 'mdy' (decided once per statement); year: used only when the
// statement itself gives it (its period) for dates printed without a year
function parseDate(v, order = 'dmy', year = null) {
  if (v instanceof Date && !isNaN(v)) return { iso: new Date(v.getTime() - v.getTimezoneOffset() * 6e4).toISOString().slice(0, 10) };
  if (typeof v === 'number') { if (v > 20000 && v < 80000) return { iso: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) }; return null; }
  const s = AR(v).trim(); if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s); if (m) { const iso = mkISO(+m[1], +m[2], +m[3]); return iso ? { iso } : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s);
  if (m) { const [a, b, y] = [+m[1], +m[2], +m[3]]; const [d, mo] = order === 'mdy' ? [b, a] : [a, b]; const iso = mkISO(y, mo, d); return iso ? { iso } : null; }
  m = /^(\d{1,2})[\s\-/.]+([A-Za-z؀-ۿ]{3,})\.?[\s\-/.,]*(\d{2,4})?\b/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) { const mo = MONTHS[m[2].toLowerCase()]; if (m[3]) { const iso = mkISO(+m[3], mo, +m[1]); return iso ? { iso } : null; } if (year) { const iso = mkISO(year, mo, +m[1]); return iso ? { iso, noYear: true } : null; } return { iso: null, noYear: true }; }
  m = /^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})\b/.exec(s);
  if (m && MONTHS[m[1].toLowerCase()]) { const iso = mkISO(+m[3], MONTHS[m[1].toLowerCase()], +m[2]); return iso ? { iso } : null; }
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) { const [a, b] = [+m[1], +m[2]]; const [d, mo] = order === 'mdy' ? [b, a] : [a, b]; if (year) { const iso = mkISO(year, mo, d); return iso ? { iso, noYear: true } : null; } return { iso: null, noYear: true }; }
  return null;
}
// dd/mm or mm/dd for a whole statement, from the values that can only be one of them
function dateOrder(vals) {
  let dmy = 0, mdy = 0;
  for (const v of vals) { const m = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.]\d{2,4})?\b/.exec(AR(v ?? '').trim()); if (!m) continue; if (+m[1] > 12) dmy++; if (+m[2] > 12) mdy++; }
  return mdy > dmy ? 'mdy' : 'dmy';
}

/* ---------- amounts ---------- */
// {n: signed number, mark: +1 credit / −1 debit / 0 when the text says neither}
function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? { n: v, mark: 0 } : null;
  const s = AR(v).trim(); if (!s || /^[-–—.]+$/.test(s)) return null;
  let mark = 0;
  if (/(^|[^a-z])cr\.?$|\bcredit\b|دائن/i.test(s)) mark = 1; else if (/(^|[^a-z])dr\.?$|\bdebit\b|مدين/i.test(s)) mark = -1;
  const neg = /^\(.*\)$/.test(s) || /^[-–−]\s*[\d(]|[\d)]\s*[-–−]$/.test(s.replace(/\s*(cr|dr)\.?$/i, '').replace(/[A-Z]{3}\s*/, ''));
  let t = s.replace(/[^\d.,]/g, ''); if (!/\d/.test(t)) return null;
  // the separator written last is the decimal one ("1.234,50" / "1,234.50"); a lone comma before 1–2 digits is
  // a decimal comma, before 3 digits a thousands comma
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc >= 0 && ld >= 0) t = lc > ld ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (lc >= 0) t = /,\d{1,2}$/.test(t) && (t.match(/,/g) || []).length === 1 ? t.replace(',', '.') : t.replace(/,/g, '');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = parseFloat(t); if (isNaN(n)) return null;
  return { n: neg ? -n : n, mark };
}
// amount tokens inside a statement line: always with two decimals, so references and card numbers are not taken
const AMT_RE = /(?<![\d.,\w])\(?[-–−]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d{2}\)?[-–−]?(?:\s?(?:CR|DR|Cr|Dr)\b)?|(?<![\d.,\w])\(?[-–−]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\)?[-–−]?(?:\s?(?:CR|DR|Cr|Dr)\b)?/g;

/* ---------- descriptions ---------- */
function cleanDesc(s) {
  let t = AR(s).replace(/\s+/g, ' ').trim();
  t = t.replace(/\b(pos|purchase|pur|trx|txn|card|debit card|credit card|visa|mastercard|mc|apple pay|google pay|contactless|e-?com|online)\b[:\s-]*/gi, ' ')
    .replace(/\b[x*]{2,}\d{2,6}\b|\b\d{4}[x*]{2,}\d{0,4}\b|\b\d{3,}\b/gi, ' ').replace(/\b\d{1,2}[/:.-]\d{1,2}([/:.-]\d{2,4})?\b/g, ' ')
    .replace(/\b(ref|auth|rrn|seq)\s*[:#]?\s*\w+/gi, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–:|,.]+|[\s\-–:|,.]+$/g, '');
  if (!t) return AR(s).trim();
  return t.length > 3 && t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : t;
}
// the payee part of a description, for learning and for matching repeats ("NETFLIX.COM 8842" → "netflix com")
const payeeKey = s => norm(cleanDesc(s)).split(' ').filter(w => w && !/\d/.test(w) && w.length > 1).slice(0, 4).join(' ');

/* ---------- categories ---------- */
// kind: income | expense | move | third (someone else's money passing through my accounts) | capital (selling an
// asset: shown apart, never as recurring income). code: refund (money back for a purchase) or the movement type. prio is a
// starting point the user changes; it decides only what budgets protect first, never a percentage of income.
const DEFAULT_CATS = [
  ['housing', 'Housing & rent', 'expense', 'essential'], ['groceries', 'Groceries & food', 'expense', 'essential'], ['dining', 'Restaurants & coffee', 'expense', 'discretionary'],
  ['transport', 'Transportation & fuel', 'expense', 'essential'], ['utilities', 'Utilities & telecom', 'expense', 'essential'], ['shopping', 'Shopping & personal', 'expense', 'discretionary'],
  ['health', 'Healthcare & medication', 'expense', 'essential'], ['fitness', 'Gym & fitness', 'expense', 'optional'], ['education', 'Education & courses', 'expense', 'important'],
  ['subs', 'Subscriptions & digital', 'expense', 'optional'], ['debt', 'Installments, loans & debt', 'expense', 'essential'], ['fees', 'Bank fees & charges', 'expense', 'important'],
  ['travel', 'Travel & entertainment', 'expense', 'discretionary'], ['other_exp', 'Other expenses', 'expense', 'discretionary'], ['cc_unitem', 'Card bill (purchases not imported)', 'expense', 'important'],
  ['salary', 'Salary', 'income'], ['bonus', 'Bonuses & incentives', 'income'], ['freelance', 'Freelance & extra work', 'income'], ['business', 'Business income', 'income'],
  ['interest', 'Interest & investment returns', 'income'], ['refund', 'Refunds & reversals', 'income', '', 'refund'], ['other_inc', 'Other income', 'income'],
  ['transfer', 'Transfers between my accounts', 'move', '', 'transfer'], ['savings', 'Savings transfers', 'move', '', 'savings'], ['invest', 'Investments in & out', 'move', '', 'invest'],
  ['ccpay', 'Credit-card payments', 'move', '', 'ccpay'], ['principal', 'Debt principal repayments', 'move', '', 'principal'],
  ['prop_inst', 'Property installments', 'expense', 'essential', 'property'], ['prop_fin', 'Property financing charges & fees', 'expense', 'essential', 'property'],
  ['rent_in', 'Rental income', 'income'], ['prop_sale', 'Property sale proceeds', 'capital', '', 'sale'], ['held', 'Money held for someone else', 'third', '', 'held'],
].map(([id, name, kind, prio, code]) => ({ id, name, kind, prio: prio || '', code: code || '', group: code === 'property' ? 'property' : '', subs: id === 'debt' ? ['Installment', 'Interest', 'Late fee'] : id === 'utilities' ? ['Electricity', 'Water', 'Gas', 'Mobile', 'Internet'] : [] }));
const catMap = cats => Object.fromEntries((cats || DEFAULT_CATS).map(c => [c.id, c]));

// words banks print, in English and Arabic. Each is a starting guess (confidence 0.7) shown for review
const BUILTIN = [
  ['salary', 1, /salary|payroll|\bsal\b|wages|راتب|مرتب|رواتب|اجور|أجور/],
  ['bonus', 1, /bonus|incentive|حافز|حوافز|مكافا|مكافأ/],
  ['refund', 1, /refund|reversal|revers|chargeback|cash ?back|استرداد|مرتجع|الغاء عمليه|إلغاء/],
  ['interest', 1, /interest|profit paid|credit interest|عائد|فوائد|فائده|ارباح/],
  ['ccpay', 0, /credit ?card (bill |payment)|card payment|cc payment|payment.{0,12}thank you|payment received|سداد (بطاقه|البطاقه|الفيزا|كارت)|سداد مديونيه البطاقه/],
  ['transfer', 0, /own account|between (my )?accounts|internal transfer|self transfer|تحويل (بين|الي) حساباتي|تحويل داخلي/],
  ['savings', 0, /savings|certificate|time deposit|شهاده|شهادات|ادخار|وديعه/],
  ['invest', 0, /invest|brokerage|securities|mutual fund|صندوق استثمار|استثمار|بورصه/],
  ['principal', -1, /principal|loan repayment|سداد اصل/],
  ['debt', -1, /install?ment|\bemi\b|loan|valu\b|souhoola|sympl|aman\b|forsa|قسط|اقساط|تقسيط|قرض/],
  ['fees', -1, /\bfees?\b|charges?|commission|stamp duty|annual fee|عموله|رسوم|مصاريف|ضريبه دمغه|دمغه/],
  ['groceries', -1, /carrefour|spinneys|hyper|kazyon|oscar|seoudi|gourmet|metro market|grocery|supermarket|market|panda|lulu|breadfast|rabbit|بقاله|سوبر ?ماركت|خضار|هايبر/],
  ['dining', -1, /talabat|elmenus|mcdonald|kfc|starbucks|cafe|coffee|costa|cilantro|restaurant|pizza|burger|hardee|domino|مطعم|كافيه|قهوه/],
  ['transport', -1, /uber|careem|didi|indrive|swvl|fuel|petrol|benzin|gas station|wataniya|chillout|total ?energies|mobil\b|emarat|parking|toll|metro|بنزين|وقود|موقف|كارته/],
  ['utilities', -1, /vodafone|orange|etisalat|\be&|\bwe\b|telecom|internet|fiber|electric|water|natural gas|كهرباء|مياه|غاز|انترنت|تليفون/],
  ['health', -1, /pharma|pharmacy|hospital|clinic|doctor|\blabs?\b|dental|ezaby|seif|صيدلي|مستشفي|عياده|معمل|تحاليل/],
  ['fitness', -1, /\bgym\b|fitness|gold'?s|crossfit|نادي|جيم/],
  ['education', -1, /school|university|course|udemy|coursera|tuition|academy|training|مدرسه|جامعه|كورس|دوره/],
  ['subs', -1, /netflix|spotify|shahid|osn|anghami|youtube|apple\.com|itunes|icloud|google (one|storage|play)|microsoft|adobe|openai|anthropic|claude\.ai|watch ?it|subscription|اشتراك/],
  ['shopping', -1, /amazon|noon|jumia|shein|ikea|\bmall\b|zara|lc waikiki|defacto|b\.?tech|raya|store|shop|متجر|محل/],
  ['travel', -1, /airline|egyptair|hotel|booking\.com|airbnb|flydubai|expedia|travel|cinema|vox|playstation|steam|ticket|طيران|فندق|سينما/],
  ['housing', -1, /\brent\b|landlord|maintenance fee|compound|إيجار|ايجار|صيانه/],
];
// one transaction's category: a manual choice stays; then your rules and what you corrected before; then the
// built-in words; otherwise "Other" flagged for review. Returns {cat, sub, src, conf, review}
function classify(tx, ctx = {}) {
  if (tx.catSrc === 'manual' && tx.cat) return { cat: tx.cat, sub: tx.sub || '', src: 'manual', conf: 1, review: false };
  const dir = tx.amount > 0 ? 1 : tx.amount < 0 ? -1 : 0, d = norm(tx.desc), key = payeeKey(tx.desc), cats = ctx.cats ? catMap(ctx.cats) : catMap();
  const fits = (catId, need) => cats[catId] && (need === 0 || need === dir || (cats[catId].kind === 'move'));
  for (const r of ctx.rules || []) {
    if (!r.match || (r.dir && r.dir !== dir) || !cats[r.cat]) continue;
    const m = norm(r.match);
    if (r.learned ? key === m || (m.length >= 4 && key.startsWith(m)) : d.includes(m)) return { cat: r.cat, sub: r.sub || '', src: r.learned ? 'learned' : 'rule', conf: 0.95, review: false, rule: r.id };
  }
  // someone else's money (a person's name or words the user listed), then a holding's own wording (a certificate's
  // return, an investment box's distribution)
  const hasWord = list => String(list || '').split(/[,،;\n]/).map(w => norm(w)).filter(w => w.length >= 3).some(w => d.includes(w));
  for (const h of ctx.holdings || []) if (h.match && hasWord(h.match) && (!h.dir || h.dir === dir)) {
    const third = h.owner && h.owner !== 'me';
    return { cat: third ? 'held' : (h.cat || 'interest'), sub: '', src: 'holding', conf: 0.9, review: false, holding: h.id, party: third ? h.owner : '' };
  }
  for (const pt of ctx.parties || []) if (pt.match && hasWord(pt.match)) return { cat: 'held', sub: '', src: 'party', conf: 0.85, review: dir < 0, party: pt.id };
  for (const [cat, need, re] of BUILTIN) if (re.test(d) && fits(cat, need) && (cats[cat].kind !== 'income' || dir > 0) && (cats[cat].kind !== 'expense' || dir < 0 || cat === 'refund')) return { cat, sub: '', src: 'builtin', conf: 0.7, review: cats[cat].kind === 'move' };
  if (dir > 0 && /transfer|تحويل|deposit|ايداع|إيداع/.test(d)) return { cat: 'other_inc', sub: '', src: 'none', conf: 0.3, review: true };
  return { cat: dir > 0 ? 'other_inc' : 'other_exp', sub: '', src: 'none', conf: 0.3, review: true };
}
// the expense a refund reverses: the latest earlier expense from the same payee (wording without "refund")
const REFUND_W = /\b(refund|reversal|reversed|revers\w*|chargeback|cash ?back|credit)\b|استرداد|مرتجع|الغاء|إلغاء/gi;
function refundOf(tx, list, cats) {
  const key = payeeKey(String(tx.desc || '').replace(REFUND_W, ' ')), cm = catMap(cats); if (!key) return null;
  const hit = (list || []).filter(t => t.id !== tx.id && typeof t.amount === 'number' && t.amount < 0 && cm[t.cat] && cm[t.cat].kind === 'expense' && (!tx.date || !t.date || t.date <= tx.date))
    .filter(t => { const k = payeeKey(t.desc); return k && (k === key || k.startsWith(key) || key.startsWith(k)); }).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  return hit ? hit.cat : null;
}
// a correction teaches a rule for that payee (in the same direction); returns the rule list to save
function learnRule(rules, tx, cat, sub) {
  const key = payeeKey(tx.desc); if (!key) return rules;
  const dir = tx.amount > 0 ? 1 : -1, out = (rules || []).filter(r => !(r.learned && r.match === key && r.dir === dir));
  out.push({ id: 'L-' + key.replace(/\s/g, '_') + (dir > 0 ? '+' : '-'), match: key, dir, cat, sub: sub || '', learned: true });
  return out;
}

/* ---------- transfers, card payments, savings: both sides of a movement ---------- */
// pairs a payment out of one of my accounts with the same amount arriving in another of my accounts within 4
// days. Pairs only when the wording says so or one account is a card / savings / investment / loan account, so a
// salary of the same amount as an unrelated payment is never paired. Returns [{a, b, code}]
const MOVE_WORDS = /transfer|تحويل|payment|سداد|deposit|ايداع|إيداع|withdraw|سحب|saving|ادخار|invest|استثمار|card|بطاقه/;
function codeFor(ka, kb) {
  const k = [ka, kb];
  return k.includes('credit_card') ? 'ccpay' : k.includes('loan') ? 'principal' : k.includes('investment') ? 'invest' : k.includes('savings') ? 'savings' : 'transfer';
}
function pairMoves(txs, accounts) {
  const acc = Object.fromEntries((accounts || []).map(a => [a.id, a]));
  const free = txs.filter(t => validDate(t.date) && typeof t.amount === 'number' && t.amount !== 0 && !t.pair && t.catSrc !== 'manual');
  const ins = free.filter(t => t.amount > 0), used = new Set(), out = [];
  for (const o of free.filter(t => t.amount < 0).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))) {
    const ao = acc[o.acct]; if (!ao) continue;
    let best = null, bd = 99;
    for (const i of ins) {
      if (used.has(i.id) || i.acct === o.acct) continue;
      const ai = acc[i.acct]; if (!ai || (ai.currency || '') !== (ao.currency || '') || Math.abs(i.amount + o.amount) > EPS) continue;
      const gap = dnum(i.date) - dnum(o.date); if (gap < -1 || gap > 4) continue;
      const special = ['credit_card', 'savings', 'investment', 'loan'].some(k => ai.kind === k || ao.kind === k);
      if (!special && !MOVE_WORDS.test(norm(o.desc)) && !MOVE_WORDS.test(norm(i.desc))) continue;
      if (Math.abs(gap) < bd) { bd = Math.abs(gap); best = i; }
    }
    if (best) { used.add(best.id); out.push({ a: o.id, b: best.id, code: codeFor(ao.kind, acc[best.acct].kind) }); }
  }
  return out;
}
const CODE_CAT = { transfer: 'transfer', savings: 'savings', invest: 'invest', ccpay: 'ccpay', principal: 'principal' };

/* ---------- reading statements ---------- */
const H = {
  vdate: /value ?date|تاريخ (القيمه|الاستحقاق|الحق)/, date: /^(trans(action)?\.? |posting |booking |txn |operation )?date$|^date|^التاريخ|تاريخ (العمليه|الحركه|المعامله)|^تاريخ$/,
  balance: /balance|running|الرصيد|رصيد/, debit: /debit|withdraw|money out|paid out|^out$|^dr$|مدين|سحب|المسحوب|خصم/, credit: /credit|deposit|money in|paid in|^in$|^cr$|دائن|ايداع|المودع|اضافه/,
  amount: /^(transaction |net |txn )?amount|^المبلغ|^مبلغ|^value$/, currency: /^(currency|ccy|cur|curr)$|العمله/, ref: /\bref|reference|cheque|check no|transaction id|txn id|رقم (المرجع|العمليه|الشيك)|المرجع/,
  dir: /^(dr ?\/ ?cr|cr ?\/ ?dr|d ?\/ ?c|type|direction|debit ?\/ ?credit)$|نوع (الحركه|العمليه)/, desc: /descr|details|narrat|particular|memo|merchant|payee|remark|البيان|الوصف|تفاصيل|الشرح|بيان/,
};
const ROLE_ORDER = ['vdate', 'date', 'balance', 'dir', 'debit', 'credit', 'amount', 'currency', 'ref', 'desc'];
const isTotalLine = s => /^(opening|closing|brought|carried|total|balance (b\/f|c\/f|forward)|رصيد (افتتاحي|ختامي|سابق|مرحل)|الرصيد (الافتتاحي|الختامي|السابق)|اجمالي|الإجمالي)/.test(norm(s));
function statementMeta(lines) {
  const text = lines.join(' \n ');
  const cur = CURRENCIES.map(c => [c, (text.match(new RegExp('\\b' + c + '\\b', 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0];
  const acct = /(?:card (?:no\.?|number)|account|a\/c|acct|iban|رقم الحساب|رقم البطاقه|الحساب)\s*(?:no\.?|number|#|:)?\s*[:\-]?\s*([A-Z]{0,4}[\d\s*xX-]{6,})/i.exec(AR(text));
  const per = /(?:from|period|من|الفتره)[^0-9]{0,20}(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}\s+[A-Za-z؀-ۿ]{3,}\.?\s+\d{2,4})\s*(?:to|until|-|–|الى|إلى|حتى)\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}|\d{1,2}\s+[A-Za-z؀-ۿ]{3,}\.?\s+\d{2,4})/i.exec(AR(text));
  return { currency: cur && cur[1] ? cur[0] : '', account: acct ? acct[1].replace(/\s+/g, '').slice(-14) : '', periodText: per ? [per[1], per[2]] : null };
}
// a spreadsheet or CSV laid out as a grid: find the header row and what each column holds
function detectGrid(grid) {
  grid = (grid || []).map(r => (r || []).map(c => (c === null || c === undefined ? '' : c)));
  const label = c => norm(String(c));
  let h = -1, best = 0;
  for (let i = 0; i < Math.min(grid.length, 40); i++) {
    const cells = grid[i].map(label), hasDate = cells.some(c => H.date.test(c) || H.vdate.test(c)), hasAmt = cells.some(c => H.amount.test(c) || H.debit.test(c) || H.credit.test(c));
    const score = (hasDate ? 2 : 0) + (hasAmt ? 2 : 0) + cells.filter(c => ROLE_ORDER.some(r => H[r].test(c))).length * 0.1;
    if (hasDate && hasAmt && score > best) { best = score; h = i; }
  }
  const map = { date: -1, vdate: -1, desc: -1, amount: -1, debit: -1, credit: -1, balance: -1, currency: -1, ref: -1, dir: -1 };
  let guessed = false;
  if (h >= 0) {
    const cells = grid[h].map(label), taken = new Set();
    for (const role of ROLE_ORDER) { const i = cells.findIndex((c, j) => !taken.has(j) && c && H[role].test(c)); if (i >= 0) { map[role] = i; taken.add(i); } }
    if (map.date < 0 && map.vdate >= 0) { map.date = map.vdate; map.vdate = -1; }
  } else {
    // no header: the column that reads as dates, the numbers after it, the longest text
    guessed = true; h = -1;
    const body = grid.slice(0, 60), cols = Math.max(0, ...body.map(r => r.length));
    const kind = j => { let d = 0, n = 0, t = 0; for (const r of body) { const v = r[j]; if (v === '' || v === undefined) continue; if (parseDate(v)?.iso) d++; else if (parseNum(v)) n++; else if (/[A-Za-z؀-ۿ]{3,}/.test(String(v))) t += String(v).length; } return { d, n, t }; };
    const ks = Array.from({ length: cols }, (_, j) => kind(j));
    map.date = ks.reduce((b, k, j) => k.d > (ks[b] ? ks[b].d : 0) ? j : b, -1);
    map.desc = ks.reduce((b, k, j) => k.t > (ks[b] ? ks[b].t : 0) && j !== map.date ? j : b, -1);
    const nums = ks.map((k, j) => [k.n, j]).filter(([n, j]) => n > 0 && j !== map.date && j !== map.desc).map(x => x[1]);
    if (nums.length === 1) map.amount = nums[0]; else if (nums.length === 2) { map.amount = nums[0]; map.balance = nums[1]; } else if (nums.length >= 3) { map.debit = nums[0]; map.credit = nums[1]; map.balance = nums[2]; }
  }
  if (map.desc < 0) { const body = grid.slice(h + 1, h + 40); map.desc = grid[0] ? grid[0].findIndex((_, j) => !Object.values(map).includes(j) && body.some(r => /[A-Za-z؀-ۿ]{3,}/.test(String(r[j] ?? '')))) : -1; }
  if (map.debit >= 0 || map.credit >= 0) map.amount = map.amount >= 0 && map.debit >= 0 && map.credit >= 0 ? -1 : map.amount;
  const body = grid.slice(h + 1);
  const order = dateOrder(body.map(r => r[map.date]));
  const meta = statementMeta(grid.slice(0, Math.max(h, 0) + 1).map(r => r.join(' ')).concat(body.slice(0, 5).map(r => r.join(' '))));
  return { header: h, map, order, guessed, meta, headerCells: h >= 0 ? grid[h].map(String) : [] };
}
// the rows of a grid as candidate transactions; every non-empty row comes back either as a row or as skipped
// with its reason
function rowsFromGrid(grid, det, o = {}) {
  grid = (grid || []).map(r => (r || []).map(c => (c === null || c === undefined ? '' : c)));
  const { map, order } = det, rows = [], skipped = [], meta = { opening: null, closing: null };
  const year = o.year || null;
  for (let i = det.header + 1; i < grid.length; i++) {
    const r = grid[i]; if (!r.some(c => String(c).trim())) continue;
    const raw = r.map(c => String(c instanceof Date ? c.toISOString().slice(0, 10) : c).trim()).filter(Boolean).join(' | ').slice(0, 400);
    const cell = j => j >= 0 ? r[j] : '';
    const desc = [cell(map.desc)].concat(o.extraDesc || []).map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
    const dt = parseDate(cell(map.date), order, year);
    let amount = null, dirKnown = true, flags = [];
    if (map.debit >= 0 || map.credit >= 0) {
      const d = parseNum(cell(map.debit)), c = parseNum(cell(map.credit));
      if (d || c) { amount = r2((c ? Math.abs(c.n) : 0) - (d ? Math.abs(d.n) : 0)); if (d && c && d.n && c.n) flags.push('both_sides'); }
      if (map.amount >= 0 && amount === null) { const a = parseNum(cell(map.amount)); if (a) { amount = a.n; dirKnown = a.mark !== 0 || a.n < 0; if (a.mark) amount = a.mark * Math.abs(a.n); } }
    } else if (map.amount >= 0) {
      const a = parseNum(cell(map.amount));
      if (a) {
        amount = a.n;
        const dv = map.dir >= 0 ? norm(String(cell(map.dir))) : '';
        if (a.mark) amount = a.mark * Math.abs(a.n);
        else if (/^(d|dr|debit|withdrawal|مدين|سحب)/.test(dv)) amount = -Math.abs(a.n);
        else if (/^(c|cr|credit|deposit|دائن|ايداع)/.test(dv)) amount = Math.abs(a.n);
        else if (map.dir >= 0 || a.n >= 0) dirKnown = a.n < 0 || map.dir >= 0 ? a.n < 0 || !!dv : false;
        if (o.signedAmounts) dirKnown = true;
      }
    }
    const bal = map.balance >= 0 ? parseNum(cell(map.balance)) : null;
    const cur = map.currency >= 0 ? String(cell(map.currency)).trim().toUpperCase() : '';
    if (!dt && amount === null) {
      // a wrapped description line belongs to the row above; total / balance lines are kept as statement facts
      if (isTotalLine(raw)) { const n = parseNum(cell(map.balance) || cell(map.amount) || cell(map.credit) || cell(map.debit)); if (/closing|carried|c\/f|ختامي|مرحل/.test(norm(raw))) meta.closing = n ? n.n : null; else meta.opening = n ? n.n : null; skipped.push({ r: i + 1, raw, why: 'statement total or balance line' }); continue; }
      const onlyText = r.every((c, j) => j === map.desc || !String(c).trim());
      if (rows.length && desc && onlyText) { const p = rows[rows.length - 1]; p.desc = (p.desc + ' ' + desc).trim(); p.raw = (p.raw + ' ⏎ ' + raw).slice(0, 600); continue; }
      if (!onlyText && !desc) { skipped.push({ r: i + 1, raw, why: 'no date, amount or description' }); continue; }
    }
    if (isTotalLine(desc) && (!dt || amount === null || /balance|رصيد/.test(norm(desc)))) {
      if (/closing|carried|c\/f|ختامي|مرحل/.test(norm(desc))) meta.closing = bal ? bal.n : amount; else meta.opening = bal ? bal.n : amount;
      skipped.push({ r: i + 1, raw, why: 'statement total or balance line' }); continue;
    }
    if (!dt || !dt.iso) flags.push(dt && dt.noYear ? 'no_year' : 'no_date');
    if (amount === null) flags.push('no_amount'); else if (!dirKnown) flags.push('direction_unknown');
    if (!desc) flags.push('no_description');
    rows.push({ r: i + 1, raw, date: dt && dt.iso || null, desc, amount: amount === null ? null : r2(amount), balance: bal ? r2(bal.mark ? bal.mark * Math.abs(bal.n) : bal.n) : null, currency: /^[A-Z]{3}$/.test(cur) ? cur : '', ref: map.ref >= 0 ? String(cell(map.ref)).trim() : '', flags });
  }
  return { rows: chainBest(rows, meta, o.card), skipped, meta };
}
// lines of a text PDF ("01/10/2026  CARREFOUR MAADI   1,245.50   18,754.50")
function rowsFromText(text, o = {}) {
  const lines = AR(text).split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(l => l && !/^\[page \d+\]$/i.test(l));
  const meta = { ...statementMeta(lines.slice(0, 30)), opening: null, closing: null };
  const DATE_RE = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{1,2}[\s\-/.]+[A-Za-z؀-ۿ]{3,}\.?(?:[\s\-/.,]+\d{2,4})?|\d{1,2}[-/.]\d{1,2})(?=\s|$)/;
  const order = dateOrder(lines.map(l => (DATE_RE.exec(l) || [])[1]).filter(Boolean));
  let year = o.year || null;
  if (!year && meta.periodText) { const p = parseDate(meta.periodText[1], order); if (p && p.iso) year = +p.iso.slice(0, 4); }
  const header = lines.findIndex(l => /debit|credit|withdraw|deposit|مدين|دائن/i.test(l) && /balance|رصيد/i.test(l));
  const debitFirst = header >= 0 ? (/debit|withdraw|مدين|سحب/i.exec(lines[header]) || { index: 0 }).index < (/credit|deposit|دائن|ايداع/i.exec(lines[header]) || { index: 1e9 }).index : true;
  const rows = [], skipped = [];
  lines.forEach((line, i) => {
    if (i <= header) return;
    const dm = DATE_RE.exec(line);
    const nums = [...line.matchAll(AMT_RE)].map(m => ({ s: m[0], i: m.index, p: parseNum(m[0]) })).filter(x => x.p);
    if (isTotalLine(dm ? line.slice(dm[0].length).trim() : line)) {
      const v = nums.length ? nums[nums.length - 1].p.n : null;
      if (/closing|carried|c\/f|ختامي|مرحل/.test(norm(line))) meta.closing = v; else meta.opening = v;
      skipped.push({ r: i + 1, raw: line, why: 'statement total or balance line' }); return;
    }
    if (!dm) {
      if (rows.length && !nums.length && rows[rows.length - 1].r === i && line.length < 80 && !/page|صفحه|statement|كشف/i.test(line)) { const p = rows[rows.length - 1]; p.desc = (p.desc + ' ' + line).trim(); p.raw += ' ⏎ ' + line; p.r = i + 1; }
      return;
    }
    let rest = line.slice(dm[0].length).trim();
    const vd = DATE_RE.exec(rest); if (vd && parseDate(vd[1], order, year)) rest = rest.slice(vd[0].length).trim();
    const restNums = [...rest.matchAll(AMT_RE)].map(m => ({ s: m[0], i: m.index, p: parseNum(m[0]) })).filter(x => x.p);
    const desc = (restNums.length ? rest.slice(0, restNums[0].i) : rest).replace(/\s+/g, ' ').trim();
    const dt = parseDate(dm[1], order, year);
    const flags = [];
    let amount = null, balance = null, dirKnown = false;
    if (restNums.length >= 3) { const [a, b, c] = restNums.slice(-3); const d = debitFirst ? a : b, cr = debitFirst ? b : a; amount = r2(Math.abs(cr.p.n) - Math.abs(d.p.n)); balance = c.p.mark ? c.p.mark * Math.abs(c.p.n) : c.p.n; dirKnown = true; }
    else if (restNums.length === 2) { const [a, c] = restNums; amount = a.p.n; balance = c.p.mark ? c.p.mark * Math.abs(c.p.n) : c.p.n; if (a.p.mark) { amount = a.p.mark * Math.abs(a.p.n); dirKnown = true; } else if (a.p.n < 0) dirKnown = true; }
    else if (restNums.length === 1) { const a = restNums[0]; amount = a.p.n; if (a.p.mark) { amount = a.p.mark * Math.abs(a.p.n); dirKnown = true; } else if (a.p.n < 0) dirKnown = true; }
    if (!dt || !dt.iso) flags.push(dt && dt.noYear ? 'no_year' : 'no_date');
    if (amount === null) flags.push('no_amount'); else if (!dirKnown) flags.push('direction_unknown');
    if (!desc) flags.push('no_description');
    rows.push({ r: i + 1, raw: line.slice(0, 400), date: dt && dt.iso || null, desc, amount: amount === null ? null : r2(amount), balance: balance === null ? null : r2(balance), currency: '', ref: '', flags });
  });
  return { rows: chainBest(rows, meta, o.card), skipped, meta, order, year };
}
// the running balance decides a direction the statement did not print and catches misread amounts
function chain(rows, opening) {
  const dated = rows.filter(r => r.date);
  let up = 0, down = 0; for (let i = 1; i < dated.length; i++) { if (dated[i].date > dated[i - 1].date) up++; else if (dated[i].date < dated[i - 1].date) down++; }
  const seq = down > up ? rows.slice().reverse() : rows.slice();
  let prev = typeof opening === 'number' ? opening : null;
  seq.forEach((r, i) => {
    if (r.balance === null || r.balance === undefined) { prev = null; return; }
    if (prev === null && i === 0 && r.amount !== null && !r.flags.includes('direction_unknown')) { prev = r2(r.balance - r.amount); }
    if (prev !== null && r.amount !== null) {
      const a = Math.abs(r.amount);
      if (r.flags.includes('direction_unknown')) {
        if (Math.abs(prev + a - r.balance) < EPS) { r.amount = a; r.flags = r.flags.filter(f => f !== 'direction_unknown'); r.dirFrom = 'balance'; }
        else if (Math.abs(prev - a - r.balance) < EPS) { r.amount = -a; r.flags = r.flags.filter(f => f !== 'direction_unknown'); r.dirFrom = 'balance'; }
        else r.flags.push('balance_mismatch');
      } else if (Math.abs(prev + r.amount - r.balance) >= EPS) r.flags.push('balance_mismatch');
    } else if (prev === null && r.flags.includes('direction_unknown') && seq[i + 1] && seq[i + 1].balance !== null && seq[i + 1].amount !== null && !seq[i + 1].flags.includes('direction_unknown')) {
      // first row: the next row tells what this balance came from only when its own direction is known
    }
    prev = r.balance;
  });
  return rows;
}
// card statements often print the amount owed as a positive balance: the sign that makes the running balance
// agree with the amounts wins, and the statement's own balances are stored the way the ledger counts (owed = −)
function chainBest(rows, meta, card) {
  const copy = flip => rows.map(r => ({ ...r, flags: r.flags.slice(), balance: r.balance === null || r.balance === undefined ? r.balance : flip ? -r.balance : r.balance }));
  const bad = rs => rs.filter(r => r.flags.includes('balance_mismatch') || r.flags.includes('direction_unknown')).length;
  const a = chain(copy(false), meta.opening), withBal = rows.filter(r => typeof r.balance === 'number').length;
  if (!withBal || (!bad(a) && !card)) return a;
  const b = chain(copy(true), typeof meta.opening === 'number' ? -meta.opening : meta.opening);
  // when both readings add up, a card account takes "the balance is what I owe"
  if (bad(b) < bad(a) || (card && bad(b) <= bad(a))) { meta.balanceFlipped = true; if (typeof meta.opening === 'number') meta.opening = -meta.opening; if (typeof meta.closing === 'number') meta.closing = -meta.closing; return b; }
  return a;
}
// what a statement said about itself and what the rows add up to
function statementCheck(rows, meta) {
  const ok = rows.filter(r => r.date && r.amount !== null);
  const dates = ok.map(r => r.date).sort();
  const sumAmt = r2(sum(ok.map(r => r.amount)));
  const res = { from: dates[0] || null, to: dates[dates.length - 1] || null, rows: rows.length, opening: meta.opening ?? null, closing: meta.closing ?? null, sum: sumAmt, diff: null, mismatches: rows.filter(r => r.flags.includes('balance_mismatch')).length };
  if (typeof res.opening === 'number' && typeof res.closing === 'number') res.diff = r2(res.opening + sumAmt - res.closing);
  return res;
}

/* ---------- matching a statement against the ledger (importing twice never counts twice) ---------- */
const cents = v => Math.round(v * 100);
const fp = t => [t.acct, t.date, cents(t.amount), payeeKey(t.desc), norm(t.ref || '')].join('|');
const words = s => new Set(norm(cleanDesc(s)).split(' ').filter(w => w.length > 1 && !/\d/.test(w)));
function similar(a, b) { const A = words(a), B = words(b); if (!A.size && !B.size) return 1; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / (A.size + B.size - n || 1); }
const refOf = t => norm(t.ref || '').replace(/\s/g, '');
// Each incoming row is compared with the ledger of the same account, one existing record per row at most (so
// two equal coffees on one day stay two, and a statement imported again matches row for row). The evidence, in
// order: the bank's reference; then the same amount on the same date with a running balance that agrees (two
// consecutive equal payments have different balances, so they are never merged); then the wording. A row that
// is the same transaction is "dup" (nothing changes) or "update" (the statement adds or corrects a detail: the
// old value stays in the history). A row that might be the same but is not certain, or contradicts the record
// (same reference, other amount), is "review": it is not added until the user decides. Anything else is "new".
// Rows without a date or an amount are "incomplete": kept, never guessed, matched by their original text.
function matchImport(rows, existing, acct) {
  const pool = existing.filter(t => t.acct === acct && !t.deleted), claimed = new Set();
  const rawKey = s => norm(s).replace(/\s/g, '');
  const incompleteSeen = new Map(); for (const t of pool) if (!validDate(t.date) || typeof t.amount !== 'number') { const k = rawKey((t.src && t.src.raw) || t.desc); incompleteSeen.set(k, (incompleteSeen.get(k) || []).concat(t.id)); }
  const balOk = (r, t) => !(typeof r.balance === 'number' && typeof t.balance === 'number' && Math.abs(r.balance - t.balance) >= EPS);
  const refClash = (r, t) => !!(refOf(r) && refOf(t) && refOf(r) !== refOf(t));
  const diff = (r, t) => {
    const ch = [], conflict = [];
    if (norm(r.desc) !== norm(t.desc) && r.desc) ch.push({ f: 'desc', from: t.desc, to: r.desc });
    for (const f of ['balance', 'ref', 'currency']) {
      const nv = r[f], ov = t[f];
      if (nv === null || nv === undefined || nv === '') continue;
      if (ov === null || ov === undefined || ov === '') ch.push({ f, from: ov ?? null, to: nv });
      else if (f === 'balance' ? Math.abs(nv - ov) >= EPS : norm(String(nv)) !== norm(String(ov))) conflict.push({ f, from: ov, to: nv });
    }
    if (r.date !== t.date && !(t.dates || []).includes(r.date)) ch.push({ f: 'date2', from: t.date, to: r.date });
    return { ch, conflict };
  };
  const same = (r, t, why) => { claimed.add(t.id); const { ch, conflict } = diff(r, t); r.match = t.id; r.changes = ch; r.conflicts = conflict; r.act = conflict.length ? 'review' : ch.length ? 'update' : 'dup'; r.why = conflict.length ? `${why}, but the statement shows a different ${conflict.map(c => c.f).join(' and ')}` : why; };
  for (const r of rows) {
    r.act = 'new'; r.match = null; r.changes = []; r.conflicts = []; r.why = '';
    if (!r.date || r.amount === null || r.amount === undefined || (r.flags || []).includes('direction_unknown')) {
      const ids = incompleteSeen.get(rawKey(r.raw || r.desc)) || [], id = ids.find(x => !claimed.has(x));
      if (id) { claimed.add(id); r.act = 'dup'; r.match = id; r.why = 'the same unreadable line was kept before'; } else r.act = 'incomplete';
      continue;
    }
    const c = cents(r.amount), free = pool.filter(t => !claimed.has(t.id) && validDate(t.date) && typeof t.amount === 'number');
    // 1. the bank's own reference
    if (refOf(r)) {
      const byRef = free.filter(t => refOf(t) === refOf(r));
      const hit = byRef.find(t => cents(t.amount) === c && Math.abs(dnum(t.date) - dnum(r.date)) <= 3);
      if (hit) { same(r, hit, 'same bank reference, amount and date'); continue; }
      if (byRef.length) { r.act = 'review'; r.match = byRef[0].id; r.conflicts = [{ f: cents(byRef[0].amount) !== c ? 'amount' : 'date', from: cents(byRef[0].amount) !== c ? byRef[0].amount : byRef[0].date, to: cents(byRef[0].amount) !== c ? r.amount : r.date }]; r.why = 'same bank reference as a recorded transaction but a different ' + r.conflicts[0].f; claimed.add(byRef[0].id); continue; }
    }
    // 2. same amount, same date, balances that agree
    const sameDay = free.filter(t => cents(t.amount) === c && (t.date === r.date || (t.dates || []).includes(r.date)) && balOk(r, t) && !refClash(r, t))
      .map(t => ({ t, s: similar(r.desc, t.desc), bal: typeof r.balance === 'number' && typeof t.balance === 'number' })).sort((x, y) => (y.bal - x.bal) || (y.s - x.s));
    if (sameDay.length) {
      const b = sameDay[0];
      if (b.bal) { same(r, b.t, 'same amount, date and running balance'); continue; }
      if (b.s >= 0.5) { same(r, b.t, 'same amount, date and description'); continue; }
      // nothing in common between two worded descriptions: a different payment that happens to cost the same
      if (b.s < 0.15 && words(r.desc).size && words(b.t.desc).size) continue;
      r.act = 'review'; r.match = b.t.id; r.why = 'same amount and date as a recorded transaction, described differently'; claimed.add(b.t.id); continue;
    }
    // 3. the same payment dated a few days apart (transaction vs posting date)
    const near = free.filter(t => cents(t.amount) === c && Math.abs(dnum(t.date) - dnum(r.date)) <= 3 && balOk(r, t) && !refClash(r, t))
      .map(t => ({ t, s: similar(r.desc, t.desc), bal: typeof r.balance === 'number' && typeof t.balance === 'number' })).filter(x => x.s >= 0.5 || x.bal).sort((x, y) => (y.bal - x.bal) || (y.s - x.s));
    if (near.length) {
      const b = near[0];
      if (b.bal) { same(r, b.t, 'same amount and running balance, dated ' + Math.abs(dnum(b.t.date) - dnum(r.date)) + ' day(s) apart'); continue; }
      r.act = 'review'; r.match = b.t.id; r.why = `same amount and description ${Math.abs(dnum(b.t.date) - dnum(r.date))} day(s) from a recorded transaction`; claimed.add(b.t.id); continue;
    }
  }
  return rows;
}
const importCounts = rows => ({ reviewed: rows.length, added: rows.filter(r => r.act === 'new').length, dup: rows.filter(r => r.act === 'dup').length, updated: rows.filter(r => r.act === 'update').length, review: rows.filter(r => r.act === 'review').length, incomplete: rows.filter(r => r.act === 'incomplete').length });
function overlaps(period, acct, batches) {
  if (!period || !period.from || !period.to) return [];
  return (batches || []).filter(b => b.acct === acct && b.from && b.to && b.from <= period.to && b.to >= period.from)
    .map(b => ({ id: b.id, file: b.file, from: b.from > period.from ? b.from : period.from, to: b.to < period.to ? b.to : period.to }));
}

/* ---------- the numbers ---------- */
function quant(arr, q) { const a = arr.slice().sort((x, y) => x - y); if (!a.length) return null; const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return a[lo] + (a[hi] - a[lo]) * (p - lo); }
const median = a => quant(a, 0.5);
// one entry per piece of money that counts: a split transaction gives its parts; movements stay movements.
// Converted to the reporting currency only with a rate the user gave; otherwise the entry is left out and counted.
function entries(txs, o) {
  const cats = catMap(o.cats), acc = Object.fromEntries((o.accounts || []).map(a => [a.id, a])), base = o.base || 'EGP', rates = o.rates || {};
  const cardMonths = new Set(); for (const t of txs) if (acc[t.acct] && acc[t.acct].kind === 'credit_card' && validDate(t.date)) cardMonths.add(ym(t.date));
  for (const b of o.batches || []) if (acc[b.acct] && acc[b.acct].kind === 'credit_card' && b.from && b.to) monthList(ym(b.from), ym(b.to)).forEach(m => cardMonths.add(m));
  const out = [], noRate = {}, incomplete = [];
  for (const t of txs) {
    if (o.acctIds && o.acctIds.length && !o.acctIds.includes(t.acct)) continue;
    if (!validDate(t.date) || typeof t.amount !== 'number' || isNaN(t.amount) || (t.flags || []).includes('direction_unknown')) { incomplete.push(t.id); continue; }
    const cur = t.currency || (acc[t.acct] && acc[t.acct].currency) || base;
    const rate = cur === base ? 1 : +rates[cur] > 0 ? +rates[cur] : null;
    if (rate === null) { (noRate[cur] = noRate[cur] || { cur, n: 0, sum: 0 }).n++; noRate[cur].sum = r2(noRate[cur].sum + t.amount); continue; }
    const parts = Array.isArray(t.parts) && t.parts.length && Math.abs(sum(t.parts.map(p => +p.amount || 0)) - t.amount) < EPS ? t.parts : [{ amount: t.amount, cat: t.cat, sub: t.sub }];
    for (const p of parts) {
      let cat = cats[p.cat] ? p.cat : t.amount > 0 ? 'other_inc' : 'other_exp', c = cats[cat];
      const v = r2(p.amount * rate), m = ym(t.date);
      let flow;
      if (c.kind === 'income' && c.code === 'refund') { flow = 'exp'; cat = cats[t.rcat] && cats[t.rcat].kind === 'expense' ? t.rcat : 'other_exp'; }
      else if (c.kind === 'income') flow = 'inc';
      else if (c.kind === 'expense') flow = 'exp';
      else if (c.kind === 'third') flow = 'third';
      else if (c.kind === 'capital') flow = 'capital';
      else if (c.code === 'ccpay' && v < 0 && !cardMonths.has(m) && !(acc[t.acct] && acc[t.acct].kind === 'credit_card')) { flow = 'exp'; cat = 'cc_unitem'; }
      else flow = 'move';
      out.push({ id: t.id, date: t.date, m, acct: t.acct, cat, sub: p.sub || '', flow, code: c.code || '', group: (cats[cat] || {}).group || '', v, refund: c.code === 'refund', desc: t.desc, kind: acc[t.acct] ? acc[t.acct].kind : '', party: t.party || '', holding: t.holding || '', link: t.link || '' });
    }
  }
  return { list: out, noRate: Object.values(noRate), incomplete };
}
// income counts what came in; expense counts what went out minus refunds of it (so both are positive numbers)
const incOf = e => e.flow === 'inc' ? e.v : 0;
const expOf = e => e.flow === 'exp' ? -e.v : 0;
// savings put aside: savings and investment movements out of the accounts I spend from, minus what came back
const SPEND = ['current', 'cash', 'credit_card', '', undefined];
const saveOf = e => e.flow === 'move' && (e.code === 'savings' || e.code === 'invest') && SPEND.includes(e.kind) ? -e.v : 0;

// months with a statement or a record are "covered": a covered month with no spending is a genuine zero; a month
// without any data is a gap and is shown as missing, never as zero
function coverage(o, txs) {
  const set = new Set(), ids = o.acctIds && o.acctIds.length ? o.acctIds : null;
  for (const b of o.batches || []) if ((!ids || ids.includes(b.acct)) && b.from && b.to) monthList(ym(b.from), ym(b.to)).forEach(m => set.add(m));
  for (const t of txs) if ((!ids || ids.includes(t.acct)) && validDate(t.date)) set.add(ym(t.date));
  return set;
}
function analyze(txs, o) {
  const E = entries(txs, o), all = E.list, cats = catMap(o.cats);
  const dates = all.map(e => e.date).sort();
  const first = dates[0] || null, last = dates[dates.length - 1] || null;
  const from = o.from || first, to = o.to || last;
  const res = { first, last, from, to, noRate: E.noRate, incomplete: E.incomplete, months: [], cats: {}, totals: {}, empty: !from };
  if (!from || !to || from > to) return res;
  const inSel = e => e.date >= from && e.date <= to && (!o.catIds || !o.catIds.length || o.catIds.includes(e.cat));
  const sel = all.filter(inSel), cov = coverage(o, txs);
  const months = monthList(ym(from), ym(to)), nM = months.length, nD = spanDays(from, to);
  const byM = Object.fromEntries(months.map(m => [m, { m, covered: cov.has(m), inc: 0, exp: 0, save: 0, byCat: {} }]));
  for (const e of sel) {
    const b = byM[e.m]; if (!b) continue;
    b.inc += incOf(e); b.exp += expOf(e); b.save += saveOf(e);
    if (e.flow === 'exp' && e.group === 'property') b.expProp = (b.expProp || 0) + expOf(e);
    // per category the amount as it reads: income received, or spending net of its refunds (both positive)
    if (e.flow === 'inc' || e.flow === 'exp') b.byCat[e.cat] = (b.byCat[e.cat] || 0) + (e.flow === 'inc' ? e.v : -e.v);
  }
  res.months = months.map(m => { const b = byM[m]; b.inc = r2(b.inc); b.exp = r2(b.exp); b.expProp = r2(b.expProp || 0); b.save = r2(b.save); b.net = r2(b.inc - b.exp); for (const k in b.byCat) b.byCat[k] = r2(b.byCat[k]); return b; });
  const covered = res.months.filter(b => b.covered);
  const tInc = r2(sum(sel.map(incOf))), tExp = r2(sum(sel.map(expOf))), tSave = r2(sum(sel.map(saveOf)));
  // the equal period just before, for "period change"
  const pFrom = addDays(from, -nD), pTo = addDays(from, -1);
  const prev = all.filter(e => e.date >= pFrom && e.date <= pTo && (!o.catIds || !o.catIds.length || o.catIds.includes(e.cat)));
  const prevCovered = monthList(ym(pFrom), ym(pTo)).some(m => cov.has(m)) && prev.length > 0;
  const ids = [...new Set(sel.filter(e => e.flow === 'inc' || e.flow === 'exp').map(e => e.cat))];
  for (const id of ids) {
    const c = cats[id] || { id, name: id, kind: 'expense' }, own = sel.filter(e => e.cat === id && (e.flow === 'inc' || e.flow === 'exp'));
    const sign = c.kind === 'income' ? 1 : -1, val = e => sign * e.v;
    const total = r2(sum(own.map(val)));
    const series = res.months.map(b => ({ m: b.m, v: b.covered ? r2(b.byCat[id] || 0) : null }));
    const cv = series.filter(s => s.v !== null);
    const peak = cv.length ? cv.reduce((a, b) => b.v > a.v ? b : a) : null, low = cv.length ? cv.reduce((a, b) => b.v < a.v ? b : a) : null;
    const ds = own.map(e => e.date).sort(), cnt = new Set(own.filter(e => !e.refund).map(e => e.id)).size;
    const prevTotal = r2(sum(prev.filter(e => e.cat === id && (e.flow === 'inc' || e.flow === 'exp')).map(val)));
    res.cats[id] = { id, name: c.name, kind: c.kind, prio: c.prio, total, monthly: r2(total / nM), daily: r2(total / nD), peak, low, count: cnt, avgTx: cnt ? r2(total / cnt) : null,
      share: c.kind === 'income' ? (tInc ? r2(total / tInc * 100) : null) : (tExp ? r2(total / tExp * 100) : null), prev: prevCovered ? prevTotal : null, change: prevCovered && prevTotal ? r2((total - prevTotal) / Math.abs(prevTotal) * 100) : null,
      firstDate: ds[0] || null, lastDate: ds[ds.length - 1] || null, annual: r2(total / nM * 12), series, refunds: r2(sum(own.filter(e => e.refund).map(e => e.v))) };
  }
  const peakExp = covered.length ? covered.reduce((a, b) => b.exp > a.exp ? b : a) : null, lowExp = covered.length ? covered.reduce((a, b) => b.exp < a.exp ? b : a) : null;
  res.totals = { inc: tInc, exp: tExp, net: r2(tInc - tExp), save: tSave, months: nM, days: nD, coveredMonths: covered.length, gaps: res.months.filter(b => !b.covered).map(b => b.m),
    avgInc: r2(tInc / nM), avgExp: r2(tExp / nM), rate: tInc > 0 ? r2((tInc - tExp) / tInc * 100) : null, peakExp, lowExp, refunds: r2(sum(sel.filter(e => e.refund).map(e => e.v))),
    moves: r2(sum(sel.filter(e => e.flow === 'move').map(e => Math.abs(e.v)))), moveCount: sel.filter(e => e.flow === 'move').length,
    expProperty: r2(sum(sel.filter(e => e.group === 'property').map(expOf))), capital: r2(sum(sel.filter(e => e.flow === 'capital').map(e => e.v))), third: r2(sum(sel.filter(e => e.flow === 'third').map(e => e.v))), thirdCount: sel.filter(e => e.flow === 'third').length };
  res.totals.expLiving = r2(res.totals.exp - res.totals.expProperty);
  res.entries = sel;
  return res;
}
// income vs expenses by day, ISO week, month, quarter or year
function series(list, gran, from, to) {
  const key = d => gran === 'day' ? d : gran === 'week' ? (() => { const n = dnum(d), wd = (new Date(n * 864e5).getUTCDay() + 6) % 7; return fromDnum(n - wd); })() : gran === 'quarter' ? `${d.slice(0, 4)}-Q${Math.floor((+d.slice(5, 7) - 1) / 3) + 1}` : gran === 'year' ? d.slice(0, 4) : d.slice(0, 7);
  const keys = [];
  if (from && to) { if (gran === 'month') keys.push(...monthList(ym(from), ym(to))); else { let last = ''; for (let n = dnum(from), i = 0; n <= dnum(to) && i < 4000; n++, i++) { const k = key(fromDnum(n)); if (k !== last) { keys.push(k); last = k; } } } }
  const b = Object.fromEntries(keys.map(k => [k, { k, inc: 0, exp: 0 }]));
  for (const e of list) { const k = key(e.date); if (!b[k]) continue; b[k].inc += incOf(e); b[k].exp += expOf(e); }
  return keys.map(k => ({ k, inc: r2(b[k].inc), exp: r2(b[k].exp), net: r2(b[k].inc - b[k].exp) }));
}
// payments that repeat: the same payee in at least 3 different months at a steady interval
function recurring(list, o = {}) {
  const groups = {};
  for (const e of list) { if (!(e.flow === 'inc' || e.flow === 'exp') || e.refund) continue; const k = (e.flow === 'inc' ? '+' : '-') + payeeKey(e.desc).split(' ').slice(0, 2).join(' '); if (k.length < 3) continue; (groups[k] = groups[k] || []).push(e); }
  const out = [];
  for (const [k, g] of Object.entries(groups)) {
    const ms = new Set(g.map(e => e.m)); if (ms.size < 3) continue;
    const ds = g.map(e => e.date).sort(), gaps = []; for (let i = 1; i < ds.length; i++) gaps.push(dnum(ds[i]) - dnum(ds[i - 1]));
    const mg = median(gaps.filter(x => x > 0)) || 0;
    const freq = mg >= 26 && mg <= 35 ? 'monthly' : mg >= 6 && mg <= 8 ? 'weekly' : mg >= 84 && mg <= 96 ? 'quarterly' : mg >= 350 && mg <= 380 ? 'yearly' : null;
    if (!freq) continue;
    const amts = g.map(e => Math.abs(e.v)), md = median(amts), spread = md ? (Math.max(...amts) - Math.min(...amts)) / md : 1;
    const perMonth = freq === 'monthly' ? md : freq === 'weekly' ? md * 52 / 12 : freq === 'quarterly' ? md / 3 : md / 12;
    const cat = g[g.length - 1].cat;
    out.push({ key: k, name: cleanDesc(g[g.length - 1].desc), dir: k[0] === '+' ? 1 : -1, cat, freq, amount: r2(md), fixed: spread <= 0.1, spread: r2(spread * 100), n: g.length, last: ds[ds.length - 1], next: addDays(ds[ds.length - 1], Math.round(mg)), perMonth: r2(perMonth), annual: r2(perMonth * 12), ids: g.map(e => e.id) });
  }
  return out.sort((a, b) => b.perMonth - a.perMonth);
}
// what I earn now: a salary counts as "verified recurring" only when it arrived in at least 3 of the last 4
// covered months; the latest income is never assumed to be the salary
function incomeBase(an, today) {
  const cur = ym(today), done = an.months.filter(b => b.covered && b.m < cur);
  const sal = done.map(b => ({ m: b.m, v: r2(b.byCat.salary || 0) }));
  const last4 = sal.slice(-4), withSal = last4.filter(s => s.v > 0);
  const verified = withSal.length >= 3;
  const lastSal = sal.filter(s => s.v > 0).slice(-3).map(s => s.v);
  const latest = done.length ? { m: done[done.length - 1].m, v: done[done.length - 1].inc } : null;
  const otherRec = recurring((an.entries || []).filter(e => e.flow === 'inc' && e.cat !== 'salary'));
  const irregular = r2(sum(done.slice(-12).map(b => sum(['bonus', 'other_inc'].map(k => b.byCat[k] || 0)))) / Math.max(1, Math.min(12, done.length)));
  return { verified, salary: lastSal.length ? r2(median(lastSal)) : null, salaryMonths: withSal.length, latest, avg: an.totals.avgInc ?? null, otherRecurring: otherRec, otherRecurringMonthly: r2(sum(otherRec.map(r => r.perMonth))), irregularMonthly: irregular, basis: lastSal.length ? `median of the last ${lastSal.length} monthly salary total${lastSal.length > 1 ? 's' : ''}` : '' };
}

/* ---------- budgets ---------- */
// per category: its own monthly history (complete, covered months only, up to the last 12), then a limit from
// that history by priority. The strategy picks a point of my own distribution — never a share of income.
const STRATEGY = {
  conservative: { essential: 0.75, important: 0.5, discretionary: 0.5, optional: 0.25, label: 'Conservative', why: 'Keeps essentials at the upper part of what they usually cost (75th percentile) so they stay covered and cash stays available; trims only optional spending to your 25th percentile.' },
  balanced: { essential: 0.5, important: 0.5, discretionary: 0.25, optional: 0.25, label: 'Balanced', why: 'Essentials and important costs at their usual (median) month; discretionary and optional at the cheaper quarter of your own months (25th percentile).' },
  aggressive: { essential: 0.5, important: 0.25, discretionary: 0.1, optional: 0, label: 'Aggressive savings', why: 'Essentials at their median month and fixed payments in full; important at your 25th percentile, discretionary at your 10th percentile and optional at your lowest month.' },
};
function budgetPlan(an, o) {
  const cur = ym(o.today), cats = catMap(o.cats), strat = STRATEGY[o.strategy] || STRATEGY.balanced;
  const hist = an.months.filter(b => b.covered && b.m < cur).slice(-12);
  const curB = an.months.find(b => b.m === cur);
  const rec = recurring((an.entries || []).filter(e => e.flow === 'exp'));
  const out = [];
  for (const c of Object.values(cats)) {
    if (c.kind !== 'expense') continue;
    const vals = hist.map(b => b.byCat[c.id] || 0);
    const used = vals.some(v => v) || (o.budgets || {})[c.id] !== undefined || (curB && curB.byCat[c.id]);
    if (!used) continue;
    const avg = vals.length ? r2(sum(vals) / vals.length) : null;
    const fixed = r2(sum(rec.filter(r => r.cat === c.id && r.fixed).map(r => r.perMonth)));
    const q = strat[c.prio || 'discretionary'] ?? 0.5;
    let rec0 = vals.length ? (q === 0 ? Math.min(...vals) : quant(vals, q)) : null;
    if (rec0 !== null) rec0 = r2(Math.max(rec0, fixed));
    const set = (o.budgets || {})[c.id], budget = set !== undefined && set !== null && set !== '' ? +set : null;
    const spent = curB ? r2(curB.byCat[c.id] || 0) : 0;
    const b = budget !== null ? budget : null;
    const l3 = vals.slice(-3), p3 = vals.slice(-6, -3);
    const trend = l3.length === 3 && p3.length === 3 && sum(p3) > 0 ? (sum(l3) / sum(p3) - 1) * 100 : null;
    out.push({ id: c.id, name: c.name, prio: c.prio || 'discretionary', months: vals.length, avg, median: vals.length ? r2(median(vals)) : null, p25: vals.length ? r2(quant(vals, 0.25)) : null, p75: vals.length ? r2(quant(vals, 0.75)) : null, min: vals.length ? r2(Math.min(...vals)) : null,
      fixed, recommended: rec0, budget: b, spent, remaining: b !== null ? r2(b - spent) : null, util: b ? r2(spent / b * 100) : null,
      saveMonthly: avg !== null && rec0 !== null && avg > rec0 ? r2(avg - rec0) : 0, saveAnnual: avg !== null && rec0 !== null && avg > rec0 ? r2((avg - rec0) * 12) : 0,
      trend: trend === null ? null : trend > 10 ? 'up' : trend < -10 ? 'down' : 'stable', trendPct: trend === null ? null : r2(trend) });
  }
  const P = ['essential', 'important', 'discretionary', 'optional'];
  out.sort((a, b) => P.indexOf(a.prio) - P.indexOf(b.prio) || (b.avg || 0) - (a.avg || 0));
  return { rows: out, months: hist.length, strategy: o.strategy || 'balanced', why: strat.why, totalRecommended: r2(sum(out.map(r => r.recommended || 0))), totalBudget: r2(sum(out.map(r => r.budget || 0))), totalSpent: r2(sum(out.map(r => r.spent))) };
}

/* ---------- this month ---------- */
function monthControl(an, plan, o) {
  const cur = o.month || ym(o.today), b = an.months.find(x => x.m === cur) || { inc: 0, exp: 0, byCat: {}, save: 0 };
  const day = o.month && o.month < ym(o.today) ? dim(cur) : +o.today.slice(8, 10), left = dim(cur) - day;
  const rec = recurring((an.entries || []).filter(e => e.flow === 'exp' || e.flow === 'inc'));
  const seen = new Set((an.entries || []).filter(e => e.m === cur).map(e => e.id));
  const upcoming = rec.filter(r => r.dir < 0 && r.freq === 'monthly' && ym(r.next) === cur && !r.ids.some(id => seen.has(id) && (an.entries.find(e => e.id === id) || {}).m === cur)).map(r => ({ name: r.name, amount: r.amount, date: r.next, cat: r.cat, late: r.next < o.today }))
    .concat((o.commitments || []).filter(c => c.amount && (!c.end || c.end >= cur + '-01') && (!c.start || c.start <= monthEnd(cur))).map(c => ({ name: c.name, amount: +c.amount, date: `${cur}-${String(Math.min(+c.day || 1, dim(cur))).padStart(2, '0')}`, cat: c.cat, manual: true })).filter(c => c.date.slice(8) > o.today.slice(8) || cur > ym(o.today)));
  const expected = o.expectedIncome ?? null;
  const committed = r2(sum(upcoming.map(u => u.amount)));
  const spentBud = plan.rows.filter(r => r.budget !== null);
  const over = spentBud.filter(r => r.spent > r.budget).map(r => ({ id: r.id, name: r.name, over: r2(r.spent - r.budget) }));
  const pace = spentBud.filter(r => r.spent <= r.budget && r.budget > 0 && day > 0 && r.spent / day * dim(cur) > r.budget * 1.05).map(r => ({ id: r.id, name: r.name, projected: r2(r.spent / day * dim(cur)), budget: r.budget }));
  const flexLeft = r2(sum(spentBud.filter(r => ['discretionary', 'optional'].includes(r.prio)).map(r => Math.max(0, r.remaining))));
  return { month: cur, day, daysLeft: left, inc: b.inc, exp: b.exp, expected, incGap: expected !== null ? r2(b.inc - expected) : null, budget: plan.totalBudget, budgetLeft: r2(plan.totalBudget - sum(spentBud.map(r => r.spent))),
    disposable: expected !== null ? r2(Math.max(expected, b.inc) - b.exp - committed) : r2(b.inc - b.exp - committed), committed, upcoming, over, pace,
    saveTarget: o.saveTarget ? +o.saveTarget : null, saved: r2(b.inc - b.exp), savedMoved: b.save, perDay: left > 0 ? r2(flexLeft / left) : null, flexLeft };
}
// spending far above what this category usually costs: above Q3 + 3×IQR of its own history and at least twice
// its median, with at least 5 earlier transactions to compare with
function unusual(list) {
  const byCat = {}; for (const e of list) if (e.flow === 'exp' && e.v < 0) (byCat[e.cat] = byCat[e.cat] || []).push(e);
  const out = [];
  for (const g of Object.values(byCat)) {
    g.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 5; i < g.length; i++) {
      const past = g.slice(0, i).map(e => -e.v), q1 = quant(past, 0.25), q3 = quant(past, 0.75), md = median(past), a = -g[i].v;
      if (a > q3 + 3 * (q3 - q1) && a >= 2 * md) out.push({ id: g[i].id, date: g[i].date, cat: g[i].cat, amount: r2(a), median: r2(md), times: r2(a / md) });
    }
  }
  return out;
}

/* ---------- income growth ---------- */
// a change: {id, label, kind: raise|promotion|bonus|side|other, mode: pct|amt, value, date, recurring, freq:
// monthly|quarterly|yearly|once, deduct (% taken off the increase), status: confirmed|probable|speculative}
const SCEN = { conservative: { confirmed: 100, probable: 50, speculative: 0, delay: 2 }, expected: { confirmed: 100, probable: 100, speculative: 0, delay: 0 }, optimistic: { confirmed: 100, probable: 100, speculative: 100, delay: 0 } };
// the same day n months later (the 31st becomes the last day of a shorter month)
const shiftDate = (date, n) => { const m = addMonths(ym(date), n); return `${m}-${String(Math.min(+date.slice(8, 10), dim(m))).padStart(2, '0')}`; };
function monthFactor(m, date) {
  // the share of month m a change dated `date` is in effect: 0 before, partial in its month, 1 after
  if (!date) return 0; const dm = ym(date);
  if (m < dm) return 0; if (m > dm) return 1;
  const d = +date.slice(8, 10); return (dim(m) - d + 1) / dim(m);
}
// sim.baseSave: what I already save each month without any increase (entered or from my history)
function simulate(sim, o) {
  const start = o.start || ym(o.today), H = Math.max(1, Math.min(36, +sim.horizon || 12)), months = Array.from({ length: H }, (_, i) => addMonths(start, i));
  const base = +sim.base || 0, exp0 = +sim.expenses || 0, extraExp = +sim.extraExpenses || 0, infl = +sim.inflation || 0, alloc = (+sim.saveShare || 0) / 100;
  const sc = { ...SCEN, ...(sim.scenarios || {}) };
  // skip: one change left out ("without this increase"), or '*' for none at all
  const run = (scName, skip) => {
    const s = sc[scName] || SCEN.expected;
    const ch = (skip === '*' ? [] : sim.changes || []).filter(c => c.id !== skip && c.date && validDate(c.date) && (+c.value || 0)).map(c => {
      const real = (s[c.status || 'confirmed'] ?? 100) / 100;
      const delay = (c.status || 'confirmed') === 'confirmed' ? 0 : +s.delay || 0;
      const date = delay ? shiftDate(c.date, delay) : c.date;
      return { ...c, date, real };
    }).filter(c => c.real > 0).sort((a, b) => a.date.localeCompare(b.date));
    // a percentage raise applies to the pay in effect just before it (raises compound in date order)
    let level = base; const recur = [];
    for (const c of ch.filter(c => c.recurring && (c.freq || 'monthly') === 'monthly')) { const amt = c.mode === 'pct' ? level * (+c.value / 100) : +c.value; const net = amt * (1 - (+c.deduct || 0) / 100) * c.real; recur.push({ c, net }); level += amt * c.real; }
    const rows = months.map((m, i) => {
      let inc = 0, once = 0;
      for (const r of recur) inc += r.net * monthFactor(m, r.c.date);
      for (const c of ch.filter(c => !(c.recurring && (c.freq || 'monthly') === 'monthly'))) {
        const amt = (c.mode === 'pct' ? base * (+c.value / 100) : +c.value) * (1 - (+c.deduct || 0) / 100) * c.real, f = c.freq || 'once', dm = ym(c.date);
        const k = monthList(dm, m).length - 1;
        if (m < dm) continue;
        if ((f === 'once' || !c.recurring) && m === dm) once += amt;
        else if (c.recurring && f === 'quarterly' && k % 3 === 0) once += amt;
        else if (c.recurring && f === 'yearly' && k % 12 === 0) once += amt;
      }
      const ex = (exp0 + extraExp) * Math.pow(1 + infl / 100, i / 12);
      return { m, base, recurInc: r2(inc), once: r2(once), income: r2(base + inc + once), expenses: r2(ex), extraExp: r2(extraExp * Math.pow(1 + infl / 100, i / 12)), disposable: r2(base + inc + once - ex), incrDisp: r2(inc + once - (extraExp * Math.pow(1 + infl / 100, i / 12))) };
    });
    let cumInc = 0, cumSave = +sim.saved || 0, cumAll = +sim.saved || 0, hit = null;
    for (const r of rows) { cumInc += r.recurInc + r.once; cumSave += Math.max(0, r.incrDisp) * alloc; cumAll += (+sim.baseSave || 0) + Math.max(0, r.incrDisp) * alloc; r.cumIncr = r2(cumInc); r.cumSave = r2(cumSave); r.cumAll = r2(cumAll); if (sim.target && hit === null && cumAll >= +sim.target) hit = r.m; }
    const lastRec = rows.length ? rows[rows.length - 1].recurInc : 0;
    return { rows, current: r2(base), projected: r2(base + lastRec), monthlyIncrease: r2(lastRec), annualIncrease: r2(lastRec * 12), addDisposable: r2(lastRec - extraExp), cumIncr: r2(cumInc), addSavings: r2(cumSave - (+sim.saved || 0)), cumAll: r2(cumAll),
      progress: sim.target ? r2(Math.min(100, cumAll / +sim.target * 100)) : null, targetMonth: hit, changes: ch };
  };
  const out = { months, scenarios: {} };
  for (const k of ['conservative', 'expected', 'optimistic']) out.scenarios[k] = run(k);
  out.without = Object.fromEntries((sim.changes || []).map(c => [c.id, run('expected', c.id)]));
  out.none = run('expected', '*');
  return out;
}
// sensitivity: one assumption moved at a time, everything else as entered (expected scenario)
function sensitivity(sim, o) {
  const pick = (sim.changes || []).find(c => c.mode === 'pct' && c.recurring) || (sim.changes || [])[0];
  const res = { raise: [], delay: [], save: [] };
  if (pick) {
    for (const d of pick.mode === 'pct' ? [-5, -2, 0, 2, 5] : [-0.5, -0.25, 0, 0.25, 0.5]) { const v = pick.mode === 'pct' ? Math.max(0, +pick.value + d) : Math.max(0, +pick.value * (1 + d)); const r = simulate({ ...sim, changes: sim.changes.map(c => c === pick ? { ...c, value: v } : c) }, o).scenarios.expected; res.raise.push({ value: r2(v), cumIncr: r.cumIncr, addSavings: r.addSavings, targetMonth: r.targetMonth }); }
    for (const d of [0, 1, 3, 6]) { const r = simulate({ ...sim, changes: sim.changes.map(c => c === pick ? { ...c, date: shiftDate(c.date, d) } : c) }, o).scenarios.expected; res.delay.push({ months: d, cumIncr: r.cumIncr, addSavings: r.addSavings, targetMonth: r.targetMonth }); }
  }
  for (const s of [25, 50, 75, 100]) { const r = simulate({ ...sim, saveShare: s }, o).scenarios.expected; res.save.push({ share: s, addSavings: r.addSavings, targetMonth: r.targetMonth }); }
  return { ...res, change: pick ? pick.label || pick.kind : null };
}
// where extra income goes: the shares must add up to exactly 100
function allocate(buckets, monthly) {
  const total = r2(sum((buckets || []).map(b => +b.pct || 0)));
  if (Math.abs(total - 100) > 0.001) return { ok: false, total, error: `The shares add up to ${total}%, not 100%.` };
  return { ok: true, total, rows: buckets.map(b => ({ ...b, monthly: r2(monthly * (+b.pct || 0) / 100), annual: r2(monthly * (+b.pct || 0) / 100 * 12) })) };
}
// months to reach a target from what is saved now at a monthly contribution (null when it never gets there)
function monthsTo(target, saved, monthly) { const need = (+target || 0) - (+saved || 0); if (need <= 0) return 0; if (!(monthly > 0)) return null; return Math.ceil(need / monthly - 1e-9); }

/* ---------- forecast and goals ---------- */
function forecast(an, o) {
  const cur = ym(o.today), done = an.months.filter(b => b.covered && b.m < cur).slice(-6), H = Math.max(1, Math.min(36, +o.horizon || 12));
  const cats = catMap(o.cats), byCat = {};
  for (const c of Object.values(cats)) if (c.kind === 'expense') { const v = done.map(b => b.byCat[c.id] || 0); if (v.some(x => x)) byCat[c.id] = r2(median(v)); }
  const expBase = r2(sum(Object.values(byCat)));
  const incBase = o.income !== undefined && o.income !== null ? +o.income : null;
  const extra = o.incomeRows || null, infl = +o.inflation || 0;
  const rows = [];
  let bal = o.balance === null || o.balance === undefined ? null : +o.balance, cum = 0;
  for (let i = 0; i < H; i++) {
    const m = addMonths(cur, i + 1), inc = extra && extra[i] ? extra[i].income : incBase, ex = r2(expBase * Math.pow(1 + infl / 100, (i + 1) / 12));
    const net = inc === null ? null : r2(inc - ex);
    if (net !== null) cum = r2(cum + net);
    if (bal !== null && net !== null) bal = r2(bal + net);
    rows.push({ m, income: inc, expenses: ex, net, cum: net === null ? null : cum, balance: net === null ? null : bal, shortfall: net !== null && (net < 0 || (bal !== null && bal < 0)) });
  }
  return { rows, byCat, expBase, incBase, months: done.length, annualSpend: r2(sum(rows.slice(0, 12).map(r => r.expenses))), basis: `median of each category over the last ${done.length} complete month${done.length === 1 ? '' : 's'} with data` };
}
// goals share the projected monthly surplus: a goal with its own contribution uses it; the rest split equally
function goalPlan(goals, surplus, today, alt = {}) {
  const auto = goals.filter(g => !(+g.monthly > 0)), share = surplus > 0 && auto.length ? surplus / auto.length : 0;
  return goals.map(g => {
    const monthly = +g.monthly > 0 ? +g.monthly : share, need = r2(Math.max(0, (+g.target || 0) - (+g.saved || 0)));
    const n = monthsTo(g.target, g.saved, monthly), eta = n === null ? null : addMonths(ym(today), n);
    const left = g.date ? Math.max(0, monthList(ym(today), ym(g.date)).length - 1) : null;
    const required = left ? r2(need / left) : left === 0 ? need : null;
    const ok = n !== null && (!g.date || eta <= ym(g.date));
    const alts = {}; for (const [k, s] of Object.entries(alt)) { const mm = +g.monthly > 0 ? +g.monthly : (s > 0 && auto.length ? s / auto.length : 0); const nn = monthsTo(g.target, g.saved, mm); alts[k] = nn === null ? null : addMonths(ym(today), nn); }
    return { ...g, monthly: r2(monthly), need, months: n, eta, monthsLeft: left, required, extra: required !== null && monthly < required ? r2(required - monthly) : 0, ok, progress: +g.target ? r2(Math.min(100, (+g.saved || 0) / +g.target * 100)) : null, alts };
  });
}

/* ---------- reconciliation ---------- */
function reconcile(acct, txs, batches) {
  const own = txs.filter(t => t.acct === acct.id), ok = own.filter(t => validDate(t.date) && typeof t.amount === 'number');
  const withBal = ok.filter(t => typeof t.balance === 'number').sort((a, b) => a.date.localeCompare(b.date) || (a.src && b.src ? (a.src.b === b.src.b ? (a.src.r || 0) - (b.src.r || 0) : 0) : 0));
  const lastBal = withBal.length ? withBal[withBal.length - 1] : null;
  const mismatches = own.filter(t => (t.flags || []).includes('balance_mismatch'));
  const bs = (batches || []).filter(b => b.acct === acct.id && b.from && b.to).sort((a, b) => a.from.localeCompare(b.from));
  const gaps = []; for (let i = 1; i < bs.length; i++) { const end = bs.slice(0, i).reduce((m, b) => b.to > m ? b.to : m, bs[0].to); if (dnum(bs[i].from) - dnum(end) > 3) gaps.push({ from: addDays(end, 1), to: addDays(bs[i].from, -1) }); }
  const keys = {}; for (const t of ok) { const k = fp(t); (keys[k] = keys[k] || []).push(t.id); }
  const dups = Object.values(keys).filter(v => v.length > 1 && !v.every(id => (own.find(t => t.id === id).flags || []).includes('dup_ok')));
  let computed = null, basis = '';
  if (acct.opening !== undefined && acct.opening !== null && acct.opening !== '' && validDate(acct.openingDate)) { computed = r2(+acct.opening + sum(ok.filter(t => t.date >= acct.openingDate).map(t => t.amount))); basis = `opening ${acct.opening} on ${acct.openingDate} plus ${ok.filter(t => t.date >= acct.openingDate).length} transactions`; }
  const statements = bs.map(b => ({ id: b.id, file: b.file, from: b.from, to: b.to, opening: b.opening ?? null, closing: b.closing ?? null, diff: b.diff ?? null, mismatches: b.mismatches || 0, status: typeof b.diff === 'number' ? (Math.abs(b.diff) < EPS && !b.mismatches ? 'reconciled' : 'differences') : b.mismatches ? 'differences' : 'not enough data' }));
  const diff = computed !== null && lastBal ? r2(computed - sum(ok.filter(t => t.date > lastBal.date).map(t => t.amount)) - lastBal.balance) : null;
  const status = !lastBal && computed === null ? 'not enough data' : mismatches.length || dups.length || (diff !== null && Math.abs(diff) >= EPS) || statements.some(s => s.status === 'differences') ? 'differences' : lastBal ? 'reconciled' : 'not enough data';
  return { id: acct.id, confirmed: lastBal ? { balance: lastBal.balance, date: lastBal.date, from: lastBal.src ? lastBal.src.f : '' } : null, computed, basis, diff, mismatches: mismatches.map(t => t.id), gaps, dups, statements, status, count: own.length, incomplete: own.length - ok.length };
}


/* ---------- other people's money passing through my accounts ---------- */
// per person: what came in for them, what went out to them or on their behalf, what I still hold. Each payment
// out is matched to the oldest money in that is not yet paid out (first in, first out), so every pound is traced.
function thirdParty(txs, parties) {
  const out = {};
  for (const p of parties || []) out[p.id] = { id: p.id, name: p.name, in: 0, out: 0, held: 0, items: [], links: [], open: [] };
  for (const t of txs) {
    if (t.cat !== 'held' || !validDate(t.date) || typeof t.amount !== 'number') continue;
    const p = out[t.party || ''] || (out[t.party || '?'] = { id: t.party || '?', name: t.party ? t.party : 'Not assigned to a person yet', in: 0, out: 0, held: 0, items: [], links: [], open: [] });
    p.items.push(t); if (t.amount > 0) p.in += t.amount; else p.out += -t.amount;
  }
  for (const p of Object.values(out)) {
    p.items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const fifo = p.items.filter(t => t.amount > 0).map(t => ({ id: t.id, date: t.date, left: t.amount, cur: t.currency }));
    for (const o of p.items.filter(t => t.amount < 0)) {
      let need = -o.amount;
      for (const f of fifo) { if (need < EPS) break; if (f.left < EPS) continue; const take = Math.min(f.left, need); f.left = r2(f.left - take); need = r2(need - take); p.links.push({ from: f.id, to: o.id, amount: r2(take) }); }
      if (need >= EPS) p.links.push({ from: null, to: o.id, amount: r2(need), note: 'paid out more than was received for this person' });
    }
    p.open = fifo.filter(f => f.left >= EPS); p.in = r2(p.in); p.out = r2(p.out); p.held = r2(p.in - p.out);
  }
  return Object.values(out);
}

/* ---------- what I own, what I owe, what I only look after ---------- */
// holding: {id, kind: deposit|cd|managed|property|liability|other, name, owner: 'me' or a person id, custodian
// (whose name the account is in), principal, currency, rate (% a year, as stated; null when not verified), payDay,
// start, maturity, myShareMonthly, insideAcct (the bank account it sits in, if any), valuation (property, only when
// verified), includeValue (property value in net worth only when asked)}
function holdingReturns(h, txs, months) {
  // actual returns are the transactions linked to this holding; expected only when a rate was given
  const linked = txs.filter(t => t.holding === h.id && validDate(t.date) && typeof t.amount === 'number');
  const exp = h.rate !== null && h.rate !== undefined && h.rate !== '' && +h.principal ? r2(+h.principal * +h.rate / 100 / 12) : null;
  const rows = (months || []).map(m => { const ins = linked.filter(t => ym(t.date) === m && t.amount > 0), outs = linked.filter(t => ym(t.date) === m && t.amount < 0); return { m, expected: exp, actual: r2(sum(ins.map(t => t.amount))), paidOut: r2(-sum(outs.map(t => t.amount))), n: ins.length, gap: exp !== null ? r2(sum(ins.map(t => t.amount)) - exp) : null }; });
  const logs = (h.log || []).filter(l => l.m && (+l.received || +l.mine || +l.allocated));
  return { expectedMonthly: exp, rows, received: r2(sum(linked.filter(t => t.amount > 0).map(t => t.amount)) + sum(logs.map(l => +l.received || 0))), paidOut: r2(-sum(linked.filter(t => t.amount < 0).map(t => t.amount))),
    mine: r2(sum(logs.map(l => +l.mine || 0))), allocated: r2(sum(logs.map(l => +l.allocated || 0))), log: logs };
}
// office share: my area = total area × share − area sold; rent by area
function propertyShare(p) {
  const area = +p.area || 0, share = +p.share || 0, sold = +p.soldArea || 0;
  const orig = r2(area * share / 100 * 1000) / 1000, mine = Math.max(0, Math.round((orig - sold) * 1000) / 1000);
  const rate = +p.rentRate || 0, gross = Math.round(mine * rate * 1000) / 1000;
  const occ = p.occupancy === undefined || p.occupancy === '' || p.occupancy === null ? 100 : +p.occupancy, mgmt = +p.mgmtPct || 0, fixedCost = +p.costs || 0;
  const net = Math.round((gross * occ / 100 * (1 - mgmt / 100) - fixedCost) * 1000) / 1000;
  return { origArea: orig, myArea: mine, effPct: area ? Math.round(mine / area * 100 * 10000) / 10000 : 0, grossMonthly: gross, grossAnnual: Math.round(gross * 12 * 1000) / 1000, netMonthly: net, netAnnual: Math.round(net * 12 * 1000) / 1000, currency: p.rentCurrency || 'USD' };
}
// rent from the month after handover (or the start the user set); scenarios move one assumption each
function rentForecast(props, o) {
  const H = Math.max(1, Math.min(60, +o.horizon || 24)), start = ym(o.today), months = Array.from({ length: H }, (_, i) => addMonths(start, i + 1));
  const sc = o.scenario || {};
  return months.map(m => {
    let gross = 0, net = 0;
    for (const p of props || []) {
      const s = propertyShare({ ...p, rentRate: (+p.rentRate || 0) * (1 - (+sc.rentCut || 0) / 100), occupancy: Math.max(0, (p.occupancy === undefined || p.occupancy === '' ? 100 : +p.occupancy) - (+sc.vacancy || 0)), costs: (+p.costs || 0) * (1 + (+sc.costUp || 0) / 100) });
      const begin = p.rentStart && validDate(p.rentStart) ? p.rentStart : p.handover && validDate(p.handover) ? addDays(monthEnd(ym(p.handover)), 1) : null;
      if (!begin) continue;
      const b = shiftDate(begin, +sc.delay || 0), f = monthFactor(m, b);
      gross += s.grossMonthly * f; net += s.netMonthly * f;
    }
    return { m, gross: r2(gross), net: r2(net) };
  });
}
// card: what is owed now. The latest statement balance is the verified figure (card statements print the amount
// owed as a positive number or as a negative balance; the account says which)
function cardOwed(acct, rec, txs) {
  if (!rec) return null;
  if (rec.confirmed) return { owed: r2(-rec.confirmed.balance), date: rec.confirmed.date, verified: true };
  if (rec.computed !== null && rec.computed !== undefined) return { owed: r2(-rec.computed), date: null, verified: false };
  return null;
}
// net worth, kept per currency: a currency is converted only with a rate the user supplied
function position(o) {
  const base = o.base || 'EGP', rates = o.rates || {}, conv = (v, cur) => cur === base ? v : +rates[cur] > 0 ? r2(v * +rates[cur]) : null;
  const assets = [], liabilities = [], third = [], notes = [];
  for (const a of o.accounts || []) {
    const rec = (o.recon || {})[a.id];
    if (a.kind === 'credit_card') { const c = cardOwed(a, rec, o.txs || []); if (c) liabilities.push({ id: a.id, name: a.name, kind: 'card', amount: c.owed, currency: a.currency, verified: c.verified, date: c.date, note: c.verified ? 'latest statement balance' : 'calculated from the opening balance — an estimate' }); else notes.push(`${a.name}: no card balance yet — import a statement that shows it or set an opening balance.`); continue; }
    if (a.kind === 'loan') { if (rec && rec.confirmed) liabilities.push({ id: a.id, name: a.name, kind: 'loan', amount: r2(Math.abs(rec.confirmed.balance)), currency: a.currency, verified: true, date: rec.confirmed.date }); continue; }
    if (rec && rec.confirmed) assets.push({ id: a.id, name: a.name, kind: 'bank', amount: rec.confirmed.balance, currency: a.currency, verified: true, date: rec.confirmed.date, note: 'latest statement balance' });
    else if (rec && rec.computed !== null && rec.computed !== undefined) assets.push({ id: a.id, name: a.name, kind: 'bank', amount: rec.computed, currency: a.currency, verified: false, note: 'calculated — not a bank-confirmed balance' });
    else notes.push(`${a.name}: no balance yet — the statements show none and no opening balance is set.`);
  }
  for (const p of o.thirdParty || []) if (Math.abs(p.held) >= EPS) third.push({ id: p.id, name: p.name, amount: p.held, currency: base, note: 'held in my accounts for them' });
  for (const h of o.holdings || []) {
    const mine = !h.owner || h.owner === 'me';
    if (h.kind === 'property') { if (mine && h.includeValue && +h.valuation > 0) assets.push({ id: h.id, name: h.name, kind: 'property', amount: +h.valuation, currency: h.currency || base, verified: !!h.valuationVerified, note: 'property value you entered' }); continue; }
    if (h.kind === 'liability') { if (+h.remaining > 0) liabilities.push({ id: h.id, name: h.name, kind: 'installments', amount: +h.remaining, currency: h.currency || base, verified: !!h.verified, note: h.verified ? 'from the contract / statement' : 'entered, not verified' }); continue; }
    if (!(+h.principal > 0)) continue;
    const row = { id: h.id, name: h.name, kind: h.kind, amount: +h.principal, currency: h.currency || base, verified: !!h.verified, custodian: h.custodian || '', note: h.custodian && h.custodian !== 'me' ? `held in ${h.custodian}'s account` : '' };
    if (mine) assets.push(row); else third.push({ ...row, note: 'I look after it; it belongs to ' + ((o.parties || []).find(p => p.id === h.owner) || { name: h.owner }).name });
  }
  // money of others sitting inside my bank balances is not mine
  const insideMine = (o.thirdParty || []).filter(p => p.held > 0).map(p => ({ id: 'held-' + p.id, name: `${p.name}'s money in my accounts`, amount: -p.held, currency: base }));
  for (const h of o.holdings || []) if (h.owner && h.owner !== 'me' && h.insideAcct && +h.principal > 0) insideMine.push({ id: 'in-' + h.id, name: `${h.name} (inside my account)`, amount: -(+h.principal), currency: h.currency || base });
  const by = {};
  const add = (cur, v, k) => { (by[cur] = by[cur] || { assets: 0, liabilities: 0, others: 0 })[k] += v; };
  for (const a of assets) add(a.currency || base, a.amount, 'assets');
  for (const l of liabilities) add(l.currency || base, l.amount, 'liabilities');
  for (const x of insideMine) add(x.currency || base, x.amount, 'others');
  const perCurrency = Object.entries(by).map(([cur, v]) => ({ cur, assets: r2(v.assets), liabilities: r2(v.liabilities), others: r2(v.others), net: r2(v.assets + v.others - v.liabilities) }));
  let total = 0, missing = [];
  for (const p of perCurrency) { const c = conv(p.net, p.cur); if (c === null) missing.push(p.cur); else total += c; }
  return { assets, liabilities, third, insideMine, perCurrency, net: missing.length ? null : r2(total), missingRates: missing, base, notes, estimated: assets.some(a => !a.verified) || liabilities.some(l => !l.verified) };
}

/* ---------- backup ---------- */
function validateBackup(o) {
  const errors = [];
  if (!o || typeof o !== 'object') return { ok: false, errors: ['The file is not a Money backup.'] };
  if (o.app !== 'action-register-money') errors.push('The file is not a Money backup from this app.');
  if (!Array.isArray(o.tx)) errors.push('The backup has no transaction list.');
  const bad = (Array.isArray(o.tx) ? o.tx : []).filter(t => !t || typeof t.id !== 'string' || typeof t.acct !== 'string').length;
  if (bad) errors.push(`${bad} transaction${bad === 1 ? '' : 's'} in the file have no id or account.`);
  if (o.prefs && typeof o.prefs !== 'object') errors.push('The settings in the file are damaged.');
  return { ok: !errors.length, errors, counts: { tx: Array.isArray(o.tx) ? o.tx.length : 0, accounts: ((o.prefs || {}).accounts || []).length, batches: (o.batches || []).length } };
}

return { EPS, r2, norm, AR, CURRENCIES, validDate, dnum, addDays, spanDays, ym, addMonths, monthList, dim, monthEnd, parseDate, dateOrder, parseNum, cleanDesc, payeeKey,
  DEFAULT_CATS, catMap, classify, learnRule, refundOf, pairMoves, CODE_CAT, detectGrid, rowsFromGrid, rowsFromText, chainBest, statementCheck, matchImport, importCounts, similar, overlaps, fp, quant, median, entries, analyze, series,
  recurring, incomeBase, STRATEGY, budgetPlan, monthControl, unusual, SCEN, monthFactor, simulate, sensitivity, shiftDate, allocate, thirdParty, holdingReturns, propertyShare, rentForecast, cardOwed, position, monthsTo, forecast, goalPlan, reconcile, validateBackup };
})();
if (typeof module !== 'undefined') module.exports = FIN;
