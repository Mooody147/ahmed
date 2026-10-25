/* ---------- Plan: calendar, Gantt, workload (and extension requests), contacts, vendor scorecard, meeting prep, the other side's contract deadlines; Daily wrap-up and printable sheet ---------- */
addCols('contacts', 'vendors', 'deadlines');
VIEWS.push('plan');
UI.plan = UI.plan || { tab: 'calendar', month: T().slice(0, 7), day: null, who: '', q: '' };
const PLAN_TABS = [['calendar', '📅 Calendar'], ['gantt', '📊 Gantt'], ['workload', '⚖️ Workload'], ['contacts', '👥 Contacts'], ['vendors', '🏭 Vendors'], ['meeting', '🗓️ Meeting prep'], ['deadlines', '⏳ Their deadlines']];
VIEW_FN.plan = () => `<div class="wrap plan">
  <div class="page-head"><div><h1>Plan</h1><div class="sub">Your deadlines on a calendar and a timeline, how loaded each week is, the people and suppliers you work with, and the time limits the other side must keep.</div></div></div>
  <div class="seg tabs" role="tablist">${PLAN_TABS.map(([k, l]) => `<button role="tab" data-act="plan-tab" data-tab="${k}" aria-pressed="${UI.plan.tab === k}">${l}</button>`).join('')}</div>
  ${({ calendar: calHTML, gantt: ganttHTML, workload: loadHTML, contacts: contactsHTML, vendors: vendorsHTML, meeting: meetHTML, deadlines: dlHTML }[UI.plan.tab] || calHTML)()}
</div>`;
Object.assign(ACT, { 'plan-tab': el => { UI.plan.tab = el.dataset.tab; render(); } });
const openTasks = () => [...St.tasks.values()].filter(t => t.status !== 'done');

/* --- calendar: task deadlines, RFI answers due, deliveries, the other side's deadlines --- */
function calEvents() {
  const ev = [];
  for (const t of St.tasks.values()) if (t.deadline) ev.push({ date: t.deadline, kind: t.status === 'done' ? 'done' : t.ownership === 'waiting' ? 'wait' : 'task', label: t.title, ref: t.ref, prio: t.priority, open: ['open-task', t.id] });
  for (const x of colList('eng')) if (x.kind === 'rfi' && x.due && !x.answered) ev.push({ date: x.due, kind: 'rfi', label: `${x.no} answer due`, open: null });
  for (const x of colList('procure')) { const s = prState(x); if (s.exp && !s.done) ev.push({ date: s.exp, kind: 'delivery', label: `Delivery: ${x.item || x.tag}`, open: null }); }
  for (const d of theirDeadlines()) if (!d.done) ev.push({ date: d.due, kind: 'theirs', label: `${d.party}: ${d.what}`, open: null });
  return ev;
}
function calHTML() {
  const m = UI.plan.month, first = new Date(m + '-01T12:00:00'), start = weekStart(m + '-01'), ev = calEvents(), by = new Map();
  for (const e of ev) { if (!by.has(e.date)) by.set(e.date, []); by.get(e.date).push(e); }
  const days = Array.from({ length: 42 }, (_, i) => E.addDays(start, i));
  const wd = Array.from({ length: 7 }, (_, i) => fmtDate(days[i], { weekday: 'short' }));
  const sel = UI.plan.day && by.get(UI.plan.day);
  return `<section class="card pad"><div class="row mon-month"><button class="icon-btn" data-act="cal-m" data-d="-1" aria-label="Previous month">‹</button><b>${esc(fmtDate(m + '-15', { month: 'long', year: 'numeric' }))}</b><button class="icon-btn" data-act="cal-m" data-d="1" aria-label="Next month">›</button><button class="btn sm ghost" data-act="cal-today">Today</button><span class="spacer"></span><span class="small muted cal-legend"><i class="k task"></i>mine <i class="k wait"></i>waiting <i class="k rfi"></i>RFI <i class="k delivery"></i>delivery <i class="k theirs"></i>their deadline</span></div>
    <div class="cal-grid">${wd.map(w => `<div class="cal-wd">${esc(w)}</div>`).join('')}${days.map(d => { const list = (by.get(d) || []).sort((a, b) => (PRIO_RANK[a.prio] ?? 2) - (PRIO_RANK[b.prio] ?? 2)); return `<button class="cal-day ${d.slice(0, 7) !== m ? 'out' : ''} ${d === T() ? 'today' : ''} ${workweek().weekend.includes(new Date(d + 'T12:00:00').getDay()) ? 'wkend' : ''} ${UI.plan.day === d ? 'sel' : ''}" data-act="cal-day" data-d="${d}"><span class="n">${+d.slice(8)}</span>${list.slice(0, 3).map(e => `<span class="ev ${e.kind}" dir="auto">${esc(E.clip(e.label, 28))}</span>`).join('')}${list.length > 3 ? `<span class="more">+${list.length - 3}</span>` : ''}</button>`; }).join('')}</div></section>
    ${sel ? `<section class="card pad"><div class="section-title"><h2>${esc(fmtDate(UI.plan.day, { weekday: 'long', day: 'numeric', month: 'long' }))}</h2></div>${sel.map(e => `<div class="row cal-item"><i class="k ${e.kind}"></i>${e.ref ? `<span class="mono small">${esc(e.ref)}</span>` : ''}<span dir="auto" style="flex:1;min-width:0">${esc(e.label)}</span>${e.open ? `<button class="btn ghost sm" data-act="${e.open[0]}" data-id="${esc(e.open[1])}">Open</button>` : ''}</div>`).join('')}</section>` : ''}`;
}
Object.assign(ACT, {
  'cal-m': el => { UI.plan.month = monAddMonths(UI.plan.month, +el.dataset.d); UI.plan.day = null; render(); },
  'cal-today': () => { UI.plan.month = T().slice(0, 7); UI.plan.day = T(); render(); },
  'cal-day': el => { UI.plan.day = UI.plan.day === el.dataset.d ? null : el.dataset.d; render(); },
});

