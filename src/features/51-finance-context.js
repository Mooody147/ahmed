// Money canvas — the floating "Tell the canvas" window and the card menu.
// The window opens over the canvas (also in full screen), moves by its title bar and holds the same conversation as
// the box under the canvas (one conversation; while the window is open the box under the canvas points to it).
// Right-click a card (or press and hold it, or Shift+F10 / the menu key) for what that card can do — its details, edit,
// its own part, its transactions, zoom to it, copy its figure, remove it — and "Tell the canvas about this card".
// Talking about one card is strictly about that card: Claude is told which card, given that card's own records, and
// whatever it proposes for anything else is not applied (it is listed instead). Statements and the automatic sorting
// of the whole canvas wait for the general conversation.

UI.fin.talk.win = false; UI.fin.talk.about = null; UI.fin.menu = null;

/* --- the floating window --- */
function finTalkWinHTML() {
  if (!UI.fin.talk.win) return '';
  const T = UI.fin.talk, at = T.wpos ? `left:${T.wpos.x}px;top:${T.wpos.y}px;right:auto;bottom:auto;` : '';
  return `<section class="fin-talk-win" id="fin-talk-win" role="dialog" aria-label="Tell the canvas" style="${at}">
    <div class="fin-talk-win-h" id="fin-talk-win-h"><span aria-hidden="true">💬</span><b>Tell the canvas</b><span class="spacer"></span>
      <button class="icon-btn" data-act="fin-talk-win" data-v="dock" title="Back under the canvas" aria-label="Back under the canvas">⤓</button>
      <button class="icon-btn" data-act="fin-talk-win" data-v="close" aria-label="Close">${I.x}</button></div>
    <div class="fin-talk-win-b">${finTalkHTML()}</div></section>`;
}
// what the box under the canvas shows while the window is open
function finTalkDockedHTML() {
  return `<p class="small muted fin-talk-moved">The conversation is open in a window on the canvas. <button class="btn sm ghost" data-act="fin-talk-win" data-v="dock">Bring it back here</button></p>`;
}
function finTalkWin(open, about) {
  const T = UI.fin.talk; T.win = !!open; if (about !== undefined) T.about = about; if (!open) T.about = null;
  UI.fin.menu = null; render();
  if (open) setTimeout(() => { const i = $('#fin-talk-in'); if (i) i.focus(); const f = $('#fin-talk-feed'); if (f) f.scrollTop = f.scrollHeight; }, 30);
}
// the card a conversation is about: a chip with ✕ to talk about the whole canvas again
function finAboutChipHTML() {
  const a = UI.fin.talk.about; if (!a) return '';
  return `<div class="fin-about" role="status"><span class="fin-about-k">About this card only:</span> <b>${esc(a.label)}</b>${a.val ? ` <span class="muted">${esc(a.val)}</span>` : ''}
    <button class="icon-btn" data-act="fin-about-clear" title="Talk about the whole canvas" aria-label="Talk about the whole canvas instead">${I.x}</button></div>`;
}
// drag by the title bar, kept inside the canvas
const FTW = { drag: null };
document.addEventListener('pointerdown', e => {
  const h = e.target.closest && e.target.closest('#fin-talk-win-h'); if (!h || e.target.closest('button')) return;
  const w = $('#fin-talk-win'), st = w && w.offsetParent; if (!w || !st) return;
  FTW.drag = { id: e.pointerId, dx: e.clientX - w.offsetLeft, dy: e.clientY - w.offsetTop }; h.setPointerCapture(e.pointerId); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!FTW.drag || e.pointerId !== FTW.drag.id) return; const w = $('#fin-talk-win'), st = w && w.offsetParent; if (!w || !st) return;
  const x = Math.max(0, Math.min(st.clientWidth - w.offsetWidth, e.clientX - FTW.drag.dx)), y = Math.max(0, Math.min(st.clientHeight - 48, e.clientY - FTW.drag.dy));
  UI.fin.talk.wpos = { x, y }; Object.assign(w.style, { left: x + 'px', top: y + 'px', right: 'auto', bottom: 'auto' });
});
const finTwEnd = e => { if (FTW.drag && e.pointerId === FTW.drag.id) FTW.drag = null; };
document.addEventListener('pointerup', finTwEnd); document.addEventListener('pointercancel', finTwEnd);

