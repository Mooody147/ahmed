"""Breathing room audit of the whole artifact: on every page (to-do, review, add emails, emails, the Money canvas and its
settings, setup), at phone, tablet and desktop width, with data — no text or control touches the edge of the card,
panel or box it sits in (at least 6px from the sides, 4px from the top and bottom). The Money canvas itself (scaled) is
left to audit_layout.py.
Usage: python3 test/audit_edges.py  (prints the problems found; exit 1 when there are any)"""
import asyncio, os, sys, subprocess, json
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
FX = os.path.join(HERE, 'shots', 'finfx2'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
WIDTHS = [(1400, 950), (820, 1100), (390, 844)]
CHECK = r"""([minX, minY]) => {
  const out = [], tr = c => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
  const vis = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // a box: something drawn with a border or its own rounded background, narrower than the screen
  const zoom = el => { const w = el.closest('#fin-cv-world, .map-world'); if (!w) return 1; const m = /scale\(([\d.]+)\)/.exec(w.style.transform || ''); return m ? +m[1] : 1; };
  const isBox = el => { if (el.matches('input, select, textarea, button, a, label, summary, svg, img, canvas, video, hr, table, thead, tbody, tr, td, th, .chip, .tag, .badge, .fin-chip, .fin-tag, .seg, .ph-seg2, [role=group], [role=tablist], .pill, kbd, code, mark, #fin-cv-world, .fin-cv-vp, .fin-cv-stage')) return false;
    const s = getComputedStyle(el), r = el.getBoundingClientRect(), k = zoom(el); if (r.width / k < 140 || (r.width > innerWidth - 2 && !el.closest('#fin-cv-world, .map-world')) || r.height / k < 28) return false;
    const bord = ['Left', 'Right'].every(k => parseFloat(s['border' + k + 'Width']) >= 1 && !tr(s['border' + k + 'Color']));
    const bg = !tr(s.backgroundColor) && parseFloat(s.borderTopLeftRadius) >= 6;
    return bord || bg; };
  const skip = el => el.closest('svg, .sr, [aria-hidden="true"], details:not([open]) > :not(summary), .toast, .toasts, .fin-cvmini');
  const items = [];
  for (const el of document.querySelectorAll('#main *, .modal *, .ph-sheet *')) {
    if (skip(el) || !vis(el)) continue;
    // a drawn control (border or fill) is measured by its outline; a plain full-row button by the text in it
    const drawn = c => { const s = getComputedStyle(c); return ['Left', 'Right', 'Top', 'Bottom'].some(k => parseFloat(s['border' + k + 'Width']) >= 1 && !tr(s['border' + k + 'Color'])) || !tr(s.backgroundColor) || s.backgroundImage !== 'none' || parseFloat(s.boxShadow ? 1 : 0) && s.boxShadow !== 'none'; };
    if (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=hidden]), select, textarea')) { items.push({ el, r: el.getBoundingClientRect() }); continue; }
    if (el.matches('button, .btn') && drawn(el)) { if (getComputedStyle(el).position !== 'absolute') items.push({ el, r: el.getBoundingClientRect() }); continue; }
    const ctl = el.closest('button, .btn, select, label.btn'); if (ctl && drawn(ctl)) continue;
    // text cut with an ellipsis ends where its box ends
    let clip = null; for (let q = el; q && !isBox(q); q = q.parentElement) { const s = getComputedStyle(q); if (/(hidden|clip)/.test(s.overflowX)) { clip = q.getBoundingClientRect(); break; } }
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); for (const r0 of rg.getClientRects()) if (r0.width > 1) { const r = clip ? { left: Math.max(r0.left, clip.left), right: Math.min(r0.right, clip.right), top: Math.max(r0.top, clip.top), bottom: Math.min(r0.bottom, clip.bottom) } : r0; if (r.right > r.left) items.push({ el, r }); } }
  }
  const name = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const seen = new Set();
  for (let { el, r } of items) {
    let box = null; for (let p = (el.matches('input, select, textarea, button, .btn') ? el.parentElement : el); p && p !== document.body; p = p.parentElement) { if (p !== el && isBox(p) || (p === el && !el.matches('input, select, textarea, button, .btn') && isBox(p))) { box = p; break; } }
    if (!box) continue;
    const b = box.getBoundingClientRect(), s = getComputedStyle(box);
    // only what the box shows (scrolled-away content and clipped overflow are not "at the edge")
    if (r.right < b.left || r.left > b.right || r.bottom < b.top || r.top > b.bottom) continue;
    const k = zoom(box), r0 = r; r = { left: r0.left, right: r0.right, top: r0.top, bottom: r0.bottom };
    const L = r.left - (b.left + parseFloat(s.borderLeftWidth)), R = (b.right - parseFloat(s.borderRightWidth)) - r.right, T = r.top - (b.top + parseFloat(s.borderTopWidth)), B = (b.bottom - parseFloat(s.borderBottomWidth)) - r.bottom;
    const kk = k; const bad = []; if (L / kk < minX) bad.push('left ' + Math.round(L)); if (R / kk < minX && !(/(auto|scroll)/.test(s.overflowX))) bad.push('right ' + Math.round(R)); if (T / kk < minY && !/(auto|scroll)/.test(s.overflowY)) bad.push('top ' + Math.round(T)); if (B / kk < minY && !/(auto|scroll)/.test(s.overflowY)) bad.push('bottom ' + Math.round(B));
    if (!bad.length) continue;
    const key = name(box) + ' > ' + name(el) + ' ' + bad.map(x => x.split(' ')[0]).join('/');
    if (seen.has(key)) continue; seen.add(key);
    out.push(key + ' (' + bad.join(', ') + ') "' + (el.value || el.textContent || el.placeholder || '').trim().slice(0, 30) + '"');
  }
  // a button or field cut off by a box that hides what sticks out (shown on hover too, so hidden ones count);
  // the canvas windows and scroll areas are left out — panning or scrolling brings those into view
  for (const c of document.querySelectorAll('#main button, #main .btn, #main input:not([type=hidden]):not([type=file]), #main select, .modal button')) {
    if (c.closest('svg, .sr, details:not([open])')) continue; const s0 = getComputedStyle(c); if (s0.display === 'none' || s0.visibility === 'hidden') continue;
    const r = c.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    for (let p = c.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.matches('#fin-cv-vp, .fin-cv-stage, #map-vp, .map-vp')) break;
      const s = getComputedStyle(p); if (!/(hidden|clip)/.test(s.overflowX + s.overflowY) || /(auto|scroll)/.test(s.overflowX + s.overflowY)) continue;
      const b = p.getBoundingClientRect(), cut = r.left < b.left - 0.5 || r.right > b.right + 0.5 || r.top < b.top - 0.5 || r.bottom > b.bottom + 0.5;
      const seen2 = r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom;
      if (cut && seen2) { const key = 'cut off: ' + name(c) + ' by ' + name(p); if (!seen.has(key)) { seen.add(key); out.push(key + ' "' + (c.getAttribute('aria-label') || c.textContent || '').trim().slice(0, 30) + '"'); } }
      break;
    }
  }
  return { out, n: items.length };
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 950}); pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(500)
        await ev("window.__FIN.open('import')"); await pg.wait_for_timeout(200); await pg.click('[data-act="fin-kind"][data-k="current"]'); await pg.set_input_files('input[data-chg="fin-files"]', [f('primary_0012.csv')])
        for _ in range(100):
            if await ev("(window.__AR.UI.fin.queue || []).length && window.__AR.UI.fin.queue.every(q => ['done', 'error'].includes(q.state))"): break
            await pg.wait_for_timeout(200)
        problems, counted = {}, {}
        async def nav(page):
            assert await ev(f"""(() => {{ const el = document.querySelector('[data-nav="{page}"]'); if (el) el.click(); return !!el; }})()"""), 'no page ' + page
            await pg.wait_for_timeout(500)
        for w, h in WIDTHS:
            await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(400)
            for page in ['review', 'todo:list', 'todo:board', 'todo:map', 'import', 'emails', 'finance', 'finance:pop', 'finance:dash', 'finance-settings', 'setup']:
                if page == 'finance-settings': await nav('finance'); await pg.click('[data-act="fin-tab"][data-v="settings"]'); await pg.wait_for_timeout(400)
                elif page.startswith('todo:'):
                    await nav('todo'); await ev(f"(() => {{ const b = document.querySelector('[data-act=\"todo-mode\"][data-mode=\"{page[5:]}\"]'); if (b) b.click(); }})()"); await pg.wait_for_timeout(700)
                elif page.startswith('finance'):
                    await nav('finance'); await ev("window.__AR.UI.fin.tab = 'canvas'; window.__AR.UI.fin.cvOpen = []; window.__AR.UI.fin.pop = null"); await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(400)
                    if page == 'finance:pop': await ev("document.querySelector('[data-act=\"fin-cv-det\"]').click()"); await pg.wait_for_timeout(700)
                    if page == 'finance:dash': await ev("window.__FIN.open('dash')"); await pg.wait_for_timeout(800)
                else:
                    await nav(page)
                    if page == 'review' and w == WIDTHS[0][0]:
                        R = await ev(CHECK, [6, 4]); counted[f'{w} review'] = R['n']; [problems.setdefault(f'{w} review', []).append(x) for x in R['out']]
                        await ev("document.querySelector('[data-act=\"approve-all\"]') && document.querySelector('[data-act=\"approve-all\"]').click()"); await pg.wait_for_timeout(500); continue
                R = await ev(CHECK, [6, 4]); counted[f'{w} {page}'] = R['n']
                for x in R['out']: problems.setdefault(f'{w} {page}', []).append(x)
            await nav('finance'); await ev("window.__AR.UI.fin.tab = 'canvas'"); await ev("window.__FIN.open('map')")
        print('MEASURED', json.dumps({k: v for k, v in counted.items() if v < 8}))
        assert all(v >= 8 for k, v in counted.items() if not k.endswith('review') or k.startswith(str(WIDTHS[0][0]))), 'every page measured'
        n = sum(len(v) for v in problems.values())
        for k, v in problems.items():
            print(f'--- {k}: {len(v)}'); [print('  ' + x) for x in v[:60]]
        print('EDGES', n, 'problems;', len(errors), 'page errors'); [print(e) for e in errors[:5]]
        await b.close()
        sys.exit(1 if n or errors else 0)
asyncio.run(main())
