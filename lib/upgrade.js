// `kiss-ssg upgrade`: install the running kiss-ssg into a site, check that it
// really landed, and print the CHANGELOG.md upgrade notes between the version
// the site had and this one. Every decision is here and pure; the bin gathers
// the facts, runs npm and prints (see AIKB/upgrade.md).
import { isWorkingTreeLink } from './check.js'

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/

/**
 * @typedef {Object} Version
 * @property {number} major
 * @property {number} minor
 * @property {number} patch
 * @property {string[]} pre the prerelease identifiers, empty for a release
 */

/**
 * A semver version, or `null` for anything else: a range (`^2.6.2`), a tag, a
 * `v` prefix, or the `unknown` `describeEngine` reports for an unreadable
 * manifest.
 *
 * @param {string|null|undefined} text
 * @returns {Version|null}
 */
export function parseVersion(text) {
  const match = VERSION.exec(text ?? '')
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    pre: match[4] ? match[4].split('.') : [],
  }
}

/**
 * Semver precedence, so it sorts: a prerelease comes before its release,
 * numeric identifiers compare as numbers and before alphanumeric ones, and a
 * shorter list of identifiers comes first when the rest are equal
 * (`2.0.0-alpha.2 < 2.0.0-alpha.10 < 2.0.0-beta < 2.0.0-beta.0 < 2.0.0`).
 * No semver package is a dependency, and the changelog's headings are the
 * test of this one.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} negative, zero or positive
 */
export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) throw new TypeError(`not a version: ${x ? b : a}`)
  for (const key of /** @type {const} */ (['major', 'minor', 'patch']))
    if (x[key] !== y[key]) return x[key] - y[key]
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length
  for (let i = 0; i < Math.min(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === q) continue
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) - Number(q)
    if (pn !== qn) return pn ? -1 : 1
    return p < q ? -1 : 1
  }
  return x.pre.length - y.pre.length
}

/**
 * @typedef {Object} Note
 * @property {string} heading `Upgrading`, or `Upgrading: <topic>`
 * @property {string} text everything under it, to the next `###` or `##`
 */

/**
 * @typedef {Object} Entry
 * @property {string} version
 * @property {string} date
 * @property {Note[]} notes the entry's `### Upgrading` sections, in order
 * @property {boolean} nothingToChange it has `### Nothing for a site to change`
 */

const ENTRY = /^## (\S+) — (\S+)\s*$/
const NOTE = /^### (Upgrading(?:: .+)?)\s*$/
const NOTHING = /^### Nothing for a site to change\s*$/

/**
 * Every `## <version> — <date>` entry in a CHANGELOG.md, in the file's order,
 * with its upgrade notes. This is the one parser of the note shape: the
 * changelog's own test imports it rather than keeping a second regex. A
 * heading inside a fenced block is text, not a heading.
 *
 * @param {string} text
 * @returns {Entry[]}
 */
export function changelogEntries(text) {
  /** @type {Entry[]} */
  const entries = []
  /** @type {{ heading: string, lines: string[] }|null} */
  let note = null
  let fenced = false
  const close = () => {
    if (note)
      entries[entries.length - 1].notes.push({
        heading: note.heading,
        text: note.lines.join('\n').trim(),
      })
    note = null
  }
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
    const entry = !fenced && ENTRY.exec(line)
    const current = entries[entries.length - 1]
    if (entry && parseVersion(entry[1])) {
      close()
      entries.push({
        version: entry[1],
        date: entry[2],
        notes: [],
        nothingToChange: false,
      })
      continue
    }
    if (!current || fenced) {
      if (note) note.lines.push(line)
      continue
    }
    const heading = NOTE.exec(line)
    if (heading) {
      close()
      note = { heading: heading[1], lines: [] }
    } else if (/^##{1,2} /.test(line)) {
      close()
      if (NOTHING.test(line)) current.nothingToChange = true
    } else if (note) note.lines.push(line)
  }
  close()
  return entries
}

