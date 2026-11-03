import { describe, it, expect } from 'vitest'
import {
  bannerHtml,
  escapeHtml,
  settingsControlHtml,
  settingsHtml,
  tableHtml,
  themeCss,
} from '../../lib/consent-ui.js'
import { resolveConsent } from '../../lib/consent.js'

/** @param {any} input */
const resolved = (input) => {
  const r = resolveConsent(input)
  if (!r) throw new Error('expected a resolved consent block')
  return r
}

const site = (/** @type {Record<string, any>} */ extra = {}) =>
  resolved({
    services: {
      gtm: { id: 'GTM-X' },
      youtube: {},
      vimeo: {},
      chat: {
        category: 'preferences',
        label: 'Chat',
        provider: 'Chatter',
        description: 'Live chat',
        src: 'https://chat.example/x.js',
      },
      fonts: {
        category: 'necessary',
        label: 'Fonts',
        provider: 'This site',
        description: 'Serves fonts',
        cookies: [{ name: 'f_ok', duration: '1 day', description: 'font ok' }],
      },
    },
    ...extra,
  })

const nobody = () => resolved({ services: {} })
const HOSTILE = `<script>alert("x")</script>'`

/** @param {string} html */
const buttons = (html) =>
  [...html.matchAll(/<button\b[^>]*>/g)].map((m) => m[0])

describe('escapeHtml', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;')
  })
})

describe('bannerHtml', () => {
  it('has the root, its position and its region label', () => {
    const html = bannerHtml(site())
    expect(html).toMatch(
      /^<div class="kiss-consent" data-kiss-consent-root data-position="bottom" role="region" aria-label="Cookies on this site">/,
    )
    expect(html).toContain(
      '<h2 class="kiss-consent__title">Cookies on this site</h2>',
    )
    expect(html).toContain('<p class="kiss-consent__body">')
  })

  it('takes the top position', () => {
    expect(bannerHtml(site({ ui: { position: 'top' } }))).toContain(
      'data-position="top"',
    )
  })

  it('has Accept and Reject of equal weight, Choose cookies set apart, and a close button', () => {
    const html = bannerHtml(site())
    const all = buttons(html)
    expect(all).toEqual([
      '<button type="button" class="kiss-consent__button" data-kiss-consent-action="accept">',
      '<button type="button" class="kiss-consent__button" data-kiss-consent-action="reject">',
      // The way to answer in detail, not a third answer: a text button, as on
      // Google's consent screen (operator, 2026-11-03).
      '<button type="button" class="kiss-consent__more" data-kiss-consent-action="settings">',
      '<button type="button" class="kiss-consent__close" data-kiss-consent-action="close" aria-label="Close">',
    ])
    expect(html).toContain('>Accept all</button>')
    expect(html).toContain('>Reject all</button>')
    expect(html).toContain('>Choose cookies</button>')
  })

  it('shows a logo only with logoUrl', () => {
    expect(bannerHtml(site())).not.toContain('<img')
    expect(bannerHtml(site(), { logoUrl: '/logo.svg' })).toContain(
      '<img class="kiss-consent__logo" src="/logo.svg" alt="">',
    )
  })

  it('links the policy only with policyUrl', () => {
    expect(bannerHtml(site())).not.toContain('kiss-consent__policy')
    expect(bannerHtml(site(), { policyUrl: '/cookies/' })).toContain(
      '<a class="kiss-consent__policy" href="/cookies/">Cookie policy</a>',
    )
  })

  it('escapes every string', () => {
    const r = site({
      ui: {
        text: {
          title: HOSTILE,
          body: HOSTILE,
          accept: HOSTILE,
          close: HOSTILE,
        },
      },
    })
    const html = bannerHtml(r, { logoUrl: `"x`, policyUrl: `"y` })
    expect(html).not.toContain('<script>')
    expect(html).not.toContain(`"x`)
    expect(html).toContain('aria-label="&lt;script&gt;alert(&quot;x&quot;)')
    expect(html).toContain('&#39;')
  })

  it('is empty when no category is in use', () => {
    expect(bannerHtml(nobody())).toBe('')
  })
})

