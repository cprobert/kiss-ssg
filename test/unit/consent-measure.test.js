import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  DEFAULTS,
  parseArgs,
  party,
  selectorsFor,
  scenarioPlan,
  summarise,
} from '../../scripts/consent-measure.mjs'

// The browser half (`measure`) is not exercised here: CI has no Playwright
// Chromium in the unit run. What is tested is every decision about what the
// browser does and what its findings mean — the arguments, which cookie is
// whose, which buttons are pressed in what order, and the summary's verdicts.

describe('parseArgs', () => {
  it('takes a build folder and applies the defaults', () => {
    const opts = parseArgs(['public'])
    expect(opts).toEqual({
      target: path.resolve('public'),
      kind: 'folder',
      pages: ['/'],
      host: null,
      banner: 'kiss',
      scenarios: DEFAULTS.scenarios,
      idle: 10000,
      // A folder's third parties are always aborted.
      abortThirdParty: true,
      allow: [],
      out: null,
    })
  })

  it('takes a URL, measured live unless told to abort', () => {
    const opts = parseArgs(['https://www.example.com'])
    expect(opts.kind).toBe('url')
    expect(opts.target).toBe('https://www.example.com/')
    expect(opts.abortThirdParty).toBe(false)
    expect(
      parseArgs(['https://www.example.com', '--abort-third-party'])
        .abortThirdParty,
    ).toBe(true)
  })

  it('reads every flag', () => {
    const opts = parseArgs([
      'public',
      '--page=/,about/',
      '--page=/blog/',
      '--host=WWW.Example.com',
      '--banner=cookiebot',
      '--scenarios=idle,reject',
      '--idle=2000',
      '--allow=fonts.example.net,cdn.example.org',
      '--out=result.json',
    ])
    expect(opts.pages).toEqual(['/', '/about/', '/blog/'])
    expect(opts.host).toBe('www.example.com')
    expect(opts.banner).toBe('cookiebot')
    expect(opts.scenarios).toEqual(['idle', 'reject'])
    expect(opts.idle).toBe(2000)
    expect(opts.allow).toEqual(['fonts.example.net', 'cdn.example.org'])
    expect(opts.out).toBe(path.resolve('result.json'))
  })

  it.each([
    [[], /Name the build folder or URL/],
    [['a', 'b'], /One build folder or URL only/],
    [['public', '--banner=onetrust'], /--banner takes kiss or cookiebot/],
    [['public', '--scenarios=idle,nap'], /--scenarios takes/],
    [['public', '--scenarios='], /at least one scenario/],
    [['public', '--idle=-1'], /--idle takes a whole number/],
    [['public', '--idle=soon'], /--idle takes a whole number/],
    [['public', '--idle'], /--idle takes a whole number/],
    [['public', '--host=not a host'], /--host takes a hostname/],
    [['public', '--host=localhost:3000'], /--host takes a hostname/],
    [
      ['https://example.com', '--host=www.example.com'],
      /a URL already has one/,
    ],
    [
      ['public', '--banner=cookiebot', '--scenarios=stats'],
      /needs the kiss banner/,
    ],
    [
      ['public', '--banner=cookiebot', '--scenarios=idle,withdraw'],
      /needs the kiss banner/,
    ],
    [['public', '--out='], /--out needs a file name/],
    [['public', '--colour=red'], /Unknown option/],
    [['public', '--page=C:/Program Files/Git/'], /Git Bash rewrote it/],
  ])('refuses %j', (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message)
  })
})

describe('party', () => {
  it('a host-only cookie on the measured host is first-party', () => {
    expect(party('www.example.com', 'www.example.com')).toBe('first')
  })

  it('a parent-domain cookie is first-party, with or without the dot', () => {
    expect(party('.example.com', 'www.example.com')).toBe('first')
    expect(party('example.com', 'www.example.com')).toBe('first')
  })

  it('a subdomain of the measured host is first-party', () => {
    expect(party('.cdn.www.example.com', 'www.example.com')).toBe('first')
  })

  it('an unrelated domain is third-party, even one that ends the same way', () => {
    expect(party('.vimeo.com', 'www.example.com')).toBe('third')
    expect(party('notexample.com', 'www.example.com')).toBe('third')
    expect(party('region1.google-analytics.com', 'www.example.com')).toBe(
      'third',
    )
  })

  it('ignores case and a port', () => {
    expect(party('WWW.Example.com:8080', 'www.example.com')).toBe('first')
    expect(party('127.0.0.1', '127.0.0.1')).toBe('first')
  })
})

