/* ---------- Tools: engineering calculators, offer comparison (TBE), CRS responses, meeting minutes ---------- */
/* ---------- plus: Ask your register, learning from corrections, reply drafts ---------- */
const G = 9.80665;
const CALC = {
  // water properties (1–100 °C): density (Tanaka 2001 fit) and vapour pressure (Antoine, mmHg → kPa)
  rho: T => 1000 * (1 - ((T + 288.9414) / (508929.2 * (T + 68.12963))) * (T - 3.9863) ** 2),
  pv: T => 0.133322 * Math.pow(10, 8.07131 - 1730.63 / (233.426 + T)),
  patm: z => 101.325 * Math.pow(1 - 2.25577e-5 * z, 5.25588), // kPa at altitude z (m)
  pipe({ q, d, l, eps, nu, k }) {
    const D = d / 1000, A = Math.PI * D * D / 4, v = q / 3600 / A, Re = v * D / (nu * 1e-6);
    const f = Re < 2300 ? 64 / Re : 0.25 / Math.log10((eps / 1000) / (3.7 * D) + 5.74 / Math.pow(Re, 0.9)) ** 2;
    const hv = v * v / (2 * G), hf = f * (l / D) * hv, hm = (k || 0) * hv;
    return { v, Re, f, hf, hm, h: hf + hm, per100: l ? 100 * hf / l : 0, regime: Re < 2300 ? 'laminar' : Re < 4000 ? 'transitional' : 'turbulent' };
  },
  pump({ q, h, sg, ep, em }) {
    const ph = 1000 * sg * G * (q / 3600) * h / 1000, shaft = ph / (ep / 100), input = shaft / (em / 100);
    const IEC = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160, 200, 250, 315, 355, 400, 450, 500, 560, 630];
    const need = shaft * (shaft < 22 ? 1.15 : 1.1);
    return { ph, shaft, input, need, motor: IEC.find(x => x >= need) || null };
  },
  npsh({ z, t, hs, hf, npshr }) {
    const pa = CALC.patm(z), pv = CALC.pv(t), rho = CALC.rho(t);
    const ha = pa * 1000 / (rho * G), hvp = pv * 1000 / (rho * G), npsha = ha - hvp + hs - hf;
    return { pa, pv, rho, ha, hvp, npsha, margin: npshr ? npsha - npshr : null, ratio: npshr ? npsha / npshr : null };
  },
  // Metcalf & Eddy: Pw = w·R·T1 / (29.7·n·e) · [(p2/p1)^0.283 − 1]
  blower({ qn, t, z, dp, e }) {
    const w = qn * 1.293 / 3600, T1 = t + 273.15, p1 = CALC.patm(z), p2 = p1 + dp, n = 0.283;
    const pw = (w * 8.314 * T1) / (29.7 * n * (e / 100)) * (Math.pow(p2 / p1, n) - 1);
    return { w, p1, p2, ratio: p2 / p1, pw };
  },
};
const CALCS = {
  pipe: { label: '🚰 Pipe velocity & head loss', fields: [['q', 'Flow', 'm³/h', 410], ['d', 'Inside diameter', 'mm', 300], ['l', 'Length', 'm', 120], ['eps', 'Roughness', 'mm', 0.05], ['nu', 'Kinematic viscosity', 'mm²/s (cSt)', 1.0], ['k', 'Sum of fitting K', '—', 0]],
    out: r => [['Velocity', r.v, 'm/s', 2], ['Reynolds number', r.Re, '', 0], ['Flow regime', r.regime], ['Friction factor (Swamee–Jain)', r.f, '', 4], ['Friction loss', r.hf, 'm', 2], ['Fittings loss', r.hm, 'm', 2], ['Total head loss', r.h, 'm', 2], ['Friction loss per 100 m', r.per100, 'm', 2]],
    note: 'Darcy–Weisbach with the Swamee–Jain friction factor (turbulent flow). Typical roughness: new steel 0.045 mm, ductile iron (cement lined) 0.1 mm, HDPE 0.007 mm.' },
  pump: { label: '⚙️ Pump power & motor size', fields: [['q', 'Flow', 'm³/h', 410], ['h', 'Total head', 'm', 14.5], ['sg', 'Specific gravity', '—', 1.0], ['ep', 'Pump efficiency', '%', 78], ['em', 'Motor efficiency', '%', 94]],
    out: r => [['Hydraulic power', r.ph, 'kW', 2], ['Shaft power', r.shaft, 'kW', 2], ['Electrical input', r.input, 'kW', 2], ['Shaft power + margin', r.need, 'kW', 2], ['Next IEC motor size', r.motor, 'kW', 2]],
    note: 'P = ρ·g·Q·H. Margin used for the motor: 15 % below 22 kW, 10 % above — check your project specification.' },
  npsh: { label: '💧 NPSH available', fields: [['z', 'Site altitude', 'm above sea level', 20], ['t', 'Liquid temperature', '°C', 30], ['hs', 'Static suction head (+ above pump, − lift)', 'm', 2.35], ['hf', 'Suction line losses', 'm', 0.4], ['npshr', 'NPSH required (pump data)', 'm', 4.2]],
    out: r => [['Atmospheric pressure', r.pa, 'kPa', 2], ['Vapour pressure', r.pv, 'kPa', 3], ['Atmospheric head', r.ha, 'm', 2], ['Vapour pressure head', r.hvp, 'm', 2], ['NPSH available', r.npsha, 'm', 2], ['Margin (NPSHa − NPSHr)', r.margin, 'm', 2], ['Margin ratio (NPSHa / NPSHr)', r.ratio, '', 2]],
    note: 'NPSHa = (Patm − Pv)/(ρg) + hs − hf, for water. ANSI/HI 9.6.1 recommends margin ratios from about 1.1 to 2.5 depending on the service — check your specification.' },
  blower: { label: '🌬️ Blower power', fields: [['qn', 'Air flow', 'Nm³/h', 6000], ['t', 'Inlet air temperature', '°C', 40], ['z', 'Site altitude', 'm', 20], ['dp', 'Pressure rise (water depth + losses)', 'kPa', 60], ['e', 'Blower efficiency', '%', 75]],
    out: r => [['Mass flow', r.w, 'kg/s', 3], ['Inlet pressure', r.p1, 'kPa abs', 2], ['Discharge pressure', r.p2, 'kPa abs', 2], ['Pressure ratio', r.ratio, '', 3], ['Blower power', r.pw, 'kW', 1]],
    note: 'Adiabatic compression (Metcalf & Eddy): Pw = w·R·T1/(29.7·n·e)·[(p2/p1)^0.283 − 1]. Pressure rise ≈ diffuser submergence × 9.81 kPa/m + diffuser and pipe losses.' },
};
UI.toolTab = UI.toolTab || 'wb'; UI.calc = UI.calc || 'pipe'; UI.calcIn = UI.calcIn || {};
const TOOL_TABS = [['wb', '📗 My workbooks'], ['calc', '🧮 Calculators'], ['compare', '⚖️ Compare offers'], ['crs', '📝 CRS responses'], ['minutes', '🗣️ Meeting minutes']];
VIEWS.push('tools');
VIEW_FN.tools = () => `<div class="wrap tools-page">
  <div class="page-head"><div><h1>Tools</h1><div class="sub">Quick engineering checks, offer comparisons, comment responses and meeting actions — linked to your tasks.</div></div></div>
  <div class="seg tabs" role="tablist">${TOOL_TABS.map(([k, l]) => `<button role="tab" data-act="tool-tab" data-tab="${k}" aria-pressed="${UI.toolTab === k}">${l}</button>`).join('')}</div>
  ${({ wb: () => (UI.wb.open ? wbViewHTML() : wbLibraryHTML()), calc: toolCalc, compare: toolCompare, crs: toolCRS, minutes: toolMinutes }[UI.toolTab] || toolCalc)()}
</div>`;
const fmtNum = (v, dp) => v === null || v === undefined || Number.isNaN(v) ? '—' : typeof v === 'string' ? v : Number(v).toLocaleString('en-GB', { maximumFractionDigits: dp ?? 2, minimumFractionDigits: 0 });
function calcValues(k) { const c = CALCS[k], saved = UI.calcIn[k] || {}; return Object.fromEntries(c.fields.map(([f, , , d]) => [f, saved[f] ?? d])); }
function calcResultHTML(k) {
  const c = CALCS[k], v = calcValues(k);
  const bad = Object.entries(v).some(([f, x]) => !Number.isFinite(+x)) || (k === 'pipe' && !(+v.d > 0 && +v.q > 0)) || (k === 'pump' && !(+v.ep > 0 && +v.em > 0)) || (k === 'blower' && !(+v.e > 0));
  if (bad) return '<p class="small muted">Enter positive numbers to see the result.</p>';
  const r = CALC[k](Object.fromEntries(Object.entries(v).map(([a, b]) => [a, +b])));
  return `<table class="tbl calc-out"><tbody>${c.out(r).map(([l, x, u, dp]) => `<tr><td>${esc(l)}</td><td class="num"><b>${esc(fmtNum(x, dp))}</b> ${esc(u || '')}</td></tr>`).join('')}</tbody></table>
    ${k === 'npsh' && r.ratio !== null ? callout(r.ratio >= 1.3 && r.margin >= 1 ? 'ok' : r.ratio >= 1.1 ? 'warn' : 'crit', r.ratio >= 1.1 ? `Margin ratio ${fmtNum(r.ratio, 2)} — compare with the margin your specification asks for.` : `NPSHa is below 1.1 × NPSHr — cavitation risk. Raise the suction level, cut suction losses or choose a pump with lower NPSHr.`) : ''}`;
}
function toolCalc() {
  const k = UI.calc, c = CALCS[k], v = calcValues(k);
  return `<div class="calc-layout"><nav class="calc-list">${Object.entries(CALCS).map(([id, x]) => `<button class="${id === k ? 'on' : ''}" data-act="calc-pick" data-k="${id}">${esc(x.label)}</button>`).join('')}</nav>
    <section class="card pad calc-card"><h2>${esc(c.label)}</h2><div class="grid-2">${c.fields.map(([f, l, u]) => `<label class="field"><span>${esc(l)} <span class="muted">${esc(u)}</span></span><input class="input num" type="number" step="any" id="calc-${f}" data-calc="${f}" value="${esc(v[f])}"></label>`).join('')}</div>
      <div id="calc-out">${calcResultHTML(k)}</div><p class="small muted">${esc(c.note)}</p>
      <div class="row"><button class="btn sm" data-act="calc-copy">Copy result</button><button class="btn sm ghost" data-act="calc-reset">Reset values</button>${UI.drawerTask ? '' : ''}</div></section></div>`;
}
document.addEventListener('input', e => {
  const el = e.target; if (!el.dataset || !el.dataset.calc) return;
  (UI.calcIn[UI.calc] = UI.calcIn[UI.calc] || {})[el.dataset.calc] = el.value;
  const o = $('#calc-out'); if (o) o.innerHTML = deco(calcResultHTML(UI.calc));
});
function calcText() {
  const k = UI.calc, c = CALCS[k], v = calcValues(k), r = CALC[k](Object.fromEntries(Object.entries(v).map(([a, b]) => [a, +b])));
  return [c.label.replace(/^\S+\s/, ''), ...c.fields.map(([f, l, u]) => `${l}: ${v[f]} ${u}`), '—', ...c.out(r).map(([l, x, u, dp]) => `${l}: ${fmtNum(x, dp)} ${u || ''}`.trim()), '', c.note].join('\n');
}

