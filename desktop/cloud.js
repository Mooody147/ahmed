'use strict';
// Cloud sync through your own free Supabase project: sign in with email + password on any PC and the
// register (tasks, emails, canvas, daily, money, notebooks…) is kept the same everywhere. Stored files
// (email originals, attachments, workbooks, receipts) follow on demand. Canvas share links read a
// snapshot through a public function that returns only that one share.
// Rows: ar_docs (user_id, path, data, deleted, updated_at, device). The server sets updated_at, so
// "newer" never depends on the PCs' clocks; the last write of a document wins.
const { net } = require('electron');
const crypto = require('crypto');

const BUCKET = 'ar-files';
const MAX_FILE = 45 * 1024 * 1024; // Supabase free plan: 50 MB per file
const SYNC_KINDS = new Set(['workbooks', 'htmltools', 'refdocs', 'emails', 'attachments', 'receipts', 'photos', 'notebook']);

class Cloud {
  constructor(config, store, files, ctx) {
    this.config = config; this.store = store; this.files = files; this.ctx = ctx;
    this.queue = new Map(); this.fileQueue = new Map(); this.timer = null; this.busy = false; this.state = { syncing: false, error: '', lastSync: '' };
    this.poll = null; this.access = null; this.accessExp = 0;
  }
  s() { return { files: true, ...(this.config.get().cloud || {}) }; }
  set(patch) { this.config.set({ cloud: { ...this.s(), ...patch } }); }
  device() { let d = this.s().device; if (!d) { d = crypto.randomBytes(6).toString('hex'); this.set({ device: d }); } return d; }
  signedIn() { const s = this.s(); return !!(s.url && s.key && s.userId && this.config.secret('cloudRefresh')); }
  status() {
    const s = this.s();
    return { configured: !!(s.url && s.key), signedIn: this.signedIn(), url: s.url || '', email: s.email || '', files: s.files !== false, lastSync: this.state.lastSync || s.lastSyncAt || '', syncing: this.state.syncing, error: this.state.error, pending: this.queue.size + this.fileQueue.size, code: s.url && s.key ? Buffer.from(JSON.stringify({ u: s.url, k: s.key })).toString('base64url') : '', viewer: s.viewer || 'https://mooody147.github.io/ahmed/' };
  }

