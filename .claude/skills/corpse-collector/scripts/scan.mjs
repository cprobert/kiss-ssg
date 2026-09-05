#!/usr/bin/env node
// Deterministic dead-reference scanner for the corpse-collector skill.
//
// GATHER half: run every check and print candidate findings. The JUDGE half
// (priority, "is this an intentional historical breadcrumb?") stays in SKILL.md.
//
// Written as Node rather than a pile of greps on purpose: the exclusions live in
// the file walk, so they cannot be defeated by adapting a command downstream
// (a `| grep -v sessions/` filter silently stops working the moment a check is
// switched to `grep -o`, which drops the filename it was filtering on).
// Always exits 0 — it reports, it does not gate.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  isIntegrationBranch,
  resolveBaseBranch,
} from '../../../../scripts/base-branch.mjs'
import { DEFAULT_CONFIG, DEFAULT_FOLDERS } from '../../../../lib/config.js'

const ROOT = process.cwd()
if (
  !existsSync(join(ROOT, 'CLAUDE.md')) ||
  !existsSync(join(ROOT, '.claude'))
) {
  console.error(
    'corpse-collector: run from the repo root (CLAUDE.md + .claude/ expected).',
  )
  process.exit(2)
}

// A NAME denylist, not a "skip every dot-folder" rule: the line is
// generated/vendored/historical (exclude) vs authored (keep), which does not map
// to the dot prefix. `.claude` is a dot-folder we must keep — it holds the very
// skills this scanner audits. `docs` is build output (docs.js empties it) and
// `planning/` (specs, plans, session logs) is intentionally historical: both
// record what was true at the time rather than what is true now.
const EXCLUDE_DIRS = new Set([
  '.git',
  'node_modules',
  'coverage',
  'docs',
  'public',
  'planning',
])

const slash = (p) => p.replace(/\\/g, '/')

function* walk(rel, exts) {
  let entries
  try {
    entries = readdirSync(join(ROOT, rel), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const child = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue
      yield* walk(child, exts)
    } else if (e.isFile() && (!exts || exts.some((x) => e.name.endsWith(x)))) {
      yield child
    }
  }
}

function collect(targets, exts) {
  const out = []
  for (const t of targets) {
    const abs = join(ROOT, t)
    if (!existsSync(abs)) continue
    if (statSync(abs).isDirectory()) out.push(...walk(t, exts))
    else if (!exts || exts.some((x) => t.endsWith(x))) out.push(slash(t))
  }
  return out
}

const read = (rel) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8')
  } catch {
    return null
  }
}

const skillFolders = readdirSync(join(ROOT, '.claude/skills'), {
  withFileTypes: true,
})
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
// The corpse-collector documents the patterns it searches for, so it always
// matches itself; vendored bundles (recognised by a LICENSE.txt) are full of
// generic examples that refer to nothing in this repo.
const vendored = skillFolders.filter((f) =>
  existsSync(join(ROOT, `.claude/skills/${f}/LICENSE.txt`)),
)
const SKIP = [
  '.claude/skills/corpse-collector',
  ...vendored.map((f) => `.claude/skills/${f}`),
]
const skipped = (rel) => SKIP.some((p) => slash(rel).startsWith(p))

function grepFiles(targets, exts, source) {
  const hits = []
  for (const rel of collect(targets, exts)) {
    if (skipped(rel)) continue
    const content = read(rel)
    if (content === null) continue
    content.split(/\r?\n/).forEach((text, i) => {
      const re = new RegExp(source, 'g')
      let m
      while ((m = re.exec(text)) !== null) {
        hits.push({
          file: slash(rel),
          line: i + 1,
          match: m[1] ?? m[0],
          text: text.trim(),
        })
        if (m.index === re.lastIndex) re.lastIndex++
      }
    })
  }
  return hits
}

const sections = []
const section = (title, findings, render, skipped = false) =>
  sections.push({
    title,
    count: findings.length,
    lines: findings.map(render),
    skipped,
  })

