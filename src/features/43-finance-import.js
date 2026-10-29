/* ---------- Money: importing statements (CSV, Excel, PDF, photos) — reviewed before anything is saved ---------- */
// CSV, Excel and PDFs with text are read on this device. Photos and scanned PDFs can only be read by Claude: that
// sends the page images (or the PDF's text) to Claude, so it runs only when you press "Read with Claude" for
// that file. Claude copies what is printed; the same rules as for any statement then check it (dates, amounts,
// running balance), so a misread number shows up as a balance that does not add up.
const FIN_EXT = { csv: 'sheet', txt: 'sheet', tsv: 'sheet', xlsx: 'sheet', xls: 'sheet', xlsm: 'sheet', ods: 'sheet', pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image' };
async function finHash(bytes) { try { const d = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return ''; } }
function finGuessAcct(meta, fileName) {
  const accts = finP().accounts, num = (meta.account || '').replace(/\D/g, '');
  if (num.length >= 4) { const a = accts.find(x => x.number && x.number.replace(/\D/g, '').slice(-4) === num.slice(-4)); if (a) return a.id; }
  const byName = accts.find(x => x.name && FIN.norm(fileName).includes(FIN.norm(x.name)));
  if (byName) return byName.id;
  const sameCur = accts.filter(x => !meta.currency || x.currency === meta.currency);
  return sameCur.length === 1 ? sameCur[0].id : '';
}
async function finReadFile(f) {
  const bytes = new Uint8Array(await f.arrayBuffer()), ext = E.extOf(f.name), kind = FIN_EXT[ext];
  const it = { name: f.name, size: bytes.length, bytes, kind, hash: await finHash(bytes), state: 'ready', acct: '', newAcct: null, decide: {}, keep: {}, cats: {}, dirs: {}, method: 'device' };
  if (!kind) { it.state = 'error'; it.err = 'This kind of file cannot be read. Use CSV, Excel, PDF or a photo (JPG/PNG).'; return it; }
  try {
    if (kind === 'sheet') {
      const X = await E.need('xlsx');
      const wb = /^(csv|txt|tsv)$/.test(ext) ? X.read(new TextDecoder().decode(bytes), { type: 'string', raw: true }) : X.read(bytes, { type: 'array', cellDates: true });
      // the sheet with the most rows that has a recognisable header
      let best = null;
      for (const n of wb.SheetNames) { const g = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); const d = FIN.detectGrid(g); const score = (d.header >= 0 && !d.guessed ? 1e6 : 0) + g.length; if (!best || score > best.score) best = { g, d, score, n }; }
      it.grid = best.g; it.det = best.d; it.sheet = best.n; it.meta0 = best.d.meta;
    } else if (kind === 'pdf') {
      const r = await E.extract({ name: f.name, bytes }, { vision: false });
      if (r.status === 'unreadable') { it.state = 'error'; it.err = r.note || 'The PDF could not be opened.'; return it; }
      it.text = r.text || ''; it.pages = r.pages || 1;
      const textPages = (r.pages || 1) - (r.scannedPages || []).length;
      if (!textPages) { it.state = 'needs-ai'; it.why = 'This PDF is a scan (pictures of pages, no text), so it cannot be read on this device.'; return it; }
      it.meta0 = FIN.rowsFromText(it.text).meta;
    } else { it.state = 'needs-ai'; it.why = 'A photo of a statement can only be read by Claude.'; return it; }
  } catch (e) { it.state = 'error'; it.err = 'Could not read the file: ' + (e.message || e); return it; }
  it.acct = finGuessAcct(it.meta0 || {}, f.name);
  finParse(it);
  if (!it.rows.length && it.kind === 'pdf') { it.state = 'needs-ai'; it.why = 'No transaction lines were recognised in this PDF’s text.'; }
  return it;
}
// read (again) with the chosen account and column mapping, then match against the ledger
function finParse(it) {
  const a = finAcct(it.acct) || (it.newAcct ? { kind: it.newAcct.kind, currency: it.newAcct.currency } : {});
  const card = a.kind === 'credit_card';
  let rd;
  if (it.grid) rd = FIN.rowsFromGrid(it.grid, it.det, { card });
  else if (it.ai) rd = FIN.rowsFromGrid(it.ai.grid, FIN.detectGrid(it.ai.grid), { card });
  else rd = FIN.rowsFromText(it.text || '', { card });
  if (it.ai) { rd.meta = { ...rd.meta, ...it.ai.meta }; rd.rows.forEach((r, i) => { r.flags.push('read_by_claude'); if (it.ai.unclear[i]) r.flags.push('unclear'); }); }
  it.rows = rd.rows; it.skipped = rd.skipped; it.meta = { ...(it.meta0 || {}), ...rd.meta };
  it.check = FIN.statementCheck(it.rows, it.meta);
  // the statement's own period when it prints one, else the dates of its rows
  let per = { from: it.check.from, to: it.check.to };
  if (it.meta.periodText) { const o = FIN.dateOrder(it.meta.periodText); const a1 = FIN.parseDate(it.meta.periodText[0], o), b1 = FIN.parseDate(it.meta.periodText[1], o); if (a1 && a1.iso && b1 && b1.iso && a1.iso <= b1.iso) per = { from: a1.iso, to: b1.iso }; }
  it.period = per;
  finMatch(it);
}
function finMatch(it) {
  const p = finP(), ctx = { rules: p.rules, cats: finCats(), parties: p.parties, holdings: p.holdings };
  FIN.matchImport(it.rows, it.acct ? finTx() : [], it.acct || '__new__');
  it.rows.forEach((r, i) => { if (r.act === 'new' || r.act === 'incomplete') { const c = FIN.classify({ desc: r.desc, amount: r.amount || 0 }, ctx); r.cls = c; } });
  it.overlaps = it.acct ? FIN.overlaps(it.period, it.acct, colList('finbatch')) : [];
  it.seen = colList('finbatch').filter(b => it.hash && b.hash === it.hash);
}

