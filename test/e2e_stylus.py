"""The stylus on the lite artifact canvas: it draws without choosing the pen (over empty canvas, tasks and notes), a
tap selects or opens, the ink it leaves is never turned into a gesture; once a stylus was used only the stylus draws
(also after a reload); a palm that lands before the pen, or while the pen hovers, is ignored and its little pan is
undone; a stroke the browser cancels part way is kept."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
from e2e_canvas_tools import setup

INK = "[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length"
CONNS = "[...window.__AR.St.board.values()].filter(e => e.type === 'connector').length"
CAM = "JSON.stringify([Math.round(window.__AR.UI.map.x), Math.round(window.__AR.UI.map.y), window.__AR.UI.map.k.toFixed(3)])"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b); ev = pg.evaluate
        cdp = await pg.context.new_cdp_session(pg)
        async def pen_down(x, y):
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0})
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x, 'y': y, 'button': 'left', 'buttons': 1, 'clickCount': 1, 'pointerType': 'pen', 'force': .5})
        async def pen_move(x, y): await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': 'left', 'buttons': 1, 'pointerType': 'pen', 'force': .5}); await pg.wait_for_timeout(8)
        async def pen_up(x, y): await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': x, 'y': y, 'button': 'left', 'buttons': 0, 'clickCount': 1, 'pointerType': 'pen', 'force': 0}); await pg.wait_for_timeout(300)
        async def pen(path):
            await pen_down(*path[0])
            for q in path[1:]: await pen_move(*q)
            await pen_up(*path[-1])
        async def touch(path, r=5, hold_end=True):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': path[0][0], 'y': path[0][1], 'radiusX': r, 'radiusY': r, 'id': 1}]})
            for (x, y) in path[1:]:
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'radiusX': r, 'radiusY': r, 'id': 1}]}); await pg.wait_for_timeout(16)
            if hold_end: await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(300)
        def seg(a, z, n=12): return [(a[0] + (z[0] - a[0]) * i / n, a[1] + (z[1] - a[1]) * i / n) for i in range(n + 1)]
        async def key(k): await ev("document.getElementById('map-vp').focus()"); await pg.keyboard.press(k); await pg.wait_for_timeout(150)
        async def bbox(sel): return await (await pg.wait_for_selector(sel)).bounding_box()
        vp = await bbox('#map-vp'); ex, ey = vp['x'] + 220, min(vp['y'] + vp['height'], 1500) - 360
        await key('Escape')
        assert await ev("window.__AR.UI.penSeen") is False

        # 1. before any stylus, a finger with the pen tool still draws (a phone without a stylus)
        await key('p'); await pg.wait_for_timeout(400); n0 = await ev(INK)
        await touch(seg((ex, ey), (ex + 160, ey + 30)))
        print('FINGER BEFORE STYLUS', n0, '→', await ev(INK), await ev("window.__AR.UI.tool"), await ev("[...window.__AR.St.board.values()].map(e=>e.type).join()"))
        assert await ev(INK) == n0 + 1, 'finger draws until a stylus is used'
        await key('Control+z'); await key('v')

        # 2. the stylus draws with the select tool — on empty canvas and across tasks, as plain ink (no link gesture)
        tids = await ev("[...document.querySelectorAll('.mnode.task')].map(n => n.dataset.tid)")
        a, z = await bbox(f'.mnode.task[data-tid="{tids[1]}"]'), await bbox(f'.mnode.task[data-tid="{tids[2]}"]')
        c0, cam0 = await ev(CONNS), await ev(CAM)
        await pen(seg((a['x'] + a['width'] / 2, a['y'] + a['height'] / 2), (z['x'] + z['width'] / 2, z['y'] + z['height'] / 2), 14))
        print('PEN OVER TASKS → ink', await ev(INK), 'links', await ev(CONNS))
        assert await ev(INK) == n0 + 1 and await ev(CONNS) == c0, 'stylus without the pen tool leaves plain ink over tasks'
        assert await ev("window.__AR.UI.tool") == 'select' and await ev("window.__AR.UI.penSeen") is True
        assert await ev("localStorage.getItem('ar-pen-seen')") == '1'
        await pg.wait_for_timeout(400)

        # 3. a stylus tap on a task opens it; a tap on a note selects it
        t = await bbox(f'.mnode.task[data-tid="{tids[0]}"]')
        await pen([(t['x'] + 30, t['y'] + t['height'] / 2)])
        assert await ev("window.__AR.UI.mapSel") == tids[0], 'stylus tap on a task selects it'
        await pg.wait_for_timeout(300)
        if await ev("!!window.__AR.UI.drawer"): await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(300)
        assert not await ev("!!window.__AR.UI.drawer")
        await key('n'); await pg.mouse.click(ex + 520, ey + 130); await pg.wait_for_timeout(300); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        sid = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'sticky').pop().id")
        await ev("window.__AR.UI.cvSel.clear(); 0"); await key('v'); await pg.wait_for_timeout(450)
        s = await bbox(f'[data-el="{sid}"]'); await pen([(s['x'] + s['width'] / 2, s['y'] + s['height'] / 2)])
        assert await ev("[...window.__AR.UI.cvSel]") == [sid], 'stylus tap on a note selects it'
        assert await ev(INK) == n0 + 1, 'taps leave no dots'

        # 4. after the stylus, a finger never draws — also after a reload
        await key('p'); await pg.wait_for_timeout(500); n1 = await ev(INK)
        await touch(seg((ex, ey + 60), (ex + 160, ey + 90)))
        assert await ev(INK) == n1, 'finger does not draw once a stylus was used'
        await key('v')

        # 5. the palm lands first and drags a little, then the pen writes: the stroke is drawn, the pan undone
        await pg.wait_for_timeout(800); cam1 = await ev(CAM); n2 = await ev(INK)
        await touch([(ex + 300, ey + 120), (ex + 310, ey + 126), (ex + 322, ey + 133)], hold_end=False)
        await pen(seg((ex, ey + 140), (ex + 150, ey + 170)))
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(300)
        print('PALM FIRST: ink', await ev(INK) - n2, 'camera', cam1, '→', await ev(CAM))
        assert await ev(INK) == n2 + 1 and await ev(CAM) == cam1, 'palm before the pen is ignored'

        # 6. a touch while the pen hovers just above the screen is a palm
        await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': ex + 50, 'y': ey, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0})
        # an empty spot of canvas (no box, note or toolbar under the finger)
        fx, fy = await ev("""() => { const r = document.getElementById('map-vp').getBoundingClientRect();
          for (let y = r.top + 80; y < Math.min(r.bottom, innerHeight) - 120; y += 30) for (let x = r.left + 80; x < r.right - 140; x += 30) {
            const ok = [[0, 0], [100, 60], [50, 30]].every(([dx, dy]) => { const e = document.elementFromPoint(x + dx, y + dy); return e && e.closest('#map-vp') && !e.closest('.mnode,[data-el],.cv-tools,.cv-sub,.cv-ctx,.cv-panel,.board-bar,.minimap,button'); });
            if (ok) return [x, y]; } return [r.left + 300, r.top + 300]; }""")
        await touch(seg((fx, fy), (fx + 100, fy + 60)))
        assert await ev(CAM) == cam1, 'palm while the pen hovers is ignored'
        await pg.wait_for_timeout(700)
        await touch(seg((fx, fy), (fx + 100, fy + 60)))
        assert await ev(CAM) != cam1, 'a finger later still moves the canvas'

        # 7. a stroke the browser cancels part way is kept
        await ev("document.addEventListener('pointerdown', e => { if (e.pointerType === 'pen') window.__lastPenId = e.pointerId; }, true); 0")
        n3 = await ev(INK); await pen_down(ex, ey + 200)
        for q in seg((ex, ey + 200), (ex + 140, ey + 230))[1:]: await pen_move(*q)
        await ev("document.getElementById('map-vp').dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: window.__lastPenId, pointerType: 'pen' })); 0")
        await pen_up(ex + 140, ey + 230)
        print('CANCELLED STROKE kept:', await ev(INK) - n3)
        assert await ev(INK) == n3 + 1, 'cancelled stroke kept'

        # 8. the pen tool's smart gestures still work when the pen is chosen
        await pg.click('[data-act="map-fit"] >> nth=0'); await pg.wait_for_timeout(700)
        await key('p'); a, z = await bbox(f'.mnode.task[data-tid="{tids[0]}"]'), await bbox(f'.mnode.task[data-tid="{tids[2]}"]')
        c1 = await ev(CONNS); await pen(seg((a['x'] + a['width'] / 2, a['y'] + a['height'] / 2), (z['x'] + z['width'] / 2, z['y'] + z['height'] / 2), 14))
        assert await ev(CONNS) == c1 + 1, 'straight pen line between two boxes links them with the pen tool'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'stylus.png'))
        # the stylus is remembered on this device after a reload (the test store itself starts empty again)
        await pg.reload(); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        assert await ev("window.__AR.UI.penSeen") is True, 'stylus remembered after a reload'
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('STYLUS E2E PASSED'); await b.close()

asyncio.run(main())
