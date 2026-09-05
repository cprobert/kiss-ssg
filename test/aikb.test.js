import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const strip = (ext) => (f) =>
  f.endsWith(ext) && f.replace(new RegExp(`\\${ext}$`), '')
const modules = fs
  .readdirSync(path.join(root, 'lib'))
  .map(strip('.js'))
  .filter(Boolean)
const docs = fs
  .readdirSync(path.join(root, 'AIKB'))
  .map(strip('.md'))
  .filter(Boolean)
const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8')
const HEADINGS = [
  '## Responsibility',
  '## Public interface',
  '## Depends on',
  '## Depended on by',
  '## Non-obvious behavior',
]

describe('AIKB stays in sync with lib/', () => {
  it.each(modules)('lib/%s.js has AIKB/%s.md', (m) => {
    expect(docs).toContain(m)
  })

  it.each(docs)('AIKB/%s.md is listed in the CLAUDE.md lookup table', (d) => {
    expect(claudeMd).toContain(`AIKB/${d}.md`)
  })

  it.each(docs.filter((d) => d !== 'testing'))(
    'AIKB/%s.md has a matching lib/%s.js',
    (d) => {
      expect(modules).toContain(d)
    },
  )

  it.each(docs.filter((d) => d !== 'testing'))(
    'AIKB/%s.md follows the module template',
    (d) => {
      const text = fs.readFileSync(path.join(root, 'AIKB', `${d}.md`), 'utf8')
      let last = -1
      for (const h of HEADINGS) {
        const at = text.indexOf(h)
        expect(at, `${d}.md missing "${h}"`).toBeGreaterThan(last)
        last = at
      }
    },
  )
})
