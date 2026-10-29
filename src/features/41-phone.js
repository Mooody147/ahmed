/* ---------- phone mode: the register made for a phone held in one hand ---------- */
// On a phone (automatically on small screens, or with 📱 in the header) the app opens on Today: what needs you,
// in big cards — overdue, today, this week, later, then what you are waiting on. Tick a card to finish it, swipe it
// right to finish, swipe it left to move it to tomorrow (Undo in the message). Each card shows the latest message of
// its email thread. Threads lists every conversation, newest first; a tap opens the whole thread with its tasks.
// The ＋ button adds a task in two taps, checks Gmail or adds emails. A bottom bar (Today · Threads · ＋ · Canvas ·
// More) is in thumb reach; screens open full width with large touch targets. Remembered on this device only.
const PH_LS = 'ar-phone-mode';
// automatic in the claude.ai artifact; the desktop app keeps its own phone layout unless phone mode is switched on
const PH_DEF = typeof AR_LITE !== 'undefined' && AR_LITE ? 'auto' : 'off';
const phPref = () => { try { return localStorage.getItem(PH_LS) || PH_DEF; } catch { return PH_DEF; } };
const phSmall = () => window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
const phoneOn = () => phPref() === 'on' || (phPref() === 'auto' && phSmall());
UI.phF = UI.phF || 'mine'; UI.phQ = UI.phQ || '';
function phApply() {
  const on = phoneOn(); document.documentElement.classList.toggle('phone-mode', on);
  const b = document.getElementById('phone-btn'); if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Phone mode is on — tap for the full layout' : 'Phone mode: made for a phone'; }
  let nav = document.getElementById('ph-nav');
  if (on && !nav) { nav = document.createElement('nav'); nav.id = 'ph-nav'; nav.className = 'ph-nav'; nav.setAttribute('aria-label', 'Phone'); document.body.appendChild(nav); }
  if (nav) { nav.hidden = !on; if (on) nav.innerHTML = deco(phNavHTML()); }
  return on;
}
function phSet(v) { try { localStorage.setItem(PH_LS, v); } catch {} const on = phApply(); if (on && UI.view === 'todo' && !UI.phCanvas) UI.view = 'phone'; if (!on && UI.view === 'phone') UI.view = 'todo'; render(); }
(() => {
  const rail = document.querySelector('.rail'); if (!rail || document.getElementById('phone-btn')) return;
  const b = document.createElement('button'); b.id = 'phone-btn'; b.className = 'nav phone-btn'; b.dataset.act = 'phone-toggle';
  b.innerHTML = '<span class="site-ic" aria-hidden="true">📱</span><span class="site-lbl">Phone</span>';
  rail.insertBefore(b, rail.querySelector('.rail-foot'));
  if (window.matchMedia) window.matchMedia('(max-width: 640px)').addEventListener('change', () => { if (phPref() === 'auto') phSet('auto'); });
})();
VIEWS.push('phone');
VIEW_FN.phone = () => viewPhone();
// on a phone the to-do page opens as Today; the Canvas tab still opens the map
HOOKS.beforeRender.push(() => {
  if (!phApply()) { document.documentElement.classList.remove('ph-canvas'); return; }
  if (UI.view === 'todo' && !UI.phCanvas) UI.view = 'phone';
  document.documentElement.classList.toggle('ph-canvas', UI.view === 'todo');
});
HOOKS.afterRender.push(() => { const nav = document.getElementById('ph-nav'); if (nav && !nav.hidden) nav.innerHTML = deco(phNavHTML()); });

/* --- bottom bar --- */
const PH_IC = {
  today: svg('<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12.2 2.4 2.4 4.8-5"/>', 22),
  threads: svg('<path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3"/>', 22),
  canvas: svg('<circle cx="5" cy="12" r="2.5"/><circle cx="19" cy="6" r="2.5"/><circle cx="19" cy="18" r="2.5"/><path d="M7.4 11 16.6 7M7.4 13l9.2 4"/>', 22),
  more: svg('<path d="M4 7h16M4 12h16M4 17h16"/>', 22),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', 22),
};
function phNavHTML() {
  const rc = counts().review, tab = UI.view === 'phone' ? (UI.ph || 'today') : UI.view === 'todo' ? 'canvas' : 'more';
  const b = (k, label, act, extra = '') => `<button class="ph-tab ${tab === k ? 'on' : ''}" data-act="${act}" data-k="${k}" aria-current="${tab === k ? 'page' : 'false'}">${PH_IC[k]}<span>${label}</span>${extra}</button>`;
  return `${b('today', 'Today', 'ph-go')}${b('threads', 'Threads', 'ph-go')}
    <button class="ph-add" data-act="ph-add" aria-label="Add">${svg('<path d="M12 5v14M5 12h14"/>', 26)}</button>
    ${b('canvas', 'Canvas', 'ph-go')}${b('more', 'More', 'ph-more', rc ? `<i class="ph-dot" aria-label="${rc} to review"></i>` : '')}`;
}
// a page head: small date line, the title, and a search button that opens the search field
function phHead(sub, title) {
  const open = UI.phSearch || UI.phQ;
  return `<header class="ph-top"><div><small>${esc(sub)}</small><h1>${esc(title)}</h1></div><button class="ph-icon ${open ? 'on' : ''}" data-act="ph-search" aria-label="Search" aria-pressed="${!!open}">${PH_IC.search}</button></header>
    ${open ? `<label class="ph-search"><span class="sr">Search</span><input class="input" id="ph-q" type="search" placeholder="Search" value="${esc(UI.phQ)}" data-inp="phQ" autocomplete="off"></label>` : ''}`;
}

