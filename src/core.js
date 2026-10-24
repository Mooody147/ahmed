/* ===================== Action Register — core engine =====================
   Pure logic: parsing, extraction, prompt building, evidence verification,
   dedupe. Runs in the browser; also loadable in Node for tests.            */

const ETM = (() => {
'use strict';

/* ---------- small utils ---------- */
const pad = n => String(n).padStart(2, '0');
const uid = (p = '') => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const todayISO = () => isoDate(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoDate(d); };
const dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
const validISO = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00'));
const extOf = name => { const m = /\.([a-z0-9]{1,6})$/i.exec(name || ''); return m ? m[1].toLowerCase() : ''; };
const clip = (s, n) => (s && s.length > n ? s.slice(0, n) : s || '');
const utf8len = s => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : Buffer.byteLength(s));

function bytesToBin(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return s;
}
function binToBytes(s) { const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255; return u; }

function decodeBytes(u8, charset) {
  let cs = (charset || 'utf-8').toLowerCase().replace(/^"|"$/g, '');
  if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
  if (cs === 'cp1252') cs = 'windows-1252';
  if (cs === 'ks_c_5601-1987') cs = 'euc-kr';
  try { return new TextDecoder(cs, { fatal: false }).decode(u8); }
  catch { try { return new TextDecoder('utf-8').decode(u8); } catch { return bytesToBin(u8); } }
}

/* ---------- RFC 2047 / 2231 ---------- */
function decodeMimeWords(str) {
  if (!str || str.indexOf('=?') < 0) return str || '';
  return str
    .replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?)/g, '$1')
    .replace(/=\?([^?*]+)(?:\*[^?]*)?\?([bBqQ])\?([^?]*)\?=/g, (m, cs, enc, txt) => {
      try {
        let bytes;
        if (enc.toUpperCase() === 'B') bytes = binToBytes(atobSafe(txt));
        else bytes = binToBytes(txt.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16))));
        return decodeBytes(bytes, cs);
      } catch { return m; }
    });
}
function atobSafe(b64) {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (typeof atob === 'function') { try { return atob(clean); } catch { return atob(clean.replace(/=+$/, '')); } }
  return Buffer.from(clean, 'base64').toString('latin1');
}

function parseHeaderBlock(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const list = []; let cur = null;
  for (const ln of lines) {
    if (/^[ \t]/.test(ln) && cur) { cur.v += ' ' + ln.trim(); continue; }
    const m = /^([!-9;-~]+):\s?(.*)$/.exec(ln);
    if (m) { cur = { k: m[1].toLowerCase(), v: m[2] }; list.push(cur); } else cur = null;
  }
  const map = {};
  for (const h of list) if (!(h.k in map)) map[h.k] = h.v;
  return { list, map };
}

