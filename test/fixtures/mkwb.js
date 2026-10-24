// Builds test/fixtures/out/demo-pipe-tool.xlsx and demo-tool.html for the workbook tests (no private files needed).
const ExcelJS = require('exceljs'); const fs = require('fs'); const path = require('path');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const wb = new ExcelJS.Workbook();
  const cover = wb.addWorksheet('Cover');
  cover.getCell('B2').value = 'DEMO  PIPE  TOOL'; cover.getCell('B3').value = 'bore and velocity from material, size and flow';
  cover.getCell('B5').value = 'A small demo workbook used by the tests: pick a material and a size, enter a flow, and the sheet reads the bore from the library and checks the velocity against the limit for that material.';
  cover.getCell('B10').value = 'Author / Developer'; cover.getCell('C10').value = 'Test Engineer'; cover.getCell('B13').value = 'Revision'; cover.getCell('C13').value = 'R1';
  const lib = wb.addWorksheet('Library');
  lib.addRow(['Material', 'DN', 'ID (mm)', 'Vmax (m/s)', 'key']);
  for (const [m, dn, id, v] of [['DI', 100, 106, 2], ['DI', 150, 158, 2], ['DI', 200, 209.4, 2], ['HDPE', 110, 90, 1.5], ['HDPE', 160, 130.8, 1.5]]) lib.addRow([m, dn, id, v, `${m}|${dn}`]);
  lib.getRow(1).font = { bold: true };
  const lists = wb.addWorksheet('Lists'); lists.getCell('A1').value = 'DI'; lists.getCell('A2').value = 'HDPE';
  wb.definedNames.add('Lists!$A$1:$A$2', 'MAT_LIST');
  const ws = wb.addWorksheet('Calc');
  const yellow = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
  ws.getColumn(2).width = 30; ws.getColumn(3).width = 16; ws.getColumn(4).width = 40;
  ws.getCell('B2').value = 'DEMO PIPE TOOL'; ws.getCell('B2').font = { bold: true, size: 14 }; ws.mergeCells('B2:D2');
  const rows = [['Material', 'DI'], ['DN (mm)', 150], ['Flow (m³/h)', 100]];
  rows.forEach(([l, v], i) => { const r = 4 + i; ws.getCell('B' + r).value = l; ws.getCell('C' + r).value = v; ws.getCell('C' + r).fill = yellow; });
  ws.getCell('C4').dataValidation = { type: 'list', allowBlank: false, formulae: ['MAT_LIST'] };
  ws.getCell('C5').dataValidation = { type: 'list', allowBlank: false, formulae: ['"100,110,150,160,200"'] };
  const out = [['Internal diameter (mm)', 'IFERROR(INDEX(Library!$C$2:$C$6,MATCH($C$4&"|"&$C$5,Library!$E$2:$E$6,0)),"—")', '0.0'],
    ['Velocity (m/s)', 'IF(ISNUMBER(C8),C6/3600/(PI()*(C8/1000)^2/4),"—")', '0.00'],
    ['Limit (m/s)', 'IFERROR(INDEX(Library!$D$2:$D$6,MATCH($C$4&"|"&$C$5,Library!$E$2:$E$6,0)),"—")', '0.0'],
    ['Check', 'IF(NOT(ISNUMBER(C9)),"✗ size not made",IF(C9<=C10,"✓ OK — "&TEXT(C9,"0.00")&" m/s","⚠ high — "&TEXT(C9,"0.00")&" m/s"))', '@']];
  out.forEach(([l, f, nf], i) => { const r = 8 + i; ws.getCell('B' + r).value = l; ws.getCell('C' + r).value = { formula: f }; ws.getCell('C' + r).numFmt = nf; });
  ws.getCell('B13').value = 'Count of DI sizes'; ws.getCell('C13').value = { formula: 'COUNTIF(Library!A2:A6,"DI")' };
  await wb.xlsx.writeFile(path.join(OUT, 'demo-pipe-tool.xlsx'));
  fs.writeFileSync(path.join(OUT, 'demo-tool.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Demo Web Tool</title><meta name="description" content="A tiny web tool that keeps saved cases."></head><body>
<h1>Demo Web Tool</h1><p id="n">…</p><button id="save">Save case</button><script>
(async () => { const db = window.claude ? await window.claude.use('db') : null; const user = window.claude ? await window.claude.use('user') : null;
  document.title = 'Demo Web Tool'; if (!db) { document.getElementById('n').textContent = 'no db'; return; }
  db.collection('cases').orderBy('at', 'desc').limit(50).onSnapshot(s => { document.getElementById('n').textContent = s.docs.length + ' cases by ' + (s.docs[0] ? s.docs[0].data().by : '-'); });
  document.getElementById('save').onclick = async () => { await db.collection('cases').add({ at: new Date().toISOString(), by: await user.id(), name: 'Case' }); };
})();</script></body></html>`);
  console.log('fixtures written to', OUT);
})();
