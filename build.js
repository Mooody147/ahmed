// node build.js          -> dist/action-register.html (single-file web / artifact build)
// node build.js desktop  -> app/ (Electron renderer: index.html + scripts + bundled libraries and fonts)
const fs = require('fs');
const path = require('path');
const svg = (d, s = 18) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ic = { I_TODO: svg('<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 3 3 5-6"/>'), BRAND: svg('<path d="M12 3c3.3 4 6 7.2 6 10.4a6 6 0 0 1-12 0C6 10.2 8.7 7 12 3z"/><path d="m9.3 13.6 1.9 1.9 3.6-4.1"/>'), I_LIST: svg('<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'), I_REVIEW: svg('<path d="M4 4h16v12H5.5L4 17.5z"/><path d="m8.5 10 2.2 2.2L15.5 7.5"/>'), I_UPLOAD: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'), I_MAIL: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>'), I_GEAR: svg('<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>') };
const read = f => fs.readFileSync(f, 'utf8');
let h = read('src/shell.html');
for (const [k, v] of Object.entries(ic)) h = h.split('/*' + k + '*/').join(v);

if (process.argv[2] !== 'desktop') {
  const out = h.replace('/*STYLE*/', () => read('src/style.css')).replace('/*CORE*/', () => read('src/core.js')).replace('/*APP*/', () => read('src/app.js'));
  fs.mkdirSync('dist', { recursive: true }); fs.writeFileSync('dist/action-register.html', out); console.log('built dist/action-register.html', out.length);
  return;
}

/* ---------- desktop renderer ---------- */
const OUT = 'app';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'vendor'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'fonts', 'files'), { recursive: true });
const VENDOR = ['pdfjs-dist/build/pdf.min.js', 'pdfjs-dist/build/pdf.worker.min.js', 'xlsx/dist/xlsx.full.min.js', 'mammoth/mammoth.browser.min.js', 'jszip/dist/jszip.min.js'];
for (const v of VENDOR) fs.copyFileSync(require.resolve(v), path.join(OUT, 'vendor', path.basename(v)));

// IBM Plex fonts from @fontsource (same families and weights as the Google Fonts link in the web build)
const FONTS = { 'ibm-plex-mono': [400, 500], 'ibm-plex-sans-condensed': [500, 600, 700], 'ibm-plex-sans': [400, 500, 600] };
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
for (const f of ['style.css', 'core.js', 'app.js', 'platform.js']) fs.copyFileSync(path.join('src', f), path.join(OUT, f));
console.log('built app/ (desktop renderer)');
