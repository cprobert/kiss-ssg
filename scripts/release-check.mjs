#!/usr/bin/env node
// The preflight `/kiss-publish` runs before it pushes a release tag, and the
// publish run it watches afterwards. The tag is the release: pushing it runs
// `publish.yml`, which stages the version on npm. So everything that should
// be true of the commit is checked first, in one place, where a test holds
// it: on an integration branch, level with origin, clean, CI green on that
// commit, a CHANGELOG entry for the version, the tag not taken here or on
// origin, and the version not already on npm. 2.15.0's release (2026-11-11)
// was these checks done by hand.
//
//   node scripts/release-check.mjs         the preflight; exit 0 = all pass,
//                                          1 = one failed, 2 = could not run
//   node scripts/release-check.mjs --run   the publish run for the tag, and
//                                          the staging id once it has staged
//
// The decisions are pure and tested; `gather` and `gatherRun` are the I/O.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isIntegrationBranch } from './base-branch.mjs'
import { isMain } from './is-main.mjs'
import { releaseTag } from './tag-release.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = 'kiss-ssg'

/**
 * The version of the first `## <version>` heading, or null.
 *
 * @param {string} text
 * @returns {string|null}
 */
export function changelogVersion(text) {
  const match = /^## (\S+)/m.exec(text)
  return match ? match[1] : null
}

/**
 * @typedef {{ status: string, conclusion: string, createdAt: string }} Run
 * @typedef {{ name: string, ok: boolean, detail: string }} Check
 */

/**
 * Every preflight check, passing or not, so the operator sees them all at
 * once rather than one failure per attempt. A fact that could not be
 * gathered arrives as `{ error }` and fails its check with that message.
 *
 * @param {{
 *   version: string,
 *   branch: string,
 *   head: string,
 *   originHead: string|null,
 *   dirty: string[],
 *   ciRuns: Run[] | { error: string },
 *   changelog: string|null,
 *   localTag: boolean,
 *   remoteTag: boolean,
 *   npmVersions: string[] | { error: string },
 * }} facts
 * @returns {Check[]}
 */
export function releaseChecks(facts) {
  const tag = releaseTag(facts.version)
  const checks = []
  const add = (name, ok, detail) => checks.push({ name, ok, detail })

  const integration = isIntegrationBranch(facts.branch)
  add(
    'branch',
    integration,
    !facts.branch
      ? 'not on a branch (a detached HEAD)'
      : integration
        ? `on ${facts.branch}`
        : `on ${facts.branch}, not an integration branch (main, master or vN)`,
  )

  add(
    'level with origin',
    facts.originHead === facts.head,
    facts.originHead === null
      ? `origin has no ${facts.branch || 'branch of this name'}`
      : facts.originHead === facts.head
        ? `HEAD is origin/${facts.branch} (${facts.head.slice(0, 7)})`
        : `HEAD is ${facts.head.slice(0, 7)}, origin/${facts.branch} is ${facts.originHead.slice(0, 7)}`,
  )

  add(
    'clean',
    facts.dirty.length === 0,
    facts.dirty.length === 0
      ? 'no uncommitted changes'
      : `uncommitted: ${facts.dirty.join(', ')}`,
  )

  if ('error' in facts.ciRuns) {
    add('CI', false, `could not ask GitHub: ${facts.ciRuns.error}`)
  } else {
    const newest = [...facts.ciRuns].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0]
    add(
      'CI',
      newest?.status === 'completed' && newest.conclusion === 'success',
      !newest
        ? `no ci.yml run on ${facts.head.slice(0, 7)}`
        : newest.status !== 'completed'
          ? `ci.yml on ${facts.head.slice(0, 7)} is ${newest.status}`
          : `ci.yml on ${facts.head.slice(0, 7)}: ${newest.conclusion}`,
    )
  }

  add(
    'CHANGELOG',
    facts.changelog === facts.version,
    facts.changelog === facts.version
      ? `the first entry is ${facts.version}`
      : `the first entry is ${facts.changelog ?? 'missing'}, package.json says ${facts.version}`,
  )

  const taken = [facts.localTag && 'here', facts.remoteTag && 'on origin']
    .filter(Boolean)
    .join(' and ')
  add(
    'tag',
    !taken,
    taken ? `${tag} already exists ${taken}` : `${tag} is free`,
  )

  if ('error' in facts.npmVersions) {
    add('npm', false, `could not ask the registry: ${facts.npmVersions.error}`)
  } else {
    const published = facts.npmVersions.includes(facts.version)
    add(
      'npm',
      !published,
      published
        ? `${PACKAGE}@${facts.version} is already on npm`
        : `${PACKAGE}@${facts.version} is not on npm yet`,
    )
  }
  return checks
}

/**
 * The run `publish.yml` started for this tag: the newest push run whose
 * head is the tag. Null when GitHub has not listed one yet.
 *
 * @template {{ headBranch: string, event: string, createdAt: string }} R
 * @param {R[]} runs
 * @param {string} tag
 * @returns {R|null}
 */
