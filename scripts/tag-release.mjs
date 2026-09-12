#!/usr/bin/env node
// Tags the commit a version was published from, and pushes the tag.
//
// The bump does not tag (`npm version … --no-git-tag-version` in
// `/branch-close`: the PR merge is the version event) and nothing else did, so
// nothing in git said which commit `2.2.1` on npm was — or which commit a
// `kiss-memory@2.2.1` plugin install came from, since the marketplace serves
// `main`'s HEAD and Claude Code compares manifest versions to decide whether an
// installed plugin is stale. Publishing is the other deliberate act, so this
// runs as npm's `postpublish` hook: the tarball is on the registry, the commit
// that produced it gets its name.
//
// A script rather than `git tag v$npm_package_version` in package.json,
// because cmd.exe does not expand `$var` and half the contributors are on
// Windows. The decision core is pure and tested; `run` is the only I/O.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * `v<version>`. Refuses anything that is not a version, so a broken
 * `package.json` cannot push a tag called `vundefined`.
 *
 * @param {unknown} version
 * @returns {string}
 */
export function releaseTag(version) {
  if (
    typeof version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
  ) {
    throw new Error(`not a version: ${JSON.stringify(version)}`)
  }
  return `v${version}`
}

/**
 * The git commands that publish this version's tag, or none when the tag
 * already exists — a retried `postpublish` after a failed push must not fail
 * on the tag it created the first time.
 *
 * @param {{ version: string, existingTags: string[] }} input
 * @returns {{ tag: string, skip: string|null, commands: string[][] }}
 */
export function planRelease({ version, existingTags }) {
  const tag = releaseTag(version)
  if (existingTags.includes(tag))
    return { tag, skip: `${tag} already exists`, commands: [] }
  return {
    tag,
    skip: null,
    commands: [
      ['tag', '-a', tag, '-m', tag],
      ['push', 'origin', tag],
    ],
  }
}

/**
 * Lists the tag, then runs the plan. `run` is handed git's arguments and
 * returns its stdout; the default runs the real thing in the repo root.
 *
 * @param {{ version: string, run?: (args: string[]) => string }} input
 * @returns {{ tag: string, skip: string|null }}
 */
export function tagRelease({ version, run = git }) {
  const tag = releaseTag(version)
  const existingTags = run(['tag', '-l', tag])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const plan = planRelease({ version, existingTags })
  for (const args of plan.commands) run(args)
  return { tag: plan.tag, skip: plan.skip }
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

// Only when run directly, so importing this for its test tags nothing.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { version } = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  )
  const { tag, skip } = tagRelease({ version })
  console.log(skip ? `release tag ${skip}` : `tagged and pushed ${tag}`)
}
