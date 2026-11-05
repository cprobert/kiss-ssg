// `kiss-ssg css`, end to end through the bin, on a build folder written here:
// a site-wide stylesheet on three pages, a type's stylesheet on two, one on a
// single page, an inline block on two pages, kiss's own consent style on every
// page, a rule written out in two stylesheets and a _headers CSP that blocks
// inline styles. The purge is the real PurgeCSS.
import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const bin = path.join(repoRoot, 'bin', 'kiss-ssg.js')

let temp = null
afterEach(() => {
  if (temp) fs.rmSync(temp, { recursive: true, force: true })
  temp = null
})

const KISS_STYLE =
  '<style data-kiss-consent-style>.kiss-consent{position:fixed}</style>'
const HERO = '<style>\n  .hero { min-height: 40vh; }\n</style>'

const page = (title, links, extra = '') => `<!doctype html>
<html><head><title>${title}</title>
${links.map((href) => `<link rel="stylesheet" href="${href}">`).join('\n')}
${KISS_STYLE}
${extra}
</head><body><main class="page"><h1 class="title">${title}</h1></main></body></html>
`

function setUp() {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-css-'))
  const build = path.join(temp, 'public')
  const write = (rel, text) => {
    const file = path.join(build, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  write('index.html', page('Home', ['/css/site.css', '/css/home.css'], HERO))
  write(
    'blog/index.html',
    page('Blog', ['/css/site.css', '../css/post.css'], HERO),
  )
  write(
    'blog/first/index.html',
    page('First', ['/css/site.css', '/css/post.css?v=2']),
  )
  write(
    'css/site.css',
    '.page{margin:0 auto}.title{font-size:2rem}.unused-a{color:red}.unused-b{color:blue}\n',
  )
  write('css/post.css', '.page { margin: 0 auto }\n.byline{color:grey}\n')
  write('css/home.css', '.hero{background:navy}\n')
  write(
    '_headers',
    "/*\n  Content-Security-Policy: default-src 'self'; style-src 'self'\n",
  )
  return temp
}

const css = (cwd, args) =>
  spawnSync(process.execPath, [bin, 'css', ...args], { cwd, encoding: 'utf8' })

describe('kiss-ssg css', () => {
  it('audits the folder: stylesheets, inline blocks and every finding', () => {
    const cwd = setUp()
    const run = css(cwd, ['public', '--out', 'css.json'])
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
    const audit = JSON.parse(
      fs.readFileSync(path.join(cwd, 'css.json'), 'utf8'),
    )
    expect(audit.version).toBe(1)
    expect(audit.pages).toBe(3)
    expect(audit.thirdParty).toEqual([])
    expect(audit.stylesheets.map((s) => [s.path, s.pages, s.missing])).toEqual([
      ['css/home.css', 1, false],
      ['css/post.css', 2, false],
      ['css/site.css', 3, false],
    ])
    const site = audit.stylesheets.find((s) => s.path === 'css/site.css')
    // The two unused classes are what the real purge removes.
    expect(site.purged.bytes).toBeLessThan(site.bytes)
    expect(site.removable).toBeGreaterThan(0)
    // Only the hero block: kiss's own consent style is never reported.
    expect(audit.inline).toHaveLength(1)
    expect(audit.inline[0]).toMatchObject({
      text: '.hero { min-height: 40vh; }',
      pages: 2,
      paths: ['blog/index.html', 'index.html'],
    })
    expect(JSON.stringify(audit)).not.toContain('kiss-consent')
    expect(audit.findings).toEqual([
      {
        check: 'inline-style-blocked-by-csp',
        detail: "style-src 'self'",
        pages: ['blog/index.html', 'index.html'],
      },
      {
        check: 'inline-style-repeated',
        detail: '.hero { min-height: 40vh; } (2 pages)',
        pages: ['blog/index.html', 'index.html'],
      },
      {
        check: 'rule-duplicated',
        detail: '.page',
        files: ['css/post.css', 'css/site.css'],
      },
      {
        check: 'stylesheet-one-page',
        detail: 'css/home.css',
        pages: ['index.html'],
      },
    ])
    expect(run.stdout).toContain('css/site.css')
    expect(run.stdout).toContain(
      'Inline <style> blocks: 1 distinct, 1 on two or more pages',
    )
    expect(run.stdout).toContain('Findings (4):')
    expect(run.stdout).toContain('  stylesheet-one-page  css/home.css')
  })

  it('writes identical bytes on two runs over the same folder', () => {
    const cwd = setUp()
    expect(css(cwd, ['public', '--out', 'a.json']).status).toBe(0)
    expect(css(cwd, ['public', '--out', 'b.json']).status).toBe(0)
    expect(fs.readFileSync(path.join(cwd, 'a.json'), 'utf8')).toBe(
      fs.readFileSync(path.join(cwd, 'b.json'), 'utf8'),
    )
  })

  it('exits 2 on a usage error and on a target that is not a folder', () => {
    const cwd = setUp()
    const none = css(cwd, [])
    expect(none.status).toBe(2)
    expect(none.stderr).toMatch(/needs a build folder/)
    const file = css(cwd, ['public/_headers'])
    expect(file.status).toBe(2)
    expect(file.stderr).toMatch(/is not a folder/)
    expect(css(cwd, ['missing']).status).toBe(2)
    const help = css(cwd, ['--help'])
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('kiss-ssg css <build-folder>')
  })

  it('is listed in the top-level help', () => {
    const run = spawnSync(process.execPath, [bin, '--help'], {
      encoding: 'utf8',
    })
    expect(run.stdout).toMatch(/^ {2}css <folder> /m)
  })
})
