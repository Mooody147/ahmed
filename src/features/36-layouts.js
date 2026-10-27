/* ---------- layouts: fishbone, people swimlanes, board templates ---------- */
// 🐟 Fishbone: type a problem ("RAS pump cavitation"), or start from the selected task, and a root-cause diagram is
//    drawn on its own board — the problem at the head, six cause branches (Design, Equipment, Process, Materials,
//    Measurement, Site & people) — with Claude's likely causes on each when Claude is available. Edit freely after.
// 👥 People: every open task in a lane per person — mine first, then whoever owes me what — oldest deadline first;
//    drag a card to another lane to hand it over (or take it back).
// ▦ Templates: ready boards — project kick-off, submittal tracker, weekly plan (Sun–Thu), meeting board, risk board.
const FISH_CATS = ['Design', 'Equipment', 'Process', 'Materials', 'Measurement', 'Site & people'];
function fishboneEls(problem, cats) {
  const els = [], W = 1500, spineY = 420, x0 = 80, headX = x0 + W;
  const mk = (type, p) => { const e = newEl(type, p); els.push(e); return e; };
  mk('line', { x1: x0, y1: spineY, x2: headX, y2: spineY, width: 5, arrow: true, color: 'ink' });
  mk('shape', { kind: 'rect', x: headX + 10, y: spineY - 70, w: 300, h: 140, text: problem, color: '#C62828' });
  const n = cats.length, step = W / (Math.ceil(n / 2) + 1);
  cats.forEach((c, i) => {
    const top = i % 2 === 0, k = Math.floor(i / 2), bx = x0 + step * (k + 1), tipX = bx - 220, tipY = top ? spineY - 300 : spineY + 300;
    mk('line', { x1: tipX, y1: tipY, x2: bx, y2: spineY, width: 3, color: 'ink' });
    mk('text', { x: tipX - 90, y: top ? tipY - 46 : tipY + 8, w: 240, h: 36, text: c.name, size: 22, color: '#0A6B74' });
    (c.causes || []).slice(0, 5).forEach((cause, j) => {
      const f = (j + 1) / ((c.causes || []).length + 1), cx = tipX + (bx - tipX) * f, cy = tipY + (spineY - tipY) * f;
      mk('line', { x1: cx - 150, y1: cy, x2: cx, y2: cy, width: 1.5, color: 'ink' });
      mk('text', { x: cx - 300, y: cy - 22, w: 290, h: 30, text: cause, size: 15, color: 'ink' });
    });
  });
  return els;
}
const FISH = { busy: false };
function fishboneOpen() {
  const m = $('#modal'); if (!m) return; const t = UI.mapSel && St.tasks.get(UI.mapSel);
  m.innerHTML = deco(`<div class="card pad mail-draft" role="dialog" aria-label="Fishbone"><div class="row"><b>🐟 Fishbone — find the root cause</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <label class="field"><span>The problem (the fish's head)</span><input class="input" id="fish-q" dir="auto" value="${esc(t ? t.title : '')}" placeholder="e.g. RAS pump cavitation at low wet-well level"></label>
    <label class="check small"><input type="checkbox" id="fish-ai" ${St.sample ? 'checked' : 'disabled'}>${St.sample ? 'Let Claude suggest likely causes on each branch' : 'Empty branches to fill in'}</label>
    <div class="row end"><button class="btn" data-act="close-modal">Cancel</button><button class="btn primary" data-act="fish-draw" ${FISH.busy ? 'disabled' : ''}>${FISH.busy ? 'Thinking…' : 'Draw'}</button></div></div>`);
  m.hidden = false; setTimeout(() => { const i = $('#fish-q'); if (i) i.focus(); }, 30);
}
ACT['fish-open'] = () => { UI.menuOpen = ''; fishboneOpen(); };
ACT['fish-draw'] = async () => {
  const q = (($('#fish-q') || {}).value || '').trim(); if (!q) return;
  let cats = FISH_CATS.map(name => ({ name, causes: [] }));
  if (($('#fish-ai') || {}).checked && St.sample) {
    FISH.busy = true; fishboneOpen(); $('#fish-q').value = q;
    try {
      const r = await St.sample.json(`Build an Ishikawa (fishbone) diagram for this engineering problem in water/wastewater plants. Use exactly these 6 branches: ${FISH_CATS.join(', ')}. Give 2–4 likely, specific causes per branch (≤ 7 words each), in the problem's language. Reply with JSON only: {"branches":[{"name":"Design","causes":["…"]}]}
PROBLEM: ${q}`, { modelTier: 'default' });
      const by = new Map(((r && r.branches) || []).map(b => [E.normMatch(b.name || ''), (b.causes || []).map(String).filter(Boolean)]));
      cats = FISH_CATS.map(name => ({ name, causes: by.get(E.normMatch(name)) || [] }));
    } catch (e) { toast('Claude could not suggest causes now — empty branches drawn.', { err: true }); }
    FISH.busy = false;
  }
  $('#modal').hidden = true;
  const id = newBoard(E.clip('Fishbone: ' + q, 40), fishboneEls(q, cats)); goBoard(id);
  toast('🐟 Fishbone drawn on its own board — edit any cause, add notes, or draw on it.', { action: 'Undo', fn: () => { cvUndo(); goBoard('main'); } });
};

