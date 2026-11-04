// `kiss-ssg speed`, end to end through the bin, with a fake `lighthouse` and
// a fake `chrome-launcher` in a temp site's node_modules — resolved from the
// site's folder, the way the real ones are. The fake Lighthouse fetches the
// page from the server speed started, so the serving is real; what it returns
// is the trimmed real result in test/fixtures/lighthouse/. A real Lighthouse
// run (network, Chrome, minutes) happens only with KISS_LIGHTHOUSE_TESTS=1.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { INSTALL_LINE, nodeAtLeast, readSpeedFile } from '../../lib/speed.js'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')
const fixture = path.join(
  repoRoot,
  'test',
  'fixtures',
  'lighthouse',
  'blog-home.json',
)

let temp = null
afterEach(() => {
  if (temp) fs.rmSync(temp, { recursive: true, force: true })
  temp = null
})

// The fake Lighthouse: fetch the page (a 404 is a runtimeError, as in a real
// run), then return the fixture with FAKE_LH_SCORE as the score when set.
// node:http with no agent rather than fetch: undici keeps the socket alive
// past the response, and Node on Windows aborts when process.exit() meets a
// handle still closing (AIKB/speed.md).
const FAKE_LIGHTHOUSE = `import fs from 'node:fs'
import http from 'node:http'
const status = (url) =>
  new Promise((resolve, reject) =>
    http.get(url, { agent: false }, (res) => {
      res.resume()
      res.on('end', () => resolve(res.statusCode))
    }).on('error', reject),
  )
export default async function lighthouse(url, flags) {
  if (typeof flags.port !== 'number') throw new Error('no Chrome port')
  const lhr = JSON.parse(fs.readFileSync(process.env.FAKE_LHR, 'utf8'))
  lhr.requestedUrl = url
  const code = await status(url)
  if (code !== 200) {
    lhr.runtimeError = { code: 'ERRORED_DOCUMENT_REQUEST', message: 'Status code: ' + code }
    lhr.categories.performance.score = null
  }
  if (process.env.FAKE_LH_SCORE) lhr.categories.performance.score = Number(process.env.FAKE_LH_SCORE)
  fs.appendFileSync(process.env.FAKE_LH_LOG, url + '\\n')
  return { lhr }
}
`
const FAKE_LAUNCHER = `let port = 9000
export async function launch() {
  if (process.env.FAKE_NO_CHROME) {
    const err = new Error('No Chrome installations found.')
    err.code = 'ERR_LAUNCHER_NOT_INSTALLED'
    throw err
  }
  return { port: ++port, kill: async () => {} }
}
`

function setUp({ lighthouse = true } = {}) {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-speed-'))
  const site = path.join(temp, 'site')
  fs.mkdirSync(path.join(site, 'public', 'blog'), { recursive: true })
  fs.writeFileSync(
    path.join(site, 'package.json'),
    '{ "name": "site", "private": true }\n',
  )
  fs.writeFileSync(path.join(site, 'public', 'index.html'), '<h1>Home</h1>\n')
  fs.writeFileSync(
    path.join(site, 'public', 'blog', 'index.html'),
    '<h1>Blog</h1>\n',
  )
  fs.writeFileSync(path.join(site, 'router.js'), '// a site script\n')
  if (lighthouse) {
    const lh = path.join(site, 'node_modules', 'lighthouse')
    // Nested, not hoisted: speed resolves chrome-launcher from Lighthouse.
    const cl = path.join(lh, 'node_modules', 'chrome-launcher')
    fs.mkdirSync(cl, { recursive: true })
    const manifest = (name) =>
      JSON.stringify({
        name,
        version: '13.6.0',
        type: 'module',
        main: 'index.js',
      })
    fs.writeFileSync(path.join(lh, 'package.json'), manifest('lighthouse'))
    fs.writeFileSync(path.join(lh, 'index.js'), FAKE_LIGHTHOUSE)
    fs.writeFileSync(path.join(cl, 'package.json'), manifest('chrome-launcher'))
    fs.writeFileSync(path.join(cl, 'index.js'), FAKE_LAUNCHER)
  }
  return site
}

function speed(site, args, env = {}) {
  const log = path.join(temp, 'lighthouse.log')
  const run = spawnSync(process.execPath, [bin, 'speed', ...args], {
    cwd: site,
    encoding: 'utf8',
    env: { ...process.env, FAKE_LHR: fixture, FAKE_LH_LOG: log, ...env },
  })
  return {
    ...run,
    urls: fs.existsSync(log)
      ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean)
      : [],
  }
}

describe('kiss-ssg speed: prerequisites and usage', () => {
  it('exits 2 with the install line when the site has no Lighthouse', () => {
    const site = setUp({ lighthouse: false })
    const run = speed(site, ['public'])
    expect(run.status).toBe(2)
    expect(run.stderr).toContain(INSTALL_LINE)
    expect(run.stdout).toBe('')
  })

  it('exits 2 on a usage error, before loading anything', () => {
    const site = setUp()
    const run = speed(site, ['public', '--runs', '10'])
    expect(run.status).toBe(2)
    expect(run.stderr).toMatch(/--runs takes a whole number from 1 to 9/)
    expect(run.urls).toEqual([])
  })

  it('refuses a site script, saying to name the build folder', () => {
    const site = setUp()
    const run = speed(site, ['router.js'])
    expect(run.status).toBe(2)
    expect(run.stderr).toMatch(/never runs the build/)
  })

  it('exits 2 on an unreadable --against file, before measuring', () => {
    const site = setUp()
    const run = speed(site, ['public', '--against', 'missing.json'])
    expect(run.status).toBe(2)
    expect(run.stderr).toMatch(/cannot read --against file missing\.json/)
    expect(run.urls).toEqual([])
  })

  it.runIf(!nodeAtLeast(process.versions.node))(
    'exits 2 naming the Node Lighthouse needs, on an older Node',
    () => {
      const run = speed(setUp(), ['public'])
      expect(run.status).toBe(2)
      expect(run.stderr).toMatch(/needs Node 22\.19 or newer/)
    },
  )
})

