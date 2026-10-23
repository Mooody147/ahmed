// End-to-end test of the Electron app against local mock servers (test/desktop/mock-servers.js).
// Run: npm run test:desktop   (on Linux without a display: xvfb-run -a npm run test:desktop)
const { _electron: electron } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mocks = require('./mock-servers');

const ROOT = path.join(__dirname, '..', '..');
const FX = path.join(ROOT, 'test', 'fixtures');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const KEY = 'sk-ant-test-0123456789abcdefghij';
const errors = [];
const step = s => console.log('•', s);

async function launch(env) {
  // root (containers) and CI runners cannot use Chromium's setuid sandbox
  const args = [ROOT, ...((process.getuid && process.getuid() === 0) || process.env.CI ? ['--no-sandbox'] : [])];
  const app = await electron.launch({ args, env: { ...process.env, ...env } });
  const pg = await app.firstWindow();
  pg.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  pg.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE ' + m.text()); });
  await pg.waitForSelector('h1');
  return { app, pg };
}
const ev = (pg, js) => pg.evaluate(js);
async function waitFor(pg, js, ms = 30000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await pg.evaluate(js)) return; await pg.waitForTimeout(250); }
  throw new Error('timeout waiting for ' + js);
}
const idle = pg => waitFor(pg, "!window.__AR.UI.analyzing && !window.__AR.UI.staging.some(b=>['parsing','analyzing'].includes(b.state))", 60000);
async function reloaded(pg, action) {
  const nav = pg.waitForEvent('load', { timeout: 15000 });
  await action(); await nav; await pg.waitForSelector('h1');
}

