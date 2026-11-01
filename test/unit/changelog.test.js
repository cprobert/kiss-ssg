import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  changelogEntries,
  compareVersions,
  parseVersion,
} from '../../lib/upgrade.js'

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

// `kiss-ssg upgrade` prints a site the `### Upgrading` sections between its
// version and the new one, read by lib/upgrade.js's parser, the one parser of
// that shape. So the changelog is the one home of upgrade notes, and a note in
// any other shape is a note the command never prints. This holds the file to
// the shape, and holds the promise in CLAUDE.md that a minor always says what
// a site must do, even when the answer is nothing.
describe('CHANGELOG.md upgrade notes', () => {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
  const entries = changelogEntries(changelog)

  it('lists its versions newest first', () => {
    const versions = entries.map((e) => e.version)
    expect(versions.length).toBeGreaterThan(40)
    expect(versions).toEqual(
      [...versions].sort((a, b) => compareVersions(b, a)),
    )
  })

  // Every older spelling, so a note cannot be written in a shape the parser
  // reads as ordinary text: `### Upgrading` is the only heading it prints.
  it('writes every upgrade note as `### Upgrading` or `### Upgrading: <topic>`', () => {
    const stray = changelog
      .split(/\r?\n/)
      .filter(
        (line) =>
          /^#{2,4} .*upgrad/i.test(line) ||
          /^### ⚠️/.test(line) ||
          /^\*\*Upgrad(e note|ing\?)/.test(line),
      )
      .filter((line) => !/^### Upgrading(: .+)?\s*$/.test(line))
    expect(stray).toEqual([])
  })

  // From 2.5.0, the first minor that changed what a site's build means.
  it('gives every minor from 2.5.0 a note, or says there is nothing to change', () => {
    const silent = entries
      .filter((e) => {
        const v = parseVersion(e.version)
        return (
          v &&
          v.patch === 0 &&
          v.pre.length === 0 &&
          compareVersions(e.version, '2.5.0') >= 0
        )
      })
      .filter((e) => e.notes.length === 0 && !e.nothingToChange)
      .map((e) => e.version)
    expect(silent).toEqual([])
  })
})
