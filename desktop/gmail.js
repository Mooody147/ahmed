'use strict';
// Gmail forwarding inbox via the Gmail REST API (OAuth "Desktop app" client, loopback
// redirect + PKCE, scope gmail.modify). `call(tool, input)` answers the same tool calls
// app.js makes to the claude.ai Gmail connector, with the same result shapes.
const http = require('http');
const crypto = require('crypto');
const { net } = require('electron');

const API = () => (process.env.AR_GMAIL_API_BASE || 'https://gmail.googleapis.com') + '/gmail/v1/users/me';
const AUTH_URL = () => process.env.AR_GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = () => process.env.AR_GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/gmail.modify';

let access = { token: '', exp: 0 };
const b64url = buf => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const err = (code, message) => ({ code, message });

/* ---------- OAuth ---------- */
async function connect(config, openUrl) {
  const clientId = config.get().gmail.clientId, clientSecret = config.secret('gmailClientSecret');
  if (!clientId || !clientSecret) throw err('invalid_argument', 'Enter the OAuth client ID and client secret first.');
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));
  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      if (u.pathname !== '/') { res.writeHead(404); res.end(); return; }
      const ok = u.searchParams.get('state') === state && u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!doctype html><meta charset=utf-8><title>Action Register</title><body style="font:16px system-ui;padding:40px">${ok ? 'Gmail is connected. You can close this tab and return to Action Register.' : 'Gmail was not connected (' + (u.searchParams.get('error') || 'cancelled') + '). Close this tab and try again.'}</body>`);
      clearTimeout(timer); srv.close();
      if (ok) resolve({ code: u.searchParams.get('code'), redirectUri }); else reject(err('cancelled', u.searchParams.get('error') || 'Sign-in was cancelled.'));
    });
    let redirectUri = '';
    const timer = setTimeout(() => { srv.close(); reject(err('cancelled', 'Sign-in timed out.')); }, 5 * 60 * 1000);
    srv.on('error', e => { clearTimeout(timer); reject(err('server_unavailable', e.message)); });
    srv.listen(0, '127.0.0.1', () => {
      redirectUri = `http://127.0.0.1:${srv.address().port}`;
      const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state, access_type: 'offline', prompt: 'consent' });
      Promise.resolve(openUrl(AUTH_URL() + '?' + q)).catch(e => { clearTimeout(timer); srv.close(); reject(err('server_unavailable', String(e && e.message || e))); });
    });
  });
  const tok = await tokenRequest({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret });
  if (!tok.refresh_token) throw err('needs_reauth', 'Google did not return a refresh token. Remove Action Register from your Google account’s third-party access and connect again.');
  config.setSecret('gmailRefresh', tok.refresh_token);
  access = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 - 60000 };
  const prof = await api('GET', '/profile', null, config);
  config.set({ gmail: { ...config.get().gmail, account: prof.emailAddress || '' } });
}

async function disconnect(config) {
  const rt = config.secret('gmailRefresh');
  config.setSecret('gmailRefresh', null);
  config.set({ gmail: { ...config.get().gmail, account: '' } });
  access = { token: '', exp: 0 };
  if (rt && !process.env.AR_GOOGLE_TOKEN_URL) { try { await net.fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(rt), { method: 'POST' }); } catch {} }
}

async function tokenRequest(form) {
  let r;
  try { r = await net.fetch(TOKEN_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString() }); }
  catch (e) { throw err('server_unavailable', e.message); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw err(j.error === 'invalid_grant' || r.status === 400 || r.status === 401 ? 'needs_reauth' : 'server_unavailable', j.error_description || j.error || 'HTTP ' + r.status);
  return j;
}

async function accessToken(config) {
  if (access.token && Date.now() < access.exp) return access.token;
  const rt = config.secret('gmailRefresh');
  if (!rt) throw err('server_not_connected', 'Gmail is not connected.');
  const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: rt, client_id: config.get().gmail.clientId, client_secret: config.secret('gmailClientSecret') });
  access = { token: tok.access_token, exp: Date.now() + (tok.expires_in || 3600) * 1000 - 60000 };
  return access.token;
}

