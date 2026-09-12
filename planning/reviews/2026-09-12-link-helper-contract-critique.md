# Adversarial read — Amendment 2 (page identity and `{{link}}`)

Read against the code at `f3d1a15`. Nothing built yet. 24 findings: 6 blockers, 11 should-fix, 7 notes.
Every verdict below is derived from `lib/`, not from `AIKB/` or the contract.

---

## 1. Served path

**Derivation (measured, `KissPage.pageURL()`, `lib/kiss-page.js:150-160`):**

| page                                    | `pageURL()`               | `/` + collapse `index.html` |
| --------------------------------------- | ------------------------- | --------------------------- |
| root `index.hbs`                        | `index.html`              | `/`                         |
| `about.hbs`                             | `about.html`              | `/about.html`               |
| `about.hbs`, `extensionLess`            | `about/index.html`        | `/about/`                   |
| `path:'courses'`, slug `index` (either) | `courses/index.html`      | `/courses/`                 |
| `.pages()` item, `path:'blog'`          | `blog/my-post.html`       | `/blog/my-post.html`        |
| same, `extensionLess`                   | `blog/my-post/index.html` | `/blog/my-post/`            |
| `slug:'index', ext:'json', path:'data'` | `data/index.json`         | `/data/index.json`          |

`extLess` is ignored when `slug === 'index'` (`kiss-page.js:153`), so a directory index collapses to a
trailing slash on an extension-less site _and_ on an ordinary one. Every one of those seven strings is
accepted by `resolveReference` — verified by running it: `/`, `/about.html`, `/courses/`,
`/blog/my-post/` and `/data/index.json` all return `true` against a `known` set holding the
corresponding `buildTo`s. The collapse rule is sound for `.html`; see finding 3 for the non-html case.

### Finding 1 — `{{link}}` emitting a leading `/` contradicts the engine's own "the template owns the base" rule — **should-fix**

`{{asset}}` deliberately renders **no** leading slash so the template picks the base
(`lib/handlebars-helpers.js:204-206`), which is why every shared layout writes `{{root}}{{asset …}}`
(`examples/_shared/layouts/layout.hbs:16,24,34`) and why example 11 carries a per-page `root` option
(`examples/11-blog.js:86`). A root-relative `{{link}}` cannot be opened off the filesystem or served
from a project subdirectory, and it is the only kiss helper that forces a base on the author.
`resolveReference` resolves a _relative_ ref against the page's own directory (`lib/links.js:256-258`),
so L is indifferent.
**Amendment:** either emit no leading slash and document `{{root}}{{link "about"}}`, or keep the
leading slash and add `relative=true`. State the choice in the contract; today it is stated as
`/` + `pageURL()` with no acknowledgement that `root` exists.

### Finding 2 — `canonical=true` is worth having, and the stated reason for not defaulting to canonical is false — **should-fix**

See finding 5: L accepts `/about` when only `about.html` exists. So the served-path default rests
purely on host behaviour, and on a host that serves pretty URLs the site now emits two URLs per page —
`/about` in `<link rel="canonical">`, the sitemap, `llms.txt` and the feed, `/about.html` in every
`href`. The amendment's own "Why" claims the helper _closes_ the gap between the registry's one URL
join and in-page links; as written it adds a second join instead.
**Amendment:** add `{{link "about" canonical=true}}` → `toAbsoluteUrl('', toCanonicalPath(pageURL))`
(the `canonicalPathFor` arithmetic, `lib/redirects.js:37-40`), default served, and say in one sentence
that the two forms differ on a non-extension-less site and why.

### Finding 3 — `absolute=true` via `toAbsoluteUrl` emits a 404 for any `index.<ext>` page — **blocker**

