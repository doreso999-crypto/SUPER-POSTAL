const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const start=src.indexOf('const SP_PROCESS_SCARE_MEDIA=');
const end=src.indexOf('function spInstallProcessJobGuard(){',start);
assert.ok(start>0&&end>start,'scare module extracted');
const code=src.slice(start,end);
assert.match(src,/if\(control&&spIsNativeProcessJobControl\(control\)\)\s*spProcessScareGuard\(event,control\)/);
assert.match(src,/spProcessScareGuard\(event,clicked\)/);
assert.match(src,/spProcessScareGuard\(event,form\)/);
assert.match(code,/spBlockIncompleteProcess\(event,control\)/,'existing readiness gate stays first');
assert.match(code,/spJobDetailsReadiness\(\)/,'readiness rechecked before processing');
assert.match(code,/spScareBypass=true/,'replayed click bypasses scare recursion');
assert.match(code,/video\.volume=0\.6/,'video volume is limited');
assert.match(code,/prefers-reduced-motion/,'motion-sensitive users have static fallback');

class Element{
    constructor(tag){
        this.tag=tag;this.children=[];this.events={};this.style={};
        this.attributes={};this.id='';this.textContent='';this.className='';this.type='';
        this.isConnected=true;this.focused=false;this.removed=false;
        if(tag==='video'||tag==='audio'){
            this.playCalls=0;this.pauseCalls=0;
            this.play=()=>{this.playCalls++;return Promise.resolve();};
            this.pause=()=>{this.pauseCalls++;};
        }
    }
    append(...nodes){nodes.forEach(x=>this.appendChild(x));}
    appendChild(node){node.parent=this;this.children.push(node);return node;}
    insertBefore(node,before){node.parent=this;const i=this.children.indexOf(before);this.children.splice(i<0?this.children.length:i,0,node);}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,fn){this.events[k]=fn;}
    remove(){this.removed=true;this.isConnected=false;if(this.parent){this.parent.children=this.parent.children.filter(x=>x!==this);}}
    focus(){this.focused=true;}
    fire(k,event={}){if(this.events[k])this.events[k](event);}
}
const flatten=x=>[x,...x.children.flatMap(flatten)];
let nextTimer=0,timers=new Map();
const setTimeoutMock=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;};
const clearTimeoutMock=id=>timers.delete(id);
const runTimer=id=>{const t=timers.get(id);assert.ok(t,'timer exists');timers.delete(id);t.fn();};
const body=new Element('body'),head=new Element('head'),document={
    body,head,createElement:tag=>new Element(tag),
    querySelector:q=>q==='#spProcessScareStyles'?head.children.find(x=>x.id==='spProcessScareStyles')||null:
        q==='#spProcessScare'?body.children.find(x=>x.id==='spProcessScare')||null:null
};
let complete=true,warningCount=0,toastCount=0,reviewCount=0;
const realClick={count:0},control={isConnected:true,form:null,click(){realClick.count++;}},form={requestSubmit(){realClick.count++;}};
const block=(event)=>{if(!complete){event.preventDefault();return true;}return false;};
const factory=new Function(
    'document','window','spBlockIncompleteProcess','spJobDetailsReadiness','spProcessJobWarning','spShowProcessToast',
    'spQueueRecipientOverview','setTimeout','clearTimeout',code+
    ';return {spProcessScareGuard,spScareClose,spScareProceed,media:SP_PROCESS_SCARE_MEDIA,getPending:()=>spScarePending,getBypass:()=>spScareBypass};'
);
const api=factory(document,{},block,()=>({ready:complete,missing:complete?[]:['Saved return address']}),
    ()=>warningCount++,()=>toastCount++,()=>reviewCount++,setTimeoutMock,clearTimeoutMock);
function evt(type='click',target=control){
    return {type,target,prevented:0,stopped:0,immediate:0,
        preventDefault(){this.prevented++;},stopPropagation(){this.stopped++;},
        stopImmediatePropagation(){this.immediate++;}};
}
complete=false;
let e=evt();
assert.equal(api.spProcessScareGuard(e,control),true);
assert.equal(api.getPending(),null,'incomplete jobs never open the scare');
assert.equal(realClick.count,0);
console.log('PASS: incomplete job stays blocked before any scare animation or native processing.');

complete=true;
e=evt();
assert.equal(api.spProcessScareGuard(e,control),true);
assert.equal(e.prevented,1);
let pending=api.getPending();
assert.ok(pending&&pending.overlay);
assert.equal(body.children.filter(x=>x.id==='spProcessScare').length,1);
assert.ok(flatten(pending.overlay).some(x=>x.className==='sp-scare-original'),'original no-asset fallback appears');
assert.ok(flatten(pending.overlay).some(x=>x.textContent==='DON’T LOOK BACK'));
const overlay=pending.overlay, skip=flatten(overlay).find(x=>x.textContent==='Skip and process');
const cancel=flatten(overlay).find(x=>x.textContent==='Cancel');
assert.ok(skip&&cancel,'skip and cancel controls');
assert.equal(realClick.count,0,'original job has not yet started');
assert.equal(api.spProcessScareGuard(evt(),control),true);
assert.equal(api.getPending(),pending,'repeated click cannot create two scares');
skip.fire('click');
assert.equal(realClick.count,1,'skip triggers exactly one native click');
assert.equal(api.getPending(),null);
assert.equal(overlay.removed,true);
assert.equal(timers.size,1,'only the temporary replay bypass reset remains');
for(const [id] of timers)runTimer(id);
assert.equal(api.getBypass(),false);
console.log('PASS: clicking Process displays scare once; Skip and process resumes the native click exactly once.');

