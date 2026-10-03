// What a settled build says about itself: the build report, and the four
// things the settle path decides beside it — the link scan, the
// launch-readiness audit, the redirect files and their findings, and the
// site's knowledge-base record. `lib/kiss.js` decides when each runs; this
// module does the run and records the result on the instance.
//
// Every function takes the `Kiss` instance and reads its state at call time;
// state stays on the instance, and a call to another of its methods goes
// through `kiss._x()`, so a test that patches one is seen.
import fs from 'fs-extra'
import utils from './utils.js'
import { auditLines, buildReport } from './build-report.js'
import { checkLinks } from './links.js'
import { auditBuild } from './audit.js'
import {
  collectAliases,
  redirectFindings,
  writeRedirects,
} from './redirects.js'
import { aikbRecordRequested, readReportsFile } from './check.js'
import { buildSiteMap, isRecorded, writeAikb, writeLastBuild } from './aikb.js'

// One report per settled build, assembled after the staging folder has been
// promoted or discarded so every path in it names the folder the site asked
// for. Latched on `_report`, because the nested-complete() pattern settles
// one build twice and KISS_REPORT takes one line per build, not per call.
export async function finishBuild(kiss) {
  if (kiss._report) return kiss._report
  // Before the report is assembled, because the report carries its verdict —
  // and after the drain, because the dependency graph is filled by rendering
  // and a map built any earlier would list no partials at all.
  const verdict = (kiss._aikbVerdict = await kiss._buildAikb())
  // Before the report, because the report carries it — and before
  // `writeLastBuild` below replaces the very record it reads.
  kiss._redirectsResult = kiss._redirectFindings()
  // When this build settled, captured after everything the settle does — the
  // knowledge-base record and the redirect findings included, because both
  // are work this build performed and `duration` claims to be the time from
  // `new Kiss()`. It was taken before them, which made that claim wrong by
  // however long they took; on a 41-page site with aliases and a sitemap
  // that measured as 3ms, inside the noise, but a documented number that is
  // wrong by an unmeasured amount is still wrong.
  //
  // Captured once, here, rather than computed when the report is assembled:
  // `_refreshReport()` re-runs `buildReport` whenever a watch asset copy or
  // a helpers reload changes the verdict, and a duration measured then would
  // grow with the session's idle time.
  kiss._finishedAt = Date.now()
  kiss._report = buildReport(kiss._reportInputs())
  // The graph as data, for a human to look at: which pages each partial
  // reaches. Dev only — a one-shot build has no watcher to use it — and
  // verbose only, beside debug.json. A failure to write it is logged, never
  // a build failure.
  if (kiss.config.dev && kiss.config.verbose)
    await fs
      .outputJson(
        `${kiss._writeRoot}/dependency-graph.json`,
        kiss._graph.toJSON(),
        { spaces: 2 },
      )
      .then(() =>
        kiss._outputs.claim(
          `${kiss._writeRoot}/dependency-graph.json`,
          'dependency graph',
        ),
      )
      .catch((err) =>
        kiss.logger.error(
          `Could not write dependency-graph.json: ${err.message}`,
        ),
      )
  const reportFile = process.env.KISS_REPORT
  if (reportFile)
    // JSON Lines, appended: one script may build several sites (an archive of
    // per-season outputs is one Kiss per season), and each instance writes a
    // line of its own. A report that cannot be written is not worth failing a
    // build over — whatever is reading the file reports the silence instead.
    await fs
      .appendFile(reportFile, `${JSON.stringify(kiss._report)}\n`)
      .then(() => kiss._outputs.claim(reportFile, 'build report'))
      .catch((err) =>
        kiss.logger.error(`Could not write KISS_REPORT: ${err.message}`),
      )
  // Last of the four files, because it is this build's report and the report
  // did not exist until a moment ago. A build that wrote no map writes no
  // snapshot of itself either — the two halves of a record are one thing.
  if (verdict?.written)
    await writeLastBuild({
      folder: verdict.folder,
      report: kiss._report,
      logger: kiss.logger,
    })
  return kiss._report
}

