/* ---------- trace: every task followed through its email history ---------- */
// Each email is already checked against the tasks it moves on when it is analysed (an email I send that delivers a
// task's result closes it). Trace goes further, across the whole history:
//  • 🔎 Trace on a task shows its trail — the email that asked for it, every later email in the conversation or about
//    the same work (mine marked "You"), and its own history — and asks Claude whether that trail shows it is done.
//  • Trace open tasks (once a day by itself, or from ⋯ More) reads the open tasks against all later emails and lists
//    the ones that look done, partly done or no longer needed, each with the email that shows it; apply one or all.
// Only summaries and short excerpts of emails are sent, so a trace costs little.
const TRC = { running: false, results: null, task: null, busy: false, err: '' };
const emailIsMine = e => e.fromMe !== undefined ? !!e.fromMe : isMeSender(e);
const emailText = e => [e.subject, e.analysis && e.analysis.summary, e.snippet, ((e.analysis && e.analysis.tasks) || []).map(p => p.title).join(' · ')].filter(Boolean).join(' ');
const createdFrom = t => { const h = (t.history || []).find(x => /^Created from/.test(x.text || '')); return h && h.emailId; };
// emails about this task: linked to it, in its conversation, or covering most of its words; oldest first
function traceEmails(t, max = 12) {
  const tt = E.tokens(t.title + ' ' + (t.action || '') + ' ' + subsOf(t).slice(0, 6).map(x => x.text).join(' '));
  const since = E.addDays((mailDate(t) || (t.createdAt || '').slice(0, 10) || T()), -10);
  const who = [t.sourceFrom, t.requestedBy, t.owner].map(x => E.firstEmail(x || '')).filter(Boolean);
  const out = [];
  for (const e of St.emails.values()) {
    const linked = (t.emailIds || []).includes(e.id);
    if (!linked && (e.date || e.importedAt || '').slice(0, 10) < since) continue;
    const et = E.tokens(emailText(e)); let n = 0; tt.forEach(w => { if (et.has(w)) n++; });
    const cover = tt.size ? n / tt.size : 0;
    const s = (linked ? 3 : 0) + (t.threadKey && e.threadKey === t.threadKey ? 1.5 : 0) + cover + (who.some(a => (e.fromEmail || '') === a || String(e.to || '').toLowerCase().includes(a)) ? 0.2 : 0);
    if (s >= 0.45) out.push({ e, s, linked });
  }
  return out.sort((a, b) => b.s - a.s).slice(0, max).sort((a, b) => (a.e.date || '').localeCompare(b.e.date || ''));
}
const digest = e => ({ id: e.id, date: (e.date || '').slice(0, 16).replace('T', ' '), from: E.clip(e.from || '', 70), to: E.clip(e.to || '', 90), sentByMe: emailIsMine(e), subject: E.clip(e.subject || '', 140), summary: E.clip((e.analysis && e.analysis.summary) || '', 300), excerpt: E.clip(e.snippet || '', 280), attachments: (e.attachments || []).map(a => a.name).slice(0, 6) });
const taskBrief = t => ({ id: t.id, ref: t.ref, task: t.title, needed: E.clip(t.action || '', 240), owner: isMine(t) ? 'me' : (t.owner || ''), askedOn: mailDate(t) || (t.createdAt || '').slice(0, 10), deadline: t.deadline || null, openItems: subsOf(t).filter(x => !x.done).slice(0, 12).map(x => x.text), createdFromEmail: createdFrom(t) || null });
const TRACE_RULES = `Decide for each task whether the LATER emails show its work is finished — judge by the outcome, not exact words:
- "done": the result the task is for was delivered or the obligation was met (I sent the reviewed document, comments, calculation, the civil/structural/electrical input or requirements, an answer or confirmation to whoever needed it; or, for a task I wait on, the other party delivered it); also when someone confirms it was received, approved or is no longer needed.
- "partial": some of its items were done, or only part was delivered — list them in "doneItems" exactly as written in openItems.
- "superseded": a later email cancels it or replaces it with something else.
- "open": nothing shows it is finished. The email a task was created from is the request, never the proof.
Never guess: cite the email id that shows it, quote 5–25 words from that email's summary or excerpt in "quote", and give "confidence" 0–1.`;
async function traceTask(id) {
  const t = St.tasks.get(id); if (!t || !St.sample || TRC.busy) return;
  TRC.busy = true; TRC.err = ''; TRC.task = { id, result: null }; renderDrawer();
  const ems = traceEmails(t).map(x => x.e);
  const prompt = `You track an engineer's tasks through their email history. ${TRACE_RULES}
Reply with JSON only: {"verdict":"done|partial|superseded|open","emailId":"id or null","reason":"one line","quote":"…","doneItems":[],"confidence":0.0,"nextStep":"if open: the one next step, else null"}

ME: ${St.settings.me.name || 'me'} (${(St.settings.me.emails || []).join(', ')})
TASK: ${JSON.stringify(taskBrief(t))}
EMAILS (oldest first):
${ems.map(e => JSON.stringify(digest(e))).join('\n') || '(none)'}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: ems.length > 6 ? 'default' : 'quick' });
    TRC.task = { id, result: normTrace(r, ems) };
  } catch (e) { TRC.err = (typeof aiErrorText === 'function' ? aiErrorText(e) : '') || 'Claude could not trace this task now.'; }
  TRC.busy = false; renderDrawer();
}
function normTrace(r, ems) {
  r = r && typeof r === 'object' ? r : {};
  const ids = new Set(ems.map(e => e.id));
  return { taskId: String(r.taskId || ''), verdict: ['done', 'partial', 'superseded', 'open'].includes(r.verdict) ? r.verdict : 'open', emailId: ids.has(r.emailId) ? r.emailId : null, reason: String(r.reason || ''), quote: String(r.quote || ''), doneItems: Array.isArray(r.doneItems) ? r.doneItems.map(String).slice(0, 60) : [], confidence: Math.max(0, Math.min(1, +r.confidence || 0)), nextStep: r.nextStep ? String(r.nextStep) : '' };
}
function applyTrace(res) {
  const t = St.tasks.get(res.taskId); if (!t || res.verdict === 'open') return false;
  const e = (res.emailId && St.emails.get(res.emailId)) || { id: null, subject: 'email history', fromMe: false };
  const u = { newStatus: res.verdict === 'partial' ? (t.status === 'todo' ? 'in_progress' : null) : 'done', verdict: res.verdict === 'partial' ? 'partial' : 'fulfilled', reason: res.reason + (res.verdict === 'superseded' ? ' (no longer needed)' : ''), doneItems: res.doneItems, evidence: res.quote && res.emailId ? [{ source: 'BODY', sourceName: 'Email', location: '', quote: res.quote }] : [] };
  cvApply({ tasks: { [t.id]: applyTaskUpdate(t, u, e, nowISO(), `trace of email “${E.clip(e.subject || '', 60)}”`) } });
  return true;
}
// all open tasks against later emails, in batches
async function traceAll(quiet) {
  if (!St.sample || TRC.running) return;
  const open = [...St.tasks.values()].filter(t => t.status !== 'done' && t.ownership !== 'fyi');
  if (!open.length || !St.emails.size) { if (!quiet) toast('Nothing to trace yet.'); return; }
  TRC.running = true; TRC.err = ''; render();
  const skip = new Set(St.settings.traceSkip || []);
  const results = [];
  try {
    for (let i = 0; i < open.length; i += 25) {
      const chunk = open.slice(i, i + 25), pool = new Map();
      // each task with the later emails about it (not the one that asked for it)
      const briefs = chunk.map(t => { const ems = traceEmails(t, 8).filter(x => x.e.id !== createdFrom(t) && ((x.e.date || '') > (t.sourceDate || '') || !t.sourceDate)).map(x => x.e); ems.forEach(e => pool.set(e.id, e)); return { ...taskBrief(t), emails: ems.map(e => e.id) }; }).filter(b => b.emails.length);
      if (!briefs.length) continue;
      const prompt = `You track an engineer's tasks through their email history. ${TRACE_RULES}
Each task lists the ids of the later emails that may concern it; use only those.
Reply with JSON only: {"results":[{"taskId":"…","verdict":"done|partial|superseded|open","emailId":"…","reason":"one line","quote":"…","doneItems":[],"confidence":0.0}]}

ME: ${St.settings.me.name || 'me'} (${(St.settings.me.emails || []).join(', ')})
TASKS:
${briefs.map(b => JSON.stringify(b)).join('\n')}
EMAILS:
${[...pool.values()].slice(0, 80).map(e => JSON.stringify(digest(e))).join('\n')}`;
      const r = await St.sample.json(prompt, { modelTier: 'default' });
      for (const x of (r && r.results) || []) {
        const n = normTrace(x, [...pool.values()]); n.taskId = String(x.taskId || '');
        if (St.tasks.has(n.taskId) && n.verdict !== 'open' && n.emailId && n.confidence >= 0.55 && !skip.has(n.taskId + '|' + n.emailId)) results.push(n);
      }
    }
  } catch (e) { TRC.err = (typeof aiErrorText === 'function' ? aiErrorText(e) : '') || 'Claude could not trace the tasks now.'; }
  TRC.running = false; TRC.results = results;
  saveSettings(s => { s.traceAt = nowISO(); });
  render(); if (UI.drawer && UI.drawer.kind === 'trace-all') renderDrawer();
  if (!quiet) toast(results.length ? `🔎 ${results.length} task${results.length > 1 ? 's look' : ' looks'} done or moved on.` : TRC.err || 'Traced: every open task is still open.', results.length ? { action: 'Review', fn: () => openDrawer('trace-all', 'all') } : {});
}
// once a day by itself, when there are emails newer than the last trace
HOOKS.ready.push(() => {
  if (St.mode === 'viewer' || !St.sample || (St.settings.ui || {}).traceAuto === false) return;
  const last = St.settings.traceAt || '';
  if (last && Date.now() - new Date(last) < 20 * 3600e3) return;
  const newer = [...St.emails.values()].some(e => (e.importedAt || '') > last);
  if (newer) setTimeout(() => traceAll(true), 6000);
});
function traceCallout() {
  if (St.mode === 'viewer') return '';
  if (TRC.running) return callout('info', `<div class="row"><span>🔎 Claude is tracing your open tasks through your emails…</span><span class="spacer"></span><div class="progress indet" style="width:90px"><i></i></div></div>`);
  const r = (TRC.results || []).filter(x => St.tasks.has(x.taskId) && St.tasks.get(x.taskId).status !== 'done'); if (!r.length) return '';
  const done = r.filter(x => x.verdict !== 'partial').length;
  return callout('ok', `<div class="row"><span>🔎 Your emails show <b>${done}</b> open task${done === 1 ? ' is' : 's are'} done${r.length > done ? ` and ${r.length - done} partly done` : ''}.</span><span class="spacer"></span><button class="btn sm" data-act="trace-open">Review</button><button class="btn sm primary" data-act="trace-apply-all">Update all</button></div>`);
}
const VERDICT = { done: ['ok', '✓ Done'], partial: ['accent', '◐ Partly done'], superseded: ['wait', '⤳ No longer needed'], open: ['warn', 'Still open'] };
function traceResultHTML(res, i) {
  const t = St.tasks.get(res.taskId), e = res.emailId && St.emails.get(res.emailId); if (!t) return '';
  const [cls, lab] = VERDICT[res.verdict];
  return `<section class="card pad trc-res" style="display:grid;gap:6px">
    <div class="row"><span class="chip ${cls}">${lab}</span><span class="mono muted">${esc(t.ref || '')}</span><b dir="auto">${esc(t.title)}</b></div>
    <div class="small" dir="auto">${esc(res.reason)}</div>
    ${e ? `<div class="small muted trc-mail">✉ ${emailIsMine(e) ? '<span class="chip">You</span> ' : ''}${esc(fmtDate((e.date || '').slice(0, 10)))} · <span dir="auto">${esc(E.clip(e.subject || '', 80))}</span></div>` : ''}
    ${res.quote ? `<blockquote class="small trc-q" dir="auto">“${esc(res.quote)}”</blockquote>` : ''}
    ${res.doneItems.length ? `<div class="small">Items done: ${res.doneItems.map(x => `<span class="chip">${esc(E.clip(x, 48))}</span>`).join(' ')}</div>` : ''}
    ${res.nextStep && res.verdict === 'open' ? `<div class="small"><b>Next step:</b> <span dir="auto">${esc(res.nextStep)}</span></div>` : ''}
    ${res.verdict !== 'open' ? `<div class="row"><button class="btn sm primary" data-act="trace-apply" data-i="${i}">${res.verdict === 'partial' ? 'Tick the items' : 'Mark done'}</button><button class="btn sm ghost" data-act="trace-skip" data-i="${i}">Not yet</button></div>` : ''}
  </section>`;
}
DRAWER_FN['trace-all'] = () => {
  const r = (TRC.results || []).filter(x => St.tasks.has(x.taskId) && St.tasks.get(x.taskId).status !== 'done');
  return `<div class="drawer-h"><b>🔎 Traced through your emails</b><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:12px">
    <p class="small muted" style="margin:0">Claude read your open tasks against the emails that came after them${St.settings.traceAt ? ` (last traced ${esc(fmtDateTime(St.settings.traceAt))})` : ''}. Check each one; updating keeps the email as evidence and Undo works.</p>
    ${TRC.err ? callout('warn', `<p>${esc(TRC.err)}</p>`) : ''}
    ${r.length ? `<div class="row"><span class="spacer"></span><button class="btn sm primary" data-act="trace-apply-all">Update all ${r.length}</button></div>${r.map((x) => traceResultHTML(x, TRC.results.indexOf(x))).join('')}` : '<p class="muted">Nothing new: every open task still looks open.</p>'}
    <div class="row"><button class="btn sm" data-act="trace-all" ${TRC.running ? 'disabled' : ''}>${TRC.running ? 'Tracing…' : '🔎 Trace again'}</button></div>
  </div>`;
};
DRAWER_FN.trace = dr => {
  const t = St.tasks.get(dr.id); if (!t) return null;
  const ems = traceEmails(t), first = createdFrom(t);
  const hist = (t.history || []).map(h => ({ at: h.at, h }));
  const trail = [...ems.map(x => ({ at: x.e.date || x.e.importedAt || '', x })), ...hist].sort((a, b) => (a.at || '').localeCompare(b.at || ''));
  const res = TRC.task && TRC.task.id === t.id ? TRC.task.result : null;
  return `<div class="drawer-h"><button class="icon-btn" data-act="trace-back" data-id="${esc(t.id)}" aria-label="Back to the task">←</button><b>🔎 Trace</b><span class="mono muted">${esc(t.ref || '')}</span><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:12px">
    <div><b dir="auto">${esc(t.title)}</b><div class="small muted">${esc(STATUS[t.status])}${mailDate(t) ? ' · asked ' + esc(fmtDate(mailDate(t))) : ''}${t.deadline ? ' · due ' + esc(fmtDate(t.deadline)) : ''}</div></div>
    ${St.sample ? `<div class="row"><button class="btn primary sm" data-act="trace-task" data-id="${esc(t.id)}" ${TRC.busy ? 'disabled' : ''}>${TRC.busy ? 'Claude is reading the trail…' : '🔎 Is this done? Ask Claude'}</button></div>` : ''}
    ${TRC.err && TRC.task && TRC.task.id === t.id ? callout('warn', `<p>${esc(TRC.err)}</p>`) : ''}
    ${res ? traceResultHTML({ ...res, taskId: t.id }, -1) : ''}
    <div class="label">Trail</div>
    <ol class="trail">${trail.map(it => it.x ? `<li class="tr-mail ${emailIsMine(it.x.e) ? 'me' : ''}"><span class="tr-dot"></span><div><div class="small muted">${esc(fmtDateTime(it.at))} · ${emailIsMine(it.x.e) ? '<span class="chip">You</span>' : esc(E.clip(it.x.e.from || '', 50))}${it.x.e.id === first ? ' · <span class="chip">asked here</span>' : ''}${it.x.linked ? '' : ' · <span class="chip warn">not linked</span>'}</div>
        <button class="dtitle" data-act="open-email" data-id="${esc(it.x.e.id)}" dir="auto" style="text-align:start">${esc(E.clip(it.x.e.subject || '(no subject)', 110))}</button>
        ${it.x.e.analysis && it.x.e.analysis.summary ? `<div class="small" dir="auto">${esc(E.clip(it.x.e.analysis.summary, 220))}</div>` : ''}
        ${it.x.linked ? '' : `<button class="btn sm ghost" data-act="trace-link" data-id="${esc(t.id)}" data-eid="${esc(it.x.e.id)}">Link to this task</button>`}</div></li>`
      : `<li class="tr-hist"><span class="tr-dot"></span><div class="small"><span class="muted">${esc(fmtDateTime(it.at))}</span> · <span dir="auto">${esc(it.h.text || '')}</span></div></li>`).join('') || '<li class="muted">No emails found for this task.</li>'}</ol>
  </div>`;
};
TASK_ACTIONS.push(t => St.mode === 'viewer' ? '' : `<button class="btn sm ghost" data-act="trace-open-task" data-id="${esc(t.id)}" title="Follow this task through its emails">🔎 Trace</button>`);
Object.assign(ACT, {
  'trace-all': () => { UI.menuOpen = null; traceAll(false); },
  'trace-open': () => openDrawer('trace-all', 'all'),
  'trace-open-task': el => { TRC.err = ''; openDrawer('trace', el.dataset.id); },
  'trace-back': el => openDrawer('task', el.dataset.id),
  'trace-task': el => traceTask(el.dataset.id),
  'trace-link': el => { const t = clone(St.tasks.get(el.dataset.id)); if (!t) return; t.emailIds = [...new Set([...(t.emailIds || []), el.dataset.eid])]; (t.history = t.history || []).push({ at: nowISO(), text: 'Email linked from the trace', emailId: el.dataset.eid }); cvApply({ tasks: { [t.id]: t } }); renderDrawer(); },
  'trace-apply': el => {
    const i = +el.dataset.i, res = i < 0 ? (TRC.task && { ...TRC.task.result, taskId: TRC.task.id }) : TRC.results[i]; if (!res) return;
    if (applyTrace(res)) { toast(`${St.tasks.get(res.taskId)?.ref || 'Task'} updated from your emails.`, { action: 'Undo', fn: cvUndo }); if (i < 0) TRC.task = null; }
    render(); renderDrawer();
  },
  'trace-skip': el => {
    const i = +el.dataset.i, res = i < 0 ? (TRC.task && { ...TRC.task.result, taskId: TRC.task.id }) : TRC.results[i]; if (!res) return;
    saveSettings(s => { s.traceSkip = [...new Set([...(s.traceSkip || []), res.taskId + '|' + res.emailId])].slice(-1000); });
    if (i < 0) TRC.task = null; else TRC.results.splice(i, 1);
    render(); renderDrawer();
  },
  'trace-apply-all': () => {
    const r = (TRC.results || []).filter(x => St.tasks.has(x.taskId) && St.tasks.get(x.taskId).status !== 'done');
    let n = 0; for (const x of r) if (applyTrace(x)) n++;
    TRC.results = []; render(); if (UI.drawer && UI.drawer.kind === 'trace-all') renderDrawer();
    toast(`${n} task${n === 1 ? '' : 's'} updated from your emails.`, { action: 'Undo', fn: () => { for (let k = 0; k < n && UI.cvUndo.length; k++) cvUndo(); } });
  },
});
