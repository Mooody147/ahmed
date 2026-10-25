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
  // tests point at a stand-in (or at nothing) and must never reach a real Claude Code on the machine
  const list = process.env.AR_CLAUDE_BIN ? [process.env.AR_CLAUDE_BIN] : [own, ...candidates()];
  for (const p of list) {
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

const notFound = () => ({ code: 'auth_failed', message: 'Your Claude account is not connected on this PC. Press Connect my Claude account in Setup.' });

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
  if (/not logged in|log ?in|sign ?in|authenticat|oauth|401|invalid api key|credentials/i.test(msg)) return { code: 'auth_failed', message: 'Your Claude account is signed out on this PC. Press Connect my Claude account in Setup.' };
  if (/credit balance|billing/i.test(msg)) return { code: 'auth_failed', message: 'Claude is signed in with an API account instead of your plan. Press Connect my Claude account in Setup.' };
  if (/model/i.test(msg) && /not.?found|404|not available|access|invalid|unknown/i.test(msg)) return { code: 'model_not_found', message: 'Your plan cannot use this Claude model: ' + msg };
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
  if (process.env.AR_TEST) { spawn(bin, ['auth', 'login', '--claudeai'], { stdio: 'ignore', env: env() }).on('error', () => {}); return true; }
  // the window closes by itself once the sign-in is finished
  if (WIN) spawn('cmd.exe', ['/c', 'start', '"Claude sign-in"', 'cmd', '/c', `""${bin}" auth login --claudeai"`], { detached: true, stdio: 'ignore', windowsVerbatimArguments: true }).unref();
  else if (process.platform === 'darwin') spawn('osascript', ['-e', `tell application "Terminal" to do script "'${bin.replace(/'/g, `'\\''`)}' auth login --claudeai; exit"`, '-e', 'tell application "Terminal" to activate'], { detached: true, stdio: 'ignore' }).unref();
  else spawn('x-terminal-emulator', ['-e', bin, 'auth', 'login', '--claudeai'], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  return true;
}

// Anthropic's own installer (the same command as on code.claude.com › Setup), run hidden; it installs for this
// user only (no administrator rights) into ~/.local/bin
function install() {
  return new Promise((resolve, reject) => {
    let cmd, args;
    if (process.env.AR_TEST) {
      if (!process.env.AR_TEST_CLAUDE_SRC || !process.env.AR_CLAUDE_BIN) return reject({ message: 'no installer in tests' });
      fs.symlinkSync(process.env.AR_TEST_CLAUDE_SRC, process.env.AR_CLAUDE_BIN);
      return setTimeout(resolve, 1500);
    }
    if (WIN) { cmd = 'powershell.exe'; args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://claude.ai/install.ps1 | iex']; }
    else { cmd = '/bin/bash'; args = ['-c', 'curl -fsSL https://claude.ai/install.sh | bash']; }
    let out = '';
    const c = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const t = setTimeout(() => { try { c.kill(); } catch {} }, 10 * 60 * 1000);
    c.stdout.on('data', d => { out = (out + d).slice(-2000); }); c.stderr.on('data', d => { out = (out + d).slice(-2000); });
    c.on('error', e => { clearTimeout(t); reject({ message: String(e.message || e) }); });
    c.on('close', code => { clearTimeout(t); code === 0 ? resolve() : reject({ message: out.trim().split('\n').slice(-3).join(' ') || 'exit code ' + code }); });
  });
}

// One button: install Claude Code if needed, open the sign-in, wait until the account is signed in, then
// make it the AI that reads emails. The window asks for `job` every few seconds to show progress.
let job = { stage: 'idle' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
function connect(config, onDone, force) {
  if (['install', 'login', 'start'].includes(job.stage)) return job;
  job = { stage: 'start', at: Date.now() };
  (async () => {
    if (!find(config)) {
      job = { stage: 'install', at: Date.now() };
      try { await install(); } catch (e) { throw { message: 'Claude could not be installed automatically (' + (e.message || 'no details') + '). Check the internet connection and press Connect again.' }; }
      if (!find(config)) throw { message: 'Claude was installed but the app cannot find it yet. Restart the app and press Connect again.' };
    }
    let a = force ? {} : await authStatus(config);
    if (!a.plan) {
      job = { stage: 'login', at: Date.now() };
      login(config);
      const t0 = Date.now();
      while (Date.now() - t0 < 10 * 60 * 1000) { await sleep(2000); a = await authStatus(config); if (a.plan) break; }
      if (!a.plan) throw { message: a.loggedIn ? 'Claude is signed in with a Console (API) account, not your Claude plan. Press Connect again and choose your Claude account.' : 'The sign-in was not finished. Press Connect again.' };
    }
    job = { stage: 'done', at: Date.now() };
    onDone && onDone();
  })().catch(e => { job = { stage: 'error', message: (e && e.message) || String(e), at: Date.now() }; });
  return job;
}

module.exports = { run, find, authStatus, login, connect, job: () => job, limits: () => lastLimits, mapError };
