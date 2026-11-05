# Fonts: self-hosted, few, and matched

A font from a font service costs a connection to another origin before the file can start, and it tells that service about every visitor: open [`kiss-legal-and-privacy`](../../kiss-legal-and-privacy/SKILL.md) for that side. A font service used to have one speed argument: a font cached on one site was reused on the next. Browsers now keep a separate cache for each site (Chrome since version 86), so that reuse no longer happens. The other argument, that a service handles the formats for old browsers, has lapsed too. Every browser in use reads `woff2`, so one `woff2` file per face is enough, with no `eot`, `ttf`, `svg` or `woff` beside it.

What a font service still does well is split a font by script, so a page in English never downloads the Cyrillic glyphs. Fontsource gives the same split as files the site hosts itself.

Each recipe was run as written through a kiss build and loaded in Chromium.

## Choose what to load

- **A system font stack** downloads nothing: `font-family: system-ui, sans-serif`. Offer it first, when the design does not depend on a particular face.
- **One variable font** when the design uses three or more weights of a family. One file carries every weight. Fontsource publishes these as `@fontsource-variable/<font>`.
- **Static weights** when it uses one or two: `@fontsource/<font>`, one file per weight and style.
- **Only the scripts the site writes in.** An English site needs the `latin` file, and a site with names like "Łódź" or "Dvořák" needs `latin-ext` as well.

## Self-host a Google font with Fontsource

```bash
npm install @fontsource-variable/inter
```

Copy the package's font files into the build, with the package version in the folder name. The version is what makes a long cache safe: an upgrade writes a new folder, so nobody keeps an old file:

```js
kiss.copyAssets(
  './node_modules/@fontsource-variable/inter/files',
  './public/fonts/inter-5.3.0',
)
```

The font's licence goes beside it. Copy the package's `LICENSE` file (for Inter, the SIL Open Font License) to `src/assets/fonts/inter-5.3.0/LICENSE`. The site's own asset copy then puts it in the same folder as the font files, and the two copies share the folder without a conflict.

Write the `@font-face` in the site's Sass, one rule per script the site needs. Copy the `unicode-range` from the package's `wght.css`, where it is written beside each file:

```scss
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-display: swap;
  font-weight: 100 900;
  src: url('/fonts/inter-5.3.0/inter-latin-wght-normal.woff2') format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC,
    U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212,
    U+2215, U+FEFF, U+FFFD;
}
```

Do not link the package's own `index.css`. It names every script the font has, and its `url(./files/…)` paths only work beside the package's own files.

Preload the file the first screen uses, from the layout's `<head>`:

```handlebars
<link
  rel='preload'
  href='/fonts/inter-5.3.0/inter-latin-wght-normal.woff2'
  as='font'
  type='font/woff2'
  crossorigin
/>
```

## Cache the font files

kiss writes a year-long cache rule only for files it content-hashed, and font files are not among them. The versioned folder is what lets the site cache them for a year itself. On Netlify, put the rule in the site's own `src/assets/_headers`. kiss keeps it and appends its own rules after it:

```text
/fonts/*
  Cache-Control: public, max-age=31536000, immutable
```

On another host, the same rule goes in that host's header file (GUIDE.md § Cache headers). After a font upgrade, change the folder name in all four places: the copy, the licence's folder, the `@font-face` and the preload.

## Match the fallback, so the text does not move

While the font downloads, the browser shows the fallback, and `font-display: swap` replaces it when the font arrives. If the two are different sizes, every line of text moves. Give the fallback the font's measurements, generated rather than guessed:

```bash
npm install --save-dev @capsizecss/core @capsizecss/metrics
```

```js
import { createFontStack } from '@capsizecss/core'
import inter from '@capsizecss/metrics/inter'
import arial from '@capsizecss/metrics/arial'

const { fontFamily, fontFaces } = createFontStack([inter, arial])
console.log(fontFamily)
console.log(fontFaces)
```

Run it once, and paste what it prints into the site's Sass. For Inter over Arial that is:

```scss
@font-face {
  font-family: 'Inter Fallback';
  src: local('Arial'), local('ArialMT');
  ascent-override: 90.4365%;
  descent-override: 22.518%;
  line-gap-override: 0%;
  size-adjust: 107.1194%;
}

body {
  font-family: 'Inter Variable', 'Inter Fallback', Arial, sans-serif;
}
```

Use the system font the design falls back to: `arial` for a sans-serif and `timesNewRoman` for a serif, both in `@capsizecss/metrics`. The family name in the stack is the one the site's own `@font-face` declares: `'Inter Variable'` here, not the `Inter` that Capsize prints.

## Check

- `npx kiss-ssg check router.js` passes, and `font-preload-excess` is not reported.
- In the browser's network panel, a page downloads one font file per face it shows. A page in English downloads no `cyrillic` or `greek` file.
- `npx kiss-ssg speed public --page /` shows no layout shift from text (CLS) when the font arrives.