/**
 * Everything `buildReport` needs, in one place. It is read twice — once by
 * `_finishBuild()` when a build settles, and once by `_refreshReport()` when
 * something changes the failure list without settling a build — and two call
 * sites assembling this literal separately is exactly the shape that has
 * gone wrong repeatedly on this branch: they drift, and the one nobody looks
 * at is the one that lies.
 *
 * @returns {any}
 */
export function reportInputs(kiss) {
  return {
    stack: kiss._stackForRecord(),
    failures: kiss._failures,
    manifest: kiss._assetManifest,
    buildDir: kiss._buildTarget ?? kiss.config.folders.build,
    // `_promotedFrom` matters here too: a promotion rewrites every stack
    // entry's `buildTo` to the real folder but not `_sitemapPath` or
    // `_llmsPath`, which were recorded as the staging paths they were written
    // to. Without the fallback a successful `'atomic'` build reported a
    // `sitemap`/`llms` inside a folder that no longer exists. Mapping a path
    // that is already real is a no-op, so nothing else moves.
    stagingDir: kiss._stagingDir ?? kiss._promotedFrom,
    mode: kiss._checkMode ? 'check' : 'build',
    startedAt: kiss._startedAt,
    finishedAt: kiss._finishedAt,
    sitemap: kiss._sitemapPath,
    pipeline: kiss._pipelineResults,
    llms: kiss._llmsPath,
    aikb: kiss._aikbVerdict,
    // The three appended keys, in the order `buildReport` fixes them. All
    // three are `null` on every build until the modules that fill them land:
    // the seam is here so each of those adds a field and a call site rather
    // than reshaping this one.
    links: kiss._links,
    redirects: kiss._redirectsResult,
    feed: kiss._feedPath,
    robots: kiss._robotsResult,
    outputs: { collisions: kiss._outputs.snapshot() },
    // Last, after `outputs`, as `buildReport` fixes it. Carried by
    // `_refreshReport()` too, so a re-derived verdict keeps the audit the
    // settle produced rather than dropping it.
    audit: kiss._audit,
  }
}

/**
 * Re-assembles the settled report against the CURRENT failure list.
 *
 * `report()` is the machine verdict, and between settles it was a stale one:
 * a watch asset save that broke a stylesheet, or a helpers reload that
 * failed, put the failure on `_failures` and logged it in red immediately
 * while `report().ok` went on saying `true` until the next whole-site
 * replay. Measured. A scoped re-render and an asset re-copy settle no build,
 * so neither calls `_finishBuild()` — and re-running `_finishBuild()` here
 * would be wrong in the other direction, because it carries the once-per-
 * build side effects: a `KISS_REPORT` line (one per BUILD, not per call), a
 * `last-build.json` record, a `dependency-graph.json` write. This re-derives
 * the report and nothing else.
 *
 * What it deliberately does NOT re-derive is what an asset copy or a helpers
 * reload cannot change: the aikb verdict (a map of pages and partials) and
 * the redirect findings (page aliases). Both are reused from the settle that
 * produced them, which is why they are held on the instance.
 *
 * A no-op before the first build settles — there is nothing to refresh, and
 * `report()` correctly answers `null`.
 *
 */
export function refreshReport(kiss) {
  if (!kiss._report) return
  kiss._report = buildReport(kiss._reportInputs())
}

