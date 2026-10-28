/* ---------- thread history: how the conversation got to where it is now ---------- */
// Every email you add shows its whole conversation, oldest first: who asked what and when, the replies, submissions,
// comments and approvals, one line each, then 📍 Now (this email) and where things stand — your next step, or who
// you are waiting for. Claude lists the messages it reads in the quoted history; for emails read before that, the
// "From / Sent" headers under the reply are used. Earlier emails of the same conversation that you added are merged
// in, with the tasks each one created and their status. Shown in Review, on the email and on each task.
const TH_KIND = { request: '📩', reply: '↩️', submission: '📤', comments: '💬', approval: '✅', rejection: '⛔', reminder: '⏰', decision: '⚖️', info: '✉️' };
const thMe = f => /^(me|أنا)$/i.test(String(f || '').trim()) || isMeSender({ from: f || '' });
const thName = f => String(f || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
function threadEmails(e) {
  if (!e) return [];
  const list = e.threadKey ? [...St.emails.values()].filter(x => x.threadKey === e.threadKey) : (e.id ? [e] : []);
  return list.sort((a, b) => (a.date || a.importedAt || '').localeCompare(b.date || b.importedAt || ''));
}
function threadSteps(e) {
  const steps = [], seen = new Map();
  const key = st => (st.date || '?') + '|' + (thMe(st.from) || st.me ? 'me' : E.normMatch(thName(st.from)).split(' ')[0]);
  const add = st => {
    const k = key(st), old = seen.get(k);
    if (old) { if (!old.says && st.says) { old.says = st.says; old.kind = st.kind; } if (st.emailId) old.emailId = st.emailId; return; }
    seen.set(k, st); steps.push(st);
  };
  for (const em of threadEmails(e)) {
    const a = em.analysis || {}, h = (a.thread && a.thread.history) || [];
    if (h.length) h.forEach((x, i) => add({ ...x, me: thMe(x.from) || (i === h.length - 1 && !!em.fromMe), ...(i === h.length - 1 ? { emailId: em.id } : {}) }));
    else {
      (em.quoted || []).forEach(q => add({ date: q.date, from: q.from, kind: 'info', says: q.subject ? `“${q.subject}”` : '', me: thMe(q.from) }));
      add({ date: (em.date || '').slice(0, 10) || null, from: thName(em.from), kind: em.fromMe ? 'reply' : 'info', says: a.summary || em.subject || '', emailId: em.id, me: !!em.fromMe });
    }
  }
  // in date order; a message without a date stays after the one before it
  let last = '';
  steps.forEach((s, i) => { s.ord = s.date || last; s.i = i; if (s.date) last = s.date; });
  return steps.sort((a, b) => (a.ord || '').localeCompare(b.ord || '') || a.i - b.i);
}
function threadHistHTML(e, opt = {}) {
  if (!e) return '';
  const steps = threadSteps(e); if (steps.length < 2) return '';
  const ems = threadEmails(e), ids = new Set(ems.map(x => x.id)), tk = e.threadKey;
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).some(id => ids.has(id)) || (tk && t.threadKey === tk));
  const tasksOf = id => tasks.filter(t => (t.emailIds || []).includes(id));
  const chip = t => `<button class="th-task ${t.status === 'done' ? 'done' : ''}" data-act="open-task" data-id="${esc(t.id)}" title="${esc(t.title)}">${t.status === 'done' ? '✓' : '○'} ${esc(t.ref || '')} <span dir="auto">${esc(E.clip(t.title, 40))}</span></button>`;
  const open = tasks.filter(t => t.status !== 'done');
  const first = steps.find(s => s.date), cur = e.id ? steps.filter(s => s.emailId === e.id).pop() : null, now = cur || steps[steps.length - 1];
  const who = t => t.ownership === 'waiting' ? `waiting on ${esc(t.owner || 'others')}` : t.ownership === 'fyi' ? 'for information' : 'your action';
  const stand = open.length ? open.map(t => `<li><button class="th-task" data-act="open-task" data-id="${esc(t.id)}">${esc(t.ref || '')} <span dir="auto">${esc(E.clip(t.title, 60))}</span></button> <span class="small muted">— ${who(t)}${t.deadline ? ' · due ' + esc(fmtDate(t.deadline)) : ''}${t.status === 'blocked' ? ' · blocked' : ''}</span></li>`).join('')
    : tasks.length ? '<li class="small">Everything from this conversation is done ✓</li>' : '';
  const pending = e.id && e.reviewState === 'pending' ? ((e.analysis && e.analysis.tasks) || []).length : 0;
  return `<details class="th-hist" ${opt.open ? 'open' : ''}>
    <summary>🧵 Thread history <span class="small muted">· ${steps.length} messages${first ? ' · since ' + esc(fmtDate(first.date, { day: 'numeric', month: 'short', year: 'numeric' })) : ''}</span></summary>
    <ol class="th-steps">${steps.map(s => {
      const here = s === now, mine = s.me, ts = s.emailId && !here ? tasksOf(s.emailId) : [];
      return `<li class="th-step${mine ? ' me' : ''}${here ? ' now' : ''}${opt.task && s.emailId && (opt.task.emailIds || []).includes(s.emailId) ? ' task' : ''}">
        <span class="th-dot" aria-hidden="true">${here ? '📍' : TH_KIND[s.kind] || TH_KIND.info}</span>
        <div class="th-body"><div class="th-meta"><b dir="auto">${esc(mine ? 'Me' : (s.from || 'Someone'))}</b>${s.date ? ` · ${esc(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' }))}` : ''}${here ? ' · <span class="th-nowtag">Now</span>' : ''}${s.emailId && s.emailId !== e.id ? ` · <button class="linkish small" data-act="open-email" data-id="${esc(s.emailId)}">open email</button>` : ''}</div>
          ${s.says ? `<div class="th-says" dir="auto">${esc(s.says)}</div>` : ''}
          ${ts.length ? `<div class="th-tasks">${ts.map(chip).join('')}</div>` : ''}</div></li>`;
    }).join('')}
    ${stand || pending ? `<li class="th-step th-next"><span class="th-dot" aria-hidden="true">➜</span><div class="th-body"><div class="th-meta"><b>Where it stands</b></div>${pending ? `<div class="small">${pending} task${pending > 1 ? 's' : ''} proposed from this email — check them below.</div>` : ''}${stand ? `<ul class="th-open">${stand}</ul>` : ''}</div></li>` : ''}
    </ol></details>`;
}
