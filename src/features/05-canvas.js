/* ---------- canvas extras: project bands, minimap, menus, export ---------- */
// Project bands: a soft coloured area behind each project's whole branch.
function projectBands(M) {
  const out = [];
  for (const P of M.projects) {
    if (P.x === undefined) continue;
    let x0 = P.x, y0 = P.y, x1 = P.x + P.w, y1 = P.y + P.h;
    const walk = n => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h); (n.kids || []).forEach(walk); };
    walk(P);
    out.push({ id: P.id, x: x0 - 14, y: y0 - 12, w: x1 - x0 + 28, h: y1 - y0 + 24, hue: P.hue, label: P.label });
  }
  // neighbouring bands never overlap: split the gap between them (side by side when the map runs top to bottom)
  if (mapDir() === 'v') {
    const byX = [...out].sort((a, b) => a.x - b.x);
    for (let i = 1; i < byX.length; i++) { const a = byX[i - 1], b = byX[i], ov = a.x + a.w + 4 - b.x; if (ov > 0 && a.y < b.y + b.h && b.y < a.y + a.h && ov / 2 < Math.min(a.w, b.w) / 3) { const cut = ov / 2; a.w -= cut; b.x += cut; b.w -= cut; } }
    return out;
  }
  const byY = [...out].sort((a, b) => a.y - b.y);
  for (let i = 1; i < byY.length; i++) {
    const a = byY[i - 1], b = byY[i], ov = a.y + a.h + 4 - b.y;
    // only trim small overlaps; a branch dragged right over another keeps its full band
    if (ov > 0 && a.x < b.x + b.w && b.x < a.x + a.w && ov / 2 < Math.min(a.h, b.h) / 3) { const cut = ov / 2; a.h -= cut; b.y += cut; b.h -= cut; }
  }
  return out;
}

/* --- minimap --- */
function drawMinimap() {
  const c = $('#minimap'), M = UI.mapLayout, vp = $('#map-vp'); if (!c || !M || !vp) return;
  const ctx = c.getContext && c.getContext('2d'); if (!ctx) return;
  // drawn at the screen's real pixel density, so it stays sharp on phones, tablets and retina screens
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(200 * dpr)) { c.width = Math.round(200 * dpr); c.height = Math.round(130 * dpr); }
  const W = c.width, H = c.height, s = Math.min(W / M.w, H / M.h), ox = (W - M.w * s) / 2, oy = (H - M.h * s) / 2;
  const css = getComputedStyle(document.documentElement), v = k => css.getPropertyValue(k).trim();
  const X = x => ox + (x - M.x0) * s, Y = y => oy + (y - M.y0) * s;
  ctx.clearRect(0, 0, W, H);
  const onMap = typeof curPage !== 'function' || curPage() === 'main';
  if (onMap) for (const b of projectBands(M)) { ctx.fillStyle = `hsla(${b.hue},55%,55%,.18)`; ctx.fillRect(X(b.x), Y(b.y), b.w * s, b.h * s); }
  for (const n of onMap ? M.nodes : []) {
    ctx.fillStyle = n.type === 'root' ? v('--accent') || '#0A6B74' : n.type === 'task' ? (n.t.status === 'done' ? 'rgba(128,128,128,.45)' : `hsl(${n.hue},45%,48%)`) : `hsl(${n.hue ?? 186},50%,40%)`;
    ctx.fillRect(X(n.x), Y(n.y), Math.max(1.5, n.w * s), Math.max(1.5, n.h * s));
  }
  for (const el of boardEls()) { const b = elBox(el); if (!b.w) continue; ctx.fillStyle = el.type === 'sticky' ? '#E8C547' : 'rgba(128,128,128,.5)'; ctx.fillRect(X(b.x), Y(b.y), Math.max(1.5, b.w * s), Math.max(1.5, b.h * s)); }
  // the part of the canvas on screen
  const k = UI.map.k, vx = -UI.map.x / k, vy = -UI.map.y / k, vw = vp.clientWidth / k, vh = vp.clientHeight / k;
  ctx.strokeStyle = v('--accent') || '#0A6B74'; ctx.lineWidth = 2 * dpr; ctx.strokeRect(X(vx), Y(vy), vw * s, vh * s);
  c._map = { s, ox, oy };
}
function minimapMove(e) {
  const c = $('#minimap'), M = UI.mapLayout, vp = $('#map-vp'); if (!c || !c._map || !M || !vp) return;
  const r = c.getBoundingClientRect(), { s, ox, oy } = c._map;
  const wx = ((e.clientX - r.left) * (c.width / r.width) - ox) / s + M.x0, wy = ((e.clientY - r.top) * (c.height / r.height) - oy) / s + M.y0;
  UI.map.x = vp.clientWidth / 2 - wx * UI.map.k; UI.map.y = vp.clientHeight / 2 - wy * UI.map.k; applyCam(false);
}
HOOKS.afterRender.push(() => {
  if (!$('#map-vp')) return;
  applyCam(false);
  const c = $('#minimap'); if (!c) return;
  c.addEventListener('pointerdown', e => { e.stopPropagation(); c.setPointerCapture(e.pointerId); minimapMove(e); c.onpointermove = ev => minimapMove(ev); });
  c.addEventListener('pointerup', () => { c.onpointermove = null; });
});

