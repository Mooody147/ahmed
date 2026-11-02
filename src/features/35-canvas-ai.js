/* ---------- Claude on the canvas: handwriting, break it down, group notes, process flow ---------- */
// ✍ Handwriting → tasks or text: select what you wrote with the pen (lasso or click) and Claude reads it — English
//   or Arabic — into typed text, or into tasks with person, date and project, which you check before adding.
// 🪄 Break it down: on a task, Claude adds its next concrete steps as items, shown as boxes in order beside it.
// 🧩 Group my notes: select a pile of sticky notes and Claude sorts them into themes, each in its own labelled frame.
// ⇢ Process flow from text: type "inlet → fine screens → grit chamber → …" (or describe the process) and Claude
//   draws it as linked blocks, decisions as diamonds, ready to mark up. Arrows typed by hand are drawn even without Claude.
const CAI = { busy: '' };
const strokesOf = els => els.filter(e => e.type === 'stroke' && e.kind !== 'highlighter');
// pen strokes drawn black on white as a picture Claude can read
async function inkPNG(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of strokes) { const b = elBox(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
  const pad = 24; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad; const W = x1 - x0, H = y1 - y0;
  const paths = strokes.map(e => e.pressure ? `<path d="${pressurePath(e.pts, Math.max(3, e.width))}" fill="#111"/>` : `<path d="${strokePath(e.pts)}" fill="none" stroke="#111" stroke-width="${Math.max(3, e.width)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  const svgS = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${x0} ${y0} ${W} ${H}"><rect x="${x0}" y="${y0}" width="${W}" height="${H}" fill="#fff"/>${paths}</svg>`;
  const scale = Math.max(1, Math.min(4, 1400 / Math.max(W, H)));
  const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgS); await im.decode();
  const c = document.createElement('canvas'); c.width = Math.round(W * scale); c.height = Math.round(H * scale); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return { blob: await new Promise(r => c.toBlob(r, 'image/png')), box: { x: x0 + pad, y: y0 + pad, w: W - 2 * pad, h: H - 2 * pad } };
}
async function readHandwriting(mode) {
  const strokes = strokesOf([...UI.cvSel].map(id => St.board.get(id)).filter(Boolean)); if (!strokes.length || !St.sample || CAI.busy) return;
  CAI.busy = 'hw'; renderWorld(); toast('✍ Claude is reading your handwriting…');
  try {
    const { blob, box } = await inkPNG(strokes);
    const prompt = `This picture is handwriting by ${St.settings.me.name || 'an engineer'} with a stylus — English, Arabic, or both, possibly with arrows, dashes or bullets. Read it exactly (keep numbers, tags, units and names as written; Arabic stays Arabic).${mode === 'tasks' ? ` Then turn it into to-do tasks: one per action. TODAY is ${E.todayISO()}; resolve dates like "tomorrow", "Thursday", "بكرة", "next week" to YYYY-MM-DD. Known projects: ${allProjects().map(p => p.name || p).slice(0, 30).join(', ') || 'none'}.` : ''} If part is unreadable write [?] there; never guess.
Reply with JSON only: {"text":"the handwriting as typed text, line breaks kept"${mode === 'tasks' ? ',"tasks":[{"title":"short header, 3–8 words","owner":"me or the person named","deadline":"YYYY-MM-DD or null","project":"one of the known projects or null","priority":"critical|high|medium|low","note":"anything else written about it, or null"}]' : ''}}`;
    const r = await St.sample.json(prompt, { images: [blob], modelTier: 'default' });
    const text = String((r && r.text) || '').trim();
    if (mode === 'text') {
      if (!text) { toast('No handwriting could be read.'); return; }
      const el = newEl('text', { x: Math.round(box.x), y: Math.round(box.y), w: Math.max(200, Math.round(box.w)), h: Math.max(40, Math.round(box.h)), text, size: 20, color: 'ink' });
      const ch = { els: { [el.id]: el } }; strokes.forEach(s => { ch.els[s.id] = null; });
      cvApply(ch); UI.cvSel = new Set([el.id]); render(); toast('✍ Typed from your handwriting.', { action: 'Undo', fn: cvUndo });
      return;
    }
    const tasks = ((r && r.tasks) || []).filter(t => t && t.title).slice(0, 20);
    if (!tasks.length) { toast(text ? `Read: “${E.clip(text, 80)}” — no tasks in it.` : 'No handwriting could be read.'); return; }
    CAI.hw = { tasks: tasks.map(t => ({ ...t, keep: true })), text, strokes: strokes.map(s => s.id), box };
    openDrawer('hw', 'x');
  } catch (e) { toast((typeof aiErrorText === 'function' && aiErrorText(e)) || 'Claude could not read it now.', { err: true }); }
  finally { CAI.busy = ''; renderWorld(); }
}
DRAWER_FN.hw = () => {
  const h = CAI.hw; if (!h) return null;
  return `<div class="drawer-h"><b>✍ Tasks from your handwriting</b><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:12px">
    <blockquote class="trc-q small" dir="auto" style="white-space:pre-wrap">${esc(h.text)}</blockquote>
    ${h.tasks.map((t, i) => `<label class="dup-row"><input type="checkbox" data-chg="hw-keep" data-i="${i}" ${t.keep ? 'checked' : ''}><span class="mono muted">${i + 1}</span><span class="dup-t"><b dir="auto">${esc(t.title)}</b><small class="muted">${esc([t.owner && !/^me$/i.test(t.owner) ? 'Waiting on ' + t.owner : 'Mine', t.deadline ? 'due ' + fmtDate(t.deadline) : '', t.project || '', t.priority && t.priority !== 'medium' ? t.priority : '', t.note || ''].filter(Boolean).join(' · '))}</small></span></label>`).join('')}
    <label class="check small"><input type="checkbox" id="hw-clear" checked>Remove the handwriting from the canvas once the tasks are added</label>
    <div class="row"><button class="btn primary" data-act="hw-add">Add ${h.tasks.filter(t => t.keep).length} task${h.tasks.filter(t => t.keep).length === 1 ? '' : 's'}</button><button class="btn ghost" data-act="close-drawer">Cancel</button></div>
  </div>`;
};
CHG['hw-keep'] = el => { if (CAI.hw) { CAI.hw.tasks[+el.dataset.i].keep = el.checked; renderDrawer(); } };
ACT['hw-add'] = () => {
  const h = CAI.hw; if (!h) return; const clear = ($('#hw-clear') || {}).checked;
  const ch = { tasks: {}, els: {} }, now = nowISO(), made = [];
  const picks = h.tasks.filter(t => t.keep), refs = nextRefs(picks.length);
  picks.forEach((x, i) => {
    const mine = !x.owner || /^me$/i.test(x.owner);
    const t = makeTask({ title: E.shortTitle(x.title), action: x.note || '', deadline: /^\d{4}-\d{2}-\d{2}$/.test(x.deadline || '') ? x.deadline : null, deadlineBasis: x.deadline ? 'explicit' : 'none', priority: ['critical', 'high', 'medium', 'low'].includes(x.priority) ? x.priority : 'medium', project: x.project || '', ownership: mine ? 'mine' : 'waiting', owner: mine ? 'me' : x.owner, status: mine ? 'todo' : 'waiting', history: [{ at: now, text: 'Created from handwriting on the canvas' }] });
    t.ref = refs[i] || t.ref; if (typeof localPlace === 'function' && !t.project) localPlace(t);
    ch.tasks[t.id] = t; made.push(t);
  });
  if (clear) h.strokes.forEach(id => { ch.els[id] = null; });
  cvApply(ch); CAI.hw = null; closeDrawer(); UI.cvSel.clear(); render();
  if (St.sample) queueCategorize(made.map(t => t.id));
  toast(`✅ ${made.length} task${made.length === 1 ? '' : 's'} added from your handwriting.`, { action: 'Undo', fn: cvUndo });
};

/* --- break a task down into its next steps --- */
async function breakDown(id) {
  const t = St.tasks.get(id); if (!t || !St.sample || CAI.busy) return;
  CAI.busy = 'bd'; renderWorld(); if (UI.drawer && UI.drawer.kind === 'task') renderDrawer();
  try {
    const prompt = `Break this engineering task into its next concrete steps (3 to 8), in the order they are done. Each step is a short action, at most 10 words, specific to this task (documents, people, checks), in the task's language. Do not repeat steps already listed. Reply with JSON only: {"steps":["…"]}
TASK: ${t.title}
WHAT IS NEEDED: ${t.action || '-'}
PROJECT: ${t.project || '-'} · DEADLINE: ${t.deadline || '-'}
ALREADY LISTED: ${subsOf(t).map(x => x.text).join(' | ') || '-'}`;
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    const have = new Set(subsOf(t).map(x => E.normMatch(x.text)));
    const steps = ((r && r.steps) || []).map(x => String(x).trim()).filter(x => x && !have.has(E.normMatch(x))).slice(0, 8);
    if (!steps.length) { toast('Claude found no further steps for this task.'); return; }
    const c = clone(t); c.subtasks = [...subsOf(c), ...steps.map((x, i) => ({ id: E.uid('s'), text: `${subsOf(c).length + i + 1}. ${x}`, ref: '', location: '', done: false }))];
    (c.history = c.history || []).push({ at: nowISO(), text: `Broken down into ${steps.length} steps by Claude` });
    c.updatedAt = nowISO(); cvApply({ tasks: { [t.id]: c } }); UI.mapItems.add(t.id); render(); if (UI.drawer && UI.drawer.kind === 'task') renderDrawer();
    toast(`🪄 ${steps.length} steps added to ${t.ref || 'the task'}.`, { action: 'Undo', fn: cvUndo });
  } catch (e) { toast((typeof aiErrorText === 'function' && aiErrorText(e)) || 'Claude could not do this now.', { err: true }); }
  finally { CAI.busy = ''; renderWorld(); }
}
TASK_ACTIONS.push(t => St.sample && St.mode !== 'viewer' && t.status !== 'done' ? `<button class="btn sm ghost" data-act="cai-break" data-id="${esc(t.id)}" ${CAI.busy ? 'disabled' : ''}>🪄 Break it down</button>` : '');
// the bar for a selected task on the canvas, with Break it down
CTX_PRE.push(() => {
  if ([...UI.cvSel].some(id => St.board.has(id)) || (UI.lassoTasks && UI.lassoTasks.size) || !UI.mapSel || !St.tasks.has(UI.mapSel)) return '';
  const t = St.tasks.get(UI.mapSel);
  return `<div class="cv-ctx" role="toolbar" aria-label="Selected task"><span class="small muted">${esc(t.ref || 'Task')} selected</span>${St.sample && t.status !== 'done' ? `<button class="btn sm" data-act="cai-break" data-id="${esc(t.id)}" ${CAI.busy ? 'disabled' : ''}>${CAI.busy === 'bd' ? 'Thinking…' : '🪄 Break it down'}</button>` : ''}<button class="btn sm ghost danger" data-act="cv-del" title="Delete (Del)">${I.trash} Delete</button></div>`;
});
ACT['cai-break'] = el => breakDown(el.dataset.id);

/* --- group sticky notes into themed frames --- */
async function groupNotes() {
  const notes = [...UI.cvSel].map(id => St.board.get(id)).filter(e => e && ['sticky', 'text'].includes(e.type) && (e.text || '').trim()); if (notes.length < 3 || !St.sample || CAI.busy) return;
  CAI.busy = 'gr'; renderWorld(); toast('🧩 Claude is grouping your notes…');
  try {
    const prompt = `Group these notes into 2 to 7 themes for an engineer's brainstorm board. Every note goes in exactly one theme; theme names are 1–4 words in the notes' language. Reply with JSON only: {"themes":[{"name":"…","ids":["…"]}]}
NOTES:
${notes.map(n => JSON.stringify({ id: n.id, text: E.clip(n.text, 200) })).join('\n')}`;
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    const known = new Set(notes.map(n => n.id)), used = new Set();
    let themes = ((r && r.themes) || []).map(t => ({ name: String(t.name || 'Group').slice(0, 40), ids: (t.ids || []).filter(id => known.has(id) && !used.has(id) && used.add(id)) })).filter(t => t.ids.length);
    const rest = notes.filter(n => !used.has(n.id)).map(n => n.id); if (rest.length) themes.push({ name: 'Other', ids: rest });
    // frames side by side where the notes were, notes in a grid inside each
    const x0 = Math.min(...notes.map(n => n.x)), y0 = Math.min(...notes.map(n => n.y)), ch = { els: {} };
    let fx = x0;
    for (const th of themes) {
      const cols = Math.min(3, Math.ceil(Math.sqrt(th.ids.length))), cw = 220, chh = 220, gap = 20, rows = Math.ceil(th.ids.length / cols);
      const fw = cols * cw + (cols + 1) * gap, fh = rows * chh + (rows + 1) * gap + 40;
      const fr = newEl('frame', { x: fx, y: y0, w: fw, h: fh, text: th.name, color: 'ink' }); ch.els[fr.id] = fr;
      th.ids.forEach((id, i) => { const n = St.board.get(id); ch.els[id] = { ...n, x: fx + gap + (i % cols) * (cw + gap), y: y0 + 40 + gap + Math.floor(i / cols) * (chh + gap), w: 200, h: 200 }; });
      fx += fw + 40;
    }
    cvApply(ch); UI.cvSel.clear(); render(); toast(`🧩 ${notes.length} notes grouped into ${themes.length} themes.`, { action: 'Undo', fn: cvUndo });
  } catch (e) { toast((typeof aiErrorText === 'function' && aiErrorText(e)) || 'Claude could not do this now.', { err: true }); }
  finally { CAI.busy = ''; renderWorld(); }
}
CTX_EXTRA.push(els => {
  if (!St.sample || St.mode === 'viewer') return '';
  const ink = strokesOf(els).length, notes = els.filter(e => ['sticky', 'text'].includes(e.type) && (e.text || '').trim()).length;
  return `${ink ? `<span class="ctx-group"><button class="btn sm primary" data-act="cai-hw" data-m="tasks" ${CAI.busy ? 'disabled' : ''} title="Claude reads your handwriting into tasks">${CAI.busy === 'hw' ? 'Reading…' : '✍ To tasks'}</button><button class="btn sm ghost" data-act="cai-hw" data-m="text" ${CAI.busy ? 'disabled' : ''} title="Claude types out your handwriting">✍ To text</button></span>` : ''}${notes >= 3 ? `<button class="btn sm" data-act="cai-group" ${CAI.busy ? 'disabled' : ''} title="Claude sorts these notes into themes">${CAI.busy === 'gr' ? 'Grouping…' : '🧩 Group'}</button>` : ''}`;
});
Object.assign(ACT, { 'cai-hw': el => readHandwriting(el.dataset.m), 'cai-group': () => groupNotes() });

/* --- process flow from text --- */
function parseFlowText(text) {
  // "a → b → c", "a -> b", one chain per line; "x ? yes: y / no: z" is not parsed here (Claude handles prose)
  const nodes = new Map(), links = [];
  const id = l => { const k = E.normMatch(l); if (!nodes.has(k)) nodes.set(k, { id: 'n' + nodes.size, label: l.trim(), kind: /\?$/.test(l.trim()) ? 'decision' : 'process' }); return nodes.get(k).id; };
  for (const line of String(text).split(/\n|;/)) {
    const parts = line.split(/\s*(?:→|->|=>|⟶|←)\s*/).map(x => x.trim()).filter(Boolean); if (parts.length < 2) continue;
    for (let i = 0; i + 1 < parts.length; i++) links.push({ from: id(parts[i]), to: id(parts[i + 1]) });
  }
  return nodes.size >= 2 ? { nodes: [...nodes.values()], links } : null;
}
function drawFlow(flow, title) {
  const N = flow.nodes.slice(0, 40), ids = new Set(N.map(n => n.id)), L = flow.links.filter(l => ids.has(l.from) && ids.has(l.to));
  // columns by longest path from a start, rows in order of appearance
  const col = new Map(N.map(n => [n.id, 0]));
  for (let pass = 0; pass < N.length; pass++) for (const l of L) if (col.get(l.to) < col.get(l.from) + 1 && col.get(l.from) + 1 < N.length) col.set(l.to, col.get(l.from) + 1);
  const byCol = new Map(); for (const n of N) { const c = col.get(n.id); if (!byCol.has(c)) byCol.set(c, []); byCol.get(c).push(n); }
  const W = 190, H = 84, GX = 90, GY = 50, maxRows = Math.max(...[...byCol.values()].map(a => a.length));
  const total = { w: byCol.size * (W + GX), h: maxRows * (H + GY) + 60 };
  const at = freeSpot(total.w, total.h), ch = { els: {} }, el = {};
  if (title) { const tt = newEl('text', { x: at.x, y: at.y, w: 600, h: 40, text: title, size: 24, color: 'ink' }); ch.els[tt.id] = tt; }
  for (const [c, list] of byCol) list.forEach((n, r) => {
    const kind = n.kind === 'decision' ? 'diamond' : ['start', 'end', 'terminal'].includes(n.kind) ? 'ellipse' : 'rect';
    const e = newEl('shape', { kind, x: at.x + c * (W + GX), y: at.y + 60 + r * (H + GY) + (maxRows - list.length) * (H + GY) / 2, w: W, h: kind === 'diamond' ? H + 30 : H, text: n.label, color: kind === 'diamond' ? '#C26100' : '#0A6B74' });
    el[n.id] = e; ch.els[e.id] = e;
  });
  for (const l of L) { const c = newEl('connector', { from: { k: 'e', id: el[l.from].id }, to: { k: 'e', id: el[l.to].id }, width: 2.5, color: 'ink' }); if (l.label) c.label = l.label; ch.els[c.id] = c; }
  cvApply(ch); UI.cvSel = new Set(Object.values(el).map(e => e.id)); render();
  const vpw = document.getElementById('map-vp'); if (vpw && typeof fitBox === 'function') fitBox({ x: at.x, y: at.y, w: total.w, h: total.h });
  return N.length;
}
function flowModal() {
  const m = $('#modal'); if (!m) return;
  m.innerHTML = deco(`<div class="card pad mail-draft" role="dialog" aria-label="Process flow"><div class="row"><b>⇢ Process flow from text</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <p class="small muted" style="margin:0">Type the steps with arrows — <i>inlet → fine screens → grit chamber → aeration → clarifier → disc filter → outfall</i> — one chain per line, or describe the process in words${St.sample ? ' and Claude draws it' : ''}. A step ending in “?” becomes a decision.</p>
    <textarea class="input" id="flow-text" rows="7" dir="auto" placeholder="Inlet works → Fine screens → Grit removal → Aeration tanks → Secondary clarifiers → Disc filters → UV → Outfall"></textarea>
    <div class="row end"><button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="flow-draw" ${CAI.busy ? 'disabled' : ''}>${CAI.busy === 'fl' ? 'Drawing…' : 'Draw it'}</button></div></div>`);
  m.hidden = false; setTimeout(() => { const t = $('#flow-text'); if (t) t.focus(); }, 30);
}
ACT['flow-open'] = () => { UI.menuOpen = ''; flowModal(); };
ACT['flow-draw'] = async () => {
  const text = (($('#flow-text') || {}).value || '').trim(); if (!text) return;
  const local = parseFlowText(text);
  if (local && (!St.sample || /→|->|=>/.test(text))) { $('#modal').hidden = true; toast(`⇢ ${drawFlow(local)} steps drawn.`, { action: 'Undo', fn: cvUndo }); return; }
  if (!St.sample) { toast('Type the steps with arrows (→ or ->) between them.'); return; }
  CAI.busy = 'fl'; flowModal(); $('#flow-text').value = text;
  try {
    const r = await St.sample.json(`Turn this description into a process flow diagram for a water/wastewater engineer. Use the plant's real unit names from the text; keep it to the steps described (never invent equipment). Kinds: start, end, process, decision (a question with yes/no branches). Reply with JSON only: {"title":"short title","nodes":[{"id":"a","label":"≤4 words","kind":"process"}],"links":[{"from":"a","to":"b","label":"optional, e.g. yes / no / sludge"}]}
TEXT: ${text}`, { modelTier: 'default' });
    const flow = { nodes: ((r && r.nodes) || []).filter(n => n && n.id && n.label).map(n => ({ id: String(n.id), label: String(n.label).slice(0, 40), kind: String(n.kind || 'process') })), links: ((r && r.links) || []).map(l => ({ from: String(l.from), to: String(l.to), label: l.label ? String(l.label) : '' })) };
    CAI.busy = ''; $('#modal').hidden = true;
    if (flow.nodes.length < 2) { toast('Claude could not find the steps — try listing them with arrows.'); return; }
    toast(`⇢ ${drawFlow(flow, r.title || '')} steps drawn.`, { action: 'Undo', fn: cvUndo });
  } catch (e) { CAI.busy = ''; toast((typeof aiErrorText === 'function' && aiErrorText(e)) || 'Claude could not draw it now.', { err: true }); }
};
MORE_SECTIONS.unshift(() => St.mode === 'viewer' ? '' : `<div class="mt-sec"><div class="label">Create</div><div class="row" style="flex-wrap:wrap;gap:6px">
  <button class="btn sm" data-act="flow-open">⇢ Process flow from text</button>
  ${typeof fishboneOpen === 'function' ? '<button class="btn sm" data-act="fish-open">🐟 Fishbone (root cause)</button>' : ''}
  ${typeof TEMPLATES !== 'undefined' ? '<button class="btn sm" data-act="tpl-board-open">▦ Board templates</button>' : ''}</div></div>`);
