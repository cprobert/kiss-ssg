# Architecture review, 2026-11-09

Read-only review of kiss-ssg 2.14.0 at `0ab9c7e`. No engine, test or doc file was changed; this
report is the only file written.

**The decision line in the request was left as the placeholder**, so the verdict below is given
against all three of its examples: where to spend the next three months, whether the project is
ready for a second maintainer, and whether to open it to outside contributors.

Every finding is marked **measured** (a command was run, or the code path was read at the cited
line) or **inferred** (reasoned from reading, not exercised). Findings relayed from a subagent say
so; the ones this report leans on were re-checked against the code.

## Executive summary

kiss-ssg is a well-tested, carefully guarded static site generator with one real differentiator:
every build ends in a machine-readable verdict (pages, links, audit, redirects), and a link to a
page that does not exist fails the build. Neither Eleventy, Astro nor Hugo does that in core. The
gates pass, CI is green on Linux and Windows, a fresh agent built a correct eight-page site from
the shipped docs on the first check, and build time scales linearly at about 2.3 ms per page.

It is no longer small, and the name and the README still say it is. `lib/` is 63 modules and
33,569 lines. About 44% of that is not page rendering: a cookie-consent manager, SCORM packaging,
a launch audit, and ten CLI commands. Two months of work produced 58 releases, 33 of them with
upgrade notes. There is no extension point, so every new capability has landed in core, and the
orchestrator is one class spread over six files that share 86 private fields.

The documentation is larger than the code and is written for an agent with a full context window.
`CLAUDE.md` is 60 KB and loads on every session. `AIKB/` is 941 KB. `planning/` is 3.1 MB. Much of
all three is dated incident history, not rules. A person cannot read their way in.

**Verdicts**

| Decision              | Verdict                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The next three months | Stop adding features. Spend the time on a real boundary inside the orchestrator, an extension point, moving consent, learning packages and the site-operations CLI behind it, and cutting the instruction files to rules. Items 1 to 6 below.     |
| A second maintainer   | Not ready. The code would survive the handover; the knowledge would not. There is no contributor guide, the architecture is explained only in incident narratives, and the process assumes one operator with one agent.                           |
| Outside contributors  | Not ready, and one policy decision comes first: breaking changes ship in minors by design. That is reasonable for a fleet the operator owns and is hostile to anyone else on `^2`. Decide whether outsiders are wanted before preparing for them. |

**One defect to fix this week:** a build deletes the staging folder of another build that is
still running, and `kiss-ssg check`, the command documented as publishing nothing, does it too
(reproduced; item 1).

## Method, and what limits it

- **The first impression was not blind.** The harness loads `CLAUDE.md` into the session before
  any tool runs, so I had read it before opening `lib/`. I read `lib/`, `bin/`, `test/` and
  `package.json` before `AIKB/`, `GUIDE.md` and the skills, and the impression below is recorded
  from that pass, but it is not the uncontaminated read the method asked for. The same applies to
  the subagents, which probably inherited the same file.
- Ran `npm ci` and `npm run gates` on Node 22.23.4, Linux. Built examples 4, 8, 11, 13 and 14.
  Ran `kiss-ssg check` on example 11. Ran the bench harness at 250, 1,000 and 4,000 pages.
- Four subagents: two clean-room tests (a new developer; an agent building a site from the packed
  tarball), a security read and a test-quality read. All four are the same model family as this
  review, so their agreement with it is one opinion held several times, not confirmation.
- Read the CI history through the GitHub API (15 most recent runs).

## First impression, from the code

Recorded before reading `AIKB/` or `GUIDE.md`.

- This is not a small generator. 63 modules, 33,569 lines, 21 runtime dependencies, and 60,827
  lines of tests (measured, `wc -l`).
- 12,665 of the `lib/` lines are comments, 38%. In `lib/kiss.js` it is 1,087 of 2,061. The
  comments are mostly accounts of past defects, with 156 dated references (measured, grep).
- The leaves are good. 23 of 63 modules import nothing internal, there are no import cycles, and
  modules such as `lib/links.js:514`, `lib/redirects.js:453` and `lib/sitemap.js:75` are pure
  functions over plain data (measured, a script over the import statements).
