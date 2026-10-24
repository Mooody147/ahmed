/* ---------- Tools › My workbooks: your Excel tools inside the app ---------- */
// Imported .xlsx files are kept privately (FILES 'workbooks') and run by the workbook engine (src/wb/engine.js):
// every formula, drop-down and lookup table works as in Excel. Inputs you type and library edits are saved
// as a list of changes per workbook ('wbedits') and replayed on open; saved calculations go to 'calcruns'.
// Imported HTML tools (FILES 'htmltools') open in their own window on the desktop.
addCols('wbs', 'wbedits', 'calcruns');
UI.wb = UI.wb || { open: null, sheet: 0, edit: false, q: '', allq: '' };
const WB_OPEN = new Map(); // id → { book, model, meta }
const isLibSheet = (sh) => /librar|^lists?$|data|table|geometry|curves/i.test(sh.name) || (sh.maxR || 0) > 150;

/* --- import --- */
async function wbImportFiles(fileList) {
  const files = [...fileList]; let added = 0, tools = 0, docs = 0; const errs = [];
  const all = [];
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) {
      try { const Z = await E.need('jszip'); const zip = await Z.loadAsync(await f.arrayBuffer());
        for (const [name, entry] of Object.entries(zip.files)) { if (entry.dir || /(^|\/)(__MACOSX|\._)/.test(name)) continue; const base = name.split('/').pop(); if (!/\.(xlsx|xlsm|xls|html?|pdf)$/i.test(base)) continue; all.push({ name: base, bytes: await entry.async('uint8array') }); } }
      catch (e) { errs.push(f.name + ': ' + (e.message || e)); }
    } else all.push({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  }
  for (const f of all) {
    try {
      if (/\.html?$/i.test(f.name)) { await htmlToolAdd(f.name, f.bytes); tools++; continue; }
      if (/\.pdf$/i.test(f.name)) { await refDocAdd(f.name, f.bytes); docs++; continue; }
      await wbAdd(f.name, f.bytes); added++;
    } catch (e) { errs.push(f.name + ': ' + (e.message || e)); }
  }
  render();
  toast([added && `${added} workbook${added > 1 ? 's' : ''}`, tools && `${tools} web tool${tools > 1 ? 's' : ''}`, docs && `${docs} reference document${docs > 1 ? 's' : ''}`].filter(Boolean).join(', ') + (added || tools || docs ? ' added.' : 'Nothing was added.') + (errs.length ? ' Problems: ' + errs.join('; ') : ''), errs.length ? { err: true } : {});
}
async function xlsxBytes(name, bytes) {
  if (!/\.xls$/i.test(name)) return { bytes, note: '' };
  // old .xls: SheetJS reads values and formulas; colours and drop-downs are not kept
  const X = await E.need('xlsx'); const wb = X.read(bytes, { type: 'array', cellFormula: true, cellStyles: true });
  return { bytes: new Uint8Array(X.write(wb, { type: 'array', bookType: 'xlsx' })), note: 'Converted from .xls — save it as .xlsx in Excel to keep its colours and drop-downs.' };
}
async function wbModel(bytes, name) {
  const [EJ, Z] = await Promise.all([E.need('exceljs'), E.need('jszip')]);
  return WBC.convert(await WBC.read(EJ, Z, bytes), { name });
}
async function wbAdd(name, raw) {
  const { bytes, note } = await xlsxBytes(name, raw);
  const model = await wbModel(bytes, name);
  const d = WBC.describe(model);
  const same = colList('wbs').find(w => w.name === name);
  const id = same ? same.id : E.uid('wb');
  await FILES.save('workbooks', id, bytes, { name });
  const formulas = model.sheets.reduce((n, s) => n + Object.values(s.cells).filter(c => c.f).length, 0);
  colPut('wbs', { id, name, title: cleanTitle(d.title) || name.replace(/\.\w+$/, ''), subtitle: d.subtitle, about: d.about, author: d.author, revision: d.revision, refs: d.refs, sheets: model.sheets.map(s => s.name), formulas, note, addedAt: (same && same.addedAt) || nowISO(), size: bytes.length });
  WB_OPEN.delete(id);
  return id;
}
const cleanTitle = t => String(t || '').replace(/\s{2,}/g, ' ').replace(/\n/g, ' — ').trim();
async function htmlToolAdd(name, bytes) {
  const text = new TextDecoder().decode(bytes);
  const title = (/<title>([^<]*)<\/title>/i.exec(text) || [])[1] || name.replace(/\.html?$/i, '');
  const about = (/<meta\s+name="description"\s+content="([^"]*)"/i.exec(text) || [])[1] || '';
  const same = colList('wbs').find(w => w.kind === 'html' && w.name === name);
  const id = same ? same.id : E.uid('ht');
  await FILES.save('htmltools', id, bytes, { name });
  colPut('wbs', { id, kind: 'html', name, title: title.trim(), about, addedAt: (same && same.addedAt) || nowISO(), size: bytes.length });
}
async function refDocAdd(name, bytes) {
  const same = colList('wbs').find(w => w.kind === 'pdf' && w.name === name);
  const id = same ? same.id : E.uid('rd');
  await FILES.save('refdocs', id, bytes, { name });
  let text = '';
  try { const r = await E.extract({ name, mime: 'application/pdf', bytes }, { vision: false }); text = E.clip(r.text || '', 200000); } catch {}
  colPut('wbs', { id, kind: 'pdf', name, title: name.replace(/\.pdf$/i, '').replace(/_/g, ' '), about: E.clip((text || '').replace(/\s+/g, ' '), 220), text, addedAt: (same && same.addedAt) || nowISO(), size: bytes.length });
}

