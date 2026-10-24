'use strict';
// Desktop integrations: tray, notifications, start with Windows, quick-add hotkey, watch folder,
// automatic backups, movable data folder, PIN lock, window position and automatic updates.
const { app, Tray, Menu, Notification, globalShortcut, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const TEST = !!process.env.AR_TEST;
const WATCH_EXT = /\.(msg|eml|zip|pdf|docx?|xlsx?|xlsm|csv|pptx|txt|png|jpe?g|webp|gif|dxf|rtf|html?)$/i;

function defaults() {
  return {
    closeToTray: process.platform === 'win32' && !TEST, startWithWindows: false, startHidden: false,
    hotkey: 'CommandOrControl+Shift+Space', notify: true, autoUpdate: true,
    watchDir: '', backupDir: path.join(app.getPath('documents'), 'Action Register Backups'), backupKeep: 14,
    pin: null, window: null,
  };
}
const prefs = config => ({ ...defaults(), ...(config.get().desktop || {}) });
const setPrefs = (config, patch) => config.set({ desktop: { ...prefs(config), ...patch } });

/* ---------- window position ---------- */
function windowOptions(config) {
  const w = prefs(config).window;
  if (!w || TEST) return { width: 1440, height: 950 };
  const { screen } = require('electron');
  const onScreen = screen.getAllDisplays().some(d => w.x >= d.bounds.x - 50 && w.y >= d.bounds.y - 50 && w.x < d.bounds.x + d.bounds.width && w.y < d.bounds.y + d.bounds.height);
  return onScreen ? { x: w.x, y: w.y, width: w.width, height: w.height } : { width: w.width || 1440, height: w.height || 950 };
}
function trackWindow(win, config) {
  let t = null;
  const save = () => { if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return; setPrefs(config, { window: { ...win.getNormalBounds(), maximized: win.isMaximized() } }); };
  win.on('resize', () => { clearTimeout(t); t = setTimeout(save, 600); });
  win.on('move', () => { clearTimeout(t); t = setTimeout(save, 600); });
  win.on('close', save);
  const w = prefs(config).window; if (w && w.maximized && !TEST) win.maximize();
}

/* ---------- tray, close to tray, start with Windows ---------- */
let tray = null, quitting = false, toldTray = false;
function setupTray(ctx) {
  if (TEST || tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('Action Register');
    const menu = Menu.buildFromTemplate([
      { label: 'Open Action Register', click: () => ctx.show() },
      { label: 'Quick add task…', click: () => { ctx.show(); ctx.send('quick-add', {}); } },
      { label: 'Check Gmail now', click: () => ctx.send('gmail-check', {}) },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]);
    tray.setContextMenu(menu);
    tray.on('click', () => ctx.show());
  } catch { tray = null; }
}
function closeToTray(win, config) {
  app.on('before-quit', () => { quitting = true; });
  win.on('close', e => {
    if (quitting || !tray || !prefs(config).closeToTray) return;
    e.preventDefault(); win.hide();
    if (!toldTray && Notification.isSupported()) { toldTray = true; new Notification({ title: 'Action Register is still running', body: 'It keeps checking Gmail in the background. Right-click the tray icon to quit.', silent: true }).show(); }
  });
}
function applyLoginItem(config) {
  if (TEST || !['win32', 'darwin'].includes(process.platform)) return;
  const p = prefs(config);
  try { app.setLoginItemSettings({ openAtLogin: !!p.startWithWindows, args: p.startHidden ? ['--hidden'] : [] }); } catch {}
}
const startedHidden = () => process.argv.includes('--hidden');

/* ---------- notifications ---------- */
function notify(ctx, config, { title, body, view, id }) {
  if (!prefs(config).notify || !Notification.isSupported()) return false;
  const n = new Notification({ title: String(title || 'Action Register').slice(0, 120), body: String(body || '').slice(0, 300), icon: path.join(__dirname, '..', 'build', 'icon.png') });
  n.on('click', () => { ctx.show(); if (view) ctx.send('nav', { view, id }); });
  n.show(); return true;
}

/* ---------- quick-add hotkey ---------- */
function applyHotkey(ctx, config) {
  if (TEST) return { ok: true };
  globalShortcut.unregisterAll();
  const key = prefs(config).hotkey;
  if (!key) return { ok: true };
  try { const ok = globalShortcut.register(key, () => { ctx.show(); ctx.send('quick-add', {}); }); return { ok }; }
  catch { return { ok: false }; }
}

/* ---------- watch folder ---------- */
// Files saved into the folder are handed to the renderer, which imports them like dropped files,
// then moved into an "Imported" subfolder.
let watchTimer = null; const sizes = new Map(); const sent = new Set();
function startWatch(ctx, config) {
  clearInterval(watchTimer); sizes.clear();
  const dir = prefs(config).watchDir; if (!dir) return;
  try { fs.mkdirSync(dir, { recursive: true }); } catch { return; }
  const tick = async () => {
    if (!ctx.rendererReady()) return;
    let names = [];
    try { names = await fs.promises.readdir(dir); } catch { return; }
    for (const name of names) {
      if (!WATCH_EXT.test(name) || name.startsWith('~$') || name.startsWith('.')) continue;
      const full = path.join(dir, name);
      let st; try { st = await fs.promises.stat(full); } catch { continue; }
      if (!st.isFile() || sent.has(full)) continue;
      // only once the size has stopped changing (Outlook may still be writing it)
      if (sizes.get(full) !== st.size) { sizes.set(full, st.size); continue; }
      if (st.size > 150 * 1024 * 1024) continue;
      sent.add(full);
      try { const data = await fs.promises.readFile(full); ctx.send('import:file', { name, path: full, data: new Uint8Array(data) }); }
      catch { sent.delete(full); }
    }
  };
  watchTimer = setInterval(tick, TEST ? 700 : 3000); tick();
}
async function watchDone(config, file, ok) {
  const dir = prefs(config).watchDir; if (!dir || !file.startsWith(dir)) return;
  sent.delete(file); sizes.delete(file);
  if (!ok) return;
  const done = path.join(dir, 'Imported'); await fs.promises.mkdir(done, { recursive: true });
  let target = path.join(done, path.basename(file));
  if (fs.existsSync(target)) target = path.join(done, Date.now() + '-' + path.basename(file));
  try { await fs.promises.rename(file, target); } catch {}
}

/* ---------- backups ---------- */
async function writeBackup(config, name, text) {
  const p = prefs(config), dir = p.backupDir; if (!dir) throw { code: 'invalid_argument', message: 'No backup folder set.' };
  await fs.promises.mkdir(dir, { recursive: true });
  const file = path.join(dir, path.basename(name));
  await fs.promises.writeFile(file, text);
  const old = (await fs.promises.readdir(dir)).filter(f => /^action-register-backup-.*\.json$/.test(f)).sort().reverse();
  for (const f of old.slice(Math.max(1, p.backupKeep || 14))) { try { await fs.promises.rm(path.join(dir, f)); } catch {} }
  return { path: file };
}
async function chooseFolder(win, title, current) {
  if (TEST && process.env.AR_TEST_FOLDER) return process.env.AR_TEST_FOLDER;
  const r = await dialog.showOpenDialog(win, { title, defaultPath: current || app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] });
  return r.canceled || !r.filePaths[0] ? '' : r.filePaths[0];
}

