const E=require('../../src/core.js');
const body='Dear Mahmoud,\nKindly respond to the open comments by Tuesday 28 October 2026.\nAhmed - please confirm the civil anchor bolt layout.';
const crs='[Sheet: CRS] — 3 rows\nR5 | A: 2 | B: 5.1 | C: Actuator enclosure IP68 required for valve chamber installation. | E: Open\nR6 | A: 3 | C: Provide coating thickness for ductile iron bodies (min 250 microns epoxy). | E: Open';
const pdf='[Page 1]\nReview Code: 3 - Revise and Resubmit\n\n[Page 2]\nC-02: Provide pump curve for duty point 410 m3/h at 14.5 m TDH.';
const mk=E.makeMasker(['m.sobeah@contractor.example']);
const em={subject:'RE: Valves',from:mk.mask('Rania <rania@c.example>'),to:mk.mask('Mahmoud <m.sobeah@contractor.example>'),date:'2026-10-22T06:15:00.000Z',body:mk.mask(body+'\nCall +20 100 123 4567')};
const {prompt,truncations}=E.buildPrompt({me:{name:'Mahmoud Sobeah',emails:['m.sobeah@contractor.example'],role:'Mechanical design engineer'},projects:[{code:'ELM',name:'El Mahsama WWTP'}],today:'2026-10-23',tz:'Africa/Cairo',email:em,
 attachments:[{key:'A1',name:'CRS.xlsx',kindLabel:'Spreadsheet',text:crs,status:'text'},{key:'A2',name:'TR.pdf',kindLabel:'PDF',text:pdf+'\n'+'x'.repeat(300000),status:'text'}],images:[{key:'IMG1',label:'"SI-009 scan.png"'}],openTasks:[{id:'T-0003',title:'Submit valves spec Rev B',status:'waiting',project:'ELM'}]});
console.log(prompt.length, E.utf8len(prompt), truncations); console.log(prompt.slice(prompt.indexOf('=== EMAIL HEADER'), prompt.indexOf('=== EMAIL HEADER')+700));
const raw={summary:'Review [email-1]',tasks:[{title:'Respond to open CRS comments 2 and 3 on valves spec',action:'Answer comments 2,3',ownership:'mine',priority:'high',deadline:'2026-10-28',deadlineBasis:'explicit',evidence:[{source:'A1',quote:'Actuator enclosure IP68 required for valve chamber installation'},{source:'BODY',quote:'Kindly respond to the open comments by Tuesday 28 October 2026.'}]},
 {title:'Provide pump curve',ownership:'mine',deadline:'2026-13-40',evidence:[{source:'A2',quote:'Provide pump curve for duty point 410 m3/h at 14.5 m TDH'},{source:'A2',quote:'some invented sentence not there'}]}],
 updates:[{taskId:'T-0003',change:'status',newStatus:'blocked',note:'x'}]};
const n=E.normalizeAnalysis(raw,{unmask:mk.unmask});
const sources={BODY:{text:em.body,name:'Email body'},A1:{text:crs,name:'CRS.xlsx'},A2:{text:pdf,name:'TR.pdf'},IMG1:{visual:true,name:'scan'}};
n.tasks.forEach(t=>{t.evidence=E.verifyEvidence(t.evidence,sources); console.log(t.title,t.deadline,t.deadlineBasis,t.evidence.map(e=>[e.check,e.location]));});
console.log(n.summary, n.updates);
const dup=E.findDuplicate({title:'Reply to open CRS comments on valves specification',action:'respond comments'},[{id:'T1',title:'Respond to open CRS comments 2 and 3 on valves spec',status:'todo',threadKey:'sub:x'}],'sub:x'); console.log('dup',dup&&dup.score);
// quoted conversation history (Outlook, Gmail, Arabic Outlook headers), oldest first after sorting by date
const qh=E.quotedHistory('Thanks, sent.\n\nFrom: Ahmed Hassan <ah@x.com>\nSent: Monday, October 20, 2025 10:12 AM\nSubject: RE: Disc filter\n\nPlease review.\n\nOn Sun, 19 Oct 2025 at 09:00, Omar Ali <o@y.com> wrote:\n> request\n\nمن: محمد\nتاريخ الإرسال: 2025-10-18 08:00\nالموضوع: فلتر').sort((a,b)=>a.date.localeCompare(b.date));
const assert=require('assert');
assert.deepStrictEqual(qh.map(x=>[x.from,x.date]),[['محمد','2025-10-18'],['Omar Ali','2025-10-19'],['Ahmed Hassan','2025-10-20']]);
const th=E.normalizeAnalysis({summary:'x',tasks:[],thread:{first:'2025-10-18',last:'2025-10-20',messages:2,history:[{date:'2025-10-18',from:'Omar',kind:'Request',says:'asked'},{date:'bad',from:'me',says:'sent it'}]}},{}).thread;
assert.deepStrictEqual(th.history,[{date:'2025-10-18',from:'Omar',kind:'request',says:'asked'},{date:null,from:'me',kind:'info',says:'sent it'}]);
console.log('thread history: ok');