/* --- opening a workbook: original file + your saved changes --- */
async function wbOpen(id) {
  if (WB_OPEN.has(id)) return WB_OPEN.get(id);
  const meta = St.cols.wbs.get(id); if (!meta) throw new Error('Workbook not found');
  const bytes = await FILES.load('workbooks', id); if (!bytes) throw new Error('The workbook file is not on this computer yet.');
  const model = await wbModel(bytes, meta.name);
  const book = new WBE.Book(model);
  const ed = St.cols.wbedits.get(id);
  for (const op of (ed && ed.ops) || []) wbApply(book, op);
  const o = { book, model, meta, inputs: wbInputs(book) };
  WB_OPEN.set(id, o); return o;
}
function wbApply(book, op) {
  if (op.t === 'set') book.setInput(op.s, op.r, op.c, op.v);
  else if (op.t === 'ins') { book.shiftRows(op.s, op.at, op.n, op.expand); wbCopyRowStyle(book, op.s, op.at - 1, op.at, op.n); }
  else if (op.t === 'del') book.deleteRows(op.s, op.at, op.n);
}
function wbCopyRowStyle(book, sheet, from, at, n) {
  const sh = book.sheet(sheet); if (!sh || from < 1) return;
  for (const [k, cell] of [...sh.cells]) { const [r, c] = k.split(',').map(Number); if (r !== from || cell.s === undefined) continue; for (let i = 0; i < n; i++) { const kk = (at + i) + ',' + c; if (!sh.cells.has(kk)) sh.cells.set(kk, { v: null, s: cell.s }); } }
}
function wbRecord(id, op) {
  const cur = St.cols.wbedits.get(id) || { id, ops: [] };
  let ops = cur.ops.slice();
  // a later value for the same cell replaces the earlier one when no rows moved in between
  if (op.t === 'set') { for (let i = ops.length - 1; i >= 0; i--) { const o = ops[i]; if (o.t !== 'set') break; if (o.s === op.s && o.r === op.r && o.c === op.c) { ops.splice(i, 1); break; } } }
  ops.push(op);
  colPut('wbedits', { ...cur, ops });
}
// which cells you type into: constants that formulas read (one cell or a small table) or that have a drop-down
function wbInputs(book) {
  const refd = new Set();
  for (const sh of book.order) for (const [, cell] of sh.cells) {
    if (!cell.f) continue;
    let ast; try { ast = WBE.parse(cell.f); } catch { continue; }
    const walk = n => { if (!n || typeof n !== 'object') return; if (n.k === 'ref' && !n.wholeCol && !n.wholeRow) { const size = (n.r2 - n.r1 + 1) * (n.c2 - n.c1 + 1); if (size <= 60) { const s = (n.sheet || sh.name).toLowerCase(); for (let r = n.r1; r <= n.r2; r++) for (let c = n.c1; c <= n.c2; c++) refd.add(s + '!' + r + ',' + c); } } ['a', 'b'].forEach(x => n[x] && walk(n[x])); (n.args || []).forEach(walk); };
    walk(ast);
  }
  const out = new Set();
  for (const sh of book.order) {
    const dvCells = new Set(); for (const d of sh.src.dv || []) for (const [r1, c1, r2, c2] of d.ranges) for (let r = r1; r <= Math.min(r2, r1 + 400); r++) for (let c = c1; c <= c2; c++) dvCells.add(r + ',' + c);
    for (const [k, cell] of sh.cells) { if (cell.f) continue; if (dvCells.has(k) || refd.has(sh.name.toLowerCase() + '!' + k)) out.add(sh.name + '!' + k); }
    for (const k of dvCells) { if (!sh.cells.has(k)) { const [r, c] = k.split(',').map(Number); if (r <= (sh.src.maxR || 0) + 1) out.add(sh.name + '!' + k); } }
  }
  return out;
}

