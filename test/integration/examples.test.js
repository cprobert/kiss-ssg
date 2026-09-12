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

// Example 9's committed knowledge base: written by `kiss-ssg aikb` and by
// nothing else, byte-stable across two records, and outside `public/` because
// it is source, not output.
const AIKB_FILES = [
  'README.md',
  'site-map.md',
  'site-map.json',
  'last-build.json',
]
const aikbDir = path.join(examplesDir, '9-migrated-from-v1/AIKB')
const readAikb = (file) => readFileSync(path.join(aikbDir, file), 'utf8')

// The published command line, run the way a person records a site: from
// `examples/`, so the script's own relative folders resolve as they do in
// every other test here.
const runBin = (args) =>
  spawnSync(
    process.execPath,
    [path.join(repoRoot, 'bin/kiss-ssg.js'), ...args],
    {
      cwd: examplesDir,
      encoding: 'utf8',
      timeout: 60000,
    },
  )

// Example 11's committed knowledge base, recorded the same way — two subjects
// this time, so it is the folder with more than one note in it.
const blogAikbDir = path.join(examplesDir, '11-blog/AIKB')
const readBlogAikb = (file) =>
  readFileSync(path.join(blogAikbDir, file), 'utf8')

// One `check` through the published bin, as data. stdout is `{ reports, diff }`
// once a site has a recorded baseline and a bare array before that, which is
// why both shapes are unwrapped here rather than at each call.
function checkReport(args) {
  const r = runBin(['check', ...args])
  const parsed = JSON.parse(r.stdout)
  return { status: r.status, report: (parsed.reports ?? parsed)[0] }
}

