#!/usr/bin/env node
// Screenshots of a build folder, served the way the `--dev` preview serves it.
//
// Every browser check in this repo used to start with a scratch script written
// for the session, and the 2026-10-12 branch wrote one six times. Two of those
// copies were wrong in ways that do not look wrong: one loaded pages from
// `file://`, where every root-relative `{{link}}` and stylesheet resolves
// against the drive rather than the site, and one cut a URL on `:` to name its
// file. So this is the one copy, with a test.
//
// Three decisions worth knowing before reading the code.
//
// **The folder is the site root, over HTTP, on port 0.** Never `file://`, and
// never a server rooted above the build folder (VS Code Live Server opened on
// the repo is the usual one), for the reason above. Port 0 means the OS picks a
// free port, so this never collides with a running preview on 3001.
//
// **It serves with the dev server's own rules** — `serve-static` with
// `extensions: ['html']` and `index.html` — so `/about` finds `about.html` here
// exactly when it does under `--dev`. An unknown path answers 404 with the
// site's `404.html` when it has one, which is what a host does and `--dev` does
// not.
//
// **Each shot reports horizontal overflow** — the document's scroll width
// beyond the viewport — because "the page is wider than the phone" is the
// browser-only defect a screenshot shows least clearly and a number shows best.
//
// Usage:
//   node scripts/screenshot.mjs <build-folder> [options]
//     --page=/ --page=/about/          pages to shoot (repeatable, or a comma list; default /)
//     --width=320,768,1440             viewport widths (default 320,768,1440)
//     --scheme=light,dark              prefers-color-scheme (default light)
//     --height=900                     viewport height (default 900)
//     --viewport-only                  the first screen only, not the full page
//     --out=<dir>                      where the PNGs go (default <os temp>/kiss-screenshots)
//   e.g. node scripts/screenshot.mjs examples/11-blog/public --page=/,/blog/ --scheme=light,dark
//
// Exits 1 when a page does not answer 200 or overflows (the PNGs are written
// either way), and 2 when it could not run at all.
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import os from 'node:os'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export const DEFAULTS = Object.freeze({
  pages: ['/'],
  widths: [320, 768, 1440],
  schemes: ['light'],
  height: 900,
  fullPage: true,
})

const SCHEMES = new Set(['light', 'dark'])

const list = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

const positiveInts = (flag, value) =>
  list(value).map((s) => {
    const n = Number(s)
    if (!Number.isInteger(n) || n <= 0)
      throw new Error(`${flag} takes positive whole numbers, got "${s}"`)
    return n
  })

/**
 * @param {string[]} argv
 * @returns {{ root: string, pages: string[], widths: number[], schemes: string[], height: number, fullPage: boolean, out: string }}
 */
