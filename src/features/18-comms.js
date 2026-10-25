/* ---------- Communication: send from Gmail, weekly report by email, WhatsApp / Teams chats → tasks, writing helper (translate, tone), letters and method statements, thread summary, reminders and snooze ---------- */
const gmailSt = () => (DESKTOP && DK.status().gmail) || {};
const mailCanSend = () => DESKTOP && !!gmailSt().connected;

/* --- send the draft (chaser / reply) from the connected Gmail --- */
Object.assign(ACT, {
  'mail-send': async () => {
    const f = mailFields(); if (!f.to.trim()) return toast('Add the recipient.', { err: true });
    const btn = $('[data-act="mail-send"]'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      await DK.call('mail:send', { to: f.to, subject: f.subject, text: f.body });
      const d = UI.mail; markChased();
      if (d && d.id && St.tasks.has(d.id) && d.kind !== 'chase') { const t = clone(St.tasks.get(d.id)); (t.history = t.history || []).push({ at: nowISO(), text: `Email sent to ${f.to}` }); putTask(t); }
      $('#modal').hidden = true; toast(`Sent to ${f.to}.`); render();
    } catch (e) { toast('Not sent: ' + (e.message || e.code), { err: true }); if (btn) { btn.disabled = false; btn.textContent = 'Send from Gmail'; } }
  },
});

/* --- weekly report by email --- */
const commPrefs = () => ({ weekly: { on: false, day: 4, time: '15:00', to: '', cc: '', kind: 'progress', attach: true, last: '' }, ...(St.cols.prefs.get('comms') || {}) });
const commSave = mut => { const p = clone(commPrefs()); mut(p); colPut('prefs', { ...p, id: 'comms' }); };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function weeklyHTML() {
  if (!DESKTOP) return '';
  const w = commPrefs().weekly, can = mailCanSend();
  return `<section class="card pad set-sec" id="set-weekly" data-sec="Weekly report email" style="display:grid;gap:10px"><div class="section-title"><h2>Weekly report by email</h2></div>
    <p class="small muted" style="margin:0">Every week the app writes your progress report (done, in progress, waiting on others, next week) and emails it from your Gmail, with the Word file attached. The app must be open or in the tray at that time; if it was closed it sends at the next start that week.</p>
    ${can ? '' : callout('warn', '<p>Connect Gmail in Setup › Connections first — the report is sent from that address.</p>')}
    <label class="check"><input type="checkbox" data-chg="wk-f" data-k="on" ${w.on ? 'checked' : ''} ${can ? '' : 'disabled'}>Send my weekly report automatically</label>
    <div class="grid2">
      <label class="field"><span>Day</span><select class="input" data-chg="wk-f" data-k="day">${DAYS.map((d, i) => `<option value="${i}" ${+w.day === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
      <label class="field"><span>Time</span><input class="input hold-render" type="time" value="${esc(w.time)}" data-chg="wk-f" data-k="time"></label>
      <label class="field"><span>To (your manager)</span><input class="input hold-render" type="email" value="${esc(w.to)}" data-chg="wk-f" data-k="to" placeholder="manager@company.com"></label>
      <label class="field"><span>Cc</span><input class="input hold-render" value="${esc(w.cc)}" data-chg="wk-f" data-k="cc"></label>
      <label class="field"><span>Report</span><select class="input" data-chg="wk-f" data-k="kind">${[['progress', 'Weekly progress report'], ['waiting', 'Waiting on others'], ['handover', 'Hand-over pack']].map(([k, l]) => `<option value="${k}" ${w.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="check small" style="align-self:end"><input type="checkbox" data-chg="wk-f" data-k="attach" ${w.attach ? 'checked' : ''}>Attach the Word file</label>
    </div>
    <div class="row"><span class="small muted">${w.last ? 'Last sent ' + esc(fmtDateTime(w.last)) : 'Not sent yet'}</span><span class="spacer"></span><button class="btn sm" data-act="wk-send" ${can && w.to ? '' : 'disabled'}>Send this week's report now</button></div></section>`;
}
Object.assign(CHG, { 'wk-f': el => { commSave(p => { const k = el.dataset.k; p.weekly[k] = el.type === 'checkbox' ? el.checked : k === 'day' ? +el.value : el.value.trim(); }); if (el.type === 'checkbox' || el.tagName === 'SELECT') render(); } });
// the time this week's report is due (local time), counting the week from the configured day
function weeklySlot(w, now = new Date()) {
  const [hh, mm] = String(w.time || '15:00').split(':').map(Number), d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() - +w.day + 7) % 7)); d.setHours(hh || 0, mm || 0, 0, 0);
  return d;
}
async function weeklySend(manual) {
  const p = commPrefs(), w = p.weekly; if (!w.to) throw { message: 'Add the address to send to.' };
  const [a, b] = periodRange('week'), R = reportModel(w.kind || 'progress', a, b, '');
  const { title } = reportTitle(R);
  const attachments = w.attach ? [{ filename: `${title.replace(/[\\/:*?"<>|]+/g, '-')}.docx`, content: new Uint8Array(await (await reportDocx(R)).arrayBuffer()) }] : [];
  const text = `${reportText(R)}\n\n—\nSent from Action Register${manual ? '' : ' (weekly report)'}`;
  await DK.call('mail:send', { to: w.to, cc: w.cc, subject: `${title} — ${St.settings.me.name || ''}`.trim(), text, attachments });
  commSave(x => { x.weekly.last = nowISO(); });
}
async function weeklyTick() {
  if (!DESKTOP || SUBWIN || !St.ready || !mailCanSend()) return;
  const w = commPrefs().weekly; if (!w.on || !w.to) return;
  const slot = weeklySlot(w); if (Date.now() < slot.getTime()) return;
  if (w.last && Date.parse(w.last) >= slot.getTime()) return;
  try { await weeklySend(false); toast(`Weekly report sent to ${w.to}.`); }
  catch (e) { commSave(x => { x.weekly.lastError = String(e.message || e.code); }); }
}
Object.assign(ACT, { 'wk-send': async () => { try { await weeklySend(true); toast('Report sent.'); render(); } catch (e) { toast('Not sent: ' + (e.message || e.code), { err: true }); } } });

