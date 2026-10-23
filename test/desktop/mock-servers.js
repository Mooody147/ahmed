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
  const log = { anthropic: [], gmail: [], token: [] };
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
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, log, labeled, base: `http://127.0.0.1:${server.address().port}` })));
}
module.exports = { start, ADDR };
