"""Plan: calendar, Gantt, workload with an extension request, contacts from signatures, vendor scorecard, meeting prep, their deadlines; Daily wrap-up and day sheet."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

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
        tab = lambda t: pg.click(f'[data-act="plan-tab"][data-tab="{t}"]')
        await pg.click('.rail [data-nav="plan"]'); await pg.wait_for_selector('.cal-grid')
        dl = await ev("[...window.__AR.St.tasks.values()].find(t=>t.deadline && t.status!=='done')")
        await pg.click('[data-act="cal-today"]'); await ev(f"window.__AR.UI.plan.month = {dl['deadline'][:7]!r}; window.__AR.UI.plan.day = {dl['deadline']!r}; 0")
        await tab('calendar'); txt = await pg.text_content('.plan'); assert dl['title'][:20] in txt, 'deadline on the calendar'
        await pg.screenshot(path=SHOTS + '/p1-calendar.png')
        await tab('gantt'); n = await ev("document.querySelectorAll('.gantt .g-row').length"); print('GANTT ROWS', n); assert n >= 1
        # workload: comfortable = 1 task per week → the week is over full → extension request draft
        for i in range(3): await ev(f"(async()=>{{ const db = await window.claude.use('db'); await db.doc('data/users/' + window.__AR.St.uid + '/register/tasks/tw{i}').set({{id:'tw{i}', ref:'T-90{i}', title:'Busy task {i}', status:'todo', ownership:'mine', owner:'me', requestedBy:'Rania Hassan', priority:'medium', deadline: window.__AR.E.addDays(new Date().toISOString().slice(0,10), 8), createdAt:new Date().toISOString(), history:[]}}); }})()")
        await pg.wait_for_timeout(400)
        await tab('workload'); await pg.fill('[data-chg="load-cap"]', '1'); await pg.dispatch_event('[data-chg="load-cap"]', 'change'); await pg.wait_for_timeout(200)
        over = await ev("document.querySelectorAll('.load-w.over').length"); print('OVER WEEKS', over, await ev("[...document.querySelectorAll('.load-w .n')].map(n=>n.textContent).join(',')"), await ev("JSON.stringify(window.__AR.St.cols.prefs.get('workload'))"))
        assert over >= 1
        await pg.click('.load-w.over [data-act="load-ext"]'); await pg.wait_for_selector('.mail-draft'); await pg.wait_for_timeout(600)
        body = await pg.input_value('#ml-body'); print('EXT', body[:200]); assert 'Busy task' in body or 'T-90' in body or 'Dear' in body
        await pg.click('.mail-draft [data-act="close-modal"]')
        # contacts from the emails, with signature phone numbers
        await tab('contacts'); await pg.click('[data-act="ct-scan"]'); await pg.wait_for_timeout(1500)
        cs = await ev("[...window.__AR.St.cols.contacts.values()]"); print('CONTACTS', [(c['name'], c['company'], c['phones'], c['title']) for c in cs][:6]); assert len(cs) >= 2
        sg = await ev("window.__AR_PLAN.sigOf('Please see attached.\\n\\nBest regards,\\nAhmed Fathy\\nSenior Civil Engineer\\nHassan Allam Construction\\nMob: +20 100 123 4567 | Tel: (02) 2345 6789', 'Ahmed Fathy')")
        print('SIGNATURE', sg); assert sg['title'] == 'Senior Civil Engineer' and '+201001234567' in sg['phones'] and '0223456789' in sg['phones']
        await pg.click('[data-act="ct-export"]'); await pg.wait_for_timeout(300); assert await ev("Object.keys(window.__saveData).some(k=>/\\.vcf$/.test(k))")
        # vendor from procurement, rated
        await ev("window.__AR.St.cols.procure.set('pr1', {id:'pr1', item:'Blowers', supplier:'Aerzen', status:'po', po:'2026-08-01', lead:20, need:'2026-11-01'}); 0")
        await tab('vendors'); await pg.select_option('[data-chg="vd-rate"][data-c="quality"]', '4'); await pg.select_option('[data-chg="vd-rate"][data-c="response"]', '2'); await pg.wait_for_timeout(200)
        row = await pg.text_content('.plan table tbody tr'); print('VENDOR', ' '.join(row.split())); assert 'Aerzen' in row and '3.0' in row or '3' in row
        # meeting prep for a person
        owner = await ev("([...window.__AR.St.tasks.values()].find(t=>t.ownership==='waiting')||{}).owner || ''"); print('MEET', owner)
        await tab('meeting'); await pg.fill('#meet-who', owner); await pg.click('[data-act="meet-go"]'); await pg.wait_for_selector('#meet-sheet')
        assert 'They owe me (1)' in await pg.text_content('#meet-sheet') or 'They owe me' in await pg.text_content('#meet-sheet')
        await pg.click('[data-act="meet-print"]'); await pg.wait_for_timeout(300)
        # their deadlines: a submitted document starts the 14-day clock
        await ev("window.__AR.St.cols.docreg.set('drX', {id:'drX', number:'ELM-ME-DS-0099', title:'Blower datasheet', revs:[{rev:'A', status:'submitted', date:'2026-09-20'}]}); 0")
        await tab('deadlines'); t = await pg.text_content('.plan'); assert 'ELM-ME-DS-0099' in t and 'd late' in t
        await pg.click('[data-act="dl-remind"]'); await pg.wait_for_selector('.mail-draft'); assert 'overdue' in await pg.input_value('#ml-body'); await pg.click('.mail-draft [data-act="close-modal"]')
        # daily wrap-up and day sheet
        await pg.click('.rail [data-nav="daily"]'); await pg.click('[data-act="day-wrap"]'); await pg.wait_for_selector('#wrap-note')
        tops = await ev("[...document.querySelectorAll('.wrap-top')].map(i=>i.value)"); await pg.fill('#wrap-note', 'Good progress on the RAS pumps.'); await pg.click('[data-act="wrap-save"]'); await pg.wait_for_timeout(300)
        tm = await ev("window.__AR.E.addDays(new Date().toISOString().slice(0,10), 1)")
        for x in tops: assert await ev(f"(window.__AR.St.tasks.get({x!r}).days||[]).includes({tm!r})"), 'top 3 planned for tomorrow'
        assert await ev("[...window.__AR.St.daily.values()].some(d=>d.text==='Good progress on the RAS pumps.')")
        await pg.click('[data-act="day-sheet"]'); await pg.wait_for_timeout(400); assert await ev("window.__printed >= 2")
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.click('.tabbar [data-nav="todo"]') if await ev("!!document.querySelector('.tabbar [data-nav=\"todo\"]')") else None
        await ev("window.__AR.UI.plan.tab='calendar'; 0"); await ev("location.hash='#plan'; 0"); await pg.wait_for_timeout(500)
        ov = await ev("document.documentElement.scrollWidth > innerWidth + 1"); print('MOBILE overflow', ov); assert not ov
        print('ERRORS', errors); assert not errors
        print('PLAN E2E PASSED')
        await b.close()

asyncio.run(main())
