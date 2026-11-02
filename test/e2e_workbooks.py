"""Tools › My workbooks: import, inputs and drop-downs, library edits with row insert, saved calculations, calc note, export."""
import asyncio, os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
FX = os.path.join(HERE, 'fixtures', 'out')
subprocess.run(['node', os.path.join(HERE, 'fixtures', 'mkwb.js')], check=True, stdout=subprocess.DEVNULL)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200); await idle(pg)
        await pg.evaluate("window.print = () => { window.__printed = (window.__printed||0) + 1 }; 0")
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(300)
        ev = pg.evaluate
        await pg.click('.rail [data-nav="tools"]'); await pg.wait_for_selector('#wb-file', state='attached')
        await pg.set_input_files('#wb-file', [os.path.join(FX, 'demo-pipe-tool.xlsx'), os.path.join(FX, 'demo-tool.html')])
        await pg.wait_for_function("document.querySelectorAll('.wb-card').length >= 2", timeout=30000)
        cards = await ev("[...document.querySelectorAll('.wb-card b')].map(x=>x.textContent)"); print('CARDS', cards)
        assert 'DEMO PIPE TOOL' in cards and 'Demo Web Tool' in cards
        await pg.click('.wb-card:has-text("DEMO PIPE TOOL") [data-act="wb-open"]'); await pg.wait_for_selector('.wb-grid-t')
        await pg.click('[data-act="wb-sheet"] >> text=Calc'); await pg.wait_for_timeout(300)
        cell = lambda k: ev(f"document.querySelector('.wb-grid-t td[data-k=\"{k}\"]').textContent")
        print('START', await cell('8,3'), await cell('9,3'), await cell('11,3'))
        assert await cell('8,3') == '158.0' and await cell('9,3') == '1.42' and (await cell('11,3')).startswith('✓')
        # drop-down from a named range, then a number typed into an input
        await pg.click('.wb-grid-t td.in[data-k="4,3"]'); opts = await ev("[...document.querySelectorAll('.wb-ed option')].map(o=>o.textContent)"); print('OPTIONS', opts); assert opts == ['DI', 'HDPE']
        await pg.select_option('.wb-ed', 'HDPE'); await pg.wait_for_timeout(200)
        await pg.click('.wb-grid-t td.in[data-k="5,3"]'); await pg.select_option('.wb-ed', '110'); await pg.wait_for_timeout(200)
        print('HDPE 110', await cell('8,3'), await cell('9,3'), await cell('11,3'))
        assert await cell('8,3') == '90.0' and (await cell('11,3')).startswith('⚠')  # 100 m³/h in a 90 mm bore is 4.37 m/s
        await pg.click('.wb-grid-t td.in[data-k="6,3"]'); await pg.fill('.wb-ed', '20'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        print('FLOW 20', await cell('9,3'), await cell('11,3')); assert await cell('9,3') == '0.87' and (await cell('11,3')).startswith('✓')
        await pg.screenshot(path=SHOTS + '/b0-workbook-calc.png')
        # library: change a bore and add a size at the end of the table
        await pg.click('[data-act="wb-sheet"] >> text=Library'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="wb-edit"]'); await pg.wait_for_timeout(200)
        await pg.click('.wb-grid-t td[data-k="5,3"]')
        await pg.fill('.wb-ed', '91.5'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(200)
        await pg.click('.wb-grid-t tr[data-r="6"] [data-act="wb-row-add"]'); await pg.wait_for_timeout(300)
        for k, v in [('7,1', 'HDPE'), ('7,2', '200'), ('7,3', '163.6'), ('7,4', '1.5'), ('7,5', 'HDPE|200')]:
            await pg.click(f'.wb-grid-t td[data-k="{k}"]'); await pg.fill('.wb-ed', v); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(120)
        await pg.screenshot(path=SHOTS + '/b1-library-edit.png')
        await pg.click('[data-act="wb-edit"]')
        await pg.click('[data-act="wb-sheet"] >> text=Calc'); await pg.wait_for_timeout(200)
        print('AFTER LIB', await cell('8,3')); assert await cell('8,3') == '91.5'
        await pg.click('.wb-grid-t td.in[data-k="5,3"]'); await pg.select_option('.wb-ed', '200'); await pg.wait_for_timeout(200)
        print('NEW SIZE', await cell('8,3')); assert await cell('8,3') == '163.6', 'a row added at the end of the library is found'
        ops = await ev("[...window.__AR.St.cols.wbedits.values()][0].ops.map(o=>o.t)"); print('OPS', ops); assert 'ins' in ops
        # reopen from storage: the edits replay
        await ev("window.__AR.UI.wb.open=null"); await pg.click('.rail [data-nav="todo"]'); await pg.click('.rail [data-nav="tools"]'); await pg.wait_for_timeout(200)
        await ev("window.__wbForget && window.__wbForget()")
        await pg.click('.wb-card:has-text("DEMO PIPE TOOL") [data-act="wb-open"]'); await pg.wait_for_selector('.wb-grid-t')
        await pg.click('[data-act="wb-sheet"] >> text=Calc'); await pg.wait_for_timeout(200)
        assert await cell('8,3') == '163.6' and await cell('4,3') == 'HDPE'
        # save the calculation, link it to a task, export a calculation note and the edited workbook
        await pg.click('details[data-menu="wbmore"] > summary');
        await pg.click('[data-act="wb-save-run"]'); await pg.wait_for_selector('#sr-title')
        await pg.fill('#sr-tag', 'P-101A'); await pg.fill('#sr-proj', 'ELM'); await pg.select_option('#sr-task', index=1); await pg.click('[data-act="wb-save-run-ok"]'); await pg.wait_for_timeout(300)
        assert await ev("document.querySelectorAll('.wb-run').length") == 1
        await pg.click('details[data-menu="wbmore"] > summary'); await pg.click('[data-act="wb-note"][data-f="pdf"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__printed") == 1
        await pg.click('details[data-menu="wbmore"] > summary'); await pg.click('[data-act="wb-export"]')
        await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.endsWith('(edited).xlsx'))", timeout=15000)
        await pg.click('details[data-menu="wbmore"] > summary'); await pg.click('[data-act="wb-note"][data-f="docx"]')
        await pg.wait_for_function("(window.__saves||[]).some(s=>s.filename.endsWith('.docx'))", timeout=15000)
        print('SAVES', await ev("window.__saves.map(s=>s.filename)"))
        b64 = await ev("(async()=>{const d=window.__saveData['demo-pipe-tool (edited).xlsx']; const u=new Uint8Array(await d.arrayBuffer()); let s=''; for(const x of u) s+=String.fromCharCode(x); return btoa(s);})()")
        import base64, json as J
        open(os.path.join(FX, 'exported.xlsx'), 'wb').write(base64.b64decode(b64))
        chk = subprocess.run(['node', '-e', '''
const ExcelJS=require("exceljs"),JSZip=require("jszip"),W=require("./src/wb/engine.js"),C=require("./src/wb/convert.js"),fs=require("fs");
(async()=>{const m=C.convert(await C.read(ExcelJS,JSZip,fs.readFileSync(process.argv[1])));const b=new W.Book(m);
console.log(JSON.stringify({f:b.cell("Calc",8,3).f,id:b.value("Calc",8,3),mat:b.value("Calc",4,3),dn:b.value("Calc",5,3),lib:b.value("Library",7,3),cnt:b.value("Calc",13,3)}));})();''', os.path.join(FX, 'exported.xlsx')], capture_output=True, text=True, cwd=os.path.dirname(HERE))
        print('EXPORTED', chk.stdout.strip(), chk.stderr[-300:])
        x = J.loads(chk.stdout)
        assert x['id'] == 163.6 and x['lib'] == 163.6 and 'Library!$C$2:$C$7' in x['f'] and x['mat'] == 'HDPE' and x['dn'] == 200, x
        # the run shows on its task and loads back
        tid = await ev("[...window.__AR.St.cols.calcruns.values()][0].taskId"); assert tid
        # search every library
        await pg.click('[data-act="wb-close"]'); await pg.fill('#wb-allq', 'HDPE 200'); await pg.wait_for_timeout(600)
        hits = await ev("document.querySelectorAll('[data-act=\"wb-goto\"]').length"); print('HITS', hits); assert hits >= 1
        await pg.screenshot(path=SHOTS + '/b2-library-search.png', full_page=True)
        m = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True); mp = await m.new_page(); await mp.route('**/*', route)
        await mp.goto('https://app.test/#tools'); await mp.wait_for_selector('.tools-page', state='attached'); await mp.wait_for_timeout(500)
        assert not await mp.evaluate("document.documentElement.scrollWidth>innerWidth")
        print('ERRORS', errors); assert not errors
        print('WORKBOOKS E2E PASSED')
        await b.close()
asyncio.run(main())
