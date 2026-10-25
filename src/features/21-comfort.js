/* ---------- Comfort: Today window, pop-outs, choose your tabs, everything to Excel, tasks from Excel, password-protected backups, manager dashboard, appraisal pack, tour and demo data ---------- */

/* --- the small "Today" window (tray) and views on a second monitor --- */
const MINI = typeof location !== 'undefined' && /[?&]mini=1/.test(location.search);
VIEWS.push('mini');
VIEW_FN.mini = () => {
  const today = T(), mine = [...St.tasks.values()].filter(t => t.status !== 'done' && isMine(t) && t.status !== 'waiting' && !(t.snoozeUntil && t.snoozeUntil > today));
  const planned = mine.filter(t => (t.days || []).includes(today) || t.status === 'in_progress');
  const due = mine.filter(t => !planned.includes(t) && t.deadline && t.deadline <= E.addDays(today, 2));
  const doneToday = [...St.tasks.values()].filter(t => t.completedAt && dayOf(t.completedAt) === today);
  const row = t => `<li class="mini-t ${t.status === 'done' ? 'done' : ''}"><input type="checkbox" data-chg="mini-done" data-id="${esc(t.id)}" ${t.status === 'done' ? 'checked' : ''} aria-label="Done"><span dir="auto">${esc(t.title)}</span>${t.deadline ? `<span class="small ${dueInfo(t).cls === 'over' ? 'crit' : 'muted'}">${esc(dueInfo(t).txt)}</span>` : ''}</li>`;
  return `<div class="mini-view"><div class="row"><b>Today</b><span class="small muted">${esc(fmtDate(today, { weekday: 'long', day: 'numeric', month: 'short' }))}</span><span class="spacer"></span><span class="chip ok">${doneToday.length} done</span></div>
    <input class="input hold-render" id="mini-add" placeholder="Add a task for today… (Enter)" dir="auto">
    <div class="label">Planned and in progress</div><ul class="mini-list">${planned.map(row).join('') || '<li class="small muted">Nothing planned — add above, or plan in Daily.</li>'}</ul>
    ${due.length ? `<div class="label">Due soon</div><ul class="mini-list">${due.slice(0, 8).map(row).join('')}</ul>` : ''}
    ${doneToday.length ? `<details><summary class="small">Done today (${doneToday.length})</summary><ul class="mini-list">${doneToday.map(row).join('')}</ul></details>` : ''}
    ${MINI ? '' : '<button class="btn sm" data-act="nav" data-view="todo">Back to the app</button>'}</div>`;
};
Object.assign(CHG, { 'mini-done': el => { const t = clone(St.tasks.get(el.dataset.id)); if (!t) return; if (el.checked) { t.status = 'done'; t.completedAt = nowISO(); } else { t.status = 'todo'; t.completedAt = null; } t.updatedAt = nowISO(); (t.history = t.history || []).push({ at: nowISO(), text: el.checked ? 'Done (Today window)' : 'Reopened' }); putTask(t); render(); } });
document.addEventListener('keydown', e => {
  if (e.target && e.target.id === 'mini-add' && e.key === 'Enter') { const v = e.target.value.trim(); if (!v) return; e.target.value = ''; e.target.blur(); const t = makeTask({ title: v, days: [T()], history: [{ at: nowISO(), text: 'Added in the Today window' }] }); putTask(t); render(); setTimeout(() => $('#mini-add')?.focus(), 30); }
});
if (MINI || SUBWIN) document.documentElement.classList.add(MINI ? 'is-mini' : 'is-popout');
if (MINI) HOOKS.ready.push(() => { if (UI.view !== 'mini') go('mini'); });
function popOut(view) { if (DESKTOP) DK.call('win:open', { view }).catch(() => {}); }
Object.assign(ACT, { 'pop-out': el => popOut(el.dataset.view || UI.view), 'mini-open': () => DESKTOP && DK.call('win:open', { mini: true }) });

