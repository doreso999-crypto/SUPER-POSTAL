# Process This Job – horror clip

The userscript now uses the selected Vlipsy clip:

**[Jump Scare – Creepy Face](https://vlipsy.com/clips/3hEsFXt9)** (approximately 3 seconds, with sound).

## Playback

After the original four readiness checks pass, **Process this job** opens the clip as an immersive **full-viewport video** and requests the browser's native **fullscreen** mode. The clip is scaled to cover the entire display, with audio at 60% volume. When it ends, the original Postalocity processing action runs automatically.

- There are **no visible Skip, Cancel or playback controls** supplied by the userscript, so the scare plays without an advance warning.
- **Escape** remains an unobtrusive emergency exit. Closing native fullscreen also cancels the pending processing action rather than unexpectedly submitting it.
- Before processing, the script rechecks that the job is still complete. Incomplete jobs never trigger the clip.
- If native fullscreen is denied, a fixed video surface still covers the full webpage.
- If direct MP4 playback fails, the script attempts Vlipsy's borderless embedded player instead. Third-party player controls cannot be hidden by the userscript; that fallback advances after eight seconds.
- A stalled direct video cannot delay processing indefinitely (ten-second safeguard).

## Configuration

`superpostal.js` contains `SP_PROCESS_SCARE_MEDIA`:

```js
const SP_PROCESS_SCARE_MEDIA={
    video:'https://media.vlipsy.com/vlips/3hEsFXt9/480p.mp4',
    page:'https://vlipsy.com/clips/3hEsFXt9',
    embed:'https://vlipsy.com/embed/3hEsFXt9',
    gif:'',
    audio:'',
    fallbackMs:1900
};
```

The MP4 address follows Vlipsy's published media URL format. **Actual playback of this specific media address and embedded player has not been independently verified in a live browser.** Some browser policies, blockers or host changes may prevent autoplay with sound. The script neither downloads nor republishes the video.

For a different clip, a direct MP4/WebM can replace `video`; or use a GIF link and a separate audio link (`gif` and `audio`) with `video` empty. GIFs alone cannot produce sound.

The script retains the existing readiness checks, job accounting, approval, Copy, Clear and client-session behavior.
