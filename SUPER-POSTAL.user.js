// ==UserScript==
// @name         SUPER POSTAL
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  SUPER POSTAL Loader
// @match        https://prod.postalocity.com/*
// @grant        none
// ==/UserScript==

(async function () {
    "use strict";

    const SCRIPT_URL =
        "https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/superpostal.js";

    const response = await fetch(
        SCRIPT_URL + "?ts=" + Date.now(),
        { cache: "no-store" }
    );

    if (!response.ok) {
        console.error(
            "SUPER POSTAL failed to load:",
            response.status
        );
        return;
    }

    const code = await response.text();

    eval(code);
})();