function parseParams(value) {
  const out = { value: '', params: {} };
  if (!value) return out;
  const parts = []; let buf = '', q = false;
  for (const ch of value) {
    if (ch === '"') q = !q;
    if (ch === ';' && !q) { parts.push(buf); buf = ''; } else buf += ch;
  }
  parts.push(buf);
  out.value = parts.shift().trim().toLowerCase();
  const cont = {};
  for (const p of parts) {
    const i = p.indexOf('='); if (i < 0) continue;
    let k = p.slice(0, i).trim().toLowerCase(); let v = p.slice(i + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1');
    const m = /^([^*]+)\*(\d+)?(\*)?$/.exec(k);
    if (m) {
      const base = m[1], idx = m[2] ? +m[2] : 0, enc = !!m[3] || (!m[2] && k.endsWith('*'));
      (cont[base] = cont[base] || []).push({ idx, v, enc });
    } else out.params[k] = decodeMimeWords(v);
  }
  for (const base in cont) {
    const segs = cont[base].sort((a, b) => a.idx - b.idx);
    let charset = 'utf-8', s = '';
    segs.forEach((sg, n) => {
      let v = sg.v;
      if (sg.enc) {
        if (n === 0) { const mm = /^([^']*)'[^']*'(.*)$/.exec(v); if (mm) { charset = mm[1] || 'utf-8'; v = mm[2]; } }
        try { v = decodeBytes(binToBytes(v.replace(/%([0-9A-Fa-f]{2})/g, (x, h) => String.fromCharCode(parseInt(h, 16)))), charset); } catch {}
      }
      s += v;
    });
    out.params[base] = s;
  }
  return out;
}

function decodeTransfer(bin, enc) {
  enc = (enc || '').toLowerCase().trim();
  if (enc === 'base64') return binToBytes(atobSafe(bin));
  if (enc === 'quoted-printable') {
    return binToBytes(bin.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))));
  }
  return binToBytes(bin);
}

/* ---------- MIME tree ---------- */
function parseEntity(bin, depth = 0) {
  const m = /\r?\n\r?\n/.exec(bin);
  const head = m ? bin.slice(0, m.index) : bin;
  const body = m ? bin.slice(m.index + m[0].length) : '';
  const h = parseHeaderBlock(head);
  const ct = parseParams(h.map['content-type'] || 'text/plain; charset=us-ascii');
  const cd = parseParams(h.map['content-disposition'] || '');
  const node = { headers: h, type: ct.value || 'text/plain', params: ct.params, disposition: cd.value, dparams: cd.params, enc: h.map['content-transfer-encoding'] || '', parts: [], raw: body };
  if (node.type.startsWith('multipart/') && ct.params.boundary && depth < 20) {
    const marker = '--' + ct.params.boundary;
    let i = body.startsWith(marker) ? 0 : body.indexOf('\n' + marker);
    if (i > 0) i += 1;
    while (i >= 0) {
      if (body.substr(i + marker.length, 2) === '--') break;
      let le = body.indexOf('\n', i); if (le < 0) break;
      const start = le + 1;
      let nx = body.indexOf('\n' + marker, start);
      let end = nx < 0 ? body.length : nx;
      if (nx >= 0 && body[end - 1] === '\r') end -= 1;
      node.parts.push(parseEntity(body.slice(start, end), depth + 1));
      i = nx < 0 ? -1 : nx + 1;
    }
  }
  return node;
}

function htmlToText(html) {
  if (!html) return '';
  let s = html;
  if (typeof DOMParser !== 'undefined') {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('style,script,head,title').forEach(e => e.remove());
      doc.querySelectorAll('br').forEach(e => e.replaceWith('\n'));
      doc.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(e => { e.prepend('\n## '); e.append('\n'); });
      doc.querySelectorAll('p,div,tr,li,blockquote,table,hr').forEach(e => { e.append('\n'); });
      doc.querySelectorAll('li').forEach(e => e.prepend('• '));
      doc.querySelectorAll('td,th').forEach(e => e.append(' | '));
      s = doc.body ? doc.body.textContent : doc.textContent;
      return tidyText(s);
    } catch {}
  }
  s = s.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<h[1-6][^>]*>/gi, '\n## ')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/t[dh]>/gi, ' | ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d));
  return tidyText(s);
}
function tidyText(s) {
  return String(s || '').replace(/\r\n?/g, '\n').replace(/ /g, ' ').replace(/[ \t]+\n/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function addrList(v) { return decodeMimeWords(v || '').replace(/\s+/g, ' ').trim(); }
function firstEmail(v) { const m = /[\w.+'-]+@[\w-]+(\.[\w-]+)+/.exec(v || ''); return m ? m[0].toLowerCase() : ''; }
function parseDateLoose(v) { if (!v) return ''; const c = v.replace(/\(.*?\)/g, '').replace(/\s+at\s+/i, ' ').replace(/\u202f/g, ' ').trim(); const d = new Date(c); return isNaN(d) ? '' : d.toISOString(); }

function parseEml(u8) {
  const bin = bytesToBin(u8);
  const root = parseEntity(bin);
  const H = root.headers.map;
  const email = {
    subject: decodeMimeWords(H.subject || '').trim(),
    from: addrList(H.from), fromEmail: firstEmail(decodeMimeWords(H.from)),
    to: addrList(H.to), cc: addrList(H.cc),
    date: parseDateLoose(H.date),
    messageId: (H['message-id'] || '').trim(), inReplyTo: (H['in-reply-to'] || '').trim(), references: (H.references || '').trim(),
    convIndex: (H['thread-index'] || '').trim(),
    body: '', attachments: [], warnings: [],
  };
  let plain = null, html = null;
  const walk = (n, inAlt) => {
    const isAtt = n.disposition === 'attachment' || (!!(n.dparams.filename || n.params.name) && !n.type.startsWith('multipart/'));
    if (n.type.startsWith('multipart/')) { n.parts.forEach(p => walk(p, n.type === 'multipart/alternative' || inAlt)); return; }
    if (n.type === 'message/rfc822' && n.disposition !== 'inline-text') {
      const inner = parseEml(decodeTransfer(n.raw, n.enc));
      const name = n.dparams.filename || n.params.name || ((inner.subject || 'Forwarded message') + '.eml');
      email.attachments.push({ name, mime: 'message/rfc822', size: n.raw.length, bytes: null, email: inner, inline: false });
      return;
    }
    if (!isAtt && n.type === 'text/plain' && plain === null) { plain = decodeBytes(decodeTransfer(n.raw, n.enc), n.params.charset); return; }
    if (!isAtt && n.type === 'text/html' && html === null) { html = decodeBytes(decodeTransfer(n.raw, n.enc), n.params.charset); return; }
    if (!isAtt && (n.type === 'text/calendar')) { /* meeting body */ }
    const bytes = decodeTransfer(n.raw, n.enc);
    const cid = (n.headers.map['content-id'] || '').replace(/[<>]/g, '');
    let name = n.dparams.filename || n.params.name || (cid ? 'inline-' + cid.split('@')[0] : 'attachment') ;
    if (!extOf(name)) { const e = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'application/pdf': 'pdf', 'text/calendar': 'ics', 'text/plain': 'txt', 'text/html': 'html' }[n.type]; if (e) name += '.' + e; }
    email.attachments.push({ name: decodeMimeWords(name), mime: n.type, size: bytes.length, bytes, cid, inline: n.disposition === 'inline' || (!!cid && n.type.startsWith('image/') && n.disposition !== 'attachment') });
  };
  walk(root, false);
  email.body = plain && plain.trim() ? tidyText(plain) : htmlToText(html || '');
  if (!email.body && root.type.startsWith('text/')) email.body = tidyText(decodeBytes(decodeTransfer(root.raw, root.enc), root.params.charset));
  email.htmlRefs = html ? (html.match(/cid:([^"'\s>)]+)/gi) || []).map(s => s.slice(4)) : [];
  return email;
}

/* ---------- Outlook .msg (CFB) ---------- */
function utf16(u8) { return new TextDecoder('utf-16le').decode(u8).replace(/\u0000+$/, ''); }
const FILETIME_EPOCH = 11644473600000;
function readMsgFromCfb(cfb) {
  const entries = new Map();
  cfb.FullPaths.forEach((p, i) => entries.set(p, cfb.FileIndex[i]));
  return readMsgStorage(entries, cfb.FullPaths[0], 32, 0);
}
function toU8(c) { if (!c) return null; return c instanceof Uint8Array ? c : new Uint8Array(c); }
function childStorages(entries, prefix, startsWith) {
  const out = [];
  for (const p of entries.keys()) {
    if (p.startsWith(prefix) && p !== prefix) {
      const rest = p.slice(prefix.length);
      if (rest.endsWith('/') && rest.indexOf('/') === rest.length - 1 && rest.startsWith(startsWith)) out.push(p);
    }
  }
  return out.sort();
}
function readProps(u8, headerLen) {
  const props = {};
  if (!u8) return props;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  for (let o = headerLen; o + 16 <= u8.length; o += 16) {
    const type = dv.getUint16(o, true), id = dv.getUint16(o + 2, true);
    const lo = dv.getUint32(o + 8, true), hi = dv.getUint32(o + 12, true);
    if (type === 0x0003) props[id] = dv.getInt32(o + 8, true);
    else if (type === 0x000B) props[id] = (lo & 1) === 1;
    else if (type === 0x0040) { const ms = (hi * 4294967296 + lo) / 10000 - FILETIME_EPOCH; if (ms > 0) props[id] = new Date(ms).toISOString(); }
  }
  return props;
}
function readMsgStorage(entries, prefix, headerLen, depth) {
  const stream = name => toU8(entries.get(prefix + name)?.content);
  const propRaw = stream('__properties_version1.0');
  const props = readProps(propRaw, headerLen);
  const cp = props[0x3FFD] || props[0x3FDE] || 1252;
  const ansi = u8 => { try { return new TextDecoder(cp === 65001 ? 'utf-8' : 'windows-' + cp).decode(u8); } catch { return decodeBytes(u8, 'windows-1252'); } };
  const str = id => {
    const h = id.toString(16).toUpperCase().padStart(4, '0');
    const u = stream(`__substg1.0_${h}001F`); if (u) return utf16(u);
    const a = stream(`__substg1.0_${h}001E`); if (a) return ansi(a).replace(/\u0000+$/, '');
    return '';
  };
  const bin = id => stream(`__substg1.0_${id.toString(16).toUpperCase().padStart(4, '0')}0102`);
  const headers = parseHeaderBlock(str(0x007D) || '').map;
  const email = {
    subject: str(0x0037) || decodeMimeWords(headers.subject || ''),
    from: '', fromEmail: '', to: str(0x0E04), cc: str(0x0E03),
    date: props[0x0039] || props[0x0E06] || parseDateLoose(headers.date) || props[0x3007] || '',
    messageId: str(0x1035) || headers['message-id'] || '', inReplyTo: str(0x1042) || headers['in-reply-to'] || '', references: str(0x1039) || headers.references || '',
    convIndex: '', body: '', attachments: [], warnings: [],
  };
  const ci = bin(0x0071); if (ci && ci.length >= 22) email.convIndex = Array.from(ci.slice(0, 22), b => b.toString(16).padStart(2, '0')).join('');
  const senderName = str(0x0C1A) || str(0x0042);
  const smtp = [str(0x5D01), str(0x0C1F), str(0x5D02), str(0x0065), firstEmail(headers.from)].find(v => /@/.test(v) && !/^\/o=/i.test(v)) || '';
  email.fromEmail = smtp.toLowerCase();
  email.from = senderName ? (smtp && senderName.toLowerCase() !== smtp.toLowerCase() ? `${senderName} <${smtp}>` : senderName) : smtp;
  // recipients with addresses
  const to = [], cc = [];
  for (const rp of childStorages(entries, prefix, '__recip_version1.0_')) {
    const rs = n => toU8(entries.get(rp + n)?.content);
    const rprops = readProps(rs('__properties_version1.0'), 8);
    const rstr = h => { const u = rs(`__substg1.0_${h}001F`); if (u) return utf16(u); const a = rs(`__substg1.0_${h}001E`); return a ? ansi(a).replace(/\u0000+$/, '') : ''; };
    const name = rstr('3001'); const addr = [rstr('39FE'), rstr('3003')].find(v => /@/.test(v) && !/^\/o=/i.test(v)) || '';
    const label = name && addr && name.toLowerCase() !== addr.toLowerCase() ? `${name} <${addr}>` : (name || addr);
    if (!label) continue;
    (rprops[0x0C15] === 2 ? cc : rprops[0x0C15] === 3 ? null : to)?.push(label);
  }
  if (to.length) email.to = to.join('; ');
  if (cc.length) email.cc = cc.join('; ');
  // body
  let body = str(0x1000);
  if (!body || body.trim().length < 3) {
    const htmlB = bin(0x1013); const htmlS = str(0x1013);
    if (htmlB || htmlS) body = htmlToText(htmlS || decodeBytes(htmlB, props[0x3FDE] === 65001 || !props[0x3FDE] ? 'utf-8' : 'windows-' + props[0x3FDE]));
  }
  if (!body || body.trim().length < 3) {
    const rtfc = bin(0x1009);
    if (rtfc) { try { body = rtfToText(bytesToBin(decompressRTF(rtfc))); } catch (e) { email.warnings.push('Message body is in compressed RTF and could not be decoded.'); } }
  }
  email.body = tidyText(body || '');
  // attachments
  for (const ap of childStorages(entries, prefix, '__attach_version1.0_')) {
    const as = n => toU8(entries.get(ap + n)?.content);
    const aprops = readProps(as('__properties_version1.0'), 8);
    const astr = h => { const u = as(`__substg1.0_${h}001F`); if (u) return utf16(u); const a = as(`__substg1.0_${h}001E`); return a ? ansi(a).replace(/\u0000+$/, '') : ''; };
    const method = aprops[0x3705];
    let name = astr('3707') || astr('3704') || astr('3001') || 'attachment';
    const mime = (astr('370E') || '').toLowerCase();
    const cid = astr('3712');
    const hidden = aprops[0x7FFE] === true;
    const embPrefix = ap + '__substg1.0_3701000D/';
    if (method === 5 || entries.has(embPrefix)) {
      if (depth < 4 && entries.has(embPrefix)) {
        const inner = readMsgStorage(entries, embPrefix, 24, depth + 1);
        email.attachments.push({ name: (astr('3001') || inner.subject || 'Attached message') + '.msg', mime: 'application/vnd.ms-outlook', size: 0, bytes: null, email: inner, inline: false });
      } else email.warnings.push(`Embedded item "${name}" could not be opened.`);
      continue;
    }
    const data = as('__substg1.0_37010102');
    if (!data) { email.warnings.push(`Attachment "${name}" has no readable data (OLE object or link).`); continue; }
    email.attachments.push({ name, mime, size: data.length, bytes: data, cid, inline: hidden || (!!cid && /^image\//.test(mime || guessMime(name))) });
  }
  return email;
}

/* compressed RTF (MS-OXRTFCP) */
const RTF_PREBUF = '{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\r\n\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx';
function decompressRTF(data) {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const compSize = dv.getUint32(0, true), rawSize = dv.getUint32(4, true), magic = dv.getUint32(8, true);
  if (magic === 0x414c454d) return data.slice(16, 16 + rawSize);
  if (magic !== 0x75465a4c) throw new Error('Unknown RTF compression');
  const dict = new Uint8Array(4096);
  for (let i = 0; i < RTF_PREBUF.length; i++) dict[i] = RTF_PREBUF.charCodeAt(i);
  let wp = RTF_PREBUF.length; const out = []; let i = 16; const end = Math.min(data.length, compSize + 4);
  outer: while (i < end) {
    const flags = data[i++];
    for (let b = 0; b < 8 && i < end; b++) {
      if (flags & (1 << b)) {
        const hi = data[i], lo = data[i + 1]; i += 2;
        const off = (hi << 4) | (lo >> 4), len = (lo & 15) + 2;
        if (off === wp) break outer;
        for (let k = 0; k < len; k++) { const c = dict[(off + k) & 4095]; out.push(c); dict[wp] = c; wp = (wp + 1) & 4095; }
      } else { const c = data[i++]; out.push(c); dict[wp] = c; wp = (wp + 1) & 4095; }
    }
  }
  return Uint8Array.from(out);
}
function rtfToText(rtf) {
  let out = '', i = 0, cp = 1252, uc = 1, htmlrtf = false;
  const stack = []; let skip = false, htmltag = false, tagBuf = '';
  const SKIP = new Set(['fonttbl', 'colortbl', 'stylesheet', 'info', 'pict', 'header', 'footer', 'object', 'listtable', 'listoverridetable', 'rsidtbl', 'generator', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'xmlnstbl', 'mmathPr']);
  const bytes = []; const flushBytes = () => { if (bytes.length) { try { out += new TextDecoder('windows-' + cp).decode(Uint8Array.from(bytes)); } catch { out += String.fromCharCode(...bytes); } bytes.length = 0; } };
  const emit = s => { if (skip) return; if (htmltag) { tagBuf += s; return; } if (htmlrtf) return; flushBytes(); out += s; };
  while (i < rtf.length) {
    const c = rtf[i];
    if (c === '{') { flushBytes(); stack.push({ skip, htmltag, uc, htmlrtf }); i++; continue; }
    if (c === '}') {
      flushBytes();
      if (htmltag && !(stack.length && stack[stack.length - 1].htmltag)) { const tb = tagBuf.trim(); if (/<(br|\/p|\/div|\/tr|\/li|\/h\d|\/table)\b/i.test(tb)) out += '\n'; else if (/<\/t[dh]\b/i.test(tb)) out += ' | '; else if (tb && tb[0] !== '<') out += tb.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (m, d) => String.fromCharCode(+d)); tagBuf = ''; }
      const st = stack.pop() || {}; skip = st.skip || false; htmltag = st.htmltag || false; uc = st.uc || 1; htmlrtf = st.htmlrtf || false; i++; continue;
    }
    if (c === '\\') {
      const n = rtf[i + 1];
      if (n === '\\' || n === '{' || n === '}') { emit(n); i += 2; continue; }
      if (n === '\'') { const hx = parseInt(rtf.substr(i + 2, 2), 16); if (!skip && !htmlrtf) { if (htmltag) tagBuf += String.fromCharCode(hx); else bytes.push(hx); } i += 4; continue; }
      if (n === '*') { // destination
        const m2 = /^\\\*\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 48));
        if (m2 && m2[1] === 'htmltag') { flushBytes(); htmltag = true; tagBuf = ''; i += m2[0].length; continue; }
        skip = true; i += 2; continue;
      }
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 64));
      if (!m) { i += 2; continue; }
      const word = m[1], arg = m[2] !== undefined ? +m[2] : null; i += m[0].length;
      if (SKIP.has(word)) { skip = true; continue; }
      if (word === 'ansicpg' && arg) cp = arg;
      else if (word === 'htmlrtf') htmlrtf = arg !== 0;
      else if (word === 'uc' && arg !== null) uc = arg;
      else if (word === 'u' && arg !== null) { emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); let k = uc; while (k > 0 && i < rtf.length) { if (rtf[i] === '\\' && rtf[i + 1] === '\'') i += 4; else i += 1; k--; } }
      else if (word === 'par' || word === 'line' || word === 'sect' || word === 'page') emit('\n');
      else if (word === 'tab' || word === 'cell') emit(word === 'cell' ? ' | ' : '\t');
      else if (word === 'row') emit('\n');
      continue;
    }
    if (c === '\r' || c === '\n') { i++; continue; }
    if (htmltag && !skip) { tagBuf += c; i++; continue; }
    if (!skip && !htmlrtf) bytes.push(c.charCodeAt(0) & 255);
    i++;
  }
  flushBytes();
  return tidyText(out);
}

/* ---------- pasted email ---------- */
const PASTE_KEYS = {
  from: /^(from|من|von|de)\s*:/i, sent: /^(sent|date|تاريخ الإرسال|التاريخ|gesendet|envoyé)\s*:/i,
  to: /^(to|إلى|an|à)\s*:/i, cc: /^(cc|نسخة|نسخة إلى)\s*:/i, subject: /^(subject|الموضوع|betreff|objet)\s*:/i,
};
function parsePasted(text) {
  const t = tidyText(text || '');
  const lines = t.split('\n');
  const email = { subject: '', from: '', fromEmail: '', to: '', cc: '', date: '', messageId: '', inReplyTo: '', references: '', convIndex: '', body: t, attachments: [], warnings: [] };
  let found = 0, lastHeaderLine = -1;
  for (let i = 0; i < Math.min(lines.length, 14); i++) {
    const ln = lines[i].trim(); if (!ln) { if (found) { lastHeaderLine = i; break; } continue; }
    let hit = false;
    for (const [k, re] of Object.entries(PASTE_KEYS)) {
      if (re.test(ln)) { const v = ln.replace(re, '').trim(); hit = true; found++; lastHeaderLine = i;
        if (k === 'sent') email.date = parseDateLoose(v) || ''; else if (!email[k]) email[k] = v; }
    }
    if (!hit && found) break;
  }
  if (found >= 2) {
    email.fromEmail = firstEmail(email.from);
    email.body = lines.slice(lastHeaderLine + 1).join('\n').trim() || t;
  } else { email.subject = ''; }
  return email;
}

/* ---------- forwarded mail ---------- */
function b64urlToBytes(s) { const b = String(s || '').replace(/-/g, '+').replace(/_/g, '/'); return binToBytes(atobSafe(b + '='.repeat((4 - b.length % 4) % 4))); }
const FWD_SUBJ = /^\s*(fw|fwd|tr|wg|rv|vs|إعادة توجيه|توجيه)\s*[:：]/i;
const SEP_LINE = /^\s*(-{3,}.*(forwarded|original|الرسالة).*-{3,}|_{8,}|-{5,}\s*original message\s*-{5,}|begin forwarded message:?)\s*$/i;
function findHeaderBlock(body) {
  const lines = body.split('\n'); let off = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    if (PASTE_KEYS.from.test(ln)) {
      const win = lines.slice(i, i + 9).map(x => x.trim());
      if (win.some(x => PASTE_KEYS.sent.test(x)) && win.some(x => PASTE_KEYS.subject.test(x))) return { index: off, line: i };
    }
    off += lines[i].length + 1;
  }
  return null;
}
function cleanNote(t) {
  const out = String(t || '').split('\n').filter(l => !SEP_LINE.test(l)).join('\n').trim();
  return out.replace(/\s/g, '').length < 2 ? '' : out;
}
/* A message forwarded to the task inbox → the original email it carries.
   mode "attachment": forwarded as an attached .eml/.msg (full original headers);
   mode "inline": original header block quoted in the body; mode "direct": not a forward. */
function unwrapForward(em) {
  const real = em.attachments.filter(a => !a.inline);
  const emailAtts = real.filter(a => a.email);
  const body = em.body || '';
  if (emailAtts.length === 1 && real.length === 1) {
    const inner = emailAtts[0].email; const note = cleanNote(body);
    return { ...inner, body: (note ? `[My forwarding note]\n${note}\n\n[Original email]\n` : '') + (inner.body || ''), forwardedBy: em.from, forwardedAt: em.date, forwardMode: 'attachment', warnings: [...(inner.warnings || []), ...(em.warnings || [])] };
  }
  const hb = findHeaderBlock(body);
  if (hb && FWD_SUBJ.test(em.subject || '')) {
    const orig = parsePasted(body.slice(hb.index));
    if (orig.from || orig.subject) {
      const note = cleanNote(body.slice(0, hb.index));
      return { ...em, subject: orig.subject || normSubject(em.subject), from: orig.from || em.from, fromEmail: orig.fromEmail || '', to: orig.to || '', cc: orig.cc || '', date: orig.date || em.date,
        messageId: '', inReplyTo: '', references: '', convIndex: '',
        body: (note ? `[My forwarding note]\n${note}\n\n` : '') + '[Original email — header recovered from the forwarded text]\n' + body.slice(hb.index), forwardedBy: em.from, forwardedAt: em.date, forwardMode: 'inline' };
    }
  }
  return { ...em, forwardMode: 'direct' };
}

/* ---------- thread key ---------- */
const SUBJ_PREFIX = /^\s*((re|fw|fwd|aw|wg|tr|rv|sv|vs|antw|ref|رد|إعادة توجيه|توجيه)\s*(\[\d+\])?\s*[:：]\s*|\[(external|ext|caution)[^\]]*\]\s*|(external|caution)\s*:\s*)/i;
function normSubject(s) { let x = (s || '').trim(), prev; do { prev = x; x = x.replace(SUBJ_PREFIX, ''); } while (x !== prev); return x.replace(/\s+/g, ' ').trim(); }
function threadKey(email) { const n = normSubject(email.subject).toLowerCase(); return n ? 'sub:' + n.slice(0, 180) : (email.messageId ? 'mid:' + email.messageId : 'x:' + uid()); }

/* ---------- attachment classification ---------- */
function guessMime(name) {
  const e = extOf(name);
  return ({ pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic' })[e] || '';
}
const KIND_BY_EXT = {
  pdf: 'pdf', png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', bmp: 'image', tif: 'tiff', tiff: 'tiff', heic: 'heic', heif: 'heic',
  docx: 'docx', docm: 'docx', dotx: 'docx', doc: 'legacy', rtf: 'rtf', odt: 'odt',
  xlsx: 'sheet', xlsm: 'sheet', xlsb: 'sheet', xls: 'sheet', ods: 'sheet', csv: 'sheet', tsv: 'sheet',
  pptx: 'pptx', pptm: 'pptx', ppt: 'legacy',
  txt: 'text', md: 'text', log: 'text', json: 'text', xml: 'text', ics: 'text', vcs: 'text', html: 'html', htm: 'html',
  eml: 'eml', msg: 'msg', zip: 'zip', '7z': 'archive', rar: 'archive',
  dxf: 'dxf', dwg: 'cad', dgn: 'cad', rvt: 'cad', rfa: 'cad', nwd: 'cad', nwc: 'cad', ifc: 'cad', step: 'cad', stp: 'cad', igs: 'cad', iges: 'cad', sat: 'cad', skp: 'cad', dwf: 'cad', dwfx: 'cad', sldprt: 'cad', sldasm: 'cad', slddrw: 'cad',
  mp4: 'media', mov: 'media', mp3: 'media', wav: 'media', m4a: 'media', exe: 'binary', dll: 'binary',
};
function kindOf(name, mime) {
  const k = KIND_BY_EXT[extOf(name)];
  if (k) return k;
  if (/^image\//.test(mime || '')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (/^text\/html/.test(mime || '')) return 'html';
  if (/^text\//.test(mime || '')) return 'text';
  if (mime === 'message/rfc822') return 'eml';
  return 'unknown';
}
const KIND_LABEL = { pdf: 'PDF', image: 'Image', docx: 'Word', sheet: 'Spreadsheet', pptx: 'PowerPoint', text: 'Text', html: 'HTML', eml: 'Email', msg: 'Outlook item', zip: 'ZIP', dxf: 'DXF drawing', cad: 'CAD model', rtf: 'RTF', legacy: 'Legacy Office', tiff: 'TIFF image', heic: 'HEIC image', odt: 'OpenDocument', archive: 'Archive', media: 'Audio/video', binary: 'Program', unknown: 'File' };

/* ---------- library loader (browser) ---------- */
// The desktop app sets globalThis.ETM_CDN to locally bundled copies of the same versions.
const CDN = (typeof globalThis !== 'undefined' && globalThis.ETM_CDN) || {
  pdf: ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'],
  xlsx: ['https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'],
  mammoth: ['https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js'],
  jszip: ['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'],
  docx: ['https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'],
};
const GLOBAL = { pdf: 'pdfjsLib', xlsx: 'XLSX', mammoth: 'mammoth', jszip: 'JSZip', docx: 'docx' };
const scriptP = {};
function loadScript(src) {
  if (scriptP[src]) return scriptP[src];
  return (scriptP[src] = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = () => res(); s.onerror = () => { delete scriptP[src]; rej(new Error('Could not load the reader library (' + (src.split('/npm/')[1] || src.split('/').pop()).split('/')[0] + '). Check your connection and try again.')); };
    document.head.appendChild(s);
  }));
}
async function need(lib) {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  if (g[GLOBAL[lib]] && (lib !== 'pdf' || g.pdfjsWorker)) return g[GLOBAL[lib]];
  for (const src of CDN[lib]) await loadScript(src);
  return g[GLOBAL[lib]];
}

/* ---------- extraction ---------- */
const VISION_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
async function canvasToBlob(canvas, q = 0.85) {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type: 'image/jpeg', quality: q });
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
}
function mkCanvas(w, h) { if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h); const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

async function pdfExtract(bytes, opts) {
  const pdfjsLib = await need('pdf');
  let doc;
  try {
    doc = await pdfjsLib.getDocument({ data: bytes.slice(0), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') return { status: 'unreadable', note: 'Password-protected PDF — open it, remove the password or print to PDF, then add it again.' };
    return { status: 'unreadable', note: 'PDF could not be opened (' + (e && e.message || 'damaged file') + ').' };
  }
  const n = doc.numPages, maxPages = Math.min(n, opts.maxPdfPages || 300);
  const pages = []; let textChars = 0;
  for (let p = 1; p <= maxPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const items = tc.items.filter(it => it.str !== undefined);
    // rebuild lines by y position
    const rows = [];
    for (const it of items) {
      const y = Math.round(it.transform[5]), x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) <= 2.5);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, s: it.str, w: it.width || 0 });
    }
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map(r => { r.parts.sort((a, b) => a.x - b.x); let s = '', lastEnd = null; for (const pt of r.parts) { if (lastEnd !== null && pt.x - lastEnd > 6) s += pt.x - lastEnd > 40 ? '   ' : ' '; s += pt.s; lastEnd = pt.x + pt.w; } return s.trim(); }).filter(Boolean);
    const text = lines.join('\n');
    const chars = text.replace(/\s/g, '').length; textChars += chars;
    const big = Math.max(vp.width, vp.height) >= 1150; // ≥ A3
    pages.push({ p, text, chars, w: vp.width, h: vp.height, scanned: chars < 25, drawing: big, page });
  }
  const scanned = pages.filter(x => x.scanned).map(x => x.p);
  const drawings = pages.filter(x => x.drawing && !x.scanned).map(x => x.p);
  const res = {
    status: 'text', pages: n, text: pages.map(x => `[Page ${x.p}]\n${x.text || '(no text layer on this page)'}`).join('\n\n'),
    scannedPages: scanned, drawingPages: drawings, images: [], note: '',
  };
  if (n > maxPages) res.note = `Only the first ${maxPages} of ${n} pages were read.`;
  // page images for vision
  const wantPages = [];
  if (opts.vision) {
    scanned.forEach(p => wantPages.push({ p, why: 'scan' }));
    if (opts.drawings) drawings.forEach(p => wantPages.push({ p, why: 'drawing' }));
  }
  const cap = opts.maxPageImages ?? 8;
  for (const w of wantPages.slice(0, cap)) {
    const pg = pages[w.p - 1];
    try {
      const target = 1568, s1 = target / Math.max(pg.w, pg.h);
      const vp = pg.page.getViewport({ scale: s1 });
      const cv = mkCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
      const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
      await pg.page.render({ canvasContext: ctx, viewport: vp }).promise;
      res.images.push({ blob: await canvasToBlob(cv), label: `page ${w.p}${w.why === 'drawing' ? ' (drawing sheet, full view)' : ' (scanned page)'}`, page: w.p });
      if (w.why === 'drawing' && opts.titleBlocks) { // higher-resolution crop of the title-block corner
        const s2 = Math.min(4, (1400 / (Math.max(pg.w, pg.h) * 0.4)));
        const vp2 = pg.page.getViewport({ scale: s2 });
        const cw = Math.ceil(vp2.width * 0.4), ch = Math.ceil(vp2.height * 0.4);
        const cv2 = mkCanvas(cw, ch); const c2 = cv2.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, cw, ch);
        await pg.page.render({ canvasContext: c2, viewport: vp2, transform: [1, 0, 0, 1, -(vp2.width - cw), -(vp2.height - ch)] }).promise;
        res.images.push({ blob: await canvasToBlob(cv2, 0.9), label: `page ${w.p} title-block corner (bottom-right, zoomed)`, page: w.p });
      }
    } catch (e) { res.note += ` Page ${w.p} could not be rendered as an image.`; }
  }
  const skipped = wantPages.slice(cap).map(w => w.p);
  if (skipped.length) res.note += ` Page images not prepared for page(s) ${compactRange(skipped)} (image limit).`;
  if (scanned.length && !opts.vision) res.note += ` Page(s) ${compactRange(scanned)} have no text layer and page images are turned off — their content cannot be read.`;
  if (scanned.length === pages.length) res.status = opts.vision ? 'vision' : 'unreadable';
  else if (res.images.length) res.status = 'mixed';
  pages.forEach(x => { x.page.cleanup && x.page.cleanup(); delete x.page; });
  doc.destroy && doc.destroy();
  res.note = res.note.trim();
  return res;
}
function compactRange(arr) {
  const a = [...new Set(arr)].sort((x, y) => x - y); const out = []; let s = a[0], p = a[0];
  for (let i = 1; i <= a.length; i++) { if (a[i] === p + 1) { p = a[i]; continue; } out.push(s === p ? `${s}` : `${s}–${p}`); s = p = a[i]; }
  return out.join(', ');
}

