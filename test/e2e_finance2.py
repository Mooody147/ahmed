"""Money, part 2 — the canvas is the whole Money page. Your five accounts are set up by themselves; card statements
are read by column position (debit vs credit never confused, foreign purchases at the amount charged, "05 OF 12"
instalments counted); statements read with the old reader are read again by themselves; statements, words and
screenshots go into the box under the canvas and are applied at once (new salary from its date, a balance, someone
else's money, a goal, cash spending), with Undo; anything unclear (deposits, balance differences, unreadable lines) is
settled by Claude and logged — nothing waits and no dialog stops you; every former tab opens from the canvas as a
panel (Halan terms, purchase goals with focus mode, today's balances, transactions); the canvas folds, focuses, zooms,
moves, goes full screen and remembers its folds; questions are answered without changing anything."""
import asyncio, os, sys, json, subprocess, datetime
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'finfx2'); subprocess.run(['node', os.path.join(HERE, 'fin_fixtures.js'), FX], check=True, capture_output=True)
f = lambda n: os.path.join(FX, n)
TODAY = datetime.date.today().isoformat()
# Claude stand-in: it answers from the records it is given, like the real one
AI = """
let g; Object.defineProperty(window, '__mockAnswer', { configurable: true, get() { return g; }, set(v) { g = function (p) {
  if (/^You update a personal finance tool/.test(p)) {
    const ctx = JSON.parse(p.split('CURRENT RECORDS: ')[1].split('\\nRead the message')[0]), msg = p.split('OWNER’S MESSAGE:\\n')[1] || '';
    if (/\\?/.test(msg)) return { reply: 'You spent EGP 4,250 on groceries & food in September.' };
    if (/show me my card/i.test(msg)) return { view: { open: 'credit' }, reply: 'Here is your card.' };
    const prim = ctx.accounts.find(a => /0012$/.test(a.number)), dep = ctx.recentDeposits.find(d => d.amount === 10000);
    return { balances: [{ account: prim.id, date: ctx.today, balance: 60000, evidence: 'screenshot 1' }],
      inputs: [{ key: 'salary', label: 'Salary', kind: 'income', amount: 36000, from: '2026-11-01', permanent: true, evidence: 'my salary is now 36,000 from November' }],
      thirdParty: dep ? [{ txId: dep.txId, amount: 10000, date: dep.date, person: 'Ali Hassan', note: 'to send back' }] : [],
      installments: [], terms: [], goals: [{ name: 'Laptop', price: 40000, priority: 1, wantBy: '2027-03-31' }],
      transactions: [{ account: null, date: ctx.today, amount: -600, desc: 'Dinner', category: 'dining' }],
      questions: [{ text: 'Is the 2,000 bonus every month or only once?', about: 'income' }],
      notes: ['I took “by March” as 31 March 2027.'], reply: 'Done — salary, balance, Ali’s money, the laptop and your dinner are in.' };
  }
  if (/^You keep a personal finance ledger in order/.test(p)) {
    const ctx = JSON.parse(p.split('CONTEXT: ')[1].split('\\nReturn JSON only')[0]);
    return { decisions: ctx.items.map(it => it.kind === 'deposit' ? (/ALI/i.test(it.desc) ? { id: it.id, how: 'theirs', person: 'Ali Hassan', why: 'a transfer from a person' } : { id: it.id, how: 'income', category: 'other_inc', why: 'an InstaPay transfer in' })
      : it.kind === 'balance' ? (it.difference < 0 ? { id: it.id, how: 'spend', category: 'other_exp', why: 'cash spending' } : { id: it.id, how: 'income', why: 'money in' })
      : it.kind === 'unreadable' ? { id: it.id, how: 'ignore', why: 'smudged' } : { id: it.id, how: it.kind === 'note' ? 'noted' : 'keep', why: 'fine' }) };
  }
  return v(p); }; } });
"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); cx = await b.new_context(viewport={'width': 1400, 'height': 1000}); await cx.add_init_script(AI)
        pg = await cx.new_page(); ev = pg.evaluate
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500)
        pg.on('dialog', lambda d: (errors.append('DIALOG ' + d.message), asyncio.ensure_future(d.dismiss())))
        U = "window.__AR.UI.fin"
        async def idle():
            calm = 0
            for _ in range(300):
                await pg.wait_for_timeout(150)
                calm = calm + 1 if await ev(f"!{U}.talk.busy && !{U}.fixing && !{U}.autoQ") else 0
                if calm >= 4: return
        async def say(text, files=()):
            if files: await pg.set_input_files('input[data-chg="fin-talk-files"]', list(files))
            await pg.fill('#fin-talk-in', text); await pg.click('[data-act="fin-talk-send"]'); await pg.wait_for_timeout(200); await idle()
            return (await ev("window.__FIN.talk()"))[-1]
        async def tap(node):
            # a card behind the open panel: close the panel first, as you would
            if await ev(f"(() => {{ const p = document.getElementById('fin-panel'), n = document.querySelector('.fin-cvn[data-node=\"{node}\"]'); return !!p && !!n && n.getBoundingClientRect().right > p.getBoundingClientRect().left; }})()"): await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150)
            await ev(f"window.__FIN.show('{node}')"); await pg.wait_for_timeout(50)   # dragged into view
            await pg.click(f'.fin-cvn[data-node="{node}"] .mtxt')
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)
        assert await ev("!!document.getElementById('fin-cv-vp') && !!document.getElementById('fin-talk-in')"), 'the canvas with the talk box under it'
        assert not await ev("!!document.querySelector('.fin-nav, .fin-sec')"), 'no tabs to scroll through'

        # your five accounts are there without asking
        acc = await ev("window.__FIN.prefs().accounts.map(a => [a.name, a.kind, a.number, a.limit || null])")
        print('ACCOUNTS', acc)
        assert acc == [['Primary account ••0012', 'current', '0012', None], ['Savings account ••0013', 'savings', '0013', None], ['Credit card', 'credit_card', '', 50400], ['Halan', 'bnpl', '', None]], acc
        mom = await ev("window.__FIN.prefs().holdings.find(h => h.id === 'mom')")
        assert mom['name'].startswith('CIB investment') and mom['principal'] == 1380000 and mom['myShareMonthly'] == 1300 and mom['custodian'] == 'my mother' and mom['owner'] == 'me'

        # card statements added in the talk box: read by column position into your one card account
        m = await say('my credit card statements', [f('CARD_AUG.pdf'), f('CARD_SEP.pdf')]); print('CARD MSG', m.get('done'))
        assert any('CARD_AUG.pdf' in d for d in m['done']) and any('CARD_SEP.pdf' in d for d in m['done'])
        card = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'credit_card')")
        assert card['name'] == 'Credit card ••1111' and card['stmt']['dueDate'] == '2026-10-27' and card['stmt']['minDue'] == 400, card
        assert len([a for a in await ev("window.__FIN.prefs().accounts") if a['kind'] == 'credit_card']) == 1, 'one card account'
        tx = await ev("window.__FIN.tx().filter(t => t.acct === '%s').map(t => [t.desc, t.amount, t.cat])" % card['id'])
        assert ['EB-00CC1-CARD PAYMENT', 1000, 'ccpay'] in tx and any(t[0].startswith('SOFTWARE') and t[1] == -1000 for t in tx), 'payment in, foreign purchase at the EGP charged'
        n = await ev("window.__FIN.now()")
        assert n['card']['owed'] == 7960 and n['card']['available'] == 50400 - 7960, 'available = limit − what is owed (never assumed to be the full limit)'
        inst = [i for i in n['inst'] if 'shop one' in i['name'].lower()][0]
        assert [inst['n'], inst['of'], inst['remaining'], inst['end'], inst['amount']] == [6, 12, 6, '2027-03', 3000], inst

        # statements read with the old reader are read again by themselves — nothing to press
        b0 = await ev("window.__FIN.batches().filter(x => !x.undone).map(x => x.id)"); n_tx = await ev("window.__FIN.tx().length")
        await ev("""async (ids) => { const db = await claude.use('db'), St = window.__AR.St, base = 'data/users/' + St.uid + '/register/';
          const pref = JSON.parse(JSON.stringify(St.cols.prefs.get('finance'))); pref.accounts.push({ id: 'acOLD', name: 'CREDIT', kind: 'credit_card', number: '1111', currency: 'EGP', owner: 'me', holder: 'me' });
          await db.doc(base + 'prefs/finance').set(pref);
          for (const id of ids) { const x = JSON.parse(JSON.stringify(St.cols.finbatch.get(id))); delete x.reader; if (/SEP/.test(x.file)) x.acct = 'acOLD'; await db.doc(base + 'finbatch/' + id).set(x); }
          for (const d of St.cols.fintx.values()) { const c = JSON.parse(JSON.stringify(d)); c.tx.forEach(t => { if (t.src && /SEP/.test(t.src.f)) t.acct = 'acOLD'; }); await db.doc(base + 'fintx/' + d.id).set(c); } }""", b0)
        for _ in range(100):
            await pg.wait_for_timeout(200)
            if any('read again' in ' '.join(x.get('done') or []) for x in await ev("window.__FIN.talk()")): break
        await idle()
        cards = [a for a in await ev("window.__FIN.prefs().accounts") if a['kind'] == 'credit_card']
        print('AFTER RE-READ', [c['name'] for c in cards], await ev("window.__FIN.tx().length"), n_tx)
        assert len(cards) == 1 and await ev("window.__FIN.tx().length") == n_tx, 'one card account again, nothing lost or doubled'

        # the primary account's statement: matched by its number; the unclear deposits are settled by Claude, not left as questions
        m = await say('', [f('primary_0012.csv')])
        prim = await ev("window.__FIN.prefs().accounts.find(a => /0012$/.test(a.number)).id")
        assert await ev(f"window.__FIN.tx().filter(t => t.acct === '{prim}').length") == 5, 'into the primary account by its number'
        assert await ev("window.__FIN.questions().length") == 0, 'nothing waits for you'
        ali = await ev("window.__FIN.tx().find(t => t.amount === 10000)"); five = await ev("window.__FIN.tx().find(t => t.amount === 5000)")
        print('DECIDED', ali['cat'], ali.get('party'), five['cat'], five['catSrc'])
        assert ali['cat'] == 'held' and await ev(f"window.__FIN.prefs().parties.find(x => x.id === '{ali['party']}').name") == 'Ali Hassan', 'a transfer from a person is his money'
        assert five['cat'] == 'other_inc' and five['catSrc'] == 'claude'
        log = await ev("window.__FIN.autoLog()"); assert sum(1 for x in log if x['kind'] == 'deposit' and x['by'] == 'claude') == 2, log
        assert not await ev("!!document.querySelector('.fin-note, .fin-notes')"), 'no warnings that stop you'
        assert await ev("!!document.querySelector('.fin-cvn[data-node=\"auto\"]')"), 'what Claude decided is on the canvas'

        # telling the canvas, with a screenshot: applied at once, the changed cards glow; Undo puts it all back
        words = 'My salary is now 36,000 from November. The 10,000 from Ali is his. I want a laptop for 40,000 by March. I paid 600 for dinner in cash today.'
        m = await say(words, [f('statement_photo.png')]); print('REPLY', m.get('reply'), m.get('notes'), [c['label'] for c in m.get('changes', [])])
        assert await ev("window.__prompts.filter(p => /^You update a personal finance tool/.test(p.prompt)).pop().images") == 1, 'the screenshot went with it'
        assert m['reply'].startswith('Done') and any('only once' in x for x in m['notes']) and len(m['changes']) >= 3
        sal = await ev("window.__FIN.prefs().inputs.filter(i => i.key === 'salary')"); assert sal[-1]['amount'] == 36000 and sal[-1]['from'] == '2026-11-01', sal
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Laptop' && b.price === 40000)")
        cash = await ev("window.__FIN.prefs().accounts.find(a => a.kind === 'cash')"); assert cash, 'a cash account for cash spending'
        assert await ev(f"window.__FIN.tx().some(t => t.acct === '{cash['id']}' && t.amount === -600 && t.cat === 'dining')")
        snap = await ev(f"window.__FIN.latest('{prim}')"); assert snap['balance'] == 60000 and snap['source'] == 'you', snap
        assert await ev("window.__FIN.tx().some(t => (t.flags || []).includes('from_balance') && t.amount === 3580)"), 'the 3,580 the statements do not show is settled as money in'
        assert await ev("window.__FIN.questions().length") == 0
        assert await ev("document.querySelectorAll('.fin-cvn.fresh').length") >= 3, 'changed cards glow'
        await pg.click('[data-act="fin-talk-undo"]'); await pg.wait_for_timeout(400)
        assert not await ev("(window.__FIN.prefs().buys || []).some(b => b.name === 'Laptop')") and not await ev("(window.__FIN.prefs().inputs || []).some(i => i.amount === 36000)")
        assert not await ev("window.__FIN.tx().some(t => t.amount === -600)") and (await ev(f"window.__FIN.latest('{prim}')"))['balance'] != 60000, 'Undo puts everything back'
        assert (await ev("window.__FIN.talk()"))[-1]['undone']
        await idle(); m = await say(words, [f('statement_photo.png')])
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Laptop')"), 'said again, applied again'

        # today's balances, opened from the canvas: saved at once; the 4,000 nobody explained is settled as spending
        await tap('t:update'); await pg.wait_for_selector('#fin-panel .fin-daily')
        fld = f'[data-chg="fin-daily"][data-id="{prim}"][data-k="balance"]'
        await pg.fill(fld, '56000'); await pg.press(fld, 'Tab'); await pg.click('[data-act="fin-daily-check"]'); await pg.wait_for_timeout(300); await idle()
        assert not await ev("!!document.querySelector('.fin-preview')"), 'no check-before-saving step'
        assert await ev("window.__FIN.tx().some(t => (t.flags || []).includes('from_balance') && t.amount === -4000)") and await ev("window.__FIN.questions().length") == 0

        # Halan, opened from its branch: its limit and terms
        await pg.keyboard.press('Escape'); await tap('com'); await pg.wait_for_selector('#fin-panel [data-chg="fin-limit"]')
        hi = await ev("window.__FIN.prefs().accounts.findIndex(a => a.kind === 'bnpl')")
        await pg.fill(f'[data-chg="fin-limit"][data-i="{hi}"]', '60000'); await pg.press(f'[data-chg="fin-limit"][data-i="{hi}"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.select_option(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="method"]', 'flat'); await pg.wait_for_timeout(200)
        await pg.fill(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', '2'); await pg.press(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', 'Tab'); await pg.wait_for_timeout(300)
        txt = await pg.text_content('#fin-panel'); assert 'Halan' in txt and '1,033.33' in txt, 'example: 10,000 over 12 months at 2% flat = 1,033.33 a month'

        # purchase goals, opened from their branch: planned together, focus mode
        await tap('buy'); await pg.wait_for_selector('#fin-panel #by-name')
        for name, price, prio in [('Phone', '15000', '2'), ('Sofa', '120000', '3')]:
            await pg.fill('#by-name', name); await pg.fill('#by-price', price); await pg.select_option('#by-prio', prio); await pg.click('[data-act="fin-buy-save"]'); await pg.wait_for_timeout(300)
        plan = await ev("window.__FIN.buy()"); print('PLAN', [(i['name'], i['rec'], i['fromCash'], i['monthly'], i['ready']) for i in plan['items']], plan['capacity'])
        assert [i['name'] for i in plan['items']] == ['Laptop', 'Phone', 'Sofa'], 'priority order'
        assert await ev("document.querySelectorAll('#fin-panel .fin-map .fin-item').length") == 3
        await ev("document.querySelector('[data-chg=\"fin-buy-f\"][data-id=\"' + window.__FIN.buy().items.find(i => i.name === 'Sofa').id + '\"]').click()"); await pg.wait_for_timeout(300)
        assert (await ev("window.__FIN.buy()"))['items'][0]['name'] == 'Sofa', 'focus mode puts the chosen item first'
        await pg.click('[data-act="fin-buy-focus"][data-v="0"]'); await pg.wait_for_timeout(200)
        assert (await ev("window.__FIN.buy()"))['items'][0]['name'] == 'Laptop', 'back to all goals'
        # deleting asks nothing: it is done, and Undo brings it back
        phone = await ev("window.__FIN.buy().items.find(i => i.name === 'Phone').id")
        await ev(f"document.querySelector('#fin-panel button[data-act=\"fin-buy-edit\"][data-id=\"{phone}\"]').click()"); await pg.wait_for_timeout(300)
        await ev("document.querySelector('[data-act=\"fin-buy-del\"]').click()"); await pg.wait_for_timeout(300)
        assert not await ev("window.__FIN.prefs().buys.some(b => b.name === 'Phone')")
        await pg.click('#toasts .toast .btn'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Phone')"), 'Undo brings it back'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-buy.png'))

        # the canvas: every former tab is on it
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        brs = await ev("[...document.querySelectorAll('.fin-cv-br')].map(b => b.dataset.node)"); print('CANVAS BRANCHES', brs)
        for k in ('accts', 'inc', 'exp', 'com', 'own', 'third', 'buy', 'auto'): assert k in brs, k
        for node, part in [('root', 'dash'), ('t:import', 'import'), ('t:ledger', 'ledger'), ('t:budget', 'budget'), ('t:sim', 'sim'), ('t:forecast', 'forecast'), ('accts', 'accounts'), ('inc', 'inc'), ('exp', 'exp'), ('own', 'own')]:
            await tap(node); await pg.wait_for_timeout(250)
            assert await ev(f"{U}.panel") == part and await ev("!!document.querySelector('#fin-panel .fin-panel-b > *')"), (node, part)
            assert await ev(f"document.querySelector('.fin-cvn.sel').dataset.node") == node, 'the open part is marked'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-canvas-panel.png'))
        await ev(f"document.querySelector('.fin-leaf[data-act=\"fin-acct-ledger\"][data-id=\"{prim}\"]').click()"); await pg.wait_for_timeout(500)
        assert await ev(f"{U}.l.acct") == prim and await ev(f"{U}.panel") == 'ledger', 'an account opens its transactions'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); assert not await ev(f"{U}.panel"), 'Esc closes the panel'
        # fold a branch, show one branch, zoom, move, fit, full screen
        n0 = await ev("document.querySelectorAll('.fin-leaf').length")
        await ev("window.__FIN.show('exp')"); await pg.click('.fin-cvn[data-node="exp"] [data-act="fin-cv-tog"]'); await pg.wait_for_timeout(250)
        n1 = await ev("document.querySelectorAll('.fin-leaf').length"); assert n1 < n0 and await ev("!!document.querySelector('.fin-cvn[data-node=\"exp\"] .mmore')")
        await ev("document.querySelector('.fin-cvn[data-node=\"accts\"] .fin-cv-btn.fo').click()"); await pg.wait_for_timeout(250)
        assert await ev("[...document.querySelectorAll('.fin-cv-br')].map(b => b.dataset.node).join()") == 'accts', 'only the chosen branch'
        await pg.click('[data-act="fin-cv-focus"][data-id=""]'); await pg.wait_for_timeout(250)
        k0 = await ev(f"{U}.cv.k"); await pg.click('[data-act="fin-cv-zoom"][data-v="in"]'); assert await ev(f"{U}.cv.k") > k0
        vp = await pg.locator('#fin-cv-vp').bounding_box(); x0 = await ev(f"{U}.cv.x")
        await pg.mouse.move(vp['x'] + 20, vp['y'] + vp['height'] - 20); await pg.mouse.down(); await pg.mouse.move(vp['x'] + 120, vp['y'] + vp['height'] - 10, steps=5); await pg.mouse.up()
        assert abs(await ev(f"{U}.cv.x") - x0 - 100) < 2, 'dragging moves the canvas'
        await pg.click('[data-act="fin-cv-fit"]')
        await pg.click('[data-act="fin-cv-full"]'); await pg.wait_for_timeout(250)
        assert await ev("document.querySelector('.fin-cvwrap').classList.contains('full') && !!document.querySelector('.fin-cvwrap.full #fin-talk-in')"), 'full screen keeps the talk box'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250); assert not await ev("document.querySelector('.fin-cvwrap').classList.contains('full')")

        # only two tabs above the canvas: Canvas and Settings
        tabs = await ev("[...document.querySelectorAll('.fin-tabs button')].map(b => b.textContent.trim())"); print('TABS', tabs)
        assert [t.strip() for t in tabs] == ['Canvas', 'Settings']
        await pg.click('[data-act="fin-tab"][data-v="settings"]'); await pg.wait_for_timeout(300)
        assert not await ev("!!document.getElementById('fin-cv-vp')") and 'Backup' in await pg.text_content('#main'), 'Settings is its own tab'
        await pg.click('[data-act="fin-tab"][data-v="canvas"]'); await pg.wait_for_timeout(400)
        assert await ev("!!document.getElementById('fin-cv-vp')")

        # editing on the canvas: a balance, a salary, a goal, a budget — written to the same records everything reads
        async def edit(node, values, add=False):
            await ev(f"window.__FIN.show('{node}')"); await pg.wait_for_timeout(80)
            await pg.hover(f'.fin-cvn[data-node="{node}"]'); await pg.click(f'.fin-cvn[data-node="{node}"] [data-act="{"fin-cv-add" if add else "fin-cv-edit"}"]')
            await pg.wait_for_selector('#fin-cv-ed')
            for k, v in values.items():
                sel = f'#fin-cv-ed [data-k="{k}"]'
                if await ev(f"document.querySelector('{sel}').tagName") == 'SELECT': await pg.select_option(sel, v)
                else: await pg.fill(sel, v)
            await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(300); await idle()
            return [x for x in await ev("window.__FIN.talk()") if x['who'] == 'edit'][-1]
        m = await edit(f'a:{prim}', {'balance': '50000'}); print('EDIT LINE', m)
        assert m['who'] == 'edit' and '50,000' in m['text'] and (await ev(f"window.__FIN.latest('{prim}')"))['balance'] == 50000
        assert await ev("window.__FIN.questions().length") == 0, 'the difference is settled, nothing waits'
        assert '50,000' in await ev(f"document.querySelector('.fin-cvn[data-node=\"a:{prim}\"]').textContent"), 'the card shows it at once'
        sal_id = await ev("window.__FIN.prefs().inputs.filter(i => i.key === 'salary').pop().id")
        await edit(f'in:{sal_id}', {'amount': '38000'})
        assert (await ev("window.__FIN.now()"))['income'] >= 38000 or (await ev("window.__FIN.prefs().inputs.filter(i => i.key === 'salary').pop()"))['amount'] == 38000
        lap = await ev("window.__FIN.buy().items.find(i => i.name === 'Laptop').id")
        await edit(f'b:{lap}', {'price': '45000'}); assert await ev(f"window.__FIN.prefs().buys.find(b => b.id === '{lap}').price") == 45000
        await tap('buy'); await pg.wait_for_selector('#fin-panel .fin-map')
        assert '45,000' in await pg.text_content('#fin-panel'), 'the open part shows the canvas edit'
        await pg.keyboard.press('Escape')
        await pg.click('[data-act="fin-cv-all"][data-v="open"]'); await pg.wait_for_timeout(300)
        cat = await ev("document.querySelector('.fin-leaf.editable[data-node^=\"c:\"]').dataset.node")
        await edit(cat, {'budget': '5000'}); assert await ev(f"window.__FIN.prefs().budgets['{cat[2:]}']") == 5000
        await pg.click('.fin-cvn[data-node="exp"] [data-act="fin-cv-tog"]'); await pg.wait_for_timeout(200)   # folded again, as before
        # ＋ on a branch adds; Remove in the form removes; Undo puts it back
        await edit('buy', {'name': 'Camera', 'price': '9000'}, add=True)
        cam = await ev("(window.__FIN.prefs().buys.find(b => b.name === 'Camera') || {}).id"); assert cam and await ev(f"!!document.querySelector('.fin-cvn[data-node=\"b:{cam}\"]')")
        await ev(f"window.__FIN.show('b:{cam}')"); await pg.dblclick(f'.fin-cvn[data-node="b:{cam}"] .mtxt'); await pg.wait_for_selector('#fin-cv-ed')
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); assert not await ev("!!document.getElementById('fin-cv-ed')"), 'Esc closes the form'
        await ev(f"window.__FIN.show('b:{cam}')"); await pg.dblclick(f'.fin-cvn[data-node="b:{cam}"] .mtxt'); await pg.wait_for_selector('#fin-cv-ed')
        await pg.click('[data-act="fin-cv-ed-del"]'); await pg.wait_for_timeout(300)
        assert not await ev("window.__FIN.prefs().buys.some(b => b.name === 'Camera')")
        await pg.click('#fin-talk-feed .fin-msg.edit:last-child [data-act="fin-talk-undo"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Camera')"), 'Undo of a canvas change'
        # the talk box reads what was changed on the canvas
        await say('How much is my salary?')
        last = await ev("window.__prompts.filter(p => /^You update a personal finance tool/.test(p.prompt)).pop().prompt")
        assert '38000' in last and '45000' in last, 'Claude sees the canvas edits'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-canvas-edit.png'))

        # questions are answered and change nothing; asking to see something opens it
        t0 = await ev("window.__FIN.tx().length"); m = await say('How much did I spend on food in September?')
        assert 'groceries' in m['reply'] and not m.get('changes') and await ev("window.__FIN.tx().length") == t0
        m = await say('show me my card'); assert await ev(f"{U}.panel") == 'credit' and m['reply'] == 'Here is your card.'
        await pg.keyboard.press('Escape')
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-canvas.png'))

        # the conversation is saved with your data (its own record, apart from the settings)
        saved = await ev("""async () => { const db = await claude.use('db'), St = window.__AR.St; await new Promise(r => setTimeout(r, 800)); const d = await db.doc('data/users/' + St.uid + '/register/fintalk/feed').get(); return d.exists ? d.data().items.length : 0; }""")
        print('SAVED TALK', saved); assert saved >= 8
        # after a reload: the fold is remembered
        await pg.reload(); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500); await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)
        assert await ev("!!document.querySelector('.fin-cvn[data-node=\"exp\"] .mmore')"), 'the fold is remembered'
        bad = [e for e in errors if 'PAGEERROR' in e or 'DIALOG' in e]; assert not bad, bad
        print('FINANCE 2 E2E PASSED'); await b.close()

asyncio.run(main())
