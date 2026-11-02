"""Money: add expense and income, budgets, recurring salary, bank statement import (dd/mm, debit/credit, duplicates, AI sorting), receipt reading, expense claims, Excel export."""
import asyncio, os, sys, io, zipfile
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
        tx = lambda: ev("[...window.__AR.St.cols.money.values()]")
        await pg.click('.rail [data-nav="money"]'); await pg.wait_for_selector('.money')
        assert 'Start with what you earn' in await pg.text_content('.money')

        # an expense typed in; the category is guessed from the shop name
        await pg.click('[data-act="mon-new"][data-kind="expense"]'); await pg.wait_for_selector('.mon-form')
        await pg.fill('#mf-amount', '1,250.75'); await pg.fill('#mf-payee', 'Talabat order'); await pg.dispatch_event('#mf-payee', 'change')
        assert await pg.input_value('#mf-cat') == 'Eating out'
        await pg.click('[data-act="mon-save"]'); await pg.wait_for_timeout(200)
        t = await tx(); assert len(t) == 1 and t[0]['amount'] == 1250.75 and t[0]['category'] == 'Eating out' and t[0]['currency'] == 'EGP', t
        # income
        await pg.click('[data-act="mon-new"][data-kind="income"]'); await pg.fill('#mf-amount', '3000'); await pg.fill('#mf-payee', 'Design review side job'); await pg.fill('#mf-cat', 'Freelance / consulting'); await pg.click('[data-act="mon-save"]'); await pg.wait_for_timeout(200)
        # a work expense in USD with a receipt, to be claimed back
        await pg.click('[data-act="mon-new"][data-kind="expense"]'); await pg.fill('#mf-amount', '40'); await pg.select_option('#mf-cur', 'USD')
        await pg.fill('#mf-payee', 'Site taxi to El Mahsama'); await pg.fill('#mf-cat', 'Work expenses'); await pg.fill('#mf-proj', 'ELM'); await pg.check('#mf-claim')
        await pg.set_input_files('#mf-file', os.path.join(FX, 'scan.png')); await pg.wait_for_function("/scan\\.png/.test(document.querySelector('.mon-form').textContent)")
        print('FORM', await ev("[document.querySelector('#mf-claim').checked, document.querySelector('#mf-payee').value, document.querySelector('#mf-amount').value, document.querySelector('#mf-cur').value]"))
        assert await ev("document.querySelector('#mf-claim').checked && document.querySelector('#mf-payee').value === 'Site taxi to El Mahsama'"), 'form keeps values after attaching a receipt'
        await pg.click('[data-act="mon-save"]'); await pg.wait_for_timeout(300)
        w = [x for x in await tx() if x.get('claim')][0]; assert w['receiptId'] and w['currency'] == 'USD'
        # overview needs the USD rate
        await pg.click('[data-act="mon-tab"][data-tab="overview"]'); await pg.wait_for_timeout(150)
        assert 'without an exchange rate' in await pg.text_content('.money')
        await pg.click('[data-act="mon-tab"][data-tab="budgets"]')
        await pg.fill('[data-chg="mon-rate"][data-c="USD"]', '48.5'); await pg.dispatch_event('[data-chg="mon-rate"][data-c="USD"]', 'change'); await pg.wait_for_timeout(200)
        await pg.fill('[data-chg="mon-budget"][data-c="Eating out"]', '1000'); await pg.dispatch_event('[data-chg="mon-budget"][data-c="Eating out"]', 'change')
        await pg.click('[data-act="mon-tab"][data-tab="overview"]'); await pg.wait_for_timeout(150)
        ov = await pg.text_content('.money'); print('OVERVIEW', ' '.join(ov.split())[:400])
        assert 'without an exchange rate' not in ov and '125%' in ov, 'budget used 1250.75 of 1000'
        tiles = await ev("[...document.querySelectorAll('.mon-tile b')].map(x=>x.textContent)"); print('TILES', tiles)
        assert '3,000' in tiles[0] and '3,191' in tiles[1], 'expenses = 1250.75 + 40 × 48.5 = 3190.75'
        assert len(tiles) == 4, 'claim tile shown'

        # recurring salary from two months ago → two or three entries now
        await pg.click('[data-act="mon-tab"][data-tab="recurring"]'); await pg.click('[data-act="mon-rc-add"][data-cat="Salary"]'); await pg.wait_for_timeout(100)
        await pg.fill('[data-chg="mon-rc"][data-k="amount"]', '45000'); await pg.dispatch_event('[data-chg="mon-rc"][data-k="amount"]', 'change')
        await pg.fill('[data-chg="mon-rc"][data-k="start"]', '2026-08-26'); await pg.dispatch_event('[data-chg="mon-rc"][data-k="start"]', 'change')
        await pg.click('[data-act="mon-rc-run"]'); await pg.wait_for_timeout(200)
        sal = sorted(x['date'] for x in await tx() if x.get('recurringId')); print('SALARY', sal)
        # every 26th from 26 Aug 2026 up to today (the run date decides how many)
        import datetime
        td, want, m = datetime.date.today(), [], datetime.date(2026, 8, 26)
        while m <= td: want.append(m.isoformat()); m = (m.replace(day=1) + datetime.timedelta(days=32)).replace(day=26)
        assert sal == want, (sal, want)
        await pg.click('[data-act="mon-rc-run"]'); await pg.wait_for_timeout(100)
        assert len([x for x in await tx() if x.get('recurringId')]) == len(want), 'no double entries'

        # bank statement: header found below the account lines, dd/mm dates, debit/credit columns
        await pg.click('[data-act="mon-tab"][data-tab="import"]'); await pg.set_input_files('#mon-imp-file', os.path.join(FX, 'statement.csv')); await pg.wait_for_selector('.mon-imp-map')
        rows = await ev("window.__AR_MON.rows().map(r=>[r.date,r.kind,r.amount,r.category,r.dup])"); print('ROWS', rows)
        assert rows[0] == ['2026-10-01', 'income', 45000, 'Salary', False]
        assert rows[1][:4] == ['2026-10-03', 'expense', 1830.25, 'Food & groceries'] and rows[3][3] == 'Transport & fuel'
        assert rows[2][3] == 'Phone & internet' and rows[4][3] == 'Health'
        assert rows[5][3] == '', 'ATM withdrawal has no rule'
        await pg.click('[data-act="mon-imp-ai"]'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=SHOTS + '/m1-statement.png', full_page=True)
        await pg.click('[data-act="mon-imp-go"]'); await pg.wait_for_timeout(300)
        n1 = len(await tx()); assert n1 == 3 + len(want) + 6, n1   # 3 entered, the salaries so far, 6 statement lines
        # the same statement again: every line is a duplicate
        await pg.click('[data-act="mon-tab"][data-tab="import"]'); await pg.set_input_files('#mon-imp-file', os.path.join(FX, 'statement.csv')); await pg.wait_for_selector('.mon-imp-map')
        assert await ev("window.__AR_MON.rows().every(r=>r.dup)") and await ev("document.querySelector('[data-act=\"mon-imp-go\"]').disabled")
        await pg.click('[data-act="mon-imp-cancel"]')

        # receipt photo → AI fills the form
        await pg.click('[data-act="mon-tab"][data-tab="receipts"]'); await pg.set_input_files('#mon-rc-file', os.path.join(FX, 'scan.png')); await pg.wait_for_selector('.mon-form')
        assert await pg.input_value('#mf-amount') == '1245.5' and await pg.input_value('#mf-payee') == 'Carrefour Maadi' and await pg.input_value('#mf-date') == '2026-10-20'
        pr = await ev("window.__prompts.filter(p=>/^Read this receipt/.test(p.prompt)).pop()"); assert pr['images'] == 1 and pr['tier'] == 'quick'
        await pg.click('[data-act="mon-save"]'); await pg.wait_for_timeout(300)
        assert any(x.get('payee') == 'Carrefour Maadi' and x.get('receiptId') for x in await tx())

        # claims: sheet with the receipt, then paid back adds the income
        await pg.click('[data-act="mon-tab"][data-tab="claims"]'); await pg.wait_for_timeout(100)
        await pg.click('[data-act="mon-claim-sheet"]'); await pg.wait_for_timeout(1200)
        name = await ev("Object.keys(window.__saveData).find(k=>/^expense-claim-.*\\.zip$/.test(k))"); assert name
        data = await ev(f"(async()=>{{const d=window.__saveData[{name!r}]; return [...new Uint8Array(await d.arrayBuffer())]}})()")
        z = zipfile.ZipFile(io.BytesIO(bytes(data))); names = z.namelist(); print('ZIP', names)
        assert any(n.endswith('.xlsx') for n in names) and any(n.startswith('receipts/01 ') for n in names)
        await pg.click('[data-act="mon-claim-paid"]'); await pg.wait_for_timeout(200)
        t = await tx(); paid = [x for x in t if x.get('category') == 'Expense claim paid']
        assert len(paid) == 1 and paid[0]['amount'] == 40 and paid[0]['currency'] == 'USD'
        assert all(x.get('claimPaid') for x in t if x.get('claim'))

        # export
        await pg.click('[data-act="mon-tab"][data-tab="overview"]'); await pg.click('[data-act="mon-export"]'); await pg.wait_for_timeout(1200)
        assert await ev("Object.keys(window.__saveData).some(k=>/^money-.*\\.xlsx$/.test(k))")
        await pg.screenshot(path=SHOTS + '/m2-overview.png', full_page=True)
        await pg.set_viewport_size({'width': 390, 'height': 844}); await pg.wait_for_timeout(300)
        ov = await ev("document.documentElement.scrollWidth > innerWidth + 1"); print('MOBILE overflow', ov, await ev("[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(e).position!=='fixed').slice(0,6).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))"))
        await pg.screenshot(path=SHOTS + '/m3-mobile.png', full_page=True)
        assert not ov
        print('ERRORS', errors); assert not errors
        print('MONEY E2E PASSED')
        await b.close()

asyncio.run(main())
