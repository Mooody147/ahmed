'use strict';
// Narrow bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['db:load', 'db:get', 'db:set', 'db:delete', 'sample:json', 'sample:abort', 'claude:test', 'config:claude',
  'gmail:call', 'gmail:connect', 'gmail:connect-imap', 'gmail:disconnect', 'downloads:save', 'shell:openData', 'shell:openPath', 'shell:openExternal',
  'sys:prefs', 'sys:choose-folder', 'sys:notify', 'backup:write', 'data:move', 'lock:set', 'lock:check', 'update:install',
  'ui:titlebar', 'ui:zoom', 'print:pdf', 'capture:png', 'watch:ready', 'watch:done',
  'files:save', 'files:load', 'files:info', 'files:remove', 'files:list', 'files:open', 'files:copyTo', 'files:pickFolder', 'files:openFolder', 'htmltool:open', 'outlook:open', 'ai:config', 'ai:key', 'ai:models', 'ai:test', 'ai:plan-login', 'ai:plan-status', 'ai:plan-connect', 'nb:scan', 'nb:read', 'nb:open', 'cloud:connect', 'cloud:signin', 'cloud:signout', 'cloud:sync', 'cloud:prefs', 'cloud:sql', 'cloud:share', 'cloud:unshare', 'mail:send', 'win:open']);
const EVENTS = new Set(['db:remote', 'cloud:status', 'cloud:reload', 'sample:text', 'sample:usage', 'quick-add', 'gmail-check', 'nav', 'import:file', 'update:ready']);

contextBridge.exposeInMainWorld('arDesktop', {
  status: () => ipcRenderer.sendSync('desktop:status'),
  invoke: (channel, arg) => {
    if (!CHANNELS.has(channel)) return Promise.resolve({ ok: false, error: { code: 'forbidden', message: channel } });
    return ipcRenderer.invoke(channel, arg);
  },
  on: (event, cb) => { if (EVENTS.has(event)) ipcRenderer.on(event, (_e, m) => cb(m)); },
  onSampleText: cb => { ipcRenderer.on('sample:text', (_e, m) => cb(m)); },
});
