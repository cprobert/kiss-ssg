# package-manifest.js

## Responsibility

The `imsmanifest.xml` of a learning package, as text: the file at a package's root that tells an LMS what the package holds and in what order to show it (`planning/plans/2026-10-24-learning-packages.md`). Two formats: an **IMS content package 1.1** (`imscp`), which an LMS shows with a table of contents and tracks nothing, and **SCORM 1.2** (`scorm12`), the same structure in SCORM's namespaces with every page a SCO, so the LMS tracks each page.

The manifest is generated as text and goes straight into the package's zip (`lib/zip.js`). It never goes through the page pipeline: kiss minifies every non-dev page, whatever its extension, and the HTML minifier breaks XML (`<file href="x"/>` loses its self-closing slash, measured on html-minifier-terser 7.2.0).

The module is pure: it takes a package's description and returns a string. It knows nothing about pages, files on disk, the closure of a package or the zip.

## Public interface

- `renderManifest({ id, title, format, members })` → the manifest text, ending in a newline. Each member is `{ id, title, href, files, section? }`: the page's `id`, its title in the table of contents, its path inside the package, every file its resource lists (the page first, then the files it needs), and an optional section title.
  - One `<organization>`, the `default`, titled with the package's title, listing the members **in the order given**. A member with a `section` goes under that section's item, made where the section first appears; a section item has a `<title>` and no `identifierref`. Members without a section stay where they are.
  - One `<resource type="webcontent">` per member, its `href` the member's page and one `<file>` per entry of `files`.
  - `scorm12` adds `<metadata>` (`ADL SCORM`, `1.2`) as the manifest's first child and `adlcp:scormtype="sco"` on every resource.
  - Throws for a format other than `imscp` and `scorm12`.
- `xmlId(prefix, raw, used?)` → a valid XML ID (NCName), the same for the same `raw` whatever else the manifest holds and in whatever order. A `raw` that is already `[A-Za-z0-9_.-]+` is kept after `prefix`. Any other is cleaned (every run of other characters becomes one `-`, and `-` at either end goes) and given `-` and the first 8 hex digits of its sha1, so `a/b`, `a-b` and `a b` stay apart. An identifier must never move to another page: an LMS keeps learners' records by it, and a tie broken by order (as it first was: `-2`, `-3` in the order asked) moved one when pages were reordered or one was removed (found by the Codex review, 2026-10-24). With a `used` set, `-2`, `-3` is now only the last resort for two hashes that collide.
- The `ManifestMember` and `ManifestPackage` typedefs.

## Depends on

Nothing.

## Depended on by

The learning-package writer (to come, `planning/plans/2026-10-24-learning-packages.md`), which works out each package's members and their files and puts the manifest into the zip. `test/unit/package-manifest.test.js` covers it, including a strict parse by Python's `xml.etree` that checks the namespaces, skipped where no Python is installed.

## Non-obvious behavior

- **A page's identifiers come from its `id`, never its path or position.** Moodle matches a package's items by identifier when the package is uploaded again, and deletes the ones that disappear, with their learners' records. An identifier numbered by position would move those records onto another page when a page is inserted; one made from the path would lose them when a page moves. The `id` is the identity kiss already gives every page, so the promise is: the identifiers stay the same while the page's `id` does.
- **Every identifier has a prefix** (`MANIFEST-`, `ORG-`, `ITEM-`, `RES-`, `ITEM-SECTION-`). The identifiers of one document share one XML ID space, and an ID must start with a letter or `_`: a slug such as `2-intro` is not a valid ID on its own, and an item and its resource would otherwise collide.
- **Collisions are broken in order**, so the same members always get the same identifiers. Two different `id`s that clean to one ID (`a/b` and `a-b`) are a site's choice to make unique if it wants both to keep their identifiers when one of them is removed.
- **`href` and `<file href>` are URI references**, so each path segment is percent-encoded (`leçons/a b.html` → `le%C3%A7ons/a%20b.html`) and the slashes kept. kiss's own page paths are slugs, so this only ever touches a file a site named itself.
- **No schema files (`.xsd`) and no `schemaLocation`.** Moodle does not need them; the contract adds them only if an LMS refuses a package without.
- **`adlcp:scormtype` is lower case**, as SCORM 1.2 spells it (SCORM 2004 spells it `scormType`).