describe.skipIf(!nodeAtLeast(process.versions.node))(
  'kiss-ssg speed: a measurement with a fake Lighthouse',
  () => {
    it('serves the folder, runs each page, prints the table and writes --out', () => {
      const site = setUp()
      const run = speed(site, [
        'public',
        '--page',
        '/',
        '--page',
        '/blog/',
        '--runs',
        '2',
        '--out',
        'speed/before.json',
      ])
      expect(run.status, run.stderr).toBe(0)
      expect(run.urls).toHaveLength(4)
      expect(run.urls[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
      expect(run.urls[2]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/blog\/$/)
      expect(run.stdout).toMatch(/^Page\s+Score\s+LCP/m)
      expect(run.stdout).toMatch(/^\/\s+100\s+754 ms\s+0\.000\s+0 ms/m)
      expect(run.stdout).toMatch(/^\/blog\/\s+100/m)
      expect(run.stdout).toMatch(
        /Median of 2 runs per page, Lighthouse 13\.6\.0/,
      )
      expect(run.stderr).toMatch(/\/blog\/ run 2 of 2/)
      const record = readSpeedFile(
        fs.readFileSync(path.join(site, 'speed', 'before.json'), 'utf8'),
      )
      expect(record).toMatchObject({
        version: 1,
        lighthouse: '13.6.0',
        runs: 2,
      })
      expect(record.pages.map((p) => p.page)).toEqual(['/', '/blog/'])
      expect(record.pages[0]).toMatchObject({
        median: { score: 100, requests: 3, 'total-byte-weight': 12642 },
        spread: { score: { min: 100, max: 100 } },
      })
    })

    it('exits 1 when a page fails to load, and still measures the rest', () => {
      const site = setUp()
      const run = speed(site, [
        'public',
        '--page',
        '/gone/',
        '--page',
        '/',
        '--runs',
        '1',
      ])
      expect(run.status).toBe(1)
      expect(run.stdout).toMatch(
        /^\/gone\/\s+failed: ERRORED_DOCUMENT_REQUEST: Status code: 404$/m,
      )
      expect(run.stdout).toMatch(/^\/\s+100/m)
    })

    it('compares --against an earlier file, marking a change outside the noise', () => {
      const site = setUp()
      const before = speed(
        site,
        ['public', '--runs', '1', '--out', 'before.json'],
        {
          FAKE_LH_SCORE: '0.7',
        },
      )
      expect(before.status).toBe(0)
      const after = speed(
        site,
        ['public', '--runs', '1', '--against', 'before.json'],
        {
          FAKE_LH_SCORE: '0.95',
        },
      )
      expect(after.status).toBe(0)
      expect(after.stdout).toMatch(/Against the earlier measurement:/)
      expect(after.stdout).toMatch(/^\s+Score\s+70 -> 95\s+\+25\s+changed$/m)
      expect(after.stdout).toMatch(
        /^\s+LCP\s+754 ms -> 754 ms\s+0 ms\s+within noise$/m,
      )
    })

    it('exits 2 naming CHROME_PATH when there is no Chrome', () => {
      const site = setUp()
      const run = speed(site, ['public'], { FAKE_NO_CHROME: '1' })
      expect(run.status).toBe(2)
      expect(run.stderr).toMatch(/CHROME_PATH/)
      expect(run.urls).toEqual([])
    })
  },
)

// Installs the real Lighthouse into a temp folder (never the repo) and
// measures example 11, built first. Network, Chrome and a few minutes.
describe.skipIf(!process.env.KISS_LIGHTHOUSE_TESTS)(
  'a real Lighthouse (KISS_LIGHTHOUSE_TESTS=1)',
  () => {
    it('measures example 11 and writes a readable --out file', () => {
      temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-speed-real-'))
      fs.writeFileSync(
        path.join(temp, 'package.json'),
        '{ "name": "lh", "private": true }\n',
      )
      const npm = (args) =>
        process.platform === 'win32'
          ? spawnSync(`npm ${args.join(' ')}`, {
              cwd: temp,
              shell: true,
              encoding: 'utf8',
            })
          : spawnSync('npm', args, { cwd: temp, encoding: 'utf8' })
      expect(npm(['install', '--save-dev', 'lighthouse@13']).status).toBe(0)
      const example = path.join(repoRoot, 'examples', '11-blog')
      const built = spawnSync(process.execPath, ['router.js'], {
        cwd: example,
        encoding: 'utf8',
      })
      expect(built.status).toBe(0)
      const out = path.join(temp, 'speed.json')
      const run = spawnSync(
        process.execPath,
        [
          bin,
          'speed',
          path.join(example, 'public'),
          '--runs',
          '1',
          '--out',
          out,
        ],
        { cwd: temp, encoding: 'utf8' },
      )
      expect(run.status, run.stderr).toBe(0)
      const record = readSpeedFile(fs.readFileSync(out, 'utf8'))
      expect(record.lighthouse).toMatch(/^13\./)
      expect(record.pages[0]).toHaveProperty('median.score')
    }, 600_000)
  },
)
