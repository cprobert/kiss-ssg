#!/usr/bin/env node
// The arm harness: measure a skill by running the same brief in two copies of
// a site, one per plugin, and reading what each did from its transcript.
//
//   node scripts/arms.mjs setup     --site <repo> --commit <sha> --arm <name> --plugin-ref <ref> --out <dir>
//   node scripts/arms.mjs run       --arm-dir <dir> --brief <file> [--budget <usd>] [--model <id>] [--print-only]
//   node scripts/arms.mjs summarise --arm-dir <dir> [--answer-key <file>] [--bench a1k9|fixture] [--json]
//
// It was rebuilt in a scratchpad five times (2026-10-13, 10-21, 10-31, 11-01
// twice) before it came here; the contract is
// planning/plans/2026-11-02-kiss-legal-and-privacy.md, workstream A. Each step
// lives in scripts/arms/: the argument parsing (args.mjs), the claude argument
// list (claude-argv.mjs), the copy (setup.mjs), the transcript and evidence
// index (transcript.mjs) and the one place a process is started (runner.mjs).
// This file joins them: `run` and `summarise` read and write the arm folder,
// and every process goes through an injected runner, so the tests start none.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMain } from './is-main.mjs'
import { ArmsUsageError, parseArmsArgs, USAGE } from './arms/args.mjs'
import { buildClaudeArgv, formatCommand } from './arms/claude-argv.mjs'
import { realRunner } from './arms/runner.mjs'
import { ArmsSetupError, setupArm } from './arms/setup.mjs'
import {
  buildEvidenceIndex,
  evidenceLines,
  parseTranscript,
  summariseTranscript,
} from './arms/transcript.mjs'

export const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
)

/** @typedef {import('./arms/runner.mjs').Runner} Runner */

