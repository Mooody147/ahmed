// Editing on the canvas itself: ✎ on a card (or double-click it, or F2) opens a small form in place; ＋ on a branch adds
// an item. Every change is written to the same records the panels, the plan and Claude read, so the canvas, the parts
// and the talk box always show the same thing. Each change is listed in the conversation under the canvas, with Undo.
UI.fin.cvEdit = null;   // { id, add, v: {field: value} }
const finNumIn = v => { if (v === '' || v === null || v === undefined) return null; const r = FIN.parseNum(String(v)); return r && typeof r.n === 'number' ? r.n : null; };

// what can be changed on each card, and how a change is saved (returns a short line for the conversation)
function finCvSpec(id) {
  const p = finP(), today = finToday(), [kind, ...rest] = id.split(':'), key = rest.join(':');
  const holdKinds = FIN_HKINDS.filter(([k]) => k !== 'liability');
  if (kind === 'a' || id === 'cm:halan') {
    const a = id === 'cm:halan' ? (finNow().halan || {}).a : finAcct(key); if (!a) return null;
    const l = finLatest(a), credit = a.kind === 'credit_card' || a.kind === 'bnpl';
    const fields = [{ k: 'name', label: 'Name', value: a.name },
      ...(a.kind === 'bnpl' ? [{ k: 'limit', label: 'Limit', type: 'number', value: a.limit ?? '' }, { k: 'available', label: 'Available now', type: 'number', value: l.available ?? '' }]
        : credit ? [{ k: 'owed', label: 'Owed now', type: 'number', value: l.owed ?? '' }, { k: 'limit', label: 'Limit', type: 'number', value: a.limit ?? '' }]
        : [{ k: 'balance', label: `Balance today (${fday(today)})`, type: 'number', value: typeof l.balance === 'number' ? l.balance : '' }])];
    return { title: a.name, fields, save: v => {
      const out = [], num = k => finNumIn(v[k]);
      if (v.name && v.name.trim() && v.name.trim() !== a.name) { finSave(q => { const x = q.accounts.find(z => z.id === a.id); if (x) x.name = v.name.trim(); }); out.push(`renamed to ${v.name.trim()}`); }
      if (num('limit') !== null && num('limit') !== (a.limit ?? null)) { finSave(q => { const x = q.accounts.find(z => z.id === a.id); if (x) { x.limit = num('limit'); x.limitSet = true; } }); out.push(`limit ${fm(num('limit'))}`); }
      // a new figure goes in like today's balances: compared with the last one, any difference nobody explains is settled
      const fig = {}; if (num('balance') !== null && num('balance') !== l.balance) fig.balance = num('balance'); if (num('owed') !== null && num('owed') !== l.owed) fig.outstanding = num('owed'); if (num('available') !== null && num('available') !== l.available) fig.available = num('available');
      if (Object.keys(fig).length) { UI.fin.daily = { date: today, v: { [a.id]: fig } }; finDailyCheck(); finDailySave(true); out.push(Object.entries(fig).map(([k, x]) => `${k === 'outstanding' ? 'owed' : k} ${fm(x)}`).join(', ')); }
      return out.length ? `${a.name}: ${out.join(' · ')}` : '';
    }, remove: finTx().some(t => t.acct === a.id) || ['Primary account', 'Savings account'].some(n => a.name.startsWith(n)) ? null : () => { finSave(q => { q.accounts = q.accounts.filter(z => z.id !== a.id); }); return `removed account ${a.name}`; } };
  }
  if (kind === 'in') {
    if (key === 'cib') { const h = p.holdings.find(x => x.id === 'mom'); if (!h) return null; return { title: 'CIB investment — my share', fields: [{ k: 'amount', label: 'My share a month', type: 'number', value: h.myShareMonthly ?? '' }], save: v => { const n = finNumIn(v.amount); if (n === null || n === +h.myShareMonthly) return ''; finSave(q => { const x = q.holdings.find(z => z.id === 'mom'); x.history = [...(x.history || []), { at: nowISO(), myShareMonthly: x.myShareMonthly }]; x.myShareMonthly = n; }); return `CIB share ${fm(n)} a month`; } }; }
    const inp = (p.inputs || []).find(i => i.id === key), isSal = key === 'salary';
    if (!inp && !isSal) return null;   // repeating income seen in the statements is not typed in
    const cur = inp || { key: 'salary', label: 'Salary', kind: 'income', amount: FIN.incomeBase(finAll(), today).salary ?? '' };
    return { title: cur.label, fields: [{ k: 'name', label: 'Name', value: cur.label }, { k: 'amount', label: 'A month', type: 'number', value: cur.amount ?? '' }, { k: 'from', label: 'From', type: 'date', value: today }],
      save: v => { const n = finNumIn(v.amount), name = (v.name || cur.label).trim(); if (n === null) return ''; if (n === +cur.amount && name === cur.label) return '';
        finSave(q => { q.inputs = FIN.setInput(q.inputs || [], { id: E.uid('in'), key: cur.key, label: name, kind: cur.kind || 'income', amount: n, from: FIN.validDate(v.from) ? v.from : today, permanent: true }, today); });
        return `${name} ${fm(n)} a month from ${fday(FIN.validDate(v.from) ? v.from : today)}`; },
      remove: inp ? () => { finSave(q => { q.inputs = (q.inputs || []).filter(i => i.key !== inp.key); }); return `removed ${inp.label}`; } : null };
  }
  if (kind === 'c') {
    const c = finCat(key); if (!c) return null;
    return { title: c.name, fields: [{ k: 'name', label: 'Category name', value: c.name }, { k: 'budget', label: 'Monthly budget', type: 'number', value: (p.budgets || {})[key] ?? '' }],
      save: v => { const out = [], b = finNumIn(v.budget), name = (v.name || '').trim();
        if (name && name !== c.name) { finSave(q => { q.cats = (q.cats || FIN.DEFAULT_CATS).map(x => x.id === key ? { ...x, name } : x); }); out.push(`renamed to ${name}`); }
        if (String(v.budget ?? '') === '' && (p.budgets || {})[key] !== undefined) { finSave(q => { delete q.budgets[key]; }); out.push('budget removed'); }
        else if (b !== null && b !== (p.budgets || {})[key]) { finSave(q => { q.budgets = { ...(q.budgets || {}), [key]: b }; }); out.push(`budget ${fm(b)} a month`); }
        return out.length ? `${c.name}: ${out.join(' · ')}` : ''; } };
  }
  if (kind === 'i') {
    const i = finNow().inst.find(x => x.key === key); if (!i) return null;
    return { title: i.name, fields: [{ k: 'left', label: 'Payments left', type: 'number', value: i.remaining ?? '' }, { k: 'status', label: 'Status', type: 'select', value: 'active', options: [['active', 'Still running'], ['completed', 'Finished'], ['discontinued', 'Not an instalment']] }],
      save: v => { const left = finNumIn(v.left); if ((left === null || left === i.remaining) && v.status === 'active') return '';
        finSave(q => { const old = (q.installments || []).find(k => k.key === key) || {}; q.installments = (q.installments || []).filter(k => k.key !== key); q.installments.push({ ...old, key, status: v.status || 'active', remaining: left, end: null, at: nowISO(), by: 'you' }); });
        return `${i.name}: ${v.status === 'completed' ? 'finished' : v.status === 'discontinued' ? 'not an instalment' : `${left} payments left`}`; },
      remove: i.manual ? () => { finSave(q => { q.installments = (q.installments || []).filter(k => k.key !== key); }); return `removed ${i.name}`; } : null };
  }
  if (kind === 'h' || kind === 'th' || kind === 'l') {
    const h = p.holdings.find(x => x.id === key); if (!h) return null;
    const val = h.kind === 'property' ? 'valuation' : 'principal';
    const fields = [{ k: 'name', label: 'Name', value: h.name }, ...(kind === 'l' ? [] : [{ k: 'amount', label: h.kind === 'property' ? 'Value' : 'Amount', type: 'number', value: h[val] ?? '' }]), ...(['deposit', 'cd', 'managed', 'other'].includes(h.kind) ? [{ k: 'rate', label: 'Return % a year', type: 'number', value: h.rate ?? '' }] : [])];
    return { title: h.name, fields, save: v => {
      const out = [], n = finNumIn(v.amount), r = finNumIn(v.rate), name = (v.name || '').trim();
      finSave(q => { const x = q.holdings.find(z => z.id === key); if (!x) return; const was = { principal: x.principal, valuation: x.valuation, rate: x.rate, name: x.name };
        if (name && name !== x.name) { x.name = name; out.push(`renamed to ${name}`); }
        if (n !== null && n !== +x[val]) { x[val] = n; if (val === 'valuation') x.includeValue = true; out.push(`${val === 'valuation' ? 'value' : 'amount'} ${fm(n)}`); }
        if (r !== null && r !== +x.rate) { x.rate = r; out.push(`${r}% a year`); }
        if (out.length) x.history = [...(x.history || []), { at: nowISO(), ...was }]; });
      return out.length ? `${h.name}: ${out.join(' · ')}` : '';
    }, remove: ['mom', 'off1', 'off2'].includes(h.id) ? null : () => { finSave(q => { q.holdings = q.holdings.filter(z => z.id !== key); }); return `removed ${h.name}`; } };
  }
  if (kind === 't') {
    const x = p.parties.find(z => z.id === key); if (!x) return null;
    return { title: x.name, fields: [{ k: 'name', label: 'Name', value: x.name }, { k: 'match', label: 'Words in the statement that mean them', value: x.match || '' }],
      save: v => { const out = []; finSave(q => { const y = q.parties.find(z => z.id === key); if (!y) return; if (v.name && v.name.trim() !== y.name) { out.push(`renamed to ${v.name.trim()}`); y.name = v.name.trim(); } if ((v.match || '') !== (y.match || '')) { y.match = v.match || ''; out.push('statement words updated'); } }); return out.length ? `${x.name}: ${out.join(' · ')}` : ''; } };
  }
  if (kind === 'b') {
    const b = (p.buys || []).find(z => z.id === key); if (!b) return null;
    return { title: b.name, fields: [{ k: 'name', label: 'What', value: b.name }, { k: 'price', label: 'Price', type: 'number', value: b.price }, { k: 'wantBy', label: 'Wanted by', type: 'date', value: b.wantBy || '' }, { k: 'priority', label: 'Priority', type: 'select', value: String(b.priority || 2), options: [['1', 'High'], ['2', 'Normal'], ['3', 'Low']] }],
      save: v => { const out = [], pr = finNumIn(v.price); finSave(q => { const x = (q.buys || []).find(z => z.id === key); if (!x) return;
          if (v.name && v.name.trim() !== x.name) { out.push(`renamed to ${v.name.trim()}`); x.name = v.name.trim(); }
          if (pr && Math.abs(pr) !== x.price) { x.price = Math.abs(pr); out.push(`price ${fm(x.price)}`); }
          if ((v.wantBy || '') !== (x.wantBy || '')) { x.wantBy = FIN.validDate(v.wantBy) ? v.wantBy : ''; out.push(x.wantBy ? `by ${fday(x.wantBy)}` : 'no date'); }
          if (+v.priority && +v.priority !== (x.priority || 2)) { x.priority = +v.priority; out.push(`priority ${{ 1: 'high', 2: 'normal', 3: 'low' }[x.priority]}`); } });
        return out.length ? `${b.name}: ${out.join(' · ')}` : ''; },
      remove: () => { finSave(q => { q.buys = (q.buys || []).filter(z => z.id !== key); }); return `removed goal ${b.name}`; } };
  }
  if (kind === 'g') {
    const g = (p.goals || []).find(z => z.id === key); if (!g) return null;
    return { title: g.name, fields: [{ k: 'name', label: 'Name', value: g.name }, { k: 'target', label: 'Target', type: 'number', value: g.target ?? '' }, { k: 'date', label: 'By', type: 'date', value: g.date || '' }],
      save: v => { const out = [], t = finNumIn(v.target); finSave(q => { const x = q.goals.find(z => z.id === key); if (!x) return; if (v.name && v.name.trim() !== x.name) { x.name = v.name.trim(); out.push(`renamed to ${x.name}`); } if (t !== null && t !== +x.target) { x.target = t; out.push(`target ${fm(t)}`); } if ((v.date || '') !== (x.date || '')) { x.date = FIN.validDate(v.date) ? v.date : ''; out.push(x.date ? `by ${fday(x.date)}` : 'no date'); } }); return out.length ? `${g.name}: ${out.join(' · ')}` : ''; },
      remove: () => { finSave(q => { q.goals = q.goals.filter(z => z.id !== key); }); return `removed ${g.name}`; } };
  }
  return null;
}
// what ＋ adds on each branch
function finCvAddSpec(br) {
  const p = finP(), today = finToday();
  const S = {
    accts: { title: 'New account', fields: [{ k: 'name', label: 'Name', value: '' }, { k: 'kind', label: 'Type', type: 'select', value: 'current', options: [...FIN_AKINDS.filter(([k]) => k !== 'loan'), ['bnpl', 'Buy now, pay later']] }, { k: 'balance', label: 'Balance today', type: 'number', value: '' }],
      save: v => { if (!v.name.trim()) return ''; const id = E.uid('ac'); finSave(q => { q.accounts.push({ id, name: v.name.trim(), bank: '', kind: v.kind || 'current', currency: q.base, number: '', owner: 'me', holder: 'me', createdAt: nowISO() }); }); const b = finNumIn(v.balance); if (b !== null) finAddSnaps([{ id: E.uid('bl'), acct: id, date: today, balance: ['credit_card', 'bnpl'].includes(v.kind) ? -Math.abs(b) : b, outstanding: ['credit_card', 'bnpl'].includes(v.kind) ? Math.abs(b) : null, source: 'canvas', at: nowISO() }]); return `added account ${v.name.trim()}${b !== null ? ' with ' + fm(b) : ''}`; } },
    inc: { title: 'New income', fields: [{ k: 'name', label: 'What', value: '' }, { k: 'amount', label: 'A month', type: 'number', value: '' }, { k: 'from', label: 'From', type: 'date', value: today }],
      save: v => { const n = finNumIn(v.amount); if (!v.name.trim() || n === null) return ''; const key = FIN.norm(v.name).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'income'; finSave(q => { q.inputs = FIN.setInput(q.inputs || [], { id: E.uid('in'), key, label: v.name.trim(), kind: 'income', amount: n, from: FIN.validDate(v.from) ? v.from : today, permanent: true }, today); }); return `added income ${v.name.trim()} ${fm(n)} a month`; } },
    com: { title: 'New instalment', fields: [{ k: 'name', label: 'What', value: '' }, { k: 'amount', label: 'A month', type: 'number', value: '' }, { k: 'left', label: 'Payments left', type: 'number', value: '' }],
      save: v => { const n = finNumIn(v.amount), left = finNumIn(v.left); if (!v.name.trim() || n === null) return ''; finSave(q => { q.installments = [...(q.installments || []), { key: 'm:' + FIN.payeeKey(v.name), name: v.name.trim(), amount: Math.abs(n), remaining: left, end: null, status: 'active', manual: true, last: today, at: nowISO(), by: 'you' }]; }); return `added instalment ${v.name.trim()} ${fm(Math.abs(n))} a month`; } },
    own: { title: 'New investment or property', fields: [{ k: 'name', label: 'What', value: '' }, { k: 'kind', label: 'Type', type: 'select', value: 'deposit', options: FIN_HKINDS.filter(([k]) => !['liability', 'managed'].includes(k)) }, { k: 'amount', label: 'Amount', type: 'number', value: '' }, { k: 'rate', label: 'Return % a year', type: 'number', value: '' }],
      save: v => { if (!v.name.trim()) return ''; const n = finNumIn(v.amount), r = finNumIn(v.rate); finSave(q => { q.holdings.push({ id: E.uid('h'), kind: v.kind || 'deposit', name: v.name.trim(), owner: 'me', custodian: 'me', currency: q.base, verified: false, log: [], events: [], unverified: [], ...(v.kind === 'property' ? { valuation: n, includeValue: n !== null } : { principal: n }), rate: r }); }); return `added ${v.name.trim()}${n !== null ? ' ' + fm(n) : ''}`; } },
    third: { title: 'New person', fields: [{ k: 'name', label: 'Name', value: '' }, { k: 'match', label: 'Words in the statement that mean them', value: '' }],
      save: v => { if (!v.name.trim()) return ''; finSave(q => { q.parties.push({ id: E.uid('pt'), name: v.name.trim(), match: v.match || '' }); }); return `added ${v.name.trim()} (money you hold for others)`; } },
    buy: { title: 'New purchase goal', fields: [{ k: 'name', label: 'What', value: '' }, { k: 'price', label: 'Price', type: 'number', value: '' }, { k: 'wantBy', label: 'Wanted by', type: 'date', value: '' }],
      save: v => { const pr = finNumIn(v.price); if (!v.name.trim() || !pr) return ''; finSave(q => { q.buys = [...(q.buys || []), { id: E.uid('by'), name: v.name.trim(), price: Math.abs(pr), priority: 2, wantBy: FIN.validDate(v.wantBy) ? v.wantBy : '', at: nowISO() }]; }); return `added goal ${v.name.trim()} ${fm(Math.abs(pr))}`; } },
  };
  return S[br] || null;
}
const finCvSpecOf = E0 => E0 ? (E0.add ? finCvAddSpec(E0.add) : finCvSpec(E0.id)) : null;

