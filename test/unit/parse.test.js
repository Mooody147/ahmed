const fs=require('fs');
globalThis.XLSX=require('xlsx'); globalThis.JSZip=require('jszip'); globalThis.mammoth=require('mammoth');
globalThis.pdfjsLib=require('pdfjs-dist/legacy/build/pdf.js'); globalThis.pdfjsWorker=require('pdfjs-dist/legacy/build/pdf.worker.js');
const E=require('../../src/core.js');
const u8=f=>new Uint8Array(fs.readFileSync(f));
(async()=>{
 console.log('PREBUF len', E.RTF_PREBUF.length);
 // EML
 const em=E.parseEml(u8(__dirname+'/../fixtures/review.eml'));
 console.log('SUBJ:',em.subject,'| norm:',E.normSubject(em.subject));
 console.log('FROM:',em.from, em.fromEmail,'| TO:',em.to,'| CC:',em.cc,'| DATE:',em.date);
 console.log('BODY:',JSON.stringify(em.body.slice(0,160)));
 console.log('ATTS:',em.attachments.map(a=>[a.name,a.mime,a.size,!!a.email,a.inline]));
 for (const a of em.attachments){ const r=await E.extract(a,{vision:false}); console.log('--',a.name,r.kind,r.status,r.note,'\n',(r.text||'').slice(0,500)); if(a.email) for(const b of a.email.attachments){const r2=await E.extract(b,{vision:false}); console.log('   nested',b.name,r2.status,'\n',r2.text.slice(0,400));} }
 // MSG
 const msg=E.readMsgFromCfb(XLSX.CFB.read(u8(__dirname+'/../fixtures/test.msg'),{type:'array'}));
 console.log('MSG',{s:msg.subject,f:msg.from,fe:msg.fromEmail,to:msg.to,cc:msg.cc,d:msg.date,mid:msg.messageId,ci:msg.convIndex,body:msg.body.slice(0,200),w:msg.warnings});
 console.log('MSG atts',msg.attachments.map(a=>[a.name,a.mime,a.size,a.inline]));
 for(const a of msg.attachments){const r=await E.extract(a,{vision:false}); console.log('  ',a.name,r.kind,r.status,r.note,(r.text||'').slice(0,150));}
 // other fixtures
 for (const f of ['drawing_A3.pdf','scanned.pdf']){ const r=await E.extract({name:f,bytes:u8(__dirname+'/../fixtures/'+f)},{vision:false}); console.log(f,r.status,r.drawingPages,r.scannedPages,r.note,'\n',r.text.slice(0,200)); }
 // paste
 const p=E.parsePasted('From: Ali Kamal <ali@vendor.example>\nSent: Wednesday, October 22, 2026 3:10 PM\nTo: Mahmoud Sobeah\nCc: Procurement\nSubject: RE: RFQ-221 Blowers – clarification\n\nDear Mahmoud,\nPlease confirm the required discharge pressure (mbar) before we finalize the offer.\nThanks');
 console.log('PASTE',p);
 // Arabic quotes match with or without vowel marks, tatweel and letter variants
 const ar=E.verifyEvidence([{source:'BODY',quote:'يرجى مراجعة حسابات المضخة رقم ٣ وتقديم المنحنى المعدل'},{source:'BODY',quote:'إرسال الجدول المحدث للاستشاري قبل نهاية الأسبوع'}],{BODY:{name:'Email body',text:'م. محمود،\nيُرجى مُراجعة حسابات المضخّة رقم 3 وتقديم المنحنى المُعدَّل.\nكما نرجو ارسال الجدول المحـدث للإستشاري قبل نهاية الاسبوع.'}});
 console.log('ARABIC',ar.map(x=>x.check)); if(ar.some(x=>x.check!=='verified')){ console.error('FAIL arabic quotes'); process.exit(1); }
})().catch(e=>{console.error('FAIL',e); process.exit(1);});
