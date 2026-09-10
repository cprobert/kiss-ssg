import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// This suite only ever runs against this repo's own examples/ — a consuming
// project never gets this test file (it is under test/, outside package.json's
// `files`) — so relative paths off import.meta.dirname are all that is needed.
const repoRoot = path.resolve(import.meta.dirname, '../..')
const examplesDir = path.join(repoRoot, 'examples')
const publicDir = path.join(repoRoot, 'public')
const hasExamples = existsSync(examplesDir)

// Every example writes into the one shared repo-root `public/`, so the suite
// runs sequentially (never `concurrent`) and clears each example's own output
// folder immediately before building it — the only way a page count is exact
// rather than a leftover from a previous run or a previous example.
function cleanOutput(name) {
  rmSync(path.join(publicDir, name), { recursive: true, force: true })
}

function countHtmlFiles(dir) {
  if (!existsSync(dir)) return 0
  return readdirSync(dir, { recursive: true }).filter((f) =>
    f.endsWith('.html'),
  ).length
}

function countMatching(dir, pattern) {
  if (!existsSync(dir)) return 0
  return readdirSync(dir, { recursive: true }).filter((f) => pattern.test(f))
    .length
}

// A build that hangs (a stray `--dev`, a port bind that never resolves) must
// fail the test rather than the whole run — `timeout` turns that into a
// normal non-zero-exit assertion failure instead of a stuck CI job.
function runExample(script, args = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: examplesDir,
    encoding: 'utf8',
    timeout: 60000,
  })
}

const output = (r) => `${r.stdout ?? ''}${r.stderr ?? ''}`

// Example 8's committed knowledge base: written by every build, byte-stable
// across two of them, and outside `public/` because it is source, not output.
const AIKB_FILES = [
  'README.md',
  'site-map.md',
  'site-map.json',
  'last-build.json',
]
const readAikb = (file) =>
  readFileSync(path.join(examplesDir, '8-data-fed-site/AIKB', file), 'utf8')

