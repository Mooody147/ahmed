'use strict';
// Which AI reads the emails. Claude (desktop/claude.js) is the default; ChatGPT (OpenAI), Gemini (Google)
// and a local model through Ollama (free, runs on this PC) can be the main AI or the backup. Every call
// answers { value, meta: { provider, model, fallback } } so the app can say which AI read an email.
const { net } = require('electron');
const claude = require('./claude');
const plan = require('./plan');

const PROVIDERS = {
  claude: { label: 'Claude (Anthropic)', secret: 'anthropicKey' },
  plan: { label: 'Claude — my account (Pro/Max plan)', secret: null },
  openai: { label: 'ChatGPT (OpenAI)', secret: 'openaiKey' },
  gemini: { label: 'Gemini (Google)', secret: 'geminiKey' },
  ollama: { label: 'Local model (Ollama)', secret: null },
};
// $ per million tokens. Claude's are the published list prices; the others start empty and are typed in
// Setup (they change often), local models are free.
const CLAUDE_PRICES = { 'claude-opus-5-5': { in: 4, out: 20, cr: 0.2 }, 'claude-sonnet-5-5': { in: 2, out: 10, cr: 0.2 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5, cr: 0.01 }, 'claude-fable-5-1': { in: 10, out: 50, cr: 0.25 } };
const DEFAULT_AI = { primary: 'claude', backup: '', autoBackup: false, budget: 0, suggestSimple: true, ollamaUrl: 'http://localhost:11434', models: { openai: { strong: '', fast: '' }, gemini: { strong: '', fast: '' }, ollama: { strong: '', fast: '' } }, prices: {} };
// errors after which the backup AI is worth trying
const SWITCH_ON = new Set(['billing', 'auth_failed', 'rate_limited', 'unavailable', 'sampling_disabled', 'model_not_found', 'upstream_error']);

const running = new Map();
const base = {
  openai: () => process.env.AR_OPENAI_BASE_URL || 'https://api.openai.com',
  gemini: () => process.env.AR_GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com',
};

function settings(config) {
  const a = config.get().ai || {};
  const models = {};
  for (const p of ['openai', 'gemini', 'ollama']) models[p] = { ...DEFAULT_AI.models[p], ...((a.models || {})[p] || {}) };
  // nothing chosen yet: your Claude account (Pro/Max plan) unless an API key was saved before
  const primary = a.primary || (config.secret('anthropicKey') ? 'claude' : 'plan');
  return { ...DEFAULT_AI, ...a, primary, models, prices: { ...(a.prices || {}) } };
}
function ready(config, p) {
  if (p === 'claude') return !!config.secret('anthropicKey');
  if (p === 'plan') return !!plan.find(config);
  if (p === 'ollama') { const m = settings(config).models.ollama; return !!(m.strong || m.fast); }
  if (!PROVIDERS[p]) return false;
  const m = settings(config).models[p];
  return !!config.secret(PROVIDERS[p].secret) && !!(m.strong || m.fast);
}
function modelFor(config, p, tier) {
  if (p === 'claude' || p === 'plan') { const m = config.models(); return m[tier] || m.complex; }
  const m = settings(config).models[p];
  return tier === 'quick' ? (m.fast || m.strong) : (m.strong || m.fast);
}
function price(config, model) {
  if (!model) return null;
  const s = settings(config);
  if (s.prices[model]) return s.prices[model];
  const k = Object.keys(CLAUDE_PRICES).find(x => String(model).startsWith(x));
  return k ? CLAUDE_PRICES[k] : null;
}
// usage rows are keyed by model; local models are stored as "ollama:<model>" and calls on the Claude plan as
// "plan:<model>", so they count as free (the plan is paid for by its subscription, not per token)
function cost(config, model, u) {
  if (/^(ollama|plan):/.test(model)) return 0;
  const p = price(config, model); if (!p) return null;
  return ((u.input || 0) * p.in + (u.output || 0) * p.out + (u.cacheRead || 0) * (p.cr ?? p.in / 10) + (u.cacheWrite || 0) * p.in * 1.25) / 1e6;
}
function monthCost(config) {
  const month = new Date().toISOString().slice(0, 7);
  const m = (config.get().usage || {})[month] || {};
  let total = 0, unknown = false;
  for (const [model, u] of Object.entries(m)) { const c = cost(config, model, u); if (c === null) unknown = true; else total += c; }
  return { month, total, unknown };
}

