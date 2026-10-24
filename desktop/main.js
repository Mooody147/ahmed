'use strict';
// Electron main process. Serves the renderer from app://, keeps the API key and
// Gmail tokens here (never in the renderer), and answers the renderer's IPC calls
// that back the window.claude.use() surface (see src/platform.js).
const { app, BrowserWindow, ipcMain, protocol, net, session, shell, dialog, Menu, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pathToFileURL } = require('url');
const { Store } = require('./store');
const { Config } = require('./config');
const claude = require('./claude');
const gmail = require('./gmail');
const gmailImap = require('./gmail-imap');

const ROOT = path.join(__dirname, '..', 'app');
const PARTITION = 'persist:action-register';

if (process.env.AR_DATA_DIR) app.setPath('userData', path.resolve(process.env.AR_DATA_DIR));
const DATA_DIR = path.join(app.getPath('userData'), 'data');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

if (!process.env.AR_TEST && !app.requestSingleInstanceLock()) app.quit();

let win = null, store = null, config = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 950, minWidth: 360, minHeight: 520, show: false,
    title: 'Action Register', backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1413' : '#EEF1F0',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: true },
  });
  win.once('ready-to-show', () => win.show());
  // Nothing navigates away from the app; external links open in the default browser.
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.loadURL('app://local/index.html' + (process.env.AR_START_VIEW ? '#' + process.env.AR_START_VIEW : ''));
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
    { label: 'File', submenu: [{ label: 'Open data folder', click: () => shell.openPath(DATA_DIR) }, { type: 'separator' }, mac ? { role: 'close' } : { role: 'quit' }] },
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
  catch (err) { return { ok: false, error: { code: (err && err.code) || 'error', message: String((err && err.message) || err) } }; }
});

function status() {
  return {
    dataDir: DATA_DIR,
    user: { id: 'local', name: config.get().profileName || userName() },
    claude: { hasKey: !!config.secret('anthropicKey'), models: config.models(), maxPromptKB: config.get().maxPromptKB },
    gmail: { mode: gmailMode(), clientId: config.get().gmail.clientId || '', hasSecret: !!config.secret('gmailClientSecret'), connected: !!gmailMode(), account: config.get().gmail.account || '' },
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

function registerIpc() {
  ipcMain.on('desktop:status', e => { e.returnValue = status(); });
  handle('db:load', () => store.loadAll());
  handle('db:get', p => store.get(p));
  handle('db:set', ({ path: p, data }) => store.set(p, data));
  handle('db:delete', p => store.delete(p));

  handle('sample:json', (req, e) => claude.run(config, req, delta => { if (!e.sender.isDestroyed()) e.sender.send('sample:text', { id: req.id, delta }); }));
  handle('sample:abort', id => claude.abort(id));
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

  handle('downloads:save', async ({ filename, data }) => {
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
  });
  handle('shell:openData', () => shell.openPath(DATA_DIR));
  handle('shell:openExternal', url => { if (/^https:\/\/(console\.anthropic\.com|console\.cloud\.google\.com|docs\.anthropic\.com|myaccount\.google\.com|support\.google\.com|mail\.google\.com)\//.test(url)) return shell.openExternal(url); throw { code: 'forbidden', message: 'URL not allowed' }; });
}

app.whenReady().then(() => {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  store = new Store(DATA_DIR);
  config = new Config(DATA_DIR);
  setupSession();
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (store) store.flushSync(); });
