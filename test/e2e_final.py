import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':1280,'height':900}); pg=await ctx.new_page()
        await ctx.grant_permissions(['clipboard-read','clipboard-write'],origin='https://app.test')
        pg.on('pageerror',lambda e: errors.append('PAGEERROR '+str(e))); pg.on('console',lambda m: errors.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*',route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1')
        await pg.screenshot(path=SHOTS+'/50-first-open.png',full_page=True)
        await pg.wait_for_timeout(1500); await idle(pg)
        print('AUTO: staging', await pg.evaluate("window.__AR.UI.staging.map(b=>[b.gmailId,b.state])"), 'review pending', await pg.evaluate("[...window.__AR.St.emails.values()].filter(e=>e.reviewState==='pending').length"))
        await pg.fill('#su-emails','m.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]'); await pg.wait_for_timeout(200)
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(500)
        print('AFTER ADD ALL pending', await pg.evaluate("[...window.__AR.St.emails.values()].filter(e=>e.reviewState==='pending').length"), 'tasks', await pg.evaluate("window.__AR.St.tasks.size"))
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(1800)
        await pg.click('[data-act="todo-mode"][data-mode="board"]'); await pg.wait_for_timeout(400)
        print('GROUPS', await pg.eval_on_selector_all('.stack-h .gname','e=>e.map(x=>x.textContent)'))
        print('CATS', await pg.evaluate("[...window.__AR.St.tasks.values()].map(t=>[t.ref,t.project,t.discipline,t.workType])"))
        await pg.screenshot(path=SHOTS+'/51-todo.png',full_page=True)
        await pg.fill('#todo-q','valves'); await pg.wait_for_timeout(300)
        print('SEARCH valves', await pg.eval_on_selector_all('.tc-title','e=>e.map(x=>x.textContent.trim())'))
        await pg.fill('#todo-q',''); await pg.wait_for_timeout(200)
        # add files
        await pg.click('.rail [data-nav="import"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOTS+'/52-add.png',full_page=True)
        await pg.set_input_files('#file-in',[FX+'/review.eml',FX+'/test.msg']); await pg.wait_for_timeout(2500); await idle(pg)
        print('FILES staging', await pg.evaluate("window.__AR.UI.staging.filter(b=>!b.gmailId).map(b=>[b.source,b.state,b.skip,!!b.dupEmailId])"))
        bt=await pg.query_selector('[data-act="analyze"]:not([disabled])')
        if bt: await bt.click(); await pg.wait_for_timeout(500); await idle(pg)
        # copy address
        await pg.click('[data-act="copy-addr"]'); await pg.wait_for_timeout(200); print('CLIP', await pg.evaluate("navigator.clipboard.readText()"))
        # setup
        await pg.click('.rail [data-nav="setup"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=SHOTS+'/53-setup.png',full_page=True)
        await pg.uncheck('#gm-analyse'); await pg.click('[data-act="gmail-save"]'); await pg.wait_for_timeout(200)
        print('GMAIL CFG', await pg.evaluate("window.__AR.St.settings.gmail"))
        await pg.click('[data-act="export-csv"]'); await pg.wait_for_timeout(300); print('SAVES', await pg.evaluate("window.__saves"))
        # drawer
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(400); await pg.click('.tc-title >> nth=0'); await pg.wait_for_selector('#drawer:not([hidden])')
        await pg.screenshot(path=SHOTS+'/54-drawer.png')
        await pg.click('[data-act="close-drawer"]')
        # mobile + dark
        m=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,color_scheme='dark'); mp=await m.new_page(); await mp.route('**/*',route)
        await mp.goto('https://app.test/'); await mp.wait_for_selector('h1'); await mp.wait_for_timeout(2500); await idle(mp)
        await mp.screenshot(path=SHOTS+'/55-mobile-dark.png',full_page=True)
        for v in ['todo','review','import','emails','setup']:
            await mp.evaluate(f"location.hash='{v}'"); await mp.click(f'[data-nav="{v}"] >> nth=-1') if v!='setup' else await mp.click('.topbar [data-nav="setup"]')
            await mp.wait_for_timeout(300); print('MOBILE',v,'overflow',await mp.evaluate("document.documentElement.scrollWidth>innerWidth"))
        print('ERRORS',errors); await b.close()
asyncio.run(main())
