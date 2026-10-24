/* Workbook converter: an ExcelJS workbook → the plain model the engine runs and the app draws.
   Model: { v, sheets: [{ name, state, prot, maxR, maxC, cols, rows, merges, cells: { "r,c": { v, f, a, s } }, dv, tab, grid }],
            styles: [{ bg, fg, b, i, u, sz, ha, va, wrap, ind, bd, nf }], names: { NAME: "Sheet!$A$1:$A$9" } } */
(function (root) {
  'use strict';
  // Office default theme colours (theme index → hex), used when a colour is given as a theme
  const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47'];
  const tint = (hex, t) => { if (!t) return hex; const n = parseInt(hex, 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = c => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t); r = f(r); g = f(g); b = f(b); return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase(); };
  function color(c) {
    if (!c) return null;
    if (c.argb) { const a = String(c.argb); return a.length === 8 ? a.slice(2).toUpperCase() : a.toUpperCase(); }
    if (c.theme !== undefined) return tint(THEME[c.theme] || '000000', c.tint || 0);
    if (c.indexed !== undefined) return c.indexed === 64 ? null : ({ 8: '000000', 9: 'FFFFFF', 10: 'FF0000', 13: 'FFFF00', 43: 'FFFF99', 22: 'C0C0C0', 64: null }[c.indexed] || null);
    return null;
  }
  const colNum = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  function rangeOf(a) {
    const m = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i.exec(String(a).trim());
    if (!m) return null; const r1 = +m[2], c1 = colNum(m[1]); return [r1, c1, m[4] ? +m[4] : r1, m[3] ? colNum(m[3]) : c1];
  }
  const serial = d => d.getTime() / 86400000 + 25569;

  function convert(wb, meta) {
    const styles = [], styleKey = new Map();
    const styleOf = cell => {
      const f = cell.fill, ft = cell.font || {}, al = cell.alignment || {}, bd = cell.border || {};
      const st = {};
      if (f && f.type === 'pattern' && f.pattern && f.pattern !== 'none') { const c = color(f.fgColor) || color(f.bgColor); if (c) st.bg = c; }
      if (f && f.type === 'gradient' && f.stops && f.stops[0]) { const c = color(f.stops[0].color); if (c) st.bg = c; }
      const fc = color(ft.color); if (fc && fc !== '000000') st.fg = fc;
      if (ft.bold) st.b = 1; if (ft.italic) st.i = 1; if (ft.underline) st.u = 1; if (ft.size && ft.size !== 11) st.sz = ft.size; if (ft.strike) st.st = 1;
      if (al.horizontal && al.horizontal !== 'general') st.ha = al.horizontal; if (al.vertical) st.va = al.vertical; if (al.wrapText) st.wrap = 1; if (al.indent) st.ind = al.indent;
      const side = s => (s && s.style ? (s.style === 'thin' || s.style === 'hair' ? 1 : s.style === 'medium' || s.style === 'dashed' || s.style === 'dotted' ? 2 : 3) + ':' + (color(s.color) || '000000') : '');
      const b = [side(bd.top), side(bd.right), side(bd.bottom), side(bd.left)]; if (b.some(Boolean)) st.bd = b;
      if (cell.numFmt && cell.numFmt !== 'General') st.nf = cell.numFmt;
      const key = JSON.stringify(st); if (key === '{}') return undefined;
      if (!styleKey.has(key)) { styleKey.set(key, styles.length); styles.push(st); }
      return styleKey.get(key);
    };
    const sheets = [];
    wb.eachSheet(ws => {
      const cells = {}; let maxR = 0, maxC = 0;
      ws.eachRow({ includeEmpty: true }, row => {
        row.eachCell({ includeEmpty: true }, cell => {
          if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
          const r = cell.row, c = cell.col; const out = {};
          let v = cell.value;
          if (v && typeof v === 'object' && !(v instanceof Date)) {
            if (v.formula !== undefined || v.sharedFormula !== undefined) {
              out.f = String(cell.formula || v.formula || '').replace(/^=/, '');
              if (v.shareType === 'array') { const rg = rangeOf(v.ref || cell.address); out.a = rg || true; }
              let res = v.result; if (res && typeof res === 'object') res = res.error ? { e: res.error } : res instanceof Date ? serial(res) : null;
              out.v = res === undefined ? null : res;
            } else if (v.richText) out.v = v.richText.map(t => t.text).join('');
            else if (v.text !== undefined && v.hyperlink !== undefined) { out.v = typeof v.text === 'object' && v.text.richText ? v.text.richText.map(t => t.text).join('') : v.text; out.link = v.hyperlink; }
            else if (v.error) out.v = { e: v.error };
            else out.v = null;
          } else if (v instanceof Date) out.v = serial(v);
          else out.v = v === undefined ? null : v;
          const s = styleOf(cell); if (s !== undefined) out.s = s;
          const empty = (out.v === null || out.v === '') && !out.f;
          if (empty && out.s === undefined) return;
          cells[r + ',' + c] = out;
          if (!empty) { maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
        });
      });
      // cut styled-only cells far outside the used area
      for (const k of Object.keys(cells)) { const [r, c] = k.split(',').map(Number); if (r > maxR + 2 || c > maxC + 2) delete cells[k]; }
      const cols = []; for (let c = 1; c <= Math.max(maxC, 1); c++) { const col = ws.getColumn(c); cols.push({ w: col.width || 8.43, hidden: !!col.hidden }); }
      const rows = {}; for (let r = 1; r <= maxR; r++) { const row = ws.getRow(r); if (row.height || row.hidden) rows[r] = { h: row.height || undefined, hidden: !!row.hidden }; }
      const merges = ((ws.model && ws.model.merges) || []).map(rangeOf).filter(Boolean);
      const dv = [];
      const dvm = (ws.dataValidations && ws.dataValidations.model) || {};
      for (const [k, d] of Object.entries(dvm)) {
        if (!d) continue;
        const ranges = k.split(/\s+/).map(x => (/^range:/.test(x) ? x.slice(6) : x)).map(rangeOf).filter(Boolean); if (!ranges.length) continue;
        const f1 = d.formulae && d.formulae[0] !== undefined ? String(d.formulae[0]) : '', f2 = d.formulae && d.formulae[1] !== undefined ? String(d.formulae[1]) : '';
        const same = dv.find(x => x.type === d.type && x.f1 === f1 && x.f2 === f2 && x.op === d.operator);
        if (same) same.ranges.push(...ranges); else dv.push({ ranges, type: d.type, op: d.operator || '', f1, f2, prompt: d.prompt || '', error: d.error || '' });
      }
      const view = (ws.views && ws.views[0]) || {};
      sheets.push({ name: ws.name, state: ws.state || 'visible', prot: !!(ws.sheetProtection && ws.sheetProtection.sheet), maxR, maxC, cols, rows, merges, cells, dv,
        tab: ws.properties && ws.properties.tabColor ? color(ws.properties.tabColor) : null, grid: view.showGridLines !== false,
        freeze: view.state === 'frozen' ? { r: view.ySplit || 0, c: view.xSplit || 0 } : null });
    });
    const names = {};
    for (const d of (wb.definedNames && wb.definedNames.model) || []) {
      if (!d || !d.name || /^_xlnm\./.test(d.name)) continue;
      const f = (d.ranges || []).join(',');
      if (f) names[d.name] = d.localSheetId !== undefined && sheets[d.localSheetId] ? { f, sheet: sheets[d.localSheetId].name } : f;
    }
    return { v: 1, ...(meta || {}), sheets, styles, names };
  }

  // the cover-sheet facts shown on the library card: title, subtitle, description, author, revision
  function describe(model) {
    const out = { title: '', subtitle: '', about: '', author: '', revision: '', date: '', refs: '' };
    const cover = model.sheets.find(s => /cover|about|read ?me|info/i.test(s.name)) || model.sheets[0];
    if (!cover) return out;
    const text = Object.entries(cover.cells).map(([k, c]) => { const [r, col] = k.split(',').map(Number); return { r, c: col, v: typeof c.v === 'string' ? c.v.trim() : '' }; }).filter(x => x.v).sort((a, b) => a.r - b.r || a.c - b.c);
    const right = (label) => { const l = text.find(x => new RegExp('^' + label, 'i').test(x.v)); if (!l) return ''; const v = text.find(x => x.r === l.r && x.c > l.c); return v ? v.v : ''; };
    out.author = right('Author'); out.revision = right('Revision') || right('Version'); out.date = right('Issue Date') || right('Issued'); out.refs = right('Governing References') || right('Data Sources') || right('References');
    const firsts = text.filter(x => x.v.length > 3 && !/:$/.test(x.v));
    out.title = (firsts[0] || {}).v || model.name || '';
    out.subtitle = (firsts[1] || {}).v || '';
    out.about = (text.find(x => x.v.length > 120) || {}).v || '';
    return out;
  }

  // read .xlsx bytes with ExcelJS; drawings, charts and comments are removed first (the tools do not need them
  // and some files make ExcelJS fail on them)
  async function read(ExcelJS, JSZip, bytes) {
    const zip = await JSZip.loadAsync(bytes);
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/(drawings|charts|media|comments|threadedComments|persons)\//i.test(name) || /^xl\/comments\d*\.xml$/i.test(name) || /^xl\/vmlDrawing/i.test(name)) { zip.remove(name); continue; }
      if (/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)) {
        const x = await zip.file(name).async('string');
        zip.file(name, x.replace(/<(?:drawing|legacyDrawing|legacyDrawingHF|picture)\b[^>]*\/>/g, ''));
      }
      if (/^xl\/worksheets\/_rels\/.*\.rels$/i.test(name)) {
        const x = await zip.file(name).async('string');
        zip.file(name, x.replace(/<Relationship\b[^>]*Type="[^"]*\/(?:drawing|vmlDrawing|comments|threadedComment|image)"[^>]*\/>/g, ''));
      }
    }
    const ct = zip.file('[Content_Types].xml');
    if (ct) { const x = await ct.async('string'); zip.file('[Content_Types].xml', x.replace(/<Override\b[^>]*PartName="\/xl\/(?:drawings|charts|comments|threadedComments|persons)[^"]*"[^>]*\/>/g, '')); }
    const clean = await zip.generateAsync({ type: 'uint8array' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(clean);
    return wb;
  }

  const api = { convert, describe, rangeOf, read };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WBC = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
