import { describe, it, expect } from 'vitest'
import {
  embedMarkup,
  embedPresetNames,
  embedService,
  facadeScript,
  measureScript,
} from '../../lib/embed.js'
import {
  DEFAULT_TEXT,
  presetService,
  purposesVersion,
  resolveConsent,
  serviceParams,
} from '../../lib/consent.js'

/** @param {any} input */
const resolved = (input) => {
  const r = resolveConsent(input)
  if (!r) throw new Error('no consent')
  return r
}

const consent = resolved({
  services: {
    youtube: {},
    maps: { preset: 'google-maps' },
    instagram: {},
    lib: {
      category: 'necessary',
      embed: { src: 'https://cdn.example/{id}' },
    },
  },
})

/**
 * Under the site's config.consent.
 *
 * @param {string} name
 * @param {Record<string, any>} [extra]
 */
const gated = (name, extra = {}) => {
  const service = embedService(name, consent)
  return embedMarkup(name, service, {
    consent,
    text: consent.ui.text,
    params: serviceParams(service, extra.hash ?? {}),
    ...extra,
  })
}

/**
 * On a site with no config.consent.
 *
 * @param {string} name
 * @param {Record<string, any>} [extra]
 */
const facade = (name, extra = {}) => {
  const service = embedService(name, null)
  return embedMarkup(name, service, {
    consent: null,
    text: DEFAULT_TEXT,
    params: serviceParams(service, extra.hash ?? {}),
    ...extra,
  })
}

/**
 * An embed under a site's own `ui.text`.
 *
 * @param {Record<string, string>} text
 * @param {string} name
 * @param {Record<string, any>} [extra]
 */
const gatedWith = (text, name, extra = {}) => {
  const own = resolved({ services: { youtube: {} }, ui: { text } })
  const service = embedService(name, own)
  return embedMarkup(name, service, {
    consent: own,
    text: own.ui.text,
    params: serviceParams(service, extra.hash ?? {}),
    ...extra,
  })
}