`toAbsoluteUrl` strips a trailing `index` segment _with any extension_
(`lib/utils.js:145`: `/(^|\/)index(\.[^./]*)?$/`). Measured:
`toAbsoluteUrl('https://e.com','data/index.json')` → `https://e.com/data/`. The relative form of the
same link is `/data/index.json` (collapse is `index.html`-only), and `resolveReference('/data/', …)`
returns **false** — the directory candidate is `<dir>/index.html` only (`lib/links.js:267-270`). So
`{{link "x"}}` and `{{link "x" absolute=true}}` disagree, and the absolute one is both broken on the
host and reported by L.
**Amendment:** `absolute=true` is `origin + servedPath` — join `config.siteUrl`'s origin+prefix to the
already-collapsed served path by string, never re-run `toAbsoluteUrl` over the page URL. Unit-test the
`ext: 'json'`/`ext: 'xml'` index page in both forms.

### Finding 4 — a fifth URL derivation, in the one place the code says not to add one — **should-fix**

`lib/redirects.js:24-30`: "Never re-derive this arithmetic — a fourth copy that disagreed would send a
redirect to a URL the sitemap does not list." The served path is a fifth derivation, and the contract
puts it inline in the helper.
**Amendment:** `servedPathFor(pageURL)` in `lib/utils.js`, beside `toCanonicalPath`/`toAbsoluteUrl`,
with its own unit test and a docstring saying how it differs from the canonical join and why. That
also satisfies the repo rule that engine logic carries a unit test — `lib/kiss.js` is integration-only
(CLAUDE.md § Rules), and a pure derivation buried in a helper closure gets no unit coverage.

---

## 2. Default-id derivation and collisions

**Where things are known.** `view` is known synchronously at `page()` entry (`lib/kiss.js:1194-1197`).
The item slug is _not_ known until the controller has run: `_prepareMultiplePages` seeds
`slug = ${base}-${i}` (`lib/kiss.js:1127,1145`) and `applyController` may replace it
(`lib/controller-resolver.js:99-132`; example 11's `post.js` returns `slug: slugFor(model)`). The
normalised slug is known only after `KissPage`'s setter has run `toSlug`
(`lib/kiss-page.js:128-132`). **The one place both are known for both shapes is `_preparePage`, after
`prepare()` and before `this._stack.push(entry)` (`lib/kiss.js:1088-1120`)**, and a fan-out item is
distinguishable there because `item = { ...options }` keeps `dynamic: true` (`lib/kiss.js:1146`).

`.scan()` passes `view` as the path relative to `folders.pages`, posix-normalised, no `./`, folders
included — `pagePath.slice(pagesRoot.length + 1)` over `globFiles` output (`lib/kiss.js:1352-1365`,
`lib/utils.js:86-106`). So `blog/listing.hbs` → default id `blog/listing`. Correct as contracted.

### Finding 5 — derive the id from the _normalised_ slug, not `options.slug` — **should-fix**

`options.slug` is raw (`'Hello World'`, or `'blog/post-1'` from `lib/kiss.js:1127`);
`preparedPage.slug` is `toSlug`'d (measured: view `blog/post.hbs` with no controller builds to
`blog-post-1.html`). An id built from `options.slug` would not match the sugar
`{{link "blog/post" slug=post.slug}}` whenever the record's slug needs normalising.
**Amendment:** default id = `<view route>/<preparedPage.slug>`; the helper runs `toSlug` over the
`slug=` hash before joining. One derivation, stated once.

### Finding 6 — the default id ignores `path`, and this repo's own example renders one view into one folder twice — **should-fix**

`examples/9-migrated-from-v1.js:181-192` registers `view: 'shelf/item.hbs'` through **two** `.pages()`
calls. Their items differ by slug so they escape today; two fan-outs of one view into _different_
`path`s (a real shape — the same post view under `/blog/` and `/archive/`) produce distinct `buildTo`s
but identical default ids, and the contract's collision rule then withdraws the ids from both.
**Amendment:** say explicitly that a fan-out's default id is view+slug and is therefore ambiguous
across two registrations of one view; recommend an explicit `id` prefix on the registration for that
shape, and add it to the `.pages()` docs.

### Finding 7 — "versioned outputs" does not exercise the rule the rule was written for — **note**

