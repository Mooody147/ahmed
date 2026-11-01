// Talking to the canvas: below the Money canvas you write what changed (or ask), and add statements or screenshots.
// Statements are read here; words and screenshots are read by Claude; every change is applied at once — nothing waits
// for a confirmation — and the canvas redraws with the changed cards glowing. Undo puts everything back as it was.
// Anything unclear (a deposit nobody explained, a repeated payment, a balance that moved, an unreadable line, a line
// that may be a repeat) is settled the same way: Claude decides, the decision is logged, and you can change it.
addCols('fintalk');   // the conversation and Claude's decisions, apart from the settings (each document has a size limit)
UI.fin.talk = { text: '', files: [], busy: false, live: null };
const finTalkDoc = id => St.cols.fintalk.get(id) || { id, items: [] };
const finAutoLog = () => finTalkDoc('log').items;
function finLogAdd(list) { const d = clone(finTalkDoc('log')); d.items = [...d.items, ...list].slice(-200); colPut('fintalk', d); }
UI.fin.undo = new Map(); UI.fin.fixTried = new Set();

/* --- undo: what the Money data looked like before a change --- */
function finSnapshot() { return { at: nowISO(), prefs: clone(St.cols.prefs.get('finance') || null), cols: Object.fromEntries(['fintx', 'finbatch', 'finbal'].map(n => [n, colList(n).map(d => clone(d))])) }; }
function finUndoTo(s) {
  if (s.prefs) colPut('prefs', clone(s.prefs));
  // what was decided after that moment is undone too
  const lg = finTalkDoc('log'); if (lg.items.some(x => x.at >= s.at)) colPut('fintalk', { ...clone(lg), items: lg.items.filter(x => x.at < s.at) });
  for (const [n, docs] of Object.entries(s.cols)) {
    const keep = new Set(docs.map(d => d.id));
    for (const d of colList(n)) if (!keep.has(d.id)) colDel(n, d.id);
    for (const d of docs) { const cur = St.cols[n].get(d.id); if (!cur || cur.updatedAt !== d.updatedAt) colPut(n, clone(d)); }
  }
  finNow.k = null; FS.key = '';
}
// a change you asked for happens at once; the message that used to ask first now offers Undo
function finAsk(msg) { const s = finSnapshot(); setTimeout(() => toast(String(msg).split('?')[0].trim() + ' — done.', { action: 'Undo', fn: () => { finUndoTo(s); render(); } }), 0); return true; }