/* --- Claude reading a photo or a scanned / unusual PDF (only on your click) --- */
const FIN_AI_PROMPT = `You are reading a bank or credit-card statement. Copy ONLY what is printed. Never guess, complete, calculate or correct any value.
Return JSON: {"account": account number as printed or null, "currency": 3-letter code or null, "periodFrom": date as printed or null, "periodTo": date as printed or null, "opening": opening balance as printed or null, "closing": closing balance as printed or null,
"rows": [{"date": "as printed", "description": "as printed", "debit": "as printed or null", "credit": "as printed or null", "amount": "as printed or null (only when the statement has a single amount column)", "balance": "as printed or null", "ref": "as printed or null", "unclear": true or false}]}
Rules: one entry per transaction line, in printed order; keep numbers exactly as printed (with their commas, minus signs, brackets, CR/DR); if any part of a line cannot be read with certainty, put null for that part and set "unclear": true; do not list opening/closing/total lines as rows; do not translate. Reply with the JSON only.`;
async function finReadAI(it) {
  if (!St.sample) { toast('Reading by Claude is not available in this view.', { err: true }); return; }
  it.busy = true; render();
  try {
    let res;
    if (it.kind === 'pdf' && it.text && it.text.replace(/\[Page \d+\]|\(no text layer on this page\)|\s/g, '').length > 80) {
      res = await St.sample.json(FIN_AI_PROMPT + '\n\nSTATEMENT TEXT:\n' + it.text.slice(0, 120000), { modelTier: 'default' });
    } else {
      const lim = St.limits && St.limits.images;
      if (!lim) throw new Error('This view cannot send images to Claude.');
      const r = await E.extract({ name: it.name, bytes: it.bytes }, { vision: true, maxImageBytes: lim.maxInputBytes, maxPageImages: Math.min(lim.maxCount || 8, 12) });
      const images = (r.images || []).map(x => x.blob).filter(Boolean);
      if (!images.length) throw new Error(r.note || 'No page images could be made from this file.');
      res = await St.sample.json(FIN_AI_PROMPT, { modelTier: 'default', images });
      if ((r.scannedPages || []).length > images.length) toast(`Only the first ${images.length} pages were read.`);
    }
    const rows = (res && res.rows) || [];
    const grid = [['Date', 'Description', 'Debit', 'Credit', 'Amount', 'Balance', 'Reference']].concat(rows.map(x => [x.date || '', x.description || '', x.debit || '', x.credit || '', x.amount || '', x.balance || '', x.ref || '']));
    const pn = v => { const n = FIN.parseNum(v ?? ''); return n ? n.n : null; };
    it.ai = { grid, unclear: rows.map(x => !!x.unclear), meta: { account: res.account || '', currency: /^[A-Z]{3}$/.test(res.currency || '') ? res.currency : '', opening: pn(res.opening), closing: pn(res.closing), periodText: res.periodFrom && res.periodTo ? [res.periodFrom, res.periodTo] : null } };
    it.meta0 = it.ai.meta; it.method = 'claude'; it.state = 'ready';
    if (!it.acct) it.acct = finGuessAcct(it.ai.meta, it.name);
    finParse(it);
  } catch (e) { toast('Claude could not read it: ' + (e.message || e.code || e), { err: true }); }
  it.busy = false; render();
}

