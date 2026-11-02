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
    { date: '2026-10-22', from: 'Rania (Consultant)', kind: 'request', says: 'Asked me to answer the open CRS comments by Thursday' } ] };
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
        assert await ev("document.querySelector('#drawer .th-step.now .th-meta').textContent.includes('Rania Hassan')"), 'Now is this email (its own sender)'
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
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)

        # the canvas: one thread card under the topic, first email to latest reply
        await pg.click('.rail [data-nav="todo"]'); await pg.wait_for_timeout(700)
        cards = await ev("[...document.querySelectorAll('.mnode.thread')].map(n => [n.dataset.node, n.querySelectorAll('.thn-row').length])")
        print('THREAD CARDS', cards); assert cards and all(c[1] >= 1 for c in cards)
        conv = await ev(f"[...document.querySelectorAll('.mnode.thread')].find(n => n.dataset.node.endsWith(':{eid}')) ? 1 : 0")
        assert conv == 1, 'the conversation card of the CRS email is on the canvas'
        assert await ev("n => document.querySelectorAll(`.mnode.thread:not(.compact)[data-node$=':${n}']`).length", eid) == 1, 'shown whole once; the other topics get a one-line card'
        rows = await ev(f"[...document.querySelector('.mnode.thread:not(.compact)[data-node$=\":{eid}\"]').querySelectorAll('.thn-t')].map(x => x.textContent)")
        print('CARD ROWS', rows); assert rows[0].startswith('Me') and 'answer the open CRS' in rows[-1]

        # a later email with another subject that quotes the CRS email joins the same conversation and the card grows
        e0 = await ev(f"(e => ({{ date: e.date.slice(0, 10), subject: e.subject }}))(window.__AR.St.emails.get('{eid}'))")
        await ev("""async (e0) => { const db = await claude.use('db'); const St = window.__AR.St;
          await db.doc('data/users/' + St.uid + '/register/emails/eLATER').set({ id: 'eLATER', threadKey: 'sub:valve actuators — ip68 confirmation', subject: 'Valve actuators — IP68 confirmation', from: 'Mahmoud Sobeah <m.sobeah@contractor.example>', fromMe: true,
            date: '2026-10-27T09:00:00.000Z', importedAt: new Date().toISOString(), quoted: [{ from: 'Rania Hassan', date: e0.date, subject: e0.subject }],
            analysis: { summary: 'Confirmed IP68 actuators to the consultant and attached the revised CRS', tasks: [], updates: [], flags: [] }, reviewState: 'reviewed', attachments: [] }); }""", e0)
        await pg.wait_for_timeout(800)
        same = await ev(f"(() => {{ const c = window.__AR.St.emails.get('eLATER'); return !!c; }})()")
        assert same, 'stored'
        rows2 = await ev(f"[...document.querySelector('.mnode.thread:not(.compact)[data-node$=\":{eid}\"]').querySelectorAll('.thn-t')].map(x => x.textContent)")
        print('CARD ROWS AFTER REPLY', rows2); assert len(rows2) == len(rows) + 1 and 'Confirmed IP68' in rows2[-1], rows2
        assert await ev("document.querySelectorAll('.mnode.thread[data-node$=\":eLATER\"]').length") == 0, 'no second card: it joined the thread'
        # a row opens its email
        await pg.click(f'.mnode.thread:not(.compact)[data-node$=":{eid}"] .thn-list li.last .thn-row'); await pg.wait_for_selector('#drawer:not([hidden])')
        assert 'IP68 confirmation' in await pg.text_content('#drawer h2')
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'thread-canvas.png'))

        # tasks of the conversation sit inside its cards, not as separate boxes beside them
        inside = await ev("""[...document.querySelectorAll('.mnode.task')].map(t => { const r = t.getBoundingClientRect(); return [...document.querySelectorAll('.mnode.thread.holds')].some(c => { const q = c.getBoundingClientRect(); return r.left >= q.left && r.right <= q.right && r.top >= q.top && r.bottom <= q.bottom; }); })""")
        print('TASKS INSIDE CARDS', inside); assert inside and all(inside)
        # task → thread: ticking a task inside the card updates the card at once
        crs = await ev("[...window.__AR.St.tasks.values()].find(t => /CRS/.test(t.title)).id")
        await pg.click(f'.mnode.task[data-tid="{crs}"] .mtick'); await pg.wait_for_timeout(500)
        hdr = await ev(f"(n => n.closest('.mnode.thread').querySelector('.thn-ht small').textContent)(document.querySelector('.mnode.task[data-tid=\"{crs}\"]').parentElement.querySelector('.mnode.thread:not(.compact)'))")
        print('CARD AFTER TICK', hdr); assert '2 open' in hdr
        # a chip on a message picks its task
        await pg.click(f'.mnode.thread:not(.compact)[data-node$=":{eid}"] .thn-chip[data-tid="{crs}"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__AR.UI.mapSel") == crs and await ev(f"!!document.querySelector('.mnode.thread:not(.compact)[data-node$=\":{eid}\"] li.sel-src')"), 'message behind the selected task lit'
        # thread → task: a new reply that completes a task shows on that task and as ✓ on the reply's row
        t3 = await ev("[...window.__AR.St.tasks.values()].find(t => /anchor bolt/.test(t.title)).id")
        await ev("""async (tid) => { const db = await claude.use('db'); const St = window.__AR.St; const t = JSON.parse(JSON.stringify(St.tasks.get(tid)));
          t.status = 'done'; t.completedAt = new Date().toISOString(); t.emailIds = [...t.emailIds, 'eLATER']; t.history = [...(t.history || []), { at: t.completedAt, text: 'From email: completed by my email', emailId: 'eLATER' }];
          await db.doc('data/users/' + St.uid + '/register/tasks/' + tid).set(t); }""", t3)
        await pg.wait_for_timeout(800)
        chip = await ev(f"[...document.querySelectorAll('.mnode.thread:not(.compact)[data-node$=\":{eid}\"] li.last .thn-chip')].map(c => c.className + ' ' + c.textContent.trim())")
        print('REPLY CHIPS', chip); assert any('fx-done' in c and 'T-0003' in c for c in chip), chip
        assert await ev(f"document.querySelector('.mnode.task[data-tid=\"{t3}\"]').classList.contains('done')"), 'the task shows done'
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('THREAD E2E PASSED'); await b.close()

asyncio.run(main())
