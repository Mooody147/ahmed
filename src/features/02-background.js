/* ---------- background work: periodic Gmail checks, reminders, watch folder, backups, quick add, lock ---------- */
// Periodic Gmail checks and the quick-add box work in the web build too; notifications, the
// watch folder, backups, updates and the PIN lock need the desktop app.
const BG = { lastGmail: Date.now(), timer: null, notifiedDay: '', backupDay: '' };
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const autoPrefs = () => Object.assign({ gmailEvery: 10, morning: true, morningAt: '07:30', backup: true }, St.settings.auto || {});
function deskNotify(title, body, view, id) {
  if (DESKTOP) { DK.call('sys:notify', { title, body, view, id }).catch(() => {}); return; }
  toast(title + (body ? ' — ' + body : ''));
}
function todaysNumbers() {
  const mine = [...St.tasks.values()].filter(t => t.status !== 'done' && isMine(t));
  return { overdue: mine.filter(t => t.deadline && t.deadline < T()).length, today: mine.filter(t => t.deadline === T()).length, review: counts().review };
}
async function backgroundTick() {
  if (!St.ready) return;
  const a = autoPrefs(), g = gmCfg();
  // 1. Gmail every N minutes (the check analyses new forwards itself when "Analyse automatically" is on)
  if (St.mcp && g.address && g.autoCheck && +a.gmailEvery > 0 && Date.now() - BG.lastGmail > a.gmailEvery * 60000 && !GM.busy && !UI.analyzing) {
    BG.lastGmail = Date.now();
    try { await checkGmail(false); } catch {}
  }
  // 2. morning reminder, once a day after the chosen time
  const now = new Date(), hm = now.toTimeString().slice(0, 5);
  if (a.morning && hm >= (a.morningAt || '07:30') && lsGet('ar-morning') !== T()) {
    lsSet('ar-morning', T());
    const n = todaysNumbers();
    if (n.overdue || n.today || n.review) deskNotify('Good morning — your day', [n.today ? `${n.today} due today` : '', n.overdue ? `${n.overdue} overdue` : '', n.review ? `${n.review} email${n.review > 1 ? 's' : ''} to review` : ''].filter(Boolean).join(' · '), 'todo');
  }
  // 3. daily backup (desktop)
  if (DESKTOP && a.backup && lsGet('ar-backup') !== T() && St.tasks.size) {
    lsSet('ar-backup', T());
    try { const data = await backupData(); await DK.call('backup:write', { name: `action-register-backup-${T()}.json`, text: JSON.stringify(data) }); } catch (e) { lsSet('ar-backup', ''); }
  }
}
HOOKS.analysed.push(ok => { if (ok && (document.hidden || !document.hasFocus())) deskNotify(`${ok} new email${ok > 1 ? 's' : ''} analysed`, 'Tasks are waiting for your review.', 'review'); });
HOOKS.ready.push(() => {
  clearInterval(BG.timer); BG.timer = setInterval(backgroundTick, 30000); setTimeout(backgroundTick, 4000);
  if (!DESKTOP) return;
  DK.on('quick-add', () => openQuickAdd());
  DK.on('gmail-check', () => checkGmail(true));
  DK.on('nav', ({ view, id }) => { if (view) go(view); if (id && St.tasks.has(id)) openDrawer('task', id); });
  DK.on('update:ready', ({ version }) => { UI.updateReady = version; render(); toast(`Version ${version} is ready to install.`, { action: 'Restart now', fn: () => DK.call('update:install') }); });
  DK.on('sample:usage', () => { DK.refresh(); });
  DK.on('import:file', async ({ name, path, data }) => {
    try {
      const f = new File([data], name);
      await intakeFiles([f]);
      await DK.call('watch:done', { path, ok: true });
      toast(`Imported ${name} from your watch folder.`, { action: 'Show', fn: () => go('import') });
      if (gmCfg().autoAnalyse && St.sample && !UI.analyzing) { await extractPending(); runAnalysis(); }
    } catch { DK.call('watch:done', { path, ok: false }).catch(() => {}); }
  });
  DK.call('watch:ready').catch(() => {});
  const st = DK.status(); if (st.update) UI.updateReady = st.update.version;
});

