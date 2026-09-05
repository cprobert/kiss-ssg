#!/usr/bin/env node
// Scope scanner for the docs-sweep skill.
//
// GATHER half: diff the branch against its base, map each changed file to the
// documentation surfaces it puts at risk, and print a checklist. The JUDGE half
// — open each triggered doc, decide whether it is actually stale, edit it —
// stays in SKILL.md. "Which docs does this diff endanger" is mechanical and easy
// to do incompletely by hand; "is this prose still true" is not scriptable.
//
// This script is the single source of truth for the trigger map. Always exits 0.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { resolveBaseBranch } from '../../../../scripts/base-branch.mjs'

const ROOT = process.cwd()
if (!existsSync(join(ROOT, 'CLAUDE.md')) || !existsSync(join(ROOT, 'lib'))) {
  console.error(
    'docs-sweep: run from the repo root (CLAUDE.md + lib/ expected).',
  )
  process.exit(2)
}

const git = (args) => {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const BASE = resolveBaseBranch(ROOT)
const commits = git(['log', `${BASE}..HEAD`, '--oneline'])
const changed = git(['diff', `${BASE}...HEAD`, '--name-status'])
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const [status, ...rest] = line.split('\t')
    return {
      status: status[0],
      file: rest[rest.length - 1].replace(/\\/g, '/'),
    }
  })

const libModule = (f) => (/^lib\/([\w-]+)\.js$/.exec(f) ?? [])[1]

// The trigger map. `test(file, status)` decides whether a changed file fires an
// obligation; `docs(files)` returns what to review — lines prefixed "ACTION:"
// are commands to run rather than docs to read.
const RULES = [
  {
    label: 'Engine module changed',
    test: (f) => Boolean(libModule(f)),
    docs: (files) =>
      files.map((f) => `AIKB/${libModule(f)}.md — the module's own notes`),
  },
  {
    label: 'Engine module added or removed',
    test: (f, status) =>
      Boolean(libModule(f)) && (status === 'A' || status === 'D'),
    docs: () => [
      'CLAUDE.md → the AIKB lookup table (one row per lib/ module)',
      'ACTION: npx vitest run test/aikb.test.js — it fails on a missing doc, an orphaned doc, an unlisted doc, or a dropped template heading',
    ],
  },
  {
    label: 'Public API surface (lib/kiss.js)',
    test: (f) => f === 'lib/kiss.js',
    docs: () => [
      'llms.txt → ## API (the consumer cheat-sheet — it ships in the npm package)',
      'README.md → usage docs',
      'CLAUDE.md → ## Pipeline in one paragraph',
    ],
  },
  {
    label: 'Config shape (lib/config.js)',
    test: (f) => f === 'lib/config.js',
    docs: () => [
      'llms.txt → ## Config (defaults block)',
      'README.md → config docs',
    ],
  },
  {
    label: 'Built-in Handlebars helpers',
    test: (f) => f === 'lib/handlebars-helpers.js',
    docs: () => [
      'llms.txt → the built-in helpers list',
      'README.md → helpers section',
    ],
  },
  {
    label: 'Sitemap behaviour',
    test: (f) => f === 'lib/sitemap.js',
    docs: () => [
      'llms.txt → `.sitemap()` entry (per-page opt-out and override options)',
      'README.md → sitemap section',
      'examples/6-sitemap.js — still representative?',
    ],
  },
  {
    label: 'Test suite / conventions',
    test: (f) => f.startsWith('test/'),
    docs: () => ['AIKB/testing.md — layout, conventions, gotchas'],
  },
  {
    label: 'Package manifest',
    test: (f) => f === 'package.json',
    docs: () => [
      'CLAUDE.md → ## What this is (the `files` whitelist) and ## Commands',
      'README.md → ## Requirements (if `engines.node` moved)',
      'ACTION: npm run gates — the pack gate proves llms.txt and AIKB/ still ship',
    ],
  },
  {
    label: 'Examples',
    test: (f) => /^examples\/[\w-]+\.js$/.test(f),
    docs: () => [
      'package.json → the eg1…egN scripts',
      'README.md and llms.txt → ## Docs (the examples list and its count)',
      'CLAUDE.md → ## Commands',
    ],
  },
  {
    label: 'Dev tooling scripts',
    test: (f) => /^scripts\/[\w-]+\.mjs$/.test(f),
    docs: () => ['CLAUDE.md → ## Commands'],
  },
  {
    label: 'Skills',
    test: (f) => f.startsWith('.claude/skills/'),
    docs: () => ['CLAUDE.md → ## Git workflow (the skill it describes)'],
  },
  {
    label: 'Docs-site source',
    test: (f) => f.startsWith('src/'),
    docs: () => [
      'ACTION: `timeout 20 node docs` to regenerate docs/ — it starts a dev server and never exits on its own',
    ],
  },
  {
    label: 'Build output committed by hand',
    test: (f) => f.startsWith('docs/'),
    docs: () => [
      'ACTION: docs/ is build output (docs.js empties it every run) — hand edits belong in src/, specs and plans in planning/',
    ],
  },
]

const fired = []
for (const rule of RULES) {
  const files = changed
    .filter((c) => rule.test(c.file, c.status))
    .map((c) => c.file)
  if (files.length)
    fired.push({ label: rule.label, files, docs: rule.docs(files) })
}
const triggeredFiles = new Set(fired.flatMap((r) => r.files))
const untriggered = changed.filter((c) => !triggeredFiles.has(c.file))

console.log('DOCS-SWEEP SCOPE')
console.log(`base branch: ${BASE}`)
console.log(
  commits
    ? `commits since ${BASE}:\n${commits}`
    : `no commits since ${BASE} (nothing to sweep)`,
)
console.log('')
if (fired.length === 0) {
  console.log('✓ No documentation obligations fired for this diff.')
} else {
  console.log(
    'Triggered obligations — review each, then judge whether it is actually stale:',
  )
  for (const r of fired) {
    console.log(`\n▶ ${r.label}  (${r.files.join(', ')})`)
    for (const d of r.docs)
      console.log(`    ${d.startsWith('ACTION:') ? d : '→ ' + d}`)
  }
}
console.log('')
if (untriggered.length) {
  console.log('Changed files with no doc obligation (informational):')
  for (const c of untriggered) console.log(`    ${c.status} ${c.file}`)
  console.log('')
}
console.log(
  'Next: open each triggered doc and judge staleness (the scope is mechanical; staleness is not). ' +
    'Then prettier-check only the files you edit — do NOT re-run the suite here (`npm run gates` owns that, ' +
    'and doc edits are Markdown-only).',
)