// Builds the site map, evaluates the note rules and — only when this build
// was asked to record, and only when it has something worth recording —
// writes the generated half of the AIKB folder. A failure to write is logged
// and reported as `written: false`, never a build failure: the same stance as
// the dependency-graph dump above.
//
// Two questions, in order. *Is there a knowledge base here at all?* —
// `folders.aikb` set, and either this run is the record or the folder already
// holds a `site-map.json` a previous record wrote. A folder that merely
// exists is not an answer: this repository's own `AIKB/` is hand-written
// module notes, and the docs site built inside it must not adopt them. Then:
// *may this build write?* — only a record, never in dev (where the site is
// half-built by definition), and never after a failure, because a knowledge
// base that describes a broken build is worse than none.
export async function buildAikb(kiss) {
  const folder = kiss.config.folders.aikb
  if (!folder) return null
  const record = aikbRecordRequested()
  if (!record && !isRecorded(folder)) return null
  const map = buildSiteMap({
    stack: kiss._stackForRecord(),
    graph: kiss._graph,
    config: kiss.config,
    pipeline: kiss.config.assets.pipeline,
    buildDir: kiss._buildTarget ?? kiss.config.folders.build,
    // Whichever staging folder this build used, promoted or not: the graph's
    // keys are staging paths in both cases.
    stagingDir: kiss._stagingDir ?? kiss._promotedFrom,
  })
  const write = record && !kiss.config.dev && kiss._failures.length === 0
  // A refusal is said out loud: the whole point of `kiss-ssg aikb` is that
  // the operator is standing there waiting for the folder to be rewritten,
  // and silence would read as success.
  if (record && !write)
    kiss.logger.notice(
      kiss._failures.length > 0
        ? `KISS_AIKB: not recording ${folder} — the build failed (${kiss._failures.length} ${kiss._failures.length === 1 ? 'failure' : 'failures'}); the knowledge base only ever describes a build that worked`
        : `KISS_AIKB: not recording ${folder} — a dev build is never recorded`,
    )
  return await writeAikb({ map, folder, logger: kiss.logger, write })
}

// Resolves every internal reference this build's own pages wrote, against the
// folder they were written into — `lib/links.js` does the work; this only
// decides whether to run it and hands it the build's own registry.
//
// **It runs before the folder moves, not in `_finishBuild()`.** By the time
// `_finishBuild()` is reached the staging folder has been discarded (check
// mode, and any failed atomic build) or promoted (an atomic success), so a
// scan that resolved against `config.folders.build` there would find nothing
// at all under `kiss-ssg check` — the one command the finding exists to
// serve — and would report `checked: 0, broken: []` silently. Called from
// complete()'s settle path instead, the pages are still exactly where they
// were written, whichever of the three branches is about to run.
//
// The references themselves were extracted at write time (`KissPage.links`),
// so nothing here reads HTML back; what the filesystem is consulted for is
// the rest of the build folder — assets, `sitemap.xml`, `llms.txt`, a feed,
// whatever a pipeline step wrote straight into it.
//
// Latched on `_links` for the reason `_report` is: the documented
// "complete() inside a generate callback" pattern settles one build twice,
// and the second pass would be scanning a folder that is no longer there.
//
// Skipped in dev (and therefore on every watch rebuild): a scoped re-render
// has not rewritten every page, so a scan would be reporting a half-built
// site. `config.links.check: false` skips it outright. Both leave `_links`
// `null`, which the report distinguishes from "it ran and found nothing".
/**
 * @param {any} kiss
 * @param {{ quiet?: boolean }} [options]
 */
export function runLinkCheck(kiss, { quiet = false } = {}) {
  if (kiss._links) return kiss._links
  if (!kiss.config.links?.check || kiss.config.dev) return null
  // `hash !== null` is the promise "these bytes are on disk" (AIKB/kiss-page.md);
  // `generate !== false` is not — a page can also have failed to render.
  const pages = kiss._stack
    .filter(
      (entry) => entry.page?.hash !== null && Array.isArray(entry.page?.links),
    )
    // `entry.buildTo`, not the real path: under `'atomic'` and under check
    // these are staging paths, which is where the files are right now.
    // `buildReport` maps them back through `reportedPath` for the report.
    .map((entry) => ({ buildTo: entry.buildTo, links: entry.page.links }))
  const result = checkLinks({
    pages,
    buildDir: kiss._writeRoot,
    siteUrl: kiss.config.siteUrl,
    extensionLess: kiss.config.extensionLess,
    // The manifest's **values**, never its keys: under `assets.hash` the file
    // on disk is `css/site.a1b2c3d4.css`, so a template that hardcoded
    // `/css/site.css` is genuinely broken and accepting the key would hide it.
    manifestTargets: Object.values(kiss._assetManifest.toObject()),
    hostServed: kiss.config.links.hostServed,
  })
  kiss._links = result
  if (quiet) return result
  if (result.broken.length === 0)
    kiss.logger.info(
      `Links: ${result.checked} internal reference${result.checked === 1 ? '' : 's'}, none broken`,
    )
  // Under check the report is the list — `--summary` prints it in this same
  // wording and the JSON carries it — while this log goes to stderr, which a
  // terminal shows right beside it. Listing it here too printed every finding
  // twice, so check mode gets the count and the report keeps the lines.
  else if (kiss._checkMode)
    kiss.logger.notice(
      `${result.broken.length} broken link${result.broken.length === 1 ? '' : 's'} (listed in the check report)`,
    )
  // One line per finding, in the wording `formatReport` uses, so the build
  // log and `check --summary` say the same thing. Advisory: it moves nothing.
  else
    for (const broken of result.broken)
      kiss.logger.notice(
        `broken link: ${kiss._reportedPath(broken.page)} -> ${broken.href}`,
      )
  return result
}