export function pickPublishRun(runs, tag) {
  return (
    runs
      .filter((r) => r.headBranch === tag && r.event === 'push')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
  )
}

/**
 * The staging id npm printed in the stage job's log, or null.
 * The line is `+ kiss-ssg@2.15.0 (staged with id cf0e95ef-…)`.
 *
 * @param {string} log
 * @param {string} version
 * @returns {string|null}
 */
export function stagedId(log, version) {
  const escaped = `${PACKAGE}@${version}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(
    `\\+ ${escaped} \\(staged with id ([0-9A-Za-z-]+)\\)`,
  ).exec(log)
  return match ? match[1] : null
}

/** @param {string} cmd @param {string[]} args */
function run(cmd, args) {
  return execFileSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
}

/** @param {unknown} err */
function message(err) {
  const e = /** @type {{ stderr?: string, message?: string }} */ (err)
  return (e.stderr || e.message || String(err)).trim().split('\n')[0]
}

async function npmVersions() {
  try {
    const res = await fetch(`https://registry.npmjs.org/${PACKAGE}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
    if (!res.ok) return { error: `registry answered ${res.status}` }
    const body = /** @type {{ versions?: object }} */ (await res.json())
    return Object.keys(body.versions ?? {})
  } catch (err) {
    return { error: message(err) }
  }
}

/** @param {string} version */
async function gather(version) {
  const tag = releaseTag(version)
  const branch = run('git', ['branch', '--show-current']).trim()
  const head = run('git', ['rev-parse', 'HEAD']).trim()
  let originHead = null
  if (branch) {
    try {
      originHead = run('git', [
        'rev-parse',
        '--verify',
        '-q',
        `refs/remotes/origin/${branch}`,
      ]).trim()
    } catch {
      originHead = null
    }
  }
  const dirty = run('git', ['status', '--porcelain'])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
  let ciRuns
  try {
    ciRuns = JSON.parse(
      run('gh', [
        'run',
        'list',
        '--workflow',
        'ci.yml',
        '--commit',
        head,
        '--json',
        'status,conclusion,createdAt',
      ]),
    )
  } catch (err) {
    ciRuns = { error: message(err) }
  }
  const changelog = changelogVersion(
    readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'),
  )
  const localTag = run('git', ['tag', '-l', tag]).trim() !== ''
  const remoteTag =
    run('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim() !==
    ''
  return {
    version,
    branch,
    head,
    originHead,
    dirty,
    ciRuns,
    changelog,
    localTag,
    remoteTag,
    npmVersions: await npmVersions(),
  }
}

/** @param {string} version */
function gatherRun(version) {
  const tag = releaseTag(version)
  const runs = JSON.parse(
    run('gh', [
      'run',
      'list',
      '--workflow',
      'publish.yml',
      '--limit',
      '20',
      '--json',
      'databaseId,headBranch,event,status,conclusion,createdAt,url',
    ]),
  )
  const found = pickPublishRun(runs, tag)
  if (!found) return { tag, run: null, staged: null }
  let staged = null
  if (found.status === 'completed' && found.conclusion === 'success') {
    const { jobs } = JSON.parse(
      run('gh', ['run', 'view', String(found.databaseId), '--json', 'jobs']),
    )
    const stage = jobs.find(
      (/** @type {{ name: string }} */ j) => j.name === 'stage',
    )
    if (stage)
      staged = stagedId(
        run('gh', [
          'run',
          'view',
          String(found.databaseId),
          '--log',
          '--job',
          String(stage.databaseId),
        ]),
        version,
      )
  }
  return { tag, run: found, staged }
}

if (isMain(import.meta.filename)) {
  try {
    const { version } = JSON.parse(
      readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    )
    if (process.argv[2] === '--run') {
      const { tag, run: found, staged } = gatherRun(version)
      if (!found) {
        console.log(`no publish run for ${tag} yet`)
        process.exitCode = 1
      } else {
        const state =
          found.status === 'completed'
            ? `${found.status} ${found.conclusion}`
            : found.status
        console.log(`publish run ${found.databaseId} for ${tag}: ${state}`)
        console.log(found.url)
        if (staged)
          console.log(`staged ${PACKAGE}@${version} with id ${staged}`)
        if (found.status === 'completed' && found.conclusion !== 'success')
          process.exitCode = 1
      }
    } else {
      const checks = releaseChecks(await gather(version))
      for (const c of checks)
        console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}: ${c.detail}`)
      const failed = checks.filter((c) => !c.ok).length
      console.log(
        failed
          ? `release-check: ${failed} check(s) failed; nothing was tagged`
          : `release-check: ${releaseTag(version)} is ready to tag`,
      )
      process.exitCode = failed ? 1 : 0
    }
  } catch (err) {
    console.error(`release-check: ${message(err)}`)
    process.exitCode = 2
  }
}
