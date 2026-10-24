/* ---------- home: Today strip, morning briefing, risk radar ---------- */
const BRIEF = { running: false, error: '' };
const briefKey = () => 'brief-' + T();
const todayBrief = () => St.cols.prefs.get(briefKey()) || null;
function openMine() { return [...St.tasks.values()].filter(t => t.status !== 'done' && t.ownership !== 'fyi'); }
// Local rules that flag tasks likely to slip; Claude is not needed for these.
function riskList() {
  const out = [], today = T(), now = Date.now();
  const age = iso => iso ? Math.floor((now - new Date(iso)) / 864e5) : 0;
  for (const t of openMine()) {
    const d = t.deadline ? E.dayDiff(today, t.deadline) : null;
    const lastTouch = t.updatedAt || t.createdAt;
    if (d !== null && d < 0) out.push({ t, level: 3, why: `${-d} day${d === -1 ? '' : 's'} overdue` });
    else if (d !== null && d <= 2 && t.status === 'todo' && !subsDone(t)) out.push({ t, level: 2, why: d === 0 ? 'Due today and not started' : `Due in ${d} day${d > 1 ? 's' : ''}, not started` });
    if (t.status === 'blocked') out.push({ t, level: 2, why: 'Blocked' + (t.blockedReason ? ': ' + E.clip(t.blockedReason, 50) : '') });
    if ((t.ownership === 'waiting' || t.status === 'waiting') && age(lastTouch) >= 7) out.push({ t, level: 1, why: `Waiting on ${t.owner || 'others'} for ${age(lastTouch)} days` });
  }
  for (const d of colList('docreg')) if (/^[34]$/.test(String(d.code || '')) && !d.resubmitted && d.status !== 'closed') {
    const task = d.taskId && St.tasks.get(d.taskId);
    if (!task || task.status === 'done') out.push({ t: task || null, doc: d, level: 2, why: `${d.number || d.title} returned Code ${d.code} — no open resubmission task` });
  }
  const seen = new Set();
  return out.sort((a, b) => b.level - a.level).filter(r => { const k = (r.t ? r.t.id : r.doc.id) + r.why; if (seen.has(k)) return false; seen.add(k); return true; });
}
function localBrief() {
  const m = openMine().filter(t => isMine(t) && t.status !== 'waiting');
  const today = m.filter(t => t.deadline === T()), over = m.filter(t => t.deadline && t.deadline < T());
  const waiting = openMine().filter(t => t.ownership === 'waiting' || t.status === 'waiting');
  const lines = [];
  if (over.length) lines.push({ text: `${over.length} overdue: ${over.slice(0, 3).map(t => t.ref).join(', ')}${over.length > 3 ? '…' : ''}`, taskIds: over.slice(0, 3).map(t => t.id) });
  if (today.length) lines.push({ text: `Due today: ${today.slice(0, 3).map(t => E.clip(t.title, 50)).join('; ')}`, taskIds: today.slice(0, 3).map(t => t.id) });
  const top = m.filter(t => !today.includes(t) && !over.includes(t)).sort((a, b) => (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2) || (a.deadline || '9').localeCompare(b.deadline || '9'))[0];
  if (top) lines.push({ text: `Next most important: ${E.clip(top.title, 70)}`, taskIds: [top.id] });
  if (waiting.length) lines.push({ text: `Waiting on others: ${[...new Set(waiting.map(t => t.owner || 'others'))].slice(0, 4).join(', ')}`, taskIds: waiting.slice(0, 3).map(t => t.id) });
  const rc = counts().review; if (rc) lines.push({ text: `${rc} analysed email${rc > 1 ? 's' : ''} waiting for your review`, taskIds: [] });
  return { headline: lines.length ? 'Here is your day' : 'Nothing urgent today', bullets: lines, by: 'local', at: nowISO() };
}
async function makeBrief(manual) {
  if (BRIEF.running) return;
  if (!St.sample) { colPut('prefs', { id: briefKey(), ...localBrief() }); render(); return; }
  BRIEF.running = true; BRIEF.error = ''; render();
  try {
    const tasks = openMine().slice(0, 120).map(t => JSON.stringify({ id: t.id, ref: t.ref, title: t.title, project: t.project || '', status: t.status, priority: t.priority, deadline: t.deadline, owner: t.ownership === 'mine' ? 'me' : t.owner, waitingSince: (t.ownership === 'waiting' || t.status === 'waiting') ? (t.updatedAt || '').slice(0, 10) : undefined, items: subsOf(t).length ? `${subsDone(t)}/${subsOf(t).length}` : undefined })).join('\n');
    const risks = riskList().slice(0, 10).map(r => '- ' + (r.t ? r.t.ref + ' ' : '') + r.why).join('\n');
    const prompt = `You are the morning assistant of ${St.settings.me.name || 'a mechanical design engineer'} (${St.settings.me.role || 'water and wastewater treatment'}). Today is ${T()}.\nOpen tasks (one JSON object per line):\n${tasks || '(none)'}\n\nAlready flagged risks:\n${risks || '(none)'}\n\nWrite a briefing of at most 5 short bullets: what matters most today, what is overdue or at risk, and who the user is waiting on. Be specific (refs, documents, people). Do not invent anything that is not in the data.\nReply with JSON only: {"headline":"<one line>","bullets":[{"text":"<bullet>","taskIds":["<id>"]}]}`;
    const ans = await St.sample.json(prompt, { modelTier: 'quick' });
    const bullets = (ans && Array.isArray(ans.bullets) ? ans.bullets : []).filter(b => b && b.text).slice(0, 6).map(b => ({ text: E.clip(String(b.text), 220), taskIds: (Array.isArray(b.taskIds) ? b.taskIds : []).map(String).filter(id => St.tasks.has(id)).slice(0, 4) }));
    colPut('prefs', { id: briefKey(), ...(bullets.length ? { headline: E.clip(String(ans.headline || 'Your day'), 120), bullets, by: 'claude', at: nowISO() } : localBrief()) });
  } catch (e) {
    BRIEF.error = 'Claude could not write the briefing (' + ((e && e.code) || 'error') + '). Showing the basic one.';
    colPut('prefs', { id: briefKey(), ...localBrief() });
  } finally { BRIEF.running = false; render(); }
}
HOOKS.ready.push(() => { if (autoPrefs().briefing !== false && !todayBrief() && St.tasks.size) setTimeout(() => makeBrief(false), 1500); });
function todayStripHTML() {
  const n = todaysNumbers(), all = openMine();
  const waiting = all.filter(t => t.ownership === 'waiting' || t.status === 'waiting').length;
  const name = (St.settings.me.name || St.profileName || '').split(' ')[0];
  const h = new Date().getHours(); const greet = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const stat = (k, n, label, cls, act) => `<button class="tstat ${cls} ${n ? '' : 'zero'}" data-act="${act}" ${k ? `data-filter="${k}"` : ''}><b class="num">${n}</b><span>${label}</span></button>`;
  // the numbers open the list view filtered to them
  const b = todayBrief(), risks = riskList();
  return `<section class="today-strip">
      <div class="ts-left"><div class="label">${esc(new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }))}</div><h1>${greet}${name ? ', ' + esc(name) : ''}</h1></div>
      <div class="ts-stats">
        ${stat('today', n.today, 'Due today', 'today', 'strip-filter')}${stat('overdue', n.overdue, 'Overdue', 'over', 'strip-filter')}${stat('waiting', waiting, 'Waiting on others', 'wait', 'strip-filter')}${stat('', n.review, 'To review', 'rev', 'goto-review')}
      </div>
      <div class="ts-actions"><button class="btn primary" data-act="nav" data-view="import">${I.upload} Add emails</button><button class="btn" data-act="new-task">${I.plus} Task</button><button class="btn" data-act="focus-mode" title="Focus on your top 3 with a timer">🎯 Focus</button></div>
    </section>
    ${UI.updateReady ? callout('ok', `<div class="row"><span>Version ${esc(UI.updateReady)} has been downloaded.</span><span class="spacer"></span><button class="btn sm primary" data-act="update-install">Restart to update</button></div>`) : ''}
    ${(b || BRIEF.running || risks.length) && !UI.briefHidden ? `<section class="card pad brief">
      <div class="row"><b>${BRIEF.running ? 'Writing your briefing…' : esc(b ? b.headline : 'Briefing')}</b>${b && b.by === 'claude' ? '<span class="chip accent">by Claude</span>' : ''}<span class="spacer"></span>
        <button class="btn ghost sm" data-act="brief-refresh" ${BRIEF.running ? 'disabled' : ''} title="Write it again">↺</button><button class="btn ghost sm" data-act="brief-hide" title="Hide for now">${I.x}</button></div>
      ${BRIEF.error ? `<p class="small muted">${esc(BRIEF.error)}</p>` : ''}
      ${b ? `<ul class="brief-list">${b.bullets.map(x => `<li><span dir="auto">${esc(x.text)}</span>${x.taskIds.map(id => St.tasks.get(id)).filter(Boolean).map(t => `<button class="chip ref-chip" data-act="open-task" data-id="${esc(t.id)}">${esc(t.ref)}</button>`).join('')}</li>`).join('')}</ul>` : ''}
      ${risks.length ? `<div class="risks"><span class="label">Risk radar</span>${risks.slice(0, 6).map(r => `<button class="risk l${r.level}" ${r.t ? `data-act="open-task" data-id="${esc(r.t.id)}"` : 'data-act="nav" data-view="docs"'}><span class="rdot"></span>${r.t ? `<b class="mono">${esc(r.t.ref)}</b> ` : ''}${esc(r.why)}</button>`).join('')}${risks.length > 6 ? `<button class="btn ghost sm" data-act="nav" data-view="insights">+${risks.length - 6} more</button>` : ''}</div>` : ''}
    </section>` : (UI.briefHidden ? '' : '')}`;
}
Object.assign(ACT, {
  'strip-filter': el => { UI.todoFilter = el.dataset.filter; if (el.dataset.filter === 'waiting') UI.todoWaiting = true; if (UI.todoMode === 'map') { UI.todoMode = 'list'; saveTodoPrefs(); } render(); },
  'brief-refresh': () => makeBrief(true),
  'brief-hide': () => { UI.briefHidden = true; render(); },
});

