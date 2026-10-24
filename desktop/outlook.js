'use strict';
// Open an email in Outlook. On Windows with classic Outlook the message itself is found in your mailbox
// (by its Internet Message-ID, else by subject + sender + date) and shown. Otherwise the saved copy of the
// email (.msg / .eml) opens with the program Windows uses for it, which is Outlook when it is installed.
const { execFile } = require('child_process');

// PowerShell + Outlook COM. Inputs travel as base64 JSON so nothing in them is interpreted by the shell.
const SCRIPT = `
$ErrorActionPreference = 'Stop'
$q = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__ARG__')) | ConvertFrom-Json
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { try { $ol = New-Object -ComObject Outlook.Application } catch { 'NO_OUTLOOK'; exit } }
$ns = $ol.GetNamespace('MAPI')
$found = $null
function Search($folder, $depth) {
  if ($script:found -or $depth -gt 6) { return }
  try {
    if ($q.messageId) {
      $f = '@SQL="http://schemas.microsoft.com/mapi/proptag/0x1035001F" = ''' + ($q.messageId -replace "'", "''") + ''''
      $r = $folder.Items.Restrict($f); if ($r.Count -gt 0) { $script:found = $r.Item(1); return }
    }
    if ($q.subject -and $q.from) {
      $s = ($q.subject -replace '^(?i)(re|fw|fwd)\\s*:\\s*', '') -replace "'", "''"
      $f = '@SQL="urn:schemas:httpmail:subject" LIKE ''%' + $s + '%'''
      $r = $folder.Items.Restrict($f)
      foreach ($it in $r) { try { if ($it.SenderEmailAddress -like ('*' + $q.from + '*') -and ([Math]::Abs(($it.ReceivedTime - [datetime]$q.date).TotalHours) -lt 48)) { $script:found = $it; return } } catch {} }
    }
  } catch {}
  foreach ($sub in $folder.Folders) { Search $sub ($depth + 1); if ($script:found) { return } }
}
foreach ($store in $ns.Stores) { try { Search $store.GetRootFolder() 0 } catch {}; if ($found) { break } }
if ($found) { $found.Display(); 'FOUND' } else { 'NOT_FOUND' }
`;

function findInOutlook(q, timeoutMs = 45000) {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve('NOT_WINDOWS');
    const arg = Buffer.from(JSON.stringify({ messageId: q.messageId || '', subject: q.subject || '', from: q.from || '', date: q.date || '' }), 'utf8').toString('base64');
    const enc = Buffer.from(SCRIPT.replace('__ARG__', arg), 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', enc], { windowsHide: true, timeout: timeoutMs }, (err, stdout) => {
      const out = String(stdout || '').trim().split(/\r?\n/).pop() || '';
      resolve(err && !out ? 'ERROR' : out || 'ERROR');
    });
  });
}

module.exports = { findInOutlook, SCRIPT };