describe.skipIf(!hasExamples)('example builds', () => {
  // Never `.concurrent`: every example writes into the one shared repo-root
  // `public/`, so two builds racing would corrupt each other's page counts.
  // Vitest runs a plain `describe`'s tests in declaration order by default,
  // which is all sequencing this needs.
  describe('the ten examples, built in place', () => {
    it('1 · scan builds 2 pages', () => {
      cleanOutput('1-scan')
      const r = runExample('1-scan.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '1-scan'))).toBe(2)
    }, 60000)

    it('2 · page builds 3 pages, including feed.xml', () => {
      cleanOutput('2-page')
      const r = runExample('2-page.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '2-page'))).toBe(3)
      expect(existsSync(path.join(publicDir, '2-page/feed.xml'))).toBe(true)
    }, 60000)

    it('3 · pages fans out to 8 pages', () => {
      cleanOutput('3-pages')
      const r = runExample('3-pages.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '3-pages'))).toBe(8)
    }, 60000)

    it('4 · layouts and partials builds 2 pages', () => {
      cleanOutput('4-layouts-and-partials')
      const r = runExample('4-layouts-and-partials.js')
      expect(r.status).toBe(0)
      expect(
        countHtmlFiles(path.join(publicDir, '4-layouts-and-partials')),
      ).toBe(2)
    }, 60000)

    it('5 · helpers builds 2 pages', () => {
      cleanOutput('5-helpers')
      const r = runExample('5-helpers.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '5-helpers'))).toBe(2)
    }, 60000)

    it('6 · sitemap builds 4 pages, a sitemap, an llms.txt and a hashed stylesheet', () => {
      cleanOutput('6-sitemap')
      const r = runExample('6-sitemap.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '6-sitemap'))).toBe(4)
      expect(existsSync(path.join(publicDir, '6-sitemap/sitemap.xml'))).toBe(
        true,
      )
      // The one example that writes both: llms.txt lists the three pages the
      // sitemap does, and not the `ignoreSitemap` one.
      const llms = readFileSync(
        path.join(publicDir, '6-sitemap/llms.txt'),
        'utf8',
      )
      expect(llms.match(/^- \[/gm)).toHaveLength(3)
      expect(llms).not.toContain('rota')
      expect(
        countMatching(
          path.join(publicDir, '6-sitemap/css'),
          /^site\.[0-9a-f]{8}\.css$/,
        ),
      ).toBe(1)
    }, 60000)

    it('7 · versioned outputs builds the season plus the archive index (2 pages)', () => {
      // The whole archive, not just one season folder: the top-level index
      // lists every season directory it finds, so a leftover from an earlier
      // run would change what it reports.
      cleanOutput('7-versioned-outputs')
      const r = runExample('7-versioned-outputs.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '7-versioned-outputs'))).toBe(
        2,
      )
      expect(
        existsSync(path.join(publicDir, '7-versioned-outputs/test/index.html')),
      ).toBe(true)
    }, 60000)

    it('8 · data-fed site fails on purpose, building the other 6 pages', () => {
      cleanOutput('8-data-fed-site')
      const r = runExample('8-data-fed-site.js')
      expect(r.status).toBe(1)
      const text = output(r)
      expect(text).toContain(
        'stockists/stockist.hbs [item 3: harbour-market-stall]',
      )
      expect(text).toContain('missing address')
      expect(countHtmlFiles(path.join(publicDir, '8-data-fed-site'))).toBe(6)

      // The knowledge base `.aikb()` writes is committed, so it is written even
      // by this deliberately failing build — and every subject in it has a note
      // (only `stockist.js` is one: the index page's controller is inline).
      const report = JSON.parse(readAikb('last-build.json'))
      expect(report.ok).toBe(false)
      expect(report.aikb.notes).toEqual({ missing: [], dead: [] })
      expect(readAikb('site-map.md')).toContain('`file:stockist.js`')
    }, 60000)

    it('8 · --atomic discards the whole build, leaving no staging folder', () => {
      // Snapshot the committed folder before the second run, which builds the
      // same site a different way: byte-identical output is what keeps the
      // folder out of `git status` and makes any diff in it a real one.
      const before = AIKB_FILES.map(readAikb)
      cleanOutput('8-data-fed-site')
      const r = runExample('8-data-fed-site.js', ['--atomic'])
      expect(r.status).toBe(1)
      const leftoverStaging = readdirSync(publicDir).filter((f) =>
        f.startsWith('8-data-fed-site.kiss-staging-'),
      )
      expect(leftoverStaging).toEqual([])
      expect(AIKB_FILES.map(readAikb)).toEqual(before)
      // ...and nothing in it names the staging sibling it was built through.
      expect(readAikb('last-build.json')).not.toContain('kiss-staging')
    }, 60000)

    it('9 · migrated from v1 builds 11 pages with the recipes intact', () => {
      cleanOutput('9-migrated-from-v1')
      const r = runExample('9-migrated-from-v1.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '9-migrated-from-v1'))).toBe(
        11,
      )

      // The guarded dynamic-partial block warns exactly once — the `lookup`
      // helper dedupes per page per key, not per call (see handlebars-helpers.js).
      const text = output(r)
      const warnings = (
        text.match(
          /lookup: 'partial' is undefined in dynamic-partials\.hbs/g,
        ) ?? []
      ).length
      expect(warnings).toBe(1)

      // The duplicate-paths recipe: two sources both offer "Guji Uraga", and
      // the dedupe keeps only the catalogue's — never a second shelf page.
      expect(
        countMatching(
          path.join(publicDir, '9-migrated-from-v1/shelf'),
          /guji-uraga/,
        ),
      ).toBe(1)

      // The Handlebars-per-instance recipe: the `renderPartial` helper reads
      // `kiss.handlebars.partials`, not the global module, so the partial
      // actually renders into the page rather than an empty string.
      const handlebarsInstancePage = path.join(
        publicDir,
        '9-migrated-from-v1/handlebars-instance.html',
      )
      expect(existsSync(handlebarsInstancePage)).toBe(true)
      expect(readFileSync(handlebarsInstancePage, 'utf8')).toContain(
        '4 kg a week',
      )
    }, 60000)

    it('10 · asset pipeline builds 1 page and the stylesheet its step generated', () => {
      cleanOutput('10-asset-pipeline')
      const r = runExample('10-asset-pipeline.js')
      expect(r.status).toBe(0)
      expect(countHtmlFiles(path.join(publicDir, '10-asset-pipeline'))).toBe(1)

      // The step ran before the asset copy, so what it wrote is in the build —
      // which is the whole feature, and the one thing a page count cannot show.
      const generated = path.join(
        publicDir,
        '10-asset-pipeline/css/generated.css',
      )
      expect(existsSync(generated)).toBe(true)
      expect(readFileSync(generated, 'utf8')).toContain('--accent:')
      expect(output(r)).toContain('pipeline: tokens ok')
    }, 60000)
  })
})
