"""Forwarding to the register: a message too large for Gmail's connector comes as text with each attachment to add by hand
(Add file); the +tasks address in Bcc is found; two emails forwarded together become two emails; Outlook's winmail.dat is
opened; protected (.rpmsg) emails and OneDrive/SharePoint links are flagged."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1366, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/#import'); await pg.wait_for_selector('[data-act="gmail-check"]')
        ev = pg.evaluate
        for i in range(80):
            st = await ev("window.__AR.UI.staging.map(b=>b.state)")
            if len(st) >= 6 and all(s != 'parsing' for s in st): break
            await pg.wait_for_timeout(400)
        st = await ev("window.__AR.UI.staging.map(b=>({gid:b.gmailId,subj:b.email.subject,state:b.state,atts:b.atts.map(a=>[a.name,a.missing,a.res&&a.res.status]),warn:b.warnings}))")
        for x in st: print(x)
        q = [c[1]['query'] for c in await ev("window.__gm.calls") if c[0] == 'search_threads'][0]; print('QUERY', q)
        assert 'deliveredto:' in q and 'bcc:' in q and 'cc:' in q
        raw_calls = [c[1]['messageId'] for c in await ev("window.__gm.calls") if c[0] == 'get_message' and c[1]['messageFormat'] == 'RAW']
        assert 'm3' not in raw_calls, 'a 7 MB message is not requested whole'
        big = next(x for x in st if x['gid'] == 'm3')
        assert big['state'] == 'ready', 'automatic analysis waits for the attachment to be added'
        assert ['GA_set.pdf', True, 'missing'] in big['atts'] and not any(a[0] == 'image001.png' for a in big['atts']), big['atts']
        assert any('larger than Gmail lets' in w for w in big['warn'])
        # two emails forwarded together (address only in Bcc) → two emails
        multi = [x for x in st if (x['gid'] or '').startswith('m4')]
        assert [x['subj'] for x in multi] == ['Valve schedule comments', 'RAS pump curve'], multi
        assert any('sharepoint.com' in w for w in multi[0]['warn']) and any('protected by your company' in w for w in multi[0]['warn'])
        assert any(a[0] == 'pump_curve.txt' and a[2] == 'text' for a in multi[1]['atts']), 'winmail.dat opened'
        # add the big attachment by hand
        pdf = os.path.join(FX, 'transmittal.pdf')
        bid = await ev("window.__AR.UI.staging.find(b=>b.gmailId==='m3').id")
        aid = await ev("window.__AR.UI.staging.find(b=>b.gmailId==='m3').atts.find(a=>a.missing).id")
        await pg.screenshot(path=SHOTS + '/fw-1-big.png', full_page=True)
        await pg.set_input_files(f'#sup-{bid}\\:{aid}', pdf)
        await pg.wait_for_function("window.__AR.UI.staging.find(b=>b.gmailId==='m3').atts.every(a=>a.res)", timeout=30000)
        after = await ev("window.__AR.UI.staging.find(b=>b.gmailId==='m3').atts.map(a=>[a.name,a.missing,a.res&&a.res.status,a.include])"); print('AFTER ADD', after)
        assert ['transmittal.pdf', False, 'text', True] in after and not any(a[1] for a in after)
        # analyse everything: the extra forwarded email is labelled once in Gmail
        await idle(pg)
        await pg.click('[data-act="analyze"]'); await idle(pg); await pg.wait_for_timeout(500)
        an = await ev("[...window.__AR.St.emails.values()].find(e=>/Huge drawings/.test(e.subject))")
        assert an and any(a['name'] == 'transmittal.pdf' and a['status'] == 'text' for a in an['attachments']), 'the big email was analysed with the added file'
        print('STATES', await ev("window.__AR.UI.staging.map(b=>[b.gmailId,b.state,b.doneText||b.error])"))
        lab = await ev("window.__gm.labeled"); print('LABELED', lab)
        assert all(':' not in x for x in lab) and lab.count('m4') == 1 and 'm3' in lab
        print('ERRORS', errors); assert not errors
        print('FORWARD E2E PASSED')
        await b.close()

asyncio.run(main())