/* --- Today --- */
const phTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
// one card: the task, and one line under it — when, which project, who you wait for
function phCard(t) {
  const d = dueInfo(t), done = t.status === 'done';
  const conv = typeof taskConvs === 'function' ? taskConvs(t)[0] : null, n = conv ? threadSteps({ conv }).length : 0;
  const bits = [d.cls !== 'none' || !done ? `<span class="ph-due ${d.cls}">${esc(d.txt)}</span>` : '', t.ownership === 'waiting' ? `<span>${esc(E.clip(t.owner || 'Others', 22))}</span>` : '', t.project ? `<span class="ph-proj" dir="auto">${esc(t.project)}</span>` : ''].filter(Boolean);
  return `<div class="ph-card${t.priority === 'critical' || t.priority === 'high' ? ' p-' + t.priority : ''}${done ? ' done' : ''}" data-tid="${esc(t.id)}">
    <button class="ph-tick" data-act="toggle-done" data-id="${esc(t.id)}" aria-label="${done ? 'Reopen' : 'Mark done'}"><span></span></button>
    <button class="ph-body" data-act="open-task" data-id="${esc(t.id)}">
      <b dir="auto">${esc(t.title)}</b>
      <span class="ph-meta">${bits.join('<i>·</i>')}${n > 1 ? `<span class="ph-n" title="${n} messages in its email thread">${svg('<path d="M4 5h16v11H9l-5 4z"/>', 13)}${n}</span>` : ''}</span>
    </button></div>`;
}
const PH_TIP = 'ar-ph-tip';
function viewPhone() {
  if ((UI.ph || 'today') === 'threads') return phThreads();
  const q = E.normMatch(UI.phQ || ''), all = [...St.tasks.values()].filter(t => !q || E.normMatch(`${t.title} ${t.ref} ${t.project} ${t.owner} ${t.sourceSubject || ''}`).includes(q));
  const open = all.filter(t => t.status !== 'done'), mine = open.filter(t => isMine(t) && t.status !== 'waiting'), wait = open.filter(t => !(isMine(t) && t.status !== 'waiting') && t.ownership !== 'fyi');
  const byDue = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2);
  const G = { now: [], next: [], later: [] };
  for (const t of mine.sort(byDue)) { const b = bucketOf(t); (b === 'Overdue' || b === 'Today' ? G.now : b === 'Next 7 days' ? G.next : G.later).push(t); }
  wait.sort(byDue);
  const over = mine.filter(t => bucketOf(t) === 'Overdue').length, doneToday = all.filter(t => t.status === 'done' && dayOf(t.completedAt) === T());
  const tab = UI.phF === 'wait' ? 'wait' : 'mine', rc = counts().review;
  const group = (title, list, cls = '') => list.length ? `<section class="ph-group ${cls}"><h2>${esc(title)}</h2><div class="ph-list">${list.map(phCard).join('')}</div></section>` : '';
  const summary = tab === 'wait' ? (wait.length ? `${wait.length} waiting on others` : 'Nobody owes you anything') : mine.length ? `${mine.length} task${mine.length > 1 ? 's' : ''} for you${over ? ` · <b class="ph-over">${over} overdue</b>` : ''}` : 'You are all clear';
  const body = tab === 'wait' ? group('Waiting on others', wait) : group('Now', G.now, 'now') + group('Next 7 days', G.next) + group('Later', G.later);
  let tip = false; try { tip = !localStorage.getItem(PH_TIP) && (mine.length + wait.length) > 0; } catch {}
  return `<div class="wrap ph">
    ${phHead(fmtDate(T(), { weekday: 'long', day: 'numeric', month: 'long' }), 'Today')}
    <p class="ph-sum">${summary}</p>
    <div class="ph-seg2" role="tablist"><button role="tab" data-act="ph-filter" data-f="mine" aria-selected="${tab === 'mine'}">Mine <span>${mine.length}</span></button><button role="tab" data-act="ph-filter" data-f="wait" aria-selected="${tab === 'wait'}">Waiting <span>${wait.length}</span></button></div>
    ${rc ? `<button class="ph-note" data-act="nav" data-view="review"><span>${rc} email${rc > 1 ? 's' : ''} to review</span>${svg('<path d="m9 6 6 6-6 6"/>', 18)}</button>` : ''}
    ${body || `<div class="ph-empty"><div class="ph-empty-ic">${PH_IC.today}</div><h3>${q ? 'No matches' : tab === 'wait' ? 'Nothing pending from others' : 'Nothing due'}</h3><p>${q ? 'Try other words.' : 'New tasks from your emails will appear here.'}</p></div>`}
    ${doneToday.length && tab === 'mine' ? `<details class="ph-done"><summary>${doneToday.length} done today</summary><div class="ph-list">${doneToday.map(phCard).join('')}</div></details>` : ''}
    ${tip ? `<p class="ph-tip">Swipe right to finish · swipe left for tomorrow <button class="ph-x" data-act="ph-tip-ok" aria-label="Got it">${I.x}</button></p>` : ''}
  </div>`;
}

