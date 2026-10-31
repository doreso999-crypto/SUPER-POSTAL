# Process This Job – horror clip

The userscript now uses the selected Vlipsy clip:

**[Jump Scare – Creepy Face](https://vlipsy.com/clips/3hEsFXt9)** (approximately 3 seconds, with sound).

## Playback

After the original four readiness checks pass, **Process this job** opens a full-screen video and attempts to play the clip with audio at 60% volume. When the video ends, processing resumes through the **original Postalocity button**.

- **Skip and process** immediately continues with the original action.
- **Cancel** or **Escape** closes the preview and leaves the job unprocessed.
- Before continuing, the script checks that the job is still complete.
- If direct MP4 playback fails, it attempts Vlipsy's official embedded-player format and retains a link to the exact clip. Because the embedded player is cross-origin, this fallback continues after eight seconds.
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
