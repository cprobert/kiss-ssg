import { describe, it, expect } from 'vitest'
import { silentLogger } from '../../lib/logger.js'
import { makeSite } from '../helpers/site.js'
import Kiss from '../helpers/kiss.js'

// Guards against build time that stops growing in proportion to the page
// count. The same generated site is built at two sizes with the link check and
// the audit on (both are on by default, and the likeliest home of a quadratic
// cost), and the ratio of the two times is asserted, never a time in seconds:
// a ratio holds across machines where an absolute time does not. Linear is 4,
// quadratic is 16; the bound sits between them. A failure is fixed in the
// engine, never by loosening the number (AIKB/testing.md).
const SMALL = 500
const LARGE = 2000
const MAX_RATIO = 6
const RUNS = 2

// Each page links to two others by id, so the link scan has references to
// resolve against the whole registry.
const VIEW =
  '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
  '<title>{{model.name}}</title></head><body><main><h1>{{model.name}}</h1>' +
  '<a href="{{link "item" slug=model.next}}">next</a>' +
  '<a href="{{link "item" slug=model.prev}}">prev</a>' +
  '</main></body></html>'

const slug = (i) => `s${i}`

function modelFor(n) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Page ${i}`,
    slug: slug(i),
    next: slug((i + 1) % n),
    prev: slug((i + n - 1) % n),
  }))
}

// One build of `n` pages into a fresh temp site; returns wall time in ms.
async function timedBuild(n) {
  const site = await makeSite({ 'src/pages/item.hbs': VIEW })
  try {
    const started = performance.now()
    const kiss = new Kiss({
      folders: site.folders,
      siteUrl: 'https://scale.example',
      logger: silentLogger,
    })
      .pages({
        view: 'item.hbs',
        path: 'p',
        model: modelFor(n),
        controller: ({ model }) => ({ slug: model.slug }),
      })
      .generate()
    await kiss.complete()
    const ms = performance.now() - started
    const report = kiss.report()
    // A build that skipped the link check or the audit would be measuring less
    // than it claims to.
    expect(report.links.checked).toBeGreaterThan(n)
    expect(report.links.broken).toEqual([])
    expect(report.audit).not.toBeNull()
    return ms
  } finally {
    await site.cleanup()
  }
}

async function fastest(n) {
  let best = Infinity
  for (let run = 0; run < RUNS; run++)
    best = Math.min(best, await timedBuild(n))
  return best
}

describe('build time scales with the number of pages', () => {
  it(`a ${LARGE}-page build takes under ${MAX_RATIO}x a ${SMALL}-page build`, async () => {
    // One discarded build pays for module loading and JIT warmup.
    await timedBuild(50)
    const small = await fastest(SMALL)
    const large = await fastest(LARGE)
    const ratio = large / small
    process.stderr.write(
      `scale: ${SMALL} pages ${small.toFixed(0)} ms, ${LARGE} pages ${large.toFixed(0)} ms, ratio ${ratio.toFixed(2)}\n`,
    )
    expect(ratio).toBeLessThan(MAX_RATIO)
  }, 120_000)
})
