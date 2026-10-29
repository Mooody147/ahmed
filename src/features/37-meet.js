/* ---------- comment pins and the A3 PDF ---------- */
// 💬 Pins: comments placed on a task or note stay pinned to it as the canvas moves.
// 📄 A3 PDF: the board as a print-ready A3 landscape PDF.
MORE_SECTIONS.push(() => `<div class="mt-sec"><div class="label">Print</div><button class="btn sm ghost" data-act="map-export-a3">📄 PDF for printing (A3)</button></div>`);
const applyCam0 = applyCam;
applyCam = function (animate) { applyCam0(animate); if (CM.ctrl) cmPlace(); };

/* --- comment pins that follow the canvas --- */
const CM = { api: null, ctrl: null, on: false, threads: [] };
const anchorEl = a => { const m = /^(task|el):(.+)$/.exec(a || ''); if (!m) return null; return m[1] === 'task' ? document.querySelector(`.mnode.task[data-tid="${CSS.escape(m[2])}"]`) : document.querySelector(`[data-el="${CSS.escape(m[2])}"]`); };
function cmPlace() {
  if (!CM.ctrl) return; const map = {};
  for (const th of CM.threads) { const el = anchorEl(th.anchor); if (!el) continue; const r = el.getBoundingClientRect(); map[th.id] = { x: r.right - 6 + scrollX, y: r.top + 6 + scrollY }; }
  try { CM.ctrl.placed(map); } catch {}
}
async function cmStart() {
  if (typeof claude === 'undefined' || !claude.use) return;
  const api = await claude.use('comments').catch(() => null); if (!api || typeof api.customAnchors !== 'function') return;
  CM.api = api;
  try {
    CM.ctrl = await api.customAnchors({
      mode: on => { CM.on = on; document.body.classList.toggle('cm-on', on); if (!on) CM.threads = []; },
      threads: list => { CM.threads = list; cmPlace(); },
      reveal: id => {
        const th = CM.threads.find(t => t.id === id); if (!th) return; const m = /^(task|el):(.+)$/.exec(th.anchor || ''); if (!m) return;
        if (m[1] === 'task') { UI.page = 'main'; UI.mapFocus = 'all'; render(); const n = UI.mapLayout && UI.mapLayout.byId.get('t:' + m[2]); if (n) fitBox({ x: n.x - 200, y: n.y - 150, w: n.w + 400, h: n.h + 300 }); }
        else { const el = St.board.get(m[2]); if (el) { UI.page = el.page || 'main'; render(); fitBox(elBox(el)); } }
        cmPlace();
      },
    });
    cmPlace();
  } catch { CM.ctrl = null; }
}
HOOKS.afterRender.push(() => { if (CM.ctrl) requestAnimationFrame(cmPlace); });
// in comment mode a press on a task or note opens the comment box there instead of selecting or moving it
document.addEventListener('pointerdown', e => {
  if (!CM.on || !CM.ctrl || !e.target.closest || !['select', 'hand'].includes(UI.tool) || (e.buttons & 34)) return;
  const node = e.target.closest('.mnode.task'), bel = e.target.closest('[data-el]'); if (!node && !bel) return;
  e.stopImmediatePropagation(); e.preventDefault();
  if (node) { const t = St.tasks.get(node.dataset.tid); CM.ctrl.compose('task:' + node.dataset.tid, node, { label: t ? `${t.ref || ''} ${E.clip(t.title, 80)}`.trim() : 'Task' }).catch(() => {}); }
  else { const el = St.board.get(bel.dataset.el); CM.ctrl.compose('el:' + bel.dataset.el, bel, { label: el ? E.clip(el.text || el.name || el.type, 80) : 'Note' }).catch(() => {}); }
}, true);
// a 💬 on a selected task opens the comment box (for you, or your manager on the shared view)
CTX_EXTRA.push((els, one) => CM.ctrl && one ? `<button class="btn sm ghost" data-act="cm-here" data-a="el:${esc(one.id)}" title="Comment here">💬</button>` : '');
ACT['cm-here'] = el => { const a = el.dataset.a, at = anchorEl(a); if (CM.ctrl && at) CM.ctrl.compose(a, at, { label: 'Canvas' }).catch(() => {}); };
MAP_BTN.comment = id => { const n = document.querySelector(`.mnode.task[data-tid="${CSS.escape(id)}"]`), t = St.tasks.get(id); if (CM.ctrl && n) CM.ctrl.compose('task:' + id, n, { label: t ? `${t.ref || ''} ${E.clip(t.title, 80)}`.trim() : 'Task' }).catch(() => {}); };
NODE_EXTRA.push(t => CM.ctrl ? `<button class="mitems mcomment" data-map="comment" title="Comment on this task">💬</button>` : '');

/* --- A3 PDF: the board drawn sharp on an A3 landscape page --- */
function jpegPDF(jpegBytes, imgW, imgH) {
  const pw = 1190.55, ph = 841.89, m = 24, s = Math.min((pw - 2 * m) / imgW, (ph - 2 * m) / imgH), dw = imgW * s, dh = imgH * s, dx = (pw - dw) / 2, dy = (ph - dh) / 2;
  const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  obj(3, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  obj(4, () => { push(`<< /Type /XObject /Subtype /Image /Width ${imgW} /Height ${imgH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`); push(jpegBytes); push('\nendstream'); });
  const cs = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${dx.toFixed(2)} ${dy.toFixed(2)} cm /Im0 Do Q`;
  obj(5, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
  const xref = len; push(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(n => String(offs[n]).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
function exportLayout() {
  const M = UI.mapLayout || buildMap();
  if (curPage() === 'main') return M;
  const els = boardEls().filter(e => e.type !== 'connector'); let x0 = 0, y0 = 0, x1 = 800, y1 = 600;
  if (els.length) { x0 = Infinity; y0 = Infinity; x1 = -Infinity; y1 = -Infinity; for (const e of els) { const b = elBox(e); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); } }
  return { ...M, nodes: [], edges: [], links: [], projects: [], x0: x0 - 40, y0: y0 - 40, w: x1 - x0 + 80, h: y1 - y0 + 80 };
}
ACT['map-export-a3'] = async () => {
  closeMenus(); toast('📄 Preparing the A3 PDF…');
  try {
    const M = exportLayout(), x = mapSVG(M);
    for (const im of [...x.svg.matchAll(/<image href="([^"]+)"/g)]) if (!/^data:/.test(im[1])) { try { x.svg = x.svg.replace(im[1], await srcDataURL(im[1])); } catch {} }
    const target = 4961, scale = Math.min(6, target / Math.max(x.w, x.h)); // A3 at 300 dpi along the long side
    const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(x.svg); await img.decode();
    const c = document.createElement('canvas'); c.width = Math.round(x.w * scale); c.height = Math.round(x.h * scale);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    const jpg = new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/jpeg', 0.92))).arrayBuffer());
    const name = curPage() === 'main' ? 'canvas' : E.normMatch((boards().find(b => b.id === curPage()) || {}).name || 'board').replace(/\s+/g, '-');
    await offerFile(`action-register-${name}-${T()}-A3.pdf`, jpegPDF(jpg, c.width, c.height), 'application/pdf');
  } catch (e) { toast('Could not make the PDF.', { err: true }); }
};
// comment pins start once the data is ready (and on the shared, read-only page)
let meetStarted = false;
const meetStart = () => { if (meetStarted) return; meetStarted = true; cmStart(); };
HOOKS.ready.push(meetStart);
setTimeout(meetStart, 4000);
