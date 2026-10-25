# packages.js

## Responsibility

Learning packages: a zip a learning management system such as Moodle imports, one per group of pages, many in one build (`planning/plans/2026-10-24-learning-packages.md`). A page joins a package by naming it (`package: 'lesson-1'`); each package is written as an IMS content package (`imscp`, the default) or a SCORM 1.2 package (`scorm12`), into `config.packages.dir` (default `packages/`), as `<id>.<format>.zip`.

The module decides **what goes into a package** and writes it. A package holds its member pages, the files they need to display (found by its own extraction, which keeps what each reference is), and `imsmanifest.xml` (`lib/package-manifest.js`), zipped by `lib/zip.js`. What it cannot carry is reported, never packed: a root-relative reference, a folder or extension-less link, an `<a>` to a page outside the package, an absolute URL to this site, and anything this build did not write.

It knows nothing about `Kiss`: `build-finish.js` hands it the projected stack and a `written(file)` test over the output registry, and decides when it runs.

## Public interface

- `PACKAGE_ID` — the pattern a package id must match: lower-case letters, digits and single hyphens. `page-registry.js` checks it at prepare.
- `extractReferences(html)` → `{ needs, anchors }`, each in document order, once each. `needs` are the files a page needs to display: any `src`, `srcset` URLs, `poster`, `object[data]`, SVG `use`/`image` `href` (or `xlink:href`), the `href` of a `<link>` whose `rel` is a stylesheet, icon, preload, module preload, prefetch or manifest, and every `url()` and `@import` in a `<style>` element or a `style` attribute. `anchors` are `<a href>` and `<area href>`. A form's `action`, a script's own imports and a `<link rel="canonical">` are neither.
- `extractCssReferences(css)` → every `@import` (with or without `url()`) and `url()`, in document order, once each. Read as a browser reads them: in any case (`@IMPORT`, `URL()`); a quoted value keeps its spaces and an escaped quote does not end it; and CSS escapes are decoded (`my\ pic.png` is `my pic.png`, `caf\e9` is `café`, `\)` a bracket), so a file named with an escape is found and packed rather than reported as not written (Codex review, 2026-10-25). An escape is read whole (hex digits and the one space that ends them), so that space does not end an unquoted `url()`. Comments are skipped; a `url(` inside a quoted string, such as a `content` value, is still read: rare, and harmless, since it packs a file the build wrote or reports one it did not.
- `documentBase(base, from)` → the build-relative file a page's references resolve from, given its `<base href>`, resolved as a URL resolves it (`..` and `.` name a folder); `from` for an empty base; `null` for an absolute or root-relative base.
- `resolveReference(ref, from, { siteOrigin })` → `{ kind: 'skip' }` (empty, `#fragment`, protocol-relative, or a scheme that is not this site), `{ kind: 'outside', reason }` (root-relative, above the build folder, a folder, an absolute URL to this site), or `{ kind: 'path', rel }` (build-relative, `?query` and `#fragment` dropped, percent-escapes decoded).
- `commonRoot(paths)` → the deepest folder holding every build-relative path; `''` for the build folder.
- `packageMembers(stack)` → `Map<id, entry[]>`, ids sorted, each list in registration order (`entry.order`); a page with `generate: false` is never a member.
- `writePackages(stack, { packages, siteUrl, writeRoot, written, outputs, logger })` → `{ packages, failures }`: every package written in every format, sorted by id then format, or `null` with the reasons when any package cannot be made.
- The `KissPackages`, `PackagePageInfo`, `PackageOutside` and `PackageResult` typedefs.

## Depends on

`fs-extra`, `htmlparser2` (`Parser`, the same streaming parser `html-split.js` uses), `node:crypto` (the hash), `./package-manifest.js` and `./zip.js`.

## Depended on by

`lib/build-finish.js`'s `writeLearningPackages()`, called at the top of `complete()`'s settle path beside `_redirects` (`Kiss._writePackages()`); its result is the report's `packages` key (`AIKB/build-report.md`). `lib/page-registry.js` imports `PACKAGE_ID`.

