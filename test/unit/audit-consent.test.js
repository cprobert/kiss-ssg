import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, afterEach } from 'vitest'
import {
  CHECKS,
  auditBuild,
  extractPageFacts,
  thirdPartyOrigins,
} from '../../lib/audit.js'
import { resolveConsent } from '../../lib/consent.js'

// The consent manager's audit (contract §6): the facts each page carries, the
// gated origins in `thirdParty`, and the seven checks.

const SITE = 'https://site.example'
const doc = (head, body = '') =>
  `<!doctype html><html><head><meta charset="utf-8">${head}<title>T</title></head><body>${body}</body></html>`
const HEAD =
  '<script data-kiss-consent-head>(function(){var x="gtm.js"})()</script>'
const BANNER =
  '<template data-kiss-consent-banner data-kiss-consent-hash="0123456789ab"><div>Cookies</div></template>'
const SETTINGS =
  '<button type="button" data-kiss-consent-action="settings">Cookie settings</button>'
const GATED_GTM =
  '<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing">window.dataLayer=[]</script>' +
  '<script type="text/plain" data-kiss-service="gtm" data-kiss-consent="marketing" data-src="https://www.googletagmanager.com/gtm.js?id=G"></script>'
const EMBED =
  '<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing"><div data-kiss-consent-ui><button data-kiss-consent-action="load">Load</button></div>' +
  '<template data-kiss-embed-frame><iframe src="https://www.youtube-nocookie.com/embed/a" title="A"></iframe></template></div>'

/** @type {string[]} */
const temps = []
afterEach(() => {
  for (const dir of temps.splice(0))
    fs.rmSync(dir, { recursive: true, force: true })
})
function buildDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-audit-consent-'))
  temps.push(dir)
  fs.writeFileSync(path.join(dir, '404.html'), '<html></html>')
  fs.writeFileSync(path.join(dir, 'favicon.ico'), 'i')
  return dir.replace(/\\/g, '/')
}

let n = 0
const at = (html) => {
  n++
  const rel = `p${n}.html`
  return {
    buildTo: `public/${rel}`,
    facts: extractPageFacts(html, rel),
    canonicalElsewhere: false,
    siteUrl: SITE,
  }
}
const consentOf = (input) => resolveConsent(input)
const run = (pages, consent = null) =>
  auditBuild({ pages, buildDir: buildDir(), siteUrl: SITE, consent })
const only = (result, check) =>
  result.findings
    .filter((f) => f.check === check)
    .map((f) => [f.page, f.detail])

const CONSENT = consentOf({
  services: {
    gtm: { id: 'G' },
    youtube: {},
    jquery: { category: 'necessary', origins: ['https://code.jquery.com'] },
  },
})

describe('the consent checks are appended to CHECKS, in order', () => {
  it('ends with the seven', () => {
    expect(CHECKS.slice(-7)).toEqual([
      'consent-missing',
      'consent-ungated',
      'consent-ads-cmp',
      'consent-objection-third-party',
      'consent-settings-missing',
      'consent-google-advanced',
      'consent-records-missing',
    ])
  })
})

