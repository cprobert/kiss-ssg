import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import Kiss from '../lib/kiss.js'
import { resolveConfig } from '../lib/config.js'

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
const llmsTxt = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8')
const readmeMd = fs.readFileSync(path.join(root, 'README.md'), 'utf8')

// Pulls the object literal out of the first ```js fenced block found after
// `marker`, and evaluates it. Doc-block extraction, not a general parser —
// good enough for the one config-defaults block each doc ships.
function extractDefaultsBlock(text, marker) {
  const markerIndex = text.indexOf(marker)
  if (markerIndex === -1) throw new Error(`marker not found: "${marker}"`)
  const fenceStart = text.indexOf('```js', markerIndex)
  if (fenceStart === -1) throw new Error(`no \`\`\`js fence after "${marker}"`)
  const codeStart = text.indexOf('\n', fenceStart) + 1
  const fenceEnd = text.indexOf('```', codeStart)
  const code = text.slice(codeStart, fenceEnd)
  return new Function(`return (${code})`)()
}
// Every method that is not underscore-prefixed is part of the published
// contract, so llms.txt (which ships in the tarball) has to name it.
const publicMethods = Object.getOwnPropertyNames(Kiss.prototype).filter(
  (name) =>
    name !== 'constructor' &&
    !name.startsWith('_') &&
    typeof Kiss.prototype[name] === 'function',
)
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

describe('llms.txt documents the public API', () => {
  it.each(publicMethods)('llms.txt names .%s()', (name) => {
    expect(llmsTxt).toContain(`\`.${name}(`)
  })
})

// D-10: the shipped config docs are a strictly smaller object than
// DEFAULT_CONFIG/DEFAULT_FOLDERS unless something re-checks them against the
// resolver every time a default changes. `.toEqual` (not `.toStrictEqual`)
// is deliberate: `resolveConfig({})` never has a `siteUrl` key at all, while
// llms.txt documents it inline as `siteUrl: undefined` for discoverability —
// an explicit `undefined` and an absent key are the same shape to a consumer.
describe('shipped config defaults match resolveConfig({})', () => {
  const defaults = resolveConfig({})

  it('llms.txt § Config matches resolveConfig({})', () => {
    const documented = extractDefaultsBlock(llmsTxt, '## Config')
    expect(documented).toEqual(defaults)
  })

  it('README.md default config block matches resolveConfig({})', () => {
    const documented = extractDefaultsBlock(
      readmeMd,
      'The default config options are:',
    )
    expect(documented).toEqual(defaults)
  })
})
