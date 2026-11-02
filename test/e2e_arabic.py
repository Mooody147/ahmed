"""Arabic interface: switch language, pages are translated and right to left, user data untouched, canvas left to right, back to English."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)
LEFT = """(() => { const out = []; const w = document.createTreeWalker(document.querySelector('#main'), NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const p = n.parentElement; if (!p || p.closest('.mnode,.bodytext,.preview,[dir=auto],.mono,textarea,svg,script,style,.subj,.ttitle,.t-title')) continue; const t = n.nodeValue.trim(); if (/[A-Za-z]{3}/.test(t) && !/[\u0600-\u06FF]/.test(t) && !/^(PDF|ELM|Excel|Word|RFI|CSV|Rev|Gmail|Outlook|AI|Claude|OK|kW|DN|NPSH|TDH|EGP|USD|SAR|AED|EUR)$/i.test(t)) out.push(t); }
  return out; })()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await (await b.new_context(viewport={'width': 1440, 'height': 950})).new_page()
        pg.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_FAILED' not in m.text else None)
        await pg.route('**/*', route); await pg.goto('https://app.test/'); await pg.wait_for_selector('h1'); await pg.wait_for_timeout(1200); await idle(pg)
        ev = pg.evaluate
        await pg.fill('#su-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-quick-setup"]')
        await pg.click('.rail [data-nav="review"]'); await pg.wait_for_timeout(200); await pg.click('[data-act="approve-all"]'); await pg.wait_for_timeout(400)
        title = await ev("[...window.__AR.St.tasks.values()][0].title")
        await pg.click('.rail [data-nav="setup"]'); await pg.click('[data-act="ui-pref"][data-key="lang"][data-val="ar"]'); await pg.wait_for_timeout(500)
        assert await ev("document.documentElement.dir") == 'rtl' and await ev("document.documentElement.lang") == 'ar'
        rail = await ev("[...document.querySelectorAll('.rail [data-nav]')].map(b=>b.textContent.trim())"); print('RAIL', rail)
        assert rail[0].startswith('المهام') and 'الإعدادات' in rail and any(r.startswith('المال') for r in rail)
        stats = {}
        for v in ['todo', 'daily', 'review', 'import', 'emails', 'docs', 'insights', 'plan', 'notebook', 'money', 'tools', 'setup']:
            await pg.click(f'.rail [data-nav="{v}"]'); await pg.wait_for_timeout(350)
            left = await ev(LEFT); stats[v] = len(left)
            if v in ('todo', 'tools', 'money', 'setup'): await pg.screenshot(path=SHOTS + f'/ar-{v}.png')
            if left: print(v, 'still English:', left)
        print('UNTRANSLATED', stats)
        assert sum(stats.values()) < 60, stats
        # data stays as written; the canvas stays left to right
        await pg.click('.rail [data-nav="todo"]'); await pg.click('[data-act="todo-mode"][data-mode="list"]'); await pg.wait_for_timeout(300)
        assert title in await pg.text_content('#main'), 'task titles are not translated'
        await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.wait_for_timeout(500)
        assert await ev("getComputedStyle(document.querySelector('#map-vp')).direction") == 'ltr'
        # toasts and dialogs that appear later are translated too
        await pg.click('.rail [data-nav="money"]'); await pg.click('[data-act="mon-new"][data-kind="expense"]'); await pg.wait_for_selector('.mon-form')
        assert 'إلغاء' in await pg.text_content('.mon-form') and 'حفظ' in await pg.text_content('.mon-form')
        await pg.click('.mon-form [data-act="close-modal"]')
        # numbers inside sentences are kept
        assert await ev("window.__AR_TR.arText('3 tasks proposed.')") == '3 مهام مقترحة.'
        # back to English
        await pg.click('.rail [data-nav="setup"]'); await pg.click('[data-act="ui-pref"][data-key="lang"][data-val="en"]'); await pg.wait_for_timeout(600)
        assert await ev("document.documentElement.dir") == 'ltr' and 'To-do' in await pg.text_content('.rail [data-nav="todo"]')
        print('ERRORS', errors); assert not errors
        print('ARABIC E2E PASSED')
        await b.close()

asyncio.run(main())