/**
 * The upgrade notes a site moving from `from` to `to` has to read: every note
 * of every entry after `from`, up to and including `to`, oldest first. An
 * entry in that range with no note is named in `quiet`, so the output can say
 * how many releases had nothing to change. `from` may be a version the
 * changelog never mentions; `null` (the starting version is not known) takes
 * every entry up to `to`.
 *
 * @param {string} text the CHANGELOG.md of the version being installed
 * @param {string|null} from
 * @param {string} to
 * @returns {{ notes: (Note & { version: string, date: string })[], quiet: string[] }}
 */
export function upgradeNotes(text, from, to) {
  const inRange = changelogEntries(text)
    .filter(
      (e) =>
        (from === null || compareVersions(e.version, from) > 0) &&
        compareVersions(e.version, to) <= 0,
    )
    .sort((a, b) => compareVersions(a.version, b.version))
  return {
    notes: inRange.flatMap((e) =>
      e.notes.map((n) => ({ version: e.version, date: e.date, ...n })),
    ),
    quiet: inRange.filter((e) => e.notes.length === 0).map((e) => e.version),
  }
}

/**
 * The lowest version a plain range in `package.json` allows (`^2.6.2`,
 * `~2.7.0`, `2.8.0`, `>=2.5.0`), or `null` for anything it cannot read that
 * from: a `file:` link, a URL, a tag, a compound range.
 *
 * @param {string|null|undefined} spec
 * @returns {string|null}
 */
export function specFloor(spec) {
  const match = /^(?:\^|~|>=)?\s*(\S+)$/.exec(spec ?? '')
  return match && parseVersion(match[1]) ? match[1] : null
}

/**
 * Whether a plain `package.json` range lets npm install `version`: `^` keeps
 * the major (and the minor below 1.0.0), `~` the minor, an exact pin only
 * itself, `>=` anything from its floor. Anything `specFloor` cannot read (a
 * `file:` link, a URL, a tag) allows nothing, because npm would not install
 * this release from the registry for it.
 *
 * @param {string|null|undefined} spec
 * @param {string} version
 * @returns {boolean}
 */
export function specAllows(spec, version) {
  const floor = specFloor(spec)
  const v = parseVersion(version)
  const f = parseVersion(floor)
  if (!floor || !v || !f || compareVersions(version, floor) < 0) return false
  const op = /^(\^|~|>=)?/.exec(spec ?? '')?.[1] ?? ''
  if (op === '>=') return true
  if (op === '~') return v.major === f.major && v.minor === f.minor
  if (op === '^')
    return f.major > 0
      ? v.major === f.major
      : v.major === 0 && v.minor === f.minor
  return compareVersions(version, floor) === 0
}

export const UPGRADE_HELP = `kiss-ssg upgrade [--plan] [--from <version>] [--json]

  Install this kiss-ssg into the site in this folder, check that it landed,
  and print the CHANGELOG.md upgrade notes between the version the site had and
  this one. Run it by version, so npx fetches the one you mean rather than the
  site's own older copy, which has no upgrade command:

    npx kiss-ssg@latest upgrade --plan     read the notes first
    npx kiss-ssg@latest upgrade            install, verify, print the notes

  It installs kiss-ssg@<this version> into the section package.json already
  uses (devDependencies when neither), which replaces a file: link, a URL or a
  git dependency. It then checks that node_modules/kiss-ssg is not a link to a
  working tree, is this version, and that package-lock.json resolves it from
  the registry npm is configured for.

  It refuses, and writes nothing, when there is no package.json or when the
  installed kiss-ssg is a registry release newer than this one. It will not
  install when the site uses pnpm, yarn or an npm-shrinkwrap.json, when it is
  an npm workspace member, when npm cannot say which registry it uses, when
  package.json or package-lock.json has uncommitted changes, or when git fails;
  --plan still prints the notes then, and says why the install is blocked.

  --plan             print the notes and what it would run; install nothing
  --from <version>   the version the site was on, when it cannot tell: a link
                     to a working tree, or a site already upgraded by npm
                     update. It changes which notes print, never what installs
  --json             print { from, to, install, verified, notes, ... }
  --help             this text

Exits 1 when it refused, npm failed, or the check after the install failed.`

