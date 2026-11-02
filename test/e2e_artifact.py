"""Artifact upgrades (lite build): each analysed email keeps its original and attachments in the artifact's storage
(open / save from any device); sharing the canvas writes a read-only copy that anyone else who opens the link sees."""
import asyncio, json, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        ev = pg.evaluate
        if await ev("!!document.querySelector('#su-emails')"):
            await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_selector('[data-act="gmail-check"]')
        for i in range(80):
            st = await ev("window.__AR.UI.staging.map(b=>b.state)")
            if len(st) >= 5 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        await idle(pg); await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(1500)
        # email files kept in the artifact's storage
        files = await ev("[...window.__AR.St.emails.values()].map(e=>({s:e.subject,f:(e.files||[]).map(f=>[f.name,f.role,f.wrapped])}))")
        for x in files: print('FILES', x)
        crs = next(x for x in files if 'Valves spec' in x['s'])
        names = [f[0] for f in crs['f']]
        assert any(f[1] == 'original' for f in crs['f']), 'original email kept'
        assert any(n.endswith('.pdf') and not w for n, r, w in crs['f']), 'PDF kept as it is'
        assert any(n.endswith('.xlsx') and w for n, r, w in crs['f']), 'Excel kept in a wrapper'
        eid = await ev("[...window.__AR.St.emails.values()].find(e=>/Valves spec/.test(e.subject)).id")
        await ev(f"window.__AR.UI.view='emails'; 0"); await pg.click('.rail [data-nav="emails"]'); await pg.wait_for_timeout(300)
        await ev(f"document.querySelector('[data-act=\"open-email\"][data-id=\"{eid}\"]') ? document.querySelector('[data-act=\"open-email\"][data-id=\"{eid}\"]').click() : null")
        await pg.wait_for_selector('text=Files (on every device)')
        xl = next(i for i, f in enumerate(crs['f']) if f[0].endswith('.xlsx'))
        await pg.click(f'[data-act="af-save"][data-i="{xl}"]'); await pg.wait_for_timeout(800)
        saves = await ev("window.__saves.map(s=>[s.filename,s.len])"); print('SAVES', saves)
        assert any(n.endswith('.xlsx') and l > 1000 for n, l in saves), 'the Excel file comes back as the original file'
        okx = await ev("(async()=>{ const d = window.__saveData[Object.keys(window.__saveData).find(k=>k.endsWith('.xlsx'))]; const u = new Uint8Array(await d.arrayBuffer()); return u[0]===0x50 && u[1]===0x4b; })()")
        assert okx, 'saved bytes are a real .xlsx (zip) file'
        await pg.screenshot(path=SHOTS + '/art-1-files.png')
        await pg.keyboard.press('Escape')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        n_tasks = await ev("window.__AR.St.tasks.size")
        # share the canvas
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_selector('#sh-on')
        await pg.check('#sh-on'); await pg.wait_for_function("window.__store.has('shared/canvas')", timeout=10000)
        meta = await ev("window.__store.get('shared/canvas')"); print('SHARED', meta)
        assert meta['tasks'] == n_tasks and meta['parts'] >= 1
        body = await ev("Array.from({length: window.__store.get('shared/canvas').parts}, (_, i) => window.__store.get('shared/canvas/parts/p' + i).s).join('')")
        assert 'evidence' not in body and 'quote' not in body and 'Dear' not in body, 'no email content in the shared copy'
        await pg.screenshot(path=SHOTS + '/art-2-share.png', full_page=False)
        seed = await ev("Object.fromEntries([...window.__store.entries()].filter(([k])=>k.startsWith('shared/')))")
        # a change on the canvas reaches the shared copy
        tid = await ev("[...window.__AR.St.tasks.values()][0].id")
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(800)
        if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
            await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(800)
        await pg.click(f'.mnode.task[data-tid="{tid}"] [data-map="tick"]'); await pg.wait_for_timeout(5500)
        st_shared = await ev(f"JSON.parse(Array.from({{length: window.__store.get('shared/canvas').parts}}, (_, i) => window.__store.get('shared/canvas/parts/p' + i).s).join('')).tasks.find(t=>t.id==={tid!r}).status")
        print('SHARED status after change', st_shared); assert st_shared == 'done', 'the shared copy follows your changes'
        # someone else opens the link: read-only canvas
        vc = await b.new_context(viewport={'width': 1280, 'height': 860})
        await vc.add_init_script('window.__viewer = true; window.__seed = ' + json.dumps(seed) + ';')
        vp = await vc.new_page(); vp.on('pageerror', lambda e: errors.append('PAGEERROR viewer ' + str(e)))
        await vp.route('**/*', route); await vp.goto('https://app.test/'); await vp.wait_for_selector('.mnode.task', timeout=15000); await vp.wait_for_timeout(800)
        bar = await vp.text_content('#viewer-bar'); print('VIEWER BAR', bar)
        assert 'read-only' in bar and 'Mahmoud' in bar
        nodes = await vp.evaluate("document.querySelectorAll('.mnode.task').length"); print('VIEWER nodes', nodes)
        assert nodes >= 1
        vis = await vp.evaluate("[...document.querySelectorAll('.rail [data-nav]')].filter(b=>b.offsetParent).map(b=>b.dataset.nav)"); print('VIEWER nav', vis)
        assert vis == ['todo']
        assert not await vp.evaluate("!!(document.querySelector('.cv-tools') && document.querySelector('.cv-tools').offsetParent)"), 'no editing tools'
        await vp.click('.mnode.task .mtxt'); await vp.wait_for_timeout(400)
        assert not await vp.evaluate("!!window.__AR.UI.drawer"), 'no task panel for viewers'
        assert not await vp.evaluate("[...window.__store.keys()].some(k=>k.startsWith('data/users/u999'))"), 'the viewer writes nothing'
        await vp.screenshot(path=SHOTS + '/art-3-viewer.png')
        # turning sharing off removes the copy
        await pg.click('.rail [data-nav="setup"]'); await pg.uncheck('#sh-on'); await pg.wait_for_timeout(800)
        assert not await ev("window.__store.has('shared/canvas')")
        print('ERRORS', errors); assert not errors
        print('ARTIFACT E2E PASSED')
        await b.close()

asyncio.run(main())