async function api(method, p, body, config, retried) {
  const token = await accessToken(config);
  let r;
  try { r = await net.fetch(API() + p, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { throw err('server_unavailable', e.message); }
  if (r.status === 401 && !retried) { access = { token: '', exp: 0 }; return api(method, p, body, config, true); }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return j;
  const m = (j.error && j.error.message) || 'HTTP ' + r.status;
  if (r.status === 401 || (r.status === 403 && /insufficient|scope/i.test(m))) throw err('needs_reauth', m);
  if (r.status === 429 || r.status >= 500) throw err('server_unavailable', m);
  throw err('tool_error', m);
}

/* ---------- tool emulation ---------- */
const hdr = (m, name) => (((m.payload || {}).headers || []).find(h => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';
const addrs = v => (String(v || '').match(/[^\s<>,;"']+@[^\s<>,;"']+/g) || []).map(a => a.toLowerCase());
const META = ['To', 'Cc', 'Delivered-To', 'X-Original-To', 'Date', 'Subject', 'From'].map(h => 'metadataHeaders=' + h).join('&');

function metaMessage(m, account) {
  const at = m.internalDate ? new Date(+m.internalDate).toISOString() : '';
  return {
    id: m.id, threadId: m.threadId, date: at, internalDate: at, subject: hdr(m, 'Subject'), sender: hdr(m, 'From'),
    toRecipients: addrs(hdr(m, 'To')), ccRecipients: addrs(hdr(m, 'Cc')),
    // plus-address deliveries often show only in Delivered-To (e.g. Bcc or list forwards)
    bccRecipients: addrs(hdr(m, 'Delivered-To') + ' ' + hdr(m, 'X-Original-To')),
    labelIds: m.labelIds || [], snippet: m.snippet || '',
    viewUrl: `https://mail.google.com/mail/${account ? '?authuser=' + encodeURIComponent(account) : 'u/0/'}#all/${m.id}`,
  };
}

function decodePart(data) { return Buffer.from(String(data || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function walk(part, out) {
  if (!part) return out;
  if (part.filename) out.files.push(part.filename);
  else if (part.mimeType === 'text/plain' && part.body && part.body.data) out.plain.push(decodePart(part.body.data));
  else if (part.mimeType === 'text/html' && part.body && part.body.data) out.html.push(decodePart(part.body.data));
  (part.parts || []).forEach(p => walk(p, out));
  return out;
}
const htmlToText = h => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

async function call(config, tool, input = {}) {
  const account = config.get().gmail.account;
  switch (tool) {
    case 'search_threads': {
      const q = new URLSearchParams({ q: input.query || '', maxResults: String(Math.min(50, input.pageSize || 25)) });
      const list = await api('GET', '/threads?' + q, null, config);
      const threads = [];
      for (const t of list.threads || []) {
        const th = await api('GET', `/threads/${encodeURIComponent(t.id)}?format=metadata&${META}`, null, config);
        const messages = (th.messages || []).map(m => metaMessage(m, account));
        threads.push({ id: t.id, messageCount: messages.length, messages });
      }
      return { payload: { threads } };
    }
    case 'get_thread': {
      const th = await api('GET', `/threads/${encodeURIComponent(input.threadId)}?format=metadata&${META}`, null, config);
      return { payload: { id: th.id, messages: (th.messages || []).map(m => metaMessage(m, account)) } };
    }
    case 'get_message': {
      const id = encodeURIComponent(input.messageId);
      if (input.messageFormat === 'RAW') { const m = await api('GET', `/messages/${id}?format=raw`, null, config); return { payload: { id: m.id, raw: m.raw } }; }
      const m = await api('GET', `/messages/${id}?format=full`, null, config);
      const parts = walk(m.payload, { plain: [], html: [], files: [] });
      const meta = metaMessage(m, account);
      return { payload: { ...meta, date: hdr(m, 'Date') ? new Date(hdr(m, 'Date')).toISOString() : meta.date, plaintextBody: parts.plain.join('\n') || htmlToText(parts.html.join('\n')), attachments: parts.files.map(filename => ({ filename })) } };
    }
    case 'list_labels': { const r = await api('GET', '/labels', null, config); return { payload: { labels: (r.labels || []).map(l => ({ id: l.id, name: l.name })) } }; }
    case 'create_label': {
      const l = await api('POST', '/labels', { name: input.displayName, labelListVisibility: 'labelShow', messageListVisibility: 'show' }, config);
      return { payload: { id: l.id, name: l.name } };
    }
    case 'label_message': {
      const r = await api('POST', `/messages/${encodeURIComponent(input.messageId)}/modify`, { addLabelIds: input.labelIds || [] }, config);
      return { payload: { id: r.id } };
    }
    default: throw err('not_in_manifest', 'Unknown Gmail tool ' + tool);
  }
}

module.exports = { connect, disconnect, call };
