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
 */

// A staged build writes into `<build>.kiss-staging-<pid>-<random>`, which is an
// implementation detail of `cleanBuild: 'atomic'` and of check mode — and in a
// check it is a folder that no longer exists by the time anyone reads the
// report. Every path in the report is named against the folder the site asked
// for. (`Kiss._reportedPath` does the same for the failure message; here it is
// somewhere a test can reach it.)
function reportedPath(target, buildDir, stagingDir) {
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
const VIEW_MAX = 120
function reportedView(view) {
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
 * @param {{ view: string, buildTo: string|null }[]} [input.stack] the prepared pages
 * @param {import('./kiss.js').BuildFailure[]} [input.failures]
 * @param {{ toObject: () => Record<string, string> }|null} [input.manifest] the instance's asset manifest
 * @param {string} input.buildDir the real build folder
 * @param {string|null} [input.stagingDir] the staging sibling every path is reported against, if there is one
 * @param {'build'|'check'} [input.mode]
 * @param {number} [input.startedAt] `Date.now()` at construction
 * @param {string|null} [input.sitemap] the sitemap written by this build
 * @param {import('./pipeline.js').PipelineResult[]} [input.pipeline] what the asset pipeline's steps did
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
  return [
    head,
    ...report.failures.map((f) => `  ${f.buildTo ?? f.view}: ${f.message}`),
  ].join('\n')
}
