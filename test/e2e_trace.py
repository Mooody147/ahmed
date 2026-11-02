"""Tasks followed through their email history (lite artifact): my email that delivers a task's result closes it at once
(even from an address not in Setup, recognised by my name; Undo puts it back to Review); 🔎 Trace on a task shows its
trail and asks Claude whether it is done; Trace open tasks finds tasks that later emails show are done."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
ME = 'm.sobeah@contractor.example'

async def approve(pg):
    if await pg.evaluate("!!document.querySelector('[data-act=\"approve-all\"]')"): await pg.click('[data-act="approve-all"]')
    elif await pg.evaluate("!!document.querySelector('[data-act=\"approve\"]')"): await pg.click('[data-act="approve"]')

async def paste(pg, text):
    await pg.click('.rail [data-nav="import"]'); await pg.wait_for_timeout(300)
    if not await pg.evaluate("!!document.querySelector('#paste-text')"): await pg.click('[data-act="toggle-paste"]')
    for i in range(100):  # the startup Gmail check may still be analysing
        if not await pg.evaluate("window.__AR.UI.analyzing"): break
        await pg.wait_for_timeout(200)
    await pg.fill('#paste-text', text); await pg.click('[data-act="add-paste"]'); await pg.wait_for_timeout(500)
    await pg.click('[data-act="analyze"]'); await idle(pg)
    for i in range(100):
        if await pg.evaluate("window.__AR.UI.staging.slice(-1)[0].state === 'done' && !window.__AR.UI.analyzing"): break
        await pg.wait_for_timeout(200)
    await pg.wait_for_timeout(300)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 1000})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        ev = pg.evaluate
        if await ev("!!document.querySelector('#su-emails')"):
            await pg.fill('#su-emails', ME); await pg.click('[data-act="save-quick-setup"]')
        await ev("window.__AR.St.settings.gmail = { ...(window.__AR.St.settings.gmail || {}), autoCheck: false, autoAnalyse: false }; window.__AR.St.settings.me.name = window.__AR.St.settings.me.name || 'Mahmoud Sobeah'; 0")
        print('ME', await ev("window.__AR.St.settings.me.name"), await ev("window.__AR.St.settings.me.emails"))
        await ev("""window.__mockBase = window.__mockAnswer; window.__mockAnswer = p => {
          if (/^You track an engineer/.test(p)) {
            const tid = window.__vid && p.includes('"id":"' + window.__vid + '"') ? window.__vid : null;
            const eid = (/"id":"(e[a-z0-9]+)"[^\\n]*are now closed/.exec(p) || [])[1];
            window.__traceSaw = [!!tid, !!eid];
            if (/"results"/.test(p)) return { results: tid && eid ? [{ taskId: tid, verdict: 'done', emailId: eid, reason: 'The consultant confirmed all CRS comments are closed.', quote: 'all CRS comments on the valves specification are now closed', confidence: 0.9 }] : [] };
            return { verdict: eid ? 'done' : 'open', emailId: eid || null, reason: 'The consultant confirmed all CRS comments are closed.', quote: 'all CRS comments on the valves specification are now closed', confidence: 0.9 };
          }
          if (/Disc filter submittal for review/.test(p) && !/THIS IS ME/.test(p)) return {summary:'Vendor submitted the disc filter documents for review.',actionRequired:true,project:'ELM',tasks:[{ref:'N1',title:'Review disc filter submittal',action:'Review the disc filter vendor documents and give the civil requirements to the PM',askedOn:'2026-10-24',type:'review',ownership:'mine',owner:'me',requestedBy:'Hany Adel',project:'ELM — El Mahsama WWTP',topic:'Disc filters',priority:'high',evidence:[{source:'BODY',quote:'please review the disc filter submittal and send us your comments'}],confidence:0.9}],updates:[],flags:[]};
          if (/THIS IS ME/.test(p) && /civil requirements for the disc filters/.test(p)) {
            const id = (/\\[(t[a-z0-9]+)\\] T-\\d+ Review disc filter submittal/.exec(p) || [])[1]; window.__replySaw = !!id;
            return {summary:'I sent the disc filter civil requirements to the PM.',actionRequired:false,tasks:[],updates: id ? [{taskId:id,change:'completed',newStatus:'done',verdict:'fulfilled',confidence:0.85,reason:'You sent the reviewed disc filter civil requirements to the PM.',evidence:[{source:'BODY',quote:'please find attached the civil requirements for the disc filters'}]}] : [],flags:[]}; }
          return window.__mockBase(p); }; 0""")
        # the review task, from the vendor's email
        await paste(pg, 'From: Hany Adel <hany@vendor.example>\nSent: Friday, October 24, 2026 11:00 AM\nTo: Mahmoud Sobeah <%s>\nSubject: ELM – Disc filter submittal for review\n\nDear Eng. Mahmoud, please review the disc filter submittal and send us your comments.' % ME)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await approve(pg); await pg.wait_for_timeout(400)
        tid = await ev("[...window.__AR.St.tasks.values()].find(t => /disc filter/i.test(t.title)).id")
        # my email to the PM, sent from my company address (not in Setup) with a long body
        long = ' '.join(['The foundation loads, embedded items, anchor details, channel dimensions and access platforms are listed in the attached sheet with the vendor references and the revision status, for coordination with the structural team.'] * 6)
        await paste(pg, 'From: Mahmoud Sobeah <mahmoud.sobeah@company.example>\nSent: Monday, October 27, 2026 9:30 AM\nTo: Khaled Nabil <khaled@pm.example>\nSubject: ELM – disc filter civil\n\nDear Eng. Khaled, please find attached the civil requirements for the disc filters after our review. ' + long + '\n\nBest regards, Mahmoud')
        assert await ev("window.__replySaw") is True, 'the review task was offered to Claude for my email'
        em = await ev("[...window.__AR.St.emails.values()].find(e => /disc filter civil/.test(e.subject))")
        print('MY EMAIL fromMe', em['fromMe'], 'review', em['reviewState'])
        assert em['fromMe'] is True, 'recognised as mine by my name'
        t = await ev(f"window.__AR.St.tasks.get('{tid}')"); print('TASK AFTER MY EMAIL', t['status'], t['history'][-1]['text'][:120])
        assert t['status'] == 'done', 'closed at once, no Review step needed'
        assert em['reviewState'] == 'reviewed', 'nothing left to review for that email'
        toasts = await ev("[...document.querySelectorAll('.toast')].map(x => x.textContent)"); print('TOAST', toasts[-1:])
        assert any('Your email completes' in x for x in toasts)
        # Undo: the task is open again and the update waits in Review
        await pg.click('.toast:has-text("Your email completes") button'); await pg.wait_for_timeout(400)
        assert await ev(f"window.__AR.St.tasks.get('{tid}').status") != 'done'
        assert await ev("[...window.__AR.St.emails.values()].find(e => /disc filter civil/.test(e.subject)).reviewState") == 'pending'
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300)
        assert 'Your reply completes this task' in await pg.text_content('#main')
        await approve(pg); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{tid}').status") == 'done'

        # a task from the Gmail emails, then a later email (analysed as "nothing for you") that shows it is done
        await pg.click('.rail [data-nav="import"]'); await pg.click('[data-act="gmail-check"]')
        for i in range(60):
            st = await ev("window.__AR.UI.staging.filter(b => b.source === 'gmail').map(b => b.state)")
            if len(st) >= 3 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        if await ev("!!document.querySelector('[data-act=\"analyze\"]')"): await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(300)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await approve(pg); await pg.wait_for_timeout(400)
        await ev("(() => { const t = [...window.__AR.St.tasks.values()].find(x => /CRS comments 2 and 3/.test(x.title)); t.title = 'Answer valve spec CRS'; })()")
        vid = await ev("[...window.__AR.St.tasks.values()].find(x => x.title === 'Answer valve spec CRS').id")
        await ev(f"window.__vid = '{vid}'; 0")
        await paste(pg, 'From: Rania Hassan <rania@consultant.example>\nSent: Monday, October 27, 2026 1:00 PM\nTo: Mahmoud Sobeah <%s>\nSubject: RE: [EXTERNAL] ELM – Valves spec CRS & RAS pump calc\n\nDear Mahmoud, thank you — all CRS comments on the valves specification are now closed. Regards, Rania' % ME)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await approve(pg); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{vid}').status") != 'done'

        # 🔎 Trace on the task: its trail, and Claude's answer
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(700)
        await ev(f"window.__AR.UI.drawer = {{ kind: 'task', id: '{vid}' }}; 0"); await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(300)
        await ev(f"document.querySelector('.mnode.task[data-tid=\"{vid}\"] .mtxt').click()") ; await pg.wait_for_timeout(300)
        if not await ev("!!document.querySelector('#drawer [data-act=\"trace-open-task\"]')"):
            await ev(f"(() => {{ const b = document.createElement('button'); b.dataset.act = 'trace-open-task'; b.dataset.id = '{vid}'; document.body.append(b); b.click(); }})()")
        else: await pg.click('#drawer [data-act="trace-open-task"]')
        await pg.wait_for_timeout(300)
        trail = await ev("[...document.querySelectorAll('#drawer .trail li')].map(li => li.textContent.replace(/\\s+/g, ' ').trim().slice(0, 70))"); print('TRAIL', trail)
        assert await ev("document.querySelectorAll('#drawer .trail li.tr-mail').length") >= 2, 'the email that asked and the later one'
        await pg.click('#drawer [data-act="trace-task"]'); await pg.wait_for_timeout(900)
        assert await ev("window.__traceSaw && window.__traceSaw[0] && window.__traceSaw[1]"), 'task and the later email were sent'
        assert 'Done' in await pg.text_content('#drawer')
        await pg.screenshot(path=SHOTS + '/trace-1-task.png')
        await pg.click('#drawer [data-act="trace-skip"]'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{vid}').status") != 'done'

        # Trace open tasks: the same finding across all tasks (skipped pairs stay skipped, so forget that first)
        await ev("window.__AR.St.settings.traceSkip = []; 0"); await pg.keyboard.press('Escape')
        await pg.click('[data-menu="options"] summary'); await pg.click('[data-act="trace-all"]'); await pg.wait_for_timeout(1200)
        assert 'look' in ' '.join(await ev("[...document.querySelectorAll('.toast')].map(x => x.textContent)")) or 'Your emails show' in await pg.text_content('#main')
        assert 'Your emails show' in await pg.text_content('#main')
        await pg.click('[data-act="trace-open"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOTS + '/trace-2-all.png')
        await pg.click('#drawer [data-act="trace-apply-all"]'); await pg.wait_for_timeout(300)
        t = await ev(f"window.__AR.St.tasks.get('{vid}')"); print('TRACED', t['status'], t['history'][-1]['text'][:110])
        assert t['status'] == 'done' and 'consultant confirmed' in t['history'][-1]['text']
        await pg.click('.toast:has-text("updated from your emails") button'); await pg.wait_for_timeout(300)
        assert await ev(f"window.__AR.St.tasks.get('{vid}').status") != 'done', 'Undo'
        assert await ev("window.__AR.St.settings.traceAt")
        print('ERRORS', errors); assert not errors
        print('TRACE E2E PASSED')
        await b.close()

asyncio.run(main())
