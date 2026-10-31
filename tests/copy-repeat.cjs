const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const start=src.indexOf("    const money=c=>'$'+(c/100).toFixed(2);");
const end=src.indexOf('    function requestNativeDeletion(){',start);
assert.ok(start>=0&&end>start,'client totals renderer found');
const code=src.slice(start,end);
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
const document={
    createElement:tag=>new Element(tag),
    head:{append(el){styles.push(el);}},
    querySelector:q=>q==='#bureauTotals'?root:q==='#spLedgerPanel'?root.children.find(e=>e.id==='spLedgerPanel')||null:
      q==='#spLedgerV2Styles'?styles.find(e=>e.id==='spLedgerV2Styles')||null:null
};
const client={address:{name:'Test Client',address1:'123 Main',city:'Denver',state:'CO',zip:'80201'}};
let jobs=[{id:'101',name:'EX Dispute',session:'client',bureau:'EX',cents:139,status:'Processed'}];
const read=key=>key==='session:client'?client:key.startsWith('job:')?jobs.find(j=>j.id===key.slice(4)):null;
const group=r=>({key:r.bureau,label:r.bureau==='EX'?'Experian':'Other'});
const bureauSummary=items=>['EX','OTHER'].map(key=>{
    const matching=items.filter(j=>j.bureau===key);
    return {key,label:key==='EX'?'Experian':'Other',jobs:matching.map(job=>({job,group:group(job)})),
       sum:matching.filter(j=>!j.priceNeedsReview&&Number.isInteger(j.cents)).reduce((x,j)=>x+j.cents,0),
       pending:matching.filter(j=>j.priceNeedsReview||!Number.isInteger(j.cents)).length};
}).filter(b=>b.jobs.length);
const copied=[],timers=new Map();
let nextTimer=0,failCopy=false,tickCalls=0;
const clipboard={async writeText(amount){
    if(failCopy)throw new Error('Clipboard blocked');
    copied.push(amount);
}};
const setTimer=fn=>{const id=++nextTimer;timers.set(id,fn);return id;};
const clearTimer=id=>timers.delete(id);
const runTimer=()=>{const handlers=[...timers.values()];timers.clear();handlers.forEach(fn=>fn());};
const args=['document','read','group','countable','bureauSummary','sessionJobs','isApproved','id','error','recovering','recoveryMessage',
    'window','navigator','requestNativeDeletion','clearSession','tick','lastView','norm','setTimeout','clearTimeout'];
const render=new Function(...args,code+';return render;')(document,read,group,()=>true,bureauSummary,()=>jobs,()=>false,()=> '101','',false,'',
    {confirm:()=>false},{clipboard},()=>{},()=>{},()=>{tickCalls++;},'',x=>String(x||'').trim(),setTimer,clearTimer);
const flatten=el=>[el,...el.children.flatMap(flatten)];
const findCopy=()=>flatten(document.querySelector('#spLedgerPanel')).find(el=>el.tag==='button'&&el.textContent==='Copy');
async function run(){
    render(jobs[0]);
    const button=findCopy();
    assert.ok(button&&!button.disabled);
    await button.onclick();
    assert.equal(button.textContent,'Copied');
    assert.deepEqual(copied,['$1.39']);
    assert.equal(button.disabled,false,'success never disables Copy');
    await button.onclick();
    assert.deepEqual(copied,['$1.39','$1.39'],'second click copies again while showing Copied');
    assert.equal(timers.size,1,'feedback timer resets rather than accumulating');
    runTimer();
    assert.equal(button.textContent,'Copy','button returns to Copy automatically');
    jobs[0].cents=249;
    await button.onclick();
    assert.equal(copied.at(-1),'$2.49','same button copies the latest stored bureau amount');
    runTimer();
    failCopy=true;
    await button.onclick();
    assert.equal(button.textContent,'Retry');
    assert.equal(button.disabled,false,'failed clipboard action remains repeatable');
    runTimer();
    assert.equal(button.textContent,'Copy');
    failCopy=false;
    await button.onclick();
    assert.equal(copied.at(-1),'$2.49','retry after failure succeeds');
    runTimer();
    jobs[0].priceNeedsReview=true;
    const earlier=copied.length;
    await button.onclick();
    assert.equal(copied.length,earlier,'stale button must not copy incomplete totals');
    assert.equal(button.disabled,true,'incomplete total still cannot be copied');
    assert.ok(tickCalls>=1,'pending amount triggers panel refresh');
    console.log('PASS: repeated Copy actions, transient feedback reset, current amount, clipboard failure/retry, and incomplete total safeguard.');
}
module.exports=run;
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
