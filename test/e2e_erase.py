"""Delete, eraser and undo on the lite artifact against a slow store (writes take 500 ms, a snapshot taken before a
write lands shows the old data, and only 3 writes may run at once): stylus strokes can be selected, deleted and
erased; a quick eraser swipe takes every line it crosses; a finger erases after a stylus was used; nothing deleted
comes back and nothing undone is reversed by a late snapshot."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
from e2e_canvas_tools import setup

STROKES = "[...window.__AR.St.board.values()].filter(e => e.type === 'stroke' && (e.page || 'main') === 'main').map(e => e.id).sort()"

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b); ev = pg.evaluate
        cdp = await pg.context.new_cdp_session(pg)
        async def pen(path, buttons=1, btn='left'):
            x0, y0 = path[0]
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x0, 'y': y0, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0})
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x0, 'y': y0, 'button': btn, 'buttons': buttons, 'clickCount': 1, 'pointerType': 'pen', 'force': .5})
            for (x, y) in path[1:]:
                await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': btn, 'buttons': buttons, 'pointerType': 'pen', 'force': .5}); await pg.wait_for_timeout(8)
            xe, ye = path[-1]
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': xe, 'y': ye, 'button': btn, 'buttons': 0, 'clickCount': 1, 'pointerType': 'pen', 'force': 0})
            await pg.wait_for_timeout(300)
        async def touch(path):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': path[0][0], 'y': path[0][1], 'radiusX': 5, 'radiusY': 5, 'id': 1}]})
            for (x, y) in path[1:]:
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'radiusX': 5, 'radiusY': 5, 'id': 1}]}); await pg.wait_for_timeout(16)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(300)
        def arc(x, y, w=180, n=14): return [(x + w * i / n, y + 18 * ((i / n - .5) ** 2) * 4) for i in range(n + 1)]
        async def settle(ms=2600): await pg.wait_for_timeout(ms)
        async def key(k): await ev("document.getElementById('map-vp').focus()"); await pg.keyboard.press(k); await pg.wait_for_timeout(150)

        # empty canvas under the task map; gestures off so the test strokes stay plain ink
        await key('Escape'); await ev("window.__AR.St.settings.ui = { ...(window.__AR.St.settings.ui || {}), penGestures: false }; 0")
        vp = await (await pg.query_selector('#map-vp')).bounding_box(); ex, ey = vp['x'] + 200, vp['y'] + vp['height'] - 300
        await key('p')
        for i in range(3): await pen(arc(ex, ey + i * 60))
        ids = await ev(STROKES); print('STROKES', len(ids)); assert len(ids) == 3, ids
        assert await ev(f"window.__AR.St.board.get('{ids[0]}').pressure") is True, 'stylus strokes keep pressure'
        await ev("window.__dbLag = 500; window.__maxBusy = 3; 0")

        # 1. select a stylus stroke with the stylus and delete it; it stays deleted while the store catches up
        await key('v'); await pen([(ex + 90, ey + 1), (ex + 90, ey + 1)])
        sel = await ev("[...window.__AR.UI.cvSel]"); print('SELECTED', sel); assert sel == [ids[0]], 'a stylus stroke can be selected'
        await key('Delete'); await settle()
        left = await ev(STROKES); print('AFTER DELETE', len(left)); assert ids[0] not in left and len(left) == 2, 'deleted stroke stays deleted'
        await pg.click('.map-tools [data-act="cv-undo"]'); await settle()
        assert await ev(STROKES) == ids, 'Undo brings it back and it stays back'

        # 2. one quick eraser swipe (two moves) across all three strokes takes all of them
        await key('e')
        await pg.mouse.move(ex + 60, ey - 40); await pg.mouse.down(); await pg.mouse.move(ex + 70, ey + 70); await pg.mouse.move(ex + 80, ey + 170); await pg.mouse.up()
        await settle()
        left = await ev(STROKES); print('AFTER SWIPE', len(left)); assert left == [], 'a fast swipe erases every stroke it crosses'
        await key('Control+z'); await settle()
        back = await ev(STROKES); print('AFTER UNDO', len(back)); assert back == ids, 'Undo restores the erased strokes and they stay'
        await key('Control+Shift+z'); await settle()
        assert await ev(STROKES) == [], 'Redo erases them again'
        await key('Control+z'); await settle(); assert await ev(STROKES) == ids

        # 3. the stylus side button (or its eraser end) erases whatever tool is chosen
        await key('p'); await pen([(ex + 120, ey - 30), (ex + 120, ey + 30)], buttons=2, btn='right'); await settle()
        left = await ev(STROKES); print('STYLUS ERASER', len(left)); assert ids[0] not in left, 'stylus side button erases'
        await key('Control+z'); await settle(); assert await ev(STROKES) == ids

        # 4. with the eraser chosen a finger erases too, even after the stylus was used
        await key('e'); await touch([(ex + 150, ey + 100), (ex + 150, ey + 150)]); await settle()
        left = await ev(STROKES); print('FINGER ERASER', len(left)); assert ids[2] not in left, 'finger erases with the eraser tool'
        await key('Control+z'); await settle(); assert await ev(STROKES) == ids

        # 5. a task deleted and undone on the slow store
        await key('v'); tid = await ev("document.querySelector('.mnode.task').dataset.tid")
        await pg.click(f'.mnode.task[data-tid="{tid}"] .mtitle, .mnode.task[data-tid="{tid}"]', position={'x': 20, 'y': 12}); await pg.wait_for_timeout(300)
        if await ev("!!window.__AR.UI.drawer"): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await ev(f"window.__AR.UI.mapSel = '{tid}'; 0"); await key('Delete'); await settle()
        assert not await ev(f"window.__AR.St.tasks.has('{tid}')"), 'deleted task stays deleted'
        await key('Control+z'); await settle()
        assert await ev(f"window.__AR.St.tasks.has('{tid}')"), 'Undo brings the task back and it stays'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'erase.png'))
        bad = [e for e in errors if 'Could not save' in e or 'PAGEERROR' in e]
        assert not bad, bad
        print('ALL ERASE/DELETE/UNDO CHECKS PASSED'); await b.close()

asyncio.run(main())
