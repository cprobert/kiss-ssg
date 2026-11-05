# image-header.js

## Responsibility

Read what a raster image says about itself in its header, synchronously and without decoding a pixel: its format, its size as a browser shows it, its EXIF orientation, whether it carries a GPS location, and whether it is animated. One parser for both callers: `{{image}}` (size, orientation, animation) and the audit (`image-location-metadata`). `sharp` is never loaded here.

## Public interface

- `readImageHeader(file)` → `ImageHeader | null`: `{ format, width, height, orientation, gps, animated }`. Memoised by path, `mtimeMs` and size, so a layout that renders one image on every page reads it once and an edited file is read again. `null` for a file that cannot be read, a format it does not know, or one too damaged to give a size.
- `parseImageHeader(reader)` → the same, over a `ByteReader` (`{ size, read(offset, length) }`). The unit tests hand it `bufferReader(buffer)`.
- `bufferReader(buffer)`, `readTiff(tiff)` (`{ orientation, gps }` from a TIFF structure at its `II`/`MM` mark) and `RASTER_EXTENSION` (`.jpg .jpeg .png .webp .avif`, what `{{image}}` and the audit treat as rasters).
- The `ImageHeader`, `ImageFormat` and `ByteReader` typedefs.

## Depends on

`node:fs`.

## Depended on by

- `lib/handlebars-helpers.js` `image`: the size, the orientation swap, the animation refusal.
- `lib/audit.js`: `image-location-metadata`, from the build-folder walk, and `RASTER_EXTENSION` for `image-oversized` and `img-not-responsive`.
- `lib/images-sweep.js` `findOriginals`: the originals carrying GPS or wider than the recipe.

## Non-obvious behavior

- **Positioned reads, not "the first 64 KB".** The plan said to read the first 64 KB. A JPEG's frame header can sit behind an ICC profile bigger than that, so the reader walks the container's own structure (JPEG segments to the start of the scan, PNG chunks to `IEND`, RIFF chunks, ISOBMFF boxes) and reads only the bytes each step needs. No single read is over 1 MB, and no walk takes more than 10,000 steps, so a corrupt length cannot allocate the file or loop.
- **Width and height are as displayed.** EXIF orientations 5–8 turn the picture a quarter, so the stored size is swapped. That matches `sharp(...).autoOrient()` and what `{{image}}` encodes (measured: a 40×20 JPEG tagged 6 reads as 20×40, and `sharp().metadata()` reports the stored 40×20 with `orientation: 6`).
- **AVIF ignores the EXIF orientation.** HEIF carries rotation in `irot`, which a decoder applies. `sharp` 0.35.5 writes an AVIF from an orientation-6 source with an `irot` _and_ EXIF orientation 6 left in its Exif item, and `metadata()` reports 20×40. Reading both would turn it twice, so only `irot` swaps, and `orientation` is reported as 1. `imir` (a mirror) does not change the size and is not read.
- **AVIF size is the largest `ispe`**, not the one `ipma` associates with the primary item. A grid image's tiles each carry their own `ispe` and the grid's is the whole picture. A file whose primary item is smaller than another item (a large thumbnail) would read wrong; none has been seen.
- **GPS means a latitude or a longitude.** In EXIF, the GPS IFD (`0x8825`) counts only when it holds tag 2 (`GPSLatitude`) or 4 (`GPSLongitude`): an IFD holding only its version or a timestamp places nobody. In XMP, the packet is searched for `GPSLatitude` or `GPSLongitude`. Read from JPEG `APP1` (EXIF and XMP), PNG `eXIf` and uncompressed `iTXt` XMP, WebP `EXIF` and `XMP `, and AVIF `Exif` and `mime` items located through `iinf` and `iloc`. A compressed PNG XMP packet, and ImageMagick's hex `Raw profile type exif` text chunk, are not read: documented false negatives.
- **Animated** is an APNG's `acTL`, a WebP's `VP8X` animation flag or `ANIM`/`ANMF` chunk, and an AVIF whose major brand is `avis`. A GIF reports its size and `animated: false`, because `{{image}}` refuses every GIF before asking.
- **The memo is per process** and keyed by absolute path, so two `Kiss` instances in one process share it. Safe, because a changed file changes its `mtimeMs` or size. A rewrite within one millisecond to the same size would be missed; nothing does that between two renders.