/* --- choose which tabs show in the side bar --- */
const TAB_CHOICES = [['daily', 'Daily'], ['review', 'Review'], ['import', 'Add emails'], ['emails', 'Emails'], ['docs', 'Documents'], ['insights', 'Insights'], ['plan', 'Plan'], ['notebook', 'Notebook'], ['money', 'Money'], ['tools', 'Tools']];
const hiddenTabs = () => new Set(St.settings.hiddenTabs || []);
HOOKS.afterRender.push(() => { const h = hiddenTabs(); document.querySelectorAll('.rail [data-nav], .tabbar [data-nav]').forEach(b => { b.hidden = h.has(b.dataset.nav); }); });
function tabsHTML() {
  const h = hiddenTabs();
  return `<section class="card pad set-sec" id="set-tabs" data-sec="Tabs and windows" style="display:grid;gap:10px"><div class="section-title"><h2>Tabs and windows</h2></div>
    <p class="small muted" style="margin:0">Hide the tabs you do not use; they stay reachable from the search (Ctrl+K). To-do and Setup always show.</p>
    <div class="row wrap-btns">${TAB_CHOICES.map(([k, l]) => `<label class="check small"><input type="checkbox" data-chg="tab-show" data-k="${k}" ${h.has(k) ? '' : 'checked'}>${esc(l)}</label>`).join('')}</div>
    ${DESKTOP ? `<div class="row"><button class="btn sm" data-act="mini-open">🗒 Open the small “Today” window</button><button class="btn sm" data-act="pop-out" data-view="todo">⧉ Open another window (for a second monitor)</button></div><p class="small muted" style="margin:0">The Today window stays on top and is also in the tray menu. Changes in any window show in the others at once.</p>` : ''}</section>`;
}
Object.assign(CHG, { 'tab-show': el => { saveSettings(s => { const h = new Set(s.hiddenTabs || []); el.checked ? h.delete(el.dataset.k) : h.add(el.dataset.k); s.hiddenTabs = [...h]; }); render(); } });

