"""Notebook: add files, passages with page/sheet, cited answers, passage panel, search-only mode, notes, task, follow-ups, overview."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
FX = os.path.join(HERE, 'fixtures')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200); await idle(pg)
        ev = pg.evaluate
        await pg.click('.rail [data-nav="notebook"]'); await pg.wait_for_selector('.notebook')
        await pg.fill('#nb-new-name', 'ELM documents'); await pg.click('[data-act="nb-create"]'); await pg.wait_for_selector('.nb-page')
        await pg.set_input_files('#nb-file', [os.path.join(FX, f) for f in ['CRS_valves.xlsx', 'MOM-17.docx', 'transmittal.pdf', 'drawing_A3.pdf', 'fwd_attachment.eml']])
        try: await pg.wait_for_function("(()=>{const n=[...window.__AR.St.cols.notebooks.values()][0]; return n && n.counts && n.counts.files===5})()", timeout=60000)
        except Exception:
            print('STUCK', await ev("JSON.stringify({nb: [...window.__AR.St.cols.notebooks.values()][0], busy: window.__AR.UI.nb.busy})")); raise
        nb = await ev("[...window.__AR.St.cols.notebooks.values()][0]"); print('COUNTS', nb['counts']); assert nb['counts']['passages'] >= 5
        side = await pg.text_content('.nb-side'); assert '5 files' in side

        # a cited answer
        await pg.click('[data-act="nb-overview"]'); await pg.wait_for_function("document.querySelectorAll('.nb-turn').length >= 1 && !window.__AR.UI.nb.asking", timeout=20000)
        await pg.fill('#nb-q', 'What IP rating do the valve actuators need?'); await pg.keyboard.press('Enter')
        await pg.wait_for_function("document.querySelectorAll('.nb-turn').length >= 2 && !window.__AR.UI.nb.asking", timeout=20000)
        pr = await ev("window.__prompts.filter(p=>/^You are a research assistant for the user/.test(p.prompt)).pop().prompt")
        assert 'CRS_valves.xlsx (sheet ' in pr, 'the passage carries its sheet'
        ans = await pg.text_content('.nb-turn:last-child .nb-ans'); print('ANSWER', ans); assert 'IP68' in ans
        await pg.click('.nb-turn:last-child .nb-cite'); await pg.wait_for_selector('.nb-cite-panel')
        panel = await pg.text_content('.nb-cite-panel'); assert 'CRS_valves.xlsx' in panel and 'IP68' in panel
        assert await ev("document.querySelectorAll('.nb-cite-panel mark').length") >= 1, 'question words are highlighted'
        await pg.screenshot(path=SHOTS + '/n1-answer.png')
        # follow-up button, notes and a task
        assert await ev("!!document.querySelector('.nb-turn:last-child [data-act=\"nb-follow\"]')")
        await pg.click('.nb-turn:last-child [data-act="nb-note"]'); await pg.wait_for_timeout(200)
        assert 'Sources:' in (await ev("[...window.__AR.St.cols.notebooks.values()][0].notes[0].text"))
        n0 = await ev("window.__AR.St.tasks.size"); await pg.click('.nb-turn:last-child [data-act="nb-task"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.St.tasks.size") == n0 + 1
        await pg.click('[data-act="close-drawer"]')
        # passages only (no AI call)
        k = await ev("window.__prompts.length")
        await pg.click('[data-act="nb-mode"][data-m="search"]'); await pg.fill('#nb-q', 'transmittal'); await pg.click('[data-act="nb-send"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__prompts.length") == k
        assert await ev("document.querySelectorAll('.nb-turn:last-child .nb-passage').length") >= 1
        assert 'transmittal.pdf' in await pg.text_content('.nb-turn:last-child')
        # Arabic: hamza forms and the article are matched loosely
        assert await ev("window.__AR_NB.tokens('الإجراءات أحمد').join(' ')") == await ev("window.__AR_NB.tokens('اجراءات احمد').join(' ')")
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        ov = await ev("document.documentElement.scrollWidth > innerWidth + 1"); print('MOBILE overflow', ov); await pg.screenshot(path=SHOTS + '/n2-mobile.png', full_page=True)
        assert not ov
        print('ERRORS', errors); assert not errors
        print('NOTEBOOK E2E PASSED')
        await b.close()

asyncio.run(main())
