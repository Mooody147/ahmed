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
  docx: ['vendor/index.umd.js'],
  exceljs: ['vendor/exceljs.min.js'],
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

/* ---------- sample: the chosen AI via the main process (desktop/ai.js) ---------- */
const listeners = new Map();
// for this session only: use another AI after the main one ran out of credit, or go over the monthly budget once
const AIO = { provider: '', overBudget: false };
// another PC changed a document (cloud sync): update the cache and tell the listeners
B.on('db:remote', m => { if (!m || !m.path || isText(m.path)) return; if (m.data === null) cache.delete(m.path); else cache.set(m.path, m.data); changed(m.path); });
B.on('cloud:status', m => { ST.cloud = m; });
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
    try {
      const r = await call('sample:json', { id, prompt, tier: opts.modelTier || 'complex', images, provider: opts.provider || AIO.provider || undefined, overBudget: !!(opts.overBudget || AIO.overBudget) });
      if (opts.onMeta) try { opts.onMeta(r.meta); } catch {}
      return r.value;
    }
    finally { listeners.delete(id); if (opts.signal) opts.signal.removeEventListener('abort', onAbort); }
  };
  f.limits = async () => {
    // a local model has a smaller window and reads images only when it is a vision model
    const local = ST.ai.primary === 'ollama', m = ST.ai.strongModel || '';
    const kb = local ? Math.min(ST.claude.maxPromptKB || 600, 96) : (ST.claude.maxPromptKB || 600);
    return { maxPromptBytes: kb * 1024, images: { maxCount: local && !/llava|vision|vl\b|-vl|gemma3|minicpm-v|moondream|llama4/i.test(m) ? 0 : 20, maxInputBytes: 3.5e6, mediaTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] } };
  };
  return f;
}