- The centre is one object. `lib/kiss.js` holds about thirty one-line methods that forward to
  free functions taking the whole instance (`lib/kiss.js:1199-1310`).
- `new Kiss()` does I/O: it creates folders, queues an asset copy, and in dev mode binds a server
  and starts a watcher (`lib/kiss.js:693-871`).
- The product has widened well past rendering pages.

Reading the docs afterwards confirmed all of this and contradicted none of it. The docs describe
the centre accurately; they do not describe it as a problem.

## 1. What kind of project this is

A Node static site generator in the Eleventy family: template files, data files, a build script,
no client framework. Its stated purpose is narrower and more interesting than that: sites written
by a coding agent and maintained by a person.

Comparisons with peers are from my knowledge of those projects, **not checked in this session**.

| Practice in the category        | Eleventy, Astro, Hugo                              | kiss-ssg                                                                                           |
| ------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Small core, features as plugins | Eleventy plugins, Astro integrations, Hugo modules | No extension point. Features are added to core (measured: the settle sequence, `lib/kiss.js:1519`) |
| Build verdict and link checking | Left to plugins or external tools                  | In core, on by default. Ahead of all three                                                         |
| Content schema validation       | Astro content collections                          | None. A controller throws by hand (example 8)                                                      |
| Incremental one-shot builds     | Eleventy `--incremental`, Hugo's cache             | None. Dev mode has scoped re-renders                                                               |
| Speed                           | Hugo is far faster; Eleventy is the same order     | 2.3 ms per page, linear (measured)                                                                 |
| Stable versioning               | Semver, breaking changes in majors                 | Breaks ship in minors, by stated policy                                                            |
| Contributor path                | CONTRIBUTING, governance, public issues            | No CONTRIBUTING file; zero open issues (measured)                                                  |
| Agent-facing docs               | Retrofitted, if present                            | Designed in: `llms.txt`, shipped examples, skills. Ahead of all three                              |

The fair summary: kiss-ssg leads its category on verification and agent support, and trails it on
modularity, versioning discipline and contributor readiness.

## 2. The stated philosophy

### Where the code lives up to it

- **Fail at build time and name the file.** Example 8 exits 1 naming the view, the item and the
  missing field. A wrong `{{link}}` id and a missing asset each name the asking view (measured,
  site clean-room agent). `lib/config.js` has 36 `throw` sites validating config up front.
- **Convention with a default.** The starter build script is 30 lines with no folder config
  (`starter/router.js`).
- **Upstream is documented, not patched around.** `AIKB/upstream.md` exists and is specific.
- **Only the logger imports `colors`**, and no `lib/` module calls `process.exit` (measured).

### Where it does not

- **"Small" and "keep it simple".** See the first impression. The README's first line still says
  "A small static site generator", and `package.json` says "Simple". Its `keywords` are `jekyll`,
  `gatsby`, `hugo`, `gridsome` (`package.json:106-116`).
- **Failing loudly depends on boilerplate every site must copy.** A ten-line
  `reportBuildFailure` function appears in 14 build scripts under `examples/`, `starter/` and
  `docs.js`, and the library exports no equivalent (measured, grep). `llms.txt` itself warns that
  "a chain without it exits 0 on a broken build". By the project's own rule, a capability with no
  default is an unfinished design.
- **"One responsibility per file."** `lib/build-finish.js` exports sixteen functions covering the
  report, link scan, audit, redirects, consent files, cache headers, integrity, purge, image
  encode and learning packages (`lib/build-finish.js:39-1018`).
- **"A human has to be able to follow it."** This is applied to the sites kiss produces and not
  to kiss. A person opening `lib/kiss.js` reads more history than code.

### Whether the philosophy is right

- **Agent-first with human legibility: right**, and the reason to choose this tool.
- **Convention first, persuadable: right.**
- **Elegance over compatibility: right only while the operator owns every consumer.** It directly
  contradicts opening the project up. It also has a cost today: 33 upgrade notes in 64 days is a
  migration tax on the operator's own five sites, paid in agent time.
