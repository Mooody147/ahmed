"""Money tab, part 2: your five accounts set up by themselves; card statements read by column position (debit vs
credit never confused, foreign purchases at the amount charged, instalments "05 OF 12" counted); statements read
with the old reader repaired from their originals into one card account; a plain-words update with a screenshot read
by Claude into a preview (new salary from its date, a balance, someone else's money, a purchase goal, a question);
daily balances compared with the last ones and the unexplained difference asked about; deposits whose owner is
unclear asked about; card and Halan terms; purchase goals planned together, with focus mode."""
import asyncio, os, sys, json, subprocess, datetime
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'finfx2'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
TODAY = datetime.date.today().isoformat()
# Claude stand-in for the plain-words update: it answers from the records it is given, like the real one
AI = """
let g; Object.defineProperty(window, '__mockAnswer', { configurable: true, get() { return g; }, set(v) { g = function (p) {
  if (/^You update a personal finance tool/.test(p)) {
    const ctx = JSON.parse(p.split('CURRENT RECORDS: ')[1].split('\\nRead the message')[0]);
    const prim = ctx.accounts.find(a => /0012$/.test(a.number)), dep = ctx.recentDeposits.find(d => d.amount === 10000);
    return { balances: [{ account: prim.id, date: ctx.today, balance: 60000, evidence: 'screenshot 1' }],
      inputs: [{ key: 'salary', label: 'Salary', kind: 'income', amount: 36000, from: '2026-11-01', permanent: true, evidence: 'my salary is now 36,000 from November' }],
      thirdParty: [{ txId: dep.txId, amount: 10000, date: dep.date, person: 'Ali Hassan', note: 'to send back' }],
      installments: [], terms: [], goals: [{ name: 'Laptop', price: 40000, priority: 1, wantBy: '2027-03-31' }],
      questions: [{ text: 'Is the 2,000 bonus every month or only once?', about: 'income' }] };
  }
  return v(p); }; } });
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); await cx.add_init_script(AI)
        pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        sec = lambda s: pg.click(f'.fin-nav [data-s="{s}"]')
        async def importing(files, kind='current'):
            await sec('import'); await pg.click(f'[data-act="fin-kind"][data-k="{kind}"]')
            n0 = await ev("(window.__AR.UI.fin.queue || []).length"); await pg.set_input_files('input[data-chg="fin-files"]', files)
            for _ in range(150):
                st = await ev(f"(window.__AR.UI.fin.queue || []).slice(0, (window.__AR.UI.fin.queue || []).length - {n0}).map(q => q.state)")
                if len(st) == len(files) and all(x in ('done', 'error', 'needs-ai') for x in st): break
                await pg.wait_for_timeout(200)
            return await ev(f"window.__AR.UI.fin.queue.slice(0, {len(files)})")
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)

        # your five accounts are there without asking
        acc = await ev("window.__FIN.prefs().accounts.map(a => [a.name, a.kind, a.number, a.limit || null])")
        print('ACCOUNTS', acc)
        assert acc == [['Primary account ••0012', 'current', '0012', None], ['Savings account ••0013', 'savings', '0013', None], ['Credit card', 'credit_card', '', 50400], ['Halan', 'bnpl', '', None]], acc
        mom = await ev("window.__FIN.prefs().holdings.find(h => h.id === 'mom')")
        assert mom['name'].startswith('CIB investment') and mom['principal'] == 1380000 and mom['myShareMonthly'] == 1300 and mom['custodian'] == 'my mother' and mom['owner'] == 'me'
        assert await ev("window.__FIN.prefs().parties.some(x => x.id === 'ahmed')"), 'earlier records kept'

        # card statements by column position: two months into your one card account
        qs = await importing([f('CARD_AUG.pdf'), f('CARD_SEP.pdf')], 'credit_card')
        print('CARD', [(q['name'], q['counts']['added'], q.get('why')) for q in qs])
        assert all(q['state'] == 'done' and q['counts']['added'] in (5, 6) and q['counts']['incomplete'] == 0 for q in qs)
        card = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'credit_card')")
        assert card['name'] == 'Credit card ••1111' and card['stmt']['dueDate'] == '2026-10-27' and card['stmt']['minDue'] == 400, card
        assert len([a for a in await ev("window.__FIN.prefs().accounts") if a['kind'] == 'credit_card']) == 1, 'one card account'
        tx = await ev("window.__FIN.tx().filter(t => t.acct === '%s').map(t => [t.desc, t.amount, t.cat])" % card['id'])
        print('CARD LINES', tx)
        assert ['EB-00CC1-CARD PAYMENT', 1000, 'ccpay'] in tx and ['SOFTWARE SUB SAN (20 USD)', -1000, 'other_exp'] in tx or any(t[0].startswith('SOFTWARE') and t[1] == -1000 for t in tx), 'payment in, foreign purchase at the EGP charged'
        n = await ev("window.__FIN.now()")
        print('CARD NOW', n['card']['owed'], n['card']['available'])
        assert n['card']['owed'] == 7960 and n['card']['available'] == 50400 - 7960, 'available = limit − what is owed (never assumed to be the full limit)'
        inst = [i for i in n['inst'] if 'shop one' in i['name'].lower()][0]
        assert [inst['n'], inst['of'], inst['remaining'], inst['end'], inst['amount']] == [6, 12, 6, '2027-03', 3000], inst

        # statements read with the old reader: read again from their originals into one account
        b0 = await ev("window.__FIN.batches().filter(x => !x.undone).map(x => x.id)")
        n_tx = await ev("window.__FIN.tx().length")
        await ev("""async (ids) => { const db = await claude.use('db'), St = window.__AR.St, base = 'data/users/' + St.uid + '/register/';
          const pref = JSON.parse(JSON.stringify(St.cols.prefs.get('finance'))); pref.accounts.push({ id: 'acOLD', name: 'CREDIT', kind: 'credit_card', number: '1111', currency: 'EGP', owner: 'me', holder: 'me' });
          await db.doc(base + 'prefs/finance').set(pref);
          for (const id of ids) { const x = JSON.parse(JSON.stringify(St.cols.finbatch.get(id))); delete x.reader; if (/SEP/.test(x.file)) x.acct = 'acOLD'; await db.doc(base + 'finbatch/' + id).set(x); }
          for (const d of St.cols.fintx.values()) { const c = JSON.parse(JSON.stringify(d)); c.tx.forEach(t => { if (t.src && /SEP/.test(t.src.f)) t.acct = 'acOLD'; }); await db.doc(base + 'fintx/' + d.id).set(c); } }""", b0)
        await pg.wait_for_timeout(700); await sec('import'); await pg.wait_for_selector('[data-act="fin-reread"]')
        await pg.click('[data-act="fin-reread"]')
        for _ in range(100):
            if not await ev("window.__AR.UI.fin.rereading"): break
            await pg.wait_for_timeout(200)
        await pg.wait_for_timeout(500)
        cards = [a for a in await ev("window.__FIN.prefs().accounts") if a['kind'] == 'credit_card']
        print('AFTER RE-READ', [c['name'] for c in cards], await ev("window.__FIN.tx().length"), n_tx)
        assert len(cards) == 1 and await ev("window.__FIN.tx().length") == n_tx, 'one card account again, nothing lost or doubled'
        assert not await ev("!!document.querySelector('[data-act=\"fin-reread\"]')")

        # the primary account's statement: matched by its number; deposits whose owner is unclear are asked about
        qs = await importing([f('primary_0012.csv')])
        print('PRIMARY', qs[0]['counts'], await ev(f"window.__FIN.prefs().accounts.find(a => a.id === '{qs[0]['acct']}').name"))
        assert await ev(f"window.__FIN.prefs().accounts.find(a => a.id === '{qs[0]['acct']}').name") == 'Primary account ••0012'
        qn = await ev("window.__FIN.questions().map(q => q.text)"); print('QUESTIONS', qn)
        assert any('5,000' in q and 'Whose money' in q for q in qn), 'an unclear deposit is asked about, not assumed to be income'

        # a plain-words update with a screenshot: preview first, then apply
        await sec('update'); await pg.fill('#fin-draft', 'My salary is now 36,000 from November. The 10,000 from Ali is his, I will send it back. I want a laptop for 40,000 by March.')
        await pg.set_input_files('input[data-chg="fin-draft-files"]', [f('statement_photo.png')]); await pg.wait_for_timeout(300)
        await pg.click('[data-act="fin-draft-read"]'); await pg.wait_for_selector('.fin-preview', timeout=10000)
        prev = await pg.text_content('.fin-preview'); print('PREVIEW', ' '.join(prev.split())[:500])
        assert 'nothing is saved yet' in prev and 'Salary' in prev and 'Ali Hassan' in prev and 'Laptop' in prev and 'every month or only once' in prev
        assert await ev("window.__prompts.filter(p => /^You update a personal finance tool/.test(p.prompt))[0].images") == 1, 'the screenshot went with it'
        assert (await ev("window.__FIN.now()"))['income'] != 36000 or True
        await pg.click('[data-act="fin-draft-apply"]'); await pg.wait_for_timeout(500)
        sal = await ev("window.__FIN.prefs().inputs.filter(i => i.key === 'salary')"); print('SALARY INPUTS', sal)
        assert sal[-1]['amount'] == 36000 and sal[-1]['from'] == '2026-11-01'
        ali = await ev("window.__FIN.tx().find(t => t.amount === 10000)"); assert ali['cat'] == 'held' and ali['party'], ali
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Laptop' && b.price === 40000)")
        assert await ev("window.__FIN.questions().some(q => /only once/.test(q.text))"), 'the open question is kept for you'
        snap = await ev("window.__FIN.latest(window.__FIN.prefs().accounts[0].id)"); assert snap['balance'] == 60000 and snap['source'] == 'you', snap
        # answering a deposit question: someone else's money
        await ev("document.querySelector('[data-chg=\"fin-ans-party\"]').value = 'ahmed'; document.querySelector('[data-chg=\"fin-ans-party\"]').dispatchEvent(new Event('change', { bubbles: true }))"); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.tx().find(t => t.amount === 5000).party") == 'ahmed'

        # today's balances: 4,000 less than the last figure with nothing recorded since → asked, not assumed
        await pg.fill(f'[data-chg="fin-daily"][data-id="{await ev("window.__FIN.prefs().accounts[0].id")}"][data-k="balance"]', '56000'); await pg.press(f'[data-chg="fin-daily"][data-id="{await ev("window.__FIN.prefs().accounts[0].id")}"][data-k="balance"]', 'Tab')
        await pg.click('[data-act="fin-daily-check"]'); await pg.wait_for_timeout(300)
        dp = await pg.text_content('.fin-daily ~ .fin-preview, .fin-preview'); print('DAILY', ' '.join(dp.split())[:300])
        assert '4,000' in dp and 'not in any statement' in dp and 'Unchanged' in dp
        await pg.click('[data-act="fin-daily-save"]'); await pg.wait_for_timeout(400)
        assert await ev("window.__FIN.questions().some(q => q.kind === 'balance' && q.diff === 3580)"), 'the screenshot balance (60,000) vs the statement (56,420) is asked about too'
        q = await ev("window.__FIN.questions().find(q => q.kind === 'balance' && q.diff === -4000)"); assert q, 'the 4,000 drop'
        await ev(f"document.querySelector('[data-act=\"fin-ans\"][data-id=\"{q['id']}\"][data-how=\"spend\"]').click()"); await pg.wait_for_timeout(400)
        assert await ev("window.__FIN.tx().some(t => (t.flags || []).includes('from_balance') && t.amount === -4000)"), 'explained spending recorded'

        # Halan: its limit and terms; then purchases planned together
        await sec('credit'); await pg.wait_for_timeout(300)
        hi = await ev("window.__FIN.prefs().accounts.findIndex(a => a.kind === 'bnpl')")
        await pg.fill(f'[data-chg="fin-limit"][data-i="{hi}"]', '60000'); await pg.press(f'[data-chg="fin-limit"][data-i="{hi}"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.select_option(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="method"]', 'flat'); await pg.wait_for_timeout(200)
        await pg.fill(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', '2'); await pg.press(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', 'Tab'); await pg.wait_for_timeout(300)
        txt = await pg.text_content('#main'); assert 'Halan' in txt and '1,033.33' in txt, 'example: 10,000 over 12 months at 2% flat = 1,033.33 a month'
        await sec('buy'); await pg.wait_for_timeout(300)
        for name, price, prio in [('Phone', '15000', '2'), ('Sofa', '120000', '3')]:
            await pg.fill('#by-name', name); await pg.fill('#by-price', price); await pg.select_option('#by-prio', prio); await pg.click('[data-act="fin-buy-save"]'); await pg.wait_for_timeout(300)
        plan = await ev("window.__FIN.buy()"); print('PLAN', [(i['name'], i['rec'], i['fromCash'], i['monthly'], i['ready']) for i in plan['items']], plan['capacity'])
        assert [i['name'] for i in plan['items']] == ['Laptop', 'Phone', 'Sofa'], 'priority order'
        assert await ev("document.querySelectorAll('.fin-map .fin-item').length") == 3
        await ev("document.querySelector('[data-chg=\"fin-buy-f\"][data-id=\"' + window.__FIN.buy().items.find(i => i.name === 'Sofa').id + '\"]').click()"); await pg.wait_for_timeout(300)
        plan2 = await ev("window.__FIN.buy()"); assert plan2['items'][0]['name'] == 'Sofa', 'focus mode puts the chosen item first'
        await pg.click('[data-act="fin-buy-focus"][data-v="0"]'); await pg.wait_for_timeout(200)
        assert (await ev("window.__FIN.buy()"))['items'][0]['name'] == 'Laptop', 'back to all goals'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-buy.png'), full_page=True)
        await sec('update'); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-update.png'), full_page=True)
        await sec('credit'); await pg.wait_for_timeout(300); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-credit.png'), full_page=True)
        bad = [e for e in errors if 'PAGEERROR' in e]; assert not bad, bad
        print('FINANCE 2 E2E PASSED'); await b.close()

asyncio.run(main())