const caps = {
  db,
  user: async () => ({ me: async () => ({ id: ST.user.id, name: ST.user.name, email: ST.gmail.account || null }), id: async () => ST.user.id, isOwner: async () => true, canEdit: async () => true, can: async () => true }),
  sample: async () => (ST.ai.ready ? sample() : null),
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
      <p class="small" style="margin:0"><b>Have Claude Pro or Max?</b> The API key is billed separately from your subscription. To use your plan instead, see Setup › Which AI › <b>Claude — my Pro/Max plan</b>.</p>
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
/* ---------- Setup › Which AI ---------- */
const AI_LINKS = { plan: 'https://code.claude.com/docs/en/setup', usage: 'https://claude.ai/settings/usage', openai: 'https://platform.openai.com/api-keys', gemini: 'https://aistudio.google.com/apikey', ollama: 'https://ollama.com/download' };
const AI_BILL = { claude: 'https://console.anthropic.com/settings/billing', openai: 'https://platform.openai.com/settings/organization/billing/overview', gemini: 'https://aistudio.google.com/apikey' };
const money = v => '$' + (v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString());
function aiOptions(sel, none) {
  const P = ST.ai.providers;
  return (none ? `<option value="" ${!sel ? 'selected' : ''}>None</option>` : '') + Object.entries(P).map(([k, v]) => `<option value="${k}" ${sel === k ? 'selected' : ''}>${esc(v.label)}${v.ready ? '' : ' — not set up'}</option>`).join('');
}
function priceRow(p, model) {
  if (!model) return '';
  const pr = ST.ai.prices[model] || {};
  return `<div class="row small" style="gap:6px"><span class="mono" style="min-width:0;flex:1;word-break:break-all">${esc(model)}</span>$<input class="input ai-price" data-model="${esc(model)}" data-k="in" type="number" min="0" step="0.01" style="width:84px" value="${pr.in ?? ''}" placeholder="input" aria-label="Input price per million tokens">/ $<input class="input ai-price" data-model="${esc(model)}" data-k="out" type="number" min="0" step="0.01" style="width:84px" value="${pr.out ?? ''}" placeholder="output" aria-label="Output price per million tokens"><span class="muted">per million tokens (in / out)</span></div>`;
}
const WIN = /Windows/i.test(navigator.userAgent);
function planLimitsHTML(L) {
  if (!L || !L.windows) return '';
  const name = { five_hour: '5-hour window', seven_day: 'Weekly', seven_day_opus: 'Weekly (Opus)', seven_day_sonnet: 'Weekly (Sonnet)' };
  const rows = Object.entries(L.windows).map(([k, w]) => { const pct = Math.round((w.utilization || 0) * 100); return `<div class="row small" style="gap:8px"><span style="min-width:120px">${esc(name[k] || k)}</span><div class="progress" style="flex:1;min-width:80px"><i style="width:${pct}%;${pct >= 90 ? 'background:var(--crit, #c0392b)' : pct >= 70 ? 'background:var(--warn, #d68910)' : ''}"></i></div><span class="muted">${pct}% used${w.resetsAt ? ' · resets ' + esc(new Date(w.resetsAt * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span></div>`; }).join('');
  return `<div style="display:grid;gap:4px"><span class="small muted">Your plan's usage at the last email (shared with claude.ai and Claude Code):</span>${rows}</div>`;
}
function planBox() {
  const v = ST.ai.providers.plan, busy = UIX.busy, ps = UIX.planSt, m = ST.claude.models || {};
  const cmd = WIN ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash';
  const state = !v.path ? chip(false, '', 'Claude Code not found') : ps ? (ps.plan ? chip(true, 'Signed in with your plan', '') : chip(false, '', ps.loggedIn ? 'Signed in with an API key' : 'Not signed in')) : chip(true, 'Claude Code found', '');
  return `<details class="howto" ${UIX.openP === 'plan' ? 'open' : ''} data-p="plan"><summary><b>${esc(v.label)}</b> ${state}</summary>
    <div style="display:grid;gap:10px;margin-top:10px">
      <p class="small muted" style="margin:0">Uses your Claude Pro or Max subscription instead of API credit. The app runs Anthropic's own <b>Claude Code</b> program on this PC; you sign in to it once through Anthropic's page, and the app never sees your password or sign-in token. Emails then count against your plan's usage limits (the same limits as claude.ai and Claude Code) and cost nothing extra. When the limit is reached, your backup AI takes over, or the app tells you when it resets.</p>
      ${v.path ? `<div class="small"><span class="muted">Claude Code:</span> <span class="mono" style="word-break:break-all">${esc(v.path)}</span></div>` : `<div style="display:grid;gap:6px"><span class="small"><b>1.</b> Install Claude Code: open ${WIN ? '<b>PowerShell</b> (Start menu › type PowerShell)' : '<b>Terminal</b>'}, paste this line and press Enter:</span>
        <div class="row"><input class="input mono" readonly value="${esc(cmd)}" style="flex:1;min-width:220px" onclick="this.select()"><button class="btn sm" data-dact="ai-plan-copy" data-v="${esc(cmd)}">Copy</button></div>
        <span class="small muted">Then press <b>Check</b> below. More ways to install: <a href="#" data-dact="open" data-url="${AI_LINKS.plan}">code.claude.com › Setup</a>.</span></div>`}
      <div class="row">${v.path ? `<button class="btn primary sm" data-dact="ai-plan-login" ${busy ? 'disabled' : ''}>Sign in</button>` : ''}<button class="btn sm" data-dact="ai-plan-check" ${busy ? 'disabled' : ''}>${busy === 'plan-check' ? 'Checking…' : 'Check'}</button>${v.path ? `<button class="btn sm" data-dact="ai-test" data-p="plan" ${busy ? 'disabled' : ''}>${busy === 'test-plan' ? 'Testing…' : 'Test with a short question'}</button>` : ''}<a href="#" class="small" data-dact="open" data-url="${AI_LINKS.usage}">See your plan usage on claude.ai</a></div>
      ${v.path ? `<p class="small muted" style="margin:0"><b>Sign in</b> opens a window where Claude Code asks you to log in in the browser; choose your Claude account (Pro or Max), not the Console. When it says you are logged in, close that window and press <b>Check</b>.</p>` : ''}
      <p class="small muted" style="margin:0">Models: <span class="mono">${esc(m.complex || '')}</span> for emails with attachments, <span class="mono">${esc(m.quick || '')}</span> for short jobs (change them in Setup › Connections › Models). If your plan cannot use a model in Claude Code, pick another there.</p>
      ${planLimitsHTML(v.limits)}
      <details class="small"><summary class="muted">Claude Code is installed somewhere else</summary><div class="row" style="margin-top:6px"><input class="input mono" id="ai-plan-path" value="${esc(v.customPath || '')}" placeholder="${WIN ? 'C:\\Users\\you\\.local\\bin\\claude.exe' : '/usr/local/bin/claude'}" style="flex:1;min-width:220px" spellcheck="false"><button class="btn sm" data-dact="ai-plan-path">Save</button></div></details>
    </div></details>`;
}
function providerBox(p) {
  if (p === 'plan') return planBox();
  const v = ST.ai.providers[p], sg = (UIX.sugg || {})[p] || {}, m0 = ST.ai.models[p] || {}, m = { strong: m0.strong || sg.strong || '', fast: m0.fast || sg.fast || '' }, list = (UIX.models || {})[p] || [], busy = UIX.busy;
  const keyRow = p === 'ollama'
    ? `<label class="field"><span>Ollama address on this PC</span><input class="input mono" id="ai-ollama-url" value="${esc(ST.ai.ollamaUrl)}" spellcheck="false"></label>`
    : `<div class="row"><input class="input" id="ai-key-${p}" type="password" autocomplete="off" spellcheck="false" style="flex:1;min-width:220px" placeholder="${v.hasKey ? 'Saved — paste a new key to replace it' : p === 'openai' ? 'sk-…' : 'AIza…'}">
        <button class="btn primary" data-dact="ai-key" data-p="${p}" ${busy ? 'disabled' : ''}>Save key</button>${v.hasKey ? `<button class="btn ghost danger" data-dact="ai-key-remove" data-p="${p}" ${busy ? 'disabled' : ''}>Remove</button>` : ''}</div>`;
  const help = { openai: `Create a key at <a href="#" data-dact="open" data-url="${AI_LINKS.openai}">platform.openai.com › API keys</a> (ChatGPT Plus does not include API use; the API is billed separately).`, gemini: `Create a key at <a href="#" data-dact="open" data-url="${AI_LINKS.gemini}">Google AI Studio › API keys</a>. Google has a free tier with daily limits; on the free tier Google may use what you send to improve its products.`, ollama: `Free and private: the model runs on this PC and nothing leaves it. Install <a href="#" data-dact="open" data-url="${AI_LINKS.ollama}">Ollama</a>, then download a model in a terminal, for example <span class="mono">ollama pull qwen3</span>. Local models are slower and less careful than Claude with long attachments, so they suit short, simple emails.` }[p];
  const dl = list.length ? `<datalist id="ai-list-${p}">${list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>` : '';
  return `<details class="howto" ${UIX.openP === p ? 'open' : ''} data-p="${p}"><summary><b>${esc(v.label)}</b> ${chip(v.ready, 'Ready', v.hasKey ? 'Choose models' : 'Not set up')}</summary>
    <div style="display:grid;gap:10px;margin-top:10px">
      <p class="small muted" style="margin:0">${help}</p>
      ${keyRow}
      <div class="row"><button class="btn sm" data-dact="ai-models" data-p="${p}" ${busy || (p !== 'ollama' && !v.hasKey) ? 'disabled' : ''}>${busy === 'models-' + p ? 'Loading…' : 'Load the model list'}</button>${list.length ? `<span class="small muted">${list.length} models found — suggestions filled in.</span>` : ''}${v.ready ? `<button class="btn sm" data-dact="ai-test" data-p="${p}" ${busy ? 'disabled' : ''}>${busy === 'test-' + p ? 'Testing…' : 'Test'}</button>` : ''}</div>
      <div class="grid2">
        <label class="field"><span>Strong model (emails with attachments)</span><input class="input mono" id="ai-m-${p}-strong" list="ai-list-${p}" value="${esc(m.strong)}" spellcheck="false"></label>
        <label class="field"><span>Fast model (short jobs, simple emails)</span><input class="input mono" id="ai-m-${p}-fast" list="ai-list-${p}" value="${esc(m.fast)}" spellcheck="false"></label>
      </div>${dl}
      ${p === 'ollama' ? '' : `<div style="display:grid;gap:6px"><span class="small muted">Prices for the cost estimate and the budget (from the provider's pricing page; leave empty if unsure):</span>${priceRow(p, m.strong)}${m.fast !== m.strong ? priceRow(p, m.fast) : ''}</div>`}
      <div class="row end"><button class="btn" data-dact="ai-save-models" data-p="${p}">Save</button></div>
    </div></details>`;
}
function aiInner() {
  const a = ST.ai; if (!a) return '';
  const pct = a.budget > 0 ? Math.min(100, Math.round(a.monthCost / a.budget * 100)) : 0;
  const msg = UIX.aiMsg ? callout(UIX.aiMsg.err ? 'crit' : 'ok', esc(UIX.aiMsg.text)) : '';
  return `<div class="section-title"><h2>Which AI reads your emails</h2></div>
    ${msg}
    <p class="small muted" style="margin:0">Claude is the default and the most careful with long attachments and drawings. It can run on API credit (Setup › Connections) or on <b>your Claude Pro/Max plan</b> (below). You can add ChatGPT, Gemini or a free local model as a backup, for when Claude is out of credit or cannot be reached. Each email shows which AI read it.</p>
    <div class="grid2">
      <label class="field"><span>Main AI</span><select class="input" id="ai-primary">${aiOptions(a.primary)}</select></label>
      <label class="field"><span>Backup AI</span><select class="input" id="ai-backup">${aiOptions(a.backup, true)}</select></label>
    </div>
    <label class="check small"><input type="checkbox" id="ai-auto" ${a.autoBackup ? 'checked' : ''}>Switch to the backup by itself when the main AI is out of credit, rejects the key or cannot be reached (otherwise the app asks you first)</label>
    <label class="check small"><input type="checkbox" id="ai-simple" ${a.suggestSimple ? 'checked' : ''}>Suggest the fast, cheaper model for simple emails (short, no attachments)</label>
    <div class="grid2">
      <label class="field"><span>Monthly budget in US$ (0 = no limit)</span><input class="input" id="ai-budget" type="number" min="0" step="1" value="${a.budget || 0}"></label>
      <div class="field"><span>Spent this month (estimate)</span><div style="display:grid;gap:4px;padding-top:6px"><b>${money(a.monthCost)}${a.costUnknown ? ' + models without a price' : ''}${a.budget ? ` of ${money(a.budget)} (${pct}%)` : ''}</b>${a.budget ? `<div class="progress"><i style="width:${pct}%;${pct >= 100 ? 'background:var(--crit, #c0392b)' : pct >= 80 ? 'background:var(--warn, #d68910)' : ''}"></i></div>` : ''}</div></div>
    </div>
    <p class="small muted" style="margin:0">At 80% of the budget the app warns you; at 100% it stops and asks before spending more (a local model is free and is never stopped).</p>
    <div class="row end"><button class="btn primary" data-dact="ai-save">Save AI choice</button></div>
    ${['plan', 'openai', 'gemini', 'ollama'].map(providerBox).join('')}`;
}
function setupHTML() { return `<section class="card pad" id="dk-conn" data-sec="Connections" style="display:grid;gap:12px">${connInner()}</section><section class="card pad" id="dk-ai" data-sec="Which AI" style="display:grid;gap:12px">${aiInner()}</section>`; }
function repaint() { const n = document.getElementById('dk-conn'); if (n) n.innerHTML = connInner(); const a = document.getElementById('dk-ai'); if (a) { UIX.openP = (a.querySelector('details.howto[open]') || {}).dataset?.p || UIX.openP; a.innerHTML = aiInner(); } }
// the window reloads when AI becomes available or unavailable (capabilities are resolved at start-up)
const READY0 = !!(ST.ai && ST.ai.ready);
function aiSay(text, err) { if (!err && !!ST.ai.ready !== READY0) { UIX.aiMsg = null; return reloadSoon(text); } UIX.aiMsg = { text, err }; repaint(); }
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
  async 'ai-save'() {
    const prim = ST.ai.primary;
    const patch = { primary: val('ai-primary'), backup: val('ai-backup'), autoBackup: document.getElementById('ai-auto').checked, suggestSimple: document.getElementById('ai-simple').checked, budget: +val('ai-budget') || 0 };
    if (patch.backup === patch.primary) patch.backup = '';
    ST = await call('ai:config', patch);
    if (!ST.ai.providers[ST.ai.primary].ready) aiSay(`${ST.ai.providers[ST.ai.primary].label} is the main AI but is not set up yet — add its key and models below.`, true);
    else if (prim !== ST.ai.primary) { UIX.aiMsg = null; reloadSoon('AI choice saved.'); }
    else aiSay('Saved.');
  },
  async 'ai-key'(el) {
    const p = el.dataset.p, key = val('ai-key-' + p);
    if (key.length < 20 || /\s/.test(key)) return aiSay('Paste the whole API key.', true);
    UIX.busy = 'models-' + p; UIX.openP = p; repaint();
    try {
      const r = await call('ai:models', { provider: p, key });   // checks the key before it is saved
      ST = await call('ai:key', { provider: p, key });
      UIX.models = { ...(UIX.models || {}), [p]: r.models };
      const m = ST.ai.models[p];
      if (!m.strong && !m.fast && (r.suggest.strong || r.suggest.fast)) ST = await call('ai:config', { models: { [p]: { strong: r.suggest.strong, fast: r.suggest.fast } } });
      UIX.busy = ''; aiSay(`Key saved. ${r.models.length} models found; suggested: ${r.suggest.strong || '—'} (strong) and ${r.suggest.fast || '—'} (fast). Add their prices for the budget, then Save.`);
    } catch (e) { UIX.busy = ''; aiSay('The key did not work: ' + (e.message || e.code), true); }
  },
  async 'ai-key-remove'(el) { ST = await call('ai:key', { provider: el.dataset.p, key: '' }); aiSay('Key removed.'); },
  async 'ai-models'(el) {
    const p = el.dataset.p; UIX.busy = 'models-' + p; UIX.openP = p;
    if (p === 'ollama' && val('ai-ollama-url')) ST = await call('ai:config', { ollamaUrl: val('ai-ollama-url') });
    repaint();
    try {
      const r = await call('ai:models', { provider: p });
      UIX.models = { ...(UIX.models || {}), [p]: r.models }; UIX.sugg = { ...(UIX.sugg || {}), [p]: r.suggest }; UIX.busy = '';
      aiSay(r.models.length ? `${r.models.length} models found. Check the two boxes, then Save.` : (p === 'ollama' ? 'Ollama is running but has no models yet. Run “ollama pull qwen3” in a terminal.' : 'No models found for this key.'), !r.models.length);
    } catch (e) { UIX.busy = ''; aiSay('Could not load the models: ' + (e.message || e.code), true); }
  },
  async 'ai-save-models'(el) {
    const p = el.dataset.p; UIX.openP = p;
    const patch = { models: { [p]: { strong: val(`ai-m-${p}-strong`), fast: val(`ai-m-${p}-fast`) } }, prices: {} };
    if (p === 'ollama' && val('ai-ollama-url')) patch.ollamaUrl = val('ai-ollama-url');
    document.querySelectorAll(`#dk-ai details[data-p="${p}"] .ai-price`).forEach(i => { const m = i.dataset.model; patch.prices[m] = patch.prices[m] || {}; patch.prices[m][i.dataset.k] = i.value === '' ? null : +i.value; });
    for (const [m, v] of Object.entries(patch.prices)) patch.prices[m] = v.in == null && v.out == null ? null : { in: v.in || 0, out: v.out || 0 };
    ST = await call('ai:config', patch);
    aiSay('Saved.');
  },
  async 'ai-test'(el) {
    const p = el.dataset.p; UIX.busy = 'test-' + p; UIX.openP = p; repaint();
    try { const r = await call('ai:test', { provider: p }); ST = await call('ai:config', {}); if (p === 'plan') UIX.planSt = { installed: true, loggedIn: true, plan: true }; UIX.busy = ''; aiSay(`${ST.ai.providers[p].label} works (answered by ${r.model}).`); }
    catch (e) { UIX.busy = ''; aiSay('It did not work: ' + (e.message || e.code), true); }
  },
  async 'ai-plan-check'() {
    UIX.busy = 'plan-check'; UIX.openP = 'plan'; repaint();
    try {
      UIX.planSt = await call('ai:plan-status'); ST = await call('ai:config', {}); UIX.busy = '';
      const s = UIX.planSt;
      aiSay(!s.installed ? 'Claude Code was not found. Install it (step 1), then press Check again — or set its location below.' : !s.loggedIn ? 'Claude Code is installed. Now press Sign in.' : !s.plan ? 'Claude Code is signed in with an API key. Press Sign in and choose your Claude account to use your plan.' : `Claude Code is signed in with your plan.${ST.ai.primary === 'plan' ? '' : ' Choose “' + ST.ai.providers.plan.label + '” as the Main AI above and press Save AI choice.'}`, !s.plan);
    } catch (e) { UIX.busy = ''; aiSay('Could not check Claude Code: ' + (e.message || e.code), true); }
  },
  async 'ai-plan-login'() {
    UIX.openP = 'plan';
    try { await call('ai:plan-login'); aiSay('A sign-in window opened. Log in with your Claude account in the browser, close the window when it says you are logged in, then press Check.'); }
    catch (e) { aiSay('Could not start the sign-in: ' + (e.message || e.code), true); }
  },
  async 'ai-plan-path'() { UIX.openP = 'plan'; ST = await call('ai:config', { claudePath: val('ai-plan-path') }); aiSay(ST.ai.providers.plan.path ? 'Saved — Claude Code found.' : 'Claude Code was not found at that location.', !ST.ai.providers.plan.path); },
  async 'ai-plan-copy'(el) { try { await navigator.clipboard.writeText(el.dataset.v); aiSay('Copied. Paste it in ' + (WIN ? 'PowerShell' : 'Terminal') + ' and press Enter.'); } catch { aiSay('Select the line and copy it with Ctrl+C.', true); } },
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
  desktop: {
    setupHTML, suggestedAddress, dataDir: () => ST.dataDir, status: () => ST, refresh,
    aiOverride: patch => (patch ? Object.assign(AIO, patch) : { ...AIO }), billingUrl: p => AI_BILL[p] || '',
    // generic access for the desktop features in app.js (features/*): call(channel, arg) and on(event, cb)
    call, on: (event, cb) => B.on(event, cb),
  },
  use: async name => (caps[name] ? caps[name]() : null),
};
})();
