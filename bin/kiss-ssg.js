#!/usr/bin/env node
// `kiss-ssg init` sets a folder up for a coding agent and drops a starter site;
// `kiss-ssg check <script>` and `kiss-ssg aikb <script>` run the site's own build
// script as a dry run and print what it built, or run the same dry run and let
// it record the site's knowledge base. Thin on purpose — every decision it makes
// lives in `lib/init.js` (what to create, merge or leave alone), `lib/check.js`
// (argv, the reports file, the baseline, the exit code) and
// `lib/build-report.js` (the report itself); this file is the I/O around them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import {
  HELP,
  defaultBaseline,
  describeEngine,
  diffReports,
  engineLine,
  exitCodeFor,
  formatDiff,
  parseArgs,
  readReports,
  readReportsFile,
  recordedLine,
  subjectLines,
} from '../lib/check.js'
import { formatReport } from '../lib/build-report.js'
import { runSession } from '../lib/sessions.js'
import { runBase } from '../lib/base.js'
import {
  INIT_HELP,
  describeAction,
  isModuleSyntax,
  nextSteps,
  parseInitArgs,
  planInit,
} from '../lib/init.js'

// `session` and `base` answer the kiss-memory skills' questions about a
// site's git and its session logs. Every decision is in lib/; this prints.
if (process.argv[2] === 'session' || process.argv[2] === 'base') {
  const run = process.argv[2] === 'session' ? runSession : runBase
  const result = run(process.argv.slice(3), { cwd: process.cwd() })
  if (result.err) console.error(result.err)
  if (result.out) console.log(result.out)
  process.exit(result.code)
}

if (process.argv[2] === '--version' || process.argv[2] === '-v') {
  console.log(
    JSON.parse(
      fs.readFileSync(
        path.join(import.meta.dirname, '..', 'package.json'),
        'utf8',
      ),
    ).version,
  )
  process.exit(0)
}

