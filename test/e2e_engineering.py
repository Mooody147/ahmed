"""Tools: new calculators and calc note, procurement tracker, equipment list, transmittal and RFI, drawing compare, conflict finder, search everything."""
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
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        saved = lambda rx: ev(f"Object.keys(window.__saveData||{{}}).filter(k=>{rx}.test(k)).length")
        tab = lambda t: pg.click(f'[data-act="tool-tab"][data-tab="{t}"]')
        await pg.click('.rail [data-nav="tools"]'); await tab('calc')
        await pg.click('[data-act="calc-pick"][data-k="size"]'); out = await pg.text_content('#calc-out'); print('SIZE', ' '.join(out.split())); assert '350' in out and '1.18' in out
        await pg.click('[data-act="calc-pick"][data-k="hammer"]'); out = await pg.text_content('#calc-out'); assert 'slow closure' in out and '146.8' in out
        await pg.click('[data-act="calc-pick"][data-k="aer"]'); out = await pg.text_content('#calc-out'); assert '8,262' in out
        await pg.click('[data-act="calc-note"]'); await pg.wait_for_timeout(1200); assert await saved('/^calc-note-aer-.*\\.docx$/') == 1
        # procurement: needed before it can arrive → flagged; chase task
        await tab('procure'); await pg.click('[data-act="pr-add"]'); await pg.wait_for_timeout(100)
        async def setf(k, v):
            sel = f'.reg-tbl [data-col="procure"][data-k="{k}"]'
            await pg.click('.tools-page h1'); await pg.wait_for_timeout(120)  # let the held render finish first
            if await ev(f"document.querySelector('{sel}').tagName") == 'SELECT': await pg.select_option(sel, v)
            else: await pg.fill(sel, v); await pg.dispatch_event(sel, 'change')
            await pg.wait_for_timeout(80)
        await setf('item', 'RAS pumps'); await setf('supplier', 'Grundfos'); await setf('status', 'po'); await setf('po', '2026-10-01'); await setf('lead', '16'); await setf('need', '2026-12-15'); await pg.click('.tools-page h1'); await pg.wait_for_timeout(150)
        txt = await pg.text_content('.reg-tbl'); print('PR', ' '.join(txt.split())[-160:]); assert 'after needed' in txt
        n0 = await ev("window.__AR.St.tasks.size"); await pg.click('[data-act="pr-chase"]'); await pg.wait_for_timeout(200); assert await ev("window.__AR.St.tasks.size") == n0 + 1
        assert await ev("[...window.__AR.St.tasks.values()].some(t=>/^Chase Grundfos/.test(t.title) && t.ownership==='waiting' && t.priority==='high')")
        await pg.click('[data-act="pr-export"]'); await pg.wait_for_timeout(800); assert await saved('/^procurement-.*\\.xlsx$/') == 1
        # equipment: tags found in emails/tasks, then into procurement
        await tab('equip'); found = await ev("!!document.querySelector('[data-act=\"eq-found\"]')"); print('TAGS FOUND', found)
        await pg.click('[data-act="eq-add"]'); await pg.wait_for_timeout(100)
        await pg.fill('.reg-tbl [data-col="equip"][data-k="tag"]', 'P-101A'); await pg.dispatch_event('.reg-tbl [data-col="equip"][data-k="tag"]', 'change')
        await pg.fill('.reg-tbl [data-col="equip"][data-k="kw"]', '22'); await pg.dispatch_event('.reg-tbl [data-col="equip"][data-k="kw"]', 'change'); await pg.click('.tools-page h1'); await pg.wait_for_timeout(150)
        assert await ev("[...window.__AR.St.cols.equip.values()].some(x=>x.tag==='P-101A' && x.kw===22)")
        await pg.click('[data-act="eq-to-pr"]'); await pg.wait_for_timeout(100); assert await ev("[...window.__AR.St.cols.procure.values()].some(x=>x.tag==='P-101A')")
        # transmittal from the document register, then an RFI that becomes a waiting task
        await tab('transmit'); docs = await ev("document.querySelectorAll('[data-chg=\"tr-pick\"]').length"); print('REGISTER DOCS', docs); assert docs >= 1
        await pg.fill('#tr-to', 'Hassan Allam Consultants'); await pg.check('[data-chg="tr-pick"]'); await pg.click('[data-act="tr-make"]'); await pg.wait_for_timeout(1200)
        tr = await ev("[...window.__AR.St.cols.eng.values()].find(x=>x.kind==='transmittal')"); print('TR', tr['no'], tr['docs']); assert tr['no'].endswith('-TR-001') and len(tr['docs']) == 1
        assert await saved('/-TR-001\\.docx$/') == 1
        await pg.click('[data-act="tr-kind"][data-k="rfi"]'); await pg.fill('#tr-subj', 'Wet well top of slab level'); await pg.fill('#tr-q', 'Drawing C-201 shows +12.40 but the P&ID shows +12.60. Which is correct?'); await pg.fill('#tr-impact', 'holds the pump base pour')
        await pg.click('[data-act="tr-make"]'); await pg.wait_for_timeout(1200)
        rfi = await ev("[...window.__AR.St.cols.eng.values()].find(x=>x.kind==='rfi')"); assert rfi['no'].endswith('-RFI-001')
        assert await ev(f"(t => t && t.ownership==='waiting' && t.priority==='high')(window.__AR.St.tasks.get({rfi['taskId']!r}))")
        await pg.click('[data-act="rfi-answered"]'); await pg.wait_for_timeout(150); assert await ev(f"window.__AR.St.tasks.get({rfi['taskId']!r}).status") == 'done'
        # drawing compare: same file → no change; different files → changed areas and text differences
        await tab('dwgcmp')
        await pg.set_input_files('[data-chg="dwg-file"][data-k="a"]', os.path.join(FX, 'drawing_A3.pdf')); await pg.set_input_files('[data-chg="dwg-file"][data-k="b"]', os.path.join(FX, 'drawing_A3.pdf')); await pg.wait_for_timeout(300)
        await pg.click('[data-act="dwg-run"]'); await pg.wait_for_selector('.dwg-view img', timeout=30000)
        assert 'No visible change' in await pg.text_content('.tools-page')
        await pg.set_input_files('[data-chg="dwg-file"][data-k="b"]', os.path.join(FX, 'transmittal.pdf')); await pg.wait_for_timeout(300)
        await pg.click('[data-act="dwg-run"]'); await pg.wait_for_selector('.dwg-view img', timeout=30000)
        t2 = await pg.text_content('.tools-page'); assert 'changed area' in t2 and 'Text added' in t2
        await pg.screenshot(path=SHOTS + '/g1-drawing-compare.png')
        # conflict finder: quotes are checked against the documents
        await tab('conflict'); await pg.set_input_files('#cf-files', [os.path.join(FX, 'CRS_valves.xlsx'), os.path.join(FX, 'MOM-17.docx')]); await pg.wait_for_timeout(800)
        await pg.click('[data-act="cf-run"]'); await pg.wait_for_selector('.tools-page table', timeout=20000)
        oks = await ev("[...document.querySelectorAll('.tools-page td .chip')].map(c=>c.className)"); print('QUOTE CHECKS', oks); assert 'ok' in oks[0] and 'warn' in oks[1]
        # search everything
        await tab('search'); await pg.fill('#sa-q', 'IP68 actuator'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.nb-passage', timeout=20000)
        res = await pg.text_content('.tools-page'); print('SEARCH', ' '.join(res.split())[:300]); assert 'IP68' in res
        await pg.set_viewport_size({'width': 390, 'height': 844}); await tab('procure'); await pg.wait_for_timeout(300)
        ov = await ev("document.documentElement.scrollWidth > innerWidth + 1"); print('MOBILE overflow', ov, await ev("[...document.querySelectorAll('.tools-page *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))")); assert not ov
        print('ERRORS', errors); assert not errors
        print('ENGINEERING E2E PASSED')
        await b.close()

asyncio.run(main())
