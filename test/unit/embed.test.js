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

// The box holds the frame's space, geometry only (the operator, 2026-11-04).
const BOX_16_9 =
  'display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;box-sizing:content-box;aspect-ratio:16/9'

describe('embedMarkup under config.consent', () => {
  it('holds the frame in a template behind a notice, with the provider’s link', () => {
    const out = gated('youtube', { hash: { id: 'abc' }, title: 'Our video' })
    expect(out).toContain(
      `<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-consent="marketing" data-kiss-embed-autoplay style="${BOX_16_9}">`,
    )
    expect(out).toContain(
      '<div class="kiss-embed__notice" data-kiss-consent-ui>',
    )
    expect(out).toContain(
      'This content is hosted by Google, which may set cookies when it loads.',
    )
    // A video: Play video, named with the title (2.13.0).
    expect(out).toMatch(
      /<button type="button" data-kiss-consent-action="load" aria-label="Play video: [^"]+">Play video<\/button>/,
    )
    expect(out).toContain(
      '<button type="button" data-kiss-consent-action="allow">Always allow YouTube</button>',
    )
    // Inside the notice, so it goes with it when the frame comes.
    expect(out).toContain(
      '<p><a class="kiss-embed__watch" href="https://www.youtube.com/watch?v=abc">Open it on YouTube</a></p></div><template',
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
      `<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-embed-facade data-kiss-embed-autoplay style="${BOX_16_9}">`,
    )
    expect(out).toContain('<div class="kiss-embed__notice" data-kiss-embed-ui>')
    expect(out).toContain(
      '<button type="button" data-kiss-embed-action="load" aria-label="Play video: Our video">Play video</button>',
    )
    expect(out).not.toContain('data-kiss-consent')
    expect(out).not.toContain('Always allow')
    expect(out).toContain(
      '<p><a class="kiss-embed__watch" href="https://www.youtube.com/watch?v=abc">Open it on YouTube</a></p></div><template',
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

// a1k9training, 2026-11-05: a plain box with a sentence did not read as a
// video on a phone. A poster is a self-hosted still under the notice, which
// the operator chose to make readable by default (a scrim, white text, a play
// mark on a video), overridable through custom properties.
describe('embedMarkup with a poster', () => {
  const POSTER = '<picture><img src="/img/still.jpg" alt=""></picture>'

  it('draws the poster in the reserved box, under a readable notice, and hides it with the notice', () => {
    const out = facade('youtube', {
      hash: { id: 'abc' },
      title: 'Puppy class',
      poster: POSTER,
    })
    expect(out).toContain(
      `<div class="kiss-embed kiss-embed--poster" data-kiss-embed="youtube" data-kiss-embed-facade data-kiss-embed-autoplay style="${BOX_16_9};position:relative;justify-content:flex-end">`,
    )
    expect(out).toContain(
      `<div class="kiss-embed__poster" data-kiss-embed-ui style="position:absolute;inset:0;overflow:hidden">${POSTER}</div>`,
    )
    expect(out).toContain(
      '<div class="kiss-embed__notice" data-kiss-embed-ui style="position:relative;width:100%;box-sizing:border-box;padding:.5rem .75rem;font-size:.875em;line-height:1.35;background:var(--kiss-embed-poster-scrim,rgba(0,0,0,.72));color:var(--kiss-embed-poster-text,#fff)">',
    )
    // The watch link takes the strip's colour, over a site's own link colour,
    // and sits beside the button, so the strip is one line shorter.
    expect(out).toContain(
      '<p style="color:inherit;display:inline-block;margin:.25rem 0 .25rem .75rem"><a class="kiss-embed__watch" href="https://www.youtube.com/watch?v=abc" style="color:inherit">',
    )
  })

  it('marks a video’s Load button with a play symbol, hidden from screen readers', () => {
    const out = facade('youtube', {
      hash: { id: 'abc' },
      title: 'T',
      poster: POSTER,
    })
    expect(out).toMatch(
      /data-kiss-embed-action="load" aria-label="[^"]+"><svg aria-hidden="true" focusable="false"[^>]*><path[^>]*\/><\/svg>/,
    )
    const map = facade('google-maps', {
      src: 'https://www.google.com/maps/embed?pb=x',
      title: 'Map',
      poster: POSTER,
    })
    expect(map).not.toContain('<svg')
  })

  it('poster the same way under config.consent, hidden by the consent client', () => {
    const out = gated('youtube', {
      hash: { id: 'abc' },
      title: 'T',
      poster: POSTER,
    })
    expect(out).toContain(
      `<div class="kiss-embed__poster" data-kiss-consent-ui style="position:absolute;inset:0;overflow:hidden">${POSTER}</div>`,
    )
  })

  it('writes nothing new without a poster', () => {
    const out = facade('youtube', { hash: { id: 'abc' }, title: 'T' })
    expect(out).not.toContain('kiss-embed--poster')
    expect(out).not.toContain('<svg')
    expect(out).toContain('<div class="kiss-embed__notice" data-kiss-embed-ui>')
  })
})

// a1k9training, 2026-11-05: "Load it" told a screen-reader user nothing, and
// a site with no banner could not change it. A video's button says "Play
// video", every Load button's name carries the title, and the wording can be
// set per call.
describe('embedMarkup wording', () => {
  it('labels a video’s button Play video, and names it with the title', () => {
    const out = facade('youtube', { hash: { id: 'abc' }, title: 'Puppy class' })
    expect(out).toContain(
      '<button type="button" data-kiss-embed-action="load" aria-label="Play video: Puppy class">Play video</button>',
    )
  })

  it('keeps Load it for anything else, still named with the title', () => {
    const out = facade('google-maps', {
      src: 'https://www.google.com/maps/embed?pb=x',
      title: 'Our shop',
    })
    expect(out).toContain(
      '<button type="button" data-kiss-embed-action="load" aria-label="Load it: Our shop">Load it</button>',
    )
  })

  it('takes load=, notice= and open= for one embed, filling {provider} and {service}', () => {
    const out = facade('youtube', {
      hash: { id: 'abc' },
      title: 'Puppy class',
      own: {
        load: 'Watch the class',
        notice: 'Hosted by {provider}.',
        open: 'See it on {service}',
      },
    })
    expect(out).toContain(
      'aria-label="Watch the class: Puppy class">Watch the class</button>',
    )
    expect(out).toContain('<p>Hosted by Google.</p>')
    expect(out).toContain('>See it on YouTube</a>')
  })

  it('uses ui.text.embedPlay under config.consent, and leaves Always allow alone', () => {
    const out = gatedWith({ embedPlay: 'Chwarae fideo' }, 'youtube', {
      hash: { id: 'abc' },
      title: 'Dosbarth',
    })
    expect(out).toContain(
      'data-kiss-consent-action="load" aria-label="Chwarae fideo: Dosbarth">Chwarae fideo</button>',
    )
    expect(out).toContain(
      '<button type="button" data-kiss-consent-action="allow">Always allow YouTube</button>',
    )
  })

  it('gives a site that worded embedLoad and not embedPlay its own wording on videos too', () => {
    const out = gatedWith({ embedLoad: 'Llwytho' }, 'youtube', {
      hash: { id: 'abc' },
      title: 'Dosbarth',
    })
    expect(out).toContain('aria-label="Llwytho: Dosbarth">Llwytho</button>')
  })
})

// The click that reveals a video's frame is the request to play it, so a
// video box asks for autoplay; only the Load click adds it, never a reveal
// from a stored choice.
describe('embedMarkup autoplay', () => {
  // The box's own opening tag: the facade's script names the attribute too.
  /** @param {string} html */
  const boxTag = (html) => html.match(/^<div[^>]*>/)?.[0] ?? ''

  it('marks a video box to autoplay on Load, unless autoplay=false', () => {
    expect(facade('youtube', { hash: { id: 'abc' }, title: 'T' })).toMatch(
      /<div class="kiss-embed" data-kiss-embed="youtube" data-kiss-embed-facade data-kiss-embed-autoplay style=/,
    )
    expect(gated('youtube', { hash: { id: 'abc' }, title: 'T' })).toContain(
      'data-kiss-embed-autoplay',
    )
    expect(
      boxTag(
        facade('youtube', { hash: { id: 'abc' }, title: 'T', autoplay: false }),
      ),
    ).not.toContain('data-kiss-embed-autoplay')
  })

  it('never marks anything that is not a video', () => {
    const map = facade('google-maps', {
      src: 'https://www.google.com/maps/embed?pb=x',
      title: 'Map',
    })
    expect(boxTag(map)).toMatch(/^<div class="kiss-embed"/)
    expect(boxTag(map)).not.toContain('data-kiss-embed-autoplay')
  })

  it('leaves the frame’s own src alone: only the click adds autoplay=1', () => {
    expect(facade('youtube', { hash: { id: 'abc' }, title: 'T' })).toContain(
      '<iframe src="https://www.youtube-nocookie.com/embed/abc"',
    )
    expect(facadeScript()).toContain('data-kiss-embed-autoplay')
    expect(facadeScript()).toContain("searchParams.set('autoplay', '1')")
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
    // The box holds the starting height and the width cap until the frame
    // reports its own height.
    expect(out).toContain(
      'data-kiss-embed-facade style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;box-sizing:content-box;min-height:600px;max-width:540px;margin-left:auto;margin-right:auto">',
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
      video: false,
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
      'soundcloud',
    ])
  })
})

// 2026-11-04, the fleet audit: a bare, auto-playing SoundCloud iframe was the
// slowest page in the fleet (swan-love's home page, LCP 4.7 s). The player
// alone fetched 2,632 KB of bodies on load, from six origins, and stored
// nothing, logged out, in Chromium (measured the same day).
describe('the soundcloud preset', () => {
  it('is SoundCloud’s, in marketing, with the origins measured on 2026-11-04', () => {
    const service = /** @type {any} */ (presetService('soundcloud'))
    expect(service.category).toBe('marketing')
    expect(service.label).toBe('SoundCloud')
    expect(service.provider).toBe('SoundCloud')
    expect(service.origins).toEqual([
      'https://api-widget.soundcloud.com',
      'https://dwt.soundcloud.com',
      'https://i1.sndcdn.com',
      'https://w.soundcloud.com',
      'https://wave.sndcdn.com',
      'https://widget.sndcdn.com',
    ])
    expect(service.cookies).toEqual([])
    expect(service.storage).toEqual([])
  })

  it('takes a track id, never autoplays, and holds the classic player’s 166 px', () => {
    const out = facade('soundcloud', {
      hash: { id: '317030874' },
      title: 'Our charity single',
    })
    expect(out).toContain(
      'src="https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/317030874&amp;auto_play=false" title="Our charity single"',
    )
    expect(out).toContain('aspect-ratio:auto;height:166px')
    expect(out).toContain('min-height:166px')
    // A track id gives no link to the track's own page (measured: SoundCloud
    // needs the permalink), so the notice offers Load and no link.
    expect(out).not.toContain('kiss-embed__watch')
  })

  it('takes src= for a playlist or a permalink URL instead', () => {
    const out = facade('soundcloud', {
      src: 'https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/band/sets/live',
      title: 'Live set',
    })
    expect(out).toContain('soundcloud.com/band/sets/live')
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
