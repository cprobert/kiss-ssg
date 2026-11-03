#!/usr/bin/env node
// What a page stores and requests before and after a consent choice, measured
// in a clean Chromium profile per scenario.
//
// It grew from the scratch script that took the Cookiebot baseline on
// diploma-msc.com (planning/reviews/2026-11-02-cookiebot-baseline.md), and it
// is the instrument the consent manager's trial is judged with (contract §11,
// planning/plans/2026-11-02-consent-manager.md). It measures; it never
// judges: a page that stores everything still exits 0, and the `summary`
// says what was found.
//
// Decisions worth knowing before reading the code.
//
// **A build folder never talks to the internet.** It is served with
// `serveFolder` (scripts/screenshot.mjs) on port 0, and every request to any
// other host is recorded and then aborted. A URL is measured live, and its
// third-party requests go through unless `--abort-third-party`.
//
// **`--host` makes a folder behave as the real host.** Chromium's
// `--host-resolver-rules` maps that hostname to 127.0.0.1, and the page is
// loaded as `http://<host>:<port>/`, so tags that check the hostname, and
// cookies scoped to its parent domain, act as they would in production.
//
// **Each scenario is its own empty context**, and every step is followed by a
// snapshot: cookies (with their party relative to the measured host), the
// storage of every frame, the request hosts so far (cumulative), Google's
// `gcs`/`gcd` consent signals, whether the banner is showing, and the CMP's
// own idea of the choice.
//
// Usage:
//   node scripts/consent-measure.mjs <build-folder | https-url> [options]
//     --page=/,/about/          pages to measure (repeatable or a comma list; default /)
//     --host=www.example.com    a folder only: serve it under this hostname
//     --banner=kiss|cookiebot   which CMP's buttons to press (default kiss)
//     --scenarios=idle,reject   which scenarios (default idle,scroll,reject,accept,reload;
//                               stats and withdraw are kiss only)
//     --idle=10000              ms to wait, untouched, in the idle scenario
//     --abort-third-party       a URL only: abort third-party requests too
//     --allow=host,host         third-party hosts the summary does not count
//     --out=<file.json>         also write the result there
//
// Exits 0 on a completed measurement, 1 when a page fails to load, a button
// is missing or Chromium is not installed, and 2 on bad arguments.
import fs from 'node:fs'
import path from 'node:path'
import { serveFolder } from './screenshot.mjs'
import { isMain } from './is-main.mjs'

export const BANNERS = Object.freeze(['kiss', 'cookiebot'])
export const SCENARIOS = Object.freeze([
  'idle',
  'scroll',
  'reject',
  'accept',
  'stats',
  'withdraw',
  'reload',
])
export const KISS_ONLY = Object.freeze(['stats', 'withdraw'])

export const DEFAULTS = Object.freeze({
  pages: ['/'],
  banner: 'kiss',
  scenarios: ['idle', 'scroll', 'reject', 'accept', 'reload'],
  idle: 10000,
})

const list = (value) =>
  value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * @param {string[]} argv
 * @returns {{ target: string, kind: 'folder' | 'url', pages: string[], host: string | null, banner: string, scenarios: string[], idle: number, abortThirdParty: boolean, allow: string[], out: string | null }}
 */
