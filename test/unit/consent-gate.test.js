import { describe, it, expect } from 'vitest'
import { minify } from 'html-minifier-terser'
import {
  consentWiringProblems,
  embedMarkup,
  findDocumentWrite,
  gatedScript,
} from '../../lib/consent-gate.js'
import { resolveConsent, serviceParams } from '../../lib/consent.js'

/** @param {any} input */
const resolved = (input) => {
  const r = resolveConsent(input)
  if (!r) throw new Error('no consent')
  return r
}

const consent = resolved({
  services: {
    gtm: { id: 'GTM-X' },
    stats: { category: 'statistics', src: '/js/stats.js' },
    cdn: { category: 'necessary', src: 'https://cdn.example/lib.js' },
    youtube: {},
    maps: { preset: 'google-maps' },
    chat: { category: 'marketing' },
  },
})
const script = (name, extra = {}) =>
  gatedScript(name, consent.services[name], {
    consent,
    params: serviceParams(consent.services[name], extra.hash ?? {}),
    ...extra,
  })
const embed = (name, extra = {}) =>
  embedMarkup(name, consent.services[name], {
    consent,
    params: serviceParams(consent.services[name], extra.hash ?? {}),
    ...extra,
  })

describe('gatedScript', () => {
  it('writes a preset as its gated inline part, then its gated loader', () => {
    expect(script('gtm')).toBe(
      '<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing">' +
        "window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});" +
        '</script>' +
        '<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing" data-src="https://www.googletagmanager.com/gtm.js?id=GTM-X"></script>',
    )
  })

  it('takes a placeholder from the hash over the config, and fails on a missing one', () => {
    expect(script('gtm', { hash: { id: 'GTM-PAGE' } })).toContain('id=GTM-PAGE')
    const bare = resolved({ services: { gtm: {} } })
    expect(() =>
      gatedScript('gtm', bare.services.gtm, { consent: bare, params: {} }),
    ).toThrow('consentScript "gtm": no value for {id}')
  })

  it('gates every script in a block, keeping its other attributes, and leaves data blocks alone', () => {
    const out = script('stats', {
      body: '<script src="/a.js" async defer id="a" crossorigin></script><p>x</p><script type="module">go()</script><script type="application/ld+json">{"a":1}</script>',
    })
    expect(out).toBe(
      '<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics" data-src="/a.js" data-async id="a" crossorigin></script>' +
        '<p>x</p>' +
        '<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics" data-type="module">go()</script>' +
        '<script type="application/ld+json">{"a":1}</script>',
    )
  })

  it('takes a block with no script tag as one script’s text', () => {
    expect(script('stats', { body: 'track()' })).toBe(
      '<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics">track()</script>',
    )
  })

  it('gates a rendered partial the same way', () => {
    expect(
      script('chat', {
        partialHtml: '<script src="https://w.example/sdk.js"></script>',
      }),
    ).toBe(
      '<script type="text/plain" data-kiss-service="chat" data-kiss-consent="marketing" data-src="https://w.example/sdk.js"></script>',
    )
  })

  it('writes the scripts of a service it does not gate exactly as written', () => {
    // defer is dropped only for the activation queue, which a plain script
    // never enters: in the head, losing it would run the script before <body>.
    const body =
      '<script defer src="/app.js"></script><script async src="/b.js"></script>'
    expect(script('cdn', { body })).toBe(body)
  })

  it('writes a necessary service, and a Google tag under advanced mode, plainly', () => {
    expect(script('cdn')).toBe(
      '<script src="https://cdn.example/lib.js"></script>',
    )
    const adv = resolved({
      services: { gtm: { id: 'G' } },
      google: { mode: 'advanced' },
    })
    const out = gatedScript('gtm', adv.services.gtm, {
      consent: adv,
      params: { id: 'G' },
    })
    expect(out).not.toContain('text/plain')
    expect(out).toContain(
      '<script src="https://www.googletagmanager.com/gtm.js?id=G"></script>',
    )
  })

  it('refuses document.write, an iframe, and a service with nothing to load', () => {
    expect(() =>
      script('stats', { body: '<script>document.write("x")</script>' }),
    ).toThrow(
      /document\.write in a script that runs after consent wipes the page/,
    )
    expect(() => script('stats', { body: 'document . writeln("x")' })).toThrow(
      /document\.write/,
    )
    expect(() =>
      script('stats', { body: '<iframe src="https://x.example"></iframe>' }),
    ).toThrow(/use \{\{consentEmbed\}\} for an iframe/)
    expect(() => script('chat')).toThrow(
      /has no src, inline script or partial to load/,
    )
  })

  it('escapes attribute values', () => {
    expect(script('stats', { src: '/x.js?a="b"&c' })).toContain(
      'data-src="/x.js?a=&quot;b&quot;&amp;c"',
    )
  })

  it('gates every script type a browser runs, and only those', () => {
    const out = script('stats', {
      body:
        '<script type="application/x-javascript">a()</script>' +
        '<script type=" text/javascript ">b()</script>' +
        '<script type="text/javascript1.5">c()</script>' +
        '<script language="javascript">d()</script>' +
        '<script type="MODULE">e()</script>' +
        '<script type="text/x-template">f</script>' +
        '<script language="vbscript">g</script>',
    })
    const gated = (body) =>
      `<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics">${body}</script>`
    expect(out).toBe(
      gated('a()') +
        gated('b()') +
        gated('c()') +
        // the language attribute is dropped with the type it stood for
        gated('d()') +
        '<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics" data-type="module">e()</script>' +
        '<script type="text/x-template">f</script>' +
        '<script language="vbscript">g</script>',
    )
  })

  it('keeps a block’s attribute values as the browser reads them, escaped once', () => {
    // `&amp;` in the source is `&` to a browser; written back it must be
    // `&amp;` again, not `&amp;amp;`, or the URL loaded after consent changes.
    const out = script('stats', {
      body: `<script src="/s.js?a=1&amp;b=2" data-note='say "hi" &lt;3'></script>`,
    })
    expect(out).toBe(
      '<script type="text/plain" data-kiss-service="stats" data-kiss-consent="statistics" data-src="/s.js?a=1&amp;b=2" data-note="say &quot;hi&quot; &lt;3"></script>',
    )
  })

  it('survives the production minifier with its gating intact', async () => {
    const html = `<!doctype html><html><head></head><body>${script('gtm')}${script('stats', { body: '<script src="/a.js" async></script>' })}</body></html>`
    const min = await minify(html, {
      collapseWhitespace: true,
      removeComments: true,
      removeEmptyAttributes: true,
      minifyCSS: true,
      minifyJS: true,
    })
    expect(min).toMatch(/type="?text\/plain"? data-kiss-service="?gtm"?/)
    expect(min).toMatch(
      /data-src="?https:\/\/www\.googletagmanager\.com\/gtm\.js\?id=GTM-X"?/,
    )
    expect(min).toMatch(/data-async/)
    expect(min).toContain("'gtm.start'")
    expect(
      consentWiringProblems(
        min.replace(
          '<head>',
          '<head><script data-kiss-consent-head></script><template data-kiss-consent-banner></template>',
        ),
      ),
    ).toEqual([])
  })
})

