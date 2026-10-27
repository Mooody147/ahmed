/* ---------- touch & stylus settings, pen panel, zoom lock, menus that scroll ---------- */
// ⚙ on the canvas opens Touch & stylus: what a finger does once a stylus is used, two-finger zoom and zoom snap,
// tap & hold (item picker, lasso, colour picker), draw & hold (clean shapes), two/three/four-finger taps, pressure
// response, tilt, hover preview, and what the side button and the eraser end do. Choosing the pen (or any drawing
// tool) opens its panel: pen type, width and colours. 🔒 on the canvas locks the zoom where it is.
function saveTouch(patch) { const u = St.settings.ui || {}; saveSettingsUi({ touch: { ...(u.touch || {}), ...patch } }); }
function savePen(patch) { const u = St.settings.ui || {}; const p = u.pen || {}; saveSettingsUi({ pen: { ...p, ...patch, w: { ...(p.w || {}), ...(patch.w || {}) } } }); }

/* --- the pen panel: inside the tool --- */
const PANEL_TOOLS = ['pen', 'highlighter', 'sticky', 'text', 'rect', 'ellipse', 'diamond', 'arrow', 'line', 'connector', 'frame'];
const BRUSH_PREVIEW = 'M5 17c5-10 10-12 14-6s8 6 12-2 8-6 12 2';
function toolPanelHTML() {
  if (!PANEL_TOOLS.includes(UI.tool) || !UI.toolPanel || St.mode === 'viewer') return '';
  const t = UI.tool, pc = penCfg(), lineish = ['arrow', 'line', 'connector'].includes(t);
  const title = (TOOLS.find(x => x[0] === t) || [])[2] || t;
  const wKey = t === 'highlighter' ? 'highlighter' : t === 'pen' ? pc.brush : lineish ? 'line' : '';
  const wVal = wKey === 'line' ? UI.cvWidth : wKey ? pc.w[wKey] : 0;
  const custom = /^#[0-9a-f]{6}$/i.test(UI.cvColor) && !PALETTE.includes(UI.cvColor);
  const brushes = t === 'pen' ? `<div class="cvp-row cvp-brushes" role="group" aria-label="Pen type">${Object.entries(BRUSHES).map(([k, [label, , pr, a]]) => `<button class="cvp-brush ${pc.brush === k ? 'on' : ''}" data-act="pen-brush" data-b="${k}" aria-pressed="${pc.brush === k}" title="${esc(label)}${pr ? ' — pressure changes the width' : ''}"><svg viewBox="0 0 48 24" aria-hidden="true"><path d="${BRUSH_PREVIEW}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${k === 'marker' ? 6 : k === 'pen' ? 3 : 1.8}" ${a ? `stroke-opacity="${a}"` : ''} ${k === 'pencil' ? 'stroke-dasharray="1.5 1"' : ''}/></svg><span>${esc(label)}</span></button>`).join('')}</div>` : '';
  const width = wKey ? `<label class="cvp-row cvp-width"><span class="small">Width</span><input type="range" id="cvp-w" min="1" max="${t === 'highlighter' ? 48 : 40}" step="1" value="${wVal}" data-chg="pen-width" data-k="${wKey}" aria-label="Width"><span class="cvp-dot" style="--d:${Math.min(40, wVal)}px;--c:${colorCss(t === 'highlighter' && UI.cvColor === 'ink' ? '#FFD966' : UI.cvColor)}"></span><b class="small cvp-wv">${wVal}</b></label>` : '';
  return `<div class="cv-panel" role="dialog" aria-label="${esc(title)} options">
    <div class="cvp-head"><b>${esc(String(title).split(' — ')[0])}</b><button class="btn sm ghost" data-act="tool-panel-close" aria-label="Close">✕</button></div>
    ${brushes}${width}
    <div class="cvp-row cvp-colors" role="group" aria-label="Colour">${PALETTE.map(c => `<button class="sw ${UI.cvColor === c ? 'on' : ''}" data-act="cv-color" data-c="${c}" style="--c:${colorCss(c)}" aria-label="Colour ${c}" aria-pressed="${UI.cvColor === c}"></button>`).join('')}
      <label class="sw sw-custom ${custom ? 'on' : ''}" title="Any colour" style="--c:${custom ? UI.cvColor : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)'}"><input type="color" data-chg="cv-color-custom" value="${custom ? UI.cvColor : '#0a6b74'}" aria-label="Any colour"></label></div>
  </div>`;
}
// the panel opens from the tool button and folds away as soon as you draw or click on the canvas
document.addEventListener('pointerdown', e => {
  if (!UI.toolPanel || !e.target.closest || !e.target.closest('#map-vp') || e.target.closest('.cv-panel,.cv-tools,.cv-sub')) return;
  UI.toolPanel = false; const p = document.querySelector('.cv-panel'); if (p) p.remove();
}, true);
Object.assign(ACT, {
  'pen-brush': el => { savePen({ brush: el.dataset.b }); render(); },
  'tool-panel-close': () => { UI.toolPanel = false; render(); },
  'zoom-lock': () => { const on = !zoomLocked(); saveTouch({ zoomLock: on }); toast(on ? `🔒 Zoom locked at ${Math.round(UI.map.k * 100)}%.` : '🔓 Zoom unlocked.'); render(); },
  'touch-open': () => { UI.touchOpen = true; UI.menuOpen = ''; closeMenus(); tsRender(); },
  'touch-close': () => { UI.touchOpen = false; tsRender(); },
  'ts-set': el => { saveTouch({ [el.dataset.k]: el.dataset.v }); tsRender(); render(); },
  'ts-reset': () => { saveSettingsUi({ touch: {} }); tsRender(); render(); toast('Touch & stylus settings reset.'); },
});
Object.assign(CHG, {
  'pen-width': el => { const v = Math.max(1, Math.min(48, +el.value || 1)), k = el.dataset.k; if (k === 'line') UI.cvWidth = v; else savePen({ w: { [k]: v } }); render(); },
  'cv-color-custom': el => { UI.cvColor = el.value; render(); },
  'ts-bool': el => { const k = el.dataset.k; if (k === 'stylusDraw' || k === 'penGestures') saveSettingsUi({ [k]: !!el.checked }); else saveTouch({ [k]: !!el.checked }); tsRender(); render(); },
  'ts-num': el => { const k = el.dataset.k, v = +el.value; const c = touchCfg(); if (k === 'pLo') saveTouch({ pLo: Math.min(v / 100, c.pHi - 0.05) }); else if (k === 'pHi') saveTouch({ pHi: Math.max(v / 100, c.pLo + 0.05) }); else saveTouch({ [k]: v }); tsRender(); },
});
// sliders show their value while they move; the setting is saved when you let go
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'cvp-w') { const p = el.closest('.cv-panel'); p.querySelector('.cvp-dot').style.setProperty('--d', Math.min(40, +el.value) + 'px'); p.querySelector('.cvp-wv').textContent = el.value; }
  if (el.dataset && el.dataset.chg === 'ts-num') { const o = el.closest('.ts-field') && el.closest('.ts-field').querySelector('.ts-val'); if (o) o.textContent = tsFmt(el.dataset.k, +el.value); }
});