/**
 * @typedef {Object} UpgradeArgs
 * @property {boolean} plan
 * @property {boolean} json
 * @property {string|null} from
 * @property {boolean} help
 * @property {string|null} error a usage error: print it with the help, exit 1
 */

/**
 * @param {string[]} argv the arguments after `upgrade`
 * @returns {UpgradeArgs}
 */
export function parseUpgradeArgs(argv = []) {
  /** @type {UpgradeArgs} */
  const args = {
    plan: false,
    json: false,
    from: null,
    help: false,
    error: null,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--plan') args.plan = true
    else if (arg === '--json') args.json = true
    else if (arg === '--help' || arg === '-h') args.help = true
    else if (arg === '--from') {
      const value = argv[++i] ?? null
      if (!parseVersion(value))
        return {
          ...args,
          error: '--from needs a version: kiss-ssg upgrade --from 2.6.2',
        }
      args.from = value
    } else if (arg.startsWith('-'))
      return { ...args, error: `unknown option: ${arg}` }
    else return { ...args, error: `upgrade takes no script or name: ${arg}` }
  }
  return args
}

/**
 * @typedef {Object} LockFacts
 * @property {string} path the lockfile, relative to the site's folder
 * @property {{ version?: string, resolved?: string, link?: boolean }|null} entry
 *   its entry for the engine, `null` when it has none
 */

/**
 * @typedef {Object} UpgradeFacts
 * @property {{ version: string, changelog: string }} own the running kiss-ssg
 * @property {UpgradeArgs} args
 * @property {{ found: boolean, section: 'dependencies'|'devDependencies'|null, spec: string|null }} pkg
 * @property {ReturnType<typeof import('./check.js').describeEngine>} engine
 * @property {LockFacts|null} lock `null`: no package-lock.json above the site
 * @property {string|null} committedLockVersion the engine's version in the
 *   lockfile as committed at HEAD, `null` when unknown
 * @property {string|null} otherLockfile a pnpm or yarn lockfile, when there is one
 * @property {{ state: 'clean'|'not-a-repo' } | { state: 'dirty', files: string[] } | { state: 'error', said: string }} git
 *   what git says about package.json and the lockfile
 * @property {string|null} registry `npm config get registry`, run in the
 *   project npm resolves; `null` when npm could not answer
 * @property {string|null} [registryError] npm's first line when it could not
 */

/**
 * @typedef {Object} UpgradePlan
 * @property {string|null} from the version the site was on, `null` when unknown
 * @property {string} fromSource where `from` came from, for the output
 * @property {string} to
 * @property {{ args: string[] }|null} install the npm arguments, or `null`
 * @property {string|null} refuse why it will not run; nothing is written
 * @property {string|null} blocked why an install would refuse; under `--plan`
 *   the notes still print, because reading writes nothing
 * @property {string[]} warnings
 * @property {(Note & { version: string, date: string })[]} notes
 * @property {string[]} quiet versions in range with nothing to change
 */

/**
 * Whether a lockfile entry is a package from `registry`: no link, not a
 * `file:` path, and a tarball under the registry's own URL. A GitHub tarball
 * is an `https:` URL too, which is why "https:" is not the test (the
 * critique, measured on the fleet, 2026-11-01).
 *
 * @param {LockFacts['entry']} entry
 * @param {string|null} registry `null` (npm could not say) matches nothing
 */
function fromRegistry(entry, registry) {
  if (!registry) return false
  const base = registry.endsWith('/') ? registry : `${registry}/`
  return Boolean(
    entry &&
    !entry.link &&
    entry.resolved &&
    !entry.resolved.startsWith('file:') &&
    entry.resolved.startsWith(base),
  )
}

/**
 * Whether the lockfile pins `version` from `registry`. Where it comes from is
 * half the answer: a lockfile that still pins the old release puts it back on
 * the next `npm ci`, whatever node_modules holds now (Codex, 2026-11-01).
 *
 * @param {LockFacts['entry']} entry
 * @param {string|null} registry
 * @param {string} version
 */
