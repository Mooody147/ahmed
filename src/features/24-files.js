/* ---------- email files on every device: the original email and its attachments kept with the record ---------- */
// On claude.ai the files go to the artifact's own storage (the `assets` capability, up to 20 MB each), so the PDF
// or drawing behind a task opens from any device. PDFs and images are stored as they are and open in the browser;
// other files (Word, Excel, .eml / .msg, ZIP…) are packed in a small JSON wrapper and saved back as the original file.
// Each email record lists them in `files: [{ id, name, size, role: 'original'|'attachment', wrapped }]`.
const AF = { busy: new Set(), urls: {} };
const AF_NATIVE = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
const AF_MAX = 20 * 1048576, AF_WRAP_MAX = 14.5 * 1048576;
HOOKS.ready.push(async () => {
  if (St.mode === 'viewer' || typeof window.claude === 'undefined') return;
  St.assets = await Promise.resolve(claude.use('assets')).catch(() => null);
  if (St.assets) render();
});
const afUrl = id => AF.urls[id] || '/_blob/' + id;
function afB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function afUnB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
async function afStore(name, bytes) {
  const type = AF_NATIVE[E.extOf(name)];
  if (type) {
    if (bytes.length > AF_MAX) throw { code: 'too_large' };
    const r = await St.assets.upload(new Blob([bytes], { type }), { type }); AF.urls[r.id] = r.url;
    return { id: r.id, wrapped: false };
  }
  if (bytes.length > AF_WRAP_MAX) throw { code: 'too_large' };
  const json = JSON.stringify({ app: 'action-register-file', name, mime: E.guessMime(name) || '', b64: afB64(bytes) });
  const r = await St.assets.upload(new Blob([json], { type: 'application/json' }), { type: 'application/json' }); AF.urls[r.id] = r.url;
  return { id: r.id, wrapped: true };
}
// after an email is analysed: keep its original and attachments (signature logos and placeholders skipped)
HOOKS.emailStored.push(async (rec, b) => {
  if (!St.assets || !b) return;
  const todo = [];
  if (b.original && b.original.bytes) todo.push({ name: b.original.name || 'email.' + (b.original.kind || 'eml'), bytes: b.original.bytes, role: 'original' });
  for (const a of b.atts || []) if (a.bytes && !a.missing && !(a.inline && (a.size || a.bytes.length) < 40000)) todo.push({ name: a.name.split(' › ').pop(), bytes: a.bytes, role: 'attachment' });
  if (!todo.length) return;
  AF.busy.add(rec.id);
  const files = [], skipped = [];
  for (const f of todo) {
    try { const r = await afStore(f.name, f.bytes); files.push({ id: r.id, name: f.name, size: f.bytes.length, role: f.role, wrapped: r.wrapped }); }
    catch (e) { skipped.push(f.name + (e && e.code === 'too_large' ? ' (over 20 MB)' : '')); if (e && ['quota_or_state', 'not_granted', 'capability_disabled'].includes(e.code)) break; }
  }
  AF.busy.delete(rec.id);
  const cur = St.emails.get(rec.id); if (!cur) return;
  const c = clone(cur); c.files = [...(c.files || []), ...files]; if (skipped.length) c.filesSkipped = skipped;
  putEmail(c); if (UI.drawer && UI.drawer.id === rec.id) renderDrawer();
});
async function afBytes(f) {
  const res = await fetch(afUrl(f.id)); if (!res.ok) throw new Error('not found');
  if (!f.wrapped) return new Uint8Array(await res.arrayBuffer());
  const j = await res.json(); return afUnB64(j.b64);
}
async function afSave(f) {
  try {
    const data = await afBytes(f);
    if (!St.downloads) { toast('Saving files is not available in this view.', { err: true }); return; }
    await St.downloads.save({ filename: f.name, data: new Blob([data], { type: E.guessMime(f.name) || 'application/octet-stream' }) });
  } catch (e) { if (!e || e.code !== 'cancelled') toast('Could not get the file: ' + ((e && (e.message || e.code)) || 'unknown error'), { err: true }); }
}
const afFiles = e => (e && e.files) || [];
const taskFiles = t => (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean).flatMap(e => afFiles(e).map(f => ({ ...f, emailId: e.id })));
function afListHTML(e) {
  const fs = afFiles(e);
  if (!fs.length && !AF.busy.has(e.id) && !(e.filesSkipped || []).length) return '';
  const row = (f, i) => `<div class="att"><span>${AF_NATIVE[E.extOf(f.name)] ? (/pdf$/i.test(f.name) ? '📄' : '🖼') : f.role === 'original' ? '✉' : '📎'}</span>
    <div style="min-width:0"><div class="name" dir="auto">${esc(f.name)}</div><div class="note">${f.role === 'original' ? 'Original email · ' : ''}${fmtBytes(f.size || 0)}</div></div>
    <div class="att-side">${!f.wrapped ? `<a class="btn ghost sm" href="${esc(afUrl(f.id))}" target="_blank" rel="noopener">Open</a>` : ''}<button class="btn sm" data-act="af-save" data-eid="${esc(e.id)}" data-i="${i}">Save</button></div></div>`;
  return `<div><div class="label" style="margin-bottom:4px">Files (on every device)</div><div class="att-list">${fs.map(row).join('')}</div>
    ${AF.busy.has(e.id) ? '<p class="small muted" style="margin:6px 0 0">Saving the files…</p>' : ''}${(e.filesSkipped || []).length ? `<p class="small muted" style="margin:6px 0 0">Not kept: ${esc(e.filesSkipped.join(', '))}.</p>` : ''}</div>`;
}
EMAIL_ACTIONS.push(e => afListHTML(e));
TASK_ACTIONS.push(t => { const fs = taskFiles(t); return fs.length ? `<button class="btn sm ghost" data-act="af-open-email" data-id="${esc(fs[0].emailId)}">📎 Files (${fs.length})</button>` : ''; });
NODE_EXTRA.push(t => taskFiles(t).length && St.mode !== 'viewer' ? `<button class="mfiles" data-map="files" title="Open the email's files">📎</button>` : '');
MAP_BTN.files = id => { const t = St.tasks.get(id); const f = t && taskFiles(t)[0]; if (f) openDrawer('email', f.emailId); };
Object.assign(ACT, {
  'af-save': el => { const e = St.emails.get(el.dataset.eid); const f = afFiles(e)[+el.dataset.i]; if (f) afSave(f); },
  'af-open-email': el => openDrawer('email', el.dataset.id),
});
// Setup: how much of the artifact's file storage is used
SETUP_EXTRA.push(() => {
  if (!St.assets) return '';
  const n = [...St.emails.values()].reduce((s, e) => s + afFiles(e).length, 0);
  return `<section class="card pad" id="set-files" data-sec="Email files" style="display:grid;gap:8px"><div class="section-title"><h2>Email files</h2></div>
    <p class="small muted" style="margin:0">Each analysed email keeps its original and its attachments here, so you can open them from any device (Emails › open an email › Files). Files over 20 MB are not kept.</p>
    <p class="small" style="margin:0"><b>${n}</b> file${n === 1 ? '' : 's'} kept${AF.usage ? ` · ${fmtBytes(AF.usage.bytes)} of ${fmtBytes(AF.usage.maxBytes)} used` : ''}. <button class="btn ghost sm" data-act="af-usage">Check storage</button></p></section>`;
});
ACT['af-usage'] = async () => { try { AF.usage = (await St.assets.list()).usage; } catch (e) { toast('Could not read the storage use.', { err: true }); } render(); };
