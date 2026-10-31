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
    // Resolve once in the same way for filename caching and LIQUIDATION.
    // A URL job ID is authoritative during same-tab job navigation.
    try{
        const params=new URLSearchParams(window.location.search);
        const urlId=params.get('jobId')||params.get('id');
        if(urlId&&/^\d+$/.test(urlId))return urlId;
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
    const rows=modalIsOtherJob?[]:spPdfNativeModalNames();
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
    // Send an event only after the existing saved-address verification succeeds.
    // Liquidation can use this to start/join one shared cross-tab working session.
    window.dispatchEvent(new Event('sp:verifiedReturnAddressSaved'));
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
// This bridge lives in the outer userscript scope. The LIQUIDATION module
// below has its own nested scope and registers its tracking function here.
let spLiquidationStageJob=null;
function spLiquidationTrackingNotice(message){
    // LIQUIDATION is an independent expense calculator. Failure to record a
    // price must be visible, but must never prevent Postalocity processing.
    const text=String(message||'Unable to track this job.');
    console.warn('[SUPER-POSTAL LIQUIDATION]',text);
    if(!document.body)return;
    let note=document.querySelector('#spLiquidationTrackingNotice');
    if(!note){
        note=document.createElement('div');
        note.id='spLiquidationTrackingNotice';
        note.setAttribute('role','alert');
        note.style.cssText='position:fixed;top:18px;right:18px;z-index:2147483100;max-width:380px;padding:13px 36px 13px 15px;border:2px solid #b56b13;border-radius:10px;background:#fff5df;color:#533600;font:600 12px/1.5 Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.22)';
        document.body.appendChild(note);
    }
    note.replaceChildren();
    const label=document.createElement('span');
    label.textContent='LIQUIDATION warning: '+text+' Postalocity processing is not blocked by LIQUIDATION.';
    const close=document.createElement('button');
    close.type='button';
    close.textContent='×';
    close.setAttribute('aria-label','Dismiss LIQUIDATION warning');
    close.style.cssText='position:absolute;top:5px;right:7px;font-size:20px;border:0;background:none;cursor:pointer';
    close.addEventListener('click',function(){note.remove();});
    note.append(label,close);
}
function spBlockIncompleteProcess(event,control){
    let result;
    try{result=spJobDetailsReadiness();}
    catch(_error){result={ready:false,missing:['Job details could not be verified']};}
    // Postalocity's own required job details are the only blocking checks.
    // LIQUIDATION already calculates the displayed pre-Process price from
    // uploaded jobs, so it must never hold the native Process button hostage.
    if(result.ready){
        try{
            const tracking=typeof spLiquidationStageJob==='function'?
                spLiquidationStageJob():{ready:false,reason:'LIQUIDATION has not loaded.'};
            if(!tracking||tracking.ready!==true)
                spLiquidationTrackingNotice(tracking&&tracking.reason||
                    'Could not record the uploaded job price.');
        }catch(_error){
            console.error('[SUPER-POSTAL] LIQUIDATION stage error:',_error);
            spLiquidationTrackingNotice('The expense tracker encountered an error.');
        }
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
// POSTAL CALCULATOR
///////////////////////////////
(function(){

const box = document.createElement("div");

box.id = "bureauTotals";

Object.assign(box.style,{
    position:"fixed",
    top:"120px",
    right:"15px",
    width:"320px",
    background:"rgb(242,179,46)",
    color:"black",
    padding:"25px",
    borderRadius:"12px",
    zIndex:"999999",
    boxShadow:"0 0 15px rgba(0,0,0,.45)",
    cursor:"move",
    overflow:"visible",
    boxSizing:"border-box",
    fontFamily:"Arial, sans-serif"
});

box.innerHTML = `
<div id="calculator" style="width:100%;position:relative;z-index:10;font-family:Arial,sans-serif;">
    <div style="font-size:20px;font-weight:800;text-align:center;margin-bottom:10px;letter-spacing:1px;">LIQUIDATION</div>
    <section id="liqReturnPreview" style="border-radius:8px;background:#fff9e9;padding:10px 11px;margin-bottom:10px;border:1px solid #b98a23;">
        <div id="liqReturnStatus" style="font-size:10px;color:#76581a;font-weight:700;margin-bottom:4px;">RETURN ADDRESS</div>
        <strong id="liqReturnName" style="display:block;font-size:13px;overflow-wrap:anywhere;">No return address entered</strong>
        <div id="liqReturnAddress" style="font-size:11px;white-space:pre-line;line-height:1.5;overflow-wrap:anywhere;"></div>
    </section>
    <div style="border-radius:9px;background:#222;color:#fff;padding:11px 12px;margin-bottom:11px;">
        <div style="font-size:11px;font-weight:700;opacity:.82;letter-spacing:.5px;">TOTAL TRACKED MAILING COST</div>
        <div id="liqGrandTotal" style="font-size:28px;font-weight:800;text-align:right;">$0.00</div>
        <div id="liqJobCount" style="font-size:11px;text-align:right;opacity:.78;">0 processed · 0 quoted · 0 awaiting price</div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:8px;">
        <strong id="liqSessionLabel" style="font-size:12px;">No active client</strong>
        <button id="liqClearAll" type="button" style="font-size:11px;padding:4px 8px;border:1px solid #7e5b18;border-radius:5px;background:transparent;color:#261900;cursor:pointer;">Reset session</button>
    </div>
    <section id="liqDraftArea" style="margin-bottom:10px;">
        <strong style="font-size:12px;">Uploaded files · live</strong>
        <div id="liqDraftFiles" style="max-height:170px;overflow:auto;margin-top:6px;"></div>
    </section>
    <div id="liqClientGroups" style="max-height:245px;overflow:auto;"></div>
    <button id="liqRecoverCurrent" type="button" hidden style="margin-top:6px;width:100%;border:1px solid #7e5b18;border-radius:5px;padding:6px;background:#fff;color:#261900;cursor:pointer;font-size:11px;">Recover this processed job</button>
    <div id="liqHint" style="font-size:10px;line-height:1.5;color:#49340c;margin-top:9px;">
        LIQUIDATION totals Postalocity's Total Price before Process this job and updates it if the processed price changes. Shared across tabs.
    </div>
</div>
`;

///////////////////////////////
// CLIENT LIQUIDATION — STAGE JOB, THEN ATTACH ACTUAL PROCESSED PRICE
///////////////////////////////
// Local, per-browser working container. Never add the hidden new-job estimate.
// Same-origin localStorage is shared by all Postalocity tabs in this browser
// profile. Each job has a separate record to avoid last-writer-wins data loss.
const LIQ_PREFIX='sp-liq-temporary-v6:';
const LIQ_LEGACY_PREFIX='sp-liq-temporary-v5:';
const LIQ_LEGACY_ACTIVE_KEY=LIQ_LEGACY_PREFIX+'active';
const LIQ_LEGACY_JOB_PREFIX=LIQ_LEGACY_PREFIX+'job:';
const LIQ_LEGACY_DRAFT_PREFIX=LIQ_LEGACY_PREFIX+'draft:';
const LIQ_SESSION_PREFIX=LIQ_PREFIX+'session:';
const LIQ_TAB_BIND_PREFIX=LIQ_PREFIX+'tab-job-client:';
const LIQ_MIGRATED_PREFIX=LIQ_PREFIX+'migrated:';
const LIQ_ACTIVE_KEY=LIQ_SESSION_PREFIX;
const LIQ_JOB_PREFIX=LIQ_PREFIX+'job:';
const LIQ_OLD_TAB_KEY='sp-return-identity-liquidation-v4';
const LIQ_MIGRATION_CLOSED=LIQ_PREFIX+'legacyImportClosed';
const LIQ_MAX_IDLE=24*60*60*1000;
const LIQ_ACTIVITY_PREFIX=LIQ_PREFIX+'activity:';
const LIQ_DRAFT_PREFIX=LIQ_PREFIX+'draft:';
const LIQ_TARGETS={EQU:'Equifax',EX:'Experian',TU:'TransUnion'};
let liqLastView='',liqLastNotice='',liqLastLiveSignature='';
function liqEmptySession(){
    return {clientKey:'',clientName:'',sessionId:'',jobs:{},drafts:{}};
}
function liqSessionStorageKey(key){return LIQ_SESSION_PREFIX+key;}
function liqBindingKey(id){return LIQ_TAB_BIND_PREFIX+id;}
function liqBindTab(session){
    const id=liqJobId();
    if(!id||!session)return;
    try{window.sessionStorage.setItem(liqBindingKey(id),session.clientKey);}
    catch(_error){}
}
function liqBoundClient(){
    const id=liqJobId();
    if(!id)return '';
    try{return window.sessionStorage.getItem(liqBindingKey(id))||'';}
    catch(_error){return '';}
}
function liqGetClientSession(clientKey){
    if(!clientKey)return null;
    try{
        const name=liqSessionStorageKey(clientKey);
        const raw=window.localStorage.getItem(name);
        if(!raw)return null;
        const data=JSON.parse(raw);
        if(!data||data.clientKey!==clientKey||!data.id||!data.clientName)return null;
        const last=Number(window.localStorage.getItem(
            LIQ_ACTIVITY_PREFIX+data.id))||data.createdAt;
        if(!Number.isFinite(last)||last>Date.now()+60000||
           Date.now()-last>LIQ_MAX_IDLE){
            window.localStorage.removeItem(name);
            liqPurgeSession(data);
            return null;
        }
        return data;
    }catch(_error){return null;}
}
function liqNewSessionId(){
    if(window.crypto&&typeof window.crypto.randomUUID==='function')
        return window.crypto.randomUUID();
    return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,14);
}
function liqActive(){
    const identity=liqReturnIdentity(false);
    if(identity){
        const session=liqGetClientSession(identity.key);
        if(session)liqBindTab(session);
        return session;
    }
    const bound=liqBoundClient();
    return bound?liqGetClientSession(bound):null;
}
function liqJobKey(session,id){
    return LIQ_JOB_PREFIX+session.id+':'+id;
}
function liqDraftKey(session,id){
    return LIQ_DRAFT_PREFIX+session.id+':'+id;
}
function liqDraftRecords(session){
    const drafts={};
    if(!session)return drafts;
    const prefix=LIQ_DRAFT_PREFIX+session.id+':';
    try{
        for(let i=0;i<window.localStorage.length;i++){
            const key=window.localStorage.key(i);
            if(!key||!key.startsWith(prefix))continue;
            const id=key.slice(prefix.length);
            if(!/^\d+$/.test(id))continue;
            try{
                const candidate=JSON.parse(window.localStorage.getItem(key)||'null');
                if(candidate&&candidate.id===id &&
                   candidate.sessionId===session.id &&
                   candidate.sessionKey===session.clientKey &&
                   Array.isArray(candidate.files))drafts[id]=candidate;
            }catch(_error){/* A bad draft must not hide other jobs. */}
        }
    }catch(_error){}
    return drafts;
}
function liqRemoveDraft(id,session){
    if(!session||!/^\d+$/.test(String(id)))return;
    try{window.localStorage.removeItem(liqDraftKey(session,String(id)));}
    catch(_error){}
}
function liqCurrentReturnDisplay(){
    const form=document.querySelector('#settingsReturnAddress-Modal #envelopeReturn-address');
    if(!form||spReturnIsSampleForm(form))return null;
    const nameField=spReturnFormField(form,'name');
    const name=String(nameField&&nameField.value||'').trim();
    const lines=spReturnAddressLines();
    if(!Array.isArray(lines)||!lines.length)return null;
    const address=lines.slice(name&&lines[0]===name?1:0).join('\n').trim();
    if(!name&&!address)return null;
    const identity=liqReturnIdentity();
    const previewIdentity=identity||liqReturnIdentity(false);
    return {name:name,address:address,identity:identity,
        previewIdentity:previewIdentity,saved:!!identity};
}
function liqSharedReturnDisplay(session){
    if(!session)return null;
    const display=session.returnDisplay;
    // Every tab must have at least the same shared client label. The postal
    // address appears after its original tab publishes a verified save.
    return {name:String(display&&display.name||session.clientName),
        address:String(display&&display.address||''),
        saved:true,identity:null};
}
function liqRememberReturnDisplay(identity){
    const current=liqActive();
    if(!current||!identity||current.clientKey!==identity.key)return;
    const display=liqCurrentReturnDisplay();
    if(!display||!display.saved)return;
    const next={name:display.name,address:display.address};
    const old=current.returnDisplay||null;
    if(old&&old.name===next.name&&old.address===next.address)return;
    const updated={...current,returnDisplay:next};
    try{
        // Temporary local shared display; removed on reset or expiry.
        const key=liqSessionStorageKey(current.clientKey);
        const raw=window.localStorage.getItem(key);
        const stored=raw&&JSON.parse(raw);
        if(!stored||stored.id!==current.id)return;
        window.localStorage.setItem(key,JSON.stringify(updated));
    }catch(_error){}
}
function liqPreviewFiles(files){
    return files.map(function(name){
        const parsed=liqParseFileLabel(name);
        return {name:String(name),target:parsed?parsed.target:null,
            label:parsed?parsed.targetLabel:'Check destination'};
    });
}
function liqIsNewJob(){
    const state=document.querySelector('#jobState');
    const status=String(state&&state.textContent||'').trim();
    return !!document.querySelector('#newJobContent') &&
        !/\b(processed|approved|mailed|completed|complete)\b/i.test(status);
}
function liqSyncDraft(){
    if(!liqIsNewJob())return;
    const id=liqJobId();
    if(!id)return;
    const active=liqActive();
    if(!active)return;
    // A second tab may have a fully preloaded Return Address but not the
    // sessionStorage save receipt created in the original tab.
    // Matching the already-verified shared client is safe for an uploaded
    // *preview*; it never creates a client session or counts a price.
    const identity=liqReturnIdentity()||liqReturnIdentity(false);
    const existing=liqDraftRecords(active)[id];
    if(!identity||identity.key!==active.clientKey){
        // If the user replaces a saved return address with a different
        // draft on this job, stop advertising its stale uploads as belonging
        // to the previous client. An unloaded form (null identity) is left
        // untouched because it might simply be loading asynchronously.
        if(identity&&existing)liqRemoveDraft(id,active);
        return;
    }
    const names=spPdfNamesFromPage().filter(name=>/\.pdf$/i.test(String(name)));
    const key=liqDraftKey(active,id);
    const tracked=liqJobRecords(active)[id];
    if(tracked){
        if(existing)liqRemoveDraft(id,active);
        return;
    }
    if(!names.length){
        if(existing)liqRemoveDraft(id,active);
        return;
    }
    const name=liqJobName()||'Job #'+id;
    const parsed=liqFromFiles(names,name);
    const quotedCents=liqNewJobTotal();
    if(existing&&existing.jobName===name &&
       JSON.stringify(existing.files)===JSON.stringify(names) &&
       existing.quotedCents===quotedCents &&
       existing.target===(parsed&&parsed.target||null))return;
    const draft={id:id,sessionId:active.id,sessionKey:active.clientKey,
        jobName:name,files:names,quotedCents:quotedCents,
        target:parsed?parsed.target:null,
        targetLabel:parsed?parsed.targetLabel:null,updatedAt:Date.now()};
    try{
        // One independent Postalocity price per job; all tabs sum these records.
        window.localStorage.setItem(key,JSON.stringify(draft));
        liqRender();
    }catch(_error){}
}
function liqRenderLive(){
    const panel=box.querySelector('#calculator');
    if(!panel)return;
    const active=liqActive(),local=liqCurrentReturnDisplay();
    const shared=liqSharedReturnDisplay(active);
    const localKey=local&&local.previewIdentity&&local.previewIdentity.key;
    const same=!!(active&&localKey===active.clientKey);
    const different=!!(active&&localKey&&localKey!==active.clientKey);
    // Prefer the common saved client on every tab. The one exception is
    // a different, unsaved Return Address being entered in THIS tab: show
    // that draft with an explicit warning, without changing shared storage.
    const display=different&&local?local:(shared||local);
    const status=!display?'RETURN ADDRESS':
        different?'DIFFERENT CLIENT ON THIS TAB · NOT SHARED':
        shared&&same&&local.saved?'SAVED RETURN ADDRESS · ACTIVE SESSION':
        shared&&same?'ACTIVE CLIENT · LINKED ACROSS TABS':
        shared?'ACTIVE CLIENT · SHARED ACROSS TABS':
        local&&!local.saved?'DRAFT RETURN ADDRESS · NOT SAVED':
        'SAVED RETURN ADDRESS';
    const localFiles=liqIsNewJob()?spPdfNamesFromPage().filter(
        name=>/\.pdf$/i.test(String(name))):[];
    const currentId=liqJobId();
    const currentJobName=liqJobName();
    const data=liqRead();
    const entries=[];
    const drafts=active?liqDraftRecords(active):{};
    Object.values(drafts).forEach(function(draft){
        if(data.jobs[draft.id])return;
        if(draft.id===currentId&&liqIsNewJob())return;
        entries.push({id:draft.id,jobName:draft.jobName,files:draft.files,
            quotedCents:draft.quotedCents,shared:true});
    });
    // Once Process has been clicked successfully, the job moves to the
    // recorded list below. Do not show the same files as unprocessed uploads.
    if(localFiles.length && !data.jobs[currentId]){
        entries.unshift({id:currentId,jobName:currentJobName,
            files:localFiles,quotedCents:liqNewJobTotal(),shared:false});
    }
    const unlinked=!!(active&&localFiles.length&&liqIsNewJob()&&!same);
    const warning=unlinked?(different?
        'This tab belongs to a different client. These uploads are NOT included in the shared session.':
        'This tab is not linked yet. Open Return Address to load and verify the client before sharing uploads.'):
        '';
    const signature=JSON.stringify([
        active&&active.id,display&&display.name,display&&display.address,
        status,warning,entries.map(x=>[x.id,x.jobName,x.files,x.quotedCents,x.shared])
    ]);
    if(signature===liqLastLiveSignature)return;
    liqLastLiveSignature=signature;
    const elStatus=panel.querySelector('#liqReturnStatus');
    const elName=panel.querySelector('#liqReturnName');
    const elAddress=panel.querySelector('#liqReturnAddress');
    const elFiles=panel.querySelector('#liqDraftFiles');
    if(elStatus)elStatus.textContent=status;
    if(elName)elName.textContent=display&&display.name||'No return address entered';
    if(elAddress)elAddress.textContent=(display&&display.address||'')+
        (warning?'\n'+warning:'');
    if(!elFiles)return;
    elFiles.replaceChildren();
    if(!entries.length){
        elFiles.appendChild(liqElement('div','No uploaded files in the active draft.',{
            fontSize:'11px',padding:'7px 3px',opacity:'.75'
        }));
        return;
    }
    entries.forEach(function(entry){
        const card=liqElement('div',null,{
            background:'rgba(255,255,255,.6)',borderRadius:'6px',
            padding:'6px 8px',marginBottom:'5px'
        });
        const source=entry.shared?'Other tab · uploaded, not processed':
            'Current job · uploaded, not processed';
        card.appendChild(liqElement('div',
            source+(entry.id?' · Job #'+entry.id:'')+
            (Number.isSafeInteger(entry.quotedCents)?
                ' · '+liqMoney(entry.quotedCents):' · Price unavailable'),{
                fontSize:'10px',fontWeight:'700',opacity:'.76',
                marginBottom:'4px'
            }));
        liqPreviewFiles(entry.files).forEach(function(file){
            const row=liqElement('div',null,{
                display:'flex',justifyContent:'space-between',gap:'5px',
                alignItems:'flex-start',margin:'5px 0'
            });
            row.append(
                liqElement('span',file.name,{
                    minWidth:'0',flex:'1',fontSize:'11px',overflowWrap:'anywhere'
                }),
                liqElement('strong',file.label,{
                    fontSize:'10px',whiteSpace:'nowrap'
                })
            );
            card.appendChild(row);
        });
        elFiles.appendChild(card);
    });
}

function liqJobRecords(session){
    const jobs={};
    if(!session)return jobs;
    const prefix=LIQ_JOB_PREFIX+session.id+':';
    try{
        for(let i=0;i<window.localStorage.length;i++){
            const key=window.localStorage.key(i);
            if(!key||!key.startsWith(prefix))continue;
            const id=key.slice(prefix.length);
            if(!/^\d+$/.test(id))continue;
            try{
                const item=JSON.parse(window.localStorage.getItem(key)||'null');
                if(item&&item.id===id&&item.sessionKey===session.clientKey &&
                   item.sessionId===session.id)jobs[id]=item;
            }catch(_error){}
        }
    }catch(_error){liqLastNotice='Could not read shared liquidation records.';}
    return jobs;
}
function liqRead(){
    const active=liqActive();
    if(!active)return liqEmptySession();
    return {clientKey:active.clientKey,clientName:active.clientName,
            sessionId:active.id,jobs:liqJobRecords(active),drafts:liqDraftRecords(active)};
}
function liqSaveJob(record,session){
    if(!session||!record||!/^\d+$/.test(String(record.id)))return false;
    const current=liqActive();
    // Verify this job belongs to the session selected by its Return Address.
    if(!current||current.id!==session.id ||current.clientKey!==session.clientKey)return false;
    const item={...record,id:String(record.id),sessionKey:session.clientKey,
                sessionId:session.id,client:current.clientName};
    const jobKey=liqJobKey(session,item.id);
    const value=JSON.stringify(item);
    try{
        window.localStorage.setItem(jobKey,value);
        // Verify the write and session pointer before native processing.
        if(window.localStorage.getItem(jobKey)!==value ||
           !liqTouchSession(session)){
            liqLastNotice='Shared liquidation record could not be verified.';
            return false;
        }
    }catch(_error){liqLastNotice='Cannot save shared liquidation job.';return false;}
    return true;
}
function liqRemoveJob(id){
    const active=liqActive();
    if(!active||!/^\d+$/.test(String(id)))return;
    try{
        window.localStorage.removeItem(liqJobKey(active,String(id)));
        liqTouchSession(active);
    }catch(_error){liqLastNotice='Cannot remove job from shared records.';}
}
function liqPurgeSession(session){
    if(!session)return;
    const prefix=LIQ_JOB_PREFIX+session.id+':';
    try{
        const keys=[];
        for(let i=0;i<window.localStorage.length;i++){
            const key=window.localStorage.key(i);
            if(key&&key.startsWith(prefix))keys.push(key);
        }
        keys.forEach(key=>window.localStorage.removeItem(key));
        const draftPrefix=LIQ_DRAFT_PREFIX+session.id+':';
        const draftKeys=[];
        for(let i=0;i<window.localStorage.length;i++){
            const key=window.localStorage.key(i);
            if(key&&key.startsWith(draftPrefix))draftKeys.push(key);
        }
        draftKeys.forEach(key=>window.localStorage.removeItem(key));
        window.localStorage.removeItem(LIQ_ACTIVITY_PREFIX+session.id);
    }catch(_error){}
}
function liqTouchSession(session){
    const active=liqActive();
    if(!active||active.id!==session.id)return false;
    try{
        window.localStorage.setItem(LIQ_ACTIVITY_PREFIX+session.id,String(Date.now()));
        return true;
    }catch(_error){return false;}
}
function liqStartSession(identity,explicit){
    if(!identity||!identity.key||!identity.name)return null;
    const existing=liqGetClientSession(identity.key);
    if(existing){
        liqBindTab(existing);
        if(explicit)liqTouchSession(existing);
        return existing;
    }
    if(!explicit&&!spReturnSavedReady())return null;
    const key=liqSessionStorageKey(identity.key);
    const newSession={id:liqNewSessionId(),clientKey:identity.key,
        clientName:identity.name,createdAt:Date.now()};
    try{
        // Recheck to reduce the chance of a simultaneous-tab overwrite.
        const found=liqGetClientSession(identity.key);
        if(found){liqBindTab(found);return found;}
        window.localStorage.setItem(key,JSON.stringify(newSession));
        const saved=liqGetClientSession(identity.key);
        if(!saved)return null;
        liqBindTab(saved);
        liqTouchSession(saved);
        liqLastNotice='';
        liqLastLiveSignature='';
        liqRender();
        return saved;
    }catch(_error){
        liqLastNotice='Cannot create this client session.';
        return null;
    }
}
function liqResetSession(){
    const current=liqActive();
    if(!current)return;
    try{
        window.localStorage.removeItem(liqSessionStorageKey(current.clientKey));
        liqPurgeSession(current);
        const id=liqJobId();
        if(id)window.sessionStorage.removeItem(liqBindingKey(id));
    }catch(_error){liqLastNotice='Could not reset this client session.';}
    liqLastLiveSignature='';
    liqRender();
}
function liqMigrateTabJobs(){
    const active=liqActive();
    if(!active)return;
    const flag=LIQ_MIGRATED_PREFIX+active.clientKey;
    try{
        if(window.localStorage.getItem(flag))return;
        const oldRaw=window.localStorage.getItem(LIQ_LEGACY_ACTIVE_KEY);
        const old=oldRaw&&JSON.parse(oldRaw);
        if(old&&old.id&&old.clientKey===active.clientKey){
            const oldJobPrefix=LIQ_LEGACY_JOB_PREFIX+old.id+':';
            const oldDraftPrefix=LIQ_LEGACY_DRAFT_PREFIX+old.id+':';
            const keys=[];
            for(let i=0;i<window.localStorage.length;i++){
                const key=window.localStorage.key(i);
                if(key&&(key.startsWith(oldJobPrefix)||key.startsWith(oldDraftPrefix)))
                    keys.push(key);
            }
            keys.forEach(function(key){
                try{
                    const item=JSON.parse(window.localStorage.getItem(key)||'null');
                    if(!item||!/^\d+$/.test(String(item.id))||
                        item.sessionKey!==active.clientKey)return;
                    if(key.startsWith(oldJobPrefix)){
                        const dest=liqJobKey(active,String(item.id));
                        if(!window.localStorage.getItem(dest))
                            liqSaveJob({...item,sessionId:active.id},active);
                    }else{
                        const dest=liqDraftKey(active,String(item.id));
                        if(!window.localStorage.getItem(dest))
                            window.localStorage.setItem(dest,JSON.stringify({
                                ...item,sessionId:active.id
                            }));
                    }
                }catch(_error){}
            });
        }
        window.localStorage.setItem(flag,'true');
    }catch(_error){}
}
function liqNewJobTotal(){
    if(!liqIsNewJob())return null;
    // Prefer the actual new-job content over shared/hidden template rows.
    for(const query of [
        '#newJobContent .totalPriceRow .totalPrice',
        '#newJobContent .totalPrice',
        '#newJobSteps .totalPriceRow .totalPrice',
        '#newJobSteps .totalPrice'
    ]){
        const el=document.querySelector(query);
        if(!el)continue;
        const cents=liqParsePrice(el.textContent);
        if(cents!==null)return cents;
    }
    return null;
}
function liqMoney(cents){
    return '$'+(cents/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function liqParsePrice(value){
    const text=String(value||'').trim();
    const m=text.match(/^\$?\s*((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?\s*$/);
    if(!m)return null;
    const amount=Number(m[1].replace(/,/g,''))*100+Number((m[2]||'').padEnd(2,'0'));
    return Number.isSafeInteger(amount)&&amount>=0?amount:null;
}
function liqJobId(){
    return spPdfCurrentJobId();
}

function liqJobName(){
    const title=document.querySelector('#jobName');
    const input=document.querySelector('#overview-jobName');
    return String((title&&title.textContent.trim())||(input&&input.value)||'').trim();
}
function liqKey(value){
    return String(value||'').trim().replace(/\s+/g,' ').toUpperCase();
}
function liqReturnIdentity(requireSaved){
    const form=document.querySelector('#settingsReturnAddress-Modal #envelopeReturn-address');
    // The strict default remains authoritative for processing and switching.
    // Read-only previews may match a filled address against an ALREADY active
    // saved client, even when this tab lacks its own per-tab save receipt.
    if(!form || spReturnIsSampleForm(form) ||
       (requireSaved!==false && !spReturnSavedReady()))return null;
    const read=function(key){
        const field=spReturnFormField(form,key);
        return String(field&&field.value||'');
    };
    const clean=function(value){
        return liqKey(value).replace(/[.,'’]/g,'').replace(/\s+/g,' ').trim();
    };
    const street=function(value){
        // Common USPS suffix, direction and unit spelling variations.
        const words=liqKey(value).replace(/#/g,' UNIT ').replace(/[.,'’]/g,' ')
            .replace(/\s+/g,' ').trim().split(' ');
        const aliases={
            STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',
            DRIVE:'DR',LANE:'LN',COURT:'CT',PLACE:'PL',
            PARKWAY:'PKWY',HIGHWAY:'HWY',CIRCLE:'CIR',
            NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',
            APARTMENT:'UNIT',APT:'UNIT',SUITE:'UNIT',STE:'UNIT',
            FLOOR:'FL'
        };
        return words.map(word=>aliases[word]||word).join(' ').trim();
    };
    const state=spStateCode(read('state'))||clean(read('state'));
    const zipcode=clean(read('zip')).replace(/^(\d{5})[- ]\d{4}$/,'$1');
    const country=clean(read('country')).replace(
        /^(UNITED STATES(?: OF AMERICA)?|USA|U S A)$/,'US')||'US';
    const parts=[
        clean(read('name')),
        street([read('address1'),read('address2')].filter(Boolean).join(' ')),
        clean(read('city')),state,zipcode,country
    ];
    if(!parts[0]||!parts[1]||!parts[2]||!parts[3]||!parts[4])return null;
    // Two independent compact checksums avoid storing the raw address.
    // These identify the same saved name+address across separate jobs.
    const value=JSON.stringify(parts);
    let hashA=2166136261,hashB=2246822519;
    for(let i=0;i<value.length;i++){
        const code=value.charCodeAt(i);
        hashA=Math.imul(hashA^code,16777619);
        hashB=Math.imul(hashB^code,2246822519);
    }
    const key='RA:'+([hashA,hashB].map(function(n){
        return (n>>>0).toString(16).padStart(8,'0');
    }).join(''))+':'+value.length;
    const display=spReturnFormField(form,'name');
    return {key:key,name:String(display.value||'').trim()};
}
function liqDetectNewClient(){
    const status=document.querySelector('#jobState');
    if(!status||!/^new\b/i.test(status.textContent.trim())||
       !document.querySelector('#newJobContent'))return;
    const identity=liqReturnIdentity();
    if(!identity)return;
    liqStartSession(identity,false);
    liqMigrateTabJobs();
}
function liqVerifiedReturnSaved(){
    const identity=liqReturnIdentity();
    if(!identity)return;
    const active=liqStartSession(identity,true);
    if(active&&active.clientKey===identity.key){
        liqRememberReturnDisplay(identity);
        liqMigrateTabJobs();
        liqSyncDraft();
    }
    liqLastLiveSignature='';
    liqRender();
}
function liqTarget(raw){
    const key=liqKey(raw);
    if(['EQU','EQ','EQUIFAX'].includes(key))return {key:'EQU',label:'Equifax'};
    if(['EX','EXP','EXPERIAN'].includes(key))return {key:'EX',label:'Experian'};
    if(['TU','TRANSUNION','TRANS UNION'].includes(key))return {key:'TU',label:'TransUnion'};
    // Other destinations are creditors; do not silently count them as bureaus.
    if(key && key.length<=48 && /^[A-Z0-9][A-Z0-9 .&/']*$/.test(key) &&
       /[A-Z]/.test(key))return {key:'CR:'+key,label:key};
    return null;
}
const LIQ_TYPES=new Set([
    'LP','LATE','BK','BANKRUPTCY','CO','CHARGEOFF','CHARGE OFF','COL','COLL',
    'COLLECTION','INQ','INQUIRY','INQUIRIES','REPO','FORECLOSURE',
    'DELETE','DELETED','UPDATE','UPDATED','FRAUD','IDT','PA','PERSONAL INFO',
    'ROUND1','ROUND2','RD1','RD2','RD3','RD4','RD5','RD6','RD7','RD8','RD9'
]);
function liqParseFileLabel(raw){
    const original=String(raw||'').trim().split(/[\\/]/).pop()
        .replace(/\.pdf$/i,'').replace(/[–—]/g,'-').trim();
    const parts=original.split(/\s*-\s*/).map(x=>x.trim()).filter(Boolean);
    if(parts.length<2)return null;
    let hadType=false;
    if(parts.length>=3 && LIQ_TYPES.has(liqKey(parts[parts.length-1]))){
        parts.pop();hadType=true;
    }
    const destRaw=parts.pop();
    const client=parts.join('-').replace(/\s+/g,' ').trim();
    const dest=liqTarget(destRaw);
    // "Mary-Anne" is probably a hyphenated name, not creditor "Anne".
    if(!hadType && dest && dest.key.startsWith('CR:') &&
       destRaw!==destRaw.toUpperCase() && !/\s/.test(destRaw)){
        return null;
    }
    if(!client||!dest)return null;
    return {client:client,target:dest.key,targetLabel:dest.label,label:original};
}
function liqFromFiles(names,jobName){
    const files=names.filter(name=>/\.pdf$/i.test(String(name))).map(name=>String(name).trim());
    if(!files.length){
        const parsed=liqParseFileLabel(jobName);
        return parsed?{...parsed,files:[],source:'job name'}:null;
    }
    const parsed=files.map(liqParseFileLabel);
    const first=parsed[0];
    const consistent=!!first && parsed.every(item=>item &&
        liqKey(item.client)===liqKey(first.client) && item.target===first.target);
    if(consistent)return {...first,files:files,source:'PDF filename'};
    // One processed job has one total; never invent a client/destination
    // or apply the same cost to multiple names when filenames conflict.
    return null;
}
function liqActualPrice(){
    const status=document.querySelector('#jobState');
    const label=String(status&&status.textContent||'').trim();
    const approval=document.querySelector('#approveJobContent');
    if(!approval)return null;
    // The old ^(processed|approved|mailed) test missed status phrases
    // such as "Job has been processed" or "Processing complete".
    const finished=/\b(processed|approved|mailed|completed|complete)\b/i.test(label);
    const newJob=/^(new|draft)\b/i.test(label);
    const visible=typeof approval.getClientRects==='function'&&
        approval.getClientRects().length>0;
    // Don't read a hidden approval template while still editing a new job.
    if(newJob||(!finished&&!visible))return null;
    for(const selector of [
        '.totalPriceRow .totalPrice',
        '.totalPrice',
        '.totalPriceRow [data-total-price]'
    ]){
        const node=approval.querySelector(selector);
        if(!node)continue;
        const cents=liqParsePrice(node.textContent||node.value||'');
        if(cents!==null)return cents;
    }
    return null;
}
function liqStageJob(){
    const fail=function(reason){
        liqLastNotice=reason;
        try{liqRender();}catch(_error){}
        return {ready:false,reason:reason};
    };
    const id=liqJobId();
    if(!id)return fail('LIQUIDATION cannot identify the job number.');
    const identity=liqReturnIdentity();
    if(!identity)return fail('LIQUIDATION needs a confirmed saved Return Address.');
    const jobName=liqJobName(),names=spPdfNamesFromPage();
    const parsed=liqFromFiles(names,jobName);
    if(!parsed||!parsed.target)return fail('LIQUIDATION cannot assign this job to one bureau or creditor.');
    const active=liqActive()||liqStartSession(identity,false);
    if(!active||active.clientKey!==identity.key)return fail(
        'LIQUIDATION cannot match this job to its saved Return Address.');
    liqMigrateTabJobs();
    const previous=liqRead().jobs[id];
    if(previous&&previous.status==='processed'&&Number.isSafeInteger(previous.priceCents))
        return {ready:true};
    const draft=liqDraftRecords(active)[id];
    const freshQuote=liqNewJobTotal();
    const quote=freshQuote!==null?freshQuote:
        draft&&Number.isSafeInteger(draft.quotedCents)?draft.quotedCents:null;
    const record={
        id:id,jobName:jobName||'Job #'+id,files:parsed.files,
        client:active.clientName,sessionKey:active.clientKey,sessionId:active.id,
        target:parsed.target,targetLabel:parsed.targetLabel,source:parsed.source,
        quotedCents:quote,priceCents:quote,status:'processing',
        manual:false,updatedAt:Date.now()
    };
    if(previous&&previous.manual){
        record.target=previous.target;
        record.targetLabel=previous.targetLabel;
        record.manual=true;
    }
    if(!liqSaveJob(record,active))return fail('LIQUIDATION could not store this job.');
    try{liqRemoveDraft(id,active);liqLastNotice='';liqRender();}
    catch(_error){console.warn('[SUPER-POSTAL] Quote saved, preview failed:',_error);}
    return {ready:true};
}
function liqCaptureProcessed(){
    const id=liqJobId(),cents=liqActualPrice();
    if(!id||cents===null)return;
    const active=liqActive();
    if(!active)return;
    liqMigrateTabJobs();
    const data=liqRead();
    const identity=liqReturnIdentity()||liqReturnIdentity(false);
    if(identity&&identity.key!==active.clientKey)return;
    let previous=data.jobs[id];
    const draft=data.drafts[id];
    if(!previous&&draft&&draft.sessionId===active.id&&
       draft.sessionKey===active.clientKey&&
       liqValidAssignment(active.clientName,draft.target)){
        // Recovery of an uploaded quote that was never staged by the script.
        previous={
            id:id,jobName:draft.jobName||'Job #'+id,
            files:draft.files,client:active.clientName,
            sessionId:active.id,sessionKey:active.clientKey,
            target:draft.target,targetLabel:draft.targetLabel,
            source:'uploaded PDF (automatically reconciled)',
            quotedCents:Number.isSafeInteger(draft.quotedCents)?
                draft.quotedCents:null,
            priceCents:null,status:'processing',manual:false,
            updatedAt:Date.now()
        };
    }
    if(!previous||previous.sessionId!==active.id||
       previous.sessionKey!==active.clientKey)return;
    const job={...previous};
    const name=liqJobName();
    if(name)job.jobName=name;
    if(job.quotedCents===undefined){
        job.quotedCents=Number.isSafeInteger(job.priceCents)?
            job.priceCents:null;
    }
    if(job.priceCents===cents&&job.status==='processed')return;
    // The verified final price replaces the pre-Process quote in all totals.
    job.priceCents=cents;
    job.status='processed';
    job.updatedAt=Date.now();
    if(liqSaveJob(job,active)){
        liqRemoveDraft(id,active);
        liqRender();
    }
}
function liqValidAssignment(client,target){
    const name=liqKey(client);
    const dest=String(target||'');
    return !!name && name!=='UNSORTED' && name!=='UNASSIGNED' &&
        (dest==='EX'||dest==='EQU'||dest==='TU'||
         (dest.startsWith('CR:') && !!liqTarget(dest.slice(3))));
}
function liqElement(tag,text,style){
    const el=document.createElement(tag);
    if(text!==undefined&&text!==null)el.textContent=String(text);
    if(style)Object.assign(el.style,style);
    return el;
}
function liqGroupData(data){
    const clients=new Map();
    const jobs=Object.values(data.jobs).filter(job=>job&&
        /^\d+$/.test(String(job.id))&&
        liqValidAssignment(job.client,job.target)&&
        job.sessionKey===data.clientKey&&job.sessionId===data.sessionId);
    // Show quoted uploads immediately. A processed/staged record supersedes
    // the draft for the same job, so the amount is never counted twice.
    Object.values(data.drafts||{}).forEach(draft=>{
        if(!draft||! /^\d+$/.test(String(draft.id))||data.jobs[draft.id]||
           draft.sessionKey!==data.clientKey||draft.sessionId!==data.sessionId||
           !liqValidAssignment(data.clientName,draft.target))return;
        jobs.push({id:draft.id,client:data.clientName,target:draft.target,
            targetLabel:draft.targetLabel,files:draft.files,jobName:draft.jobName,
            status:'uploaded',virtual:true,quotedCents:draft.quotedCents,
            priceCents:draft.quotedCents});
    });
    jobs.forEach(job=>{
        if(!clients.has(data.clientKey))clients.set(data.clientKey,{
            client:data.clientName,key:data.clientKey,total:0,
            processed:0,quoted:0,pending:0,targets:new Map()
        });
        const client=clients.get(data.clientKey),target=job.target;
        if(!client.targets.has(target))client.targets.set(target,{
            key:target,label:job.targetLabel||target.replace(/^CR:/,''),
            total:0,processed:0,quoted:0,pending:0,jobs:[]
        });
        const group=client.targets.get(target);
        group.jobs.push(job);
        if(Number.isSafeInteger(job.priceCents)&&job.priceCents>=0){
            client.total+=job.priceCents;group.total+=job.priceCents;
            if(job.status==='processed'){client.processed++;group.processed++;}
            else{client.quoted++;group.quoted++;}
        }else{client.pending++;group.pending++;}
    });
    return Array.from(clients.values()).sort((a,b)=>a.client.localeCompare(b.client));
}
function liqRender(){
    const panel=box.querySelector('#calculator');
    if(!panel)return;
    const data=liqRead();
    const clients=liqGroupData(data);
    const grand=clients.reduce((sum,cl)=>sum+cl.total,0);
    const processed=clients.reduce((sum,cl)=>sum+cl.processed,0);
    const quoted=clients.reduce((sum,cl)=>sum+cl.quoted,0);
    const pending=clients.reduce((sum,cl)=>sum+cl.pending,0);
    const total=panel.querySelector('#liqGrandTotal');
    const count=panel.querySelector('#liqJobCount');
    const list=panel.querySelector('#liqClientGroups');
    const label=panel.querySelector('#liqSessionLabel');
    if(!total||!count||!list)return;
    if(label)label.textContent=data.clientName||'No active client';
    const recover=panel.querySelector('#liqRecoverCurrent');
    if(recover){
        const id=liqJobId(),price=liqActualPrice();
        const identity=liqReturnIdentity(),active=liqActive();
        recover.hidden=!(active&&id&&price!==null&&!data.jobs[id]&&
            (!identity||identity.key===active.clientKey));
    }
    const hint=panel.querySelector('#liqHint');
    if(hint)hint.textContent=liqLastNotice||
        'Separate temporary session per saved Return Address; matching jobs share totals across tabs.';
    total.textContent=liqMoney(grand);
    count.textContent=processed+' processed · '+quoted+' quoted · '+pending+' awaiting price';
    list.replaceChildren();
    if(!clients.length){
        list.appendChild(liqElement('p',data.clientName?'No quoted jobs yet. Upload PDFs to calculate.':'Save a Return Address and upload PDFs to begin.',{
            fontSize:'11px',padding:'8px 0',margin:'0'
        }));
        liqRenderLive();
        return;
    }
    clients.forEach(cl=>{
        const card=liqElement('section',null,{
            border:'1px solid #b58723',borderRadius:'8px',
            background:'rgba(255,255,255,.68)',marginBottom:'9px',
            overflow:'hidden'
        });
        const header=liqElement('div',null,{
            display:'flex',justifyContent:'space-between',alignItems:'center',
            gap:'5px',padding:'9px 10px',background:'rgba(255,255,255,.55)'
        });
        const title=liqElement('strong',cl.client,{fontSize:'13px',overflowWrap:'anywhere'});
        const amount=liqElement('strong',liqMoney(cl.total),{fontSize:'13px',whiteSpace:'nowrap'});
        header.append(title,amount);
        card.appendChild(header);
        const groups=Array.from(cl.targets.values()).sort((a,b)=>{
            const ord=['EQU','EX','TU'];const ia=ord.indexOf(a.key),ib=ord.indexOf(b.key);
            if(ia!==-1||ib!==-1)return (ia===-1?99:ia)-(ib===-1?99:ib);
            return a.label.localeCompare(b.label);
        });
        groups.forEach(g=>{
            const details=liqElement('details',null,{
                padding:'0 10px',borderTop:'1px solid rgba(0,0,0,.12)'
            });
            const summary=liqElement('summary',null,{
                cursor:'pointer',padding:'8px 0',fontSize:'12px',fontWeight:'700'
            });
            const subtitle=liqElement('span',g.label+' · '+g.jobs.length,{
                overflowWrap:'anywhere'
            });
            const sum=liqElement('span',liqMoney(g.total),{
                float:'right',whiteSpace:'nowrap'
            });
            summary.append(subtitle,sum);
            details.appendChild(summary);
            g.jobs.sort((a,b)=>Number(b.id)-Number(a.id)).forEach(job=>{
                const row=liqElement('div',null,{
                    padding:'7px 0 9px',borderTop:'1px dashed rgba(0,0,0,.16)',
                    fontSize:'11px',lineHeight:'1.5'
                });
                const top=liqElement('div',null,{
                    display:'flex',justifyContent:'space-between',gap:'5px'
                });
                top.append(liqElement('strong','Job #'+job.id+' · '+
                    (job.status==='processed'?'Processed':
                     job.status==='processing'?'Processing':'Uploaded')),
                    liqElement('strong',Number.isSafeInteger(job.priceCents)?
                        liqMoney(job.priceCents):'Price unavailable'));
                row.appendChild(top);
                if(job.status==='processed'&&Number.isSafeInteger(job.quotedCents)&&
                   job.quotedCents!==job.priceCents)row.appendChild(
                    liqElement('div','Before processing: '+liqMoney(job.quotedCents),{
                        fontSize:'10px',opacity:'.76'
                    }));
                const original=(Array.isArray(job.files)&&job.files.length)?
                    job.files.join(', '):'PDF name not captured';
                row.appendChild(liqElement('div',original,{
                    overflowWrap:'anywhere',color:'#49320b'
                }));
                if(job.jobName&&job.jobName!==original)row.appendChild(
                    liqElement('div','Job name: '+job.jobName,{
                        overflowWrap:'anywhere',opacity:'.76'
                    })
                );
                const actions=liqElement('div',null,{
                    display:'flex',justifyContent:'flex-end',gap:'7px',marginTop:'4px'
                });
                const edit=liqElement('button','Edit sorting',{
                    fontSize:'10px',border:'1px solid #ae8c39',borderRadius:'5px',
                    background:'#fff',padding:'3px 6px',cursor:'pointer'
                });
                edit.type='button';edit.dataset.liqEdit=job.id;
                const remove=liqElement('button','Remove',{
                    fontSize:'10px',border:'1px solid #d4aa75',borderRadius:'5px',
                    background:'#fff7ec',padding:'3px 6px',cursor:'pointer'
                });
                remove.type='button';remove.dataset.liqRemove=job.id;
                actions.append(edit,remove);
                row.appendChild(actions);
                details.appendChild(row);
            });
            card.appendChild(details);
        });
        list.appendChild(card);
    });
    liqRenderLive();
}
function liqConnectControls(){
    const panel=box.querySelector('#calculator');
    if(!panel||panel.dataset.liqControls==='true')return;
    panel.dataset.liqControls='true';
    // Restore may rebuild this panel from saved HTML; refresh live contents.
    liqLastLiveSignature='';
    // Keep the exact existing floating-panel drag behavior; prevent text
    // selection/expansion in the inner content from starting a panel drag.
    panel.addEventListener('mousedown',event=>{
        if(event.target.closest('button,summary,details,input,select'))
            event.stopPropagation();
    });
    panel.addEventListener('click',function(event){
        const edit=event.target.closest('button[data-liq-edit]');
        const remove=event.target.closest('button[data-liq-remove]');
        if(edit){
            const active=liqActive();
            if(!active)return;
            const record=liqRead().jobs[edit.dataset.liqEdit];
            if(!record)return;
            const label=window.prompt('Bureau or creditor for Job #'+record.id,
                record.targetLabel);
            if(label===null)return;
            const target=liqTarget(label);
            if(!target){window.alert('Enter a valid bureau or creditor.');return;}
            record.target=target.key;
            record.targetLabel=target.label;
            record.manual=true;
            record.updatedAt=Date.now();
            if(liqSaveJob(record,active))liqRender();
            return;
        }
        if(remove){
            liqRemoveJob(remove.dataset.liqRemove);
            liqRender();return;
        }
        if(event.target.closest('#liqRecoverCurrent')){
            liqRecoverCurrentJob();
            return;
        }
        if(event.target.closest('#liqClearAll')){
            if(!window.confirm('Reset this client liquidation session?'))return;
            liqResetSession();
        }

    });
    liqRender();
}
function liqRecoverCurrentJob(){
    const active=liqActive(),id=liqJobId(),cents=liqActualPrice();
    if(!active||!id||cents===null)return;
    const identity=liqReturnIdentity();
    if(identity&&identity.key!==active.clientKey){
        window.alert('This processed job has a different saved Return Address. It cannot be recovered into the current client.');
        return;
    }
    if(liqRead().jobs[id])return;
    const name=liqJobName();
    const parsed=liqFromFiles([],name);
    const fallback=parsed?null:window.prompt('Enter the bureau or creditor for this job (TU, EQ, EX, AMEX, etc.):','');
    if(fallback===null && !parsed)return;
    const target=parsed?{key:parsed.target,label:parsed.targetLabel}:liqTarget(fallback);
    if(!target){
        window.alert('Choose a valid bureau or creditor.');
        return;
    }
    if(!window.confirm('Recover processed Job #'+id+' ('+liqMoney(cents)+
        ') into '+active.clientName+'? Confirm the job belongs to this client.'))return;
    if(liqRead().jobs[id])return;
    const job={id:id,jobName:name||'Job #'+id,files:[],
        client:active.clientName,sessionKey:active.clientKey,sessionId:active.id,
        target:target.key,targetLabel:target.label,
        source:'manual recovery (original PDF filename unavailable)',
        priceCents:cents,status:'processed',manual:true,updatedAt:Date.now()};
    if(liqSaveJob(job,active)){liqLastNotice='';liqRender();}
    else window.alert('Recovery could not be saved. The active client may have changed.');
}
// Register with the outer Process-this-job safety guard.
spLiquidationStageJob=liqStageJob;
liqConnectControls();
window.addEventListener('sp:verifiedReturnAddressSaved',liqVerifiedReturnSaved);
window.addEventListener('storage',function(event){
    if(event.key&&(event.key.startsWith(LIQ_SESSION_PREFIX)||
                   event.key.startsWith(LIQ_JOB_PREFIX))){
        liqLastLiveSignature='';
        liqRender();
    }else if(event.key&&event.key.startsWith(LIQ_DRAFT_PREFIX)){
        liqLastLiveSignature='';
        liqRender();
    }
});
document.addEventListener('input',function(event){
    if(event.target&&event.target.closest&&
       event.target.closest('#settingsReturnAddress-Modal'))liqRenderLive();
},true);
document.addEventListener('change',function(event){
    if(event.target&&event.target.closest&&
       event.target.closest('#settingsReturnAddress-Modal'))liqRenderLive();
},true);
liqDetectNewClient();
liqMigrateTabJobs();
liqCaptureProcessed();
liqSyncDraft();
liqRenderLive();
setInterval(function(){
    liqSyncDraft();
    liqRenderLive();
},800);
setInterval(function(){
    liqDetectNewClient();
    liqCaptureProcessed();
    // Fallback for tabs that miss a storage event.
    const data=liqRead();
    const signature=data.sessionId+JSON.stringify(Object.values(data.jobs)
        .map(j=>[j.id,j.priceCents,j.target,j.status]).sort())+
        JSON.stringify(Object.values(data.drafts).map(d=>[
            d.id,d.quotedCents,d.target,d.files]).sort());
    if(signature!==liqLastView){liqLastView=signature;liqRender();}
},2200);

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

    if(
        e.target.tagName==="BUTTON" || 
        e.target.tagName==="INPUT"
    )
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
// MINIMIZE
///////////////////////////////

let savedHTML="";

function minimizeBox(){

    savedHTML =
        box.innerHTML;

    box.dataset.minimized="true";

    box.innerHTML=`
        <img
            src="https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/awts.png?ts=${Date.now()}"
            style="
                width:60px;
                height:60px;
                object-fit:contain;
                display:block;
                pointer-events:none;
                user-select:none;
            "
        >
    `;

    Object.assign(box.style,{
        width:"60px",
        height:"60px",
        padding:"0",
        borderRadius:"50%",
        background:"transparent",
        boxShadow:"none",
        right:"15px",
        top:"120px",
        left:"auto",
        display:"flex",
        alignItems:"center",
        justifyContent:"center",
        cursor:"pointer",
        overflow:"hidden"
    });

    box.onmousedown=null;

    box.onclick=function(){
        restoreBox();
    };

}

function restoreBox(){

    box.dataset.minimized="false";

    box.innerHTML =
        savedHTML;

    Object.assign(box.style,{
        width:"320px",
        height:"auto",
        padding:"25px",
        borderRadius:"12px",
        background:"rgb(242,179,46)",
        boxShadow:"0 0 15px rgba(0,0,0,.45)",
        top:"120px",
        right:"15px",
        left:"auto",
        display:"block",
        cursor:"move",
        overflow:"visible"
    });

    mascot.style.display = "block";

    box.onclick=null;

    box.querySelector(
        "#minimizeTotals"
    ).onclick=function(e){

        e.stopPropagation();

        minimizeBox();

    };

    reconnectLiquidation();

    enableDrag();

}

function reconnectLiquidation(){
    const panel=box.querySelector('#calculator');
    if(panel)panel.removeAttribute('data-liq-controls');
    liqConnectControls();
}

minimize.onclick=function(e){

    e.stopPropagation();

    minimizeBox();

};

document.body.appendChild(box);

// Liquidation is ready; no input needs focus.

})();

})();