- **"The version counts generations, not breaks": wrong for a package on npm.** `^2` means
  something specific to every tool that reads it. If outsiders are ever wanted, this must change.

## 3. Architecture

**Layering.** Three tiers exist in practice:

1. Leaves: pure functions, well bounded, well tested. This is the best part of the codebase.
2. The orchestrator: `kiss.js` plus `build-finish.js`, `rebuild.js`, `page-registry.js`,
   `staging.js` and `asset-copy.js`, about 5,200 lines.
3. The CLI: `bin/kiss-ssg.js` (631 lines) over decision modules, which talk to the engine through
   environment variables (`KISS_CHECK`, `KISS_AIKB`, `KISS_REPORT`), not an API.

**The orchestrator is one class in six files** (measured). The five satellite modules take the
instance as `@param {any} kiss` and read or write 86 distinct `kiss._…` fields between them;
`build-finish.js` alone has 157 such references and `rebuild.js` 148. The split moved lines out of
`kiss.js` without creating a boundary. Three consequences:

- The most coupled code is the code the type checker cannot see, because the parameter is `any`.
- Tests reach in. The test-quality agent counted 288 private-field accesses in tests, 180 of them
  in the two watch suites. `build-finish.js:7-9` says calls go through `kiss._x()` "so a test that
  patches one is seen", which is the design accommodating that.
- State is a set of latches (`_redirectsRun`, `_purgeRun`, `_packagesRun`, `_imagesRun`,
  `_consentClientRun`, `_cacheHeadersRun`, `_bannerRegistryRun`), each added with a feature.

**The lifecycle is a hand-rolled scheduler.** Work is pushed onto four promise lists and drained
in a loop until their lengths stop changing (`lib/kiss.js:1382-1436`). It works and is heavily
tested. It is also why the docs carry traps such as "a `complete()` callback that reads `this`
stays a `function`" and why nested `complete()` needs a depth counter.

**The settle sequence is a hardcoded list of ten steps** (`lib/kiss.js:1519-1600`), each with a
comment explaining why it sits where it does. That list is the extension point the project does
not have. Made explicit, as an ordered list of named steps over a build-state object, it would
let consent, packages, purge and image encoding register themselves instead of being wired in.

**HTML is read three ways.** `lib/links.js:152` and `lib/audit.js:916` scan written pages with
regular expressions; `lib/packages.js:176` uses htmlparser2 and has its own function also called
`extractReferences`. Each page is scanned at least twice at write time
(`lib/kiss-page.js:434-440`). Regex over the build's own minified output is defensible, but two
reference extractors that can disagree is a defect waiting to happen (inferred).

**What belongs in core.** Measured from line counts:

| Area                                                                                      | Lines | Share of `lib/` | Belongs in core?                                                    |
| ----------------------------------------------------------------------------------------- | ----- | --------------- | ------------------------------------------------------------------- |
| Consent and embeds (`consent*.js`, `embed.js`)                                            | 4,437 | 13%             | No. A legal product with its own release pressure                   |
| Learning packages (`zip`, `package-manifest`, `packages`, `scorm-bridge`)                 | 1,876 | 6%              | No. One site's need                                                 |
| CLI-only (`init`, `upgrade`, `speed`, `css-audit`, `issue`, `sessions`, `base`, `git`, …) | 6,713 | 20%             | `check`, `aikb`, `init` yes. `session`, `base`, `issue`, `speed` no |
| Audit                                                                                     | 1,853 | 6%              | Yes, but as a registered step with pluggable checks                 |

`kiss-ssg session` and `kiss-ssg base` answer git questions for the branch skills. They are in a
site generator because skills are forbidden from carrying shell logic. The rule is sound; the
destination is wrong. That tooling is a separate package.

## 4. Code quality and failure modes

**Good, measured:** no `TODO` or `FIXME` debt (one hit), no cycles, lint and `tsc --checkJs` pass,
config validated at construction, secrets redacted from logs (`lib/kiss.js:770`), template compile
cache keyed on source text (`lib/kiss-page.js:505-515`).

**Defects and risks:**