// Decides the launch-readiness findings for this build — `lib/audit.js` does
// the work; this only decides whether to run it and hands it the build's own
// pages. Every placement decision is `_checkLinks`'s, for `_checkLinks`'s
// reasons: called from the same point in complete()'s settle path, directly
// after it, so the pages are still where they were written (staging, under
// `'atomic'` and under check); latched on `_audit`; skipped in dev.
//
// One skip of its own: **a failed build is not audited.** A page that failed
// has no facts, so every site-level finding — no favicon link, no 404 page —
// could be a false one, and a list of them would bury the failures that are
// the real news. `_audit` stays `null`, as it does under
// `config.audit.check: false`.
/**
 * @param {any} kiss
 * @param {{ quiet?: boolean }} [options]
 */
export function runAudit(kiss, { quiet = false } = {}) {
  if (kiss._audit) return kiss._audit
  if (!kiss.config.audit?.check || kiss.config.dev) return null
  if (kiss._failures.length > 0) return null
  const pages = kiss._stack
    .filter((entry) => entry.page?.hash !== null && entry.page?.audit)
    .map((entry) => {
      const options = entry.page.options ?? {}
      return {
        // Staging paths under `'atomic'` and under check, as with links:
        // `buildReport` maps them back through `reportedPath`.
        buildTo: entry.buildTo,
        facts: entry.page.audit,
        // The field the report already emits as `pages[].canonical`: the
        // page named another URL as its canonical, so it declares itself a
        // copy. No URL comparison, so no URL policy is involved.
        canonicalElsewhere:
          typeof options.canonical === 'string' && options.canonical !== '',
        // The `{{canonical}}` rule (`siteUrlFor`): the page's own merged
        // config first, then the instance's.
        siteUrl: options.config?.siteUrl ?? kiss.config.siteUrl ?? null,
      }
    })
  const result = auditBuild({
    pages,
    buildDir: kiss._writeRoot,
    siteUrl: kiss.config.siteUrl ?? null,
    ignore: kiss.config.audit.ignore,
    // Under `cleanBuild: false` the folder holds what earlier builds and
    // sibling instances left in it, so the three checks that walk it are
    // skipped and listed as such rather than reporting someone else's files.
    // `_ownsFolder`, not `config.cleanBuild`: under check the config reads
    // `'atomic'` whatever the author wrote.
    ownsFolder: kiss._ownsFolder,
    debugWritten: kiss._debugWritten,
  })
  kiss._audit = result
  if (quiet) return result
  // Under check the report is the list, as with `_checkLinks`: this log goes
  // to stderr beside `--summary`'s stdout, so listing the findings here too
  // printed every one twice (diploma-msc's real check, 2026-10-02). Check
  // mode gets the count and says where the list is.
  const listedElsewhere = kiss._checkMode && result.findings.length > 0
  kiss.logger.info(
    `Audit: ${result.checked} page${result.checked === 1 ? '' : 's'}, ${
      result.findings.length === 0
        ? 'none'
        : `${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}`
    }${listedElsewhere ? ' (listed in the check report)' : ''}`,
  )
  if (listedElsewhere) return result
  // The summary's own lines, over the paths the report will carry, so the
  // build log and `check --summary` cannot word a finding differently.
  // Advisory, like the link scan: it moves nothing.
  for (const line of auditLines({
    ...result,
    findings: result.findings.map((finding) => ({
      ...finding,
      page: kiss._reportedPath(finding.page),
    })),
  }))
    kiss.logger.notice(line)
  return result
}