describe('embedMarkup under config.consent', () => {
  it('holds the frame in a template behind a notice, with the provider’s link', () => {
    const out = gated('youtube', { hash: { id: 'abc' }, title: 'Our video' })
    expect(out).toContain(
      '<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing">',
    )
    expect(out).toContain(
      '<div class="kiss-embed__notice" data-kiss-consent-ui>',
    )
    expect(out).toContain(
      'This content is hosted by Google, which may set cookies when it loads.',
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
      /<template data-kiss-embed-frame><iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/abc" title="Our video" loading="lazy" allow="[^"]+" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="display:block;width:100%;border:0;aspect-ratio:16\/9;height:auto"><\/iframe><\/template>/,
    )
    // The consent client wires it: no script of its own.
    expect(out).not.toContain('<script')
  })

  it('requires a title', () => {
    expect(() => gated('youtube', { hash: { id: 'abc' } })).toThrow(
      /embed "youtube": title= is required/,
    )
  })

  it('takes src= over the preset, and omits a watch link it cannot fill', () => {
    const out = gated('youtube', {
      src: 'https://www.youtube-nocookie.com/embed/zzz',
      title: 'T',
    })
    expect(out).toContain('src="https://www.youtube-nocookie.com/embed/zzz"')
    expect(out).not.toContain('kiss-embed__watch')
  })

  it('needs a src for a preset with none, and has no watch link for maps', () => {
    expect(() => gated('maps', { title: 'Map' })).toThrow(
      /no src — pass src= or set config\.consent\.services\.maps\.embed\.src/,
    )
    const out = gated('maps', {
      src: 'https://www.google.com/maps/embed?pb=1',
      title: 'Map',
    })
    expect(out).not.toContain('kiss-embed__watch')
    // The grant is for this service alone, so the button names it, not its
    // provider: "Always allow Google" offered all of Google (2026-11-04).
    expect(out).toContain('Always allow Google Maps')
    expect(out).toContain('This content is hosted by Google,')
  })

  it('fills {service} with the label and {provider} with the provider, in a site’s own wording', () => {
    const out = gatedWith(
      { embedAllow: 'Allow {service} by {provider}' },
      'youtube',
      { hash: { id: 'abc' }, title: 'T' },
    )
    expect(out).toContain('Allow YouTube by Google</button>')
  })

  it('writes a necessary service’s frame plainly', () => {
    const out = gated('lib', { hash: { id: 'x' }, title: 'T' })
    expect(out).toMatch(/^<iframe src="https:\/\/cdn\.example\/x"/)
    expect(out).not.toContain('<template')
  })

  it('refuses a service the site has not declared, naming where to declare it', () => {
    expect(() => embedService('vimeo', consent)).toThrow(
      /embed "vimeo": no service "vimeo" in config\.consent\.services — declare it there \(`vimeo: \{\}` picks the preset/,
    )
  })
})

describe('embedMarkup with no config.consent (a facade)', () => {
  it('writes a Load button and the provider’s link, and no Always allow', () => {
    const out = facade('youtube', { hash: { id: 'abc' }, title: 'Our video' })
    expect(out).toContain(
      '<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-embed-facade>',
    )
    expect(out).toContain('<div class="kiss-embed__notice" data-kiss-embed-ui>')
    expect(out).toContain(
      '<button type="button" data-kiss-embed-action="load">Load it</button>',
    )
    expect(out).not.toContain('data-kiss-consent')
    expect(out).not.toContain('Always allow')
    expect(out).toContain(
      '<a class="kiss-embed__watch" href="https://www.youtube.com/watch?v=abc">Open it on YouTube</a>',
    )
    expect(out).toContain(
      '<template data-kiss-embed-frame><iframe src="https://www.youtube-nocookie.com/embed/abc"',
    )
  })

  it('wires itself with the script written after it', () => {
    const out = facade('youtube', { hash: { id: 'abc' }, title: 'T' })
    expect(out.endsWith(`</div>${facadeScript()}`)).toBe(true)
    expect(facadeScript()).toMatch(
      /^<script>\(function kissEmbedFacade\(doc\) \{[\s\S]+\}\)\(document\)<\/script>$/,
    )
  })

  it('refuses a name with no embed preset, listing the ones there are', () => {
    expect(() => embedService('gtm', null)).toThrow(
      /embed "gtm": kiss has no embed preset "gtm" — use one of youtube, vimeo, google-maps, instagram/,
    )
    expect(() => embedService('nope', null)).toThrow(/no embed preset "nope"/)
  })

  it('needs src= for google-maps, without naming config it does not have', () => {
    expect(() => facade('google-maps', { title: 'Map' })).toThrow(
      /embed "google-maps": no src — pass src=$/,
    )
  })
})

describe('the instagram preset', () => {
  it('is Meta’s, in marketing, with the origins measured on 2026-11-04', () => {
    const service = /** @type {any} */ (presetService('instagram'))
    expect(service.category).toBe('marketing')
    expect(service.label).toBe('Instagram')
    expect(service.provider).toBe('Meta')
    expect(service.origins).toEqual([
      'https://scontent.cdninstagram.com',
      'https://static.cdninstagram.com',
      'https://www.instagram.com',
    ])
    expect(service.cookies).toEqual([])
    expect(service.storage).toEqual([])
  })

  it('takes one id for a post or a reel, sizes the frame from its content, and follows its height', () => {
    const out = facade('instagram', {
      hash: { id: 'DfQCqMnhpsG' },
      title: 'Our latest roast',
    })
    expect(out).toContain(
      'src="https://www.instagram.com/p/DfQCqMnhpsG/embed" title="Our latest roast"',
    )
    expect(out).toContain(
      'style="display:block;width:100%;border:0;max-width:540px;margin:0 auto;aspect-ratio:auto;height:600px"',
    )
    expect(out).toContain(
      'href="https://www.instagram.com/p/DfQCqMnhpsG/">Open it on Instagram</a>',
    )
    expect(
      out.endsWith(measureScript('https://www.instagram.com/p/x/embed')),
    ).toBe(true)
  })

  it('follows the height under config.consent too, which the consent client reveals', () => {
    const out = gated('instagram', { hash: { id: 'x' }, title: 'T' })
    expect(out).toContain('data-kiss-consent-action="allow"')
    expect(out).toContain('kissEmbedMeasure')
    expect(out).not.toContain('kissEmbedFacade')
  })

  it('listens only to the frame’s own origin', () => {
    expect(measureScript('https://www.instagram.com/p/x/embed')).toMatch(
      /\(window,"https:\/\/www\.instagram\.com"\)<\/script>$/,
    )
    expect(measureScript('/local/frame.html')).toBe('')
  })
})

describe('embed settings in config.consent', () => {
  /** @param {any} embed */
  const embedOf = (embed) =>
    resolved({ services: { v: { category: 'marketing', embed } } }).services.v
      .embed

  it('defaults to a 16:9 frame with no width cap that reports nothing', () => {
    expect(embedOf({ src: 'https://v.example/{id}' })).toEqual({
      src: 'https://v.example/{id}',
      title: null,
      watch: null,
      ratio: '16/9',
      width: null,
      height: null,
      measure: false,
    })
  })

  it('takes a ratio, a width, a height and measure', () => {
    expect(
      embedOf({
        src: 'https://v.example/{id}',
        ratio: '4 / 3',
        width: 640,
        height: 400,
        measure: true,
      }),
    ).toMatchObject({ ratio: '4/3', width: 640, height: 400, measure: true })
    expect(embedOf({ src: 'https://v.example/{id}', ratio: null }).ratio).toBe(
      null,
    )
  })

  it('refuses a ratio, a size or a flag it cannot use', () => {
    expect(() => embedOf({ ratio: 'wide' })).toThrow(
      /embed\.ratio must be a CSS aspect ratio/,
    )
    expect(() => embedOf({ ratio: '16/0' })).toThrow(/embed\.ratio/)
    expect(() => embedOf({ width: '540px' })).toThrow(
      /embed\.width must be a whole number of CSS pixels/,
    )
    expect(() => embedOf({ height: 0 })).toThrow(/embed\.height/)
    expect(() => embedOf({ measure: 'yes' })).toThrow(
      /embed\.measure must be true or false/,
    )
  })
})

describe('embedPresetNames', () => {
  it('lists every preset with an embed, in preset order', () => {
    expect(embedPresetNames()).toEqual([
      'youtube',
      'vimeo',
      'google-maps',
      'instagram',
    ])
  })
})

describe('the youtube preset’s storage', () => {
  it('declares the IndexedDB database measured on 2026-11-04, beside the 11-02 keys', () => {
    const service = /** @type {any} */ (presetService('youtube'))
    expect(service.storage.map((/** @type {any} */ s) => s.name)).toEqual([
      'yt-icons-last-purged',
      'ytidb::LAST_RESULT_ENTRY_KEY',
      'YtIdbMeta',
    ])
  })

  it('moves no site’s purposes version: storage is not a purpose', () => {
    // Measured on main at c57de88 for `{ services: { youtube: {} } }`, and
    // the value the 2026-11-04 consent-dialog log recorded after YouTube's
    // provider became Google.
    expect(purposesVersion(resolved({ services: { youtube: {} } }))).toBe(
      '1588eaa503a3',
    )
  })
})
