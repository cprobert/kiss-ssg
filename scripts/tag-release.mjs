#!/usr/bin/env node
// Tags the commit a version was published from, and pushes the tag. Since
// the release moved to `publish.yml`, the push is what starts it, and
// `/kiss-publish` runs this once `release-check.mjs` has passed.
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
import { isMain } from './is-main.mjs'

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
 * The npm dist-tag a version is staged under: `latest` for a release, `next`
 * for a prerelease. npm refuses to publish a prerelease without an explicit
 * `--tag`, so the workflow always passes this, and a prerelease never becomes
 * what `npm install kiss-ssg` resolves to.
 *
 * @param {unknown} version
 * @returns {'latest'|'next'}
 */
export function distTag(version) {
  return releaseTag(version).includes('-') ? 'next' : 'latest'
}

/**
 * The publish workflow's first check: the tag that was pushed is `v` plus
 * `package.json`'s version, so a tag on the wrong commit cannot stage another
 * version's tarball. Returns the tag; throws, naming both, when they differ.
 *
 * @param {{ ref: string|undefined, version: unknown }} input
 * @returns {string}
 */
export function checkReleaseTag({ ref, version }) {
  const expected = releaseTag(version)
  if (!ref) throw new Error('no tag to check: the pushed tag name is empty')
  if (ref !== expected)
    throw new Error(`the tag is ${ref} but package.json says ${expected}`)
  return expected
}

/**
 * The git commands that publish this version's tag on HEAD. A tag made here
 * whose push failed is pushed, not skipped: the retry (`/kiss-publish`'s
 * fallback, or a retried `postpublish`) must finish the release, and the old
 * plan, which looked only at local tags, called it done. A tag on another
 * commit, or on origin and not here, is refused: pushing it would stage
 * whatever commit it names.
 *
 * @param {{ version: string, head: string, localTag: string|null, remoteTag: boolean }} input
 *   `localTag` is the commit the local tag points at, or null for none.
 * @returns {{ tag: string, skip: string|null, commands: string[][] }}
 */
export function planRelease({ version, head, localTag, remoteTag }) {
  const tag = releaseTag(version)
  if (localTag && localTag !== head)
    throw new Error(
      `${tag} already points at ${localTag.slice(0, 7)} here, not HEAD (${head.slice(0, 7)})`,
    )
  if (remoteTag && !localTag)
    throw new Error(
      `${tag} is on origin but not here: fetch the tags and check which commit it names`,
    )
  if (remoteTag)
    return {
      tag,
      skip: `${tag} already exists here and on origin`,
      commands: [],
    }
  const push = ['push', 'origin', tag]
  if (localTag) return { tag, skip: null, commands: [push] }
  return { tag, skip: null, commands: [['tag', '-a', tag, '-m', tag], push] }
}

/**
 * Asks git where HEAD is, where a local tag points and whether origin has
 * it, then runs the plan. `run` is handed git's arguments and returns its
 * stdout; the default runs the real thing in the repo root.
 *
 * @param {{ version: string, run?: (args: string[]) => string }} input
 * @returns {{ tag: string, skip: string|null }}
 */
export function tagRelease({ version, run = git }) {
  const tag = releaseTag(version)
  const head = run(['rev-parse', 'HEAD']).trim()
  const local = run(['tag', '-l', tag]).trim() !== ''
  const localTag = local ? run(['rev-parse', `${tag}^{commit}`]).trim() : null
  const remoteTag =
    run(['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).trim() !== ''
  const plan = planRelease({ version, head, localTag, remoteTag })
  for (const args of plan.commands) run(args)
  return { tag: plan.tag, skip: plan.skip }
}

/** @param {string[]} args */
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' })
}

// Only when run directly, so importing this for its test tags nothing.
if (isMain(import.meta.filename)) {
  const { version } = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  )
  if (process.argv[2] === '--check') {
    // The tag name arrives in the environment, never on a command line.
    const tag = checkReleaseTag({ ref: process.env.GITHUB_REF_NAME, version })
    console.log(`${tag} matches package.json`)
  } else if (process.argv[2] === '--dist-tag') {
    // Printed alone, for `npm stage publish --tag "$(…)"` in publish.yml.
    console.log(distTag(version))
  } else {
    const { tag, skip } = tagRelease({ version })
    console.log(skip ? `release tag ${skip}` : `tagged and pushed ${tag}`)
  }
}
