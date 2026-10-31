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
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Account statement — A/C 7005566'], [], ['Txn Date', 'Narration', 'Withdrawal', 'Deposit', 'Closing Balance'],
  ['16/08/2026', 'INCOMING TRANSFER FROM A/C 1002003004', '', 10000, 10000], ['20/08/2026', 'UBER TRIP', 150, '', 9850], ['02/09/2026', 'VODAFONE BILL', 400, '', 9450]]), 'Statement');
fs.writeFileSync(path.join(dir, 'bankB_aug-sep.xlsx'), XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
fs.writeFileSync(path.join(dir, 'bankB_export.csv'), csv([['Account: 7005566'], ['Date', 'Details', 'Amount'], ['20/08/2026', 'Uber Ride Cairo', '-150.00'], ['25/08/2026', 'EL EZABY PHARMACY', '-220.00']]));
(async () => {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica), pg = doc.addPage([595, 842]);
  const lines = ['Card statement   Card number: 4111 **** **** 7788   Currency EGP', 'Statement period from 01/08/2026 to 31/08/2026', 'Date   Description   Amount   Balance', 'Opening balance   0.00',
    '03/08/2026   AMAZON EG   5,000.00   5,000.00', '12/08/2026   TALABAT   300.00   5,300.00', '21/08/2026   PAYMENT RECEIVED THANK YOU   5,300.00   0.00', 'Closing balance   0.00'];
  lines.forEach((l, i) => pg.drawText(l, { x: 40, y: 790 - i * 22, size: 10, font }));
  fs.writeFileSync(path.join(dir, 'card_aug.pdf'), await doc.save());
  // card statements laid out like a real bank's (columns at fixed positions; all figures invented)
  const cardPdf = async (name, facts, lines) => {
    const d = await PDFDocument.create(), f = await d.embedFont(StandardFonts.Helvetica), pg = d.addPage([595, 842]);
    const T = (x, y, t) => pg.drawText(String(t), { x, y, size: 8, font: f });
    T(464, 745, 'as of 29 October 2026 08:47:01'); T(31, 705, 'Statement Details'); T(31, 682, 'Card Number'); T(173, 682, '512345******1111');
    T(31, 659, 'Opening Balance'); T(173, 659, facts.open); T(300, 659, 'Closing Balance'); T(442, 659, facts.close);
    T(31, 635, 'Total of Credit'); T(173, 635, '0.00'); T(300, 635, 'Total of Debit'); T(442, 635, '0.00');
    T(31, 611, 'Due Date'); T(173, 611, facts.due); T(300, 611, 'Credit Limit'); T(442, 611, '50400');
    T(31, 587, 'Minimum Payment Due'); T(173, 587, facts.min); T(300, 587, 'Statement Date'); T(442, 587, facts.date);
    [[32, 'Transaction Date'], [109, 'Posting Date'], [185, 'Description'], [341, 'Debit'], [392, 'Credit'], [443, 'Original'], [486, 'Posting'], [528, 'Auth Code']].forEach(([x, t]) => T(x, 543, t));
    T(443, 533, 'Currency'); T(486, 533, 'Amount');
    lines.forEach(([dt, desc, deb, cr, cur, post], i) => { const y = 517 - i * 16; T(31, y, dt); T(108, y, dt); T(184, y, desc); if (deb) T(340, y, deb); if (cr) T(391, y, cr); T(442, y, cur || 'EGP'); T(485, y, post || deb || cr); });
    T(31, 40, 'Page No. 1');
    fs.writeFileSync(path.join(dir, name), await d.save());
  };
  await cardPdf('CARD_AUG.pdf', { open: '1000.00', close: '6580.00', due: '27 September 2026', min: '300', date: '31 August 2026' }, [
    ['30 August 2026', 'SHOP ONE EGY 05 OF 12', '3000.00'], ['20 August 2026', 'TALABAT CAIRO', '580.00'], ['15 August 2026', 'FUEL STATION', '500.00'],
    ['10 August 2026', 'SOFTWARE SUB SAN', '20.00', '', 'USD', '1000.00'], ['01 August 2026', 'EB-00CC1-CARD PAYMENT', '', '1000.00'], ['01 August 2026', 'GOLDS GYM', '1500.00']]);
  await cardPdf('CARD_SEP.pdf', { open: '6580.00', close: '7960.00', due: '27 October 2026', min: '400', date: '30 September 2026' }, [
    ['30 September 2026', 'SHOP ONE EGY 06 OF 12', '3000.00'], ['22 September 2026', 'TALABAT CAIRO', '700.00'], ['05 September 2026', 'NETFLIX.COM', '260.00'],
    ['01 September 2026', 'EB-00CC1-CARD PAYMENT', '', '6580.00'], ['01 September 2026', 'SMART MARKET', '4000.00']]);
  // the primary account (ending 0012): salary, a deposit that is someone else's, a card payment
  fs.writeFileSync(path.join(dir, 'primary_0012.csv'), csv([['NBE — Statement'], ['Account No: 9900000012'], ['Period from 01/09/2026 to 30/09/2026'], ['Date', 'Description', 'Debit', 'Credit', 'Balance'], ['', 'Opening balance', '', '', '20,000.00'],
    ['01/09/2026', 'SALARY SEPTEMBER', '', '30,000.00', '50,000.00'], ['01/09/2026', 'CARD PAYMENT 1111', '6,580.00', '', '43,420.00'], ['10/09/2026', 'TRANSFER FROM ALI HASSAN', '', '10,000.00', '53,420.00'], ['12/09/2026', 'INSTAPAY TRANSFER IN', '', '5,000.00', '58,420.00'], ['15/09/2026', 'CARREFOUR MAADI', '2,000.00', '', '56,420.00'],
    ['', 'Closing balance', '', '', '56,420.00']]));
  // a photo of a statement (any image: the test's Claude stand-in answers for it)
  fs.writeFileSync(path.join(dir, 'statement_photo.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  console.log('fixtures in', dir);
})();
