// The build's verdict as data. `complete()` reports a failed build to a person
// as an AggregateError; this is the same build reported to a script — every
// value JSON-safe, so it survives `JSON.stringify`, a file and a pipe. Pure:
// every input is passed in, nothing here reads or writes anything.

/**
 * One page the build queued.
 *
 * @typedef {Object} BuildPage
 * @property {string} view the `.hbs` filename — an inline template is elided to its first line
 * @property {string|null} buildTo the file it writes, against the real build folder
 * @property {boolean} ok `false` when a failure names this output path
 * @property {string|null} hash sha1 of the bytes written, or `null` when nothing was
 * @property {string|null} id the page's identity, what `{{link "<id>"}}` resolves — `null` for an inline template, a `generate: false` page, and a default id two pages arrived at (which no page claims)
 */

/**
 * One file `.copyAssets()` put in the build, as the asset manifest records it.
 *
 * @typedef {Object} BuildAsset
 * @property {string} source the build-relative path a template asks for (`css/site.css`)
 * @property {string} target the file that is actually there (`css/site.a1b2c3d4.css`)
 */

/**
 * One thing that failed to build. The same entry as {@link BuildFailure} with
 * the `Error` reduced to its message — the object itself stays on the
 * `AggregateError` `complete()` rejects with, so this stays serialisable.
 *
 * @typedef {Object} BuildReportFailure
 * @property {string} view
 * @property {string|null} buildTo `null` when the failure happened before the page had an output path
 * @property {string} message
 */

/**
 * One `config.assets.pipeline` step this build ran, as the report carries it:
 * the step's `Error` is left behind on the failure entry that names it.
 *
 * @typedef {Object} BuildPipelineStep
 * @property {string} name the step's `name`, or the first word of its `run`
 * @property {boolean} ok the command exited 0
 * @property {number} duration ms the command took
 */

/**
 * What this build did about the site's knowledge base, as the report carries
 * it: where that knowledge base lives, whether this build actually wrote it
 * (only a passing `KISS_AIKB` record does), the four note findings, and the
 * subjects those findings are about.
 *
 * @typedef {Object} BuildAikb
 * @property {string} folder the AIKB folder, as configured
 * @property {boolean} written `false` under check mode, and when a write failed
 * @property {{ missing: string[], dead: string[], stale: string[], dangling: string[] }} notes all four sorted; `missing`, `dead` and `stale` are note paths, `dangling` is `<note path>: <token>`
 * @property {import('./aikb.js').SiteMapSubject[]} subjects `{ kind, id, note, hash }` per subject of *this* build — the hash to stamp a note with, which `site-map.json` cannot yet carry because it still describes the last record
 */

/**
 * One internal reference in a written page that resolves to nothing: no file
 * under the build folder, no page the build queued, no asset the manifest
 * emitted.
 *
 * @typedef {Object} BuildBrokenLink
 * @property {string} page the page holding the reference, against the real build folder
 * @property {string} href the reference exactly as the page wrote it
 */

/**
 * What the broken-internal-link scan found. `null` on the report when no scan
 * ran — a dev build, a watch rebuild (a scoped re-render has not rewritten
 * every page) or `config.links.check: false`.
 *
 * @typedef {Object} BuildLinks
 * @property {number} checked internal references resolved
 * @property {BuildBrokenLink[]} broken sorted by page, then href
 */

/**
 * What the build did about page `aliases`: the redirects file it wrote, and the
 * two advisory findings about what a rename left behind. `null` on the report
 * when no page has an alias and neither finding fired.
 *
 * @typedef {Object} BuildRedirects
 * @property {string|null} file the `_redirects` written, against the real build folder, or `null` when no page has an alias
 * @property {number} aliases alias paths written into that file
 * @property {string[]} removed sorted; pages in the last record that this build does not build and no alias covers
 * @property {string[]} collisions sorted; aliases equal to a path this build actually writes
 */

/**
 * What `.report()` returns and `KISS_REPORT` writes: one settled build, in a
 * shape a script can act on without parsing log output.
 *
 * @typedef {Object} BuildReport
 * @property {boolean} ok nothing failed
 * @property {'build'|'check'} mode `'check'` when the build was staged and discarded rather than published
 * @property {string} buildDir the folder the site was built for — never the staging sibling
 * @property {number} duration ms from `new Kiss()` to the settled build
 * @property {BuildPage[]} pages every queued page, in registration order
 * @property {BuildReportFailure[]} failures
 * @property {BuildAsset[]} assets
 * @property {string|null} sitemap the `sitemap.xml` written, or `null` if none was
 * @property {BuildPipelineStep[]} pipeline every `config.assets.pipeline` step, in order; empty when there are none
 * @property {string|null} llms the `llms.txt` written, or `null` if none was
 * @property {BuildAikb|null} aikb the site's knowledge base, or `null` when there is none to report on
 * @property {BuildLinks|null} links the broken-internal-link scan, or `null` when this build ran none
 * @property {BuildRedirects|null} redirects the redirects file and the two rename findings, or `null` when there is nothing to say
 * @property {string|null} feed the feed file written, or `null` if none was
 */

