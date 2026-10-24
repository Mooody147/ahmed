// Local stand-ins for the Anthropic Messages API and Google OAuth + Gmail API, so the
// desktop app can be tested end to end without real accounts. Answers reuse test/mock.js.
const http = require('http');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const FX = path.join(__dirname, '..', 'fixtures');
const sandbox = { window: {}, setTimeout };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'mock.js'), 'utf8'), sandbox);
const mockAnswer = sandbox.window.__mockAnswer;

const ADDR = 'tester+tasks@gmail.com';
const b64url = b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function start() {
  const log = { anthropic: [], gmail: [], token: [], openai: [], gemini: [], ollama: [], supabase: [] };
  start.sb = { users: new Map(), access: new Map(), refresh: new Map(), docs: new Map(), shares: new Map(), objects: new Map(), ts: 0 };
  const labeled = new Set(); const labels = [{ id: 'INBOX', name: 'INBOX' }];
  const msgs = [
    { id: 'm0', file: 'fwd_attachment.eml', at: Date.parse('2026-10-23T17:05:00Z'), to: ADDR },
    { id: 'm1', file: 'fwd_inline.eml', at: Date.parse('2026-10-23T17:10:00Z'), to: ADDR },
    { id: 'm2', file: 'fwd_gmail.eml', at: Date.parse('2026-10-23T18:00:00Z'), to: ADDR },
    { id: 'mX', file: 'fwd_gmail.eml', at: Date.parse('2026-10-23T18:40:00Z'), to: 'someone@else.com' },
  ];
  const body = req => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => r(s)); });
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    /* ---- Anthropic ---- */
    if (req.method === 'POST' && u.pathname === '/v1/messages') {
      const b = JSON.parse(await body(req));
      const content = b.messages[0].content;
      const prompt = typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).pop();
      // SDK 1.x (API version 2026-10-21) sends the API key as a Bearer token; older clients use x-api-key
      const key = req.headers['x-api-key'] || String(req.headers.authorization || '').replace(/^Bearer /, '');
      log.anthropic.push({ key, version: req.headers['anthropic-version'], beta: req.headers['anthropic-beta'] || '', model: b.model, effort: b.output_config && b.output_config.effort, fallbacks: b.fallbacks, images: Array.isArray(content) ? content.filter(c => c.type === 'image').length : 0, stream: !!b.stream, max_tokens: b.max_tokens, prompt });
      if (key === 'sk-ant-nocredit-0123456789abcdef') return json(res, 400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } });
      if (key !== 'sk-ant-test-0123456789abcdefghij') return json(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
      const ans = /Reply with the word OK/.test(prompt) ? 'OK' : 'Here are the results:\n```json\n' + JSON.stringify(mockAnswer(prompt)) + '\n```';
      const message = { id: 'msg_' + log.anthropic.length, type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } };
      if (!b.stream) return json(res, 200, { ...message, content: [{ type: 'text', text: ans }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      for (let i = 0; i < ans.length; i += 400) { ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: ans.slice(i, i + 400) } }); await new Promise(r => setTimeout(r, 15)); }
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 500 } });
      ev('message_stop', {});
      return res.end();
    }
    /* ---- Supabase (auth, ar_docs / ar_shares tables, the share function, storage) ---- */
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-upsert, prefer', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS' };
    if (/^\/(auth|rest|storage)\/v1\//.test(u.pathname)) {
      const sb = start.sb; const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', ...cors }); res.end(obj === undefined ? '' : JSON.stringify(obj)); };
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      if (req.headers.apikey !== 'sb_publishable_test_0123456789') return send(401, { message: 'Invalid API key' });
      const tokens = uid => { const at = 'at_' + Math.random().toString(36).slice(2), rt = 'rt_' + Math.random().toString(36).slice(2); sb.access.set(at, uid); sb.refresh.set(rt, uid); const usr = [...sb.users.values()].find(x => x.id === uid); return { access_token: at, refresh_token: rt, expires_in: 3600, token_type: 'bearer', user: { id: uid, email: usr.email } }; };
      if (u.pathname === '/auth/v1/signup') { const b = JSON.parse(await body(req)); if (sb.users.has(b.email)) return send(422, { msg: 'User already registered' }); const id = 'u-' + (sb.users.size + 1); sb.users.set(b.email, { id, email: b.email, password: b.password }); return send(200, tokens(id)); }
      if (u.pathname === '/auth/v1/token') {
        const b = JSON.parse(await body(req)); const g = u.searchParams.get('grant_type');
        if (g === 'password') { const x = sb.users.get(b.email); if (!x || x.password !== b.password) return send(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); return send(200, tokens(x.id)); }
        if (g === 'refresh_token') { const uid = sb.refresh.get(b.refresh_token); if (!uid) return send(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' }); sb.refresh.delete(b.refresh_token); return send(200, tokens(uid)); }
      }
      const uid = sb.access.get(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      const now = () => { sb.ts = Math.max(sb.ts + 1, Date.now()); return new Date(sb.ts).toISOString(); };
      if (u.pathname === '/rest/v1/rpc/ar_get_share') { const b = JSON.parse(await body(req)); const x = sb.shares.get(b.t); log.supabase.push('rpc'); return send(200, x && !x.revoked ? { title: x.title, snapshot: x.snapshot, updated_at: x.updated_at } : null); }
      if (!uid) return send(401, { message: 'JWT expired' });
      if (u.pathname === '/rest/v1/ar_docs' && req.method === 'GET') {
        const gt = (u.searchParams.get('updated_at') || '').replace(/^gt\./, ''), lim = +u.searchParams.get('limit') || 1000;
        const rows = [...sb.docs.values()].filter(r => r.user_id === uid && (!gt || r.updated_at > gt)).sort((a, b) => a.updated_at.localeCompare(b.updated_at)).slice(0, lim);
        return send(200, rows.map(r => ({ path: r.path, data: r.data, deleted: r.deleted, updated_at: r.updated_at, device: r.device })));
      }
      if (u.pathname === '/rest/v1/ar_docs' && req.method === 'POST') {
        const rows = JSON.parse(await body(req)); log.supabase.push('push ' + rows.length);
        if (rows.some(r => r.user_id !== uid)) return send(403, { message: 'new row violates row-level security policy' });
        for (const r of rows) sb.docs.set(uid + '|' + r.path, { ...r, updated_at: now() });
        return send(201);
      }
      if (u.pathname === '/rest/v1/ar_shares' && req.method === 'POST') { for (const r of JSON.parse(await body(req))) { if (r.user_id !== uid) return send(403, {}); sb.shares.set(r.token, { ...r, updated_at: now() }); } return send(201); }
      if (u.pathname === '/rest/v1/ar_shares' && req.method === 'PATCH') { const t = (u.searchParams.get('token') || '').replace(/^eq\./, ''); const x = sb.shares.get(t); if (x && x.user_id === uid) Object.assign(x, JSON.parse(await body(req))); return send(204); }
      const so = /^\/storage\/v1\/object\/ar-files\/(.+)$/.exec(u.pathname);
      if (so) {
        const key = decodeURIComponent(so[1]); if (!key.startsWith(uid + '/')) return send(403, { message: 'Unauthorized' });
        if (req.method === 'POST') { const chunks = []; for await (const c of req) chunks.push(c); sb.objects.set(key, Buffer.concat(chunks)); log.supabase.push('put ' + key); return send(200, { Key: 'ar-files/' + key }); }
        if (req.method === 'GET') { const b = sb.objects.get(key); if (!b) return send(400, { statusCode: '404', error: 'not_found', message: 'Object not found' }); res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(b); }
      }
      return send(404, { message: 'no route ' + u.pathname });
    }
    /* ---- OpenAI (chat completions, streamed) ---- */
    const textOf = content => (typeof content === 'string' ? content : content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
    const answerFor = prompt => (/Reply with this JSON exactly/.test(prompt) ? '{"ok": true}' : JSON.stringify(mockAnswer(prompt)));
    if (u.pathname === '/v1/models' && req.method === 'GET') {
      log.openai.push({ path: u.pathname, auth: req.headers.authorization });
      if (req.headers.authorization !== 'Bearer sk-openai-test-0123456789abcdef') return json(res, 401, { error: { message: 'Incorrect API key provided', type: 'invalid_request_error', code: 'invalid_api_key' } });
      return json(res, 200, { object: 'list', data: ['gpt-test-4o', 'gpt-test-4o-mini', 'text-embedding-3-large', 'whisper-1', 'gpt-test-4o-realtime-preview'].map(id => ({ id, object: 'model' })) });
    }
    if (u.pathname === '/v1/chat/completions' && req.method === 'POST') {
      const b = JSON.parse(await body(req)); const um = b.messages.find(x => x.role === 'user');
      const prompt = textOf(um.content);
      log.openai.push({ path: u.pathname, auth: req.headers.authorization, model: b.model, json: b.response_format && b.response_format.type, stream: b.stream, images: Array.isArray(um.content) ? um.content.filter(c => c.type === 'image_url').length : 0, prompt });
      if (req.headers.authorization !== 'Bearer sk-openai-test-0123456789abcdef') return json(res, 401, { error: { message: 'Incorrect API key provided', code: 'invalid_api_key' } });
      const ans = answerFor(prompt);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < ans.length; i += 300) res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: ans.slice(i, i + 300) }, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 1000, completion_tokens: 200, prompt_tokens_details: { cached_tokens: 100 } } })}\n\n`);
      res.write('data: [DONE]\n\n'); return res.end();
    }
    /* ---- Gemini ---- */
    if (u.pathname === '/v1beta/models' && req.method === 'GET') {
      if (req.headers['x-goog-api-key'] !== 'AIza-gemini-test-0123456789abcdef') return json(res, 400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
      return json(res, 200, { models: [{ name: 'models/gemini-test-2.5-pro', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-test-2.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] }] });
    }
    let gm;
    if ((gm = /^\/v1beta\/models\/([^/:]+):streamGenerateContent$/.exec(u.pathname)) && req.method === 'POST') {
      const b = JSON.parse(await body(req)); const parts = b.contents[0].parts;
      const prompt = parts.filter(x => x.text).map(x => x.text).join('\n');
      log.gemini.push({ model: decodeURIComponent(gm[1]), key: req.headers['x-goog-api-key'], sse: u.searchParams.get('alt'), mime: b.generationConfig && b.generationConfig.responseMimeType, images: parts.filter(x => x.inline_data).length, prompt });
      if (req.headers['x-goog-api-key'] !== 'AIza-gemini-test-0123456789abcdef') return json(res, 400, { error: { code: 400, message: 'API key not valid.', status: 'INVALID_ARGUMENT', details: [{ reason: 'API_KEY_INVALID' }] } });
      const ans = answerFor(prompt);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (let i = 0; i < ans.length; i += 300) res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: ans.slice(i, i + 300) }] } }] })}\r\n\r\n`);
      res.write(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: '' }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 150, totalTokenCount: 1050 } })}\r\n\r\n`);
      return res.end();
    }
    /* ---- Ollama ---- */
    if (u.pathname === '/api/tags') return json(res, 200, { models: [{ name: 'qwen-test:8b' }, { name: 'llama-test:70b' }] });
    if (u.pathname === '/api/chat' && req.method === 'POST') {
      const b = JSON.parse(await body(req)); const um = b.messages.find(x => x.role === 'user');
      log.ollama.push({ model: b.model, format: b.format, images: (um.images || []).length, prompt: um.content });
      if (!/^(qwen-test:8b|llama-test:70b)$/.test(b.model)) return json(res, 404, { error: `model "${b.model}" not found, try pulling it first` });
      const ans = answerFor(um.content);
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      for (let i = 0; i < ans.length; i += 300) res.write(JSON.stringify({ model: b.model, message: { role: 'assistant', content: ans.slice(i, i + 300) }, done: false }) + '\n');
      res.write(JSON.stringify({ model: b.model, message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 800, eval_count: 120 }) + '\n');
      return res.end();
    }
    /* ---- Google OAuth ---- */
    if (u.pathname === '/auth') {
      const ok = u.searchParams.get('code_challenge_method') === 'S256' && u.searchParams.get('scope') === 'https://www.googleapis.com/auth/gmail.modify' && u.searchParams.get('client_id') === 'cid.apps.googleusercontent.com';
      res.writeHead(302, { Location: `${u.searchParams.get('redirect_uri')}/?${ok ? 'code=authcode' : 'error=bad_request'}&state=${u.searchParams.get('state')}` }); return res.end();
    }
    if (u.pathname === '/token') {
      const f = new URLSearchParams(await body(req)); log.token.push(Object.fromEntries(f));
      if (f.get('client_secret') !== 'GOCSPX-secret') return json(res, 401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code' && f.get('code') === 'authcode' && f.get('code_verifier')) return json(res, 200, { access_token: 'at1', refresh_token: 'rt1', expires_in: 3600 });
      if (f.get('grant_type') === 'refresh_token' && f.get('refresh_token') === 'rt1') return json(res, 200, { access_token: 'at2', expires_in: 3600 });
      return json(res, 400, { error: 'invalid_grant' });
    }
    /* ---- Gmail API ---- */
    const g = /^\/gmail\/v1\/users\/me(\/.*)$/.exec(u.pathname);
    if (g) {
      log.gmail.push(req.method + ' ' + g[1] + (u.search || ''));
      if (!/^Bearer at[12]$/.test(req.headers.authorization || '')) return json(res, 401, { error: { message: 'bad token' } });
      const p = g[1]; let m;
      const headers = x => [{ name: 'To', value: x.to }, { name: 'Subject', value: 'fwd ' + x.id }, { name: 'From', value: 'Mahmoud <m@contractor.example>' }];
      const meta = x => ({ id: x.id, threadId: 't' + x.id, internalDate: String(x.at), labelIds: ['INBOX', ...(labeled.has(x.id) ? ['Label_1'] : [])], payload: { headers: headers(x) } });
      if (p === '/profile') return json(res, 200, { emailAddress: 'tester@gmail.com' });
      if (p === '/threads') {
        const q = u.searchParams.get('q') || '';
        if (!/to:\(tester\+tasks@gmail\.com\) newer_than:\d+d -label:action-register-imported/.test(q)) return json(res, 200, {});
        return json(res, 200, { threads: msgs.filter(x => !labeled.has(x.id)).map(x => ({ id: 't' + x.id })) });
      }
      if ((m = /^\/threads\/t(\w+)$/.exec(p))) { const x = msgs.find(y => y.id === m[1]); return json(res, 200, { id: 't' + x.id, messages: [meta(x)] }); }
      if ((m = /^\/messages\/(\w+)$/.exec(p))) { const x = msgs.find(y => y.id === m[1]); return json(res, 200, { ...meta(x), raw: b64url(fs.readFileSync(path.join(FX, x.file))) }); }
      if (p === '/labels' && req.method === 'GET') return json(res, 200, { labels });
      if (p === '/labels' && req.method === 'POST') { const l = { id: 'Label_1', ...JSON.parse(await body(req)) }; labels.push(l); return json(res, 200, l); }
      if ((m = /^\/messages\/(\w+)\/modify$/.exec(p))) { const b = JSON.parse(await body(req)); if ((b.addLabelIds || []).includes('Label_1')) labeled.add(m[1]); return json(res, 200, { id: m[1] }); }
      return json(res, 404, { error: { message: 'not found ' + p } });
    }
    json(res, 404, { error: 'no route' });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, log, labeled, sb: start.sb, base: `http://127.0.0.1:${server.address().port}` })));
}
// Gmail over IMAP (app password): hoodiecrow with Gmail's folder layout and X-GM extensions
function startImap() {
  const hoodiecrow = require('hoodiecrow-imap');
  const raw = f => fs.readFileSync(path.join(FX, f), 'latin1');
  const now = new Date();
  const messages = ['fwd_attachment.eml', 'fwd_inline.eml', 'fwd_gmail.eml', 'review.eml'].map(f => ({ raw: raw(f), internaldate: now }));
  const storage = { INBOX: { messages: [] }, '': { separator: '/', folders: { '[Gmail]': { flags: ['\\Noselect'], folders: { 'All Mail': { 'special-use': '\\All', messages }, 'Sent Mail': { 'special-use': '\\Sent' } } } } } };
  const server = hoodiecrow({ plugins: ['X-GM-EXT-1', 'SPECIAL-USE', 'IDLE', 'ENABLE', 'UIDPLUS', 'LITERALPLUS'], users: { 'msobeah12@gmail.com': { password: 'abcdefghijklmnop' } }, storage });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, port: server.address().port, labeled: () => server.storage })));
}
// Gmail SMTP stand-in: checks the app password and keeps every message it receives
function startSmtp() {
  const { SMTPServer } = require('smtp-server');
  const got = [];
  const server = new SMTPServer({ secure: false, disabledCommands: ['STARTTLS'], authOptional: false, logger: false,
    onAuth(auth, session, cb) { if (auth.username === 'msobeah12@gmail.com' && auth.password === 'abcdefghijklmnop') return cb(null, { user: auth.username }); cb(new Error('535 5.7.8 Username and Password not accepted')); },
    onData(stream, session, cb) { const ch = []; stream.on('data', d => ch.push(d)); stream.on('end', () => { got.push({ from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map(r => r.address), raw: Buffer.concat(ch).toString('utf8') }); cb(); }); } });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, got, port: server.server.address().port })));
}
module.exports = { start, startImap, startSmtp, ADDR };