(async () => {
  const m = await mocks.start();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-data-'));
  const downloads = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-dl-'));
  const env = { AR_TEST: '1', AR_DATA_DIR: data, AR_TEST_DOWNLOADS: downloads, AR_TEST_OAUTH: 'fetch', AR_ANTHROPIC_BASE_URL: m.base, AR_GMAIL_API_BASE: m.base, AR_GOOGLE_AUTH_URL: m.base + '/auth', AR_GOOGLE_TOKEN_URL: m.base + '/token' };
  let { app, pg } = await launch({ ...env, AR_START_VIEW: 'setup' });
  try {
    step('first run: nothing connected');
    assert.strictEqual(await ev(pg, '!!window.arDesktop && !!window.claude.desktop'), true);
    assert.strictEqual(await ev(pg, 'typeof require'), 'undefined', 'renderer must not have Node');
    await pg.waitForSelector('#dk-conn');
    assert.match(await pg.textContent('#dk-conn'), /Not set up/);
    assert.strictEqual(await ev(pg, 'window.__AR.St.mode'), 'db');
    assert.strictEqual(await ev(pg, 'window.__AR.St.sample'), null);
    await pg.screenshot({ path: path.join(OUT, '01-setup-first-run.png'), fullPage: true });

    step('renderer cannot reach the network');
    assert.strictEqual(await ev(pg, `fetch('${m.base}/v1/messages').then(()=>'reached',()=>'blocked')`), 'blocked');

    step('fonts are bundled');
    await ev(pg, 'document.fonts.ready');
    assert.strictEqual(await ev(pg, "document.fonts.check('16px \"IBM Plex Sans\"')"), true);

    step('save profile');
    await pg.fill('#s-name', 'Mahmoud Sobeah'); await pg.fill('#s-emails', 'm.sobeah@contractor.example');
    await pg.click('[data-act="save-setup"]'); await pg.waitForTimeout(400);

    step('API key: reject a malformed key, accept a valid one');
    await pg.fill('#dk-key', 'nope'); await pg.click('[data-dact="save-key"]');
    assert.match(await pg.textContent('#dk-conn'), /does not look like/);
    await pg.fill('#dk-key', KEY);
    await reloaded(pg, () => pg.click('[data-dact="save-key"]'));
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-conn');
    assert.match(await pg.textContent('#dk-conn'), /Key saved/);
    assert.ok(!(await ev(pg, 'JSON.stringify(window.claude.desktop.status())')).includes(KEY), 'key must not reach the renderer');
    assert.ok(!fs.readFileSync(path.join(data, 'data', 'secrets.json'), 'utf8').includes(KEY), 'key must not be stored in clear text');
    await pg.click('[data-dact="test-key"]'); await waitFor(pg, "/The key works/.test(document.querySelector('#dk-conn').textContent)");

    step('connect Gmail (OAuth loopback + PKCE)');
    await pg.fill('#dk-gid', 'cid.apps.googleusercontent.com'); await pg.fill('#dk-gsec', 'GOCSPX-secret');
    await reloaded(pg, () => pg.click('[data-dact="gmail-connect"]'));
    assert.strictEqual(m.log.token[0].grant_type, 'authorization_code');
    assert.ok(m.log.token[0].code_verifier && /^http:\/\/127\.0\.0\.1:\d+$/.test(m.log.token[0].redirect_uri));

    step('forwards are fetched from Gmail and analysed automatically');
    await waitFor(pg, 'window.__AR.UI.staging.length >= 3', 30000); await idle(pg);
    const st = await ev(pg, 'window.__AR.UI.staging.map(b=>({gid:b.gmailId,state:b.state,err:b.error,subj:b.email.subject,atts:b.atts.map(a=>a.name+":"+(a.res&&a.res.status))}))');
    console.log(JSON.stringify(st, null, 1));
    assert.deepStrictEqual(st.map(b => b.gid).sort(), ['m0', 'm1', 'm2'], 'other-address message must be skipped');
    assert.ok(st.every(b => b.state === 'done'), 'all analysed: ' + JSON.stringify(st.map(b => [b.state, b.err])));
    assert.strictEqual(await ev(pg, "window.__AR.St.settings.gmail ? window.__AR.St.settings.gmail.address : window.claude.desktop.suggestedAddress()"), mocks.ADDR);
    const calls = m.log.anthropic.filter(c => c.stream);
    assert.ok(calls.length >= 3);
    assert.ok(calls.every(c => c.model === 'claude-opus-5-5' && c.effort === 'high' && c.fallbacks === 'default' && /server-side-fallback-2026-07-01/.test(c.beta) && c.max_tokens === 64000), JSON.stringify(calls.map(({ prompt, ...c }) => c)));
    assert.deepStrictEqual([...m.labeled].sort(), ['m0', 'm1', 'm2'], 'imported messages are labelled');
    await pg.click('.rail [data-nav="import"]'); await pg.screenshot({ path: path.join(OUT, '02-import.png'), fullPage: true });

    step('review → add all');
    await pg.click('.rail [data-nav="review"]'); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, '03-review.png'), fullPage: true });
    await pg.click('[data-act="approve-all"]'); await pg.waitForTimeout(800);
    const nTasks = await ev(pg, 'window.__AR.St.tasks.size');
    assert.ok(nTasks >= 3, 'tasks added: ' + nTasks);

    step('to-do views');
    await pg.click('.rail [data-nav="todo"]'); await pg.waitForTimeout(1500);
    for (const mode of ['map', 'board', 'list']) {
      const b = await pg.$(`[data-act="todo-mode"][data-mode="${mode}"]`);
      if (b) { await b.click(); await pg.waitForTimeout(500); await pg.screenshot({ path: path.join(OUT, `04-todo-${mode}.png`) }); }
    }
    await waitFor(pg, '!window.__AR.UI.analyzing', 30000); await pg.waitForTimeout(1000);
    const cat = m.log.anthropic.filter(c => /You organise the to-do list/.test(c.prompt));
    console.log('categorise calls', cat.map(c => [c.model, c.effort, c.fallbacks]));
    assert.ok(cat.length && cat.every(c => c.model === 'claude-haiku-5-5' && c.effort === 'low' && !c.fallbacks), 'categorisation uses the quick model without fallbacks');

    step('files are parsed offline with the bundled libraries');
    await pg.click('.rail [data-nav="import"]'); await pg.waitForTimeout(300);
    await pg.click('[data-act="clear-staging"]').catch(() => {});
    await pg.setInputFiles('#file-in', ['test.msg', 'review.eml', 'transmittal.pdf', 'drawing_A3.pdf', 'scanned.pdf', 'CRS_valves.xlsx', 'MOM-17.docx', 'scan.png'].map(f => path.join(FX, f)));
    await waitFor(pg, "window.__AR.UI.staging.length && !window.__AR.UI.staging.some(b=>b.state==='parsing' || b.atts.some(a=>a.extracting))", 60000);
    const files = await ev(pg, "window.__AR.UI.staging.map(b=>({src:b.source,state:b.state,dup:!!b.dupEmailId,atts:b.atts.map(a=>[a.name,a.res&&a.res.status,a.res&&(a.res.images||[]).length,a.res&&(a.res.text||'').length])}))");
    console.log(JSON.stringify(files));
    const all = files.flatMap(f => f.atts);
    const stat = n => (all.find(a => a[0] === n) || [])[1];
    assert.ok(['text', 'mixed'].includes(stat('transmittal.pdf')), 'pdf text');
    assert.ok(['text', 'mixed'].includes(stat('CRS_valves.xlsx')), 'xlsx');
    assert.ok(['text', 'mixed'].includes(stat('MOM-17.docx')), 'docx');
    assert.ok(['vision', 'mixed'].includes(stat('scanned.pdf')), 'scanned pdf as images');
    assert.ok(all.find(a => a[0] === 'drawing_A3.pdf')[2] > 0, 'drawing sheet rendered to images');
    const before = m.log.anthropic.length;
    const ab = await pg.$('[data-act="analyze"]:not([disabled])'); if (ab) { await ab.click(); await pg.waitForTimeout(500); await idle(pg); }
    assert.ok(m.log.anthropic.slice(before).some(c => c.images > 0), 'page images are sent to Claude');

    step('export CSV / ICS / JSON through the save dialog');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForTimeout(300);
    for (const a of ['export-csv', 'export-ics', 'export-json']) { await pg.click(`[data-act="${a}"]`); await pg.waitForTimeout(500); }
    const saved = fs.readdirSync(downloads);
    console.log('saved', saved);
    assert.ok(saved.some(f => f.endsWith('.csv')) && saved.some(f => f.endsWith('.ics')) && saved.some(f => f.endsWith('.json')));
    const backup = JSON.parse(fs.readFileSync(path.join(downloads, saved.find(f => f.endsWith('.json'))), 'utf8'));
    assert.strictEqual(backup.tasks.length, await ev(pg, 'window.__AR.St.tasks.size'));
    assert.ok(Object.keys(backup.texts).length > 0, 'extracted texts are included in the backup');
    await pg.screenshot({ path: path.join(OUT, '05-setup-connected.png'), fullPage: true });

    step('dark mode');
    // Playwright pins the page to light; the real app follows the OS setting
    await pg.emulateMedia({ colorScheme: 'dark' });
    await pg.click('.rail [data-nav="todo"]'); await pg.waitForTimeout(600);
    assert.strictEqual(await ev(pg, "getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()"), '#0E1413');
    await pg.screenshot({ path: path.join(OUT, '06-dark.png') });
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForTimeout(300);
    await pg.screenshot({ path: path.join(OUT, '07-dark-setup.png') });
    await pg.emulateMedia({ colorScheme: 'light' });

    step('data persists across restarts; Gmail does not re-import');
    const total = await ev(pg, 'window.__AR.St.tasks.size'), emails = await ev(pg, 'window.__AR.St.emails.size');
    await app.close();
    ({ app, pg } = await launch({ ...env, AR_START_VIEW: 'import' }));
    await waitFor(pg, 'window.__AR.St.ready'); await pg.waitForTimeout(2500); await idle(pg);
    assert.strictEqual(await ev(pg, 'window.__AR.St.tasks.size'), total);
    assert.strictEqual(await ev(pg, 'window.__AR.St.emails.size'), emails);
    assert.strictEqual(await ev(pg, 'window.__AR.UI.staging.filter(b=>b.gmailId).length'), 0);
    const tx = await ev(pg, `(async()=>{const id=[...window.__AR.St.emails.keys()][0]; const d=await (await window.claude.use('db')).doc('data/users/local/register/texts/'+id).get(); return d.exists})()`);
    assert.strictEqual(tx, true, 'texts are read back from disk');

    step('a rejected API key shows a clear error');
    const cfg = path.join(data, 'data', 'secrets.json');
    await app.close();
    const sec = JSON.parse(fs.readFileSync(cfg, 'utf8'));
    fs.writeFileSync(cfg, JSON.stringify({ ...sec, anthropicKey: 'b64:' + Buffer.from('sk-ant-wrong-0123456789abcdefghij').toString('base64') }));
    ({ app, pg } = await launch({ ...env, AR_START_VIEW: 'import' }));
    await pg.setInputFiles('#file-in', [path.join(FX, 'fwd_inline.eml')]);
    await waitFor(pg, "window.__AR.UI.staging.some(b=>b.state==='ready'||b.state==='error')");
    const btn = await pg.$('[data-act="analyze"]:not([disabled])');
    if (btn) { await btn.click(); await idle(pg); }
    const err = await ev(pg, "(window.__AR.UI.staging.find(b=>b.state==='error')||{}).error");
    assert.match(err || '', /API key was rejected/);

    // the only expected console errors come from the deliberate network-block check above
    errors.splice(0, errors.length, ...errors.filter(e => !/Failed to load resource|Content Security Policy/.test(e)));
    assert.deepStrictEqual(errors, [], 'no page or console errors');
    console.log('\nDESKTOP E2E PASSED');
  } catch (e) {
    console.error('\nDESKTOP E2E FAILED:', e && e.stack || e);
    console.error('errors:', errors);
    try { await pg.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }); } catch {}
    process.exitCode = 1;
  } finally {
    try { await app.close(); } catch {}
    m.server.close();
  }
})();