// The prose surfaces a consumer or a future developer actually reads. These are
// what the checks below hold to account — not the engine, which the test suite
// already covers. `planning/` is excluded by the walk: specs and plans record
// what was true when they were written, the same as a session log.
const DOC_TARGETS = ['CLAUDE.md', 'README.md', 'llms.txt', 'AIKB', '.claude']
// Where a slash command can legitimately appear. AIKB notes describe engine
// internals, where a `/index` path fragment is not a dead command.
const COMMAND_TARGETS = ['CLAUDE.md', 'README.md', '.claude']
// The two files that promise an API to someone who cannot see the source:
// llms.txt ships inside the npm package, README.md is the front door.
const API_TARGETS = ['llms.txt', 'README.md', 'CLAUDE.md']

// ── Check 1 — referenced repo paths missing on disk ──────────────────────────
// The highest-value check: a wrong path is almost always a real corpse.
const PATH_RE =
  /[`(]((?:lib|test|src|examples|scripts|planning|AIKB|\.claude|\.github)\/[^\s`)]+\.[a-z]{2,5})[`)]/g
const missingPaths = []
for (const rel of collect(DOC_TARGETS, ['.md', '.txt'])) {
  if (skipped(rel)) continue
  const content = read(rel)
  if (content === null) continue
  content.split(/\r?\n/).forEach((text, i) => {
    for (const m of text.matchAll(PATH_RE)) {
      const p = m[1]
      // Globs, placeholders (`planning/sessions/<date>-<slug>.md`) and regex
      // fragments quoted in a skill are patterns, not paths — "missing on disk"
      // does not apply to them.
      if (/[*{}<>[\]|^$+\\()]/.test(p)) continue
      if (!existsSync(join(ROOT, p)))
        missingPaths.push({ file: slash(rel), line: i + 1, path: p })
    }
  })
}
section(
  'Check 1 — referenced repo paths missing on disk',
  missingPaths,
  (h) => `${h.file}:${h.line} — \`${h.path}\` does not exist`,
)

// ── Check 2 — skill folder / name mismatches ─────────────────────────────────
const skillIssues = []
for (const folder of skillFolders) {
  const md = read(`.claude/skills/${folder}/SKILL.md`)
  if (md === null) {
    skillIssues.push({ note: `${folder}/ has no SKILL.md` })
    continue
  }
  const name = (md.match(/^name:\s*(.+?)\s*$/m) ?? [])[1]?.trim() ?? null
  if (name !== folder)
    skillIssues.push({ note: `${folder}/ — name: "${name}" ≠ folder name` })
}
section(
  'Check 2 — skill folder / name mismatches',
  skillIssues,
  (h) => `  ${h.note}`,
)

// ── Check 3 — /commands that resolve to nothing ──────────────────────────────
// Keep BUILTINS current: every missing name is a false positive, and a noisy
// report trains the reader to skim past the real corpse.
const BUILTINS = new Set([
  'clear',
  'compact',
  'config',
  'context',
  'doctor',
  'help',
  'init',
  'login',
  'logout',
  'loop',
  'mcp',
  'model',
  'plugin',
  'resume',
  'review',
  'run',
  'security-review',
  'simplify',
])
const cmdMissing = grepFiles(
  COMMAND_TARGETS,
  ['.md'],
  '`/([a-z][a-z0-9-]*)`',
).filter((h) => !skillFolders.includes(h.match) && !BUILTINS.has(h.match))
section(
  'Check 3 — /commands with no matching skill or built-in',
  cmdMissing,
  (h) => `${h.file}:${h.line} — /${h.match} | ${h.text}`,
)