/* --- reminders and snooze for a task --- */
TASK_ACTIONS.push(t => t.status === 'done' ? '' : `<span class="row remind-pick"><select class="input" data-chg="t-remind" aria-label="Remind me"><option value="">⏰ Remind me…</option><option value="1">Tomorrow</option><option value="3">In 3 days</option><option value="7">Next week</option>${t.remindAt ? '<option value="off">No reminder</option>' : ''}</select><select class="input" data-chg="t-snooze" aria-label="Snooze"><option value="">💤 Snooze…</option><option value="1">Until tomorrow</option><option value="7">For a week</option><option value="mon">Until next week</option>${t.snoozeUntil ? '<option value="off">Wake up now</option>' : ''}</select>${t.remindAt ? `<span class="chip" title="Reminder">⏰ ${esc(fmtDate(t.remindAt))}</span>` : ''}${t.snoozeUntil && t.snoozeUntil > T() ? `<span class="chip">💤 until ${esc(fmtDate(t.snoozeUntil))}</span>` : ''}</span>`);
function taskPatch(id, patch, note) { const t = clone(St.tasks.get(id)); if (!t) return; Object.assign(t, patch); if (note) (t.history = t.history || []).push({ at: nowISO(), text: note }); putTask(t); render(); }
Object.assign(CHG, {
  't-remind': el => { const id = UI.drawer && UI.drawer.id, v = el.value; if (!id || !v) return; if (v === 'off') return taskPatch(id, { remindAt: null }, 'Reminder removed'); const d = E.addDays(T(), +v); taskPatch(id, { remindAt: d, reminded: false }, `Reminder set for ${fmtDate(d)}`); toast(`I'll remind you on ${fmtDate(d)}.`); },
  't-snooze': el => { const id = UI.drawer && UI.drawer.id, v = el.value; if (!id || !v) return; if (v === 'off') return taskPatch(id, { snoozeUntil: null }, 'Woken up'); const d = v === 'mon' ? weekStart(E.addDays(T(), 7)) : E.addDays(T(), +v); taskPatch(id, { snoozeUntil: d }, `Snoozed until ${fmtDate(d)}`); toast(`Snoozed until ${fmtDate(d)} — it comes back on the to-do list then.`); },
});
Object.assign(ACT, { 'toggle-snoozed': () => { UI.showSnoozed = !UI.showSnoozed; render(); } });
function remindTick() {
  if (!St.ready || SUBWIN) return;
  for (const t of St.tasks.values()) {
    if (!t.remindAt || t.reminded || t.status === 'done' || t.remindAt > T()) continue;
    taskPatch(t.id, { reminded: true });
    const msg = `${t.ownership === 'waiting' ? 'Follow up' : 'Reminder'}: ${t.title}`;
    toast(msg, { action: 'Open', fn: () => openDrawer('task', t.id) });
    if (DESKTOP) DK.call('sys:notify', { title: 'Action Register', body: msg, id: t.id }).catch(() => {});
  }
}
setInterval(() => { remindTick(); weeklyTick(); }, 5 * 60000);
HOOKS.ready.push(() => setTimeout(() => { remindTick(); weeklyTick(); }, 4000));

