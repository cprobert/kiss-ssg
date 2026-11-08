# Images: `{{image}}`, the committed cache, and the sweep

kiss encodes a site's photos itself. `{{image}}` writes the `<picture>`, and the build encodes the AVIF, WebP and fallback widths, with the GPS and camera data stripped. GUIDE.md § Responsive images has every rule; this file holds the decisions an agent makes. The numbers below were measured on a real 3,800 px, 504 KB photo from a fleet site, through a kiss build.

## Which images

- **A photo or other raster** (JPEG, PNG, WebP, AVIF) is `{{image}}`.
- **A logo, icon or diagram** is an SVG through `{{asset}}` in an `<img>`, with `width` and `height`. A vector needs no widths, and `{{image}}` refuses it.
- **A GIF or animated image** is refused too: only its first frame would survive. A short animation is a `<video>` with `width` and `height`.
- **An image in a model's Markdown** (`![](…)`) and a CSS background image do not pass through `{{image}}`. Keep them small, and give a Markdown image its size in the model.

## Write the call

```handlebars
{{image
  'img/swan.jpg'
  alt='Two swans on the river'
  sizes='(min-width: 60rem) 50vw, 100vw'
  eager=true
}}
```

- **`alt`** is required. It says what the image shows, in the words of the page (open [`kiss-accessibility`](../../kiss-accessibility/SKILL.md)); `alt=''` marks a decorative image.
- **`sizes`** is required, and is the decision that matters most. It tells the browser how wide the image shows before the CSS has loaded, and the browser chooses the file from it. Read it from the CSS that places the image:
  - full width of the screen: `100vw`;
  - a column that is half the page from 60rem up: `(min-width: 60rem) 50vw, 100vw`;
  - a fixed-width card or thumbnail: its width, `20rem`.

  A `sizes` that is too large downloads a file twice the size needed; one that is too small sends a blurred image. Write the widths alone: `{{image}}` puts `auto` in front of them itself on a lazy image.

- **`eager=true`** on the first image a visitor sees, and on no other. It writes `fetchpriority="high"` and no `loading`; every other image is lazy.
- **`class`** and other attributes pass through to the `<img>`.

For the 3,800 px photo, the recipe wrote AVIF, WebP and JPEG at 480, 960, 1440 and 1920 px (2.14 added 768 to the default, for phones). The 480 px AVIF is 4.9 KB, and the 1920 px AVIF 22.6 KB.

## Commit the cache

The first build after adding an image encodes it and keeps the files in `.kiss-cache/images`. That build took 1.8 seconds for the photo; the next took 0.7, copying from the cache. Commit the folder with the change, so a deploy copies rather than encodes. A build that encoded prints:

```text
12 image variants were encoded that are not in the committed cache. Run `npx kiss-ssg images <script>` and commit .kiss-cache/images
```

Seen on a deploy, that line means someone added an image and did not commit the cache.

## The sweep

```bash
npx kiss-ssg images router.js
```

It fills the cache, removes what no page uses any more, and lists the originals to fix: each wider than any width kiss encodes, and each carrying a GPS location. It changes nothing in `src/`. A GPS location in a photo of a client's home is a privacy finding, so show the list to the owner, then:

```bash
npx kiss-ssg images router.js --write
```

It rewrites those originals in place: the right way up, metadata stripped, resized down to 1920 px. The photo above went from 504 KB to 94 KB. Read `git diff --stat` before committing. A rewritten JPEG is re-encoded once, at quality 90, so keep the camera originals somewhere other than the site.

## Move existing `<img>` tags to `{{image}}`

`img-not-responsive` in `npx kiss-ssg check router.js` lists each `<img>` that serves one raster at one size. Work through it one image at a time, never by search and replace. Each image needs its own `alt` and its own `sizes`, read from the layout it sits in. Then check the page in the browser at a phone width and a desktop width, and run the check again.
