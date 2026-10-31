const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const begin=src.indexOf("    const money=c=>'$'+(c/100).toFixed(2);");
const end=src.indexOf('    function requestNativeDeletion(){',begin);
assert.ok(begin>=0&&end>begin,'render source can be extracted');
const source=src.slice(begin,end);

class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.textContent='';this.className='';this.disabled=false;}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=[...nodes];}
    get lastChild(){return this.children[this.children.length-1];}
    addEventListener(){}
}
const flatten=node=>[node,...node.children.flatMap(flatten)];
const textAll=node=>flatten(node).map(x=>x.textContent||'').join(' ');
function build({saved=false,ended=false,id='',recovering=false,recoveryMessage='',candidates=[]}={}){
    const box=new Element('div'),head=[];
    const document={
        createElement:t=>new Element(t),
        head:{append:x=>head.push(x)},
        querySelector:q=>q==='#bureauTotals'?box:q==='#spLedgerPanel'?box.children.find(n=>n.id==='spLedgerPanel')||null:q==='#spLedgerV2Styles'?head.find(n=>n.id==='spLedgerV2Styles')||null:null
    };
    const session={address:{name:'Sample Client',address1:'1 Main St',city:'Denver',state:'CO',zip:'80201'},ended};
    const job={id:'101',session:'client',name:'Sample EX'};
    const read=key=>key==='session:client'&&saved?session:key==='job:101'?job:null;
    let recoverCalls=0;const linked=[];
    class FakeURL{
        constructor(path,origin){this.path=path;this.origin=origin;this.params=[];this.searchParams={set:(k,v)=>this.params.push(k+'='+v)};}
        get href(){return this.origin+this.path+(this.params.length?'?'+this.params.join('&'):'');}
    }
    const args=['document','read','group','countable','bureauSummary','sessionJobs','isApproved','id','error',
        'recovering','recoveryMessage','window','navigator','requestNativeDeletion','clearSession','tick',
        'lastView','norm','location','URL','recoveryAttempts','recoverSavedJob','remove','observed','keys',
        'linkableSessions','linkJobToClient'];
    const factory=new Function(...args,source+';return render;');
    const render=factory(document,read,()=>({key:'EX'}),()=>false,()=>[],()=>[],()=>false,()=>id,'',recovering,
        recoveryMessage,{confirm:()=>false},{clipboard:{writeText:async()=>{}}},()=>{},()=>{},()=>{},'',x=>String(x||'').trim(),
        {origin:'https://postalocity.example'},FakeURL,new Set(['101']),()=>{recoverCalls++;},()=>{},{clear(){}},()=>[],
        ()=>candidates,(key)=>{linked.push(key);return true;});
    render(saved?job:null);
    const panel=document.querySelector('#spLedgerPanel');
    assert.ok(panel,'render creates the panel');
    return {panel,text:textAll(panel),items:flatten(panel),recoverCalls,box,linked};
}

// An untouched job must explain the missing address, without claiming it is tracking.
const noAddress=build();
assert.match(noAddress.text,/Add a return address/);
assert.match(noAddress.text,/Save it in Job Settings/);
assert.doesNotMatch(noAddress.text,/No letters yet|Total: \$0\.00/);
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-onboard').length,1);
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-onboard-index')[0].textContent,'01');
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-group').length,0);
console.log('PASS: no saved return address shows setup step 01 and no fake jobs or totals.');

const addressWithJobId=build({id:'101'});
assert.match(addressWithJobId.text,/Add a return address/);
const settingsLink=addressWithJobId.items.find(x=>x.tag==='a');
assert.ok(settingsLink,'known job has an actionable settings link');
assert.equal(settingsLink.textContent,'Open job settings');
assert.ok(settingsLink.href.includes('id=101'),'settings link targets the current job');
console.log('PASS: address setup offers the existing job-settings link only when a job ID is known.');

const emptyLetters=build({saved:true,id:'101'});
assert.match(emptyLetters.text,/Sample Client/);
assert.match(emptyLetters.text,/No letters yet/);
assert.match(emptyLetters.text,/Add a named job and its recipient/);
assert.doesNotMatch(emptyLetters.text,/Add a return address/);
assert.equal(emptyLetters.items.filter(x=>x.className==='sp-ledger-onboard-index').length,0,'No letters yet has no numbered step');
assert.equal(emptyLetters.items.filter(x=>x.className==='sp-ledger-group').length,0);
console.log('PASS: saved-address client without qualified jobs sees an unnumbered No letters yet state, not fake bureau totals.');

const pending=build({id:'101',recovering:true});
assert.match(pending.text,/Checking saved settings/);
assert.doesNotMatch(pending.text,/Add a return address|Open job settings/);
assert.equal(pending.items.filter(x=>x.tag==='a').length,0);
const failed=build({id:'101',recoveryMessage:'Open this job’s saved settings once to link its address.'});
assert.match(failed.text,/Return address unavailable/);
assert.match(failed.text,/saved settings once to link its address/);
assert.equal(failed.items.filter(x=>x.tag==='a').length,1);
console.log('PASS: recovery progress and error states are distinct and offer only relevant actions.');

const cleared=build({saved:true,ended:true,id:'101'});
assert.match(cleared.text,/Session ended/);
assert.match(cleared.text,/Start a new session/);
assert.ok(cleared.items.find(x=>x.tag==='button'&&x.textContent==='Start new session'));
assert.doesNotMatch(cleared.text,/No letters yet|Add a return address/);
console.log('PASS: cleared client session shows explicit restart, without misreporting an unsaved address.');


const candidates=[{key:'tracked-1',label:'Sample Client — Denver, CO 80201'}];
const linkAvailable=build({id:'101',recoveryMessage:'Address not in fetched HTML.',candidates});
const selector=linkAvailable.items.find(x=>x.id==='spLedgerLinkClient');
const linkButton=linkAvailable.items.find(x=>x.tag==='button'&&x.textContent==='Link to tracked client');
assert.ok(selector,'missing-address state shows an existing saved-client selector');
assert.equal(selector.children.length,2,'placeholder plus one tracked client are offered');
assert.equal(selector.children[1].value,'tracked-1');
assert.equal(selector.value,'tracked-1','a sole tracked client is preselected for quicker explicit recovery');
assert.ok(linkButton,'recovery offers an explicit local link action');
assert.match(linkAvailable.text,/does not modify Postalocity/,'no native address changes are implied');
selector.value='tracked-1';linkButton.onclick();
assert.deepEqual(linkAvailable.linked,['tracked-1'],'confirmed chooser passes exact session key');
const notLinked=build({id:'101',recoveryMessage:'Address not in fetched HTML.'});
assert.equal(notLinked.items.filter(x=>x.id==='spLedgerLinkClient').length,0,'no selector without a genuine previously tracked client');
console.log('PASS: failed read-only address recovery offers a controlled existing-client link instead of inventing an address.');