/* --- the Touch & stylus sheet --- */
const tsFmt = (k, v) => k === 'pLo' || k === 'pHi' ? v + '%' : (v / 1000).toFixed(2).replace(/0$/, '') + ' s';
const IC = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>', tool: '<path d="M4 20c4-1 6-3 9-8l3-5 2 1-3 5c-3 5-6 7-11 7z"/>', pan: '<path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/>',
  select: '<path d="M5 3l14 8-6 2-3 6z"/>', pick: '<path d="M12 5v14M5 12h14"/>', lasso: '<path d="M12 5c5 0 8 2 8 4.5S16.4 14 12 14s-8-2-8-4.5S7 5 12 5z" stroke-dasharray="3 2.5"/><path d="M7 13c-1 2-1 4 1 5"/>',
  color: '<path d="M14 4l6 6-9 9H5v-6z"/><path d="M12 6l6 6"/>', undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>', redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', all: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><path d="M9 12l2 2 4-4"/>',
  ui: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>', eraser: '<path d="M8 20h12M4 15l9-9 6 6-7 7H8z"/>',
};
function tsChoice(k, cur, opts) {
  return `<div class="ts-choices" role="radiogroup">${opts.map(([v, label, ic]) => `<button class="ts-choice ${cur === v ? 'on' : ''}" role="radio" aria-checked="${cur === v}" data-act="ts-set" data-k="${k}" data-v="${v}"><span class="ts-ic">${svg(IC[ic] || IC.x, 22)}</span><span class="ts-lbl">${esc(label)}</span></button>`).join('')}</div>`;
}
const tsTog = (k, label, on, sub) => `<label class="ts-tog"><span>${esc(label)}${sub ? `<small>${esc(sub)}</small>` : ''}</span><input type="checkbox" role="switch" data-chg="ts-bool" data-k="${k}" ${on ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
const tsRange = (k, label, v, min, max, step) => `<div class="ts-field"><div class="ts-row"><b>${esc(label)}</b><span class="ts-val">${tsFmt(k, v)}</span></div><input type="range" data-chg="ts-num" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${esc(label)}"></div>`;
function tsHTML() {
  const c = touchCfg(), u = St.settings.ui || {};
  const taps = [['nothing', 'Do nothing', 'x'], ['undo', 'Undo', 'undo'], ['redo', 'Redo', 'redo']];
  const pens = [['nothing', 'Do nothing', 'x'], ['select', 'Select', 'select'], ['eraser', 'Eraser', 'eraser'], ['lasso', 'Lasso', 'lasso']];
  return `<div class="ts-head"><button class="btn sm ghost" data-act="touch-close" aria-label="Close">✕</button><b>Touch & stylus</b><span class="spacer"></span><button class="btn sm ghost" data-act="ts-reset">Reset</button></div>
  <div class="ts-body">
    <h2>Touch input</h2>
    <section><h3>Finger action</h3><p>While your stylus draws, a finger can do something else. ${UI.penSeen ? '' : 'Until a stylus is used on this device, a finger uses the chosen tool.'}</p>
      ${tsChoice('finger', fingerMode(), [['nothing', 'Do nothing', 'x'], ['tool', 'Use active tool', 'tool'], ['pan', 'Pan canvas', 'pan'], ['select', 'Select', 'select']])}</section>
    <section><h3>Two fingers</h3><p>Use two fingers to move and zoom the canvas.</p>
      <div class="ts-grid">${tsTog('zoom', 'Enable canvas zoom', c.zoom)}${tsTog('zoomSnap', 'Enable zoom snap', c.zoomSnap, '25 %, 50 %, 100 %…')}${tsTog('zoomLock', 'Lock the zoom', c.zoomLock, `now ${Math.round(UI.map.k * 100)} %`)}</div></section>
    <section><h3>Tap & hold</h3><p>Hold still on the canvas for a moment to pick things up.</p>
      ${tsChoice('holdAct', c.holdAct, [['off', 'Do nothing', 'x'], ['pick', 'Item picker', 'pick'], ['lasso', 'Lasso', 'lasso'], ['color', 'Colour picker', 'color']])}
      ${tsRange('holdMs', 'Activation time', c.holdMs, 150, 1000, 50)}
      ${tsTog('holdFlash', 'Highlight selection', c.holdFlash)}</section>
    <section><h3>Draw & hold</h3><p>At the end of your stroke, stay still: a rough shape snaps clean.</p>
      ${tsTog('shapes', 'Enable shape recognition', c.shapes)}
      ${tsRange('shapeMs', 'Activation time', c.shapeMs, 200, 1200, 50)}
      ${tsTog('penGestures', 'Smart pen gestures (Pen tool)', u.penGestures !== false, '✓ marks done · scribble deletes · a straight line links two boxes · a loop selects')}</section>
    <section><h3>Two finger tap</h3>${tsChoice('tap2', c.tap2, taps)}</section>
    <section><h3>Three finger tap</h3>${tsChoice('tap3', c.tap3, taps)}</section>
    <section><h3>Four finger tap</h3>${tsChoice('tap4', c.tap4, [['lock', 'Toggle zoom lock', 'lock'], ['fit', 'Fit to screen', 'fit'], ['all', 'Select all', 'all'], ['ui', 'Toggle interface', 'ui'], ['nothing', 'Do nothing', 'x']])}</section>
    <h2>Stylus</h2>
    <section>${tsTog('stylusDraw', 'The stylus draws without choosing the pen', u.stylusDraw !== false, 'a tap still selects or opens')}</section>
    <section><h3>Pressure response</h3><p>Narrow the range for a less noticeable effect of pressing harder.</p>
      <div class="ts-pair">${tsRange('pLo', 'Lightest', Math.round(c.pLo * 100), 0, 95, 5)}${tsRange('pHi', 'Hardest', Math.round(c.pHi * 100), 5, 100, 5)}</div></section>
    <section><h3>Preferences</h3>
      ${tsTog('pressure', 'Enable pressure', c.pressure)}${tsTog('tilt', 'Enable tilt', c.tilt, 'a tilted pen draws a little wider')}${tsTog('penHold', 'Enable tap & hold', c.penHold)}${tsTog('hover', 'Enable hover brush previews', c.hover, 'for pens that sense the screen before touching it')}</section>
    <section><h3>Side button</h3><p>What the stylus does while its side button is held.</p>${tsChoice('side', c.side, pens)}</section>
    <section><h3>Eraser action</h3><p>What the eraser end of a compatible stylus does.</p>${tsChoice('eraserEnd', c.eraserEnd, pens)}</section>
  </div>`;
}
function tsRender() {
  let el = document.getElementById('touch-sheet');
  if (!UI.touchOpen) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'touch-sheet'; el.className = 'ts-sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Touch and stylus settings'); document.body.appendChild(el); }
  const b = el.querySelector('.ts-body'), top = b ? b.scrollTop : 0;
  el.hidden = false; el.innerHTML = deco(tsHTML());
  const nb = el.querySelector('.ts-body'); if (nb) nb.scrollTop = top;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && UI.touchOpen) { UI.touchOpen = false; tsRender(); } });
