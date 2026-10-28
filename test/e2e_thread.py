"""Thread history on the lite artifact: an added email shows its conversation oldest first (from Claude's reading of
the quoted history), with 📍 Now on this email and where things stand (open tasks, your action or waiting); it is
shown on the task and on the email. The quoted-header fallback is checked in the unit tests."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
from e2e_canvas_tools import setup

HIST = """
let f; Object.defineProperty(window, '__mockAnswer', { configurable: true, get() { return f; }, set(v) { f = function (p) { const r = v(p);
  if (r && r.tasks && /Valves spec CRS/.test(p)) r.thread = { first: '2026-10-12', last: '2026-10-26', messages: 3, history: [
    { date: '2026-10-12', from: 'me', kind: 'submission', says: 'Submitted valves spec ELM-ME-SPC-0031 Rev A for review' },
    { date: '2026-10-20', from: 'Hany (Consultant)', kind: 'comments', says: 'Returned the CRS: comments 2 and 3 still open' },
    { date: '2026-10-26', from: 'Ahmed (PM)', kind: 'request', says: 'Asked me to answer the open CRS comments by Thursday' } ] };
  return r; }; } });
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await setup(b, HIST); ev = pg.evaluate
        tid = await ev("[...window.__AR.St.tasks.values()].find(t => /CRS/.test(t.title)).id")
        await ev("document.getElementById('map-vp').focus()"); await pg.keyboard.press('v')
        await pg.click(f'.mnode.task[data-tid="{tid}"] .mtxt b'); await pg.wait_for_selector('#drawer .th-hist')
        await pg.click('#drawer .th-hist > summary'); await pg.wait_for_timeout(200)
        steps = await ev("[...document.querySelectorAll('#drawer .th-step:not(.th-next) .th-says')].map(x => x.textContent)")
        print('TASK THREAD', steps)
        assert steps[0].startswith('Submitted valves spec') and 'answer the open CRS' in steps[-1], steps
        assert await ev("document.querySelector('#drawer .th-step.now .th-meta').textContent.includes('Ahmed (PM)')"), 'Now is this email'
        assert await ev("document.querySelector('#drawer .th-step.me .th-meta b').textContent") == 'Me', 'my own message marked'
        stand = await ev("document.querySelector('#drawer .th-next').textContent")
        print('STANDS', ' '.join(stand.split())); assert 'Where it stands' in stand and 'your action' in stand
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)
        # on the email itself (open from Emails), open by default
        await pg.click('.rail [data-nav="emails"]'); await pg.wait_for_timeout(500)
        eid = await ev("[...window.__AR.St.emails.values()].find(e => e.analysis && e.analysis.thread && (e.analysis.thread.history || []).length).id")
        await ev(f"document.querySelector('[data-act=\"open-email\"][data-id=\"{eid}\"]').click()"); await pg.wait_for_selector('#drawer .th-hist[open]')
        n = await ev("document.querySelectorAll('#drawer .th-step:not(.th-next)').length"); print('EMAIL THREAD steps', n); assert n == 3
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'thread.png'))
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('THREAD E2E PASSED'); await b.close()

asyncio.run(main())
