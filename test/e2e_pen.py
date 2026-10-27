"""Canvas on a tablet (lite artifact): top-to-bottom / left-to-right map, the ● link handle between any two boxes with
restyleable smart lines, stylus pressure strokes, palm rejection, fingers move while the pen draws, two/three-finger taps."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1280, 'height': 1500}, has_touch=True)).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        ev = pg.evaluate
        if await ev("!!document.querySelector('#su-emails')"):
            await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_selector('[data-act="gmail-check"]')
        for i in range(60):
            st = await ev("window.__AR.UI.staging.map(b=>b.state)")
            if len(st) >= 3 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        bt = await pg.query_selector('[data-act="analyze"]')
        if bt: await bt.click()
        await idle(pg); await pg.wait_for_timeout(500)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(1000)
        if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
            await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(800)
        assert await ev("document.querySelectorAll('.mnode.task').length") >= 3

        # 0. tasks that need action by me are marked; My actions fades everything else
        mine = await ev("[...window.__AR.St.tasks.values()].filter(t => t.status !== 'done' && t.status !== 'waiting' && t.ownership !== 'waiting' && t.ownership !== 'fyi').map(t => t.id)")
        others = await ev("[...window.__AR.St.tasks.values()].map(t => t.id)"); others = [x for x in others if x not in mine]
        print('MINE', len(mine), 'OTHERS', len(others)); assert mine and others, 'mock has both kinds'
        assert await ev("[...document.querySelectorAll('.mnode.task.me')].map(n => n.dataset.tid).sort().join()") == ','.join(sorted(mine))
        assert await ev(f"!!document.querySelector('.mnode.task[data-tid=\"{mine[0]}\"] .mme')")
        cnt = await ev("document.querySelector('[data-act=\"map-mine\"] .mt-count').textContent"); assert cnt == str(len(mine)), cnt
        await pg.click('[data-act="map-mine"]'); await pg.wait_for_timeout(400)
        assert await ev("window.__AR.St.settings.ui.mapMine") is True
        assert await ev("document.getElementById('map-vp').classList.contains('mine-on')")
        dimmed = await ev("[...document.querySelectorAll('.mnode.task.dim')].map(n => n.dataset.tid)"); print('FADED', len(dimmed))
        assert sorted(dimmed) == sorted(others) and not await ev("!!document.querySelector('.mnode.task.me.dim')")
        print('FADED groups', await ev("[...document.querySelectorAll('.mnode.dim:not(.task)')].map(n => n.dataset.type + ':' + (n.dataset.label || n.dataset.topic))"))
        await pg.screenshot(path=SHOTS + '/pen-0-my-actions.png')
        await pg.keyboard.press('Shift+M'); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.St.settings.ui.mapMine") is False and not await ev("!!document.querySelector('.mnode.dim')")
        await pg.click('[data-act="map-mine"]'); await pg.wait_for_timeout(300)

        # 1. direction: one tap in the toolbar flips it, Shift+V flips it back
        pos = "(() => { const L = window.__AR.UI.mapLayout; const by = t => [...L.byId.values()].filter(n => n.type === t); const r = by('root')[0], ps = by('project'), ts = by('task'); return { r: [r.x, r.y], p: ps.map(n => [n.x, n.y]), t: ts.map(n => [n.x, n.y]) }; })()"
        h = await ev(pos)
        await pg.click('.map-tools > [data-act="map-dir"]'); await pg.wait_for_timeout(700)
        assert await ev("window.__AR.St.settings.ui.mapDir") == 'v'
        assert await ev("document.querySelector('.map-tools > [data-act=\"map-dir\"]').dataset.dir") == 'h', 'button now offers horizontal'
        await pg.focus('#map-vp'); await pg.keyboard.press('Shift+V'); await pg.wait_for_timeout(500); assert await ev("window.__AR.St.settings.ui.mapDir") == 'h'
        await pg.keyboard.press('Shift+V'); await pg.wait_for_timeout(700); assert await ev("window.__AR.St.settings.ui.mapDir") == 'v'
        assert await ev("document.querySelectorAll('.mnode.task.dim').length") == len(others), 'highlight kept after flipping'
        v = await ev(pos); print('HORIZONTAL', h['r'], h['p'][:2], ' VERTICAL', v['r'], v['p'][:2])
        assert all(py > v['r'][1] + 30 for px, py in v['p']), 'projects sit below the root'
        assert all(px > h['r'][0] + 30 for px, py in h['p']), 'projects sit right of the root'
        assert len({round(py) for px, py in v['p']}) == 1, 'projects share one row'
        await pg.screenshot(path=SHOTS + '/pen-1-vertical.png')
        # a moved box in vertical mode keeps its own place and Rearrange clears it
        nb = await (await pg.query_selector('.mnode.task')).bounding_box()
        await pg.mouse.move(nb['x'] + 30, nb['y'] + nb['height'] / 2); await pg.mouse.down(); await pg.mouse.move(nb['x'] + 30, nb['y'] + 260, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(300)
        offv = await ev("Object.keys(window.__AR.St.layout.offv || {}).length"); print('OFFV', offv, 'OFF', await ev("Object.keys(window.__AR.St.layout.off || {}).length")); assert offv >= 1, 'moved in vertical mode'
        await pg.click('[data-act="map-rearrange"]'); await pg.wait_for_timeout(400)
        assert await ev("Object.keys(window.__AR.St.layout.offv || {}).length") == 0

        # 2. link any two boxes with the ● handle (select tool): a free smart line, restyleable
        tids = await ev("[...document.querySelectorAll('.mnode.task')].map(n => n.dataset.tid)")
        a, z = tids[0], tids[-1]
        await pg.hover(f'.mnode.task[data-tid="{a}"]'); await pg.wait_for_timeout(150)
        lk = await (await pg.query_selector(f'.mnode.task[data-tid="{a}"] > .lk')).bounding_box(); assert lk, 'link handle visible on hover'
        tb = await (await pg.query_selector(f'.mnode.task[data-tid="{z}"]')).bounding_box()
        n0 = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'connector').length")
        await pg.mouse.move(lk['x'] + lk['width'] / 2, lk['y'] + lk['height'] / 2); await pg.mouse.down(); await pg.mouse.move(tb['x'] + tb['width'] / 2, tb['y'] + tb['height'] / 2, steps=12); await pg.mouse.up(); await pg.wait_for_timeout(400)
        conns = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'connector')")
        assert len(conns) == n0 + 1, conns
        c = conns[-1]; print('LINK', c['from'], '→', c['to']); cid = c['id']
        d = await ev(f"document.querySelector('[data-el=\"{cid}\"] path').getAttribute('d')"); assert 'Q' in d and 'C' not in d, d
        # the smart line never runs through a box (tasks, items, projects, topics or notes)
        crossings = f"""(() => {{ const c = window.__AR.St.board.get('{cid}'), p = document.querySelector('[data-el="{cid}"] path'), M = window.__AR.UI.mapLayout;
          const skip = new Set([c.from.id, c.to.id]); const boxes = M.nodes.filter(n => !skip.has(n.id)).map(n => [n.x, n.y, n.w, n.h || 40])
            .concat([...window.__AR.St.board.values()].filter(e => ['sticky', 'text', 'shape'].includes(e.type) && !skip.has(e.id)).map(e => [e.x, e.y, e.w, e.h]));
          const L = p.getTotalLength(); let n = 0; for (let s = 0; s <= L; s += 3) {{ const q = p.getPointAtLength(s); if (boxes.some(([x, y, w, h]) => q.x > x + 1 && q.x < x + w - 1 && q.y > y + 1 && q.y < y + h - 1)) n++; }} return [n, Math.round(L)]; }})()"""
        cr = await ev(crossings); print('CROSSINGS (points inside boxes, length)', cr); assert cr[0] == 0, cr
        # drop a note right in its way: the line goes around it
        mid = await ev(f"""(() => {{ const p = document.querySelector('[data-el="{cid}"] path'); const m = p.getPointAtLength(p.getTotalLength() / 2), s = p.getScreenCTM(); return [m.x * s.a + s.e, m.y * s.d + s.f]; }})()""")
        await pg.click('[data-act="cv-tool"][data-tool="sticky"]'); await pg.mouse.click(mid[0] - 40, mid[1] - 40); await pg.wait_for_timeout(300)
        await pg.keyboard.type('In the way'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.board.values()].some(e => e.type === 'sticky')"), 'note placed'
        cr2 = await ev(crossings); print('WITH A NOTE IN THE WAY', cr2); assert cr2[0] == 0, cr2
        await pg.screenshot(path=SHOTS + '/pen-3-smart-link.png')
        # the line follows when a box moves
        tb2 = await (await pg.query_selector(f'.mnode.task[data-tid="{z}"]')).bounding_box()
        await pg.mouse.move(tb2['x'] + 30, tb2['y'] + tb2['height'] / 2); await pg.mouse.down(); await pg.mouse.move(tb2['x'] + 230, tb2['y'] + 140, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(300)
        d2 = await ev(f"document.querySelector('[data-el=\"{cid}\"] path').getAttribute('d')"); assert d2 != d, 'smart line re-routes'
        # select it and restyle: straight, dashed, no arrow
        hit = await ev(f"""(() => {{ const p = document.querySelector('[data-el="{cid}"] path'); const L = p.getTotalLength(); const m = p.getPointAtLength(L / 2); const s = p.getScreenCTM(); return [m.x * s.a + s.e, m.y * s.d + s.f]; }})()""")
        await pg.mouse.click(hit[0], hit[1]); await pg.wait_for_timeout(300)
        btns = await ev("[...document.querySelectorAll('[data-act=\"cv-conn\"]')].map(b => b.dataset.k + ':' + (b.dataset.v || ''))"); print('CONN OPTIONS', btns)
        assert btns, 'line options shown'
        assert 'Smart' in await pg.text_content('[data-act="cv-conn"][data-k="shape"]')
        await pg.click('[data-act="cv-conn"][data-k="shape"]'); await pg.wait_for_timeout(200)
        print('OLD CURVE would cross', await ev(crossings))
        assert await ev(f"window.__AR.St.board.get('{cid}').shape") == 'curve' and 'C' in await ev(f"document.querySelector('[data-el=\"{cid}\"] path').getAttribute('d')")
        for k in ['shape', 'dash', 'arrow']:
            el = await pg.query_selector(f'[data-act="cv-conn"][data-k="{k}"]')
            if el: await el.click(); await pg.wait_for_timeout(200)
        c2 = await ev(f"window.__AR.St.board.get('{cid}')"); print('STYLED', {k: c2.get(k) for k in ['shape', 'dash', 'arrow']})
        assert c2.get('shape') == 'straight' and c2.get('arrow') is False
        await pg.keyboard.press('Escape')

        # 3. stylus: pressure stroke on empty canvas with the select tool, via the browser's pen pointer
        cdp = await pg.context.new_cdp_session(pg)
        vp = await (await pg.query_selector('#map-vp')).bounding_box()
        empty = await ev("""(() => { const r = document.getElementById('map-vp').getBoundingClientRect(); for (let y = r.bottom - 40; y > r.top + 120; y -= 20) for (let x = r.left + 40; x < r.right - 260; x += 20) { const el = document.elementFromPoint(x, y); if (el && el.closest('#map-vp') && !el.closest('.mnode,[data-el],.cv-tools,.cv-sub,.cv-ctx,.minimap,.map-tools,button')) return [x, y]; } return null; })()""")
        assert empty, 'empty spot'
        s0 = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length")
        async def pen(t, x, y, f, btn='left', buttons=1):
            await cdp.send('Input.dispatchMouseEvent', {'type': t, 'x': x, 'y': y, 'button': btn, 'buttons': buttons, 'clickCount': 1, 'pointerType': 'pen', 'force': f})
        x0, y0 = empty
        await pen('mouseMoved', x0, y0, 0, 'none', 0); await pen('mousePressed', x0, y0, .2)
        for i in range(1, 16): await pen('mouseMoved', x0 + i * 8, y0 - i * 3, min(1, .2 + i * .06))
        await pen('mouseReleased', x0 + 120, y0 - 45, 0, 'left', 0); await pg.wait_for_timeout(400)
        strokes = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke')")
        print('PEN strokes', s0, '→', len(strokes))
        assert len(strokes) == s0 + 1, 'the pen draws on empty canvas'
        sk = strokes[-1]; assert sk.get('pressure') and len(sk['pts'][0]) == 3, sk['pts'][:3]
        print('PRESSURE', [pt[2] for pt in sk['pts']][:8])
        assert len({pt[2] for pt in sk['pts']}) > 3, 'pressure varies along the stroke'
        assert await ev(f"document.querySelector('[data-el=\"{sk['id']}\"] path').getAttribute('fill')") not in (None, 'none'), 'drawn as a pressure outline'

        # 4. palm rejection: a broad touch (side of the hand) does nothing; a finger moves the canvas even with the pen tool
        cam = "[window.__AR.UI.map.x, window.__AR.UI.map.y]"
        async def touch(pts_seq, r=4):
            first = pts_seq[0]
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'radiusX': r, 'radiusY': r, 'id': i} for i, (x, y) in enumerate(first)]})
            for pts in pts_seq[1:]:
                await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x, 'y': y, 'radiusX': r, 'radiusY': r, 'id': i} for i, (x, y) in enumerate(pts)]}); await pg.wait_for_timeout(16)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        c0 = await ev(cam); nb0 = await ev("window.__AR.St.board.size")
        await touch([[(x0, y0 - 80)]] + [[(x0 + i * 10, y0 - 80 + i * 6)] for i in range(1, 10)], r=30); await pg.wait_for_timeout(200)
        assert await ev(cam) == c0 and await ev("window.__AR.St.board.size") == nb0, 'palm ignored'
        await ev("window.__AR.UI.tool = 'pen'; 0")
        await touch([[(x0, y0 - 80)]] + [[(x0 + i * 10, y0 - 80 + i * 6)] for i in range(1, 10)]); await pg.wait_for_timeout(200)
        c1 = await ev(cam); print('FINGER pans', c0, '→', c1)
        assert c1 != c0 and await ev("window.__AR.St.board.size") == nb0, 'finger moved the canvas, drew nothing'
        await ev("window.__AR.UI.tool = 'select'; 0")

        # 5. two-finger tap undoes (the pen stroke), three-finger tap redoes
        await touch([[(x0, y0 - 100), (x0 + 60, y0 - 100)]]); await pg.wait_for_timeout(300)
        n_after_undo = await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length"); print('TWO-FINGER TAP strokes', n_after_undo)
        assert n_after_undo == s0, 'two-finger tap undid the stroke'
        await touch([[(x0, y0 - 100), (x0 + 50, y0 - 100), (x0 + 100, y0 - 100)]]); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") == s0 + 1, 'three-finger tap redid it'
        # a pinch is not a tap
        k0 = await ev("window.__AR.UI.map.k")
        await touch([[(x0, y0 - 100), (x0 + 60, y0 - 100)]] + [[(x0 - i * 8, y0 - 100), (x0 + 60 + i * 8, y0 - 100)] for i in range(1, 8)])
        await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") == s0 + 1 and await ev("window.__AR.UI.map.k") != k0, 'pinch zooms, does not undo'

        # 6. setting: pen only draws with the pen tool
        await pg.click('[data-menu="options"] summary'); await pg.wait_for_timeout(200)
        await pg.click('#stylus-draw'); await pg.wait_for_timeout(200); assert await ev("window.__AR.St.settings.ui.stylusDraw") is False
        await pg.keyboard.press('Escape')
        await pen('mouseMoved', x0, y0 + 10, 0, 'none', 0); await pen('mousePressed', x0, y0 + 10, .5)
        for i in range(1, 8): await pen('mouseMoved', x0 + i * 10, y0 + 10, .5)
        await pen('mouseReleased', x0 + 70, y0 + 10, 0, 'left', 0); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.board.values()].filter(e => e.type === 'stroke').length") == s0 + 1, 'no stroke when the setting is off'
        # back to left to right
        await pg.click('.map-tools > [data-act="map-dir"]'); await pg.wait_for_timeout(500)
        assert await ev("window.__AR.St.settings.ui.mapDir") == 'h'
        await pg.screenshot(path=SHOTS + '/pen-2-horizontal.png')
        print('ERRORS', errors); assert not errors
        print('PEN E2E PASSED')
        await b.close()

asyncio.run(main())
