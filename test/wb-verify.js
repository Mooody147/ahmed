// Checks the workbook engine against LibreOffice on a folder of real workbooks (kept outside the repository):
//   node test/wb-verify.js "C:\path\to\workbooks"      (needs LibreOffice's soffice on the PATH)
// Every formula cell is computed by src/wb/engine.js and compared with LibreOffice's recalculated value.
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ExcelJS = require('exceljs'), JSZip = require('jszip');
const WBE = require('../src/wb/engine.js'), WBC = require('../src/wb/convert.js');
const dir = process.argv[2]; if (!dir) { console.error('usage: node test/wb-verify.js <folder>'); process.exit(2); }
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'wbv-'));
const files = fs.readdirSync(dir).filter(f => /\.(xlsx|xlsm|xls)$/i.test(f));
execFileSync('soffice', ['--headless', '--calc', '--convert-to', 'xlsx', '--outdir', out, ...files.map(f => path.join(dir, f))], { stdio: 'ignore' });
(async () => {
  let total = 0, bad = 0;
  for (const f of files) {
    const recalc = path.join(out, f.replace(/\.(xls|xlsm)$/i, '.xlsx'));
    const src = /\.xls$/i.test(f) ? recalc : path.join(dir, f);
    const model = WBC.convert(await WBC.read(ExcelJS, JSZip, fs.readFileSync(src)));
    const ref = await WBC.read(ExcelJS, JSZip, fs.readFileSync(recalc));
    const book = new WBE.Book(model); let nf = 0, nb = 0; const ex = [];
    for (const s of model.sheets) {
      const ws = ref.getWorksheet(s.name);
      for (const [k, c] of Object.entries(s.cells)) {
        if (!c.f || /TODAY|NOW\(|RAND/i.test(c.f)) continue; nf++;
        const [r, col] = k.split(',').map(Number);
        let lo = ws ? ws.getCell(r, col).value : null;
        if (lo && typeof lo === 'object' && !(lo instanceof Date)) lo = lo.error ? { e: lo.error } : lo.result !== undefined ? lo.result : lo.formula !== undefined ? '' : lo.richText ? lo.richText.map(t => t.text).join('') : lo;
        if (lo && lo.error) lo = { e: lo.error }; if (lo instanceof Date) lo = lo.getTime() / 86400000 + 25569;
        const v = book.value(s.name, r, col), me = WBE.isErr(v) ? { e: v.e } : v;
        const ok = lo === null || lo === undefined || lo === '' ? me === null || me === '' || me === 0 || me === false : typeof lo === 'number' ? typeof me === 'number' && Math.abs(me - lo) <= 1e-9 * Math.max(1, Math.abs(lo)) : lo && lo.e ? me && me.e === lo.e : String(me) === String(lo);
        if (!ok) { nb++; if (ex.length < 5) ex.push(`${s.name}!${WBE.addr(r, col)} engine=${JSON.stringify(me)} libreoffice=${JSON.stringify(lo)}`); }
      }
    }
    total += nf; bad += nb; console.log(`${nb ? '✗' : '✓'} ${f}: ${nf} formulas, ${nb} different`); ex.forEach(x => console.log('   ', x));
  }
  console.log(`${total} formulas, ${bad} different`); process.exit(bad ? 1 : 0);
})();
