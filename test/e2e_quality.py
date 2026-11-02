"""Quality: site visit report (photos, AI observations, tasks, Word/PDF), comment patterns, unit converter, standards library, spec compliance checklist."""
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
        await pg.evaluate("window.print = () => { window.__printed = (window.__printed||0) + 1 }; 0")
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        tab = lambda t: pg.click(f'[data-act="tool-tab"][data-tab="{t}"]')
        saved = lambda rx: ev(f"Object.keys(window.__saveData||{{}}).filter(k=>{rx}.test(k)).length")
        await pg.click('.rail [data-nav="tools"]'); await tab('visit')
        await pg.click('[data-act="sv-new"]'); await pg.wait_for_selector('.sv-photos')
        await pg.fill('[data-chg="sv-f"][data-k="location"]', 'RAS pump station'); await pg.dispatch_event('[data-chg="sv-f"][data-k="location"]', 'change')
        await pg.click('.tools-page h1'); await pg.set_input_files('#sv-file', [os.path.join(FX, 'scan.png')]); await pg.wait_for_selector('.sv-ph img[src]', timeout=15000)
        await pg.click('[data-act="sv-ai"]'); await pg.wait_for_function("[...window.__AR.St.cols.visits.values()][0].obs.length === 1", timeout=15000)
        pr = await ev("window.__prompts.filter(p=>/^You are an experienced site engineer/.test(p.prompt)).pop()"); assert pr['images'] == 1
        v = await ev("[...window.__AR.St.cols.visits.values()][0]"); assert v['photos'][0]['caption'] == 'Pump base before grouting' and v['obs'][0]['sev'] == 'major'
        n0 = await ev("window.__AR.St.tasks.size"); await pg.click('[data-act="sv-tasks"]'); await pg.wait_for_timeout(200); assert await ev("window.__AR.St.tasks.size") == n0 + 1
        await pg.click('[data-act="sv-word"]'); await pg.wait_for_timeout(1500); assert await saved('/^site-visit-.*\\.docx$/') == 1
        size = await ev("(async()=>{const k=Object.keys(window.__saveData).find(k=>/^site-visit-.*\\.docx$/.test(k)); return (await window.__saveData[k].arrayBuffer()).byteLength})()"); print('DOCX bytes', size); assert size > 20000, 'photo embedded'
        await pg.click('[data-act="sv-pdf"]'); await pg.wait_for_timeout(500); assert await ev("window.__printed >= 1")
        await pg.screenshot(path=SHOTS + '/q1-site-visit.png')
        # comment patterns
        await tab('patterns'); t = await pg.text_content('.tools-page'); print('PATTERNS', ' '.join(t.split())[:200])
        if await ev("!!document.querySelector('[data-act=\"pat-ai\"]')"):
            await pg.click('[data-act="pat-ai"]'); await pg.wait_for_selector('[data-act="pat-tpl"]'); await pg.click('[data-act="pat-tpl"]'); await pg.wait_for_timeout(200)
            assert await ev("window.__AR.St.settings.templates.some(t=>/review comments/.test(t.name))")
        # units
        await tab('units'); await pg.fill('#uc-v', '410'); await pg.wait_for_timeout(100)
        out = await pg.text_content('#uc-out'); assert '113.889' in out, out[:200]   # 410 m³/h = 113.889 L/s
        await pg.click('[data-act="uc-cat"][data-k="pressure"]'); await pg.select_option('[data-chg="uc-from"]', 'bar'); await pg.fill('#uc-v', '10'); await pg.wait_for_timeout(100)
        out = await pg.text_content('#uc-out'); assert '101.972' in out and '145.038' in out, out[:300]   # 10 bar = 101.97 m H2O = 145.04 psi
        await pg.click('[data-act="uc-cat"][data-k="temp"]'); await pg.fill('#uc-v', '100'); await pg.wait_for_timeout(100); assert '212' in await pg.text_content('#uc-out')
        # standards → notebook
        await tab('stds'); await pg.click('[data-act="std-add"]'); await pg.wait_for_timeout(100)
        await pg.fill('.reg-tbl [data-col="standards"][data-k="code"]', 'ISO 9906'); await pg.dispatch_event('.reg-tbl [data-col="standards"][data-k="code"]', 'change'); await pg.click('.tools-page h1'); await pg.wait_for_timeout(150)
        sid = await ev("[...window.__AR.St.cols.standards.values()][0].id")
        await pg.set_input_files(f'#std-f-{sid}', os.path.join(FX, 'transmittal.pdf'))
        await pg.wait_for_function("(n => n && n.counts && n.counts.files === 1)(window.__AR.St.cols.notebooks.get('nb_standards'))", timeout=30000)
        # spec checklist (AI) and tasks for submittals and tests
        await tab('spec'); await pg.set_input_files('#spc-file', os.path.join(FX, 'spec.txt')); await pg.wait_for_selector('[data-act="spc-export"]', timeout=20000)
        c = await ev("[...window.__AR.St.cols.speccheck.values()][0]"); assert len(c['items']) == 3
        await pg.select_option('[data-chg="spc-i"][data-i="0"][data-k="status"]', 'deviation'); await pg.wait_for_timeout(150)
        await pg.click('[data-act="spc-tasks"]'); await pg.wait_for_timeout(200)
        assert await ev("[...window.__AR.St.tasks.values()].filter(t=>/^(Test|Submit):/.test(t.title)).length") == 2
        await pg.click('[data-act="spc-export"]'); await pg.wait_for_timeout(800); assert await saved('/^compliance-statement-.*\\.xlsx$/') == 1
        # without AI the "shall" sentences are found with their clauses
        loc = await ev("window.__AR_Q.specLocal(" + repr(open(os.path.join(FX, 'spec.txt')).read()) + ")"); print('LOCAL', [(x['clause'], x['kind']) for x in loc])
        assert [x['clause'] for x in loc] == ['2.1', '2.2', '3.1', '4.1'] and [x['kind'] for x in loc] == ['material', 'material', 'submittal', 'test']
        await pg.set_viewport_size({'width': 390, 'height': 844}); await tab('visit'); await pg.wait_for_timeout(300)
        ov = await ev("document.documentElement.scrollWidth > innerWidth + 1"); print('MOBILE overflow', ov); assert not ov
        print('ERRORS', errors); assert not errors
        print('QUALITY E2E PASSED')
        await b.close()

asyncio.run(main())