describe('selectorsFor', () => {
  it('kiss presses the data-kiss-consent-action buttons', () => {
    const sel = selectorsFor('kiss')
    expect(sel.accept).toBe('[data-kiss-consent-action="accept"]')
    expect(sel.reject).toBe('[data-kiss-consent-action="reject"]')
    expect(sel.settings).toBe('[data-kiss-consent-action="settings"]')
    expect(sel.save).toBe('[data-kiss-consent-action="save"]')
    expect(sel.statistics).toBe(
      'input[data-kiss-consent-category="statistics"]',
    )
    expect(sel.consentCookies).toContain('kiss_consent')
  })

  it('cookiebot presses its own decline and allow-all buttons', () => {
    const sel = selectorsFor('cookiebot')
    expect(sel.reject).toBe('#CybotCookiebotDialogBodyButtonDecline')
    expect(sel.accept).toBe(
      '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll',
    )
    expect(sel.consentCookies).toEqual(['CookieConsent'])
  })

  it('refuses an unknown banner', () => {
    expect(() => selectorsFor('onetrust')).toThrow(/Unknown banner/)
  })
})

describe('scenarioPlan', () => {
  const actions = (plan) => plan.flatMap((s) => s.actions.map((a) => a.do))
  const targets = (plan) =>
    plan.flatMap((s) => s.actions.filter((a) => a.target).map((a) => a.target))

  it('idle loads and waits the idle time, touching nothing', () => {
    const plan = scenarioPlan('idle', 'kiss', { idle: 1234 })
    expect(plan).toEqual([
      {
        label: 'idle 1234 ms, no interaction',
        phase: 'before',
        actions: [{ do: 'load' }, { do: 'wait', ms: 1234 }],
      },
    ])
  })

  it('scroll is idle, then the bottom of the page, all before a choice', () => {
    const plan = scenarioPlan('scroll', 'cookiebot')
    expect(actions(plan)).toEqual(['load', 'wait', 'scroll', 'wait'])
    expect(plan.every((s) => s.phase === 'before')).toBe(true)
  })

  it('reject presses reject, then reloads', () => {
    const plan = scenarioPlan('reject', 'kiss')
    expect(targets(plan)).toEqual(['reject'])
    expect(plan.map((s) => s.phase)).toEqual(['before', 'after', 'after'])
    expect(actions(plan).at(-2)).toBe('reload')
  })

  it('reload accepts, then reloads', () => {
    const plan = scenarioPlan('reload', 'cookiebot')
    expect(targets(plan)).toEqual(['accept'])
    expect(actions(plan)).toContain('reload')
  })

  it('stats opens settings, ticks statistics only and saves', () => {
    expect(targets(scenarioPlan('stats', 'kiss'))).toEqual([
      'settings',
      'statistics',
      'save',
    ])
  })

  it('withdraw accepts, reloads, unticks everything and waits for the reload', () => {
    const plan = scenarioPlan('withdraw', 'kiss')
    expect(targets(plan)).toEqual(['accept', 'settings', 'save'])
    const acts = actions(plan)
    expect(acts.indexOf('reload')).toBeLessThan(acts.indexOf('uncheckAll'))
    expect(acts).toContain('clickAndWaitForLoad')
  })

  it.each(['stats', 'withdraw'])('refuses %s for cookiebot', (name) => {
    expect(() => scenarioPlan(name, 'cookiebot')).toThrow(
      /needs the kiss banner/,
    )
  })

  it('refuses an unknown scenario', () => {
    expect(() => scenarioPlan('nap', 'kiss')).toThrow(/Unknown scenario/)
  })
})

