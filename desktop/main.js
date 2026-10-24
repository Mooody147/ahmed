'use strict';
// Electron main process. Serves the renderer from app://, keeps the API key and
// Gmail credentials here (never in the renderer), and answers the renderer's IPC calls
// that back the window.claude.use() surface (see src/platform.js) and the desktop extras.
const { app, BrowserWindow, ipcMain, protocol, net, session, shell, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { Store } = require('./store');
const { Config } = require('./config');
const claude = require('./claude');
const ai = require('./ai');
const gmail = require('./gmail');
const gmailImap = require('./gmail-imap');
const sys = require('./system');
const filesMod = require('./files');
const outlook = require('./outlook');
const notebook = require('./notebook');

const ROOT = path.join(__dirname, '..', 'app');
const PARTITION = 'persist:action-register';

if (process.env.AR_DATA_DIR) app.setPath('userData', path.resolve(process.env.AR_DATA_DIR));
const DATA_DIR = sys.resolveDataDir();

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }, { scheme: 'artool', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

if (!process.env.AR_TEST && !app.requestSingleInstanceLock()) app.quit();

let win = null, store = null, config = null, updater = null, rendererReady = false, files = null;
// folders the user picked in a dialog this session (or earlier, saved in the prefs); files may be copied only there
const pickedFolders = new Set();
const ctx = {
  show() { if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); },
  send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); },
  rendererReady: () => rendererReady,
};

function createWindow() {
  const dark = nativeTheme.shouldUseDarkColors, mac = process.platform === 'darwin';
  win = new BrowserWindow({
    ...sys.windowOptions(config), minWidth: 360, minHeight: 520, show: false,
    title: 'Action Register', backgroundColor: dark ? '#0E1413' : '#EEF2F1',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // the app draws its own title strip; the window buttons stay native
    titleBarStyle: mac ? 'hiddenInset' : 'hidden',
    ...(mac ? {} : { titleBarOverlay: { color: dark ? '#151D1C' : '#FFFFFF', symbolColor: dark ? '#E3EBE9' : '#15201E', height: 34 } }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  sys.trackWindow(win, config);
  win.once('ready-to-show', () => { if (!sys.startedHidden()) win.show(); });
  win.webContents.on('did-start-loading', () => { rendererReady = false; });
  // Nothing navigates away from the app; external links open in the default browser.
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://local/index.html' + (process.env.AR_START_VIEW ? '#' + process.env.AR_START_VIEW : ''));
  sys.closeToTray(win, config);
}

function setupSession() {
  const ses = session.fromPartition(PARTITION);
  ses.protocol.handle('app', req => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '');
    const file = path.normalize(path.join(ROOT, rel || 'index.html'));
    if (!file.startsWith(ROOT + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  // The renderer never talks to the network: parsing is offline and every API call goes through this process.
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(app|devtools|data|blob|chrome-extension):/.test(d.url) }));
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((wc, perm) => perm === 'clipboard-sanitized-write');
}

function buildMenu() {
  const mac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(mac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [{ label: 'Quick add task…', accelerator: 'CmdOrCtrl+N', click: () => ctx.send('quick-add', {}) }, { label: 'Open data folder', click: () => shell.openPath(DATA_DIR) }, { type: 'separator' }, { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { sys.setQuitting(); app.quit(); } }] },
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]));
}

/* ---------- IPC ---------- */
// Errors cross IPC as plain {code, message} objects so the renderer keeps the code.
const handle = (ch, fn) => ipcMain.handle(ch, async (e, arg) => {
  if (!win || e.sender !== win.webContents) return { ok: false, error: { code: 'forbidden', message: 'Unknown sender' } };
  try { return { ok: true, value: await fn(arg, e) }; }
  catch (err) { return { ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err), ...(err && err.provider ? { provider: err.provider, backup: err.backup || '' } : {}) } }; }
});