/* ---------- run ---------- */
async function run(config, req, onDelta, onUsage) {
  const s = settings(config);
  const first = PROVIDERS[req.provider] ? req.provider : s.primary;
  if (s.budget > 0 && !req.overBudget && first !== 'ollama' && first !== 'plan') {
    const mc = monthCost(config);
    if (mc.total >= s.budget) throw { code: 'budget', message: `This month's AI spend (about $${mc.total.toFixed(2)}) has reached your budget of $${s.budget}.` };
  }
  try { return await runOn(config, first, req, onDelta, onUsage); }
  catch (e) {
    const backup = s.backup && s.backup !== first ? s.backup : '';
    if (!req.provider && s.autoBackup && backup && ready(config, backup) && e && SWITCH_ON.has(e.code)) {
      const r = await runOn(config, backup, req, onDelta, onUsage);
      r.meta.fallback = { from: first, code: e.code, message: e.message };
      return r;
    }
    if (e && typeof e === 'object') { e.provider = first; e.backup = backup && ready(config, backup) ? backup : ''; }
    throw e;
  }
}
async function runOn(config, p, req, onDelta, onUsage) {
  if (!ready(config, p)) throw { code: 'sampling_disabled', message: `${PROVIDERS[p] ? PROVIDERS[p].label : p} is not set up. Add it in Setup › Connections.` };
  let model = modelFor(config, p, req.tier);
  if (p === 'claude') {
    const value = await claude.run(config, req, onDelta, u => { model = u.model || model; onUsage && onUsage(u); });
    return { value, meta: { provider: p, model } };
  }
  const ac = new AbortController(); running.set(req.id, ac);
  if (p === 'plan') {
    try {
      const r = await plan.run(config, model, req, ac.signal, onDelta, u => onUsage && onUsage({ ...u, model: 'plan:' + u.model }));
      if (!String(r.text).trim()) throw { code: 'empty_completion', message: 'Empty answer' };
      const value = claude.parseJsonLoose(r.text);
      if (value === undefined) throw { code: 'invalid_json', message: 'The answer was not JSON.' };
      return { value, meta: { provider: p, model: r.model, viaKey: r.viaKey || undefined } };
    } finally { running.delete(req.id); }
  }
  try {
    const text = await (p === 'openai' ? openaiRun : p === 'gemini' ? geminiRun : ollamaRun)(config, model, req, ac.signal, onDelta, u => onUsage && onUsage({ ...u, model: p === 'ollama' ? 'ollama:' + model : model }));
    if (!text.trim()) throw { code: 'empty_completion', message: 'Empty answer' };
    const value = claude.parseJsonLoose(text);
    if (value === undefined) throw { code: 'invalid_json', message: 'The answer was not JSON.' };
    return { value, meta: { provider: p, model } };
  } catch (e) {
    if (ac.signal.aborted) throw { code: 'cancelled', message: 'Stopped' };
    if (e && e.code && !(e instanceof Error)) throw e;
    const msg = String((e && e.message) || e);
    throw p === 'ollama' && /ECONNREFUSED|fetch failed|ERR_CONNECTION/i.test(msg) ? { code: 'unavailable', message: 'Ollama is not running on this PC (start the Ollama app).' } : { code: 'upstream_error', message: msg };
  } finally { running.delete(req.id); }
}
function abort(id) { const ac = running.get(id); if (ac) { ac.abort(); return true; } return claude.abort(id); }

const b64 = d => Buffer.from(d).toString('base64');
const SYSTEM = 'Reply with one JSON value only, exactly in the format the instructions ask for. No text before or after the JSON.';

