// The one place scripts/arms.mjs starts another process. setup, run and
// summarise take a runner as a parameter, so their tests inject a fake one and
// never start git, npm, tar or claude; this is the real one.
//
// Three shapes, because the harness needs three:
//  - exec: run, wait, hand back status and output (git, npm, claude --version);
//  - pipe: one command's stdout into another's stdin (git archive | tar -x);
//  - stream: a long run whose stdin is a file and whose stdout and stderr are
//    files the child writes to directly, so a transcript is on disk as it
//    arrives and an interrupted arm keeps everything up to the interrupt.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { needsShell } from '../gates.mjs'

/**
 * @typedef {{ cmd: string, args: string[], cwd?: string, env?: Record<string,string> }} Command
 * @typedef {{ status: number|null, stdout: string, stderr: string, error?: Error }} ExecResult
 * @typedef {{
 *   exec(cmd: string, args: string[], opts?: { cwd?: string, env?: Record<string,string> }): Promise<ExecResult>,
 *   pipe(from: Command, to: Command): Promise<{ status: number|null, stderr: string }>,
 *   stream(cmd: string, args: string[], opts: { cwd: string, env?: Record<string,string>, stdinFile: string, stdoutFile: string, stderrFile: string }): Promise<{ status: number|null }>,
 * }} Runner
 */

// cmd.exe quoting, for the npm/npx shims Node can only start through a shell
// on Windows: a word with a space or a cmd metacharacter is double-quoted, an
// embedded quote doubled.
/** @param {string} word */
export function cmdQuote(word) {
  const text = String(word)
  if (text !== '' && !/[\s"&|<>^()%!]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * How a command is spawned on this platform: the npm shims through a shell
 * with their arguments quoted for it, everything else directly.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {NodeJS.Platform} [platform]
 * @returns {{ cmd: string, args: string[], shell: boolean }}
 */
export function spawnShape(cmd, args, platform = process.platform) {
  if (!needsShell(cmd, platform)) return { cmd, args, shell: false }
  return { cmd, args: args.map(cmdQuote), shell: true }
}

/** @returns {Runner} */
export function realRunner() {
  const start = (/** @type {Command} */ c, /** @type {any} */ stdio) => {
    const shape = spawnShape(c.cmd, c.args)
    return spawn(shape.cmd, shape.args, {
      cwd: c.cwd,
      env: { ...process.env, ...(c.env ?? {}) },
      shell: shape.shell,
      stdio,
      windowsHide: true,
    })
  }
  return {
    exec(cmd, args, opts = {}) {
      return new Promise((resolve) => {
        const child = start({ cmd, args, ...opts }, ['ignore', 'pipe', 'pipe'])
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        child.on('error', (error) =>
          resolve({ status: null, stdout, stderr, error }),
        )
        child.on('close', (status) => resolve({ status, stdout, stderr }))
      })
    },
    pipe(from, to) {
      return new Promise((resolve) => {
        const a = start(from, ['ignore', 'pipe', 'pipe'])
        const b = start(to, ['pipe', 'ignore', 'pipe'])
        let stderr = ''
        a.stderr.on('data', (d) => (stderr += d))
        b.stderr.on('data', (d) => (stderr += d))
        a.stdout.pipe(b.stdin)
        let left = 2
        /** @type {number|null} */
        let status = 0
        const done = (/** @type {number|null} */ code) => {
          if (code !== 0 && status === 0) status = code
          if (--left === 0) resolve({ status, stderr })
        }
        a.on('error', (e) => ((stderr += e.message), done(null)))
        b.on('error', (e) => ((stderr += e.message), done(null)))
        a.on('close', done)
        b.on('close', done)
      })
    },
    stream(cmd, args, { cwd, env, stdinFile, stdoutFile, stderrFile }) {
      return new Promise((resolve) => {
        const fds = [
          fs.openSync(stdinFile, 'r'),
          fs.openSync(stdoutFile, 'w'),
          fs.openSync(stderrFile, 'w'),
        ]
        const close = () => fds.forEach((fd) => fs.closeSync(fd))
        const child = start({ cmd, args, cwd, env }, fds)
        child.on('error', (error) => {
          fs.writeSync(fds[2], `${error.message}\n`)
          close()
          resolve({ status: null })
        })
        child.on('close', (status) => {
          close()
          resolve({ status })
        })
      })
    },
  }
}