/* --- shared: pick files and read their text --- */
function pickFiles(accept, multiple) {
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multiple; i.onchange = () => res([...i.files]); i.click(); });
}
async function readFileText(f) {
  const bytes = new Uint8Array(await f.arrayBuffer());
  const r = await E.extract({ name: f.name, mime: f.type, bytes }, { vision: false });
  return { name: f.name, text: r.text || '', note: r.note || '', status: r.status };
}

/* --- compare offers / datasheets (technical bid evaluation) --- */
UI.cmp = UI.cmp || { files: [], req: '', result: null, busy: false };
function toolCompare() {
  const c = UI.cmp;
  return `<section class="card pad cmp-in"><p class="small muted" style="margin:0">Add 2–4 offers or datasheets (PDF, Word, Excel or text). Claude lines up the technical parameters side by side and flags deviations from your requirements. Nothing is sent until you press Compare.</p>
      <div class="row"><button class="btn" data-act="cmp-add">📎 Add files</button>${c.files.map((f, i) => `<span class="chip">${esc(f.name)}${f.text ? '' : ' ⚠'}<button class="icon-btn xs" data-act="cmp-rm" data-i="${i}" aria-label="Remove">${I.x}</button></span>`).join('')}</div>
      <label class="field"><span>Requirements to check against (optional — paste the spec clauses or datasheet)</span><textarea class="input" id="cmp-req" rows="3" dir="auto" placeholder="e.g. Duty 410 m³/h at 14.5 m; NPSHr ≤ 4 m; motor IE3, IP55; casing ductile iron">${esc(c.req)}</textarea></label>
      <div class="row"><button class="btn primary" data-act="cmp-run" ${c.files.length >= 2 && St.sample && !c.busy ? '' : 'disabled'}>${c.busy ? 'Comparing…' : '⚖️ Compare'}</button>${St.sample ? '' : '<span class="small muted">Comparing needs Claude (connect it in Setup).</span>'}${c.result ? '<button class="btn" data-act="cmp-export">⬇ Excel</button>' : ''}</div></section>
    ${c.result ? cmpResultHTML(c.result) : ''}`;
}
const CMP_CLS = { ok: 'ok', deviation: 'crit', missing: 'warn', unclear: '', better: 'accent' };
function cmpResultHTML(r) {
  return `<section class="card pad"><div class="section-title"><h2>Comparison</h2></div>${r.summary ? `<p dir="auto">${esc(r.summary)}</p>` : ''}
    <div class="tbl-wrap"><table class="tbl cmp-tbl"><thead><tr><th>Parameter</th><th>Required</th>${r.names.map(n => `<th dir="auto">${esc(n)}</th>`).join('')}</tr></thead><tbody>
    ${r.parameters.map(p => `<tr><td dir="auto"><b>${esc(p.name)}</b>${p.unit ? ` <span class="muted">${esc(p.unit)}</span>` : ''}</td><td dir="auto">${esc(p.requirement || '')}</td>${r.names.map((_, i) => `<td dir="auto" class="cmp-${esc((p.status || [])[i] || '')}">${esc((p.values || [])[i] || '—')}${(p.status || [])[i] && (p.status || [])[i] !== 'ok' ? ` <span class="chip ${CMP_CLS[(p.status || [])[i]] || ''}">${esc((p.status || [])[i])}</span>` : ''}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>${r.recommendation ? callout('info', esc(r.recommendation)) : ''}<p class="small muted">Check every value against the source documents before you rely on it.</p></section>`;
}
async function cmpRun() {
  const c = UI.cmp; c.busy = true; c.req = ($('#cmp-req') || {}).value || c.req; render();
  const names = c.files.map(f => f.name);
  const prompt = `You are preparing a technical bid evaluation (TBE) for a water/wastewater engineer. Compare these ${names.length} documents parameter by parameter.
${c.req ? 'REQUIREMENTS:\n' + c.req + '\n' : ''}${c.files.map((f, i) => `=== DOCUMENT ${i + 1}: ${f.name} ===\n${E.clip(f.text, Math.floor(150000 / c.files.length))}`).join('\n\n')}
Rules: use only values written in the documents; write "not stated" when a document does not give a value; never guess. Put the most important technical parameters first (duty, performance, materials, motor/electrical, standards, weights, delivery, warranty, exclusions).
Reply with JSON only: {"parameters":[{"name":"…","unit":"…","requirement":"from REQUIREMENTS or empty","values":["one per document, in order"],"status":["ok|deviation|missing|unclear|better, one per document"]}],"summary":"two sentences","recommendation":"one sentence, or empty"}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: 'complex' });
    const ps = (r && Array.isArray(r.parameters) ? r.parameters : []).filter(p => p && p.name).slice(0, 80);
    c.result = ps.length ? { names, parameters: ps.map(p => ({ name: String(p.name), unit: String(p.unit || ''), requirement: String(p.requirement || ''), values: names.map((_, i) => String((p.values || [])[i] ?? '')), status: names.map((_, i) => String((p.status || [])[i] ?? '')) })), summary: String(r.summary || ''), recommendation: String(r.recommendation || '') } : null;
    if (!c.result) toast('Claude could not find comparable parameters in these files.', { err: true });
  } catch (e) { toast('Comparison failed: ' + (e && e.message || 'try again'), { err: true }); }
  c.busy = false; render();
}
async function sheetDownload(name, aoa, sheet) {
  const X = await E.need('xlsx'); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(aoa), sheet || 'Sheet1');
  return offerFile(name, new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

/* --- CRS: comment response sheet --- */
UI.crs = UI.crs || null;
function toolCRS() {
  const c = UI.crs;
  if (!c) return `<section class="card pad"><p style="margin-top:0">Open the consultant’s comment response sheet (Excel or CSV). Each comment gets a draft response from your tasks and documents — you edit and accept them, then save the sheet with the Response column filled.</p><button class="btn primary" data-act="crs-open">📂 Open CRS file</button></section>`;
  return `<section class="card pad"><div class="row"><b dir="auto">📝 ${esc(c.name)}</b><span class="small muted">${c.rows.length} comments · column “${esc(c.head[c.ci] || '')}”</span><span class="spacer"></span>
      <button class="btn sm" data-act="crs-draft" ${St.sample && !c.busy ? '' : 'disabled'}>${c.busy ? 'Drafting…' : '✨ Draft responses'}</button><button class="btn sm primary" data-act="crs-save">⬇ Save sheet</button><button class="btn sm ghost" data-act="crs-close">Close</button></div>
      ${St.sample ? '' : '<p class="small muted">Drafting needs Claude; you can still type responses and save the sheet.</p>'}
      <label class="field"><span>Context for the responses (optional)</span><textarea class="input" id="crs-ctx" rows="2" dir="auto" placeholder="e.g. Vendor confirmed IP68 actuators; coating per spec clause 5.3">${esc(c.ctx || '')}</textarea></label></section>
    <div class="crs-list">${c.rows.map((r, i) => `<article class="card pad crs-row"><div class="row"><span class="mono">${esc(r.no || String(i + 1))}</span><span dir="auto" class="crs-c">${esc(r.comment)}</span></div>
      <textarea class="input" data-crs="${i}" rows="2" dir="auto" placeholder="Response…">${esc(r.response || '')}</textarea>${r.basis ? `<div class="small muted" dir="auto">Based on: ${esc(r.basis)}</div>` : ''}</article>`).join('')}</div>`;
}
async function crsOpen() {
  const [f] = await pickFiles('.xlsx,.xls,.csv'); if (!f) return;
  try {
    const X = await E.need('xlsx'); const wb = X.read(new Uint8Array(await f.arrayBuffer()), { type: 'array' });
    const sn = wb.SheetNames[0], aoa = X.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
    const hi = aoa.findIndex(r => r.some(c => /comment/i.test(String(c)))); if (hi < 0) { toast('No “Comment” column found in the first sheet.', { err: true }); return; }
    const head = aoa[hi].map(String), ci = head.findIndex(c => /comment/i.test(c));
    let ri = head.findIndex((c, i) => i !== ci && /response|reply|answer|contractor/i.test(c)); if (ri < 0) { ri = head.length; head.push('Response'); }
    const ni = head.findIndex(c => /^(no|item|#|s\.?n|ref)/i.test(c.trim()));
    const rows = aoa.slice(hi + 1).map((r, k) => ({ at: hi + 1 + k, no: ni >= 0 ? String(r[ni] || '') : '', comment: String(r[ci] || '').trim(), response: String(r[ri] || '') })).filter(r => r.comment);
    UI.crs = { name: f.name, sn, aoa, head, hi, ci, ri, rows, ctx: '' }; render();
  } catch (e) { toast('Could not read that file: ' + (e && e.message || e), { err: true }); }
}
async function crsDraft() {
  const c = UI.crs; if (!c) return; c.ctx = ($('#crs-ctx') || {}).value || ''; crsSync(); c.busy = true; render();
  const q = E.normMatch(c.name + ' ' + c.rows.map(r => r.comment).join(' ')).split(' ').filter(w => w.length > 3);
  const related = [...St.tasks.values()].map(t => ({ t, s: q.filter(w => E.normMatch([t.title, t.action, subsOf(t).map(x => x.text).join(' '), t.notes].join(' ')).includes(w)).length })).filter(x => x.s >= 2).sort((a, b) => b.s - a.s).slice(0, 12).map(x => x.t);
  const prompt = `Draft contractor responses for a comment response sheet (CRS) from the consultant, for the engineer ${St.settings.me.name || ''}.
FILE: ${c.name}
CONTEXT FROM THE ENGINEER: ${c.ctx || '(none)'}
RELATED TASKS AND NOTES:\n${related.map(t => `- ${t.ref} ${t.title} | status ${t.status} | next: ${t.nextStep || ''} | notes: ${E.clip(t.notes || '', 200)} | items: ${subsOf(t).map(x => (x.done ? '[x] ' : '[ ] ') + x.text).join('; ')}`).join('\n') || '-'}
COMMENTS:\n${c.rows.map((r, i) => `${i + 1}. ${r.comment}`).join('\n')}
Rules: write short, professional responses in the language of each comment ("Noted, will be incorporated in Rev X", "Agreed — …", "Clarification: …"). Use only facts from the context and tasks; where you need information you do not have, write [TO CONFIRM: what is needed]. Never invent values.
Reply with JSON only: {"responses":[{"i":1,"response":"…","basis":"task ref or context used, or empty"}]}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: 'complex' });
    for (const x of (r && r.responses) || []) { const row = c.rows[(+x.i || 0) - 1]; if (row && x.response && !row.response.trim()) { row.response = String(x.response); row.basis = String(x.basis || ''); } }
  } catch (e) { toast('Drafting failed: ' + (e && e.message || 'try again'), { err: true }); }
  c.busy = false; render();
}
function crsSync() { const c = UI.crs; if (!c) return; document.querySelectorAll('[data-crs]').forEach(t => { const r = c.rows[+t.dataset.crs]; if (r) r.response = t.value; }); }
async function crsSave() {
  crsSync(); const c = UI.crs; const aoa = c.aoa.map(r => [...r]); aoa[c.hi] = c.head;
  for (const r of c.rows) { const row = aoa[r.at] || (aoa[r.at] = []); while (row.length <= c.ri) row.push(''); row[c.ri] = r.response; }
  try { await sheetDownload(c.name.replace(/\.(xlsx|xls|csv)$/i, '') + '-responses.xlsx', aoa, c.sn); } catch (e) { toast('Could not save: ' + (e && e.message || e), { err: true }); }
}

