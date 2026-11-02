/* ---------- Quality: site visit report, comment patterns, unit converter, standards library, spec compliance checklist ---------- */
addCols('visits', 'standards', 'speccheck');
TOOL_TABS.push(['visit', '🦺 Site visit'], ['patterns', '🔁 Comment patterns'], ['units', '📐 Units'], ['stds', '📚 Standards'], ['spec', '✅ Spec checklist']);
Object.assign(TOOL_FN, { visit: () => visitHTML(), patterns: () => patternsHTML(), units: () => unitsHTML(), stds: () => stdsHTML(), spec: () => specHTML() });

/* --- site visit report: photos with captions, observations that become tasks, Word / PDF --- */
UI.sv = UI.sv || { id: null };
const SEV = [['ok', 'OK'], ['minor', 'Minor'], ['major', 'Major'], ['critical', 'Critical / stop work']];
const svCur = () => UI.sv.id && St.cols.visits.get(UI.sv.id);
function visitHTML() {
  const v = svCur();
  if (!v) {
    const list = colList('visits').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return `<section class="card pad"><div class="section-title"><h2>Site visit reports</h2><span class="spacer"></span><button class="btn sm primary" data-act="sv-new">${I.plus} New visit</button></div>
      <p class="small muted" style="margin:0">Take photos on site (or add them later), write what you saw, and the report is ready as Word or PDF. Each action becomes a task with its owner and date.</p>
      ${list.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Date</th><th>Project</th><th>Location</th><th>Photos</th><th>Observations</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td class="nowrap">${esc(fmtDate(x.date))}</td><td>${esc(x.project || '')}</td><td dir="auto">${esc(x.location || '')}</td><td class="num">${(x.photos || []).length}</td><td class="num">${(x.obs || []).length}</td><td><button class="btn sm ghost" data-act="sv-open" data-id="${esc(x.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
  }
  const f = (k, l, type = 'text', extra = '') => `<label class="field"><span>${l}</span><input class="input hold-render" type="${type}" value="${esc(v[k] || '')}" data-chg="sv-f" data-k="${k}" ${extra} dir="auto"></label>`;
  return `<section class="card pad tr-form"><div class="row"><button class="btn ghost sm" data-act="sv-back">‹ All visits</button><h2 style="margin:0">Site visit — ${esc(fmtDate(v.date))}</h2><span class="spacer"></span><button class="btn sm" data-act="sv-word">📄 Word</button><button class="btn sm" data-act="sv-pdf">PDF</button><button class="btn sm primary" data-act="sv-tasks">${I.plus} Tasks from actions</button></div>
    <div class="grid2">${f('date', 'Date', 'date')}${f('project', 'Project', 'text', 'list="pr-projs"')}${f('location', 'Location / area')}${f('weather', 'Weather')}${f('attendees', 'Attendees')}${f('purpose', 'Purpose of the visit')}</div>
    <div class="label">Photos</div>
    <div class="sv-photos">${(v.photos || []).map((p, i) => `<figure class="sv-ph"><img data-photo="${esc(p.id)}" alt="${esc(p.caption || 'Photo')}"><input class="input hold-render" value="${esc(p.caption || '')}" placeholder="Caption" data-chg="sv-cap" data-i="${i}" dir="auto"><button class="icon-btn" data-act="sv-ph-del" data-i="${i}" aria-label="Remove photo">${I.x}</button></figure>`).join('')}
      <label class="sv-add" for="sv-file">📷<span>Add photos</span></label><input id="sv-file" type="file" accept="image/*" multiple capture="environment" hidden data-chg="sv-file"></div>
    ${St.sample && (v.photos || []).length ? `<div class="row"><button class="btn sm" data-act="sv-ai" ${UI.sv.busy ? 'disabled' : ''}>${UI.sv.busy ? 'Looking at the photos…' : '✨ Suggest captions and observations from the photos'}</button></div>` : ''}
    <div class="label">Observations and actions</div>
    <div class="mon-scroll"><table class="tbl reg-tbl"><thead><tr><th>Observation</th><th>Severity</th><th>Action required</th><th>By</th><th>Due</th><th></th></tr></thead><tbody>${(v.obs || []).map((o, i) => `<tr><td><textarea class="input hold-render" rows="2" data-chg="sv-o" data-i="${i}" data-k="text" dir="auto" style="min-width:220px">${esc(o.text || '')}</textarea></td><td><select class="input" data-chg="sv-o" data-i="${i}" data-k="sev">${SEV.map(([k, l]) => `<option value="${k}" ${o.sev === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><input class="input hold-render" value="${esc(o.action || '')}" data-chg="sv-o" data-i="${i}" data-k="action" dir="auto" style="min-width:180px"></td><td><input class="input hold-render" value="${esc(o.by || '')}" data-chg="sv-o" data-i="${i}" data-k="by" style="width:120px"></td><td><input class="input" type="date" value="${esc(o.due || '')}" data-chg="sv-o" data-i="${i}" data-k="due"></td><td>${o.taskId ? '<span class="chip ok">Task</span>' : ''}<button class="icon-btn" data-act="sv-o-del" data-i="${i}" aria-label="Delete">${I.x}</button></td></tr>`).join('')}</tbody></table></div>
    <div class="row"><button class="btn sm" data-act="sv-o-add">${I.plus} Observation</button><span class="spacer"></span><button class="btn ghost sm danger" data-act="sv-del">${I.trash} Delete visit</button></div>
    <label class="field"><span>Summary / conclusion</span><textarea class="input hold-render" rows="3" data-chg="sv-f" data-k="summary" dir="auto">${esc(v.summary || '')}</textarea></label>
    </section><datalist id="pr-projs">${projectsList().map(p => `<option value="${esc(p)}">`).join('')}</datalist>`;
}
// photos are kept as files; the page shows small copies
const svThumbs = new Map();
HOOKS.afterRender.push(() => document.querySelectorAll('img[data-photo]').forEach(async img => {
  const id = img.dataset.photo; if (img.src) return;
  if (!svThumbs.has(id)) { const b = await FILES.load('photos', id); if (b) svThumbs.set(id, URL.createObjectURL(new Blob([b], { type: 'image/jpeg' }))); }
  if (svThumbs.has(id)) img.src = svThumbs.get(id);
}));
// photos from a phone are large: kept at 1600 px JPEG
async function svShrink(file) {
  const img = new Image(); img.src = URL.createObjectURL(file); await img.decode();
  const s = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height };
}
const svPut = mut => { const v = clone(svCur()); mut(v); colPut('visits', v); };
Object.assign(ACT, {
  'sv-new': () => { const id = E.uid('sv'); colPut('visits', { id, date: T(), project: projectsList()[0] || '', location: '', photos: [], obs: [], createdAt: nowISO() }); UI.sv.id = id; render(); },
  'sv-open': el => { UI.sv.id = el.dataset.id; render(); },
  'sv-back': () => { UI.sv.id = null; render(); },
  'sv-del': () => { const v = svCur(); if (!v) return; (v.photos || []).forEach(p => FILES.remove('photos', p.id).catch(() => {})); colDel('visits', v.id); UI.sv.id = null; render(); },
  'sv-o-add': () => { svPut(v => { v.obs = [...(v.obs || []), { text: '', sev: 'minor', action: '', by: '', due: E.addDays(T(), 7) }]; }); render(); },
  'sv-o-del': el => { svPut(v => { v.obs.splice(+el.dataset.i, 1); }); render(); },
  'sv-ph-del': el => { svPut(v => { const [p] = v.photos.splice(+el.dataset.i, 1); if (p) FILES.remove('photos', p.id).catch(() => {}); }); render(); },
  'sv-tasks': () => {
    const v = svCur(); let n = 0;
    svPut(x => { for (const o of x.obs || []) if (o.action && !o.taskId && o.sev !== 'ok') { const mine = !o.by || /^me$/i.test(o.by) || E.normMatch(o.by) === E.normMatch(St.settings.me.name || ''); const t = makeTask({ title: o.action, project: x.project || '', ownership: mine ? 'mine' : 'waiting', owner: mine ? 'me' : o.by, deadline: o.due || null, priority: o.sev === 'critical' ? 'critical' : o.sev === 'major' ? 'high' : 'medium', type: 'site', notes: `Site visit ${fmtDate(x.date)} — ${x.location || ''}: ${o.text}`, history: [{ at: nowISO(), text: 'From a site visit report' }] }); putTask(t); o.taskId = t.id; n++; } });
    toast(n ? `${n} task${n > 1 ? 's' : ''} added.` : 'No new actions to add.'); render();
  },
  'sv-word': () => svExport('docx').catch(e => toast('Not saved: ' + (e.message || e), { err: true })),
  'sv-pdf': () => svExport('pdf').catch(e => toast('Not saved: ' + (e.message || e), { err: true })),
  'sv-ai': async () => {
    const v = svCur(); UI.sv.busy = true; render();
    try {
      const ph = (v.photos || []).slice(0, 8), blobs = [];
      for (const p of ph) { const b = await FILES.load('photos', p.id); if (b) blobs.push(new Blob([b], { type: 'image/jpeg' })); }
      const r = await St.sample.json(`You are an experienced site engineer on a water / wastewater project. Look at the site photos IMG1…IMG${blobs.length}. For each, write a short factual caption. Then list observations an engineer should record (quality, safety, progress, workmanship), each with severity ok/minor/major/critical and the action required. Only say what is visible; do not guess hidden details. Reply JSON: {"captions": ["…"], "observations": [{"text": "…", "sev": "minor", "action": "…", "photo": 1}]}`, { modelTier: 'default', images: blobs });
      svPut(x => { (r.captions || []).forEach((c, i) => { if (x.photos[i] && !x.photos[i].caption) x.photos[i].caption = String(c); }); x.obs = [...(x.obs || []), ...(r.observations || []).map(o => ({ text: String(o.text || ''), sev: SEV.some(s => s[0] === o.sev) ? o.sev : 'minor', action: String(o.action || ''), by: '', due: E.addDays(T(), 7) }))]; });
    } catch (e) { toast('Failed: ' + (e.message || e.code), { err: true }); }
    UI.sv.busy = false; render();
  },
});
Object.assign(CHG, {
  'sv-f': el => svPut(v => { v[el.dataset.k] = el.value.trim(); }),
  'sv-o': el => { svPut(v => { v.obs[+el.dataset.i][el.dataset.k] = el.value; }); if (el.tagName === 'SELECT') render(); },
  'sv-cap': el => svPut(v => { v.photos[+el.dataset.i].caption = el.value.trim(); }),
  'sv-file': async el => {
    const add = [];
    for (const f of [...el.files].slice(0, 30)) { try { const s = await svShrink(f); const id = E.uid('ph') + '.jpg'; await FILES.save('photos', id, s.bytes, { name: f.name, visit: UI.sv.id }); add.push({ id, w: s.w, h: s.h, caption: '' }); } catch { toast(`${f.name} could not be read as a photo.`, { err: true }); } }
    svPut(v => { v.photos = [...(v.photos || []), ...add]; }); render();
  },
});
async function svExport(kind) {
  const v = svCur(), me = St.settings.me;
  const head = [['Project', v.project || ''], ['Date', fmtDate(v.date, { day: 'numeric', month: 'long', year: 'numeric' })], ['Location', v.location || ''], ['Weather', v.weather || ''], ['Attendees', v.attendees || ''], ['Purpose', v.purpose || ''], ['Prepared by', [me.name, me.role].filter(Boolean).join(', ')]].filter(r => r[1]);
  const obsRows = (v.obs || []).map((o, i) => [String(i + 1), o.text || '', (SEV.find(s => s[0] === o.sev) || ['', ''])[1], o.action || '', o.by || '', o.due ? fmtDate(o.due) : '']);
  const photos = [];
  for (const p of v.photos || []) { const b = await FILES.load('photos', p.id); if (b) photos.push({ ...p, bytes: b }); }
  const name = `site-visit-${(v.project || 'site').replace(/\W+/g, '-')}-${v.date}`;
  if (kind === 'docx') {
    const blob = await docxDoc(`Site visit report — ${v.location || v.project || ''}`, fmtDate(v.date, { day: 'numeric', month: 'long', year: 'numeric' }), [
      { table: { head: ['', ''], rows: head } },
      ...(v.summary ? [{ h: 'Summary', p: v.summary.split('\n') }] : []),
      { h: 'Observations and actions', table: { head: ['No.', 'Observation', 'Severity', 'Action', 'By', 'Due'], rows: obsRows.length ? obsRows : [['', 'No observations recorded.', '', '', '', '']] } },
      ...(photos.length ? [{ h: 'Photos', images: photos.map((p, i) => { const s = Math.min(1, 560 / (p.w || 560)); return { data: p.bytes, w: Math.round((p.w || 560) * s), h: Math.round((p.h || 420) * s), caption: `Photo ${i + 1}${p.caption ? ' — ' + p.caption : ''}` }; }) }] : []),
    ]);
    return offerFile(name + '.docx', blob);
  }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  printDoc(`<h1>Site visit report — ${esc(v.location || v.project || '')}</h1><table>${head.map(([a, b]) => `<tr><th style="width:30%">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table>
    ${v.summary ? `<h2>Summary</h2><p>${esc(v.summary)}</p>` : ''}<h2>Observations and actions</h2><table><tr><th>No.</th><th>Observation</th><th>Severity</th><th>Action</th><th>By</th><th>Due</th></tr>${obsRows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>
    ${photos.length ? `<h2 class="pb">Photos</h2>${photos.map((p, i) => `<div style="break-inside:avoid;margin:0 0 10pt"><img src="data:image/jpeg;base64,${b64(p.bytes)}" style="max-width:100%;max-height:330pt"><div class="muted">Photo ${i + 1}${p.caption ? ' — ' + esc(p.caption) : ''}</div></div>`).join('')}` : ''}`, name + '.pdf', false, 'Site visit report');
}

/* --- comment patterns: what reviewers keep asking for, so the next submittal avoids it --- */
const PAT_STOP = new Set('the a an and or of to in on for with by at from is are be as this that please provide shall should will not no per all any revise resubmit submit comment comments clarify confirm include also refer see'.split(' '));
function patternComments() {
  const out = [];
  for (const t of St.tasks.values()) {
    const crs = /crs|comment|review|code\s*[34]|resubmit/i.test([t.title, t.action, t.type].join(' '));
    for (const s of subsOf(t)) if (crs || /^C-?\d+/i.test(s.text)) out.push({ text: s.text.replace(/^C-?\d+\s*[—–-]\s*/i, ''), task: t, project: t.project || '' });
  }
  for (const d of colList('docreg')) for (const r of d.revs || []) if (/^[34]$/.test(r.code)) out.push({ text: `${d.title || d.number} returned Code ${r.code}`, doc: d, project: d.project || '' });
  return out;
}
function patternThemes(list) {
  const df = new Map();
  const grams = list.map(c => { const w = nbTokens(c.text).filter(x => x.length > 2 && !PAT_STOP.has(x) && !/^\d+$/.test(x)); const g = new Set([...w, ...w.slice(1).map((x, i) => w[i] + ' ' + x)]); for (const k of g) df.set(k, (df.get(k) || 0) + 1); return g; });
  const themes = [...df.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || b[0].split(' ').length - a[0].split(' ').length);
  const picked = [];
  for (const [k, n] of themes) { if (picked.some(p => p.k.includes(k) || k.includes(p.k))) continue; picked.push({ k, n, ex: list.filter((_, i) => grams[i].has(k)).slice(0, 4) }); if (picked.length >= 12) break; }
  return picked;
}
function patternsHTML() {
  const list = patternComments(), th = patternThemes(list), ai = UI.pat;
  return `<section class="card pad"><div class="section-title"><h2>What reviewers keep commenting on</h2></div>
    <p class="small muted" style="margin:0">From the review comments in your tasks (CRS items, Code 3/4 returns). Words that come back again and again point to a checklist item for the next submittal.</p>
    ${list.length < 3 ? '<p class="muted">Not enough review comments yet — they collect as you approve CRS emails.</p>' : `<p class="small">${list.length} comments read.</p>
    ${th.length ? `<div class="pat-list">${th.map(t => `<div class="pat"><div class="row"><b>${esc(t.k)}</b><span class="chip">${t.n}×</span></div><ul class="small">${t.ex.map(c => `<li dir="auto">${esc(E.clip(c.text, 140))}${c.project ? ` <span class="muted">· ${esc(c.project)}</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>` : '<p class="muted">No repeated topics found yet.</p>'}
    <div class="row">${St.sample ? `<button class="btn" data-act="pat-ai" ${ai && ai.busy ? 'disabled' : ''}>${ai && ai.busy ? 'Reading…' : '✨ Group them and write a prevention checklist'}</button>` : ''}</div>
    ${ai && ai.themes ? `<div class="pat-list">${ai.themes.map(t => `<div class="pat"><b dir="auto">${esc(t.theme)}</b> <span class="chip">${esc(t.count)}</span><p class="small" dir="auto">${esc(t.tip)}</p></div>`).join('')}</div>${(ai.checklist || []).length ? `<div class="label">Checklist before the next submittal</div><ol>${ai.checklist.map(c => `<li dir="auto">${esc(c)}</li>`).join('')}</ol><button class="btn sm" data-act="pat-tpl">Save as a checklist template</button>` : ''}` : ''}`}</section>`;
}
Object.assign(ACT, {
  'pat-ai': async () => {
    UI.pat = { busy: true }; render();
    try { const r = await St.sample.json(`These are review comments engineers received from consultants on their submittals. Group them into recurring themes (most frequent first), give each a one-line tip to avoid it, then write a checklist (max 12 items) to use before the next submittal. Reply JSON: {"themes":[{"theme":"…","count":3,"tip":"…"}],"checklist":["…"]}\n\nCOMMENTS:\n${patternComments().slice(0, 300).map(c => '- ' + E.clip(c.text, 300)).join('\n')}`, { modelTier: 'default' }); UI.pat = { themes: (r.themes || []).slice(0, 15), checklist: (r.checklist || []).map(String) }; }
    catch (e) { UI.pat = null; toast('Failed: ' + (e.message || e.code), { err: true }); }
    render();
  },
  'pat-tpl': () => { saveSettings(s => { s.templates = [...templatesList(), { id: E.uid('tpl'), name: 'Before submitting (from review comments)', items: UI.pat.checklist.join('\n') }]; }); toast('Saved — add it to a task with “Checklist” in the task panel.'); },
});

/* --- unit converter --- */
const UNITS = {
  flow: { label: 'Flow', base: 'm³/s', u: { 'm³/h': 1 / 3600, 'm³/d': 1 / 86400, 'L/s': 1e-3, 'L/min': 1e-3 / 60, 'MLD (ML/d)': 1000 / 86400, 'US gpm': 6.30902e-5, 'UK gpm': 7.57682e-5, 'MGD (US)': 0.0438126, 'ft³/s (cfs)': 0.0283168, 'm³/s': 1 } },
  pressure: { label: 'Pressure / head', base: 'Pa', u: { bar: 1e5, kPa: 1e3, MPa: 1e6, psi: 6894.757, 'm H₂O': 9806.65, 'mm H₂O': 9.80665, 'ft H₂O': 2989.07, 'mm Hg': 133.322, atm: 101325, 'kg/cm²': 98066.5, Pa: 1 } },
  length: { label: 'Length', base: 'm', u: { mm: 1e-3, cm: 1e-2, m: 1, km: 1e3, inch: 0.0254, ft: 0.3048, yd: 0.9144, mile: 1609.344 } },
  area: { label: 'Area', base: 'm²', u: { 'mm²': 1e-6, 'cm²': 1e-4, 'm²': 1, ha: 1e4, 'km²': 1e6, feddan: 4200.83, 'in²': 6.4516e-4, 'ft²': 0.092903, acre: 4046.856 } },
  volume: { label: 'Volume', base: 'm³', u: { L: 1e-3, 'm³': 1, ML: 1e3, 'US gal': 3.78541e-3, 'UK gal': 4.54609e-3, 'ft³': 0.0283168, bbl: 0.158987 } },
  power: { label: 'Power', base: 'W', u: { W: 1, kW: 1e3, MW: 1e6, 'hp (mech.)': 745.7, 'hp (metric)': 735.499, 'BTU/h': 0.293071, 'kcal/h': 1.163, 'TR (refrig.)': 3516.85 } },
  velocity: { label: 'Velocity', base: 'm/s', u: { 'm/s': 1, 'm/h': 1 / 3600, 'km/h': 1 / 3.6, 'ft/s': 0.3048, 'ft/min': 0.00508 } },
  mass: { label: 'Mass', base: 'kg', u: { g: 1e-3, kg: 1, t: 1e3, lb: 0.453592, 'short ton': 907.185 } },
  load: { label: 'Loading rate', base: 'm³/m²·d', u: { 'm³/m²·d (m/d)': 1, 'm³/m²·h (m/h)': 24, 'L/m²·s': 86.4, 'gpd/ft²': 0.0407458, 'gpm/ft²': 58.6740 } },
  torque: { label: 'Torque', base: 'N·m', u: { 'N·m': 1, 'kN·m': 1e3, 'kgf·m': 9.80665, 'lbf·ft': 1.355818, 'lbf·in': 0.112985 } },
  temp: { label: 'Temperature', base: '°C', u: { '°C': 1, '°F': 1, K: 1 } },
};
UI.uc = UI.uc || { cat: 'flow', from: 'm³/h', v: '410' };
function ucConvert(cat, from, v) {
  const C = UNITS[cat];
  if (cat === 'temp') { const c = from === '°F' ? (v - 32) * 5 / 9 : from === 'K' ? v - 273.15 : v; return { '°C': c, '°F': c * 9 / 5 + 32, K: c + 273.15 }; }
  const si = v * C.u[from]; return Object.fromEntries(Object.entries(C.u).map(([k, f]) => [k, si / f]));
}
function unitsHTML() {
  const U = UI.uc, C = UNITS[U.cat], v = monNum(U.v), r = v === null ? null : ucConvert(U.cat, U.from, v);
  const fmt = x => Math.abs(x) >= 1e6 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : x.toLocaleString('en-GB', { maximumSignificantDigits: 6 });
  return `<section class="card pad"><div class="section-title"><h2>Unit converter</h2></div>
    <div class="seg wrap-btns">${Object.entries(UNITS).map(([k, x]) => `<button data-act="uc-cat" data-k="${k}" aria-pressed="${U.cat === k}">${esc(x.label)}</button>`).join('')}</div>
    <div class="row"><input class="input hold-render" id="uc-v" inputmode="decimal" value="${esc(U.v)}" style="width:160px" data-inp-uc="1"><select class="input" data-chg="uc-from" style="width:auto">${Object.keys(C.u).map(k => `<option ${k === U.from ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select></div>
    <div id="uc-out">${ucOut(r, fmt)}</div>
    ${U.cat === 'pressure' ? '<p class="small muted">Head ↔ pressure uses water at 4 °C (1 m H₂O = 9.80665 kPa). For other liquids multiply the head by the specific gravity.</p>' : ''}</section>`;
}
function ucOut(r, fmt) { const U = UI.uc; return r ? `<table class="tbl uc-tbl"><tbody>${Object.entries(r).map(([k, x]) => `<tr class="${k === U.from ? 'on' : ''}"><td>${esc(k)}</td><td class="num"><b>${esc(fmt(x))}</b></td><td><button class="icon-btn" data-act="uc-copy" data-v="${esc(fmt(x))}" aria-label="Copy">⧉</button></td></tr>`).join('')}</tbody></table>` : '<p class="small muted">Type a number.</p>'; }
document.addEventListener('input', e => { if (e.target && e.target.id === 'uc-v') { UI.uc.v = e.target.value; const v = monNum(UI.uc.v), o = $('#uc-out'); if (o) o.innerHTML = ucOut(v === null ? null : ucConvert(UI.uc.cat, UI.uc.from, v), x => Math.abs(x) >= 1e6 || (Math.abs(x) < 1e-3 && x !== 0) ? x.toExponential(4) : x.toLocaleString('en-GB', { maximumSignificantDigits: 6 })); } });
Object.assign(ACT, {
  'uc-cat': el => { UI.uc.cat = el.dataset.k; UI.uc.from = Object.keys(UNITS[el.dataset.k].u)[0]; render(); },
  'uc-copy': el => navigator.clipboard.writeText(el.dataset.v.replace(/,/g, '')).then(() => toast('Copied ' + el.dataset.v)),
});
Object.assign(CHG, { 'uc-from': el => { UI.uc.from = el.value; render(); } });

/* --- standards library: your codes and standards, their PDFs searchable in a notebook --- */
const STD_NB = 'nb_standards';
function stdsHTML() {
  const q = E.normMatch(UI.stdQ || ''), list = colList('standards').filter(s => !q || E.normMatch([s.code, s.title, s.scope, s.tags].join(' ')).includes(q)).sort((a, b) => String(a.code).localeCompare(String(b.code), undefined, { numeric: true }));
  return `<section class="card pad"><div class="section-title"><h2>Standards and codes</h2><span class="spacer"></span><button class="btn sm primary" data-act="std-add">${I.plus} Standard</button>${St.cols.notebooks.has(STD_NB) ? `<button class="btn sm" data-act="std-ask">📓 Ask the standards</button>` : ''}</div>
    <p class="small muted" style="margin:0">The standards your projects use (EN, ISO, AWWA, Egyptian code…), which edition, and what each is for. Attach the PDF you are licensed to use: it is stored with the app and added to the “Standards” notebook, so you can ask questions about it with clause references.</p>
    <div class="toolbar row"><label class="search">${I.search}<input class="input" type="search" placeholder="Search code, title, scope…" value="${esc(UI.stdQ || '')}" data-chg="eng-q" data-k="stdQ"></label></div>
    <div class="mon-scroll"><table class="tbl reg-tbl"><thead><tr><th>Code</th><th>Title</th><th>Edition</th><th>Used for</th><th>Projects</th><th>PDF</th><th></th></tr></thead><tbody>${list.map(s => `<tr><td>${regCell('standards', s, { k: 'code', w: 130 })}</td><td>${regCell('standards', s, { k: 'title', w: 240 })}</td><td>${regCell('standards', s, { k: 'edition', w: 80 })}</td><td>${regCell('standards', s, { k: 'scope', w: 200 })}</td><td>${regCell('standards', s, { k: 'tags', w: 120 })}</td><td class="nowrap">${s.fileId ? `<button class="btn sm ghost" data-act="std-open" data-id="${esc(s.id)}">Open</button>` : ''}<label class="btn sm ghost" for="std-f-${esc(s.id)}">${s.fileId ? 'Replace' : 'Attach'}</label><input id="std-f-${esc(s.id)}" type="file" accept=".pdf,.docx" hidden data-chg="std-file" data-id="${esc(s.id)}"></td><td><button class="icon-btn" data-act="reg-del" data-col="standards" data-id="${esc(s.id)}" aria-label="Delete">${I.x}</button></td></tr>`).join('')}</tbody></table></div>
    ${list.length ? '' : '<p class="muted">No standards yet.</p>'}</section>`;
}
Object.assign(ACT, {
  'std-add': () => { colPut('standards', { id: E.uid('st'), code: '', title: '', edition: '', scope: '', tags: '', createdAt: nowISO() }); render(); },
  'std-open': el => { const s = St.cols.standards.get(el.dataset.id); if (s && s.fileId) FILES.open('refdocs', s.fileId, s.fileName || 'standard.pdf'); },
  'std-ask': () => { UI.nb.open = STD_NB; go('notebook'); },
});
Object.assign(CHG, {
  'std-file': async el => {
    const f = el.files[0], s = St.cols.standards.get(el.dataset.id); if (!f || !s) return;
    const bytes = new Uint8Array(await f.arrayBuffer()), fileId = 'std_' + s.id + '.' + (f.name.split('.').pop() || 'pdf');
    await FILES.save('refdocs', fileId, bytes, { name: f.name });
    colPut('standards', { ...s, fileId, fileName: f.name, title: s.title || f.name.replace(/\.\w+$/, '') });
    if (!St.cols.notebooks.has(STD_NB)) colPut('notebooks', { id: STD_NB, name: 'Standards', sources: [], chat: [], notes: [], counts: { files: 0, passages: 0 }, createdAt: nowISO() });
    toast('Reading the standard for the notebook…');
    nbAddFiles(STD_NB, [new File([bytes], (s.code ? s.code + ' — ' : '') + f.name)]).catch(() => {});
    render();
  },
});

/* --- spec checklist: every "shall" in a specification, with your compliance status --- */
UI.spc = UI.spc || { id: null, busy: false };
const SPC_ST = [['open', 'Open'], ['comply', 'Complies'], ['deviation', 'Deviation'], ['clarify', 'Clarification'], ['na', 'Not applicable']];
const SPC_KIND = [['performance', 'Performance'], ['material', 'Material'], ['test', 'Test / inspection'], ['submittal', 'Submittal'], ['warranty', 'Warranty / spares'], ['other', 'Other']];
// without the AI: sentences with shall / must / required, with the clause number in front of them
function specLocal(text) {
  const out = []; let clause = '', page = '';
  for (const raw of String(text).split('\n')) {
    const pm = /^\[Page (\d+)\]/.exec(raw); if (pm) { page = pm[1]; continue; }
    const l = raw.trim(); if (!l) continue;
    const cm = /^((?:\d+\.){1,4}\d*|[A-Z]\.\d+(?:\.\d+)*)\s+/.exec(l); if (cm) clause = cm[1].replace(/\.$/, '');
    for (const sent of l.split(/(?<=[.;])\s+(?=[A-Z(])/)) if (/\b(shall|must|is required|are required|to be provided|يجب|يتعين)\b/i.test(sent) && sent.length > 25) {
      const kind = /test|inspect|witness|FAT|SAT|certificate/i.test(sent) ? 'test' : /submit|drawing|datasheet|document|manual|calculation/i.test(sent) ? 'submittal' : /warrant|spare|guarantee/i.test(sent) ? 'warranty' : /stainless|steel|cast|iron|material|coating|epoxy|grade|PN\d|IP\d/i.test(sent) ? 'material' : /flow|head|efficien|capacity|pressure|speed|noise|vibration/i.test(sent) ? 'performance' : 'other';
      out.push({ clause, page, req: sent.replace(/^((?:\d+\.){1,4}\d*)\s+/, ''), kind, status: 'open', note: '' });
    }
  }
  return out.slice(0, 600);
}
function specHTML() {
  const c = UI.spc.id && St.cols.speccheck.get(UI.spc.id);
  if (!c) {
    const list = colList('speccheck').sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return `<section class="card pad"><div class="section-title"><h2>Specification compliance checklist</h2></div>
      <p class="small muted" style="margin:0">Choose a specification (PDF or Word). Every requirement — “shall”, “must”, tests, submittals, materials — is listed with its clause, so you can mark what the offer or design complies with and export the compliance statement. ${St.sample ? 'The AI groups and words them; without it, the sentences are taken as written.' : ''}</p>
      <div class="row"><label class="btn primary" for="spc-file">${I.upload} Choose specification</label><input id="spc-file" type="file" accept=".pdf,.docx,.txt" hidden data-chg="spc-file">${UI.spc.busy ? '<span class="small muted">Reading the specification…</span><div class="progress indet" style="width:90px"><i></i></div>' : ''}</div>
      ${list.length ? `<div class="mon-scroll"><table class="tbl"><thead><tr><th>Specification</th><th>Requirements</th><th>Open</th><th>Deviations</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td dir="auto">${esc(x.name)}</td><td class="num">${x.items.length}</td><td class="num">${x.items.filter(i => i.status === 'open').length}</td><td class="num">${x.items.filter(i => i.status === 'deviation').length}</td><td><button class="btn sm ghost" data-act="spc-open" data-id="${esc(x.id)}">Open</button></td></tr>`).join('')}</tbody></table></div>` : ''}</section>`;
  }
  const q = E.normMatch(UI.spcQ || ''), f = UI.spcF || '', items = c.items.map((it, i) => ({ ...it, i })).filter(it => (!f || it.status === f || it.kind === f) && (!q || E.normMatch([it.clause, it.req, it.note].join(' ')).includes(q)));
  const cnt = k => c.items.filter(i => i.status === k).length;
  return `<section class="card pad"><div class="row"><button class="btn ghost sm" data-act="spc-back">‹ All</button><h2 style="margin:0" dir="auto">${esc(c.name)}</h2><span class="spacer"></span><button class="btn sm" data-act="spc-export">⬇ Compliance statement (Excel)</button><button class="btn sm" data-act="spc-tasks">${I.plus} Tasks for submittals and tests</button><button class="btn ghost sm danger" data-act="spc-del">${I.trash}</button></div>
    <div class="row small">${SPC_ST.map(([k, l]) => `<span class="chip ${k === 'deviation' ? 'crit' : k === 'comply' ? 'ok' : ''}">${l}: ${cnt(k)}</span>`).join('')}</div>
    <div class="toolbar row"><label class="search">${I.search}<input class="input" type="search" placeholder="Search clause or text…" value="${esc(UI.spcQ || '')}" data-chg="eng-q" data-k="spcQ"></label><select class="input" data-chg="spc-filter" style="width:auto"><option value="">All</option>${[...SPC_ST, ...SPC_KIND].map(([k, l]) => `<option value="${k}" ${f === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="small muted">${items.length} shown</span></div>
    <div class="mon-scroll"><table class="tbl reg-tbl"><thead><tr><th>Clause</th><th>Requirement</th><th>Type</th><th>Status</th><th>Comment / offer reference</th></tr></thead><tbody>${items.slice(0, 400).map(it => `<tr class="${it.status === 'deviation' ? 'risk' : ''}"><td class="nowrap mono small">${esc(it.clause || '')}${it.page ? `<div class="muted">p. ${esc(it.page)}</div>` : ''}</td><td dir="auto" class="small" style="min-width:280px">${esc(it.req)}</td><td><select class="input" data-chg="spc-i" data-i="${it.i}" data-k="kind">${SPC_KIND.map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><select class="input" data-chg="spc-i" data-i="${it.i}" data-k="status">${SPC_ST.map(([k, l]) => `<option value="${k}" ${it.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td><td><input class="input hold-render" value="${esc(it.note || '')}" data-chg="spc-i" data-i="${it.i}" data-k="note" dir="auto" style="min-width:180px"></td></tr>`).join('')}</tbody></table></div></section>`;
}
Object.assign(CHG, {
  'spc-file': async el => {
    const f = el.files[0]; if (!f) return; UI.spc.busy = true; render();
    try {
      const bytes = new Uint8Array(await f.arrayBuffer()), r = await nbExtract(f.name, bytes);
      let items = specLocal(r.text);
      if (St.sample && r.text) {
        try {
          const ai = await St.sample.json(`List every requirement in this specification that a supplier or contractor must comply with. Keep the clause number, quote the requirement briefly but completely (numbers and units exactly), and classify it: performance, material, test, submittal, warranty or other. Reply JSON: {"items":[{"clause":"2.3.1","page":"4","req":"…","kind":"material"}]}\n\nSPECIFICATION:\n${E.clip(r.text, 180000)}`, { modelTier: 'complex' });
          const got = ((ai && ai.items) || []).filter(x => x && x.req).map(x => ({ clause: String(x.clause || ''), page: String(x.page || ''), req: String(x.req), kind: SPC_KIND.some(k => k[0] === x.kind) ? x.kind : 'other', status: 'open', note: '' }));
          if (got.length) items = got;
        } catch (e) { toast('AI not available — the sentences with “shall” are listed instead.', { err: true }); }
      }
      const id = E.uid('sp'); colPut('speccheck', { id, name: f.name, items, createdAt: nowISO() }); UI.spc.id = id;
    } catch (e) { toast('Could not read it: ' + (e.message || e), { err: true }); }
    UI.spc.busy = false; render();
  },
  'spc-filter': el => { UI.spcF = el.value; render(); },
  'spc-i': el => { const c = clone(St.cols.speccheck.get(UI.spc.id)); c.items[+el.dataset.i][el.dataset.k] = el.value; colPut('speccheck', c); if (el.tagName === 'SELECT') render(); },
});
Object.assign(ACT, {
  'spc-open': el => { UI.spc.id = el.dataset.id; render(); },
  'spc-back': () => { UI.spc.id = null; render(); },
  'spc-del': () => { colDel('speccheck', UI.spc.id); UI.spc.id = null; render(); },
  'spc-export': () => { const c = St.cols.speccheck.get(UI.spc.id); regExport('Compliance statement', ['Clause', 'Page', 'Requirement', 'Type', 'Compliance', 'Comment / reference'], c.items.map(i => [i.clause, i.page, i.req, (SPC_KIND.find(k => k[0] === i.kind) || [, ''])[1], (SPC_ST.find(k => k[0] === i.status) || [, ''])[1], i.note || ''])); },
  'spc-tasks': () => {
    const c = clone(St.cols.speccheck.get(UI.spc.id)); let n = 0;
    for (const it of c.items) if ((it.kind === 'submittal' || it.kind === 'test') && it.status !== 'na' && !it.taskId) { const t = makeTask({ title: `${it.kind === 'test' ? 'Test' : 'Submit'}: ${E.clip(it.req, 110)}`, type: it.kind === 'test' ? 'inspect' : 'submit', notes: `${c.name}${it.clause ? ', clause ' + it.clause : ''}: ${it.req}`, history: [{ at: nowISO(), text: 'From a specification checklist' }] }); putTask(t); it.taskId = t.id; n++; }
    colPut('speccheck', c); toast(n ? `${n} task${n > 1 ? 's' : ''} added.` : 'No new submittals or tests to add.'); render();
  },
});
window.__AR_Q = { specLocal }; // test hook
