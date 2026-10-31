const fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync('superpostal.js','utf8');
const parserStart=source.indexOf('function spReturnNormalize(');
const parserEnd=source.indexOf('function spReturnIsDefaultPaste(',parserStart);
const readyStart=source.indexOf('const spReturnSaveState=');
const readyEnd=source.indexOf('function spWatchReturnSaveAction(){',readyStart);
const saveActionStart=source.indexOf('function spWatchReturnSaveAction(){');
const saveActionEnd=source.indexOf('// Stop Postalocity',saveActionStart);
const watchStart=source.indexOf('function spWatchFilledReturnFields(){');
const watchEnd=source.indexOf('function addParser(){',watchStart);
assert.ok(parserStart>0&&parserEnd>parserStart&&readyStart>0&&readyEnd>readyStart);
assert.ok(watchStart>0&&watchEnd>watchStart);
assert.ok(saveActionStart>0&&saveActionEnd>saveActionStart);
const code=source.slice(parserStart,parserEnd)+source.slice(readyStart,readyEnd)+
    source.slice(saveActionStart,saveActionEnd)+source.slice(watchStart,watchEnd);
assert.match(code,/spReturnNativePrefillReady/,'native hydrated form detection exists');
assert.match(code,/spReturnSaveState\.dirty=true/,'native form edit tracking exists');
assert.match(code,/modal\.classList\.contains\('show'\)/,'open modal excluded');

const state={id:'101',open:false,fields:{},events:{},visibleError:false};
const observers=[];
class FakeMutationObserver{
    constructor(callback){this.callback=callback;observers.push(this);}
    observe(target,options){this.target=target;this.options=options;}
    notify(){this.callback([]);}
}
const fill=data=>{
    state.fields={};
    for(const [name,value] of Object.entries(data)){
        state.fields[name]={name,value,dataset:{},type:'text',classList:{toggle(){}},closest:q=>q.includes('#envelopeReturn-address')?form:null};
    }
};
const initial={name:'Real Client',address1:'55 Ash Street',city:'Reno',state:'NV',zip:'89501',country:'US'};
const modal={
    dataset:{},style:{get display(){return state.open?'block':'none';}},
    classList:{contains:k=>state.open&&(k==='show'||k==='in')},
    addEventListener:(type,listener)=>{state.events[type]=listener;},
    querySelector:q=>q==='#envelopeReturn-address'?form:null,
    querySelectorAll:()=>state.visibleError?[{hidden:false,getClientRects:()=>[{}]}]:[]
};
const form={
    querySelector:q=>{
        const m=q.match(/input\[name="([^"]+)"\]/);
        return m?state.fields[m[1]]||null:null;
    },
    closest:q=>q==='#settingsReturnAddress-Modal'?modal:null
};
fill(initial);
const document={querySelector:q=>
    q==='#settingsReturnAddress-Modal #envelopeReturn-address'||q==='#envelopeReturn-address'?form:
    q==='#settingsReturnAddress-Modal'?modal:null
};
const values=new Map();
const window={sessionStorage:{
    getItem:k=>values.get(k)||null,
    setItem:(k,v)=>values.set(k,v)
}};
const key=()=>state.id?'sp-pdf-names-for-job-v1-'+state.id:'';
const funcs=new Function('document','window','spPdfMemoryKey','spQueueRecipientOverview','spRefreshFilledReturnFields','MutationObserver',code+
    ';return {spReturnSavedReady,spReturnNativePrefillReady,spReturnMarkSaved,spReturnSignature,spReturnSaveKey,state:spReturnSaveState,spWatchFilledReturnFields,spWatchReturnSaveAction};');
const api=funcs(document,window,key,()=>{},()=>{},FakeMutationObserver);
assert.equal(api.spReturnSavedReady(),true,'native saved form is recognized with no script session marker');
assert.equal(values.size,0,'no synthetic save marker is written when reading saved values');
api.spWatchFilledReturnFields();
assert.ok(state.events.input&&state.events.change);
console.log('PASS: complete real return address preloaded by Postalocity is recognized after reload without a sessionStorage marker.');

