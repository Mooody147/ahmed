"""Lite artifact build: only To-do (canvas), Review, Add emails (Gmail), Emails and Setup; emails read and analysed, tasks on the canvas, delete/undo, data kept in the artifact database; phone width; Arabic."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        ev = pg.evaluate
        navs = await ev("[...document.querySelectorAll('.rail [data-nav]')].map(b => b.dataset.nav)"); print('NAV', navs)
        assert navs == ['todo', 'review', 'import', 'emails', 'setup'], navs
        if await ev("!!document.querySelector('#su-emails')"):
            await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        # Gmail through the claude.ai connector: the forwarding inbox is checked and analysed by Claude
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_selector('[data-act="gmail-check"]')
        for i in range(60):
            st = await ev("window.__AR.UI.staging.map(b=>b.state)")
            if len(st) >= 3 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        bt = await pg.query_selector('[data-act="analyze"]')
        if bt: await bt.click()
        await idle(pg); await pg.wait_for_timeout(500)
        print('STATES', await ev("window.__AR.UI.staging.map(b=>[b.state,b.doneText||b.error])"))
        assert await ev("window.__AR.St.emails.size") >= 2, 'emails analysed'
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        n0 = await ev("window.__AR.St.tasks.size"); assert n0 >= 3, n0
        assert any(k.startswith('data/users/u123/register/tasks/') for k in await ev("[...window.__store.keys()]")), 'tasks saved in the artifact database'
        # canvas: delete and undo
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(1200)
        if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
            await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(800)
        tid = await ev("document.querySelector('.mnode.task').dataset.tid")
        await pg.hover(f'.mnode.task[data-tid="{tid}"]'); await pg.click(f'.mnode.task[data-tid="{tid}"] [data-map="del"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.St.tasks.size") == n0 - 1
        await pg.click('.map-tools [data-act="cv-undo"]'); await pg.wait_for_timeout(300); assert await ev("window.__AR.St.tasks.size") == n0
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(500)
        # move a box by hand, then Rearrange puts it back (and Undo restores the move)
        nb = await (await pg.query_selector('.mnode.root')).bounding_box()
        await pg.mouse.move(nb['x'] + nb['width'] / 2, nb['y'] + nb['height'] / 2); await pg.mouse.down(); await pg.mouse.move(nb['x'] + nb['width'] / 2 - 60, nb['y'] + nb['height'] / 2 + 120, steps=10); await pg.mouse.up(); await pg.wait_for_timeout(400)
        moved = await ev("Object.keys(window.__AR.St.layout.off || {}).length"); print('MOVED boxes', moved); assert moved >= 1
        await pg.click('[data-act="map-rearrange"]'); await pg.wait_for_timeout(500)
        assert await ev("Object.keys(window.__AR.St.layout.off || {}).length") == 0, 'Rearrange puts every box back'
        await pg.click('.map-tools [data-act="cv-undo"]'); await pg.wait_for_timeout(300)
        assert await ev("Object.keys(window.__AR.St.layout.off || {}).length") == moved, 'Undo brings the move back'
        await pg.click('[data-act="map-rearrange"]'); await pg.wait_for_timeout(400)
        await pg.screenshot(path=SHOTS + '/lite-1-canvas.png')
        # a task and an email open in the side panel
        await pg.click(f'.mnode.task[data-tid="{tid}"] .mtxt'); await pg.wait_for_timeout(500)
        assert await ev("!!window.__AR.UI.drawer"), 'task panel'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('.rail [data-nav="emails"]'); await pg.wait_for_timeout(400)
        await pg.click('[data-act="open-email"]'); await pg.wait_for_timeout(500); assert await ev("!!window.__AR.UI.drawer"), 'email panel'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        # the other screens open without errors
        for v in ['emails', 'review', 'setup', 'import']:
            await pg.click(f'.rail [data-nav="{v}"]'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOTS + '/lite-2-setup.png', full_page=False)
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_timeout(400)
        secs = await ev("[...document.querySelectorAll('[data-sec]')].map(s => s.dataset.sec)"); print('SETUP', secs)
        # Ctrl+K only offers what exists here
        await pg.keyboard.press('Control+k'); await pg.wait_for_timeout(300)
        await pg.keyboard.type('money'); await pg.wait_for_timeout(300)
        pal = await ev("(document.querySelector('.palette, #palette, [data-palette]') || {}).textContent || ''"); print('PALETTE money:', ' '.join(pal.split())[:200])
        await pg.keyboard.press('Escape')
        # Arabic
        await ev("window.__AR.St.settings.ui = { ...(window.__AR.St.settings.ui || {}), lang: 'ar' }; 0")
        # phone
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='dark'); mp = await m.new_page(); await mp.route('**/*', route)
        mp.on('pageerror', lambda e: errors.append('PAGEERROR mobile ' + str(e)))
        await mp.goto('https://app.test/#todo'); await mp.wait_for_selector('h1'); await mp.wait_for_timeout(1200)
        tabs = await mp.evaluate("[...document.querySelectorAll('.rail [data-nav]')].filter(b => b.offsetParent && b.getBoundingClientRect().top < 80).map(b => b.dataset.nav)"); print('HEADER TABS on phone', tabs)
        assert tabs == ['todo', 'review', 'import', 'emails', 'setup'], tabs
        assert not await mp.evaluate("!!(document.querySelector('.tabbar') && document.querySelector('.tabbar').offsetParent)"), 'no bottom tab bar'
        await mp.screenshot(path=SHOTS + '/lite-3-phone.png')
        print('MOBILE overflow', await mp.evaluate("document.documentElement.scrollWidth>innerWidth"))
        print('ERRORS', errors); assert not errors
        print('LITE E2E PASSED')
        await b.close()

asyncio.run(main())