function status() {
  const d = sys.prefs(config);
  return {
    dataDir: DATA_DIR, platform: process.platform, packaged: app.isPackaged,
    user: { id: 'local', name: config.get().profileName || userName() },
    claude: { hasKey: !!config.secret('anthropicKey'), models: config.models(), maxPromptKB: config.get().maxPromptKB },
    ai: ai.status(config),
    gmail: { mode: gmailMode(), clientId: config.get().gmail.clientId || '', hasSecret: !!config.secret('gmailClientSecret'), connected: !!gmailMode(), account: config.get().gmail.account || '' },
    desktop: { closeToTray: d.closeToTray, startWithWindows: d.startWithWindows, startHidden: d.startHidden, hotkey: d.hotkey, notify: d.notify, autoUpdate: d.autoUpdate, watchDir: d.watchDir, backupDir: d.backupDir, backupKeep: d.backupKeep, serverRoots: d.serverRoots || [], notebookRoots: d.notebookRoots || [], locked: !!d.pin },
    usage: config.get().usage || {},
    update: sys.updateReady(),
    secure: config.encrypted(),
    version: app.getVersion(),
  };
}
// 'imap' = Gmail app password (the simple way), 'oauth' = Google Cloud OAuth client, '' = not connected
function gmailMode() {
  const g = config.get().gmail;
  if (config.secret('gmailAppPassword') && g.mode === 'imap') return 'imap';
  if (config.secret('gmailRefresh')) return 'oauth';
  return '';
}
function userName() { try { return os.userInfo().username || ''; } catch { return ''; } }
async function saveFile(filename, data) {
  const ext = path.extname(filename).slice(1);
  const defaultPath = path.join(process.env.AR_TEST_DOWNLOADS || app.getPath('downloads'), path.basename(filename));
  let file = defaultPath;
  if (!process.env.AR_TEST_DOWNLOADS) {
    const r = await dialog.showSaveDialog(win, { defaultPath, filters: ext ? [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'All files', extensions: ['*'] }] : [] });
    if (r.canceled || !r.filePath) throw { code: 'cancelled', message: 'Cancelled' };
    file = r.filePath;
  }
  await fs.promises.writeFile(file, typeof data === 'string' ? data : Buffer.from(data));
  return { status: 'saved', path: file };
}
// usage per month, for the cost estimate in Setup and Insights
function addUsage(u) {
  const month = new Date().toISOString().slice(0, 7);
  const all = { ...(config.get().usage || {}) }; const m = { ...(all[month] || {}) };
  const k = u.model; const x = { ...(m[k] || { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }) };
  x.calls++; x.input += u.input || 0; x.output += u.output || 0; x.cacheRead += u.cacheRead || 0; x.cacheWrite += u.cacheWrite || 0;
  m[k] = x; all[month] = m;
  for (const key of Object.keys(all).sort().slice(0, -13)) delete all[key];
  config.set({ usage: all });
  ctx.send('sample:usage', { month, usage: m });
}

