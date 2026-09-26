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
    feature: 'current output collision lifecycle',
    pattern:
      /active producers[\s\S]*resolved collision disappears[\s\S]*configured build-folder spelling/,
    skills: [skill('kiss-ssg', 'kiss-build-check')],
  },
  {
    feature: 'advisory structured output collisions',
    pattern:
      /outputs\.collisions[\s\S]*advisory[\s\S]*do not change the exit code/,
    skills: [skill('kiss-ssg', 'kiss-build-check')],
  },
  {
    feature: 'output collision ownership',
    pattern: /output collision warning[\s\S]*last successful writer/,
    skills: [skill('kiss-ssg', 'kiss-site-new')],
  },
  {
    feature: 'watcher reconciliation and intentional empty saves',
    pattern: /asset additions and deletions[\s\S]*intentionally empty saves/,
    skills: [skill('kiss-ssg', 'kiss-site-new')],
  },
  {
    feature: 'folder safety — dedicated source and no cleanup-policy bypass',
    pattern: /dedicated[\s\S]*cleanBuild: false/,
    skills: [
      skill('kiss-ssg', 'kiss-site-new'),
      skill('kiss-ssg', 'kiss-site-migrate'),
    ],
  },
  // Found on six of six sites during the 2.5.0 fleet upgrade: after a `file:`
  // link is repinned to a range, a plain `npm install` keeps the link. The
  // upgrade skill is the one place an upgrading agent reads.
  {
    feature:
      'upgrade: a file: link survives a plain npm install after the pin changes',
    pattern: /"link": true/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
  },
  // 2.5.1: a page can name another URL as its canonical. The page-add skill is
  // where an agent adding a mirrored page would otherwise hand-roll a helper.
  {
    feature: 'a page can name another URL as its canonical',
    pattern: /canonical: 'https:\/\//,
    skills: [skill('kiss-ssg', 'kiss-page-add')],
  },
  // 2.5 fails builds that used to pass, in three places. The upgrade skill is
  // the only thing a consuming agent reads when a site breaks on upgrade, so
  // each break has to be findable there by the error text the author is
  // actually looking at — not by a description of it.
  {
    feature: 'upgrade: a missing {{asset}} path now fails the build',
    pattern: /is not in the build/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
  },
  {
    feature: 'upgrade: a Sass compile error now fails the build',
    pattern: /<sass:/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
  },
  {
    feature: 'upgrade: a _-prefixed Sass file is no longer compiled standalone',
    pattern: /do not compile standalone/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
  },
  {
    feature: 'upgrade: run `kiss-ssg check` before changing anything',
    pattern: /kiss-ssg check .*--summary/,
    skills: [skill('kiss-ssg', 'kiss-site-migrate')],
  },
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
    why: 'non-dev whole-site watch replays check links after cleanup',
    patterns: [
      /in dev, on a watch rebuild, and under/i,
      /on a dev build, on a watch rebuild and under/i,
      /and therefore on every watch rebuild:/i,
    ],
  },
  {
    patterns: [
      /They accumulate during an instance/,
      /These observations accumulate for the instance/,
    ],
    why: 'Resolved output collisions leave the current report',
  },

  {
    why: 'Sass changes compare retained fingerprints, not a plain file hashing has moved',
    patterns: [
      /comparing the previous compiled CSS bytes with the new bytes/,
      /This comparison reads CSS only, not every image or font/,
    ],
  },
  {
    why: 'reloads follow changed emitted URLs and reconcile is the only manifest writer',
    patterns: [
      /Hashed assets re-render all pages even for Sass partial edits/,
      /The `record` primitive remains available for direct callers/,
    ],
  },
  {
    why: 'intentionally empty saves are delivered after a bounded grace period',
    patterns: [
      /on an empty file is dropped, not forwarded/i,
      /a file deliberately left empty is not seen until it gains content/i,
    ],
  },
  {
    why: 'kiss loads config.folders.helpers itself; a build script that also calls the registrar runs it twice',
    patterns: [
      /^\s*registerHelpers\(kiss\)\s*$/m, // a line the reader would copy
      /one `?registerHelpers\(kiss\)`? call/i, // the 2.4.0 wording
    ],
  },
  {
    why: 'an .html partial IS compiled as a Handlebars template — "inserted as-is" reads as "not compiled" and a clean-room agent wrote a .html partial expecting its {{ }} to be literal',
    patterns: [/`?\.html`? is inserted as-is/i],
  },
  {
    why: 'config.redirects.format is unset by default — kiss writes redirects.json and no host file until you name one',
    patterns: [
      /`?redirects\.format`?,? default `?'netlify'`?/i, // the 2.3 default, changed in 2.4
      /`?<build>\/_redirects`? by default/i,
    ],
  },
  {
    why: 'kiss-ssg is not three methods, and a first example that stops at .generate() ships a broken site on exit 0',
    patterns: [
      /kiss-ssg has 3 methods/i,
      /^\s*kiss\.generate\(\)\s*\n```/m, // a copyable block that ends before .complete()
    ],
  },
  {
    why: 'file length is never the trigger for extracting helpers/ — llms.txt § The build script says the first custom helper is, explicitly "not a proportion of the file"',
    patterns: [
      /correct up to roughly \d+ lines/i,
      /helpers\/`? is earned when the custom helpers pass about a third/i,
    ],
  },
  {
    why: 'a Sass failure fails the build — the pre-R8 "logged and dropped" wording outlived the behaviour it described',
    patterns: [/leaves the copy successful/i],
  },
  {
    why: 'report() is refreshed between settles now — the "leaves the last report standing" wording was true for two commits and is the kind of half-truth a consumer builds a check on',
    patterns: [
      /settle no build, so they leave the last report standing/i,
      /does not reach `?report\(\)`? until the next settle/i,
    ],
  },
  {
    why: '{{asset}} on a path no copy emitted fails the build now — warn-and-render shipped a 404 on a green build, which is the gap kiss own bar exists to close',
    patterns: [
      /rather than failing the page/i,
      /checked to different depths, so do not read them as one promise/i,
    ],
  },
  {
    why: 'partials are registered in FIVE passes, not four — the .txt pass this branch added kept going missing from half of its own doc',
    patterns: [
      /four times in sequence/i,
      /Registration order is html, then md, then hbs/i,
    ],
  },
  {
    why: 'examples 4 and 11 hand-type two hrefs on purpose (a build opened off the file system cannot use a root-relative {{link}}); claiming otherwise is falsified by the example itself',
    patterns: [/Not one view in this site writes a URL/i],
  },
]

const consumerFacing = () => {
  const files = ['llms.txt', 'README.md', 'GUIDE.md']
  // `AIKB/` ships in the tarball on purpose — an agent in a consuming project
  // reads `node_modules/kiss-ssg/AIKB/` for the per-module notes — so it is a
  // consumer-facing document set and gets the same contradiction check. It was
  // left out, and a bullet in `AIKB/assets.md` sat there asserting the
  // pre-R8 behaviour ("leaves the copy successful") beside the bullet that
  // replaced it.
  for (const dir of ['plugins', 'examples', 'AIKB']) {
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
