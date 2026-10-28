/* ---------- thread history: how the conversation got to where it is now ---------- */
// Every email you add shows its whole conversation, oldest first: who asked what and when, the replies, submissions,
// comments and approvals, one line each, then 📍 Now (this email) and where things stand — your next step, or who
// you are waiting for. Claude lists the messages it reads in the quoted history; for emails read before that, the
// "From / Sent" headers under the reply are used. Earlier emails of the same conversation that you added are merged
// in, with the tasks each one created and their status. Shown in Review, on the email and on each task.
const TH_KIND = { request: '📩', reply: '↩️', submission: '📤', comments: '💬', approval: '✅', rejection: '⛔', reminder: '⏰', decision: '⚖️', info: '✉️' };
const thMe = f => /^(me|أنا)$/i.test(String(f || '').trim()) || isMeSender({ from: f || '' });
const thName = f => String(f || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').trim();
/* --- conversations: the emails that belong together, whatever their subject became --- */
// Two emails are one conversation when they share the subject (without RE:/FW:/[EXTERNAL]), one replies to the other
// (In-Reply-To / References), Gmail keeps them in one thread, one quotes the other (same sender and day in its
// quoted history), or they feed the same task (an email that updates, completes or repeats a task joins that task's
// conversation). Worked out again whenever emails or tasks change, so older emails are linked too.
const convSubj = s => E.normMatch(E.normSubject(s || ''));
const convWho = f => E.normMatch(thName(f)).split(' ')[0] || '';
let CONV = { sig: null, of: new Map(), ids: new Map() };
function convIndex() {
  const ems = [...St.emails.values()];
  let sig = ems.length + ':' + St.tasks.size;
  for (const t of St.tasks.values()) sig += (t.emailIds || []).length;
  for (const e of ems) sig += (e.analysis && (e.analysis.updates || []).length) || 0;
  sig += ':' + ems.reduce((m, e) => ((e.importedAt || '') > m ? e.importedAt : m), '') + ':' + ems.reduce((n, e) => n + ((e.quoted || []).length), 0);
  if (CONV.sig === sig) return CONV;
  const P = new Map(ems.map(e => [e.id, e.id]));
  const find = x => { while (P.get(x) !== x) { P.set(x, P.get(P.get(x))); x = P.get(x); } return x; };
  const join = (a, b) => { if (!P.has(a) || !P.has(b)) return; const ra = find(a), rb = find(b); if (ra !== rb) P.set(ra, rb); };
  const byKey = new Map(), byMid = new Map(), byGt = new Map(), byWhoDay = new Map();
  const put = (m, k, id) => { if (!k) return; if (m.has(k)) join(m.get(k), id); else m.set(k, id); };
  for (const e of ems) {
    if (e.threadKey && !/^x:/.test(e.threadKey)) put(byKey, e.threadKey, e.id);
    if (e.gmailThread) put(byGt, e.gmailThread, e.id);
    if (e.messageId) byMid.set(e.messageId.trim(), e.id);
    const d = (e.date || '').slice(0, 10), w = e.fromMe ? 'me' : convWho(e.from);
    if (d && w) { const k = d + '|' + w; if (!byWhoDay.has(k)) byWhoDay.set(k, []); byWhoDay.get(k).push(e); }
  }
  for (const e of ems) {
    for (const r of String((e.inReplyTo || '') + ' ' + (e.references || '')).split(/\s+/).filter(Boolean)) if (byMid.has(r)) join(e.id, byMid.get(r));
    for (const q of e.quoted || []) {
      if (!q.date) continue;
      const w = thMe(q.from) ? 'me' : convWho(q.from);
      for (const o of byWhoDay.get(q.date + '|' + w) || []) if (o.id !== e.id && (!q.subject || convSubj(q.subject) === convSubj(o.subject))) join(e.id, o.id);
    }
  }
  for (const t of St.tasks.values()) { const ids = (t.emailIds || []).filter(id => P.has(id)); for (let i = 1; i < ids.length; i++) join(ids[0], ids[i]); }
  for (const e of ems) {
    const a = e.analysis || {};
    for (const u of a.updates || []) { const t = St.tasks.get(u.taskId); if (t && (u.accept || u.applied)) for (const id of t.emailIds || []) join(e.id, id); }
    for (const p of a.tasks || []) { const t = p.merge && St.tasks.get(p.dupOf); if (t) for (const id of t.emailIds || []) join(e.id, id); }
  }
  // each conversation is named after its first email
  const groups = new Map();
  for (const e of ems) { const r = find(e.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); }
  const of = new Map(), ids = new Map();
  for (const list of groups.values()) {
    list.sort((a, b) => (a.date || a.importedAt || '').localeCompare(b.date || b.importedAt || ''));
    const cid = list[0].id; ids.set(cid, list); list.forEach(e => of.set(e.id, cid));
  }
  CONV = { sig, of, ids };
  return CONV;
}
const convOf = id => convIndex().of.get(id) || null;
const convEmails = cid => convIndex().ids.get(cid) || [];
// the conversations a task belongs to (normally one)
const taskConvs = t => [...new Set((t.emailIds || []).map(convOf).filter(Boolean))];
function threadEmails(e) {
  if (!e) return [];
  if (e.id && St.emails.has(e.id)) return convEmails(convOf(e.id));
  if (e.conv) return convEmails(e.conv);
  return e.id ? [e] : [];
}
// emails already stored that a new email would join (before it is saved): used to tell Claude which tracked tasks
// come from the same conversation
function convPeers(em, tk) {
  const out = new Set(), mids = String((em.inReplyTo || '') + ' ' + (em.references || '')).split(/\s+/).filter(Boolean), qs = E.quotedHistory(em.body || '');
  for (const o of St.emails.values()) {
    if ((tk && !/^x:/.test(tk) && o.threadKey === tk) || (o.messageId && mids.includes(o.messageId.trim())) || (em.gmailThread && o.gmailThread === em.gmailThread)
      || qs.some(q => q.date && q.date === (o.date || '').slice(0, 10) && (thMe(q.from) ? !!o.fromMe : convWho(q.from) === convWho(o.from)) && (!q.subject || convSubj(q.subject) === convSubj(o.subject)))) out.add(convOf(o.id));
  }
  return new Set([...out].flatMap(c => convEmails(c).map(x => x.id)));
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
    // the newest message of Claude's list is this email: its own header gives the exact date and sender
    if (h.length) h.forEach((x, i) => add(i === h.length - 1 ? { ...x, date: (em.date || '').slice(0, 10) || x.date, from: thName(em.from) || x.from, me: !!em.fromMe || thMe(x.from), emailId: em.id } : { ...x, me: thMe(x.from) }));
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
  const ems = threadEmails(e), ids = new Set(ems.map(x => x.id));
  const tasks = [...St.tasks.values()].filter(t => (t.emailIds || []).some(id => ids.has(id)));
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

/* --- on the canvas: one card per conversation under its topic, from the first email to the latest reply --- */
// A long conversation shows its first message, how many are in between, and the latest three; ▾ All opens it whole.
// A row opens that email; the card can be moved and resized like any box.
UI.thOpen = UI.thOpen || new Set();
function threadNodeHTML(n, st) {
  const ems = convEmails(n.conv); if (!ems.length) return '';
  const steps = threadSteps({ conv: n.conv }), opened = UI.thOpen.has(n.id), all = opened || (!n.compact && steps.length <= 6);
  const shown = all ? steps : n.compact ? [...(steps.length > 1 ? [{ gap: steps.length - 1 }] : []), steps[steps.length - 1]] : [steps[0], { gap: steps.length - 4 }, ...steps.slice(-3)];
  const first = steps.find(x => x.date), last = [...steps].reverse().find(x => x.date);
  const open = [...St.tasks.values()].filter(t => t.status !== 'done' && (t.emailIds || []).some(id => ems.some(e => e.id === id))).length;
  const drag = UI.cvTemp && UI.cvTemp.kind === 'node' && UI.cvTemp.id === n.id ? ' dragging' : '';
  const row = (x, i) => x.gap ? `<li class="thn-gap"><button data-map="th-all">⋯ ${x.gap} more message${x.gap > 1 ? 's' : ''}</button></li>`
    : `<li class="${x.me ? 'me' : ''}${x === steps[steps.length - 1] ? ' last' : ''}"><button class="thn-row" data-map="th-email" ${x.emailId ? `data-eid="${esc(x.emailId)}"` : ''} title="${esc(x.says || '')}"><span class="thn-i" aria-hidden="true">${x === steps[steps.length - 1] ? '📍' : TH_KIND[x.kind] || TH_KIND.info}</span><span class="thn-d">${x.date ? esc(fmtDate(x.date, { day: 'numeric', month: 'short' })) : '—'}</span><span class="thn-t" dir="auto"><b>${esc(x.me ? 'Me' : E.clip(x.from || 'Someone', 26))}</b> ${esc(E.clip(x.says || '', 90))}</span></button></li>`;
  return `<div class="mnode thread${n.compact && !opened ? ' compact' : ''}${drag}" data-node="${esc(n.id)}" data-type="thread" style="${st}">
    <div class="thn-h"><span class="thn-ic" aria-hidden="true">🧵</span><div class="thn-ht"><b dir="auto">${esc(E.clip(E.normSubject(ems[0].subject || '') || 'Email thread', 70))}</b><small>${steps.length} message${steps.length > 1 ? 's' : ''} · ${ems.length} added${first ? ` · ${esc(fmtDate(first.date, { day: 'numeric', month: 'short' }))}${last && last.date !== first.date ? ' → ' + esc(fmtDate(last.date, { day: 'numeric', month: 'short' })) : ''}` : ''}${open ? ` · ${open} open` : ''}</small></div>${steps.length > 6 || (n.compact && steps.length > 1) ? `<button class="mfocus" data-map="th-all" title="${all ? 'Show less' : 'Show the whole conversation'}">${all ? '▴' : '▾'}</button>` : ''}</div>
    <ol class="thn-list">${shown.map(row).join('')}</ol>
    <span class="rz" data-rz="${esc(n.id)}" data-kind="node" title="Drag to resize" aria-hidden="true"></span></div>`;
}
function threadNodeClick(node, btn) {
  const id = node.dataset.node;
  if (btn && btn.dataset.map === 'th-all') { UI.thOpen.has(id) ? UI.thOpen.delete(id) : UI.thOpen.add(id); render(); return; }
  const eid = btn && btn.dataset.eid; const cid = id.split(':').pop(), ems = convEmails(cid);
  const target = eid && St.emails.has(eid) ? eid : (ems[ems.length - 1] || {}).id;
  if (target) { UI.previews.clear(); openDrawer('email', target); }
}

/* --- emails added before this: read their quoted history once from the saved text, so they link up too --- */
HOOKS.ready.push(() => setTimeout(async () => {
  if (St.mode === 'viewer') return;
  const todo = [...St.emails.values()].filter(e => !Array.isArray(e.quoted) && e.hasText);
  for (const e of todo.slice(0, 200)) {
    const tx = await getTexts(e.id).catch(() => null);
    const cur = St.emails.get(e.id); if (!cur || Array.isArray(cur.quoted)) continue;
    putEmail({ ...cur, quoted: E.quotedHistory((tx && tx.body) || '') });
    await new Promise(r => setTimeout(r, 120));
  }
  if (todo.length) scheduleRender();
}, 1500));
