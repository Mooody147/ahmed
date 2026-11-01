"""Money, part 2 — the canvas is the whole Money page. Your five accounts are set up by themselves; card statements
are read by column position (debit vs credit never confused, foreign purchases at the amount charged, "05 OF 12"
instalments counted); statements read with the old reader are read again by themselves; statements, words and
screenshots go into the box under the canvas and are applied at once (new salary from its date, a balance, someone
else's money, a goal, cash spending), with Undo; anything unclear (deposits, balance differences, unreadable lines) is
settled by Claude and logged — nothing waits and no dialog stops you; every former tab opens from the canvas as a
room on it, every card unfolds its details and charts in place; goals and purchases have their own room with the
map of how each is paid; rooms fold, focus, zoom,
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
    if (/only this card/i.test(msg)) { const a12 = ctx.accounts.find(a => /0012$/.test(a.number)), a13 = ctx.accounts.find(a => /0013$/.test(a.number));
      return { balances: [{ account: a12.id, date: ctx.today, balance: 12345, evidence: 'said' }, { account: a13.id, date: ctx.today, balance: 999, evidence: 'said' }], inputs: [{ key: 'salary', label: 'Salary', kind: 'income', amount: 1, from: ctx.today, permanent: true }],
        goals: [{ name: 'Boat', price: 5 }], transactions: [{ account: null, date: ctx.today, amount: -77, desc: 'Snack', category: 'dining' }, { account: a13.id, date: ctx.today, amount: -55, desc: 'Elsewhere', category: 'dining' }], reply: 'Done for this card.' }; }
    if (/coffee/i.test(msg)) return { transactions: [{ account: null, date: ctx.today, amount: -90, desc: 'Coffee', category: 'dining' }], reply: 'Added.' };
    if (/debit card/i.test(msg)) return { reply: 'Noted — ••0012 and ••0013 are your everyday accounts.' };
    const prim = ctx.accounts.find(a => /0012$/.test(a.number)), dep = ctx.recentDeposits.find(d => d.amount === 10000);
    return { balances: [{ account: prim.id, date: ctx.today, balance: 60000, evidence: 'screenshot 1' }],
      inputs: [{ key: 'salary', label: 'Salary', kind: 'income', amount: 36000, from: '2026-11-01', permanent: true, evidence: 'my salary is now 36,000 from November' }],
      thirdParty: dep ? [{ txId: dep.txId, amount: 10000, date: dep.date, person: 'Ali Hassan', note: 'to send back' }] : [],
      installments: [], terms: [], goals: [{ name: 'Laptop', price: 40000, priority: 1, wantBy: '2027-03-31' }],
      transactions: [{ account: null, cash: true, date: ctx.today, amount: -600, desc: 'Dinner', category: 'dining' }],
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
            await ev(f"window.__FIN.show('{node}')"); await pg.wait_for_timeout(60)   # dragged into view
            await pg.click(f'.fin-cvn[data-node="{node}"] b'); await pg.wait_for_timeout(450)
        opened = lambda part: ev(f"window.__AR.UI.fin.cvOpen.includes('sec:{part}') && !!document.getElementById('fin-sec-{part}')")
        await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)
        assert await ev("!!document.getElementById('fin-cv-vp') && !!document.getElementById('fin-talk-in')"), 'the canvas with the talk box under it'
        assert await ev("!document.querySelector('.fin-cvwrap #fin-talk') && !!document.querySelector('.fin-canvas-page > .fin-talk-card #fin-talk')"), 'the draft is part of the page, under the canvas — not inside it'
        assert await ev("document.querySelector('.fin-talk-card').getBoundingClientRect().top >= document.querySelector('.fin-cvwrap').getBoundingClientRect().bottom"), 'below the canvas'
        assert not await ev("!!document.querySelector('.fin-nav, .fin-sec')"), 'no tabs to scroll through'

        # your five accounts are there without asking
        acc = await ev("window.__FIN.prefs().accounts.map(a => [a.name, a.kind, a.number, a.limit || null])")
        print('ACCOUNTS', acc)
        assert acc == [['Primary account ••0012', 'current', '0012', None], ['Account ••0013', 'current', '0013', None], ['Credit card', 'credit_card', '', 50400], ['Halan', 'bnpl', '', None]], acc
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
        await tap('t:update'); await pg.wait_for_selector('#fin-sec-update .fin-daily')
        fld = f'[data-chg="fin-daily"][data-id="{prim}"][data-k="balance"]'
        await pg.fill(fld, '56000'); await pg.press(fld, 'Tab'); await pg.click('[data-act="fin-daily-check"]'); await pg.wait_for_timeout(300); await idle()
        assert not await ev("!!document.querySelector('.fin-preview')"), 'no check-before-saving step'
        assert await ev("window.__FIN.tx().some(t => (t.flags || []).includes('from_balance') && t.amount === -4000)") and await ev("window.__FIN.questions().length") == 0

        # Halan, opened from its branch: its limit and terms
        await pg.keyboard.press('Escape'); await tap('com'); await pg.wait_for_selector('#fin-sec-credit [data-chg="fin-limit"]')
        hi = await ev("window.__FIN.prefs().accounts.findIndex(a => a.kind === 'bnpl')")
        await pg.fill(f'[data-chg="fin-limit"][data-i="{hi}"]', '60000'); await pg.press(f'[data-chg="fin-limit"][data-i="{hi}"]', 'Tab'); await pg.wait_for_timeout(200)
        await pg.select_option(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="method"]', 'flat'); await pg.wait_for_timeout(200)
        await pg.fill(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', '2'); await pg.press(f'[data-chg="fin-terms"][data-i="{hi}"][data-k="rate"]', 'Tab'); await pg.wait_for_timeout(300)
        txt = await pg.text_content('#fin-sec-credit'); assert 'Halan' in txt and '1,033.33' in txt, 'example: 10,000 over 12 months at 2% flat = 1,033.33 a month'

        # purchase goals: their own room on the canvas — the money sources, each goal, the links of how it is paid
        await pg.keyboard.press('Escape')
        for name, price in [('Phone', '15000'), ('Sofa', '120000')]:
            await ev("window.__FIN.show('buy')"); await pg.click('.fin-room[data-room="buy"] .fin-room-h [data-act="fin-cv-add"]'); await pg.wait_for_selector('#fin-cv-ed')
            await pg.fill('#fin-cv-ed [data-k="name"]', name); await pg.fill('#fin-cv-ed [data-k="price"]', price); await pg.click('[data-act="fin-cv-ed-ok"]'); await pg.wait_for_timeout(300); await idle()
        plan = await ev("window.__FIN.buy()"); print('PLAN', [(i['name'], i['rec'], i['fromCash'], i['monthly'], i['ready']) for i in plan['items']], plan['capacity'])
        assert [i['name'] for i in plan['items']] == ['Laptop', 'Phone', 'Sofa'], 'priority order'
        assert await ev("document.querySelectorAll('.fin-leaf.goal').length") == 3 and await ev("document.querySelectorAll('.fin-leaf.src').length") == 4
        assert await ev("document.querySelectorAll('.fin-cv-edges path.fin-link').length") >= 3, 'each goal joined to how it is paid'
        sofa = await ev("window.__FIN.buy().items.find(i => i.name === 'Sofa').id")
        await ev(f"window.__FIN.show('b:{sofa}')"); await pg.wait_for_timeout(500)   # in view first (the test's own move)
        cam = await ev(f"[{U}.cv.x, {U}.cv.y, {U}.cv.k]")
        await pg.click(f'.fin-cvn[data-node="b:{sofa}"] b'); await pg.wait_for_selector(f'#fin-pop[data-pop="b:{sofa}"]'); await pg.wait_for_timeout(450)
        dt = await pg.text_content('#fin-pop'); assert 'Way to pay' in dt and 'Halan instalments' in dt, 'its details pop out on the canvas'
        assert await ev(f"[{U}.cv.x, {U}.cv.y, {U}.cv.k]") == cam, 'the canvas does not move to it'
        assert await ev("(() => { const p = document.getElementById('fin-pop').getBoundingClientRect(), s = document.querySelector('.fin-cv-stage').getBoundingClientRect(); return p.left >= s.left - 1 && p.right <= s.right + 1 && p.top >= s.top - 1 && p.bottom <= s.bottom + 1; })()"), 'the pop-out stays inside the canvas window'
        await ev(f"document.querySelector('[data-act=\"fin-buy-star\"][data-id=\"{sofa}\"]').click()"); await pg.wait_for_timeout(300)
        assert (await ev("window.__FIN.buy()"))['items'][0]['name'] == 'Sofa', 'focus mode puts the chosen item first'
        await ev("document.querySelector('[data-act=\"fin-buy-focus\"][data-v=\"0\"]').click()"); await pg.wait_for_timeout(300)
        assert (await ev("window.__FIN.buy()"))['items'][0]['name'] == 'Laptop', 'back to all goals'
        assert await ev("!!document.querySelector('.fin-det[data-det=\"gt\"] .fin-tl')"), 'the timeline'
        await ev("window.__FIN.show('buy')"); await pg.wait_for_timeout(200); await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-buy.png'))
        # removing asks nothing: it is done, and Undo brings it back
        phone = await ev("window.__FIN.buy().items.find(i => i.name === 'Phone').id")
        await ev(f"window.__FIN.edit('b:{phone}')"); await pg.wait_for_selector('#fin-cv-ed'); await pg.click('[data-act="fin-cv-ed-del"]'); await pg.wait_for_timeout(300)
        assert not await ev("window.__FIN.prefs().buys.some(b => b.name === 'Phone')")
        await pg.click('#fin-talk-feed .fin-msg.edit:last-child [data-act="fin-talk-undo"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.prefs().buys.some(b => b.name === 'Phone')"), 'Undo brings it back'

        # the canvas: rooms; every former tab opens as a room on it, every card unfolds its details in place
        await ev(f"{U}.cvOpen = []; window.__AR.render && 0"); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200)
        rooms = await ev("[...document.querySelectorAll('.fin-room')].map(r => r.dataset.room)"); print('ROOMS', rooms)
        for k in ('ov', 'buy', 'accts', 'inc', 'exp', 'com', 'own', 'third', 'auto'): assert k in rooms, k
        for node, part in [('ov', 'dash'), ('t:import', 'import'), ('t:ledger', 'ledger'), ('t:budget', 'budget'), ('t:sim', 'sim'), ('t:forecast', 'forecast'), ('accts', 'accounts'), ('inc', 'inc'), ('exp', 'exp'), ('own', 'own')]:
            await tap(node)
            assert await opened(part), (node, part)
            assert await ev(f"document.querySelector('.fin-cvn[data-node=\"{node}\"]').classList.contains('sel')"), 'the open part is marked'
        assert len([x for x in await ev(f"{U}.cvOpen") if x.startswith('sec:')]) <= 3, 'at most three parts open at once'
        assert not await ev("!!document.getElementById('fin-panel')"), 'no side window'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-canvas-rooms.png'))
        await pg.click('[data-act="fin-cv-close-all"]'); await pg.wait_for_timeout(200)
        n_before = await ev("[...document.querySelectorAll('.fin-leaf')].map(c => c.style.top).join()")
        await tap(f'a:{prim}'); await pg.wait_for_selector(f'#fin-pop[data-pop="a:{prim}"] .fin-chart')
        assert await ev("document.getElementById('fin-pop').classList.contains('enter')"), 'it pops out with its animation'
        assert 'Latest' in await pg.text_content('#fin-pop'), 'an account pops out with its chart and latest transactions'
        assert await ev("[...document.querySelectorAll('.fin-leaf')].map(c => c.style.top).join()") == n_before, 'nothing on the canvas moves'
        # the canvas stays usable with it open: another card swaps it, a drag still moves the canvas
        other = await ev(f"[...document.querySelectorAll('.fin-leaf[data-node^=\"a:\"]')].map(c => c.dataset.node).find(n => n !== 'a:{prim}')")
        await tap(other); await pg.wait_for_selector(f'#fin-pop[data-pop="{other}"]'); await tap(f'a:{prim}'); await pg.wait_for_selector(f'#fin-pop[data-pop="a:{prim}"]')
        await ev(f"document.querySelector('#fin-pop [data-act=\"fin-acct-ledger\"][data-id=\"{prim}\"]').click()"); await pg.wait_for_timeout(500)
        assert await ev(f"{U}.l.acct") == prim and await opened('ledger'), 'and opens all its transactions as a room'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300); assert not await ev("!!document.getElementById('fin-pop')"), 'Esc puts the pop-out away first'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(200); assert not await opened('ledger'), 'then closes the last part opened'
        # fold a room, show one room, zoom, move, fit, full screen
        n0 = await ev("document.querySelectorAll('.fin-leaf').length")
        await ev("window.__FIN.show('exp')"); await pg.click('.fin-room[data-room="exp"] [data-act="fin-cv-tog"]'); await pg.wait_for_timeout(250)
        n1 = await ev("document.querySelectorAll('.fin-leaf').length"); assert n1 < n0 and await ev(f"{U}.cvCol.has('exp')")
        await ev("document.querySelector('.fin-room[data-room=\"accts\"] [data-act=\"fin-cv-focus\"]').click()"); await pg.wait_for_timeout(250)
        assert await ev("[...document.querySelectorAll('.fin-room')].map(r => r.dataset.room).join()") == 'accts', 'only the chosen room'
        await pg.click('[data-act="fin-cv-focus"][data-id=""]'); await pg.wait_for_timeout(250)
        k0 = await ev(f"{U}.cv.k"); await pg.click('[data-act="fin-cv-zoom"][data-v="in"]'); await pg.wait_for_timeout(500); k1 = await ev(f"{U}.cv.k")
        assert 1.12 < k1 / k0 < 1.18, ('the zoom button: about 15%, not a jump', k0, k1)
        # a wheel notch with Ctrl: a small step that glides (in between values on the way, never a jump)
        vpb = await pg.locator('#fin-cv-vp').bounding_box(); await pg.mouse.move(vpb['x'] + vpb['width'] / 2, vpb['y'] + vpb['height'] / 2)
        await pg.keyboard.down('Control'); await pg.mouse.wheel(0, -100); await pg.keyboard.up('Control')
        mid = await ev(f"new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({U}.cv.k))))"); await pg.wait_for_timeout(600); k2 = await ev(f"{U}.cv.k")
        print('ZOOM', round(k0, 3), round(k1, 3), round(mid, 3), round(k2, 3)); assert 1.08 < k2 / k1 < 1.16 and k1 < mid < k2, 'a smooth, small step'
        # moving around is smooth too: a wheel notch glides, a quick drag let go slides on and slows down, arrows glide
        frame2 = f"new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({U}.cv.y))))"
        y0 = await ev(f"{U}.cv.y"); await pg.mouse.wheel(0, 100); ym = await ev(frame2); await pg.wait_for_timeout(600); y1 = await ev(f"{U}.cv.y")
        print('PAN', round(y0), round(ym), round(y1)); assert abs((y0 - y1) - 100) < 2 and y1 < ym < y0, 'a wheel notch glides 100px'
        cx0, cy0 = vpb['x'] + vpb['width'] * 0.75, vpb['y'] + vpb['height'] - 40
        await pg.mouse.move(cx0, cy0); await pg.mouse.down()
        for i in range(1, 9): await pg.mouse.move(cx0 - i * 25, cy0, steps=1); await pg.wait_for_timeout(8)
        await pg.mouse.up(); xr = await ev(f"{U}.cv.x"); await pg.wait_for_timeout(700); xs = await ev(f"{U}.cv.x")
        print('FLING', round(xr), round(xs)); assert xs < xr - 15, 'let go while moving: it slides on'
        x0 = await ev(f"{U}.cv.x")
        await ev("document.activeElement && document.activeElement.blur()"); await pg.keyboard.press('ArrowRight'); await pg.wait_for_timeout(700)
        assert abs((x0 - await ev(f"{U}.cv.x")) - 160) < 2, 'an arrow key glides 160px'
        vp = await pg.locator('#fin-cv-vp').bounding_box(); x0 = await ev(f"{U}.cv.x")
        await pg.mouse.move(vp['x'] + vp['width'] - 160, vp['y'] + vp['height'] - 20); await pg.mouse.down(); await pg.mouse.move(vp['x'] + vp['width'] - 60, vp['y'] + vp['height'] - 10, steps=5); await pg.mouse.up()   # away from the minimap in the corner
        await pg.wait_for_timeout(700); assert await ev(f"{U}.cv.x") - x0 >= 98, 'dragging moves the canvas (and a quick drag slides on a little)'
        await pg.click('[data-act="fin-cv-fit"]')
        await pg.click('[data-act="fin-cv-full"]'); await pg.wait_for_timeout(250)
        assert await ev("document.querySelector('.fin-cvwrap').classList.contains('full')")
        assert not await ev("!!document.querySelector('#fin-talk-in, .fin-cv-hint, .fin-tabs, .fin-cv-bar')"), 'full screen: the canvas only'
        st = await ev("(() => { const r = document.querySelector('.fin-cv-stage').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), innerWidth, innerHeight]; })()")
        assert st[0] >= st[2] - 2 and st[1] >= st[3] - 2, ('the canvas fills the screen', st)
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-fullscreen.png'))
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250); assert not await ev("document.querySelector('.fin-cvwrap').classList.contains('full')")

        # one card saved twice (same number; some statements on the copy): opening Money joins them — every
        # transaction kept, said in the conversation, Undo puts it back; no second card is made again
        n_tx = await ev("window.__FIN.tx().length")
        dup = await ev("""(() => { const St = window.__AR.St, p = JSON.parse(JSON.stringify(St.cols.prefs.get('finance'))), card = p.accounts.find(a => a.kind === 'credit_card' && a.number);
          const copy = { ...card, id: 'acdupcopy0001', preset: undefined, createdAt: '2099-01-01T00:00:00Z' }; p.accounts.push(copy); p.updatedAt = new Date().toISOString(); St.cols.prefs.set('finance', p);
          let moved = 0; for (const d of St.cols.fintx.values()) { let hit = false; for (const t of d.tx || []) if (t.acct === card.id && moved < 20 && t.date >= '2026-09-01') { t.acct = copy.id; moved++; hit = true; } if (hit) d.updatedAt = new Date().toISOString(); }
          return { card: card.id, moved, cards: p.accounts.filter(a => a.kind === 'credit_card').length }; })()""")
        print('DUP', dup); assert dup['moved'] > 0 and dup['cards'] == 2
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(600)
        cards = await ev("window.__FIN.prefs().accounts.filter(a => a.kind === 'credit_card').map(a => a.id)")
        assert cards == [dup['card']], ('one card again, the first one kept', cards)
        assert await ev("window.__FIN.tx().length") == n_tx and await ev(f"window.__FIN.tx().filter(t => t.acct === 'acdupcopy0001').length") == 0, 'every transaction kept, now on the one card'
        assert 'joined' in await pg.text_content('#fin-talk-feed'), 'the conversation says what was joined'
        await pg.click('#fin-talk-feed .fin-msg:last-child [data-act="fin-talk-undo"]'); await pg.wait_for_timeout(300)
        assert await ev("window.__FIN.prefs().accounts.filter(a => a.kind === 'credit_card').length") == 2, 'Undo puts the copy back'
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(600)
        assert await ev("window.__FIN.prefs().accounts.filter(a => a.kind === 'credit_card').length") == 2, 'a join you undid is not redone by itself'
        # a statement for a card already there (same number) goes to it, never to a new account
        n_acc = await ev("window.__FIN.prefs().accounts.length")
        await ev("window.__FIN.open('import')"); await pg.wait_for_timeout(200); await pg.click('[data-act="fin-kind"][data-k="credit_card"]'); await pg.set_input_files('input[data-chg="fin-files"]', [f('CARD_SEP.pdf')])
        for _ in range(100):
            if await ev("(window.__AR.UI.fin.queue || []).length && window.__AR.UI.fin.queue.every(q => ['done', 'error'].includes(q.state))"): break
            await pg.wait_for_timeout(200)
        assert await ev("window.__FIN.prefs().accounts.length") == n_acc, 'no second card'
        await ev("window.__FIN.open('map')"); await pg.wait_for_timeout(300)

        # statements for ••0012 / ••0013, described in words that mention cards: each goes to its own account (its number
        # decides, even with the debit card's number shown first), read as an everyday account — debit-card purchases
        # are spending there, never credit-card lines or card payments
        n_acc = await ev("window.__FIN.prefs().accounts.length")
        m = await say('These are the statements for my 012 and 013 accounts. I use them directly with my debit card — they are not credit card transactions.', [f('nbe statement 013.csv')])
        a13 = await ev("window.__FIN.prefs().accounts.find(a => a.number && a.number.endsWith('0013'))")
        assert a13['kind'] == 'current' and await ev("window.__FIN.prefs().accounts.length") == n_acc, ('to ••0013, an everyday account; no new account', a13['kind'])
        lines = await ev(f"window.__FIN.tx().filter(t => t.acct === '{a13['id']}').map(t => [t.desc, t.amount, t.cat])"); print('0013', lines)
        assert any('SPINNEYS' in d and amt == -850 and c != 'ccpay' for d, amt, c in lines) and any('ZARA' in d and amt == -1200 for d, amt, c in lines), 'debit-card purchases are spending from ••0013'
        assert not await ev("window.__FIN.tx().some(t => /SPINNEYS|ZARA CITY/.test(t.desc) && window.__FIN.prefs().accounts.find(a => a.id === t.acct).kind === 'credit_card')"), 'never on the credit card'

        # ••0012 is the default account: money told with no account goes there (cash only when it was cash); a new
        # transaction starts there; the canvas and Settings show it
        a12 = await ev("window.__FIN.prefs().accounts.find(a => a.number && a.number.endsWith('0012'))")
        assert await ev("window.__FIN.prefs().defaultAcct") == a12['id'], 'the default account is ••0012'
        await say('I paid 90 for coffee this morning')
        assert await ev(f"window.__FIN.tx().some(t => t.acct === '{a12['id']}' && t.amount === -90)"), 'no account named: the default account, not cash'
        assert 'default' in await ev(f"document.querySelector('[data-node=\"a:{a12['id']}\"]').textContent"), 'the canvas card says default'
        await pg.click('[data-act="fin-new-tx"]'); await pg.wait_for_timeout(300)
        assert await ev("document.getElementById('ft-acct').value") == a12['id'], 'a new transaction starts on the default account'
        await ev("document.querySelector('[data-act=\"close-drawer\"]').click()"); await pg.wait_for_timeout(200)

        # Tell the canvas in a window on the canvas: from the toolbar (or T), moved by its title, back under the canvas
        await pg.click('.fin-cv-bar [data-act="fin-talk-win"]'); await pg.wait_for_timeout(300)
        assert await ev("!!document.querySelector('.fin-cv-stage #fin-talk-win #fin-talk-in') && document.querySelectorAll('#fin-talk-in').length === 1"), 'the conversation is in the window on the canvas'
        assert 'open in a window' in await pg.text_content('.fin-talk-card'), 'the box under the canvas points to it'
        hb = await pg.locator('#fin-talk-win-h').bounding_box(); w0 = await pg.locator('#fin-talk-win').bounding_box()
        await pg.mouse.move(hb['x'] + 40, hb['y'] + hb['height'] / 2); await pg.mouse.down(); await pg.mouse.move(hb['x'] - 160, hb['y'] - 120, steps=6); await pg.mouse.up()
        w1 = await pg.locator('#fin-talk-win').bounding_box(); assert w1['x'] < w0['x'] - 100 and w1['y'] < w0['y'] - 20, ('moved by its title (kept inside the canvas)', w0, w1)
        await ev("document.activeElement && document.activeElement.blur()"); await pg.keyboard.press('t'); await pg.wait_for_timeout(250)
        assert not await ev("!!document.getElementById('fin-talk-win')") and await ev("!!document.querySelector('.fin-talk-card #fin-talk-in')"), 'T closes it; back under the canvas'
        # right-click a card: its menu; "Tell the canvas about this card" talks about that card only
        a12 = await ev("window.__FIN.prefs().accounts.find(a => a.number && a.number.endsWith('0012'))"); a13 = await ev("window.__FIN.prefs().accounts.find(a => a.number && a.number.endsWith('0013'))")
        await ev(f"window.__FIN.show('a:{a12['id']}')"); await pg.wait_for_timeout(500)
        await pg.click(f'.fin-cvn[data-node="a:{a12["id"]}"]', button='right'); await pg.wait_for_timeout(250)
        items = await ev("[...document.querySelectorAll('#fin-menu .fin-menu-i')].map(b => b.textContent.trim())"); print('MENU', items)
        assert any('Tell the canvas about this card' in x for x in items) and any('Edit' in x for x in items) and any('Its transactions' in x for x in items) and any('Zoom' in x for x in items), items
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(150); assert not await ev("!!document.getElementById('fin-menu')"), 'Escape closes the menu'
        await pg.click(f'.fin-cvn[data-node="a:{a12["id"]}"]', button='right'); await pg.wait_for_timeout(200)
        await pg.click('#fin-menu [data-k="talk"]'); await pg.wait_for_timeout(300)
        assert await ev("!!document.querySelector('#fin-talk-win .fin-about')") and a12['name'] in await pg.text_content('#fin-talk-win .fin-about'), 'the window says which card'
        l13 = await ev(f"window.__FIN.latest('{a13['id']}').balance"); sal0 = await ev("JSON.stringify((window.__FIN.prefs().inputs || []).filter(i => i.key === 'salary'))"); goals0 = await ev("(window.__FIN.prefs().goals || []).length + (window.__FIN.prefs().buys || []).length")
        n0 = await ev("window.__FIN.tx().length")
        await say('Only this card: the balance today is 12,345 and I bought a snack for 77')
        pr = await ev("window.__prompts.filter(p => /^You update a personal finance tool/.test(p.prompt)).pop().prompt")
        assert 'THIS MESSAGE IS ABOUT ONE CARD ON THE CANVAS ONLY' in pr and a12['name'] in pr.split('THIS MESSAGE IS ABOUT ONE CARD')[1], 'Claude is told which card'
        assert await ev(f"window.__FIN.latest('{a12['id']}').balance") == 12345, 'that card changed'
        assert await ev(f"window.__FIN.latest('{a13['id']}').balance") == l13, 'another account did not'
        assert await ev("JSON.stringify((window.__FIN.prefs().inputs || []).filter(i => i.key === 'salary'))") == sal0, 'income did not change'
        assert await ev("(window.__FIN.prefs().goals || []).length + (window.__FIN.prefs().buys || []).length") == goals0, 'no new goal'
        assert await ev(f"window.__FIN.tx().some(t => t.acct === '{a12['id']}' && t.amount === -77)") and not await ev("window.__FIN.tx().some(t => t.desc === 'Elsewhere')"), 'its own spending only'
        feed = await pg.text_content('#fin-talk-feed'); assert 'Kept to' in feed and 'about ' + a12['name'] in feed, 'what was left alone is listed; the message shows its card'
        await pg.click('#fin-talk-win [data-act="fin-about-clear"]'); await pg.wait_for_timeout(150); assert not await ev("!!document.querySelector('.fin-about')"), 'back to the whole canvas'
        await pg.click('#fin-talk-win [data-act="fin-talk-win"][data-v="close"]'); await pg.wait_for_timeout(200)
        # in full screen the window is there too
        await pg.click('[data-act="fin-cv-full"]'); await pg.wait_for_timeout(250); await ev("document.activeElement && document.activeElement.blur()"); await pg.keyboard.press('t'); await pg.wait_for_timeout(250)
        assert await ev("!!document.querySelector('.fin-cvwrap.full #fin-talk-win #fin-talk-in')"), 'Tell the canvas in full screen'
        await pg.click('#fin-talk-win [data-act="fin-talk-win"][data-v="close"]'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(250)

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
            if add: await pg.click(f'.fin-room[data-room="{node}"] .fin-room-h [data-act="fin-cv-add"]')
            else: await pg.hover(f'.fin-cvn[data-node="{node}"]'); await pg.click(f'.fin-cvn[data-node="{node}"] [data-act="fin-cv-edit"]')
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
        assert '45,000' in await pg.text_content(f'.fin-leaf[data-node="b:{lap}"]'), 'the goals map shows the canvas edit'
        await pg.click('[data-act="fin-cv-all"][data-v="open"]'); await pg.wait_for_timeout(300)
        cat = await ev("document.querySelector('.fin-leaf.editable[data-node^=\"c:\"]').dataset.node")
        await edit(cat, {'budget': '5000'}); assert await ev(f"window.__FIN.prefs().budgets['{cat[2:]}']") == 5000
        await ev("window.__FIN.show('exp')"); await pg.click('.fin-room[data-room="exp"] [data-act="fin-cv-tog"]'); await pg.wait_for_timeout(200)   # folded again, as before
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

        # a complete board: what is coming up and needs attention, find, go to, minimap, keys, trends
        assert await ev("!!document.querySelector('.fin-room[data-room=\"next\"]')"), 'the Coming up & attention room'
        up = await ev("window.__FIN.upcoming()"); kinds = {e['kind'] for e in up['events']}; print('UPCOMING', len(up['events']), sorted(kinds), up['low'])
        assert 'card' in kinds and 'instalment' in kinds and up['points'], 'the card bill and instalments ahead, with the cash they leave'
        assert await ev("!!document.querySelector('.fin-det[data-det=\"up\"] .fin-chart')") and await ev("document.querySelectorAll('.fin-up-ev').length") >= 3
        al = await ev("window.__FIN.alerts()"); print('ALERTS', [(a['sev'], a['label']) for a in al]); assert al and await ev("document.querySelectorAll('.fin-leaf.alert').length") == len(al)
        await tap(al[0]['id']); await pg.wait_for_selector(f'#fin-pop[data-pop="{al[0]["id"]}"]'); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="fin-cv-all"][data-v="open"]'); await pg.wait_for_timeout(300)
        assert await ev("document.querySelectorAll('.fin-spark').length") >= 3 and await ev("document.querySelectorAll('.fin-leaf.goal .fin-prog').length") >= 1, 'trend lines and goal progress on the cards'
        await ev("window.__FIN.show('exp')"); await pg.click('.fin-room[data-room="exp"] [data-act="fin-cv-tog"]'); await pg.wait_for_timeout(200)   # folded again, as before
        await pg.fill('#fin-cv-q', 'shop one'); await pg.wait_for_timeout(200)
        hits = await ev(f"{U}.cvHits"); print('FIND', hits, await pg.text_content('#fin-cv-qn')); assert hits and 'transaction' in await pg.text_content('#fin-cv-qn')
        x0 = await ev(f"{U}.cv.x"); await pg.press('#fin-cv-q', 'Enter'); await pg.wait_for_timeout(500); assert await ev(f"{U}.cv.x") != x0 or await ev(f"document.querySelector('.fin-cvn[data-node=\"{hits[0]}\"]').classList.contains('fresh')"), 'Enter goes to it'
        await pg.click('#fin-cv-qn [data-act="fin-cv-q-tx"]'); await pg.wait_for_timeout(500); assert await opened('ledger') and await ev(f"{U}.l.q") == 'shop one', 'its transactions as a room'
        await pg.fill('#fin-cv-q', ''); await pg.wait_for_timeout(100); await pg.click('[data-act="fin-cv-close-all"]'); await pg.wait_for_timeout(200)
        await pg.select_option('select[data-chg="fin-cv-goto-room"]', 'own'); await pg.wait_for_timeout(500)
        inroom = await ev("(() => { const r = document.querySelector('.fin-room[data-room=\"own\"]').getBoundingClientRect(), v = document.getElementById('fin-cv-vp').getBoundingClientRect(); return r.top >= v.top - 2 && r.left >= v.left - 2 && r.right <= v.right + 2; })()"); assert inroom, 'Go to shows the whole room'
        await pg.mouse.click(10, 10); await pg.keyboard.press('1'); await pg.wait_for_timeout(500)
        assert await ev("(() => { const r = document.querySelector('.fin-room[data-room=\"ov\"]').getBoundingClientRect(), v = document.getElementById('fin-cv-vp').getBoundingClientRect(); return r.top >= v.top - 2 && r.left >= v.left - 2; })()"), 'key 1: the first room'
        k1 = await ev(f"{U}.cv.k"); await pg.keyboard.press('+'); await pg.wait_for_timeout(600); assert await ev(f"{U}.cv.k") > k1
        await pg.keyboard.press('0'); await pg.wait_for_timeout(450); assert await ev(f"{U}.cv.k") < k1 + 0.01, 'key 0: fit'
        await pg.keyboard.press('?'); await pg.wait_for_timeout(250); assert await ev("!!document.querySelector('.fin-cv-keys')") and await ev("document.getElementById('modal').hidden"), 'the canvas keys, not the app’s'
        await pg.keyboard.press('?'); await pg.wait_for_timeout(200)
        await pg.keyboard.press('f'); await pg.wait_for_timeout(300); assert await ev("!!document.querySelector('.fin-cvwrap.full')"); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(300)
        mb = await pg.locator('#fin-mini').bounding_box(); x0 = await ev(f"{U}.cv.x")
        await pg.mouse.click(mb['x'] + mb['width'] * 0.8, mb['y'] + mb['height'] * 0.8); await pg.wait_for_timeout(200); assert await ev(f"{U}.cv.x") != x0, 'the minimap takes you there'
        # double-click a room's title: zoom to the room, nothing opens
        await ev("window.__FIN.show('com')"); await pg.wait_for_timeout(300); n_open = await ev(f"{U}.cvOpen.length")
        await pg.dblclick('.fin-room-t[data-node="com"] b'); await pg.wait_for_timeout(600)
        assert await ev(f"{U}.cvOpen.length") == n_open, 'a double-click zooms, it does not open the part'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-complete.png'))

        # questions are answered and change nothing; asking to see something opens it
        t0 = await ev("window.__FIN.tx().length"); m = await say('How much did I spend on food in September?')
        assert 'groceries' in m['reply'] and not m.get('changes') and await ev("window.__FIN.tx().length") == t0
        m = await say('show me my card'); assert await opened('credit') and m['reply'] == 'Here is your card.'
        await pg.keyboard.press('Escape')
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-canvas.png'))

        # the conversation is saved with your data (its own record, apart from the settings)
        saved = await ev("""async () => { const db = await claude.use('db'), St = window.__AR.St; await new Promise(r => setTimeout(r, 800)); const d = await db.doc('data/users/' + St.uid + '/register/fintalk/feed').get(); return d.exists ? d.data().items.length : 0; }""")
        print('SAVED TALK', saved); assert saved >= 8
        # after a reload: the fold is remembered
        await pg.reload(); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1500); await pg.click('[data-nav="finance"]'); await pg.wait_for_timeout(600)
        assert await ev(f"{U}.cvCol.has('exp')"), 'the fold is remembered'
        bad = [e for e in errors if 'PAGEERROR' in e or 'DIALOG' in e]; assert not bad, bad
        print('FINANCE 2 E2E PASSED'); await b.close()

asyncio.run(main())
