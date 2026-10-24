/* Desktop platform layer (Electron renderer). Provides the same window.claude.use()
   surface as the claude.ai artifact runtime — db, user, sample, mcp (Gmail), downloads —
   backed by the main process through window.arDesktop (desktop/preload.js).
   app.js and core.js run unchanged on top of it. test/mock.js is the in-memory twin. */
(() => {
'use strict';
const B = window.arDesktop;
if (!B) return;

// Reader libraries are bundled with the app (same pinned versions as the web build's CDN).
globalThis.ETM_CDN = {
  pdf: ['vendor/pdf.min.js', 'vendor/pdf.worker.min.js'],
  xlsx: ['vendor/xlsx.full.min.js'],
  mammoth: ['vendor/mammoth.browser.min.js'],
  jszip: ['vendor/jszip.min.js'],
};

let ST = B.status();
const refresh = () => { ST = B.status(); return ST; };
const unwrap = r => { if (r && r.ok) return r.value; throw (r && r.error) || { code: 'error', message: 'No answer from the app' }; };
const call = async (ch, arg) => unwrap(await B.invoke(ch, arg));
const clone = o => (o === undefined || o === null ? o : JSON.parse(JSON.stringify(o)));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- db: cache of small docs + texts on demand ---------- */
const cache = new Map(); let loaded = null;
const subs = new Set();
const isText = p => /\/texts\/[^/]+$/.test(p);
const parentOf = p => p.slice(0, p.lastIndexOf('/'));
const docSnap = (path, data) => ({ id: path.split('/').pop(), exists: data !== undefined && data !== null, data: () => clone(data), metadata: { fromCache: false, hasPendingWrites: false } });
function colSnap(path) {
  const docs = [...cache.entries()].filter(([k]) => parentOf(k) === path).map(([k, v]) => docSnap(k, v));
  return { docs, size: docs.length, empty: !docs.length, docChanges: () => [] };
}
function changed(path) { for (const s of subs) if (s.path === path || s.path === parentOf(path)) setTimeout(s.fire, 0); }
const docRef = path => ({
  id: path.split('/').pop(), path,
  async get() { if (!isText(path)) return docSnap(path, cache.get(path)); return docSnap(path, await call('db:get', path)); },
  async set(d) { const v = clone(d); await call('db:set', { path, data: v }); if (!isText(path)) { cache.set(path, v); changed(path); } },
  async update(d) { const cur = isText(path) ? await call('db:get', path) : cache.get(path); return this.set({ ...(cur || {}), ...d }); },
  async delete() { await call('db:delete', path); if (cache.delete(path)) changed(path); },
  onSnapshot(next) { const s = { path, fire: () => next(docSnap(path, cache.get(path))) }; subs.add(s); setTimeout(s.fire, 0); return () => subs.delete(s); },
  collection: c => colRef(path + '/' + c),
});
const colRef = path => ({
  path,
  doc: id => docRef(path + '/' + (id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8))),
  async get() { return colSnap(path); },
  onSnapshot(next) { const s = { path, fire: () => next(colSnap(path)) }; subs.add(s); setTimeout(s.fire, 0); return () => subs.delete(s); },
});
async function db() {
  if (!loaded) loaded = call('db:load').then(r => { for (const [k, v] of Object.entries(r.docs || {})) cache.set(k, v); });
  await loaded;
  return { doc: docRef, collection: colRef };
}

/* ---------- sample: Claude via the main process ---------- */
const listeners = new Map();
B.onSampleText(m => { const f = listeners.get(m.id); if (f) f(m.delta); });
function sample() {
  const f = async () => { throw { code: 'unavailable', message: 'Use sample.json' }; };
  f.json = async (prompt, opts = {}) => {
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'Stopped' };
    const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const images = await Promise.all((opts.images || []).map(async b => ({ type: b.type || 'image/jpeg', data: new Uint8Array(await b.arrayBuffer()) })));
    let text = '';
    listeners.set(id, d => { text += d; if (opts.onText) try { opts.onText({ text, delta: d }); } catch {} });
    const onAbort = () => { B.invoke('sample:abort', id); };
    if (opts.signal) opts.signal.addEventListener('abort', onAbort, { once: true });
    try { return await call('sample:json', { id, prompt, tier: opts.modelTier || 'complex', images }); }
    finally { listeners.delete(id); if (opts.signal) opts.signal.removeEventListener('abort', onAbort); }
  };
  f.limits = async () => ({ maxPromptBytes: (ST.claude.maxPromptKB || 600) * 1024, images: { maxCount: 20, maxInputBytes: 3.5e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } });
  return f;
}