/* --- saving what the review decided --- */
const FIN_ROW_LABEL = { new: 'New', dup: 'Already recorded', update: 'Update', review: 'Check', incomplete: 'Incomplete' };
const FIN_FLAG = { no_date: 'no readable date', no_year: 'date without a year', no_amount: 'no readable amount', direction_unknown: 'in or out not shown', balance_mismatch: 'running balance does not add up', no_description: 'no description', both_sides: 'debit and credit both filled', read_by_claude: 'read by Claude', unclear: 'Claude was unsure' };
function finRowDecision(it, i) {
  const r = it.rows[i], d = it.decide[i];
  if (r.act === 'new') return it.keep[i] === false ? 'skip' : 'new';
  if (r.act === 'incomplete') return it.keep[i] === false ? 'skip' : 'incomplete';
  if (r.act === 'update') return it.keep[i] === false ? 'same' : 'update';
  if (r.act === 'review') return d || 'hold';
  return 'same';
}
function finCommit(it) {
  const p = finP();
  let acct = it.acct;
  if (!acct) {
    const n = it.newAcct || {}; if (!n.name) { toast('Name the new account first.', { err: true }); return; }
    acct = E.uid('ac'); const a = { id: acct, name: n.name.trim(), bank: (n.bank || '').trim(), kind: n.kind || 'current', currency: n.currency || it.meta.currency || p.base, number: (it.meta.account || '').slice(-14), owner: 'me', holder: 'me', createdAt: nowISO() };
    finSave(q => { q.accounts.push(a); }); it.acct = acct;
  }
  const a = finAcct(acct) || { currency: p.base }, bid = E.uid('st'), at = nowISO(), add = [], ch = new Map(), pending = [], userSkipped = [];
  const src = r => ({ b: bid, f: it.name, r: r.r, raw: r.raw, h: it.hash });
  const touch = id => { if (!ch.has(id)) { const o = FS.by.get(id); if (o) ch.set(id, clone(o)); } return ch.get(id); };
  const addSrc = (t, r) => { const s = src(r); const all = [t.src, ...(t.srcs || [])].filter(Boolean); if (!all.some(x => x.h && x.h === s.h && x.r === s.r)) t.srcs = [...(t.srcs || []), s]; };
  const mkNew = (r, i, incomplete) => {
    const dir = it.dirs[i]; let amount = r.amount; const flags = r.flags.filter(f => f !== 'dup' && f !== 'maybe_dup');
    if (dir && typeof amount === 'number') { amount = dir === 'in' ? Math.abs(amount) : -Math.abs(amount); const k = flags.indexOf('direction_unknown'); if (k >= 0) flags.splice(k, 1); }
    const c = it.cats[i] ? { cat: it.cats[i], src: 'manual', review: false } : r.cls || { cat: amount > 0 ? 'other_inc' : 'other_exp', review: true };
    return { id: E.uid('tx'), acct, date: r.date, desc: r.desc, amount: typeof amount === 'number' ? amount : null, currency: r.currency || a.currency, balance: r.balance, ref: r.ref || '', cat: c.cat, sub: c.sub || '', catSrc: it.cats[i] ? 'manual' : c.src, party: c.party || '', holding: c.holding || '',
      review: !!(incomplete || c.review || flags.some(f => ['balance_mismatch', 'unclear', 'read_by_claude', 'no_year'].includes(f))), flags, src: src(r), createdAt: at, hist: [{ at, f: 'created', from: null, to: it.name, why: it.method === 'claude' ? 'imported (read by Claude)' : 'imported' }] };
  };
  it.rows.forEach((r, i) => {
    const d = finRowDecision(it, i);
    if (d === 'skip') { userSkipped.push({ r: r.r, raw: r.raw, why: 'left out by you in the review' }); return; }
    if (d === 'new') { add.push(mkNew(r, i)); return; }
    if (d === 'incomplete') { add.push(mkNew(r, i, true)); return; }
    if (d === 'hold') { pending.push({ i, r: r.r, raw: r.raw, date: r.date, desc: r.desc, amount: r.amount, balance: r.balance, ref: r.ref, currency: r.currency, match: r.match, why: r.why, conflicts: r.conflicts, flags: r.flags }); return; }
    const t = r.match && touch(r.match); if (!t) return;
    if (d === 'update') {
      for (const c of [...(r.changes || []), ...(r.conflicts || [])]) {
        if (c.f === 'date2') { t.dates = [...new Set([...(t.dates || []), c.to])]; finHist(t, 'other date', null, c.to, `the statement ${it.name} dates it ${c.to}`); continue; }
        if (c.f === 'amount' || c.f === 'date') continue;   // never changed by an import
        if (c.f === 'desc' && !t.desc0) t.desc0 = t.desc;   // the very first wording stays with the record
        finHist(t, c.f, t[c.f] ?? null, c.to, `corrected by ${it.name}`); t[c.f] = c.to;
      }
    }
    addSrc(t, r);
  });
  // a refund reduces the category of the purchase it reverses
  for (const t of add) if (t.cat === 'refund' && !t.rcat) { const c = FIN.refundOf(t, [...finTx(), ...add], finCats()); if (c) t.rcat = c; else t.review = true; }
  // both sides of a transfer / card payment found among all transactions
  const allNow = new Map(FS.by); for (const t of ch.values()) allNow.set(t.id, t); for (const t of add) allNow.set(t.id, t);
  for (const pr of FIN.pairMoves([...allNow.values()], finP().accounts)) {
    const A = add.find(t => t.id === pr.a) || touch(pr.a), B = add.find(t => t.id === pr.b) || touch(pr.b); if (!A || !B) continue;
    for (const [x, y] of [[A, B], [B, A]]) { if (x.catSrc === 'manual' || (finCat(x.cat) || {}).kind === 'third') continue; if (x.cat !== FIN.CODE_CAT[pr.code]) finHist(x, 'cat', x.cat, FIN.CODE_CAT[pr.code], 'other side found in ' + ((finAcct(y.acct) || {}).name || 'another account')); x.cat = FIN.CODE_CAT[pr.code]; x.catSrc = 'pair'; x.pair = y.id; x.review = false; }
  }
  const counts = { reviewed: it.rows.length, added: add.filter(t => FIN.validDate(t.date) && typeof t.amount === 'number').length, dup: it.rows.filter((r, i) => finRowDecision(it, i) === 'same').length, updated: it.rows.filter((r, i) => finRowDecision(it, i) === 'update').length, held: pending.length, incomplete: add.filter(t => !FIN.validDate(t.date) || typeof t.amount !== 'number').length, skippedByYou: userSkipped.length, notTransactions: (it.skipped || []).length };
  finWrite([...add, ...[...ch.values()].map(t => ({ ...t, updatedAt: at }))]);
  const batch = { id: bid, file: it.name, size: it.size, hash: it.hash, kind: it.kind, method: it.method, acct, from: it.period.from, to: it.period.to, opening: it.check.opening, closing: it.check.closing, diff: it.check.diff, mismatches: it.check.mismatches, counts, at, sheet: it.sheet || '',
    // every line and what happened to it, so a skipped repeat is as traceable as an added one
    lines: it.rows.slice(0, 3000).map((r, i) => { const d = finRowDecision(it, i), t = add.find(x => x.src && x.src.r === r.r); return { r: r.r, act: d, id: t ? t.id : r.match || null }; }), skipped: [...(it.skipped || []), ...userSkipped].slice(0, 500), pending, seenBefore: (it.seen || []).map(b => b.id) };
  colPut('finbatch', batch);
  finLog('import', { batch: bid, file: it.name, counts });
  UI.fin.report = { file: it.name, counts, acct };
  // keep the original statement with its import (private to you while this page is private)
  if (p.keepOriginals && St.assets && typeof afStore === 'function') afStore(it.name, it.bytes).then(r => { const b = St.cols.finbatch.get(bid); if (b) colPut('finbatch', { ...b, asset: r.id, wrapped: r.wrapped }); }).catch(e => { const b = St.cols.finbatch.get(bid); if (b) colPut('finbatch', { ...b, assetError: e && e.code === 'too_large' ? 'over 20 MB' : 'could not be stored' }); });
  UI.fin.imp.files.splice(UI.fin.imp.cur, 1); UI.fin.imp.cur = 0;
  render();
}
// a line held for review: decide later
function finResolve(bid, idx, how) {
  const b = clone(St.cols.finbatch.get(bid)); if (!b) return; const pr = b.pending[idx]; if (!pr || pr.done) return;
  const at = nowISO(), r = { ...pr, raw: pr.raw }, src = { b: bid, f: b.file, r: pr.r, raw: pr.raw, h: b.hash };
  if (how === 'new') {
    const p = finP(), c = FIN.classify({ desc: pr.desc, amount: pr.amount || 0 }, { rules: p.rules, cats: finCats(), parties: p.parties, holdings: p.holdings });
    finWrite([{ id: E.uid('tx'), acct: b.acct, date: pr.date, desc: pr.desc, amount: pr.amount, currency: pr.currency || (finAcct(b.acct) || {}).currency, balance: pr.balance, ref: pr.ref || '', cat: c.cat, catSrc: c.src, party: c.party || '', holding: c.holding || '', review: c.review, flags: (pr.flags || []).filter(f => f !== 'dup' && f !== 'maybe_dup'), src, createdAt: at, hist: [{ at, f: 'created', from: null, to: b.file, why: 'imported after your review: a separate transaction' }] }]);
    b.counts.added++;
  } else if (pr.match && FS.by.get(pr.match)) {
    const t = clone(FS.by.get(pr.match));
    if (how === 'update') for (const c of pr.conflicts || []) { if (c.f === 'amount' || c.f === 'date') { finHist(t, c.f, t[c.f], c.to, `you confirmed the correction in ${b.file}`); t[c.f] = c.to; } else { finHist(t, c.f, t[c.f] ?? null, c.to, `corrected by ${b.file}`); t[c.f] = c.to; } }
    t.srcs = [...(t.srcs || []), src]; finWrite([t]);
    if (how === 'update') b.counts.updated++; else b.counts.dup++;
  }
  b.pending[idx] = { ...pr, done: how, at }; b.counts.held = b.pending.filter(x => !x.done).length;
  colPut('finbatch', b); finLog('review decision', { batch: bid, line: pr.r, decision: how });
  render();
}
function finUndoImport(bid) {
  const b = St.cols.finbatch.get(bid); if (!b) return;
  const made = finTx().filter(t => t.src && t.src.b === bid), touched = finTx().filter(t => (t.srcs || []).some(s => s.b === bid));
  if (!confirm(`Undo the import of ${b.file}? ${made.length} transaction${made.length === 1 ? '' : 's'} it added will be removed (corrections it made stay in their history).`)) return;
  finLog('import undone', { batch: bid, file: b.file, tx: made });
  finWrite(touched.map(o => { const t = clone(o); t.srcs = (t.srcs || []).filter(s => s.b !== bid); return t; }), made.map(t => t.id));
  colPut('finbatch', { ...b, undone: nowISO() });
  render(); toast('Import undone.');
}

