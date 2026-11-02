"""Smarter emails → tasks (lite artifact): smart model choice per email, short headers, the email date on every task,
NEW for a day, the same email added twice is skipped, duplicate tasks merged, my own reply recognised and the task it
completes closed, Timeline and Priority matrix views, Reply & Chase drafts, a sharp minimap."""
import asyncio, os, sys, json
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
ME = 'm.sobeah@contractor.example'

async def approve(pg):
    # several emails: Approve all; a single email: its own Add button
    if await pg.evaluate("!!document.querySelector('[data-act=\"approve-all\"]')"): await pg.click('[data-act="approve-all"]')
    else: await pg.click('[data-act="approve"]')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1440, 'height': 1100}, device_scale_factor=2)
        pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        ev = pg.evaluate
        if await ev("!!document.querySelector('#su-emails')"):
            await pg.fill('#su-emails', ME); await pg.click('[data-act="save-quick-setup"]')
        assert await ev("window.__AR.St.settings.tier") == 'auto', 'smart model choice is the default'
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_selector('[data-act="gmail-check"]')
        for i in range(60):
            st = await ev("window.__AR.UI.staging.map(b=>b.state)")
            if len(st) >= 3 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        chips = await ev("[...document.querySelectorAll('#staging .chip.ai-quick')].map(c => c.textContent.trim())"); print('MODEL CHIPS', chips)
        assert chips, 'each email shows the model Claude will use'
        await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(400)
        tiers = await ev("window.__prompts.filter(p => /triage assistant/.test(p.prompt)).map(p => p.tier)"); print('TIERS USED', tiers)
        assert 'complex' in tiers and len(set(tiers)) >= 2, 'small emails use a smaller model than the one with attachments'
        pr = await ev("window.__prompts.find(p => /triage assistant/.test(p.prompt)).prompt")
        assert '3–8 words' in pr and 'askedOn' in pr and 'matchesTaskId' in pr
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await approve(pg); await pg.wait_for_timeout(400)
        n0 = await ev("window.__AR.St.tasks.size"); print('TASKS', n0)
        # long headers from the model are cut at a word, greetings dropped
        long = await ev("window.__AR.E.shortTitle('Please review the attached comment response sheet for the valve specification ELM-ME-SPC-0031 and confirm the actuator rating')"); print('SHORT', long)
        assert len(long) <= 71 and not long.lower().startswith('please')

        # email date and NEW on the canvas
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(900)
        if await ev("document.querySelector('[data-act=\"todo-mode\"][data-mode=\"map\"]').getAttribute('aria-pressed') !== 'true'"):
            await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(800)
        assert await ev("document.querySelectorAll('.mnode.task.is-new .mnew').length") == n0, 'every task just added is NEW'
        dates = await ev("[...document.querySelectorAll('.mnode.task .mmail')].map(x => x.textContent.trim())"); print('MAIL DATES', dates)
        assert len(dates) == n0
        assert await ev("[...window.__AR.St.tasks.values()].every(t => t.askedOn)"), 'askedOn kept on every task'
        # a day later it is no longer new
        await ev("(() => { const t = [...window.__AR.St.tasks.values()][0]; t.createdAt = new Date(Date.now() - 30 * 3600e3).toISOString(); })()")
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(500)
        assert await ev("document.querySelectorAll('.mnode.task.is-new').length") == n0 - 1

        # the same email added again is recognised and skipped
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="toggle-paste"]')
        body = 'From: Rania Hassan <rania@consultant.example>\nSent: Thursday, October 23, 2026 9:00 AM\nTo: Mahmoud Sobeah <%s>\nSubject: ELM pumps – please confirm NPSH margin\n\nDear Mahmoud, please confirm the NPSH margin for the RAS pumps at minimum wet well level and send the updated curve.' % ME
        await pg.fill('#paste-text', body); await pg.click('[data-act="add-paste"]'); await pg.wait_for_timeout(500)
        await ev("""window.__mockBase = window.__mockBase || window.__mockAnswer; window.__mockAnswer = p => {
          if (/please confirm NPSH margin/.test(p) && !/THIS IS ME/.test(p)) return {summary:'Confirm NPSH margin.',actionRequired:true,project:'ELM',thread:{first:'2026-10-20',last:'2026-10-23',messages:2},tasks:[{ref:'N1',title:'Confirm RAS pump NPSH margin',action:'Confirm NPSH margin at min level and send curve',askedOn:'2026-10-23',type:'reply',ownership:'mine',owner:'me',requestedBy:'Rania Hassan',project:'ELM — El Mahsama WWTP',topic:'RAS pump hydraulic calc',priority:'high',subtasks:[{text:'NPSH margin at minimum level'},{text:'Updated pump curve'}],evidence:[{source:'BODY',quote:'please confirm the NPSH margin for the RAS pumps at minimum wet well level'}],confidence:0.9}],updates:[],flags:[]};
          if (/THIS IS ME/.test(p)) { const id = (/\\[(t[a-z0-9]+)\\] T-\\d+ Confirm RAS pump NPSH margin/.exec(p) || [])[1]; window.__replySawTask = !!id;
            return {summary:'My reply with the NPSH margin.',actionRequired:false,tasks:[],updates: id ? [{taskId:id,change:'completed',newStatus:'done',verdict:'fulfilled',reason:'You confirmed a 1.8 m NPSH margin and attached the curve.',doneItems:['NPSH margin at minimum level','Updated pump curve'],evidence:[{source:'BODY',quote:'the NPSH margin at minimum wet well level is 1.8 m'}]}] : [],flags:[]}; }
          return window.__mockBase(p); }; 0""")
        await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(300)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300); await approve(pg); await pg.wait_for_timeout(400)
        n1 = await ev("window.__AR.St.tasks.size"); assert n1 == n0 + 1, (n0, n1)
        nid = await ev("[...window.__AR.St.tasks.values()].find(t => /NPSH margin/.test(t.title)).id")
        t = await ev(f"window.__AR.St.tasks.get('{nid}')"); print('ASKED ON', t['askedOn'], 'THREAD', t.get('threadFirst'))
        assert t['askedOn'] == '2026-10-23' and t.get('threadFirst') == '2026-10-20'
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_timeout(300); await pg.click('[data-act="toggle-paste"]')
        await pg.fill('#paste-text', body); await pg.click('[data-act="add-paste"]'); await pg.wait_for_timeout(500)
        dup = await ev("window.__AR.UI.staging.filter(b => b.state === 'ready').map(b => [b.skip, !!b.dupEmailId])"); print('SAME EMAIL AGAIN', dup)
        assert dup and dup[-1] == [True, True], 'recognised as already added and skipped'
        assert 'no duplicate tasks' in (await pg.text_content('#staging'))
        if await ev("!!document.querySelector('[data-act=\"analyze\"]')"): await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.UI.staging.slice(-1)[0].state") == 'ready', 'not analysed'
        assert await ev("window.__AR.St.tasks.size") == n1, 'no task added for the same email'
        await pg.click(f'[data-act="remove-bundle"][data-id="{await ev("window.__AR.UI.staging.slice(-1)[0].id")}"]')
        await pg.click('[data-act="clear-staging"]') if await ev("!!document.querySelector('[data-act=\"clear-staging\"]')") else None

        # my own reply: recognised as answering that task, which it completes
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_timeout(300)
        if not await ev("!!document.querySelector('#paste-text')"): await pg.click('[data-act="toggle-paste"]')
        await pg.fill('#paste-text', 'From: Mahmoud Sobeah <%s>\nSent: Monday, October 27, 2026 10:00 AM\nTo: Rania Hassan <rania@consultant.example>\nSubject: RE: ELM pumps – please confirm NPSH margin\n\nDear Rania, the NPSH margin at minimum wet well level is 1.8 m. The updated pump curve is attached.\n\nBest regards, Mahmoud' % ME)
        await pg.click('[data-act="add-paste"]'); await pg.wait_for_timeout(500); await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(300)
        assert await ev("window.__replySawTask") is True, 'the earlier task was offered to Claude as the one my reply answers'
        # a clear outcome is applied at once; Review shows it as applied
        await pg.click('.rail [data-nav="emails"]'); await pg.wait_for_timeout(200)
        t = await ev(f"window.__AR.St.tasks.get('{nid}')"); print('AFTER MY REPLY', t['status'], [x['done'] for x in t['subtasks']], t['history'][-1]['text'])
        assert t['status'] == 'done' and all(x['done'] for x in t['subtasks']) and 'completed by my email' in t['history'][-1]['text']
        assert await ev("window.__AR.St.tasks.size") == n1, 'my reply did not add a task'

        # duplicates already on the canvas: found and merged (Undo brings them back)
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(600)
        src = await ev("[...window.__AR.St.tasks.values()].find(t => /RAS pump hydraulic calc/.test(t.title) && t.status !== 'done').id")
        await ev(f"""(() => {{ const t = window.__AR.St.tasks.get('{src}'); const c = JSON.parse(JSON.stringify(t)); c.id = 'tdup1'; c.ref = 'T-0099'; c.title = 'Revise and resubmit the RAS pump hydraulic calc'; c.subtasks = [{{id:'sx', text:'C-03 — add motor margin', done:false}}]; c.createdAt = new Date().toISOString(); window.__AR.St.tasks.set(c.id, c); }})()""")
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(500)
        txt = await pg.text_content('#main'); assert 'duplicate task' in txt, 'duplicate callout'
        await pg.click('[data-act="dup-open"]'); await pg.wait_for_timeout(300)
        assert await ev("document.querySelectorAll('#drawer .dup-group').length") >= 1
        await pg.screenshot(path=SHOTS + '/smart-2-duplicates.png')
        n2 = await ev("window.__AR.St.tasks.size")
        await pg.click('#drawer [data-act="dup-merge"]'); await pg.wait_for_timeout(400)
        assert await ev("window.__AR.St.tasks.size") == n2 - 1
        kept = await ev(f"window.__AR.St.tasks.get('{src}') || window.__AR.St.tasks.get('tdup1')")
        print('MERGED items', [x['text'][:14] for x in kept['subtasks']])
        assert any('C-03' in x['text'] for x in kept['subtasks']), 'items moved to the task that stays'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('.cv-sub [data-act="cv-undo"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.St.tasks.size") == n2, 'Undo brings the duplicate back'
        await pg.click('[data-act="dup-merge-all"]'); await pg.wait_for_timeout(400)
        assert await ev("window.__AR.St.tasks.size") == n2 - 1 and 'duplicate task' not in (await pg.text_content('#main'))

        # long headers: shortened with Claude in one go
        await ev("""(() => { const t = [...window.__AR.St.tasks.values()].find(x => x.status !== 'done'); t.title = 'Please review the complete comment response sheet for the valves specification and reply to the consultant with all the answers'; })()""")
        await ev("""window.__mockAnswer = (b => p => /^Rewrite each task header/.test(p) ? { titles: [...p.matchAll(/"id":"(t[a-z0-9]+)"/g)].map(m => ({ id: m[1], title: 'Answer valve spec CRS' })) } : b(p))(window.__mockAnswer); 0""")
        await pg.click('[data-act="map-refresh"]'); await pg.wait_for_timeout(400)
        assert 'long header' in await pg.text_content('#main')
        await pg.click('[data-act="tidy-headers"]'); await pg.wait_for_timeout(800)
        assert await ev("[...window.__AR.St.tasks.values()].some(t => t.title === 'Answer valve spec CRS')"), 'header shortened'
        assert await ev("[...window.__AR.St.tasks.values()].filter(t => t.status !== 'done').every(t => t.title.length <= 70)")

        # Timeline and Priority matrix
        await pg.click('[data-act="todo-mode"][data-mode="timeline"]'); await pg.wait_for_timeout(600)
        rows = await ev("document.querySelectorAll('.tl-row').length"); print('TIMELINE rows', rows); assert rows >= 3
        assert await ev("!!document.querySelector('.tl-today') && !!document.querySelector('.tl-bar')")
        await pg.screenshot(path=SHOTS + '/smart-3-timeline.png')
        await pg.click('.tl-row'); await pg.wait_for_timeout(300); assert await ev("!!window.__AR.UI.drawer"), 'opens the task'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="todo-mode"][data-mode="matrix"]'); await pg.wait_for_timeout(600)
        q = await ev("[...document.querySelectorAll('.mx-q')].map(s => s.querySelector('header b').textContent + ':' + s.querySelectorAll('.vcard').length)"); print('MATRIX', q)
        assert len(q) == 4 and sum(int(x.split(':')[1]) for x in q) >= 2
        await pg.screenshot(path=SHOTS + '/smart-4-matrix.png')

        # Reply & Chase: a chaser for the task I am waiting on, opened in Gmail ready to send
        wid = await ev("[...window.__AR.St.tasks.values()].find(t => t.ownership === 'waiting' && t.status !== 'done').id")
        await ev(f"(() => {{ const t = window.__AR.St.tasks.get('{wid}'); t.createdAt = t.askedOn = '2026-10-15'; t.sourceDate = '2026-10-15T09:00:00Z'; }})()")
        await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(600)
        # (the "owes you" banner was removed with the To-do header; the chaser is on the task itself)
        await pg.click(f'.mnode.task[data-tid="{wid}"] .mtxt b'); await pg.wait_for_selector('#drawer [data-act="rc-draft"]')
        await pg.click('#drawer [data-act="rc-draft"]'); await pg.wait_for_timeout(900)
        body = await ev("document.getElementById('rc-body').value"); print('CHASER', body[:80].replace('\n', ' '))
        assert body.strip()
        href = await ev("document.getElementById('rc-gmail').href"); assert href.startswith('https://mail.google.com/mail/?view=cm') and 'su=' in href
        await pg.fill('#rc-sub', 'Follow-up: anchor bolts'); href2 = await ev("document.getElementById('rc-gmail').href"); assert 'anchor%20bolts' in href2, 'edits go into the Gmail link'
        await pg.screenshot(path=SHOTS + '/smart-5-chase.png')
        await pg.click('[data-act="rc-sent"]'); await pg.wait_for_timeout(300)
        assert (await ev(f"window.__AR.St.tasks.get('{wid}').history.slice(-1)[0].text")).startswith('Chased')
        assert 'owes you' not in (await pg.text_content('#main')), 'chased today, so not listed again'

        # sharpness: the minimap is drawn at the screen's pixel density; the canvas is only a moving layer while it moves
        mm = await ev("(() => { const c = document.getElementById('minimap'); return c ? [c.width, c.getBoundingClientRect().width] : null; })()"); print('MINIMAP px', mm)
        assert mm and mm[0] >= 2 * mm[1] - 1
        await pg.wait_for_timeout(300); assert not await ev("document.getElementById('map-world').classList.contains('moving')")
        print('ERRORS', errors); assert not errors
        print('SMART E2E PASSED')
        await b.close()

asyncio.run(main())
