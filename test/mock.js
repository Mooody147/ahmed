// Mock of the claude.ai artifact runtime for local testing
(function(){
 const store=new Map(); const subs=[];
 const notify=()=>subs.forEach(s=>s.fire());
 const clone=o=>JSON.parse(JSON.stringify(o));
 const mkSnap=(path,data)=>({id:path.split('/').pop(),exists:data!==undefined,data:()=>data&&Object.freeze(clone(data)),metadata:{fromCache:false,hasPendingWrites:false}});
 const docRef=path=>({id:path.split('/').pop(),path,
   get:async()=>mkSnap(path,store.get(path)),
   set:async(d)=>{ const s=JSON.stringify(d).length; if(s>262144) throw {code:'invalid_argument',message:'too big '+s}; store.set(path,clone(d)); window.__writes=(window.__writes||0)+1; setTimeout(notify,5);},
   update:async(d)=>{store.set(path,{...store.get(path),...clone(d)});setTimeout(notify,5);},
   delete:async()=>{store.delete(path);setTimeout(notify,5);},
   onSnapshot(next,err){const s={fire:()=>next(mkSnap(path,store.get(path)))};subs.push(s);setTimeout(s.fire,10);return()=>{}},
   collection:(c)=>colRef(path+'/'+c)});
 const colRef=path=>({path,doc:id=>docRef(path+'/'+(id||Math.random().toString(36).slice(2))),
   get:async()=>{const docs=[...store.entries()].filter(([k])=>k.startsWith(path+'/')&&k.split('/').length===path.split('/').length+1).map(([k,v])=>mkSnap(k,v));return {docs,size:docs.length,empty:!docs.length,docChanges:()=>[]}},
   onSnapshot(next,err){const s={fire:async()=>next(await this.get())};subs.push(s);setTimeout(s.fire,10);return()=>{}}});
 window.__store=store; window.__prompts=[]; window.__saves=[];
 // a viewer page can start with documents copied from the owner's page (shared canvas test)
 if(window.__seed) for(const [k,v] of Object.entries(window.__seed)) store.set(k,v);
 window.__assets={};
 window.claude={use:async(name)=>{
   if(name==='db') return {doc:docRef,collection:colRef};
   if(name==='assets') return window.__noAssets?null:{upload:async(blob,o)=>{const t=(o&&o.type)||blob.type; if(!/^(application\/pdf|image\/(png|jpeg|gif|webp)|application\/json|text\/plain)$/.test(t)) throw {code:'unsupported_type',message:t}; if(blob.size>20*1048576) throw {code:'too_large',message:'big'}; const id=Math.random().toString(16).slice(2).padEnd(32,'0').slice(0,32); window.__assets[id]={type:t,size:blob.size}; return {id,url:URL.createObjectURL(blob),sizeBytes:blob.size,contentType:t};},list:async()=>({assets:[],usage:{files:Object.keys(window.__assets).length,bytes:Object.values(window.__assets).reduce((s,a)=>s+a.size,0),maxFiles:5000,maxBytes:1073741824}}),delete:async()=>({deleted:true})};
   if(name==='user') return {me:async()=>({id:window.__viewer?'u999':'u123',name:window.__viewer?'Manager':'Mahmoud Sobeah',email:null}),id:async()=>window.__viewer?'u999':'u123',isOwner:async()=>!window.__viewer,profiles:async ids=>Object.fromEntries(ids.map(i=>[i,{name:i==='u777'?'Khaled Nabil':''}])),canEdit:async()=>true,can:async()=>true};
   if(name==='downloads') return {save:async(r)=>{window.__saves.push({filename:r.filename,len:(r.data.length||r.data.size)}); (window.__saveData=window.__saveData||{})[r.filename]=r.data; return {status:'saved'};}};
   if(name==='sample'){ const f=async(i,o)=>({text:'x',truncated:false});
     f.limits=async()=>({maxPromptBytes:262144,images:{maxCount:20,maxInputBytes:20e6,mediaTypes:['image/jpeg','image/png','image/webp','image/gif']}});
     f.json=async(prompt,opts)=>{ window.__prompts.push({prompt,images:(opts.images||[]).length,tier:opts.modelTier});
       await new Promise(r=>setTimeout(r,300)); opts.onText&&opts.onText({text:'{"summary":',delta:''});
       return window.__mockAnswer(prompt); };
     return f; }
   if(name==='room' && window.__room){ return { presence: async p => { window.__presence = Object.assign({}, window.__presence || {}, p); }, peers: () => window.__room.peers, onPeers: (h) => { window.__peersHandler = h; setTimeout(() => h({ peers: window.__room.peers, joined: window.__room.peers, left: [], updated: window.__room.peers }), 50); return () => {}; }, emit: async () => {}, on: () => () => {} }; }
   if(name==='comments' && window.__comments){ return { openComposer: async () => ({ opened: true }), anchorFor: async () => ({}), customAnchors: async cb => { window.__cmCb = cb; return { compose: async (a, at, o) => { window.__composed = { a, label: o && o.label }; return { opened: true }; }, placed: m => { window.__placed = m; }, open: async () => {}, domAnchor: () => ['', { x: 0, y: 0 }], exitMode() {}, release() {}, areas: false }; } }; }
   return null; }};
 window.__mockAnswer=function(prompt){
   if(/^You are an experienced site engineer/.test(prompt)) return {captions:['Pump base before grouting'],observations:[{text:'Anchor bolts not plumb at the pump base',sev:'major',action:'Correct the anchor bolts before grouting',photo:1}]};
   if(/^These are review comments engineers received/.test(prompt)) return {themes:[{theme:'Missing NPSH data',count:2,tip:'Always attach the NPSH calculation.'}],checklist:['Attach NPSH calculation','State the IP rating of actuators']};
   if(/^List every requirement in this specification/.test(prompt)) return {items:[{clause:'2.1',page:'1',req:'Actuators shall be IP68.',kind:'material'},{clause:'3.4',page:'2',req:'The supplier shall submit the pump curves for approval.',kind:'submittal'},{clause:'4.2',page:'2',req:'Each pump shall be performance tested at the factory (FAT) witnessed by the Engineer.',kind:'test'}]};
   if(/^Rewrite the text below/.test(prompt)) return {text:/Arabic/.test(prompt)?'يرجى إرسال جدول الصمامات المعدل.':'Please send the revised valve schedule by 30 October.'};
   if(/^Draft a formal engineering document/.test(prompt)) { const hs=[...prompt.matchAll(/\{"h": "([^"]+)"/g)].map(m=>m[1]); return {sections:hs.map(h=>({h,text:h+': drafted text [to be confirmed]'}))}; }
   if(/^Summarise this email thread/.test(prompt)) return {summary:'The consultant returned the RAS pump calc with Code 3.',decisions:['Use IP68 actuators'],open:['Ahmed to send the anchor bolt layout'],next:'Resubmit the calc Rev B.'};
   if(/^Compare these engineering documents/.test(prompt)) return {conflicts:[{topic:'Actuator enclosure rating',a:{doc:'CRS_valves.xlsx',quote:'Actuator enclosure IP68'},b:{doc:'MOM-17.docx',quote:'IP65 is acceptable for the actuators'},severity:'high',suggestion:'Confirm the rating with the consultant before ordering.'}]};
   if(/^You are a research assistant for the user's own notebook/.test(prompt)) { const ex=prompt.split('EXCERPTS:\n')[1]||''; const i=ex.split(/\n\n(?=\[\d+\] )/).findIndex(x=>/IP68/.test(x)); return i>=0?{answer:'Valve actuators must be IP68 [' + (i+1) + '].',citations:[i+1],notFound:false,followUps:['What coating is required?']}:{answer:'The files do not say.',citations:[],notFound:true,followUps:[]}; }
   if(/^You are a research assistant\. Below are the opening passages/.test(prompt)) return {answer:'- Valve specification for ELM [1]\n- Pump calculation [2]',citations:[1,2],followUps:['What IP rating is required?']};
   if(/^Read this receipt or invoice/.test(prompt)) return {payee:'Carrefour Maadi',date:'2026-10-20',total:'1,245.50',currency:'EGP',category:'Food & groceries',note:'Groceries'};
   if(/^Put each bank statement line into one category/.test(prompt)) { const lines=prompt.split('Lines (i, type, description):\n')[1].split('\nAnswer JSON')[0].split('\n'); return {items:lines.map(l=>l.split('\t')).map(([i,k,d])=>({i:+i,category:/VODAFONE/i.test(d)?'Phone & internet':/PHARM/i.test(d)?'Health':''}))}; }
   if(/^You are preparing a technical bid evaluation/.test(prompt)) return {parameters:[{name:'Duty flow',unit:'m3/h',requirement:'410',values:['410','400'],status:['ok','deviation']},{name:'NPSHr',unit:'m',requirement:'<= 4',values:['3.8','not stated'],status:['ok','missing']}],summary:'Offer A meets the duty; offer B is short on flow.',recommendation:'Ask vendor B to confirm NPSHr.'};
   if(/^Draft contractor responses for a comment response sheet/.test(prompt)) { const n=(prompt.split('COMMENTS:\n')[1]||'').split('\nRules')[0].split('\n').filter(Boolean).length; return {responses:Array.from({length:n},(_,i)=>({i:i+1,response:'Noted, will be incorporated in Rev B. [TO CONFIRM: vendor data]',basis:''}))}; }
   if(/^Extract the action items from these meeting notes/.test(prompt)) return {tasks:[{title:'Send revised valve schedule to the consultant',owner:'me',deadline:'2026-10-30',note:'Agreed in the meeting'},{title:'Confirm channel width for fine screens',owner:'Omar Saleh',deadline:null,note:''}]};
   if(/^Answer the question using ONLY/.test(prompt)) { const r=/(T-\d{4})/.exec(prompt); return {answer:'You are waiting on Ahmed Fathy for the anchor bolt layout.',refs:r?[r[1]]:[]}; }
   if(/^You draft short, polite, professional engineering emails/.test(prompt)) return {subject:'Follow-up: anchor bolt layout',body:'Dear Ahmed,\n\nCould you please send the anchor bolt layout?\n\nBest regards'};
   if(/You organise the to-do list/.test(prompt)){ const lines=prompt.split('TASKS (one JSON object per line)\n')[1].split('\n\nReply')[0].split('\n').map(l=>JSON.parse(l));
     const cand=(prompt.split('EXISTING TASKS')[1]||'').split('\n').map(l=>l.split(' | ')).filter(a=>a.length>=5);
     const pumpTask=cand.find(a=>/RAS pump/.test(a[2]));
     return lines.map(t=> /NPSH/.test(t.title) ? ({id:t.id, project:null, topic:'RAS pump hydraulic calc', workType:'prepare', discipline:'pumps', relatedTaskIds: pumpTask?[pumpTask[0]]:[], placementConfidence:0.45, placementOptions:[{project:'ELM — El Mahsama WWTP',discipline:'pumps',relatedTaskId: pumpTask?pumpTask[0]:null,reason:'Same RAS pump NPSH check as the returned calc'},{project:'WTP-21',discipline:'hydraulics_process',reason:'Mentions a wet well'}]}) : ({id:t.id, topic: /valve/i.test(t.title)?'Valves specification CRS':/pump/i.test(t.title)?'RAS pump hydraulic calc':/anchor|civil/i.test(t.title)?'Blower building civil interface':'Site coordination', project: /valve|elm|ras/i.test(t.title+t.action)?'ELM — El Mahsama WWTP':(t.project||null), workType: /respond|reply|confirm/i.test(t.title)?'reply':/resubmit|revise/i.test(t.title)?'revise':'prepare', discipline: /valve/i.test(t.title)?'valves':/pump/i.test(t.title)?'pumps':/anchor|civil/i.test(t.title)?'civil_interface':'coordination_admin'})); }
   const key=n=>{const m=new RegExp('(A\\d+) = "[^"]*'+n).exec(prompt);return m?m[1]:'A1'};
   if(/Fine screens datasheet/.test(prompt)) return {summary:'CRS on fine screens datasheet; resubmit Rev C.',actionRequired:true,project:'WTP-21',category:'submittal_review',
     tasks:[{ref:'N1',title:'Resubmit fine screens datasheet WTP-21-ME-DS-0104 Rev C',action:'Answer CRS comments 2, 3, 4 and resubmit',type:'revise',ownership:'mine',owner:'me',requestedBy:'Lina Morsy',project:'WTP-21',priority:'high',deadline:null,deadlineText:'by date',deadlineBasis:'explicit',nextStep:'Get motor data from vendor',workType:'revise',discipline:'screens_equipment',topic:'Fine screens datasheet',tags:['screens'],subtasks:[{text:'2 — motor rating and IP class for screen drive'},{text:'3 — washer/compactor capacity (m3/h)'},{text:'4 — confirm SS316 frame material'}],evidence:[{source:'BODY',quote:'Kindly address the open comments and resubmit Rev C'},{source:'A1',quote:'Motor rating and IP class missing for screen drive.'}],confidence:0.9},
       {ref:'N2',title:'Omar to confirm channel width and embedded frames',workType:'follow_up',discipline:'civil_interface',ownership:'waiting',owner:'Omar Saleh',priority:'medium',evidence:[{source:'BODY',quote:'please confirm the channel width (1.2 m) and the embedded frame details'}],confidence:0.85}],updates:[],decisions:[],flags:[]};
   if(/Valves spec CRS/.test(prompt)) { const crs=key('CRS_valves'), tr=key('TR-ELM'); return {summary:'Consultant returned RAS pump calc Code 3 and open CRS items.',actionRequired:true,project:'ELM',category:'submittal_review',
     tasks:[{ref:'N1',title:'Respond to open CRS comments 2 and 3 – valves spec ELM-ME-SPC-0031',action:'Respond to comments 2 (IP68) and 3 (coating)',type:'reply',ownership:'mine',owner:'me',requestedBy:'Rania Hassan',project:'ELM',priority:'high',deadline:'2026-10-28',deadlineText:'Tuesday 28 October 2026',deadlineBasis:'explicit',nextStep:'Check actuator datasheet for IP68',topic:'Valves specification CRS',subtasks:Array.from({length:12},(_,i)=>({text:`CRS item ${i+2} — `+['Actuator enclosure IP68 for valve chamber','Coating thickness 250 µm epoxy for DI bodies','Confirm PN16 rating for DN300 butterfly valves','Provide limit switch details','Add handwheel orientation on GA','Confirm SS316 stem material','Provide torque calculation','Update valve schedule Rev B','Add gearbox ratio','Provide test certificates list','Clarify flange drilling EN1092-1','Add lifting lugs for DN>400'][i],ref:'C-'+(i+2)})),evidence:[{source:'BODY',quote:'Kindly respond to the open comments by Tuesday 28 October 2026.'},{source:crs,quote:'Actuator enclosure IP68 required for valve chamber installation.'}],confidence:0.92},
      {ref:'N2',title:'Revise and resubmit RAS pump hydraulic calc ELM-ME-CAL-0012',topic:'RAS pump hydraulic calc',subtasks:[{text:'C-01 — NPSHa at minimum wet well level 2.35 m'},{text:'C-02 — pump curve for duty point 410 m3/h at 14.5 m TDH'}],action:'Address C-01 NPSH and C-02 pump curve',type:'revise',ownership:'mine',owner:'me',project:'ELM',priority:'high',deadline:'2026-11-01',deadlineText:'within 10 days from the date of this transmittal',deadlineBasis:'relative',evidence:[{source:tr,quote:'Provide pump curve for duty point 410 m3/h at 14.5 m TDH.'},{source:tr,quote:'This sentence was invented by the model'}],confidence:0.8},
      {ref:'N3',title:'Ahmed to confirm civil anchor bolt layout – blower building',topic:'Blower building civil interface',ownership:'waiting',owner:'Ahmed Fathy',priority:'medium',evidence:[{source:'BODY',quote:'please confirm the civil anchor bolt layout for the blower building'}],confidence:0.8}],
     updates:[],documents:[{number:'ELM-ME-CAL-0012',title:'RAS pump hydraulic calculation',revision:'A',code:'3',status:'returned',by:'Rania Hassan',date:null,source:tr},{number:'ELM-ME-SPC-0031',title:'Valves specification',revision:'B',code:'2',status:'returned',by:'Rania Hassan',date:null,source:crs}],decisions:['RAS pump calc returned Code 3 — by consultant'],flags:[{kind:'uncertain_deadline',detail:'Transmittal date not shown; 10-day deadline estimated from email date.',source:tr}]}; }
   return {summary:'Nothing for you.',actionRequired:false,noActionReason:'Test message with no request.',tasks:[],updates:[],flags:[]};
 };
})();
;(function(){
 const ADDR='msobeah12+tasks@gmail.com';
 window.__gm={calls:[],labeled:[]};
 const msgs=[{id:'m0',date:'2026-10-23T17:05:00Z',toRecipients:[ADDR],labelIds:['INBOX'],viewUrl:'https://mail.google.com/mail/?x#m0'},
   {id:'m1',date:'2026-10-23T17:10:00Z',toRecipients:[ADDR],labelIds:['INBOX']},
   {id:'m2',date:'2026-10-23T18:00:00Z',toRecipients:[ADDR],labelIds:['INBOX']},
   {id:'m3',date:'2026-10-23T18:30:00Z',toRecipients:[ADDR],labelIds:['INBOX'],sizeEstimate:7002442,viewUrl:'https://mail.google.com/mail/?x#m3'},
   ...(window.__gmExtra?[{id:'m4',date:'2026-10-23T18:35:00Z',toRecipients:['m.sobeah@contractor.example'],labelIds:['INBOX'],delivered:true}]:[]),
   {id:'mX',date:'2026-10-23T18:40:00Z',toRecipients:['someone@else.com'],labelIds:['INBOX']}];
 // like Gmail: the query {to: cc: bcc: deliveredto:} finds messages sent to the address, including Bcc ("delivered")
 const sentTo=(m,q)=>!q.includes(ADDR)||m.delivered||[...(m.toRecipients||[]),...(m.ccRecipients||[])].includes(ADDR);
 const tool=async(t,input)=>{ window.__gm.calls.push([t,input]);
   if(t==='search_threads') return {payload:{threads:msgs.filter(m=>!window.__gm.labeled.includes(m.id)&&sentTo(m,input.query||'')&&(!/\{to:/.test(input.query||'')||true)).map(m=>({id:'t'+m.id,messageCount:1,messages:[m]}))}};
   if(t==='get_message'){ if(input.messageFormat==='RAW'){ if(input.messageId==='m3') throw {code:'tool_error',message:'too large'}; return {payload:{id:input.messageId,raw:window.__GMFX[input.messageId]}}; }
     return {payload:{id:input.messageId,subject:'FW: Huge drawings package',sender:'Mahmoud Sobeah <m.sobeah@contractor.example>',toRecipients:[ADDR],date:'2026-10-23T18:30:00Z',plaintextBody:'Please review.\n\nFrom: Hany <hany@consultant.example>\nSent: Monday, October 20, 2026 10:00 AM\nTo: Mahmoud Sobeah\nSubject: Huge drawings package\n\nSee attached GA drawings, comments due 30 Oct.',attachments:[{filename:'GA_set.pdf',mimeType:'application/pdf'},{filename:'image001.png',mimeType:'image/png'}]}}; }
   if(t==='list_labels') return {payload:{labels:[{id:'INBOX',name:'INBOX'}]}};
   if(t==='create_label') return {payload:{id:'Label_77',name:input.displayName}};
   if(t==='label_message'){ window.__gm.labeled.push(input.messageId); return {payload:{id:input.messageId}}; }
   throw {code:'not_in_manifest'}; };
 const orig=window.claude.use;
 window.claude.use=async n=> n==='mcp' && window.__noGmail ? null : n==='mcp' ? {callTool:async(s,t,i)=>{ if(s!=='Gmail') throw {code:'server_not_connected'}; return tool(t,i);}} : orig(n);
})();
