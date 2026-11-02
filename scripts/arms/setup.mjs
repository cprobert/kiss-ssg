// `arms.mjs setup`: one arm's copy of a site, ready for a headless session.
//
// The order is the decision, and the test pins it:
//  1. resolve the site commit and the plugin ref to shas, read whether this
//     repository's plugin folder (and whole tree, for the engine) is dirty, and
//     ask `claude --version`: all reads, before anything is written;
//  2. `git -C <site> archive <sha>` into <out>/<arm>/site, so the real site is
//     read through its object store only and its working tree never touched;
//  3. `git archive` of this repository's plugin at the recorded sha into
//     <out>/<arm>/plugin-tree, never a live directory, so an arm's plugin is a
//     commit someone can name;
//  4. `git init` in the copy and a baseline commit, with node_modules and the
//     npm cache excluded through .git/info/exclude (the site's own files stay
//     exactly as committed): "fixed on the site" is a diff against it, and a
//     commit the arm made shows as a commit after it;
//  5. the site's own dependencies (`npm ci` with a lockfile, `npm install`
//     without one) BEFORE the engine, so the engine tarball is what stays in
//     node_modules/kiss-ssg;
//  6. the engine: the given tarball, or `npm pack` of this repository's
//     working tree into the arm folder, installed with --no-save so the
//     site's package.json and lockfile stay as committed;
//  7. arm.json, the record of all of it.
// Every npm command runs with the arm's own cache (npm_config_cache).
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** @typedef {import('./runner.mjs').Runner} Runner */

export class ArmsSetupError extends Error {}

/**
 * Whether `child` is `parent` or inside it, by path segments.
 *
 * @param {string} parent
 * @param {string} child
 */
export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

/**
 * The lockfile npm would install from, by npm's precedence, or null.
 *
 * @param {string} dir
 * @returns {string|null}
 */
export function lockfileIn(dir) {
  for (const name of ['npm-shrinkwrap.json', 'package-lock.json'])
    if (fs.existsSync(path.join(dir, name))) return name
  return null
}

/**
 * npm's integrity string for a file: `sha512-<base64>`.
 *
 * @param {string} file
 */
export function sha512Of(file) {
  return `sha512-${crypto.createHash('sha512').update(fs.readFileSync(file)).digest('base64')}`
}

/**
 * @param {Runner} runner
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string,string> }} [opts]
 */
async function must(runner, cmd, args, opts = {}) {
  const r = await runner.exec(cmd, args, opts)
  if (r.status !== 0)
    throw new ArmsSetupError(
      `${cmd} ${args.join(' ')} failed (exit ${r.status}): ${(r.error?.message ?? '') + r.stderr.trim()}`,
    )
  return r.stdout.trim()
}

/**
 * @param {{
 *   site: string, commit: string, arm: string, pluginRef: string,
 *   pluginPath?: string, engine?: string|null, out: string, model?: string|null,
 *   repo: string, runner: Runner, log?: (line: string) => void,
 *   now?: () => Date,
 * }} options
 * @returns {Promise<Record<string, any>>} the arm.json record
 */
