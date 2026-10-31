const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const body=src.slice(src.indexOf('(function spClientLedger(){')+'(function spClientLedger(){'.length,src.indexOf('    const money=c=>'));
function storage(){const data={};Object.defineProperties(data,{getItem:{value:k=>data[k]||null},setItem:{value:(k,v)=>data[k]=v},removeItem:{value:k=>delete data[k]}});return data;}
const shared=storage();
function tab(id,client='John Doe',store=shared){
 const state={client,id,name:'John EX',status:'New',cost:null,address:'123 Main St',priceSelector:'.totalPriceRow .totalPrice'};
 const ctx={console,Map,Set,JSON,Date,Number,String,Object,Array,URL,URLSearchParams,localStorage:store,location:{pathname:'/jobui'},
 spPdfCurrentJobId:()=>state.id,spStateCode:x=>x,spReturnSavedReady:()=>!!state.client,
 spReturnFormField:(_,k)=>({value:({name:state.client,address1:state.address,city:'Denver',state:'CO',zip:'80201'})[k]||''}),
 spDetectBureauForRecipient:n=>/\bEX\b/.test(n||'')?'EX':/\bTU\b/.test(n||'')?'TU':'',
 spBureauDisplayName:c=>({EX:'Experian',EQU:'Equifax',TU:'TransUnion'})[c]||'Unknown bureau',
 SP_RECIPIENT_BUREAUS:{EX:{address1:'P.O. Box 2002',city:'Allen',state:'TX',zip:'75013'}},
 document:{querySelector:s=>s==='#envelopeReturn-address'?{}:s==='#overview-jobName'?(state.name===null?null:{value:state.name}):s==='#jobState'?{textContent:state.status}:s===state.priceSelector?(state.cost?{textContent:state.cost}:null):null,querySelectorAll:()=>[]}};
 vm.createContext(ctx);vm.runInContext('(function(){'+body+';globalThis.api={capture,group,countable,clean,read,write,addressKey,hookRecipientSave,markLifecycle,canClear,clearSession,hookLifecycle,leavePage,duplicateNameMatches,duplicateReviewKey,matchingSessions,separateClientGroup,moveToClientGroup,priceSnapshot,sessionJobs};})();',ctx);return {api:ctx.api,state,ctx};
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
const old=b.api.read('session:'+br.session);old.seen=Date.now()-16*60*1000;b.api.write('session:'+br.session,old);b.api.clean();assert.ok(b.api.read('job:102'),'inactive client totals must survive indefinitely until Clear');assert.ok(j.api.read('job:103'));
console.log('PASS: shared client identity; client/profile isolation; processed price handoff; stale draft protection; grouping; address reassignment; persistent sessions.');

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

const duplicateStore=storage();
const dupA=tab('5101','Duplicate Client',duplicateStore),dupB=tab('5102','Duplicate Client',duplicateStore),distinct=tab('5103','Other Client',duplicateStore);
dupA.state.name='SAME EX TITLE';dupB.state.name='SAME EX TITLE';distinct.state.name='SAME EX TITLE';
dupA.api.capture();dupB.api.capture();distinct.api.capture();
let matches=dupA.api.duplicateNameMatches(dupA.api.read('job:5101'));
assert.equal(matches.length,1,'only a second ID under the same saved return address is reported');
assert.equal(matches[0].id,'5102');
dupB.state.name='DIFFERENT EX TITLE';dupB.api.capture();
assert.equal(dupA.api.duplicateNameMatches(dupA.api.read('job:5101')).length,0,'different job names are not flagged');
dupB.state.name='SAME EX TITLE';dupB.api.capture();
const reviewKey=dupA.api.duplicateReviewKey(dupA.api.read('job:5101'),dupB.api.read('job:5102'));
assert.equal(reviewKey,dupB.api.duplicateReviewKey(dupB.api.read('job:5102'),dupA.api.read('job:5101')),'acknowledgement key must be independent of tab order');
assert.equal(dupA.api.countable(dupA.api.read('job:5101')),true);
assert.equal(dupA.api.countable(dupA.api.read('job:5102')),true);
console.log('PASS: identical job names have distinct IDs and prices; same return address triggers duplicate review, different names or clients do not.');

const persistentStore=storage(),per=tab('6201','Permanent Client',persistentStore);
per.state.status='Processed - Ready for Approval';per.state.cost='$2.99';
const persisted=per.api.capture();per.api.markLifecycle('6201','approve');
const oldSession=per.api.read('session:'+persisted.session);oldSession.seen=Date.now()-90*86400000;per.api.write('session:'+persisted.session,oldSession);
per.api.clean();assert.equal(per.api.read('job:6201').cents,299);
per.api.leavePage();assert.equal(per.api.countable(per.api.read('job:6201')),true,'approved job must remain in totals after tab closes, regardless of last activity');
assert.equal(per.api.clearSession(persisted.session),true,'explicit Clear still removes displayed totals');
assert.equal(per.api.countable(per.api.read('job:6201')),false);
console.log('PASS: approved totals persist for months of inactivity, tab closures and expire only via Clear.');

const groupStore=storage();
const grpA=tab('6301','Shared Address',groupStore),grpB=tab('6302','Shared Address',groupStore),grpC=tab('6303','Shared Address',groupStore);
grpA.state.name='First Client EX';grpB.state.name='Second Client EX';grpC.state.name='Second Client TU';
const ra=grpA.api.capture(),rb=grpB.api.capture(),rc=grpC.api.capture();
assert.equal(ra.session,rb.session,'same return address defaults to existing group');
const custom=grpB.api.separateClientGroup('6302','Second Client');
assert.ok(custom&&custom!==ra.session,'separate group uses its own client key');
assert.equal(grpB.api.capture().session,custom,'subsequent captures must not accidentally merge groups');
assert.equal(grpC.api.moveToClientGroup('6303',custom),true);
assert.equal(grpC.api.capture().session,custom);
assert.equal(grpA.api.sessionJobs(ra.session).some(r=>r.id==='6302'),false,'client one must not count client two');
assert.ok(grpA.api.matchingSessions({name:'Shared Address',address1:'123 Main St',city:'Denver',state:'CO',zip:'80201'}).length>=2);
console.log('PASS: separate client groups survive captures while sharing identical return addresses.');

const priceStore=storage(),price=tab('6401','Price Client',priceStore);
price.state.status='Processed - Ready for Approval';price.state.cost='$1,234.50';
let priced=price.api.capture();assert.equal(priced.cents,123450);
price.state.priceSelector='[data-testid="job-total"]';price.state.cost='USD $13.49';
priced=price.api.capture();assert.equal(priced.cents,1349,'fallback total selector and USD prefix');
price.state.cost='Subtotal $1.00 Tax $0.29';
priced=price.api.capture();assert.equal(priced.priceNeedsReview,true,'ambiguous price must never be guessed');
assert.equal(price.api.countable(priced),true,'price validation must not erase job identity');
price.state.cost='$2.49';priced=price.api.capture();
assert.equal(priced.cents,249);assert.equal(priced.priceNeedsReview,false);
console.log('PASS: fallback price fields, formatted amounts, invalid price review and recovery.');

const crashStore=storage(),crashed=tab('6501','Crash Client',crashStore);
crashed.api.capture();const leaseKey=Object.keys(crashStore).find(k=>k.startsWith('sp-ledger-v1:live:'));
const lease=JSON.parse(crashStore[leaseKey]);lease.seen=Date.now()-91000;crashStore[leaseKey]=JSON.stringify(lease);
crashed.api.clean();assert.equal(crashed.api.countable(crashed.api.read('job:6501')),false,'abandoned presence should expire');
assert.ok(crashed.api.read('job:6501'),'crash cannot delete Postalocity job data');
console.log('PASS: abnormal browser exit expires pending lease without deleting job data.');

const deletionStore=storage(),deleteTab=tab('6601','Delete Test',deletionStore);
deleteTab.api.capture();
let handler;const nativeDelete={job:{removeJob(h){handler=h;}}};deleteTab.api.hookLifecycle(nativeDelete);
nativeDelete.job.removeJob({request:{jobId:'6601'},handleSuccessResponse(){}});
handler.handleSuccessResponse({success:false});
assert.equal(deleteTab.api.read('job:6601').deleted,undefined,'failed native response cannot remove job');
handler.handleSuccessResponse({success:true});
assert.equal(deleteTab.api.read('job:6601').deleted,true,'only successful native callback removes job');
console.log('PASS: changing native delete method names and failed/successful responses.');

const approvalPriceStore=storage();
const approvalPrice=tab('6701','Approved Price',approvalPriceStore);
approvalPrice.state.status='Processed - Ready for Approval';approvalPrice.state.cost='$5.00';
approvalPrice.api.capture();approvalPrice.api.markLifecycle('6701','approve');
approvalPrice.state.status='Approved';approvalPrice.state.cost='$5.49';
let corrected=approvalPrice.api.capture();
assert.equal(corrected.cents,549,'approved page may correct an originally verified total');
approvalPrice.state.cost='Price currently unavailable';
corrected=approvalPrice.api.capture();
assert.equal(corrected.priceNeedsReview,true,'invalid current approved total must be flagged');
approvalPrice.state.cost='$5.49';corrected=approvalPrice.api.capture();
assert.equal(corrected.priceNeedsReview,false,'fresh verified approved total removes warning');
console.log('PASS: approved-page total corrections and invalid-price safeguards.');
