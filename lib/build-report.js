import path from 'node:path'

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
 * @property {string|null} canonical the URL the page named as its canonical, when it named one elsewhere — such a page is absent from `sitemap.xml`, `llms.txt` and the feed; `null` when `{{canonical}}` is derived from the page's own URL
 * @property {string|null} markdown the Markdown copy the page wrote beside itself (`config.markdownCopies`), against the real build folder; `null` when it wrote none
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
/**
 * What the build told crawlers. An object rather than a path, unlike `sitemap`,
 * `llms` and `feed`, for one reason: `disallowAll` is a fact that removes the
 * site from search and a path cannot say it. Carried here so a `kiss-ssg
 * check` diff shows a staging crawl policy reaching production.
 *
 * @typedef {Object} BuildRobots
 * @property {string} file the `robots.txt` written, against the real build folder
 * @property {number} agents how many `User-agent:` blocks it carries
 * @property {boolean} disallowAll whether any block disallows the whole site
 * @property {string[]} sitemaps the absolute sitemap URLs it advertises
 */

/**
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
 * @property {number} hostServed of those, the ones no build file answers but a `config.links.hostServed` pattern does
 * @property {BuildBrokenLink[]} broken sorted by page, then href
 */

/**
 * What the build did about page `aliases`: the redirects file it wrote, and the
 * two advisory findings about what a rename left behind. `null` on the report
 * when no page has an alias and neither finding fired.
 *
 * @typedef {Object} BuildRedirects
 * @property {string|null} file the **first** host redirects file written, in `formats` order, against the real build folder; `null` when no page has an alias and when no host format ran. With more than one format this names one of several — `files` is the complete list and the authoritative one
 * @property {{ from: string, to: string }[]} rules the resolved redirects, sorted — the host-neutral list every format is rendered from
 * @property {string|null} json the `redirects.json` IR written, against the real build folder, or `null` when none was
 * @property {string[]} formats the host formats that ran, in order — built-in names, and `'custom'` for each writer function; `[]` when only the IR was written
 * @property {string[]} files every redirects file this build wrote, against the real build folder
 * @property {number} aliases alias paths written into that file
 * @property {string[]} removed sorted; pages in the last record that this build does not build and no alias covers
 * @property {string[]} collisions sorted; aliases equal to a path this build actually writes
 * @property {{ id: string, from: string, to: string }[]} moved sorted by `from`; pages the last record and this build share an `id` with, whose path changed and whose old path no alias covers
 */

/**
 * One launch-readiness finding, as the report carries it.
 *
 * @typedef {Object} BuildAuditFinding
 * @property {import('./audit.js').CheckId} check which check fired — one of `CHECKS` in `lib/audit.js`
 * @property {string|null} page the page or walked file it is about, against the real build folder; `null` for a finding about the whole site
 * @property {string|null} detail the value that tripped the check, when one helps find it
 */

