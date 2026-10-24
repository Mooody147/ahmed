/* ---------- line icons in place of emoji ---------- */
// Screens are written with emoji as short-hands; deco() swaps each for a line icon of one style
// when the HTML is put on screen. Text inside tags, attributes, <textarea>, <option>, <title>,
// <script> and <style> is left alone, so what people type is never changed.
const ICON_PATHS = {
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.2a2.6 2.6 0 0 1 5 .9c0 1.7-2.5 2.4-2.5 3.9M12 17.2h.01"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"/>',
  map: '<circle cx="5.5" cy="12" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/><path d="M8 12h3.5c2 0 2.5-6.5 4.5-6.5M11.5 12c2 0 2.5 6.5 4.5 6.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  message: '<path d="M4 5h16v11H9l-5 4z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  pencil: '<path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z"/><path d="m13.5 7 3 3"/>',
  send: '<path d="M21 3 10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16.2 9.5"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7 2.5 13a3 3 0 0 0 5 0zM19 7l-2.5 6a3 3 0 0 0 5 0z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  ruler: '<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  critical: '<path d="M8.5 3h7L21 8.5v7L15.5 21h-7L3 15.5v-7z"/><path d="M12 8v5M12 16.2h.01"/>',
  high: '<path d="M12 5 21 19H3z"/>',
  medium: '<path d="M12 4l8 8-8 8-8-8z"/>',
  low: '<rect x="7" y="7" width="10" height="10" rx="2"/>',
  stack: '<path d="M4 8.5 12 4l8 4.5-8 4.5z"/><path d="m4 12.5 8 4.5 8-4.5M4 16.5 12 21l8-4.5"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.3"/>',
  topic: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><path d="M16.5 13.5v6M13.5 16.5h6"/>',
  flame: '<path d="M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-3.5-8.5-1.5 2-2 3-2 4.5-1-1-1.5-2.5-1.5-4C8 9 6 11.5 6 15a6 6 0 0 0 6 6z"/>',
  alarm: '<circle cx="12" cy="13" r="7"/><path d="M12 9.5V13l2.5 2M4.5 5 7 3M19.5 5 17 3"/>',
  infinity: '<path d="M8.5 9a3 3 0 1 0 0 6c2.5 0 4.5-6 7-6a3 3 0 1 1 0 6c-2.5 0-4.5-6-7-6z"/>',
  party: '<path d="m4 20 4-11 7 7z"/><path d="M13 3c.5 1.5-.5 3-2 3.5M20 11c-1.5-.5-3 .5-3.5 2M16 4l.5 1.5M19.5 7.5 21 8M18 3l1 1"/>',
  pin: '<path d="M9 3h6l-1 6 3 3H7l3-3z"/><path d="M12 15v6"/>',
  hourglass: '<path d="M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9"/>',
  blocked: '<circle cx="12" cy="12" r="9"/><path d="m5.6 5.6 12.8 12.8"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  pause: '<path d="M8.5 5v14M15.5 5v14"/>',
  next: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  hand: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-1.5-7-5l-1.5-3a1.5 1.5 0 0 1 2.6-1.4L8 14"/>',
  clipboard: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5h6v3H9zM8.5 12h7M8.5 16h5"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
  board: '<rect x="3.5" y="4" width="7" height="16" rx="1.5"/><rect x="13.5" y="4" width="7" height="10" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  manager: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3.5 12.5h17"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8L3.5 9.7l5.9-.8z"/>',
  new: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.3-4.6L4 8"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.6L20 16"/><path d="M20 20v-4h-4"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9S9.5 5.5 12 3z"/>',
  carried: '<path d="M5 4v7a4 4 0 0 0 4 4h10"/><path d="m15 11 4 4-4 4"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  sparkles: '<path d="M10 3.5 11.6 8 16 9.6 11.6 11.2 10 15.5 8.4 11.2 4 9.6 8.4 8z"/><path d="M17.5 13.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  focus: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  doc: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/>',
  tools: '<path d="M14.5 6.5a4 4 0 0 0-5.3 5L4 16.7 7.3 20l5.2-5.2a4 4 0 0 0 5-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M3 3l18 18M10.6 6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.1 9.5 6.1a17 17 0 0 1-2.9 3.6M6.6 7.2C4.1 8.8 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.6 0 3-.4 4.2-1"/><path d="M9.9 10a3 3 0 0 0 4.1 4.1"/>',
  print: '<path d="M7 9V3.5h10V9M7 17H4.5v-6.5a1.5 1.5 0 0 1 1.5-1.5h12a1.5 1.5 0 0 1 1.5 1.5V17H17"/><rect x="7" y="14" width="10" height="7" rx="1"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  keyboard: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M8 14h8"/>',
  present: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M10 8v4.5L14 10z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1 0 1.5-.7 1.5-1.4 0-1.2-1-1.6-1-2.6 0-.9.7-1.5 1.6-1.5H16a4.5 4.5 0 0 0 4.5-4.5c0-3.9-3.8-7-8.5-7z"/><circle cx="7.5" cy="11.5" r="1"/><circle cx="10" cy="7.5" r="1"/><circle cx="14.5" cy="7.5" r="1"/>',
  bot: '<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5"/>',
  equipment: '<circle cx="12" cy="12" r="3.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="7" y="7" width="10" height="10" rx="5"/>',
};
const EMOJI_ICON = {
  '❓': 'help', '📁': 'folder', '🔗': 'link', '🧠': 'map', '🧭': 'compass', '💬': 'message', '🔍': 'search', '🔎': 'search', '✏': 'pencil', '✎': 'pencil',
  '📤': 'send', '✅': 'ok', '⚖': 'scale', '🔔': 'bell', '📅': 'calendar', '📆': 'calendar', '🗓': 'calendar', '📐': 'ruler', '🚨': 'critical', '🔺': 'high',
  '🔷': 'medium', '▫': 'low', '🗂': 'stack', '🏷': 'tag', '🧩': 'topic', '🔥': 'flame', '⏰': 'alarm', '♾': 'infinity', '🎉': 'party', '📌': 'pin',
  '⏳': 'hourglass', '⛔': 'blocked', '▶': 'play', '⏸': 'pause', '👉': 'next', '🌤': 'sun', '👋': 'hand', '📋': 'clipboard', '📬': 'inbox', '▦': 'board',
  '☰': 'list', '👔': 'manager', '⭐': 'star', '🆕': 'new', '🔄': 'refresh', '📨': 'mail', '🌐': 'globe', '↪': 'carried', '✕': 'x', '✨': 'sparkles',
  '💡': 'bulb', '🙋': 'user', '📝': 'note', '✓': 'check', 'ℹ': 'info', '↺': 'undo', '🕒': 'clock', '🎯': 'focus', '📊': 'chart', '📄': 'doc',
  '🛠': 'tools', '🔒': 'lock', '👁': 'eye', '🖨': 'print', '⬇': 'download', '🗑': 'trash', '⌨': 'keyboard', '🖥': 'present', '🖼': 'image', '⚙': 'gear',
  '🎨': 'palette', '🤖': 'bot', '⚙️': 'gear', '🔩': 'equipment',
};
const ICON_TONE = { flame: 'crit', critical: 'crit', blocked: 'crit', high: 'high', star: 'warn', ok: 'ok', party: 'ok', alarm: 'warn', hourglass: 'wait', manager: 'wait', medium: 'med', low: 'low', bulb: 'warn', sparkles: 'accent', pin: 'accent' };
const icoCache = new Map();
function ico(name, extra) {
  const k = name + '|' + (extra || '');
  if (icoCache.has(k)) return icoCache.get(k);
  const d = ICON_PATHS[name]; if (!d) return '';
  const v = `<svg class="ei${ICON_TONE[name] ? ' t-' + ICON_TONE[name] : ''}${extra ? ' ' + extra : ''}" width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  icoCache.set(k, v); return v;
}
const EMOJI_RE = new RegExp('(' + Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\\uFE0F?', 'gu');
const RAW_TAGS = /^<(textarea|option|title|script|style)\b/i;
function deco(html) {
  if (!html || typeof html !== 'string') return html;
  let out = '', raw = null;
  for (const part of html.split(/(<[^>]*>)/)) {
    if (!part) continue;
    if (part[0] === '<') {
      out += part;
      // workbook sheets and other raw regions keep their text exactly
      if (part === '<!--raw-->') { raw = '!raw'; continue; } if (part === '<!--/raw-->') { raw = null; continue; }
      if (raw === '!raw') continue;
      if (raw) { if (new RegExp('^</' + raw + '\\b', 'i').test(part)) raw = null; }
      else { const m = RAW_TAGS.exec(part); if (m && !/\/>$/.test(part)) raw = m[1]; }
      continue;
    }
    out += raw ? part : part.replace(EMOJI_RE, (_, e) => ico(EMOJI_ICON[e] || EMOJI_ICON[e.replace(/️/g, '')]) || e);
  }
  return out;
}