describe('consent facts', () => {
  it('reads the head, the banner hash, the settings control and gated markup', () => {
    const facts = extractPageFacts(
      doc(HEAD, BANNER + SETTINGS + GATED_GTM),
      'a.html',
    )
    expect(facts.consent).toEqual({
      head: true,
      banner: '0123456789ab',
      settings: true,
      gated: true,
      signatures: [],
    })
  })

  it('reads nothing on a page with no consent markup', () => {
    expect(extractPageFacts(doc(''), 'a.html').consent).toEqual({
      head: false,
      banner: null,
      settings: false,
      gated: false,
      signatures: [],
    })
  })

  it('records the origin a gated script and an embed frame load from, with their service', () => {
    const facts = extractPageFacts(
      doc(HEAD, BANNER + GATED_GTM + EMBED),
      'a.html',
    )
    expect(facts.origins).toEqual([
      {
        origin: 'https://www.googletagmanager.com',
        kind: 'script',
        service: 'gtm',
      },
      {
        origin: 'https://www.youtube-nocookie.com',
        kind: 'iframe',
        service: 'youtube',
      },
    ])
  })

  it('records Google loader and ad signatures in ungated inline scripts only', () => {
    const facts = extractPageFacts(
      doc(
        HEAD,
        '<script>(adsbygoogle=window.adsbygoogle||[]).push({})</script>' +
          '<script>var u="https://www.googletagmanager.com/gtm.js?id="+i</script>' +
          '<script type="text/plain" data-kiss-service="gtm">googletag.cmd.push(1)</script>' +
          '<script type="application/ld+json">{"x":"gtag/js"}</script>' +
          '<ins class="adsbygoogle" data-ad-client="ca-pub-1"></ins>',
      ),
      'a.html',
    )
    expect(facts.consent.signatures).toEqual([
      'adsbygoogle',
      'data-ad-client',
      'gtm.js',
    ])
  })

  it('reads no signature from a script a browser never runs: in a comment or a template', () => {
    const facts = extractPageFacts(
      doc(
        HEAD,
        '<!-- <script>var u="gtm.js"</script> -->' +
          '<template><script>(adsbygoogle=window.adsbygoogle||[]).push({})</script></template>' +
          '<script>var v="gtag/js"</script>',
      ),
      'a.html',
    )
    expect(facts.consent.signatures).toEqual(['gtag/js'])
  })

  it('reads an inline script of any type a browser runs, not only the common ones', () => {
    const facts = extractPageFacts(
      doc(
        HEAD,
        '<script type="application/x-javascript">var u="gtm.js"</script>' +
          '<script language="javascript">var v="gtag/js"</script>',
      ),
      'a.html',
    )
    expect(facts.consent.signatures).toEqual(['gtag/js', 'gtm.js'])
  })
})

describe('thirdParty with gated origins', () => {
  it('lists the services an origin is gated behind, and leaves other entries as they were', () => {
    const result = thirdPartyOrigins({
      siteUrl: SITE,
      pages: [
        at(
          doc(
            HEAD,
            BANNER +
              GATED_GTM +
              EMBED +
              '<img src="https://img.example/a.png" alt="">',
          ),
        ),
      ],
    })
    expect(result?.pages[0].origins).toEqual([
      { origin: 'https://img.example', kinds: ['img'] },
      {
        origin: 'https://www.googletagmanager.com',
        kinds: ['script'],
        services: ['gtm'],
      },
      {
        origin: 'https://www.youtube-nocookie.com',
        kinds: ['iframe'],
        services: ['youtube'],
      },
    ])
  })

  it('keeps gtm and gtag on one origin apart', () => {
    const page = at(
      doc(
        HEAD,
        BANNER +
          GATED_GTM +
          '<script type="text/plain" data-kiss-service="gtag" data-src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
      ),
    )
    expect(page.facts.origins.filter((o) => o.kind === 'script')).toEqual([
      {
        origin: 'https://www.googletagmanager.com',
        kind: 'script',
        service: 'gtag',
      },
      {
        origin: 'https://www.googletagmanager.com',
        kind: 'script',
        service: 'gtm',
      },
    ])
  })
})

describe('consent-missing', () => {
  it('reports a tracker loaded on a site with no consent manager', () => {
    const result = run([
      at(
        doc(
          '<script async src="https://www.googletagmanager.com/gtm.js?id=G"></script>',
        ),
      ),
      at(
        doc(
          '',
          '<iframe src="https://player.vimeo.com/video/1" title="v"></iframe>',
        ),
      ),
      at(
        doc(
          '',
          '<script>var s="https://www.googletagmanager.com/gtm.js"</script>',
        ),
      ),
      at(doc('', '<script src="https://cdn.jsdelivr.net/npm/x"></script>')),
    ])
    expect(only(result, 'consent-missing')).toEqual([
      [`public/p${n - 3}.html`, 'https://www.googletagmanager.com'],
      [`public/p${n - 2}.html`, 'https://player.vimeo.com'],
      [`public/p${n - 1}.html`, 'gtm.js'],
    ])
  })

  it('does not run when the site has a consent manager', () => {
    const result = run([at(doc(HEAD, BANNER + SETTINGS + GATED_GTM))], CONSENT)
    expect(only(result, 'consent-missing')).toEqual([])
  })
})