// A staged build writes into `<build>.kiss-staging-<pid>-<random>`, which is an
// implementation detail of `cleanBuild: 'atomic'` and of check mode — and in a
// check it is a folder that no longer exists by the time anyone reads the
// report. Every path in the report is named against the folder the site asked
// for. (`Kiss._reportedPath` does the same for the failure message; here it is
// somewhere a test can reach it.)
//
// Exported for `lib/aikb.js`, which reports the same paths against the same
// folder: two artefacts of one build that disagreed about where a page went
// would be worse than either of them missing.
/**
 * @param {string|null|undefined} target
 * @param {string} buildDir
 * @param {string|null} [stagingDir]
 * @returns {string|null}
 */
export function reportedPath(target, buildDir, stagingDir) {
  if (!stagingDir || typeof target !== 'string') return target ?? null
  if (target === stagingDir) return buildDir
  return target.startsWith(`${stagingDir}/`)
    ? `${buildDir}${target.slice(stagingDir.length)}`
    : target
}

// A page registered with an inline template string has that whole string as its
// `view`, so a report would otherwise carry a page of markup per such page. The
// report is read in a terminal and by an agent paying for every token, so a view
// that is plainly not a filename is elided. Generous enough to keep a `.pages()`
// item label whole (`<view> [item N: <slug>]`), which is the one handle an
// operator has on a failed fan-out record.
// Exported alongside `reportedPath`, for the same reason: the site map lists
// the same pages and must elide the same views.
const VIEW_MAX = 120
/**
 * @param {string} view
 * @returns {string}
 */
export function reportedView(view) {
  if (typeof view !== 'string') return view
  const firstLine = view.split('\n', 1)[0]
  return firstLine === view && view.length <= VIEW_MAX
    ? view
    : `${firstLine.slice(0, VIEW_MAX)}…`
}

/**
 * Assembles the report for one settled build. Key order is fixed: the report is
 * read as text as often as it is read as data.
 *
 * @param {Object} input
 * @param {{ view: string, buildTo: string|null, id?: string|null, page?: { hash?: string|null } }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
 * @param {string|null} [input.llms] the llms.txt written by this build
 * @param {BuildAikb|null} [input.aikb] the site's knowledge base, `null` when there is none to report on
 * @param {BuildLinks|null} [input.links] what the broken-internal-link scan found, `null` when none ran
 * @param {BuildRedirects|null} [input.redirects] what the build did about page `aliases`, `null` when there is nothing to say
 * @param {string|null} [input.feed] the feed file written by this build
 * @returns {BuildReport}
 */