export async function setupArm({
  site,
  commit,
  arm,
  pluginRef,
  pluginPath = 'plugins/kiss-ssg',
  engine = null,
  out,
  model = null,
  repo,
  runner,
  log = () => {},
  now = () => new Date(),
}) {
  const siteRepo = path.resolve(site)
  const armDir = path.resolve(out, arm)
  if (isInside(siteRepo, armDir))
    throw new ArmsSetupError(
      `--out puts the arm inside the site repository (${siteRepo}); the real site is only ever read`,
    )
  if (isInside(repo, armDir))
    throw new ArmsSetupError(
      `--out puts the arm inside this repository (${repo}); use a scratch folder`,
    )
  if (fs.existsSync(armDir) && fs.readdirSync(armDir).length)
    throw new ArmsSetupError(`${armDir} already exists and is not empty`)
  if (engine && !fs.existsSync(engine))
    throw new ArmsSetupError(`--engine ${engine} does not exist`)

  // 1. Reads only.
  const siteSha = await must(runner, 'git', [
    '-C',
    siteRepo,
    'rev-parse',
    '--verify',
    `${commit}^{commit}`,
  ])
  const pluginSha = await must(runner, 'git', [
    '-C',
    repo,
    'rev-parse',
    '--verify',
    `${pluginRef}^{commit}`,
  ])
  const pluginDirty =
    (await must(runner, 'git', [
      '-C',
      repo,
      'status',
      '--porcelain',
      '--',
      pluginPath,
    ])) !== ''
  const repoDirty =
    (await must(runner, 'git', ['-C', repo, 'status', '--porcelain'])) !== ''
  const version = await runner.exec('claude', ['--version'])
  const claudeCodeVersion = version.status === 0 ? version.stdout.trim() : null
  log(`site ${siteRepo} at ${siteSha}; plugin ${pluginRef} = ${pluginSha}`)

  const copy = path.join(armDir, 'site')
  const pluginTree = path.join(armDir, 'plugin-tree')
  const npmCache = path.join(armDir, 'npm-cache')
  for (const dir of [copy, pluginTree, npmCache])
    fs.mkdirSync(dir, { recursive: true })
  const npmEnv = { npm_config_cache: npmCache }

  // 2. The site, from its object store. tar gets no path argument (it runs
  // in the folder it extracts into), so GNU tar never reads C: as a host.
  const extract = async (
    /** @type {string} */ from,
    /** @type {string[]} */ args,
    /** @type {string} */ into,
  ) => {
    const r = await runner.pipe(
      { cmd: 'git', args: ['-C', from, 'archive', '--format=tar', ...args] },
      { cmd: 'tar', args: ['-xf', '-'], cwd: into },
    )
    if (r.status !== 0)
      throw new ArmsSetupError(
        `git archive ${args.join(' ')} | tar failed: ${r.stderr.trim()}`,
      )
  }
  log(`copying the site into ${copy}`)
  await extract(siteRepo, [siteSha], copy)

  // 3. The plugin, from a recorded sha.
  log(`copying ${pluginPath} at ${pluginSha}`)
  await extract(repo, [pluginSha, '--', pluginPath], pluginTree)
  const pluginDir = path.join(pluginTree, ...pluginPath.split('/'))

  // 4. The baseline.
  const git = (/** @type {string[]} */ args) =>
    must(runner, 'git', [
      '-C',
      copy,
      '-c',
      'user.name=kiss-arms',
      '-c',
      'user.email=arms@kiss-ssg.invalid',
      ...args,
    ])
  await git(['init', '--quiet', '--initial-branch=arm'])
  fs.appendFileSync(
    path.join(copy, '.git', 'info', 'exclude'),
    '\nnode_modules/\n',
  )
  await git(['add', '--all'])
  await git(['commit', '--quiet', '-m', `baseline: ${siteRepo} at ${siteSha}`])
  const baseline = await git(['rev-parse', 'HEAD'])

  // 5. The site's own dependencies.
  const lockfile = lockfileIn(copy)
  const hasPackage = fs.existsSync(path.join(copy, 'package.json'))
  // Without a lockfile, nothing is written back: the copy stays as committed.
  const depsArgs = lockfile
    ? ['ci']
    : hasPackage
      ? ['install', '--no-save', '--no-package-lock']
      : null
  if (depsArgs) {
    log(`npm ${depsArgs.join(' ')} in the copy`)
    await must(runner, 'npm', depsArgs, { cwd: copy, env: npmEnv })
  }

  // 6. The engine.
  let tarball = engine ? path.resolve(engine) : null
  if (!tarball) {
    log(`npm pack of ${repo}`)
    const packed = await must(
      runner,
      'npm',
      ['pack', '--json', '--ignore-scripts', '--pack-destination', armDir],
      { cwd: repo, env: npmEnv },
    )
    const json = JSON.parse(packed.slice(packed.indexOf('[')))
    tarball = path.join(armDir, json[0].filename)
  }
  const engineSha512 = sha512Of(tarball)
  log(`npm install ${tarball} --no-save in the copy`)
  await must(runner, 'npm', ['install', tarball, '--no-save'], {
    cwd: copy,
    env: npmEnv,
  })
  // 7. The record.
  const record = {
    schema: 1,
    arm,
    createdAt: now().toISOString(),
    site: { repo: siteRepo, commitRequested: commit, commit: siteSha, copy },
    baseline,
    plugin: {
      repo,
      ref: pluginRef,
      sha: pluginSha,
      path: pluginPath,
      dirty: pluginDirty,
      dir: pluginDir,
    },
    engine: {
      tarball,
      sha512: engineSha512,
      packedFrom: engine ? null : repo,
      packedTreeDirty: engine ? null : repoDirty,
      install: 'npm install <tarball> --no-save',
    },
    deps: { lockfile, command: depsArgs ? `npm ${depsArgs.join(' ')}` : null },
    npmCache,
    claudeCodeVersion,
    model,
    browser: {
      playwright: ['playwright', 'playwright-core'].some((name) =>
        fs.existsSync(path.join(copy, 'node_modules', name)),
      ),
    },
  }
  fs.writeFileSync(
    path.join(armDir, 'arm.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  )
  return record
}
