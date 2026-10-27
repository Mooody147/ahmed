/* ---------- Reply & Chase: Claude drafts the email, Gmail opens ready to send ---------- */
// On a task of mine that came from an email: ✉ Draft reply (to the person who asked, in the language they wrote in).
// On a task I am waiting on: 🔔 Chase (a short, polite follow-up to the person who owes it, listing what is still
// open). The draft opens in a panel to edit, change tone, copy, or open in Gmail with To, Subject and the message
// filled in. Nothing is sent from here. "I sent it" records it on the task (a reply can also complete the task).
// The canvas also shows who owes you a reply for 5+ days, with one tap to chase each. The desktop app has its own
// version of this (features/06-work.js), so this one only switches on where that is absent.
const RC = { d: null };
const rcOn = () => typeof draftMail !== 'function' && St.mode !== 'viewer';
const rcSince = t => { const h = (t.history || []).filter(x => /waiting/i.test(x.text)).pop(); return ((h && h.at) || t.askedOn || t.sourceDate || t.createdAt || nowISO()).slice(0, 10); };
const rcChased = t => { const h = (t.history || []).filter(x => /^Chased/.test(x.text)).pop(); return h ? h.at.slice(0, 10) : ''; };
const rcWho = t => (t.owner && !/^me$/i.test(t.owner) ? t.owner : t.requestedBy) || '';
function rcMail(t) { return (t.emailIds || []).map(id => St.emails.get(id)).filter(Boolean).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0] || null; }
function rcAddress(name) {
  const n = E.normMatch(name || ''); if (!n || n === 'me') return '';
  if (/@/.test(name)) return E.firstEmail(name);
  for (const e of St.emails.values()) for (const h of [e.from, e.to, e.cc]) for (const part of String(h || '').split(/[,;]/)) {
    const m = /<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?/.exec(part); if (!m) continue;
    const label = E.normMatch(part.replace(m[0], '')), local = E.normMatch(m[1].split('@')[0].replace(/[._-]+/g, ' '));
    if ((label && (label.includes(n) || n.includes(label))) || local === n || (n.split(' ')[0].length > 2 && local.startsWith(n.split(' ')[0]))) return m[1].toLowerCase();
  }
  return '';
}
// who owes me something: open waiting tasks, 5+ days, not chased in the last 3 days
function rcOverdue() {
  return [...St.tasks.values()].filter(t => t.status !== 'done' && (t.ownership === 'waiting' || t.status === 'waiting'))
    .filter(t => { const d = E.dayDiff(rcSince(t), T()), c = rcChased(t); return (d >= 5 || (t.deadline && t.deadline < T())) && (!c || E.dayDiff(c, T()) >= 3); })
    .sort((a, b) => rcSince(a).localeCompare(rcSince(b)));
}
function rcLocal(kind, t) {
  const me = (St.settings.me.name || '').split(' ')[0] || '', em = rcMail(t);
  const items = subsOf(t).filter(x => !x.done).slice(0, 8).map(x => '• ' + x.text).join('\n');
  const first = s => (s || '').replace(/<.*?>/g, '').trim().split(/\s+/)[0] || 'colleague';
  const base = ((em && em.subject) || t.title).replace(/^((re|fw|fwd)\s*:\s*)+/i, '');
  if (kind === 'chase') {
    const d = E.dayDiff(rcSince(t), T());
    return { subject: 'Follow-up: ' + base, body: `Dear ${first(rcWho(t))},\n\nI hope you are well. I am following up on “${t.title}”, open for ${d} day${d === 1 ? '' : 's'} now.${items ? `\n\nStill outstanding:\n${items}` : ''}\n\nCould you please let me know when we can expect it${t.deadline ? `, ideally by ${fmtDate(t.deadline, { weekday: 'long', day: 'numeric', month: 'long' })}` : ''}?\n\nBest regards,\n${me}` };
  }
  return { subject: 'RE: ' + base, body: `Dear ${first(t.requestedBy || (em && em.from))},\n\nThank you for your email regarding ${t.title}.${items ? `\n\n${items}` : ''}\n\n${t.nextStep ? t.nextStep + '\n\n' : ''}Best regards,\n${me}` };
}
async function rcDraft(kind, id, tone) {
  const t = St.tasks.get(id); if (!t) return;
  const em = rcMail(t);
  const to = kind === 'chase' ? rcAddress(rcWho(t)) : ((em && em.fromEmail) || rcAddress(t.requestedBy));
  const keep = RC.d && RC.d.id === id && RC.d.kind === kind ? RC.d : null;
  RC.d = { kind, id, tone: tone || (keep && keep.tone) || 'formal', to: keep ? keep.to : to, ...(keep && tone ? { subject: keep.subject, body: keep.body } : rcLocal(kind, t)), busy: !!St.sample, done: kind === 'reply' };
  rcModal();
  if (!St.sample) return;
  const ev = (t.evidence || [])[0];
  const prompt = `You write short, clear, professional emails for an engineer. Write a ${kind === 'chase' ? 'polite follow-up (chaser) asking for something that is overdue' : 'reply that answers the request below as far as the facts given allow'} from ${St.settings.me.name || 'me'}${St.settings.me.role ? ' (' + St.settings.me.role + ')' : ''}.
Tone: ${{ formal: 'formal and courteous', friendly: 'warm and friendly but professional', brief: 'very brief — 3 sentences at most' }[RC.d.tone]}.
TASK: ${t.title}
WHAT IS NEEDED: ${t.action || ''}
${kind === 'chase' ? `WAITING ON: ${rcWho(t)} for ${E.dayDiff(rcSince(t), T())} days` : `ASKED BY: ${t.requestedBy || (em && em.from) || ''}`}
PROJECT: ${t.project || ''} · DEADLINE: ${t.deadline || 'none'}
OPEN ITEMS:\n${subsOf(t).filter(x => !x.done).map(x => '- ' + x.text).join('\n') || '-'}
MY NOTES: ${t.notes || '-'}
ORIGINAL EMAIL SUBJECT: ${(em && em.subject) || '-'}
ORIGINAL EMAIL SUMMARY: ${(em && em.analysis && em.analysis.summary) || '-'}
QUOTE FROM IT: ${ev ? ev.quote : '-'}
Write in the language of the quote (Arabic stays Arabic). Never invent facts, numbers, dates or attachments — where an answer needs information that is not given, leave a clear [placeholder]. Under 150 words. Sign with my first name.
Reply with JSON only: {"subject":"…","body":"…"}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    if (RC.d && RC.d.id === id && r && typeof r.body === 'string' && r.body.trim()) Object.assign(RC.d, { subject: String(r.subject || RC.d.subject), body: r.body });
  } catch { /* the local draft stays */ }
  if (RC.d && RC.d.id === id) { RC.d.busy = false; rcModal(); }
}
const rcGmailUrl = d => `https://mail.google.com/mail/?view=cm&fs=1${d.to ? '&to=' + encodeURIComponent(d.to) : ''}&su=${encodeURIComponent(d.subject || '')}&body=${encodeURIComponent(d.body || '')}`;
function rcRead() { const v = id => ($('#' + id) || {}).value; if (!RC.d) return; const to = v('rc-to'), su = v('rc-sub'), bo = v('rc-body'); if (to !== undefined) RC.d.to = to; if (su !== undefined) RC.d.subject = su; if (bo !== undefined) RC.d.body = bo; }
function rcModal() {
  const d = RC.d, m = $('#modal'); if (!d || !m) return;
  const t = St.tasks.get(d.id);
  m.innerHTML = deco(`<div class="card pad mail-draft rc" role="dialog" aria-label="Email draft">
    <div class="row"><b>${d.kind === 'chase' ? '🔔 Chase' : '✉ Reply'}</b><span class="small muted" dir="auto">${esc(t ? t.ref + ' · ' + t.title : '')}</span><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <div class="row"><div class="seg" role="group" aria-label="Tone">${[['formal', 'Formal'], ['friendly', 'Friendly'], ['brief', 'Brief']].map(([k, l]) => `<button data-act="rc-tone" data-tone="${k}" aria-pressed="${d.tone === k}" ${d.busy ? 'disabled' : ''}>${l}</button>`).join('')}</div>${d.busy ? '<span class="small muted">✨ Claude is writing it…</span>' : ''}</div>
    <label class="field"><span>To</span><input class="input" id="rc-to" value="${esc(d.to || '')}" placeholder="name@company.com"></label>
    <label class="field"><span>Subject</span><input class="input" id="rc-sub" dir="auto" value="${esc(d.subject)}"></label>
    <label class="field"><span>Message</span><textarea class="input" id="rc-body" dir="auto" rows="11">${esc(d.body)}</textarea></label>
    ${d.kind === 'reply' ? `<label class="check small"><input type="checkbox" id="rc-done" ${d.done ? 'checked' : ''}>This reply completes the task</label>` : ''}
    <div class="row end"><span class="small muted mail-note">Nothing is sent from here.</span><button class="btn" data-act="rc-copy">Copy</button><a class="btn" id="rc-gmail" href="${esc(rcGmailUrl(d))}" target="_blank" rel="noopener" data-act="rc-open">Open in Gmail</a><button class="btn primary" data-act="rc-sent">I sent it</button></div></div>`);
  m.hidden = false;
}
document.addEventListener('input', e => { if (!RC.d || !e.target.closest || !e.target.closest('.rc')) return; rcRead(); const a = $('#rc-gmail'); if (a) a.href = rcGmailUrl(RC.d); });
TASK_ACTIONS.push(t => {
  if (!rcOn() || t.status === 'done') return '';
  if (t.ownership === 'waiting' || t.status === 'waiting') return `<button class="btn sm ghost" data-act="rc-draft" data-kind="chase" data-id="${esc(t.id)}">🔔 Chase ${esc(E.clip(rcWho(t).split(' ')[0] || '', 18))}</button>`;
  return isMine(t) && (t.emailIds || []).length ? `<button class="btn sm ghost" data-act="rc-draft" data-kind="reply" data-id="${esc(t.id)}">✉ Draft reply</button>` : '';
});
function chaseCallout() {
  if (!rcOn()) return '';
  const list = rcOverdue(); if (!list.length) return '';
  const who = [...new Set(list.map(t => rcWho(t).split(' ')[0] || 'Someone'))];
  return callout('info', `<div class="row"><span>🔔 ${who.slice(0, 3).map(esc).join(', ')}${who.length > 3 ? ` +${who.length - 3}` : ''} ${list.length === 1 ? 'owes' : 'owe'} you <b>${list.length}</b> repl${list.length === 1 ? 'y' : 'ies'} for 5+ days.</span><span class="spacer"></span><button class="btn sm primary" data-act="rc-list">Chase</button></div>`);
}
DRAWER_FN.chase = () => {
  const list = rcOverdue();
  return `<div class="drawer-h"><b>🔔 Who owes you a reply</b><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:10px">${list.length ? list.map(t => { const d = E.dayDiff(rcSince(t), T()), c = rcChased(t); return `<div class="card pad" style="display:grid;gap:4px">
    <div class="row"><b dir="auto">${esc(rcWho(t) || 'Someone')}</b><span class="spacer"></span><span class="chip warn">${d} day${d === 1 ? '' : 's'}</span></div>
    <button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto" style="text-align:start">${esc(t.title)}</button>
    <span class="small muted"><span class="mono">${esc(t.ref || '')}</span>${t.deadline ? ' · due ' + esc(fmtDate(t.deadline)) : ''}${c ? ' · last chased ' + esc(fmtDate(c)) : ''}</span>
    <div class="row"><button class="btn sm primary" data-act="rc-draft" data-kind="chase" data-id="${esc(t.id)}">🔔 Draft a chaser</button></div></div>`; }).join('') : '<p class="muted">Nobody is late with a reply. 🎉</p>'}</div>`;
};
Object.assign(ACT, {
  'rc-draft': el => { $('#drawer') && UI.drawer && UI.drawer.kind === 'chase' && closeDrawer(); rcDraft(el.dataset.kind, el.dataset.id); },
  'rc-tone': el => { rcRead(); rcDraft(RC.d.kind, RC.d.id, el.dataset.tone); },
  'rc-list': () => openDrawer('chase', 'all'),
  'rc-copy': async () => { rcRead(); try { await navigator.clipboard.writeText(`${RC.d.subject}\n\n${RC.d.body}`); toast('Copied — paste it into your email.'); } catch { const ta = $('#rc-body'); if (ta) { ta.select(); document.execCommand('copy'); toast('Copied.'); } } },
  'rc-open': () => { rcRead(); },
  'rc-sent': () => {
    rcRead(); const d = RC.d; const t0 = d && St.tasks.get(d.id); if (!t0) return;
    const t = clone(t0), now = nowISO(), done = d.kind === 'reply' && ($('#rc-done') || {}).checked;
    (t.history = t.history || []).push({ at: now, text: d.kind === 'chase' ? `Chased ${rcWho(t) || 'them'} by email${d.to ? ' (' + d.to + ')' : ''}` : `Replied by email${d.to ? ' to ' + d.to : ''}${done ? ' — task completed' : ''}` });
    if (done) { t.status = 'done'; t.completedAt = now; }
    t.updatedAt = now; cvApply({ tasks: { [t.id]: t } });
    $('#modal').hidden = true; RC.d = null; render(); if (UI.drawer && UI.drawer.kind === 'task') renderDrawer();
    toast(d.kind === 'chase' ? '🔔 Chase recorded on the task.' : done ? '✓ Reply recorded and the task is done.' : '✉ Reply recorded on the task.', { action: 'Undo', fn: cvUndo });
  },
});
