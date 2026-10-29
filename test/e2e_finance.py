"""Money tab on the lite artifact — the acceptance tests of the finance spec (1–17) and the final three-upload test:
a statement, the same statement again (nothing added), then a longer one (only the new months added, a corrected
line updated). Two bank accounts and a card; Ahmed's money kept apart; card payments and own transfers not counted
twice; numbers checked against hand calculations; filters, budgets, income growth, allocation, missing data,
currencies, backup/restore, reload, and forecasts labelled as estimates."""
import asyncio, os, sys, json, subprocess, datetime, calendar
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'finfx'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
# Claude stand-in for reading a photo of a statement (only used after the user presses "Read with Claude")
AI = """
window.__persist = true;
let g; Object.defineProperty(window, '__mockAnswer', { configurable: true, get() { return g; }, set(v) { g = function (p) {
  if (/^You are reading a bank or credit-card statement/.test(p)) return { account: '5566', currency: 'EGP', periodFrom: '01/09/2026', periodTo: '30/09/2026', opening: '9,450.00', closing: '9,200.00',
    rows: [{ date: '15/09/2026', description: 'SEOUDI MARKET', debit: '250.00', credit: null, balance: '9,200.00', ref: null, unclear: false }] };
  return v(p); }; } });
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); await cx.add_init_script(AI)
        pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200)
        sec = lambda s: pg.click(f'.fin-nav [data-s="{s}"]')
        async def tot(): return await ev("(() => { const t = window.__FIN.an({ from: null, to: null, acctIds: null, catIds: null }).totals; return [t.inc, t.exp, t.net]; })()")
        async def nw(): return await ev("window.__FIN.pos().net")
        async def importing(files, acct=None, new=None, kind=None, decide=None):
            await sec('import'); await pg.set_input_files('input[data-chg="fin-files"]', files); await pg.wait_for_selector('[data-act="fin-commit"]', timeout=20000)
            if acct: await pg.select_option('[data-chg="fin-imp-acct"]', label=acct); await pg.wait_for_timeout(200)
            if new:
                if await ev("document.querySelector('[data-chg=\"fin-imp-acct\"]').value") != '': await pg.select_option('[data-chg="fin-imp-acct"]', value=''); await pg.wait_for_timeout(200)
                await pg.fill('[data-chg="fin-na"][data-k="name"]', new); await pg.press('[data-chg="fin-na"][data-k="name"]', 'Tab'); await pg.wait_for_timeout(150)
                if kind: await pg.select_option('[data-chg="fin-na"][data-k="kind"]', kind); await pg.wait_for_timeout(200)
            chips = await ev("[...document.querySelectorAll('.fin-rev').length ? document.querySelectorAll('.fin-card .fin-chips .fin-chip') : []].map(c => c.textContent.trim())")
            if decide:
                for i, how in decide.items(): await pg.select_option(f'[data-chg="fin-decide"][data-i="{i}"]', how); await pg.wait_for_timeout(150)
            await pg.click('[data-act="fin-commit"]'); await pg.wait_for_selector('.fin-report'); await pg.wait_for_timeout(300)
            rep = await ev("window.__AR.UI.fin.report.counts"); return chips, rep

        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(300)
        assert await ev("!!document.querySelector('.fin-nav')"), 'Money is its own tab'
        assert await ev("document.querySelectorAll('.fin-nav button').length") == 11
        # the people and holdings you described (Ahmed, certificate, mother's deposit, the box, the offices)
        await sec('own'); await pg.click('[data-act="fin-template"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.prefs().holdings.length") == 6 and await ev("window.__FIN.prefs().parties[0].id") == 'ahmed'

        # 1–2. import a statement, review, save; it is in the ledger
        chips, rep = await importing([f('bankA_aug-sep.csv')], new='Bank A current')
        print('IMPORT 1', chips, rep)
        assert rep == {'reviewed': 16, 'added': 15, 'dup': 0, 'updated': 0, 'held': 0, 'incomplete': 1, 'skippedByYou': 0, 'notTransactions': 2}, rep
        await sec('ledger'); await pg.wait_for_timeout(200)
        assert await ev("document.querySelectorAll('.fin-ledger tbody tr').length") == 16, 'every line in the ledger, the unreadable one flagged'
        assert await ev("document.querySelectorAll('.fin-ledger tr.fin-incomplete').length") == 1
        before = await tot(); print('TOTALS 1', before)

        # 3. the exact same statement again: nothing added (idempotent)
        chips, rep = await importing([f('bankA_aug-sep (copy).csv')])
        print('IMPORT 2 (same)', rep)
        assert rep['added'] == 0 and rep['dup'] == 16 and rep['updated'] == 0 and rep['incomplete'] == 0, rep
        assert await tot() == before, 'income and expenses unchanged'
        assert await ev("window.__FIN.tx().length") == 16
        # the final acceptance test: the statement plus two more months, one line corrected
        chips, rep = await importing([f('bankA_aug-nov.csv')])
        print('IMPORT 3 (expanded)', rep)
        assert rep['added'] == 5 and rep['updated'] == 1 and rep['dup'] == 15 and rep['held'] == 0, rep
        assert await ev("window.__FIN.tx().length") == 21
        nf = await ev("window.__FIN.tx().find(t => t.ref === 'R104')")
        assert nf['desc'] == 'NETFLIX.COM SUBSCRIPTION' and any(h['f'] == 'desc' and h['from'] == 'NETFLIX.COM' for h in nf['hist']), 'corrected in place, the old wording kept in its history'
        assert len(nf['srcs']) == 1, 'the longer statement is listed as a second source (the identical copy adds none)'
        copy = await ev("window.__FIN.batches().find(b => b.file === 'bankA_aug-sep (copy).csv')")
        assert all(l['act'] == 'same' and l['id'] for l in copy['lines']), 'every skipped line of the copy points to the transaction it repeats'

        # 4. more accounts: bank B (Excel) and the card (PDF)
        chips, rep = await importing([f('bankB_aug-sep.xlsx')], new='Bank B current'); print('IMPORT B', rep); assert rep['added'] == 3
        chips, rep = await importing([f('card_aug.pdf')], new='Visa card', kind='credit_card'); print('IMPORT CARD', rep); assert rep['added'] == 3
        # 5. categories
        cats = await ev("Object.fromEntries(window.__FIN.tx().map(t => [t.ref || t.desc, t.cat]))")
        print('CATS', cats)
        for k, v in {'R100': 'salary', 'R101': 'groceries', 'R104': 'subs', 'R105': 'transfer', 'R106': 'ccpay', 'R107': 'held', 'R108': 'interest', 'R112': 'refund', 'INCOMING TRANSFER FROM A/C 1002003004': 'transfer', 'PAYMENT RECEIVED THANK YOU': 'ccpay', 'AMAZON EG': 'shopping', 'TALABAT': 'dining'}.items():
            assert cats[k] == v, (k, cats[k], v)
        assert await ev("window.__FIN.tx().find(t => t.ref === 'R112').rcat") == 'groceries', 'the refund reverses groceries'
        assert await ev("window.__FIN.tx().find(t => t.ref === 'R108').holding") == 'cd63', 'certificate return linked to the certificate'
        # Ahmed's cash withdrawal: you mark it as his money
        await sec('ledger'); await pg.fill('#fin-q', 'CASH WITHDRAWAL'); await pg.wait_for_timeout(500)
        await pg.click('.fin-ledger tbody input[data-chg="fin-sel"]'); await pg.wait_for_timeout(150)
        await pg.select_option('#fin-bulk-party', 'ahmed'); await pg.click('[data-act="fin-bulk-party"]'); await pg.wait_for_timeout(300)
        await pg.fill('#fin-q', ''); await pg.wait_for_timeout(400)
        # 6. nothing counted twice: income = 4 salaries + 3 certificate returns; expenses = 3,800 groceries (net of the
        #    200 refund) + 460 dining + 750 Netflix + 5,000 card purchase + 150 Uber + 400 Vodafone
        t = await tot(); print('TOTALS ALL', t)
        assert t == [122700, 10560, 112140], t
        third = await ev("window.__FIN.third()"); print('AHMED', third)
        assert third['in'] == 100000 and third['out'] == 60000 and third['held'] == 40000

        # 7. one category by hand: groceries 1,200 + 1,500 − 200 + 1,300 = 3,800 over Aug–Nov (4 months, 93 days)
        g = await ev("window.__FIN.an({ from: null, to: null, acctIds: null, catIds: null }).cats.groceries")
        print('GROCERIES', {k: g[k] for k in ['total', 'monthly', 'daily', 'peak', 'low', 'count', 'avgTx', 'share', 'annual']})
        assert [g['total'], g['monthly'], g['daily'], g['count'], g['avgTx'], g['annual']] == [3800, 950, 40.86, 3, 1266.67, 11400]
        assert g['peak'] == {'m': '2026-09', 'v': 1300} and g['low'] == {'m': '2026-11', 'v': 0}, 'peak September; November covered with no groceries = a real zero'
        assert abs(g['share'] - 35.98) < 0.01, '3,800 ÷ 10,560'
        await sec('exp'); await pg.wait_for_timeout(300)
        row = await ev("[...document.querySelectorAll('.fin-metrics tbody tr')].find(r => r.textContent.includes('Groceries')).textContent")
        assert '3,800' in row and '950' in row and '36%' in row, row
        # a chart month opens its transactions
        await sec('dash'); await pg.wait_for_timeout(300)
        await ev("document.querySelector('.fin-chart .hit[data-k=\"2026-09\"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))"); await pg.wait_for_selector('#drawer .fin-mini')
        n = await ev("document.querySelectorAll('#drawer .fin-mini-r').length"); print('SEPTEMBER DRILL', n); assert n == 6
        await pg.click('[data-act="close-drawer"] >> nth=0'); await pg.wait_for_timeout(200)

        # 8. a filter changes every number together
        k0 = await ev("document.querySelector('.fin-kpi').textContent")
        acctA = await ev("window.__FIN.prefs().accounts.find(a => a.name === 'Bank A current').id")
        await pg.select_option('[data-chg="fin-f"][data-k="acct"]', acctA); await pg.wait_for_timeout(300)
        exA = await ev("window.__FIN.an().totals.exp"); print('BANK A EXPENSES', exA)
        assert exA == 10560 - 5000 - 300 - 150 - 400, 'card and bank B left out'
        kpi = await ev("[...document.querySelectorAll('.fin-kpi')].find(k => k.textContent.startsWith('Total expenses')).textContent"); assert '4,710' in kpi, kpi
        await pg.click('[data-act="fin-f-reset"]'); await pg.wait_for_timeout(200)

        # 9. a transaction entered by hand updates the analysis (and 10. budgets)
        today = datetime.date.today().isoformat()
        await pg.click('[data-act="fin-new-tx"]'); await pg.wait_for_selector('#ft-amt')
        await pg.fill('#ft-amt', '700'); await pg.fill('#ft-desc', "GOLD'S GYM MEMBERSHIP"); await pg.fill('#ft-date', today); await pg.select_option('#ft-cat', 'fitness')
        await pg.select_option('#ft-acct', acctA); await pg.click('[data-act="fin-save-tx"]'); await pg.wait_for_timeout(400)
        assert (await tot())[1] == 10560 + 700
        await sec('budget'); await pg.wait_for_timeout(300)
        await pg.fill('[data-chg="fin-budget"][data-id="fitness"]', '1000'); await pg.press('[data-chg="fin-budget"][data-id="fitness"]', 'Tab'); await pg.wait_for_timeout(400)
        row = await ev("[...document.querySelectorAll('.fin-budget tbody tr')].find(r => r.textContent.includes('Gym')).textContent"); print('BUDGET ROW', ' '.join(row.split()))
        assert '300' in row and '70%' in row, 'budget 1,000, spent 700: 300 left, 70% used'

        # 11–12. income growth: a 10% raise from the 15th of next month, then a probable promotion
        nm = (datetime.date.today().replace(day=1) + datetime.timedelta(days=32)).replace(day=1)
        await sec('sim'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="fin-ch-add"]'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="fin-ch"][data-i="0"][data-k="value"]', '10'); await pg.press('[data-chg="fin-ch"][data-i="0"][data-k="value"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="fin-ch"][data-i="0"][data-k="date"]', nm.replace(day=15).isoformat()); await pg.wait_for_timeout(300)
        sim = await ev("window.__FIN.sim()"); ex = sim['scenarios']['expected']
        dim = calendar.monthrange(nm.year, nm.month)[1]
        first = next(r for r in ex['rows'] if r['m'] == nm.strftime('%Y-%m'))
        print('SIM', ex['current'], ex['projected'], first['recurInc'])
        assert ex['current'] == 30000 and ex['projected'] == 33000 and abs(first['recurInc'] - round(3000 * (dim - 14) / dim, 2)) < 0.01, 'partial first month'
        res = await ev("document.querySelector('.fin-card .fin-tbl').textContent"); assert '33,000' in res
        await pg.click('[data-act="fin-ch-add"]'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="fin-ch"][data-i="1"][data-k="value"]', '5'); await pg.press('[data-chg="fin-ch"][data-i="1"][data-k="value"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="fin-ch"][data-i="1"][data-k="date"]', (nm + datetime.timedelta(days=62)).replace(day=1).isoformat()); await pg.wait_for_timeout(200)
        await pg.select_option('[data-chg="fin-ch"][data-i="1"][data-k="status"]', 'probable'); await pg.wait_for_timeout(300)
        sim = await ev("window.__FIN.sim()"); sc = {k: v['projected'] for k, v in sim['scenarios'].items()}; print('SCENARIOS', sc)
        assert sc['conservative'] < sc['expected'] == sc['optimistic'] == 34650, sc

        # 13. allocation must total 100%; the goals share moves the goal date
        await sec('forecast'); await pg.click('[data-act="fin-goal-add"][data-k="emergency"]'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="fin-goal"][data-i="0"][data-k="target"]', '2000000'); await pg.press('[data-chg="fin-goal"][data-i="0"][data-k="target"]', 'Tab'); await pg.wait_for_timeout(300)
        await sec('sim'); await pg.wait_for_timeout(300)
        g1 = await ev("[...document.querySelectorAll('.fin-card li')].find(l => l.textContent.startsWith('Emergency fund:')).textContent")
        await pg.fill('[data-chg="fin-alloc"][data-i="1"][data-k="pct"]', '40'); await pg.press('[data-chg="fin-alloc"][data-i="1"][data-k="pct"]', 'Tab'); await pg.wait_for_timeout(300)
        assert 'must be 100%' in await pg.text_content('.fin-alloc') and await ev("!!document.body.textContent.includes('Results are hidden until the shares add up')")
        await pg.fill('[data-chg="fin-alloc"][data-i="0"][data-k="pct"]', '40'); await pg.press('[data-chg="fin-alloc"][data-i="0"][data-k="pct"]', 'Tab'); await pg.wait_for_timeout(300)
        g2 = await ev("[...document.querySelectorAll('.fin-card li')].find(l => l.textContent.startsWith('Emergency fund:')).textContent")
        print('GOAL', g1, '|', g2); assert g1 != g2, 'a bigger goals share brings the goal closer'

        # a line from another source that may be a repeat is held, not added; you decide
        acctB = await ev("window.__FIN.prefs().accounts.find(a => a.name === 'Bank B current').id")
        chips, rep = await importing([f('bankB_export.csv')], acct='Bank B current · EGP')
        print('OTHER SOURCE', rep); assert rep['held'] == 1 and rep['added'] == 1, rep
        await sec('import'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="fin-resolve"][data-how="same"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.tx().filter(t => /uber/i.test(t.desc)).length") == 1, 'the Uber ride is still once'
        # a photo needs Claude, and only when you ask
        await pg.set_input_files('input[data-chg="fin-files"]', [f('statement_photo.png')]); await pg.wait_for_selector('[data-act="fin-read-ai"]')
        stmt = "window.__prompts.filter(p => /^You are reading a bank or credit-card statement/.test(p.prompt))"
        assert await ev(stmt + ".length") == 0, 'nothing about the statement is sent before you press the button'
        await pg.click('[data-act="fin-read-ai"]'); await pg.wait_for_selector('[data-act="fin-commit"]', timeout=10000)
        assert await ev(stmt + ".length") == 1 and await ev(stmt + "[0].images") == 1, 'one request, with the photo'
        await pg.select_option('[data-chg="fin-imp-acct"]', label='Bank B current · EGP'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="fin-commit"]'); await pg.wait_for_selector('.fin-report')
        ai = await ev("window.__FIN.tx().find(t => /SEOUDI/.test(t.desc))"); assert ai and ai['review'] and 'read_by_claude' in ai['flags'], 'read by Claude: flagged to check'

        # 14. missing data, other currencies, accounts without balances
        await sec('accounts'); await pg.click('[data-act="fin-acct-add"]'); await pg.wait_for_timeout(200)
        i = await ev("window.__FIN.prefs().accounts.length - 1")
        await pg.fill(f'[data-chg="fin-acct"][data-i="{i}"][data-k="name"]', 'USD savings'); await pg.press(f'[data-chg="fin-acct"][data-i="{i}"][data-k="name"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.select_option(f'[data-chg="fin-acct"][data-i="{i}"][data-k="currency"]', 'USD'); await pg.wait_for_timeout(200)
        usd = await ev("window.__FIN.prefs().accounts.find(a => a.name === 'USD savings').id")
        await pg.click('[data-act="fin-new-tx"]'); await pg.wait_for_selector('#ft-amt'); await pg.select_option('#ft-acct', usd)
        await pg.fill('#ft-amt', '20'); await pg.fill('#ft-desc', 'APP STORE'); await pg.fill('#ft-date', '2026-09-20'); await pg.select_option('#ft-cat', 'subs'); await pg.click('[data-act="fin-save-tx"]'); await pg.wait_for_timeout(300)
        await sec('dash'); await pg.wait_for_timeout(300)
        notes = await pg.text_content('.fin-notes'); print('NOTES', ' '.join(notes.split()))
        assert 'in USD' in notes and 'no exchange rate' in notes and 'no readable date' in notes
        assert (await tot())[1] == 10560 + 700 + 220 + 250, 'pharmacy 220 and Seoudi 250 added; the USD one left out until a rate is given'
        await sec('own'); await pg.wait_for_timeout(200); assert 'USD savings: no balance yet' in await pg.text_content('#main')
        await sec('settings'); await pg.fill('[data-chg="fin-rate"][data-c="USD"]', '50'); await pg.press('[data-chg="fin-rate"][data-c="USD"]', 'Tab'); await pg.wait_for_timeout(300)
        assert (await tot())[1] == 10560 + 700 + 220 + 250 + 1000, 'with 1 USD = 50 EGP: + 1,000'

        # net worth: own money only; the box and Ahmed's 40,000 are not mine; the deposit at my mother's counted once
        pos = await ev("window.__FIN.pos()"); print('NET WORTH', pos['net'], [ (a['name'], a['amount']) for a in pos['assets']], pos['liabilities'])
        bankA = 162690; bankB = 9200; card = 0
        assert pos['net'] == bankA + bankB - 40000 + 63000 + 1380000 - card, pos['net']
        assert [x['id'] for x in pos['third']] == ['ahmed', 'box']

        # 17. forecasts are labelled
        await sec('forecast'); await pg.wait_for_timeout(300)
        assert 'Forecasts are estimates' in await pg.text_content('.fin-banner') and await ev("document.querySelectorAll('.fin-tbl .fin-est').length") >= 12
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-forecast.png'), full_page=True)
        await sec('dash'); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-dash.png'), full_page=True)

        # 16. reload: everything is still there
        n0, t0 = await ev("window.__FIN.tx().length"), await tot()
        await pg.reload(); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        assert await ev("window.__FIN.tx().length") == n0 and await tot() == t0, 'kept across a reload'

        # 15. backup and restore into an empty page
        await pg.click('[data-nav="finance"]'); await sec('settings'); await pg.click('[data-act="fin-backup"]'); await pg.wait_for_timeout(300)
        data = await ev("(() => { const k = Object.keys(window.__saveData).find(k => k.startsWith('money-backup')); return window.__saveData[k]; })()")
        bk = os.path.join(FX, 'backup.json'); open(bk, 'w').write(data)
        cx2 = await b.new_context(viewport={'width': 1400, 'height': 1000}); p2 = await cx2.new_page(); await p2.route('**/*', route)
        await p2.goto('https://app.test/'); await p2.wait_for_selector('h1'); await p2.wait_for_timeout(1200)
        await p2.click('[data-nav="finance"]'); await p2.click('.fin-nav [data-s="settings"]'); await p2.set_input_files('input[data-chg="fin-restore"]', bk); await p2.wait_for_selector('[data-act="fin-restore-go"]')
        p2.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await p2.click('[data-act="fin-restore-go"][data-how="replace"]'); await p2.wait_for_timeout(800)
        t2 = await p2.evaluate("(() => { const t = window.__FIN.an({ from: null, to: null, acctIds: null, catIds: null }).totals; return [t.inc, t.exp, t.net]; })()")
        print('RESTORED', await p2.evaluate("window.__FIN.tx().length"), t2)
        assert await p2.evaluate("window.__FIN.tx().length") == n0 and t2 == t0

        # the phone layout reaches Money from More
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(600)
        await pg.click('.ph-tab[data-k="more"]'); await pg.click('[data-act="ph-nav"][data-view="finance"]'); await pg.wait_for_selector('.fin-nav')
        assert await ev("document.documentElement.scrollWidth <= innerWidth + 1"), 'no sideways scrolling on a phone'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-phone.png'))
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('FINANCE E2E PASSED'); await b.close()

asyncio.run(main())
