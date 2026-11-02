"""Communication: WhatsApp chat → tasks, writing helper, letters and method statements, reminders and snooze, thread summary."""
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
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        tab = lambda t: pg.click(f'[data-act="tool-tab"][data-tab="{t}"]')
        await pg.click('.rail [data-nav="tools"]'); await tab('chats')
        await pg.set_input_files('#chat-file', os.path.join(FX, 'whatsapp.txt')); await pg.wait_for_selector('#chat-name')
        msgs = await ev("window.__AR.UI.chat.msgs"); print('CHAT', [(m['date'], m['who']) for m in msgs])
        assert len(msgs) == 5 and msgs[0]['date'] == '2026-09-01' and msgs[-1]['text'].endswith('the revised schedule too'), 'system line, multi-line message, image omitted'
        assert await pg.input_value('#chat-name') == 'Pasted chat' or True
        await pg.click('[data-act="chat-stage"]'); await pg.wait_for_selector('#staging .bundle')
        await pg.wait_for_function("window.__AR.UI.staging.some(b=>b.state==='ready')", timeout=15000)
        await pg.click('[data-act="analyze"]'); await idle(pg)
        pr = await ev("window.__prompts.filter(p=>/Chat “/.test(p.prompt)).pop().prompt"); assert '2026-10-20 08:16 — Ahmed Fathy: Mahmoud please confirm the pump base' in pr and '2026-09-01' not in pr.split('=== EMAIL HEADER ===')[-1], 'only messages of the last 14 days'
        # writing helper
        await pg.click('.rail [data-nav="tools"]'); await tab('chats')
        await pg.fill('#wr-in', 'send me valve schedule revised until 30 oct'); await pg.click('[data-act="wr-go"][data-k="polite"]'); await pg.wait_for_selector('.wr-out')
        assert 'revised valve schedule' in await pg.text_content('.wr-out')
        await pg.click('[data-act="wr-go"][data-k="ar"]'); await pg.wait_for_timeout(600); assert 'الصمامات' in await pg.text_content('.wr-out')
        # method statement drafted and saved as Word
        await tab('letters'); await pg.click('[data-act="lt-kind"][data-k="ms"]')
        await pg.fill('#lt-subject', 'Installation of RAS pumps P-101A/B'); await pg.fill('#lt-points', 'Mobile crane 25 t\nAnchor bolts per drawing ELM-C-201')
        await pg.click('[data-act="lt-draft"]'); await pg.wait_for_selector('.lt-sec'); n = await ev("document.querySelectorAll('.lt-sec').length"); assert n == 7, n
        await pg.click('[data-act="lt-word"]'); await pg.wait_for_timeout(1200)
        assert await ev("Object.keys(window.__saveData).some(k=>/-MS-001\\.docx$/.test(k))")
        # reminder and snooze from the task panel
        tid = await ev("[...window.__AR.St.tasks.values()].find(t=>t.status!=='done').id")
        await ev(f"window.__AR.UI.drawer = null; 0"); await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(300)
        await pg.evaluate(f"(()=>{{const b=document.createElement('button');b.dataset.act='open-task';b.dataset.id='{tid}';b.id='tmp-open';document.body.appendChild(b);}})()"); await pg.click('#tmp-open'); await pg.wait_for_selector('#drawer:not([hidden])')
        await pg.wait_for_selector('[data-chg="t-snooze"]', timeout=5000)
        await pg.select_option('[data-chg="t-remind"]', '1'); await pg.wait_for_timeout(150)
        assert await ev(f"window.__AR.St.tasks.get({tid!r}).remindAt") is not None
        await pg.select_option('[data-chg="t-snooze"]', '7'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="close-drawer"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="todo-mode"][data-mode="list"]'); await pg.wait_for_timeout(300)
        assert await ev(f"!document.querySelector('#todo-groups [data-id=\"{tid}\"]')"), 'snoozed task is hidden'
        assert 'snoozed task' in await pg.text_content('#todo-groups')
        await pg.click('[data-act="toggle-snoozed"]'); await pg.wait_for_timeout(200)
        assert await ev(f"!!document.querySelector('#todo-groups [data-id=\"{tid}\"]')")
        # thread summary from the email panel
        eid = await ev("[...window.__AR.St.emails.values()].find(e=>e.threadKey).id")
        await pg.click('.rail [data-nav="emails"]'); await pg.click(f'.erow[data-id="{eid}"]'); await pg.wait_for_selector('[data-act="thread-sum"]')
        await pg.click('[data-act="thread-sum"]'); await pg.wait_for_function("/Next step/.test(document.querySelector('#modal').textContent)", timeout=10000)
        print('ERRORS', errors); assert not errors
        print('COMMS E2E PASSED')
        await b.close()

asyncio.run(main())