async function docxExtract(bytes) {
  const mammoth = await need('mammoth');
  let html = '', msgs = [];
  try { const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); const r = await mammoth.convertToHtml(typeof window === 'undefined' && typeof Buffer !== 'undefined' ? { buffer: Buffer.from(ab) } : { arrayBuffer: ab }); html = r.value; msgs = r.messages || []; }
  catch (e) { return { status: 'unreadable', note: 'Word file could not be opened (possibly password-protected or damaged).' }; }
  let text = htmlToText(html);
  let note = '';
  try {
    const JSZip = await need('jszip');
    const zip = await JSZip.loadAsync(bytes);
    const cx = zip.file('word/comments.xml');
    if (cx) {
      const xml = await cx.async('string');
      const comments = [...xml.matchAll(/<w:comment\b([^>]*)>([\s\S]*?)<\/w:comment>/g)].map(m => {
        const a = /w:author="([^"]*)"/.exec(m[1]); const d = /w:date="([^"]*)"/.exec(m[1]);
        const t = [...m[2].matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(x => x[1]).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
        return `- [Comment by ${a ? a[1] : 'unknown'}${d ? ', ' + d[1].slice(0, 10) : ''}] ${t}`;
      });
      if (comments.length) text += `\n\n[Reviewer comments in this document — ${comments.length}]\n` + comments.join('\n');
    }
    const docXml = zip.file('word/document.xml');
    if (docXml) { const x = await docXml.async('string'); const ins = (x.match(/<w:ins\b/g) || []).length, del = (x.match(/<w:del\b/g) || []).length; if (ins + del) note = `Contains ${ins + del} tracked change(s); text shown with changes applied.`; }
  } catch {}
  return { status: text.trim() ? 'text' : 'unreadable', text, note: note || (text.trim() ? '' : 'No text found in this Word file.') };
}

