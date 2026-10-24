'use strict';
// Sending email from the connected Gmail: over SMTP with the same app password used for reading
// (smtp.gmail.com, port 465), or through the Gmail API when Gmail was connected with an OAuth client.
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');
const gmail = require('./gmail');

function message(config, m) {
  const from = config.get().gmail.account;
  const name = config.get().profileName || '';
  const list = v => (Array.isArray(v) ? v : String(v || '').split(/[;,]/)).map(s => s.trim()).filter(Boolean);
  const to = list(m.to), cc = list(m.cc), bcc = list(m.bcc);
  if (!to.length) throw { code: 'invalid_argument', message: 'Add at least one recipient.' };
  if (![...to, ...cc, ...bcc].every(a => /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(a.replace(/^.*<([^>]+)>$/, '$1')))) throw { code: 'invalid_argument', message: 'One of the addresses is not valid.' };
  return {
    from: name ? { name, address: from } : from, to, cc, bcc, subject: String(m.subject || '').slice(0, 300), text: String(m.text || ''),
    ...(m.html ? { html: String(m.html) } : {}),
    attachments: (m.attachments || []).slice(0, 10).map(a => ({ filename: String(a.filename || 'file').slice(0, 150), content: Buffer.from(a.content) })),
  };
}
async function send(config, mode, m) {
  const msg = message(config, m);
  if (mode === 'imap') {
    const t = nodemailer.createTransport({
      host: process.env.AR_SMTP_HOST || 'smtp.gmail.com', port: +process.env.AR_SMTP_PORT || 465, secure: !process.env.AR_SMTP_INSECURE,
      auth: { user: config.get().gmail.account, pass: config.secret('gmailAppPassword') },
      ...(process.env.AR_SMTP_INSECURE ? { ignoreTLS: true, tls: { rejectUnauthorized: false } } : {}),
      connectionTimeout: 20000, greetingTimeout: 20000,
    });
    try { const r = await t.sendMail(msg); return { id: r.messageId, via: 'smtp' }; }
    catch (e) {
      if (/EAUTH|535|Invalid login|Username and Password/i.test(String(e.code || '') + e.message)) throw { code: 'auth_failed', message: 'Gmail did not accept the app password for sending. Connect Gmail again in Setup › Connections.' };
      if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|ECONNRESET/i.test(String(e.code || e.message))) throw { code: 'server_unavailable', message: 'Could not reach smtp.gmail.com (port 465) — some company networks block it.' };
      throw { code: 'send_failed', message: String(e.message || e).slice(0, 300) };
    }
  }
  if (mode === 'oauth') {
    const raw = await new MailComposer(msg).compile().build();
    const r = await gmail.api('POST', '/messages/send', { raw: raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }, config);
    return { id: r && r.id, via: 'gmail-api' };
  }
  throw { code: 'not_connected', message: 'Connect Gmail in Setup › Connections to send email from the app.' };
}
module.exports = { send };