/* ---------- data folder location ---------- */
const pointerFile = () => path.join(app.getPath('userData'), 'location.json');
function resolveDataDir() {
  try { const p = JSON.parse(fs.readFileSync(pointerFile(), 'utf8')).dataDir; if (p && fs.existsSync(p)) return p; } catch {}
  return path.join(app.getPath('userData'), 'data');
}
// Copies the data to <folder>/Action Register Data (or uses data already there) and restarts.
async function moveDataDir(current, folder, flush) {
  const target = path.join(folder, 'Action Register Data');
  await flush();
  const existing = fs.existsSync(path.join(target, 'register.json'));
  if (!existing) await fs.promises.cp(current, target, { recursive: true, errorOnExist: false, force: true });
  await fs.promises.writeFile(pointerFile(), JSON.stringify({ dataDir: target }));
  return { target, usedExisting: existing };
}

/* ---------- PIN lock ---------- */
const hashPin = (pin, salt) => crypto.scryptSync(String(pin), salt, 32).toString('hex');
function setPin(config, pin) {
  if (!pin) { setPrefs(config, { pin: null }); return; }
  if (!/^\d{4,8}$/.test(String(pin))) throw { code: 'invalid_argument', message: 'Use 4 to 8 digits.' };
  const salt = crypto.randomBytes(16).toString('hex'); setPrefs(config, { pin: { salt, hash: hashPin(pin, salt) } });
}
function checkPin(config, pin) {
  const p = prefs(config).pin; if (!p) return true;
  const a = Buffer.from(hashPin(pin, p.salt), 'hex'), b = Buffer.from(p.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- automatic updates (Windows installer builds) ---------- */
let updateInfo = null;
function setupUpdates(ctx, config) {
  if (TEST || !app.isPackaged || process.platform !== 'win32' || process.env.PORTABLE_EXECUTABLE_DIR || !prefs(config).autoUpdate) return;
  let autoUpdater;
  try { ({ autoUpdater } = require('electron-updater')); } catch { return; }
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', info => { updateInfo = { version: info.version }; ctx.send('update:ready', updateInfo); });
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000); setInterval(check, 6 * 3600 * 1000);
  return { install: () => { quitting = true; autoUpdater.quitAndInstall(); } };
}

module.exports = {
  prefs, setPrefs, windowOptions, trackWindow, setupTray, closeToTray, applyLoginItem, startedHidden, notify, applyHotkey,
  startWatch, watchDone, writeBackup, chooseFolder, resolveDataDir, moveDataDir, setPin, checkPin, setupUpdates,
  updateReady: () => updateInfo, setQuitting: () => { quitting = true; }, shell,
};
