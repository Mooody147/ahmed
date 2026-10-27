/* ---------- tidy tasks: duplicates merged into one, long headers shortened ---------- */
// Duplicates: two tasks are the same work when their headers (and what they ask) share most of their words, more so
// when they come from the same conversation or email; a different project counts against it. They are shown side by
// side and merged into the one you keep: items, evidence, emails, links and history all move to it, the earliest
// deadline and the highest priority win, and canvas lines to the others now point at it. Undo brings them back.
const DUPC = { key: '', groups: [] };
function dupGroups() {
  const ts = [...St.tasks.values()].filter(t => t.status !== 'done' || Date.now() - new Date(t.updatedAt || 0) < 14 * 864e5);
  const ign = new Set(St.settings.dupIgnore || []);
  const key = ts.map(t => t.id + (t.updatedAt || '')).join() + '|' + ign.size;
  if (key === DUPC.key) return DUPC.groups;
  const tok = ts.map(t => [E.tokens(t.title), E.tokens(t.title + ' ' + (t.action || ''))]);
  const up = ts.map((_, i) => i), find = i => (up[i] === i ? i : (up[i] = find(up[i])));
  for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
    const a = ts[i], b = ts[j];
    if (ign.has([a.id, b.id].sort().join('|'))) continue;
    let sc = Math.max(E.jaccard(tok[i][0], tok[j][0]), 0.95 * E.jaccard(tok[i][1], tok[j][1]));
    if (sc < 0.4) continue;
    if (a.threadKey && a.threadKey === b.threadKey) sc += 0.12;
    if ((a.emailIds || []).some(id => (b.emailIds || []).includes(id))) sc += 0.08;
    if (a.project && b.project && E.normMatch(a.project) !== E.normMatch(b.project)) sc -= 0.15;
    if (a.ownership !== b.ownership && (a.ownership === 'mine' || b.ownership === 'mine')) sc -= 0.1;
    if (sc >= 0.68) up[find(i)] = find(j);
  }
  const by = new Map(); ts.forEach((t, i) => { const r = find(i); if (!by.has(r)) by.set(r, []); by.get(r).push(t); });
  const weight = t => subsOf(t).length * 2 + (t.evidence || []).length + (t.emailIds || []).length + (t.status !== 'done' ? 3 : 0);
  DUPC.groups = [...by.values()].filter(g => g.length > 1).map(g => g.sort((x, y) => weight(y) - weight(x) || (x.createdAt || '').localeCompare(y.createdAt || '')));
  DUPC.key = key;
  return DUPC.groups;
}
function mergeTasks(keepId, otherIds) {
  const keep = clone(St.tasks.get(keepId)); if (!keep) return;
  const others = otherIds.map(id => St.tasks.get(id)).filter(t => t && t.id !== keepId); if (!others.length) return;
  const ch = { tasks: {}, els: {} }, now = nowISO(), gone = new Set(others.map(o => o.id));
  const have = new Set(subsOf(keep).map(x => E.normMatch(x.text)));
  for (const o of others) {
    keep.subtasks = [...subsOf(keep), ...subsOf(o).filter(x => !have.has(E.normMatch(x.text)) && have.add(E.normMatch(x.text)))];
    keep.evidence = [...(keep.evidence || []), ...(o.evidence || [])].slice(-20);
    keep.emailIds = [...new Set([...(keep.emailIds || []), ...(o.emailIds || [])])];
    keep.tags = [...new Set([...(keep.tags || []), ...(o.tags || [])])];
    keep.relatedIds = [...new Set([...relIds(keep), ...relIds(o)])];
    if (o.deadline && (!keep.deadline || o.deadline < keep.deadline)) { keep.deadline = o.deadline; keep.deadlineBasis = o.deadlineBasis; keep.deadlineText = o.deadlineText; }
    if (PRIO_RANK[o.priority] < PRIO_RANK[keep.priority]) keep.priority = o.priority;
    if (o.askedOn && (!keep.askedOn || o.askedOn < keep.askedOn)) keep.askedOn = o.askedOn;
    if ((o.createdAt || '') < (keep.createdAt || '')) keep.createdAt = o.createdAt;
    if (keep.status === 'done' && o.status !== 'done') { keep.status = o.status; keep.completedAt = null; }
    for (const k of ['action', 'nextStep', 'topic', 'project', 'discipline', 'workType', 'sourceSubject', 'sourceFrom', 'sourceDate', 'threadKey']) if (!keep[k] && o[k]) keep[k] = o[k];
    keep.history = [...(keep.history || []), ...(o.history || [])].sort((x, y) => (x.at || '').localeCompare(y.at || ''));
    ch.tasks[o.id] = null;
  }
  keep.relatedIds = keep.relatedIds.filter(id => id !== keep.id && !gone.has(id));
  keep.history.push({ at: now, text: `Merged duplicate${others.length > 1 ? 's' : ''} ${others.map(o => o.ref || o.title).join(', ')} into this task` });
  keep.updatedAt = now; ch.tasks[keep.id] = keep;
  // links from other tasks and lines on the canvas move to the task that stays
  for (const t of St.tasks.values()) if (!gone.has(t.id) && t.id !== keep.id && relIds(t).some(id => gone.has(id))) { const c = clone(t); c.relatedIds = [...new Set(relIds(c).map(id => (gone.has(id) ? keep.id : id)))].filter(id => id !== c.id); ch.tasks[c.id] = c; }
  const nid = id => (gone.has(String(id).replace(/^t:/, '')) ? 't:' + keep.id : id);
  for (const el of St.board.values()) if (el.type === 'connector' && (nid(el.from.id) !== el.from.id || nid(el.to.id) !== el.to.id)) {
    const c = clone(el); c.from = { ...c.from, id: nid(c.from.id) }; c.to = { ...c.to, id: nid(c.to.id) }; ch.els[c.id] = c.from.id === c.to.id ? null : c;
  }
  cvApply(ch);
  if (UI.mapSel && gone.has(UI.mapSel)) UI.mapSel = keep.id;
  return others.length;
}
function dupCallout() {
  if (St.mode === 'viewer' || !St.tasks.size) return '';
  const g = dupGroups(); if (!g.length) return '';
  const n = g.reduce((s, x) => s + x.length - 1, 0);
  return callout('warn', `<div class="row"><span>🔁 <b>${n}</b> duplicate task${n > 1 ? 's' : ''} found (${g.length} group${g.length > 1 ? 's' : ''}) — the same work added more than once.</span><span class="spacer"></span><button class="btn sm" data-act="dup-open">Review</button><button class="btn sm primary" data-act="dup-merge-all">Merge all</button></div>`);
}
DRAWER_FN.dups = () => {
  const g = dupGroups();
  return `<div class="drawer-h"><b>Duplicate tasks</b><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:14px">
    ${g.length ? `<p class="small muted" style="margin:0">Each group is the same work added more than once. The ticked task stays; the others are merged into it — their items, evidence, emails and links move across. Undo brings them back.</p>
    <div class="row"><span class="spacer"></span><button class="btn sm primary" data-act="dup-merge-all">Merge all ${g.length} group${g.length > 1 ? 's' : ''}</button></div>` : '<p class="muted">No duplicates left.</p>'}
    ${g.map((grp, gi) => `<section class="card pad dup-group" style="display:grid;gap:8px">
      ${grp.map((t, i) => `<label class="dup-row"><input type="radio" name="dupk-${gi}" value="${esc(t.id)}" ${i === 0 ? 'checked' : ''}><span class="mono muted">${esc(t.ref || '')}</span><span class="dup-t" dir="auto"><b>${esc(t.title)}</b><small class="muted">${esc([projKeyLabel(t)[1], topicOf(t), mailDate(t) ? '✉ ' + fmtDate(mailDate(t)) : '', subsOf(t).length ? subsOf(t).length + ' items' : '', STATUS[t.status]].filter(Boolean).join(' · '))}</small></span></label>`).join('')}
      <div class="row"><button class="btn sm primary" data-act="dup-merge" data-g="${gi}">Merge into the ticked one</button><button class="btn sm ghost" data-act="dup-ignore" data-g="${gi}">Not duplicates</button></div>
    </section>`).join('')}
  </div>`;
};
Object.assign(ACT, {
  'dup-open': () => openDrawer('dups', 'all'),
  'dup-merge': el => {
    const grp = dupGroups()[+el.dataset.g]; if (!grp) return;
    const pick = document.querySelector(`input[name="dupk-${el.dataset.g}"]:checked`); const keepId = pick ? pick.value : grp[0].id;
    const n = mergeTasks(keepId, grp.map(t => t.id).filter(id => id !== keepId));
    render(); if (UI.drawer && UI.drawer.kind === 'dups') renderDrawer();
    toast(`${n} duplicate${n > 1 ? 's' : ''} merged into ${St.tasks.get(keepId)?.ref || 'one task'}.`, { action: 'Undo', fn: cvUndo });
  },
  'dup-merge-all': () => {
    let n = 0;
    for (let guard = 0; guard < 50; guard++) { const grp = dupGroups()[0]; if (!grp) break; n += mergeTasks(grp[0].id, grp.slice(1).map(t => t.id)) || 0; }
    render(); if (UI.drawer && UI.drawer.kind === 'dups') renderDrawer();
    toast(`${n} duplicate task${n > 1 ? 's' : ''} merged.`, { action: 'Undo', fn: () => { for (let i = 0; i < n && UI.cvUndo.length; i++) cvUndo(); } });
  },
  'dup-ignore': el => {
    const grp = dupGroups()[+el.dataset.g]; if (!grp) return;
    const pairs = []; grp.forEach((a, i) => grp.slice(i + 1).forEach(b => pairs.push([a.id, b.id].sort().join('|'))));
    saveSettings(s => { s.dupIgnore = [...new Set([...(s.dupIgnore || []), ...pairs])].slice(-2000); });
    render(); renderDrawer();
  },
});