/* --- toolbar menus (View / History / Export) keep their open state across re-renders --- */
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.matches || !d.matches('details.menu[data-menu]')) return;
  if (d.open) { UI.menuOpen = d.dataset.menu; document.querySelectorAll('details.menu[open]').forEach(o => { if (o !== d) o.open = false; }); }
  else if (UI.menuOpen === d.dataset.menu) UI.menuOpen = '';
}, true);
function closeMenus() { document.querySelectorAll('details.menu[open]').forEach(o => { o.open = false; }); UI.menuOpen = ''; }
document.addEventListener('pointerdown', e => { if (!(e.target.closest && e.target.closest('details.menu'))) closeMenus(); }, true);
// a tool picked from a flyout becomes the group's face
const cvToolAct = ACT['cv-tool'];
ACT['cv-tool'] = el => { const gi = TOOL_GROUPS.findIndex(g => g.length > 1 && g.includes(el.dataset.tool)); if (gi >= 0) UI.toolPick[gi] = el.dataset.tool; cvToolAct(el); };

/* --- export: the map drawn as a standalone SVG, saved as PNG or PDF --- */
const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function wrapText(text, maxChars, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = []; let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    if (lines.length === maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…');
  return lines;
}
function svgText(x, y, lines, size, color, weight, lh) {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight || 400}" font-family="IBM Plex Sans, IBM Plex Sans Arabic, Segoe UI, Arial, sans-serif">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? lh || size * 1.3 : 0}" unicode-bidi="plaintext">${xesc(l)}</tspan>`).join('')}</text>`;
}
function mapSVG(M) {
  M = M || buildMap();
  const parts = [], W = M.w, H = M.h + 70, ox = -M.x0, oy = -M.y0 + 60;
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);
  parts.push(svgText(24, 36, [`Action Register — ${UI.mapFocus === 'all' ? 'All projects' : (M.projects[0] || {}).label || ''}`], 22, '#15201E', 600));
  parts.push(svgText(W - 24 - 220, 36, [`Exported ${fmtDate(T(), { day: 'numeric', month: 'short', year: 'numeric' })}`], 13, '#5B6B68'));
  parts.push(`<g transform="translate(${ox},${oy})">`);
  if (UI.mapBands !== false) for (const b of projectBands(M)) parts.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="26" fill="hsl(${b.hue},60%,96%)" stroke="hsl(${b.hue},45%,82%)"/>`);
  for (const el of boardEls()) {
    const e = liveEl(el), col = colorCss(e.color).startsWith('var') ? '#15201E' : e.color;
    if (e.type === 'frame') parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="10" fill="none" stroke="${e.color === 'ink' ? '#8EC5FF' : col}" stroke-width="2" stroke-dasharray="8 6"/>` + svgText(e.x + 10, e.y + 22, [e.text || 'Frame'], 14, '#334', 600));
    if (e.type === 'sticky') parts.push(`<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="4" fill="${e.color === 'ink' ? '#FFD966' : col}"/>` + svgText(e.x + 12, e.y + 26, wrapText(e.text, Math.max(8, (e.w - 24) / 7.6), Math.floor((e.h - 16) / 19)), 14, '#1F1A00'));
    if (e.type === 'text') parts.push(svgText(e.x, e.y + (e.size || 20), wrapText(e.text, Math.max(6, e.w / ((e.size || 20) * 0.55)), 12), e.size || 20, col));
    if (typeof EL_SVG !== 'undefined' && EL_SVG[e.type]) { parts.push(EL_SVG[e.type](e, col)); continue; }
    if (e.type === 'shape') {
      const sh = e.kind === 'ellipse' ? `<ellipse cx="${e.x + e.w / 2}" cy="${e.y + e.h / 2}" rx="${e.w / 2}" ry="${e.h / 2}"` : e.kind === 'diamond' ? `<path d="M${e.x + e.w / 2} ${e.y} L${e.x + e.w} ${e.y + e.h / 2} L${e.x + e.w / 2} ${e.y + e.h} L${e.x} ${e.y + e.h / 2}z"` : `<rect x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" rx="4"`;
      parts.push(`${sh} fill="none" stroke="${col}" stroke-width="2"/>` + svgText(e.x + e.w / 2 - Math.min(e.w / 2 - 8, (e.text || '').length * 3.6), e.y + e.h / 2 + 5, wrapText(e.text, Math.max(6, (e.w - 20) / 7.6), 3), 14, '#15201E'));
    }
  }
  for (const e of M.edges) parts.push(`<path d="${edgePath(e.a, e.b)}" fill="none" stroke="hsl(${e.hue},40%,${e.b.type === 'task' && e.b.t.status === 'done' ? 80 : 62}%)" stroke-width="2"/>`);
  for (const { d } of laneLinks(M)) parts.push(`<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#7A4FB3" stroke-width="2" stroke-dasharray="7 5" stroke-linejoin="round"/>`);
  for (const n of M.nodes) {
    const h = n.hue ?? 186;
    if (n.type === 'root') { parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="16" fill="#0A6B74"/>` + svgText(n.x + 18, n.y + n.h / 2 + 6, ['My work'], 18, '#FFFFFF', 600)); continue; }
    if (n.type === 'project') { parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="14" fill="hsl(${h},55%,90%)" stroke="hsl(${h},45%,42%)" stroke-width="1.5"/>` + svgText(n.x + 16, n.y + 28, wrapText(n.label, (n.w - 30) / 8.5, 2), 15, `hsl(${h},50%,22%)`, 600) + svgText(n.x + 16, n.y + n.h - 12, [`${n.n - n.done} open · ${n.done} done`], 11.5, '#5B6B68')); continue; }
    if (n.type === 'topic') { const open = n.tasks.filter(t => t.status !== 'done').length; parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12" fill="#FFFFFF" stroke="hsl(${h},40%,60%)" stroke-width="1.5"/>` + svgText(n.x + 14, n.y + 22, wrapText(n.label, (n.w - 28) / 7.8, 2), 13.5, '#15201E', 600) + svgText(n.x + 14, n.y + n.h - 9, [`${open} open · ${n.tasks.length - open} done`], 11, '#5B6B68')); continue; }
    if (n.type === 'task') {
      const t = n.t, done = t.status === 'done', d = dueInfo(t);
      const pc = { critical: '#C62828', high: '#C26100', medium: `hsl(${h},45%,48%)`, low: '#7A8A87' }[t.priority] || '#7A8A87';
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${done ? '#F2F5F4' : '#FFFFFF'}" stroke="#CBD5D3"/><rect x="${n.x}" y="${n.y + 6}" width="4" height="${n.h - 12}" rx="2" fill="${pc}"/>`
        + svgText(n.x + 14, n.y + 21, wrapText(t.title, (n.w - 26) / 7.2, Math.max(1, Math.floor((n.h - 26) / 17))), 13, done ? '#7A8A87' : '#15201E', 500)
        + svgText(n.x + 14, n.y + n.h - 9, [`${t.ref || ''}   ${done ? '✓ ' + fmtDate((t.completedAt || t.updatedAt || '').slice(0, 10)) : d.txt}`], 11, done ? '#2F7A3E' : d.cls === 'over' ? '#C62828' : '#5B6B68'));
      continue;
    }
    if (n.type === 'thread') {
      const st = typeof threadSteps === 'function' ? threadSteps({ conv: n.conv }) : [];
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12" fill="#FBF8FF" stroke="#B9A3DA"/>` + svgText(n.x + 14, n.y + 22, [E.clip('🧵 ' + ((convEmails(n.conv)[0] || {}).subject || 'Email thread'), 46)], 13, '#3B2466', 600)
        + svgText(n.x + 14, n.y + 44, st.slice(-Math.max(1, Math.floor((n.h - 50) / 17))).map(x => E.clip(`${x.date ? fmtDate(x.date) + ' · ' : ''}${x.me ? 'Me' : x.from || ''}: ${x.says || ''}`, 52)), 11, '#3F4A48'));
      continue;
    }
    parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="8" fill="#FFFFFF" stroke="#DDE4E2"/>` + svgText(n.x + 12, n.y + n.h / 2 + 4, [(n.s.done ? '☑ ' : '☐ ') + E.clip(n.s.text, Math.floor((n.w - 30) / 6.8))], 12, n.s.done ? '#7A8A87' : '#15201E'));
  }
  for (const el of boardEls()) {
    const e = liveEl(el), col = colorCss(e.color).startsWith('var') ? '#15201E' : e.color;
    if (e.type === 'stroke' && e.pressure) { parts.push(`<path d="${pressurePath(e.pts, e.width)}" fill="${col}" stroke="none"/>`); continue; }
    if (e.type === 'stroke') parts.push(`<path d="${strokePath(e.pts)}" fill="none" stroke="${col}" stroke-width="${e.width}" ${e.alpha ? `stroke-opacity="${e.alpha}"` : ''} stroke-linecap="round" stroke-linejoin="round"/>`);
    if (e.type === 'line') parts.push(`<path d="M${e.x1} ${e.y1} L${e.x2} ${e.y2}" stroke="${col}" stroke-width="${e.width || 3}" fill="none" stroke-linecap="round" ${e.arrow ? 'marker-end="url(#xa)"' : ''}/>`);
    if (e.type === 'connector') { const d = connD(e, M); if (d) { parts.push(`<path d="${d}" stroke="${col}" stroke-width="${e.width || 2.5}" fill="none" ${e.dash ? 'stroke-dasharray="7 6"' : ''} marker-end="url(#xa)"/>`); } }
  }
  parts.push('</g>');
  return { w: W, h: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><marker id="xa" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#15201E"/></marker></defs>${parts.join('')}</svg>` };
}
async function svgToPng(svg, w, h) {
  // as sharp as the browser allows: up to 4× (print quality), within the largest canvas a browser will draw
  const scale = Math.max(1, Math.min(4, 16000 / Math.max(w, h), Math.sqrt(160e6 / Math.max(1, w * h))));
  const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return new Promise(res => c.toBlob(res, 'image/png'));
}
// print an HTML document to PDF: the desktop app saves a file; the browser opens the print dialog
async function printDoc(bodyHTML, filename, landscape, title) {
  const css = `body{font-family:'IBM Plex Sans','IBM Plex Sans Arabic','Segoe UI',Arial,sans-serif;color:#15201E;margin:0;font-size:11pt}h1{font-size:18pt;margin:0 0 4pt}h2{font-size:13pt;margin:14pt 0 6pt;border-bottom:1px solid #CBD5D3;padding-bottom:3pt}table{border-collapse:collapse;width:100%;font-size:9.5pt}th,td{border:1px solid #CBD5D3;padding:4pt 6pt;text-align:start;vertical-align:top}th{background:#EEF3F2}.muted{color:#5B6B68}svg{max-width:100%;height:auto}.pb{page-break-before:always}ul{margin:4pt 0;padding-inline-start:16pt}`;
  if (DESKTOP) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${xesc(title || filename)}</title><style>${css}</style></head><body dir="auto">${bodyHTML}</body></html>`;
    try { const r = await DK.call('print:pdf', { html, filename, landscape: !!landscape }); if (r && r.path) toast('Saved ' + r.path.split(/[\\/]/).pop()); }
    catch (e) { if (!e || e.code !== 'cancelled') toast('Could not save the PDF.'); }
    return;
  }
  let el = $('#print-area'); if (!el) { el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = `<style>@media print{${css.replace(/body\{/, '#print-area{')}@page{size:A4 ${landscape ? 'landscape' : 'portrait'}}}</style>${bodyHTML}`;
  document.body.classList.add('printing-doc');
  setTimeout(() => { try { window.print(); } finally { setTimeout(() => { document.body.classList.remove('printing-doc'); el.innerHTML = ''; }, 300); } }, 50);
}
async function exportMap(fmt) {
  const M = UI.mapLayout || buildMap(), x = mapSVG(M), name = `action-register-canvas-${T()}`;
  if (fmt === 'svg') return offerFile(name + '.svg', x.svg, 'image/svg+xml');
  if (fmt === 'pdf') return printDoc(x.svg, name + '.pdf', x.w > x.h, 'Canvas');
  try { const blob = await svgToPng(x.svg, x.w, x.h); await offerFile(name + '.png', blob, 'image/png'); }
  catch { offerFile(name + '.svg', x.svg, 'image/svg+xml'); }
}

/* --- centre the canvas on a box --- */
function fitBox(b) {
  const vp = $('#map-vp'); if (!vp || !b) return;
  // with the zoom locked the box is only centred
  const W = vp.clientWidth, H = vp.clientHeight, k = zoomLocked() ? UI.map.k : Math.max(0.2, Math.min(1.4, (W - 120) / b.w, (H - 140) / b.h));
  UI.map.k = k; UI.map.x = W / 2 - (b.x + b.w / 2) * k; UI.map.y = (H - 40) / 2 - (b.y + b.h / 2) * k; UI.map.fitted = true; applyCam(true);
}
Object.assign(ACT, {
  'map-hist-clear': () => { UI.mapDay = ''; UI.mapAsOf = ''; UI.map.fitted = false; render(); },
  'map-export': el => { closeMenus(); exportMap(el.dataset.f); },
});
// any action chosen from a menu closes it
document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.menu-pop [data-act]')) setTimeout(closeMenus, 0); });
// a menu that was open stays open when the page is drawn again
HOOKS.afterRender.push(() => { if (!UI.menuOpen) return; const d = document.querySelector(`details.menu[data-menu="${UI.menuOpen}"]`); if (d && !d.open) d.open = true; });