export function parseArgs(argv) {
  let target = null
  let pages = null
  let host = null
  let banner = /** @type {string} */ (DEFAULTS.banner)
  let scenarios = null
  let idle = /** @type {number} */ (DEFAULTS.idle)
  let abortThirdParty = false
  let allow = []
  let out = null
  for (const arg of argv) {
    const eq = arg.indexOf('=')
    const flag = eq === -1 ? arg : arg.slice(0, eq)
    const value = eq === -1 ? '' : arg.slice(eq + 1)
    if (flag === '--page') {
      pages = [...(pages ?? []), ...list(value)]
    } else if (flag === '--host') {
      host = value.trim().toLowerCase()
      if (
        !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
          host,
        )
      )
        throw new Error(
          `--host takes a hostname such as www.example.com, got "${value}"`,
        )
    } else if (flag === '--banner') {
      banner = value
      if (!BANNERS.includes(banner))
        throw new Error(
          `--banner takes ${BANNERS.join(' or ')}, got "${value}"`,
        )
    } else if (flag === '--scenarios') {
      scenarios = list(value)
      const bad = scenarios.find((s) => !SCENARIOS.includes(s))
      if (bad)
        throw new Error(
          `--scenarios takes ${SCENARIOS.join(', ')}, got "${bad}"`,
        )
    } else if (flag === '--idle') {
      idle = Number(value)
      if (!value || !Number.isInteger(idle) || idle < 0)
        throw new Error(`--idle takes a whole number of ms, got "${value}"`)
    } else if (flag === '--abort-third-party') {
      abortThirdParty = true
    } else if (flag === '--allow') {
      allow = [...allow, ...list(value).map((h) => h.toLowerCase())]
    } else if (flag === '--out') {
      if (!value) throw new Error('--out needs a file name')
      out = path.resolve(value)
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option ${arg}`)
    } else if (target === null) {
      target = arg
    } else {
      throw new Error(
        `One build folder or URL only, got "${target}" and "${arg}"`,
      )
    }
  }
  if (target === null)
    throw new Error('Name the build folder or URL to measure')
  const kind = /^https?:\/\//i.test(target) ? 'url' : 'folder'
  if (kind === 'url') {
    if (host !== null)
      throw new Error(
        '--host maps a build folder to a hostname; a URL already has one',
      )
    target = new URL(target).href
  } else {
    target = path.resolve(target)
    // A folder's third parties are always aborted: nothing leaves the machine.
    abortThirdParty = true
  }
  scenarios = scenarios ?? [...DEFAULTS.scenarios]
  if (!scenarios.length)
    throw new Error('--scenarios needs at least one scenario')
  // Refuse a kiss-only scenario for Cookiebot here, before any browser starts.
  for (const name of scenarios) scenarioPlan(name, banner)
  // Git Bash rewrites `--page=/` into a Windows path before node sees it
  // (the same guard as scripts/screenshot.mjs).
  const rewritten = (pages ?? []).find((p) => /^\/?[A-Za-z]:[\\/]/.test(p))
  if (rewritten)
    throw new Error(
      `--page "${rewritten}" is a Windows path, not a page: Git Bash rewrote it. Run from PowerShell, or with MSYS_NO_PATHCONV=1`,
    )
  pages = (pages ?? DEFAULTS.pages).map((p) =>
    p.startsWith('/') ? p : `/${p}`,
  )
  return {
    target,
    kind,
    pages,
    host,
    banner,
    scenarios,
    idle,
    abortThirdParty,
    allow,
    out,
  }
}

/**
 * Whether a cookie domain (or a request host) is first- or third-party to
 * the measured host. A leading dot is ignored. The host itself, a parent
 * domain of it (`.example.com` for `www.example.com`) and a subdomain of it
 * are first-party; anything else is third. There is no public-suffix list,
 * so a sibling subdomain (`cdn.example.com` for `www.example.com`) counts as
 * third-party: the measurement errs towards reporting.
 *
 * @param {string} cookieDomain
 * @param {string} host
 * @returns {'first' | 'third'}
 */
export function party(cookieDomain, host) {
  const d = String(cookieDomain)
    .toLowerCase()
    .replace(/^\./, '')
    .replace(/:\d+$/, '')
  const h = String(host).toLowerCase().replace(/:\d+$/, '')
  if (d === h || h.endsWith(`.${d}`) || d.endsWith(`.${h}`)) return 'first'
  return 'third'
}

/**
 * The CSS selectors that press each CMP's buttons, the element that is the
 * banner, the expression that reads the CMP's choice, and the cookies that
 * only record the choice (which the summary does not count as storage).
 *
 * @param {string} banner
 */
export function selectorsFor(banner) {
  if (banner === 'kiss')
    return {
      accept: '[data-kiss-consent-action="accept"]',
      reject: '[data-kiss-consent-action="reject"]',
      settings: '[data-kiss-consent-action="settings"]',
      save: '[data-kiss-consent-action="save"]',
      statistics: 'input[data-kiss-consent-category="statistics"]',
      categories: 'input[data-kiss-consent-category]',
      banner: '[data-kiss-consent-root]',
      choice: 'window.kissConsent ? window.kissConsent.choice : null',
      consentCookies: ['kiss_consent', 'kiss_consent_closed'],
      settle: 3000,
    }
  if (banner === 'cookiebot')
    return {
      accept: '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
      reject: '#CybotCookiebotDialogBodyButtonDecline',
      settings: null,
      save: null,
      statistics: null,
      categories: null,
      banner: '#CybotCookiebotDialog',
      choice: 'window.Cookiebot ? window.Cookiebot.consent : null',
      consentCookies: ['CookieConsent'],
      settle: 8000,
    }
  throw new Error(`Unknown banner "${banner}": use ${BANNERS.join(' or ')}`)
}

/**
 * The steps of one scenario. Each step is a list of actions and a label, and
 * the browser takes a snapshot after every step. `phase` is `before` until a
 * choice is made, then `after`; the summary reads it.
 *
 * Actions: `load`, `reload` (navigate again), `wait` (ms), `scroll` (to the
 * bottom), `click` (a selector name), `check` (tick a checkbox by selector
 * name), `uncheckAll` (untick every category), `clickAndWaitForLoad`.
 *
 * @param {string} name
 * @param {string} banner
 * @param {{ idle?: number }} [options]
 * @returns {Array<{ label: string, phase: 'before' | 'after', actions: Array<{ do: string, ms?: number, target?: string }> }>}
 */
export function scenarioPlan(name, banner, { idle = DEFAULTS.idle } = {}) {
  if (!SCENARIOS.includes(name))
    throw new Error(`Unknown scenario "${name}": use ${SCENARIOS.join(', ')}`)
  if (KISS_ONLY.includes(name) && banner !== 'kiss')
    throw new Error(`The ${name} scenario needs the kiss banner, not ${banner}`)
  const { settle } = selectorsFor(banner)
  const wait = (ms) => ({ do: 'wait', ms })
  const click = (target) => ({ do: 'click', target })
  /** @type {'before' | 'after'} */
  const before = 'before'
  /** @type {'before' | 'after'} */
  const after = 'after'
  const loaded = {
    label: 'loaded',
    phase: before,
    actions: [{ do: 'load' }, wait(settle)],
  }
  const accepted = {
    label: 'after accept',
    phase: after,
    actions: [click('accept'), wait(settle)],
  }
  const reloaded = (what) => ({
    label: `reload after ${what}`,
    phase: after,
    actions: [{ do: 'reload' }, wait(settle)],
  })
  const idleStep = {
    label: `idle ${idle} ms, no interaction`,
    phase: before,
    actions: [{ do: 'load' }, wait(idle)],
  }
  switch (name) {
    case 'idle':
      return [idleStep]
    case 'scroll':
      return [
        idleStep,
        {
          label: 'after scroll to bottom',
          phase: before,
          actions: [{ do: 'scroll' }, wait(4000)],
        },
      ]
    case 'reject':
      return [
        loaded,
        {
          label: 'after reject',
          phase: after,
          actions: [click('reject'), wait(settle)],
        },
        reloaded('reject'),
      ]
    case 'accept':
      return [loaded, accepted]
    case 'reload':
      return [loaded, accepted, reloaded('accept')]
    case 'stats':
      return [
        loaded,
        {
          label: 'after saving statistics only',
          phase: after,
          actions: [
            click('settings'),
            { do: 'check', target: 'statistics' },
            click('save'),
            wait(settle),
          ],
        },
        reloaded('statistics only'),
      ]
    case 'withdraw':
      return [
        loaded,
        accepted,
        reloaded('accept'),
        {
          label: 'after withdrawing every category',
          phase: after,
          actions: [
            click('settings'),
            { do: 'uncheckAll' },
            { do: 'clickAndWaitForLoad', target: 'save' },
            wait(settle),
          ],
        },
      ]
  }
  /* c8 ignore next */
  throw new Error(`Unplanned scenario "${name}"`)
}

/**
 * Everything the measurement found, and the two verdicts that matter, decided
 * from the scenarios alone.
 *
 * - `nothingBeforeChoice`: every `before` step of every scenario (idle and
 *   scroll are nothing else) requested no third-party host outside `allow`,
 *   and holds no cookie but the consent cookies and no storage at all.
 * - `nothingAfterReject`: the same, for the `after` steps of `reject`.
 *
 * Either is `null` when no step was measured for it, so a run that skipped
 * the scenario is never read as a pass.
 *
 * @param {{ host: string, banner: string, scenarios: Array<{ name: string, page: string, error?: string, steps: Array<any> }> }} result
 * @param {{ allow?: string[] }} [options]
 */
export function summarise(result, { allow = [] } = {}) {
  const { consentCookies } = selectorsFor(result.banner)
  const allowed = new Set(allow.map((h) => h.toLowerCase()))
  const thirdParty = (step) =>
    (step.hosts ?? []).filter(
      (h) =>
        party(h, result.host) === 'third' &&
        !allowed.has(String(h).toLowerCase().replace(/:\d+$/, '')),
    )
  const cookies = (step) =>
    (step.cookies ?? [])
      .filter((c) => !consentCookies.includes(c.name))
      .map((c) => `${c.name}@${c.domain}`)
  const storage = (step) =>
    (step.storage ?? []).flatMap((f) => [
      ...(f.local ?? []).map((k) => `local:${k} (${f.url})`),
      ...(f.session ?? []).map((k) => `session:${k} (${f.url})`),
      ...(f.idb ?? []).map((k) => `idb:${k} (${f.url})`),
      ...(f.error ? [`unreadable (${f.url})`] : []),
    ])
  const clean = (step) =>
    !thirdParty(step).length && !cookies(step).length && !storage(step).length
  const verdict = (steps) => (steps.length ? steps.every(clean) : null)

  const scenarios = result.scenarios.map((s) => {
    const last = s.steps[s.steps.length - 1] ?? {}
    return {
      name: s.name,
      page: s.page,
      ...(s.error ? { error: s.error } : {}),
      thirdPartyHosts: thirdParty(last),
      cookies: cookies(last),
      storage: storage(last),
    }
  })
  const before = result.scenarios.flatMap((s) =>
    s.steps.filter((st) => st.phase === 'before'),
  )
  const afterReject = result.scenarios
    .filter((s) => s.name === 'reject')
    .flatMap((s) => s.steps.filter((st) => st.phase === 'after'))
  return {
    scenarios,
    nothingBeforeChoice: verdict(before),
    nothingAfterReject: verdict(afterReject),
  }
}

// ---------------------------------------------------------------- browser

async function launch(args) {
  const { chromium } = await import('playwright-core')
  try {
    return await chromium.launch({ args })
  } catch (err) {
    if (/Executable doesn't exist/.test(String(err?.message)))
      throw new Error(
        'Playwright has no Chromium for this version. Run: npx playwright-core install chromium',
        { cause: err },
      )
    throw err
  }
}

// Strings, not functions: they run in the page, where `localStorage` and
// `indexedDB` exist, and this file is linted and typechecked as Node.
const READ_STORAGE = `(() => {
  const read = (st) => { try { return Object.keys(st) } catch { return ['<blocked>'] } }
  return { local: read(localStorage), session: read(sessionStorage) }
})()`
const READ_IDB = `(async () => indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : [])()`

async function storageOf(page) {
  const frames = []
  for (const frame of page.frames()) {
    const url = frame.url()
    // A frame whose request was aborted shows Chrome's error page, which has
    // no storage of its own and refuses to be read: noise, not a finding.
    if (url.startsWith('chrome-error:')) continue
    try {
      const s = await frame.evaluate(READ_STORAGE)
      let idb = []
      try {
        idb = await frame.evaluate(READ_IDB)
      } catch {
        /* an opaque frame has no IndexedDB to list */
      }
      if (s.local.length || s.session.length || idb.length)
        frames.push({ url, ...s, idb })
    } catch (err) {
      frames.push({ url, error: String(err?.message).slice(0, 80) })
    }
  }
  return frames
}

async function snapshot({
  context,
  page,
  hosts,
  requested,
  gcs,
  sel,
  host,
  label,
  phase,
}) {
  const cookies = (await context.cookies()).map((c) => ({
    name: c.name,
    domain: c.domain,
    party: party(c.domain, host),
    expires:
      c.expires > 0
        ? new Date(c.expires * 1000).toISOString().slice(0, 10)
        : 'session',
  }))
  return {
    label,
    phase,
    url: page.url(),
    cookies,
    storage: await storageOf(page),
    hosts: [...hosts].sort(),
    // This step's own requests (host and path), so a request repeated after
    // a reload or a withdrawal shows, and a first-party gated script too.
    requested: [...requested].sort(),
    gcs: [...gcs.values()],
    banner: await page
      .locator(sel.banner)
      .first()
      .isVisible()
      .catch(() => false),
    choice: await page.evaluate(sel.choice).catch(() => null),
  }
}

async function visible(page, selector, timeout = 10000) {
  const loc = page.locator(selector).filter({ visible: true }).first()
  try {
    await loc.waitFor({ state: 'visible', timeout })
  } catch {
    throw new Error(`No visible ${selector} on ${page.url()}`)
  }
  return loc
}

async function run(page, action, sel, url) {
  switch (action.do) {
    case 'load':
    case 'reload': {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })
      if (!response || !response.ok())
        throw new Error(
          `${url} answered ${response ? response.status() : 'nothing'}`,
        )
      return
    }
    case 'wait':
      return page.waitForTimeout(action.ms)
    case 'scroll':
      return page.evaluate(
        'window.scrollTo(0, document.documentElement.scrollHeight)',
      )
    case 'click':
      return (await visible(page, sel[action.target])).click()
    case 'clickAndWaitForLoad': {
      const loaded = page.waitForEvent('load', { timeout: 30000 })
      await (await visible(page, sel[action.target])).click()
      await loaded
      return
    }
    case 'check':
      return (await visible(page, sel[action.target])).check()
    case 'uncheckAll': {
      const boxes = page.locator(sel.categories).filter({ visible: true })
      await boxes.first().waitFor({ state: 'visible', timeout: 10000 })
      for (const box of await boxes.all()) await box.uncheck()
      return
    }
  }
  throw new Error(`Unknown action ${action.do}`)
}

const GOOGLE =
  /(^|\.)(google|googletagmanager|google-analytics|doubleclick|googleadservices|googlesyndication)\.[a-z.]+$/

/**
 * Runs every scenario on every page and returns the result with its summary.
 *
 * @param {ReturnType<typeof parseArgs>} opts
 */
export async function measure(opts) {
  const server = opts.kind === 'folder' ? await serveFolder(opts.target) : null
  const port = server ? new URL(server.url).port : null
  const host =
    opts.host ?? (server ? '127.0.0.1' : new URL(opts.target).hostname)
  const base = server
    ? `http://${opts.host ?? '127.0.0.1'}:${port}`
    : opts.target
  const args = opts.host
    ? [`--host-resolver-rules=MAP ${opts.host} 127.0.0.1`]
    : []
  const sel = selectorsFor(opts.banner)
  let browser = null
  try {
    browser = await launch(args)
    const scenarios = []
    for (const page of opts.pages) {
      const url = new URL(page, base).href
      for (const name of opts.scenarios) {
        const context = await browser.newContext({
          viewport: { width: 1366, height: 900 },
          locale: 'en-GB',
          timezoneId: 'Europe/London',
        })
        const tab = await context.newPage()
        const hosts = new Set()
        const requested = new Set()
        const gcs = new Map()
        tab.on('request', (r) => {
          let u
          try {
            u = new URL(r.url())
          } catch {
            return
          }
          if (!/^https?:$/.test(u.protocol)) return
          hosts.add(u.hostname)
          requested.add(u.hostname + u.pathname)
          const g = u.searchParams.get('gcs')
          const d = u.searchParams.get('gcd')
          if (GOOGLE.test(u.hostname) && (g || d)) {
            const key = `${u.hostname} ${g} ${d}`
            if (!gcs.has(key))
              gcs.set(key, { host: u.hostname, gcs: g, gcd: d })
          }
        })
        if (opts.abortThirdParty)
          await context.route('**/*', (route) => {
            let h
            try {
              h = new URL(route.request().url()).hostname
            } catch {
              return route.continue()
            }
            return party(h, host) === 'first' ? route.continue() : route.abort()
          })
        const steps = []
        let error
        try {
          for (const step of scenarioPlan(name, opts.banner, {
            idle: opts.idle,
          })) {
            for (const action of step.actions) await run(tab, action, sel, url)
            steps.push(
              await snapshot({
                context,
                page: tab,
                hosts,
                requested,
                gcs,
                sel,
                host,
                label: step.label,
                phase: step.phase,
              }),
            )
            requested.clear()
          }
        } catch (err) {
          error = String(err?.message ?? err)
        }
        await context.close()
        scenarios.push({ name, page, ...(error ? { error } : {}), steps })
      }
    }
    const result = { target: opts.target, host, banner: opts.banner, scenarios }
    return { ...result, summary: summarise(result, { allow: opts.allow }) }
  } finally {
    if (browser) await browser.close()
    if (server) await server.close()
  }
}

if (isMain(import.meta.filename)) {
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(err.message)
    process.exitCode = 2
  }
  if (opts) {
    try {
      const result = await measure(opts)
      const json = JSON.stringify(result, null, 2)
      if (opts.out) {
        fs.mkdirSync(path.dirname(opts.out), { recursive: true })
        fs.writeFileSync(opts.out, json + '\n')
      }
      console.log(json)
      const failed = result.scenarios.filter((s) => s.error)
      for (const s of failed) console.error(`${s.name} ${s.page}: ${s.error}`)
      process.exitCode = failed.length ? 1 : 0
    } catch (err) {
      console.error(err.message)
      process.exitCode = 1
    }
  }
}