## Non-obvious behavior

- **All or nothing.** Every member is checked before anything is written: a page with no usable `id` (kiss withdraws a default id two pages share), a page that was not written, or a file named `imsmanifest.xml` at a package's root is a failure, and no zip is written. An LMS should never be handed half a course.
- **A page's identifiers come from its `id`.** The manifest's item and resource identifiers are the promise an LMS keeps a learner's records by across uploads, so a member without one fails rather than falling back to its path (`AIKB/package-manifest.md`).
- **Only this build's files.** A reference resolves against the output registry (`written`), never the disk: a stale file left by an earlier build under `cleanBuild: false`, or an earlier zip, is never packed, even when a page links to it. Nothing in the packages folder is ever followed.
- **Needs are followed, links are not.** A file a page needs is packed, and a needed `.html` (an `<iframe>`) or `.css` is read in turn, with the same rules, until the walk has visited everything; a visited set ends a cycle. An `<a>` to a member page is fine; an `<a>` to a written file that is not HTML (a PDF, a worksheet) is a download, packed and listed exactly as a needed file is (code review, 2026-10-25); an `<a>` anywhere else is reported, because the package would open it inside itself or not at all. Each needed file is listed on the resource of the member whose walk reached it first.
- **The root is the deepest folder holding the whole closure**, the files as well as the pages, so a shared `assets/` folder above the lessons puts the root above it, and every relative reference still works inside the zip. It also holds every folder a followed reference climbs to on its way (`../l1/a.png` from `course/l1/` climbs to `course/`), and a page's relative `<base href>` too: the zip keeps references as written, so one that climbed above the root would point out of the package.
- **A page's `packageSection` groups it** under a section item of that title in the table of contents, as `renderManifest` draws it; pages with none stay at the top level.
- **Folder and extension-less links are reported.** A host maps `lesson/` to `lesson/index.html`; an LMS serves a package's files as they are and does not.
- **The hash is of the zip.** The zip is stored and byte-stable (`AIKB/zip.md`), so its sha1 changes exactly when a file in it does.
- **All or nothing.** Every package's zip is made in memory first; none is written until all of them are made, so a failure in a later package leaves no earlier zip behind, even in a build that is not atomic. Then each zip is written to a temporary file and renamed, so a reader never sees half a package.
- **A `<base href>` is followed as a browser follows it.** A relative base is the folder a page's references resolve from (`<base href="../assets/"><img src="a.png">` needs `assets/a.png`). An absolute or root-relative base is a finding (`an absolute base URL`), and none of that page's relative references is followed: no file of the build could be named for them.
- **Each member's needs are walked on their own (2026-10-25).** A file two members need is listed on both members' resources, and is in the zip once; a member page another member embeds (an `iframe`) is listed on the embedding member's resource too, as any file it needs. It used to be listed on the resource of the member whose walk reached it first; a strict LMS or conformance checker may expect each SCO's resource to name every file it needs (the SCORM 1.2 best-practice review, `planning/plans/2026-10-24-learning-packages.md` amendment (4)).
- **A reference in the wrong case is a finding, not a file.** The output registry keys files case-insensitively on Windows, and macOS's disk ignores case, so `img/App.png` for `img/app.png` resolves on both. Before packing, `exactCase` compares each segment with its folder's listing (each folder listed once) and reports a mismatch as `a reference in the wrong case`. On a case-sensitive file system the file is simply not written, and the reason is `not written by this build`.
- **`bytes`** is each package's zip length, for an LMS's upload limit; `packageSize` in `lib/build-report.js` formats it for the log and the summary.
- **`config.packages.schemas`** puts the three SCORM 1.2 schema files kiss vendors (`lib/schemas/scorm12`, with `NOTICE.md` for their owners and source) at the root of each SCORM 1.2 package, and `renderManifest` names them in `xsi:schemaLocation`. An IMS content package gets none (another schema). A member file at the root with one of their names fails the build, as one named `imsmanifest.xml` does.
