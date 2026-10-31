const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const start=src.indexOf('const SP_PROCESS_SCARE_MEDIA=');
const end=src.indexOf('function spInstallProcessJobGuard(){',start);
assert.ok(start>0&&end>start,'scare code found');
const code=src.slice(start,end);
assert.match(src,/if\(control&&spIsNativeProcessJobControl\(control\)\)\s*spProcessScareGuard\(event,control\)/);
assert.match(src,/spProcessScareGuard\(event,clicked\)/);
assert.match(src,/spProcessScareGuard\(event,form\)/);
assert.match(code,/spBlockIncompleteProcess\(event,control\)/,'readiness gate is first');
assert.match(code,/spJobDetailsReadiness\(\)/,'readiness rechecked at completion');
assert.match(code,/spScareBypass=true/,'replay bypass prevents infinite loops');
assert.match(code,/video\.volume=0\.6/);
assert.match(code,/prefers-reduced-motion/);
assert.match(code,/overlay\.requestFullscreen/,'real browser fullscreen requested');
assert.match(code,/#spProcessScare video,#spProcessScare img,#spProcessScare iframe\{display:block;width:100%;height:100%/);
assert.doesNotMatch(code,/Skip and process|sp-scare-actions/,'no visible skip UI');
assert.doesNotMatch(code,/const cancel=document.createElement/,'no visible cancel UI');

let requestCount=0,exitCount=0,fullscreenAvailable=true;
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
    remove(){this.removed=true;this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
    focus(){this.focused=true;}
    fire(k,event={}){if(this.events[k])this.events[k](event);}
    requestFullscreen(){
        requestCount++;
        if(!fullscreenAvailable)return Promise.reject(new Error('Not allowed'));
        document.fullscreenElement=this;
        document.fire('fullscreenchange');
        return Promise.resolve();
    }
}
const flatten=e=>[e,...e.children.flatMap(flatten)];
let nextTimer=0;const timers=new Map();
const setTimeoutMock=(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;};
const clearTimeoutMock=id=>timers.delete(id);
const runTimer=id=>{const t=timers.get(id);assert.ok(t,'timer exists');timers.delete(id);t.fn();};
const document={
    body:new Element('body'),head:new Element('head'),fullscreenElement:null,events:new Map(),
    createElement:tag=>new Element(tag),
    addEventListener(name,fn){const ls=this.events.get(name)||new Set();ls.add(fn);this.events.set(name,ls);},
    removeEventListener(name,fn){const ls=this.events.get(name);if(ls)ls.delete(fn);},
    fire(name,event={}){for(const fn of [...(this.events.get(name)||[])])fn(event);},
    exitFullscreen(){exitCount++;this.fullscreenElement=null;this.fire('fullscreenchange');return Promise.resolve();},
    querySelector(q){
        if(q==='#spProcessScareStyles')return this.head.children.find(x=>x.id==='spProcessScareStyles')||null;
        if(q==='#spProcessScare')return this.body.children.find(x=>x.id==='spProcessScare')||null;
        return null;
    }
};
let complete=true,warnings=0,toasts=0,reviews=0;
const native={count:0},control={isConnected:true,form:null,click(){native.count++;}};
const form={requestSubmit(){native.count++;}};
const block=e=>{if(!complete){e.preventDefault();return true;}return false;};
const factory=new Function('document','window','spBlockIncompleteProcess','spJobDetailsReadiness',
    'spProcessJobWarning','spShowProcessToast','spQueueRecipientOverview','setTimeout','clearTimeout',
    code+';return {spProcessScareGuard,spScareClose,spScareProceed,media:SP_PROCESS_SCARE_MEDIA,getPending:()=>spScarePending,getBypass:()=>spScareBypass};');
const api=factory(document,{},block,()=>({ready:complete,missing:complete?[]:['Saved return address']}),
    ()=>warnings++,()=>toasts++,()=>reviews++,setTimeoutMock,clearTimeoutMock);
const evt=(type='click',target=control)=>({
    type,target,prevented:0,stopped:0,immediate:0,
    preventDefault(){this.prevented++;},stopPropagation(){this.stopped++;},
    stopImmediatePropagation(){this.immediate++;}
});
const drainTimers=()=>{for(const [id] of [...timers])runTimer(id);};
function play(){const e=evt();assert.equal(api.spProcessScareGuard(e,control),true);assert.equal(e.prevented,1);return api.getPending();}
function videoOf(p){return flatten(p.overlay).find(e=>e.tag==='video');}
function finishVideo(p){const video=videoOf(p);assert.ok(video);video.fire('ended');}
function escape(){document.fire('keydown',{key:'Escape',preventDefault(){this.prevented=true;}});}
complete=false;
assert.equal(api.spProcessScareGuard(evt(),control),true);
assert.equal(api.getPending(),null);
assert.equal(native.count,0);
console.log('PASS: incomplete jobs never show a scare or submit.');

complete=true;
let pending=play();
assert.ok(pending&&pending.overlay);
assert.equal(requestCount,1,'fullscreen requested during user click');
assert.equal(document.fullscreenElement,pending.overlay);
assert.equal(pending.fullscreenActive,true);
assert.equal(pending.overlay.focused,true);
assert.equal(api.media.page,'https://vlipsy.com/clips/3hEsFXt9');
assert.equal(api.media.video,'https://media.vlipsy.com/vlips/3hEsFXt9/480p.mp4');
assert.ok(videoOf(pending));
assert.equal(videoOf(pending).muted,false);
assert.equal(videoOf(pending).volume,0.6);
assert.equal(flatten(pending.overlay).filter(e=>e.tag==='button').length,0,'no buttons anywhere over the scare');
assert.equal(native.count,0);
api.spProcessScareGuard(evt(),control);
assert.equal(api.getPending(),pending,'repeated clicks never open another scare');
finishVideo(pending);
assert.equal(native.count,1,'processing resumes once after the clip ends');
assert.equal(pending.overlay.removed,true);
assert.equal(document.fullscreenElement,null);
assert.equal(exitCount,1);
drainTimers();
assert.equal(api.getBypass(),false);
assert.equal(document.events.get('keydown').size,0,'Escape handlers do not leak');
console.log('PASS: full-screen audiovisual Vlipsy clip, no buttons, automatic native processing and fullscreen cleanup.');

pending=play();
const beforeEscape=native.count;
escape();
assert.equal(api.getPending(),null);
assert.equal(native.count,beforeEscape,'emergency Escape cancels, not processes');
assert.equal(timers.size,0);
assert.equal(document.fullscreenElement,null);
console.log('PASS: Escape is retained as a hidden emergency cancel.');

pending=play();
const beforeExit=native.count;
document.fullscreenElement=null;
document.fire('fullscreenchange');
assert.equal(api.getPending(),null);
assert.equal(native.count,beforeExit,'browser exit from fullscreen cancels safely');
assert.equal(timers.size,0);
console.log('PASS: browser-level fullscreen exit cancels without unexpected processing.');

pending=play();
const beforeTimer=native.count;
runTimer(pending.timer);
assert.equal(native.count,beforeTimer+1,'timeout continues when direct video does not finish');
drainTimers();
console.log('PASS: stalled video does not leave processing blocked forever.');

pending=play();
complete=false;
const beforeFailed=native.count;
finishVideo(pending);
assert.equal(native.count,beforeFailed,'incomplete job is never submitted after clip');
assert.equal(warnings,1);
assert.equal(toasts,1);
assert.equal(reviews,1);
drainTimers();
complete=true;
console.log('PASS: readiness is revalidated after video ends.');

api.media.video='https://example.invalid/broken.mp4';
pending=play();
const broken=videoOf(pending);
broken.fire('error');
assert.equal(flatten(pending.overlay).filter(e=>e.tag==='iframe').length,1,'embedded Vlipsy player fills the preview on direct-media error');
const iframe=flatten(pending.overlay).find(e=>e.tag==='iframe');
assert.equal(iframe.src,'https://vlipsy.com/embed/3hEsFXt9?autoplay=1');
assert.equal(flatten(pending.overlay).filter(e=>e.tag==='button').length,0);
assert.equal(flatten(pending.overlay).filter(e=>e.tag==='a').length,0,'no links or controls overlay embedded media');
broken.fire('error');
assert.equal(flatten(pending.overlay).filter(e=>e.tag==='iframe').length,1);
const beforeFallback=native.count;
runTimer(pending.timer);
assert.equal(native.count,beforeFallback+1);
drainTimers();
api.media.video='https://media.vlipsy.com/vlips/3hEsFXt9/480p.mp4';
console.log('PASS: failed direct media uses borderless full-screen embed without extra controls.');

fullscreenAvailable=false;
pending=play();
assert.ok(pending.overlay,'overlay still appears when browser refuses fullscreen');
assert.equal(document.fullscreenElement,null);
finishVideo(pending);
drainTimers();
fullscreenAvailable=true;
console.log('PASS: webpage-level full-viewport overlay works when browser fullscreen is denied.');

api.media.video='';
api.media.gif='https://example.invalid/scare.gif';
api.media.audio='https://example.invalid/sound.mp3';
pending=play();
assert.ok(flatten(pending.overlay).some(e=>e.tag==='img'));
assert.equal(pending.media.tag,'audio');
assert.equal(pending.media.playCalls,1);
runTimer(pending.timer);
drainTimers();
api.media.gif='';api.media.audio='';
api.media.video='https://media.vlipsy.com/vlips/3hEsFXt9/480p.mp4';
console.log('PASS: alternative GIF plus audio still works without UI controls.');

const submit=evt('submit',form);
assert.equal(api.spProcessScareGuard(submit,form),true);
pending=api.getPending();
const beforeSubmit=native.count;
finishVideo(pending);
assert.equal(native.count,beforeSubmit+1,'native form processing resumes after playback');
drainTimers();
console.log('PASS: intercepted form submit also waits for the entire video.');
