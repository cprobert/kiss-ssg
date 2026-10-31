// kiss-information-architecture ships a script, in
// references/measure-structure.md, that a site copies and runs to find pages
// nothing links to. A shipped snippet is a claim about behaviour, so this runs
// it exactly as the reference has it, on a small build folder.
//
// Round 12: it counted an <a href> inside a comment or a <script> as a link,
// which hides a real orphan, and listed a verification file (an .html that is
// not a page) as an orphan.
import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const reference = fileURLToPath(
  new URL(
    '../../plugins/kiss-ssg/skills/kiss-information-architecture/references/measure-structure.md',
    import.meta.url,
  ),
)

describe('the structure script, as the reference ships it', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-structure-'))
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  const source = /^```js\n([\s\S]*?)^```$/m.exec(
    fs.readFileSync(reference, 'utf8').replace(/\r\n/g, '\n'),
  )[1]
  const script = path.join(root, 'structure.mjs')
  fs.writeFileSync(script, source)

  const site = path.join(root, 'public')
  const page = (file, body) => {
    fs.mkdirSync(path.dirname(path.join(site, file)), { recursive: true })
    fs.writeFileSync(
      path.join(site, file),
      `<!doctype html><html><body>${body}</body></html>`,
    )
  }
  page(
    'index.html',
    [
      '<a href="/about/">About</a>',
      '<!-- <a href="/orphan.html">Orphan</a> -->',
      '<script>const html = \'<a href="/orphan.html">x</a>\'</script>',
      '<template><a href="/orphan.html">x</a></template>',
    ].join(''),
  )
  // Round 13: an image map's <area href> is a link a reader follows.
  page(
    'about/index.html',
    '<a href="/">Home</a><map name="m"><area href="/mapped.html" alt="Mapped"></map>',
  )
  page('mapped.html', '<p>Reached through the image map only.</p>')
  page('orphan.html', '<p>Nothing links here.</p>')
  // A search console verification file: copied as an asset, not a page.
  fs.writeFileSync(
    path.join(site, 'google1234.html'),
    'google-site-verification: google1234.html\n',
  )
  // Round 13: a folder whose name ends in .html is no file to read.
  fs.mkdirSync(path.join(site, 'embed.html'))
  fs.writeFileSync(path.join(site, 'embed.html/frame.js'), '//\n')

  const result = spawnSync('node', [script, site], { encoding: 'utf8' })
  const rows = result.stdout.trim().split('\n')

  it('runs', () => {
    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('counts no link inside a comment, a script or a template', () => {
    expect(rows[0]).toBe('0\t1\t/orphan')
  })

  it('lists pages only, not an .html file that is no page', () => {
    expect(rows.map((r) => r.split('\t')[2]).sort()).toEqual([
      '/',
      '/about',
      '/mapped',
      '/orphan',
    ])
  })

  it('follows an image map’s <area href>', () => {
    expect(rows).toContain('1\t1\t/mapped')
  })
})
