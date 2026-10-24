/* ---------- time tracking, Daily drag and drop, Insights (charts, waiting on, time, reports), chasers ---------- */
// Time entries live in the 'time' collection: { id, taskId, start, end (null while running), source }.
const hoursOf = ms => Math.round(ms / 360000) / 10;
const fmtDur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`; };
const entryMs = e => Math.max(0, (e.end ? Date.parse(e.end) : Date.now()) - Date.parse(e.start));
const timeEntries = () => colList('time').filter(e => e && e.start);
const runningEntry = taskId => timeEntries().find(e => !e.end && (!taskId || e.taskId === taskId));
const taskMs = id => timeEntries().filter(e => e.taskId === id).reduce((s, e) => s + entryMs(e), 0);
function logTime(taskId, start, end, source) {
  if (!taskId || !start) return null;
  const e = { id: E.uid('tm'), taskId, start, end: end || null, source: source || 'manual', date: dayOf(start) };
  colPut('time', e); return e;
}
function startTimer(taskId) {
  if (runningEntry(taskId)) return;
  for (const e of timeEntries().filter(x => !x.end)) colPut('time', { ...e, end: nowISO() }); // one timer at a time
  logTime(taskId, nowISO(), null, 'timer');
}
function stopTimer(taskId) {
  for (const e of timeEntries().filter(x => !x.end && (!taskId || x.taskId === taskId))) {
    if (entryMs(e) < 60000) colDel('time', e.id); else colPut('time', { ...e, end: nowISO() });
  }
}
// ▶ Start / ⏸ Pause on a task also starts and stops its timer
HOOKS.taskChanged.push((before, t) => {
  if (!t) return;
  const was = before && before.status === 'in_progress', is = t.status === 'in_progress';
  if (!was && is && autoPrefs().timer !== false) startTimer(t.id);
  if (was && !is) stopTimer(t.id);
});
HOOKS.deleted.push((kind, t) => { if (kind === 'task' && t) for (const e of timeEntries().filter(x => x.taskId === t.id)) colDel('time', e.id); });
function openMailto(url) { if (DESKTOP) DK.call('shell:openExternal', url).catch(() => toast('Could not open your email app.')); else location.href = url; }
function timeChipHTML(t) {
  const run = runningEntry(t.id), ms = taskMs(t.id);
  if (!run && !ms) return '';
  return `<span class="chip ${run ? 'accent' : ''}" ${run ? `data-timer="${esc(t.id)}"` : ''} title="Time logged">⏱ ${esc(fmtDur(ms))}${run ? ' ●' : ''}</span>`;
}
setInterval(() => { document.querySelectorAll('[data-timer]').forEach(el => { el.textContent = '⏱ ' + fmtDur(taskMs(el.dataset.timer)) + ' ●'; }); }, 30000);
TASK_ACTIONS.push(t => {
  const run = runningEntry(t.id), ms = taskMs(t.id);
  return `<span class="small muted">⏱ ${ms ? esc(fmtDur(ms)) + ' logged' : 'No time logged'}</span>
    <button class="btn sm ${run ? '' : 'ghost'}" data-act="timer-toggle" data-id="${esc(t.id)}">${run ? '⏸ Stop timer' : '▶ Start timer'}</button>
    <span class="row" style="gap:4px"><input class="input" id="tm-add" type="number" min="5" step="5" placeholder="min" style="width:76px" aria-label="Minutes to add"><button class="btn sm ghost" data-act="timer-add" data-id="${esc(t.id)}">+ Add time</button></span>`;
});
TASK_ACTIONS.push(t => (t.ownership === 'waiting' || t.status === 'waiting') && t.status !== 'done'
  ? `<button class="btn sm" data-act="draft-mail" data-kind="chase" data-id="${esc(t.id)}">✉ Draft a chaser</button>` : '');

/* --- Daily: drag cards between lanes; progress ring --- */
function dayProgressHTML(L) {
  const all = L.todo.length + L.wip.length + L.done.length; if (!all) return '';
  return `<span class="day-ring" title="${L.done.length} of ${all} done">${ring(100 * L.done.length / all, 44)}<span class="small muted">${L.done.length}/${all} done</span></span>`;
}
const LANE_STATUS = { todo: 'todo', wip: 'in_progress', done: 'done' };
HOOKS.afterRender.push(() => {
  const lanes = document.querySelector('.day-lanes'); if (!lanes) return;
  lanes.querySelectorAll('.dcard[data-tid]').forEach(c => { c.draggable = true; });
  lanes.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('.dcard'); if (!c) return; e.dataTransfer.setData('text/plain', c.dataset.tid); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
  lanes.addEventListener('dragend', e => { const c = e.target.closest && e.target.closest('.dcard'); if (c) c.classList.remove('dragging'); lanes.querySelectorAll('.dlane.over').forEach(l => l.classList.remove('over')); });
  lanes.addEventListener('dragover', e => { const l = e.target.closest('.dlane'); if (!l) return; e.preventDefault(); lanes.querySelectorAll('.dlane.over').forEach(x => x !== l && x.classList.remove('over')); l.classList.add('over'); });
  lanes.addEventListener('drop', e => {
    const l = e.target.closest('.dlane'); if (!l) return; e.preventDefault();
    const id = e.dataTransfer.getData('text/plain'), st = LANE_STATUS[l.dataset.lane], t = St.tasks.get(id);
    l.classList.remove('over');
    if (!t || !st || t.status === st) return;
    const prev = setStatus(id, st); render();
    if (st === 'done') toast(`🎉 ${t.ref} done — nice work.`, { action: 'Undo', fn: () => { setStatus(id, prev); render(); } });
  });
});

/* --- periods and weeks --- */
function weekStartDay() { const we = workweek().weekend; for (let d = 0; d < 7; d++) if (!we.includes(d) && we.includes((d + 6) % 7)) return d; return 1; }
function weekStart(iso) { const d = new Date(iso + 'T12:00:00').getDay(); return E.addDays(iso, -((d - weekStartDay() + 7) % 7)); }
const PERIODS = [['week', 'This week'], ['lastweek', 'Last week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['year', 'This year'], ['custom', 'Custom']];
function periodRange(p, from, to) {
  const t = T(), ws = weekStart(t), y = t.slice(0, 4), m = t.slice(0, 7);
  const monthEnd = ym => { const [a, b] = ym.split('-').map(Number); return E.addDays(`${b === 12 ? a + 1 : a}-${String(b === 12 ? 1 : b + 1).padStart(2, '0')}-01`, -1); };
  const lm = (() => { const [a, b] = m.split('-').map(Number); return b === 1 ? `${a - 1}-12` : `${a}-${String(b - 1).padStart(2, '0')}`; })();
  if (p === 'lastweek') return [E.addDays(ws, -7), E.addDays(ws, -1)];
  if (p === 'month') return [m + '-01', monthEnd(m)];
  if (p === 'lastmonth') return [lm + '-01', monthEnd(lm)];
  if (p === 'year') return [y + '-01-01', y + '-12-31'];
  if (p === 'custom' && from && to) return from <= to ? [from, to] : [to, from];
  return [ws, E.addDays(ws, 6)];
}
const inRange = (iso, a, b) => { const d = dayOf(iso); return !!d && d >= a && d <= b; };
const fmtRange = (a, b) => `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;