// ── Check 4 — public API drift ───────────────────────────────────────────────
// Method names the docs promise a consumer, checked against what lib/kiss.js
// actually defines. Deliberately narrow: only `kiss.foo()` call sites and
// llms.txt's `- `.foo(…)`` API bullets. A looser `.foo(` pattern drowns the
// report in `.then()`/`.catch()`/`.trim()` from prose about ordinary JavaScript.
const kissSrc = read('lib/kiss.js') ?? ''
const kissMethods = new Set(
  [...kissSrc.matchAll(/^ {2}(?:async )?([a-zA-Z_]\w*)\(/gm)].map((m) => m[1]),
)
const apiRefs = [
  ...grepFiles(API_TARGETS, ['.md', '.txt'], '\\bkiss\\.([a-zA-Z_]\\w*)\\('),
  ...grepFiles(['llms.txt'], ['.txt'], '^- `\\.([a-zA-Z_]\\w*)\\('),
].filter((h) => !kissMethods.has(h.match))
section(
  'Check 4 — documented .methods() not defined on Kiss',
  apiRefs,
  (h) => `${h.file}:${h.line} — \`.${h.match}()\` | ${h.text}`,
)

// ── Check 5 — npm scripts referenced but not defined ─────────────────────────
let scripts = {}
try {
  scripts = JSON.parse(read('package.json') ?? '{}').scripts ?? {}
} catch {
  /* a malformed manifest is the lint gate's problem, not this check's */
}
// The trailing lookahead keeps `npm run eg<N>` out: a placeholder is not a
// script name, and without it the match backtracks to a bogus `npm run e`.
const scriptRefs = grepFiles(
  DOC_TARGETS,
  ['.md', '.txt'],
  'npm run ([a-z][a-z0-9:-]*)(?=[\\s`)]|$)',
).filter((h) => !(h.match in scripts))
section(
  'Check 5 — `npm run x` with no such script in package.json',
  scriptRefs,
  (h) => `${h.file}:${h.line} — npm run ${h.match} | ${h.text}`,
)

// ── Check 6 — config keys the docs promise ───────────────────────────────────
// `logger` is a real (undefaulted) key — the dependency-injection seam tests use.
const configKeys = new Set([
  ...Object.keys(DEFAULT_CONFIG),
  'folders',
  'siteUrl',
  'logger',
])
const folderKeys = new Set(Object.keys(DEFAULT_FOLDERS))
// Anything after `config.` that is really a filename — `lib/config.js`,
// `vitest.config.mjs`, `AIKB/config.md`, `test/unit/config.test.js`.
const FILENAME_TAIL = /^(js|mjs|cjs|json|md|txt|test)$/
const configRefs = [
  ...grepFiles(
    DOC_TARGETS,
    ['.md', '.txt'],
    'config\\.folders\\.([a-zA-Z_]\\w*)',
  ).filter((h) => !folderKeys.has(h.match)),
  ...grepFiles(
    DOC_TARGETS,
    ['.md', '.txt'],
    'config\\.(?!folders\\b)([a-zA-Z_]\\w*)',
  ).filter((h) => !configKeys.has(h.match) && !FILENAME_TAIL.test(h.match)),
]
section(
  'Check 6 — documented config keys not in lib/config.js defaults',
  configRefs,
  (h) => `${h.file}:${h.line} — config.${h.match} | ${h.text}`,
)

// ── Check 7 — remote branches fully merged into the base ─────────────────────
const branchIssues = []
let branchSkipped = false
try {
  const BASE = resolveBaseBranch(ROOT)
  execFileSync('git', ['fetch', '--prune'], { cwd: ROOT, stdio: 'ignore' })
  const branches = execFileSync('git', ['branch', '-r'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map((s) => s.trim())
    // Integration branches are never corpses, whichever one is the base today.
    .filter(
      (b) =>
        b &&
        !b.includes('HEAD') &&
        !isIntegrationBranch(b.replace(/^origin\//, '')),
    )
  for (const b of branches) {
    const ahead = execFileSync('git', ['log', `${BASE}..${b}`, '--oneline'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
    if (!ahead)
      branchIssues.push({
        note: `${b} — fully merged into ${BASE} (deletable)`,
      })
  }
} catch {
  branchSkipped = true
}
section(
  'Check 7 — remote branches fully merged into the base',
  branchIssues,
  (h) => `  ${h.note}`,
  branchSkipped,
)

// ── Emit report ──────────────────────────────────────────────────────────────
const total = sections.reduce((n, s) => n + s.count, 0)
console.log('CORPSE-COLLECTOR SCAN')
if (vendored.length)
  console.log(`vendored skills skipped: ${vendored.join(', ')}`)
console.log('')
for (const s of sections) {
  if (s.skipped)
    console.log(`– ${s.title}: skipped (no remote / git unavailable)`)
  else if (s.count === 0) console.log(`✓ ${s.title}: clean`)
  else {
    console.log(`▶ ${s.title}: ${s.count}`)
    for (const line of s.lines) console.log(line)
  }
  console.log('')
}
console.log(
  `Done. ${total} candidate finding(s). Apply judgment: classify P1/P2/P3 and drop intentional ` +
    `"retired/replaced/deleted" breadcrumbs (see SKILL.md → What NOT to flag).`,
)
