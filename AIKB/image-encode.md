# image-encode.js

## Responsibility

Encode the variants `{{image}}` asked for into the build, with `sharp`, or copy them from the committed encode cache. It does not decide when it runs (`lib/build-finish.js` `encodeImages` does) and it never prunes the cache (`lib/images-sweep.js` does).

## Public interface

- `encodeVariants({ variants, root, cache, refresh, concurrency, warn })` → `EncodeResult`: `{ requested, encoded, cached, keys, written, failures, cacheSkipped }`. `variants` are the index's (`lib/images.js`), each with the build-relative `source` it is made from. `cache` is an absolute folder or `null`. `refresh` ignores hits. `encoded` and `keys` are cache names; `written` the absolute files written to the build; `failures` one `{ source, error }` per source that could not be encoded.
- `cacheName(variant)`: `<full digest><extension>`.
- `isCacheFileName(name)`: whether a bare name is one the cache writes, an entry (64 hex characters and `.avif`, `.webp`, `.jpg`, `.jpeg` or `.png`) or `writeCacheEntry`'s temp file beside one. The sweep prunes only these.
- The `EncodeResult` and `RequestedVariant` typedefs.

## Depends on

`node:fs`, `node:path`, `node:crypto` (`randomBytes`), `lib/image-header.js` (`isWholeImageFile`, for a cache hit), `sharp` (dynamic import, on the first miss).

## Depended on by

`lib/build-finish.js` `encodeImages(kiss)`, called by `Kiss._encodeImages()` in `complete()`'s settle path straight after the purge.

## Non-obvious behavior

- **`sharp` is imported on the first miss and never before.** A build served wholly from the cache, a dev build, the header reader and the audit never load its 29 MB of native binaries (measured on Windows, 2026-11-05).
- **Decoded once per source, oriented, cloned per variant.** `sharp(file).autoOrient()`, then `clone().resize({ width })` and the format's encoder. Without `autoOrient()` an orientation-6 JPEG comes out sideways; with it first it is the right way up (measured, sharp 0.35.5). AVIF, WebP and JPEG output drop all EXIF, GPS included, because `keepMetadata()` is never called (measured). JPEG uses mozjpeg at the recipe's quality; PNG is `compressionLevel: 9`, lossless.
- **At most four sources at once** (`concurrency`). libvips already threads each encode; more parallel decodes only multiply memory.
- **A cache entry is written whole or not at all**: a temp file beside it, then a rename. On Windows a rename onto a file another process just wrote fails with `EPERM`; when the entry is there and non-empty that is a hit, since the name is the content. An empty file is never a hit.
- **The cache folder is made on the first miss.** A site with no `{{image}}`, or one served wholly from the cache, never gets a `.kiss-cache` folder: `kiss-ssg check` promises to write nothing for such a site (`test/integration/check.test.js` caught the folder appearing).
- **An unwritable cache warns once and is skipped**: the build still writes every variant, and the next build encodes them again.
- **A cache hit is a whole image, not just a non-empty file.** Before copying, the entry must be the variant's format and width, and structurally complete (`lib/image-header.js` `isWholeImageFile`: header plus a few bytes, never a decode). A file cut short, a Git LFS pointer that was never pulled, or another variant's bytes is a miss: encoded again and written over the bad entry (Codex adversarial review, 2026-11-05). A body corrupted in place behind an intact header and ending is not detected, since only a decode would see it; git's own object checks cover a committed file.
- **A failed source fails only its own variants.** The others are still written, and `lib/build-finish.js` turns each failure into a `_failures` entry naming the pages. A cache-hit copy that throws is that source's failure too, and `encodeVariants` returns only once every source has settled (`bounded` waits for all its workers before rethrowing). Otherwise one throw ended the call while other sources were still writing, and the build discarded its staging folder under them (Codex adversarial review, 2026-11-05).
