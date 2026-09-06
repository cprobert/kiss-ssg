#!/usr/bin/env node
// Carries package.json's version into the Claude Code plugin manifests.
//
// Three files hold the same version: package.json, `.claude-plugin/marketplace.json`
// and `plugins/kiss-ssg/.claude-plugin/plugin.json`. `test/unit/plugin-manifests.test.js`
// asserts they agree — a marketplace advertising a version the plugin does not
// claim is the failure it exists to stop.
//
// That test is a good net and was a poor tripwire: it fires *after* a bump, at
// the gates, having let the operator get as far as committing. `npm version`
// runs this script through its `version` lifecycle hook — after package.json is
// rewritten, before anything is committed, and it fires even under
// `--no-git-tag-version` — so the manifests are already in step by the time the
// test looks. The test stays; it just stops being the thing that notices.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const MANIFESTS = [
  '.claude-plugin/marketplace.json',
  'plugins/kiss-ssg/.claude-plugin/plugin.json',
]

/**
 * Sets `version` wherever a manifest carries one — at the top level
 * (`plugin.json`) and on each entry of a `plugins` array (`marketplace.json`) —
 * and nowhere else. A manifest that carries no version is returned untouched
 * rather than given one, so this can never invent a field a schema did not ask
 * for.
 *
 * @param {any} manifest parsed manifest
 * @param {string} version the version to write
 * @returns {any} a new manifest; the input is not mutated
 */
export function withVersion(manifest, version) {
  const next = { ...manifest }
  if (typeof next.version === 'string') next.version = version
  if (Array.isArray(next.plugins))
    next.plugins = next.plugins.map((p) =>
      p && typeof p.version === 'string' ? { ...p, version } : p,
    )
  return next
}

/**
 * @param {{ root?: string, version?: string }} [options]
 * @returns {string[]} the manifests that changed
 */
export function syncPluginVersions({ root = ROOT, version } = {}) {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
  const target = version ?? pkg.version
  const changed = []
  for (const rel of MANIFESTS) {
    const file = path.join(root, rel)
    const before = readFileSync(file, 'utf8')
    const after = `${JSON.stringify(withVersion(JSON.parse(before), target), null, 2)}\n`
    if (after === before) continue
    writeFileSync(file, after)
    changed.push(rel)
  }
  return changed
}

// Only when run directly, so importing this for its test writes nothing.
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const changed = syncPluginVersions()
  const version = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  ).version
  console.log(
    changed.length
      ? `synced plugin manifests to ${version}: ${changed.join(', ')}`
      : `plugin manifests already at ${version}`,
  )
}
