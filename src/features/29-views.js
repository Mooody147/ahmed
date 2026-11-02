/* ---------- two more ways to see the work: Timeline and Priority matrix ---------- */
// Timeline: one row per task, grouped by project; each bar runs from the day the task was asked (its email date, else
// when it was added) to its deadline, with today marked. Overdue bars end in red, tasks without a date show as a dot.
// Priority matrix: my open tasks in four boxes — urgent (overdue or due within 3 days) × important (critical/high
// priority or from my manager) — so the order of work is obvious. Tasks I'm waiting on sit in a strip below.
// Both open a task's panel on click and follow My actions (others fade) and the project filter.
const DAYW = 34; // px per day on the timeline
const viewTasks = () => [...St.tasks.values()].filter(t => t.status !== 'done' && t.ownership !== 'fyi' && (UI.mapFocus === 'all' || projKeyLabel(t)[0] === UI.mapFocus));
const cardCls = t => ['vcard', 'p-' + (t.priority || 'medium'), needsMe(t) ? 'me' : '', isNewTask(t) ? 'is-new' : '', myFocus() && !needsMe(t) ? 'dim' : ''].join(' ');
const cardTags = t => `${isNewTask(t) ? '<span class="mnew">NEW</span>' : ''}${needsMe(t) ? '<span class="mme">🙋 Your action</span>' : ''}`;
function vHeader(title, sub) {
  const projs = [...new Map([...St.tasks.values()].map(t => projKeyLabel(t))).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const n = [...St.tasks.values()].filter(needsMe).length;
  return `<div class="map-toolbar"><div class="map-tools" role="toolbar" aria-label="${esc(title)}">${modeSegHTML()}<span class="small muted">${esc(sub)}</span><span class="mt-spacer"></span>
    <button class="btn sm mt-mine ${myFocus() ? 'on' : ''}" data-act="map-mine" aria-pressed="${myFocus()}" title="Highlight the tasks that need action by you (Shift+M)">🙋<span class="lbl">My actions</span> <b class="mt-count">${n}</b></button></div>
    <div class="map-projects"><button class="mp-chip ${UI.mapFocus === 'all' ? 'on' : ''}" data-act="map-focus" data-pk="all">🌐 All projects</button>${projs.map(([k, l]) => `<button class="mp-chip ${UI.mapFocus === k ? 'on' : ''}" data-act="map-focus" data-pk="${esc(k)}">${k === 'p:~' ? '🗂️' : projBadge(l, 'xs')}<span dir="auto">${esc(l)}</span></button>`).join('')}</div></div>`;
}
function viewTimeline() {
  const ts = viewTasks(), today = T();
  const start = t => (mailDate(t) || (t.createdAt || '').slice(0, 10) || today);
  let d0 = E.addDays(today, -14), d1 = E.addDays(today, 28);
  for (const t of ts) { const s = start(t); if (s < d0) d0 = s; if (t.deadline && t.deadline > d1) d1 = t.deadline; }
  if (E.dayDiff(d0, today) > 60) d0 = E.addDays(today, -60); if (E.dayDiff(today, d1) > 120) d1 = E.addDays(today, 120);
  d0 = E.addDays(d0, -2); d1 = E.addDays(d1, 3);
  const days = E.dayDiff(d0, d1) + 1, W = days * DAYW, X = d => Math.max(0, Math.min(days, E.dayDiff(d0, d))) * DAYW;
  const groups = new Map(); for (const t of ts) { const [k, l] = projKeyLabel(t); if (!groups.has(k)) groups.set(k, { l, ts: [] }); groups.get(k).ts.push(t); }
  const rows = [...groups.values()].sort((a, b) => a.l.localeCompare(b.l)).map(g => ({ ...g, ts: g.ts.sort((a, b) => (a.deadline || '9') .localeCompare(b.deadline || '9') || start(a).localeCompare(start(b))) }));
  const ticks = []; for (let i = 0; i < days; i++) { const d = E.addDays(d0, i), dt = new Date(d + 'T00:00:00'); ticks.push({ d, x: i * DAYW, wd: dt.getDay(), dom: dt.getDate(), mon: dt.getDate() === 1 || i === 0 }); }
  const bar = t => {
    const s = start(t), e = t.deadline, over = e && e < today, x = X(s);
    if (!e) return `<div class="tl-bar nodate" style="left:${x}px" title="No deadline"></div>`;
    const x2 = X(e) + DAYW, w = Math.max(DAYW * 0.6, x2 - x);
    return `<div class="tl-bar ${over ? 'over' : ''} p-${t.priority || 'medium'}" style="left:${Math.min(x, x2 - DAYW * .6)}px;width:${w}px" title="${esc(fmtDate(s))} → ${esc(fmtDate(e))}"></div>`;
  };
  return `${vHeader('Timeline', 'From the day each task was asked to its deadline')}
  <div class="tl card" style="--dw:${DAYW}px">
    <div class="tl-scroll" id="tl-scroll"><div class="tl-grid" style="width:calc(var(--nw) + ${W}px)">
      <div class="tl-head"><div class="tl-name-h">Task</div><div class="tl-axis" style="width:${W}px">${ticks.map(k => `<div class="tl-tick ${k.wd === 5 || k.wd === 6 ? 'we' : ''} ${k.d === today ? 'now' : ''}" style="left:${k.x}px">${k.mon ? `<span class="tl-mon">${esc(fmtDate(k.d, { month: 'short' }))}</span>` : ''}<span>${k.dom}</span></div>`).join('')}</div></div>
      <div class="tl-body"><div class="tl-today" style="left:calc(var(--nw) + ${X(today) + DAYW / 2}px)"><span>Today</span></div>
        ${rows.map(g => `<div class="tl-proj"><span dir="auto">${esc(g.l)}</span><small>${g.ts.length}</small></div>
          ${g.ts.map(t => `<div class="tl-row ${cardCls(t)}" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0">
            <div class="tl-name"><span class="tl-tags">${cardTags(t)}</span><b dir="auto">${esc(t.title)}</b><small class="muted"><span class="mono">${esc(t.ref || '')}</span> ${t.deadline ? '· due ' + esc(fmtDate(t.deadline)) : '· no date'}${mailDate(t) ? ' · ✉ ' + esc(fmtDate(mailDate(t))) : ''}</small></div>
            <div class="tl-lane" style="width:${W}px">${bar(t)}</div></div>`).join('')}`).join('') || '<p class="muted pad">No open tasks.</p>'}
      </div></div></div>
  </div>`;
}
function viewMatrix() {
  const ts = viewTasks(), today = T();
  const mine = ts.filter(t => isMine(t) && t.status !== 'waiting'), wait = ts.filter(t => !(isMine(t) && t.status !== 'waiting'));
  const urgent = t => !!t.deadline && E.dayDiff(today, t.deadline) <= 3;
  const important = t => t.priority === 'critical' || t.priority === 'high' || (typeof isFromManager === 'function' && isFromManager(t));
  const Q = [['do', 'Do first', 'Urgent and important', t => urgent(t) && important(t)], ['plan', 'Schedule', 'Important, not urgent', t => !urgent(t) && important(t)], ['quick', 'Fit in soon', 'Urgent, less important', t => urgent(t) && !important(t)], ['later', 'Later', 'Neither urgent nor important', t => !urgent(t) && !important(t)]];
  const order = (a, b) => (a.deadline || '9').localeCompare(b.deadline || '9') || PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  const card = t => { const d = dueInfo(t); return `<button class="${cardCls(t)}" data-act="open-task" data-id="${esc(t.id)}"><span class="tl-tags">${cardTags(t)}</span><b dir="auto">${esc(t.title)}</b><small><span class="mono">${esc(t.ref || '')}</span><span class="duepill ${d.cls}">${esc(d.txt)}</span>${subsOf(t).length ? `<span>🗂️ ${subsDone(t)}/${subsOf(t).length}</span>` : ''}</small></button>`; };
  return `${vHeader('Priority matrix', 'Urgent = overdue or due within 3 days · Important = critical/high priority or from your manager')}
  <div class="mx">${Q.map(([k, l, sub, f]) => { const list = mine.filter(f).sort(order); return `<section class="mx-q mx-${k} card"><header><b>${l}</b><small>${sub}</small><span class="mx-n">${list.length}</span></header><div class="mx-list">${list.map(card).join('') || '<p class="small muted">Nothing here.</p>'}</div></section>`; }).join('')}</div>
  ${wait.length ? `<section class="mx-wait card"><header><b>⏳ Waiting on others</b><span class="mx-n">${wait.length}</span></header><div class="mx-list row-list">${wait.sort(order).map(card).join('')}</div></section>` : ''}`;
}
Object.assign(TODO_VIEWS, { timeline: viewTimeline, matrix: viewMatrix });
ACT['open-task'] = el => { if (St.tasks.has(el.dataset.id)) openDrawer('task', el.dataset.id); };
HOOKS.afterRender.push(() => {
  // the timeline opens scrolled to show a week before today
  const sc = document.getElementById('tl-scroll'); if (!sc || sc.dataset.placed) return;
  const now = sc.querySelector('.tl-tick.now'); if (now) sc.scrollLeft = Math.max(0, now.offsetLeft - 7 * DAYW);
  sc.dataset.placed = '1';
});
