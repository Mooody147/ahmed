// Statements for the Money tests: node test/fin_fixtures.js <dir>
// Bank A (current, CSV): August–September; the same file again; then August–November with one corrected line.
// Bank B (current, Excel): receives the transfer from A. Card (text PDF): purchases and the payment from A.
// Bank B again from another source (CSV, other wording, no balances): one line that may be a repeat.
const fs = require('fs'), path = require('path'), XLSX = require('xlsx'), { PDFDocument, StandardFonts } = require('pdf-lib');
const dir = process.argv[2]; fs.mkdirSync(dir, { recursive: true });
const csv = rows => rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n') + '\n';
const head = per => [['Bank of Test — Statement of account'], ['Account No: 1002003004', 'Currency: EGP'], [`Period from ${per}`], ['Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '', '20,000.00']];
const A = [
  ['01/08/2026', 'SALARY AUGUST ACME CO', 'R100', '', '30,000.00', '50,000.00'],
  ['03/08/2026', 'POS CARREFOUR MAADI 4455', 'R101', '1,200.00', '', '48,800.00'],
  ['05/08/2026', 'POS COSTA COFFEE ZAMALEK', 'R102', '80.00', '', '48,720.00'],
  ['05/08/2026', 'POS COSTA COFFEE ZAMALEK', 'R103', '80.00', '', '48,640.00'],
  ['10/08/2026', 'NETFLIX.COM', 'R104', '250.00', '', '48,390.00'],
  ['15/08/2026', 'TRANSFER TO OWN ACCOUNT 5566', 'R105', '10,000.00', '', '38,390.00'],
  ['20/08/2026', 'CREDIT CARD PAYMENT', 'R106', '5,300.00', '', '33,090.00'],
  ['25/08/2026', 'TRANSFER FROM AHMED MOHAMED', 'R107', '', '100,000.00', '133,090.00'],
  ['26/08/2026', 'CERTIFICATE INTEREST', 'R108', '', '900.00', '133,990.00'],
  ['28/08/2026', 'CASH WITHDRAWAL ATM', 'R109', '60,000.00', '', '73,990.00'],
  ['01/09/2026', 'SALARY SEPTEMBER ACME CO', 'R110', '', '30,000.00', '103,990.00'],
  ['03/09/2026', 'POS CARREFOUR MAADI 4455', 'R111', '1,500.00', '', '102,490.00'],
  ['05/09/2026', 'REFUND CARREFOUR MAADI', 'R112', '', '200.00', '102,690.00'],
  ['10/09/2026', 'NETFLIX.COM', 'R113', '250.00', '', '102,440.00'],
  ['26/09/2026', 'CERTIFICATE INTEREST', 'R114', '', '900.00', '103,340.00'],
  ['xx/09/2026', 'SMUDGED LINE', 'R115', '??', '', ''],
];
const more = [
  ['01/10/2026', 'SALARY OCTOBER ACME CO', 'R116', '', '30,000.00', '133,340.00'],
  ['04/10/2026', 'POS CARREFOUR MAADI 4455', 'R117', '1,300.00', '', '132,040.00'],
  ['10/10/2026', 'NETFLIX.COM', 'R118', '250.00', '', '131,790.00'],
  ['26/10/2026', 'CERTIFICATE INTEREST', 'R119', '', '900.00', '132,690.00'],
  ['01/11/2026', 'SALARY NOVEMBER ACME CO', 'R120', '', '30,000.00', '162,690.00'],
];
fs.writeFileSync(path.join(dir, 'bankA_aug-sep.csv'), csv([...head('01/08/2026 to 30/09/2026'), ...A, ['', 'Closing balance', '', '', '', '103,340.00']]));
fs.copyFileSync(path.join(dir, 'bankA_aug-sep.csv'), path.join(dir, 'bankA_aug-sep (copy).csv'));
const Ax = A.map(r => r[2] === 'R104' ? [r[0], 'NETFLIX.COM SUBSCRIPTION', ...r.slice(2)] : r);
fs.writeFileSync(path.join(dir, 'bankA_aug-nov.csv'), csv([...head('01/08/2026 to 30/11/2026'), ...Ax, ...more, ['', 'Closing balance', '', '', '', '162,690.00']]));
// Bank B as an Excel workbook
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Account statement — A/C 5566'], [], ['Txn Date', 'Narration', 'Withdrawal', 'Deposit', 'Closing Balance'],
  ['16/08/2026', 'INCOMING TRANSFER FROM A/C 1002003004', '', 10000, 10000], ['20/08/2026', 'UBER TRIP', 150, '', 9850], ['02/09/2026', 'VODAFONE BILL', 400, '', 9450]]), 'Statement');
fs.writeFileSync(path.join(dir, 'bankB_aug-sep.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
fs.writeFileSync(path.join(dir, 'bankB_export.csv'), csv([['Date', 'Details', 'Amount'], ['20/08/2026', 'Uber Ride Cairo', '-150.00'], ['25/08/2026', 'EL EZABY PHARMACY', '-220.00']]));
(async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), pg = doc.addPage([595, 842]);
  const lines = ['Card statement   Card number: 4111 **** **** 7788   Currency EGP', 'Statement period from 01/08/2026 to 31/08/2026', 'Date   Description   Amount   Balance', 'Opening balance   0.00',
    '03/08/2026   AMAZON EG   5,000.00   5,000.00', '12/08/2026   TALABAT   300.00   5,300.00', '21/08/2026   PAYMENT RECEIVED THANK YOU   5,300.00   0.00', 'Closing balance   0.00'];
  lines.forEach((l, i) => pg.drawText(l, { x: 40, y: 790 - i * 22, size: 10, font }));
  fs.writeFileSync(path.join(dir, 'card_aug.pdf'), await doc.save());
  // a photo of a statement (any image: the test's Claude stand-in answers for it)
  fs.writeFileSync(path.join(dir, 'statement_photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  console.log('fixtures in', dir);
})();
