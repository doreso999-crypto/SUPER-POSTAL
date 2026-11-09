const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const cfgStart=src.indexOf('const SP_PROCESS_SCARE_MEDIA=');
const cfgEnd=src.indexOf('let spScarePending=null;',cfgStart);
const guardStart=src.indexOf('function spProcessScareGuard(event,control){',cfgEnd);
const guardEnd=src.indexOf('function spInstallProcessJobGuard(){',guardStart);
assert.ok(cfgStart>0&&cfgEnd>cfgStart&&guardEnd>guardStart,'scare configuration and guard located');
const cfg=src.slice(cfgStart,cfgEnd);
const config=new Function(cfg+';return {media:SP_PROCESS_SCARE_MEDIA,select:spScareMediaForToday,chance:SP_PROCESS_SCARE_CHANCE};')();
assert.equal(config.chance,0.10,'exact probability is 10%');
for(let weekday=0;weekday<7;weekday++){
    const expected=weekday===3?'6H9KSXHl':'wFNnuAf8';
    const media=config.select({getDay:()=>weekday});
    assert.equal(media.page,'https://vlipsy.com/clips/'+expected,'page for weekday '+weekday);
    assert.equal(media.video,'https://media.vlipsy.com/vlips/'+expected+'/480p.mp4');
    assert.equal(media.embed,'https://vlipsy.com/embed/'+expected);
}
assert.match(src,/const scareMedia=spScareMediaForToday\(\);/,'preview selects media by local day');
const preview=src.slice(src.indexOf('function spScarePreview(control,form){'),guardStart);
assert.match(preview,/const videoURL=scareMedia\.video\.trim\(\)/);
assert.match(preview,/iframe\.src=scareMedia\.embed\+'\?autoplay=1'/);
assert.match(preview,/video\.volume=0\.6/);
assert.doesNotMatch(preview,/SP_PROCESS_SCARE_MEDIA\./,'preview never uses the wrong-day clip');
let ready=true,roll=0.05,draws=0,previews=0,lastForm=null;
const math={random(){draws++;return roll;}};
const guard=new Function('spBlockIncompleteProcess','spScarePreview','Math','SP_PROCESS_SCARE_CHANCE',`
    let spScarePending=null,spScareRegularSubmitForm=null;
    function spScareMarkRegularSubmit(form){spScareRegularSubmitForm=form||null;}
    ${src.slice(guardStart,guardEnd)}
    return spProcessScareGuard;
`)(
    e=>{if(ready)return false;e.preventDefault();return true;},
    ()=>{previews++;},math,config.chance
);
const form={},control={form};
function event(type='click',target=control){
    return {type,target,prevented:0,stopped:0,
        preventDefault(){this.prevented++;},
        stopPropagation(){this.stopped++;},
        stopImmediatePropagation(){this.stopped++;}};
}
ready=false;let e=event();
assert.equal(guard(e,control),true,'incomplete jobs blocked');
assert.equal(draws,0,'no scare roll for incomplete jobs');
assert.equal(previews,0);
ready=true;roll=0.1;e=event();
assert.equal(guard(e,control),false);
assert.equal(previews,0,'exact 10% boundary does not trigger');
assert.equal(e.prevented+e.stopped,0,'native processing remains undisturbed');
roll=0.05;e=event();
const before=draws;
assert.equal(guard(e,control),false);
assert.equal(previews,1,'below 10% triggers one preview');
assert.equal(draws,before+1,'only one random roll for an attempt');
const paired=event('submit',form);
assert.equal(guard(paired,control),false);
assert.equal(draws,before+1,'paired submit does not roll a second time');
assert.equal(paired.prevented+paired.stopped,0);
roll=0.99;e=event();
assert.equal(guard(e,control),false);
assert.equal(previews,1,'outside the chance has no preview');
console.log('PASS: seven-day clip routing, 10% probability, native processing and paired submits');
