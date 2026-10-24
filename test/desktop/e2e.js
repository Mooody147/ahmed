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
let imap = null, smtp = null;
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
  const env = { AR_TEST: '1', AR_DATA_DIR: data, AR_TEST_DOWNLOADS: downloads, AR_TEST_OAUTH: 'fetch', AR_ANTHROPIC_BASE_URL: m.base, AR_GMAIL_API_BASE: m.base, AR_GOOGLE_AUTH_URL: m.base + '/auth', AR_GOOGLE_TOKEN_URL: m.base + '/token', AR_OPENAI_BASE_URL: m.base, AR_GEMINI_BASE_URL: m.base };
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
    await pg.click('#dk-conn details.howto:has(#dk-gid) summary');
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

    step('canvas: sticky note, pen stroke and a moved branch; daily tracker task and achievement');
    await pg.click('.rail [data-nav="todo"]'); await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.waitForTimeout(800);
    await pg.click('[data-act="map-full"]'); await pg.waitForTimeout(500);
    const vp = await (await pg.$('#map-vp')).boundingBox();
    await pg.click('[data-act="cv-tool"][data-tool="sticky"]'); await pg.mouse.click(vp.x + vp.width - 260, vp.y + 140); await pg.waitForTimeout(200);
    await pg.keyboard.type('Call pump vendor'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    await pg.click('[data-act="cv-tool"][data-tool="pen"]');
    await pg.mouse.move(vp.x + vp.width - 400, vp.y + vp.height - 120); await pg.mouse.down(); await pg.mouse.move(vp.x + vp.width - 200, vp.y + vp.height - 80, { steps: 15 }); await pg.mouse.up(); await pg.waitForTimeout(200);
    await pg.click('[data-act="cv-tool"][data-tool="select"]');
    const pb = await (await pg.$('.mnode.project')).boundingBox();
    await pg.mouse.move(pb.x + 20, pb.y + pb.height / 2); await pg.mouse.down(); await pg.mouse.move(pb.x + 20, pb.y + pb.height / 2 + 90, { steps: 8 }); await pg.mouse.up(); await pg.waitForTimeout(300);
    const cv = await ev(pg, "({board:[...window.__AR.St.board.values()].map(e=>e.type).sort(), off:Object.keys(window.__AR.St.layout.off).length})");
    assert.deepStrictEqual(cv.board, ['sticky', 'stroke']); assert.strictEqual(cv.off, 1);
    await pg.screenshot({ path: path.join(OUT, '04-canvas-full.png') });
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(300);
    await pg.click('.rail [data-nav="daily"]'); await pg.waitForSelector('#day-in');
    await pg.fill('#day-in', 'Check NPSH margin for ELM RAS pumps'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(500); await idle(pg);
    await pg.click('[data-act="day-kind"][data-kind="achievement"]'); await pg.fill('#day-in', 'Closed the valves CRS round'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(300);
    await waitFor(pg, '!window.__AR.UI.analyzing', 20000); await pg.waitForTimeout(800);
    const dt = await ev(pg, "[...window.__AR.St.tasks.values()].filter(t=>t.source==='daily').map(t=>({days:t.days,project:t.project}))");
    assert.strictEqual(dt.length, 1); assert.ok(dt[0].project, 'daily task placed in a project');
    await pg.screenshot({ path: path.join(OUT, '04-daily.png'), fullPage: true });

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
    assert.ok(backup.board.length === 2 && backup.daily.length === 1 && backup.layout && Object.keys(backup.layout.off).length === 1, 'canvas and daily data are in the backup');
    await pg.screenshot({ path: path.join(OUT, '05-setup-connected.png'), fullPage: true });

    step('reports, document register and canvas export save real Word, PDF, Excel and PNG files');
    await pg.click('.rail [data-nav="insights"]'); await pg.waitForSelector('.insights');
    await pg.click('[data-act="ins-tab"][data-tab="reports"]'); await pg.waitForTimeout(300);
    await pg.click('[data-act="rep-out"][data-f="docx"]'); await pg.click('[data-act="rep-out"][data-f="pdf"]');
    await pg.click('.rail [data-nav="docs"]'); await pg.waitForSelector('.docs');
    await pg.click('[data-act="doc-add"]'); await pg.fill('#de-number', 'ELM-ME-CAL-0012'); await pg.fill('#de-title', 'RAS pump calc'); await pg.click('[data-act="doc-save"]');
    await pg.click('[data-act="doc-export"]');
    await pg.click('.rail [data-nav="todo"]'); await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.waitForTimeout(800);
    await pg.click('details[data-menu="export"] > summary'); await pg.click('[data-act="map-export"][data-f="png"]');
    const magic = { docx: 'PK', xlsx: 'PK', pdf: '%PDF', png: '\x89PNG' };
    const t0 = Date.now(); let got = {};
    while (Date.now() - t0 < 30000) {
      got = Object.fromEntries(Object.keys(magic).map(x => [x, fs.readdirSync(downloads).find(f => f.endsWith('.' + x))]));
      if (Object.values(got).every(Boolean)) break; await pg.waitForTimeout(300);
    }
    console.log('files', got);
    for (const [x, f] of Object.entries(got)) { assert.ok(f, x + ' saved'); const head = fs.readFileSync(path.join(downloads, f)).subarray(0, 4).toString('latin1'); assert.ok(head.startsWith(magic[x]), x + ' is a real file: ' + JSON.stringify(head)); }
    await pg.screenshot({ path: path.join(OUT, '05b-canvas-export.png') });

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
    assert.deepStrictEqual(await ev(pg, "[...window.__AR.St.board.values()].map(e=>e.type).sort()"), ['sticky', 'stroke'], 'canvas elements persist');
    assert.strictEqual(await ev(pg, "Object.keys(window.__AR.St.layout.off).length"), 1, 'manual node position persists');
    assert.strictEqual(await ev(pg, "[...window.__AR.St.daily.values()].filter(a=>a.kind==='achievement').length"), 1, 'achievement persists');
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
    step('Gmail with an app password (no Google Cloud setup): forwards are imported, analysed and labelled');
    await app.close();
    imap = await mocks.startImap(); smtp = await mocks.startSmtp();
    const data2 = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-data2-'));
    const server = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-server-'));
    const env2 = { ...env, AR_DATA_DIR: data2, AR_IMAP_HOST: '127.0.0.1', AR_IMAP_PORT: String(imap.port), AR_IMAP_INSECURE: '1', AR_SMTP_HOST: '127.0.0.1', AR_SMTP_PORT: String(smtp.port), AR_SMTP_INSECURE: '1', AR_START_VIEW: 'setup', AR_TEST_FOLDER: server };
    ({ app, pg } = await launch(env2));
    await pg.fill('#dk-key', KEY); await reloaded(pg, () => pg.click('[data-dact="save-key"]'));
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-imap-user');
    await pg.fill('#dk-imap-user', 'msobeah12@gmail.com'); await pg.fill('#dk-imap-pass', 'wxyz wxyz wxyz wxyz');
    await pg.click('[data-dact="gmail-connect-imap"]');
    await waitFor(pg, "/did not accept/.test(document.querySelector('#dk-conn').textContent)", 20000);
    await pg.fill('#dk-imap-pass', 'abcd efgh ijkl mnop');
    await reloaded(pg, () => pg.click('[data-dact="gmail-connect-imap"]'));
    assert.ok(!fs.readFileSync(path.join(data2, 'data', 'secrets.json'), 'utf8').includes('abcdefghijklmnop'), 'app password not stored in clear text');
    await waitFor(pg, 'window.__AR.UI.staging.length >= 3', 30000); await idle(pg);
    const st2 = await ev(pg, 'window.__AR.UI.staging.map(b=>({gid:b.gmailId,state:b.state,subj:b.email.subject}))');
    console.log(JSON.stringify(st2));
    assert.strictEqual(st2.length, 3, 'only the three forwards to the +tasks address'); assert.ok(st2.every(b => b.state === 'done'));
    assert.strictEqual(await ev(pg, "window.__AR.St.settings.gmail ? window.__AR.St.settings.gmail.address : window.claude.desktop.suggestedAddress()"), mocks.ADDR.replace('tester', 'msobeah12'));
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-conn');
    assert.match(await pg.textContent('#dk-conn'), /Connected · msobeah12@gmail\.com/);
    await pg.screenshot({ path: path.join(OUT, '08-gmail-app-password.png'), fullPage: true });
    // reopening the app imports nothing again (Gmail label + seen list)
    await app.close();
    ({ app, pg } = await launch({ ...env2, AR_START_VIEW: 'import' }));
    await waitFor(pg, 'window.__AR.St.ready'); await pg.waitForTimeout(3000); await idle(pg);
    assert.strictEqual(await ev(pg, 'window.__AR.UI.staging.length'), 0, 'no re-import after restart');

    step('workbooks and an HTML tool: imported into the app, the tool opens in its own window with its own saved cases');
    require('child_process').execFileSync('node', [path.join(FX, 'mkwb.js')]);
    await pg.click('.rail [data-nav="tools"]'); await pg.waitForSelector('#wb-file', { state: 'attached' });
    await pg.setInputFiles('#wb-file', [path.join(FX, 'out', 'demo-pipe-tool.xlsx'), path.join(FX, 'out', 'demo-tool.html')]);
    await waitFor(pg, "document.querySelectorAll('.wb-card').length >= 2", 30000);
    const stored = fs.readdirSync(path.join(data2, 'data', 'files', 'workbooks')).filter(f => !f.endsWith('.json'));
    assert.strictEqual(stored.length, 1, 'workbook kept in the data folder');
    await pg.click('.wb-card:has-text("DEMO PIPE TOOL") [data-act="wb-open"]'); await pg.waitForSelector('.wb-grid-t');
    await pg.click('[data-act="wb-sheet"] >> text=Calc'); await pg.waitForTimeout(200);
    assert.strictEqual(await pg.textContent('.wb-grid-t td[data-k="8,3"]'), '158.0');
    await pg.click('[data-act="wb-close"]');
    const toolWin = app.waitForEvent('window', { timeout: 20000 });
    await pg.click('.wb-card:has-text("Demo Web Tool") [data-act="ht-open"]');
    const tw = await toolWin; await tw.waitForSelector('#save'); await tw.waitForFunction("document.querySelector('#n').textContent.startsWith('0 cases')", null, { timeout: 10000 });
    await tw.click('#save'); await tw.waitForFunction("document.querySelector('#n').textContent.startsWith('1 cases by local')", null, { timeout: 10000 });
    assert.ok(!(await tw.evaluate('typeof require !== "undefined" || typeof process !== "undefined"')), 'the tool has no Node access');
    await pg.screenshot({ path: path.join(OUT, '09-workbooks.png') });
    await tw.close();
    await waitFor(pg, 'true'); await new Promise(r => setTimeout(r, 400));
    const reg = JSON.parse(fs.readFileSync(path.join(data2, 'data', 'register.json'), 'utf8'));
    assert.ok(Object.keys(reg.docs).some(k => /\/tools\/[^/]+\/cases\//.test(k)), 'the tool case is stored with the register');

    step('email files: the original and its attachments are kept; filing copies them to a server folder named with the email date; open in Outlook falls back to the saved copy');
    await pg.click('.rail [data-nav="review"]'); await pg.waitForTimeout(300);
    const ab2 = await pg.$('[data-act="approve-all"]'); if (ab2) { await ab2.click(); await pg.waitForTimeout(800); }
    const em = await ev(pg, "(()=>{const e=[...window.__AR.St.emails.values()].find(x=>x.original && [...window.__AR.St.tasks.values()].some(t=>(t.emailIds||[]).includes(x.id))); return e ? {id:e.id, orig:e.original, atts:(e.attachments||[]).filter(a=>a.fileId).length, subject:e.subject, date:e.date} : null})()");
    console.log('email kept', JSON.stringify(em));
    assert.ok(em && em.orig && em.orig.fileId, 'original email kept');
    assert.ok(fs.existsSync(path.join(data2, 'data', 'files', 'emails', em.orig.fileId)), 'original email file on disk');
    const tid = await ev(pg, `[...window.__AR.St.tasks.values()].find(t=>(t.emailIds||[]).includes(${JSON.stringify(em.id)})).id`);
    await pg.click('.rail [data-nav="todo"]'); await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.waitForTimeout(800);
    assert.ok(await ev(pg, "!!document.querySelector('.mnode.task .mfile.todo')"), 'canvas asks to file the email');
    await pg.click(`.mnode.task[data-tid="${tid}"] .mfile`); await pg.waitForSelector('.filing');
    const fname = await pg.inputValue(`[data-fname="${em.id}"]`); console.log('folder name', fname);
    assert.ok(fname.startsWith(String(em.date || '').slice(0, 10)), 'folder name starts with the email date');
    await pg.click(`[data-act="file-save"][data-id="${em.id}"]`); await waitFor(pg, `!!(window.__AR.St.emails.get(${JSON.stringify(em.id)}).filed)`, 15000);
    const filedPath = await ev(pg, `window.__AR.St.emails.get(${JSON.stringify(em.id)}).filed.path`); console.log('filed to', filedPath);
    assert.ok(filedPath.startsWith(server) && fs.readdirSync(filedPath).length >= 1 + em.atts, 'email and attachments copied to the server folder');
    await pg.click('.filing [data-act="close-modal"]');
    const opened = await ev(pg, `window.claude.desktop.call('outlook:open', { subject: 'x', fileId: ${JSON.stringify(em.orig.fileId)}, name: 'mail.eml' })`);
    assert.strictEqual(opened.how, 'file', 'falls back to the saved copy when Outlook is not available');
    await pg.screenshot({ path: path.join(OUT, '10-filing.png') });

    step('email from the app: the weekly report goes out from Gmail (app password over SMTP) with the Word file attached');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#set-weekly');
    await pg.fill('#set-weekly [data-k="to"]', 'manager@company.example'); await pg.dispatchEvent('#set-weekly [data-k="to"]', 'change'); await pg.click('#set-weekly h2'); await pg.waitForTimeout(300);
    await pg.click('[data-act="wk-send"]'); await waitFor(pg, `${smtp.got.length} >= 0`); const tSm = Date.now(); while (!smtp.got.length && Date.now() - tSm < 15000) await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(smtp.got.length, 1, 'one message sent');
    assert.deepStrictEqual(smtp.got[0].to, ['manager@company.example']); assert.match(smtp.got[0].raw, /filename=.*\.docx/); assert.match(smtp.got[0].raw, /Subject: .*report/i);
    assert.strictEqual(await ev(pg, "window.claude.desktop.call('mail:send', { to: 'not-an-address', subject: 'x', text: 'y' }).then(() => 'sent', e => e.code)"), 'invalid_argument');
    await pg.click('.rail [data-nav="review"]');

    step('which AI: Claude out of credit → you are asked and can use ChatGPT; the fast model for a simple email; Gemini as the main AI; a local model as automatic backup; the monthly budget');
    await app.close();
    const data3 = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-data3-'));
    const env3 = { ...env, AR_DATA_DIR: data3, AR_START_VIEW: 'setup' };
    ({ app, pg } = await launch(env3));
    await pg.fill('#s-name', 'Mahmoud Sobeah'); await pg.fill('#s-emails', 'm.sobeah@contractor.example'); await pg.click('[data-act="save-setup"]'); await pg.waitForTimeout(300);
    await pg.fill('#dk-key', 'sk-ant-nocredit-0123456789abcdef'); await reloaded(pg, () => pg.click('[data-dact="save-key"]'));
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-ai');
    assert.match(await pg.textContent('#dk-ai'), /Which AI reads your emails/);
    await pg.click('#dk-ai details[data-p="openai"] summary');
    await pg.fill('#ai-key-openai', 'sk-openai-wrong-0123456789abcdef'); await pg.click('[data-dact="ai-key"][data-p="openai"]');
    await waitFor(pg, "/The key did not work/.test(document.querySelector('#dk-ai').textContent)");
    await pg.fill('#ai-key-openai', 'sk-openai-test-0123456789abcdef'); await pg.click('[data-dact="ai-key"][data-p="openai"]');
    await waitFor(pg, "/2 models found/.test(document.querySelector('#dk-ai').textContent)");
    assert.strictEqual(await pg.inputValue('#ai-m-openai-strong'), 'gpt-test-4o'); assert.strictEqual(await pg.inputValue('#ai-m-openai-fast'), 'gpt-test-4o-mini');
    assert.ok(!fs.readFileSync(path.join(data3, 'data', 'secrets.json'), 'utf8').includes('sk-openai-test'), 'OpenAI key not stored in clear text');
    await pg.fill('#dk-ai .ai-price[data-model="gpt-test-4o"][data-k="in"]', '2.5'); await pg.fill('#dk-ai .ai-price[data-model="gpt-test-4o"][data-k="out"]', '10');
    await pg.fill('#dk-ai .ai-price[data-model="gpt-test-4o-mini"][data-k="in"]', '0.15'); await pg.fill('#dk-ai .ai-price[data-model="gpt-test-4o-mini"][data-k="out"]', '0.6');
    await pg.click('[data-dact="ai-save-models"][data-p="openai"]'); await waitFor(pg, "window.claude.desktop.status().ai.providers.openai.ready");
    await pg.click('[data-dact="ai-test"][data-p="openai"]'); await waitFor(pg, "/ChatGPT \\(OpenAI\\) works/.test(document.querySelector('#dk-ai').textContent)");
    await pg.selectOption('#ai-backup', 'openai'); await pg.click('[data-dact="ai-save"]'); await waitFor(pg, "window.claude.desktop.status().ai.backup === 'openai'");
    await pg.screenshot({ path: path.join(OUT, '11-which-ai.png'), fullPage: true });

    await pg.click('.rail [data-nav="import"]');
    await pg.setInputFiles('#file-in', [path.join(FX, 'fwd_gmail.eml')]);
    await waitFor(pg, "window.__AR.UI.staging.some(b=>b.state==='ready')");
    await pg.waitForSelector('[data-act="ai-simple-yes"]'); await pg.click('[data-act="ai-simple-yes"]');
    assert.ok(await ev(pg, "window.__AR.UI.staging[0].tierOverride === 'quick' && !!document.querySelector('.chip.ai-quick')"), 'simple email set to the fast model');
    await pg.click('[data-act="analyze"]'); await idle(pg);
    const e1 = await ev(pg, "(b => ({ state: b.state, error: b.error, info: b.errInfo }))(window.__AR.UI.staging[0])");
    assert.strictEqual(e1.state, 'error'); assert.match(e1.error, /no usable credit/); assert.strictEqual(e1.info.backup, 'openai');
    await pg.click('[data-act="ai-use"][data-p="openai"]'); await idle(pg);
    const d1 = await ev(pg, "window.__AR.UI.staging[0].doneText");
    assert.match(d1 || '', /Read by ChatGPT · gpt-test-4o-mini/, 'read by the backup with the fast model');
    const oc = m.log.openai.filter(x => x.path === '/v1/chat/completions').pop();
    assert.strictEqual(oc.json, 'json_object'); assert.strictEqual(oc.stream, true); assert.strictEqual(oc.model, 'gpt-test-4o-mini');
    const rb = await ev(pg, "[...window.__AR.St.emails.values()].map(e=>e.analysis && e.analysis.readBy).filter(Boolean)");
    assert.deepStrictEqual(rb.map(x => x.provider), ['openai'], 'the email record says which AI read it');

    step('Gemini as the main AI');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-ai');
    await pg.click('#dk-ai details[data-p="gemini"] summary');
    await pg.fill('#ai-key-gemini', 'AIza-gemini-test-0123456789abcdef'); await pg.click('[data-dact="ai-key"][data-p="gemini"]');
    await waitFor(pg, "window.claude.desktop.status().ai.providers.gemini.ready");
    assert.deepStrictEqual(await ev(pg, "window.claude.desktop.status().ai.models.gemini"), { strong: 'gemini-test-2.5-pro', fast: 'gemini-test-2.5-flash' });
    await pg.selectOption('#ai-primary', 'gemini'); await reloaded(pg, () => pg.click('[data-dact="ai-save"]'));
    await pg.click('.rail [data-nav="import"]');
    await pg.setInputFiles('#file-in', [path.join(FX, 'fwd_inline.eml')]);
    await waitFor(pg, "window.__AR.UI.staging.some(b=>b.state==='ready')");
    const sy = await pg.$('[data-act="ai-simple-no"]'); if (sy) await sy.click();
    await pg.click('[data-act="analyze"]'); await idle(pg);
    assert.match(await ev(pg, "window.__AR.UI.staging.find(b=>b.state==='done').doneText"), /Read by Gemini · gemini-test-2\.5-pro/);
    const gc = m.log.gemini.pop(); assert.strictEqual(gc.sse, 'sse'); assert.strictEqual(gc.mime, 'application/json');

    step('a local model (Ollama) as the automatic backup, and the monthly budget');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#dk-ai');
    await pg.click('#dk-ai details[data-p="ollama"] summary');
    await pg.fill('#ai-ollama-url', m.base); await pg.click('[data-dact="ai-models"][data-p="ollama"]');
    await waitFor(pg, "/2 models found/.test(document.querySelector('#dk-ai').textContent)");
    assert.strictEqual(await pg.inputValue('#ai-m-ollama-strong'), 'llama-test:70b'); assert.strictEqual(await pg.inputValue('#ai-m-ollama-fast'), 'qwen-test:8b');
    await pg.click('[data-dact="ai-save-models"][data-p="ollama"]'); await waitFor(pg, "window.claude.desktop.status().ai.providers.ollama.ready");
    await pg.selectOption('#ai-primary', 'claude'); await pg.selectOption('#ai-backup', 'ollama'); await pg.check('#ai-auto'); await pg.fill('#ai-budget', '0.0002');
    await reloaded(pg, () => pg.click('[data-dact="ai-save"]'));
    await pg.click('.rail [data-nav="import"]');
    await pg.setInputFiles('#file-in', [path.join(FX, 'fwd_attachment.eml')]);
    await waitFor(pg, "window.__AR.UI.staging.some(b=>b.state==='ready')");
    await pg.click('[data-act="analyze"]'); await idle(pg);
    const e3 = await ev(pg, "(b => ({ state: b.state, error: b.error, code: b.errInfo && b.errInfo.code }))(window.__AR.UI.staging[0])");
    assert.strictEqual(e3.code, 'budget', 'stopped at the monthly budget'); assert.match(e3.error, /reached your budget/);
    await pg.click('[data-act="ai-over"]'); await idle(pg);
    const d3 = await ev(pg, "window.__AR.UI.staging[0].doneText");
    assert.match(d3 || '', /Read by Local model · llama-test:70b \(backup AI\)/, 'Claude out of credit → the local backup read it by itself');
    assert.strictEqual(m.log.ollama.pop().format, 'json');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#set-usage');
    const usage = await pg.textContent('#set-usage');
    assert.match(usage, /ChatGPT/); assert.match(usage, /Gemini/); assert.match(usage, /Local.*free/s);
    await pg.screenshot({ path: path.join(OUT, '12-ai-usage.png'), fullPage: true });

    step('notebook: a linked folder is read from disk, answers cite the file, a new file is picked up after a restart');
    await ev(pg, "window.claude.desktop.call('ai:config', { budget: 0 })");
    await app.close();
    const nbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-nb-'));
    fs.mkdirSync(path.join(nbDir, 'Specs')); fs.copyFileSync(path.join(FX, 'CRS_valves.xlsx'), path.join(nbDir, 'Specs', 'CRS_valves.xlsx'));
    fs.copyFileSync(path.join(FX, 'transmittal.pdf'), path.join(nbDir, 'transmittal.pdf')); fs.writeFileSync(path.join(nbDir, 'program.exe'), 'MZ');
    const env4 = { ...env3, AR_TEST_FOLDER: nbDir, AR_START_VIEW: 'notebook' };
    ({ app, pg } = await launch(env4));
    await pg.fill('#nb-new-name', 'Site files'); await pg.click('[data-act="nb-create"]'); await pg.waitForSelector('.nb-page');
    await pg.click('[data-act="nb-folder"]');
    await waitFor(pg, "(n => n && n.counts && n.counts.files === 2)([...window.__AR.St.cols.notebooks.values()][0])", 30000);
    assert.deepStrictEqual(await ev(pg, "window.claude.desktop.status().desktop.notebookRoots"), [nbDir], 'the folder is remembered');
    await pg.fill('#nb-q', 'What IP rating do the valve actuators need?'); await pg.click('[data-act="nb-send"]');
    await waitFor(pg, "document.querySelectorAll('.nb-turn').length >= 1 && !window.__AR.UI.nb.asking", 30000);
    assert.match(await pg.textContent('.nb-turn:last-child .nb-ans'), /IP68/);
    await pg.click('.nb-turn:last-child .nb-cite'); await pg.waitForSelector('.nb-cite-panel');
    assert.match(await pg.textContent('.nb-cite-panel'), /Specs\/CRS_valves\.xlsx/);
    assert.strictEqual(await ev(pg, "window.claude.desktop.call('nb:read', { file: '/etc/passwd' }).then(() => 'read', e => e.code)"), 'forbidden', 'only files in the linked folder can be read');
    await pg.screenshot({ path: path.join(OUT, '13-notebook.png') });
    await app.close();
    fs.copyFileSync(path.join(FX, 'MOM-17.docx'), path.join(nbDir, 'MOM-17.docx'));
    ({ app, pg } = await launch({ ...env4, AR_TEST_FOLDER: '' }));
    await waitFor(pg, 'window.__AR.St.ready'); await pg.click('[data-act="nb-open"]');
    await waitFor(pg, "(n => n && n.counts && n.counts.files === 3)([...window.__AR.St.cols.notebooks.values()][0])", 30000);
    assert.strictEqual(await ev(pg, "[...window.__AR.St.cols.notebooks.values()][0].chat.length"), 1, 'the conversation is kept');

    step('cloud sync: create an account on this PC; a second PC signs in with the connection code and gets the same data; changes go both ways');
    await pg.click('.rail [data-nav="review"]'); await pg.waitForTimeout(300);
    const abA = await pg.$('[data-act="approve-all"]'); if (abA) { await abA.click(); await pg.waitForTimeout(600); }
    const tasksA = await ev(pg, 'window.__AR.St.tasks.size'), emailsA = await ev(pg, 'window.__AR.St.emails.size');
    assert.ok(tasksA > 0, 'some tasks to sync');
    await pg.click('.rail [data-nav="setup"]'); await pg.waitForSelector('#set-cloud');
    await pg.fill('#cl-url', m.base); await pg.fill('#cl-key', 'sb_publishable_test_0123456789'); await pg.click('[data-act="cl-connect"]');
    await pg.waitForSelector('#cl-email');
    await pg.fill('#cl-email', 'mahmoud@example.com'); await pg.fill('#cl-pass', 'correct horse battery');
    await reloaded(pg, () => pg.click('[data-act="cl-signin"][data-create]'));
    await waitFor(pg, 'window.__AR.St.ready && window.claude.desktop.status().cloud.signedIn');
    await ev(pg, "window.claude.desktop.call('cloud:sync')");
    assert.ok([...m.sb.docs.keys()].some(k => /\/register\/tasks\//.test(k)), 'tasks are in the cloud');
    assert.ok([...m.sb.objects.keys()].some(k => /\/notebook\//.test(k)), 'stored files are in the cloud');
    assert.ok(!fs.readFileSync(path.join(data3, 'data', 'secrets.json'), 'utf8').includes('rt_'), 'the sign-in is stored encrypted');
    const code = await ev(pg, 'window.claude.desktop.status().cloud.code');
    // share link from the canvas
    await ev(pg, 'window.__shareDelay = 400; 0');
    await pg.click('.rail [data-nav="todo"]'); await pg.click('[data-act="todo-mode"][data-mode="map"]'); await pg.waitForTimeout(500);
    await pg.click('details[data-menu="export"] summary'); await pg.click('[data-act="map-share"]'); await pg.waitForSelector('.share-modal');
    await pg.click('[data-act="share-new"][data-focus="all"]'); await waitFor(pg, "!!document.querySelector('.share-row input')");
    const link = await pg.inputValue('.share-row input'); console.log('share link', link.slice(0, 80) + '…');
    assert.ok(link.startsWith('https://mooody147.github.io/ahmed/#s='));
    await pg.click('.share-modal [data-act="close-modal"]');
    const rpc = async () => (await (await fetch(m.base + '/rest/v1/rpc/ar_get_share', { method: 'POST', headers: { apikey: 'sb_publishable_test_0123456789', 'Content-Type': 'application/json' }, body: JSON.stringify({ t: JSON.parse(Buffer.from(link.split('#s=')[1], 'base64url').toString()).t }) })).json());
    const s1 = await rpc(); assert.ok(s1.snapshot.svg.startsWith('<svg') && s1.snapshot.tasks.length === tasksA, 'the link shows the canvas and the tasks');
    // a change on the canvas reaches the link by itself
    await ev(pg, `(async () => { const db = await window.claude.use('db'); const t = [...window.__AR.St.tasks.values()][0]; await db.doc('data/users/local/register/tasks/' + t.id).set({ ...t, title: 'Renamed for the share link', updatedAt: new Date().toISOString() }); })()`);
    const tShare = Date.now(); let s2; while (Date.now() - tShare < 15000) { s2 = await rpc(); if (s2.snapshot.tasks.some(t => t.title === 'Renamed for the share link')) break; await new Promise(r => setTimeout(r, 300)); }
    assert.ok(s2.snapshot.tasks.some(t => t.title === 'Renamed for the share link'), 'share link updated after a change');
    // the viewer page (published on GitHub Pages) shows it
    const { chromium } = require('playwright');
    const br = await chromium.launch(); const vw = await (await br.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    await vw.goto('file://' + path.join(ROOT, 'viewer', 'index.html') + '#s=' + link.split('#s=')[1]); await vw.waitForSelector('.proj');
    assert.match(await vw.textContent('#list'), /Renamed for the share link/); assert.ok(await vw.evaluate("document.querySelector('#img').src.startsWith('data:image/svg+xml')"));
    await vw.screenshot({ path: path.join(OUT, '14-share-viewer.png') });
    await vw.click('#tab-map'); await vw.waitForTimeout(300); await vw.screenshot({ path: path.join(OUT, '15-share-viewer-canvas.png') });
    await br.close();
    await app.close();

    const data5 = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-data5-'));
    ({ app, pg } = await launch({ ...env, AR_DATA_DIR: data5, AR_START_VIEW: 'setup' }));
    await pg.waitForSelector('#set-cloud'); await pg.click('#set-cloud details.howto summary');
    await pg.fill('#cl-code', code); await pg.click('[data-act="cl-code"]'); await pg.waitForSelector('#cl-email');
    await pg.fill('#cl-email', 'mahmoud@example.com'); await pg.fill('#cl-pass', 'wrong password 1'); await pg.click('[data-act="cl-signin"]:not([data-create])');
    await waitFor(pg, "/Invalid login credentials/.test(document.querySelector('#set-cloud').textContent)");
    await pg.fill('#cl-pass', 'correct horse battery');
    await reloaded(pg, () => pg.click('[data-act="cl-signin"]:not([data-create])'));
    await waitFor(pg, 'window.__AR.St.ready'); await pg.waitForTimeout(500);
    assert.strictEqual(await ev(pg, 'window.__AR.St.tasks.size'), tasksA, 'second PC has the tasks');
    assert.strictEqual(await ev(pg, 'window.__AR.St.emails.size'), emailsA, 'second PC has the emails');
    assert.ok(await ev(pg, "[...window.__AR.St.tasks.values()].some(t => t.title === 'Renamed for the share link')"));
    const nbId = await ev(pg, "[...window.__AR.St.cols.notebooks.values()][0].id");
    assert.ok(await ev(pg, `window.claude.desktop.call('files:load', { kind: 'notebook', id: ${JSON.stringify(nbId + '.json')} }).then(b => !!b && b.length > 100)`), 'stored files come down when needed');
    await pg.click('.rail [data-nav="money"]'); await pg.click('[data-act="mon-new"][data-kind="expense"]'); await pg.fill('#mf-amount', '77'); await pg.fill('#mf-payee', 'Made on the second PC'); await pg.click('[data-act="mon-save"]');
    await pg.waitForTimeout(300); await ev(pg, "window.claude.desktop.call('cloud:sync')");
    await app.close();
    ({ app, pg } = await launch({ ...env4, AR_TEST_FOLDER: '', AR_START_VIEW: 'money' }));
    await waitFor(pg, "[...window.__AR.St.cols.money.values()].some(x => x.payee === 'Made on the second PC')", 20000);

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
    if (imap) imap.server.close();
    if (smtp) smtp.server.close();
  }
})();
