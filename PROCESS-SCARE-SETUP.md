# Process this job – scheduled jump-scare clips

The userscript uses one of two Vlipsy clips depending on **the local day of the week on the computer running Postalocity**.

| Local day | Eligible clip | Probability per eligible Process this job attempt |
| --- | --- | --- |
| Wednesday | [6H9KSXHl](https://vlipsy.com/clips/6H9KSXHl) | 10% |
| Sunday, Monday, Tuesday, Thursday, Friday, Saturday | [wFNnuAf8](https://vlipsy.com/clips/wFNnuAf8) | 10% |

- The Wednesday clip has a **0% chance on other days**.
- The other-days clip has a **0% chance on Wednesday**.
- Each eligible processing attempt draws once: a scare occurs when `Math.random() < 0.10`. The 90% non-triggering attempts show nothing.
- A click followed by the same form's submit event counts as **one attempt**, not two.
- No scare is offered when the job readiness guard fails.

## Playback and processing

When triggered, the selected clip appears over the page in a full-viewport video with sound set to 60%. The browser's native fullscreen mode is requested where allowed. Pressing **Escape** dismisses the overlay; exiting fullscreen also dismisses it.

The native **Process this job** action is not prevented, delayed, or synthetically replayed by the scare. The userscript keeps Postalocity's own job-processing behavior intact. As a consequence, if Postalocity navigates away immediately, the clip may be interrupted. This is intentional: avoiding duplicate or stalled job submissions takes priority over finishing the clip.

The direct MP4 URLs follow Vlipsy's published media URL pattern. If playback fails, the script attempts the selected clip's Vlipsy iframe player and uses a bounded timeout. Media playback has not been independently verified for either specific clip in a live Postalocity browser session; browser autoplay policies or host changes can affect audio and video.

## Configuration

`superpostal.js` declares `SP_PROCESS_SCARE_MEDIA` with two entries and chooses between them using `spScareMediaForToday()`:

```js
const SP_PROCESS_SCARE_MEDIA={
    wednesday:{
        video:'https://media.vlipsy.com/vlips/6H9KSXHl/480p.mp4',
        page:'https://vlipsy.com/clips/6H9KSXHl',
        embed:'https://vlipsy.com/embed/6H9KSXHl',
        gif:'', audio:'', fallbackMs:1900
    },
    otherDays:{
        video:'https://media.vlipsy.com/vlips/wFNnuAf8/480p.mp4',
        page:'https://vlipsy.com/clips/wFNnuAf8',
        embed:'https://vlipsy.com/embed/wFNnuAf8',
        gif:'', audio:'', fallbackMs:1900
    }
};
function spScareMediaForToday(date=new Date()){
    return date.getDay()===3?SP_PROCESS_SCARE_MEDIA.wednesday:SP_PROCESS_SCARE_MEDIA.otherDays;
}
const SP_PROCESS_SCARE_CHANCE=0.10;
```

The main loader (`SUPER-POSTAL.user.js`) requests the current `main` branch on each page load with a cache-busting timestamp. Reload the Postalocity page to load updated code.

The existing return address, recipient/PDF/job-name readiness checks, job accounting, approval controls, and Copy/Clear behaviors are outside this change. The scheduling regression test is `tests/process-scare.cjs` (run with `node tests/process-scare.cjs` from the repository root).
