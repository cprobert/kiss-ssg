import { describe, it, expect } from 'vitest'
import crypto from 'node:crypto'
import {
  checkIntegrity,
  matchesIntegrity,
  parseIntegrity,
} from '../../lib/integrity.js'

const sri = (algo, text) =>
  `${algo}-${crypto.createHash(algo).update(text).digest('base64')}`

describe('parseIntegrity', () => {
  it('reads each sha256/384/512 token, with or without options, and skips the rest', () => {
    expect(
      parseIntegrity('sha384-AAA= md5-BBB sha512-CCC?ct=application/js  '),
    ).toEqual([
      { algo: 'sha384', digest: 'AAA=' },
      { algo: 'sha512', digest: 'CCC' },
    ])
  })
})

describe('matchesIntegrity', () => {
  const text = 'console.log(1)\n'
  it('matches when a token of the strongest algorithm named matches', () => {
    expect(matchesIntegrity(Buffer.from(text), sri('sha384', text))).toBe(true)
    // A browser uses only the strongest algorithm present: a matching sha256
    // beside a wrong sha512 still fails.
    expect(
      matchesIntegrity(
        Buffer.from(text),
        `${sri('sha256', text)} sha512-wrong`,
      ),
    ).toBe(false)
  })

  // Codex on the fix (2026-11-05): a browser accepts the URL-safe alphabet
  // (`-` and `_` for `+` and `/`), so the digests compare as bytes.
  it('accepts a digest written in URL-safe base64', () => {
    // Search for content whose sha384 contains a `+` or `/`, so the
    // URL-safe spelling really differs.
    let body = ''
    let digest = ''
    for (let i = 0; i < 1000; i++) {
      body = `x${i}`
      digest = crypto.createHash('sha384').update(body).digest('base64')
      if (/[+/]/.test(digest)) break
    }
    const urlSafe = digest.replaceAll('+', '-').replaceAll('/', '_')
    expect(urlSafe).not.toBe(digest)
    expect(matchesIntegrity(Buffer.from(body), `sha384-${urlSafe}`)).toBe(true)
  })

  it('is null when no token is usable, which a browser ignores', () => {
    expect(matchesIntegrity(Buffer.from(text), 'md5-abc')).toBeNull()
  })
})

describe('checkIntegrity', () => {
  const original = 'function hello () {\n  return 1\n}\n'
  const minified = 'function hello(){return 1}'
  const files = { 'js/vendor.js': minified, 'js/ok.js': original }
  const run = (html) =>
    checkIntegrity({
      pages: [{ buildTo: 'public/index.html', html }],
      buildDir: 'public',
      read: (file) => {
        const rel = file.replaceAll('\\', '/').replace(/^public\//, '')
        return rel in files ? Buffer.from(files[rel]) : null
      },
    })

  // The case Codex found at the close (2026-11-05): the author took the hash
  // of the file they wrote, and kiss minified it, so the browser blocks it.
  it('reports a local script whose bytes no longer match its integrity', () => {
    expect(
      run(
        `<script src="/js/vendor.js" integrity="${sri('sha384', original)}" crossorigin="anonymous"></script>`,
      ),
    ).toEqual([{ page: 'public/index.html', ref: '/js/vendor.js' }])
  })

  // Codex on the fix (2026-11-05): tag-shaped text the browser never loads,
  // in a comment, a script's text, a textarea or a title, is not an element.
  it('ignores tag-shaped text in comments and raw-text elements', () => {
    const stale = `<script src="/js/vendor.js" integrity="${sri('sha384', original)}"></script>`
    expect(
      run(
        [
          `<!-- ${stale} -->`,
          `<script>document.write('${stale.replaceAll('</', '<\\/')}')</script>`,
          `<textarea>${stale}</textarea>`,
          `<title>${stale}</title>`,
          `<noscript>${stale}</noscript>`,
        ].join('\n'),
      ),
    ).toEqual([])
    // The real element after them still counts.
    expect(run(`<!-- note -->\n<p>x</p>\n${stale}`)).toEqual([
      { page: 'public/index.html', ref: '/js/vendor.js' },
    ])
  })

  it('passes a matching file, a stylesheet link, and ignores third-party and unknown files', () => {
    expect(
      run(
        [
          `<script src="js/ok.js" integrity="${sri('sha256', original)}"></script>`,
          `<link rel="stylesheet" href="/js/ok.js" integrity="${sri('sha512', original)}">`,
          `<script src="https://cdn.example.com/x.js" integrity="sha384-whatever"></script>`,
          `<script src="/js/missing.js" integrity="sha384-whatever"></script>`,
          '<script src="/js/vendor.js"></script>',
        ].join('\n'),
      ),
    ).toEqual([])
  })
})
