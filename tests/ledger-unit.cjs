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
 vm.createContext(ctx);vm.runInContext('(function(){'+body+';globalThis.api={capture,group,countable,clean,read,write,addressKey,hookRecipientSave};})();',ctx);return {api:ctx.api,state,ctx};
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
