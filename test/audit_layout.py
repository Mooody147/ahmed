"""Layout audit of the Money canvas at desktop, laptop, tablet and phone widths, with data: the canvas with its talk
box, and every part opened from it as a panel — no sideways scrolling, no text drawn over other text (chart labels
included), no text cut off by its box, canvas cards never on top of each other, no page errors.
Usage: python3 test/audit_layout.py  (prints the problems found; exit 1 when there are any)"""
import asyncio, os, sys, subprocess, json
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
FX = os.path.join(HERE, 'shots', 'finfx2'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
SECS = ['dash', 'update', 'import', 'ledger', 'exp', 'inc', 'budget', 'sim', 'forecast', 'buy', 'credit', 'accounts', 'own', 'settings']
WIDTHS = [(1400, 950), (1100, 800), (820, 1100), (390, 844)]
CHECK = r"""() => {
  const main = document.querySelector('#main'), out = [], W = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    // name the elements that stick out (leaves, and not inside a box that scrolls or clips)
    const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const wide = [...document.querySelectorAll('body *')].filter(el => !el.closest('svg') && el.getBoundingClientRect().right > innerWidth + 1 && !clipped(el) && ![...el.children].some(c => c.getBoundingClientRect().right > innerWidth + 1));
    out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + ' > ' + innerWidth + ' — ' + wide.slice(0, 4).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' "' + (el.textContent || el.value || el.placeholder || '').trim().slice(0, 30) + '"').join(' | '));
  }
  const vis = el => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // text boxes: elements that hold text themselves
  const pan = document.getElementById('fin-panel'), full = pan && getComputedStyle(pan).position === 'fixed';
  const texts = [...(full ? pan : main).querySelectorAll('*')].filter(el => !el.closest('svg') && !el.closest('#fin-cv-vp') && (full || !el.closest('#fin-panel') || !!pan) && !el.closest('.sr') && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && vis(el) && !el.closest('details:not([open]) > :not(summary)'));
  // text inside a scroll box only counts where the box shows it
  const clipOf = el => { let c = null; for (let p = el.parentElement; p && p !== main; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) { const r = p.getBoundingClientRect(); c = c ? { left: Math.max(c.left, r.left), top: Math.max(c.top, r.top), right: Math.min(c.right, r.right), bottom: Math.min(c.bottom, r.bottom) } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; } } return c; };
  const boxes = texts.map(el => { const rg = document.createRange(); rg.selectNodeContents(el); const c = clipOf(el); const rs = [...rg.getClientRects()].map(r => c ? { left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) } : r).map(r => ({ ...r, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.right - r.left, height: r.bottom - r.top })).filter(r => r.width > 1 && r.height > 1); return { el, rs }; });
  // clipped: a box narrower than its text, where the overflow is hidden (except intended ellipsis cells)
  for (const el of texts) { const s = getComputedStyle(el); if ((s.overflowX === 'hidden' || s.overflow === 'hidden' || s.textOverflow === 'ellipsis') && el.clientWidth > 4 && el.scrollWidth > el.clientWidth + 2 && !el.matches('.fin-desc, .fin-hb-l, .mono, option')) out.push('text cut off: "' + el.textContent.trim().slice(0, 50) + '" (' + el.scrollWidth + ' > ' + el.clientWidth + ')'); }
  // text running outside its card
  for (const { el, rs } of boxes) { const card = el.closest('.card, .fin-kpi, .fin-q-item, .fin-preview'); if (!card || el.closest('.tbl-wrap, .fin-nav, .fin-tl, .fin-mini')) continue; const c = card.getBoundingClientRect(); for (const r of rs) if (r.right > c.right + 2 || r.left < c.left - 2) { out.push('text outside its card: "' + el.textContent.trim().slice(0, 50) + '"'); break; } }
  // text over text
  const flat = []; boxes.forEach(({ el, rs }, i) => rs.forEach(r => flat.push({ i, el, r })));
  for (let a = 0; a < flat.length; a++) for (let b = a + 1; b < flat.length; b++) {
    const A = flat[a], B = flat[b]; if (A.i === B.i || A.el.contains(B.el) || B.el.contains(A.el)) continue;
    const x = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), y = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (x > 3 && y > 3) { out.push('overlap: "' + A.el.textContent.trim().slice(0, 30) + '" × "' + B.el.textContent.trim().slice(0, 30) + '"'); if (out.length > 40) return out; }
  }
  // chart labels over each other
  for (const svg of main.querySelectorAll('svg.fin-chart')) { const ts = [...svg.querySelectorAll('text')].map(t => ({ t, r: t.getBoundingClientRect() })).filter(x => x.r.width);
    for (let a = 0; a < ts.length; a++) for (let b = a + 1; b < ts.length; b++) { const A = ts[a].r, B = ts[b].r, x = Math.min(A.right, B.right) - Math.max(A.left, B.left), y = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top); if (x > 2 && y > 2) out.push('chart labels overlap: "' + ts[a].t.textContent + '" × "' + ts[b].t.textContent + '" in ' + (svg.getAttribute('aria-label') || '')); }
    for (const g of svg.querySelectorAll('g')) { const box = g.querySelector('rect'); if (!box) continue; const b = box.getBoundingClientRect(); for (const t of g.querySelectorAll('text')) { const r = t.getBoundingClientRect(); if (r.width && (r.right > b.right + 2 || r.left < b.left - 2)) out.push('chart text outside its box: "' + t.textContent + '" in ' + (svg.getAttribute('aria-label') || '')); } }
    const r = svg.getBoundingClientRect(); if (r.right > W + 1) out.push('chart wider than the screen: ' + svg.getAttribute('aria-label')); }
  // canvas cards: none on top of another (in the canvas's own coordinates)
  const cards = [...document.querySelectorAll('#fin-cv-world .fin-cvn')].map(n => ({ n, x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }));
  for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) { const A = cards[a], B = cards[b]; if (Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) > 2 && Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) > 2) out.push('canvas cards overlap: "' + A.n.textContent.trim().slice(0, 25) + '" × "' + B.n.textContent.trim().slice(0, 25) + '"'); }
  return [...new Set(out)];
}"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 950}); pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(500)
        async def imp(files, kind):
            await ev("window.__FIN.open('import')"); await pg.wait_for_timeout(200); await pg.click(f'[data-act="fin-kind"][data-k="{kind}"]'); await pg.set_input_files('input[data-chg="fin-files"]', files)
            for _ in range(100):
                if await ev(f"(window.__AR.UI.fin.queue || []).length >= {len(files)} && window.__AR.UI.fin.queue.slice(0, {len(files)}).every(q => ['done', 'error'].includes(q.state))"): break
                await pg.wait_for_timeout(200)
        n0 = 0
        await imp([f('CARD_AUG.pdf'), f('CARD_SEP.pdf')], 'credit_card'); await pg.wait_for_timeout(300)
        await imp([f('primary_0012.csv'), f('bankA_aug-nov.csv')], 'current'); await pg.wait_for_timeout(300)
        await ev("""() => { const UI = window.__AR.UI; }""")
        await ev("window.__FIN.open('buy')"); await pg.wait_for_timeout(300)
        for name, price in [('Laptop with a long descriptive name for testing', '40000'), ('Phone', '15000'), ('Sofa', '120000')]:
            await pg.fill('#by-name', name); await pg.fill('#by-price', price); await pg.click('[data-act="fin-buy-save"]'); await pg.wait_for_timeout(200)
        problems = {}
        for w, h in WIDTHS:
            await pg.set_viewport_size({'width': w, 'height': h}); await pg.wait_for_timeout(600)
            if w < 600 and await ev("!document.getElementById('fin-cv-vp')"):
                await pg.click('.ph-tab[data-k="more"]'); await pg.click('[data-act="ph-nav"][data-view="finance"]'); await pg.wait_for_timeout(400)
            await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(300)
            for d in ('v', 'h'):
                await pg.click(f'[data-act="fin-cv-dir"][data-v="{d}"]'); await pg.wait_for_timeout(400)
                found = await ev(CHECK)
                if found: problems[f'{w}px canvas {d}'] = found
            await pg.click('[data-act="fin-cv-dir"][data-v="v"]'); await pg.wait_for_timeout(400)
            if w in (1400, 390): await pg.screenshot(path=os.path.join(HERE, 'shots', f'audit-{w}-canvas.png'))
            # every part, opened from the canvas as a panel
            for s in SECS:
                await ev(f"window.__FIN.open('{s}')"); await pg.wait_for_timeout(450)
                await ev("document.querySelectorAll('#fin-panel details').forEach(d => d.open = true)"); await pg.wait_for_timeout(150)
                found = await ev(CHECK)
                if found: problems[f'{w}px {s}'] = found
                if w in (1400, 390) and s in ('dash', 'buy', 'update', 'credit', 'import'): await pg.screenshot(path=os.path.join(HERE, 'shots', f'audit-{w}-{s}.png'))
            await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(200)
            # the edit form on the canvas
            node = await ev("(document.querySelector('.fin-leaf.editable') || {}).dataset?.node")
            if node:
                await ev(f"window.__FIN.edit('{node}')"); await pg.wait_for_timeout(300)
                found = await ev(CHECK + "")
                ed = await ev("(() => { const e = document.getElementById('fin-cv-ed'), s = document.querySelector('.fin-cv-stage'); if (!e) return 'no form'; const a = e.getBoundingClientRect(), b = s.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1 ? '' : 'form outside the canvas'; })()")
                if ed: found = (found or []) + [ed]
                if found: problems[f'{w}px edit form'] = found
                if w in (1400, 390): await pg.screenshot(path=os.path.join(HERE, 'shots', f'audit-{w}-edit.png'))
                await ev("document.querySelector('[data-act=\"fin-cv-ed-x\"]').click()"); await pg.wait_for_timeout(200)
        for k, v in problems.items(): print(f'== {k}'); [print('   ', x) for x in v[:12]]
        bad = [e for e in errors if 'PAGEERROR' in e]
        print('PAGE ERRORS', bad[:5]); print('AUDIT', 'CLEAN' if not problems and not bad else f'{sum(len(v) for v in problems.values())} problems')
        await b.close(); sys.exit(1 if problems or bad else 0)
asyncio.run(main())