/* --- Gantt: each open task from when it started to its deadline, by project; deliveries as diamonds --- */
function ganttHTML() {
  const tasks = openTasks().filter(t => t.deadline).sort((a, b) => (a.project || '~').localeCompare(b.project || '~') || a.deadline.localeCompare(b.deadline));
  if (!tasks.length) return '<section class="card pad"><p class="muted">Tasks with a deadline appear here as bars from the day they started to their deadline.</p></section>';
  const startOf = t => dayOf(t.startedAt || t.createdAt) || T();
  const d0 = [...tasks.map(startOf), T()].sort()[0], d1 = [...tasks.map(t => t.deadline), E.addDays(T(), 14)].sort().pop();
  const span = Math.max(14, Math.round((Date.parse(d1) - Date.parse(d0)) / 864e5) + 3), dayW = Math.max(6, Math.min(26, 900 / span)), L = 260, rowH = 26, W = L + span * dayW + 20;
  const x = d => L + Math.round((Date.parse(d) - Date.parse(d0)) / 864e5) * dayW;
  const rows = []; let lastP = null;
  for (const t of tasks) { if (t.project !== lastP) { rows.push({ head: t.project || 'No project' }); lastP = t.project; } rows.push({ t }); }
  const H = rows.length * rowH + 40;
  const weeks = []; for (let d = weekStart(d0); d <= d1; d = E.addDays(d, 7)) weeks.push(d);
  const col = t => ({ critical: '#C62828', high: '#C26100', medium: '#0A6B74', low: '#7A8A87' })[t.priority] || '#0A6B74';
  const svg = `<svg class="gantt" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Gantt chart">
    ${weeks.map(w => `<line x1="${x(w)}" x2="${x(w)}" y1="20" y2="${H}" class="g-grid"/><text x="${x(w) + 3}" y="14" class="g-ax">${esc(fmtDate(w, { day: 'numeric', month: 'short' }))}</text>`).join('')}
    <line x1="${x(T())}" x2="${x(T())}" y1="16" y2="${H}" class="g-today"/>
    ${rows.map((r, i) => { const y = 24 + i * rowH; if (r.head) return `<text x="6" y="${y + 17}" class="g-head">${xesc(E.clip(r.head, 34))}</text>`; const t = r.t, a = x(startOf(t)), b = Math.max(a + dayW, x(t.deadline) + dayW), late = t.deadline < T();
      return `<g class="g-row" data-act="open-task" data-id="${esc(t.id)}"><text x="16" y="${y + 17}" class="g-lab">${xesc((t.ref ? t.ref + ' ' : '') + E.clip(t.title, 34))}</text><rect x="${a}" y="${y + 5}" width="${b - a}" height="${rowH - 10}" rx="4" fill="${col(t)}" opacity="${t.status === 'waiting' || t.ownership === 'waiting' ? .45 : .85}"/>${late ? `<text x="${b + 4}" y="${y + 17}" class="g-late">late</text>` : ''}<title>${xesc(`${t.title} — ${fmtDate(startOf(t))} → ${fmtDate(t.deadline)}`)}</title></g>`; }).join('')}
  </svg>`;
  return `<section class="card pad"><div class="section-title"><h2>Timeline of open tasks</h2><span class="spacer"></span><button class="btn sm" data-act="gantt-pdf">📄 PDF</button></div><p class="small muted" style="margin:0">Bars run from when the task started (or was created) to its deadline; pale bars wait on someone else. Press a bar to open the task.</p><div class="gantt-wrap">${svg}</div></section>`;
}
Object.assign(ACT, { 'gantt-pdf': () => { const s = $('.gantt'); if (s) printDoc(`<h1>Timeline — ${esc(St.settings.me.name || '')}</h1><p class="muted">${esc(fmtDate(T(), { day: 'numeric', month: 'long', year: 'numeric' }))}</p>${s.outerHTML.replace(/class="g-grid"/g, 'stroke="#DDE4E2"').replace(/class="g-today"/g, 'stroke="#C62828" stroke-dasharray="4 3"').replace(/class="g-(ax|lab|head|late)"/g, 'font-size="11" font-family="Arial"')}`, `timeline-${T()}.pdf`, true, 'Timeline'); } });

