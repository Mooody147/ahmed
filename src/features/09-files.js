/* ---------- stored files: workbooks, HTML tools, reference documents, email originals, attachments, receipts ---------- */
// Desktop: files beside the register (desktop/files.js). Browser: IndexedDB in this browser.
const FILES = (() => {
  let dbp = null;
  const idb = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('action-register-files', 1); r.onupgradeneeded = () => r.result.createObjectStore('f'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('f', mode); const st = t.objectStore('f'); const out = fn(st); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
  const toBytes = async d => d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : d instanceof Blob ? new Uint8Array(await d.arrayBuffer()) : typeof d === 'string' ? new TextEncoder().encode(d) : new Uint8Array(d || []);
  return {
    async save(kind, id, data, meta) {
      const bytes = await toBytes(data);
      if (DESKTOP) return DK.call('files:save', { kind, id, data: bytes, meta });
      await tx('readwrite', st => { st.put(bytes, kind + '/' + id); st.put({ ...(meta || {}), size: bytes.length, savedAt: nowISO() }, kind + '/' + id + '.json'); });
      return { size: bytes.length };
    },
    async load(kind, id) {
      if (DESKTOP) { const r = await DK.call('files:load', { kind, id }); return r ? new Uint8Array(r) : null; }
      const r = await tx('readonly', st => st.get(kind + '/' + id)); return r || null;
    },
    async remove(kind, id) { if (DESKTOP) return DK.call('files:remove', { kind, id }); await tx('readwrite', st => { st.delete(kind + '/' + id); st.delete(kind + '/' + id + '.json'); }); },
    // open with the program the computer uses for that type (desktop); the browser downloads it instead
    async open(kind, id, name) {
      if (DESKTOP) return DK.call('files:open', { kind, id, name });
      const b = await this.load(kind, id); if (b) offerFile(name || id, new Blob([b]));
    },
  };
})();
