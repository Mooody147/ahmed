// Workbook engine: formulas, lookups, arrays, formats and row edits checked against Excel's results.
const assert = require('assert');
const W = require('../../src/wb/engine.js');
let n = 0;
const sheet = (cells) => Object.fromEntries(Object.entries(cells).map(([a, v]) => { const p = W.parseAddr(a); return [p.r + ',' + p.c, typeof v === 'string' && v.startsWith('=') ? { f: v.slice(1) } : { v }]; }));
const book = (sheets, names, styles) => new W.Book({ sheets: Object.entries(sheets).map(([name, cells]) => ({ name, cells: sheet(cells), maxR: 50, maxC: 10, dv: [] })), names: names || {}, styles: styles || [] });
const eq = (b, s, a, want) => { const p = W.parseAddr(a); const got = b.value(s, p.r, p.c); const g = W.isErr(got) ? got.e : got; n++; if (typeof want === 'number') assert.ok(Math.abs(g - want) < 1e-9, `${s}!${a}: got ${JSON.stringify(g)} want ${want}`); else assert.deepStrictEqual(g, want, `${s}!${a}`); };

const lib = { A1: 'Material', B1: 'DN', C1: 'ID', A2: 'DI', B2: 100, C2: 106, A3: 'DI', B3: 150, C3: 158, A4: 'DI', B4: 200, C4: 209.4, A5: 'PE', B5: 110, C5: 90, A6: 'PE', B6: 160, C6: 130.8 };
const b = book({
  Lib: lib,
  Calc: {
    A1: 'DI', B1: 150, B2: '=VLOOKUP(B1,Lib!B2:C6,2,FALSE)', B3: '=INDEX(Lib!C2:C6,MATCH(A1&"|"&B1,Lib!A2:A6&"|"&Lib!B2:B6,0))',
    B4: '=SUMPRODUCT((Lib!A2:A6="DI")*(Lib!C2:C6))', B5: '=COUNTIF(Lib!A2:A6,"DI")', B6: '=IFERROR(VLOOKUP(999,Lib!B2:C6,2,FALSE),"—")',
    B7: '=MATCH(180,Lib!B2:B4,1)', B8: '=CEILING(1.0334-0.0005,0.05)', B9: '=MROUND(1.4123,0.05)', B10: '=TEXT(0.18777,"0.000")&" m"',
    B11: '=IF(AND(B2>100,B2<200),"✓ OK","✗ NO")', B12: '=ROUND(2.5,0)+ROUND(-2.5,0)', B13: '=SUMIFS(Lib!C2:C6,Lib!A2:A6,"PE",Lib!B2:B6,">120")',
    B14: '=INDEX(Lib!A1:C6,3,2)', B15: '=LEFT("Ductile",3)&LEN("abc")', B16: '=TEXT(46318,"dd-mmm-yyyy")', B17: '=SQRT(4*(1100/3600)/(PI()*15))*1000',
    B18: '=INDIRECT("Lib!C"&3)', B19: '=SUM(INDIRECT("DNS"))', B20: '=-2^2', B21: '="a"="A"', B22: '=1/0', B23: '=IFERROR(B22,"div")',
    B24: '=ISNUMBER(MATCH("PE",Lib!A2:A6,0))', B25: '=MAX(IF(Lib!A2:A6="DI",Lib!C2:C6))', B26: '=TEXT(0.0286,"+0.0%;-0.0%;0.0%")', B27: '=""&B1',
    B28: '=N(Lib!B2:B6)', B29: '=COUNTA(Lib!A1:A9)', B30: '=AVERAGE(Lib!B2:B4)', B31: '=TEXT("","0")', B32: '=""+1',
  },
}, { DNS: 'Lib!$B$2:$B$4' });
b.sheet('Calc').cells.set('25,2', { f: 'MAX(IF(Lib!A2:A6="DI",Lib!C2:C6))', a: true });
eq(b, 'Calc', 'B2', 158); eq(b, 'Calc', 'B3', 158); eq(b, 'Calc', 'B4', 473.4); eq(b, 'Calc', 'B5', 3); eq(b, 'Calc', 'B6', '—');
eq(b, 'Calc', 'B7', 2); eq(b, 'Calc', 'B8', 1.05); eq(b, 'Calc', 'B9', 1.4); eq(b, 'Calc', 'B10', '0.188 m'); eq(b, 'Calc', 'B11', '✓ OK');
eq(b, 'Calc', 'B12', 0); eq(b, 'Calc', 'B13', 130.8); eq(b, 'Calc', 'B14', 150); eq(b, 'Calc', 'B15', 'Duc3'); eq(b, 'Calc', 'B16', '23-Oct-2026');
eq(b, 'Calc', 'B17', 161.0476982029145); eq(b, 'Calc', 'B18', 158); eq(b, 'Calc', 'B19', 450); eq(b, 'Calc', 'B20', 4); eq(b, 'Calc', 'B21', true);
eq(b, 'Calc', 'B22', '#DIV/0!'); eq(b, 'Calc', 'B23', 'div'); eq(b, 'Calc', 'B24', true); eq(b, 'Calc', 'B25', 209.4); eq(b, 'Calc', 'B26', '+2.9%');
eq(b, 'Calc', 'B27', '150'); eq(b, 'Calc', 'B28', 100); eq(b, 'Calc', 'B29', 6); eq(b, 'Calc', 'B30', 150); eq(b, 'Calc', 'B31', ''); eq(b, 'Calc', 'B32', '#VALUE!');
// inputs change the results
b.setInput('Calc', 2, 1, 'DI'); b.setInput('Calc', 1, 2, 200); eq(b, 'Calc', 'B2', 209.4); eq(b, 'Calc', 'B11', '✗ NO');
// a library edit flows through
b.setInput('Lib', 4, 3, 210); eq(b, 'Calc', 'B2', 210);
// add a row at the end of the table: ranges that end there grow (insert below), and references move
b.shiftRows('Lib', 7, 1, true); b.setInput('Lib', 7, 1, 'PE'); b.setInput('Lib', 7, 2, 200); b.setInput('Lib', 7, 3, 163.6);
b.setInput('Calc', 1, 2, 200); b.setInput('Calc', 1, 1, 'PE');
assert.strictEqual(b.cell('Calc', 2, 2).f, 'VLOOKUP(B1,Lib!B2:C7,2,FALSE)'); n++;
eq(b, 'Calc', 'B5', 3); eq(b, 'Calc', 'B13', 294.4);
// delete a row inside the table: ranges shrink
b.deleteRows('Lib', 2, 1); assert.strictEqual(b.cell('Calc', 5, 2).f, 'COUNTIF(Lib!A2:A6,"DI")'); eq(b, 'Calc', 'B5', 2);
assert.strictEqual(b.names.get('dns').text, 'Lib!$B$2:$B$3'); n++;
// number formats
const F = W.formatNumber;
for (const [v, f, want] of [[1234.5, '#,##0.0', '1,234.5'], [0.98, '0%', '98%'], [-0.6, '+0.0;-0.0;0.0', '-0.6'], [2.77, '0.0#', '2.77'], [12345.678, '0.00E+00', '1.23E+04'], [5, '"DN "0', 'DN 5'], [0.5, '0.00', '0.50'], [1e6, '#,##0', '1,000,000'], [46318, 'dd mmmm yyyy', '23 October 2026']]) { n++; assert.strictEqual(F(v, f), want, `${v} ${f}`); }
// parse ↔ unparse round trip
for (const f of ["IF($A$1>0,SUM('My Sheet'!A1:B2)*-2,\"x\")", 'INDEX(Library!$E$2:$E$591,MATCH($N$1,Library!$H$2:$H$591,0))', 'A:A', 'SUM(1:3)']) { n++; assert.strictEqual(W.unparse(W.parse(f)), f.replace(/'My Sheet'/, "'My Sheet'")); }
console.log(`workbook engine: ${n} checks passed`);