describe('consent-ungated', () => {
  it('reports a third-party script or iframe no service gates, including a noscript GTM frame', () => {
    const result = run(
      [
        at(
          doc(
            HEAD + '<script src="https://widget.chat.example/sdk.js"></script>',
            BANNER +
              SETTINGS +
              GATED_GTM +
              EMBED +
              '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=G"></iframe></noscript>' +
              '<script src="https://code.jquery.com/jquery.min.js"></script>' +
              '<script src="/js/own.js"></script><script src="https://site.example/js/x.js"></script>' +
              '<img src="https://img.example/a.png" alt="">',
          ),
        ),
      ],
      CONSENT,
    )
    expect(only(result, 'consent-ungated')).toEqual([
      [`public/p${n}.html`, 'https://widget.chat.example'],
      [`public/p${n}.html`, 'https://www.googletagmanager.com'],
    ])
  })

  it('does not run without a consent manager', () => {
    const result = run([
      at(doc('<script src="https://widget.chat.example/sdk.js"></script>')),
    ])
    expect(only(result, 'consent-ungated')).toEqual([])
  })
})

describe('consent-ads-cmp', () => {
  it('reports AdSense and Ad Manager loaders and slots, consent manager or not', () => {
    const pages = [
      at(
        doc(
          '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1"></script>',
        ),
      ),
      at(
        doc(
          '<script src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"></script>',
        ),
      ),
      at(doc('', '<ins class="adsbygoogle" data-ad-client="ca-pub-1"></ins>')),
    ]
    const first = n - 2
    expect(only(run(pages), 'consent-ads-cmp')).toEqual([
      [`public/p${first}.html`, 'https://pagead2.googlesyndication.com'],
      [`public/p${first + 1}.html`, 'https://securepubads.g.doubleclick.net'],
      [`public/p${first + 2}.html`, 'data-ad-client'],
    ])
    expect(only(run(pages, CONSENT), 'consent-ads-cmp')).toHaveLength(3)
  })
})

describe('the site-wide consent checks', () => {
  it('consent-objection-third-party: an objection category loading from someone else', () => {
    const consent = consentOf({
      categories: { statistics: { mode: 'objection' } },
      services: {
        stats: { category: 'statistics', src: 'https://stats.example/s.js' },
        own: { category: 'statistics', src: '/js/own.js' },
        mine: { category: 'statistics', src: 'https://site.example/js/m.js' },
      },
    })
    expect(
      only(
        run([at(doc(HEAD, BANNER + SETTINGS))], consent),
        'consent-objection-third-party',
      ),
    ).toEqual([[null, 'stats https://stats.example']])
  })

  it('consent-settings-missing: a page with the head and no settings control', () => {
    const result = run(
      [at(doc(HEAD, BANNER)), at(doc(HEAD, BANNER + SETTINGS))],
      CONSENT,
    )
    expect(only(result, 'consent-settings-missing')).toEqual([
      [`public/p${n - 1}.html`, null],
    ])
  })

  it('consent-settings-missing: not when every service is necessary, since there is nothing to ask', () => {
    // {{consentSettings}} renders nothing then, so no page could satisfy it
    const necessaryOnly = consentOf({
      services: {
        jquery: { category: 'necessary', origins: ['https://code.jquery.com'] },
      },
    })
    expect(
      only(run([at(doc(HEAD, ''))], necessaryOnly), 'consent-settings-missing'),
    ).toEqual([])
  })

  it('consent-google-advanced: advanced Consent Mode', () => {
    const consent = consentOf({
      services: { gtm: { id: 'G' } },
      google: { mode: 'advanced' },
    })
    expect(
      only(
        run([at(doc(HEAD, BANNER + SETTINGS))], consent),
        'consent-google-advanced',
      ),
    ).toEqual([[null, null]])
    expect(
      only(
        run([at(doc(HEAD, BANNER + SETTINGS))], CONSENT),
        'consent-google-advanced',
      ),
    ).toEqual([])
  })

  it('consent-records-missing: a Google marketing tag with no endpoint', () => {
    expect(
      only(
        run([at(doc(HEAD, BANNER + SETTINGS))], CONSENT),
        'consent-records-missing',
      ),
    ).toEqual([[null, 'gtm']])
    const logged = consentOf({
      services: { gtm: { id: 'G' } },
      endpoint: '/log',
    })
    expect(
      only(
        run([at(doc(HEAD, BANNER + SETTINGS))], logged),
        'consent-records-missing',
      ),
    ).toEqual([])
  })

  it('is silenced by audit.ignore like any check', () => {
    const result = auditBuild({
      pages: [at(doc(HEAD, BANNER))],
      buildDir: buildDir(),
      siteUrl: SITE,
      consent: CONSENT,
      ignore: ['consent-settings-missing', 'consent-records-missing'],
    })
    expect(
      result.findings.filter((f) => f.check.startsWith('consent-')),
    ).toEqual([])
  })
})