- **A build removes another live build's staging folder. Measured, reproduced.**
  `sweepStaleSiblings` treats every staging sibling whose name does not carry its own pid as
  stale (`lib/staging.js:72-102`). I created `public.kiss-staging-<pid>-zzzzzz` for a process
  that was still running and ran `kiss-ssg check` on example 11; it printed "Removed leftovers of
  an interrupted build" and the folder was gone while the process lived. `TODO.md` has listed
  this as High and Open since 2026-09-21. It matters more now than then: an agent running
  `check` while a build or `fleet-check` runs is an ordinary event.
- **`TODO.md` and `to-verify.md` are stale.** `TODO.md` lists the fetch body timeout as Open;
  the code covers the body (`lib/fetch-policy.js:218-241`). Neither file has changed since early
  October. A list of high-priority findings that is partly wrong is worse than none (measured).
- **`generate()` can log an error without recording a failure** (`lib/kiss.js:1500-1503`). I
  found no reachable path into that catch, so this is a hole by construction, not a known bug
  (inferred).
- **99 bare `catch {` blocks and 110 synchronous fs calls** in `lib/` (measured counts). I
  sampled two catches (`lib/build-finish.js:574`, `lib/page-registry.js:40`) and both were
  deliberate. I did not audit the rest.
- **95 `{any}` annotations** in `lib/` (measured).

## 5. Tests

From the test-quality agent, which read and counted but ran nothing. I ran the suite: all five
gates pass (measured, exit 0).

**What the suite proves.** It asserts written bytes, report fields and exit codes against real
temp directories, real child processes and a real watcher. About 3,200 tests, 7,454 `expect`
calls, 74 call-count assertions, no snapshots, no `.skip` or `.only`. The atomic-promote failure
paths, the CLI and the zip output are tested properly.

**What could break unnoticed:**

- **The published package.** The `pack` gate checks a file list from `npm pack --dry-run`
  (`scripts/gates.mjs:20-30`). Nothing installs the tarball and imports it. A broken `exports`
  map or a dependency left in `devDependencies` passes every gate. (My clean-room site test did
  install the tarball and it worked, so this is not broken today.)
- **Scale.** The largest fixture is 200 to 300 items and `npm run bench` is not a gate. A
  quadratic regression in the link scan would go green.
- **Dev mode end to end.** `lib/dev-server.js` is mocked in 15 integration files. No test has a
  browser receive a reload.
- **Coverage.** No threshold; the gates do not run coverage (`vitest.config.mjs`).
- **Flakes.** `test/integration/watch.test.js` is 2,381 lines with 72 polls and 20 fixed sleeps,
  and records three unreproduced CI failures in its own comments (`:49-56`).
- **Examples 1 to 5** are asserted by exit code and page count only, though the philosophy says
  every example is copied as a statement of good practice.

**Tests of prose.** About 3,700 lines test docs, skills and manifests. Some earn their place:
`test/aikb.test.js:157-165` compares the documented default config with `resolveConfig({})`. The
60-entry `CONTRADICTIONS` table that bans exact sentences
(`test/unit/skill-coverage.test.js:1178-1642`) does not: a paraphrase passes, and it only grows.

**The red-first rule cannot be audited.** Nothing links a regression test to a failing run.

## 6. Security and supply chain

From the security agent, under the threat model "the author is trusted; fetched data, network
peers, dependencies and CI inputs are not". It found **no high-severity issue**. I re-read the
four findings marked verified.

| Severity   | Finding                                                                                                                                                          | Evidence                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Medium     | Publishing is a manual `npm publish` from one machine, with no provenance attestation. A stolen token ships a tarball no commit accounts for                     | `package.json:42-44`; no publish workflow (measured)                          |
| Medium     | URL-model fetches follow redirects carrying the configured headers. A custom token header (`X-Api-Key`) goes wherever the endpoint redirects                     | `lib/fetch-policy.js:207-211` (verified; header-stripping behaviour inferred) |
| Low-medium | An alias from a fetched record is written into the host's redirect file unchanged apart from a whitespace check. `/*` or `/**` becomes a site-wide redirect rule | `lib/redirects.js:58-73` (verified)                                           |
| Low        | No size cap on a fetched model                                                                                                                                   | `lib/fetch-policy.js:215` (verified)                                          |
| Low        | The pipeline logs a whole `watch` command, against the module's own rule to name the program only                                                                | `lib/pipeline.js:236` (verified)                                              |
| Low        | Actions pinned by major tag; `ci.yml` has no `permissions` block                                                                                                 | `.github/workflows/ci.yml:28,32`                                              |
| Info       | `sitemap.xml` values are written without XML escaping. Safe today because slugs are restricted                                                                   | `lib/sitemap.js:75-88` (verified)                                             |
| Info       | 22 skills declare unrestricted `Bash` in `allowed-tools`                                                                                                         | skill frontmatter                                                             |