HOOKS.beforeRender.push(() => { if (UI.view !== 'todo' && UI.touchOpen) { UI.touchOpen = false; tsRender(); } });

/* --- four-finger tap and the hidden interface --- */
function fingerTapAct(n) {
  const c = touchCfg(), a = n === 2 ? c.tap2 : n === 3 ? c.tap3 : c.tap4;
  if (a === 'undo') { if (UI.cvUndo.length) { cvUndo(); toast('↶ Undone'); } }
  else if (a === 'redo') { if (UI.cvRedo.length) { cvRedo(); toast('↷ Redone'); } }
  else if (a === 'lock') ACT['zoom-lock']();
  else if (a === 'fit') mapFit(false);
  else if (a === 'all') { UI.cvSel = new Set(boardEls().filter(x => x.type !== 'connector').map(x => x.id)); renderWorld(); }
  else if (a === 'ui') { document.body.classList.toggle('cv-clean'); toast(document.body.classList.contains('cv-clean') ? 'Interface hidden — tap with four fingers to bring it back.' : 'Interface shown.'); }
}

/* --- hover preview: a ring the size and colour of the pen, while a pen hovers above the screen --- */
document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'pen') return;
  let ring = document.getElementById('pen-hover');
  const vp = e.target.closest && e.target.closest('#map-vp');
  const drawTool = ['pen', 'highlighter'].includes(UI.tool) || (['select', 'hand'].includes(UI.tool) && (St.settings.ui || {}).stylusDraw !== false);
  if (!vp || e.buttons || !touchCfg().hover || !drawTool || e.target.closest('.cv-tools,.cv-sub,.cv-ctx,.cv-panel,.mnode,[data-el]')) { if (ring) ring.hidden = true; return; }
  if (!ring) { ring = document.createElement('div'); ring.id = 'pen-hover'; ring.className = 'pen-hover'; ring.setAttribute('aria-hidden', 'true'); document.body.appendChild(ring); }
  const st = strokeStyle(UI.tool === 'highlighter' ? 'highlighter' : 'pen'), d = Math.max(4, st.width * UI.map.k);
  ring.hidden = false; ring.style.cssText = `left:${e.clientX - d / 2}px;top:${e.clientY - d / 2}px;width:${d}px;height:${d}px;--c:${colorCss(UI.tool === 'highlighter' && UI.cvColor === 'ink' ? '#FFD966' : UI.cvColor)}`;
  clearTimeout(MP.hoverT); MP.hoverT = setTimeout(() => { ring.hidden = true; }, 600);
}, { passive: true });
document.addEventListener('pointerdown', () => { const r = document.getElementById('pen-hover'); if (r) r.hidden = true; }, true);

/* --- menus: a long menu scrolls inside the screen, so its last items can always be reached --- */
// (a menu near the bottom of the screen opens upwards when there is more room above)
function fitPops() {
  const H = window.innerHeight;
  document.querySelectorAll('details.menu[open] > .menu-pop').forEach(p => {
    const sm = p.parentElement.querySelector('summary'); if (!sm) return;
    const s = sm.getBoundingClientRect(), below = H - s.bottom - 18, above = s.top - 18, up = below < 300 && above > below;
    p.classList.toggle('up', up); p.style.maxHeight = Math.max(140, up ? above : below) + 'px';
  });
  document.querySelectorAll('.cv-panel').forEach(p => { const r = p.getBoundingClientRect(); p.style.maxHeight = Math.max(180, H - Math.max(0, r.top) - 12) + 'px'; });
}
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('details.menu') && e.target.open) requestAnimationFrame(fitPops); }, true);
HOOKS.afterRender.push(() => requestAnimationFrame(fitPops));
window.addEventListener('resize', () => requestAnimationFrame(fitPops));