/** @param {string} armDir */
export function readArm(armDir) {
  const file = path.join(armDir, 'arm.json')
  if (!fs.existsSync(file))
    throw new ArmsSetupError(`${file} not found: run \`arms.mjs setup\` first`)
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Launch one arm's headless session, or with `printOnly` just say how. The
 * command is printed first either way, so the operator can launch it when
 * this session's permission check refuses.
 *
 * @param {{ armDir: string, brief: string, budget: number, model?: string|null,
 *   printOnly?: boolean, runner: Runner, log?: (line: string) => void,
 *   now?: () => Date }} options
 */
export async function runArm({
  armDir,
  brief,
  budget,
  model = null,
  printOnly = false,
  runner,
  log = () => {},
  now = () => new Date(),
}) {
  armDir = path.resolve(armDir)
  const arm = readArm(armDir)
  if (!fs.existsSync(brief))
    throw new ArmsSetupError(`--brief ${brief} not found`)
  const transcript = path.join(armDir, 'transcript.jsonl')
  const stderrFile = path.join(armDir, 'stderr.txt')
  const briefCopy = path.join(armDir, 'brief.txt')
  if (fs.existsSync(transcript))
    throw new ArmsSetupError(
      `${transcript} exists: an arm runs once. Set up a new arm to run again`,
    )
  const argv = buildClaudeArgv({
    pluginDir: arm.plugin.dir,
    budget,
    model: model ?? arm.model ?? null,
  })
  const env = { npm_config_cache: arm.npmCache }
  const command = formatCommand({
    cwd: arm.site.copy,
    argv,
    stdin: briefCopy,
    stdout: transcript,
    stderr: stderrFile,
    env,
  })
  if (
    !fs.existsSync(briefCopy) ||
    fs.readFileSync(briefCopy, 'utf8') !== fs.readFileSync(brief, 'utf8')
  )
    fs.copyFileSync(brief, briefCopy)
  log(command)
  if (printOnly) return { command, argv, status: null }
  const record = {
    argv,
    command,
    model: model ?? arm.model ?? null,
    budget,
    brief: briefCopy,
    startedAt: now().toISOString(),
    endedAt: null,
    exitCode: null,
  }
  const runFile = path.join(armDir, 'run.json')
  fs.writeFileSync(runFile, `${JSON.stringify(record, null, 2)}\n`)
  const { status } = await runner.stream('claude', argv, {
    cwd: arm.site.copy,
    env,
    stdinFile: briefCopy,
    stdoutFile: transcript,
    stderrFile,
  })
  record.endedAt = now().toISOString()
  record.exitCode = status
  fs.writeFileSync(runFile, `${JSON.stringify(record, null, 2)}\n`)
  return { command, argv, status }
}

/**
 * New files in the copy, as diff lines, so the evidence index sees a page the
 * arm created as well as one it changed. Binary and very large files are
 * named and skipped.
 *
 * @param {string} copy
 * @param {string[]} files
 */
export function untrackedAsDiff(copy, files) {
  const out = []
  for (const rel of files) {
    out.push(`+++ b/${rel}`)
    const file = path.join(copy, rel)
    let stat
    try {
      stat = fs.statSync(file)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size > 1_000_000) continue
    const text = fs.readFileSync(file, 'utf8')
    if (text.includes('\0')) continue
    for (const line of text.split(/\r?\n/)) out.push(`+${line}`)
  }
  return out.join('\n')
}

/**
 * Read an answer key: an array of items, or `{ items: [...] }`.
 *
 * @param {string} file
 * @returns {Array<Record<string, any>>}
 */
export function readAnswerKey(file) {
  const json = JSON.parse(fs.readFileSync(file, 'utf8'))
  const items = Array.isArray(json) ? json : json.items
  if (!Array.isArray(items)) throw new ArmsSetupError(`${file} has no items`)
  return items
}

/**
 * @param {{ armDir: string, answerKey?: string|null, bench?: 'a1k9'|'fixture'|null, runner: Runner }} options
 */
export async function summariseArm({
  armDir,
  answerKey = null,
  bench = null,
  runner,
}) {
  armDir = path.resolve(armDir)
  const arm = readArm(armDir)
  const transcriptFile = path.join(armDir, 'transcript.jsonl')
  if (!fs.existsSync(transcriptFile))
    throw new ArmsSetupError(`${transcriptFile} not found: the arm has not run`)
  const t = parseTranscript(fs.readFileSync(transcriptFile, 'utf8'))
  const summary = summariseTranscript(t)
  const copy = arm.site.copy
  const git = async (/** @type {string[]} */ args) => {
    const r = await runner.exec('git', ['-C', copy, ...args])
    if (r.status !== 0)
      throw new ArmsSetupError(
        `git ${args.join(' ')} failed in ${copy}: ${r.stderr.trim()}`,
      )
    return r.stdout
  }
  const diffStat = (await git(['diff', '--stat', arm.baseline])).trimEnd()
  const changed = (await git(['diff', '--name-status', arm.baseline]))
    .split(/\r?\n/)
    .filter(Boolean)
  const untracked = (await git(['ls-files', '--others', '--exclude-standard']))
    .split(/\r?\n/)
    .filter(Boolean)
  const commitsAfterBaseline = Number(
    (await git(['rev-list', '--count', `${arm.baseline}..HEAD`])).trim(),
  )
  const report = {
    arm: arm.arm,
    site: `${arm.site.repo} at ${arm.site.commit}`,
    plugin: `${arm.plugin.ref} = ${arm.plugin.sha}${arm.plugin.dirty ? ' (working tree dirty; the archive is the commit)' : ''}`,
    engine: `${path.basename(arm.engine.tarball)} ${arm.engine.sha512}`,
    ...summary,
    git: { diffStat, changed, untracked, commitsAfterBaseline },
    evidence: null,
  }
  if (answerKey) {
    const diff = `${await git(['diff', arm.baseline])}\n${untrackedAsDiff(copy, untracked)}`
    const lines = evidenceLines(t, diff, summary.finalMessage)
    report.evidence = buildEvidenceIndex(readAnswerKey(answerKey), lines, {
      bench,
    })
  }
  fs.writeFileSync(
    path.join(armDir, 'summary.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  return report
}

/**
 * The summary as text for a person.
 *
 * @param {Record<string, any>} r the summariseArm report
 */
export function formatSummary(r) {
  const out = []
  const cost = r.costUsd === null ? '?' : `$${r.costUsd.toFixed(2)}`
  const secs =
    r.durationMs === null ? '?' : `${Math.round(r.durationMs / 1000)}s`
  out.push(`# arm ${r.arm}`)
  out.push(`site ${r.site}`, `plugin ${r.plugin}`, `engine ${r.engine}`)
  out.push(
    `model ${r.model}, Claude Code ${r.claudeCodeVersion}, mode ${r.permissionMode}; ${cost}, ${secs}, ${r.numTurns ?? '?'} turns${r.isError ? ', ERROR' : ''}${r.complete ? '' : ', NO RESULT EVENT (interrupted?)'}`,
  )
  out.push(
    `plugins: ${r.plugins.join(', ') || 'none'}; MCP servers: ${r.mcpServers.join(', ') || 'none'}`,
  )
  out.push(
    `Skill calls (${r.skillCalls.length}): ${r.skillCalls.map((s) => `${s.skill} (line ${s.line})`).join(', ') || 'none'}`,
  )
  out.push(
    `SKILL.md reads (${r.skillReads.length}): ${r.skillReads.map((s) => `${s.skill} (line ${s.line})`).join(', ') || 'none'}`,
  )
  if (r.skillFileReads.length)
    out.push(
      `other skill files read: ${r.skillFileReads.map((s) => `${s.skill}/${s.file}`).join(', ')}`,
    )
  out.push(
    `tools: ${
      Object.entries(r.toolCounts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ') || 'none'
    }`,
  )
  out.push(
    `commit attempts: ${r.commitAttempts.length}; push/remote attempts: ${r.pushOrRemoteAttempts.length}; commits after baseline: ${r.git.commitsAfterBaseline}; permission denials: ${r.permissionDenials.length}`,
  )
  for (const d of r.permissionDenials)
    out.push(`  denied ${d.tool}: ${JSON.stringify(d.input).slice(0, 160)}`)
  if (r.parseErrors.length)
    out.push(`unparsed transcript lines: ${r.parseErrors.join(', ')}`)
  out.push(
    '',
    '## diff against the baseline',
    r.git.diffStat || '(no tracked file changed)',
  )
  if (r.git.untracked.length)
    out.push(`new files: ${r.git.untracked.join(', ')}`)
  out.push('', '## final message', r.finalMessage ?? '(none)')
  if (r.evidence) {
    out.push(
      '',
      '## evidence index (for a person to mark: hit, missed or not applicable)',
    )
    for (const item of r.evidence) {
      out.push(
        `- ${item.id} [${item.lane}; scored as ${item.howScored}] ${item.finding}`,
      )
      if (item.notApplicable) {
        out.push('    not applicable: not visible at the bench commit')
        continue
      }
      if (!item.candidates.length) out.push('    no candidate lines')
      for (const c of item.candidates)
        out.push(`    ${c.source} ${c.ref}: ${c.text}`)
      if (item.more) out.push(`    … ${item.more} more`)
    }
  }
  return out.join('\n')
}

/**
 * @param {string[]} argv
 * @param {{ runner?: Runner, log?: (line: string) => void }} [deps]
 */
export async function main(
  argv,
  { runner = realRunner(), log = console.log } = {},
) {
  const { command, options } = parseArmsArgs(argv)
  if (command === 'setup') {
    const record = await setupArm({
      site: options.site,
      commit: options.commit,
      arm: options.arm,
      pluginRef: options['plugin-ref'],
      pluginPath: options['plugin-path'],
      engine: options.engine ?? null,
      out: options.out,
      model: options.model ?? null,
      repo: REPO,
      runner,
      log,
    })
    log(
      `arm ready: ${path.join(path.resolve(options.out), options.arm)} (baseline ${record.baseline})`,
    )
    return 0
  }
  if (command === 'run') {
    const { status } = await runArm({
      armDir: options['arm-dir'],
      brief: options.brief,
      budget: options.budget,
      model: options.model ?? null,
      printOnly: options['print-only'],
      runner,
      log,
    })
    if (status !== null) log(`claude exited ${status}`)
    return status ?? 0
  }
  const report = await summariseArm({
    armDir: options['arm-dir'],
    answerKey: options['answer-key'] ?? null,
    bench: options.bench ?? null,
    runner,
  })
  log(options.json ? JSON.stringify(report, null, 2) : formatSummary(report))
  return 0
}

if (isMain(import.meta.filename)) {
  main(process.argv.slice(2)).then(
    (code) => (process.exitCode = code),
    (error) => {
      if (error instanceof ArmsUsageError)
        console.error(`${error.message}\n\n${USAGE}`)
      else
        console.error(error instanceof ArmsSetupError ? error.message : error)
      process.exitCode = 2
    },
  )
}