/* --- Threads --- */
function phThreads() {
  const idx = typeof convIndex === 'function' ? convIndex() : { ids: new Map() };
  const q = E.normMatch(UI.phQ || '');
  const list = [...idx.ids.entries()].map(([cid, ems]) => {
    const st = threadSteps({ conv: cid }), last = st[st.length - 1] || {}, ids = new Set(ems.map(e => e.id));
    const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).some(id => ids.has(id)));
    return { cid, ems, st, last, tasks, open: tasks.filter(t => t.status !== 'done'), at: [...st].reverse().find(x => x.date)?.date || (ems[ems.length - 1].date || '').slice(0, 10) };
  }).filter(x => !q || E.normMatch(x.ems.map(e => e.subject + ' ' + e.from).join(' ') + ' ' + x.st.map(s => s.says).join(' ')).includes(q))
    .sort((a, b) => (b.open.length > 0) - (a.open.length > 0) || (b.at || '').localeCompare(a.at || ''));
  const active = list.filter(x => x.open.length).length;
  return `<div class="wrap ph">
    ${phHead(`${list.length} conversation${list.length === 1 ? '' : 's'}${active ? ` · ${active} with open tasks` : ''}`, 'Threads')}
    ${list.length ? `<div class="ph-list ph-threads">${list.map(x => `<button class="ph-th" data-act="ph-thread" data-cid="${esc(x.cid)}">
      <span class="ph-th-h"><b dir="auto">${esc(E.normSubject(x.ems[0].subject || '') || 'Email thread')}</b><time>${x.at ? esc(fmtDate(x.at)) : ''}</time></span>
      <span class="ph-th-l"><span dir="auto">${esc(x.last.me ? 'You' : E.clip(x.last.from || '', 24))}: ${esc(x.last.says || '')}</span>${x.open.length ? `<i class="ph-pill-n">${x.open.length}</i>` : ''}</span>
    </button>`).join('')}</div>` : `<div class="ph-empty"><div class="ph-empty-ic">${PH_IC.threads}</div><h3>No threads yet</h3><p>Every email you add joins its conversation here.</p></div>`}
  </div>`;
}
DRAWER_FN.phthread = dr => {
  const ems = convEmails(dr.id); if (!ems.length) return null;
  const last = ems[ems.length - 1], ids = new Set(ems.map(e => e.id));
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).some(id => ids.has(id))).sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  return `<div class="drawer-h"><button class="icon-btn" data-act="close-drawer" aria-label="Back">${I.back || I.x}</button><span class="label">Thread</span><span class="spacer"></span></div>
  <div class="drawer-b ph-drawer">
    <h2 dir="auto" class="ph-dr-title">${esc(E.normSubject(ems[0].subject || '') || 'Email thread')}</h2>
    ${tasks.length ? `<section class="ph-group"><h2>Tasks</h2><div class="ph-list">${tasks.map(phCard).join('')}</div></section>` : ''}
    ${threadHistHTML(last, { open: true }) || `<p class="muted small">One email so far.</p>`}
  </div>`;
};

