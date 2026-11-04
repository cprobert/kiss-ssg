# embed.js

## Responsibility

Click-to-load embeds: what `{{embed}}` writes. A frame from another site (a video, a map, a post) waits in a `<template>` behind a notice until the visitor asks for it, so nothing is fetched or stored before a click. The site decides the mode, never the template:

- **under `config.consent`**, the embed is one of the site's declared services. Its notice offers **Load it** and **Always allow**, and `lib/consent-client.js` reveals it when the stored choice allows it and records it for withdrawal;
- **with no `config.consent`**, the service is the preset alone and the embed is a facade: a **Load it** button, a link to the provider, and a small script written after it that wires the button. Nothing is stored, so there is no choice to remember and nothing for a banner to ask.

It exists because of the 2026-11-04 clean room (`planning/reviews/2026-11-04-embed-clean-room.md`). An agent asked to add a YouTube video to a site with no banner found the consent helper, read that one video needs no banner, and hand-built 32 lines of facade instead.

## Public interface

- **`embedService(name, consent)` → `ConsentService`.** Under `config.consent`, the site's declared service of that name. **Throws** for an undeclared one, naming `config.consent.services` (an embed the config does not know would be missing from the banner and the cookie table). With `consent` null, `presetService(name)` from `lib/consent.js`. **Throws** for a name with no embed preset, listing the ones there are.
- **`embedMarkup(name, service, { consent, text, params, src, title })` → `string`.**
  - **Under `config.consent`:** `div.kiss-embed[data-kiss-embed][data-kiss-consent]`, a `[data-kiss-consent-ui]` notice with **Load it** and **Always allow** (`data-kiss-consent-action="load"|"allow"`). A `necessary` service gets the plain iframe.
  - **Without it:** `div.kiss-embed[data-kiss-embed][data-kiss-embed-facade]`, a `[data-kiss-embed-ui]` notice with one **Load it** (`data-kiss-embed-action="load"`), and `facadeScript()` after the box.
  - **Both:** the box carries the frame's geometry inline (below). The wording is `text` (the site's `ui.text`, or `DEFAULT_TEXT`), filled in one pass: `{provider}` with the provider and `{service}` with the label. The provider's own link (`embed.watch`) is the notice's last paragraph, so it hides with the notice; it is omitted when there is none or a placeholder cannot be filled. The iframe sits inside `<template data-kiss-embed-frame>`, sized inline (below), and followed by `measureScript()` when `embed.measure` is set.
  - **Throws** with no title, no src, or a `{param}` with no value.
- **`facadeScript()` → `string`.** `kissEmbedFacade`, inlined by its source. It finds its box through `document.currentScript.previousElementSibling`, so an embed works wherever it is put with nothing in `<head>`. On a click it puts the template's frame in place, hides the notice and focuses the frame.
- **`measureScript(frameSrc)` → `string`.** `kissEmbedMeasure`, for a frame that reports its height. It listens for `{"type":"MEASURE","details":{"height":N}}` from the frame's own origin and sets the height of the iframe whose window sent it. Empty for a src with no origin.
- **`embedPresetNames()` → `string[]`.** The presets with an `embed`, in preset order.

## Depends on

`./consent.js`: `PRESETS`, `fill`, `gatingOf`, `presetService`.

## Depended on by

`lib/handlebars-helpers.js` (`embed`). Tests: `test/unit/embed.test.js`; `test/integration/consent.test.js` ("{{embed}} on a site with no config.consent", and the consent site from `test/helpers/consent-site.js`); `test/browser/consent.test.js` ("{{embed}} without config.consent, in Chromium").

## Non-obvious behavior

- **The size is on the iframe, not in the theme.** A 16:9 player and Instagram's frame need different CSS, and that is a property of the provider's frame, not the site's look. So `style` carries `display:block;width:100%;border:0`, then either `aspect-ratio:<ratio>;height:auto` or `aspect-ratio:auto;height:<height>px`, and `max-width:<width>px;margin:0 auto` when the preset caps the width. The consent theme's `.kiss-embed iframe` rule was removed with this module. A site that wants another size overrides it with `!important`, or with its own `ratio`, `width` and `height` under `config.consent`.
- **The box holds the frame's space, so the page does not move when it loads** (the operator, 2026-11-04, after the after-run's screenshot showed a bare paragraph, button and link). The box's inline style is geometry only: a centred flex column, `box-sizing:content-box`, the frame's `aspect-ratio` (or `min-height` of its starting height), and the same width cap. No colour or border, so the site's CSS or the consent theme decides the look. `content-box` because the ratio is the frame's: a site's `* { box-sizing: border-box }` would take the theme's padding out of it and the loaded frame would push the box taller. A box with more text than room grows, since an aspect ratio gives way to its content (a narrow phone with the consent notice's two buttons). The browser suite measures it: at 320 px the box is 16:9 before the click and the same height after, and the next embed does not move. For a measured frame, `kissEmbedMeasure` clears the box's `min-height` when it sets the reported height.
- **Instagram reports its height without `embed.js`.** Measured on 2026-11-04: a plain `/p/{id}/embed` frame posts `MEASURE` (568 px at 320 wide, 883 px at 1440), and `/p/{id}` serves a reel as well as a post. The listener checks `e.origin` and matches `e.source` against each iframe's `contentWindow`, so another frame's message cannot resize anything. It is written once per measuring embed, so two Instagram embeds add two listeners, each of which sizes only the frame that spoke.
- **The wiring check ignores a facade.** `consentWiringProblems` (`lib/consent-gate.js`) counts a `data-kiss-embed` box as gated markup that needs a consent head, unless it carries `data-kiss-embed-facade`.
- **The audit reads a facade like a consent embed.** `lib/audit.js` takes the frame's origin from the template and marks it with the service, so `thirdParty` lists it, and neither `consent-missing` nor `consent-ungated` reports it.
- **A learning package's page refuses `{{embed}}` in both modes** (the 2026-11-03 decision, "the LMS deals with consent"), with or without `config.consent`.
- **The wording without `config.consent` is the default `ui.text`.** A site that needs other words declares the service under `config.consent`, which also brings the banner. Known limit, not decided: a site with no banner cannot change the facade's words.
