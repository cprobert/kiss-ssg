#!/usr/bin/env node
// Generates `types/` — the TypeScript declarations an editor or an AI agent
// reads when a site does `import Kiss from 'kiss-ssg'` — from the JSDoc in
// `lib/`. The engine stays plain JavaScript; nothing here compiles it.
//
// Run it as `npm run types` after any JSDoc edit. `test/unit/types.test.js`
// re-runs it into a temp folder and byte-compares, so a forgotten run fails the
// suite rather than shipping a stale declaration.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export const ROOT = path.resolve(import.meta.dirname, '..')
export const TSCONFIG = path.join(ROOT, 'tsconfig.types.json')
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')

// A name that is not a valid identifier — `module.exports` — inside an export
// clause, with the quotes that make it legal missing.
const UNQUOTED_STRING_EXPORT =
  /(\bas\s+)([A-Za-z_$][\w$]*(?:\.[\w$]+)+)(\s*[,}])/g

// TypeScript's declaration emitter drops the quotes from an arbitrary module
// namespace name when it reads the export out of a *JavaScript* file (from a
// `.ts` source they survive). So `export { Kiss as 'module.exports' }` — the
// line that makes `require('kiss-ssg')` return the class rather than a module
// namespace on Node ≥22.12 — is emitted as `export { Kiss as module.exports }`,
// which does not parse. Putting the quotes back is the whole of this fixup.
export function quoteStringExportNames(declaration) {
  return declaration.replace(
    UNQUOTED_STRING_EXPORT,
    (_, as, name, tail) => `${as}'${name}'${tail}`,
  )
}

export function emitTypes({ outDir } = {}) {
  const target = outDir ? path.resolve(outDir) : path.join(ROOT, 'types')
  const result = spawnSync(
    process.execPath,
    [TSC, '-p', TSCONFIG, '--outDir', target],
    { cwd: ROOT, encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error(
      `tsc failed (${result.status}):\n${result.error?.message ?? ''}${result.stdout ?? ''}${result.stderr ?? ''}`.trim(),
    )
  const files = fs
    .readdirSync(target)
    .filter((f) => f.endsWith('.d.ts'))
    .sort()
  for (const file of files) {
    const at = path.join(target, file)
    const source = fs.readFileSync(at, 'utf8')
    const fixed = quoteStringExportNames(source)
    if (fixed !== source) fs.writeFileSync(at, fixed)
  }
  return { outDir: target, files }
}

if (import.meta.filename === process.argv[1]) {
  const { outDir, files } = emitTypes()
  console.log(`${files.length} declarations → ${path.relative(ROOT, outDir)}/`)
}
