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
const realClientChip=flatten(panel).find(el=>el.className==='sp-ledger-client-chip');
assert.ok(realClientChip,'real client has a prominent name chip');
assert.equal(realClientChip.textContent,'Casey Example');
assert.equal(realClientChip.dataset.placeholder,undefined,'real client is not mistaken for an example');
assert.equal(session.address.name,'Casey Example','rendering does not alter the stored sender name');
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
assert.match(panelSource,/top:'145px'/,'panel raised by 25px');
assert.doesNotMatch(panelSource,/top:'120px'/,'old position removed');
assert.match(panelSource,/border:'2px solid #202a36'/,'dark outer frame');
assert.ok(panelSource.includes("background:'#fff'"),'outer background is white');
assert.equal((panelSource.match(/boxShadow:'none'/g)||[]).length,3,'no shadows in normal, minimized or restored states');
assert.ok(panelSource.includes("heading.textContent='CLIENT TOTALS'"),'title is in the yellow header next to minimize');
assert.doesNotMatch(panelSource,/EMPTY_HEIGHT_SCALE|spEmptyTotalsSize|data-empty|mascot|awts\\.png/i,'no enlargement or mascot code remains');
assert.doesNotMatch(src,/awts\\.png|postalMascot|miniMascot|applyMascotPosition|MASCOT_SETTINGS/i,'script contains no mascot asset references');
const innerCSS=src.slice(src.indexOf("style.textContent=`",src.indexOf("    function render(r){")),src.indexOf("document.head.append(style);",src.indexOf("    function render(r){")));
assert.doesNotMatch(innerCSS,/border-radius:0!important/,'button rounding is not globally overridden');
assert.ok(innerCSS.includes('.sp-ledger-title{display:none'),'old inner title is suppressed');
assert.ok(innerCSS.includes('button{font:700 11px Arial,sans-serif;border:1px solid #314052;border-radius:8px'),'action buttons are slightly rounded');
assert.ok(innerCSS.includes('.sp-ledger-totalrow button{background:#202a36'),'strong Copy contrast');
assert.ok(innerCSS.includes('.sp-ledger-onboard > a,')&&innerCSS.includes('border-radius:8px'),'empty-state settings link uses a rounded button treatment');
assert.ok(src.includes("panel.style.cssText='position:relative;z-index:5;cursor:default;max-height:72vh;overflow:auto;border:0;border-radius:0;background:#fff"),'interior background is white');
assert.doesNotMatch(src,/panel.append\(el\('div','CLIENT TOTALS'\)\)/,'old duplicate heading removed');
assert.ok(innerCSS.includes('button:disabled{opacity:'),'disabled styles retained');
assert.ok(innerCSS.includes('button:focus-visible'),'keyboard focus styles retained');
assert.ok(innerCSS.includes('.sp-ledger-client-chip{display:inline-block;max-width:100%;padding:6px 10px;border:1px solid #b4dec3;border-radius:8px;background:#eaf7ef'),'real names receive subtle mint rather than an aggressive green fill');
assert.ok(innerCSS.includes('.sp-ledger-client-chip[data-placeholder="true"]{background:#fff5dd'),'unconfirmed example uses amber instead of green');
assert.ok(innerCSS.includes('.sp-ledger-onboard{display:flex;flex-direction:column'),'empty state has a structured compact card');
assert.ok(innerCSS.includes('.sp-ledger-onboard-index{display:inline-flex'),'empty state has a compact stage marker');
assert.ok(innerCSS.includes('.sp-ledger-onboard-title{font-size:15px'),'empty state has clear typography');
assert.ok(innerCSS.includes('.sp-ledger-onboard-desc{font-size:12px'),'empty state has secondary explanatory text');
assert.ok(innerCSS.includes('.sp-ledger-onboard > a,')&&innerCSS.includes('.sp-ledger-onboard > button{'),'empty state has clear action controls');

jobs=[];
render({id:'101',name:'EX Dispute Letter',session:'client'});
const emptyPanel=document.querySelector('#spLedgerPanel');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-group').length,0);
assert.match(textAll(emptyPanel),/No letters yet/,'empty client still has a concise message');
assert.match(textAll(emptyPanel),/Add a named job and its recipient/,'client with an address sees the next practical step');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-onboard').length,1,'no duplicated empty cards');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-onboard-title').length,1);
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-onboard-index')[0].textContent,'02','letters is second step');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-group').length,0,'empty state never fabricates bureau groups');
assert.equal(root.dataset.empty,undefined,'no empty-state size flag remains');
jobs=[{id:'101',name:'EX Dispute Letter',session:'client',bureau:'EX',cents:139,status:'Processed'}];
render(jobs[0]);
assert.equal(root.dataset.empty,undefined,'populated panel has no sizing flag');
session.address.name='Sampla A Sample';
render(jobs[0]);
let placeholderChip=flatten(document.querySelector('#spLedgerPanel')).find(el=>el.className==='sp-ledger-client-chip');
assert.equal(placeholderChip.textContent,'Client name','site demo label is replaced with explicit placeholder');
assert.equal(placeholderChip.dataset.placeholder,'true','demo label uses caution tint');
assert.equal(session.address.name,'Sampla A Sample','visual replacement must not change Postalocity data');
assert.doesNotMatch(textAll(document.querySelector('#spLedgerPanel')),/Sampla A Sample/);
session.address.name='Sample A. Sample';
render(jobs[0]);
placeholderChip=flatten(document.querySelector('#spLedgerPanel')).find(el=>el.className==='sp-ledger-client-chip');
assert.equal(placeholderChip.textContent,'Client name','alternate postal sample spelling recognized');
session.address.name='Jordan Ellis';
render(jobs[0]);
const restoredChip=flatten(document.querySelector('#spLedgerPanel')).find(el=>el.className==='sp-ledger-client-chip');
assert.equal(restoredChip.textContent,'Jordan Ellis','real names are displayed unchanged');
assert.equal(restoredChip.dataset.placeholder,undefined,'real name uses mint badge');
console.log('PASS: original 320x240 panel restored; no enlarged empty-state or mascot references; populated and empty jobs still render correctly.');
console.log('PASS: real client names display on a mint chip, sample names appear as an amber Client name placeholder, saved data remains unchanged.');
console.log('PASS: minimalist ledger renders job/letter/price only, hides technical metadata, keeps subtotal honest and disables incomplete bureau copy.');
