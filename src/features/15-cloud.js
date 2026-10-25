/* ---------- Cloud sync (desktop, your own free Supabase project) and canvas share links ---------- */
addCols('shares');
const CL = { busy: '', msg: null };
const clSt = () => (DESKTOP && DK.status().cloud) || null;
function clMsg(text, err) { CL.msg = { text, err }; clRepaint(); }
function clRepaint() { const n = $('#set-cloud'); if (n) n.outerHTML = deco(cloudHTML()); }
// what you typed stays in the boxes when a step fails
const clKeep = id => (CL.vals && CL.vals[id]) || '';
function cloudHTML() {
  const c = clSt(); if (!c) return '';
  const msg = CL.msg ? callout(CL.msg.err ? 'crit' : 'ok', `<p>${esc(CL.msg.text)}</p>`) : '';
  const busy = CL.busy;
  let body;
  if (!c.configured) body = `
    <p class="small muted" style="margin:0">Sign in on any PC with your email and password and see the same tasks, emails, canvas, daily log, money and notebooks. It uses your own free Supabase project (a database service), so the data stays in an account you own. One-time setup, about 10 minutes:</p>
    <ol class="small steps">
      <li>Open <a href="#" data-act="cl-open" data-url="https://supabase.com/dashboard">supabase.com</a>, sign up (free) and press <b>New project</b>. Pick a name (e.g. “action-register”), a database password, and the region nearest to you (e.g. Frankfurt).</li>
      <li>When it is ready, open <b>SQL Editor</b>, paste the setup script and press <b>Run</b>. <button class="btn sm" data-act="cl-sql">Copy setup script</button></li>
      <li>Optional: <b>Authentication › Sign In / Providers › Email</b> — turn off “Confirm email” to skip the confirmation email.</li>
      <li>Open <b>Project Settings › API Keys</b> (or <b>Connect</b>) and copy the <b>Project URL</b> and the <b>anon / publishable</b> key (never the secret / service_role key). Paste them here:</li>
    </ol>
    <div class="grid2"><label class="field"><span>Project URL</span><input class="input mono hold-render" id="cl-url" value="${esc(clKeep('cl-url'))}" placeholder="https://abcd1234.supabase.co" spellcheck="false"></label>
      <label class="field"><span>Anon / publishable key</span><input class="input mono hold-render" id="cl-key" value="${esc(clKeep('cl-key'))}" placeholder="sb_publishable_… or eyJ…" spellcheck="false"></label></div>
    <div class="row end"><button class="btn primary" data-act="cl-connect">Save project</button></div>
    <details class="howto"><summary>Second PC? Paste the connection code from the first one</summary>
      <div class="row" style="margin-top:8px"><input class="input mono hold-render" id="cl-code" placeholder="Connection code" style="flex:1" spellcheck="false"><button class="btn" data-act="cl-code">Use code</button></div></details>`;
  else if (!c.signedIn) body = `
    <p class="small muted" style="margin:0">Project: <span class="mono">${esc(c.url)}</span> <button class="btn ghost sm" data-act="cl-reset">Change</button></p>
    <div class="grid2"><label class="field"><span>Email</span><input class="input hold-render" id="cl-email" type="email" autocomplete="username" value="${esc(c.email || clKeep('cl-email'))}"></label>
      <label class="field"><span>Password (8 characters or more)</span><input class="input hold-render" id="cl-pass" type="password" autocomplete="current-password"></label></div>
    <div class="row end">${busy ? '<span class="small muted">Connecting and syncing…</span>' : ''}<button class="btn" data-act="cl-signin" data-create="1" ${busy ? 'disabled' : ''}>Create account</button><button class="btn primary" data-act="cl-signin" ${busy ? 'disabled' : ''}>Sign in</button></div>
    <p class="small muted" style="margin:0">First time: Create account. On your other PCs: Sign in with the same email and password — your data comes down, and what was only on that PC goes up.</p>`;
  else body = `
    <div class="row"><span class="chip ok">Synced · ${esc(c.email)}</span><span class="small muted">${c.syncing ? 'Syncing…' : c.lastSync ? 'Last sync ' + esc(fmtDateTime(c.lastSync)) : ''}${c.pending ? ` · ${c.pending} waiting` : ''}</span><span class="spacer"></span><button class="btn sm" data-act="cl-sync" ${c.syncing ? 'disabled' : ''}>Sync now</button><button class="btn sm ghost danger" data-act="cl-signout">Sign out</button></div>
    ${c.error ? callout('warn', `<p>Last sync problem: ${esc(c.error)} — it is tried again every minute.</p>`) : ''}
    <label class="check small"><input type="checkbox" data-chg="cl-files" ${c.files ? 'checked' : ''}>Also sync stored files — email originals, attachments, workbooks, receipts (free plan: 1 GB, files up to 45 MB)</label>
    <div class="field"><span>Connection code for your other PCs</span><div class="row"><input class="input mono" readonly value="${esc(c.code)}" style="flex:1" id="cl-mycode"><button class="btn sm" data-act="cl-copycode">Copy</button></div><span class="small muted">On the other PC: Setup › Cloud sync › “Second PC?”, paste it, then sign in. API keys and Gmail stay on each PC (enter them there too).</span></div>
    <details class="howto"><summary>Address of the share-link viewer</summary><p class="small muted">Canvas share links open a small web page. It is published from this app's GitHub repository (Settings › Pages › Source: GitHub Actions). Change it only if you host the page elsewhere.</p><div class="row"><input class="input mono" id="cl-viewer" value="${esc(c.viewer)}" style="flex:1"><button class="btn sm" data-act="cl-viewer">Save</button></div></details>`;
  return `<section class="card pad set-sec" id="set-cloud" data-sec="Cloud sync" style="display:grid;gap:10px"><div class="section-title"><h2>Cloud sync — same data on every PC</h2></div>${msg}${body}</section>`;
}
// the section is redrawn while it works, so what was typed is read first
const clVal = id => String((CL.vals && id in CL.vals ? CL.vals[id] : ($('#' + id) || {}).value) || '').trim();
async function clRun(label, fn) { CL.vals = {}; document.querySelectorAll('#set-cloud input').forEach(i => { if (i.id) CL.vals[i.id] = i.value; }); CL.busy = label; CL.msg = null; clRepaint(); try { await fn(); } catch (e) { if (!e || e.code !== 'cancelled') clMsg((e && (e.message || e.code)) || 'Something went wrong.', true); } finally { CL.busy = ''; DK.refresh(); clRepaint(); } }
Object.assign(ACT, {
  'cl-open': el => DK.call('shell:openExternal', el.dataset.url).catch(() => {}),
  'cl-sql': () => clRun('', async () => { const sql = await DK.call('cloud:sql'); await navigator.clipboard.writeText(sql); clMsg('Setup script copied — paste it in Supabase › SQL Editor and press Run.'); }),
  'cl-connect': () => clRun('', async () => { await DK.call('cloud:connect', { url: clVal('cl-url'), key: clVal('cl-key') }); DK.refresh(); clMsg('Project saved. Now create your account (or sign in).'); }),
  'cl-code': () => clRun('', async () => { await DK.call('cloud:connect', { code: clVal('cl-code') }); DK.refresh(); clMsg('Project found. Sign in with your email and password.'); }),
  'cl-reset': () => clRun('', async () => { await DK.call('cloud:connect', { reset: true }); }),
  'cl-signin': el => clRun('signin', async () => {
    const r = await DK.call('cloud:signin', { email: clVal('cl-email'), password: (CL.vals || {})['cl-pass'] || '', create: !!el.dataset.create });
    if (r.confirm) clMsg('Account created. Open the confirmation email from Supabase, then press Sign in here.'); else clMsg('Signed in — your data is synced.');
  }),
  'cl-sync': () => clRun('', async () => { await DK.call('cloud:sync'); }),
  'cl-signout': () => clRun('', async () => { await DK.call('cloud:signout'); clMsg('Signed out. Your data stays on this PC.'); }),
  'cl-copycode': () => navigator.clipboard.writeText(clVal('cl-mycode')).then(() => toast('Connection code copied.')),
  'cl-viewer': () => clRun('', async () => { await DK.call('cloud:prefs', { viewer: clVal('cl-viewer') }); clMsg('Saved.'); }),
});
Object.assign(CHG, { 'cl-files': el => clRun('', async () => { await DK.call('cloud:prefs', { files: el.checked }); }) });
if (DESKTOP) {
  DK.on('cloud:status', () => { DK.refresh(); if (UI.view === 'setup' && !CL.busy) clRepaint(); });
  // after the first sync on a PC the whole register may have changed: start again from it
  DK.on('cloud:reload', () => { if (UI.analyzing) toast('Sync finished — restart the app to see everything.'); else setTimeout(() => location.reload(), 300); });
}

