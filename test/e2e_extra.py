"""Money — "Additional expenses": at most one box a month, open from the 1st. A balance lower than the transactions
explain adds the difference to the month's box (no question, no new line each time); a second lower balance grows the
same box. You say where it went, split across categories (or "moved between my accounts", not spending); what you leave
stays "not explained yet". At the bottom of the box: every account's net balance now, and the total."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'monthfx', 'six_months_0012.csv')   # written by e2e_month.py

async def main():
    assert os.path.exists(FX), 'run e2e_month.py first (it writes the statement)'
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(500)
        await ev("window.__FIN.open('import')"); await pg.wait_for_timeout(200); await pg.click('[data-act="fin-kind"][data-k="current"]'); await pg.set_input_files('input[data-chg="fin-files"]', [FX])
        for _ in range(100):
            if await ev("(window.__AR.UI.fin.queue || []).length && window.__AR.UI.fin.queue.every(q => ['done', 'error'].includes(q.state))"): break
            await pg.wait_for_timeout(200)
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(1000)
        prim = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'current' && a.number && a.number.endsWith('0012')).id")
        close = await ev(f"window.__FIN.latest('{prim}').balance")
        # 0. from the 1st, the box is there — empty
        assert await ev("!!document.querySelector('.fin-room[data-room=\"xe\"]')") and await ev("window.__FIN.xe()") is None, 'the month’s box, empty until a balance is lower'
        qs0 = len(await ev("window.__FIN.questions()"))
        async def balance(v):
            await pg.click('.fin-bal-tab'); await pg.wait_for_selector('#fin-bal-win')
            await pg.fill(f'#fin-bal-win [data-id="{prim}"][data-k="balance"]', str(v)); await pg.click('[data-act="fin-bal-save"]'); await pg.wait_for_timeout(900)
        # 1. a lower balance: the difference goes to the box — no question
        await balance(close - 2000)
        X = await ev("window.__FIN.xe()"); print('BOX 1', X)
        assert X and X['total'] == 2000 and X['open'] == 2000 and len(X['drops']) == 1, 'EGP 2,000 lower → 2,000 in the box, not explained yet'
        assert len(await ev("window.__FIN.questions()")) == qs0, 'no question asked: the box holds it'
        # 2. lower again the same month: the SAME box grows (one box a month)
        await balance(close - 2500)
        X = await ev("window.__FIN.xe()"); print('BOX 2', X)
        assert X['total'] == 2500 and len(X['drops']) == 2 and await ev("window.__FIN.xeAll().length") == 1, 'one box: 2,000 + 500'
        # 3. explain it: groceries 1,000 + moved to my other account 800; 700 left open
        await ev("window.__FIN.show('xe')"); await pg.wait_for_timeout(900)
        await ev("document.querySelector('.fin-det[data-det=\"xe\"] [data-act=\"fin-xe\"]').click()"); await pg.wait_for_selector('#fin-xe-win')
        await pg.select_option('#fin-xe-win [data-i="0"][data-k="cat"]', 'groceries'); await pg.fill('#fin-xe-win [data-i="0"][data-k="amount"]', '1000')
        assert '1,500' in await ev("document.getElementById('fin-xe-left').textContent"), 'what is left, as you type'
        await pg.click('[data-act="fin-xe-add"]'); await pg.wait_for_timeout(200)
        await pg.select_option('#fin-xe-win [data-i="1"][data-k="cat"]', 'transfer'); await pg.fill('#fin-xe-win [data-i="1"][data-k="amount"]', '800'); await pg.fill('#fin-xe-win [data-i="1"][data-k="note"]', 'to my savings')
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-extra-window.png'))
        await pg.click('[data-act="fin-xe-save"]'); await pg.wait_for_timeout(800)
        X = await ev("window.__FIN.xe()"); print('SPLIT', X)
        assert X['total'] == 2500 and X['open'] == 700 and ['groceries', 1000, False] in X['parts'] and ['transfer', 800, False] in X['parts'] and ['other_exp', 700, True] in X['parts'], 'split: groceries 1,000, moved 800, 700 not explained yet'
        cur = await ev("window.__FIN.month().start.slice(0, 7)")
        by = await ev(f"(() => {{ const a = window.__FIN.an({{ from: '{cur}-01', to: null, acctIds: null, catIds: null }}); return {{ groceries: (a.cats.groceries || {{}}).total || 0, other: (a.cats.other_exp || {{}}).total || 0 }}; }})()")
        print('THIS MONTH BY CATEGORY', by)
        assert by['groceries'] >= 1000 and by['other'] >= 700, 'every total follows: groceries and the open part counted as spending; the 800 moved is not spending'
        # too much is refused
        await ev("document.querySelector('.fin-det[data-det=\"xe\"] [data-act=\"fin-xe\"]').click()"); await pg.wait_for_selector('#fin-xe-win')
        await pg.fill('#fin-xe-win [data-i="0"][data-k="amount"]', '5000'); await pg.click('[data-act="fin-xe-save"]'); await pg.wait_for_timeout(400)
        assert (await ev("window.__FIN.xe()"))['open'] == 700, 'more than the box holds: not saved'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        # 4. at the bottom of the box: each account's net balance now, and the total
        acc = await ev("""(() => { const l = document.querySelector('.fin-det[data-det="xe"] .fin-xe-accts'); return { rows: [...l.querySelectorAll(':scope > div:not(.tot)')].map(d => d.textContent.replace(/\\s+/g, ' ').trim()), tot: l.querySelector('.tot').textContent.replace(/\\s+/g, ' ').trim(), last: l === [...document.querySelectorAll('.fin-det[data-det="xe"] .fin-xe > *')].filter(e => e.matches('.fin-box-list, div')).pop() }; })()""")
        print('ACCOUNTS', acc)
        want = f"{close - 2500:,.0f}"
        assert any(want in r for r in acc['rows']) and 'Net across your accounts' in acc['tot'], 'the account at its new balance, and the net total'
        await ev("window.__FIN.show('xe')"); await pg.wait_for_timeout(900); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-extra-box.png'))
        # 5. Undo takes the explanation back
        await ev("[...document.querySelectorAll('[data-act=\"fin-talk-undo\"]')].pop().click()"); await pg.wait_for_timeout(700)
        assert (await ev("window.__FIN.xe()"))['open'] == 2500, 'Undo: back to 2,500 not explained yet'
        await b.close()
        if errors: print('\n'.join(errors)); sys.exit(1)
        print('EXTRA OK')
if __name__ == '__main__': asyncio.run(main())