async function sheetExtract(bytes, name) {
  const XLSX = await need('xlsx');
  let wb;
  try { wb = XLSX.read(bytes, { type: 'array', cellDates: true, cellNF: false, cellText: true, sheetStubs: false }); }
  catch (e) { return { status: 'unreadable', note: /password|encrypt/i.test(e && e.message || '') ? 'Password-protected workbook.' : 'Spreadsheet could not be opened.' }; }
  const parts = [];
  for (const sn of wb.SheetNames) {
    const ws = wb.Sheets[sn]; if (!ws || !ws['!ref']) continue;
    const hidden = (wb.Workbook && wb.Workbook.Sheets || []).find(s => s.name === sn)?.Hidden;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const lines = [];
    const notes = [];
    for (let r = range.s.r; r <= Math.min(range.e.r, 20000); r++) {
      const cells = [];
      for (let c = range.s.c; c <= Math.min(range.e.c, 80); c++) {
        const addr = XLSX.utils.encode_cell({ r, c }); const cell = ws[addr];
        if (cell) {
          let v = cell.w !== undefined ? cell.w : (cell.v instanceof Date ? isoDate(cell.v) : cell.v);
          if (v !== undefined && v !== null && String(v).trim() !== '') cells.push(`${XLSX.utils.encode_col(c)}: ${String(v).replace(/\s+/g, ' ').trim()}`);
          if (cell.c && cell.c.length) notes.push(`${addr} (${cell.c.map(x => (x.a ? x.a + ': ' : '') + (x.t || '').replace(/\s+/g, ' ')).join(' / ')})`);
        }
      }
      if (cells.length) lines.push(`R${r + 1} | ${cells.join(' | ')}`);
    }
    if (!lines.length && !notes.length) continue;
    parts.push(`[Sheet: ${sn}]${hidden ? ' (hidden sheet)' : ''} — ${lines.length} non-empty rows\n` + lines.join('\n') + (notes.length ? `\n[Cell notes on ${sn}]\n` + notes.join('\n') : ''));
  }
  const text = parts.join('\n\n');
  return { status: text ? 'text' : 'unreadable', text, sheets: wb.SheetNames.length, note: text ? '' : 'Workbook has no readable cells.' };
}

