import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  DEFAULTS,
  parseArgs,
  shotName,
  serveFolder,
} from '../../scripts/screenshot.mjs'

// The browser half (`shoot`) is not exercised here: CI has no Playwright
// Chromium, and a test that downloads one is not a unit test. What is tested is
// everything that decides *what* the browser is pointed at — the arguments, the
// file names and the server — which is where both bugs this script replaces
// lived (`file://`, and a URL cut on `:` to name a file).

describe('parseArgs', () => {
  it('takes the build folder and applies the defaults', () => {
    const opts = parseArgs(['public'])
    expect(opts.root).toBe(path.resolve('public'))
    expect(opts.pages).toEqual(DEFAULTS.pages)
    expect(opts.widths).toEqual([320, 768, 1440])
    expect(opts.schemes).toEqual(['light'])
    expect(opts.fullPage).toBe(true)
    // Outside the repo: beside a build folder under examples/ it would ship.
    expect(opts.out).toBe(path.join(os.tmpdir(), 'kiss-screenshots'))
  })

  it('accepts --page repeated and as a comma list, and roots a bare name', () => {
    const opts = parseArgs(['public', '--page=/,blog/', '--page=/about/'])
    expect(opts.pages).toEqual(['/', '/blog/', '/about/'])
  })

  it('reads widths, height, schemes, viewport-only and out', () => {
    const opts = parseArgs([
      'public',
      '--width=1023',
      '--height=700',
      '--scheme=light,dark',
      '--viewport-only',
      '--out=shots',
    ])
    expect(opts.widths).toEqual([1023])
    expect(opts.height).toBe(700)
    expect(opts.schemes).toEqual(['light', 'dark'])
    expect(opts.fullPage).toBe(false)
    expect(opts.out).toBe(path.resolve('shots'))
  })

  it.each([
    [[], /Name the build folder/],
    [['a', 'b'], /One build folder only/],
    [['public', '--width=0'], /positive whole numbers/],
    [['public', '--width=wide'], /positive whole numbers/],
    [['public', '--scheme=sepia'], /light or dark/],
    [['public', '--colour=red'], /Unknown option/],
    // Git Bash's rewrite of `--page=/`, seen on the first real run.
    [['public', '--page=C:/Program Files/Git/'], /Git Bash rewrote it/],
    [['public', '--page=/C:/Program Files/Git/,/blog/'], /Git Bash rewrote it/],
  ])('refuses %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message)
  })
})

describe('shotName', () => {
  it('names the home page index', () => {
    expect(shotName('/', 320, 'light')).toBe('index--320-light.png')
  })

  it('keeps a nested path readable and drops the trailing slash', () => {
    expect(shotName('/blog/pour-over/', 1440, 'dark')).toBe(
      'blog_pour-over--1440-dark.png',
    )
  })

  it('never lets a colon, a query or a reserved character reach the name', () => {
    const name = shotName('/a:b?c=d*e|f', 768, 'light')
    expect(name).toBe('a_b_c_d_e_f--768-light.png')
    expect(name).not.toMatch(/[:?*|<>"\\]/)
  })
})

describe('serveFolder', () => {
  // The build folder sits inside its own temp parent, beside a file the
  // server must never hand out.
  let parent
  let root
  let server

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-screenshot-'))
    root = path.join(parent, 'public')
    fs.mkdirSync(path.join(root, 'blog'), { recursive: true })
    fs.writeFileSync(path.join(root, 'index.html'), '<h1>home</h1>')
    fs.writeFileSync(path.join(root, 'about.html'), '<h1>about</h1>')
    fs.writeFileSync(path.join(root, 'blog', 'index.html'), '<h1>blog</h1>')
    fs.writeFileSync(path.join(root, '404.html'), '<h1>lost</h1>')
    fs.writeFileSync(path.join(parent, 'outside-secret.txt'), 'nope')
    server = await serveFolder(root)
  })

  afterAll(async () => {
    await server?.close()
    fs.rmSync(parent, { recursive: true, force: true })
  })

  // A raw request, not `fetch`: the URL parser normalises `..` and `%2e%2e`
  // before anything is sent, and a traversal test through it proves nothing.
  const get = (p) =>
    new Promise((resolve, reject) => {
      http
        .get(server.url + '/', { path: p }, (res) => {
          let body = ''
          res.setEncoding('utf8')
          res.on('data', (chunk) => (body += chunk))
          res.on('end', () => resolve({ status: res.statusCode, body }))
        })
        .on('error', reject)
    })

  it('binds an OS-chosen port on loopback over HTTP', () => {
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(server.url).not.toMatch(/:0$/)
  })

  it('serves the folder as the site root, with the dev server rules', async () => {
    expect(await get('/')).toEqual({ status: 200, body: '<h1>home</h1>' })
    expect(await get('/about')).toEqual({ status: 200, body: '<h1>about</h1>' })
    expect(await get('/blog/')).toEqual({ status: 200, body: '<h1>blog</h1>' })
  })

  it('answers an unknown path 404 with the site 404 page, as a host does', async () => {
    expect(await get('/nowhere')).toEqual({
      status: 404,
      body: '<h1>lost</h1>',
    })
  })

  it('never serves a file from above the root', async () => {
    for (const p of [
      '/../outside-secret.txt',
      '/%2e%2e/outside-secret.txt',
      '/..%2foutside-secret.txt',
      '/..%5coutside-secret.txt',
    ]) {
      const res = await get(p)
      expect(res.body, p).not.toBe('nope')
    }
  })

  it('refuses a folder that does not exist', async () => {
    await expect(serveFolder(path.join(root, 'missing'))).rejects.toThrow(
      /build the site first/,
    )
  })
})
