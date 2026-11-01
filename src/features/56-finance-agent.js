// Money canvas — Tell the canvas as an agent: whatever you would explain to Claude in a normal conversation, it
// understands, plans and carries out on the canvas itself. Besides the money it already understood (balances, income,
// transactions, goals, accounts…), it can now shape the canvas: add a box of its own (your recurring payments, your
// latest transactions as a table, spending by category as bars, a note, a group of chosen cards…), change or move or
// remove a box, rename or hide a card, move a card to another branch, rename a branch, create / rename / merge
// categories, move transactions to another category (and keep doing so for new ones), fold or unfold branches,
// switch the view.
// Claude answers with a plan and a list of operations; the canvas checks every operation against your records before
// applying it — nothing it sends is ever run as code — and Undo puts everything back. The conversation is
// remembered, so "make it a table", "only this month", "put it under Liabilities" refer to what came before.

const FIN_BOX_WHAT = ['transactions', 'recurring', 'categories', 'months', 'accounts', 'instalments', 'goals', 'holdings', 'cards', 'text'];
const FIN_BOX_FORMAT = ['table', 'list', 'bars', 'total'];
const FIN_BOX_COLS = ['date', 'desc', 'amount', 'category', 'account', 'balance'];
const FIN_BRANCHES = ['mm-earn', 'mm-pass', 'mm-assets', 'exp', 'mm-liab', 'buy', 'below'];
// a card moved to a branch of the map goes to the room the branch is made from
const FIN_BRANCH_ROOM = { 'mm-earn': 'inc', 'mm-pass': 'own', 'mm-assets': 'own', 'mm-liab': 'com', exp: 'exp', buy: 'buy', accts: 'accts', inc: 'inc', own: 'own', com: 'com', third: 'third' };

const finCanvasP = () => { const c = finP().canvas || {}; return { boxes: c.boxes || [], labels: c.labels || {}, titles: c.titles || {}, hidden: c.hidden || [], moves: c.moves || {} }; };
function finCanvasSave(mut) { finSave(p => { const c = p.canvas = { boxes: [], labels: {}, titles: {}, hidden: [], moves: {}, ...(p.canvas || {}) }; mut(c); }); }

/* --- the canvas as you shaped it: names, hidden cards, cards moved to another branch --- */
function finAgentModel(root) {
  const C = finCanvasP(); if (!Object.keys(C.labels).length && !C.hidden.length && !Object.keys(C.moves).length) return root;
  const hid = new Set(C.hidden), taken = [];
  const walk = n => { if (!n.children) return; n.children = n.children.filter(c => { if (c.type === 'leaf' && hid.has(c.id)) return false; if (c.type === 'leaf' && C.moves[c.id] && C.moves[c.id] !== n.id && root.children.some(b => b.id === C.moves[c.id])) { taken.push(c); return false; } return true; }); n.children.forEach(walk); };
  walk(root);
  for (const c of taken) { const b = root.children.find(x => x.id === C.moves[c.id]); if (b) b.children.push(c); }
  (function rename(n) { if (n.type === 'leaf' && C.labels[n.id]) n.label = C.labels[n.id]; (n.children || []).forEach(rename); })(root);
  return root;
}

