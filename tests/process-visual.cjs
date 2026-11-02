const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('superpostal.js','utf8');
const first=source.indexOf('function spJobDetailsReadiness(){');
const mid=source.indexOf('// Non-blocking visual toast',first);
const visualStart=source.indexOf('let spProcessVisualTimer=');
const visualEnd=source.indexOf('function spInstallProcessJobGuard(){',visualStart);
assert.ok(first>0&&mid>first&&visualStart>0&&visualEnd>visualStart);
const code=source.slice(first,mid)+'\n'+source.slice(visualStart,visualEnd);
let jobName='',recipients=[],pdfs=[],saved=false,hint=null,style=null;
const attributes=new Map();
const classes=new Set();
const step={querySelectorAll:()=>[button,payButton,approveButton]};
const button={
 id:'processBtn',tagName:'BUTTON',textContent:'Process this job',disabled:false,title:'Process job',
 dataset:{},value:'',classList:{add:v=>classes.add(v),remove:v=>classes.delete(v)},
 closest:q=>q==='#step4'?step:null,
 getAttribute:q=>attributes.get(q)||null,hasAttribute:q=>attributes.has(q),
 setAttribute:(q,v)=>attributes.set(q,v),removeAttribute:q=>attributes.delete(q),
 insertAdjacentElement:(where,node)=>{hint=node;}
};
// These native payment/approval buttons must never be disabled or styled by
// SUPER-POSTAL's separate Process This Job readiness checks.
function unrelated(id,label){
    const values=new Map();
    return {id,tagName:'BUTTON',textContent:label,disabled:false,dataset:{},value:'',
        title:label,tagName:'BUTTON',classList:{add(){throw Error('Do not style native payment/approval controls');},remove(){}},
        closest:q=>q==='#step4'?step:null,
        getAttribute:q=>values.get(q)||null,hasAttribute:q=>values.has(q),
        setAttribute:(q,v)=>values.set(q,v),removeAttribute:q=>values.delete(q)
    };
}
const payButton=unrelated('approveJob','Pay & Approve Mailing');
const approveButton=unrelated('approveMailing','Approve Mailing');
const document={
 head:{appendChild:e=>{style=e;}},
 querySelector:q=>q==='#step4'?step:q==='#overview-jobName'?{value:jobName}:
 q==='#step3 .contactListSize'?{textContent:String(recipients.length)}:
 q==='#spProcessDisabledStyle'?style:q==='#spProcessMissingHint'?hint:null,
 createElement:tag=>({
 tag,id:'',textContent:'',style:{},dataset:{},
 setAttribute(){},remove(){hint=null;}
 })
};
const run=new Function('document','spRecipientNamesFromPage','spPdfNamesFromPage','spReturnSavedReady','setTimeout',code+'\nreturn {spJobDetailsReadiness,spUpdateProcessControlState};');
const functions=run(document,()=>recipients,()=>pdfs,()=>saved,()=>1);
let state=functions.spJobDetailsReadiness();
assert.equal(state.ready,false);
assert.ok(state.missing.includes('Job name')&&state.missing.includes('Recipient names'));
functions.spUpdateProcessControlState();
assert.equal(button.disabled,true,'incomplete job is disabled');
assert.equal(payButton.disabled,false,'Pay & Approve Mailing remains enabled with incomplete details');
assert.equal(approveButton.disabled,false,'Approve Mailing remains enabled with incomplete details');
assert.equal(payButton.getAttribute('aria-disabled'),null);
assert.equal(approveButton.getAttribute('aria-disabled'),null);
assert.equal(classes.has('sp-process-not-ready'),true);
assert.ok(hint&&hint.textContent.includes('Job name'));
jobName='Client EX';recipients=['Experian'];pdfs=['client-ex.pdf'];saved=true;
state=functions.spJobDetailsReadiness();
assert.equal(state.ready,true);
functions.spUpdateProcessControlState();
assert.equal(button.disabled,false,'complete job is enabled again');
assert.equal(payButton.disabled,false);
assert.equal(approveButton.disabled,false);
assert.equal(classes.has('sp-process-not-ready'),false);
assert.equal(hint,null,'completion hint disappears');
saved=false;
functions.spUpdateProcessControlState();
assert.equal(button.disabled,true,'removing saved return address disables processing again');
assert.ok(hint.textContent.includes('Saved return address'));
assert.equal(payButton.disabled,false);
assert.equal(approveButton.disabled,false);
console.log('PASS: four completeness checks; Process This Job alone is disabled when incomplete.');
console.log('PASS: native Pay & Approve Mailing / Approve Mailing controls are never disabled, styled or gated.');