state.open=true;
assert.equal(api.spReturnSavedReady(),false,'a currently open form is not treated as saved merely because fields are filled');
state.open=false;
assert.equal(api.spReturnSavedReady(),true);
console.log('PASS: an open editor is not proof of a saved address.');

state.open=true;
state.fields.address1.value='99 Unsaved Street';
state.events.input({isTrusted:true,target:state.fields.address1});
assert.equal(api.state.dirty,true);
assert.equal(api.spReturnSavedReady(),false,'typed draft cannot become saved while modal is open');
state.open=false; // cancel the changes without a successful native save
assert.equal(api.spReturnSavedReady(),false,'closing or canceling does not approve a modified draft');
console.log('PASS: unsaved changes and canceled edits stay blocked.');

state.open=true;
api.state.pending={signature:api.spReturnSignature(form),started:Date.now()};
assert.equal(api.spReturnSavedReady(),false,'pending native save is not confirmed');
api.state.pending=null;
api.spReturnMarkSaved(form);
assert.equal(api.state.dirty,false,'confirmed save clears dirty flag');
assert.equal(api.spReturnSavedReady(),true,'signature of completed native save is accepted');
console.log('PASS: pending native save stays blocked, and confirmed Save Changes is recognized.');

fill({name:'My Name Here',address1:'5325 S Fort Apache Rd',city:'Las Vegas',state:'NV',zip:'89148'});
assert.equal(api.spReturnSavedReady(),false,'Postalocity sample cannot become a real address');
fill({name:'Person',address1:'',city:'Reno',state:'NV',zip:'89501'});
assert.equal(api.spReturnSavedReady(),false,'incomplete form cannot become saved');
console.log('PASS: sample addresses and incomplete fields never qualify.');

fill(initial);api.state.dirty=false;api.state.memory=null;state.open=false;values.clear();
state.id='';
assert.equal(api.spReturnSavedReady(),false,'native prefill is not accepted without a real job ID');
state.id='102';
assert.equal(api.spReturnSavedReady(),true,'another existing job can use its own native prefill');
assert.equal(values.size,0);
console.log('PASS: native recovery requires a job ID and works independently for other saved jobs.');


function clickSave(label){
    state.events.click({target:{
        tagName:'BUTTON',textContent:label,getAttribute:()=>null,matches:()=>false,
        closest:()=>({tagName:'BUTTON',textContent:label,getAttribute:()=>null,matches:()=>false})
    }});
}
function clickCancel(){
    state.events.click({target:{
        tagName:'BUTTON',textContent:'Cancel',getAttribute:()=>null,matches:()=>false,
        closest:()=>({tagName:'BUTTON',textContent:'Cancel',getAttribute:()=>null,matches:()=>false})
    }});
}
fill(initial);api.state.memory=null;api.state.dirty=true;state.id='103';state.open=true;
api.spWatchReturnSaveAction();
assert.equal(observers.length,1,'a native-close observer is installed');
assert.equal(observers[0].target,modal);
clickSave('Save Settings');
assert.ok(api.state.pending,'native Save Settings click is detected');
assert.equal(api.spReturnSavedReady(),false,'pending save stays unconfirmed');
state.open=false;
observers[0].notify();
assert.equal(api.state.pending,null,'pending marker clears after native modal close');
assert.equal(api.spReturnSavedReady(),true,'native close confirms unchanged address without Bootstrap event');
console.log('PASS: successful native Save Settings that closes without Bootstrap event confirms saved address.');

fill(initial);api.state.memory=null;api.state.dirty=true;
state.open=true;observers[0].notify();
clickSave('Save changes');
clickCancel();
state.open=false;observers[0].notify();
assert.equal(api.spReturnSavedReady(),false,'Cancel after a save click is not confirmation');
assert.equal(api.state.pending,null);
console.log('PASS: cancelling an attempted save does not create a false positive.');

api.state.dirty=true;api.state.memory=null;
state.open=true;observers[0].notify();
clickSave('Save changes');state.visibleError=true;
state.open=false;observers[0].notify();
assert.equal(api.spReturnSavedReady(),false,'visible native validation errors block address');
assert.equal(api.state.pending,null);
state.visibleError=false;
console.log('PASS: native save errors cannot be mistaken for successful saves.');
