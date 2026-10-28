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
UI.phF = UI.phF || 'all'; UI.phQ = UI.phQ || '';
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
  rail.insertBefore(b, document.getElementById('site-btn') || rail.querySelector('.rail-foot'));
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
function phNavHTML() {
  const rc = counts().review, tab = UI.view === 'phone' ? (UI.ph || 'today') : UI.view === 'todo' ? 'canvas' : 'more';
  const b = (k, ic, label, act, extra = '') => `<button class="ph-tab ${tab === k ? 'on' : ''}" data-act="${act}" data-k="${k}" aria-current="${tab === k ? 'page' : 'false'}">${ic}<span>${label}</span>${extra}</button>`;
  return `${b('today', '☀️', 'Today', 'ph-go')}${b('threads', '🧵', 'Threads', 'ph-go')}
    <button class="ph-add" data-act="ph-add" aria-label="Add">＋</button>
    ${b('canvas', '🧠', 'Canvas', 'ph-go')}${b('more', '☰', 'More', 'ph-more', rc ? `<i class="ph-badge">${rc}</i>` : '')}`;
}

/* --- Today --- */
const phTomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
function phThreadLine(t) {
  if (typeof taskConvs !== 'function') return '';
  const cid = taskConvs(t)[0]; if (!cid) return '';
  const st = threadSteps({ conv: cid }), x = st[st.length - 1]; if (!x) return '';
  return `<span class="ph-thread" dir="auto">🧵 <b>${esc(x.me ? 'Me' : E.clip(x.from || '', 22))}</b>${x.date ? ' · ' + esc(fmtDate(x.date)) : ''}: ${esc(E.clip(x.says || '', 80))}${st.length > 1 ? ` <i>(${st.length})</i>` : ''}</span>`;
}
function phCard(t) {
  const d = dueInfo(t), done = t.status === 'done', subs = subsOf(t);
  return `<div class="ph-card p-${esc(t.priority || 'medium')}${done ? ' done' : ''}" data-tid="${esc(t.id)}">
    <button class="ph-tick" data-act="toggle-done" data-id="${esc(t.id)}" aria-label="${done ? 'Reopen' : 'Mark done'}">${I.check}</button>
    <button class="ph-body" data-act="open-task" data-id="${esc(t.id)}">
      <b dir="auto">${esc(t.title)}</b>
      <span class="ph-meta"><span class="ph-due ${d.cls}">${esc(d.txt)}</span>${t.ownership === 'waiting' ? `<span>⏳ ${esc(E.clip(t.owner || 'others', 24))}</span>` : ''}<span class="mono">${esc(t.ref || '')}</span>${t.project ? `<span dir="auto">${esc(E.clip(t.project, 22))}</span>` : ''}${subs.length ? `<span>☑ ${subsDone(t)}/${subs.length}</span>` : ''}</span>
      ${phThreadLine(t)}
    </button></div>`;
}
function viewPhone() {
  if ((UI.ph || 'today') === 'threads') return phThreads();
  const q = E.normMatch(UI.phQ || ''), all = [...St.tasks.values()].filter(t => !q || E.normMatch(`${t.title} ${t.ref} ${t.project} ${t.owner} ${t.sourceSubject || ''}`).includes(q));
  const open = all.filter(t => t.status !== 'done'), mine = open.filter(t => isMine(t) && t.status !== 'waiting'), wait = open.filter(t => !(isMine(t) && t.status !== 'waiting') && t.ownership !== 'fyi');
  const B = { over: [], today: [], week: [], later: [], none: [] };
  for (const t of mine) { const b = bucketOf(t); (b === 'Overdue' ? B.over : b === 'Today' ? B.today : b === 'Next 7 days' ? B.week : b === 'No deadline' ? B.none : B.later).push(t); }
  const byDue = (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2);
  Object.values(B).forEach(l => l.sort(byDue)); wait.sort(byDue);
  const doneToday = all.filter(t => t.status === 'done' && dayOf(t.completedAt) === T());
  const f = UI.phF, show = k => f === 'all' || f === k;
  const sec = (k, title, list, open = true) => list.length && show(k === 'wait' ? 'wait' : k === 'over' ? 'over' : k === 'today' ? 'today' : 'all') ? `<details class="ph-sec ${k}" ${open ? 'open' : ''}><summary><span>${title}</span><b>${list.length}</b></summary>${list.map(phCard).join('')}</details>` : '';
  const hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = (St.settings.me.name || St.profileName || '').split(' ')[0];
  const rc = counts().review, chip = (k, n, label) => `<button class="ph-chip ${k} ${f === k ? 'on' : ''}" data-act="ph-filter" data-f="${k}" aria-pressed="${f === k}"><b>${n}</b><span>${label}</span></button>`;
  const body = sec('over', '⚠️ Overdue', B.over) + sec('today', '📌 Today', B.today) + sec('week', '🗓 This week', B.week) + sec('later', 'Later', B.later, B.over.length + B.today.length + B.week.length < 4) + sec('none', 'No date', B.none, false) + sec('wait', '⏳ Waiting on others', wait, f === 'wait');
  return `<div class="wrap ph">
    <div class="ph-hello"><small>${esc(fmtDate(T(), { weekday: 'long', day: 'numeric', month: 'long' }))}</small><h1>${hi}${name ? ', ' + esc(name) : ''}</h1></div>
    <div class="ph-chips" role="group" aria-label="Show">${chip('all', mine.length, 'Mine')}${chip('over', B.over.length, 'Overdue')}${chip('today', B.today.length, 'Today')}${chip('wait', wait.length, 'Waiting')}${rc ? `<button class="ph-chip review" data-act="nav" data-view="review"><b>${rc}</b><span>To review</span></button>` : ''}</div>
    <label class="search ph-search">${I.search}<span class="sr">Search tasks</span><input class="input" id="ph-q" type="search" placeholder="Search tasks, projects, people…" value="${esc(UI.phQ)}" data-inp="phQ"></label>
    ${body || `<div class="empty ph-empty"><div class="big-emoji">🎉</div><h3>${q ? 'Nothing matches' : 'Nothing waiting for you'}</h3><p>${q ? 'Try other words.' : 'Add emails with ＋ and the tasks will appear here.'}</p></div>`}
    ${doneToday.length ? `<details class="ph-sec donel"><summary><span>✓ Done today</span><b>${doneToday.length}</b></summary>${doneToday.map(phCard).join('')}</details>` : ''}
    <p class="small muted ph-tip">Swipe a card right to finish it, left to move it to tomorrow.</p>
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
  return `<div class="wrap ph">
    <div class="ph-hello"><small>${list.length} conversation${list.length === 1 ? '' : 's'}</small><h1>Threads</h1></div>
    <label class="search ph-search">${I.search}<span class="sr">Search threads</span><input class="input" id="ph-q" type="search" placeholder="Search subject, people, what was said…" value="${esc(UI.phQ)}" data-inp="phQ"></label>
    ${list.length ? list.map(x => `<button class="ph-th" data-act="ph-thread" data-cid="${esc(x.cid)}">
      <span class="ph-th-h"><b dir="auto">${esc(E.clip(E.normSubject(x.ems[0].subject || '') || 'Email thread', 80))}</b><time>${x.at ? esc(fmtDate(x.at)) : ''}</time></span>
      <span class="ph-th-l" dir="auto">${x.last.me ? '<b>Me</b>' : `<b>${esc(E.clip(x.last.from || '', 24))}</b>`}: ${esc(E.clip(x.last.says || '', 110))}</span>
      <span class="ph-meta"><span>✉ ${x.st.length}</span>${x.open.length ? `<span class="ph-due today">${x.open.length} open</span>` : x.tasks.length ? '<span class="ph-due">all done ✓</span>' : ''}${x.open.slice(0, 2).map(t => `<span class="mono">${esc(t.ref)}</span>`).join('')}</span>
    </button>`).join('') : '<div class="empty ph-empty"><div class="big-emoji">🧵</div><h3>No threads yet</h3><p>Every email you add joins its conversation here.</p></div>'}
  </div>`;
}
DRAWER_FN.phthread = dr => {
  const ems = convEmails(dr.id); if (!ems.length) return null;
  const last = ems[ems.length - 1], ids = new Set(ems.map(e => e.id));
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).some(id => ids.has(id))).sort((a, b) => (a.status === 'done') - (b.status === 'done') || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  return `<div class="drawer-h"><span class="label">🧵 Thread</span><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b ph-drawer">
    <h2 dir="auto" style="font-size:19px">${esc(E.normSubject(ems[0].subject || '') || 'Email thread')}</h2>
    ${tasks.length ? `<div><div class="label" style="margin-bottom:6px">Tasks from this thread</div>${tasks.map(phCard).join('')}</div>` : ''}
    ${threadHistHTML(last, { open: true }) || `<p class="muted small">One email so far.</p>`}
    <div class="row">${ems.slice().reverse().map(e => `<button class="btn sm ghost" data-act="open-email" data-id="${esc(e.id)}">✉ ${esc(fmtDate((e.date || '').slice(0, 10)))} ${esc(E.clip(thName(e.from), 18))}</button>`).join('')}</div>
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
  const g = gmCfg();
  return `<h3>New task</h3>
    <input class="input ph-new" id="ph-new" placeholder="What needs doing?" enterkeyhint="done" dir="auto" autocomplete="off">
    <div class="ph-pills">${[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['week', 'This week'], ['none', 'No date']].map(d).join('')}</div>
    <select class="input" id="ph-proj" aria-label="Project"><option value="">No project</option>${projectsList().map(p => `<option ${p === UI.phProj ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
    <button class="btn primary ph-big" data-act="ph-create">Add task</button>
    <div class="ph-or"><span>or</span></div>
    ${St.mcp && g.address ? `<button class="btn ph-big" data-act="ph-gmail">📥 Check Gmail for forwarded emails</button>` : ''}
    <button class="btn ph-big" data-act="ph-import">✉ Add emails or files</button>`;
}
function phMoreHTML() {
  const rc = counts().review, pref = phPref();
  const it = (view, ic, label, extra = '') => `<button class="ph-row" data-act="ph-nav" data-view="${view}"><span>${ic}</span><b>${label}</b>${extra}</button>`;
  return `<h3>More</h3>
    ${it('review', '✅', 'Review', rc ? `<i class="ph-badge">${rc}</i>` : '')}${it('emails', '✉', 'Emails')}${it('import', '⬆', 'Add emails')}${VIEWS.includes('daily') && VIEW_FN.daily ? it('daily', '📅', 'Daily') : ''}${it('setup', '⚙', 'Setup')}
    <button class="ph-row" data-act="site-toggle"><span>☀</span><b>Site mode</b><small>${document.documentElement.classList.contains('site-mode') ? 'On' : 'Off'}</small></button>
    <div class="ph-seg"><span>📱 Phone mode</span><div class="seg">${[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']].map(([v, l]) => `<button data-act="ph-mode" data-v="${v}" aria-pressed="${pref === v}">${l}</button>`).join('')}</div></div>`;
}
Object.assign(ACT, {
  'phone-toggle': () => phSet(phoneOn() ? 'off' : 'on'),
  'ph-mode': el => { phSheet(null); phSet(el.dataset.v); toast(el.dataset.v === 'auto' ? '📱 Phone mode follows the screen size.' : el.dataset.v === 'on' ? '📱 Phone mode on.' : 'Phone mode off.'); },
  'ph-go': el => {
    const k = el.dataset.k; phSheet(null); closeDrawer();
    if (k === 'canvas') { UI.phCanvas = true; UI.todoMode = 'map'; UI.map.fitted = false; go('todo'); return; }
    UI.phCanvas = false; UI.ph = k; UI.phQ = ''; go('phone');
  },
  'ph-more': () => phSheet(phMoreHTML()),
  'ph-nav': el => { phSheet(null); UI.phCanvas = false; go(el.dataset.view); },
  'ph-add': () => { phSheet(phAddHTML()); setTimeout(() => { const i = document.getElementById('ph-new'); if (i) i.focus(); }, 60); },
  'ph-sheet-close': () => phSheet(null),
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
  'ph-filter': el => { UI.phF = UI.phF === el.dataset.f ? 'all' : el.dataset.f; render(); },
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
  if (dx > 90) { const t = St.tasks.get(id); if (t && t.status !== 'done') ACT['toggle-done']({ dataset: { id } }); }
  else if (dx < -90) phTomorrowTask(id);
};
document.addEventListener('pointerup', swEnd); document.addEventListener('pointercancel', () => { if (SW.el) { SW.el.style.transform = ''; SW.el = null; } });

SETUP_EXTRA.push(() => `<section class="card pad" data-sec="Phone mode" style="display:grid;gap:8px"><div class="section-title"><h2>📱 Phone mode</h2></div>
  <p class="small muted" style="margin:0">A layout made for a phone: Today with big cards you tick or swipe, your email threads, quick add, and a bottom bar in thumb reach. This device only.</p>
  <div class="seg">${[['auto', 'Auto (small screens)'], ['on', 'Always'], ['off', 'Never']].map(([v, l]) => `<button data-act="ph-mode" data-v="${v}" aria-pressed="${phPref() === v}">${l}</button>`).join('')}</div></section>`);
phApply();
