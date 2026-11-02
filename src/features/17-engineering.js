/* ---------- Engineering: procurement tracker, equipment list, transmittals and RFIs, drawing revision compare, conflict finder, search everything ---------- */
addCols('procure', 'equip', 'eng');
TOOL_TABS.push(['procure', '🚚 Procurement'], ['equip', '⚙️ Equipment list'], ['transmit', '📨 Transmittal / RFI'], ['dwgcmp', '🔍 Drawing compare'], ['conflict', '⚠️ Conflict finder'], ['search', '🔎 Search everything']);
Object.assign(TOOL_FN, { procure: () => procureHTML(), equip: () => equipHTML(), transmit: () => transmitHTML(), dwgcmp: () => dwgHTML(), conflict: () => conflictHTML(), search: () => searchAllHTML() });

/* --- a small editable register (one row per document in a collection) --- */
function regCell(col, x, f) {
  const v = x[f.k] ?? '', a = `data-chg="reg-f" data-col="${col}" data-id="${esc(x.id)}" data-k="${f.k}"${f.num ? ' data-num="1"' : ''}`;
  if (f.opts) return `<select class="input hold-render" ${a}>${f.opts.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  return `<input class="input hold-render ${f.num ? 'num' : ''}" ${a} value="${esc(v)}" ${f.date ? 'type="date"' : f.num ? 'inputmode="decimal"' : ''} ${f.list ? `list="${f.list}"` : ''} dir="auto" style="${f.w ? 'width:' + f.w + 'px' : ''}">`;
}
Object.assign(CHG, {
  'reg-f': el => { const c = el.dataset.col, x = St.cols[c].get(el.dataset.id); if (!x) return; let v = el.value.trim(); if (el.dataset.num) v = v === '' ? '' : (monNum(v) ?? v); colPut(c, { ...x, [el.dataset.k]: v }); if (el.tagName === 'SELECT' || ['po', 'lead', 'need', 'promised', 'status'].includes(el.dataset.k)) render(); },
});
async function regExport(name, head, rows) {
  const X = await E.need('xlsx'); const wb = X.utils.book_new(); const ws = X.utils.aoa_to_sheet([head, ...rows]); ws['!cols'] = head.map(h => ({ wch: Math.max(10, Math.min(40, h.length + 6)) }));
  X.utils.book_append_sheet(wb, ws, name.slice(0, 30)); await offerFile(`${name.toLowerCase().replace(/\W+/g, '-')}-${T()}.xlsx`, new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })]));
}
// an Excel sheet → rows matched to the register's fields by their header names
async function regImport(file, fields, col, extra = {}) {
  const X = await E.need('xlsx'); const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const grid = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const hi = grid.findIndex(r => r.filter(c => String(c).trim()).length >= 2); if (hi < 0) return 0;
  const head = grid[hi].map(h => E.normMatch(String(h)));
  const idx = Object.fromEntries(fields.map(f => [f.k, head.findIndex(h => h && (f.match || [f.label]).some(m => h.includes(E.normMatch(m))))]));
  let n = 0;
  for (const r of grid.slice(hi + 1)) {
    if (!r.some(c => String(c).trim())) continue;
    const x = { id: E.uid(col.slice(0, 2)), createdAt: nowISO(), ...extra };
    for (const f of fields) if (idx[f.k] >= 0) { let v = r[idx[f.k]]; if (v instanceof Date) v = v.toISOString().slice(0, 10); else if (f.date) v = monDate(v) || String(v); x[f.k] = f.num ? (monNum(v) ?? '') : String(v).trim(); }
    colPut(col, x); n++;
  }
  return n;
}

/* --- procurement tracker --- */
const PR_STAGES = [['rfq', 'RFQ sent'], ['offers', 'Offers in'], ['tbe', 'TBE / clarifications'], ['po', 'PO issued'], ['docs', 'Vendor drawings'], ['approved', 'Drawings approved'], ['mfg', 'Manufacturing'], ['fat', 'FAT / inspection'], ['shipped', 'Shipped'], ['delivered', 'Delivered to site'], ['installed', 'Installed']];
const PR_FIELDS = [{ k: 'item', label: 'Package / item', match: ['package', 'item', 'description', 'equipment'], w: 220 }, { k: 'tag', label: 'Tags', match: ['tag'], w: 110 }, { k: 'project', label: 'Project', list: 'pr-projs', w: 120 }, { k: 'supplier', label: 'Supplier', match: ['supplier', 'vendor', 'manufacturer'], w: 150 }, { k: 'status', label: 'Stage', opts: PR_STAGES, match: ['status', 'stage'] }, { k: 'pono', label: 'PO no.', match: ['po no', 'po number', 'purchase order'], w: 110 }, { k: 'po', label: 'PO date', date: true, match: ['po date'] }, { k: 'lead', label: 'Lead time (weeks)', num: true, match: ['lead'], w: 70 }, { k: 'need', label: 'Needed on site', date: true, match: ['required', 'need', 'ros'] }, { k: 'promised', label: 'Promised delivery', date: true, match: ['promised', 'delivery', 'eta'] }];
function prExpected(x) { if (x.promised) return x.promised; if (x.po && +x.lead > 0) return E.addDays(x.po, Math.round(+x.lead * 7)); return ''; }
function prState(x) {
  const st = PR_STAGES.findIndex(s => s[0] === x.status), exp = prExpected(x), done = st >= PR_STAGES.findIndex(s => s[0] === 'delivered');
  const late = !done && x.need && exp && exp > x.need ? Math.round((Date.parse(exp) - Date.parse(x.need)) / 864e5) : 0;
  const poLate = !done && x.need && +x.lead > 0 && st < 3 ? Math.round((Date.parse(E.addDays(T(), Math.round(+x.lead * 7))) - Date.parse(x.need)) / 864e5) : 0; // no PO yet: ordering today still in time?
  return { st, exp, done, late, poLate: poLate > 0 ? poLate : 0 };
}
function procureHTML() {
  const q = E.normMatch(UI.prQ || ''), all = colList('procure').sort((a, b) => (a.need || '9').localeCompare(b.need || '9'));
  const rows = all.filter(x => !q || E.normMatch([x.item, x.tag, x.supplier, x.project, x.pono].join(' ')).includes(q));
  const late = all.filter(x => prState(x).late || prState(x).poLate);
  return `<section class="card pad"><div class="section-title"><h2>Procurement tracker</h2><span class="spacer"></span><button class="btn sm primary" data-act="pr-add">${I.plus} Item</button><label class="btn sm" for="pr-imp">⬆ Import Excel</label><input id="pr-imp" type="file" accept=".xlsx,.xls,.csv" hidden data-chg="pr-imp"><button class="btn sm" data-act="pr-export" ${all.length ? '' : 'disabled'}>⬇ Excel</button></div>
    <p class="small muted" style="margin:0">Every package from RFQ to installation. Expected delivery = promised date, or PO date + lead time; it is flagged when it lands after the date it is needed on site — and before the PO, when ordering today would already be too late.</p>
    ${late.length ? callout('crit', `<p><b>${late.length} item${late.length > 1 ? 's' : ''} at risk:</b> ${late.slice(0, 6).map(x => { const s = prState(x); return `${esc(x.item || x.tag || 'item')} (${s.late ? s.late + ' d late' : 'order now — ' + s.poLate + ' d short'})`; }).join(', ')}</p>`) : ''}
    <div class="toolbar row"><label class="search">${I.search}<input class="input" type="search" placeholder="Search item, tag, supplier, PO…" value="${esc(UI.prQ || '')}" data-chg="eng-q" data-k="prQ"></label></div>
    <div class="mon-scroll"><table class="tbl reg-tbl"><thead><tr>${PR_FIELDS.map(f => `<th>${esc(f.label)}</th>`).join('')}<th>Expected</th><th>Progress</th><th></th></tr></thead><tbody>${rows.map(x => { const s = prState(x); return `<tr class="${s.late || s.poLate ? 'risk' : ''}">${PR_FIELDS.map(f => `<td>${regCell('procure', x, f)}</td>`).join('')}
      <td class="nowrap ${s.late ? 'crit' : ''}">${s.exp ? esc(fmtDate(s.exp)) : '—'}${s.late ? `<div class="small">${s.late} d after needed</div>` : s.poLate ? `<div class="small crit">order now: ${s.poLate} d short</div>` : ''}</td>
      <td><div class="pr-steps" title="${esc((PR_STAGES[s.st] || [, ''])[1])}">${PR_STAGES.map((_, i) => `<i class="${i <= s.st ? 'on' : ''}"></i>`).join('')}</div></td>
      <td class="nowrap"><button class="icon-btn" data-act="pr-chase" data-id="${esc(x.id)}" title="Make a chase task" aria-label="Chase supplier">⏰</button><button class="icon-btn" data-act="reg-del" data-col="procure" data-id="${esc(x.id)}" aria-label="Delete">${I.x}</button></td></tr>`; }).join('')}</tbody></table></div>
    <datalist id="pr-projs">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist>
    ${all.length ? '' : '<p class="small muted">No items yet — add one, or import your procurement log from Excel (columns like Item, Supplier, PO date, Lead time, Required on site).</p>'}</section>`;
}
Object.assign(ACT, {
  'pr-add': () => { colPut('procure', { id: E.uid('pr'), item: '', status: 'rfq', createdAt: nowISO() }); render(); },
  'reg-del': el => { colDel(el.dataset.col, el.dataset.id); render(); },
  'pr-export': () => regExport('Procurement', [...PR_FIELDS.map(f => f.label), 'Expected delivery', 'Days late'], colList('procure').map(x => { const s = prState(x); return [...PR_FIELDS.map(f => f.opts ? (f.opts.find(o => o[0] === x[f.k]) || [, ''])[1] : x[f.k] ?? ''), s.exp, s.late || '']; })),
  'pr-chase': el => {
    const x = St.cols.procure.get(el.dataset.id); if (!x) return; const s = prState(x);
    const t = makeTask({ title: `Chase ${x.supplier || 'supplier'}: ${x.item || x.tag}${s.st >= 0 ? ' — ' + PR_STAGES[s.st][1] : ''}`, ownership: 'waiting', owner: x.supplier || '', project: x.project || '', type: 'follow_up', priority: s.late || s.poLate ? 'high' : 'medium', deadline: E.addDays(T(), 3), nextStep: s.late ? `Expected ${fmtDate(s.exp)} is ${s.late} days after the site needs it (${fmtDate(x.need)}).` : '', notes: `PO ${x.pono || '—'}, lead time ${x.lead || '—'} weeks.` });
    putTask(t); toast('Chase task added.', { action: 'Open', fn: () => openDrawer('task', t.id) }); render();
  },
});
Object.assign(CHG, {
  'eng-q': el => { UI[el.dataset.k] = el.value; render(); },
  'pr-imp': async el => { const f = el.files[0]; if (!f) return; const n = await regImport(f, PR_FIELDS.filter(f => !f.opts), 'procure', { status: 'rfq' }); toast(`${n} item${n === 1 ? '' : 's'} imported.`); render(); },
});

/* --- equipment list --- */
const EQ_STATUS = [['spec', 'Specified'], ['tbe', 'TBE'], ['po', 'Ordered'], ['approved', 'Datasheet approved'], ['delivered', 'Delivered'], ['installed', 'Installed'], ['commissioned', 'Commissioned']];
const EQ_FIELDS = [{ k: 'tag', label: 'Tag', w: 100 }, { k: 'desc', label: 'Description', match: ['description', 'equipment', 'service', 'item'], w: 220 }, { k: 'project', label: 'Project', list: 'pr-projs', w: 110 }, { k: 'area', label: 'Area / system', match: ['area', 'system', 'location', 'unit'], w: 120 }, { k: 'qty', label: 'Qty', num: true, match: ['qty', 'quantity', 'no.'], w: 56 }, { k: 'duty', label: 'Duty / size', match: ['duty', 'capacity', 'size', 'rating'], w: 160 }, { k: 'kw', label: 'kW', num: true, match: ['kw', 'power', 'motor'], w: 64 }, { k: 'supplier', label: 'Supplier', match: ['supplier', 'vendor', 'make', 'manufacturer'], w: 130 }, { k: 'ds', label: 'Datasheet no.', match: ['datasheet', 'data sheet', 'document'], w: 150 }, { k: 'status', label: 'Status', opts: EQ_STATUS }];
function equipHTML() {
  const q = E.normMatch(UI.eqQ || ''), all = colList('equip').sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || ''), undefined, { numeric: true }));
  const rows = all.filter(x => !q || E.normMatch([x.tag, x.desc, x.area, x.supplier, x.project, x.duty].join(' ')).includes(q));
  const known = new Set(all.map(x => E.normMatch(x.tag || ''))), found = typeof equipmentTags === 'function' ? equipmentTags().filter(t => !known.has(E.normMatch(t.tag))) : [];
  const kw = rows.reduce((s, x) => s + (+x.kw || 0) * (+x.qty || 1), 0);
  return `<section class="card pad"><div class="section-title"><h2>Equipment list</h2><span class="spacer"></span><button class="btn sm primary" data-act="eq-add">${I.plus} Equipment</button><label class="btn sm" for="eq-imp">⬆ Import Excel</label><input id="eq-imp" type="file" accept=".xlsx,.xls,.csv" hidden data-chg="eq-imp"><button class="btn sm" data-act="eq-export" ${all.length ? '' : 'disabled'}>⬇ Excel</button></div>
    ${found.length ? callout('info', `<div class="row"><span>${found.length} tag${found.length > 1 ? 's' : ''} found in your emails and tasks are not in the list (${esc(found.slice(0, 8).map(t => t.tag).join(', '))}${found.length > 8 ? '…' : ''}).</span><span class="spacer"></span><button class="btn sm" data-act="eq-found">Add them</button></div>`) : ''}
    <div class="toolbar row"><label class="search">${I.search}<input class="input" type="search" placeholder="Search tag, description, area, supplier…" value="${esc(UI.eqQ || '')}" data-chg="eng-q" data-k="eqQ"></label><span class="small muted">${rows.length} items · installed power ${fmtNum(kw, 1)} kW</span></div>
    <div class="mon-scroll"><table class="tbl reg-tbl"><thead><tr>${EQ_FIELDS.map(f => `<th>${esc(f.label)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.map(x => `<tr>${EQ_FIELDS.map(f => `<td>${regCell('equip', x, f)}</td>`).join('')}<td class="nowrap">${colList('procure').some(p => p.tag && E.normMatch(p.tag).includes(E.normMatch(x.tag || '~'))) ? '<span class="chip" title="In the procurement tracker">🚚</span>' : `<button class="icon-btn" data-act="eq-to-pr" data-id="${esc(x.id)}" title="Add to procurement" aria-label="Add to procurement">🚚</button>`}<button class="icon-btn" data-act="reg-del" data-col="equip" data-id="${esc(x.id)}" aria-label="Delete">${I.x}</button></td></tr>`).join('')}</tbody></table></div>
    <datalist id="pr-projs">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist></section>`;
}
Object.assign(ACT, {
  'eq-add': () => { colPut('equip', { id: E.uid('eq'), tag: '', status: 'spec', qty: 1, createdAt: nowISO() }); render(); },
  'eq-found': () => { const known = new Set(colList('equip').map(x => E.normMatch(x.tag || ''))); let n = 0; for (const t of equipmentTags()) if (!known.has(E.normMatch(t.tag))) { const tk = St.tasks.get([...(t.tasks || [])][0]); colPut('equip', { id: E.uid('eq'), tag: t.tag, desc: '', project: (tk && tk.project) || '', qty: 1, status: 'spec', createdAt: nowISO() }); n++; } toast(`${n} tag${n === 1 ? '' : 's'} added.`); render(); },
  'eq-export': () => regExport('Equipment list', EQ_FIELDS.map(f => f.label), colList('equip').map(x => EQ_FIELDS.map(f => f.opts ? (f.opts.find(o => o[0] === x[f.k]) || [, ''])[1] : x[f.k] ?? ''))),
  'eq-to-pr': el => { const x = St.cols.equip.get(el.dataset.id); if (!x) return; colPut('procure', { id: E.uid('pr'), item: x.desc || x.tag, tag: x.tag, project: x.project, supplier: x.supplier || '', status: 'rfq', createdAt: nowISO() }); toast('Added to the procurement tracker.'); render(); },
});
Object.assign(CHG, { 'eq-imp': async el => { const f = el.files[0]; if (!f) return; const n = await regImport(f, EQ_FIELDS.filter(f => !f.opts), 'equip', { status: 'spec' }); toast(`${n} item${n === 1 ? '' : 's'} imported.`); render(); } });

/* --- transmittals and RFIs (Word documents with a running number; an RFI also becomes a waiting task) --- */
UI.tr = UI.tr || { kind: 'transmittal', sel: new Set(), rows: [] };
const engLog = kind => colList('eng').filter(x => x.kind === kind).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
function nextNo(kind, project) {
  const pre = `${(project || 'PRJ').replace(/[^\w]+/g, '').slice(0, 8).toUpperCase() || 'PRJ'}-${kind === 'rfi' ? 'RFI' : 'TR'}-`;
  const max = engLog(kind).filter(x => (x.no || '').startsWith(pre)).reduce((m, x) => Math.max(m, +(x.no.slice(pre.length)) || 0), 0);
  return pre + String(max + 1).padStart(3, '0');
}
function transmitHTML() {
  const S = UI.tr, rfi = S.kind === 'rfi', proj = S.project || projectsList()[0] || '';
  const docs = colList('docreg').filter(d => !proj || d.project === proj).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const log = engLog(S.kind);
  return `<div class="seg"><button data-act="tr-kind" data-k="transmittal" aria-pressed="${!rfi}">📨 Transmittal</button><button data-act="tr-kind" data-k="rfi" aria-pressed="${rfi}">❓ Request for information (RFI)</button></div>
    <section class="card pad tr-form"><div class="grid2">
      <label class="field"><span>Project</span><input class="input hold-render" id="tr-project" list="pr-projs" value="${esc(proj)}" data-chg="tr-project"></label>
      <label class="field"><span>Number</span><input class="input hold-render mono" id="tr-no" value="${esc(S.no || nextNo(S.kind, proj))}"></label>
      <label class="field"><span>To (company)</span><input class="input hold-render" id="tr-to" value="${esc(S.to || '')}" dir="auto"></label>
      <label class="field"><span>Attention</span><input class="input hold-render" id="tr-att" value="${esc(S.att || '')}" dir="auto"></label>
      ${rfi ? `<label class="field" style="grid-column:1/-1"><span>Subject</span><input class="input hold-render" id="tr-subj" value="${esc(S.subj || '')}" dir="auto"></label>
        <label class="field" style="grid-column:1/-1"><span>Question</span><textarea class="input hold-render" id="tr-q" rows="4" dir="auto">${esc(S.q || '')}</textarea></label>
        <label class="field" style="grid-column:1/-1"><span>Background / reference (drawing, spec clause)</span><textarea class="input hold-render" id="tr-bg" rows="3" dir="auto">${esc(S.bg || '')}</textarea></label>
        <label class="field" style="grid-column:1/-1"><span>Proposed solution (optional)</span><textarea class="input hold-render" id="tr-prop" rows="3" dir="auto">${esc(S.prop || '')}</textarea></label>
        <label class="field"><span>Answer needed by</span><input class="input hold-render" id="tr-due" type="date" value="${esc(S.due || E.addDays(T(), 7))}"></label>
        <label class="field"><span>Impact if late</span><input class="input hold-render" id="tr-impact" value="${esc(S.impact || '')}" placeholder="e.g. holds pump base concrete pour" dir="auto"></label>` :
        `<label class="field"><span>Purpose</span><select class="input" id="tr-purpose">${['For approval', 'For review and comment', 'For information', 'For construction', 'As built', 'Resubmission'].map(p => `<option ${S.purpose === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label class="field"><span>Sent as</span><select class="input" id="tr-via">${['Email', 'Document control system', 'Hard copy', 'USB / CD'].map(p => `<option ${S.via === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>`}
    </div>
    ${rfi ? '' : `<div class="label">Documents ${docs.length ? '(from the document register — tick to include)' : ''}</div>
      ${docs.length ? `<div class="tr-docs">${docs.slice(0, 80).map(d => `<label class="check small"><input type="checkbox" data-chg="tr-pick" data-id="${esc(d.id)}" ${S.sel.has(d.id) ? 'checked' : ''}><span class="mono">${esc(d.number || '—')}</span> <span dir="auto">${esc(E.clip(d.title || '', 70))}</span> <span class="chip">Rev ${esc(d.revision || '—')}</span></label>`).join('')}</div>` : ''}
      ${S.rows.map((r, i) => `<div class="row"><input class="input hold-render mono" placeholder="Document no." value="${esc(r.number)}" data-chg="tr-row" data-i="${i}" data-k="number" style="width:200px"><input class="input hold-render" placeholder="Title" value="${esc(r.title)}" data-chg="tr-row" data-i="${i}" data-k="title" style="flex:1" dir="auto"><input class="input hold-render" placeholder="Rev" value="${esc(r.rev)}" data-chg="tr-row" data-i="${i}" data-k="rev" style="width:64px"><button class="icon-btn" data-act="tr-row-del" data-i="${i}" aria-label="Remove">${I.x}</button></div>`).join('')}
      <div class="row"><button class="btn sm" data-act="tr-row-add">${I.plus} Other document</button></div>`}
    <label class="field"><span>Remarks</span><textarea class="input hold-render" id="tr-rem" rows="2" dir="auto">${esc(S.rem || '')}</textarea></label>
    <div class="row end"><button class="btn primary" data-act="tr-make">📄 Make ${rfi ? 'RFI' : 'transmittal'} (Word)</button></div></section>
    ${log.length ? `<section class="card pad"><div class="section-title"><h2>${rfi ? 'RFI log' : 'Transmittal log'}</h2><span class="spacer"></span><button class="btn sm" data-act="tr-log-export" data-k="${S.kind}">⬇ Excel</button></div><div class="mon-scroll"><table class="tbl"><thead><tr><th>No.</th><th>Date</th><th>To</th><th>${rfi ? 'Subject' : 'Documents'}</th>${rfi ? '<th>Answer by</th><th>Status</th>' : '<th>Purpose</th>'}<th></th></tr></thead><tbody>${log.map(x => `<tr><td class="mono nowrap">${esc(x.no)}</td><td class="nowrap">${esc(fmtDate(x.date))}</td><td dir="auto">${esc(x.to || '')}</td><td dir="auto">${esc(rfi ? x.subj : (x.docs || []).map(d => d.number).join(', '))}</td>${rfi ? `<td class="nowrap">${esc(fmtDate(x.due))}</td><td>${x.answered ? '<span class="chip ok">Answered</span>' : `<button class="btn sm ghost" data-act="rfi-answered" data-id="${esc(x.id)}">Mark answered</button>`}</td>` : `<td>${esc(x.purpose || '')}</td>`}<td><button class="btn sm ghost" data-act="tr-again" data-id="${esc(x.id)}">Word</button></td></tr>`).join('')}</tbody></table></div></section>` : ''}
    <datalist id="pr-projs">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
}
function trRead() { const v = id => (($('#' + id) || {}).value || '').trim(); const S = UI.tr; Object.assign(S, { project: v('tr-project'), no: v('tr-no'), to: v('tr-to'), att: v('tr-att'), subj: v('tr-subj'), q: v('tr-q'), bg: v('tr-bg'), prop: v('tr-prop'), due: v('tr-due'), impact: v('tr-impact'), purpose: v('tr-purpose') || S.purpose, via: v('tr-via') || S.via, rem: v('tr-rem') }); return S; }
async function trDocx(x) {
  const me = St.settings.me, head = [['Project', x.project || ''], ['Number', x.no], ['Date', fmtDate(x.date, { day: 'numeric', month: 'long', year: 'numeric' })], ['To', x.to || ''], ['Attention', x.att || ''], ['From', [me.name, me.org].filter(Boolean).join(', ')]];
  if (x.kind === 'rfi') return docxDoc(`Request for information ${x.no}`, x.subj || '', [
    { table: { head: ['', ''], rows: [...head, ['Answer needed by', fmtDate(x.due)], ...(x.impact ? [['Impact if late', x.impact]] : [])] } },
    { h: 'Question', p: String(x.q || '').split('\n') }, ...(x.bg ? [{ h: 'Background and references', p: x.bg.split('\n') }] : []), ...(x.prop ? [{ h: 'Proposed solution', p: x.prop.split('\n') }] : []), ...(x.rem ? [{ h: 'Remarks', p: x.rem.split('\n') }] : []),
    { h: 'Reply', p: ['', '', ''], table: { head: ['Answered by', 'Date', 'Signature'], rows: [['', '', '']] } },
  ]);
  return docxDoc(`Document transmittal ${x.no}`, `${x.purpose || ''} · sent by ${x.via || 'email'}`, [
    { table: { head: ['', ''], rows: head } },
    { h: 'Documents', table: { head: ['No.', 'Document number', 'Title', 'Rev', 'Purpose'], rows: (x.docs || []).map((d, i) => [String(i + 1), d.number || '', d.title || '', d.rev || '', x.purpose || '']) } },
    ...(x.rem ? [{ h: 'Remarks', p: x.rem.split('\n') }] : []),
    { h: 'Acknowledgement of receipt', table: { head: ['Received by', 'Date', 'Signature'], rows: [['', '', '']] } },
  ]);
}
Object.assign(ACT, {
  'tr-kind': el => { trRead(); UI.tr.kind = el.dataset.k; UI.tr.no = ''; render(); },
  'tr-row-add': () => { trRead(); UI.tr.rows.push({ number: '', title: '', rev: '' }); render(); },
  'tr-row-del': el => { trRead(); UI.tr.rows.splice(+el.dataset.i, 1); render(); },
  'tr-make': async () => {
    const S = trRead(), rfi = S.kind === 'rfi';
    if (rfi && !S.q) return toast('Write the question first.', { err: true });
    const docs = rfi ? [] : [...colList('docreg').filter(d => S.sel.has(d.id)).map(d => ({ number: d.number, title: d.title, rev: d.revision })), ...S.rows.filter(r => r.number || r.title)];
    if (!rfi && !docs.length) return toast('Tick or add at least one document.', { err: true });
    const x = { id: E.uid('en'), kind: S.kind, no: S.no || nextNo(S.kind, S.project), date: T(), project: S.project, to: S.to, att: S.att, subj: S.subj, q: S.q, bg: S.bg, prop: S.prop, due: S.due, impact: S.impact, purpose: S.purpose, via: S.via, rem: S.rem, docs, createdAt: nowISO() };
    if (rfi) { const t = makeTask({ title: `${x.no}: answer to “${E.clip(x.subj || x.q, 80)}”`, ownership: 'waiting', owner: x.att || x.to || '', type: 'follow_up', project: x.project || '', deadline: x.due || null, priority: x.impact ? 'high' : 'medium', notes: x.q }); putTask(t); x.taskId = t.id; }
    colPut('eng', x);
    await offerFile(`${x.no}.docx`, await trDocx(x));
    Object.assign(UI.tr, { no: '', subj: '', q: '', bg: '', prop: '', rem: '', impact: '', sel: new Set(), rows: [] });
    toast(rfi ? `${x.no} made — a waiting task tracks the answer.` : `${x.no} made.`); render();
  },
  'tr-again': async el => { const x = St.cols.eng.get(el.dataset.id); if (x) await offerFile(`${x.no}.docx`, await trDocx(x)); },
  'rfi-answered': el => { const x = St.cols.eng.get(el.dataset.id); if (!x) return; colPut('eng', { ...x, answered: T() }); const t = x.taskId && St.tasks.get(x.taskId); if (t && t.status !== 'done') putTask({ ...t, status: 'done', completedAt: nowISO(), updatedAt: nowISO() }); render(); },
  'tr-log-export': el => { const rfi = el.dataset.k === 'rfi'; regExport(rfi ? 'RFI log' : 'Transmittal log', rfi ? ['No.', 'Date', 'Project', 'To', 'Subject', 'Answer by', 'Answered'] : ['No.', 'Date', 'Project', 'To', 'Purpose', 'Documents'], engLog(el.dataset.k).map(x => rfi ? [x.no, x.date, x.project, x.to, x.subj, x.due, x.answered || ''] : [x.no, x.date, x.project, x.to, x.purpose, (x.docs || []).map(d => `${d.number} Rev ${d.rev || '—'}`).join('; ')])); },
});
Object.assign(CHG, {
  'tr-project': () => { trRead(); UI.tr.no = ''; render(); },
  'tr-pick': el => { el.checked ? UI.tr.sel.add(el.dataset.id) : UI.tr.sel.delete(el.dataset.id); },
  'tr-row': el => { UI.tr.rows[+el.dataset.i][el.dataset.k] = el.value.trim(); },
});

/* --- drawing revision compare: two PDFs or images, page by page; red = removed, blue = added --- */
UI.dwg = UI.dwg || { a: null, b: null, page: 1, busy: false, res: null };
async function dwgPages(f) {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
    const pdfjs = await E.need('pdf'); const doc = await pdfjs.getDocument({ data: f.bytes.slice() }).promise;
    const pages = [];
    for (let p = 1; p <= Math.min(doc.numPages, 30); p++) { const pg = await doc.getPage(p); const tc = await pg.getTextContent(); pages.push({ p, pg, text: tc.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim(), lines: [...new Set(tc.items.map(i => i.str.trim()).filter(s => s.length > 1))] }); }
    return { kind: 'pdf', n: doc.numPages, pages };
  }
  const img = new Image(); img.src = URL.createObjectURL(new Blob([f.bytes], { type: f.type || 'image/png' })); await img.decode();
  return { kind: 'img', n: 1, pages: [{ p: 1, img, text: '', lines: [] }] };
}
async function dwgRaster(P, page, W) {
  const x = P.pages[page - 1]; if (!x) return null;
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  if (x.pg) { const v0 = x.pg.getViewport({ scale: 1 }), s = W / Math.max(v0.width, v0.height), vp = x.pg.getViewport({ scale: s }); c.width = Math.round(vp.width); c.height = Math.round(vp.height); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); await x.pg.render({ canvasContext: ctx, viewport: vp }).promise; }
  else { const s = W / Math.max(x.img.width, x.img.height); c.width = Math.round(x.img.width * s); c.height = Math.round(x.img.height * s); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(x.img, 0, 0, c.width, c.height); }
  return c;
}
// ink = dark pixel; a little tolerance (1 px) so the same line drawn slightly differently is not a change
async function dwgCompare() {
  const D = UI.dwg; D.busy = true; render();
  try {
    if (!D.pa) D.pa = await dwgPages(D.a); if (!D.pb) D.pb = await dwgPages(D.b);
    const W = 1800, ca = await dwgRaster(D.pa, D.page, W), cb = await dwgRaster(D.pb, D.page, W);
    if (!ca || !cb) throw new Error('That page is missing in one of the files.');
    const w = Math.max(ca.width, cb.width), h = Math.max(ca.height, cb.height);
    const get = c => { const x = document.createElement('canvas'); x.width = w; x.height = h; const g = x.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(c, 0, 0); return g.getImageData(0, 0, w, h).data; };
    const A = get(ca), B = get(cb), ink = (d, i) => d[i] + d[i + 1] + d[i + 2] < 600;
    const near = (d, x, y) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && ink(d, (yy * w + xx) * 4)) return true; } return false; };
    const out = document.createElement('canvas'); out.width = w; out.height = h; const og = out.getContext('2d'), od = og.createImageData(w, h), o = od.data;
    let rem = 0, add = 0; const boxes = [];
    const cell = 60, grid = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, ia = ink(A, i), ib = ink(B, i);
      let r = 255, g = 255, b = 255;
      if (ia && ib) { r = g = b = 185; }
      else if (ia && !near(B, x, y)) { r = 220; g = 30; b = 30; rem++; grid.set(`${x / cell | 0},${y / cell | 0}`, 1); }
      else if (ib && !near(A, x, y)) { r = 20; g = 90; b = 230; add++; grid.set(`${x / cell | 0},${y / cell | 0}`, 1); }
      else if (ia || ib) { r = g = b = 185; }
      o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255;
    }
    og.putImageData(od, 0, 0);
    // changed areas: neighbouring grid cells merged into boxes, drawn as orange frames
    const seen = new Set();
    for (const k of grid.keys()) {
      if (seen.has(k)) continue; const st = [k]; seen.add(k); let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      while (st.length) { const c = st.pop(); const [cx, cy] = c.split(',').map(Number); n++; x0 = Math.min(x0, cx); y0 = Math.min(y0, cy); x1 = Math.max(x1, cx); y1 = Math.max(y1, cy); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nk = `${cx + dx},${cy + dy}`; if (grid.has(nk) && !seen.has(nk)) { seen.add(nk); st.push(nk); } } }
      if (n >= 1) boxes.push({ x: x0 * cell, y: y0 * cell, w: (x1 - x0 + 1) * cell, h: (y1 - y0 + 1) * cell });
    }
    og.strokeStyle = 'rgba(255,140,0,.9)'; og.lineWidth = 4; for (const bx of boxes) og.strokeRect(bx.x - 6, bx.y - 6, bx.w + 12, bx.h + 12);
    const la = new Set(D.pa.pages[D.page - 1].lines), lb = new Set(D.pb.pages[D.page - 1].lines);
    D.res = { url: out.toDataURL('image/png'), w, h, rem, add, boxes: boxes.length, textRemoved: [...la].filter(s => !lb.has(s)).slice(0, 80), textAdded: [...lb].filter(s => !la.has(s)).slice(0, 80) };
  } catch (e) { D.res = { error: String(e.message || e) }; }
  D.busy = false; render();
}
function dwgHTML() {
  const D = UI.dwg, r = D.res, n = D.pa && D.pb ? Math.min(D.pa.n, D.pb.n, 30) : 0;
  return `<section class="card pad"><div class="section-title"><h2>Compare two revisions of a drawing</h2></div>
    <p class="small muted" style="margin:0">Choose the old and the new revision (PDF, PNG or JPG). The pages are overlaid: <b style="color:#d21e1e">red</b> was removed, <b style="color:#145ae6">blue</b> was added, grey is unchanged; changed areas are framed in orange. Text that changed (notes, title block, dimensions typed as text) is listed below. Works offline — nothing is uploaded.</p>
    <div class="grid2"><label class="field"><span>Old revision</span><input class="input" type="file" accept=".pdf,image/*" data-chg="dwg-file" data-k="a">${D.a ? `<span class="small muted">${esc(D.a.name)}</span>` : ''}</label>
      <label class="field"><span>New revision</span><input class="input" type="file" accept=".pdf,image/*" data-chg="dwg-file" data-k="b">${D.b ? `<span class="small muted">${esc(D.b.name)}</span>` : ''}</label></div>
    <div class="row">${n > 1 ? `<label class="field" style="width:auto"><span>Page</span><select class="input" data-chg="dwg-page">${Array.from({ length: n }, (_, i) => `<option ${D.page === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select></label>` : ''}<button class="btn primary" data-act="dwg-run" ${D.a && D.b && !D.busy ? '' : 'disabled'}>${D.busy ? 'Comparing…' : '🔍 Compare'}</button></div>
    ${r && r.error ? callout('crit', `<p>${esc(r.error)}</p>`) : ''}
    ${r && r.url ? `<div class="row small"><span class="chip ${r.boxes ? 'warn' : 'ok'}">${r.boxes ? `${r.boxes} changed area${r.boxes > 1 ? 's' : ''}` : 'No visible change'}</span><span class="muted">${r.rem.toLocaleString()} px removed · ${r.add.toLocaleString()} px added</span><span class="spacer"></span><button class="btn sm" data-act="dwg-save">⬇ Overlay (PNG)</button><button class="btn sm" data-act="dwg-task">${I.plus} Task: review the changes</button></div>
      <div class="dwg-view"><img src="${r.url}" alt="Overlay of the two revisions"></div>
      ${r.textRemoved.length || r.textAdded.length ? `<div class="grid2"><div><div class="label">Text removed</div><ul class="small">${r.textRemoved.map(s => `<li dir="auto" style="color:#d21e1e">${esc(s)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div><div><div class="label">Text added</div><ul class="small">${r.textAdded.map(s => `<li dir="auto" style="color:#145ae6">${esc(s)}</li>`).join('') || '<li class="muted">—</li>'}</ul></div></div>` : ''}` : ''}</section>`;
}
Object.assign(CHG, {
  'dwg-file': async el => { const f = el.files[0]; if (!f) return; UI.dwg[el.dataset.k] = { name: f.name, type: f.type, bytes: new Uint8Array(await f.arrayBuffer()) }; UI.dwg['p' + el.dataset.k] = null; UI.dwg.res = null; UI.dwg.page = 1; render(); },
  'dwg-page': el => { UI.dwg.page = +el.value; dwgCompare(); },
});
Object.assign(ACT, {
  'dwg-run': () => dwgCompare(),
  'dwg-save': async () => { const r = UI.dwg.res; if (!r || !r.url) return; const b = await (await fetch(r.url)).blob(); offerFile(`compare-${(UI.dwg.b.name || 'drawing').replace(/\.\w+$/, '')}-p${UI.dwg.page}.png`, b); },
  'dwg-task': () => { const D = UI.dwg, r = D.res; const t = makeTask({ title: `Review changes: ${D.b.name.replace(/\.\w+$/, '')} vs ${D.a.name.replace(/\.\w+$/, '')}`, type: 'review', notes: `${r.boxes} changed areas on page ${D.page}.${r.textAdded.length ? '\nText added: ' + r.textAdded.slice(0, 15).join('; ') : ''}${r.textRemoved.length ? '\nText removed: ' + r.textRemoved.slice(0, 15).join('; ') : ''}` }); putTask(t); openDrawer('task', t.id); },
});

/* --- conflict finder: requirements that disagree between documents (spec vs datasheet vs drawing notes) --- */
UI.cf = UI.cf || { files: [], busy: false, res: null };
function conflictHTML() {
  const C = UI.cf;
  return `<section class="card pad"><div class="section-title"><h2>Find conflicts between documents</h2></div>
    <p class="small muted" style="margin:0">Add 2–6 documents about the same equipment or package — specification, datasheet, drawing notes, offer, minutes. The AI lists values and requirements that disagree (IP rating, material, pressure class, voltage, coating…), quoting both documents; quotes are checked against the text.</p>
    <div class="row"><label class="btn" for="cf-files">${I.plus} Add documents</label><input id="cf-files" type="file" multiple hidden accept=".pdf,.docx,.xlsx,.xls,.txt,.csv,.eml,.msg" data-chg="cf-files">${C.files.map((f, i) => `<span class="chip">${esc(f.name)} <button class="icon-btn" data-act="cf-del" data-i="${i}" aria-label="Remove">${I.x}</button></span>`).join('')}</div>
    <div class="row"><button class="btn primary" data-act="cf-run" ${C.files.length >= 2 && St.sample && !C.busy ? '' : 'disabled'}>${C.busy ? 'Reading the documents…' : '⚠️ Find conflicts'}</button>${St.sample ? '' : '<span class="small muted">Needs an AI (Setup › Which AI).</span>'}${C.res && C.res.items && C.res.items.length ? '<button class="btn" data-act="cf-export">⬇ Excel</button>' : ''}</div>
    ${C.res && C.res.error ? callout('crit', `<p>${esc(C.res.error)}</p>`) : ''}
    ${C.res && C.res.items ? (C.res.items.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Topic</th><th>Document A says</th><th>Document B says</th><th>How serious</th><th>Suggestion</th><th></th></tr></thead><tbody>${C.res.items.map((x, i) => `<tr><td dir="auto"><b>${esc(x.topic)}</b></td>${[x.a, x.b].map(s => `<td dir="auto"><div class="small muted">${esc(s.doc)}</div>“${esc(s.quote)}” ${s.ok ? '<span class="chip ok" title="Found in the document">✓</span>' : '<span class="chip warn" title="Not found word for word — check">?</span>'}</td>`).join('')}<td><span class="chip ${x.severity === 'high' ? 'crit' : x.severity === 'medium' ? 'warn' : ''}">${esc(x.severity || '')}</span></td><td dir="auto" class="small">${esc(x.suggestion || '')}</td><td><button class="icon-btn" data-act="cf-task" data-i="${i}" title="Make a task" aria-label="Make a task">${I.plus}</button></td></tr>`).join('')}</tbody></table></div>` : callout('ok', '<p>No conflicts found between these documents.</p>')) : ''}</section>`;
}
Object.assign(CHG, { 'cf-files': async el => { for (const f of [...el.files].slice(0, 6 - UI.cf.files.length)) { const bytes = new Uint8Array(await f.arrayBuffer()); let text = ''; try { text = (await nbExtract(f.name, bytes)).text; } catch {} UI.cf.files.push({ name: f.name, text }); } UI.cf.res = null; render(); } });
Object.assign(ACT, {
  'cf-del': el => { UI.cf.files.splice(+el.dataset.i, 1); UI.cf.res = null; render(); },
  'cf-run': async () => {
    const C = UI.cf; C.busy = true; render();
    const per = Math.floor(150000 / C.files.length);
    const prompt = `Compare these engineering documents and list every requirement or value that CONFLICTS between them (different numbers, ratings, materials, standards, classes, voltages, coatings, scope). Ignore items that only one document mentions. Quote each side word for word (short quote), name the document, rate severity high / medium / low, and suggest what to ask or check.
${C.files.map((f, i) => `\n=== DOCUMENT ${i + 1}: ${f.name} ===\n${E.clip(f.text || '(no text could be read)', per)}`).join('\n')}

Reply JSON: {"conflicts":[{"topic":"…","a":{"doc":"file name","quote":"…"},"b":{"doc":"file name","quote":"…"},"severity":"high|medium|low","suggestion":"…"}]}`;
    try {
      const r = await St.sample.json(prompt, { modelTier: 'complex' });
      const norm = s => E.normMatch(s || '').replace(/\s+/g, ' ');
      const has = (doc, q) => { const f = C.files.find(x => x.name === doc) || C.files.find(x => norm(x.name).includes(norm(doc))); return !!(f && q && norm(f.text).includes(norm(q))); };
      C.res = { items: ((r && r.conflicts) || []).map(x => ({ topic: String(x.topic || ''), severity: String(x.severity || '').toLowerCase(), suggestion: String(x.suggestion || ''), a: { doc: String((x.a || {}).doc || ''), quote: String((x.a || {}).quote || ''), ok: has((x.a || {}).doc, (x.a || {}).quote) }, b: { doc: String((x.b || {}).doc || ''), quote: String((x.b || {}).quote || ''), ok: has((x.b || {}).doc, (x.b || {}).quote) } })) };
    } catch (e) { C.res = { error: 'The check failed: ' + (e.message || e.code) }; }
    C.busy = false; render();
  },
  'cf-export': () => regExport('Conflicts', ['Topic', 'Document A', 'A says', 'Document B', 'B says', 'Severity', 'Suggestion'], UI.cf.res.items.map(x => [x.topic, x.a.doc, x.a.quote, x.b.doc, x.b.quote, x.severity, x.suggestion])),
  'cf-task': el => { const x = UI.cf.res.items[+el.dataset.i]; const t = makeTask({ title: `Resolve conflict: ${x.topic}`, type: 'clarify', priority: x.severity === 'high' ? 'high' : 'medium', notes: `${x.a.doc}: “${x.a.quote}”\n${x.b.doc}: “${x.b.quote}”\n${x.suggestion}` }); putTask(t); toast('Task added.', { action: 'Open', fn: () => openDrawer('task', t.id) }); },
});

/* --- search everything: email text and every attachment you kept, plus tasks and notebooks --- */
UI.sa = UI.sa || { q: '', busy: false, res: null, built: 0 };
const SA = { store: { files: {} }, index: null, at: 0 };
async function saBuild() {
  const files = {};
  for (const e of St.emails.values()) {
    if (!e.hasText) continue;
    let tx = textsCache.get(e.id); if (!tx || tx === 'loading') { try { tx = await getTexts(e.id); textsCache.set(e.id, tx || null); } catch { tx = null; } }
    if (!tx) continue;
    files['em:' + e.id] = { name: e.subject || '(no subject)', rel: `✉ ${e.subject || '(no subject)'} — ${e.from || ''}`, emailId: e.id, chunks: nbChunks(`${e.subject}\n${tx.body || ''}`) };
    (tx.atts || []).forEach((a, i) => { if (a.text) files[`at:${e.id}:${i}`] = { name: a.name, rel: `📎 ${a.name} (in “${E.clip(e.subject || '', 50)}”)`, emailId: e.id, chunks: nbChunks(a.text) }; });
  }
  for (const t of St.tasks.values()) files['tk:' + t.id] = { name: t.title, rel: `☑ ${t.ref || ''} ${t.title}`, taskId: t.id, chunks: [[[t.title, t.action, t.notes, t.nextStep, ...(t.subtasks || []).map(s => s.text)].filter(Boolean).join('\n'), '']] };
  SA.store = { files }; SA.index = nbBuildIndex(SA.store); SA.at = Date.now();
}
function saSearch(q) {
  // the notebook search, run over this index
  NBX.set('__all', { store: SA.store, index: SA.index });
  try { return nbSearch('__all', q, 30); } finally { NBX.delete('__all'); }
}
function searchAllHTML() {
  const S = UI.sa;
  return `<section class="card pad"><div class="section-title"><h2>Search everything</h2></div>
    <p class="small muted" style="margin:0">One search over every email you analysed, the text of every attachment you kept (PDF, Word, Excel…), and your tasks — in English or Arabic. For folders on your PC, use the Notebook.</p>
    <div class="row"><input class="input hold-render" id="sa-q" type="search" placeholder="e.g. IP68 actuator, anchor bolt, ELM-ME-CAL-0012, مضخة" value="${esc(S.q)}" style="flex:1" dir="auto"><button class="btn primary" data-act="sa-go" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Reading…' : 'Search'}</button></div>
    ${S.res ? (S.res.length ? `<div class="nb-passages">${S.res.map(h => { const f = SA.store.files[h.key]; const words = nbTokens(S.q).filter(w => w.length > 2); let html = esc(E.clip(h.text, 360)); if (words.length) html = html.replace(new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi'), '<mark>$1</mark>'); return `<div class="nb-passage"><div class="row small"><b dir="auto" style="min-width:0;word-break:break-word">${esc(h.rel)}</b>${h.loc ? `<span class="chip">${esc(h.loc)}</span>` : ''}<span class="spacer"></span>${f.emailId ? `<button class="btn ghost sm" data-act="open-email" data-id="${esc(f.emailId)}">Open email</button>` : ''}${f.taskId ? `<button class="btn ghost sm" data-act="open-task" data-id="${esc(f.taskId)}">Open task</button>` : ''}</div><div class="nb-ptext" dir="auto">${html}</div></div>`; }).join('')}</div>` : '<p class="muted">Nothing found. Try fewer or other words.</p>') : ''}
  </section>`;
}
Object.assign(ACT, {
  'sa-go': async () => {
    const S = UI.sa; S.q = (($('#sa-q') || {}).value || '').trim(); if (!S.q) return;
    const qa = $('#sa-q'); if (qa) qa.blur();
    if (!SA.index || Date.now() - SA.at > 120000 || St.emails.size + St.tasks.size !== S.built) { S.busy = true; render(); await saBuild(); S.built = St.emails.size + St.tasks.size; S.busy = false; }
    S.res = saSearch(S.q); render();
  },
});
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'sa-q' && e.key === 'Enter') { e.preventDefault(); ACT['sa-go'](); } });