describe('embedMarkup', () => {
  it('holds the frame in a template behind a notice, with the provider’s link', () => {
    const out = embed('youtube', { hash: { id: 'abc' }, title: 'Our video' })
    expect(out).toContain(
      '<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing">',
    )
    expect(out).toContain(
      '<div class="kiss-embed__notice" data-kiss-consent-ui>',
    )
    expect(out).toContain(
      'This content is hosted by YouTube, which may set cookies when it loads.',
    )
    expect(out).toContain(
      '<button type="button" data-kiss-consent-action="load">Load it</button>',
    )
    expect(out).toContain(
      '<button type="button" data-kiss-consent-action="allow">Always allow YouTube</button>',
    )
    expect(out).toContain(
      '<a class="kiss-embed__watch" href="https://www.youtube.com/watch?v=abc">Open it on YouTube</a>',
    )
    expect(out).toMatch(
      /<template data-kiss-embed-frame><iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc" title="Our video" loading="lazy" allow="[^"]+" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"><\/iframe><\/template>/,
    )
  })

  it('requires a title', () => {
    expect(() => embed('youtube', { hash: { id: 'abc' } })).toThrow(
      /title= is required/,
    )
  })

  it('takes src= over the preset, and omits a watch link it cannot fill', () => {
    const out = embed('youtube', {
      src: 'https://www.youtube-nocookie.com/embed/zzz',
      title: 'T',
    })
    expect(out).toContain('src="https://www.youtube-nocookie.com/embed/zzz"')
    expect(out).not.toContain('kiss-embed__watch')
  })

  it('needs a src for a preset with none, and has no watch link for maps', () => {
    expect(() => embed('maps', { title: 'Map' })).toThrow(/no src — pass src=/)
    const out = embed('maps', {
      src: 'https://www.google.com/maps/embed?pb=1',
      title: 'Map',
    })
    expect(out).not.toContain('kiss-embed__watch')
    expect(out).toContain('Always allow Google')
  })
})

describe('consentWiringProblems', () => {
  const HEAD = '<script data-kiss-consent-head>x</script>'
  const BANNER =
    '<template data-kiss-consent-banner data-kiss-consent-hash="a"></template>'
  const GATED =
    '<script type="text/plain" data-kiss-service="gtm" data-src="https://g/x.js"></script>'
  const page = (head, body) =>
    `<html><head>${head}</head><body>${body}</body></html>`

  it('finds nothing on a page with no consent markup', () => {
    expect(
      consentWiringProblems(
        '<html><body><script src="/a.js"></script></body></html>',
      ),
    ).toEqual([])
  })

  it('finds nothing on a page wired right', () => {
    expect(
      consentWiringProblems(
        page(`<meta charset="utf-8">${HEAD}`, `${BANNER}${GATED}`),
      ),
    ).toEqual([])
  })

  it('reports gated markup and a settings control with no head', () => {
    expect(
      consentWiringProblems(
        page(
          '',
          `${GATED}<div data-kiss-embed="youtube"></div><button data-kiss-consent-action="settings">s</button>`,
        ),
      ),
    ).toEqual([
      'the page gates gtm, youtube but has no {{consentHead}} — put it in <head>, after <meta charset>',
      'the page has a {{consentSettings}} control but no {{consentHead}}',
    ])
  })

  it('reports a head with no banner, and doubles', () => {
    expect(consentWiringProblems(page(HEAD, GATED))).toEqual([
      'the page has {{consentHead}} but no {{consentBanner}} — put it first in <body>',
    ])
    expect(consentWiringProblems(page(HEAD + HEAD, BANNER + BANNER))).toEqual([
      '{{consentHead}} appears 2 times — once per page',
      '{{consentBanner}} appears 2 times — once per page',
    ])
  })

  it('reports an executable script before the head, and exempts data blocks', () => {
    expect(
      consentWiringProblems(
        page(
          `<script src="/early.js"></script><script>inline()</script>${HEAD}`,
          BANNER,
        ),
      ),
    ).toEqual([
      '/early.js, an inline script would run before {{consentHead}} sets the Consent Mode default — move {{consentHead}} above every script',
    ])
    expect(
      consentWiringProblems(
        page(`<script type="application/ld+json">{}</script>${HEAD}`, BANNER),
      ),
    ).toEqual([])
    expect(
      consentWiringProblems(
        page(
          `<script type="application/x-javascript" src="/old.js"></script>${HEAD}`,
          BANNER,
        ),
      ),
    ).toEqual([
      '/old.js would run before {{consentHead}} sets the Consent Mode default — move {{consentHead}} above every script',
    ])
  })

  it('reports one service loaded twice', () => {
    expect(consentWiringProblems(page(HEAD, BANNER + GATED + GATED))).toEqual([
      'gtm loads https://g/x.js 2 times — once per page',
    ])
  })
})

describe('findDocumentWrite', () => {
  it.each([
    ['document.write("x")', true],
    ['document . writeln(x)', true],
    ['window.document.write(a)', true],
    ['myDocument.writer()', false],
    ['documentation.write()', false],
  ])('%s → %s', (js, expected) => {
    expect(findDocumentWrite(js)).toBe(expected)
  })
})