`examples/7-versioned-outputs.js` builds one `Kiss` per season (`folders.build: seasonDir`) and its
archive index is an **inline** view, which the contract gives no default id. No registry in that
example holds one view twice. The only real instance in the repo is example 11's pagination loop
(`examples/11-blog.js:76-104`), which E' is about to give explicit ids anyway.
**Amendment:** drop "versioned outputs" from the justification; keep pagination, and add a regression
test that pins the withdraw-and-notice behaviour, since no example will exercise it after E'.

### Finding 8 — explicit-vs-default collision is undefined — **blocker**

The rule covers explicit⊕explicit (fail) and default⊕default (withdraw both). It says nothing about an
explicit `id: 'blog'` colliding with the default id of `blog.hbs` — the exact shape E' creates
(explicit ids `blog`, `blog/page/2` alongside default ids from `blog/*.hbs`). Left undefined, the
lookup silently resolves first-registered-wins.
**Amendment:** explicit wins, the default withdraws with a notice naming both pages. Deterministic,
fixable by naming one page, and consistent with "a record's own `id` wins".

### Finding 9 — a default id must be resolved lazily, not stamped at push time — **blocker**

`_preparePage` pushes entries one at a time (`lib/kiss.js:1120`) and pages can be registered after a
render pass has begun (finding 12). If the default id is written onto the entry when it is pushed, the
first page keeps its id until the colliding second page arrives — and any page rendered in between
links it successfully. "Neither gets a default id" is only true of a lookup computed over the whole
stack at call time.
**Amendment:** the lookup resolves ids against the live stack on each call (a Map invalidated by
`_preparePage` and by `_replay()`), never a field frozen at registration.

### Finding 10 — the registration's `id` must be deleted on a fan-out, and `generate:false` needs a stance — **should-fix**

`aliases` is deleted from the spread item at `lib/kiss.js:1159`; `id` needs the same line, or every
item of a fan-out claims the one explicit id and the build fails on item 2. Separately, the duplicate-
`buildTo` check deliberately exempts `generate: false` pages (`lib/kiss.js:1092-1095`); the contract
should say whether the id check does too.
**Amendment:** `delete item.id` beside `delete item.aliases`, promoted from the record like `slug`; and
state that a `generate: false` page claims no id (it cannot be linked anyway).

---

## 3. Helper access to the registry

**Verdict: a closure over the instance, supplied at registration — as contracted — but it must be a
function, not a snapshot.** Existing helpers read page data two ways: `options.data.root` (the page's
options object, which `KissPage` renders as the root context, `lib/kiss-page.js:198-200`) and closures
over `config`/`assets` captured at registration (`lib/handlebars-helpers.js:22-26,103-117,187-216`).
`registerHandlebarsHelpers` is called **once**, in the constructor (`lib/kiss.js:449-453`), and is
never re-run — not by `_replay()`. `options.data.root.view` and `options.data.kissPage` are both
available for the error message (verified by running a throwing helper: see finding 13).

### Finding 11 — `_replay()` replaces `_stack` with a new array; any captured registry is stale for the rest of the session — **blocker**

`lib/kiss.js:1810`: `this._stack = []`. A helper closing over the array value, or over a Map built at
registration, serves the first build's registry to every watch rebuild forever.
**Amendment:** pass `{ pages: () => this._stack }` (or `lookupPage: (id) => …` bound to the instance);
if an index is memoised, add `_idIndex = null` to the `_replay()` reset list beside `_report`,
`_sitemapPath`, `_llmsPath`, `_feedPath` (`lib/kiss.js:1815-1830`) and invalidate it in
`_preparePage`. The contract's `_replay()` reset list omits it entirely.

### Finding 12 — "`.generate()` guarantees the whole stack" is true only for pages registered before that call, and the failure for later ones is a _race_, not a rule — **blocker**

`generate()` captures `Promise.all(this._promises)` synchronously at call time
(`lib/kiss.js:1518`), then iterates `this._stack` inside the `.then` (`lib/kiss.js:1521`). Measured on
this tree:

