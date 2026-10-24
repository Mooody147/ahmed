'use strict';
// Narrow bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

const CHANNELS = new Set(['db:load', 'db:get', 'db:set', 'db:delete', 'sample:json', 'sample:abort', 'claude:test', 'config:claude',
  'gmail:call', 'gmail:connect', 'gmail:connect-imap', 'gmail:disconnect', 'downloads:save', 'shell:openData', 'shell:openExternal']);

contextBridge.exposeInMainWorld('arDesktop', {
  status: () => ipcRenderer.sendSync('desktop:status'),
  invoke: (channel, arg) => {
    if (!CHANNELS.has(channel)) return Promise.resolve({ ok: false, error: { code: 'forbidden', message: channel } });
    return ipcRenderer.invoke(channel, arg);
  },
  onSampleText: cb => { ipcRenderer.on('sample:text', (_e, m) => cb(m)); },
});