// the form, over the canvas next to its card (not scaled with the canvas, so it is always readable)
function finCvEditorHTML() {
  const E0 = UI.fin.cvEdit, sp = finCvSpecOf(E0); if (!sp) return '';
  const f = (x, i) => { const v = E0.v[x.k] ?? x.value ?? '', id = `fin-cv-ed-${i}`;
    const input = x.type === 'select' ? `<select class="input sm" id="${id}" data-k="${esc(x.k)}">${x.options.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
      : `<input class="input sm ${x.type === 'number' ? 'num' : ''}" id="${id}" data-k="${esc(x.k)}" type="${x.type === 'date' ? 'date' : 'text'}" ${x.type === 'number' ? 'inputmode="decimal"' : ''} value="${esc(v)}" autocomplete="off">`;
    return `<label class="fin-cv-ed-f"><span>${esc(x.label)}</span>${input}</label>`; };
  return `<div class="fin-cv-ed" id="fin-cv-ed" role="dialog" aria-label="${E0.add ? esc(sp.title) : 'Edit ' + esc(sp.title)}">
    <b class="fin-cv-ed-t">${E0.add ? '＋ ' : '✎ '}${esc(sp.title)}</b>
    ${sp.fields.map(f).join('')}
    <div class="row">${!E0.add && sp.remove ? `<button class="btn sm ghost danger" data-act="fin-cv-ed-del">Remove</button>` : ''}<span class="spacer"></span><button class="btn sm" data-act="fin-cv-ed-x">Cancel</button><button class="btn sm primary" data-act="fin-cv-ed-ok">${E0.add ? 'Add' : 'Save'}</button></div></div>`;
}
// keep the form next to its card while the canvas moves
function finCvEditorPlace() {
  const ed = $('#fin-cv-ed'), E0 = UI.fin.cvEdit, vp = $('#fin-cv-vp'); if (!ed || !E0 || !vp) return;
  const b = UI.fin.cvPos && UI.fin.cvPos.get(E0.add || E0.id), cv = UI.fin.cv, W = vp.clientWidth, H = vp.clientHeight;
  let x = 16, y = 16; if (b) { x = cv.x + b.x * cv.k; y = cv.y + (b.y + b.h) * cv.k + 6; }
  x = Math.max(8, Math.min(x, W - ed.offsetWidth - 8)); if (y + ed.offsetHeight > H - 8) y = Math.max(8, (b ? cv.y + b.y * cv.k : H) - ed.offsetHeight - 6);
  y = Math.max(8, Math.min(y, H - ed.offsetHeight - 8));
  ed.style.left = x + 'px'; ed.style.top = y + 'px';
}
function finCvEditOpen(id, add) {
  const sp = add ? finCvAddSpec(add) : finCvSpec(id); if (!sp) return false;
  UI.fin.cvEdit = { id: id || null, add: add || null, v: {}, before: typeof finChangeIndex === 'function' ? finChangeIndex() : null }; UI.fin.goto = id || add; render();
  setTimeout(() => { const i = $('#fin-cv-ed-0'); if (i) { i.focus(); try { i.select(); } catch {} } }, 0); return true;
}
// a change on the canvas is a line in the conversation, with Undo — the same as a change said in words
function finCvEditDone(line, snap, ids) {
  const before = UI.fin.cvEdit && UI.fin.cvEdit.before; UI.fin.cvEdit = null; if (!line) { render(); return; }
  const m = { id: E.uid('tk'), at: nowISO(), who: 'edit', text: line, undoable: true };
  UI.fin.undo.set(m.id, snap); finTalkPush(m);
  UI.fin.flash = { ids: new Set(ids.filter(Boolean)), until: Date.now() + 5000 }; UI.fin.fixTried.clear();
  if (before && typeof finPresent === 'function') finPresent(before, ids.filter(Boolean));   // shown step by step, the whole canvas in view
  render();
}
const finCvEditIds = E0 => E0.add ? [E0.add] : [E0.id, E0.id.split(':')[0] === 'a' ? 'accts' : null];

document.addEventListener('input', e => { const ed = e.target.closest && e.target.closest('#fin-cv-ed'); if (ed && UI.fin.cvEdit && e.target.dataset.k) UI.fin.cvEdit.v[e.target.dataset.k] = e.target.value; });
document.addEventListener('change', e => { const ed = e.target.closest && e.target.closest('#fin-cv-ed'); if (ed && UI.fin.cvEdit && e.target.dataset.k) UI.fin.cvEdit.v[e.target.dataset.k] = e.target.value; });
document.addEventListener('keydown', e => {
  if (UI.view !== 'finance') return;
  if (e.target.closest && e.target.closest('#fin-cv-ed')) { if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); ACT['fin-cv-ed-ok'](); } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); ACT['fin-cv-ed-x'](); } return; }
  const n = e.target.closest && e.target.closest('#fin-cv-vp .fin-cvn[data-node]'); if (n && e.key === 'F2') { e.preventDefault(); finCvEditOpen(n.dataset.node); }
}, true);
// on a card that can be edited: one tap opens it (a moment later), a second tap at once opens the form instead
document.addEventListener('click', e => {
  const n = e.target.closest && e.target.closest('#fin-cv-vp .fin-leaf.editable'); if (!n || e.target.closest('.fin-cv-btn') || FCV.moved) return;
  e.stopPropagation(); e.preventDefault();
  const node = n.dataset.node;
  if (e.detail >= 2 || (UI.fin.clickT && UI.fin.clickNode === node)) { clearTimeout(UI.fin.clickT); UI.fin.clickT = null; UI.fin.panel = null; finCvEditOpen(node); return; }
  clearTimeout(UI.fin.clickT); UI.fin.clickNode = node;
  UI.fin.clickT = setTimeout(() => { UI.fin.clickT = null; const cur = document.querySelector(`#fin-cv-vp .fin-cvn[data-node="${CSS.escape(node)}"]`); if (cur && ACT[cur.dataset.act]) { const m = cur.dataset.act === 'fin-sec' ? cur : cur; UI.fin.panelGoto = node; ACT[m.dataset.act](m); } }, 260);
}, true);
HOOKS.afterRender.push(() => { if (UI.view === 'finance' && UI.fin.cvEdit) finCvEditorPlace(); });

