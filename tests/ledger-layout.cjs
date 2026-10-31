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
// The empty state keeps the original 320px width but grows to 600px high.
// Populated and minimized panel sizes are unchanged.
assert.equal(root.dataset.empty,'false','a populated panel must keep its normal dimensions');
const emptyCSS=src.slice(src.indexOf("emptyStyle.textContent=`"),src.indexOf("document.head.appendChild(emptyStyle);"));
assert.match(emptyCSS,/width:min\(320px,calc\(100vw - 30px\)\)!important/,'empty panel stays 320px wide');
assert.match(emptyCSS,/min-height:max\(140px,min\(\$\{240\*EMPTY_HEIGHT_SCALE\}px,calc\(100vh - 150px\)\)\)!important/,'height is scaled but viewport-capped');
assert.match(emptyCSS,/\[data-empty="true"\]\[data-minimized="false"\]/);
assert.match(src,/const EMPTY_HEIGHT_SCALE=2\.5;/);
jobs=[];
render({id:'101',name:'EX Dispute Letter',session:'client'});
assert.equal(root.dataset.empty,'true','empty panel should enlarge automatically');
const emptyPanel=document.querySelector('#spLedgerPanel');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-group').length,0);
assert.match(textAll(emptyPanel),/No letters yet/,'empty state includes a readable centered message');
assert.equal(flatten(emptyPanel).filter(el=>el.className==='sp-ledger-empty').length,1,'one empty-state message');
assert.match(emptyCSS,/height:max\\(140px,min\\(\\$\\{240\\*EMPTY_HEIGHT_SCALE\\}px,calc\\(100vh - 150px\\)\\)\\)!important/,'parent has a real height to let child fill the expanded area');
assert.match(emptyCSS,/display:flex;\\s*flex:1 1 auto;\\s*flex-direction:column;\\s*align-self:stretch;/,'empty-state content stretches vertically');
assert.match(emptyCSS,/justify-content:space-between;/,'title and content are distributed through the larger panel');
assert.match(emptyCSS,/\\.sp-ledger-empty\\{[\\s\\S]*?flex:1 1 auto;[\\s\\S]*?font-size:18px;/,'empty message grows and centers in available space');
assert.match(emptyCSS,/\\.sp-ledger-title\\{[\\s\\S]*?font-size:14px;/,'empty-state heading becomes more readable');
assert.match(emptyCSS,/\\.sp-ledger-footer\\{[\\s\\S]*?margin-top:auto;/,'footer is anchored at the bottom in the empty state');
assert.match(emptyCSS,/min-height:44px;/,'empty state controls have comfortable tap/click size');
assert.match(emptyCSS,/@media\\(max-height:520px\\)/,'short viewport adjusts enlarged content');
jobs=[{id:'101',name:'EX Dispute Letter',session:'client',bureau:'EX',cents:139,status:'Processed'}];
render(jobs[0]);
assert.equal(root.dataset.empty,'false','size returns to normal when a named job appears');
console.log('PASS: 320px-wide, 600px-tall empty panel stretches and scales heading, centered message, and footer; populated and minimized states unchanged.');
console.log('PASS: minimalist ledger renders job/letter/price only, hides technical metadata, keeps subtotal honest and disables incomplete bureau copy.');