function lockedAt(entry, registry, version) {
  return fromRegistry(entry, registry) && entry?.version === version
}

/**
 * What `kiss-ssg upgrade` will do, from facts the bin gathered. Pure: it
 * neither reads nor writes anything.
 *
 * @param {UpgradeFacts} facts
 * @returns {UpgradePlan}
 */
export function planUpgrade(facts) {
  const to = facts.own.version
  const linked = isWorkingTreeLink(facts.engine)
  const installed =
    facts.engine && !linked
      ? parseVersion(facts.engine.version) && facts.engine.version
      : null
  /** @type {string[]} */
  const warnings = []
  const lockVersion = facts.lock?.entry?.version ?? null

  // Where the site started: the person's word, then what is installed, then
  // what was committed (a site npm already moved), then what package.json
  // asks for. A working-tree link is never a starting point: its version is
  // a tree's, not a release (the critique's blocker, 2026-11-01).
  /** @type {string|null} */
  let from = null
  let fromSource = 'unknown'
  if (facts.args.from) {
    from = facts.args.from
    fromSource = '--from'
  } else if (installed) {
    from = installed
    fromSource = 'installed'
    const committed = facts.committedLockVersion
    if (installed === to && parseVersion(committed) && committed !== to) {
      from = /** @type {string} */ (committed)
      fromSource = 'the committed package-lock.json'
    }
  } else if (!linked && specFloor(facts.pkg.spec)) {
    from = specFloor(facts.pkg.spec)
    fromSource = 'package.json'
  }

  if (installed && lockVersion && lockVersion !== installed)
    warnings.push(
      `node_modules has kiss-ssg ${installed} but ${facts.lock?.path} says ${lockVersion}: the notes start from what is installed`,
    )
  const spec = facts.pkg.spec ?? ''
  if (spec && !specFloor(spec))
    warnings.push(
      `this replaces package.json's kiss-ssg ${spec} with a registry version`,
    )
  // A tree's version is not a release, so it is never `from`; but it is the
  // first --from an agent reaches for (the 2026-11-01 clean room), so say it.
  const treeVersion =
    linked && parseVersion(facts.engine?.version) ? facts.engine?.version : null
  if (from === null)
    warnings.push(
      linked
        ? `kiss-ssg is a link to ${facts.engine?.target}, so the version it started from is unknown and every note up to ${to} is printed. ${treeVersion ? `The tree it links to says ${treeVersion}: if the site was last built against that, pass --from ${treeVersion}` : 'Pass --from <version> to start from the version the site was built against'}`
        : `the version the site started from is unknown, so every note up to ${to} is printed: pass --from <version> to narrow them`,
    )

  /** @param {string} reason */
  const refusal = (reason) => ({
    from,
    fromSource,
    to,
    install: null,
    refuse: reason,
    blocked: null,
    warnings,
    notes: [],
    quiet: [],
  })
  if (!facts.pkg.found)
    return refusal(
      'there is no package.json here: run npx kiss-ssg init to set a site up',
    )
  if (installed && compareVersions(installed, to) > 0)
    return refusal(
      `the installed kiss-ssg ${installed} is newer than ${to}: this is not an upgrade. Run npm install kiss-ssg@${to} yourself if a downgrade is meant`,
    )
  // These protect what the install writes, so they stop the install and
  // never the reading: `--plan` is the recovery after `npm update` broke a
  // build, which is exactly when the lockfile is uncommitted (Codex, on the
  // branch's adversarial review, 2026-11-01).
  /** @type {string|null} */
  let blocked = null
  // Unknown is a reason not to install, never a default: substituting npmjs
  // failed a private registry's correct lockfile (Codex review, 2026-11-01).
  if (!facts.registry && /ENOWORKSPACES/.test(facts.registryError ?? ''))
    blocked = `this folder is an npm workspace member (npm config answers ENOWORKSPACES), and upgrade drives a standalone package only: run npm install kiss-ssg@${to} -w <this package> from the workspace's root, then npx kiss-ssg@${to} upgrade --plan --from <old version> here for the notes`
  else if (!facts.registry)
    blocked = `npm could not say which registry it installs from (${facts.registryError ?? 'no answer'}), so the install could not be checked: run npm install kiss-ssg@${to} --save-dev yourself`
  else if (facts.otherLockfile === 'npm-shrinkwrap.json')
    blocked = `this site has an npm-shrinkwrap.json, which npm installs from in preference to package-lock.json, and upgrade neither guards nor verifies it: run npm install kiss-ssg@${to} --save-dev yourself and check npm-shrinkwrap.json pins ${to}`
  else if (facts.otherLockfile && !facts.lock)
    blocked = `this site uses ${facts.otherLockfile}, and upgrade drives npm only: install kiss-ssg@${to} with that package manager, then run npx kiss-ssg@${to} upgrade --plan --from <old version> for the notes`
  else if (facts.git.state === 'error')
    blocked = `git could not say whether package.json and the lockfile are committed (${facts.git.said}); fix that first, so the upgrade's diff can be reviewed and reverted`
  else if (facts.git.state === 'dirty')
    blocked = `uncommitted changes in ${facts.git.files.join(' and ')}: commit or revert them first, so the upgrade is the only change in those files`
  if (blocked && !facts.args.plan) return refusal(blocked)

  /** @type {UpgradePlan['notes']} */
  let notes = []
  /** @type {string[]} */
  let quiet = []
  if (from && parseVersion(from)?.major === 1) {
    warnings.push(
      `kiss-ssg ${from} is v1: follow node_modules/kiss-ssg/GUIDE.md § Migrating from v1 and examples/9-migrated-from-v1 rather than the v2 notes`,
    )
  } else ({ notes, quiet } = upgradeNotes(facts.own.changelog, from, to))

  const current =
    // All three places a version lives agree, or the next npm ci or npm
    // install moves it (Codex, second pass, 2026-11-01).
    installed === to &&
    lockedAt(facts.lock?.entry ?? null, facts.registry, to) &&
    specAllows(facts.pkg.spec, to)
  const args = [
    'install',
    `kiss-ssg@${to}`,
    facts.pkg.section === 'dependencies' ? '--save-prod' : '--save-dev',
  ]
  if (parseVersion(to)?.pre.length) args.push('--save-exact')
  return {
    from,
    fromSource,
    to,
    install: current || blocked ? null : { args },
    refuse: null,
    blocked,
    warnings,
    notes,
    quiet,
  }
}

