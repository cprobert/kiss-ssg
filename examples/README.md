# kiss-ssg examples

Eleven runnable sites, all in one theme — Aster & Oak, a fictional Bristol roastery. **Each one is
a standalone project you can copy wholesale**: `router.js` at its root, everything it renders under
`src/`, its own copy of the layout and stylesheet, and its output in its own gitignored `public/`.

**These are written for an agent reading them as reference while building a site for somebody
else**, so copying one has to actually work. That means an example carries nothing that only makes
sense inside this repository: every one imports the engine as `import Kiss from 'kiss-ssg'`, the
way a consuming project does, and none of them reaches outside its own folder. They used to share a
`_shared/` theme and build into a single repo-root `public/`, which made each router carry a
relative import, an escaping build path and a `folders` block no real project would write — and an
agent copying the first line got a path that did not exist. The duplicated layout is the price of
that, and it is worth paying.

Most of them configure **no folders at all**. `src: './src'` and `build: './public'` are the
defaults, so a site laid out the ordinary way says nothing about folders; the ones that do name a
folder are demonstrating a reason to (a versioned build target, a knowledge base beside the source).
That is the convention-first design in `CLAUDE.md` doing its job, and it is the first thing an
example should teach.

You run one from its own directory (`cd 3-pages && node router`), exactly as you would run the site
you are about to build. Two things vary across the set, and both are labelled — the
kiss-ssg **feature** each one demonstrates, and the **router shape** it has grown into. The second
is the subject of `llms.txt` § The build script, and the table below indexes it, because an agent
arrives at one example rather than reading the set in order.

They come in two tiers.

**Examples 1–6 and 10 are the feature reference: one idea each.** Scanning a folder of views,
registering a page by hand, fanning out over an array, layouts and partials, the built-in
helpers, the sitemap and llms.txt, an external tool in the asset pipeline. Each script is short enough to read in one sitting and each page explains,
in a "How this example works" panel, the feature it is demonstrating — with the script that built
it printed underneath. Read one when you want to know how a single thing works.

**Examples 7–9 and 11 are exemplars: whole sites to copy by shape.** They are not about one
feature; they are about a situation you will recognise — publishing a new edition beside the old
ones, building a site from a data feed that is sometimes wrong, migrating a v1 project, running
a blog. Each is deliberate about the things that shape gets wrong, and the comments in the
script name what to copy and why. Start from the one whose situation matches yours rather than
assembling it from the feature reference.

| Example                                             | Tier      | Router shape | What it shows                                                                                                     | Run                                                    |
| --------------------------------------------------- | --------- | ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| [1 · scan](1-scan/)                                 | Reference | tier 0       | `.scan()` registers every view under `pages/`, matching models and controllers by filename                        | `npm run eg1` · `--dev`                                |
| [2 · page](2-page/)                                 | Reference | tier 0       | `.page()` four ways: matched, explicit, object model with `ext`, and a template string                            | `npm run eg2` · `--dev`                                |
| [3 · pages](3-pages/)                               | Reference | tier 0       | `.pages()` fans out one page per JSON file; the index reuses the same resolved array                              | `npm run eg3` · `--dev`                                |
| [4 · layouts and partials](4-layouts-and-partials/) | Reference | tier 0       | One layout, blocks and content, nested `.hbs`/`.html`/`.md` partials, a dynamic partial                           | `npm run eg4` · `--dev`                                |
| [5 · helpers](5-helpers/)                           | Reference | tier 0       | The six built-in helpers, all on one page, plus custom dev ports                                                  | `npm run eg5` · `--dev`                                |
| [6 · sitemap and llms.txt](6-sitemap/)              | Reference | tier 0       | `.sitemap()` and `.llms()` with `siteUrl`, per-page tuning, `extensionLess`, hashed assets                        | `npm run eg6` · `--dev`                                |
| [7 · versioned outputs](7-versioned-outputs/)       | Exemplar  | tier 0       | One build per season into its own folder, atomically, with an archive index beside them                           | `npm run eg7` · `node 7-versioned-outputs.js <season>` |
| [8 · data-fed site](8-data-fed-site/)               | Exemplar  | tier 0       | A site built from a folder of records, validated in the controller — one record is broken                         | `npm run eg8` · exits 1 · `--dev`                      |
| [9 · migrated from v1](9-migrated-from-v1/)         | Exemplar  | **tier 1** ¹ | Every v1 → v2 migration recipe as running code, in a site that builds clean; ships a recorded `AIKB/`             | `npm run eg9` · `--dev`                                |
| [10 · asset pipeline](10-asset-pipeline/)           | Reference | tier 0       | `config.assets.pipeline` runs an external tool before the asset copy, `watch` in dev mode                         | `npm run eg10` · `--dev`                               |
| [11 · blog](11-blog/)                               | Exemplar  | **tier 2** ² | Posts as a fan-out, pagination, tag pages, `.feed()`, a rename's `aliases`, links by `{{link}}`; recorded `AIKB/` | `npm run eg11` · `--broken` · `--dev`                  |

¹ Example 9 registers exactly one custom helper, and therefore has a `helpers/` folder. One is the
trigger: a helper inside `router.js` cannot be imported and so cannot be tested, which is as true
of the first as of the fourth.
² Example 11 has a `config/` folder because its name appears in the feed, in `llms.txt` and in the
markup. That trigger is **duplication**, not file length, and it is independent of the helper one —
which is why example 11 has `config/` and no `helpers/` (it registers none), while example 9 has
`helpers/` and no `config/`. The tiers are not stages to pass through in order.

`npm run egN` runs from the repo root; from this folder the same thing is `cd N-name && node
router`. Each router's own header states its tier and why it is there.
Examples 1–6 and 8–11 take `--dev` for a live-reloading preview; 7 builds and exits, and takes a
season slug instead. Example 8 is the only one that exits non-zero, and it does so on purpose;
example 11 takes `--broken`, which adds one broken link — a finding, not a failure, so that run
still exits 0 and only `npx kiss-ssg check` reports it.

## For an AI coding agent

Read `llms.txt` at the repo root first — in a project that depends on the package it ships as
`node_modules/kiss-ssg/llms.txt`, and it is the API contract these examples demonstrate. Then
copy the exemplar whose shape matches the site you are building: 7 for versioned output, 8 for
anything fed by data you do not control, 9 when you are moving a v1 project, 11 for anything
with posts in it — a blog, a news section, a changelog. Run that example
before you change anything, so you know what its output and its exit code are supposed to look
like; example 8's failure in particular is intended, and a run that does not report it is a
regression, not a fix. Example 9 also ships a committed `9-migrated-from-v1/AIKB/` — the folder
`npx kiss-ssg aikb 9-migrated-from-v1.js` records, and one authored note beside it — so you can
see what a site's knowledge base looks like before you record one of your own; example 11 ships
the same folder with two notes in it, which is what one looks like once a site has more than one
subject worth explaining. Reach for
examples 1–6 to answer a narrower question — which call, which option, which helper — rather than as a
starting point for a whole site.
