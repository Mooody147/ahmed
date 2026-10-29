(() => {
'use strict';
const E = ETM;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'local'; } })();
const nowISO = () => new Date().toISOString();
// Desktop build: platform.js adds window.claude.desktop (Electron). Absent in the web/artifact build.
const DK = (typeof window !== 'undefined' && window.claude && window.claude.desktop) || null;
const DESKTOP = !!DK;
// a second window of the desktop app (tray "Today" window or a pop-out): it shows data but runs no background jobs
const SUBWIN = typeof location !== 'undefined' && /[?&](mini|popout)=1/.test(location.search);

/* ---------- icons ---------- */
const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
  review: svg('<path d="M4 4h16v12H5.5L4 17.5z"/><path d="m8.5 10 2.2 2.2L15.5 7.5"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  mail: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', 16),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
  x: svg('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: svg('<path d="m5 12 4.5 4.5L19 7"/>', 14),
  alert: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>'),
  ok: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>'),
  file: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>', 16),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', 16),
  clip: svg('<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7L14 4a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4L15.5 7"/>', 14),
  download: svg('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>', 16),
  trash: svg('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>', 16),
  back: svg('<path d="m15 18-6-6 6-6"/>'),
  brand: svg('<path d="M12 3c3.3 4 6 7.2 6 10.4a6 6 0 0 1-12 0C6 10.2 8.7 7 12 3z"/><path d="m9.3 13.6 1.9 1.9 3.6-4.1"/>', 18),
  spark: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>', 16),
};

/* ---------- constants ---------- */
const PRIO = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const PRIO_CLS = { critical: 'crit', high: 'high', medium: 'med', low: 'low' };
const PRIO_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const STATUS = { todo: 'To do', in_progress: 'In progress', waiting: 'Waiting', blocked: 'Blocked', done: 'Done' };
const STATUS_CLS = { todo: '', in_progress: 'accent', waiting: 'wait', blocked: 'crit', done: 'ok' };
const OWNERSHIP = { mine: 'Mine', waiting: 'Waiting on others', fyi: 'For information' };
const CATEGORY = { submittal_review: 'Submittal review', technical_query: 'Technical query', rfq_tender: 'RFQ / tender', design_coordination: 'Design coordination', vendor_comments: 'Vendor comments', meeting: 'Meeting', approval_request: 'Approval request', site_issue: 'Site issue', info_only: 'For information', other: 'Other' };
const CHECK = { verified: 'Verified', partial: 'Partly matched', visual: 'Read from image', not_found: 'Not found in source', unknown_source: 'Source unclear', no_quote: 'No quote' };
const FLAG = { missing_attachment: 'Missing attachment', unreadable: 'Not readable', truncated: 'Partly analysed', ambiguous: 'Ambiguous', uncertain_deadline: 'Deadline uncertain', conflict: 'Conflicting instructions', owner_unclear: 'Owner unclear', revision_mismatch: 'Revision mismatch', excluded: 'Not sent', images: 'Images not sent' };
/* ---------- state ---------- */
const DEFAULTS = { me: { name: '', emails: [], aliases: '', role: 'Mechanical design engineer — water & wastewater treatment', org: '', scope: '', manager: '' }, projects: [], tier: 'auto', mask: false, storeText: true, vision: true, drawings: true, titleBlocks: true, maxPageImages: 8, setupDone: false };
const St = { mcp: null, mode: 'starting', uid: null, refs: null, db: null, tasks: new Map(), emails: new Map(), board: new Map(), daily: new Map(), layout: { off: {}, size: {} }, settings: clone(DEFAULTS), ready: false, profileName: '', sample: null, limits: null, downloads: null, capsResolved: false };
const UI = { view: 'todo', todoQ: '', drawer: null, staging: [], analyzing: false, abort: null, pasteOpen: false, emailQ: '', previews: new Set(), confirm: null };

function mergeSettings(d) {
  const s = Object.assign(clone(DEFAULTS), d || {});
  s.me = Object.assign(clone(DEFAULTS.me), (d && d.me) || {});
  if (!Array.isArray(s.me.emails)) s.me.emails = String(s.me.emails || '').split(/[,;\s]+/).filter(Boolean);
  if (!Array.isArray(s.projects)) s.projects = [];
  return s;
}

/* ---------- persistence ---------- */
const LS_KEY = 'action-register-v1';
const LS_TEXT = 'action-register-texts-v1';
// Every save or delete of one record goes through one queue per record: one write at a time (as the store asks),
// the newest change wins, and a delete is never overtaken by an older save. A few records are written at once, so
// erasing or undoing many items does not hit the store's limit on concurrent writes. Until the store shows a change,
// snapshots keep showing it too (PEND), so a late snapshot cannot bring back a deleted note or reverse an undo.
const inflight = new Map(), queued = new Map(), PEND = new Map(), slotWait = [];
let slotsBusy = 0;
const slot = () => slotsBusy < 4 ? (slotsBusy++, Promise.resolve()) : new Promise(r => slotWait.push(r));
const slotFree = () => { const r = slotWait.shift(); if (r) r(); else slotsBusy--; };
function writeDoc(ref, data) {
  const k = ref.path;
  PEND.set(k, { data, at: 0 });
  if (inflight.has(k)) { queued.set(k, { ref, data }); return inflight.get(k); }
  const p = (async () => {
    await slot(); let ok = false;
    try {
      for (let i = 0; ; i++) {
        try { await (data === null ? ref.delete() : ref.set(data)); ok = true; break; }
        catch (e) {
          const c = e && e.code;
          if ((c === 'unavailable' || c === 'resource_exhausted') && i < 3) { await new Promise(r => setTimeout(r, (c === 'unavailable' ? 600 : 1500) * (i + 1) + Math.random() * 900)); continue; }
          dbError(e); break;
        }
      }
    } finally {
      slotFree(); inflight.delete(k);
      const q = queued.get(k);
      if (q) { queued.delete(k); writeDoc(q.ref, q.data); }
      else { const pd = PEND.get(k); if (pd && ok) pd.at = Date.now(); else if (pd) PEND.delete(k); }
    }
  })();
  inflight.set(k, p);
  return p;
}
const delDoc = ref => writeDoc(ref, null);
// the store's copy has caught up with a pending change once it shows the same save (or the record is gone)
const pendAgrees = (srv, data) => data === null ? !srv : !!srv && (data.updatedAt ? srv.updatedAt === data.updatedAt : JSON.stringify(srv) === JSON.stringify(data));
function pendKeep(k, srv) {
  const p = PEND.get(k); if (!p) return false;
  if (p.at && (pendAgrees(srv, p.data) || Date.now() - p.at > 30000)) { PEND.delete(k); return false; }
  return true;
}
// a collection snapshot as a Map, with this page's own changes that the store does not show yet laid on top
function snapMap(col, s) {
  const m = new Map(s.docs.map(d => [d.id, { ...clone(d.data()), id: d.id }]));
  const pre = col.path + '/';
  for (const [k, p] of [...PEND]) {
    if (!k.startsWith(pre) || k.indexOf('/', pre.length) >= 0) continue;
    const id = k.slice(pre.length);
    if (!pendKeep(k, m.get(id))) continue;
    if (p.data === null) m.delete(id); else m.set(id, p.data);
  }
  return m;
}
function snapDoc(ref, d) {
  const srv = d.exists ? clone(d.data()) : null;
  return pendKeep(ref.path, srv) ? PEND.get(ref.path).data : srv;
}
function dbError(e) {
  const c = e && e.code;
  if (c === 'quota_exceeded') toast('Storage is full. Delete old email records (Emails › open › Delete record) to free space.', { err: true });
  else if (c === 'invalid_argument') toast('A record was too large to save. Turn off “Keep extracted text” in Setup, or delete large email records.', { err: true });
  else if (c === 'revoked') toast('Saving stopped: access to this page changed. Reload the page.', { err: true });
  else toast('Could not save a change (' + (c || 'error') + '). It will be retried on your next edit.', { err: true });
}
let lsTimer = null;
function saveLocal() {
  if (St.mode === 'viewer') return;   // someone viewing a shared canvas changes nothing
  clearTimeout(lsTimer);
  lsTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ tasks: [...St.tasks.values()], emails: [...St.emails.values()], settings: St.settings, board: [...St.board.values()], daily: [...St.daily.values()], layout: St.layout, cols: Object.fromEntries(COLS.map(n => [n, colList(n)])) })); }
    catch { toast('This browser refused to save (storage full or blocked). Export a backup from Setup.', { err: true }); }
  }, 250);
}
function putTask(t) {
  t.updatedAt = nowISO();
  const before = St.tasks.get(t.id);
  St.tasks.set(t.id, t); FRESH.set(t.id, Date.now());
  runHooks('taskChanged', before || null, t);
  if (St.mode === 'db') writeDoc(St.refs.tasks.doc(t.id), t); else saveLocal();
}
function delTask(id) {
  if (St.tasks.has(id)) runHooks('deleted', 'task', St.tasks.get(id));
  St.tasks.delete(id);
  if (St.mode === 'db') delDoc(St.refs.tasks.doc(id)); else saveLocal();
}
function putEmail(e) {
  St.emails.set(e.id, e);
  if (St.mode === 'db') writeDoc(St.refs.emails.doc(e.id), e); else saveLocal();
}
function delEmail(id) {
  if (St.emails.has(id)) runHooks('deleted', 'email', St.emails.get(id));
  St.emails.delete(id);
  if (St.mode === 'db') { delDoc(St.refs.emails.doc(id)); delDoc(St.refs.texts.doc(id)); }
  else { saveLocal(); try { const m = JSON.parse(localStorage.getItem(LS_TEXT) || '{}'); delete m[id]; localStorage.setItem(LS_TEXT, JSON.stringify(m)); } catch {} }
}
// canvas elements, canvas layout overrides and daily-tracker entries
const FRESH = new Map();
function putBoard(el) { el.updatedAt = nowISO(); St.board.set(el.id, el); if (St.mode === 'db') writeDoc(St.refs.board.doc(el.id), el); else saveLocal(); }
function delBoard(id) { St.board.delete(id); if (St.mode === 'db') delDoc(St.refs.board.doc(id)); else saveLocal(); }
function putLayout(l) { St.layout = l; if (St.mode === 'db') writeDoc(St.refs.layout, l); else saveLocal(); }
function putDaily(d) { d.updatedAt = nowISO(); St.daily.set(d.id, d); if (St.mode === 'db') writeDoc(St.refs.daily.doc(d.id), d); else saveLocal(); }
function delDaily(id) { St.daily.delete(id); if (St.mode === 'db') delDoc(St.refs.daily.doc(id)); else saveLocal(); }
const mergeLayout = l => ({ off: {}, offv: {}, size: {}, ...(l || {}) });
// further collections used by feature files: document register, time log, lessons, recycle bin, learned preferences
const COLS = ['docreg', 'time', 'lessons', 'trash', 'prefs'];
St.cols = Object.fromEntries(COLS.map(n => [n, new Map()]));
const colList = n => [...St.cols[n].values()];
function colPut(n, d) { d.updatedAt = nowISO(); St.cols[n].set(d.id, d); if (St.mode === 'db') writeDoc(St.refs.cols[n].doc(d.id), d); else saveLocal(); }
function colDel(n, id) { St.cols[n].delete(id); if (St.mode === 'db') delDoc(St.refs.cols[n].doc(id)); else saveLocal(); }
// feature files register their own collections before the data loads
function addCols(...names) { for (const n of names) if (!COLS.includes(n)) { COLS.push(n); St.cols[n] = new Map(); } }
function putSettings(s) {
  St.settings = s;
  if (St.mode === 'db') writeDoc(St.refs.settings, s); else saveLocal();
}
async function putTexts(id, data) {
  if (St.mode === 'db') return writeDoc(St.refs.texts.doc(id), data);
  try {
    const m = JSON.parse(localStorage.getItem(LS_TEXT) || '{}');
    const small = { body: E.clip(data.body, 20000), atts: data.atts.map(a => ({ name: a.name, text: E.clip(a.text, 15000) })), trimmed: true };
    m[id] = small;
    const keys = Object.keys(m); while (keys.length > 25) delete m[keys.shift()];
    localStorage.setItem(LS_TEXT, JSON.stringify(m));
  } catch {}
}
async function getTexts(id) {
  if (St.mode === 'db') { try { const d = await St.refs.texts.doc(id).get(); return d.exists ? d.data() : null; } catch { return null; } }
  try { return JSON.parse(localStorage.getItem(LS_TEXT) || '{}')[id] || null; } catch { return null; }
}

async function initStore() {
  const hasClaude = typeof window.claude !== 'undefined' && window.claude && typeof window.claude.use === 'function';
  let db = null, user = null;
  if (hasClaude) {
    const safe = p => Promise.resolve(p).catch(() => null);
    [db, user, St.sample, St.downloads, St.mcp] = await Promise.all([safe(claude.use('db')), safe(claude.use('user')), safe(claude.use('sample')), safe(claude.use('downloads')), safe(claude.use('mcp'))]);
    if (St.sample) St.limits = await St.sample.limits().catch(() => null);
    if (user) { try { const me = await user.me(); St.profileName = me.name || ''; St.uid = me.id || await user.id(); } catch {} }
  }
  St.capsResolved = true;
  // anyone but the owner who opens a shared link sees the canvas the owner shared, read-only (features/25-share.js)
  if (db && user && typeof initViewer === 'function' && (await Promise.resolve(user.isOwner()).catch(() => true)) === false) return initViewer(db, user);
  if (db && St.uid) {
    St.db = db; St.mode = 'db';
    const base = db.doc('data/users/' + St.uid + '/register');
    St.refs = { tasks: base.collection('tasks'), emails: base.collection('emails'), texts: base.collection('texts'), board: base.collection('board'), daily: base.collection('daily'), settings: db.doc('data/users/' + St.uid + '/settings'), layout: db.doc('data/users/' + St.uid + '/canvaslayout'), seen: db.doc('data/users/' + St.uid + '/gmailseen') };
    let got = 0; const done = () => { if (++got >= 3 && !St.ready) { St.ready = true; setTimeout(() => { maybeAutoCheck(); if (UI.view === 'todo') maybeAutoCategorize(); runHooks('ready'); }, 300); } render(); };
    const fail = e => { if (e && e.code === 'revoked') toast('Access to saved data ended for this view. Reload the page.', { err: true }); else toast('Live sync stopped (' + (e && e.code || 'error') + '). Reload to reconnect.', { err: true }); };
    St.refs.tasks.onSnapshot(s => { St.tasks = snapMap(St.refs.tasks, s); if (!St._t) { St._t = 1; done(); } else scheduleRender(); }, fail);
    St.refs.emails.onSnapshot(s => { St.emails = snapMap(St.refs.emails, s); if (!St._e) { St._e = 1; done(); } else scheduleRender(); }, fail);
    St.refs.settings.onSnapshot(d => { St.settings = mergeSettings(snapDoc(St.refs.settings, d)); if (!St._s) { St._s = 1; done(); } else scheduleRender(); }, fail);
    St.refs.board.onSnapshot(s => { St.board = snapMap(St.refs.board, s); scheduleRender(); }, fail);
    St.refs.daily.onSnapshot(s => { St.daily = snapMap(St.refs.daily, s); scheduleRender(); }, fail);
    St.refs.layout.onSnapshot(d => { St.layout = mergeLayout(snapDoc(St.refs.layout, d)); scheduleRender(); }, fail);
    St.refs.cols = {};
    for (const n of COLS) { St.refs.cols[n] = base.collection(n); St.refs.cols[n].onSnapshot(s => { St.cols[n] = snapMap(St.refs.cols[n], s); scheduleRender(); }, fail); }
  } else {
    St.mode = 'local';
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) { (raw.tasks || []).forEach(t => St.tasks.set(t.id, t)); (raw.emails || []).forEach(e => St.emails.set(e.id, e)); (raw.board || []).forEach(b => St.board.set(b.id, b)); (raw.daily || []).forEach(d => St.daily.set(d.id, d)); St.layout = mergeLayout(raw.layout); for (const n of COLS) (raw.cols && raw.cols[n] || []).forEach(d => St.cols[n].set(d.id, d)); St.settings = mergeSettings(raw.settings); }
    } catch {}
    St.ready = true; render(); setTimeout(() => { maybeAutoCheck(); if (UI.view === 'todo') maybeAutoCategorize(); runHooks('ready'); }, 300);
  }
}
function maybeAutoCheck() { if (GM.autoDone || SUBWIN) return; GM.autoDone = true; const g = gmCfg(); if (St.mcp && g.address && g.autoCheck) checkGmail(false); }

/* ---------- derived ---------- */
const T = () => E.todayISO();
const isMine = t => t.ownership !== 'waiting' && t.ownership !== 'fyi' && (!t.owner || /^me$/i.test(t.owner) || t.ownership === 'mine');
const isOpen = t => t.status !== 'done';
function counts() { return { review: [...St.emails.values()].filter(e => e.reviewState === 'pending').length }; }
function projectsList() {
  const set = new Map();
  St.settings.projects.forEach(p => set.set((p.code || p.name).toLowerCase(), p.code || p.name));
  for (const t of St.tasks.values()) if (t.project) { const k = t.project.toLowerCase(); if (!set.has(k)) set.set(k, t.project); }
  return [...set.values()].sort((a, b) => a.localeCompare(b));
}
function nextRefs(n) {
  let max = 0; for (const t of St.tasks.values()) { const m = /T-(\d+)/.exec(t.ref || ''); if (m) max = Math.max(max, +m[1]); }
  return Array.from({ length: n }, (_, i) => 'T-' + String(max + 1 + i).padStart(4, '0'));
}
function fmtDate(iso, opts = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const d = iso.length === 10 ? new Date(iso + 'T12:00:00') : new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(DLOC(), opts);
}
// dates in the interface language (Arabic month names with Western digits, as used in engineering documents)
const DLOC = () => (typeof document !== 'undefined' && document.documentElement.lang === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB');
function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; return d.toLocaleString(DLOC(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
function dueInfo(t) {
  if (!t.deadline) return { txt: t.deadlineText ? 'Date unclear' : 'No date', cls: 'none' };
  const d = E.dayDiff(T(), t.deadline);
  if (t.status === 'done') return { txt: fmtDate(t.deadline), cls: 'none' };
  if (d < 0) return { txt: (-d) + (d === -1 ? ' day' : ' days') + ' overdue', cls: 'over' };
  if (d === 0) return { txt: 'Today', cls: 'today' };
  if (d === 1) return { txt: 'Tomorrow', cls: 'soon' };
  if (d < 7) return { txt: fmtDate(t.deadline, { weekday: 'short', day: 'numeric', month: 'short' }), cls: 'soon' };
  return { txt: fmtDate(t.deadline, { day: 'numeric', month: 'short', year: d > 300 ? 'numeric' : undefined }), cls: '' };
}
function bucketOf(t) {
  if (t.status === 'done') return 'Done';
  if (!t.deadline) return 'No deadline';
  const d = E.dayDiff(T(), t.deadline);
  if (d < 0) return 'Overdue'; if (d === 0) return 'Today'; if (d <= 7) return 'Next 7 days'; if (d <= 30) return 'Within 30 days'; return 'Later';
}
const BUCKETS = ['Overdue', 'Today', 'Next 7 days', 'Within 30 days', 'Later', 'No deadline', 'Done'];

/* ---------- render scheduling ---------- */
let rq = null;
function scheduleRender() { if (rq) return; rq = requestAnimationFrame(() => { rq = null; render(); }); }
// a full re-render would destroy the canvas element being dragged or edited, so it waits until that ends
const cvHold = () => (UI.view === 'todo' && (!!UI.cvEditing || (!!MP.mode && MP.mode !== 'pinch'))) || !!(document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('hold-render'));
// a render skipped while you typed in a held box happens when you leave it
document.addEventListener('focusout', e => { if (UI.cvPending && e.target && e.target.classList && e.target.classList.contains('hold-render')) setTimeout(() => { if (UI.cvPending && !cvHold()) { UI.cvPending = false; render(); } }, 0); });
function keepFocus(fn) {
  const a = document.activeElement; const id = a && a.id; let ss = null, se = null;
  try { ss = a.selectionStart; se = a.selectionEnd; } catch {}
  fn();
  if (id) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (ss !== null) n.setSelectionRange(ss, se); } catch {} } }
}
// a redraw can remove a field that still had focus; its change/blur handlers must not redraw inside this one
let rendering = false;
function render() {
  if (rendering) { scheduleRender(); return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
}
function renderNow() {
  if (cvHold()) { UI.cvPending = true; return; }
  runHooks('beforeRender');
  const c = counts();
  document.querySelectorAll('[data-nav]').forEach(b => b.setAttribute('aria-current', b.dataset.nav === UI.view ? 'page' : 'false'));
  const rc = c.review;
  document.querySelectorAll('[data-count="review"]').forEach(n => { n.textContent = rc || ''; n.hidden = !rc; n.classList.toggle('hot', rc > 0); });
  const tc = [...St.tasks.values()].filter(t => t.status !== 'done' && isMine(t) && t.status !== 'waiting').length;
  document.querySelectorAll('[data-count="todo"]').forEach(n => { n.textContent = tc || ''; n.hidden = !tc; });
  const sm = $('#storage-mode');
  if (sm) sm.innerHTML = St.mode === 'db' ? (DESKTOP ? '<span class="dot"></span>Saved on this computer · private to you' : '<span class="dot"></span>Saved to your Claude account · private to you') : St.mode === 'local' ? '<span class="dot local"></span>Saved in this browser only' : '<span class="dot off"></span>Connecting…';
  keepFocus(() => {
    const main = $('#main');
    if (!St.ready) { main.innerHTML = `<div class="wrap"><div class="empty"><div class="progress indet" style="width:180px"><i></i></div><p>Opening your register…</p></div></div>`; return; }
    main.innerHTML = deco((VIEW_FN[UI.view] || viewTodo)());
  });
  if (UI.view === 'todo' && UI.todoMode === 'map') afterMapRender();
  document.querySelectorAll('#main textarea.autogrow').forEach(autosize);
  if (UI.drawer && UI.drawer.kind === 'email' && UI.drawer.dirty) renderDrawer();
  if (St.ready) runHooks('afterRender');
}

/* ---------- shared fragments ---------- */
function chipPrio(p) { return `<span class="chip ${PRIO_CLS[p] || 'low'}">${esc(PRIO[p] || p)}</span>`; }
function chipStatus(s) { return `<span class="chip ${STATUS_CLS[s] || ''}">${esc(STATUS[s] || s)}</span>`; }
function callout(kind, html) { const ic = { warn: I.alert, info: I.info, ok: I.ok, crit: I.alert }[kind]; return `<div class="callout ${kind}">${ic}<div>${html}</div></div>`; }
function evidenceHTML(list, withEmailLink) {
  if (!list || !list.length) return `<p class="muted small">No evidence recorded.</p>`;
  return `<div class="evidence">${list.map(e => `
    <div class="ev">
      <div class="ev-h"><span class="ev-badge ${esc(e.check || 'no_quote')}">${esc(CHECK[e.check] || 'Unchecked')}</span>
        <span>${esc(e.sourceName || e.source || '')}</span>${e.location ? `<span class="loc">${esc(e.location)}</span>` : ''}
        ${e.quote && e.emailId && St.emails.has(e.emailId) ? `<button class="btn ghost sm" data-act="ev-view" data-email="${esc(e.emailId)}" data-src="${esc(e.source || '')}" data-name="${esc(e.sourceName || '')}" data-q="${esc(e.quote)}" title="Show the quote highlighted in the email or attachment">🔎 In source</button>` : ''}
        ${withEmailLink && e.emailId && St.emails.has(e.emailId) ? `<button class="btn ghost sm" data-act="open-email" data-id="${esc(e.emailId)}">Open email</button>` : ''}</div>
      ${e.quote ? `<q dir="auto">${esc(e.quote)}</q>` : ''}
    </div>`).join('')}</div>`;
}
function srcLine(t) {
  const e = (t.evidence || []).find(x => x.source && x.source !== 'BODY') || (t.evidence || [])[0];
  if (!e) return t.sourceSubject ? `<span class="src">${I.mail ? '' : ''}${esc(t.sourceSubject)}</span>` : '';
  const loc = e.location ? ' · ' + e.location : '';
  return `<span class="src" title="${esc((e.sourceName || '') + loc)}">${e.source && e.source !== 'BODY' ? I.clip + ' ' : ''}${esc((e.source === 'BODY' ? 'Email: ' + (t.sourceSubject || 'body') : e.sourceName || '') + loc)}</span>`;
}

/* ---------- shared rows ---------- */
function taskRow(t) {
  const d = dueInfo(t);
  const who = !isMine(t) ? `<span>${esc(t.status === 'waiting' || t.ownership === 'waiting' ? 'Waiting on ' : 'Owner: ')}${esc(t.owner || 'someone')}</span>` : '';
  return `<div class="trow p-${esc(t.priority || 'medium')} ${t.status === 'done' ? 'is-done' : ''}" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0">
    <span class="stripe"></span>
    <button class="tick" data-act="toggle-done" data-id="${esc(t.id)}" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}">${I.check}</button>
    <div class="tmain"><div class="ttl" dir="auto">${esc(t.title)}</div>
      <div class="tmeta"><span class="ref">${esc(t.ref || '')}</span>${t.project ? `<span class="chip proj">${esc(t.project)}</span>` : ''}${who}${srcLine(t)}</div></div>
    <div class="tside"><span class="due ${d.cls}">${esc(d.txt)}</span>${t.status !== 'todo' ? chipStatus(t.status) : chipPrio(t.priority)}</div>
  </div>`;
}
function setupCardHTML() {
  const me = St.settings.me;
  return `<div class="card pad" style="display:grid;gap:12px">
    <div class="section-title"><h2>Who are you in these emails?</h2></div>
    <p class="muted" style="margin:0">The assistant uses this to tell your actions apart from other people's. Add the addresses your colleagues write to.</p>
    <div class="grid2">
      <label class="field"><span>Your name</span><input class="input" id="su-name" value="${esc(me.name || St.profileName)}" placeholder="e.g. Mahmoud Sobeah"></label>
      <label class="field"><span>Work email address(es)</span><input class="input" id="su-emails" value="${esc(me.emails.join(', '))}" placeholder="name@company.com"></label>
      <label class="field"><span>Role</span><input class="input" id="su-role" value="${esc(me.role)}"></label>
      <label class="field"><span>Company / team</span><input class="input" id="su-org" value="${esc(me.org)}" placeholder="e.g. Contractor — mechanical design"></label>
    </div>
    <div class="row end"><button class="btn ghost" data-act="nav" data-view="setup">More options</button><button class="btn primary" data-act="save-quick-setup">Save</button></div>
  </div>`;
}

/* ---------- task drawer ---------- */
function openDrawer(kind, id) { if (St.mode === 'viewer') return; UI.drawer = { kind, id }; renderDrawer(); }
function closeDrawer() { UI.drawer = null; $('#drawer').hidden = true; $('#scrim').hidden = true; document.body.style.overflow = ''; }
function renderDrawer() {
  const dr = UI.drawer; if (!dr) return closeDrawer();
  const el = $('#drawer');
  if (dr.kind === 'task') { const t = St.tasks.get(dr.id); if (!t) return closeDrawer(); el.innerHTML = deco(taskDrawerHTML(t)); }
  else if (dr.kind === 'email') { const e = St.emails.get(dr.id); if (!e) return closeDrawer(); el.innerHTML = deco(emailDrawerHTML(e)); dr.dirty = false; loadEmailTexts(e.id); }
  else if (DRAWER_FN[dr.kind]) { const h = DRAWER_FN[dr.kind](dr); if (h == null) return closeDrawer(); el.innerHTML = deco(h); }
  el.hidden = false; $('#scrim').hidden = false; document.body.style.overflow = 'hidden';
  const ta = el.querySelector('.title-edit'); if (ta) autosize(ta);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function taskDrawerHTML(t) {
  const projs = projectsList();
  const basis = t.deadlineBasis === 'uncertain' ? '<span class="chip warn">Uncertain</span>' : t.deadlineBasis === 'relative' ? '<span class="chip">Calculated</span>' : t.deadlineBasis === 'explicit' ? '<span class="chip ok">Stated</span>' : '';
  const emails = (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean);
  return `<div class="drawer-h"><span class="mono muted">${esc(t.ref || '')}</span>${chipPrio(t.priority)}<span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b two"><div class="dcol-main">
    <textarea class="title-edit" id="d-title" rows="1" data-chg="task-field" data-field="title" dir="auto" aria-label="Title">${esc(t.title)}</textarea>
    ${mailDateLine(t)}
    ${typeof threadHistHTML === 'function' ? threadHistHTML(St.emails.get((t.emailIds || [])[(t.emailIds || []).length - 1]) || { conv: taskConvs(t)[0] }, { task: t }) : ''}
    ${t.placement && t.placement.status !== 'confirmed' && (t.placement.options || []).length ? `<details class="small wrong-place"><summary class="muted">Wrong place? Other places Claude considered</summary><div style="display:grid;gap:6px;margin-top:8px">${(t.placement.options || []).map((o, i) => { const r = o.relatedTaskId && St.tasks.get(o.relatedTaskId); return `<button class="btn sm opt-btn" data-act="use-placement" data-i="${i}">${o.project ? '📁 ' + esc(o.project) : ''}${o.discipline ? ' › ' + esc(E.DISCIPLINES[o.discipline]) : ''}${r ? ' · 🔗 ' + esc(r.ref) : ''}${o.reason ? `<span class="muted small"> — ${esc(o.reason)}</span>` : ''}</button>`; }).join('')}<button class="btn sm ghost" data-act="keep-placement">Keep it here${t.project ? ': ' + esc(t.project) : ''}</button></div></details>` : ''}
    <div class="seg" role="group" aria-label="Status">${Object.entries(STATUS).map(([k, v]) => `<button data-act="set-status" data-id="${esc(t.id)}" data-status="${k}" aria-pressed="${t.status === k}">${v}</button>`).join('')}</div>
    ${taskActionsHTML(t)}
    ${t.status === 'blocked' ? `<label class="field"><span>Blocked because</span><input class="input" id="d-blocked" data-chg="task-field" data-field="blockedReason" value="${esc(t.blockedReason)}" placeholder="What is stopping this?"></label>` : ''}
    <div class="grid2">
      <label class="field"><span>Deadline ${basis}</span><input class="input" type="date" id="d-deadline" data-chg="task-field" data-field="deadline" value="${esc(t.deadline || '')}"></label>
      <label class="field"><span>Priority</span><select class="input" id="d-prio" data-chg="task-field" data-field="priority">${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${t.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Project</span><input class="input" id="d-project" list="projlist" data-chg="task-field" data-field="project" value="${esc(t.project)}"><datalist id="projlist">${projs.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="field"><span>Whose action</span><select class="input" id="d-own" data-chg="task-field" data-field="ownership">${Object.entries(OWNERSHIP).map(([k, v]) => `<option value="${k}" ${t.ownership === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field"><span>Responsible</span><input class="input" id="d-owner" data-chg="task-field" data-field="owner" value="${esc(t.owner)}"></label>
      <label class="field"><span>Requested by</span><input class="input" id="d-req" data-chg="task-field" data-field="requestedBy" value="${esc(t.requestedBy)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>Category ${t.catBy === 'ai' ? '<span class="chip accent">by Claude</span>' : ''}</span><select class="input" id="d-disc" data-chg="task-field" data-field="discipline"><option value="">Not categorised</option>${Object.entries(E.DISCIPLINES).map(([k, v]) => `<option value="${k}" ${t.discipline === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <label class="field"><span>Topic ${t.topic && !t.topicLocked ? '<span class="chip accent">by Claude</span>' : ''}</span><input class="input" id="d-topic" list="topiclist" data-chg="task-field" data-field="topic" value="${esc(t.topic || '')}" placeholder="e.g. Valves specification CRS" dir="auto"><datalist id="topiclist">${allTopics().filter(x => !t.project || x.project === t.project).map(x => `<option value="${esc(x.topic)}">`).join('')}</datalist></label>
    </div>
    ${t.deadlineText ? `<div class="small muted">Deadline as written: <span dir="auto">“${esc(t.deadlineText)}”</span></div>` : ''}
    <label class="field"><span>Next step</span><input class="input" id="d-next" data-chg="task-field" data-field="nextStep" value="${esc(t.nextStep)}" dir="auto"></label>
    <label class="field"><span>What exactly is required</span><textarea class="input" id="d-action" rows="4" data-chg="task-field" data-field="action" dir="auto">${esc(t.action)}</textarea></label>
    <div class="field"><span>Items inside this task ${subsOf(t).length ? `(${subsDone(t)}/${subsOf(t).length} done)` : ''}</span>
      ${subsOf(t).length ? `<ul class="sublist edit">${subsOf(t).map(x => `<li class="${x.done ? 'done' : ''}"><button class="subtick" data-act="toggle-sub" data-id="${esc(t.id)}" data-sid="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="Toggle item">${I.check}</button><input class="input sub-in" id="sub-${esc(x.id)}" data-chg="sub-text" data-sid="${esc(x.id)}" value="${esc(x.text)}" dir="auto" aria-label="Item text"><button class="icon-btn" data-act="sub-del" data-sid="${esc(x.id)}" aria-label="Remove item">${I.x}</button></li>`).join('')}</ul>` : ''}
      <div class="row" style="flex-wrap:nowrap"><input class="input" id="d-sub-new" placeholder="Add an item (comment, drawing, document…)" dir="auto"><button class="btn sm" data-act="sub-add">Add</button></div></div>
    ${(() => {
      const out = relIds(t).map(id => St.tasks.get(id)).filter(Boolean).map(o => ({ o, dir: 'follows', a: t.id, b: o.id }));
      for (const x of St.tasks.values()) if (relIds(x).includes(t.id)) out.push({ o: x, dir: 'followed by', a: x.id, b: t.id });
      const cands = [...St.tasks.values()].filter(x => x.id !== t.id && !relIds(t).includes(x.id)).sort((a, b) => ((b.project === t.project) - (a.project === t.project)) || (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 60);
      return `<div class="field"><span>Linked tasks</span>
        ${out.length ? `<ul class="links">${out.map(x => `<li><span class="muted small">${x.dir}</span> <b class="mono">${esc(x.o.ref)}</b> <span dir="auto">${esc(E.clip(x.o.title, 70))}</span>${x.o.status === 'done' ? ' <span class="chip ok">done</span>' : ''}<span class="spacer"></span><button class="btn ghost sm" data-act="show-on-map" data-id="${esc(x.o.id)}">Map</button><button class="icon-btn" data-act="link-del" data-a="${esc(x.a)}" data-b="${esc(x.b)}" aria-label="Remove link">${I.x}</button></li>`).join('')}</ul>` : ''}
        <div class="row" style="flex-wrap:nowrap"><select class="input" id="d-link"><option value="">Link to another task…</option>${cands.map(c => `<option value="${esc(c.id)}">${esc(c.ref)} · ${esc(E.clip(c.title, 60))}${c.status === 'done' ? ' (done)' : ''}</option>`).join('')}</select><button class="btn sm" data-act="link-add">Link</button><button class="btn sm ghost" data-act="show-on-map" data-id="${esc(t.id)}">🧠 Map</button></div></div>`;
    })()}
    <label class="field"><span>Depends on</span><input class="input" id="d-dep" data-chg="task-field" data-field="dependsOn" value="${esc(t.dependsOn)}" dir="auto"></label>
    <label class="field"><span>My notes</span><textarea class="input" id="d-notes" rows="3" data-chg="task-field" data-field="notes" dir="auto">${esc(t.notes)}</textarea></label>
    </div><div class="dcol-side">
    <div><div class="label" style="margin-bottom:8px">Evidence</div>${evidenceHTML(t.evidence, true)}</div>
    ${emails.length ? `<div><div class="label" style="margin-bottom:6px">Source emails</div>${emails.map(e => `<button class="btn ghost sm" style="justify-content:flex-start;max-width:100%;overflow:hidden" data-act="open-email" data-id="${esc(e.id)}">${I.mail}<span style="overflow:hidden;text-overflow:ellipsis">${esc(e.subject || '(no subject)')}</span></button>`).join('')}</div>` : ''}
    <div><div class="label" style="margin-bottom:8px">History</div><div class="history">${(t.history || []).slice().reverse().map(h => `<div><time>${esc(fmtDate(h.at, { day: 'numeric', month: 'short' }))} ${esc(new Date(h.at).toTimeString().slice(0, 5))}</time><span dir="auto">${esc(h.text)}</span></div>`).join('')}</div></div>
    <div class="row">${UI.confirm === 'del-' + t.id ? `<span class="small">Delete this task permanently?</span><button class="btn sm danger" data-act="delete-task" data-id="${esc(t.id)}">Delete</button><button class="btn sm" data-act="cancel-confirm">Keep</button>` : `<button class="btn ghost sm danger" data-act="ask-delete-task" data-id="${esc(t.id)}">${I.trash} Delete task</button>`}</div>
  </div></div>`;
}
const FIELD_LABEL = { topic: 'Topic', discipline: 'Category', workType: 'Work type', title: 'Title', deadline: 'Deadline', priority: 'Priority', project: 'Project', ownership: 'Whose action', owner: 'Responsible', requestedBy: 'Requested by', nextStep: 'Next step', action: 'Requirement', dependsOn: 'Depends on', notes: 'Notes', blockedReason: 'Blocked reason' };
function setTaskField(id, field, value) {
  const t = clone(St.tasks.get(id)); if (!t) return;
  const old = t[field] ?? '';
  if (field === 'deadline') { value = value || null; if (value) t.deadlineBasis = 'explicit'; }
  if (String(old ?? '') === String(value ?? '')) return;
  t[field] = value;
  if (field === 'project') t.projectLocked = true;
  if (field === 'topic') { t.topicLocked = true; value = String(value || '').trim(); t.topic = value; }
  if (field === 'discipline' || field === 'workType') { t.catLocked = true; t.catBy = 'me'; value = value || null; t[field] = value; }
  if (field === 'ownership' && value === 'mine') t.owner = 'me';
  if (field === 'ownership' && value === 'waiting' && t.status === 'todo') t.status = 'waiting';
  const short = v => E.clip(String(v ?? '—') || '—', 40);
  if (!['notes', 'action'].includes(field)) (t.history = t.history || []).push({ at: nowISO(), text: `${FIELD_LABEL[field] || field}: ${field === 'deadline' ? (old ? fmtDate(old) : '—') + ' → ' + (value ? fmtDate(value) : '—') : short(old) + ' → ' + short(value)}` });
  t.history = (t.history || []).slice(-60);
  putTask(t);
  render();
  if (['deadline', 'priority', 'ownership', 'status', 'discipline', 'workType', 'topic'].includes(field)) renderDrawer();
  if (field === 'title' && !t.catBy && !t.catLocked && St.sample && value && value !== 'New task') aiCategorize([t.id], true);
}
function usePlacement(id, i) {
  const t0 = St.tasks.get(id); const o = t0 && t0.placement && (t0.placement.options || [])[i]; if (!o) return;
  const t = clone(t0); const notes = [];
  if (o.project && o.project !== t.project) { notes.push(`Project → ${o.project}`); if (typeof learnCorrection === 'function') learnCorrection(t0, 'project', t0.project || '', o.project); t.project = o.project; t.projectLocked = true; }
  if (o.discipline && o.discipline !== t.discipline) { notes.push(`Category → ${E.DISCIPLINES[o.discipline]}`); t.discipline = o.discipline; t.catLocked = true; t.catBy = 'me'; }
  if (o.relatedTaskId && St.tasks.has(o.relatedTaskId) && !relIds(t).includes(o.relatedTaskId)) { t.relatedIds = [...relIds(t), o.relatedTaskId]; notes.push(`Linked to ${St.tasks.get(o.relatedTaskId).ref}`); }
  t.placement = { ...t.placement, status: 'confirmed' };
  (t.history = t.history || []).push({ at: nowISO(), text: 'Placement chosen — ' + (notes.join('; ') || 'no change') });
  putTask(t); render(); renderDrawer(); toast('🧭 Placement saved.');
}
function addSub() {
  const inp = $('#d-sub-new'); const v = (inp && inp.value || '').trim(); if (!v || !UI.drawer) return;
  const t = clone(St.tasks.get(UI.drawer.id)); if (!t) return;
  t.subtasks = [...subsOf(t), { id: E.uid('s'), text: v, ref: '', location: '', done: false }]; putTask(t); render(); renderDrawer();
  setTimeout(() => $('#d-sub-new')?.focus(), 30);
}
function setStatus(id, status) {
  const t = clone(St.tasks.get(id)); if (!t || t.status === status) return;
  const old = t.status; t.status = status;
  t.completedAt = status === 'done' ? nowISO() : null;
  (t.history = t.history || []).push({ at: nowISO(), text: `Status: ${STATUS[old]} → ${STATUS[status]}` });
  putTask(t);
  return old;
}

/* ---------- TO-DO view (grouped; categories assigned by Claude) ---------- */
const TODO_GROUPS = [['project', 'Project'], ['topic', 'Topic'], ['discipline', 'Category'], ['deadline', 'Deadline'], ['priority', 'Priority']];
const TODO_LS = 'action-register-todo-v2';
(() => { try { const v = JSON.parse(localStorage.getItem(TODO_LS) || '{}'); if (v.group) UI.todoGroup = v.group; UI.todoWaiting = !!v.waiting; if (v.mode && v.mode !== 'people') UI.todoMode = v.mode; } catch {} })();
if (UI.todoGroup === 'workType') UI.todoGroup = 'topic';
UI.subOpen = new Set(); UI.todoFilter = 'all'; UI.todoMode = UI.todoMode || 'map';
UI.todoGroup = UI.todoGroup || 'project'; UI.collapsed = new Set(); UI.todoShowDone = false;
function saveTodoPrefs() { try { localStorage.setItem(TODO_LS, JSON.stringify({ group: UI.todoGroup, waiting: !!UI.todoWaiting, mode: UI.todoMode })); } catch {} }
const needsCat = t => !t.discipline || !t.topic;
const topicOf = t => (t.topic || '').trim();
const CAT = { running: false, lastAuto: 0, error: '' };
function allTopics() {
  const seen = new Map();
  [...St.tasks.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).forEach(t => { const tp = topicOf(t); if (!tp) return; const k = E.normMatch((t.project || '') + '|' + tp); if (!seen.has(k)) seen.set(k, { project: t.project || '', topic: tp }); });
  return [...seen.values()].slice(0, 120);
}
function allProjects() {
  const out = St.settings.projects.map(p => ({ code: p.code, name: p.name, aliases: p.aliases }));
  const seen = new Set(out.map(p => E.normMatch(p.name)).concat(out.map(p => E.normMatch(p.code))));
  for (const t of St.tasks.values()) { const n = E.normMatch(t.project || ''); if (n && !seen.has(n)) { seen.add(n); out.push({ code: '', name: t.project }); } }
  return out.slice(0, 60);
}
async function aiCategorize(ids, quiet) {
  if (!St.sample || CAT.running) return;
  const list = ids.map(id => St.tasks.get(id)).filter(Boolean);
  if (!list.length) return;
  CAT.running = true; CAT.error = ''; if (UI.view === 'todo') render();
  let changed = 0;
  try {
    for (let i = 0; i < list.length; i += 50) {
      const chunk = list.slice(i, i + 50);
      const ids = new Set(chunk.map(x => x.id)); const cands = [...St.tasks.values()].filter(x => !ids.has(x.id)).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 80);
      const ans = await St.sample.json(E.buildCategorizePrompt(chunk, allProjects(), cands, allTopics(), typeof learnedNotes === 'function' ? learnedNotes(null) : ''), { modelTier: 'quick' });
      for (const a of (Array.isArray(ans) ? ans : [])) {
        const t0 = St.tasks.get(String(a && a.id)); if (!t0) continue;
        const t = clone(t0); const notes = [];
        if (!t.catLocked) {
          if (E.WORK_TYPES[a.workType] && a.workType !== t.workType) { t.workType = a.workType; }
          if (E.DISCIPLINES[a.discipline] && a.discipline !== t.discipline) { t.discipline = a.discipline; }
          if (!t.topicLocked && typeof a.topic === 'string' && a.topic.trim() && a.topic.trim() !== topicOf(t)) { t.topic = E.clip(a.topic.trim(), 60); }
          t.catBy = 'ai';
        }
        const np = typeof a.project === 'string' ? a.project.trim() : '';
        if (!t.projectLocked && np && np !== (t.project || '')) { notes.push(`Project: ${t.project || '—'} → ${np}`); t.project = np; }
        if (!t.placement || t.placement.status !== 'confirmed') {
          const nr = (Array.isArray(a.relatedTaskIds) ? a.relatedTaskIds : []).map(String).filter(x => St.tasks.has(x) && x !== t.id && !relIds(t).includes(x));
          if (nr.length) { t.relatedIds = [...relIds(t), ...nr]; notes.push('Linked to ' + nr.map(x => St.tasks.get(x).ref).join(', ')); }
          const pf = placementFrom({ placementConfidence: typeof a.placementConfidence === 'number' ? a.placementConfidence : null, placementOptions: (Array.isArray(a.placementOptions) ? a.placementOptions : []).slice(0, 3).map(o => ({ project: String(o.project || ''), discipline: E.DISCIPLINES[o.discipline] ? o.discipline : null, relatedTaskId: o.relatedTaskId ? String(o.relatedTaskId) : null, reason: String(o.reason || '') })).filter(o => o.project || o.discipline || o.relatedTaskId) });
          t.placement = pf;
        }
        if (notes.length) (t.history = t.history || []).push({ at: nowISO(), text: notes.join('; ') + ' (by Claude)' });
        putTask(t); changed++;
      }
    }
    if (!quiet) toast(`Claude categorised ${changed} task${changed === 1 ? '' : 's'}.`);
  } catch (e) {
    CAT.error = e && e.code === 'not_granted' ? 'Claude access was not allowed for this page.' : e && e.code === 'rate_limited' ? 'Usage limit reached — try categorising later.' : 'Categorising failed' + (e && e.code ? ' (' + e.code + ')' : '') + '. Try again.';
    if (!quiet) toast(CAT.error, { err: true });
  } finally {
    CAT.running = false; render();
    if (CAT.queue && CAT.queue.length) { const q = [...new Set(CAT.queue)]; CAT.queue = []; setTimeout(() => aiCategorize(q, true), 50); }
  }
}
function maybeAutoCategorize() {
  // runs when the viewer opens the To-do tab; only for tasks Claude has not categorised yet
  if (!St.sample || SUBWIN || CAT.running || Date.now() - CAT.lastAuto < 60000) return;
  const ids = [...St.tasks.values()].filter(t => t.status !== 'done' && needsCat(t) && !t.catLocked).map(t => t.id);
  if (!ids.length) return;
  CAT.lastAuto = Date.now(); aiCategorize(ids, true);
}
/* ---------- visual identity: icons, emoji, project badges ---------- */
const DISC_SVG = {
  pumps: '<circle cx="10" cy="13" r="5.2"/><circle cx="10" cy="13" r="1.6" class="f"/><path d="M10 7.8V4h7v3"/><path d="M15.2 13H21M18 10.5v5"/><path d="M5 18.5h10"/>',
  blowers: '<circle cx="12" cy="12" r="8"/><path d="M12 12c0-3 1.5-5 4-5-.2 2.6-1.6 4.4-4 5zM12 12c2.6 1.5 3.6 3.8 2.4 6-2-1.4-2.9-3.6-2.4-6zM12 12c-2.6 1.5-5.1 1.3-6.5-.8 2.3-1.2 4.6-.9 6.5.8z" class="f"/>',
  valves: '<path d="M3 9v6l7-3zM21 9v6l-7-3z" class="f"/><path d="M12 12V6M8.5 4.5h7"/><circle cx="12" cy="12" r="1.3"/><path d="M2 12h1M21 12h1"/>',
  piping: '<path d="M3 8h8a4 4 0 0 1 4 4v9"/><path d="M3 14h6a2 2 0 0 1 2 2v5"/><path d="M5 6.5v9M13.5 19h7" class="s2"/>',
  screens_equipment: '<path d="M5 20 9 4h10l-4 16z"/><path d="M10.5 7.5h6M10 10h6M9.4 12.5h6M8.8 15h6M8.2 17.5h6" class="s2"/>',
  hydraulics_process: '<path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2.5-1.5 4.5-1.5S19 15 21 15"/><path d="M3 19c2 0 2-1.5 4.5-1.5S10 19 12 19s2.5-1.5 4.5-1.5S19 19 21 19" class="s2"/><circle cx="12" cy="7" r="4"/><path d="M12 7l2-2"/>',
  civil_interface: '<path d="M3 14h18v6H3z" class="f"/><path d="M7 14V8h10v6"/><path d="M9 20v2M15 20v2M9 8V4M15 8V4"/>',
  electrical_instrumentation: '<circle cx="12" cy="12" r="8.5"/><path d="m13 5-4.5 8H12l-1 6 4.5-8H12z" class="f"/>',
  procurement: '<path d="M7 4h10v17H7z"/><path d="M9.5 2.5h5v3h-5z" class="f"/><path d="M9.5 10h5M9.5 13h5M9.5 16h3"/>',
  documents_drawings: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M13 14h8M13 17h8M13 14v6"/><path d="m6 13 3-5 3 5z" class="s2"/>',
  coordination_admin: '<circle cx="8.5" cy="9" r="3"/><circle cx="16" cy="10" r="2.5"/><path d="M3 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14 15.2c2.6-.6 5.2.7 6 3.8"/>',
};
const discIcon = (k, s = 18) => `<svg class="dicon" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DISC_SVG[k] || DISC_SVG.coordination_admin}</svg>`;
const WT_EMOJI = { reply: '💬', review: '🔍', revise: '✏️', submit: '📤', approve: '✅', decide: '⚖️', follow_up: '🔔', attend: '📅', prepare: '📐' };
const PRIO_EMOJI = { critical: '🚨', high: '🔺', medium: '', low: '' };
const HUES = [186, 214, 256, 288, 334, 22, 40, 150, 200, 4, 120, 230];
function hueOf(str) { let h = 0; for (const ch of String(str || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return HUES[h % HUES.length]; }
function monogram(name) {
  const n = String(name || '').trim(); if (!n) return '•';
  const code = /^([A-Z0-9][A-Z0-9-]{1,6})\b/.exec(n); if (code) return code[1].replace(/-/g, '').slice(0, 3);
  const w = n.split(/[\s—–-]+/).filter(x => /[\p{L}\p{N}]/u.test(x));
  return (w.length > 1 ? w[0][0] + w[1][0] : n.slice(0, 2)).toUpperCase();
}
const projHue = name => { const m = projMeta(name); return m.hue != null ? m.hue : hueOf(name); };
const projBadge = (name, cls = '') => { const m = projMeta(name); return `<span class="pbadge ${cls}${m.icon ? ' has-ico' : ''}" style="--h:${projHue(name)}" aria-hidden="true">${m.icon ? ico(m.icon) : esc(monogram(name))}</span>`; };
function ring(pct, size = 40) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return `<span class="ring" style="--p:${p};width:${size}px;height:${size}px" role="img" aria-label="${p}% done"><svg viewBox="0 0 36 36"><circle class="ring-bg" cx="18" cy="18" r="15.9"/><circle class="ring-fg" cx="18" cy="18" r="15.9" stroke-dasharray="${p} 100"/></svg><b>${p}%</b></span>`;
}
const subsOf = t => Array.isArray(t.subtasks) ? t.subtasks : [];
const subsDone = t => subsOf(t).filter(x => x.done).length;

/* ---------- TO-DO: board + list ---------- */
function todoList() {
  const f = UI.todoFilter || 'all';
  return [...St.tasks.values()].filter(t => {
    if (t.ownership === 'fyi') return false;
    if (t.status === 'done') return f === 'all' && UI.todoShowDone && t.completedAt && E.dayDiff(t.completedAt.slice(0, 10), T()) <= 7;
    const mine = isMine(t) && t.status !== 'waiting';
    if (f === 'waiting') return !mine;
    if (!mine && !UI.todoWaiting) return false;
    if (f === 'overdue') return mine && t.deadline && t.deadline < T();
    if (f === 'today') return mine && t.deadline === T();
    if (f === 'week') return mine && t.deadline && t.deadline > T() && t.deadline <= E.addDays(T(), 7);
    return true;
  });
}
function groupKey(t, by) {
  switch (by) {
    case 'project': { const p = (t.project || '').trim(); return p ? ['p:' + E.normMatch(p), p] : ['~', 'No project']; }
    case 'discipline': return t.discipline ? [t.discipline, E.DISCIPLINES[t.discipline]] : ['~', 'Not categorised yet'];
    case 'topic': { const tp = topicOf(t); return tp ? ['t:' + E.normMatch((t.project || '') + ' ' + tp), (t.project ? t.project + ' › ' : '') + tp] : ['~', 'No topic yet']; }
    case 'priority': return [String(PRIO_RANK[t.priority] ?? 9), PRIO[t.priority] || 'Medium'];
    default: { const b = bucketOf(t); return [String(BUCKETS.indexOf(b)).padStart(2, '0'), b]; }
  }
}
const todoSort = (a, b) => (a.status === 'done') - (b.status === 'done') || (a.deadline || '9999').localeCompare(b.deadline || '9999') || PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
function groupIcon(by, k, label) {
  if (by === 'project') return k === '~' ? '<span class="gicon">🗂️</span>' : projBadge(label);
  if (by === 'discipline') return k === '~' ? '<span class="gicon">🏷️</span>' : `<span class="gicon disc" style="--h:${hueOf(k)}">${discIcon(k, 22)}</span>`;
  if (by === 'topic') return '<span class="gicon">🧩</span>';
  if (by === 'priority') return `<span class="gicon">${['🚨', '🔺', '🔷', '▫️'][+k] || '▫️'}</span>`;
  return `<span class="gicon">${{ Overdue: '🔥', Today: '⏰', 'Next 7 days': '📆', 'Within 30 days': '🗓️', Later: '🧭', 'No deadline': '♾️', Done: '🎉' }[label] || '📌'}</span>`;
}
function dueEmoji(d) { return d.cls === 'over' ? '🔥 ' : d.cls === 'today' ? '⏰ ' : ''; }
function chipsFor(t, by) {
  return [
    by !== 'project' && t.project ? `<span class="chip pchip" style="--h:${hueOf(t.project)}"><i></i>${esc(t.project)}</span>` : '',
    by !== 'discipline' && t.discipline ? `<span class="chip dchip">${discIcon(t.discipline, 14)}${esc(E.DISCIPLINES[t.discipline])}</span>` : '',
    by !== 'topic' && topicOf(t) ? `<span class="chip topic-chip">🧩 ${esc(topicOf(t))}</span>` : '',
    isNewTask(t) ? '<span class="chip new">NEW</span>' : '',
    mailDate(t) ? `<span class="chip" title="Date of the email where this was asked">✉ ${esc(fmtDate(mailDate(t)))}</span>` : '',
    !isMine(t) || t.status === 'waiting' ? `<span class="chip wait">⏳ Waiting on ${esc(t.owner || 'others')}</span>` : '',
    t.status === 'blocked' ? '<span class="chip crit">⛔ Blocked</span>' : t.status === 'in_progress' ? '<span class="chip accent">▶ In progress</span>' : '',
  ].join('');
}
function subtasksHTML(t, limit) {
  const subs = subsOf(t); if (!subs.length) return '';
  const done = subsDone(t), pct = Math.round(100 * done / subs.length);
  const open = UI.subOpen.has(t.id);
  const shown = open ? subs : subs.slice(0, limit);
  return `<div class="subs">
    <div class="subs-h"><div class="subbar"><i style="width:${pct}%"></i></div><span class="num small">${done}/${subs.length} items</span></div>
    <ul class="sublist">${shown.map(x => `<li class="${x.done ? 'done' : ''}"><button class="subtick" data-act="toggle-sub" data-id="${esc(t.id)}" data-sid="${esc(x.id)}" aria-pressed="${!!x.done}" aria-label="${x.done ? 'Uncheck' : 'Check'}: ${esc(x.text)}">${I.check}</button><span dir="auto">${esc(x.text)}</span></li>`).join('')}</ul>
    ${subs.length > limit ? `<button class="btn ghost sm subs-more" data-act="subs-expand" data-id="${esc(t.id)}">${open ? 'Show fewer' : `Show all ${subs.length} items`}</button>` : ''}
    ${done === subs.length && t.status !== 'done' ? `<button class="btn sm primary" data-act="toggle-done" data-id="${esc(t.id)}">🎉 All items done — close task</button>` : ''}
  </div>`;
}
function taskCard(t, by) {
  const d = dueInfo(t); const subs = subsOf(t).length;
  const depth = subs >= 10 ? 3 : subs >= 4 ? 2 : subs ? 1 : 0;
  return `<article class="tcard p-${esc(t.priority || 'medium')} ${t.status === 'done' ? 'is-done' : ''}" style="--depth:${depth}" data-tilt>
    ${depth ? `<span class="sheet s1"></span>${depth > 1 ? '<span class="sheet s2"></span>' : ''}${depth > 2 ? '<span class="sheet s3"></span>' : ''}` : ''}
    <div class="tface">
      <div class="tc-top">
        <button class="tick" data-act="toggle-done" data-id="${esc(t.id)}" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}: ${esc(t.title)}">${I.check}</button>
        <div class="tc-title" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0" dir="auto">${PRIO_EMOJI[t.priority] ? `<span class="pe">${PRIO_EMOJI[t.priority]}</span> ` : ''}${esc(t.title)}</div>
      </div>
      <div class="tc-meta"><span class="duepill ${d.cls}">${dueEmoji(d)}${esc(d.txt)}</span><span class="ref">${esc(t.ref || '')}</span>${subs ? `<span class="stackcount" title="${subs} items inside">🗂️ ${subs}</span>` : ''}</div>
      ${t.nextStep && t.status !== 'done' ? `<div class="tc-next" dir="auto"><span>👉</span> ${esc(t.nextStep)}</div>` : ''}
      <div class="tc-chips">${chipsFor(t, by)}</div>
      ${subtasksHTML(t, 4)}
    </div>
  </article>`;
}
function todoRow(t, by) {
  const d = dueInfo(t); const subs = subsOf(t);
  return `<li class="todo-item p-${esc(t.priority || 'medium')} ${t.status === 'done' ? 'is-done' : ''}">
    <button class="tick" data-act="toggle-done" data-id="${esc(t.id)}" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}: ${esc(t.title)}">${I.check}</button>
    <div class="todo-main"><div class="todo-top"><span class="ttl" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0" dir="auto">${PRIO_EMOJI[t.priority] ? PRIO_EMOJI[t.priority] + ' ' : ''}${esc(t.title)}</span><span class="duepill ${d.cls}">${dueEmoji(d)}${esc(d.txt)}</span></div>
      ${t.nextStep && t.status !== 'done' ? `<div class="todo-next" dir="auto">👉 ${esc(t.nextStep)}</div>` : ''}
      <div class="tmeta"><span class="ref">${esc(t.ref || '')}</span>${chipsFor(t, by)}</div>
      ${subs.length ? subtasksHTML(t, 3) : ''}
    </div></li>`;
}
function todoFiltered() {
  let list = todoList();
  if (!UI.showSnoozed && !UI.todoQ) list = list.filter(t => !(t.snoozeUntil && t.snoozeUntil > T() && t.status !== 'done')); // snoozed until a later day
  const q = E.normMatch(UI.todoQ || '');
  if (q) { const qs = q.split(' '); list = list.filter(t => { const h = E.normMatch([t.ref, t.title, t.action, t.project, t.nextStep, t.owner, t.requestedBy, t.notes, t.sourceSubject, E.DISCIPLINES[t.discipline], E.WORK_TYPES[t.workType], subsOf(t).map(x => x.text).join(' ')].join(' ')); return qs.every(x => h.includes(x)); }); }
  return list;
}
function todoGroupsHTML() {
  const by = UI.todoGroup, mode = UI.todoMode;
  const list = todoFiltered();
  const snoozed = UI.todoQ ? 0 : [...St.tasks.values()].filter(t => t.snoozeUntil && t.snoozeUntil > T() && t.status !== 'done').length;
  const snoozeNote = snoozed ? `<div class="row small muted snooze-note">💤 ${snoozed} snoozed task${snoozed > 1 ? 's' : ''} ${UI.showSnoozed ? 'shown' : 'hidden until their day'}<button class="btn ghost sm" data-act="toggle-snoozed">${UI.showSnoozed ? 'Hide' : 'Show'}</button></div>` : '';
  if (!St.tasks.size) return `<div class="empty-hero card">${ILLUSTRATION}<div><h3>Your to-do list is empty</h3><p class="muted">Forward a work email to your address, or add saved Outlook files. Claude pulls out the actions — even long comment sheets become one task with every item inside — and sorts them by project.</p>${fwdAddrHTML()}<div class="row" style="margin-top:12px"><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button></div></div></div>`;
  if (!list.length) return snoozeNote + `<div class="card"><div class="empty"><div class="big-emoji">${UI.todoQ ? '🔎' : '🌤️'}</div><h3>${UI.todoQ ? 'No match' : 'All clear'}</h3><p>${UI.todoQ ? 'No to-do matches your search.' : UI.todoFilter !== 'all' ? 'Nothing in this view.' : 'No open actions for you right now.'}</p>${UI.todoFilter !== 'all' ? '<button class="btn" data-act="todo-filter" data-filter="all">Show everything</button>' : ''}</div></div>`;
  const groups = new Map();
  for (const t of list) { const [k, label] = groupKey(t, by); if (!groups.has(k)) groups.set(k, { k, label, items: [] }); groups.get(k).items.push(t); }
  let keys = [...groups.keys()];
  const openN = k => groups.get(k).items.filter(t => t.status !== 'done').length;
  if (by === 'project' || by === 'discipline' || by === 'topic') keys.sort((a, b) => (a === '~') - (b === '~') || openN(b) - openN(a) || groups.get(a).label.localeCompare(groups.get(b).label));
  else keys.sort();
  const html = keys.map(k => {
    const g = groups.get(k); g.items.sort(todoSort);
    const gOpen = g.items.filter(t => t.status !== 'done');
    const gOver = gOpen.filter(t => t.deadline && t.deadline < T()).length;
    let tot = 0, dn = 0; g.items.forEach(t => { const s = subsOf(t); if (s.length) { tot += s.length; dn += t.status === 'done' ? s.length : subsDone(t); } else { tot += 1; dn += t.status === 'done' ? 1 : 0; } });
    const items = gOpen.reduce((n, t) => n + Math.max(1, subsOf(t).filter(x => !x.done).length), 0);
    const id = 'g-' + by + '-' + k.replace(/[^\w-]/g, '_');
    const collapsed = UI.collapsed.has(id) && !UI.todoQ;
    const hue = by === 'project' && k !== '~' ? hueOf(g.label) : by === 'discipline' && k !== '~' ? hueOf(k) : 186;
    const head = `<button class="stack-h" data-act="toggle-group" data-gid="${esc(id)}" aria-expanded="${!collapsed}">
        ${groupIcon(by, k, g.label)}
        <span class="stack-t"><span class="gname" dir="auto">${esc(g.label)}</span><span class="gsub">${gOpen.length} task${gOpen.length === 1 ? '' : 's'} · ${items} open item${items === 1 ? '' : 's'}${gOver ? ` · <b class="over-txt">🔥 ${gOver} overdue</b>` : ''}</span></span>
        ${ring(tot ? 100 * dn / tot : 0)}
      </button>`;
    if (mode === 'list') return `<section class="todo-group stack flat" style="--h:${hue}">${head}${collapsed ? '' : `<ul class="todo-items">${g.items.map(t => todoRow(t, by)).join('')}</ul>`}</section>`;
    return `<section class="stack" style="--h:${hue}">${head}${collapsed ? '' : `<div class="stack-b">${g.items.map(t => taskCard(t, by)).join('')}</div>`}</section>`;
  }).join('');
  return snoozeNote + (mode === 'list' ? `<div class="todo-groups-list">${html}</div>` : `<div class="board">${html}</div>`);
}
const ILLUSTRATION = `<svg class="illo" viewBox="0 0 360 150" aria-hidden="true">
  <defs><linearGradient id="ill-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ill-sky1)"/><stop offset="1" stop-color="var(--ill-sky2)"/></linearGradient>
  <linearGradient id="ill-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--ill-water1)"/><stop offset="1" stop-color="var(--ill-water2)"/></linearGradient></defs>
  <rect width="360" height="150" rx="14" fill="url(#ill-sky)"/>
  <circle cx="300" cy="34" r="14" fill="var(--ill-sun)"/>
  <path d="M0 118h360v32H0z" fill="var(--ill-ground)"/>
  <!-- clarifier -->
  <ellipse cx="88" cy="112" rx="58" ry="12" fill="var(--ill-tank)"/><path d="M30 100v12a58 12 0 0 0 116 0v-12" fill="var(--ill-tank)"/>
  <ellipse cx="88" cy="100" rx="58" ry="12" fill="url(#ill-water)"/><path d="M88 100V80M40 98h96" stroke="var(--ill-steel)" stroke-width="3" stroke-linecap="round"/><path d="M80 80h16l-8-8z" fill="var(--ill-steel)"/>
  <!-- aeration tank -->
  <rect x="168" y="78" width="98" height="42" rx="4" fill="var(--ill-tank)"/><rect x="172" y="84" width="90" height="32" rx="2" fill="url(#ill-water)"/>
  <g fill="var(--ill-bubble)"><circle cx="186" cy="108" r="3"/><circle cx="196" cy="98" r="2.2"/><circle cx="214" cy="104" r="3.2"/><circle cx="230" cy="94" r="2"/><circle cx="246" cy="106" r="2.8"/><circle cx="206" cy="92" r="1.6"/><circle cx="252" cy="92" r="1.8"/></g>
  <!-- pump + pipes -->
  <path d="M146 104h22M266 100h22v-26h34" stroke="var(--ill-pipe)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <circle cx="300" cy="104" r="12" fill="var(--ill-pump)"/><rect x="312" y="98" width="22" height="12" rx="3" fill="var(--ill-steel)"/><circle cx="300" cy="104" r="4" fill="var(--ill-sky2)"/>
  <path d="M288 104h-10" stroke="var(--ill-pipe)" stroke-width="6" stroke-linecap="round"/>
  <!-- checklist sign -->
  <g transform="translate(18 18)"><rect width="74" height="50" rx="8" fill="var(--ill-card)"/><path d="m10 16 4 4 8-8M10 34l4 4 8-8" stroke="var(--accent)" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M30 16h34M30 34h26" stroke="var(--ill-line)" stroke-width="4" stroke-linecap="round"/></g>
</svg>`;
function greeting() {
  const h = new Date().getHours(); const n = (St.settings.me.name || St.profileName || '').split(' ')[0];
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${n ? ', ' + esc(n) : ''} 👋`;
}
function viewTodo() {
  const by = UI.todoGroup;
  const all = [...St.tasks.values()].filter(t => t.status !== 'done' && t.ownership !== 'fyi');
  const mine = all.filter(t => isMine(t) && t.status !== 'waiting');
  const c = { all: mine.length, overdue: mine.filter(t => t.deadline && t.deadline < T()).length, today: mine.filter(t => t.deadline === T()).length, week: mine.filter(t => t.deadline && t.deadline > T() && t.deadline <= E.addDays(T(), 7)).length, waiting: all.length - mine.length };
  const items = mine.reduce((n, t) => n + subsOf(t).filter(x => !x.done).length, 0);
  const rc = counts().review;
  const uncategorised = [...St.tasks.values()].filter(t => t.status !== 'done' && needsCat(t) && !t.catLocked).length;
  const tiles = [['all', '📋', 'Open tasks', ''], ['overdue', '🔥', 'Overdue', 'over'], ['today', '⏰', 'Due today', 'today'], ['week', '📆', 'Next 7 days', ''], ['waiting', '⏳', 'Waiting on others', 'wait']];
  const f = UI.todoFilter || 'all';
  return `<div class="wrap">
    <h1 class="sr">To-do</h1>
    ${UI.updateReady ? callout('ok', `<div class="row"><span>Version ${esc(UI.updateReady)} has been downloaded.</span><span class="spacer"></span><button class="btn sm primary" data-act="update-install">Restart to update</button></div>`) : ''}
    ${!St.settings.setupDone ? setupCardHTML() : ''}
    ${uncategorised && St.sample ? callout('info', `<div class="row"><span>${CAT.running ? '🧠 Claude is sorting your tasks into projects and categories…' : `🏷️ ${uncategorised} task${uncategorised > 1 ? 's are' : ' is'} not categorised yet.`}</span><span class="spacer"></span>${CAT.running ? '<div class="progress indet" style="width:90px"><i></i></div>' : `<button class="btn sm primary" data-act="ai-categorize">Categorise with Claude</button>`}</div>`) : ''}
    ${CAT.error && !CAT.running ? callout('warn', `<p>${esc(CAT.error)}</p>`) : ''}
    ${typeof dupCallout === 'function' ? dupCallout() : ''}${typeof headersCallout === 'function' ? headersCallout() : ''}${typeof traceCallout === 'function' ? traceCallout() : ''}
    ${St.tasks.size && TODO_VIEWS[UI.todoMode] ? TODO_VIEWS[UI.todoMode]() : ''}
    ${St.tasks.size && UI.todoMode !== 'map' && !TODO_VIEWS[UI.todoMode] ? `<div class="mode-bar">${modeSegHTML()}<span class="spacer"></span><button class="btn sm primary" data-act="new-task">${I.plus} Task</button></div>` : ''}
    ${St.tasks.size && UI.todoMode === 'map' ? viewMap() : ''}
    ${St.tasks.size && UI.todoMode !== 'map' && !TODO_VIEWS[UI.todoMode] ? `<div class="tiles" role="toolbar" aria-label="Filter">${tiles.map(([k, e, l, cls]) => `<button class="tile ${cls} ${c[k] ? '' : 'zero'}" data-act="todo-filter" data-filter="${k}" aria-pressed="${f === k}"><span class="tile-e">${e}</span><span class="tile-n num">${c[k]}</span><span class="tile-l">${l}</span></button>`).join('')}</div>
    <div class="todo-bar">
      <div class="seg" role="group" aria-label="Group by"><span class="seg-label">Group</span>${TODO_GROUPS.map(([k, l]) => `<button data-act="todo-group" data-group="${k}" aria-pressed="${by === k}">${l}</button>`).join('')}</div>
      <label class="search todo-search">${I.search}<span class="sr">Search to-dos</span><input class="input" id="todo-q" type="search" placeholder="Search tasks, items, documents, people…" value="${esc(UI.todoQ)}" data-inp="todoQ"></label>
      <div class="row todo-opts">
        <label class="check small"><input type="checkbox" id="todo-wait" data-chg="todo-opt" data-key="todoWaiting" ${UI.todoWaiting ? 'checked' : ''}>Include what I’m waiting on</label>
        <label class="check small"><input type="checkbox" id="todo-done" data-chg="todo-opt" data-key="todoShowDone" ${UI.todoShowDone ? 'checked' : ''}>Show done (7 days)</label>
      </div>
    </div>` : ''}
    ${(UI.todoMode !== 'map' && !TODO_VIEWS[UI.todoMode]) || !St.tasks.size ? `<div id="todo-groups">${todoGroupsHTML()}</div>` : ''}
  </div>`;
}
function toggleSub(id, sid) {
  const t = clone(St.tasks.get(id)); if (!t) return;
  const s = subsOf(t).find(x => x.id === sid); if (!s) return;
  s.done = !s.done; s.doneAt = s.done ? nowISO() : null;
  putTask(t);
}
/* subtle 3D tilt on pointer devices */
(() => {
  const ok = () => matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cur = null;
  document.addEventListener('pointermove', e => {
    if (!ok()) return;
    const c = e.target.closest && e.target.closest('[data-tilt]');
    if (cur && cur !== c) { cur.style.removeProperty('--rx'); cur.style.removeProperty('--ry'); cur = null; }
    if (!c) return; cur = c;
    const r = c.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    c.style.setProperty('--rx', (-y * 5).toFixed(2) + 'deg'); c.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
  }, { passive: true });
})();

/* ---------- MIND MAP canvas ---------- */
// The tree (My work → project → topic → task → items) is laid out automatically from the tasks.
// The user can override it: St.layout.off moves a node and its whole branch, St.layout.size widens it.
// Free board elements (stickies, text, shapes, frames, arrows, connectors, ink) live in St.board.
UI.map = { x: 30, y: 30, k: 0.85, fitted: false }; UI.mapCollapsed = new Set(); UI.mapItems = new Set(); UI.mapSel = null;
UI.mapShowDone = true; UI.mapFocus = 'all'; UI.mapQ = ''; UI.mapActivity = false;
UI.tool = 'select'; UI.cvColor = 'ink'; UI.cvWidth = 3; UI.cvSel = new Set(); UI.cvUndo = []; UI.cvRedo = []; UI.cvTemp = null; UI.cvDrop = null;
UI.mapFull = false; UI.mapAsOf = ''; UI.mapDay = '';
const MX = { root: 0, project: 250, topic: 540, task: 830, thread: 830, item: 1190 };
// the mind map grows left to right (h, the default) or top to bottom (v); boxes moved by hand are remembered
// separately for each direction (St.layout.off / St.layout.offv)
const mapDir = () => ((St.settings.ui || {}).mapDir === 'v' ? 'v' : 'h');
const offKey = () => (mapDir() === 'v' ? 'offv' : 'off');
const VGAP = { root: 64, project: 54, topic: 46, task: 0 }, HGAP = { project: 44, topic: 26, task: 16, item: 8, root: 0 };
const MW = { root: 200, project: 250, topic: 250, task: 320, thread: 340, item: 280 };
const MH = { root: 78, project: 72, topic: 52, task: 82, thread: 60, item: 34 };
const MGAP = { project: 20, topic: 14, task: 12, thread: 14, item: 6, root: 0 };
const MGAP_AFTER = { root: 0, project: 34, topic: 16, task: 8 };
const relIds = t => Array.isArray(t.relatedIds) ? t.relatedIds : [];
const dayOf = iso => { if (!iso) return ''; if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso; const d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function projKeyLabel(t) { const p = (t.project || '').trim(); return p ? ['p:' + E.normMatch(p), p] : ['p:~', 'No project']; }
const topicKey = t => { const tp = topicOf(t); return 'tp:' + projKeyLabel(t)[0] + ':' + (tp ? E.normMatch(tp) : '~'); };
// "As of" a past date: tasks created later are hidden, work finished later shows as still open.
function asOfTask(t) {
  const a = UI.mapAsOf; if (!a) return t;
  const subs = subsOf(t).map(x => x.done && x.doneAt && dayOf(x.doneAt) > a ? { ...x, done: false } : x);
  if (t.status === 'done' && t.completedAt && dayOf(t.completedAt) > a) return { ...t, status: 'in_progress', completedAt: null, subtasks: subs };
  return { ...t, subtasks: subs };
}
function mapTasks() {
  const a = UI.mapAsOf;
  return [...St.tasks.values()].filter(t => !a || !t.createdAt || dayOf(t.createdAt) <= a).map(asOfTask)
    .filter(t => (UI.mapShowDone || t.status !== 'done') && (UI.mapFocus === 'all' || projKeyLabel(t)[0] === UI.mapFocus));
}
// tasks touched on a day: planned for it, created, completed, edited, or an item ticked
function dayTaskIds(day) {
  const s = new Set(); if (!day) return s;
  for (const t of St.tasks.values()) {
    if ((t.days || []).includes(day) || dayOf(t.createdAt) === day || (t.completedAt && dayOf(t.completedAt) === day) || (t.history || []).some(h => dayOf(h.at) === day) || subsOf(t).some(x => x.doneAt && dayOf(x.doneAt) === day)) s.add(t.id);
  }
  return s;
}
function nodeW(n) {
  const tmp = UI.cvTemp;
  if (tmp && tmp.kind === 'size' && tmp.id === n.id) return tmp.w;
  const o = (St.layout.size || {})[n.id], w = o && o.w ? o.w : MW[n.type];
  // a thread card is wide enough for the tasks inside it
  return n.type === 'thread' && (n.children || []).length ? Math.max(w, ...n.children.map(k => nodeW(k) + 24)) : w;
}
function buildMap() {
  const tasks = mapTasks();
  const projs = new Map();
  for (const t of tasks) {
    const [pk, pl] = projKeyLabel(t);
    if (!projs.has(pk)) projs.set(pk, { id: pk, type: 'project', label: pl, hue: pk === 'p:~' ? 200 : projHue(pl), cats: new Map(), n: 0, done: 0 });
    const P = projs.get(pk); P.n++; if (t.status === 'done') P.done++;
    const tp = topicOf(t); const ck = tp ? E.normMatch(tp) : '~';
    if (!P.cats.has(ck)) P.cats.set(ck, { id: 'tp:' + pk + ':' + ck, type: 'topic', key: ck, label: tp || 'General', hue: P.hue, tasks: [] });
    P.cats.get(ck).tasks.push(t);
  }
  const openOf = P => P.n - P.done;
  // an email conversation that feeds several topics is shown whole in the topic of its first task, and as a one-line
  // card (tap to open) in the others
  const convHome = new Map();
  if (UI.mapThreads !== false && typeof taskConvs === 'function') for (const t of [...tasks].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))) for (const c of taskConvs(t)) if (!convHome.has(c)) convHome.set(c, topicKey(t));
  const projects = [...projs.values()].sort((a, b) => (a.id === 'p:~') - (b.id === 'p:~') || openOf(b) - openOf(a) || a.label.localeCompare(b.label));
  const root = { id: 'root', type: 'root', children: [] };
  for (const P of projects) {
    // project → topics (most recent activity first) → tasks (oldest first: historical progression)
    const last = C => C.tasks.reduce((m, t) => (t.updatedAt || '') > m ? t.updatedAt : m, '');
    P.children = [...P.cats.values()].sort((a, b) => (a.key === '~') - (b.key === '~') || last(b).localeCompare(last(a))).map(C => {
      // the topic's email conversations come first, each as one card from the first email to the latest reply
      const convs = UI.mapThreads === false || typeof taskConvs !== 'function' ? [] : [...new Set(C.tasks.flatMap(taskConvs))]
        .map(cid => ({ cid, first: (convEmails(cid)[0] || {}).date || '' })).sort((a, b) => a.first.localeCompare(b.first));
      const tnodes = C.tasks.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map(t => ({
        id: 't:' + t.id, type: 'task', t, hue: P.hue,
        children: UI.mapItems.has(t.id) ? subsOf(t).map(s2 => ({ id: 's:' + t.id + ':' + s2.id, type: 'item', s: s2, t, hue: P.hue, children: [] })) : [],
      }));
      // a task that came from an email conversation sits inside that conversation's card, not beside it
      const inCard = UI.mapThreadTasks !== false && convs.length ? new Map(tnodes.map(k => [k, taskConvs(k.t)[0]])) : new Map();
      C.children = [...convs.map(({ cid }) => ({ id: 'th:' + C.id + ':' + cid, type: 'thread', conv: cid, compact: convHome.get(cid) !== C.id, hue: P.hue, children: tnodes.filter(k => inCard.get(k) === cid) })),
        ...tnodes.filter(k => !inCard.get(k) || !convs.some(c => c.cid === inCard.get(k)))];
      return C;
    });
    root.children.push(P);
  }
  // layout: tidy horizontal tree
  const nodes = [], edges = []; let cursor = 0;
  const place = (n) => {
    // a thread card holds its tasks: the messages on top, then the tasks one under another inside the card
    if (n.type === 'thread' && n.children.length) {
      n.kids = n.children; n.hiddenKids = 0; n.x = MX.thread; n.w = nodeW(n); n.headH = n.h = Math.max(MH.thread, measureNode(n));
      n.y = cursor; nodes.push(n); cursor = n.y + n.headH;
      n.kids.forEach(k => { place(k); k.x = n.x + 12; (k.kids || []).forEach(it => { it.x = Math.max(it.x, n.x + n.w + 16); }); });
      n.h = Math.max(n.headH, cursor - MGAP.task - n.y + 12); cursor = n.y + n.h + MGAP.thread;
      return;
    }
    const hidden = UI.mapCollapsed.has(n.id);
    n.hiddenKids = hidden ? n.children.length : 0;
    const kids = hidden ? [] : n.children; n.kids = kids;
    n.x = MX[n.type]; n.w = nodeW(n); n.h = Math.max(MH[n.type], measureNode(n));
    if (!kids.length) { n.y = cursor; cursor += n.h + MGAP[n.type]; }
    else {
      kids.forEach(place);
      const a = kids[0], b = kids[kids.length - 1];
      n.y = Math.max(0, (a.y + a.h / 2 + b.y + b.h / 2) / 2 - n.h / 2);
      cursor = Math.max(cursor, n.y + n.h + MGAP[n.type]) + (MGAP_AFTER[n.type] || 0);
      kids.forEach(k => edges.push({ a: n, b: k, hue: k.hue ?? n.hue ?? 186 }));
    }
    nodes.push(n);
  };
  // top to bottom: one row per level (root, projects, topics, tasks); a task's items hang below it in a column
  const placeV = () => {
    const all = [];
    const measure = n => {
      const hidden = UI.mapCollapsed.has(n.id); n.hiddenKids = hidden ? n.children.length : 0;
      n.kids = hidden ? [] : n.children; n.w = nodeW(n); n.h = Math.max(MH[n.type], measureNode(n)); n.headH = n.h; all.push(n); n.kids.forEach(measure);
    };
    measure(root);
    const maxH = {}; for (const n of all) if (n.type !== 'item') maxH[n.type] = Math.max(maxH[n.type] || 0, n.h);
    const rowY = { root: 0 }; let y = 0;
    for (const t of ['root', 'project', 'topic', 'task']) { rowY[t] = y; y += (maxH[t] || MH[t]) + (VGAP[t] || 40); }
    rowY.thread = rowY.task;
    let cx = 0;
    const put = n => {
      n.y = rowY[n.type] ?? 0;
      if (n.type === 'thread' && n.kids.length) {
        n.x = cx; nodes.push(n); let iy = n.y + n.headH;
        for (const k of n.kids) {
          k.x = n.x + 12; k.y = iy; iy += k.h + 8; nodes.push(k);
          for (const it of k.kids) { it.x = k.x + 22; it.y = iy; iy += it.h + 6; nodes.push(it); edges.push({ a: k, b: it, hue: it.hue ?? k.hue ?? 186 }); }
        }
        n.h = iy - n.y + 4; cx += n.w + (HGAP.task || 16); return;
      }
      if (n.type === 'task' || n.type === 'thread' || !n.kids.length) {
        const items = n.type === 'task' ? n.kids : [];
        const w = Math.max(n.w, ...items.map(k => k.w + 22));
        n.x = cx + (w - n.w) / 2; cx += w + (HGAP[n.type] || 16);
        let iy = n.y + n.h + 14;
        items.forEach(k => { k.x = n.x + 22; k.y = iy; iy += k.h + 6; nodes.push(k); edges.push({ a: n, b: k, hue: k.hue ?? n.hue ?? 186 }); });
      } else {
        n.kids.forEach(put);
        const a = n.kids[0], b = n.kids[n.kids.length - 1];
        n.x = Math.max(0, (a.x + b.x + b.w) / 2 - n.w / 2);
        cx = Math.max(cx, n.x + n.w + (HGAP[n.type] || 16)) + (n.type === 'project' ? 30 : n.type === 'topic' ? 10 : 0);
        n.kids.forEach(k => edges.push({ a: n, b: k, hue: k.hue ?? n.hue ?? 186 }));
      }
      nodes.push(n);
    };
    put(root);
  };
  if (mapDir() === 'v') placeV(); else place(root);
  // manual positions: a node's offset also moves everything branching from it
  const off = St.layout[offKey()] || {}, tmp = UI.cvTemp && UI.cvTemp.kind === 'node' ? UI.cvTemp : null;
  const shift = (n, dx, dy) => {
    const o = off[n.id]; let x = dx + (o ? o.dx : 0), y = dy + (o ? o.dy : 0);
    if (tmp && tmp.id === n.id) { x += tmp.dx; y += tmp.dy; }
    n.x += x; n.y += y; n.kids.forEach(k => shift(k, x, y));
  };
  shift(root, 0, 0);
  const byTask = new Map(nodes.filter(n => n.type === 'task').map(n => [n.t.id, n]));
  const links = [];
  for (const n of byTask.values()) for (const rid of relIds(n.t)) { const m = byTask.get(rid); if (m) links.push({ from: m, to: n }); }
  const byId = new Map(nodes.map(n => [n.id, n]));
  // world bounds cover the tree and every board element
  let x0 = 0, y0 = 0, x1 = 400, y1 = 200;
  const grow = b => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); };
  nodes.forEach(grow);
  for (const el of boardEls()) grow(elBox(el));
  return { nodes, edges, links, root, projects, byId, byTask, x0: x0 - 40, y0: y0 - 40, w: x1 - x0 + 260, h: y1 - y0 + 80 };
}
// when the email that created a task was sent (the message in the thread where it was asked), and whether the
// task arrived in the last 24 hours (shown as NEW)
const mailDate = t => t.askedOn || (t.sourceDate || '').slice(0, 10) || '';
const isNewTask = t => !!t.createdAt && Date.now() - new Date(t.createdAt) < 864e5 && t.status !== 'done';
function mailDateLine(t) {
  const d = mailDate(t); if (!d) return '';
  const th = t.threadFirst && t.threadFirst !== d ? ` · conversation started ${fmtDate(t.threadFirst, { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
  return `<p class="small muted mail-date">✉ Asked in the email of <b>${esc(fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b>${esc(th)}${t.sourceFrom ? ` · from ${esc(E.clip(t.sourceFrom, 60))}` : ''}</p>`;
}
// tasks waiting on me: open, mine, not handed to someone else
const needsMe = t => t.status !== 'done' && t.status !== 'waiting' && isMine(t);
const myFocus = () => St.mode !== 'viewer' && !!(St.settings.ui || {}).mapMine;
const nodeTasks = n => n.tasks || (n.cats ? [...n.cats.values()].flatMap(c => c.tasks) : []);
const urgentForMe = t => { const c = dueInfo(t).cls; return c === 'over' || c === 'today' || t.priority === 'critical'; };
function mapNodeHTML(n, hits, day) {
  const st = `left:${n.x || 0}px;top:${n.y || 0}px;width:${n.w}px;${n.h ? `height:${n.h}px;` : ''}--h:${n.hue ?? 186}`;
  if (n.type === 'thread') return typeof threadNodeHTML === 'function' ? threadNodeHTML(n, st) : '';
  const more = n.hiddenKids ? `<span class="mmore">+${n.hiddenKids}</span>` : '';
  const rz = `<span class="rz" data-rz="${esc(n.id)}" data-kind="node" title="Drag to resize" aria-hidden="true"></span>`;
  const drag = UI.cvTemp && UI.cvTemp.kind === 'node' && UI.cvTemp.id === n.id ? ' dragging' : '';
  const drop = UI.cvDrop === n.id ? ' drop' : '';
  const dim = myFocus() && (n.type === 'project' || n.type === 'topic') && !nodeTasks(n).some(needsMe) ? ' dim' : '';
  if (n.type === 'root') {
    const all = [...St.tasks.values()]; const open = all.filter(t => t.status !== 'done').length;
    return `<div class="mnode root${drag}" data-node="root" style="${st}"><span class="brand-mark">${I.brand}</span><div><b>My work</b><small>${open} open · ${all.length - open} done</small></div></div>`;
  }
  if (n.type === 'project') {
    const pct = n.n ? 100 * n.done / n.n : 0;
    return `<div class="mnode project${drag}${drop}${dim}" data-node="${esc(n.id)}" data-type="project" data-pk="${esc(n.id)}" data-label="${esc(n.label)}" style="${st}">
      ${n.id === 'p:~' ? '<span class="gicon">🗂️</span>' : projBadge(n.label)}
      <div class="mtxt"><b dir="auto" data-edit="${esc(n.id)}">${esc(n.label)}</b><small>${n.n - n.done} open · ${n.done} done</small></div>${ring(pct, 34)}${more}
<span class="lk" data-link="1" title="Drag to another box to link them" aria-hidden="true"></span>
      <button class="mfocus" data-map="focus" title="Show only this project" aria-label="Show only this project">⤢</button>${n.id === 'p:~' ? '' : '<button class="mfocus mren" data-map="rename" title="Rename project" aria-label="Rename project">✎</button>'}<button class="mfocus mdel" data-map="del" title="Delete this project and its tasks" aria-label="Delete this project and its tasks">🗑</button>${rz}</div>`;
  }
  if (n.type === 'topic') {
    const open = n.tasks.filter(t => t.status !== 'done').length;
    return `<div class="mnode topic${drag}${drop}${dim}" data-node="${esc(n.id)}" data-type="topic" data-topic="${esc(n.key === '~' ? '' : n.label)}" data-plabel="${esc(n.tasks[0] ? projKeyLabel(n.tasks[0])[1] : '')}" style="${st}">
<span class="lk" data-link="1" title="Drag to another box to link them" aria-hidden="true"></span>
      <span class="cicon">${n.key === '~' ? '🗂️' : '🧩'}</span><div class="mtxt"><b dir="auto" data-edit="${esc(n.id)}">${esc(n.label)}</b><small>${open} open · ${n.tasks.length - open} done</small></div>${more}${n.key === '~' ? '' : '<button class="mfocus mren" data-map="rename" title="Rename topic" aria-label="Rename topic">✎</button>'}<button class="mfocus mdel" data-map="del" title="Delete this topic and its tasks" aria-label="Delete this topic and its tasks">🗑</button>${rz}</div>`;
  }
  if (n.type === 'task') {
    const t = n.t, d = dueInfo(t), subs = subsOf(t).length, links = relIds(t).length + [...St.tasks.values()].filter(x => relIds(x).includes(t.id)).length;
    const sug = t.placement && t.placement.status === 'suggested';
    const ach = [...St.daily.values()].filter(a => a.kind === 'achievement' && a.taskId === t.id).length;
    const fresh = Date.now() - (FRESH.get(t.id) || 0) < 2500;
    const cls = ['mnode', 'task', 'p-' + (t.priority || 'medium'), t.status === 'done' ? 'done' : '', UI.mapSel === t.id ? 'sel' : '', hits && hits.has(t.id) ? 'hit' : '', day && day.has(t.id) ? 'dayhit' : '', sug ? 'suggest' : '', fresh ? 'fresh' : '', needsMe(t) ? 'me' : '', needsMe(t) && urgentForMe(t) ? 'me-urgent' : '', isNewTask(t) ? 'is-new' : '', myFocus() && !needsMe(t) ? 'dim' : '', ...NODE_CLASS.map(f => { try { return f(t) || ''; } catch { return ''; } })].join(' ') + drag + drop;
    return `<div class="${cls}" data-node="${esc(n.id)}" data-type="task" data-tid="${esc(t.id)}" style="${st}">
<span class="lk" data-link="1" title="Drag to another box to link them" aria-hidden="true"></span>
      <button class="mtick" data-map="tick" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}">${I.check}</button>
      <div class="mtxt">${isNewTask(t) || needsMe(t) ? `<span class="mtags">${isNewTask(t) ? '<span class="mnew" title="Added in the last 24 hours">NEW</span>' : ''}${needsMe(t) ? `<span class="mme" title="Needs action by you">🙋 Your action</span>` : ''}</span>` : ''}<b dir="auto">${esc(t.title)}</b>
        <small><span class="mono">${esc(t.ref || '')}</span>${mailDate(t) ? `<span class="mmail" title="Date of the email where this was asked">✉ ${esc(fmtDate(mailDate(t)))}</span>` : ''}${t.status === 'done' ? `<span class="mdone">✓ ${esc(fmtDate((t.completedAt || t.updatedAt || '').slice(0, 10)))}</span>` : `<span class="duepill ${d.cls}">${dueEmoji(d)}${esc(d.txt)}</span>`}
        ${t.status === 'in_progress' ? '<span title="In progress">▶</span>' : ''}${subs ? `<button class="mitems" data-map="items" title="Show items">🗂️ ${subsDone(t)}/${subs}</button>` : ''}${links ? `<span title="Linked tasks">🔗 ${links}</span>` : ''}${isFromManager(t) ? '<span title="Assigned by your manager">👔</span>' : ''}${(t.days || []).includes(T()) ? '<span title="On today’s plan">📌</span>' : ''}${ach ? `<span title="Achievements">⭐ ${ach}</span>` : ''}${t.status === 'waiting' || t.ownership === 'waiting' ? '<span>⏳</span>' : ''}${t.status === 'blocked' ? '<span>⛔</span>' : ''}${sug ? '<span class="msug" title="Claude needs your confirmation">❓ Confirm</span>' : ''}${NODE_EXTRA.map(f => { try { return f(t) || ''; } catch { return ''; } }).join('')}</small></div><button class="mfocus mdel" data-map="del" title="Delete this task" aria-label="Delete this task">🗑</button>${rz}</div>`;
  }
  const s = n.s;
  return `<div class="mnode item ${s.done ? 'done' : ''}" data-node="${esc(n.id)}" data-type="item" data-tid="${esc(n.t.id)}" data-sid="${esc(s.id)}" style="${st}"><span class="subtick" aria-pressed="${!!s.done}">${I.check}</span><span class="itxt" dir="auto">${esc(s.text)}</span><button class="mfocus mdel" data-map="del" title="Delete this item" aria-label="Delete this item">🗑</button></div>`;
}
/* measure each node's natural height so boxes fit their full text */
const measureCache = new Map();
function measureNode(n) {
  if (n.type === 'root') return MH.root;
  const saved = n.h; n.h = 0; n.w = nodeW(n);
  const html = mapNodeHTML(n, null); n.h = saved;
  const key = n.w + '|' + html;
  if (measureCache.has(key)) return measureCache.get(key);
  let m = document.getElementById('map-measure');
  if (!m) { m = document.createElement('div'); m.id = 'map-measure'; m.setAttribute('aria-hidden', 'true'); m.style.cssText = 'position:absolute;left:-20000px;top:0;width:2000px;visibility:hidden;pointer-events:none'; document.body.appendChild(m); }
  m.innerHTML = deco(html);
  const h = Math.ceil(m.firstElementChild ? m.firstElementChild.offsetHeight : MH[n.type]);
  m.innerHTML = '';
  if (measureCache.size > 3000) measureCache.clear();
  measureCache.set(key, h); return h;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureCache.clear(); if (UI.view === 'todo' && UI.todoMode === 'map') render(); });
function edgePath(a, b) {
  if (mapDir() === 'v') {
    if (b.type === 'item') { const x1 = a.x + 12, y1 = a.y + a.h, y2 = b.y + b.h / 2; return `M${x1} ${y1} C${x1} ${y2}, ${x1} ${y2}, ${b.x} ${y2}`; }
    const x1 = a.x + a.w / 2, y1 = a.y + a.h, x2 = b.x + b.w / 2, y2 = b.y, c = (y2 - y1) * 0.5; return `M${x1} ${y1} C${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`;
  }
  const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, c = (x2 - x1) * 0.5; return `M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`;
}
function linkPath(a, b) { if (mapDir() === 'v') return smartPath(a, b); return linkPathH(a, b); }
function linkPathH(a, b) { const x = a.x + a.w, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, bend = 46 + Math.min(160, Math.abs(y2 - y1) * 0.22); return `M${x} ${y1} C${x + bend} ${y1}, ${x + bend} ${y2}, ${x + 6} ${y2}`; }
function activityList() {
  const ev = [];
  for (const t of St.tasks.values()) {
    for (const h of (t.history || [])) ev.push({ at: h.at, t, text: h.text });
    for (const s of subsOf(t)) if (s.done && s.doneAt) ev.push({ at: s.doneAt, t, text: 'Item done: ' + s.text });
  }
  for (const a of St.daily.values()) if (a.kind === 'achievement' && a.taskId && St.tasks.has(a.taskId)) ev.push({ at: a.createdAt, t: St.tasks.get(a.taskId), text: 'Achievement: ' + a.text });
  const day = UI.mapDay, until = UI.mapAsOf;
  return ev.filter(e => e.at && (!day || dayOf(e.at) === day) && (!until || dayOf(e.at) <= until)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}
function evEmoji(txt) {
  if (/^Created|^Added in the daily/.test(txt)) return '🆕'; if (/→ Done|Item done/.test(txt)) return '✅'; if (/^Achievement/.test(txt)) return '⭐'; if (/^Assigned by/.test(txt)) return '👔'; if (/^Status/.test(txt)) return '🔄'; if (/Deadline|deadline/.test(txt)) return '📅';
  if (/Linked|link/.test(txt)) return '🔗'; if (/Project|Moved|Category|placement|renamed/i.test(txt)) return '🧭'; if (/email/i.test(txt)) return '📨'; if (/daily plan/i.test(txt)) return '📌'; return '✏️';
}

/* --- board elements --- */
const PALETTE = ['ink', '#FFD966', '#FFB27A', '#F7A1C4', '#9EE0A7', '#8EC5FF', '#C9B3FF', '#E5484D', '#0A6B74'];
const colorCss = c => !c || c === 'ink' ? 'var(--ink)' : c;
const TOOLS = [
  ['select', 'V', 'Select and move', '<path d="M5 3l13 8-6 1.5L9 19z"/>'],
  ['hand', 'H', 'Pan (or hold Space)', '<path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7s-5-1.5-7-5l-1.5-3a1.5 1.5 0 0 1 2.6-1.4L8 13"/>'],
  ['task', 'K', 'New task node — click on the canvas, or on a project or topic', '<rect x="4" y="5" width="16" height="14" rx="3"/><path d="m8 12 2.5 2.5L16 9"/>'],
  ['sticky', 'N', 'Sticky note', '<path d="M5 4h14v10l-5 6H5z"/><path d="M14 20v-6h5"/>'],
  ['text', 'T', 'Text', '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>'],
  ['rect', 'R', 'Rectangle', '<rect x="4" y="6" width="16" height="12" rx="1.5"/>'],
  ['ellipse', 'O', 'Ellipse', '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'],
  ['diamond', 'D', 'Diamond (decision)', '<path d="M12 3l9 9-9 9-9-9z"/>'],
  ['arrow', 'A', 'Arrow', '<path d="M5 19 19 5M10 5h9v9"/>'],
  ['line', 'L', 'Line', '<path d="M5 19 19 5"/>'],
  ['connector', 'C', 'Link — drag from one box to another to link them (or drag the ● on any box). Between two tasks it links the tasks.', '<circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="5.5" r="2.5"/><path d="M7.5 16.5c2-5 4-7 9-9"/>'],
  ['pen', 'P', 'Pen', '<path d="M4 20l1-4L16 5l3 3L8 19z"/><path d="m14 7 3 3"/>'],
  ['highlighter', 'M', 'Highlighter', '<path d="m9 15-3 5h5l2-3"/><path d="M9 15 17 4l3 3-8 11z"/>'],
  ['eraser', 'E', 'Eraser — removes ink, shapes, notes and connectors it touches', '<path d="M4 16 14 6l6 6-8 8H8z"/><path d="M11 9l6 6M8 20h12"/>'],
  ['frame', 'F', 'Frame (group an area)', '<path d="M7 3v18M17 3v18M3 7h18M3 17h18"/>'],
];
const TOOL_KEY = Object.fromEntries(TOOLS.map(t => [t[1].toLowerCase(), t[0]]));
const CREATE_TOOLS = ['sticky', 'text', 'rect', 'ellipse', 'diamond', 'arrow', 'line', 'frame'];
const STAY_TOOLS = ['pen', 'highlighter', 'eraser', 'connector', 'hand', 'lasso'];
// feature files extend the canvas here: box element types (EL_HTML renders one, BOX_TYPES lists them), new elements
// from a tool (CREATE_EL), buttons for a selection (CTX_EXTRA, CTX_PRE), what a finished pen stroke turns into
// (STROKE_HOOKS), extra drawing on the world (WORLD_EXTRA), classes on task boxes (NODE_CLASS), snapping while
// moving (SNAP.fn)
const MORE_SECTIONS = []; // extra sections in the canvas ⋯ More menu
const EL_EDIT = {}, EL_HTML = {}, BOX_TYPES = ['sticky', 'text', 'shape'], CREATE_EL = {}, CTX_EXTRA = [], CTX_PRE = [], STROKE_HOOKS = [], WORLD_EXTRA = [], NODE_CLASS = [], SNAP = { fn: null };
// boards (pages): the task map lives on the main board; other boards hold notes and drawings only
const curPage = () => UI.page || 'main';
// layers: ink (pen, highlighter, lines), notes (notes, shapes, frames, tables…), tasks (the map) — each can be hidden or locked
const layerOf = el => ['stroke', 'line'].includes(el.type) ? 'ink' : 'notes';
const layerSet = k => (((St.settings.ui || {}).layers || {})[k]) || {};
const elLocked = el => !!el && !!layerSet(layerOf(el)).lock;
function boardEls() {
  const a = UI.mapAsOf, pg = curPage();
  return [...St.board.values()].filter(el => (el.page || 'main') === pg && !layerSet(layerOf(el)).hide && (!a || !el.createdAt || dayOf(el.createdAt) <= a))
    .sort((x, y) => (x.z || 0) - (y.z || 0) || (x.createdAt || '').localeCompare(y.createdAt || ''));
}
// element with the in-progress move / resize applied
function liveEl(el) {
  const tmp = UI.cvTemp; if (!tmp) return el;
  if (tmp.kind === 'els' && tmp.ids.has(el.id)) return moveEl(el, tmp.dx, tmp.dy);
  if (tmp.kind === 'elsize' && tmp.id === el.id) return { ...el, w: tmp.w, h: tmp.h };
  return el;
}
function moveEl(el, dx, dy) {
  if (el.type === 'stroke') return { ...el, pts: el.pts.map(p => [Math.round((p[0] + dx) * 10) / 10, Math.round((p[1] + dy) * 10) / 10, ...p.slice(2)]) };
  if (el.type === 'line') return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
  if (el.type === 'connector') return el;
  return { ...el, x: el.x + dx, y: el.y + dy };
}
function elBox(el) {
  el = liveEl(el);
  if (el.type === 'stroke') { const xs = el.pts.map(p => p[0]), ys = el.pts.map(p => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x || 1, h: Math.max(...ys) - y || 1 }; }
  if (el.type === 'line') { const x = Math.min(el.x1, el.x2), y = Math.min(el.y1, el.y2); return { x, y, w: Math.abs(el.x2 - el.x1) || 1, h: Math.abs(el.y2 - el.y1) || 1 }; }
  if (el.type === 'connector') return { x: 0, y: 0, w: 0, h: 0 };
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}
const strokePath = pts => {
  if (pts.length < 3) return `M${pts[0][0]} ${pts[0][1]} L${(pts[1] || pts[0])[0]} ${(pts[1] || pts[0])[1]}`;
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; d += ` Q${pts[i][0]} ${pts[i][1]} ${mx.toFixed(1)} ${my.toFixed(1)}`; }
  const l = pts[pts.length - 1]; return d + ` L${l[0]} ${l[1]}`;
};
function shapeSVG(kind) {
  if (kind === 'ellipse') return '<ellipse cx="50" cy="50" rx="49" ry="49"/>';
  if (kind === 'diamond') return '<path d="M50 1 99 50 50 99 1 50z"/>';
  if (kind === 'triangle') return '<path d="M50 2 98 98 2 98z"/>';
  return '<rect x="1" y="1" width="98" height="98" rx="4"/>';
}
function belHTML(el, hits) {
  el = liveEl(el);
  const sel = UI.cvSel.has(el.id) ? ' sel' : '', hit = hits && hits.has(el.id) ? ' hit' : '';
  const st = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px`;
  const rz = UI.cvSel.size === 1 && sel ? `<span class="rz" data-rz="${esc(el.id)}" data-kind="el" aria-hidden="true"></span>` : '';
  const txt = `<div class="btxt" dir="auto">${esc(el.text || '')}</div>`;
  const LK = '<span class="lk" data-link="1" title="Drag to another box to link them" aria-hidden="true"></span>';
  if (el.type === 'sticky') return `<div class="bel sticky${sel}${hit}" data-el="${esc(el.id)}" style="${st};--c:${colorCss(el.color === 'ink' ? '#FFD966' : el.color)}">${txt}${rz}${LK}</div>`;
  if (el.type === 'text') return `<div class="bel btext${sel}${hit}" data-el="${esc(el.id)}" style="${st};color:${colorCss(el.color)};font-size:${el.size || 20}px">${txt}${rz}${LK}</div>`;
  if (el.type === 'shape') return `<div class="bel shape${sel}${hit}" data-el="${esc(el.id)}" style="${st};--c:${colorCss(el.color)}"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${shapeSVG(el.kind)}</svg>${txt}${rz}${LK}</div>`;
  if (el.type === 'frame') return `<div class="bel frame${sel}${hit}" data-el="${esc(el.id)}" style="${st};--c:${colorCss(el.color === 'ink' ? '#8EC5FF' : el.color)}"><div class="ftitle btxt" dir="auto">${esc(el.text || 'Frame')}</div>${rz}${LK}</div>`;
  if (EL_HTML[el.type]) return EL_HTML[el.type](el, { sel: sel + hit + (elLocked(el) ? ' locked' : ''), st, rz, LK });
  return '';
}
function inkSVG(el, M) {
  el = liveEl(el);
  const sel = UI.cvSel.has(el.id) ? ' sel' : '';
  if (el.type === 'stroke' && el.pressure) return `<g class="ink${sel}" data-el="${esc(el.id)}"><path d="${pressurePath(el.pts, el.width)}" fill="${colorCss(el.color)}" ${el.alpha ? `fill-opacity="${el.alpha}"` : ''} stroke="none"/><path class="hit" d="${strokePath(el.pts)}" stroke-width="${Math.max(14, el.width + 10)}"/></g>`;
  if (el.type === 'stroke') { const d = strokePath(el.pts); return `<g class="ink${sel}" data-el="${esc(el.id)}"><path d="${d}" stroke="${colorCss(el.color)}" stroke-width="${el.width}" ${el.alpha ? `stroke-opacity="${el.alpha}"` : ''} fill="none" stroke-linecap="round" stroke-linejoin="round"/><path class="hit" d="${d}" stroke-width="${Math.max(14, el.width + 10)}"/></g>`; }
  if (el.type === 'line') { const d = `M${el.x1} ${el.y1} L${el.x2} ${el.y2}`; return `<g class="ink${sel}" data-el="${esc(el.id)}" style="color:${colorCss(el.color)}"><path d="${d}" stroke="currentColor" stroke-width="${el.width || 3}" fill="none" stroke-linecap="round" ${el.arrow ? 'marker-end="url(#cv-arrow)"' : ''}/><path class="hit" d="${d}" stroke-width="16"/></g>`; }
  if (el.type === 'connector') {
    const d = connD(el, M); if (!d) return '';
    return `<g class="ink conn${sel}" data-el="${esc(el.id)}" style="color:${colorCss(el.color)}"><path d="${d}" stroke="currentColor" stroke-width="${el.width || 2.5}" fill="none" stroke-linecap="round" stroke-dasharray="${el.dash ? '7 6' : ''}" ${el.arrow === false ? '' : 'marker-end="url(#cv-arrow)"'}/><path class="hit" d="${d}" stroke-width="16"/></g>`;
  }
  return '';
}
// a link that leaves and enters the two boxes on the sides that face each other, as a smooth curve; it follows the
// boxes when they move
function smartPath(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, dx = cb.x - ca.x, dy = cb.y - ca.y;
  const gapX = Math.abs(dx) - (a.w + b.w) / 2, gapY = Math.abs(dy) - (a.h + b.h) / 2;
  let p, q, n1, n2;
  if (gapX >= gapY) { const sx = Math.sign(dx) || 1; p = { x: sx > 0 ? a.x + a.w : a.x, y: ca.y }; q = { x: sx > 0 ? b.x : b.x + b.w, y: cb.y }; n1 = [sx, 0]; n2 = [-sx, 0]; }
  else { const sy = Math.sign(dy) || 1; p = { x: ca.x, y: sy > 0 ? a.y + a.h : a.y }; q = { x: cb.x, y: sy > 0 ? b.y : b.y + b.h }; n1 = [0, sy]; n2 = [0, -sy]; }
  const r = v => Math.round(v * 10) / 10, k = Math.max(28, Math.min(170, Math.hypot(q.x - p.x, q.y - p.y) * 0.42));
  return `M${r(p.x)} ${r(p.y)} C${r(p.x + n1[0] * k)} ${r(p.y + n1[1] * k)}, ${r(q.x + n2[0] * k)} ${r(q.y + n2[1] * k)}, ${r(q.x)} ${r(q.y)}`;
}
// a smart link: right-angle steps that go around every box on the canvas (never through one), with as few turns as
// possible and rounded corners; it re-routes whenever boxes move
const ROUTES = new Map();
function routeObstacles(M, skip) {
  const obs = [];
  for (const n of M.nodes) if (!skip.includes('n:' + n.id)) obs.push({ x: n.x, y: n.y, w: n.w, h: n.h || 40 });
  for (const el of boardEls()) if (['sticky', 'text', 'shape'].includes(el.type) && !skip.includes('e:' + el.id)) obs.push(elBox(liveEl(el)));
  return obs;
}
function routePath(a, b, obsAll) {
  const PAD = 14, BEND = 36, rr = v => Math.round(v);
  // only boxes near the two ends matter
  const X0 = Math.min(a.x, b.x) - 260, Y0 = Math.min(a.y, b.y) - 260, X1 = Math.max(a.x + a.w, b.x + b.w) + 260, Y1 = Math.max(a.y + a.h, b.y + b.h) + 260;
  const obs = obsAll.filter(o => o.x < X1 && o.x + o.w > X0 && o.y < Y1 && o.y + o.h > Y0);
  const key = [a, b, ...obs].map(o => `${rr(o.x)},${rr(o.y)},${rr(o.w)},${rr(o.h)}`).join(';');
  if (ROUTES.has(key)) return ROUTES.get(key);
  const inf = [...obs.map(o => [o.x - PAD, o.y - PAD, o.x + o.w + PAD, o.y + o.h + PAD]), ...[a, b].map(o => [o.x - PAD + 1, o.y - PAD + 1, o.x + o.w + PAD - 1, o.y + o.h + PAD - 1])];
  const inside = (x, y) => inf.some(r => x > r[0] && x < r[2] && y > r[1] && y < r[3]);
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const ports = o => [[o.x + o.w, o.y + o.h / 2, 0], [o.x + o.w / 2, o.y + o.h, 1], [o.x, o.y + o.h / 2, 2], [o.x + o.w / 2, o.y, 3]]
    .map(([x, y, d]) => ({ x, y, d, ex: x + DIRS[d][0] * PAD, ey: y + DIRS[d][1] * PAD })).filter(p => !inside(p.ex, p.ey));
  const pa = ports(a), pb = ports(b);
  let res = null;
  if (pa.length && pb.length) {
    const uniq = v => [...new Set(v.map(rr))].sort((m, n) => m - n);
    const addMid = v => { const out = [...v]; for (let i = 0; i + 1 < v.length; i++) if (v[i + 1] - v[i] > 2 * PAD) out.push((v[i] + v[i + 1]) / 2); return uniq(out); };
    const xs = addMid(uniq([X0, X1, ...inf.flatMap(r => [r[0], r[2]]), ...pa.map(p => p.ex), ...pb.map(p => p.ex)]));
    const ys = addMid(uniq([Y0, Y1, ...inf.flatMap(r => [r[1], r[3]]), ...pa.map(p => p.ey), ...pb.map(p => p.ey)]));
    const NX = xs.length, NY = ys.length, xi = new Map(xs.map((v, i) => [v, i])), yi = new Map(ys.map((v, i) => [v, i]));
    const S = (i, j, d) => ((j * NX + i) << 2) | d;
    const cost = new Float64Array(NX * NY * 4).fill(Infinity), prev = new Int32Array(NX * NY * 4).fill(-1);
    const goal = new Map(pb.map(p => [yi.get(rr(p.ey)) * NX + xi.get(rr(p.ex)), p]));
    const tx = b.x + b.w / 2, ty = b.y + b.h / 2, hgt = (i, j) => Math.abs(xs[i] - tx) + Math.abs(ys[j] - ty) * 0.999;
    // a small binary heap
    const H = []; const push = (f, s) => { H.push([f, s]); let i = H.length - 1; while (i) { const p = (i - 1) >> 1; if (H[p][0] <= H[i][0]) break; [H[p], H[i]] = [H[i], H[p]]; i = p; } };
    const pop = () => { const top = H[0], last = H.pop(); if (H.length) { H[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < H.length && H[l][0] < H[m][0]) m = l; if (r < H.length && H[r][0] < H[m][0]) m = r; if (m === i) break; [H[m], H[i]] = [H[i], H[m]]; i = m; } } return top; };
    for (const p of pa) { const i = xi.get(rr(p.ex)), j = yi.get(rr(p.ey)), s = S(i, j, p.d); cost[s] = 0; push(hgt(i, j), s); }
    let best = null, bestCost = Infinity, steps = 0;
    while (H.length && steps++ < 60000) {
      const [f, s] = pop(); const c = cost[s]; if (f - hgt(((s >> 2) % NX), Math.floor((s >> 2) / NX)) > c + 1e-6) continue;
      if (c >= bestCost) break;
      const cell = s >> 2, d = s & 3, i = cell % NX, j = (cell - i) / NX;
      const g = goal.get(cell);
      if (g) { const into = (g.d + 2) & 3, total = c + (d === into ? 0 : (d === g.d ? 2 : 1) * BEND); if (total < bestCost) { bestCost = total; best = { s, g }; } }
      for (let nd = 0; nd < 4; nd++) {
        if (nd === ((d + 2) & 3)) continue;
        const ni = i + DIRS[nd][0], nj = j + DIRS[nd][1]; if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
        if (inside((xs[i] + xs[ni]) / 2, (ys[j] + ys[nj]) / 2) || inside(xs[ni], ys[nj])) continue;
        const ns = S(ni, nj, nd), nc = c + Math.abs(xs[ni] - xs[i]) + Math.abs(ys[nj] - ys[j]) + (nd === d ? 0 : BEND);
        if (nc < cost[ns]) { cost[ns] = nc; prev[ns] = s; push(nc + hgt(ni, nj), ns); }
      }
    }
    if (best) {
      const pts = [[best.g.x, best.g.y]];
      for (let s = best.s; s >= 0; s = prev[s]) { const cell = s >> 2, i = cell % NX; pts.push([xs[i], ys[(cell - i) / NX]]); }
      const first = pts[pts.length - 1], start = pa.find(p => rr(p.ex) === first[0] && rr(p.ey) === first[1]) || pa[0];
      pts.push([start.x, start.y]); pts.reverse();
      res = roundedPath(pts);
    }
  }
  if (ROUTES.size > 400) ROUTES.clear();
  ROUTES.set(key, res);
  return res;
}
function roundedPath(raw) {
  const pts = raw.filter((p, i) => !i || p[0] !== raw[i - 1][0] || p[1] !== raw[i - 1][1]);
  const P = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !((pts[i - 1][0] === p[0] && p[0] === pts[i + 1][0]) || (pts[i - 1][1] === p[1] && p[1] === pts[i + 1][1])));
  const f = v => Math.round(v * 10) / 10;
  let d = `M${f(P[0][0])} ${f(P[0][1])}`;
  for (let i = 1; i < P.length - 1; i++) {
    const [px, py] = P[i - 1], [x, y] = P[i], [nx, ny] = P[i + 1];
    const r = Math.min(12, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
    const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
    d += ` L${f(x - ux * r)} ${f(y - uy * r)} Q${f(x)} ${f(y)} ${f(x + vx * r)} ${f(y + vy * r)}`;
  }
  const L = P[P.length - 1]; return d + ` L${f(L[0])} ${f(L[1])}`;
}
// links between tasks: each one gets its own lane in the free space beside the task column (right of the boxes on a
// left-to-right map, below them on a top-to-bottom one), clear of every box. Links over the same stretch run side by
// side instead of on top of each other, and several links on one box leave and enter it at different points. A link
// whose way out is blocked goes around the boxes instead.
function laneLinks(M) {
  if (!M.links.length) return [];
  const V = mapDir() === 'v', GAP = 46, STEP = 22, PAD = 10;
  // worked out as if the map ran left to right; on a top-to-bottom map x and y swap
  const T = o => V ? { x: o.y, y: o.x, w: o.h || 40, h: o.w } : { x: o.x, y: o.y, w: o.w, h: o.h || 40 };
  const back = V ? pts => pts.map(([x, y]) => [y, x]) : pts => pts;
  const obs = routeObstacles(M, []).map(T);
  const box = new Map(), ends = new Map();
  for (const l of M.links) for (const n of [l.from, l.to]) { if (!box.has(n.id)) box.set(n.id, T(n)); if (!ends.has(n.id)) ends.set(n.id, []); ends.get(n.id).push(l); }
  // where each link meets a box: spread over the side, in the order of the boxes at the other ends
  const port = new Map();
  for (const [id, ls] of ends) {
    const b = box.get(id), other = l => box.get((l.from.id === id ? l.to : l.from).id);
    ls.sort((p, q) => (other(p).y + other(p).h / 2) - (other(q).y + other(q).h / 2))
      .forEach((l, i) => port.set((l.from.id === id ? 'f:' : 't:') + M.links.indexOf(l), b.y + b.h * (i + 1) / (ls.length + 1)));
  }
  const hits = (x0, x1, y0, y1) => obs.find(o => o.x < x1 && o.x + o.w > x0 && o.y < y1 && o.y + o.h > y0);
  const items = M.links.map((l, i) => { const a = box.get(l.from.id), b = box.get(l.to.id), ya = port.get('f:' + i), yb = port.get('t:' + i); return { l, a, b, ya, yb, lo: Math.min(ya, yb), hi: Math.max(ya, yb) }; })
    .sort((p, q) => (p.hi - p.lo) - (q.hi - q.lo));
  const used = [], out = new Map();
  for (const it of items) {
    const { a, b, ya, yb, lo, hi } = it, ax = a.x + a.w, bx = b.x + b.w;
    let x = Math.max(ax, bx) + GAP;
    for (let g = 0; g < 40; g++) {
      const o = hits(x - PAD, x + PAD, lo - PAD, hi + PAD);
      if (o) { x = o.x + o.w + GAP; continue; }
      if (used.some(u => Math.abs(u.x - x) < STEP - 1 && u.lo < hi + 10 && u.hi > lo - 10)) { x += STEP; continue; }
      break;
    }
    // the short runs from each box out to the lane must be clear too
    const holds = (o, q) => o.x <= q.x && o.y <= q.y && o.x + o.w >= q.x + q.w && o.y + o.h >= q.y + q.h;
    const stub = (q, x0, y) => obs.some(o => !holds(o, q) && o.x < x && o.x + o.w > x0 && o.y < y + 2 && o.y + o.h > y - 2);
    if (stub(a, ax + 1, ya) || stub(b, bx + 1, yb)) continue;
    used.push({ x, lo, hi });
    out.set(it.l, roundedPath(back([[ax, ya], [x, ya], [x, yb], [bx + 3, yb]])));
  }
  return M.links.map(l => ({ l, d: out.get(l) || routePath(l.from, l.to, routeObstacles(M, ['n:' + l.from.id, 'n:' + l.to.id])) || linkPath(l.from, l.to) }));
}
// the path of a free link: smart (around boxes, the default), curved or straight
function connD(el, M) {
  const a = refBox(el.from, M), b = refBox(el.to, M); if (!a || !b) return '';
  if (el.shape === 'straight') { const [p, q] = clipBoxes(a, b); return `M${p.x} ${p.y} L${q.x} ${q.y}`; }
  if (el.shape === 'curve') return smartPath(a, b);
  return routePath(a, b, routeObstacles(M, [el.from.k + ':' + el.from.id, el.to.k + ':' + el.to.id])) || smartPath(a, b);
}
// a stylus stroke that is thicker where you press harder: the outline of the line, filled
function pressurePath(pts, width) {
  const n = pts.length; if (n < 2) return strokePath(pts);
  const P = i => { const a = pts[Math.max(0, i - 1)][2], b = pts[i][2], c = pts[Math.min(n - 1, i + 1)][2]; return ((a ?? .5) + 2 * (b ?? .5) + (c ?? .5)) / 4; };
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const pr = pts[Math.max(0, i - 1)], nx = pts[Math.min(n - 1, i + 1)], dx = nx[0] - pr[0], dy = nx[1] - pr[1], len = Math.hypot(dx, dy) || 1;
    const rr = width * (0.3 + 0.9 * P(i)) / 2, ox = -dy / len * rr, oy = dx / len * rr;
    L.push([pts[i][0] + ox, pts[i][1] + oy]); R.push([pts[i][0] - ox, pts[i][1] - oy]);
  }
  const f = v => Math.round(v * 10) / 10, seq = [...L, ...R.reverse()];
  let d = `M${f(seq[0][0])} ${f(seq[0][1])}`;
  for (let i = 1; i < seq.length - 1; i++) { const mx = (seq[i][0] + seq[i + 1][0]) / 2, my = (seq[i][1] + seq[i + 1][1]) / 2; d += ` Q${f(seq[i][0])} ${f(seq[i][1])} ${f(mx)} ${f(my)}`; }
  return d + ' Z';
}
function refBox(ref, M) {
  if (!ref) return null;
  if (ref.k === 'n') { const n = M.byId.get(ref.id); return n ? { x: n.x, y: n.y, w: n.w, h: n.h } : null; }
  const el = St.board.get(ref.id); return el && !['stroke', 'line', 'connector'].includes(el.type) ? elBox(el) : null;
}
// line between two boxes, from edge to edge along the centre line
function clipBoxes(a, b) {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const clip = (box, c, toward) => {
    const dx = toward.x - c.x, dy = toward.y - c.y; if (!dx && !dy) return c;
    const s = Math.min(dx ? (box.w / 2) / Math.abs(dx) : Infinity, dy ? (box.h / 2) / Math.abs(dy) : Infinity);
    return { x: Math.round((c.x + dx * Math.min(1, s)) * 10) / 10, y: Math.round((c.y + dy * Math.min(1, s)) * 10) / 10 };
  };
  return [clip(a, ca, cb), clip(b, cb, ca)];
}
function mapHits() {
  const q = E.normMatch(UI.mapQ || ''); if (!q) return null;
  const hits = new Set(); const words = q.split(' ');
  for (const t of St.tasks.values()) { const h = E.normMatch([t.ref, t.title, t.action, t.project, topicOf(t), subsOf(t).map(x => x.text).join(' ')].join(' ')); if (words.every(w => h.includes(w))) hits.add(t.id); }
  for (const el of St.board.values()) if (el.text && words.every(w => E.normMatch(el.text).includes(w))) hits.add(el.id);
  return hits;
}
function worldHTML(M) {
  const hits = mapHits(); const day = UI.mapDay ? dayTaskIds(UI.mapDay) : null;
  const sel = UI.mapSel;
  const els = boardEls();
  const frames = els.filter(e => e.type === 'frame'), blocks = els.filter(e => BOX_TYPES.includes(e.type)), ink = els.filter(e => ['stroke', 'line', 'connector'].includes(e.type));
  const showMap = curPage() === 'main' && !layerSet('tasks').hide;
  if (!showMap) M = { ...M, nodes: [], edges: [], links: [], projects: [] };
  return `${frames.map(e => belHTML(e, hits)).join('')}
    <svg class="map-edges" width="${M.w}" height="${M.h}" aria-hidden="true">
      <defs><marker id="arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrowhead"/></marker><marker id="link-dot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="4" class="arrowhead"/></marker></defs>
      ${UI.mapBands !== false && M.projects.length ? projectBands(M).map(b => `<rect class="band" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="26" style="--h:${b.hue}"/>`).join('') : ''}
      ${M.edges.map(e => `<path class="edge ${e.b.type === 'task' && e.b.t.status === 'done' ? 'done' : ''}" style="--h:${e.hue}" d="${edgePath(e.a, e.b)}"/>`).join('')}
      ${laneLinks(M).map(({ l, d }) => { const hot = sel && (l.from.t.id === sel || l.to.t.id === sel) ? ' hot' : ''; return `<path class="link-halo${hot}" d="${d}"/><path class="link${hot}" d="${d}" marker-start="url(#link-dot)" marker-end="url(#arrow)"/>`; }).join('')}
    </svg>
    ${blocks.map(e => belHTML(e, hits)).join('')}
    ${UI.mapBands !== false && M.projects.length ? projectBands(M).map(b => `<div class="band-label" style="left:${b.x + 14}px;top:${b.y + 10}px;--h:${b.hue}" dir="auto">${esc(b.label)}</div>`).join('') : ''}
    ${M.nodes.map(n => mapNodeHTML(n, hits, day)).join('')}
    ${WORLD_EXTRA.map(f => { try { return f(M) || ''; } catch { return ''; } }).join('')}
    <svg class="map-ink" width="${M.w}" height="${M.h}">
      <defs><marker id="cv-arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
      ${ink.map(e => inkSVG(e, M)).join('')}
      <g id="cv-live"></g>
    </svg>`;
}
function ctxHTML() {
  for (const f of CTX_PRE) { const h = f(); if (h) return h; }
  const ids = [...UI.cvSel].filter(id => St.board.has(id));
  if (!ids.length && UI.mapSel && St.tasks.has(UI.mapSel)) { const t = St.tasks.get(UI.mapSel); return `<div class="cv-ctx" role="toolbar" aria-label="Selected task"><span class="small muted">${esc(t.ref || 'Task')} selected</span><button class="btn sm ghost danger" data-act="cv-del" title="Delete (Del)">${I.trash} Delete</button></div>`; }
  if (!ids.length) return '';
  const els = ids.map(id => St.board.get(id)); const one = els.length === 1 ? els[0] : null;
  const canTask = one && ['sticky', 'text', 'shape'].includes(one.type) && (one.text || '').trim();
  const inked = els.some(e => ['stroke', 'line', 'connector'].includes(e.type));
  return `<div class="cv-ctx" role="toolbar" aria-label="Selection">
    <span class="small muted">${els.length} selected</span>
    ${PALETTE.map(c => `<button class="sw" data-act="cv-recolor" data-c="${c}" style="--c:${colorCss(c)}" aria-label="Colour ${c}"></button>`).join('')}
    ${inked ? `<button class="btn sm ghost" data-act="cv-width" data-d="-1" aria-label="Thinner">−</button><button class="btn sm ghost" data-act="cv-width" data-d="1" aria-label="Thicker">＋</button>` : ''}
    ${canTask ? `<button class="btn sm" data-act="cv-to-task" title="Turn this note into a task in your to-do list">→ Task</button>` : ''}
    ${CTX_EXTRA.map(f => { try { return f(els, one) || ''; } catch { return ''; } }).join('')}
    ${one && one.type === 'connector' ? `<button class="btn sm ghost" data-act="cv-conn" data-k="shape" title="Line style: smart (goes around boxes), curved or straight">${one.shape === 'straight' ? '╱ Straight' : one.shape === 'curve' ? '∿ Curved' : '⌐ Smart'}</button><button class="btn sm ghost" data-act="cv-conn" data-k="dash" aria-pressed="${!!one.dash}" title="Dashed line">┄</button><button class="btn sm ghost" data-act="cv-conn" data-k="arrow" aria-pressed="${one.arrow !== false}" title="Arrow at the end">➝</button>` : ''}
    <button class="btn sm ghost" data-act="cv-front" title="Bring to front">⬆</button><button class="btn sm ghost" data-act="cv-dup" title="Duplicate (Ctrl+D)">⧉</button>
    <button class="btn sm ghost danger" data-act="cv-del" title="Delete (Del)">${I.trash}</button></div>`;
}
// tools in groups; a group shows its last-used tool and opens a flyout with the others
const TOOL_GROUPS = [['select'], ['hand'], ['task'], ['sticky'], ['text'], ['connector'], ['rect', 'ellipse', 'diamond'], ['arrow', 'line'], ['pen', 'highlighter', 'eraser'], ['frame']];
UI.toolPick = UI.toolPick || {};
function toolsHTML() {
  const T_ = Object.fromEntries(TOOLS.map(t => [t[0], t]));
  const btn = (k, extra = '') => { const [, key, label, d] = T_[k]; return `<button class="cvt ${UI.tool === k ? 'on' : ''}${extra}" data-act="cv-tool" data-tool="${k}" title="${esc(label)} (${key})" aria-label="${esc(label)}" aria-pressed="${UI.tool === k}">${svg(d, 18)}</button>`; };
  return `<div class="cv-tools" role="toolbar" aria-label="Canvas tools">
    ${TOOL_GROUPS.map((g, gi) => {
      if (g.length === 1) return btn(g[0]);
      const cur = g.includes(UI.tool) ? UI.tool : (UI.toolPick[gi] && g.includes(UI.toolPick[gi]) ? UI.toolPick[gi] : g[0]);
      return `<div class="cvt-group" data-group="${gi}">${btn(cur, ' has-more')}<div class="cvt-fly" role="group">${g.map(k => btn(k)).join('')}</div></div>`;
    }).join('')}
  </div>
  ${typeof toolPanelHTML === 'function' ? toolPanelHTML() : ''}
  <div class="cv-sub" role="toolbar" aria-label="Colour and history">
    <button class="cvt zoom-lock ${zoomLocked() ? 'on' : ''}" data-act="zoom-lock" aria-pressed="${zoomLocked()}" title="${zoomLocked() ? 'Zoom is locked — tap to unlock' : 'Lock the zoom where it is'}">${zoomLocked() ? '🔒' : '🔓'}<span id="zoom-pct">${Math.round(UI.map.k * 100)}%</span></button>
    <button class="cvt" data-act="touch-open" title="Touch & stylus settings" aria-label="Touch and stylus settings">${svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 18)}</button>
    <span class="cvt-sep"></span>
    <button class="cvt" data-act="cv-undo" title="Undo (Ctrl+Z)" aria-label="Undo" ${UI.cvUndo.length ? '' : 'disabled'}>${svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', 18)}</button>
    <button class="cvt" data-act="cv-redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" ${UI.cvRedo.length ? '' : 'disabled'}>${svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>', 18)}</button>
  </div>`;
}
// Map / Board / List: at the start of the canvas toolbar in Map, above the list in Board and List
function saveSettingsUi(patch) { const st = clone(St.settings); st.ui = { ...(st.ui || {}), ...patch }; putSettings(st); }
// more presentations (Timeline, Priority matrix) register here from features/29-views.js
const TODO_VIEWS = {};
const TODO_MODES = [['map', '🧠', 'Map', 'Mind map'], ['timeline', '📅', 'Timeline', 'Timeline: from when each task was asked to its deadline'], ['matrix', '⊞', 'Matrix', 'Priority matrix: urgent × important'], ['board', '▦', 'Board', 'Board by status'], ['list', '☰', 'List', 'List']];
function modeSegHTML() { return `<div class="seg mode-seg" role="group" aria-label="Layout">${TODO_MODES.filter(([k]) => k === 'map' || k === 'board' || k === 'list' || TODO_VIEWS[k]).map(([k, i, l, tt]) => `<button data-act="todo-mode" data-mode="${k}" aria-pressed="${UI.todoMode === k}" title="${esc(tt)}">${i}<span class="lbl">${l}</span></button>`).join('')}</div>`; }
function viewMap() {
  const M = buildMap(); UI.mapLayout = M;
  const hits = mapHits();
  const allProjects = [...new Map([...St.tasks.values()].map(t => projKeyLabel(t))).entries()].sort((a, b) => (a[0] === 'p:~') - (b[0] === 'p:~') || a[1].localeCompare(b[1]));
  const sugN = [...St.tasks.values()].filter(t => t.placement && t.placement.status === 'suggested').length;
  const act = UI.mapActivity ? activityList() : [];
  const offN = Object.keys(St.layout[offKey()] || {}).length + Object.keys(St.layout.size || {}).length;
  return `<div class="map-wrap ${UI.mapFull ? 'full' : ''}">
    ${sugN ? callout('info', `<div class="row"><span>❓ Claude wasn’t sure where ${sugN} task${sugN > 1 ? 's belong' : ' belongs'}. Pick the right place from its suggestions.</span><span class="spacer"></span><button class="btn sm primary" data-act="map-next-suggest">Review</button></div>`) : ''}
    ${UI.mapRefresh && (UI.mapRefresh.pending || UI.mapRefresh.binned) ? callout('info', `<div class="row"><span>⟳ Canvas refreshed.${UI.mapRefresh.pending ? ` <b>${UI.mapRefresh.pending}</b> analysed email${UI.mapRefresh.pending > 1 ? 's have' : ' has'} tasks not added yet.` : ''}${UI.mapRefresh.binned ? ` <b>${UI.mapRefresh.binned}</b> task${UI.mapRefresh.binned > 1 ? 's' : ''} from emails ${UI.mapRefresh.binned > 1 ? 'were' : 'was'} deleted in the last 30 days.` : ''}</span><span class="spacer"></span>${UI.mapRefresh.pending ? '<button class="btn sm primary" data-act="map-add-pending">Add their tasks</button>' : ''}${UI.mapRefresh.binned ? '<button class="btn sm" data-act="map-restore-binned">Put them back</button>' : ''}<button class="btn sm ghost" data-act="map-refresh-close">✕</button></div>`) : ''}
    ${UI.mapAsOf ? callout('info', `<div class="row"><span>🕒 Showing the map as it was on <b>${esc(fmtDate(UI.mapAsOf, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</b>: later tasks are hidden and work finished later shows as open. Projects and topics are shown as they are now.</span><span class="spacer"></span><button class="btn sm" data-act="map-now">Back to now</button></div>`) : ''}
    <div class="map-toolbar">
      <div class="map-tools" role="toolbar" aria-label="Canvas">
        ${modeSegHTML()}
        <label class="search todo-search">${I.search}<span class="sr">Find on map</span><input class="input" id="map-q" type="search" placeholder="Find a task, item or note…" value="${esc(UI.mapQ)}" data-inp="mapQ"></label>
        ${hits ? `<span class="small muted mt-hits">${hits.size} found</span>` : ''}
        <span class="mt-spacer"></span>
        ${St.mode !== 'viewer' ? `<button class="btn sm primary mt-new" data-act="new-task" title="New task">${I.plus}<span class="lbl">Task</span></button>` : ''}
        ${St.mode !== 'viewer' ? (() => { const n = [...St.tasks.values()].filter(needsMe).length; return `<button class="btn sm mt-mine ${myFocus() ? 'on' : ''}" data-act="map-mine" aria-pressed="${myFocus()}" title="Highlight the tasks that need action by you and fade the rest (Shift+M)">🙋<span class="lbl">My actions</span> <b class="mt-count">${n}</b></button>`; })() : ''}
        <div class="mt-group">
          <button class="btn sm" data-act="map-rearrange" title="Put every box back in tidy order (Shift+R)">⊞<span class="lbl">Rearrange</span></button>
          <button class="btn sm" data-act="map-refresh" title="Show every task and email again">⟳<span class="lbl">Refresh</span></button>
        </div>
        <div class="seg zoom mt-seg"><button data-act="map-zoom" data-z="-1" aria-label="Zoom out" title="Zoom out">−</button><button data-act="map-fit" aria-label="Fit to screen" title="Fit to screen">Fit</button><button data-act="map-zoom" data-z="1" aria-label="Zoom in" title="Zoom in">+</button></div>
        ${DESKTOP && !SUBWIN ? '<button class="btn sm" data-act="pop-out" data-view="todo" title="Open the canvas in another window (second monitor)">⧉</button>' : ''}
        <button class="btn sm" data-act="map-full" aria-pressed="${UI.mapFull}" title="${UI.mapFull ? 'Exit full screen (Esc)' : 'Full screen (Shift+F)'}" aria-label="Full screen">${UI.mapFull ? '⤡' : '⤢'}</button>
        <details class="menu mt-more" ${UI.menuOpen === 'options' ? 'open' : ''} data-menu="options"><summary class="btn sm ${UI.mapDay || UI.mapAsOf ? 'on' : ''}" title="Show, history and export">⋯<span class="lbl">More</span>${UI.mapDay || UI.mapAsOf ? ' ·' : ''}</summary><div class="menu-pop mt-pop">
          <div class="mt-sec"><div class="label">Direction</div>
            <div class="seg" role="group" aria-label="Map direction"><button data-act="map-dir" data-dir="h" aria-pressed="${mapDir() === 'h'}">→ Left to right</button><button data-act="map-dir" data-dir="v" aria-pressed="${mapDir() === 'v'}">↓ Top to bottom</button></div></div>
          ${St.mode !== 'viewer' && typeof traceAll === 'function' ? `<div class="mt-sec"><div class="label">Tasks</div><button class="btn sm" data-act="trace-all" ${TRC.running ? 'disabled' : ''}>🔎 ${TRC.running ? 'Tracing…' : 'Trace open tasks in my emails'}</button></div>` : ''}
          <div class="mt-sec"><div class="label">Stylus & touch</div><button class="btn sm" data-act="touch-open">✍ Touch & stylus settings…</button></div>
          <div class="mt-sec"><div class="label">Show</div>
            <label class="check small"><input type="checkbox" id="map-done" data-chg="map-opt" data-key="mapShowDone" ${UI.mapShowDone ? 'checked' : ''}>Completed tasks (history)</label>
            <label class="check small"><input type="checkbox" id="map-act" data-chg="map-opt" data-key="mapActivity" ${UI.mapActivity ? 'checked' : ''}>Activity panel</label>
            <label class="check small"><input type="checkbox" id="map-bands" data-chg="map-opt" data-key="mapBands" ${UI.mapBands !== false ? 'checked' : ''}>Project colour bands</label>
            <label class="check small"><input type="checkbox" id="map-mini" data-chg="map-opt" data-key="mapMini" ${UI.mapMini !== false ? 'checked' : ''}>Minimap</label>
            <label class="check small"><input type="checkbox" id="map-threads" data-chg="map-opt" data-key="mapThreads" ${UI.mapThreads !== false ? 'checked' : ''}>Email threads under each topic</label>
            <label class="check small"><input type="checkbox" id="map-thread-tasks" data-chg="map-opt" data-key="mapThreadTasks" ${UI.mapThreadTasks !== false ? 'checked' : ''}>Tasks inside their email thread</label>
            ${offN || Object.keys(St.layout.size || {}).length ? `<button class="btn sm ghost" data-act="map-reset-layout" title="Put every box back in its place and its normal size">↺ Reset positions and sizes</button>` : ''}</div>
          <div class="mt-sec"><div class="label">History</div>
            <label class="small map-date" title="Highlight the tasks worked on that day">📌 Highlight day <input class="input" type="date" id="map-day" data-chg="map-day" value="${esc(UI.mapDay)}" max="${T()}"></label>
            <label class="small map-date" title="Show the map as it was on a past date">🕒 Map as of <input class="input" type="date" id="map-asof" data-chg="map-asof" value="${esc(UI.mapAsOf)}" max="${T()}"></label>
            ${UI.mapDay || UI.mapAsOf ? '<button class="btn sm ghost" data-act="map-hist-clear">Clear</button>' : ''}</div>
          ${MORE_SECTIONS.map(f => { try { return f() || ''; } catch { return ''; } }).join('')}
          <div class="mt-sec"><div class="label">Export</div>
            <button class="btn sm ghost" data-act="map-export" data-f="png">🖼 Image (PNG)</button>
            <button class="btn sm ghost" data-act="map-export" data-f="pdf">📄 PDF</button>
            ${DESKTOP ? '<button class="btn sm ghost" data-act="map-share">🔗 Share link (always up to date)…</button>' : ''}</div>
        </div></details>
      </div>
      <div class="map-projects" role="toolbar" aria-label="Projects">
        <button class="mp-chip ${UI.mapFocus === 'all' ? 'on' : ''}" data-act="map-focus" data-pk="all">🌐 All projects</button>
        ${allProjects.map(([k, l]) => `<button class="mp-chip ${UI.mapFocus === k ? 'on' : ''}" data-act="map-focus" data-pk="${esc(k)}">${k === 'p:~' ? '🗂️' : projBadge(l, 'xs')}<span dir="auto">${esc(l)}</span></button>`).join('')}
      </div>
    </div>
    <div class="map-body ${UI.mapActivity ? 'with-act' : ''}">
      <div class="map-viewport ${UI.mapDay ? 'dayon' : ''} ${myFocus() ? 'mine-on' : ''}" id="map-vp" data-tool="${esc(UI.tool)}" tabindex="0" aria-label="Task canvas. Drag to move around, scroll or pinch to zoom.">
        <div class="map-world" id="map-world" style="width:${M.w}px;height:${M.h}px;transform:translate(${UI.map.x}px,${UI.map.y}px) scale(${UI.map.k})">${worldHTML(M)}</div>
        ${M.projects.length || St.board.size ? '' : `<div class="empty map-empty"><div class="big-emoji">🧠</div><h3>Your canvas is empty</h3><p>Approved tasks appear here, branching from projects and topics. Use the tools on the left to add notes, shapes and drawings.</p><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button></div>`}
        ${toolsHTML()}
        <div id="cv-ctx-slot">${ctxHTML()}</div>
        ${UI.mapMini !== false && (M.projects.length || St.board.size) ? '<canvas class="minimap" id="minimap" width="200" height="130" aria-label="Minimap — click to move there"></canvas>' : ''}
      </div>
      ${UI.mapActivity ? `<aside class="map-activity"><div class="label" style="padding:12px 14px 6px">Activity${UI.mapDay ? ' · ' + esc(fmtDate(UI.mapDay)) : ''}</div>${act.length ? `<ol>${act.map(e => `<li><button data-act="map-goto" data-id="${esc(e.t.id)}"><span class="ae">${evEmoji(e.text)}</span><span class="atxt"><b>${esc(e.t.ref || '')}</b> <span dir="auto">${esc(E.clip(e.t.title, 60))}</span><small dir="auto">${esc(e.text)}</small></span><time>${esc(fmtDate(e.at.slice(0, 10)))}</time></button></li>`).join('')}</ol>` : '<p class="small muted" style="padding:0 14px">No activity yet.</p>'}</aside>` : ''}
    </div>
  </div>`;
}
const TOOL_HINT = {
  select: 'Drag empty space to move around · scroll or pinch to zoom · drag a node to move it (its branch follows) · drop a task on a project, topic or task to move or link it · Shift+drag to select notes',
  hand: 'Drag to move around the canvas', task: 'Click empty canvas for a new task, or click a project or topic to add the task there',
  sticky: 'Click to place a sticky note, then type', text: 'Click to add text', rect: 'Drag to draw a rectangle', ellipse: 'Drag to draw an ellipse', diamond: 'Drag to draw a diamond',
  arrow: 'Drag to draw an arrow', line: 'Drag to draw a line', connector: 'Drag from one task, node or note to another to connect them',
  pen: 'Draw freehand', highlighter: 'Highlight freehand', eraser: 'Drag over ink, notes, shapes or connectors to erase them', frame: 'Drag to frame an area',
};
// re-render only the world (fast path for dragging, drawing and selection)
let worldRaf = null;
function renderWorld() {
  const w = $('#map-world'); if (!w) return;
  const M = buildMap(); UI.mapLayout = M;
  w.style.width = M.w + 'px'; w.style.height = M.h + 'px';
  w.innerHTML = deco(worldHTML(M));
  const c = $('#cv-ctx-slot'); if (c) c.innerHTML = deco(ctxHTML());
}
function renderWorldSoon() { if (worldRaf) return; worldRaf = requestAnimationFrame(() => { worldRaf = null; renderWorld(); }); }
/* --- camera --- */
function applyCam(animate) {
  const w = $('#map-world'); if (!w) return;
  w.classList.toggle('anim', !!animate);
  w.style.transform = `translate(${UI.map.x}px,${UI.map.y}px) scale(${UI.map.k})`;
  // sharp at every zoom: the canvas is a fast moving layer only while you pan or zoom; a moment after you stop,
  // the browser draws text and lines again at the new size instead of stretching a picture of them
  w.classList.add('moving'); clearTimeout(UI.camSharp); UI.camSharp = setTimeout(() => { const ww = $('#map-world'); if (ww) ww.classList.remove('moving'); }, 160);
  // semantic zoom: far out, details hide and project labels grow so the map stays readable
  w.style.setProperty('--k', UI.map.k);
  const zl = document.getElementById('zoom-pct'); if (zl) zl.textContent = Math.round(UI.map.k * 100) + '%';
  const vp = $('#map-vp'); if (vp) { vp.classList.toggle('z-far', UI.map.k < 0.38); vp.classList.toggle('z-mid', UI.map.k >= 0.38 && UI.map.k < 0.6); }
  drawMinimap();
}
function mapFit(smart) {
  const vp = $('#map-vp'), M = UI.mapLayout; if (!vp || !M) return;
  const W = vp.clientWidth, H = vp.clientHeight;
  const fitK = Math.min(1, (W - 120) / M.w, (H - 60) / M.h);
  const k = zoomLocked() ? UI.map.k : smart === true ? Math.max(W < 600 ? 0.5 : 0.6, Math.min(1, fitK)) : Math.max(0.2, fitK);
  UI.map.k = k;
  UI.map.x = M.w * k <= W - 60 ? (W + 60 - M.w * k) / 2 - M.x0 * k : 70 - M.x0 * k;
  if (M.h * k <= H) UI.map.y = (H - M.h * k) / 2 - M.y0 * k;
  else { const r = M.nodes.find(n => n.type === 'root'); UI.map.y = H / 2 - (r ? r.y + r.h / 2 : 0) * k; }
  UI.map.fitted = true; applyCam(true);
}
// two-finger zoom ends on 25 %, 50 %, 100 %… when it stops close to one (Touch & stylus › Zoom snap)
function zoomSnapEnd() {
  if (!touchCfg().zoomSnap || zoomLocked()) return;
  const k = UI.map.k, t = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4].find(v => Math.abs(k / v - 1) < 0.1);
  if (t && t !== k) mapZoom(t / k);
}
function mapZoom(f, cx, cy) {
  const vp = $('#map-vp'); if (!vp) return;
  if (zoomLocked()) { if (f !== 1 && !MP.lockToast) { MP.lockToast = setTimeout(() => { MP.lockToast = null; }, 2500); toast('🔒 Zoom is locked — tap the lock to unlock it.'); } return; }
  const r = vp.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
  const k2 = Math.max(0.15, Math.min(5, UI.map.k * f));
  UI.map.x = cx - (cx - UI.map.x) * (k2 / UI.map.k); UI.map.y = cy - (cy - UI.map.y) * (k2 / UI.map.k); UI.map.k = k2; applyCam(false);
}
function centerOnTask(id) {
  const t = St.tasks.get(id); if (!t) return;
  if (t.status === 'done' && !UI.mapShowDone) UI.mapShowDone = true;
  const [pk] = projKeyLabel(t); if (UI.mapFocus !== 'all' && UI.mapFocus !== pk) UI.mapFocus = 'all';
  if (UI.mapAsOf && t.createdAt && dayOf(t.createdAt) > UI.mapAsOf) UI.mapAsOf = '';
  for (const k of [pk, topicKey(t), 'root']) UI.mapCollapsed.delete(k);
  UI.mapSel = id;
  if (UI.view !== 'todo' || UI.todoMode !== 'map') { UI.todoMode = 'map'; saveTodoPrefs(); if (UI.view !== 'todo') { UI.view = 'todo'; closeDrawer(); } }
  render();
  requestAnimationFrame(() => {
    const vp = $('#map-vp'), n = UI.mapLayout && UI.mapLayout.nodes.find(x => x.id === 't:' + id); if (!vp || !n) return;
    if (!zoomLocked()) UI.map.k = Math.max(UI.map.k, 0.85);
    UI.map.x = vp.clientWidth / 2 - (n.x + n.w / 2) * UI.map.k; UI.map.y = vp.clientHeight / 2 - (n.y + n.h / 2) * UI.map.k; applyCam(true);
    vp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
// the canvas takes all the height left on the screen below its toolbar (at least 480 px)
function fitMapHeight() {
  const vp = $('#map-vp'); if (!vp) return;
  const top = vp.getBoundingClientRect().top + window.scrollY, h = window.innerHeight - (top < window.innerHeight * 0.7 ? top : 120) - 16;
  document.documentElement.style.setProperty('--vp-fit', Math.max(480, Math.round(h)) + 'px');
}
window.addEventListener('resize', () => { if (UI.view === 'todo' && UI.todoMode === 'map') fitMapHeight(); });
function afterMapRender() {
  const vp = $('#map-vp'); if (!vp) return;
  const h0 = vp.clientHeight; fitMapHeight(); if (Math.abs(vp.clientHeight - h0) > 40) UI.map.fitted = false;
  if (!UI.map.fitted) requestAnimationFrame(() => mapFit(true));
  vp.addEventListener('wheel', e => {
    e.preventDefault();
    // with the zoom locked the wheel (or a two-finger trackpad swipe) moves the canvas instead
    if (zoomLocked()) { if (!e.ctrlKey) { UI.map.x -= e.deltaX; UI.map.y -= e.deltaY; applyCam(false); } return; }
    const r = vp.getBoundingClientRect(); mapZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
}

/* --- changes with undo / redo --- */
// A change lists the new value (or null to delete) for board elements and tasks, and/or a new layout.
function cvSnapshot(ch) {
  const inv = {};
  if (ch.els) { inv.els = {}; for (const id of Object.keys(ch.els)) inv.els[id] = St.board.has(id) ? clone(St.board.get(id)) : null; }
  if (ch.tasks) { inv.tasks = {}; for (const id of Object.keys(ch.tasks)) inv.tasks[id] = St.tasks.has(id) ? clone(St.tasks.get(id)) : null; }
  if (ch.layout) inv.layout = clone(St.layout);
  return inv;
}
function cvApplyRaw(ch) {
  for (const [id, v] of Object.entries(ch.els || {})) v ? putBoard(clone(v)) : delBoard(id);
  for (const [id, v] of Object.entries(ch.tasks || {})) v ? putTask(clone(v)) : delTask(id);
  if (ch.layout) putLayout(clone(ch.layout));
  for (const id of UI.cvSel) if (!St.board.has(id)) UI.cvSel.delete(id);
}
function cvApply(ch) {
  const inv = cvSnapshot(ch);
  UI.cvUndo.push(inv); if (UI.cvUndo.length > 150) UI.cvUndo.shift(); UI.cvRedo = [];
  cvApplyRaw(ch);
}
function cvUndo() { const op = UI.cvUndo.pop(); if (!op) { toast('Nothing to undo.'); return; } UI.cvRedo.push(cvSnapshot(op)); try { cvApplyRaw(op); } finally { render(); } }
function cvRedo() { const op = UI.cvRedo.pop(); if (!op) { toast('Nothing to redo.'); return; } UI.cvUndo.push(cvSnapshot(op)); try { cvApplyRaw(op); } finally { render(); } }
// a copy of the layout to change: box positions and sizes, plus anything feature files keep there (boards, saved views)
const newLayout = () => ({ ...clone(St.layout || {}), off: { ...(St.layout.off || {}) }, offv: { ...(St.layout.offv || {}) }, size: { ...(St.layout.size || {}) } });
function newEl(type, props) { return { id: E.uid('b'), type, color: UI.cvColor, createdAt: nowISO(), ...(curPage() !== 'main' ? { page: curPage() } : {}), ...props }; }

/* --- pointer: tools, pan, pinch, select, move, resize, draw, erase, connect --- */
const MP = { ptrs: new Map(), mode: null, pinch: null };
// the stylus: once one has touched this device's canvas it is remembered, and from then on only the stylus draws —
// fingers move, zoom and select. A touch while the pen is on or just above the screen (or just lifted), or a broad
// contact, is a resting palm and is ignored.
const PEN_LS = 'ar-pen-seen';
UI.penSeen = (() => { try { return localStorage.getItem(PEN_LS) === '1'; } catch { return false; } })();
// touch and stylus preferences (⚙ on the canvas, features/39-touch.js); each one has a default here
const TOUCH_DEF = { finger: '', zoom: true, zoomSnap: false, zoomLock: false, holdAct: 'pick', holdMs: 400, holdFlash: true, shapes: true, shapeMs: 520, tap2: 'undo', tap3: 'redo', tap4: 'lock', pLo: 0, pHi: 1, pressure: true, tilt: true, penHold: true, hover: true, side: 'eraser', eraserEnd: 'eraser' };
const touchCfg = () => ({ ...TOUCH_DEF, ...((St.settings.ui || {}).touch || {}) });
// what one finger does once a stylus has been used: select (default), pan, the chosen tool, or nothing
function fingerMode() { const u = St.settings.ui || {}, f = touchCfg().finger; if (f) return f; if (u.stylusOnly === false) return 'tool'; return UI.penSeen || u.stylusOnly ? 'select' : 'tool'; }
const penOnly = () => fingerMode() !== 'tool';
const zoomLocked = () => !!touchCfg().zoomLock;
// pens: Pen (pressure), Ballpoint (even), Marker (broad, even), Pencil (fine, soft, pressure); a width kept for each
const BRUSHES = { pen: ['Pen', 3, true, 0], ball: ['Ballpoint', 2, false, 0], marker: ['Marker', 9, false, 0.9], pencil: ['Pencil', 2, true, 0.7] };
function penCfg() { const p = (St.settings.ui || {}).pen || {}; return { brush: BRUSHES[p.brush] ? p.brush : 'pen', w: { pen: 3, ball: 2, marker: 9, pencil: 2, highlighter: 18, ...(p.w || {}) } }; }
function strokeStyle(tool) {
  const c = penCfg();
  if (tool === 'highlighter') return { brush: 'highlighter', width: c.w.highlighter, alpha: 0.45, pressure: false };
  const [, , pr, alpha] = BRUSHES[c.brush]; return { brush: c.brush, width: c.w[c.brush], alpha, pressure: pr };
}
// stylus pressure (with tilt, like shading with a pencil's side) squeezed into the chosen response range
function pval(e) {
  const c = touchCfg(); let p = e.pressure || 0.5;
  if (c.tilt && (e.tiltX || e.tiltY)) p = Math.min(1, p * (1 + 0.5 * Math.min(1, Math.hypot(e.tiltX || 0, e.tiltY || 0) / 70)));
  return Math.round((c.pLo + (c.pHi - c.pLo) * p) * 100) / 100;
}
const penIsDown = () => [...MP.ptrs.values()].some(p => p.type === 'pen');
function palmLikely(e) {
  if (e.pointerType !== 'touch') return false;
  const now = Date.now();
  return penIsDown() || now - (MP.penNear || 0) < 500 || now - (MP.penUpAt || 0) < 350 || (UI.penSeen && (e.width > 34 || e.height > 34));
}
document.addEventListener('pointermove', e => { if (e.pointerType === 'pen') MP.penNear = Date.now(); }, { passive: true, capture: true });
// iPad Safari: without this a Pencil stroke can start a page scroll or a text selection and be cancelled mid-line
document.addEventListener('touchmove', e => { if (e.target.closest && e.target.closest('#map-vp') && !e.target.closest('.cv-tools,.cv-sub,.cv-ctx,.cv-panel,.board-bar,.cv-overlay,input,textarea,select,[contenteditable]')) e.preventDefault(); }, { passive: false });
document.addEventListener('touchstart', e => { if ([...e.touches].some(t => t.touchType === 'stylus') && e.target.closest && e.target.closest('#map-vp') && !e.target.closest('button,a,input,textarea,select,[contenteditable],.cv-tools,.cv-sub,.cv-ctx,.cv-panel,.board-bar,.cv-overlay,.minimap')) e.preventDefault(); }, { passive: false });
function toWorld(cx, cy) { const vp = $('#map-vp'); const r = vp.getBoundingClientRect(); return { x: (cx - r.left - UI.map.x) / UI.map.k, y: (cy - r.top - UI.map.y) / UI.map.k }; }
function refAt(el) {
  const n = el && el.closest && el.closest('.mnode'); if (n && n.dataset.type !== 'item') return { k: 'n', id: n.dataset.node, tid: n.dataset.tid || null };
  const b = el && el.closest && el.closest('[data-el]'); if (b) { const x = St.board.get(b.dataset.el); if (x && !['stroke', 'line', 'connector'].includes(x.type)) return { k: 'e', id: x.id }; }
  return null;
}
function underPointer(e) { return document.elementFromPoint(e.clientX, e.clientY); }
function dropTargetAt(e) {
  const el = underPointer(e); const n = el && el.closest && el.closest('.mnode');
  if (!n || n.classList.contains('dragging') || !['project', 'topic', 'task'].includes(n.dataset.type)) return null;
  return n;
}
function live(html) { const g = $('#cv-live'); if (g) g.innerHTML = html; }
// the eraser takes whatever it touches: the item under the pointer, plus any line or stroke within its radius along
// the path since the last move (a quick swipe does not skip thin lines, and ink under a note is reached too)
const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0; return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
function eraseMark(id) {
  if (MP.erased.has(id)) return; const x = St.board.get(id); if (!x || elLocked(x)) return;
  MP.erased.add(id); const n = document.querySelector(`[data-el="${CSS.escape(id)}"]`); if (n) n.style.opacity = '.15';
}
function eraseAt(e) {
  const el = underPointer(e); const b = el && el.closest && el.closest('[data-el]');
  if (b) eraseMark(b.dataset.el);
  const w = toWorld(e.clientX, e.clientY), a = MP.eraseLast || w, r = Math.max(8, 12 / UI.map.k); MP.eraseLast = w;
  const steps = Math.max(1, Math.ceil(Math.hypot(w.x - a.x, w.y - a.y) / r)), probe = [];
  for (let i = 0; i <= steps; i++) probe.push([a.x + (w.x - a.x) * i / steps, a.y + (w.y - a.y) * i / steps]);
  const bx0 = Math.min(a.x, w.x) - r, by0 = Math.min(a.y, w.y) - r, bx1 = Math.max(a.x, w.x) + r, by1 = Math.max(a.y, w.y) + r;
  for (const x of boardEls()) {
    if (MP.erased.has(x.id) || !['stroke', 'line'].includes(x.type)) continue;
    const bb = elBox(x), pad = (x.width || 3) / 2;
    if (bb.x - pad > bx1 || bb.y - pad > by1 || bb.x + bb.w + pad < bx0 || bb.y + bb.h + pad < by0) continue;
    const segs = x.type === 'line' ? [[x.x1, x.y1, x.x2, x.y2]] : x.pts.length < 2 ? [[x.pts[0][0], x.pts[0][1], x.pts[0][0], x.pts[0][1]]] : x.pts.slice(1).map((q, i) => [x.pts[i][0], x.pts[i][1], q[0], q[1]]);
    if (probe.some(([px, py]) => segs.some(sg => segDist(px, py, ...sg) <= r + pad))) eraseMark(x.id);
  }
}
document.addEventListener('pointerdown', e => {
  const isPen = e.pointerType === 'pen', isTouch = e.pointerType === 'touch';
  const vp = e.target.closest && e.target.closest('#map-vp'); if (!vp || (e.button > 1 && !isPen)) return;
  if (e.target.closest('.cv-tools,.cv-sub,.cv-ctx,.cv-panel,.map-empty,.minimap,.present-bar,.board-bar,.cv-overlay,[contenteditable],input,textarea,select')) return;
  // palm rejection: while the stylus touches the screen every other touch is ignored, and once a stylus has been
  // used a broad touch (the side of a hand) is ignored too
  if (isTouch && palmLikely(e)) return;
  if (isPen) {
    MP.penNear = Date.now();
    if (!UI.penSeen) { UI.penSeen = true; try { localStorage.setItem(PEN_LS, '1'); } catch {} toast('✍ Stylus ready — it draws anywhere, a tap selects; fingers move and zoom. Your palm is ignored.'); }
    // the palm often lands a moment before the pen tip: forget it and undo the little pan or zoom it started
    if (MP.ptrs.size) {
      if (['pan', 'pinch'].includes(MP.mode) && Date.now() - (MP.downAt || 0) < 900 && MP.mx != null) { UI.map.x = MP.mx; UI.map.y = MP.my; if (MP.pinch) UI.map.k = MP.pinch.k; applyCam(); }
      MP.ptrs.clear(); MP.mode = null; MP.pinch = null; UI.cvTemp = null; live('');
    }
  }
  if (UI.cvEditing) commitEdit();
  MP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  if (MP.ptrs.size === 1) MP.downAt = Date.now();
  if (MP.ptrs.size === 2) { const [a, b] = [...MP.ptrs.values()]; MP.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: UI.map.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; MP.mode = 'pinch'; clearTimeout(MP.holdT); UI.cvTemp = null; live(''); return; }
  let tool = e.button === 1 || UI.spaceDown ? 'hand' : UI.tool;
  let node = e.target.closest('.mnode'), bel = e.target.closest('[data-el]'); const rz = e.target.closest('[data-rz]');
  // locked layers cannot be picked: pressing on them moves the canvas
  if (bel && elLocked(St.board.get(bel.dataset.el))) bel = null;
  if (node && layerSet('tasks').lock) node = null;
  // stylus: the eraser end or the side button erases; on empty canvas the pen draws whatever tool is chosen;
  // once a stylus has been used, a finger moves the canvas instead of drawing
  // the stylus draws without choosing the pen: over empty canvas, tasks and notes alike (a tap still selects or opens)
  let auto = false; const tc = touchCfg();
  // the stylus eraser end and side button do what Touch & stylus says (erase by default)
  const btnAct = isPen ? (e.button === 5 || (e.buttons & 32) ? tc.eraserEnd : (e.buttons & 2) ? tc.side : null) : null;
  if (btnAct === 'nothing') { MP.ptrs.delete(e.pointerId); return; }
  if (btnAct) tool = btnAct;
  else if (isPen && ['select', 'hand'].includes(tool) && !rz && (St.settings.ui || {}).stylusDraw !== false) { tool = 'pen'; auto = true; }
  else if (isTouch && penOnly()) {
    const fm = fingerMode();
    if (fm === 'nothing') { MP.mode = 'idle'; return; }
    if (fm === 'pan') tool = 'hand';
    // a finger never draws; with the eraser chosen it still erases
    else if (fm === 'select' && ['pen', 'highlighter', 'lasso'].includes(tool)) tool = 'select';
  }
  MP.isPen = isPen;
  Object.assign(MP, { auto, tapNode: auto ? node : null, tapBel: auto ? bel : null,  sx: e.clientX, sy: e.clientY, w0: toWorld(e.clientX, e.clientY), mx: UI.map.x, my: UI.map.y, tool, node, bel, target: e.target, shift: e.shiftKey, far: false });
  vp.setPointerCapture && vp.setPointerCapture(e.pointerId);
  if (e.button === 1) e.preventDefault();
  // the ● on a box: drag it to another box to link them, whatever tool is chosen
  if (e.target.closest('[data-link]')) { const ref = refAt(e.target); if (ref) { MP.mode = 'connect'; MP.from = ref; MP.free = true; return; } }
  if (tool === 'hand') { MP.mode = 'pan'; holdStart(e, isPen); return; }
  if (tool === 'pen' || tool === 'highlighter' || tool === 'lasso') {
    MP.mode = 'draw'; MP.tool = tool; MP.hold = false; MP.style = strokeStyle(tool); MP.press = isPen && tool !== 'lasso' && MP.style.pressure && tc.pressure;
    MP.pts = [MP.press ? [MP.w0.x, MP.w0.y, pval(e)] : [MP.w0.x, MP.w0.y]];
    holdStart(e, isPen); return;
  }
  if (tool === 'eraser') { MP.mode = 'erase'; MP.erased = new Set(); MP.eraseLast = null; eraseAt(e); return; }
  if (CREATE_TOOLS.includes(tool)) { MP.mode = 'create'; return; }
  if (tool === 'connector') { const ref = refAt(e.target); MP.mode = ref ? 'connect' : 'press-empty'; MP.from = ref; MP.free = false; return; }
  if (tool === 'task') { MP.mode = 'task'; return; }
  if (rz) { MP.mode = 'resize'; MP.rz = rz.dataset.rz; MP.rzKind = rz.dataset.kind; if (MP.rzKind === 'el') { const x = St.board.get(MP.rz); MP.base = { w: x.w, h: x.h }; } else { const n = UI.mapLayout.byId.get(MP.rz); MP.base = { w: n ? n.w : 250 }; } return; }
  if (bel && !node) {
    const id = bel.dataset.el;
    if (e.shiftKey) { UI.cvSel.has(id) ? UI.cvSel.delete(id) : UI.cvSel.add(id); MP.mode = 'press-el'; renderWorld(); return; }
    if (!UI.cvSel.has(id)) { UI.cvSel = new Set([id]); renderWorld(); }
    MP.mode = 'press-el'; MP.elId = id; return;
  }
  if (node) { MP.mode = 'press-node'; return; }
  MP.mode = e.shiftKey ? 'marquee' : 'press-empty';
  holdStart(e, isPen);
});
// tap & hold without moving: pick up the item under the pen or finger, start a lasso there, or take its colour
function holdStart(e, isPen) {
  const c = touchCfg(); clearTimeout(MP.holdT); MP.holdT = null;
  if (c.holdAct === 'off' || (isPen && !c.penHold) || e.pointerType === 'mouse' || MP.ptrs.size > 1) return;
  const pid = e.pointerId, cx = e.clientX, cy = e.clientY, target = e.target;
  MP.holdT = setTimeout(() => {
    MP.holdT = null; if (!MP.ptrs.has(pid) || MP.far || !['draw', 'pan', 'press-empty'].includes(MP.mode)) return;
    const node = target.closest && target.closest('.mnode'), bel = target.closest && target.closest('[data-el]');
    const flash = n => { if (!n || !c.holdFlash) return; n.classList.add('hold-flash'); setTimeout(() => n.classList.remove('hold-flash'), 450); };
    try { navigator.vibrate && navigator.vibrate(12); } catch {}
    if (c.holdAct === 'lasso') { MP.mode = 'draw'; MP.tool = 'lasso'; MP.auto = false; MP.press = false; MP.pts = [[MP.w0.x, MP.w0.y]]; live(''); toast('Lasso: draw around what you want to select.'); return; }
    if (c.holdAct === 'color') {
      const x = bel && St.board.get(bel.dataset.el); live(''); MP.mode = null;
      if (x && x.color) { UI.cvColor = x.color; flash(bel); toast('🎨 Colour picked.'); render(); }
      return;
    }
    // item picker: the item is selected and follows the pen or finger
    if (bel && !node && !elLocked(St.board.get(bel.dataset.el))) { live(''); const id = bel.dataset.el; UI.cvSel = new Set([id]); MP.elId = id; MP.mode = 'press-el'; MP.sx = cx; MP.sy = cy; MP.far = false; renderWorld(); flash(document.querySelector(`[data-el="${CSS.escape(id)}"]`)); }
    else if (node && !layerSet('tasks').lock) { live(''); MP.node = node; MP.mode = 'press-node'; MP.sx = cx; MP.sy = cy; MP.far = false; flash(node); }
  }, Math.max(150, c.holdMs));
}
document.addEventListener('pointermove', e => {
  if (!MP.ptrs.has(e.pointerId)) return;
  MP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
  const vp = $('#map-vp'); if (!vp || !MP.mode) return;
  if (MP.mode === 'idle') return;
  if (MP.mode === 'pinch') {
    if (MP.ptrs.size === 2) {
      const [a, b] = [...MP.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y), r = vp.getBoundingClientRect(), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      UI.map.x += cx - MP.pinch.cx; UI.map.y += cy - MP.pinch.cy; MP.pinch.cx = cx; MP.pinch.cy = cy;
      if (touchCfg().zoom && !zoomLocked()) mapZoom((MP.pinch.k * d / MP.pinch.d) / UI.map.k, cx - r.left, cy - r.top); else applyCam(false);
    }
    return;
  }
  if (MP.holdT && Math.hypot(e.clientX - MP.sx, e.clientY - MP.sy) > 6) { clearTimeout(MP.holdT); MP.holdT = null; }
  const dx = e.clientX - MP.sx, dy = e.clientY - MP.sy, k = UI.map.k;
  if (!MP.far && Math.hypot(dx, dy) > 5) MP.far = true;
  const w = toWorld(e.clientX, e.clientY), w0 = MP.w0;
  switch (MP.mode) {
    case 'press-empty': if (!MP.far) return; MP.mode = 'pan'; // falls through
    case 'pan': UI.map.x = MP.mx + dx; UI.map.y = MP.my + dy; applyCam(false); return;
    case 'draw': {
      const l = MP.pts[MP.pts.length - 1]; if (Math.hypot(w.x - l[0], w.y - l[1]) * k < 2) return;
      MP.pts.push(MP.press ? [Math.round(w.x * 10) / 10, Math.round(w.y * 10) / 10, pval(e)] : [Math.round(w.x * 10) / 10, Math.round(w.y * 10) / 10]);
      const hl = MP.tool === 'highlighter', st = MP.style || strokeStyle(MP.tool), col = colorCss(hl && UI.cvColor === 'ink' ? '#FFD966' : UI.cvColor);
      if (MP.tool === 'lasso') { live(`<path d="${strokePath(MP.pts)}" stroke="var(--accent)" stroke-width="${2 / k}" stroke-dasharray="${6 / k} ${5 / k}" fill="color-mix(in srgb, var(--accent) 8%, transparent)"/>`); return; }
      if (MP.press) { live(`<path d="${pressurePath(MP.pts, st.width)}" fill="${col}" ${st.alpha ? `fill-opacity="${st.alpha}"` : ''} stroke="none"/>`); return; }
      live(`<path d="${strokePath(MP.pts)}" stroke="${col}" stroke-width="${st.width}" ${st.alpha ? `stroke-opacity="${st.alpha}"` : ''} fill="none" stroke-linecap="round" stroke-linejoin="round"/>`); return;
    }
    case 'erase': eraseAt(e); return;
    case 'create': {
      if (!MP.far) return;
      if (MP.tool === 'arrow' || MP.tool === 'line') live(`<path d="M${w0.x} ${w0.y} L${w.x} ${w.y}" stroke="${colorCss(UI.cvColor)}" stroke-width="3" fill="none" ${MP.tool === 'arrow' ? 'marker-end="url(#cv-arrow)"' : ''} style="color:${colorCss(UI.cvColor)}"/>`);
      else live(`<rect x="${Math.min(w0.x, w.x)}" y="${Math.min(w0.y, w.y)}" width="${Math.abs(w.x - w0.x)}" height="${Math.abs(w.y - w0.y)}" rx="${MP.tool === 'ellipse' ? 999 : 6}" class="live-box"/>`);
      return;
    }
    case 'connect': {
      const a = refBox(MP.from, UI.mapLayout); if (!a) return;
      const over = refAt(underPointer(e)); UI.cvDrop = over && over.k === 'n' && over.id !== MP.from.id ? over.id : null;
      live(`<path d="${smartPath(a, { x: w.x, y: w.y, w: 0, h: 0 })}" stroke="var(--accent)" stroke-width="2.5" stroke-dasharray="6 5" fill="none" marker-end="url(#cv-arrow)" style="color:var(--accent)"/>`); return;
    }
    case 'marquee': if (MP.far) live(`<rect x="${Math.min(w0.x, w.x)}" y="${Math.min(w0.y, w.y)}" width="${Math.abs(w.x - w0.x)}" height="${Math.abs(w.y - w0.y)}" class="live-box sel"/>`); return;
    case 'resize': {
      const ddx = dx / k, ddy = dy / k;
      UI.cvTemp = MP.rzKind === 'el' ? { kind: 'elsize', id: MP.rz, w: Math.max(40, MP.base.w + ddx), h: Math.max(30, MP.base.h + ddy) } : { kind: 'size', id: MP.rz, w: Math.max(160, Math.min(720, MP.base.w + ddx)) };
      renderWorldSoon(); return;
    }
    case 'press-el': if (!MP.far) return; MP.mode = 'move-els'; // falls through
    case 'move-els': { let ddx = dx / k, ddy = dy / k; if (SNAP.fn) [ddx, ddy] = SNAP.fn(new Set(UI.cvSel), ddx, ddy); UI.cvTemp = { kind: 'els', ids: new Set(UI.cvSel), dx: ddx, dy: ddy }; renderWorldSoon(); return; }
    case 'press-node': {
      if (!MP.far) return;
      const type = MP.node.dataset.type || 'root'; if (type === 'item') { MP.mode = 'pan'; return; }
      MP.mode = type === 'task' ? 'move-task' : 'move-node'; MP.nodeId = MP.node.dataset.node;
    } // falls through
    case 'move-task': case 'move-node': {
      UI.cvTemp = { kind: 'node', id: MP.nodeId, dx: dx / k, dy: dy / k };
      if (MP.mode === 'move-task') { const over = dropTargetAt(e); UI.cvDrop = over ? over.dataset.node : null; }
      renderWorldSoon(); return;
    }
  }
}, { passive: true });
function endPointer(e) {
  if (e.pointerType === 'pen') { MP.penDown = false; MP.penUpAt = Date.now(); }
  if (!MP.ptrs.has(e.pointerId)) return;
  MP.ptrs.delete(e.pointerId);
  clearTimeout(MP.holdT); MP.holdT = null;
  if (MP.mode === 'pinch') { if (MP.ptrs.size === 0) { MP.mode = null; zoomSnapEnd(); } return; }
  if (MP.mode === 'idle') { if (MP.ptrs.size === 0) MP.mode = null; return; }
  // a stroke the browser cancelled part way (a system gesture, the page trying to scroll) is kept as drawn
  const mode = MP.mode, up = e.type === 'pointerup' || (e.type === 'pointercancel' && mode === 'draw' && MP.tool !== 'lasso' && MP.pts && MP.pts.length > 2); MP.mode = null;
  const tmp = UI.cvTemp, drop = UI.cvDrop; UI.cvTemp = null; UI.cvDrop = null; live('');
  const w = MP.w0 ? toWorld(e.clientX, e.clientY) : null;
  let handled = false;
  if (up) handled = finishPointer(mode, e, w, tmp, drop);
  if (UI.cvPending) { UI.cvPending = false; render(); }
  else if (!handled && ['move-els', 'move-task', 'move-node', 'resize', 'erase', 'connect'].includes(mode)) renderWorld();
}
function finishPointer(mode, e, w, tmp, drop) {
  const w0 = MP.w0, k = UI.map.k;
  switch (mode) {
    case 'press-empty': if (UI.cvSel.size || UI.mapSel) { UI.cvSel.clear(); UI.mapSel = null; renderWorld(); } return true;
    case 'pan': return true;
    case 'draw': {
      // the stylus without the pen chosen: a tap (no stroke) on a task or note selects or opens it, as a click would
      if (MP.auto && !MP.far) {
        if (MP.tapBel && !MP.tapNode) { const id = MP.tapBel.dataset.el; if (!UI.cvSel.has(id)) { UI.cvSel = new Set([id]); renderWorld(); } MP.elId = id; return finishPointer('press-el', e, w, tmp, drop); }
        if (MP.tapNode) { MP.node = MP.tapNode; return finishPointer('press-node', e, w, tmp, drop); }
        if (UI.cvSel.size || UI.mapSel) return finishPointer('press-empty', e, w, tmp, drop);
      }
      if (MP.pts.length < 2) MP.pts.push([MP.pts[0][0] + 0.5, MP.pts[0][1] + 0.5]);
      for (const h of STROKE_HOOKS) { try { if (h(MP.pts, { tool: MP.tool, isPen: MP.isPen, hold: MP.hold, auto: MP.auto, e })) return true; } catch (err) { console.warn(err); } }
      const hl = MP.tool === 'highlighter';
      const pts = MP.pts.length > 1500 ? MP.pts.filter((_, i) => i % Math.ceil(MP.pts.length / 1500) === 0) : MP.pts;
      const st = MP.style || strokeStyle(MP.tool);
      const el = newEl('stroke', { pts, width: st.width, alpha: st.alpha || 0, color: hl && UI.cvColor === 'ink' ? '#FFD966' : UI.cvColor, kind: MP.tool, brush: st.brush, ...(MP.press ? { pressure: true } : {}) });
      cvApply({ els: { [el.id]: el } }); render(); return true;
    }
    case 'erase': {
      const ids = [...MP.erased]; if (!ids.length) return false;
      const ch = { els: {}, tasks: {} };
      for (const id of ids) if (St.board.has(id)) ch.els[id] = null;
      // connectors attached to erased notes go with them
      for (const c of St.board.values()) if (c.type === 'connector' && (ids.includes(c.from.id) || ids.includes(c.to.id))) ch.els[c.id] = null;
      if (!Object.keys(ch.els).length) return false;
      cvApply(ch); render(); return true;
    }
    case 'create': {
      const t = MP.tool, x0 = Math.min(w0.x, w.x), y0 = Math.min(w0.y, w.y), bw = Math.abs(w.x - w0.x), bh = Math.abs(w.y - w0.y), far = MP.far;
      let el;
      if (CREATE_EL[t]) el = CREATE_EL[t]({ w0, w, far, x0, y0, bw, bh });
      else if (t === 'arrow' || t === 'line') el = newEl('line', { x1: w0.x, y1: w0.y, x2: far ? w.x : w0.x + 160, y2: far ? w.y : w0.y, arrow: t === 'arrow', width: UI.cvWidth });
      else if (t === 'sticky') el = newEl('sticky', { x: w0.x - (far ? 0 : 100), y: w0.y - (far ? 0 : 100), w: far ? Math.max(80, bw) : 200, h: far ? Math.max(80, bh) : 200, text: '', ...(far ? { x: x0, y: y0 } : {}) });
      else if (t === 'text') el = newEl('text', { x: w0.x, y: w0.y - 14, w: far ? Math.max(80, bw) : 260, h: 40, text: '', size: 20 });
      else if (t === 'frame') el = newEl('frame', { x: far ? x0 : w0.x, y: far ? y0 : w0.y, w: far ? Math.max(120, bw) : 640, h: far ? Math.max(90, bh) : 420, text: 'Frame' });
      else el = newEl('shape', { kind: t, x: far ? x0 : w0.x - 100, y: far ? y0 : w0.y - 60, w: far ? Math.max(30, bw) : 200, h: far ? Math.max(30, bh) : 120, text: '' });
      cvApply({ els: { [el.id]: el } });
      UI.cvSel = new Set([el.id]); UI.tool = 'select'; render();
      if (['sticky', 'text', 'shape', 'frame'].includes(el.type)) startEdit(el.id, true);
      runHooks('elCreated', el);
      return true;
    }
    case 'connect': {
      const to = refAt(underPointer(e)), from = MP.from;
      if (!to || !from || to.id === from.id) return false;
      // the ● handle always draws a free line you can restyle; the Link tool between two tasks also relates them
      if (from.tid && to.tid && !MP.free) { linkTasks(from.tid, to.tid); return true; }
      const el = newEl('connector', { from: { k: from.k, id: from.id }, to: { k: to.k, id: to.id }, width: 2.5 });
      cvApply({ els: { [el.id]: el } }); render(); return true;
    }
    case 'task': createTaskAt(w, MP.node); return true;
    case 'marquee': {
      const x0 = Math.min(w0.x, w.x), y0 = Math.min(w0.y, w.y), x1 = Math.max(w0.x, w.x), y1 = Math.max(w0.y, w.y);
      UI.cvSel = new Set(boardEls().filter(el => { if (el.type === 'connector') return false; const b = elBox(el); return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0; }).map(el => el.id));
      renderWorld(); return true;
    }
    case 'resize': {
      if (!tmp) return false;
      if (tmp.kind === 'elsize') { const el = St.board.get(tmp.id); if (el) cvApply({ els: { [el.id]: { ...el, w: Math.round(tmp.w), h: Math.round(tmp.h) } } }); }
      else { const L = newLayout(); L.size[tmp.id] = { w: Math.round(tmp.w) }; cvApply({ layout: L }); }
      render(); return true;
    }
    case 'press-el': {
      const id = MP.elId; if (!id) return true;
      const now = Date.now();
      if (MP.lastClick && MP.lastClick.id === id && now - MP.lastClick.at < 450) { MP.lastClick = null; startEdit(id); }
      else MP.lastClick = { id, at: now };
      return true;
    }
    case 'move-els': {
      if (!tmp) return false;
      const ch = { els: {} };
      for (const id of tmp.ids) { const el = St.board.get(id); if (el) ch.els[id] = moveEl(el, Math.round(tmp.dx), Math.round(tmp.dy)); }
      cvApply(ch); render(); return true;
    }
    case 'move-task': {
      if (!tmp) return false;
      const tid = MP.node.dataset.tid, over = drop && document.querySelector(`.mnode[data-node="${CSS.escape(drop)}"]`);
      if (over) { mapDrop(tid, over); return true; }
      const L = newLayout(); const o = L[offKey()][tmp.id] || { dx: 0, dy: 0 };
      L[offKey()][tmp.id] = { dx: Math.round(o.dx + tmp.dx), dy: Math.round(o.dy + tmp.dy) };
      cvApply({ layout: L }); render(); return true;
    }
    case 'move-node': {
      if (!tmp) return false;
      const L = newLayout(); const o = L[offKey()][tmp.id] || { dx: 0, dy: 0 };
      L[offKey()][tmp.id] = { dx: Math.round(o.dx + tmp.dx), dy: Math.round(o.dy + tmp.dy) };
      cvApply({ layout: L }); render(); return true;
    }
    case 'press-node': return clickNode(MP.node, MP.target);
  }
  return false;
}
// feature files add small buttons to task nodes (NODE_EXTRA: t → html with data-map="name") and handle them (MAP_BTN[name](taskId, button))
const NODE_EXTRA = [], MAP_BTN = {};
// a click on a tree node (no drag)
function clickNode(node, target) {
  const kind = node.dataset.type, btn = target && target.closest && target.closest('[data-map]');
  if (node.dataset.node === 'root') { mapFit(); return true; }
  if (kind === 'thread') { if (typeof threadNodeClick === 'function') threadNodeClick(node, btn); return true; }
  if (btn && btn.dataset.map === 'del') { deleteNode(node); return true; }
  if ((kind === 'project' || kind === 'topic') && btn && btn.dataset.map === 'rename') { startNodeEdit(node.dataset.node); return true; }
  if (kind === 'project' && btn && btn.dataset.map === 'focus') { UI.mapFocus = node.dataset.pk; UI.map.fitted = false; render(); return true; }
  if (kind === 'project' || kind === 'topic') { const id = node.dataset.node; UI.mapCollapsed.has(id) ? UI.mapCollapsed.delete(id) : UI.mapCollapsed.add(id); render(); return true; }
  if (kind === 'item') { undoable({ [node.dataset.tid]: true }, () => toggleSub(node.dataset.tid, node.dataset.sid)); render(); return true; }
  if (kind === 'task') {
    const id = node.dataset.tid;
    if (btn && btn.dataset.map === 'tick') { undoable({ [id]: true }, () => ACT['toggle-done']({ dataset: { id } })); return true; }
    if (btn && btn.dataset.map === 'items') { UI.mapItems.has(id) ? UI.mapItems.delete(id) : UI.mapItems.add(id); render(); return true; }
    if (btn && MAP_BTN[btn.dataset.map]) { MAP_BTN[btn.dataset.map](id, btn); return true; }
    UI.mapSel = id; UI.cvSel.clear(); render(); openDrawer('task', id); return true;
  }
  return false;
}
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
document.addEventListener('dblclick', e => { if (e.target.closest && e.target.closest('#map-vp') && !e.target.closest('.mnode,[data-el],.cv-tools,.cv-sub,.cv-ctx') && UI.tool === 'select') mapFit(); });
function linkTasks(aId, bId) {
  const t0 = St.tasks.get(bId), o = St.tasks.get(aId); if (!t0 || !o || aId === bId) return;
  if (relIds(t0).includes(aId) || relIds(o).includes(bId)) { toast('Already linked.'); return; }
  const t = clone(t0); t.relatedIds = [...relIds(t), aId];
  (t.history = t.history || []).push({ at: nowISO(), text: `Linked to ${o.ref} (on the map)` });
  cvApply({ tasks: { [t.id]: t } }); UI.mapSel = t.id; render();
  toast(`🔗 ${o.ref} → ${t.ref} linked.`, { action: 'Undo', fn: cvUndo });
}
function mapDrop(tid, over) {
  const t0 = St.tasks.get(tid); if (!t0) return;
  if (over.dataset.type === 'task') { linkTasks(over.dataset.tid, tid); return; }
  const t = clone(t0); const now = nowISO();
  const label = over.dataset.type === 'project' ? over.dataset.label : over.dataset.plabel;
  const newProj = label === 'No project' ? '' : label;
  const notes = [];
  if ((t.project || '') !== newProj) { notes.push(`Project: ${t.project || '—'} → ${newProj || '—'}`); t.project = newProj; t.projectLocked = true; }
  if (over.dataset.type === 'topic') { const tp = over.dataset.topic || ''; if (topicOf(t) !== tp) { notes.push(`Topic: ${topicOf(t) || '—'} → ${tp || '—'}`); t.topic = tp; t.topicLocked = true; } }
  if (!notes.length) { renderWorld(); return; }
  if (typeof learnCorrection === 'function') { learnCorrection(t0, 'project', t0.project || '', t.project || ''); if (over.dataset.type === 'topic') learnCorrection(t0, 'topic', topicOf(t0), topicOf(t)); }
  if (t.placement) t.placement = { ...t.placement, status: 'confirmed' };
  (t.history = t.history || []).push({ at: now, text: 'Moved on the map — ' + notes.join('; ') });
  const L = newLayout(); delete L[offKey()]['t:' + tid]; // it takes its natural place in the new branch
  cvApply({ tasks: { [tid]: t }, layout: L }); UI.mapSel = tid; render();
  toast(`🧭 ${t.ref} moved.`, { action: 'Undo', fn: cvUndo });
}
function makeTask(over) {
  const now = nowISO();
  return { id: E.uid('t'), ref: nextRefs(1)[0], title: 'New task', action: '', type: 'do', ownership: 'mine', owner: 'me', requestedBy: '', project: '', priority: 'medium', deadline: null, deadlineText: '', deadlineBasis: 'none', status: 'todo', nextStep: '', dependsOn: '', blockedReason: '', tags: [], notes: '', evidence: [], emailIds: [], threadKey: '', createdAt: now, updatedAt: now, completedAt: null, history: [{ at: now, text: 'Created manually' }], ...over };
}
// where would this task's node sit with no offset of its own?
function autoPos(t) {
  St.tasks.set(t.id, t);
  try { const M = buildMap(); const n = M.byId.get('t:' + t.id); return n ? { x: n.x, y: n.y } : null; }
  finally { St.tasks.delete(t.id); }
}
function createTaskAt(w, node) {
  const t = makeTask({ history: [{ at: nowISO(), text: 'Created on the canvas' }] });
  const kind = node && node.dataset.type;
  if (kind === 'project' && node.dataset.label !== 'No project') { t.project = node.dataset.label; t.projectLocked = true; }
  if (kind === 'topic') { if (node.dataset.plabel !== 'No project') { t.project = node.dataset.plabel; t.projectLocked = true; } if (node.dataset.topic) { t.topic = node.dataset.topic; t.topicLocked = true; } }
  if (kind === 'task') { const o = St.tasks.get(node.dataset.tid); if (o) { t.project = o.project || ''; t.topic = o.topic || ''; t.relatedIds = [o.id]; t.projectLocked = !!o.project; t.topicLocked = !!o.topic; } }
  const ch = { tasks: { [t.id]: t } };
  if (!kind) { const p = autoPos(t); if (p) { const L = newLayout(); L[offKey()]['t:' + t.id] = { dx: Math.round(w.x - p.x), dy: Math.round(w.y - p.y) }; ch.layout = L; } }
  cvApply(ch); UI.mapSel = t.id; UI.tool = 'select'; render();
  openDrawer('task', t.id); setTimeout(() => { const ta = $('#d-title'); if (ta) { ta.focus(); ta.select(); } }, 50);
}
function noteToTask() {
  const el = St.board.get([...UI.cvSel][0]); if (!el || !(el.text || '').trim()) return;
  const lines = el.text.trim().split('\n'); const title = E.clip(lines[0].trim(), 160);
  const t = makeTask({ title, action: lines.slice(1).join('\n').trim(), history: [{ at: nowISO(), text: 'Created from a canvas note' }] });
  localPlace(t);
  const ch = { tasks: { [t.id]: t }, els: { [el.id]: null } };
  for (const c of St.board.values()) if (c.type === 'connector' && (c.from.id === el.id || c.to.id === el.id)) ch.els[c.id] = null;
  if (!t.project) { const p = autoPos(t); if (p) { const L = newLayout(); L[offKey()]['t:' + t.id] = { dx: Math.round(el.x - p.x), dy: Math.round(el.y - p.y) }; ch.layout = L; } }
  cvApply(ch); UI.cvSel.clear(); UI.mapSel = t.id; render();
  if (St.sample) queueCategorize([t.id]);
  toast(`✅ ${t.ref} added to your to-do${t.project ? ' under ' + t.project : ''}.`, { action: 'Undo', fn: cvUndo });
}
/* --- inline text editing --- */
function startEdit(id, fresh) {
  const el0 = St.board.get(id); if (el0 && EL_EDIT[el0.type]) return EL_EDIT[el0.type](id, fresh);
  const box = document.querySelector(`[data-el="${CSS.escape(id)}"] .btxt`); if (!box) return;
  UI.cvEditing = { kind: 'el', id, fresh };
  box.setAttribute('contenteditable', 'plaintext-only'); box.setAttribute('spellcheck', 'true');
  box.focus();
  const r = document.createRange(); r.selectNodeContents(box); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  box.addEventListener('blur', commitEdit, { once: true });
  box.addEventListener('keydown', ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); box.blur(); } });
}
function startNodeEdit(nodeId) {
  const b = document.querySelector(`.mnode[data-node="${CSS.escape(nodeId)}"] [data-edit]`); if (!b) return;
  UI.cvEditing = { kind: 'node', id: nodeId, old: b.textContent };
  b.setAttribute('contenteditable', 'plaintext-only'); b.focus();
  const r = document.createRange(); r.selectNodeContents(b); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  b.addEventListener('blur', commitEdit, { once: true });
}
function commitEdit(ev) {
  const ed = UI.cvEditing; if (!ed) return; UI.cvEditing = null;
  // leaving the note by pressing a canvas button: draw again after that press, so the press is not lost
  const toBtn = ev && ev.relatedTarget && ev.relatedTarget.closest && ev.relatedTarget.closest('#map-vp button, .map-toolbar button, .board-bar button');
  if (ed.kind === 'el') {
    const box = document.querySelector(`[data-el="${CSS.escape(ed.id)}"] .btxt`); const el = St.board.get(ed.id);
    if (el && box) {
      const text = box.innerText.replace(/\n+$/, '');
      // typing into a note just created belongs to the same undo step as creating it
      if (el.type === 'text' && !text.trim()) { if (ed.fresh) { cvApplyRaw({ els: { [el.id]: null } }); UI.cvUndo.pop(); } else cvApply({ els: { [el.id]: null } }); }
      else if (text !== (el.text || '')) {
        const v = { ...el, text, h: el.type === 'text' ? Math.max(el.h, Math.ceil(box.scrollHeight)) : el.h };
        if (ed.fresh) cvApplyRaw({ els: { [el.id]: v } }); else cvApply({ els: { [el.id]: v } });
      }
    }
  } else if (ed.kind === 'node') {
    const b = document.querySelector(`.mnode[data-node="${CSS.escape(ed.id)}"] [data-edit]`);
    const name = b ? b.innerText.trim() : '';
    if (name && name !== ed.old) renameNode(ed.id, ed.old, name);
  }
  if (toBtn) setTimeout(render, 350); else render();
}

function renameNode(nodeId, oldName, name) {
  const ch = { tasks: {} }; const L = newLayout(); const now = nowISO();
  const isProj = nodeId.startsWith('p:');
  for (const t0 of St.tasks.values()) {
    const hit = isProj ? projKeyLabel(t0)[0] === nodeId : topicKey(t0) === nodeId;
    if (!hit) continue;
    const t = clone(t0);
    if (isProj) { t.project = name; t.projectLocked = true; } else { t.topic = name; t.topicLocked = true; }
    (t.history = t.history || []).push({ at: now, text: `${isProj ? 'Project' : 'Topic'} renamed: ${oldName} → ${name}` });
    ch.tasks[t.id] = t;
  }
  if (!Object.keys(ch.tasks).length) return;
  // keep manual positions under the new name
  const newPk = 'p:' + E.normMatch(name);
  for (const key of ['off', 'size']) for (const id of Object.keys(L[key])) {
    if (isProj && (id === nodeId || id.startsWith('tp:' + nodeId + ':'))) { const nid = id === nodeId ? newPk : id.replace('tp:' + nodeId + ':', 'tp:' + newPk + ':'); L[key][nid] = L[key][id]; delete L[key][id]; }
    if (!isProj && id === nodeId) { const nid = nodeId.slice(0, nodeId.lastIndexOf(':') + 1) + E.normMatch(name); L[key][nid] = L[key][id]; delete L[key][id]; }
  }
  if (isProj && UI.mapFocus === nodeId) UI.mapFocus = newPk;
  ch.layout = L; cvApply(ch);
  toast(`✎ Renamed to “${name}” on ${Object.keys(ch.tasks).length} task${Object.keys(ch.tasks).length > 1 ? 's' : ''}.`, { action: 'Undo', fn: cvUndo });
}
function deleteSelection() {
  const ids = [...UI.cvSel].filter(id => St.board.has(id));
  if (ids.length) {
    const ch = { els: {} }; ids.forEach(id => { ch.els[id] = null; });
    for (const c of St.board.values()) if (c.type === 'connector' && (ids.includes(c.from.id) || ids.includes(c.to.id))) ch.els[c.id] = null;
    cvApply(ch); UI.cvSel.clear(); render(); return;
  }
  const t = UI.mapSel && St.tasks.get(UI.mapSel);
  if (t) { cvApply({ tasks: { [t.id]: null } }); UI.mapSel = null; closeDrawer(); render(); toast(`${t.ref} deleted.`, { action: 'Undo', fn: cvUndo }); }
}
// a change made by other code (tick, item done) becomes one undo step: the tasks are saved as they were before
function undoable(taskIds, fn) {
  const inv = { tasks: {} }; for (const id of Object.keys(taskIds)) inv.tasks[id] = St.tasks.has(id) ? clone(St.tasks.get(id)) : null;
  fn(); UI.cvUndo.push(inv); if (UI.cvUndo.length > 150) UI.cvUndo.shift(); UI.cvRedo = [];
}
// 🗑 on any box: a task, an item of a task, or a whole topic or project with all its tasks (Undo brings them back;
// deleted tasks also stay 30 days in Setup › Recycle bin)
function deleteNode(node) {
  const kind = node.dataset.type;
  if (kind === 'item') {
    const t = St.tasks.get(node.dataset.tid); if (!t) return;
    const c = clone(t); c.subtasks = (c.subtasks || []).filter(x => x.id !== node.dataset.sid); c.updatedAt = nowISO();
    cvApply({ tasks: { [t.id]: c } }); render(); toast('Item deleted.', { action: 'Undo', fn: cvUndo }); return;
  }
  let ids = [], label = '';
  if (kind === 'task') { ids = [node.dataset.tid]; const t = St.tasks.get(ids[0]); label = t ? (t.ref || 'Task') : 'Task'; }
  else if (kind === 'project') { const pk = node.dataset.pk; ids = [...St.tasks.values()].filter(t => projKeyLabel(t)[0] === pk).map(t => t.id); label = `Project “${node.dataset.label}”`; }
  else if (kind === 'topic') { const tk = node.dataset.node; ids = [...St.tasks.values()].filter(t => topicKey(t) === tk).map(t => t.id); label = `Topic “${node.dataset.topic || 'General'}”`; }
  if (!ids.length) return;
  const ch = { tasks: {} }; ids.forEach(id => { ch.tasks[id] = null; });
  cvApply(ch); if (ids.includes(UI.mapSel)) { UI.mapSel = null; closeDrawer(); }
  render(); toast(`${label} deleted${ids.length > 1 ? ` (${ids.length} tasks)` : ''}.`, { action: 'Undo', fn: cvUndo });
}
// ⟳ Refresh: show everything again (filters, folded branches, past dates cleared), redraw, and offer to put back
// tasks from emails that are not on the canvas (still waiting in Review, or deleted in the last 30 days)
function mapRefresh() {
  UI.mapFocus = 'all'; UI.mapQ = ''; UI.mapAsOf = ''; UI.mapDay = ''; UI.mapCollapsed.clear(); UI.cvSel.clear(); UI.mapSel = null; UI.cvTemp = null;
  measureCache.clear(); UI.map.fitted = false;
  const pending = [...St.emails.values()].filter(e => e.reviewState === 'pending' && ((e.analysis && e.analysis.tasks) || []).some(p => p.accept));
  const binned = colList('trash').filter(x => x.kind === 'task' && x.data && (x.data.emailIds || []).length && !St.tasks.has(x.data.id));
  UI.mapRefresh = { pending: pending.length, binned: binned.length, at: Date.now() };
  render(); requestAnimationFrame(() => mapFit());
  if (!pending.length && !binned.length) toast('Canvas refreshed — every task is shown.');
}
function mapRestoreBinned() {
  const list = colList('trash').filter(x => x.kind === 'task' && x.data && (x.data.emailIds || []).length && !St.tasks.has(x.data.id));
  const ch = { tasks: {} }; list.forEach(x => { ch.tasks[x.data.id] = clone(x.data); });
  if (list.length) cvApply(ch);
  list.forEach(x => colDel('trash', x.id));
  UI.mapRefresh = null; render(); toast(`${list.length} task${list.length === 1 ? '' : 's'} put back on the canvas.`, { action: 'Undo', fn: cvUndo });
}
function duplicateSelection() {
  const ids = [...UI.cvSel].filter(id => St.board.has(id) && St.board.get(id).type !== 'connector'); if (!ids.length) return;
  const ch = { els: {} }; const fresh = new Set();
  for (const id of ids) { const c = moveEl(clone(St.board.get(id)), 24, 24); c.id = E.uid('b'); c.createdAt = nowISO(); ch.els[c.id] = c; fresh.add(c.id); }
  cvApply(ch); UI.cvSel = fresh; render();
}
function toggleFull(on) {
  UI.mapFull = on === undefined ? !UI.mapFull : on;
  document.body.classList.toggle('map-full-on', UI.mapFull);
  try {
    if (UI.mapFull && !document.fullscreenElement && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!UI.mapFull && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch {}
  UI.map.fitted = false; render();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && UI.mapFull) toggleFull(false); });
// keyboard: tools, undo/redo, delete, duplicate, full screen
document.addEventListener('keydown', e => {
  if (UI.view !== 'todo' || UI.todoMode !== 'map') return;
  if (UI.cvEditing) { if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (UI.cvEditing.kind === 'node')))) { e.preventDefault(); document.activeElement && document.activeElement.blur(); } return; }
  if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]') || UI.drawer || !$('#modal').hidden) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? cvRedo() : cvUndo(); return; }
  if (mod && k === 'y') { e.preventDefault(); cvRedo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSelection(); return; }
  if (mod && k === 'a') { e.preventDefault(); UI.cvSel = new Set(boardEls().filter(x => x.type !== 'connector').map(x => x.id)); renderWorld(); return; }
  if (mod || e.altKey) return;
  // Backspace removes selected board items only; deleting a task needs the Delete key
  if (e.key === 'Delete' || (e.key === 'Backspace' && UI.cvSel.size)) { e.preventDefault(); deleteSelection(); return; }
  if (e.key === 'Escape') { if (UI.tool !== 'select') { UI.tool = 'select'; render(); } else if (UI.cvSel.size) { UI.cvSel.clear(); renderWorld(); } else if (UI.mapFull) toggleFull(false); return; }
  if (e.key === ' ') { if (!UI.spaceDown) { UI.spaceDown = true; const vp = $('#map-vp'); if (vp) vp.dataset.tool = 'hand'; } e.preventDefault(); return; }
  if (e.shiftKey && k === 'f') { toggleFull(); return; }
  if (e.shiftKey && k === 'r') { ACT['map-rearrange'](); return; }
  if (e.shiftKey && k === 'm') { ACT['map-mine'](); return; }
  if (e.shiftKey && k === 'v') { ACT['map-dir']({ dataset: { dir: mapDir() === 'v' ? 'h' : 'v' } }); return; }
  if (!e.shiftKey && TOOL_KEY[k]) { UI.tool = TOOL_KEY[k]; render(); }
});
document.addEventListener('keyup', e => { if (e.key === ' ' && UI.spaceDown) { UI.spaceDown = false; const vp = $('#map-vp'); if (vp) vp.dataset.tool = UI.tool; } });

/* ---------- DAILY work tracker ---------- */
// Daily tasks are ordinary tasks (t.days = the dates they were planned for, t.fromManager), so they
// appear on the canvas under their project and topic and share status with the To-do views.
// Achievements and notes are St.daily entries, optionally linked to a task.
UI.dayDate = null; UI.dayKind = 'mine'; UI.daySuggest = null;
const DAY_KINDS = [['mine', '✅ My task'], ['manager', '👔 From manager'], ['achievement', '⭐ Achievement'], ['note', '📝 Note']];
const managerName = () => (St.settings.me.manager || '').trim();
function isFromManager(t) {
  if (t.fromManager) return true;
  const m = E.normMatch(managerName()); if (!m || !t.requestedBy) return false;
  const r = E.normMatch(t.requestedBy); return r.includes(m) || m.split(' ').filter(w => w.length > 2).every(w => r.includes(w));
}
// Best local guess of project, topic and related task, used straight away; Claude refines it when available.
function localPlace(t) {
  const words = ' ' + E.normMatch(t.title + ' ' + (t.action || '')) + ' ';
  const has = k => { k = E.normMatch(k); return k.length >= 2 && words.includes(' ' + k + ' '); };
  if (!t.project) {
    for (const p of St.settings.projects) if ([p.code, p.name, ...String(p.aliases || '').split(/[,;]/)].some(x => x && has(x))) { t.project = p.code || p.name; break; }
    if (!t.project) for (const label of projectsList()) { const first = label.split(/\s+[—–-]\s+|\s+/)[0]; if (has(label) || (first.length >= 3 && has(first))) { t.project = label; break; } }
  }
  const tokens = s => new Set(E.normMatch(s).split(' ').filter(w => w.length >= 4));
  const mine = tokens(t.title + ' ' + (t.action || ''));
  if (!t.topic && mine.size) {
    let best = null, score = 0;
    for (const x of allTopics()) {
      if (t.project && x.project && E.normMatch(x.project) !== E.normMatch(t.project)) continue;
      const pool = tokens(x.topic + ' ' + [...St.tasks.values()].filter(o => topicOf(o) === x.topic).map(o => o.title).join(' '));
      let s = 0; for (const w of mine) if (pool.has(w)) s++;
      if (s > score) { score = s; best = x; }
    }
    if (best && score >= 2) { t.topic = best.topic; if (!t.project && best.project) t.project = best.project; }
  }
  if (!relIds(t).length) {
    const d = E.findDuplicate({ title: t.title, action: t.action || '', project: t.project }, [...St.tasks.values()].filter(o => o.id !== t.id), '');
    if (d) t.relatedIds = [d.task.id];
  }
  return t;
}
function queueCategorize(ids) {
  if (!St.sample) return;
  if (CAT.running) { CAT.queue = [...(CAT.queue || []), ...ids]; return; }
  aiCategorize(ids, true);
}
function dayModel(D) {
  const today = T(), isToday = D === today;
  const all = [...St.tasks.values()];
  const items = new Map();
  const add = (t, why) => { if (!items.has(t.id)) items.set(t.id, { t, why }); };
  all.filter(t => (t.days || []).includes(D)).forEach(t => add(t, 'planned'));
  all.filter(t => t.completedAt && dayOf(t.completedAt) === D).forEach(t => add(t, 'done'));
  if (isToday) {
    all.filter(t => t.status !== 'done' && (t.days || []).some(d => d < D)).forEach(t => add(t, 'carried'));
    all.filter(t => t.status === 'in_progress').forEach(t => add(t, 'wip'));
  }
  const lanes = { todo: [], wip: [], done: [] };
  for (const it of items.values()) {
    const t = it.t;
    if (t.completedAt && dayOf(t.completedAt) === D && t.status === 'done') lanes.done.push(it);
    else if (t.status === 'in_progress') lanes.wip.push(it);
    else lanes.todo.push(it);
  }
  const order = (a, b) => (PRIO_RANK[a.t.priority] ?? 2) - (PRIO_RANK[b.t.priority] ?? 2) || (a.t.deadline || '9').localeCompare(b.t.deadline || '9');
  Object.values(lanes).forEach(l => l.sort(order));
  const entries = [...St.daily.values()].filter(a => a.date === D).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const manager = all.filter(t => t.status !== 'done' && isFromManager(t)).sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9'));
  const suggest = isToday ? all.filter(t => t.status !== 'done' && !items.has(t.id) && isMine(t) && t.status !== 'waiting' && ((t.deadline && t.deadline <= E.addDays(today, 1)) || t.priority === 'critical' || isFromManager(t))).sort(order.bind(null)).slice(0, 8) : [];
  return { isToday, items, lanes, achievements: entries.filter(a => a.kind === 'achievement'), notes: entries.filter(a => a.kind === 'note'), manager, suggest };
}
function dayHistory() {
  const days = new Map(); const bump = (d, k) => { if (!d) return; const x = days.get(d) || { planned: 0, done: 0, ach: 0 }; x[k]++; days.set(d, x); };
  for (const t of St.tasks.values()) { (t.days || []).forEach(d => bump(d, 'planned')); if (t.completedAt) bump(dayOf(t.completedAt), 'done'); }
  for (const a of St.daily.values()) if (a.kind === 'achievement') bump(a.date, 'ach');
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 30);
}
function dayCard(it, D) {
  const t = it.t, d = dueInfo(t); const mgr = isFromManager(t);
  const carried = it.why === 'carried' ? (t.days || []).filter(x => x < D).sort().pop() : '';
  const doneLater = t.status === 'done' && dayOf(t.completedAt) !== D;
  return `<div class="dcard p-${esc(t.priority || 'medium')} ${t.status === 'done' ? 'done' : ''}" data-tid="${esc(t.id)}">
    <div class="dtop"><button class="dtick" data-act="toggle-done" data-id="${esc(t.id)}" aria-pressed="${t.status === 'done'}" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}">${I.check}</button>
      <button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto">${esc(t.title)}</button></div>
    <div class="dmeta"><span class="mono">${esc(t.ref || '')}</span>${t.project ? `<span class="chip proj">${esc(t.project)}</span>` : '<span class="chip warn" title="Claude or you will place it">No project yet</span>'}${topicOf(t) ? `<span class="chip">🧩 ${esc(topicOf(t))}</span>` : ''}
      ${mgr ? `<span class="chip wait">👔 ${esc(t.requestedBy || managerName() || 'Manager')}</span>` : ''}${carried ? `<span class="chip" title="Planned earlier and not finished">↪ since ${esc(fmtDate(carried, { weekday: 'short', day: 'numeric', month: 'short' }))}</span>` : ''}
      ${doneLater ? `<span class="chip ok">✓ done ${esc(fmtDate(dayOf(t.completedAt)))}</span>` : t.status !== 'done' && t.deadline ? `<span class="duepill ${d.cls}">${dueEmoji(d)}${esc(d.txt)}</span>` : ''}${subsOf(t).length ? `<span class="small muted">🗂️ ${subsDone(t)}/${subsOf(t).length}</span>` : ''}${timeChipHTML(t)}</div>
    <div class="dbtns">
      ${t.status === 'done' ? `<button class="btn ghost sm" data-act="day-ach-task" data-id="${esc(t.id)}" title="Record as an achievement">⭐</button>` : t.status === 'in_progress' ? `<button class="btn ghost sm" data-act="set-status" data-id="${esc(t.id)}" data-status="todo" title="Pause">⏸ Pause</button>` : `<button class="btn ghost sm" data-act="set-status" data-id="${esc(t.id)}" data-status="in_progress" title="Start working on it">▶ Start</button>`}
      <button class="btn ghost sm" data-act="show-on-map" data-id="${esc(t.id)}" title="Show on the canvas">🧠</button>
      ${(t.days || []).includes(D) && t.status !== 'done' ? `<button class="btn ghost sm" data-act="day-unplan" data-id="${esc(t.id)}" title="Remove from this day’s plan (the task stays in your to-do)">✕</button>` : ''}
    </div></div>`;
}
function viewDaily() {
  const D = UI.dayDate || T(); UI.dayDate = D;
  const m = dayModel(D), L = m.lanes;
  const mgrN = [...m.items.values()].filter(it => isFromManager(it.t)).length;
  const kind = UI.dayKind;
  const lane = (key, title, emoji, list, empty) => `<section class="dlane ${key}" data-lane="${key}"><div class="dlane-h"><span>${emoji} ${title}</span><span class="count">${list.length}</span></div>${list.length ? list.map(it => dayCard(it, D)).join('') : `<p class="small muted dempty">${empty}</p>`}</section>`;
  const hist = dayHistory();
  return `<div class="wrap daily">
    <div class="page-head"><div><h1>Daily work</h1><div class="sub">Plan the day, log what your manager asks for, track progress and keep a record of what you achieved. Everything here also appears on the canvas.</div></div></div>
    <div class="row day-nav">
      <button class="btn sm" data-act="day-shift" data-d="-1" aria-label="Previous day">‹</button>
      <input class="input" type="date" id="day-date" data-chg="day-date" value="${esc(D)}" aria-label="Day">
      <button class="btn sm" data-act="day-shift" data-d="1" aria-label="Next day">›</button>
      ${m.isToday ? '<span class="chip accent">Today</span>' : `<button class="btn sm ghost" data-act="day-today">Today</button>`}
      <b class="day-title">${esc(fmtDate(D, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</b>${dayProgressHTML(L)}
      <span class="spacer"></span>
      <button class="btn sm" data-act="day-map" title="Highlight this day’s work on the canvas">🧠 Show on canvas</button>${typeof dailyExtraBtns === 'function' ? dailyExtraBtns() : ''}
    </div>
    <section class="card pad day-add">
      <div class="seg" role="group" aria-label="What are you adding?">${DAY_KINDS.map(([k, l]) => `<button data-act="day-kind" data-kind="${k}" aria-pressed="${kind === k}">${l}</button>`).join('')}</div>
      <div class="row" style="flex-wrap:nowrap">
        <input class="input" id="day-in" dir="auto" autocomplete="off" placeholder="${kind === 'achievement' ? 'e.g. Issued RAS pump calc Rev B to the consultant' : kind === 'note' ? 'A note for this day' : kind === 'manager' ? 'What did your manager ask for?' : 'What will you work on? e.g. Check NPSH for ELM RAS pumps'}">
        ${kind === 'manager' ? `<input class="input" id="day-mgr" style="max-width:200px" dir="auto" placeholder="Manager’s name" value="${esc(managerName())}">` : ''}
        <button class="btn primary" data-act="day-add">Add</button>
      </div>
      <p class="small muted" style="margin:0">${kind === 'mine' || kind === 'manager' ? `Tasks get a project, topic and links to related work automatically${St.sample ? ' (Claude checks and refines them)' : ''}, and appear on the canvas.` : kind === 'achievement' ? 'Achievements are kept in your daily history and shown as ⭐ on linked tasks.' : 'Notes stay with this day.'}</p>
    </section>
    <div class="tiles day-tiles">
      <div class="tile"><span class="tile-e">📋</span><span class="tile-n num">${L.todo.length}</span><span class="tile-l">To do</span></div>
      <div class="tile"><span class="tile-e">👔</span><span class="tile-n num">${mgrN}</span><span class="tile-l">From manager</span></div>
      <div class="tile"><span class="tile-e">▶️</span><span class="tile-n num">${L.wip.length}</span><span class="tile-l">In progress</span></div>
      <div class="tile"><span class="tile-e">✅</span><span class="tile-n num">${L.done.length}</span><span class="tile-l">Completed</span></div>
      <div class="tile"><span class="tile-e">⭐</span><span class="tile-n num">${m.achievements.length}</span><span class="tile-l">Achievements</span></div>
    </div>
    <div class="day-grid">
      <div class="day-lanes">
        ${lane('todo', 'To do', '📋', L.todo, m.isToday ? 'Nothing planned yet. Add a task above or pick from the suggestions.' : 'Nothing was planned.')}
        ${lane('wip', 'In progress', '▶️', L.wip, 'Press ▶ Start on a task to show it here.')}
        ${lane('done', 'Completed', '✅', L.done, 'Tasks you finish this day appear here, wherever you tick them.')}
      </div>
      <aside class="day-side">
        <section class="card pad"><div class="section-title"><h2>⭐ Achievements</h2></div>
          ${m.achievements.length ? `<ul class="ach">${m.achievements.map(a => { const t = a.taskId && St.tasks.get(a.taskId); return `<li><span dir="auto">${esc(a.text)}</span>${t ? `<button class="btn ghost sm" data-act="show-on-map" data-id="${esc(t.id)}">${esc(t.ref)}</button>` : ''}<button class="icon-btn" data-act="day-entry-del" data-id="${esc(a.id)}" aria-label="Remove">${I.x}</button></li>`; }).join('')}</ul>` : '<p class="small muted" style="margin:0">None recorded yet.</p>'}
          ${UI.daySuggest ? `<div class="ach-sug"><div class="label">Suggested</div>${UI.daySuggest.map((s, i) => `<div class="row"><span dir="auto" style="flex:1">${esc(s.text)}</span><button class="btn sm" data-act="day-sug-add" data-i="${i}">Add</button></div>`).join('')}<button class="btn ghost sm" data-act="day-sug-clear">Dismiss</button></div>` : ''}
          ${L.done.length ? `<button class="btn sm" data-act="day-suggest" ${UI.daySuggesting ? 'disabled' : ''}>${UI.daySuggesting ? 'Thinking…' : St.sample ? '✨ Suggest from completed work' : '⭐ Suggest from completed work'}</button>` : ''}
        </section>
        ${m.notes.length ? `<section class="card pad"><div class="section-title"><h2>📝 Notes</h2></div><ul class="ach">${m.notes.map(a => `<li><span dir="auto">${esc(a.text)}</span><button class="icon-btn" data-act="day-entry-del" data-id="${esc(a.id)}" aria-label="Remove">${I.x}</button></li>`).join('')}</ul></section>` : ''}
        ${m.manager.length ? `<section class="card pad"><div class="section-title"><h2>👔 Open from your manager</h2></div><div class="dlist">${m.manager.slice(0, 10).map(t => `<div class="row"><button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto">${esc(E.clip(t.title, 80))}</button>${(t.days || []).includes(D) ? '<span class="chip ok">planned</span>' : `<button class="btn sm" data-act="day-plan" data-id="${esc(t.id)}">+ Day</button>`}</div>`).join('')}</div>${managerName() ? '' : '<p class="small muted">Add your manager’s name in Setup so tasks they request by email are tagged too.</p>'}</section>` : ''}
        ${m.suggest.length ? `<section class="card pad"><div class="section-title"><h2>💡 Worth planning today</h2></div><div class="dlist">${m.suggest.map(t => { const d = dueInfo(t); return `<div class="row"><button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto">${esc(E.clip(t.title, 80))}</button><span class="duepill ${d.cls}">${esc(d.txt)}</span><button class="btn sm" data-act="day-plan" data-id="${esc(t.id)}">+ Today</button></div>`; }).join('')}</div></section>` : ''}
        <section class="card pad"><div class="section-title"><h2>🗓️ History</h2></div>
          ${hist.length ? `<div class="dhist">${hist.map(([d, x]) => `<button class="${d === D ? 'on' : ''}" data-act="day-go" data-d="${esc(d)}"><span>${esc(fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' }))}</span><span class="small muted">${x.done ? `✅ ${x.done}` : ''} ${x.planned ? `📋 ${x.planned}` : ''} ${x.ach ? `⭐ ${x.ach}` : ''}</span></button>`).join('')}</div>` : '<p class="small muted" style="margin:0">Your days appear here as you work.</p>'}
        </section>
      </aside>
    </div>
  </div>`;
}
function dayAdd() {
  const inp = $('#day-in'); const text = (inp && inp.value || '').trim(); if (!text) { inp && inp.focus(); return; }
  const D = UI.dayDate || T(), kind = UI.dayKind, now = nowISO();
  if (kind === 'achievement' || kind === 'note') {
    putDaily({ id: E.uid('d'), kind, date: D, text, taskId: null, createdAt: now });
    render(); setTimeout(() => $('#day-in')?.focus(), 30); return;
  }
  const mgr = kind === 'manager' ? (($('#day-mgr') || {}).value || managerName()).trim() : '';
  if (kind === 'manager' && mgr && !managerName()) { const s = clone(St.settings); s.me.manager = mgr; putSettings(s); }
  // the same work already in the to-do list: plan that task instead of creating a duplicate
  const dup = E.findDuplicate({ title: text, action: '', project: '' }, [...St.tasks.values()].filter(t => t.status !== 'done'), '');
  if (dup && dup.score >= 0.6) {
    planTask(dup.task.id, D, kind === 'manager' ? mgr : null);
    toast(`📌 ${dup.task.ref} is already in your to-do, so it was added to this day.`, { action: 'Create new instead', fn: () => createDailyTask(text, D, kind, mgr) });
  } else createDailyTask(text, D, kind, mgr);
  if (inp) inp.value = '';
  render(); setTimeout(() => $('#day-in')?.focus(), 30);
}
function createDailyTask(text, D, kind, mgr) {
  const now = nowISO();
  const t = makeTask({ title: E.clip(text, 200), source: 'daily', days: [D], fromManager: kind === 'manager', requestedBy: kind === 'manager' ? mgr : '',
    history: [{ at: now, text: kind === 'manager' ? `Assigned by ${mgr || 'my manager'} (daily tracker, ${D})` : `Added in the daily tracker for ${D}` }] });
  localPlace(t);
  const notes = [t.project ? 'Project: ' + t.project : '', topicOf(t) ? 'Topic: ' + topicOf(t) : '', relIds(t).length ? 'Linked to ' + St.tasks.get(relIds(t)[0]).ref : ''].filter(Boolean);
  if (notes.length) t.history.push({ at: now, text: notes.join('; ') + ' (matched automatically)' });
  putTask(t); render();
  queueCategorize([t.id]);
  return t;
}
function planTask(id, D, mgr) {
  const t = clone(St.tasks.get(id)); if (!t) return;
  if (!(t.days || []).includes(D)) { t.days = [...(t.days || []), D].sort(); (t.history = t.history || []).push({ at: nowISO(), text: `Added to the daily plan for ${D}` }); }
  if (mgr) { t.fromManager = true; if (!t.requestedBy) t.requestedBy = mgr; }
  putTask(t);
}
function unplanTask(id, D) {
  const t = clone(St.tasks.get(id)); if (!t) return;
  t.days = (t.days || []).filter(x => x !== D); (t.history = t.history || []).push({ at: nowISO(), text: `Removed from the daily plan for ${D}` });
  putTask(t);
}
async function suggestAchievements() {
  const D = UI.dayDate || T(); const done = dayModel(D).lanes.done.map(it => it.t);
  if (!done.length) return;
  const have = new Set([...St.daily.values()].filter(a => a.date === D && a.kind === 'achievement').map(a => a.taskId));
  const local = done.filter(t => !have.has(t.id)).map(t => ({ text: `Completed ${t.title}${t.project ? ' (' + t.project + ')' : ''}`, taskId: t.id }));
  if (!St.sample) { UI.daySuggest = local; render(); return; }
  UI.daySuggesting = true; render();
  try {
    const lines = done.map(t => JSON.stringify({ id: t.id, ref: t.ref, title: t.title, project: t.project || '', topic: topicOf(t), items: subsOf(t).filter(x => x.done).map(x => x.text).slice(0, 8), requestedBy: t.requestedBy || '' })).join('\n');
    const prompt = `You write short, factual work-log achievements for a mechanical design engineer (water and wastewater treatment).\nToday is ${D}. These tasks were completed today (one JSON object per line):\n${lines}\n\nWrite one achievement per task, at most 20 words each, past tense, specific (name the document, equipment or project). Do not invent facts that are not in the data.\nReply with JSON only: [{"taskId":"<id>","text":"<achievement>"}]`;
    const ans = await St.sample.json(prompt, { modelTier: 'quick' });
    const list = (Array.isArray(ans) ? ans : []).filter(a => a && typeof a.text === 'string' && a.text.trim()).map(a => ({ text: E.clip(a.text.trim(), 200), taskId: St.tasks.has(String(a.taskId)) ? String(a.taskId) : null }));
    UI.daySuggest = list.length ? list : local;
  } catch (e) { UI.daySuggest = local; toast('Claude could not draft achievements (' + ((e && e.code) || 'error') + '). Showing simple suggestions instead.', { err: true }); }
  finally { UI.daySuggesting = false; render(); }
}

/* ---------- REVIEW view ---------- */
function viewReview() {
  const pend = [...St.emails.values()].filter(e => e.reviewState === 'pending').sort((a, b) => (a.date || a.importedAt || '').localeCompare(b.date || b.importedAt || ''));
  return `<div class="wrap">
    <div class="page-head"><div><h1>Review</h1><div class="sub">Check what Claude extracted, edit anything, then add the tasks you agree with. Nothing reaches your to-do list without your approval.</div></div>
      ${pend.length > 1 ? `<button class="btn primary" data-act="approve-all">${I.check} Add all selected</button>` : ''}</div>
    ${pend.length ? pend.map(reviewCard).join('') : `<div class="card"><div class="empty"><h3>Nothing to review</h3><p>Analysed emails appear here with their proposed tasks.</p><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button></div></div>`}
  </div>`;
}
function reviewCard(e) {
  const a = e.analysis || {};
  const props = a.tasks || [], ups = a.updates || [];
  const flags = (a.flags || []);
  const sel = props.filter(p => p.accept).length + ups.filter(u => u.accept).length;
  return `<section class="rv" id="rv-${esc(e.id)}">
    <div class="rv-h">
      <div class="row">${a.category ? `<span class="chip accent">${esc(CATEGORY[a.category] || a.category)}</span>` : ''}${a.project ? `<span class="chip proj">${esc(a.project)}</span>` : ''}<span class="small muted">${esc(fmtDateTime(e.date || e.importedAt))}</span>${a.readBy && typeof aiName === 'function' ? `<span class="chip ai-by" title="${esc(aiByTitle(a.readBy))}">Read by ${esc(aiName(a.readBy))}</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-act="open-email" data-id="${esc(e.id)}">${I.mail} Email</button></div>
      <div class="subj" dir="auto">${esc(e.subject || '(no subject)')}</div>
      <div class="small muted" dir="auto">From ${esc(e.from || 'unknown')}</div>
      ${a.summary ? `<p style="margin:2px 0 0" dir="auto">${esc(a.summary)}</p>` : ''}
    </div>
    ${typeof threadHistHTML === 'function' ? threadHistHTML(e, { open: true }) : ''}
    <div class="rv-b">
      ${a.actionRequired === false ? callout('ok', `<p><b>No action needed from you.</b> ${esc(a.noActionReason || '')}</p>`) : ''}
      ${flags.length ? callout('warn', `<p><b>Check before relying on this:</b></p><ul>${flags.map(f => `<li><b>${esc(FLAG[f.kind] || f.kind)}</b>${f.source ? ` <span class="mono">(${esc(srcName(e, f.source))})</span>` : ''}: <span dir="auto">${esc(f.detail)}</span></li>`).join('')}</ul>`) : ''}
      ${(a.decisions || []).length ? `<details class="more"><summary>Decisions recorded (${a.decisions.length})</summary><ul class="small">${a.decisions.map(d => `<li dir="auto">${esc(d)}</li>`).join('')}</ul></details>` : ''}
      ${props.map(p => proposalHTML(e, p)).join('')}
      ${ups.map(u => updateHTML(e, u)).join('')}
      ${!props.length && !ups.length ? `<p class="muted" style="margin:0">No tasks were extracted from this email.</p>` : ''}
    </div>
    <div class="rv-f">
      ${props.length || ups.length ? `<button class="btn primary" data-act="approve" data-id="${esc(e.id)}" ${sel ? '' : 'disabled'}>${I.check} Add ${sel} selected</button>` : ''}
      <button class="btn" data-act="dismiss-email" data-id="${esc(e.id)}">${props.length ? 'Discard all' : 'Mark reviewed'}</button>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-act="reanalyze" data-id="${esc(e.id)}" ${St.sample && e.hasText ? '' : 'disabled'} title="Run the analysis again from the saved text">Re-analyse</button>
    </div>
  </section>`;
}
function srcName(e, key) { const m = (e.analysis && e.analysis.keyMap) || {}; return m[key] || key; }
function proposalHTML(e, p) {
  const k = `${e.id}:${p.pid}`;
  const checks = (p.evidence || []).map(x => x.check);
  const weak = !checks.some(c => c === 'verified' || c === 'visual' || c === 'partial');
  const dup = p.dupOf && St.tasks.get(p.dupOf);
  const flags = [
    p.ownership === 'waiting' ? `<span class="chip wait">⏳ Waiting on ${esc(p.owner)}</span>` : p.ownership === 'fyi' ? '<span class="chip">ℹ️ For information</span>' : '<span class="chip accent">🙋 Mine</span>',
    p.topic ? `<span class="chip topic-chip">🧩 ${esc(p.topic)}</span>` : '',
    (p.subtasks || []).length ? `<span class="chip">🗂️ ${p.subtasks.length} items</span>` : '',
    p.discipline ? `<span class="chip dchip">${discIcon(p.discipline, 14)}${esc(E.DISCIPLINES[p.discipline])}</span>` : '',
    weak ? '<span class="chip warn">Evidence not confirmed</span>' : checks.includes('not_found') ? `<span class="chip warn">${checks.filter(c => c === 'not_found').length} quote not found in source</span>` : '',
    p.confidence < 0.6 ? `<span class="chip warn">Low confidence</span>` : '',
    p.deadlineBasis === 'uncertain' ? '<span class="chip warn">Deadline uncertain</span>' : p.deadlineBasis === 'relative' ? '<span class="chip">Deadline calculated</span>' : '',
  ].join('');
  const id = s => `p-${s}-${p.pid}`;
  return `<div class="prop ${p.accept ? '' : 'off'}">
    <label class="check" style="padding-top:2px"><input type="checkbox" id="${id('acc')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="accept" ${p.accept ? 'checked' : ''}><span class="sr">Include</span></label>
    <div class="body">
      <textarea class="input ptitle autogrow" rows="1" id="${id('title')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="title" dir="auto" aria-label="Task title">${esc(p.title)}</textarea>
      <div class="prop-flags">${flags}</div>
      ${dup ? `<div class="dup"><div>Looks like <b class="mono">${esc(dup.ref)}</b> “${esc(dup.title)}” (${Math.round((p.dupScore || 0.6) * 100)}% match).</div>
        <div class="row"><label class="check"><input type="radio" name="dup-${esc(k)}" id="${id('merge')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="merge" value="1" ${p.merge !== false ? 'checked' : ''}>Update ${esc(dup.ref)} with this evidence</label>
        <label class="check"><input type="radio" name="dup-${esc(k)}" id="${id('new')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="merge" value="0" ${p.merge === false ? 'checked' : ''}>Add as a new task</label></div></div>` : ''}
      <div class="grid3">
        <label class="field"><span>Deadline</span><input class="input" type="date" id="${id('dl')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="deadline" value="${esc(p.deadline || '')}"></label>
        <label class="field"><span>Priority</span><select class="input" id="${id('pr')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="priority">${Object.entries(PRIO).map(([kk, v]) => `<option value="${kk}" ${p.priority === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Project</span><input class="input" id="${id('pj')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="project" value="${esc(p.project)}"></label>
        <label class="field"><span>Whose action</span><select class="input" id="${id('ow')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="ownership">${Object.entries(OWNERSHIP).map(([kk, v]) => `<option value="${kk}" ${p.ownership === kk ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>Responsible</span><input class="input" id="${id('on')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="owner" value="${esc(p.owner)}"></label>
        <label class="field"><span>Requested by</span><input class="input" id="${id('rb')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="requestedBy" value="${esc(p.requestedBy)}"></label>
      </div>
      ${p.deadlineText ? `<div class="small muted">Deadline as written: <span dir="auto">“${esc(p.deadlineText)}”</span></div>` : ''}
      <label class="field"><span>Next step</span><input class="input" id="${id('ns')}" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="nextStep" value="${esc(p.nextStep)}" dir="auto"></label>
      <details class="more"><summary>Requirement and evidence (${(p.evidence || []).length})</summary>
        <div style="display:grid;gap:10px;margin-top:8px">
          <label class="field"><span>What exactly is required</span><textarea class="input" id="${id('ac')}" rows="3" data-chg="prop" data-eid="${esc(e.id)}" data-pid="${esc(p.pid)}" data-field="action" dir="auto">${esc(p.action)}</textarea></label>
          ${(p.subtasks || []).length ? `<div><div class="label" style="margin-bottom:4px">${p.subtasks.length} item${p.subtasks.length > 1 ? 's' : ''} inside this task</div><ol class="small rv-subs">${p.subtasks.map(x => `<li dir="auto">${esc(x.text)}${x.location ? ` <span class="mono muted">${esc(x.location)}</span>` : ''}</li>`).join('')}</ol></div>` : ''}
          ${p.dependsOn ? `<div class="small"><b>Depends on:</b> <span dir="auto">${esc(p.dependsOn)}</span></div>` : ''}
          ${p.blocked ? `<div class="small"><b>Blocked:</b> <span dir="auto">${esc(p.blockedReason || 'yes')}</span></div>` : ''}
          ${evidenceHTML(p.evidence, false)}
        </div></details>
    </div>
  </div>`;
}
function updateHTML(e, u) {
  const t = St.tasks.get(u.taskId); if (!t) return '';
  const what = u.newStatus ? `Status ${STATUS[t.status]} → <b>${esc(STATUS[u.newStatus])}</b>` : u.newDeadline ? `Deadline ${esc(t.deadline ? fmtDate(t.deadline) : '—')} → <b>${esc(fmtDate(u.newDeadline))}</b>` : 'Add a note';
  return `<div class="prop ${u.accept ? '' : 'off'}">
    ${u.applied ? '<span class="chip ok" style="align-self:start">Applied</span>' : `<label class="check" style="padding-top:2px"><input type="checkbox" id="u-acc-${esc(u.uid)}" data-chg="upd" data-eid="${esc(e.id)}" data-uid="${esc(u.uid)}" ${u.accept ? 'checked' : ''}><span class="sr">Apply</span></label>`}
    <div class="body"><div>${u.verdict === 'fulfilled' ? '<span class="chip ok">✓ Your reply completes this task</span>' : u.verdict === 'partial' ? '<span class="chip accent">◐ Your reply does part of this task</span>' : u.verdict === 'not_fulfilled' ? '<span class="chip warn">Your reply does not complete this task yet</span>' : '<span class="chip wait">Update to existing task</span>'}</div>
      <div><span class="mono">${esc(t.ref)}</span> <b dir="auto">${esc(t.title)}</b></div>
      <div class="small">${what}${u.note ? ` — <span dir="auto">${esc(u.note)}</span>` : ''}</div>
      ${u.reason ? `<div class="small muted" dir="auto">${esc(u.reason)}</div>` : ''}${(u.doneItems || []).length ? `<div class="small">Items done: ${u.doneItems.map(x => `<span class="chip">${esc(E.clip(x, 50))}</span>`).join(' ')}</div>` : ''}
      ${evidenceHTML(u.evidence, false)}
    </div></div>`;
}
function updateProposal(eid, pid, field, value) {
  const e = clone(St.emails.get(eid)); if (!e) return;
  const p = (e.analysis.tasks || []).find(x => x.pid === pid); if (!p) return;
  if (field === 'accept') p.accept = !!value;
  else if (field === 'merge') p.merge = value === '1';
  else if (field === 'deadline') { p.deadline = value || null; p.deadlineBasis = value ? 'explicit' : 'none'; }
  else if (field === 'ownership') { p.ownership = value; if (value === 'mine') p.owner = 'me'; else if (p.owner === 'me') p.owner = ''; }
  else p[field] = value;
  putEmail(e); render();
}
function placementFrom(p) {
  const opts = (p.placementOptions || []).filter(o => !o.relatedTaskId || St.tasks.has(o.relatedTaskId));
  const c = p.placementConfidence;
  // never held back: the task goes where Claude put it; when it was not sure, its other options are kept so you
  // can switch with one tap in the task panel ("Wrong place?")
  return (c !== null && c !== undefined && c < 0.7 && opts.length) ? { status: 'auto', confidence: c, options: opts } : { status: 'auto', confidence: c ?? null };
}
// what an email changes on a task it moves on: status, deadline, items done, evidence, the email linked, a history line
function applyTaskUpdate(t0, u, e, now, label) {
  const t = clone(t0); const notes = [];
  if (u.newStatus && u.newStatus !== t.status) { notes.push(`status ${STATUS[t.status]} → ${STATUS[u.newStatus]}`); t.status = u.newStatus; t.completedAt = u.newStatus === 'done' ? now : null; }
  if (u.newDeadline && u.newDeadline !== t.deadline) { notes.push(`deadline → ${fmtDate(u.newDeadline)}`); t.deadline = u.newDeadline; t.deadlineBasis = 'explicit'; }
  if (u.note) notes.push(u.note);
  // items my reply covered are ticked (matched by their reference or their words)
  if ((u.doneItems || []).length && subsOf(t).length) {
    const want = u.doneItems.map(x => E.normMatch(x)); let n = 0;
    t.subtasks = subsOf(t).map(x => { const r = E.normMatch(x.ref || ''), tx = E.normMatch(x.text); const hit = !x.done && want.some(w => w && ((r && (w === r || w.startsWith(r + ' '))) || tx === w || tx.startsWith(w) || w.startsWith(tx))); if (hit) n++; return hit ? { ...x, done: true, doneAt: now } : x; });
    if (n) notes.push(`${n} item${n > 1 ? 's' : ''} done`);
  }
  if (u.verdict) notes.unshift(u.verdict === 'fulfilled' ? (e.fromMe ? 'completed by my email' : 'completed') : u.verdict === 'partial' ? (e.fromMe ? 'partly done by my email' : 'partly done') : (e.fromMe ? 'my email did not complete it' : 'not completed yet'));
  t.evidence = [...(t.evidence || []), ...(u.evidence || []).map(x => ({ ...x, emailId: e.id }))].slice(-20);
  t.emailIds = [...new Set([...(t.emailIds || []), e.id].filter(Boolean))];
  (t.history = t.history || []).push({ at: now, text: `From ${label || `email “${E.clip(e.subject || '(no subject)', 70)}”`}: ${notes.join('; ') || 'updated'}${u.reason ? ' — ' + u.reason : ''}`, emailId: e.id });
  t.updatedAt = now;
  return t;
}
// an email I sent: from one of my addresses or aliases, or under my own name
function isMeSender(em) {
  const me = St.settings.me || {}, fe = String(em.fromEmail || E.firstEmail(em.from || '') || '').toLowerCase();
  const addrs = [...(me.emails || []), ...String(me.aliases || '').split(/[,;\s]+/)].map(x => String(x).trim().toLowerCase()).filter(x => x.includes('@'));
  if (fe && addrs.includes(fe)) return true;
  const name = E.normMatch(String(em.from || '').replace(/<[^>]*>/g, '')), mine = E.normMatch(me.name || '');
  return !!(mine && mine.split(' ').length >= 2 && name && (name === mine || name.includes(mine)));
}
function approveEmail(eid, quiet) {
  const e = clone(St.emails.get(eid)); if (!e) return;
  const a = e.analysis || {}; const now = nowISO();
  const chosen = (a.tasks || []).filter(p => p.accept);
  const creates = chosen.filter(p => !(p.dupOf && p.merge !== false && St.tasks.has(p.dupOf)));
  const refs = nextRefs(creates.length); let ri = 0, added = 0, updated = 0;
  const label = `email “${E.clip(e.subject || '(no subject)', 70)}”`;
  const asked = p => p.askedOn || (e.date || '').slice(0, 10) || null;
  for (const p of chosen) {
    const ev = (p.evidence || []).map(x => ({ ...x, emailId: e.id }));
    // checked again now: a task added a moment ago from another copy of this email (or from the same email added
    // twice before review) is the same obligation, so it is updated rather than duplicated
    if (!(p.dupOf && St.tasks.has(p.dupOf)) && p.merge !== false) {
      const late = E.findDuplicate(p, [...St.tasks.values()], e.threadKey);
      if (late && late.score >= 0.62) { p.dupOf = late.task.id; p.merge = true; }
    }
    if (p.dupOf && p.merge !== false && St.tasks.has(p.dupOf)) {
      const t = clone(St.tasks.get(p.dupOf));
      if (asked(p) && (!t.askedOn || asked(p) < t.askedOn)) t.askedOn = asked(p);
      t.evidence = [...(t.evidence || []), ...ev].slice(-20);
      t.emailIds = [...new Set([...(t.emailIds || []), e.id])];
      const notes = [];
      if (p.deadline && p.deadline !== t.deadline) { notes.push(`deadline ${t.deadline ? fmtDate(t.deadline) : '—'} → ${fmtDate(p.deadline)}`); t.deadline = p.deadline; t.deadlineBasis = p.deadlineBasis; t.deadlineText = p.deadlineText; }
      if (PRIO_RANK[p.priority] < PRIO_RANK[t.priority]) { notes.push(`priority ${PRIO[t.priority]} → ${PRIO[p.priority]}`); t.priority = p.priority; }
      if (t.status === 'done') { t.status = 'todo'; t.completedAt = null; notes.push('reopened'); }
      if (p.nextStep) t.nextStep = p.nextStep;
      const have = new Set(subsOf(t).map(x => E.normMatch(x.text)));
      const addS = (p.subtasks || []).filter(x => !have.has(E.normMatch(x.text)));
      if (addS.length) { t.subtasks = [...subsOf(t), ...addS.map(x => ({ id: E.uid('s'), text: x.text, ref: x.ref || '', location: x.location || '', done: false }))]; notes.push(`${addS.length} item${addS.length > 1 ? 's' : ''} added`); }
      if (!t.catLocked) { if (p.workType && !t.workType) t.workType = p.workType; if (p.topic && !topicOf(t)) t.topic = p.topic; if (p.discipline && !t.discipline) t.discipline = p.discipline; }
      const nr = (p.relatedTaskIds || []).filter(id => St.tasks.has(id) && id !== t.id && !relIds(t).includes(id)); if (nr.length) t.relatedIds = [...relIds(t), ...nr];
      (t.history = t.history || []).push({ at: now, text: `Updated from ${label}${notes.length ? ': ' + notes.join(', ') : ''}`, emailId: e.id });
      putTask(t); updated++;
    } else {
      const t = {
        id: E.uid('t'), ref: refs[ri++], title: p.title, action: p.action, type: p.type, ownership: p.ownership, owner: p.ownership === 'mine' ? 'me' : p.owner,
        requestedBy: p.requestedBy, project: p.project, priority: p.priority, deadline: p.deadline, deadlineText: p.deadlineText, deadlineBasis: p.deadlineBasis,
        status: p.blocked ? 'blocked' : p.ownership === 'waiting' ? 'waiting' : 'todo', nextStep: p.nextStep, dependsOn: p.dependsOn, blockedReason: p.blockedReason,
        relatedIds: (p.relatedTaskIds || []).filter(id => St.tasks.has(id)), placement: placementFrom(p), topic: p.topic || '', tags: p.tags || [], subtasks: (p.subtasks || []).map(x => ({ id: E.uid('s'), text: x.text, ref: x.ref || '', location: x.location || '', done: false })), workType: p.workType || null, discipline: p.discipline || null, catBy: p.workType || p.discipline ? 'ai' : null, notes: '', evidence: ev, emailIds: [e.id], threadKey: e.threadKey, sourceSubject: e.subject, sourceFrom: e.from, sourceDate: e.date,
        askedOn: asked(p), threadFirst: (a.thread && a.thread.first) || null, threadLast: (a.thread && a.thread.last) || null,
        createdAt: now, updatedAt: now, completedAt: null, confidence: p.confidence, history: [{ at: now, text: `Created from ${label}`, emailId: e.id }],
      };
      putTask(t); added++;
    }
  }
  for (const u of (a.updates || []).filter(u => u.accept && !u.applied)) {
    const t0 = St.tasks.get(u.taskId); if (!t0) continue;
    putTask(applyTaskUpdate(t0, u, e, now, label)); updated++;
  }
  e.reviewState = 'reviewed'; e.reviewedAt = now; putEmail(e);
  runHooks('approved', e);
  if (!quiet) { toast(`${added} task${added === 1 ? '' : 's'} added${updated ? `, ${updated} updated` : ''}.`, { action: 'Open to-do', fn: () => go('todo') }); render(); }
  return { added, updated };
}
function approveAll() {
  let added = 0, updated = 0, cleared = 0;
  for (const e of [...St.emails.values()].filter(x => x.reviewState === 'pending')) {
    const a = e.analysis || {};
    const sel = (a.tasks || []).some(p => p.accept) || (a.updates || []).some(u => u.accept);
    if (sel) { const r = approveEmail(e.id, true); added += r.added; updated += r.updated; }
    else if (!(a.tasks || []).length && !(a.updates || []).length) { const c = clone(e); c.reviewState = 'reviewed'; putEmail(c); cleared++; }
  }
  toast(`${added} task${added === 1 ? '' : 's'} added${updated ? `, ${updated} updated` : ''}${cleared ? `, ${cleared} no-action email${cleared > 1 ? 's' : ''} cleared` : ''}.`, { action: 'Open to-do', fn: () => go('todo') });
  render();
}

/* ---------- IMPORT view ---------- */
function viewImport() {
  const s = St.settings;
  const aiOK = !!St.sample;
  const ready = UI.staging.filter(b => b.state === 'ready' && !b.skip);
  return `<div class="wrap">
    <div class="page-head"><div><h1>Add emails</h1><div class="sub">Forward emails to your address, or add saved Outlook files. Claude reads each email with its attachments and proposes tasks for your review.</div></div></div>
    ${!aiOK && St.capsResolved ? callout('warn', DESKTOP ? '<p><b>Connect your Claude account so the app can read your emails</b> (it uses your Pro or Max plan; one click in Setup). <button class="btn sm primary" data-act="nav" data-view="setup">Open Setup</button></p>' : '<p><b>Claude analysis is not available in this view.</b> Open this page inside Claude while signed in, and choose Allow when asked.</p>') : ''}
    ${!s.me.name ? callout('warn', `<p>Tell Claude who you are first, so it can separate your actions from other people's. <button class="btn sm" data-act="nav" data-view="setup">Open Setup</button></p>`) : ''}
    ${gmailCardHTML()}
    <div class="drop" id="drop">
      <h2>Or add files</h2>
      <p>Drop Outlook .msg or .eml files (attachments come with them), a .zip of several, or loose PDF, Word, Excel, drawings and photos.</p>
      <div class="row" style="justify-content:center">
        <label class="btn primary" for="file-in">${I.upload} Choose files</label><input id="file-in" type="file" multiple hidden data-chg="files">
        <button class="btn" data-act="toggle-paste">Paste email text</button>
      </div>
    </div>
    ${UI.pasteOpen ? pastePanelHTML() : ''}
    ${typeof aiSimpleHTML === 'function' ? aiSimpleHTML(ready) : ''}
    <div id="staging">${stagingHTML()}</div>
    ${UI.staging.length ? `<div class="card pad action-bar"><div class="row">${UI.analyzing ? `<button class="btn" data-act="stop">Stop</button><span class="small muted">Analysing… keep this page open.</span>` : `${ready.length ? `<button class="btn primary" data-act="analyze">${I.spark} Analyse ${ready.length} email${ready.length === 1 ? '' : 's'}</button>` : ''}<button class="btn ${ready.length ? 'ghost' : ''}" data-act="clear-staging">${ready.length ? 'Clear list' : 'Clear finished'}</button>`}<span class="spacer"></span><button class="btn ghost sm" data-act="nav" data-view="setup">Analysis options</button></div></div>` : ''}
    <details class="card pad howto"><summary>Saving emails from Outlook as files</summary><ol>
      <li><b>Classic Outlook:</b> drag a message onto your desktop or a folder — it saves as .msg with its attachments. Select several and drag them together for a batch.</li>
      <li><b>New Outlook / Outlook on the web:</b> open the message › More actions (…) › Save as (.eml).</li>
      <li><b>Phone:</b> forward to your address above, or copy the text into “Paste email text”.</li>
    </ol></details>
  </div>`;
}
function pastePanelHTML() {
  return `<div class="card pad" style="display:grid;gap:10px">
    <div class="section-title"><h2>Paste an email</h2></div>
    <p class="small muted" style="margin:0">Include the From / Sent / To / Subject lines if you can — Outlook copies them when you select the whole message. The conversation history below it helps too.</p>
    <textarea class="input" id="paste-text" rows="9" placeholder="From: …&#10;Sent: …&#10;To: …&#10;Subject: …&#10;&#10;Dear …" dir="auto"></textarea>
    <div class="row"><label class="btn" for="paste-files">${I.clip} Add attachments</label><input id="paste-files" type="file" multiple hidden data-chg="paste-files"><span class="small muted" id="paste-files-n"></span><span class="spacer"></span><button class="btn ghost" data-act="toggle-paste">Cancel</button><button class="btn primary" data-act="add-paste">Add to list</button></div>
  </div>`;
}
const ATT_STATUS = { text: ['Text read', 'ok'], vision: ['As images', 'med'], mixed: ['Text + images', 'ok'], unreadable: ['Not readable', 'crit'], unsupported: ['Not supported', 'warn'], skipped: ['Skipped', ''], container: ['Archive', ''], excluded: ['Not sent', ''], missing: ['Add the file', 'warn'] };
function attRow(b, a) {
  const st = a.extracting ? ['Reading…', ''] : a.res ? (ATT_STATUS[a.res.status] || ['?', '']) : ['Waiting', ''];
  const detail = a.res ? [a.res.kindLabel, a.res.pages ? a.res.pages + ' p.' : '', a.res.images && a.res.images.length ? a.res.images.length + ' image' + (a.res.images.length > 1 ? 's' : '') : '', a.size ? fmtBytes(a.size) : ''].filter(Boolean).join(' · ') : (a.size ? fmtBytes(a.size) : '');
  const canInclude = a.res && !['unreadable', 'unsupported', 'container'].includes(a.res.status) && !(a.res.status === 'skipped' && !a.res.images?.length && !a.res.text);
  const others = UI.staging.filter(x => x.id !== b.id && x.source !== 'docs');
  const pk = `${b.id}:${a.id}`;
  return `<div class="att ${a.include ? '' : 'off'}">
    ${a.res && (a.res.kind === 'image' || (a.res.images || []).length) ? I.image : I.file}
    <div style="min-width:0"><div class="name" dir="auto">${esc(a.name)}</div><div class="note">${esc(detail)}${a.res && a.res.note ? ' — ' + esc(a.res.note) : ''}</div></div>
    <div class="att-side"><span class="chip ${st[1]}">${st[0]}</span>
      ${a.missing && !['done', 'analyzing'].includes(b.state) ? `<label class="btn sm primary" for="sup-${esc(pk)}">${I.clip} Add file</label><input id="sup-${esc(pk)}" type="file" hidden data-chg="att-supply" data-bid="${esc(b.id)}" data-aid="${esc(a.id)}">${b.gmailUrl ? `<a class="btn ghost sm" href="${esc(b.gmailUrl)}" target="_blank" rel="noopener">Open in Gmail</a>` : ''}` : ''}
      ${canInclude ? `<label class="check small"><input type="checkbox" id="inc-${esc(pk)}" data-chg="att-include" data-bid="${esc(b.id)}" data-aid="${esc(a.id)}" ${a.include ? 'checked' : ''}>Send</label>` : ''}
      ${a.res && a.res.text ? `<button class="btn ghost sm" data-act="preview" data-key="${esc(pk)}">${UI.previews.has(pk) ? 'Hide' : 'Text'}</button>` : ''}
      ${others.length && !UI.analyzing ? `<select class="input" style="height:30px;width:auto;max-width:150px;font-size:12.5px" id="mv-${esc(pk)}" data-chg="move-att" data-bid="${esc(b.id)}" data-aid="${esc(a.id)}" aria-label="Move to another email"><option value="">Move to…</option>${others.map(o => `<option value="${esc(o.id)}">${esc(E.clip(o.email.subject || o.fileName || 'email', 40))}</option>`).join('')}</select>` : ''}
    </div>
    ${UI.previews.has(pk) && a.res && a.res.text ? `<div class="preview">${esc(E.clip(a.res.text, 20000))}${a.res.text.length > 20000 ? '\n…' : ''}</div>` : ''}
  </div>`;
}
function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : n > 1024 ? Math.round(n / 1024) + ' KB' : n + ' B'; }
function stagingHTML() {
  if (!UI.staging.length) return '';
  return `<div style="display:grid;gap:12px">${UI.staging.map(b => {
    const em = b.email;
    const stateChip = { parsing: '<span class="chip">Reading files…</span>', ready: b.skip ? '<span class="chip">Skipped</span>' : '<span class="chip accent">Ready</span>' + (b.tierOverride === 'quick' ? '<span class="chip ai-quick" title="Read with the quick, cheaper model">Quick model</span>' : (St.settings.tier === 'auto' && !b.skip ? (t => `<span class="chip ai-quick" title="Smart model choice: the ${TIER_NAME[t]} is enough for this email">${t === 'quick' ? '⚡ Quick' : t === 'default' ? '◐ Balanced' : '◆ Thorough'}</span>`)(autoTier(b, undefined, 1)) : '')), analyzing: '<span class="chip accent">Analysing…</span>', done: '<span class="chip ok">Analysed</span>', error: '<span class="chip crit">Failed</span>' }[b.state];
    return `<div class="bundle">
      <div class="bundle-h"><div style="min-width:0">
        ${b.source === 'docs' ? `<div class="subj">Documents without an email</div><div class="meta">Analysed together as one item. Use “Move to…” to attach a file to an email instead.</div>` :
        `<div class="subj" dir="auto">${esc(em.subject || '(no subject)')}</div><div class="meta" dir="auto">${esc(em.from || 'Sender unknown')}${em.date ? ' · ' + esc(fmtDateTime(em.date)) : ''}${b.fileName ? ' · ' + esc(b.fileName) : ''}</div>`}
      </div><div class="row" style="align-items:flex-start">${stateChip}${b.state !== 'analyzing' ? `<button class="icon-btn" data-act="remove-bundle" data-id="${esc(b.id)}" aria-label="Remove">${I.x}</button>` : ''}</div></div>
      ${(b.dupEmailId || b.dupBundle) && b.state === 'ready' ? `<div style="padding:10px 14px 0">${callout('info', `<div class="row"><span>${b.dupEmailId ? `Already added on ${esc(fmtDate(St.emails.get(b.dupEmailId)?.importedAt))}` : 'The same email is already in this list'} — skipped, so no duplicate tasks.</span><label class="check small"><input type="checkbox" id="skip-${esc(b.id)}" data-chg="skip" data-bid="${esc(b.id)}" ${b.skip ? '' : 'checked'}>Analyse again</label></div>`)}</div>` : ''}
      ${b.state === 'analyzing' ? `<div style="padding:10px 14px;display:grid;gap:6px"><div class="progress indet"><i></i></div><div class="small muted">${esc(b.progress || 'Sending to Claude…')}</div></div>` : ''}
      ${b.state === 'error' ? `<div style="padding:10px 14px">${callout('crit', `<p>${esc(b.error)}</p>${typeof aiErrorActions === 'function' ? aiErrorActions(b) : ''}`)}</div>` : ''}
      ${b.state === 'done' ? `<div style="padding:10px 14px">${callout('ok', `<div class="row"><span>${esc(b.doneText || 'Analysed.')}</span><span class="spacer"></span><button class="btn sm" data-act="nav" data-view="review">Review</button></div>`)}</div>` : ''}
      ${b.state === 'done' ? '' : `${(b.warnings || []).length ? `<div style="padding:10px 14px 0">${callout('warn', b.warnings.map(w => `<p>${esc(w)}</p>`).join(''))}</div>` : ''}
      ${b.source !== 'docs' && em.body ? `<details class="more" style="padding:8px 14px"><summary>Email text (${em.body.length.toLocaleString()} characters)</summary><div class="bodytext" style="margin-top:8px">${esc(E.clip(em.body, 12000))}</div></details>` : ''}
      ${b.atts.length ? b.atts.map(a => attRow(b, a)).join('') : `<div class="att"><span></span><div class="note">No attachments.</div><span></span></div>`}`}
    </div>`;
  }).join('')}</div>`;
}
function rerenderStaging() { const n = $('#staging'); if (n && UI.view === 'import') keepFocus(() => { n.innerHTML = deco(stagingHTML()); }); if (UI.view === 'import') { const btnRow = document.querySelector('[data-act="analyze"]'); if (btnRow || UI.analyzing) scheduleRender(); } }

/* ----- file intake ----- */
const mkAtt = o => ({ id: E.uid('a'), name: o.name, mime: o.mime || E.guessMime(o.name), size: o.size ?? (o.bytes ? o.bytes.length : 0), bytes: o.bytes || null, email: o.email || null, inline: !!o.inline, include: !o.missing, missing: !!o.missing, res: null, extracting: false });
async function intakeFiles(fileList, target) {
  const files = [...fileList];
  if (!files.length) return;
  const loose = [];
  const newBundles = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = E.kindOf(f.name, f.type);
    if (!target && (kind === 'eml' || kind === 'msg')) {
      try { const em = await parseEmailFile(bytes, kind); const nb = await bundleFromEmail(em, kind, f.name); nb.original = { bytes, kind, name: f.name }; newBundles.push(nb); }
      catch (e) { toast(`${f.name}: could not be opened as an email (${e.message || 'damaged file'}).`, { err: true }); }
    } else if (!target && kind === 'zip') {
      try {
        const JSZip = await E.need('jszip'); const zip = await JSZip.loadAsync(bytes);
        for (const zf of Object.values(zip.files)) {
          if (zf.dir || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(zf.name)) continue;
          const zb = await zf.async('uint8array'); const nm = zf.name.split('/').pop(); const zk = E.kindOf(nm, '');
          if (zk === 'eml' || zk === 'msg') { try { const nb = await bundleFromEmail(await parseEmailFile(zb, zk), zk, f.name + ' › ' + nm); nb.original = { bytes: zb, kind: zk, name: nm }; newBundles.push(nb); } catch { loose.push({ name: f.name + ' › ' + nm, bytes: zb }); } }
          else loose.push({ name: f.name + ' › ' + nm, bytes: zb });
        }
      } catch (e) { toast(`${f.name}: ${e.message || 'could not open ZIP'}`, { err: true }); }
    } else loose.push({ name: f.name, bytes, mime: f.type });
  }
  UI.staging.push(...newBundles); newBundles.forEach(checkDuplicateEmail);
  if (loose.length) {
    let host = target || null;
    if (!host && newBundles.length === 1) host = newBundles[0];
    if (!host && !newBundles.length) { const emailBundles = UI.staging.filter(b => b.source !== 'docs' && b.state === 'ready'); if (emailBundles.length === 1 && UI.staging.length === 1) host = emailBundles[0]; }
    if (!host) { host = UI.staging.find(b => b.source === 'docs' && b.state === 'ready'); if (!host) { host = newBundle({ subject: 'Documents', body: '', attachments: [], warnings: [] }, 'docs', ''); UI.staging.push(host); } }
    for (const l of loose) await addAttTo(host, l, '', 0);
    if (host.source !== 'docs' && !target && newBundles.length !== 1) toast(`Attached ${loose.length} file${loose.length > 1 ? 's' : ''} to “${E.clip(host.email.subject || 'email', 40)}”. Use “Move to…” to change.`);
  }
  newBundles.forEach(checkDuplicateEmail);
  render();
  await extractPending();
}
async function parseEmailFile(bytes, kind) {
  if (kind === 'eml') return E.parseEml(bytes);
  const XLSX = await E.need('xlsx');
  let cfb; try { cfb = XLSX.CFB.read(bytes, { type: 'array' }); } catch { throw new Error('not an Outlook .msg file'); }
  return E.readMsgFromCfb(cfb);
}
function newBundle(email, source, fileName) {
  return { id: E.uid('b'), source, fileName, email, atts: [], warnings: [...(email.warnings || [])], state: 'parsing', skip: false };
}
async function bundleFromEmail(em, source, fileName) {
  const b = newBundle(em, source, fileName);
  for (const a of em.attachments) await addAttTo(b, a, '', 0);
  return b;
}
async function addAttTo(b, a, prefix, depth) {
  const kind = a.email ? 'email' : E.kindOf(a.name, a.mime);
  if (!a.email && (kind === 'eml' || kind === 'msg') && a.bytes && depth < 3) {
    try { a = { ...a, email: await parseEmailFile(a.bytes, kind) }; } catch {}
  }
  if (a.email) {
    b.atts.push(mkAtt({ name: prefix + a.name, mime: 'message/rfc822', size: a.size, email: a.email }));
    if (depth < 3) for (const c of a.email.attachments) await addAttTo(b, c, prefix + a.name + ' › ', depth + 1);
    (a.email.warnings || []).forEach(w => b.warnings.push(w));
    return;
  }
  if (kind === 'tnef' && a.bytes && depth < 3) {
    const t = E.parseTnef(a.bytes);
    if (t && (t.attachments.length || t.body)) {
      for (const x of t.attachments) await addAttTo(b, { name: x.name, mime: x.mime, bytes: x.bytes }, prefix, depth + 1);
      if (t.body && t.body.trim().length > 20 && !(b.email.body || '').includes(t.body.trim().slice(0, 60))) b.atts.push(mkAtt({ name: prefix + 'Message text (from winmail.dat).txt', bytes: new TextEncoder().encode(t.body) }));
      return;
    }
  }
  if (kind === 'zip' && a.bytes && depth < 3) {
    try {
      const JSZip = await E.need('jszip'); const zip = await JSZip.loadAsync(a.bytes);
      for (const zf of Object.values(zip.files)) { if (zf.dir || /(^|\/)(__MACOSX|\.DS_Store)/.test(zf.name)) continue; await addAttTo(b, { name: zf.name.split('/').pop(), bytes: await zf.async('uint8array') }, prefix + a.name + ' › ', depth + 1); }
      return;
    } catch { /* fall through and show as unreadable */ }
  }
  b.atts.push(mkAtt({ ...a, name: prefix + a.name }));
}
// the same email added again — re-uploaded, forwarded a second time, or fetched from Gmail twice — is recognised
// by its Message-ID, by sender + subject + sent time, or by the same subject and opening text, and is not analysed again
const bodyPrint = t => E.normMatch(String(t || '').replace(/\s+/g, ' ').slice(0, 400)).slice(0, 220);
function sameEmail(em, e) {
  const key = E.normSubject(em.subject || '').toLowerCase(), k2 = E.normSubject(e.subject || '').toLowerCase();
  if (em.messageId && e.messageId && e.messageId === em.messageId) return true;
  if (key && k2 === key && e.fromEmail && e.fromEmail === em.fromEmail && e.date && em.date && Math.abs(new Date(e.date) - new Date(em.date)) < 120000) return true;
  const bp = bodyPrint(em.body);
  return !!(key && k2 === key && bp.length >= 60 && bodyPrint(e.snippet) === bp.slice(0, bodyPrint(e.snippet).length) && bodyPrint(e.snippet).length >= 60);
}
function checkDuplicateEmail(b) {
  const em = b.email; if (b.source === 'docs') return;
  for (const e of St.emails.values()) if (sameEmail(em, e)) { b.dupEmailId = e.id; b.skip = true; return; }
  // the same email twice in this batch: only the first is analysed
  for (const o of UI.staging) if (o !== b && o.email && !o.dupEmailId && o.state !== 'error' && sameEmail(em, { ...o.email, snippet: o.email.body || '' })) { b.dupBundle = o.id; b.skip = true; return; }
}
function extractOpts() {
  const s = St.settings, lim = St.limits;
  const canImg = !!(lim && lim.images);
  return { vision: s.vision && canImg, drawings: s.drawings && canImg, titleBlocks: s.titleBlocks && canImg, maxPageImages: s.maxPageImages, maxImageBytes: lim && lim.images ? lim.images.maxInputBytes : 0 };
}
let extracting = false;
async function extractPending() {
  if (extracting) return; extracting = true;
  try {
    for (;;) {
      const b = UI.staging.find(x => x.state === 'parsing'); if (!b) break;
      for (const a of b.atts) {
        if (a.res) continue;
        if (a.missing) { a.res = { kind: E.kindOf(a.name, a.mime), kindLabel: E.KIND_LABEL[E.kindOf(a.name, a.mime)] || 'File', status: 'missing', note: 'Too large to download through Gmail — add the file to include it', text: '', images: [] }; a.include = false; continue; }
        a.extracting = true; rerenderStaging();
        a.res = await E.extract(a, extractOpts());
        a.extracting = false;
        if (['unreadable', 'unsupported', 'container'].includes(a.res.status) || (a.res.status === 'skipped' && !(a.res.images || []).length && !a.res.text)) a.include = false;
        if (a.inline && a.res.status === 'skipped') a.include = false;
        rerenderStaging();
      }
      if (b.state === 'parsing') b.state = 'ready';
      if (b.source !== 'docs') E.localFlags(b.email, b.atts).forEach(f => b.warnings.push(f.detail));
      b.warnings = [...new Set(b.warnings)];
      render();
    }
  } finally { extracting = false; }
}
function reextractImages() {
  for (const b of UI.staging) if (b.state === 'ready' || b.state === 'error') {
    let changed = false;
    for (const a of b.atts) if (a.res && (a.res.kind === 'pdf' || a.res.kind === 'image')) { a.res = null; a.include = true; changed = true; }
    if (changed) b.state = 'parsing';
  }
  render(); extractPending();
}

/* ----- analysis ----- */
function aiErrorText(e) {
  const c = e && e.code;
  return ({
    not_granted: 'Claude access was not allowed for this page. Reload and choose Allow when asked.',
    sampling_disabled: 'Claude is not available for this account.',
    rate_limited: 'Usage limit reached for now. Wait a while, then press Analyse again — finished emails are kept.',
    session_expired: 'Your Claude session expired. Sign in again and reload.',
    prompt_too_large: 'This email and its attachments are too large to analyse at once. Untick some attachments (“Send”) and try again.',
    image_rejected: 'One of the images was rejected. Untick image attachments and try again.',
    images_unavailable: 'Images cannot be sent from this view. Turn off the image options and try again.',
    refused: 'Claude declined to analyse this content.',
    invalid_json: 'The answer could not be read as tasks. Press Analyse to try again.',
    empty_completion: 'Claude returned an empty answer. Try again, or send fewer attachments.',
    upstream_error: 'Connection problem while analysing. Press Analyse to retry this email.',
    auth_failed: 'Your Anthropic API key was rejected. Check it in Setup › Connections.',
    billing: 'Your Anthropic account has no usable credit or the model is not enabled for it. Check console.anthropic.com › Billing, then press Analyse again.',
    model_not_found: 'The Claude model set in Setup › Connections was not found. Check the model names there.',
  })[c] || ('Analysis failed' + (c ? ' (' + c + ')' : '') + '.');
}
/* Smart model choice: a short email with nothing attached to read goes to the quick model, ordinary emails and
   small attachments to the balanced one, and only drawings, images, long documents or long threads to the most
   capable one — the same quality where it matters, far fewer tokens on the rest. */
const TIER_NAME = { quick: 'quick model', default: 'balanced model', complex: 'thorough model' };
function autoTier(b, nImages, nParts) {
  const atts = (b.atts || []).filter(a => a.include && a.res);
  const attText = atts.reduce((n, a) => n + ((a.res.text || '').length), 0);
  const body = ((b.email && b.email.body) || '').length;
  if (nImages === undefined) nImages = atts.reduce((n, a) => n + ((a.res.images || []).length), 0);
  if (nImages || nParts > 1 || attText > 60000 || body > 40000 || atts.some(a => /drawing|cad|dwg/i.test(a.res.kindLabel || ''))) return 'complex';
  if (!attText && body < 5000 && atts.length === 0) return 'quick';
  return 'default';
}
async function runAnalysis(opts = {}) {
  if (UI.analyzing) return;
  if (!St.sample && DESKTOP) await recheckAI();
  if (!St.sample) {
    toast(DESKTOP ? 'Connect your Claude account first: Setup › Connections › Connect my Claude account.' : 'Claude analysis is not available in this view.', { err: true, action: DESKTOP ? 'Open Setup' : '', fn: () => go('setup') });
    return;
  }
  UI.analyzing = true; render();
  // automatic analysis waits for emails whose attachments you still have to add (too large for Gmail);
  // pressing Analyse reads them as they are
  const queue = UI.staging.filter(b => b.state === 'ready' && !b.skip && !(opts.auto && b.atts.some(a => a.missing)));
  let ok = 0;
  for (const b of queue) {
    if (!UI.analyzing) break;
    b.state = 'analyzing'; b.progress = 'Waiting for Claude…'; rerenderStaging();
    UI.abort = new AbortController();
    try {
      const rec = await analyzeBundle(b, UI.abort.signal, txt => { b.progress = txt; const n = $('#staging'); if (n) rerenderStaging(); });
      b.state = 'done'; ok++;
      const nt = rec.analysis.tasks.length;
      b.doneText = rec.analysis.actionRequired === false && !nt ? 'No action needed from you.' : `${nt} task${nt === 1 ? '' : 's'} proposed${rec.analysis.updates.length ? `, ${rec.analysis.updates.length} update${rec.analysis.updates.length > 1 ? 's' : ''} to existing tasks` : ''}.`;
      if (rec.analysis.readBy && typeof aiName === 'function') b.doneText += ` Read by ${aiName(rec.analysis.readBy)}${rec.analysis.readBy.fallback ? ' (backup AI)' : ''}.`;
      else if (b.tierUsed) b.doneText += ` Read by the ${TIER_NAME[b.tierUsed]}.`;
    } catch (e) {
      if (e && e.code === 'cancelled') { b.state = 'ready'; break; }
      b.state = 'error'; b.error = (typeof aiErrorFor === 'function' && aiErrorFor(e)) || aiErrorText(e); b.errInfo = e ? { code: e.code, provider: e.provider || '', backup: e.backup || '' } : null;
      if (e && ['not_granted', 'sampling_disabled', 'rate_limited', 'session_expired', 'auth_failed', 'billing', 'model_not_found', 'budget', 'unavailable'].includes(e.code)) { rerenderStaging(); break; }
    }
    rerenderStaging();
  }
  for (const b of UI.staging) if (b.state === 'error') { /* keep for retry */ }
  UI.analyzing = false; UI.abort = null;
  render();
  if (ok) toast(`${ok} email${ok > 1 ? 's' : ''} analysed.`, { action: 'Review', fn: () => go('review') });
  runHooks('analysed', ok);
}
function retryErrored() { UI.staging.forEach(b => { if (b.state === 'error') b.state = 'ready'; }); }

/* Build analysis input from bundle (live files) or saved texts */
async function analyzeBundle(b, signal, onProgress) {
  const s = St.settings;
  const em = b.email;
  const masker = s.mask ? E.makeMasker(s.me.emails) : { mask: x => x, unmask: x => x };
  const atts = []; const images = []; const sources = {}; const keyMap = { BODY: 'Email body' };
  const maxImgs = St.limits && St.limits.images ? St.limits.images.maxCount : 0;
  const imgDropped = [];
  sources.BODY = { name: b.source === 'docs' ? 'Note' : 'Email body', text: em.body || '' };
  let n = 0;
  for (const a of b.atts) {
    const r = a.res || {};
    const key = 'A' + (++n); keyMap[key] = a.name;
    if (!a.include) { atts.push({ key, name: a.name, kindLabel: r.kindLabel || 'File', status: 'excluded', note: r.note || 'not sent by the user', text: '' }); continue; }
    if (r.text) { atts.push({ key, name: a.name, kindLabel: r.kindLabel || 'File', status: r.status, note: r.note || '', text: masker.mask(r.text) }); sources[key] = { name: a.name, text: r.text }; }
    else atts.push({ key, name: a.name, kindLabel: r.kindLabel || 'File', status: r.status, note: [r.note, (r.images || []).length ? 'Content provided as images.' : ''].filter(Boolean).join(' '), text: '' });
    for (const im of (r.images || [])) {
      if (images.length >= maxImgs) { imgDropped.push(`${a.name} (${im.label})`); continue; }
      const k = 'IMG' + (images.length + 1);
      images.push({ key: k, label: `"${a.name}" ${im.label === 'image' ? '' : im.label} — belongs to ${key}`.replace(/\s+/g, ' '), blob: im.blob });
      sources[k] = { name: `${a.name}${im.label === 'image' ? '' : ' · ' + im.label}`, visual: true }; keyMap[k] = sources[k].name;
    }
  }
  const tk = E.threadKey(em);
  const fromMe = isMeSender(em);
  // tasks from earlier emails of this conversation are always listed, and marked, so new tasks join their topic
  const peers = typeof convPeers === 'function' ? convPeers({ ...em, gmailThread: b.gmailThread }, tk) : new Set();
  const same = t => (t.emailIds || []).some(id => peers.has(id));
  const rel0 = E.relatedOpenTasks([...St.tasks.values()], { ...em, fromMe }, tk), relIdsSet = new Set(rel0.map(t => t.id));
  const related = [...[...St.tasks.values()].filter(t => same(t) && !relIdsSet.has(t.id)).slice(0, 15), ...rel0].map(t => ({ id: t.id, ref: t.ref, title: t.title, project: t.project, topic: topicOf(t), discipline: t.discipline, owner: t.ownership === 'mine' ? 'me' : t.owner, status: t.status, deadline: t.deadline, sameThread: same(t) }));
  const budget = ((St.limits && St.limits.maxPromptBytes) || 262144) - 10000;
  const input = {
    me: s.me, projects: allProjects(), topics: allTopics(), today: E.todayISO(), tz: TZ,
    email: { fromMe, subject: masker.mask(em.subject), from: masker.mask(em.from), to: masker.mask(em.to), cc: masker.mask(em.cc), date: em.date, forwardedBy: masker.mask(em.forwardedBy || ''), forwardedAt: em.forwardedAt || '', forwardMode: em.forwardMode || '', body: masker.mask(em.body || (b.source === 'docs' ? '(No email — the user shared these documents directly. Identify what they require from the user, if anything.)' : '')) },
    attachments: atts, images: images.map(i => ({ key: i.key, label: i.label })), openTasks: related, budget, notes: promptNotes(em),
  };
  let { prompt, truncations } = E.buildPrompt(input);
  // too long for one request: analysed in parts that together cover every page and row, results combined
  const parts = truncations.length ? splitLongEmail(input, budget) : [{ prompt, images: true }];
  if (parts.length > 1) truncations = parts.dropped || [];
  // b.tierOverride: 'quick' when you chose the quick model for a simple email (features/12-ai.js)
  // Smart (the default): each email gets the smallest model that reads it well — see autoTier
  let tier = b.tierOverride === 'quick' ? 'quick' : s.tier === 'auto' || !s.tier ? autoTier(b, images.length, parts.length) : s.tier; let readBy = null;
  b.tierUsed = tier;
  const results = [];
  for (let i = 0; i < parts.length; i++) {
    const pre = parts.length > 1 ? `Long email — part ${i + 1} of ${parts.length}. ` : '';
    const ask = t => { onProgress(pre + `Waiting for Claude (${TIER_NAME[t]})… consent, queue and thinking can take a minute`); return St.sample.json(parts[i].prompt, {
      signal, modelTier: t === 'quick' ? 'quick' : t === 'default' ? 'default' : 'complex', cache: b.fresh ? false : undefined, onMeta: m => { readBy = m; },
      ...(images.length && parts[i].images ? { images: images.map(x => x.blob) } : {}),
      onText: ({ text }) => onProgress(`${pre}Receiving results… ${Math.round(text.length / 100) / 10}k characters`),
    }); };
    let an;
    try { an = E.normalizeAnalysis(await ask(tier), { unmask: masker.unmask }); }
    catch (err) {
      // a smaller model that could not give a clean answer hands the email to the next one up (once)
      if (s.tier !== 'auto' || tier === 'complex' || !err || ['cancelled', 'not_granted', 'sampling_disabled', 'rate_limited', 'session_expired', 'auth_failed', 'billing', 'budget'].includes(err.code)) throw err;
      tier = tier === 'quick' ? 'default' : 'complex'; b.tierUsed = tier;
      an = E.normalizeAnalysis(await ask(tier), { unmask: masker.unmask });
    }
    // an action email that the quick model found nothing in is read again by the balanced one
    if (s.tier === 'auto' && tier === 'quick' && !an.tasks.length && !an.updates.length && an.actionRequired !== false) {
      tier = 'default'; b.tierUsed = tier; an = E.normalizeAnalysis(await ask(tier), { unmask: masker.unmask });
    }
    results.push(an);
  }
  const an = results.length > 1 ? mergeAnalyses(results) : results[0];
  runHooks('proposals', an, em, b); // email rules and learned corrections adjust the proposals
  // local verification + flags
  const flags = [];
  b.atts.forEach((a, i) => {
    const r = a.res || {}; const key = 'A' + (i + 1);
    if (!a.include && r.status === 'missing') flags.push({ kind: 'missing_attachment', detail: `“${a.name}” was too large to download through Gmail and was not added, so it was not read.`, source: key, local: true });
    else if (!a.include && r.status && !['skipped', 'container'].includes(r.status)) flags.push({ kind: ['unreadable', 'unsupported'].includes(r.status) ? 'unreadable' : 'excluded', detail: r.note || 'Not sent for analysis.', source: key, local: true });
    else if (!a.include && !r.status) flags.push({ kind: 'excluded', detail: 'Not sent for analysis.', source: key, local: true });
    else if (a.include && r.note && /cannot be read|not prepared|Only the first/.test(r.note)) flags.push({ kind: 'truncated', detail: r.note, source: key, local: true });
  });
  (b.warnings || []).forEach(w => flags.push({ kind: /attachment/i.test(w) ? 'missing_attachment' : 'unreadable', detail: w, source: '', local: true }));
  truncations.forEach(t => flags.push({ kind: 'truncated', detail: `Only about ${t.pct}% of this source fit in one analysis${t.where ? ` (cut at ${t.where})` : ''}. Requirements after that point were not checked.`, source: t.key, local: true }));
  if (imgDropped.length) flags.push({ kind: 'images', detail: `Image limit reached; not sent: ${imgDropped.slice(0, 6).join('; ')}${imgDropped.length > 6 ? '…' : ''}.`, source: '', local: true });
  const all = [...flags, ...an.flags];
  const allTasks = [...St.tasks.values()];
  const seen = new Set();
  an.tasks.forEach(p => {
    p.evidence = E.verifyEvidence(p.evidence, sources);
    let dup = null;
    if (p.matchesTaskId && St.tasks.has(p.matchesTaskId)) dup = { task: St.tasks.get(p.matchesTaskId), score: 0.9 };
    else dup = E.findDuplicate(p, allTasks, tk);
    if (dup && !seen.has(dup.task.id)) { p.dupOf = dup.task.id; p.dupScore = dup.score; p.merge = true; seen.add(dup.task.id); }
    const verified = p.evidence.some(x => ['verified', 'visual', 'partial'].includes(x.check));
    p.accept = p.ownership !== 'fyi' && p.confidence >= 0.5 && (verified || p.evidence.length === 0 ? true : p.confidence >= 0.75);
  });
  an.updates.forEach(u => { u.evidence = E.verifyEvidence(u.evidence, sources); u.accept = St.tasks.has(u.taskId); });
  an.updates = an.updates.filter(u => St.tasks.has(u.taskId));
  an.flags = all; an.keyMap = keyMap; an.analyzedAt = nowISO(); an.tier = tier; if (readBy) an.readBy = readBy; an.imagesSent = images.length; an.masked = !!s.mask;
  // email record
  const id = b.recordId || E.uid('e');
  const rec = {
    id, threadKey: tk, subject: b.source === 'docs' ? 'Documents: ' + b.atts.map(a => a.name).slice(0, 3).join(', ') + (b.atts.length > 3 ? ` +${b.atts.length - 3}` : '') : (em.subject || ''), from: em.from || '', fromEmail: em.fromEmail || '', to: em.to || '', cc: em.cc || '', date: em.date || '',
    messageId: em.messageId || '', convIndex: em.convIndex || '', inReplyTo: E.clip(em.inReplyTo || '', 300), references: E.clip(em.references || '', 2000), gmailThread: b.gmailThread || '', source: b.source, fileName: b.fileName || '', importedAt: b.importedAt || nowISO(),
    snippet: E.clip((em.body || '').replace(/\s+/g, ' '), 280), quoted: E.quotedHistory(em.body || ''),
    attachments: b.atts.map(a => ({ name: a.name, kindLabel: (a.res && a.res.kindLabel) || 'File', size: a.size || 0, status: a.include ? ((a.res && a.res.status) || 'unknown') : 'excluded', note: (a.res && a.res.note) || '', pages: (a.res && a.res.pages) || null, images: (a.res && a.res.images && a.include) ? a.res.images.length : 0, textLen: (a.res && a.res.text || '').length })),
    analysis: an, reviewState: 'pending', hasText: !!s.storeText, fromMe,
    gmailId: b.gmailId || '', gmailUrl: b.gmailUrl || '', forwardedBy: em.forwardedBy || '', forwardMode: em.forwardMode || '',
  };
  if (s.storeText) await saveTexts(id, em.body || '', b.atts.map(a => ({ name: a.name, include: a.include, status: a.res && a.res.status, kindLabel: a.res && a.res.kindLabel, note: a.res && a.res.note, text: (a.res && a.res.text) || '' })));
  // a clear outcome is applied at once (Undo in the message): my own email that completes or partly does a task, or any
  // email that Claude is sure closes one; everything else waits in Review
  const sure = an.updates.filter(u => u.accept && St.tasks.has(u.taskId) && (s.autoClose !== false) && ((fromMe && ['fulfilled', 'partial'].includes(u.verdict)) || (u.verdict === 'fulfilled' && (u.confidence || 0) >= 0.85 && u.evidence.some(x => ['verified', 'partial'].includes(x.check)))));
  if (sure.length) {
    const ch = { tasks: {} }, now = nowISO();
    for (const u of sure) { ch.tasks[u.taskId] = applyTaskUpdate(ch.tasks[u.taskId] || St.tasks.get(u.taskId), u, rec, now); u.applied = true; }
    cvApply(ch);
    const refs = sure.map(u => St.tasks.get(u.taskId)).filter(Boolean).map(t => t.ref).join(', ');
    toast(`${fromMe ? 'Your email' : 'This email'} ${sure.every(u => u.verdict === 'fulfilled') ? 'completes' : 'moves on'} ${refs} — updated.`, { action: 'Undo', fn: () => { cvUndo(); const r = clone(St.emails.get(id) || rec); (r.analysis.updates || []).forEach(x => { if (sure.some(y => y.uid === x.uid)) x.applied = false; }); r.reviewState = 'pending'; putEmail(r); render(); } });
    if (!an.tasks.some(p => p.accept) && an.updates.every(u => u.applied || !u.accept)) { rec.reviewState = 'reviewed'; rec.reviewedAt = now; }
  }
  putEmail(rec);
  runHooks('emailStored', rec, b); // feature files keep the original email and its attachments
  // several emails forwarded in one message share its Gmail id ("id:n" for the extra ones)
  if (b.gmailId) { markSeen(b.gmailId, id); labelImported(b.gmailId.split(':')[0]); }
  return rec;
}
/* Long emails: every source is cut into pieces that fit one request (at page / sheet / row boundaries where
   possible) and the pieces are packed into parts. Each part repeats the start of the email body so Claude knows
   who asks what; images go with the first part. At most 15 parts; anything beyond is flagged as truncated. */
const MAX_PARTS = 15;
function splitLongEmail(input, budget) {
  const U = E.utf8len;
  const bodyText = input.email.body || '';
  const ctxChars = Math.min(bodyText.length, 6000);
  const emptyAtts = input.attachments.map(a => ({ ...a, text: '' }));
  const base = U(E.buildPrompt({ ...input, email: { ...input.email, body: bodyText.slice(0, ctxChars) }, attachments: emptyAtts, notes: (input.notes || '') + ' '.repeat(900) }).prompt);
  const cap = Math.max(20000, budget - base - 2000);
  // sources are poured into parts in order; a long source continues in the next part where the last one ended
  const parts = []; let cur = [], size = 0;
  const sources = [{ key: 'BODY', text: bodyText }].concat(input.attachments.filter(a => a.text && a.status !== 'excluded').map(a => ({ key: a.key, text: a.text })));
  for (const src of sources) {   // the body belongs to the first part; later parts repeat its start as context
    const text = src.text, ratio = text.length / Math.max(1, U(text)); let at = 0, n = 0; const mine = [];
    while (at < text.length || !n) {
      let space = cap - size - 200;
      if (space < 20000 && cur.length) { parts.push(cur); cur = []; size = 0; space = cap - 200; }
      let end = Math.min(text.length, at + Math.max(1000, Math.floor(space * ratio)));
      if (end < text.length) {
        const win = text.slice(at, end), min = (end - at) * 0.5;
        const mk = Math.max(win.lastIndexOf('\n[Page '), win.lastIndexOf('\n[Sheet: '), win.lastIndexOf('\n[Slide '));
        const nl = win.lastIndexOf('\n');
        if (mk > min) end = at + mk; else if (nl > min) end = at + nl;
      }
      const piece = { key: src.key, text: text.slice(at, end), n: ++n };
      cur.push(piece); mine.push(piece); size += U(piece.text) + 200; at = end;
      if (at >= text.length) break;
    }
    if (mine.length > 1) mine.forEach(p => { p.of = mine.length; });
  }
  if (cur.length) parts.push(cur);
  const dropped = [];
  if (parts.length > MAX_PARTS) {
    for (const p of parts.slice(MAX_PARTS).flat()) if (!dropped.some(d => d.key === p.key)) dropped.push({ key: p.key, pct: 0, where: 'the end of the file (too long even for ' + MAX_PARTS + ' parts)' });
    parts.length = MAX_PARTS;
  }
  const n = parts.length;
  const out = parts.map((ps, i) => {
    const has = k => ps.filter(p => p.key === k);
    const bp = has('BODY');
    const body = bp.length ? bp.map(p => p.text).join('\n') + (bp[0].of ? `\n[Email body, piece ${bp.map(p => p.n).join(', ')} of ${bp[0].of}]` : '')
      : '[Start of the email body, repeated for context — its own requests are read in another part]\n' + bodyText.slice(0, ctxChars) + (bodyText.length > ctxChars ? '\n[…]' : '');
    const attachments = input.attachments.map(a => {
      const ap = has(a.key);
      if (ap.length) return { ...a, text: ap.map(p => p.text).join('\n') + (ap[0].of ? `\n[${a.key}: piece ${ap.map(p => p.n).join(', ')} of ${ap[0].of}]` : '') };
      return a.text && a.status !== 'excluded' ? { ...a, text: '', note: [a.note, 'read in another part of this email'].filter(Boolean).join('; ') } : a;
    });
    const notes = (input.notes ? input.notes + '\n' : '') + `LONG EMAIL: it is too long for one request, so it is read in ${n} parts and the results are combined. This is part ${i + 1} of ${n}. Extract the obligations found in the content of THIS part (the start of the email body is repeated for context — do not repeat its tasks unless they are in this part). Do not flag content as missing or truncated because it is in another part. When a list of comments or items continues across parts, keep the same task title so the parts can be joined.`;
    return { prompt: E.buildPrompt({ ...input, email: { ...input.email, body }, attachments, images: i === 0 ? input.images : [], notes, budget: budget + 100000 }).prompt, images: i === 0 };
  });
  out.dropped = dropped;
  return out;
}
// one result from all parts: the same task (same title, owner and project) found in two parts is joined
function mergeAnalyses(list) {
  const key = t => [t.ownership, (t.project || '').toLowerCase(), E.normMatch ? E.normMatch(t.title) : String(t.title).toLowerCase()].join('|');
  const words = t => new Set((E.normMatch ? E.normMatch(t.title) : String(t.title).toLowerCase()).split(' ').filter(w => w.length > 2));
  const same = (a, b) => { if (key(a) === key(b)) return true; if (a.ownership !== b.ownership) return false; const x = words(a), y = words(b); let c = 0; x.forEach(w => { if (y.has(w)) c++; }); return c / Math.max(1, Math.max(x.size, y.size)) >= 0.75; };
  const out = { ...list[0], tasks: [], updates: [], flags: [], decisions: [], documents: [] };
  for (const r of list) {
    for (const t of r.tasks || []) {
      const m = out.tasks.find(x => same(x, t));
      if (!m) { out.tasks.push({ ...t }); continue; }
      const seen = new Set((m.subtasks || []).map(x => (x.ref || '') + '|' + x.text));
      m.subtasks = [...(m.subtasks || []), ...(t.subtasks || []).filter(x => !seen.has((x.ref || '') + '|' + x.text))];
      m.evidence = [...(m.evidence || []), ...(t.evidence || [])].slice(0, 6);
      m.confidence = Math.max(m.confidence || 0, t.confidence || 0);
      if (!m.deadline && t.deadline) { m.deadline = t.deadline; m.deadlineText = t.deadlineText; m.deadlineBasis = t.deadlineBasis; }
      if (PRI_ORDER.indexOf(t.priority) < PRI_ORDER.indexOf(m.priority)) m.priority = t.priority;
    }
    out.updates.push(...(r.updates || [])); out.flags.push(...(r.flags || [])); out.decisions.push(...(r.decisions || []));
    for (const d of r.documents || []) if (!out.documents.some(x => x.number && x.number === d.number && x.revision === d.revision)) out.documents.push(d);
  }
  out.actionRequired = list.some(r => r.actionRequired !== false) || out.tasks.length > 0;
  if (out.actionRequired) out.noActionReason = null;
  out.summary = (list[0].summary || '') + ` (Long email: read in ${list.length} parts.)`;
  out.parts = list.length;
  return out;
}
const PRI_ORDER = ['critical', 'high', 'medium', 'low'];
async function saveTexts(id, body, atts) {
  let data = { body, atts };
  const size = () => E.utf8len(JSON.stringify(data));
  let trimmed = false;
  while (size() > 240000) {
    trimmed = true;
    let big = data.body.length > Math.max(0, ...data.atts.map(a => a.text.length)) ? -1 : data.atts.reduce((m, a, i) => a.text.length > data.atts[m].text.length ? i : m, 0);
    if (big === -1) data.body = data.body.slice(0, Math.floor(data.body.length * 0.6)) + '\n[…trimmed for storage]';
    else data.atts[big].text = data.atts[big].text.slice(0, Math.floor(data.atts[big].text.length * 0.6)) + '\n[…trimmed for storage]';
  }
  data.trimmed = trimmed; data.savedAt = nowISO();
  await putTexts(id, data);
}
async function reanalyze(eid) {
  const e = St.emails.get(eid); if (!e || !St.sample) return;
  const tx = await getTexts(eid);
  if (!tx) { toast('No saved text for this email. Import the original file again to re-analyse.', { err: true }); return; }
  const em = { subject: e.subject, from: e.from, fromEmail: e.fromEmail, to: e.to, cc: e.cc, date: e.date, messageId: e.messageId, convIndex: e.convIndex, body: tx.body || '' };
  const b = { id: E.uid('b'), source: e.source, fileName: e.fileName, email: em, recordId: e.id, importedAt: e.importedAt, fresh: true, warnings: [],
    atts: (tx.atts || []).map(a => ({ id: E.uid('a'), name: a.name, include: a.include !== false && !!a.text, res: { status: a.status || 'text', kindLabel: a.kindLabel || 'File', text: a.text || '', note: (a.note || '') + (['vision', 'mixed'].includes(a.status) ? ' (page images are not kept; re-import the file to include them)' : ''), images: [] } })) };
  // keep tasks from previous analysis out of the "related" list? they're real tasks; fine.
  const old = clone(e); old.reviewState = 'analyzing'; St.emails.set(eid, old); render();
  toast('Re-analysing from saved text…');
  try { await analyzeBundle(b, new AbortController().signal, () => {}); toast('Re-analysed. Check the Review page.', { action: 'Review', fn: () => go('review') }); }
  catch (err) { const back = clone(e); St.emails.set(eid, back); putEmail(back); toast(aiErrorText(err), { err: true }); }
  render(); if (UI.drawer && UI.drawer.kind === 'email') renderDrawer();
}

/* ---------- Gmail forwarding inbox (via the viewer's Gmail connector) ---------- */
const GMAIL = 'Gmail';
const GM_RAW_MAX = 4.5 * 1048576;
const GM_LABEL = 'Action Register/Imported';
const GM = { status: 'idle', error: '', lastChecked: null, newCount: 0, seen: null, autoDone: false, busy: false };
const gmDefaults = () => ({ address: DESKTOP ? DK.suggestedAddress() : 'msobeah12+tasks@gmail.com', days: 14, autoCheck: true, autoAnalyse: true, label: true, labelId: '' });
const gmCfg = () => Object.assign(gmDefaults(), St.settings.gmail || {});
const payloadOf = r => { let p = r && r.payload !== undefined ? r.payload : r; if (typeof p === 'string') { try { p = JSON.parse(p); } catch {} } return p || {}; };
function mcpErrorText(e) {
  const c = e && e.code;
  return ({
    needs_reauth: DESKTOP ? 'Gmail needs reconnecting: Setup › Connections › Connect Gmail.' : 'Gmail needs reconnecting: claude.ai Settings › Connectors › Gmail.',
    server_not_connected: DESKTOP ? 'Gmail is not connected. Connect it in Setup › Connections, then press Check now.' : 'Gmail is not connected to your Claude account. Add it in claude.ai Settings › Connectors, then press Check now.',
    selection_required: 'You have more than one Gmail connector. Choose one when Claude asks, then press Check now.',
    not_in_manifest: 'Gmail access was turned off or declined for this page. Allow it from the page’s permissions, then press Check now.',
    approval_required: 'Gmail access needs your approval. Press Check now and choose Allow.',
    consent_required: 'Gmail access needs your approval. Press Check now and choose Allow.',
    blocked_by_policy: 'Your organization’s policy blocks this Gmail action for you.',
    server_unavailable: 'Gmail did not answer. Try again in a minute.',
    tool_error: 'Gmail reported an error' + (e && e.message ? ': ' + E.clip(String(e.message), 160) : '.'),
    cancelled: 'Stopped.',
  })[c] || ('Gmail check failed' + (c ? ' (' + c + ')' : '') + '.');
}
const gmCall = (tool, input) => St.mcp.callTool(GMAIL, tool, input, { cache: false });
const SEEN_LS = 'action-register-gmail-seen-v1';
async function loadSeen() {
  if (GM.seen) return GM.seen;
  let ids = {};
  if (St.mode === 'db') { try { const d = await St.refs.seen.get(); if (d.exists) ids = clone(d.data().ids || {}); } catch {} }
  else { try { ids = JSON.parse(localStorage.getItem(SEEN_LS) || '{}'); } catch {} }
  GM.seen = ids; return ids;
}
function markSeen(id, what) {
  if (!id) return; GM.seen = GM.seen || {};
  GM.seen[id] = { at: nowISO(), r: what };
  const keys = Object.keys(GM.seen); if (keys.length > 3000) keys.sort((a, b) => (GM.seen[a].at || '').localeCompare(GM.seen[b].at || '')).slice(0, keys.length - 3000).forEach(k => delete GM.seen[k]);
  if (St.mode === 'db') writeDoc(St.refs.seen, { ids: GM.seen }); else { try { localStorage.setItem(SEEN_LS, JSON.stringify(GM.seen)); } catch {} }
}
async function ensureLabel() {
  const g = gmCfg(); if (!g.label) return '';
  if (g.labelId) return g.labelId;
  try {
    const labels = payloadOf(await gmCall('list_labels', {})).labels || [];
    let l = labels.find(x => (x.name || x.displayName) === GM_LABEL);
    if (!l) l = payloadOf(await gmCall('create_label', { displayName: GM_LABEL, labelListVisibility: 'LABEL_SHOW' }));
    const id = l && (l.id || l.labelId); if (!id) return '';
    const s = clone(St.settings); s.gmail = { ...gmCfg(), labelId: id }; putSettings(s);
    return id;
  } catch { return ''; }
}
const LABELED = new Set();
async function labelImported(msgId) {
  if (!msgId || !gmCfg().label || !St.mcp || LABELED.has(msgId)) return; LABELED.add(msgId);
  try { const id = await ensureLabel(); if (id) await gmCall('label_message', { messageId: msgId, labelIds: [id] }); }
  catch (e) { if (e && e.code === 'not_in_manifest') return; }
}
// a +tasks address is only ever used for forwards, so a message Gmail delivered to it counts even when the
// address was in Bcc (and so is not in the recipient list); a plain address must appear in To / Cc / Bcc
const hasAddr = (m, addr) => [...(m.toRecipients || []), ...(m.ccRecipients || []), ...(m.bccRecipients || [])].some(r => String(r).toLowerCase().includes(addr)) || (/\+/.test(addr.split('@')[0]) && !(m.labelIds || []).includes('SENT') && !(m.labelIds || []).includes('DRAFT'));
function gmQuery(g) {
  const a = g.address.trim();
  const parts = [`{to:${a} cc:${a} bcc:${a} deliveredto:${a}}`, `newer_than:${Math.max(1, Math.min(365, +g.days || 14))}d`];
  if (g.label) parts.push('-label:' + GM_LABEL.toLowerCase().replace(/[\s/]+/g, '-'));
  return parts.join(' ');
}
async function checkGmail(manual) {
  const g = gmCfg();
  if (!St.mcp) { if (manual) toast(DESKTOP ? 'Gmail is not connected. Connect it in Setup › Connections.' : 'Gmail access is not available in this view. Open the page inside Claude while signed in.', { err: true }); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g.address.trim())) { if (manual) toast('Enter your forwarding address first.', { err: true }); return; }
  if (GM.busy) return;
  GM.busy = true; GM.status = 'checking'; GM.error = ''; render();
  let added = 0;
  try {
    const seen = await loadSeen();
    const addr = g.address.trim().toLowerCase();
    const res = payloadOf(await gmCall('search_threads', { query: gmQuery(g), pageSize: 25, view: 'THREAD_VIEW_METADATA_ONLY' }));
    const cands = [];
    for (const th of res.threads || []) {
      let msgs = th.messages || [];
      if ((th.messageCount || msgs.length) > msgs.length) { try { msgs = payloadOf(await gmCall('get_thread', { threadId: th.id, messageFormat: 'METADATA_ONLY' })).messages || msgs; } catch {} }
      for (const m of msgs) {
        if (!m.id || seen[m.id] || UI.staging.some(b => b.gmailId === m.id)) continue;
        if (!hasAddr(m, addr)) continue;
        cands.push(Object.assign(m, { _thread: th.id }));
      }
    }
    cands.sort((a, b) => (a.internalDate || a.date || '').localeCompare(b.internalDate || b.date || ''));
    for (const m of cands.slice(0, 15)) {
      GM.status = 'checking'; GM.error = `Downloading ${added + 1} of ${Math.min(cands.length, 15)}…`; render();
      let b, more = [];
      try {
        // Gmail's connector cannot send a whole message much over 4 MB (big drawings and PDFs): those come as text
        // with each attachment listed, to be added by hand
        if ((+m.sizeEstimate || 0) > GM_RAW_MAX) throw { code: 'too_large', message: 'too large' };
        const raw = payloadOf(await gmCall('get_message', { messageId: m.id, messageFormat: 'RAW' })).raw;
        if (!raw) throw { code: 'tool_error', message: 'empty message' };
        const rawBytes = E.b64urlToBytes(raw);
        const ems = E.splitForwards(E.parseEml(rawBytes));
        b = await bundleFromEmail(ems[0], 'gmail', 'Forwarded · Gmail');
        b.original = { bytes: rawBytes, kind: 'eml', name: (ems[0].subject || 'email') + '.eml' };
        for (const x of ems.slice(1)) { const bx = await bundleFromEmail(x, 'gmail', 'Forwarded · Gmail (one of several)'); bx.gmailId = m.id + ':' + more.length; bx.gmailUrl = m.viewUrl || ''; more.push(bx); }
      } catch (e) {
        if (e && ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'approval_required', 'consent_required', 'blocked_by_policy', 'selection_required'].includes(e.code)) throw e;
        // fallback: text only
        try {
          const pm = payloadOf(await gmCall('get_message', { messageId: m.id, messageFormat: 'PLAIN_TEXT' }));
          const em = E.unwrapForward({ subject: pm.subject || '', from: pm.sender || '', fromEmail: E.firstEmail(pm.sender || ''), to: (pm.toRecipients || []).join('; '), cc: (pm.ccRecipients || []).join('; '), date: pm.date || '', messageId: '', inReplyTo: '', references: '', convIndex: '', body: E.tidyText(pm.plaintextBody || pm.snippet || ''), attachments: [], warnings: [] });
          b = await bundleFromEmail(em, 'gmail', 'Forwarded · Gmail (text + attachment list)');
          const list = (pm.attachments || []).filter(a => (a.filename || a.name) && !/^image\d{3}\.(png|jpe?g|gif)$/i.test(a.filename || a.name));
          for (const x of list) b.atts.push(mkAtt({ name: x.filename || x.name, mime: x.mimeType || '', size: +x.size || 0, missing: true }));
          const mb = m.sizeEstimate ? ` (${(m.sizeEstimate / 1048576).toFixed(1)} MB)` : '';
          b.warnings.push(list.length ? `This email is larger than Gmail lets the app download${mb}, so its text was read but its ${list.length === 1 ? 'attachment' : list.length + ' attachments'} must be added by hand: press “Add file” next to each (Open in Gmail to download it), or analyse the text only.` : `The full message could not be downloaded${mb}; its text was read.`);
        } catch { continue; }
      }
      b.gmailId = m.id; b.gmailUrl = m.viewUrl || ''; b.gmailThread = m._thread || '';
      for (const x of [b, ...more]) { UI.staging.push(x); checkDuplicateEmail(x); added++; }
    }
    GM.status = 'idle'; GM.error = ''; GM.lastChecked = nowISO(); GM.newCount = added;
    if (manual || added) toast(added ? `${added} forwarded email${added > 1 ? 's' : ''} downloaded from Gmail.` : 'No new forwarded emails.', added ? { action: 'Show', fn: () => go('import') } : {});
  } catch (e) {
    GM.status = 'error'; GM.error = mcpErrorText(e);
    if (manual) toast(GM.error, { err: true });
  } finally { GM.busy = false; render(); }
  if (added) {
    await extractPending();
    if (gmCfg().autoAnalyse && St.sample && !UI.analyzing) runAnalysis({ auto: true });
  }
  return added;
}
function fwdAddrHTML() {
  const g = gmCfg(); if (!g.address) return '';
  return `<div class="fwd-addr"><div style="min-width:0"><div class="label">Send or forward emails to</div><div class="addr mono" id="fwd-addr-text">${esc(g.address)}</div></div><button class="btn primary" data-act="copy-addr" data-addr="${esc(g.address)}">Copy address</button></div>`;
}
function gmailCardHTML() {
  const g = gmCfg(); const available = !!St.mcp;
  return `<section class="card pad" style="display:grid;gap:12px">
    <div class="row"><div class="section-title"><h2>Forwarding inbox</h2></div>${GM.status === 'error' ? '<span class="chip crit">Needs attention</span>' : GM.busy ? '<span class="chip accent">Checking…</span>' : ''}<span class="spacer"></span>
      ${available && g.address ? `<button class="btn sm" data-act="gmail-check" ${GM.busy ? 'disabled' : ''}>${GM.busy ? 'Checking…' : 'Check now'}</button>` : ''}</div>
    ${g.address ? fwdAddrHTML() : callout('warn', `<p>No forwarding address yet. <button class="btn sm" data-act="nav" data-view="setup">Set it in Setup</button></p>`)}
    <p class="small muted" style="margin:0">Forward work emails here from Outlook — <b>Forward as Attachment</b> keeps the original sender, date and attachments exactly. Anything you type above the forwarded message is treated as your own note.${g.autoCheck ? ` New forwards are picked up when you open this page${g.autoAnalyse ? ' and analysed automatically' : ''}.` : ''}${GM.lastChecked ? ` Last checked ${esc(new Date(GM.lastChecked).toTimeString().slice(0, 5))}.` : ''}</p>
    ${!available && St.capsResolved ? callout('warn', DESKTOP ? '<p>Gmail is not connected yet. <button class="btn sm" data-act="nav" data-view="setup">Connect it in Setup</button> — or skip it and add saved .msg / .eml files below.</p>' : '<p>Gmail access is not available in this view. Open the page inside Claude while signed in, with Gmail connected in claude.ai Settings › Connectors.</p>') : ''}
    ${GM.status === 'error' ? callout('crit', `<p>${esc(GM.error)}</p>`) : GM.busy && GM.error ? `<div class="small muted">${esc(GM.error)}</div>` : ''}
  </section>`;
}
function saveGmailForm() {
  const s = clone(St.settings); const v = id => $('#' + id);
  const addr = (v('gm-addr').value || '').trim().toLowerCase();
  if (addr && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { toast('That forwarding address doesn’t look like an email address.', { err: true }); return false; }
  s.gmail = { ...gmCfg(), address: addr, days: +v('gm-days').value || 14, autoCheck: v('gm-auto').checked, autoAnalyse: v('gm-analyse').checked, label: v('gm-label').checked };
  putSettings(s); return true;
}

/* ---------- EMAILS view ---------- */
function viewEmails() {
  const q = E.normMatch(UI.emailQ);
  let list = [...St.emails.values()].sort((a, b) => (b.date || b.importedAt || '').localeCompare(a.date || a.importedAt || ''));
  if (q) list = list.filter(e => E.normMatch([e.subject, e.from, e.to, e.snippet, (e.attachments || []).map(a => a.name).join(' '), e.analysis && e.analysis.summary].join(' ')).includes(q));
  const st = e => ({ pending: '<span class="chip accent">To review</span>', reviewed: '<span class="chip ok">Reviewed</span>', dismissed: '<span class="chip">Discarded</span>', analyzing: '<span class="chip">Analysing…</span>' })[e.reviewState] || '';
  return `<div class="wrap">
    <div class="page-head"><div><h1>Emails</h1><div class="sub">Every analysed email, with what was read from each attachment.</div></div></div>
    <div class="toolbar"><label class="search">${I.search}<span class="sr">Search emails</span><input class="input" id="eq" type="search" placeholder="Search subject, sender, attachment…" value="${esc(UI.emailQ)}" data-inp="emailQ"></label></div>
    <div class="register">${list.length ? list.map(e => {
      const nt = [...St.tasks.values()].filter(t => (t.emailIds || []).includes(e.id)).length;
      const flags = (e.analysis && e.analysis.flags || []).length;
      return `<div class="erow" data-act="open-email" data-id="${esc(e.id)}" role="button" tabindex="0"><time>${esc(fmtDate(e.date || e.importedAt, { day: 'numeric', month: 'short', year: '2-digit' }))}</time>
        <div style="min-width:0"><div class="s" dir="auto">${esc(e.subject || '(no subject)')}</div><div class="f" dir="auto">${esc(e.from || '')}${(e.attachments || []).length ? ` · ${e.attachments.length} attachment${e.attachments.length > 1 ? 's' : ''}` : ''}${nt ? ` · ${nt} task${nt > 1 ? 's' : ''}` : ''}</div></div>
        <div class="tside">${st(e)}${flags ? `<span class="chip warn">${flags} flag${flags > 1 ? 's' : ''}</span>` : ''}</div></div>`;
    }).join('') : `<div class="empty"><h3>${q ? 'No match' : 'No emails yet'}</h3><p>${q ? 'Try another search.' : 'Emails you analyse are listed here.'}</p></div>`}</div>
  </div>`;
}
const textsCache = new Map();
async function loadEmailTexts(id) {
  if (textsCache.has(id)) return;
  textsCache.set(id, 'loading');
  const tx = await getTexts(id);
  textsCache.set(id, tx || null);
  if (UI.drawer && UI.drawer.kind === 'email' && UI.drawer.id === id) { const el = $('#drawer'); const e = St.emails.get(id); if (e) { const sc = el.querySelector('.drawer-b')?.scrollTop; el.innerHTML = deco(emailDrawerHTML(e)); const b = el.querySelector('.drawer-b'); if (b && sc) b.scrollTop = sc; } }
}
function emailDrawerHTML(e) {
  const a = e.analysis || {};
  const tx = textsCache.get(e.id);
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).includes(e.id));
  const attText = name => tx && tx !== 'loading' ? ((tx.atts || []).find(x => x.name === name) || {}).text : null;
  return `<div class="drawer-h"><span class="label">Email</span><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b">
    <div style="display:grid;gap:4px"><h2 style="font-size:20px" dir="auto">${esc(e.subject || '(no subject)')}</h2>
      <dl class="kv">${e.from ? `<dt>From</dt><dd dir="auto">${esc(e.from)}</dd>` : ''}${e.to ? `<dt>To</dt><dd dir="auto">${esc(e.to)}</dd>` : ''}${e.cc ? `<dt>Cc</dt><dd dir="auto">${esc(e.cc)}</dd>` : ''}<dt>Sent</dt><dd>${esc(fmtDateTime(e.date) || 'unknown')}</dd><dt>Imported</dt><dd>${esc(fmtDateTime(e.importedAt))}${e.fileName ? ' · ' + esc(e.fileName) : ''}</dd>${a.readBy && typeof aiName === 'function' ? `<dt>Read by</dt><dd>${esc(aiName(a.readBy))}${a.readBy.fallback ? ` <span class="small muted">(${esc(aiByTitle(a.readBy))})</span>` : ''}</dd>` : ''}${e.forwardedBy ? `<dt>Forwarded by</dt><dd dir="auto">${esc(e.forwardedBy)}${e.forwardMode === 'inline' ? ' <span class="small muted">(original header read from the forwarded text)</span>' : ''}</dd>` : ''}</dl><div class="row">${/^https:\/\/mail\.google\.com\//.test(e.gmailUrl || '') ? `<a class="btn ghost sm" href="${esc(e.gmailUrl)}" target="_blank" rel="noopener">${I.mail} Open in Gmail</a>` : ''}${typeof openMail === 'function' && (DESKTOP || e.original) ? `<button class="btn ghost sm" data-act="email-file-open" data-id="${esc(e.id)}">✉ Open in Outlook</button>` : ''}${tasks.length && typeof openFiling === 'function' ? `<button class="btn ghost sm" data-act="file-email" data-id="${esc(e.id)}">📁 ${e.filed ? 'Filed on the server' : 'Save to company server…'}</button>` : ''}${typeof threadBtn === 'function' ? threadBtn(e) : ''}</div></div>
    ${emailActionsHTML(e)}
    ${a.summary ? `<div><div class="label" style="margin-bottom:4px">Summary</div><p style="margin:0" dir="auto">${esc(a.summary)}</p>${a.actionRequired === false ? `<p class="small" style="margin:6px 0 0"><span class="chip ok">No action for you</span> ${esc(a.noActionReason || '')}</p>` : ''}</div>` : ''}
    ${(a.flags || []).length ? callout('warn', `<ul style="margin:0">${a.flags.map(f => `<li><b>${esc(FLAG[f.kind] || f.kind)}</b>${f.source ? ` <span class="mono">(${esc(srcName(e, f.source))})</span>` : ''}: ${esc(f.detail)}</li>`).join('')}</ul>`) : ''}
    ${typeof threadHistHTML === 'function' ? threadHistHTML(e, { open: true }) : ''}
    ${tasks.length ? `<div><div class="label" style="margin-bottom:6px">Tasks from this email</div><div class="register">${tasks.map(taskRow).join('')}</div></div>` : ''}
    <div><div class="label" style="margin-bottom:6px">Attachments</div>${(e.attachments || []).length ? `<div class="register">${e.attachments.map((x, i) => {
      const st = ATT_STATUS[x.status] || [x.status, ''];
      const t = attText(x.name); const pk = `em:${e.id}:${i}`;
      return `<div class="att"><span>${I.file}</span><div style="min-width:0"><div class="name" dir="auto">${esc(x.name)}</div><div class="note">${esc([x.kindLabel, x.pages ? x.pages + ' p.' : '', x.images ? x.images + ' image(s) sent' : '', x.size ? fmtBytes(x.size) : ''].filter(Boolean).join(' · '))}${x.note ? ' — ' + esc(x.note) : ''}</div></div>
        <div class="att-side"><span class="chip ${st[1]}">${esc(st[0])}</span>${x.fileId ? `<button class="btn ghost sm" data-act="att-open" data-id="${esc(x.fileId)}" data-name="${esc(x.name.split(' › ').pop())}">Open</button>` : ''}${t ? `<button class="btn ghost sm" data-act="preview" data-key="${esc(pk)}">${UI.previews.has(pk) ? 'Hide' : 'Text'}</button>` : ''}</div>
        ${t && UI.previews.has(pk) ? `<div class="preview">${esc(E.clip(t, 30000))}</div>` : ''}</div>`;
    }).join('')}</div>` : '<p class="muted small">None.</p>'}</div>
    <div><div class="label" style="margin-bottom:6px">Email text</div>${tx === 'loading' || tx === undefined ? '<p class="muted small">Loading…</p>' : tx ? `<div class="bodytext" dir="auto">${esc(tx.body || '(empty)')}</div>${tx.trimmed ? '<p class="small muted">Long content was trimmed for storage.</p>' : ''}` : `<p class="muted small">${e.hasText ? 'Saved text not found.' : 'Text was not kept (Setup › Privacy).'} Preview: ${esc(e.snippet || '')}</p>`}</div>
    <div class="row">
      ${e.reviewState === 'pending' ? `<button class="btn primary" data-act="goto-review" data-id="${esc(e.id)}">Review tasks</button>` : ''}
      <button class="btn" data-act="reanalyze" data-id="${esc(e.id)}" ${St.sample && e.hasText ? '' : 'disabled'}>Re-analyse</button>
      <span class="spacer"></span>
      ${UI.confirm === 'dele-' + e.id ? `<span class="small">Delete this email record? Tasks stay.</span><button class="btn sm danger" data-act="delete-email" data-id="${esc(e.id)}">Delete</button><button class="btn sm" data-act="cancel-confirm">Keep</button>` : `<button class="btn ghost sm danger" data-act="ask-delete-email" data-id="${esc(e.id)}">${I.trash} Delete record</button>`}
    </div>
  </div>`;
}

/* ---------- SETUP view ---------- */
function viewSetup() {
  const s = St.settings, me = s.me;
  const projText = s.projects.map(p => [p.code, p.name, p.aliases].map(x => x || '').join(' | ').replace(/( \| )+$/, '')).join('\n');
  const lim = St.limits;
  return `<div class="wrap settings">
    <div class="page-head"><div><h1>Setup</h1><div class="sub">How the assistant identifies your work, and where your data lives.</div></div></div>
    ${DESKTOP ? DK.setupHTML() : ''}
    <section class="card pad" id="set-you" data-sec="You and projects"><div class="section-title"><h2>You</h2></div>
      <div class="grid2">
        <label class="field"><span>Name</span><input class="input" id="s-name" value="${esc(me.name || '')}" placeholder="${esc(St.profileName || 'Your name')}"></label>
        <label class="field"><span>Work email address(es), comma-separated</span><input class="input" id="s-emails" value="${esc(me.emails.join(', '))}"></label>
        <label class="field"><span>Other names people use (initials, nickname, Arabic spelling)</span><input class="input" id="s-aliases" value="${esc(me.aliases)}" dir="auto"></label>
        <label class="field"><span>Role</span><input class="input" id="s-role" value="${esc(me.role)}"></label>
        <label class="field"><span>Company / team</span><input class="input" id="s-org" value="${esc(me.org)}"></label>
        <label class="field"><span>What you are responsible for</span><input class="input" id="s-scope" value="${esc(me.scope)}" placeholder="e.g. pumps, blowers, valves, piping, mechanical submittals"></label>
        <label class="field"><span>Your manager (tasks they request are tagged in Daily)</span><input class="input" id="s-manager" value="${esc(me.manager || '')}" placeholder="e.g. Eng. Khaled Mansour" dir="auto"></label>
      </div>
      <label class="field"><span>Projects — one per line: CODE | Name | other names</span><textarea class="input" id="s-projects" rows="4" placeholder="ELM | El Mahsama WWTP Expansion | Mahsama, EM-WWTP" dir="auto">${esc(projText)}</textarea></label>
      <div class="row end"><button class="btn primary" data-act="save-setup">Save</button></div>
    </section>
    <section class="card pad" id="set-inbox" data-sec="Forwarding inbox"><div class="section-title"><h2>Forwarding inbox</h2></div>
      ${fwdAddrHTML()}
      <div class="grid2">
        <label class="field"><span>Forwarding address (in the Gmail account connected ${DESKTOP ? 'in Connections' : 'to Claude'})</span><input class="input" id="gm-addr" type="email" value="${esc(gmCfg().address)}" placeholder="yourname+tasks@gmail.com" autocomplete="off"></label>
        <label class="field"><span>Look back</span><select class="input" id="gm-days">${[3, 7, 14, 30, 60].map(d => `<option value="${d}" ${+gmCfg().days === d ? 'selected' : ''}>${d} days</option>`).join('')}</select></label>
        <label class="check"><input type="checkbox" id="gm-auto" ${gmCfg().autoCheck ? 'checked' : ''}><span>Check for new forwards when I open the page</span></label>
        <label class="check"><input type="checkbox" id="gm-analyse" ${gmCfg().autoAnalyse ? 'checked' : ''}><span>Analyse new forwards automatically<br><span class="small muted">Uses your Claude usage. Tasks still wait for your approval.</span></span></label>
        <label class="check"><input type="checkbox" id="gm-label" ${gmCfg().label ? 'checked' : ''}><span>Label imported messages in Gmail (“${esc(GM_LABEL)}”)</span></label>
      </div>
      <div class="row end"><button class="btn primary" data-act="gmail-save">Save</button></div>
      <details class="howto"><summary>How the forwarding address works</summary><ol>
        <li>Gmail delivers mail sent to <span class="mono">yourname+anything@gmail.com</span> to <span class="mono">yourname@gmail.com</span>. ${DESKTOP ? 'Use the Gmail account connected in Setup › Connections.' : 'Use the Gmail account connected to Claude (claude.ai Settings › Connectors).'}</li>
        <li>Optional: in Gmail search <span class="mono">to:(your forwarding address)</span> › Create filter › Skip the Inbox, so forwards stay out of your personal inbox.</li>
        <li>Check your company’s rules before forwarding work email to a personal mailbox. Automatic forwarding rules to outside addresses are often blocked by Microsoft 365; this works with forwards you send yourself.</li>
      </ol></details>
    </section>
    <section class="card pad" id="set-analysis" data-sec="Analysis"><div class="section-title"><h2>Analysis</h2></div>
      <div class="grid2">
        <label class="check"><input type="checkbox" id="o-vision" data-chg="opt" data-key="vision" ${s.vision ? 'checked' : ''}><span>Send images of scanned pages and photos<br><span class="small muted">Needed for scans, photos and marked-up prints.</span></span></label>
        <label class="check"><input type="checkbox" id="o-draw" data-chg="opt" data-key="drawings" ${s.drawings ? 'checked' : ''}><span>Send images of drawing sheets (A3 and larger)<br><span class="small muted">Lets Claude see revision clouds and the title block.</span></span></label>
        <label class="check"><input type="checkbox" id="s-mask" data-chg="opt" data-key="mask" ${s.mask ? 'checked' : ''}><span>Hide other people's email addresses and phone numbers<br><span class="small muted">Replaced with placeholders before sending; restored in results.</span></span></label>
        <label class="field"><span>Analysis depth</span><select class="input" id="o-tier" data-chg="opt" data-key="tier"><option value="auto" ${s.tier === 'auto' || !s.tier ? 'selected' : ''}>Smart — Claude picks the model for each email (saves tokens)</option><option value="complex" ${s.tier === 'complex' ? 'selected' : ''}>Always thorough (most tokens)</option><option value="default" ${s.tier === 'default' ? 'selected' : ''}>Always balanced</option></select></label>
      </div>
    </section>
    <!--SETUP-EXTRA-->
    <section class="card pad" id="set-privacy" data-sec="Privacy"><div class="section-title"><h2>Privacy</h2></div>
      <label class="check"><input type="checkbox" id="s-store" data-chg="opt" data-key="storeText" ${s.storeText ? 'checked' : ''}><span>Keep extracted email and attachment text<br><span class="small muted">Needed to view text later and to re-analyse. When off, only tasks, evidence quotes and summaries are kept.</span></span></label>
      <dl class="kv">
        <dt>Where data is kept</dt><dd>${DESKTOP ? 'On this computer only, in ' + esc(DK.dataDir()) + '. Export backups regularly.' : St.mode === 'db' ? 'Your Claude account, in a private area of this page that only you can read — not visible to people you share the page with.' : 'This browser only (cloud saving is unavailable in this view). Export backups regularly.'}</dd>
        <dt>What is sent to Claude</dt><dd>Only during analysis: the email text, the text read from attachments you leave ticked, and page images when image options are on.</dd>
        <dt>What never happens</dt><dd>${DESKTOP ? 'No access to your work mailbox. Only the personal Gmail you connect is read, and only messages sent to your forwarding address. Nothing is sent anywhere except Anthropic (analysis) and Gmail.' : 'No mailbox connection, no automatic reading of your inbox, nothing sent anywhere else.'}</dd>
        <dt>Image limit per email</dt><dd>${lim && lim.images ? lim.images.maxCount + ' images' : 'Images unavailable in this view'}</dd>
      </dl>
    </section>
    <section class="card pad" id="set-backup" data-sec="Backup"><div class="section-title"><h2>Backup and export</h2></div>
      <div class="row">
        <button class="btn" data-act="export-json">${I.download} Full backup (.json)</button>
        <button class="btn" data-act="export-csv">${I.download} Tasks for Excel (.csv)</button>
        <button class="btn" data-act="export-ics">${I.download} Deadlines for Outlook calendar (.ics)</button>
        <label class="btn ghost" for="import-json">Restore backup…</label><input id="import-json" type="file" accept=".json,.arbak,application/json" hidden data-chg="import-json">
      </div>${typeof backupExtraHTML === 'function' ? backupExtraHTML() : ''}
      <p class="small muted" style="margin:0">${St.tasks.size} tasks · ${St.emails.size} emails stored.</p>
    </section>
    <section class="card pad"><div class="section-title"><h2>Delete everything</h2></div>
      <div class="row">${UI.confirm === 'wipe' ? `<span>This removes all tasks, emails and saved text. Export a backup first if unsure.</span><button class="btn danger" data-act="wipe">Delete all data</button><button class="btn" data-act="cancel-confirm">Cancel</button>` : `<button class="btn ghost danger" data-act="ask-wipe">${I.trash} Delete all data…</button>`}</div>
    </section>
  </div>`;
}
function readSetupForm() {
  const v = id => ($('#' + id) || {}).value || '';
  const s = clone(St.settings);
  s.me = { ...s.me, name: v('s-name').trim(), emails: v('s-emails').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes('@')), aliases: v('s-aliases').trim(), role: v('s-role').trim(), org: v('s-org').trim(), scope: v('s-scope').trim(), manager: v('s-manager').trim() };
  s.projects = v('s-projects').split('\n').map(l => l.split('|').map(x => x.trim())).filter(p => p[0] || p[1]).map(p => ({ code: p[0] || '', name: p[1] || p[0] || '', aliases: p[2] || '' }));
  s.setupDone = !!s.me.name;
  return s;
}

/* ---------- exports ---------- */
async function offerFile(filename, data, mime) {
  if (St.downloads) {
    try { await St.downloads.save({ filename, data }); return; }
    catch (e) { if (e && e.code !== 'unavailable') { if (e.code === 'cancelled' || e.code === 'declined') return; } }
  }
  const text = typeof data === 'string' ? data : '';
  const m = $('#modal');
  m.innerHTML = `<div class="card"><div class="row"><b>${esc(filename)}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <div><p class="small muted" style="margin:0 0 8px">Saving files isn't available here. Copy the content and save it as <span class="mono">${esc(filename)}</span>.</p><textarea class="input" id="modal-text" readonly>${esc(text)}</textarea></div>
    <div class="row end"><button class="btn primary" data-act="copy-modal">Copy</button></div></div>`;
  m.hidden = false;
}
const stamp = () => E.todayISO();
function csvCell(v) { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function exportCSV() {
  const cols = ['Ref', 'Title', 'Status', 'Priority', 'Topic', 'Category', 'Items done', 'Open items', 'Whose action', 'Responsible', 'Project', 'Deadline', 'Deadline as written', 'Next step', 'Requirement', 'Requested by', 'Depends on', 'Source email', 'Email date', 'Evidence source', 'Location', 'Evidence quote', 'Notes', 'Created', 'Updated', 'Completed'];
  const rows = [...St.tasks.values()].sort((a, b) => (a.ref || '').localeCompare(b.ref || '')).map(t => { const e = (t.evidence || [])[0] || {}; return [t.ref, t.title, STATUS[t.status], PRIO[t.priority], topicOf(t), E.DISCIPLINES[t.discipline] || '', subsOf(t).length ? `${subsDone(t)}/${subsOf(t).length}` : '', subsOf(t).filter(x => !x.done).map(x => x.text).join(' | '), OWNERSHIP[t.ownership] || '', t.owner, t.project, t.deadline || '', t.deadlineText, t.nextStep, t.action, t.requestedBy, t.dependsOn, t.sourceSubject, (t.sourceDate || '').slice(0, 10), e.sourceName || '', e.location || '', e.quote || '', t.notes, (t.createdAt || '').slice(0, 10), (t.updatedAt || '').slice(0, 10), (t.completedAt || '').slice(0, 10)]; });
  offerFile(`action-register-tasks-${stamp()}.csv`, '\ufeff' + [cols, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'));
}
function exportICS() {
  const open = [...St.tasks.values()].filter(t => t.status !== 'done' && t.deadline);
  if (!open.length) { toast('No open tasks with deadlines to export.'); return; }
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = l => { const out = []; let s = l; while (s.length > 74) { out.push(s.slice(0, 74)); s = ' ' + s.slice(74); } out.push(s); return out.join('\r\n'); };
  const dt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = open.map(t => {
    const d = t.deadline.replace(/-/g, ''); const d2 = E.addDays(t.deadline, 1).replace(/-/g, '');
    return ['BEGIN:VEVENT', `UID:${t.id}@action-register`, `DTSTAMP:${dt}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${d2}`, `SUMMARY:${icsEsc(`${t.ref} Due: ${t.title}`)}`, `DESCRIPTION:${icsEsc([t.project ? 'Project: ' + t.project : '', t.ownership === 'waiting' ? 'Waiting on: ' + t.owner : '', t.nextStep ? 'Next step: ' + t.nextStep : '', t.sourceSubject ? 'Source: ' + t.sourceSubject : ''].filter(Boolean).join('\n'))}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].map(fold).join('\r\n');
  });
  offerFile(`action-register-deadlines-${stamp()}.ics`, ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Action Register//EN', 'CALSCALE:GREGORIAN', ...ev, 'END:VCALENDAR'].join('\r\n'));
}
async function backupData() {
  const emails = [...St.emails.values()];
  const texts = {};
  if (St.settings.storeText) for (const e of emails) { const t = await getTexts(e.id); if (t) texts[e.id] = t; }
  return { app: 'action-register', version: 1, exportedAt: nowISO(), settings: St.settings, tasks: [...St.tasks.values()], emails, texts, board: [...St.board.values()], daily: [...St.daily.values()], layout: St.layout, cols: Object.fromEntries(COLS.map(n => [n, colList(n)])) };
}
async function exportJSON() {
  offerFile(`action-register-backup-${stamp()}.json`, JSON.stringify(await backupData(), null, 1));
}
async function importJSON(file) {
  let d;
  try { d = JSON.parse(await file.text()); } catch { toast('Restore failed: invalid file', { err: true }); return; }
  // a password-protected backup is opened first (features/21-comfort.js)
  if (d && d.app === 'action-register-encrypted' && typeof openEncrypted === 'function') return openEncrypted(d);
  return importData(d);
}
async function importData(d) {
  try {
    if (d.app !== 'action-register') throw new Error('Not an Action Register backup.');
    let nt = 0, ne = 0;
    for (const t of d.tasks || []) { if (t && t.id) { St.tasks.set(t.id, t); if (St.mode === 'db') await writeDoc(St.refs.tasks.doc(t.id), t); nt++; } }
    for (const e of d.emails || []) { if (e && e.id) { St.emails.set(e.id, e); if (St.mode === 'db') await writeDoc(St.refs.emails.doc(e.id), e); ne++; } }
    for (const [id, t] of Object.entries(d.texts || {})) await putTexts(id, t);
    for (const b of d.board || []) if (b && b.id) putBoard(b);
    for (const x of d.daily || []) if (x && x.id) putDaily(x);
    for (const n of COLS) for (const x of (d.cols && d.cols[n]) || []) if (x && x.id) colPut(n, x);
    if (d.layout) putLayout(mergeLayout({ off: { ...(d.layout.off || {}), ...St.layout.off }, offv: { ...(d.layout.offv || {}), ...(St.layout.offv || {}) }, size: { ...(d.layout.size || {}), ...St.layout.size } }));
    if (d.settings && !St.settings.setupDone) putSettings(mergeSettings(d.settings));
    if (St.mode !== 'db') saveLocal();
    toast(`Restored ${nt} tasks and ${ne} emails.`); render();
  } catch (e) { toast('Restore failed: ' + (e.message || 'invalid file'), { err: true }); }
}
async function wipeAll() {
  const tids = [...St.tasks.keys()], eids = [...St.emails.keys()];
  for (const id of tids) delTask(id);
  for (const id of eids) delEmail(id);
  for (const id of [...St.board.keys()]) delBoard(id);
  for (const id of [...St.daily.keys()]) delDaily(id);
  for (const n of COLS) for (const id of [...St.cols[n].keys()]) colDel(n, id);
  putLayout(mergeLayout()); UI.cvUndo = []; UI.cvRedo = [];
  if (St.mode !== 'db') { try { localStorage.removeItem(LS_TEXT); } catch {} }
  UI.confirm = null; toast('All data deleted.'); render();
}

/* ---------- toasts ---------- */
function toast(msg, o = {}) {
  const box = $('#toasts'); while (box.children.length >= 2) box.firstElementChild.remove(); const t = document.createElement('div');
  t.className = 'toast' + (o.err ? ' err' : ''); t.setAttribute('role', o.err ? 'alert' : 'status');
  const span = document.createElement('span'); span.innerHTML = deco(esc(msg)); span.style.flex = '1'; t.append(span);
  if (o.action) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = o.action; b.onclick = () => { o.fn(); t.remove(); }; t.append(b); }
  box.append(t); setTimeout(() => t.remove(), o.err ? 9000 : o.action ? 7000 : 3800);
}

/* ---------- navigation ---------- */
const VIEWS = ['todo', 'daily', 'review', 'import', 'emails', 'setup'];
// view and drawer renderers; feature files add theirs (and push to VIEWS)
const VIEW_FN = { todo: () => viewTodo(), daily: () => viewDaily(), review: () => viewReview(), import: () => viewImport(), emails: () => viewEmails(), setup: () => viewSetup() };
const DRAWER_FN = {};
// buttons shown under the status row of the task panel; feature files push (t) => html
const TASK_ACTIONS = [];
// feature files add buttons/sections to the email panel (EMAIL_ACTIONS: e → html) and sections to Setup (SETUP_EXTRA: () → html)
const EMAIL_ACTIONS = [], SETUP_EXTRA = [];
function emailActionsHTML(e) { return EMAIL_ACTIONS.map(f => { try { return f(e) || ''; } catch { return ''; } }).join(''); }
function taskActionsHTML(t) { const parts = TASK_ACTIONS.map(f => { try { return f(t) || ''; } catch { return ''; } }).filter(Boolean); return parts.length ? `<div class="row task-actions">${parts.join('')}</div>` : ''; }
// feature hooks: beforeRender / afterRender (every full render), ready (data loaded), analysed (after a run), taskChanged (old, new)
const HOOKS = { beforeRender: [], afterRender: [], ready: [], analysed: [], taskChanged: [], deleted: [], proposals: [], approved: [], emailStored: [], elCreated: [] };
const runHooks = (k, ...a) => { for (const f of HOOKS[k]) { try { f(...a); } catch (e) { console.warn('hook ' + k, e); } } };
function go(view) { if (!VIEWS.includes(view) || St.mode === 'viewer') view = 'todo'; if (view === 'todo') setTimeout(maybeAutoCategorize, 400); UI.view = view; UI.confirm = null; closeDrawer(); render(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + view); } catch {} }

/* ---------- events ---------- */
const ACT = {
  nav: el => go(el.dataset.view),
  'open-task': el => openDrawer('task', el.dataset.id),
  'open-email': el => { UI.previews.clear(); openDrawer('email', el.dataset.id); },
  'goto-review': () => go('review'),
  'close-drawer': closeDrawer,
  'toggle-done': el => { const t = St.tasks.get(el.dataset.id); if (!t) return; const prev = setStatus(t.id, t.status === 'done' ? 'todo' : 'done'); render(); if (UI.drawer) renderDrawer(); if (prev && t.status !== 'done') toast(`🎉 ${t.ref} done — nice work.`, { action: 'Undo', fn: () => { setStatus(t.id, prev); render(); } }); },
  'set-status': el => { setStatus(el.dataset.id, el.dataset.status); render(); renderDrawer(); },
  'ask-delete-task': el => { UI.confirm = 'del-' + el.dataset.id; renderDrawer(); },
  'delete-task': el => { delTask(el.dataset.id); UI.confirm = null; closeDrawer(); render(); toast('Task deleted.'); },
  'cancel-confirm': () => { UI.confirm = null; render(); if (UI.drawer) renderDrawer(); },
  'new-task': () => {
    const t = makeTask({});
    putTask(t); render(); openDrawer('task', t.id); setTimeout(() => { const ta = $('#d-title'); if (ta) { ta.focus(); ta.select(); } }, 50);
  },
  'save-quick-setup': () => {
    const s = clone(St.settings); const v = id => ($('#' + id) || {}).value || '';
    s.me.name = v('su-name').trim(); s.me.emails = v('su-emails').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes('@')); s.me.role = v('su-role').trim(); s.me.org = v('su-org').trim();
    if (!s.me.name) { toast('Enter your name first.', { err: true }); return; }
    s.setupDone = true; putSettings(s); render(); toast('Saved.');
  },
  'save-setup': () => { const s = readSetupForm(); putSettings(s); render(); toast('Setup saved.'); },
  'toggle-paste': () => { UI.pasteOpen = !UI.pasteOpen; UI.pasteFiles = null; render(); if (UI.pasteOpen) setTimeout(() => $('#paste-text')?.focus(), 30); },
  'add-paste': async () => {
    const text = ($('#paste-text') || {}).value || '';
    if (!text.trim() && !(UI.pasteFiles && UI.pasteFiles.length)) { toast('Paste the email text first.', { err: true }); return; }
    const em = E.parsePasted(text);
    if (!em.subject) em.subject = E.clip((text.trim().split('\n')[0] || 'Pasted email').replace(/\s+/g, ' '), 90);
    const b = newBundle(em, 'paste', 'Pasted text');
    UI.staging.push(b); UI.pasteOpen = false;
    const files = UI.pasteFiles; UI.pasteFiles = null;
    if (files && files.length) await intakeFiles(files, b);
    checkDuplicateEmail(b); render(); extractPending();
  },
  preview: el => { const k = el.dataset.key; UI.previews.has(k) ? UI.previews.delete(k) : UI.previews.add(k); if (k.startsWith('em:')) renderDrawer(); else rerenderStaging(); },
  'remove-bundle': el => { const rb = UI.staging.find(b => b.id === el.dataset.id); if (rb && rb.gmailId && rb.state !== 'done') { markSeen(rb.gmailId, 'skipped'); toast('Removed. It won’t be downloaded from Gmail again.'); } UI.staging = UI.staging.filter(b => b.id !== el.dataset.id); render(); },
  'clear-staging': () => { UI.staging.forEach(b => { if (b.gmailId && b.state !== 'analyzing' && b.state !== 'done') markSeen(b.gmailId, 'skipped'); }); UI.staging = UI.staging.filter(b => b.state === 'analyzing'); render(); },
  'copy-addr': async el => {
    const addr = el.dataset.addr || '';
    try { await navigator.clipboard.writeText(addr); el.textContent = 'Copied'; toast('Address copied. Paste it into the To box when you forward.'); setTimeout(() => { el.textContent = 'Copy address'; }, 2000); }
    catch { const n = $('#fwd-addr-text'); if (n) { const r = document.createRange(); r.selectNodeContents(n); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } toast('Address selected. Press Ctrl+C (or long-press › Copy) to copy it.'); }
  },
  'map-focus': el => { UI.mapFocus = el.dataset.pk; UI.map.fitted = false; render(); },
  'map-full': () => toggleFull(),
  'map-now': () => { UI.mapAsOf = ''; UI.map.fitted = false; render(); },
  // boxes moved by hand go back to their tidy place in the tree; sizes you set are kept; Undo puts them back
  'map-rearrange': () => {
    const n = Object.keys(St.layout[offKey()] || {}).length;
    if (!n) { UI.map.fitted = false; render(); requestAnimationFrame(() => mapFit()); toast('Everything is already in order.'); return; }
    cvApply({ layout: { ...newLayout(), [offKey()]: {} } }); UI.map.fitted = false;
    const w = $('#map-world'); if (w) w.classList.add('anim'); render(); requestAnimationFrame(() => mapFit());
    toast(`⊞ ${n} box${n === 1 ? '' : 'es'} rearranged.`, { action: 'Undo', fn: cvUndo });
  },
  'map-reset-layout': () => { cvApply({ layout: { ...newLayout(), [offKey()]: {}, size: {} } }); UI.map.fitted = false; render(); toast('↺ Layout tidied.', { action: 'Undo', fn: cvUndo }); },
  'cv-tool': el => { const t = el.dataset.tool; UI.toolPanel = UI.tool === t ? !UI.toolPanel : true; UI.tool = t; if (t !== 'select') UI.cvSel.clear(); render(); },
  'cv-color': el => { UI.cvColor = el.dataset.c; render(); },
  'cv-recolor': el => { const ch = { els: {} }; for (const id of UI.cvSel) { const x = St.board.get(id); if (x) ch.els[id] = { ...x, color: el.dataset.c }; } UI.cvColor = el.dataset.c; cvApply(ch); render(); },
  'cv-conn': el => { const id = [...UI.cvSel][0], c = St.board.get(id); if (!c || c.type !== 'connector') return; const k = el.dataset.k; const n = { ...c, [k]: k === 'shape' ? (c.shape === 'straight' ? 'smart' : c.shape === 'curve' ? 'straight' : 'curve') : k === 'arrow' ? c.arrow === false : !c.dash }; cvApply({ els: { [id]: n } }); render(); },
  'map-mine': () => { saveSettingsUi({ mapMine: !myFocus() }); render(); if (myFocus()) { const n = [...St.tasks.values()].filter(needsMe).length; toast(n ? `🙋 ${n} task${n > 1 ? 's need' : ' needs'} action by you` : 'Nothing needs action by you right now'); } },
  'map-dir': el => { const d = el.dataset.dir === 'v' ? 'v' : 'h'; if (mapDir() === d) return; saveSettingsUi({ mapDir: d }); UI.map.fitted = false; render(); requestAnimationFrame(() => mapFit()); },
  'cv-width': el => { const d = +el.dataset.d; const ch = { els: {} }; for (const id of UI.cvSel) { const x = St.board.get(id); if (x && ['stroke', 'line', 'connector'].includes(x.type)) ch.els[id] = { ...x, width: Math.max(1, Math.min(24, (x.width || 3) + d)) }; } UI.cvWidth = Math.max(1, Math.min(24, UI.cvWidth + d)); cvApply(ch); render(); },
  'cv-front': () => { const ch = { els: {} }; let z = Date.now(); for (const id of UI.cvSel) { const x = St.board.get(id); if (x) ch.els[id] = { ...x, z: z++ }; } cvApply(ch); render(); },
  'cv-dup': () => duplicateSelection(),
  'cv-del': () => deleteSelection(),
  'map-refresh': () => mapRefresh(),
  'map-add-pending': () => { UI.mapRefresh = null; approveAll(); if (UI.view !== 'todo') go('todo'); },
  'map-restore-binned': () => mapRestoreBinned(),
  'map-refresh-close': () => { UI.mapRefresh = null; render(); },
  'cv-to-task': () => noteToTask(),
  'cv-undo': () => cvUndo(),
  'cv-redo': () => cvRedo(),
  'day-kind': el => { UI.dayKind = el.dataset.kind; render(); setTimeout(() => $('#day-in')?.focus(), 30); },
  'day-add': () => dayAdd(),
  'day-shift': el => { UI.dayDate = E.addDays(UI.dayDate || T(), +el.dataset.d); UI.daySuggest = null; render(); },
  'day-today': () => { UI.dayDate = T(); UI.daySuggest = null; render(); },
  'day-go': el => { UI.dayDate = el.dataset.d; UI.daySuggest = null; render(); window.scrollTo(0, 0); },
  'day-plan': el => { planTask(el.dataset.id, UI.dayDate || T()); render(); },
  'day-unplan': el => { unplanTask(el.dataset.id, UI.dayDate || T()); render(); },
  'day-entry-del': el => { const x = St.daily.get(el.dataset.id); delDaily(el.dataset.id); render(); if (x) toast('Removed.', { action: 'Undo', fn: () => { putDaily(x); render(); } }); },
  'day-ach-task': el => { const t = St.tasks.get(el.dataset.id); if (!t) return; putDaily({ id: E.uid('d'), kind: 'achievement', date: UI.dayDate || T(), text: `Completed ${t.title}`, taskId: t.id, createdAt: nowISO() }); render(); toast('⭐ Achievement recorded.'); },
  'day-suggest': () => suggestAchievements(),
  'day-sug-add': el => { const sg = (UI.daySuggest || [])[+el.dataset.i]; if (!sg) return; putDaily({ id: E.uid('d'), kind: 'achievement', date: UI.dayDate || T(), text: sg.text, taskId: sg.taskId || null, createdAt: nowISO(), by: St.sample ? 'ai' : 'auto' }); UI.daySuggest = UI.daySuggest.filter((_, i) => i !== +el.dataset.i); if (!UI.daySuggest.length) UI.daySuggest = null; render(); },
  'day-sug-clear': () => { UI.daySuggest = null; render(); },
  'day-map': () => { const D = UI.dayDate || T(); UI.mapDay = D; UI.mapAsOf = D < T() ? D : ''; UI.mapShowDone = true; UI.map.fitted = false; UI.todoMode = 'map'; saveTodoPrefs(); go('todo'); },
  'map-zoom': el => mapZoom(+el.dataset.z > 0 ? 1.2 : 1 / 1.2),
  'map-fit': () => mapFit(false),
  'map-goto': el => centerOnTask(el.dataset.id),
  'show-on-map': el => centerOnTask(el.dataset.id),
  'map-next-suggest': () => { const t = [...St.tasks.values()].find(x => x.placement && x.placement.status === 'suggested'); if (t) { centerOnTask(t.id); openDrawer('task', t.id); } },
  'use-placement': el => usePlacement(UI.drawer.id, +el.dataset.i),
  'keep-placement': () => { const t = clone(St.tasks.get(UI.drawer.id)); if (!t) return; t.placement = { ...(t.placement || {}), status: 'confirmed' }; (t.history = t.history || []).push({ at: nowISO(), text: 'Placement confirmed as is' }); putTask(t); render(); renderDrawer(); },
  'link-add': () => { const sel = $('#d-link'); const oid = sel && sel.value; if (!oid || !UI.drawer) return; const t = clone(St.tasks.get(UI.drawer.id)); const o = St.tasks.get(oid); if (!t || !o || relIds(t).includes(oid)) return; t.relatedIds = [...relIds(t), oid]; (t.history = t.history || []).push({ at: nowISO(), text: `Linked to ${o.ref}` }); putTask(t); render(); renderDrawer(); },
  'link-del': el => { const a = clone(St.tasks.get(el.dataset.a)); const bid = el.dataset.b; if (!a) return; a.relatedIds = relIds(a).filter(x => x !== bid); const b = St.tasks.get(bid); (a.history = a.history || []).push({ at: nowISO(), text: `Unlinked from ${b ? b.ref : 'task'}` }); putTask(a); render(); renderDrawer(); },
  'todo-filter': el => { UI.todoFilter = el.dataset.filter; render(); },
  'todo-mode': el => { UI.todoMode = el.dataset.mode; saveTodoPrefs(); render(); },
  'toggle-sub': el => { toggleSub(el.dataset.id, el.dataset.sid); render(); if (UI.drawer && UI.drawer.id === el.dataset.id) renderDrawer(); },
  'subs-expand': el => { const id = el.dataset.id; UI.subOpen.has(id) ? UI.subOpen.delete(id) : UI.subOpen.add(id); render(); },
  'sub-add': () => addSub(),
  'sub-del': el => { const t = clone(St.tasks.get(UI.drawer.id)); if (!t) return; t.subtasks = subsOf(t).filter(x => x.id !== el.dataset.sid); putTask(t); render(); renderDrawer(); },
  'todo-group': el => { UI.todoGroup = el.dataset.group; saveTodoPrefs(); render(); },
  'toggle-group': el => { const g = el.dataset.gid; UI.collapsed.has(g) ? UI.collapsed.delete(g) : UI.collapsed.add(g); render(); },
  'ai-categorize': () => aiCategorize([...St.tasks.values()].filter(t => t.status !== 'done' && needsCat(t) && !t.catLocked).map(t => t.id)),
  'gmail-save': () => { if (saveGmailForm()) { render(); toast('Forwarding inbox saved.'); } },
  'gmail-check': () => checkGmail(true),
  'approve-all': () => approveAll(),
  analyze: () => { retryErrored(); runAnalysis(); },
  stop: () => { UI.analyzing = false; UI.abort && UI.abort.abort(); render(); },
  approve: el => approveEmail(el.dataset.id),
  'dismiss-email': el => { const e = clone(St.emails.get(el.dataset.id)); if (!e) return; e.reviewState = (e.analysis && (e.analysis.tasks || []).length) ? 'dismissed' : 'reviewed'; putEmail(e); render(); toast('Done. The email stays in Emails.'); },
  reanalyze: el => reanalyze(el.dataset.id),
  'ask-delete-email': el => { UI.confirm = 'dele-' + el.dataset.id; renderDrawer(); },
  'delete-email': el => { delEmail(el.dataset.id); UI.confirm = null; closeDrawer(); render(); toast('Email record deleted.'); },
  'export-json': exportJSON, 'export-csv': exportCSV, 'export-ics': exportICS,
  'ask-wipe': () => { UI.confirm = 'wipe'; render(); },
  wipe: wipeAll,
  'close-modal': () => { $('#modal').hidden = true; },
  'copy-modal': async () => { const ta = $('#modal-text'); try { await navigator.clipboard.writeText(ta.value); toast('Copied.'); } catch { ta.focus(); ta.select(); toast('Press Ctrl+C / ⌘C to copy the selected text.'); } },
};
const CHG = {
  'stylus-draw': el => { saveSettingsUi({ stylusDraw: !!el.checked }); },
  'stylus-only': el => { saveSettingsUi({ stylusOnly: !!el.checked }); },
  'sub-text': el => { const t = clone(St.tasks.get(UI.drawer && UI.drawer.id)); if (!t) return; const x = subsOf(t).find(y => y.id === el.dataset.sid); if (!x || x.text === el.value.trim()) return; if (!el.value.trim()) { t.subtasks = subsOf(t).filter(y => y.id !== x.id); } else x.text = el.value.trim(); putTask(t); render(); },
  'map-opt': el => { UI[el.dataset.key] = el.checked; UI.map.fitted = false; render(); },
  'map-day': el => { UI.mapDay = el.value || ''; render(); },
  'map-asof': el => { const v = el.value && el.value < T() ? el.value : ''; if (v === UI.mapAsOf) return; UI.mapAsOf = v; UI.map.fitted = false; render(); },
  'day-date': el => { if (el.value) { UI.dayDate = el.value; UI.daySuggest = null; render(); } },
  'todo-opt': el => { UI[el.dataset.key] = el.checked; saveTodoPrefs(); render(); },
  'task-field': el => { if (UI.drawer && UI.drawer.kind === 'task') setTaskField(UI.drawer.id, el.dataset.field, el.value); },
  prop: el => updateProposal(el.dataset.eid, el.dataset.pid, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value),
  upd: el => { const e = clone(St.emails.get(el.dataset.eid)); const u = e && (e.analysis.updates || []).find(x => x.uid === el.dataset.uid); if (!u) return; u.accept = el.checked; putEmail(e); render(); },
  files: el => { const f = el.files; if (f && f.length) intakeFiles(f); el.value = ''; },
  'paste-files': el => { UI.pasteFiles = [...el.files]; const n = $('#paste-files-n'); if (n) n.textContent = UI.pasteFiles.map(f => f.name).join(', '); },
  // a file you add for an attachment Gmail could not send (too large): read like any attachment
  'att-supply': async el => {
    const b = UI.staging.find(x => x.id === el.dataset.bid); const a = b && b.atts.find(x => x.id === el.dataset.aid); const f = el.files && el.files[0]; if (!a || !f) return;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const i = b.atts.indexOf(a); b.atts.splice(i, 1);
    const before = b.atts.length; await addAttTo(b, { name: f.name, mime: f.type, bytes }, '', 0);
    const added = b.atts.splice(before); b.atts.splice(i, 0, ...added);
    b.warnings = b.warnings.filter(w => !/larger than Gmail lets/.test(w) || b.atts.some(x => x.missing));
    if (b.state !== 'analyzing') b.state = 'parsing'; render(); extractPending();
  },
  'att-include': el => { const b = UI.staging.find(x => x.id === el.dataset.bid); const a = b && b.atts.find(x => x.id === el.dataset.aid); if (a) { a.include = el.checked; rerenderStaging(); } },
  'move-att': el => {
    const b = UI.staging.find(x => x.id === el.dataset.bid); const to = UI.staging.find(x => x.id === el.value); if (!b || !to) return;
    const i = b.atts.findIndex(x => x.id === el.dataset.aid); if (i < 0) return;
    to.atts.push(b.atts.splice(i, 1)[0]);
    if (b.source === 'docs' && !b.atts.length) UI.staging = UI.staging.filter(x => x !== b);
    render();
  },
  skip: el => { const b = UI.staging.find(x => x.id === el.dataset.bid); if (b) { b.skip = !el.checked; render(); } },
  opt: el => {
    const s = clone(St.settings); const k = el.dataset.key;
    s[k] = el.type === 'checkbox' ? el.checked : el.value; putSettings(s);
    if (['vision', 'drawings'].includes(k)) reextractImages(); else render();
  },
  'import-json': el => { const f = el.files && el.files[0]; if (f) importJSON(f); el.value = ''; },
};
let qTimer = null;
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { if (el.tagName === 'A') e.preventDefault(); ACT[el.dataset.act](el, e); return; }
  const nav = e.target.closest('[data-nav]'); if (nav) { go(nav.dataset.nav); return; }
  if (e.target.id === 'scrim') closeDrawer();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) $('#modal').hidden = true; else if (UI.drawer) closeDrawer(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.trow,.erow,.tc-title,.todo-main .ttl')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e); });
// a file dialog can stay open while the page redraws: the replaced input still delivers its files
HOOKS.afterRender.push(() => document.querySelectorAll('input[type=file][data-chg]:not([data-bound])').forEach(el => { el.dataset.bound = '1'; el.addEventListener('change', e => { if (!el.isConnected && CHG[el.dataset.chg]) CHG[el.dataset.chg](el, e); }); }));
document.addEventListener('input', e => {
  const el = e.target;
  if (el.classList && (el.classList.contains('title-edit') || el.classList.contains('autogrow'))) autosize(el);
  if (el.dataset && el.dataset.inp) {
    UI[el.dataset.inp] = el.value; clearTimeout(qTimer);
    qTimer = setTimeout(() => { if (el.dataset.inp === 'mapQ') { render(); const ids = [...(document.querySelectorAll('.mnode.task.hit'))].map(n => n.dataset.tid); if (ids.length && UI.mapQ) { const vp = $('#map-vp'), n = UI.mapLayout.nodes.find(x => x.id === 't:' + ids[0]); if (vp && n) { UI.map.x = vp.clientWidth / 2 - (n.x + n.w / 2) * UI.map.k; UI.map.y = vp.clientHeight / 2 - (n.y + n.h / 2) * UI.map.k; applyCam(true); } } return; } if (el.dataset.inp === 'todoQ') { const n = $('#todo-groups'); if (n) n.innerHTML = deco(todoGroupsHTML()); } else { const id = el.id, pos = el.selectionStart; render(); const n = id && document.getElementById(id); if (n && document.activeElement !== n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} } } }, 120);
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'day-in' || e.target.id === 'day-mgr')) { e.preventDefault(); dayAdd(); return; } if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('title-edit')) { e.preventDefault(); e.target.blur(); } if (e.key === 'Enter' && e.target.id === 'd-sub-new') { e.preventDefault(); addSub(); } });
// drag & drop
let dragDepth = 0;
document.addEventListener('dragenter', e => { if (![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); dragDepth++; if (UI.view !== 'import') go('import'); $('#drop')?.classList.add('over'); });
document.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
document.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#drop')?.classList.remove('over'); } });
document.addEventListener('drop', e => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); dragDepth = 0; $('#drop')?.classList.remove('over'); intakeFiles(e.dataTransfer.files); });
// paste files/text directly on import page
document.addEventListener('paste', e => {
  if (UI.view !== 'import' || e.target.closest('input,textarea')) return;
  const files = e.clipboardData && e.clipboardData.files;
  if (files && files.length) { e.preventDefault(); intakeFiles(files); return; }
  const txt = e.clipboardData && e.clipboardData.getData('text/plain');
  if (txt && txt.trim().length > 20) { e.preventDefault(); UI.pasteOpen = true; render(); const ta = $('#paste-text'); if (ta) ta.value = txt; }
});

/* ---------- boot ---------- */
const startView = (location.hash || '').replace('#', '');
if (VIEWS.includes(startView)) UI.view = startView;
render();
initStore();
// the desktop app calls this when an AI becomes available (Claude account connected) so emails waiting in
// the list can be analysed without restarting
async function recheckAI() {
  if (typeof window.claude === 'undefined') return false;
  St.sample = await Promise.resolve(claude.use('sample')).catch(() => null);
  St.limits = St.sample ? await St.sample.limits().catch(() => null) : St.limits;
  render(); return !!St.sample;
}
window.__AR = { St, UI, E, mapSVG, routePath, learnedNotes: typeof learnedNotes === 'function' ? learnedNotes : null, recheckAI }; // debugging hook
})();