`npm audit` reports 4 moderate advisories, all in dev dependencies through eslint (measured).
The lockfile is committed and CI uses `npm ci`. Sound, per the agent: output path confinement,
HTML escaping in the helpers, child processes spawned with argument arrays, the dev server
binding to 127.0.0.1, and `kiss-ssg issue` refusing token-shaped drafts.

## 7. Performance and cross-platform

Measured with `node scripts/bench.mjs --runs=3`, median, this container:

| Pages | Build time | Per page |
| ----- | ---------- | -------- |
| 250   | 805 ms     | 3.2 ms   |
| 1,000 | 2,614 ms   | 2.6 ms   |
| 4,000 | 9,229 ms   | 2.3 ms   |

Linear, with about 250 ms of import time before any work. Examples build in 0.9 to 1.6 seconds
including process start. This is adequate for brochure and documentation sites, which is the
stated market. I did not measure memory, a site with many partials, or the image pipeline.

Cross-platform: CI runs both operating systems and the last push to `main` passed on both
(measured through the API). Eight tests run only on Windows and three only on POSIX, so a local
green on either is partial. I ran nothing on Windows.

## 8. Public API

- **Surface:** 16 public methods, 20 built-in helpers, about 20 top-level config keys, 10 CLI
  commands (measured from `lib/kiss.js` and `llms.txt`). Large for the category.
- **Mixed styles.** `.generate(cb)`, `.sitemap(opts, cb)`, `.llms(opts, cb)` take callbacks;
  `.complete()` returns a promise and also takes a callback (`lib/kiss.js:1475,1519,1679`).
- **Traps the docs list themselves** in `llms.txt`: forgetting `.complete()` exits 0 on a broken
  build; a callback reading `this` must not be an arrow; helpers register once per process. Each
  is a place where the API could remove the trap instead of documenting it.
- **Naming.** `getModelByID` beside `id` everywhere else.
- **Upgrade cost.** 58 releases between 2026-09-05 and 2026-11-08, 33 with `### Upgrading`
  sections (measured from `CHANGELOG.md`, which is 177 KB).
- **Good:** deep imports into `lib/` are blocked by `exports`; types ship; named exports are
  mirrored as statics for CommonJS.

## 9. Documentation and agent instructions

### Size

| File or folder | Size   | Loaded when                                            |
| -------------- | ------ | ------------------------------------------------------ |
| `CLAUDE.md`    | 60 KB  | Every session in this repo, about 15,000 tokens        |
| `llms.txt`     | 16 KB  | Every session in every consuming site                  |
| `GUIDE.md`     | 305 KB | On demand, one file                                    |
| `AIKB/`        | 941 KB | "Before changing that module"; `AIKB/kiss.md` is 72 KB |
| `planning/`    | 3.1 MB | 141 files, 63 session logs                             |
| Skills         | 674 KB | On demand                                              |

(Measured, `wc -c`. Token figures are estimated at four characters per token.)

`llms.txt` is at 15,996 of its 16,000-character cap (measured). The next API change must delete
something first.

### Rule versus incident history

`CLAUDE.md` is 8,618 words. The Rules section is 2,506 and the Git workflow section 1,838, and
the file carries 58 dated incident references (measured). A typical rule is one sentence of
instruction followed by five of history. The history explains why the rule exists, which is
valuable once and expensive every session after. The file states this pattern about itself: one
rule was re-worded five times, recurred in three of six sessions, and was then replaced by a
hook. That is the evidence that prose rules of this length do not hold and mechanisms do.

