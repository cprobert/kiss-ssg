import { describe, it, expect } from 'vitest'
import {
  extractReferences,
  extractCssReferences,
  resolveReference,
  commonRoot,
  packageMembers,
  documentBase,
} from '../../lib/packages.js'

describe('extractReferences', () => {
  it('keeps what a page needs apart from where it links', () => {
    const html = `<html><head>
      <link rel="stylesheet" href="css/a.css">
      <link rel="icon" href="icon.png">
      <link rel="canonical" href="https://e.com/x">
      <link rel="alternate" href="/feed.xml">
      <script src="js/app.js"></script>
      <style>.x { background: url('img/d.png') } @import "css/b.css";</style>
    </head><body>
      <img src="img/a.png" srcset="img/a.png 1x, img/b.png 2x">
      <picture><source srcset="img/w.webp 800w, img/w2.webp 1600w"></picture>
      <div style="background-image: url(img/c.png)"></div>
      <video poster="img/e.png"><track src="cap.vtt"></video>
      <object data="doc.pdf"></object><embed src="anim.swf">
      <svg><use href="sprite.svg#i"></use><image xlink:href="img/f.png"></image></svg>
      <iframe src="embed/frame.html"></iframe>
      <a href="tab-2.html">next</a><area href="map.html">
      <form action="/send"></form>
    </body></html>`
    const { needs, anchors } = extractReferences(html)
    expect(needs).toEqual([
      'css/a.css',
      'icon.png',
      'js/app.js',
      'img/d.png',
      'css/b.css',
      'img/a.png',
      'img/b.png',
      'img/w.webp',
      'img/w2.webp',
      'img/c.png',
      'img/e.png',
      'cap.vtt',
      'doc.pdf',
      'anim.swf',
      'sprite.svg#i',
      'img/f.png',
      'embed/frame.html',
    ])
    expect(anchors).toEqual(['tab-2.html', 'map.html'])
  })

  it('reads a srcset as a browser does: a URL runs to whitespace, commas and all', () => {
    const needs = (srcset) =>
      extractReferences(`<img srcset="${srcset}">`).needs
    expect(needs('images/crop,large.png 2x, b.png 1x')).toEqual([
      'images/crop,large.png',
      'b.png',
    ])
    expect(needs('data:image/png;base64,AAAA 1x, c.png 2x')).toEqual([
      'data:image/png;base64,AAAA',
      'c.png',
    ])
    // No descriptor, a URL ending in a comma, extra spaces and commas.
    expect(needs('a.png,b.png 2x')).toEqual(['a.png,b.png'])
    expect(needs('a.png, b.png')).toEqual(['a.png', 'b.png'])
    expect(needs(' ,a.png 100w,,  b.png 200w, ')).toEqual(['a.png', 'b.png'])
  })

  it('reads each reference once, in document order', () => {
    expect(
      extractReferences(
        '<img src="a.png"><img src="a.png"><a href="b.html"></a><a href="b.html"></a>',
      ),
    ).toEqual({
      needs: ['a.png'],
      anchors: ['b.html'],
      base: null,
    })
  })

  it('reads the document base URL, the first <base href> only', () => {
    expect(
      extractReferences(
        '<head><base href="../assets/"><base href="other/"></head><img src="a.png">',
      ).base,
    ).toBe('../assets/')
    expect(
      extractReferences('<base target="_blank"><img src="a.png">').base,
    ).toBe(null)
  })

  // The first <base> with an href is the document's base, even an empty one,
  // which a browser resolves to the document's own URL.
  it('takes an empty first <base href> as the base, ignoring a later one', () => {
    const refs = extractReferences(
      '<base href=""><base href="https://other.example/"><img src="a.png">',
    )
    expect(refs.base).toBe('')
    expect(refs.needs).toEqual(['a.png'])
  })
})