async function httpError(res, p) {
  let body = ''; try { body = await res.text(); } catch {}
  let msg = body; try { const j = JSON.parse(body); msg = (j.error && (j.error.message || j.error)) || j.message || body; } catch {}
  msg = String(msg).slice(0, 400) || ('HTTP ' + res.status);
  const s = res.status;
  if (p === 'openai') {
    if (s === 401) return { code: 'auth_failed', message: msg };
    if (s === 429 && /quota|billing|insufficient/i.test(body)) return { code: 'billing', message: msg };
    if (s === 429) return { code: 'rate_limited', message: msg };
    if (s === 404) return { code: 'model_not_found', message: msg };
    if (s === 400 && /context_length|maximum context|too long|too large/i.test(body)) return { code: 'prompt_too_large', message: msg };
  }
  if (p === 'gemini') {
    if (/API_KEY_INVALID|API key not valid/i.test(body) || s === 401 || s === 403) return { code: 'auth_failed', message: msg };
    if (s === 429 && /billing|quota/i.test(body) && !/per minute|PerMinute/i.test(body)) return { code: 'billing', message: msg };
    if (s === 429) return { code: 'rate_limited', message: msg };
    if (s === 404) return { code: 'model_not_found', message: msg };
    if (s === 400 && /token|too long|exceeds/i.test(body)) return { code: 'prompt_too_large', message: msg };
  }
  if (p === 'ollama' && s === 404) return { code: 'model_not_found', message: msg + ' — download it with “ollama pull <model>”.' };
  if (s >= 500) return { code: 'unavailable', message: msg };
  return { code: 'upstream_error', message: msg };
}
// server-sent events (OpenAI, Gemini) and newline-delimited JSON (Ollama)
async function readLines(res, onLine) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).replace(/\r$/, ''); buf = buf.slice(i + 1); if (line) onLine(line); }
    if (done) { if (buf.trim()) onLine(buf.trim()); return; }
  }
}
function throttle(onDelta) {
  let pending = '', last = 0;
  return { push(d) { pending += d; const now = Date.now(); if (now - last > 250) { onDelta(pending); pending = ''; last = now; } }, flush() { if (pending) onDelta(pending); pending = ''; } };
}

async function openaiRun(config, model, req, signal, onDelta, onUsage) {
  const content = [{ type: 'text', text: req.prompt }];
  (req.images || []).forEach((im, i) => { content.push({ type: 'text', text: `IMG${i + 1}:` }); content.push({ type: 'image_url', image_url: { url: `data:${im.type};base64,${b64(im.data)}` } }); });
  const res = await net.fetch(base.openai() + '/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.secret('openaiKey') },
    body: JSON.stringify({ model, stream: true, stream_options: { include_usage: true }, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }] }),
  });
  if (!res.ok) throw await httpError(res, 'openai');
  let text = '', usage = null, finish = '';
  const t = throttle(onDelta);
  await readLines(res, line => {
    if (!line.startsWith('data:')) return; const d = line.slice(5).trim(); if (d === '[DONE]') return;
    let j; try { j = JSON.parse(d); } catch { return; }
    if (j.error) throw { code: 'upstream_error', message: j.error.message || 'OpenAI error' };
    const c = j.choices && j.choices[0];
    if (c && c.delta && c.delta.content) { text += c.delta.content; t.push(c.delta.content); }
    if (c && c.finish_reason) finish = c.finish_reason;
    if (j.usage) usage = j.usage;
  });
  t.flush();
  if (finish === 'content_filter') throw { code: 'refused', message: 'ChatGPT declined this request.' };
  if (usage) { const cached = (usage.prompt_tokens_details && usage.prompt_tokens_details.cached_tokens) || 0; onUsage({ input: (usage.prompt_tokens || 0) - cached, output: usage.completion_tokens || 0, cacheRead: cached, cacheWrite: 0 }); }
  return text;
}

