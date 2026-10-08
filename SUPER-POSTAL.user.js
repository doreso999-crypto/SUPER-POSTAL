// ==UserScript==
// @name         SUPER POSTAL
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  SUPER POSTAL Loader
// @match        https://prod.postalocity.com/*
// @grant        GM_addElement
// ==/UserScript==

(function () {
    "use strict";

    const SCRIPT_URL =
        "https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/superpostal.js";

    const script = GM_addElement("script", {
        src: SCRIPT_URL + "?ts=" + Date.now(),
        type: "text/javascript"
    });

    script.onload = function () {
        console.log("SUPER POSTAL loaded");
    };

    script.onerror = function () {
        console.error("SUPER POSTAL failed to load");
    };

})();