/* --- everything in one Excel workbook, and tasks from an Excel sheet --- */
async function exportAllXlsx() {
  const X = await E.need('xlsx'), wb = X.utils.book_new();
  const add = (name, rows) => { if (rows.length) { const ws = X.utils.json_to_sheet(rows); ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.min(50, Math.max(10, k.length + 4)) })); X.utils.book_append_sheet(wb, ws, name.slice(0, 31)); } };
  add('Tasks', [...St.tasks.values()].map(t => ({ Ref: t.ref, Title: t.title, Project: t.project || '', Topic: t.topic || '', Status: t.status, Priority: t.priority, Owner: t.ownership === 'mine' ? 'me' : t.owner || '', 'Requested by': t.requestedBy || '', Deadline: t.deadline || '', 'Next step': t.nextStep || '', Created: dayOf(t.createdAt) || '', Completed: dayOf(t.completedAt) || '', Notes: t.notes || '' })));
  add('Emails', [...St.emails.values()].map(e => ({ Date: dayOf(e.date) || '', From: e.from, Subject: e.subject, Attachments: (e.attachments || []).map(a => a.name).join('; '), Tasks: [...St.tasks.values()].filter(t => (t.emailIds || []).includes(e.id)).map(t => t.ref).join(' '), 'Filed on server': e.filed ? e.filed.path || 'yes' : '' })));
  add('Documents', colList('docreg').map(d => ({ Number: d.number, Title: d.title, Project: d.project, Revision: d.revision, Code: d.code, Status: d.status, Date: d.date })));
  add('Daily log', [...St.daily.values()].map(d => ({ Date: d.date, Kind: d.kind, Text: d.text })));
  add('Time', colList('time').map(x => ({ Task: (St.tasks.get(x.taskId) || {}).title || '', Start: x.start, End: x.end || '', Minutes: Math.round(entryMs(x) / 60000) })));
  add('Money', colList('money').map(x => ({ Date: x.date, Type: x.kind, Description: x.payee || '', Category: x.category || '', Amount: (x.kind === 'income' ? 1 : -1) * (+x.amount || 0), Currency: x.currency || '' })));
  add('Procurement', colList('procure').map(x => ({ Item: x.item, Tag: x.tag, Supplier: x.supplier, Stage: x.status, 'PO no.': x.pono, 'PO date': x.po, 'Lead (weeks)': x.lead, Needed: x.need, Expected: prState(x).exp })));
  add('Equipment', colList('equip').map(x => ({ Tag: x.tag, Description: x.desc, Project: x.project, Area: x.area, Qty: x.qty, Duty: x.duty, kW: x.kw, Supplier: x.supplier, Datasheet: x.ds, Status: x.status })));
  add('Transmittals RFIs', colList('eng').map(x => ({ No: x.no, Kind: x.kind, Date: x.date, Project: x.project, To: x.to, Subject: x.subj || '', Answered: x.answered || '' })));
  add('Contacts', colList('contacts').map(c => ({ Name: c.name, Company: c.company, Title: c.title, Email: c.email, Phone: (c.phones || []).join(', ') })));
  await offerFile(`action-register-all-${T()}.xlsx`, new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })]));
}
const TASK_COLS = [{ k: 'title', label: 'Title', match: ['title', 'task', 'action', 'description', 'activity'] }, { k: 'project', label: 'Project', match: ['project'] }, { k: 'owner', label: 'Owner', match: ['owner', 'responsible', 'assigned', 'by'] }, { k: 'deadline', label: 'Due', date: true, match: ['due', 'deadline', 'target', 'date'] }, { k: 'priority', label: 'Priority', match: ['priority'] }, { k: 'status', label: 'Status', match: ['status', 'state'] }, { k: 'notes', label: 'Notes', match: ['note', 'comment', 'remark'] }];
async function importTasksXlsx(file) {
  const X = await E.need('xlsx'), wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', cellDates: true });
  const grid = X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
  const hi = grid.findIndex(r => r.some(c => /title|task|action|description|activity/i.test(String(c)))); if (hi < 0) throw new Error('No column called Title, Task or Action was found.');
  const head = grid[hi].map(h => E.normMatch(String(h)));
  const idx = Object.fromEntries(TASK_COLS.map(f => [f.k, head.findIndex(h => h && f.match.some(m => h.includes(m)))]));
  const me = E.normMatch(St.settings.me.name || '~'); let n = 0;
  for (const r of grid.slice(hi + 1)) {
    const g = k => idx[k] >= 0 ? r[idx[k]] : '', title = String(g('title')).trim(); if (!title) continue;
    const owner = String(g('owner')).trim(), mine = !owner || /^me$/i.test(owner) || E.normMatch(owner) === me;
    const pr = E.normMatch(String(g('priority'))), st = E.normMatch(String(g('status')));
    const dl = g('deadline') instanceof Date ? g('deadline').toISOString().slice(0, 10) : monDate(g('deadline'));
    putTask(makeTask({ title, project: String(g('project')).trim(), ownership: mine ? 'mine' : 'waiting', owner: mine ? 'me' : owner, deadline: dl || null, priority: /crit|urgent/.test(pr) ? 'critical' : /high|h$/.test(pr) ? 'high' : /low/.test(pr) ? 'low' : 'medium', status: /done|closed|complete/.test(st) ? 'done' : /progress|ongoing/.test(st) ? 'in_progress' : 'todo', completedAt: /done|closed|complete/.test(st) ? nowISO() : null, notes: String(g('notes')).trim(), history: [{ at: nowISO(), text: `Imported from ${file.name}` }] })); n++;
  }
  return n;
}
Object.assign(ACT, { 'export-all-xlsx': () => exportAllXlsx().catch(e => toast('Export failed: ' + (e.message || e), { err: true })) });
Object.assign(CHG, { 'import-tasks-xlsx': async el => { const f = el.files[0]; if (!f) return; try { const n = await importTasksXlsx(f); toast(`${n} task${n === 1 ? '' : 's'} imported.`, { action: 'Open to-do', fn: () => go('todo') }); render(); } catch (e) { toast('Import failed: ' + (e.message || e), { err: true }); } } });

