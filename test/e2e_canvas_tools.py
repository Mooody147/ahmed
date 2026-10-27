"""Canvas tools on the lite artifact, driven with a real stylus (pen pointer events) and mouse: smart pen gestures
(✓ done, scribble delete, line link, loop select, hold-to-snap shapes), lasso; then the other canvas tools as they
are added (see the sections below)."""
import asyncio, os, sys, json
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
ME = 'm.sobeah@contractor.example'

async def setup(b):
    pg = await (await b.new_context(viewport={'width': 1400, 'height': 1500}, has_touch=True)).new_page()
    pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
    await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
    ev = pg.evaluate
    if await ev("!!document.querySelector('#su-emails')"):
        await pg.fill('#su-emails', ME); await pg.click('[data-act="save-quick-setup"]')
    await pg.click('.rail [data-nav="import"]'); await pg.wait_for_selector('[data-act="gmail-check"]')
    for i in range(60):
        st = await ev("window.__AR.UI.staging.map(b=>b.state)")
        if len(st) >= 3 and all(s != 'parsing' for s in st): break
        await pg.wait_for_timeout(400)
    if await ev("!!document.querySelector('[data-act=\"analyze\"]')"): await pg.click('[data-act="analyze"]')
    await idle(pg); await pg.wait_for_timeout(500)
    for i in range(50):
        if not await ev("window.__AR.UI.analyzing"): break
        await pg.wait_for_timeout(200)
    await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300)
    if await ev("!!document.querySelector('[data-act=\"approve-all\"]')"): await pg.click('[data-act="approve-all"]')
    await pg.wait_for_timeout(400)
    await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(900)
    if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
        await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(800)
    return pg

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b); ev = pg.evaluate
        cdp = await pg.context.new_cdp_session(pg)
        async def pen(path, hold=0):
            x0, y0 = path[0]
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x0, 'y': y0, 'button': 'none', 'buttons': 0, 'pointerType': 'pen', 'force': 0})
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mousePressed', 'x': x0, 'y': y0, 'button': 'left', 'buttons': 1, 'clickCount': 1, 'pointerType': 'pen', 'force': .5})
            for (x, y) in path[1:]:
                await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseMoved', 'x': x, 'y': y, 'button': 'left', 'buttons': 1, 'pointerType': 'pen', 'force': .5}); await pg.wait_for_timeout(8)
            if hold: await pg.wait_for_timeout(hold)
            xe, ye = path[-1]
            await cdp.send('Input.dispatchMouseEvent', {'type': 'mouseReleased', 'x': xe, 'y': ye, 'button': 'left', 'buttons': 0, 'clickCount': 1, 'pointerType': 'pen', 'force': 0})
            await pg.wait_for_timeout(350)
        def seg(a, z, n=10): return [(a[0] + (z[0] - a[0]) * i / n, a[1] + (z[1] - a[1]) * i / n) for i in range(n + 1)]
        async def box(sel): return await (await pg.query_selector(sel)).bounding_box()
        conns = "[...window.__AR.St.board.values()].filter(e => e.type === 'connector').length"
        # use the pen tool for gestures
        await pg.keyboard.press('Escape'); await ev("document.getElementById('map-vp').focus()"); await pg.keyboard.press('p'); await pg.wait_for_timeout(200)
        assert await ev("window.__AR.UI.tool") == 'pen'
        tids = await ev("[...document.querySelectorAll('.mnode.task')].map(n => n.dataset.tid)")
        # 1. ✓ over a task marks it done
        t0 = tids[0]; bx = await box(f'.mnode.task[data-tid="{t0}"]')
        cx, cy = bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .5
        await pen(seg((cx - 18, cy - 6), (cx - 6, cy + 8), 5) + seg((cx - 6, cy + 8), (cx + 22, cy - 22), 8)[1:])
        st = await ev(f"window.__AR.St.tasks.get('{t0}').status"); print('TICK →', st); assert st == 'done', 'a ✓ marks the task done'
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") == 0, 'the ✓ is not kept as ink'
        await pg.click('.map-tools [data-act="cv-undo"]'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{t0}').status") != 'done', 'Undo'
        # 2. a line from one task to another links them
        a, z = tids[1], tids[2]; ba, bz = await box(f'.mnode.task[data-tid="{a}"]'), await box(f'.mnode.task[data-tid="{z}"]')
        n0 = await ev(conns)
        await pen(seg((ba['x'] + ba['width'] / 2, ba['y'] + ba['height'] / 2), (bz['x'] + bz['width'] / 2, bz['y'] + bz['height'] / 2), 14))
        assert await ev(conns) == n0 + 1, 'line between boxes becomes a link'
        # 3. hold still at the end: rough rectangle → clean rectangle (on empty canvas below the map)
        vp = await box('#map-vp'); ex, ey = vp['x'] + 160, vp['y'] + vp['height'] - 260
        rough = seg((ex, ey), (ex + 200, ey + 6), 8) + seg((ex + 200, ey + 6), (ex + 196, ey + 120), 6)[1:] + seg((ex + 196, ey + 120), (ex - 4, ey + 116), 8)[1:] + seg((ex - 4, ey + 116), (ex + 2, ey + 4), 6)[1:]
        await pen(rough, hold=800)
        sh = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'shape')"); print('SNAPPED', [(s['kind'], s['w'], s['h']) for s in sh])
        assert sh and sh[-1]['kind'] == 'rect' and 180 < sh[-1]['w'] * 1 and sh[-1]['w'] < 260 / 0.5, sh
        # a rough circle held → ellipse
        import math
        circ = [(ex + 420 + 70 * math.cos(i / 24 * 2 * math.pi) + (3 if i % 3 else -2), ey + 60 + 50 * math.sin(i / 24 * 2 * math.pi)) for i in range(25)]
        await pen(circ, hold=800)
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'shape').slice(-1)[0].kind") == 'ellipse'
        # without holding, the same drawing stays as ink
        await pen([(x + 700, y) for x, y in rough])
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") == 1, 'not held: kept as ink'
        # 4. scribble over the rectangle deletes it
        r = sh[-1]; rect = await box(f'[data-el="{r["id"]}"]')
        zz = [];
        for i in range(9): zz.append((rect['x'] + 20 + (i % 2) * (rect['width'] - 40), rect['y'] + 20 + i * (rect['height'] - 40) / 8))
        fine = [zz[0]]
        for q in zz[1:]: fine += seg(fine[-1], q, 6)[1:]
        await pen(fine)
        assert not await ev(f"window.__AR.St.board.has('{r['id']}')"), 'scribble deletes the shape'
        # 5. a loop around two tasks selects them
        bs = [await box(f'.mnode.task[data-tid="{t}"]') for t in tids[1:3]]
        X0 = min(q['x'] for q in bs) - 30; Y0 = min(q['y'] for q in bs) - 30; X1 = max(q['x'] + q['width'] for q in bs) + 30; Y1 = max(q['y'] + q['height'] for q in bs) + 30
        if X1 - X0 > 900 or Y1 - Y0 > 700: bs = bs[:1]; X0 = bs[0]['x'] - 30; Y0 = bs[0]['y'] - 30; X1 = bs[0]['x'] + bs[0]['width'] + 30; Y1 = bs[0]['y'] + bs[0]['height'] + 30
        loop = seg((X0, Y0), (X1, Y0)) + seg((X1, Y0), (X1, Y1))[1:] + seg((X1, Y1), (X0, Y1))[1:] + seg((X0, Y1), (X0, Y0 + 5))[1:]
        await pen(loop)
        sel = await ev("[...window.__AR.UI.lassoTasks]"); print('LOOP selected', len(sel)); assert len(sel) >= 1
        assert 'selected' in await pg.text_content('.cv-ctx')
        await pg.click('[data-act="lasso-clear"]')
        # 6. the Lasso tool (mouse) selects drawings and notes too
        await pg.keyboard.press('q'); await pg.wait_for_timeout(100)
        stroke = await ev("[...window.__AR.St.board.values()].find(e => e.type === 'stroke').id")
        sb = await box(f'[data-el="{stroke}"]')
        L0, T0, L1, T1 = sb['x'] - 20, sb['y'] - 20, sb['x'] + sb['width'] + 20, sb['y'] + sb['height'] + 20
        await pg.mouse.move(L0, T0); await pg.mouse.down()
        for (x, y) in seg((L0, T0), (L1, T0)) + seg((L1, T0), (L1, T1)) + seg((L1, T1), (L0, T1)) + seg((L0, T1), (L0, T0)): await pg.mouse.move(x, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        assert stroke in await ev("[...window.__AR.UI.cvSel]"), 'lasso selects the ink'
        await pg.screenshot(path=SHOTS + '/tools-1-pen.png')
        # gestures can be switched off
        await ev("window.__AR.St.settings.ui = { ...(window.__AR.St.settings.ui || {}), penGestures: false }; 0"); await pg.keyboard.press('Escape'); await pg.keyboard.press('p')
        await pen(seg((cx - 18, cy - 6), (cx - 6, cy + 8), 5) + seg((cx - 6, cy + 8), (cx + 22, cy - 22), 8)[1:])
        assert await ev(f"window.__AR.St.tasks.get('{t0}').status") != 'done', 'gestures off: the ✓ is just ink'
        await ev("window.__AR.St.settings.ui = { ...(window.__AR.St.settings.ui || {}), penGestures: true }; 0")
        print('PEN TOOLS OK')

        # ---- boards, saved views, layers, align & snap ----
        await pg.keyboard.press('Escape'); await pg.keyboard.press('v')
        assert await ev("document.querySelectorAll('.board-bar .bb-tab').length") >= 2, 'board tabs'
        await pg.click('[data-act="board-add"]'); await pg.wait_for_timeout(400)
        await pg.fill('#bb-name', 'Pumps scratch'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        pages = await ev("window.__AR.St.layout.pages"); print('BOARDS', pages); assert pages and pages[-1]['name'] == 'Pumps scratch'
        pid = pages[-1]['id']
        assert await ev("document.querySelectorAll('.mnode').length") == 0, 'the task map stays on the Tasks board'
        # two notes on the new board
        vp = await box('#map-vp')
        for i, (x, y) in enumerate([(vp['x'] + 300, vp['y'] + 300), (vp['x'] + 620, vp['y'] + 340)]):
            await pg.keyboard.press('n'); await pg.mouse.click(x, y); await pg.wait_for_timeout(200); await pg.keyboard.type(f'Note {i + 1}'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150); await pg.keyboard.press('Escape')
        notes = await ev(f"[...window.__AR.St.board.values()].filter(e => e.page === '{pid}' && e.type === 'sticky').map(e => [e.id, e.x, e.y])"); print('NOTES', notes); assert len(notes) == 2
        # select both (click, Shift+click) and align their tops
        await pg.keyboard.press('Escape')
        nb = await box(f'[data-el="{notes[0][0]}"]'); nb2 = await box(f'[data-el="{notes[1][0]}"]')
        await pg.mouse.click(nb['x'] + 20, nb['y'] + 20); await pg.wait_for_timeout(150)
        await pg.keyboard.down('Shift'); await pg.mouse.click(nb2['x'] + 20, nb2['y'] + 20); await pg.keyboard.up('Shift'); await pg.wait_for_timeout(200)
        print('SEL', await ev("[...window.__AR.UI.cvSel]")); assert len(await ev("[...window.__AR.UI.cvSel]")) == 2
        await pg.click('[data-act="cv-align"][data-a="t"]'); await pg.wait_for_timeout(300)
        ys = await ev(f"[...window.__AR.St.board.values()].filter(e => e.page === '{pid}' && e.type === 'sticky').map(e => e.y)"); print('ALIGNED tops', ys); assert len(set(ys)) == 1
        # drag one note near the other: it snaps to its left edge (guide shown while dragging)
        n1 = await box(f'[data-el="{notes[0][0]}"]'); n2 = await box(f'[data-el="{notes[1][0]}"]')
        await pg.mouse.click(vp['x'] + 40, vp['y'] + vp['height'] - 120); await pg.wait_for_timeout(100)
        await pg.mouse.move(n2['x'] + 30, n2['y'] + 30); await pg.mouse.down()
        tx = n1['x'] + 30 + 3; ty = n2['y'] + 30 + 260
        await pg.mouse.move(tx, ty, steps=12); await pg.wait_for_timeout(120)
        guide = await ev("!!document.querySelector('.cv-guides line')"); await pg.mouse.up(); await pg.wait_for_timeout(300)
        xs = await ev(f"[...window.__AR.St.board.values()].filter(e => e.page === '{pid}' && e.type === 'sticky').map(e => e.x)"); print('SNAP xs', xs, 'guide', guide)
        assert len(set(xs)) == 1 and guide, 'snapped to the other note with a guide line'
        # saved view: name it, move away, jump back
        await pg.click('[data-act="views-toggle"]'); await pg.click('[data-act="view-new"]'); await pg.fill('#view-name', 'Pump notes'); await pg.click('[data-act="view-save"]'); await pg.wait_for_timeout(200)
        cam = await ev("[window.__AR.UI.map.x, window.__AR.UI.map.y, window.__AR.UI.map.k]")
        await pg.click('[data-act="board-go"][data-id="main"]'); await pg.wait_for_timeout(600)
        assert await ev("window.__AR.UI.page") == 'main' and await ev("document.querySelectorAll('.mnode.task').length") > 0
        await pg.click('[data-act="views-toggle"]'); await pg.click('[data-act="view-go"]'); await pg.wait_for_timeout(600)
        cam2 = await ev("[window.__AR.UI.map.x, window.__AR.UI.map.y, window.__AR.UI.map.k]"); print('VIEW', cam, cam2)
        assert await ev("window.__AR.UI.page") == pid and all(abs(a - b) < 2 for a, b in zip(cam, cam2))
        await pg.screenshot(path=SHOTS + '/tools-2-boards.png')
        # layers: hide notes, then lock ink
        await pg.click('[data-act="board-go"][data-id="main"]'); await pg.wait_for_timeout(500)
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="layer"][data-k="tasks"][data-f="hide"]'); await pg.wait_for_timeout(300)
        assert await ev("document.querySelectorAll('.mnode').length") == 0, 'task layer hidden'
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="layer"][data-k="tasks"][data-f="hide"]'); await pg.wait_for_timeout(300)
        assert await ev("document.querySelectorAll('.mnode').length") > 0
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="layer"][data-k="ink"][data-f="lock"]'); await pg.wait_for_timeout(200)
        stroke = await ev("[...window.__AR.St.board.values()].find(e => e.type === 'stroke' && !e.page)")
        if stroke:
            await pg.keyboard.press('Escape'); sb = await box(f'[data-el="{stroke["id"]}"] path')
            await pg.mouse.move(sb['x'] + sb['width'] / 2, sb['y'] + sb['height'] / 2); await pg.mouse.down(); await pg.mouse.move(sb['x'] + 200, sb['y'] + 120, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
            assert await ev(f"window.__AR.St.board.get('{stroke['id']}').pts[0][0]") == stroke['pts'][0][0], 'locked ink does not move'
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="layer"][data-k="ink"][data-f="lock"]'); await pg.keyboard.press('Escape')
        # delete the board (Undo brings it back)
        await pg.click(f'[data-act="board-go"][data-id="{pid}"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="board-del"]'); await pg.click('[data-act="board-del-yes"]'); await pg.wait_for_timeout(300)
        assert not await ev("(window.__AR.St.layout.pages || []).length") and not await ev(f"[...window.__AR.St.board.values()].some(e => e.page === '{pid}')")
        await pg.click('.toast:has-text("Board deleted") button'); await pg.wait_for_timeout(400)
        assert await ev("(window.__AR.St.layout.pages || []).length") == 1 and await ev(f"[...window.__AR.St.board.values()].filter(e => e.page === '{pid}').length") == 2
        await pg.click('[data-act="board-go"][data-id="main"]'); await pg.wait_for_timeout(400)
        print('BOARDS OK')

        print('ERRORS', errors); assert not errors
        print('CANVAS TOOLS E2E PASSED')
        await b.close()

asyncio.run(main())
