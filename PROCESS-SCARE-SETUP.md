# Process This Job – horror preview

The userscript intercepts **Process this job** after its four original readiness checks pass. It plays a short scare before replaying the **same native button click once**. It does not call Postalocity processing APIs.

## Add your preferred clip

Open `superpostal.js` and find `SP_PROCESS_SCARE_MEDIA`:

```js
const SP_PROCESS_SCARE_MEDIA={
    video:'',  // URL to a video file, such as MP4/WebM, with the scream audio
    gif:'',    // Optional GIF URL
    audio:'',  // Optional audio URL (MP3/WAV) used with GIF
    fallbackMs:1900
};
```

- **Recommended:** Provide a direct HTTPS URL to your chosen MP4/WebM in `video`. It can include the picture and scream in the same file. The preview resumes processing when video ends, with a maximum 10-second safeguard.
- **Alternatively:** Provide both `gif` and `audio` direct media URLs. GIF files cannot contain sound.
- Without supplied media, an **original built-in horror animation** and synthesized shriek play for about 1.9 seconds. The specific film image and soundtrack are **not bundled**.
- Use media you own or have permission to use. Host it somewhere your browser can load directly over HTTPS.

## Controls and safeguards

**Skip and process** goes immediately to the original action. **Cancel** or **Escape** leaves the job unprocessed. Nothing plays for an incomplete job. Readiness is checked again after the preview; jobs that have become incomplete do not process. Repeated clicks cannot create duplicate previews. Video/audio volume is capped at 60%; the built-in synthetic sound is quieter. Browser/device audio settings may still block playback.

Existing client totals, recipient matching, approval rules, and Clear behavior remain unchanged.