/* --- workload per week, and a polite extension request when a week is over full --- */
const loadPrefs = () => ({ cap: 12, ...(St.cols.prefs.get('workload') || {}) });
function loadModel() {
  const weeks = Array.from({ length: 8 }, (_, i) => E.addDays(weekStart(T()), i * 7));
  const mine = openTasks().filter(t => isMine(t) && t.deadline);
  return weeks.map((w, i) => { const end = E.addDays(w, 6), list = mine.filter(t => i === 0 ? t.deadline <= end : t.deadline >= w && t.deadline <= end); return { w, end, list, n: list.length, over: i === 0 ? list.filter(t => t.deadline < T()).length : 0 }; });
}
function loadHTML() {
  const cap = +loadPrefs().cap || 12, M = loadModel(), max = Math.max(cap, ...M.map(m => m.n));
  return `<section class="card pad"><div class="section-title"><h2>How full each week is</h2><span class="spacer"></span><label class="small">Comfortable tasks per week <input class="input" type="number" min="1" max="100" value="${cap}" data-chg="load-cap" style="width:70px"></label></div>
    <p class="small muted" style="margin:0">Your own open tasks by deadline week (this week includes anything overdue). A week above the line is over full — the app can draft a request to move some deadlines.</p>
    <div class="load-bars">${M.map(m => `<div class="load-w ${m.n > cap ? 'over' : ''}"><div class="load-bar"><i style="height:${Math.round(m.n / max * 100)}%"></i><b style="bottom:${Math.round(cap / max * 100)}%"></b></div><span class="n">${m.n}</span><span class="small muted">${esc(fmtDate(m.w, { day: 'numeric', month: 'short' }))}</span>${m.n > cap ? `<button class="btn sm" data-act="load-ext" data-w="${m.w}">Ask for more time</button>` : ''}</div>`).join('')}</div></section>`;
}
Object.assign(CHG, { 'load-cap': el => { colPut('prefs', { ...loadPrefs(), id: 'workload', cap: Math.max(1, +el.value || 12) }); render(); } });
Object.assign(ACT, {
  'load-ext': async el => {
    const m = loadModel().find(x => x.w === el.dataset.w), cap = +loadPrefs().cap || 12; if (!m) return;
    // the tasks others asked for, latest deadlines first, are the ones to move
    const movable = m.list.filter(t => t.requestedBy && !/^me$/i.test(t.requestedBy) && t.priority !== 'critical').sort((a, b) => (PRIO_RANK[b.priority] ?? 2) - (PRIO_RANK[a.priority] ?? 2) || b.deadline.localeCompare(a.deadline)).slice(0, Math.max(1, m.n - cap));
    if (!movable.length) return toast('No task in that week was requested by someone else — nothing to ask about.', { err: true });
    const who = movable[0].requestedBy, items = movable.filter(t => t.requestedBy === who);
    const newDate = t => E.addDays(t.deadline, 7);
    const local = { subject: `Request to adjust deadlines — ${items.map(t => t.ref).join(', ')}`, body: `Dear ${who.split(/\s+/)[0]},\n\nI have several deliverables due in the week of ${fmtDate(m.w, { day: 'numeric', month: 'long' })}. To keep the quality right, could we move the following?\n\n${items.map(t => `• ${t.title} — from ${fmtDate(t.deadline)} to ${fmtDate(newDate(t))}`).join('\n')}\n\nPlease let me know if any of them cannot move.\n\nBest regards,\n${St.settings.me.name || ''}` };
    UI.mail = { kind: 'reply', id: items[0].id, ...local, to: addressOf(who), busy: !!St.sample }; openMailModal();
    if (!St.sample) return;
    try {
      const r = await St.sample.json(`You draft short, polite, professional engineering emails. Write a request to ${who} to extend these deadlines by about a week because the user's week of ${m.w} has ${m.n} deliverables. Give the reason briefly, list each item with the current and proposed date, and offer to discuss priorities. Keep it under 150 words. Sign as ${St.settings.me.name || 'the user'}.\nItems:\n${items.map(t => `- ${t.title} (current ${t.deadline}, proposed ${newDate(t)})`).join('\n')}\nReply JSON: {"subject": "…", "body": "…"}`, { modelTier: 'quick' });
      if (UI.mail && UI.mail.id === items[0].id) { UI.mail = { ...UI.mail, subject: r.subject || local.subject, body: r.body || local.body, busy: false }; openMailModal(); }
    } catch { if (UI.mail) { UI.mail.busy = false; openMailModal(); } }
  },
});