// Writes `<build>/_redirects` from every page's `aliases` — `lib/redirects.js`
// does the work; this only decides when it happens and records where it went.
//
// Automatic, with no method of its own: an alias is a property of a page, not
// a file the author asks for, so there is nothing to call. That leaves the
// question of *when*, and there are only two honest answers. A
// `Promise.all(kiss._promises)` pushed onto `_generating` — the `.sitemap()`
// shape — needs a call site, and the only one that exists on every build is
// the constructor, where `_promises` holds the asset copy and not one page:
// the write would run against an empty stack. So it goes at the top of
// `complete()`'s settle path instead, where the drain has finished (the
// sitemap, llms.txt and the feed are already on disk) and the three-way
// branch below has not yet discarded or promoted anything. Provably before
// the folder moves, because it is above the branch that moves it; and free
// on replay, because `_replay()` ends in `complete()`.
//
// Dev builds write it too. Nothing serves `_redirects` locally, but it costs
// one small file and it keeps "what the build folder contains" from
// depending on the mode — unlike the link scan, which is skipped in dev
// because a scoped re-render has genuinely not rewritten every page.
export function writeAliasRedirects(kiss) {
  if (kiss._redirectsRun) return kiss._redirectsRun
  kiss._redirectsRun = writeRedirects(kiss._stack, {
    config: kiss._writeConfig,
    logger: kiss.logger,
    outputs: kiss._outputs,
  })
    .then(({ status, files, formats, unset }) => {
      kiss._redirectsFormats = formats
      // `none` wrote nothing and claims nothing: the report's `file` stays
      // `null`, and a `_redirects` the site copied in from its assets folder
      // is still the build's own.
      if (status === 'none') return
      kiss._redirectsFiles = files
      // The upgrade case, and the one notice this block owes anybody. Before
      // `redirects.format` existed the only behaviour was `_redirects`, so a
      // site that has aliases and never chose a format would otherwise lose
      // its redirects in silence on upgrade — the failure the format block
      // was built to abolish, delivered by the block itself. An explicit
      // `'none'` or `[]` is a decision and says nothing.
      if (unset)
        kiss.logger.warn(
          'aliases written to redirects.json only — set config.redirects.format' +
            " (e.g. 'netlify', 'firebase', or ['netlify','firebase']) to emit a file your host reads",
        )
      // The paths as written — staging paths under `'atomic'` and under
      // check — which `buildReport` maps back to the real folder, exactly as
      // it does for `sitemap`, `llms` and `feed`.
      //
      // `file` stays the *host* file and keeps its meaning from 2.3: the
      // thing the host will read. Under `'none'`, and under a custom writer
      // that wrote nothing there, it is `null` — the honest answer, and the
      // one that stops the report claiming a redirect that no host serves.
      const buildDir = kiss._writeRoot
      // The *first* host file, in `formats` order. With one format that is
      // the only one and `file` means what it meant in 2.3; with several it
      // is a lead rather than the whole answer, which is what `files` is
      // for. `null` when no host format ran at all.
      const hostFile = files.find(
        (path) => path !== `${buildDir}/redirects.json`,
      )
      kiss._redirectsPath = hostFile ?? null
      kiss._redirectsJsonPath = files.includes(`${buildDir}/redirects.json`)
        ? `${buildDir}/redirects.json`
        : null
    })
    .catch((error) => {
      // A failure of the build, unlike the sitemap, llms.txt and the feed: a
      // site published without its `_redirects` is a site whose old URLs
      // 404, which is the loss the aliases exist to prevent. Pushed onto
      // `_failures` just above the settle branch that reads it, so the
      // staging folder is discarded and the previous deployment stays live.
      // Names the config key, because with a custom writer the failure is
      // very often in the site's own function rather than in the write.
      kiss.logger.error(
        `Error writing redirects (config.redirects.format: ${JSON.stringify(kiss._redirectsFormats)})`,
      )
      kiss.logger.warn(error)
      kiss._failures.push({ view: '<redirects>', buildTo: null, error })
    })
  return kiss._redirectsRun
}