/* ---------- command palette (Ctrl+K) ---------- */
const PAL = { open: false, q: '', i: 0, items: [] };
function paletteItems(q) {
  const nq = E.normMatch(q), out = [];
  const add = (group, label, run, hint) => out.push({ group, label, run, hint });
  const views = [['todo', 'To-do'], ['daily', 'Daily'], ['review', 'Review'], ['import', 'Add emails'], ['emails', 'Emails'], ['docs', 'Documents'], ['insights', 'Insights'], ['notebook', 'Notebook'], ['money', 'Money'], ['tools', 'Tools'], ['setup', 'Setup']];
  const acts = [
    ['New task', () => ACT['new-task']()], ['Quick add for today', () => openQuickAdd()], ['Check Gmail now', () => checkGmail(true)],
    ['Focus mode', () => openFocus()], ['Morning briefing — write again', () => { go('todo'); makeBrief(true); }],
    ['Privacy mode on/off', () => togglePrivacy()], ['Keyboard shortcuts', () => openShortcuts()],
    ['Weekly report', () => { UI.insTab = 'reports'; go('insights'); }], ['Timesheet', () => { UI.insTab = 'time'; go('insights'); }],
    ['Engineering calculators', () => { UI.toolTab = 'calc'; go('tools'); }], ['Compare datasheets / offers', () => { UI.toolTab = 'compare'; go('tools'); }],
    ['CRS responses', () => { UI.toolTab = 'crs'; go('tools'); }], ['Meeting minutes → tasks', () => { UI.toolTab = 'minutes'; go('tools'); }], ['Ask your register (Ctrl+J)', () => openAsk()], ['Waiting on others', () => { UI.insTab = 'waiting'; go('insights'); }], ['Hand-over pack', () => { UI.insTab = 'reports'; UI.repKind = 'handover'; go('insights'); }], ['Document register', () => { UI.docTab = 'register'; go('docs'); }],
    ['New expense', () => { go('money'); ACT['mon-new']({ dataset: { kind: 'expense' } }); }], ['New income', () => { go('money'); ACT['mon-new']({ dataset: { kind: 'income' } }); }], ['Import a bank statement', () => { UI.mon.tab = 'import'; go('money'); }], ['Expense from a receipt photo', () => { UI.mon.tab = 'receipts'; go('money'); }],
    ['Full backup (.json)', () => exportJSON()], ['Recycle bin', () => { go('setup'); setTimeout(() => document.getElementById('set-bin')?.scrollIntoView(), 80); }],
    ...(DESKTOP && DK.status().desktop && DK.status().desktop.locked ? [['Lock now', () => showLock()]] : []),
  ];
  for (const [v, l] of views) if (!nq || E.normMatch('go to ' + l).includes(nq)) add('Go to', l, () => go(v));
  for (const [l, f] of acts) if (!nq || E.normMatch(l).includes(nq)) add('Actions', l, f);
  if (q.trim().length > 2 && St.sample) add('Ask Claude', `Ask: “${q.trim()}”`, () => openAsk(q.trim()));
  if (nq) {
    const words = nq.split(' ');
    const hit = s => { const h = E.normMatch(s); return words.every(w => h.includes(w)); };
    for (const t of St.tasks.values()) if (hit([t.ref, t.title, t.project, topicOf(t), t.owner].join(' '))) add('Tasks', `${t.ref} · ${E.clip(t.title, 80)}`, () => openDrawer('task', t.id), t.status === 'done' ? 'done' : t.project || '');
    for (const e of St.emails.values()) if (hit([e.subject, e.from].join(' '))) add('Emails', E.clip(e.subject || '(no subject)', 80), () => openDrawer('email', e.id), fmtDate(e.date || e.importedAt));
    for (const p of projectsList()) if (hit(p)) add('Projects', p, () => { UI.mapFocus = 'p:' + E.normMatch(p); UI.todoMode = 'map'; UI.map.fitted = false; go('todo'); }, 'canvas');
  }
  return out.slice(0, 40);
}
function renderPalette() {
  const m = $('#modal'); PAL.items = paletteItems(PAL.q); PAL.i = Math.min(PAL.i, Math.max(0, PAL.items.length - 1));
  let g = '';
  const rows = PAL.items.map((it, i) => { const head = it.group !== g ? `<div class="pal-g">${esc(it.group)}</div>` : ''; g = it.group; return head + `<button class="pal-item ${i === PAL.i ? 'on' : ''}" data-act="pal-run" data-i="${i}"><span dir="auto">${esc(it.label)}</span>${it.hint ? `<span class="small muted">${esc(it.hint)}</span>` : ''}</button>`; }).join('');
  const body = `<div class="card palette" role="dialog" aria-label="Search and commands"><input class="input" id="pal-in" placeholder="Search tasks, emails, projects, or type a command…" value="${esc(PAL.q)}" autocomplete="off" dir="auto"><div class="pal-list" id="pal-list">${rows || '<p class="small muted" style="padding:10px">Nothing found.</p>'}</div><div class="small muted pal-foot">↑ ↓ to move · Enter to open · Esc to close</div></div>`;
  if (PAL.open && $('#pal-in')) { $('#pal-list').innerHTML = deco(rows || '<p class="small muted" style="padding:10px">Nothing found.</p>'); return; }
  m.innerHTML = deco(body); m.hidden = false; m.classList.add('top'); PAL.open = true;
  const inp = $('#pal-in'); inp.focus(); inp.setSelectionRange(PAL.q.length, PAL.q.length);
}
function openPalette() { PAL.q = ''; PAL.i = 0; PAL.open = false; renderPalette(); }
function closePalette() { PAL.open = false; const m = $('#modal'); m.hidden = true; m.classList.remove('top'); }
function runPal(i) { const it = PAL.items[i]; if (!it) return; closePalette(); it.run(); }
document.addEventListener('input', e => { if (e.target && e.target.id === 'pal-in') { PAL.q = e.target.value; PAL.i = 0; renderPalette(); } });
document.addEventListener('keydown', e => {
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); PAL.open && !$('#modal').hidden ? closePalette() : openPalette(); return; }
  if (!PAL.open) return;
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); PAL.i = Math.min(PAL.items.length - 1, PAL.i + 1); renderPalette(); $('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); PAL.i = Math.max(0, PAL.i - 1); renderPalette(); $('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') { e.preventDefault(); runPal(PAL.i); }
});
Object.assign(ACT, { palette: () => openPalette(), 'pal-run': el => runPal(+el.dataset.i) });

