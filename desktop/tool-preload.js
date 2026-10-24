'use strict';
// Preload for imported HTML tools (e.g. artifacts saved from claude.ai). It gives the page the same
// window.claude.use('db' | 'user' | 'downloads') surface it had as an artifact, stored in the app's
// register so saved cases are backed up and synced. Nothing else of the app is reachable.
const { contextBridge, ipcRenderer } = require('electron');

const arg = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : ''; };
const TOOL = arg('ar-tool'), USER = decodeURIComponent(arg('ar-user') || '') || 'Me';
const unwrap = r => { if (r && r.ok) return r.value; const e = new Error((r && r.error && r.error.message) || 'Storage error'); e.code = (r && r.error && r.error.code) || 'error'; throw e; };
const listeners = new Set();
ipcRenderer.on('tooldb:changed', (_e, m) => { for (const f of listeners) { try { f(m.col); } catch {} } });

contextBridge.exposeInMainWorld('__arToolBridge', {
  list: col => ipcRenderer.invoke('tooldb:list', { tool: TOOL, col }).then(unwrap),
  get: (col, id) => ipcRenderer.invoke('tooldb:get', { tool: TOOL, col, id }).then(unwrap),
  set: (col, id, data, merge) => ipcRenderer.invoke('tooldb:set', { tool: TOOL, col, id, data, merge }).then(unwrap),
  del: (col, id) => ipcRenderer.invoke('tooldb:delete', { tool: TOOL, col, id }).then(unwrap),
  save: (filename, bytes) => ipcRenderer.invoke('downloads:save', { filename, data: bytes }).then(unwrap),
  onChange: cb => { listeners.add(cb); },
  userName: () => USER,
});

// runs in the page's own world before its scripts
contextBridge.executeInMainWorld({ func: () => {
  const B = window.__arToolBridge; const subs = new Map();
  B.onChange(col => { const s = subs.get(col); if (s) for (const f of s) f(); });
  const copy = o => (o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)));
  const snap = docs => ({ docs: docs.map(d => ({ id: d.id, exists: true, data: () => copy(d.data) })), size: docs.length, empty: !docs.length, forEach(f) { this.docs.forEach(f); } });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const watch = (col, f) => { let s = subs.get(col); if (!s) subs.set(col, s = new Set()); s.add(f); f(); return () => s.delete(f); };
  function docRef(col, id) {
    return {
      id, path: col + '/' + id,
      async get() { const d = await B.get(col, id); return { id, exists: d !== null && d !== undefined, data: () => copy(d) }; },
      set: (data, o) => B.set(col, id, copy(data), !!(o && o.merge)),
      update: data => B.set(col, id, copy(data), true),
      delete: () => B.del(col, id),
      onSnapshot(cb, err) { return watch(col, () => B.get(col, id).then(d => cb({ id, exists: d !== null && d !== undefined, data: () => copy(d) }), e => err && err(e))); },
    };
  }
  function query(col, order, dir, lim, where) {
    async function run() {
      let d = await B.list(col);
      for (const [f, op, v] of where || []) d = d.filter(x => { const a = x.data && x.data[f]; return op === '==' ? a === v : op === '!=' ? a !== v : op === '<' ? a < v : op === '<=' ? a <= v : op === '>' ? a > v : op === '>=' ? a >= v : op === 'in' ? (v || []).includes(a) : op === 'array-contains' ? Array.isArray(a) && a.includes(v) : true; });
      if (order) d.sort((a, b) => { const x = a.data && a.data[order], y = b.data && b.data[order]; return (x < y ? -1 : x > y ? 1 : 0) * (dir === 'desc' ? -1 : 1); });
      if (lim) d = d.slice(0, lim);
      return d;
    }
    return {
      orderBy: (f, d) => query(col, f, d || 'asc', lim, where),
      limit: n => query(col, order, dir, n, where),
      where: (f, op, v) => query(col, order, dir, lim, [...(where || []), [f, op, v]]),
      async get() { return snap(await run()); },
      onSnapshot(cb, err) { return watch(col, () => run().then(d => cb(snap(d)), e => err && err(e))); },
      async add(data) { const id = newId(); await B.set(col, id, copy(data), false); return docRef(col, id); },
      doc: id => docRef(col, id || newId()),
    };
  }
  const db = { collection: c => query(c), doc: p => { const i = String(p).lastIndexOf('/'); return docRef(String(p).slice(0, i), String(p).slice(i + 1)); } };
  const me = { id: 'local', name: B.userName(), email: null };
  const user = { id: async () => 'local', me: async () => me, can: async () => true, canEdit: async () => true, isOwner: () => true, profiles: async ids => Object.fromEntries((ids || []).map(i => [i, { id: i, name: me.name }])) };
  const downloads = {
    async save({ filename, data }) {
      const buf = data instanceof Blob ? await data.arrayBuffer() : typeof data === 'string' ? new TextEncoder().encode(data).buffer : data instanceof ArrayBuffer ? data : data && data.buffer ? data.buffer : new ArrayBuffer(0);
      const r = await B.save(filename, new Uint8Array(buf)); return { status: r && r.status === 'saved' ? 'saved' : 'saved' };
    },
  };
  Object.defineProperty(window, 'claude', { value: Object.freeze({ use: async name => (name === 'db' ? db : name === 'user' ? user : name === 'downloads' ? downloads : null) }), configurable: false });
} });
