/* ---------- drawings on the canvas: images and PDF pages (with redline reading), tables, stamps ---------- */
// Image tool (I), drag-and-drop or paste: a photo, screenshot or drawing — a PDF puts its first pages side by side —
// lands on the canvas to mark up with the pen, shapes, notes and stamps. "Read my markups" sends the image with your
// markings to Claude, who lists each one as a comment (number, where, what) in a table next to the drawing, and can
// make them one task with an item per comment — a CRS from your redlines.
// Table tool (G): a quick table, cells edited by double-clicking; rows and columns added or removed from the bar.
// Stamp tool (J): Code 1–4 review stamps, HOLD, CLARIFY, FOR INFORMATION, URGENT, dated — for drawings or boxes.
const EL_SVG = {};
BOX_TYPES.push('image', 'table', 'stamp');
TOOLS.push(
  ['image', 'I', 'Image or PDF page — choose a file, or drop or paste one on the canvas', '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-8 8"/>'],
  ['table', 'G', 'Table', '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 10h18M3 15h18M9 5v14M15 5v14"/>'],
  ['stamp', 'J', 'Stamp — Code 1–4, Hold, Clarify, For information, Urgent', '<path d="M8 3h8v5l2 2v3H6v-3l2-2z"/><path d="M4 17h16v4H4z"/>']);
Object.assign(TOOL_KEY, { i: 'image', g: 'table', j: 'stamp' });
TOOL_GROUPS.splice(TOOL_GROUPS.length - 1, 0, ['image', 'table', 'stamp']);
CREATE_TOOLS.push('table', 'stamp');
Object.assign(TOOL_HINT, { image: 'Choose an image or PDF — or drop or paste one onto the canvas', table: 'Click to place a table · double-click a cell to type', stamp: 'Pick a stamp above, then click where it goes' });