// A browser's URL parser, on an http(s) page, drops tabs and newlines and reads
// a backslash as a slash, before it resolves anything.
describe('references read as a browser reads them', () => {
  it('resolves a backslash as a slash, and drops tabs and newlines', () => {
    expect(resolveReference('img\\a.png', 'course/l1/tab-1.html')).toEqual({
      kind: 'path',
      rel: 'course/l1/img/a.png',
    })
    expect(resolveReference('im\tg/a\n.png', 'tab.html')).toEqual({
      kind: 'path',
      rel: 'img/a.png',
    })
    expect(resolveReference('\\\\cdn.example\\x.png', 'tab.html')).toEqual({
      kind: 'skip',
    })
    expect(resolveReference('\\img\\a.png', 'tab.html').kind).toBe('outside')
  })

  it('reads a base with a backslash the same way', () => {
    expect(documentBase('..\\assets\\', 'course/l1/tab-1.html')).toBe(
      'course/assets/x',
    )
  })
})

describe('extractCssReferences', () => {
  it('finds url() in every quoting, and @import with or without url()', () => {
    const css = `@import "a.css"; @import url('b.css'); @import url(c.css) screen;
      .x { background: url(img/x.png), url("img/y.png") } .z { src: url( 'font.woff2' ) format('woff2') }`
    expect(extractCssReferences(css)).toEqual([
      'a.css',
      'b.css',
      'c.css',
      'img/x.png',
      'img/y.png',
      'font.woff2',
    ])
  })

  it('reads @import and url() in any case, as CSS does', () => {
    expect(
      extractCssReferences(
        '@IMPORT "theme.css"; .a { background: URL(icon.png) } .b { background: Url("c.png") }',
      ),
    ).toEqual(['theme.css', 'icon.png', 'c.png'])
  })

  it('keeps the spaces inside a quoted @import or url()', () => {
    const css = `@import "theme light.css"; @import 'print sheet.css' print; @import url("x y.css");
      .q { background: url('a b.png') }`
    expect(extractCssReferences(css)).toEqual([
      'theme light.css',
      'print sheet.css',
      'x y.css',
      'a b.png',
    ])
  })

  it('skips a reference inside a CSS comment', () => {
    const css = `/* url(unused.png) and @import "old.css"; */ .a { background: url(used.png) }
      /* a comment
         over lines: url(gone.png) */ @import "kept.css";`
    expect(extractCssReferences(css)).toEqual(['used.png', 'kept.css'])
  })

  // A comment starts only where the CSS tokenizer would start one: never
  // inside a quoted string, and never inside an unquoted url(), where `/*` is
  // part of the address.
  it('does not read a /* inside a string or a url() as a comment', () => {
    const css = String.raw`.m::before { content: "/*"; } .h { background: url(hero.png) } /* end */
      .q::after { content: '\'/*' } .i { background: url(a/*b.png) } .j { background: url(j.png) } /* x */`
    expect(extractCssReferences(css)).toEqual(['hero.png', 'a/*b.png', 'j.png'])
  })

  it('decodes CSS escapes, as a browser reads the value', () => {
    // String.raw: each backslash below is one backslash in the stylesheet.
    const css = String.raw`
      .a { background: url("images/my\ image.png") }
      .b { background: url(images/my\ other.png) }
      .c { background: url("say \"hi\".png") }
      .d { background: url('it\'s.png') }
      .e { background: url(paren\).png) }
      .f { background: url("caf\e9.png") }
      .g { background: url("\31 23.png") }
      .h { background: url(images/\31 23.png) }
      @import "theme\ light.css";`
    expect(extractCssReferences(css)).toEqual([
      'images/my image.png',
      'images/my other.png',
      'say "hi".png',
      "it's.png",
      'paren).png',
      'café.png',
      '123.png',
      'images/123.png',
      'theme light.css',
    ])
  })
})

