/* ---------- share the canvas: a read-only view for the people you share the link with ---------- */
// Your register stays private (data/users/<you>). When sharing is on, the page writes a copy of the canvas — tasks
// (title, project, topic, status, dates, items), notes and shapes, and the layout; no emails, quotes or files — to
// `shared/canvas`, which everyone the link is shared with can read and only you can write (db rules: read "view",
// write "owner"). Anyone but you who opens the link sees that copy, kept up to date while your page is open.
const SH = { last: '', timer: null, busy: false, err: '' };
const SH_PART = 200000; // characters per stored part (a document holds at most 256 KB)
const shCfg = () => St.settings.share || { on: false, projects: [] };
function shSnapshot() {
  const c = shCfg(), only = new Set(c.projects || []);
  const inScope = t => !only.size || only.has(projKeyLabel(t)[1]);
  const tasks = [...St.tasks.values()].filter(inScope).map(t => ({
    id: t.id, ref: t.ref, title: t.title, project: t.project || '', topic: topicOf(t) || '', status: t.status, priority: t.priority, deadline: t.deadline || null,
    owner: t.owner, ownership: t.ownership, createdAt: t.createdAt, completedAt: t.completedAt || null, updatedAt: t.updatedAt, workType: t.workType, discipline: t.discipline,
    relatedIds: t.relatedIds || [], subtasks: (t.subtasks || []).map(x => ({ id: x.id, text: x.text, done: !!x.done, doneAt: x.doneAt || null })),
  }));
  return { v: 1, by: St.profileName || St.settings.me.name || '', projects: St.settings.projects || [], ui: St.settings.ui || {}, tasks, board: only.size ? [] : [...St.board.values()], layout: St.layout };
}
async function shWrite(force) {
  if (St.mode !== 'db' || !St.db || SH.busy) return;
  const c = shCfg();
  if (!c.on) return;
  const snap = shSnapshot(), json = JSON.stringify({ ...snap, at: undefined });
  if (!force && json === SH.last) return;
  SH.busy = true;
  try {
    const at = nowISO(), body = JSON.stringify({ ...snap, at });
    const parts = []; for (let i = 0; i < body.length; i += SH_PART) parts.push(body.slice(i, i + SH_PART));
    for (let i = 0; i < parts.length; i++) await St.db.doc('shared/canvas/parts/p' + i).set({ s: parts[i] });
    await St.db.doc('shared/canvas').set({ parts: parts.length, at, by: snap.by, tasks: snap.tasks.length });
    SH.last = json; SH.err = ''; SH.at = at;
  } catch (e) { SH.err = (e && (e.message || e.code)) || 'error'; }
  finally { SH.busy = false; }
}
async function shStop() {
  if (!St.db) return;
  try {
    const m = await St.db.doc('shared/canvas').get(); const n = m.exists ? (m.data().parts || 0) : 0;
    await St.db.doc('shared/canvas').delete();
    for (let i = 0; i < n; i++) await St.db.doc('shared/canvas/parts/p' + i).delete();
  } catch {}
  SH.last = ''; SH.at = null;
}
// while sharing is on, changes are copied a few seconds after they happen
HOOKS.afterRender.push(() => { if (St.mode !== 'db' || !shCfg().on) return; clearTimeout(SH.timer); SH.timer = setTimeout(() => shWrite(false), 4000); });
HOOKS.ready.push(() => { if (shCfg().on) shWrite(true); });