`AIKB/kiss.md` gives 54 KB of its 72 KB to one section, "Non-obvious behavior". It is an incident
log filed as architecture. `AIKB/` also ships in the npm tarball, about a quarter of its 4.0 MB
unpacked size, so every consuming site downloads kiss's own defect history.

### Accuracy

Spot checks, all measured:

- `AIKB/kiss.md`'s Public interface list has no entry for `.robots()`, and its "Depends on" line
  omits `cache-headers.js` and `images.js`. `test/aikb.test.js` checks headings, not content.
- `kiss-site-new` says the examples README "lists twelve runnable sites"; there are fourteen.
- `kiss-site-new` cites a working habit, "read a page with its layout", as being in `llms.txt`.
  It is not.
- `GUIDE.md`'s `isActive` examples use literal `href="/about"`, which `llms.txt` forbids. The
  correct pattern exists only in `examples/11-blog/src/layouts/layout.hbs`.
- `CLAUDE.md`'s own claims that I checked were accurate: the logger rule, the Node floor, the
  CI matrix, the AIKB table (66 rows, no module without a doc).

### The shell-edit hook

It refused a command of mine that captured the gates' output and appended the exit code to the
same scratch file, which is the capture pattern `CLAUDE.md` recommends
(`cmd > out.txt 2>&1; echo $?`). One false positive in one session (measured). The hook is the
right idea; its pattern for `echo` into a file is wider than its rule.

### Clean-room test A: a new developer

Given a fresh clone and told to start from `README.md`, the agent reached a green suite in about
two minutes and scored getting up and running **4 out of 5**, dropping to about **3 for landing a
conforming change**. All timings and outputs below are its measurements.

**Getting to green.** `README.md § Development` (line 242 of 263) gave the commands. `npm install`
took 4.3 seconds and `npm test` 1 minute 57 seconds: 4,803 tests passed, 49 skipped, green first
time, and no flaky test across four full runs. There is no CONTRIBUTING file; the README points a
developer at `CLAUDE.md`.

**A first change.** It added a built-in `shout` helper with a unit test. The gates went green after
three runs. How it learned each obligation:

| Obligation                               | How it found out                                                                   |
| ---------------------------------------- | ---------------------------------------------------------------------------------- |
| An entry in `llms.txt`                   | A failing test, with a clear message                                               |
| A bullet in `AIKB/handlebars-helpers.md` | A failing test, with a clear message                                               |
| Regenerated `types/`                     | A failing test that names the command to run                                       |
| `llms.txt` under 16,000 characters       | A failing test. The one new line forced rewording four neighbouring entries        |
| Renaming `shout` in `watch.test.js`      | Two failing tests whose messages do not hint at the cause (see below)              |
| A section in `GUIDE.md`                  | Only `CLAUDE.md`'s Rules. No check enforces it                                     |
| `CHANGELOG.md` and a version bump        | Never found out what a human should do; the changelog says `/branch-close` does it |

**Where it got stuck or was misled:**

- **The contributor process exists only as agent instructions.** `CLAUDE.md` describes slash
  commands and "the operator". A person without Claude Code is not told what to do instead, or
  whether outside pull requests are wanted.
- **A name collision cost a gate round.** `test/integration/watch.test.js` uses `shout` as its
  example site-helper name, so adding a built-in of that name failed two watch tests with
  "expected [Function] to be undefined" and a timeout. Nothing points at the cause. (The agent
  inferred the cause; the failures went away on renaming.)
- **The `llms.txt` budget is spent.** `CLAUDE.md` says the cap is raised only by cutting something
  else, but not that four characters remain.
- **`AIKB/handlebars-helpers.md`'s opening roster is already stale**: it omits `image` and `embed`,
  and the test checks only the bullet list.
- **`node docs` rewrote 15 tracked files, 13 of them unrelated to the change.** The agent reverted
  them and did not investigate why. Worth checking: a docs build that is not reproducible from a
  clean checkout makes every docs diff noisy.
- **The README never says how to run one test file.** One file runs in 0.6 seconds against two
  minutes for the suite.