/* --- the view --- */
function wbLibraryHTML() {
  const all = colList('wbs').sort((a, b) => (a.kind || 'x').localeCompare(b.kind || 'x') || (a.title || '').localeCompare(b.title || ''));
  const books = all.filter(w => !w.kind), html = all.filter(w => w.kind === 'html'), pdfs = all.filter(w => w.kind === 'pdf');
  const card = w => `<article class="card pad wb-card" data-kind="${esc(w.kind || 'xlsx')}"><div class="row"><span class="wb-ic">${w.kind === 'html' ? '🌐' : w.kind === 'pdf' ? '📕' : '📗'}</span><div class="wb-t"><b dir="auto">${esc(w.title)}</b>${w.subtitle ? `<small dir="auto">${esc(E.clip(cleanTitle(w.subtitle), 120))}</small>` : ''}</div></div>
    ${w.about ? `<p class="small muted" dir="auto">${esc(E.clip(w.about, 220))}</p>` : ''}
    <div class="row wb-meta"><span class="small muted">${w.kind ? esc(w.name) : `${(w.sheets || []).length} sheets · ${w.formulas || 0} formulas`}${w.revision ? ' · ' + esc(E.clip(w.revision, 40)) : ''}</span><span class="spacer"></span>
      ${w.kind === 'html' ? `<button class="btn sm primary" data-act="ht-open" data-id="${esc(w.id)}">Open</button>` : w.kind === 'pdf' ? `<button class="btn sm" data-act="rd-open" data-id="${esc(w.id)}">Open</button>` : `<button class="btn sm primary" data-act="wb-open" data-id="${esc(w.id)}">Open</button>`}
      <button class="icon-btn" data-act="wb-remove" data-id="${esc(w.id)}" aria-label="Remove ${esc(w.title)}">${I.trash}</button></div>${w.note ? `<p class="small" style="color:var(--warn,#9E6410);margin:4px 0 0">${esc(w.note)}</p>` : ''}</article>`;
  const hits = UI.wb.allq.trim().length > 1 ? wbSearchAll(UI.wb.allq) : null;
  return `<section class="card pad wb-drop" id="wb-drop"><div class="row"><div style="flex:1;min-width:220px"><b>Your workbooks and tools</b><div class="small muted">Add Excel workbooks (.xlsx), web tools (.html), reference PDFs, or a .zip of them. They stay private on this computer (and in your cloud account when sync is on). Every formula, drop-down and library table works as in Excel.</div></div>
      <label class="btn primary">${I.upload} Add files<input type="file" id="wb-file" multiple accept=".xlsx,.xlsm,.xls,.zip,.html,.htm,.pdf" hidden></label></div></section>
    ${books.length ? `<div class="row doc-bar"><label class="search todo-search">${I.search}<span class="sr">Search all libraries</span><input class="input" id="wb-allq" type="search" placeholder="Search every library table — e.g. DN 300 PN16, PE100 SDR17, 6 mm bars…" value="${esc(UI.wb.allq)}" data-inp-wb="allq"></label></div>` : ''}
    ${hits ? wbHitsHTML(hits) : ''}
    ${books.length ? `<div class="wb-grid">${books.map(card).join('')}</div>` : '<div class="empty"><div class="big-emoji">📗</div><h3>No workbooks yet</h3><p>Add your calculation sheets above — your pipe ID tool, bar-screen calculations, pump check sheet and so on.</p></div>'}
    ${html.length ? `<h3 class="wb-h">Web tools</h3><div class="wb-grid">${html.map(card).join('')}</div>` : ''}
    ${pdfs.length ? `<h3 class="wb-h">Reference documents</h3><div class="wb-grid">${pdfs.map(card).join('')}</div>` : ''}`;
}
function wbSearchAll(q) {
  const words = E.normMatch(q).split(' ').filter(Boolean), out = [];
  for (const [id, o] of WB_OPEN) {
    for (const sh of o.book.order) {
      if (!isLibSheet(sh.src) && sh.src.maxR < 40) continue;
      const rows = new Map(); for (const [k, cell] of sh.cells) { if (cell.v === null || cell.v === undefined) continue; const r = +k.split(',')[0]; rows.set(r, (rows.get(r) || '') + ' ' + o.book.display(sh.name, r, +k.split(',')[1])); }
      for (const [r, text] of rows) { const t = E.normMatch(text); if (words.every(w => t.includes(w))) { out.push({ id, title: o.meta.title, sheet: sh.name, r, text: text.trim() }); if (out.length > 60) return out; } }
    }
  }
  // match the reference PDFs too
  for (const w of colList('wbs').filter(x => x.kind === 'pdf' && x.text)) { const t = E.normMatch(w.text); if (words.every(x => t.includes(x))) { const i = t.indexOf(words[0]); out.push({ pdf: w.id, title: w.title, text: E.clip(w.text.replace(/\s+/g, ' ').slice(Math.max(0, i - 60)), 200) }); } }
  return out;
}
function wbHitsHTML(hits) {
  const notOpen = colList('wbs').filter(w => !w.kind && !WB_OPEN.has(w.id)).length;
  return `<section class="card pad"><div class="section-title"><h2>Found in your libraries</h2><span class="count">${hits.length}</span></div>
    ${hits.length ? `<div class="dlist">${hits.slice(0, 60).map(h => h.pdf ? `<div class="row"><button class="dtitle" data-act="rd-open" data-id="${esc(h.pdf)}">📕 ${esc(h.title)}</button><span class="small muted" dir="auto">${esc(h.text)}</span></div>` : `<div class="row"><button class="dtitle" data-act="wb-goto" data-id="${esc(h.id)}" data-sheet="${esc(h.sheet)}" data-r="${h.r}">📗 ${esc(h.title)} › ${esc(h.sheet)} row ${h.r}</button><span class="small muted mono" dir="auto">${esc(E.clip(h.text, 160))}</span></div>`).join('')}</div>` : '<p class="small muted">No match.</p>'}
    ${notOpen ? `<p class="small muted">${notOpen} workbook${notOpen > 1 ? 's are' : ' is'} not loaded yet. <button class="btn sm ghost" data-act="wb-loadall">Search them too</button></p>` : ''}</section>`;
}
function wbViewHTML() {
  const o = WB_OPEN.get(UI.wb.open);
  if (!o) return `<div class="empty"><div class="big-emoji">⏳</div><h3>Opening the workbook…</h3></div>`;
  const book = o.book, sheets = book.order.filter(s => s.src.state === 'visible' || UI.wb.hidden);
  const sh = sheets[Math.min(UI.wb.sheet, sheets.length - 1)] || sheets[0];
  const lib = isLibSheet(sh.src);
  const edits = ((St.cols.wbedits.get(o.meta.id) || {}).ops || []).length;
  const runs = colList('calcruns').filter(x => x.wbId === o.meta.id).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const dvSheets = [...new Set((sh.src.dv || []).filter(d => d.type === 'list').map(d => (/^(?:'([^']+)'|(\w+))!/.exec(d.f1) || [])[1] || (/^(?:'([^']+)'|(\w+))!/.exec(d.f1) || [])[2]).filter(Boolean))];
  return `<div class="wb-head"><button class="btn sm ghost" data-act="wb-close">‹ All workbooks</button><b class="wb-title" dir="auto">${esc(o.meta.title)}</b><span class="spacer"></span>
      <label class="search todo-search wb-q">${I.search}<span class="sr">Search this sheet</span><input class="input" id="wb-q" type="search" placeholder="Find in this sheet…" value="${esc(UI.wb.q)}" data-inp-wb="q"></label>
      ${lib ? `<button class="btn sm ${UI.wb.edit ? 'primary' : ''}" data-act="wb-edit" aria-pressed="${UI.wb.edit}">${UI.wb.edit ? '✓ Done editing' : '✎ Edit this table'}</button>` : ''}
      <details class="menu" data-menu="wbmore"><summary class="btn sm">⋯ More</summary><div class="menu-pop">
        <button class="btn sm ghost" data-act="wb-save-run">💾 Save this calculation…</button>
        <button class="btn sm ghost" data-act="wb-note" data-f="pdf">📄 Calculation note (PDF)</button>
        <button class="btn sm ghost" data-act="wb-note" data-f="docx">📝 Calculation note (Word)</button>
        <button class="btn sm ghost" data-act="wb-export">⬇ Download as Excel (with your changes)</button>
        ${St.sample ? '<button class="btn sm ghost" data-act="wb-ask">✨ Explain this sheet / checks</button>' : ''}
        <button class="btn sm ghost" data-act="wb-hidden">${UI.wb.hidden ? 'Hide' : 'Show'} hidden sheets</button>
        ${edits ? `<button class="btn sm ghost danger" data-act="wb-reset">↺ Undo all my changes (${edits})</button>` : ''}
      </div></details></div>
    <div class="wb-tabs" role="tablist">${sheets.map((s, i) => `<button role="tab" class="${s === sh ? 'on' : ''}" data-act="wb-sheet" data-i="${i}" style="${s.src.tab ? `--tab:#${s.src.tab}` : ''}">${esc(s.name)}${s.src.state !== 'visible' ? ' (hidden)' : ''}</button>`).join('')}</div>
    ${UI.wb.edit && lib ? callout('info', `Editing <b>${esc(sh.name)}</b>: click any value to change it. Use <b>＋</b> in the row margin to add a row below (tables that end on that row grow with it) and <b>✕</b> to delete one. Changes are saved and every formula follows at once.${dvSheets.length ? ` If a drop-down should offer a new size, add it to the <b>${esc(dvSheets.join(', '))}</b> sheet too.` : ''}`) : ''}
    <div class="wb-body ${runs.length ? 'with-runs' : ''}">
      <div class="wb-scroll" id="wb-scroll">${wbSheetHTML(o, sh, lib && UI.wb.edit)}</div>
      ${runs.length ? `<aside class="card pad wb-runs"><div class="label">Saved calculations</div>${runs.map(r => `<div class="wb-run"><button class="dtitle" data-act="wb-run-load" data-id="${esc(r.id)}" dir="auto">${esc(r.title)}</button><small class="muted">${esc([r.project, r.tag, r.rev && 'Rev ' + r.rev, fmtDate(dayOf(r.createdAt))].filter(Boolean).join(' · '))}</small>${(r.checks || []).length ? `<small>${r.checks.slice(0, 3).map(c => esc(E.clip(c, 50))).join('<br>')}</small>` : ''}<button class="icon-btn" data-act="wb-run-del" data-id="${esc(r.id)}" aria-label="Delete">${I.x}</button></div>`).join('')}</aside>` : ''}
    </div>`;
}
const pxW = w => Math.round((w || 8.43) * 7 + 5);
function wbStyleCSS(o) {
  if (o.css) return o.css;
  const rules = (o.model.styles || []).map((st, i) => {
    const r = [];
    if (st.bg) r.push(`background:#${st.bg}`); if (st.fg) r.push(`color:#${st.fg}`); if (st.b) r.push('font-weight:700'); if (st.i) r.push('font-style:italic'); if (st.u) r.push('text-decoration:underline');
    if (st.sz) r.push(`font-size:${(st.sz * 1.333).toFixed(1)}px`); if (st.ha) r.push(`text-align:${st.ha === 'centerContinuous' ? 'center' : st.ha === 'justify' || st.ha === 'distributed' ? 'justify' : st.ha === 'fill' ? 'left' : st.ha}`);
    if (st.va) r.push(`vertical-align:${st.va === 'center' ? 'middle' : st.va === 'top' ? 'top' : 'bottom'}`); if (st.wrap) r.push('white-space:pre-wrap'); if (st.ind) r.push(`padding-left:${4 + st.ind * 9}px`);
    if (st.bd) ['top', 'right', 'bottom', 'left'].forEach((side, k) => { const b = st.bd[k]; if (b) { const [w, c] = b.split(':'); r.push(`border-${side}:${w}px solid #${c}`); } });
    return `.wbx-${o.meta.id} .s${i}{${r.join(';')}}`;
  });
  return (o.css = rules.join('\n'));
}
function wbSheetHTML(o, sh, editLib) {
  const book = o.book, src = sh.src, maxR = Math.max(src.maxR || 1, 1), maxC = Math.max(src.maxC || 1, 1);
  const hidC = new Set(src.cols.map((c, i) => (c.hidden ? i + 1 : 0)).filter(Boolean));
  const span = new Map(), covered = new Set();
  for (const [r1, c1, r2, c2] of src.merges || []) { span.set(r1 + ',' + c1, [r2 - r1 + 1, c2 - c1 + 1]); for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(r + ',' + c); }
  const q = E.normMatch(UI.wb.q || ''); const words = q ? q.split(' ') : [];
  const limit = UI.wb.rows || 400;
  let rowsOut = 0; const trs = [];
  for (let r = 1; r <= maxR && rowsOut < limit; r++) {
    const rh = src.rows && src.rows[r]; if (rh && rh.hidden) continue;
    if (words.length && r > 1) { let t = ''; for (let c = 1; c <= maxC; c++) { const cell = sh.cells.get(r + ',' + c); if (cell) t += ' ' + book.display(sh.name, r, c); } const nt = E.normMatch(t); if (!words.every(w => nt.includes(w))) continue; }
    rowsOut++;
    const tds = [];
    if (editLib) tds.push(`<td class="wb-rn"><span>${r}</span><button data-act="wb-row-add" data-r="${r}" title="Add a row below" aria-label="Add a row below row ${r}">＋</button><button data-act="wb-row-del" data-r="${r}" title="Delete this row" aria-label="Delete row ${r}">✕</button></td>`);
    for (let c = 1; c <= maxC; c++) {
      if (hidC.has(c)) continue;
      const k = r + ',' + c; if (covered.has(k)) continue;
      const cell = sh.cells.get(k), sp = span.get(k);
      let colspan = 1; if (sp) { for (let j = c; j < c + sp[1]; j++) if (!hidC.has(j)) colspan++; colspan--; }
      const attrs = [sp && sp[0] > 1 ? `rowspan="${sp[0]}"` : '', colspan > 1 ? `colspan="${colspan}"` : ''].filter(Boolean).join(' ');
      const isInput = !(cell && cell.f) && (o.inputs.has(sh.name + '!' + k) || editLib);
      const text = cell ? book.display(sh.name, r, c) : '';
      const v = cell ? book.value(sh.name, r, c) : null;
      const cls = [cell && cell.s !== undefined ? 's' + cell.s : '', cell && cell.f ? 'f' : '', isInput ? 'in' : '', typeof v === 'number' && !(cell && cell.s !== undefined && (o.model.styles[cell.s] || {}).ha) ? 'num' : '', /^\s*✓/.test(text) ? 'ok' : /^\s*[✗✘]/.test(text) ? 'bad' : /^\s*⚠/.test(text) ? 'warn' : '', WBE.isErr(v) ? 'err' : '', book.links.has(sh.name + '!' + r + ',' + c) ? 'lnk' : ''].filter(Boolean).join(' ');
      const dv = isInput ? book.validation(sh.name, r, c) : null;
      tds.push(`<td ${attrs} class="${cls}" data-k="${k}"${isInput ? ` tabindex="0"${dv && dv.type === 'list' ? ' data-dv="1"' : ''}` : ''}>${esc(text)}</td>`);
    }
    trs.push(`<tr data-r="${r}" style="${rh && rh.h ? `height:${Math.round(rh.h * 1.333)}px` : ''}">${tds.join('')}</tr>`);
  }
  const cols = (editLib ? '<col style="width:58px">' : '') + src.cols.map((c, i) => hidC.has(i + 1) ? '' : `<col style="width:${pxW(c.w)}px">`).join('');
  const more = rowsOut >= limit ? `<div class="wb-more"><button class="btn sm" data-act="wb-more">Show more rows</button></div>` : '';
  return `<style>${wbStyleCSS(o)}</style><!--raw--><table class="wb-grid-t wbx-${esc(o.meta.id)} ${src.grid ? 'grid' : ''}" data-sheet="${esc(sh.name)}"><colgroup>${cols}</colgroup><tbody>${trs.join('')}</tbody></table><!--/raw-->${more}`;
}
// after an input changes, refresh only the computed cells' text
function wbRefresh() {
  const o = WB_OPEN.get(UI.wb.open), t = $('.wb-grid-t'); if (!o || !t) return;
  const sheet = t.dataset.sheet;
  t.querySelectorAll('td[data-k]').forEach(td => {
    const [r, c] = td.dataset.k.split(',').map(Number); const cell = o.book.cell(sheet, r, c); if (!cell) return;
    if (!cell.f && !td.classList.contains('in')) return;
    const text = o.book.display(sheet, r, c); if (td.textContent !== text && !td.querySelector('input,select')) td.textContent = text;
    td.classList.toggle('ok', /^\s*✓/.test(text)); td.classList.toggle('bad', /^\s*[✗✘]/.test(text)); td.classList.toggle('warn', /^\s*⚠/.test(text)); td.classList.toggle('err', WBE.isErr(o.book.value(sheet, r, c)));
  });
}
function wbEditCell(td) {
  const o = WB_OPEN.get(UI.wb.open), t = td.closest('.wb-grid-t'); if (!o || !t || td.querySelector('input,select')) return;
  const sheet = t.dataset.sheet, [r, c] = td.dataset.k.split(',').map(Number);
  const cell = o.book.cell(sheet, r, c) || {}, v = cell.v;
  const dv = o.book.validation(sheet, r, c);
  const w = Math.max(60, td.clientWidth - 4);
  if (dv && dv.type === 'list') {
    const cur = o.book.display(sheet, r, c);
    td.innerHTML = `<select class="wb-ed hold-render" style="width:${w}px">${(dv.list.includes(v) ? [] : [v]).concat(dv.list).filter(x => x !== null && x !== undefined).map(x => `<option ${String(x) === String(v) || WBE.toStr(x) === cur ? 'selected' : ''}>${esc(WBE.toStr(x))}</option>`).join('')}</select>`;
  } else {
    const raw = typeof v === 'number' && (o.model.styles[cell.s] || {}).nf && /%/.test(o.model.styles[cell.s].nf) ? (v * 100) + '%' : v === null || v === undefined ? '' : String(v);
    td.innerHTML = `<input class="wb-ed hold-render" style="width:${w}px" value="${esc(raw)}" ${typeof v === 'number' ? 'inputmode="decimal"' : ''}>`;
  }
  const ed = td.querySelector('.wb-ed'); ed.focus(); if (ed.select) ed.select();
  let done = false;
  const commit = (save) => {
    if (done) return; done = true;
    if (save) {
      let nv = ed.value;
      if (ed.tagName === 'SELECT') { const hit = dv.list.find(x => WBE.toStr(x) === nv); nv = hit !== undefined ? hit : nv; }
      // like Excel, an entry that reads as a number is stored as a number
      if (typeof nv === 'string' && /^\s*-?[\d.,]+\s*%?\s*$/.test(nv) && nv.trim() !== '') { const n = WBE.toNum(nv.replace(/,(?=\d{3}\b)/g, '')); if (!WBE.isErr(n)) nv = n; }
      if (nv !== v && !(nv === '' && (v === null || v === undefined))) { wbSetCell(o, sheet, r, c, nv === '' ? null : nv); }
    }
    td.textContent = o.book.display(sheet, r, c);
    wbRefresh();
    // a redraw that waited for the editor runs now (unless the next cell's editor is opening)
    if (UI.cvPending) setTimeout(() => { if (!(document.activeElement && document.activeElement.classList.contains('hold-render'))) { UI.cvPending = false; render(); } }, 0);
  };
  ed.addEventListener('blur', () => commit(true));
  ed.addEventListener('change', () => { if (ed.tagName === 'SELECT') ed.blur(); });
  ed.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); commit(false); td.focus(); }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(true); const all = [...t.querySelectorAll('td.in')]; const i = all.indexOf(td); const next = all[i + (e.shiftKey ? -1 : 1)]; if (next) { next.focus(); wbEditCell(next); } }
  });
}
function wbSetCell(o, sheet, r, c, v) {
  const before = o.book.cell(sheet, r, c);
  o.book.setInput(sheet, r, c, v); wbRecord(o.meta.id, { t: 'set', s: sheet, r, c, v });
  // keep the same library row in step in your other workbooks
  const sh = o.book.sheet(sheet);
  if (UI.wb.edit && isLibSheet(sh.src) && before && before.v !== null) wbSyncLibraries(o, sheet, r, c, before.v, v);
}
function wbSyncLibraries(o, sheet, r, c, oldV, newV) {
  const key = [1, 2, 3].map(cc => WBE.toStr(o.book.value(sheet, r, cc))).join('|');
  const head = col => { for (let rr = 1; rr <= Math.min(r - 1, 12); rr++) { const v = o.book.value(sheet, rr, col); if (typeof v === 'string' && v.trim()) return v.trim(); } return ''; };
  const h = head(c); let n = 0;
  for (const [id, other] of WB_OPEN) {
    if (id === o.meta.id) continue; const sh2 = other.book.sheet(sheet); if (!sh2) continue;
    for (const [k, cell] of sh2.cells) { const [rr, cc] = k.split(',').map(Number); if (cc !== c || cell.f || WBE.toStr(cell.v) !== WBE.toStr(oldV)) continue;
      const key2 = [1, 2, 3].map(x => WBE.toStr(other.book.value(sheet, rr, x === c ? -1 : x) ?? '')).join('|');
      const keyOld = [1, 2, 3].map(x => (x === c ? WBE.toStr(oldV) : WBE.toStr(o.book.value(sheet, r, x)))).join('|');
      const key2b = [1, 2, 3].map(x => WBE.toStr(other.book.value(sheet, rr, x))).join('|');
      let h2 = ''; for (let x = 1; x <= Math.min(rr - 1, 12); x++) { const v = other.book.value(sheet, x, c); if (typeof v === 'string' && v.trim()) { h2 = v.trim(); break; } }
      if ((key2b === keyOld || key2b === key) && h2 === h) { other.book.setInput(sheet, rr, cc, newV); wbRecord(id, { t: 'set', s: sheet, r: rr, c: cc, v: newV }); n++; }
      void key2; }
  }
  if (n) toast(`Also updated in ${n} other workbook${n > 1 ? 's' : ''} that use the same table.`);
}

