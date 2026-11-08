# images.js

## Responsibility

Everything about a responsive image that is decided at render: the recipe (`config.assets.images`), the widths one source is served at, each variant's name, the `<picture>` markup `{{image}}` writes (and the plain `<img>` dev writes), the helper's argument rules, and the per-instance index of what this build asked for. Nothing here encodes: `lib/image-encode.js` does, at the settle.

## Public interface

- `resolveImages(images)` → `KissImages`: `{ widths, formats, quality, cache }`, filled from `DEFAULT_IMAGES` one level deep (`quality` merges per format). Throws, naming the key, on an unknown key, an empty or non-integer `widths`, a format other than `avif`/`webp` (or one twice), a quality outside 1–100, or a `cache` that is neither a non-empty string nor `false`. `widths` come back sorted and deduplicated. `lib/config.js` calls it.
- `DEFAULT_IMAGES`: widths `[480, 768, 960, 1440, 1920]`, formats `['avif', 'webp']`, quality AVIF 50, WebP 75, JPEG 80, cache `.kiss-cache/images`. The qualities were checked by eye by the operator on 2026-11-05: four fleet images at 960 px (fur, dark fur, black-and-white artwork, a dark PNG), each flicked against a lossless reference and the qualities either side (AVIF 40/60, WebP 65/85, JPEG 70/90). The widths are still provisional. 768 was added on 2026-11-08 (#78's reporter, a1k9training): a full-width image on Lighthouse's mobile device (412 px at 1.75x) wants 721 px and was sent the 960. Measured in a clean room of that site, 20 pages at 412 px and 1.75x: the image bytes a phone downloads went 1,642,657 → 1,315,851 (−19.9%, 16 of 20 pages lighter), and the deployed and cached image bytes 20.3 MB → 23.5 MB (+72 variants, +16%).
- `variantWidths(sourceWidth, widths)`: every width narrower than the source, plus the source's own width when it is not wider than the largest. Never enlarges.
- `fallbackFormat(sourceFormat)`: `png` for a PNG, `jpeg` for the rest.
- `recipeString({ format, width, quality })`: `kiss-image/1 <format> w<width> q<quality>`.
- `variantName(emitted, width, format, hash)`: `img/hero.jpg` → `img/hero-960.<hash>.avif`, through `hashedName`; `.jpeg` is written `.jpg`.
- `fileDigest(file)`: SHA-256 hex of the bytes, memoised by path, `mtimeMs` and size.
- `planImage({ emitted, header, digest, images })` → `ImagePlan`: `sources` (one per format), `fallback`, `src` (the fallback's middle width), `width` and `height` (the largest variant's). Each `ImageVariant` carries `path`, `format`, `width`, `height`, `quality` (`null` for PNG) and the full `digest` its name's hash is cut from.
- `imageArguments(hash)` → `{ alt, sizes, eager, root, attrs, problems }`. `problems` names every reason the call cannot be served: no `alt`, no or blank `sizes`, a non-string `root`, one of `IMAGE_OWN_ATTRIBUTES` (`src`, `srcset`, `width`, `height`, `loading`, `fetchpriority`, case-insensitively), or a name that is not an attribute name.
- `pictureHtml(plan, options)` and `plainImgHtml(source, options)`: the markup. `escapeAttribute(value)`.
- `createImageIndex()`: `record(source, page, variants)`, `variants()` (by path, each with its `source`), `pagesUsing(source)`, `reset()`.
- The `KissImages`, `ImageVariant` and `ImagePlan` typedefs.

## Depends on

`node:fs`, `node:crypto`, `./asset-manifest.js` (`HASH_LENGTH`, `hashedName`).

## Depended on by

- `lib/handlebars-helpers.js` `image`, the one caller of the planning and markup functions.
- `lib/config.js` (`resolveImages`).
- `lib/kiss.js`, which owns one `createImageIndex()` per instance and hands it to the helpers; `lib/rebuild.js` resets it at replay and reads `pagesUsing` for a watch edit; `lib/build-finish.js` reads `variants()` for the encode and the cache headers.

## Non-obvious behavior

- **The name is known before the file exists.** The digest is SHA-256 over the copied build file's bytes (never `src/`, so the name follows what ships) and the recipe string, and the name's hash is its first `HASH_LENGTH` characters. Handlebars helpers are synchronous and an AVIF takes seconds, so the markup has to name a file the settle will write. The same full digest is the encode cache's key.
- **`sharp`'s version is not in the digest** (the operator, 2026-11-05, overruling the critique's finding 12). The cache is committed, so an upgrade that renamed every variant would re-encode and re-commit it all, and a variant from an older `sharp` is still a correct image of the same source and recipe. `kiss-image/1` is kiss's own pipeline version, bumped only when the orient-resize-strip steps change. `npx kiss-ssg images --refresh` re-encodes on purpose.
- **Content-named whatever `assets.hash` and `assets.version` say**: no `?v=`. An image URL is only ever written by `{{image}}`, so nothing else has to follow the name.
- **Every `<source>` carries the `<img>`'s `sizes`**, `auto, …` when lazy. Without `sizes` on a `<source>`, a browser picks from that `srcset` as if the image were `100vw`.
- **`width` and `height` are the largest variant's**, which has the source's aspect ratio; the box is reserved either way.
- **The index is a union for the build**, not per page. A scoped re-render can add to it but never remove from it; the replay's `reset()` is what starts it again, and the encode runs only at a settle.
- **`eager` accepts `true` or the string `'true'`**: a template passing a model value gets the same answer.
