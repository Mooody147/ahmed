"""Canvas tools on the lite artifact, driven with a real stylus (pen pointer events) and mouse: smart pen gestures
(✓ done, scribble delete, line link, loop select, hold-to-snap shapes), lasso; then the other canvas tools as they
are added (see the sections below)."""
import asyncio, os, sys, json, math
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

        # ---- images (with redline reading), stamps, tables ----
        await pg.keyboard.press('Escape'); await pg.keyboard.press('v')
        n_imgs = "[...window.__AR.St.board.values()].filter(e => e.type === 'image').length"
        async with pg.expect_file_chooser() as fc:
            await pg.click('.cv-tools [data-act="cv-tool"][data-tool="image"]', timeout=5000) if await ev("!!document.querySelector('.cv-tools [data-act=\"cv-tool\"][data-tool=\"image\"]:not(.cvt-fly *)')") else await pg.keyboard.press('i')
        await (await fc.value).set_files(os.path.join(HERE, 'fixtures', 'drawing.png')); await pg.wait_for_timeout(1200)
        assert await ev(n_imgs) == 1, 'image placed'
        img = await ev("[...window.__AR.St.board.values()].find(e => e.type === 'image')"); print('IMAGE', img['w'], img['h'], img['src'][:30], img.get('assetId'))
        assert img['src'] and img['h'] == 400
        await pg.wait_for_timeout(300)
        ib = await box(f'[data-el="{img["id"]}"]')
        assert await ev(f"document.querySelector('[data-el=\"{img['id']}\"] img').naturalWidth") > 0, 'image shows'
        # mark it up: a pen circle on the pump (starting inside the drawing, so it stays ink), and a Code 3 stamp
        await pg.keyboard.press('p')
        cx, cy = ib['x'] + ib['width'] * .33, ib['y'] + ib['height'] * .44
        await pen([(cx + 60 * math.cos(i / 20 * 2 * math.pi), cy + 60 * math.sin(i / 20 * 2 * math.pi)) for i in range(21)])
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") >= 2, 'circle kept as ink on the drawing'
        await pg.keyboard.press('Escape'); await pg.keyboard.press('j'); await pg.wait_for_timeout(200)
        assert await ev("!!document.querySelector('.stamp-pick')"), 'stamp chooser'
        await pg.click('.stamp-pick [data-k="c3"]'); await pg.mouse.click(ib['x'] + ib['width'] * .7, ib['y'] + ib['height'] * .2); await pg.wait_for_timeout(300)
        stp = await ev("[...window.__AR.St.board.values()].find(e => e.type === 'stamp')"); print('STAMP', stp and stp['kind']); assert stp and stp['kind'] == 'c3'
        assert 'REVISE' in await pg.text_content(f'[data-el="{stp["id"]}"]')
        # read the markups
        await ev("""window.__mockBaseCT = window.__mockBaseCT || window.__mockAnswer; window.__mockAnswer = p => /marked up by hand/.test(p) ? { title: 'ELM-ME-DWG-0101 Rev B', comments: [{ no: 1, where: 'pump P-101', comment: 'Check NPSH at minimum level', action: 'check' }, { no: 2, where: 'top right', comment: 'Code 3 — revise and resubmit', action: 'revise' }] } : window.__mockBaseCT(p); 0""")
        await pg.keyboard.press('Escape'); await pg.mouse.click(ib['x'] + 30, ib['y'] + ib['height'] - 30); await pg.wait_for_timeout(250)
        assert img['id'] in await ev("[...window.__AR.UI.cvSel]")
        await pg.click('[data-act="mk-read"]'); await pg.wait_for_timeout(1500)
        last = await ev("window.__prompts.filter(p => /marked up by hand/.test(p.prompt)).slice(-1)[0]"); print('SENT images', last and last['images'], last and last['tier'])
        assert last and last['images'] == 1
        tb = await ev("[...window.__AR.St.board.values()].find(e => e.type === 'table' && e.fromImage)"); print('CRS TABLE', tb and tb['rows'])
        assert tb and len(tb['rows']) == 3 and 'NPSH' in tb['rows'][1][2]
        await pg.screenshot(path=SHOTS + '/tools-3-redline.png')
        n0 = await ev("window.__AR.St.tasks.size")
        await pg.click('.toast:has-text("read from your markups") button'); await pg.wait_for_timeout(400)
        t = await ev("[...window.__AR.St.tasks.values()].find(t => /markups/i.test(t.title))"); print('TASK', t and t['title'], t and len(t['subtasks']))
        assert t and len(t['subtasks']) == 2 and await ev("window.__AR.St.tasks.size") == n0 + 1
        # a table: place, type in a cell, add a row
        await pg.keyboard.press('Escape'); await pg.keyboard.press('g'); vp = await box('#map-vp')
        await pg.mouse.click(vp['x'] + 140, vp['y'] + vp['height'] - 330); await pg.wait_for_timeout(300)
        t2 = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'table' && !e.fromImage).slice(-1)[0]"); assert t2
        cell = await box(f'[data-el="{t2["id"]}"] td[data-cell="0,0"]')
        await pg.mouse.click(cell['x'] + 10, cell['y'] + 10); await pg.wait_for_timeout(120); await pg.mouse.click(cell['x'] + 10, cell['y'] + 10); await pg.wait_for_timeout(300)
        await pg.keyboard.type('Duty flow'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(400)
        rows = await ev(f"window.__AR.St.board.get('{t2['id']}').rows"); print('TABLE rows', rows); assert rows[0][0] == 'Duty flow'
        await pg.mouse.click(cell['x'] + 10, cell['y'] + 10); await pg.wait_for_timeout(200)
        await pg.click('[data-act="tb-row"][data-d="1"]'); await pg.wait_for_timeout(200)
        assert len(await ev(f"window.__AR.St.board.get('{t2['id']}').rows")) == 4
        print('DRAWINGS OK')

        # ---- Claude on the canvas ----
        await ev("""window.__mockBaseAI = window.__mockBaseAI || window.__mockAnswer; window.__mockAnswer = p => {
          if (/handwriting by/.test(p)) return /turn it into to-do tasks/.test(p) ? { text: 'Call Omar re channel width tomorrow\\nSend Hany disc filter comments Thu', tasks: [{ title: 'Call Omar about channel width', owner: 'me', deadline: '2026-10-28', project: null, priority: 'medium' }, { title: 'Send Hany disc filter comments', owner: 'me', deadline: '2026-10-29', project: null, priority: 'high' }] } : { text: 'Check NPSH margin' };
          if (/^Break this engineering task/.test(p)) return { steps: ['Collect vendor pump curves', 'Recalculate NPSHa at minimum level', 'Update calc and issue Rev B'] };
          if (/^Group these notes/.test(p)) { const ids = [...p.matchAll(/"id":"(b[a-z0-9]+)"/g)].map(m => m[1]); return { themes: [{ name: 'Pumps', ids: ids.slice(0, 2) }, { name: 'Civil', ids: ids.slice(2) }] }; }
          if (/^Turn this description into a process flow/.test(p)) return { title: 'Sludge line', nodes: [{ id: 'a', label: 'Clarifier', kind: 'start' }, { id: 'b', label: 'Thickener', kind: 'process' }, { id: 'c', label: 'Dewatered?', kind: 'decision' }, { id: 'd', label: 'Disposal', kind: 'end' }], links: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'd', label: 'yes' }] };
          return window.__mockBaseAI(p); }; 0""")
        await pg.click('[data-act="board-add"]'); await pg.wait_for_timeout(300); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        vp = await box('#map-vp'); ox, oy = vp['x'] + 200, vp['y'] + 260
        # handwriting: a few strokes written with the pen
        await pg.keyboard.press('Escape'); await pg.keyboard.press('p')
        for i in range(4): await pen(seg((ox + i * 40, oy), (ox + i * 40 + 18, oy + 50), 8))
        await pg.keyboard.press('q')
        L0, T0, L1, T1 = ox - 30, oy - 30, ox + 220, oy + 90
        await pg.mouse.move(L0, T0); await pg.mouse.down()
        for (x, y) in seg((L0, T0), (L1, T0)) + seg((L1, T0), (L1, T1)) + seg((L1, T1), (L0, T1)) + seg((L0, T1), (L0, T0)): await pg.mouse.move(x, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        assert len(await ev("[...window.__AR.UI.cvSel]")) == 4
        n0 = await ev("window.__AR.St.tasks.size")
        await pg.click('[data-act="cai-hw"][data-m="tasks"]'); await pg.wait_for_timeout(900)
        assert 'Tasks from your handwriting' in await pg.text_content('#drawer')
        assert await ev("window.__prompts.filter(p => /handwriting by/.test(p.prompt)).slice(-1)[0].images") == 1
        await pg.click('[data-act="hw-add"]'); await pg.wait_for_timeout(400)
        assert await ev("window.__AR.St.tasks.size") == n0 + 2, 'two tasks from handwriting'
        assert await ev("[...window.__AR.St.tasks.values()].some(t => t.title === 'Call Omar about channel width' && t.deadline === '2026-10-28')")
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke' && e.page === window.__AR.UI.page).length") == 0, 'handwriting removed'
        # to text
        await pg.keyboard.press('p')
        for i in range(3): await pen(seg((ox + i * 40, oy), (ox + i * 40 + 18, oy + 50), 8))
        await pg.keyboard.press('q'); await pg.mouse.move(L0, T0); await pg.mouse.down()
        for (x, y) in seg((L0, T0), (L1, T0)) + seg((L1, T0), (L1, T1)) + seg((L1, T1), (L0, T1)) + seg((L0, T1), (L0, T0)): await pg.mouse.move(x, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        await pg.click('[data-act="cai-hw"][data-m="text"]'); await pg.wait_for_timeout(900)
        for i in range(20):
            if await ev("[...window.__AR.St.board.values()].some(e => e.type === 'text' && e.text === 'Check NPSH margin')"): break
            await pg.wait_for_timeout(200)
        print('TEXT DBG', await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'text').map(e => e.text)"), await ev("window.__prompts.filter(p => /handwriting by/.test(p.prompt)).length"))
        assert await ev("[...window.__AR.St.board.values()].some(e => e.type === 'text' && e.text === 'Check NPSH margin')"), 'typed text'
        # group notes into themes
        for i in range(4):
            await pg.keyboard.press('n'); await pg.mouse.click(vp['x'] + 120 + i * 240, vp['y'] + 560); await pg.wait_for_timeout(150); await pg.keyboard.type(['Pump curve', 'NPSH', 'Channel width', 'Anchor bolts'][i]); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(120)
        sticky = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'sticky' && e.page === window.__AR.UI.page).map(e => e.id)"); assert len(sticky) == 4
        bs = [await box(f'[data-el="{x}"]') for x in sticky]
        L0, T0 = min(q['x'] for q in bs) - 20, min(q['y'] for q in bs) - 20; L1, T1 = max(q['x'] + q['width'] for q in bs) + 20, max(q['y'] + q['height'] for q in bs) + 20
        await pg.keyboard.press('q'); await pg.mouse.move(L0, T0); await pg.mouse.down()
        for (x, y) in seg((L0, T0), (L1, T0)) + seg((L1, T0), (L1, T1)) + seg((L1, T1), (L0, T1)) + seg((L0, T1), (L0, T0)): await pg.mouse.move(x, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        print('GROUP SEL', len(await ev("[...window.__AR.UI.cvSel]"))); assert len([x for x in await ev("[...window.__AR.UI.cvSel]") if x in sticky]) == 4
        await pg.click('[data-act="cai-group"]'); await pg.wait_for_timeout(900)
        frames = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'frame' && e.page === window.__AR.UI.page).map(e => e.text)"); print('THEMES', frames)
        assert sorted(frames) == ['Civil', 'Pumps']
        # process flow from typed arrows, then from words (Claude)
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="flow-open"]'); await pg.wait_for_timeout(200)
        await pg.fill('#flow-text', 'Inlet → Fine screens → Grit removal → Aeration → Clarifier → Disc filter'); await pg.click('[data-act="flow-draw"]'); await pg.wait_for_timeout(500)
        sh = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'shape' && e.page === window.__AR.UI.page).map(e => e.text)"); print('FLOW', sh)
        assert sh[:6] == ['Inlet', 'Fine screens', 'Grit removal', 'Aeration', 'Clarifier', 'Disc filter']
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'connector' && e.page === window.__AR.UI.page).length") == 5
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="flow-open"]'); await pg.fill('#flow-text', 'Sludge from the clarifiers goes to the thickener, then if it is dewatered it is disposed'); await pg.click('[data-act="flow-draw"]'); await pg.wait_for_timeout(700)
        kinds = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'shape' && e.page === window.__AR.UI.page).slice(-4).map(e => e.kind + ':' + e.text)"); print('FLOW 2', kinds)
        assert kinds == ['ellipse:Clarifier', 'rect:Thickener', 'diamond:Dewatered?', 'ellipse:Disposal']
        await pg.screenshot(path=SHOTS + '/tools-4-ai.png')
        # break a task down (Tasks board)
        await pg.click('[data-act="board-go"][data-id="main"]'); await pg.wait_for_timeout(600)
        tid = await ev("[...window.__AR.St.tasks.values()].find(t => /RAS pump/.test(t.title) && t.status !== 'done').id")
        k0 = len(await ev(f"window.__AR.St.tasks.get('{tid}').subtasks"))
        await pg.click(f'.mnode.task[data-tid="{tid}"] .mtxt b'); await pg.wait_for_timeout(500)
        assert await ev("!!document.querySelector('#drawer [data-act=\"cai-break\"]')"), 'Break it down in the task panel'
        await pg.click('#drawer [data-act="cai-break"]'); await pg.wait_for_timeout(900)
        subs = await ev(f"window.__AR.St.tasks.get('{tid}').subtasks.map(x => x.text)"); print('STEPS', subs[-3:])
        assert len(subs) == k0 + 3 and 'Recalculate NPSHa' in subs[-2]
        print('CANVAS AI OK')

        # ---- fishbone, board templates, people lanes ----
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await ev("""window.__mockBaseL = window.__mockBaseL || window.__mockAnswer; window.__mockAnswer = p => /^Build an Ishikawa/.test(p) ? { branches: [{ name: 'Equipment', causes: ['Impeller wear', 'Wrong pump curve'] }, { name: 'Process', causes: ['Low wet-well level'] }] } : window.__mockBaseL(p); 0""")
        nb0 = await ev("(window.__AR.St.layout.pages || []).length")
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="fish-open"]'); await pg.fill('#fish-q', 'RAS pump cavitation'); await pg.click('[data-act="fish-draw"]'); await pg.wait_for_timeout(900)
        pg_now = await ev("window.__AR.UI.page"); assert pg_now != 'main' and await ev("(window.__AR.St.layout.pages || []).length") == nb0 + 1
        texts = await ev(f"[...window.__AR.St.board.values()].filter(e => e.page === '{pg_now}' && e.type === 'text').map(e => e.text)"); print('FISH', texts)
        assert all(c in texts for c in ['Design', 'Equipment', 'Process', 'Materials', 'Measurement', 'Site & people']) and 'Impeller wear' in texts and 'Low wet-well level' in texts
        assert await ev(f"[...window.__AR.St.board.values()].some(e => e.page === '{pg_now}' && e.type === 'shape' && e.text === 'RAS pump cavitation')")
        await pg.screenshot(path=SHOTS + '/tools-5-fishbone.png')
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="tpl-board-open"]'); await pg.click('#drawer [data-act="tpl-board"][data-k="submittal"]'); await pg.wait_for_timeout(600)
        fr = await ev("[...window.__AR.St.board.values()].filter(e => e.page === window.__AR.UI.page && e.type === 'frame').map(e => e.text)"); print('TEMPLATE', fr)
        assert 'Code 3 — revise & resubmit' in fr and len(fr) == 5
        names = await ev("window.__AR.St.layout.pages.map(p => p.name)"); print('BOARDS', names); assert 'Submittal tracker' in names
        await pg.click('[data-act="board-go"][data-id="main"]'); await pg.wait_for_timeout(500)
        # people lanes
        await pg.click('[data-act="todo-mode"][data-mode="people"]'); await pg.wait_for_timeout(500)
        lanes = await ev("[...document.querySelectorAll('.pl-lane')].map(l => l.dataset.lane + ':' + l.querySelectorAll('.pl-card').length)"); print('LANES', lanes)
        assert lanes[0].startswith('me:') and len(lanes) >= 2
        other = [l for l in lanes if not l.startswith('me:')][0].split(':')[0]
        card = await ev(f"document.querySelector('.pl-lane[data-lane=\"{other}\"] .pl-card').dataset.dragTask")
        await pg.drag_and_drop(f'.pl-card[data-drag-task="{card}"]', '.pl-lane[data-lane="me"] .pl-cards'); await pg.wait_for_timeout(400)
        t = await ev(f"window.__AR.St.tasks.get('{card}')"); print('TAKEN BACK', t['ownership'], t['owner']); assert t['ownership'] == 'mine'
        await pg.screenshot(path=SHOTS + '/tools-6-people.png')
        await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(500)
        print('LAYOUTS OK')

        print('ERRORS', errors); assert not errors
        print('CANVAS TOOLS E2E PASSED')
        await b.close()

asyncio.run(main())