/* ---------- keyboard shortcuts help (?) ---------- */
const SHORTCUTS = [
  ['Anywhere', [['Ctrl K', 'Search and commands'], ['Ctrl N', 'Quick add for today'], ['Ctrl J', 'Ask your register'], ['Ctrl Shift Space', 'Quick add from any program (desktop)'], ['Ctrl Shift P', 'Privacy mode on/off'], ['?', 'This list'], ['Esc', 'Close panels']]],
  ['Canvas', [['V H K', 'Select, pan, task'], ['N T', 'Sticky note, text'], ['R O D', 'Rectangle, ellipse, diamond'], ['A L C', 'Arrow, line, connector'], ['P M E', 'Pen, highlighter, eraser'], ['F', 'Frame'], ['Space + drag', 'Pan'], ['Ctrl Z / Ctrl Shift Z', 'Undo / redo'], ['Ctrl D', 'Duplicate'], ['Del', 'Delete selection'], ['Shift F', 'Full screen'], ['← →', 'Next / previous project in presentation mode']]],
];
function openShortcuts() {
  const m = $('#modal');
  m.innerHTML = deco(`<div class="card shortcuts" role="dialog" aria-label="Keyboard shortcuts"><div class="row"><b>⌨ Keyboard shortcuts</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    ${SHORTCUTS.map(([g, list]) => `<div><div class="label" style="margin:8px 0 6px">${esc(g)}</div><dl class="kv sc">${list.map(([k, v]) => `<dt>${k.split(' / ').map(x => `<kbd>${esc(x)}</kbd>`).join(' / ')}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>`).join('')}</div>`);
  m.hidden = false;
}
document.addEventListener('keydown', e => {
  if (e.key === '?' && !(e.target.closest && e.target.closest('input,textarea,select,[contenteditable]')) && $('#modal').hidden) { e.preventDefault(); openShortcuts(); }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); togglePrivacy(); }
});

/* ---------- privacy mode: blur names, addresses and email text on screen ---------- */
function togglePrivacy(on) { UI.privacy = on === undefined ? !UI.privacy : on; document.body.classList.toggle('privacy', UI.privacy); toast(UI.privacy ? 'Privacy mode on — names and email text are blurred.' : 'Privacy mode off.'); }
Object.assign(ACT, { privacy: () => togglePrivacy() });

/* ---------- recycle bin (30 days) ---------- */
HOOKS.deleted.push((kind, obj) => { if (obj && obj.id) colPut('trash', { id: kind + ':' + obj.id, kind, data: clone(obj), deletedAt: nowISO() }); });
HOOKS.taskChanged.push((before, t) => { if (!before && St.cols.trash.has('task:' + t.id)) colDel('trash', 'task:' + t.id); });
HOOKS.ready.push(() => { const cut = Date.now() - 30 * 864e5; for (const x of colList('trash')) if (new Date(x.deletedAt) < cut) colDel('trash', x.id); });
function binHTML() {
  const list = colList('trash').sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  return `<section class="card pad set-sec" id="set-bin"><div class="section-title"><h2>🗑 Recycle bin</h2></div>
    <p class="small muted" style="margin:0">Deleted tasks and email records are kept here for 30 days.</p>
    ${list.length ? `<div class="register">${list.slice(0, 100).map(x => `<div class="erow"><time>${esc(fmtDate(x.deletedAt.slice(0, 10)))}</time><div style="min-width:0"><div class="s" dir="auto">${esc(x.kind === 'task' ? (x.data.ref || '') + ' ' + (x.data.title || '') : x.data.subject || '(no subject)')}</div><div class="f">${x.kind === 'task' ? 'Task' : 'Email record'}</div></div><div class="tside"><button class="btn sm" data-act="bin-restore" data-id="${esc(x.id)}">Restore</button><button class="btn ghost sm danger" data-act="bin-purge" data-id="${esc(x.id)}">Delete forever</button></div></div>`).join('')}</div>` : '<p class="small muted">The bin is empty.</p>'}
  </section>`;
}
Object.assign(ACT, {
  'bin-restore': el => { const x = St.cols.trash.get(el.dataset.id); if (!x) return; if (x.kind === 'task') putTask(clone(x.data)); else putEmail(clone(x.data)); colDel('trash', x.id); render(); toast('Restored.'); },
  'bin-purge': el => { colDel('trash', el.dataset.id); render(); },
});

/* ---------- focus mode: top 3 tasks and a 25-minute timer ---------- */
const FOCUS = { taskId: null, end: 0, left: 25 * 60, running: false, timer: null, startedAt: null };
function focusTasks() {
  return openMine().filter(t => isMine(t) && t.status !== 'waiting')
    .sort((a, b) => ((b.deadline && b.deadline < T()) - (a.deadline && a.deadline < T())) || ((b.deadline === T()) - (a.deadline === T())) || ((b.status === 'in_progress') - (a.status === 'in_progress')) || (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2) || (a.deadline || '9').localeCompare(b.deadline || '9')).slice(0, 3);
}
function focusHTML() {
  const list = focusTasks(); if (!FOCUS.taskId && list[0]) FOCUS.taskId = list[0].id;
  const mm = String(Math.floor(FOCUS.left / 60)).padStart(2, '0'), ss = String(FOCUS.left % 60).padStart(2, '0');
  return `<div class="focus-card"><div class="row"><b>🎯 Focus</b><span class="spacer"></span><button class="btn ghost sm" data-act="focus-close">Leave focus (Esc)</button></div>
    <div class="focus-timer num" id="focus-timer">${mm}:${ss}</div>
    <div class="row" style="justify-content:center">${FOCUS.running ? '<button class="btn" data-act="focus-pause">⏸ Pause</button>' : `<button class="btn primary" data-act="focus-start">▶ ${FOCUS.left < 25 * 60 ? 'Resume' : 'Start 25 minutes'}</button>`}<button class="btn ghost" data-act="focus-reset">↺ Reset</button></div>
    <div class="focus-list">${list.length ? list.map((t, i) => { const d = dueInfo(t); return `<label class="focus-item ${FOCUS.taskId === t.id ? 'on' : ''}"><input type="radio" name="focus-t" data-chg="focus-pick" value="${esc(t.id)}" ${FOCUS.taskId === t.id ? 'checked' : ''}><span class="fi-n">${i + 1}</span><span class="fi-t"><b dir="auto">${esc(t.title)}</b><small>${esc(t.ref)} · ${esc(d.txt)}${t.nextStep ? ' · next: ' + esc(E.clip(t.nextStep, 60)) : ''}</small></span><button class="btn sm" data-act="toggle-done" data-id="${esc(t.id)}">✓ Done</button></label>`; }).join('') : '<p class="muted">Nothing open — enjoy the quiet.</p>'}</div>
    <p class="small muted" style="text-align:center;margin:0">Time is added to the selected task’s timesheet when the timer ends or you pause.</p></div>`;
}
function openFocus() { let el = $('#focus'); if (!el) { el = document.createElement('div'); el.id = 'focus'; el.className = 'focus-mode'; document.body.appendChild(el); } el.hidden = false; el.innerHTML = deco(focusHTML()); }
function closeFocus() { if (FOCUS.running) focusPause(); const el = $('#focus'); if (el) el.hidden = true; }
function focusTick() {
  FOCUS.left = Math.max(0, Math.round((FOCUS.end - Date.now()) / 1000));
  const n = $('#focus-timer'); if (n) n.textContent = String(Math.floor(FOCUS.left / 60)).padStart(2, '0') + ':' + String(FOCUS.left % 60).padStart(2, '0');
  if (!FOCUS.left) { focusPause(); FOCUS.left = 25 * 60; deskNotify('Focus session done', 'Take a short break.', 'daily'); const el = $('#focus'); if (el && !el.hidden) el.innerHTML = deco(focusHTML()); }
}
function focusStart() { if (!FOCUS.taskId) return; FOCUS.running = true; FOCUS.startedAt = nowISO(); FOCUS.end = Date.now() + FOCUS.left * 1000; clearInterval(FOCUS.timer); FOCUS.timer = setInterval(focusTick, 1000); openFocus(); }
function focusPause() {
  if (!FOCUS.running) return;
  FOCUS.running = false; clearInterval(FOCUS.timer);
  const mins = Math.round((Date.now() - new Date(FOCUS.startedAt)) / 60000);
  if (mins >= 1 && typeof logTime === 'function') logTime(FOCUS.taskId, FOCUS.startedAt, nowISO(), 'focus');
  openFocus();
}
Object.assign(ACT, {
  'focus-mode': () => openFocus(), 'focus-close': () => closeFocus(), 'focus-start': () => focusStart(), 'focus-pause': () => focusPause(),
  'focus-reset': () => { if (FOCUS.running) focusPause(); FOCUS.left = 25 * 60; openFocus(); },
});
Object.assign(CHG, { 'focus-pick': el => { if (FOCUS.running) focusPause(); FOCUS.taskId = el.value; openFocus(); } });
document.addEventListener('keydown', e => { const f = $('#focus'); if (e.key === 'Escape' && f && !f.hidden) closeFocus(); });
// the focus view refreshes when tasks change (e.g. ticked done)
HOOKS.afterRender.push(() => { const f = $('#focus'); if (f && !f.hidden) f.innerHTML = deco(focusHTML()); });

/* ---------- phone "More" menu ---------- */
Object.assign(ACT, {
  'more-menu': () => {
    const m = $('#modal');
    m.innerHTML = deco(`<div class="card more-sheet" role="dialog" aria-label="More"><div class="row"><b>More</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
      ${[['docs', '📄 Documents'], ['insights', '📊 Insights'], ['notebook', '📓 Notebook'], ['money', '💰 Money'], ['tools', '🛠 Tools'], ['setup', '⚙ Setup']].map(([v, l]) => `<button class="btn more-btn" data-act="more-go" data-view="${v}">${l}</button>`).join('')}
      <button class="btn more-btn" data-act="palette">🔎 Search and commands</button></div>`);
    m.hidden = false;
  },
  'more-go': el => { $('#modal').hidden = true; go(el.dataset.view); },
});

/* ---------- print ---------- */
Object.assign(ACT, { print: () => window.print() });