SETUP_EXTRA.push(() => {
  if (St.mode !== 'db') return '';
  const c = shCfg(), projs = projectsList();
  return `<section class="card pad" id="set-share" data-sec="Share the canvas" style="display:grid;gap:10px"><div class="section-title"><h2>Share the canvas</h2></div>
    <p class="small muted" style="margin:0">Let your manager or colleagues see your canvas, read-only and always up to date. Turn this on, then share this page from its Share menu (claude.ai) with the people who should see it. They see your tasks, items, notes and the layout — never your emails, quotes or files — and cannot change anything. The copy updates while your page is open.</p>
    <label class="check"><input type="checkbox" id="sh-on" data-chg="sh-on" ${c.on ? 'checked' : ''}>Share my canvas with the people I share this page with</label>
    ${c.on ? `<div class="field"><span class="small">Projects to show (none ticked = all, with notes and shapes)</span><div class="row" style="flex-wrap:wrap;gap:6px 14px">${projs.map(p => `<label class="check small"><input type="checkbox" data-chg="sh-proj" data-p="${esc(p)}" ${(c.projects || []).includes(p) ? 'checked' : ''}>${esc(p)}</label>`).join('') || '<span class="small muted">No projects yet.</span>'}</div></div>
      <p class="small" style="margin:0">${SH.err ? `<span class="chip warn">Not updated</span> ${esc(SH.err)}` : SH.at ? `<span class="chip ok">Shared</span> last updated ${esc(fmtDateTime(SH.at))}` : 'Preparing the shared copy…'} <button class="btn ghost sm" data-act="sh-now">Update now</button></p>` : ''}
  </section>`;
});
Object.assign(CHG, {
  'sh-on': async el => { const on = el.checked; saveSettings(s => { s.share = { ...(s.share || { projects: [] }), on }; }); if (on) await shWrite(true); else await shStop(); render(); toast(on ? 'Your canvas is shared. Now share this page from its Share menu.' : 'Sharing stopped; the shared copy was removed.'); },
  'sh-proj': async el => { const p = el.dataset.p; saveSettings(s => { const sh = s.share || { on: true, projects: [] }; const set = new Set(sh.projects || []); el.checked ? set.add(p) : set.delete(p); s.share = { ...sh, projects: [...set] }; }); await shWrite(true); render(); },
});
ACT['sh-now'] = async () => { await shWrite(true); render(); toast(SH.err ? 'Could not update the shared copy.' : 'Shared copy updated.'); };

/* --- the view for everyone else: the shared copy, read-only --- */
async function initViewer(db) {
  St.mode = 'viewer'; St.sample = null; St.mcp = null; St.assets = null;
  document.body.classList.add('viewer-mode');
  UI.view = 'todo'; UI.todoMode = 'map';
  St.settings = mergeSettings({ setupDone: true });
  const load = async m => {
    if (!m) { St.shared = { off: true }; St.tasks = new Map(); St.board = new Map(); St.ready = true; render(); return; }
    try {
      const parts = await Promise.all(Array.from({ length: m.parts || 0 }, (_, i) => db.doc('shared/canvas/parts/p' + i).get()));
      const snap = JSON.parse(parts.map(p => (p.exists ? p.data().s : '')).join(''));
      St.tasks = new Map((snap.tasks || []).map(t => [t.id, t])); St.board = new Map((snap.board || []).map(b => [b.id, b])); St.layout = mergeLayout(snap.layout);
      St.settings = mergeSettings({ setupDone: true, projects: snap.projects || [], ui: snap.ui || {} });
      St.shared = { at: m.at, by: m.by || snap.by || '' };
    } catch { St.shared = { error: true }; }
    St.ready = true; UI.map.fitted = false; render();
  };
  db.doc('shared/canvas').onSnapshot(d => load(d.exists ? d.data() : null), () => { St.shared = { error: true }; St.ready = true; render(); });
}
HOOKS.beforeRender.push(() => {
  if (St.mode !== 'viewer') return;
  let bar = document.getElementById('viewer-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'viewer-bar'; bar.className = 'viewer-bar'; document.body.prepend(bar); }
  const s = St.shared || {};
  bar.textContent = s.off ? 'Nothing is shared here yet. The owner can turn on Setup › Share the canvas.' : s.error ? 'The shared canvas could not be loaded. Reload the page to try again.'
    : `${s.by ? s.by + '’s' : 'Shared'} canvas · read-only${s.at ? ' · updated ' + fmtDateTime(s.at) : ''}`;
});
