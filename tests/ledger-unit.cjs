const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const body=src.slice(src.indexOf('(function spClientLedger(){')+'(function spClientLedger(){'.length,src.indexOf('    const money=c=>'));
function storage(){const data={};Object.defineProperties(data,{getItem:{value:k=>data[k]||null},setItem:{value:(k,v)=>data[k]=v},removeItem:{value:k=>delete data[k]}});return data;}
const shared=storage();
function tab(id,client='John Doe',store=shared){
 const state={client,id,name:'John EX',status:'New',cost:null,address:'123 Main St'};
 const ctx={console,Map,Set,JSON,Date,Number,String,Object,Array,URL,URLSearchParams,localStorage:store,location:{pathname:'/jobui'},
 spPdfCurrentJobId:()=>state.id,spStateCode:x=>x,spReturnSavedReady:()=>!!state.client,
 spReturnFormField:(_,k)=>({value:({name:state.client,address1:state.address,city:'Denver',state:'CO',zip:'80201'})[k]||''}),
 spDetectBureauForRecipient:n=>/\bEX\b/.test(n||'')?'EX':/\bTU\b/.test(n||'')?'TU':'',
 spBureauDisplayName:c=>({EX:'Experian',EQU:'Equifax',TU:'TransUnion'})[c]||'Unknown bureau',
 SP_RECIPIENT_BUREAUS:{EX:{address1:'P.O. Box 2002',city:'Allen',state:'TX',zip:'75013'}},
 document:{querySelector:s=>s==='#envelopeReturn-address'?{}:s==='#overview-jobName'?(state.name===null?null:{value:state.name}):s==='#jobState'?{textContent:state.status}:s==='.totalPriceRow .totalPrice'?(state.cost?{textContent:state.cost}:null):null,querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext('(function(){'+body+';globalThis.api={capture,group,countable,clean,read,write,addressKey,hookRecipientSave,markLifecycle,canClear,clearSession,hookLifecycle};})();',ctx);return {api:ctx.api,state,ctx};
}
const a=tab('101'),b=tab('102'),j=tab('103','Jane Doe');const ar=a.api.capture(),br=b.api.capture(),jr=j.api.capture();
assert.equal(ar.session,br.session);assert.notEqual(ar.session,jr.session);
const p=tab('101',null);p.state.name=null;p.state.status='Processed - Ready for Approval';p.state.cost='$1.39';assert.equal(p.api.capture().cents,139);
assert.equal(a.api.capture().cents,139,'stale draft must not erase processed total');
assert.equal(p.api.capture().cents,139);assert.equal(Object.keys(shared).filter(k=>k.includes('job:101')).length,1);
assert.equal(tab('101',null,storage()).api.capture(),null,'different device/profile stays isolated');
const ex={name:'Experian',address1:'PO Box 2002',city:'Allen',state:'TX',zip:'75013'};
assert.equal(a.api.group({name:'Unknown',recipients:[ex]}).key,'EX');
const other={name:'THD/CBNA',address1:'PO Box 6497',city:'Sioux Falls',state:'SD',zip:'57117'};
assert.equal(a.api.group({name:'Unknown',recipients:[other]}).label,'THD/CBNA');
assert.equal(a.api.group({name:'John TU',recipients:[ex]}).warning,true);
assert.equal(a.api.group({recipients:[ex,other]}).key,'Mixed recipients');
assert.equal(a.api.group({name:'John TU'}).key,'TU');
a.state.address='999 New St';const moved=a.api.capture();assert.notEqual(moved.session,ar.session);assert.equal(p.api.capture().session,moved.session);
const s=a.api.read('session:'+moved.session);s.ended=true;a.api.write('session:'+moved.session,s);assert.equal(a.api.capture(),null);
const old=b.api.read('session:'+br.session);old.seen=Date.now()-16*60*1000;b.api.write('session:'+br.session,old);b.api.clean();assert.equal(b.api.read('job:102'),null);assert.ok(j.api.read('job:103'));
console.log('PASS: shared client identity; client/profile isolation; processed price handoff; stale draft protection; deduplication; bureau and creditor grouping; mismatch/mixed detection; address reassignment; end and expiry.');

const gated=tab('999','Named Client');gated.state.name='';let record=gated.api.capture();assert.equal(gated.api.countable(record),false);
gated.state.name='EX letter';record=gated.api.capture();assert.equal(gated.api.countable(record),true);
gated.state.name='   ';record=gated.api.capture();assert.equal(gated.api.countable(record),false);
const invalid=Object.assign({},record,{name:'EX letter',session:'missing'});assert.equal(gated.api.countable(invalid),false);
console.log('PASS: blank-name jobs and missing-return-address jobs excluded; named linked jobs included; clearing name excludes job.');

const lifeStore=storage();const life=[tab('801','Lifecycle',lifeStore),tab('802','Lifecycle',lifeStore),tab('803','Lifecycle',lifeStore)];
life.forEach(t=>{t.state.status='Processed - Ready for Approval';t.state.cost='$1.39';t.api.capture();});
const owner=life[0],key=owner.api.read('job:801').session;
const total=()=>['801','802','803'].map(id=>owner.api.read('job:'+id)).filter(r=>owner.api.countable(r)).reduce((n,r)=>n+r.cents,0);
assert.equal(total(),417);assert.equal(owner.api.canClear(key),true,'Clear is available even with pending jobs');
let successHandler;const native={job:{deleteJob(h){successHandler=h;},approveJob(h){successHandler=h;}}};owner.api.hookLifecycle(native);
native.job.deleteJob({request:{jobId:'802'},handleSuccessResponse(){}});
assert.equal(total(),417,'click/request without success must not remove a job');
successHandler.handleSuccessResponse();assert.equal(total(),278);
life[1].api.capture();assert.equal(total(),278,'stale deleted tab must not resurrect record');
native.job.approveJob({request:{jobId:'801'},handleSuccessResponse(){}});assert.equal(owner.api.canClear(key),true);
successHandler.handleSuccessResponse();assert.equal(total(),278);owner.api.capture();assert.equal(owner.api.read('job:801').approved,true);
owner.api.markLifecycle('801','delete');assert.equal(total(),278,'approved records must be retained');
assert.equal(owner.api.canClear(key),true);owner.api.markLifecycle('803','approve');assert.equal(owner.api.canClear(key),true);
assert.equal(owner.api.clearSession(key),true);assert.equal(total(),0);
console.log('PASS: three pending prices; confirmed deletion deducts one; failed/unconfirmed deletion preserves totals; stale tab cannot restore deleted job; approvals retained; clear allowed with pending jobs.');

const frozen=tab('901','Approved Client',storage());frozen.state.status='Processed - Ready for Approval';frozen.state.cost='$2.00';frozen.api.capture();frozen.api.markLifecycle('901','approve');frozen.state.name='';frozen.state.address='Changed draft';const locked=frozen.api.capture();assert.equal(locked.name,'John EX');assert.equal(locked.cents,200);assert.equal(frozen.api.countable(locked),true);console.log('PASS: approved identity and price survive stale draft edits.');

const unassigned=tab('777','Unassigned client',storage());
unassigned.state.name='General correspondence';
const unassignedRecord=unassigned.api.capture();
assert.equal(unassigned.api.countable(unassignedRecord),false,'Unassigned creditor group is never counted');
unassignedRecord.override='EX';unassigned.api.write('job:777',unassignedRecord);
assert.equal(unassigned.api.countable(unassigned.api.read('job:777')),true,'Assigning a bureau starts counting it');
const early=tab('778','Early clear',storage());
early.state.status='Processed - Ready for Approval';early.state.cost='$3.00';
const earlyRecord=early.api.capture();
assert.equal(early.api.canClear(earlyRecord.session),true);
assert.equal(early.api.clearSession(earlyRecord.session),true,'Clear works without approving pending jobs');
assert.equal(early.api.countable(earlyRecord),false,'Cleared session cannot be recounted');
console.log('PASS: unassigned jobs excluded until assigned; pending sessions can be cleared safely.');

const closeStore=storage();
const closedJobs=[tab('980','Close case',closeStore),tab('981','Close case',closeStore),tab('982','Close case',closeStore)];
closedJobs.forEach(t=>{t.state.status='Processed - Ready for Approval';t.state.cost='$1.39';t.api.capture();});
const closeTotal=()=>['980','981','982'].map(id=>closedJobs[0].api.read('job:'+id)).filter(r=>closedJobs[0].api.countable(r)).reduce((n,r)=>n+r.cents,0);
assert.equal(closeTotal(),417);
closedJobs[1].api.leavePage();
assert.equal(closeTotal(),278,'closing one pending job tab immediately deducts its cost');
assert.ok(closedJobs[0].api.read('job:981'),'leaving a tab must not claim the Postalocity job was deleted');
closedJobs[2].api.markLifecycle('982','approve');
closedJobs[2].api.leavePage();
assert.equal(closeTotal(),278,'approved jobs are retained when their tab closes');
closedJobs[0].api.leavePage();
assert.equal(closeTotal(),139,'closed pending jobs are all excluded');
const reopened=tab('981','Close case',closeStore);reopened.state.status='Processed - Ready for Approval';reopened.state.cost='$1.39';reopened.api.capture();
assert.equal(closeTotal(),278,'reopening an existing job starts counting it again');
const duplicate=tab('981','Close case',closeStore);duplicate.state.status='Processed - Ready for Approval';duplicate.api.capture();
reopened.api.leavePage();assert.equal(closeTotal(),278,'one of two open tabs must not hide the same job');
duplicate.api.leavePage();assert.equal(closeTotal(),139,'last tab closing removes the unapproved job from totals');
console.log('PASS: pending tab close deducts price, approved close preserves price, reopening restores job, duplicate tabs are not double counted.');
