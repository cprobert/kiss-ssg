# 14 · cookie consent

A small site that needs a cookie banner, wired the way the guide says. Aster & Oak loads three
things that store something on a visitor's device: Google Tag Manager, a visit counter of its
own (`src/assets/js/visits.js`), and a YouTube video. `router.js` declares them once, in
`consent`, and the banner, the settings dialog, the cookie table and the gating on every page
are all made from that block. **Nothing third-party loads until the visitor allows it.**

## Run it

```bash
npm run eg14           # from the repo root
node router.js         # from examples/14-consent/
node router.js --dev   # live preview on http://127.0.0.1:3001
```

Links are root-relative, so preview it served (`--dev`, or any static server rooted at
`public/`), not opened off the file system.

## What to look at

- `src/layouts/layout.hbs`: `{{consentHead}}` straight after the two meta tags, `{{consentBanner}}`
  first in `<body>`, `{{consentScript}}` for GTM and the counter, and `{{consentSettings}}` in the
  footer beside the cookie and privacy links.
- `public/index.html`: each gated script is `type="text/plain"` with its URL in `data-src`, so
  the browser does not run it; the banner waits in a `<template>`.
- `src/pages/roasting.hbs`: `{{consentEmbed}}`. The iframe is in a `<template>`, so YouTube is
  not contacted until the visitor loads the video or allows marketing. `public/roasting.md`, the
  page's Markdown copy, keeps only the link to YouTube.
- `src/pages/cookies.hbs`: `{{consentTable}}`, the declaration made from the same config.
- `router.js`'s `ui` block: a logo and the site's own colours, with no partial to maintain.

## What the build reports

The build exits 0 and reports two kinds of audit finding, both on purpose:

- `placeholder-left` on `privacy.html`, whose facts only a real owner can give are marked
  `<mark>[to confirm: …]</mark>`. A notice with one left is not ready to publish.
- `consent-records-missing` for `gtm`: no `endpoint` is set, so no record of each choice is
  kept. A site running Google Ads through its container should set one.

The GTM id (`GTM-XXXXXXX`) and the video id (`VIDEO_ID`) are placeholders for the site's own.