  /* ---------- HTTP ---------- */
  async req(method, p, { body, headers = {}, auth = true, raw = false } = {}) {
    const s = this.s();
    const h = { apikey: s.key, ...headers };
    if (auth) h.Authorization = 'Bearer ' + await this.token(); else h.Authorization = 'Bearer ' + s.key;
    if (body !== undefined && !raw) h['Content-Type'] = 'application/json';
    const res = await net.fetch(s.url.replace(/\/+$/, '') + p, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body) });
    if (res.status === 401 && auth && !this._retry) { this.access = null; this._retry = true; try { return await this.req(method, p, { body, headers, auth, raw }); } finally { this._retry = false; } }
    if (!res.ok) {
      let msg = ''; try { const t = await res.text(); try { const j = JSON.parse(t); msg = j.msg || j.message || j.error_description || j.error || t; } catch { msg = t; } } catch {}
      const code = res.status === 401 || res.status === 403 ? 'auth_failed' : res.status === 404 ? 'not_found' : res.status === 400 && /invalid login|invalid_grant|credentials/i.test(msg) ? 'auth_failed' : 'upstream_error';
      throw { code, status: res.status, message: String(msg).slice(0, 300) || 'HTTP ' + res.status };
    }
    return raw ? new Uint8Array(await res.arrayBuffer()) : res.status === 204 ? null : res.json().catch(() => null);
  }
  async token() {
    if (this.access && Date.now() < this.accessExp - 60000) return this.access;
    const rt = this.config.secret('cloudRefresh'); if (!rt) throw { code: 'auth_failed', message: 'Signed out' };
    const r = await this.req('POST', '/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: rt }, auth: false });
    this.keep(r); return this.access;
  }
  keep(r) {
    this.access = r.access_token; this.accessExp = Date.now() + (r.expires_in || 3600) * 1000;
    if (r.refresh_token) this.config.setSecret('cloudRefresh', r.refresh_token);
    if (r.user) this.set({ userId: r.user.id, email: r.user.email || this.s().email });
  }

  /* ---------- account ---------- */
  connect({ url, key, code, reset }) {
    if (reset) { this.signOut(); this.set({ url: '', key: '' }); return; }
    if (code) { try { const j = JSON.parse(Buffer.from(String(code).trim(), 'base64url').toString('utf8')); url = j.u; key = j.k; } catch { throw { code: 'invalid_argument', message: 'That connection code is not complete — copy it again from the other PC.' }; } }
    url = String(url || '').trim().replace(/\/+$/, ''); key = String(key || '').trim();
    if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(url)) throw { code: 'invalid_argument', message: 'The project URL looks like https://abcd1234.supabase.co' };
    if (key.length < 20) throw { code: 'invalid_argument', message: 'Paste the anon / publishable key of the project.' };
    if (this.s().url && this.s().url !== url) this.signOut();
    this.set({ url, key });
  }
  async signIn({ email, password, create }) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw { code: 'invalid_argument', message: 'Enter your email address.' };
    if (String(password || '').length < 8) throw { code: 'invalid_argument', message: 'Use a password of at least 8 characters.' };
    if (create) {
      const r = await this.req('POST', '/auth/v1/signup', { body: { email, password }, auth: false });
      if (!r || !r.access_token) return { confirm: true }; // the project asks to confirm the email first
      this.keep(r);
    } else {
      const r = await this.req('POST', '/auth/v1/token?grant_type=password', { body: { email, password }, auth: false });
      this.keep(r);
    }
    this.set({ email, lastPull: '' });
    await this.firstSync();
    this.start();
    return { ok: true };
  }
  signOut() {
    this.config.setSecret('cloudRefresh', null); this.access = null;
    this.set({ userId: '', lastPull: '' }); this.queue.clear(); this.fileQueue.clear(); this.stop();
  }

  /* ---------- documents ---------- */
  // called by the IPC handlers after a local write
  local(path, deleted) { if (!this.signedIn() || this.applying) return; this.queue.set(path, deleted ? 'del' : 'set'); this.schedule(); }
  schedule(ms = 1500) { clearTimeout(this.timer); this.timer = setTimeout(() => this.syncNow().catch(() => {}), ms); }
  async push() {
    if (!this.queue.size) return 0;
    const items = [...this.queue.entries()]; this.queue.clear();
    const rows = [];
    for (const [path, op] of items) rows.push({ user_id: this.s().userId, path, data: op === 'del' ? null : await this.store.get(path), deleted: op === 'del', device: this.device() });
    try {
      for (let i = 0; i < rows.length; i += 200) await this.req('POST', '/rest/v1/ar_docs?on_conflict=user_id,path', { body: rows.slice(i, i + 200), headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    } catch (e) { for (const [p, op] of items) if (!this.queue.has(p)) this.queue.set(p, op); throw e; }
    return rows.length;
  }
  async pull(all) {
    let since = all ? '' : this.s().lastPull || '', got = 0, newest = since;
    for (let guard = 0; guard < 400; guard++) {
      const q = `/rest/v1/ar_docs?select=path,data,deleted,updated_at,device&order=updated_at.asc&limit=500${since ? '&updated_at=gt.' + encodeURIComponent(since) : ''}`;
      const rows = await this.req('GET', q); if (!rows || !rows.length) break;
      for (const r of rows) { if (r.device !== this.device() || all) await this.apply(r); newest = r.updated_at; got++; }
      since = newest; if (rows.length < 500) break;
    }
    if (newest) this.set({ lastPull: newest });
    return got;
  }
  async apply(r) {
    if (this.queue.has(r.path)) return; // a local change waiting to go up wins
    this.applying = true;
    try {
      if (r.deleted) { await this.store.delete(r.path); this.ctx.send('db:remote', { path: r.path, data: null }); }
      else { await this.store.set(r.path, r.data); this.ctx.send('db:remote', { path: r.path, data: /\/texts\/[^/]+$/.test(r.path) ? undefined : r.data }); }
    } catch {} finally { this.applying = false; }
  }
  // first sign-in on a PC: what is only here goes up, what is only in the cloud comes down, and for
  // documents on both sides the one edited last (its updatedAt) is kept
  async firstSync() {
    this.state.syncing = true; this.notify();
    try {
      const remote = new Map();
      let since = '';
      for (let guard = 0; guard < 400; guard++) {
        const rows = await this.req('GET', `/rest/v1/ar_docs?select=path,data,deleted,updated_at&order=updated_at.asc&limit=500${since ? '&updated_at=gt.' + encodeURIComponent(since) : ''}`);
        if (!rows || !rows.length) break; for (const r of rows) remote.set(r.path, r); since = rows[rows.length - 1].updated_at; if (rows.length < 500) break;
      }
      const local = this.store.loadAll().docs, paths = new Set(Object.keys(local));
      for (const p of Object.keys(local)) { const m = /^(.*)\/emails\/([^/]+)$/.exec(p); if (m) { const tp = `${m[1]}/texts/${m[2]}`; if (!remote.has(tp) && await this.store.get(tp)) paths.add(tp); } }
      const stamp = d => (d && (d.updatedAt || d.savedAt || d.createdAt)) || '';
      for (const p of paths) {
        const r = remote.get(p);
        if (!r) { this.queue.set(p, 'set'); continue; }
        const l = local[p];
        if (l !== undefined && !r.deleted && stamp(l) > stamp(r.data)) this.queue.set(p, 'set');
      }
      for (const r of remote.values()) if (!this.queue.has(r.path)) await this.apply(r);
      if (since) this.set({ lastPull: since });
      await this.push();
      if (this.s().files !== false) this.queueAllFiles();
      this.state.lastSync = new Date().toISOString(); this.state.error = ''; this.set({ lastSyncAt: this.state.lastSync });
      this.ctx.send('cloud:reload', {});
    } catch (e) { this.state.error = e.message || e.code; throw e; }
    finally { this.state.syncing = false; this.notify(); }
  }
  async syncNow() {
    if (!this.signedIn()) return this.status();
    if (this.busy) { this.again = true; return this.status(); } // a change during a sync goes up right after it
    this.busy = true; this.state.syncing = true; this.notify();
    try { await this.push(); await this.pull(); await this.pushFiles(); this.state.error = ''; this.state.lastSync = new Date().toISOString(); this.set({ lastSyncAt: this.state.lastSync }); }
    catch (e) { this.state.error = (e && (e.message || e.code)) || 'Sync failed'; if (e && e.code === 'auth_failed' && /refresh|invalid_grant|Signed out/i.test(e.message || '')) this.signOut(); }
    finally { this.busy = false; this.state.syncing = false; this.notify(); if (this.again || this.queue.size) { this.again = false; this.schedule(500); } }
    return this.status();
  }
  // before the app quits: send what is still waiting (at most a few seconds)
  async flush(ms = 4000) { if (!this.signedIn() || !this.queue.size) return; await Promise.race([this.push().catch(() => {}), new Promise(r => setTimeout(r, ms))]); }
  start() { this.stop(); if (!this.signedIn()) return; const ms = +process.env.AR_CLOUD_POLL_MS || 60000; this.poll = setInterval(() => this.syncNow(), ms); setTimeout(() => this.syncNow(), 1500); }
  stop() { clearInterval(this.poll); this.poll = null; }
  notify() { this.ctx.send('cloud:status', this.status()); }

  /* ---------- stored files ---------- */
  objPath(kind, id) { return `/storage/v1/object/${BUCKET}/${this.s().userId}/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`; }
  fileSaved(kind, id) { if (this.signedIn() && this.s().files !== false && SYNC_KINDS.has(kind)) { this.fileQueue.set(kind + '\n' + id, 1); this.schedule(3000); } }
  queueAllFiles() { for (const kind of SYNC_KINDS) for (const f of this.files.listSync(kind)) this.fileQueue.set(kind + '\n' + f, 1); }
  async pushFiles() {
    let n = 0;
    for (const k of [...this.fileQueue.keys()].slice(0, 40)) {
      const [kind, id] = k.split('\n');
      try {
        const bytes = await this.files.load(kind, id);
        if (bytes && bytes.length <= MAX_FILE) {
          const meta = (await this.files.info(kind, id)) || {};
          await this.req('POST', this.objPath(kind, id), { body: Buffer.from(bytes), raw: true, headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' } });
          await this.req('POST', this.objPath(kind, id + '.meta.json'), { body: Buffer.from(JSON.stringify(meta)), raw: true, headers: { 'Content-Type': 'application/json', 'x-upsert': 'true' } });
          n++;
        }
        this.fileQueue.delete(k);
      } catch (e) { if (e && e.code === 'auth_failed') throw e; this.fileQueue.delete(k); }
    }
    if (this.fileQueue.size) this.schedule(2000);
    return n;
  }
  // a file that is not on this PC yet is fetched from the cloud the first time it is needed
  async fetchFile(kind, id) {
    if (!this.signedIn() || !SYNC_KINDS.has(kind)) return null;
    try {
      const bytes = await this.req('GET', this.objPath(kind, id), { raw: true });
      let meta = {}; try { meta = JSON.parse(Buffer.from(await this.req('GET', this.objPath(kind, id + '.meta.json'), { raw: true })).toString('utf8')); } catch {}
      await this.files.save(kind, id, bytes, meta);
      return bytes;
    } catch { return null; }
  }

  /* ---------- canvas share links ---------- */
  async share({ token, title, snapshot }) {
    if (!this.signedIn()) throw { code: 'not_signed_in', message: 'Sign in to cloud sync first (Setup › Cloud sync).' };
    token = token || crypto.randomBytes(18).toString('base64url');
    await this.req('POST', '/rest/v1/ar_shares?on_conflict=token', { body: [{ token, user_id: this.s().userId, kind: 'canvas', title: String(title || '').slice(0, 200), snapshot, revoked: false, updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
    const s = this.s();
    const hash = Buffer.from(JSON.stringify({ u: s.url, k: s.key, t: token })).toString('base64url');
    return { token, link: (s.viewer || 'https://mooody147.github.io/ahmed/').replace(/#.*$/, '') + '#s=' + hash };
  }
  async unshare({ token }) { await this.req('PATCH', '/rest/v1/ar_shares?token=eq.' + encodeURIComponent(token), { body: { revoked: true }, headers: { Prefer: 'return=minimal' } }); return true; }
}

// The script you run once in the Supabase SQL editor (also in docs/CLOUD-SETUP.md).
const SETUP_SQL = `-- Action Register cloud sync: run once in Supabase › SQL Editor › New query › Run
create table if not exists public.ar_docs (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  path text not null,
  data jsonb,
  deleted boolean not null default false,
  device text,
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
create index if not exists ar_docs_user_updated on public.ar_docs (user_id, updated_at);
create or replace function public.ar_touch() returns trigger language plpgsql as $$ begin new.updated_at = clock_timestamp(); return new; end $$;
drop trigger if exists ar_docs_touch on public.ar_docs;
create trigger ar_docs_touch before insert or update on public.ar_docs for each row execute function public.ar_touch();
alter table public.ar_docs enable row level security;
drop policy if exists "ar_docs own rows" on public.ar_docs;
create policy "ar_docs own rows" on public.ar_docs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.ar_docs to authenticated;

create table if not exists public.ar_shares (
  token text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null default 'canvas',
  title text,
  snapshot jsonb,
  revoked boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.ar_shares enable row level security;
drop policy if exists "ar_shares own rows" on public.ar_shares;
create policy "ar_shares own rows" on public.ar_shares for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.ar_shares to authenticated;
-- anyone with a share link can read that one canvas, nothing else
create or replace function public.ar_get_share(t text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', title, 'snapshot', snapshot, 'updated_at', updated_at) from public.ar_shares where token = t and not revoked;
$$;
revoke all on function public.ar_get_share(text) from public;
grant execute on function public.ar_get_share(text) to anon, authenticated;

-- stored files (email originals, attachments, workbooks, receipts): private, one folder per user
insert into storage.buckets (id, name, public) values ('ar-files', 'ar-files', false) on conflict (id) do nothing;
drop policy if exists "ar files read" on storage.objects;
drop policy if exists "ar files add" on storage.objects;
drop policy if exists "ar files change" on storage.objects;
drop policy if exists "ar files remove" on storage.objects;
create policy "ar files read" on storage.objects for select to authenticated using (bucket_id = 'ar-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ar files add" on storage.objects for insert to authenticated with check (bucket_id = 'ar-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ar files change" on storage.objects for update to authenticated using (bucket_id = 'ar-files' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ar files remove" on storage.objects for delete to authenticated using (bucket_id = 'ar-files' and (storage.foldername(name))[1] = auth.uid()::text);
`;

module.exports = { Cloud, SETUP_SQL };