- `page(A); generate(); page(B); page(C)` → A's render **sees B and C** (their model chains resolved
  in microtasks before generate's `.then` ran).
- the same shape with the later registration deferred by one macrotask → A's render **does not see it**,
  and the page is still built, by `_generatePending()` in `_settle` (`lib/kiss.js:1447-1479`).

So a `{{link}}` to a late-registered page succeeds or fails depending on whether the target's model
resolved synchronously — it will pass in development with a `.json` model and fail the day it becomes
a URL model.
**Amendment:** state the guarantee as "any page registered before the first `.generate()` call"; say
that a page registered afterwards (in a callback, or after `.generate()` in the chain) is
**order-dependent and unsupported**, not "fails loud"; and pin both behaviours in tests. Consider a
one-line notice when `_generatePending()` renders a page in a second pass on a site that uses `{{link}}`.

---

## 4. A helper that throws

**Verdict: everything the contract assumes is true.** Verified by running a throwing helper against a
two-page site:

```
MSG:      1 page(s) failed to build: ./public/index.html
FAILURES: [['index.hbs', './public/index.html', 'link: no page with id "about" (asked by index.hbs / ./public/index.html)']]
PAGES:    [{"view":"index.hbs","buildTo":"./public/index.html","ok":false,"hash":null}, {…"two.html","ok":true,"hash":"9759…"}]
index.html exists: false
```

`hash`/`links` are cleared before the attempt (`lib/kiss-page.js:188-189`), the throw happens before
`fs.outputFile` (`lib/kiss-page.js:244`), the catch logs `error.message` and rethrows
(`lib/kiss-page.js:276-283`), `generate()` records `{view, buildTo, error}` (`lib/kiss.js:1526-1533`),
and `complete()` rejects with an `AggregateError` carrying `err.failures` and `err.errors`
(`lib/kiss.js:1587-1603`). The top-level message names paths only — the helper's message survives on
`err.failures[i].error.message`, `err.errors[i]` and `report.failures[i].message`
(`lib/build-report.js:218-224`). L still ran on the failed build and printed
`Links: 0 internal references, none broken`.

### Finding 13 — under `watch`, the same throw is swallowed — **should-fix**

`_rebuild` is `entry.page.generate().catch(() => {})` (`lib/kiss.js:1995`): no failure entry, no
report, and live reload fires anyway. The stale HTML stays on disk because the write never happened,
so the browser reloads to the _old_ page while only a log line says why.
**Amendment:** say what dev does. Minimum: keep the throw but make `_rebuild` log a notice naming the
page; or have the helper degrade to a warning plus a `#` href in `config.dev` (the `{{asset}}` stance,
`lib/handlebars-helpers.js:198-202`) and stay fatal in a real build.

### Finding 14 — "a link is a promise" inverts the branch's own no-exit-code-change rule — **note**

The plan's non-goals say "No exit-code change for any finding" and L is advisory by construction. A
typo'd id is the same class of mistake as a typo'd href, and `{{link}}` makes it exit 1 while the
hand-written form exits 0. That may be the right call, but it is a reversal and is not argued.
**Amendment:** one sentence saying why an unresolvable _identity_ is fatal where an unresolvable
_path_ is advisory. Also note the interaction with `kiss-page-add`'s advice to retire a page with
`generate: false` (see finding 24) — that advice becomes a build-breaker.

---

## 5. Interplay with L

**(a) Every served path L accepts — verified.** Measured with `exists: () => false` and a `known` set:
`/` → `index.html` true (`lib/links.js:267-270`, `rel === ''` is the directory case); `/courses/` →
`courses/index.html` true on a non-extension-less site; `/about.html`, `/blog/my-post/`,
`/data/index.json` true. **Caveat:** `known` in `_checkLinks` holds only pages with `hash !== null`
(`lib/kiss.js:910-920`), so "a site built entirely on `{{link}}` reports `broken: []`" is true only
when every page rendered; one failed page makes every `{{link}}` to it a broken finding on every
linking page.
**Amendment:** add the qualifier.