/**
 * @typedef {Object} Check
 * @property {boolean|null} ok `null`: could not be checked
 * @property {string} what
 * @property {string} [fix]
 */

/**
 * The check after the install, which is the reason the command installs at
 * all: a `file:` link survives a plain `npm install` (six of six sites on the
 * 2.5.0 upgrade), so "npm exited 0" is not "the site now builds against the
 * release".
 *
 * @param {{ engine: UpgradeFacts['engine'], lock: LockFacts|null, registry: string|null, savedSpec?: string|null }} after
 * @param {string} to
 * @returns {{ ok: boolean, checks: Check[] }}
 */
export function verifyUpgrade(after, to) {
  const reinstall = `rm -rf node_modules/kiss-ssg, then npm install kiss-ssg@${to} --save-dev`
  const linked = isWorkingTreeLink(after.engine)
  /** @type {Check[]} */
  const checks = []
  if (!after.engine)
    checks.push({
      ok: false,
      what: 'no node_modules/kiss-ssg after the install',
      fix: `npm install kiss-ssg@${to} --save-dev`,
    })
  else if (linked)
    checks.push({
      ok: false,
      what: `node_modules/kiss-ssg is still a link to ${after.engine.target}`,
      fix: reinstall,
    })
  else if (after.engine.version !== to)
    checks.push({
      ok: false,
      what: `node_modules/kiss-ssg is ${after.engine.version}, not ${to}`,
      fix: reinstall,
    })
  else
    checks.push({
      ok: true,
      what: `node_modules/kiss-ssg is ${to}, not a link`,
    })

  if (!after.lock)
    checks.push({ ok: null, what: 'no package-lock.json: not checked' })
  else if (!after.lock.entry)
    checks.push({
      ok: false,
      what: `${after.lock.path} has no entry for kiss-ssg`,
      fix: `npm install kiss-ssg@${to} --save-dev`,
    })
  else if (!fromRegistry(after.lock.entry, after.registry))
    checks.push({
      ok: false,
      what: `${after.lock.path} resolves kiss-ssg from ${after.lock.entry.link ? 'a link' : after.lock.entry.resolved}, not ${after.registry}`,
      fix: reinstall,
    })
  else if (!lockedAt(after.lock.entry, after.registry, to))
    checks.push({
      ok: false,
      what: `${after.lock.path} pins kiss-ssg ${after.lock.entry.version ?? '(no version)'}, not ${to}: the next npm ci would put it back`,
      fix: `npm install kiss-ssg@${to} --save-dev`,
    })
  else
    checks.push({
      ok: true,
      what: `${after.lock.path} pins kiss-ssg ${to} from ${after.registry}`,
    })
  if (after.savedSpec !== undefined)
    checks.push(
      specAllows(after.savedSpec, to)
        ? { ok: true, what: `package.json asks for ${after.savedSpec}` }
        : {
            ok: false,
            what: `package.json asks for ${after.savedSpec ?? 'no kiss-ssg'}, which does not install ${to}`,
            fix: `npm install kiss-ssg@${to} --save-dev`,
          },
    )
  return { ok: checks.every((c) => c.ok !== false), checks }
}