async function pptxExtract(bytes) {
  const JSZip = await need('jszip');
  try {
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f)).sort((a, b) => +a.match(/\d+/)[0] - +b.match(/\d+/)[0]);
    const parts = [];
    for (const f of slides) {
      const xml = await zip.file(f).async('string');
      const paras = xml.split(/<\/a:p>/).map(p => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(m => m[1]).join('')).filter(Boolean);
      parts.push(`[Slide ${f.match(/\d+/)[0]}]\n` + paras.join('\n'));
    }
    const text = xmlUnescape(parts.join('\n\n'));
    return { status: text.trim() ? 'text' : 'unreadable', text, note: '' };
  } catch { return { status: 'unreadable', note: 'PowerPoint file could not be opened.' }; }
}
const xmlUnescape = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

function dxfExtract(bytes) {
  const s = decodeBytes(bytes, 'utf-8').replace(/\r\n/g, '\n').split('\n');
  const out = []; let ent = '';
  for (let i = 0; i + 1 < s.length; i += 2) {
    const code = s[i].trim(), val = s[i + 1];
    if (code === '0') ent = val.trim();
    if ((code === '1' || code === '3') && /^(TEXT|MTEXT|ATTRIB|ATTDEF|DIMENSION|MULTILEADER)$/.test(ent)) {
      const t = val.replace(/\\P/g, '\n').replace(/\\[A-Za-z][^;]*;/g, '').replace(/[{}]/g, '').trim(); if (t) out.push(t);
    }
  }
  const text = [...new Set(out)].join('\n');
  return { status: text ? 'text' : 'unreadable', text, note: 'Only text entities (notes, labels, title block attributes) were read; geometry is not interpreted.' };
}

async function imageToVisionBlob(blob, mime, maxBytes) {
  if (VISION_TYPES.includes(mime) && (!maxBytes || blob.size <= maxBytes)) return blob;
  // convert/downscale via canvas
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const cv = mkCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
  const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
  return canvasToBlob(cv, 0.88);
}

/* Extract one attachment. att: {name, mime, bytes, email?}. Returns result object. */
async function extract(att, opts = {}) {
  const kind = att.email ? 'email' : kindOf(att.name, att.mime);
  const base = { kind, kindLabel: att.email ? 'Email' : (KIND_LABEL[kind] || 'File'), text: '', images: [], note: '', status: 'text' };
  try {
    switch (kind) {
      case 'email': return { ...base, ...emailAsAttachment(att.email) };
      case 'pdf': return { ...base, ...(await pdfExtract(att.bytes, opts)) };
      case 'image': {
        if (!opts.vision) return { ...base, status: 'skipped', note: 'Images are turned off for analysis.' };
        if (att.inline && att.bytes.length < 40000) return { ...base, status: 'skipped', note: 'Small inline image (likely a signature logo) — skipped.' };
        const blob = new Blob([att.bytes], { type: att.mime || guessMime(att.name) || 'image/png' });
        const vb = await imageToVisionBlob(blob, blob.type, opts.maxImageBytes);
        return { ...base, status: 'vision', images: [{ blob: vb, label: 'image' }] };
      }
      case 'tiff': case 'heic': return { ...base, status: 'unsupported', note: `${kind.toUpperCase()} images can't be read in the browser — save as JPG/PNG or PDF.` };
      case 'docx': return { ...base, ...(await docxExtract(att.bytes)) };
      case 'sheet': {
        if (extOf(att.name) === 'csv' || extOf(att.name) === 'tsv') { const t = decodeBytes(att.bytes, 'utf-8'); return { ...base, text: t.split(/\r?\n/).map((l, i) => l.trim() ? `R${i + 1} | ${l}` : '').filter(Boolean).join('\n') }; }
        return { ...base, ...(await sheetExtract(att.bytes, att.name)) };
      }
      case 'pptx': return { ...base, ...(await pptxExtract(att.bytes)) };
      case 'text': return { ...base, text: tidyText(decodeBytes(att.bytes, 'utf-8')) };
      case 'html': return { ...base, text: htmlToText(decodeBytes(att.bytes, 'utf-8')) };
      case 'rtf': return { ...base, text: rtfToText(bytesToBin(att.bytes)) };
      case 'dxf': return { ...base, ...dxfExtract(att.bytes) };
      case 'eml': { const em = parseEml(att.bytes); return { ...base, kind: 'email', kindLabel: 'Email', ...emailAsAttachment(em), nested: em }; }
      case 'msg': { const XLSX = await need('xlsx'); const em = readMsgFromCfb(XLSX.CFB.read(att.bytes, { type: 'array' })); return { ...base, kind: 'email', kindLabel: 'Email', ...emailAsAttachment(em), nested: em }; }
      case 'zip': return { ...base, status: 'container', note: 'ZIP archive — its files are listed separately.' };
      case 'cad': return { ...base, status: 'unsupported', note: 'CAD/model file — can\'t be read in the browser. Add a PDF print of the drawing instead.' };
      case 'legacy': return { ...base, status: 'unsupported', note: 'Legacy Office format (.doc/.ppt) — save as .docx/.pptx or PDF and add it again.' };
      case 'odt': return { ...base, status: 'unsupported', note: 'OpenDocument text — save as .docx or PDF.' };
      case 'archive': return { ...base, status: 'unsupported', note: '7z/RAR archives can\'t be opened here — extract the files and add them directly.' };
      case 'media': return { ...base, status: 'unsupported', note: 'Audio/video is not analysed.' };
      default: {
        const t = decodeBytes(att.bytes.slice(0, 200000), 'utf-8');
        const printable = (t.match(/[\p{L}\p{N}\p{P}\s]/gu) || []).length / Math.max(1, t.length);
        if (printable > 0.95) return { ...base, kind: 'text', kindLabel: 'Text', text: tidyText(t) };
        return { ...base, status: 'unsupported', note: 'Unrecognised file type — not analysed.' };
      }
    }
  } catch (e) {
    return { ...base, status: 'unreadable', note: (e && e.message) ? e.message : 'File could not be read.' };
  }
}
function emailAsAttachment(em) {
  const head = [`Subject: ${em.subject}`, `From: ${em.from}`, em.date ? `Date: ${em.date.slice(0, 16).replace('T', ' ')} UTC` : '', `To: ${em.to}`, em.cc ? `Cc: ${em.cc}` : ''].filter(Boolean).join('\n');
  return { status: 'text', text: head + '\n\n' + em.body, note: em.attachments.length ? `Contains ${em.attachments.length} attachment(s), listed separately.` : '' };
}

