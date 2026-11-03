import { describe, it, expect } from 'vitest'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { minify } from 'terser'
import { recordConfig, recordHtml } from '../../lib/consent-record.js'
import { resolveConsent } from '../../lib/consent.js'

const require = createRequire(import.meta.url)
const domino = require('@mixmark-io/domino')

const SITE = {
  services: {
    stats: { category: 'statistics', label: 'Visit counter' },
    youtube: {},
  },
}

/** @param {any} [input] */
const site = (input = SITE) => {
  const resolved = resolveConsent(input)
  if (!resolved) throw new Error('no consent')
  return resolved
}

const entry = (over = {}) => ({
  format: 2,
  action: 'accept',
  id: 'a68e41c1-78ea-46a9-bead-709c2148c782',
  version: '61f7f5e9e977',
  timestamp: '2026-11-03T15:40:42.846Z',
  categories: { statistics: true, marketing: true },
  services: {},
  bannerHash: '9c84de96507e',
  page: '/',
  ...over,
})

/**
 * Render the helper's markup into a page and run its script there, against a
 * fake localStorage, the way the browser would.
 *
 * @param {string} html recordHtml's output
 * @param {{ log?: unknown, raw?: string, storageThrows?: boolean, lang?: string, languages?: string[], minified?: string }} [opts]
 */
function page(html, opts = {}) {
  const dwin = domino.createWindow(
    `<!doctype html><html lang="${opts.lang ?? 'en-GB'}"><head></head><body><main>${html}</main></body></html>`,
    'https://www.example.com/privacy/',
  )
  const doc = dwin.document
  const script = /** @type {any} */ (
    doc.querySelector('script[data-kiss-consent-record-script]')
  )
  const source = opts.minified ?? script.textContent
  const items = new Map()
  if (opts.raw !== undefined) items.set('kiss_consent_log', opts.raw)
  else if (opts.log !== undefined)
    items.set('kiss_consent_log', JSON.stringify(opts.log))
  const win = {
    document: doc,
    Intl,
    navigator: { languages: opts.languages ?? ['en-GB'] },
    get localStorage() {
      if (opts.storageThrows) throw new Error('SecurityError')
      return { getItem: (k) => items.get(k) ?? null }
    },
  }
  // domino has no currentScript: the script finds its section by selector.
  vm.runInNewContext(source, { window: win, Date })
  const fire = () => {
    const e = doc.createEvent('Event')
    e.initEvent('kiss-consent:change', true, true)
    doc.dispatchEvent(e)
  }
  const shown = (name) => {
    const el = doc.querySelector(`[data-kiss-consent-record-${name}]`)
    return el ? !el.hidden : null
  }
  // domino: `children` is not iterable, and a selector matching nothing
  // answers undefined where a browser answers null.
  const rows = () =>
    [...doc.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((td) => td.textContent),
    )
  const find = (selector) => doc.querySelector(selector) ?? null
  return { doc, items, fire, shown, rows, find }
}