/**
 * The human-readable output: the move, what ran, the checks, the notes, and
 * the next step.
 *
 * @param {UpgradePlan} plan
 * @param {{ ran: string|null, verified: ReturnType<typeof verifyUpgrade>|null }|null} result
 *   `null` for `--plan`, or a run that installed nothing
 * @returns {string}
 */
export function formatUpgrade(plan, result) {
  const lines = [
    `kiss-ssg ${plan.from ?? '(unknown)'} → ${plan.to}${plan.from ? ` (from ${plan.fromSource})` : ''}`,
  ]
  // Everything the command says starts in column one, and the checks come
  // last, beside the next step: an agent that filtered out indented lines to
  // skip the notes dropped the verdict with them (the 2026-11-01 arms).
  for (const warning of plan.warnings) lines.push(`note: ${warning}`)
  if (plan.refuse)
    return [...lines, `kiss-ssg upgrade: ${plan.refuse}`].join('\n')
  if (plan.blocked) lines.push(`install blocked: ${plan.blocked}`)
  else if (!plan.install)
    lines.push('already on this version from the registry: nothing to install')
  else if (!result?.ran)
    lines.push(`would run: npm ${plan.install.args.join(' ')}`)
  else lines.push(`ran: ${result.ran}`)
  if (
    plan.notes.length === 0 &&
    plan.quiet.length === 0 &&
    !plan.warnings.some((w) => w.includes('v1'))
  )
    lines.push('', 'No releases between the two versions.')
  for (const note of plan.notes)
    lines.push('', `## ${note.version} — ${note.heading}`, '', note.text)
  if (plan.quiet.length)
    lines.push(
      '',
      `${plan.quiet.length} other release${plan.quiet.length === 1 ? '' : 's'} with nothing to change: ${plan.quiet.join(', ')}`,
    )
  const checks = result?.verified?.checks ?? []
  if (checks.length) lines.push('')
  for (const check of checks)
    lines.push(
      `${check.ok === null ? '?' : check.ok ? 'ok' : 'FAILED'}: ${check.what}${check.fix ? ` — fix: ${check.fix}` : ''}`,
    )
  lines.push(
    '',
    'Next: run `npx kiss-ssg check <script> --summary` before changing anything, and work the notes above.',
  )
  return lines.join('\n')
}
