#!/usr/bin/env node
// The gate battery /branch-close runs before opening a PR.
//
// kiss-ssg has no CI and no pre-commit hook, so this script is the only thing
// standing between a branch and a broken published package. Four gates, cheapest
// first, each printing one pass/fail line plus the salient tail on failure.
// Exits non-zero if any gate fails.
import { execFileSync, spawnSync } from 'node:child_process'
import { resolveBaseBranch } from './base-branch.mjs'

// package.json's `files` whitelist is load-bearing: llms.txt and AIKB/ ship on
// purpose so an agent in a consuming project can read them from node_modules.
// A stray edit to `files` drops them silently — the tarball is the only place
// that shows up, so check it here rather than after a bad publish.
export const REQUIRED_PACKED = ['lib/kiss.js', 'llms.txt', 'AIKB/kiss.md']

export function missingPackedFiles(packedFiles, required = REQUIRED_PACKED) {
  const packed = new Set(packedFiles.map((f) => f.replace(/\\/g, '/')))
  return required.filter((f) => !packed.has(f))
}

// `npm pack --dry-run --json` emits one entry per tarball, each with a `files`
// array of { path }. Tolerant of shape drift: a parse failure returns null so
// the gate reports "could not read" rather than failing a healthy branch.
export function parsePackedFiles(stdout) {
  try {
    const parsed = JSON.parse(stdout)
    const entries = Array.isArray(parsed) ? parsed : [parsed]
    return entries.flatMap((e) => (e.files ?? []).map((f) => f.path))
  } catch {
    return null
  }
}

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  return { ok: r.status === 0, output }
}

const tail = (output, lines = 12) => output.split('\n').slice(-lines).join('\n')

function changedFiles(base) {
  try {
    const out = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return (
      out
        .split('\n')
        .map((f) => f.trim())
        // Code and manifests only. Markdown is deliberately out of scope: the
        // repo's existing docs (README, CLAUDE.md, every AIKB note) predate any
        // prettier pass over them, so checking .md here would fail every branch
        // that honours a documentation obligation. Bringing the docs in is a
        // deliberate one-off reformat, not something a gate should force.
        .filter((f) => /\.(js|mjs|cjs|json)$/.test(f))
    )
  } catch {
    return null
  }
}

const GATES = [
  { name: 'test', fix: 'npm test', run: () => run('npx', ['vitest', 'run']) },
  { name: 'lint', fix: 'npm run lint', run: () => run('npx', ['eslint', '.']) },
  {
    name: 'format',
    fix: 'npx prettier --write <files>',
    run: (base) => {
      const files = changedFiles(base)
      if (files === null)
        return { ok: true, note: `skipped — could not diff against ${base}` }
      if (files.length === 0)
        return { ok: true, note: 'no formattable files changed' }
      // `.prettierignore` decides what is out of scope (build output, .hbs);
      // `--ignore-unknown` drops anything prettier has no parser for, so the
      // gate can just hand it every changed file.
      return run('npx', ['prettier', '--check', '--ignore-unknown', ...files])
    },
  },
  {
    name: 'pack',
    fix: "restore the dropped path in package.json's `files`",
    run: () => {
      const r = run('npm', ['pack', '--dry-run', '--json'])
      const packed = parsePackedFiles(r.output)
      if (packed === null)
        return { ok: true, note: 'skipped — could not read npm pack output' }
      const missing = missingPackedFiles(packed)
      return missing.length === 0
        ? { ok: true, note: `${packed.length} files in tarball` }
        : { ok: false, output: `missing from tarball: ${missing.join(', ')}` }
    },
  },
]

if (import.meta.filename === process.argv[1]) {
  const base = resolveBaseBranch()
  console.log(`gates — diffing against ${base}\n`)
  let failed = 0
  for (const gate of GATES) {
    const { ok, note, output } = gate.run(base)
    if (ok) {
      console.log(`✓ ${gate.name}${note ? ` — ${note}` : ''}`)
    } else {
      failed++
      console.log(`✗ ${gate.name}`)
      console.log(tail(output).replace(/^/gm, '    '))
      console.log(`    fix: ${gate.fix}`)
    }
  }
  console.log(
    failed === 0 ? '\nAll gates passed.' : `\n${failed} gate(s) failed.`,
  )
  process.exit(failed === 0 ? 0 : 1)
}