### Finding 15 — claim (b) is false: L does **not** call `/about` broken when only `about.html` exists — **blocker**

`resolveReference` always tries both extension-less fallbacks; `extensionLess` only orders them
(`lib/links.js:272-277`, and the JSDoc at `lib/links.js:234-236`: "it orders the two extension-less
fallbacks and nothing else — both are always tried"). Measured: `resolveReference('/about', {…,
extensionLess: false, known: {'about.html'}})` → **true**.
**Amendment:** delete the (b) justification. The served-path default stands on host behaviour alone
(finding 2), and the sentence as written will be copied into `AIKB/links.md` and `llms.txt` as a false
claim about the checker.

**(c) `absolute=true` is classified internal — verified, for both `siteUrl` shapes.**
`classifyReference` compares `url.origin` and strips a path prefix with trailing slashes normalised
(`lib/links.js:193-209`). Measured: `https://e.com/docs/about.html` with `siteUrl:
'https://e.com/docs'` → `{kind:'internal', path:'/about.html'}`; `https://e.com/about.html` with
`siteUrl: 'https://e.com/'` → same. The prefixed home case (`https://e.com/docs/`) reduces to `/` and
resolves to `index.html`. The integration test the contract asks for is worth having; **but see
finding 3** — it must cover an `index.<ext>` page or it will pass over the one shape that is broken.

**(d) Watch — verified.** A scoped re-render renders the same `KissPage` objects while `_stack` is
untouched (`lib/kiss.js:1994-1996`), so the registry is identical. A slug change reaches the build only
through the build script (watcher `rebuildSite` → `_requestReplay`), a model file, or a controller —
none of which has a stack entry whose `view` matches, so `_handleChange` falls through to
`matches.length === 0` → replay (`lib/kiss.js:2060-2066`). Claim (d) holds as stated.

### Finding 16 — (e): `checked` cannot count the helper's output, because references are deduplicated per page — **should-fix**

`extractReferences` returns a `Set` (`lib/links.js:119-141`). A page that renders `{{link "about"}}`
three times, or once beside a hand-written `/about.html`, contributes **one** reference. The contract's
"the examples test asserts that `links.checked` counts the helper's output" cannot be satisfied by a
count — example 11 already asserts `checked > 0` (`test/integration/examples.test.js:341`).
**Amendment:** assert something only the helper can produce — e.g. that the served path of a page whose
slug lives only in a model appears in `broken` when the model is edited in a fixture, or simply that
`checked` equals a pinned number for the clean build. No mis-attribution risk exists otherwise:
`broken.page` is the page that wrote the reference (`lib/links.js:350`), and `{{link}}` in a partial is
attributed to the rendering page, which is already how L behaves.

---

## 6. Moved

**What the record carries today.** `BuildPage` is `{view, buildTo, ok, hash}` — no `id`
(`lib/build-report.js:202-216`, typedef `:9-13`). `redirectFindings` receives the previous _report_
whole and reads `previousPages.buildDir` + `pages[]` (`lib/redirects.js:192-205`); this build's side is
`currentPages: [{buildTo}]` (`lib/kiss.js:1036-1038`) — it must start carrying `id`.

**"Old path not covered by an alias" is _not_ a like-for-like comparison.** `removed` compares
build-relative paths on both sides (`lib/redirects.js:136-141,199-200`) — good — but the alias test
reduces the old path to its **canonical** form first (`lib/redirects.js:203`:
`fromSet.has(toAbsoluteUrl('', toCanonicalPath(rel)))`). An alias written as `/old-slug.html` therefore
does **not** suppress the finding.

### Finding 17 — `moved` must reuse that exact predicate, or the two findings will disagree about one page — **should-fix**

**Amendment:** extract `coveredByAlias(rel, fromSet)` in `lib/redirects.js` and call it from both
loops; document that an alias is matched in canonical form.

### Finding 18 — `id: null` means both "no id" and "a record from before ids"; pairing must skip nulls on both sides — **blocker**

