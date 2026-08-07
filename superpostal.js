// ==UserScript==
// @name         POSTAL TESTING GROUND
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

    let name = getJobName().toUpperCase();


    // EQUIFAX
    if (
        name.includes("EQU") ||
        name.includes("EQ")
    ){
        return "EQUIFAX";
    }


    // TRANSUNION
    if (
        name.includes("TU") ||
        name.includes("TRANSUNION")
    ){
        return "TRANSUNION";
    }


    // EXPERIAN
    if (
        name.includes("EXP") ||
        name.includes("EXPERIAN")
    ){
        return "EXPERIAN";
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
let experian = [];

Object.values(jobs).forEach(job=>{

if(job.bureau==="EQUIFAX")
    equifax.push(job);

if(job.bureau==="TRANSUNION")
    transunion.push(job);

if(job.bureau==="EXPERIAN")
    experian.push(job);

});

let equifaxTotal =
    equifax.reduce((a,b)=>a+b.price,0);

let transunionTotal =
    transunion.reduce((a,b)=>a+b.price,0);

let experianTotal =
    experian.reduce((a,b)=>a+b.price,0);


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

boxShadow:"0 0 15px rgba(0,0,0,.45)",

cursor:"move",

overflow:"visible"

});



box.innerHTML = `

<div style="
display:flex";
justify-content:flex-end;
">

<button id="minimizeTotals"
style="
border:none;
background:none;
font-size:25px;
font-weight:bold;
cursor:pointer;
">
x
</button>

</div>


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



// =============================
// MASCOT
// =============================

const mascot=document.createElement("img");


mascot.id="postalMascot";


mascot.src=
"https://media.discordapp.net/attachments/1504512479990911130/1535403918438441071/keltz2.png?ex=6a77a3d4&is=6a765254&hm=754db8c87c2b7b460e3b2e3ca82ed111e15f422dd191d97d79f2097df3675e86&=&format=webp&quality=lossless";


Object.assign(mascot.style,{
position:"absolute",
right:"320px",
top:"-40px",
size:"500px",
height:"400px",
pointerEvents:"none",
userSelect:"none",
zIndex:"0"
});



box.appendChild(mascot);




// =============================
// DRAG SYSTEM (ONLY WHEN EXPANDED)
// =============================

let dragging = false;
let offsetX = 0;
let offsetY = 0;


function enableDrag(){

    box.onmousedown = function(e){

        // disable drag when minimized
        if(box.dataset.minimized === "true")
            return;


        if(e.target.tagName === "BUTTON")
            return;


        dragging = true;


        offsetX = e.clientX - box.offsetLeft;
        offsetY = e.clientY - box.offsetTop;

    };


    document.onmousemove = function(e){

        if(!dragging)
            return;


        box.style.left =
        (e.clientX - offsetX) + "px";


        box.style.top =
        (e.clientY - offsetY) + "px";


        box.style.right="auto";

    };


    document.onmouseup=function(){

        dragging=false;

    };

}


// =============================
// MINIMIZE SYSTEM
// =============================

let fullState = null;


function minimizeBox(){

    fullState = {

        html: box.innerHTML,

        left: box.style.left,

        top: box.style.top,

        right: box.style.right

    };


    box.dataset.minimized="true";


    // MINIMIZED PNG
    box.innerHTML = `
        <img
            src="https://media.discordapp.net/attachments/1504512479990911130/1535406054077366282/bay-removebg-preview.png?ex=6a77a5d1&is=6a765451&hm=e6648fbb3ae0b462f6a73df81715794f4e0ee22c67c2fed5878517e31b510436&=&format=webp&quality=lossless&width=401&height=512"
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

        position:"fixed",

        right:"15px",

        top:"120px",

        left:"auto",

        display:"flex",

        alignItems:"center",

        justifyContent:"center",

        fontSize:"initial",

        cursor:"pointer",

        overflow:"hidden"


    });


    // REMOVE DRAG WHILE MINIMIZED
    box.onmousedown=null;


    // CLICK PNG TO RESTORE
    box.onclick=function(){

        restoreBox();

    };

}




function restoreBox(){


    box.dataset.minimized="false";


    box.innerHTML =
    fullState.html;



    Object.assign(box.style,{

        width:"320px",

        height:"auto",

        padding:"25px",

        borderRadius:"12px",

        display:"block",

        fontSize:"initial",

        overflow:"visible",

        cursor:"move",

        // RESET POSITION WHEN EXPANDING
        top:"120px",

        right:"15px",

        left:"auto"

    });



    box.onclick=null;



    const btn =
    box.querySelector("#minimizeTotals");


    if(btn){

        btn.onclick=function(e){

            e.stopPropagation();

            minimizeBox();

        };

    }


    enableDrag();

}




function attachMinimize(){

    const btn =
    box.querySelector("#minimizeTotals");


    if(!btn)
        return;



    btn.onclick=function(e){

        e.stopPropagation();

        minimizeBox();

    };


}



attachMinimize();

enableDrag();



document.body.appendChild(box);


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

    if(experian.length){

    content += list(
        "EXPERIAN",
        experian,
        experianTotal
    );
}

// SHOW MESSAGE IF NOTHING EXISTS YET
if(
    !equifax.length &&
    !transunion.length &&
    !experian.length
){

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
