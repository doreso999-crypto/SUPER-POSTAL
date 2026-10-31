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


// Keep TOTALOCITY and its mascot above Postalocity's backdrop when this
// specific Return Address modal opens. Leave their coordinates and behavior alone.
function spKeepCalculatorVisibleForReturnModal(modal){
    if(!modal)return;
    if(!document.querySelector('#spReturnModalStackStyles')){
        const style=document.createElement('style');
        style.id='spReturnModalStackStyles';
        style.textContent='body.sp-return-address-open #bureauTotals{z-index:2147483000!important;visibility:visible!important;opacity:1!important}';
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

function addParser(){
    const form=document.querySelector('#envelopeReturn-address');
    if(!form)return;
    const existing=document.querySelector('#returnAddressParser');
    if(existing){spSizeReturnAddressDialog(form,existing);spKeepCalculatorVisibleForReturnModal(form.closest('#settingsReturnAddress-Modal'));return;}
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
      '<button type="button" id="spClearPasteBtn">Clear paste</button>',
      '<button type="button" id="spClearAllReturnBtn">Clear all fields</button></div>',
      '<div id="spParserStatus" role="status" aria-live="polite" hidden></div>',
      '<div id="spParserPreview" aria-label="Parsed address preview" hidden></div>',
      '<p class="sp-hint">Review Postalocity fields before submitting. Ctrl+Enter to parse.</p>'
    ].join('');
    form.parentNode.insertBefore(box,form);
    spSizeReturnAddressDialog(form,box);
    spKeepCalculatorVisibleForReturnModal(form.closest('#settingsReturnAddress-Modal'));
    const paste=box.querySelector('#returnAddressPaste');
    box.querySelector('#parseReturnBtn').addEventListener('click',parseAddress);
    box.querySelector('#spClearAllReturnBtn').addEventListener('click',spClearEveryReturnAddressField);
    box.querySelector('#spClearPasteBtn').addEventListener('click',function(){
        paste.value='';box.querySelector('#spParserStatus').hidden=true;
        box.querySelector('#spParserPreview').hidden=true;paste.focus();
    });
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
function spPdfNamesFromPage(){
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
    const modalFiles=document.querySelector('#modalFileList');
    if(modalFiles){
        modalFiles.querySelectorAll('a').forEach(function(el){collect(el.textContent);});
    }
    return found;
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

function spRefreshRecipientPdfOverview(){
    const panel=document.querySelector('#spRecipientPdfOverview');
    if(!panel)return;
    const recipientNames=spRecipientNamesFromPage();
    const pdfNames=spPdfNamesFromPage();
    const countElement=document.querySelector('#step3 .contactListSize');
    const count=countElement?Number.parseInt(countElement.textContent,10):0;
    const countLabel=Number.isFinite(count)&&count>0?count:recipientNames.length;
    const recipientKey=JSON.stringify([countLabel,recipientNames]);
    const fileKey=JSON.stringify(pdfNames);
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
        spQueueRecipientOverview();
        return;
    }
    if(!document.querySelector('#spRecipientPdfStyles')){
        const styles=document.createElement('style');
        styles.id='spRecipientPdfStyles';
        styles.textContent=[
            '#step3 #spRecipientPdfOverview{width:100%;max-width:100%;margin:14px 0 12px;padding:13px 14px;border:1px solid #d9e3ee;border-radius:10px;background:#fff;box-sizing:border-box;font:13px Arial,sans-serif;color:#25374f}',
            '#step3 #spRecipientPdfOverview *{box-sizing:border-box}',
            '#step3 #spRecipientPdfOverview .sp-overview-header{display:flex;gap:10px;justify-content:space-between;align-items:center;margin-bottom:10px}',
            '#step3 #spRecipientPdfOverview .sp-overview-header strong{font-size:14px}',
            '#step3 #spRecipientPdfOverview .sp-overview-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}',
            '#step3 #spRecipientPdfOverview .sp-overview-col{min-width:0;border:1px solid #e6edf5;border-radius:8px;background:#fafcfe;padding:10px}',
            '#step3 #spRecipientPdfOverview .sp-overview-col-title{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:7px;font-weight:700;font-size:12px}',
            '#step3 #spRecipientPdfOverview .sp-count{color:#536c8a;font-size:11px;font-weight:500}',
            '#step3 #spRecipientPdfOverview ul{list-style:none;padding:0;margin:0;max-height:230px;overflow-y:auto}',
            '#step3 #spRecipientPdfOverview li{display:flex;gap:8px;align-items:baseline;border-bottom:1px solid #e8eef6;padding:7px 3px;font-size:12px;line-height:1.45;overflow-wrap:anywhere;word-break:break-word;white-space:normal}',
            '#step3 #spRecipientPdfOverview li:last-child{border-bottom:0}',
            '#step3 #spRecipientPdfOverview .sp-list-number{color:#7488a3;font-size:10px;flex-shrink:0;min-width:20px}',
            '#step3 #spRecipientPdfOverview .sp-empty{color:#748399;font-style:italic}',
            '#step3 #spRecipientPdfOverview button{font-size:11px;padding:5px 9px;border:1px solid #b8cee9;border-radius:6px;background:#eff5ff;color:#26558b;cursor:pointer}',
            '#step3 #spRecipientPdfOverview button:focus-visible{outline:2px solid #4388e1;outline-offset:2px}',
            '@media(max-width:520px){#step3 #spRecipientPdfOverview .sp-overview-grid{grid-template-columns:1fr}}'
        ].join('\n');
        document.head.appendChild(styles);
    }
    const card=document.createElement('section');
    card.id='spRecipientPdfOverview';
    card.setAttribute('aria-label','Recipient names and uploaded files');
    card.innerHTML=[
      '<div class="sp-overview-header"><strong>Recipients &amp; PDFs</strong>',
      '<button type="button" id="spOverviewOpenRecipients">Open recipient list</button></div>',
      '<div class="sp-overview-grid">',
      '<section class="sp-overview-col"><div class="sp-overview-col-title">',
      '<span>Recipient names</span><span class="sp-count" id="spOverviewRecipientCount"></span></div>',
      '<ul id="spOverviewRecipientNames" aria-label="Full recipient names"></ul></section>',
      '<section class="sp-overview-col"><div class="sp-overview-col-title">',
      '<span>Uploaded PDF filenames</span><span class="sp-count" id="spOverviewPdfCount"></span></div>',
      '<ul id="spOverviewPdfNames" aria-label="Uploaded PDF filenames"></ul></section>',
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

///////////////////////////////
// AUTO POPULATE RECIPIENT BASED ON JOB NAME
///////////////////////////////

function fillRecipient(field, value) {

    const input = document.querySelector(field);

    if (input) {

        input.value = value;

        input.dispatchEvent(
            new Event('change', { bubbles:true })
        );

    }

}

function populateRecipientFromJob() {

    const jobName = document.querySelector('#overview-jobName');

    if (!jobName) return;

    const name = jobName.value.toUpperCase();

    // =============================
    // EQUIFAX
    // =============================

    if (name.includes("EQU") || name.includes("EQ")) {

        fillRecipient(
            '#address-name',
            'Equifax Information Services LLC'
        );

        fillRecipient(
            '#address-addr1',
            'P.O. Box 740256'
        );

        fillRecipient(
            '#address-city',
            'Atlanta'
        );

        fillRecipient(
            '#address-state',
            'GA'
        );

        fillRecipient(
            '#address-zip',
            '30374-0256'
        );

        console.log("Equifax address loaded");
    }

    // =============================
    // TRANSUNION
    // =============================

    else if (name.includes("TU")) {

        fillRecipient(
            '#address-name',
            'TransUnion LLC Consumer Dispute Center'
        );

        fillRecipient(
            '#address-addr1',
            'PO Box 2000'
        );

        fillRecipient(
            '#address-city',
            'Chester'
        );

        fillRecipient(
            '#address-state',
            'PA'
        );

        fillRecipient(
            '#address-zip',
            '19016'
        );

        console.log("TransUnion address loaded");
    }

    // =============================
    // EXPERIAN
    // =============================

    else if (
        name.includes("EXP") ||
        name.includes("EXPERIAN")
    ) {

        fillRecipient(
            '#address-name',
            'Experian'
        );

        fillRecipient(
            '#address-addr1',
            'P.O. Box 2002'
        );

        fillRecipient(
            '#address-city',
            'Allen'
        );

        fillRecipient(
            '#address-state',
            'TX'
        );

        fillRecipient(
            '#address-zip',
            '75013'
        );

        console.log("Experian address loaded");
    }

}

function watchJobName() {

    const job = document.querySelector('#overview-jobName');

    if (!job) return;

    if (job.dataset.recipientWatcher) return;
    job.dataset.recipientWatcher = "true";

    job.addEventListener('blur', populateRecipientFromJob);
    job.addEventListener('change', populateRecipientFromJob);
    job.addEventListener('input', populateRecipientFromJob);

}

const recipientObserver = new MutationObserver(() => {
    watchJobName();
});

recipientObserver.observe(document.body, {
    childList:true,
    subtree:true
});

watchJobName();

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

<div
    id="calculator"
    style="
        width:100%;
        position:relative;
        z-index:10;
    "
>

    <div style="
        font-size:20px;
        font-weight:800;
        text-align:center;
        margin-bottom:12px;
        letter-spacing:1px;
    ">
        TOTALOCITY
    </div>

    <input
        id="calcDisplay"
        type="text"
        value=""
        placeholder="0"
        autocomplete="off"
        spellcheck="false"
        style="
            width:100%;
            height:55px;
            box-sizing:border-box;
            border:none;
            border-radius:8px;
            background:#222;
            color:white;
            font-size:27px;
            font-weight:bold;
            text-align:right;
            padding:8px 12px;
            outline:none;
            margin-bottom:12px;
        "
    >

    <div
        id="calcButtons"
        style="
            display:grid;
            grid-template-columns:repeat(4,1fr);
            gap:7px;
        "
    >

        <button data-action="clear">AC</button>
        <button data-action="backspace">⌫</button>
        <button data-value="/">÷</button>
        <button data-value="*">×</button>

        <button data-value="7">7</button>
        <button data-value="8">8</button>
        <button data-value="9">9</button>
        <button data-value="-">−</button>

        <button data-value="4">4</button>
        <button data-value="5">5</button>
        <button data-value="6">6</button>
        <button data-value="+">+</button>

        <button data-value="1">1</button>
        <button data-value="2">2</button>
        <button data-value="3">3</button>
        <button
            data-action="equals"
            style="
                grid-row:span 2;
                background:#111;
                color:white;
            "
        >=</button>

        <button
            data-value="0"
            style="grid-column:span 2;"
        >
            0
        </button>

        <button data-value=".">.</button>

    </div>

</div>

`;

const buttons =
box.querySelectorAll("#calcButtons button");

buttons.forEach(button => {

    Object.assign(button.style,{
        height:"48px",
        border:"none",
        borderRadius:"8px",
        background:"#f5f5f5",
        color:"#111",
        fontSize:"20px",
        fontWeight:"700",
        cursor:"pointer",
        boxShadow:"0 2px 4px rgba(0,0,0,.25)",
        transition:"transform .05s"
    });

    button.addEventListener("mousedown",()=>{
        button.style.transform="scale(.94)";
    });

    button.addEventListener("mouseup",()=>{
        button.style.transform="scale(1)";
    });

    button.addEventListener("mouseleave",()=>{
        button.style.transform="scale(1)";
    });

});

const STORAGE_KEY = "postalCalcValue";

function syncToStorage(){

    const display =
        box.querySelector("#calcDisplay");

    if(!display)
        return;

    localStorage.setItem(STORAGE_KEY, display.value);

}

const display =
box.querySelector("#calcDisplay");

const existingValue =
localStorage.getItem(STORAGE_KEY);

if(existingValue !== null){
    display.value = existingValue;
}

window.addEventListener("storage",function(e){

    if(e.key === STORAGE_KEY && e.newValue !== null){

        const liveDisplay =
            box.querySelector("#calcDisplay");

        if(liveDisplay){
            liveDisplay.value = e.newValue;
        }

    }

});

function calculateDisplay(targetDisplay){

    const expression =
        targetDisplay.value.trim();

    if(!expression)
        return;

    try {

        if(!/^[0-9+\-*/().\s]+$/.test(expression))
            throw new Error();

        const result =
            Function(
                '"use strict"; return (' +
                expression +
                ')'
            )();

        if(
            typeof result !== "number" ||
            !Number.isFinite(result)
        ){
            throw new Error();
        }

        targetDisplay.value =
            String(
                Number(
                    result.toFixed(10)
                )
            );

        syncToStorage();

    }
    catch {

        targetDisplay.value = "Error";

        syncToStorage();

        setTimeout(()=>{

            if(targetDisplay.value === "Error"){
                targetDisplay.value = "";
                syncToStorage();
            }

        },800);

    }

}

function calculate(){
    calculateDisplay(display);
}

function clearCalculator(){

    display.value="";

    display.focus();

    syncToStorage();

}

function backspace(){

    display.value =
        display.value.slice(0,-1);

    display.focus();

    syncToStorage();

}

function addValue(value){

    if(display.value==="Error")
        display.value="";

    display.value += value;

    display.focus();

    syncToStorage();

}

box.querySelectorAll(
    "#calcButtons button"
).forEach(button => {

    button.addEventListener("click",function(e){

        e.stopPropagation();

        const value =
            this.dataset.value;

        const action =
            this.dataset.action;

        if(action==="clear"){
            clearCalculator();
            return;
        }

        if(action==="backspace"){
            backspace();
            return;
        }

        if(action==="equals"){
            calculate();
            return;
        }

        if(value){
            addValue(value);
        }

    });

});

function handleCalculatorKeydown(e, actions){

    if(e.ctrlKey || e.metaKey){

        if(
            e.key.toLowerCase()==="a" ||
            e.key.toLowerCase()==="c" ||
            e.key.toLowerCase()==="x" ||
            e.key.toLowerCase()==="v"
        ){

            e.stopPropagation();

            return;

        }

    }

    const numpadValues = {
        Numpad0:"0",
        Numpad1:"1",
        Numpad2:"2",
        Numpad3:"3",
        Numpad4:"4",
        Numpad5:"5",
        Numpad6:"6",
        Numpad7:"7",
        Numpad8:"8",
        Numpad9:"9",
        NumpadDecimal:".",
        NumpadAdd:"+",
        NumpadSubtract:"-",
        NumpadMultiply:"*",
        NumpadDivide:"/"
    };

    const numpadValue =
        numpadValues[e.code];

    if(numpadValue !== undefined){

        e.preventDefault();
        e.stopPropagation();

        actions.addValue(numpadValue);

        return;

    }

    if(e.key==="Enter" || e.code==="NumpadEnter"){

        e.preventDefault();
        e.stopPropagation();

        actions.calculate();

        return;

    }

    if(e.key==="Escape"){

        e.preventDefault();
        e.stopPropagation();

        actions.clear();

        return;

    }

    if(
        e.key==="Backspace" ||
        e.key==="Delete" ||
        e.key==="ArrowLeft" ||
        e.key==="ArrowRight" ||
        e.key==="Home" ||
        e.key==="End" ||
        e.key==="Tab"
    ){

        e.stopPropagation();

        return;

    }

    if(
        /^[0-9+\-*/().]$/.test(e.key)
    ){

        e.stopPropagation();

        return;

    }

    e.preventDefault();
    e.stopPropagation();

}

display.addEventListener("keydown",function(e){

    handleCalculatorKeydown(e,{

        addValue,
        calculate,
        clear: clearCalculator

    });

});

display.addEventListener("input",syncToStorage);

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

    reconnectCalculator();

    enableDrag();

}

function reconnectCalculator(){

    const display =
        box.querySelector("#calcDisplay");

    if(!display)
        return;

    const existingValue =
        localStorage.getItem(STORAGE_KEY);

    if(existingValue !== null){
        display.value = existingValue;
    }

    box.querySelectorAll(
        "#calcButtons button"
    ).forEach(button => {

        button.onclick=function(e){

            e.stopPropagation();

            const value =
                this.dataset.value;

            const action =
                this.dataset.action;

            if(action==="clear"){
                display.value="";
            }

            else if(action==="backspace"){
                display.value =
                    display.value.slice(0,-1);
            }

            else if(action==="equals"){

                calculateDisplay(display);

            }

            else if(value){

                if(display.value==="Error")
                    display.value="";

                display.value += value;

            }

            display.focus();

            syncToStorage();

        };

    });

display.onkeydown=function(e){

    handleCalculatorKeydown(e,{

        addValue:function(value){

            if(display.value==="Error")
                display.value="";

            display.value += value;
            display.focus();
            syncToStorage();

        },

        calculate:function(){
            calculateDisplay(display);
            display.focus();
        },

        clear:function(){

            display.value="";
            display.focus();
            syncToStorage();

        }

    });

};

display.oninput = syncToStorage;

}

minimize.onclick=function(e){

    e.stopPropagation();

    minimizeBox();

};

document.body.appendChild(box);

setTimeout(()=>{

    const display =
        box.querySelector("#calcDisplay");

    if(display)
        display.focus();

},100);

})();

})();
