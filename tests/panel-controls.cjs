const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const begin=src.indexOf('// FLOATING SIDE PANEL');
const end=src.indexOf('// TEMPORARY, DEVICE-LOCAL CLIENT TOTALS',begin);
assert.ok(begin>=0&&end>begin,'panel source exists');
const panelCode=src.slice(begin,end);
assert.doesNotMatch(panelCode,/awts\\.png|MutationObserver|data-empty|EMPTY_HEIGHT_SCALE|spEmptyTotalsSize/i);
assert.doesNotMatch(src,/awts\.png|postalMascot|MASCOT_SETTINGS|miniMascot/i);
assert.match(panelCode,/width:'320px'/);
assert.match(panelCode,/minHeight:'240px'/);
assert.match(src,/#bureauTotals\[data-minimized="true"\] #spLedgerPanel\{display:none\}/,
    'ledger content hides when minimized');

const body=[],created=[],handlers={};
class Element {
    constructor(tag){
        this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.events={};
        this.offsetLeft=80;this.offsetTop=50;this.attributes={};created.push(this);
    }
    appendChild(node){this.children.push(node);node.parentNode=this;return node;}
    addEventListener(name,fn){this.events[name]=fn;}
    setAttribute(name,value){this.attributes[name]=value;}
}
const document={
    createElement:tag=>new Element(tag),
    querySelectorAll:()=>[],
    addEventListener:(name,fn)=>{handlers[name]=fn;},
    body:{appendChild(node){body.push(node);}}
};
new Function('document',panelCode)(document);
assert.equal(body.length,1,'only one floating panel is appended');
const box=body[0],btn=box.children.find(node=>node.id==='minimizeTotals');
const header=box.children.find(node=>node.id==='spTotalsHeader');
const heading=header&&header.children.find(node=>node.id==='spTotalsHeading');
assert.ok(btn,'minimize button exists');
assert.ok(header&&heading,'header and title exist');
assert.equal(heading.textContent,'CLIENT TOTALS');
assert.ok(header.style.cssText.includes('background:#f2b32e'),'header strip is yellow');
assert.ok(header.style.cssText.includes('border-bottom:2px solid #202a36'),'header has dark divider');
assert.equal(header.style.display,undefined,'header initially visible');
const mascot=box.children.find(node=>node.id==='spTotalsPeekMascot');
assert.ok(mascot&&mascot.tagName==='IMG','peeking image is part of the floating panel');
assert.equal(created.filter(node=>node.tagName==='IMG').length,1,'only one peeking image is created');
assert.ok(mascot.src.includes('drive.google.com/thumbnail?id=1s2EebzZmprVW6ToR24WilwqRSlxNhgNK'),'uses the supplied Drive image');
assert.equal(mascot.style.position,'absolute');
assert.equal(mascot.style.bottom,'calc(100% - 9px)','mascot peeks over the top edge');
assert.equal(mascot.style.pointerEvents,'none','mascot cannot block native controls or dragging');
assert.equal(mascot.style.height,'128px');
assert.equal(mascot.style.maxWidth,'300px');
assert.equal(mascot.attributes['aria-hidden'],'true');
assert.equal(mascot.alt,'');
assert.equal(mascot.style.zIndex,'9','mascot sits behind the yellow header');
assert.equal(mascot.style.boxShadow,'none');
assert.equal(box.style.width,'320px');
assert.equal(box.style.minHeight,'240px');
assert.equal(box.style.height,undefined,'normal panel grows naturally with content');
assert.equal(box.style.top,'150px','5px lower than its previous position');
assert.equal(box.style.border,'2px solid #202a36','dark outline');
assert.equal(box.style.background,'#fff','outer panel background is white');
assert.equal(box.style.boxShadow,'none','no outer shadows');
assert.equal(box.style.borderRadius,'0','square corners');
assert.equal(btn.style.borderRadius,'50%','minimize button is circular');
assert.equal(btn.style.background,'#202a36');
assert.equal(btn.style.color,'#fff');
assert.equal(btn.textContent,'−');
assert.equal(btn.attributes['aria-label'],'Minimize client totals');

const click=()=>btn.events.click({stopPropagation(){}});
click();
assert.equal(box.dataset.minimized,'true');
assert.equal(box.style.width,'60px');
assert.equal(box.style.height,'60px');
assert.equal(btn.textContent,'Totals');
assert.equal(box.style.top,'150px');
assert.equal(box.style.borderRadius,'50%','minimized control is round');
assert.equal(btn.style.borderRadius,'50%','minimized button remains circular');
assert.equal(box.style.boxShadow,'none');
assert.equal(header.style.display,'none','header hidden when minimized');
assert.equal(mascot.style.display,'none','peeking image hidden when minimized');
assert.equal(btn.attributes['aria-label'],'Restore client totals');
assert.equal(btn.style.width,'60px','restore button fills minimized circle');
click();
assert.equal(box.dataset.minimized,'false');
assert.equal(box.style.width,'320px');
assert.equal(box.style.minHeight,'240px');
assert.equal(box.style.height,'auto');
assert.equal(box.style.top,'150px');
assert.equal(box.style.border,'2px solid #202a36');
assert.equal(box.style.borderRadius,'0','regular outer frame remains square');
assert.equal(box.style.background,'#fff');
assert.equal(box.style.boxShadow,'none');
assert.equal(header.style.display,'flex','yellow header restored');
assert.equal(mascot.style.display,'block','peeking image returns when expanded');
assert.equal(btn.style.borderRadius,'50%');
assert.equal(btn.style.background,'#202a36');
assert.equal(btn.textContent,'−');
assert.equal(btn.attributes['aria-label'],'Minimize client totals');
for(let i=0;i<3;i++){click();assert.equal(box.children.length,3);assert.equal(mascot.style.display,'none');click();assert.equal(box.children.length,3);assert.equal(mascot.style.display,'block');}
assert.equal(created.filter(node=>node.tagName==='IMG').length,1,'repeated minimize/restore does not create extra images');
box.events.mousedown({target:{tagName:'DIV'},clientX:120,clientY:100});
handlers.mousemove({clientX:150,clientY:155});
assert.equal(box.style.left,'110px');
assert.equal(box.style.top,'105px');
handlers.mouseup();
click();
assert.equal(box.dataset.minimized,'true');
click();
assert.equal(box.dataset.minimized,'false');
assert.equal(box.style.width,'320px');
assert.equal(box.style.width,'320px','mascot never changes panel width');
mascot.onerror();
assert.ok(mascot.src.includes('drive.google.com/uc?export=view&id=1s2EebzZmprVW6ToR24WilwqRSlxNhgNK'),'tries second Drive image URL');
assert.equal(mascot.style.display,'block','first source failure retries without hiding image');
mascot.onerror();
assert.equal(mascot.style.display,'none','inaccessible image is hidden cleanly');
click();click();
assert.equal(mascot.style.display,'none','failed image remains hidden after restore');
console.log('PASS: peeking image stays above header, hides when minimized, and handles inaccessible Drive sources.');
console.log('PASS: white background and zero shadows, yellow title bar, circular minimize/restore, original positioning and dragging.');
