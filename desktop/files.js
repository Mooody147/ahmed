'use strict';
// Files kept next to the register: imported workbooks, HTML tools, reference documents, original
// emails and attachments, receipts and photos. Each lives at <data>/files/<kind>/<id> with a small
// .json beside it (name, type, size). HTML tools open in their own locked-down window and get a
// window.claude-style store for their saved cases (desktop/tool-preload.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { BrowserWindow, session, shell } = require('electron');

const KINDS = new Set(['workbooks', 'htmltools', 'refdocs', 'emails', 'attachments', 'receipts', 'photos', 'notebook']);
const safeId = id => { const s = String(id || ''); if (!/^[\w.-]{1,120}$/.test(s) || s.includes('..')) throw { code: 'invalid_argument', message: 'Bad file id' }; return s; };
const safeKind = k => { if (!KINDS.has(k)) throw { code: 'invalid_argument', message: 'Bad file kind' }; return k; };

class Files {
  constructor(dataDir) { this.root = path.join(dataDir, 'files'); fs.mkdirSync(this.root, { recursive: true }); }
  file(kind, id) { return path.join(this.root, safeKind(kind), safeId(id)); }
  async save(kind, id, data, meta) {
    const f = this.file(kind, id); await fs.promises.mkdir(path.dirname(f), { recursive: true });
    const buf = Buffer.from(data instanceof Uint8Array ? data : new Uint8Array(data));
    await fs.promises.writeFile(f + '.tmp', buf); await fs.promises.rename(f + '.tmp', f);
    const info = { ...(meta || {}), size: buf.length, sha1: crypto.createHash('sha1').update(buf).digest('hex'), savedAt: new Date().toISOString() };
    await fs.promises.writeFile(f + '.json', JSON.stringify(info));
    return info;
  }
  async load(kind, id) { try { return new Uint8Array(await fs.promises.readFile(this.file(kind, id))); } catch { return null; } }
  async info(kind, id) { try { return JSON.parse(await fs.promises.readFile(this.file(kind, id) + '.json', 'utf8')); } catch { return null; } }
  async remove(kind, id) { const f = this.file(kind, id); await fs.promises.rm(f, { force: true }); await fs.promises.rm(f + '.json', { force: true }); }
  async list(kind) {
    const dir = path.join(this.root, safeKind(kind)); let names = [];
    try { names = await fs.promises.readdir(dir); } catch { return []; }
    const out = [];
    for (const n of names) { if (n.endsWith('.json') || n.endsWith('.tmp')) continue; out.push({ id: n, ...(await this.info(kind, n) || {}) }); }
    return out;
  }
  // open with the program Windows uses for that file type (a copy with its real name and extension)
  async open(kind, id, name) {
    const src = this.file(kind, id); if (!fs.existsSync(src)) throw { code: 'not_found', message: 'File not found' };
    const dir = path.join(this.root, '_open', safeId(id)); await fs.promises.mkdir(dir, { recursive: true });
    const base = String(name || id).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150) || id;
    const dst = path.join(dir, base); await fs.promises.copyFile(src, dst);
    const err = await shell.openPath(dst); if (err) throw { code: 'open_failed', message: err };
    return dst;
  }
  // copy a stored file into a folder the user chose (e.g. the company server), keeping its name
  async copyTo(kind, id, folder, name) {
    const src = this.file(kind, id); await fs.promises.mkdir(folder, { recursive: true });
    let base = String(name || id).replace(/[\\/:*?"<>|]+/g, '_').slice(0, 150) || id, dst = path.join(folder, base), k = 1;
    const ext = path.extname(base), stem = base.slice(0, base.length - ext.length);
    while (fs.existsSync(dst)) dst = path.join(folder, `${stem} (${++k})${ext}`);
    await fs.promises.copyFile(src, dst); return dst;
  }
}

/* ---------- HTML tools ---------- */
const TOOL_PARTITION = 'persist:ar-tools';
let toolSessionReady = false;
const toolWindows = new Map();
function toolSession(files) {
  const ses = session.fromPartition(TOOL_PARTITION);
  if (toolSessionReady) return ses; toolSessionReady = true;
  ses.protocol.handle('artool', async req => {
    const u = new URL(req.url); const id = u.hostname;
    const data = await files.load('htmltools', id);
    if (!data) return new Response('Tool not found', { status: 404 });
    return new Response(Buffer.from(data), { headers: {
      'content-type': 'text/html; charset=utf-8',
      // the tool's own inline code runs; it cannot reach the network except Google Fonts
      'content-security-policy': "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; connect-src data: blob:; worker-src blob:; media-src data: blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'",
    } });
  });
  ses.webRequest.onBeforeRequest((d, cb) => cb({ cancel: !/^(artool|data|blob|devtools|chrome-extension):|^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(d.url) }));
  ses.setPermissionRequestHandler((wc, perm, cb) => cb(perm === 'clipboard-sanitized-write'));
  ses.setPermissionCheckHandler((wc, perm) => perm === 'clipboard-sanitized-write');
  return ses;
}
function openTool(files, id, title, userName) {
  safeId(id);
  const open = toolWindows.get(id); if (open && !open.isDestroyed()) { open.show(); open.focus(); return true; }
  toolSession(files);
  const w = new BrowserWindow({
    width: 1320, height: 900, minWidth: 360, minHeight: 480, title: title || 'Tool', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'tool-preload.js'), partition: TOOL_PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true, additionalArguments: ['--ar-tool=' + id, '--ar-user=' + encodeURIComponent(String(userName || 'Me').slice(0, 80))] },
  });
  w.once('ready-to-show', () => w.show());
  w.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('artool://' + id + '/')) e.preventDefault(); });
  w.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  w.on('page-title-updated', (e) => { if (title) { e.preventDefault(); w.setTitle(title); } });
  w.loadURL('artool://' + id + '/index.html');
  toolWindows.set(id, w); w.on('closed', () => toolWindows.delete(id));
  return true;
}
// tool storage: data/users/local/tools/<tool>/<collection>/<doc>, so it is backed up and synced with everything else
const toolPath = (tool, col, doc) => { const t = safeId(tool), c = String(col || ''); if (!/^[\w-]{1,60}$/.test(c)) throw { code: 'invalid_argument', message: 'Bad collection' }; return 'data/users/local/tools/' + t + '/' + c + (doc ? '/' + safeId(doc) : ''); };
function toolDbIpc(ipcMain, store, notifyAll) {
  const handleT = (ch, fn) => ipcMain.handle(ch, async (e, arg) => { try { return { ok: true, value: await fn(arg, e) } } catch (err) { return { ok: false, error: { code: err.code || 'error', message: err.message || String(err) } }; } });
  handleT('tooldb:list', ({ tool, col }) => { const pre = toolPath(tool, col) + '/'; return Object.entries(store.loadAll().docs).filter(([p]) => p.startsWith(pre) && !p.slice(pre.length).includes('/')).map(([p, data]) => ({ id: p.slice(pre.length), data })); });
  handleT('tooldb:get', ({ tool, col, id }) => store.get(toolPath(tool, col, id)));
  handleT('tooldb:set', async ({ tool, col, id, data, merge }) => { const p = toolPath(tool, col, id); const cur = merge ? await store.get(p) : null; await store.set(p, merge && cur ? { ...cur, ...data } : data); notifyAll(tool, col); return true; });
  handleT('tooldb:delete', async ({ tool, col, id }) => { await store.delete(toolPath(tool, col, id)); notifyAll(tool, col); return true; });
}
function notifyToolWindows(tool, col) { const w = toolWindows.get(tool); if (w && !w.isDestroyed()) w.webContents.send('tooldb:changed', { col }); }

module.exports = { Files, openTool, toolDbIpc, notifyToolWindows, KINDS };