/* --- your own boxes: what they show, worked out from your records every time --- */
function finBoxRooms() {
  return finCanvasP().boxes.map(b => ({ id: 'box:' + b.id, kind: 'box', box: b, icon: b.icon || '🧩', title: b.title || 'My box', sum: finBoxSum(b), hue: 260, branch: FIN_BRANCHES.includes(b.branch) ? b.branch : 'below' }));
}
function finBoxSum(b) { const s = b.show || {}; return s.what === 'text' ? 'your note' : `${s.what || 'transactions'}${s.format ? ' · ' + s.format : ''} · made with Tell the canvas`; }
function finBoxTx(s) {
  const f = s.filter || {}, today = finToday(), from = f.lastDays ? FIN.addDays ? FIN.addDays(today, -(+f.lastDays)) : new Date(Date.parse(today) - (+f.lastDays) * 864e5).toISOString().slice(0, 10) : f.from, to = f.to;
  const cats = Array.isArray(f.category) ? f.category : f.category ? [f.category] : null, q = f.text ? FIN.norm(String(f.text)) : '';
  let list = finTx().filter(t => typeof t.amount === 'number' && t.date)
    .filter(t => !f.account || t.acct === f.account).filter(t => !cats || cats.includes(t.cat))
    .filter(t => f.direction === 'in' ? t.amount > 0 : f.direction === 'out' ? t.amount < 0 : true)
    .filter(t => !from || t.date >= from).filter(t => !to || t.date <= to)
    .filter(t => !q || FIN.norm(t.desc || '').includes(q))
    .filter(t => !(+f.minAmount) || Math.abs(t.amount) >= +f.minAmount).filter(t => !(+f.maxAmount) || Math.abs(t.amount) <= +f.maxAmount);
  const by = { 'date-desc': (a, b) => b.date.localeCompare(a.date), 'date-asc': (a, b) => a.date.localeCompare(b.date), 'amount-desc': (a, b) => Math.abs(b.amount) - Math.abs(a.amount), 'amount-asc': (a, b) => Math.abs(a.amount) - Math.abs(b.amount), name: (a, b) => (a.desc || '').localeCompare(b.desc || '') };
  return list.sort(by[s.sort] || by['date-desc']);
}
const finBoxLim = s => Math.max(1, Math.min(200, +s.limit || 10));
// rows of what a box shows: [{label, amount, cells:{...}}]
function finBoxRows(s) {
  const n = finNow(), all = finAll(), w = s.what || 'transactions', grp = s.group && s.group !== 'none' ? s.group : null;
  if (w === 'transactions') {
    const tx = finBoxTx(s);
    if (grp) { const key = t => grp === 'category' ? ((finCat(t.cat) || { name: t.cat || '—' }).name) : grp === 'month' ? fmon(t.date.slice(0, 7)) : grp === 'account' ? ((finAcct(t.acct) || { name: '—' }).name) : FIN.cleanDesc(t.desc || '—');
      const m = new Map(); for (const t of tx) { const k = key(t), g = m.get(k) || { label: k, amount: 0, count: 0 }; g.amount += t.amount; g.count++; m.set(k, g); }
      return [...m.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).slice(0, finBoxLim(s)).map(g => ({ label: g.label, amount: FIN.r2(g.amount), note: `${g.count} transaction${g.count === 1 ? '' : 's'}`, brand: grp === 'merchant' ? g.label : '' })); }
    return tx.slice(0, finBoxLim(s)).map(t => ({ label: FIN.cleanDesc(t.desc || ''), brand: t.desc || '', amount: t.amount, cells: { date: fday(t.date), desc: FIN.cleanDesc(t.desc || ''), amount: fm(t.amount), category: (finCat(t.cat) || { name: t.cat || '—' }).name, account: (finAcct(t.acct) || { name: '—' }).name, balance: typeof t.balance === 'number' ? fm(t.balance) : '' } }));
  }
  if (w === 'recurring') { const f = s.filter || {}; return FIN.recurring(all.entries || []).filter(r => f.direction === 'in' ? r.dir > 0 : r.dir < 0).sort((a, b) => b.perMonth - a.perMonth).slice(0, finBoxLim(s)).map(r => ({ label: FIN.cleanDesc(r.name), brand: r.name, amount: -r.perMonth, note: `${r.freq || 'monthly'}${r.next ? ' · next about ' + fday(r.next) : ''}`, cells: { desc: FIN.cleanDesc(r.name), amount: fm(r.amount), date: r.next ? fday(r.next) : '' } })); }
  if (w === 'categories') {
    const tx = finBoxTx({ ...s, filter: { direction: 'out', lastDays: 90, ...(s.filter || {}) } }), m = new Map();
    for (const t of tx) { const c = finCat(t.cat); if (c && c.kind !== 'expense') continue; m.set(t.cat, (m.get(t.cat) || 0) + t.amount); }
    return [...m.entries()].sort((a, b) => a[1] - b[1]).slice(0, finBoxLim(s)).map(([k, v]) => ({ label: (finCat(k) || { name: k || '—' }).name, amount: FIN.r2(v) }));
  }
  if (w === 'months') return all.months.slice(-finBoxLim({ limit: s.limit || 6 })).map(b => ({ label: fmon(b.m), amount: FIN.r2((b.inc || 0) - (b.exp || 0)), note: `in ${fk(b.inc || 0)} · out ${fk(b.exp || 0)}` }));
  if (w === 'accounts') return n.accts.map(({ a, l }) => ({ label: a.name, amount: ['credit_card', 'bnpl'].includes(a.kind) ? -(l.owed || 0) : l.balance ?? 0, note: l.date ? fday(l.date) : 'no balance yet' }));
  if (w === 'instalments') return n.inst.filter(i => i.status === 'active' || i.status === 'missing').map(i => ({ label: i.name, brand: i.name, amount: -i.amount, note: i.of ? `${i.n} of ${i.of} · ends ${fmon(i.end)}` : i.end ? `ends ${fmon(i.end)}` : '' }));
  if (w === 'goals') return (finBuyPlan().items || []).map(i => ({ label: i.name, brand: i.name, amount: -i.price, note: FIN_REC[i.rec] ? FIN_REC[i.rec][0] + (i.ready ? ' · ' + fmon(i.ready) : '') : '' }));
  if (w === 'holdings') return (finP().holdings || []).filter(h => !h.owner || h.owner === 'me').map(h => ({ label: h.name, amount: h.kind === 'liability' ? -(finLiab(h).remaining || 0) : +h.principal || +h.valuation || 0, note: h.rate ? h.rate + '% a year' : '' }));
  if (w === 'cards') { const m = new Map(); (function walk(x) { m.set(x.id, x); (x.children || []).forEach(walk); })(finCvModel()); return (s.nodes || []).map(id => m.get(id)).filter(Boolean).map(c => ({ label: c.label, brand: typeof finCardBrand === 'function' && finCardBrand(c) ? c.label : '', text: c.val || '', note: c.sub || '' })); }
  return [];
}
function finBoxHTML(id) {
  const b = finCanvasP().boxes.find(x => 'box:' + x.id === id); if (!b) return '<p class="small muted">This box was removed.</p>';
  const s = b.show || {}, fmt = FIN_BOX_FORMAT.includes(s.format) ? s.format : 'list', note = b.note ? `<p class="fin-box-note">${esc(String(b.note)).replace(/\n/g, '<br>')}</p>` : '';
  if (s.what === 'text') return note || '<p class="small muted">An empty note — tell the canvas what to write here.</p>';
  const rows = finBoxRows(s); if (!rows.length) return note + '<p class="small muted">Nothing matches yet.</p>';
  const lg = r => r.brand && typeof finLogo === 'function' ? finLogo(r.brand, 'sm') : '';   // a company's logo beside its name
  const total = rows.reduce((t, r) => t + (r.amount || 0), 0), money = v => typeof v === 'number' ? `<b class="num ${v > 0 ? 'fin-pos' : ''}">${fm(v)}</b>` : '';
  if (fmt === 'total') return note + finKv([['Total', fm(FIN.r2(total)), `${rows.length} item${rows.length === 1 ? '' : 's'}`], ['Average', fm(FIN.r2(total / rows.length)), 'each']]);
  if (fmt === 'bars') { const max = Math.max(1, ...rows.map(r => Math.abs(r.amount || 0))); return note + `<div class="fin-box-bars">${rows.map(r => `<div><span>${lg(r)}${esc(r.label)}</span>${money(r.amount)}${finBar(Math.abs(r.amount || 0), max, (r.amount || 0) < 0 ? 's2' : 's3')}</div>`).join('')}</div>`; }
  if (fmt === 'table' && rows[0].cells) {
    const cols = (Array.isArray(s.columns) ? s.columns.filter(c => FIN_BOX_COLS.includes(c)) : []).length ? s.columns.filter(c => FIN_BOX_COLS.includes(c)) : ['date', 'desc', 'amount', 'category'].filter(c => rows.some(r => r.cells[c]));
    const name = { date: 'Date', desc: 'Description', amount: 'Amount', category: 'Category', account: 'Account', balance: 'Balance' };
    return note + `<div class="fin-box-scroll"><table class="fin-box-t"><thead><tr>${cols.map(c => `<th${c === 'amount' || c === 'balance' ? ' class="num"' : ''}>${name[c]}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td${c === 'amount' || c === 'balance' ? ' class="num"' : ''}>${c === 'desc' ? lg(r) : ''}${esc(r.cells[c] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  return note + `<div class="fin-box-list">${rows.map(r => `<div>${lg(r)}<span><b>${esc(r.label)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ''}</span>${r.text ? `<b class="num">${esc(r.text)}</b>` : money(r.amount)}</div>`).join('')}</div>`
    + (['recurring', 'transactions', 'instalments', 'categories'].includes(s.what) && rows.length > 1 && rows.every(r => typeof r.amount === 'number') ? `<p class="small muted fin-box-total">Together ${fm(FIN.r2(total))}${s.what === 'recurring' || s.what === 'instalments' ? ' a month' : ''}</p>` : '');
}

/* --- what Claude sees of the canvas, and what it may do --- */
function finAgentContext() {
  const C = finCanvasP(), root = finCvModel(), branches = root.children.map(b => ({ id: b.id, title: b.label, cards: (function leaves(l) { return l.flatMap(c => c.type === 'branch' ? leaves(c.children) : [c]); })(b.children).filter(c => !c.cls.includes('tool') && !c.cls.includes('more')).slice(0, 14).map(c => ({ id: c.id, label: c.label, shows: c.val || '' })) }));
  const feed = finTalkFeed().slice(-10).map(x => x.who === 'you' ? { you: E.clip(x.text || '', 400) } : { canvas: E.clip(x.reply || '', 300), did: (x.done || []).slice(0, 6) });
  return { view: UI.fin.cv.mode || 'mind', mapBranches: ['mm-earn (Earned income)', 'mm-pass (Passive income)', 'mm-assets (Assets)', 'exp (Spending)', 'mm-liab (Liabilities)', 'buy (Your choices — goals & purchases)', 'below (under the map)'],
    rooms: branches, myBoxes: C.boxes.map(b => ({ id: b.id, title: b.title, branch: b.branch, show: b.show, note: b.note || '' })), renamed: C.labels, hidden: C.hidden, conversationSoFar: feed };
}
const FIN_AGENT_RULES = () => `

YOU ARE ALSO THE CANVAS'S AGENT. The owner talks to you as they would to Claude: about their money, and about how the canvas should look and what it should show. Understand what they mean — even when it is vague or casual — plan it, and carry it out. Read the conversation so far: "it", "that box", "make it a table", "only this month", "put it under liabilities" refer to what was said or made before.
THE CANVAS NOW: ${JSON.stringify(finAgentContext())}
To change the canvas, add "canvas":[operations] to the JSON (the canvas checks each one; never write code):
{"op":"addBox","id":"short-slug","title":"","icon":"one emoji","branch":"mm-earn|mm-pass|mm-assets|exp|mm-liab|buy|below","note":"optional text shown at the top","show":SHOW}
{"op":"updateBox","id":"existing box id", any of "title","icon","branch","note","show" (show replaces the old one; keep what the owner did not ask to change)}
{"op":"removeBox","id":""}
{"op":"renameCard","node":"card id from rooms","label":"new name"}   {"op":"hideCard","node":""}   {"op":"showCard","node":""}
{"op":"moveCard","node":"card id","to":"accts|inc|exp|com|own|third|buy or a map branch"}
{"op":"renameBranch","room":"room or branch id (also free for Financial freedom)","title":""}
{"op":"category","action":"create|rename|merge","id":"category id (rename, merge)","name":"","kind":"expense|income","into":"category id (merge)"}
{"op":"recategorize","filter":FILTER,"to":"category id, or the name of a category created in the same answer","remember":true when new transactions like these should get it too}
{"op":"fold","room":""}   {"op":"unfold","room":""}   {"op":"view","mode":"mind|rich|flow"}   {"op":"show","node":"card, room or box id to bring into view"}
SHOW = {"what":"transactions|recurring|categories|months|accounts|instalments|goals|holdings|cards|text","filter":FILTER,"sort":"date-desc|date-asc|amount-desc|amount-asc|name","limit":1-200,"group":"none|category|month|account|merchant","format":"table|list|bars|total","columns":["date","desc","amount","category","account","balance"],"nodes":["card ids — for what:cards"]}
FILTER = {"account":"id from accounts","category":["category ids"],"direction":"in|out","from":"YYYY-MM-DD","to":"YYYY-MM-DD","lastDays":number,"text":"words in the description","minAmount":number,"maxAmount":number}
How to work: pick sensible defaults for anything not said (a box of latest transactions: the 10 newest, as a table of date, description, amount and category; recurring payments: money out, as a list). A box never invents figures — it shows records; a "text" box is for the owner's own words or a plan in words, not for numbers you made up. Reuse an existing box when they ask to change "it" instead of adding another. Several operations may be needed for one request: do them all. Say in "reply", in a sentence or two and in the owner's language, what you did on the canvas; put any assumption in "notes".`;

/* --- carrying out the operations: each one checked, nothing run as code --- */
function finAgentApply(ops, about) {
  if (!Array.isArray(ops) || !ops.length) return { done: [], notes: [] };
  const done = [], notes = [], str = (v, n = 80) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n), slug = v => str(v, 40).toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '') || E.uid('bx');
  const model = new Map(); (function walk(x) { model.set(x.id, x); (x.children || []).forEach(walk); })(finCvModel());
  const card = id => { const c = model.get(id); return c && c.type === 'leaf' ? c : null; };
  const catNew = {};   // categories made in this answer, by name
  const catId = v => finCat(v) ? v : catNew[FIN.norm(String(v || ''))] || (finCats().find(c => FIN.norm(c.name) === FIN.norm(String(v || ''))) || {}).id || null;
  const cleanFilter = f => { f = f && typeof f === 'object' ? f : {}; const o = {};
    if (f.account && finAcct(f.account)) o.account = f.account;
    const cs = (Array.isArray(f.category) ? f.category : f.category ? [f.category] : []).map(catId).filter(Boolean); if (cs.length) o.category = cs;
    if (['in', 'out'].includes(f.direction)) o.direction = f.direction;
    for (const k of ['from', 'to']) if (FIN.validDate(f[k])) o[k] = f[k];
    if (+f.lastDays > 0) o.lastDays = Math.min(3650, Math.round(+f.lastDays));
    if (f.text) o.text = str(f.text, 60);
    for (const k of ['minAmount', 'maxAmount']) if (+f[k] > 0) o[k] = +f[k];
    return o; };
  const cleanShow = (s, old) => { s = s && typeof s === 'object' ? s : {}; const o = { ...(old || {}) };
    if (FIN_BOX_WHAT.includes(s.what)) o.what = s.what; o.what = o.what || 'transactions';
    if ('filter' in s) o.filter = cleanFilter(s.filter);
    if (['date-desc', 'date-asc', 'amount-desc', 'amount-asc', 'name'].includes(s.sort)) o.sort = s.sort;
    if (+s.limit > 0) o.limit = Math.min(200, Math.round(+s.limit));
    if (['none', 'category', 'month', 'account', 'merchant'].includes(s.group)) o.group = s.group;
    if (FIN_BOX_FORMAT.includes(s.format)) o.format = s.format;
    if (Array.isArray(s.columns)) o.columns = s.columns.filter(c => FIN_BOX_COLS.includes(c)).slice(0, 6);
    if (Array.isArray(s.nodes)) o.nodes = s.nodes.filter(id => card(id)).slice(0, 30);
    return o; };
  const aboutOk = op => !about || (op.node && op.node === about.id) || ['addBox', 'updateBox', 'removeBox', 'show', 'view'].includes(op.op);
  for (const op of ops.slice(0, 30)) {
    if (!op || typeof op !== 'object') continue;
    if (!aboutOk(op)) { notes.push(`Kept to ${about.label} — not done: ${str(op.op, 20)}`); continue; }
    const C = finCanvasP();
    try {
      if (op.op === 'addBox' || op.op === 'updateBox') {
        const old = C.boxes.find(b => b.id === op.id || (op.op === 'addBox' && FIN.norm(b.title || '') === FIN.norm(str(op.title)) && op.title));
        if (op.op === 'updateBox' && !old) { notes.push(`No box “${str(op.id, 30)}” to change.`); continue; }
        const b = { ...(old || {}), id: old ? old.id : slug(op.id || op.title), title: op.title ? str(op.title) : old ? old.title : 'My box', icon: op.icon ? str(op.icon, 4) : old ? old.icon : '🧩', branch: FIN_BRANCHES.includes(op.branch) ? op.branch : old ? old.branch : 'below', show: 'show' in op ? cleanShow(op.show, op.op === 'updateBox' ? old.show : null) : old ? old.show : cleanShow({}), ...('note' in op ? { note: str(op.note, 2000) } : {}), at: nowISO() };
        if (!old && C.boxes.some(x => x.id === b.id)) b.id = b.id + '-' + E.uid('').slice(-4);
        finCanvasSave(c => { const i = c.boxes.findIndex(x => x.id === b.id); if (i >= 0) c.boxes[i] = b; else c.boxes.push(b); });
        done.push(`${old ? 'changed' : 'added'} the box “${b.title}”`); UI.fin.flash = { ids: new Set(['box:' + b.id]), until: Date.now() + 7000 };
      } else if (op.op === 'removeBox') {
        const b = C.boxes.find(x => x.id === op.id); if (!b) continue; finCanvasSave(c => { c.boxes = c.boxes.filter(x => x.id !== b.id); }); done.push(`removed the box “${b.title}”`);
      } else if (op.op === 'renameCard' || op.op === 'hideCard' || op.op === 'showCard' || op.op === 'moveCard') {
        const c = card(op.node) || (op.op === 'showCard' && C.hidden.includes(op.node) ? { id: op.node, label: op.node } : null); if (!c) { notes.push(`No card “${str(op.node, 30)}” on the canvas.`); continue; }
        if (op.op === 'renameCard' && str(op.label)) { finCanvasSave(x => { x.labels[c.id] = str(op.label); }); done.push(`renamed “${c.label}” to “${str(op.label)}”`); }
        if (op.op === 'hideCard') { finCanvasSave(x => { if (!x.hidden.includes(c.id)) x.hidden.push(c.id); }); done.push(`hid “${c.label}” (ask to show it again any time)`); }
        if (op.op === 'showCard') { finCanvasSave(x => { x.hidden = x.hidden.filter(i => i !== c.id); }); done.push(`showing “${c.label}” again`); }
        if (op.op === 'moveCard') { const to = FIN_BRANCH_ROOM[op.to]; if (!to) { notes.push(`No branch “${str(op.to, 20)}”.`); continue; } finCanvasSave(x => { x.moves[c.id] = to; }); done.push(`moved “${c.label}” to ${str(op.to, 20)}`); }
      } else if (op.op === 'renameBranch') {
        const id = str(op.room, 30), t = str(op.title); if (!id || !t) continue; finCanvasSave(x => { x.titles[id] = t; }); done.push(`renamed the branch to “${t}”`);
      } else if (op.op === 'category') {
        const name = str(op.name, 40);
        if (op.action === 'create' && name) { const have = finCats().find(c => FIN.norm(c.name) === FIN.norm(name)); if (have) { catNew[FIN.norm(name)] = have.id; continue; }
          const id = E.uid('c'), kind = op.kind === 'income' ? 'income' : 'expense'; finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS); p.cats.push({ id, name, kind, prio: kind === 'expense' ? 'discretionary' : '', code: '', subs: [] }); }); catNew[FIN.norm(name)] = id; done.push(`new category “${name}”`); }
        else if (op.action === 'rename' && finCat(op.id) && name) { const was = finCat(op.id).name; finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS); const c = p.cats.find(x => x.id === op.id); if (c) c.name = name; }); done.push(`category “${was}” is now “${name}”`); }
        else if (op.action === 'merge' && finCat(op.id) && catId(op.into) && op.id !== catId(op.into)) {
          const to = catId(op.into), ch = finTx().filter(t => t.cat === op.id).map(o => { const t = clone(o); finHist(t, 'cat', op.id, to, 'categories merged (Tell the canvas)'); t.cat = to; return t; }), was = finCat(op.id).name;
          if (ch.length) finWrite(ch); finSave(p => { p.cats = clone(p.cats || FIN.DEFAULT_CATS).filter(c => c.id !== op.id); p.rules = (p.rules || []).map(r => r.cat === op.id ? { ...r, cat: to } : r); if (p.budgets) delete p.budgets[op.id]; });
          done.push(`merged “${was}” into “${finCat(to).name}” (${ch.length} transaction${ch.length === 1 ? '' : 's'})`); }
      } else if (op.op === 'recategorize') {
        const to = catId(op.to); if (!to) { notes.push(`No category “${str(op.to, 30)}”.`); continue; }
        const f = cleanFilter(op.filter); if (!Object.keys(f).length) { notes.push('Not recategorised: no transactions were described.'); continue; }
        const ch = finBoxTx({ filter: f }).filter(t => t.cat !== to).slice(0, 2000).map(o => { const t = clone(o); finHist(t, 'cat', t.cat, to, 'Tell the canvas'); t.cat = to; t.catSrc = 'manual'; return t; });
        if (ch.length) finWrite(ch);
        if (op.remember && f.text) finSave(p => { p.rules = [{ id: E.uid('r'), match: f.text, dir: f.direction === 'in' ? 1 : f.direction === 'out' ? -1 : 0, cat: to, learned: false }, ...(p.rules || [])]; });
        done.push(`${ch.length} transaction${ch.length === 1 ? '' : 's'} moved to “${finCat(to).name}”${op.remember && f.text ? ' — and new ones like them will be too' : ''}`);
      } else if (op.op === 'fold' || op.op === 'unfold') {
        const id = str(op.room, 40); if (!id) continue; if (op.op === 'fold') UI.fin.cvCol.add(id); else UI.fin.cvCol.delete(id); finCvKeep(); done.push(`${op.op === 'fold' ? 'folded' : 'unfolded'} ${id}`);
      } else if (op.op === 'view' && FIN_CV_MODES.includes(op.mode)) { if (UI.fin.cv.mode !== op.mode) { UI.fin.agentMode = op.mode; done.push(`switched to ${op.mode === 'rich' ? 'Rich Dad' : op.mode === 'flow' ? 'Flow' : 'the Mind map'}`); } }
      else if (op.op === 'show' && op.node) UI.fin.goto = str(op.node, 60);
    } catch (e) { console.error(e); notes.push(`Could not do ${str(op.op, 20)} (${e.message || e}).`); }
  }
  return { done, notes };
}

Object.assign(ACT, { 'fin-box-del': el => { const id = (el.dataset.id || '').replace(/^box:/, ''), b = finCanvasP().boxes.find(x => x.id === id); if (!b) return; finAsk(`Remove the box “${b.title}”?`); finCanvasSave(c => { c.boxes = c.boxes.filter(x => x.id !== id); }); render(); } });
Object.assign(window.__FIN, { canvas: () => finCanvasP(), agent: (ops, about) => { const r = finAgentApply(ops, about); render(); return r; }, boxRows: id => { const b = finCanvasP().boxes.find(x => x.id === id); return b ? finBoxRows(b.show || {}) : null; } });