// `init` is its own command with its own arguments, so it is handled before
// check's parse: it runs no build script and prints no report.
if (process.argv[2] === 'init') {
  const init = parseInitArgs(process.argv.slice(3))
  if (init.error || init.help) {
    if (init.error) console.error(`kiss-ssg: ${init.error}\n`)
    ;(init.error ? console.error : console.log)(INIT_HELP)
    process.exit(init.error ? 1 : 0)
  }
  const cwd = process.cwd()
  const here = (p) => path.join(cwd, p)
  const read = (p) =>
    fs.existsSync(here(p)) ? fs.readFileSync(here(p), 'utf8') : null
  const starterDir = path.join(import.meta.dirname, '..', 'starter')
  /** @type {Record<string, string>} */
  const starter = {}
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(starterDir, rel), {
      withFileTypes: true,
    })) {
      const p = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) walk(p)
      else starter[p] = fs.readFileSync(path.join(starterDir, p), 'utf8')
    }
  }
  walk('')
  const router = read('router.js')
  // Node's own parser, never running the file: `--check` over stdin, so the
  // folder's package.json "type" cannot decide the answer for it.
  const parses = (text, inputType) =>
    spawnSync(process.execPath, [`--input-type=${inputType}`, '--check'], {
      input: text,
    }).status === 0
  const { version } = JSON.parse(
    fs.readFileSync(
      path.join(import.meta.dirname, '..', 'package.json'),
      'utf8',
    ),
  )
  const actions = planInit({
    folderName: path.basename(cwd),
    version,
    install: init.install,
    // Its package.json, not the folder: an empty folder is not an engine.
    hasEngine: fs.existsSync(here('node_modules/kiss-ssg/package.json')),
    hasRouter: router !== null,
    routerIsModule: router !== null && isModuleSyntax(router, parses),
    hasServer: fs.existsSync(here('server.js')),
    // The first .js file besides router.js that parses as CommonJS, and so
    // may be working under "commonjs" whatever runs it — or the first thing
    // the walk cannot vouch for: a link (its target is not walked) or a
    // folder or file it cannot read. Only node_modules (other packages) and
    // .git are skipped; a dot-folder can hold scripts as well as any other
    // (Codex, round six). Not walked at all when the package already says
    // "module": there is no type to change.
    otherScript: (() => {
      try {
        if (JSON.parse(read('package.json') ?? '{}').type === 'module')
          return null
      } catch {
        return null
      }
      const skip = new Set(['node_modules', '.git'])
      const walk = (rel) => {
        let entries
        try {
          entries = fs.readdirSync(here(rel), { withFileTypes: true })
        } catch {
          return rel || '.'
        }
        for (const e of entries) {
          if (skip.has(e.name)) continue
          const p = rel ? `${rel}/${e.name}` : e.name
          if (e.isSymbolicLink()) return p
          if (e.isDirectory()) {
            const found = walk(p)
            if (found) return found
          } else if (e.isFile() && p !== 'router.js') {
            // The files whose module system follows "type": .js, .ts (Node
            // 24 strips types and runs them; no cheap parse, so any blocks)
            // and an extensionless entry (`node tools/smoke`). One could be
            // working CommonJS when it parses as CommonJS. An extensionless
            // file is only read as a script when it says so — a #! line, or
            // require/module.exports — so CNAME's `www.example.com`, which
            // parses, is not one; dotfiles (.nvmrc's `22`) never are.
            const ext = path.extname(e.name)
            if (ext === '.ts') return p
            const script =
              ext === '.js' || (ext === '' && !e.name.startsWith('.'))
            if (!script) continue
            try {
              const text = fs.readFileSync(here(p), 'utf8')
              if (
                ext === '' &&
                !/^#!|\brequire\s*\(|\bmodule\.exports\b/.test(text)
              )
                continue
              if (parses(text, 'commonjs')) return p
            } catch {
              return p
            }
          }
        }
        return null
      }
      return walk('')
    })(),
    // What `require('<this folder>')` loads: Node resolves main with its
    // extensions and index files, or falls back to index.js. Resolved, not
    // loaded, so nothing in the folder runs.
    entry: (() => {
      try {
        const file = createRequire(here('package.json')).resolve(cwd)
        return path.relative(cwd, file).split(path.sep).join('/')
      } catch {
        return null
      }
    })(),
    hasSrc: fs.existsSync(here('src')),
    hasMain: (() => {
      try {
        const { main } = JSON.parse(read('package.json') ?? '{}')
        return typeof main === 'string' && fs.statSync(here(main)).isFile()
      } catch {
        return false
      }
    })(),
    files: {
      'package.json': read('package.json'),
      'CLAUDE.md': read('CLAUDE.md'),
      'AGENTS.md': read('AGENTS.md'),
      '.claude/settings.json': read('.claude/settings.json'),
      '.codex/config.toml': read('.codex/config.toml'),
      '.gitignore': read('.gitignore'),
    },
    starter,
  })
  // A `create` refuses to replace anything (`wx` fails on an existing path,
  // a dangling link included), and a `merge` or `append` lands whole or not
  // at all: written beside the file, then renamed over it. The first failure
  // stops the run, so nothing is reported as done that was not.
  const write = (action) => {
    const target = here(action.path)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    if (action.verb === 'create') {
      fs.writeFileSync(target, action.content, { flag: 'wx' })
      return
    }
    const temp = `${target}.kiss-init-${process.pid}`
    try {
      fs.writeFileSync(temp, action.content, { flag: 'wx' })
      fs.renameSync(temp, target)
    } finally {
      fs.rmSync(temp, { force: true })
    }
  }
  let status = 0
  for (const action of actions) {
    if (action.kind === 'write') {
      try {
        write(action)
      } catch (err) {
        console.error(
          `kiss-ssg: could not ${action.verb} ${action.path} (${err.message}); stopped here, and nothing after it was done`,
        )
        process.exit(1)
      }
    }
    console.log(describeAction(action))
    if (action.kind === 'install') {
      // npm is npm.cmd on Windows, which Node will not spawn without a shell,
      // and a shell given an argument array prints DEP0190 on every run. One
      // command string instead: the only value in it is our own version.
      const command = `npm install --save-dev ${action.spec}`
      const npm =
        process.platform === 'win32'
          ? spawnSync(command, { cwd, stdio: 'inherit', shell: true })
          : spawnSync('npm', ['install', '--save-dev', action.spec], {
              cwd,
              stdio: 'inherit',
            })
      if (npm.status !== 0) {
        console.error(
          `kiss-ssg: npm install --save-dev ${action.spec} failed; run it yourself before building`,
        )
        status = 1
      }
    }
  }
  console.log(`\n${nextSteps()}`)
  process.exit(status)
}

