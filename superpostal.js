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


// =============================
// CALCULATOR
// =============================

box.innerHTML = `

<div
    id="calculator"
    style="
        width:100%;
        position:relative;
        z-index:20;
    "
>

    <!-- TITLE -->
    <div style="
        font-size:20px;
        font-weight:800;
        text-align:center;
        margin-bottom:12px;
        letter-spacing:1px;
    ">
        TOTALOCITY
    </div>


    <!-- DISPLAY -->
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


    <!-- BUTTONS -->

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


// =============================
// BUTTON STYLE
// =============================

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


// =============================
// CROSS-TAB SYNC
// =============================

const STORAGE_KEY = "postalCalcValue";

// Save current display value to localStorage so other tabs can read it
function syncToStorage(){

    const display =
        box.querySelector("#calcDisplay");

    if(!display)
        return;

    localStorage.setItem(STORAGE_KEY, display.value);

}


// =============================
// CALCULATOR LOGIC
// =============================

const display =
box.querySelector("#calcDisplay");


// Load any existing value from another tab on startup
const existingValue =
localStorage.getItem(STORAGE_KEY);

if(existingValue !== null){
    display.value = existingValue;
}


// Listen for changes made in OTHER tabs and mirror them here
window.addEventListener("storage",function(e){

    if(e.key === STORAGE_KEY && e.newValue !== null){

        const liveDisplay =
            box.querySelector("#calcDisplay");

        if(liveDisplay){
            liveDisplay.value = e.newValue;
        }

    }

});


function calculate(){

    let expression =
        display.value.trim();

    if(!expression)
        return;


    try {

        // Only allow calculator characters
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


        display.value =
            String(
                Number(
                    result.toFixed(10)
                )
            );

        syncToStorage();

    }
    catch {

        display.value = "Error";

        setTimeout(()=>{
            display.value="";
            syncToStorage();
        },800);

    }

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


// =============================
// BUTTON EVENTS
// =============================

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


// =============================
// KEYBOARD INPUT
// =============================

display.addEventListener("keydown",function(e){

    // =============================
    // ALLOW NORMAL COPY / SELECT
    // =============================

    if(e.ctrlKey || e.metaKey){

        if(
            e.key.toLowerCase()==="a" ||
            e.key.toLowerCase()==="c" ||
            e.key.toLowerCase()==="x" ||
            e.key.toLowerCase()==="v"
        ){

            return;

        }

    }


    // =============================
    // ENTER = CALCULATE
    // =============================

    if(e.key==="Enter"){

        e.preventDefault();

        calculate();

        return;

    }


    // =============================
    // ESCAPE = CLEAR
    // =============================

    if(e.key==="Escape"){

        e.preventDefault();

        clearCalculator();

        return;

    }


    // =============================
    // NORMAL EDITING
    // =============================

    if(
        e.key==="Backspace" ||
        e.key==="Delete" ||
        e.key==="ArrowLeft" ||
        e.key==="ArrowRight" ||
        e.key==="Home" ||
        e.key==="End" ||
        e.key==="Tab"
    ){

        return;

    }


    // =============================
    // CALCULATOR CHARACTERS
    // =============================

    if(
        /^[0-9+\-*/().]$/.test(e.key)
    ){

        return;

    }


    // Block everything else
    e.preventDefault();

});


// =============================
// MASCOT
// =============================

const mascot =
document.createElement("img");

mascot.id="postalMascot";

mascot.src =
"https://media.discordapp.net/attachments/1504512479990911130/1535403918438441071/keltz2.png?ex=6a77a3d4&is=6a765254&hm=754db8c87c2b7b460e3b2e3ca82ed111e15f422dd191d97d79f2097df3675e86&=&format=webp&quality=lossless";

Object.assign(mascot.style,{
    position:"absolute",
    right:"222px",
    top:"-40px",
    width:"500px",
    height:"400px",
    objectFit:"contain",
    pointerEvents:"none",
    userSelect:"none",
    zIndex:"0"
});

box.appendChild(mascot);


// =============================
// MINIMIZE BUTTON
// =============================

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


// =============================
// DRAG
// =============================

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


// =============================
// MINIMIZE
// =============================

let savedHTML="";


function minimizeBox(){

    savedHTML =
        box.innerHTML;


    box.dataset.minimized="true";


    box.innerHTML=`

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


    box.onclick=null;


    // Reconnect minimize button
    box.querySelector(
        "#minimizeTotals"
    ).onclick=function(e){

        e.stopPropagation();

        minimizeBox();

    };


    // Reconnect calculator
    reconnectCalculator();


    enableDrag();

}


function reconnectCalculator(){

    const display =
        box.querySelector("#calcDisplay");

    if(!display)
        return;


    // Restore value from storage (in case another tab updated it
    // while this box was minimized)
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

                try {

                    if(
                        !/^[0-9+\-*/().\s]+$/
                            .test(display.value)
                    )
                        throw new Error();


                    const result =
                        Function(
                            '"use strict"; return (' +
                            display.value +
                            ')'
                        )();


                    display.value =
                        String(
                            Number(
                                result.toFixed(10)
                            )
                        );

                }
                catch {

                    display.value="Error";

                }

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

    // =============================
    // ALLOW COPY / SELECT / PASTE
    // =============================

    if(e.ctrlKey || e.metaKey){

        if(
            e.key.toLowerCase()==="a" ||
            e.key.toLowerCase()==="c" ||
            e.key.toLowerCase()==="x" ||
            e.key.toLowerCase()==="v"
        ){

            return;

        }

    }


    // =============================
    // ENTER
    // =============================

    if(e.key==="Enter"){

        e.preventDefault();

        const expression =
            display.value;

        try {

            if(
                !/^[0-9+\-*/().\s]+$/
                    .test(expression)
            )
                throw new Error();


            const result =
                Function(
                    '"use strict"; return (' +
                    expression +
                    ')'
                )();


            display.value =
                String(
                    Number(
                        result.toFixed(10)
                    )
                );

        }
        catch {

            display.value="Error";

        }

        syncToStorage();

        return;

    }


    // =============================
    // ESCAPE
    // =============================

    if(e.key==="Escape"){

        e.preventDefault();

        display.value="";

        syncToStorage();

        return;

    }


    // =============================
    // NORMAL TEXT EDITING
    // =============================

    if(
        e.key==="Backspace" ||
        e.key==="Delete" ||
        e.key==="ArrowLeft" ||
        e.key==="ArrowRight" ||
        e.key==="Home" ||
        e.key==="End" ||
        e.key==="Tab"
    ){

        return;

    }


    // =============================
    // CALCULATOR CHARACTERS
    // =============================

    if(
        /^[0-9+\-*/().]$/.test(e.key)
    ){

        return;

    }


    // Block everything else
    e.preventDefault();

};

}


// =============================
// MINIMIZE EVENT
// =============================

minimize.onclick=function(e){

    e.stopPropagation();

    minimizeBox();

};


// =============================
// ADD TO PAGE
// =============================

document.body.appendChild(box);


// Focus calculator
setTimeout(()=>{

    const display =
        box.querySelector("#calcDisplay");

    if(display)
        display.focus();

},100);



})();


})(); // END MAIN SCRIPT