describe('documentBase', () => {
  const at = 'course/lesson/page.html'
  // The folder a reference resolves from is the folder of the path returned.
  const folder = (base) => {
    const from = documentBase(base, at)
    return from === null ? null : from.slice(0, from.lastIndexOf('/') + 1)
  }
  it('resolves a relative base as a URL does: a folder, a file, or a dot segment', () => {
    expect(folder('../assets/')).toBe('course/assets/')
    expect(folder('../assets/start.html')).toBe('course/assets/')
    expect(folder('..')).toBe('course/')
    expect(folder('.')).toBe('course/lesson/')
    expect(folder('sub?x=1#y')).toBe('course/lesson/')
    // Percent-escapes decoded, as in any reference: %20 a space, %2e%2e a climb.
    expect(folder('../shared%20assets/')).toBe('course/shared assets/')
    expect(folder('%2e%2e/')).toBe('course/')
    expect(documentBase('', at)).toBe(at)
  })

  it('gives null for an absolute or root-relative base', () => {
    for (const base of [
      'https://cdn.example.org/x/',
      '/assets/',
      '//cdn.example.org/',
    ])
      expect(documentBase(base, at), base).toBeNull()
  })
})

describe('resolveReference', () => {
  const at = 'course/l1/tab-1.html'
  it('leaves a scheme, a protocol-relative URL, a fragment and an empty value alone', () => {
    for (const ref of [
      'https://x.org/a',
      'mailto:a@b.c',
      'data:image/png;base64,AA',
      '//cdn.x/a.js',
      '#top',
      '',
      '   ',
    ])
      expect(resolveReference(ref, at), ref).toEqual({ kind: 'skip' })
  })

  it('resolves a relative reference against the file, dropping ?query and #fragment', () => {
    expect(resolveReference('../../img/a.png?v=2#x', at)).toEqual({
      kind: 'path',
      rel: 'img/a.png',
    })
    expect(resolveReference('tab-2.html', at)).toEqual({
      kind: 'path',
      rel: 'course/l1/tab-2.html',
    })
    expect(resolveReference('caf%C3%A9.png', at)).toEqual({
      kind: 'path',
      rel: 'course/l1/café.png',
    })
  })

  it('calls a root-relative, an above-the-build and a same-origin absolute reference outside', () => {
    expect(resolveReference('/img/a.png', at).reason).toMatch(/root-relative/)
    expect(resolveReference('../../../x.png', at).reason).toMatch(
      /above the build folder/,
    )
    expect(
      resolveReference('https://e.com/img/a.png', at, {
        siteOrigin: 'https://e.com',
      }).reason,
    ).toMatch(/absolute URL to this site/)
    expect(
      resolveReference('https://other.org/a.png', at, {
        siteOrigin: 'https://e.com',
      }),
    ).toEqual({ kind: 'skip' })
  })

  it('calls a folder reference outside: an LMS serves files as they are', () => {
    expect(resolveReference('../l2/', at).reason).toMatch(/folder/)
  })
})

describe('commonRoot', () => {
  it('is the deepest folder holding every path', () => {
    expect(
      commonRoot(['course/l1/tab-1/index.html', 'course/l1/tab-2/index.html']),
    ).toBe('course/l1')
    expect(commonRoot(['course/l1/tab-1/index.html', 'img/a.png'])).toBe('')
    expect(commonRoot(['index.html'])).toBe('')
    expect(commonRoot(['a/b/c.html'])).toBe('a/b')
    expect(commonRoot(['ab/x.html', 'a/y.html'])).toBe('')
  })
})

describe('packageMembers', () => {
  const entry = (pkg, order, extra = {}) => ({
    id: `p-${order.join('-')}`,
    buildTo: `out/${order.join('-')}.html`,
    order,
    page: {
      options: { package: pkg, title: `T${order.join('-')}`, ...extra },
      hash: 'h',
    },
  })

  it('groups pages by package, in registration order whatever the stack order', () => {
    const stack = [
      entry('b', [3, 0]),
      entry('a', [2, 2]),
      entry('a', [1, 0]),
      entry('a', [2, 1]),
      entry(undefined, [0, 0]),
    ]
    const groups = packageMembers(stack)
    expect([...groups.keys()]).toEqual(['a', 'b'])
    expect(groups.get('a').map((e) => e.order)).toEqual([
      [1, 0],
      [2, 1],
      [2, 2],
    ])
  })

  it('leaves out a page that is not written', () => {
    const groups = packageMembers([
      entry('a', [1, 0], { generate: false }),
      entry('a', [2, 0]),
    ])
    expect(groups.get('a').map((e) => e.order)).toEqual([[2, 0]])
  })
})
