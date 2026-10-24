"""Shared Playwright harness: serves dist/action-register.html with a mocked
claude.ai artifact runtime (test/mock.js) and maps CDN libraries to node_modules."""
import os, base64, json
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CDN = {'pdfjs-dist@3.11.174/build/pdf.min.js': 'node_modules/pdfjs-dist/build/pdf.min.js',
       'pdfjs-dist@3.11.174/build/pdf.worker.min.js': 'node_modules/pdfjs-dist/build/pdf.worker.min.js',
       'xlsx@0.18.5/dist/xlsx.full.min.js': 'node_modules/xlsx/dist/xlsx.full.min.js',
       'mammoth@1.8.0/mammoth.browser.min.js': 'node_modules/mammoth/mammoth.browser.min.js',
       'jszip@3.10.1/dist/jszip.min.js': 'node_modules/jszip/dist/jszip.min.js',
       'docx@8.5.0/build/index.umd.js': 'node_modules/docx/build/index.umd.js',
       'exceljs@4.4.0/dist/exceljs.min.js': 'node_modules/exceljs/dist/exceljs.min.js'}
FX = os.path.join(HERE, 'fixtures')
def gmail_fixtures_js():
    fx = {}
    for i, f in enumerate(['fwd_attachment', 'fwd_inline', 'fwd_gmail']):
        fx['m%d' % i] = base64.urlsafe_b64encode(open(os.path.join(FX, f + '.eml'), 'rb').read()).decode().rstrip('=')
    return 'window.__GMFX=' + json.dumps(fx) + ';'
def skeleton(no_gmail=False):
    page = open(os.path.join(ROOT, 'dist', 'action-register.html')).read()
    pre = '<script>window.__noGmail=true;</script>' if no_gmail else ''
    return ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
            '<style>[hidden]{display:none!important}body{margin:0}</style>' + pre +
            '<script>' + gmail_fixtures_js() + '</script><script>' + open(os.path.join(HERE, 'mock.js')).read() + '</script></head><body>' + page + '</body></html>')
errors = []
SKELETON = None
async def route(r):
    global SKELETON
    u = r.request.url
    if u.startswith('https://app.test/'):
        SKELETON = SKELETON or skeleton()
        return await r.fulfill(status=200, content_type='text/html', body=SKELETON)
    for k, v in CDN.items():
        if k in u: return await r.fulfill(status=200, content_type='application/javascript', body=open(os.path.join(ROOT, v), 'rb').read())
    return await r.abort()
async def idle(pg, n=100):
    for i in range(n):
        busy = await pg.evaluate("window.__AR.UI.analyzing || window.__AR.UI.staging.some(b=>b.state==='parsing'||b.state==='analyzing')")
        if not busy: return
        await pg.wait_for_timeout(300)
