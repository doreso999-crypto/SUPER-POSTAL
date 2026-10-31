const {JSDOM}=require(process.env.JSDOM_PATH||'jsdom');
const fs=require('fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const code=src.slice(src.indexOf('(function spClientLedger(){'),src.lastIndexOf('\n})();')).replace('setInterval(tick,1500);tick();','window.testTick=tick;tick();');
const parser=src.slice(src.indexOf('const SP_STATES='),src.indexOf('function spParserStatus'));
const backing={};const store={getItem:k=>backing[k]||null,setItem:(k,v)=>backing[k]=v,removeItem:k=>delete backing[k]};
const shared=new Proxy(store,{ownKeys:()=>Object.keys(backing),getOwnPropertyDescriptor:()=>({enumerable:true,configurable:true})});
function page(id,html,savedHtml){
 const dom=new JSDOM(html+'<div id="bureauTotals"></div>',{url:'https://prod.postalocity.com/jobui?id='+id,runScripts:'outside-only'}),w=dom.window;
 Object.defineProperty(w,'localStorage',{value:shared});
 w.fetch=async url=>({ok:true,url,text:async()=>savedHtml||''});
 w.spReturnFormField=(form,key)=>form.querySelector('[name="'+key+'"]');
 w.spPdfCurrentJobId=()=>id;w.spReturnIsSampleText=t=>/MY NAME HERE/.test(t);w.spReturnSavedReady=()=>false;
 w.confirm=()=>true;w.alert=()=>{};
 w.spDetectBureauForRecipient=n=>/\bEX\b/.test(n||'')?'EX':'';w.spBureauDisplayName=c=>({EX:'Experian',EQU:'Equifax',TU:'TransUnion'})[c]||'Unknown bureau';
 w.SP_RECIPIENT_BUREAUS={EX:{address1:'P.O. Box 2002',city:'Allen',state:'TX',zip:'75013'}};
 w.eval(parser+'\n'+code);return w;
}
const first='<span id="settingsReturnAddressSource-Link">FROM JOB SETTINGS:<br>Test Client<br>123 Main St<br>Denver CO 80201<br></span><input id="overview-jobName" value="Test EX"><span id="jobState">New</span>';
const second='<span id="jobState">Processed - Ready for Approval</span><div class="totalPriceRow"><span class="totalPrice">$1.39</span></div>';
const a=page('1301773',first);a.document.querySelector('#overview-jobName').value='Test EX';a.testTick();
const p=page('1301773',second);a.testTick();
assert.match(p.document.querySelector('#spLedgerPanel').textContent,/Test Client/);
assert.match(p.document.querySelector('#spLedgerPanel').textContent,/Experian.*\$1.39/i);
assert.match(a.document.querySelector('#spLedgerPanel').textContent,/Total: \$1.39/);
const another=page('1301773',second);assert.match(another.document.querySelector('#spLedgerPanel').textContent,/Total: \$1.39/);
let end=[...p.document.querySelectorAll('button')].find(e=>e.textContent==='Clear');assert.equal(end.disabled,false);
p.confirm=()=>false;end.click();assert.match(p.document.querySelector('#spLedgerPanel').textContent,/Total: \$1.39/);p.confirm=()=>true;
p.document.querySelector('#jobState').textContent='Approved';p.testTick();a.testTick();
end=[...p.document.querySelectorAll('button')].find(e=>e.textContent==='Clear');assert.equal(end.disabled,false);end.click();a.testTick();
assert.match(a.document.querySelector('#spLedgerPanel').textContent,/Session ended/);
const start=[...a.document.querySelectorAll('button')].find(e=>e.textContent==='Start new session');start.click();a.testTick();
assert.equal(a.document.querySelectorAll('#spLedgerPanel .sp-ledger-group').length,0,'empty session hides all bureau sections');
a.close();p.close();another.close();console.log('PASS: before/after HTML fixtures, actual address parser, rendered bureau total, duplicate page, confirmed Clear and end/restart controls.');

const orphan=page('200',second,first);
setTimeout(()=>{
 try{
  assert.match(orphan.document.querySelector('#spLedgerPanel').textContent,/Test Client/);
  assert.match(orphan.document.querySelector('#spLedgerPanel').textContent,/Total: \$1.39/);
  orphan.close();console.log('PASS: processed job without local record recovers saved address using same-job read-only request.');
 }catch(e){console.error(e);orphan.close();process.exitCode=1;}
},20);

const onClose=page('404','<span id="settingsReturnAddressSource-Link">FROM JOB SETTINGS:<br>Closing Client<br>123 Main St<br>Denver CO 80201</span><input id="overview-jobName" value="Closing EX"><span id="jobState">New</span><button onclick="deleteJob()">Delete Job</button>');
const native=onClose.document.querySelector('[onclick="deleteJob()"]');
let nativeClicks=0;native.addEventListener('click',()=>nativeClicks++);
const panelDelete=[...onClose.document.querySelectorAll('#spLedgerPanel button')].find(e=>e.textContent==='Delete job');
assert.ok(panelDelete);panelDelete.click();assert.equal(nativeClicks,1,'Panel uses Postalocity native delete control');
const leaving=new onClose.Event('beforeunload',{cancelable:true});onClose.dispatchEvent(leaving);
assert.equal(leaving.defaultPrevented,true,'Unapproved tab close produces a browser confirmation');
onClose.close();
console.log('PASS: panel invokes native Delete Job; pending job warns before leaving.');

const closingA=page('601',first),closingB=page('602',first);
assert.equal(closingA.document.querySelector('#spLedgerPanel .sp-ledger-count').textContent,'2');
closingA.dispatchEvent(new closingA.Event('pagehide'));
closingB.testTick();
assert.equal(closingB.document.querySelector('#spLedgerPanel .sp-ledger-count').textContent,'1','closed pending job is removed from a sibling tab');
assert.equal(closingB.document.querySelectorAll('#spLedgerPanel .sp-ledger-letter').length,1);
closingB.document.querySelector('#jobState').textContent='Approved';closingB.testTick();
closingB.dispatchEvent(new closingB.Event('pagehide'));
const viewer=page('603',first);
assert.equal(viewer.document.querySelector('#spLedgerPanel .sp-ledger-count').textContent,'1','approved closed-tab job stays in panel');
closingA.close();closingB.close();viewer.close();
console.log('PASS: cross-tab close excludes drafts while keeping approved jobs.');

const processedHtml='<span id="settingsReturnAddressSource-Link">FROM JOB SETTINGS:<br>Processed Sender<br>22 Main Street<br>Denver CO 80201</span>'+
    '<input id="overview-jobName" value="Processed EX"><span id="jobState">Processed - Ready for Approval</span>'+
    '<div class="totalPriceRow"><span class="totalPrice">$1.39</span></div>';
const processedTabs=['7201','7202','7203'].map(jobId=>page(jobId,processedHtml));
const processedPanel=processedTabs[0].document.querySelector('#spLedgerPanel');
assert.equal(processedPanel.querySelector('.sp-ledger-count').textContent,'3','three processed job IDs are present');
processedTabs.forEach(w=>w.dispatchEvent(new w.Event('pagehide')));
const processedReopened=page('7201','<span id="jobState">Processed - Ready for Approval</span>');
assert.equal(processedReopened.document.querySelector('#spLedgerPanel .sp-ledger-count').textContent,'3',
    'processed jobs remain in client totals even after all tabs closed');
processedTabs.forEach(w=>w.close());processedReopened.close();
console.log('PASS: processed unapproved jobs survive closing all tabs and remain visible when one is reopened.');
