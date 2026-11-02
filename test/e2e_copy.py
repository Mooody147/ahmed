import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from harness import *
SHOTS = os.path.join(HERE, 'shots'); os.makedirs(SHOTS, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        await ctx.grant_permissions(['clipboard-read','clipboard-write'],origin='https://app.test')
        pg=await ctx.new_page(); pg.on('pageerror',lambda e: errors.append(str(e)))
        await pg.route('**/*',route); await pg.goto('https://app.test/#import'); await pg.wait_for_selector('.fwd-addr')
        print('ADDR',await pg.inner_text('#fwd-addr-text'))
        await pg.click('[data-act="copy-addr"]'); await pg.wait_for_timeout(300)
        print('CLIP',await pg.evaluate("navigator.clipboard.readText()"))
        print('overflow',await pg.evaluate("document.documentElement.scrollWidth>innerWidth"))
        await pg.wait_for_timeout(1500); await pg.locator('.fwd-addr').screenshot(path=SHOTS+'/30-copy.png')
        print('ERRORS',errors); await b.close()
asyncio.run(main())
