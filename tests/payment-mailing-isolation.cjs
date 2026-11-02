const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const classifyStart=src.indexOf('function spIsNativeMailingApprovalControl(');
const classifyEnd=src.indexOf('// Non-blocking visual toast',classifyStart);
const installStart=src.indexOf('function spInstallProcessJobGuard(){');
const installEnd=src.indexOf('function spRefreshRecipientPdfOverview(){',installStart);
assert.ok(classifyStart>0&&classifyEnd>classifyStart&&installStart>0&&installEnd>installStart);
const classify=src.slice(classifyStart,classifyEnd);
const install=src.slice(installStart,installEnd);
const events={};
const doc={
    documentElement:{dataset:{}},
    body:{},
    activeElement:null,
    addEventListener(name,fn,options){(events[name]??=[]).push(fn);}
};
let updates=0,guardCalls=0;
const guarded=[];
const factory=new Function('document','setInterval','spScheduleProcessControlUpdate','spUpdateProcessControlState','spProcessScareGuard',
    classify+install+';return {spInstallProcessJobGuard,spIsNativeProcessJobControl,spIsNativeMailingApprovalControl};');
const api=factory(doc,()=>{},()=>updates++,()=>{},(event,control)=>{guardCalls++;guarded.push(control);});
api.spInstallProcessJobGuard();
assert.equal(doc.documentElement.dataset.spProcessJobGuard,'true');
assert.ok(events.click&&events.submit);
const step={};
function button(id,label,onclick='',name=''){
    const attrs={name,onclick};
    const btn={id,tagName:'BUTTON',textContent:label,form:null,
        getAttribute:k=>attrs[k]||null,
        closest:q=>q==='#step4'?step:q==='#spRecipientPdfOverview'?null:q.startsWith('button,')?btn:null
    };
    return btn;
}
const process=button('processBtn','Process this job','processJob()');
const pay=button('approveJob','Pay & Approve Mailing','approveJob()');
const payAnd=button('approveMailing','Pay and Approve Mailing','payAndApproveMailing()');
const approve=button('approveJob','Approve Mailing','approveJob()');
const approvalOther=button('approveJob','Approve Job','approveJob()');
const payOnly=button('payNow','Pay Now','makePayment()');
const form={
    closest:q=>q==='#step4'?step:null,
    querySelector:q=>q.includes('processJob')?process:null
};
for(const b of [pay,payAnd,approve,approvalOther,payOnly,process])b.form=form;
assert.equal(api.spIsNativeProcessJobControl(process),true);
assert.equal(api.spIsNativeMailingApprovalControl(pay),true);
for(const b of [pay,payAnd,approve,approvalOther,payOnly]){
    assert.equal(api.spIsNativeProcessJobControl(b),false,b.textContent+' must never be treated as Process Job');
}
function click(btn){
    const e={target:btn,type:'click'};
    for(const fn of events.click)fn(e);
}
function submit(btn){
    if(btn)doc.activeElement=btn;
    const e={target:form,submitter:btn,type:'submit'};
    for(const fn of events.submit)fn(e);
}
for(const btn of [pay,payAnd,approve,approvalOther,payOnly]){
    const before=guardCalls;
    click(btn);submit(btn);
    assert.equal(guardCalls,before,'payment/approval must bypass readiness and scare: '+btn.textContent);
}
console.log('PASS: Pay & Approve Mailing, Pay and Approve Mailing, Approve Mailing and Pay Now bypass both click and form-submit guards.');
click(process);
assert.equal(guardCalls,1,'Process This Job still triggers safety/scare guard');
assert.equal(guarded.at(-1),process);
submit(process);
assert.equal(guardCalls,2,'Process This Job still triggers native form submit guard');
console.log('PASS: Process This Job remains guarded without altering payment/approval actions.');
doc.activeElement=doc.body;
submit(null);
assert.equal(guardCalls,3,'ambiguous process-form submit retains fallback protection');
doc.activeElement=pay;
submit(null);
assert.equal(guardCalls,3,'active Pay control prevents the broad process-form fallback');
console.log('PASS: only an ambiguous process form submission gets fallback guard; active payment control never does.');
