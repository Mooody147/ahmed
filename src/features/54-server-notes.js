// To-do canvas: every email in or out that still has to go on your work server is tagged on the email itself —
// a small "📁 Server" tag on its row in the conversation card (on the task card when conversations are hidden);
// tapping the tag marks it added (Undo). A folded pill in the corner counts them and opens the full list.
// A notice, not a task card: it sits over the canvas in the top-right corner (not among the tasks), shows whether the
// email came in or went out, its subject, who it is from or to and its date; ✓ marks it added, 📋 copies a ready file
// name ("2026-10-28 - In - subject - sender"), ⬇ saves the original email when it was kept, and a click opens the
// email. The newest show first; the stack folds into one pill. Marked on the email itself, so every device agrees.

const SRV_LS = 'ar-srv-notes';
UI.srvOpen = (() => { try { return localStorage.getItem(SRV_LS) === 'open'; } catch { return false; } })();   // folded unless you open it
UI.srvMore = false;
const srvWhen = e => { const t = Date.parse(e.date || '') || Date.parse(e.importedAt || '') || Date.now(), d = new Date(t); return d; };
const srvDay = e => { const d = srvWhen(e); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const srvWho = s => String(s || '').replace(/<[^>]*>/g, '').replace(/["']/g, '').split(/[,;]/)[0].trim();
// every email in or out still to file (documents added by hand are not emails)
function srvPending() {
  return [...St.emails.values()].filter(e => e.source !== 'docs' && !e.serverAt && !e.serverSkip).sort((a, b) => srvWhen(b) - srvWhen(a));
}
function srvFileName(e) {
  const subject = String(e.subject || 'email').replace(/^\s*((re|fw|fwd|aw|wg)\s*:\s*|\[external\]\s*)+/gi, '').trim();
  const who = srvWho(e.fromMe ? e.to : e.from);
  return [srvDay(e), e.fromMe ? 'Out' : 'In', subject, who].filter(Boolean).join(' - ').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, ' ').slice(0, 140).trim();
}
function srvNoteHTML(e) {
  const out = !!e.fromMe, who = srvWho(out ? e.to : e.from), orig = (e.files || []).findIndex(f => f.role === 'original');
  return `<li class="srv-note ${out ? 'out' : 'in'}">
    <button class="srv-open" data-act="srv-open" data-id="${esc(e.id)}" title="Open the email"><span class="srv-dir" aria-label="${out ? 'Outgoing' : 'Incoming'}">${out ? '↑ Out' : '↓ In'}</span>
      <span class="srv-txt"><b dir="auto">${esc(E.clip(e.subject || '(no subject)', 60))}</b><small dir="auto">${out ? 'to' : 'from'} ${esc(E.clip(who || '—', 28))} · ${esc(fmtDate(srvDay(e)))}</small></span></button>
    <span class="srv-acts">${orig >= 0 ? `<button class="icon-btn" data-act="af-save" data-eid="${esc(e.id)}" data-i="${orig}" title="Save the original email" aria-label="Save the original email">⬇</button>` : ''}<button class="icon-btn" data-act="srv-copy" data-id="${esc(e.id)}" title="Copy a file name for the server: ${esc(srvFileName(e))}" aria-label="Copy a file name">📋</button><button class="icon-btn srv-ok" data-act="srv-done" data-id="${esc(e.id)}" title="Added to the work server" aria-label="Mark as added to the work server">✓</button></span></li>`;
}
MAP_OVERLAYS.push(() => {
  if (St.mode === 'viewer' || UI.view !== 'todo') return '';
  const list = srvPending(); if (!list.length) return '';
  const nIn = list.filter(e => !e.fromMe).length, nOut = list.length - nIn, head = `📁 ${list.length} to add to the work server`;
  if (!UI.srvOpen) return `<div class="srv-notes map-overlay folded"><button class="srv-pill" data-act="srv-fold" aria-expanded="false" title="${nIn} in · ${nOut} out">${head}</button></div>`;
  const show = UI.srvMore ? list.slice(0, 60) : list.slice(0, 3);
  return `<section class="srv-notes map-overlay" aria-label="Emails to add to the work server">
    <div class="srv-h"><button class="srv-pill" data-act="srv-fold" aria-expanded="true" title="Fold">${head}</button><span class="small muted">${nIn} in · ${nOut} out</span></div>
    <ol class="srv-list ${UI.srvMore ? 'more' : ''}">${show.map(srvNoteHTML).join('')}</ol>
    <div class="srv-f">${list.length > 3 ? `<button class="btn sm ghost" data-act="srv-more">${UI.srvMore ? 'Show fewer' : `+${list.length - 3} more`}</button>` : ''}<span class="spacer"></span>${list.length > 1 ? `<button class="btn sm ghost" data-act="srv-all">✓ Mark all added</button>` : ''}</div></section>`;
});
// the tag on the email itself
function srvTagHTML(eid) {
  const e = St.emails.get(eid); if (!e || e.source === 'docs' || e.serverAt || e.serverSkip || St.mode === 'viewer') return '';
  return `<button class="srv-tag ${e.fromMe ? 'out' : 'in'}" data-map="srv" data-eid="${esc(eid)}" title="${e.fromMe ? 'Your email' : 'This email'} is not on the work server yet — tap once you have added it (file name: ${esc(srvFileName(e))})">📁 Server</button>`;
}
function srvMarkOne(eid) { if (!St.emails.has(eid)) return; srvMark([eid], true); render(); toast('Marked as on the work server.', { action: 'Undo', fn: () => { srvMark([eid], false); render(); } }); }
// conversations hidden: the tag goes on the task the email made
NODE_EXTRA.push(t => { if (UI.mapThreads !== false || St.mode === 'viewer') return ''; const p = (t.emailIds || []).map(id => St.emails.get(id)).filter(e => e && !e.serverAt && !e.serverSkip && e.source !== 'docs'); return p.length ? `<button class="srv-tag" data-map="srv" title="${p.length} email${p.length > 1 ? 's' : ''} of this task not on the work server yet — tap once added">📁 Server</button>` : ''; });
MAP_BTN.srv = id => { const t = St.tasks.get(id); if (!t) return; const ids = (t.emailIds || []).filter(x => { const e = St.emails.get(x); return e && !e.serverAt && !e.serverSkip; }); if (!ids.length) return; srvMark(ids, true); render(); toast(`${ids.length > 1 ? ids.length + ' emails' : 'Email'} marked as on the work server.`, { action: 'Undo', fn: () => { srvMark(ids, false); render(); } }); };
function srvMark(ids, on) {
  const at = nowISO();
  for (const id of ids) { const e = St.emails.get(id); if (!e) continue; const x = clone(e); if (on) x.serverAt = at; else delete x.serverAt; putEmail(x); }
}
Object.assign(ACT, {
  'srv-fold': () => { UI.srvOpen = !UI.srvOpen; try { localStorage.setItem(SRV_LS, UI.srvOpen ? 'open' : 'folded'); } catch {} render(); },
  'srv-more': () => { UI.srvMore = !UI.srvMore; render(); },
  'srv-open': el => openDrawer('email', el.dataset.id),
  'srv-copy': async el => { const e = St.emails.get(el.dataset.id); if (!e) return; const name = srvFileName(e); try { await navigator.clipboard.writeText(name); toast('Copied: ' + name); } catch { toast(name); } },
  'srv-done': el => srvMarkOne(el.dataset.id),
  'srv-all': () => { const ids = srvPending().map(e => e.id); srvMark(ids, true); render(); toast(`${ids.length} emails marked as on the work server.`, { action: 'Undo', fn: () => { srvMark(ids, false); render(); } }); },
});
