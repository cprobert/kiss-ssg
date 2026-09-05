import fs from 'fs-extra'
import os from 'node:os'
import path from 'node:path'

// Creates an isolated site under the OS temp dir. Paths are returned with
// forward slashes because glob v7 (used by the engine) rejects backslashes.
export async function makeSite(files = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kiss-'))
  const root = dir.replace(/\\/g, '/')
  for (const [rel, content] of Object.entries(files)) {
    const body = typeof content === 'string' ? content : JSON.stringify(content)
    await fs.outputFile(path.join(dir, rel), body)
  }
  return {
    root,
    src: `${root}/src`,
    build: `${root}/public`,
    folders: { src: `${root}/src`, build: `${root}/public` },
    read: (rel) => fs.readFile(path.join(dir, rel), 'utf8'),
    exists: (rel) => fs.pathExists(path.join(dir, rel)),
    touch: (rel, content) => fs.outputFile(path.join(dir, rel), content),
    cleanup: () => fs.remove(dir),
  }
}

export async function waitFor(
  predicate,
  { timeout = 5000, interval = 25 } = {},
) {
  const start = Date.now()
  for (;;) {
    if (await predicate()) return
    if (Date.now() - start > timeout) throw new Error('waitFor: timed out')
    await new Promise((r) => setTimeout(r, interval))
  }
}
