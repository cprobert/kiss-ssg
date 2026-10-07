import { describe, it, expect } from 'vitest'
import { markdownCopyPath, toMarkdown } from '../../lib/markdown-copy.js'

const page = (body, head = '<title>T</title>') =>
  `<!doctype html><html><head>${head}</head><body>${body}</body></html>`

describe('markdownCopyPath', () => {
  it('puts the copy beside the page, the llmstxt.org way', () => {
    expect(markdownCopyPath('out/about.html')).toBe('out/about.md')
    expect(markdownCopyPath('out/courses/index.html')).toBe(
      'out/courses/index.md',
    )
    expect(markdownCopyPath('out/old.htm')).toBe('out/old.md')
  })

  it('swaps only the trailing extension', () => {
    expect(markdownCopyPath('out/html/page.html')).toBe('out/html/page.md')
  })

  it('gives anything that is not an HTML page no copy', () => {
    expect(markdownCopyPath('out/feed.xml')).toBeNull()
    expect(markdownCopyPath('out/data.json')).toBeNull()
    expect(markdownCopyPath('out/notes.md')).toBeNull()
  })
})

describe('toMarkdown', () => {
  it('converts <main> and leaves the chrome around it out', async () => {
    const md = await toMarkdown(
      page(
        '<header><a href="/">Site</a></header><main><h1>Hello</h1><p>Body text.</p></main><footer>© 2026</footer>',
      ),
    )
    expect(md).toBe('# Hello\n\nBody text.\n')
  })

  it('falls back to <body> when the page has no <main>', async () => {
    const md = await toMarkdown(page('<h1>Hello</h1><p>Body text.</p>'))
    expect(md).toBe('# Hello\n\nBody text.\n')
  })

  it('always drops script, style and nav, inside <main> too', async () => {
    const md = await toMarkdown(
      page(
        '<main><nav><a href="/a">Contents</a></nav><style>p{}</style><h1>Hi</h1><script>console.log(1)</script><p>Text.</p></main>',
      ),
    )
    expect(md).toBe('# Hi\n\nText.\n')
  })

  it('takes a selector, and falls back to <body> when it matches nothing', async () => {
    const html = page(
      '<div class="chrome">Menu</div><article><h2>Post</h2></article>',
    )
    expect(await toMarkdown(html, { selector: 'article' })).toBe('## Post\n')
    expect(await toMarkdown(html, { selector: '#missing' })).toBe(
      'Menu\n\n## Post\n',
    )
  })

  it('keeps every href exactly as the page wrote it', async () => {
    const md = await toMarkdown(
      page(
        '<main><p><a href="../urls/#redirects">rel</a> <a href="/about/">root</a> <a href="https://x.org/a(b)">abs</a></p></main>',
      ),
    )
    expect(md).toContain('[rel](../urls/#redirects)')
    expect(md).toContain('[root](/about/)')
    // The same URL: a parenthesis in a link destination is escaped so the
    // link does not end early, which is the Markdown spelling of `a(b)`.
    expect(md).toContain('[abs](https://x.org/a\\(b\\))')
  })

  it('writes tables as GFM tables and fences code with its language', async () => {
    const md = await toMarkdown(
      page(
        '<main><table><thead><tr><th>id</th><th>when</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table><pre><code class="language-js">const a = 1\n</code></pre></main>',
      ),
    )
    expect(md).toContain('| id | when |')
    expect(md).toContain('| a | b |')
    expect(md).toContain('```js\nconst a = 1\n```')
  })

  it('falls back to <body> when the chosen element converts to nothing', async () => {
    // A JS-rendered shell, or content written outside the <main> the layout
    // has: an empty copy is never the right answer while <body> has text.
    const md = await toMarkdown(
      page('<main id="app"></main><p>Rendered outside main.</p>'),
    )
    expect(md).toBe('Rendered outside main.\n')
  })

  it('names the setting when the selector is not valid CSS', async () => {
    await expect(
      toMarkdown(page('<main>x</main>'), { selector: 'main[' }),
    ).rejects.toThrow(/config\.markdownCopies\.selector.*main\[/)
  })

  it('returns a single newline for a page with nothing to say', async () => {
    expect(await toMarkdown(page('<main></main>'))).toBe('\n')
  })
})
