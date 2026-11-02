'use strict';
// Notebook sources on this PC: list the files of a folder you picked (and its subfolders), read one, open one.
// Reading the text out of the files happens in the window, with the same readers as for email attachments.
const fs = require('fs');
const path = require('path');

const SKIP_DIRS = /^(\.git|\.svn|node_modules|\$RECYCLE\.BIN|System Volume Information|__pycache__|\.cache|AppData)$/i;
const EXTS = /\.(pdf|docx|doc|xlsx|xlsm|xls|csv|txt|md|json|xml|html?|eml|msg|pptx|rtf|odt|log|ini|cfg|ya?ml)$/i;
const MAX_FILES = 3000, MAX_BYTES = 60 * 1024 * 1024;

async function scan(folder) {
  const out = []; let skipped = 0;
  async function walk(dir, depth) {
    if (depth > 12 || out.length >= MAX_FILES) return;
    let items = []; try { items = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (out.length >= MAX_FILES) { skipped++; continue; }
      const p = path.join(dir, it.name);
      if (it.isDirectory()) { if (!SKIP_DIRS.test(it.name) && !it.name.startsWith('~')) await walk(p, depth + 1); continue; }
      if (!it.isFile() || it.name.startsWith('~$') || !EXTS.test(it.name)) continue;
      try { const st = await fs.promises.stat(p); if (st.size > MAX_BYTES) { skipped++; continue; } out.push({ path: p, rel: path.relative(folder, p), name: it.name, size: st.size, mtime: Math.round(st.mtimeMs) }); } catch {}
    }
  }
  await walk(folder, 0);
  return { files: out, skipped, capped: out.length >= MAX_FILES };
}
const inside = (p, roots) => roots.some(r => { if (!r) return false; const a = path.resolve(r), b = path.resolve(p); return b === a || b.startsWith(a + path.sep); });

module.exports = { scan, inside, EXTS };