api.spProcessScareGuard(evt(),control);
pending=api.getPending();
assert.ok(pending.timer);
runTimer(pending.timer);
assert.equal(realClick.count,2,'end of built-in scare resumes native job');
for(const [id] of timers)runTimer(id);
api.spProcessScareGuard(evt(),control);
pending=api.getPending();
const beforeCancel=realClick.count;
pending.overlay.fire('keydown',{key:'Escape',preventDefault(){}});
assert.equal(api.getPending(),null,'Escape cancels');
assert.equal(realClick.count,beforeCancel,'cancel never processes');
assert.equal(timers.size,0);
api.spProcessScareGuard(evt(),control);
pending=api.getPending();
const beforeButtonCancel=realClick.count;
flatten(pending.overlay).find(x=>x.textContent==='Cancel').fire('click');
assert.equal(api.getPending(),null);
assert.equal(realClick.count,beforeButtonCancel,'Cancel button does not process');
assert.equal(timers.size,0);
console.log('PASS: fallback finishing processes once; Escape and Cancel both stop processing.');

api.spProcessScareGuard(evt(),control);
pending=api.getPending();
complete=false;
runTimer(pending.timer);
assert.equal(realClick.count,beforeCancel,'readiness failure after preview prevents processing');
assert.equal(warningCount,1);
assert.equal(toastCount,1);
assert.equal(reviewCount,1);
for(const [id] of timers)runTimer(id);
complete=true;
console.log('PASS: readiness is revalidated after playback; no native click if details become incomplete.');

api.media.video='https://example.invalid/scary-video.mp4';
api.spProcessScareGuard(evt(),control);
pending=api.getPending();
const video=flatten(pending.overlay).find(x=>x.tag==='video');
assert.ok(video,'video is shown when configured');
assert.equal(video.src,api.media.video);
assert.equal(video.playCalls,1);
assert.equal(video.volume,0.6);
video.fire('ended');
assert.equal(realClick.count,beforeCancel+1,'video end resumes original click');
assert.ok(video.pauseCalls>=1);
for(const [id] of timers)runTimer(id);
api.media.video='';
console.log('PASS: a user-supplied MP4/WebM plays with audio before native processing.');
api.media.video='https://example.invalid/missing.mp4';
api.spProcessScareGuard(evt(),control);
pending=api.getPending();
const brokenVideo=flatten(pending.overlay).find(x=>x.tag==='video');
assert.ok(brokenVideo);
brokenVideo.fire('error');
assert.equal(flatten(pending.overlay).filter(x=>x.className==='sp-scare-original').length,1,'broken media shows fallback once');
brokenVideo.fire('error');
assert.equal(flatten(pending.overlay).filter(x=>x.className==='sp-scare-original').length,1,'repeated error does not duplicate fallback');
const beforeFallback=realClick.count;
runTimer(pending.timer);
assert.equal(realClick.count,beforeFallback+1,'missing media still safely resumes');
for(const [id] of timers)runTimer(id);
api.media.video='';
console.log('PASS: unavailable video falls back once and never hangs processing.');

api.media.gif='https://example.invalid/scary.gif';
api.media.audio='https://example.invalid/scream.mp3';
api.spProcessScareGuard(evt(),control);
pending=api.getPending();
const img=flatten(pending.overlay).find(x=>x.tag==='img');
assert.ok(img&&img.src===api.media.gif);
assert.equal(pending.media.tag,'audio');
assert.equal(pending.media.playCalls,1,'separate audio starts alongside the GIF');
runTimer(pending.timer);
assert.equal(realClick.count,beforeCancel+3);
for(const [id] of timers)runTimer(id);
api.media.gif='';api.media.audio='';
console.log('PASS: GIF and separate sound track work as an alternative to video.');

const submitEvent=evt('submit',form);
api.spProcessScareGuard(submitEvent,form);
pending=api.getPending();
assert.ok(pending,'submit interception also shows scare');
const beforeSubmit=realClick.count;
const submitSkip=flatten(pending.overlay).find(x=>x.textContent==='Skip and process');
submitSkip.fire('click');
assert.equal(realClick.count,beforeSubmit+1,'submit path uses requestSubmit');
for(const [id] of timers)runTimer(id);
console.log('PASS: native form submit path is gated and resumes without duplicate processing.');
