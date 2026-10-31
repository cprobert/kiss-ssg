#!/usr/bin/env node
// The gate battery /branch-close runs before opening a PR.
//
// Five gates, cheapest first, each printing one pass/fail line plus its whole
// output on failure. Exits non-zero if any fail. The same script runs locally from
// /branch-close and in CI (.github/workflows/ci.yml), so green here is green
// there.
import { execFileSync, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { BaseBranchError, resolveBaseBranch } from './base-branch.mjs'

// package.json's `files` whitelist is load-bearing: llms.txt and AIKB/ ship on
// purpose so an agent in a consuming project can read them from node_modules,
// types/ is what an editor resolves `types`/`exports` to, and bin/ is what
// `npx kiss-ssg check` runs. A stray edit to `files` drops them silently — the
// tarball is the only place that shows up, so check it here rather than after a
// bad publish.
export const REQUIRED_PACKED = [
  'bin/kiss-ssg.js',
  'lib/kiss.js',
  'types/kiss.d.ts',
  'llms.txt',
  'AIKB/kiss.md',
  'examples/README.md',
  'GUIDE.md',
  'starter/router.js',
  'starter/gitignore',
]

export function missingPackedFiles(packedFiles, required = REQUIRED_PACKED) {
  const packed = new Set(packedFiles.map((f) => f.replace(/\\/g, '/')))
  return required.filter((f) => !packed.has(f))
}

// The other half of the same question, and the half that was missing. The
// `files` whitelist overrides `.gitignore`, so a gitignored folder inside a
// whitelisted one ships anyway: `examples/` is published on purpose, and each
// example builds into its own `public/`, which put 75 files of generated
// output into the tarball that `CLAUDE.md` says never ships. Asking only what
// was *missing* could never have caught it.
// `.converted/` is the second instance of exactly that shape: example 12's
// one-off conversion writes there, it is gitignored, and gitignored is not
// what keeps something out of the tarball. It happens not to ship today, and
// "happens not to" is not a guarantee — the `public/` case did not ship either
// until it did, for 75 files. Both halves are named now: a `!` entry in
// package.json's `files`, and this pattern, which is the one that fails loudly.
export const FORBIDDEN_PACKED = [
  /^examples\/[^/]+\/public\//,
  /^examples\/[^/]+\/\.converted\//,
]

export function forbiddenPackedFiles(
  packedFiles,
  forbidden = FORBIDDEN_PACKED,
) {
  return packedFiles
    .map((f) => f.replace(/\\/g, '/'))
    .filter((f) => forbidden.some((pattern) => pattern.test(f)))
}

// `npm pack --dry-run --json` emits one entry per tarball, each with a `files`
// array of { path } — but npm prints lifecycle-script banners (the `prepare`
// script that installs our git hook) ahead of it, so the JSON has to be found
// rather than assumed to start at byte zero.
export function parsePackedFiles(stdout) {
  const start = stdout.search(/[[{]/)
  if (start === -1) return null
  try {
    const parsed = JSON.parse(stdout.slice(start))
    const entries = Array.isArray(parsed) ? parsed : [parsed]
    return entries.flatMap((e) => (e.files ?? []).map((f) => f.path))
  } catch {
    return null
  }
}

// A spawn that never started (missing binary, ENOENT) has no status and no
// streams — without `error.message` the gate prints a blank failure block.
export function spawnResult(r) {
  const output =
    `${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`.trim()
  // `stdout` is kept separate for the pack gate: npm writes its lifecycle-script
  // banners to stderr, and merging them in leaves trailing text after the JSON.
  return { ok: r.status === 0, stdout: (r.stdout ?? '').trim(), output }
}

// Node cannot spawn npm's `.cmd` shims on Windows without a shell, so `npx`
// and `npm` get one there, and their arguments become one cmd.exe command
// line. Nothing else does: the format gate runs prettier through node itself,
// so a file name with a space or an `&` reaches it as it is (round 10).
export const needsShell = (cmd, platform = process.platform) =>
  platform === 'win32' && (cmd === 'npx' || cmd === 'npm')

const run = (cmd, args) =>
  spawnResult(
    spawnSync(cmd, args, { encoding: 'utf8', shell: needsShell(cmd) }),
  )

// Prettier's own command line, run with `node` rather than through `npx`.
const require = createRequire(import.meta.url)
export const PRETTIER_BIN = path.join(
  path.dirname(require.resolve('prettier/package.json')),
  require('prettier/package.json').bin,
)

// What the format gate checks: every file the branch changed, as it is in the
// working tree now. Prettier reads the working tree, so the list comes from
// the merge base against the working tree, not from the commits alone: a file
// renamed with `git mv` and not yet committed is checked under its new name,
// a deleted one is not listed at all, and a new one not yet added is. A list taken from the commits named
// files the working tree no longer had, and failed the gate on them twice on
// 2026-10-31.
export function changedFiles(base, cwd = process.cwd(), env = process.env) {
  const gitOut = (args) =>
    execFileSync('git', args, {
      cwd,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  try {
    const mergeBase = gitOut(['merge-base', base, 'HEAD']).trim()
    // No commits of the branch's own (on the base itself, as in CI and
    // `prepublishOnly`): list nothing, and the gate checks the whole
    // repository. A dirty tree or a stray untracked file there must not
    // shrink that check to the stray file.
    if (gitOut(['rev-list', '--count', `${mergeBase}..HEAD`]).trim() === '0')
      return { files: [] }
    // -z on both lists: git quotes a non-ASCII name otherwise, and prettier
    // was handed `"caf\303\251.json"`, a file that does not exist (round 11).
    const changed = gitOut([
      'diff',
      '--name-only',
      '-z',
      '--diff-filter=ACMR',
      mergeBase,
    ])
    // A file made on the branch and not yet added is about to be committed
    // too; `git diff` never lists one. Ignored files stay out. A stray
    // scratch file is checked on purpose (round 7): it is one `git add .`
    // away from a commit, and scratch belongs in `.gitignore` or outside the
    // repository. A nested repository (a worktree under .claude/worktrees/)
    // is listed as a directory, `dir/`, and is not this branch's: it stays
    // out. `:(top)` lists the whole repository and `--full-name` prints its
    // paths from the root, as `git diff` does, wherever this runs.
    const created = gitOut([
      'ls-files',
      '-z',
      '--others',
      '--exclude-standard',
      '--full-name',
      '--',
      ':(top)',
    ])
    const files = `${changed}\0${created}`
      .split('\0')
      // No extension filter: `.prettierignore` decides what is out of scope
      // and `--ignore-unknown` (below) drops anything prettier cannot parse,
      // so the two live in one place instead of drifting apart here.
      .filter((f) => f && !f.endsWith('/'))
    return { files: [...new Set(files)].sort() }
  } catch (e) {
    return { error: `${e.stderr ?? ''}`.trim() || e.message }
  }
}

// An empty diff is the normal case on the base branch itself (CI push,
// prepublishOnly) — checking nothing there would mean the gate never runs. The
// repo is prettier-clean, so falling back to the whole tree is cheap and honest.
// Windows' cmd.exe takes a command line of at most 8191 characters and answers
// a longer one with "The syntax of the command is incorrect" — no mention of
// length, and nothing prettier said. That is what this branch's own diff did to
// the `windows-latest` leg: 202 changed files, 8117 characters of paths, one
// gate red while `ubuntu-latest` was green. The gate then ran prettier through
// `npx`, which needs a shell on win32. It runs it through node now (round 10),
// and Windows still caps a process's command line, at 32767 characters, so the
// budget stays, well inside both.
//
// The answer is the one the empty-diff case already gives: check the whole tree.
// It asks a superset of the gate's question and the repo is prettier-clean by
// policy, which is the same assumption that branch rests on. The budget is one
// number on every platform on purpose — a threshold that only existed on Windows
// would mean the two CI legs check different things, which is the drift the
// matrix exists to catch rather than create.
const COMMAND_LINE_BUDGET = 6000

export function commandLineLength(files) {
  return files.reduce((n, f) => n + f.length + 1, 0)
}

export function formatGate(base, diff, run) {
  // Same rule as the pack gate: a gate that cannot see its subject fails.
  if (diff.error !== undefined)
    return {
      ok: false,
      output: `could not diff against ${base}:\n${diff.error}`,
    }
  const wholeRepo = diff.files.length === 0
  const overflows = commandLineLength(diff.files) > COMMAND_LINE_BUDGET
  const note = wholeRepo
    ? `whole repo (no diff against ${base})`
    : overflows
      ? `whole repo (${diff.files.length} changed files overflow one command line)`
      : `${diff.files.length} changed files`
  // `.prettierignore` decides what is out of scope (build output, .hbs);
  // `--ignore-unknown` drops anything prettier has no parser for, so the
  // gate can just hand it every changed file.
  const target = wholeRepo || overflows ? ['.'] : diff.files
  return {
    ...run(process.execPath, [
      PRETTIER_BIN,
      '--check',
      '--ignore-unknown',
      ...target,
    ]),
    note,
  }
}

const GATES = [
  { name: 'test', fix: 'npm test', run: () => run('npx', ['vitest', 'run']) },
  { name: 'lint', fix: 'npm run lint', run: () => run('npx', ['eslint', '.']) },
  // Types are published, so they are worth checking rather than only emitting.
  // `tsconfig.check.json` is a separate config from the emitting one on
  // purpose: the emit has to stay tolerant (`checkJs: false`) to produce
  // declarations at all, so a single config could not both emit and complain.
  {
    name: 'typecheck',
    fix: 'npm run typecheck',
    run: () =>
      run('node', [
        'node_modules/typescript/bin/tsc',
        '-p',
        'tsconfig.check.json',
      ]),
  },
  {
    name: 'format',
    fix: 'npx prettier --write <files>',
    run: (base) => formatGate(base, changedFiles(base), run),
  },
  {
    name: 'pack',
    fix: "restore the dropped path in package.json's `files`, or fix `npm pack --dry-run --json`",
    run: () => {
      const r = run('npm', ['pack', '--dry-run', '--json'])
      const packed = parsePackedFiles(r.stdout)
      // A gate guarding the published tarball must not pass when it cannot see
      // one. Unreadable output is a failure, not a skip.
      if (packed === null)
        return {
          ok: false,
          output: `could not read npm pack output:\n${r.output}`,
        }
      const missing = missingPackedFiles(packed)
      if (missing.length)
        return {
          ok: false,
          output: `missing from tarball: ${missing.join(', ')}`,
        }
      const forbidden = forbiddenPackedFiles(packed)
      if (forbidden.length)
        return {
          ok: false,
          output: `build output in tarball (${forbidden.length} files): ${forbidden.slice(0, 5).join(', ')}${forbidden.length > 5 ? ', …' : ''}`,
        }
      return { ok: true, note: `${packed.length} files in tarball` }
    },
  },
]

if (import.meta.filename === process.argv[1]) {
  // Every gate reads the repository from its root (vitest's config, eslint's,
  // tsc's project, prettier's root-relative file list, npm pack), so run from
  // there whichever folder this was started in. From lib/, four of the five
  // went red on a clean tree (round 12).
  process.chdir(path.dirname(import.meta.dirname))
  let base
  try {
    base = resolveBaseBranch()
  } catch (error) {
    if (!(error instanceof BaseBranchError)) throw error
    console.log(`gates — ${error.message}`)
    process.exit(1)
  }
  console.log(`gates — diffing against ${base}\n`)
  let failed = 0
  for (const gate of GATES) {
    const { ok, note, output } = gate.run(base)
    if (ok) {
      console.log(`✓ ${gate.name}${note ? ` — ${note}` : ''}`)
    } else {
      failed++
      console.log(`✗ ${gate.name}${note ? ` — ${note}` : ''}`)
      // The whole output, not a tail: a failed gate's output is read once, in
      // a CI log, and the last twelve lines of a vitest run are its summary
      // and a code frame — the assertion's diff and anything the failing test
      // printed sat above the cut (2026-10-21).
      console.log(output.replace(/^/gm, '    '))
      console.log(`    fix: ${gate.fix}`)
    }
  }
  console.log(
    failed === 0 ? '\nAll gates passed.' : `\n${failed} gate(s) failed.`,
  )
  process.exit(failed === 0 ? 0 : 1)
}
