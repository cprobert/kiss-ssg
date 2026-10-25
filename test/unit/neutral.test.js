import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Learning packages are a kiss capability for anyone, and no file of kiss names
// the course they were first built for (planning/plans/2026-10-24-learning-packages.md,
// amendment 3). This walks what ships and what a user reads, and fails on that
// course's words. `planning/` is history and is not walked.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const WALKED = [
  'lib',
  'test',
  'types',
  'examples',
  'AIKB',
  'src',
  'bin',
  'GUIDE.md',
  'README.md',
  'llms.txt',
  'CLAUDE.md',
  'CHANGELOG.md',
]
const TEXT = /\.(js|mjs|cjs|ts|md|hbs|html|json|txt|css|yaml|yml)$/
const SKIP = new Set(['node_modules', '.git', 'public', 'dist'])
const self = fileURLToPath(import.meta.url)

const WORDS = [
  /internal[ -]medicine/i,
  /\bclinical\b/i,
  /cardiovascular/i,
  /cardiology/i,
  /\bmcqs?\b/i,
  /electric[ -]sheep/i,
  // A module and lesson written as that course writes them: M2 L1, m2-l1, m2/l1.
  /\bm\d+[ /-]l\d+\b/i,
]

function* files(rel) {
  const abs = path.join(root, rel)
  if (!fs.existsSync(abs)) return
  const stat = fs.statSync(abs)
  if (stat.isFile()) {
    if (TEXT.test(abs) && abs !== self) yield abs
    return
  }
  for (const entry of fs.readdirSync(abs)) {
    if (SKIP.has(entry)) continue
    yield* files(path.join(rel, entry))
  }
}

describe('kiss names no course', () => {
  it("has none of the first consumer's words in what ships or what a user reads", () => {
    const found = []
    for (const rel of WALKED)
      for (const file of files(rel)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n')
        lines.forEach((line, i) => {
          const word = WORDS.find((w) => w.test(line))
          if (word)
            found.push(
              `${path.relative(root, file)}:${i + 1}: ${line.trim().slice(0, 100)}`,
            )
        })
      }
    expect(found).toEqual([])
  })
})
