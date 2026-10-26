/* ---------- where tasks belong: Claude always places them, and learns from where you move them ---------- */
// Claude puts every task in its best project and topic. When it was not sure, the other places it considered are
// kept on the task ("Wrong place?" in the task panel) instead of asking first. Moving a task — in the task panel or
// by dragging it on the canvas — is remembered and given to Claude with the next emails, so it learns your projects.
/* --- learn from corrections: when you change what Claude chose, later analyses are told --- */
const LEARN_FIELDS = ['project', 'priority', 'ownership', 'topic', 'discipline'];
const learned = () => ((St.cols.prefs.get('learned') || {}).items || []);
const senderKey = em => { const a = String((em && (em.fromEmail || em.from)) || '').toLowerCase(); const m = /@([\w.-]+)/.exec(a); return m ? '@' + m[1] : ''; };
const taskFieldChg = CHG['task-field'];
CHG['task-field'] = el => {
  const t = UI.drawer && UI.drawer.kind === 'task' && St.tasks.get(UI.drawer.id), f = el.dataset.field, before = t ? String(t[f] ?? '') : '';
  taskFieldChg(el);
  learnCorrection(t, f, before, String((St.tasks.get(t.id) || {})[f] ?? ''));
};
// one correction: the sender's domain, the email subject, what Claude chose and what you chose instead
function learnCorrection(t, f, before, after) {
  if (!t || !LEARN_FIELDS.includes(f) || !(t.emailIds || []).length || autoPrefs().learn === false) return;
  if (!after || before === after) return;
  const em = St.emails.get(t.emailIds[0]), sender = senderKey(em);
  const items = learned().filter(x => !(x.field === f && x.sender === sender && x.from === before)).concat({ field: f, sender, from: before, to: after, subject: E.clip((em && em.subject) || (t.sourceSubject || ''), 80), at: nowISO() }).slice(-80);
  colPut('prefs', { id: 'learned', items });
}
function learnedNotes(em) {
  const s = senderKey(em), items = learned();
  const pick = [...items.filter(x => x.sender && x.sender === s), ...items.filter(x => x.sender !== s)].slice(0, 12);
  if (!pick.length) return '';
  return 'CORRECTIONS I MADE BEFORE (prefer my choice in similar cases):\n' + pick.map(x => `- ${x.sender ? 'For emails from ' + x.sender + ' ' : ''}${x.subject ? '(e.g. “' + x.subject + '”) ' : ''}the ${FIELD_LABEL[x.field] || x.field} was “${x.from || 'empty'}” and I changed it to “${x.to}”.`).join('\n');
}
function learnedHTML() {
  const items = learned();
  return `<section class="card pad set-sec" id="set-learn" data-sec="Learned corrections"><div class="section-title"><h2>Learned from your corrections</h2></div>
    <p class="small muted" style="margin-top:0">When you change the project, priority, topic, category or whose action Claude chose for an emailed task, the next analyses are told about it.</p>
    ${items.length ? `<ul class="learn-list">${items.slice().reverse().slice(0, 20).map(x => `<li><span class="small">${esc(x.sender || 'Any sender')}</span> · ${esc(FIELD_LABEL[x.field] || x.field)}: <s>${esc(x.from || '—')}</s> → <b dir="auto">${esc(x.to)}</b></li>`).join('')}</ul><button class="btn sm ghost" data-act="learn-clear">Forget all corrections</button>` : '<p class="small muted">Nothing learned yet.</p>'}</section>`;
}

Object.assign(ACT, { 'learn-clear': () => { colPut('prefs', { id: 'learned', items: [] }); render(); toast('Corrections forgotten.'); } });

// tasks that were waiting for you to choose a place: placed where Claude put them, the options kept
HOOKS.ready.push(() => {
  if (St.mode === 'viewer') return;
  for (const t0 of [...St.tasks.values()]) if (t0.placement && t0.placement.status === 'suggested') {
    const t = clone(t0); t.placement = { status: 'auto', confidence: t0.placement.confidence ?? null, options: t0.placement.options || [] }; putTask(t);
  }
});
