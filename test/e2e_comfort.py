"""Comfort: choose tabs, Today view, tasks from Excel, everything to Excel, password-protected backup round trip, manager dashboard, appraisal pack, tour, demo data."""
import asyncio, os, sys, json, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
OUT = os.path.join(HERE, 'fixtures', 'out'); os.makedirs(OUT, exist_ok=True)
# a task list as someone would keep it in Excel
subprocess.run(['node', '-e', """
const X=require('xlsx'); const ws=X.utils.aoa_to_sheet([['Project tracker'],[],['No.','Task description','Project','Responsible','Target date','Priority','Status','Remarks'],[1,'Prepare blower FAT procedure','ELM','Mahmoud Sobeah','2026-11-05','High','Open','per ITP'],[2,'Confirm cable sizes','ELM','Electrical team',new Date('2026-11-02'),'Medium','Ongoing',''],[3,'Old item','ELM','me','2026-09-01','Low','Closed','']]);
const wb=X.utils.book_new(); X.utils.book_append_sheet(wb,ws,'Tracker'); X.writeFile(wb, process.argv[1]);""", os.path.join(OUT, 'tracker.xlsx')], check=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200); await idle(pg)
        ev = pg.evaluate
        await pg.fill('#su-name', 'Mahmoud Sobeah') if await ev("!!document.querySelector('#su-name')") else None
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        saved = lambda rx: ev(f"Object.keys(window.__saveData||{{}}).filter(k=>{rx}.test(k))")
        # choose tabs
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_selector('#set-tabs')
        await pg.uncheck('[data-chg="tab-show"][data-k="money"]'); await pg.wait_for_timeout(200)
        assert await ev("document.querySelector('.rail [data-nav=\"money\"]').hidden"), 'Money hidden from the side bar'
        await pg.check('[data-chg="tab-show"][data-k="money"]'); await pg.wait_for_timeout(200); assert not await ev("document.querySelector('.rail [data-nav=\"money\"]').hidden")
        # tasks from an Excel tracker (title row, then header further down)
        n0 = await ev("window.__AR.St.tasks.size")
        await pg.set_input_files('#import-tasks-xlsx', os.path.join(OUT, 'tracker.xlsx')); await pg.wait_for_timeout(800)
        ts = await ev("[...window.__AR.St.tasks.values()].filter(t=>(t.history||[]).some(h=>/tracker.xlsx/.test(h.text))).map(t=>[t.title,t.owner,t.deadline,t.priority,t.status])"); print('IMPORTED', ts)
        assert len(ts) == 3 and ['Prepare blower FAT procedure', 'me', '2026-11-05', 'high', 'todo'] in ts and ['Confirm cable sizes', 'Electrical team', '2026-11-02', 'medium', 'in_progress'] in ts and any(t[4] == 'done' for t in ts)
        # everything in one workbook
        await pg.click('[data-act="export-all-xlsx"]'); await pg.wait_for_timeout(1200); names = await saved('/^action-register-all-.*\\.xlsx$/'); assert len(names) == 1
        sheets = await ev(f"(async()=>{{ const X = await window.__AR.E.need('xlsx'); const wb = X.read(new Uint8Array(await window.__saveData[{names[0]!r}].arrayBuffer()), {{type:'array'}}); return wb.SheetNames; }})()"); print('SHEETS', sheets); assert 'Tasks' in sheets and 'Emails' in sheets
        # password-protected backup: wrong password refused, right one restores
        await pg.click('[data-act="export-enc"]'); await pg.fill('#bk-p1', 'short'); await pg.fill('#bk-p2', 'short'); await pg.click('#bk-ok'); await pg.wait_for_timeout(200); assert 'at least 8' in await pg.text_content('#bk-err')
        await pg.fill('#bk-p1', 'correct horse 42'); await pg.fill('#bk-p2', 'correct horse 42'); await pg.click('#bk-ok'); await pg.wait_for_timeout(2500)
        bk = await saved('/\\.arbak$/'); assert len(bk) == 1
        raw = await ev(f"window.__saveData[{bk[0]!r}]"); enc = json.loads(raw); assert enc['app'] == 'action-register-encrypted' and 'Prepare blower' not in raw
        path = os.path.join(OUT, 'backup.arbak'); open(path, 'w').write(raw)
        tid = await ev("[...window.__AR.St.tasks.values()].find(t=>t.title==='Prepare blower FAT procedure').id")
        await ev(f"(async()=>{{ const db = await window.claude.use('db'); await db.doc('data/users/' + window.__AR.St.uid + '/register/tasks/{tid}').delete(); }})()"); await pg.wait_for_timeout(300)
        assert not await ev(f"window.__AR.St.tasks.has({tid!r})")
        await pg.set_input_files('#import-json', path); await pg.wait_for_selector('#bk-p1'); await pg.fill('#bk-p1', 'wrong password'); await pg.click('#bk-ok'); await pg.wait_for_timeout(2000)
        assert 'Wrong password' in await pg.text_content('#bk-err')
        await pg.fill('#bk-p1', 'correct horse 42'); await pg.click('#bk-ok'); await pg.wait_for_timeout(2500)
        await pg.wait_for_function(f"window.__AR.St.tasks.has({tid!r})", timeout=10000)  # restored from the protected backup
        # manager dashboard file
        await pg.click('[data-act="mgr-dash"]'); await pg.wait_for_timeout(300); dash = await saved('/^status-.*\\.html$/'); assert len(dash) == 1
        html = await ev(f"window.__saveData[{dash[0]!r}]"); assert '<!doctype html>' in html and 'Open tasks' in html and 'Confirm cable sizes' in html and 'Waiting on others' in html
        # appraisal pack
        await pg.click('.rail [data-nav="insights"]'); await pg.click('[data-act="ins-tab"][data-tab="appraisal"]'); await pg.wait_for_selector('[data-act="ap-word"]')
        await pg.click('[data-act="ap-word"]'); await pg.wait_for_timeout(1200); assert len(await saved('/^appraisal-pack-.*\\.docx$/')) == 1
        # Today view: add and tick
        await ev("window.__AR.UI.view = 'mini'; 0"); await pg.click('.rail [data-nav="todo"]'); await ev("location.hash = 'mini'; 0")
        await pg.evaluate("(()=>{const b=document.createElement('button');b.dataset.act='nav';b.dataset.view='mini';b.id='tmp-mini';document.body.appendChild(b);})()"); await pg.click('#tmp-mini'); await pg.wait_for_selector('#mini-add')
        await pg.fill('#mini-add', 'Call the crane supplier'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(300)
        nt = await ev("[...window.__AR.St.tasks.values()].find(t=>t.title==='Call the crane supplier')"); assert nt and nt['days'] == [await ev("new Date().toISOString().slice(0,10)")]
        await pg.check(f'[data-chg="mini-done"][data-id="{nt["id"]}"]'); await pg.wait_for_timeout(200); assert await ev(f"window.__AR.St.tasks.get({nt['id']!r}).status") == 'done'
        await pg.screenshot(path=SHOTS + '/k1-today.png')
        # tour and demo data
        await pg.click('.rail [data-nav="setup"]'); await pg.click('[data-act="tour-start"]'); await pg.wait_for_selector('.tour-card')
        for i in range(9): await pg.click('.tour-card [data-act="tour-step"][data-d="1"]')
        assert 'Setup' in await pg.text_content('.tour-card'); await pg.click('.tour-card [data-act="tour-step"][data-d="1"]'); assert await ev("document.querySelector('#tour').hidden")
        await pg.click('.rail [data-nav="setup"]'); await pg.click('[data-act="demo-load"]'); await pg.wait_for_timeout(300)
        nd = await ev("[...window.__AR.St.tasks.values()].filter(t=>t.demo).length"); assert nd == 8
        await pg.click('.rail [data-nav="setup"]'); await pg.click('[data-act="demo-remove"]'); await pg.wait_for_timeout(300)
        assert await ev("[...window.__AR.St.tasks.values()].filter(t=>t.demo).length") == 0 and await ev("[...window.__AR.St.cols.procure.values()].filter(x=>x.demo).length") == 0
        print('ERRORS', errors); assert not errors
        print('COMFORT E2E PASSED')
        await b.close()

asyncio.run(main())