**What helped a human newcomer:** the README's Development section, `package.json` scripts, the
`CLAUDE.md` Rules and Commands sections, and above all the failing-test messages, which the agent
called the best documentation in the repo. **What was noise for that purpose:** the README's first
240 lines, `CLAUDE.md`'s pipeline paragraph and incident history, the changelog and `planning/`.

The conclusion matches section 10: the mechanisms teach well, and the prose does not.

### Clean-room test B: an agent building a site

Given only the packed tarball, `README.md`, `llms.txt`, what those point to, and the plugin
skills, the agent built an eight-page bakery site with a JSON fan-out, layout, partials, active
nav, a custom helper, sitemap, robots and a redirect. **The first `kiss-ssg check` was green**,
and it never read `lib/`. It scored the docs 4 out of 5.

Where it guessed, correctly each time:

- Fanning out from one JSON file holding an array. `GUIDE.md § .pages()` opens with a `.page()`
  example, and every shipped example fans out from a folder.
- Whether a `.pages()` id prefix may equal another page's id.
- The nav pattern without hand-written hrefs, found only by grepping example 11.

Other friction it measured:

- A record's own `slug` is ignored without a controller, producing `bakes/bakes-bake-1/`.
- A wrong `{{link}}` id does not list valid ids or suggest the nearest.
- One failed page produces a "broken link" line from every page linking to it: 12 lines for 2
  failures, burying the cause.
- The starter's failure reporter prints the staging path, not the build path.
- `host: 'netlify'` wrote no `_headers` file and did not say why.

This is a strong result, with the caveat in Method about how clean the room was.

## 10. Process

- **What earns its cost:** the five gates, the two-OS CI matrix, the pack gate, the pre-commit
  format hook, the shell-edit hook, and the rule that skills hold no logic. Each is a mechanism,
  and each has caught something the record names.
- **What does not, at its current weight:** the written record. 63 session logs and 30 review
  files in 64 days is text produced faster than one person can read it. `CLAUDE.md` describes
  review loops of 14, 21 and 33 rounds, and says no fix in those 33 was read by a person until
  the close. The process generates assurance documents; it is less clear that it generates
  assurance.
- **Cadence.** Nearly one release a day. Every release moves the baseline every site was last
  checked against.
- **Bus factor is one.** All 50 commits in this clone's history have one author (measured; the
  clone is shallow). The process is written for that person plus an agent: "the operator
  decides", "ask the operator". There is no role a second human could step into without it being
  rewritten.

## What is done well

Keep these through any refactor.

1. The build report as the product: one verdict, the same object on success and on rejection.
2. Links by identity that fail the build, and the link scan over what was actually written.
3. The leaf modules: pure, typed, separately tested, no cycles.
4. Config validated at construction with errors that name the key.
5. Atomic builds with tested failure and restore paths.
6. The gates as one script, run identically locally, in CI and before publish.
7. `llms.txt` under a hard size cap, with rules kept in `GUIDE.md`.
8. Examples that ship in the package and are built by the test suite.
9. `AIKB/upstream.md`: constraints recorded with how to re-check them.
10. Error messages that name the file and say what to do.

## Top ten opportunities