/* --- the section --- */
FIN_VIEW.import = () => {
  const I0 = UI.fin.imp = UI.fin.imp || { files: [], cur: 0 }, it = I0.files[I0.cur], rep = UI.fin.report;
  const batches = colList('finbatch').sort((a, b) => b.at.localeCompare(a.at));
  const pend = batches.flatMap(b => (b.pending || []).map((x, i) => ({ b, x, i })).filter(o => !o.x.done));
  return `${rep ? `<div class="callout fin-report"><b>Imported ${esc(rep.file)}</b><div class="fin-chips">${finChip('Lines reviewed', rep.counts.reviewed)}${finChip('Added', rep.counts.added, 'ok')}${finChip('Already recorded — skipped', rep.counts.dup)}${finChip('Updated with corrections', rep.counts.updated)}${finChip('Held for your decision', rep.counts.held, rep.counts.held ? 'warn' : '')}${finChip('Kept as incomplete', rep.counts.incomplete, rep.counts.incomplete ? 'warn' : '')}${rep.counts.skippedByYou ? finChip('Left out by you', rep.counts.skippedByYou) : ''}</div><button class="icon-btn" data-act="fin-report-x" aria-label="Close">${I.x}</button></div>` : ''}
  ${it ? finReviewHTML(it, I0) : `<section class="card fin-card fin-drop">
    <h2>Import bank and card statements</h2>
    <p class="small muted">CSV, Excel and PDF statements with text are read on this device. Each line is compared with what is already recorded: a statement imported twice, or a longer one that repeats earlier months, adds only the transactions that are new. You see every line before anything is saved.</p>
    <label class="btn primary">Choose statement files<input type="file" multiple accept=".csv,.txt,.tsv,.xlsx,.xls,.xlsm,.ods,.pdf,.png,.jpg,.jpeg,.webp" data-chg="fin-files" hidden></label>
    <button class="btn ghost" data-act="fin-new-tx">Or add a transaction by hand</button>
  </section>`}
  ${pend.length ? `<section class="card fin-card"><h2>Held for your decision (${pend.length})</h2><p class="small muted">These lines might already be recorded. Nothing is added until you choose.</p>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Statement</th><th>Line</th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Why</th><th>Recorded one</th><th></th></tr></thead><tbody>${pend.map(({ b, x, i }) => { const m = x.match && FS.by.get(x.match); return `<tr><td class="small">${esc(b.file)}</td><td>${x.r}</td><td class="nowrap">${fday(x.date)}</td><td>${esc(x.desc)}</td><td class="num">${fmc(x.amount)}</td><td class="small">${esc(x.why)}</td><td class="small">${m ? `<button class="linkish" data-act="fin-edit" data-id="${esc(m.id)}">${fday(m.date)} · ${esc(FIN.cleanDesc(m.desc))} · ${fm(m.amount)}</button>` : '—'}</td>
      <td class="nowrap"><button class="btn sm" data-act="fin-resolve" data-b="${esc(b.id)}" data-i="${i}" data-how="same">Same one — skip</button>${(x.conflicts || []).length ? `<button class="btn sm" data-act="fin-resolve" data-b="${esc(b.id)}" data-i="${i}" data-how="update">Correct the recorded one</button>` : ''}<button class="btn sm" data-act="fin-resolve" data-b="${esc(b.id)}" data-i="${i}" data-how="new">A separate transaction</button></td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
  <section class="card fin-card"><h2>Imported statements</h2>${batches.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Imported</th><th>File</th><th>Account</th><th>Period</th><th class="num">Lines</th><th class="num">Added</th><th class="num">Skipped</th><th class="num">Updated</th><th class="num">Held</th><th>Statement check</th><th></th></tr></thead><tbody>
    ${batches.map(b => `<tr class="${b.undone ? 'muted' : ''}"><td class="nowrap small">${fmtDateTime(b.at)}</td><td>${esc(b.file)}${b.method === 'claude' ? ' <span class="fin-tag">read by Claude</span>' : ''}${b.seenBefore && b.seenBefore.length ? ' <span class="fin-tag">same file as before</span>' : ''}</td><td>${esc((finAcct(b.acct) || {}).name || '')}</td><td class="nowrap small">${fday(b.from)} – ${fday(b.to)}</td>
      <td class="num">${b.counts.reviewed}</td><td class="num">${b.counts.added}</td><td class="num">${b.counts.dup}</td><td class="num">${b.counts.updated}</td><td class="num">${b.counts.held || 0}</td>
      <td class="small">${typeof b.diff === 'number' ? (Math.abs(b.diff) < 0.005 ? '✓ opening + lines = closing' : `⚠️ off by ${fm(b.diff)}`) : 'no opening/closing printed'}${b.mismatches ? ` · ${b.mismatches} balance mismatch${b.mismatches === 1 ? '' : 'es'}` : ''}</td>
      <td class="nowrap">${b.asset ? `<a class="btn sm ghost" href="${esc(typeof afUrl === 'function' ? afUrl(b.asset) : '')}" target="_blank" rel="noopener" ${b.wrapped ? `data-act="fin-orig" data-b="${esc(b.id)}"` : ''}>Original</a>` : ''}${b.undone ? 'undone' : `<button class="btn sm ghost" data-act="fin-undo-import" data-b="${esc(b.id)}">Undo</button>`}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">None yet.</p>'}</section>`;
};
const finChip = (l, n, cls = '') => `<span class="fin-chip ${cls}"><b class="num">${n}</b> ${esc(l)}</span>`;
function finReviewHTML(it, I0) {
  const p = finP(), a = finAcct(it.acct);
  const head = `<div class="row fin-rev-h"><h2>${esc(it.name)}</h2>${I0.files.length > 1 ? `<span class="small muted">file ${I0.cur + 1} of ${I0.files.length}</span>` : ''}<span class="spacer"></span><button class="btn ghost" data-act="fin-imp-cancel">Cancel this file</button></div>`;
  if (it.state === 'error') return `<section class="card fin-card">${head}<p class="fin-neg">${esc(it.err)}</p></section>`;
  if (it.state === 'needs-ai') return `<section class="card fin-card">${head}<p>${esc(it.why)}</p>
    <p class="small">Claude can read it: the ${it.kind === 'image' ? 'photo' : 'pages'} will be sent to Claude to copy the lines exactly as printed. Nothing is saved until you check every line, and the running balance is used to catch anything misread.</p>
    ${St.sample ? `<button class="btn primary" data-act="fin-read-ai" ${it.busy ? 'disabled' : ''}>${it.busy ? 'Claude is reading…' : 'Read with Claude'}</button>` : '<p class="muted small">Reading by Claude is not available in this view.</p>'}</section>`;
  const rows = it.rows, c = { reviewed: rows.length, new: 0, dup: 0, update: 0, review: 0, incomplete: 0 }; rows.forEach(r => c[r.act]++);
  const mapEd = it.grid ? `<details class="fin-map"><summary>Columns: ${['date', 'desc', 'debit', 'credit', 'amount', 'balance', 'ref'].filter(k => it.det.map[k] >= 0).map(k => `${k} = “${esc(String((it.det.headerCells || [])[it.det.map[k]] || 'column ' + (it.det.map[k] + 1)))}”`).join(', ')}${it.det.guessed ? ' <b class="fin-neg">(guessed — please check)</b>' : ''}</summary>
    <div class="fin-map-g">${['date', 'desc', 'debit', 'credit', 'amount', 'dir', 'balance', 'ref', 'currency'].map(k => `<label>${{ date: 'Date', desc: 'Description', debit: 'Debit (out)', credit: 'Credit (in)', amount: 'Amount (signed)', dir: 'In/out column', balance: 'Balance', ref: 'Reference', currency: 'Currency' }[k]}<select class="input" data-chg="fin-map" data-k="${k}"><option value="-1">—</option>${(it.grid[Math.max(0, it.det.header)] || []).map((h, j) => `<option value="${j}" ${it.det.map[k] === j ? 'selected' : ''}>${esc(String(it.det.header >= 0 ? h : 'Column ' + (j + 1)) || 'Column ' + (j + 1))}</option>`).join('')}</select></label>`).join('')}
    <label>Dates are<select class="input" data-chg="fin-map" data-k="order"><option value="dmy" ${it.det.order === 'dmy' ? 'selected' : ''}>day/month/year</option><option value="mdy" ${it.det.order === 'mdy' ? 'selected' : ''}>month/day/year</option></select></label>
    <label>Header row<input class="input" type="number" min="0" data-chg="fin-map" data-k="header" value="${it.det.header + 1}"></label></div></details>` : '';
  const nA = it.newAcct || { name: '', bank: '', kind: /card|visa|master/i.test(it.name) ? 'credit_card' : 'current', currency: it.meta.currency || p.base };
  return `<section class="card fin-card">${head}
    <div class="fin-rev-meta">
      <label class="field"><span class="label">Account</span><select class="input" data-chg="fin-imp-acct"><option value="">➕ New account…</option>${p.accounts.map(x => `<option value="${esc(x.id)}" ${x.id === it.acct ? 'selected' : ''}>${esc(x.name)} · ${esc(x.currency)}</option>`).join('')}</select></label>
      ${!it.acct ? `<label class="field"><span class="label">Name</span><input class="input" data-chg="fin-na" data-k="name" value="${esc(nA.name)}" placeholder="e.g. CIB current"></label>
        <label class="field"><span class="label">Bank</span><input class="input" data-chg="fin-na" data-k="bank" value="${esc(nA.bank)}"></label>
        <label class="field"><span class="label">Type</span><select class="input" data-chg="fin-na" data-k="kind">${FIN_AKINDS.map(([k, l]) => `<option value="${k}" ${nA.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Currency</span><select class="input" data-chg="fin-na" data-k="currency">${FIN.CURRENCIES.map(k => `<option ${nA.currency === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>` : ''}
      <div class="small fin-rev-facts">${it.meta.account ? `Account no. on the statement: <b class="mono">${esc(it.meta.account)}</b> · ` : ''}${it.meta.currency ? `Currency: <b>${esc(it.meta.currency)}</b> · ` : ''}Period: <b>${fday(it.period.from)} – ${fday(it.period.to)}</b>${it.method === 'claude' ? ' · <span class="fin-tag">read by Claude — check every line</span>' : ''}<br>
        ${typeof it.check.opening === 'number' ? `Opening ${fm(it.check.opening)} + lines ${fm(it.check.sum)} ${typeof it.check.closing === 'number' ? `= ${fm(it.check.opening + it.check.sum)} vs closing ${fm(it.check.closing)} ${Math.abs(it.check.diff) < 0.005 ? '✓' : `<b class="fin-neg">⚠️ off by ${fm(it.check.diff)}</b>`}` : ''}` : 'No opening/closing balance printed'}${it.check.mismatches ? ` · <b class="fin-neg">${it.check.mismatches} line${it.check.mismatches === 1 ? '' : 's'} where the running balance does not add up</b>` : ''}</div>
    </div>
    ${it.seen && it.seen.length ? `<div class="fin-note">ℹ️ This exact file was imported before (${it.seen.map(b => fmtDateTime(b.at)).join(', ')}). Its lines match what is recorded, so nothing is added twice.</div>` : ''}
    ${(it.overlaps || []).length ? `<div class="fin-note">ℹ️ This statement overlaps ${it.overlaps.map(o => `<b>${esc(o.file)}</b> (${fday(o.from)} – ${fday(o.to)})`).join(', ')}. Lines already recorded from those dates are marked “Already recorded”.</div>` : ''}
    ${mapEd}
    <div class="fin-chips">${finChip('lines read', c.reviewed)}${finChip('new', c.new, 'ok')}${finChip('already recorded', c.dup)}${finChip('updates', c.update)}${finChip('to check', c.review, c.review ? 'warn' : '')}${finChip('incomplete', c.incomplete, c.incomplete ? 'warn' : '')}${(it.skipped || []).length ? finChip('not transactions (totals, balances)', it.skipped.length) : ''}</div>
    <div class="tbl-wrap fin-rev"><table class="tbl"><thead><tr><th>Line</th><th>Result</th><th>Date</th><th>Description</th><th class="num">Amount</th><th class="num">Balance</th><th>Category / decision</th><th>Notes</th></tr></thead><tbody>
    ${rows.map((r, i) => finReviewRow(it, r, i)).join('')}</tbody></table></div>
    ${(it.skipped || []).length ? `<details class="small"><summary>${it.skipped.length} line${it.skipped.length === 1 ? '' : 's'} that are not transactions</summary><ul>${it.skipped.map(s => `<li>line ${s.r}: <span class="mono">${esc(s.raw)}</span> — ${esc(s.why)}</li>`).join('')}</ul></details>` : ''}
    <div class="row end"><span class="small muted">${p.keepOriginals ? 'The original file is kept with this import.' : 'The original file is not kept (Settings).'}</span><span class="spacer"></span><button class="btn primary" data-act="fin-commit">Save — add ${rows.filter((r, i) => ['new', 'incomplete'].includes(finRowDecision(it, i))).length}, update ${rows.filter((r, i) => finRowDecision(it, i) === 'update').length}</button></div>
  </section>`;
}
function finReviewRow(it, r, i) {
  const d = finRowDecision(it, i), m = r.match && FS.by.get(r.match), flags = r.flags.filter(f => FIN_FLAG[f]).map(f => FIN_FLAG[f]);
  const cls = { new: 'ok', dup: '', update: 'med', review: 'warn', incomplete: 'crit' }[r.act];
  let ctl = '';
  if (r.act === 'new' || r.act === 'incomplete') ctl = `<label class="check"><input type="checkbox" data-chg="fin-keep" data-i="${i}" ${d !== 'skip' ? 'checked' : ''}>add</label> <select class="input sm" data-chg="fin-rcat" data-i="${i}" aria-label="Category">${finCatOptions(it.cats[i] || (r.cls && r.cls.cat), null)}</select>${r.cls && r.cls.review && !it.cats[i] ? ' <span class="fin-tag warn">unsure</span>' : ''}${r.flags.includes('direction_unknown') && r.amount !== null ? ` <select class="input sm" data-chg="fin-rdir" data-i="${i}" aria-label="In or out"><option value="">in or out?</option><option value="in" ${it.dirs[i] === 'in' ? 'selected' : ''}>Money in</option><option value="out" ${it.dirs[i] === 'out' ? 'selected' : ''}>Money out</option></select>` : ''}`;
  else if (r.act === 'update') ctl = `<label class="check"><input type="checkbox" data-chg="fin-keep" data-i="${i}" ${d === 'update' ? 'checked' : ''}>apply: ${r.changes.map(c => c.f === 'date2' ? `also dated ${esc(c.to)}` : `${esc(c.f)} ${c.from !== null && c.from !== undefined && c.from !== '' ? `“${esc(String(c.from))}” → ` : ''}“${esc(String(c.to))}”`).join('; ')}</label>`;
  else if (r.act === 'review') ctl = `<select class="input sm" data-chg="fin-decide" data-i="${i}"><option value="hold" ${d === 'hold' ? 'selected' : ''}>Decide later</option><option value="same" ${d === 'same' ? 'selected' : ''}>Same as the recorded one — skip</option>${(r.conflicts || []).length ? `<option value="update" ${d === 'update' ? 'selected' : ''}>Correct the recorded one</option>` : ''}<option value="new" ${d === 'new' ? 'selected' : ''}>A separate transaction — add</option></select>`;
  else ctl = '<span class="muted small">nothing to do</span>';
  return `<tr class="fin-r-${r.act}"><td class="muted">${r.r}</td><td><span class="fin-tag ${cls}">${FIN_ROW_LABEL[r.act]}</span></td><td class="nowrap">${r.date ? fday(r.date) : '<span class="fin-neg">?</span>'}</td><td title="${esc(r.raw)}">${esc(r.desc || '')}</td><td class="num">${r.amount === null ? '<span class="fin-neg">?</span>' : fmc(r.amount)}</td><td class="num">${r.balance === null || r.balance === undefined ? '' : fm(r.balance)}</td><td>${ctl}</td>
    <td class="small">${esc(flags.join(' · '))}${r.why ? `${flags.length ? ' · ' : ''}${esc(r.why)}` : ''}${m ? ` · <button class="linkish" data-act="fin-edit" data-id="${esc(m.id)}">recorded ${finShortId(m.id)}</button>` : ''}</td></tr>`;
}
const FIN_AKINDS = [['current', 'Current account'], ['savings', 'Savings account'], ['credit_card', 'Credit card'], ['cash', 'Cash'], ['investment', 'Investment account'], ['loan', 'Loan']];

async function finAddFiles(list) {
  const I0 = UI.fin.imp = UI.fin.imp || { files: [], cur: 0 }; UI.fin.report = null;
  for (const f of list) { const it = await finReadFile(f); I0.files.push(it); render(); }
}
Object.assign(CHG, {
  'fin-files': el => { const fs = [...(el.files || [])]; el.value = ''; if (fs.length) finAddFiles(fs).catch(e => toast('Could not read: ' + (e.message || e), { err: true })); },
  'fin-imp-acct': el => { const it = UI.fin.imp.files[UI.fin.imp.cur]; it.acct = el.value; if (!it.acct && !it.newAcct) it.newAcct = { name: '', bank: '', kind: /card|visa|master/i.test(it.name) ? 'credit_card' : 'current', currency: it.meta.currency || finP().base }; finParse(it); render(); },
  'fin-na': el => { const it = UI.fin.imp.files[UI.fin.imp.cur]; it.newAcct = { ...(it.newAcct || { name: '', bank: '', kind: 'current', currency: it.meta.currency || finP().base }), [el.dataset.k]: el.value }; if (el.dataset.k === 'kind') finParse(it); render(); },
  'fin-map': el => { const it = UI.fin.imp.files[UI.fin.imp.cur], k = el.dataset.k; if (k === 'order') it.det.order = el.value; else if (k === 'header') { it.det.header = Math.max(-1, +el.value - 1); it.det.headerCells = it.det.header >= 0 ? it.grid[it.det.header].map(String) : []; } else it.det.map[k] = +el.value; it.det.guessed = false; finParse(it); render(); },
  'fin-keep': el => { UI.fin.imp.files[UI.fin.imp.cur].keep[+el.dataset.i] = el.checked; render(); },
  'fin-rcat': el => { UI.fin.imp.files[UI.fin.imp.cur].cats[+el.dataset.i] = el.value; },
  'fin-rdir': el => { UI.fin.imp.files[UI.fin.imp.cur].dirs[+el.dataset.i] = el.value; },
  'fin-decide': el => { UI.fin.imp.files[UI.fin.imp.cur].decide[+el.dataset.i] = el.value; render(); },
});
Object.assign(ACT, {
  'fin-read-ai': () => finReadAI(UI.fin.imp.files[UI.fin.imp.cur]),
  'fin-commit': () => finCommit(UI.fin.imp.files[UI.fin.imp.cur]),
  'fin-imp-cancel': () => { UI.fin.imp.files.splice(UI.fin.imp.cur, 1); UI.fin.imp.cur = 0; render(); },
  'fin-report-x': () => { UI.fin.report = null; render(); },
  'fin-resolve': el => finResolve(el.dataset.b, +el.dataset.i, el.dataset.how),
  'fin-undo-import': el => finUndoImport(el.dataset.b),
  'fin-orig': async (el, e) => { e && e.preventDefault && e.preventDefault(); const b = St.cols.finbatch.get(el.dataset.b); if (!b) return; try { const bytes = await afBytes({ id: b.asset, wrapped: true }); offerFile(b.file, new Blob([bytes])); } catch { toast('The original could not be opened.', { err: true }); } },
});
// statements dropped anywhere on the Money tab go to the importer (the To-do importer keeps its own drop)
document.addEventListener('drop', e => { if (UI.view !== 'finance' || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopImmediatePropagation(); UI.fin.sec = 'import'; finAddFiles([...e.dataTransfer.files]); }, true);
document.addEventListener('dragenter', e => { if (UI.view === 'finance') e.stopImmediatePropagation(); }, true);
