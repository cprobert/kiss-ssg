import { describe, it, expect } from 'vitest'
import { Remarkable } from 'remarkable'
import { linkTokens, targetPath } from '../../scripts/markdown-links.mjs'

const parse = (text) => new Remarkable({ html: true }).parse(text, {})

describe('linkTokens', () => {
  it('finds links and images at any depth, in order', () => {
    const tokens = linkTokens(
      parse('- [a](one.md)\n\n> ![i](pic.png) and [b](two.md)'),
    )
    expect(tokens.map((t) => t.type)).toEqual([
      'link_open',
      'image',
      'link_open',
    ])
    expect(tokens.map(targetPath)).toEqual(['one.md', 'pic.png', 'two.md'])
  })

  it('finds nothing in code or raw HTML', () => {
    expect(
      linkTokens(
        parse('`[a](one.md)`\n\n<a href="two.md">x</a>\n\n```\n[b](c.md)\n```'),
      ),
    ).toEqual([])
  })
})

describe('targetPath', () => {
  it('decodes the percent-encoding a parser applies', () => {
    const [token] = linkTokens(parse('[a](<two words.md>)'))
    expect(token.href).toBe('two%20words.md')
    expect(targetPath(token)).toBe('two words.md')
  })

  it('returns a target that does not decode as written', () => {
    expect(targetPath({ type: 'link_open', href: 'bad%E0%A4%A.md' })).toBe(
      'bad%E0%A4%A.md',
    )
  })
})
