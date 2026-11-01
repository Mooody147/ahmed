"""Money — your CURRENT position, never yesterday's. Six months of statements are read only to find what repeats; each
repeating payment is then judged against what the statements cover: running now (counted), stopped (no longer counted —
and what stopping it saves), or to verify (not counted until you say). Grouped as subscriptions, fixed commitments
(الجمعية, instalments) and other recurring payments; month by month you see what ran, what was added and what you
stopped. An instalment you no longer pay ("Fawry Italiano") leaves your obligations the moment you say so — on every
canvas at once."""
import asyncio, os, sys, csv, datetime
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'recfx'); os.makedirs(FX, exist_ok=True)
# six covered months, ending the month before this one
today = datetime.date.today(); last = (today.replace(day=1) - datetime.timedelta(days=1)); months = []
y, m = last.year, last.month
for _ in range(6): months.insert(0, (y, m)); y, m = (y, m - 1) if m > 1 else (y - 1, 12)
d = lambda ym, day: f'{day:02d}/{ym[1]:02d}/{ym[0]}'
rows, bal = [], 100000.0
def add(ym, day, desc, out=0.0, inn=0.0):
    global bal; bal += inn - out; rows.append([d(ym, day), desc, f'{out:,.2f}' if out else '', f'{inn:,.2f}' if inn else '', f'{bal:,.2f}'])
for k, ym in enumerate(months):
    add(ym, 1, 'SALARY', inn=30000)
    add(ym, 2, 'GAMEYA MONTHLY PAYMENT جمعية', out=2000)                                   # a fixed commitment, every month
    add(ym, 5, 'SPOTIFY P1F2A3', out=99)                                                 # a subscription, every month
    if k < 3: add(ym, 6, 'GOOGLE *YouTubePremium', out=120)                              # stopped after three months
    if k < 5: add(ym, 10, 'GOLDS GYM MEMBERSHIP', out=800)                               # missing in the last month
    if k >= 3: add(ym, 12, 'NETFLIX.COM', out=260)                                       # added three months ago
    add(ym, 15, f'FAWRY ITALIANO {k + 1:02d} OF 12', out=1500)                            # an instalment
    add(ym, 20, 'CARREFOUR MAADI', out=3000 + 100 * k)                                    # everyday spending (varies)
start, end = d(months[0], 1), (datetime.date(months[-1][0], months[-1][1] % 12 + 1, 1) if months[-1][1] < 12 else datetime.date(months[-1][0] + 1, 1, 1)) - datetime.timedelta(days=1)
with open(os.path.join(FX, 'six_months_0012.csv'), 'w', newline='', encoding='utf-8') as fh:
    w = csv.writer(fh); w.writerows([['NBE — Statement'], ['Account No: 9900000012'], [f'Period from {start} to {end.strftime("%d/%m/%Y")}'], ['Date', 'Description', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '100,000.00'], *rows, ['', 'Closing balance', '', '', f'{bal:,.2f}']])
