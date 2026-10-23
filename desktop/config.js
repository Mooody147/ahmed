'use strict';
// Desktop settings (config.json) and secrets (secrets.json). Secrets — the Anthropic
// API key and Gmail OAuth tokens — are encrypted with the OS keychain via safeStorage
// (Windows DPAPI, macOS Keychain, Linux libsecret) and never sent to the renderer.
const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const DEFAULT_MODELS = { complex: 'claude-opus-5-5', default: 'claude-sonnet-5-5', quick: 'claude-haiku-5-5' };
const DEFAULTS = { models: DEFAULT_MODELS, maxPromptKB: 600, profileName: '', gmail: { clientId: '', account: '' } };

class Config {
  constructor(dir) {
    this.file = path.join(dir, 'config.json');
    this.secretFile = path.join(dir, 'secrets.json');
    this.data = { ...DEFAULTS, ...read(this.file) };
    this.data.gmail = { ...DEFAULTS.gmail, ...(this.data.gmail || {}) };
    this.secrets = read(this.secretFile);
  }
  get() { return this.data; }
  models() { return { ...DEFAULT_MODELS, ...(this.data.models || {}) }; }
  set(patch) { this.data = { ...this.data, ...patch }; write(this.file, this.data); }
  encrypted() { try { return safeStorage.isEncryptionAvailable(); } catch { return false; } }
  secret(name) {
    const v = this.secrets[name]; if (!v) return '';
    try {
      if (v.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
      if (v.startsWith('b64:')) return Buffer.from(v.slice(4), 'base64').toString('utf8');
    } catch {}
    return '';
  }
  setSecret(name, value) {
    if (!value) delete this.secrets[name];
    else this.secrets[name] = this.encrypted() ? 'enc:' + safeStorage.encryptString(value).toString('base64') : 'b64:' + Buffer.from(value, 'utf8').toString('base64');
    write(this.secretFile, this.secrets, 0o600);
  }
}
function read(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return {}; } }
function write(f, obj, mode) {
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1), mode ? { mode } : undefined);
  fs.renameSync(tmp, f);
}

module.exports = { Config, DEFAULT_MODELS };