function registerIpc() {
  ipcMain.on('desktop:status', e => { e.returnValue = status(); });
  handle('db:load', () => store.loadAll());
  handle('db:get', p => store.get(p));
  handle('db:set', ({ path: p, data }) => store.set(p, data));
  handle('db:delete', p => store.delete(p));

  // answers { value, meta: { provider, model, fallback } }; the provider is the main AI unless the call names one
  handle('sample:json', (req, e) => ai.run(config, req, delta => { if (!e.sender.isDestroyed()) e.sender.send('sample:text', { id: req.id, delta }); }, addUsage));
  handle('sample:abort', id => ai.abort(id));
  handle('ai:config', patch => { ai.setSettings(config, patch || {}); return status(); });
  handle('ai:key', ({ provider, key }) => {
    const name = { openai: 'openaiKey', gemini: 'geminiKey' }[provider]; if (!name) throw { code: 'invalid_argument', message: 'Unknown AI' };
    config.setSecret(name, key ? String(key).trim() : null); return status();
  });
  handle('ai:models', ({ provider, key }) => ai.listModels(config, provider, key ? String(key).trim() : ''));
  handle('ai:test', ({ provider }) => ai.test(config, provider));
  handle('claude:test', () => claude.test(config));
  handle('config:claude', ({ key, models, maxPromptKB }) => {
    if (key !== undefined) config.setSecret('anthropicKey', key ? String(key).trim() : null);
    const patch = {};
    if (models) patch.models = models;
    if (maxPromptKB) patch.maxPromptKB = Math.max(64, Math.min(3000, +maxPromptKB || 600));
    if (Object.keys(patch).length) config.set(patch);
    return status();
  });

  handle('gmail:call', ({ tool, input }) => (gmailMode() === 'imap' ? gmailImap : gmail).call(config, tool, input));
  handle('gmail:connect-imap', async ({ address, appPassword }) => {
    await gmailImap.connect(config, address, appPassword);
    config.setSecret('gmailRefresh', null);
    return status();
  });
  handle('gmail:connect', async ({ clientId, clientSecret }) => {
    if (clientId) config.set({ gmail: { ...config.get().gmail, clientId: String(clientId).trim() } });
    if (clientSecret) config.setSecret('gmailClientSecret', String(clientSecret).trim());
    await gmail.connect(config, url => process.env.AR_TEST_OAUTH === 'fetch' ? net.fetch(url) : shell.openExternal(url));
    config.setSecret('gmailAppPassword', null); config.set({ gmail: { ...config.get().gmail, mode: 'oauth' } });
    if (win) win.focus();
    return status();
  });
  handle('gmail:disconnect', async () => { gmailImap.disconnect(config); await gmail.disconnect(config); config.set({ gmail: { ...config.get().gmail, mode: '' } }); return status(); });

  handle('downloads:save', ({ filename, data }) => saveFile(filename, data));
  /* stored files: workbooks, HTML tools, reference documents, email originals, attachments, receipts, photos */
  handle('files:save', ({ kind, id, data, meta }) => files.save(kind, id, data, meta));
  handle('files:load', ({ kind, id }) => files.load(kind, id));
  handle('files:info', ({ kind, id }) => files.info(kind, id));
  handle('files:remove', ({ kind, id }) => files.remove(kind, id));
  handle('files:list', ({ kind }) => files.list(kind));
  handle('files:open', ({ kind, id, name }) => files.open(kind, id, name));
  handle('files:copyTo', ({ kind, id, folder, name }) => { const ok = [...pickedFolders, ...(sys.prefs(config).serverRoots || [])].some(f => f && path.resolve(folder).startsWith(path.resolve(f))); if (!ok) throw { code: 'forbidden', message: 'Choose the folder first' }; return files.copyTo(kind, id, folder, name); });
  handle('files:pickFolder', async ({ title, defaultPath } = {}) => {
    if (process.env.AR_TEST_FOLDER) { pickedFolders.add(process.env.AR_TEST_FOLDER); return process.env.AR_TEST_FOLDER; }
    const r = await dialog.showOpenDialog(win, { title: title || 'Choose a folder', defaultPath, properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) throw { code: 'cancelled', message: 'Cancelled' };
    pickedFolders.add(r.filePaths[0]); return r.filePaths[0];
  });
  handle('files:openFolder', ({ folder }) => { const ok = [...pickedFolders, ...(sys.prefs(config).serverRoots || [])].some(f => f && path.resolve(folder).startsWith(path.resolve(f))); if (!ok) throw { code: 'forbidden', message: 'Folder not allowed' }; fs.mkdirSync(folder, { recursive: true }); return shell.openPath(folder); });
  handle('htmltool:open', ({ id, title, user }) => filesMod.openTool(files, id, title, user));
  // open an email in Outlook (the message in your mailbox), else its saved .msg / .eml copy
  handle('outlook:open', async ({ messageId, subject, from, date, fileId, name }) => {
    const r = process.env.AR_TEST ? 'NOT_WINDOWS' : await outlook.findInOutlook({ messageId, subject, from, date });
    if (r === 'FOUND') return { how: 'outlook' };
    if (fileId && await files.info('emails', fileId)) { const p = await files.open('emails', fileId, name); return { how: 'file', path: p, why: r }; }
    return { how: 'none', why: r };
  });
  // notebook: folders you picked (kept in the prefs so they can be read again after a restart)
  const nbRoots = () => [...pickedFolders, ...(sys.prefs(config).notebookRoots || [])];
  handle('nb:scan', ({ folder }) => { if (!notebook.inside(folder, nbRoots())) throw { code: 'forbidden', message: 'Choose the folder first' }; return notebook.scan(folder); });
  handle('nb:read', async ({ file }) => { if (!notebook.inside(file, nbRoots()) || !notebook.EXTS.test(file)) throw { code: 'forbidden', message: 'File not allowed' }; return new Uint8Array(await fs.promises.readFile(file)); });
  handle('nb:open', ({ file }) => { if (!notebook.inside(file, nbRoots())) throw { code: 'forbidden', message: 'File not allowed' }; if (process.env.AR_TEST) return 'test'; return shell.openPath(file); });
  filesMod.toolDbIpc(ipcMain, store, filesMod.notifyToolWindows);
  handle('shell:openData', () => shell.openPath(DATA_DIR));
  handle('shell:openPath', p => { if (typeof p === 'string' && [sys.prefs(config).watchDir, sys.prefs(config).backupDir, DATA_DIR].some(d => d && p.startsWith(d))) return shell.openPath(p); throw { code: 'forbidden', message: 'Path not allowed' }; });
  handle('shell:openExternal', url => { if (/^(https:\/\/(console\.anthropic\.com|console\.cloud\.google\.com|docs\.anthropic\.com|platform\.claude\.com|myaccount\.google\.com|support\.google\.com|platform\.openai\.com|aistudio\.google\.com|ollama\.com|mail\.google\.com|github\.com\/Mooody147)\/|mailto:)/.test(url)) return shell.openExternal(url); throw { code: 'forbidden', message: 'URL not allowed' }; });

  /* desktop extras */
  handle('sys:prefs', patch => {
    const allowed = ['closeToTray', 'startWithWindows', 'startHidden', 'hotkey', 'notify', 'autoUpdate', 'watchDir', 'backupDir', 'backupKeep', 'serverRoots', 'notebookRoots'];
    const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k]) => allowed.includes(k)));
    // server folders may only be ones the user picked in a dialog
    if (clean.notebookRoots) clean.notebookRoots = (Array.isArray(clean.notebookRoots) ? clean.notebookRoots : []).filter(f => typeof f === 'string' && (pickedFolders.has(f) || (sys.prefs(config).notebookRoots || []).includes(f))).slice(0, 50);
    if (clean.serverRoots) clean.serverRoots = (Array.isArray(clean.serverRoots) ? clean.serverRoots : []).filter(f => typeof f === 'string' && (pickedFolders.has(f) || (sys.prefs(config).serverRoots || []).includes(f))).slice(0, 20);
    sys.setPrefs(config, clean);
    if ('startWithWindows' in clean || 'startHidden' in clean) sys.applyLoginItem(config);
    let hotkeyOk = true;
    if ('hotkey' in clean) hotkeyOk = sys.applyHotkey(ctx, config).ok;
    if ('watchDir' in clean) sys.startWatch(ctx, config);
    return { ...status(), hotkeyOk };
  });
  handle('sys:choose-folder', ({ title, current }) => sys.chooseFolder(win, title, current));
  handle('sys:notify', n => sys.notify(ctx, config, n || {}));
  handle('backup:write', ({ name, text }) => sys.writeBackup(config, name, text));
  handle('data:move', async () => {
    const folder = await sys.chooseFolder(win, 'Choose where to keep your Action Register data (for example a OneDrive folder)', path.dirname(DATA_DIR));
    if (!folder) throw { code: 'cancelled', message: 'Cancelled' };
    if (path.resolve(folder).startsWith(path.resolve(DATA_DIR))) throw { code: 'invalid_argument', message: 'Choose a folder outside the current data folder.' };
    const r = await sys.moveDataDir(DATA_DIR, folder, async () => { store.flushSync(); });
    if (!process.env.AR_TEST) setTimeout(() => { sys.setQuitting(); app.relaunch(); app.exit(0); }, 600);
    return r;
  });
  handle('lock:set', ({ pin }) => { sys.setPin(config, pin); return status(); });
  handle('lock:check', ({ pin }) => sys.checkPin(config, pin));
  handle('update:install', () => { if (updater) updater.install(); return !!updater; });
  handle('ui:titlebar', ({ color, symbol }) => { try { if (win.setTitleBarOverlay) win.setTitleBarOverlay({ color, symbolColor: symbol, height: 34 }); } catch {} return true; });
  handle('ui:zoom', ({ factor }) => { const f = Math.max(0.8, Math.min(1.5, +factor || 1)); win.webContents.setZoomFactor(f); return f; });
  handle('print:pdf', async ({ html, filename, landscape }) => {
    const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, javascript: false } });
    try {
      await w.loadURL('data:text/html;charset=utf-8;base64,' + Buffer.from(String(html)).toString('base64'));
      const pdf = await w.webContents.printToPDF({ landscape: !!landscape, printBackground: true, pageSize: 'A4', margins: { marginType: 'default' } });
      return await saveFile(filename || 'action-register.pdf', pdf);
    } finally { w.destroy(); }
  });
  handle('capture:png', async ({ rect, filename }) => {
    const r = rect ? { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.round(rect.width), height: Math.round(rect.height) } : undefined;
    const img = await win.webContents.capturePage(r);
    return saveFile(filename || 'action-register-canvas.png', img.toPNG());
  });
  handle('watch:ready', () => { rendererReady = true; return true; });
  handle('watch:done', ({ path: p, ok }) => sys.watchDone(config, p, ok));
}

app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  store = new Store(DATA_DIR);
  files = new filesMod.Files(DATA_DIR);
  config = new Config(DATA_DIR);
  setupSession();
  registerIpc();
  buildMenu();
  createWindow();
  sys.setupTray(ctx);
  sys.applyHotkey(ctx, config);
  sys.startWatch(ctx, config);
  updater = sys.setupUpdates(ctx, config);
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); else ctx.show(); });
});
app.on('second-instance', () => ctx.show());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { sys.setQuitting(); if (store) store.flushSync(); });
app.on('will-quit', () => { try { require('electron').globalShortcut.unregisterAll(); } catch {} });