After **I** lands, a page with a withdrawn default id or an inline view legitimately reports
`id: null`. A record written before ids has no key at all. Pairing null-to-null would pair every
idless page with every other.
**Amendment:** pair only on a non-empty string id present on both sides; everything else degrades to
today's path comparison. Also note the consequence for the branch's stated purpose: a fan-out item's
default id **embeds its slug** (`blog/post/<slug>`), so the commonest rename — a post slug change,
exactly what example 11's alias demonstrates — changes the id too and `moved` will not fire. `moved`
is only useful for pages with an **explicit** id. Say so, and give example 11's renamed post an
explicit `id` in its record so E' actually demonstrates M.

### Finding 19 — yes, `moved` must suppress `removed`, and the `null` short-circuit must learn about it — **should-fix**

Without it the old path satisfies both loops and the operator gets two notices for one event.
**Amendment:** compute the moved pairs first, then `continue` in the `removed` loop
(`lib/redirects.js:200`) for any previous path whose id matched a current page. And
`lib/kiss.js:1044` — `if (rules.length === 0 && removed.length === 0) return null` — must gain
`&& moved.length === 0`, or a site with no aliases will never report a move. `lib/build-report.js:265-271`
builds the `redirects` object key-by-key, so `moved` must be added there too or it is silently dropped
from the report and from `last-build.json`.

---

## 7. Report and map key order

### Finding 20 — the tests that break are not only key-order tests — **should-fix**

- `test/unit/build-report.test.js:43-48` pins `Object.keys(report.pages[0])` exactly.
- `test/unit/build-report.test.js:51-58`, `:82-94` assert whole page objects with `toEqual` — adding
  `id` breaks these regardless of order. (`:306-334` map to `p.hash` and survive.)
- `test/integration/aikb.test.js:183-199` asserts whole `site-map.json` page rows with `toEqual`.
- `test/unit/aikb.test.js:835-851` pins the `lastBuildRecord` key list — unaffected by a _page-row_
  key, but its comment ("example 9 is re-recorded whenever this list grows") is the one to follow.

**Amendment:** list these four sites in the I beat, not "key-order tests rewritten relative".

### Finding 21 — the map table copes; the recorded exemplars do not — **note**

`table()` computes widths generically (`lib/aikb.js:627-637`), so an `Id` column pads correctly and
stays prettier-clean; `.md` under `examples/*/AIKB/` **is** prettier-checked (only `*.json` is ignored,
`.prettierignore`). Use the module's `NONE` (`lib/aikb.js:110`, `'none'`) for a page with no id, as the
Model/Controller columns do. Adding `id` changes `site-map.json`, `site-map.md` and `last-build.json`
for **both** recorded examples, and `test/integration/examples.test.js:240-289` and `:357-392` re-record
and byte-compare — so example 9 and example 11 must be re-recorded **in the same commit as I**, not at
the end of E'. Also: `lib/aikb.js`'s `SiteMapPage` typedef (`:30-40`) and `llms.txt:263` (which
enumerates the Pages columns in prose) both need the new column.

---

## 8. Watch mode

**Verdict: a scoped re-render is safe; a replay is not, unless the lookup is a function.** See
findings 11 (stale registry after `_replay()`, `lib/kiss.js:1810`) and 13 (swallowed failure,
`lib/kiss.js:1995`). One extra fact in the helper's favour: `pageURL()` is independent of `buildDir`
(`lib/kiss-page.js:150-160`), so a served path computed during an atomic build survives `_promote()`'s
rewrite of every `entry.buildTo` (`lib/kiss.js:748-752`) unchanged.

---

## 9. What the contract forgot

### Finding 22 — E' cannot do what it says, in three places — **blocker**

1. **The nav is not example 11's to change.** It lives in the _shared_ layout
   (`examples/_shared/layouts/layout.hbs:24,33-34`, `{{root}}{{href}}` over `config.nav`), which
   examples 4–11 all render. Rewriting it with `{{link}}` changes every other example.