/* --- the card menu --- */
function finCardNode(id) { let hit = null; (function walk(n) { if (n.id === id) hit = n; (n.children || []).forEach(walk); })(finCvModel()); return hit; }
function finMenuItems(id) {
  const n = finCardNode(id) || {}, items = [], spec = typeof finCvSpec === 'function' ? finCvSpec(id) : null, act = n.act || {};
  const tool = (n.cls || '').includes('tool') || id.startsWith('t:') && act.act === 'fin-sec';
  if (!tool && !/:none$/.test(id)) items.push(['talk', '💬', 'Tell the canvas about this card']);
  if (!tool) items.push(['det', '🔍', 'Details and charts']);
  if (spec) items.push(['edit', '✎', 'Edit']);
  if (act.act === 'fin-acct-ledger' || act.act === 'fin-drill-cat') items.push(['tx', '📒', 'Its transactions']);
  if (act.act === 'fin-sec' && act.s && FIN_VIEW[act.s]) items.push(['part', FIN_ICON[act.s] || '📂', 'Open ' + ((FIN_SECS.find(s => s[0] === act.s) || [])[1] || 'its part')]);
  if (act.act === 'fin-buy-edit') items.push(['buy', '🛍️', 'Plan this purchase']);
  if (id.startsWith('t:') && (finP().parties || []).some(z => 't:' + z.id === id)) items.push(['settle', '✓', 'All settled — given back or paid out for them']);
  items.push(['zoom', '🎯', 'Zoom to it']);
  if (n.val) items.push(['copy', '📋', 'Copy “' + E.clip(n.val, 24) + '”']);
  if (spec && spec.remove) items.push(['rm', '🗑', 'Remove']);
  return items;
}
function finMenuHTML() {
  const M = UI.fin.menu; if (!M) return '';
  const n = finCardNode(M.id); if (!n) return '';
  return `<div class="fin-menu" id="fin-menu" role="menu" aria-label="${esc(n.label)}" style="left:${M.x}px;top:${M.y}px">
    <div class="fin-menu-h">${esc(E.clip(n.label, 40))}</div>
    ${finMenuItems(M.id).map(([k, ic, l], i) => `<button role="menuitem" class="fin-menu-i ${k === 'rm' ? 'danger' : ''}" data-act="fin-menu-do" data-k="${k}" ${i ? 'tabindex="-1"' : ''}><span aria-hidden="true">${ic}</span>${esc(l)}</button>`).join('')}</div>`;
}
function finMenuOpen(id, cx, cy) {
  const st = $('.fin-cv-stage'); if (!st) return; const r = st.getBoundingClientRect();
  UI.fin.menu = { id, x: Math.round(cx - r.left), y: Math.round(cy - r.top) }; UI.fin.pop = null; render();
  // inside the canvas, wherever it was opened
  const m = $('#fin-menu'); if (!m) return;
  const x = Math.max(6, Math.min(st.clientWidth - m.offsetWidth - 6, UI.fin.menu.x)), y = Math.max(6, Math.min(st.clientHeight - m.offsetHeight - 6, UI.fin.menu.y));
  UI.fin.menu.x = x; UI.fin.menu.y = y; Object.assign(m.style, { left: x + 'px', top: y + 'px' }); const f = m.querySelector('button'); if (f) f.focus({ preventScroll: true });
}
function finMenuClose() { if (!UI.fin.menu) return; UI.fin.menu = null; const m = $('#fin-menu'); if (m) m.remove(); }
// the card a conversation is about, as Claude and the chip see it
function finAboutOf(id) { const n = finCardNode(id); return n ? { id, label: n.label, val: n.val || '', sub: n.sub || '' } : null; }
function finMenuDo(k) {
  const id = (UI.fin.menu || {}).id; finMenuClose(); if (!id) return;
  const n = finCardNode(id) || {}, act = n.act || {};
  if (k === 'talk') return finTalkWin(true, finAboutOf(id));
  if (k === 'det') return finPopOpen(id);
  if (k === 'edit') return finCvEditOpen(id);
  if (k === 'settle') return finPartySettle(id.slice(2));
  if (k === 'zoom') { finCvGoto(id); UI.fin.flash = { ids: new Set([id]), until: Date.now() + 1800 }; return render(); }
  if (k === 'copy') { try { navigator.clipboard.writeText(n.val); toast('Copied ' + n.val); } catch { toast(n.val); } return; }
  if (k === 'rm') { const s = finCvSpec(id); if (s && s.remove) { const snap = finSnapshot(), line = s.remove(); finCvEditDone(line, snap, []); } return; }
  // the card's own action: its transactions, its part, the purchase plan
  const el = document.createElement('button'); for (const [a, v] of Object.entries(act)) el.dataset[a] = v; if (act.act && ACT[act.act]) ACT[act.act](el);
}
// right-click, the menu key, Shift+F10 — or press and hold on a touch screen
document.addEventListener('contextmenu', e => {
  const c = e.target.closest && e.target.closest('#fin-cv-world .fin-cvn[data-node]'); if (!c) { if (e.target.closest && e.target.closest('#fin-menu')) e.preventDefault(); return; }
  e.preventDefault(); finMenuOpen(c.dataset.node, e.clientX, e.clientY);
});
const FMH = { t: 0, x: 0, y: 0, id: null };
document.addEventListener('pointerdown', e => {
  if (e.pointerType !== 'touch') return; const c = e.target.closest && e.target.closest('#fin-cv-world .fin-cvn[data-node]'); if (!c) return;
  clearTimeout(FMH.t); Object.assign(FMH, { x: e.clientX, y: e.clientY, id: c.dataset.node });
  FMH.t = setTimeout(() => { FMH.t = 0; FMH.fired = true; finMenuOpen(FMH.id, FMH.x, FMH.y); }, 550);
});
document.addEventListener('pointermove', e => { if (FMH.t && Math.hypot(e.clientX - FMH.x, e.clientY - FMH.y) > 8) { clearTimeout(FMH.t); FMH.t = 0; } });
document.addEventListener('pointerup', () => { clearTimeout(FMH.t); FMH.t = 0; });
// the tap that ends a press-and-hold does not also open the card
document.addEventListener('click', e => { if (FMH.fired) { FMH.fired = false; if (e.target.closest && e.target.closest('.fin-cvn')) { e.stopImmediatePropagation(); e.preventDefault(); } } }, true);
document.addEventListener('keydown', e => {
  if (UI.view !== 'finance') return;
  const M = $('#fin-menu');
  if (M) {
    const items = [...M.querySelectorAll('button')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); const id = UI.fin.menu && UI.fin.menu.id; finMenuClose(); const c = id && document.querySelector(`.fin-cvn[data-node="${CSS.escape(id)}"]`); if (c) c.focus({ preventScroll: true }); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus(); return; }
    if (e.key === 'Tab') { e.preventDefault(); return; }
  }
  if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
    const c = document.activeElement && document.activeElement.closest && document.activeElement.closest('.fin-cvn[data-node]'); if (!c) return;
    e.preventDefault(); const r = c.getBoundingClientRect(); finMenuOpen(c.dataset.node, r.left + 24, r.bottom - 6);
  }
  // Escape inside the window closes it
  if (e.key === 'Escape' && UI.fin.talk.win && e.target.closest && e.target.closest('#fin-talk-win')) { e.preventDefault(); e.stopImmediatePropagation(); finTalkWin(false); }
}, true);
// a click anywhere else, moving the canvas or scrolling closes the menu
document.addEventListener('pointerdown', e => { if (UI.fin.menu && !(e.target.closest && e.target.closest('#fin-menu'))) finMenuClose(); }, true);
document.addEventListener('wheel', e => { if (UI.fin.menu && !(e.target.closest && e.target.closest('#fin-menu'))) finMenuClose(); }, { capture: true, passive: true });