describe.skipIf(!hasExamples)('example builds', () => {
  // Never `.concurrent`: every example writes into the one shared repo-root
  // `public/`, so two builds racing would corrupt each other's page counts.
  // Vitest runs a plain `describe`'s tests in declaration order by default,
  // which is all sequencing this needs.
  describe('the eleven examples, built in place', () => {
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

      // A build that fails can never be recorded, so this example ships no
      // knowledge base at all — and an ordinary build writes none either.
      expect(existsSync(path.join(examplesDir, '8-data-fed-site/AIKB'))).toBe(
        false,
      )
    }, 60000)

    it('8 · --atomic discards the whole build, leaving no staging folder', () => {
      cleanOutput('8-data-fed-site')
      const r = runExample('8-data-fed-site.js', ['--atomic'])
      expect(r.status).toBe(1)
      const leftoverStaging = readdirSync(publicDir).filter((f) =>
        f.startsWith('8-data-fed-site.kiss-staging-'),
      )
      expect(leftoverStaging).toEqual([])
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

    it('9 · records a byte-identical knowledge base through the bin', () => {
      // The committed folder is the exemplar, and this is the property the
      // whole feature rests on: recording an unchanged site a second time must
      // leave `git status` clean, or every diff in the folder is noise. Run
      // through the published command line, because that is the only writer —
      // the build above wrote none of this.
      const before = AIKB_FILES.map(readAikb)

      const r = runBin(['aikb', '9-migrated-from-v1.js', '--summary'])

      expect(r.status).toBe(0)
      expect(r.stdout).toContain('recorded 9-migrated-from-v1/AIKB')
      expect(AIKB_FILES.map(readAikb)).toEqual(before)
      // A record publishes nothing, so nothing in it names the staging sibling
      // it was built through, and the authored half is untouched.
      expect(readAikb('last-build.json')).not.toContain('kiss-staging')
      expect(
        existsSync(path.join(aikbDir, 'notes/controllers/shelf-item.md')),
      ).toBe(true)
      // Every subject has a note: `shelf-item.js` is the only one (the
      // pure-controllers page's controller is inline, so it cannot be). All
      // four findings are empty, which is what makes this folder an exemplar
      // rather than a specimen: the note is stamped with the controller's
      // current hash, and every file it cites resolves.
      const report = JSON.parse(readAikb('last-build.json'))
      const subjects = [
        {
          kind: 'controllers',
          id: 'shelf-item.js',
          note: 'notes/controllers/shelf-item.md',
          hash: expect.stringMatching(/^[0-9a-f]{40}$/),
        },
      ]
      expect(report.ok).toBe(true)
      expect(report.aikb).toEqual({
        folder: '9-migrated-from-v1/AIKB',
        written: true,
        notes: { missing: [], dead: [], stale: [], dangling: [] },
        subjects,
      })
      expect(JSON.parse(readAikb('site-map.json')).subjects).toEqual(subjects)
      // The stamp in the authored note is the hash in the generated map — the
      // one thing a person maintains by hand, shown being maintained.
      const note = readFileSync(
        path.join(aikbDir, 'notes/controllers/shelf-item.md'),
        'utf8',
      )
      expect(note).toContain(`subject-hash: ${report.aikb.subjects[0].hash}`)
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

    it('11 · blog builds 14 pages, one redirect and a feed of six posts newest first', () => {
      cleanOutput('11-blog')
      const r = runExample('11-blog.js')
      expect(r.status).toBe(0)
      const dir = path.join(publicDir, '11-blog')
      expect(countHtmlFiles(dir)).toBe(14)

      // The rename recipe: one post's record carries `aliases`, so the build
      // writes exactly one 301 — and its target is the page's canonical path,
      // the same string the sitemap and the feed give that page.
      expect(readFileSync(path.join(dir, '_redirects'), 'utf8')).toBe(
        '/blog/cascara-notes.html /blog/the-cascara-experiment/ 301\n',
      )

      // Six items: the posts and only the posts. The listing and tag pages are
      // inside `section: 'blog'` but carry no date, so they fall out on their
      // own — and the order is the feature, not the count.
      const feed = readFileSync(path.join(dir, 'feed.xml'), 'utf8')
      expect(feed.match(/<item>/g) ?? []).toHaveLength(6)
      const dates = [...feed.matchAll(/<pubDate>(.*?)<\/pubDate>/g)].map((m) =>
        Date.parse(m[1]),
      )
      expect(dates).toHaveLength(6)
      expect([...dates].sort((a, b) => b - a)).toEqual(dates)
    }, 60000)

    it('11 · reports no broken link by default and exactly one under --broken', () => {
      // The finding the example exists to make visible, read through the
      // published command line rather than off a log line.
      const clean = checkReport(['11-blog.js'])
      expect(clean.status).toBe(0)
      expect(clean.report.ok).toBe(true)
      expect(clean.report.links.broken).toEqual([])
      expect(clean.report.links.checked).toBeGreaterThan(0)
      expect(clean.report.redirects.aliases).toBe(1)
      expect(clean.report.redirects.removed).toEqual([])
      expect(clean.report.redirects.collisions).toEqual([])

      const broken = checkReport(['11-blog.js', '--broken'])
      // Still `ok`, still exit 0: a broken link is a finding, not a failure.
      expect(broken.status).toBe(0)
      expect(broken.report.ok).toBe(true)
      expect(broken.report.links.broken).toEqual([
        {
          page: '../public/11-blog/blog/the-cascara-experiment/index.html',
          href: '/blog/the-kenya-microlot/',
        },
      ])
    }, 60000)

    it('11 · records a byte-identical knowledge base with two stamped notes', () => {
      const before = AIKB_FILES.map(readBlogAikb)

      const r = runBin(['aikb', '11-blog.js', '--summary'])

      expect(r.status).toBe(0)
      expect(r.stdout).toContain('recorded 11-blog/AIKB')
      expect(AIKB_FILES.map(readBlogAikb)).toEqual(before)
      expect(readBlogAikb('last-build.json')).not.toContain('kiss-staging')

      // Two controller files, two notes, and nothing left to say about either:
      // all four findings empty is what makes this an exemplar rather than a
      // specimen.
      const report = JSON.parse(readBlogAikb('last-build.json'))
      expect(report.ok).toBe(true)
      expect(report.aikb.folder).toBe('11-blog/AIKB')
      expect(report.aikb.written).toBe(true)
      expect(report.aikb.notes).toEqual({
        missing: [],
        dead: [],
        stale: [],
        dangling: [],
      })
      expect(report.aikb.subjects.map((s) => s.id)).toEqual([
        'post.js',
        'tag.js',
      ])
      // Each note carries its own subject's current hash — the one line a
      // person maintains by hand, shown being maintained twice over.
      for (const subject of report.aikb.subjects) {
        expect(subject.hash).toMatch(/^[0-9a-f]{40}$/)
        expect(
          readFileSync(path.join(blogAikbDir, subject.note), 'utf8'),
        ).toContain(`subject-hash: ${subject.hash}`)
      }
    }, 60000)
  })
})