/* --- contacts: everyone in your emails, with phone and title from their signature --- */
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
function sigOf(body, name) {
  // the lines after the sign-off that mention the sender's name
  const lines = String(body || '').split('\n').map(l => l.trim()), first = (name || '').split(/\s+/)[0];
  let i = lines.findIndex(l => /^(best|kind|warm)?\s*regards|^thanks|^thank you|^sincerely|^br,?$|^مع (خالص )?التحية|^تحياتي|^شكرا/i.test(l));
  if (i < 0 && first) i = lines.findIndex(l => l.toLowerCase().startsWith(first.toLowerCase()));
  if (i < 0) return null;
  const block = lines.slice(i, i + 9).filter(Boolean), text = block.join('\n');
  const phones = [...new Set((text.match(PHONE_RE) || []).map(p => p.replace(/[^\d+]/g, '')).filter(p => p.length >= 8 && p.length <= 15))];
  const title = block.find(l => /engineer|manager|director|coordinator|lead|head|specialist|consultant|supervisor|مهندس|مدير|رئيس/i.test(l) && l.length < 80) || '';
  return { phones, title };
}
function contactsBuild() {
  const map = new Map(St.cols.contacts);
  const meMail = new Set((St.settings.me.emails || []).map(x => x.toLowerCase()));
  const touch = (name, email, e, role) => {
    email = String(email || '').toLowerCase().trim(); if (!/@/.test(email) || meMail.has(email) || /noreply|no-reply|mailer-daemon|notifications?@/.test(email)) return;
    const cur = map.get(email) || { id: email, email, name: '', company: '', phones: [], title: '', emails: 0, last: '' };
    const c = { ...cur };
    if (name && name !== email && (!c.name || c.name.includes('@'))) c.name = name.replace(/^["']|["']$/g, '').trim();
    if (!c.company) { const d = email.split('@')[1] || ''; c.company = /gmail|yahoo|hotmail|outlook|live|icloud/.test(d) ? '' : d.split('.').slice(-3, -1).filter(x => !/^(com|co|net|org|gov)$/.test(x)).pop() || ''; c.company = c.company ? c.company[0].toUpperCase() + c.company.slice(1) : ''; }
    const at = e.date || e.importedAt || '';
    if (role === 'from' && at > (c.last || '')) c.last = at;
    c.emails = (c.emails || 0) + (c._seen && c._seen.includes(e.id) ? 0 : 1);
    map.set(email, c);
  };
  const parse = s => String(s || '').split(/[;,](?=(?:[^"]*"[^"]*")*[^"]*$)/).map(x => { const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(x); return m ? [m[1].trim(), m[2]] : [x.trim(), x.trim()]; });
  return { map, touch, parse };
}
async function contactsScan() {
  const { map, touch, parse } = contactsBuild();
  for (const c of map.values()) c.emails = 0;
  for (const e of St.emails.values()) {
    for (const [n, a] of parse(e.from)) touch(n, e.fromEmail || a, e, 'from');
    for (const [n, a] of [...parse(e.to), ...parse(e.cc)]) touch(n, a, e, 'to');
    const fe = (e.fromEmail || (parse(e.from)[0] || [])[1] || '').toLowerCase(), c = map.get(fe);
    if (c && (!c.phones.length || !c.title) && e.hasText) { const tx = await getTexts(e.id).catch(() => null); const sg = tx && sigOf(tx.body, c.name); if (sg) { if (!c.phones.length) c.phones = sg.phones; if (!c.title) c.title = sg.title; } }
  }
  let n = 0; for (const c of map.values()) { const old = St.cols.contacts.get(c.id); delete c._seen; if (!old || JSON.stringify({ ...old, updatedAt: 0 }) !== JSON.stringify({ ...c, updatedAt: 0 })) { colPut('contacts', c); n++; } }
  return n;
}
function contactStats(c) {
  const nm = E.normMatch(c.name || c.email.split('@')[0]), first = nm.split(' ')[0];
  const rel = [...St.tasks.values()].filter(t => [t.owner, t.requestedBy].some(x => x && (E.normMatch(x) === nm || (first.length > 2 && E.normMatch(x).startsWith(first)))));
  return { open: rel.filter(t => t.status !== 'done'), waiting: rel.filter(t => t.status !== 'done' && t.ownership === 'waiting'), all: rel };
}
function contactsHTML() {
  const q = E.normMatch(UI.plan.q || ''), list = colList('contacts').filter(c => !q || E.normMatch([c.name, c.email, c.company, c.title, (c.phones || []).join(' ')].join(' ')).includes(q)).sort((a, b) => (b.last || '').localeCompare(a.last || ''));
  return `<section class="card pad"><div class="section-title"><h2>Contacts</h2><span class="spacer"></span><button class="btn sm" data-act="ct-scan">↻ Update from emails</button><button class="btn sm" data-act="ct-export" ${list.length ? '' : 'disabled'}>⬇ Contacts file (.vcf)</button></div>
    <p class="small muted" style="margin:0">Everyone who wrote to you or was copied, with company, title and phone taken from their signature. Open tasks with each person are counted.</p>
    <div class="toolbar row"><label class="search">${I.search}<input class="input" type="search" placeholder="Search name, company, phone…" value="${esc(UI.plan.q || '')}" data-chg="plan-q"></label><span class="small muted">${list.length} people</span></div>
    ${list.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Name</th><th>Company</th><th>Title</th><th>Phone</th><th>Email</th><th>Open with them</th><th></th></tr></thead><tbody>${list.slice(0, 400).map(c => { const s = contactStats(c); return `<tr><td dir="auto"><b>${esc(c.name || '—')}</b></td><td>${regCell('contacts', c, { k: 'company', w: 130 })}</td><td>${regCell('contacts', c, { k: 'title', w: 170 })}</td><td class="nowrap">${(c.phones || []).map(p => `<a href="tel:${esc(p)}">${esc(p)}</a>`).join('<br>') || '—'}</td><td class="small"><a href="#" data-act="ct-mail" data-to="${esc(c.email)}">${esc(c.email)}</a></td><td>${s.open.length ? `<span class="chip">${s.open.length} open</span>` : ''}${s.waiting.length ? ` <span class="chip warn">${s.waiting.length} waiting</span>` : ''}</td><td><button class="btn sm ghost" data-act="meet-for" data-who="${esc(c.name || c.email)}">Prep meeting</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">Press “Update from emails” to build the list.</p>'}</section>`;
}
Object.assign(CHG, { 'plan-q': el => { UI.plan.q = el.value; render(); } });
Object.assign(ACT, {
  'ct-scan': async () => { const n = await contactsScan(); toast(`${n} contact${n === 1 ? '' : 's'} added or updated.`); render(); },
  'ct-mail': el => openMailto('mailto:' + el.dataset.to),
  'ct-export': () => { const v = colList('contacts').map(c => ['BEGIN:VCARD', 'VERSION:3.0', `FN:${(c.name || c.email).replace(/[,;\\]/g, ' ')}`, c.company ? `ORG:${c.company}` : '', c.title ? `TITLE:${c.title}` : '', `EMAIL;TYPE=WORK:${c.email}`, ...(c.phones || []).map(p => `TEL;TYPE=WORK:${p}`), 'END:VCARD'].filter(Boolean).join('\r\n')).join('\r\n'); offerFile(`contacts-${T()}.vcf`, v, 'text/vcard'); },
  'meet-for': el => { UI.plan.tab = 'meeting'; UI.plan.who = el.dataset.who; UI.plan.brief = null; render(); },
});

/* --- vendor scorecard --- */
const VC = [['quality', 'Quality of documents'], ['response', 'Response speed'], ['delivery', 'On-time delivery'], ['price', 'Price'], ['support', 'Technical support']];
function vendorsModel() {
  const names = new Map(); const key = n => E.normMatch(n || '').trim();
  for (const p of colList('procure')) if (p.supplier) { const k = key(p.supplier); const v = names.get(k) || { name: p.supplier, items: [], late: 0, delivered: 0, waits: [] }; v.items.push(p); const s = prState(p); if (s.late) v.late++; if (s.done) v.delivered++; names.set(k, v); }
  for (const t of St.tasks.values()) if (t.ownership === 'waiting' && t.owner) { const k = key(t.owner); for (const [vk, v] of names) if (k && (k.includes(vk) || vk.includes(k))) v.waits.push(t); }
  for (const v of colList('vendors')) { const k = key(v.name); if (!names.has(k)) names.set(k, { name: v.name, items: [], late: 0, delivered: 0, waits: [] }); }
  return [...names.entries()].map(([k, v]) => {
    const r = St.cols.vendors.get('v_' + k.replace(/\W+/g, '_')) || {};
    const answered = v.waits.filter(t => t.status === 'done' && t.completedAt && t.createdAt), avgDays = answered.length ? answered.reduce((s, t) => s + (Date.parse(t.completedAt) - Date.parse(t.createdAt)) / 864e5, 0) / answered.length : null;
    const ratings = VC.map(([c]) => +r[c]).filter(x => x > 0), score = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
    return { k, id: 'v_' + k.replace(/\W+/g, '_'), ...v, r, avgDays, openWaits: v.waits.filter(t => t.status !== 'done').length, score };
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name));
}
function vendorsHTML() {
  const list = vendorsModel();
  return `<section class="card pad"><div class="section-title"><h2>Vendor scorecard</h2><span class="spacer"></span><input class="input" id="vd-new" placeholder="Add a supplier" style="width:200px"><button class="btn sm" data-act="vd-add">${I.plus} Add</button><button class="btn sm" data-act="vd-export" ${list.length ? '' : 'disabled'}>⬇ Excel</button></div>
    <p class="small muted" style="margin:0">Suppliers from your procurement tracker. Facts are counted for you (late deliveries, how long they take to answer when you wait on them); rate each 1–5 for the things only you can judge.</p>
    ${list.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Supplier</th><th>Items</th><th>Late</th><th>Waiting now</th><th>Avg. answer</th>${VC.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th>Score</th></tr></thead><tbody>${list.map(v => `<tr><td dir="auto"><b>${esc(v.name)}</b></td><td class="num">${v.items.length}</td><td class="num ${v.late ? 'crit' : ''}">${v.late}</td><td class="num">${v.openWaits}</td><td class="num">${v.avgDays === null ? '—' : fmtNum(v.avgDays, 1) + ' d'}</td>${VC.map(([c]) => `<td><select class="input vd-rate" data-chg="vd-rate" data-id="${esc(v.id)}" data-name="${esc(v.name)}" data-c="${c}"><option value="">—</option>${[1, 2, 3, 4, 5].map(n => `<option ${+v.r[c] === n ? 'selected' : ''}>${n}</option>`).join('')}</select></td>`).join('')}<td><b class="${v.score >= 4 ? 'ok' : v.score && v.score < 2.5 ? 'crit' : ''}">${v.score === null ? '—' : fmtNum(v.score, 1)}</b></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Add suppliers in Tools › Procurement, or add one here.</p>'}</section>`;
}
Object.assign(CHG, { 'vd-rate': el => { const id = el.dataset.id, cur = St.cols.vendors.get(id) || { id, name: el.dataset.name }; colPut('vendors', { ...cur, [el.dataset.c]: el.value ? +el.value : '' }); render(); } });
Object.assign(ACT, {
  'vd-add': () => { const n = (($('#vd-new') || {}).value || '').trim(); if (!n) return; colPut('vendors', { id: 'v_' + E.normMatch(n).replace(/\W+/g, '_'), name: n }); render(); },
  'vd-export': () => regExport('Vendor scorecard', ['Supplier', 'Items', 'Late', 'Waiting now', 'Avg answer (days)', ...VC.map(c => c[1]), 'Score'], vendorsModel().map(v => [v.name, v.items.length, v.late, v.openWaits, v.avgDays === null ? '' : Math.round(v.avgDays * 10) / 10, ...VC.map(([c]) => v.r[c] || ''), v.score === null ? '' : Math.round(v.score * 10) / 10])),
});

/* --- meeting prep: everything open with a person or on a project, on one page --- */
function meetModel(who) {
  const nq = E.normMatch(who), first = nq.split(' ')[0];
  const hit = s => { const x = E.normMatch(s || ''); return !!x && (x.includes(nq) || (first.length > 2 && x.split(' ').includes(first))); };
  const proj = projectsList().find(p => E.normMatch(p) === nq);
  const tasks = [...St.tasks.values()].filter(t => proj ? t.project === proj : (hit(t.owner) || hit(t.requestedBy)));
  const emails = [...St.emails.values()].filter(e => proj ? (e.analysis && e.analysis.project === proj) || tasks.some(t => (t.emailIds || []).includes(e.id)) : hit(e.from) || hit(e.to) || hit(e.cc)).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 8);
  const docs = colList('docreg').filter(d => (proj ? d.project === proj : hit(d.by)) && /^[34]$/.test(d.code) && !d.closed && !d.resubmitted);
  return { proj, mine: tasks.filter(t => t.status !== 'done' && isMine(t)), theirs: tasks.filter(t => t.status !== 'done' && t.ownership === 'waiting'), done: tasks.filter(t => t.status === 'done' && t.completedAt && dayOf(t.completedAt) >= E.addDays(T(), -14)), emails, docs };
}
function meetHTML() {
  const who = UI.plan.who || '', M = who ? meetModel(who) : null, b = UI.plan.brief;
  const people = [...new Set([...St.tasks.values()].flatMap(t => [t.owner, t.requestedBy]).filter(x => x && !/^me$/i.test(x)))].sort();
  const li = (a, f) => a.length ? `<ul>${a.map(f).join('')}</ul>` : '<p class="small muted">None.</p>';
  const tl = t => `<li dir="auto"><span class="mono small">${esc(t.ref || '')}</span> ${esc(t.title)}${t.deadline ? ` <span class="small muted">· ${esc(fmtDate(t.deadline))}</span>` : ''}</li>`;
  return `<section class="card pad"><div class="section-title"><h2>Meeting prep</h2></div>
    <div class="row"><input class="input hold-render" id="meet-who" list="meet-list" value="${esc(who)}" placeholder="Person or project" style="flex:1"><datalist id="meet-list">${[...projectsList(), ...people].map(p => `<option value="${esc(p)}">`).join('')}</datalist><button class="btn primary" data-act="meet-go">Prepare</button></div></section>
    ${M ? `<section class="card pad meet-sheet" id="meet-sheet"><h2>${esc(who)} — ${esc(fmtDate(T(), { day: 'numeric', month: 'long' }))}</h2>
      ${b ? `<div class="label">Talking points</div><ol>${(b.points || []).map(p => `<li dir="auto">${esc(p)}</li>`).join('')}</ol>` : ''}
      <div class="label">I owe ${M.proj ? 'on this project' : 'them'} (${M.mine.length})</div>${li(M.mine, tl)}
      <div class="label">${M.proj ? 'Waiting on others' : 'They owe me'} (${M.theirs.length})</div>${li(M.theirs, tl)}
      <div class="label">Done in the last two weeks (${M.done.length})</div>${li(M.done, tl)}
      <div class="label">Documents returned Code 3/4 still open (${M.docs.length})</div>${li(M.docs, d => `<li><span class="mono">${esc(d.number)}</span> ${esc(d.title || '')} — Rev ${esc(d.revision || '')}, code ${esc(d.code)}</li>`)}
      <div class="label">Recent emails</div>${li(M.emails, e => `<li dir="auto">${esc(fmtDate(e.date))} — ${esc(e.subject || '')}</li>`)}
      <div class="row no-print">${St.sample ? `<button class="btn" data-act="meet-ai" ${UI.plan.briefBusy ? 'disabled' : ''}>${UI.plan.briefBusy ? 'Thinking…' : '✨ Talking points'}</button>` : ''}<button class="btn" data-act="meet-print">📄 PDF</button><button class="btn" data-act="meet-copy">Copy</button></div></section>` : ''}`;
}
const meetText = () => { const n = $('#meet-sheet'); return n ? n.innerText.replace(/\n{3,}/g, '\n\n') : ''; };
Object.assign(ACT, {
  'meet-go': () => { UI.plan.who = (($('#meet-who') || {}).value || '').trim(); UI.plan.brief = null; render(); },
  'meet-print': () => { const n = $('#meet-sheet'); if (n) printDoc(n.innerHTML.replace(/<div class="row no-print">[\s\S]*$/, ''), `meeting-${E.normMatch(UI.plan.who).replace(/\W+/g, '-')}-${T()}.pdf`, false, 'Meeting prep'); },
  'meet-copy': () => navigator.clipboard.writeText(meetText()).then(() => toast('Copied.')),
  'meet-ai': async () => {
    UI.plan.briefBusy = true; render();
    try { const r = await St.sample.json(`Prepare 4–7 short talking points for a meeting with ${UI.plan.who}, most important first: what to ask for, what to report, what to agree. Use only the facts below.\n\n${meetText()}\n\nReply JSON: {"points": ["…"]}`, { modelTier: 'quick' }); UI.plan.brief = { points: (r.points || []).map(String) }; }
    catch (e) { toast('Failed: ' + (e.message || e.code), { err: true }); }
    UI.plan.briefBusy = false; render();
  },
});

/* --- the other side's deadlines: review periods and answer times from the contract --- */
const DL_DEFAULT = [{ id: 'r_review', party: 'Consultant', what: 'review of submittals', days: 14, on: 'submitted', active: true }, { id: 'r_rfi', party: 'Consultant', what: 'answer to RFIs', days: 7, on: 'rfi', active: true }];
const dlRules = () => (St.cols.deadlines.size ? colList('deadlines') : DL_DEFAULT);
function theirDeadlines() {
  const out = [];
  for (const r of dlRules().filter(r => r.active !== false)) {
    if (r.on === 'submitted') for (const d of colList('docreg')) { const sub = [...(d.revs || [])].reverse().find(x => x.status === 'submitted'); if (!sub || !sub.date) continue; const back = (d.revs || []).some(x => x.date >= sub.date && x !== sub && x.status !== 'submitted'); out.push({ party: r.party, what: `${r.what}: ${d.number} Rev ${sub.rev || ''}`, from: sub.date, due: E.addDays(sub.date, +r.days), done: back || d.closed, rule: r.id }); }
    if (r.on === 'rfi') for (const x of colList('eng').filter(x => x.kind === 'rfi')) out.push({ party: r.party, what: `${r.what}: ${x.no}`, from: x.date, due: E.addDays(x.date, +r.days), done: !!x.answered, rule: r.id });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}
function dlHTML() {
  const rules = dlRules(), list = theirDeadlines().filter(d => !d.done), late = list.filter(d => d.due < T());
  return `<section class="card pad"><div class="section-title"><h2>Time limits the other side must keep</h2></div>
    <p class="small muted" style="margin:0">From your contract, e.g. “the Engineer shall review submittals within 14 days”. The clock starts when you submit a document (document register) or send an RFI. Overdue ones are evidence for delay claims — draft a reminder in one click.</p>
    <div class="mon-scroll"><table class="tbl"><thead><tr><th>Who</th><th>Must</th><th>Within (days)</th><th>Counted from</th><th>On</th><th></th></tr></thead><tbody>${rules.map(r => `<tr><td><input class="input hold-render" value="${esc(r.party)}" data-chg="dl-f" data-id="${esc(r.id)}" data-k="party"></td><td><input class="input hold-render" value="${esc(r.what)}" data-chg="dl-f" data-id="${esc(r.id)}" data-k="what"></td><td><input class="input hold-render num" value="${esc(r.days)}" data-chg="dl-f" data-id="${esc(r.id)}" data-k="days" style="width:70px"></td><td><select class="input" data-chg="dl-f" data-id="${esc(r.id)}" data-k="on"><option value="submitted" ${r.on === 'submitted' ? 'selected' : ''}>a document is submitted</option><option value="rfi" ${r.on === 'rfi' ? 'selected' : ''}>an RFI is sent</option></select></td><td><input type="checkbox" data-chg="dl-f" data-id="${esc(r.id)}" data-k="active" ${r.active !== false ? 'checked' : ''} aria-label="On"></td><td><button class="icon-btn" data-act="dl-del" data-id="${esc(r.id)}" aria-label="Delete">${I.x}</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn sm" data-act="dl-add">${I.plus} Rule</button></div></section>
    <section class="card pad"><div class="section-title"><h2>Running now</h2><span class="small muted">${list.length} open · ${late.length} overdue</span></div>
    ${list.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Who</th><th>What</th><th>Since</th><th>Due</th><th></th></tr></thead><tbody>${list.map((d, i) => `<tr class="${d.due < T() ? 'risk' : ''}"><td>${esc(d.party)}</td><td dir="auto">${esc(d.what)}</td><td class="nowrap">${esc(fmtDate(d.from))}</td><td class="nowrap ${d.due < T() ? 'crit' : ''}">${esc(fmtDate(d.due))}${d.due < T() ? ` · ${Math.round((Date.parse(T()) - Date.parse(d.due)) / 864e5)} d late` : ''}</td><td>${d.due < T() ? `<button class="btn sm" data-act="dl-remind" data-i="${i}">Draft reminder</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing running.</p>'}</section>`;
}
function dlEnsure() { if (!St.cols.deadlines.size) for (const r of DL_DEFAULT) colPut('deadlines', { ...r }); }
Object.assign(CHG, { 'dl-f': el => { dlEnsure(); const r = St.cols.deadlines.get(el.dataset.id); if (!r) return; const k = el.dataset.k; colPut('deadlines', { ...r, [k]: el.type === 'checkbox' ? el.checked : k === 'days' ? Math.max(1, +el.value || 1) : el.value.trim() }); if (el.tagName === 'SELECT' || el.type === 'checkbox' || k === 'days') render(); } });
Object.assign(ACT, {
  'dl-add': () => { dlEnsure(); colPut('deadlines', { id: E.uid('dl'), party: 'Consultant', what: 'review of submittals', days: 14, on: 'submitted', active: true }); render(); },
  'dl-del': el => { dlEnsure(); colDel('deadlines', el.dataset.id); render(); },
  'dl-remind': el => {
    const d = theirDeadlines().filter(x => !x.done)[+el.dataset.i]; if (!d) return;
    const late = Math.round((Date.parse(T()) - Date.parse(d.due)) / 864e5);
    UI.mail = { kind: 'reply', id: null, to: '', subject: `Reminder: ${d.what}`, body: `Dear Sir,\n\nWe refer to the ${d.what}, sent on ${fmtDate(d.from, { day: 'numeric', month: 'long', year: 'numeric' })}. Under the contract this was due within ${dlRules().find(r => r.id === d.rule)?.days || ''} days, i.e. by ${fmtDate(d.due, { day: 'numeric', month: 'long', year: 'numeric' })}; it is now ${late} days overdue.\n\nWe kindly request your response at the earliest, as further delay affects the progress of the related works. We reserve our rights under the contract in respect of the resulting delay.\n\nBest regards,\n${St.settings.me.name || ''}`, busy: false };
    openMailModal();
  },
});

/* --- Daily: end-of-day wrap-up and a printable sheet for the day --- */
function dailyExtraBtns() { return `<button class="btn sm" data-act="day-wrap">🌙 Wrap up the day</button><button class="btn sm" data-act="day-sheet">🖨 Day sheet</button>`; }
function wrapModel() {
  const D = UI.dayDate || T(), m = dayModel(D);
  const done = m.lanes.done.map(it => it.t), open = [...m.lanes.wip, ...m.lanes.todo].map(it => it.t);
  const tomorrow = openTasks().filter(t => isMine(t) && t.status !== 'waiting').sort((a, b) => (PRIO_RANK[a.priority] ?? 2) - (PRIO_RANK[b.priority] ?? 2) || (a.deadline || '9').localeCompare(b.deadline || '9')).slice(0, 3);
  return { D, done, open, tomorrow, mins: Math.round(timeEntries().filter(e => dayOf(e.start) === D).reduce((s, e) => s + entryMs(e), 0) / 60000) };
}
Object.assign(ACT, {
  'day-wrap': () => {
    const W = wrapModel(), m = $('#modal');
    const li = (a, f) => a.length ? `<ul>${a.map(f).join('')}</ul>` : '<p class="small muted">None.</p>';
    m.innerHTML = deco(`<div class="card pad share-modal" role="dialog" aria-label="Wrap up"><div class="row"><b>🌙 Wrap up — ${esc(fmtDate(W.D, { weekday: 'long', day: 'numeric', month: 'short' }))}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
      <div class="label">Done today (${W.done.length})${W.mins ? ` · ${Math.floor(W.mins / 60)}h ${W.mins % 60}m tracked` : ''}</div>${li(W.done, t => `<li dir="auto">✓ ${esc(t.title)}</li>`)}
      <div class="label">Still open from today (${W.open.length})</div>${li(W.open, t => `<li dir="auto"><label class="check small"><input type="checkbox" class="wrap-carry" value="${esc(t.id)}" checked> carry to tomorrow — ${esc(t.title)}</label></li>`)}
      <div class="label">Suggested top 3 for tomorrow</div>${li(W.tomorrow, t => `<li dir="auto"><label class="check small"><input type="checkbox" class="wrap-top" value="${esc(t.id)}" checked> ${esc(t.title)}${t.deadline ? ` · ${esc(fmtDate(t.deadline))}` : ''}</label></li>`)}
      <label class="field"><span>Note for today (kept in your daily history)</span><textarea class="input" id="wrap-note" rows="2" dir="auto"></textarea></label>
      <div class="row end"><button class="btn" data-act="wrap-copy">Copy summary</button><button class="btn primary" data-act="wrap-save">Save and plan tomorrow</button></div></div>`);
    m.hidden = false;
  },
  'wrap-save': () => {
    const W = wrapModel(), tm = E.addDays(W.D, 1), ids = new Set([...document.querySelectorAll('.wrap-carry:checked, .wrap-top:checked')].map(i => i.value));
    for (const id of ids) { const t = clone(St.tasks.get(id)); if (!t) continue; t.days = [...new Set([...(t.days || []), tm])]; putTask(t); }
    const note = (($('#wrap-note') || {}).value || '').trim();
    if (note) putDaily({ id: E.uid('d'), kind: 'note', date: W.D, text: note, createdAt: nowISO() });
    $('#modal').hidden = true; toast(`${ids.size} task${ids.size === 1 ? '' : 's'} planned for tomorrow. Good evening!`); render();
  },
  'wrap-copy': () => { const W = wrapModel(); navigator.clipboard.writeText([`${fmtDate(W.D, { weekday: 'long', day: 'numeric', month: 'long' })}`, '', 'Done:', ...W.done.map(t => '• ' + t.title), '', 'Open:', ...W.open.map(t => '• ' + t.title), '', 'Tomorrow:', ...W.tomorrow.map(t => '• ' + t.title)].join('\n')).then(() => toast('Copied.')); },
  'day-sheet': () => {
    const D = UI.dayDate || T(), m = dayModel(D), items = [...m.lanes.wip, ...m.lanes.todo].map(it => it.t), entries = [...St.daily.values()].filter(a => a.date === D);
    const due = openTasks().filter(t => t.deadline && t.deadline <= E.addDays(D, 2) && !items.includes(t));
    const row = t => `<tr><td style="width:18pt;font-size:14pt">☐</td><td><b>${esc(t.title)}</b>${t.nextStep ? `<div class="muted">${esc(t.nextStep)}</div>` : ''}</td><td>${esc(t.project || '')}</td><td>${esc(PRIO[t.priority] || '')}</td><td>${t.deadline ? esc(fmtDate(t.deadline)) : ''}</td></tr>`;
    printDoc(`<h1>${esc(fmtDate(D, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</h1><p class="muted">${esc(St.settings.me.name || '')}</p>
      <h2>Today's work</h2><table><tr><th></th><th>Task</th><th>Project</th><th>Priority</th><th>Due</th></tr>${items.map(row).join('') || '<tr><td colspan="5" class="muted">Nothing planned yet.</td></tr>'}</table>
      ${due.length ? `<h2>Due within two days</h2><table>${due.map(row).join('')}</table>` : ''}
      ${entries.length ? `<h2>Notes and requests</h2><ul>${entries.map(a => `<li>${esc(a.text)}</li>`).join('')}</ul>` : ''}
      <h2>Notes</h2>${'<div style="border-bottom:1px solid #CBD5D3;height:22pt"></div>'.repeat(8)}`, `day-sheet-${D}.pdf`, false, 'Day sheet');
  },
});
window.__AR_PLAN = { sigOf }; // test hook