/* --- talking about one card only --- */
// that card's own records, so Claude answers from them and nothing else
function finAboutRecords(about) {
  const [k, ...rest] = about.id.split(':'), key = rest.join(':'), n = finNow(), p = finP(), tx = finTx();
  const acct = finAboutAcct(about.id), list = ts => ts.slice(-60).map(t => ({ txId: t.id, date: t.date, amount: t.amount, desc: FIN.cleanDesc(t.desc || ''), category: t.cat }));
  if (acct) { const a = finAcct(acct); return { account: { id: a.id, name: a.name, kind: a.kind, number: a.number || '', limit: a.limit ?? null, latest: finLatest(a) }, transactions: list(tx.filter(t => t.acct === acct)) }; }
  if (k === 'c') return { category: { id: key, name: (finCat(key) || {}).name || key }, transactions: list(tx.filter(t => t.cat === key)) };
  if (k === 'i') return { installment: n.inst.find(i => i.key === key) || null };
  if (k === 'in') return { income: key === 'salary' ? { key: 'salary', fromStatements: FIN.incomeBase(finAll(), finToday()).salary } : (p.inputs || []).find(i => i.id === key) || { key } };
  if (k === 'b') return { purchaseGoal: (p.buys || []).find(b => b.id === key) || null };
  if (k === 'g') return { savingsGoal: (p.goals || []).find(g => g.id === key) || null };
  if (k === 'h' || k === 'l' || k === 'th') return { holding: p.holdings.find(h => h.id === key) || null };
  if (k === 't') return { person: p.parties.find(x => x.id === key) || null, held: FIN.thirdParty(tx, p.parties).find(x => x.id === key) || null };
  return {};
}
function finAboutAcct(id) { const [k, ...rest] = id.split(':'), n = finNow(); return k === 'a' ? rest.join(':') : id === 'cm:card' ? (n.card && n.card.a.id) || null : id === 'cm:halan' ? (n.halan && n.halan.a.id) || null : null; }
const FIN_ABOUT_RULES = about => `

THIS MESSAGE IS ABOUT ONE CARD ON THE CANVAS ONLY: ${JSON.stringify({ card: about.label, shows: about.val, detail: about.sub })}
ITS OWN RECORDS: ${JSON.stringify(finAboutRecords(about))}
Answer and change ONLY this card. Do not add, change or remove anything about other accounts, other cards, goals, income or the canvas as a whole — even when the message seems to ask for it: say so in "notes" instead. Answer questions from this card's own records only.`;
// what Claude proposes is kept only where it concerns that card; the rest is listed, not applied
function finAboutScope(about, P, r) {
  const [k, ...rest] = about.id.split(':'), key = rest.join(':'), acct = finAboutAcct(about.id), p = finP(), out = [];
  const keep = (list, ok, what) => (list || []).filter(x => { const y = ok(x); if (!y && !out.includes(what)) out.push(what); return y; });
  const inpKey = k === 'in' ? (key === 'salary' ? 'salary' : ((p.inputs || []).find(i => i.id === key) || {}).key || key) : null;
  P.balances = keep(P.balances, b => acct && b.account === acct, 'balances of other accounts');
  P.terms = keep(P.terms, t => acct && t.account === acct, 'terms of other accounts');
  P.thirdParty = keep(P.thirdParty, t => (acct && t.tx && t.tx.acct === acct) || (k === 't' && FIN.norm(t.person || '') && FIN.norm(t.person) === FIN.norm(((p.parties.find(x => x.id === key) || {}).name) || '')), 'someone else’s money elsewhere');
  P.inputs = keep(P.inputs, i => inpKey && i.key === inpKey, 'income or spending figures');
  P.installments = keep(P.installments, i => k === 'i' && i.key === key, 'other instalments');
  P.holdings = keep(P.holdings, h => ['h', 'l', 'th'].includes(k) && h.id === key, 'other holdings');
  P.goals = keep(P.goals, () => false, 'new goals');
  P.questions = [];
  r.transactions = keep(r.transactions, t => {
    if (acct) { if (t.account && t.account !== acct) return false; t.account = acct; t.cash = false; return true; }
    if (k === 'c') { if (t.category && t.category !== key) return false; t.category = key; return true; }
    return false;
  }, 'transactions for other accounts or categories');
  r.goalUpdates = keep(r.goalUpdates, g => k === 'b' && g.id === key, 'other goals');
  r.view = null;
  return out;
}

/* --- actions --- */
Object.assign(ACT, {
  'fin-talk-win': el => el.dataset.v === 'dock' || el.dataset.v === 'close' ? finTalkWin(false) : finTalkWin(!UI.fin.talk.win),
  'fin-about-clear': () => { UI.fin.talk.about = null; render(); setTimeout(() => { const i = $('#fin-talk-in'); if (i) i.focus(); }, 0); },
  'fin-menu-do': el => finMenuDo(el.dataset.k),
});
Object.assign(window.__FIN, { menu: (id, x, y) => finMenuOpen(id, x, y), about: () => UI.fin.talk.about });
