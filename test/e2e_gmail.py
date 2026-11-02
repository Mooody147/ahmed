import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); pg=await (await b.new_context(viewport={'width':1280,'height':900})).new_page()
        pg.on('pageerror',lambda e: errors.append('PAGEERROR '+str(e)))
        await pg.route('**/*',route); await pg.goto('https://app.test/#import'); await pg.wait_for_selector('[data-act="gmail-check"]')
        # the default forwarding address is checked automatically on open; analysis is automatic too
        for i in range(60):
            st=await pg.evaluate("window.__AR.UI.staging.map(b=>b.state)")
            if len(st)>=4 and all(s!='parsing' for s in st): break
            await pg.wait_for_timeout(400)
        print(json.dumps(await pg.evaluate("window.__AR.UI.staging.map(b=>({gid:b.gmailId,subj:b.email.subject,from:b.email.from,date:b.email.date,mode:b.email.forwardMode,fwdBy:b.email.forwardedBy,skip:b.skip,dup:!!b.dupEmailId,warn:b.warnings,atts:b.atts.map(a=>a.name+':'+(a.res&&a.res.status))}))"),indent=1,ensure_ascii=False))
        print('QUERY', [c[1] for c in await pg.evaluate("window.__gm.calls") if c[0]=='search_threads'])
        await pg.screenshot(path=SHOTS+'/20-gmail.png',full_page=True)
        bt=await pg.query_selector('[data-act="analyze"]:not([disabled])')
        if bt: await bt.click()
        for i in range(80):
            if not await pg.evaluate("window.__AR.UI.analyzing"): break
            await pg.wait_for_timeout(300)
        await pg.wait_for_timeout(500)
        print('STATES',await pg.evaluate("window.__AR.UI.staging.map(b=>[b.gmailId,b.state,b.doneText||b.error])"))
        print('LABELED',await pg.evaluate("window.__gm.labeled"))
        print('SEEN',await pg.evaluate("Object.keys(JSON.parse(JSON.stringify(window.__store.get('data/users/u123/gmailseen')||{})).ids||{})"))
        pr=await pg.evaluate("window.__prompts.map(p=>p.prompt.slice(p.prompt.indexOf('=== EMAIL HEADER'),p.prompt.indexOf('=== EMAIL HEADER')+420))")
        for x in pr: print('---\n'+x)
        await pg.click('[data-act="clear-staging"]'); await pg.click('[data-act="gmail-check"]'); await pg.wait_for_timeout(1500)
        print('SECOND CHECK staging',await pg.evaluate("window.__AR.UI.staging.length"))
        await pg.click('.rail [data-nav="emails"]'); await pg.wait_for_timeout(200); await pg.click('.erow >> nth=0'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=SHOTS+'/21-gmail-email.png')
        print('ERRORS',errors); await b.close()
asyncio.run(main())