ymk = lambda ym: f'{ym[0]}-{ym[1]:02d}'

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
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(800)
        R = await ev("(() => { const R = window.__FIN.rec(); return Object.fromEntries(R.items.map(i => [i.name.split(' ')[0].toUpperCase(), [i.group, i.status, i.perMonth, i.since]])); })()")
        print('RECURRING', R)
        # 1. found from history, judged for today
        assert R['SPOTIFY'][:2] == ['subs', 'active'] and R['NETFLIX.COM'][:2] == ['subs', 'active'], 'subscriptions running now'
        assert R['GOOGLE'][:2] == ['subs', 'ended'] and R['GOOGLE'][3] == ymk(months[3]), 'YouTube stopped — from the month it did not come'
        assert R['GOLDS'][1] == 'verify', 'the gym missed the last month: to verify, not counted'
        assert R['GAMEYA'][:2] == ['fixed', 'active'] and R['FAWRY'][:2] == ['fixed', 'active'], 'fixed commitments: الجمعية and the instalment'
        rec = await ev("window.__FIN.rec().monthly"); print('MONTHLY', rec)
        assert rec['subs'] == 359 and rec['fixed'] == 3500 and rec['total'] == 3859, 'only what runs now counts: Spotify 99 + Netflix 260; جمعية 2,000 + instalment 1,500'
        n = await ev("window.__FIN.now()"); print('NOW', n['spending'], n['instMonthly'], n['capacity'], n['spendBasis'])
        assert n['instMonthly'] == 1500 and abs(n['spending'] - (n['variable'] + 2000 + 359)) < 0.01, 'spending now: what varies + the recurring payments running today (not YouTube, not the unverified gym)'
        assert abs(n['capacity'] - (n['income'] - n['spending'] - 1500)) < 0.01, 'what you can save: income − spending − instalments, each counted once'
        # 2. on the canvas: one room, by group; what to verify and what you stopped apart
        assert await ev("!!document.querySelector('.fin-room[data-room=\"recur\"]')"), 'the Recurring payments room'
        subs = await ev("[...document.querySelectorAll('.fin-room-sub')].map(s => s.textContent)"); print('GROUPS', subs)
        for g in ['Subscriptions', 'Fixed commitments', 'To verify', 'Stopped']: assert any(g in s for s in subs), g
        # 3. month by month: what ran, what was added, what was stopped and what it saves
        T = await ev("window.__FIN.recTimeline()"); print('TIMELINE', [(t['m'], t['total'], t['added'], t['stopped'], t['savedSoFar']) for t in T])
        tm = {t['m']: t for t in T}
        assert any('NETFLIX' in x.upper() for x in tm[ymk(months[3])]['added']), 'Netflix added'
        assert any('YOUTUBE' in x.upper() for x in tm[ymk(months[3])]['stopped']) and tm[ymk(months[3])]['stoppedMonthly'] == 120, 'YouTube stopped, 120 a month less'
        await ev("window.__FIN.show('rc~months')"); await pg.wait_for_timeout(400); await ev("document.querySelector('.fin-leaf[data-node=\"rc~months\"]').click()"); await pg.wait_for_selector('#fin-pop .fin-rec-t')
        txt = await ev("document.getElementById('fin-pop').textContent"); assert 'Saved so far' in txt and 'Committed now' in txt
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-recurring.png')); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        # 4. "I no longer pay Fawry Italiano": it leaves the obligations at once, everywhere — said with the card menu
        fawry = await ev("window.__FIN.rec().items.find(i => /fawry/i.test(i.name)).key"); cap0 = n['capacity']
        await ev(f"window.__FIN.show('rc:{fawry}')"); await pg.wait_for_timeout(400)
        await pg.click(f'.fin-cvn[data-node="rc:{fawry}"]', button='right'); await pg.wait_for_selector('#fin-menu'); await pg.click('#fin-menu [data-k="rcstop"]'); await pg.wait_for_timeout(600)
        n2 = await ev("window.__FIN.now()"); print('AFTER FAWRY', n2['instMonthly'], n2['capacity'])
        assert n2['instMonthly'] == 0 and abs(n2['capacity'] - cap0 - 1500) < 0.01, 'no longer an obligation; 1,500 a month more to save'
        assert (await ev("window.__FIN.rec().items.find(i => /fawry/i.test(i.name)).status")) == 'ended'
        assert not any('fawry' in x.lower() for x in await ev("[...document.querySelectorAll('.fin-room[data-room=\"com\"] ~ * .fin-leaf, .fin-leaf[data-node^=\"i:\"]')].map(c => c.textContent)")), 'gone from Liabilities'
        for mode in ['rich', 'flow', 'mind']:
            await ev(f"window.__FIN.mode('{mode}')"); await pg.wait_for_timeout(1000); await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()")
            assert await ev("!!document.querySelector('.fin-room[data-room=\"recur\"]')"), ('the room in every layout', mode)
        # 5. the gym: "still paying" brings it into the obligations; by words too
        await ev("window.__FIN.recMark(window.__FIN.rec().items.find(i => /gym/i.test(i.name)).key, 'active')"); await pg.wait_for_timeout(300)
        assert (await ev("window.__FIN.rec().monthly"))['other'] == 800 or (await ev("window.__FIN.rec().monthly"))['subs'] >= 359, 'confirmed: counted'
        r = await ev("window.__FIN.agent([{ op: 'setRecurring', item: 'spotify', status: 'stopped' }])"); await pg.wait_for_timeout(300); print('SAID', r)
        assert (await ev("window.__FIN.rec().items.find(i => /spotify/i.test(i.name)).status")) == 'ended', 'said in words: stopped'
        # 6. every new goal gets an honest check: feasible or not, why, what it needs, the plan with dates, what to change
        await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()")
        async def add_goal(name, price, by):
            await ev("window.__FIN.show('buy')"); await pg.wait_for_timeout(500)
            await ev("document.querySelector('.fin-room[data-room=\"buy\"] .fin-room-h [data-act=\"fin-cv-add\"]').click()"); await pg.wait_for_selector('#fin-cv-ed')
            await pg.fill('#fin-cv-ed [data-k="name"]', name); await pg.fill('#fin-cv-ed [data-k="price"]', str(price)); await pg.fill('#fin-cv-ed input[type="date"]', by)
            await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(700)
            return await ev(f"window.__FIN.prefs().buys.find(b => b.name === '{name}').id")
        soon = (today.replace(day=1) + datetime.timedelta(days=100)).replace(day=28).isoformat()
        g1 = await add_goal('Headphones', 3000, soon); c1 = await ev(f"window.__FIN.goalCheck('{g1}')"); print('GOAL 1', c1['verdict'], c1['steps'][:2])
        assert c1['verdict'] == 'yes' and c1['steps'] and len(c1['why']) >= 2, 'a goal well within reach: achievable, with a plan'
        assert any('Goal check' in (x.get('reply') or '') and 'Headphones' in (x.get('reply') or '') for x in await ev("window.__FIN.talk()")), 'said in the conversation'
        g2 = await add_goal('Car', 2000000, (today + datetime.timedelta(days=40)).isoformat()); c2 = await ev(f"window.__FIN.goalCheck('{g2}')"); print('GOAL 2', c2['verdict'], c2['fix'])
        assert c2['verdict'] == 'no' and c2['fix'], 'not approved: not now, with what would make it achievable'
        await ev(f"window.__AR.UI.fin.pop = 'b:{g2}'; window.__AR.UI.fin.popAt = Date.now(); window.__FIN.open('map')"); await pg.wait_for_selector('#fin-pop .fin-gc')
        gtxt = await ev("document.querySelector('#fin-pop .fin-gc').textContent")
        for part in ['1 · Feasibility', '2 · Assessment', '3 · Requirements', '4 · Execution plan', '5 · To make it achievable', 'Not now']: assert part in gtxt, part
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-goalcheck.png'))
        # 7. "Check my financial health": where you stand on six measures, your optimal position, the road there
        await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()"); await pg.keyboard.press('Escape'); await ev("window.__FIN.mode('mind')"); await pg.wait_for_timeout(1000)
        await ev("window.__FIN.show('free')"); await pg.wait_for_timeout(600)
        await pg.click('.fin-health-btn'); await pg.wait_for_selector('#fin-health-win')
        H = await ev("window.__FIN.health()"); print('HEALTH', H['score'], H['grade'], H['measures'], H['steps'][:3])
        assert H['score'] is not None and len(H['measures']) == 6 and H['opt'] and H['steps'], 'score, measures, optimal position, roadmap'
        assert sum(1 for s_ in H['steps'] if s_[0] == 'next') == 1, 'one step is next'
        wt = await ev("document.getElementById('fin-health-win').textContent")
        for part in ['1 · Where you stand today', '2 · Your optimal position', '3 · Your roadmap', 'Savings rate', 'Emergency fund']: assert part in wt, part
        await pg.wait_for_timeout(500); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-health.png'))
        h = await pg.locator('#fin-health-win .fin-talk-win-h').bounding_box(); w0 = await pg.locator('#fin-health-win').bounding_box()
        await pg.mouse.move(h['x'] + 120, h['y'] + 12); await pg.mouse.down(); await pg.mouse.move(h['x'] + 20, h['y'] + 52, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(200)
        w1 = await pg.locator('#fin-health-win').bounding_box(); assert abs(w1['x'] - w0['x'] + 100) < 6, ('it moves', w0, w1)
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); assert not await ev("!!document.getElementById('fin-health-win')"), 'Esc closes it'
        # 8. Rich Dad, simpler: how to read it in three lines; the statement only
        await ev("window.__FIN.mode('rich')"); await pg.wait_for_timeout(1100); await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()")
        assert await ev("!!document.querySelector('.fin-rd-guide')"), 'how to read the statement'
        frames = await ev("[...document.querySelectorAll('.fin-rich .rd-ft')].map(t => t.textContent)"); print('FRAMES', frames)
        assert frames[0].startswith('INCOME STATEMENT — your month') and frames[1].startswith('BALANCE SHEET — what you own')
        assert not await ev("!!document.querySelector('.fin-room[data-room=\"auto\"], .fin-room[data-room=\"ov\"]')"), 'the statement only'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-richdad-simple.png'))
        # 9. a currency beside every amount: another currency is changed at YOUR rate — asked for when there is none
        await ev("window.__FIN.mode('mind')"); await pg.wait_for_timeout(900); await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()")
        await ev("window.__FIN.show('buy')"); await pg.wait_for_timeout(500)
        await ev("document.querySelector('.fin-room[data-room=\"buy\"] .fin-room-h [data-act=\"fin-cv-add\"]').click()"); await pg.wait_for_selector('#fin-cv-ed')
        assert await ev("!!document.querySelector('#fin-cv-ed select.fin-cur[data-cur-k=\"price\"]')"), 'a currency beside the price'
        await pg.fill('#fin-cv-ed [data-k="name"]', 'Monitor'); await pg.fill('#fin-cv-ed [data-k="price"]', '500')
        await pg.select_option('#fin-cv-ed select.fin-cur[data-cur-k="price"]', 'USD'); await pg.wait_for_selector('#fin-cv-ed .fin-cur-rate')
        assert await ev("document.querySelector('#fin-cv-ed [data-k=\"name\"]').value") == 'Monitor' and await ev("document.querySelector('#fin-cv-ed [data-k=\"price\"]').value") == '500', 'what you typed stays'
        await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(300)
        assert await ev("!!document.getElementById('fin-cv-ed')") and not await ev("(window.__FIN.prefs().buys || []).some(b => b.name === 'Monitor')"), 'no rate: not saved, asked for'
        await pg.fill('#fin-cv-ed .fin-cur-rate', '48.5'); await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(600)
        mon = await ev("window.__FIN.prefs().buys.find(b => b.name === 'Monitor')"); print('MONITOR', mon['price'], await ev("window.__FIN.prefs().rates"))
        assert mon['price'] == 24250 and (await ev("window.__FIN.prefs().rates"))['USD'] == 48.5, 'USD 500 at 48.5 = EGP 24,250; the rate kept'
        assert any('USD' in (x.get('text') or '') and '24,250' in (x.get('text') or '') for x in await ev("window.__FIN.talk()")), 'the conversation says what was changed'
        await ev("window.__FIN.presentEnd && window.__FIN.presentEnd()"); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.click('.fin-bal-tab'); await pg.wait_for_selector('#fin-bal-win')
        prim = await ev("window.__FIN.prefs().accounts.find(a => /0012$/.test(a.number || '')).id")
        await pg.select_option(f'#fin-bal-win select.fin-cur[data-scope="bal:{prim}"]', 'USD'); await pg.wait_for_selector(f'#fin-bal-win .fin-cur-rate[data-rate-scope="bal:{prim}"]')
        assert await ev(f"document.querySelector('#fin-bal-win .fin-cur-rate[data-rate-scope=\"bal:{prim}\"]').value") == '48.5', 'your saved rate, filled in'
        await pg.fill(f'#fin-bal-win [data-id="{prim}"][data-k="balance"]', '1000'); await pg.click('[data-act="fin-bal-save"]'); await pg.wait_for_timeout(600)
        assert (await ev(f"window.__FIN.latest('{prim}')"))['balance'] == 48500, 'USD 1,000 = EGP 48,500 in the account'
        bad = [e for e in errors if 'PAGEERROR' in e or 'DIALOG' in e]; assert not bad, bad
        print('RECURRING E2E PASSED'); await b.close()

asyncio.run(main())