/* --- images --- */
const IMG_MAX = 2400;
async function fileToImages(file) {
  const out = [];
  if (/pdf$/i.test(file.type) || /\.pdf$/i.test(file.name)) {
    const pdfjsLib = await E.need('pdf');
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
    for (let p = 1; p <= Math.min(3, doc.numPages); p++) {
      const page = await doc.getPage(p), v0 = page.getViewport({ scale: 1 }), sc = Math.min(3, IMG_MAX / Math.max(v0.width, v0.height)), v = page.getViewport({ scale: sc });
      const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: v }).promise;
      out.push({ canvas: c, name: `${file.name} · page ${p}` });
    }
    return out;
  }
  const bmp = await createImageBitmap(file); const sc = Math.min(1, IMG_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
  const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, c.width, c.height);
  out.push({ canvas: c, name: file.name || 'Image' });
  return out;
}
const canvasBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
// saved in the artifact's file store when there is one; otherwise kept small enough to live in the board itself
async function storeImage(c) {
  if (St.assets) {
    try { const blob = await canvasBlob(c, 'image/jpeg', 0.9); const r = await St.assets.upload(blob, { type: 'image/jpeg' }); return { src: r.url, assetId: r.id }; } catch { /* fall back below */ }
  }
  let w = c.width, h = c.height, q = 0.82, url = '';
  for (let i = 0; i < 8; i++) {
    const s = Math.min(1, 1400 / Math.max(w, h)); const t = document.createElement('canvas'); t.width = Math.round(w * s); t.height = Math.round(h * s);
    t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); url = t.toDataURL('image/jpeg', q);
    if (url.length < 190000) break; w *= 0.8; h *= 0.8; q = Math.max(0.5, q - 0.06);
  }
  return { src: url };
}
// a free spot of w×h for new things, as near the middle of the screen as possible without covering anything
// a box just placed is brought into view (the zoom stays) when part of it is outside the visible canvas
function revealBoxes(list) {
  const vp = $('#map-vp'); if (!vp || !list.length) return;
  const k = UI.map.k, x0 = Math.min(...list.map(b => b.x)), y0 = Math.min(...list.map(b => b.y)), x1 = Math.max(...list.map(b => b.x + b.w)), y1 = Math.max(...list.map(b => b.y + b.h));
  const sx0 = x0 * k + UI.map.x, sy0 = y0 * k + UI.map.y, sx1 = x1 * k + UI.map.x, sy1 = y1 * k + UI.map.y, W = vp.clientWidth, H = vp.clientHeight;
  if (sx0 >= 60 && sy0 >= 50 && sx1 <= W - 20 && sy1 <= H - 60) return;
  UI.map.x = W / 2 - (x0 + x1) / 2 * k; UI.map.y = H / 2 - (y0 + y1) / 2 * k; applyCam(true);
}
function freeSpot(w, h, near) {
  const vp = $('#map-vp'), k = UI.map.k;
  const c = near || (vp ? { x: (vp.clientWidth / 2 - UI.map.x) / k - w / 2, y: (vp.clientHeight / 2 - UI.map.y) / k - h / 2 } : { x: 100, y: 100 });
  const taken = [];
  if (UI.mapLayout && curPage() === 'main') for (const n of UI.mapLayout.nodes) taken.push({ x: n.x - 30, y: n.y - 30, w: n.w + 60, h: (n.h || 40) + 60 });
  for (const e of boardEls()) if (e.type !== 'connector') { const b = elBox(e); taken.push({ x: b.x - 30, y: b.y - 30, w: b.w + 60, h: b.h + 60 }); }
  const hit = (x, y) => taken.some(b => x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y);
  if (!hit(c.x, c.y)) return { x: Math.round(c.x), y: Math.round(c.y) };
  for (let r = 1; r < 40; r++) for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const x = c.x + dx * r * 120, y = c.y + dy * r * 90; if (!hit(x, y)) return { x: Math.round(x), y: Math.round(y) };
  }
  const bottom = Math.max(0, ...taken.map(b => b.y + b.h)); return { x: Math.round(c.x), y: Math.round(bottom + 40) };
}
async function addImages(files, at) {
  const list = [...files].filter(f => /^image\//.test(f.type) || /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)); if (!list.length) return;
  toast('Placing on the canvas…');
  let x = at ? at.x : null, y = at ? at.y : null;
  const ch = { els: {} }; let n = 0;
  for (const f of list) {
    let imgs; try { imgs = await fileToImages(f); } catch { toast(`${f.name}: could not be read.`, { err: true }); continue; }
    for (const im of imgs) {
      const w = 600, h = Math.round(600 * im.canvas.height / im.canvas.width);
      if (x === null) { const p = freeSpot(w, h); x = p.x; y = p.y; }
      const st = await storeImage(im.canvas);
      const el = newEl('image', { x: Math.round(x), y: Math.round(y), w, h, name: im.name, ...st });
      ch.els[el.id] = el; x += w + 40; n++;
    }
  }
  if (!n) return;
  cvApply(ch); UI.cvSel = new Set(Object.keys(ch.els)); UI.tool = 'select'; render();
  revealBoxes(Object.values(ch.els).map(elBox));
  toast(`${n} image${n > 1 ? 's' : ''} placed — mark up with the pen, then “Read my markups”.`);
}
function pickImages(at) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*,application/pdf'; inp.multiple = true;
  inp.onchange = () => addImages(inp.files, at); inp.click();
}
const cvToolImg = ACT['cv-tool'];
ACT['cv-tool'] = el => { if (el.dataset.tool === 'image') { pickImages(); return; } cvToolImg(el); };
document.addEventListener('keydown', e => { if (e.key && e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey && UI.view === 'todo' && UI.todoMode === 'map' && !e.target.closest('input,textarea,[contenteditable]') && St.mode !== 'viewer') { e.preventDefault(); e.stopImmediatePropagation(); pickImages(); } }, true);
// drop or paste images and PDFs onto the canvas
document.addEventListener('drop', e => {
  if (!e.target.closest || !e.target.closest('#map-vp') || !e.dataTransfer || St.mode === 'viewer') return;
  const fs = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type) || /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name)); if (!fs.length) return;
  e.preventDefault(); e.stopImmediatePropagation();
  addImages(fs, toWorld(e.clientX, e.clientY));
}, true);
document.addEventListener('paste', e => {
  if (UI.view !== 'todo' || UI.todoMode !== 'map' || St.mode === 'viewer' || (e.target.closest && e.target.closest('input,textarea,[contenteditable]'))) return;
  const fs = [...((e.clipboardData && e.clipboardData.files) || [])].filter(f => /^image\//.test(f.type)); if (!fs.length) return;
  e.preventDefault(); addImages(fs);
});
EL_HTML.image = (el, o) => `<div class="bel image${o.sel}" data-el="${esc(el.id)}" style="${o.st}" title="${esc(el.name || '')}"><img src="${esc(el.src || '')}" alt="${esc(el.name || 'Image')}" draggable="false" decoding="async"><div class="btxt img-cap" dir="auto">${esc(el.text || '')}</div>${o.rz}${o.LK}</div>`;
EL_SVG.image = e => `<image href="${xesc(e.src || '')}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" preserveAspectRatio="xMidYMid meet"/>`;

/* --- reading markups on an image --- */
const blobToDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
async function srcDataURL(src) { if (/^data:/.test(src)) return src; const r = await fetch(src); return blobToDataURL(await r.blob()); }
// the image with every mark drawn over it (pen, highlighter, lines, shapes, notes, text and stamps) as one picture
async function markedUpPNG(img) {
  const ov = boardEls().filter(e => e.id !== img.id && e.type !== 'connector' && e.type !== 'frame').filter(e => { const b = elBox(e); return b.x < img.x + img.w && b.x + b.w > img.x && b.y < img.y + img.h && b.y + b.h > img.y; });
  const parts = [`<rect x="${img.x}" y="${img.y}" width="${img.w}" height="${img.h}" fill="#fff"/>`, `<image href="${await srcDataURL(img.src)}" x="${img.x}" y="${img.y}" width="${img.w}" height="${img.h}" preserveAspectRatio="xMidYMid meet"/>`];
  for (const e of ov) {
    const col = colorCss(e.color).startsWith('var') ? '#C62828' : e.color;
    if (e.type === 'stroke' && e.pressure) parts.push(`<path d="${pressurePath(e.pts, e.width)}" fill="${col}"/>`);
    else if (e.type === 'stroke') parts.push(`<path d="${strokePath(e.pts)}" fill="none" stroke="${col}" stroke-width="${e.width}" ${e.alpha ? `stroke-opacity="${e.alpha}"` : ''} stroke-linecap="round"/>`);
    else if (e.type === 'line') parts.push(`<path d="M${e.x1} ${e.y1}L${e.x2} ${e.y2}" stroke="${col}" stroke-width="${e.width || 3}"/>`);
    else if (EL_SVG[e.type]) parts.push(EL_SVG[e.type](e, col));
    else if (e.type === 'shape') parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="none" stroke="${col}" stroke-width="3" rx="${e.kind === 'ellipse' ? Math.min(e.w, e.h) / 2 : 4}"/>` + (e.text ? `<text x="${e.x + 6}" y="${e.y + 20}" font-size="16" fill="${col}">${xesc(e.text)}</text>` : ''));
    else if (e.type === 'sticky' || e.type === 'text') parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" fill="${e.type === 'sticky' ? '#FFE98A' : 'none'}"/><text x="${e.x + 8}" y="${e.y + 22}" font-size="16" fill="#15201E">${xesc(e.text || '')}</text>`);
  }
  const pad = 20, x0 = img.x - pad, y0 = img.y - pad, W = img.w + 2 * pad, H = img.h + 2 * pad;
  const svgS = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>${parts.join('')}</svg>`;
  const scale = Math.max(1, Math.min(3, 2000 / Math.max(W, H)));
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgS); await im.decode();
  const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return { blob: await canvasBlob(c, 'image/png'), marks: ov.length };
}
const MK = { busy: false };
async function readMarkups(id) {
  const img = St.board.get(id); if (!img || !St.sample || MK.busy) return;
  MK.busy = true; renderWorld(); toast('🔍 Claude is reading your markups…');
  try {
    const { blob, marks } = await markedUpPNG(img);
    if (!marks) { toast('Mark up the drawing first — pen, shapes, notes or stamps on top of it.'); return; }
    const prompt = `This is an engineering drawing, document page or site photo that ${St.settings.me.name || 'an engineer'} marked up by hand (pen strokes, circles, arrows, clouds, highlights, sticky notes, stamps), in English or Arabic. List every markup as a review comment, in reading order (top-left to bottom-right): what the markup asks for, in clear words, keeping any numbers, tags and units exactly; where it is on the sheet (e.g. "title block", "pump P-101", "section A-A", "top right"); and what action it needs. Read handwriting carefully; if a mark is unreadable, say so instead of guessing. Keep the language of the handwriting. Reply with JSON only: {"title":"short name of the drawing or subject","comments":[{"no":1,"where":"…","comment":"…","action":"revise|clarify|add|delete|check|info"}]}`;
    const r = await St.sample.json(prompt, { images: [blob], modelTier: 'complex' });
    const cs = ((r && r.comments) || []).filter(c => c && c.comment).slice(0, 60);
    if (!cs.length) { toast('No markups could be read on this image.'); return; }
    const rows = [['No', 'Where', 'Comment', 'Action'], ...cs.map((c, i) => [String(c.no || i + 1), String(c.where || ''), String(c.comment), String(c.action || '')])];
    const spot = freeSpot(520, 34 * rows.length + 8, { x: img.x + img.w + 40, y: img.y });
    const tb = newEl('table', { x: spot.x, y: spot.y, w: 520, h: 34 * rows.length + 8, rows, head: true, title: r.title || img.name || 'Markups', fromImage: img.id });
    cvApply({ els: { [tb.id]: tb } }); UI.cvSel = new Set([tb.id]); render();
    MK.last = { id: tb.id, title: String(r.title || img.name || 'drawing').slice(0, 80) };
    toast(`📝 ${cs.length} comment${cs.length > 1 ? 's' : ''} read from your markups.`, { action: 'Make a task', fn: () => tableToTask(tb.id) });
  } catch (e) { toast((typeof aiErrorText === 'function' && aiErrorText(e)) || 'Claude could not read the markups now.', { err: true }); }
  finally { MK.busy = false; renderWorld(); }
}
// a comment table becomes one task with an item per row (the CRS of the drawing)
function tableToTask(id) {
  const tb = St.board.get(id); if (!tb) return;
  const rows = (tb.rows || []).slice(tb.head ? 1 : 0).filter(r => r.some(c => (c || '').trim()));
  if (!rows.length) { toast('The table is empty.'); return; }
  const t = makeTask({ title: E.shortTitle(`Address markups on ${tb.title || 'drawing'}`), action: `Resolve the ${rows.length} markup comment${rows.length > 1 ? 's' : ''} made on the canvas.`, history: [{ at: nowISO(), text: 'Created from canvas markups' }] });
  t.subtasks = rows.map((r, i) => ({ id: E.uid('s'), text: `${r[0] || i + 1} — ${r[2] || r[1] || ''}${r[1] && r[2] ? ` (${r[1]})` : ''}`, ref: String(r[0] || i + 1), location: r[1] || '', done: false }));
  if (typeof localPlace === 'function') localPlace(t);
  cvApply({ tasks: { [t.id]: t } }); render(); if (St.sample) queueCategorize([t.id]);
  toast(`✅ ${t.ref} added with ${rows.length} items.`, { action: 'Undo', fn: cvUndo });
}

/* --- tables --- */
CREATE_EL.table = ({ w0 }) => newEl('table', { x: w0.x, y: w0.y, w: 420, h: 3 * 34 + 8, rows: [['', '', ''], ['', '', ''], ['', '', '']], head: true });
const cellHTML = (el, r, c, v) => `<td data-cell="${r},${c}" dir="auto">${esc(v || '')}</td>`;
EL_HTML.table = (el, o) => `<div class="bel table${o.sel}" data-el="${esc(el.id)}" style="${o.st}">${el.title ? `<div class="tb-title" dir="auto">${esc(el.title)}</div>` : ''}<table class="${el.head ? 'head' : ''}">${(el.rows || []).map((row, r) => `<tr>${row.map((v, c) => cellHTML(el, r, c, v)).join('')}</tr>`).join('')}</table>${o.rz}${o.LK}</div>`;
EL_SVG.table = e => {
  const rows = e.rows || [], n = rows.length || 1, cols = Math.max(1, ...rows.map(r => r.length)), rh = (e.h - (e.title ? 26 : 0)) / n, cw = e.w / cols, y0 = e.y + (e.title ? 26 : 0);
  let s = e.title ? svgText(e.x, e.y + 18, [e.title], 14, '#15201E', 700) : '';
  rows.forEach((row, r) => row.forEach((v, c) => { s += `<rect x="${e.x + c * cw}" y="${y0 + r * rh}" width="${cw}" height="${rh}" fill="${e.head && !r ? '#F3E6EA' : '#fff'}" stroke="#B9A5AC"/>` + svgText(e.x + c * cw + 6, y0 + r * rh + rh / 2 + 4, [E.clip(v || '', Math.max(4, Math.floor(cw / 7)))], 12, '#15201E', e.head && !r ? 700 : 400); }));
  return s;
};
EL_EDIT.table = (id) => {
  const at = document.elementFromPoint(MP.sx, MP.sy), td = at && at.closest && at.closest(`[data-el="${CSS.escape(id)}"] td[data-cell]`) || document.querySelector(`[data-el="${CSS.escape(id)}"] td[data-cell]`);
  if (!td) return;
  UI.cvEditing = { kind: 'cell', id };
  td.setAttribute('contenteditable', 'plaintext-only'); td.focus();
  const rg = document.createRange(); rg.selectNodeContents(td); const sl = getSelection(); sl.removeAllRanges(); sl.addRange(rg);
  const done = ev => {
    UI.cvEditing = null; const el = St.board.get(id); if (!el) return;
    const [r, c] = td.dataset.cell.split(',').map(Number), v = td.innerText.replace(/\n+$/, '');
    if ((el.rows[r] || [])[c] !== v) { const rows = el.rows.map(x => x.slice()); rows[r][c] = v; const tbl = td.closest('table'); cvApply({ els: { [id]: { ...el, rows, h: Math.max(el.h, Math.ceil((tbl ? tbl.offsetHeight : 0) + (el.title ? 30 : 8))) } } }); }
    const toBtn = ev && ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('#map-vp button, .map-toolbar button');
    if (toBtn) setTimeout(render, 350); else render();
  };
  td.addEventListener('blur', done, { once: true });
  td.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' || (ev.key === 'Enter' && !ev.shiftKey)) { ev.preventDefault(); ev.stopPropagation(); td.blur(); }
    if (ev.key === 'Tab') { ev.preventDefault(); ev.stopPropagation(); const [r, c] = td.dataset.cell.split(',').map(Number); const el = St.board.get(id); td.blur(); const nc = (c + 1) % el.rows[0].length, nr = nc ? r : r + 1; setTimeout(() => { const n = document.querySelector(`[data-el="${CSS.escape(id)}"] td[data-cell="${nr},${nc}"]`); if (n) { const b = n.getBoundingClientRect(); MP.sx = b.x + 4; MP.sy = b.y + 4; EL_EDIT.table(id); } }, 380); }
  });
};
CTX_EXTRA.push((els, one) => {
  if (!one) return '';
  if (one.type === 'table') return `<span class="ctx-group"><button class="btn sm ghost" data-act="tb-row" data-d="1" title="Add a row">＋ Row</button><button class="btn sm ghost" data-act="tb-col" data-d="1" title="Add a column">＋ Col</button><button class="btn sm ghost" data-act="tb-row" data-d="-1" title="Remove the last row">− Row</button><button class="btn sm ghost" data-act="tb-col" data-d="-1" title="Remove the last column">− Col</button><button class="btn sm ghost" data-act="tb-head" aria-pressed="${!!one.head}" title="First row as header">Header</button>${(one.rows || []).length > 1 ? '<button class="btn sm" data-act="tb-task" title="One task with an item per row">→ Task</button>' : ''}</span>`;
  if (one.type === 'image') return `<span class="ctx-group">${St.sample ? `<button class="btn sm primary" data-act="mk-read" ${MK.busy ? 'disabled' : ''} title="Claude lists every markup on this image as a comment">${MK.busy ? 'Reading…' : '🔍 Read my markups'}</button>` : ''}</span>`;
  if (one.type === 'stamp') return `<span class="ctx-group">${STAMPS.map(([k, l]) => `<button class="btn sm ghost ${one.kind === k ? 'on' : ''}" data-act="st-kind" data-k="${k}" title="${esc(l)}">${esc(STAMP_SHORT[k])}</button>`).join('')}</span>`;
  return '';
});
const tbEdit = fn => { const id = [...UI.cvSel][0], el = St.board.get(id); if (!el || el.type !== 'table') return; const rows = el.rows.map(r => r.slice()); fn(rows, el); const next = { ...el, rows, h: 34 * rows.length + (el.title ? 30 : 8) }; cvApply({ els: { [id]: next } }); render(); };
Object.assign(ACT, {
  'tb-row': el => tbEdit(rows => { if (+el.dataset.d > 0) rows.push(rows[0].map(() => '')); else if (rows.length > 1) rows.pop(); }),
  'tb-col': el => tbEdit(rows => { if (+el.dataset.d > 0) rows.forEach(r => r.push('')); else if (rows[0].length > 1) rows.forEach(r => r.pop()); }),
  'tb-head': () => { const id = [...UI.cvSel][0], el = St.board.get(id); if (el) { cvApply({ els: { [id]: { ...el, head: !el.head } } }); render(); } },
  'tb-task': () => tableToTask([...UI.cvSel][0]),
  'mk-read': () => readMarkups([...UI.cvSel][0]),
});

/* --- stamps --- */
const STAMPS = [['c1', 'CODE 1 — APPROVED'], ['c2', 'CODE 2 — APPROVED WITH COMMENTS'], ['c3', 'CODE 3 — REVISE & RESUBMIT'], ['c4', 'CODE 4 — REJECTED'], ['hold', 'HOLD'], ['clarify', 'CLARIFY'], ['info', 'FOR INFORMATION'], ['urgent', 'URGENT']];
const STAMP_SHORT = { c1: 'Code 1', c2: 'Code 2', c3: 'Code 3', c4: 'Code 4', hold: 'Hold', clarify: 'Clarify', info: 'Info', urgent: 'Urgent' };
const STAMP_COL = { c1: '#1F7A4D', c2: '#2F6FB0', c3: '#C26100', c4: '#C62828', hold: '#C62828', clarify: '#2F6FB0', info: '#5B6B68', urgent: '#C62828' };
UI.stampKind = UI.stampKind || 'c1';
CREATE_EL.stamp = ({ w0 }) => newEl('stamp', { kind: UI.stampKind, x: Math.round(w0.x - 110), y: Math.round(w0.y - 34), w: 220, h: 68, date: T(), by: (St.settings.me.name || '').split(' ').map(x => x[0] || '').join('').toUpperCase().slice(0, 3) });
EL_HTML.stamp = (el, o) => { const lab = (STAMPS.find(s => s[0] === el.kind) || STAMPS[0])[1]; return `<div class="bel stamp${o.sel}" data-el="${esc(el.id)}" style="${o.st};--c:${STAMP_COL[el.kind] || '#C62828'}"><div class="st-in"><b>${esc(lab)}</b><small>${esc(fmtDate(el.date || T(), { day: 'numeric', month: 'short', year: 'numeric' }))}${el.by ? ' · ' + esc(el.by) : ''}</small></div>${o.rz}${o.LK}</div>`; };
EL_SVG.stamp = e => { const lab = (STAMPS.find(s => s[0] === e.kind) || STAMPS[0])[1], c = STAMP_COL[e.kind] || '#C62828'; return `<g transform="rotate(-6 ${e.x + e.w / 2} ${e.y + e.h / 2})"><rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="8" fill="none" stroke="${c}" stroke-width="3"/><rect x="${e.x + 5}" y="${e.y + 5}" width="${e.w - 10}" height="${e.h - 10}" rx="5" fill="none" stroke="${c}" stroke-width="1.2"/>${svgText(e.x + 14, e.y + e.h / 2, [lab], Math.min(16, (e.w - 28) / lab.length * 1.75), c, 800)}${svgText(e.x + 14, e.y + e.h - 14, [fmtDate(e.date || T(), { day: 'numeric', month: 'short', year: 'numeric' }) + (e.by ? ' · ' + e.by : '')], 11, c, 600)}</g>`; };
ACT['st-kind'] = el => { const id = [...UI.cvSel][0], s = St.board.get(id); if (s && s.type === 'stamp') { UI.stampKind = el.dataset.k; cvApply({ els: { [id]: { ...s, kind: el.dataset.k } } }); render(); } };
ACT['st-pick'] = el => { UI.stampKind = el.dataset.k; UI.tool = 'stamp'; render(); };
// the stamp chooser while the Stamp tool is on
HOOKS.afterRender.push(() => {
  const vp = document.getElementById('map-vp'); if (!vp) return;
  const old = vp.querySelector(':scope > .stamp-pick'); if (old) old.remove();
  if (UI.tool !== 'stamp') return;
  vp.insertAdjacentHTML('beforeend', deco(`<div class="stamp-pick cv-overlay" role="toolbar" aria-label="Stamps">${STAMPS.map(([k, l]) => `<button class="st-opt ${UI.stampKind === k ? 'on' : ''}" data-act="st-pick" data-k="${k}" style="--c:${STAMP_COL[k]}" title="${esc(l)}">${esc(STAMP_SHORT[k])}</button>`).join('')}</div>`));
});