/* --- password-protected backup (AES-256-GCM, key from the password with PBKDF2-SHA256) --- */
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function bkKey(pass, salt, iter) { const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); }
async function encryptBackup(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 310000;
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await bkKey(pass, salt, iter), new TextEncoder().encode(JSON.stringify(obj))));
  return { app: 'action-register-encrypted', v: 1, kdf: 'PBKDF2-SHA256', iter, cipher: 'AES-256-GCM', salt: b64e(salt), iv: b64e(iv), data: b64e(data), exportedAt: nowISO() };
}
async function decryptBackup(d, pass) {
  try { const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(d.iv) }, await bkKey(pass, b64d(d.salt), d.iter || 310000), b64d(d.data)); return JSON.parse(new TextDecoder().decode(plain)); }
  catch { throw new Error('Wrong password, or the file is damaged.'); }
}
function passModal(title, confirm, onOk) {
  const m = $('#modal');
  m.innerHTML = deco(`<div class="card pad share-modal" role="dialog" aria-label="${esc(title)}"><div class="row"><b>${esc(title)}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <label class="field"><span>Password</span><input class="input" id="bk-p1" type="password" autocomplete="new-password"></label>
    ${confirm ? '<label class="field"><span>Same password again</span><input class="input" id="bk-p2" type="password" autocomplete="new-password"></label><p class="small muted" style="margin:0">Keep it safe: without the password the backup cannot be opened — not even by the app.</p>' : ''}
    <div class="row end"><span class="small crit" id="bk-err"></span><button class="btn primary" id="bk-ok">${confirm ? 'Save backup' : 'Open'}</button></div></div>`);
  m.hidden = false; $('#bk-p1').focus();
  const go = async () => {
    const p1 = $('#bk-p1').value, p2 = confirm ? $('#bk-p2').value : p1;
    if (confirm && p1.length < 8) { $('#bk-err').textContent = 'Use at least 8 characters.'; return; }
    if (p1 !== p2) { $('#bk-err').textContent = 'The two passwords differ.'; return; }
    $('#bk-ok').disabled = true;
    try { await onOk(p1); m.hidden = true; } catch (e) { $('#bk-err').textContent = e.message || String(e); $('#bk-ok').disabled = false; }
  };
  $('#bk-ok').onclick = go; m.querySelectorAll('input').forEach(i => i.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }));
}
function openEncrypted(d) { passModal('Open protected backup', false, async pass => { const plain = await decryptBackup(d, pass); await importData(plain); }); }
Object.assign(ACT, { 'export-enc': () => passModal('Password-protected backup', true, async pass => { const enc = await encryptBackup(await backupData(), pass); await offerFile(`action-register-backup-${T()}.arbak`, JSON.stringify(enc)); }) });
function backupExtraHTML() {
  return `<div class="row"><button class="btn" data-act="export-enc">🔒 Password-protected backup (.arbak)</button><button class="btn" data-act="export-all-xlsx">${I.download} Everything in one Excel workbook</button><label class="btn ghost" for="import-tasks-xlsx">⬆ Tasks from Excel…</label><input id="import-tasks-xlsx" type="file" accept=".xlsx,.xls,.csv" hidden data-chg="import-tasks-xlsx"><button class="btn ghost" data-act="mgr-dash">📊 Dashboard file for your manager</button></div>
    <p class="small muted" style="margin:0">Tasks from Excel: a sheet with a Title (or Task / Action) column; Project, Owner, Due, Priority, Status and Notes are used when present.</p>`;
}

