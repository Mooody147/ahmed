/* Workbook engine: runs Excel workbooks (values, formulas, named ranges, data validation) without Excel.
   Used by Tools › Workbooks in the app and by the node tests. A workbook model comes from convert.js. */
(function (root) {
  'use strict';

  /* ---------- values ---------- */
  class XErr { constructor(e) { this.e = e; } toString() { return this.e; } }
  const ERR = {};
  for (const e of ['#N/A', '#VALUE!', '#REF!', '#DIV/0!', '#NUM!', '#NAME?', '#NULL!', '#CIRC!']) ERR[e] = new XErr(e);
  const isErr = v => v instanceof XErr;
  // a rectangular array of values (rows × cols)
  class Arr { constructor(rows) { this.rows = rows; } get h() { return this.rows.length; } get w() { return this.rows[0] ? this.rows[0].length : 0; } }
  // a reference to a block of cells
  class Ref { constructor(book, sheet, r1, c1, r2, c2) { this.book = book; const sh = typeof sheet === 'string' ? book.sheet(sheet) : sheet; this.sh = sh; this.sheet = sh ? sh.name : sheet; this.r1 = Math.min(r1, r2); this.c1 = Math.min(c1, c2); this.r2 = Math.max(r1, r2); this.c2 = Math.max(c1, c2); }
    get h() { return this.r2 - this.r1 + 1; } get w() { return this.c2 - this.c1 + 1; }
    value(r, c) { return this.book.valueSh(this.sh, this.r1 + r, this.c1 + c); }
    // ranges are read once per recalculation
    toArr() {
      const key = this.sh.idx + ':' + this.r1 + ',' + this.c1 + ',' + this.r2 + ',' + this.c2;
      const hit = this.book.rcache.get(key); if (hit) return hit;
      const rows = []; for (let r = 0; r < this.h; r++) { const row = []; for (let c = 0; c < this.w; c++) row.push(this.value(r, c)); rows.push(row); }
      const a = new Arr(rows); this.book.rcache.set(key, a); return a;
    } }

  /* ---------- addresses ---------- */
  const colNum = s => { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const colName = n => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const addr = (r, c) => colName(c) + r;
  function parseAddr(a) { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a); return m ? { r: +m[2], c: colNum(m[1]) } : null; }
  const MAXR = 1048576, MAXC = 16384;

  /* ---------- tokenizer ---------- */
  const FN_RE = /^(?:_xlfn\.|_xlws\.)?[A-Za-z][A-Za-z0-9_.]*(?=\s*\()/;
  const SHEET_RE = /^(?:'((?:[^']|'')+)'|([A-Za-z_\u00C0-\uFFFF][\w.\u00C0-\uFFFF]*))!/;
  const CELL_RE = /^\$?[A-Za-z]{1,3}\$?\d+/;
  const COL_RE = /^\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}(?![\w(])/;
  const ROW_RE = /^\$?\d+:\$?\d+(?![\w.])/;
  function tokenize(src) {
    const out = []; let i = 0; const s = src;
    const push = (t, v, extra) => out.push(Object.assign({ t, v }, extra || {}));
    while (i < s.length) {
      const ch = s[i], rest = s.slice(i);
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
      if (ch === '"') { let j = i + 1, str = ''; for (;;) { if (j >= s.length) throw new Error('Unclosed string'); if (s[j] === '"') { if (s[j + 1] === '"') { str += '"'; j += 2; continue; } break; } str += s[j++]; } push('str', str); i = j + 1; continue; }
      if (ch === '#') { const m = /^#(?:N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!|GETTING_DATA)/i.exec(rest); if (m) { push('err', m[0].toUpperCase()); i += m[0].length; continue; } }
      if (ch === '{') { push('{', ch); i++; continue; } if (ch === '}') { push('}', ch); i++; continue; }
      if (ch === '(' || ch === ')' || ch === ',' || ch === ';') { push(ch, ch); i++; continue; }
      const op2 = s.substr(i, 2);
      if (op2 === '<=' || op2 === '>=' || op2 === '<>') { push('op', op2); i += 2; continue; }
      if ('+-*/^&=<>%:'.includes(ch)) { push('op', ch); i++; continue; }
      if (/[0-9.]/.test(ch)) { const m = /^(\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest); if (m && !/^\d+:\$?\d/.test(rest)) { push('num', parseFloat(m[0])); i += m[0].length; continue; } }
      // sheet-qualified or plain reference / name / function
      let sheet = null, j = i; const sm = SHEET_RE.exec(rest);
      if (sm) { sheet = (sm[1] || sm[2]).replace(/''/g, "'"); j = i + sm[0].length; }
      const r2 = s.slice(j);
      let m;
      if ((m = COL_RE.exec(r2))) { push('ref', m[0], { sheet }); i = j + m[0].length; continue; }
      if ((m = ROW_RE.exec(r2))) { push('ref', m[0], { sheet }); i = j + m[0].length; continue; }
      if ((m = CELL_RE.exec(r2)) && !/^[\w(]/.test(r2.slice(m[0].length))) { push('ref', m[0], { sheet }); i = j + m[0].length; continue; }
      if (!sheet && (m = FN_RE.exec(r2))) { push('fn', m[0].replace(/^_xl(?:fn|ws)\./i, '').toUpperCase()); i = j + m[0].length; continue; }
      if ((m = /^[A-Za-z_\\\u00C0-\uFFFF][\w.\u00C0-\uFFFF]*/.exec(r2))) {
        const w = m[0].toUpperCase();
        if (!sheet && (w === 'TRUE' || w === 'FALSE')) push('bool', w === 'TRUE'); else push('name', m[0], { sheet });
        i = j + m[0].length; continue;
      }
      throw new Error('Unexpected "' + ch + '" in formula');
    }
    return out;
  }

  /* ---------- parser → AST ---------- */
  function parse(src) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    function expect(t) { const k = next(); if (!k || k.t !== t) throw new Error('Expected ' + t); return k; }
    function compare() { let a = concat(); while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const op = next().v; a = { k: 'bin', op, a, b: concat() }; } return a; }
    function concat() { let a = add(); while (isOp('&')) { next(); a = { k: 'bin', op: '&', a, b: add() }; } return a; }
    function add() { let a = mul(); while (isOp('+') || isOp('-')) { const op = next().v; a = { k: 'bin', op, a, b: mul() }; } return a; }
    function mul() { let a = pow(); while (isOp('*') || isOp('/')) { const op = next().v; a = { k: 'bin', op, a, b: pow() }; } return a; }
    function pow() { let a = unary(); while (isOp('^')) { next(); a = { k: 'bin', op: '^', a, b: unary() }; } return a; }
    function unary() { if (isOp('-')) { next(); return { k: 'neg', a: unary() }; } if (isOp('+')) { next(); return unary(); } return percent(); }
    function percent() { let a = range(); while (isOp('%')) { next(); a = { k: 'pct', a }; } return a; }
    function range() { let a = primary(); while (isOp(':')) { next(); a = { k: 'range', a, b: primary() }; } return a; }
    function args() { const list = []; expect('('); if (peek() && peek().t === ')') { next(); return list; }
      for (;;) { if (peek() && (peek().t === ',' )) { list.push({ k: 'missing' }); next(); continue; } if (peek() && peek().t === ')') { list.push({ k: 'missing' }); next(); return list; }
        list.push(compare()); const k = next(); if (!k) throw new Error('Unclosed ('); if (k.t === ')') return list; if (k.t !== ',') throw new Error('Expected , or )'); if (peek() && peek().t === ')') { list.push({ k: 'missing' }); next(); return list; } } }
    function primary() {
      const k = next(); if (!k) throw new Error('Unexpected end of formula');
      if (k.t === 'num') return { k: 'num', v: k.v };
      if (k.t === 'str') return { k: 'str', v: k.v };
      if (k.t === 'bool') return { k: 'bool', v: k.v };
      if (k.t === 'err') return { k: 'err', v: k.v };
      if (k.t === 'ref') return refNode(k.v, k.sheet);
      if (k.t === 'name') return { k: 'name', v: k.v, sheet: k.sheet };
      if (k.t === 'fn') return { k: 'fn', name: k.v, args: args() };
      if (k.t === '(') { const e = compare(); expect(')'); return { k: 'paren', a: e }; }
      if (k.t === '{') { const rows = [[]]; for (;;) { const t = next(); if (!t) throw new Error('Unclosed {'); if (t.t === '}') break; if (t.t === ',') continue; if (t.t === ';') { rows.push([]); continue; }
          let v; if (t.t === 'op' && t.v === '-') { const n = next(); v = -n.v; } else if (t.t === 'num' || t.t === 'str' || t.t === 'bool') v = t.v; else if (t.t === 'err') v = ERR[t.v]; else throw new Error('Bad array constant'); rows[rows.length - 1].push(v); }
        return { k: 'arr', rows }; }
      throw new Error('Unexpected ' + (k.v || k.t));
    }
    const ast = compare(); if (p < toks.length) throw new Error('Unexpected ' + (toks[p].v || toks[p].t));
    return ast;
  }
  function refNode(text, sheet) {
    const t = text.replace(/\$/g, '');
    let m;
    if ((m = /^([A-Za-z]{1,3}):([A-Za-z]{1,3})$/.exec(t))) return { k: 'ref', sheet, r1: 1, c1: colNum(m[1]), r2: MAXR, c2: colNum(m[2]), wholeCol: true, abs: [text.includes('$'), text.includes('$')], text };
    if ((m = /^(\d+):(\d+)$/.exec(t))) return { k: 'ref', sheet, r1: +m[1], c1: 1, r2: +m[2], c2: MAXC, wholeRow: true, text };
    const a = parseAddr(t);
    const ca = /^\$/.test(text), ra = /^\$?[A-Za-z]+\$/.test(text);
    return { k: 'ref', sheet, r1: a.r, c1: a.c, r2: a.r, c2: a.c, absC: ca, absR: ra };
  }
  // AST → formula text (used after inserting / deleting rows)
  function unparse(n) {
    const sh = s => s ? (/^[A-Za-z_][\w.]*$/.test(s) ? s : "'" + s.replace(/'/g, "''") + "'") + '!' : '';
    switch (n.k) {
      case 'num': return String(n.v);
      case 'str': return '"' + n.v.replace(/"/g, '""') + '"';
      case 'bool': return n.v ? 'TRUE' : 'FALSE';
      case 'err': return n.v;
      case 'missing': return '';
      case 'name': return sh(n.sheet) + n.v;
      case 'paren': return '(' + unparse(n.a) + ')';
      case 'neg': return '-' + unparse(n.a);
      case 'pct': return unparse(n.a) + '%';
      case 'range': return n.a && n.a.deleted && n.b && n.b.deleted ? unparse(n.a) : unparse(n.a) + ':' + unparse(n.b);
      case 'bin': return unparse(n.a) + n.op + unparse(n.b);
      case 'fn': return n.name + '(' + n.args.map(unparse).join(',') + ')';
      case 'arr': return '{' + n.rows.map(r => r.map(v => typeof v === 'string' ? '"' + v + '"' : isErr(v) ? v.e : String(v)).join(',')).join(';') + '}';
      case 'ref': {
        if (n.deleted) return sh(n.sheet) + '#REF!';
        if (n.wholeCol || n.wholeRow) return sh(n.sheet) + n.text;
        const one = (r, c, ac, ar) => (ac ? '$' : '') + colName(c) + (ar ? '$' : '') + r;
        return sh(n.sheet) + one(n.r1, n.c1, n.absC, n.absR) + (n.r2 !== n.r1 || n.c2 !== n.c1 ? ':' + one(n.r2, n.c2, n.absC2 ?? n.absC, n.absR2 ?? n.absR) : '');
      }
    }
    return '';
  }

  /* ---------- coercion ---------- */
  function toNum(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErr(v)) return v;
    if (typeof v === 'string') { const t = v.trim(); if (t === '') return ERR['#VALUE!']; const pct = /%$/.test(t); const n = Number(pct ? t.slice(0, -1) : t.replace(/,/g, '')); return Number.isFinite(n) ? (pct ? n / 100 : n) : ERR['#VALUE!']; }
    return ERR['#VALUE!'];
  }
  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return numGeneral(v, 15);
    if (isErr(v)) return v.e;
    return String(v);
  }
  function toBool(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (isErr(v)) return v;
    if (typeof v === 'string') { const u = v.toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return ERR['#VALUE!']; }
    return false;
  }
  // a number in Excel's "General" style with up to `sig` significant digits
  function numGeneral(n, sig) {
    if (!Number.isFinite(n)) return '#NUM!';
    if (n === 0) return '0';
    const a = Math.abs(n);
    if (a >= 1e15 || a < 1e-9) { let s = n.toExponential(Math.min(sig, 15) - 1); s = s.replace(/\.?0+e/, 'E').replace(/E\+?/, 'E+').replace('E+-', 'E-'); return s; }
    let s = parseFloat(n.toPrecision(sig)).toString();
    if (/e/.test(s)) s = parseFloat(n.toPrecision(sig)).toFixed(Math.max(0, sig - Math.floor(Math.log10(a)) - 1)).replace(/\.?0+$/, '');
    return s;
  }
  const fix15 = n => (typeof n === 'number' && Number.isFinite(n) ? parseFloat(n.toPrecision(15)) : n);

  /* ---------- number formats (cell display and TEXT()) ---------- */
  function splitSections(fmt) { const out = []; let cur = '', q = false; for (let i = 0; i < fmt.length; i++) { const ch = fmt[i]; if (ch === '"') q = !q; if (ch === '\\' && !q) { cur += ch + (fmt[i + 1] || ''); i++; continue; } if (ch === ';' && !q) { out.push(cur); cur = ''; continue; } cur += ch; } out.push(cur); return out; }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function serialToDate(n) { const ms = Math.round((n - 25569) * 86400000); return new Date(ms); }
  function dateToSerial(d) { return d.getTime() / 86400000 + 25569; }
  function roundHalf(x, d) { const m = Math.pow(10, d); const v = Math.abs(x) * m; const r = Math.round(fix15(v) + 1e-9 * (v > 1 ? 1 : 0)); return Math.sign(x) * r / m; }
  function fmtDate(n, sec) {
    const d = serialToDate(n); const Y = d.getUTCFullYear(), M = d.getUTCMonth(), D = d.getUTCDate(), h = d.getUTCHours(), mi = d.getUTCMinutes(), s = d.getUTCSeconds();
    const ampm = /AM\/PM/i.test(sec);
    let out = '', i = 0; const f = sec;
    while (i < f.length) {
      const rest = f.slice(i); let m;
      if (rest[0] === '"') { const j = f.indexOf('"', i + 1); out += f.slice(i + 1, j < 0 ? f.length : j); i = j < 0 ? f.length : j + 1; continue; }
      if (rest[0] === '\\') { out += rest[1] || ''; i += 2; continue; }
      if ((m = /^yyyy|^yy/i.exec(rest))) { out += m[0].length === 4 ? Y : String(Y).slice(-2); i += m[0].length; continue; }
      if ((m = /^mmmmm|^mmmm|^mmm/i.exec(rest))) { out += m[0].length === 5 ? MONTHS[M][0] : m[0].length === 4 ? MONTHS[M] : MONTHS[M].slice(0, 3); i += m[0].length; continue; }
      if ((m = /^dddd|^ddd/i.exec(rest))) { out += m[0].length === 4 ? DAYS[d.getUTCDay()] : DAYS[d.getUTCDay()].slice(0, 3); i += m[0].length; continue; }
      if ((m = /^dd?/i.exec(rest))) { out += m[0].length === 2 ? String(D).padStart(2, '0') : D; i += m[0].length; continue; }
      if ((m = /^hh?/i.exec(rest))) { const hh = ampm ? (h % 12 || 12) : h; out += m[0].length === 2 ? String(hh).padStart(2, '0') : hh; i += m[0].length; continue; }
      if ((m = /^mm?/i.exec(rest))) { const prevH = /h[^a-z]*$/i.test(out ? f.slice(0, i) : ''); const nextS = /^m+[^a-z]*s/i.test(rest); const val = prevH || nextS ? mi : M + 1; out += m[0].length === 2 ? String(val).padStart(2, '0') : val; i += m[0].length; continue; }
      if ((m = /^ss?/i.exec(rest))) { out += m[0].length === 2 ? String(s).padStart(2, '0') : s; i += m[0].length; continue; }
      if ((m = /^AM\/PM/i.exec(rest))) { out += h < 12 ? 'AM' : 'PM'; i += m[0].length; continue; }
      out += rest[0]; i++;
    }
    return out;
  }
  function formatNumber(v, fmt) {
    if (fmt === undefined || fmt === null || fmt === '' || /^general$/i.test(fmt)) return typeof v === 'number' ? numGeneral(v, 11) : toStr(v);
    const secs = splitSections(fmt);
    if (typeof v !== 'number') { if (typeof v === 'string' && secs[3] !== undefined) return secs[3].replace(/@/g, v).replace(/"/g, ''); if (typeof v === 'string' && secs.length === 1 && secs[0].includes('@')) return secs[0].replace(/"([^"]*)"/g, '$1').replace(/@/g, v); return toStr(v); }
    let sec = secs[0], x = v, signDone = false;
    if (secs.length >= 2 && v < 0) { sec = secs[1]; x = -v; signDone = true; }
    if (secs.length >= 3 && v === 0) { sec = secs[2]; }
    // conditions like [>=100] and colours like [Red]
    sec = sec.replace(/\[(?:Red|Green|Blue|Black|White|Yellow|Magenta|Cyan|Color\s*\d+)\]/gi, '').replace(/\[[<>=][^\]]*\]/g, '').replace(/\[\$[^\]]*\]/g, m => { const mm = /^\[\$([^-\]]*)/.exec(m); return mm ? '"' + mm[1] + '"' : ''; });
    const bare = sec.replace(/"[^"]*"/g, '').replace(/\\./g, '');
    if (/[dy]|h|(?:^|[^0#])m(?![^"]*")|s(?![a-z])/i.test(bare) && !/[0#?]/.test(bare)) return fmtDate(x, sec);
    if (!/[0#?]/.test(bare)) return sec.replace(/"([^"]*)"/g, '$1').replace(/\\(.)/g, '$1').replace(/_./g, ' ').replace(/\*./g, '');
    const pct = (bare.match(/%/g) || []).length; if (pct) x = x * Math.pow(100, pct);
    // scientific
    const em = /([0#?.,]+)E([+-])([0#]+)/i.exec(sec);
    if (em) {
      const mant = em[1], dec = (mant.split('.')[1] || '').replace(/[^0#]/g, '').length;
      let s = Math.abs(x).toExponential(dec); let [mm, ee] = s.split('e'); const en = +ee;
      const ed = em[3].length; const es = (en < 0 ? '-' : em[2] === '+' ? '+' : '') + String(Math.abs(en)).padStart(ed, '0');
      const pre = sec.slice(0, em.index).replace(/"([^"]*)"/g, '$1'), post = sec.slice(em.index + em[0].length).replace(/"([^"]*)"/g, '$1');
      return (!signDone && v < 0 ? '-' : '') + pre + mm + 'E' + es + post;
    }
    // split into literal prefix, number part, literal suffix
    const tokens = []; let i = 0;
    while (i < sec.length) {
      const ch = sec[i];
      if (ch === '"') { const j = sec.indexOf('"', i + 1); tokens.push({ lit: sec.slice(i + 1, j < 0 ? sec.length : j) }); i = j < 0 ? sec.length : j + 1; continue; }
      if (ch === '\\') { tokens.push({ lit: sec[i + 1] || '' }); i += 2; continue; }
      if (ch === '_') { tokens.push({ lit: ' ' }); i += 2; continue; }
      if (ch === '*') { i += 2; continue; }
      if ('0#?.,'.includes(ch)) { const last = tokens[tokens.length - 1]; if (last && last.num !== undefined) last.num += ch; else tokens.push({ num: ch }); i++; continue; }
      tokens.push({ lit: ch }); i++;
    }
    const numToks = tokens.filter(t => t.num !== undefined);
    let pattern = numToks.map(t => t.num).join('');
    // trailing commas scale by 1000
    let scale = 0; while (/,$/.test(pattern)) { pattern = pattern.slice(0, -1); scale++; } if (scale) x = x / Math.pow(1000, scale);
    const [ip, dp = ''] = pattern.split('.');
    const decMax = dp.replace(/[^0#?]/g, '').length, decMin = dp.replace(/[^0?]/g, '').length;
    const thousands = /,/.test(ip);
    const intMin = ip.replace(/[^0?]/g, '').length;
    let r = roundHalf(Math.abs(x), decMax);
    let [is, ds = ''] = r.toFixed(decMax).split('.');
    if (decMax > decMin) { ds = ds.replace(/0+$/, ''); if (ds.length < decMin) ds = ds.padEnd(decMin, '0'); }
    if (is === '0' && intMin === 0) is = '';
    if (is.length < intMin) is = is.padStart(intMin, '0');
    if (thousands) is = is.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    let numStr = is + (pattern.includes('.') ? '.' + ds : '');
    if (pattern.includes('.') && !ds && /\.$/.test(numStr) && dp === '') numStr = numStr; // keep "0." patterns as written
    const neg = !signDone && v < 0 && (r !== 0 || /[1-9]/.test(numStr));
    let out = ''; let placed = false;
    for (const t of tokens) { if (t.num !== undefined) { if (!placed) { out += numStr; placed = true; } } else out += t.lit; }
    return (neg ? '-' : '') + out;
  }

  /* ---------- comparisons ---------- */
  const typeRank = v => (typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 0);
  function cmp(a, b) { // returns -1, 0, 1
    if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = typeRank(a), tb = typeRank(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ta === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    if (ta === 1) { const x = fix15(a), y = fix15(b); return x < y ? -1 : x > y ? 1 : 0; }
    return a === b ? 0 : a ? 1 : -1;
  }
  const wildRe = s => new RegExp('^' + s.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/~\*/g, '\u0001').replace(/~\?/g, '\u0002').replace(/\*/g, '.*').replace(/\?/g, '.').replace(/\u0001/g, '\\*').replace(/\u0002/g, '\\?') + '$', 'i');
  // COUNTIF-style criteria
  function criteria(c) {
    if (isErr(c)) return v => isErr(v) && v.e === c.e;
    if (typeof c === 'number') return v => (typeof v === 'number' && fix15(v) === fix15(c)) || (typeof v === 'string' && v.trim() !== '' && Number(v) === c);
    if (typeof c === 'boolean') return v => v === c;
    let s = c === null || c === undefined ? '' : String(c), op = '=';
    const m = /^(<=|>=|<>|<|>|=)/.exec(s); if (m) { op = m[1]; s = s.slice(op.length); }
    const n = s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null;
    const b = /^(TRUE|FALSE)$/i.test(s) ? /^TRUE$/i.test(s) : null;
    if (op === '=' || op === '<>') {
      let test;
      if (s === '') test = v => v === null || v === undefined || v === '';
      else if (n !== null) test = v => (typeof v === 'number' && fix15(v) === n) || (typeof v === 'string' && v.trim() !== '' && Number(v) === n);
      else if (b !== null) test = v => v === b;
      else { const re = wildRe(s); test = v => typeof v === 'string' && re.test(v); }
      return op === '=' ? test : v => !test(v);
    }
    return v => {
      if (v === null || v === undefined) return false;
      if (n !== null) { if (typeof v !== 'number') return false; const r = cmp(v, n); return op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0; }
      if (typeof v !== 'string') return false; const r = cmp(v, s); return op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0;
    };
  }

  /* ---------- helpers for functions ---------- */
  const asArr = v => v instanceof Ref ? v.toArr() : v instanceof Arr ? v : new Arr([[v]]);
  const flat = v => { const a = asArr(v); if (a._flat) return a._flat; const out = []; for (const row of a.rows) for (const x of row) out.push(x); a._flat = out; return out; };
  const exactIndex = new WeakMap(); // list → Map(key → first index), for repeated exact MATCH / VLOOKUP
  const lookKey = v => (typeof v === 'string' ? 's' + v.toLowerCase() : typeof v === 'number' ? 'n' + fix15(v) : typeof v === 'boolean' ? 'b' + v : null);
  // numbers in a range ignore text and booleans; typed arguments are coerced
  function numsOf(args, opts = {}) {
    const out = [];
    for (const a of args) {
      if (a === undefined) continue;
      if (a instanceof Ref || a instanceof Arr) { for (const x of flat(a)) { if (isErr(x)) return x; if (typeof x === 'number') out.push(x); else if (opts.countText && x !== null && x !== undefined) out.push(0); } }
      else { const n = toNum(a); if (isErr(n)) return n; out.push(n); }
    }
    return out;
  }
  const scalar = (v, ctx) => {
    if (v instanceof Ref) {
      if (v.h === 1 && v.w === 1) return v.value(0, 0);
      // implicit intersection with the formula cell
      if (ctx && !ctx.array) {
        if (v.w === 1 && ctx.r >= v.r1 && ctx.r <= v.r2 && v.sheet === ctx.sheet) return v.value(ctx.r - v.r1, 0);
        if (v.h === 1 && ctx.c >= v.c1 && ctx.c <= v.c2 && v.sheet === ctx.sheet) return v.value(0, ctx.c - v.c1);
        if (v.w === 1 && ctx.r >= v.r1 && ctx.r <= v.r2) return v.value(ctx.r - v.r1, 0);
        if (v.h === 1 && ctx.c >= v.c1 && ctx.c <= v.c2) return v.value(0, ctx.c - v.c1);
        return ERR['#VALUE!'];
      }
      return v.value(0, 0);
    }
    if (v instanceof Arr) return v.rows[0] ? v.rows[0][0] : null;
    return v;
  };
  // apply a scalar function element by element when an argument is an array (array formulas)
  function lift(fn, args, ctx, which) {
    const idx = which || args.map((_, i) => i);
    const arrs = idx.filter(i => args[i] instanceof Arr || (args[i] instanceof Ref && ctx.array && (args[i].h > 1 || args[i].w > 1)));
    if (!arrs.length) return fn(...args.map((a, i) => idx.includes(i) ? scalar(a, ctx) : a));
    const A = arrs.map(i => asArr(args[i]));
    const H = Math.max(...A.map(a => a.h)), W = Math.max(...A.map(a => a.w));
    const rows = [];
    for (let r = 0; r < H; r++) { const row = []; for (let c = 0; c < W; c++) {
      const call = args.map((a, i) => { if (!arrs.includes(i)) return idx.includes(i) ? scalar(a, ctx) : a; const m = asArr(a); if (m.h === 1 && m.w === 1) return m.rows[0][0]; const rr = m.h === 1 ? 0 : r, cc = m.w === 1 ? 0 : c; return rr < m.h && cc < m.w ? m.rows[rr][cc] : ERR['#N/A']; });
      row.push(fn(...call)); } rows.push(row); }
    return new Arr(rows);
  }
  const round15 = x => (typeof x === 'number' ? fix15(x) : x);
  function lookupIndex(val, list, type) {
    if (type === 0) {
      if (typeof val === 'string' && /[*?~]/.test(val)) { const re = wildRe(val); for (let i = 0; i < list.length; i++) if (typeof list[i] === 'string' && re.test(list[i])) return i; return -1; }
      let idx = exactIndex.get(list);
      if (!idx) { idx = new Map(); for (let i = 0; i < list.length; i++) { const k = lookKey(list[i]); if (k !== null && !idx.has(k)) idx.set(k, i); } exactIndex.set(list, idx); }
      const k = lookKey(val); return k !== null && idx.has(k) ? idx.get(k) : -1;
    }
    let best = -1;
    for (let i = 0; i < list.length; i++) {
      const x = list[i]; if (x === null || x === undefined || typeRank(x) !== typeRank(val)) continue;
      const r = cmp(x, val);
      if (type > 0) { if (r <= 0) best = i; else break; } else { if (r >= 0) best = i; else break; }
    }
    return best;
  }
  function ceilingTo(x, s) { if (s === 0) return 0; const q = fix15(x / s); const n = Math.abs(q - Math.round(q)) < 1e-9 ? Math.round(q) : Math.ceil(q); return fix15(n * s); }
  function floorTo(x, s) { if (s === 0) return 0; const q = fix15(x / s); const n = Math.abs(q - Math.round(q)) < 1e-9 ? Math.round(q) : Math.floor(q); return fix15(n * s); }

  /* ---------- functions ---------- */
  // each takes (args evaluated, ctx) unless listed in LAZY, where it receives AST nodes and an evaluator
  const N = v => toNum(v);
  const F = {};
  const num1 = f => (args, ctx) => lift(x => { const n = N(x); return isErr(n) ? n : chk(f(n)); }, args, ctx);
  const chk = n => (typeof n === 'number' && !Number.isFinite(n) ? ERR['#NUM!'] : n);
  F.ABS = num1(Math.abs); F.SQRT = num1(n => (n < 0 ? ERR['#NUM!'] : Math.sqrt(n))); F.SIN = num1(Math.sin); F.COS = num1(Math.cos); F.TAN = num1(Math.tan);
  F.ASIN = num1(Math.asin); F.ACOS = num1(Math.acos); F.ATAN = num1(Math.atan); F.EXP = num1(Math.exp); F.SINH = num1(Math.sinh); F.COSH = num1(Math.cosh); F.TANH = num1(Math.tanh);
  F.LN = num1(n => (n <= 0 ? ERR['#NUM!'] : Math.log(n))); F.LOG10 = num1(n => (n <= 0 ? ERR['#NUM!'] : Math.log10(n)));
  F.RADIANS = num1(n => n * Math.PI / 180); F.DEGREES = num1(n => n * 180 / Math.PI); F.INT = num1(Math.floor); F.SIGN = num1(Math.sign);
  F.EVEN = num1(n => { const c = Math.ceil(Math.abs(n) / 2) * 2; return n < 0 ? -c : c; }); F.ODD = num1(n => { let c = Math.ceil(Math.abs(n)); if (c % 2 === 0) c++; return n < 0 ? -c : c; });
  F.PI = () => Math.PI;
  const num2 = f => (args, ctx) => lift((a, b) => { const x = N(a), y = b === undefined ? undefined : N(b); if (isErr(x)) return x; if (isErr(y)) return y; return chk(f(x, y)); }, args, ctx);
  F.LOG = num2((x, b) => (x <= 0 ? ERR['#NUM!'] : Math.log(x) / Math.log(b === undefined ? 10 : b)));
  F.POWER = num2((x, y) => Math.pow(x, y));
  F.MOD = num2((a, b) => (b === 0 ? ERR['#DIV/0!'] : fix15(a - b * Math.floor(a / b))));
  F.ATAN2 = num2((x, y) => (x === 0 && y === 0 ? ERR['#DIV/0!'] : Math.atan2(y, x)));
  F.QUOTIENT = num2((a, b) => (b === 0 ? ERR['#DIV/0!'] : Math.trunc(a / b)));
  F.ROUND = num2((x, d) => roundHalf(x, Math.trunc(d || 0)));
  F.ROUNDUP = num2((x, d) => { const m = Math.pow(10, Math.trunc(d || 0)); return Math.sign(x) * Math.ceil(fix15(Math.abs(x) * m)) / m; });
  F.ROUNDDOWN = num2((x, d) => { const m = Math.pow(10, Math.trunc(d || 0)); return Math.sign(x) * Math.floor(fix15(Math.abs(x) * m)) / m; });
  F.TRUNC = F.ROUNDDOWN;
  F.CEILING = num2((x, s) => { if (s === undefined) s = 1; if (x > 0 && s < 0) return ERR['#NUM!']; if (x < 0 && s > 0) return -floorTo(-x, s); return ceilingTo(x, s); });
  F['CEILING.MATH'] = num2((x, s) => ceilingTo(x, Math.abs(s === undefined ? 1 : s)));
  F.FLOOR = num2((x, s) => { if (s === undefined) s = 1; if (x > 0 && s < 0) return ERR['#NUM!']; if (x < 0 && s > 0) return -ceilingTo(-x, s); return floorTo(x, s); });
  F['FLOOR.MATH'] = num2((x, s) => floorTo(x, Math.abs(s === undefined ? 1 : s)));
  F.MROUND = num2((x, m) => { if (m === 0) return 0; if (x * m < 0) return ERR['#NUM!']; const q = fix15(x / m); const n = Math.sign(q) * Math.floor(Math.abs(q) + 0.5 + 1e-12); return fix15(n * m); });
  F.SUM = args => { const n = numsOf(args); return isErr(n) ? n : fix15(n.reduce((a, b) => a + b, 0)); };
  F.PRODUCT = args => { const n = numsOf(args); return isErr(n) ? n : n.reduce((a, b) => a * b, 1); };
  F.MIN = args => { const n = numsOf(args); return isErr(n) ? n : n.length ? Math.min(...n) : 0; };
  F.MAX = args => { const n = numsOf(args); return isErr(n) ? n : n.length ? Math.max(...n) : 0; };
  F.AVERAGE = args => { const n = numsOf(args); return isErr(n) ? n : n.length ? n.reduce((a, b) => a + b, 0) / n.length : ERR['#DIV/0!']; };
  F.SUMSQ = args => { const n = numsOf(args); return isErr(n) ? n : n.reduce((a, b) => a + b * b, 0); };
  F.COUNT = args => { let k = 0; for (const a of args) { if (a instanceof Ref || a instanceof Arr) { for (const x of flat(a)) if (typeof x === 'number') k++; } else if (!isErr(toNum(a)) && a !== null && a !== undefined) k++; } return k; };
  F.COUNTA = args => { let k = 0; for (const a of args) { if (a instanceof Ref || a instanceof Arr) { for (const x of flat(a)) if (x !== null && x !== undefined) k++; } else if (a !== undefined) k++; } return k; };
  F.COUNTBLANK = args => flat(args[0]).filter(x => x === null || x === undefined || x === '').length;
  F.SUMPRODUCT = args => {
    const A = args.map(asArr); if (!A.length) return 0; const h = A[0].h, w = A[0].w;
    if (A.some(a => a.h !== h || a.w !== w)) return ERR['#VALUE!'];
    let s = 0; for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) { let p = 1; for (const a of A) { const x = a.rows[r][c]; if (isErr(x)) return x; p *= typeof x === 'number' ? x : 0; } s += p; }
    return fix15(s);
  };
  const ifsPairs = (args, from) => { const pairs = []; for (let i = from; i + 1 < args.length; i += 2) pairs.push([flat(args[i]), criteria(scalar(args[i + 1]))]); return pairs; };
  const matchAll = (pairs, i) => pairs.every(([vals, t]) => t(vals[i]));
  F.COUNTIF = (args, ctx) => lift((rng, c) => { const t = criteria(c); return flat(args[0]).filter(v => t(v)).length; }, [args[0], args[1]], ctx, [1]);
  F.COUNTIFS = args => { const pairs = ifsPairs(args, 0); const n = pairs.length ? pairs[0][0].length : 0; let k = 0; for (let i = 0; i < n; i++) if (matchAll(pairs, i)) k++; return k; };
  F.SUMIF = args => { const vals = flat(args[0]), t = criteria(scalar(args[1])), sums = args[2] !== undefined ? flat(args[2]) : vals; let s = 0; vals.forEach((v, i) => { if (t(v) && typeof sums[i] === 'number') s += sums[i]; }); return fix15(s); };
  F.SUMIFS = args => { const sums = flat(args[0]), pairs = ifsPairs(args, 1); let s = 0; for (let i = 0; i < sums.length; i++) if (matchAll(pairs, i) && typeof sums[i] === 'number') s += sums[i]; return fix15(s); };
  F.AVERAGEIF = args => { const vals = flat(args[0]), t = criteria(scalar(args[1])), sums = args[2] !== undefined ? flat(args[2]) : vals; let s = 0, k = 0; vals.forEach((v, i) => { if (t(v) && typeof sums[i] === 'number') { s += sums[i]; k++; } }); return k ? s / k : ERR['#DIV/0!']; };
  F.AVERAGEIFS = args => { const sums = flat(args[0]), pairs = ifsPairs(args, 1); let s = 0, k = 0; for (let i = 0; i < sums.length; i++) if (matchAll(pairs, i) && typeof sums[i] === 'number') { s += sums[i]; k++; } return k ? s / k : ERR['#DIV/0!']; };
  F.MAXIFS = args => { const vals = flat(args[0]), pairs = ifsPairs(args, 1); const n = vals.filter((v, i) => matchAll(pairs, i) && typeof v === 'number'); return n.length ? Math.max(...n) : 0; };
  F.MINIFS = args => { const vals = flat(args[0]), pairs = ifsPairs(args, 1); const n = vals.filter((v, i) => matchAll(pairs, i) && typeof v === 'number'); return n.length ? Math.min(...n) : 0; };
  F.AND = args => { let any = false; for (const a of args) { for (const x of (a instanceof Ref || a instanceof Arr) ? flat(a) : [a]) { if (x === null || x === undefined || (typeof x === 'string' && (a instanceof Ref || a instanceof Arr))) continue; const b = toBool(x); if (isErr(b)) return b; any = true; if (!b) return false; } } return any ? true : ERR['#VALUE!']; };
  F.OR = args => { let any = false; for (const a of args) { for (const x of (a instanceof Ref || a instanceof Arr) ? flat(a) : [a]) { if (x === null || x === undefined || (typeof x === 'string' && (a instanceof Ref || a instanceof Arr))) continue; const b = toBool(x); if (isErr(b)) return b; any = true; if (b) return true; } } return any ? false : ERR['#VALUE!']; };
  F.XOR = args => { let k = 0; for (const a of args) for (const x of flat(a)) { const b = toBool(x); if (isErr(b)) return b; if (b) k++; } return k % 2 === 1; };
  F.NOT = (args, ctx) => lift(x => { const b = toBool(x); return isErr(b) ? b : !b; }, args, ctx);
  F.TRUE = () => true; F.FALSE = () => false;
  F.ISNUMBER = (args, ctx) => lift(x => typeof x === 'number', args, ctx);
  F.ISTEXT = (args, ctx) => lift(x => typeof x === 'string', args, ctx);
  F.ISNONTEXT = (args, ctx) => lift(x => typeof x !== 'string', args, ctx);
  F.ISBLANK = (args, ctx) => lift(x => x === null || x === undefined, args, ctx);
  F.ISERROR = (args, ctx) => lift(x => isErr(x), args, ctx);
  F.ISERR = (args, ctx) => lift(x => isErr(x) && x.e !== '#N/A', args, ctx);
  F.ISNA = (args, ctx) => lift(x => isErr(x) && x.e === '#N/A', args, ctx);
  F.ISLOGICAL = (args, ctx) => lift(x => typeof x === 'boolean', args, ctx);
  F.ISEVEN = (args, ctx) => lift(x => Math.trunc(N(x)) % 2 === 0, args, ctx);
  F.ISODD = (args, ctx) => lift(x => Math.abs(Math.trunc(N(x)) % 2) === 1, args, ctx);
  F.ISREF = (args) => args[0] instanceof Ref;
  const first = (a, ctx) => (a instanceof Ref && !ctx.array ? a.value(0, 0) : a);
  F.N = (args, ctx) => lift(x => (typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : isErr(x) ? x : 0), [first(args[0], ctx)], ctx);
  F.T = (args, ctx) => lift(x => (typeof x === 'string' ? x : isErr(x) ? x : ''), [first(args[0], ctx)], ctx);
  F.NA = () => ERR['#N/A'];
  const str1 = f => (args, ctx) => lift((...a) => { for (const x of a) if (isErr(x)) return x; return f(...a); }, args, ctx);
  F.LEN = str1(x => toStr(x).length);
  F.LEFT = str1((x, n) => toStr(x).slice(0, n === undefined ? 1 : Math.max(0, Math.trunc(N(n)))));
  F.RIGHT = str1((x, n) => { const s = toStr(x); const k = n === undefined ? 1 : Math.max(0, Math.trunc(N(n))); return k ? s.slice(-k) : ''; });
  F.MID = str1((x, a, n) => toStr(x).substr(Math.max(0, Math.trunc(N(a)) - 1), Math.max(0, Math.trunc(N(n)))));
  F.UPPER = str1(x => toStr(x).toUpperCase()); F.LOWER = str1(x => toStr(x).toLowerCase());
  F.PROPER = str1(x => toStr(x).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase()));
  F.TRIM = str1(x => toStr(x).replace(/ +/g, ' ').trim());
  F.CLEAN = str1(x => toStr(x).replace(/[\x00-\x1f]/g, ''));
  F.REPT = str1((x, n) => toStr(x).repeat(Math.max(0, Math.trunc(N(n)))));
  F.CONCATENATE = args => { let s = ''; for (const a of args) { const v = scalar(a); if (isErr(v)) return v; s += toStr(v); } return s; };
  F.CONCAT = args => { let s = ''; for (const a of args) for (const v of flat(a)) { if (isErr(v)) return v; s += toStr(v); } return s; };
  F.TEXTJOIN = args => { const d = toStr(scalar(args[0])), skip = toBool(scalar(args[1])); const parts = []; for (const a of args.slice(2)) for (const v of flat(a)) { if (isErr(v)) return v; const s = toStr(v); if (skip && s === '') continue; parts.push(s); } return parts.join(d); };
  F.SUBSTITUTE = str1((x, a, b, n) => { const s = toStr(x), f = toStr(a), t = toStr(b); if (!f) return s; if (n === undefined) return s.split(f).join(t); let k = 0, i = -1; const want = Math.trunc(N(n)); while ((i = s.indexOf(f, i + 1)) >= 0) { if (++k === want) return s.slice(0, i) + t + s.slice(i + f.length); } return s; });
  F.REPLACE = str1((x, a, n, t) => { const s = toStr(x), i = Math.trunc(N(a)) - 1; return s.slice(0, i) + toStr(t) + s.slice(i + Math.trunc(N(n))); });
  F.FIND = str1((a, b, st) => { const i = toStr(b).indexOf(toStr(a), st === undefined ? 0 : Math.trunc(N(st)) - 1); return i < 0 ? ERR['#VALUE!'] : i + 1; });
  F.SEARCH = str1((a, b, st) => { const s = toStr(b), start = st === undefined ? 0 : Math.trunc(N(st)) - 1; const re = new RegExp(wildRe(toStr(a)).source.slice(1, -1), 'i'); const m = re.exec(s.slice(start)); return m ? start + m.index + 1 : ERR['#VALUE!']; });
  F.EXACT = str1((a, b) => toStr(a) === toStr(b));
  F.CHAR = str1(n => String.fromCharCode(Math.trunc(N(n)))); F.UNICHAR = F.CHAR;
  F.CODE = str1(x => toStr(x).charCodeAt(0) || ERR['#VALUE!']); F.UNICODE = F.CODE;
  F.VALUE = str1(x => { if (typeof x === 'number') return x; const n = toNum(toStr(x)); return n; });
  F.TEXT = str1((x, f) => { if (typeof x === 'string') { const n = x.trim() === '' ? ERR['#VALUE!'] : toNum(x); if (!isErr(n)) x = n; else return formatNumber(x, toStr(f)); } if (x === null || x === undefined) x = 0; if (typeof x === 'boolean') return toStr(x); return formatNumber(x, toStr(f)); });
  F.FIXED = str1((x, d, nc) => formatNumber(N(x), (toBool(nc) === true ? '0' : '#,##0') + (Math.trunc(N(d === undefined ? 2 : d)) > 0 ? '.' + '0'.repeat(Math.trunc(N(d === undefined ? 2 : d))) : '')));
  F.DOLLAR = str1((x, d) => formatNumber(N(x), '#,##0.' + '0'.repeat(Math.trunc(N(d === undefined ? 2 : d)))));
  F.HYPERLINK = (args, ctx) => { const link = toStr(scalar(args[0], ctx)), name = args[1] !== undefined ? scalar(args[1], ctx) : link; if (ctx && ctx.book) ctx.book.links.set(ctx.sheet + '!' + ctx.r + ',' + ctx.c, link); return name; };
  F.TODAY = (_, ctx) => Math.floor(dateToSerial(ctx && ctx.book && ctx.book.now ? ctx.book.now() : new Date()) - new Date().getTimezoneOffset() / 1440);
  F.NOW = (_, ctx) => dateToSerial(ctx && ctx.book && ctx.book.now ? ctx.book.now() : new Date()) - new Date().getTimezoneOffset() / 1440;
  F.DATE = (args) => { const y = N(scalar(args[0])), m = N(scalar(args[1])), d = N(scalar(args[2])); return Math.round(dateToSerial(new Date(Date.UTC(y < 1900 ? y + 1900 : y, m - 1, d)))); };
  F.YEAR = num1(n => serialToDate(n).getUTCFullYear()); F.MONTH = num1(n => serialToDate(n).getUTCMonth() + 1); F.DAY = num1(n => serialToDate(n).getUTCDate());
  F.WEEKDAY = num2((n, t) => { const d = serialToDate(n).getUTCDay(); if (!t || t === 1) return d + 1; if (t === 2) return d === 0 ? 7 : d; return d === 0 ? 6 : d - 1; });
  F.CHOOSE = (args, ctx) => { const i = Math.trunc(N(scalar(args[0], ctx))); return i >= 1 && i < args.length ? args[i] : ERR['#VALUE!']; };
  F.ROW = (args, ctx) => { const a = args[0]; if (a === undefined) return ctx.r; if (!(a instanceof Ref)) return ERR['#VALUE!']; if (a.h === 1) return a.r1; return new Arr(Array.from({ length: a.h }, (_, i) => [a.r1 + i])); };
  F.COLUMN = (args, ctx) => { const a = args[0]; if (a === undefined) return ctx.c; if (!(a instanceof Ref)) return ERR['#VALUE!']; if (a.w === 1) return a.c1; return new Arr([Array.from({ length: a.w }, (_, i) => a.c1 + i)]); };
  F.ROWS = args => (args[0] instanceof Ref || args[0] instanceof Arr ? args[0].h : 1);
  F.COLUMNS = args => (args[0] instanceof Ref || args[0] instanceof Arr ? args[0].w : 1);
  F.TRANSPOSE = args => { const a = asArr(args[0]); return new Arr(Array.from({ length: a.w }, (_, c) => Array.from({ length: a.h }, (_, r) => a.rows[r][c]))); };
  F.MATCH = (args, ctx) => lift((val) => {
    if (isErr(val)) return val;
    const list = flat(args[1]); const type = args[2] === undefined ? 1 : Math.sign(N(scalar(args[2], ctx)));
    if (val === null || val === undefined) val = type === 0 ? '' : 0;
    const i = lookupIndex(val, list, type); return i < 0 ? ERR['#N/A'] : i + 1;
  }, [args[0]], ctx);
  F.INDEX = (args, ctx) => {
    const a = args[0]; if (isErr(a)) return a;
    let r = args[1] === undefined ? 0 : N(scalar(args[1], ctx)), c = args[2] === undefined ? 0 : N(scalar(args[2], ctx));
    if (isErr(r)) return r; if (isErr(c)) return c; r = Math.trunc(r); c = Math.trunc(c);
    const h = a instanceof Ref || a instanceof Arr ? a.h : 1, w = a instanceof Ref || a instanceof Arr ? a.w : 1;
    if (args[2] === undefined && h === 1 && w > 1) { c = r; r = 1; }
    if (args[2] === undefined && w === 1) c = 1;
    if (r < 0 || c < 0 || r > h || c > w) return ERR['#REF!'];
    if (a instanceof Ref) {
      if (r === 0 && c === 0) return a;
      if (r === 0) return new Ref(a.book, a.sheet, a.r1, a.c1 + c - 1, a.r2, a.c1 + c - 1);
      if (c === 0) return new Ref(a.book, a.sheet, a.r1 + r - 1, a.c1, a.r1 + r - 1, a.c2);
      return new Ref(a.book, a.sheet, a.r1 + r - 1, a.c1 + c - 1, a.r1 + r - 1, a.c1 + c - 1);
    }
    const A = asArr(a);
    if (r === 0) return new Arr(A.rows.map(row => [row[(c || 1) - 1]]));
    if (c === 0) return new Arr([A.rows[r - 1]]);
    return A.rows[r - 1][c - 1];
  };
  function vhlookup(args, ctx, horiz) {
    return lift((val) => {
      if (isErr(val)) return val;
      const tbl = args[1] instanceof Ref || args[1] instanceof Arr ? args[1] : null; if (!tbl) return ERR['#N/A'];
      const k = Math.trunc(N(scalar(args[2], ctx))); const approx = args[3] === undefined || args[3] === null ? true : toBool(scalar(args[3], ctx));
      const A = asArr(tbl); if (k < 1 || k > (horiz ? A.h : A.w)) return ERR['#REF!'];
      const keys = horiz ? A.rows[0] : A.rows.map(r => r[0]);
      const i = lookupIndex(val === null || val === undefined ? 0 : val, keys, approx === true ? 1 : 0);
      if (i < 0) return ERR['#N/A'];
      return horiz ? A.rows[k - 1][i] : A.rows[i][k - 1];
    }, [args[0]], ctx);
  }
  F.VLOOKUP = (args, ctx) => vhlookup(args, ctx, false);
  F.HLOOKUP = (args, ctx) => vhlookup(args, ctx, true);
  F.LOOKUP = (args, ctx) => { const val = scalar(args[0], ctx); const look = flat(args[1]); const res = args[2] !== undefined ? flat(args[2]) : look; const i = lookupIndex(val, look, 1); return i < 0 ? ERR['#N/A'] : res[i]; };
  F.XLOOKUP = (args, ctx) => { const val = scalar(args[0], ctx); const look = flat(args[1]); const res = asArr(args[2]); const i = lookupIndex(val, look, 0); if (i < 0) return args[3] !== undefined ? scalar(args[3], ctx) : ERR['#N/A']; return res.w === 1 ? res.rows[i][0] : res.h === 1 ? res.rows[0][i] : new Arr([res.rows[i]]); };
  F.OFFSET = (args, ctx) => {
    const a = args[0]; if (!(a instanceof Ref)) return ERR['#VALUE!'];
    const dr = Math.trunc(N(scalar(args[1], ctx))), dc = Math.trunc(N(scalar(args[2], ctx)));
    const h = args[3] !== undefined && args[3] !== null ? Math.trunc(N(scalar(args[3], ctx))) : a.h, w = args[4] !== undefined && args[4] !== null ? Math.trunc(N(scalar(args[4], ctx))) : a.w;
    const r1 = a.r1 + dr, c1 = a.c1 + dc; if (r1 < 1 || c1 < 1 || h < 1 || w < 1) return ERR['#REF!'];
    return new Ref(a.book, a.sheet, r1, c1, r1 + h - 1, c1 + w - 1);
  };
  F.INDIRECT = (args, ctx) => { const t = toStr(scalar(args[0], ctx)).trim(); if (!t) return ERR['#REF!']; return ctx.book.refFromText(t, ctx.sheet) || ERR['#REF!']; };
  F.SINGLE = (args, ctx) => scalar(args[0], ctx);
  F.ANCHORARRAY = (args) => args[0];
  F['ERROR.TYPE'] = (args, ctx) => { const v = scalar(args[0], ctx); const k = ['#NULL!', '#DIV/0!', '#VALUE!', '#REF!', '#NAME?', '#NUM!', '#N/A'].indexOf(isErr(v) ? v.e : ''); return k < 0 ? ERR['#N/A'] : k + 1; };
  F.TYPE = (args, ctx) => { const v = args[0] instanceof Arr ? args[0] : scalar(args[0], ctx); return v instanceof Arr ? 64 : typeof v === 'number' || v === null ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 4 : 16; };
  F.FACT = num1(n => { if (n < 0) return ERR['#NUM!']; let f = 1; for (let i = 2; i <= Math.trunc(n); i++) f *= i; return f; });
  F.GCD = args => { const n = numsOf(args); if (isErr(n)) return n; const g = (a, b) => (b ? g(b, a % b) : a); return n.map(Math.trunc).reduce((a, b) => g(a, b), 0); };
  F.MEDIAN = args => { const n = numsOf(args); if (isErr(n)) return n; if (!n.length) return ERR['#NUM!']; n.sort((a, b) => a - b); const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; };
  F.STDEV = args => { const n = numsOf(args); if (isErr(n)) return n; if (n.length < 2) return ERR['#DIV/0!']; const m = n.reduce((a, b) => a + b, 0) / n.length; return Math.sqrt(n.reduce((a, b) => a + (b - m) * (b - m), 0) / (n.length - 1)); };
  F['STDEV.S'] = F.STDEV;
  F.LARGE = args => { const n = numsOf([args[0]]); const k = Math.trunc(N(scalar(args[1]))); if (isErr(n)) return n; n.sort((a, b) => b - a); return k >= 1 && k <= n.length ? n[k - 1] : ERR['#NUM!']; };
  F.SMALL = args => { const n = numsOf([args[0]]); const k = Math.trunc(N(scalar(args[1]))); if (isErr(n)) return n; n.sort((a, b) => a - b); return k >= 1 && k <= n.length ? n[k - 1] : ERR['#NUM!']; };
  F.RANDBETWEEN = num2((a, b) => Math.floor(a + Math.random() * (b - a + 1))); F.RAND = () => Math.random();
  // IF / IFERROR / IFNA / IFS / SWITCH are evaluated lazily
  const LAZY = {
    IF(nodes, ev, ctx) {
      const c = ev(nodes[0]);
      if (c instanceof Arr || (c instanceof Ref && ctx.array && (c.h > 1 || c.w > 1))) {
        const A = asArr(c), t = nodes[1] ? ev(nodes[1]) : true, f = nodes[2] ? ev(nodes[2]) : false;
        return lift((cc, tt, ff) => { const b = toBool(cc); if (isErr(b)) return b; return b ? (nodes[1] && nodes[1].k === 'missing' ? 0 : tt) : (nodes.length < 3 ? false : nodes[2].k === 'missing' ? 0 : ff); }, [A, t, f], ctx);
      }
      const b = toBool(scalar(c, ctx)); if (isErr(b)) return b;
      if (b) return nodes.length < 2 || nodes[1].k === 'missing' ? 0 : ev(nodes[1]);
      return nodes.length < 3 ? false : nodes[2].k === 'missing' ? 0 : ev(nodes[2]);
    },
    IFERROR(nodes, ev, ctx) { const v = ev(nodes[0]); if (v instanceof Arr) { const alt = ev(nodes[1]); return lift((x, y) => (isErr(x) ? y : x), [v, alt], ctx); } const s = v instanceof Ref ? scalar(v, ctx) : v; return isErr(s) ? ev(nodes[1]) : v; },
    IFNA(nodes, ev, ctx) { const v = ev(nodes[0]); const s = v instanceof Ref ? scalar(v, ctx) : v; return isErr(s) && s.e === '#N/A' ? ev(nodes[1]) : v; },
    IFS(nodes, ev, ctx) { for (let i = 0; i + 1 < nodes.length; i += 2) { const b = toBool(scalar(ev(nodes[i]), ctx)); if (isErr(b)) return b; if (b) return ev(nodes[i + 1]); } return ERR['#N/A']; },
    SWITCH(nodes, ev, ctx) { const v = scalar(ev(nodes[0]), ctx); let i = 1; for (; i + 1 < nodes.length; i += 2) if (cmp(v, scalar(ev(nodes[i]), ctx)) === 0) return ev(nodes[i + 1]); return i < nodes.length ? ev(nodes[i]) : ERR['#N/A']; },
  };

  /* ---------- binary operators ---------- */
  function binop(op, a, b) {
    if (op === '&') { if (isErr(a)) return a; if (isErr(b)) return b; return toStr(a) + toStr(b); }
    if (['=', '<>', '<', '>', '<=', '>='].includes(op)) {
      if (isErr(a)) return a; if (isErr(b)) return b;
      const r = cmp(a, b);
      return op === '=' ? r === 0 : op === '<>' ? r !== 0 : op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0;
    }
    const x = toNum(a), y = toNum(b); if (isErr(x)) return x; if (isErr(y)) return y;
    switch (op) {
      case '+': return fix15(x + y);
      case '-': return fix15(x - y);
      case '*': return x * y;
      case '/': return y === 0 ? ERR['#DIV/0!'] : x / y;
      case '^': { if (x === 0 && y < 0) return ERR['#DIV/0!']; const r = Math.pow(x, y); return Number.isFinite(r) ? r : ERR['#NUM!']; }
    }
    return ERR['#VALUE!'];
  }

  /* ---------- the workbook runtime ---------- */
  class Book {
    constructor(model) {
      this.model = model;
      this.sheets = new Map(); // name(lower) → sheet
      this.order = [];
      model.sheets.forEach((s, idx) => { const sh = { name: s.name, idx, src: s, cells: new Map(), ast: new Map(), vcache: new Map() }; for (const [k, cell] of Object.entries(s.cells || {})) sh.cells.set(k, cell); this.sheets.set(s.name.toLowerCase(), sh); this.order.push(sh); });
      this.names = new Map(); for (const [n, d] of Object.entries(model.names || {})) this.names.set(n.toLowerCase(), { text: typeof d === 'string' ? d : d.f, sheet: d.sheet || null, ast: null });
      this.rcache = new Map(); this.stack = new Set(); this.links = new Map(); this.inputs = new Map(); this.now = null;
    }
    sheet(name) { return this.sheets.get(String(name).toLowerCase()); }
    key(r, c) { return r + ',' + c; }
    cell(sheet, r, c) { const sh = this.sheet(sheet); return sh ? sh.cells.get(r + ',' + c) : undefined; }
    // the stored input (constant) of a cell, or its computed value
    value(sheet, r, c) { const sh = typeof sheet === 'object' ? sheet : this.sheet(sheet); return sh ? this.valueSh(sh, r, c) : ERR['#REF!']; }
    valueSh(sh, r, c) {
      if (!sh) return ERR['#REF!'];
      const k = r * 16384 + c;
      const hit = sh.vcache.get(k); if (hit !== undefined) return hit;
      const cell = sh.cells.get(r + ',' + c);
      if (!cell) return null;
      if (!cell.f) { const v = cell.v === undefined ? null : cell.v; return v && typeof v === 'object' && v.e ? ERR[v.e] || new XErr(v.e) : v; }
      const sk = sh.idx * 1e11 + k;
      if (this.stack.has(sk)) return ERR['#CIRC!'];
      this.stack.add(sk);
      let v;
      try {
        let ast = sh.ast.get(r + ',' + c);
        if (!ast) { try { ast = parse(cell.f); } catch (e) { ast = { k: 'err', v: '#NAME?', why: e.message }; } sh.ast.set(r + ',' + c, ast); }
        const ctx = { book: this, sheet: sh.name, r, c, array: !!cell.a };
        v = this.evalNode(ast, ctx);
        if (v instanceof Ref) v = cell.a ? v.value(0, 0) : scalar(v, ctx);
        if (v instanceof Arr) {
          if (cell.a && cell.a !== true) { const [r1, c1] = cell.a; const rr = r - r1, cc = c - c1; v = rr < v.h && cc < v.w ? v.rows[rr][cc] : ERR['#N/A']; }
          else v = v.rows[0] ? v.rows[0][0] : null;
          if (v instanceof Ref) v = v.value(0, 0);
        }
        if (v === undefined) v = null;
        if (v === null) v = 0; // a formula that points at an empty cell shows 0
      } finally { this.stack.delete(sk); }
      sh.vcache.set(k, v);
      return v;
    }
    evalNode(n, ctx) {
      switch (n.k) {
        case 'num': return n.v; case 'str': return n.v; case 'bool': return n.v; case 'err': return ERR[n.v] || new XErr(n.v);
        case 'missing': return null;
        case 'arr': return new Arr(n.rows.map(r => r.slice()));
        case 'paren': return this.evalNode(n.a, ctx);
        case 'ref': {
          if (n.deleted) return ERR['#REF!'];
          const sheet = n.sheet || ctx.sheet; if (!this.sheet(sheet)) return ERR['#REF!'];
          const sh = this.sheet(sheet).name; let r2 = n.r2, c2 = n.c2;
          if (n.wholeCol) r2 = Math.max(1, this.sheet(sheet).src.maxR || 1);
          if (n.wholeRow) c2 = Math.max(1, this.sheet(sheet).src.maxC || 1);
          return new Ref(this, sh, n.r1, n.c1, r2, c2);
        }
        case 'range': {
          const a = this.evalNode(n.a, ctx), b = this.evalNode(n.b, ctx);
          if (!(a instanceof Ref) || !(b instanceof Ref)) return ERR['#REF!'];
          return new Ref(this, a.sheet, Math.min(a.r1, b.r1), Math.min(a.c1, b.c1), Math.max(a.r2, b.r2), Math.max(a.c2, b.c2));
        }
        case 'name': {
          const d = this.names.get((n.sheet ? n.sheet + '!' : '') + n.v.toLowerCase()) || this.names.get(n.v.toLowerCase());
          if (!d) return ERR['#NAME?'];
          if (!d.ast) { try { d.ast = parse(d.text.replace(/^=/, '')); } catch { d.ast = { k: 'err', v: '#REF!' }; } }
          return this.evalNode(d.ast, { ...ctx, sheet: d.sheet || ctx.sheet });
        }
        case 'neg': { const v = this.evalNode(n.a, ctx); return this.mapUnary(v, x => { const y = toNum(x); return isErr(y) ? y : -y; }, ctx); }
        case 'pct': { const v = this.evalNode(n.a, ctx); return this.mapUnary(v, x => { const y = toNum(x); return isErr(y) ? y : y / 100; }, ctx); }
        case 'bin': {
          const a = this.evalNode(n.a, ctx), b = this.evalNode(n.b, ctx);
          const arrA = a instanceof Arr || (a instanceof Ref && (a.h > 1 || a.w > 1));
          const arrB = b instanceof Arr || (b instanceof Ref && (b.h > 1 || b.w > 1));
          if ((arrA || arrB) && (ctx.array || ctx.inFn)) return lift((x, y) => binop(n.op, x, y), [a, b], { ...ctx, array: true });
          return binop(n.op, scalar(a, ctx), scalar(b, ctx));
        }
        case 'fn': {
          const name = n.name;
          const plain = ctx.inFn ? { ...ctx, inFn: false } : ctx;
          if (LAZY[name]) return LAZY[name](n.args, x => this.evalNode(x, plain), plain);
          const f = F[name]; if (!f) return ERR['#NAME?'];
          // inside these functions ranges act as arrays even in ordinary formulas
          const arrayArgs = ARRAY_FNS.has(name);
          const sub = arrayArgs ? { ...ctx, inFn: true } : plain;
          const args = n.args.map(a => (a.k === 'missing' ? undefined : this.evalNode(a, sub)));
          try { const v = f(args, ctx); return v === undefined ? null : v; } catch (e) { return ERR['#VALUE!']; }
        }
      }
      return ERR['#VALUE!'];
    }
    mapUnary(v, fn, ctx) { if (v instanceof Arr || (v instanceof Ref && (ctx.array || ctx.inFn) && (v.h > 1 || v.w > 1))) { const A = asArr(v); return new Arr(A.rows.map(r => r.map(fn))); } return fn(scalar(v, ctx)); }
    // INDIRECT("Sheet!A1:B3") or INDIRECT("NAME")
    refFromText(t, sheet) {
      try {
        const ast = parse(t);
        const v = this.evalNode(ast, { book: this, sheet, r: 1, c: 1 });
        return v instanceof Ref ? v : null;
      } catch { return null; }
    }
    /* --- editing --- */
    setInput(sheet, r, c, v) {
      const sh = this.sheet(sheet); if (!sh) return;
      const k = r + ',' + c, cur = sh.cells.get(k) || {};
      if (cur.f) return; // formulas are not overwritten from the form
      sh.cells.set(k, { ...cur, v: v === '' ? null : v });
      this.recalc();
    }
    recalc() { for (const sh of this.order) sh.vcache.clear(); this.rcache.clear(); this.links.clear(); }
    // insert n rows before `at` in a sheet: cells move down and every reference in the workbook follows (like Excel)
    insertRows(sheet, at, n, expand) { this.shiftRows(sheet, at, n, expand); }
    deleteRows(sheet, at, n) { this.shiftRows(sheet, at, -n); }
    // expand: ranges that end on the row just above `at` grow too (adding a row at the end of a table)
    shiftRows(sheetName, at, n, expand) {
      const sh = this.sheet(sheetName); if (!sh) return; const target = sh.name.toLowerCase();
      const moved = new Map();
      for (const [k, cell] of sh.cells) { const [r, c] = k.split(',').map(Number);
        if (n < 0 && r >= at && r < at - n) continue;
        moved.set((r >= at ? r + n : r) + ',' + c, cell); }
      sh.cells = moved; sh.src.maxR = (sh.src.maxR || 0) + n;
      const fixRef = (node, homeSheet) => {
        if (node.k !== 'ref' || node.wholeRow) return;
        const s = (node.sheet || homeSheet).toLowerCase(); if (s !== target || node.wholeCol) return;
        if (n > 0) { if (node.r1 >= at) node.r1 += n; if (node.r2 >= at) node.r2 += n; else if (expand && node.r2 === at - 1 && node.r1 < node.r2) node.r2 += n; }
        else { const d = -n, end = at + d - 1;
          if (node.r1 >= at && node.r2 <= end) { node.deleted = true; return; }
          if (node.r1 > end) node.r1 -= d; else if (node.r1 >= at) node.r1 = at;
          if (node.r2 > end) node.r2 -= d; else if (node.r2 >= at) node.r2 = at - 1; }
      };
      // A1:B9 is parsed as two cell references joined by ':' — move it as one block
      const fixRange = (node, home) => {
        const a = node.a, b = node.b; const s1 = (a.sheet || home).toLowerCase(); if (s1 !== target || a.wholeRow || a.wholeCol) return false;
        let start = Math.min(a.r1, b.r1), end = Math.max(a.r2, b.r2);
        if (n > 0) { if (start >= at) start += n; if (end >= at) end += n; else if (expand && end === at - 1 && start < end) end += n; }
        else { const d = -n, last = at + d - 1; if (start >= at && end <= last) { a.deleted = true; return true; }
          const ns = start > last ? start - d : start >= at ? at : start; const ne = end > last ? end - d : end >= at ? at - 1 : end; start = ns; end = ne; }
        const top = a.r1 <= b.r1 ? a : b, bot = top === a ? b : a; top.r1 = top.r2 = start; bot.r1 = bot.r2 = end; return true;
      };
      const walk = (node, home) => {
        if (!node || typeof node !== 'object') return;
        if (node.k === 'range' && node.a && node.b && node.a.k === 'ref' && node.b.k === 'ref' && !node.b.sheet && fixRange(node, home)) { if (node.a.deleted) node.b.deleted = true; return; }
        if (node.k === 'ref') fixRef(node, home); for (const key of ['a', 'b']) if (node[key]) walk(node[key], home); if (node.args) node.args.forEach(x => walk(x, home)); };
      for (const s of this.order) {
        for (const [k, cell] of s.cells) {
          if (!cell.f) continue;
          let ast; try { ast = parse(cell.f); } catch { continue; }
          const before = unparse(ast); walk(ast, s.name); const after = unparse(ast);
          if (after !== before) s.cells.set(k, { ...cell, f: after });
          if (cell.a && Array.isArray(cell.a) && s.name.toLowerCase() === target && cell.a[0] >= at) s.cells.set(k, { ...s.cells.get(k), a: [cell.a[0] + n, cell.a[1], cell.a[2] + n, cell.a[3]] });
        }
        s.ast.clear();
      }
      for (const [, d] of this.names) { try { const ast = parse(d.text.replace(/^=/, '')); walk(ast, d.sheet || ''); d.text = unparse(ast); d.ast = null; } catch {} }
      // merges and validations on this sheet
      const src = sh.src;
      src.merges = (src.merges || []).map(m => { const [r1, c1, r2, c2] = m; if (r2 < at) return m; if (n < 0 && r1 >= at && r2 < at - n) return null; return [r1 >= at ? r1 + n : r1, c1, r2 + n, c2]; }).filter(Boolean);
      src.dv = (src.dv || []).map(d => ({ ...d, ranges: d.ranges.map(([r1, c1, r2, c2]) => [r1 >= at ? r1 + n : r1, c1, r2 >= at ? r2 + n : r2, c2]).filter(([r1, , r2]) => r2 >= r1) })).filter(d => d.ranges.length);
      if (src.rows) { const rows = {}; for (const [r, v] of Object.entries(src.rows)) { const rr = +r; if (n < 0 && rr >= at && rr < at - n) continue; rows[rr >= at ? rr + n : rr] = v; } src.rows = rows; }
      this.recalc();
    }
    // the list behind a drop-down cell
    validation(sheet, r, c) {
      const sh = this.sheet(sheet); if (!sh) return null;
      const dv = (sh.src.dv || []).find(d => d.ranges.some(([r1, c1, r2, c2]) => r >= r1 && r <= r2 && c >= c1 && c <= c2));
      if (!dv) return null;
      if (dv.type !== 'list') return { type: dv.type, op: dv.op, f1: dv.f1, f2: dv.f2 };
      const f = String(dv.f1 || '');
      if (/^".*"$/.test(f)) return { type: 'list', list: f.slice(1, -1).split(',').map(x => x.trim()) };
      let ast; try { ast = parse(f); } catch { return { type: 'list', list: f.split(',').map(x => x.trim()) }; }
      const v = this.evalNode(ast, { book: this, sheet: sh.name, r, c });
      const list = (v instanceof Ref || v instanceof Arr ? flat(v) : [v]).filter(x => x !== null && x !== undefined && x !== '' && !isErr(x));
      return { type: 'list', list };
    }
    // the text shown in a cell, using its number format
    display(sheet, r, c) {
      const v = this.value(sheet, r, c); const cell = this.cell(sheet, r, c);
      if (v === null || v === undefined) return '';
      if (isErr(v)) return v.e;
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      const st = cell && cell.s !== undefined && this.model.styles ? this.model.styles[cell.s] : null;
      if (typeof v === 'number') { try { const t = formatNumber(v, st && st.nf); return /\d\.$/.test(t) ? t.slice(0, -1) : t.replace(/(\d)\.(\s|%|$)/, '$1$2'); } catch { return numGeneral(v, 11); } }
      return String(v);
    }
    // write the edited cells back into the model (for saving and exporting)
    toModel() {
      const m = JSON.parse(JSON.stringify(this.model));
      m.sheets.forEach((s, i) => { s.cells = Object.fromEntries(this.order[i].cells); });
      m.names = Object.fromEntries([...this.names.entries()].map(([k, d]) => [this.model.names && Object.keys(this.model.names).find(x => x.toLowerCase() === k) || k, d.sheet ? { f: d.text, sheet: d.sheet } : d.text]));
      return m;
    }
  }
  const ARRAY_FNS = new Set(['SUMPRODUCT', 'SUM', 'MIN', 'MAX', 'AVERAGE', 'COUNT', 'COUNTA', 'MATCH', 'INDEX', 'VLOOKUP', 'HLOOKUP', 'LOOKUP', 'XLOOKUP', 'AND', 'OR', 'PRODUCT', 'LARGE', 'SMALL', 'MEDIAN', 'CONCAT', 'TEXTJOIN', 'SUMSQ', 'STDEV', 'TRANSPOSE', 'ROWS', 'COLUMNS', 'COUNTIF', 'COUNTIFS', 'SUMIF', 'SUMIFS', 'ROW', 'COLUMN', 'MAXIFS', 'MINIFS', 'AVERAGEIF', 'AVERAGEIFS', 'COUNTBLANK']);

  const api = { parse, unparse, tokenize, Book, formatNumber, numGeneral, colName, colNum, addr, parseAddr, ERR, XErr, isErr, toStr, toNum, serialToDate, dateToSerial };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.WBE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