describe('recordHtml', () => {
  const html = recordHtml(site())

  it('writes the heading, what the history is, and a table with a column per category in use', () => {
    expect(html).toContain('<h2>Your cookie choices</h2>')
    expect(html).toContain('kept in this browser only')
    const head = [...html.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(
      (m) => m[1],
    )
    expect(head).toEqual([
      'When',
      'Choice',
      'Statistics',
      'Marketing',
      'Always allowed',
      'Purposes version',
    ])
    expect(html).toContain('role="region" tabindex="0"')
  })

  it('writes every state hidden, the no-JavaScript note in noscript, and the changing parts where the Markdown copy drops them', () => {
    expect(html).toMatch(/<p data-kiss-consent-record-empty hidden>/)
    expect(html).toMatch(/<p data-kiss-consent-record-unavailable hidden>/)
    expect(html).toMatch(/data-kiss-consent-record-rows hidden>/)
    expect(html).toContain('<noscript><p>Your history is shown with JavaScript')
    const ui = html.indexOf('<div data-kiss-consent-ui>')
    expect(ui).toBeGreaterThan(html.indexOf('<h2>'))
    expect(html.indexOf('<noscript>')).toBeGreaterThan(ui)
  })

  it('says what is sent, and shows the id, only when the site has an endpoint', () => {
    expect(html).not.toContain('Each choice is also sent')
    expect(html).not.toContain('data-kiss-consent-record-id')
    const sent = recordHtml(site({ ...SITE, endpoint: '/api/consent' }))
    expect(sent).toContain('Each choice is also sent to this site')
    expect(sent).toMatch(/<p data-kiss-consent-record-id hidden>/)
  })

  it('takes its wording from ui.text', () => {
    const own = recordHtml(
      site({ ...SITE, ui: { text: { historyTitle: 'Vos choix' } } }),
    )
    expect(own).toContain('<h2>Vos choix</h2>')
    expect(own).toContain('aria-label="Vos choix"')
  })

  it('cannot be ended early by site text in its config', () => {
    const own = recordHtml(
      site({
        ...SITE,
        ui: { text: { historyYes: '</script><script>alert(1)</script>' } },
      }),
    )
    expect(own.match(/<\/script>/g)).toHaveLength(1)
  })
})

describe('recordConfig', () => {
  it('carries the log name, the labels and the browser wording, and no URL (D2)', () => {
    const cfg = recordConfig(site({ ...SITE, cookie: { name: 'my_c' } }))
    expect(cfg.log).toBe('my_c_log')
    expect(cfg.categories).toEqual([
      ['statistics', 'Statistics'],
      ['marketing', 'Marketing'],
    ])
    expect(cfg.services).toEqual({ stats: 'Visit counter', youtube: 'YouTube' })
    expect(Object.keys(cfg.text)).toContain('historyChanged')
  })
})

const forms = [
  ['as rendered', async () => undefined],
  [
    'minified',
    async (/** @type {string} */ html) =>
      (
        await minify(
          html.match(
            /<script data-kiss-consent-record-script>([\s\S]*)<\/script>/,
          )?.[1] ?? '',
        )
      ).code ?? '',
  ],
]

describe.each(forms)('the viewer, %s', (_, build) => {
  const html = recordHtml(site({ ...SITE, endpoint: '/api/consent' }))
  /** @param {Parameters<typeof page>[1]} opts */
  const open = async (opts = {}) =>
    page(html, { ...opts, minified: await build(html) })

  it('shows the empty state for a browser with no log', async () => {
    const p = await open()
    expect(p.shown('empty')).toBe(true)
    expect(p.shown('rows')).toBe(false)
    expect(p.shown('id')).toBe(false)
  })

  it('lists every choice newest first, with the date and time to the second and the exact UTC value', async () => {
    const p = await open({
      log: [
        entry(),
        entry({
          action: 'reject',
          timestamp: '2026-11-03T15:40:43.194Z',
          categories: { statistics: false, marketing: false },
        }),
        entry({
          action: 'save',
          timestamp: '2026-11-03T15:40:43.611Z',
          categories: { statistics: true, marketing: false },
        }),
      ],
    })
    expect(p.shown('empty')).toBe(false)
    expect(p.shown('rows')).toBe(true)
    const rows = p.rows()
    expect(rows.map((r) => r.slice(1, 4))).toEqual([
      ['Saved choices', 'Allowed', 'Refused'],
      ['Rejected all', 'Refused', 'Refused'],
      ['Accepted all', 'Allowed', 'Allowed'],
    ])
    const times = [...p.doc.querySelectorAll('tbody th time')]
    expect(times.map((t) => t.getAttribute('datetime'))).toEqual([
      '2026-11-03T15:40:43.611Z',
      '2026-11-03T15:40:43.194Z',
      '2026-11-03T15:40:42.846Z',
    ])
    // Seconds are shown: the two newest rows are half a second apart.
    expect(times[0].textContent).toMatch(/:43\b/)
    expect(times[2].textContent).toMatch(/:42\b/)
    expect(p.doc.querySelector('tbody th').getAttribute('scope')).toBe('row')
    expect(rows[0][5]).toBe('61f7f5e9e977')
  })

  // D6, as Chromium showed it: the page's `lang` alone gave an en-GB visitor
  // on a `lang="en"` page US dates.
  it('formats dates in the visitor’s locale for the page’s language, else in the page’s', async () => {
    const at = new Date('2026-11-03T15:40:42.846Z')
    const style = /** @type {const} */ ({
      dateStyle: 'medium',
      timeStyle: 'medium',
    })
    const shown = async (lang, languages) =>
      (await open({ lang, languages, log: [entry()] })).find('tbody time')
        .textContent
    expect(await shown('en', ['de-DE', 'en-GB'])).toBe(
      new Intl.DateTimeFormat('en-GB', style).format(at),
    )
    expect(await shown('en', ['de-DE'])).toBe(
      new Intl.DateTimeFormat('en', style).format(at),
    )
    expect(await shown('en', ['de-DE'])).not.toBe(
      new Intl.DateTimeFormat('de-DE', style).format(at),
    )
  })

  it('shows the id from the newest record, for quoting', async () => {
    const p = await open({ log: [entry({ id: 'old' }), entry()] })
    expect(p.shown('id')).toBe(true)
    expect(
      p.doc.querySelector('[data-kiss-consent-record-id] code').textContent,
    ).toBe('a68e41c1-78ea-46a9-bead-709c2148c782')
  })

  it('marks where the purposes changed between two rows (D7)', async () => {
    const p = await open({
      log: [
        entry({ version: 'aaaaaaaaaaaa' }),
        entry({ version: 'bbbbbbbbbbbb' }),
      ],
    })
    const rows = p.rows()
    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual([
      'The cookie purposes changed after this, so you were asked again.',
    ])
    expect(
      p.doc
        .querySelector('[data-kiss-consent-record-changed] td')
        .getAttribute('colspan'),
    ).toBe('6')
  })

  it('prints an Always allow by its service label, with no category answer', async () => {
    const p = await open({
      log: [
        entry({ action: 'allow', categories: null, services: { youtube: 1 } }),
      ],
    })
    expect(p.rows()[0].slice(1, 5)).toEqual([
      'Always allowed a service',
      '—',
      '—',
      'YouTube',
    ])
  })

  it('writes a tampered log as text, never as markup', async () => {
    const p = await open({
      log: [
        entry({
          action: '<img src=x onerror=alert(1)>',
          timestamp: '<b>now</b>',
          version: '<i>v</i>',
          services: { '<script>x</script>': 1 },
        }),
        'not a record',
        null,
      ],
    })
    expect(p.find('tbody img, tbody b, tbody i, tbody script')).toBeNull()
    const [row] = p.rows()
    expect(row).toEqual([
      '<b>now</b>',
      '—',
      'Allowed',
      'Allowed',
      '<script>x</script>',
      '<i>v</i>',
    ])
  })

  it('treats a log that is not JSON, or not a list, as empty', async () => {
    expect((await open({ raw: '{nope' })).shown('empty')).toBe(true)
    expect((await open({ log: { a: 1 } })).shown('empty')).toBe(true)
  })

  it('says the history is not available when storage is refused (D10)', async () => {
    const p = await open({ storageThrows: true })
    expect(p.shown('unavailable')).toBe(true)
    expect(p.shown('empty')).toBe(false)
    expect(p.shown('rows')).toBe(false)
  })

  it('redraws on a choice made on the page', async () => {
    const p = await open()
    expect(p.shown('empty')).toBe(true)
    p.items.set('kiss_consent_log', JSON.stringify([entry()]))
    p.fire()
    expect(p.shown('rows')).toBe(true)
    expect(p.rows()).toHaveLength(1)
  })
})
