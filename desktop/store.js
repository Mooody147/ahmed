'use strict';
// Local document store behind the renderer's db shim. Small documents (tasks, emails,
// settings, Gmail seen-list) live in one JSON file loaded at start; extracted texts are
// one file each and read on demand. Writes are atomic (temp file + rename).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const isText = p => /\/texts\/[^/]+$/.test(p);

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'register.json');
    this.textDir = path.join(dir, 'texts');
    fs.mkdirSync(this.textDir, { recursive: true });
    this.docs = {};
    try { this.docs = JSON.parse(fs.readFileSync(this.file, 'utf8')).docs || {}; }
    catch (e) {
      if (e.code !== 'ENOENT') { // keep the unreadable file for inspection instead of overwriting it
        try { fs.copyFileSync(this.file, this.file + '.unreadable-' + Date.now()); } catch {}
      }
    }
    this.timer = null; this.dirty = false; this.chain = Promise.resolve();
  }
  check(p) { if (typeof p !== 'string' || !/^data\/users\/[\w-]+\/[\w\-/.]+$/.test(p) || p.includes('..')) throw { code: 'invalid_argument', message: 'Bad path' }; }
  textFile(p) { return path.join(this.textDir, crypto.createHash('sha1').update(p).digest('hex') + '.json'); }
  loadAll() { return { docs: this.docs }; }
  async get(p) {
    this.check(p);
    if (!isText(p)) return this.docs[p] === undefined ? null : this.docs[p];
    try { return JSON.parse(await fs.promises.readFile(this.textFile(p), 'utf8')); } catch { return null; }
  }
  async set(p, data) {
    this.check(p);
    if (isText(p)) return atomicWrite(this.textFile(p), JSON.stringify(data));
    this.docs[p] = data; this.schedule();
  }
  async delete(p) {
    this.check(p);
    if (isText(p)) { await fs.promises.rm(this.textFile(p), { force: true }); return; }
    delete this.docs[p]; this.schedule();
  }
  schedule() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }
  flush() {
    // serialised so an older snapshot can never be renamed over a newer one
    this.chain = this.chain.then(() => {
      if (!this.dirty) return;
      this.dirty = false;
      return atomicWrite(this.file, JSON.stringify({ app: 'action-register', version: 1, savedAt: new Date().toISOString(), docs: this.docs }));
    }).catch(() => { this.dirty = true; });
    return this.chain;
  }
  flushSync() {
    clearTimeout(this.timer);
    if (!this.dirty) return;
    this.dirty = false;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ app: 'action-register', version: 1, savedAt: new Date().toISOString(), docs: this.docs }));
    fs.renameSync(tmp, this.file);
  }
}

let seq = 0;
async function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.${++seq}.tmp`;
  await fs.promises.writeFile(tmp, text);
  await fs.promises.rename(tmp, file);
}

module.exports = { Store, atomicWrite };
