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
        'linkableSessions','linkJobToClient','returnAddress','sessionForAddress','write'];
    const factory=new Function(...args,source+';return render;');
    const render=factory(document,read,()=>({key:'EX'}),()=>false,()=>[],()=>[],()=>false,()=>id,'',recovering,
        recoveryMessage,{confirm:()=>false},{clipboard:{writeText:async()=>{}}},()=>{},()=>{},()=>{},'',x=>String(x||'').trim(),
        {origin:'https://postalocity.example'},FakeURL,new Set(['101']),()=>{recoverCalls++;},()=>{},{clear(){}},()=>[],
        ()=>candidates,(key)=>{linked.push(key);return true;},()=>null,()=>'',()=>true);
    render(saved?job:null);
    const panel=document.querySelector('#spLedgerPanel');
    assert.ok(panel,'render creates the panel');
    return {panel,text:textAll(panel),items:flatten(panel),recoverCalls,box,linked};
}

// Missing sender recovery stays silent and never invents a client or job.
const noAddress=build();
assert.match(noAddress.text,/No tracked jobs yet/);
assert.doesNotMatch(noAddress.text,/Return address unavailable|Total: \$0\.00/);
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-onboard').length,1);
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-onboard-index').length,0);
assert.equal(noAddress.items.filter(x=>x.className==='sp-ledger-group').length,0);
const pending=build({id:'101',recovering:true});
const failed=build({id:'101',recoveryMessage:'Address not in fetched HTML.'});
for(const state of [pending,failed]){
 assert.match(state.text,/No tracked jobs yet/);
 assert.doesNotMatch(state.text,/Return address unavailable|Checking saved settings/);
 assert.equal(state.items.filter(x=>x.id==='spLedgerLinkClient').length,0);
}
const emptyLetters=build({saved:true,id:'101'});
assert.match(emptyLetters.text,/Sample Client/);assert.match(emptyLetters.text,/No letters yet/);
assert.equal(emptyLetters.items.filter(x=>x.className==='sp-ledger-group').length,0);
const cleared=build({saved:true,ended:true,id:'101'});
assert.match(cleared.text,/Session ended/);
assert.ok(cleared.items.find(x=>x.tag==='button'&&x.textContent==='Start new session'));
console.log('PASS: silent empty recovery, no fabricated totals, no manual client guessing, and explicit cleared-session restart.');
