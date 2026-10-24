'use strict';
// Gmail forwarding inbox over IMAP with a Gmail app password: the user pastes their
// address and a 16-character app password, nothing else. `call(tool, input)` answers
// the same tool calls as desktop/gmail.js (Gmail API) with the same result shapes.
// Message ids are the hex form of X-GM-MSGID, which is also the Gmail API id.
const { ImapFlow } = require('imapflow');

const LABEL = 'Action Register/Imported';
const err = (code, message) => ({ code, message });

function client(user, pass) {
  return new ImapFlow({
    host: process.env.AR_IMAP_HOST || 'imap.gmail.com',
    port: +(process.env.AR_IMAP_PORT || 993),
    secure: !process.env.AR_IMAP_INSECURE,
    auth: { user, pass },
    logger: false,
    emitLogs: false,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
  });
}
function mapError(e) {
  if (e && e.code && !(e instanceof Error)) return e;
  if (e && (e.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|LOGIN failed/i.test(String(e.responseText || e.message)))) return err('needs_reauth', 'Gmail did not accept the address and app password. Create a new app password and connect again.');
  if (e && /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|timeout|EHOSTUNREACH/i.test(String(e.code || e.message))) return err('server_unavailable', 'Could not reach Gmail (imap.gmail.com, port 993). Check the internet connection; some company networks block this port.');
  return err('tool_error', String((e && (e.responseText || e.message)) || e));
}
async function withClient(config, fn) {
  const user = config.get().gmail.account, pass = config.secret('gmailAppPassword');
  if (!user || !pass) throw err('server_not_connected', 'Gmail is not connected.');
  const c = client(user, pass);
  try { await c.connect(); } catch (e) { throw mapError(e); }
  try { return await fn(c); }
  catch (e) { throw mapError(e); }
  finally { try { await c.logout(); } catch {} }
}
// "All Mail" has every message whatever its labels; its name depends on the account language.
async function allMail(c) {
  const boxes = await c.list();
  const all = boxes.find(b => b.specialUse === '\\All');
  return { path: all ? all.path : 'INBOX', boxes };
}
async function ensureLabel(c, boxes) {
  if (boxes.some(b => b.path === LABEL)) return;
  try { await c.mailboxCreate(LABEL); } catch (e) { if (!/ALREADYEXISTS|exists/i.test(String(e.responseText || e.message))) throw e; }
}
const hexId = m => (m.emailId ? BigInt(m.emailId).toString(16) : 'u' + m.uid);
async function uidOf(c, id) {
  if (/^u\d+$/.test(id)) return +id.slice(1);
  if (!/^[0-9a-f]+$/i.test(id)) throw err('tool_error', 'Unknown message id');
  const uids = await c.search({ emailId: BigInt('0x' + id).toString() }, { uid: true });
  if (!uids || !uids.length) throw err('tool_error', 'Message not found');
  return uids[0];
}
const addrs = list => (list || []).map(a => String(a.address || '').toLowerCase()).filter(Boolean);
const b64url = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function connect(config, address, appPassword) {
  address = String(address || '').trim().toLowerCase();
  const pass = String(appPassword || '').replace(/\s+/g, '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) throw err('invalid_argument', 'Enter your Gmail address.');
  if (pass.length < 8) throw err('invalid_argument', 'Paste the 16-character app password from Google.');
  const c = client(address, pass);
  try { await c.connect(); } catch (e) { throw mapError(e); }
  try { await c.logout(); } catch {}
  config.setSecret('gmailAppPassword', pass);
  config.set({ gmail: { ...config.get().gmail, mode: 'imap', account: address } });
}
function disconnect(config) {
  config.setSecret('gmailAppPassword', null);
}

async function call(config, tool, input = {}) {
  const account = config.get().gmail.account;
  const view = id => `https://mail.google.com/mail/?authuser=${encodeURIComponent(account)}#all/${id}`;
  return withClient(config, async c => {
    const { path, boxes } = await allMail(c);
    switch (tool) {
      case 'search_threads': {
        // the app sends: to:(address) newer_than:Nd [-label:...]; already-imported mail carries LABEL
        const q = String(input.query || '');
        const to = (/to:\(([^)]+)\)/.exec(q) || /to:(\S+)/.exec(q) || [])[1];
        const days = +((/newer_than:(\d+)d/.exec(q) || [])[1] || 14);
        if (!to) return { payload: { threads: [] } };
        const lock = await c.getMailboxLock(path);
        try {
          const uids = (await c.search({ to: to.trim(), since: new Date(Date.now() - days * 864e5) }, { uid: true })) || [];
          const threads = [];
          if (uids.length) {
            for await (const m of c.fetch(uids.slice(-Math.min(50, input.pageSize || 25) * 2), { uid: true, envelope: true, labels: true, emailId: true, threadId: true, internalDate: true }, { uid: true })) {
              const labels = [...(m.labels || [])];
              if (labels.includes(LABEL)) continue;
              const id = hexId(m), at = m.internalDate ? new Date(m.internalDate).toISOString() : '';
              const msg = { id, threadId: m.threadId ? BigInt(m.threadId).toString(16) : id, date: at, internalDate: at, subject: (m.envelope || {}).subject || '', sender: addrs((m.envelope || {}).from)[0] || '', toRecipients: addrs((m.envelope || {}).to), ccRecipients: addrs((m.envelope || {}).cc), bccRecipients: addrs((m.envelope || {}).bcc), labelIds: labels, viewUrl: view(id) };
              threads.push({ id: msg.threadId, messageCount: 1, messages: [msg] });
            }
          }
          return { payload: { threads: threads.slice(-(input.pageSize || 25)) } };
        } finally { lock.release(); }
      }
      case 'get_thread': return { payload: { id: input.threadId, messages: [] } };
      case 'get_message': {
        const lock = await c.getMailboxLock(path);
        try {
          const uid = await uidOf(c, String(input.messageId));
          const m = await c.fetchOne(uid, { source: true }, { uid: true });
          if (!m || !m.source) throw err('tool_error', 'empty message');
          if (input.messageFormat === 'RAW') return { payload: { id: input.messageId, raw: b64url(m.source) } };
          throw err('tool_error', 'Only full messages are available over IMAP');
        } finally { lock.release(); }
      }
      case 'list_labels': return { payload: { labels: boxes.map(b => ({ id: b.path, name: b.path })) } };
      case 'create_label': { await ensureLabel(c, boxes); return { payload: { id: LABEL, name: LABEL } }; }
      case 'label_message': {
        await ensureLabel(c, boxes);
        const lock = await c.getMailboxLock(path);
        try {
          const uid = await uidOf(c, String(input.messageId));
          // the only label the app sets is the "imported" one, whatever id an earlier Gmail API connection stored
          await c.messageFlagsAdd(String(uid), [LABEL], { uid: true, useLabels: true });
          return { payload: { id: input.messageId } };
        } finally { lock.release(); }
      }
      default: throw err('not_in_manifest', 'Unknown Gmail tool ' + tool);
    }
  });
}

module.exports = { connect, disconnect, call, LABEL };
