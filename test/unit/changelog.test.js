import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

const root = path.resolve(import.meta.dirname, '../..')

// The version the newest entry announces: the first `## <semver> — <date>`
// heading. Nothing before it counts — the file opens with a title and a note
// about who it is written for.
function firstEntryVersion(text) {
  const match = text.match(/^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?) — /m)
  return match ? match[1] : null
}

describe('firstEntryVersion', () => {
  it('reads the newest entry and ignores the ones below it', () => {
    const text = [
      '# Changelog',
      '',
      'Newest first.',
      '',
      '## 2.2.1 — 2026-09-12',
      '',
      'Fixed a thing.',
      '',
      '## 2.2.0 — 2026-09-12',
    ].join('\n')
    expect(firstEntryVersion(text)).toBe('2.2.1')
  })

  it('accepts a prerelease, and reports no entry rather than guessing', () => {
    expect(firstEntryVersion('## 2.0.0-alpha.3 — 2026-01-01\n')).toBe(
      '2.0.0-alpha.3',
    )
    expect(firstEntryVersion('# Changelog\n\nnothing yet\n')).toBeNull()
  })
})

// `npm version` carries the number into every manifest and the gates check
// them (`plugin-manifests.test.js`); the changelog is the one version-bearing
// file a person writes by hand, so this is the net under that hand.
describe('CHANGELOG.md', () => {
  it('leads with an entry for the version package.json declares', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(root, 'package.json'), 'utf8'),
    )
    const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
    expect(firstEntryVersion(changelog)).toBe(pkg.version)
  })
})
