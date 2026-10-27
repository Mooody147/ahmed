"""Canvas touch & stylus options on the lite artifact: zoom lock (wheel, buttons, pinch, Fit keep the zoom), the pen
panel inside the tool (pen types, width, colours, any colour), pressure response, Touch & stylus sheet (finger
action, two-finger zoom off, tap & hold item picker and lasso, four-finger tap), hover preview, the More menu scrolls
to its last item on a short screen, and no hint sentence on the canvas."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
from e2e_canvas_tools import setup

K = "window.__AR.UI.map.k"
TC = "JSON.stringify((window.__AR.St.settings.ui || {}).touch || {})"
LAST = "[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').pop()"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b); ev = pg.evaluate
        cdp = await pg.context.new_cdp_session(pg)
        async def pen(path, hold=0, force=.5):
            x0, y0 = path[0]
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x0, 'y': y0, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0})
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x0, 'y': y0, 'button': 'left', 'buttons': 1, 'clickCount': 1, 'pointerType': 'pen', 'force': force})
            if hold: await pg.wait_for_timeout(hold)
            for (x, y) in path[1:]:
                await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': 'left', 'buttons': 1, 'pointerType': 'pen', 'force': force}); await pg.wait_for_timeout(10)
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': path[-1][0], 'y': path[-1][1], 'button': 'left', 'buttons': 0, 'clickCount': 1, 'pointerType': 'pen', 'force': 0})
            await pg.wait_for_timeout(300)
        async def fingers(seq):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'radiusX': 5, 'radiusY': 5, 'id': i} for i, (x, y) in enumerate(seq[0])]})
            for pts in seq[1:]:
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'radiusX': 5, 'radiusY': 5, 'id': i} for i, (x, y) in enumerate(pts)]}); await pg.wait_for_timeout(16)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(300)
        def seg(a, z, n=12): return [(a[0] + (z[0] - a[0]) * i / n, a[1] + (z[1] - a[1]) * i / n) for i in range(n + 1)]
        async def key(k): await ev("document.getElementById('map-vp').focus()"); await pg.keyboard.press(k); await pg.wait_for_timeout(150)
        async def bbox(sel): return await (await pg.wait_for_selector(sel)).bounding_box()
        vp = await bbox('#map-vp'); ex, ey = vp['x'] + 220, min(vp['y'] + vp['height'], 1500) - 360
        await key('Escape')

        # 6. no hint sentence on the canvas; colours are no longer in the bottom bar
        assert await ev("!document.querySelector('.map-hint')"), 'hint sentence removed'
        assert await ev("!document.querySelector('.cv-sub .sw')"), 'colours moved into the tools'

        # 1. zoom lock
        k0 = await ev(K); assert await ev("document.getElementById('zoom-pct').textContent") == f"{round(k0 * 100)}%"
        await pg.click('.cv-sub [data-act="zoom-lock"]'); await pg.wait_for_timeout(200)
        assert '"zoomLock":true' in await ev(TC)
        x0 = await ev("window.__AR.UI.map.y")
        await pg.mouse.move(ex + 100, ey); await pg.mouse.wheel(0, 300); await pg.wait_for_timeout(200)
        assert await ev(K) == k0 and await ev("window.__AR.UI.map.y") != x0, 'locked: the wheel moves, does not zoom'
        await pg.click('[data-act="map-zoom"][data-z="1"]'); await pg.click('[data-act="map-fit"] >> nth=0'); await pg.wait_for_timeout(500)
        assert await ev(K) == k0, 'locked: + and Fit keep the zoom'
        cx, cy = ex + 200, ey - 100
        await fingers([[(cx - 30, cy), (cx + 30, cy)]] + [[(cx - 30 - i * 12, cy), (cx + 30 + i * 12, cy)] for i in range(1, 9)])
        assert await ev(K) == k0, 'locked: a pinch does not zoom'
        await pg.click('.cv-sub [data-act="zoom-lock"]'); await pg.wait_for_timeout(200)
        await pg.mouse.move(ex + 100, ey); await pg.mouse.wheel(0, -300); await pg.wait_for_timeout(200)
        assert await ev(K) != k0, 'unlocked: the wheel zooms'
        await pg.click('[data-act="map-fit"] >> nth=0'); await pg.wait_for_timeout(500)

        # 5. the pen panel: types, width, colours
        await pg.click('.cv-tools [data-tool="pen"]:visible >> nth=0'); await pg.wait_for_timeout(200)
        assert await ev("window.__AR.UI.tool") == 'pen'
        assert await ev("document.querySelectorAll('.cv-panel .cvp-brush').length") == 4, 'pen types in the pen tool'
        await pg.click('.cv-panel [data-b="marker"]'); await pg.wait_for_timeout(200)
        await ev("(() => { const r = document.getElementById('cvp-w'); r.value = 14; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); })()"); await pg.wait_for_timeout(200)
        await pg.click('.cv-panel .sw[data-c="#E5484D"]'); await pg.wait_for_timeout(200)
        await pg.mouse.move(ex, ey); await pg.mouse.down()
        for (x, y) in seg((ex, ey), (ex + 150, ey + 20))[1:]: await pg.mouse.move(x, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        st = await ev(f"(s => s && [s.brush, s.width, s.alpha, s.color])({LAST})"); print('MARKER', st)
        assert st == ['marker', 14, 0.9, '#E5484D'], st
        assert await ev("!document.querySelector('.cv-panel')"), 'the panel folds away when you draw'
        await pg.click('.cv-tools [data-tool="pen"]:visible >> nth=0'); await pg.wait_for_timeout(150)
        await ev("(() => { const i = document.querySelector('.cv-panel input[type=color]'); i.value = '#123456'; i.dispatchEvent(new Event('change', { bubbles: true })); })()"); await pg.wait_for_timeout(200)
        assert await ev("window.__AR.UI.cvColor") == '#123456', 'any colour'
        await pg.click('.cv-panel [data-act="tool-panel-close"]'); await pg.wait_for_timeout(150)
        assert await ev("!document.querySelector('.cv-panel')"), 'panel closes'
        await pg.click('.cv-tools [data-tool="pen"]:visible >> nth=0'); await pg.wait_for_timeout(150)
        assert await ev("!!document.querySelector('.cv-panel')"), 'tapping the pen again opens its panel'
        await pg.click('.cv-panel [data-b="pen"]'); await pg.wait_for_timeout(150)

        # pressure response: lightest 50 % → no point thinner than half pressure
        await pg.click('.cv-sub [data-act="touch-open"]'); await pg.wait_for_selector('.ts-sheet:not([hidden])')
        await ev("(() => { const r = document.querySelector('.ts-sheet [data-k=\"pLo\"]'); r.value = 50; r.dispatchEvent(new Event('change', { bubbles: true })); })()"); await pg.wait_for_timeout(200)
        await pen(seg((ex, ey + 60), (ex + 150, ey + 80)), force=.1)
        ps = await ev(f"{LAST}.pts.map(p => p[2])"); print('PRESSURE', ps[:4], await ev(f"{LAST}.brush"))
        assert min(ps) >= 0.5 and await ev(f"{LAST}.pressure") is True

        # 3. the sheet scrolls to its very end
        sc = await ev("(() => { const b = document.querySelector('.ts-body'); b.scrollTop = b.scrollHeight; const last = [...b.querySelectorAll('section')].pop().getBoundingClientRect(); return [b.scrollHeight > b.clientHeight, last.bottom <= innerHeight + 1]; })()")
        print('SHEET SCROLL', sc); assert sc == [True, True]
        # finger action: pan — a finger on a note moves the canvas, not the note
        await pg.click('.ts-sheet [data-k="finger"][data-v="pan"]'); await pg.wait_for_timeout(150)
        assert '"finger":"pan"' in await ev(TC)
        # two-finger zoom off
        await pg.click('.ts-tog:has([data-k="zoom"])'); await pg.wait_for_timeout(150); assert '"zoom":false' in await ev(TC)
        # tap & hold: lasso
        await pg.click('.ts-sheet [data-k="holdAct"][data-v="lasso"]'); await pg.wait_for_timeout(150)
        await pg.click('[data-act="touch-close"]'); await pg.wait_for_timeout(200)
        await key('n'); await pg.mouse.click(ex + 520, ey + 130); await pg.wait_for_timeout(300); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        sid = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'sticky').pop().id"); await key('v'); await pg.wait_for_timeout(300)
        nb = await bbox(f'[data-el="{sid}"]'); c1, nx = await ev("JSON.stringify([window.__AR.UI.map.x, window.__AR.UI.map.y])"), await ev(f"window.__AR.St.board.get('{sid}').x")
        await fingers([[(nb['x'] + 60, nb['y'] + 60)]] + [[(nb['x'] + 60 + i * 8, nb['y'] + 60 + i * 4)] for i in range(1, 8)])
        assert await ev(f"window.__AR.St.board.get('{sid}').x") == nx and await ev("JSON.stringify([window.__AR.UI.map.x, window.__AR.UI.map.y])") != c1, 'finger pans'
        k1 = await ev(K); cx, cy = ex + 200, ey - 100
        await fingers([[(cx - 30, cy), (cx + 30, cy)]] + [[(cx - 30 - i * 12, cy), (cx + 30 + i * 12, cy)] for i in range(1, 9)])
        assert await ev(K) == k1, 'two-finger zoom off'
        nb = await bbox(f'[data-el="{sid}"]'); lx, ly = nb['x'] - 40, nb['y'] - 40
        loop = [(lx, ly), (lx + nb['width'] + 80, ly), (lx + nb['width'] + 80, ly + nb['height'] + 80), (lx, ly + nb['height'] + 80), (lx, ly + 4)]
        path = []
        for i in range(4): path += seg(loop[i], loop[i + 1], 8)[1:]
        n0 = await ev("window.__AR.St.board.size")
        await pen([loop[0]] + path, hold=650)
        sel = await ev("[...window.__AR.UI.cvSel]"); print('HOLD LASSO', sel)
        assert sid in sel and await ev("window.__AR.St.board.size") == n0, 'hold then draw = lasso selection, no ink'
        # item picker: hold on the note with the stylus, then it follows the pen
        await ev("window.__AR.UI.cvSel.clear(); 0")
        await pg.click('.cv-sub [data-act="touch-open"]'); await pg.click('.ts-sheet [data-k="holdAct"][data-v="pick"]'); await pg.click('[data-act="touch-close"]'); await pg.wait_for_timeout(200)
        nb = await bbox(f'[data-el="{sid}"]'); x1 = await ev(f"window.__AR.St.board.get('{sid}').x")
        await pen(seg((nb['x'] + 50, nb['y'] + 50), (nb['x'] + 130, nb['y'] + 90), 10), hold=650)
        x2 = await ev(f"window.__AR.St.board.get('{sid}').x"); print('PICK MOVE', x1, '→', x2)
        assert x2 > x1 + 20, 'item picker: the held note moves with the pen'

        # four-finger tap toggles the zoom lock
        await pg.wait_for_timeout(700)
        tl = '"zoomLock":true' in await ev(TC)
        pts4 = [(ex + 100 + i * 40, ey - 150) for i in range(4)]
        await fingers([pts4, pts4])
        assert ('"zoomLock":true' in await ev(TC)) != tl, 'four-finger tap toggles the zoom lock'

        # hover preview ring
        await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': ex + 40, 'y': ey + 200, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0}); await pg.wait_for_timeout(50)
        assert await ev("(() => { const r = document.getElementById('pen-hover'); return !!r && !r.hidden; })()"), 'hover preview'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'touch.png'))

        # 4. the More menu on a short screen scrolls to its last item
        await pg.set_viewport_size({'width': 900, 'height': 640}); await pg.wait_for_timeout(400)
        await pg.evaluate("window.scrollTo(0, 0)")
        await pg.click('[data-menu="options"] summary'); await pg.wait_for_timeout(300)
        m = await ev("(() => { const p = document.querySelector('details[data-menu=\"options\"] .menu-pop'); p.scrollTop = p.scrollHeight; const r = p.getBoundingClientRect(), last = [...p.querySelectorAll('button')].pop().getBoundingClientRect(); return [Math.round(r.bottom) <= innerHeight, p.scrollHeight > p.clientHeight, last.bottom <= innerHeight && last.bottom <= r.bottom + 1]; })()")
        print('MENU SCROLL', m); assert m == [True, True, True], m
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'touch-menu.png'))
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('TOUCH E2E PASSED'); await b.close()

asyncio.run(main())
