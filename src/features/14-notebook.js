/* ---------- Notebook: ask questions about a folder or files on your PC; answers cite the file and page ---------- */
// Sources are read here with the same readers as email attachments, cut into passages and indexed (BM25).
// A question picks the best passages and the AI answers from them only, with [n] links back to each passage.
// On the desktop a folder stays linked: new and changed files are read again when the notebook opens.
addCols('notebooks');
VIEWS.push('notebook');
UI.nb = { open: null, busy: null, q: '', asking: false, cite: null, mode: 'ask' };
const NBX = new Map(); // notebook id → { store, index }

/* --- text → passages --- */
const NB_TEXT = /\.(txt|md|csv|json|xml|log|ini|cfg|ya?ml|html?)$/i;
async function nbExtract(name, bytes) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (NB_TEXT.test(name)) {
    let t = new TextDecoder('utf-8').decode(bytes);
    if ((t.match(/�/g) || []).length > 20) try { t = new TextDecoder('windows-1256').decode(bytes); } catch {}
    if (/html?$/.test(ext)) t = t.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    return { text: t, status: 'text' };
  }
  if (ext === 'eml' || ext === 'msg') {
    const em = await parseEmailFile(bytes, ext);
    const parts = [`Subject: ${em.subject || ''}\nFrom: ${em.from || ''}\nTo: ${em.to || ''}\nDate: ${em.date || ''}\n\n${em.body || ''}`];
    for (const a of (em.attachments || []).filter(a => a.bytes && !a.inline).slice(0, 12)) {
      try { const r = await E.extract({ name: a.name, mime: a.mime, bytes: a.bytes }, { vision: false }); if (r.text) parts.push(`[Attachment ${a.name}]\n${r.text}`); } catch {}
    }
    return { text: parts.join('\n\n'), status: 'text' };
  }
  const r = await E.extract({ name, mime: '', bytes }, { vision: false });
  return { text: r.text || '', status: r.text ? 'text' : (r.status || 'unreadable'), note: r.note || (r.scannedPages && r.scannedPages.length && !r.text.replace(/\[Page \d+\]|\(no text layer on this page\)/g, '').trim() ? 'Scanned without a text layer — only typed PDFs and documents can be searched.' : '') };
}
// passages of about 1,100 characters that remember their page / sheet / attachment
function nbChunks(text) {
  const out = []; let loc = '';
  // markers written by the readers: [Page 3], [Sheet: Calc] — 40 rows, [Slide 2], [Attachment x.pdf]
  const segs = String(text).split(/^(\[(?:Page \d+|Sheet: [^\]\n]{1,80}|Attachment [^\]\n]{1,120}|Slide \d+)\])[^\n]*$/m);
  for (const seg of segs) {
    const m = /^\[(Page \d+|Sheet: [^\]]+|Attachment [^\]]+|Slide \d+)\]$/.exec(seg.trim()); if (m) { loc = m[1].replace(/^Page /, 'p. ').replace(/^Sheet: /, 'sheet '); continue; }
    const paras = seg.replace(/\(no text layer on this page\)/g, '').split(/\n\s*\n/).map(p => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean);
    let cur = '';
    const flush = () => { if (cur.trim().length > 20) out.push([cur.trim(), loc]); cur = ''; };
    for (const p of paras) {
      if (p.length > 1600) { flush(); for (let i = 0; i < p.length; i += 1100) out.push([p.slice(Math.max(0, i - 120), i + 1100), loc]); continue; }
      if (cur.length + p.length > 1100) { const tail = cur.slice(-150); flush(); cur = tail ? tail + ' … ' : ''; }
      cur += (cur ? '\n' : '') + p;
    }
    flush();
    if (out.length > 600) break;
  }
  return out.slice(0, 600);
}