/* --- canvas share links: a read-only page that always shows the current canvas --- */
const shareList = () => colList('shares').filter(s => !s.revoked).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
function shareSnapshot(sh) {
  const keepF = UI.mapFocus, keepA = UI.mapAsOf, keepD = UI.mapShowDone;
  UI.mapFocus = sh.focus || 'all'; UI.mapAsOf = ''; UI.mapShowDone = true;
  try {
    const M = buildMap(), x = mapSVG(M);
    const tasks = mapTasks().filter(t => t.status !== 'done' || (t.completedAt && dayOf(t.completedAt) >= E.addDays(T(), -14)))
      .map(t => ({ ref: t.ref, title: t.title, project: t.project || '', topic: t.topic || '', status: t.status, priority: t.priority, deadline: t.deadline || '', owner: t.ownership === 'mine' ? (St.settings.me.name || 'me') : (t.owner || ''), ownership: t.ownership, nextStep: t.nextStep || '', done: t.status === 'done' ? (t.completedAt || '').slice(0, 10) : '' }));
    return { svg: x.svg, w: x.w, h: x.h, tasks, by: St.settings.me.name || '', generatedAt: nowISO() };
  } finally { UI.mapFocus = keepF; UI.mapAsOf = keepA; UI.mapShowDone = keepD; }
}
const shareTitle = sh => sh.focus && sh.focus !== 'all' ? (projKeyLabel({ project: sh.focus.replace(/^p:/, '') })[1] || sh.label || 'Project') : 'All projects';
async function sharePush(sh) {
  const r = await DK.call('cloud:share', { token: sh.token, title: `${St.settings.me.name ? St.settings.me.name + ' — ' : ''}${sh.label || shareTitle(sh)}`, snapshot: shareSnapshot(sh) });
  colPut('shares', { ...sh, id: r.token, token: r.token, link: r.link, pushedAt: nowISO(), sig: shareSig() });
  return r;
}
function shareModal() {
  const c = clSt(), list = shareList(), m = $('#modal');
  const focusLabel = UI.mapFocus === 'all' ? 'All projects' : ((UI.mapLayout && UI.mapLayout.projects[0]) || {}).label || 'This project';
  m.innerHTML = deco(`<div class="card share-modal" role="dialog" aria-label="Share link"><div class="row"><b>Share the canvas</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <p class="small muted" style="margin:0">A read-only link for your tablet, phone or another person. It always shows the current canvas and to-do list — the app updates it a few seconds after each change while it is open. Anyone with the link can see it; stop sharing at any time.</p>
    ${!c || !c.signedIn ? callout('warn', `<p>Share links need cloud sync. Set it up once in Setup › Cloud sync. <button class="btn sm" data-act="share-setup">Open Setup</button></p>`) : `
    ${list.map(sh => `<div class="share-row"><div style="min-width:0"><b>${esc(sh.label || shareTitle(sh))}</b><div class="small muted">Updated ${esc(fmtDateTime(sh.pushedAt))}</div><input class="input mono" readonly value="${esc(sh.link || '')}" id="sl-${esc(sh.id)}"></div>
      <div class="row"><button class="btn sm" data-act="share-copy" data-id="${esc(sh.id)}">Copy link</button><button class="btn sm ghost" data-act="share-open" data-id="${esc(sh.id)}">Open</button><button class="btn sm ghost danger" data-act="share-stop" data-id="${esc(sh.id)}">Stop sharing</button></div></div>`).join('')}
    <div class="row"><button class="btn primary" data-act="share-new" data-focus="all" ${CL.busy ? 'disabled' : ''}>${I.plus} Link for all projects</button>${UI.mapFocus !== 'all' ? `<button class="btn" data-act="share-new" data-focus="${esc(UI.mapFocus)}" data-label="${esc(focusLabel)}" ${CL.busy ? 'disabled' : ''}>${I.plus} Link for ${esc(focusLabel)}</button>` : ''}</div>`}
  </div>`);
  m.hidden = false;
}
Object.assign(ACT, {
  'map-share': () => { closeMenus(); shareModal(); },
  'share-setup': () => { $('#modal').hidden = true; go('setup'); setTimeout(() => $('#set-cloud')?.scrollIntoView(), 80); },
  'share-new': async el => {
    CL.busy = 'share'; shareModal();
    try { const r = await sharePush({ focus: el.dataset.focus, label: el.dataset.label || '', createdAt: nowISO() }); await navigator.clipboard.writeText(r.link).catch(() => {}); toast('Link created and copied.'); }
    catch (e) { toast('No link: ' + (e.message || e.code), { err: true }); }
    CL.busy = ''; shareModal();
  },
  'share-copy': el => { const sh = St.cols.shares.get(el.dataset.id); if (sh) navigator.clipboard.writeText(sh.link).then(() => toast('Link copied.')); },
  'share-open': el => { const sh = St.cols.shares.get(el.dataset.id); if (sh) DK.call('shell:openExternal', sh.link).catch(e => toast(e.message || 'Could not open', { err: true })); },
  'share-stop': async el => { const sh = St.cols.shares.get(el.dataset.id); if (!sh) return; try { await DK.call('cloud:unshare', { token: sh.token }); } catch {} colPut('shares', { ...sh, revoked: true }); toast('Sharing stopped — the link no longer works.'); shareModal(); },
});
// keep shared canvases current: a cheap signature of what the canvas shows, pushed after a quiet moment
function shareSig() { let n = 0, last = ''; for (const t of St.tasks.values()) { n++; if ((t.updatedAt || '') > last) last = t.updatedAt; } for (const b of St.board.values()) { n++; if ((b.updatedAt || '') > last) last = b.updatedAt || ''; } return `${n}|${last}|${JSON.stringify(St.layout && St.layout.off ? Object.keys(St.layout.off).length : 0)}`; }
let shareTimer = null;
HOOKS.afterRender.push(() => {
  if (!DESKTOP || SUBWIN || !shareList().length || !(clSt() || {}).signedIn) return;
  const sig = shareSig(); if (shareList().every(s => s.sig === sig)) return;
  clearTimeout(shareTimer);
  shareTimer = setTimeout(async () => { for (const sh of shareList()) if (sh.sig !== shareSig()) { try { await sharePush(sh); } catch {} } }, window.__shareDelay || 15000);
});