// Long headers (from before Claude wrote short ones) are shortened by the quick model in one go; without Claude a
// careful local trim is used. Each change is kept in the task history and can be undone.
const LONG_TITLE = 70;
const longTitled = () => [...St.tasks.values()].filter(t => t.status !== 'done' && (t.title || '').length > LONG_TITLE);
const TIDY = { running: false };
function headersCallout() {
  if (St.mode === 'viewer') return '';
  const n = longTitled().length; if (!n || (St.settings.ui || {}).tidyHeadersOff) return '';
  return callout('info', `<div class="row"><span>✂️ ${n} task${n > 1 ? 's have' : ' has'} a long header. ${St.sample ? 'Claude can summarise each one into a short header (the details stay in the task).' : 'They can be shortened to a few words (the details stay in the task).'}</span><span class="spacer"></span>${TIDY.running ? '<div class="progress indet" style="width:90px"><i></i></div>' : `<button class="btn sm primary" data-act="tidy-headers">Shorten headers</button><button class="btn sm ghost" data-act="tidy-headers-off" aria-label="Hide">✕</button>`}</div>`);
}
async function tidyHeaders() {
  const list = longTitled(); if (!list.length || TIDY.running) return;
  TIDY.running = true; render();
  const out = {};
  try {
    if (St.sample) {
      for (let i = 0; i < list.length; i += 40) {
        const chunk = list.slice(i, i + 40);
        const prompt = `Rewrite each task header below as a short header I can scan on a canvas: what to do, 3–8 words, at most 55 characters, like a to-do item ("Revise RAS pump calc", "Answer CRS comments on valve spec"). Keep the language of the original (Arabic stays Arabic). Keep a short document number or equipment tag only if it tells tasks apart. Never add facts. Reply with JSON only: {"titles":[{"id":"…","title":"…"}]}

TASKS
${chunk.map(t => JSON.stringify({ id: t.id, title: t.title, action: E.clip(t.action || '', 300), project: t.project || '' })).join('\n')}`;
        const ans = await St.sample.json(prompt, { modelTier: 'quick' });
        for (const x of (ans && ans.titles) || []) if (x && x.id && St.tasks.has(x.id) && x.title) out[x.id] = E.shortTitle(String(x.title));
      }
    }
  } catch (e) { toast('Claude could not shorten the headers now; they were trimmed instead.', { err: true }); }
  const ch = { tasks: {} }, now = nowISO();
  for (const t of list) {
    const nt = out[t.id] || E.shortTitle(t.title); if (!nt || nt === t.title) continue;
    const c = clone(t); c.title = nt; c.updatedAt = now; if (!c.action) c.action = t.title;
    (c.history = c.history || []).push({ at: now, text: `Header shortened (was “${E.clip(t.title, 140)}”)` });
    ch.tasks[t.id] = c;
  }
  TIDY.running = false;
  const n = Object.keys(ch.tasks).length;
  if (n) { cvApply(ch); measureCache.clear(); toast(`${n} header${n > 1 ? 's' : ''} shortened.`, { action: 'Undo', fn: cvUndo }); }
  render();
}
Object.assign(ACT, { 'tidy-headers': () => tidyHeaders(), 'tidy-headers-off': () => { saveSettingsUi({ tidyHeadersOff: true }); render(); } });