describe('settingsHtml', () => {
  const html = settingsHtml(site(), { policyUrl: '/cookies/' })

  it('is a labelled dialog with the policy link', () => {
    expect(html).toMatch(
      /^<dialog class="kiss-consent-dialog" aria-labelledby="kiss-consent-dialog-title">/,
    )
    expect(html).toContain(
      '<h2 id="kiss-consent-dialog-title">Cookie settings</h2>',
    )
    expect(html).toContain('href="/cookies/"')
    expect(settingsHtml(site())).not.toContain('<a ')
  })

  it('has a close in its header, then reject all, accept all and save, the three choices one class', () => {
    const actions = buttons(html).map(
      (b) => /data-kiss-consent-action="([^"]+)"/.exec(b)?.[1],
    )
    expect(actions).toEqual(['close-dialog', 'reject', 'accept', 'save'])
    expect(buttons(html)[0]).toContain('class="kiss-consent__close"')
    for (const b of buttons(html).slice(1))
      expect(b).toContain('class="kiss-consent__button"')
  })

  it('has necessary as a disabled, checked switch, with no category attribute', () => {
    expect(html).toContain(
      '<label for="kiss-consent-necessary">Necessary</label><input type="checkbox" role="switch" class="kiss-consent-switch" id="kiss-consent-necessary" disabled checked>',
    )
    expect(html).not.toContain('data-kiss-consent-category="necessary"')
  })

  it('labels every switch, and every switch is a checkbox announced as a switch', () => {
    const switches = [
      ...html.matchAll(/<input[^>]*class="kiss-consent-switch"[^>]*>/g),
    ]
    expect(switches.length).toBeGreaterThan(0)
    for (const [input] of switches) {
      expect(input).toContain('type="checkbox" role="switch"')
      const id = /id="([^"]+)"/.exec(input)?.[1]
      expect(html).toContain(`<label for="${id}">`)
    }
  })

  it('has one unchecked checkbox per category in use', () => {
    const boxes = [
      ...html.matchAll(
        /<input[^>]*data-kiss-consent-category="([^"]+)"[^>]*>/g,
      ),
    ]
    expect(boxes.map((m) => m[1])).toEqual(['preferences', 'marketing'])
    for (const m of boxes) expect(m[0]).not.toContain('checked')
  })

  it('has a hidden grant toggle for every service a category holds', () => {
    // {{consentEmbed}} takes any service with src=, not only one with an
    // `embed` block, and offers "Always allow" for it: every grant the client
    // can hold needs a switch to withdraw it. Hidden until one is held.
    const grants = [
      ...html.matchAll(/data-kiss-consent-grant="([^"]+)" hidden/g),
    ]
    expect(grants.map((m) => m[1])).toEqual(['chat', 'gtm', 'vimeo', 'youtube'])
    expect(html).toContain(
      '<div class="kiss-consent-dialog__grant" data-kiss-consent-grant="youtube" hidden><label for="kiss-consent-grant-youtube">YouTube</label><input type="checkbox" role="switch" class="kiss-consent-switch" id="kiss-consent-grant-youtube" data-kiss-consent-service="youtube"></div>',
    )
    // a necessary service is never asked about, so it holds no grant
    expect(html).not.toContain('data-kiss-consent-service="fonts"')
  })

  it('escapes every string', () => {
    const r = resolved({
      services: { youtube: { label: HOSTILE } },
      categories: { marketing: { label: HOSTILE, description: HOSTILE } },
      ui: {
        text: { settings: HOSTILE, save: HOSTILE, necessaryLabel: HOSTILE },
      },
    })
    expect(settingsHtml(r, { policyUrl: `"z` })).not.toMatch(/<script>|"z/)
  })

  it('is empty when no category is in use', () => {
    expect(settingsHtml(nobody())).toBe('')
  })
})

describe('tableHtml', () => {
  const html = tableHtml(site())
  /** @param {string} t */
  const rows = (t) =>
    [...t.matchAll(/<tr><td>([\s\S]*?)<\/td><\/tr>/g)].map((m) =>
      m[1].split('</td><td>'),
    )
  const tables = html.split('</table>').filter((t) => t.includes('<table'))

  it('puts each table in a labelled, focusable scrolling region', () => {
    expect(
      html.match(
        /<div class="kiss-consent-table-wrap" role="region" tabindex="0" aria-label="[^"]+"><table/g,
      ),
    ).toHaveLength(tables.length)
  })

  it('has one table per category: necessary first, then those in use', () => {
    expect(tables.map((t) => /<caption>([^<]*)</.exec(t)?.[1])).toEqual([
      'Necessary',
      'Preferences',
      'Marketing',
    ])
    expect(html).toContain(
      '<th scope="col">Service</th><th scope="col">Provider</th><th scope="col">Purpose</th><th scope="col">Name</th><th scope="col">Kind</th><th scope="col">Duration</th><th scope="col">Party</th>',
    )
  })

  it("begins necessary with kiss's own two cookies", () => {
    const [first, second, third] = rows(tables[0])
    expect(first).toEqual([
      'Cookie consent',
      'This site',
      'Remembers your cookie choice',
      'kiss_consent',
      'Cookie',
      '182 days',
      'First',
    ])
    expect(second.slice(3)).toEqual([
      'kiss_consent_closed',
      'Cookie',
      'Session',
      'First',
    ])
    expect(third).toEqual([
      'Fonts',
      'This site',
      'font ok',
      'f_ok',
      'Cookie',
      '1 day',
      'First',
    ])
  })

  it('names the configured cookie', () => {
    expect(tableHtml(site({ cookie: { name: 'my_c', days: 30 } }))).toContain(
      '<td>my_c</td><td>Cookie</td><td>30 days</td>',
    )
  })

  it('has one row per stored item with kind and party, services in name order', () => {
    const marketing = rows(tables[2])
    expect(marketing.map((r) => [r[0], r[3], r[4], r[6]])).toEqual([
      ['Google Tag Manager', '_ga', 'Cookie', 'First'],
      ['Google Tag Manager', '_ga_*', 'Cookie', 'First'],
      ['Google Tag Manager', '_gcl_au', 'Cookie', 'First'],
      ['Vimeo', 'vuid', 'Cookie', 'Third'],
      ['Vimeo', 'player', 'Cookie', 'Third'],
      ['YouTube', 'yt-icons-last-purged', 'Local storage', 'Third'],
      ['YouTube', 'ytidb::LAST_RESULT_ENTRY_KEY', 'Local storage', 'Third'],
    ])
  })

  it('gives a service that stores nothing one row named —', () => {
    expect(rows(tables[1])).toEqual([
      ['Chat', 'Chatter', 'Live chat', '—', '—', '—', '—'],
    ])
  })

  it('escapes every string', () => {
    const r = resolved({
      services: {
        x: {
          category: 'marketing',
          label: HOSTILE,
          provider: HOSTILE,
          cookies: [{ name: '<b>', description: HOSTILE }],
        },
      },
      ui: { text: { necessaryLabel: HOSTILE } },
    })
    expect(tableHtml(r)).not.toMatch(/<script>|<b>/)
  })
})