/* --- meeting minutes → tasks --- */
UI.mtg = UI.mtg || { notes: '', date: '', project: '', items: null, busy: false };
function parseMinutesLocal(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(l => /^([-*•]|\d+[.)]|action\b|ACTION\b)/.test(l)).map(l => l.replace(/^([-*•]|\d+[.)])\s*/, '').replace(/^action:?\s*/i, ''))
    .filter(l => l.length > 6).map(l => { const m = /\s[-–—(]\s*([A-Z][\w.]+(?: [A-Z][\w.]+)?)\)?\s*$/.exec(l); const owner = m ? m[1] : ''; return { title: m ? l.slice(0, m.index).trim() : l, owner, mine: !owner || /^(me|I|myself)$/i.test(owner), deadline: '', accept: true }; });
}
function toolMinutes() {
  const m = UI.mtg, projects = [...new Set([...St.tasks.values()].map(t => (t.project || '').trim()).filter(Boolean))].sort();
  return `<section class="card pad mtg-in"><div class="grid-2"><label class="field"><span>Meeting date</span><input class="input" type="date" id="mtg-date" value="${esc(m.date || T())}"></label>
      <label class="field"><span>Project</span><input class="input" id="mtg-proj" list="mtg-projs" dir="auto" value="${esc(m.project)}" placeholder="Project"><datalist id="mtg-projs">${projects.map(p => `<option value="${esc(p)}">`).join('')}</datalist></label></div>
      <label class="field"><span>Notes or minutes</span><textarea class="input" id="mtg-notes" rows="9" dir="auto" placeholder="Paste or type the meeting notes. Lines like “- Send revised valve schedule — Omar” become actions.">${esc(m.notes)}</textarea></label>
      <div class="row"><button class="btn primary" data-act="mtg-extract" ${m.busy ? 'disabled' : ''}>${m.busy ? 'Reading…' : St.sample ? '✨ Find the actions' : 'Find the actions'}</button></div></section>
    ${m.items ? `<section class="card pad"><div class="section-title"><h2>Actions found</h2><span class="count">${m.items.length}</span></div>${m.items.length ? `<div class="mtg-items">${m.items.map((x, i) => `<label class="mtg-item"><input type="checkbox" data-mtg="${i}" ${x.accept ? 'checked' : ''}><span><b dir="auto">${esc(x.title)}</b><small>${x.mine ? 'Mine' : 'Waiting on ' + esc(x.owner || 'someone')}${x.deadline ? ' · due ' + esc(fmtDate(x.deadline)) : ''}</small></span></label>`).join('')}</div>
      <div class="row end"><button class="btn primary" data-act="mtg-create">Add ${m.items.filter(x => x.accept).length} task${m.items.filter(x => x.accept).length === 1 ? '' : 's'}</button></div>` : '<p class="small muted">No actions found. Start action lines with “-” or “Action:”.</p>'}</section>` : ''}`;
}
async function mtgExtract() {
  const m = UI.mtg, v = id => (($('#' + id) || {}).value || '').trim();
  m.notes = v('mtg-notes'); m.date = v('mtg-date') || T(); m.project = v('mtg-proj');
  if (!m.notes) { toast('Paste the meeting notes first.'); return; }
  if (!St.sample) { m.items = parseMinutesLocal(m.notes); render(); return; }
  m.busy = true; render();
  const prompt = `Extract the action items from these meeting notes for ${St.settings.me.name || 'me'} (aliases: me, I${St.settings.me.name ? ', ' + St.settings.me.name.split(' ')[0] : ''}). Meeting date ${m.date}. Project: ${m.project || 'unknown'}.
NOTES:\n${E.clip(m.notes, 60000)}
Rules: one item per distinct action; "owner" is the person who must act ("me" when it is me); convert relative dates using the meeting date; never invent actions or dates.
Reply with JSON only: {"tasks":[{"title":"verb-first, specific","owner":"me or a name","deadline":"YYYY-MM-DD or null","note":"short context or empty"}]}`;
  try {
    const r = await St.sample.json(prompt, { modelTier: 'quick' });
    m.items = ((r && r.tasks) || []).filter(x => x && x.title).slice(0, 40).map(x => ({ title: String(x.title), owner: /^me$/i.test(x.owner || '') ? '' : String(x.owner || ''), mine: !x.owner || /^me$/i.test(x.owner), deadline: /^\d{4}-\d{2}-\d{2}$/.test(x.deadline || '') ? x.deadline : '', note: String(x.note || ''), accept: true }));
  } catch { m.items = parseMinutesLocal(m.notes); toast('Claude was unavailable — found the actions from the bullet lines instead.'); }
  m.busy = false; render();
}
function mtgCreate() {
  const m = UI.mtg; document.querySelectorAll('[data-mtg]').forEach(c => { const x = m.items[+c.dataset.mtg]; if (x) x.accept = c.checked; });
  const pick = m.items.filter(x => x.accept); if (!pick.length) return;
  const refs = nextRefs(pick.length); let k = 0;
  for (const x of pick) putTask(makeTask({ ref: refs[k++], title: x.title, action: x.note || '', project: m.project || '', ownership: x.mine ? 'mine' : 'waiting', owner: x.mine ? 'me' : x.owner, status: x.mine ? 'todo' : 'waiting', deadline: x.deadline || null, deadlineBasis: x.deadline ? 'explicit' : 'none', source: 'meeting', notes: `From the meeting on ${fmtDate(m.date, { day: 'numeric', month: 'short', year: 'numeric' })}`, history: [{ at: nowISO(), text: 'Created from meeting minutes' }] }));
  toast(`${pick.length} task${pick.length === 1 ? '' : 's'} added from the meeting.`, { action: 'Open to-do', fn: () => go('todo') });
  UI.mtg = { notes: '', date: '', project: m.project, items: null, busy: false }; render(); setTimeout(maybeAutoCategorize, 300);
}