/* --- a dashboard file to send to your manager: one HTML page, opens in any browser, no app needed --- */
function managerDashboard() {
  const all = [...St.tasks.values()], open = all.filter(t => t.status !== 'done'), today = T();
  const over = open.filter(t => t.deadline && t.deadline < today), week = open.filter(t => t.deadline && t.deadline >= today && t.deadline <= E.addDays(today, 7));
  const done30 = all.filter(t => t.completedAt && dayOf(t.completedAt) >= E.addDays(today, -30));
  const waiting = open.filter(t => t.ownership === 'waiting');
  const byP = new Map(); for (const t of all) { const p = t.project || 'No project'; if (!byP.has(p)) byP.set(p, { open: 0, done: 0, over: 0 }); const x = byP.get(p); t.status === 'done' ? x.done++ : x.open++; if (t.status !== 'done' && t.deadline && t.deadline < today) x.over++; }
  const docs = colList('docreg'), docOpen = docs.filter(d => /^[34]$/.test(d.code) && !d.closed && !d.resubmitted);
  const weeks = Array.from({ length: 8 }, (_, i) => E.addDays(weekStart(today), (i - 7) * 7)).map(w => ({ w, n: all.filter(t => t.completedAt && dayOf(t.completedAt) >= w && dayOf(t.completedAt) <= E.addDays(w, 6)).length }));
  const mx = Math.max(1, ...weeks.map(x => x.n));
  const li = t => `<tr><td>${esc(t.ref || '')}</td><td>${esc(t.title)}</td><td>${esc(t.project || '')}</td><td>${esc(t.ownership === 'waiting' ? t.owner : 'me')}</td><td>${t.deadline ? esc(fmtDate(t.deadline)) : ''}</td></tr>`;
  const css = `body{font:14px/1.45 "Segoe UI",Arial,sans-serif;color:#15201E;background:#EEF2F1;margin:0;padding:24px}main{max-width:1100px;margin:0 auto;display:grid;gap:16px}h1{margin:0;font-size:24px}.muted{color:#5B6B68}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}.tile,.card{background:#fff;border:1px solid #D7E0DE;border-radius:14px;padding:14px}.tile b{display:block;font-size:28px}.tile.crit b{color:#C62828}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #E3EAE8;vertical-align:top}th{color:#5B6B68;font-weight:600}.bars{display:flex;gap:8px;align-items:flex-end;height:120px}.bars div{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;font-size:11px;color:#5B6B68}.bars i{display:block;width:100%;background:#0A6B74;border-radius:4px 4px 0 0}h2{font-size:16px;margin:0 0 8px}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(St.settings.me.name || 'Work')} — status ${today}</title><style>${css}</style></head><body><main>
    <div><h1>${esc(St.settings.me.name || 'Work status')}</h1><div class="muted">${esc([St.settings.me.role, St.settings.me.org].filter(Boolean).join(', '))} · status on ${esc(fmtDate(today, { day: 'numeric', month: 'long', year: 'numeric' }))}</div></div>
    <div class="tiles"><div class="tile"><span class="muted">Open tasks</span><b>${open.length}</b></div><div class="tile ${over.length ? 'crit' : ''}"><span class="muted">Overdue</span><b>${over.length}</b></div><div class="tile"><span class="muted">Due in 7 days</span><b>${week.length}</b></div><div class="tile"><span class="muted">Done in 30 days</span><b>${done30.length}</b></div><div class="tile"><span class="muted">Waiting on others</span><b>${waiting.length}</b></div><div class="tile"><span class="muted">Documents to resubmit</span><b>${docOpen.length}</b></div></div>
    <div class="card"><h2>Completed per week</h2><div class="bars">${weeks.map(x => `<div><span>${x.n}</span><i style="height:${Math.round(x.n / mx * 90) + 2}px"></i><span>${esc(fmtDate(x.w, { day: 'numeric', month: 'short' }))}</span></div>`).join('')}</div></div>
    <div class="card"><h2>By project</h2><table><tr><th>Project</th><th>Open</th><th>Overdue</th><th>Done</th></tr>${[...byP.entries()].sort((a, b) => b[1].open - a[1].open).map(([p, x]) => `<tr><td>${esc(p)}</td><td>${x.open}</td><td>${x.over || ''}</td><td>${x.done}</td></tr>`).join('')}</table></div>
    ${over.length ? `<div class="card"><h2>Overdue</h2><table><tr><th>Ref</th><th>Task</th><th>Project</th><th>Owner</th><th>Due</th></tr>${over.map(li).join('')}</table></div>` : ''}
    <div class="card"><h2>Due in the next 7 days</h2><table><tr><th>Ref</th><th>Task</th><th>Project</th><th>Owner</th><th>Due</th></tr>${week.map(li).join('') || '<tr><td colspan="5" class="muted">None.</td></tr>'}</table></div>
    ${waiting.length ? `<div class="card"><h2>Waiting on others</h2><table><tr><th>Ref</th><th>Task</th><th>Project</th><th>Who</th><th>Due</th></tr>${waiting.map(li).join('')}</table></div>` : ''}
    ${docOpen.length ? `<div class="card"><h2>Documents returned Code 3/4, not yet resubmitted</h2><table><tr><th>Number</th><th>Title</th><th>Rev</th><th>Code</th></tr>${docOpen.map(d => `<tr><td>${esc(d.number)}</td><td>${esc(d.title || '')}</td><td>${esc(d.revision || '')}</td><td>${esc(d.code)}</td></tr>`).join('')}</table></div>` : ''}
    <p class="muted" style="font-size:12px">Made with Action Register. A snapshot — it does not change after it was made.</p></main></body></html>`;
}
Object.assign(ACT, { 'mgr-dash': () => offerFile(`status-${(St.settings.me.name || 'work').replace(/\W+/g, '-')}-${T()}.html`, managerDashboard(), 'text/html') });