/* --- BM25 over passages (English and Arabic) --- */
const NB_STOP = new Set('the a an and or of to in on for with by at from is are was were be been it this that these those as not no yes do does did can could should would will shall may might have has had our your their his her its we you they i he she them us me my all any each per via than then also into over under about what which who whom when where why how please dear regards من في على إلى الى عن مع هذا هذه ذلك التي الذي ان أن إن او أو و ثم كما لا ما هل قد كل بعض'.split(' '));
function nbTokens(s) {
  return E.normMatch(String(s || '')).replace(/[إأآا]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[ً-ْ]/g, '')
    .split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 1 && !NB_STOP.has(w)).map(w => (/^[a-z]{4,}s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w).replace(/^ال(?=\p{L}{3,})/u, ''));
}
function nbBuildIndex(store) {
  const docs = [], df = new Map(); let total = 0;
  for (const [key, f] of Object.entries(store.files)) (f.chunks || []).forEach(([text, loc], ci) => {
    const toks = nbTokens(f.name.replace(/\.[^.]+$/, '') + ' ' + text), tf = new Map();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    docs.push({ key, ci, tf, len: toks.length }); total += toks.length;
  });
  return { docs, df, avg: total / Math.max(1, docs.length) };
}
function nbSearch(nbId, q, n = 12) {
  const X = NBX.get(nbId); if (!X) return [];
  if (!X.index) X.index = nbBuildIndex(X.store);
  const { docs, df, avg } = X.index, N = docs.length, qt = [...new Set(nbTokens(q))];
  if (!qt.length) return [];
  const phrase = E.normMatch(q).trim(), k1 = 1.2, b = 0.75;
  const scored = [];
  for (const d of docs) {
    let s = 0, hits = 0;
    for (const t of qt) { const f = d.tf.get(t); if (!f) continue; hits++; const idf = Math.log(1 + (N - df.get(t) + 0.5) / (df.get(t) + 0.5)); s += idf * f * (k1 + 1) / (f + k1 * (1 - b + b * d.len / avg)); }
    if (!s) continue;
    s *= 0.6 + 0.4 * hits / qt.length; // passages with more of the words first
    if (phrase.length > 6 && E.normMatch(X.store.files[d.key].chunks[d.ci][0]).includes(phrase)) s *= 1.6;
    scored.push({ d, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const per = new Map(), out = [];
  for (const { d, s } of scored) {
    const c = per.get(d.key) || 0; if (c >= 4) continue; per.set(d.key, c + 1);
    const f = X.store.files[d.key];
    out.push({ key: d.key, ci: d.ci, score: s, name: f.name, rel: f.rel || f.name, loc: f.chunks[d.ci][1], text: f.chunks[d.ci][0] });
    if (out.length >= n) break;
  }
  return out;
}

/* --- storage: the passages live in a file beside the register (they can be large) --- */
const nbList = () => colList('notebooks').sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
const nbGet = id => St.cols.notebooks.get(id);
async function nbLoad(id) {
  if (NBX.has(id)) return NBX.get(id);
  let store = { v: 1, files: {} };
  try { const b = await FILES.load('notebook', id + '.json'); if (b) store = JSON.parse(new TextDecoder().decode(b)); } catch {}
  const X = { store, index: null }; NBX.set(id, X); return X;
}
async function nbPersist(id) {
  const X = NBX.get(id); if (!X) return;
  await FILES.save('notebook', id + '.json', new TextEncoder().encode(JSON.stringify(X.store)), { notebook: id });
  const files = Object.values(X.store.files), nb = nbGet(id);
  if (nb) colPut('notebooks', { ...nb, counts: { files: files.length, read: files.filter(f => (f.chunks || []).length).length, passages: files.reduce((s, f) => s + (f.chunks || []).length, 0) } });
}
async function nbIndexFile(id, key, meta, getBytes) {
  const X = NBX.get(id);
  try {
    const bytes = await getBytes();
    const r = await nbExtract(meta.name, bytes);
    X.store.files[key] = { ...meta, status: r.status, note: r.note || '', chunks: nbChunks(r.text) };
  } catch (e) { X.store.files[key] = { ...meta, status: 'unreadable', note: String((e && e.message) || e).slice(0, 160), chunks: [] }; }
  X.index = null;
}
// read a list of jobs with progress; saved every 20 files so a long folder is not lost if the app closes
async function nbRun(id, jobs, label) {
  if (!jobs.length) return;
  UI.nb.busy = { id, done: 0, total: jobs.length, label, current: '' }; render();
  let i = 0;
  for (const j of jobs) {
    if (!UI.nb.busy || UI.nb.busy.stop) break;
    UI.nb.busy.current = j.meta.rel || j.meta.name; nbProgress();
    await nbIndexFile(id, j.key, j.meta, j.get);
    UI.nb.busy.done = ++i; nbProgress();
    if (i % 20 === 0) await nbPersist(id);
  }
  await nbPersist(id);
  const stopped = UI.nb.busy && UI.nb.busy.stop; UI.nb.busy = null; render();
  toast(`${stopped ? 'Stopped — ' : ''}${i} file${i === 1 ? '' : 's'} read.`);
}
function nbProgress() { const n = $('#nb-progress'); const b = UI.nb.busy; if (n && b) n.innerHTML = `<div class="progress"><i style="width:${Math.round(b.done / b.total * 100)}%"></i></div><div class="small muted">${esc(b.label)} ${b.done} of ${b.total} · ${esc(E.clip(b.current, 80))}</div>`; }

/* --- sources --- */
async function nbAddFiles(id, fileList) {
  const X = await nbLoad(id), nb = nbGet(id), jobs = [];
  for (const f of [...fileList]) {
    const rel = f.webkitRelativePath || f.name, key = 'up:' + rel + ':' + f.size;
    if (X.store.files[key]) continue;
    const bytes = new Uint8Array(await f.arrayBuffer());
    const fid = id + '_' + E.uid('f');
    await FILES.save('notebook', fid, bytes, { name: f.name });
    jobs.push({ key, meta: { name: f.name, rel, size: f.size, mtime: f.lastModified, fileId: fid, src: 'upload' }, get: async () => bytes });
  }
  colPut('notebooks', { ...nb, sources: [...(nb.sources || []).filter(s => s.kind !== 'files'), { id: 'files', kind: 'files', name: 'Added files' }] });
  await nbRun(id, jobs, 'Reading');
}
async function nbAddFolder(id) {
  const folder = await DK.call('files:pickFolder', { title: 'Choose the folder to ask questions about' });
  const roots = new Set([...(DK.status().desktop.notebookRoots || []), folder]);
  await DK.call('sys:prefs', { notebookRoots: [...roots] }); DK.refresh();
  const nb = nbGet(id);
  if (!(nb.sources || []).some(s => s.kind === 'folder' && s.path === folder)) colPut('notebooks', { ...nb, sources: [...(nb.sources || []), { id: E.uid('s'), kind: 'folder', path: folder, name: folder.split(/[\\/]/).filter(Boolean).pop() || folder }] });
  await nbSync(id, true);
}
// folders: new and changed files are read, removed ones dropped
async function nbSync(id, verbose) {
  if (!DESKTOP || UI.nb.busy) return;
  const nb = nbGet(id), X = await nbLoad(id); if (!nb) return;
  const jobs = []; let removed = 0, changed = 0, added = 0;
  for (const s of (nb.sources || []).filter(s => s.kind === 'folder')) {
    let r; try { r = await DK.call('nb:scan', { folder: s.path }); } catch (e) { toast(`Folder ${s.name}: ${e.message || e.code}`, { err: true }); continue; }
    const seen = new Set();
    for (const f of r.files) {
      const key = 'fs:' + f.path; seen.add(key); const old = X.store.files[key];
      if (old && old.mtime === f.mtime && old.size === f.size) continue;
      old ? changed++ : added++;
      jobs.push({ key, meta: { name: f.name, rel: s.name + '/' + f.rel.replace(/\\/g, '/'), size: f.size, mtime: f.mtime, path: f.path, src: s.id }, get: () => DK.call('nb:read', { file: f.path }) });
    }
    for (const k of Object.keys(X.store.files)) if (X.store.files[k].src === s.id && !seen.has(k)) { delete X.store.files[k]; removed++; }
    if (r.capped) toast(`Only the first ${r.files.length} files of ${s.name} are used.`);
  }
  if (removed) { X.index = null; await nbPersist(id); }
  if (jobs.length) await nbRun(id, jobs, added && !changed ? 'Reading' : 'Updating');
  if (verbose || jobs.length || removed) toast(`Notebook up to date: ${added} new, ${changed} changed, ${removed} removed.`);
}

/* --- asking --- */
async function nbAsk(id, q) {
  const nb = nbGet(id); if (!nb || !q.trim()) return;
  await nbLoad(id);
  const hits = nbSearch(id, q, 14);
  const turn = { id: E.uid('q'), q: q.trim(), at: nowISO(), hits: hits.map(h => ({ key: h.key, ci: h.ci, name: h.name, rel: h.rel, loc: h.loc })) };
  UI.nb.q = ''; const qa = $('#nb-q'); if (qa) { qa.value = ''; qa.blur(); } // the box holds renders while it has focus
  if (!St.sample || UI.nb.mode === 'search') { turn.search = true; nbSaveTurn(id, turn); return; }
  UI.nb.asking = true; render();
  try {
    if (!hits.length) { turn.answer = 'Nothing in this notebook matches these words. Try other words (for example the document number, a supplier or an Arabic term), or add more files.'; turn.cites = []; }
    else {
      const prev = (nb.chat || []).slice(-3).filter(t => t.answer).map(t => `Q: ${t.q}\nA: ${E.clip(t.answer, 500)}`).join('\n');
      const prompt = `You are a research assistant for the user's own notebook of files (an engineer's project documents). Answer the question using only the numbered excerpts below. Put the excerpt number in square brackets after each fact, like [2] or [1][4]. If the excerpts do not contain the answer, say so plainly and set notFound to true — do not use outside knowledge. Answer in the language of the question. Keep numbers, units, document numbers and names exactly as written.
${prev ? `\nEarlier in this conversation:\n${prev}\n` : ''}
QUESTION: ${q.trim()}

EXCERPTS:
${hits.map((h, i) => `[${i + 1}] ${h.rel}${h.loc ? ' (' + h.loc + ')' : ''}\n${h.text}`).join('\n\n')}

Reply JSON: {"answer": "…with [n] references…", "citations": [n, …], "notFound": false, "followUps": ["up to 3 short follow-up questions"]}`;
      const r = await St.sample.json(prompt, { modelTier: hits.length > 8 ? 'default' : 'quick', onMeta: m => { turn.by = m; } });
      turn.answer = String((r && r.answer) || 'No answer.'); turn.cites = (Array.isArray(r && r.citations) ? r.citations : []).map(Number).filter(n => n >= 1 && n <= hits.length);
      turn.notFound = !!(r && r.notFound); turn.followUps = (Array.isArray(r && r.followUps) ? r.followUps : []).map(String).slice(0, 3);
    }
  } catch (e) { turn.answer = ''; turn.error = (e && (e.message || e.code)) || 'failed'; }
  UI.nb.asking = false; nbSaveTurn(id, turn);
}
function nbSaveTurn(id, turn) {
  const nb = nbGet(id); colPut('notebooks', { ...nb, chat: [...(nb.chat || []), turn].slice(-40) });
  const qa = $('#nb-q'), typing = qa && document.activeElement === qa && qa.value; if (qa && !typing) qa.blur();
  render(); setTimeout(() => { const c = $('#nb-chat'); if (c) c.scrollTop = c.scrollHeight; const q = $('#nb-q'); if (q && !typing) q.focus(); }, 30);
}
async function nbOverview(id) {
  const X = await nbLoad(id), files = Object.entries(X.store.files).filter(([, f]) => (f.chunks || []).length);
  if (!files.length || !St.sample) return;
  UI.nb.asking = true; render();
  // the start of every file (up to ~60 passages) gives the AI a view of what the notebook holds
  const per = Math.max(1, Math.floor(60 / files.length));
  const ex = files.flatMap(([key, f]) => f.chunks.slice(0, per).map(([t, loc], ci) => ({ key, ci, name: f.name, rel: f.rel || f.name, loc, text: E.clip(t, 700) }))).slice(0, 60);
  const prompt = `You are a research assistant. Below are the opening passages of each file in the user's notebook. Write a short overview of what these files are about (5–8 bullet points with [n] references to the excerpts), then list the key facts an engineer would look up (dates, document numbers, quantities, parties), then suggest 5 useful questions to ask. Answer in English unless most files are Arabic.

EXCERPTS:
${ex.map((h, i) => `[${i + 1}] ${h.rel}${h.loc ? ' (' + h.loc + ')' : ''}\n${h.text}`).join('\n\n')}

Reply JSON: {"answer": "overview and key facts as text with [n] references", "citations": [n, …], "followUps": ["5 questions"]}`;
  const turn = { id: E.uid('q'), q: 'Overview of the sources', at: nowISO(), hits: ex.map(h => ({ key: h.key, ci: h.ci, name: h.name, rel: h.rel, loc: h.loc })), overview: true };
  try { const r = await St.sample.json(prompt, { modelTier: 'default', onMeta: m => { turn.by = m; } }); turn.answer = String((r && r.answer) || ''); turn.cites = (r.citations || []).map(Number); turn.followUps = (r.followUps || []).map(String).slice(0, 5); }
  catch (e) { turn.error = (e && (e.message || e.code)) || 'failed'; }
  UI.nb.asking = false; nbSaveTurn(id, turn);
}

/* --- view --- */
VIEW_FN.notebook = () => {
  const nb = UI.nb.open && nbGet(UI.nb.open);
  if (!nb) return nbHome();
  if (!NBX.has(nb.id)) { nbLoad(nb.id).then(() => { render(); if (DESKTOP && !UI.nb.synced?.[nb.id]) { UI.nb.synced = { ...(UI.nb.synced || {}), [nb.id]: 1 }; nbSync(nb.id); } }); return `<div class="wrap"><p class="muted">Opening…</p></div>`; }
  return nbPage(nb);
};
function nbHome() {
  const list = nbList();
  return `<div class="wrap notebook">
    <div class="page-head"><div><h1>Notebook</h1><div class="sub">Ask questions about a folder or files on your PC — project specifications, contracts, datasheets, minutes, emails. Answers quote the exact file and page so you can check them.</div></div>
      <div class="row"><input class="input" id="nb-new-name" placeholder="Name, e.g. ELM specifications" style="width:240px"><button class="btn primary" data-act="nb-create">${I.plus} New notebook</button></div></div>
    ${list.length ? `<div class="nb-cards">${list.map(n => `<button class="card pad nb-card" data-act="nb-open" data-id="${esc(n.id)}"><b dir="auto">${esc(n.name)}</b><span class="small muted">${(n.counts && n.counts.files) || 0} files · ${(n.counts && n.counts.passages) || 0} passages · ${(n.chat || []).length} questions</span><span class="small muted">${esc((n.sources || []).filter(s => s.kind === 'folder').map(s => s.name).join(', ') || 'Added files')}</span></button>`).join('')}</div>` :
      `<section class="card pad empty-state"><h2>How it works</h2><ol class="small"><li>Make a notebook and add a folder (${DESKTOP ? 'it stays linked: new and changed files are read when you open the notebook' : 'in the desktop app a folder stays linked'}) or single files: PDF, Word, Excel, PowerPoint, Outlook emails, text.</li><li>Ask in English or Arabic: “What is the required IP rating for valve actuators?”, “When is the RAS pump submittal due?”.</li><li>The answer shows [1] [2] links; press one to see the passage and open the file at that page.</li></ol><p class="small muted">The files are read on this computer. Only the few passages that match a question are sent to the AI with it.${St.sample ? '' : ' Without an AI connected, the notebook still finds the passages for you.'}</p></section>`}
  </div>`;
}
function nbAnswerHTML(nb, t) {
  const cite = n => { const h = t.hits[n - 1]; return h ? `<button class="nb-cite" data-act="nb-cite" data-t="${esc(t.id)}" data-n="${n}" title="${esc(h.rel + (h.loc ? ' · ' + h.loc : ''))}">${n}</button>` : `[${n}]`; };
  const body = t.error ? callout('crit', `<p>The answer failed: ${esc(t.error)}</p>`) : t.search ? '' : `<div class="nb-ans" dir="auto">${esc(t.answer || '').replace(/\[(\d{1,2})\]/g, (m, n) => cite(+n)).replace(/\n/g, '<br>')}</div>`;
  const used = t.search ? t.hits.map((_, i) => i + 1) : [...new Set(t.cites || [])];
  const srcs = used.map(n => t.hits[n - 1] ? `<button class="nb-src" data-act="nb-cite" data-t="${esc(t.id)}" data-n="${n}"><b>${n}</b> ${esc(E.clip(t.hits[n - 1].rel, 70))}${t.hits[n - 1].loc ? ` <span class="muted">· ${esc(t.hits[n - 1].loc)}</span>` : ''}</button>` : '').join('');
  return `<div class="nb-turn" id="nbt-${esc(t.id)}"><div class="nb-q" dir="auto">${esc(t.q)}</div>
    ${t.search ? `<div class="small muted">${t.hits.length ? `${t.hits.length} matching passages${St.sample ? '' : ' (connect an AI for written answers)'}:` : 'No matching passages.'}</div>` : ''}
    ${body}${srcs ? `<div class="nb-srcs">${srcs}</div>` : ''}
    ${t.search && t.hits.length ? `<div class="nb-passages">${t.hits.slice(0, 8).map((h, i) => nbPassageHTML(nb, t, i + 1, true)).join('')}</div>` : ''}
    ${(t.followUps || []).length ? `<div class="row nb-follow">${t.followUps.map(f => `<button class="btn sm ghost" data-act="nb-follow" data-q="${esc(f)}" dir="auto">${esc(f)}</button>`).join('')}</div>` : ''}
    ${t.answer && !t.search ? `<div class="row small nb-tools">${t.by && typeof aiName === 'function' ? `<span class="muted">by ${esc(aiName(t.by))}</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-act="nb-copy" data-t="${esc(t.id)}">Copy</button><button class="btn ghost sm" data-act="nb-note" data-t="${esc(t.id)}">📌 Save to notes</button><button class="btn ghost sm" data-act="nb-task" data-t="${esc(t.id)}">${I.plus} Task</button></div>` : ''}
  </div>`;
}
function nbPassageHTML(nb, t, n, compact) {
  const h = t.hits[n - 1]; if (!h) return '';
  const X = NBX.get(nb.id), f = X && X.store.files[h.key], text = f && f.chunks[h.ci] ? f.chunks[h.ci][0] : '(this file changed since — ask again)';
  const words = nbTokens(t.q).filter(w => w.length > 2);
  let html = esc(compact ? E.clip(text, 420) : text);
  if (words.length) html = html.replace(new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi'), '<mark>$1</mark>');
  const canOpen = f && (f.path || f.fileId);
  return `<div class="nb-passage"><div class="row small"><b>${n}</b><span dir="auto" style="min-width:0;word-break:break-word">${esc(h.rel)}</span>${h.loc ? `<span class="chip">${esc(h.loc)}</span>` : ''}<span class="spacer"></span>${canOpen ? `<button class="btn ghost sm" data-act="nb-openfile" data-key="${esc(h.key)}">Open file</button>` : ''}</div><div class="nb-ptext" dir="auto">${html}</div></div>`;
}
function nbPage(nb) {
  const X = NBX.get(nb.id), files = Object.values(X.store.files), unread = files.filter(f => !(f.chunks || []).length);
  const busy = UI.nb.busy && UI.nb.busy.id === nb.id ? UI.nb.busy : null;
  const t = UI.nb.cite && (nb.chat || []).find(x => x.id === UI.nb.cite.t);
  return `<div class="wrap notebook nb-page">
    <div class="page-head"><div class="row" style="min-width:0"><button class="btn ghost sm" data-act="nb-back">‹ Notebooks</button><h1 dir="auto" style="min-width:0">${esc(nb.name)}</h1></div>
      <div class="row">${DESKTOP ? `<button class="btn" data-act="nb-folder">📁 Add folder</button>` : `<label class="btn" for="nb-dir">📁 Add folder</label><input id="nb-dir" type="file" webkitdirectory multiple hidden data-chg="nb-files">`}<label class="btn" for="nb-file">${I.plus} Add files</label><input id="nb-file" type="file" multiple hidden data-chg="nb-files">${DESKTOP && (nb.sources || []).some(s => s.kind === 'folder') ? `<button class="btn ghost" data-act="nb-sync" ${busy ? 'disabled' : ''}>↻ Check for changes</button>` : ''}</div></div>
    <div class="nb-grid">
      <aside class="card pad nb-side">
        <div class="section-title"><h2>Sources</h2><span class="small muted">${files.length} files · ${files.reduce((s, f) => s + (f.chunks || []).length, 0)} passages</span></div>
        <div id="nb-progress">${busy ? '' : ''}</div>${busy ? `<button class="btn sm" data-act="nb-stop">Stop</button>` : ''}
        ${(nb.sources || []).map(s => `<div class="nb-source"><span>${s.kind === 'folder' ? '📁' : '📄'}</span><div style="min-width:0"><b dir="auto">${esc(s.name)}</b>${s.path ? `<div class="small muted mono" style="word-break:break-all">${esc(s.path)}</div>` : ''}</div><button class="icon-btn" data-act="nb-src-del" data-id="${esc(s.id)}" aria-label="Remove source">${I.x}</button></div>`).join('') || '<p class="small muted">Add a folder or files to start.</p>'}
        ${unread.length ? `<details class="small"><summary>${unread.length} file${unread.length > 1 ? 's' : ''} could not be read</summary><ul>${unread.slice(0, 50).map(f => `<li dir="auto">${esc(f.rel || f.name)}${f.note ? ` — <span class="muted">${esc(f.note)}</span>` : ''}</li>`).join('')}</ul></details>` : ''}
        <details class="small"><summary>All files</summary><ul class="nb-files">${files.slice(0, 400).map(f => `<li dir="auto">${esc(f.rel || f.name)} <span class="muted">${(f.chunks || []).length}</span></li>`).join('')}</ul></details>
        ${(nb.notes || []).length ? `<div class="section-title"><h2>Notes</h2></div>${nb.notes.map(n => `<div class="nb-note" dir="auto">${esc(E.clip(n.text, 400))}<button class="icon-btn" data-act="nb-note-del" data-id="${esc(n.id)}" aria-label="Delete note">${I.x}</button></div>`).join('')}` : ''}
        <div class="row" style="margin-top:auto"><span class="spacer"></span>${UI.confirm === 'nbdel' ? `<span class="small">Delete this notebook? Your files stay.</span><button class="btn sm danger" data-act="nb-delete">Delete</button><button class="btn sm" data-act="cancel-confirm">Keep</button>` : `<button class="btn ghost sm danger" data-act="nb-ask-delete">${I.trash} Delete notebook</button>`}</div>
      </aside>
      <section class="card nb-main">
        <div class="nb-chat" id="nb-chat">${(nb.chat || []).map(x => nbAnswerHTML(nb, x)).join('') || `<div class="nb-empty"><p class="muted">Ask anything about these files.</p>${St.sample && files.length ? `<button class="btn" data-act="nb-overview">✨ Overview of the sources and questions to ask</button>` : ''}</div>`}
          ${UI.nb.asking ? '<div class="nb-turn"><div class="progress indet" style="width:140px"><i></i></div><div class="small muted">Reading the passages…</div></div>' : ''}</div>
        <div class="nb-ask"><textarea class="input hold-render" id="nb-q" rows="2" placeholder="${St.sample ? 'Ask a question… (Enter to send, Shift+Enter for a new line)' : 'Search the files…'}" dir="auto">${esc(UI.nb.q)}</textarea>
          <div class="row">${St.sample ? `<div class="seg"><button data-act="nb-mode" data-m="ask" aria-pressed="${UI.nb.mode === 'ask'}">Answer</button><button data-act="nb-mode" data-m="search" aria-pressed="${UI.nb.mode === 'search'}">Passages only</button></div>` : ''}<span class="spacer"></span>${(nb.chat || []).length ? `<button class="btn ghost sm" data-act="nb-clear">Clear chat</button>` : ''}<button class="btn primary" data-act="nb-send" ${UI.nb.asking || !files.length ? 'disabled' : ''}>${St.sample && UI.nb.mode === 'ask' ? 'Ask' : 'Search'}</button></div></div>
      </section>
      ${t ? `<aside class="card pad nb-cite-panel"><div class="row"><b>Source ${UI.nb.cite.n}</b><span class="spacer"></span><button class="icon-btn" data-act="nb-cite-close" aria-label="Close">${I.x}</button></div>${nbPassageHTML(nb, t, UI.nb.cite.n)}</aside>` : ''}
    </div></div>`;
}
HOOKS.afterRender.push(() => { if (UI.view === 'notebook') nbProgress(); });

Object.assign(ACT, {
  'nb-create': () => { const name = (($('#nb-new-name') || {}).value || '').trim() || 'Notebook ' + (nbList().length + 1); const id = E.uid('nb'); colPut('notebooks', { id, name, sources: [], chat: [], notes: [], counts: { files: 0, passages: 0 }, createdAt: nowISO() }); UI.nb.open = id; render(); },
  'nb-open': el => { UI.nb.open = el.dataset.id; UI.nb.cite = null; render(); },
  'nb-back': () => { UI.nb.open = null; UI.nb.cite = null; render(); },
  'nb-folder': () => nbAddFolder(UI.nb.open).catch(e => { if (e && e.code !== 'cancelled') toast('Folder not added: ' + (e.message || e.code), { err: true }); }),
  'nb-sync': () => nbSync(UI.nb.open, true),
  'nb-stop': () => { if (UI.nb.busy) UI.nb.busy.stop = true; },
  'nb-src-del': async el => {
    const nb = nbGet(UI.nb.open), X = await nbLoad(nb.id), sid = el.dataset.id;
    for (const [k, f] of Object.entries(X.store.files)) if ((sid === 'files' && f.src === 'upload') || f.src === sid) { if (f.fileId) FILES.remove('notebook', f.fileId).catch(() => {}); delete X.store.files[k]; }
    X.index = null; colPut('notebooks', { ...nb, sources: (nb.sources || []).filter(s => s.id !== sid) }); await nbPersist(nb.id); render();
  },
  'nb-send': () => { const q = (($('#nb-q') || {}).value || '').trim(); if (q) nbAsk(UI.nb.open, q); },
  'nb-follow': el => nbAsk(UI.nb.open, el.dataset.q),
  'nb-overview': () => nbOverview(UI.nb.open),
  'nb-mode': el => { UI.nb.mode = el.dataset.m; UI.nb.q = ($('#nb-q') || {}).value || ''; render(); },
  'nb-cite': el => { UI.nb.cite = { t: el.dataset.t, n: +el.dataset.n }; render(); },
  'nb-cite-close': () => { UI.nb.cite = null; render(); },
  'nb-openfile': async el => {
    const X = NBX.get(UI.nb.open), f = X && X.store.files[el.dataset.key]; if (!f) return;
    try { if (f.path && DESKTOP) await DK.call('nb:open', { file: f.path }); else if (f.fileId) await FILES.open('notebook', f.fileId, f.name); } catch (e) { toast('Could not open: ' + (e.message || e.code), { err: true }); }
  },
  'nb-copy': el => { const t = (nbGet(UI.nb.open).chat || []).find(x => x.id === el.dataset.t); if (t) navigator.clipboard.writeText(nbPlain(t)).then(() => toast('Copied.'), () => toast('Copy failed.')); },
  'nb-note': el => { const nb = nbGet(UI.nb.open), t = (nb.chat || []).find(x => x.id === el.dataset.t); if (!t) return; colPut('notebooks', { ...nb, notes: [...(nb.notes || []), { id: E.uid('n'), text: nbPlain(t), at: nowISO() }] }); toast('Saved to notes.'); render(); },
  'nb-note-del': el => { const nb = nbGet(UI.nb.open); colPut('notebooks', { ...nb, notes: (nb.notes || []).filter(n => n.id !== el.dataset.id) }); render(); },
  'nb-task': el => { const nb = nbGet(UI.nb.open), t = (nb.chat || []).find(x => x.id === el.dataset.t); if (!t) return; const task = makeTask({ title: E.clip(t.q, 120), notes: nbPlain(t), history: [{ at: nowISO(), text: `From notebook “${nb.name}”` }] }); putTask(task); render(); openDrawer('task', task.id); },
  'nb-clear': () => { const nb = nbGet(UI.nb.open); colPut('notebooks', { ...nb, chat: [] }); UI.nb.cite = null; render(); },
  'nb-ask-delete': () => { UI.confirm = 'nbdel'; render(); },
  'nb-delete': async () => {
    const id = UI.nb.open, X = await nbLoad(id);
    for (const f of Object.values(X.store.files)) if (f.fileId) FILES.remove('notebook', f.fileId).catch(() => {});
    FILES.remove('notebook', id + '.json').catch(() => {}); NBX.delete(id); colDel('notebooks', id); UI.nb.open = null; UI.confirm = null; render();
  },
});
// answer with its sources written out, for notes, tasks and copying
function nbPlain(t) {
  const used = [...new Set(t.cites || [])];
  return `${t.q}\n\n${(t.answer || '').trim()}${used.length ? '\n\nSources:\n' + used.map(n => t.hits[n - 1] ? `[${n}] ${t.hits[n - 1].rel}${t.hits[n - 1].loc ? ' (' + t.hits[n - 1].loc + ')' : ''}` : '').filter(Boolean).join('\n') : ''}`;
}
Object.assign(CHG, { 'nb-files': el => { const fs = [...el.files]; if (fs.length) nbAddFiles(UI.nb.open, fs).catch(e => toast('Not added: ' + (e.message || e), { err: true })); } });
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'nb-q' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ACT['nb-send'](); } });
window.__AR_NB = { tokens: nbTokens, chunks: nbChunks }; // test hook