/* --- saved calculations, calculation notes, export, AI explain --- */
function wbCurrentInputs(o) { const out = []; for (const key of o.inputs) { const [s, k] = [key.slice(0, key.lastIndexOf('!')), key.slice(key.lastIndexOf('!') + 1)]; const sh = o.book.sheet(s); if (!sh || isLibSheet(sh.src)) continue; const [r, c] = k.split(',').map(Number); const cell = sh.cells.get(k); out.push({ s, r, c, v: cell ? cell.v : null }); } return out; }
function wbChecks(o, sheetName) { const sh = o.book.sheet(sheetName); const out = []; if (!sh) return out; for (const [k, cell] of sh.cells) { if (!cell.f) continue; const [r, c] = k.split(',').map(Number); const t = o.book.display(sheetName, r, c); if (/^\s*[✓✗✘⚠➤]/.test(t)) out.push(t.trim()); } return out.slice(0, 12); }
function wbSheetNow(o) { const sheets = o.book.order.filter(s => s.src.state === 'visible' || UI.wb.hidden); return sheets[Math.min(UI.wb.sheet, sheets.length - 1)] || sheets[0]; }
function openSaveRun() {
  const o = WB_OPEN.get(UI.wb.open); if (!o) return; const sh = wbSheetNow(o);
  const title = (() => { for (let r = 1; r <= 6; r++) for (let c = 1; c <= 4; c++) { const v = o.book.value(sh.name, r, c); if (typeof v === 'string' && v.trim().length > 6) return cleanTitle(v); } return o.meta.title; })();
  const projects = [...new Set([...St.tasks.values()].map(t => (t.project || '').trim()).filter(Boolean))].sort();
  const tasks = [...St.tasks.values()].filter(t => t.status !== 'done').sort((a, b) => (a.ref || '').localeCompare(b.ref || ''));
  const m = $('#modal');
  m.innerHTML = deco(`<div class="card pad wb-savebox" role="dialog" aria-label="Save calculation"><div class="row"><b>💾 Save this calculation</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <label class="field"><span>Title</span><input class="input" id="sr-title" dir="auto" value="${esc(title)}"></label>
    <div class="grid-2"><label class="field"><span>Project</span><input class="input" id="sr-proj" list="sr-projs" dir="auto"><datalist id="sr-projs">${projects.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="field"><span>Equipment tag</span><input class="input" id="sr-tag" placeholder="e.g. P-101A"></label>
      <label class="field"><span>Revision</span><input class="input" id="sr-rev" value="A"></label>
      <label class="field"><span>Checked by</span><input class="input" id="sr-chk" dir="auto"></label></div>
    <label class="field"><span>Link to a task (optional)</span><select class="input" id="sr-task"><option value="">—</option>${tasks.map(t => `<option value="${esc(t.id)}">${esc(t.ref + ' ' + E.clip(t.title, 70))}</option>`).join('')}</select></label>
    <div class="row end"><button class="btn primary" data-act="wb-save-run-ok">Save</button></div></div>`);
  m.hidden = false;
}
function saveRun() {
  const o = WB_OPEN.get(UI.wb.open); if (!o) return; const sh = wbSheetNow(o); const v = id => (($('#' + id) || {}).value || '').trim();
  const run = { id: E.uid('cr'), wbId: o.meta.id, wbTitle: o.meta.title, sheet: sh.name, title: v('sr-title') || o.meta.title, project: v('sr-proj'), tag: v('sr-tag'), rev: v('sr-rev'), checkedBy: v('sr-chk'), taskId: v('sr-task'), by: St.settings.me.name || '', inputs: wbCurrentInputs(o), checks: wbChecks(o, sh.name), createdAt: nowISO() };
  colPut('calcruns', run);
  if (run.taskId && St.tasks.has(run.taskId)) { const t = clone(St.tasks.get(run.taskId)); (t.history = t.history || []).push({ at: nowISO(), text: `Calculation saved: ${run.title}${run.rev ? ' Rev ' + run.rev : ''}` }); putTask(t); }
  $('#modal').hidden = true; render(); toast('Calculation saved.');
}
async function loadRun(id) {
  const run = St.cols.calcruns.get(id); if (!run) return;
  const o = await wbOpen(run.wbId);
  for (const x of run.inputs || []) { const cell = o.book.cell(x.s, x.r, x.c); if (!cell || !cell.f) { o.book.setInput(x.s, x.r, x.c, x.v); wbRecord(run.wbId, { t: 'set', s: x.s, r: x.r, c: x.c, v: x.v }); } }
  UI.view = 'tools'; UI.toolTab = 'wb'; UI.wb.open = run.wbId; const vis = o.book.order.filter(s => s.src.state === 'visible' || UI.wb.hidden); UI.wb.sheet = Math.max(0, vis.findIndex(s => s.name === run.sheet)); UI.wb.edit = false;
  render(); toast(`Loaded “${run.title}”.`);
}
TASK_ACTIONS.push(t => { const runs = colList('calcruns').filter(r => r.taskId === t.id); return runs.length ? runs.map(r => `<button class="btn sm ghost" data-act="wb-run-load" data-id="${esc(r.id)}" title="Open this calculation">🧮 ${esc(E.clip(r.title, 40))}${r.rev ? ' Rev ' + esc(r.rev) : ''}</button>`).join('') : ''; });
function wbNoteHTML(o, sh, meta) {
  const t = $('.wb-grid-t'); const grid = t ? t.outerHTML.replace(/<button[^>]*>.*?<\/button>/g, '') : '';
  const css = wbStyleCSS(o).replace(new RegExp('\\.wbx-' + o.meta.id, 'g'), '.note-grid');
  const tb = [['Project', meta.project], ['Calculation', meta.title], ['Tag', meta.tag], ['Revision', meta.rev], ['Prepared by', meta.by], ['Checked by', meta.checkedBy], ['Date', fmtDate(T(), { day: 'numeric', month: 'short', year: 'numeric' })]].filter(x => x[1]);
  return `<style>${css} .note-grid{border-collapse:collapse;table-layout:fixed;font-size:8.5pt} .note-grid td{padding:2px 4px;overflow:hidden;border:0} .tb{width:100%;border-collapse:collapse;margin-bottom:10pt} .tb td{border:1px solid #999;padding:3pt 6pt;font-size:9pt}</style>
    <table class="tb"><tbody>${tb.map(([a, b]) => `<tr><td style="width:28%;background:#EEF3F2"><b>${esc(a)}</b></td><td dir="auto">${esc(b)}</td></tr>`).join('')}</tbody></table>
    ${grid.replace(/class="wb-grid-t[^"]*"/, 'class="note-grid"')}<p class="muted" style="font-size:8pt;margin-top:8pt">From ${esc(o.meta.name)}, sheet “${esc(sh.name)}”. Calculated with Action Register.</p>`;
}
async function wbNote(fmt) {
  const o = WB_OPEN.get(UI.wb.open); if (!o) return; const sh = wbSheetNow(o);
  const last = colList('calcruns').filter(r => r.wbId === o.meta.id && r.sheet === sh.name).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0] || {};
  const meta = { title: last.title || o.meta.title, project: last.project, tag: last.tag, rev: last.rev, by: St.settings.me.name, checkedBy: last.checkedBy };
  const base = (meta.title || 'calculation').replace(/[^\w؀-ۿ -]+/g, '').replace(/\s+/g, '-').slice(0, 60) + '-' + T();
  if (fmt === 'pdf') return printDoc(wbNoteHTML(o, sh, meta), base + '.pdf', (sh.src.cols || []).reduce((a, c) => a + (c.hidden ? 0 : pxW(c.w)), 0) > 760, meta.title);
  try {
    const d = await E.need('docx'); const P = (text, o2 = {}) => new d.Paragraph({ children: [new d.TextRun({ text: String(text ?? ''), ...o2 })] });
    const rows = []; const src = sh.src; const hid = new Set(src.cols.map((c, i) => (c.hidden ? i + 1 : 0)).filter(Boolean));
    for (let r = 1; r <= Math.min(src.maxR, 400); r++) { const cells = []; let any = false; for (let c = 1; c <= src.maxC; c++) { if (hid.has(c)) continue; const t = o.book.display(sh.name, r, c); if (t) any = true; cells.push(t); } if (any) rows.push(cells); }
    const width = Math.max(...rows.map(r => r.length), 1);
    const doc = new d.Document({ sections: [{ properties: { page: { size: { orientation: width > 6 ? d.PageOrientation.LANDSCAPE : d.PageOrientation.PORTRAIT } } }, children: [
      new d.Paragraph({ text: meta.title, heading: d.HeadingLevel.TITLE }),
      P([meta.project, meta.tag, meta.rev && 'Rev ' + meta.rev, meta.by && 'Prepared by ' + meta.by, meta.checkedBy && 'Checked by ' + meta.checkedBy, fmtDate(T(), { day: 'numeric', month: 'short', year: 'numeric' })].filter(Boolean).join('   ·   '), { color: '5B6B68' }),
      new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: rows.map(cells => new d.TableRow({ children: cells.map(t => new d.TableCell({ children: [P(t, { size: 16 })] })) })) }),
      P('From ' + o.meta.name + ', sheet “' + sh.name + '”.', { size: 14, color: '7A8A87' }),
    ] }] });
    await offerFile(base + '.docx', await d.Packer.toBlob(doc));
  } catch (e) { toast('Could not create the Word file: ' + (e.message || e), { err: true }); }
}
async function wbExport() {
  const o = WB_OPEN.get(UI.wb.open); if (!o) return;
  try {
    const [EJ, Z] = await Promise.all([E.need('exceljs'), E.need('jszip')]);
    const bytes = await FILES.load('workbooks', o.meta.id); const wb = await WBC.read(EJ, Z, bytes);
    const ops = ((St.cols.wbedits.get(o.meta.id) || {}).ops) || [];
    const structural = ops.some(x => x.t !== 'set');
    for (const sh of o.book.order) {
      const ws = wb.getWorksheet(sh.name); if (!ws) continue;
      if (structural) { for (const op of ops.filter(x => x.s === sh.name && x.t !== 'set')) { if (op.t === 'ins') ws.spliceRows(op.at, 0, ...Array.from({ length: op.n }, () => [])); else ws.spliceRows(op.at, op.n); } }
      for (const [k, cell] of sh.cells) {
        const [r, c] = k.split(',').map(Number); const x = ws.getCell(r, c);
        if (cell.f) { if (structural) x.value = { formula: cell.f }; continue; }
        const cur = x.value; const curV = cur && typeof cur === 'object' && !(cur instanceof Date) ? (cur.richText ? cur.richText.map(t => t.text).join('') : cur.result) : cur;
        if (cell.v !== curV && !(cell.v === null && (curV === null || curV === undefined))) x.value = cell.v;
      }
    }
    const out = await wb.xlsx.writeBuffer();
    await offerFile(o.meta.name.replace(/\.(xlsx|xlsm|xls)$/i, '') + (ops.length ? ' (edited)' : '') + '.xlsx', new Blob([out]));
    if (structural) toast('Rows you added or deleted are in the file; check the formulas that read them once in Excel.');
  } catch (e) { toast('Could not export: ' + (e.message || e), { err: true }); }
}
async function wbAsk() {
  const o = WB_OPEN.get(UI.wb.open); if (!o || !St.sample) return; const sh = wbSheetNow(o);
  const lines = []; for (let r = 1; r <= Math.min(sh.src.maxR, 160); r++) { const cells = []; for (let c = 1; c <= Math.min(sh.src.maxC, 12); c++) { const t = o.book.display(sh.name, r, c); if (t) cells.push(t); } if (cells.length) lines.push(r + ': ' + cells.join(' | ')); }
  const m = $('#modal'); m.innerHTML = deco(`<div class="card pad ask-card"><div class="row"><b>✨ ${esc(sh.name)}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div><p class="muted">Reading the sheet…</p></div>`); m.hidden = false;
  const prompt = `You are checking an engineer's calculation sheet (water / wastewater). Using ONLY the rows below (row: cells), explain in plain words: what the sheet calculates, the key results, every check that is not OK (✗ or ⚠) and which inputs to change to fix it. Do not invent numbers.
SHEET: ${o.meta.title} › ${sh.name}
${E.clip(lines.join('\n'), 60000)}
Reply with JSON only: {"summary":"…","issues":[{"check":"…","why":"…","fix":"…"}]}`;
  try { const r = await St.sample.json(prompt, { modelTier: 'quick' });
    m.innerHTML = deco(`<div class="card pad ask-card"><div class="row"><b>✨ ${esc(sh.name)}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div><p dir="auto" style="white-space:pre-wrap">${esc((r && r.summary) || '')}</p>${((r && r.issues) || []).map(x => `<div class="callout warn"><div><b dir="auto">${esc(x.check)}</b><div dir="auto">${esc(x.why)}</div><div dir="auto"><b>Fix:</b> ${esc(x.fix)}</div></div></div>`).join('')}<p class="small muted">Check the advice against the sheet and your specification.</p></div>`);
  } catch (e) { m.innerHTML = deco(`<div class="card pad"><p>Could not explain the sheet: ${esc(e.message || e)}</p><button class="btn" data-act="close-modal">Close</button></div>`); }
}