/* --- Tools › Chats & writing --- */
TOOL_TABS.push(['chats', '💬 Chats & writing'], ['letters', '✉️ Letters & method statements']);
Object.assign(TOOL_FN, { chats: () => chatsHTML(), letters: () => lettersHTML() });
UI.chat = UI.chat || { msgs: null, name: '', since: E.addDays(T(), -14) };
UI.wr = UI.wr || { text: '', out: '', busy: false };

// WhatsApp "Export chat" (Android and iPhone, 24 h or AM/PM) and pasted Teams conversations
const WA_LINE = /^‎?\[?(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}),?\s+(\d{1,2}:\d{2})(?::\d{2})?\s?([AaPp]\.?\s?[Mm]\.?)?\]?\s?(?:[-–]\s)?([^:\n]{1,60}?):\s([\s\S]*)$/;
function parseChat(text) {
  const lines = AR_DIGITS(String(text).replace(/\r/g, '')).split('\n');
  const raw = []; let cur = null;
  for (const l of lines) {
    const m = WA_LINE.exec(l);
    if (m) { cur = { d: m[1], t: m[2], ap: m[3] || '', who: m[4].replace(/^‎|‎$/g, '').trim(), text: m[5] }; raw.push(cur); }
    else if (cur && l.trim()) cur.text += '\n' + l;
  }
  if (!raw.length) return null;
  const order = monDateOrder(raw.map(x => x.d));
  return raw.map(x => {
    let [h, mi] = x.t.split(':').map(Number); const pm = /p/i.test(x.ap); if (x.ap) { if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
    return { date: monDate(x.d, order), time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, who: x.who, text: x.text.replace(/‎/g, '').trim() };
  }).filter(x => x.date && x.text && !/^(<Media omitted>|<attached:|image omitted|video omitted|This message was deleted|تم حذف هذه الرسالة)/i.test(x.text));
}
function chatsHTML() {
  const C = UI.chat, W = UI.wr;
  const msgs = C.msgs ? C.msgs.filter(m => m.date >= C.since) : null;
  const people = msgs ? [...new Set(msgs.map(m => m.who))] : [];
  return `<section class="card pad"><div class="section-title"><h2>WhatsApp or Teams chat → tasks</h2></div>
      <p class="small muted" style="margin:0">WhatsApp: open the chat › ⋮ › More › <b>Export chat</b> (without media) and save the .txt or .zip here. Teams: select the messages, copy and paste them below. The AI reads the chat like an email and proposes tasks for your review.</p>
      <div class="row"><label class="btn" for="chat-file">${I.upload} Choose exported chat</label><input id="chat-file" type="file" accept=".txt,.zip" hidden data-chg="chat-file"><span class="small muted">or paste:</span></div>
      <textarea class="input hold-render" id="chat-paste" rows="4" placeholder="Paste a Teams or WhatsApp conversation" dir="auto"></textarea>
      <div class="row"><button class="btn sm" data-act="chat-read">Read pasted text</button></div>
      ${msgs ? `<div class="grid2"><label class="field"><span>Chat name</span><input class="input hold-render" id="chat-name" value="${esc(C.name)}" dir="auto"></label><label class="field"><span>Messages since</span><input class="input" type="date" value="${esc(C.since)}" data-chg="chat-since"></label></div>
        <p class="small">${msgs.length} message${msgs.length === 1 ? '' : 's'} from ${people.length} people (${esc(people.slice(0, 6).join(', '))}${people.length > 6 ? '…' : ''})${C.msgs.length > msgs.length ? ` · ${C.msgs.length - msgs.length} older ones left out` : ''}.</p>
        <div class="chat-preview">${msgs.slice(-30).map(m => `<div class="small" dir="auto"><span class="muted">${esc(m.date)} ${esc(m.time)}</span> <b>${esc(m.who)}</b>: ${esc(E.clip(m.text, 200))}</div>`).join('')}</div>
        <div class="row end"><button class="btn primary" data-act="chat-stage" ${msgs.length ? '' : 'disabled'}>Analyse for tasks</button></div>` : ''}
    </section>
    <section class="card pad"><div class="section-title"><h2>Writing helper</h2></div>
      <p class="small muted" style="margin:0">Translate between Arabic and English, change the tone of an email, shorten it, or fix the grammar — numbers, document numbers and names are kept exactly.</p>
      <textarea class="input hold-render" id="wr-in" rows="7" dir="auto" placeholder="Paste the text">${esc(W.text)}</textarea>
      <div class="row wrap-btns">${[['en', '🇬🇧 To English'], ['ar', '🇪🇬 To Arabic'], ['polite', '🙂 More polite'], ['firm', '🧱 Firmer'], ['formal', '👔 More formal'], ['short', '✂️ Shorter'], ['fix', '✔️ Fix grammar'], ['bullets', '• As bullet points']].map(([k, l]) => `<button class="btn sm" data-act="wr-go" data-k="${k}" ${St.sample && !W.busy ? '' : 'disabled'}>${l}</button>`).join('')}</div>
      ${St.sample ? '' : '<p class="small muted">Needs an AI (Setup › Which AI).</p>'}
      ${W.busy ? '<div class="progress indet" style="width:120px"><i></i></div>' : ''}
      ${W.out ? `<div class="wr-out" dir="auto">${esc(W.out)}</div><div class="row"><button class="btn sm" data-act="wr-copy">Copy</button><button class="btn sm ghost" data-act="wr-use">Use as input</button></div>` : ''}
    </section>`;
}
async function chatLoad(name, text) {
  const msgs = parseChat(text);
  if (msgs && msgs.length) { UI.chat.msgs = msgs; }
  else { // not a WhatsApp export (e.g. Teams): keep it as one block of conversation
    UI.chat.msgs = [{ date: T(), time: '', who: 'Conversation', text: String(text).trim() }];
  }
  UI.chat.name = name.replace(/\.(txt|zip)$/i, '').replace(/^WhatsApp Chat (with|-)\s*/i, '').replace(/^محادثة واتساب مع\s*/, '') || 'Chat';
  if (msgs && msgs.length) { const first = msgs.find(m => m.date >= E.addDays(T(), -14)); UI.chat.since = first ? E.addDays(T(), -14) : msgs[Math.max(0, msgs.length - 200)].date; }
  render();
}
Object.assign(CHG, {
  'chat-file': async el => {
    const f = el.files[0]; if (!f) return;
    let text = '';
    if (/\.zip$/i.test(f.name)) { const Z = await E.need('jszip'); const z = await Z.loadAsync(await f.arrayBuffer()); const t = Object.values(z.files).find(x => /\.txt$/i.test(x.name)); if (!t) return toast('No chat text found in the .zip.', { err: true }); text = await t.async('string'); }
    else text = await f.text();
    chatLoad(f.name, text);
  },
  'chat-since': el => { UI.chat.since = el.value || UI.chat.since; render(); },
});
Object.assign(ACT, {
  'chat-read': () => { const t = (($('#chat-paste') || {}).value || '').trim(); if (!t) return toast('Paste the conversation first.', { err: true }); chatLoad('Pasted chat', t); },
  'chat-stage': () => {
    const C = UI.chat, msgs = C.msgs.filter(m => m.date >= C.since); C.name = (($('#chat-name') || {}).value || C.name).trim();
    const people = [...new Set(msgs.map(m => m.who))], last = msgs[msgs.length - 1];
    const body = `Chat “${C.name}” (${msgs.length} messages, ${fmtDate(msgs[0].date)} – ${fmtDate(last.date)}). Each line is date time — sender: message.\n\n` + msgs.map(m => `${m.date} ${m.time} — ${m.who}: ${m.text}`).join('\n');
    const em = { subject: `Chat: ${C.name}`, from: people.slice(0, 4).join(', '), fromEmail: '', to: St.settings.me.name || '', cc: '', date: `${last.date}T${last.time || '12:00'}:00`, body, attachments: [], warnings: [] };
    const b = newBundle(em, 'paste', `${C.name} (chat)`); UI.staging.push(b);
    UI.chat = { msgs: null, name: '', since: E.addDays(T(), -14) };
    checkDuplicateEmail(b); extractPending(); go('import'); toast('Chat added — press Analyse to get the tasks.');
  },
  'wr-go': async el => {
    const W = UI.wr; W.text = (($('#wr-in') || {}).value || '').trim(); if (!W.text) return toast('Paste the text first.', { err: true });
    const ask = { en: 'Translate it into clear professional English.', ar: 'Translate it into clear professional Arabic (Modern Standard Arabic as used in Egyptian engineering correspondence).', polite: 'Make it more polite and friendly, same meaning.', firm: 'Make it firmer and more direct, still professional (no rudeness).', formal: 'Make it more formal, suitable for a letter to a consultant or client.', short: 'Make it about half as long, keeping every request, number and date.', fix: 'Fix grammar, spelling and punctuation only; keep the wording otherwise.', bullets: 'Rewrite it as short bullet points, one per request or fact.' }[el.dataset.k];
    W.busy = true; render();
    try { const r = await St.sample.json(`Rewrite the text below. ${ask} Keep numbers, units, dates, document numbers, tags and names exactly as written. Reply JSON: {"text": "the rewritten text"}\n\nTEXT:\n${W.text}`, { modelTier: 'quick' }); W.out = String((r && r.text) || ''); }
    catch (e) { toast('Failed: ' + (e.message || e.code), { err: true }); }
    W.busy = false; render();
  },
  'wr-copy': () => navigator.clipboard.writeText(UI.wr.out).then(() => toast('Copied.')),
  'wr-use': () => { UI.wr.text = UI.wr.out; UI.wr.out = ''; render(); },
});

/* --- letters, method statements, delay notices (Word, with a running reference) --- */
const LETTERS = {
  letter: { label: 'Letter to the consultant / client', fields: [['to', 'To (company, person)'], ['subject', 'Subject'], ['points', 'What the letter must say (one point per line)', 6]], sections: ['Body'] },
  ms: { label: 'Method statement', fields: [['subject', 'Activity (e.g. installation of RAS pumps P-101A/B)'], ['location', 'Location / area'], ['points', 'Key steps, equipment, crew and hazards you know (one per line)', 7]], sections: ['Scope', 'References', 'Resources: manpower, plant and tools', 'Sequence of work', 'Health, safety and environment (hazards and controls)', 'Quality control and inspection', 'Responsibilities'] },
  delay: { label: 'Delay notice / extension of time request', fields: [['to', 'To (company, person)'], ['subject', 'Event (e.g. late approval of pump datasheets)'], ['points', 'Facts: dates, cause, affected activities, days of delay (one per line)', 6]], sections: ['The event', 'Cause and responsibility', 'Effect on the programme', 'Request', 'Mitigation'] },
  inspect: { label: 'Inspection request (IR / WIR)', fields: [['to', 'To (consultant)'], ['subject', 'Item to inspect (e.g. pump base anchor bolts before grouting)'], ['location', 'Location and date / time proposed'], ['points', 'Checks and references (drawings, ITP step) — one per line', 5]], sections: ['Item and location', 'Checks requested', 'References', 'Attachments'] },
};
UI.lt = UI.lt || { kind: 'letter', v: {}, draft: null, busy: false };
function lettersHTML() {
  const L = UI.lt, def = LETTERS[L.kind];
  return `<div class="seg">${Object.entries(LETTERS).map(([k, x]) => `<button data-act="lt-kind" data-k="${k}" aria-pressed="${L.kind === k}">${esc(x.label)}</button>`).join('')}</div>
    <section class="card pad tr-form"><div class="grid2">
      <label class="field"><span>Project</span><input class="input hold-render" id="lt-project" list="pr-projs" value="${esc(L.v.project || projectsList()[0] || '')}"></label>
      <label class="field"><span>Reference</span><input class="input hold-render mono" id="lt-ref" value="${esc(L.v.ref || '')}" placeholder="filled in automatically"></label>
      ${def.fields.map(([k, l, rows]) => rows ? `<label class="field" style="grid-column:1/-1"><span>${esc(l)}</span><textarea class="input hold-render" id="lt-${k}" rows="${rows}" dir="auto">${esc(L.v[k] || '')}</textarea></label>` : `<label class="field"><span>${esc(l)}</span><input class="input hold-render" id="lt-${k}" value="${esc(L.v[k] || '')}" dir="auto"></label>`).join('')}
      <label class="field"><span>Language</span><select class="input" id="lt-lang"><option value="en" ${L.v.lang !== 'ar' ? 'selected' : ''}>English</option><option value="ar" ${L.v.lang === 'ar' ? 'selected' : ''}>Arabic</option></select></label>
    </div>
    <div class="row end">${St.sample ? `<button class="btn" data-act="lt-draft" ${L.busy ? 'disabled' : ''}>${L.busy ? 'Drafting…' : '✨ Draft with AI'}</button>` : ''}<button class="btn primary" data-act="lt-word" ${L.busy ? 'disabled' : ''}>📄 Word document</button></div>
    ${L.draft ? `<div class="label">Draft — edit before saving</div>${L.draft.map((s, i) => `<label class="field"><span>${esc(s.h)}</span><textarea class="input hold-render lt-sec" data-i="${i}" rows="${Math.min(12, 2 + Math.ceil(s.text.length / 90))}" dir="auto">${esc(s.text)}</textarea></label>`).join('')}` : ''}
    </section><datalist id="pr-projs">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
}
function ltRead() { const L = UI.lt, v = id => (($('#' + id) || {}).value || '').trim(); for (const k of ['project', 'ref', 'to', 'subject', 'location', 'points', 'lang']) { const x = $('#lt-' + k); if (x) L.v[k] = v('lt-' + k); } if (L.draft) document.querySelectorAll('.lt-sec').forEach(t => { L.draft[+t.dataset.i].text = t.value; }); return L; }
Object.assign(ACT, {
  'lt-kind': el => { ltRead(); UI.lt.kind = el.dataset.k; UI.lt.draft = null; render(); },
  'lt-draft': async () => {
    const L = ltRead(), def = LETTERS[L.kind]; L.busy = true; render();
    try {
      const r = await St.sample.json(`Draft a formal engineering document: ${def.label}. Language: ${L.v.lang === 'ar' ? 'Arabic' : 'English'}. Writer: ${St.settings.me.name || ''}${St.settings.me.role ? ', ' + St.settings.me.role : ''}${St.settings.me.org ? ', ' + St.settings.me.org : ''}. Project: ${L.v.project || ''}. ${L.v.to ? 'Addressed to: ' + L.v.to + '. ' : ''}Subject: ${L.v.subject || ''}. ${L.v.location ? 'Location: ' + L.v.location + '. ' : ''}
Use only the facts given below; where something is missing write [to be confirmed] instead of inventing it. Keep numbers, dates, tags and document numbers exactly.
FACTS:
${L.v.points || ''}
Reply JSON: {"sections": [${def.sections.map(s => `{"h": "${s}", "text": "…"}`).join(', ')}]}`, { modelTier: 'default' });
      L.draft = ((r && r.sections) || []).map(s => ({ h: String(s.h || ''), text: String(s.text || '') }));
    } catch (e) { toast('Draft failed: ' + (e.message || e.code), { err: true }); }
    L.busy = false; render();
  },
  'lt-word': async () => {
    const L = ltRead(), def = LETTERS[L.kind], me = St.settings.me;
    const code = { letter: 'LTR', ms: 'MS', delay: 'NOD', inspect: 'IR' }[L.kind];
    const pre = `${(L.v.project || 'PRJ').replace(/[^\w]+/g, '').slice(0, 8).toUpperCase() || 'PRJ'}-${code}-`;
    const n = colList('eng').filter(x => (x.no || '').startsWith(pre)).reduce((m, x) => Math.max(m, +x.no.slice(pre.length) || 0), 0);
    const ref = L.v.ref || pre + String(n + 1).padStart(3, '0');
    const secs = L.draft || def.sections.map((h, i) => ({ h, text: i === 0 ? (L.v.points || '') : '' }));
    const head = [['Project', L.v.project || ''], ['Reference', ref], ['Date', fmtDate(T(), { day: 'numeric', month: 'long', year: 'numeric' })], ...(L.v.to ? [['To', L.v.to]] : []), ['From', [me.name, me.role, me.org].filter(Boolean).join(', ')], ...(L.v.location ? [['Location', L.v.location]] : [])];
    const blob = await docxDoc(`${def.label}${L.v.subject ? ': ' + L.v.subject : ''}`, ref, [{ table: { head: ['', ''], rows: head } }, ...secs.map(s => ({ h: s.h, p: s.text.split('\n') })), { h: 'Signature', table: { head: ['Prepared by', 'Reviewed by', 'Approved by'], rows: [[me.name || '', '', '']] } }]);
    colPut('eng', { id: E.uid('en'), kind: L.kind, no: ref, date: T(), project: L.v.project, to: L.v.to, subj: L.v.subject, createdAt: nowISO() });
    await offerFile(`${ref}.docx`, blob);
    UI.lt = { kind: L.kind, v: { project: L.v.project, lang: L.v.lang }, draft: null, busy: false }; render();
  },
});

/* --- email drawer: summary of the whole thread --- */
function threadBtn(e) { return St.sample ? `<button class="btn ghost sm" data-act="thread-sum" data-id="${esc(e.id)}">🧵 Summarise the thread</button>` : ''; }
Object.assign(ACT, {
  'thread-sum': async el => {
    const e = St.emails.get(el.dataset.id); if (!e) return;
    const thread = [...St.emails.values()].filter(x => x.threadKey && x.threadKey === e.threadKey).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const list = thread.length ? thread : [e];
    const m = $('#modal'); m.innerHTML = deco(`<div class="card pad share-modal"><div class="row"><b>Thread: ${esc(E.clip(e.subject, 70))}</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div><div class="progress indet" style="width:120px"><i></i></div><p class="small muted">Reading ${list.length} email${list.length > 1 ? 's' : ''}…</p></div>`); m.hidden = false;
    const parts = [];
    for (const x of list) { const tx = await getTexts(x.id).catch(() => null); parts.push(`--- ${x.date || ''} — ${x.from || ''}\nSubject: ${x.subject || ''}\n${E.clip((tx && tx.body) || x.snippet || '', 6000)}`); }
    try {
      const r = await St.sample.json(`Summarise this email thread for a busy engineer. Reply JSON: {"summary": "3–5 sentences", "decisions": ["…"], "open": ["questions or actions still open, with who owns them"], "next": "the single next step for the user"}\n\n${parts.join('\n\n')}`, { modelTier: 'quick' });
      const li = a => (a || []).length ? `<ul>${a.map(x => `<li dir="auto">${esc(x)}</li>`).join('')}</ul>` : '<p class="small muted">None.</p>';
      UI.threadSum = r;
      m.innerHTML = deco(`<div class="card pad share-modal"><div class="row"><b>Thread: ${esc(E.clip(e.subject, 70))}</b><span class="small muted">${list.length} emails</span><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
        <p dir="auto">${esc(r.summary || '')}</p><div class="label">Decisions</div>${li(r.decisions)}<div class="label">Still open</div>${li(r.open)}${r.next ? `<p><b>Next step:</b> <span dir="auto">${esc(r.next)}</span></p>` : ''}
        <div class="row end"><button class="btn" data-act="thread-copy">Copy</button></div></div>`);
    } catch (err) { m.innerHTML = deco(`<div class="card pad share-modal"><div class="row"><b>Thread summary</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>${callout('crit', `<p>${esc(err.message || err.code)}</p>`)}</div>`); }
  },
  'thread-copy': () => { const r = UI.threadSum || {}; navigator.clipboard.writeText([r.summary, '', 'Decisions:', ...(r.decisions || []).map(x => '• ' + x), '', 'Still open:', ...(r.open || []).map(x => '• ' + x), '', r.next ? 'Next step: ' + r.next : ''].join('\n')).then(() => toast('Copied.')); },
});