/* --- appraisal pack: what you achieved over a period, ready for the yearly review --- */
INS_TABS.push(['appraisal', '🏆 Appraisal pack']);
INS_FN.appraisal = () => {
  const A = UI.ap || (UI.ap = { from: E.addDays(T(), -365), to: T(), text: null, busy: false });
  const M = apModel(A.from, A.to);
  return `<section class="card pad"><div class="section-title"><h2>Appraisal pack</h2></div>
    <p class="small muted" style="margin:0">Everything you finished and achieved in a period, by project — for your yearly or mid-year review. ${St.sample ? 'The AI can write a summary of your contributions from these facts (it does not add any).' : ''}</p>
    <div class="row"><label class="field" style="width:auto"><span>From</span><input class="input" type="date" value="${esc(A.from)}" data-chg="ap-d" data-k="from"></label><label class="field" style="width:auto"><span>To</span><input class="input" type="date" value="${esc(A.to)}" data-chg="ap-d" data-k="to"></label><span class="spacer"></span>${St.sample ? `<button class="btn" data-act="ap-ai" ${A.busy ? 'disabled' : ''}>${A.busy ? 'Writing…' : '✨ Write the summary'}</button>` : ''}<button class="btn primary" data-act="ap-word">📄 Word</button></div>
    <div class="mon-tiles">${[['Tasks completed', M.done.length], ['Achievements logged', M.ach.length], ['Documents approved', M.approved.length], ['Projects', M.projects.length], ['Hours tracked', Math.round(M.mins / 60)]].map(([l, v]) => `<div class="card pad mon-tile"><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
    ${A.text ? `<div class="label">Summary</div><div class="wr-out" dir="auto">${esc(A.text)}</div>` : ''}
    ${M.ach.length ? `<div class="label">Achievements</div><ul>${M.ach.map(a => `<li dir="auto">${esc(fmtDate(a.date))} — ${esc(a.text)}</li>`).join('')}</ul>` : ''}
    <div class="label">Completed work by project</div>${M.projects.map(([p, ts]) => `<details><summary><b>${esc(p)}</b> · ${ts.length}</summary><ul class="small">${ts.map(t => `<li dir="auto">${esc(t.title)} <span class="muted">· ${esc(fmtDate(dayOf(t.completedAt)))}</span></li>`).join('')}</ul></details>`).join('') || '<p class="muted">Nothing completed in this period.</p>'}</section>`;
};
function apModel(a, b) {
  const done = [...St.tasks.values()].filter(t => t.completedAt && dayOf(t.completedAt) >= a && dayOf(t.completedAt) <= b && isMine(t));
  const by = new Map(); for (const t of done) { const p = t.project || 'Other work'; if (!by.has(p)) by.set(p, []); by.get(p).push(t); }
  const ach = [...St.daily.values()].filter(d => d.kind === 'achievement' && d.date >= a && d.date <= b).sort((x, y) => x.date.localeCompare(y.date));
  const approved = colList('docreg').filter(d => (d.revs || []).some(r => /^[12]$/.test(r.code) && r.date >= a && r.date <= b));
  const mins = Math.round(colList('time').filter(e => dayOf(e.start) >= a && dayOf(e.start) <= b).reduce((s, e) => s + entryMs(e), 0) / 60000);
  return { done, ach, approved, mins, projects: [...by.entries()].sort((x, y) => y[1].length - x[1].length) };
}
Object.assign(CHG, { 'ap-d': el => { UI.ap[el.dataset.k] = el.value; UI.ap.text = null; render(); } });
Object.assign(ACT, {
  'ap-ai': async () => {
    const A = UI.ap, M = apModel(A.from, A.to); A.busy = true; render();
    try { const r = await St.sample.json(`Write the "achievements and contributions" part of an engineer's appraisal, first person, 150–250 words, grouped by theme (delivery, technical quality, coordination, improvements). Use ONLY these facts; do not invent numbers or results. Mention projects by name.\nPeriod: ${A.from} to ${A.to}. Role: ${St.settings.me.role || 'engineer'}.\nACHIEVEMENTS:\n${M.ach.map(x => '- ' + x.text).join('\n') || '(none logged)'}\nCOMPLETED TASKS BY PROJECT:\n${M.projects.map(([p, ts]) => `${p}: ${ts.slice(0, 40).map(t => t.title).join('; ')}`).join('\n')}\nDOCUMENTS APPROVED: ${M.approved.map(d => d.number).join(', ') || 'none'}\nReply JSON: {"text": "…"}`, { modelTier: 'default' }); A.text = String(r.text || ''); }
    catch (e) { toast('Failed: ' + (e.message || e.code), { err: true }); }
    A.busy = false; render();
  },
  'ap-word': async () => {
    const A = UI.ap, M = apModel(A.from, A.to);
    const blob = await docxDoc(`Appraisal pack — ${St.settings.me.name || ''}`, `${fmtDate(A.from, { day: 'numeric', month: 'long', year: 'numeric' })} to ${fmtDate(A.to, { day: 'numeric', month: 'long', year: 'numeric' })}`, [
      { table: { head: ['', ''], rows: [['Tasks completed', String(M.done.length)], ['Achievements logged', String(M.ach.length)], ['Documents approved', String(M.approved.length)], ['Hours tracked', String(Math.round(M.mins / 60))]] } },
      ...(A.text ? [{ h: 'Summary of contributions', p: A.text.split('\n') }] : []),
      ...(M.ach.length ? [{ h: 'Achievements', list: M.ach.map(a => `${fmtDate(a.date)} — ${a.text}`) }] : []),
      ...M.projects.map(([p, ts]) => ({ h: p, list: ts.map(t => `${t.title} (${fmtDate(dayOf(t.completedAt))})`) })),
      ...(M.approved.length ? [{ h: 'Documents approved', table: { head: ['Number', 'Title', 'Code'], rows: M.approved.map(d => [d.number || '', d.title || '', d.code || '']) } }] : []),
    ]);
    offerFile(`appraisal-pack-${A.from}-${A.to}.docx`, blob);
  },
});