/* --- Ask your register --- */
UI.ask = UI.ask || { q: '', answer: null, busy: false };
function openAsk(q) {
  if (typeof q === 'string' && q) { UI.ask.q = q; UI.ask.answer = null; setTimeout(askGo, 0); }
  const a = UI.ask, m = $('#modal');
  m.innerHTML = deco(`<div class="card pad ask-card" role="dialog" aria-label="Ask your register"><div class="row"><b>💬 Ask your register</b><span class="spacer"></span><button class="icon-btn" data-act="close-modal" aria-label="Close">${I.x}</button></div>
    <div class="row" style="flex-wrap:nowrap"><input class="input" id="ask-q" dir="auto" autocomplete="off" placeholder="e.g. What is still open with the consultant on ELM?" value="${esc(a.q)}"><button class="btn primary" data-act="ask-go" ${a.busy ? 'disabled' : ''}>${a.busy ? '…' : 'Ask'}</button></div>
    <div class="ask-sugs">${['What did I finish this week?', 'Which documents were returned Code 3?', 'Who am I waiting on, and for how long?', 'What is due in the next 7 days?'].map(s => `<button class="chip" data-act="ask-sug" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    <div id="ask-ans">${a.busy ? '<p class="muted">Looking through your tasks, emails and documents…</p>' : a.answer ? askAnswerHTML(a.answer) : ''}</div></div>`);
  m.hidden = false; setTimeout(() => $('#ask-q')?.focus(), 30);
}
function askAnswerHTML(r) {
  const tasks = (r.refs || []).map(ref => [...St.tasks.values()].find(t => t.ref === ref)).filter(Boolean);
  return `<div class="ask-ans"><p dir="auto" style="white-space:pre-wrap">${esc(r.answer)}</p>${tasks.length ? `<div class="dlist">${tasks.map(t => `<div class="row"><button class="dtitle" data-act="ask-open" data-id="${esc(t.id)}" dir="auto">${esc(t.ref)} ${esc(t.title)}</button>${chipStatus(t.status)}</div>`).join('')}</div>` : ''}${r.local ? '<p class="small muted">Search results (connect Claude in Setup for answers in plain language).</p>' : '<p class="small muted">Answered from your register only — open the tasks to check the details.</p>'}</div>`;
}
async function askGo() {
  const a = UI.ask; a.q = (($('#ask-q') || {}).value || '').trim(); if (!a.q) return;
  if (!St.sample) {
    const words = E.normMatch(a.q).split(' ').filter(w => w.length > 2);
    const hits = [...St.tasks.values()].map(t => ({ t, s: words.filter(w => E.normMatch([t.ref, t.title, t.action, t.project, t.owner, t.requestedBy, topicOf(t)].join(' ')).includes(w)).length })).filter(x => x.s).sort((x, y) => y.s - x.s).slice(0, 10);
    a.answer = { answer: hits.length ? `${hits.length} task${hits.length === 1 ? '' : 's'} match your question:` : 'Nothing matched.', refs: hits.map(x => x.t.ref), local: true }; openAsk(); return;
  }
  a.busy = true; a.answer = null; openAsk();
  const line = t => [t.ref, t.title, 'status ' + t.status, t.project, topicOf(t), t.ownership === 'waiting' ? 'waiting on ' + (t.owner || '') : '', t.requestedBy ? 'from ' + t.requestedBy : '', t.deadline ? 'due ' + t.deadline : '', t.completedAt ? 'done ' + dayOf(t.completedAt) : '', t.nextStep ? 'next: ' + t.nextStep : '', subsOf(t).length ? `items ${subsDone(t)}/${subsOf(t).length}` : ''].filter(Boolean).join(' | ');
  const prompt = `Answer the question using ONLY the engineer's register below. Today is ${T()}. Be brief and specific; give task refs. If the register does not contain the answer, say so.
QUESTION: ${a.q}
TASKS:\n${[...St.tasks.values()].slice(0, 600).map(line).join('\n')}
DOCUMENTS:\n${colList('docreg').slice(0, 200).map(d => [d.number, d.title, d.revision && 'rev ' + d.revision, d.code && 'code ' + d.code, d.status, d.by, d.date, d.project].filter(Boolean).join(' | ')).join('\n') || '-'}
RECENT EMAILS:\n${[...St.emails.values()].sort((x, y) => (y.date || '').localeCompare(x.date || '')).slice(0, 60).map(e => `${dayOf(e.date)} | ${e.from} | ${e.subject} | ${E.clip((e.analysis && e.analysis.summary) || '', 160)}`).join('\n')}
Reply with JSON only: {"answer":"…","refs":["T-0001"]}`;
  try { const r = await St.sample.json(prompt, { modelTier: 'quick' }); a.answer = { answer: String((r && r.answer) || 'No answer.'), refs: Array.isArray(r && r.refs) ? r.refs.map(String) : [] }; }
  catch (e) { a.answer = { answer: 'Could not answer right now: ' + (e && e.message || 'try again'), refs: [] }; }
  a.busy = false; if (!$('#modal').hidden && $('#ask-q')) openAsk();
}
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'ask-q' && e.key === 'Enter') { e.preventDefault(); askGo(); } });
document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'j' && St.ready) { e.preventDefault(); openAsk(); } });

/* --- learn from corrections: when you change what Claude chose, later analyses are told --- */
const LEARN_FIELDS = ['project', 'priority', 'ownership', 'topic', 'discipline'];
const learned = () => ((St.cols.prefs.get('learned') || {}).items || []);
const senderKey = em => { const a = String((em && (em.fromEmail || em.from)) || '').toLowerCase(); const m = /@([\w.-]+)/.exec(a); return m ? '@' + m[1] : ''; };
const taskFieldChg = CHG['task-field'];
CHG['task-field'] = el => {
  const t = UI.drawer && UI.drawer.kind === 'task' && St.tasks.get(UI.drawer.id), f = el.dataset.field, before = t ? String(t[f] ?? '') : '';
  taskFieldChg(el);
  if (!t || !LEARN_FIELDS.includes(f) || !(t.emailIds || []).length || autoPrefs().learn === false) return;
  const after = String((St.tasks.get(t.id) || {})[f] ?? ''); if (!after || before === after) return;
  const em = St.emails.get(t.emailIds[0]), sender = senderKey(em);
  const items = learned().filter(x => !(x.field === f && x.sender === sender && x.from === before)).concat({ field: f, sender, from: before, to: after, subject: E.clip((em && em.subject) || '', 80), at: nowISO() }).slice(-60);
  colPut('prefs', { id: 'learned', items });
};
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
TASK_ACTIONS.push(t => t.status !== 'done' && isMine(t) && (t.emailIds || []).length ? `<button class="btn sm ghost" data-act="draft-mail" data-kind="reply" data-id="${esc(t.id)}">✉ Draft a reply</button>` : '');

Object.assign(ACT, {
  'tool-tab': el => { UI.toolTab = el.dataset.tab; render(); },
  'calc-pick': el => { UI.calc = el.dataset.k; render(); },
  'calc-reset': () => { delete UI.calcIn[UI.calc]; render(); },
  'calc-copy': async () => { try { await navigator.clipboard.writeText(calcText()); toast('Result copied.'); } catch { offerFile('calculation.txt', calcText()); } },
  'cmp-add': async () => { const fs = await pickFiles('.pdf,.docx,.xlsx,.xls,.csv,.txt,.eml', true); if (!fs.length) return; toast('Reading files…'); for (const f of fs.slice(0, 4 - UI.cmp.files.length)) { try { UI.cmp.files.push(await readFileText(f)); } catch (e) { toast(`Could not read ${f.name}.`, { err: true }); } } render(); },
  'cmp-rm': el => { UI.cmp.files.splice(+el.dataset.i, 1); render(); },
  'cmp-run': () => cmpRun(),
  'cmp-export': () => { const r = UI.cmp.result; if (r) sheetDownload(`technical-comparison-${T()}.xlsx`, [['Parameter', 'Unit', 'Required', ...r.names.flatMap(n => [n, 'Status'])], ...r.parameters.map(p => [p.name, p.unit, p.requirement, ...r.names.flatMap((_, i) => [p.values[i], p.status[i]])])], 'TBE'); },
  'crs-open': () => crsOpen(), 'crs-draft': () => crsDraft(), 'crs-save': () => crsSave(), 'crs-close': () => { UI.crs = null; render(); },
  'mtg-extract': () => mtgExtract(), 'mtg-create': () => mtgCreate(),
  'ask-go': () => askGo(), 'ask-sug': el => { UI.ask.q = el.dataset.q; openAsk(); askGo(); }, 'ask-open': el => { $('#modal').hidden = true; openDrawer('task', el.dataset.id); }, 'open-ask': () => openAsk(),
  'learn-clear': () => { colPut('prefs', { id: 'learned', items: [] }); render(); toast('Corrections forgotten.'); },
});
document.addEventListener('input', e => { if (e.target && e.target.dataset && e.target.dataset.crs !== undefined && UI.crs) { const r = UI.crs.rows[+e.target.dataset.crs]; if (r) r.response = e.target.value; } });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (St.ready && VIEWS.includes(v) && v !== UI.view) go(v); });