/* --- people swimlanes --- */
TODO_MODES.splice(TODO_MODES.findIndex(m => m[0] === 'board'), 0, ['people', '👥', 'People', 'Swimlanes: every task in a lane per person']);
const laneOf = t => (isMine(t) && t.status !== 'waiting') ? 'me' : (t.owner && !/^me$/i.test(t.owner) ? t.owner : (t.requestedBy || 'Someone'));
function viewPeople() {
  const ts = viewTasks(), lanes = new Map([['me', []]]);
  for (const t of ts) { const k = laneOf(t); if (!lanes.has(k)) lanes.set(k, []); lanes.get(k).push(t); }
  const order = (a, b) => (a.deadline || '9').localeCompare(b.deadline || '9') || PRIO_RANK[a.priority] - PRIO_RANK[b.priority];
  const rows = [...lanes.entries()].sort((a, b) => (a[0] === 'me' ? -1 : b[0] === 'me' ? 1 : b[1].length - a[1].length));
  const card = t => { const d = dueInfo(t); return `<div class="${cardCls(t)} pl-card" draggable="true" data-drag-task="${esc(t.id)}" data-act="open-task" data-id="${esc(t.id)}" role="button" tabindex="0"><span class="tl-tags">${cardTags(t)}</span><b dir="auto">${esc(t.title)}</b><small><span class="mono">${esc(t.ref || '')}</span><span class="duepill ${d.cls}">${esc(d.txt)}</span>${t.project ? `<span dir="auto">${esc(E.clip(t.project, 24))}</span>` : ''}</small></div>`; };
  return `${vHeader('People', 'A lane per person · drag a card to another lane to hand it over')}
  <div class="pl">${rows.map(([who, list]) => { const over = list.filter(t => t.deadline && t.deadline < T()).length; return `<section class="pl-lane card" data-lane="${esc(who)}">
    <header><span class="pl-av">${esc(who === 'me' ? '🙋' : who.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase())}</span><b dir="auto">${esc(who === 'me' ? 'Me' : who)}</b><small>${list.length} open${over ? ` · <span class="crit">${over} overdue</span>` : ''}</small></header>
    <div class="pl-cards">${list.sort(order).map(card).join('') || '<p class="small muted">Nothing here.</p>'}</div></section>`; }).join('')}</div>`;
}
TODO_VIEWS.people = viewPeople;
let plDrag = null;
document.addEventListener('dragstart', e => { const c = e.target.closest && e.target.closest('[data-drag-task]'); if (!c) return; plDrag = c.dataset.dragTask; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', plDrag); c.classList.add('dragging'); });
document.addEventListener('dragend', () => { plDrag = null; document.querySelectorAll('.pl-lane.over,.pl-card.dragging').forEach(x => x.classList.remove('over', 'dragging')); });
document.addEventListener('dragover', e => { if (!plDrag) return; const l = e.target.closest && e.target.closest('.pl-lane'); if (!l) return; e.preventDefault(); document.querySelectorAll('.pl-lane.over').forEach(x => x !== l && x.classList.remove('over')); l.classList.add('over'); });
document.addEventListener('drop', e => {
  if (!plDrag) return; const l = e.target.closest && e.target.closest('.pl-lane'); if (!l) return; e.preventDefault(); e.stopImmediatePropagation();
  const t0 = St.tasks.get(plDrag), who = l.dataset.lane; plDrag = null; if (!t0 || laneOf(t0) === who) { render(); return; }
  const t = clone(t0), now = nowISO();
  if (who === 'me') { t.ownership = 'mine'; t.owner = 'me'; if (t.status === 'waiting') t.status = 'todo'; }
  else { t.ownership = 'waiting'; t.owner = who; if (t.status === 'todo' || t.status === 'in_progress') t.status = 'waiting'; }
  (t.history = t.history || []).push({ at: now, text: who === 'me' ? 'Taken back: now mine' : `Handed over: waiting on ${who}` }); t.updatedAt = now;
  cvApply({ tasks: { [t.id]: t } }); render(); toast(who === 'me' ? `${t.ref} is yours now.` : `${t.ref} handed to ${who}.`, { action: 'Undo', fn: cvUndo });
}, true);

/* --- board templates --- */
const TEMPLATES = [
  ['kickoff', '🚀 Project kick-off', 'Scope, stakeholders, deliverables, risks and key dates for a new project', () => frameRow([['Scope', ['What is in', 'What is out']], ['Stakeholders', ['Client', 'Consultant', 'Contractor', 'Vendors']], ['Deliverables', ['Drawings', 'Calculations', 'Datasheets', 'Specifications']], ['Risks', ['Long-lead items', 'Interfaces']], ['Key dates', ['Kick-off', 'IFR', 'IFC']]])],
  ['submittal', '📑 Submittal tracker', 'Documents moving from preparation to approval, by review code', () => frameRow([['To prepare', []], ['Submitted — awaiting review', []], ['Code 2 — approved with comments', []], ['Code 3 — revise & resubmit', []], ['Code 1 — approved', []]], 300)],
  ['week', '🗓 Weekly plan (Sun–Thu)', 'One column per working day plus a parking lot', () => frameRow([['Sunday', []], ['Monday', []], ['Tuesday', []], ['Wednesday', []], ['Thursday', []], ['Parking lot', []]], 260)],
  ['meeting', '🤝 Meeting board', 'Agenda, notes, decisions and actions with owners', () => frameRow([['Agenda', ['1.', '2.', '3.']], ['Notes', []], ['Decisions', []], ['Actions (who · what · when)', []]])],
  ['risk', '⚠️ Risk board', 'Risks sorted by likelihood and impact, with mitigations', () => frameGrid([['High impact · likely', []], ['High impact · unlikely', []], ['Low impact · likely', []], ['Low impact · unlikely', []]])],
];
function frameRow(cols, fw) {
  const els = [], w = fw || 320, h = 620, gap = 40; let x = 80;
  for (const [title, notes] of cols) {
    els.push(newEl('frame', { x, y: 80, w, h, text: title, color: 'ink' }));
    notes.forEach((n, i) => els.push(newEl('sticky', { x: x + 20, y: 130 + i * 110, w: w - 40, h: 90, text: n, color: '#FFD966' })));
    x += w + gap;
  }
  return els;
}
function frameGrid(cells) {
  const els = [], w = 560, h = 380, gap = 40;
  cells.forEach(([title], i) => els.push(newEl('frame', { x: 80 + (i % 2) * (w + gap), y: 80 + Math.floor(i / 2) * (h + gap), w, h, text: title, color: i === 0 ? '#E5484D' : i === 3 ? '#9EE0A7' : '#FFB27A' })));
  return els;
}
DRAWER_FN.tpl = () => `<div class="drawer-h"><b>▦ Board templates</b><span class="spacer"></span><button class="icon-btn" data-act="close-drawer" aria-label="Close">${I.x}</button></div>
  <div class="drawer-b" style="display:grid;gap:10px"><p class="small muted" style="margin:0">Each template opens as a new board, ready to fill with notes, tasks and drawings.</p>
  ${TEMPLATES.map(([k, n, d]) => `<button class="card pad tpl-card" data-act="tpl-board" data-k="${k}"><b>${esc(n)}</b><span class="small muted">${esc(d)}</span></button>`).join('')}
  <button class="card pad tpl-card" data-act="fish-open"><b>🐟 Fishbone (root cause)</b><span class="small muted">The problem at the head, six cause branches${St.sample ? ', filled with Claude’s suggestions' : ''}</span></button></div>`;
Object.assign(ACT, {
  'tpl-board-open': () => { UI.menuOpen = ''; openDrawer('tpl', 'all'); },
  'tpl-board': el => { const tp = TEMPLATES.find(t => t[0] === el.dataset.k); if (!tp) return; closeDrawer(); const id = newBoard(tp[1].replace(/^\S+\s/, ''), tp[3]()); goBoard(id); toast(`${tp[1]} board ready.`, { action: 'Undo', fn: () => { cvUndo(); goBoard('main'); } }); },
});
