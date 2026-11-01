"""Money — Tell the canvas as the canvas's agent. Said in plain words, it understands, plans and carries out changes on
the canvas itself: a box of your recurring payments; your latest transactions as a table; "make it only money out,
by category, as bars" (it remembers what "it" is); "put it under liabilities"; a new category with transactions moved
into it (and new ones too); a card renamed, a card hidden; a view switched. Everything it sends is checked — nothing
is run as code, text is shown as text — and Undo puts it back."""
import asyncio, os, sys, json, subprocess
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'finfx2'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
# Claude stand-in for the canvas's agent: it reads the canvas and the conversation it is given, like the real one
AI = """
let g; Object.defineProperty(window, '__mockAnswer', { configurable: true, get() { return g; }, set(v) { g = function (p) {
  if (/^You update a personal finance tool/.test(p)) {
    const ctx = JSON.parse(p.split('CURRENT RECORDS: ')[1].split('\\nRead the message')[0]), msg = (p.split('OWNER’S MESSAGE:\\n')[1] || '').toLowerCase();
    const cv = JSON.parse(p.split('THE CANVAS NOW: ')[1].split('\\nTo change the canvas')[0]);
    window.__lastCanvas = cv;
    const acct = re => ctx.accounts.find(a => re.test(a.number || '') || re.test(a.name || ''));
    if (/recurring payments/.test(msg)) return { canvas: [{ op: 'addBox', id: 'recurring', title: 'Recurring payments', icon: '🔁', branch: 'exp', show: { what: 'recurring', format: 'list' } }], reply: 'I added a Recurring payments box under Spending.' };
    if (/latest 5 transactions/.test(msg)) return { canvas: [{ op: 'addBox', id: 'latest', title: 'Latest transactions', icon: '🧾', branch: 'below', show: { what: 'transactions', limit: 5, format: 'table', columns: ['date', 'desc', 'amount'] } }], reply: 'Here are your latest five, as a table.' };
    if (/only money out/.test(msg)) { const b = cv.myBoxes.find(x => x.id === 'latest');   // "it" = the box made just before
      return b ? { canvas: [{ op: 'updateBox', id: b.id, title: 'Spending by category', show: { what: 'transactions', filter: { direction: 'out' }, group: 'category', format: 'bars', limit: 8 } }], reply: 'Changed it to money out, by category, as bars.' } : { reply: 'Which box?' }; }
    if (/under liabilities/.test(msg)) return { canvas: [{ op: 'updateBox', id: 'latest', branch: 'mm-liab' }], reply: 'Moved it under Liabilities.' };
    if (/subscriptions/.test(msg)) return { canvas: [{ op: 'category', action: 'create', name: 'Subscriptions', kind: 'expense' }, { op: 'recategorize', filter: { text: 'software', direction: 'out' }, to: 'Subscriptions', remember: true }], reply: 'Made Subscriptions and moved your software purchases into it.' };
    if (/rename my halan/.test(msg)) { const h = acct(/halan/i), a13 = acct(/0013$/); return { canvas: [{ op: 'renameCard', node: 'a:' + h.id, label: 'Halan BNPL' }, { op: 'hideCard', node: 'a:' + a13.id }], reply: 'Renamed Halan and hid the 0013 account.' }; }
    if (/rich dad/.test(msg)) return { canvas: [{ op: 'view', mode: 'rich' }], reply: 'Here is the statement view.' };
    if (/note/.test(msg)) return { canvas: [{ op: 'addBox', id: 'plan', title: '<img src=x onerror="window.__xss=1">Plan', branch: 'below', note: '<script>window.__xss=2</script>Save first, then buy.', show: { what: 'text' } }, { op: 'runCode', code: 'window.__xss=3' }, { op: 'addBox', id: 'x', show: { what: 'eval("1")', format: 'html' } }], reply: 'Noted.' };
    return { reply: 'Read.' };
  }
  if (/^You keep a personal finance ledger in order/.test(p)) {
    const ctx = JSON.parse(p.split('CONTEXT: ')[1].split('\\nReturn JSON only')[0]);
    return { decisions: ctx.items.map(it => ({ id: it.id, how: it.kind === 'deposit' ? 'income' : it.kind === 'unreadable' ? 'ignore' : it.kind === 'note' ? 'noted' : 'keep', why: 'fine' })) };
  }
  return v(p); }; } });
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); await cx.add_init_script(AI)
        pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('dialog', lambda d: (errors.append('DIALOG ' + d.message), asyncio.ensure_future(d.dismiss())))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        U = "window.__AR.UI.fin"
        async def idle():
            calm = 0
            for _ in range(300):
                await pg.wait_for_timeout(150)
                calm = calm + 1 if await ev(f"!{U}.talk.busy && !{U}.fixing && !{U}.autoQ") else 0
                if calm >= 4: return
        async def say(text, files=()):
            if files: await pg.set_input_files('input[data-chg="fin-talk-files"]', list(files))
            await pg.fill('#fin-talk-in', text); await pg.click('[data-act="fin-talk-send"]'); await pg.wait_for_timeout(200); await idle(); await pg.wait_for_timeout(300)
            return (await ev("window.__FIN.talk()"))[-1]
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)
        await say('my statements', [f('CARD_AUG.pdf'), f('CARD_SEP.pdf'), f('primary_0012.csv'), f('nbe statement 013.csv')])
        n_tx = await ev("window.__FIN.tx().length"); print('TX', n_tx); assert n_tx > 10

        # 1. a box of my recurring payments, under Spending
        m = await say('add a box for my recurring payments'); print('M1', m.get('reply'), m.get('done'))
        assert any('Recurring payments' in d for d in m['done']) and m['undoable']
        assert await ev("!!document.querySelector('.fin-room.box[data-room=\"box:recurring\"]')"), 'the box is on the canvas'
        assert (await ev("window.__prompts.filter(p => /^You update a personal finance tool/.test(p.prompt)).pop().tier")) == 'complex', 'the most capable model when you write'
        rows = await ev("window.__FIN.boxRows('recurring')"); print('RECURRING', rows[:3])
        det = await ev("document.querySelector('.fin-det[data-det=\"box:recurring\"]').textContent")
        assert (all(r['label'] in det for r in rows) and rows) or 'Nothing matches yet' in det, 'it shows the recurring payments found in the records'

        # 2. my latest five transactions, as a table
        m = await say('show my latest 5 transactions as a table with date, description and amount'); print('M2', m.get('reply'))
        heads = await ev("[...document.querySelectorAll('.fin-det[data-det=\"box:latest\"] th')].map(t => t.textContent)")
        trs = await ev("[...document.querySelectorAll('.fin-det[data-det=\"box:latest\"] tbody tr')].map(r => [...r.cells].map(c => c.textContent))")
        print('TABLE', heads, trs[:2]); assert heads == ['Date', 'Description', 'Amount'] and len(trs) == 5, 'five rows, the asked columns'
        newest = await ev("window.__FIN.tx().filter(t => typeof t.amount === 'number' && t.date).map(t => t.date).sort().reverse().slice(0, 5)")
        dates = await ev("window.__FIN.boxRows('latest').map(r => r.cells.date)"); assert len(dates) == 5
        assert await ev(f"window.__FIN.tx().filter(t => typeof t.amount === 'number' && t.date).sort((a, b) => b.date.localeCompare(a.date))[0].date") == newest[0], 'newest first'

        # 3. "make it only money out, by category, as bars" — it knows what "it" is from the conversation
        m = await say('make it only money out, by category, as bars'); print('M3', m.get('reply'), m.get('done'))
        cv = await ev("window.__lastCanvas"); assert any(x.get('you', '').startswith('show my latest 5') for x in cv['conversationSoFar']), 'the conversation so far went with the message'
        assert await ev("window.__FIN.canvas().boxes.length") == 2, 'the same box changed, not a new one'
        bars = await ev("window.__FIN.boxRows('latest')"); print('BARS', bars[:4])
        assert bars and all(r['amount'] < 0 for r in bars) and await ev("document.querySelectorAll('.fin-det[data-det=\"box:latest\"] .fin-box-bars > div').length") == len(bars)
        assert await ev("document.querySelector('.fin-room[data-room=\"box:latest\"] .fin-room-t b').textContent") == 'Spending by category'

        # 4. "put it under liabilities"
        await say('put it under liabilities')
        P = await ev("Object.fromEntries(['free', 'mm-liab', 'box:latest'].map(id => [id, window.__AR.UI.fin.cvPos.get(id)]))")
        assert P['box:latest']['x'] >= P['free']['x'] + P['free']['w'] and P['box:latest']['y'] > P['mm-liab']['y'], 'hung under Liabilities, on the money-out side'
        await ev("window.__FIN.show('box:latest')"); await pg.wait_for_timeout(500); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-agent-box.png'))

        # 5. a new category, transactions moved into it, and new ones too
        m = await say('create a category Subscriptions and put my software purchases in it — new ones too'); print('M5', m.get('done'))
        sub = await ev("window.__FIN.prefs().cats.find(c => c.name === 'Subscriptions')"); assert sub, 'the category exists'
        sw = await ev("window.__FIN.tx().filter(t => /software/i.test(t.desc || '') && t.amount < 0).map(t => t.cat)"); print('SOFTWARE', sw)
        assert sw and all(c == sub['id'] for c in sw), 'moved'
        assert await ev(f"window.__FIN.prefs().rules.some(r => r.match === 'software' && r.cat === '{sub['id']}')"), 'and new ones will be too'

        # 6. rename a card, hide another; Undo puts them back
        h = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'bnpl').id"); a13 = await ev("window.__FIN.prefs().accounts.find(a => /0013$/.test(a.number || '')).id")
        m = await say('rename my halan card to Halan BNPL and hide the 0013 account')
        assert await ev(f"document.querySelector('.fin-leaf[data-node=\"a:{h}\"] b').textContent") == 'Halan BNPL'
        assert not await ev(f"!!document.querySelector('.fin-leaf[data-node=\"a:{a13}\"]')"), 'hidden'
        await pg.click('#fin-talk-feed .fin-msg:last-child [data-act="fin-talk-undo"]'); await pg.wait_for_timeout(400)
        assert await ev(f"!!document.querySelector('.fin-leaf[data-node=\"a:{a13}\"]')") and await ev(f"document.querySelector('.fin-leaf[data-node=\"a:{h}\"] b').textContent") != 'Halan BNPL', 'Undo puts them back'

        # 7. a view, by asking
        await say('show me the rich dad view'); await pg.wait_for_timeout(1200)
        assert await ev("window.__FIN.mode()") == 'rich' and await ev("!!document.querySelector('.fin-room.box[data-room=\"box:latest\"]')"), 'your boxes are in every view'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-agent-rich.png'))
        await ev("window.__FIN.mode('flow')"); await pg.wait_for_timeout(1100)
        assert await ev("!!document.querySelector('.fin-room.box[data-room=\"box:latest\"]')"), 'and in Flow'
        await ev("window.__FIN.mode('mind')"); await pg.wait_for_timeout(1100)

        # 8. nothing it sends is run: markup is shown as text, unknown operations and shapes are left out
        m = await say('add a note about my plan'); print('M8', m.get('done'), m.get('notes'))
        txt = await ev("document.querySelector('.fin-room[data-room=\"box:plan\"]').textContent + document.querySelector('.fin-det[data-det=\"box:plan\"]').textContent")
        assert '<img' in txt and '<script>' in txt and 'Save first, then buy.' in txt, txt
        assert not await ev("!!document.querySelector('.fin-room[data-room=\"box:plan\"] img, .fin-room[data-room=\"box:plan\"] script, .fin-det[data-det=\"box:plan\"] img, .fin-det[data-det=\"box:plan\"] script')") and not await ev("window.__xss"), 'shown as text, never run'
        assert await ev("window.__FIN.canvas().boxes.find(b => b.id === 'x').show.what") == 'transactions', 'an unknown shape falls back to a safe one'

        # 9. a box goes with its ✕ (and Undo)
        await ev("window.__FIN.show('box:recurring')"); await pg.wait_for_timeout(400)
        await pg.click('.fin-room[data-room="box:recurring"] [data-act="fin-box-del"]'); await pg.wait_for_timeout(300)
        assert not await ev("window.__FIN.canvas().boxes.some(b => b.id === 'recurring')")
        bad = [e for e in errors if 'PAGEERROR' in e or 'DIALOG' in e]; assert not bad, bad
        print('AGENT E2E PASSED'); await b.close()

asyncio.run(main())
