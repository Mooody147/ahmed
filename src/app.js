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
const DEFAULTS = { me: { name: '', emails: [], aliases: '', role: 'Mechanical design engineer — water & wastewater treatment', org: '', scope: '' }, projects: [], tier: 'complex', mask: false, storeText: true, vision: true, drawings: true, titleBlocks: true, maxPageImages: 8, setupDone: false };
const St = { mcp: null, mode: 'starting', uid: null, refs: null, db: null, tasks: new Map(), emails: new Map(), settings: clone(DEFAULTS), ready: false, profileName: '', sample: null, limits: null, downloads: null, capsResolved: false };
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
const inflight = new Map(), queued = new Map();
async function writeDoc(ref, data) {
  const k = ref.path;
  if (inflight.has(k)) { queued.set(k, { ref, data }); return inflight.get(k); }
  const p = (async () => {
    try { await ref.set(data); }
    catch (e) {
      if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 600 + Math.random() * 900)); try { await ref.set(data); return; } catch (e2) { e = e2; } }
      dbError(e);
    } finally {
      inflight.delete(k);
      const q = queued.get(k); if (q) { queued.delete(k); writeDoc(q.ref, q.data); }
    }
  })();
  inflight.set(k, p);
  return p;
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
  clearTimeout(lsTimer);
  lsTimer = setTimeout(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ tasks: [...St.tasks.values()], emails: [...St.emails.values()], settings: St.settings })); }
    catch { toast('This browser refused to save (storage full or blocked). Export a backup from Setup.', { err: true }); }
  }, 250);
}
function putTask(t) {
  t.updatedAt = nowISO();
  St.tasks.set(t.id, t);
  if (St.mode === 'db') writeDoc(St.refs.tasks.doc(t.id), t); else saveLocal();
}
function delTask(id) {
  St.tasks.delete(id);
  if (St.mode === 'db') St.refs.tasks.doc(id).delete().catch(dbError); else saveLocal();
}
function putEmail(e) {
  St.emails.set(e.id, e);
  if (St.mode === 'db') writeDoc(St.refs.emails.doc(e.id), e); else saveLocal();
}
function delEmail(id) {
  St.emails.delete(id);
  if (St.mode === 'db') { St.refs.emails.doc(id).delete().catch(dbError); St.refs.texts.doc(id).delete().catch(() => {}); }
  else { saveLocal(); try { const m = JSON.parse(localStorage.getItem(LS_TEXT) || '{}'); delete m[id]; localStorage.setItem(LS_TEXT, JSON.stringify(m)); } catch {} }
}
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
  if (db && St.uid) {
    St.db = db; St.mode = 'db';
    const base = db.doc('data/users/' + St.uid + '/register');
    St.refs = { tasks: base.collection('tasks'), emails: base.collection('emails'), texts: base.collection('texts'), settings: db.doc('data/users/' + St.uid + '/settings'), seen: db.doc('data/users/' + St.uid + '/gmailseen') };
    let got = 0; const done = () => { if (++got >= 3 && !St.ready) { St.ready = true; setTimeout(() => { maybeAutoCheck(); if (UI.view === 'todo') maybeAutoCategorize(); }, 300); } render(); };
    const fail = e => { if (e && e.code === 'revoked') toast('Access to saved data ended for this view. Reload the page.', { err: true }); else toast('Live sync stopped (' + (e && e.code || 'error') + '). Reload to reconnect.', { err: true }); };
    St.refs.tasks.onSnapshot(s => { St.tasks = new Map(s.docs.map(d => [d.id, { ...clone(d.data()), id: d.id }])); if (!St._t) { St._t = 1; done(); } else scheduleRender(); }, fail);
    St.refs.emails.onSnapshot(s => { St.emails = new Map(s.docs.map(d => [d.id, { ...clone(d.data()), id: d.id }])); if (!St._e) { St._e = 1; done(); } else scheduleRender(); }, fail);
    St.refs.settings.onSnapshot(d => { St.settings = mergeSettings(d.exists ? clone(d.data()) : null); if (!St._s) { St._s = 1; done(); } else scheduleRender(); }, fail);
  } else {
    St.mode = 'local';
    try {
      const raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) { (raw.tasks || []).forEach(t => St.tasks.set(t.id, t)); (raw.emails || []).forEach(e => St.emails.set(e.id, e)); St.settings = mergeSettings(raw.settings); }
    } catch {}
    St.ready = true; render(); setTimeout(() => { maybeAutoCheck(); if (UI.view === 'todo') maybeAutoCategorize(); }, 300);
  }
}
function maybeAutoCheck() { if (GM.autoDone) return; GM.autoDone = true; const g = gmCfg(); if (St.mcp && g.address && g.autoCheck) checkGmail(false); }

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
  return d.toLocaleDateString('en-GB', opts);
}
function fmtDateTime(iso) { if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return iso; return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
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
function keepFocus(fn) {
  const a = document.activeElement; const id = a && a.id; let ss = null, se = null;
  try { ss = a.selectionStart; se = a.selectionEnd; } catch {}
  fn();
  if (id) { const n = document.getElementById(id); if (n && n !== document.activeElement) { n.focus({ preventScroll: true }); try { if (ss !== null) n.setSelectionRange(ss, se); } catch {} } }
}
function render() {
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
    main.innerHTML = ({ todo: viewTodo, review: viewReview, import: viewImport, emails: viewEmails, setup: viewSetup })[UI.view]();
  });
  if (UI.view === 'todo' && UI.todoMode === 'map') afterMapRender();
  document.querySelectorAll('#main textarea.autogrow').forEach(autosize);
  if (UI.drawer && UI.drawer.kind === 'email' && UI.drawer.dirty) renderDrawer();
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
function openDrawer(kind, id) { UI.drawer = { kind, id }; renderDrawer(); }
function closeDrawer() { UI.drawer = null; $('#drawer').hidden = true; $('#scrim').hidden = true; document.body.style.overflow = ''; }
function renderDrawer() {
  const dr = UI.drawer; if (!dr) return closeDrawer();
  const el = $('#drawer');
  if (dr.kind === 'task') { const t = St.tasks.get(dr.id); if (!t) return closeDrawer(); el.innerHTML = taskDrawerHTML(t); }
  else if (dr.kind === 'email') { const e = St.emails.get(dr.id); if (!e) return closeDrawer(); el.innerHTML = emailDrawerHTML(e); dr.dirty = false; loadEmailTexts(e.id); }
  el.hidden = false; $('#scrim').hidden = false; document.body.style.overflow = 'hidden';
  const ta = el.querySelector('.title-edit'); if (ta) autosize(ta);
}
function autosize(ta) { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }
function taskDrawerHTML(t) {
  const projs = projectsList();
  const basis = t.deadlineBasis === 'uncertain' ? '<span class="chip warn">Uncertain</span>' : t.deadlineBasis === 'relative' ? '<span class="chip">Calculated</span>' : t.deadlineBasis === 'explicit' ? '<span class="chip ok">Stated</span>' : '';
  const emails = (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean);
  return `<div class="drawer-h"><span class="mono muted">${esc(t.ref || '')}</span>${chipPrio(t.priority)}<span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b">
    <textarea class="title-edit" id="d-title" rows="1" data-chg="task-field" data-field="title" dir="auto" aria-label="Title">${esc(t.title)}</textarea>
    ${t.placement && t.placement.status === 'suggested' ? callout('info', `<p><b>❓ Claude isn’t sure where this belongs.</b> Choose one:</p><div style="display:grid;gap:6px;margin-top:8px">${(t.placement.options || []).map((o, i) => { const r = o.relatedTaskId && St.tasks.get(o.relatedTaskId); return `<button class="btn sm opt-btn" data-act="use-placement" data-i="${i}">${o.project ? '📁 ' + esc(o.project) : ''}${o.discipline ? ' › ' + esc(E.DISCIPLINES[o.discipline]) : ''}${r ? ' · 🔗 ' + esc(r.ref) : ''}${o.reason ? `<span class="muted small"> — ${esc(o.reason)}</span>` : ''}</button>`; }).join('')}<button class="btn sm ghost" data-act="keep-placement">Keep where it is${t.project ? ': ' + esc(t.project) : ''}</button></div>`) : ''}
    <div class="seg" role="group" aria-label="Status">${Object.entries(STATUS).map(([k, v]) => `<button data-act="set-status" data-id="${esc(t.id)}" data-status="${k}" aria-pressed="${t.status === k}">${v}</button>`).join('')}</div>
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
    <div><div class="label" style="margin-bottom:8px">Evidence</div>${evidenceHTML(t.evidence, true)}</div>
    ${emails.length ? `<div><div class="label" style="margin-bottom:6px">Source emails</div>${emails.map(e => `<button class="btn ghost sm" style="justify-content:flex-start;max-width:100%;overflow:hidden" data-act="open-email" data-id="${esc(e.id)}">${I.mail}<span style="overflow:hidden;text-overflow:ellipsis">${esc(e.subject || '(no subject)')}</span></button>`).join('')}</div>` : ''}
    <div><div class="label" style="margin-bottom:8px">History</div><div class="history">${(t.history || []).slice().reverse().map(h => `<div><time>${esc(fmtDate(h.at, { day: 'numeric', month: 'short' }))} ${esc(new Date(h.at).toTimeString().slice(0, 5))}</time><span dir="auto">${esc(h.text)}</span></div>`).join('')}</div></div>
    <div class="row">${UI.confirm === 'del-' + t.id ? `<span class="small">Delete this task permanently?</span><button class="btn sm danger" data-act="delete-task" data-id="${esc(t.id)}">Delete</button><button class="btn sm" data-act="cancel-confirm">Keep</button>` : `<button class="btn ghost sm danger" data-act="ask-delete-task" data-id="${esc(t.id)}">${I.trash} Delete task</button>`}</div>
  </div>`;
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
  if (o.project && o.project !== t.project) { notes.push(`Project → ${o.project}`); t.project = o.project; t.projectLocked = true; }
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
(() => { try { const v = JSON.parse(localStorage.getItem(TODO_LS) || '{}'); if (v.group) UI.todoGroup = v.group; UI.todoWaiting = !!v.waiting; if (v.mode) UI.todoMode = v.mode; } catch {} })();
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
      const ans = await St.sample.json(E.buildCategorizePrompt(chunk, allProjects(), cands, allTopics()), { modelTier: 'quick' });
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
  } finally { CAT.running = false; render(); }
}
function maybeAutoCategorize() {
  // runs when the viewer opens the To-do tab; only for tasks Claude has not categorised yet
  if (!St.sample || CAT.running || Date.now() - CAT.lastAuto < 60000) return;
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
const projBadge = (name, cls = '') => `<span class="pbadge ${cls}" style="--h:${hueOf(name)}" aria-hidden="true">${esc(monogram(name))}</span>`;
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
  const q = E.normMatch(UI.todoQ || '');
  if (q) { const qs = q.split(' '); list = list.filter(t => { const h = E.normMatch([t.ref, t.title, t.action, t.project, t.nextStep, t.owner, t.requestedBy, t.notes, t.sourceSubject, E.DISCIPLINES[t.discipline], E.WORK_TYPES[t.workType], subsOf(t).map(x => x.text).join(' ')].join(' ')); return qs.every(x => h.includes(x)); }); }
  return list;
}
function todoGroupsHTML() {
  const by = UI.todoGroup, mode = UI.todoMode;
  const list = todoFiltered();
  if (!St.tasks.size) return `<div class="empty-hero card">${ILLUSTRATION}<div><h3>Your to-do list is empty</h3><p class="muted">Forward a work email to your address, or add saved Outlook files. Claude pulls out the actions — even long comment sheets become one task with every item inside — and sorts them by project.</p>${fwdAddrHTML()}<div class="row" style="margin-top:12px"><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button></div></div></div>`;
  if (!list.length) return `<div class="card"><div class="empty"><div class="big-emoji">${UI.todoQ ? '🔎' : '🌤️'}</div><h3>${UI.todoQ ? 'No match' : 'All clear'}</h3><p>${UI.todoQ ? 'No to-do matches your search.' : UI.todoFilter !== 'all' ? 'Nothing in this view.' : 'No open actions for you right now.'}</p>${UI.todoFilter !== 'all' ? '<button class="btn" data-act="todo-filter" data-filter="all">Show everything</button>' : ''}</div></div>`;
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
  return mode === 'list' ? `<div class="todo-groups-list">${html}</div>` : `<div class="board">${html}</div>`;
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
    <section class="hero ${UI.todoMode === 'map' ? 'compact' : ''}">
      <div class="hero-txt"><div class="label">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>
        <h1>${greeting()}</h1>
        <p class="hero-sub">${mine.length ? `You have <b>${mine.length}</b> open task${mine.length === 1 ? '' : 's'}${items ? ` with <b>${items}</b> item${items === 1 ? '' : 's'} inside` : ''}${c.overdue ? ` — <b class="over-txt">${c.overdue} overdue</b>` : c.today ? ` — <b>${c.today}</b> due today` : ''}.` : 'Nothing open. Forward an email when something new lands.'}</p>
        <div class="row"><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button><button class="btn" data-act="new-task">${I.plus} Task</button>${rc ? `<button class="btn review-btn" data-act="nav" data-view="review">📬 Review ${rc}</button>` : ''}</div>
      </div>
      ${UI.todoMode === 'map' ? '' : `<div class="hero-art">${ILLUSTRATION}</div>`}
    </section>
    ${!St.settings.setupDone ? setupCardHTML() : ''}
    ${uncategorised && St.sample ? callout('info', `<div class="row"><span>${CAT.running ? '🧠 Claude is sorting your tasks into projects and categories…' : `🏷️ ${uncategorised} task${uncategorised > 1 ? 's are' : ' is'} not categorised yet.`}</span><span class="spacer"></span>${CAT.running ? '<div class="progress indet" style="width:90px"><i></i></div>' : `<button class="btn sm primary" data-act="ai-categorize">Categorise with Claude</button>`}</div>`) : ''}
    ${CAT.error && !CAT.running ? callout('warn', `<p>${esc(CAT.error)}</p>`) : ''}
    ${St.tasks.size ? `<div class="mode-bar"><div class="seg mode-seg" role="group" aria-label="Layout"><button data-act="todo-mode" data-mode="map" aria-pressed="${UI.todoMode === 'map'}">🧠 Map</button><button data-act="todo-mode" data-mode="board" aria-pressed="${UI.todoMode === 'board'}">▦ Board</button><button data-act="todo-mode" data-mode="list" aria-pressed="${UI.todoMode === 'list'}">☰ List</button></div></div>` : ''}
    ${St.tasks.size && UI.todoMode === 'map' ? viewMap() : ''}
    ${St.tasks.size && UI.todoMode !== 'map' ? `<div class="tiles" role="toolbar" aria-label="Filter">${tiles.map(([k, e, l, cls]) => `<button class="tile ${cls} ${c[k] ? '' : 'zero'}" data-act="todo-filter" data-filter="${k}" aria-pressed="${f === k}"><span class="tile-e">${e}</span><span class="tile-n num">${c[k]}</span><span class="tile-l">${l}</span></button>`).join('')}</div>
    <div class="todo-bar">
      <div class="seg" role="group" aria-label="Group by"><span class="seg-label">Group</span>${TODO_GROUPS.map(([k, l]) => `<button data-act="todo-group" data-group="${k}" aria-pressed="${by === k}">${l}</button>`).join('')}</div>
      <label class="search todo-search">${I.search}<span class="sr">Search to-dos</span><input class="input" id="todo-q" type="search" placeholder="Search tasks, items, documents, people…" value="${esc(UI.todoQ)}" data-inp="todoQ"></label>
      <div class="row todo-opts">
        <label class="check small"><input type="checkbox" id="todo-wait" data-chg="todo-opt" data-key="todoWaiting" ${UI.todoWaiting ? 'checked' : ''}>Include what I’m waiting on</label>
        <label class="check small"><input type="checkbox" id="todo-done" data-chg="todo-opt" data-key="todoShowDone" ${UI.todoShowDone ? 'checked' : ''}>Show done (7 days)</label>
      </div>
    </div>` : ''}
    ${UI.todoMode !== 'map' || !St.tasks.size ? `<div id="todo-groups">${todoGroupsHTML()}</div>` : ''}
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
UI.map = { x: 30, y: 30, k: 0.85, fitted: false }; UI.mapCollapsed = new Set(); UI.mapItems = new Set(); UI.mapSel = null;
UI.mapShowDone = true; UI.mapFocus = 'all'; UI.mapQ = ''; UI.mapActivity = true;
const MX = { root: 0, project: 250, topic: 540, task: 830, item: 1190 };
const MW = { root: 200, project: 250, topic: 250, task: 320, item: 280 };
const MH = { root: 78, project: 72, topic: 52, task: 82, item: 34 };
const MGAP = { project: 20, topic: 14, task: 12, item: 6, root: 0 };
const MGAP_AFTER = { root: 0, project: 34, topic: 16, task: 8 };
const relIds = t => Array.isArray(t.relatedIds) ? t.relatedIds : [];
function projKeyLabel(t) { const p = (t.project || '').trim(); return p ? ['p:' + E.normMatch(p), p] : ['p:~', 'No project']; }
function mapTasks() {
  return [...St.tasks.values()].filter(t => (UI.mapShowDone || t.status !== 'done') && (UI.mapFocus === 'all' || projKeyLabel(t)[0] === UI.mapFocus));
}
function buildMap() {
  const tasks = mapTasks();
  const projs = new Map();
  for (const t of tasks) {
    const [pk, pl] = projKeyLabel(t);
    if (!projs.has(pk)) projs.set(pk, { id: pk, type: 'project', label: pl, hue: pk === 'p:~' ? 200 : hueOf(pl), cats: new Map(), n: 0, done: 0 });
    const P = projs.get(pk); P.n++; if (t.status === 'done') P.done++;
    const tp = topicOf(t); const ck = tp ? E.normMatch(tp) : '~';
    if (!P.cats.has(ck)) P.cats.set(ck, { id: 'tp:' + pk + ':' + ck, type: 'topic', key: ck, label: tp || 'General', hue: P.hue, tasks: [] });
    P.cats.get(ck).tasks.push(t);
  }
  const openOf = P => P.n - P.done;
  const projects = [...projs.values()].sort((a, b) => (a.id === 'p:~') - (b.id === 'p:~') || openOf(b) - openOf(a) || a.label.localeCompare(b.label));
  const root = { id: 'root', type: 'root', children: [] };
  for (const P of projects) {
    // project → topics (most recent activity first) → tasks (oldest first: historical progression)
    const last = C => C.tasks.reduce((m, t) => (t.updatedAt || '') > m ? t.updatedAt : m, '');
    P.children = [...P.cats.values()].sort((a, b) => (a.key === '~') - (b.key === '~') || last(b).localeCompare(last(a))).map(C => {
      C.children = C.tasks.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')).map(t => ({
        id: 't:' + t.id, type: 'task', t, hue: P.hue,
        children: UI.mapItems.has(t.id) ? subsOf(t).map(s2 => ({ id: 's:' + t.id + ':' + s2.id, type: 'item', s: s2, t, hue: P.hue, children: [] })) : [],
      }));
      return C;
    });
    root.children.push(P);
  }
  // layout: tidy horizontal tree
  const nodes = [], edges = []; let cursor = 0;
  const place = (n) => {
    const hidden = UI.mapCollapsed.has(n.id);
    n.hiddenKids = hidden ? n.children.length : 0;
    const kids = hidden ? [] : n.children;
    n.x = MX[n.type]; n.w = MW[n.type]; n.h = Math.max(MH[n.type], measureNode(n));
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
  place(root);
  const byTask = new Map(nodes.filter(n => n.type === 'task').map(n => [n.t.id, n]));
  const links = [];
  for (const n of byTask.values()) for (const rid of relIds(n.t)) { const m = byTask.get(rid); if (m) links.push({ from: m, to: n }); }
  const wide = nodes.some(n => n.type === 'item');
  return { nodes, edges, links, root, projects, w: (wide ? MX.item + MW.item : MX.task + MW.task) + 220, h: Math.max(cursor, 200) + 40 };
}
function mapNodeHTML(n, hits) {
  const st = `left:${n.x || 0}px;top:${n.y || 0}px;width:${n.w}px;${n.h ? `height:${n.h}px;` : ''}--h:${n.hue ?? 186}`;
  const more = n.hiddenKids ? `<span class="mmore">+${n.hiddenKids}</span>` : '';
  if (n.type === 'root') {
    const all = [...St.tasks.values()]; const open = all.filter(t => t.status !== 'done').length;
    return `<div class="mnode root" data-node="root" style="${st}"><span class="brand-mark">${I.brand}</span><div><b>My work</b><small>${open} open · ${all.length - open} done</small></div></div>`;
  }
  if (n.type === 'project') {
    const pct = n.n ? 100 * n.done / n.n : 0;
    return `<div class="mnode project" data-node="${esc(n.id)}" data-type="project" data-pk="${esc(n.id)}" data-label="${esc(n.label)}" style="${st}">
      ${n.id === 'p:~' ? '<span class="gicon">🗂️</span>' : projBadge(n.label)}
      <div class="mtxt"><b dir="auto">${esc(n.label)}</b><small>${n.n - n.done} open · ${n.done} done</small></div>${ring(pct, 34)}${more}
      <button class="mfocus" data-map="focus" title="Show only this project" aria-label="Show only this project">⤢</button></div>`;
  }
  if (n.type === 'topic') {
    const open = n.tasks.filter(t => t.status !== 'done').length;
    return `<div class="mnode topic" data-node="${esc(n.id)}" data-type="topic" data-topic="${esc(n.key === '~' ? '' : n.label)}" data-plabel="${esc(n.tasks[0] ? projKeyLabel(n.tasks[0])[1] : '')}" style="${st}">
      <span class="cicon">${n.key === '~' ? '🗂️' : '🧩'}</span><div class="mtxt"><b dir="auto">${esc(n.label)}</b><small>${open} open · ${n.tasks.length - open} done</small></div>${more}</div>`;
  }
  if (n.type === 'task') {
    const t = n.t, d = dueInfo(t), subs = subsOf(t).length, links = relIds(t).length + [...St.tasks.values()].filter(x => relIds(x).includes(t.id)).length;
    const sug = t.placement && t.placement.status === 'suggested';
    const cls = ['mnode', 'task', 'p-' + (t.priority || 'medium'), t.status === 'done' ? 'done' : '', UI.mapSel === t.id ? 'sel' : '', hits && hits.has(t.id) ? 'hit' : '', sug ? 'suggest' : ''].join(' ');
    return `<div class="${cls}" data-node="${esc(n.id)}" data-type="task" data-tid="${esc(t.id)}" style="${st}">
      <button class="mtick" data-map="tick" aria-label="${t.status === 'done' ? 'Reopen' : 'Mark done'}">${I.check}</button>
      <div class="mtxt"><b dir="auto">${esc(t.title)}</b>
        <small><span class="mono">${esc(t.ref || '')}</span>${t.status === 'done' ? `<span class="mdone">✓ ${esc(fmtDate((t.completedAt || t.updatedAt || '').slice(0, 10)))}</span>` : `<span class="duepill ${d.cls}">${dueEmoji(d)}${esc(d.txt)}</span>`}
        ${subs ? `<button class="mitems" data-map="items" title="Show items">🗂️ ${subsDone(t)}/${subs}</button>` : ''}${links ? `<span title="Linked tasks">🔗 ${links}</span>` : ''}${t.status === 'waiting' || t.ownership === 'waiting' ? '<span>⏳</span>' : ''}${t.status === 'blocked' ? '<span>⛔</span>' : ''}${sug ? '<span class="msug" title="Claude needs your confirmation">❓ Confirm</span>' : ''}</small></div></div>`;
  }
  const s = n.s;
  return `<div class="mnode item ${s.done ? 'done' : ''}" data-node="${esc(n.id)}" data-type="item" data-tid="${esc(n.t.id)}" data-sid="${esc(s.id)}" style="${st}"><span class="subtick" aria-pressed="${!!s.done}">${I.check}</span><span class="itxt" dir="auto">${esc(s.text)}</span></div>`;
}
/* measure each node's natural height so boxes fit their full text */
const measureCache = new Map();
function measureNode(n) {
  if (n.type === 'root') return MH.root;
  const saved = n.h; n.h = 0; n.w = MW[n.type];
  const html = mapNodeHTML(n, null); n.h = saved;
  const key = n.w + '|' + html;
  if (measureCache.has(key)) return measureCache.get(key);
  let m = document.getElementById('map-measure');
  if (!m) { m = document.createElement('div'); m.id = 'map-measure'; m.setAttribute('aria-hidden', 'true'); m.style.cssText = 'position:absolute;left:-20000px;top:0;width:2000px;visibility:hidden;pointer-events:none'; document.body.appendChild(m); }
  m.innerHTML = html;
  const h = Math.ceil(m.firstElementChild ? m.firstElementChild.offsetHeight : MH[n.type]);
  m.innerHTML = '';
  if (measureCache.size > 3000) measureCache.clear();
  measureCache.set(key, h); return h;
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measureCache.clear(); if (UI.view === 'todo' && UI.todoMode === 'map') render(); });
function edgePath(a, b) { const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2, c = (x2 - x1) * 0.5; return `M${x1} ${y1} C${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`; }
function linkPath(a, b) { const x = a.x + a.w, y1 = a.y + a.h / 2, y2 = b.y + b.h / 2, bend = 46 + Math.min(160, Math.abs(y2 - y1) * 0.22); return `M${x} ${y1} C${x + bend} ${y1}, ${x + bend} ${y2}, ${x + 6} ${y2}`; }
function activityList() {
  const ev = [];
  for (const t of St.tasks.values()) {
    for (const h of (t.history || [])) ev.push({ at: h.at, t, text: h.text });
    for (const s of subsOf(t)) if (s.done && s.doneAt) ev.push({ at: s.doneAt, t, text: 'Item done: ' + s.text });
  }
  return ev.filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 80);
}
function evEmoji(txt) {
  if (/^Created/.test(txt)) return '🆕'; if (/→ Done|Item done/.test(txt)) return '✅'; if (/^Status/.test(txt)) return '🔄'; if (/Deadline|deadline/.test(txt)) return '📅';
  if (/Linked|link/.test(txt)) return '🔗'; if (/Project|Moved|Category|placement/i.test(txt)) return '🧭'; if (/email/i.test(txt)) return '📨'; return '✏️';
}
function viewMap() {
  const M = buildMap(); UI.mapLayout = M;
  const q = E.normMatch(UI.mapQ || ''); let hits = null;
  if (q) { hits = new Set(); for (const t of St.tasks.values()) { const h = E.normMatch([t.ref, t.title, t.action, t.project, topicOf(t), subsOf(t).map(x => x.text).join(' ')].join(' ')); if (q.split(' ').every(w => h.includes(w))) hits.add(t.id); } }
  const allProjects = [...new Map([...St.tasks.values()].map(t => projKeyLabel(t))).entries()].sort((a, b) => (a[0] === 'p:~') - (b[0] === 'p:~') || a[1].localeCompare(b[1]));
  const sugN = [...St.tasks.values()].filter(t => t.placement && t.placement.status === 'suggested').length;
  const sel = UI.mapSel;
  const selSet = new Set(); if (sel) { selSet.add(sel); const t = St.tasks.get(sel); relIds(t || {}).forEach(x => selSet.add(x)); for (const x of St.tasks.values()) if (relIds(x).includes(sel)) selSet.add(x.id); }
  const act = UI.mapActivity ? activityList() : [];
  return `<div class="map-wrap">
    ${sugN ? callout('info', `<div class="row"><span>❓ Claude wasn’t sure where ${sugN} task${sugN > 1 ? 's belong' : ' belongs'}. Pick the right place from its suggestions.</span><span class="spacer"></span><button class="btn sm primary" data-act="map-next-suggest">Review</button></div>`) : ''}
    <div class="map-toolbar">
      <div class="map-projects" role="toolbar" aria-label="Projects">
        <button class="mp-chip ${UI.mapFocus === 'all' ? 'on' : ''}" data-act="map-focus" data-pk="all">🌐 All projects</button>
        ${allProjects.map(([k, l]) => `<button class="mp-chip ${UI.mapFocus === k ? 'on' : ''}" data-act="map-focus" data-pk="${esc(k)}">${k === 'p:~' ? '🗂️' : projBadge(l, 'xs')}<span dir="auto">${esc(l)}</span></button>`).join('')}
      </div>
      <div class="row map-tools">
        <label class="search todo-search">${I.search}<span class="sr">Find on map</span><input class="input" id="map-q" type="search" placeholder="Find a task or item…" value="${esc(UI.mapQ)}" data-inp="mapQ"></label>
        ${hits ? `<span class="small muted">${hits.size} found</span>` : ''}
        <label class="check small"><input type="checkbox" id="map-done" data-chg="map-opt" data-key="mapShowDone" ${UI.mapShowDone ? 'checked' : ''}>Completed (history)</label>
        <label class="check small"><input type="checkbox" id="map-act" data-chg="map-opt" data-key="mapActivity" ${UI.mapActivity ? 'checked' : ''}>Activity</label>
        <div class="seg zoom"><button data-act="map-zoom" data-z="-1" aria-label="Zoom out">−</button><button data-act="map-fit" aria-label="Fit to screen">Fit</button><button data-act="map-zoom" data-z="1" aria-label="Zoom in">+</button></div>
      </div>
    </div>
    <div class="map-body ${UI.mapActivity ? 'with-act' : ''}">
      <div class="map-viewport" id="map-vp" tabindex="0" aria-label="Task map. Drag to move around, scroll or pinch to zoom.">
        ${M.projects.length ? `<div class="map-world" id="map-world" style="width:${M.w}px;height:${M.h}px;transform:translate(${UI.map.x}px,${UI.map.y}px) scale(${UI.map.k})">
          <svg class="map-edges" width="${M.w}" height="${M.h}" aria-hidden="true">
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="arrowhead"/></marker></defs>
            ${M.edges.map(e => `<path class="edge ${e.b.type === 'task' && e.b.t.status === 'done' ? 'done' : ''}" style="--h:${e.hue}" d="${edgePath(e.a, e.b)}"/>`).join('')}
            ${M.links.map(l => `<path class="link ${selSet.has(l.from.t.id) && selSet.has(l.to.t.id) && sel && (l.from.t.id === sel || l.to.t.id === sel) ? 'hot' : ''}" d="${linkPath(l.from, l.to)}" marker-end="url(#arrow)"/>`).join('')}
          </svg>
          ${M.nodes.map(n => mapNodeHTML(n, hits)).join('')}
        </div>` : `<div class="empty"><div class="big-emoji">🧠</div><h3>Your map is empty</h3><p>Approved tasks appear here, branching from projects and categories.</p><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button></div>`}
        <div class="map-hint">Drag to move · scroll or pinch to zoom · drag a task onto a project, topic or another task to move or link it</div>
      </div>
      ${UI.mapActivity ? `<aside class="map-activity"><div class="label" style="padding:12px 14px 6px">Activity</div>${act.length ? `<ol>${act.map(e => `<li><button data-act="map-goto" data-id="${esc(e.t.id)}"><span class="ae">${evEmoji(e.text)}</span><span class="atxt"><b>${esc(e.t.ref || '')}</b> <span dir="auto">${esc(E.clip(e.t.title, 60))}</span><small dir="auto">${esc(e.text)}</small></span><time>${esc(fmtDate(e.at.slice(0, 10)))}</time></button></li>`).join('')}</ol>` : '<p class="small muted" style="padding:0 14px">No activity yet.</p>'}</aside>` : ''}
    </div>
  </div>`;
}
/* --- camera --- */
function applyCam(animate) {
  const w = $('#map-world'); if (!w) return;
  w.classList.toggle('anim', !!animate);
  w.style.transform = `translate(${UI.map.x}px,${UI.map.y}px) scale(${UI.map.k})`;
}
function mapFit(smart) {
  const vp = $('#map-vp'), M = UI.mapLayout; if (!vp || !M) return;
  const W = vp.clientWidth, H = vp.clientHeight;
  const fitK = Math.min(1, (W - 40) / M.w, (H - 60) / M.h);
  const k = smart === true ? Math.max(W < 600 ? 0.5 : 0.6, Math.min(1, fitK)) : Math.max(0.25, fitK);
  UI.map.k = k;
  UI.map.x = M.w * k <= W ? (W - M.w * k) / 2 : 16;
  if (M.h * k <= H) UI.map.y = (H - M.h * k) / 2;
  else { const r = M.nodes.find(n => n.type === 'root'); UI.map.y = H / 2 - (r ? r.y + r.h / 2 : 0) * k; }
  UI.map.fitted = true; applyCam(true);
}
function mapZoom(f, cx, cy) {
  const vp = $('#map-vp'); if (!vp) return;
  const r = vp.getBoundingClientRect(); cx = cx ?? r.width / 2; cy = cy ?? r.height / 2;
  const k2 = Math.max(0.25, Math.min(2.2, UI.map.k * f));
  UI.map.x = cx - (cx - UI.map.x) * (k2 / UI.map.k); UI.map.y = cy - (cy - UI.map.y) * (k2 / UI.map.k); UI.map.k = k2; applyCam(false);
}
function centerOnTask(id) {
  const t = St.tasks.get(id); if (!t) return;
  let changed = false;
  if (t.status === 'done' && !UI.mapShowDone) { UI.mapShowDone = true; changed = true; }
  const [pk] = projKeyLabel(t); if (UI.mapFocus !== 'all' && UI.mapFocus !== pk) { UI.mapFocus = 'all'; changed = true; }
  for (const k of [pk, 'tp:' + pk + ':' + (topicOf(t) ? E.normMatch(topicOf(t)) : '~'), 'root']) if (UI.mapCollapsed.delete(k)) changed = true;
  UI.mapSel = id;
  if (UI.view !== 'todo' || UI.todoMode !== 'map') { UI.todoMode = 'map'; saveTodoPrefs(); if (UI.view !== 'todo') { UI.view = 'todo'; closeDrawer(); } }
  render();
  requestAnimationFrame(() => {
    const vp = $('#map-vp'), n = UI.mapLayout && UI.mapLayout.nodes.find(x => x.id === 't:' + id); if (!vp || !n) return;
    UI.map.k = Math.max(UI.map.k, 0.85);
    UI.map.x = vp.clientWidth / 2 - (n.x + n.w / 2) * UI.map.k; UI.map.y = vp.clientHeight / 2 - (n.y + n.h / 2) * UI.map.k; applyCam(true);
    vp.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
function afterMapRender() {
  const vp = $('#map-vp'); if (!vp) return;
  if (!UI.map.fitted) requestAnimationFrame(() => mapFit(true));
  vp.addEventListener('wheel', e => { e.preventDefault(); const r = vp.getBoundingClientRect(); mapZoom(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
}
/* --- pointer: pan, pinch, click, drag-to-move/link --- */
const MP = { ptrs: new Map(), start: null, mode: null, node: null, ghost: null, pinch: null };
document.addEventListener('pointerdown', e => {
  const vp = e.target.closest && e.target.closest('#map-vp'); if (!vp || e.button > 0) return;
  if (e.target.closest('button,a,input,.map-hint')) { if (!e.target.closest('.mnode')) return; }
  MP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (MP.ptrs.size === 2) { const [a, b] = [...MP.ptrs.values()]; MP.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: UI.map.k }; MP.mode = 'pinch'; return; }
  MP.start = { x: e.clientX, y: e.clientY, mx: UI.map.x, my: UI.map.y }; MP.mode = 'press'; MP.node = e.target.closest('.mnode'); MP.target = e.target;
  vp.setPointerCapture && vp.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', e => {
  if (!MP.ptrs.has(e.pointerId)) return;
  MP.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const vp = $('#map-vp'); if (!vp) return;
  if (MP.mode === 'pinch' && MP.ptrs.size === 2) { const [a, b] = [...MP.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const r = vp.getBoundingClientRect(); mapZoom((MP.pinch.k * d / MP.pinch.d) / UI.map.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top); return; }
  if (!MP.start) return;
  const dx = e.clientX - MP.start.x, dy = e.clientY - MP.start.y;
  if (MP.mode === 'press' && Math.hypot(dx, dy) > 6) {
    if (MP.node && MP.node.dataset.type === 'task') { MP.mode = 'drag'; MP.ghost = MP.node.cloneNode(true); MP.ghost.classList.add('ghost'); document.body.appendChild(MP.ghost); MP.node.classList.add('dragging'); }
    else MP.mode = 'pan';
  }
  if (MP.mode === 'pan') { UI.map.x = MP.start.mx + dx; UI.map.y = MP.start.my + dy; applyCam(false); }
  if (MP.mode === 'drag') {
    MP.ghost.style.left = (e.clientX + 8) + 'px'; MP.ghost.style.top = (e.clientY + 8) + 'px'; MP.ghost.style.transform = `scale(${Math.min(1, UI.map.k)})`;
    document.querySelectorAll('.mnode.drop').forEach(n => n.classList.remove('drop'));
    const over = dropTarget(e); if (over) over.classList.add('drop');
  }
}, { passive: true });
function dropTarget(e) {
  if (MP.ghost) MP.ghost.style.display = 'none';
  const el = document.elementFromPoint(e.clientX, e.clientY);
  if (MP.ghost) MP.ghost.style.display = '';
  const n = el && el.closest && el.closest('.mnode');
  if (!n || n === MP.node || !['project', 'topic', 'task'].includes(n.dataset.type)) return null;
  return n;
}
function endPointer(e) {
  if (!MP.ptrs.has(e.pointerId)) return;
  MP.ptrs.delete(e.pointerId);
  if (MP.mode === 'pinch') { if (MP.ptrs.size === 0) MP.mode = null; return; }
  const mode = MP.mode, node = MP.node, target = MP.target; MP.mode = null; MP.start = null;
  if (mode === 'drag') {
    const over = e.type === 'pointerup' ? dropTarget(e) : null;
    MP.ghost && MP.ghost.remove(); MP.ghost = null; node && node.classList.remove('dragging');
    document.querySelectorAll('.mnode.drop').forEach(n => n.classList.remove('drop'));
    if (over) mapDrop(node.dataset.tid, over);
    return;
  }
  if (mode !== 'press' || e.type !== 'pointerup') return;
  // click
  if (!node) { return; }
  const kind = node.dataset.type, btn = target && target.closest && target.closest('[data-map]');
  if (node.dataset.node === 'root') { mapFit(); return; }
  if (kind === 'project' && btn && btn.dataset.map === 'focus') { UI.mapFocus = node.dataset.pk; UI.map.fitted = false; render(); return; }
  if (kind === 'project' || kind === 'topic') { const id = node.dataset.node; UI.mapCollapsed.has(id) ? UI.mapCollapsed.delete(id) : UI.mapCollapsed.add(id); render(); return; }
  if (kind === 'item') { toggleSub(node.dataset.tid, node.dataset.sid); render(); return; }
  if (kind === 'task') {
    const id = node.dataset.tid;
    if (btn && btn.dataset.map === 'tick') { ACT['toggle-done']({ dataset: { id } }); return; }
    if (btn && btn.dataset.map === 'items') { UI.mapItems.has(id) ? UI.mapItems.delete(id) : UI.mapItems.add(id); render(); return; }
    UI.mapSel = id; render(); openDrawer('task', id);
  }
}
document.addEventListener('pointerup', endPointer);
document.addEventListener('pointercancel', endPointer);
document.addEventListener('dblclick', e => { if (e.target.closest && e.target.closest('#map-vp') && !e.target.closest('.mnode')) mapFit(); });
function mapDrop(tid, over) {
  const t0 = St.tasks.get(tid); if (!t0) return;
  const prev = clone(t0); const t = clone(t0); const now = nowISO(); let msg = '';
  if (over.dataset.type === 'task') {
    const oid = over.dataset.tid; if (oid === tid) return;
    if (relIds(t).includes(oid)) { toast('Already linked.'); return; }
    t.relatedIds = [...relIds(t), oid];
    const o = St.tasks.get(oid);
    (t.history = t.history || []).push({ at: now, text: `Linked to ${o ? o.ref : 'task'} (on the map)` });
    msg = `🔗 ${t.ref} linked to ${o ? o.ref : 'task'}.`;
  } else {
    const label = over.dataset.type === 'project' ? over.dataset.label : over.dataset.plabel;
    const newProj = label === 'No project' ? '' : label;
    const notes = [];
    if ((t.project || '') !== newProj) { notes.push(`Project: ${t.project || '—'} → ${newProj || '—'}`); t.project = newProj; t.projectLocked = true; }
    if (over.dataset.type === 'topic') { const tp = over.dataset.topic || ''; if (topicOf(t) !== tp) { notes.push(`Topic: ${topicOf(t) || '—'} → ${tp || '—'}`); t.topic = tp; t.topicLocked = true; } }
    if (!notes.length) return;
    if (t.placement) t.placement = { ...t.placement, status: 'confirmed' };
    (t.history = t.history || []).push({ at: now, text: 'Moved on the map — ' + notes.join('; ') });
    msg = `🧭 ${t.ref} moved.`;
  }
  putTask(t); UI.mapSel = tid; render();
  toast(msg, { action: 'Undo', fn: () => { putTask(prev); render(); } });
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
      <div class="row">${a.category ? `<span class="chip accent">${esc(CATEGORY[a.category] || a.category)}</span>` : ''}${a.project ? `<span class="chip proj">${esc(a.project)}</span>` : ''}<span class="small muted">${esc(fmtDateTime(e.date || e.importedAt))}</span><span class="spacer"></span><button class="btn ghost sm" data-act="open-email" data-id="${esc(e.id)}">${I.mail} Email</button></div>
      <div class="subj" dir="auto">${esc(e.subject || '(no subject)')}</div>
      <div class="small muted" dir="auto">From ${esc(e.from || 'unknown')}</div>
      ${a.summary ? `<p style="margin:2px 0 0" dir="auto">${esc(a.summary)}</p>` : ''}
    </div>
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
    <label class="check" style="padding-top:2px"><input type="checkbox" id="u-acc-${esc(u.uid)}" data-chg="upd" data-eid="${esc(e.id)}" data-uid="${esc(u.uid)}" ${u.accept ? 'checked' : ''}><span class="sr">Apply</span></label>
    <div class="body"><div><span class="chip wait">Update to existing task</span></div>
      <div><span class="mono">${esc(t.ref)}</span> <b dir="auto">${esc(t.title)}</b></div>
      <div class="small">${what}${u.note ? ` — <span dir="auto">${esc(u.note)}</span>` : ''}</div>
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
  return (c !== null && c !== undefined && c < 0.7 && opts.length) ? { status: 'suggested', confidence: c, options: opts } : { status: 'auto', confidence: c ?? null };
}
function approveEmail(eid, quiet) {
  const e = clone(St.emails.get(eid)); if (!e) return;
  const a = e.analysis || {}; const now = nowISO();
  const chosen = (a.tasks || []).filter(p => p.accept);
  const creates = chosen.filter(p => !(p.dupOf && p.merge !== false && St.tasks.has(p.dupOf)));
  const refs = nextRefs(creates.length); let ri = 0, added = 0, updated = 0;
  const label = `email “${E.clip(e.subject || '(no subject)', 70)}”`;
  for (const p of chosen) {
    const ev = (p.evidence || []).map(x => ({ ...x, emailId: e.id }));
    if (p.dupOf && p.merge !== false && St.tasks.has(p.dupOf)) {
      const t = clone(St.tasks.get(p.dupOf));
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
        createdAt: now, updatedAt: now, completedAt: null, confidence: p.confidence, history: [{ at: now, text: `Created from ${label}`, emailId: e.id }],
      };
      putTask(t); added++;
    }
  }
  for (const u of (a.updates || []).filter(u => u.accept)) {
    const t0 = St.tasks.get(u.taskId); if (!t0) continue;
    const t = clone(t0); const notes = [];
    if (u.newStatus && u.newStatus !== t.status) { notes.push(`status ${STATUS[t.status]} → ${STATUS[u.newStatus]}`); t.status = u.newStatus; t.completedAt = u.newStatus === 'done' ? now : null; }
    if (u.newDeadline && u.newDeadline !== t.deadline) { notes.push(`deadline → ${fmtDate(u.newDeadline)}`); t.deadline = u.newDeadline; t.deadlineBasis = 'explicit'; }
    if (u.note) notes.push(u.note);
    t.evidence = [...(t.evidence || []), ...(u.evidence || []).map(x => ({ ...x, emailId: e.id }))].slice(-20);
    t.emailIds = [...new Set([...(t.emailIds || []), e.id])];
    (t.history = t.history || []).push({ at: now, text: `From ${label}: ${notes.join('; ') || 'updated'}`, emailId: e.id });
    putTask(t); updated++;
  }
  e.reviewState = 'reviewed'; e.reviewedAt = now; putEmail(e);
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
    ${!aiOK && St.capsResolved ? callout('warn', DESKTOP ? '<p><b>Claude analysis is not set up yet.</b> Add your Anthropic API key in Setup › Connections. <button class="btn sm" data-act="nav" data-view="setup">Open Setup</button></p>' : '<p><b>Claude analysis is not available in this view.</b> Open this page inside Claude while signed in, and choose Allow when asked.</p>') : ''}
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
    <div id="staging">${stagingHTML()}</div>
    ${UI.staging.length ? `<div class="card pad action-bar"><div class="row">${UI.analyzing ? `<button class="btn" data-act="stop">Stop</button><span class="small muted">Analysing… keep this page open.</span>` : `${ready.length ? `<button class="btn primary" data-act="analyze" ${aiOK ? '' : 'disabled'}>${I.spark} Analyse ${ready.length} email${ready.length === 1 ? '' : 's'}</button>` : ''}<button class="btn ${ready.length ? 'ghost' : ''}" data-act="clear-staging">${ready.length ? 'Clear list' : 'Clear finished'}</button>`}<span class="spacer"></span><button class="btn ghost sm" data-act="nav" data-view="setup">Analysis options</button></div></div>` : ''}
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
const ATT_STATUS = { text: ['Text read', 'ok'], vision: ['As images', 'med'], mixed: ['Text + images', 'ok'], unreadable: ['Not readable', 'crit'], unsupported: ['Not supported', 'warn'], skipped: ['Skipped', ''], container: ['Archive', ''], excluded: ['Not sent', ''] };
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
    const stateChip = { parsing: '<span class="chip">Reading files…</span>', ready: b.skip ? '<span class="chip">Skipped</span>' : '<span class="chip accent">Ready</span>', analyzing: '<span class="chip accent">Analysing…</span>', done: '<span class="chip ok">Analysed</span>', error: '<span class="chip crit">Failed</span>' }[b.state];
    return `<div class="bundle">
      <div class="bundle-h"><div style="min-width:0">
        ${b.source === 'docs' ? `<div class="subj">Documents without an email</div><div class="meta">Analysed together as one item. Use “Move to…” to attach a file to an email instead.</div>` :
        `<div class="subj" dir="auto">${esc(em.subject || '(no subject)')}</div><div class="meta" dir="auto">${esc(em.from || 'Sender unknown')}${em.date ? ' · ' + esc(fmtDateTime(em.date)) : ''}${b.fileName ? ' · ' + esc(b.fileName) : ''}</div>`}
      </div><div class="row" style="align-items:flex-start">${stateChip}${b.state !== 'analyzing' ? `<button class="icon-btn" data-act="remove-bundle" data-id="${esc(b.id)}" aria-label="Remove">${I.x}</button>` : ''}</div></div>
      ${b.dupEmailId && b.state === 'ready' ? `<div style="padding:10px 14px 0">${callout('info', `<div class="row"><span>Already imported on ${esc(fmtDate(St.emails.get(b.dupEmailId)?.importedAt))}.</span><label class="check small"><input type="checkbox" id="skip-${esc(b.id)}" data-chg="skip" data-bid="${esc(b.id)}" ${b.skip ? '' : 'checked'}>Analyse again</label></div>`)}</div>` : ''}
      ${b.state === 'analyzing' ? `<div style="padding:10px 14px;display:grid;gap:6px"><div class="progress indet"><i></i></div><div class="small muted">${esc(b.progress || 'Sending to Claude…')}</div></div>` : ''}
      ${b.state === 'error' ? `<div style="padding:10px 14px">${callout('crit', `<p>${esc(b.error)}</p>`)}</div>` : ''}
      ${b.state === 'done' ? `<div style="padding:10px 14px">${callout('ok', `<div class="row"><span>${esc(b.doneText || 'Analysed.')}</span><span class="spacer"></span><button class="btn sm" data-act="nav" data-view="review">Review</button></div>`)}</div>` : ''}
      ${b.state === 'done' ? '' : `${(b.warnings || []).length ? `<div style="padding:10px 14px 0">${callout('warn', b.warnings.map(w => `<p>${esc(w)}</p>`).join(''))}</div>` : ''}
      ${b.source !== 'docs' && em.body ? `<details class="more" style="padding:8px 14px"><summary>Email text (${em.body.length.toLocaleString()} characters)</summary><div class="bodytext" style="margin-top:8px">${esc(E.clip(em.body, 12000))}</div></details>` : ''}
      ${b.atts.length ? b.atts.map(a => attRow(b, a)).join('') : `<div class="att"><span></span><div class="note">No attachments.</div><span></span></div>`}`}
    </div>`;
  }).join('')}</div>`;
}
function rerenderStaging() { const n = $('#staging'); if (n && UI.view === 'import') keepFocus(() => { n.innerHTML = stagingHTML(); }); if (UI.view === 'import') { const btnRow = document.querySelector('[data-act="analyze"]'); if (btnRow || UI.analyzing) scheduleRender(); } }

/* ----- file intake ----- */
const mkAtt = o => ({ id: E.uid('a'), name: o.name, mime: o.mime || E.guessMime(o.name), size: o.size ?? (o.bytes ? o.bytes.length : 0), bytes: o.bytes || null, email: o.email || null, inline: !!o.inline, include: true, res: null, extracting: false });
async function intakeFiles(fileList, target) {
  const files = [...fileList];
  if (!files.length) return;
  const loose = [];
  const newBundles = [];
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const kind = E.kindOf(f.name, f.type);
    if (!target && (kind === 'eml' || kind === 'msg')) {
      try { const em = await parseEmailFile(bytes, kind); newBundles.push(await bundleFromEmail(em, kind, f.name)); }
      catch (e) { toast(`${f.name}: could not be opened as an email (${e.message || 'damaged file'}).`, { err: true }); }
    } else if (!target && kind === 'zip') {
      try {
        const JSZip = await E.need('jszip'); const zip = await JSZip.loadAsync(bytes);
        for (const zf of Object.values(zip.files)) {
          if (zf.dir || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(zf.name)) continue;
          const zb = await zf.async('uint8array'); const nm = zf.name.split('/').pop(); const zk = E.kindOf(nm, '');
          if (zk === 'eml' || zk === 'msg') { try { newBundles.push(await bundleFromEmail(await parseEmailFile(zb, zk), zk, f.name + ' › ' + nm)); } catch { loose.push({ name: f.name + ' › ' + nm, bytes: zb }); } }
          else loose.push({ name: f.name + ' › ' + nm, bytes: zb });
        }
      } catch (e) { toast(`${f.name}: ${e.message || 'could not open ZIP'}`, { err: true }); }
    } else loose.push({ name: f.name, bytes, mime: f.type });
  }
  UI.staging.push(...newBundles);
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
  if (kind === 'zip' && a.bytes && depth < 3) {
    try {
      const JSZip = await E.need('jszip'); const zip = await JSZip.loadAsync(a.bytes);
      for (const zf of Object.values(zip.files)) { if (zf.dir || /(^|\/)(__MACOSX|\.DS_Store)/.test(zf.name)) continue; await addAttTo(b, { name: zf.name.split('/').pop(), bytes: await zf.async('uint8array') }, prefix + a.name + ' › ', depth + 1); }
      return;
    } catch { /* fall through and show as unreadable */ }
  }
  b.atts.push(mkAtt({ ...a, name: prefix + a.name }));
}
function checkDuplicateEmail(b) {
  const em = b.email; if (b.source === 'docs') return;
  const key = E.normSubject(em.subject).toLowerCase();
  for (const e of St.emails.values()) {
    if ((em.messageId && e.messageId === em.messageId) || (key && E.normSubject(e.subject).toLowerCase() === key && e.fromEmail === em.fromEmail && e.date && em.date && Math.abs(new Date(e.date) - new Date(em.date)) < 60000)) { b.dupEmailId = e.id; b.skip = true; return; }
  }
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
async function runAnalysis() {
  if (UI.analyzing || !St.sample) return;
  UI.analyzing = true; render();
  const queue = UI.staging.filter(b => b.state === 'ready' && !b.skip);
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
    } catch (e) {
      if (e && e.code === 'cancelled') { b.state = 'ready'; break; }
      b.state = 'error'; b.error = aiErrorText(e);
      if (e && ['not_granted', 'sampling_disabled', 'rate_limited', 'session_expired', 'auth_failed', 'billing', 'model_not_found'].includes(e.code)) { rerenderStaging(); break; }
    }
    rerenderStaging();
  }
  for (const b of UI.staging) if (b.state === 'error') { /* keep for retry */ }
  UI.analyzing = false; UI.abort = null;
  render();
  if (ok) toast(`${ok} email${ok > 1 ? 's' : ''} analysed.`, { action: 'Review', fn: () => go('review') });
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
  const related = E.relatedOpenTasks([...St.tasks.values()], em, tk).map(t => ({ id: t.id, ref: t.ref, title: t.title, project: t.project, discipline: t.discipline, owner: t.ownership === 'mine' ? 'me' : t.owner, status: t.status, deadline: t.deadline }));
  const budget = ((St.limits && St.limits.maxPromptBytes) || 262144) - 10000;
  const { prompt, truncations } = E.buildPrompt({
    me: s.me, projects: allProjects(), topics: allTopics(), today: E.todayISO(), tz: TZ,
    email: { subject: masker.mask(em.subject), from: masker.mask(em.from), to: masker.mask(em.to), cc: masker.mask(em.cc), date: em.date, forwardedBy: masker.mask(em.forwardedBy || ''), forwardedAt: em.forwardedAt || '', forwardMode: em.forwardMode || '', body: masker.mask(em.body || (b.source === 'docs' ? '(No email — the user shared these documents directly. Identify what they require from the user, if anything.)' : '')) },
    attachments: atts, images: images.map(i => ({ key: i.key, label: i.label })), openTasks: related, budget,
  });
  onProgress('Waiting for Claude… (consent, queue and thinking can take a minute)');
  const raw = await St.sample.json(prompt, {
    signal, modelTier: s.tier === 'default' ? 'default' : 'complex', cache: b.fresh ? false : undefined,
    ...(images.length ? { images: images.map(i => i.blob) } : {}),
    onText: ({ text }) => onProgress(`Receiving results… ${Math.round(text.length / 100) / 10}k characters`),
  });
  const an = E.normalizeAnalysis(raw, { unmask: masker.unmask });
  // local verification + flags
  const flags = [];
  b.atts.forEach((a, i) => {
    const r = a.res || {}; const key = 'A' + (i + 1);
    if (!a.include && r.status && !['skipped', 'container'].includes(r.status)) flags.push({ kind: ['unreadable', 'unsupported'].includes(r.status) ? 'unreadable' : 'excluded', detail: r.note || 'Not sent for analysis.', source: key, local: true });
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
  an.flags = all; an.keyMap = keyMap; an.analyzedAt = nowISO(); an.tier = s.tier; an.imagesSent = images.length; an.masked = !!s.mask;
  // email record
  const id = b.recordId || E.uid('e');
  const rec = {
    id, threadKey: tk, subject: b.source === 'docs' ? 'Documents: ' + b.atts.map(a => a.name).slice(0, 3).join(', ') + (b.atts.length > 3 ? ` +${b.atts.length - 3}` : '') : (em.subject || ''), from: em.from || '', fromEmail: em.fromEmail || '', to: em.to || '', cc: em.cc || '', date: em.date || '',
    messageId: em.messageId || '', convIndex: em.convIndex || '', source: b.source, fileName: b.fileName || '', importedAt: b.importedAt || nowISO(),
    snippet: E.clip((em.body || '').replace(/\s+/g, ' '), 280),
    attachments: b.atts.map(a => ({ name: a.name, kindLabel: (a.res && a.res.kindLabel) || 'File', size: a.size || 0, status: a.include ? ((a.res && a.res.status) || 'unknown') : 'excluded', note: (a.res && a.res.note) || '', pages: (a.res && a.res.pages) || null, images: (a.res && a.res.images && a.include) ? a.res.images.length : 0, textLen: (a.res && a.res.text || '').length })),
    analysis: an, reviewState: 'pending', hasText: !!s.storeText,
    gmailId: b.gmailId || '', gmailUrl: b.gmailUrl || '', forwardedBy: em.forwardedBy || '', forwardMode: em.forwardMode || '',
  };
  if (s.storeText) await saveTexts(id, em.body || '', b.atts.map(a => ({ name: a.name, include: a.include, status: a.res && a.res.status, kindLabel: a.res && a.res.kindLabel, note: a.res && a.res.note, text: (a.res && a.res.text) || '' })));
  putEmail(rec);
  if (b.gmailId) { markSeen(b.gmailId, id); labelImported(b.gmailId); }
  return rec;
}
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
async function labelImported(msgId) {
  if (!msgId || !gmCfg().label || !St.mcp) return;
  try { const id = await ensureLabel(); if (id) await gmCall('label_message', { messageId: msgId, labelIds: [id] }); }
  catch (e) { if (e && e.code === 'not_in_manifest') return; }
}
const hasAddr = (m, addr) => [...(m.toRecipients || []), ...(m.ccRecipients || []), ...(m.bccRecipients || [])].some(r => String(r).toLowerCase().includes(addr));
function gmQuery(g) {
  const parts = [`to:(${g.address.trim()})`, `newer_than:${Math.max(1, Math.min(365, +g.days || 14))}d`];
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
        cands.push(m);
      }
    }
    cands.sort((a, b) => (a.internalDate || a.date || '').localeCompare(b.internalDate || b.date || ''));
    for (const m of cands.slice(0, 15)) {
      GM.status = 'checking'; GM.error = `Downloading ${added + 1} of ${Math.min(cands.length, 15)}…`; render();
      let b;
      try {
        const raw = payloadOf(await gmCall('get_message', { messageId: m.id, messageFormat: 'RAW' })).raw;
        if (!raw) throw { code: 'tool_error', message: 'empty message' };
        const em = E.unwrapForward(E.parseEml(E.b64urlToBytes(raw)));
        b = await bundleFromEmail(em, 'gmail', 'Forwarded · Gmail');
      } catch (e) {
        if (e && ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'approval_required', 'consent_required', 'blocked_by_policy', 'selection_required'].includes(e.code)) throw e;
        // fallback: text only
        try {
          const pm = payloadOf(await gmCall('get_message', { messageId: m.id, messageFormat: 'PLAIN_TEXT' }));
          const em = E.unwrapForward({ subject: pm.subject || '', from: pm.sender || '', fromEmail: E.firstEmail(pm.sender || ''), to: (pm.toRecipients || []).join('; '), cc: (pm.ccRecipients || []).join('; '), date: pm.date || '', messageId: '', inReplyTo: '', references: '', convIndex: '', body: E.tidyText(pm.plaintextBody || pm.snippet || ''), attachments: [], warnings: [] });
          b = await bundleFromEmail(em, 'gmail', 'Forwarded · Gmail (text only)');
          const names = (pm.attachments || []).map(a => a.filename || a.name).filter(Boolean);
          b.warnings.push(`The full message could not be downloaded (it may be too large), so its attachments were not read${names.length ? ': ' + names.join(', ') : ''}. Save the original from Outlook and add it here instead.`);
        } catch { continue; }
      }
      b.gmailId = m.id; b.gmailUrl = m.viewUrl || '';
      UI.staging.push(b); checkDuplicateEmail(b); added++;
    }
    GM.status = 'idle'; GM.error = ''; GM.lastChecked = nowISO(); GM.newCount = added;
    if (manual || added) toast(added ? `${added} forwarded email${added > 1 ? 's' : ''} downloaded from Gmail.` : 'No new forwarded emails.', added ? { action: 'Show', fn: () => go('import') } : {});
  } catch (e) {
    GM.status = 'error'; GM.error = mcpErrorText(e);
    if (manual) toast(GM.error, { err: true });
  } finally { GM.busy = false; render(); }
  if (added) {
    await extractPending();
    if (gmCfg().autoAnalyse && St.sample && !UI.analyzing) runAnalysis();
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
  if (UI.drawer && UI.drawer.kind === 'email' && UI.drawer.id === id) { const el = $('#drawer'); const e = St.emails.get(id); if (e) { const sc = el.querySelector('.drawer-b')?.scrollTop; el.innerHTML = emailDrawerHTML(e); const b = el.querySelector('.drawer-b'); if (b && sc) b.scrollTop = sc; } }
}
function emailDrawerHTML(e) {
  const a = e.analysis || {};
  const tx = textsCache.get(e.id);
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).includes(e.id));
  const attText = name => tx && tx !== 'loading' ? ((tx.atts || []).find(x => x.name === name) || {}).text : null;
  return `<div class="drawer-h"><span class="label">Email</span><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b">
    <div style="display:grid;gap:4px"><h2 style="font-size:20px" dir="auto">${esc(e.subject || '(no subject)')}</h2>
      <dl class="kv">${e.from ? `<dt>From</dt><dd dir="auto">${esc(e.from)}</dd>` : ''}${e.to ? `<dt>To</dt><dd dir="auto">${esc(e.to)}</dd>` : ''}${e.cc ? `<dt>Cc</dt><dd dir="auto">${esc(e.cc)}</dd>` : ''}<dt>Sent</dt><dd>${esc(fmtDateTime(e.date) || 'unknown')}</dd><dt>Imported</dt><dd>${esc(fmtDateTime(e.importedAt))}${e.fileName ? ' · ' + esc(e.fileName) : ''}</dd>${e.forwardedBy ? `<dt>Forwarded by</dt><dd dir="auto">${esc(e.forwardedBy)}${e.forwardMode === 'inline' ? ' <span class="small muted">(original header read from the forwarded text)</span>' : ''}</dd>` : ''}</dl>${/^https:\/\/mail\.google\.com\//.test(e.gmailUrl || '') ? `<a class="btn ghost sm" style="justify-self:start" href="${esc(e.gmailUrl)}" target="_blank" rel="noopener">${I.mail} Open in Gmail</a>` : ''}</div>
    ${a.summary ? `<div><div class="label" style="margin-bottom:4px">Summary</div><p style="margin:0" dir="auto">${esc(a.summary)}</p>${a.actionRequired === false ? `<p class="small" style="margin:6px 0 0"><span class="chip ok">No action for you</span> ${esc(a.noActionReason || '')}</p>` : ''}</div>` : ''}
    ${(a.flags || []).length ? callout('warn', `<ul style="margin:0">${a.flags.map(f => `<li><b>${esc(FLAG[f.kind] || f.kind)}</b>${f.source ? ` <span class="mono">(${esc(srcName(e, f.source))})</span>` : ''}: ${esc(f.detail)}</li>`).join('')}</ul>`) : ''}
    ${tasks.length ? `<div><div class="label" style="margin-bottom:6px">Tasks from this email</div><div class="register">${tasks.map(taskRow).join('')}</div></div>` : ''}
    <div><div class="label" style="margin-bottom:6px">Attachments</div>${(e.attachments || []).length ? `<div class="register">${e.attachments.map((x, i) => {
      const st = ATT_STATUS[x.status] || [x.status, ''];
      const t = attText(x.name); const pk = `em:${e.id}:${i}`;
      return `<div class="att"><span>${I.file}</span><div style="min-width:0"><div class="name" dir="auto">${esc(x.name)}</div><div class="note">${esc([x.kindLabel, x.pages ? x.pages + ' p.' : '', x.images ? x.images + ' image(s) sent' : '', x.size ? fmtBytes(x.size) : ''].filter(Boolean).join(' · '))}${x.note ? ' — ' + esc(x.note) : ''}</div></div>
        <div class="att-side"><span class="chip ${st[1]}">${esc(st[0])}</span>${t ? `<button class="btn ghost sm" data-act="preview" data-key="${esc(pk)}">${UI.previews.has(pk) ? 'Hide' : 'Text'}</button>` : ''}</div>
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
    <section class="card pad"><div class="section-title"><h2>You</h2></div>
      <div class="grid2">
        <label class="field"><span>Name</span><input class="input" id="s-name" value="${esc(me.name || '')}" placeholder="${esc(St.profileName || 'Your name')}"></label>
        <label class="field"><span>Work email address(es), comma-separated</span><input class="input" id="s-emails" value="${esc(me.emails.join(', '))}"></label>
        <label class="field"><span>Other names people use (initials, nickname, Arabic spelling)</span><input class="input" id="s-aliases" value="${esc(me.aliases)}" dir="auto"></label>
        <label class="field"><span>Role</span><input class="input" id="s-role" value="${esc(me.role)}"></label>
        <label class="field"><span>Company / team</span><input class="input" id="s-org" value="${esc(me.org)}"></label>
        <label class="field"><span>What you are responsible for</span><input class="input" id="s-scope" value="${esc(me.scope)}" placeholder="e.g. pumps, blowers, valves, piping, mechanical submittals"></label>
      </div>
      <label class="field"><span>Projects — one per line: CODE | Name | other names</span><textarea class="input" id="s-projects" rows="4" placeholder="ELM | El Mahsama WWTP Expansion | Mahsama, EM-WWTP" dir="auto">${esc(projText)}</textarea></label>
      <div class="row end"><button class="btn primary" data-act="save-setup">Save</button></div>
    </section>
    <section class="card pad"><div class="section-title"><h2>Forwarding inbox</h2></div>
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
    <section class="card pad"><div class="section-title"><h2>Analysis</h2></div>
      <div class="grid2">
        <label class="check"><input type="checkbox" id="o-vision" data-chg="opt" data-key="vision" ${s.vision ? 'checked' : ''}><span>Send images of scanned pages and photos<br><span class="small muted">Needed for scans, photos and marked-up prints.</span></span></label>
        <label class="check"><input type="checkbox" id="o-draw" data-chg="opt" data-key="drawings" ${s.drawings ? 'checked' : ''}><span>Send images of drawing sheets (A3 and larger)<br><span class="small muted">Lets Claude see revision clouds and the title block.</span></span></label>
        <label class="check"><input type="checkbox" id="s-mask" data-chg="opt" data-key="mask" ${s.mask ? 'checked' : ''}><span>Hide other people's email addresses and phone numbers<br><span class="small muted">Replaced with placeholders before sending; restored in results.</span></span></label>
        <label class="field"><span>Analysis depth</span><select class="input" id="o-tier" data-chg="opt" data-key="tier"><option value="complex" ${s.tier === 'complex' ? 'selected' : ''}>Thorough (best for attachments)</option><option value="default" ${s.tier === 'default' ? 'selected' : ''}>Balanced (faster)</option></select></label>
      </div>
    </section>
    <section class="card pad"><div class="section-title"><h2>Privacy</h2></div>
      <label class="check"><input type="checkbox" id="s-store" data-chg="opt" data-key="storeText" ${s.storeText ? 'checked' : ''}><span>Keep extracted email and attachment text<br><span class="small muted">Needed to view text later and to re-analyse. When off, only tasks, evidence quotes and summaries are kept.</span></span></label>
      <dl class="kv">
        <dt>Where data is kept</dt><dd>${DESKTOP ? 'On this computer only, in ' + esc(DK.dataDir()) + '. Export backups regularly.' : St.mode === 'db' ? 'Your Claude account, in a private area of this page that only you can read — not visible to people you share the page with.' : 'This browser only (cloud saving is unavailable in this view). Export backups regularly.'}</dd>
        <dt>What is sent to Claude</dt><dd>Only during analysis: the email text, the text read from attachments you leave ticked, and page images when image options are on.</dd>
        <dt>What never happens</dt><dd>${DESKTOP ? 'No access to your work mailbox. Only the personal Gmail you connect is read, and only messages sent to your forwarding address. Nothing is sent anywhere except Anthropic (analysis) and Gmail.' : 'No mailbox connection, no automatic reading of your inbox, nothing sent anywhere else.'}</dd>
        <dt>Image limit per email</dt><dd>${lim && lim.images ? lim.images.maxCount + ' images' : 'Images unavailable in this view'}</dd>
      </dl>
    </section>
    <section class="card pad"><div class="section-title"><h2>Backup and export</h2></div>
      <div class="row">
        <button class="btn" data-act="export-json">${I.download} Full backup (.json)</button>
        <button class="btn" data-act="export-csv">${I.download} Tasks for Excel (.csv)</button>
        <button class="btn" data-act="export-ics">${I.download} Deadlines for Outlook calendar (.ics)</button>
        <label class="btn ghost" for="import-json">Restore backup…</label><input id="import-json" type="file" accept=".json,application/json" hidden data-chg="import-json">
      </div>
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
  s.me = { ...s.me, name: v('s-name').trim(), emails: v('s-emails').split(/[,;\s]+/).map(x => x.trim().toLowerCase()).filter(x => x.includes('@')), aliases: v('s-aliases').trim(), role: v('s-role').trim(), org: v('s-org').trim(), scope: v('s-scope').trim() };
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
async function exportJSON() {
  const emails = [...St.emails.values()];
  const texts = {};
  if (St.settings.storeText) for (const e of emails) { const t = await getTexts(e.id); if (t) texts[e.id] = t; }
  offerFile(`action-register-backup-${stamp()}.json`, JSON.stringify({ app: 'action-register', version: 1, exportedAt: nowISO(), settings: St.settings, tasks: [...St.tasks.values()], emails, texts }, null, 1));
}
async function importJSON(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'action-register') throw new Error('Not an Action Register backup.');
    let nt = 0, ne = 0;
    for (const t of d.tasks || []) { if (t && t.id) { St.tasks.set(t.id, t); if (St.mode === 'db') await writeDoc(St.refs.tasks.doc(t.id), t); nt++; } }
    for (const e of d.emails || []) { if (e && e.id) { St.emails.set(e.id, e); if (St.mode === 'db') await writeDoc(St.refs.emails.doc(e.id), e); ne++; } }
    for (const [id, t] of Object.entries(d.texts || {})) await putTexts(id, t);
    if (d.settings && !St.settings.setupDone) putSettings(mergeSettings(d.settings));
    if (St.mode !== 'db') saveLocal();
    toast(`Restored ${nt} tasks and ${ne} emails.`); render();
  } catch (e) { toast('Restore failed: ' + (e.message || 'invalid file'), { err: true }); }
}
async function wipeAll() {
  const tids = [...St.tasks.keys()], eids = [...St.emails.keys()];
  for (const id of tids) delTask(id);
  for (const id of eids) delEmail(id);
  if (St.mode !== 'db') { try { localStorage.removeItem(LS_TEXT); } catch {} }
  UI.confirm = null; toast('All data deleted.'); render();
}

/* ---------- toasts ---------- */
function toast(msg, o = {}) {
  const box = $('#toasts'); while (box.children.length >= 2) box.firstElementChild.remove(); const t = document.createElement('div');
  t.className = 'toast' + (o.err ? ' err' : ''); t.setAttribute('role', o.err ? 'alert' : 'status');
  const span = document.createElement('span'); span.textContent = msg; span.style.flex = '1'; t.append(span);
  if (o.action) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = o.action; b.onclick = () => { o.fn(); t.remove(); }; t.append(b); }
  box.append(t); setTimeout(() => t.remove(), o.err ? 9000 : o.action ? 7000 : 3800);
}

/* ---------- navigation ---------- */
const VIEWS = ['todo', 'review', 'import', 'emails', 'setup'];
function go(view) { if (!VIEWS.includes(view)) view = 'todo'; if (view === 'todo') setTimeout(maybeAutoCategorize, 400); UI.view = view; UI.confirm = null; closeDrawer(); render(); window.scrollTo(0, 0); try { history.replaceState(null, '', '#' + view); } catch {} }

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
    const now = nowISO(); const t = { id: E.uid('t'), ref: nextRefs(1)[0], title: 'New task', action: '', type: 'do', ownership: 'mine', owner: 'me', requestedBy: '', project: '', priority: 'medium', deadline: null, deadlineText: '', deadlineBasis: 'none', status: 'todo', nextStep: '', dependsOn: '', blockedReason: '', tags: [], notes: '', evidence: [], emailIds: [], threadKey: '', createdAt: now, updatedAt: now, completedAt: null, history: [{ at: now, text: 'Created manually' }] };
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
  'sub-text': el => { const t = clone(St.tasks.get(UI.drawer && UI.drawer.id)); if (!t) return; const x = subsOf(t).find(y => y.id === el.dataset.sid); if (!x || x.text === el.value.trim()) return; if (!el.value.trim()) { t.subtasks = subsOf(t).filter(y => y.id !== x.id); } else x.text = el.value.trim(); putTask(t); render(); },
  'map-opt': el => { UI[el.dataset.key] = el.checked; UI.map.fitted = false; render(); },
  'todo-opt': el => { UI[el.dataset.key] = el.checked; saveTodoPrefs(); render(); },
  'task-field': el => { if (UI.drawer && UI.drawer.kind === 'task') setTaskField(UI.drawer.id, el.dataset.field, el.value); },
  prop: el => updateProposal(el.dataset.eid, el.dataset.pid, el.dataset.field, el.type === 'checkbox' ? el.checked : el.value),
  upd: el => { const e = clone(St.emails.get(el.dataset.eid)); const u = e && (e.analysis.updates || []).find(x => x.uid === el.dataset.uid); if (!u) return; u.accept = el.checked; putEmail(e); render(); },
  files: el => { const f = el.files; if (f && f.length) intakeFiles(f); el.value = ''; },
  'paste-files': el => { UI.pasteFiles = [...el.files]; const n = $('#paste-files-n'); if (n) n.textContent = UI.pasteFiles.map(f => f.name).join(', '); },
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
document.addEventListener('input', e => {
  const el = e.target;
  if (el.classList && (el.classList.contains('title-edit') || el.classList.contains('autogrow'))) autosize(el);
  if (el.dataset && el.dataset.inp) {
    UI[el.dataset.inp] = el.value; clearTimeout(qTimer);
    qTimer = setTimeout(() => { if (el.dataset.inp === 'mapQ') { render(); const ids = [...(document.querySelectorAll('.mnode.task.hit'))].map(n => n.dataset.tid); if (ids.length && UI.mapQ) { const vp = $('#map-vp'), n = UI.mapLayout.nodes.find(x => x.id === 't:' + ids[0]); if (vp && n) { UI.map.x = vp.clientWidth / 2 - (n.x + n.w / 2) * UI.map.k; UI.map.y = vp.clientHeight / 2 - (n.y + n.h / 2) * UI.map.k; applyCam(true); } } return; } if (el.dataset.inp === 'todoQ') { const n = $('#todo-groups'); if (n) n.innerHTML = todoGroupsHTML(); } else render(); }, 120);
  }
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('title-edit')) { e.preventDefault(); e.target.blur(); } if (e.key === 'Enter' && e.target.id === 'd-sub-new') { e.preventDefault(); addSub(); } });
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
window.__AR = { St, UI, E }; // debugging hook
})();
