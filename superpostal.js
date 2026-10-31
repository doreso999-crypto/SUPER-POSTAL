// ==UserScript==
// @name         POSTAL TESTING GROUND
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Return Address parser + Job name from uploaded PDF
// @match        https://prod.postalocity.com/jobui*
// @grant        none
// postalocity
// ==/UserScript==


(function () {
'use strict';

///////////////////////////////
// RETURN ADDRESS PARSER
///////////////////////////////

// Postalocity stores state codes; accept full names, codes, and territories.
const SP_STATES=('Alabama=AL|Alaska=AK|Arizona=AZ|Arkansas=AR|California=CA|Colorado=CO|' +
'Connecticut=CT|Delaware=DE|Florida=FL|Georgia=GA|Hawaii=HI|Idaho=ID|Illinois=IL|' +
'Indiana=IN|Iowa=IA|Kansas=KS|Kentucky=KY|Louisiana=LA|Maine=ME|Maryland=MD|' +
'Massachusetts=MA|Michigan=MI|Minnesota=MN|Mississippi=MS|Missouri=MO|Montana=MT|' +
'Nebraska=NE|Nevada=NV|New Hampshire=NH|New Jersey=NJ|New Mexico=NM|New York=NY|' +
'North Carolina=NC|North Dakota=ND|Ohio=OH|Oklahoma=OK|Oregon=OR|Pennsylvania=PA|' +
'Rhode Island=RI|South Carolina=SC|South Dakota=SD|Tennessee=TN|Texas=TX|Utah=UT|' +
'Vermont=VT|Virginia=VA|Washington=WA|West Virginia=WV|Wisconsin=WI|Wyoming=WY|' +
'District of Columbia=DC|Puerto Rico=PR|Guam=GU|American Samoa=AS|' +
'Northern Mariana Islands=MP|US Virgin Islands=VI').split('|');
const SP_STATE_MAP=Object.create(null);
SP_STATES.forEach(function(pair){
    const parts=pair.split('=');
    SP_STATE_MAP[parts[0].toLowerCase()]=parts[1];
    SP_STATE_MAP[parts[1].toLowerCase()]=parts[1];
});
SP_STATE_MAP['washington dc']='DC';
SP_STATE_MAP['washington d.c.']='DC';
SP_STATE_MAP['virgin islands']='VI';
function spStateCode(value){
    return SP_STATE_MAP[String(value||'').toLowerCase().trim().replace(/\s+/g,' ')]||'';
}
const SP_STATE_TOKENS=Object.keys(SP_STATE_MAP)
    .sort(function(a,b){return b.length-a.length;})
    .map(function(s){return s.replace(/\./g,'\\.');}).join('|');
const SP_CITY_RE=new RegExp('^(.+?)(?:,\\s*|\\s+)('+SP_STATE_TOKENS+
    ')(?:,\\s*|\\s+)(\\d{5}(?:[- ]?\\d{4})?)$', 'i');

function spParseAddress(raw){
    const result={name:'',address1:'',address2:'',city:'',state:'',zip:''};
    const errors=[],warnings=[];
    const input=String(raw||'').replace(/\u00a0/g,' ').trim();
    if(!input)return {data:result,errors:['Paste a client address first.'],warnings:[]};
    if(input.length>4000)return {data:result,errors:['Address is too long. Paste only the mailing address.'],warnings:[]};
    let lines=input.split(/\r?\n/).map(function(s){return s.trim();}).filter(Boolean);
    // Accept common one-line, comma-separated addresses.
    if(lines.length===1 && lines[0].includes(',')){
        const bits=lines[0].split(/\s*,\s*/).filter(Boolean);
        if(bits.length>=3){
            if(bits.length>=4)bits.splice(bits.length-2,2,bits[bits.length-2]+', '+bits[bits.length-1]);
            lines=bits;
        }
    }
    const labels={name:'name',fullname:'name',clientname:'name',recipient:'name',
        address:'address1',address1:'address1',addressline1:'address1',
        street:'address1',streetaddress:'address1',addr1:'address1',
        address2:'address2',addressline2:'address2',apartment:'address2',
        suite:'address2',unit:'address2',city:'city',state:'state',
        zip:'zip',zipcode:'zip',postalcode:'zip'};
    const plain=[];
    lines.forEach(function(line){
        const m=line.match(/^([a-z ]{2,24}):\s*(.*)$/i);
        const key=m&&m[1].replace(/\s+/g,'').toLowerCase();
        if(key && Object.prototype.hasOwnProperty.call(labels,key)){
            result[labels[key]]=m[2].trim();
        }else plain.push(line);
    });
    let location=-1;
    for(let i=plain.length-1;i>=0;i--){
        const match=plain[i].match(SP_CITY_RE);
        if(match){
            if(!result.city)result.city=match[1].trim().replace(/,$/,'');
            if(!result.state)result.state=match[2];
            if(!result.zip)result.zip=match[3];
            location=i;break;
        }
    }
    if(location<0 && plain.length>1 && /^\d{5}(?:[- ]?\d{4})?$/.test(plain[plain.length-1])){
        const match=(plain[plain.length-2]+' '+plain[plain.length-1]).match(SP_CITY_RE);
        if(match){
            if(!result.city)result.city=match[1].trim().replace(/,$/,'');
            if(!result.state)result.state=match[2];
            if(!result.zip)result.zip=match[3];
            plain.pop();location=plain.length-1;
        }
    }
    if(location>=0 && location<plain.length-1 &&
       !plain.slice(location+1).every(function(s){return /^(?:US|USA|United States(?: of America)?)$/i.test(s);}))
        errors.push('Unexpected text after the city/state/ZIP; check the pasted lines.');
    const before=location>=0?plain.slice(0,location):plain.slice();
    const looksStreet=function(s){return /^(?:\d+[a-z]?\s|p\.?\s*o\.?\s*box\b|post office box\b|rr\s*\d+\b)/i.test(s||'');};
    if(!result.name && before.length && !looksStreet(before[0]))result.name=before.shift();
    if(!result.address1 && before.length)result.address1=before.shift();
    if(before.length){
        result.address2=[result.address2].concat(before).filter(Boolean).join(', ');
        if(before.length>1)warnings.push('Multiple apartment or suite lines were combined.');
    }
    result.state=spStateCode(result.state);
    result.zip=result.zip.trim().replace(/^(\d{5})[ -]?(\d{4})$/,'$1-$2');
    if(!result.name)errors.push('Recipient or business name is missing.');
    if(!result.address1)errors.push('Street address or PO Box is missing.');
    if(!result.city)errors.push('City missing; use a line like Orlando, Florida 32801.');
    if(!result.state)errors.push('State not recognized; use Florida, FL, or another valid U.S. state.');
    if(!/^\d{5}(?:-\d{4})?$/.test(result.zip))errors.push('A valid ZIP or ZIP+4 is required.');
    return {data:result,errors:errors,warnings:warnings};
}

function spParserStatus(type,message){
    const status=document.querySelector('#spParserStatus');
    if(!status)return;
    status.dataset.type=type;
    status.setAttribute('role',type==='error'?'alert':'status');
    status.textContent=message;
    status.hidden=false;
}
function spSetField(field,value){
    const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
    if(field.tagName==='INPUT' && setter && setter.set)setter.set.call(field,value);
    else field.value=value;
    field.dispatchEvent(new Event('input',{bubbles:true}));
    field.dispatchEvent(new Event('change',{bubbles:true}));
}
function parseAddress(){
    const form=document.querySelector('#envelopeReturn-address');
    const textarea=document.querySelector('#returnAddressPaste');
    if(!form||!textarea){spParserStatus('error','Return address form is unavailable; reopen it and try again.');return;}
    const parsed=spParseAddress(textarea.value);
    const preview=document.querySelector('#spParserPreview');
    if(preview)preview.hidden=true;
    if(parsed.errors.length){spParserStatus('error',parsed.errors.join(' '));textarea.focus();return;}
    const fields={};
    ['name','address1','address2','city','state','zip'].forEach(function(name){
        fields[name]=form.querySelector('input[name="'+name+'"],select[name="'+name+'"]');
    });
    const missing=['name','address1','city','state','zip'].filter(function(k){return !fields[k];});
    if(missing.length){spParserStatus('error','Required form field(s) unavailable: '+missing.join(', ')+'. No fields were changed.');return;}
    const data=Object.assign({},parsed.data);
    if(data.address2 && !fields.address2){
        data.address1+=', '+data.address2;
        parsed.warnings.push('Suite was included with the street because there is no address line 2 field.');
    }
    const values={};
    Object.keys(fields).forEach(function(key){if(fields[key])values[key]=fields[key].value;});
    try{
        ['name','address1','address2','city','state','zip'].forEach(function(key){
            const field=fields[key];if(!field)return;
            let value=data[key];
            if(key==='state'&&field.tagName==='SELECT'){
                const opt=Array.from(field.options).find(function(o){
                    return o.value.toUpperCase()===value||spStateCode(o.textContent)===value;
                });
                if(!opt)throw new Error('State '+value+' was not found in the Postalocity dropdown.');
                value=opt.value;
            }
            spSetField(field,value);
        });
    }catch(e){
        Object.keys(values).forEach(function(key){try{spSetField(fields[key],values[key]);}catch(_e){}});
        spParserStatus('error','Form could not be filled: '+e.message);return;
    }
    Object.keys(fields).forEach(function(name){
        if(fields[name])fields[name].dataset.spReturnUserProvided='true';
    });
    spRefreshFilledReturnFields();
    spQueueRecipientOverview();
    if(preview){
        preview.replaceChildren();
        [['Recipient',data.name],['Address',data.address1],['Unit / suite',data.address2||'None'],
         ['City, state, ZIP',data.city+', '+data.state+' '+data.zip]].forEach(function(item){
            const line=document.createElement('div'),name=document.createElement('small'),value=document.createElement('strong');
            name.textContent=item[0];value.textContent=item[1];
            line.append(name,value);preview.appendChild(line);
        });
        preview.hidden=false;
    }
    spParserStatus(parsed.warnings.length?'warning':'success',
        (parsed.warnings.length?'Address filled with a note: '+parsed.warnings.join(' '):'Address successfully filled.')+
        ' Double-check the address before submitting.');
}

// Exact ID from Postalocity's Return Address dialog. Avoid changing other modals.
function spSizeReturnAddressDialog(form,parser){
    const modal=form && form.closest('#settingsReturnAddress-Modal');
    if(modal && modal.contains(parser)) modal.classList.add('sp-address-layout');
}


// Hide TOTALOCITY and its child mascot only while this specific Return Address
// modal is open; restore them when it closes. Their layout stays unchanged.
function spKeepCalculatorVisibleForReturnModal(modal){
    if(!modal)return;
    if(!document.querySelector('#spReturnModalStackStyles')){
        const style=document.createElement('style');
        style.id='spReturnModalStackStyles';
        style.textContent='body.sp-return-address-open #bureauTotals{display:none!important} body:has(#settingsReturnAddress-Modal.in) #bureauTotals,body:has(#settingsReturnAddress-Modal.show) #bureauTotals{display:none!important}';
        document.head.appendChild(style);
    }
    const update=function(open){
        document.body.classList.toggle('sp-return-address-open',!!open);
    };
    const jq=window.jQuery||window.$;
    if(modal.dataset.spReturnStackBound!=='true' && jq && jq.fn){
        jq(modal).on('show.bs.modal.spReturnStack shown.bs.modal.spReturnStack',function(){
            update(true);
        });
        jq(modal).on('hide.bs.modal.spReturnStack hidden.bs.modal.spReturnStack',function(){
            update(false);
        });
        modal.dataset.spReturnStackBound='true';
    }
    update(modal.classList.contains('in')||modal.classList.contains('show')||modal.style.display==='block');
}

// Clear the pasted text and every *address-form* field, without changing
// the source/font/zone settings or saving automatically.
function spClearEveryReturnAddressField(){
    const modal=document.querySelector('#settingsReturnAddress-Modal');
    const form=modal && modal.querySelector('#envelopeReturn-address');
    if(!modal||!form){
        spParserStatus('error','The Return Address fields are unavailable.');
        return;
    }
    Array.from(form.querySelectorAll('input,textarea,select')).forEach(function(field){
        if(field.type==='hidden'||field.type==='button'||field.type==='submit')return;
        delete field.dataset.spReturnUserProvided;
        if(field.type==='checkbox'||field.type==='radio'){
            if(field.checked){field.checked=false;field.dispatchEvent(new Event('change',{bubbles:true}));}
        }else{
            spSetField(field,'');
        }
    });
    const paste=modal.querySelector('#returnAddressPaste');
    if(paste){
        paste.value='';
        paste.dispatchEvent(new Event('input',{bubbles:true}));
    }
    const preview=modal.querySelector('#spParserPreview');
    if(preview){preview.replaceChildren();preview.hidden=true;}
    spParserStatus('warning','All Return Address fields and pasted text cleared. Click Save changes to save this change.');
    if(paste)paste.focus();
}

// Postalocity may preload this example return address. Treat the sample as
// placeholder, not a client address. Do not alter the underlying form values.
function spReturnNormalize(value){
    return String(value==null?'':value).replace(/\u00a0/g,' ')
        .replace(/[.,#]/g,' ').replace(/\s+/g,' ').trim().toUpperCase();
}
function spReturnDefaultField(name,value){
    const clean=spReturnNormalize(value);
    if(!clean)return false;
    switch(String(name||'').toLowerCase()){
        case 'name':return clean==='MY NAME HERE';
        case 'address1':
            return /^5325 S(?:OUTH)? FORT APACHE (?:RD|ROAD)(?: (?:STE|SUITE) D[- ]?219)?$/.test(clean);
        case 'address2':return /^(?:STE|SUITE) D[- ]?219$/.test(clean);
        case 'city':return clean==='LAS VEGAS';
        case 'state':return clean==='NV'||clean==='NEVADA';
        case 'zip':return /^89148(?:[- ]?4665)?$/.test(clean);
        case 'country':
            return /^(?:US|USA|UNITED STATES|UNITED STATES OF AMERICA|U S A?)$/.test(clean);
        default:return false;
    }
}
function spReturnFormField(form,name){
    return form&&form.querySelector('input[name="'+name+'"],textarea[name="'+name+'"],select[name="'+name+'"]');
}
// Postalocity sometimes puts its entire sample return address in a single
// field instead of splitting it cleanly. Detect the distinctive template as a
// complete address, regardless of line breaks or which address fields hold it.
function spReturnIsSampleText(value){
    const text=spReturnNormalize(value);
    return /\bMY NAME HERE\b/.test(text) &&
        /\b5325 S(?:OUTH)? FORT APACHE (?:RD|ROAD)\b/.test(text);
}
function spReturnIsSampleForm(form){
    if(!form)return false;
    const fields=['name','company1','company2','address1','address2','city','state','zip','country'];
    const raw=fields.map(function(name){
        const input=spReturnFormField(form,name);
        return input?String(input.value||''):'';
    }).join(' ');
    return spReturnIsSampleText(raw);
}
function spReturnHasRealStreet(form){
    const address=spReturnFormField(form,'address1');
    const street=address?String(address.value||'').trim():'';
    return !!street&&!spReturnDefaultField('address1',street);
}
function spReturnIsMeaningful(field,form,preview){
    const value=String(field&&field.value||'').trim();
    if(!value)return false;
    const name=field.name||'';
    // The default US destination is still valid, but it needs no visual badge.
    if(name.toLowerCase()==='country'&&spReturnDefaultField('country',value))return false;
    if(!spReturnDefaultField(name,value))return true;
    // An explicitly parsed or typed value is intentional, even if it happens
    // to coincide with a sample city/state/ZIP value.
    if(field.dataset.spReturnUserProvided==='true')return true;
    // For saved real streets in Las Vegas, retain the complete postal locality
    // in the preview without coloring untouched sample-derived fields green.
    if(preview&&['city','state','zip'].includes(name.toLowerCase())&&spReturnHasRealStreet(form))
        return true;
    return false;
}
function spReturnIsDefaultPaste(value){
    const lines=String(value||'').split(/\r?\n/).map(function(v){return v.trim();}).filter(Boolean);
    return lines.some(function(line){return spReturnDefaultField('name',line);}) &&
        lines.some(function(line){return spReturnDefaultField('address1',line);});
}

function spRefreshFilledReturnFields(){
    const modal=document.querySelector('#settingsReturnAddress-Modal');
    if(!modal)return;
    const form=modal.querySelector('#envelopeReturn-address');
    const isSample=spReturnIsSampleForm(form);
    modal.querySelectorAll('#envelopeReturn-address input, #envelopeReturn-address textarea, #returnAddressPaste').forEach(function(field){
        const hasValue=field.id==='returnAddressPaste'
            ? !!String(field.value||'').trim()&&!spReturnIsDefaultPaste(field.value)&&!spReturnIsSampleText(field.value)
            : !isSample&&!spReturnIsSampleText(field.value)&&spReturnIsMeaningful(field,form,false);
        field.classList.toggle('sp-return-populated',hasValue);
    });
}
function spWatchFilledReturnFields(){
    const modal=document.querySelector('#settingsReturnAddress-Modal');
    if(!modal)return;
    if(modal.dataset.spFilledWatcher!=='true'){
        ['input','change'].forEach(function(type){
            modal.addEventListener(type,function(event){
                if(event.target.closest('#envelopeReturn-address, #returnAddressParser')){
                    if(event.isTrusted&&event.target.closest('#envelopeReturn-address')){
                        event.target.dataset.spReturnUserProvided='true';
                    }
                    spRefreshFilledReturnFields();
                    spQueueRecipientOverview();
                }
            });
        });
        const jq=window.jQuery||window.$;
        if(jq&&jq.fn)jq(modal).on('shown.bs.modal.spFilled hidden.bs.modal.spFilled',function(){
            spRefreshFilledReturnFields();
            spQueueRecipientOverview();
        });
        modal.dataset.spFilledWatcher='true';
    }
    spRefreshFilledReturnFields();
}

function addParser(){
    const form=document.querySelector('#envelopeReturn-address');
    if(!form)return;
    const existing=document.querySelector('#returnAddressParser');
    if(existing){spSizeReturnAddressDialog(form,existing);spKeepCalculatorVisibleForReturnModal(form.closest('#settingsReturnAddress-Modal'));spWatchFilledReturnFields();return;}
    if(!document.querySelector('#spParserStyle')){
        const style=document.createElement('style');
        style.id='spParserStyle';
        style.textContent=[
          '#returnAddressParser{box-sizing:border-box;background:#fff;color:#25334a;border:1px solid #d5e1ee;border-radius:14px;padding:16px;margin:12px 0 18px;box-shadow:0 5px 18px rgba(32,55,85,.08);font-family:inherit}',
          '#returnAddressParser *{box-sizing:border-box}',
          '#returnAddressParser .sp-head{display:flex;gap:11px;align-items:flex-start;margin-bottom:12px}',
          '#returnAddressParser .sp-icon{display:grid;place-items:center;background:#e7f0ff;color:#1a57aa;border-radius:10px;width:34px;height:34px;flex-shrink:0;font-size:19px}',
          '#returnAddressParser h3{margin:0;color:#1c3152;font-size:16px;font-weight:750}',
          '#returnAddressParser p{margin:4px 0 0;font-size:12px;line-height:1.5;color:#60728a}',
          '#returnAddressParser label{display:block;margin:0 0 6px;font-size:12px;font-weight:700;color:#2d405b}',
          '#returnAddressParser textarea{display:block;width:100%;min-height:88px;resize:vertical;background:#f8fafd;border:1px solid #c6d4e6;border-radius:9px;padding:10px 12px;color:#1d3551;font-size:13px;line-height:1.5}',
          '#returnAddressParser textarea:focus{outline:2px solid #4388e1;outline-offset:1px}',
          '#returnAddressParser .sp-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}',
          '#returnAddressParser button{border-radius:8px;border:1px solid #ccd8e7;padding:9px 14px;font-size:13px;font-weight:700;cursor:pointer;min-height:36px;background:#fff;color:#425975}',
          '#returnAddressParser button:hover{background:#f0f5fc}',
          '#returnAddressParser button:focus-visible{outline:2px solid #4388e1;outline-offset:2px}',
          '#returnAddressParser #parseReturnBtn{background:#215fbc;border-color:#215fbc;color:#fff}',
          '#returnAddressParser #parseReturnBtn:hover{background:#184b98}',
          '#returnAddressParser #spClearAllReturnBtn{border-color:#ebc5c5;color:#9a3030}',
          '#settingsReturnAddress-Modal #envelopeReturn-address input.sp-return-populated, #settingsReturnAddress-Modal #envelopeReturn-address textarea.sp-return-populated, #settingsReturnAddress-Modal #returnAddressPaste.sp-return-populated{background:#e4f7e9!important;border:1px solid #268f50!important;color:#154b2e!important;box-shadow:inset 0 0 0 1px rgba(38,143,80,.12)}',
          '#settingsReturnAddress-Modal #envelopeReturn-address input.sp-return-populated:focus, #settingsReturnAddress-Modal #returnAddressPaste.sp-return-populated:focus{outline:2px solid rgba(38,143,80,.35)!important;outline-offset:1px}',
          '#returnAddressParser #spParserStatus{margin-top:12px;padding:10px 12px;border-radius:8px;border:1px solid #b6dec7;background:#eaf8ef;color:#205b38;font-size:12px;line-height:1.5}',
          '#returnAddressParser #spParserStatus[data-type="error"]{border-color:#edb5b5;background:#fff0f0;color:#852929}',
          '#returnAddressParser #spParserStatus[data-type="warning"]{border-color:#e8d098;background:#fff7e6;color:#75501b}',
          '#returnAddressParser #spParserPreview{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;background:#f7fafd;border:1px solid #e0e9f3;border-radius:9px;margin-top:10px;padding:12px}',
          '#returnAddressParser #spParserPreview small{display:block;color:#738197;font-size:10px}',
          '#returnAddressParser #spParserPreview strong{display:block;color:#293c55;font-size:12px;overflow-wrap:anywhere}',
          '#returnAddressParser .sp-hint{margin-top:10px;font-size:11px}',
          '#returnAddressParser [hidden]{display:none!important}',
          /* Only the exact Return Address popup is resized. */
          '#settingsReturnAddress-Modal.sp-address-layout .modal-dialog.modal-md{width:min(980px,calc(100vw - 32px))!important;max-width:min(980px,calc(100vw - 32px))!important;margin:20px auto!important}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-content{height:auto!important;max-height:none!important;overflow:visible!important}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll{display:grid!important;grid-template-columns:minmax(0,0.95fr) minmax(0,1.05fr);gap:10px 18px;align-items:start;height:auto!important;max-height:none!important;overflow:visible!important}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>:not(#returnAddressParser):not(#envelopeReturn-address){grid-column:1/-1}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>label.col-form-label{grid-column:1!important;margin:0;align-self:center}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#settingsReturnAddressSource-Value{grid-column:2!important;max-width:100%;width:100%;min-width:0}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>hr{margin:3px 0}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#returnAddressParser{grid-column:1;min-width:0;margin:0;align-self:start}',
          '#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#envelopeReturn-address{grid-column:2;min-width:0;width:100%;max-width:100%;margin:0;align-self:start}',
          '#settingsReturnAddress-Modal.sp-address-layout #envelopeReturn-address .settings-addressBlock-combo{width:100%;max-width:100%;min-width:0}',
          '#settingsReturnAddress-Modal.sp-address-layout #envelopeReturn-address input{max-width:100%;box-sizing:border-box}',
          '#settingsReturnAddress-Modal.sp-address-layout #returnAddressParser textarea{min-height:112px}',
          '@media(max-width:720px){#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll{grid-template-columns:minmax(0,1fr)}#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#returnAddressParser,#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#envelopeReturn-address{grid-column:1}#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>label.col-form-label,#settingsReturnAddress-Modal.sp-address-layout .modal-body.modalScroll>#settingsReturnAddressSource-Value{grid-column:1!important}}',
          '@media(max-width:460px){#returnAddressParser #spParserPreview{grid-template-columns:1fr}#returnAddressParser button{flex:1}}'
        ].join('\n');
        document.head.appendChild(style);
    }
    const box=document.createElement('section');box.id='returnAddressParser';
    box.setAttribute('aria-label','Return address parser');
    box.innerHTML=[
      '<div class="sp-head"><span class="sp-icon" aria-hidden="true">✉</span><div>',
      '<h3>Return Address Parser</h3>',
      '<p>Paste the full client address. State names such as Florida and abbreviations such as FL both work.</p>',
      '</div></div>',
      '<label for="returnAddressPaste">Client address</label>',
      '<textarea id="returnAddressPaste" rows="4" placeholder="Jane Doe&#10;123 Main Street, Apt 4&#10;Orlando, Florida 32801" spellcheck="false"></textarea>',
      '<div class="sp-actions"><button type="button" id="parseReturnBtn">Parse &amp; fill</button>',
      '<button type="button" id="spClearAllReturnBtn">Clear all fields</button></div>',
      '<div id="spParserStatus" role="status" aria-live="polite" hidden></div>',
      '<div id="spParserPreview" aria-label="Parsed address preview" hidden></div>',
      '<p class="sp-hint">Review Postalocity fields before submitting. Ctrl+Enter to parse.</p>'
    ].join('');
    form.parentNode.insertBefore(box,form);
    spSizeReturnAddressDialog(form,box);
    spKeepCalculatorVisibleForReturnModal(form.closest('#settingsReturnAddress-Modal'));
    spWatchFilledReturnFields();
    const paste=box.querySelector('#returnAddressPaste');
    box.querySelector('#parseReturnBtn').addEventListener('click',parseAddress);
    box.querySelector('#spClearAllReturnBtn').addEventListener('click',spClearEveryReturnAddressField);
    paste.addEventListener('input',function(){
        box.querySelector('#spParserStatus').hidden=true;
        box.querySelector('#spParserPreview').hidden=true;
    });
    paste.addEventListener('keydown',function(e){
        if((e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();parseAddress();}
    });
}

///////////////////////////////
// JOB NAME FROM UPLOADED PDF
///////////////////////////////

function updateJobName(filename) {

    if (!filename) return;

    filename = filename.replace(/\.pdf$/i, "");

    filename = filename.substring(0, 40);

    const jobName = document.querySelector('#overview-jobName');

    if (jobName) {

        jobName.value = filename;

        jobName.dispatchEvent(
            new Event('input', { bubbles:true })
        );

        jobName.dispatchEvent(
            new Event('change', { bubbles:true })
        );

        jobName.dispatchEvent(
            new Event('blur', { bubbles:true })
        );

        console.log("Job name updated:", filename);

    }

}

function watchUploadedFiles() {

    const uploadList = document.querySelector('#sourceUploadedList');

    if (!uploadList) return;

    if (uploadList.dataset.nameWatcher) return;
    uploadList.dataset.nameWatcher = "true";

    const observer = new MutationObserver(() => {

        const text = uploadList.innerText;

        const match = text.match(
            /(.+?\.pdf)/i
        );

        if (match) {
            updateJobName(match[1]);
        }

    });

    observer.observe(uploadList, {
        childList:true,
        subtree:true
    });
    spPdfNamesFromPage();

}

// Hide only Postalocity's exact "Expand All" and "New Settings" buttons.
// Leave their handlers, other settings controls, and unrelated UI intact.
function hidePostalocitySettingsButtons() {
    const buttons = document.querySelectorAll(
        'button, input[type="button"], input[type="submit"], [role="button"], a.btn'
    );
    buttons.forEach(function (button) {
        const text = (button.tagName === 'INPUT' ? button.value : button.textContent)
            .replace(/\s+/g, ' ').trim().toLowerCase();
        if (text === 'expand all' || text === 'new settings') {
            button.style.setProperty('display', 'none', 'important');
        }
    });
}

///////////////////////////////
// RETURN ADDRESS MODAL SHORTCUT
///////////////////////////////
// Simple shortcut beside "Process this job"; the modal and parser stay intact.
function addQuickReturnAddress(){
    const target=document.querySelector('#step4 #alertApproveDiv');
    if(!target || target.querySelector('#spQuickReturnButton'))return;

    const button=document.createElement('button');
    button.id='spQuickReturnButton';
    button.type='button';
    button.className='btn btn-success';
    button.textContent='Return Address';
    button.title='Open Return Address settings';
    button.style.setProperty('width','100%');
    button.style.setProperty('background-color','#15803d','important');
    button.style.setProperty('border-color','#15803d','important');
    button.style.setProperty('color','#fff','important');
    button.style.setProperty('font-weight','700');
    button.style.setProperty('min-height','39px');
    button.addEventListener('click',function(){
        const modal=document.querySelector('#settingsReturnAddress-Modal');
        const jq=window.jQuery||window.$;
        if(!modal || !jq || !jq.fn || typeof jq.fn.modal!=='function'){
            window.alert('Return Address settings are not available on this page.');
            return;
        }
        addParser();
        jq(modal).modal('show');
    });
    target.appendChild(button);
}

///////////////////////////////
// RECIPIENT NAMES & UPLOADED PDF OVERVIEW
///////////////////////////////
// Read only what Postalocity has actually rendered. Never invent recipient
// names or guess which PDF belongs to a particular recipient.
function spCleanLabel(text){
    return String(text||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
}
// Cache only PDF names already visible on this job page, across the recipient
// save's full reload. Tab-only storage avoids any new Postalocity API calls.
let spPdfNamesRestored=false;
function spPdfCurrentJobId(){
    // Explicit jobId URL parameters and the native Job # label are the
    // strongest sources. A generic ?id can represent something else.
    try{
        const params=new URLSearchParams(window.location.search);
        const explicit=params.get('jobId');
        if(explicit&&/^\d+$/.test(explicit))return explicit;
    }catch(_error){}
    const label=document.querySelector('#jobNumberTop');
    const found=label&&String(label.textContent||'').match(
        /\bJob\s*#\s*(\d+)\b/i);
    if(found)return found[1];
    try{
        if(typeof jobId!=='undefined'&&/^\d+$/.test(String(jobId)))
            return String(jobId);
        if(window.jobId!=null&&/^\d+$/.test(String(window.jobId)))
            return String(window.jobId);
        const params=new URLSearchParams(window.location.search);
        const generic=params.get('id');
        if(generic&&/^\d+$/.test(generic))return generic;
    }catch(_error){}
    return '';
}
function spPdfMemoryKey(){
    const id=spPdfCurrentJobId();
    return id?'sp-pdf-names-for-job-v1-'+id:'';
}

function spPdfRemember(names){
    const key=spPdfMemoryKey();
    if(!key||!names.length)return;
    const seen=new Set(),valid=[];
    names.forEach(function(name){
        if(typeof name!=='string')return;
        const value=name.trim(),lower=value.toLowerCase();
        if(/\.pdf$/i.test(value)&&value.length<=260&&!seen.has(lower)){
            valid.push(value);seen.add(lower);
        }
    });
    if(!valid.length)return;
    try{window.sessionStorage.setItem(key,JSON.stringify({seenAt:Date.now(),files:valid}));}
    catch(_e){/* Original display still works if storage is unavailable. */}
}
function spPdfRecall(){
    const key=spPdfMemoryKey();
    if(!key)return [];
    try{
        const data=JSON.parse(window.sessionStorage.getItem(key)||'null');
        if(!data||!Array.isArray(data.files)||!Number.isFinite(data.seenAt)||
           Date.now()-data.seenAt>86400000||data.seenAt>Date.now()+60000)return [];
        const found=[],seen=new Set();
        data.files.forEach(function(name){
            if(typeof name!=='string')return;
            const value=name.trim(),lower=value.toLowerCase();
            if(/\.pdf$/i.test(value)&&value.length<=260&&!seen.has(lower)){
                found.push(value);seen.add(lower);
            }
        });
        return found;
    }catch(_e){return [];}
}
// Native Postalocity "Uploaded Files" modal is the most reliable DOM source.
// It is populated when the existing Files button is clicked; no custom API calls.
let spPdfModalSnapshot=null;
let spPdfModalSnapshotJobId='';
function spPdfNativeModalNames(){
    const list=document.querySelector('#fileListModal #modalFileList');
    if(!list)return [];
    const names=[],seen=new Set();
    list.querySelectorAll('tr td:first-child a').forEach(function(link){
        const name=String(link.textContent||'').replace(/\u00a0/g,' ').trim();
        const key=name.toLowerCase();
        if(/\.pdf$/i.test(name)&&name.length<=260&&!seen.has(key)){
            seen.add(key);names.push(name);
        }
    });
    return names;
}
function spPdfForget(){
    const key=spPdfMemoryKey();
    if(!key)return;
    try{window.sessionStorage.removeItem(key);}catch(_e){}
}
function spSyncNativeUploadedFiles(){
    const modal=document.querySelector('#fileListModal');
    if(!modal)return;
    const rows=spPdfNativeModalNames();
    const badge=modal.querySelector('.uploadedListSize');
    const count=badge?Number.parseInt(badge.textContent,10):NaN;

    // Only a *completed, opened* list is authoritative. Do not erase cached
    // filenames when the table is simply empty during page load.
    if(rows.length && (!Number.isFinite(count)||count===rows.length)){
        spPdfModalSnapshot=rows;
        spPdfModalSnapshotJobId=spPdfCurrentJobId();
        spPdfRemember(rows);
    }else if(!rows.length && count===0){
        spPdfModalSnapshot=[];
        spPdfModalSnapshotJobId=spPdfCurrentJobId();
        spPdfForget();
    }else{
        return; // Incomplete table or loading state: preserve known names.
    }
    spQueueRecipientOverview();
}
function spWatchNativeUploadedFiles(){
    const modal=document.querySelector('#fileListModal');
    if(!modal||modal.dataset.spPdfSourceBound==='true')return;
    const jq=window.jQuery||window.$;
    if(!jq||!jq.fn)return;
    modal.dataset.spPdfSourceBound='true';
    jq(modal).on('shown.bs.modal.spPdfSource',spSyncNativeUploadedFiles);
    // If opening occurred before the listener attached, capture any real rows.
    if(modal.classList.contains('in')||modal.classList.contains('show')){
        if(spPdfNativeModalNames().length)spSyncNativeUploadedFiles();
    }
}

function spPdfNamesFromPage(){
    const current=spPdfCurrentJobId();
    if(spPdfModalSnapshotJobId&&current&&
       spPdfModalSnapshotJobId!==current){
        // Another Postalocity job was opened in this tab. Its uploaded
        // file list must never inherit the previous job's modal snapshot.
        spPdfModalSnapshot=null;
        // Leave the ID temporarily attached to the old modal DOM so it
        // cannot be read again until the Files modal is opened for this job.
    }
    if(spPdfModalSnapshot!==null&&
       (!spPdfModalSnapshotJobId||spPdfModalSnapshotJobId===current)){
        spPdfNamesRestored=false;
        return spPdfModalSnapshot.slice();
    }
    const modalIsOtherJob=!!(current&&spPdfModalSnapshotJobId&&
       spPdfModalSnapshotJobId!==current);
    const modal=document.querySelector('#fileListModal');
    const visibleModal=!!(modal&&modal.classList&&
       (modal.classList.contains('show')||modal.classList.contains('in')));
    // A closed native modal might retain its previous job's old rows.
    const rows=(modalIsOtherJob||!visibleModal)?[]:spPdfNativeModalNames();
    if(rows.length){
        spPdfRemember(rows);
        spPdfNamesRestored=false;
        return rows;
    }
    const found=[];
    const seen=new Set();
    function collect(text){
        if(!text)return;
        const label=String(text).replace(/\u00a0/g,' ').trim();
        const pieces=label.split(/\r?\n/);
        pieces.forEach(function(piece){
            // Uploaded-file elements sometimes append "Delete" or file counts.
            let name=piece.trim().replace(/\s+(?:delete|remove|download|preview)\s*$/i,'');
            if(!/\.pdf$/i.test(name)){
                const match=name.match(/(?:^|[\s"'])([^"'<>]*?\.pdf)(?=\s|$|["'])/i);
                name=match ? match[1].trim() : '';
            }
            if(name && name.length<=260 && /\.pdf$/i.test(name)){
                const key=name.toLowerCase();
                if(!seen.has(key)){seen.add(key);found.push(name);}
            }
        });
    }
    const uploaded=document.querySelector('#sourceUploadedList');
    if(uploaded){
        uploaded.querySelectorAll('[data-filename],[data-file-name],a[title],a').forEach(function(el){
            collect(el.getAttribute('data-filename')||el.getAttribute('data-file-name')||el.getAttribute('title')||el.textContent);
        });
        collect(uploaded.innerText||uploaded.textContent);
    }
    if(found.length){
        spPdfNamesRestored=false;
        spPdfRemember(found);
        return found;
    }
    const restored=spPdfRecall();
    spPdfNamesRestored=restored.length>0;
    return restored;
}
function spRecipientNamesFromPage(){
    const list=document.querySelector('#contactListRow');
    if(!list)return [];
    const names=[];
    const inputs=list.querySelectorAll(
        '[data-recipient-name],[data-contact-name],input[name="extractedAddress.name"],' +
        'input[name$=".name"],input[name="name"],.recipient-name,.contact-name,.recipientName,.contactName'
    );
    inputs.forEach(function(el){
        const value=spCleanLabel(
            el.getAttribute('data-recipient-name')||el.getAttribute('data-contact-name')||
            (('value' in el)?el.value:el.textContent)
        );
        if(value && value.length<200)names.push(value);
    });
    if(names.length)return names;

    // Fallback for text-only cards rendered when Postalocity's recipient list
    // is opened. Read one clearly identifiable name line from each card.
    Array.from(list.children).forEach(function(card){
        const lines=String(card.innerText||card.textContent||'').split(/\r?\n/)
            .map(spCleanLabel).filter(Boolean);
        let name='';
        const labelled=lines.find(function(line){return /^(?:recipient|full name|name)\s*:\s*\S/i.test(line);});
        if(labelled)name=labelled.replace(/^(?:recipient|full name|name)\s*:\s*/i,'');
        else if(lines.length && lines[0].length<=120 &&
           !/^(?:\d+[\s,]|p\.?\s*o\.?\s*box|address|city|state|zip|delete|edit|save|view|recipient list|recipients)/i.test(lines[0]) &&
           !/\.(?:pdf|csv)\b/i.test(lines[0]) &&
           !/^\d+\s+recipients?$/i.test(lines[0]))name=lines[0];
        if(name)names.push(name);
    });
    return names;
}

// Build the return-address preview from Postalocity's actual address fields,
// never from the unparsed paste box. No additional storage or API calls.
function spReturnAddressLines(){
    const form=document.querySelector('#settingsReturnAddress-Modal #envelopeReturn-address');
    if(!form)return null; // The native form has not been initialized.
    if(spReturnIsSampleForm(form))return []; // Show "No return address" for Postalocity's sample.
    const read=function(name){
        const field=spReturnFormField(form,name);
        return field&&spReturnIsMeaningful(field,form,true)
            ? String(field.value||'').trim():'';
    };
    const data={
        name:read('name'),company1:read('company1'),company2:read('company2'),
        address1:read('address1'),address2:read('address2'),city:read('city'),
        state:read('state'),zip:read('zip'),country:read('country')
    };
    const location=[data.city,data.state].filter(Boolean).join(', ')+(data.zip?' '+data.zip:'');
    const lines=[data.name,data.company1,data.company2,data.address1,data.address2,
        location.trim(),data.country].filter(Boolean);
    // Additional guard when the sample was stored as one combined field.
    return spReturnIsSampleText(lines.join(' '))?[]:lines;
}

// Job Details must distinguish a draft Return Address from a saved one.
// Nothing is marked saved merely because a field was filled or Parse was used.
const spReturnSaveState={pending:null,memory:null};
function spReturnSaveKey(){
    const key=spPdfMemoryKey();
    return key?key.replace('sp-pdf-names-for-job-v1-','sp-return-save-v1-'):'';
}
function spReturnSignature(form){
    if(!form)return '';
    const parts=['name','company1','company2','address1','address2','city','state','zip','country'].map(function(key){
        const field=spReturnFormField(form,key);
        return field?String(field.value||'').trim().replace(/\s+/g,' ').toUpperCase():'';
    });
    // Store only a checksum of the address, not the raw personal information.
    let hash=2166136261;
    const joined=JSON.stringify(parts);
    for(let i=0;i<joined.length;i++){
        hash^=joined.charCodeAt(i);
        hash=Math.imul(hash,16777619);
    }
    return (hash>>>0).toString(16).padStart(8,'0');
}
function spReturnAddressComplete(form){
    if(!form||spReturnIsSampleForm(form))return false;
    return ['name','address1','city','state','zip'].every(function(key){
        const field=spReturnFormField(form,key);
        return !!field&&spReturnIsMeaningful(field,form,true);
    });
}
function spReturnSavedSignature(){
    const key=spReturnSaveKey();
    if(spReturnSaveState.memory && spReturnSaveState.memory.key===key)
        return spReturnSaveState.memory.signature;
    if(!key)return '';
    try{
        const record=JSON.parse(window.sessionStorage.getItem(key)||'null');
        if(record && record.signature && Number.isFinite(record.savedAt) &&
           Date.now()-record.savedAt>=0 && Date.now()-record.savedAt<86400000)
            return record.signature;
    }catch(_e){}
    return '';
}
function spReturnMarkSaved(form){
    if(!spReturnAddressComplete(form))return;
    const key=spReturnSaveKey(),signature=spReturnSignature(form);
    spReturnSaveState.memory={key:key,signature:signature};
    if(key){
        try{window.sessionStorage.setItem(key,JSON.stringify({signature:signature,savedAt:Date.now()}));}
        catch(_e){}
    }
    spQueueRecipientOverview();
}
function spReturnSavedReady(){
    const form=document.querySelector('#settingsReturnAddress-Modal #envelopeReturn-address');
    return spReturnAddressComplete(form)&&!!spReturnSavedSignature()&&
        spReturnSavedSignature()===spReturnSignature(form)&&!spReturnSaveState.pending;
}
function spReturnSaveHasVisibleError(modal){
    const invalid=modal.querySelectorAll('[aria-invalid="true"], .alert-danger, .has-error, .invalid-feedback, #spParserStatus[data-type="error"]');
    return Array.from(invalid).some(function(el){
        return !el.hidden && el.getClientRects().length>0;
    });
}
function spWatchReturnSaveAction(){
    const modal=document.querySelector('#settingsReturnAddress-Modal');
    if(!modal||modal.dataset.spReturnSaveWatch==='true')return;
    modal.dataset.spReturnSaveWatch='true';
    modal.addEventListener('click',function(event){
        const target=event.target.closest('button,input[type="submit"],input[type="button"],a');
        if(!target)return;
        const label=String(target.tagName==='INPUT'?target.value:
            (target.textContent||target.getAttribute('aria-label')||''))
            .replace(/\s+/g,' ').trim().toLowerCase();
        if(label==='save changes'||label==='save change'){
            const form=modal.querySelector('#envelopeReturn-address');
            spReturnSaveState.pending=spReturnAddressComplete(form)?
                {signature:spReturnSignature(form),started:Date.now()}:null;
            spQueueRecipientOverview();
        }else if(target.matches('[data-dismiss="modal"],.close') ||
                /^(close|cancel|discard)$/.test(label)){
            // Closing/cancelling is NOT a save, even after an earlier save click.
            spReturnSaveState.pending=null;
            spQueueRecipientOverview();
        }
    },true);
    modal.addEventListener('keydown',function(event){
        if(event.key==='Escape'){spReturnSaveState.pending=null;spQueueRecipientOverview();}
    },true);
    const jq=window.jQuery||window.$;
    if(jq&&jq.fn){
        jq(modal).on('hidden.bs.modal.spReturnSave',function(){
            const pending=spReturnSaveState.pending;
            spReturnSaveState.pending=null;
            const form=modal.querySelector('#envelopeReturn-address');
            if(pending && Date.now()-pending.started<45000 &&
               spReturnAddressComplete(form) &&
               spReturnSignature(form)===pending.signature &&
               !spReturnSaveHasVisibleError(modal)){
                // Confirmation requires the native Save Changes action AND
                // the native modal completing its close without visible errors.
                spReturnMarkSaved(form);
            }
            spQueueRecipientOverview();
        });
    }
}

// Stop Postalocity's own "Process this job" UI action unless every Job
// Details section is ready. Capture-phase listeners run before the native
// click / inline onclick / delegated click and before form submission.
function spJobDetailsReadiness(){
    const recipients=spRecipientNamesFromPage();
    const countEl=document.querySelector('#step3 .contactListSize');
    const count=countEl?Number.parseInt(countEl.textContent,10):NaN;
    const pdfNames=spPdfNamesFromPage();
    const checks=[
        {label:'Recipient names',ready:(Number.isFinite(count)&&count>0)||recipients.length>0},
        {label:'Uploaded PDF filenames',ready:pdfNames.length>0},
        {label:'Saved return address',ready:spReturnSavedReady()}
    ];
    return {ready:checks.every(function(item){return item.ready;}),
        missing:checks.filter(function(item){return !item.ready;}).map(function(item){return item.label;})};
}
function spIsNativeProcessJobControl(el){
    if(!el||!el.closest||!el.closest('#step4'))return false;
    if(el.id==='spQuickReturnButton'||el.closest('#spRecipientPdfOverview'))return false;
    const label=String(el.tagName==='INPUT'?el.value:
        (el.textContent||el.getAttribute('aria-label')||el.getAttribute('title')||''))
        .replace(/\s+/g,' ').trim();
    const action=[el.id,el.getAttribute('name'),el.getAttribute('onclick')]
        .filter(Boolean).join(' ');
    // Restrict this rule to actual job-processing controls, not navigation,
    // the Return Address shortcut, or general "Process" text elsewhere.
    return /\bprocess\s+(?:this\s+)?job\b/i.test(label)||
        /(?:^|[^a-z])(?:process|submit|approve)(?:This)?Job(?:Btn|Button)?(?:$|[^a-z])/i.test(action) ||
        /(?:process|submit|approve)Job\s*\(/i.test(action);
}
// Non-blocking visual toast for incomplete jobs. Reuse the same toast on
// repeated attempts; it never triggers or retries job processing.
let spProcessToastTimer=null;
function spDismissProcessToast(){
    if(spProcessToastTimer!==null){
        clearTimeout(spProcessToastTimer);
        spProcessToastTimer=null;
    }
    const toast=document.querySelector('#spProcessJobToast');
    if(toast)toast.remove();
}
function spShowProcessToast(missing){
    if(!document.body)return;
    if(!document.querySelector('#spProcessJobToastStyle')){
        const style=document.createElement('style');
        style.id='spProcessJobToastStyle';
        style.textContent=[
            '#spProcessJobToast{position:fixed;top:20px;left:50%;transform:translateX(-50%);width:min(390px,calc(100vw - 32px));max-height:min(65vh,450px);overflow:auto;z-index:2147483000;box-sizing:border-box;padding:15px 42px 15px 17px;border:1px solid #ef9898;border-left:5px solid #c52b2b;border-radius:12px;background:#fff8f8;color:#842323;box-shadow:0 12px 34px rgba(45,20,20,.23);font:13px/1.5 Arial,sans-serif}',
            '#spProcessJobToast strong{display:block;margin-bottom:5px;font-size:14px;color:#852020}',
            '#spProcessJobToast p{margin:0 0 5px}',
            '#spProcessJobToast ul{margin:5px 0 0;padding-left:19px}',
            '#spProcessJobToast li{margin:2px 0;overflow-wrap:anywhere}',
            '#spProcessJobToast .sp-toast-dismiss{position:absolute;top:8px;right:10px;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:transparent;color:#852020;font-size:20px;cursor:pointer}',
            '#spProcessJobToast .sp-toast-dismiss:hover{background:#f8dfdf}',
            '#spProcessJobToast .sp-toast-dismiss:focus-visible{outline:2px solid #a12b2b;outline-offset:1px}',
            '@media(max-width:520px){#spProcessJobToast{top:12px;width:calc(100vw - 24px)}}'
        ].join('\n');
        document.head.appendChild(style);
    }
    let toast=document.querySelector('#spProcessJobToast');
    if(!toast){
        toast=document.createElement('section');
        toast.id='spProcessJobToast';
        toast.setAttribute('role','alert');
        toast.setAttribute('aria-live','assertive');
        document.body.appendChild(toast);
    }
    toast.replaceChildren();
    const title=document.createElement('strong');
    title.textContent='Job cannot be processed';
    const summary=document.createElement('p');
    summary.textContent='Resolve these checks before processing:';
    const list=document.createElement('ul');
    missing.forEach(function(item){
        const line=document.createElement('li');
        line.textContent=item;
        list.appendChild(line);
    });
    const close=document.createElement('button');
    close.type='button';
    close.className='sp-toast-dismiss';
    close.setAttribute('aria-label','Dismiss notification');
    close.textContent='×';
    close.addEventListener('click',spDismissProcessToast);
    toast.append(title,summary,list,close);
    if(spProcessToastTimer!==null)clearTimeout(spProcessToastTimer);
    spProcessToastTimer=setTimeout(spDismissProcessToast,9000);
}

function spProcessJobWarning(missing,control){
    const area=document.querySelector('#step4 #alertApproveDiv')||
        (control&&control.closest('#step4'))||document.querySelector('#step4');
    if(!area)return;
    let box=area.querySelector('#spProcessJobBlocked');
    if(!box){
        box=document.createElement('div');
        box.id='spProcessJobBlocked';
        box.setAttribute('role','alert');
        box.tabIndex=-1;
        box.style.cssText='margin:12px 0;padding:12px 14px;border:2px solid #c53030;border-radius:9px;background:#fff0f0;color:#8b1e1e;font:600 13px/1.5 Arial,sans-serif;overflow-wrap:anywhere';
        area.appendChild(box);
    }
    box.textContent='Cannot process this job. Resolve these checks first: '+missing.join(', ')+'.';
    const details=document.querySelector('#spRecipientPdfOverview');
    if(details){
        details.dataset.completion='incomplete';
        const label=details.querySelector('#spOverviewCompletionLabel');
        if(label)label.textContent='Missing: '+missing.join(', ');
    }
    try{box.focus({preventScroll:true});}catch(_e){box.focus();}
    if(box.scrollIntoView)box.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function spBlockIncompleteProcess(event,control){
    let result;
    try{result=spJobDetailsReadiness();}
    catch(_error){
        result={ready:false,missing:['Job details could not be verified']};
    }
    if(result.ready){
        const previous=document.querySelector('#spProcessJobBlocked');
        if(previous)previous.remove();
        spDismissProcessToast();
        return false;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    spProcessJobWarning(result.missing,control);
    spShowProcessToast(result.missing);
    spQueueRecipientOverview();
    return true;
}
function spInstallProcessJobGuard(){
    if(document.documentElement.dataset.spProcessJobGuard==='true')return;
    document.documentElement.dataset.spProcessJobGuard='true';
    document.addEventListener('click',function(event){
        const target=event.target;
        const control=target&&target.closest&&target.closest(
            'button,input[type="submit"],input[type="button"],a,[role="button"]'
        );
        if(control&&spIsNativeProcessJobControl(control))
            spBlockIncompleteProcess(event,control);
    },true);
    document.addEventListener('submit',function(event){
        const form=event.target;
        if(!form||!form.closest||!form.closest('#step4'))return;
        const clicked=event.submitter||document.activeElement;
        if(clicked&&spIsNativeProcessJobControl(clicked)){
            spBlockIncompleteProcess(event,clicked);
        }else if(form.querySelector&&form.querySelector(
            'button[id*="processJob"],button[id*="processBtn"],button[onclick*="processJob"],button[onclick*="submitJob"]'
        )){
            spBlockIncompleteProcess(event,form);
        }
    },true);
}

function spRefreshRecipientPdfOverview(){
    const panel=document.querySelector('#spRecipientPdfOverview');
    if(!panel)return;
    const recipientNames=spRecipientNamesFromPage();
    const pdfNames=spPdfNamesFromPage();
    const countElement=document.querySelector('#step3 .contactListSize');
    const count=countElement?Number.parseInt(countElement.textContent,10):0;
    const countLabel=Number.isFinite(count)&&count>0?count:recipientNames.length;
    const recipientKey=JSON.stringify([countLabel,recipientNames]);
    const fileKey=JSON.stringify([pdfNames,spPdfNamesRestored]);
    const returnLines=spReturnAddressLines();
    const returnReady=spReturnSavedReady();
    const recipientsReady=countLabel>0||recipientNames.length>0;
    const pdfReady=pdfNames.length>0;
    const returnKey=JSON.stringify([returnLines,returnReady]);
    const states=[
        {ready:recipientsReady,label:'Recipient names'},
        {ready:pdfReady,label:'Uploaded PDFs'},
        {ready:returnReady,label:'Saved return address'}
    ];
    const done=states.every(function(item){return item.ready;});
    panel.dataset.completion=done?'complete':'incomplete';
    panel.querySelectorAll('.sp-overview-col').forEach(function(section,i){
        section.dataset.completion=states[i]&&states[i].ready?'complete':'incomplete';
    });
    const header=panel.querySelector('#spOverviewCompletionLabel');
    if(header){
        const missing=states.filter(function(item){return !item.ready;}).map(function(item){return item.label;});
        const statusText=done?'All job details ready':'Missing: '+missing.join(', ');
        if(header.textContent!==statusText)header.textContent=statusText;
    }
    if(panel.dataset.recipientKey!==recipientKey){
        panel.dataset.recipientKey=recipientKey;
        panel.querySelector('#spOverviewRecipientCount').textContent=countLabel+' recipients';
        const list=panel.querySelector('#spOverviewRecipientNames');
        list.replaceChildren();
        if(recipientNames.length){
            recipientNames.forEach(function(name,index){
                const li=document.createElement('li');
                const n=document.createElement('span');
                n.className='sp-list-number';n.textContent=String(index+1).padStart(2,'0');
                const value=document.createElement('span');
                value.textContent=name;
                li.append(n,value);
                list.appendChild(li);
            });
        }else{
            const li=document.createElement('li');
            li.className='sp-empty';
            li.textContent=countLabel>0?
                'Open the recipient list to load the names.':
                'No recipient names available yet.';
            list.appendChild(li);
        }
    }
    if(panel.dataset.returnKey!==returnKey){
        panel.dataset.returnKey=returnKey;
        const preview=panel.querySelector('#spOverviewReturnAddress');
        if(preview){
            preview.replaceChildren();
            if(returnLines && returnLines.length){
                const block=document.createElement('address');
                block.className='sp-return-address-block';
                block.textContent=returnLines.join('\n');
                preview.appendChild(block);
                if(!returnReady){
                    const warning=document.createElement('p');
                    warning.className='sp-return-save-warning';
                    warning.textContent=spReturnSaveState.pending?
                        'Waiting for Save Changes to complete.':
                        'Not saved — click Save Changes.';
                    preview.appendChild(warning);
                }
            }else{
                const empty=document.createElement('p');
                empty.className='sp-empty';
                empty.textContent=returnLines===null
                    ? 'Return address not loaded yet. Open Return Address to view it.'
                    : 'No return address';
                preview.appendChild(empty);
            }
        }
    }
    if(panel.dataset.fileKey!==fileKey){
        panel.dataset.fileKey=fileKey;
        panel.querySelector('#spOverviewPdfCount').textContent=pdfNames.length+' PDFs';
        const list=panel.querySelector('#spOverviewPdfNames');
        list.replaceChildren();
        if(pdfNames.length){
            pdfNames.forEach(function(name){
                const li=document.createElement('li');
                const file=document.createElement('span');
                file.textContent=name;li.appendChild(file);
                list.appendChild(li);
            });
        }else{
            const li=document.createElement('li');li.className='sp-empty';
            li.textContent='No uploaded PDF filenames available yet.';
            list.appendChild(li);
        }
    }
}
let spOverviewQueued=false;
function spQueueRecipientOverview(){
    if(spOverviewQueued)return;
    spOverviewQueued=true;
    requestAnimationFrame(function(){
        spOverviewQueued=false;
        spRefreshRecipientPdfOverview();
    });
}
function addRecipientPdfOverview(){
    const step=document.querySelector('#step3');
    if(!step||!document.querySelector('#sourceUploadedList'))return;
    if(step.querySelector('#spRecipientPdfOverview')){
        spWatchReturnSaveAction();
        spQueueRecipientOverview();
        return;
    }
    spWatchNativeUploadedFiles();
    spWatchReturnSaveAction();
    if(!document.querySelector('#spRecipientPdfStyles')){
        const styles=document.createElement('style');
        styles.id='spRecipientPdfStyles';
        styles.textContent=[
            '#step3 #spRecipientPdfOverview{width:100%;max-width:100%;margin:14px 0 12px;padding:13px 14px;border:1px solid #d9e3ee;border-radius:10px;background:#fff;box-sizing:border-box;font:13px Arial,sans-serif;color:#25374f}',
            '#step3 #spRecipientPdfOverview *{box-sizing:border-box}',
            '#step3 #spRecipientPdfOverview .sp-overview-header{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:10px}',
            '#step3 #spRecipientPdfOverview .sp-overview-header strong{font-size:14px}',
            '#step3 #spRecipientPdfOverview .sp-overview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}',
            '#step3 #spRecipientPdfOverview .sp-overview-col{min-width:0;border:1px solid #e6edf5;border-radius:8px;background:#fafcfe;padding:10px;transition:border-color .15s ease,background-color .15s ease}',
            '#step3 #spRecipientPdfOverview[data-completion="incomplete"]{border-color:#dc7777}',
            '#step3 #spRecipientPdfOverview[data-completion="complete"]{border-color:#74bd90}',
            '#step3 #spRecipientPdfOverview .sp-overview-col[data-completion="incomplete"]{border-color:#dc7777;background:#fff9f9}',
            '#step3 #spRecipientPdfOverview .sp-overview-col[data-completion="complete"]{border-color:#74bd90;background:#f6fcf8}',
            '#step3 #spRecipientPdfOverview .sp-overview-col[data-completion="incomplete"] .sp-overview-col-title{color:#a12b2b}',
            '#step3 #spRecipientPdfOverview .sp-overview-col[data-completion="complete"] .sp-overview-col-title{color:#207345}',
            '#step3 #spOverviewCompletionLabel{font-size:11px;font-weight:600;line-height:1.35}',
            '#step3 #spRecipientPdfOverview[data-completion="incomplete"] #spOverviewCompletionLabel{color:#a12b2b}',
            '#step3 #spRecipientPdfOverview[data-completion="complete"] #spOverviewCompletionLabel{color:#207345}',
            '#step3 #spRecipientPdfOverview .sp-return-save-warning{margin:9px 0 0;color:#a12b2b;font-size:11px;font-weight:600}',
            '#step3 #spRecipientPdfOverview .sp-overview-col-title{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px;font-weight:700;font-size:12px}',
            '#step3 #spRecipientPdfOverview .sp-count{color:#536c8a;font-size:11px;font-weight:500}',
            '#step3 #spRecipientPdfOverview ul{list-style:none;padding:0;margin:0;max-height:230px;overflow-y:auto}',
            '#step3 #spRecipientPdfOverview li{display:flex;gap:8px;align-items:baseline;border-bottom:1px solid #e8eef6;padding:7px 3px;font-size:12px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word;white-space:normal}',
            '#step3 #spRecipientPdfOverview li:last-child{border-bottom:0}',
            '#step3 #spRecipientPdfOverview .sp-list-number{color:#7488a3;font-size:10px;flex-shrink:0;min-width:20px}',
            '#step3 #spRecipientPdfOverview .sp-empty{color:#748399;font-style:italic}',
            '#step3 #spRecipientPdfOverview .sp-return-address-block{margin:0;font-size:12px;font-style:normal;white-space:pre-line;line-height:1.65;color:#283d56;overflow-wrap:anywhere}',
            '#step3 #spRecipientPdfOverview button{font-size:11px;padding:5px 9px;border:1px solid #b8cee9;border-radius:6px;background:#eff5ff;color:#26558b;cursor:pointer}',
            '#step3 #spRecipientPdfOverview button:focus-visible{outline:2px solid #4388e1;outline-offset:2px}',
            '@media(max-width:850px){#step3 #spRecipientPdfOverview .sp-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#step3 #spRecipientPdfOverview .sp-overview-col:last-child{grid-column:1/-1}}',
            '@media(max-width:520px){#step3 #spRecipientPdfOverview .sp-overview-grid{grid-template-columns:1fr}#step3 #spRecipientPdfOverview .sp-overview-col:last-child{grid-column:auto}}'
        ].join('\n');
        document.head.appendChild(styles);
    }
    const card=document.createElement('section');
    card.id='spRecipientPdfOverview';
    card.setAttribute('aria-label','Recipient names, uploaded PDF filenames and return address');
    card.innerHTML=[
      '<div class="sp-overview-header"><div><strong>Job Details</strong>',
      '<div id="spOverviewCompletionLabel" role="status" aria-live="polite"></div></div>',
      '<button type="button" id="spOverviewOpenRecipients">Open recipient list</button></div>',
      '<div class="sp-overview-grid">',
      '<section class="sp-overview-col"><div class="sp-overview-col-title">',
      '<span>Recipient names</span><span class="sp-count" id="spOverviewRecipientCount"></span></div>',
      '<ul id="spOverviewRecipientNames" aria-label="Full recipient names"></ul></section>',
      '<section class="sp-overview-col"><div class="sp-overview-col-title">',
      '<span>Uploaded PDF filenames</span><span class="sp-count" id="spOverviewPdfCount"></span></div>',
      '<ul id="spOverviewPdfNames" aria-label="Uploaded PDF filenames"></ul></section>',
      '<section class="sp-overview-col"><div class="sp-overview-col-title">',
      '<span>Return address</span></div>',
      '<div id="spOverviewReturnAddress" aria-label="Current return address"></div></section>',
      '</div>'
    ].join('');
    const originalRecipientArea=step.querySelector('.recipientList');
    if(originalRecipientArea && originalRecipientArea.parentNode===step){
        originalRecipientArea.insertAdjacentElement('afterend',card);
    }else{
        step.appendChild(card);
    }
    card.querySelector('#spOverviewOpenRecipients').addEventListener('click',function(){
        const modal=document.querySelector('#listShowModal');
        const jq=window.jQuery||window.$;
        if(modal && jq && jq.fn && typeof jq.fn.modal==='function')jq(modal).modal('show');
    });
    spQueueRecipientOverview();
}

///////////////////////////////
// WATCH PAGE CHANGES
///////////////////////////////

const observer = new MutationObserver(() => {

    addParser();

    watchUploadedFiles();

    hidePostalocitySettingsButtons();

    addQuickReturnAddress();

    addRecipientPdfOverview();

});

observer.observe(document.body, {
    childList:true,
    subtree:true
});

addParser();
watchUploadedFiles();
hidePostalocitySettingsButtons();
addQuickReturnAddress();
addRecipientPdfOverview();
spInstallProcessJobGuard();

///////////////////////////////
// RECIPIENT MODAL — AUTO-DETECT OR CHOOSE A BUREAU
///////////////////////////////
// These are the same addresses from the previous recipient autofill logic.
const SP_RECIPIENT_BUREAUS={
    EX:{name:'Experian',address1:'P.O. Box 2002',city:'Allen',state:'TX',zip:'75013'},
    EQU:{name:'Equifax Information Services LLC',address1:'P.O. Box 740256',city:'Atlanta',state:'GA',zip:'30374-0256'},
    TU:{name:'TransUnion LLC Consumer Dispute Center',address1:'PO Box 2000',city:'Chester',state:'PA',zip:'19016'}
};
function spDetectBureauForRecipient(jobName){
    const tokens=String(jobName||'').toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const found=new Set();
    tokens.forEach(function(part){
        if(['EX','EXP','EXPERIAN'].includes(part))found.add('EX');
        else if(['EQU','EQ','EQUIFAX'].includes(part))found.add('EQU');
        else if(['TU','TRANSUNION'].includes(part))found.add('TU');
    });
    return found.size===1?Array.from(found)[0]:'';
}
function spRecipientBureauStatus(message,type){
    const el=document.querySelector('#contactModal #spRecipientBureauStatus');
    if(!el)return;
    el.textContent=message;
    el.dataset.status=type||'info';
}
// Recipient/PDF mismatch validation. Only explicit bureau labels in the PDF
// filename count; names without a recognizable label must not be guessed.
function spCheckRecipientPdfBureau(){
    const modal=document.querySelector('#contactModal');
    const selector=modal&&modal.querySelector('#spRecipientBureauSelect');
    const warning=modal&&modal.querySelector('#spRecipientPdfMismatch');
    if(!modal||!selector||!warning)return {type:'unavailable'};

    const addressName=modal.querySelector('#address-name');
    const nameBureau=spDetectBureauForRecipient(addressName?addressName.value:'');
    const chosen=selector.value||'';
    const addressBureau=nameBureau||chosen;
    const files=spPdfNamesFromPage();
    const recognized=[],unlabeled=[];
    files.forEach(function(file){
        const code=spDetectBureauForRecipient(String(file).replace(/\.pdf$/i,''));
        if(code)recognized.push({file:file,code:code});
        else unlabeled.push(file);
    });
    let type='unknown',message='';
    if(chosen && nameBureau && chosen!==nameBureau){
        type='address-mismatch';
        message='The selected bureau ('+spBureauDisplayName(chosen)+
            ') does not match the recipient name ('+spBureauDisplayName(nameBureau)+
            '). Correct the recipient address before saving.';
    }else if(addressBureau && recognized.length && !unlabeled.length &&
             !recognized.some(function(entry){return entry.code===addressBureau;})){
        type='pdf-mismatch';
        const indicated=Array.from(new Set(recognized.map(function(entry){return entry.code;})));
        message='PDF/recipient mismatch: '+recognized.slice(0,3).map(function(entry){
            return entry.file;
        }).join(', ')+(recognized.length>3?' and '+(recognized.length-3)+' more':'')+
        ' indicates '+indicated.map(spBureauDisplayName).join(' / ')+
        ', but the recipient address is '+spBureauDisplayName(addressBureau)+
        '. Choose the matching bureau or correct the uploaded PDF.';
    }else if(recognized.length && unlabeled.length && addressBureau &&
             !recognized.some(function(entry){return entry.code===addressBureau;})){
        type='uncertain';
        message='Some PDF filenames indicate a different bureau, but others have no bureau label. Verify the files and recipient address before saving.';
    }
    warning.hidden=!message;
    warning.textContent=message;
    modal.querySelector('#spRecipientBureauPicker').classList.toggle('sp-pdf-bureau-error',
        type==='pdf-mismatch'||type==='address-mismatch');
    if(type==='pdf-mismatch'||type==='address-mismatch'){
        selector.setAttribute('aria-invalid','true');
    }else{
        selector.removeAttribute('aria-invalid');
    }
    return {type:type,message:message,files:files};
}
function spBureauDisplayName(code){
    return {EQU:'Equifax',EX:'Experian',TU:'TransUnion'}[code]||'Unknown bureau';
}
function spRecipientIsSubmitAction(btn){
    if(!btn)return false;
    const label=String(btn.tagName==='INPUT'?btn.value:
        (btn.textContent||btn.getAttribute('aria-label')||''))
        .replace(/\s+/g,' ').trim().toLowerCase();
    if(/^(close|cancel|back|dismiss|delete|remove|reset|clear)$/.test(label)||
       btn.matches('[data-dismiss="modal"],.close'))return false;
    if(/\b(add|save|submit|confirm|create)\b/.test(label))return true;
    const handler=btn.getAttribute('onclick')||'';
    if(/\b(addAddress|saveAddress|createContact|saveContact|addContact)\s*\(/i.test(handler))
        return true;
    // Postalocity can submit using an unlabeled primary footer button.
    return !!btn.closest('.modal-footer') &&
        btn.matches('button.btn-primary,button.btn-success,input[type="submit"]');
}
function spInstallRecipientSaveCheck(modal){
    if(modal.dataset.spRecipientSaveCheck==='true')return;
    modal.dataset.spRecipientSaveCheck='true';
    const block=function(event){
        const result=spCheckRecipientPdfBureau();
        if(result.type!=='pdf-mismatch'&&result.type!=='address-mismatch')return false;
        event.preventDefault();
        event.stopImmediatePropagation();
        const warning=modal.querySelector('#spRecipientPdfMismatch');
        if(warning){warning.hidden=false;warning.focus();}
        return true;
    };
    modal.addEventListener('click',function(event){
        const button=event.target.closest('button,a,input[type="submit"],input[type="button"]');
        if(button&&button.closest('#contactModal')===modal&&spRecipientIsSubmitAction(button))
            block(event);
    },true);
    // Also catch a normal form submit that is not triggered by a button.
    modal.addEventListener('submit',block,true);
    modal.addEventListener('input',function(event){
        if(event.target.matches('#address-name'))spCheckRecipientPdfBureau();
    });
    modal.addEventListener('change',function(event){
        if(event.target.matches('#address-name,#spRecipientBureauSelect'))
            spCheckRecipientPdfBureau();
    });
}

function spFillRecipientBureau(code,method){
    const modal=document.querySelector('#contactModal');
    const data=SP_RECIPIENT_BUREAUS[code];
    if(!modal||!data)return false;
    const fields={
        name:modal.querySelector('#address-name'),
        address1:modal.querySelector('#address-addr1'),
        city:modal.querySelector('#address-city'),
        state:modal.querySelector('#address-state'),
        zip:modal.querySelector('#address-zip')
    };
    if(Object.values(fields).some(function(input){return !input;})){
        spRecipientBureauStatus('The recipient address form is incomplete. No values were changed.','error');
        return false;
    }
    Object.keys(fields).forEach(function(key){
        spSetField(fields[key],data[key]);
    });
    const names={EX:'Experian',EQU:'Equifax',TU:'TransUnion'};
    spRecipientBureauStatus(names[code]+' address filled ('+method+'). Review before saving.','success');
    spCheckRecipientPdfBureau();
    return true;
}
function populateRecipientFromJob(){
    const job=document.querySelector('#overview-jobName');
    const picker=document.querySelector('#contactModal #spRecipientBureauSelect');
    if(!job || (picker && picker.dataset.manualChoice==='true'))return;
    const bureau=spDetectBureauForRecipient(job.value);
    if(picker)picker.value=bureau;
    if(bureau)spFillRecipientBureau(bureau,'automatically selected');
    else if(picker){
        spRecipientBureauStatus('No single bureau detected from the job name. Choose one from the dropdown.','info');
    }
    spCheckRecipientPdfBureau();
}
function spAddRecipientBureauDropdown(){
    const modal=document.querySelector('#contactModal');
    if(!modal||modal.querySelector('#spRecipientBureauSelect'))return;
    const body=modal.querySelector('.modal-body');
    if(!body)return;
    if(!document.querySelector('#spRecipientBureauStyles')){
        const style=document.createElement('style');
        style.id='spRecipientBureauStyles';
        style.textContent=[
            '#contactModal #spRecipientBureauPicker{background:#f5f9ff;border:1px solid #d6e3f3;border-radius:10px;padding:12px 14px;margin-bottom:14px}',
            '#contactModal #spRecipientBureauPicker label{display:block;font-size:13px;color:#294461;font-weight:700;margin-bottom:7px}',
            '#contactModal #spRecipientBureauSelect{display:block;width:100%;height:39px;border:1px solid #b3c5d9;border-radius:7px;background:white;color:#203b57;padding:7px 10px;font-size:13px}',
            '#contactModal #spRecipientBureauSelect:focus{outline:2px solid #6fa3e4;outline-offset:1px}',
            '#contactModal #spRecipientBureauStatus{font-size:12px;color:#62768e;line-height:1.5;margin:7px 0 0}',
            '#contactModal #spRecipientBureauStatus[data-status="success"]{color:#1f7544}',
            '#contactModal #spRecipientBureauStatus[data-status="error"]{color:#aa3030}',
            '#contactModal #spRecipientBureauPicker.sp-pdf-bureau-error{border-color:#d86b6b;background:#fff7f7}',
            '#contactModal #spRecipientBureauSelect[aria-invalid="true"]{border-color:#c83232;box-shadow:0 0 0 1px #c83232}',
            '#contactModal #spRecipientPdfMismatch{margin:10px 0 0;padding:11px 12px;background:#ffe8e8;border:1px solid #df7171;border-radius:7px;color:#942424;font-size:12px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}',
            '#contactModal #spRecipientPdfMismatch[hidden]{display:none!important}'
        ].join('\n');
        document.head.appendChild(style);
    }
    const control=document.createElement('div');
    control.id='spRecipientBureauPicker';
    control.innerHTML=[
        '<label for="spRecipientBureauSelect">Credit bureau address</label>',
        '<select id="spRecipientBureauSelect" aria-describedby="spRecipientBureauStatus">',
        '<option value="">Choose a bureau manually</option>',
        '<option value="EX">Experian</option>',
        '<option value="EQU">Equifax</option>',
        '<option value="TU">TransUnion</option>',
        '</select>',
        '<p id="spRecipientBureauStatus" role="status" aria-live="polite"></p>',
        '<div id="spRecipientPdfMismatch" role="alert" tabindex="-1" hidden></div>'
    ].join('');
    body.insertBefore(control,body.firstChild);
    const picker=control.querySelector('#spRecipientBureauSelect');
    picker.addEventListener('change',function(){
        // Manual choice must not be overwritten by automatic job-name updates.
        picker.dataset.manualChoice='true';
        if(picker.value)spFillRecipientBureau(picker.value,'manually selected');
        else spRecipientBureauStatus('Existing address fields are unchanged. Select a bureau to populate them.','info');
        spCheckRecipientPdfBureau();
    });
    spInstallRecipientSaveCheck(modal);
    const jq=window.jQuery||window.$;
    if(jq && jq.fn){
        jq(modal).on('shown.bs.modal.spRecipientBureauPicker',function(){
            if(picker.dataset.manualChoice!=='true')populateRecipientFromJob();
            spCheckRecipientPdfBureau();
        });
        jq(modal).on('hidden.bs.modal.spRecipientBureauPicker',function(){
            // A fresh recipient can be auto-detected next time the modal opens.
            picker.dataset.manualChoice='false';
        });
    }
    populateRecipientFromJob();
    spCheckRecipientPdfBureau();
}

function watchJobName(){
    const job=document.querySelector('#overview-jobName');
    if(!job||job.dataset.recipientWatcher)return;
    job.dataset.recipientWatcher='true';
    job.addEventListener('blur',populateRecipientFromJob);
    job.addEventListener('change',populateRecipientFromJob);
    job.addEventListener('input',populateRecipientFromJob);
}
const recipientObserver=new MutationObserver(function(){
    watchJobName();
    spAddRecipientBureauDropdown();
});
recipientObserver.observe(document.body,{childList:true,subtree:true});
watchJobName();
spAddRecipientBureauDropdown();

///////////////////////////////
// FLOATING SIDE PANEL
///////////////////////////////
(function(){

// Keep the original yellow panel, mascot position and draggable layout.
// No accounting, price tracking, filenames, or client-session logic.
document.querySelectorAll('#bureauTotals').forEach(el=>el.remove());

const box=document.createElement('div');
box.id='bureauTotals';
box.dataset.minimized='false';

Object.assign(box.style,{
    position:'fixed',
    top:'120px',
    right:'15px',
    width:'320px',
    minHeight:'240px',
    background:'rgb(242,179,46)',
    color:'black',
    padding:'25px',
    borderRadius:'12px',
    zIndex:'999999',
    boxShadow:'0 0 15px rgba(0,0,0,.45)',
    cursor:'move',
    overflow:'visible',
    boxSizing:'border-box',
    fontFamily:'Arial, sans-serif'
});

///////////////////////////////
// MASCOT SETTINGS
///////////////////////////////
//
// The mascot is a CHILD of the yellow calculator panel,
// like a sticker attached to a board.
//
// The yellow panel has overflow: visible.
// The mascot can therefore be fully inside the panel
// or extend outside any edge.
//
// X/Y are relative to the panel's top-left corner.
//
// X:
//   negative = left
//   positive = right
//
// Y:
//   negative = up
//   positive = down
//
// ONLY CHANGE THESE VALUES.
//

const MASCOT_SETTINGS = {
    x: -242,
    y: -50,

    width: 500,
    height: 400
};

///////////////////////////////
// MASCOT
///////////////////////////////

document.querySelectorAll("#postalMascot").forEach(el => el.remove());

const mascot =
document.createElement("img");

mascot.id = "postalMascot";

mascot.src =
    "https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/awts.png?ts=" + Date.now();

Object.assign(mascot.style, {
    position: "absolute",
    left: "0px",
    top: "0px",
    width: MASCOT_SETTINGS.width + "px",
    height: MASCOT_SETTINGS.height + "px",
    objectFit: "contain",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: "1",
    display: "block"
});

function applyMascotPosition() {

    mascot.style.setProperty("left", "0px", "important");
    mascot.style.setProperty("top", "0px", "important");

    mascot.style.setProperty(
        "margin-left",
        MASCOT_SETTINGS.x + "px",
        "important"
    );

    mascot.style.setProperty(
        "margin-top",
        MASCOT_SETTINGS.y + "px",
        "important"
    );
}

box.appendChild(mascot);

applyMascotPosition();

const mascotPositionObserver = new MutationObserver(() => {
    applyMascotPosition();
});

mascotPositionObserver.observe(mascot, {
    attributes: true,
    attributeFilter: ["style", "class"]
});

///////////////////////////////
// MINIMIZE BUTTON
///////////////////////////////

const minimize =
document.createElement("button");

minimize.id="minimizeTotals";
minimize.innerHTML="−";

Object.assign(minimize.style,{
    position:"absolute",
    top:"5px",
    right:"5px",
    width:"28px",
    height:"28px",
    border:"none",
    borderRadius:"50%",
    background:"rgba(0,0,0,.15)",
    color:"black",
    fontSize:"20px",
    fontWeight:"bold",
    cursor:"pointer",
    zIndex:"30"
});

box.appendChild(minimize);

///////////////////////////////
// DRAG
///////////////////////////////

let dragging=false;
let offsetX=0;
let offsetY=0;

box.addEventListener("mousedown",function(e){

    if(box.dataset.minimized==="true" ||
       e.target.tagName==="BUTTON" ||
       e.target.tagName==="INPUT")
        return;

    dragging=true;

    offsetX =
        e.clientX-box.offsetLeft;

    offsetY =
        e.clientY-box.offsetTop;

});

document.addEventListener("mousemove",function(e){

    if(!dragging)
        return;

    box.style.left =
        (e.clientX-offsetX)+"px";

    box.style.top =
        (e.clientY-offsetY)+"px";

    box.style.right="auto";

});

document.addEventListener("mouseup",function(){
    dragging=false;
});

///////////////////////////////
// MINIMIZE / RESTORE
///////////////////////////////

// An actual child is kept for each state, so restoring the panel does not
// detach its mascot, duplicate buttons, or call undefined functions.
const miniMascot=document.createElement('img');
miniMascot.src='https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/awts.png?ts='+Date.now();
Object.assign(miniMascot.style,{
    width:'60px',
    height:'60px',
    objectFit:'contain',
    pointerEvents:'none',
    userSelect:'none',
    display:'none'
});
box.appendChild(miniMascot);

function minimizeBox(){
    if(box.dataset.minimized==='true')return;
    box.dataset.minimized='true';
    dragging=false;
    mascot.style.display='none';
    minimize.style.display='none';
    miniMascot.style.display='block';
    Object.assign(box.style,{
        width:'60px',
        height:'60px',
        minHeight:'0px',
        padding:'0',
        borderRadius:'50%',
        background:'transparent',
        boxShadow:'none',
        right:'15px',
        top:'120px',
        left:'auto',
        display:'flex',
        alignItems:'center',
        justifyContent:'center',
        cursor:'pointer',
        overflow:'hidden'
    });
}

function restoreBox(){
    if(box.dataset.minimized!=='true')return;
    box.dataset.minimized='false';
    miniMascot.style.display='none';
    mascot.style.display='block';
    minimize.style.display='block';
    Object.assign(box.style,{
        width:'320px',
        height:'auto',
        minHeight:'240px',
        padding:'25px',
        borderRadius:'12px',
        background:'rgb(242,179,46)',
        boxShadow:'0 0 15px rgba(0,0,0,.45)',
        top:'120px',
        right:'15px',
        left:'auto',
        display:'block',
        cursor:'move',
        overflow:'visible'
    });
}

minimize.addEventListener('click',function(e){
    e.stopPropagation();
    minimizeBox();
});
box.addEventListener('click',function(e){
    if(box.dataset.minimized==='true'){
        e.stopPropagation();
        restoreBox();
    }
});

document.body.appendChild(box);

})();

///////////////////////////////
// TEMPORARY, DEVICE-LOCAL CLIENT TOTALS
///////////////////////////////
(function spClientLedger(){
    if(!/\/jobui\b/.test(location.pathname))return;
    const PREFIX='sp-ledger-v1:', GRACE=15*60*1000;
    // One presence lease per open page, not per job. Multiple tabs may show the
    // same job; the last open tab controls whether an unapproved job is counted.
    const PAGE_ID=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
    const LIVE_TTL=2*60*1000, LIVE_INTERVAL=4000;
    let leaving=false,lastPresence=0;
    const fields=['name','company1','company2','address1','address2','city','state','zip','country'];
    let error='', lastView='', lastHeartbeat=0;
    const observed=new Map(), recovered=new Map(), recoveryAttempts=new Set();
    let recovering=false, recoveryMessage='';
    const norm=v=>String(v||'').normalize('NFKC').trim().replace(/\s+/g,' ').toUpperCase();
    function canonical(a){
        return fields.map(k=>k==='state'?(spStateCode(a[k])||norm(a[k])):
            k==='country'?(/^(US|USA|UNITED STATES)?$/.test(norm(a[k]))?'US':norm(a[k])):norm(a[k]));
    }
    const addressKey=a=>JSON.stringify(canonical(a));
    const complete=a=>a&&['name','address1','city','state','zip'].every(k=>norm(a[k]));
    function read(key){try{return JSON.parse(localStorage.getItem(PREFIX+key)||'null');}catch(e){error='Local storage unavailable. Totals cannot be shared.';return null;}}
    function write(key,value){try{localStorage.setItem(PREFIX+key,JSON.stringify(value));return true;}catch(e){error='Local storage unavailable. Totals cannot be saved.';return false;}}
    function keys(){try{return Object.keys(localStorage).filter(k=>k.startsWith(PREFIX)).map(k=>k.slice(PREFIX.length));}catch(e){error='Local storage unavailable.';return [];}}
    function remove(key){try{localStorage.removeItem(PREFIX+key);}catch(e){error='Unable to clear local totals.';}}
    function active(jobId){
        const now=Date.now();
        return keys().some(k=>{
            if(!k.startsWith('live:'))return false;
            const entry=read(k);
            return !!entry&&entry.jobId===String(jobId)&&entry.seen<=now&&now-entry.seen<LIVE_TTL;
        });
    }
    function markActive(jobId){
        if(leaving||!jobId)return;
        const key='live:'+PAGE_ID, now=Date.now(),previous=read(key);
        if(previous&&previous.jobId===String(jobId)&&now-lastPresence<LIVE_INTERVAL)return;
        if(write(key,{jobId:String(jobId),seen:now}))lastPresence=now;
    }
    function leavePage(){
        // pagehide fires after the browser confirms a navigation or tab close.
        // Remove ONLY this page's counting lease, never the Postalocity job.
        // Reloads immediately renew the lease on the next document.
        try{capture();}catch(_error){/* A failed capture must not keep a closed job counted. */}
        finally{
            leaving=true;
            remove('live:'+PAGE_ID);
            lastView='';
        }
    }
    function clean(){
        const now=Date.now();
        keys().filter(k=>k.startsWith('live:')).forEach(k=>{
            const entry=read(k);
            if(!entry||!Number.isFinite(entry.seen)||now-entry.seen>=LIVE_TTL)remove(k);
        });
        keys().filter(k=>k.startsWith('session:')).forEach(k=>{
            const s=read(k);
            if(!s||now-s.seen>GRACE){
                keys().filter(j=>j.startsWith('job:')).forEach(j=>{const r=read(j);if(r&&r.session===k.slice(8))remove(j);});
                remove(k);
            }
        });
    }
    function id(){
        const known=spPdfCurrentJobId();if(known)return known;
        const ids=new Set(Array.from(document.querySelectorAll('a[href*="jobId="]')).map(a=>new URL(a.href,location.href).searchParams.get('jobId')).filter(v=>/^\d+$/.test(v||'')));
        return ids.size===1?[...ids][0]:'';
    }
    function savedAddressFrom(doc){
        const summary=doc.querySelector('#settingsReturnAddressSource-Link');
        if(summary){
            const clone=summary.cloneNode(true);
            clone.querySelectorAll('br').forEach(br=>br.replaceWith('\n'));
            const raw=clone.textContent.replace(/^\s*(?:RETURN ADDRESS\s*:\s*)?FROM\s+(?:JOB SETTINGS|ACCOUNT)\s*:\s*/i,'');
            if(!spReturnIsSampleText(raw)){
                const parsed=spParseAddress(raw);
                if(!parsed.errors.length)return parsed.data;
            }
        }
        // Detached server-rendered form values are saved data, never user drafts.
        if(doc!==document){
            const form=doc.querySelector('#envelopeReturn-address'),a={};
            if(form){
                fields.forEach(k=>{const f=spReturnFormField(form,k);a[k]=f?f.value:'';});
                if(complete(a)&&!spReturnIsSampleText(Object.values(a).join(' ')))return a;
            }
        }
        return null;
    }
    function returnAddress(){
        const saved=savedAddressFrom(document);if(saved)return saved;
        if(spReturnSavedReady()){
            const form=document.querySelector('#envelopeReturn-address'),a={};
            fields.forEach(k=>{const f=spReturnFormField(form,k);a[k]=f?f.value:'';});
            if(complete(a))return a;
        }
        const recovery=recovered.get(id());return recovery?recovery.address:null;
    }
    async function recoverSavedJob(){
        const jobId=id();
        if(!jobId||recoveryAttempts.has(jobId)||read('job:'+jobId))return;
        recoveryAttempts.add(jobId);recovering=true;recoveryMessage='';
        try{
            const url=new URL('/jobui',location.origin);url.searchParams.set('edit','true');url.searchParams.set('id',jobId);
            const response=await fetch(url.href,{credentials:'same-origin'});
            if(!response.ok)throw new Error('Saved settings could not be loaded.');
            const destination=new URL(response.url||url.href);
            if(destination.origin!==location.origin||destination.pathname!=='/jobui'||destination.searchParams.get('id')!==jobId)
                throw new Error('Saved settings require opening this job.');
            const doc=new DOMParser().parseFromString(await response.text(),'text/html');
            const address=savedAddressFrom(doc);
            if(!address)throw new Error('Open this job’s saved settings once to link its address. No need to re-enter it.');
            const name=doc.querySelector('#overview-jobName');
            recovered.set(jobId,{address:address,name:name?name.value:''});
        }catch(e){recoveryMessage=e.message;}
        finally{recovering=false;lastView='';tick();}
    }
    function recipientForm(){
        const a={};fields.forEach(k=>{const f=document.querySelector('#contactModal [name="extractedAddress.'+k+'"]');a[k]=f?f.value.trim():'';});return a;
    }
    function recipientsOnPage(){
        const list=document.querySelector('#contactListRow');if(!list||!list.children.length)return null;
        const found=[];
        for(const card of list.children){
            const a={};fields.forEach(k=>{const f=card.querySelector('[name="extractedAddress.'+k+'"],[name="'+k+'"]');a[k]=f?f.value:'';});
            if(complete(a)){found.push(a);continue;}
            const raw=card.innerText||card.textContent;
            const parsed=spParseAddress(raw.replace(/^\s*(Edit|Delete|Remove)\s*$/gmi,''));
            if(parsed.errors.length)return null; // Unknown markup must not invent a recipient.
            found.push(parsed.data);
        }
        return found;
    }
    function bureau(a){
        const street=v=>norm(v).replace(/[.,]/g,'').replace(/\bPOST OFFICE BOX\b/g,'PO BOX').replace(/\bP\s+O\s+BOX\b/g,'PO BOX');
        return Object.keys(SP_RECIPIENT_BUREAUS).find(code=>{
            const b=SP_RECIPIENT_BUREAUS[code];
            return street(a.address1)===street(b.address1)&&norm(a.city)===norm(b.city)&&
                (spStateCode(a.state)||norm(a.state))===b.state&&String(a.zip).slice(0,5)===b.zip.slice(0,5);
        })||'';
    }
    function countable(r){
        if(!r||r.deleted||!/^\d+$/.test(String(r.id||''))||!norm(r.name))return false;
        const session=read('session:'+r.session);
        return !!session&&!session.ended&&!!complete(session.address)&&group(r).key!=='Unassigned'&&(isApproved(r)||active(r.id));
    }
    const approvedState=status=>/^(?:approved|mailed)(?:\b|$)/i.test(String(status||'').trim());
    const isApproved=r=>!!r&&(r.approved===true||approvedState(r.status));
    function sessionJobs(key){return keys().filter(k=>k.startsWith('job:')).map(read).filter(r=>r&&r.session===key&&!r.deleted&&(isApproved(r)||active(r.id)));}
    function canClear(key){const s=read('session:'+key);return !!s&&!s.ended;}
    function markLifecycle(jobId,action){
        const r=read('job:'+jobId);if(!r)return;
        const session=read('session:'+r.session);if(!session||session.ended)return;
        if(action==='approve'){
            if(r.deleted)return;
            r.approved=true;r.status='Approved';
        }else if(action==='delete'){
            // Keep a tombstone so an already-open stale tab cannot resurrect it.
            if(isApproved(r))return;
            r.deleted=true;r.status='Deleted';
        }
        write('job:'+jobId,r);lastView='';
    }
    function clearSession(key){
        if(!canClear(key))return false;
        const session=read('session:'+key);if(!session)return false;
        session.ended=true;session.seen=Date.now();write('session:'+key,session);
        keys().filter(k=>k.startsWith('job:')).forEach(k=>{
            const r=read(k);if(r&&r.session===key){r.cents=null;r.recipients=[];r.name='';write(k,r);}
        });
        lastView='';return true;
    }
    function hookLifecycle(api){
        // Observe successful native actions only. Button clicks/confirmation dialogs
        // and failure callbacks never modify the ledger.
        ['delete','deleteJob','removeJob','approve','approveJob'].forEach(method=>{
            const original=api.job[method];
            if(typeof original!=='function'||original.spLedgerLifecycle)return;
            function wrapped(handler){
                if(!handler||typeof handler.handleSuccessResponse!=='function')return original.apply(this,arguments);
                const request=handler.request||{};
                const target=String(request.jobId||request.id||(request.job&&request.job.id)||id());
                const success=handler.handleSuccessResponse;
                handler.handleSuccessResponse=function(){
                    markLifecycle(target,/^approve/i.test(method)?'approve':'delete');
                    return success.apply(this,arguments);
                };
                return original.apply(this,arguments);
            }
            wrapped.spLedgerLifecycle=true;api.job[method]=wrapped;
        });
    }
    function group(r){
        if(r.override)return {key:r.override,label:({EX:'Experian',EQU:'Equifax',TU:'TransUnion'})[r.override]||r.override};
        const rs=r.recipients||[], byName=spDetectBureauForRecipient(r.name);
        if(rs.length){
            const groups=rs.filter(complete).map(a=>({key:bureau(a)||addressKey(a),label:spBureauDisplayName(bureau(a))==='Unknown bureau'?a.name:spBureauDisplayName(bureau(a)),a:a}));
            const unique=[...new Set(groups.map(g=>g.key))];
            if(unique.length>1)return {key:'Mixed recipients',label:'Mixed recipients — review',warning:true};
            if(groups.length===rs.length&&unique.length===1){
                const g=groups[0];g.warning=!!byName&&g.key!==byName;return g;
            }
        }
        return byName?{key:byName,label:spBureauDisplayName(byName)}:{key:'Unassigned',label:'Unassigned'};
    }
    function capture(patch){
        const jobId=id();if(!jobId)return null;
        let r=read('job:'+jobId), a=returnAddress();
        if(r&&!read('session:'+r.session)){remove('job:'+jobId);r=null;}
        if(r&&r.deleted){remove('live:'+PAGE_ID);return r;}
        if(r&&isApproved(r)){
            const savedSession=read('session:'+r.session);
            if(savedSession&&savedSession.ended)return null;
            // An old draft tab cannot erase an approved job's identity or price.
            if(savedSession&&Date.now()-lastHeartbeat>15000){savedSession.seen=Date.now();write('session:'+r.session,savedSession);lastHeartbeat=Date.now();}
            return r;
        }
        if(!a&&!r)return null;
        const prior=observed.get(jobId)||{};
        const currentAddress=a?addressKey(a):'';
        const key=a&&currentAddress!==prior.address?currentAddress:r?r.session:currentAddress;
        let session=read('session:'+key);
        if(session&&session.ended)return null;
        if(!session){session={address:a,seen:Date.now()};write('session:'+key,session);}
        const before=JSON.stringify(r);
        r=Object.assign({id:jobId,recipients:[],cents:null},r||{},patch||{},{session:key});
        const name=document.querySelector('#overview-jobName');if(name&&name.value.trim()!==prior.name)r.name=name.value.trim();
        if(!name&&!r.name&&recovered.has(jobId))r.name=recovered.get(jobId).name;
        const recipients=recipientsOnPage();if(recipients&&JSON.stringify(recipients)!==prior.recipients)r.recipients=recipients;
        const state=document.querySelector('#jobState');if(!isApproved(r)&&state&&state.textContent.trim()!==prior.status&&(!r.status||!/^New$/i.test(state.textContent.trim())))r.status=state.textContent.trim();
        if(approvedState(r.status))r.approved=true;
        const cost=document.querySelector('.totalPriceRow .totalPrice');
        if(cost&&/processed|approved|mailed/i.test(r.status||'')){
            const value=cost.textContent.trim().replace(/[$,\s]/g,'');
            if(value!==prior.cost&&/^\d+(\.\d{1,2})?$/.test(value))r.cents=Math.round(Number(value)*100);
        }
        observed.set(jobId,{cost:cost?cost.textContent.trim().replace(/[$,\s]/g,''):undefined,address:currentAddress,name:name?name.value.trim():undefined,recipients:JSON.stringify(recipients),status:state?state.textContent.trim():undefined});
        if(before!==JSON.stringify(r))write('job:'+jobId,r);
        if(!isApproved(r))markActive(jobId);
        if(Date.now()-lastHeartbeat>15000){session.seen=Date.now();write('session:'+key,session);lastHeartbeat=Date.now();}
        return r;
    }
    // Capture recipient only after Postalocity reports a successful add.
    function hookRecipientSave(){
        let api;try{api=typeof apiAction!=='undefined'?apiAction:window.apiAction;}catch(e){}
        if(!api||!api.job)return;
        hookLifecycle(api);
        ['deleteInputDocList','buildInputDocList'].forEach(method=>{
            const original=api.job[method];
            if(typeof original!=='function'||original.spLedger)return;
            function changed(handler){
                const jobId=String(handler.request&&handler.request.jobId||id());
                const success=handler.handleSuccessResponse;
                handler.handleSuccessResponse=function(){
                    const r=read('job:'+jobId);
                    if(r){r.recipients=[];r.override='';write('job:'+jobId,r);}
                    return success&&success.apply(this,arguments);
                };
                return original.apply(this,arguments);
            }
            changed.spLedger=true;api.job[method]=changed;
        });
        if(typeof api.job.addRecipient!=='function'||api.job.addRecipient.spLedger)return;
        const original=api.job.addRecipient;
        function wrapped(handler){
            const a=JSON.parse(JSON.stringify(handler.request&&handler.request.address||recipientForm()));
            const jobId=String(handler.request&&handler.request.jobId||id());
            const success=handler.handleSuccessResponse;
            handler.handleSuccessResponse=function(){
                if(complete(a)&&jobId===id()){
                    const r=capture();if(r){
                        const list=r.recipients||[];
                        if(!list.some(x=>addressKey(x)===addressKey(a)))list.push(a);
                        r.recipients=list;write('job:'+jobId,r);
                    }
                }
                return success&&success.apply(this,arguments);
            };
            return original.apply(this,arguments);
        }
        wrapped.spLedger=true;api.job.addRecipient=wrapped;
    }
    const money=c=>'$'+(c/100).toFixed(2);
    const el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
    function render(r){
        const box=document.querySelector('#bureauTotals');if(!box)return;
        let panel=document.querySelector('#spLedgerPanel');
        if(!panel){
            panel=el('section');panel.id='spLedgerPanel';panel.style.cssText='position:relative;z-index:5;cursor:default;background:rgba(255,255,255,.94);border-radius:9px;padding:12px;font-size:13px;max-height:65vh;overflow:auto';
            panel.addEventListener('mousedown',e=>e.stopPropagation());box.appendChild(panel);
            const style=el('style');style.textContent='#bureauTotals[data-minimized="true"] #spLedgerPanel{display:none} #spLedgerPanel summary{cursor:pointer;padding:7px 0} #spLedgerPanel button,#spLedgerPanel select{margin:5px 3px 0 0;max-width:100%} #spLedgerPanel small{display:block;overflow-wrap:anywhere}';document.head.appendChild(style);
        }
        const session=r&&read('session:'+r.session);
        const tracked=session&&!session.ended?sessionJobs(r.session):[];
        const jobs=tracked.filter(countable);
        const unassigned=tracked.filter(j=>norm(j.name)&&group(j).key==='Unassigned');
        const view=JSON.stringify([r,session&&session.address,session&&session.ended,jobs,unassigned,error,recovering,recoveryMessage,session&&canClear(r.session)]);if(view===lastView)return;lastView=view;
        panel.replaceChildren(el('strong','CLIENT TOTALS'));
        if(error)panel.append(el('p',error));
        if(!r||!session||session.ended){
            panel.append(el('p',(session&&session.ended)||(read('job:'+id())&&read('session:'+read('job:'+id()).session)?.ended)?'Session ended.':'Save a return address to start tracking. Processed jobs need their original client link.'));
            const existing=read('job:'+id());const s=existing&&read('session:'+existing.session);
            if(s&&s.ended){const start=el('button','Start new session');start.onclick=()=>{remove('session:'+existing.session);observed.clear();keys().filter(k=>k.startsWith('job:')).forEach(k=>{const j=read(k);if(j&&j.session===existing.session)remove(k);});lastView='';tick();};panel.append(start);}
            if(!s||!s.ended){
                panel.querySelector('p').textContent=recovering?'Reading this job’s saved return address…':recoveryMessage||'Looking for this job’s saved client link.';
                const link=el('a','Open saved job settings');
                const url=new URL('/jobui',location.origin);url.searchParams.set('edit','true');url.searchParams.set('id',id());
                link.href=url.href;panel.append(link);
                if(!recovering&&!recoveryAttempts.has(id()))recoverSavedJob();
            }
            return;
        }
        panel.append(el('h4',session.address.name),el('small',[session.address.address1,session.address.address2,session.address.city,session.address.state,session.address.zip].filter(Boolean).join(', ')));
        if(r.deleted)panel.append(el('p','This job was deleted. Its cost has been removed.'));
        else if(!countable(r))panel.append(el('p',group(r).key==='Unassigned'
            ?'This job is unassigned and excluded from totals. Assign a bureau or recipient to count it.'
            :'This job is excluded until it has both a saved return address and a job name.'));
        const groups=new Map();let total=0,pending=0;
        jobs.forEach(j=>{const g=group(j);if(!groups.has(g.key))groups.set(g.key,{label:g.label,jobs:[],sum:0});const b=groups.get(g.key);b.jobs.push({j,g});if(Number.isInteger(j.cents)){b.sum+=j.cents;total+=j.cents;}else pending++;});
        [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label)).forEach(b=>{
            const details=el('details');details.append(el('summary',b.label+' · '+b.jobs.length+' job(s) · '+money(b.sum)));
            b.jobs.forEach(({j,g})=>{
                details.append(el('small','#'+j.id+' — '+(j.name||'Unnamed job')+' — '+(Number.isInteger(j.cents)?money(j.cents):'Awaiting price')),el('small',j.status||''));
                (j.recipients||[]).forEach(a=>details.append(el('small',[a.name,a.address1,a.address2,a.city,a.state,a.zip].filter(Boolean).join(', '))));
                if(g.warning)details.append(el('small','⚠ Recipient/job-name mismatch or multiple destinations. Review grouping.'));
                const select=el('select');select.setAttribute('aria-label','Group job '+j.id);
                [['','Automatic grouping'],['EX','Experian'],['EQU','Equifax'],['TU','TransUnion'],['Unassigned','Unassigned']].forEach(([v,l])=>{const o=el('option',l);o.value=v;select.append(o);});select.value=j.override||'';
                select.onchange=()=>{const latest=read('job:'+j.id);if(latest){latest.override=select.value;write('job:'+j.id,latest);lastView='';tick();}};details.append(select);
            });panel.append(details);
        });
        if(unassigned.length){
            const details=el('details');details.append(el('summary','Unassigned — excluded · '+unassigned.length+' job(s)'));
            unassigned.forEach(j=>{
                details.append(el('small','#'+j.id+' — '+j.name+' — not included in totals'));
                const select=el('select');select.setAttribute('aria-label','Assign job '+j.id);
                [['','Automatic grouping'],['EX','Experian'],['EQU','Equifax'],['TU','TransUnion']].forEach(([v,l])=>{
                    const option=el('option',l);option.value=v;select.append(option);
                });
                select.value=j.override||'';
                select.onchange=()=>{
                    const latest=read('job:'+j.id);
                    if(latest){latest.override=select.value;write('job:'+j.id,latest);lastView='';tick();}
                };
                details.append(select);
            });
            panel.append(details);
        }
        panel.append(el('h4','Total: '+money(total)),el('small',pending?pending+' job(s) awaiting price.':'Processed prices; approval status shown per job.'));
        const copy=el('button','Copy summary');copy.onclick=async()=>{try{await navigator.clipboard.writeText(session.address.name+'\n'+[...groups.values()].map(b=>b.label+': '+money(b.sum)).join('\n')+'\nTotal: '+money(total));copy.textContent='Copied';}catch(e){copy.textContent='Copy unavailable';}};
        const end=el('button','Clear');
        end.title='Clear this client’s tracked totals in all tabs (Postalocity jobs are not deleted).';
        end.onclick=()=>{
            if(!window.confirm('Clear all temporary totals for this client, including pending and approved jobs? This cannot be undone here. Jobs in Postalocity will NOT be deleted.'))return;
            if(clearSession(r.session))tick();
        };
        const awaiting=jobs.filter(j=>!isApproved(j)).length;
        panel.append(el('small',awaiting?awaiting+' tracked job(s) still awaiting approval. You may clear anyway.':'No tracked jobs awaiting approval.'));
        const nativeDelete=el('button','Delete job in Postalocity');
        nativeDelete.title='Use Postalocity’s own Delete Job action before closing the tab.';
        nativeDelete.onclick=requestNativeDeletion;
        if(r.deleted||isApproved(r))nativeDelete.disabled=true;
        panel.append(copy,end,nativeDelete,el('small','Closing a job tab immediately excludes its unapproved job from panel totals; approved jobs remain. This does not delete the Postalocity job. Use Delete job in Postalocity for permanent deletion.'));
    }
    function requestNativeDeletion(){
        const current=read('job:'+id());
        if(!current||current.deleted||isApproved(current))return;
        // Invoke Postalocity's real Delete Job control; removing a local
        // ledger entry alone does not delete a job on Postalocity.
        const button=[...document.querySelectorAll('button[onclick],a[onclick]')].find(el=>
            /^\s*(?:return\s+)?deleteJob\s*\(\s*\)\s*;?\s*$/.test(el.getAttribute('onclick')||'')
            &&!el.closest('#spLedgerPanel')&&!el.disabled);
        if(button){button.click();return;}
        if(typeof window.deleteJob==='function'){window.deleteJob();return;}
        window.alert('Postalocity’s Delete Job control was not found. Delete the job from Postalocity before closing the tab.');
    }
    // beforeunload itself does not identify why the page is leaving.
    // Recognize normal navigations and reloads before they reach it. The
    // remaining case is *likely* tab/window close, never a guaranteed signal.
    const NAVIGATION_GRACE_MS=1800;
    let lastKnownNavigation=0;
    function noteKnownNavigation(){lastKnownNavigation=Date.now();}
    function recentKnownNavigation(){
        return lastKnownNavigation>0&&Date.now()-lastKnownNavigation<NAVIGATION_GRACE_MS;
    }
    function trackNormalNavigation(){
        // Modern browsers report toolbar refresh, Back/Forward, links and
        // programmatic navigation here. This does not fire on tab close.
        if(window.navigation&&typeof window.navigation.addEventListener==='function'){
            window.navigation.addEventListener('navigate',event=>{
                if(event.hashChange||event.downloadRequest!=null)return;
                noteKnownNavigation();
            });
        }
        // Fallbacks for browsers without the Navigation API.
        document.addEventListener('click',event=>{
            if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
            const link=event.target&&event.target.closest&&event.target.closest('a[href]');
            if(!link||link.hasAttribute('download')||(link.target&&link.target!=='_self'))return;
            const href=(link.getAttribute('href')||'').trim();
            if(href&&!href.startsWith('#')&&!/^(?:javascript:|mailto:|tel:)/i.test(href))noteKnownNavigation();
        },true);
        document.addEventListener('submit',event=>{
            if(!event.defaultPrevented)noteKnownNavigation();
        },true);
        document.addEventListener('keydown',event=>{
            const key=String(event.key||'').toLowerCase();
            if(key==='f5'||((event.ctrlKey||event.metaKey)&&key==='r')||
               (event.altKey&&(key==='arrowleft'||key==='arrowright')))noteKnownNavigation();
        },true);
    }
    function warnIfLeaving(event){
        // A recognized refresh, link, form submission or history navigation
        // must not show SUPER POSTAL's close-tab prompt.
        if(recentKnownNavigation())return;
        const current=read('job:'+id());
        if(!current||current.deleted||isApproved(current))return;
        const session=read('session:'+current.session);
        if(!session||session.ended)return;
        // Native browser X/close has no dedicated cancelable event. This is a
        // best-effort close-only prompt, not a reliable close detector.
        event.preventDefault();
        event.returnValue='';
    }
    function tick(){try{if(leaving)return;clean();hookRecipientSave();render(capture());}catch(e){console.warn('SUPER POSTAL totals:',e);}}
    window.addEventListener('storage',e=>{if(e.key&&e.key.startsWith(PREFIX))tick();});
    document.addEventListener('click',e=>{if(e.target.closest('#processBtn')){const r=capture();if(r&&!r.deleted&&!isApproved(r)){r.cents=null;r.status='Processing';write('job:'+r.id,r);}}},true);
    trackNormalNavigation();
    window.addEventListener('beforeunload',warnIfLeaving);
    window.addEventListener('pagehide',leavePage);
    window.addEventListener('pageshow',()=>{leaving=false;lastPresence=0;tick();});
    setInterval(tick,1500);tick();
})();

})();
