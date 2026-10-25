# Learning packages

Zipping pages into IMS content packages and SCORM 1.2 packages for Moodle or any LMS: membership, what a package carries, two ways to build a lesson, and recording answers through the SCORM bridge.

A page that names a `package` is zipped into a learning package that a learning management system (Moodle, or any LMS that reads IMS content packages or SCORM 1.2) imports. kiss owns the format: which pages are in a package, the files they need, the manifest, the zip and, for SCORM, the connection to the LMS. Your site owns the course: its lessons, how a learner moves through them, and what it records. `examples/13-course-packages` (`npm run eg13`) builds both shapes below.

```js
const kiss = new Kiss({
  packages: {
    format: ['imscp', 'scorm12'],
    title: (id, pages) => pages[0].model.lesson,
  },
})
kiss.page({
  view: 'espresso/grind.hbs',
  id: 'espresso-grind',
  package: 'espresso-basics',
  model: { lesson: 'Espresso basics' },
})
```

**A member page, and its layout.** Nothing in a member page is special but its links: they are relative, so the page works wherever the LMS unpacks the zip.

```hbs
{{! src/layouts/lesson.hbs }}

<html lang='en'>
  <head>
    <meta charset='utf-8' />
    <title>{{title}}</title>
    <link rel='stylesheet' href='{{root}}{{asset "css/course.css"}}' />
    {{scormBridge complete=complete}}
  </head>
  <body><main>{{#block 'body'}}{{/block}}</main></body>
</html>
```

```hbs
{{! src/pages/espresso/grind.hbs: one folder down, so root climbs one level }}
{{#extend 'lesson' root='../'}}
  {{#content 'body'}}<h1>The grind</h1><p>…</p>{{/content}}
{{/extend}}
```

`root` and `complete` are values the page passes in its `{{#extend}}` hash, and the layout reads as `{{root}}` and `complete=complete`. kiss does not set `root`: a page that leaves it out gets an empty string, and its stylesheet link is then right only at the build root. Give every member page its climb back to the build root (`""`, `"../"`, `"../../"`). A page that records its own completion passes `complete="manual"` the same way.

**A page joins a package by naming it**, `package: '<id>'`, a lowercase slug (`espresso-basics`). Every page that names the same id is in that package, in the order the pages were registered. `packageSection: 'Part 1'` groups a page under a heading in the LMS's table of contents. Each zip is written to `<dir>/<id>.<format>.zip`, at the end of `complete()`, beside the pages; a dev build writes none, with one notice.

**A member page needs an `id`, and the id is a promise.** The LMS keeps a learner's record against the identifier kiss makes from the page's `id`, and matches the pages of a new upload to the old by it: change the id and the learner's progress on that page is gone. So the identifier depends on the id alone, never on the page's path or position, and a member page with no usable id fails the build. An id that is already a valid XML name (`espresso-grind`) is used as it is; any other (`espresso/grind`) is cleaned and given a short hash of itself, so two ids never share an identifier.

**`config.packages`** (`false` turns packaging off; any value but settings, `true` or `false` fails, so `packages: 'scorm12'` is not a shorthand — write `packages: { format: 'scorm12' }`):

| Key | Default | What it does |
| --- | --- | --- |
| `format` | `'imscp'` | `'imscp'`, `'scorm12'`, or both as an array: each package is written once per format, from the same pages |
| `dir` | `'packages'` | The folder in the build the zips go in |
| `title` | `null` | `(id, pages) => string`, the package's title in the LMS; `pages` are `{ id, title, options, model }`. Default: the first page's title |
| `only` | `null` | A list of package ids to write; the rest are skipped, and an id that names no package is a notice |
| `schemas` | `false` | `true` puts the SCORM 1.2 schema files (`imscp_rootv1p1p2.xsd`, `adlcp_rootv1p2.xsd`, `ims_xml.xsd`) at the root of each SCORM 1.2 package and names them in its manifest, for an LMS or conformance checker that wants them. Moodle does not. kiss's tests validate every SCORM 1.2 manifest it writes against these files |

**A site of packages only gets three audit findings that do not apply to it**: `og-image-missing`, `favicon-missing` and `not-found-missing`. An LMS opens the pages; nobody shares them, sees them in a browser tab or types their URL wrong. Turn the three off, with the reason in a comment: `audit: { ignore: ['og-image-missing', 'favicon-missing', 'not-found-missing'] }` (§ Checking a build). `examples/13-course-packages` does.

