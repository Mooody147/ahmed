"""Editable canvas (tools, move/resize, connectors, undo, full screen, history) and the Daily tracker."""
import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 950}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1')
        await pg.wait_for_timeout(1500); await idle(pg)
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(300)
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(1500)
        ev = pg.evaluate
        board = lambda: ev("[...window.__AR.St.board.values()].map(e=>({id:e.id,type:e.type,kind:e.kind,text:e.text,x:e.x,y:e.y,w:e.w,h:e.h,n:(e.pts||[]).length,from:e.from&&e.from.id,to:e.to&&e.to.id}))")
        async def tool(t):
            b = pg.locator(f'[data-act="cv-tool"][data-tool="{t}"]').first
            if not await b.is_visible():  # tools grouped in a flyout: hover the group to open it
                await pg.hover(f'.cvt-group:has([data-tool="{t}"]) > .cvt'); await pg.wait_for_timeout(80)
                b = pg.locator(f'.cvt-fly [data-act="cv-tool"][data-tool="{t}"]')
            await b.click(); await pg.wait_for_timeout(100)
        async def drag(x1, y1, x2, y2, steps=10):
            await pg.mouse.move(x1, y1); await pg.mouse.down(); await pg.mouse.move(x2, y2, steps=steps); await pg.mouse.up(); await pg.wait_for_timeout(250)
        async def box(sel): return await (await pg.query_selector(sel)).bounding_box()

        # full screen
        await pg.click('[data-act="map-full"]'); await pg.wait_for_timeout(500)
        # thread cards are tested in e2e_thread; off here so "empty area to the right of the tree" stays empty
        await ev("document.getElementById('map-threads').click()"); await pg.wait_for_timeout(300); await pg.click('[data-act="map-fit"]'); await pg.wait_for_timeout(400)
        vp = await box('#map-vp')
        print('FULL', await ev("!!document.querySelector('.map-wrap.full')"), round(vp['height']))
        assert await ev("!!document.querySelector('.map-wrap.full')") and vp['height'] > 700
        await pg.screenshot(path=SHOTS + '/80-canvas-full.png')
        # empty area to the right of the tree
        ex, ey = vp['x'] + vp['width'] - 260, vp['y'] + 120

        # sticky note: click, type, Escape
        await tool('sticky'); await pg.mouse.click(ex, ey); await pg.wait_for_timeout(200)
        assert await ev("!!document.activeElement.closest('[data-el]')"), 'sticky opens for typing'
        await pg.keyboard.type('Ask vendor for\nNPSHr curve'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        bd = await board(); st = [e for e in bd if e['type'] == 'sticky']
        print('STICKY', st); assert st and st[0]['text'] == 'Ask vendor for\nNPSHr curve'
        sticky = st[0]['id']

        # rectangle by dragging
        await tool('rect'); await drag(ex - 40, ey + 260, ex + 160, ey + 360)
        await pg.keyboard.type('Decision'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
        rect = [e for e in await board() if e['type'] == 'shape'][0]; print('RECT', rect); assert rect['w'] > 150 and rect['text'] == 'Decision'

        # pen stroke
        await tool('pen'); await drag(ex - 200, ey + 420, ex + 40, ey + 470, steps=20)
        strokes = [e for e in await board() if e['type'] == 'stroke']; print('STROKE pts', [s['n'] for s in strokes]); assert strokes and strokes[0]['n'] > 5

        # arrow
        await tool('arrow'); await drag(ex - 200, ey + 520, ex + 60, ey + 520)
        assert [e for e in await board() if e['type'] == 'line']

        # connector: sticky -> a task node
        await tool('connector')
        sb = await box(f'[data-el="{sticky}"]'); tb = await box('.mnode.task >> nth=0')
        await drag(sb['x'] + 40, sb['y'] + 40, tb['x'] + 40, tb['y'] + 20, steps=14)
        conns = [e for e in await board() if e['type'] == 'connector']; print('CONNECTOR', conns); assert conns and conns[0]['from'] == sticky

        # connector between two tasks links them
        before = await ev("[...window.__AR.St.tasks.values()].reduce((n,t)=>n+(t.relatedIds||[]).length,0)")
        t1 = await box('.mnode.task >> nth=0'); t2 = await box('.mnode.task >> nth=2')
        await drag(t1['x'] + 60, t1['y'] + 20, t2['x'] + 60, t2['y'] + 20, steps=14)
        after = await ev("[...window.__AR.St.tasks.values()].reduce((n,t)=>n+(t.relatedIds||[]).length,0)")
        print('TASK LINKS', before, '->', after); assert after == before + 1

        # select tool: move the sticky, resize it
        await tool('select')
        sb = await box(f'[data-el="{sticky}"]'); s0 = [e for e in await board() if e['id'] == sticky][0]
        await drag(sb['x'] + 30, sb['y'] + 30, sb['x'] + 130, sb['y'] + 80)
        s1 = [e for e in await board() if e['id'] == sticky][0]; print('MOVE', (s0['x'], s0['y']), '->', (s1['x'], s1['y'])); assert s1['x'] > s0['x'] + 50
        rz = await box(f'[data-el="{sticky}"] .rz'); await drag(rz['x'] + 6, rz['y'] + 6, rz['x'] + 60, rz['y'] + 40)
        s2 = [e for e in await board() if e['id'] == sticky][0]; print('RESIZE', s1['w'], '->', s2['w']); assert s2['w'] > s1['w'] + 20

        # move a project node: its whole branch follows
        pb = await box('.mnode.project >> nth=0'); pid = await ev("document.querySelector('.mnode.project').dataset.node")
        tasks_before = await ev("[...document.querySelectorAll('.mnode.task')].map(n=>[n.dataset.tid,n.offsetLeft,n.offsetTop])")
        await drag(pb['x'] + 30, pb['y'] + pb['height'] / 2, pb['x'] + 30, pb['y'] + pb['height'] / 2 + 120)
        off = await ev(f"window.__AR.St.layout.off[{json.dumps(pid)}]")
        tasks_after = dict((t, (x, y)) for t, x, y in await ev("[...document.querySelectorAll('.mnode.task')].map(n=>[n.dataset.tid,n.offsetLeft,n.offsetTop])"))
        moved = [t for t, x, y in tasks_before if tasks_after[t][1] != y]
        print('BRANCH', off, 'moved tasks', len(moved)); assert off and off['dy'] > 50 and moved

        # eraser removes the stroke; undo brings it back; redo removes it again
        await tool('eraser')
        stroke_el = await box('.map-ink [data-el] path >> nth=0')
        sid = strokes[0]['id']
        await pg.evaluate(f"(()=>{{}})()")
        sp = await ev(f"(()=>{{const p=document.querySelector('[data-el=\"{sid}\"] path');const l=p.getTotalLength();const pt=p.getPointAtLength(l/2);const m=p.getScreenCTM();return [pt.x*m.a+m.e, pt.y*m.d+m.f]}})()")
        await drag(sp[0] - 20, sp[1], sp[0] + 20, sp[1])
        gone = not [e for e in await board() if e['id'] == sid]; print('ERASED', gone); assert gone
        await tool('select'); await pg.click('#map-vp', position={'x': 400, 'y': 30}); await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200)
        back = bool([e for e in await board() if e['id'] == sid]); print('UNDO', back); assert back
        await pg.keyboard.press('Control+Shift+z'); await pg.wait_for_timeout(200)
        assert not [e for e in await board() if e['id'] == sid]

        # delete selected sticky with the keyboard: its connector goes too
        sb = await box(f'[data-el="{sticky}"]'); await pg.mouse.click(sb['x'] + 20, sb['y'] + 20); await pg.wait_for_timeout(150)
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(200)
        bd = await board(); print('AFTER DELETE', [e['type'] for e in bd]); assert not [e for e in bd if e['id'] == sticky or e['type'] == 'connector']
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(200)
        assert [e for e in await board() if e['id'] == sticky]

        # sticky -> task
        sb = await box(f'[data-el="{sticky}"]'); await pg.mouse.click(sb['x'] + 20, sb['y'] + 20); await pg.wait_for_timeout(150)
        n0 = await ev("window.__AR.St.tasks.size"); await pg.click('[data-act="cv-to-task"]'); await pg.wait_for_timeout(500)
        nt = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.title==='Ask vendor for').map(t=>({title:t.title,action:t.action,project:t.project}))")
        print('NOTE->TASK', nt); assert await ev("window.__AR.St.tasks.size") == n0 + 1 and nt and nt[0]['action'] == 'NPSHr curve'
        await idle(pg)

        # task tool on empty canvas: new task where you clicked
        cx, cy = vp['x'] + vp['width'] - 140, vp['y'] + vp['height'] - 240
        await tool('task'); await pg.mouse.click(cx, cy); await pg.wait_for_selector('#drawer:not([hidden])')
        await pg.fill('#d-title', 'Prepare blower building load list'); await pg.dispatch_event('#d-title', 'change'); await pg.wait_for_timeout(500)
        await pg.click('[data-act="close-drawer"]'); await pg.wait_for_timeout(500)
        tn = await box('.mnode.task:has-text("blower building load list")'); print('TASK AT', round(tn['x'] - cx), round(tn['y'] - cy))
        assert abs(tn['x'] - cx) < 30 and abs(tn['y'] - cy) < 30

        # rename a project inline
        await pg.click('details[data-menu="options"] > summary'); await pg.click('[data-act="map-reset-layout"]'); await pg.wait_for_timeout(300)
        assert not await ev("Object.keys(window.__AR.St.layout.off).length"), 'tidy layout clears manual positions'
        await pg.click('[data-act="map-fit"]'); await pg.wait_for_timeout(500)
        await pg.hover('.mnode.project >> nth=0'); await pg.click('.mnode.project >> nth=0 >> [data-map="rename"]'); await pg.wait_for_timeout(150)
        old = await ev("document.querySelector('.mnode.project [data-edit]').textContent")
        await pg.keyboard.press('Control+a'); await pg.keyboard.type('ELM Expansion'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        projs = await ev("[...new Set([...window.__AR.St.tasks.values()].map(t=>t.project))]")
        print('RENAME', old, '->', projs); assert 'ELM Expansion' in projs and old not in projs
        await pg.click('[data-act="map-fit"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOTS + '/81-canvas-edited.png')

        # exit full screen
        await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        print('FULL after Esc', await ev("!!document.querySelector('.map-wrap.full')"))

        # ---- Daily tracker ----
        await pg.click('.rail [data-nav="daily"]'); await pg.wait_for_selector('#day-in')
        await pg.fill('#day-in', 'Check NPSH margin for ELM RAS pumps at low wet well level'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600); await idle(pg)
        d1 = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.source==='daily').map(t=>({ref:t.ref,title:t.title,days:t.days,project:t.project,topic:t.topic,rel:(t.relatedIds||[]).length}))")
        print('DAILY TASK', d1); assert d1 and d1[0]['days'] == [await ev("window.__AR.E.todayISO()")] and d1[0]['project']
        await pg.click('[data-act="day-kind"][data-kind="manager"]'); await pg.fill('#day-in', 'Send updated valve schedule to the consultant'); await pg.fill('#day-mgr', 'Khaled Mansour'); await pg.click('[data-act="day-add"]'); await pg.wait_for_timeout(500)
        mg = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.fromManager).map(t=>[t.title,t.requestedBy])"); print('MANAGER', mg); assert mg and mg[0][1] == 'Khaled Mansour'
        assert await ev("window.__AR.St.settings.me.manager") == 'Khaled Mansour'
        await pg.click('[data-act="day-kind"][data-kind="achievement"]'); await pg.fill('#day-in', 'Closed 4 CRS comments on fine screens datasheet'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.daily.values()].filter(a=>a.kind==='achievement').length") == 1
        # start one, finish another
        await pg.click('.dlane.todo .dcard >> nth=0 >> [data-status="in_progress"]'); await pg.wait_for_timeout(300)
        await pg.click('.dlane.todo .dcard >> nth=0 >> .dtick'); await pg.wait_for_timeout(400)
        lanes = await ev("Object.fromEntries([...document.querySelectorAll('.dlane')].map(l=>[l.dataset.lane,l.querySelectorAll('.dcard').length]))")
        print('LANES', lanes); assert lanes['wip'] >= 1 and lanes['done'] >= 1
        await pg.click('[data-act="day-suggest"]'); await pg.wait_for_timeout(800)
        sug = await ev("window.__AR.UI.daySuggest"); print('SUGGEST', sug); assert sug
        await pg.click('[data-act="day-sug-add"] >> nth=0'); await pg.wait_for_timeout(200)
        assert await ev("[...window.__AR.St.daily.values()].filter(a=>a.kind==='achievement').length") == 2
        # plan an existing task from suggestions or the manager list, if offered
        plan = await pg.query_selector('[data-act="day-plan"]')
        if plan: await plan.click(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=SHOTS + '/82-daily.png', full_page=True)
        hist = await ev("document.querySelectorAll('.dhist button').length"); print('HISTORY days', hist); assert hist >= 1
        # yesterday is empty, today again
        await pg.click('[data-act="day-shift"][data-d="-1"]'); await pg.wait_for_timeout(200)
        print('YESTERDAY cards', await ev("document.querySelectorAll('.dcard').length"))
        await pg.click('[data-act="day-today"]'); await pg.wait_for_timeout(200)

        # the canvas shows the day's work
        await pg.click('[data-act="day-map"]'); await pg.wait_for_timeout(1200)
        day = await ev("document.querySelectorAll('.mnode.task.dayhit').length"); print('DAY on canvas', day); assert day >= 3
        dn = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.source==='daily').map(t=>!!document.querySelector('.mnode.task[data-tid=\"'+t.id+'\"]'))"); print('DAILY nodes on canvas', dn); assert all(dn)
        await pg.screenshot(path=SHOTS + '/83-canvas-day.png')
        # as of yesterday: today's tasks disappear
        y = await ev("window.__AR.E.addDays(window.__AR.E.todayISO(), -1)")
        await pg.click('details[data-menu="options"] > summary'); await pg.wait_for_timeout(100)
        await pg.fill('#map-asof', y); await pg.dispatch_event('#map-asof', 'change'); await pg.wait_for_timeout(600)
        print('AS OF yesterday task nodes', await ev("document.querySelectorAll('.mnode.task').length")); assert await ev("document.querySelectorAll('.mnode.task').length") == 0
        assert await ev("!!document.querySelector('details[data-menu=\"options\"][open]')"), 'History menu stays open after a change'
        await ev("document.querySelectorAll('details.menu[open]').forEach(d => { d.open = false; })"); await pg.wait_for_timeout(100)  # closing the menu shortens the page
        await pg.click('[data-act="map-now"]'); await pg.wait_for_timeout(400)
        assert await ev("document.querySelectorAll('.mnode.task').length") > 0

        # minimap, bands, semantic zoom
        assert await ev("!!document.querySelector('#minimap')") and await ev("document.querySelectorAll('.map-edges .band').length") >= 1
        await pg.click('[data-act="map-zoom"][data-z="-1"]'); await pg.click('[data-act="map-zoom"][data-z="-1"]'); await pg.click('[data-act="map-zoom"][data-z="-1"]'); await pg.wait_for_timeout(200)
        far = await ev("document.querySelector('#map-vp').classList.contains('z-far')"); print('Z-FAR', far, await ev("window.__AR.UI.map.k"))
        mm = await box('#minimap'); k0 = await ev("[window.__AR.UI.map.x, window.__AR.UI.map.y]")
        await pg.mouse.click(mm['x'] + 20, mm['y'] + 20); await pg.wait_for_timeout(150)
        k1 = await ev("[window.__AR.UI.map.x, window.__AR.UI.map.y]"); print('MINIMAP move', k0, k1); assert k0 != k1
        await pg.screenshot(path=SHOTS + '/86-canvas-far.png')
        await pg.click('[data-act="map-fit"]'); await pg.wait_for_timeout(300)
        # export PNG and PDF (web build: PNG saved, PDF opens print)
        await pg.click('details[data-menu="options"] > summary'); await pg.click('[data-act="map-export"][data-f="png"]')
        await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.endsWith('.png'))", timeout=10000)
        sv = await ev("(window.__saves||[]).map(s=>s.filename)"); print('EXPORT saves', sv); assert any(n.endswith('.png') for n in sv)
        svgok = await ev("(()=>{const x=window.__AR.mapSVG(); return x.svg.startsWith('<svg') && x.svg.includes('My work') && x.w>300})()"); assert svgok
        assert not await ev("!!document.querySelector('[data-act=\"map-present\"]')"), 'presenting was removed'

        # backup carries canvas and daily data
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="export-json"]'); await pg.wait_for_timeout(300)
        print('SAVES', await ev("window.__saves"))

        # delete any box, undo, refresh
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(800)
        if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]') && document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
            await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(600)
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(700)
        ntasks = lambda: ev("window.__AR.St.tasks.size")
        n0 = await ntasks()
        tid = await ev("document.querySelector('.mnode.task').dataset.tid")
        await pg.hover(f'.mnode.task[data-tid="{tid}"]'); await pg.click(f'.mnode.task[data-tid="{tid}"] [data-map="del"]'); await pg.wait_for_timeout(300)
        assert await ntasks() == n0 - 1 and not await ev(f"window.__AR.St.tasks.has({tid!r})"), 'task deleted from the canvas'
        await pg.click('.cv-sub [data-act="cv-undo"]'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.has({tid!r})") and await ntasks() == n0, 'undo brings it back'
        # a whole project box
        pk = await ev("document.querySelector('.mnode.project:not([data-pk=\"p:~\"])').dataset.pk")
        inproj = await ev(f"[...window.__AR.St.tasks.values()].filter(t => 'p:' + window.__AR.E.normMatch((t.project||'').trim()) === {pk!r}).length")
        await pg.hover(f'.mnode.project[data-pk="{pk}"]'); await pg.click(f'.mnode.project[data-pk="{pk}"] [data-map="del"]'); await pg.wait_for_timeout(300)
        assert await ntasks() == n0 - inproj and inproj >= 1, ('project deleted with its tasks', inproj)
        await pg.click('.cv-sub [data-act="cv-undo"]'); await pg.wait_for_timeout(300); assert await ntasks() == n0
        # tick done is undoable
        st0 = await ev(f"window.__AR.St.tasks.get({tid!r}).status")
        await pg.click(f'.mnode.task[data-tid="{tid}"] [data-map="tick"]'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get({tid!r}).status") != st0
        await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get({tid!r}).status") == st0, 'undo un-ticks'
        # delete a task from an email, then Refresh offers to put it back
        etid = await ev("[...window.__AR.St.tasks.values()].find(t => (t.emailIds||[]).length && t.status !== 'done').id")
        await pg.hover(f'.mnode.task[data-tid="{etid}"]'); await pg.click(f'.mnode.task[data-tid="{etid}"] [data-map="del"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_selector('[data-act="map-restore-binned"]')
        await pg.screenshot(path=SHOTS + '/88-canvas-refresh.png')
        await pg.click('[data-act="map-restore-binned"]'); await pg.wait_for_timeout(400)
        assert await ev(f"window.__AR.St.tasks.has({etid!r})") and await ntasks() == n0, 'refresh put the email task back'
        assert await ev(f"!!document.querySelector('.mnode.task[data-tid=\"{etid}\"]')")

        # phone width and dark mode
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='dark'); mp = await m.new_page(); await mp.route('**/*', route)
        mp.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await mp.goto('https://app.test/#daily'); await mp.wait_for_selector('#day-in'); await mp.wait_for_timeout(800)
        await mp.fill('#day-in', 'Review pump datasheet'); await mp.keyboard.press('Enter'); await mp.wait_for_timeout(400)
        await mp.screenshot(path=SHOTS + '/84-daily-mobile.png', full_page=True)
        print('MOBILE daily overflow', await mp.evaluate("document.documentElement.scrollWidth>innerWidth"))
        await mp.click('.tabbar [data-nav="todo"]'); await mp.wait_for_timeout(1200)
        await mp.screenshot(path=SHOTS + '/85-canvas-mobile.png', full_page=True)
        print('MOBILE map overflow', await mp.evaluate("document.documentElement.scrollWidth>innerWidth"))
        print('ERRORS', errors); assert not errors
        print('CANVAS E2E PASSED')
        await b.close()
asyncio.run(main())
