const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const start=src.indexOf("    const money=c=>'$'+(c/100).toFixed(2);");
const end=src.indexOf('    function requestNativeDeletion(){',start);
assert.ok(start>=0&&end>start,'ledger UI source found');
const source=src.slice(start,end);
class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.textContent='';this.className='';this.disabled=false;}
    append(...nodes){this.children.push(...nodes);}
    appendChild(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=[...nodes];}
    get lastChild(){return this.children[this.children.length-1];}
    setAttribute(name,value){this[name]=value;}
    addEventListener(){}
}
const root=new Element('div'),styles=[];
root.id='bureauTotals';
const document={
    head:{append(node){styles.push(node);}},
    createElement:tag=>new Element(tag),
    querySelector:q=>q==='#bureauTotals'?root:q==='#spLedgerPanel'?root.children.find(e=>e.id==='spLedgerPanel')||null:q==='#spLedgerV2Styles'?styles.find(e=>e.id==='spLedgerV2Styles')||null:null
};
const session={address:{name:'Casey Example',address1:'123 Main St',city:'Denver',state:'CO',zip:'80201'}};
let jobs=[
    {id:'101',name:'EX Dispute Letter',session:'client',bureau:'EX',cents:139,status:'Processed',letters:['EX-01.pdf']},
    {id:'102',name:'Direct Creditor Letter',session:'client',bureau:'OTHER',cents:239,status:'Processed',letters:['THD-CBNA.pdf']},
    {id:'103',name:'Unassigned',session:'client',bureau:'Unassigned',cents:999,status:'Processed'},
    {id:'104',name:'',session:'client',bureau:'EX',cents:499,status:'Processed'},
    {id:'105',name:'Untitled job',session:'client',bureau:'OTHER',cents:599,status:'Processed'}
];
const read=key=>key==='session:client'?session:key.startsWith('job:')?jobs.find(j=>j.id===key.slice(4)):null;
const group=job=>({key:job.bureau,label:({EX:'Experian',EQU:'Equifax',TU:'TransUnion',OTHER:'Other',Unassigned:'Unassigned'})[job.bureau]});
const countable=job=>job.bureau!=='Unassigned'&&!!job.name&&!/^(?:UNNAMED|UNTITLED|UNASSIGNED)(?: JOB)?$/i.test(job.name);
const bureauSummary=records=>['EX','EQU','TU','OTHER'].map(key=>{
    const entries=records.filter(j=>j.bureau===key);
    return {key,label:group({bureau:key}).label,jobs:entries.map(job=>({job,group:group(job)})),
        sum:entries.filter(j=>Number.isInteger(j.cents)&&!j.priceNeedsReview).reduce((sum,j)=>sum+j.cents,0),
        pending:entries.filter(j=>!Number.isInteger(j.cents)||j.priceNeedsReview).length};
}).filter(x=>x.jobs.length);
const create=new Function('document','read','group','countable','bureauSummary','sessionJobs','isApproved','id','error','recovering','recoveryMessage','window','navigator','requestNativeDeletion','clearSession','tick','lastView','norm',source+';return render;');
const render=create(document,read,group,countable,bureauSummary,()=>jobs,()=>false,()=> '101','',false,'',{confirm:()=>false},{clipboard:{writeText:async()=>{}}},()=>{},()=>{},()=>{},'',v=>String(v||'').trim());
const flatten=(element)=>[element,...element.children.flatMap(flatten)];
const textAll=(element)=>flatten(element).map(x=>x.textContent||'').join(' ');
render(jobs[0]);
let panel=document.querySelector('#spLedgerPanel');
let sections=flatten(panel).filter(el=>el.className==='sp-ledger-group');
assert.deepEqual(sections.map(el=>el.dataset.bureau),['EX','OTHER'],'only existing bureau sections are rendered');
assert.match(textAll(panel),/EX-01\.pdf/);
assert.match(textAll(panel),/THD-CBNA\.pdf/);
assert.match(textAll(panel),/Casey Example/);
assert.equal(flatten(panel).filter(el=>el.className==='sp-ledger-totalrow').length,2,'two total rows');
assert.equal(flatten(panel).filter(el=>el.textContent==='Copy').length,2,'each available bureau has a Copy button');
assert.match(textAll(panel),/Total: \$3\.78/);
assert.doesNotMatch(textAll(panel),/unassigned|unnamed|untitled|#103|#104|#105/i);
assert.equal(flatten(panel).filter(el=>el.tag==='select').length,0,'no manual bureau dropdown exists anywhere in client totals');
assert.equal(flatten(panel).filter(el=>el.className==='sp-ledger-letter').length,2,'only two named, classified jobs are displayed');
jobs[1].priceNeedsReview=true;
render(jobs[0]);
panel=document.querySelector('#spLedgerPanel');
assert.match(textAll(panel),/Subtotal: \$1\.39/);
assert.doesNotMatch(textAll(panel),/unverified prices|Copy buttons are disabled|Not included in total|Approved totals remain|Closing an unapproved tab|#[0-9]+|New ·/i,'no verbose operational messages');
assert.equal(flatten(panel).filter(el=>el.className==='sp-ledger-meta').length,0,'no technical metadata/status rows');
const pending=flatten(panel).find(el=>el.className==='sp-ledger-price'&&el.dataset.pending==='true');
assert.ok(pending,'missing job price is indicated inline without warnings');
assert.equal(pending.textContent,'Pending');
const otherTotal=flatten(panel).find(el=>el.className==='sp-ledger-totalrow'&&el.dataset.bureau==='OTHER');
assert.equal(otherTotal.children[2].disabled,true,'unverified bureau cannot copy a misleading amount');
// Empty jobs now use the original 320px-wide, 240px-min-height panel.
const panelSource=src.slice(src.indexOf('// FLOATING SIDE PANEL'),src.indexOf('// TEMPORARY, DEVICE-LOCAL CLIENT TOTALS'));
assert.match(panelSource,/width:'320px'/,'original width restored');
assert.match(panelSource,/minHeight:'240px'/,'original minimum height restored');
assert.match(panelSource,/top:'170px'/,'panel starts 50px lower');
assert.doesNotMatch(panelSource,/top:'120px'/,'old position removed');
assert.match(panelSource,/border:'2px solid #202a36'/,'dark outer frame');
assert.doesNotMatch(panelSource,/EMPTY_HEIGHT_SCALE|spEmptyTotalsSize|data-empty|mascot|awts\\.png/i,'no enlargement or mascot code remains');
assert.doesNotMatch(src,/awts\\.png|postalMascot|miniMascot|applyMascotPosition|MASCOT_SETTINGS/i,'script contains no mascot asset references');
const innerCSS=src.slice(src.indexOf("style.textContent=`",src.indexOf("    function render(r){")),src.indexOf("document.head.append(style);",src.indexOf("    function render(r){")));
assert.match(innerCSS,/border-radius:0!important/,'no rounded corners inside ledger');
assert.ok(innerCSS.includes('.sp-ledger-title{background:#202a36;color:#f5c34f'),'contrasting dark header');
assert.ok(innerCSS.includes('.sp-ledger-totalrow button{background:#202a36'),'strong Copy contrast');
assert.ok(innerCSS.includes('button:disabled{opacity:'),'disabled styles retained');
assert.ok(innerCSS.includes('button:focus-visible'),'keyboard focus styles retained');
jobs=[];
render({id:'101',name:'EX Dispute Letter',session:'client'});
const emptyPanel=document.querySelector('#spLedgerPanel');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-group').length,0);
assert.match(textAll(emptyPanel),/No letters yet/,'empty client still has a concise message');
assert.equal(root.dataset.empty,undefined,'no empty-state size flag remains');
jobs=[{id:'101',name:'EX Dispute Letter',session:'client',bureau:'EX',cents:139,status:'Processed'}];
render(jobs[0]);
assert.equal(root.dataset.empty,undefined,'populated panel has no sizing flag');
console.log('PASS: original 320x240 panel restored; no enlarged empty-state or mascot references; populated and empty jobs still render correctly.');
console.log('PASS: minimalist ledger renders job/letter/price only, hides technical metadata, keeps subtotal honest and disables incomplete bureau copy.');
