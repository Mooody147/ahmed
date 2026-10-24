/* ---------- Setup: section index and the extra sections ---------- */
VIEW_FN.setup = () => {
  const extra = [projectMetaHTML(), rulesHTML(), workweekHTML(), appearanceHTML(), automationHTML(), templatesHTML(), recurringHTML(), DESKTOP ? usageHTML() : '', binHTML()].join('');
  const h = viewSetup().replace('<!--SETUP-EXTRA-->', extra);
  const secs = [...h.matchAll(/<section[^>]*\bid="([^"]+)"[^>]*\bdata-sec="([^"]+)"/g)].map(m => [m[1], m[2]]);
  return `<div class="set-layout"><nav class="set-index" aria-label="Setup sections">${secs.map(([id, l]) => `<button data-act="set-jump" data-id="${esc(id)}">${esc(l)}</button>`).join('')}</nav><div class="set-main">${h}</div></div>`;
};
Object.assign(ACT, { 'set-jump': el => document.getElementById(el.dataset.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) });
const saveSettings = mut => { const s = clone(St.settings); mut(s); putSettings(s); };

/* --- project colours and icons --- */
const PROJ_ICONS = ['', 'pump', 'valve', 'pipe', 'tank', 'blower', 'building', 'screen', 'bolt', 'drop', 'gear'];
Object.assign(ICON_PATHS, {
  pump: '<circle cx="10" cy="13" r="6"/><circle cx="10" cy="13" r="2"/><path d="M14 8.5V4h6v4M4 20h12"/>',
  valve: '<path d="M3 8v8l9-4zM21 8v8l-9-4zM12 12V5M9 5h6"/>',
  pipe: '<path d="M3 9h9a4 4 0 0 1 4 4v8M3 15h9M10 21h12M3 7v10"/>',
  tank: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  blower: '<circle cx="12" cy="12" r="8"/><path d="M12 12c0-3 2-5 5-5M12 12c3 0 5 2 5 5M12 12c0 3-2 5-5 5M12 12c-3 0-5-2-5-5"/>',
  building: '<path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M8 11h.01M12 11h.01M16 11h.01"/>',
  screen: '<path d="M5 3v18M9 3v18M13 3v18M17 3v18M3 6h18M3 18h18"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  drop: '<path d="M12 3c3.3 4 6 7.2 6 10.4a6 6 0 0 1-12 0C6 10.2 8.7 7 12 3z"/>',
});
const HUE_CHOICES = [186, 214, 256, 288, 334, 4, 22, 40, 120, 150];
const projMeta = name => (St.settings.projectMeta || {})[E.normMatch(name || '')] || {};
function projectMetaHTML() {
  const list = projectsList(); if (!list.length) return '';
  return `<section class="card pad set-sec" id="set-projects" data-sec="Project colours"><div class="section-title"><h2>Project colours and icons</h2></div>
    <p class="small muted" style="margin:0">Used for the project everywhere: canvas, lists, Daily and reports.</p>
    <div class="pm-list">${list.map(p => { const m = projMeta(p); return `<div class="pm-row">${projBadge(p)}<b dir="auto">${esc(p)}</b><span class="spacer"></span>
      <div class="row pm-hues">${HUE_CHOICES.map(h => `<button class="sw" style="--c:hsl(${h} 55% 46%)" data-act="pm-set" data-p="${esc(p)}" data-k="hue" data-v="${h}" aria-label="Colour" aria-pressed="${m.hue === h}" ${m.hue === h ? 'data-on="1"' : ''}></button>`).join('')}</div>
      <select class="input pm-icon" data-chg="pm-icon" data-p="${esc(p)}" aria-label="Icon">${PROJ_ICONS.map(i => `<option value="${i}" ${(m.icon || '') === i ? 'selected' : ''}>${i ? i[0].toUpperCase() + i.slice(1) : 'Initials'}</option>`).join('')}</select></div>`; }).join('')}</div></section>`;
}
function setProjMeta(p, k, v) { saveSettings(s => { s.projectMeta = s.projectMeta || {}; const key = E.normMatch(p); s.projectMeta[key] = { ...(s.projectMeta[key] || {}), [k]: v }; }); render(); }
Object.assign(ACT, { 'pm-set': el => setProjMeta(el.dataset.p, el.dataset.k, +el.dataset.v) });
Object.assign(CHG, { 'pm-icon': el => setProjMeta(el.dataset.p, 'icon', el.value) });