| #   | Opportunity                                                                                                                                                                                        | Severity | Effort | Evidence                                                                                     | What it buys                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------ | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Stop `sweepStaleSiblings` removing a live process's staging folder: test the pid for liveness, or hold a lock file                                                                                 | High     | S      | Reproduced; `lib/staging.js:72-102`; open in `TODO.md` since 2026-09-21                      | `check` becomes safe to run beside a build, as documented                              |
| 2   | Give the orchestrator a boundary: an explicit, typed build-state object, and the settle sequence as an ordered list of named steps                                                                 | High     | L      | 86 private fields shared by six files; `lib/kiss.js:1519-1600`; 288 private reaches in tests | Type checking over the core, tests that stop patching privates, and an extension point |
| 3   | Freeze core. Move consent and embeds, learning packages, and the session, base, issue and speed commands into separate packages on that extension point                                            | High     | L      | 44% of `lib/` is outside page rendering                                                      | A core a person can hold in their head; features that release on their own clock       |
| 4   | Cut `CLAUDE.md` to rules, about a third of its size. Move incident history to `planning/`. Split each `AIKB` "Non-obvious behavior" section into invariants and history, and stop shipping history | Medium   | M      | 60 KB per session; 58 dated references; `AIKB/kiss.md` 54 KB in one section                  | About 10,000 tokens back per session, and docs a human can read                        |
| 5   | Make failure loud by default: export the failure reporter, or offer a wrapper that awaits `complete()` and sets the exit code; warn at exit if a build was never completed                         | Medium   | S      | 14 copies of `reportBuildFailure`; the `llms.txt` warning                                    | Removes boilerplate and the "exits 0 on a broken build" trap                           |
| 6   | Add two gates: install the packed tarball into a temp project and build with it; build 2,000 pages under a time budget                                                                             | Medium   | S      | `scripts/gates.mjs:20-30`; largest fixture is 300 items                                      | Catches a broken package and a quadratic regression before publish                     |
| 7   | Publish from CI with npm provenance on a tag. Pin actions by commit SHA. Add `permissions: contents: read` to `ci.yml`                                                                             | Medium   | S      | Manual publish, no attestations                                                              | A tarball that provably came from a commit                                             |
| 8   | Harden fetched data: refuse cross-origin redirects when custom headers are set, cap response size, reject `*` and `:` in aliases that come from records, escape sitemap values                     | Medium   | S      | `lib/fetch-policy.js:207-215`; `lib/redirects.js:58-73`; `lib/sitemap.js:75-88`              | Closes the only untrusted-input paths found                                            |
| 9   | Write the human path in: a `CONTRIBUTING.md`, a one-page architecture map, and a stated versioning policy. Delete `TODO.md` and `to-verify.md` or move their live items to issues                  | Medium   | S      | No CONTRIBUTING file; stale root files; zero issues                                          | The precondition for a second maintainer                                               |
| 10  | One pass over each written page that yields references and audit facts for links, audit and packages; one `extractReferences`                                                                      | Low      | M      | `lib/links.js:152`; `lib/packages.js:176`; `lib/audit.js:916`                                | One definition of "what this page references"; fewer scans per page                    |

Items 2 and 3 are one piece of work in two stages, and item 3 should not start before item 2.

## What to delete or stop doing

- `TODO.md` and `to-verify.md` at the repo root.
- The `jekyll`, `gatsby`, `hugo`, `gridsome` keywords, and the words "small" and "simple" until
  they are true again.
- Dated incident narratives in code comments. Keep the invariant in one line; the story is in
  git and the session logs.
- Growing the `CONTRADICTIONS` sentence-ban table.
- Shipping incident history in the npm tarball.
- Review loops without a human reading a diff between rounds. The rule already exists; a count
  of rounds is not evidence of quality.
- Adding a `kiss-ssg` subcommand whenever a skill needs a mechanism.
- Releasing daily. Batch to a cadence the fleet can be checked against.
- Describing breaking minors as a feature if outside users are ever wanted.

## Unsure

Listed separately because I could not settle them.

- Whether asset hashing still renames JavaScript files without rewriting the imports between
  them. `TODO.md` says so; I did not find rewriting code and did not build a case.
- Whether any of the 99 bare catches hides a real failure.
- Whether the regex page scanners and the htmlparser2 one actually disagree on any input.
- How clean the clean rooms were, given `CLAUDE.md` is injected into sessions in this repo.
- Whether undici strips custom headers on a cross-origin redirect. The medium rating on the
  fetch finding depends on it.
- Whether the peer comparisons in section 1 are current. They are from memory.

## Not checked

- Anything on Windows or macOS.
- The dev server, watcher and live reload, in a browser or otherwise.
- The browser test suite's content, and whether the consent manager is legally adequate.
- Coverage percentage, memory use, and flake rate.
- `lib/html-split.js`, `lib/aikb.js`, `lib/init.js`, `lib/upgrade.js`, `lib/scorm-bridge.js` and
  the consent client beyond their outlines.
- The 15 domain and task skills as writing, beyond the two the site agent opened.
- The five real sites built with kiss, and whether upgrades have actually cost them time.
- GitHub repository settings and the npm account's two-factor status.
- The docs site under `src/` and `docs.js`.
