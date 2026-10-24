/* ---------- email files: originals and attachments kept, filing on the company server, open in Outlook ---------- */
// Every analysed email keeps its original (.msg / .eml, FILES 'emails') and each attachment (FILES 'attachments').
// Emails with tasks ask to be filed on the company server: a folder name with the email's date is suggested,
// and on the desktop the email and its attachments can be copied there in one click.
const srvPrefs = () => Object.assign({ root: '', byProject: true, pattern: '{date} - {project} - {subject} - {from}', dateFmt: 'YYYY-MM-DD', keep: true }, St.settings.server || {});
const extOf = (kind, name) => { const m = /\.(msg|eml)$/i.exec(name || ''); return m ? m[1].toLowerCase() : kind === 'msg' ? 'msg' : 'eml'; };
HOOKS.emailStored.push(async (rec, b) => {
  if (srvPrefs().keep === false) return;
  try {
    const e = clone(St.emails.get(rec.id) || rec); let changed = false;
    if (b.original && b.original.bytes) {
      const ext = extOf(b.original.kind, b.original.name), fileId = rec.id + '.' + ext;
      await FILES.save('emails', fileId, b.original.bytes, { name: b.original.name });
      e.original = { fileId, name: /\.(msg|eml)$/i.test(b.original.name) ? b.original.name : (b.original.name || 'email') + '.' + ext, kind: ext, size: b.original.bytes.length }; changed = true;
    }
    for (let i = 0; i < b.atts.length; i++) {
      const a = b.atts[i]; if (!a.bytes || !e.attachments || !e.attachments[i]) continue;
      const fileId = rec.id + '_' + i; await FILES.save('attachments', fileId, a.bytes, { name: a.name.split(' › ').pop(), emailId: rec.id });
      e.attachments[i] = { ...e.attachments[i], fileId }; changed = true;
    }
    if (changed) putEmail(e);
  } catch (err) { console.warn('keeping email files', err); }
});