// The last recorded build, or `null` — the baseline the `removed` finding is
// measured against.
//
// Gated on the **file**, never on `isRecorded()`: that answers "is there a
// `site-map.json`", which `_buildAikb()` has just written one line above, so
// on a site's very first `kiss-ssg aikb` it flips to true within this method
// while `last-build.json` does not exist yet either way. A record that cannot
// be read is no baseline rather than a build failure — the finding is
// advisory, and a corrupt file is not a reason to fail a site that built.
export function lastBuildRecord(kiss) {
  const folder = kiss.config.folders.aikb
  if (!folder) return null
  const file = `${utils.posixPath(folder)}/last-build.json`
  if (!fs.existsSync(file)) return null
  try {
    // The same reader `kiss-ssg check --against` uses, so the baseline this
    // build judges itself against and the one the bin diffs against are read
    // by one piece of code.
    const [record] = readReportsFile(fs.readFileSync(file, 'utf8'))
    return record ?? null
  } catch (err) {
    kiss.logger.debug(`Unreadable ${file}: ${err.message}`)
    return null
  }
}

// The two rename findings, and the report's `redirects` key. Pure apart from
// reading the record: the file itself was written back in the settle path,
// before the folder moved, and this only describes it.
//
// `null` when there is nothing to say: no alias anywhere in the site, and no
// finding. A site that uses neither feature reports `null` — and so does a
// recorded site with nothing wrong, which is what keeps `last-build.json`
// byte-identical across two identical records. The alternative, an empty
// verdict whenever a record happens to exist, makes a site's *first* record
// differ from its second for no change to the site at all: the first is
// written before there is a baseline, the second after.
export function findRedirectChanges(kiss) {
  const buildDir = kiss._writeRoot
  // Re-collected rather than carried over from the write: the same pure
  // function over the same stack, so the two cannot disagree, and the count
  // stays right on a build where the write was skipped.
  const trailingSlash = kiss.config.links?.trailingSlash ?? true
  const rules = collectAliases(kiss._stack, { buildDir, trailingSlash })
  const previous = kiss._lastBuildRecord()
  const { removed, collisions, moved } = redirectFindings({
    rules,
    // `_stackForRecord()`, not the raw stack: the ids the record carries are
    // the projected ones, so a default id withdrawn from two pages is `null`
    // on both sides and cannot pair with an explicit id of the same name in
    // the baseline. The one identity the report shows is the one the pairing
    // uses.
    currentPages: kiss
      ._stackForRecord()
      .filter((entry) => entry.page.options.generate !== false)
      .map((entry) => ({ buildTo: entry.buildTo, id: entry.id ?? null })),
    previousPages: previous,
    buildDir,
    trailingSlash,
  })
  // `collisions` cannot be non-empty without a rule, so the three parts of
  // "nothing to say" are the rules, the removals and the moves — and a move
  // is the one finding a site with no alias anywhere can still have.
  if (rules.length === 0 && removed.length === 0 && moved.length === 0)
    return null
  // One line per finding, in `formatReport`'s wording, so the build log and
  // `check --summary` say the same thing. Advisory: none of them moves
  // anything. The move carries its fix with it, because the fix is one line
  // of the page's own registration and the person reading the notice is the
  // person who just moved the page.
  for (const path of removed)
    kiss.logger.notice(`removed without redirect: ${path}`)
  for (const move of moved)
    kiss.logger.notice(
      `moved without redirect: ${move.from} -> ${move.to} (${move.id})` +
        ` — add "${move.from}" to that page's aliases`,
    )
  for (const path of collisions)
    kiss.logger.notice(`alias collides with a page: ${path}`)
  return {
    file: kiss._redirectsPath,
    aliases: rules.length,
    // The resolved list, not just its length. It is the whole point of the
    // block: `_redirects` is one host's encoding of a portable fact, and a
    // site whose host reads a different one needs the fact, not the file.
    // Handed over as data so a deploy script can write firebase.json,
    // vercel.json or an nginx block from `kiss.report()` without parsing
    // anything kiss wrote — and so a format kiss has never heard of costs
    // nobody a change here.
    rules,
    json: kiss._redirectsJsonPath,
    formats: kiss._redirectsFormats,
    files: kiss._redirectsFiles,
    removed,
    collisions,
    moved,
  }
}