async function geminiRun(config, model, req, signal, onDelta, onUsage) {
  const parts = [{ text: SYSTEM + '\n\n' + req.prompt }];
  (req.images || []).forEach((im, i) => { parts.push({ text: `IMG${i + 1}:` }); parts.push({ inline_data: { mime_type: im.type, data: b64(im.data) } }); });
  const res = await net.fetch(`${base.gemini()}/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.secret('geminiKey') },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!res.ok) throw await httpError(res, 'gemini');
  let text = '', usage = null, finish = '';
  const t = throttle(onDelta);
  await readLines(res, line => {
    if (!line.startsWith('data:')) return;
    let j; try { j = JSON.parse(line.slice(5).trim()); } catch { return; }
    const c = j.candidates && j.candidates[0];
    const piece = c && c.content && (c.content.parts || []).map(x => x.text || '').join('');
    if (piece) { text += piece; t.push(piece); }
    if (c && c.finishReason) finish = c.finishReason;
    if (j.promptFeedback && j.promptFeedback.blockReason) finish = 'SAFETY';
    if (j.usageMetadata) usage = j.usageMetadata;
  });
  t.flush();
  if (/SAFETY|PROHIBITED|BLOCKLIST/.test(finish) && !text) throw { code: 'refused', message: 'Gemini declined this request.' };
  if (usage) { const cached = usage.cachedContentTokenCount || 0; onUsage({ input: (usage.promptTokenCount || 0) - cached, output: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0), cacheRead: cached, cacheWrite: 0 }); }
  return text;
}

async function ollamaRun(config, model, req, signal, onDelta, onUsage) {
  const msg = { role: 'user', content: req.prompt };
  if ((req.images || []).length) msg.images = req.images.map(im => b64(im.data));
  const res = await net.fetch(settings(config).ollamaUrl.replace(/\/+$/, '') + '/api/chat', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true, format: 'json', messages: [{ role: 'system', content: SYSTEM }, msg], options: { num_ctx: 32768 } }),
  });
  if (!res.ok) throw await httpError(res, 'ollama');
  let text = '', usage = null;
  const t = throttle(onDelta);
  await readLines(res, line => {
    let j; try { j = JSON.parse(line); } catch { return; }
    if (j.error) throw { code: /not found/i.test(j.error) ? 'model_not_found' : 'upstream_error', message: j.error };
    const piece = j.message && j.message.content;
    if (piece) { text += piece; t.push(piece); }
    if (j.done) usage = j;
  });
  t.flush();
  if (usage) onUsage({ input: usage.prompt_eval_count || 0, output: usage.eval_count || 0, cacheRead: 0, cacheWrite: 0 });
  return text;
}

/* ---------- model lists and tests ---------- */
// Lists come live from each service, so new models appear without an app update. The suggestion picks a
// strong model for emails with attachments and a fast, cheap one for sorting and short jobs.
async function listModels(config, p, keyOverride) {
  let res, ids = [];
  if (p === 'openai') {
    res = await net.fetch(base.openai() + '/v1/models', { headers: { Authorization: 'Bearer ' + (keyOverride || config.secret('openaiKey')) } });
    if (!res.ok) throw await httpError(res, p);
    ids = ((await res.json()).data || []).map(m => m.id).filter(id => /^(gpt|o\d|chatgpt)/i.test(id) && !/audio|realtime|tts|transcribe|image|embedding|search|moderation|instruct|dall|whisper|codex/i.test(id));
  } else if (p === 'gemini') {
    res = await net.fetch(base.gemini() + '/v1beta/models?pageSize=1000', { headers: { 'x-goog-api-key': keyOverride || config.secret('geminiKey') } });
    if (!res.ok) throw await httpError(res, p);
    ids = ((await res.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/i.test(m.name) && !/embedding|aqa|tts|image|live|audio/i.test(m.name)).map(m => m.name.replace(/^models\//, ''));
  } else if (p === 'ollama') {
    try { res = await net.fetch(settings(config).ollamaUrl.replace(/\/+$/, '') + '/api/tags'); }
    catch { throw { code: 'unavailable', message: 'Ollama is not running on this PC. Install it from ollama.com, start it, and download a model (for example “ollama pull qwen3”).' }; }
    if (!res.ok) throw await httpError(res, p);
    ids = ((await res.json()).models || []).map(m => m.name);
  } else throw { code: 'invalid_argument', message: 'Unknown AI' };
  ids = [...new Set(ids)].sort(versionDesc);
  return { models: ids, suggest: suggest(p, ids) };
}
// newest first: compare the numbers in the names, then the names
function versionDesc(a, b) {
  const na = (a.match(/\d+(\.\d+)?/g) || []).map(Number), nb = (b.match(/\d+(\.\d+)?/g) || []).map(Number);
  for (let i = 0; i < Math.max(na.length, nb.length); i++) { const d = (nb[i] || 0) - (na[i] || 0); if (d) return d; }
  return a.localeCompare(b);
}
function suggest(p, ids) {
  const clean = ids.filter(id => !/preview|exp|\d{4}-\d{2}-\d{2}|latest|-\d{3,}$/i.test(id));
  const pool = clean.length ? clean : ids;
  const fastRe = p === 'gemini' ? /flash/i : /mini|nano|small|flash|haiku|[:-](1|2|3|4|7|8)b\b/i;
  const strongRe = p === 'gemini' ? /pro/i : /./;
  const fast = pool.find(id => fastRe.test(id) && !/nano|lite/i.test(id)) || pool.find(id => fastRe.test(id)) || pool[0] || '';
  const strong = pool.find(id => strongRe.test(id) && !fastRe.test(id)) || pool[0] || '';
  return { strong, fast };
}
async function test(config, p) {
  if (p === 'claude') { const r = await claude.test(config); return { provider: p, model: r.model }; }
  if (p === 'plan') {
    const a = await plan.authStatus(config);
    if (!a.installed) throw { code: 'unavailable', message: 'Claude Code is not installed on this PC (or the app cannot find it).' };
    if (!a.loggedIn) throw { code: 'auth_failed', message: 'Claude Code is installed but not signed in. Press Sign in and finish in the browser.' };
    if (!a.plan) throw { code: 'auth_failed', message: 'Claude Code is signed in with an API key, not your Claude plan. Press Sign in and choose your Claude account (Pro or Max).' };
  }
  const model = modelFor(config, p, 'quick');
  const r = await runOn(config, p, { id: 't' + Date.now(), prompt: 'Reply with this JSON exactly: {"ok": true}', tier: 'quick', images: [] }, () => {}, () => {});
  if (!r.value || r.value.ok !== true) throw { code: 'invalid_json', message: 'Unexpected answer' };
  return { provider: p, model };
}

function status(config) {
  const s = settings(config), mc = monthCost(config);
  const providers = {};
  for (const p of Object.keys(PROVIDERS)) providers[p] = { label: PROVIDERS[p].label, ready: ready(config, p), hasKey: PROVIDERS[p].secret ? !!config.secret(PROVIDERS[p].secret) : true };
  providers.plan.path = plan.find(config); providers.plan.limits = plan.limits(); providers.plan.customPath = s.claudePath || '';
  const prices = {}; for (const [k, v] of Object.entries(CLAUDE_PRICES)) prices[k] = v; Object.assign(prices, s.prices);
  return { primary: s.primary, backup: s.backup, autoBackup: !!s.autoBackup, budget: +s.budget || 0, suggestSimple: s.suggestSimple !== false, ollamaUrl: s.ollamaUrl, models: s.models, prices, providers, ready: ready(config, s.primary) || (s.autoBackup && !!s.backup && ready(config, s.backup)), monthCost: mc.total, costUnknown: mc.unknown, quickModel: modelFor(config, s.primary, 'quick'), strongModel: modelFor(config, s.primary, 'complex') };
}
function setSettings(config, patch) {
  const s = settings(config), out = { ...s };
  // the default (your Claude account, or the API key if one is saved) is worked out each time, not stored
  if (!(config.get().ai || {}).primary) delete out.primary;
  if (patch.primary && PROVIDERS[patch.primary]) out.primary = patch.primary;
  if ('backup' in patch) out.backup = PROVIDERS[patch.backup] ? patch.backup : '';
  if ('autoBackup' in patch) out.autoBackup = !!patch.autoBackup;
  if ('suggestSimple' in patch) out.suggestSimple = !!patch.suggestSimple;
  if ('budget' in patch) out.budget = Math.max(0, Math.min(100000, +patch.budget || 0));
  if (typeof patch.claudePath === 'string') { const v = patch.claudePath.trim(); if (!v) delete out.claudePath; else if (v.length < 400 && /claude(\.exe|\.cmd)?$/i.test(v)) out.claudePath = v; }
  if (typeof patch.ollamaUrl === 'string' && /^https?:\/\/[\w.\-:[\]]+(\/[\w./-]*)?$/.test(patch.ollamaUrl.trim())) out.ollamaUrl = patch.ollamaUrl.trim();
  if (patch.models) for (const p of ['openai', 'gemini', 'ollama']) if (patch.models[p]) {
    const m = patch.models[p]; const ok = v => typeof v === 'string' && /^[\w.\-:@/]{0,120}$/.test(v.trim());
    out.models[p] = { strong: ok(m.strong) ? m.strong.trim() : s.models[p].strong, fast: ok(m.fast) ? m.fast.trim() : s.models[p].fast };
  }
  if (patch.prices) for (const [model, v] of Object.entries(patch.prices)) {
    if (!/^[\w.\-:@/]{1,120}$/.test(model)) continue;
    if (!v) { delete out.prices[model]; continue; }
    const pin = +v.in, pout = +v.out; if (pin >= 0 && pout >= 0 && pin < 1000 && pout < 1000) out.prices[model] = { in: pin, out: pout };
  }
  config.set({ ai: out });
}

function planLogin(config) { return plan.login(config); }
async function planStatus(config) { return { ...(await plan.authStatus(config)), job: plan.job() }; }
// connected → your Claude account reads the emails (other choices stay as they were)
function planConnect(config, force) { return plan.connect(config, () => setSettings(config, { primary: 'plan' }), force); }

module.exports = { planLogin, planStatus, planConnect, run, abort, test, listModels, status, setSettings, ready, cost, monthCost, PROVIDERS, suggest, versionDesc };
