"""Documents (register, timeline, files, tags, lessons, evidence viewer), Tools (calculators, compare, CRS, minutes), Ask and learned corrections."""
import asyncio, os, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
TMP = tempfile.mkdtemp()

async def main():
    crs = os.path.join(TMP, 'CRS_ELM-ME-SPC-0031.csv')
    open(crs, 'w').write('Project,ELM\nNo,Comment,Response\n1,Actuator enclosure shall be IP68,\n2,Coating thickness 250 um epoxy,\n3,Confirm PN16 rating,Already confirmed in Rev A\n')
    offA = os.path.join(TMP, 'Offer_A.txt'); open(offA, 'w').write('Pump offer A. Duty 410 m3/h at 14.5 m. NPSHr 3.8 m. Motor 30 kW IE3.')
    offB = os.path.join(TMP, 'Offer_B.txt'); open(offB, 'w').write('Pump offer B. Duty 400 m3/h at 14.5 m. Motor 30 kW IE2.')
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 950}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1')
        await pg.wait_for_timeout(1500); await idle(pg)
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        ev = pg.evaluate

        # document register filled from the approved email
        await pg.click('.rail [data-nav="docs"]'); await pg.wait_for_selector('.docs')
        rows = await ev("[...document.querySelectorAll('.doc-tbl tbody tr')].map(r=>r.textContent.replace(/\\s+/g,' ').trim())"); print('REGISTER', rows)
        assert len(rows) == 2 and any('ELM-ME-CAL-0012' in r and 'Code 3' in r for r in rows)
        assert await ev("!!document.querySelector('.doc-tbl tr.needs')")
        linked = await ev("[...window.__AR.St.cols.docreg.values()].find(d=>d.number==='ELM-ME-CAL-0012').taskId"); print('LINKED task', linked); assert linked
        await pg.screenshot(path=SHOTS + '/a0-doc-register.png')
        await pg.select_option('[data-k="docCode"]', 'open'); await pg.wait_for_timeout(200)
        assert await ev("document.querySelectorAll('.doc-tbl tbody tr').length") == 1
        await pg.select_option('[data-k="docCode"]', ''); await pg.wait_for_timeout(200)
        await pg.click('[data-act="doc-add"]'); await pg.fill('#de-number', 'ELM-ME-DS-0104'); await pg.fill('#de-title', 'Fine screens datasheet'); await pg.select_option('#de-code', '4'); await pg.click('[data-act="doc-save"]'); await pg.wait_for_timeout(200)
        assert await ev("document.querySelectorAll('.doc-tbl tbody tr').length") == 3
        await pg.click('.doc-tbl tr:has-text("ELM-ME-DS-0104") [data-act="doc-task"]'); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.tasks.values()].some(t=>/Revise and resubmit ELM-ME-DS-0104/.test(t.title))")
        await pg.click('[data-act="doc-export"]'); await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.endsWith('.xlsx'))", timeout=10000)
        # search keeps focus while typing
        await pg.click('#doc-q'); await pg.keyboard.type('valv'); await pg.wait_for_timeout(400)
        assert await ev("document.activeElement && document.activeElement.id") == 'doc-q' and await ev("document.querySelectorAll('.doc-tbl tbody tr').length") == 1
        await pg.fill('#doc-q', ''); await pg.wait_for_timeout(300)
        for tab in ['timeline', 'files', 'tags', 'lessons']:
            await pg.click(f'[data-act="doc-tab"][data-tab="{tab}"]'); await pg.wait_for_timeout(200)
            print('TAB', tab, ' '.join((await ev("document.querySelector('.docs').textContent"))[300:420].split()))
        await pg.fill('#ls-title', 'Ask for NPSHr curve at minimum wet well level'); await pg.fill('#ls-tags', 'ELM, pumps'); await pg.click('[data-act="lesson-add"]'); await pg.wait_for_timeout(200)
        assert await ev("document.querySelectorAll('.lesson').length") == 1

        # evidence viewer
        tid = await ev("[...window.__AR.St.tasks.values()].find(t=>/valves spec/i.test(t.title)).id")
        await ev(f"(()=>{{const b=document.createElement('button');b.dataset.act='open-task';b.dataset.id='{tid}';b.id='tmp-open';document.body.appendChild(b);}})()"); await pg.click('#tmp-open'); await pg.wait_for_selector('#drawer:not([hidden])')
        await pg.click('#drawer [data-act="ev-view"] >> nth=0'); await pg.wait_for_selector('.ev-viewer')
        mark = await ev("document.querySelector('#ev-mark') && document.querySelector('#ev-mark').textContent"); print('MARK', mark); assert mark
        await pg.screenshot(path=SHOTS + '/a1-evidence.png')
        await pg.click('.ev-viewer [data-act="close-modal"]'); await pg.wait_for_timeout(100)
        # learned correction: change the project of an emailed task
        await pg.fill('#d-project', 'ELM Expansion'); await pg.dispatch_event('#d-project', 'change'); await pg.wait_for_timeout(300)
        learned = await ev("((window.__AR.St.cols.prefs.get('learned')||{}).items||[])"); print('LEARNED', learned)
        assert learned and learned[0]['to'] == 'ELM Expansion'
        assert 'CORRECTIONS I MADE BEFORE' in await ev("window.__AR.learnedNotes({fromEmail:'x@consultant.example'})")
        await pg.click('[data-act="close-drawer"]'); await pg.wait_for_timeout(200)

        # calculators
        await pg.click('.rail [data-nav="tools"]'); await pg.wait_for_selector('.tools-page')
        out = await ev("document.querySelector('#calc-out').textContent"); print('PIPE', ' '.join(out.split())[:120]); assert '1.61' in out
        await pg.click('[data-act="calc-pick"][data-k="pump"]'); await pg.wait_for_timeout(100)
        out = await ev("document.querySelector('#calc-out').textContent"); assert '16.19' in out and '30' in out
        await pg.fill('#calc-h', '30'); await pg.wait_for_timeout(100)
        out2 = await ev("document.querySelector('#calc-out').textContent"); assert out2 != out
        await pg.click('[data-act="calc-pick"][data-k="npsh"]'); await pg.wait_for_timeout(100)
        out = await ev("document.querySelector('#calc-out').textContent"); print('NPSH', ' '.join(out.split())[:200]); assert '11.87' in out
        await pg.click('[data-act="calc-pick"][data-k="blower"]'); await pg.wait_for_timeout(100)
        await pg.screenshot(path=SHOTS + '/a2-calc.png')
        # compare offers
        await pg.click('[data-act="tool-tab"][data-tab="compare"]'); await pg.wait_for_timeout(100)
        async with pg.expect_file_chooser() as fc: await pg.click('[data-act="cmp-add"]')
        await (await fc.value).set_files([offA, offB]); await pg.wait_for_function("document.querySelectorAll('.cmp-in .chip').length==2", timeout=10000)
        await pg.click('[data-act="cmp-run"]'); await pg.wait_for_selector('.cmp-tbl', timeout=10000)
        assert await ev("document.querySelectorAll('.cmp-tbl tbody tr').length") == 2
        await pg.screenshot(path=SHOTS + '/a3-compare.png')
        # CRS
        await pg.click('[data-act="tool-tab"][data-tab="crs"]'); await pg.wait_for_timeout(100)
        async with pg.expect_file_chooser() as fc: await pg.click('[data-act="crs-open"]')
        await (await fc.value).set_files(crs); await pg.wait_for_selector('.crs-row', timeout=10000)
        assert await ev("document.querySelectorAll('.crs-row').length") == 3
        await pg.click('[data-act="crs-draft"]'); await pg.wait_for_function("document.querySelector('[data-crs=\"0\"]').value.length>5", timeout=10000)
        kept = await ev("document.querySelector('[data-crs=\"2\"]').value"); assert kept == 'Already confirmed in Rev A', kept
        await pg.click('[data-act="crs-save"]'); await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.includes('-responses.xlsx'))", timeout=10000)
        # meeting minutes
        await pg.click('[data-act="tool-tab"][data-tab="minutes"]'); await pg.wait_for_timeout(100)
        await pg.fill('#mtg-notes', 'Site meeting\n- Send revised valve schedule to consultant by Thursday\n- Omar to confirm channel width'); await pg.fill('#mtg-proj', 'ELM')
        await pg.click('[data-act="mtg-extract"]'); await pg.wait_for_selector('.mtg-item', timeout=10000)
        n0 = await ev("window.__AR.St.tasks.size"); await pg.click('[data-act="mtg-create"]'); await pg.wait_for_timeout(300)
        mt = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.source==='meeting').map(t=>[t.title,t.ownership,t.deadline])"); print('MEETING', mt); assert len(mt) == 2 and await ev("window.__AR.St.tasks.size") == n0 + 2

        # ask (Ctrl+J)
        await pg.keyboard.press('Control+j'); await pg.wait_for_selector('#ask-q')
        await pg.fill('#ask-q', 'Who am I waiting on?'); await pg.keyboard.press('Enter'); await pg.wait_for_selector('.ask-ans', timeout=10000)
        ans = await ev("document.querySelector('.ask-ans').textContent"); print('ASK', ' '.join(ans.split())[:160]); assert 'Ahmed' in ans
        await pg.screenshot(path=SHOTS + '/a4-ask.png')
        await pg.click('.ask-card [data-act="close-modal"]')

        # setup lists learned corrections
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_timeout(300)
        assert await ev("!!document.querySelector('#set-learn')")
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); mp = await m.new_page(); await mp.route('**/*', route)
        for v, sel in [('docs', '.docs'), ('tools', '.tools-page')]:
            await mp.goto('https://app.test/#' + v); await mp.wait_for_selector(sel, state='attached'); await mp.wait_for_timeout(500)
            ov = await mp.evaluate("document.documentElement.scrollWidth>innerWidth"); print('MOBILE', v, 'overflow', ov); assert not ov
        await mp.screenshot(path=SHOTS + '/a5-tools-mobile.png', full_page=True)
        print('ERRORS', errors); assert not errors
        print('TOOLS E2E PASSED')
        await b.close()
asyncio.run(main())