export function buildReport({
  stack = [],
  failures = [],
  manifest = null,
  buildDir,
  stagingDir = null,
  mode = 'build',
  startedAt = Date.now(),
  sitemap = null,
  pipeline = [],
  llms = null,
  aikb = null,
  links = null,
  redirects = null,
  feed = null,
}) {
  const real = (target) => reportedPath(target, buildDir, stagingDir)
  const failedPaths = new Set(
    failures.map((failure) => real(failure.buildTo)).filter(Boolean),
  )
  return {
    ok: failures.length === 0,
    mode,
    buildDir,
    duration: Math.max(0, Date.now() - startedAt),
    pages: stack.map((entry) => {
      const buildTo = real(entry.buildTo)
      return {
        view: reportedView(entry.view),
        buildTo,
        ok: !failedPaths.has(buildTo),
        // Appended after `ok` for the reason `pipeline` and `llms` were
        // appended to the report itself: a consumer diffing two reports should
        // see one new key, not a reshuffle of the three that were there. Read
        // off the `KissPage` the stack entry carries, so it is whatever that
        // page last wrote — `null` for a page that failed, one that was never
        // rendered, and one registered with `generate: false`.
        hash: entry.page?.hash ?? null,
        // Appended after `hash` for the same reason `hash` was appended after
        // `ok`: one new key per version, never a reshuffle. Read off the stack
        // entry, where identity lives — `null` for a page that claims none, and
        // for a default id withdrawn because two pages arrived at it.
        id: entry.id ?? null,
      }
    }),
    failures: failures.map((failure) => ({
      view: reportedView(failure.view),
      buildTo: real(failure.buildTo),
      // The Error itself stays on the AggregateError: a report that carries one
      // does not survive JSON.stringify (an Error serialises to `{}`).
      message: failure.error?.message ?? String(failure.error),
    })),
    assets: manifest
      ? Object.entries(manifest.toObject()).map(([source, target]) => ({
          source,
          target,
        }))
      : [],
    sitemap: real(sitemap),
    // Appended rather than slotted in beside `assets`, so a consumer diffing
    // two reports sees one new key and not a reshuffle of the eight that were
    // already there. The step's `error` is dropped: its message is already in
    // `failures`, under `<pipeline: name>`.
    pipeline: pipeline.map(({ name, ok, duration }) => ({
      name,
      ok,
      duration,
    })),
    // Appended for the same reason `pipeline` was: a consumer diffing two
    // reports should see one new key, not a reshuffle of the nine already
    // there.
    llms: real(llms),
    // Appended rather than slotted in beside `assets`, and for the same reason.
    // Not passed through `real()`: the AIKB folder is source-side and
    // committed, so it is never staged and its paths are already the ones a
    // person would type.
    aikb,
    // The last three, appended in this fixed order for the reason every key
    // before them was appended: a consumer diffing two reports should see new
    // keys at the end, not a reshuffle of the eleven already there. Each is
    // `null` until the build actually did that piece of work — no scan ran, no
    // page has an alias, no feed was asked for — which is not the same as
    // "it did it and found nothing" (`{ checked: 0, broken: [] }`).
    links: links && {
      checked: links.checked,
      // Mapped here rather than where the scan ran, for the reason `sitemap`
      // and `llms` are: the pages were read back out of the staging folder, and
      // under check mode that folder is gone by the time anyone reads this.
      broken: links.broken.map(({ page, href }) => ({
        page: real(page),
        href,
      })),
    },
    redirects: redirects && {
      // The written file is recorded as the path it was written to — a staging
      // path under `'atomic'` and under check — and mapped here, like `sitemap`
      // and `llms`. `removed` and `collisions` are derived from build-relative
      // paths and carry no staging prefix to map.
      file: real(redirects.file),
      aliases: redirects.aliases,
      removed: redirects.removed,
      collisions: redirects.collisions,
    },
    feed: real(feed),
  }
}

/**
 * The one-line human rendering of a report, plus one line per failure — what
 * `kiss-ssg check --summary` prints in place of the JSON.
 *
 * @param {BuildReport} report
 * @returns {string}
 */
export function formatReport(report) {
  const head =
    `${report.ok ? 'ok' : 'FAIL'} ${report.buildDir} (${report.mode}) — ` +
    `${report.pages.length} pages, ${report.failures.length} failed, ` +
    `${report.assets.length} assets, ${report.duration}ms`
  // A summary that says "1 failed" without saying which page is not a summary
  // anyone can act on; the detail is one line each, not the whole JSON.
  // Note findings are advisory — they never touch `ok` or the exit code — but
  // they are the half of the knowledge base a build cannot write for you, so
  // they are said out loud rather than left in the JSON.
  const notes = report.aikb?.notes
  return [
    head,
    ...report.failures.map((f) => `  ${f.buildTo ?? f.view}: ${f.message}`),
    ...(notes?.missing ?? []).map((file) => `  note missing: ${file}`),
    ...(notes?.dead ?? []).map((file) => `  note dead: ${file}`),
    ...(notes?.stale ?? []).map((file) => `  note stale: ${file}`),
    // Already `<note path>: <token>` when `lib/aikb.js` reports it — the token
    // is the half of the finding that says what to go and fix.
    ...(notes?.dangling ?? []).map((entry) => `  note dangling: ${entry}`),
    // Advisory too, and said out loud for the same reason: a broken link, a
    // page that vanished with no redirect and an alias a live page already
    // answers are all things a build knows and a person cannot see. `->` is
    // ASCII on purpose — this line is grepped as often as it is read.
    ...(report.links?.broken ?? []).map(
      ({ page, href }) => `  broken link: ${page} -> ${href}`,
    ),
    ...(report.redirects?.removed ?? []).map(
      (path) => `  removed without redirect: ${path}`,
    ),
    ...(report.redirects?.collisions ?? []).map(
      (path) => `  alias collides with a page: ${path}`,
    ),
  ].join('\n')
}