/* --- quick add (Ctrl+N in the app, or the global hotkey from anywhere) --- */
function openQuickAdd() {
  const m = $('#modal');
  m.innerHTML = deco(`<div class="card quick-add" role="dialog" aria-label="Quick add">
    <div class="row"><b>Quick add for today</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <div class="seg" role="group">${DAY_KINDS.map(([k, l]) => `<button data-act="qa-kind" data-kind="${k}" aria-pressed="${(UI.qaKind || 'mine') === k}">${l}</button>`).join('')}</div>
    <input class="input" id="qa-in" dir="auto" autocomplete="off" placeholder="What needs doing? e.g. Send revised valve schedule to the consultant">
    <div class="row end"><span class="small muted">Enter to add · Esc to close</span><span class="spacer"></span><button class="btn primary" data-act="qa-add">Add</button></div></div>`);
  m.hidden = false; setTimeout(() => $('#qa-in')?.focus(), 30);
}
function quickAdd() {
  const v = ($('#qa-in') || {}).value || ''; if (!v.trim()) return;
  const kind = UI.qaKind || 'mine', D = T();
  if (kind === 'achievement' || kind === 'note') putDaily({ id: E.uid('d'), kind, date: D, text: v.trim(), taskId: null, createdAt: nowISO() });
  else createDailyTask(v.trim(), D, kind, kind === 'manager' ? managerName() : '');
  $('#modal').hidden = true; toast(kind === 'achievement' ? 'Achievement recorded.' : kind === 'note' ? 'Note added to today.' : 'Added to today’s plan.', { action: 'Open Daily', fn: () => go('daily') });
  render();
}
Object.assign(ACT, {
  'qa-kind': el => { UI.qaKind = el.dataset.kind; openQuickAdd(); },
  'qa-add': () => quickAdd(),
  'update-install': () => DESKTOP && DK.call('update:install'),
});
document.addEventListener('keydown', e => {
  if (e.target && e.target.id === 'qa-in' && e.key === 'Enter') { e.preventDefault(); quickAdd(); }
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'n' && !(e.target.closest && e.target.closest('input,textarea,[contenteditable]'))) { e.preventDefault(); openQuickAdd(); }
});

/* --- PIN lock (desktop) --- */
function showLock() {
  if (!DESKTOP || !DK.status().desktop || !DK.status().desktop.locked) return;
  let el = $('#lock'); if (!el) { el = document.createElement('div'); el.id = 'lock'; document.body.appendChild(el); }
  el.className = 'lockscreen';
  el.innerHTML = deco(`<div class="card lock-card"><span class="brand-mark">${I.brand}</span><h2>Action Register is locked</h2><p class="small muted">Enter your PIN to open it.</p>
    <input class="input" id="lock-pin" type="password" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><div class="small" id="lock-msg" style="color:var(--crit);min-height:1.2em"></div>
    <button class="btn primary" data-act="lock-open">Unlock</button></div>`);
  el.hidden = false; setTimeout(() => $('#lock-pin')?.focus(), 30);
}
async function tryUnlock() {
  const pin = ($('#lock-pin') || {}).value || '';
  const ok = await DK.call('lock:check', { pin }).catch(() => false);
  if (ok) { const el = $('#lock'); if (el) el.remove(); }
  else { const m = $('#lock-msg'); if (m) m.textContent = 'That PIN is not right.'; const i = $('#lock-pin'); if (i) { i.value = ''; i.focus(); } }
}
Object.assign(ACT, { 'lock-open': () => tryUnlock(), 'lock-now': () => showLock() });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'lock-pin' && e.key === 'Enter') { e.preventDefault(); tryUnlock(); } });
if (DESKTOP) showLock();