/* --- events --- */
async function wbShow(id, sheetName, row) {
  UI.view = 'tools'; UI.toolTab = 'wb'; UI.wb.open = id; UI.wb.q = ''; UI.wb.edit = false; UI.wb.rows = 400; render();
  try { const o = await wbOpen(id); if (sheetName) { const vis = o.book.order.filter(s => s.src.state === 'visible' || UI.wb.hidden); let i = vis.findIndex(s => s.name === sheetName); if (i < 0) { UI.wb.hidden = true; i = o.book.order.findIndex(s => s.name === sheetName); } UI.wb.sheet = Math.max(0, i); if (row) UI.wb.rows = Math.max(400, row + 50); } else UI.wb.sheet = 0; }
  catch (e) { UI.wb.open = null; toast(e.message || String(e), { err: true }); }
  render();
  if (row) requestAnimationFrame(() => { const tr = document.querySelector(`.wb-grid-t tr[data-r="${row}"]`); if (tr) { tr.scrollIntoView({ block: 'center' }); tr.classList.add('flash'); } });
}
Object.assign(ACT, {
  'wb-open': el => wbShow(el.dataset.id),
  'wb-goto': el => wbShow(el.dataset.id, el.dataset.sheet, +el.dataset.r),
  'wb-close': () => { UI.wb.open = null; UI.wb.q = ''; render(); },
  'wb-sheet': el => { UI.wb.sheet = +el.dataset.i; UI.wb.q = ''; UI.wb.edit = false; UI.wb.rows = 400; render(); },
  'wb-edit': () => { UI.wb.edit = !UI.wb.edit; render(); },
  'wb-hidden': () => { UI.wb.hidden = !UI.wb.hidden; UI.wb.sheet = 0; render(); },
  'wb-more': () => { UI.wb.rows = (UI.wb.rows || 400) + 600; render(); },
  'wb-remove': el => { const w = St.cols.wbs.get(el.dataset.id); if (!w) return; if (!confirm(`Remove “${w.title}” from the app? Your changes and saved calculations for it are removed too.`)) return; colDel('wbs', w.id); colDel('wbedits', w.id); FILES.remove(w.kind === 'html' ? 'htmltools' : w.kind === 'pdf' ? 'refdocs' : 'workbooks', w.id).catch(() => {}); WB_OPEN.delete(w.id); render(); },
  'wb-reset': () => { const o = WB_OPEN.get(UI.wb.open); if (!o || !confirm('Undo every change you made to this workbook (inputs and library edits)?')) return; colDel('wbedits', o.meta.id); WB_OPEN.delete(o.meta.id); wbShow(o.meta.id); },
  'wb-row-add': el => { const o = WB_OPEN.get(UI.wb.open); if (!o) return; const sh = wbSheetNow(o), r = +el.dataset.r; const op = { t: 'ins', s: sh.name, at: r + 1, n: 1, expand: true }; wbApply(o.book, op); wbRecord(o.meta.id, op); o.inputs = wbInputs(o.book); render(); },
  'wb-row-del': el => { const o = WB_OPEN.get(UI.wb.open); if (!o) return; const sh = wbSheetNow(o), r = +el.dataset.r; if (!confirm(`Delete row ${r} of ${sh.name}? Formulas that pointed only at it will show #REF!.`)) return; const op = { t: 'del', s: sh.name, at: r, n: 1 }; wbApply(o.book, op); wbRecord(o.meta.id, op); o.inputs = wbInputs(o.book); render(); },
  'wb-save-run': () => openSaveRun(), 'wb-save-run-ok': () => saveRun(),
  'wb-run-load': el => { $('#modal').hidden = true; closeDrawer(); loadRun(el.dataset.id); },
  'wb-run-del': el => { colDel('calcruns', el.dataset.id); render(); },
  'wb-note': el => wbNote(el.dataset.f), 'wb-export': () => wbExport(), 'wb-ask': () => wbAsk(),
  'wb-loadall': async () => { toast('Loading your workbooks…'); for (const w of colList('wbs').filter(x => !x.kind)) { try { await wbOpen(w.id); } catch {} } render(); },
  'ht-open': el => { const w = St.cols.wbs.get(el.dataset.id); if (!w) return; if (DESKTOP) DK.call('htmltool:open', { id: w.id, title: w.title, user: St.settings.me.name || '' }).catch(e => toast(e.message || 'Could not open the tool', { err: true })); else htmlToolBrowser(w); },
  'rd-open': el => { const w = St.cols.wbs.get(el.dataset.id); if (w) FILES.open('refdocs', w.id, w.name).catch(e => toast(e.message || 'Could not open', { err: true })); },
});
// in the browser build an HTML tool opens in a new tab from a local copy
async function htmlToolBrowser(w) { const b = await FILES.load('htmltools', w.id); if (!b) return; const url = URL.createObjectURL(new Blob([b], { type: 'text/html' })); const win = window.open(url, '_blank'); if (!win) offerFile(w.name, new Blob([b], { type: 'text/html' })); }
document.addEventListener('change', e => { if (e.target && e.target.id === 'wb-file' && e.target.files.length) { wbImportFiles(e.target.files); e.target.value = ''; } });
document.addEventListener('click', e => {
  const td = e.target.closest && e.target.closest('.wb-grid-t td.in'); if (td) { wbEditCell(td); return; }
  const lk = e.target.closest && e.target.closest('.wb-grid-t td.lnk');
  if (lk) { const o = WB_OPEN.get(UI.wb.open); const sheet = lk.closest('.wb-grid-t').dataset.sheet; const link = o && o.book.links.get(sheet + '!' + lk.dataset.k); const m = link && /^#'?([^'!]+)'?!([A-Z]+)(\d+)/i.exec(link); if (m) wbShow(o.meta.id, m[1], +m[3]); }
});
document.addEventListener('keydown', e => { const td = e.target.closest && e.target.closest('.wb-grid-t td.in'); if (td && (e.key === 'Enter' || e.key === 'F2' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey))) { e.preventDefault(); wbEditCell(td); const ed = td.querySelector('input.wb-ed'); if (ed && e.key.length === 1) { ed.value = e.key; } } });
let wbqTimer = null;
document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.inpWb; if (!k) return; UI.wb[k] = e.target.value; clearTimeout(wbqTimer); wbqTimer = setTimeout(() => { const id = e.target.id, pos = e.target.selectionStart; render(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } }, 220); });
// dropping workbook files on the Tools page imports them
document.addEventListener('drop', e => { if (UI.view !== 'tools' || UI.toolTab !== 'wb' || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); e.stopImmediatePropagation(); wbImportFiles(e.dataTransfer.files); }, true);
document.addEventListener('dragenter', e => { if (UI.view === 'tools' && UI.toolTab === 'wb') e.stopImmediatePropagation(); }, true);
window.__wbForget = () => WB_OPEN.clear(); // tests: reopen from storage
