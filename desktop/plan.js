'use strict';
// Claude through the user's own Pro / Max plan: the app runs Anthropic's Claude Code program (installed and
// signed in by the user through Anthropic's own sign-in page) in print mode, with no tools, and reads its
// answer. The app never sees the password or the sign-in token; usage counts against the plan's limits.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');

const WIN = process.platform === 'win32';
const SYSTEM = 'Reply with one JSON value only, exactly in the format the instructions ask for. No text before or after the JSON.';
const TIMEOUT = 20 * 60 * 1000;

// where Claude Code is usually installed (native installer, WinGet, npm, Homebrew); GUI apps on macOS do
// not get the terminal's PATH, so the usual folders are checked as well as PATH
function candidates() {
  const h = os.homedir(), out = [];
  if (WIN) {
    const la = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local'), ad = process.env.APPDATA || path.join(h, 'AppData', 'Roaming');
    out.push(path.join(h, '.local', 'bin', 'claude.exe'), path.join(la, 'Microsoft', 'WinGet', 'Links', 'claude.exe'), path.join(ad, 'npm', 'claude.cmd'));
  } else out.push(path.join(h, '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude', path.join(h, '.npm-global', 'bin', 'claude'), '/usr/bin/claude');
  for (const d of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) for (const n of WIN ? ['claude.exe', 'claude.cmd'] : ['claude']) out.push(path.join(d, n));
  return out;
}
function find(config) {
  const own = (config.get().ai || {}).claudePath;
  for (const p of [process.env.AR_CLAUDE_BIN, own, ...candidates()]) {
    try { if (p && fs.statSync(p).isFile()) return p; } catch {}
  }
  return '';
}

// Claude Code must use the plan, not an API key that happens to be set on this PC
function env() {
  const e = { ...process.env };
  for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) delete e[k];
  if (process.env.AR_CLAUDE_BASE_URL) e.ANTHROPIC_BASE_URL = process.env.AR_CLAUDE_BASE_URL; // tests only
  return e;
}
// .cmd files (npm installs on Windows) need the shell; the arguments are fixed strings, quoted here
function launch(bin, args, opts) {
  if (WIN && /\.cmd$/i.test(bin)) return spawn(`"${bin}"`, args.map(a => `"${String(a).replace(/"/g, '""')}"`), { ...opts, shell: true, windowsHide: true });
  return spawn(bin, args, { ...opts, windowsHide: true });
}

const notFound = () => ({ code: 'unavailable', message: 'Claude Code is not installed on this PC (or the app cannot find it). Install it from Setup › Which AI › Claude — my plan, then press Check.' });

// latest plan usage seen in Claude Code's rate-limit events: { status, resetsAt, windows: { five_hour: { utilization, resetsAt } … } }
let lastLimits = null;