export function parseArgs(argv) {
  let root = null
  let pages = null
  let widths = DEFAULTS.widths
  let schemes = DEFAULTS.schemes
  let height = DEFAULTS.height
  let fullPage = /** @type {boolean} */ (DEFAULTS.fullPage)
  let out = null
  for (const arg of argv) {
    const eq = arg.indexOf('=')
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const value = eq === -1 ? '' : arg.slice(eq + 1)
    if (flag === '--page') {
      pages = [...(pages ?? []), ...list(value)]
    } else if (flag === '--width') {
      widths = positiveInts(flag, value)
    } else if (flag === '--height') {
      height = positiveInts(flag, value)[0]
    } else if (flag === '--scheme') {
      schemes = list(value)
      const bad = schemes.find((s) => !SCHEMES.has(s))
      if (bad) throw new Error(`--scheme takes light or dark, got "${bad}"`)
    } else if (flag === '--viewport-only') {
      fullPage = false
    } else if (flag === '--out') {
      out = value
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`)
    } else if (root === null) {
      root = arg
    } else {
      throw new Error(`One build folder only, got "${root}" and "${arg}"`)
    }
  }
  if (root === null) throw new Error('Name the build folder to shoot')
  if (!widths.length) throw new Error('--width needs at least one width')
  if (!schemes.length) throw new Error('--scheme needs at least one scheme')
  // Git Bash rewrites an argument that looks like a POSIX path before node
  // sees it: `--page=/` arrives as `/C:/Program Files/Git/`, and the shot is
  // a 404 that reads like a broken site. A drive letter is never a page.
  const rewritten = (pages ?? []).find((p) => /^\/?[A-Za-z]:[\\/]/.test(p))
  if (rewritten)
    throw new Error(
      `--page "${rewritten}" is a Windows path, not a page: Git Bash rewrote it. Run from PowerShell, or with MSYS_NO_PATHCONV=1 and the build folder as a Windows path (C:\\…), which that setting stops Git Bash converting too`,
    )
  pages = (pages ?? DEFAULTS.pages).map((p) =>
    p.startsWith('/') ? p : `/${p}`,
  )
  root = path.resolve(root)
  // Never beside the build folder by default: under `examples/*/` that is a
  // whitelisted folder, and a gitignored file inside one is published anyway
  // (the `public/` and `.converted` lesson in CLAUDE.md).
  out = path.resolve(out ?? path.join(os.tmpdir(), 'kiss-screenshots'))
  return { root, pages, widths, schemes, height, fullPage, out }
}

/**
 * A file name for one shot. Every character outside `[a-z0-9-]` becomes `_`,
 * so a query, a colon or a Windows-reserved character can never reach the file
 * system, and `/` is `index` so the home page does not become `_`.
 *
 * @param {string} page
 * @param {number} width
 * @param {string} scheme
 */
export function shotName(page, width, scheme) {
  const trimmed = page.replace(/^\/+|\/+$/g, '')
  const slug =
    trimmed === '' ? 'index' : trimmed.toLowerCase().replace(/[^a-z0-9-]/g, '_')
  return `${slug}--${width}-${scheme}.png`
}

/**
 * Serves `root` as the site root on 127.0.0.1, on a port the OS chooses.
 *
 * @param {string} root
 * @returns {Promise<{ url: string, close: () => Promise<void> }>}
 */
export async function serveFolder(root) {
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory())
    throw new Error(`${root} is not a folder: build the site first`)
  const connect = require('connect')
  const serveStatic = require('serve-static')
  const app = connect()
  app.use(
    serveStatic(root, {
      cacheControl: false,
      extensions: ['html', 'htm'],
      index: ['index.html', 'index.htm'],
    }),
  )
  const notFound = path.join(root, '404.html')
  app.use((req, res) => {
    res.statusCode = 404
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found')
  })
  const server = http.createServer(app)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(undefined))
  })
  const address = server.address()
  if (address === null || typeof address === 'string')
    throw new Error('The server did not bind a TCP port')
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve) => server.close(() => resolve(undefined))),
  }
}

async function launchChromium() {
  const { chromium } = await import('playwright-core')
  try {
    return await chromium.launch()
  } catch (err) {
    if (/Executable doesn't exist/.test(String(err?.message)))
      throw new Error(
        'Playwright has no Chromium for this version. Run: npx playwright-core install chromium',
        { cause: err },
      )
    throw err
  }
}

/**
 * Shoots every page at every width in every scheme.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {Promise<Array<{ file: string, page: string, width: number, scheme: string, status: number | null, overflow: number }>>}
 */
export async function shoot(opts) {
  const server = await serveFolder(opts.root)
  let browser = null
  try {
    browser = await launchChromium()
    fs.mkdirSync(opts.out, { recursive: true })
    const results = []
    for (const scheme of opts.schemes) {
      const context = await browser.newContext({
        colorScheme: /** @type {'light' | 'dark'} */ (scheme),
      })
      const tab = await context.newPage()
      for (const page of opts.pages) {
        for (const width of opts.widths) {
          await tab.setViewportSize({ width, height: opts.height })
          const response = await tab.goto(server.url + page, {
            waitUntil: 'networkidle',
          })
          // A string, not a function: it runs in the page, where `document`
          // exists, and this file is linted and typechecked as Node.
          const overflow = Number(
            await tab.evaluate(
              'document.documentElement.scrollWidth - window.innerWidth',
            ),
          )
          const file = path.join(opts.out, shotName(page, width, scheme))
          await tab.screenshot({ path: file, fullPage: opts.fullPage })
          results.push({
            file,
            page,
            width,
            scheme,
            status: response ? response.status() : null,
            overflow: Math.max(0, overflow),
          })
        }
      }
      await context.close()
    }
    return results
  } finally {
    if (browser) await browser.close()
    await server.close()
  }
}

if (import.meta.filename === process.argv[1]) {
  try {
    const opts = parseArgs(process.argv.slice(2))
    const results = await shoot(opts)
    let failed = false
    for (const r of results) {
      const notes = []
      if (r.status !== 200) notes.push(`status ${r.status}`)
      if (r.overflow > 0) notes.push(`overflows by ${r.overflow}px`)
      if (notes.length) failed = true
      console.log(
        `${notes.length ? 'FAIL' : 'ok  '} ${r.page} ${r.width} ${r.scheme}  ${path.relative(process.cwd(), r.file)}${notes.length ? '  ' + notes.join(', ') : ''}`,
      )
    }
    process.exitCode = failed ? 1 : 0
  } catch (err) {
    console.error(err.message)
    process.exitCode = 2
  }
}