Object.assign(ACT, {
  'fin-cv-edit': (el, e) => { e && e.stopPropagation && e.stopPropagation(); finCvEditOpen(el.dataset.id); },
  'fin-cv-add': (el, e) => { e && e.stopPropagation && e.stopPropagation(); UI.fin.cvCol.delete(el.dataset.id); finCvEditOpen(null, el.dataset.id); },
  'fin-cv-ed-x': () => { UI.fin.cvEdit = null; render(); },
  'fin-cv-ed-ok': () => {
    const E0 = UI.fin.cvEdit, sp = finCvSpecOf(E0); if (!sp) { UI.fin.cvEdit = null; render(); return; }
    // the form's current values (also those typed but not yet reported)
    document.querySelectorAll('#fin-cv-ed [data-k]').forEach(i => { E0.v[i.dataset.k] = i.value; });
    const v = Object.fromEntries(sp.fields.map(x => [x.k, E0.v[x.k] ?? String(x.value ?? '')]));
    const snap = finSnapshot(); let line = '';
    try { line = sp.save(v) || ''; } catch (e) { console.error(e); toast('That could not be saved: ' + (e.message || e), { err: true }); }
    if (E0.add && !line) { toast(sp.fields.some(x => x.type === 'number') ? 'Give it a name and an amount.' : 'Give it a name.', { err: true }); return; }
    finCvEditDone(line, snap, finCvEditIds(E0));
  },
  'fin-cv-ed-del': () => { const E0 = UI.fin.cvEdit, sp = finCvSpecOf(E0); if (!sp || !sp.remove) return; const snap = finSnapshot(); finCvEditDone(sp.remove(), snap, [E0.id.split(':')[0] === 'b' ? 'buy' : null]); },
});
Object.assign(window.__FIN, { edit: (id, v) => { if (!finCvEditOpen(id)) return false; Object.assign(UI.fin.cvEdit.v, v || {}); render(); return true; } });
