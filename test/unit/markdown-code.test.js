import { describe, it, expect } from 'vitest'
import {
  fencedLines,
  outsideCode,
  withoutCode,
} from '../../scripts/markdown-code.mjs'

describe('fencedLines', () => {
  it('marks a fenced block, its fence lines included', () => {
    expect(fencedLines(['a', '```js', 'b', '```', 'c'])).toEqual([
      false,
      true,
      true,
      true,
      false,
    ])
  })

  it('closes a fence only on a run of its own character, at least as long', () => {
    const lines = ['````md', '```', '~~~', '````', 'after']
    expect(fencedLines(lines)).toEqual([true, true, true, true, false])
    expect(fencedLines(['~~~', '```', '~~~~', 'after'])).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('does not close on a fence run with text after it', () => {
    expect(fencedLines(['```', '``` not a close', '```', 'x'])).toEqual([
      true,
      true,
      true,
      false,
    ])
  })

  it('reads a backtick run with a backtick after it as inline code, not a fence', () => {
    expect(fencedLines(['```inline``` is code', 'next'])).toEqual([
      false,
      false,
    ])
  })

  it('runs an unclosed fence to the end of the text', () => {
    expect(fencedLines(['```', 'a', 'b'])).toEqual([true, true, true])
  })

  it('does not open a fence indented four spaces', () => {
    expect(fencedLines(['    ```', 'x'])).toEqual([false, false])
  })
})

describe('outsideCode', () => {
  const upper = (s) => s.toUpperCase()

  it('edits prose and leaves fenced blocks and inline spans as they were', () => {
    const text = ['a `b` c', '```', 'd', '```', 'e ``f ` g`` h'].join('\n')
    expect(outsideCode(text, upper)).toBe(
      ['A `b` C', '```', 'd', '```', 'E ``f ` g`` H'].join('\n'),
    )
  })

  it('pairs no span across a fence or a blank line', () => {
    const text = ['a ` b', '```', 'c', '```', 'd ` e', '', 'f ` g'].join('\n')
    expect(outsideCode(text, upper)).toBe(
      ['A ` B', '```', 'c', '```', 'D ` E', '', 'F ` G'].join('\n'),
    )
  })

  it('opens no span on an escaped backtick', () => {
    expect(outsideCode('a \\` b `c` d', upper)).toBe('A \\` B `c` D')
  })

  // GUIDE.md § .llms() shows an entry's shape in inline code. The docs site's
  // link rewriter used to rewrite it too, so the page read
  // `- [title](https://github.com/…/blob/main/url): description` (2026-10-31).
  it('rewrites a link in prose and leaves one shown in inline code', () => {
    const rewrite = (prose) =>
      prose.replace(/\]\(([^)\s]+)\)/g, (_, t) => `](https://x/${t})`)
    expect(
      outsideCode(
        'Each entry is `- [title](url): description`. See [it](GUIDE.md).',
        rewrite,
      ),
    ).toBe(
      'Each entry is `- [title](url): description`. See [it](https://x/GUIDE.md).',
    )
  })

  it('returns the text unchanged when the edit changes nothing', () => {
    const text = 'x\n```\n`y`\n```\n`z` [l](t)'
    expect(outsideCode(text, (s) => s)).toBe(text)
  })
})

describe('withoutCode', () => {
  it('blanks fenced lines and drops inline spans', () => {
    expect(withoutCode(['a `b` c', '```', 'd', '```', 'e'].join('\n'))).toBe(
      ['a  c', '', '', '', 'e'].join('\n'),
    )
  })
})