function run(config, model, req, signal, onDelta, onUsage) {
  const bin = find(config);
  if (!bin) return Promise.reject(notFound());
  const content = [];
  (req.images || []).forEach((im, i) => {
    content.push({ type: 'text', text: `IMG${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.type, data: Buffer.from(im.data).toString('base64') } });
  });
  content.push({ type: 'text', text: req.prompt });
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--include-partial-messages',
    '--model', model, '--tools', '', '--system-prompt', SYSTEM, '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--disable-slash-commands'];
  return new Promise((resolve, reject) => {
    let child;
    try { child = launch(bin, args, { cwd: os.tmpdir(), env: env(), stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { return reject(notFound()); }
    let buf = '', err = '', text = '', result = null, limit = null, source = '', pending = '', last = 0, done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); signal && signal.removeEventListener('abort', onAbort); fn(v); };
    const kill = () => { try { WIN ? execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {}) : child.kill('SIGTERM'); } catch {} };
    const onAbort = () => { kill(); finish(reject, { code: 'cancelled', message: 'Stopped' }); };
    const timer = setTimeout(() => { kill(); finish(reject, { code: 'unavailable', message: 'Claude Code did not answer within 20 minutes.' }); }, TIMEOUT);
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
    const line = l => {
      let d; try { d = JSON.parse(l); } catch { return; }
      if (d.type === 'system' && d.subtype === 'init') source = d.apiKeySource || '';
      else if (d.type === 'stream_event' && d.event && d.event.type === 'content_block_delta' && d.event.delta && d.event.delta.type === 'text_delta') {
        pending += d.event.delta.text; const now = Date.now();
        if (now - last > 250) { onDelta && onDelta(pending); pending = ''; last = now; }
      } else if (d.type === 'assistant' && d.message) text = (d.message.content || []).filter(b => b.type === 'text').map(b => b.text).join('') || text;
      else if (d.type === 'rate_limit_event' && d.rate_limit_info) { const r = d.rate_limit_info; lastLimits = { status: r.status, resetsAt: r.resetsAt, type: r.rateLimitType, windows: r.unifiedWindows || null, at: Date.now() }; if (r.status === 'rejected') limit = lastLimits; }
      else if (d.type === 'result') result = d;
    };
    child.stdout.on('data', c => { buf += c; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) line(l); } });
    child.stderr.on('data', c => { err = (err + c).slice(-4000); });
    child.on('error', e => finish(reject, e && e.code === 'ENOENT' ? notFound() : { code: 'unavailable', message: 'Claude Code could not be started: ' + (e.message || e) }));
    child.on('close', code => {
      if (buf.trim()) line(buf.trim());
      if (pending && onDelta) onDelta(pending);
      if (result && !result.is_error && result.subtype === 'success') {
        const mu = result.modelUsage || {}, used = Object.keys(mu)[0] || model, u = result.usage || {};
        if (onUsage) try { onUsage({ model: used, input: u.input_tokens || 0, output: u.output_tokens || 0, cacheRead: u.cache_read_input_tokens || 0, cacheWrite: u.cache_creation_input_tokens || 0 }); } catch {}
        return finish(resolve, { text: result.result || text, model: used, viaKey: !!source && source !== 'none' });
      }
      finish(reject, mapError(result, limit, err, code));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
  });
}

function when(ts) { if (!ts) return ''; const d = new Date(ts * 1000); return d.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }); }
function mapError(result, limit, stderr, code) {
  const msg = String((result && (result.result || (result.errors || []).join(' '))) || stderr || `Claude Code stopped (exit code ${code}).`).trim().slice(0, 500);
  if (limit || /usage limit|hit your limit|limit reached|rate.?limit|429/i.test(msg)) return { code: 'rate_limited', message: `Your Claude plan's usage limit is reached${limit && limit.resetsAt ? ` until ${when(limit.resetsAt)}` : ''}.`, resetsAt: limit && limit.resetsAt };
  if (/not logged in|log ?in|sign ?in|authenticat|oauth|401|invalid api key|credentials/i.test(msg)) return { code: 'auth_failed', message: 'Claude Code is not signed in to your Claude account. Press Sign in in Setup › Which AI.' };
  if (/credit balance|billing/i.test(msg)) return { code: 'auth_failed', message: 'Claude Code is using an API key instead of your plan. Sign in with your Claude account in Setup › Which AI.' };
  if (/model/i.test(msg) && /not.?found|404|not available|access|invalid|unknown/i.test(msg)) return { code: 'model_not_found', message: 'Your plan cannot use this Claude model in Claude Code: ' + msg };
  if (/too long|too large|context|request_too_large/i.test(msg)) return { code: 'prompt_too_large', message: msg };
  if (/overloaded|529|ENOTFOUND|ECONN|network|fetch failed|timed? ?out/i.test(msg)) return { code: 'unavailable', message: 'Claude could not be reached: ' + msg };
  return { code: 'upstream_error', message: msg };
}

// `claude auth status` answers without using the plan's limits
function authStatus(config) {
  const bin = find(config);
  if (!bin) return Promise.resolve({ installed: false, loggedIn: false });
  return new Promise(res => {
    let out = '';
    const c = launch(bin, ['auth', 'status', '--json'], { cwd: os.tmpdir(), env: env(), stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { try { c.kill(); } catch {} }, 30000);
    c.stdout.on('data', d => { out += d; });
    c.on('error', () => { clearTimeout(t); res({ installed: false, loggedIn: false, path: bin }); });
    c.on('close', () => {
      clearTimeout(t);
      let j = {}; try { j = JSON.parse(out.slice(out.indexOf('{'))); } catch {}
      res({ installed: true, path: bin, loggedIn: !!j.loggedIn, method: j.authMethod || '', plan: !!j.loggedIn && !/api.?key/i.test(j.authMethod || '') });
    });
  });
}

// Sign-in happens in Claude Code's own flow (it opens Anthropic's page in the browser), in a terminal window
function login(config) {
  const bin = find(config);
  if (!bin) throw notFound();
  if (process.env.AR_TEST) { spawn(bin, ['auth', 'login'], { stdio: 'ignore', env: env() }).on('error', () => {}); return true; }
  if (WIN) spawn('cmd.exe', ['/c', 'start', '"Claude sign-in"', 'cmd', '/k', `""${bin}" auth login"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  else if (process.platform === 'darwin') spawn('osascript', ['-e', `tell application "Terminal" to do script "'${bin.replace(/'/g, `'\\''`)}' auth login"`, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
  else spawn('x-terminal-emulator', ['-e', bin, 'auth', 'login'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return true;
}

module.exports = { run, find, authStatus, login, limits: () => lastLimits, mapError };
