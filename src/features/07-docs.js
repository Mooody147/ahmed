/* ---------- Documents: register, timeline, attachment library, equipment tags, lessons, evidence viewer ---------- */
// Register rows ('docreg' collection), one per document number:
// { id, number, title, project, revision, code, status, by, date, emailId, taskId, revs: [{ rev, code, status, date, by, emailId }], closed }
const DOC_STATUS = { submitted: 'Submitted', returned: 'Returned', approved: 'Approved', rejected: 'Rejected', requested: 'Requested', for_info: 'For information' };
const DOC_CODE = { 1: 'Code 1 — Approved', 2: 'Code 2 — Approved with comments', 3: 'Code 3 — Revise and resubmit', 4: 'Code 4 — Rejected' };
const docKey = n => E.normMatch(n || '').replace(/\s+/g, '');
const revRank = r => { const s = String(r || '').trim().toUpperCase(); if (/^\d+$/.test(s)) return 100 + +s; if (/^[A-Z]$/.test(s)) return s.charCodeAt(0) - 64; return 0; };
function upsertDoc(d, e, project) {
  const key = docKey(d.number || d.title); if (!key) return;
  const cur = colList('docreg').find(x => docKey(x.number || x.title) === key);
  const date = d.date || dayOf(e.date) || T();
  const rev = { rev: d.revision || '', code: d.code || '', status: d.status || '', date, by: d.by || '', emailId: e.id };
  const task = [...St.tasks.values()].find(t => (t.emailIds || []).includes(e.id) && d.number && E.normMatch([t.title, t.action, subsOf(t).map(x => x.text).join(' ')].join(' ')).includes(E.normMatch(d.number)));
  if (!cur) { colPut('docreg', { id: E.uid('dr'), number: d.number || '', title: d.title || '', project: project || '', revision: rev.rev, code: rev.code, status: rev.status, by: rev.by, date, emailId: e.id, taskId: task ? task.id : '', revs: [rev], createdAt: nowISO() }); return; }
  const x = clone(cur);
  if (!(x.revs || []).some(r => r.emailId === e.id && r.rev === rev.rev && r.status === rev.status)) x.revs = [...(x.revs || []), rev];
  const latest = [...x.revs].sort((a, b) => (a.date || '').localeCompare(b.date || '') || revRank(a.rev) - revRank(b.rev)).pop();
  Object.assign(x, { revision: latest.rev || x.revision, code: latest.code, status: latest.status || x.status, by: latest.by || x.by, date: latest.date, emailId: latest.emailId, title: x.title || d.title || '', project: x.project || project || '' });
  // a new revision submitted after a Code 3/4 counts as the resubmission
  x.resubmitted = latest.status === 'submitted' && x.revs.some(r => /^[34]$/.test(r.code) && revRank(r.rev) < revRank(latest.rev));
  if (task && !x.taskId) x.taskId = task.id;
  colPut('docreg', x);
}
HOOKS.approved.push(e => {
  const a = e && e.analysis; if (!a || !Array.isArray(a.documents)) return;
  const proj = a.project || ([...St.tasks.values()].find(t => (t.emailIds || []).includes(e.id)) || {}).project || '';
  for (const d of a.documents) upsertDoc(d, e, proj);
});