describe('settingsControlHtml', () => {
  it('is the settings button', () => {
    expect(settingsControlHtml(site())).toBe(
      '<button type="button" class="kiss-consent-settings" data-kiss-consent-action="settings">Cookie settings</button>',
    )
  })

  it('escapes its text', () => {
    expect(
      settingsControlHtml(site({ ui: { text: { settings: HOSTILE } } })),
    ).not.toContain('<script>')
  })
})

describe('themeCss', () => {
  const theme = {
    background: '#000',
    text: '#eee',
    accent: 'rebeccapurple',
    accentText: '#fff',
    border: 'red',
    radius: '0',
    font: 'Georgia, serif',
  }
  const css = themeCss(site({ ui: { theme } }).ui)

  it('declares each custom property with the configured value', () => {
    expect(css).toContain(
      '.kiss-consent,.kiss-consent-dialog,.kiss-embed,[data-kiss-consent-confirmation],.kiss-consent-settings,.kiss-consent-table-wrap{',
    )
    for (const [prop, value] of [
      ['background', '#000'],
      ['text', '#eee'],
      ['accent', 'rebeccapurple'],
      ['accent-text', '#fff'],
      ['border', 'red'],
      ['radius', '0'],
      ['font', 'Georgia, serif'],
    ])
      expect(css).toContain(`--kiss-consent-${prop}:${value};`)
  })

  it('places the banner fixed at the bottom or in the flow at the top', () => {
    expect(css).toMatch(
      /\.kiss-consent\[data-position="bottom"\][^{]*\{position:fixed;[^}]*bottom:0;z-index:2147483000;max-height:80vh;overflow:auto;/,
    )
    expect(css).toMatch(
      /\.kiss-consent\[data-position="top"\][^{]*\{position:relative;/,
    )
  })

  it('styles every choice button alike, with no variant for any one choice', () => {
    expect(css).toMatch(
      /\.kiss-consent__button,\.kiss-embed__notice button\{[^}]*background:var\(--kiss-consent-accent\);color:var\(--kiss-consent-accent-text\)/,
    )
    // Hover and the phone layout apply to every choice button at once; no
    // rule may single one out (by a modifier, an action, a position).
    expect(css).not.toMatch(
      /\.kiss-consent__button(--|\[|\.|:(first|last|nth))/,
    )
    expect(css).not.toMatch(/data-kiss-consent-action=/)
  })

  it('draws the switches from the theme, on and off told apart by colour and knob', () => {
    expect(css).toMatch(/\.kiss-consent-switch\{appearance:none;/)
    expect(css).toMatch(
      /\.kiss-consent-switch:checked\{background:var\(--kiss-consent-accent\)\}/,
    )
    expect(css).toContain('.kiss-consent-switch:checked::before{left:')
  })

  it('has visible focus, the dialog backdrop and reduced motion', () => {
    expect(css).toContain(':focus-visible')
    expect(css).toContain('outline:3px solid var(--kiss-consent-accent)')
    expect(css).toContain('.kiss-consent-dialog::backdrop')
    expect(css).toContain('@media (prefers-reduced-motion:reduce)')
    expect(css).toContain('aspect-ratio:16/9')
    // The table scrolls rather than breaking words: at 320px a broken one
    // showed a letter per line (example 14, 2026-11-03).
    expect(css).toContain('.kiss-consent-table-wrap{overflow-x:auto')
    expect(css).not.toContain('overflow-wrap:anywhere')
  })

  it('has no !important, @import or url(', () => {
    expect(css).not.toMatch(/!important|@import|url\(/)
  })

  it('is empty under theme: false', () => {
    expect(themeCss(site({ ui: { theme: false } }).ui)).toBe('')
  })

  // Inlined on every page. The 2026-11-03 restyle (the operator: "the
  // diploma MSc one looks better than ours") took it from 4,005 bytes to
  // about 6.7 kB; the ceiling catches growth, and moving it is a decision.
  it('stays compact', () => {
    expect(Buffer.byteLength(themeCss(site().ui))).toBeLessThan(7168)
  })
})