/* --- tour of the app, and demo data to try it on --- */
const TOUR = [
  ['[data-nav="import"]', 'Add emails', 'Forward work emails to your Gmail address, or drop Outlook .msg files here. The AI reads each email with its attachments and proposes tasks.'],
  ['[data-nav="review"]', 'Review', 'Check the proposed tasks — each comes with the quote it was found in — and add them with one click.'],
  ['[data-nav="todo"]', 'To-do and canvas', 'Your tasks as a list, a board or a mind-map canvas by project. Drag, connect, draw, present.'],
  ['[data-nav="daily"]', 'Daily', 'Plan the day, log what your manager asks, and wrap up in the evening.'],
  ['[data-nav="plan"]', 'Plan', 'Calendar, timeline, how full each week is, contacts, vendors, meeting prep and the other side’s deadlines.'],
  ['[data-nav="documents"], [data-nav="docs"]', 'Documents', 'Every drawing and datasheet your emails mention, with its revision and review code.'],
  ['[data-nav="notebook"]', 'Notebook', 'Ask questions about a folder of specifications or contracts — answers quote the file and page.'],
  ['[data-nav="tools"]', 'Tools', 'Your own Excel tools, calculators, procurement, transmittals and RFIs, drawing compare, site visits and more.'],
  ['[data-nav="money"]', 'Money', 'Income and expenses, budgets, bank statements, receipts and work expenses to claim back.'],
  ['[data-nav="setup"]', 'Setup', 'Your name, Gmail, which AI, cloud sync between PCs, appearance — and Ctrl+K searches everything.'],
];
UI.tour = null;
function tourShow() {
  let o = $('#tour'); if (!o) { o = document.createElement('div'); o.id = 'tour'; document.body.appendChild(o); }
  const i = UI.tour; if (i === null) { o.hidden = true; return; }
  const [sel, h, p] = TOUR[i], el = [...document.querySelectorAll(sel)].find(x => x.offsetParent);
  const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2 - 100, top: 100, width: 200, height: 40, right: innerWidth / 2 + 100, bottom: 140 };
  const left = Math.min(innerWidth - 340, Math.max(12, r.right + 14)), top = Math.min(innerHeight - 200, Math.max(12, r.top - 10));
  o.hidden = false;
  o.innerHTML = deco(`<div class="tour-hole" style="left:${r.left - 6}px;top:${r.top - 6}px;width:${r.width + 12}px;height:${r.height + 12}px"></div><div class="tour-card card pad" role="dialog" aria-label="Tour" style="left:${left}px;top:${top}px"><div class="small muted">${i + 1} of ${TOUR.length}</div><b>${esc(h)}</b><p class="small" style="margin:6px 0 10px">${esc(p)}</p><div class="row"><button class="btn sm ghost" data-act="tour-end">Close</button><span class="spacer"></span>${i ? '<button class="btn sm" data-act="tour-step" data-d="-1">Back</button>' : ''}<button class="btn sm primary" data-act="tour-step" data-d="1">${i === TOUR.length - 1 ? 'Done' : 'Next'}</button></div></div>`);
}
Object.assign(ACT, {
  'tour-start': () => { UI.tour = 0; tourShow(); },
  'tour-step': el => { const n = UI.tour + +el.dataset.d; UI.tour = n >= TOUR.length || n < 0 ? null : n; if (UI.tour === null) try { localStorage.setItem('ar-toured', '1'); } catch {} tourShow(); },
  'tour-end': () => { UI.tour = null; try { localStorage.setItem('ar-toured', '1'); } catch {} tourShow(); },
  'demo-load': () => { demoLoad(); toast('Demo data added — look around. Remove it from Setup › Help when done.'); go('todo'); },
  'demo-remove': () => { let n = 0; for (const t of [...St.tasks.values()]) if (t.demo) { delTask(t.id); n++; } for (const c of ['procure', 'equip', 'money', 'docreg']) for (const x of colList(c)) if (x.demo) colDel(c, x.id); toast(`Demo data removed (${n} tasks).`); render(); },
});
addEventListener('resize', () => { if (UI.tour !== null) tourShow(); });
function demoLoad() {
  const d = n => E.addDays(T(), n), mk = o => putTask(makeTask({ demo: true, history: [{ at: nowISO(), text: 'Demo data' }], ...o }));
  mk({ title: 'Resubmit RAS pump hydraulic calculation Rev B', project: 'DEMO — Wastewater plant', topic: 'RAS pumps', priority: 'high', deadline: d(3), requestedBy: 'Consultant', nextStep: 'Add NPSH at minimum wet well level', days: [T()] });
  mk({ title: 'Reply to CRS comments on valve specification', project: 'DEMO — Wastewater plant', topic: 'Valves', priority: 'medium', deadline: d(6), requestedBy: 'Consultant' });
  mk({ title: 'Anchor bolt layout for blower building', project: 'DEMO — Wastewater plant', topic: 'Blowers', ownership: 'waiting', owner: 'Civil team', priority: 'medium', deadline: d(2) });
  mk({ title: 'Prepare FAT procedure for blowers', project: 'DEMO — Wastewater plant', topic: 'Blowers', priority: 'low', deadline: d(14) });
  mk({ title: 'Review pump datasheets from supplier', project: 'DEMO — Pump station', topic: 'Pumps', priority: 'high', deadline: d(-1), status: 'in_progress' });
  mk({ title: 'Send monthly progress report', project: 'DEMO — Pump station', priority: 'medium', deadline: d(5) });
  mk({ title: 'Confirm cable sizes with electrical', project: 'DEMO — Pump station', ownership: 'waiting', owner: 'Electrical team', deadline: d(4) });
  mk({ title: 'Mark up the P&ID for the sludge line', project: 'DEMO — Wastewater plant', status: 'done', completedAt: nowISO() });
  colPut('procure', { id: E.uid('pr'), demo: true, item: 'RAS pumps (2 duty + 1 standby)', tag: 'P-101A/B/C', project: 'DEMO — Wastewater plant', supplier: 'Demo Pumps Co.', status: 'po', po: d(-60), lead: 14, need: d(30) });
  colPut('procure', { id: E.uid('pr'), demo: true, item: 'Aeration blowers', tag: 'BL-201A/B', project: 'DEMO — Wastewater plant', supplier: 'Demo Blowers Ltd', status: 'tbe', lead: 20, need: d(90) });
  colPut('equip', { id: E.uid('eq'), demo: true, tag: 'P-101A', desc: 'RAS pump', project: 'DEMO — Wastewater plant', qty: 1, duty: '410 m³/h @ 14.5 m', kw: 22, status: 'po' });
  colPut('docreg', { id: E.uid('dr'), demo: true, number: 'DEMO-ME-CAL-0012', title: 'RAS pump hydraulic calculation', project: 'DEMO — Wastewater plant', revision: 'A', code: '3', status: 'returned', date: d(-5), revs: [{ rev: 'A', status: 'submitted', date: d(-20) }, { rev: 'A', code: '3', status: 'returned', date: d(-5) }] });
}
function helpHTML() {
  const demo = [...St.tasks.values()].some(t => t.demo);
  return `<section class="card pad set-sec" id="set-help" data-sec="Help" style="display:grid;gap:10px"><div class="section-title"><h2>Help</h2></div>
    <div class="row"><button class="btn" data-act="tour-start">🧭 Take the tour (1 minute)</button>${demo ? '<button class="btn ghost danger" data-act="demo-remove">Remove the demo data</button>' : '<button class="btn" data-act="demo-load">🧪 Add demo data to try things</button>'}<button class="btn" data-act="palette">⌨ Search and commands (Ctrl+K)</button></div>
    <p class="small muted" style="margin:0">Demo tasks and items are marked “DEMO” and are removed in one click. The step-by-step setup guide (cloud sync, Gmail, AI keys) is in the docs folder of the app’s GitHub page.</p></section>`;
}
HOOKS.ready.push(() => { try { if (!SUBWIN && !localStorage.getItem('ar-toured') && St.settings.setupDone && St.tasks.size === 0 && !navigator.webdriver) setTimeout(() => { if (UI.tour === null) { UI.tour = 0; tourShow(); } }, 1500); } catch {} });
