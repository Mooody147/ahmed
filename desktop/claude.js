'use strict';
// Claude calls for the renderer's `sample` capability, made here in the main process
// with the user's Anthropic API key (Messages API, streamed).
const { net } = require('electron');
const SDK = require('@anthropic-ai/sdk');
const Anthropic = SDK.default || SDK;

// Analysis depth → effort. Opus 5.5 / Haiku 5.5 default to "medium", so it is always set explicitly.
const EFFORT = { complex: 'high', default: 'medium', quick: 'low' };
// Models that accept server-side refusal fallbacks ("default" routing) on the Claude API.
const FALLBACK_MODELS = /^claude-(fable-5-1|opus-5-5|opus-5|sonnet-5-5)$/;
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOKENS = 64000;

const running = new Map();

function client(config) {
  const apiKey = config.secret('anthropicKey');
  if (!apiKey) throw { code: 'sampling_disabled', message: 'No Anthropic API key. Add it in Setup › Connections.' };
  return new Anthropic({
    apiKey, authToken: null,
    baseURL: process.env.AR_ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    // Chromium's network stack: honours the system proxy and the OS certificate store (corporate networks).
    fetch: (url, init) => net.fetch(url, init),
    maxRetries: 2, timeout: 20 * 60 * 1000,
  });
}

function buildParams(config, req, opts) {
  const models = config.models();
  const model = models[req.tier] || models.complex;
  const content = [];
  // Each image is preceded by its key so the prompt's "IMG1 = …" list maps onto it.
  (req.images || []).forEach((im, i) => {
    content.push({ type: 'text', text: `IMG${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: im.type, data: Buffer.from(im.data).toString('base64') } });
  });
  // The analysis instructions come before "=== EMAIL HEADER ===" and repeat for every email of the
  // day, so they go first with a cache breakpoint (prompt caching cuts their cost on later emails).
  const cut = req.prompt.indexOf('\n=== EMAIL HEADER ===');
  if (cut > 4000) content.unshift({ type: 'text', text: req.prompt.slice(0, cut), cache_control: { type: 'ephemeral' } });
  content.push({ type: 'text', text: cut > 4000 ? req.prompt.slice(cut + 1) : req.prompt });
  const params = { model, max_tokens: MAX_TOKENS, messages: [{ role: 'user', content }] };
  if (opts.effort) params.output_config = { effort: EFFORT[req.tier] || 'high' };
  if (opts.fallbacks && FALLBACK_MODELS.test(model)) { params.fallbacks = 'default'; params.betas = [FALLBACK_BETA]; }
  return params;
}

async function run(config, req, onDelta, onUsage) {
  const c = client(config);
  const ac = new AbortController();
  running.set(req.id, ac);
  const opts = { effort: true, fallbacks: true };
  try {
    for (let attempt = 0; ; attempt++) {
      const params = buildParams(config, req, opts);
      try {
        const msg = await streamOnce(c, params, ac.signal, onDelta);
        if (onUsage && msg.usage) { try { onUsage({ model: msg.model || params.model, input: msg.usage.input_tokens || 0, output: msg.usage.output_tokens || 0, cacheRead: msg.usage.cache_read_input_tokens || 0, cacheWrite: msg.usage.cache_creation_input_tokens || 0 }); } catch {} }
        return finish(msg);
      } catch (e) {
        // A model set in Setup that predates effort / fallbacks rejects those fields: retry once without them.
        if (attempt === 0 && e instanceof Anthropic.BadRequestError && /fallback|effort|output_config|betas?\b/i.test(e.message)) { opts.effort = !/effort|output_config/i.test(e.message); opts.fallbacks = false; continue; }
        throw e;
      }
    }
  } catch (e) { throw mapError(e, ac.signal); }
  finally { running.delete(req.id); }
}

async function streamOnce(c, params, signal, onDelta) {
  const stream = params.betas ? c.beta.messages.stream(params, { signal }) : c.messages.stream(params, { signal });
  let pending = '', last = 0;
  stream.on('text', d => {
    pending += d; const now = Date.now();
    if (now - last > 250) { onDelta(pending); pending = ''; last = now; }
  });
  const msg = await stream.finalMessage();
  if (pending) onDelta(pending);
  return msg;
}

function finish(msg) {
  if (msg.stop_reason === 'refusal') throw { code: 'refused', message: 'Claude declined this request.' };
  // After a mid-stream fallback the answer is the partial text plus its continuation, so all text blocks are joined.
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  if (!text.trim()) throw { code: 'empty_completion', message: 'Empty answer' };
  const v = parseJsonLoose(text);
  if (v === undefined) throw { code: 'invalid_json', message: msg.stop_reason === 'max_tokens' ? 'The answer was cut off (output limit).' : 'The answer was not JSON.' };
  return v;
}

// Whole reply → fenced block → first { or [ to the matching last } or ].
function parseJsonLoose(text) {
  const t = String(text).trim();
  try { return JSON.parse(t); } catch {}
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) { try { return JSON.parse(fence[1].trim()); } catch {} }
  for (const [o, c] of [['{', '}'], ['[', ']']]) {
    const a = t.indexOf(o), b = t.lastIndexOf(c);
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  }
  return undefined;
}

function mapError(e, signal) {
  if (e && e.code && !(e instanceof Error)) return e; // already mapped
  if (signal.aborted || e instanceof Anthropic.APIUserAbortError) return { code: 'cancelled', message: 'Stopped' };
  const msg = String((e && e.message) || e);
  if (e instanceof Anthropic.AuthenticationError) return { code: 'auth_failed', message: msg };
  if (e instanceof Anthropic.PermissionDeniedError) return { code: 'billing', message: msg };
  if (e instanceof Anthropic.NotFoundError) return { code: 'model_not_found', message: msg };
  if (e instanceof Anthropic.RateLimitError) return { code: 'rate_limited', message: msg };
  if (e instanceof Anthropic.BadRequestError || (e && e.status === 413)) {
    if (/credit balance|billing/i.test(msg)) return { code: 'billing', message: msg };
    if (/too long|too large|maximum context|request_too_large|exceed/i.test(msg)) return { code: 'prompt_too_large', message: msg };
    if (/image/i.test(msg)) return { code: 'image_rejected', message: msg };
    return { code: 'upstream_error', message: msg };
  }
  return { code: 'upstream_error', message: msg };
}

function abort(id) { const ac = running.get(id); if (ac) ac.abort(); return !!ac; }

async function test(config) {
  const c = client(config);
  const model = config.models().quick;
  try {
    const msg = await c.messages.create({ model, max_tokens: 512, messages: [{ role: 'user', content: 'Reply with the word OK.' }] });
    return { model: msg.model || model };
  } catch (e) { throw mapError(e, new AbortController().signal); }
}

module.exports = { run, abort, test, parseJsonLoose };