/* --- the ＋ sheet and More --- */
function phSheet(html) {
  let s = document.getElementById('ph-sheet');
  if (!html) { if (s) s.hidden = true; document.documentElement.classList.remove('ph-sheet-on'); return; }
  if (!s) { s = document.createElement('div'); s.id = 'ph-sheet'; s.className = 'ph-sheet'; s.setAttribute('role', 'dialog'); document.body.appendChild(s); }
  s.innerHTML = `<div class="ph-sheet-bg" data-act="ph-sheet-close"></div><div class="ph-sheet-card"><span class="ph-grab" aria-hidden="true"></span>${deco(html)}</div>`;
  s.hidden = false; document.documentElement.classList.add('ph-sheet-on');
}
UI.phDue = UI.phDue || 'today';
function phAddHTML() {
  const due = UI.phDue, d = k => `<button class="ph-pill ${due === k[0] ? 'on' : ''}" data-act="ph-due" data-d="${k[0]}" aria-pressed="${due === k[0]}">${k[1]}</button>`;
  const g = gmCfg(), projs = projectsList();
  return `<h3>New task</h3>
    <input class="input ph-new" id="ph-new" placeholder="What needs doing?" enterkeyhint="done" dir="auto" autocomplete="off">
    <div class="ph-pills">${[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['none', 'No date']].map(d).join('')}</div>
    ${projs.length ? `<select class="input" id="ph-proj" aria-label="Project"><option value="">No project</option>${projs.map(p => `<option ${p === UI.phProj ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>` : ''}
    <button class="btn primary ph-big" data-act="ph-create">Add task</button>
    <div class="ph-links">${St.mcp && g.address ? `<button class="ph-link" data-act="ph-gmail">Check Gmail</button>` : ''}<button class="ph-link" data-act="ph-import">Add emails or files</button></div>`;
}
function phMoreHTML() {
  const rc = counts().review, pref = phPref();
  const it = (view, label, extra = '') => `<button class="ph-row" data-act="ph-nav" data-view="${view}"><b>${label}</b>${extra}${svg('<path d="m9 6 6 6-6 6"/>', 18)}</button>`;
  return `<h3>More</h3>
    <div class="ph-rows">${it('review', 'Review', rc ? `<i class="ph-pill-n">${rc}</i>` : '')}${it('emails', 'Emails')}${it('import', 'Add emails')}${it('setup', 'Setup')}</div>
    <div class="ph-rows"><button class="ph-row" data-act="ph-site"><b>Big text for site</b><small>${document.documentElement.classList.contains('site-mode') ? 'On' : 'Off'}</small></button>
    <div class="ph-row ph-row-seg"><b>Phone layout</b><div class="seg">${[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => `<button data-act="ph-mode" data-v="${v}" aria-pressed="${pref === v}">${l}</button>`).join('')}</div></div></div>`;
}
Object.assign(ACT, {
  'phone-toggle': () => phSet(phoneOn() ? 'off' : 'on'),
  'ph-mode': el => { phSheet(null); phSet(el.dataset.v); toast(el.dataset.v === 'auto' ? '📱 Phone mode follows the screen size.' : el.dataset.v === 'on' ? '📱 Phone mode on.' : 'Phone mode off.'); },
  'ph-go': el => {
    const k = el.dataset.k; phSheet(null); closeDrawer();
    if (k === 'canvas') { UI.phCanvas = true; UI.todoMode = 'map'; UI.map.fitted = false; go('todo'); return; }
    UI.phCanvas = false; UI.ph = k; UI.phQ = ''; UI.phSearch = false; go('phone');
  },
  'ph-more': () => phSheet(phMoreHTML()),
  'ph-nav': el => { phSheet(null); UI.phCanvas = false; go(el.dataset.view); },
  'ph-add': () => { phSheet(phAddHTML()); setTimeout(() => { const i = document.getElementById('ph-new'); if (i) i.focus(); }, 60); },
  'ph-sheet-close': () => phSheet(null),
  'ph-site': () => { phSheet(null); siteToggle(); },
  'ph-due': el => { UI.phDue = el.dataset.d; document.querySelectorAll('.ph-pill').forEach(b => { const on = b.dataset.d === UI.phDue; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); },
  'ph-create': () => {
    const i = document.getElementById('ph-new'), title = (i && i.value || '').trim(); if (!title) { if (i) i.focus(); return; }
    const p = document.getElementById('ph-proj'); UI.phProj = p ? p.value : '';
    const d = new Date(), iso = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    const deadline = UI.phDue === 'today' ? T() : UI.phDue === 'tomorrow' ? phTomorrow() : UI.phDue === 'week' ? (d.setDate(d.getDate() + Math.max(1, 5 - d.getDay() + (d.getDay() > 5 ? 7 : 0))), iso(d)) : null;
    const t = makeTask({ title, project: UI.phProj, deadline, deadlineBasis: deadline ? 'explicit' : 'none', history: [{ at: nowISO(), text: 'Added on the phone' }] });
    cvApply({ tasks: { [t.id]: t } }); phSheet(null); render(); toast(`＋ ${t.ref} added.`, { action: 'Undo', fn: cvUndo });
  },
  'ph-gmail': () => { phSheet(null); checkGmail(true); },
  'ph-import': () => { phSheet(null); UI.phCanvas = false; go('import'); },
  'ph-filter': el => { UI.phF = el.dataset.f; render(); },
  'ph-search': () => { UI.phSearch = !(UI.phSearch || UI.phQ); if (!UI.phSearch) UI.phQ = ''; render(); if (UI.phSearch) setTimeout(() => { const i = document.getElementById('ph-q'); if (i) i.focus(); }, 30); },
  'ph-tip-ok': () => { try { localStorage.setItem(PH_TIP, '1'); } catch {} render(); },
  'ph-thread': el => openDrawer('phthread', el.dataset.cid),
});
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'ph-new') { e.preventDefault(); ACT['ph-create'](); } if (e.key === 'Escape') phSheet(null); });
// move a task to tomorrow (swipe left)
function phTomorrowTask(id) {
  const t0 = St.tasks.get(id); if (!t0 || t0.status === 'done') return;
  const t = clone(t0), to = phTomorrow(); t.deadline = to; t.deadlineBasis = 'explicit'; (t.history = t.history || []).push({ at: nowISO(), text: `Moved to ${fmtDate(to)} on the phone` });
  cvApply({ tasks: { [id]: t } }); render(); toast(`➜ ${t.ref} moved to tomorrow.`, { action: 'Undo', fn: cvUndo });
}

/* --- swipe a card: right finishes it, left moves it to tomorrow --- */
const SW = { el: null };
document.addEventListener('pointerdown', e => {
  const c = e.target.closest && e.target.closest('.ph-card'); if (!c || e.button > 0 || e.target.closest('.ph-tick')) return;
  SW.el = c; SW.x = e.clientX; SW.y = e.clientY; SW.dx = 0; SW.lock = null; SW.id = e.pointerId;
}, { passive: true });
document.addEventListener('pointermove', e => {
  if (!SW.el || e.pointerId !== SW.id) return;
  const dx = e.clientX - SW.x, dy = e.clientY - SW.y;
  if (!SW.lock && Math.hypot(dx, dy) > 10) SW.lock = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y';
  if (SW.lock !== 'x') return;
  SW.dx = dx; SW.el.style.transform = `translateX(${dx}px)`; SW.el.classList.toggle('sw-done', dx > 70); SW.el.classList.toggle('sw-later', dx < -70);
}, { passive: true });
const swEnd = () => {
  const c = SW.el; if (!c) return; SW.el = null;
  const id = c.dataset.tid, dx = SW.dx || 0;
  c.style.transform = ''; c.classList.remove('sw-done', 'sw-later');
  if (SW.lock !== 'x') return;
  // a swipe is not a tap
  const stop = ev => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
  try { localStorage.setItem(PH_TIP, '1'); } catch {}
  if (dx > 90) { const t = St.tasks.get(id); if (t && t.status !== 'done') ACT['toggle-done']({ dataset: { id } }); }
  else if (dx < -90) phTomorrowTask(id);
};
document.addEventListener('pointerup', swEnd); document.addEventListener('pointercancel', () => { if (SW.el) { SW.el.style.transform = ''; SW.el = null; } });

SETUP_EXTRA.push(() => `<section class="card pad" data-sec="Phone mode" style="display:grid;gap:8px"><div class="section-title"><h2>📱 Phone mode</h2></div>
  <p class="small muted" style="margin:0">A layout made for a phone: Today with big cards you tick or swipe, your email threads, quick add, and a bottom bar in thumb reach. This device only.</p>
  <div class="seg">${[['auto', 'Auto (small screens)'], ['on', 'Always'], ['off', 'Never']].map(([v, l]) => `<button data-act="ph-mode" data-v="${v}" aria-pressed="${phPref() === v}">${l}</button>`).join('')}</div>
  <label class="check"><input type="checkbox" data-chg="site-mode" ${typeof siteOn === 'function' && siteOn() ? 'checked' : ''}>Big text for site — black on white for sunlight, thick lines and large buttons</label></section>`);
phApply();
