"""Menus stay on the screen: the page shown inside a frame taller than the screen (as a host app can do) still
opens its canvas menus within the part the person can see, and the canvas fits that part, not the whole frame."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
import harness
from harness import *

async def route2(r):
    if r.request.url.startswith('https://parent.test/'):
        return await r.fulfill(status=200, content_type='text/html', body='<!doctype html><body style="margin:0"><div style="height:60px;background:#333"></div><iframe src="https://app.test/" style="width:100%;height:1600px;border:0"></iframe></body>')
    return await harness.route(r)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1300, 'height': 760}); pg = await cx.new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route2); await pg.goto('https://parent.test/'); await pg.wait_for_timeout(2500)
        f = pg.frames[1]
        if await f.evaluate("!!document.querySelector('#su-emails')"):
            await f.fill('#su-emails', 'm.sobeah@contractor.example'); await f.click('[data-act="save-quick-setup"]')
        await f.evaluate('''async () => { const db = await claude.use('db'); const St = window.__AR.St; for (let i = 1; i <= 6; i++) await db.doc('data/users/' + St.uid + '/register/tasks/t' + i).set({ id: 't' + i, ref: 'T-000' + i, title: 'Check pump item ' + i, status: 'open', owner: 'me', ownership: 'mine', project: 'ELM', topic: 'Pumps', priority: 'medium', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), emailIds: [], subtasks: [], history: [] }); }''')
        await pg.wait_for_timeout(600)
        await f.click('[data-nav="todo"]'); await pg.wait_for_timeout(800)
        if await f.evaluate("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"): await f.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(900)
        h = await f.evaluate("document.getElementById('map-vp').clientHeight"); print('CANVAS HEIGHT', h)
        assert h <= 700, 'the canvas is sized to the visible part (760 px screen), not to the 1600 px frame'
        await f.click('.mt-more > summary'); await pg.wait_for_timeout(400)
        r = await f.evaluate("(() => { const r = document.querySelector('.mt-more .menu-pop').getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom, document.documentElement.clientWidth]; })()")
        print('MENU', r); assert r[3] + 60 <= 760 and r[0] >= 0 and r[1] <= r[4], 'the menu is on the screen'
        assert await f.evaluate("getComputedStyle(document.querySelector('.toasts')).left") == '18px', 'messages move away from an open menu'
        # a narrow screen: More wraps to the left of its row and its menu (aligned to its right edge) must not run off the left
        await f.click('.mt-more > summary'); await pg.set_viewport_size({'width': 752, 'height': 1288}); await pg.wait_for_timeout(900)
        print('AFTER RESIZE', await f.evaluate("[innerWidth, document.documentElement.className, !!document.querySelector('.mt-more'), window.__AR.UI.view]"))
        await f.click('.mt-more > summary'); await pg.wait_for_timeout(400)
        r = await f.evaluate("(() => { const m = document.querySelector('.mt-more .menu-pop'), r = m.getBoundingClientRect(); return [r.left, r.right, m.scrollWidth - m.clientWidth, document.documentElement.clientWidth]; })()")
        print('NARROW MENU', r); assert r[0] >= 0 and r[1] <= r[3] and r[2] <= 1, 'inside the left and right edges, no sideways scrolling'
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('MENUS E2E PASSED'); await b.close()

asyncio.run(main())
