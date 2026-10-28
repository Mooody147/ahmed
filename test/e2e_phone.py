"""Phone mode on the lite artifact: on a phone-size screen the app opens on Today (big task cards with the latest
thread message), a tick or a swipe right finishes a task, a swipe left moves it to tomorrow, ＋ adds a task in two
taps, Threads lists conversations and opens one with its tasks, Canvas opens the map, and More switches the mode."""
import asyncio, os, sys, datetime
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
from e2e_canvas_tools import setup

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b); ev = pg.evaluate
        cdp = await pg.context.new_cdp_session(pg)
        assert not await ev("document.documentElement.classList.contains('phone-mode')"), 'off on a wide screen (auto)'
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(600)
        assert await ev("document.documentElement.classList.contains('phone-mode')") and await ev("window.__AR.UI.view") == 'phone', 'phone mode on a phone screen'
        assert await ev("!!document.querySelector('#ph-nav .ph-add')")
        cards = await ev("[...document.querySelectorAll('.ph-card')].map(c => c.dataset.tid)"); print('CARDS', len(cards)); assert len(cards) >= 2
        assert await ev("!!document.querySelector('.ph-card .ph-n')"), 'cards show their email thread'
        assert await ev("document.querySelectorAll('.ph-card .ph-meta').length") == len(cards), 'one meta line per card'
        assert await ev("!document.querySelector('#ph-q')"), 'search waits behind its button'
        await pg.click('[data-act="ph-search"]'); await pg.wait_for_selector('#ph-q'); await pg.click('[data-act="ph-search"]'); await pg.wait_for_timeout(200)
        async def swipe(tid, dx):
            r = await (await pg.query_selector(f'.ph-card[data-tid="{tid}"] .ph-body')).bounding_box(); x, y = r['x'] + r['width'] / 2, r['y'] + 20
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y, 'id': 1}]})
            for i in range(1, 11): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + dx * i / 10, 'y': y, 'id': 1}]}); await pg.wait_for_timeout(16)
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(500)
        # swipe right finishes, swipe left moves to tomorrow
        a, z = cards[0], cards[1]
        await swipe(a, 160)
        assert await ev(f"window.__AR.St.tasks.get('{a}').status") == 'done', 'swipe right = done'
        assert not await ev("!!window.__AR.UI.drawer"), 'a swipe does not open the task'
        tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
        await swipe(z, -160)
        print('TOMORROW', await ev(f"window.__AR.St.tasks.get('{z}').deadline"), tomorrow); assert await ev(f"window.__AR.St.tasks.get('{z}').deadline") == tomorrow
        # the tick reopens a done task (from Done today)
        await pg.click('.ph-done > summary'); await pg.click(f'.ph-card[data-tid="{a}"] .ph-tick'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{a}').status") != 'done'
        # a tap opens the task full width
        await pg.click(f'.ph-card[data-tid="{a}"] .ph-body'); await pg.wait_for_selector('#drawer:not([hidden])')
        w = await ev("document.getElementById('drawer').getBoundingClientRect().width"); assert w >= 389, w
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)
        # quick add
        n0 = await ev("window.__AR.St.tasks.size")
        await pg.click('.ph-add'); await pg.wait_for_selector('#ph-new')
        await pg.fill('#ph-new', 'Call Omar about channel width'); await pg.click('.ph-pill[data-d="tomorrow"]'); await pg.click('[data-act="ph-create"]'); await pg.wait_for_timeout(400)
        t = await ev("[...window.__AR.St.tasks.values()].find(t => t.title === 'Call Omar about channel width')")
        assert t and t['deadline'] == tomorrow and await ev("window.__AR.St.tasks.size") == n0 + 1, t
        assert await ev("document.getElementById('ph-sheet').hidden")
        # filters
        await pg.click('.ph-seg2 [data-f="wait"]'); await pg.wait_for_timeout(200)
        heads = await ev("[...document.querySelectorAll('.ph-group > h2')].map(h => h.textContent)"); assert heads == ['Waiting on others'], heads
        await pg.click('.ph-seg2 [data-f="mine"]'); await pg.wait_for_timeout(200)
        # one message at a time
        assert await ev("[...document.querySelectorAll('.toasts > *')].filter(t => getComputedStyle(t).display !== 'none').length") <= 1
        # threads
        await pg.click('.ph-tab[data-k="threads"]'); await pg.wait_for_timeout(300)
        n = await ev("document.querySelectorAll('.ph-th').length"); print('THREADS', n); assert n >= 1
        await pg.click('.ph-th >> nth=0'); await pg.wait_for_selector('#drawer .ph-drawer')
        assert await ev("document.querySelectorAll('#drawer .ph-card').length") >= 1, 'the thread shows its tasks'
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)
        # canvas
        await pg.click('.ph-tab[data-k="canvas"]'); await pg.wait_for_selector('#map-vp')
        assert await ev("document.documentElement.classList.contains('ph-canvas')") and await ev("!document.querySelector('#main .today-strip') || getComputedStyle(document.querySelector('#main .today-strip')).display === 'none'")
        # More › Phone mode Off, then Auto again
        await pg.click('.ph-tab[data-k="more"]'); await pg.wait_for_selector('#ph-sheet:not([hidden])')
        await pg.click('[data-act="ph-mode"][data-v="off"]'); await pg.wait_for_timeout(300)
        assert not await ev("document.documentElement.classList.contains('phone-mode')") and await ev("document.getElementById('ph-nav').hidden")
        await pg.click('#phone-btn'); await pg.wait_for_timeout(300)
        assert await ev("document.documentElement.classList.contains('phone-mode')"), '📱 turns it on'
        await pg.click('.ph-tab[data-k="today"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'phone.png'))
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('PHONE E2E PASSED'); await b.close()

asyncio.run(main())