/* ---------- masking ---------- */
function makeMasker(myEmails) {
  const map = new Map(), rev = new Map(); let ne = 0, np = 0;
  const mine = new Set((myEmails || []).map(s => s.toLowerCase().trim()).filter(Boolean));
  const mask = s => String(s || '')
    .replace(/[\w.+'-]+@[\w-]+(\.[\w-]+)+/g, m => { const k = m.toLowerCase(); if (mine.has(k)) return '[my-email]'; if (!map.has(k)) { const t = `[email-${++ne}]`; map.set(k, t); rev.set(t, m); } return map.get(k); })
    .replace(/(\+?\d[\d ()\-]{7,}\d)/g, m => { if (m.replace(/\D/g, '').length < 9) return m; if (!map.has(m)) { const t = `[phone-${++np}]`; map.set(m, t); rev.set(t, m); } return map.get(m); });
  const unmask = s => typeof s === 'string' ? s.replace(/\[(email|phone)-\d+\]/g, t => rev.get(t) || t).replace(/\[my-email\]/g, 'me') : s;
  return { mask, unmask };
}

/* ---------- categories (assigned by Claude) ---------- */
const WORK_TYPES = { reply: 'Reply / clarify', review: 'Review / check', revise: 'Revise & resubmit', submit: 'Submit / issue', approve: 'Approve / sign off', decide: 'Decide', follow_up: 'Follow up / chase', attend: 'Meetings & site visits', prepare: 'Prepare / design / calculate' };
const DISCIPLINES = { pumps: 'Pumps', blowers: 'Blowers & aeration', valves: 'Valves & actuators', piping: 'Piping & supports', screens_equipment: 'Screens & mechanical equipment', hydraulics_process: 'Hydraulics & process', civil_interface: 'Civil / structural interface', electrical_instrumentation: 'Electrical & instrumentation', procurement: 'Procurement — RFQ, BOQ, offers', documents_drawings: 'Drawings, documents & submittals', coordination_admin: 'Coordination & admin' };
const CATEGORY_RULES = `CATEGORIES (choose exactly one of each)
- workType — what kind of action it is: ${Object.keys(WORK_TYPES).join(' | ')}
- discipline — the engineering subject it concerns, by equipment/system first: ${Object.keys(DISCIPLINES).join(' | ')}. Use pumps / blowers / valves / piping / screens_equipment when the task is about that equipment, even if the deliverable is a document. Use documents_drawings only when no single equipment or system dominates. Use coordination_admin for meetings, planning and admin with no technical subject.
- topic — a short name (2–6 words) for the subject or deliverable the task belongs to within its project, e.g. "Valves specification CRS", "RAS pump hydraulic calc", "Blower building GA", "RFQ-221 blowers". Name the document, equipment or package, not the action. Reuse the exact name from EXISTING TOPICS when the task concerns the same subject, so related tasks group together.
- project — reuse the exact name from KNOWN PROJECTS when it is the same project (match codes, abbreviations and spelling variants). Otherwise a short project name or code as written in the source. null when no project is identifiable — never guess.`;
function buildCategorizePrompt(tasks, projects, candidates = [], topics = []) {
  const proj = projects.map(p => `- ${p.code ? p.code + ' — ' : ''}${p.name}${p.aliases ? ' (also: ' + p.aliases + ')' : ''}`).join('\n');
  return `You organise the to-do list of a mechanical design engineer in water/wastewater treatment. For each task below assign a project, a topic, a workType and a discipline. Base each choice only on the task's own text; do not change what the task means. Reply with JSON only.

KNOWN PROJECTS
${proj || '(none yet)'}

${CATEGORY_RULES}

EXISTING TOPICS (project › topic — reuse these exact names)
${topics.map(x => `- ${x.project || 'No project'} › ${x.topic}`).join('\n') || '(none yet)'}

EXISTING TASKS that new tasks may relate to (id | ref | title | project | category | status)
${candidates.map(c => `${c.id} | ${c.ref || ''} | ${clip(c.title, 90)} | ${c.project || '-'} | ${c.discipline || '-'} | ${c.status}`).join('\n') || '(none)'}

RELATIONSHIPS: relatedTaskIds = ids from EXISTING TASKS that this task follows on from, depends on, answers or continues (never invent ids; [] when none). placementConfidence = 0–1. When below 0.7, give up to 3 placementOptions {project, discipline, relatedTaskId, reason}.

TASKS (one JSON object per line)
${tasks.map(t => JSON.stringify({ id: t.id, title: t.title, action: clip(t.action || '', 400), project: t.project || null, source: clip(t.sourceSubject || '', 120), requestedBy: t.requestedBy || null })).join('\n')}

Reply with a JSON array, one object per task, same ids:
[{"id":"…","project":"name or null","topic":"short subject name","workType":"…","discipline":"…","relatedTaskIds":[],"placementConfidence":0.9,"placementOptions":[]}]`;
}

/* ---------- prompt ---------- */
const ENGINEERING_NOTES = `ENGINEERING CONTEXT (use it to interpret documents; never to invent requirements)
- Submittal/document review codes vary by project. Common: Code 1/A Approved; Code 2/B Approved as noted (incorporate comments; resubmission only if stated); Code 3/C Revise and resubmit; Code 4/D Rejected; "For information / Reviewed - no comments". Quote the code exactly as written.
- Comment Response Sheet (CRS) / comment register: rows with comment no., reviewer comment, response, status. A row against my document with an empty response or status "Open" is an unanswered comment that needs a response. Reviewer comments in Word files and cell notes in Excel count as comments.
- TQ / RFI / technical query, NCR, transmittal ("purpose of issue": for approval / for information / for construction / for tender), MOM (minutes: action items with "action by"), RFQ, tender clarification, TBE (technical bid evaluation), BOQ, datasheet, specification, method statement, ITP.
- Mechanical / water & wastewater: P&ID, GA and layout drawings, hydraulic profile and hydraulic calculations, pump selection (duty point Q/H, NPSH available vs required, efficiency, motor kW), blowers (air flow Nm3/h, discharge pressure), mixers, screens, clarifiers, filters, dosing, valves (type, DN, PN rating, materials, actuators), piping (DN, material, pressure class, supports), instrumentation, civil interfaces (openings, embedded items, anchor bolts, equipment loads, plinths).
- Drawings: read the title block (drawing no., revision, status, date). Revision clouds, markups and comment bubbles are requested changes. Check whether comments refer to the revision actually attached.`;

function buildPrompt(input) {
  // input: {me, projects, today, tz, email, attachments:[{key,name,kindLabel,text,note,status}], images:[{key,label}], openTasks:[...], budget}
  const { me, today, email } = input;
  const weekday = new Date(today + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long' });
  const meLines = [
    `Name: ${me.name || '(not set)'}`,
    me.emails?.length ? `My email address(es): ${me.emails.join(', ')}` : '',
    me.aliases ? `Also referred to as: ${me.aliases}` : '',
    me.role ? `Role: ${me.role}` : '',
    me.org ? `Company / team: ${me.org}` : '',
    me.scope ? `I am responsible for: ${me.scope}` : '',
  ].filter(Boolean).join('\n');
  const proj = (input.projects || []).map(p => `- ${p.code ? p.code + ' — ' : ''}${p.name}${p.aliases ? ' (also: ' + p.aliases + ')' : ''}`).join('\n');
  const open = (input.openTasks || []).map(t => `- [${t.id}] ${t.ref ? t.ref + ' ' : ''}${t.title} | project: ${t.project || '-'} | category: ${t.discipline || '-'} | owner: ${t.owner || 'me'} | status: ${t.status} | due: ${t.deadline || '-'}`).join('\n');
  const head = `You are the email triage assistant of a mechanical design engineer in water/wastewater treatment. Read ONE email (with its quoted conversation history and attachments) and extract the obligations it creates. Reply with JSON only.

TODAY: ${today} (${weekday}), time zone ${input.tz || 'local'}.

ME (the user)
${meLines}
${proj ? '\nKNOWN PROJECTS (reuse these exact names)\n' + proj + '\n' : ''}${(input.topics || []).length ? '\nEXISTING TOPICS (project › topic — reuse these exact names)\n' + input.topics.map(x => `- ${x.project || 'No project'} › ${x.topic}`).join('\n') + '\n' : ''}
TRACKED TASKS — open and recently completed (the same obligation may already exist — reuse its id; also use these ids for relationships)
${open || '(none related)'}

RULES
1. Extract only obligations stated or clearly requested in the provided content. Never invent requirements, values, standards, quantities or deadlines. If something important cannot be read, flag it instead of guessing.
2. Ownership: a task is mine (ownership "mine", owner "me") only if it is addressed to me (my name, my address, my role/team, or "you" in a message where I am a direct recipient), or the content makes me the obvious responsible party (e.g. I issued the document being commented on). If someone else must act and I depend on it, record ownership "waiting" with owner = that party. If I am only in CC and nothing is asked of me, it is FYI. Never assign another person's action to me.
3. Text under "[My forwarding note]" was written by me when I forwarded the email to my task inbox: treat it as my own instruction about what I need to track (it can create or prioritise tasks for me). The original email follows it.
4. The body may only say "see attached": read every attachment. Comment sheets, markups, transmittals, minutes and review stamps often hold the real actions. The newest message is at the top of the body; quoted history below it is older context — do not re-create obligations that the newer message shows are already done.
5. Evidence: every task needs at least one evidence item with a verbatim quote of 5–30 words copied exactly from the source (no ellipses, no paraphrase), the source id (BODY, A1, A2…, IMG1…), and a location when known (page, sheet + row, slide, section, comment no.).
6. Deadlines: convert explicit dates to YYYY-MM-DD (deadlineBasis "explicit"). Resolve relative deadlines ("by Thursday", "within 7 days", "EOD") from the email's sent date (deadlineBasis "relative"). No deadline stated → null with basis "none" — do not guess. Ambiguous (conflicting dates, unclear year, "ASAP", "urgently") → best reading or null, basis "uncertain", and add a flag.
7. Priority: critical = safety, stop-work, site or production blocked, contractual/tender deadline within 2 days. high = deadline within 7 days, escalation, rejected or revise-and-resubmit, tender clarification. medium = normal request. low = no time pressure.
8. One task per distinct deliverable. When a deliverable contains several items (review comments, punch-list items, BOQ lines, drawings to revise, documents to provide, questions to answer), keep ONE task and list EVERY item in "subtasks" in source order — each short and specific, starting with its number or reference (e.g. "C-02 — provide pump curve at 410 m3/h / 14.5 m"). Include only open items that need action; skip items already closed. Leave subtasks empty for a single action. Split an item into its own task only if it has its own owner or date.
9. If this email changes the state of an OPEN TASK listed above (answered, approved, closed, superseded, deadline moved, blocked or unblocked), put it in "updates", not "tasks".
10. Flags: attachment referenced but not provided; content unreadable/truncated that may hold requirements; conflicting instructions; owner unclear; deadline uncertain; revision mismatch (comments refer to a different revision than attached).
11. Relationships and placement: in "relatedTaskIds" list TRACKED TASK ids that this task follows on from, depends on, answers, or continues (e.g. a resubmission after comments, a reply to a query I raised). Never invent ids; [] when none. Set "placementConfidence" (0–1) for how sure you are of the project, category and links. When below 0.7, give up to 3 "placementOptions" — alternative {project, discipline, relatedTaskId, reason} — so I can choose.
12. If nothing is needed from me, set actionRequired false and explain in noActionReason. Waiting/FYI items may still be listed if useful.
13. Documents: list in "documents" every drawing/document/datasheet/calculation that this email submits, returns with a review status code, approves, rejects or requests (for my document register): its number exactly as written, title, revision, the review code if one is given (1 approved, 2 approved with comments, 3 revise and resubmit, 4 rejected — use the digit), and who issued or returned it. [] when there are none.
${input.notes ? '\nUSER RULES AND PREFERENCES (follow these)\n' + input.notes + '\n' : ''}
${ENGINEERING_NOTES}

${CATEGORY_RULES}

OUTPUT — exactly this JSON shape:
{"summary":"1–2 sentences: what this email is about and what it needs from me",
"actionRequired":true,
"noActionReason":null,
"project":"project code/name if identifiable, else null",
"category":"submittal_review|technical_query|rfq_tender|design_coordination|vendor_comments|meeting|approval_request|site_issue|info_only|other",
"tasks":[{"ref":"N1","title":"imperative, specific, ≤90 chars (include doc no./tag)","action":"exactly what must be done, with specifics from the source","type":"do|reply|review|approve|submit|revise|decide|follow_up|attend","ownership":"mine|waiting|fyi","topic":"short subject name","workType":"one of the workType values","discipline":"one of the discipline values","owner":"me or responsible person/company","requestedBy":"who asked","project":"…","priority":"critical|high|medium|low","deadline":"YYYY-MM-DD or null","deadlineText":"as written, or null","deadlineBasis":"explicit|relative|none|uncertain","nextStep":"one concrete first step","dependsOn":null,"blocked":false,"blockedReason":null,"tags":["pumps"],"subtasks":[{"text":"C-01 — item needing action","ref":"C-01","location":"Sheet CRS, row 5"}],"evidence":[{"source":"A1","location":"Sheet CRS, row 14","quote":"exact words from the source"}],"confidence":0.9,"matchesTaskId":null,"relatedTaskIds":[],"placementConfidence":0.9,"placementOptions":[]}],
"updates":[{"taskId":"existing id","change":"completed|status|deadline|note","newStatus":"todo|in_progress|waiting|blocked|done|null","newDeadline":"YYYY-MM-DD or null","note":"what changed","evidence":[{"source":"BODY","location":null,"quote":"…"}]}],
"decisions":["decision — by whom"],
"flags":[{"kind":"missing_attachment|unreadable|truncated|ambiguous|uncertain_deadline|conflict|owner_unclear|revision_mismatch","detail":"…","source":"A2"}],
"documents":[{"number":"document/drawing number as written","title":"…","revision":"A|B|0|… or null","code":"1|2|3|4 or null","status":"submitted|returned|approved|rejected|requested|for_info","by":"who issued or returned it","date":"YYYY-MM-DD or null","source":"A1"}]}

SOURCES`;
  const hdr = [`Subject: ${email.subject || '(none)'}`, `From: ${email.from || '(unknown)'}`, `Sent: ${email.date ? email.date.replace('T', ' ').slice(0, 16) + ' UTC' : '(unknown)'}`, `To: ${email.to || '(unknown)'}`, email.cc ? `Cc: ${email.cc}` : '', email.forwardedBy ? `Forwarded to my task inbox by: ${email.forwardedBy}${email.forwardedAt ? ' on ' + email.forwardedAt.slice(0, 10) : ''} (${email.forwardMode === 'attachment' ? 'original attached, headers exact' : 'original quoted inline, header recovered from text'})` : ''].filter(Boolean).join('\n');
  const attList = input.attachments.length || input.images.length
    ? input.attachments.map(a => `${a.key} = "${a.name}" (${a.kindLabel}${a.status === 'excluded' ? ', NOT PROVIDED: ' + a.note : (a.note ? '; ' + a.note : '')})`).join('\n')
    : '(no attachments)';
  const imgList = input.images.length ? '\nImages attached to this request:\n' + input.images.map(i => `${i.key} = ${i.label}`).join('\n') : '';
  const pre = `${head}\n\n=== EMAIL HEADER ===\n${hdr}\n\n=== ATTACHMENTS ===\n${attList}${imgList}\n`;
  // budgeting
  const budget = input.budget || 240000;
  let remaining = budget - utf8len(pre) - 600;
  const blocks = [{ key: 'BODY', title: 'EMAIL BODY (newest message first, then quoted history)', text: email.body || '(empty body)' }]
    .concat(input.attachments.filter(a => a.text && a.status !== 'excluded').map(a => ({ key: a.key, title: `${a.key}: "${a.name}"`, text: a.text })));
  const sizes = blocks.map(b => utf8len(b.text) + 80);
  const truncations = [];
  let total = sizes.reduce((x, y) => x + y, 0);
  const alloc = sizes.slice();
  if (total > remaining) {
    // water-filling: give small blocks all they need, split the rest
    let left = remaining, idx = blocks.map((b, i) => i).sort((a, b) => sizes[a] - sizes[b]);
    for (let n = 0; n < idx.length; n++) { const fair = Math.floor(left / (idx.length - n)); const i = idx[n]; alloc[i] = Math.min(sizes[i], fair); left -= alloc[i]; }
  }
  let body = '';
  blocks.forEach((b, i) => {
    let t = b.text;
    if (utf8len(t) + 80 > alloc[i]) {
      const keepChars = Math.max(500, Math.floor((alloc[i] - 200) * t.length / utf8len(t)));
      const cut = t.slice(0, keepChars);
      const lastMarker = [...cut.matchAll(/\[(Page \d+|Sheet: [^\]]+|Slide \d+)\]/g)].pop();
      const lastRow = [...cut.matchAll(/^R(\d+) \|/gm)].pop();
      const where = (lastMarker ? lastMarker[1] : '') + (lastRow ? ` row ${lastRow[1]}` : '');
      t = cut + `\n[... TRUNCATED: ${Math.round(100 * keepChars / b.text.length)}% of this source included${where ? ', cut at ' + where : ''}. Content after this point was NOT provided.]`;
      truncations.push({ key: b.key, pct: Math.round(100 * keepChars / b.text.length), where });
    }
    body += `\n=== ${b.title} ===\n${t}\n`;
  });
  return { prompt: pre + body + '\n=== END OF SOURCES ===\nReply with the JSON object only.', truncations };
}

/* ---------- normalization of model output ---------- */
const PRI = ['critical', 'high', 'medium', 'low'];
const OWN = ['mine', 'waiting', 'fyi'];
const STAT = ['todo', 'in_progress', 'waiting', 'blocked', 'done'];
function normalizeAnalysis(raw, ctx) {
  const um = ctx.unmask || (s => s);
  const r = raw && typeof raw === 'object' ? raw : {};
  const S = v => (v === null || v === undefined) ? '' : um(String(v)).trim();
  const ev = arr => (Array.isArray(arr) ? arr : []).slice(0, 6).map(e => ({ source: S(e && e.source).toUpperCase(), location: S(e && e.location), quote: S(e && e.quote) })).filter(e => e.quote || e.location);
  const tasks = (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 40).map((t, i) => {
    let deadline = validISO(t.deadline) ? t.deadline : null;
    let basis = ['explicit', 'relative', 'none', 'uncertain'].includes(t.deadlineBasis) ? t.deadlineBasis : (deadline ? 'explicit' : 'none');
    if (!deadline && t.deadline) basis = 'uncertain';
    if (!deadline && basis !== 'uncertain') basis = 'none';
    const ownership = OWN.includes(t.ownership) ? t.ownership : (/^me$/i.test(t.owner || '') ? 'mine' : 'waiting');
    return {
      pid: uid('p'), ref: S(t.ref) || 'N' + (i + 1),
      title: clip(S(t.title) || 'Untitled action', 140), action: S(t.action), type: S(t.type) || 'do',
      ownership, owner: ownership === 'mine' ? 'me' : (S(t.owner) || 'unknown'), requestedBy: S(t.requestedBy),
      project: S(t.project) || S(r.project), priority: PRI.includes(t.priority) ? t.priority : 'medium',
      deadline, deadlineText: S(t.deadlineText), deadlineBasis: basis,
      nextStep: S(t.nextStep), dependsOn: S(t.dependsOn), blocked: !!t.blocked, blockedReason: S(t.blockedReason),
      tags: (Array.isArray(t.tags) ? t.tags : []).map(S).filter(Boolean).slice(0, 6),
      subtasks: (Array.isArray(t.subtasks) ? t.subtasks : []).slice(0, 150).map(x => typeof x === 'string' ? { text: um(x).trim(), ref: '', location: '' } : { text: S(x && x.text), ref: S(x && x.ref), location: S(x && x.location) }).filter(x => x.text),
      topic: clip(S(t.topic), 60),
      workType: WORK_TYPES[t.workType] ? t.workType : null, discipline: DISCIPLINES[t.discipline] ? t.discipline : null,
      evidence: ev(t.evidence), confidence: Math.max(0, Math.min(1, +t.confidence || 0.6)),
      matchesTaskId: S(t.matchesTaskId) || null,
      relatedTaskIds: (Array.isArray(t.relatedTaskIds) ? t.relatedTaskIds : []).map(S).filter(Boolean).slice(0, 8),
      placementConfidence: t.placementConfidence === undefined ? null : Math.max(0, Math.min(1, +t.placementConfidence || 0)),
      placementOptions: (Array.isArray(t.placementOptions) ? t.placementOptions : []).slice(0, 3).map(o => ({ project: S(o && o.project), discipline: DISCIPLINES[o && o.discipline] ? o.discipline : null, relatedTaskId: S(o && o.relatedTaskId) || null, reason: S(o && o.reason) })).filter(o => o.project || o.discipline || o.relatedTaskId),
    };
  });
  const updates = (Array.isArray(r.updates) ? r.updates : []).slice(0, 20).map(u => ({
    uid: uid('u'), taskId: S(u.taskId), change: S(u.change) || 'note',
    newStatus: STAT.includes(u.newStatus) ? u.newStatus : (u.change === 'completed' ? 'done' : null),
    newDeadline: validISO(u.newDeadline) ? u.newDeadline : null, note: S(u.note), evidence: ev(u.evidence),
  })).filter(u => u.taskId);
  return {
    summary: S(r.summary), actionRequired: r.actionRequired !== false, noActionReason: S(r.noActionReason),
    project: S(r.project), category: S(r.category) || 'other',
    tasks, updates,
    decisions: (Array.isArray(r.decisions) ? r.decisions : []).map(S).filter(Boolean).slice(0, 12),
    documents: (Array.isArray(r.documents) ? r.documents : []).slice(0, 60).map(d => ({ number: S(d && d.number), title: S(d && d.title), revision: S(d && d.revision), code: /^[1-4]$/.test(S(d && d.code)) ? S(d.code) : '', status: ['submitted', 'returned', 'approved', 'rejected', 'requested', 'for_info'].includes(S(d && d.status)) ? S(d.status) : '', by: S(d && d.by), date: validISO(S(d && d.date)) ? S(d.date) : '', source: S(d && d.source).toUpperCase() })).filter(d => d.number || d.title),
    flags: (Array.isArray(r.flags) ? r.flags : []).map(f => ({ kind: S(f && f.kind) || 'ambiguous', detail: S(f && f.detail), source: S(f && f.source) })).filter(f => f.detail).slice(0, 20),
  };
}

/* ---------- evidence verification ---------- */
const normMatch = s => String(s || '').toLowerCase().normalize('NFKC').replace(/[‘’“”"'`´]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normCache = new Map();
function normed(text) { if (normCache.has(text)) return normCache.get(text); const n = normMatch(text); if (normCache.size > 50) normCache.clear(); normCache.set(text, n); return n; }
function locate(text, quote) {
  const words = normMatch(quote).split(' ').filter(Boolean).slice(0, 8);
  if (words.length < 2) return null;
  const re = new RegExp(words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+'), 'iu');
  const m = re.exec(text); if (!m) return null;
  const before = text.slice(0, m.index);
  const mk = [...before.matchAll(/\[(Page \d+|Sheet: [^\]]+|Slide \d+|Reviewer comments[^\]]*|Cell notes on [^\]]+)\]/g)].pop();
  const lineStart = before.lastIndexOf('\n') + 1;
  const row = /^R(\d+) \|/.exec(text.slice(lineStart, lineStart + 12));
  let loc = mk ? mk[1].replace(/^Page /, 'p. ').replace(/^Sheet: /, 'Sheet ').replace(/^Slide /, 'Slide ') : '';
  if (row) loc += (loc ? ', ' : '') + 'row ' + row[1];
  return { index: m.index, location: loc };
}
function verifyEvidence(evList, sources) {
  // sources: {BODY:{text,name}, A1:{text,name}, IMG1:{label,name,visual:true}}
  return evList.map(e => {
    const src = sources[e.source];
    const out = { ...e, sourceName: src ? src.name : (e.source || 'unknown') };
    if (!src) { out.check = 'unknown_source'; return out; }
    if (src.visual) { out.check = 'visual'; return out; }
    if (!e.quote) { out.check = 'no_quote'; return out; }
    const nq = normMatch(e.quote), ns = normed(src.text || '');
    if (nq.length >= 6 && ns.includes(nq)) {
      out.check = 'verified';
      const l = locate(src.text, e.quote); if (l && l.location && !e.location) out.location = l.location; else if (l && l.location) out.autoLocation = l.location;
      return out;
    }
    // partial: share of 5-word shingles found
    const w = nq.split(' '); let hit = 0, tot = 0;
    for (let i = 0; i + 5 <= w.length; i++) { tot++; if (ns.includes(w.slice(i, i + 5).join(' '))) hit++; }
    if (tot && hit / tot >= 0.6) { out.check = 'partial'; const l = locate(src.text, w.slice(0, 6).join(' ')); if (l && l.location && !e.location) out.location = l.location; return out; }
    // maybe quote is from another source
    for (const [k, s2] of Object.entries(sources)) {
      if (k !== e.source && !s2.visual && nq.length >= 6 && normed(s2.text || '').includes(nq)) { out.check = 'verified'; out.source = k; out.sourceName = s2.name; const l = locate(s2.text, e.quote); if (l && l.location) out.location = out.location || l.location; return out; }
    }
    out.check = 'not_found';
    return out;
  });
}

/* ---------- duplicates ---------- */
const STOP = new Set('the and for with from that this have has are was were will shall please kindly dear regards find attached attachment email mail send sent your our you all any per via into onto also need needs required provide confirm review update revise check note comments comment rev revision doc document documents drawing drawings dwg item items'.split(' '));
function tokens(s) { return new Set(normMatch(s).split(' ').filter(w => w.length > 2 && !STOP.has(w))); }
function jaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i); }
function findDuplicate(prop, tasks, thread) {
  const pt = tokens(prop.title + ' ' + prop.action);
  const pt2 = tokens(prop.title);
  let best = null, bestScore = 0;
  for (const t of tasks) {
    if (t.status === 'done' && t.updatedAt && Date.now() - new Date(t.updatedAt) > 30 * 864e5) continue;
    let s = Math.max(jaccard(pt, tokens(t.title + ' ' + (t.action || ''))), jaccard(pt2, tokens(t.title)));
    if (t.threadKey && t.threadKey === thread) s += 0.15;
    if (prop.project && t.project && normMatch(prop.project) === normMatch(t.project)) s += 0.05;
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return bestScore >= 0.5 ? { task: best, score: Math.min(1, bestScore) } : null;
}
function relatedOpenTasks(tasks, email, thread, limit = 25) {
  const et = tokens(email.subject + ' ' + (email.body || '').slice(0, 3000));
  return tasks.filter(t => t.status !== 'done' || t.threadKey === thread || Date.now() - new Date(t.updatedAt || 0) < 60 * 864e5)
    .map(t => ({ t, s: (t.threadKey === thread ? 1 : 0) + jaccard(et, tokens(t.title + ' ' + (t.project || ''))) }))
    .filter(x => x.s >= 0.12).sort((a, b) => b.s - a.s).slice(0, limit).map(x => x.t);
}

function localFlags(email, atts) {
  const f = [];
  const b = (email.body || '').slice(0, 4000);
  if (/\b(attached|enclosed|please find|see attachment|attachment)\b|مرفق/i.test(b) && !atts.some(a => !a.inline)) f.push({ kind: 'missing_attachment', detail: 'The email mentions an attachment but none was provided with it.', source: 'BODY', local: true });
  return f;
}

return {
  pad, uid, isoDate, todayISO, addDays, dayDiff, validISO, extOf, clip, utf8len, compactRange,
  parseEml, readMsgFromCfb, unwrapForward, b64urlToBytes, findHeaderBlock, decompressRTF, rtfToText, parsePasted, htmlToText, tidyText, decodeMimeWords, parseParams,
  normSubject, threadKey, kindOf, KIND_LABEL, extract, need, guessMime, firstEmail,
  WORK_TYPES, DISCIPLINES, buildCategorizePrompt,
  makeMasker, buildPrompt, normalizeAnalysis, verifyEvidence, normMatch, findDuplicate, relatedOpenTasks, localFlags, tokens, jaccard,
  RTF_PREBUF,
};
})();
if (typeof module !== 'undefined') module.exports = ETM;
