"""Money canvas — the pipelines between the boxes explain themselves. On every layout each channel says its step in the
money's journey and where the money goes ("③ your pocket → Expenses"), how much moves a month and its share of income,
and what happens at that hand-off; an arrowhead points the way the money moves. Tapping the words opens a window: what
moves, what happens, why it matters, what it is made of, and the whole journey — any step can be followed from there."""
import asyncio, os, sys
os.environ['AR_PAGE'] = 'action-register-lite.html'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *

FX = os.path.join(HERE, 'shots', 'monthfx', 'six_months_0012.csv')   # written by e2e_month.py (same six months)

async def main():
    if not os.path.exists(FX):
        import runpy; runpy.run_path(os.path.join(HERE, 'e2e_month.py'), run_name='fixture')   # writes the statement only
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
        C = await ev("window.__FIN.chans()"); n = await ev("window.__FIN.now()")
        # 1. one meaning per channel, the same figures as everywhere
        assert C['spend']['amt'] == n['spending'] and C['spend']['pct'] == round(n['spending'] / n['income'] * 100), 'spending: the usual month, as a share of income'
        assert C['debt']['amt'] == n['instMonthly'] == 1500, 'liabilities: the instalment running today'
        assert C['earn']['title'] == '① Earned income → your pocket' and C['spend']['title'] == '③ your pocket → Expenses', 'a step and where the money goes'
        want = {'mind': ['earn', 'passive', 'spend', 'debt', 'choices', 'invest', 'pays', 'costs'], 'rich': ['job', 'spendR', 'investR', 'pays', 'costs'], 'flow': ['rin', 'rexp', 'rcom', 'rsave']}
        for mode, keys in want.items():
            await ev(f"window.__FIN.mode('{mode}')"); await pg.wait_for_timeout(1200)
            tags = await ev("Object.fromEntries([...document.querySelectorAll('#fin-cv-world .ch-tag')].map(g => [g.dataset.id, g.textContent.replace(/\\s+/g, ' ').trim()]))")
            heads = await ev("document.querySelectorAll('#fin-cv-world .ch-head').length")
            print(mode, heads, tags)
            for k in keys:
                assert k in tags, f'{mode}: the {k} channel has its words'
                t = tags[k]; assert '→' in t and ('a month' in t or '/month' in t), f'{mode} {k}: where the money goes, and how much a month — {t}'
                assert C[k]['how'] in t or (mode == 'flow'), f'{mode} {k}: what happens at the hand-off'
            assert heads >= len(keys), f'{mode}: an arrowhead on every channel'
        # 2. tap the words: what moves, what happens, why — and the whole journey
        await ev("window.__FIN.mode('mind')"); await pg.wait_for_timeout(1200); await ev("window.__FIN.show('exp')"); await pg.wait_for_timeout(1200)
        box = await ev("(() => { const r = document.querySelector('#fin-cv-world .ch-tag[data-id=\"spend\"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
        await ev(f"(() => {{ const c = window.__AR.UI.fin.cv; c.x -= {box[0]} - 700; c.y -= {box[1]} - 480; c.user = true; window.__FIN.open('map'); }})()"); await pg.wait_for_timeout(900)
        box = await ev("(() => { const r = document.querySelector('#fin-cv-world .ch-tag[data-id=\"spend\"]').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()")
        await pg.mouse.click(box[0], box[1]); await pg.wait_for_selector('#fin-ch-win')
        win = await ev("""(() => { const w = document.querySelector('#fin-ch-win'); return { title: w.querySelector('.fin-talk-win-h b').textContent, kv: [...w.querySelectorAll('.fin-ch-kv dt')].map(d => d.textContent), made: [...w.querySelectorAll('.fin-box-list b:first-child')].map(b => b.textContent), steps: [...w.querySelectorAll('.fin-ch-steps li')].map(l => l.textContent.replace(/\\s+/g, ' ').trim()), on: w.querySelector('.fin-ch-steps li.on').textContent }; })()""")
        print('WINDOW', win)
        assert win['title'] == '③ your pocket → Expenses' and win['kv'] == ['What moves', 'What happens here', 'Why it matters'], 'the window explains the channel'
        assert any('Groceries' in m for m in win['made']), 'made of: the spending categories behind it'
        assert len(win['steps']) >= 8 and win['steps'][0].startswith('①') and 'Expenses' in win['on'], 'the whole journey, this step marked'
        assert await ev("[...document.querySelectorAll('#fin-cv-world .ch-sel')].map(g => g.dataset.ch).join()") == 'exp', 'the channel stands out on the canvas; the others step back'
        await pg.screenshot(path=os.path.join(HERE, 'shots', 'finance-channel-window.png'))
        # follow the money: another step from the journey
        await pg.click('#fin-ch-win .fin-ch-steps [data-id="invest"]'); await pg.wait_for_timeout(500)
        assert (await ev("document.querySelector('#fin-ch-win .fin-talk-win-h b').textContent")).startswith('⑥'), 'a step of the journey opens that channel'
        assert await ev("[...document.querySelectorAll('#fin-cv-world .ch-sel')].map(g => g.dataset.ch).join()") == 'mm-assets'
        await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        assert not await ev("!!document.querySelector('#fin-ch-win')") and not await ev("document.getElementById('fin-cv-world').classList.contains('ch-focus')"), 'Esc closes it; every channel is back'
        await b.close()
        if errors: print('\n'.join(errors)); sys.exit(1)
        print('CHANNELS OK')
if __name__ == '__main__': asyncio.run(main())