const parsed = parseArgs(process.argv.slice(2))
if (parsed.error) {
  console.error(`kiss-ssg: ${parsed.error}\n`)
  console.error(HELP)
  process.exit(1)
}
if (parsed.command === 'help') {
  console.log(HELP)
  process.exit(0)
}

// Read before the build, not after it: a run that takes a minute and then dies
// on a mistyped filename has wasted the minute, and the mistyped filename was
// knowable at the first instruction. It is a usage error, so it prints like one.
let against = null
if (parsed.against) {
  try {
    against = readReportsFile(fs.readFileSync(parsed.against, 'utf8'))
  } catch (err) {
    console.error(
      `kiss-ssg: cannot read --against file ${parsed.against} (${err.message})\n`,
    )
    console.error(HELP)
    process.exit(1)
  }
}

const reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kiss-check-'))
const reportFile = path.join(reportDir, 'reports.jsonl')
try {
  // Which kiss-ssg the site resolves, said before the build and on stderr
  // beside the build log: it is a fact about the environment, not part of
  // the report, so stdout stays the report in both output modes. A link to a
  // working tree is the one thing an upgrade wants to know and npm does not
  // volunteer.
  console.error(
    engineLine(
      describeEngine({
        cwd: process.cwd(),
        // From the script's folder: that is where Node resolves its imports.
        from: path.dirname(path.resolve(parsed.script)),
      }),
    ),
  )
  const run = spawnSync(process.execPath, [parsed.script, ...parsed.args], {
    // The caller's cwd, not the script's folder: a site resolves `folders`
    // against the cwd it is normally run from, and moving it would check a
    // different set of paths from the ones the site builds with.
    cwd: process.cwd(),
    env: {
      ...process.env,
      KISS_CHECK: '1',
      KISS_REPORT: reportFile,
      // The one difference between the two commands: `aikb` is the ceremony
      // that lets the build write its knowledge base. A check never sets it,
      // so no ordinary run of it can move the baseline the diff reads.
      ...(parsed.command === 'aikb' ? { KISS_AIKB: '1' } : {}),
    },
    // The site's own build log goes to *our* stderr (fd 2 at the child's
    // stdout too), so stdout carries nothing but the report and stays
    // machine-readable while a person still sees the build.
    stdio: [0, 2, 2],
  })
  if (run.error) console.error(`kiss-ssg: ${run.error.message}`)

  const text = fs.existsSync(reportFile)
    ? fs.readFileSync(reportFile, 'utf8')
    : ''
  let reports = []
  try {
    reports = readReports(text)
  } catch (err) {
    console.error(`kiss-ssg: could not read the build report (${err.message})`)
  }

  // Without `--against`, `check` falls back to the knowledge base's own
  // snapshot — the state of the site when the last piece of work was closed,
  // which is the question "what have I changed" actually means. Read after the
  // run, which under a check has not touched the file. `aikb` has just
  // overwritten it, so it diffs only when a file was named explicitly.
  if (!against && parsed.command === 'check') {
    const baseline = defaultBaseline(reports)
    // A site that has never recorded has no baseline and no diff: the ordinary
    // case, not a finding, so nothing is said about it.
    if (baseline && fs.existsSync(baseline)) {
      try {
        against = readReportsFile(fs.readFileSync(baseline, 'utf8'))
      } catch (err) {
        console.error(`kiss-ssg: could not read ${baseline} (${err.message})`)
      }
    }
  }

  // One diff entry per report, in the same order, so the summary can print
  // each under its own site's line by index.
  const diff = against ? diffReports(against, reports) : null

  if (reports.length === 0)
    console.error(
      'kiss-ssg: no build report was written — the script never settled a build. Add `await kiss.complete()` to it.',
    )
  else if (parsed.subjects) {
    const lines = subjectLines(reports)
    if (lines) console.log(lines)
  } else if (parsed.summary)
    reports.forEach((report, at) => {
      console.log(formatReport(report))
      if (parsed.command === 'aikb') console.log(recordedLine(report))
      if (diff) console.log(formatDiff(diff[at]))
    })
  // The bare array stays the shape stdout has without --against: a consumer
  // that never asked for a diff never has to learn the wrapper.
  else console.log(JSON.stringify(diff ? { reports, diff } : reports, null, 2))

  process.exitCode = exitCodeFor(reports, run.status)
} finally {
  fs.rmSync(reportDir, { recursive: true, force: true })
}