describe('summarise', () => {
  const step = (phase, extra = {}) => ({
    label: phase,
    phase,
    cookies: [],
    storage: [],
    hosts: ['www.example.com'],
    gcs: [],
    banner: phase === 'before',
    choice: null,
    ...extra,
  })
  const consentCookie = {
    name: 'kiss_consent',
    domain: 'www.example.com',
    party: 'first',
    expires: '2027-11-03',
  }
  const result = (scenarios) => ({
    target: '/site/public',
    host: 'www.example.com',
    banner: 'kiss',
    scenarios,
  })

  it('a third-party request while idle means something before the choice', () => {
    const summary = summarise(
      result([
        {
          name: 'idle',
          page: '/',
          steps: [
            step('before', { hosts: ['www.example.com', 'fonts.gstatic.com'] }),
          ],
        },
      ]),
    )
    expect(summary.nothingBeforeChoice).toBe(false)
    expect(summary.scenarios[0].thirdPartyHosts).toEqual(['fonts.gstatic.com'])
    // No reject scenario ran, so there is no verdict on it, not a pass.
    expect(summary.nothingAfterReject).toBeNull()
  })

  it('honours the allow-list', () => {
    const r = result([
      {
        name: 'idle',
        page: '/',
        steps: [
          step('before', { hosts: ['www.example.com', 'fonts.gstatic.com'] }),
        ],
      },
    ])
    expect(
      summarise(r, { allow: ['fonts.gstatic.com'] }).nothingBeforeChoice,
    ).toBe(true)
  })

  it('a storage key or a non-consent cookie before the choice counts', () => {
    const storage = summarise(
      result([
        {
          name: 'scroll',
          page: '/',
          steps: [
            step('before'),
            step('before', {
              storage: [
                {
                  url: 'https://player.vimeo.com/x',
                  local: ['sync_active'],
                  session: [],
                  idb: ['picox'],
                },
              ],
            }),
          ],
        },
      ]),
    )
    expect(storage.nothingBeforeChoice).toBe(false)
    expect(storage.scenarios[0].storage).toEqual([
      'local:sync_active (https://player.vimeo.com/x)',
      'idb:picox (https://player.vimeo.com/x)',
    ])
    const cookie = summarise(
      result([
        {
          name: 'idle',
          page: '/',
          steps: [
            step('before', {
              cookies: [
                {
                  name: 'vuid',
                  domain: '.vimeo.com',
                  party: 'third',
                  expires: '2027-12-01',
                },
              ],
            }),
          ],
        },
      ]),
    )
    expect(cookie.nothingBeforeChoice).toBe(false)
    expect(cookie.scenarios[0].cookies).toEqual(['vuid@.vimeo.com'])
  })

  it('a clean Reject keeps only the consent cookie, and that is clean', () => {
    const summary = summarise(
      result([
        { name: 'idle', page: '/', steps: [step('before')] },
        {
          name: 'reject',
          page: '/',
          steps: [
            step('before'),
            step('after', { cookies: [consentCookie] }),
            step('after', { cookies: [consentCookie] }),
          ],
        },
      ]),
    )
    expect(summary.nothingBeforeChoice).toBe(true)
    expect(summary.nothingAfterReject).toBe(true)
    expect(summary.scenarios[1].cookies).toEqual([])
  })

  it('a tag after Reject is caught, and Accept steps never count against Reject', () => {
    const summary = summarise(
      result([
        {
          name: 'accept',
          page: '/',
          steps: [
            step('before'),
            step('after', { hosts: ['www.googletagmanager.com'] }),
          ],
        },
        {
          name: 'reject',
          page: '/',
          steps: [
            step('before'),
            step('after', {
              cookies: [
                consentCookie,
                {
                  name: '_ga',
                  domain: '.example.com',
                  party: 'first',
                  expires: '2028-01-01',
                },
              ],
            }),
          ],
        },
      ]),
    )
    expect(summary.nothingBeforeChoice).toBe(true)
    expect(summary.nothingAfterReject).toBe(false)
    expect(summary.scenarios[0].thirdPartyHosts).toEqual([
      'www.googletagmanager.com',
    ])
    expect(summary.scenarios[1].cookies).toEqual(['_ga@.example.com'])
  })

  it('carries a scenario error through', () => {
    const summary = summarise(
      result([
        {
          name: 'reject',
          page: '/',
          error: 'No visible x',
          steps: [step('before')],
        },
      ]),
    )
    expect(summary.scenarios[0].error).toBe('No visible x')
    expect(summary.nothingAfterReject).toBeNull()
  })
})