/* --- the folder name --- */
const winSafe = s => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').replace(/[ .]+$/, '').trim();
function fmtFolderDate(iso, f) { const [y, m, d] = (iso || T()).split('-'); return f === 'DD.MM.YYYY' ? `${d}.${m}.${y}` : f === 'YYYYMMDD' ? y + m + d : f === 'DD-MM-YYYY' ? `${d}-${m}-${y}` : `${y}-${m}-${d}`; }
function folderName(e, t) {
  const p = srvPrefs();
  const subject = String(e.subject || '').replace(/^\s*((re|fw|fwd|aw|wg)\s*:\s*|\[external\]\s*)+/gi, '').replace(/\[external\]\s*/gi, '').trim();
  const from = (String(e.from || '').replace(/<[^>]*>/g, '').replace(/"/g, '').trim()) || (e.fromEmail || '').split('@')[0];
  const project = (t && t.project) || (e.analysis && e.analysis.project) || '';
  const parts = { date: fmtFolderDate(dayOf(e.date || e.importedAt), p.dateFmt), project, subject: E.clip(subject, 70).replace(/…$/, ''), from, ref: t ? t.ref : '' };
  let name = p.pattern.replace(/\{(\w+)\}/g, (_, k) => parts[k] || '');
  name = name.replace(/(\s*-\s*){2,}/g, ' - ').replace(/^\s*-\s*|\s*-\s*$/g, '');
  return winSafe(name).slice(0, 140);
}
const isFiled = e => !!(e && (e.filed || e.filedSkip));
const taskEmails = t => (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean);
const unfiled = t => taskEmails(t).filter(e => !isFiled(e));

/* --- filing panel --- */
function openFiling(taskId, emailId) {
  const t = taskId && St.tasks.get(taskId);
  const list = emailId ? [St.emails.get(emailId)].filter(Boolean) : t ? taskEmails(t) : [];
  if (!list.length) { toast('This task has no email to file.'); return; }
  const p = srvPrefs(), m = $('#modal');
  m.innerHTML = deco(`<div class="card pad filing" role="dialog" aria-label="File on the company server"><div class="row"><b>📁 Saved on the company server?</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <p class="small muted" style="margin:0">Suggested folder for each email — named with the date it arrived. ${DESKTOP ? (p.root ? `Saving goes to <span class="mono">${esc(p.root)}</span>${p.byProject ? ' › project' : ''}.` : 'Choose your server folder once and the app makes the folder and copies the email and its attachments into it.') : 'Copy the name, make the folder on the server and put the email in it — or download the email and attachments as a ZIP.'}</p>
    ${list.map(e => { const name = folderName(e, t); const files = 1 + (e.attachments || []).filter(a => a.fileId).length; return `<section class="file-row" data-eid="${esc(e.id)}">
      <div class="small"><b dir="auto">${esc(e.subject || '(no subject)')}</b> <span class="muted" dir="auto">· ${esc(e.from || '')} · ${esc(fmtDate(dayOf(e.date || e.importedAt), { day: 'numeric', month: 'short', year: 'numeric' }))}</span></div>
      ${e.filed ? `<div class="chip ok">✓ Filed ${esc(fmtDate(dayOf(e.filed.at)))}${e.filed.path ? ' · ' + esc(e.filed.path) : ''}</div>` : e.filedSkip ? '<div class="chip">Not needed</div>' : ''}
      <div class="row" style="flex-wrap:nowrap"><input class="input mono" data-fname="${esc(e.id)}" value="${esc(name)}" aria-label="Folder name"><button class="btn sm" data-act="file-copy" data-id="${esc(e.id)}">Copy name</button></div>
      <div class="row">${DESKTOP ? `<button class="btn sm primary" data-act="file-save" data-id="${esc(e.id)}" ${e.original ? '' : 'title="Only the attachments were kept for this email"'}>Save to server (${files} file${files > 1 ? 's' : ''})</button>` : ''}
        <button class="btn sm" data-act="file-zip" data-id="${esc(e.id)}">⬇ ZIP with this name</button>
        ${e.filed ? '' : `<button class="btn sm ghost" data-act="file-mark" data-id="${esc(e.id)}">I saved it</button><button class="btn sm ghost" data-act="file-skip" data-id="${esc(e.id)}">Not needed</button>`}
        ${e.filed && e.filed.path && DESKTOP ? `<button class="btn sm ghost" data-act="file-openfolder" data-id="${esc(e.id)}">Open folder</button>` : ''}</div></section>`; }).join('')}
    <div class="row end"><button class="btn ghost sm" data-act="nav-setup-server">Folder name and server settings</button></div></div>`);
  m.hidden = false;
}
const fnameOf = id => { const i = document.querySelector(`[data-fname="${CSS.escape(id)}"]`); return winSafe(i ? i.value : ''); };
function markFiled(id, patch) { const e = clone(St.emails.get(id)); if (!e) return; Object.assign(e, patch); putEmail(e); }
async function emailFiles(e) {
  const out = [];
  if (e.original && e.original.fileId) { const b = await FILES.load('emails', e.original.fileId); if (b) out.push({ name: e.original.name || 'email.' + e.original.kind, bytes: b }); }
  for (const a of e.attachments || []) { if (!a.fileId) continue; const b = await FILES.load('attachments', a.fileId); if (b) out.push({ name: a.name.split(' › ').pop(), bytes: b }); }
  return out;
}
async function fileToServer(id) {
  const e = St.emails.get(id); if (!e) return;
  const name = fnameOf(id) || folderName(e); let p = srvPrefs();
  try {
    if (!p.root) { const root = await DK.call('files:pickFolder', { title: 'Choose the company server folder (e.g. the project correspondence folder)' }); saveSettings(s => { s.server = { ...srvPrefs(), root }; }); await DK.call('sys:prefs', { serverRoots: [...new Set([...((DK.status().desktop || {}).serverRoots || []), root])] }).catch(() => {}); p = srvPrefs(); }
    const t = [...St.tasks.values()].find(x => (x.emailIds || []).includes(id));
    const proj = winSafe((t && t.project) || (e.analysis && e.analysis.project) || '');
    const sep = /\\/.test(p.root) || DK.status().platform === 'win32' ? '\\' : '/';
    const folder = p.root.replace(/[\\/]+$/, '') + (p.byProject && proj ? sep + proj : '') + sep + name;
    let n = 0;
    if (e.original && e.original.fileId) { await DK.call('files:copyTo', { kind: 'emails', id: e.original.fileId, folder, name: e.original.name }); n++; }
    for (const a of e.attachments || []) if (a.fileId) { await DK.call('files:copyTo', { kind: 'attachments', id: a.fileId, folder, name: a.name.split(' › ').pop() }); n++; }
    if (!n) { toast('No email file or attachments were kept for this email — save it from Outlook instead.', { err: true }); return; }
    markFiled(id, { filed: { at: nowISO(), path: folder, by: 'app' }, filedSkip: false });
    toast(`Saved ${n} file${n > 1 ? 's' : ''} to ${folder}`, { action: 'Open folder', fn: () => DK.call('files:openFolder', { folder }) });
    const t2 = t && t.id; openFiling(t2, t2 ? null : id);
  } catch (err) { if (!err || err.code !== 'cancelled') toast('Could not save to the server: ' + ((err && err.message) || err), { err: true }); }
}
async function fileZip(id) {
  const e = St.emails.get(id); if (!e) return; const name = fnameOf(id) || folderName(e);
  const files = await emailFiles(e); if (!files.length) { toast('No email file or attachments were kept for this email.', { err: true }); return; }
  const Z = await E.need('jszip'); const zip = new Z(); const dir = zip.folder(name); for (const f of files) dir.file(f.name, f.bytes);
  await offerFile(name + '.zip', await zip.generateAsync({ type: 'blob' }));
}

/* --- open in Outlook --- */
async function openMail(emailId) {
  const e = St.emails.get(emailId); if (!e) return;
  if (DESKTOP) {
    toast('Looking for the email in Outlook…');
    try {
      const r = await DK.call('outlook:open', { messageId: e.messageId || '', subject: e.subject || '', from: e.fromEmail || '', date: e.date || '', fileId: e.original && e.original.fileId, name: e.original && e.original.name });
      if (r.how === 'outlook') toast('Opened in Outlook.');
      else if (r.how === 'file') toast(r.why === 'NO_OUTLOOK' || r.why === 'NOT_WINDOWS' ? 'Opened the saved copy of the email.' : 'Not found in your Outlook folders — opened the saved copy instead.');
      else if (e.gmailUrl) { DK.call('shell:openExternal', e.gmailUrl).catch(() => {}); toast('Opened the forward in Gmail.'); }
      else toast('No copy of this email was kept, and it was not found in Outlook.', { err: true });
    } catch (err) { toast('Could not open the email: ' + ((err && err.message) || err), { err: true }); }
    return;
  }
  if (e.original && e.original.fileId) return FILES.open('emails', e.original.fileId, e.original.name);
  if (e.gmailUrl) { window.open(e.gmailUrl, '_blank'); return; }
  openDrawer('email', e.id);
}
const latestEmail = t => taskEmails(t).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];

/* --- on the canvas, the task panel and after approving --- */
NODE_EXTRA.push(t => { const em = taskEmails(t); if (!em.length) return ''; const todo = em.filter(e => !isFiled(e)).length;
  return `<button class="mmail" data-map="mail" title="Open the email in Outlook">✉</button>${todo ? `<button class="mfile todo" data-map="file" title="Saved on the company server? (${todo} not yet)">📁?</button>` : '<button class="mfile" data-map="file" title="Filed on the company server">📁✓</button>'}`; });
MAP_BTN.mail = id => { const t = St.tasks.get(id); const e = t && latestEmail(t); if (e) openMail(e.id); };
MAP_BTN.file = id => openFiling(id);
TASK_ACTIONS.push(t => { const em = taskEmails(t); if (!em.length) return ''; const todo = em.filter(e => !isFiled(e)).length;
  return `<button class="btn sm ghost" data-act="mail-open-outlook" data-id="${esc(t.id)}">✉ Open email in Outlook</button><button class="btn sm ${todo ? '' : 'ghost'}" data-act="file-task" data-id="${esc(t.id)}">📁 ${todo ? 'Save to company server…' : 'Filed on the server'}</button>`; });
let filePromptQ = new Set(), filePromptT = null;
HOOKS.approved.push(e => {
  if (!e || !(e.attachments || e.original)) return;
  const hasTask = [...St.tasks.values()].some(t => (t.emailIds || []).includes(e.id)); if (!hasTask) return;
  filePromptQ.add(e.id); clearTimeout(filePromptT);
  filePromptT = setTimeout(() => { const ids = [...filePromptQ].filter(id => !isFiled(St.emails.get(id))); filePromptQ = new Set(); if (!ids.length) return;
    toast(`Save ${ids.length === 1 ? 'this email' : ids.length + ' emails'} on the company server?`, { action: 'File now', fn: () => { const t = [...St.tasks.values()].find(x => (x.emailIds || []).includes(ids[0])); ids.length === 1 ? openFiling(t && t.id, t ? null : ids[0]) : (UI.view = 'docs', UI.docTab = 'tofile', render()); } }); }, 600);
});

/* --- Documents › To file --- */
function docToFile() {
  const rows = [...St.emails.values()].filter(e => !isFiled(e) && [...St.tasks.values()].some(t => (t.emailIds || []).includes(e.id))).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const done = [...St.emails.values()].filter(e => e.filed).length;
  return rows.length ? `<p class="small muted">${rows.length} email${rows.length > 1 ? 's' : ''} with tasks are not on the company server yet${done ? ` · ${done} filed` : ''}.</p><div class="card tbl-wrap"><table class="tbl"><thead><tr><th>Email</th><th>Suggested folder</th><th></th></tr></thead><tbody>${rows.map(e => { const t = [...St.tasks.values()].find(x => (x.emailIds || []).includes(e.id)); return `<tr><td><button class="dtitle" data-act="open-email" data-id="${esc(e.id)}" dir="auto">${esc(E.clip(e.subject || '(no subject)', 70))}</button><div class="small muted" dir="auto">${esc(e.from || '')}</div></td><td class="mono small" dir="auto">${esc(folderName(e, t))}</td><td class="nowrap"><button class="btn sm" data-act="file-email" data-id="${esc(e.id)}">📁 File…</button></td></tr>`; }).join('')}</tbody></table></div>`
    : `<div class="empty"><div class="big-emoji">📁</div><h3>Everything is filed</h3><p>Emails that create tasks appear here until they are saved on the company server.${done ? ` ${done} filed so far.` : ''}</p></div>`;
}

/* --- Setup › Company server --- */
function serverHTML() {
  const p = srvPrefs(); const sample = folderName({ subject: 'RE: [EXTERNAL] Valves spec CRS', from: 'Rania Hassan <rania@consultant.example>', date: T() + 'T08:00:00Z' }, { project: 'ELM', ref: 'T-0001' });
  return `<section class="card pad set-sec" id="set-server" data-sec="Company server"><div class="section-title"><h2>Company server and email files</h2></div>
    <div class="set-rows">
      <div class="set-row"><div><b>Keep email files and attachments</b><div class="small muted">So you can open them later, find them in Documents and copy them to the server.</div></div><label class="check"><input type="checkbox" data-chg="srv-pref" data-k="keep" ${p.keep !== false ? 'checked' : ''}>On</label></div>
      ${DESKTOP ? `<div class="set-row"><div><b>Server folder</b><div class="small muted mono">${esc(p.root || 'not chosen yet')}</div></div><div class="row"><button class="btn sm" data-act="srv-pick">Choose…</button>${p.root ? '<button class="btn sm ghost" data-act="srv-clear">Clear</button>' : ''}</div></div>
      <div class="set-row"><div><b>Put each email in its project folder</b><div class="small muted">Server folder › project › email folder.</div></div><label class="check"><input type="checkbox" data-chg="srv-pref" data-k="byProject" ${p.byProject ? 'checked' : ''}>On</label></div>` : ''}
      <div class="set-row"><div><b>Folder name</b><div class="small muted">Use {date}, {project}, {subject}, {from} and {ref}. Example: <span class="mono">${esc(sample)}</span></div></div><input class="input mono" style="max-width:360px" value="${esc(p.pattern)}" data-chg="srv-pref" data-k="pattern"></div>
      <div class="set-row"><div><b>Date style</b></div><select class="input" style="max-width:180px" data-chg="srv-pref" data-k="dateFmt">${['YYYY-MM-DD', 'DD.MM.YYYY', 'DD-MM-YYYY', 'YYYYMMDD'].map(f => `<option ${p.dateFmt === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
    </div></section>`;
}

Object.assign(ACT, {
  'file-task': el => openFiling(el.dataset.id), 'file-email': el => openFiling(null, el.dataset.id),
  'file-copy': async el => { const n = fnameOf(el.dataset.id); try { await navigator.clipboard.writeText(n); toast('Folder name copied.'); } catch { toast(n); } },
  'file-save': el => fileToServer(el.dataset.id), 'file-zip': el => fileZip(el.dataset.id),
  'file-mark': el => { markFiled(el.dataset.id, { filed: { at: nowISO(), by: 'me' }, filedSkip: false }); const t = [...St.tasks.values()].find(x => (x.emailIds || []).includes(el.dataset.id)); openFiling(t && t.id, t ? null : el.dataset.id); render(); },
  'file-skip': el => { markFiled(el.dataset.id, { filedSkip: true }); const t = [...St.tasks.values()].find(x => (x.emailIds || []).includes(el.dataset.id)); openFiling(t && t.id, t ? null : el.dataset.id); render(); },
  'file-openfolder': el => { const e = St.emails.get(el.dataset.id); if (e && e.filed && e.filed.path) DK.call('files:openFolder', { folder: e.filed.path }).catch(err => toast(err.message || 'Could not open the folder', { err: true })); },
  'mail-open-outlook': el => { const t = St.tasks.get(el.dataset.id); const e = t && latestEmail(t); if (e) openMail(e.id); },
  'att-open': el => FILES.open('attachments', el.dataset.id, el.dataset.name).catch(err => toast(err.message || 'Could not open', { err: true })),
  'email-file-open': el => openMail(el.dataset.id),
  'srv-pick': async () => { try { const root = await DK.call('files:pickFolder', { title: 'Choose the company server folder' }); saveSettings(s => { s.server = { ...srvPrefs(), root }; }); await DK.call('sys:prefs', { serverRoots: [...new Set([...((DK.status().desktop || {}).serverRoots || []), root])] }).catch(() => {}); render(); } catch {} },
  'srv-clear': () => { saveSettings(s => { s.server = { ...srvPrefs(), root: '' }; }); render(); },
  'nav-setup-server': () => { $('#modal').hidden = true; go('setup'); setTimeout(() => document.getElementById('set-server')?.scrollIntoView({ block: 'start' }), 60); },
});
Object.assign(CHG, { 'srv-pref': el => { const k = el.dataset.k; const v = el.type === 'checkbox' ? el.checked : el.value; saveSettings(s => { s.server = { ...srvPrefs(), [k]: v }; }); render(); } });