/* --- the conversation --- */
const finTalkFeed = () => finTalkDoc('feed').items;
function finTalkPush(m) { const d = clone(finTalkDoc('feed')); const x = { ...m, text: String(m.text || '').slice(0, 1200), reply: String(m.reply || '').slice(0, 1000), notes: (m.notes || []).slice(0, 10).map(n => String(n).slice(0, 200)), done: (m.done || []).slice(0, 12).map(n => String(n).slice(0, 160)) }; d.items = [...d.items, x].slice(-40); colPut('fintalk', d); }
function finTalkAdd(files) { for (const f of files) UI.fin.talk.files.push({ file: f, name: f.name, type: f.type || '' }); render(); }
function finTalkMsg(m, live) {
  if (m.who === 'edit') { const last = finTalkFeed().filter(x => x.who !== 'you' && x.undoable).pop(), can = !m.undone && last && last.id === m.id && UI.fin.undo.has(m.id);
    return `<div class="fin-msg edit"><div class="fin-bub"><span>✎ On the canvas: ${esc(m.text)}</span>${m.undone ? ' <span class="small muted">↩ Undone.</span>' : can ? ` <button class="btn sm ghost" data-act="fin-talk-undo" data-id="${esc(m.id)}">↩ Undo</button>` : ''}</div></div>`; }
  if (m.who === 'you') return `<div class="fin-msg you"><div class="fin-bub">${m.about ? `<span class="fin-about-tag">about ${esc(m.about)}</span>` : ''}${m.text ? esc(m.text) : ''}${(m.files || []).length ? `<div class="fin-msg-files">${m.files.map(f => `<span class="fin-tag">📎 ${esc(f)}</span>`).join('')}</div>` : ''}</div></div>`;
  const last = finTalkFeed().filter(x => x.who !== 'you' && x.undoable).pop(), canUndo = !live && !m.undone && m.undoable && last && last.id === m.id && UI.fin.undo.has(m.id);
  return `<div class="fin-msg claude ${live ? 'live' : ''}"><span class="fin-av" aria-hidden="true">🤖</span><div class="fin-bub">
    ${live ? `<p class="fin-working"><span class="fin-dots" aria-hidden="true"></span>${esc(m.status || 'Working…')}</p>` : ''}
    ${m.reply ? `<p>${esc(m.reply)}</p>` : ''}
    ${(m.changes || []).length ? `<div class="fin-chips">${m.changes.map(c => `<button class="fin-chip" data-act="fin-cv-goto" data-id="${esc(c.id)}" title="Show it on the canvas">${esc(c.label)}${c.val ? ` · <b>${esc(c.val)}</b>` : ''}</button>`).join('')}</div>` : ''}
    ${(m.done || []).length ? `<p class="small">✓ ${esc(m.done.join(' · '))}</p>` : ''}
    ${(m.notes || []).length ? `<ul class="small fin-notes-l">${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${!live && !m.reply && !(m.changes || []).length && !(m.done || []).length && !(m.notes || []).length ? '<p class="small muted">Nothing needed changing.</p>' : ''}
    ${m.undone ? '<p class="small muted">↩ Undone.</p>' : canUndo ? `<button class="btn sm ghost" data-act="fin-talk-undo" data-id="${esc(m.id)}">↩ Undo</button>` : ''}
  </div></div>`;
}
function finTalkHTML() {
  const T = UI.fin.talk, feed = finTalkFeed().slice(-14);
  return `<div class="fin-talk" id="fin-talk">
    <div class="fin-talk-feed" id="fin-talk-feed" aria-live="polite">${feed.length || T.live ? feed.map(m => finTalkMsg(m)).join('') + (T.live ? finTalkMsg(T.live, true) : '')
      : `<p class="small muted fin-talk-empty">Tell the canvas what changed — “my salary is 36,000 from November”, “Primary balance today 21,000”, “the 10,000 on the 28th is Ali’s”, “I want a laptop for 40,000 by March”, “I paid 600 for dinner in cash” — or ask “how much did I spend on food in September?”. Add statements or screenshots with 📎. It updates at once, and Undo is always there.</p>`}</div>
    ${typeof finAboutChipHTML === 'function' ? finAboutChipHTML() : ''}
    <div class="fin-talk-in">
      <label class="btn fin-talk-att" title="Add statements or screenshots"><span aria-hidden="true">📎</span><span class="sr">Add statements or screenshots</span><input type="file" multiple accept="image/*,.pdf,.csv,.xls,.xlsx,.txt" data-chg="fin-talk-files" hidden></label>
      <div class="fin-talk-box">${T.files.length ? `<div class="fin-talk-files">${T.files.map((f, i) => `<span class="fin-tag">${esc(f.name)} <button class="icon-btn" data-act="fin-talk-file-x" data-i="${i}" aria-label="Remove ${esc(f.name)}">${I.x}</button></span>`).join('')}</div>` : ''}
        <textarea class="input" id="fin-talk-in" rows="2" placeholder="${T.about ? 'Tell the canvas about ' + esc(E.clip(T.about.label, 40)) + ' — or ask about it…' : 'Tell the canvas what changed, or ask about your money…'}" aria-label="Tell the canvas">${esc(T.text)}</textarea></div>
      <button class="btn primary fin-talk-send" data-act="fin-talk-send" ${T.busy ? 'disabled' : ''}>${T.busy ? 'Working…' : 'Send'}</button>
    </div></div>`;
}

// what kind of statements these are, from your words (otherwise each file tells by itself)
// only words that clearly mean a credit card (or Halan) set the kind; a debit card, an account, an account number, or
// saying it is not a credit card leaves each file to tell by itself (its number, its contents)
const finKindFrom = t => { t = String(t || '');
  if (/debit|\bnot\b[^.]{0,20}credit|\bnon[- ]?credit|accounts?\b|\b0*1[23]\b|حساب|خصم|مدين|ليست? (بطاق|كريدت)/i.test(t)) return null;
  return /\bcredit ?cards?\b|\bcredit\b|\bvisa\b|\bmaster ?card\b|ائتمان|كريدت|فيزا/i.test(t) ? 'credit_card' : /halan|حالا/i.test(t) ? 'bnpl' : null; };
const finOnlyKind = t => !String(t || '').replace(/\b(credit|card|cards|visa|master ?card|statements?|bank|accounts?|current|savings?|halan|nbe|cib|ahly|my|this|these|those|is|are|the|from|for|of|please|here|attached|its|it's|a|an|and|all|old|new|last|months?)\b|بطاقة|ائتمان|كشف|حساب|[\s\d.,:;!?'"()\-–—]/gi, '').trim();
const finIsImage = f => /^image\//.test(f.type || '') || /\.(png|jpe?g|webp|heic|heif|gif|bmp)$/i.test(f.name);

// one operation at a time: what you send waits for the automatic sorting to finish
async function finTalkWait() { for (let i = 0; i < 600 && (UI.fin.talk.busy || UI.fin.fixing); i++) await new Promise(r => setTimeout(r, 100)); }
function finTalkLive(status) { const m = { id: E.uid('tk'), at: nowISO(), who: 'claude', status, changes: [], notes: [], done: [] }; UI.fin.talk.live = m; UI.fin.talk.busy = true; render(); return m; }
function finTalkFinish(m, before) {
  // what the change moved on the canvas: those cards glow and are listed
  const after = finCvIndex(), model = new Map(); (function walk(n) { model.set(n.id, n); (n.children || []).forEach(walk); })(finCvModel());
  const moved = [...after.keys()].filter(id => before && before.get(id) !== after.get(id) && id !== 'root');
  m.changes = moved.map(id => model.get(id)).filter(n => n && n.type === 'leaf' && !n.cls.includes('tool') && !n.cls.includes('more')).slice(0, 12).map(n => ({ id: n.id, label: E.clip(n.label, 40), val: n.val || '' }));
  UI.fin.flash = { ids: new Set(moved), until: Date.now() + 7000 };
  m.undoable = !!(m.changes.length || m.done.length || m.decided);
  delete m.status; UI.fin.talk.live = null; UI.fin.talk.busy = false;
  finTalkPush(m);
  for (const k of [...UI.fin.undo.keys()].slice(0, -3)) UI.fin.undo.delete(k);
  render();
}

async function finTalkSend() {
  const T = UI.fin.talk; T.text = ($('#fin-talk-in') || {}).value ?? T.text;
  const text = (T.text || '').trim(), files = T.files.slice(); if (!text && !files.length) return;
  T.text = ''; T.files = [];
  const about = T.about ? { ...T.about } : null;
  finTalkPush({ id: E.uid('tk'), at: nowISO(), who: 'you', text, files: files.map(f => f.name), ...(about ? { about: about.label } : {}) });
  await finTalkWait();
  const snap = finSnapshot(), before = finCvIndex(), m = finTalkLive(files.length ? 'Reading what you added…' : 'Claude is reading…');
  UI.fin.undo.set(m.id, snap);
  try {
    const stm = about ? [] : files.filter(f => !finIsImage(f)), imgs = files.filter(finIsImage);
    if (about && files.some(f => !finIsImage(f))) m.notes.push('Statements are read for the whole canvas — add them with the card chip removed. Screenshots went with your message.');
    if (stm.length) {
      m.status = `Reading ${stm.length} statement${stm.length === 1 ? '' : 's'}…`; render();
      const q0 = (UI.fin.queue || []).length; await finAuto(stm.map(f => f.file), finKindFrom(text));
      const res = (UI.fin.queue || []).slice(0, (UI.fin.queue || []).length - q0).reverse();
      res.forEach((q, i) => {
        if (q.state === 'done') m.done.push(`${q.name}: ${q.counts.added} added${q.counts.dup ? `, ${q.counts.dup} already there` : ''}${q.counts.updated ? `, ${q.counts.updated} corrected` : ''}`);
        else if (/\.pdf$/i.test(q.name) && stm[i]) imgs.push(stm[i]); // a PDF without statement lines is read like a screenshot
        else m.notes.push(`${q.name}: ${q.msg || 'could not be read'}`);
      });
    }
    if ((text && !finOnlyKind(text)) || imgs.length) {
      if (!St.sample) m.notes.push('Claude is not available here, so only the statements were read.');
      else { m.status = 'Claude is reading…'; render(); await finTalkClaude(m, text, imgs, about); }
    }
    if (about) m.about = about.label;
    m.status = 'Sorting out anything unclear…'; render();
    const dec = about ? [] : await finAutoFix(true); if (dec.length) { m.decided = dec.length; m.notes.push(...dec.slice(0, 6).map(d => `${d.label}: ${d.how}`)); if (dec.length > 6) m.notes.push(`and ${dec.length - 6} more — see “Sorted by Claude”`); }
  } catch (e) { console.error(e); m.notes.push('Something went wrong (' + (e.message || e) + '). Nothing was lost — try again.'); }
  finTalkFinish(m, before);
}

/* --- Claude reads your words and screenshots; the change is applied straight away --- */
const FIN_TALK_RULES = `
YOU ARE TALKING WITH THE OWNER THROUGH THEIR MONEY CANVAS. Besides the fields above, the JSON may also have:
"transactions":[{"account":"id from accounts; when the owner names no account use the one marked default; null only when it was paid in cash","cash":true when paid in cash,"date":"YYYY-MM-DD","amount":number (negative = money out),"desc":"","category":"id from categories"}] — money the owner says they spent or received that no statement shows yet,
"goalUpdates":[{"id":"id from purchaseGoals","bought":true or false,"delete":true or false,"price":number or null,"wantBy":"YYYY-MM-DD or null","priority":1-3 or null}],
"view":{"open":"dash|update|import|ledger|exp|inc|budget|sim|forecast|buy|credit|accounts|own|settings or null","focus":"accts|inc|exp|com|own|third|buy or null","dir":"h|v|null"},
"notes":["one short line for each thing you assumed or could not do"],
"reply":"one or two sentences to the owner, in the language they wrote in"
Rules for talking: never ask the owner anything back and leave "questions" empty — when a sentence can be read more than one way, take the most likely reading, apply it and say what you assumed in "notes". Never make up an amount or a date the owner did not give or show. A question about their money ("how much did I spend on food in September?") is answered in "reply" from CURRENT RECORDS and changes nothing. When they ask to see or open a part, use "view".`;
function finTalkContext() {
  const n = finNow(), all = finAll(), own = finPosition();
  return { ...finDraftContext(), categories: finCats().map(c => ({ id: c.id, name: c.name, kind: c.kind })),
    position: { cash: n.cash, freeCash: n.free, incomeMonthly: n.income, usualSpendingMonthly: n.spending, savingMonthly: n.capacity, instalmentsMonthly: n.instMonthly, card: n.card ? { owed: n.card.owed ?? null, available: n.card.available ?? null, limit: n.card.limit ?? null } : null, netWorth: own.net },
    months: all.months.slice(-6).map(b => ({ month: b.m, income: b.inc, expenses: b.exp, byCategory: Object.fromEntries(Object.entries(b.byCat || {}).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => [(finCat(k) || { name: k }).name, FIN.r2(v)])) })) };
}
async function finTalkClaude(m, text, imgs, about) {
  const lim = St.limits && St.limits.images, images = [];
  for (const f of imgs.slice(0, lim ? lim.maxCount || 10 : 10)) { try { const bytes = new Uint8Array(await f.file.arrayBuffer()); const r = await E.extract({ name: f.name, bytes }, { vision: true, maxImageBytes: lim ? lim.maxInputBytes : 0, maxPageImages: 4 }); for (const im of r.images || []) if (im.blob) images.push(im.blob); } catch (e) { m.notes.push(`${f.name}: could not be opened`); } }
  const r = await St.sample.json(FIN_DRAFT_PROMPT(finTalkContext()) + FIN_TALK_RULES + (about ? FIN_ABOUT_RULES(about) : '') + '\n\nOWNER’S MESSAGE:\n' + (text || '(only screenshots)'), { modelTier: 'default', ...(images.length ? { images } : {}) }) || {};
  const P = finDraftCheck(r);
  // about one card: only what concerns that card is applied; the rest is listed
  if (about) { const out = finAboutScope(about, P, r); if (out.length) m.notes.push('Kept to ' + about.label + ' — not changed: ' + out.join(', ') + '.'); }
  m.done.push(...finDraftApply(P, { text, files: imgs }));
  r._balAccts = new Set((P.balances || []).filter(b => b.account).map(b => b.account + '|' + b.date));   // a balance given in the same message already includes what it mentions
  m.done.push(...finTalkExtras(r));
  // Claude was told not to ask; anything it still asked is kept as a note, never as a stop
  m.notes.push(...P.questions.map(q => q.text), ...(Array.isArray(r.notes) ? r.notes.filter(x => typeof x === 'string').slice(0, 8) : []));
  if (typeof r.reply === 'string') m.reply = r.reply.slice(0, 800);
  const v = r.view || {};
  if (v.dir === 'h' || v.dir === 'v') { UI.fin.cv.dir = v.dir; finCvKeep(); UI.fin.cv.fitted = false; }
  if (v.focus && ['accts', 'inc', 'exp', 'com', 'own', 'third', 'buy'].includes(v.focus)) { UI.fin.cv.focus = v.focus; UI.fin.cv.fitted = false; }
  if (v.open && FIN_VIEW[v.open]) { if (v.open === 'buy') UI.fin.goto = 'buy'; else { finSetOpen('sec:' + v.open, true); UI.fin.goto = 'sec:' + v.open; } }
}
// money you mentioned and changes to your goals
function finTalkExtras(r) {
  const done = [], at = nowISO(), today = finToday(), num = v => typeof v === 'number' ? v : (FIN.parseNum(String(v ?? '')) || {}).n ?? null;
  const add = [];
  for (const x of Array.isArray(r.transactions) ? r.transactions : []) {
    const amount = num(x.amount); if (!amount) continue;
    let acct = x.account && finAcct(x.account) ? x.account : null;
    // no account named: cash when it says cash, otherwise your default account
    if (!acct && !x.cash && !/\bcash\b|كاش|نقد|نقدا|نقدي/i.test(String(x.desc || ''))) { const d = finDefAcct(); if (d) acct = d.id; }
    if (!acct) { const cash = finP().accounts.find(a => a.kind === 'cash'); if (cash) acct = cash.id; else { acct = E.uid('ac'); finSave(q => { q.accounts.push({ id: acct, name: 'Cash', kind: 'cash', currency: q.base, owner: 'me', holder: 'me', createdAt: at }); }); } }
    const date = FIN.validDate(x.date) ? x.date : today, desc = String(x.desc || 'From what you told the canvas').slice(0, 140);
    if (finTx().some(t => t.acct === acct && t.date === date && Math.abs(t.amount - amount) < 0.01 && FIN.norm(t.desc || '') === FIN.norm(desc))) continue;
    const cat = finCat(x.category) ? x.category : FIN.classify({ desc, amount }, { rules: finP().rules, cats: finCats(), parties: finP().parties, holdings: finP().holdings }).cat;
    add.push({ id: E.uid('tx'), acct, date, desc, amount, currency: (finAcct(acct) || {}).currency || finP().base, cat, catSrc: 'claude', manual: true, flags: ['from_talk', ...(r._balAccts && r._balAccts.has(acct + '|' + date) ? ['in_balance'] : [])], src: { f: '', manual: true, talk: true }, createdAt: at, hist: [{ at, f: 'created', to: 'from what you told the canvas', why: desc }] });
    done.push(`${desc} ${fm(amount)}`);
  }
  if (add.length) finWrite(add);
  const ups = (Array.isArray(r.goalUpdates) ? r.goalUpdates : []).filter(u => u && u.id && (finP().buys || []).some(b => b.id === u.id));
  if (ups.length) finSave(q => { for (const u of ups) { const i = q.buys.findIndex(b => b.id === u.id), b = q.buys[i]; if (u.delete) { q.buys.splice(i, 1); done.push(`removed goal ${b.name}`); continue; } if (u.bought) { b.done = today; done.push(`${b.name} bought`); } const pr = num(u.price); if (pr) b.price = Math.abs(pr); if (FIN.validDate(u.wantBy)) b.wantBy = u.wantBy; if ([1, 2, 3].includes(+u.priority)) b.priority = +u.priority; if (pr || u.wantBy || u.priority) done.push(`goal ${b.name} updated`); } });
  return done;
}

/* --- settling what is unclear, without asking --- */
function finOpenItems() {
  const p = finP(); if (p.autoFix === false) return [];
  const out = [];
  for (const b of colList('finbatch')) if (!b.undone) (b.pending || []).forEach((r, i) => { if (!r.done) out.push({ id: `hold:${b.id}:${i}`, kind: 'hold', b, i, r }); });
  for (const q of finQuestions()) out.push({ id: 'q:' + q.id, kind: q.kind === 'deposit' ? 'deposit' : q.kind === 'inst' ? 'instalment' : q.kind === 'balance' ? 'balance' : 'note', q });
  for (const t of finTx()) { if (finStatus(t) === 'incomplete' && !t.ack) out.push({ id: 'bad:' + t.id, kind: 'unreadable', t }); else if (t.review) out.push({ id: 'rv:' + t.id, kind: 'review', t }); }
  for (const x of finAll().noRate || []) out.push({ id: 'rate:' + x.cur, kind: 'rate', cur: x.cur });
  return out.filter(x => !UI.fin.fixTried.has(x.id));
}
const FIN_FIX_PROMPT = ctx => `You keep a personal finance ledger in order for its owner without bothering them. Decide every item below — never leave one open and never ask anything. Today is ${ctx.today}; amounts in ${ctx.base}.
CONTEXT: ${JSON.stringify(ctx)}
Return JSON only: {"decisions":[{"id":"item id","how":"see below","category":"category id or null","person":"name or null","remaining":number or null,"date":"YYYY-MM-DD or null","amount":number or null,"rate":number or null,"why":"a few words"}]}
- kind "deposit" (money that came in, purpose unknown): how = "income" (the owner's own income — give an income category) | "own" (from another account of theirs) | "invest" (a return on an investment) | "theirs" (belongs to someone else — give person; a transfer from a named person who is not the owner is usually theirs).
- kind "instalment" (the same amount paid every month): how = "active" (still running; remaining = payments left when "x OF y" shows it, else null) | "ended" (only when the lines clearly show the last payment) | "notInstalment" (a subscription or bill). Never decide an instalment ended just because it is missing for a month.
- kind "balance" (a balance moved by an amount no statement explains): how = "spend" (give an expense category) | "income" | "theirs" (give person).
- kind "review" (category unsure): how = "keep" or "recat" with category.
- kind "unreadable" (a statement line whose date or amount could not be read): give date and amount (negative = out) only when the raw text clearly shows them, else how = "ignore".
- kind "note" (a question asked earlier): how = "noted", with your best answer in why.
- kind "rate" (a currency without an exchange rate): rate = your best recent estimate of 1 unit in ${ctx.base}.`;
function finFixContext(items) {
  const p = finP(), today = finToday(), acct = id => (finAcct(id) || {}).name || '';
  const tx = t => ({ date: t.date, amount: t.amount, account: acct(t.acct), desc: FIN.cleanDesc(t.desc || ''), raw: t.src && t.src.raw ? String(t.src.raw).slice(0, 200) : undefined, category: t.cat });
  return { today, base: p.base, people: p.parties.map(x => x.name), accounts: p.accounts.map(a => ({ name: a.name, kind: a.kind })), categories: finCats().map(c => ({ id: c.id, name: c.name, kind: c.kind })),
    items: items.map(it => it.kind === 'deposit' ? { id: it.id, kind: it.kind, ...tx(FS.by.get(it.q.tx) || {}) }
      : it.kind === 'instalment' ? { id: it.id, kind: it.kind, text: finTxt(it.q.text), ...(() => { const i = finNow().inst.find(x => x.key === it.q.key) || {}; return { name: i.name, amount: i.amount, paid: i.n, of: i.of, last: i.last, status: i.status }; })() }
      : it.kind === 'balance' ? { id: it.id, kind: it.kind, account: acct(it.q.acct), date: it.q.date, difference: it.q.diff }
      : it.kind === 'review' || it.kind === 'unreadable' ? { id: it.id, kind: it.kind, ...tx(it.t) }
      : it.kind === 'rate' ? { id: it.id, kind: it.kind, currency: it.cur } : { id: it.id, kind: it.kind, text: finTxt(it.q.text) }) };
}
// the latest saved version of a transaction (the cache refreshes when the list is read)
const finFresh = id => (finTx(), FS.by.get(id));
const finPartyId = name => { if (!name) return ''; const x = finP().parties.find(z => FIN.norm(z.name) === FIN.norm(name)); if (x) return x.id; const id = E.uid('pt'); finSave(q => { q.parties.push({ id, name: String(name).slice(0, 60), match: '' }); }); return id; };
// one decision, by Claude (d) or by the rule when Claude did not answer
function finFixApply(it, d) {
  const by = d && d.how ? 'claude' : 'rule', why = (d && d.why ? String(d.why) : '').slice(0, 160), at = nowISO(), L = (label, how, sec) => ({ id: E.uid('ad'), at, kind: it.kind, label, how, why, by, sec });
  const okCat = (c, k) => { const x = finCat(c); return x && (!k || x.kind === k) ? c : null; };
  if (it.kind === 'hold') {
    const r = it.r, same = finTx().some(t => t.acct === it.b.acct && typeof r.amount === 'number' && Math.abs(t.amount - r.amount) < 0.01 && r.date && Math.abs(FIN.dnum(t.date) - FIN.dnum(r.date)) <= 3);
    finResolve(it.b.id, it.i, same ? 'same' : 'new');
    return { id: E.uid('ad'), at, kind: 'hold', label: `${r.desc || 'A line'} ${typeof r.amount === 'number' ? fm(r.amount) : ''}`.trim(), how: same ? 'already recorded — not added twice' : 'a new transaction — added', why: same ? 'same amount within 3 days in the same account' : 'no recorded match', by: 'rule', sec: 'import' };
  }
  if (it.kind === 'deposit') {
    const t = finFresh(it.q.tx); if (!t) return null; const x = clone(t);
    const how = d && ['income', 'own', 'invest', 'theirs'].includes(d.how) ? d.how : 'income';
    const cat = how === 'income' ? okCat(d && d.category, 'income') || (t.cat === 'transfer' ? 'other_inc' : t.cat) || 'other_inc' : { own: 'transfer', invest: 'interest', theirs: 'held' }[how];
    finHist(x, 'cat', x.cat, cat, `${by === 'claude' ? 'Claude' : 'automatic'} decision${why ? ': ' + why : ''}`);
    Object.assign(x, { cat, catSrc: by, asked: true, review: false }); if (how === 'theirs') x.party = finPartyId(d && d.person) || x.party || '';
    finWrite([x]);
    return L(`${fm(t.amount)} into ${(finAcct(t.acct) || {}).name || 'an account'} on ${fday(t.date)}`, { income: 'your income', own: 'from your own account', invest: 'investment return', theirs: `${(d && d.person) || 'someone else'}’s money` }[how], how === 'theirs' ? 'own' : 'ledger');
  }
  if (it.kind === 'instalment') {
    const how = d && ['active', 'ended', 'notInstalment'].includes(d.how) ? d.how : 'active', i = finNow().inst.find(x => x.key === it.q.key) || {};
    const rem = d && typeof d.remaining === 'number' ? d.remaining : null;
    finSave(q => { q.installments = (q.installments || []).filter(k => k.key !== it.q.key); q.installments.push({ key: it.q.key, status: how === 'ended' ? 'completed' : how === 'notInstalment' ? 'discontinued' : 'active', remaining: rem, end: null, at, by, note: how === 'notInstalment' ? 'not an instalment' : '' }); });
    return L(i.name || 'A repeated payment', how === 'active' ? `still running${rem !== null ? `, ${rem} left` : ''}` : how === 'ended' ? 'finished' : 'a subscription or bill, not an instalment', 'credit');
  }
  if (it.kind === 'balance') {
    const q = it.q, how = d && ['spend', 'income', 'theirs'].includes(d.how) ? d.how : q.diff < 0 ? 'spend' : 'income';
    finAnswer(q.id, how, { cat: okCat(d && d.category, 'expense') || 'other_exp', party: how === 'theirs' ? finPartyId(d && d.person) : '' });
    return L(`${(finAcct(q.acct) || {}).name}: ${fm(Math.abs(q.diff))} ${q.diff < 0 ? 'less' : 'more'} by ${fday(q.date)}`, how === 'spend' ? `spending (${(finCat(okCat(d && d.category, 'expense') || 'other_exp') || {}).name})` : how === 'income' ? 'money in' : `${(d && d.person) || 'someone else'}’s money`, 'update');
  }
  if (it.kind === 'note') { finAnswer(it.q.id, 'noted', { note: why }); return L(E.clip(finTxt(it.q.text), 80), 'noted', 'update'); }
  if (it.kind === 'review') {
    // always the latest version: another decision in this round may have changed the same transaction
    const cur = finFresh(it.t.id); if (!cur || !cur.review) return null;
    const x = clone(cur), c = d && d.how === 'recat' ? okCat(d.category) : null;
    if (c && c !== x.cat) { finHist(x, 'cat', x.cat, c, 'Claude: ' + why); x.cat = c; x.catSrc = 'claude'; } x.review = false; finWrite([x]);
    if (!c || c === cur.cat) return null;   // a category that stays is not a change worth listing
    return L(`${FIN.cleanDesc(x.desc || '')} ${fm(x.amount)}`, c ? `category ${finCat(c).name}` : 'category kept', 'ledger');
  }
  if (it.kind === 'unreadable') {
    const cur = finFresh(it.t.id); if (!cur) return null;
    const x = clone(cur), amt = d && typeof d.amount === 'number' && d.amount ? d.amount : null, dt = d && FIN.validDate(d.date) ? d.date : null;
    if (amt !== null && dt) { finHist(x, 'fixed', `${x.date || '?'} ${x.amount ?? '?'}`, `${dt} ${amt}`, 'Claude read the line: ' + why); Object.assign(x, { date: dt, amount: amt, flags: (x.flags || []).filter(f => f !== 'direction_unknown'), catSrc: x.catSrc || 'claude' }); }
    else x.ack = true;
    x.review = false;
    finWrite([x]);
    return L(E.clip(FIN.cleanDesc(x.desc || '') || (x.src && x.src.raw) || 'A statement line', 60), amt !== null && dt ? `read as ${fm(amt)} on ${fday(dt)}` : 'left out — it could not be read', 'ledger');
  }
  if (it.kind === 'rate') {
    const v = d && typeof d.rate === 'number' && d.rate > 0 ? d.rate : null; if (v === null) { UI.fin.fixTried.add(it.id); return null; }
    finSave(q => { q.rates = { ...(q.rates || {}), [it.cur]: v }; q.rateSrc = { ...(q.rateSrc || {}), [it.cur]: 'estimate by Claude, ' + finToday() }; });
    return L(`Exchange rate for ${it.cur}`, `1 ${it.cur} = ${v} ${finP().base} (estimate)`, 'settings');
  }
  return null;
}
async function finAutoFix(inTalk) {
  if (UI.fin.fixing) return [];
  const items = finOpenItems(); if (!items.length) return [];
  UI.fin.fixing = true; const out = [];
  try {
    const rest = items.filter(x => x.kind !== 'hold'), ans = {};
    if (rest.length && St.sample && finP().autoAI !== false) {
      try { const r = await St.sample.json(FIN_FIX_PROMPT(finFixContext(rest.slice(0, 60))), { modelTier: 'default' }); for (const d of (r && Array.isArray(r.decisions) ? r.decisions : [])) if (d && d.id) ans[d.id] = d; }
      catch (e) { console.warn('Claude could not sort these; the rules decide', e); }
    }
    // only what is still open now (another change may have settled some while Claude was thinking)
    const open = new Set(finOpenItems().map(x => x.id));
    for (const it of items) { if (!open.has(it.id)) continue; try { const x = finFixApply(it, ans[it.id]); if (x) out.push(x); else UI.fin.fixTried.add(it.id); } catch (e) { console.warn('could not settle', it.id, e); UI.fin.fixTried.add(it.id); } }
    if (out.length) finLogAdd(out);
  } finally { UI.fin.fixing = false; }
  if (!inTalk) render();
  return out;
}

// whenever the Money canvas is open: statements read with an older reader are read again, then anything unclear is settled
HOOKS.afterRender.push(() => {
  if (UI.view !== 'finance' || UI.fin.fixing || UI.fin.talk.busy || UI.fin.autoQ) return;
  if (St.mode === 'db' && St.colsLoaded && !['prefs', 'fintx', 'finbatch'].every(n => St.colsLoaded.has(n))) return;
  if (finJoinDupAccts()) return;   // one account saved twice: joined first (always, it only moves things)
  if (finP().autoFix === false) return;
  const stale = typeof FIN_READER !== 'undefined' ? colList('finbatch').filter(b => !b.undone && (b.reader || 1) < FIN_READER && b.asset) : [];
  if (stale.length && !UI.fin.rereadTried) {
    UI.fin.rereadTried = true;
    UI.fin.autoQ = setTimeout(async () => {
      UI.fin.autoQ = null; if (UI.fin.talk.busy || UI.fin.fixing) { UI.fin.rereadTried = false; return; }
      const before = finCvIndex(), snap = finSnapshot(), m = finTalkLive(`Reading your ${stale.length} statement${stale.length === 1 ? '' : 's'} again with the better reader…`); UI.fin.undo.set(m.id, snap);
      try { await finReread(stale.map(b => b.id), true); m.done.push(`${stale.length} statement${stale.length === 1 ? '' : 's'} read again — debits and credits by column, one account per card`); const dec = await finAutoFix(true); if (dec.length) { m.decided = dec.length; m.notes.push(...dec.slice(0, 6).map(d => `${d.label}: ${d.how}`)); } }
      catch (e) { m.notes.push('Reading them again did not finish (' + (e.message || e) + '). They stay as they were.'); }
      finTalkFinish(m, before);
    }, 400);
    return;
  }
  if (!finOpenItems().length) return;
  UI.fin.autoQ = setTimeout(async () => {
    UI.fin.autoQ = null; if (UI.fin.talk.busy || UI.fin.fixing || UI.view !== 'finance' || !finOpenItems().length) return;
    const before = finCvIndex(), snap = finSnapshot(), m = finTalkLive('Sorting out what is unclear…'); UI.fin.undo.set(m.id, snap);
    const dec = await finAutoFix(true);
    if (dec.length) { m.decided = dec.length; m.reply = `I sorted out ${dec.length} thing${dec.length === 1 ? '' : 's'} by myself:`; m.notes.push(...dec.slice(0, 8).map(d => `${d.label}: ${d.how}`)); if (dec.length > 8) m.notes.push(`and ${dec.length - 8} more — see “Sorted by Claude”`); finTalkFinish(m, before); }
    else { UI.fin.talk.live = null; UI.fin.talk.busy = false; UI.fin.undo.delete(m.id); render(); }
  }, 700);
});
// the conversation stays scrolled to the newest message
HOOKS.afterRender.push(() => { const f = $('#fin-talk-feed'); if (f) f.scrollTop = f.scrollHeight; });

document.addEventListener('input', e => { if (e.target && e.target.id === 'fin-talk-in') UI.fin.talk.text = e.target.value; });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'fin-talk-in' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); finTalkSend(); } });
document.addEventListener('paste', e => { if (!e.target || e.target.id !== 'fin-talk-in' || !e.clipboardData || !e.clipboardData.files.length) return; e.preventDefault(); UI.fin.talk.text = e.target.value; finTalkAdd([...e.clipboardData.files]); });

Object.assign(ACT, {
  'fin-talk-send': () => finTalkSend(),
  'fin-talk-file-x': el => { UI.fin.talk.text = ($('#fin-talk-in') || {}).value ?? UI.fin.talk.text; UI.fin.talk.files.splice(+el.dataset.i, 1); render(); },
  'fin-talk-undo': el => {
    const id = el.dataset.id, s = UI.fin.undo.get(id); if (!s) return;
    finUndoTo(s); UI.fin.undo.delete(id);
    { const d = clone(finTalkDoc('feed')), m = d.items.find(x => x.id === id); if (m) { m.undone = true; colPut('fintalk', d); }
      if (m && m.joined) for (const c of m.joined) (UI.fin.joinSkip = UI.fin.joinSkip || new Set()).add(c); }   // a join you undid is not done again by itself
    UI.fin.fixTried.clear(); UI.fin.flash = { ids: new Set(), until: 0 }; render(); toast('Undone — everything is as it was before.');
  },
  'fin-daily-check': () => { finDailyCheck(); if (finP().autoFix !== false && (UI.fin.daily.preview || []).length) finDailySave(); },
});
Object.assign(CHG, { 'fin-talk-files': el => { const fs = [...(el.files || [])]; el.value = ''; UI.fin.talk.text = ($('#fin-talk-in') || {}).value ?? UI.fin.talk.text; finTalkAdd(fs); } });
Object.assign(window.__FIN, { talk: () => finTalkFeed(), autoLog: () => finAutoLog(), open_items: () => finOpenItems().map(x => x.id), fix: () => finAutoFix() });
