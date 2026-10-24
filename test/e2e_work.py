"""Time tracking, Daily drag and drop, Insights (charts, waiting on, time, reports) and chasers."""
import asyncio, os, sys
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
        await pg.evaluate("window.print = () => { window.__printed = (window.__printed||0) + 1 }; 0")
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(300)
        ev = pg.evaluate
        times = lambda: ev("[...window.__AR.St.cols.time.values()].map(e=>({task:e.taskId,end:!!e.end,src:e.source}))")

        # Daily: plan a task, start it (timer starts), drag it to Completed (timer stops)
        await pg.click('.rail [data-nav="daily"]'); await pg.wait_for_selector('#day-in')
        await pg.fill('#day-in', 'Prepare blower building load list'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(600); await idle(pg)
        await pg.click('.dlane.todo .dcard >> nth=0 >> [data-status="in_progress"]'); await pg.wait_for_timeout(300)
        t1 = await times(); print('TIMER after start', t1); assert len(t1) == 1 and not t1[0]['end']
        assert await ev("!!document.querySelector('.dlane.wip [data-timer]')")
        # backdate the running entry so it counts
        await ev("(()=>{const e=[...window.__AR.St.cols.time.values()][0]; e.start=new Date(Date.now()-50*60000).toISOString();})()")
        await pg.drag_and_drop('.dlane.wip .dcard >> nth=0', '.dlane.done'); await pg.wait_for_timeout(500)
        lanes = await ev("Object.fromEntries([...document.querySelectorAll('.dlane')].map(l=>[l.dataset.lane,l.querySelectorAll('.dcard').length]))"); print('LANES after drag', lanes)
        assert lanes['done'] >= 1
        t2 = await times(); print('TIMER after done', t2); assert t2 and all(x['end'] for x in t2)
        assert await ev("!!document.querySelector('.day-ring')")
        await pg.screenshot(path=SHOTS + '/90-daily-ring.png')

        # task panel: manual time and timer button
        tid = await ev("[...window.__AR.St.tasks.values()].find(t=>/valves spec/i.test(t.title)).id")
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(600)
        await ev(f"window.__AR.UI && document.querySelector('[data-act=\"open-task\"]') ? 0 : 0")
        await pg.evaluate(f"(()=>{{const b=document.createElement('button');b.dataset.act='open-task';b.dataset.id='{tid}';b.id='tmp-open';document.body.appendChild(b);}})()"); await pg.click('#tmp-open'); await pg.wait_for_selector('#drawer:not([hidden])')
        await pg.fill('#tm-add', '90'); await pg.click('[data-act="timer-add"]'); await pg.wait_for_timeout(300)
        assert '1h 30m' in await ev("document.querySelector('#drawer').textContent")
        await pg.click('[data-act="close-drawer"]'); await pg.wait_for_timeout(300)

        # Insights overview
        await pg.click('.rail [data-nav="insights"]'); await pg.wait_for_selector('.insights')
        bars = await ev("document.querySelectorAll('.viz .bar').length"); print('BARS', bars); assert bars >= 2
        await pg.hover('.viz .mark >> nth=11'); await pg.wait_for_timeout(150)
        tip = await ev("document.querySelector('#viz-tip') && !document.querySelector('#viz-tip').hidden && document.querySelector('#viz-tip').textContent"); print('TIP', tip); assert tip
        await pg.screenshot(path=SHOTS + '/91-insights.png', full_page=True)

        # waiting on others + chaser
        await pg.click('[data-act="ins-tab"][data-tab="waiting"]'); await pg.wait_for_timeout(200)
        print('WAITING cards', await ev("[...document.querySelectorAll('.wait-card h2')].map(h=>h.textContent)"))
        await pg.click('.wait-card [data-act="draft-mail"] >> nth=0'); await pg.wait_for_selector('#ml-body')
        await pg.wait_for_function("!document.querySelector('.mail-draft').textContent.includes('improving')", timeout=8000)
        body = await ev("document.querySelector('#ml-body').value"); print('CHASER', body[:140].replace('\n', ' | ')); assert 'Follow' in await ev("document.querySelector('#ml-sub').value") or body
        await pg.screenshot(path=SHOTS + '/92-chaser.png')
        await pg.click('[data-act="mail-copy"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="close-modal"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="ins-tab"][data-tab="waiting"]'); await pg.wait_for_timeout(200)
        assert 'chased' in await ev("document.querySelector('.wait-grid').textContent")

        # time
        await pg.click('[data-act="ins-tab"][data-tab="time"]'); await pg.wait_for_timeout(200)
        hrs = await ev("document.querySelector('.tile-n').textContent"); print('HOURS', hrs); assert float(hrs) >= 2
        await pg.click('[data-act="time-csv"]'); await pg.wait_for_timeout(300)

        # reports
        await pg.click('[data-act="ins-tab"][data-tab="reports"]'); await pg.wait_for_timeout(300)
        prev = await ev("document.querySelector('#report-preview').textContent"); print('REPORT', ' '.join(prev.split())[:200]); assert 'Completed' in prev
        await pg.screenshot(path=SHOTS + '/93-report.png', full_page=True)
        await pg.click('[data-act="rep-out"][data-f="docx"]'); await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.endsWith('.docx'))", timeout=15000)
        await pg.click('[data-act="rep-out"][data-f="pdf"]'); await pg.wait_for_timeout(300)
        pr = await ev("window.__printed"); print("PRINTED", pr, await ev("document.body.className")); assert pr == 1
        await pg.click('[data-act="rep-kind"][data-k="handover"]'); await pg.wait_for_timeout(200)
        ho = await ev("document.querySelector('#report-preview').textContent"); assert 'Hand-over' in ho and 'Key contacts' in ho
        await pg.select_option('#rep-proj', 'ELM'); await pg.wait_for_timeout(200)
        assert 'ELM' in await ev("document.querySelector('#report-preview h1').textContent")
        print('SAVES', await ev("window.__saves.map(s=>s.filename+':'+s.len)"))
        assert any(s.endswith('.csv') or '.csv:' in s for s in await ev("window.__saves.map(s=>s.filename)"))

        # phone width
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); mp = await m.new_page(); await mp.route('**/*', route)
        await mp.goto('https://app.test/#insights'); await mp.wait_for_selector('.insights'); await mp.wait_for_timeout(600)
        print('MOBILE overflow', await mp.evaluate("document.documentElement.scrollWidth>innerWidth")); assert not await mp.evaluate("document.documentElement.scrollWidth>innerWidth")
        await mp.screenshot(path=SHOTS + '/94-insights-mobile.png', full_page=True)
        print('ERRORS', errors); assert not errors
        print('WORK E2E PASSED')
        await b.close()
asyncio.run(main())