/**
 * What the launch-readiness audit found. Advisory: it never touches `ok`,
 * `failures` or the exit code. `null` on the report when no audit ran — a dev
 * build, `config.audit.check: false`, and a build with any failure, whose
 * missing pages would make every site-level finding a false one.
 *
 * @typedef {Object} BuildAudit
 * @property {number} checked HTML pages audited
 * @property {import('./audit.js').CheckId[]} ignored `config.audit.ignore`, sorted — checks turned off, so a clean audit is not read as a clean site
 * @property {import('./audit.js').CheckId[]} skipped checks not run because the build does not own its folder (`cleanBuild: false`), in `CHECKS` order
 * @property {BuildAuditFinding[]} findings sorted by check, then page, then detail
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
 * @property {BuildRobots|null} robots what `.robots()` wrote, or `null` when it was never called
 * @property {{collisions: import('./output-registry.js').OutputCollision[]}} outputs advisory output collisions between active producers
 * @property {BuildAudit|null} audit the launch-readiness audit, or `null` when this build ran none
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
 * @param {{ view: string, buildTo: string|null, id?: string|null, page?: { hash?: string|null, markdown?: string|null, options?: any } }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {number} [input.finishedAt] when the build settled. Defaults to now,
 * which is right for the settle itself and wrong for anything that re-derives
 * the report afterwards: `Kiss._refreshReport()` re-runs this when a watch
 * asset copy or a helpers reload changes the verdict, and without a fixed end
 * the duration would grow with the idle time of the session. Measured: a
 * seven-millisecond build reported as 1226ms after a 1.2s pause.
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
 * @param {string|null} [input.llms] the llms.txt written by this build
 * @param {BuildAikb|null} [input.aikb] the site's knowledge base, `null` when there is none to report on
 * @param {BuildLinks|null} [input.links] what the broken-internal-link scan found, `null` when none ran
 * @param {BuildRedirects|null} [input.redirects] what the build did about page `aliases`, `null` when there is nothing to say
 * @param {BuildRobots|null} [input.robots] what `.robots()` wrote, `null` when it was never called
 * @param {string|null} [input.feed] the feed file written by this build
 * @param {{collisions: import('./output-registry.js').OutputCollision[]}} [input.outputs]
 * @param {BuildAudit|null} [input.audit] what the launch-readiness audit found, `null` when none ran
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
  finishedAt = null,
  sitemap = null,
  pipeline = [],
  llms = null,
  aikb = null,
  links = null,
  redirects = null,
  robots = null,
  feed = null,
  outputs = { collisions: [] },
  audit = null,
}) {
  const resolvedBuild = path.resolve(buildDir).replaceAll('\\', '/')
  const resolvedStaging =
    stagingDir && path.resolve(stagingDir).replaceAll('\\', '/')
  const real = (target) =>
    reportedPath(
      reportedPath(
        reportedPath(target, buildDir, stagingDir),
        buildDir,
        resolvedStaging,
      ),
      buildDir,
      resolvedBuild,
    )
  const failedPaths = new Set(
    failures.map((failure) => real(failure.buildTo)).filter(Boolean),
  )
  return {
    ok: failures.length === 0,
    mode,
    buildDir,
    duration: Math.max(0, (finishedAt ?? Date.now()) - startedAt),
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
        // Appended after `id`, same rule. Read off the page's options: the
        // value `_preparePage` validated and the four readers acted on.
        canonical: entry.page?.options?.canonical ?? null,
        // Appended after `canonical`, same rule. The Markdown copy the page
        // last wrote beside itself — `null` when it wrote none, which is also
        // every page `hash` is `null` for.
        markdown: real(entry.page?.markdown ?? null),
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
      hostServed: links.hostServed,
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
      // Appended after `collisions` for the reason every key here is appended:
      // a consumer diffing two records should see one new key at the end. Not
      // mapped either — `from` and `to` are build-relative on both sides.
      moved: redirects.moved ?? [],
      // The three keys the format block adds, appended in turn for the same
      // reason. `rules` is the resolved list the host files are rendered from
      // — the portable fact, handed over so a site on a host kiss does not
      // encode can write its own redirects from `kiss.report()` rather than by
      // parsing a file. `json` and `files` are paths and so are mapped;
      // `rules` holds URL paths, which carry no staging prefix.
      rules: redirects.rules ?? [],
      json: real(redirects.json ?? null),
      formats: redirects.formats ?? [],
      files: (redirects.files ?? []).map((path) => real(path)),
    },
    feed: real(feed),
    // Appended after `feed`, the same rule every key here follows. `file` is
    // mapped out of staging like every other written path; `sitemaps` are
    // absolute URLs and carry no staging prefix.
    robots: robots && { ...robots, file: real(robots.file) },
    outputs: {
      collisions: outputs.collisions.map((collision) => ({
        ...collision,
        file: real(collision.file),
      })),
    },
    // Appended after `outputs`, the rule every key here follows. `page` is a
    // path the audit found where the pages were written — staging, under
    // `'atomic'` and under check — so it is mapped like every other one;
    // `detail` is a value out of a template, never a path to map.
    audit: audit && {
      checked: audit.checked,
      ignored: audit.ignored,
      skipped: audit.skipped,
      findings: audit.findings.map(({ check, page, detail }) => ({
        check,
        page: real(page),
        detail,
      })),
    },
  }
}

// The checks whose `page` is a file the audit found in the build folder rather
// than a page this build queued, so the summary counts them as files.
const FILE_CHECKS = new Set(['debug-dump', 'stray-file', 'console-log'])
// How many paths a summary line names before it says `…`: a per-page check can
// fire on every page of the site, and the line is there to be read.
const AUDIT_NAMED = 3
// The duplicate checks, whose line names the shared value, and how much of it:
// enough to recognise a tagline, short enough to keep the line one line.
const DUPLICATE_CHECKS = new Set(['title-duplicate', 'description-duplicate'])
const AUDIT_VALUE = 60

/**
 * `N pages (a, b, c, …)` — the count, then up to `AUDIT_NAMED` of the paths.
 *
 * @param {string[]} paths distinct, in the order to show them
 * @param {'page'|'file'} noun
 * @returns {string}
 */
