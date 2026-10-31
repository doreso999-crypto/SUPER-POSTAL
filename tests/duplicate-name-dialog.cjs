const fs=require('node:fs'),assert=require('node:assert/strict');
const src=fs.readFileSync('superpostal.js','utf8');
const begin=src.indexOf("    let deferredDuplicateSignature='';");
const end=src.indexOf('    const money=c=>',begin);
assert.ok(begin>=0&&end>begin,'Duplicate review modal found');
const source=src.slice(begin,end);
let overlay=null,created=0,checks=0;
class Element{
    constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.style={};this.attributes={};this.textContent='';}
    append(...children){this.children.push(...children);}
    remove(){if(overlay===this)overlay=null;this.removed=true;}
    setAttribute(name,value){this.attributes[name]=value;}
    addEventListener(){}
    focus(){this.focused=true;}
}
const doc={body:{append(element){overlay=element;created++;}},querySelector:selector=>selector==='#spDuplicateNameModal'?overlay:null};
const el=(tag,value)=>{const e=new Element(tag);if(value!==undefined)e.textContent=value;return e;};
const stored={},read=key=>stored[key]||null,write=(key,value)=>{stored[key]=value;return true;};
const r={id:'501',name:'Client EX',session:'clientA'},other={id:'502',name:'Client EX',session:'clientA'};
const key=(a,b)=>'duplicate:'+[a.id,b.id].sort().join(':');
const matches=()=>[other];
const review=new Function('document','el','duplicateNameMatches','duplicateReviewKey','read','write','norm','tick','lastView',source+';return reviewDuplicateNames;')(doc,el,matches,key,read,write,v=>String(v).toUpperCase(),()=>checks++,'');
review(r);
assert.ok(overlay,'dialog appears for two distinct jobs with same name');
const dialog=overlay.children[0],buttons=dialog.children[4].children;
assert.equal(dialog.attributes.role,'dialog');
assert.equal(buttons[1].textContent,'Keep separate jobs');
buttons[0].onclick();
assert.equal(overlay,null,'Review later closes the modal without confirming');
review(r);
assert.equal(created,1,'Review later avoids a new popup every timer tick');
const second=new Function('document','el','duplicateNameMatches','duplicateReviewKey','read','write','norm','tick','lastView',source+';return reviewDuplicateNames;')(doc,el,matches,key,read,write,v=>String(v).toUpperCase(),()=>checks++,'');
second(r);
assert.ok(overlay,'a new tab can re-prompt unconfirmed duplicates');
overlay.children[0].children[4].children[1].onclick();
assert.equal(read('duplicate:501:502').confirmed,true);
second(r);
assert.equal(overlay,null,'confirmed duplicate remains dismissed');
assert.equal(checks,1);
console.log('PASS: accessible duplicate-name dialog, review-later cooldown, confirmed acknowledgement and no repeated modal.');
