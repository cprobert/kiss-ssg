import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// The agent-facing counterpart of test/aikb.test.js. That file proves the
// shipped docs name every public method and helper; this one proves the
// skills an agent actually follows name the features they should be using.
// A feature can land fully documented in llms.txt and never reach the skill
// that would have used it — which is exactly what happened with {{link}} and
// .feed() before this table existed. Add a row when a public feature lands.
const root = path.resolve(import.meta.dirname, '../..')
const skill = (plugin, name) => `plugins/${plugin}/skills/${name}/SKILL.md`

const COVERAGE = [
  {
    feature: '{{link — link between pages by identity',
    pattern: /\{\{link\b/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-ssg', 'kiss-build-check'),
      skill('kiss-memory', 'kiss-site-brief'),
    ],
  },
  {
    feature: 'aliases → _redirects',
    pattern: /\baliases\b/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-ssg', 'kiss-site-migrate'),
      skill('kiss-ssg', 'kiss-build-check'),
    ],
  },
  {
    feature: '.feed()',
    pattern: /\.feed\(/,
    skills: [skill('kiss-ssg', 'kiss-site-new')],
  },
  {
    feature: 'the broken-link finding',
    pattern: /broken link:/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-site-migrate'),
      skill('kiss-ssg', 'kiss-build-check'),
      skill('kiss-memory', 'kiss-site-brief'),
      skill('kiss-memory', 'kiss-branch-close'),
    ],
  },
  {
    feature: 'the rename findings',
    pattern: /moved without redirect:|removed without redirect:/,
    skills: [
      skill('kiss-ssg', 'kiss-build-check'),
      skill('kiss-memory', 'kiss-site-brief'),
      skill('kiss-memory', 'kiss-branch-close'),
    ],
  },
  {
    feature: 'the note findings',
    pattern: /note missing:/,
    skills: [
      skill('kiss-ssg', 'kiss-build-check'),
      skill('kiss-memory', 'kiss-branch-close'),
      skill('kiss-memory', 'kiss-memory-consolidate'),
    ],
  },
  {
    feature: 'the record command',
    pattern: /kiss-ssg aikb/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-memory', 'kiss-site-brief'),
      skill('kiss-memory', 'kiss-branch-open'),
      skill('kiss-memory', 'kiss-branch-close'),
    ],
  },
  {
    feature: "the site map's Id column as the link targets",
    pattern: /\bId\b.*column|`Id`|\*\*Id\*\*/,
    skills: [
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-memory', 'kiss-site-brief'),
    ],
  },
]

describe('every skill names the features an agent following it should use', () => {
  for (const { feature, pattern, skills } of COVERAGE) {
    it.each(skills)(`${feature} — %s`, (file) => {
      const text = fs.readFileSync(path.join(root, file), 'utf8')
      expect(text, `${file} never mentions ${feature}`).toMatch(pattern)
    })
  }
})