UI.docTab = UI.docTab || 'register'; UI.docQ = ''; UI.docProj = ''; UI.docCode = '';
const DOC_TABS = [['register', '📑 Register'], ['timeline', '🗓️ Timeline'], ['files', '📎 Attachments'], ['tags', '🏷️ Equipment tags'], ['lessons', '💡 Lessons']];
VIEWS.push('docs');
VIEW_FN.docs = () => `<div class="wrap docs">
  <div class="page-head"><div><h1>Documents</h1><div class="sub">Every drawing, datasheet and calculation your emails mention, with its revision and review code, plus the files, equipment and lessons behind your work.</div></div></div>
  <div class="seg tabs" role="tablist">${DOC_TABS.map(([k, l]) => `<button role="tab" data-act="doc-tab" data-tab="${k}" aria-pressed="${UI.docTab === k}">${l}</button>`).join('')}</div>
  ${({ register: docRegister, timeline: docTimeline, files: docFiles, tags: docTags, lessons: docLessons }[UI.docTab] || docRegister)()}
</div>`;
const codeChip = c => c ? `<span class="chip ${c === '1' ? 'ok' : c === '2' ? 'accent' : 'crit'}" title="${esc(DOC_CODE[c] || '')}">Code ${esc(c)}</span>` : '';
function docRows() {
  const q = E.normMatch(UI.docQ || '');
  return colList('docreg').filter(d => (!UI.docProj || d.project === UI.docProj) && (!UI.docCode || (UI.docCode === 'open' ? /^[34]$/.test(d.code) && !d.resubmitted && !d.closed : d.code === UI.docCode)) && (!q || E.normMatch([d.number, d.title, d.by, d.project].join(' ')).includes(q)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function docRegister() {
  const all = colList('docreg'), rows = docRows(), projects = [...new Set(all.map(d => d.project).filter(Boolean))].sort();
  const openN = all.filter(d => /^[34]$/.test(d.code) && !d.resubmitted && !d.closed).length;
  return `<div class="row doc-bar">
      <label class="search todo-search">${I.search}<span class="sr">Search documents</span><input class="input" id="doc-q" type="search" placeholder="Number, title or sender…" value="${esc(UI.docQ)}" data-inp="docQ"></label>
      <select class="input" data-chg="doc-filter" data-k="docProj" aria-label="Project"><option value="">All projects</option>${projects.map(p => `<option ${UI.docProj === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select>
      <select class="input" data-chg="doc-filter" data-k="docCode" aria-label="Review code"><option value="">Any status</option><option value="open" ${UI.docCode === 'open' ? 'selected' : ''}>Needs resubmission (${openN})</option>${[1, 2, 3, 4].map(c => `<option value="${c}" ${UI.docCode === String(c) ? 'selected' : ''}>${DOC_CODE[c]}</option>`).join('')}</select>
      <span class="spacer"></span><button class="btn sm" data-act="doc-add">＋ Add document</button><button class="btn sm" data-act="doc-export" ${all.length ? '' : 'disabled'}>⬇ Excel</button></div>
    ${UI.docEdit ? docEditHTML() : ''}
    ${rows.length ? `<div class="card tbl-wrap"><table class="tbl doc-tbl"><thead><tr><th>Document</th><th>Title</th><th>Rev</th><th>Status</th><th>By</th><th>Date</th><th>Task</th><th></th></tr></thead><tbody>
      ${rows.map(d => { const t = d.taskId && St.tasks.get(d.taskId); const needs = /^[34]$/.test(d.code) && !d.resubmitted && !d.closed; return `<tr class="${needs ? 'needs' : ''}">
        <td class="mono">${esc(d.number || '—')}</td><td dir="auto">${esc(d.title)}${d.project ? `<div class="small muted">${esc(d.project)}</div>` : ''}</td><td>${esc(d.revision || '')}</td>
        <td>${codeChip(d.code)} ${d.status ? `<span class="small muted">${esc(DOC_STATUS[d.status] || d.status)}</span>` : ''}${d.resubmitted ? ' <span class="chip ok">resubmitted</span>' : ''}${d.closed ? ' <span class="chip">closed</span>' : ''}</td>
        <td dir="auto">${esc(d.by)}</td><td class="nowrap">${esc(d.date ? fmtDate(d.date) : '')}</td>
        <td>${t ? `<button class="btn ghost sm" data-act="open-task" data-id="${esc(t.id)}">${esc(t.ref)}</button>` : needs ? `<button class="btn sm" data-act="doc-task" data-id="${esc(d.id)}">＋ Task</button>` : ''}</td>
        <td class="nowrap">${(d.revs || []).length > 1 ? `<span class="small muted" title="${esc(d.revs.map(r => `${r.rev || '—'} ${r.code ? 'Code ' + r.code : r.status} ${r.date}`).join('\n'))}">${d.revs.length} events</span>` : ''}${d.emailId && St.emails.has(d.emailId) ? `<button class="icon-btn" data-act="open-email" data-id="${esc(d.emailId)}" aria-label="Open email">✉</button>` : ''}<button class="icon-btn" data-act="doc-edit" data-id="${esc(d.id)}" aria-label="Edit">✎</button></td></tr>`; }).join('')}
    </tbody></table></div>` : `<div class="empty"><div class="big-emoji">📑</div><h3>${all.length ? 'No documents match' : 'No documents yet'}</h3><p>When you approve an email that submits, returns or requests a document, it is added here with its revision and review code. You can also add documents by hand.</p></div>`}`;
}
function docEditHTML() {
  const d = UI.docEdit;
  const f = (k, l, extra = '') => `<label class="field"><span>${l}</span><input class="input" id="de-${k}" dir="auto" value="${esc(d[k] || '')}" ${extra}></label>`;
  return `<section class="card pad doc-edit"><div class="grid-2">${f('number', 'Document number')}${f('title', 'Title')}${f('project', 'Project')}${f('revision', 'Revision')}
      <label class="field"><span>Review code</span><select class="input" id="de-code"><option value="">—</option>${[1, 2, 3, 4].map(c => `<option value="${c}" ${String(d.code) === String(c) ? 'selected' : ''}>${DOC_CODE[c]}</option>`).join('')}</select></label>
      <label class="field"><span>Status</span><select class="input" id="de-status"><option value="">—</option>${Object.entries(DOC_STATUS).map(([k, v]) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      ${f('by', 'Issued / returned by')}${f('date', 'Date', 'type="date"')}</div>
    <label class="check small"><input type="checkbox" id="de-closed" ${d.closed ? 'checked' : ''}> Closed (no further action)</label>
    <div class="row end">${d.id ? '<button class="btn ghost danger sm" data-act="doc-del">Delete</button>' : ''}<span class="spacer"></span><button class="btn ghost" data-act="doc-cancel">Cancel</button><button class="btn primary" data-act="doc-save">Save</button></div></section>`;
}
function docSave() {
  const v = k => (($('#de-' + k) || {}).value || '').trim(), d = clone(UI.docEdit);
  for (const k of ['number', 'title', 'project', 'revision', 'code', 'status', 'by', 'date']) d[k] = v(k);
  d.closed = !!($('#de-closed') || {}).checked;
  if (!d.number && !d.title) { toast('Enter a document number or title.'); return; }
  if (!d.id) { d.id = E.uid('dr'); d.createdAt = nowISO(); d.revs = [{ rev: d.revision, code: d.code, status: d.status, date: d.date || T(), by: d.by, emailId: '' }]; }
  colPut('docreg', d); UI.docEdit = null; render(); toast('Document saved.');
}
async function docExport() {
  const rows = docRows().map(d => ({ Document: d.number, Title: d.title, Project: d.project, Revision: d.revision, Code: d.code, Status: DOC_STATUS[d.status] || d.status, 'Issued/returned by': d.by, Date: d.date, Task: (St.tasks.get(d.taskId) || {}).ref || '', Resubmitted: d.resubmitted ? 'Yes' : '', Closed: d.closed ? 'Yes' : '', History: (d.revs || []).map(r => `${r.date} ${r.rev || ''} ${r.code ? 'Code ' + r.code : r.status}`.trim()).join('; ') }));
  try {
    const X = await E.need('xlsx'); const ws = X.utils.json_to_sheet(rows); ws['!cols'] = [18, 40, 18, 8, 6, 14, 22, 12, 8, 10, 8, 50].map(w => ({ wch: w }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Document register');
    await offerFile(`document-register-${T()}.xlsx`, new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  } catch { const cols = Object.keys(rows[0] || { Document: '' }); offerFile(`document-register-${T()}.csv`, '﻿' + [cols, ...rows.map(r => cols.map(c => r[c]))].map(r => r.map(csvCell).join(',')).join('\r\n')); }
}

/* --- timeline: what happened, day by day, per project --- */
function docTimeline() {
  const ev = [];
  for (const e of St.emails.values()) if (e.reviewState === 'approved' || e.reviewState === 'done' || e.analysis) ev.push({ at: e.date || e.importedAt, kind: 'email', e, proj: (e.analysis && e.analysis.project) || '' });
  for (const t of St.tasks.values()) { if (t.completedAt) ev.push({ at: t.completedAt, kind: 'done', t, proj: t.project || '' }); if (t.source === 'daily' || t.source === 'meeting') ev.push({ at: t.createdAt, kind: 'new', t, proj: t.project || '' }); }
  for (const d of colList('docreg')) for (const r of d.revs || []) ev.push({ at: r.date, kind: 'doc', d, r, proj: d.project || '' });
  const projects = [...new Set(ev.map(x => x.proj).filter(Boolean))].sort();
  const list = ev.filter(x => x.at && (!UI.docProj || x.proj === UI.docProj)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 300);
  const byDay = new Map(); for (const x of list) { const d = dayOf(x.at); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(x); }
  const item = x => x.kind === 'email' ? `<li><span class="tl-e">📨</span><button class="dtitle" data-act="open-email" data-id="${esc(x.e.id)}" dir="auto">${esc(x.e.subject || '(no subject)')}</button><span class="small muted" dir="auto">${esc(x.e.from || '')}${x.e.analysis && x.e.analysis.summary ? ' — ' + esc(E.clip(x.e.analysis.summary, 120)) : ''}</span></li>`
    : x.kind === 'done' ? `<li><span class="tl-e">✅</span><button class="dtitle" data-act="open-task" data-id="${esc(x.t.id)}" dir="auto">${esc(x.t.ref)} ${esc(x.t.title)}</button><span class="small muted">completed</span></li>`
    : x.kind === 'new' ? `<li><span class="tl-e">🆕</span><button class="dtitle" data-act="open-task" data-id="${esc(x.t.id)}" dir="auto">${esc(x.t.ref)} ${esc(x.t.title)}</button><span class="small muted">${x.t.source === 'meeting' ? 'from a meeting' : 'added in Daily'}</span></li>`
    : `<li><span class="tl-e">📑</span><span><b class="mono">${esc(x.d.number || x.d.title)}</b> ${esc(x.r.rev ? 'Rev ' + x.r.rev : '')} ${x.r.code ? codeChip(x.r.code) : esc(DOC_STATUS[x.r.status] || x.r.status || '')}</span><span class="small muted" dir="auto">${esc(x.r.by || '')}</span></li>`;
  return `<div class="row doc-bar"><select class="input" data-chg="doc-filter" data-k="docProj" aria-label="Project"><option value="">All projects</option>${projects.map(p => `<option ${UI.docProj === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
    ${byDay.size ? `<div class="timeline">${[...byDay.entries()].map(([d, xs]) => `<section class="tl-day"><h3>${esc(fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</h3><ul>${xs.map(item).join('')}</ul></section>`).join('')}</div>` : '<div class="empty"><div class="big-emoji">🗓️</div><h3>Nothing yet</h3><p>Emails, documents and finished tasks appear here in date order.</p></div>'}`;
}

/* --- attachment library --- */
function docFiles() {
  const q = E.normMatch(UI.docQ || ''), rows = [];
  for (const e of St.emails.values()) for (const a of e.attachments || []) rows.push({ a, e });
  const list = rows.filter(r => !q || E.normMatch([r.a.name, r.e.subject, r.e.from].join(' ')).includes(q)).sort((x, y) => (y.e.date || '').localeCompare(x.e.date || ''));
  return `<div class="row doc-bar"><label class="search todo-search">${I.search}<span class="sr">Search files</span><input class="input" id="doc-q" type="search" placeholder="File name, email subject or sender…" value="${esc(UI.docQ)}" data-inp="docQ"></label><span class="small muted">${list.length} file${list.length === 1 ? '' : 's'}</span></div>
    ${list.length ? `<div class="card tbl-wrap"><table class="tbl"><thead><tr><th>File</th><th>Type</th><th>Email</th><th>Date</th><th>Read</th></tr></thead><tbody>${list.slice(0, 400).map(({ a, e }) => `<tr><td dir="auto">📎 ${esc(a.name)}${a.pages ? ` <span class="small muted">${a.pages} p</span>` : ''}</td><td>${esc(a.kindLabel || '')}</td><td><button class="dtitle" data-act="open-email" data-id="${esc(e.id)}" dir="auto">${esc(E.clip(e.subject || '(no subject)', 70))}</button><div class="small muted" dir="auto">${esc(e.from || '')}</div></td><td class="nowrap">${esc(e.date ? fmtDate(e.date.slice(0, 10)) : '')}</td><td>${(ATT_STATUS[a.status] || [a.status])[0] ? `<span class="chip ${(ATT_STATUS[a.status] || [])[1] || ''}">${esc((ATT_STATUS[a.status] || [a.status])[0])}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty"><div class="big-emoji">📎</div><h3>No attachments</h3><p>Files attached to your analysed emails are listed here, so you can find “that datasheet from last month” quickly.</p></div>'}`;
}

/* --- equipment tags: P-101, BL-201A, V-3001 … found in tasks and emails --- */
const TAG_RE = /\b([A-Z]{1,4})-?(\d{2,4}[A-Z]?)\b/g;
function equipmentTags() {
  const tags = new Map();
  const add = (raw, ref) => { const k = raw.replace(/^([A-Z]+)(\d)/, '$1-$2'); if (!tags.has(k)) tags.set(k, { tag: k, tasks: new Set(), emails: new Set() }); const x = tags.get(k); ref.t ? x.tasks.add(ref.t) : x.emails.add(ref.e); };
  const scan = (text, ref) => { for (const m of String(text || '').matchAll(TAG_RE)) { const pre = text.slice(Math.max(0, m.index - 1), m.index), post = text.slice(m.index + m[0].length, m.index + m[0].length + 1); if (pre === '-' || post === '-' || /^(DN|PN|IP|EN|ISO|BS|RAL|T|C|N|S|NO|REV|CODE|PAGE|ITEM|SPC|CAL|DS|DWG|TR)$/.test(m[1])) continue; add(m[1] + '-' + m[2], ref); } };
  for (const t of St.tasks.values()) scan([t.title, t.action, t.nextStep, subsOf(t).map(x => x.text).join(' '), (t.evidence || []).map(x => x.quote).join(' ')].join(' '), { t: t.id });
  for (const e of St.emails.values()) scan([e.subject, e.snippet].join(' '), { e: e.id });
  return [...tags.values()].filter(x => x.tasks.size + x.emails.size > 0).sort((a, b) => (b.tasks.size + b.emails.size) - (a.tasks.size + a.emails.size) || a.tag.localeCompare(b.tag));
}
function docTags() {
  const tags = equipmentTags(), sel = UI.docTag && tags.find(x => x.tag === UI.docTag);
  if (!tags.length) return '<div class="empty"><div class="big-emoji">🏷️</div><h3>No equipment tags found</h3><p>Tags like P-101, BL-201A or V-3001 in your tasks and emails are collected here, so you can see everything about one piece of equipment.</p></div>';
  return `<div class="tag-cloud">${tags.slice(0, 120).map(x => `<button class="chip ${sel && sel.tag === x.tag ? 'accent' : ''}" data-act="doc-tagsel" data-tag="${esc(x.tag)}"><span class="mono">${esc(x.tag)}</span> <span class="muted">${x.tasks.size + x.emails.size}</span></button>`).join('')}</div>
    ${sel ? `<section class="card pad" style="margin-top:12px"><div class="section-title"><h2 class="mono">${esc(sel.tag)}</h2></div>
      ${sel.tasks.size ? `<div class="label">Tasks</div><div class="dlist">${[...sel.tasks].map(id => St.tasks.get(id)).filter(Boolean).map(t => `<div class="row"><button class="dtitle" data-act="open-task" data-id="${esc(t.id)}" dir="auto">${esc(t.ref)} ${esc(t.title)}</button>${chipStatus(t.status)}</div>`).join('')}</div>` : ''}
      ${sel.emails.size ? `<div class="label" style="margin-top:8px">Emails</div><div class="dlist">${[...sel.emails].map(id => St.emails.get(id)).filter(Boolean).map(e => `<div class="row"><button class="dtitle" data-act="open-email" data-id="${esc(e.id)}" dir="auto">${esc(e.subject || '(no subject)')}</button><span class="small muted">${esc(e.date ? fmtDate(e.date.slice(0, 10)) : '')}</span></div>`).join('')}</div>` : ''}</section>` : '<p class="small muted">Pick a tag to see its tasks and emails.</p>'}`;
}

/* --- lessons learned library --- */
function docLessons() {
  const q = E.normMatch(UI.docQ || ''), all = colList('lessons').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const list = all.filter(l => !q || E.normMatch([l.title, l.text, l.project, (l.tags || []).join(' ')].join(' ')).includes(q));
  return `<section class="card pad lesson-add"><div class="grid-2"><label class="field"><span>Lesson</span><input class="input" id="ls-title" dir="auto" placeholder="e.g. Ask for NPSHr curve at minimum wet well level with every pump offer"></label><label class="field"><span>Project / tags</span><input class="input" id="ls-tags" dir="auto" placeholder="ELM, pumps"></label></div>
      <label class="field"><span>What happened and what to do next time</span><textarea class="input" id="ls-text" dir="auto" rows="3"></textarea></label><div class="row end"><button class="btn primary" data-act="lesson-add">Save lesson</button></div></section>
    <div class="row doc-bar"><label class="search todo-search">${I.search}<span class="sr">Search lessons</span><input class="input" id="doc-q" type="search" placeholder="Search lessons…" value="${esc(UI.docQ)}" data-inp="docQ"></label></div>
    ${list.length ? `<div class="lessons">${list.map(l => `<article class="card pad lesson"><div class="row"><b dir="auto">${esc(l.title)}</b><span class="spacer"></span><span class="small muted">${esc(fmtDate(dayOf(l.createdAt)))}</span><button class="icon-btn" data-act="lesson-del" data-id="${esc(l.id)}" aria-label="Delete lesson">${I.x}</button></div>${l.text ? `<p dir="auto">${esc(l.text)}</p>` : ''}<div class="row">${(l.tags || []).map(x => `<span class="chip">${esc(x)}</span>`).join('')}${l.taskId && St.tasks.has(l.taskId) ? `<button class="btn ghost sm" data-act="open-task" data-id="${esc(l.taskId)}">${esc(St.tasks.get(l.taskId).ref)}</button>` : ''}</div></article>`).join('')}</div>` : `<p class="small muted">${all.length ? 'No lessons match.' : 'No lessons yet. Save one here, or press “💡 Save a lesson” on a finished task.'}</p>`}`;
}
TASK_ACTIONS.push(t => t.status === 'done' ? `<button class="btn sm ghost" data-act="lesson-from-task" data-id="${esc(t.id)}">💡 Save a lesson</button>` : '');

/* --- evidence viewer: the source text with the quote highlighted --- */
function findQuote(text, quote) {
  const q = String(quote || '').trim(); if (!q || !text) return null;
  let i = text.indexOf(q); if (i >= 0) return [i, i + q.length];
  // tolerant match: ignore case and whitespace differences
  const map = [], norm = []; for (let k = 0; k < text.length; k++) { const c = text[k]; if (/\s/.test(c)) { if (norm[norm.length - 1] !== ' ') { norm.push(' '); map.push(k); } } else { norm.push(c.toLowerCase()); map.push(k); } }
  const nq = q.replace(/\s+/g, ' ').toLowerCase(), ns = norm.join('');
  i = ns.indexOf(nq); if (i < 0) { const part = nq.slice(0, Math.min(60, nq.length)); i = ns.indexOf(part); if (i < 0) return null; return [map[i], map[Math.min(map.length - 1, i + part.length - 1)] + 1]; }
  return [map[i], map[Math.min(map.length - 1, i + nq.length - 1)] + 1];
}
async function viewEvidence(emailId, src, name, quote) {
  const e = St.emails.get(emailId), m = $('#modal'); if (!e) return;
  const data = await getTexts(emailId);
  let text = '', label = '';
  if (data) {
    const att = (data.atts || []).find(a => a.name && name && a.name === name) || (src && src !== 'BODY' && (data.atts || []).find(a => findQuote(a.text, quote)));
    if (att && src !== 'BODY') { text = att.text || ''; label = att.name; } else { text = data.body || ''; label = 'Email body'; }
    if (!findQuote(text, quote)) { const other = [{ name: 'Email body', text: data.body }, ...(data.atts || [])].find(x => findQuote(x.text, quote)); if (other) { text = other.text; label = other.name; } }
  }
  const hit = findQuote(text, quote);
  const W = 1600, body = !text ? '<p class="muted">The full text of this email was not kept (Setup → Privacy controls whether email text is stored), so only the quote can be shown.</p>'
    : hit ? `<pre class="src-text" dir="auto">${esc(text.slice(Math.max(0, hit[0] - W), hit[0]))}<mark id="ev-mark">${esc(text.slice(hit[0], hit[1]))}</mark>${esc(text.slice(hit[1], hit[1] + W))}</pre>`
    : `<p class="small muted">The exact quote was not found in the stored text (it may come from a page image).</p><pre class="src-text" dir="auto">${esc(E.clip(text, 3000))}</pre>`;
  m.innerHTML = deco(`<div class="card pad ev-viewer" role="dialog" aria-label="Evidence in source"><div class="row ev-head"><b dir="auto">🔎 ${esc(label || 'Source')}</b><span class="small muted ev-sub" dir="auto">${esc(e.subject || '')}</span><span class="spacer"></span><button class="btn ghost sm" data-act="open-email" data-id="${esc(e.id)}">Open email</button><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <blockquote dir="auto">${esc(quote)}</blockquote>${body}</div>`);
  m.hidden = false; setTimeout(() => { const k = $('#ev-mark'); if (k) k.scrollIntoView({ block: 'center' }); }, 30);
}

Object.assign(ACT, {
  'doc-tab': el => { UI.docTab = el.dataset.tab; UI.docQ = ''; render(); },
  'doc-add': () => { UI.docEdit = { number: '', title: '', project: UI.docProj || '', date: T() }; render(); setTimeout(() => $('#de-number')?.focus(), 30); },
  'doc-edit': el => { UI.docEdit = clone(St.cols.docreg.get(el.dataset.id)); render(); },
  'doc-cancel': () => { UI.docEdit = null; render(); },
  'doc-save': () => docSave(),
  'doc-del': () => { if (UI.docEdit && UI.docEdit.id) colDel('docreg', UI.docEdit.id); UI.docEdit = null; render(); toast('Document removed.'); },
  'doc-export': () => docExport(),
  'doc-task': el => {
    const d = St.cols.docreg.get(el.dataset.id); if (!d) return;
    const t = makeTask({ title: `Revise and resubmit ${d.number || d.title}${d.revision ? ' (returned Rev ' + d.revision + ', Code ' + d.code + ')' : ''}`, action: `Address the review comments and resubmit ${d.title || d.number}`, project: d.project || '', priority: d.code === '4' ? 'critical' : 'high', requestedBy: d.by || '', emailIds: d.emailId ? [d.emailId] : [], topic: d.title || '', history: [{ at: nowISO(), text: 'Created from the document register' }] });
    putTask(t); colPut('docreg', { ...clone(d), taskId: t.id }); render(); toast(`${t.ref} created.`, { action: 'Open', fn: () => openDrawer('task', t.id) });
  },
  'doc-tagsel': el => { UI.docTag = UI.docTag === el.dataset.tag ? '' : el.dataset.tag; render(); },
  'lesson-add': () => {
    const v = id => (($('#' + id) || {}).value || '').trim(), title = v('ls-title'); if (!title) { toast('Write the lesson first.'); return; }
    const tags = v('ls-tags').split(/[,;]+/).map(x => x.trim()).filter(Boolean);
    colPut('lessons', { id: E.uid('ls'), title, text: v('ls-text'), tags, project: tags[0] || '', createdAt: nowISO() }); render(); toast('Lesson saved.');
  },
  'lesson-del': el => { colDel('lessons', el.dataset.id); render(); },
  'lesson-from-task': el => {
    const t = St.tasks.get(el.dataset.id); if (!t) return;
    closeDrawer(); UI.view = 'docs'; UI.docTab = 'lessons'; render();
    setTimeout(() => { const a = $('#ls-title'), b = $('#ls-tags'), c = $('#ls-text'); if (a) { a.value = ''; a.placeholder = 'What did you learn from ' + t.ref + '?'; a.focus(); } if (b) b.value = [t.project, topicOf(t)].filter(Boolean).join(', '); if (c) c.value = `${t.ref} — ${t.title}\n`; UI.lessonTask = t.id; }, 30);
  },
  'ev-view': el => viewEvidence(el.dataset.email, el.dataset.src, el.dataset.name, el.dataset.q),
});
Object.assign(CHG, { 'doc-filter': el => { UI[el.dataset.k] = el.value; render(); } });
// link a lesson saved right after "Save a lesson" to its task
const lessonAddAct = ACT['lesson-add'];
ACT['lesson-add'] = el => { const before = new Set(colList('lessons').map(l => l.id)); lessonAddAct(el); const n = colList('lessons').find(l => !before.has(l.id)); if (n && UI.lessonTask) { colPut('lessons', { ...n, taskId: UI.lessonTask }); UI.lessonTask = null; render(); } };
