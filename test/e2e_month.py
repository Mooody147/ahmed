"""Money — "How can I manage the rest of this month?". Six months of statements teach what the remaining days of a month
usually cost; the balances say what you have; the recurring payments running today, the instalments and the expected
salary are the dated facts still to come. The section shows what you can spend a day and keep your reserve, the month
end, the lowest point, a week-by-week plan, where to hold back and what to do — on the Mind map, Rich Dad and Flow —
and it follows a new balance at once."""
import asyncio, os, sys, csv, datetime
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'monthfx'); os.makedirs(FX, exist_ok=True)
today = datetime.date.today(); last = (today.replace(day=1) - datetime.timedelta(days=1)); months = []
y, m = last.year, last.month
for _ in range(6): months.insert(0, (y, m)); y, m = (y, m - 1) if m > 1 else (y - 1, 12)
d = lambda ym, day: f'{day:02d}/{ym[1]:02d}/{ym[0]}'
rows, bal = [], 100000.0
def add(ym, day, desc, out=0.0, inn=0.0):
    global bal; bal += inn - out; rows.append([d(ym, day), desc, f'{out:,.2f}' if out else '', f'{inn:,.2f}' if inn else '', f'{bal:,.2f}'])
for k, ym in enumerate(months):
    add(ym, 1, 'SALARY', inn=30000)
    add(ym, 2, 'GAMEYA MONTHLY PAYMENT جمعية', out=2000)
    add(ym, 5, 'SPOTIFY P1F2A3', out=99)
    if k < 3: add(ym, 6, 'GOOGLE *YouTubePremium', out=120)                 # stopped: not a bill any more
    add(ym, 15, f'FAWRY ITALIANO {k + 1:02d} OF 12', out=1500)               # an instalment: a bill on its date
    for day in (3, 8, 13, 18, 23, 28): add(ym, day, f'UBER TRIP {day}', out=150)   # everyday spending, through the month
    add(ym, 20, 'CARREFOUR MAADI', out=3000 + 100 * k)                       # everyday spending that varies
    add(ym, 26, 'CERTIFICATE INTEREST', inn=1000)                              # other income: stays when you state your salary
