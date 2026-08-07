// ==UserScript==
// @name         SUPER POSTAL
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Return Address parser + Job name from uploaded PDF
// @match        https://prod.postalocity.com/jobui*
// @grant        none
// ==/UserScript==


(function () {
'use strict';


///////////////////////////////
// RETURN ADDRESS PARSER
///////////////////////////////

function addParser() {

    const form = document.querySelector('#envelopeReturn-address');

    if (!form) return;

    if (document.querySelector('#returnAddressParser')) return;


    const box = document.createElement('div');

    box.id = "returnAddressParser";

    box.innerHTML = `
        <label class="label label-default">
            Paste Full Address
        </label>

        <textarea
            id="returnAddressPaste"
            class="form-control"
            rows="4"
            placeholder="Paste address here"></textarea>

        <button
            type="button"
            id="parseReturnBtn"
            class="btn btn-primary btn-sm btn-block"
            style="margin-top:5px;">
            PARSE ADDRESS<br>
            DOUBLE CHECK ADDRESS! DOUBLE CHECK ADDRESS! DOUBLE CHECK ADDRESS! DOUBLE CHECK ADDRESS!
        </button>

        <hr>
    `;


    form.parentNode.insertBefore(box, form);


    document.querySelector('#parseReturnBtn')
        .onclick = parseAddress;

}



function parseAddress() {

    const raw = document.querySelector('#returnAddressPaste').value.trim();

    if (!raw) return;


    const lines = raw
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);


    let name = lines[0] || "";
    let address1 = "";
    let city = "";
    let state = "";
    let zip = "";


    for (let i = 0; i < lines.length; i++) {

        const match = lines[i].match(
            /^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/
        );


        if (match) {

            city = match[1];
            state = match[2];
            zip = match[3];

            address1 = lines[i - 1] || "";

            break;
        }
    }


    setField("name", name);
    setField("address1", address1);
    setField("city", city);
    setField("state", state);
    setField("zip", zip);

}



function setField(name, value) {

    const field = document.querySelector(
        `#envelopeReturn-address input[name="${name}"]`
    );

    if (field) {

        field.value = value;

        field.dispatchEvent(
            new Event('change', { bubbles:true })
        );

    }

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



///////////////////////////////
// WATCH PAGE CHANGES
///////////////////////////////

const observer = new MutationObserver(() => {

    addParser();

    watchUploadedFiles();

});


observer.observe(document.body, {
    childList:true,
    subtree:true
});



// Initial run
addParser();
watchUploadedFiles();

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



    // EQU / EQ
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



    // TU
    if (name.includes("TU")) {


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
// MULTI TAB BUREAU TRACKER v2
///////////////////////////////
(function(){

const tabID =
window.location.href.match(/id=(\d+)/)?.[1];

if(!tabID) return;


const STORAGE = "postalocityJobs";



function loadJobs(){

    return JSON.parse(
        localStorage.getItem(STORAGE) || "{}"
    );

}



function saveJobs(data){

    localStorage.setItem(
        STORAGE,
        JSON.stringify(data)
    );

}



function getJobName(){

    return (
        document.querySelector('#jobName')?.innerText ||
        document.querySelector('#overview-jobName')?.value ||
        "Unknown"
    ).trim();

}



function getBureau(){

    let name =
    getJobName().toUpperCase();


    if(
        name.includes("EQU") ||
        name.includes("EQ")
    ){
        return "EQUIFAX";
    }


    if(name.includes("TU")){
        return "TRANSUNION";
    }


    return null;

}



function getPrice(){

    let text =
    document.querySelector('.totalPrice')
    ?.innerText || "$0";


    return Number(
        text.replace(/[^0-9.]/g,"")
    ) || 0;

}




function registerJob(){

let jobs = loadJobs();



jobs[tabID] = {

    id: tabID,
    name:getJobName(),
    bureau:getBureau(),
    price:getPrice(),
    updated:Date.now()

};

saveJobs(jobs);

}




function showTotals(){

let jobs = loadJobs();



saveJobs(jobs);



let equifax = [];
let transunion = [];

Object.values(jobs).forEach(job=>{

    if(job.bureau==="EQUIFAX")
        equifax.push(job);

    if(job.bureau==="TRANSUNION")
        transunion.push(job);

});

let equifaxTotal =
    equifax.reduce((a,b)=>a+b.price,0);

let transunionTotal =
    transunion.reduce((a,b)=>a+b.price,0);


let box = document.querySelector("#bureauTotals");


if(!box){

    box = document.createElement("div");

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
        boxShadow:"0 0 15px rgba(0,0,0,.45)"

    });


box.innerHTML = `



<div id="bureauContent"></div>


<button id="clearTotalsBtn"
style="
    margin-top:20px;
    width:100%;
    background:#d9534f;
    color:white;
    border:none;
    border-radius:6px;
    padding:10px;
    cursor:pointer;
    font-weight:bold;
">
    CLEAR
</button>

`;

    function addMascot(id, src, position){

    const img = document.createElement("img");

    img.id = id;

    img.src = src;


    Object.assign(img.style,{

        position:"fixed",

        right:position.right,
        top:position.top,

        width:position.width || "170px",

        height:"auto",

        opacity:"1",

        pointerEvents:"none",

        userSelect:"none",
        transform:"rotate(-5deg)",


        zIndex:"999998"

    });


    document.body.appendChild(img);

}
    addMascot(
    "postalMascot1",
    "https://media.discordapp.net/attachments/1504512479990911130/1535356495917621318/keltz2.png?ex=6a7777aa&is=6a76262a&hm=1bc9b3376404145bd760a4d86a2930e0865deb65ce53db6c970cacd749ea2f18&=&format=webp&quality=lossless",
    {

    position:"fixed",

    right:"270px",

    top:"60px",

    width:"170px",

    height:"auto",

    opacity:"100",

    pointerEvents:"none",

    userSelect:"none",

    zIndex:"999998",
    }
);


    document.body.appendChild(box);


document.querySelector("#clearTotalsBtn").onclick = ()=>{

    const confirmClear = confirm(
        "WARNING!\n\nThis will remove ALL saved job totals and cannot be retrieved.\n\nAre you sure?"
    );


    if(!confirmClear){
        return;
    }


    localStorage.removeItem(STORAGE);


    const jobName = document.querySelector("#overview-jobName");

    if(jobName){

        jobName.value = "";

        jobName.dispatchEvent(
            new Event("input",{bubbles:true})
        );

        jobName.dispatchEvent(
            new Event("change",{bubbles:true})
        );

    }


    showTotals();

};

}




function list(title,data,total){

    let html = `

    <div style="
        font-size:15px;
        font-weight:bold;
        margin-top:10px;
        margin-bottom:5px;
    ">
        ${title}
    </div>

    `;



    data.forEach(j=>{

        html += `

        <div style="
            display:flex;
            justify-content:space-between;
            padding:2px 0;
        ">

            <span>${j.name}</span>

            <span>$${j.price.toFixed(2)}</span>

        </div>

        `;

    });



    html += `

    <div style="
        margin-top:6px;
        font-weight:bold;
        color:#hsv(24°, 0%, 0%);
        display:flex;
        justify-content:space-between;
    ">

        <span>TOTAL</span>

        <span>$${total.toFixed(2)}</span>

    </div>

    `;


    return html;

}





let content = `

<div style="
    text-align:center;
    padding-bottom:10px;
    margin-bottom:10px;
    border-bottom:1px solid rgba(255,255,255,.4);
">

    <div style="
        font-family:'Montserrat', sans-serif;
        font-size:24px;
        font-weight:800;
        letter-spacing:1px;
    ">
    </div>


    <span style="
        font-family:'Montserrat', sans-serif;
        font-size:24px;
        font-weight:800;
        letter-spacing:1px;
    ">
        TOTALOCITY
    </span>

</div>

`;


if(equifax.length){

    content += list(
        "EQUIFAX",
        equifax,
        equifaxTotal
    );

}



if(transunion.length){

    content += list(
        "TRANSUNION",
        transunion,
        transunionTotal
    );

}

// SHOW MESSAGE IF NOTHING EXISTS YET
if(!equifax.length && !transunion.length){

    content += `

    <div style="
        text-align:center;
        margin-top:20px;
        margin-bottom:20px;
        font-size:25px;
    ">
        Hi! I'm Postal-Man <br>
        I will help you total your expenses :)
    </div>

    `;

}



content += `

<div style="
    margin-top:15px;
    padding-top:10px;
    border-top:1px solid rgba(255,255,255,.4);
    font-size:14px;
">

    • Double check totals before submission.<br>
    • Clear previous data before starting a new postal..<br>
</div>

`;



const contentBox =
    document.querySelector("#bureauContent");


contentBox.innerHTML = content;



Object.assign(contentBox.style,{

    position:"relative",

    zIndex:"99"

});


}





// FAST UPDATE
setInterval(()=>{

    registerJob();

    showTotals();

},1000);



// FAST UPDATE
setInterval(()=>{

    registerJob();
    showTotals();

},1000);


// update instantly when another tab writes
window.addEventListener("storage", (e)=>{

    if(e.key === STORAGE){

        showTotals();

    }

});


// initial load
registerJob();
showTotals();


})(); // END MULTI TAB TRACKER


})(); // END MAIN SCRIPT
