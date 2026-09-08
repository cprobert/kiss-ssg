# kiss-ssg examples

Ten runnable sites, all in one theme — Aster & Oak, a fictional Bristol roastery — so that what
differs between two examples is the kiss-ssg feature and nothing else. The shared layout,
stylesheet and partials live in `_shared/`; each example keeps its own pages, models and
controllers. Every site builds into `public/<example>/` at the repo root, which is gitignored.

They come in two tiers.

**Examples 1–6 and 10 are the feature reference: one idea each.** Scanning a folder of views,
registering a page by hand, fanning out over an array, layouts and partials, the built-in
helpers, the sitemap, an external tool in the asset pipeline. Each script is short enough to read in one sitting and each page explains,
in a "How this example works" panel, the feature it is demonstrating — with the script that built
it printed underneath. Read one when you want to know how a single thing works.

**Examples 7–9 are exemplars: whole sites to copy by shape.** They are not about one feature;
they are about a situation you will recognise — publishing a new edition beside the old ones,
building a site from a data feed that is sometimes wrong, migrating a v1 project. Each is
deliberate about the things that shape gets wrong, and the comments in the script name what to
copy and why. Start from the one whose situation matches yours rather than assembling it from
the feature reference.

| Example                                             | Tier      | What it shows                                                                              | Run                                                    |
| --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| [1 · scan](1-scan/)                                 | Reference | `.scan()` registers every view under `pages/`, matching models and controllers by filename | `npm run eg1` · `--dev`                                |
| [2 · page](2-page/)                                 | Reference | `.page()` four ways: matched, explicit, object model with `ext`, and a template string     | `npm run eg2` · `--dev`                                |
| [3 · pages](3-pages/)                               | Reference | `.pages()` fans out one page per JSON file; the index reuses the same resolved array       | `npm run eg3` · `--dev`                                |
| [4 · layouts and partials](4-layouts-and-partials/) | Reference | One layout, blocks and content, nested `.hbs`/`.html`/`.md` partials, a dynamic partial    | `npm run eg4` · `--dev`                                |
| [5 · helpers](5-helpers/)                           | Reference | The six built-in helpers, all on one page, plus custom dev ports                           | `npm run eg5` · `--dev`                                |
| [6 · sitemap](6-sitemap/)                           | Reference | `.sitemap()` with `siteUrl`, per-page tuning, `extensionLess`, hashed assets               | `npm run eg6` · `--dev`                                |
| [7 · versioned outputs](7-versioned-outputs/)       | Exemplar  | One build per season into its own folder, atomically, with an archive index beside them    | `npm run eg7` · `node 7-versioned-outputs.js <season>` |
| [8 · data-fed site](8-data-fed-site/)               | Exemplar  | A site built from a folder of records, validated in the controller — one record is broken  | `npm run eg8` · exits 1 · `--dev`                      |
| [9 · migrated from v1](9-migrated-from-v1/)         | Exemplar  | Every v1 → v2 migration recipe as running code, in a site that builds clean                | `npm run eg9` · `--dev`                                |
| [10 · asset pipeline](10-asset-pipeline/)           | Reference | `config.assets.pipeline` runs an external tool before the asset copy, `watch` in dev mode  | `npm run eg10` · `--dev`                               |

`npm run egN` runs from the repo root; from this folder the same thing is `node N-name.js`.
Examples 1–6, 8, 9 and 10 take `--dev` for a live-reloading preview; 7 builds and exits, and takes
a season slug instead. Example 8 is the only one that exits non-zero, and it does so on purpose.

## For an AI coding agent

Read `llms.txt` at the repo root first — in a project that depends on the package it ships as
`node_modules/kiss-ssg/llms.txt`, and it is the API contract these examples demonstrate. Then
copy the exemplar whose shape matches the site you are building: 7 for versioned output, 8 for
anything fed by data you do not control, 9 when you are moving a v1 project. Run that example
before you change anything, so you know what its output and its exit code are supposed to look
like; example 8's failure in particular is intended, and a run that does not report it is a
regression, not a fix. Reach for examples 1–6 to answer a narrower question — which call, which
option, which helper — rather than as a starting point for a whole site.