function namedPages(paths, noun) {
  const named = paths.slice(0, AUDIT_NAMED)
  if (paths.length > AUDIT_NAMED) named.push('…')
  return `${paths.length} ${noun}${paths.length === 1 ? '' : 's'} (${named.join(', ')})`
}

/**
 * The audit's summary lines, unindented: one per check that fired, naming up
 * to three of the paths it fired on, plus one for any checks the build did not
 * own its folder to run. Shared by `formatReport` and the build log
 * (`Kiss._runAudit`), so the two cannot word a finding differently.
 *
 * @param {BuildAudit|null|undefined} audit with its paths already as they are to be shown
 * @returns {string[]} empty when no audit ran and when it found nothing
 */
export function auditLines(audit) {
  if (!audit) return []
  /** @type {Map<string, BuildAuditFinding[]>} */
  const byCheck = new Map()
  for (const finding of audit.findings)
    byCheck.set(finding.check, [...(byCheck.get(finding.check) ?? []), finding])
  const lines = []
  for (const [check, findings] of byCheck) {
    // A site-wide finding is the whole of what it has to say: the check, and
    // the value that tripped it when there is one.
    for (const { detail } of findings.filter((f) => f.page === null))
      lines.push(detail ? `audit ${check}: ${detail}` : `audit ${check}`)
    // A duplicate is only actionable once you know what is duplicated, so it
    // gets one line per shared value, quoted and capped, in value order.
    if (DUPLICATE_CHECKS.has(check)) {
      /** @type {Map<string, string[]>} */
      const byValue = new Map()
      for (const { page, detail } of findings)
        if (page !== null && detail !== null)
          byValue.set(detail, [...(byValue.get(detail) ?? []), page])
      for (const value of [...byValue.keys()].sort()) {
        const shown =
          value.length > AUDIT_VALUE ? `${value.slice(0, AUDIT_VALUE)}…` : value
        lines.push(
          `audit ${check}: "${shown}" on ${namedPages(byValue.get(value) ?? [], 'page')}`,
        )
      }
      continue
    }
    // A page counted once however often it fired: an image-heavy page missing
    // six alts is one page to go and fix.
    const pages = [
      ...new Set(findings.map((f) => f.page).filter((p) => p !== null)),
    ]
    if (pages.length === 0) continue
    lines.push(
      `audit ${check}: ${namedPages(pages, FILE_CHECKS.has(check) ? 'file' : 'page')}`,
    )
  }
  if (audit.skipped.length > 0)
    lines.push(`audit skipped (cleanBuild: false): ${audit.skipped.join(', ')}`)
  return lines
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
  // Withdrawn from three files on the page's own say-so. Said once, as a
  // count: a site mirroring a sister catalogue has a hundred of these, and a
  // hundred lines would bury the findings below.
  const elsewhere = report.pages.filter((page) => page.canonical).length
  return [
    head,
    ...report.failures.map((f) => `  ${f.buildTo ?? f.view}: ${f.message}`),
    ...(report.outputs?.collisions ?? []).map(
      (collision) =>
        `  output collision: ${collision.file} — ${collision.producers.map((producer) => producer.owner).join(', ')}; winner: ${collision.winner?.owner ?? 'none'}${collision.refused.length ? `; refused: ${collision.refused.join(', ')}` : ''}`,
    ),
    ...(elsewhere
      ? [
          `  ${elsewhere} page${elsewhere === 1 ? '' : 's'} canonical elsewhere — not in sitemap.xml, llms.txt or the feed`,
        ]
      : []),
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
    // Beside the removal rather than in report-key order: the two answer one
    // question — what did this rename leave behind — and a reader scanning the
    // summary wants them together. The id is in the line because it is what
    // makes the two builds' pages one page, and the fix (`aliases`) is in the
    // `notice` the build logged rather than repeated here.
    ...(report.redirects?.moved ?? []).map(
      ({ from, to, id }) =>
        `  moved without redirect: ${from} -> ${to} (${id})`,
    ),
    ...(report.redirects?.collisions ?? []).map(
      (path) => `  alias collides with a page: ${path}`,
    ),
    // Last, like the key. Advisory, and one line per check rather than per
    // finding: `description-missing` on a forty-page site is one thing to fix
    // in one layout, not forty lines burying the broken links above.
    ...auditLines(report.audit).map((line) => `  ${line}`),
  ].join('\n')
}