const caps = {
  db,
  user: async () => ({ me: async () => ({ id: ST.user.id, name: ST.user.name, email: ST.gmail.account || null }), id: async () => ST.user.id, isOwner: async () => true, canEdit: async () => true, can: async () => true }),
  sample: async () => (ST.claude.hasKey ? sample() : null),
  mcp: async () => (ST.gmail.connected ? { callTool: async (server, tool, input) => { if (server !== 'Gmail') throw { code: 'server_not_connected' }; return call('gmail:call', { tool, input }); } } : null),
  downloads: async () => ({ save: async ({ filename, data }) => call('downloads:save', { filename, data: typeof data === 'string' ? data : new Uint8Array(await data.arrayBuffer()) }) }),
};

/* ---------- Setup › Connections ---------- */
const UIX = { busy: '', msg: null };
function stagingCount() { try { return window.__AR.UI.staging.filter(b => b.state !== 'done').length; } catch { return 0; } }
function suggestedAddress() {
  const a = (ST.gmail.account || '').toLowerCase(); const m = /^([^@+]+)(?:\+[^@]*)?@(.+)$/.exec(a);
  return m ? `${m[1]}+tasks@${m[2]}` : '';
}
const INFO = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/></svg>';
const callout = (kind, html) => `<div class="callout ${kind}">${INFO}<div><p>${html}</p></div></div>`;
function chip(ok, yes, no) { return `<span class="chip ${ok ? 'ok' : 'warn'}">${esc(ok ? yes : no)}</span>`; }
function connInner() {
  const c = ST.claude, g = ST.gmail, m = c.models, busy = UIX.busy;
  const msg = UIX.msg ? callout(UIX.msg.err ? 'crit' : 'ok', esc(UIX.msg.text)) : '';
  return `<div class="section-title"><h2>Connections</h2></div>
    ${msg}
    ${ST.secure ? '' : callout('warn', 'This computer has no system keychain available, so the API key and Gmail sign-in are stored obfuscated, not encrypted, in the data folder.')}
    <div style="display:grid;gap:10px">
      <div class="row"><b>Claude (Anthropic API)</b>${chip(c.hasKey, 'Key saved', 'Not set up')}<span class="spacer"></span></div>
      <p class="small muted" style="margin:0">Analysis uses your own Anthropic API key, billed to your Anthropic account. Create one at <a href="#" data-dact="open" data-url="https://console.anthropic.com/settings/keys">console.anthropic.com › API keys</a>. The key is kept in this computer’s keychain and only used to call Anthropic.</p>
      <div class="row"><input class="input" id="dk-key" type="password" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px" placeholder="${c.hasKey ? 'Saved — paste a new key to replace it' : 'sk-ant-…'}">
        <button class="btn primary" data-dact="save-key" ${busy ? 'disabled' : ''}>Save key</button>
        ${c.hasKey ? `<button class="btn" data-dact="test-key" ${busy ? 'disabled' : ''}>${busy === 'test' ? 'Testing…' : 'Test'}</button><button class="btn ghost danger" data-dact="remove-key" ${busy ? 'disabled' : ''}>Remove</button>` : ''}</div>
      <details class="howto"><summary>Models and limits</summary>
        <div class="grid2" style="margin-top:10px">
          <label class="field"><span>Thorough analysis</span><input class="input mono" id="dk-m-complex" value="${esc(m.complex)}"></label>
          <label class="field"><span>Balanced analysis</span><input class="input mono" id="dk-m-default" value="${esc(m.default)}"></label>
          <label class="field"><span>Quick jobs (sorting tasks into projects)</span><input class="input mono" id="dk-m-quick" value="${esc(m.quick)}"></label>
          <label class="field"><span>Largest email + attachments sent at once (KB of text)</span><input class="input" id="dk-maxkb" type="number" min="64" max="3000" step="50" value="${esc(c.maxPromptKB)}"></label>
        </div>
        <p class="small muted">Bigger limits read more of long attachments but cost more per email. Model IDs are listed at docs.anthropic.com › Models.</p>
        <div class="row end"><button class="btn" data-dact="save-models">Save models</button></div>
      </details>
    </div>
    <hr style="border:0;border-top:1px solid var(--line, #ddd);margin:6px 0">
    <div style="display:grid;gap:10px">
      <div class="row"><b>Gmail forwarding inbox</b>${chip(g.connected, 'Connected' + (g.account ? ' · ' + g.account : ''), 'Not connected')}<span class="spacer"></span>
        ${g.connected ? `<button class="btn ghost danger sm" data-dact="gmail-disconnect" ${busy ? 'disabled' : ''}>Disconnect</button>` : ''}</div>
      <p class="small muted" style="margin:0">Optional. Connect the personal Gmail you forward work emails to (for example <span class="mono">yourname+tasks@gmail.com</span>). New forwards are then picked up and analysed automatically. Only messages sent to your forwarding address are read, and imported ones get the label “Action Register/Imported”.</p>
      ${g.connected ? (g.mode === 'imap' ? '<p class="small muted" style="margin:0">Connected with an app password. To stop access, press Disconnect or delete the app password at myaccount.google.com › App passwords.</p>' : '') : `
      <ol class="small steps">
        <li>Turn on <a href="#" data-dact="open" data-url="https://myaccount.google.com/signinoptions/twosv">2-Step Verification</a> for this Gmail, if it is not on already.</li>
        <li>Open <a href="#" data-dact="open" data-url="https://myaccount.google.com/apppasswords">Google › App passwords</a>, type the name <b>Action Register</b> and press <b>Create</b>.</li>
        <li>Copy the 16-letter password Google shows and paste it below with your Gmail address.</li>
      </ol>
      <div class="grid2">
        <label class="field"><span>Gmail address</span><input class="input" id="dk-imap-user" type="email" autocomplete="off" spellcheck="false" placeholder="yourname@gmail.com" value="${esc(UIX.imapUser || g.account)}"></label>
        <label class="field"><span>App password (16 letters)</span><input class="input mono" id="dk-imap-pass" type="password" autocomplete="off" spellcheck="false" placeholder="abcd efgh ijkl mnop"></label>
      </div>
      <div class="row end">${busy === 'imap' ? '<span class="small muted">Checking with Gmail…</span>' : ''}<button class="btn primary" data-dact="gmail-connect-imap" ${busy ? 'disabled' : ''}>${busy === 'imap' ? 'Connecting…' : 'Connect Gmail'}</button></div>
      <details class="howto"><summary>No “App passwords” page? Use a Google Cloud OAuth client instead (advanced)</summary>
        <p class="small muted">Google hides app passwords for work/school accounts and accounts with Advanced Protection. Then connect with your own OAuth client:</p>
        <ol>
          <li>Open <a href="#" data-dact="open" data-url="https://console.cloud.google.com/projectcreate">Google Cloud console</a> signed in with the same Gmail and create a project (e.g. “Action Register”).</li>
          <li>APIs &amp; Services › Library › enable <b>Gmail API</b>.</li>
          <li>Google Auth Platform: Audience <b>External</b>, add your Gmail as a <b>test user</b>, Data Access › add the scope <span class="mono">…/auth/gmail.modify</span>.</li>
          <li>Clients › Create client › <b>Desktop app</b>. Paste the client ID and secret here and press Connect with OAuth.</li>
        </ol>
        <div class="grid2">
          <label class="field"><span>OAuth client ID</span><input class="input mono" id="dk-gid" value="${esc(g.clientId)}" placeholder="…apps.googleusercontent.com" spellcheck="false"></label>
          <label class="field"><span>OAuth client secret</span><input class="input mono" id="dk-gsec" type="password" autocomplete="off" placeholder="${g.hasSecret ? 'Saved' : 'GOCSPX-…'}" spellcheck="false"></label>
        </div>
        <div class="row end">${busy === 'gmail' ? '<span class="small muted">Finish signing in in your browser…</span>' : ''}<button class="btn" data-dact="gmail-connect" ${busy ? 'disabled' : ''}>${busy === 'gmail' ? 'Waiting for Google…' : 'Connect with OAuth'}</button></div>
      </details>`}
    </div>
    <hr style="border:0;border-top:1px solid var(--line, #ddd);margin:6px 0">
    <div class="row"><div style="min-width:0"><b>Data folder</b><div class="small muted mono" style="word-break:break-all">${esc(ST.dataDir)}</div></div><span class="spacer"></span><button class="btn" data-dact="open-data">Open folder</button></div>`;
}
function setupHTML() { return `<section class="card pad" id="dk-conn" style="display:grid;gap:12px">${connInner()}</section>`; }
function repaint() { const n = document.getElementById('dk-conn'); if (n) n.innerHTML = connInner(); }
function say(text, err) { UIX.msg = { text, err }; repaint(); }
// Capabilities are resolved once at start-up (app.js initStore), so a change of key or Gmail account reloads the window.
function reloadSoon(text) {
  say(text + (stagingCount() ? ' Restart the app to use it (emails waiting to be analysed are kept until then).' : ' Reloading…'));
  if (!stagingCount()) setTimeout(() => location.reload(), 900);
}
const val = id => ((document.getElementById(id) || {}).value || '').trim();
const ACT = {
  async 'save-key'() {
    const key = val('dk-key');
    if (!/^sk-ant-[\w-]{20,}$/.test(key)) return say('That does not look like an Anthropic API key (it starts with “sk-ant-”).', true);
    ST = await call('config:claude', { key }); reloadSoon('API key saved.');
  },
  async 'remove-key'() { ST = await call('config:claude', { key: '' }); reloadSoon('API key removed.'); },
  async 'test-key'() {
    UIX.busy = 'test'; repaint();
    try { const r = await call('claude:test'); say(`The key works (answered by ${r.model}).`); }
    catch (e) { say('The key did not work: ' + (e.message || e.code), true); }
    finally { UIX.busy = ''; repaint(); }
  },
  async 'save-models'() {
    const models = { complex: val('dk-m-complex'), default: val('dk-m-default'), quick: val('dk-m-quick') };
    if (Object.values(models).some(v => !/^[\w.\-:@/]+$/.test(v))) return say('Enter a model ID in each box.', true);
    ST = await call('config:claude', { models, maxPromptKB: +val('dk-maxkb') || 600 }); reloadSoon('Models saved.');
  },
  async 'gmail-connect'() {
    const clientId = val('dk-gid'), clientSecret = val('dk-gsec');
    if (!clientId) return say('Enter the OAuth client ID.', true);
    if (!clientSecret && !ST.gmail.hasSecret) return say('Enter the OAuth client secret.', true);
    UIX.busy = 'gmail'; UIX.msg = null; repaint();
    try { ST = await call('gmail:connect', { clientId, clientSecret }); UIX.busy = ''; reloadSoon(`Gmail connected (${ST.gmail.account}).`); }
    catch (e) { UIX.busy = ''; refresh(); say('Gmail was not connected: ' + (e.message || e.code), true); }
  },
  async 'gmail-connect-imap'() {
    const address = val('dk-imap-user'), appPassword = val('dk-imap-pass');
    UIX.imapUser = address; // keep what was typed if Gmail says no
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return say('Enter your Gmail address.', true);
    if (appPassword.replace(/\s+/g, '').length < 16) return say('Paste the 16-letter app password from Google (spaces are fine).', true);
    UIX.busy = 'imap'; UIX.msg = null; repaint();
    try { ST = await call('gmail:connect-imap', { address, appPassword }); UIX.busy = ''; reloadSoon(`Gmail connected (${ST.gmail.account}).`); }
    catch (e) { UIX.busy = ''; refresh(); say('Gmail was not connected: ' + (e.message || e.code), true); }
  },
  async 'gmail-disconnect'() { ST = await call('gmail:disconnect'); reloadSoon('Gmail disconnected.'); },
  async 'open-data'() { await call('shell:openData'); },
  async open(el) { await call('shell:openExternal', el.dataset.url); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-dact]'); if (!el || !ACT[el.dataset.dact]) return;
  e.preventDefault();
  ACT[el.dataset.dact](el).catch(err => say((err && (err.message || err.code)) || 'Something went wrong.', true));
});

window.claude = {
  desktop: { setupHTML, suggestedAddress, dataDir: () => ST.dataDir, status: () => ST },
  use: async name => (caps[name] ? caps[name]() : null),
};
})();
