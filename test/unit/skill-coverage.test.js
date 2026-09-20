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
    feature: 'links: { canonical: true } — the pretty form on every link',
    pattern: /canonical: true/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-site-migrate'),
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
    feature:
      'links: { trailingSlash } — the host decides the directory-index URL',
    pattern: /trailingSlash/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  {
    feature: 'redirects: { format } — no default host, and it takes a list',
    pattern: /redirects: \{ format/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  {
    feature: '.robots() — robots.txt, and the Sitemap: line',
    pattern: /\.robots\(/,
    skills: [skill('kiss-ssg', 'kiss-site-new')],
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
    // The convention itself, not just the filename: a skill that says
    // `router.js` without saying when a site earns `helpers/` teaches the
    // folder and not the rule, which is how a four-page site ends up with an
    // index.js composing two registrars over one helper.
    feature: 'the router convention (router.js, and the extraction thresholds)',
    pattern: /router\.js/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  {
    feature: 'the tiers that decide when to extract helpers/ and config/',
    pattern: /The build script/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  {
    // Added after `folders.helpers` shipped and both skills kept telling an
    // agent to put helpers under `src/` — the shape kiss now warns about. The
    // row above matches `/router\.js/`, which stayed true while the prose
    // around it went wrong, so presence of the filename was never enough: a
    // skill has to name the config key to have said anything about it.
    feature:
      'folders.helpers — where helpers live, and that kiss registers them',
    pattern: /folders\.helpers/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-page-add'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  {
    // `kiss-site-migrate` is the upgrade skill for every version boundary,
    // not only v1 -> v2, and the only thing that makes a point upgrade
    // legible is the CHANGELOG between the depended-on version and the
    // installed one. A skill that skips it can only find the breakages it
    // was written knowing about.
    feature: 'the CHANGELOG as the list of what an upgrade changed',
    pattern: /CHANGELOG\.md/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
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

// The mention test above has a known blind spot, and it has now been hit
// twice: a row asserting a skill NAMES a feature stays green while the prose
// around it says the opposite. `folders.helpers` was named in `kiss-site-new`
// while the same file still told an agent the router holds "one
// registerHelpers(kiss) call" — and a clean-room agent followed it and wrote
// the redundant call the whole feature exists to remove.
//
// A contradiction cannot be caught by asking what a document mentions. It can
// be caught by banning the sentence. Each entry below was a real defect in a
// real consumer-facing file, not a hypothetical.
const CONTRADICTIONS = [
  {
    why: 'kiss loads config.folders.helpers itself; a build script that also calls the registrar runs it twice',
    patterns: [
      /^\s*registerHelpers\(kiss\)\s*$/m, // a line the reader would copy
      /one `?registerHelpers\(kiss\)`? call/i, // the 2.4.0 wording
    ],
  },
]

const consumerFacing = () => {
  const files = ['llms.txt', 'README.md']
  for (const dir of ['plugins', 'examples']) {
    const walk = (d) => {
      for (const e of fs.readdirSync(path.join(root, d), {
        withFileTypes: true,
      })) {
        const rel = `${d}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.(md|js)$/.test(e.name)) files.push(rel)
      }
    }
    walk(dir)
  }
  return files
}

describe('no consumer-facing file contradicts the convention it documents', () => {
  const files = consumerFacing()

  it('has files to check, so a broken walk cannot pass silently', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const { why, patterns } of CONTRADICTIONS) {
    it.each(patterns)(`${why} — %s`, (pattern) => {
      const offenders = files.filter((f) =>
        pattern.test(fs.readFileSync(path.join(root, f), 'utf8')),
      )
      expect(offenders).toEqual([])
    })
  }
})