**A package carries what its pages need, and nothing else.** Each member page's resource in the manifest lists every file that page needs, so a stylesheet two pages share is listed on both, and is in the zip once. kiss follows each page's stylesheets (and their `url()` and `@import`), images (`src`, `srcset`, `poster`, SVG `use`), icons, inline `style` and `<style>`, and embedded pages (`iframe`, `object`, `embed`, read like a page), and roots the zip at the deepest folder that holds all of it, so a shared `assets/` folder above the lessons is inside. It packs only files this build wrote, so a stale file in the build folder can never get in. A link (`<a>`) to another member page is kept; it is not followed. A link to a file that is not a page (a PDF handout, a worksheet) is a download, and packed like an image. What a package cannot carry is reported in `report().packages[].outside`, each with its reason, and left out:

-   a root-relative URL (`/css/site.css`): an LMS serves a package from wherever it unpacks it, not from a site root;
-   a link to a page that is not in the package, or a folder or extension-less link, which an LMS does not resolve to an `index.html`;
-   an absolute URL to your own site, or an absolute `<base href>`;
-   a reference whose capitals and small letters differ from the file's (`img/App.png` for `img/app.png`): Windows and macOS find the file, an LMS server does not;
-   a file this build did not write. A pipeline step that writes into the build folder declares the file in its `outputs` (§ An asset pipeline).

Write a member page's asset URLs relative to the page (`{{root}}{{asset 'css/site.css'}}`, as `root` is used in the examples) and link its pages with `{{link}}`, which on a member page renders the file relative to it (§ Link to a page by its identity), and its package is complete.

**The same pages give the same bytes.** Every entry is stored, not compressed, with fixed dates, in a fixed order, so a rebuild of an unchanged lesson writes an identical zip, and `report().packages[].hash` tells you which packages changed and need uploading again. `kiss-ssg check` lists them for you, against the last recorded build or `--against` a report you kept (§ Checking a build).

**What the build tells you.** The build log prints a `Package:` line for each zip it wrote, with its title, pages and files, and a `package outside:` notice for each reference a package left out. `report().packages` is a list of `{ id, format, file, title, hash, pages, files, bytes, outside }`: `file` the zip, `pages` the member pages' output paths in table-of-contents order, `files` the number of entries in the zip (its manifest included), `bytes` its size (for an LMS's upload limit), and `outside` a list of `{ page, href, reason }`. It is `null` when the build wrote no package: packaging is off, no page names a package, or the build failed.

## Two ways to build a lesson

**One SCO per page.** Each member page is a SCO: the LMS tracks each one, and its table of contents is the navigation. Do not link the pages to each other: a link from one SCO to another opens the second inside the first, so the report lists any such link for a SCORM package. This suits a lesson of a few pages a learner reads in order.

**One SCO, many views.** The lesson is one page, whose own navigation shows one view at a time, each with its own address (`#steaming`), so the browser's back button works: a lesson overview, a topic, a tab of a topic. It is one SCO, so one session and one attempt in the LMS, and every answer the page records lands in it. Hide the LMS's own table of contents (it has one item) and the lesson has the whole window. This suits a lesson with its own structure, such as topic cards that open tabbed topics.

The views, the navigation between them and any question are your page's own markup and script: kiss gives you the bridge, not the course. `examples/13-course-packages/src/pages/milk/index.hbs` is a short working version to start from: sections marked `data-view`, a `hashchange` handler that shows one of them, links between them by `#name`, and a question that records its answer, a score and completion through `window.kissScorm`.

## SCORM: `{{scormBridge}}` and `window.kissScorm`

Put `{{scormBridge}}` in each member page's `<head>`. It inlines one small script (see § Helpers) that finds the LMS, starts the session, and marks the page complete when it is seen; `{{scormBridge complete="manual"}}` leaves completion to the page, and starts a new attempt as `incomplete`, because an LMS may record a status the page never set as completed when the session ends: a learner who leaves before the page calls `kissScorm.status('completed')` is not counted as done. It finishes the session when the learner leaves, and keeps it open if the browser keeps the page for its back button; the time the page spends there is not counted as session time. With no LMS (on the web, in an IMS content package) every call does nothing, so the same page works everywhere, byte for byte.

The page's own script records through `window.kissScorm`:

```js
kissScorm.interaction({
  id: 'milk.pouring.1',
  response: 2,
  correct: 1,
  result: false,
}) // one answer: options by index (0 is a)
kissScorm.score(0.5) // a fraction, recorded as 50 out of 100
kissScorm.status('completed') // or 'passed', 'failed', 'incomplete', 'browsed'
kissScorm.available // true while a session with an LMS is open
```

