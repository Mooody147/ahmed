const fs=require('fs'); const {PDFDocument, StandardFonts, rgb}=require('pdf-lib'); const XLSX=require('xlsx');
const docx=require('docx');
(async()=>{
 // 1. text transmittal PDF (2 pages, A4)
 let pdf=await PDFDocument.create(); let f=await pdf.embedFont(StandardFonts.Helvetica);
 let p=pdf.addPage([595,842]);
 const L=(pg,t,y,s=11)=>pg.drawText(t,{x:50,y,size:s,font:f});
 L(p,'TRANSMITTAL TR-ELM-0457',790,16); L(p,'Project: El Mahsama WWTP Expansion (ELM)',760);
 L(p,'Document: ELM-ME-CAL-0012 Rev B  Hydraulic Calculation - RAS Pumps',740);
 L(p,'Review Code: 3 - Revise and Resubmit',720);
 L(p,'Purpose of issue: For Approval',700);
 p=pdf.addPage([595,842]);
 L(p,'Consultant comments',790,14);
 L(p,'C-01: NPSH available calculation shall consider minimum wet well level 2.35 m.',760);
 L(p,'C-02: Provide pump curve for duty point 410 m3/h at 14.5 m TDH.',740);
 L(p,'Resubmission required within 10 days from the date of this transmittal.',710);
 fs.writeFileSync(__dirname+'/fixtures/transmittal.pdf', await pdf.save());
 // 2. A3 drawing pdf
 pdf=await PDFDocument.create(); f=await pdf.embedFont(StandardFonts.Helvetica); p=pdf.addPage([1191,842]);
 p.drawRectangle({x:20,y:20,width:1151,height:802,borderWidth:2,borderColor:rgb(0,0,0)});
 p.drawText('GA - BLOWER BUILDING  DWG ELM-ME-DWG-2104 REV C',{x:800,y:40,size:10,font:f});
 p.drawText('CLOUD 1: Relocate DN300 air header support 1.2 m north (civil to confirm anchor bolts)',{x:100,y:500,size:10,font:f});
 fs.writeFileSync(__dirname+'/fixtures/drawing_A3.pdf', await pdf.save());
 // 3. scanned (image-only) pdf
 pdf=await PDFDocument.create(); const png=await pdf.embedPng(fs.readFileSync(__dirname+'/fixtures/scan.png')); p=pdf.addPage([595,842]); p.drawImage(png,{x:0,y:0,width:595,height:842});
 fs.writeFileSync(__dirname+'/fixtures/scanned.pdf', await pdf.save());
 // 4. CRS xlsx with a cell comment
 const ws=XLSX.utils.aoa_to_sheet([['CRS - ELM-ME-SPC-0031 Valves Specification Rev A'],[],['No.','Clause','Consultant Comment','Contractor Response','Status'],
  [1,'4.2','Butterfly valves DN>=300 shall be double eccentric, PN16.','Agreed, revised.','Closed'],
  [2,'5.1','Actuator enclosure IP68 required for valve chamber installation.','','Open'],
  [3,'6.3','Provide coating thickness for ductile iron bodies (min 250 microns epoxy).','','Open']]);
 ws['E5'].c=[{a:'R. Hassan',t:'Please close before Rev B submission'}];
 const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'CRS'); XLSX.writeFile(wb,__dirname+'/fixtures/CRS_valves.xlsx');
 // 5. docx with a comment
 const d=new docx.Document({comments:{children:[{id:0,author:'Eng. Samir',date:new Date('2026-10-20'),children:[new docx.Paragraph({children:[new docx.TextRun('Confirm screen bar spacing 6 mm vs 10 mm in datasheet.')]})]}]},
  sections:[{children:[new docx.Paragraph({heading:docx.HeadingLevel.HEADING_1,children:[new docx.TextRun('Minutes of Meeting MOM-17')]}),
  new docx.Paragraph({children:[new docx.CommentRangeStart(0),new docx.TextRun('Action: Mechanical team to issue updated fine screen datasheet by 30 Oct 2026.'),new docx.CommentRangeEnd(0),new docx.TextRun({children:[new docx.CommentReference(0)]})]})]}]});
 fs.writeFileSync(__dirname+'/fixtures/MOM-17.docx', await docx.Packer.toBuffer(d));
 console.log('ok');
})();