start, end = d(months[0], 1), (datetime.date(months[-1][0], months[-1][1] % 12 + 1, 1) if months[-1][1] < 12 else datetime.date(months[-1][0] + 1, 1, 1)) - datetime.timedelta(days=1)
with open(os.path.join(FX, 'six_months_0012.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh); w.writerows([['NBE — Statement'], ['Account No: 9900000012'], [f'Period from {start} to {end.strftime("%d/%m/%Y")}'], ['Date', 'Description', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '100,000.00'], *rows, ['', 'Closing balance', '', '', f'{bal:,.2f}']])
close = round(bal, 2)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(500)
        await ev("window.__FIN.open('import')"); await pg.wait_for_timeout(200); await pg.click('[data-act="fin-kind"][data-k="current"]'); await pg.set_input_files('input[data-chg="fin-files"]', [os.path.join(FX, 'six_months_0012.csv')])
        for _ in range(100):
            if await ev("(window.__AR.UI.fin.queue || []).length && window.__AR.UI.fin.queue.every(q => ['done', 'error'].includes(q.state))"): break
            await pg.wait_for_timeout(200)
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(1000)
        M = await ev("window.__FIN.month()"); print('MONTH', {k: M[k] for k in ['start', 'asOf', 'leftDays', 'gapDays', 'months', 'cash', 'income', 'bills', 'expected', 'usualFromToday', 'endBal', 'perDay', 'verdict', 'need']})
        print('EVENTS', M['events'])
        # 1. the facts: the money from the statement, and only what is still due this month
        assert M['cash'] == close and M['asOf'] == end.isoformat(), 'money now: the closing balance, as of the statement end'
        assert M['start'] == today.replace(day=1).isoformat() and M['months'] == 6, 'the rest of the month starts the day after the statement; six complete months to learn from'
        labels = ' '.join(e[2].upper() for e in M['events'])
        for want in ['GAMEYA', 'SPOTIFY', 'FAWRY']: assert want in labels, f'{want}: still due this month'
        for gone in ['GOOGLE', 'CARREFOUR', 'UBER']: assert gone not in labels, f'{gone}: not a bill (stopped, or everyday spending)'
        assert any(e[1] == 'income' and 'SALARY' in e[2].upper() for e in M['events']), 'the salary is expected on its day'
        assert any(e[1] == 'income' and 'CERTIFICATE' in e[2].upper() and e[3] == 1000 for e in M['events']), 'and the certificate interest on the 26th'
        assert abs(M['bills'] - (2000 + 99 + 1500)) < 0.01, 'bills: الجمعية + Spotify + the instalment, once each'
        # 2. the estimate: the whole month's everyday spending (Uber 900 + Carrefour 3,000…3,500), the median month
        assert M['expected'] == 4150, 'what the days left usually cost: the median of your months (recurring payments and instalments taken out)'
        assert abs(M['endBal'] - (M['cash'] + M['income'] - M['bills'] - M['expected'])) < 0.01, 'the month end = money now + still coming in − bills − usual spending'
        assert M['verdict'] == 'ok' and M['perDay'] > 0, 'plenty of money: you can manage the month'
        # 3. on every canvas
        for mode in ['mind', 'rich', 'flow']:
            await ev(f"window.__FIN.mode('{mode}')"); await pg.wait_for_timeout(900)
            assert await ev("!!document.querySelector('.fin-det[data-det=\"month\"] .fin-mo')"), f'{mode}: the section is on the canvas'
            assert await ev("document.querySelector('.fin-room[data-room=\"month\"] .fin-room-t b').textContent") == 'How can I manage the rest of this month?'
            await ev("window.__FIN.show('month')"); await pg.wait_for_timeout(1300); await pg.screenshot(path=os.path.join(HERE, 'shots', f'finance-month-{mode}.png'))
        await ev("window.__FIN.mode('mind')"); await pg.wait_for_timeout(900)
        room = await ev("""(() => { const r = document.querySelector('.fin-det[data-det="month"]'), rm = document.querySelector('.fin-room[data-room="month"]'); return { tiles: r.querySelectorAll('.fin-mo-k > button').length, chart: !!r.querySelector('.fin-mo-chart svg'), todo: r.querySelectorAll('.fin-mo-do li').length, weeks: r.querySelectorAll('.fin-mo-wk tbody tr').length, head: r.querySelector('.fin-mo-top b').textContent, del: !!rm.querySelector('[data-act="fin-box-del"]'), basis: r.querySelector('.fin-mo-basis').textContent }; })()""")
        print('ROOM', room)
        assert room['tiles'] == 6 and room['chart'] and room['todo'] >= 1 and room['weeks'] == 0, 'on the canvas: the numbers, the line, what to do (the details are behind the numbers)'
        assert room['head'] == 'You can manage the rest of the month' and not room['del'], 'a verdict at the top; the section cannot be removed like your own boxes'
        assert 'Facts:' in room['basis'] and 'Estimates:' in room['basis'], 'facts and estimates said apart'
        # mind map: under Assets (it starts from your money now); Spending keeps this month's additional expenses, then recurring payments
        order = await ev("(() => { const y = id => { const r = document.querySelector(`.fin-room[data-room=\"${id}\"]`); return r ? [parseFloat(r.style.left), parseFloat(r.style.top)] : null; }; return [y('mm-assets'), y('month'), y('exp'), y('xe'), y('recur')]; })()")
        assert order[0][0] == order[1][0] and order[0][1] < order[1][1], 'Mind map: the rest of this month hangs under Assets'
        assert order[2][1] < order[3][1] < order[4][1], 'under Spending: additional expenses, then recurring payments'
        # 4. each of the six numbers opens a window: where it comes from, and how it is worked out
        for k, want in [('cash', 'Money to live on now'), ('in', 'Still coming in'), ('bills', 'Bills still due'), ('usual', 'middle month'), ('end', 'End of'), ('day', 'Week by week')]:
            await ev(f"document.querySelector('.fin-det[data-det=\"month\"] [data-act=\"fin-mo-k\"][data-k=\"{k}\"]').click()"); await pg.wait_for_selector('#fin-mo-win')
            txt = await ev("window.__FIN.moWin()"); assert want in txt and '=' in txt, f'{k}: the window explains it — {txt[:200]}'
        assert 'GAMEYA' in (await ev("(document.querySelector('#fin-mo-win [data-k=\"bills\"]').click(), new Promise(r => setTimeout(() => r(window.__FIN.moWin()), 300)))")).upper(), 'bills: each one, with how it is known'
        usual = await ev("(document.querySelector('#fin-mo-win [data-k=\"usual\"]').click(), new Promise(r => setTimeout(() => r(window.__FIN.moWin()), 300)))")
        assert 'CARREFOUR' in usual.upper() and '4,150' in usual, 'usual spending: month by month, the middle one, and the biggest payments'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-month-window.png'))
        n0 = await ev("window.__FIN.now()")
        # 5. "my salary is now 32,000": from the Still coming in window — it replaces the pay alone; the interest stays
        await ev("document.querySelector('#fin-mo-win [data-k=\"in\"]').click()"); await pg.wait_for_timeout(300)
        await pg.click('#fin-mo-win [data-act="fin-cv-edit"][data-id="in:salary"]'); await pg.wait_for_selector('#fin-cv-ed')
        await pg.fill('#fin-cv-ed [data-k="amount"]', '32000'); await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(700)
        n2 = await ev("window.__FIN.now()"); M3 = await ev("window.__FIN.month()"); print('SALARY 32,000', n2['income'], n2['incomeBasis'], [e for e in M3['events'] if e[3] > 0])
        assert n2['income'] == n0['income'] + 2000 and 'Certificate Interest' in n2['incomeBasis'], 'income a month: 32,000 instead of 30,000 — the certificate interest from the statements (and the CIB share) still counted'
        inc = [e for e in M3['events'] if e[3] > 0]
        assert [e[3] for e in inc if 'CERTIFICATE' in e[2].upper()] == [1000] and sum(1 for e in inc if e[3] == 32000) == 1 and not any(e[3] == 30000 for e in inc), 'the salary at 32,000 once, the interest still expected'
        await ev("window.__AR.UI.fin.moWin = null"); await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(500)
        # 6. a new balance: the forecast follows at once (the Balances tab)
        prim = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'current' && a.number && a.number.endsWith('0012')).id")
        await pg.click('.fin-bal-tab'); await pg.wait_for_selector('#fin-bal-win')
        await pg.fill(f'#fin-bal-win [data-id="{prim}"][data-k="balance"]', '1000'); await pg.click('[data-act="fin-bal-save"]'); await pg.wait_for_timeout(900)
        M2 = await ev("window.__FIN.month()"); print('AFTER 1,000', {k: M2[k] for k in ['start', 'asOf', 'cash', 'income', 'bills', 'expected', 'usualFromToday', 'endBal', 'perDay', 'perDayAll', 'verdict', 'need', 'untilPay']}, M2['cuts'], M2['actions'])
        assert M2['cash'] == 1000 and M2['asOf'] == today.isoformat() and M2['start'] == today.isoformat(), 'from today’s balance, starting today'
        assert abs(M2['endBal'] - (1000 + M2['income'] - M2['bills'] - M2['expected'])) < 0.01, 'the month end follows the new balance'
        want = 'short' if (M2['endBal'] < 0 or M2['lowPoint']['bal'] < 0) else 'tight' if M2['endBal'] < (await ev("window.__FIN.now().reserve")) else 'ok'
        assert M2['verdict'] == want, 'the verdict follows the numbers'
        room2 = await ev("""(() => { const r = document.querySelector('.fin-det[data-det="month"]'); return { head: r.querySelector('.fin-mo-top b').textContent, sum: document.querySelector('.fin-room[data-room="month"] .fin-room-t small').textContent, todo: [...r.querySelectorAll('.fin-mo-do li')].map(l => l.textContent) }; })()""")
        print('ROOM AFTER', room2)
        if want == 'short': assert room2['head'].startswith('Short by') and any(t.startswith('Find ') for t in room2['todo']), 'short: by how much, and what to find'
        assert '1,000' in (await ev("document.querySelector('.fin-det[data-det=\"month\"] .fin-mo-k > button').textContent")), 'money now shows the new balance'
        assert any('Spend at most' in t or 'Keep to about' in t or 'Find ' in t for t in room2['todo']), 'a daily limit, or what to find'
        await ev("window.__FIN.show('month')"); await pg.wait_for_timeout(1300); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-month-after.png'))
        await b.close()
        if errors: print('\n'.join(errors)); sys.exit(1)
        print('MONTH OK')
if __name__ == "__main__": asyncio.run(main())