**A question with more than one right option.** `correct: [0, 2]` means the learner must pick _all_ of them, in any order: SCORM 1.2 records it as the set `{a,c}`. Where any one of several answers is right, list the alternatives: `correct: { anyOf: [1, 3] }` records `b` and `d` as two correct patterns, and an alternative can itself be a set (`{ anyOf: [1, [0, 2]] }`). The learner's own `response: [2, 0]` is what they picked, as `c,a`.

**Bookmark and resume.** A learner who leaves can come back where they were. `kissScorm.bookmark(place)` records where the learner is (at most 255 characters, such as the view's address); `kissScorm.save(state)` records what the page needs to rebuild their progress (printable ASCII, at most 4,096 bytes: SCORM 1.2's one `suspend_data` field). The first of either also tells the LMS to resume the learner next time, and a resumed learner stays resumable even when they leave without saving again. On that next launch, `kissScorm.resumed` is `{ location, state }`; on a first launch, or off an LMS, it is `null`. A field the LMS failed to return is `null` too (unknown, as distinct from `''`, saved empty), and both are when it fails to say whether the learner is resuming at all, and the bridge does not let a bookmark or state the page queued before it was ready overwrite it. A value too long, or state that is not printable ASCII, is refused (`false`), never cut short: half a state is a corrupt one. Both are committed to the LMS a couple of seconds after they are written (a burst of them once), not left to the moment the learner leaves, when a browser may block the LMS's last request. A commit the LMS refuses is tried again a few times, and if the LMS ends the session underneath the page, the bridge starts it again and writes back everything not yet committed. One case it cannot recover: in Moodle, a commit whose request fails in transit is forgotten, because Moodle's next commit sends only what has changed since the failed one (`AIKB/upstream.md` in the package has the detail). The learner's next bookmark or save sends their new place. Keep state small: what cannot be rebuilt from the page (which questions were answered, how), not titles or text the page already has.

**Wait for the bridge before you read `resumed` or keep a place.** When the LMS opens the page inside a page of its own that is still loading, the bridge waits for that page before it decides, and until then `resumed` is `null`. `kissScorm.ready(fn)` calls `fn(kissScorm)` once the bridge has decided: at once, usually, and also with no LMS (`available` is then `false`), so one code path serves the web and the LMS. It also returns a promise of the same object (`await kissScorm.ready()`). A bookmark or state a page sends before then, while the learner turns out to be resuming, is dropped rather than overwriting the place they left.

**One page records for a SCO.** The bridge is built for one kiss page per SCO doing the recording, with any kiss page it embeds (an `<iframe>` of another member page) recording through it, from inside `kissScorm.ready(…)`. Two kiss pages that each record into one SCO's session from separate frames (siblings under a wrapper page, or a page and a pop-up it opens) are not supported: which page's writes land last is not guaranteed, and a second page may fail to start the session at all. If a lesson needs several pages, make each its own SCO, which is what a package's member pages already are.

```js
kissScorm.ready((scorm) => {
  const back = scorm.resumed
  if (back && back.location && !location.hash)
    location.replace(`#${back.location}`)
  addEventListener('hashchange', () => scorm.bookmark(location.hash.slice(1)))
})
```

**Modes.** `kissScorm.mode` is the LMS's launch mode: `'normal'`, `'browse'` (a preview: the page is not marked complete when seen) or `'review'` (a learner looking back at a finished attempt: nothing is recorded, though `available` is true), and `null` off an LMS. The bridge also commits, without finishing, whenever the page is hidden (a phone switching apps, a tab sent to the background), so a learner who never comes back still has their answers saved.

**When tracking does not work.** `kissScorm.log` holds the bridge's last 50 events: each call to the LMS with its element and whether it worked, and for a failure the LMS's own error code, message and diagnostic; and the bridge's decisions (no LMS found, review mode, turned off). An LMS that refuses one call (a commit, say) fails that call alone, and the next checkpoint tries again; the bridge turns off only when the LMS has ended the session and will not start it again. It never holds a value: no learner name, answer, bookmark or state. Read it from the browser's console in the LMS (`kissScorm.log`).

None of it throws, and a value is cleaned to what SCORM 1.2 accepts (an interaction id to a valid identifier). An embedded kiss page in an iframe uses the session of the page that embeds it. How a score counts, if at all, is the LMS's setting, not the package's: in Moodle, for example, the grading method, and whether every SCO must be completed, are settings of the SCORM activity.
