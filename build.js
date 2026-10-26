// node build.js          -> dist/action-register.html (single-file web / artifact build)
// node build.js desktop  -> app/ (Electron renderer: index.html + scripts + bundled libraries and fonts)
const fs = require('fs');
const path = require('path');
const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ic = { I_TODO: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'), BRAND: svg('<path d="M12 3c3.3 4 6 7.2 6 10.4a6 6 0 0 1-12 0C6 10.2 8.7 7 12 3z"/><path d="m9.3 13.6 1.9 1.9 3.6-4.1"/>'), I_LIST: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'), I_REVIEW: svg('<path d="M4 4h16v12H5.5L4 17.5z"/><path d="m8.5 10 2.2 2.2L15.5 7.5"/>'), I_UPLOAD: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'), I_MAIL: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'), I_DOCS: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M8.5 13h7M8.5 16.5h5"/>'), I_CHART: svg('<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>'), I_CAL: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h7"/>'), I_BOOK: svg('<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11M9 8h6"/>'), I_MONEY: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>'), I_TOOLS: svg('<path d="M14.5 6.5a4 4 0 0 0-5.3 5L4 16.7 7.3 20l5.2-5.2a4 4 0 0 0 5-5.3l-2.6 2.6-2.4-.6-.6-2.4z"/>'), I_MORE: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'), I_SEARCH: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>', 15), I_DAY: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="m9 15 2 2 4-4"/>'), I_GEAR: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>') };
// Windows checkouts may convert to CRLF; the placeholder replacements below expect LF
const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
// app.js plus src/features/*.js (in name order), inserted before app.js's boot section so the
// feature files share its scope (state, helpers, action tables)
function appSource(keep) {
  const app = read('src/app.js'); const mark = '/* ---------- boot ---------- */';
  const i = app.indexOf(mark); if (i < 0) throw new Error('app.js: boot marker missing');
  const dir = 'src/features';
  const parts = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js') && (!keep || keep.includes(f.slice(0, 2)))).sort().map(f => `/* ===== features/${f} ===== */\n` + read(path.join(dir, f))) : [];
  return app.slice(0, i) + parts.join('\n') + '\n' + app.slice(i);
}
// the workbook engine and converter run next to core.js (they set globalThis.WBE / WBC)
const coreSource = () => read('src/wb/engine.js') + '\n' + read('src/wb/convert.js') + '\n' + read('src/core.js');
let h = read('src/shell.html');
for (const [k, v] of Object.entries(ic)) h = h.split('/*' + k + '*/').join(v);

// node build.js lite -> dist/action-register-lite.html: only tasks, the canvas and reading emails (a claude.ai
// artifact you open on any device; data in your Claude account, emails read by your Claude plan, Gmail through
// the claude.ai Gmail connector)
if (process.argv[2] === 'lite') {
  const KEEP = ['00', '01', '02', '03', '04', '05', '12', '22', '23', '24', '25', '26'];
  const NAV_OFF = ['daily', 'docs', 'insights', 'plan', 'notebook', 'money', 'tools'];
  const lite = h.split('\n').filter(l => !NAV_OFF.some(v => l.includes(`data-nav="${v}"`))).join('\n');
  const out = lite.replace('/*STYLE*/', () => read('src/style.css')).replace('/*CORE*/', () => 'const AR_LITE = true;\n' + coreSource()).replace('/*APP*/', () => appSource(KEEP));
  fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/action-register-lite.html', out); console.log('built dist/action-register-lite.html', out.length);
  return;
}
if (process.argv[2] !== 'desktop') {
  const out = h.replace('/*STYLE*/', () => read('src/style.css')).replace('/*CORE*/', () => coreSource()).replace('/*APP*/', () => appSource());
  fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/action-register.html', out); console.log('built dist/action-register.html', out.length);
  return;
}

/* ---------- desktop renderer ---------- */
const OUT = 'app';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts', 'files'), { recursive: true });
const VENDOR = ['pdfjs-dist/build/pdf.min.js', 'pdfjs-dist/build/pdf.worker.min.js', 'xlsx/dist/xlsx.full.min.js', 'mammoth/mammoth.browser.min.js', 'jszip/dist/jszip.min.js', 'docx/build/index.umd.js', 'exceljs/dist/exceljs.min.js'];
// resolved by path (some packages, e.g. docx, do not export their browser bundle)
for (const v of VENDOR) fs.copyFileSync(path.join(__dirname, 'node_modules', v), path.join(OUT, 'vendor', path.basename(v)));

// IBM Plex fonts from @fontsource (same families and weights as the Google Fonts link in the web build)
const FONTS = { 'ibm-plex-mono': [400, 500], 'ibm-plex-sans-condensed': [500, 600, 700], 'ibm-plex-sans': [400, 500, 600], 'ibm-plex-sans-arabic': [400, 500, 600] };
let css = '';
for (const [fam, weights] of Object.entries(FONTS)) {
  const dir = path.dirname(require.resolve(`@fontsource/${fam}/package.json`));
  for (const w of weights) {
    const c = read(path.join(dir, `${w}.css`));
    for (const m of c.matchAll(/url\(\.\/files\/([^)]+)\)/g)) fs.copyFileSync(path.join(dir, 'files', m[1]), path.join(OUT, 'fonts', 'files', m[1]));
    css += c + '\n';
  }
}
fs.writeFileSync(path.join(OUT, 'fonts', 'fonts.css'), css);

const CSP = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' data: blob:; worker-src 'self' blob:; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
let d = h.replace(/<link rel="preconnect"[^\n]*\n/, '').replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^\n]*\n/, '<link rel="stylesheet" href="fonts/fonts.css">\n')
  .replace('<style>\n/*STYLE*/\n</style>', '<link rel="stylesheet" href="style.css">')
  .replace('<script>\n/*CORE*/\n</script>\n<script>\n/*APP*/\n</script>', '<script src="platform.js"></script>\n<script src="core.js"></script>\n<script src="app.js"></script>');
if (/\/\*(STYLE|CORE|APP)\*\/|fonts\.googleapis/.test(d)) throw new Error('desktop shell: placeholder not replaced');
d = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n<meta http-equiv="Content-Security-Policy" content="${CSP}">\n<style>[hidden]{display:none!important}body{margin:0}</style>\n${d.replace('<div class="app">', '</head><body>\n<div class="app">')}\n</body></html>\n`;
fs.writeFileSync(path.join(OUT, 'index.html'), d);
for (const f of ['style.css', 'platform.js']) fs.copyFileSync(path.join('src', f), path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'core.js'), coreSource());
fs.writeFileSync(path.join(OUT, 'app.js'), appSource());
console.log('built app/ (desktop renderer)');
