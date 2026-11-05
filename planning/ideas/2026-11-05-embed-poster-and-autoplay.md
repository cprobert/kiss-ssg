# Idea: `{{embed}}` with a poster, its own wording, and autoplay on Load

- **Status:** requested, 2026-11-05. Not scheduled. It is a request from the a1k9training session (its PR #57, the first site on 2.12.0), relayed by a peer Claude session. Nothing in it is verified here yet.
- **Why:** the Puppy Socialisation page uses `{{embed 'youtube' id=… title=…}}` with no `config.consent`. On a phone, the site owner found the facade unconvincing. It is a plain box with a sentence, "Load it" and "Open it on YouTube", and nothing in it says "this is a video". The players people know show a still with a play arrow.

## What is asked for

1. **`poster=` on `{{embed}}`.** A local image path, run through the `{{image}}` pipeline: an AVIF/WebP `<picture>`, `sizes` matching the box, lazy unless `eager=true`, and metadata stripped. It is drawn under the notice, in the reserved box, so nothing shifts.
   - **Self-hosted only.** Fetching the thumbnail from `i.ytimg.com` makes the third-party request before the click, which is the request the facade exists to prevent.
   - A GUIDE line could say to save the provider's thumbnail into `src/` once. The site reports that YouTube's `sddefault.jpg` works and `maxresdefault` returns 404 on older uploads. That is reported, not measured here.
   - Optionally, a default play-arrow treatment for the button when there is a poster, styled through the existing `.kiss-embed*` hooks.
2. **Wording without `config.consent`.** `ui.text` (`embedNotice`, `embedLoad`, `embedWatch`) can only be changed under `config.consent` today, so a site using the standalone facade is stuck with "Load it" as the button's accessible name. "Play video: <title>" would tell a screen-reader user much more. The options are per-call hash keys (`load=`, `notice=`) or a site-wide setting that does not switch on the consent manager.
3. **Autoplay on Load for video presets** (youtube, vimeo). The click that reveals the frame is the request to play. The preset could add `autoplay=1` on Load, or an `autoplay=true` flag could. `lib/embed.js` already puts `autoplay` in `allow`. The request says Chrome, Edge and Firefox honour it from the click, and that iOS Safari may still want a tap for video with sound. **Measure that before any doc claims it.**

## Questions before building

- Is the plain-words name `poster=` right? It is the HTML `<video>` attribute name, so probably yes.
- Wording: per call, site-wide, or both? A site-wide key outside `config.consent` must not be a second home for text that `ui.text` already holds.
- Should autoplay be the preset's default for video, or opt in? Decide from the iOS measurement.

## The requesting site

a1k9training's ROADMAP has an item to adopt `poster=` and the wording option. It asked for the version this lands in, so its item can point at it. Measured on its deploy preview, as the site reports: no YouTube or Google request and no storage before Load, at 375 and 1440 widths. After Load, the youtube-nocookie frame stores `yt-icons-last-purged`, `ytidb::LAST_RESULT_ENTRY_KEY` and the IndexedDB database `YtIdbMeta`, which matches the 2.11.3 preset list.