/* --- Insights view --- */
UI.insTab = UI.insTab || 'overview'; UI.repKind = 'progress'; UI.repPeriod = 'week'; UI.repProject = ''; UI.timePeriod = 'week';
const INS_TABS = [['overview', '📊 Overview'], ['waiting', '⏳ Waiting on others'], ['time', '⏱ Time'], ['reports', '📄 Reports']];
VIEWS.push('insights');
VIEW_FN.insights = () => `<div class="wrap insights">
  <div class="page-head"><div><h1>Insights</h1><div class="sub">How your work is going, who you are waiting on, where your time goes, and reports you can send.</div></div></div>
  <div class="seg tabs" role="tablist">${INS_TABS.map(([k, l]) => `<button role="tab" data-act="ins-tab" data-tab="${k}" aria-pressed="${UI.insTab === k}">${l}</button>`).join('')}</div>
  ${({ overview: insOverview, waiting: insWaiting, time: insTime, reports: insReports }[UI.insTab] || insOverview)()}
</div>`;

// charts: thin single-series bars in the chart blue, hover tooltips, and a table view
function chartTable(head, rows) { return `<details class="viz-table"><summary class="small">Show as table</summary><table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></details>`; }
const barPath = (x, y, w, h, r) => { r = Math.min(r, w / 2, h); return h <= 0 ? '' : `M${x} ${y + h}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h}Z`; };
const barPathH = (x, y, w, h, r) => { r = Math.min(r, h / 2, w); return w <= 0 ? '' : `M${x} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x}Z`; };
function niceMax(v) { if (v <= 4) return 4; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
function columnChart(data, label, unit) {
  const W = 640, H = 220, L = 34, B = 26, Tp = 12, n = data.length, max = niceMax(Math.max(1, ...data.map(d => d.v)));
  const bw = (W - L - 8) / n, gap = Math.max(2, bw * 0.28);
  const ticks = [0, max / 2, max];
  return `<figure class="viz" aria-label="${esc(label)}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${ticks.map(t => { const y = Tp + (H - B - Tp) * (1 - t / max); return `<line class="grid" x1="${L}" x2="${W - 4}" y1="${y}" y2="${y}"/><text class="ax" x="${L - 6}" y="${y + 4}" text-anchor="end">${t}</text>`; }).join('')}
    ${data.map((d, i) => { const h = (H - B - Tp) * d.v / max, x = L + i * bw + gap / 2; return `<g class="mark" data-tip="${esc(d.tip || `${d.label}: ${d.v} ${unit}`)}"><rect class="hit" x="${L + i * bw}" y="${Tp}" width="${bw}" height="${H - B - Tp}"/><path class="bar" d="${barPath(x, H - B - h, bw - gap, h, 4)}"/></g>${i % Math.ceil(n / 8) === 0 || i === n - 1 ? `<text class="ax" x="${x + (bw - gap) / 2}" y="${H - 8}" text-anchor="middle">${esc(d.short || d.label)}</text>` : ''}`; }).join('')}
    <line class="base" x1="${L}" x2="${W - 4}" y1="${H - B}" y2="${H - B}"/>
  </svg>${chartTable([label.split(' per ')[1] || 'Period', unit], data.map(d => [d.label, d.v]))}</figure>`;
}
function barList(data, label, unit) {
  if (!data.length) return '<p class="small muted">Nothing to show yet.</p>';
  const max = Math.max(1, ...data.map(d => d.v)), W = 640, rh = 30, H = data.length * rh + 4, L = 190;
  return `<figure class="viz" aria-label="${esc(label)}"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">
    ${data.map((d, i) => { const w = (W - L - 60) * d.v / max, y = i * rh + 6; return `<g class="mark" data-tip="${esc(`${d.label}: ${d.v} ${unit}`)}"><rect class="hit" x="0" y="${y - 4}" width="${W}" height="${rh}"/><text class="lab" x="${L - 10}" y="${y + 14}" text-anchor="end">${esc(E.clip(d.label, 28))}</text><path class="bar" d="${barPathH(L, y, Math.max(2, w), 18, 4)}"/><text class="val" x="${L + Math.max(2, w) + 8}" y="${y + 14}">${d.v}</text></g>`; }).join('')}
  </svg>${chartTable(['Name', unit], data.map(d => [d.label, d.v]))}</figure>`;
}
// one floating tooltip for every chart mark
document.addEventListener('pointerover', e => {
  const m = e.target.closest && e.target.closest('.viz [data-tip]'); let tip = $('#viz-tip');
  if (!m) { if (tip) tip.hidden = true; return; }
  if (!tip) { tip = document.createElement('div'); tip.id = 'viz-tip'; tip.className = 'viz-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
  tip.textContent = m.dataset.tip; tip.hidden = false;
  const r = m.getBoundingClientRect(); tip.style.left = Math.min(innerWidth - 220, Math.max(8, r.left + r.width / 2 - 80)) + 'px'; tip.style.top = Math.max(8, r.top - 40) + 'px';
});

function insightsModel() {
  const all = [...St.tasks.values()], open = all.filter(t => t.status !== 'done'), done = all.filter(t => t.status === 'done' && t.completedAt);
  const ws = weekStart(T()), weeks = [];
  for (let i = 11; i >= 0; i--) { const a = E.addDays(ws, -7 * i), b = E.addDays(a, 6); weeks.push({ a, b, v: done.filter(t => inRange(t.completedAt, a, b)).length }); }
  const last30 = done.filter(t => inRange(t.completedAt, E.addDays(T(), -29), T()));
  const withDl = done.filter(t => t.deadline), onTime = withDl.filter(t => dayOf(t.completedAt) <= t.deadline).length;
  const days = done.filter(t => t.createdAt).map(t => Math.max(0, E.dayDiff(dayOf(t.createdAt), dayOf(t.completedAt))));
  const byProj = new Map(); for (const t of open) { const p = (t.project || '').trim() || 'No project'; byProj.set(p, (byProj.get(p) || 0) + 1); }
  return { open, done, weeks, last30: last30.length, onTime: withDl.length ? Math.round(100 * onTime / withDl.length) : null, withDl: withDl.length,
    avgDays: days.length ? Math.round(10 * days.reduce((a, b) => a + b, 0) / days.length) / 10 : null,
    overdue: open.filter(t => t.deadline && t.deadline < T()).length, waiting: open.filter(t => t.ownership === 'waiting' || t.status === 'waiting').length,
    byProj: [...byProj.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, v]) => ({ label, v })) };
}
function insOverview() {
  const m = insightsModel();
  const tile = (e, n, l, cls = '') => `<div class="tile ${cls}"><span class="tile-e">${e}</span><span class="tile-n num">${n}</span><span class="tile-l">${l}</span></div>`;
  return `<div class="tiles">
      ${tile('📋', m.open.length, 'Open tasks')}${tile('✅', m.last30, 'Done in the last 30 days')}
      ${tile('🎯', m.onTime === null ? '—' : m.onTime + '%', m.withDl ? `On time (${m.withDl} with a deadline)` : 'On time')}
      ${tile('⏳', m.avgDays === null ? '—' : m.avgDays + ' d', 'Average time to finish')}
      ${tile('⚠️', m.overdue, 'Overdue', m.overdue ? 'crit' : '')}${tile('🤝', m.waiting, 'Waiting on others')}
    </div>
    <div class="ins-grid">
      <section class="card pad"><div class="section-title"><h2>Tasks completed per week</h2><span class="small muted">last 12 weeks</span></div>
        ${columnChart(m.weeks.map(w => ({ label: fmtRange(w.a, w.b), short: fmtDate(w.a, { day: 'numeric', month: 'short' }), v: w.v, tip: `Week of ${fmtDate(w.a, { day: 'numeric', month: 'short' })}: ${w.v} done` })), 'Tasks completed per week', 'tasks')}</section>
      <section class="card pad"><div class="section-title"><h2>Open tasks by project</h2></div>${barList(m.byProj, 'Open tasks by project', 'tasks')}</section>
    </div>`;
}