/* --- email rules --- */
const rulesList = () => Array.isArray(St.settings.rules) ? St.settings.rules : [];
function rulesHTML() {
  const r = rulesList(), projs = projectsList();
  return `<section class="card pad set-sec" id="set-rules" data-sec="Email rules"><div class="section-title"><h2>Email rules</h2></div>
    <p class="small muted" style="margin:0">Applied to Claude's proposals before you review them. For example: subject contains “CRS” and sender contains “consultant” → priority High, project ELM. Leave a box empty to ignore it.</p>
    ${r.length ? `<div class="rules">${r.map(x => `<div class="rule">
      <span class="label">If</span><input class="input" placeholder="sender contains…" value="${esc(x.from || '')}" data-chg="rule-f" data-id="${esc(x.id)}" data-f="from"><input class="input" placeholder="subject contains…" value="${esc(x.subject || '')}" data-chg="rule-f" data-id="${esc(x.id)}" data-f="subject">
      <span class="label">then</span><input class="input" list="projlist2" placeholder="project" value="${esc(x.project || '')}" data-chg="rule-f" data-id="${esc(x.id)}" data-f="project">
      <select class="input" data-chg="rule-f" data-id="${esc(x.id)}" data-f="priority"><option value="">priority as found</option>${Object.entries(PRIO).map(([k, v]) => `<option value="${k}" ${x.priority === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="input" data-chg="rule-f" data-id="${esc(x.id)}" data-f="ownership"><option value="">owner as found</option>${Object.entries(OWNERSHIP).map(([k, v]) => `<option value="${k}" ${x.ownership === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input class="input" placeholder="topic" value="${esc(x.topic || '')}" data-chg="rule-f" data-id="${esc(x.id)}" data-f="topic">
      <label class="check small"><input type="checkbox" data-chg="rule-f" data-id="${esc(x.id)}" data-f="skip" ${x.skip ? 'checked' : ''}>No tasks (FYI only)</label>
      <button class="icon-btn" data-act="rule-del" data-id="${esc(x.id)}" aria-label="Delete rule">${I.x}</button></div>`).join('')}</div><datalist id="projlist2">${projs.map(p => `<option value="${esc(p)}">`).join('')}</datalist>` : ''}
    <div class="row"><button class="btn sm" data-act="rule-add">${I.plus} Add rule</button></div></section>`;
}
Object.assign(ACT, {
  'rule-add': () => { saveSettings(s => { s.rules = [...rulesList(), { id: E.uid('r'), from: '', subject: '', project: '', priority: '', ownership: '', topic: '', skip: false }]; }); render(); },
  'rule-del': el => { saveSettings(s => { s.rules = rulesList().filter(x => x.id !== el.dataset.id); }); render(); },
});
Object.assign(CHG, { 'rule-f': el => { saveSettings(s => { s.rules = rulesList().map(x => x.id === el.dataset.id ? { ...x, [el.dataset.f]: el.type === 'checkbox' ? el.checked : el.value.trim() } : x); }); } });
const ruleMatches = (r, em) => (r.from || r.subject) && (!r.from || E.normMatch(em.from + ' ' + (em.forwardedBy || '')).includes(E.normMatch(r.from))) && (!r.subject || E.normMatch(em.subject).includes(E.normMatch(r.subject)));
HOOKS.proposals.push((an, em) => {
  for (const r of rulesList()) {
    if (!ruleMatches(r, em)) continue;
    if (r.skip) { an.tasks = []; an.actionRequired = false; an.noActionReason = `Marked FYI by your rule (${[r.from, r.subject].filter(Boolean).join(' / ')}).`; continue; }
    for (const p of an.tasks) {
      if (r.project) p.project = r.project; if (r.priority) p.priority = r.priority; if (r.topic) p.topic = r.topic;
      if (r.ownership) { p.ownership = r.ownership; if (r.ownership === 'mine') p.owner = 'me'; }
      p.ruleApplied = true;
    }
  }
});

/* --- working days and holidays --- */
const DAYNAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const workweek = () => Object.assign({ weekend: [5, 6], holidays: '' }, St.settings.workweek || {});
const holidayList = () => workweek().holidays.split('\n').map(l => l.trim()).map(l => /^(\d{4}-\d{2}-\d{2})\s*(.*)$/.exec(l)).filter(Boolean).map(m => ({ date: m[1], name: m[2] }));
function isWorkingDay(iso) { const d = new Date(iso + 'T12:00:00').getDay(); return !workweek().weekend.includes(d) && !holidayList().some(h => h.date === iso); }
function addWorkingDays(iso, n) { let d = iso, k = 0; while (k < n) { d = E.addDays(d, 1); if (isWorkingDay(d)) k++; } return d; }
function workweekHTML() {
  const w = workweek();
  return `<section class="card pad set-sec" id="set-workweek" data-sec="Working days"><div class="section-title"><h2>Working days and holidays</h2></div>
    <p class="small muted" style="margin:0">Claude counts “within 10 working days” with these, and recurring tasks skip non-working days.</p>
    <div class="row">${DAYNAMES.map((n, i) => `<label class="check small"><input type="checkbox" data-chg="ww-day" data-d="${i}" ${w.weekend.includes(i) ? '' : 'checked'}>${n.slice(0, 3)}</label>`).join('')}</div>
    <label class="field"><span>Public holidays — one per line: YYYY-MM-DD name</span><textarea class="input" rows="4" data-chg="ww-hol" placeholder="2026-12-25 Christmas" dir="auto">${esc(w.holidays)}</textarea></label></section>`;
}
Object.assign(CHG, {
  'ww-day': el => { const d = +el.dataset.d; saveSettings(s => { const w = workweek(); const we = new Set(w.weekend); el.checked ? we.delete(d) : we.add(d); s.workweek = { ...w, weekend: [...we].sort() }; }); },
  'ww-hol': el => { saveSettings(s => { s.workweek = { ...workweek(), holidays: el.value }; }); },
});
// Extra lines for the analysis prompt: working week, holidays, learned corrections
function promptNotes(em) {
  const w = workweek(), lines = [];
  const work = DAYNAMES.filter((_, i) => !w.weekend.includes(i));
  lines.push(`Working days are ${work.join(', ')}; ${w.weekend.map(i => DAYNAMES[i]).join(' and ') || 'no day'} ${w.weekend.length === 1 ? 'is' : 'are'} the weekend. When a deadline is given in working days, skip weekends and the holidays below.`);
  const soon = holidayList().filter(h => h.date >= T() && h.date <= E.addDays(T(), 120));
  if (soon.length) lines.push('Public holidays: ' + soon.map(h => `${h.date}${h.name ? ' (' + h.name + ')' : ''}`).join(', ') + '.');
  if (typeof learnedNotes === 'function') { const l = learnedNotes(em); if (l) lines.push(l); }
  return lines.join('\n');
}

/* --- automation --- */
function automationHTML() {
  const a = autoPrefs(), d = DESKTOP ? (DK.status().desktop || {}) : null;
  const sel = (key, opts, v) => `<select class="input" data-chg="auto-f" data-f="${key}" style="width:auto">${opts.map(([x, l]) => `<option value="${x}" ${String(v) === String(x) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const dsk = (k, label, sub) => `<label class="check"><input type="checkbox" data-chg="sys-f" data-f="${k}" ${d[k] ? 'checked' : ''}><span>${label}${sub ? `<br><span class="small muted">${sub}</span>` : ''}</span></label>`;
  return `<section class="card pad set-sec" id="set-auto" data-sec="Automation"><div class="section-title"><h2>Automation</h2></div>
    <div class="set-rows">
      <div class="set-row"><div><b>Check Gmail in the background</b><div class="small muted">While the app is open${DESKTOP ? ' or in the tray' : ''}.</div></div>${sel('gmailEvery', [[0, 'Off'], [5, 'Every 5 minutes'], [10, 'Every 10 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes'], [60, 'Every hour']], a.gmailEvery)}</div>
      <div class="set-row"><div><b>Morning reminder</b><div class="small muted">${DESKTOP ? 'A notification with what is due and overdue.' : 'A message with what is due and overdue.'}</div></div><div class="row">${sel('morning', [[true, 'On'], [false, 'Off']], a.morning)}<input class="input" type="time" value="${esc(a.morningAt)}" data-chg="auto-f" data-f="morningAt" style="width:auto"></div></div>
      <div class="set-row"><div><b>Morning briefing by Claude</b><div class="small muted">A 5-line summary at the top of To-do, written once a day (quick model, small cost).</div></div>${sel('briefing', [[true, 'On'], [false, 'Off']], a.briefing !== false)}</div>
      ${DESKTOP ? `<div class="set-row"><div><b>Daily backup</b><div class="small muted mono" style="word-break:break-all">${esc(d.backupDir || '')}</div></div><div class="row">${sel('backup', [[true, 'On'], [false, 'Off']], a.backup)}<button class="btn sm" data-act="sys-folder" data-f="backupDir">Change folder…</button><button class="btn sm" data-act="backup-now">Back up now</button></div></div>` : ''}
    </div>
    ${DESKTOP ? `<div class="grid2" style="margin-top:8px">
      ${dsk('closeToTray', 'Keep running in the tray when the window is closed', 'Gmail keeps being checked; right-click the tray icon to quit.')}
      ${dsk('notify', 'Show Windows notifications', 'New tasks to review, the morning reminder, timer finished.')}
      ${dsk('startWithWindows', 'Start with Windows')}
      ${dsk('startHidden', 'Start hidden in the tray', 'Only when started with Windows.')}
      ${dsk('autoUpdate', 'Install updates automatically', `This is version ${esc(DK.status().version)}. New versions download in the background.`)}
    </div>
    <div class="set-rows" style="margin-top:8px">
      <div class="set-row"><div><b>Quick add from any program</b><div class="small muted">Keyboard shortcut that opens the quick-add box.</div></div><input class="input mono" style="width:240px" value="${esc(d.hotkey || '')}" data-chg="sys-f" data-f="hotkey" placeholder="CommandOrControl+Shift+Space"></div>
      <div class="set-row"><div><b>Watch folder</b><div class="small muted">Files you save here (for example Outlook messages dragged from Outlook) are imported automatically and moved to “Imported”.</div>${d.watchDir ? `<div class="small mono" style="word-break:break-all">${esc(d.watchDir)}</div>` : ''}</div><div class="row"><button class="btn sm" data-act="sys-folder" data-f="watchDir">${d.watchDir ? 'Change…' : 'Choose folder…'}</button>${d.watchDir ? `<button class="btn sm" data-act="open-path" data-p="${esc(d.watchDir)}">Open</button><button class="btn ghost sm" data-act="sys-clear" data-f="watchDir">Turn off</button>` : ''}</div></div>
      <div class="set-row"><div><b>Data folder</b><div class="small muted">Move it into OneDrive or Google Drive to keep it backed up or use it on a second computer (never open it on two computers at the same time).</div><div class="small mono" style="word-break:break-all">${esc(DK.dataDir())}</div></div><button class="btn sm" data-act="data-move">Move…</button></div>
      <div class="set-row"><div><b>PIN lock</b><div class="small muted">Ask for a PIN when the app opens.</div></div><div class="row">${d.locked ? '<button class="btn sm" data-act="lock-now">Lock now</button><button class="btn ghost sm danger" data-act="pin-clear">Remove PIN</button>' : '<input class="input" id="pin-new" type="password" inputmode="numeric" maxlength="8" placeholder="4–8 digits" style="width:120px"><button class="btn sm" data-act="pin-set">Set PIN</button>'}</div></div>
    </div>` : ''}
  </section>`;
}
Object.assign(CHG, {
  'auto-f': el => { const v = el.value === 'true' ? true : el.value === 'false' ? false : /^\d+$/.test(el.value) ? +el.value : el.value; saveSettings(s => { s.auto = { ...autoPrefs(), [el.dataset.f]: v }; }); },
  'sys-f': async el => { const v = el.type === 'checkbox' ? el.checked : el.value.trim(); const st = await DK.call('sys:prefs', { [el.dataset.f]: v }).catch(e => { toast(e.message || 'Could not save.', { err: true }); return null; }); DK.refresh(); if (st && el.dataset.f === 'hotkey' && !st.hotkeyOk) toast('That shortcut could not be registered — another program may use it.', { err: true }); render(); },
});
Object.assign(ACT, {
  'sys-folder': async el => { const cur = (DK.status().desktop || {})[el.dataset.f]; const dir = await DK.call('sys:choose-folder', { title: 'Choose a folder', current: cur }).catch(() => ''); if (!dir) return; await DK.call('sys:prefs', { [el.dataset.f]: dir }); DK.refresh(); render(); },
  'sys-clear': async el => { await DK.call('sys:prefs', { [el.dataset.f]: '' }); DK.refresh(); render(); },
  'open-path': el => DK.call('shell:openPath', el.dataset.p).catch(() => {}),
  'backup-now': async () => { try { const r = await DK.call('backup:write', { name: `action-register-backup-${T()}.json`, text: JSON.stringify(await backupData()) }); lsSet('ar-backup', T()); toast('Backup saved: ' + r.path); } catch (e) { toast('Backup failed: ' + (e.message || e.code), { err: true }); } },
  'data-move': async () => { try { const r = await DK.call('data:move'); toast(r.usedExisting ? 'Found existing data there — restarting to use it.' : 'Data copied — restarting from the new folder.'); } catch (e) { if (e.code !== 'cancelled') toast('Could not move the data: ' + (e.message || e.code), { err: true }); } },
  'pin-set': async () => { const pin = ($('#pin-new') || {}).value || ''; try { await DK.call('lock:set', { pin }); DK.refresh(); render(); toast('PIN set. The app will ask for it when it opens.'); } catch (e) { toast(e.message || 'Could not set the PIN.', { err: true }); } },
  'pin-clear': async () => { await DK.call('lock:set', { pin: '' }); DK.refresh(); render(); toast('PIN removed.'); },
});

/* --- checklist templates --- */
const DEFAULT_TEMPLATES = [
  { id: 'tpl-pump', name: 'Pump submittal', items: 'Datasheet (duty point, NPSHr, efficiency)\nPerformance curves at duty and run-out\nGA and foundation drawing\nMotor datasheet (kW, IP, efficiency class)\nNPSH available calculation\nMaterial certificates\nFactory test procedure (ISO 9906)\nO&M and spare parts list' },
  { id: 'tpl-valve', name: 'Valve submittal', items: 'Valve schedule (tag, DN, PN, type)\nDatasheets per valve type\nActuator datasheets (IP rating, torque)\nGA drawings\nCoating specification\nTest certificates (EN 12266)\nInstallation instructions' },
  { id: 'tpl-site', name: 'Site visit', items: 'Agree scope and access\nPPE and permit\nPhotos of each area\nSnag list\nMeasurements to confirm\nMinutes of meeting issued' },
  { id: 'tpl-rfq', name: 'RFQ / tender evaluation', items: 'Clarification list issued\nOffers received\nTechnical bid evaluation table\nDeviations listed\nCommercial comparison\nRecommendation issued' },
];
const templatesList = () => Array.isArray(St.settings.templates) ? St.settings.templates : DEFAULT_TEMPLATES;
function templatesHTML() {
  return `<section class="card pad set-sec" id="set-templates" data-sec="Checklists"><div class="section-title"><h2>Checklist templates</h2></div>
    <p class="small muted" style="margin:0">Add one to any task from its details panel. One item per line.</p>
    <div class="tpls">${templatesList().map(t => `<div class="tpl"><div class="row"><input class="input" value="${esc(t.name)}" data-chg="tpl-f" data-id="${esc(t.id)}" data-f="name" aria-label="Template name"><button class="icon-btn" data-act="tpl-del" data-id="${esc(t.id)}" aria-label="Delete template">${I.x}</button></div><textarea class="input" rows="5" data-chg="tpl-f" data-id="${esc(t.id)}" data-f="items" dir="auto">${esc(t.items)}</textarea></div>`).join('')}</div>
    <div class="row"><button class="btn sm" data-act="tpl-add">${I.plus} Add template</button></div></section>`;
}
Object.assign(ACT, {
  'tpl-add': () => { saveSettings(s => { s.templates = [...templatesList(), { id: E.uid('tpl'), name: 'New checklist', items: '' }]; }); render(); },
  'tpl-del': el => { saveSettings(s => { s.templates = templatesList().filter(x => x.id !== el.dataset.id); }); render(); },
  'tpl-apply': el => {
    const id = ($('#d-tpl') || {}).value; const tpl = templatesList().find(x => x.id === id); const t0 = UI.drawer && St.tasks.get(UI.drawer.id); if (!tpl || !t0) return;
    const t = clone(t0); const have = new Set(subsOf(t).map(x => E.normMatch(x.text)));
    const add = tpl.items.split('\n').map(x => x.trim()).filter(x => x && !have.has(E.normMatch(x))).map(text => ({ id: E.uid('s'), text, ref: '', location: '', done: false }));
    t.subtasks = [...subsOf(t), ...add]; (t.history = t.history || []).push({ at: nowISO(), text: `Checklist added: ${tpl.name} (${add.length} items)` });
    putTask(t); render(); renderDrawer(); toast(`${add.length} items added from “${tpl.name}”.`);
  },
});
Object.assign(CHG, { 'tpl-f': el => { saveSettings(s => { s.templates = templatesList().map(x => x.id === el.dataset.id ? { ...x, [el.dataset.f]: el.value } : x); }); } });

/* --- recurring tasks --- */
const recurList = () => Array.isArray(St.settings.recurring) ? St.settings.recurring : [];
function recurDue(r, day) {
  if (r.last === day || !isWorkingDay(day) && r.freq !== 'weekly' && r.freq !== 'monthly') return false;
  const d = new Date(day + 'T12:00:00');
  if (r.freq === 'workdays') return isWorkingDay(day);
  if (r.freq === 'weekly') return d.getDay() === +r.weekday;
  if (r.freq === 'monthly') return d.getDate() === Math.min(+r.monthday || 1, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate());
  return false;
}
function runRecurring() {
  const day = T(); const made = [];
  for (const r of recurList()) {
    if (!r.title || !recurDue(r, day)) continue;
    const t = makeTask({ title: r.title, project: r.project || '', priority: r.priority || 'medium', source: 'recurring', days: [day], deadline: day, deadlineBasis: 'explicit', history: [{ at: nowISO(), text: `Created by the recurring task “${r.title}”` }] });
    if (r.template) { const tpl = templatesList().find(x => x.id === r.template); if (tpl) t.subtasks = tpl.items.split('\n').map(x => x.trim()).filter(Boolean).map(text => ({ id: E.uid('s'), text, ref: '', location: '', done: false })); }
    if (r.project) t.projectLocked = true;
    putTask(t); made.push(r.id);
  }
  if (made.length) { saveSettings(s => { s.recurring = recurList().map(x => made.includes(x.id) ? { ...x, last: day } : x); }); toast(`${made.length} recurring task${made.length > 1 ? 's' : ''} added for today.`); render(); }
}
HOOKS.ready.push(() => setTimeout(runRecurring, 2500));
let recurDay = ''; HOOKS.afterRender.push(() => { if (recurDay && recurDay !== T()) setTimeout(runRecurring, 500); recurDay = T(); });
function recurringHTML() {
  const list = recurList(), projs = projectsList();
  return `<section class="card pad set-sec" id="set-recurring" data-sec="Recurring tasks"><div class="section-title"><h2>Recurring tasks</h2></div>
    <p class="small muted" style="margin:0">Created automatically on the day they are due, and put on that day’s plan.</p>
    ${list.length ? `<div class="rules">${list.map(r => `<div class="rule">
      <input class="input" placeholder="Task title, e.g. Weekly progress meeting" value="${esc(r.title || '')}" data-chg="rec-f" data-id="${esc(r.id)}" data-f="title" style="flex:2;min-width:220px">
      <select class="input" data-chg="rec-f" data-id="${esc(r.id)}" data-f="freq"><option value="weekly" ${r.freq === 'weekly' ? 'selected' : ''}>Every week</option><option value="monthly" ${r.freq === 'monthly' ? 'selected' : ''}>Every month</option><option value="workdays" ${r.freq === 'workdays' ? 'selected' : ''}>Every working day</option></select>
      ${r.freq === 'monthly' ? `<input class="input" type="number" min="1" max="31" value="${esc(r.monthday || 1)}" data-chg="rec-f" data-id="${esc(r.id)}" data-f="monthday" style="width:80px" aria-label="Day of month">` : r.freq === 'workdays' ? '' : `<select class="input" data-chg="rec-f" data-id="${esc(r.id)}" data-f="weekday">${DAYNAMES.map((n, i) => `<option value="${i}" ${+r.weekday === i ? 'selected' : ''}>${n}</option>`).join('')}</select>`}
      <input class="input" list="projlist3" placeholder="project" value="${esc(r.project || '')}" data-chg="rec-f" data-id="${esc(r.id)}" data-f="project">
      <select class="input" data-chg="rec-f" data-id="${esc(r.id)}" data-f="template"><option value="">no checklist</option>${templatesList().map(t => `<option value="${esc(t.id)}" ${r.template === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
      <button class="icon-btn" data-act="rec-del" data-id="${esc(r.id)}" aria-label="Delete">${I.x}</button></div>`).join('')}</div><datalist id="projlist3">${projs.map(p => `<option value="${esc(p)}">`).join('')}</datalist>` : ''}
    <div class="row"><button class="btn sm" data-act="rec-add">${I.plus} Add recurring task</button></div></section>`;
}
Object.assign(ACT, {
  'rec-add': () => { saveSettings(s => { s.recurring = [...recurList(), { id: E.uid('rc'), title: '', freq: 'weekly', weekday: 0, monthday: 1, project: '', priority: 'medium', template: '', last: '' }]; }); render(); },
  'rec-del': el => { saveSettings(s => { s.recurring = recurList().filter(x => x.id !== el.dataset.id); }); render(); },
});
Object.assign(CHG, { 'rec-f': el => { saveSettings(s => { s.recurring = recurList().map(x => x.id === el.dataset.id ? { ...x, [el.dataset.f]: el.value } : x); }); if (el.dataset.f === 'freq') render(); } });

/* --- Claude usage and estimated cost (desktop) --- */
// List prices per million tokens (Anthropic API, October 2026). Cache writes are estimated at 1.25× input.
const PRICES = { 'claude-opus-5-5': { in: 4, out: 20, cr: 0.2 }, 'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.2 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5, cr: 0.01 } };
function usageCost(model, u) { const p = PRICES[Object.keys(PRICES).find(k => String(model).startsWith(k))]; if (!p) return null; return (u.input * p.in + u.output * p.out + u.cacheRead * p.cr + u.cacheWrite * p.in * 1.25) / 1e6; }
function usageMonth(month) { const m = ((DK && DK.status().usage) || {})[month] || {}; let calls = 0, cost = 0, unknown = false; for (const [model, u] of Object.entries(m)) { calls += u.calls; const c = usageCost(model, u); if (c === null) unknown = true; else cost += c; } return { rows: m, calls, cost, unknown }; }
function usageHTML() {
  const month = new Date().toISOString().slice(0, 7), u = usageMonth(month);
  return `<section class="card pad set-sec" id="set-usage" data-sec="Usage and cost"><div class="section-title"><h2>Claude usage this month</h2></div>
    ${u.calls ? `<table class="tbl"><thead><tr><th>Model</th><th>Calls</th><th>Input</th><th>Output</th><th>Cached read</th><th>Estimated cost</th></tr></thead><tbody>${Object.entries(u.rows).map(([m, x]) => { const c = usageCost(m, x); return `<tr><td class="mono">${esc(m)}</td><td class="num">${x.calls}</td><td class="num">${(x.input / 1000).toFixed(1)}k</td><td class="num">${(x.output / 1000).toFixed(1)}k</td><td class="num">${(x.cacheRead / 1000).toFixed(1)}k</td><td class="num">${c === null ? '—' : '$' + c.toFixed(2)}</td></tr>`; }).join('')}</tbody></table>
    <p class="small muted" style="margin:0">About <b>$${u.cost.toFixed(2)}</b> so far this month${u.unknown ? ' (some models have no price on file)' : ''}. Estimate from list prices; your Anthropic invoice is the exact figure (console.anthropic.com › Billing).</p>` : '<p class="small muted" style="margin:0">No Claude calls yet this month.</p>'}
  </section>`;
}

// "Add checklist" in the task panel
TASK_ACTIONS.push(t => templatesList().length ? `<span class="row tpl-pick"><select class="input" id="d-tpl" aria-label="Checklist template">${templatesList().map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</select><button class="btn sm" data-act="tpl-apply">${I.plus} Checklist</button></span>` : '');
