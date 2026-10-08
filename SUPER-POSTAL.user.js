// ==UserScript==
// @name         SUPER POSTAL
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  SUPER POSTAL Loader
// @match        https://prod.postalocity.com/*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// ==/UserScript==

(function () {
    "use strict";

    const SCRIPT_URL =
        "https://raw.githubusercontent.com/doreso999-crypto/SUPER-POSTAL/main/superpostal.js";

    GM_xmlhttpRequest({
        method: "GET",
        url: SCRIPT_URL + "?ts=" + Date.now(),
        onload: function (response) {

            if (
                response.status < 200 ||
                response.status >= 300
            ) {
                console.error(
                    "SUPER POSTAL failed to load:",
                    response.status
                );
                return;
            }

            try {
                const runScript =
                    new Function(response.responseText);

                runScript();
            }
            catch (error) {
                console.error(
                    "SUPER POSTAL script error:",
                    error
                );
            }
        },

        onerror: function (error) {
            console.error(
                "SUPER POSTAL network error:",
                error
            );
        }
    });

})();