2. **The feed `<link>` cannot be a `{{link}}`.** `examples/11-blog/partials/head-feed.hbs:5` points at
   `/feed.xml`, which `.feed()` writes and which has no stack entry — the helper's registry is the page
   stack. RSS autodiscovery wants an absolute URL anyway: `{{absUrl "feed.xml"}}`.
3. **Post cards and tag links are model data, not template hrefs.** `urlFor`
   (`examples/11-blog/controllers/post.js:27`) is baked into `summaryCard` (`:69-77`) and into the post
   page's model (`:101`), and `tagUrl` likewise (`controllers/tag.js:9`); the partials render
   `href="{{url}}"` (`partials/post-card.hbs:5,8`). Pagination prev/next are computed in the build
   script (`examples/11-blog.js:69`). Converting these to `{{link}}` rewrites both controllers and the
   build script.
   **Consequence the contract misses:** both controllers are AIKB _subjects_ with committed
   `subject-hash:` stamps (`examples/11-blog/AIKB/notes/controllers/post.md:2`, `tag.md:2`). Editing
   them makes the stamps stale, which `_buildAikb` reports as `notes.stale` and
   `test/integration/examples.test.js:370-386` asserts empty. The note prose also asserts "`urlFor` is
   the single derivation of a post's URL", which would become false.

**Amendment:** scope E' to example 11's own views and partials; keep the nav, the feed link and the
model-derived card URLs as they are, or state plainly that the two controllers and their notes are
rewritten and re-stamped as part of E'.

### Finding 23 — no test enumerates the helpers, so nothing catches a missed doc — **should-fix**

`test/aikb.test.js` only checks the AIKB template headings, the CLAUDE.md table, `llms.txt` naming each
public **method**, and the config blocks (`:51-110`). `test/unit/handlebars-helpers.test.js` tests
behaviour, not the roster. The stale strings a missed update leaves behind:
`AIKB/handlebars-helpers.md:5` and `:9` ("all ten helpers"), `llms.txt:24` (the helper list),
`llms.txt` § Helpers (a `link` entry beside `absUrl`/`asset`, `:117-120`), `README.md:729` § Helpers,
`README.md:294` § .page() (the `id` option), `README.md:534` § Redirects (`moved`), `README.md:599`
§ Checking a build.
**Amendment:** add a doc test that every `hbs.registerHelper` name in `lib/handlebars-helpers.js`
appears in `llms.txt` and `AIKB/handlebars-helpers.md` — cheap, and it is the same net the public-method
test already provides.

### Finding 24 — the rest of the surface the contract does not name — **note**

- `PageOptionsKnown` (`lib/kiss.js:59-79`) gains `id`; `PageOptionsPatch` (`:101`) already allows a
  controller to return one — say whether a controller-returned `id` is "explicit" (it is).
- `types/kiss.d.ts`, `types/build-report.d.ts`, `types/handlebars-helpers.d.ts`, `types/redirects.d.ts`,
  `types/aikb.d.ts` all move; `npm run types` and `test/unit/types.test.js` (types are byte-compared,
  `.prettierignore`).
- `registerHandlebarsHelpers`'s signature gains a dep (`lib/handlebars-helpers.js:22-26`) — its JSDoc
  lists the helper names in the first line and `AIKB/handlebars-helpers.md` documents the signature.
- `plugins/kiss-ssg/skills/kiss-page-add/SKILL.md` § 4 talks about output-path collisions and
  recommends retiring a page with `generate: false` — with `{{link}}` that now fails every linking
  page's render (finding 14). It should gain the id collision, the `{{link}}` habit, and that warning.
  `kiss-build-check`, `kiss-branch-close` and `kiss-site-brief` are already listed for the `moved` line.
- `llms.txt:248` (§ redirects prose) needs `moved`; `llms.txt:246` (§ links) needs one sentence on how
  `{{link}}` and L relate — and it must not repeat the false claim in finding 15.
- No new `lib/` module, so **no CLAUDE.md table row** is needed — but if `servedPathFor` lands in
  `lib/utils.js` (finding 4), `AIKB/utils.md` is on the list and the contract does not name it.