/* --- waiting on others + chasers --- */
const waitingSince = t => { const h = (t.history || []).filter(x => /Waiting|waiting/.test(x.text)).pop(); return dayOf((h && h.at) || t.sourceDate || t.createdAt) || T(); };
const lastChased = t => { const h = (t.history || []).filter(x => /^Chased/.test(x.text)).pop(); return h ? dayOf(h.at) : ''; };
function insWaiting() {
  const list = [...St.tasks.values()].filter(t => t.status !== 'done' && (t.ownership === 'waiting' || t.status === 'waiting'));
  const by = new Map(); for (const t of list) { const who = (t.owner && !/^me$/i.test(t.owner) ? t.owner : t.requestedBy) || 'Someone'; if (!by.has(who)) by.set(who, []); by.get(who).push(t); }
  const groups = [...by.entries()].map(([who, ts]) => ({ who, ts: ts.sort((a, b) => waitingSince(a).localeCompare(waitingSince(b))) })).sort((a, b) => waitingSince(a.ts[0]).localeCompare(waitingSince(b.ts[0])));
  if (!groups.length) return `<div class="empty"><div class="big-emoji">🤝</div><h3>Nobody owes you anything right now</h3><p>Tasks where someone else must act appear here, with how long you have been waiting and a one-click chaser.</p></div>`;
  return `<div class="wait-grid">${groups.map(g => `<section class="card pad wait-card"><div class="section-title"><h2 dir="auto">${esc(g.who)}</h2><span class="count">${g.ts.length}</span></div>
    ${g.ts.map(t => { const d = E.dayDiff(waitingSince(t), T()), c = lastChased(t); return `<div class="wait-row ${d >= 7 ? 'old' : ''}"><button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto">${esc(t.title)}</button>
      <span class="small muted"><span class="mono">${esc(t.ref)}</span> · waiting ${d} day${d === 1 ? '' : 's'}${c ? ` · chased ${esc(fmtDate(c))}` : ''}${t.project ? ' · ' + esc(t.project) : ''}</span>
      <button class="btn sm" data-act="draft-mail" data-kind="chase" data-id="${esc(t.id)}">✉ Chase</button></div>`; }).join('')}</section>`).join('')}</div>`;
}
function mailContext(t) {
  const em = (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
  const ev = (t.evidence || [])[0];
  return { em, ev, to: em ? (em.fromEmail || '') : '', subject: em ? em.subject : t.title };
}
// the address of a person named on the task, from any email header that names them
function addressOf(name) {
  const n = E.normMatch(name || ''); if (!n || n === 'me') return '';
  for (const e of St.emails.values()) for (const h of [e.from, e.to, e.cc]) for (const part of String(h || '').split(/[,;]/)) {
    const m = /<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?/.exec(part); if (!m) continue;
    const label = E.normMatch(part.replace(m[0], '')), local = E.normMatch(m[1].split('@')[0].replace(/[._-]+/g, ' '));
    if ((label && (label.includes(n) || n.includes(label))) || local === n || (n.split(' ')[0].length > 2 && local.startsWith(n.split(' ')[0]) && local.includes((n.split(' ')[1] || '').slice(0, 3)))) return m[1];
  }
  return '';
}
function localDraft(kind, t) {
  const c = mailContext(t), me = (St.settings.me.name || '').split(' ')[0] || '';
  const who = (t.owner && !/^me$/i.test(t.owner) ? t.owner : t.requestedBy || '').split(' ')[0];
  const items = subsOf(t).filter(x => !x.done).slice(0, 8).map(x => '• ' + x.text).join('\n');
  if (kind === 'chase') {
    const d = E.dayDiff(waitingSince(t), T());
    return { subject: 'Follow-up: ' + (c.subject || t.title).replace(/^(re|fw|fwd):\s*/i, ''), body: `Dear ${who || 'colleague'},\n\nI hope you are well. I am following up on “${t.title}”${t.ref ? ` (our ref ${t.ref})` : ''}, which has been open for ${d} day${d === 1 ? '' : 's'}.${items ? `\n\nStill outstanding:\n${items}` : ''}\n\nCould you please let me know when we can expect it${t.deadline ? `, ideally by ${fmtDate(t.deadline, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}?\n\nBest regards,\n${me}` };
  }
  return { subject: 'RE: ' + (c.subject || t.title).replace(/^(re):\s*/i, ''), body: `Dear ${(t.requestedBy || '').split(' ')[0] || 'colleague'},\n\nThank you for your email. Regarding ${t.title}:${items ? `\n\n${items}` : ''}\n\n${t.nextStep ? t.nextStep + '\n\n' : ''}Best regards,\n${me}` };
}
async function draftMail(kind, id) {
  const t = St.tasks.get(id); if (!t) return;
  const who = t.owner && !/^me$/i.test(t.owner) ? t.owner : '';
  UI.mail = { kind, id, ...localDraft(kind, t), to: kind === 'chase' ? addressOf(who) : mailContext(t).to || addressOf(t.requestedBy), busy: !!St.sample }; openMailModal();
  if (!St.sample) return;
  const c = mailContext(t);
  const prompt = `You draft short, polite, professional engineering emails. Write a ${kind === 'chase' ? 'follow-up chaser asking for an overdue item' : 'reply that answers the request'} from ${St.settings.me.name || 'me'}${St.settings.me.role ? ' (' + St.settings.me.role + ')' : ''}.
TASK: ${t.title}\nACTION: ${t.action || ''}\nWAITING ON / REQUESTED BY: ${t.owner || ''} / ${t.requestedBy || ''}\nPROJECT: ${t.project || ''}\nDEADLINE: ${t.deadline || 'none'}\nOPEN ITEMS:\n${subsOf(t).filter(x => !x.done).map(x => '- ' + x.text).join('\n') || '-'}
NOTES: ${t.notes || ''}\nSOURCE EMAIL SUBJECT: ${c.subject || ''}\nQUOTE FROM SOURCE: ${c.ev ? c.ev.quote : ''}
Write in the same language as the source quote. Never invent facts, numbers or dates. Keep it under 150 words.
Reply with JSON only: {"subject": "...", "body": "..."}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    if (UI.mail && UI.mail.id === id && r && typeof r.subject === 'string' && typeof r.body === 'string' && r.body.trim()) Object.assign(UI.mail, { subject: r.subject, body: r.body });
  } catch {}
  if (UI.mail && UI.mail.id === id) { UI.mail.busy = false; openMailModal(); }
}
function openMailModal() {
  const d = UI.mail, m = $('#modal'); if (!d) return;
  m.innerHTML = deco(`<div class="card pad mail-draft" role="dialog" aria-label="Email draft"><div class="row"><b>${d.kind === 'chase' ? '✉ Chaser' : '✉ Reply'} draft</b>${d.busy ? '<span class="small muted">✨ Claude is improving it…</span>' : ''}<span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <label class="field"><span>To</span><input class="input" id="ml-to" value="${esc(d.to || '')}" placeholder="name@company.com"></label>
    <label class="field"><span>Subject</span><input class="input" id="ml-sub" dir="auto" value="${esc(d.subject)}"></label>
    <label class="field"><span>Message</span><textarea class="input" id="ml-body" dir="auto" rows="11">${esc(d.body)}</textarea></label>
    <div class="row end"><span class="small muted mail-note">Nothing is sent from here — copy it, or open it in your email app.</span><button class="btn" data-act="mail-copy">Copy</button><button class="btn primary" data-act="mail-open">Open in email</button></div></div>`);
  m.hidden = false;
}
function mailFields() { const v = id => ($('#' + id) || {}).value || ''; return { to: v('ml-to'), subject: v('ml-sub'), body: v('ml-body') }; }
function markChased() {
  const d = UI.mail; if (!d || d.kind !== 'chase') return;
  const t = clone(St.tasks.get(d.id)); if (!t) return;
  (t.history = t.history || []).push({ at: nowISO(), text: `Chased ${t.owner && !/^me$/i.test(t.owner) ? t.owner : 'them'} by email` }); putTask(t);
}

/* --- time --- */
function insTime() {
  const [a, b] = periodRange(UI.timePeriod), es = timeEntries().filter(e => inRange(e.start, a, b));
  const byProj = new Map(), byTask = new Map();
  for (const e of es) { const t = St.tasks.get(e.taskId); const p = (t && t.project || '').trim() || 'No project'; byProj.set(p, (byProj.get(p) || 0) + entryMs(e)); byTask.set(e.taskId, (byTask.get(e.taskId) || 0) + entryMs(e)); }
  const total = es.reduce((s, e) => s + entryMs(e), 0), run = runningEntry(), rt = run && St.tasks.get(run.taskId);
  return `<div class="row" style="margin-bottom:12px"><div class="seg" role="group">${PERIODS.filter(p => p[0] !== 'custom').map(([k, l]) => `<button data-act="time-period" data-p="${k}" aria-pressed="${UI.timePeriod === k}">${l}</button>`).join('')}</div>
      <span class="small muted">${esc(fmtRange(a, b))}</span><span class="spacer"></span><button class="btn sm" data-act="time-csv" ${es.length ? '' : 'disabled'}>⬇ Timesheet (CSV)</button></div>
    ${run && rt ? callout('info', `<div class="row"><span>⏱ Timer running on <b dir="auto">${esc(rt.title)}</b> — ${esc(fmtDur(entryMs(run)))}</span><span class="spacer"></span><button class="btn sm" data-act="timer-toggle" data-id="${esc(rt.id)}">⏸ Stop</button></div>`) : ''}
    <div class="tiles"><div class="tile"><span class="tile-e">⏱</span><span class="tile-n num">${hoursOf(total)}</span><span class="tile-l">Hours logged</span></div><div class="tile"><span class="tile-e">📋</span><span class="tile-n num">${byTask.size}</span><span class="tile-l">Tasks worked on</span></div></div>
    ${es.length ? `<div class="ins-grid"><section class="card pad"><div class="section-title"><h2>Hours by project</h2></div>${barList([...byProj.entries()].sort((x, y) => y[1] - x[1]).map(([label, ms]) => ({ label, v: hoursOf(ms) })), 'Hours by project', 'hours')}</section>
      <section class="card pad"><div class="section-title"><h2>Tasks</h2></div><table class="tbl"><thead><tr><th>Task</th><th>Project</th><th class="num">Hours</th></tr></thead><tbody>${[...byTask.entries()].sort((x, y) => y[1] - x[1]).map(([id, ms]) => { const t = St.tasks.get(id); return `<tr><td><button class="dtitle" data-act="open-task" data-id="${esc(id)}" dir="auto">${esc(t ? t.title : 'Deleted task')}</button></td><td dir="auto">${esc(t && t.project || '')}</td><td class="num">${hoursOf(ms)}</td></tr>`; }).join('')}</tbody></table></section></div>`
      : `<div class="empty"><div class="big-emoji">⏱</div><h3>No time logged in this period</h3><p>Press ▶ Start on a task (in Daily or the task panel) and its timer runs until you pause or finish it. Focus sessions are logged too.</p></div>`}`;
}
function timesheetCSV() {
  const [a, b] = periodRange(UI.timePeriod);
  const rows = timeEntries().filter(e => inRange(e.start, a, b)).sort((x, y) => x.start.localeCompare(y.start)).map(e => { const t = St.tasks.get(e.taskId) || {}; return [dayOf(e.start), (e.start || '').slice(11, 16), (e.end || '').slice(11, 16), hoursOf(entryMs(e)), t.ref || '', t.title || '', t.project || '', topicOf(t) || '', e.source]; });
  offerFile(`timesheet-${a}-to-${b}.csv`, '﻿' + [['Date', 'Start (UTC)', 'End (UTC)', 'Hours', 'Ref', 'Task', 'Project', 'Topic', 'Source'], ...rows].map(r => r.map(csvCell).join(',')).join('\r\n'));
}

/* --- reports: progress (week / month / year, optionally one project) and hand-over pack --- */
function reportModel(kind, a, b, project) {
  const inP = t => !project || (t.project || '').trim() === project;
  const all = [...St.tasks.values()].filter(inP), open = all.filter(t => t.status !== 'done');
  const completed = all.filter(t => t.status === 'done' && t.completedAt && inRange(t.completedAt, a, b)).sort((x, y) => x.completedAt.localeCompare(y.completedAt));
  const ach = [...St.daily.values()].filter(x => x.kind === 'achievement' && x.date >= a && x.date <= b && (!project || !x.taskId || inP(St.tasks.get(x.taskId) || {})));
  const progressed = open.filter(t => (t.history || []).some(h => inRange(h.at, a, b)) || subsOf(t).some(s => s.doneAt && inRange(s.doneAt, a, b)));
  const upcoming = open.filter(t => t.deadline && t.deadline > b && t.deadline <= E.addDays(b, 14)).sort((x, y) => x.deadline.localeCompare(y.deadline));
  const overdue = open.filter(t => t.deadline && t.deadline <= (b < T() ? b : T())).sort((x, y) => x.deadline.localeCompare(y.deadline));
  const waiting = open.filter(t => t.ownership === 'waiting' || t.status === 'waiting');
  const hours = new Map(); for (const e of timeEntries().filter(e => inRange(e.start, a, b))) { const t = St.tasks.get(e.taskId); if (!t || !inP(t)) continue; const p = (t.project || '').trim() || 'No project'; hours.set(p, (hours.get(p) || 0) + entryMs(e)); }
  const docs = typeof colList === 'function' ? colList('docreg').filter(d => (!project || d.project === project) && d.date && d.date >= a && d.date <= b) : [];
  return { kind, a, b, project, all, open, completed, ach, progressed, upcoming, overdue, waiting, hours: [...hours.entries()].sort((x, y) => y[1] - x[1]), docs };
}
const taskLine = t => `${t.ref ? t.ref + ' — ' : ''}${t.title}${t.project ? ' (' + t.project + ')' : ''}`;
function reportSections(R) {
  const S = [], open = R.open.slice().sort((x, y) => (x.project || '~').localeCompare(y.project || '~') || (x.deadline || '9').localeCompare(y.deadline || '9'));
  const row = t => [t.ref || '', t.title, STATUS[t.status] || '', t.deadline ? fmtDate(t.deadline, { day: 'numeric', month: 'short', year: 'numeric' }) : '', t.nextStep || (subsOf(t).length ? `${subsDone(t)}/${subsOf(t).length} items done` : '')];
  if (R.kind === 'handover') {
    S.push({ h: 'Summary', p: [`${R.open.length} open task${R.open.length === 1 ? '' : 's'}${R.project ? ' on ' + R.project : ''}: ${R.overdue.length} overdue, ${R.waiting.length} waiting on others, ${R.open.filter(t => t.status === 'in_progress').length} in progress.`] });
    const byP = new Map(); for (const t of open) { const p = (t.project || '').trim() || 'No project'; if (!byP.has(p)) byP.set(p, []); byP.get(p).push(t); }
    for (const [p, ts] of byP) S.push({ h: p, table: { head: ['Ref', 'Task', 'Status', 'Due', 'Next step / items'], rows: ts.map(row) }, notes: ts.filter(t => (t.evidence || [])[0] || t.requestedBy).map(t => { const e = (t.evidence || [])[0]; return `${t.ref}: ${t.requestedBy ? 'requested by ' + t.requestedBy + '. ' : ''}${e ? '“' + E.clip(e.quote, 160) + '”' + (t.sourceSubject ? ' — ' + t.sourceSubject : '') : ''}`; }) });
    if (R.waiting.length) S.push({ h: 'Waiting on others', list: R.waiting.map(t => `${taskLine(t)} — ${t.owner && !/^me$/i.test(t.owner) ? t.owner : 'someone'}, since ${fmtDate(waitingSince(t))}`) });
    const people = new Map(); for (const t of R.all) for (const n of [t.requestedBy, t.owner]) if (n && !/^me$/i.test(n)) people.set(n, (people.get(n) || 0) + 1);
    if (people.size) S.push({ h: 'Key contacts', list: [...people.entries()].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([n, c]) => `${n} — ${c} task${c === 1 ? '' : 's'}`) });
    return S;
  }
  const hrs = R.hours.reduce((s, x) => s + x[1], 0);
  S.push({ h: 'Summary', p: [`${R.completed.length} task${R.completed.length === 1 ? '' : 's'} completed, ${R.progressed.length} progressed, ${R.ach.length} achievement${R.ach.length === 1 ? '' : 's'} recorded${hrs ? `, ${hoursOf(hrs)} hours logged` : ''}. ${R.open.length} open now (${R.overdue.length} overdue).`] });
  if (R.completed.length) S.push({ h: 'Completed', list: R.completed.map(t => `${taskLine(t)} — ${fmtDate(dayOf(t.completedAt))}`) });
  if (R.ach.length) S.push({ h: 'Achievements', list: R.ach.map(x => `${x.text} (${fmtDate(x.date)})`) });
  if (R.progressed.length) S.push({ h: 'In progress', list: R.progressed.map(t => `${taskLine(t)}${subsOf(t).length ? ` — ${subsDone(t)}/${subsOf(t).length} items done` : ''}${t.nextStep ? ' — next: ' + t.nextStep : ''}`) });
  if (R.docs.length) S.push({ h: 'Documents', table: { head: ['Document', 'Title', 'Rev', 'Status', 'Date'], rows: R.docs.map(d => [d.number || '', d.title || '', d.revision || '', d.code ? 'Code ' + d.code : d.status || '', d.date ? fmtDate(d.date) : '']) } });
  if (R.overdue.length) S.push({ h: 'Overdue', list: R.overdue.map(t => `${taskLine(t)} — due ${fmtDate(t.deadline)}`) });
  if (R.upcoming.length) S.push({ h: 'Coming up (next 2 weeks)', list: R.upcoming.map(t => `${taskLine(t)} — ${fmtDate(t.deadline, { weekday: 'short', day: 'numeric', month: 'short' })}`) });
  if (R.waiting.length) S.push({ h: 'Waiting on others', list: R.waiting.map(t => `${taskLine(t)} — ${t.owner && !/^me$/i.test(t.owner) ? t.owner : 'someone'}`) });
  if (R.hours.length) S.push({ h: 'Time', table: { head: ['Project', 'Hours'], rows: R.hours.map(([p, ms]) => [p, String(hoursOf(ms))]) } });
  if (R.project) S.push({ h: 'All open tasks', table: { head: ['Ref', 'Task', 'Status', 'Due', 'Next step / items'], rows: open.map(row) } });
  return S;
}
function reportTitle(R) {
  const who = St.settings.me.name || '';
  return { title: R.kind === 'handover' ? `Hand-over pack${R.project ? ' — ' + R.project : ''}` : `${R.project ? R.project + ' — p' : 'P'}rogress report`, sub: `${R.kind === 'handover' ? 'As of ' + fmtDate(T(), { day: 'numeric', month: 'long', year: 'numeric' }) : fmtRange(R.a, R.b)}${who ? ' · ' + who : ''}` };
}
function reportHTML(R) {
  const { title, sub } = reportTitle(R);
  return `<h1 dir="auto">${esc(title)}</h1><p class="muted">${esc(sub)}</p>${reportSections(R).map(s => `<h2 dir="auto">${esc(s.h)}</h2>${(s.p || []).map(p => `<p dir="auto">${esc(p)}</p>`).join('')}${s.list ? `<ul>${s.list.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}${s.table ? `<table><thead><tr>${s.table.head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td dir="auto">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : ''}${(s.notes || []).length ? `<ul class="muted">${s.notes.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : ''}`).join('')}`;
}
function reportText(R) {
  const { title, sub } = reportTitle(R);
  return [title, sub, '', ...reportSections(R).flatMap(s => [s.h.toUpperCase(), ...(s.p || []), ...(s.list || []).map(x => '• ' + x), ...(s.table ? s.table.rows.map(r => '• ' + r.filter(Boolean).join(' — ')) : []), ''])].join('\n');
}
async function reportDocx(R) {
  const d = await E.need('docx'); const { title, sub } = reportTitle(R);
  const P = (text, o = {}) => new d.Paragraph({ children: [new d.TextRun({ text: String(text), ...o })], spacing: { after: 80 } });
  const kids = [new d.Paragraph({ text: title, heading: d.HeadingLevel.TITLE }), P(sub, { color: '5B6B68' })];
  for (const s of reportSections(R)) {
    kids.push(new d.Paragraph({ text: s.h, heading: d.HeadingLevel.HEADING_1, spacing: { before: 240, after: 100 } }));
    (s.p || []).forEach(p => kids.push(P(p)));
    (s.list || []).forEach(x => kids.push(new d.Paragraph({ text: x, bullet: { level: 0 } })));
    if (s.table) kids.push(new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [s.table.head, ...s.table.rows].map((r, i) => new d.TableRow({ tableHeader: i === 0, children: r.map(c => new d.TableCell({ shading: i === 0 ? { fill: 'EEF3F2' } : undefined, children: [P(c, { bold: i === 0, size: 18 })] })) })) }));
    (s.notes || []).forEach(x => kids.push(P(x, { color: '5B6B68', size: 18 })));
  }
  const doc = new d.Document({ creator: St.settings.me.name || 'Action Register', title, styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } }, sections: [{ children: kids }] });
  return d.Packer.toBlob(doc);
}
function currentReport() { const [a, b] = periodRange(UI.repPeriod, UI.repFrom, UI.repTo); return reportModel(UI.repKind, a, b, UI.repProject); }
function insReports() {
  const R = currentReport(), projects = [...new Set([...St.tasks.values()].map(t => (t.project || '').trim()).filter(Boolean))].sort();
  return `<section class="card pad rep-controls">
      <div class="seg" role="group">${[['progress', '📈 Progress report'], ['handover', '🤝 Hand-over pack']].map(([k, l]) => `<button data-act="rep-kind" data-k="${k}" aria-pressed="${UI.repKind === k}">${l}</button>`).join('')}</div>
      ${UI.repKind === 'progress' ? `<div class="seg" role="group">${PERIODS.map(([k, l]) => `<button data-act="rep-period" data-p="${k}" aria-pressed="${UI.repPeriod === k}">${l}</button>`).join('')}</div>
        ${UI.repPeriod === 'custom' ? `<div class="row"><input class="input" type="date" id="rep-from" data-chg="rep-date" data-k="repFrom" value="${esc(UI.repFrom || '')}"><span>to</span><input class="input" type="date" id="rep-to" data-chg="rep-date" data-k="repTo" value="${esc(UI.repTo || '')}"></div>` : ''}` : '<p class="small muted" style="margin:0">Everything someone needs to take over your work: open tasks with next steps and evidence, who you are waiting on, and key contacts.</p>'}
      <label class="field" style="max-width:320px"><span>Project</span><select class="input" id="rep-proj" data-chg="rep-proj"><option value="">All projects</option>${projects.map(p => `<option ${UI.repProject === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></label>
      <div class="row"><button class="btn primary" data-act="rep-out" data-f="docx">⬇ Word</button><button class="btn" data-act="rep-out" data-f="pdf">⬇ PDF</button><button class="btn" data-act="rep-out" data-f="copy">Copy as email text</button><button class="btn ghost" data-act="rep-out" data-f="mail">✉ Open in email</button></div>
    </section>
    <article class="card pad report-preview" id="report-preview">${reportHTML(R)}</article>`;
}
async function reportOut(f) {
  const R = currentReport(), { title } = reportTitle(R), base = title.replace(/[^\w؀-ۿ -]+/g, '').replace(/\s+/g, '-').toLowerCase() + '-' + T();
  if (f === 'pdf') return printDoc(reportHTML(R), base + '.pdf', false, title);
  if (f === 'copy') { try { await navigator.clipboard.writeText(reportText(R)); toast('Report copied — paste it into an email.'); } catch { offerFile(base + '.txt', reportText(R)); } return; }
  if (f === 'mail') { const body = reportText(R); openMailto('mailto:?subject=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body.length > 1800 ? body.slice(0, 1800) + '\n…' : body)); return; }
  try { toast('Preparing the Word document…'); await offerFile(base + '.docx', await reportDocx(R), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); }
  catch (e) { toast('Could not create the Word file: ' + (e && e.message || e), { err: true }); }
}

Object.assign(ACT, {
  'ins-tab': el => { UI.insTab = el.dataset.tab; render(); },
  'timer-toggle': el => { const id = el.dataset.id; if (runningEntry(id)) { stopTimer(id); toast('Timer stopped.'); } else { startTimer(id); toast('Timer started.'); } render(); if (UI.drawer) renderDrawer(); },
  'timer-add': el => { const v = +(($('#tm-add') || {}).value || 0); if (!(v > 0)) { toast('Enter the minutes to add.'); return; } const end = new Date(), start = new Date(end - v * 60000); logTime(el.dataset.id, start.toISOString(), end.toISOString(), 'manual'); toast(`Added ${fmtDur(v * 60000)}.`); render(); if (UI.drawer) renderDrawer(); },
  'time-period': el => { UI.timePeriod = el.dataset.p; render(); },
  'time-csv': () => timesheetCSV(),
  'rep-kind': el => { UI.repKind = el.dataset.k; render(); },
  'rep-period': el => { UI.repPeriod = el.dataset.p; if (el.dataset.p === 'custom' && !UI.repFrom) { UI.repFrom = E.addDays(T(), -13); UI.repTo = T(); } render(); },
  'rep-out': el => reportOut(el.dataset.f),
  'draft-mail': el => draftMail(el.dataset.kind, el.dataset.id),
  'mail-copy': async () => { const f = mailFields(); try { await navigator.clipboard.writeText(`Subject: ${f.subject}\n\n${f.body}`); toast('Copied.'); } catch { toast('Copy is blocked here — select the text and copy it.'); } markChased(); },
  'mail-open': () => { const f = mailFields(); markChased(); openMailto(`mailto:${encodeURIComponent(f.to)}?subject=${encodeURIComponent(f.subject)}&body=${encodeURIComponent(f.body)}`); },
});
Object.assign(CHG, {
  'rep-proj': el => { UI.repProject = el.value; render(); },
  'rep-date': el => { UI[el.dataset.k] = el.value; render(); },
});
