# The feedback loop: client sites report to kiss-ssg, and hear back

Contract for the feedback-loop workstream of `fix/purge-class-tokens` (session file
`planning/sessions/2026-11-08-purge-class-tokens.md`, Amendment "operator decisions, and the
feedback loop absorbed"). One session builds it; there is no delegation. The contract exists so an
adversarial read can find its load-bearing flaws before code is written, and it is amended in
place, with a dated section, when the design moves.

## Why

#78 came from a client session (a1k9training) through the operator, and the cross-session exchange
that followed fixed the bug and three improvements in a day. Four a1k9training reflections had
already said "file it against kiss-ssg", and none did: there was no step at the moment of decision
and no tool. The loop needs both, on both sides.

## Decisions already taken (the operator, 2026-11-08)

- **The site is named by default.** A draft carries the site's package name and its public URL.
  Page copy and file contents stay out, and a token-shaped value is refused, because the
  repository is public.
- **Draft and printed command.** `kiss-ssg issue` never posts. It writes the body to a file and
  prints the `gh issue create` command for the operator to read and run.
- **The URL comes back through the session.** The command is offered as `! gh issue create …`, so
  run in the session, `gh`'s output (the new issue's URL) lands in the conversation and the agent
  records it. Filed elsewhere, the operator pastes the URL when asked.
- **Outward actions need the operator.** Creating labels, posting, and commenting on an issue are
  all printed, never run.

## The loop, end to end

1. **Capture (site).** A client session works around a kiss limit, or hits a defect. At
   `kiss-branch-close`, inside the reflection step and before its commit, every Feedback item
   about kiss becomes a draft (`npx kiss-ssg issue`), put to the operator: file it, or skip it with
   a reason. A filed item gets `filed: <issue URL>`. Outside a close, `llms.txt` says the same at
   the moment it happens.
2. **Triage (kiss).** This repo's `/branch-open` lists the open issues beside the Feedback
   read-back and accepts an issue URL as the work's starting point; the session file records
   `issue: <n>`.
3. **Return (kiss → site).** `/branch-close` puts `Fixes #<n>` in the PR body, and the CHANGELOG
   entry carries `Fixes [#<n>](https://github.com/cprobert/kiss-ssg/issues/<n>)`. A site upgrading
   with `kiss-ssg upgrade` sees that entry. `/branch-merged` prints a comment for the issue, for the
   operator to post, worded "merged; ships in <version>".
4. **Retire (site).** A site's `kiss-branch-open` runs `npx kiss-ssg issue --filed`, which finds
   every `filed:` line in every session log (and in `AIKB/site.md`, where consolidation carries
   them) and says, for each, whether the installed kiss-ssg has shipped it. A shipped one is
   reported, so the workaround can be removed rather than re-learned.

## Artefacts and who owns them

### A. `kiss-ssg issue`: `lib/issue.js`, `bin/kiss-ssg.js`, `AIKB/issue.md`

Every decision is in `lib/issue.js` with a `test/unit/issue.test.js`; the `bin/` wrapper only does
I/O, and `test/integration/issue.test.js` runs it end to end against a fake `gh` first on `PATH`
that records every call. A new `lib/` module gets its row in `CLAUDE.md`'s AIKB table.

```
npx kiss-ssg issue bug|feature --title "<one line>" [--notes <file>] [--report <file>]
                                [--anonymous] [--out <file>] [--no-search]
npx kiss-ssg issue --status <issue URL or number>
npx kiss-ssg issue --filed
```

**Reads, never writes** (except the draft):

| Fact                                                  | From                                                                                                                                                                                                                                                                                        | When it cannot                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| kiss-ssg version                                      | `node_modules/kiss-ssg/package.json` beside the cwd, or this package's own                                                                                                                                                                                                                  | "unknown"                                                                                                                                                                                     |
| Node, OS                                              | `process.version`, `os.platform()`, `os.release()`                                                                                                                                                                                                                                          | —                                                                                                                                                                                             |
| Site name                                             | the cwd's `package.json` `name`                                                                                                                                                                                                                                                             | the folder's name                                                                                                                                                                             |
| Site URL                                              | the report's `thirdParty.siteUrl` (`null` when unset, local, or the build failed)                                                                                                                                                                                                           | left out                                                                                                                                                                                      |
| The build                                             | `--report <file>`: a `kiss-ssg check` stdout capture or a `KISS_REPORT` file, read with `lib/check.js` `readReportsFile`; per report `ok`, mode, page count, failure count and the failed pages' views, and the audit's check ids with a count of findings each (derived from `findings[]`) | falls back to `AIKB/last-build.json`, labelled **last recorded passing build**: it is written only by a passing `kiss-ssg aikb`, so it never shows a failure; with neither, "no report given" |
| What happened, expected, reproduction, config excerpt | `--notes <file>`, the agent's own words, written with its Write tool                                                                                                                                                                                                                        | the headings, empty                                                                                                                                                                           |

The config is not read: reading it means running the build script. `--report` is the way to put
the failing build in front of the reader: `npx kiss-ssg check router.js > report.json`, then
`--report report.json`. The `AIKB/` fallback path assumes `folders.aikb` is its default; a site
that moved it passes `--report` instead.

**The draft** is Markdown whose `###` headings are its kind's form field labels (C), in the same
order: one list for bugs, one for features, each tested equal to its form. `--anonymous` drops the
site name and URL.

**Tokens.** Before writing, the title and the whole draft (the notes included) are scanned for
token-shaped values: GitHub (`ghp_`, `gho_`, `ghs_`, `ghu_`, `github_pat_`), npm (`npm_`), Slack
(`xox[abprs]-`), AWS (`AKIA` + 16), OpenAI and Anthropic (`sk-` + 20 or more), a PEM private-key
header, and, after `token`, `secret`, `password`, `apikey` or `authorization` (`=`, `:` or a
space, quoted or not), a value of 20 or more characters mixing letters and digits with no dot or
space. An identifier or expression is not a value: `process.env.API_TOKEN`, `env.TOKEN`,
`'Bearer ' + token` pass, so an honest config excerpt is not refused. A hit refuses the draft:
exit 1, naming the line and the kind of token, never the value. Nothing is written.

**Duplicates.** Unless `--no-search`, it runs `gh issue list --repo cprobert/kiss-ssg --state all
--search "<title> in:title" --json number,title,state,url --limit 5` and lists what it finds above
the command, open ones first. `gh` missing or not signed in: says so and continues. The repository
comes from this package's `bugs.url`, never from the site.

**Output.** The draft goes to `--out`, or to `<os temp>/kiss-issue-<slug>-<pid>.md`, never into the
site's tree. Then it prints, on its own line, the command with a leading `! ` for a Claude Code
session:

```
! gh issue create --repo cprobert/kiss-ssg --title '<title>' --body-file '<draft path>'
```

with the title and path single-quoted in one form that bash and PowerShell read alike: every
quote-like character becomes ʼ (U+02BC) (amended after the fifth review, below). It says that `gh`
prints the new issue's URL, which is what to record as `filed: <URL>`. No `--label`: labels may not exist, and creating them is
outward.

**Issue references, one shape.** `lib/issue.js` owns one pattern for a kiss-ssg issue reference,
`https://github.com/cprobert/kiss-ssg/issues/<n>` followed by a non-digit or the end (so
`issues/7` never matches `issues/78`, and another project's URL is not one), and one parser for a
`filed: <URL>` line, which counts only a URL into this repository. A CHANGELOG entry ships an issue when it contains
`Fixes [#<n>](https://github.com/cprobert/kiss-ssg/issues/<n>)`; a bare mention does not count.

**`--status <n>`** reads the installed kiss's `CHANGELOG.md` (the one `node_modules/kiss-ssg`
ships) and reports **shipped in <version>** when an entry carries that `Fixes` link, else **not in
the installed kiss-ssg (<version>)**. With `gh` signed in it adds the issue's state.

**`--filed`** reads every session log under `planning/sessions/` (through `lib/sessions.js`'s
reader) and `AIKB/site.md` for `filed:` lines, and prints one line each: the issue, where it was
filed from, and `--status`'s answer.

**Exit codes.** 0 drafted, or answered; 1 refused (a token); 2 usage, or the title is empty.

### B. The instructions a site reads

- `llms.txt`: `issue` joins the CLI paragraph with one clause: a kiss limit or workaround becomes a
  draft (`kiss-ssg issue`), never a silent workaround. The file is at 15,998 of 16,000 characters,
  so the room comes from tightening that paragraph's own wording. `AGENTS.md` only points at
  `llms.txt`, so a Codex agent meets the clause when it reads the file.
- `GUIDE.md`: a section, **Reporting to kiss-ssg**, inside the Checking a build page (its name added
  to that page's `sections` in `src/models/guide.json`): the command, what a draft holds and leaves
  out, `--report`, `--status`, `--filed`, and that feature requests are welcome.
- `README.md`: one line in the command list.
- `lib/init.js`: nothing. The CLAUDE.md it writes imports `llms.txt`, which carries the clause.

### C. Issue forms: `.github/ISSUE_TEMPLATE/`

- `bug.yml`: kiss-ssg version, Node and OS, Site (optional), What happened, What was expected,
  Reproduction, Config excerpt, The build (optional).
- `feature.yml`: kiss-ssg version, Site (optional), What you were trying to do, What kiss does now,
  What would help, Workaround in use.
- `config.yml`: blank issues allowed (a `--body-file` issue is one), and a contact link to the
  GUIDE section.

### D. The site's rituals: `plugins/kiss-memory/skills/`

Each step opens with `npx kiss-ssg issue --help`; "unknown command" means the site's kiss-ssg is
older than this feature: upgrade first (`npx kiss-ssg@latest upgrade`), as the `session` steps say.

- `kiss-branch-close`, inside step 5 (the reflection), before its commit: each Feedback item about
  kiss gets a draft, put to the operator with `AskUserQuestion` (file / skip). Filed: the operator
  runs the printed `! gh issue create …`, and the agent writes `filed: <URL>` into the item. Skipped:
  the reason goes into the item. Both land in step 5's commit.
- `kiss-branch-open`, in the read-back: `npx kiss-ssg issue --filed`, and each shipped item is said
  as shipped, with the version.
- `kiss-memory-consolidate`: a `filed:` line is carried into `AIKB/site.md` with its item, never
  folded away.
- Skill-coverage rows hold each of the three to naming `kiss-ssg issue`.

### E. This repo's rituals: `.claude/skills/`

- `/branch-open`: lists open issues (`gh issue list --state open --limit 20`) beside the read-back,
  and accepts an issue URL or number as an argument. The session template gains `issue:` in its
  frontmatter.
- `/branch-close`: reads `issue` with `node bin/kiss-ssg.js session --get issue`, puts `Fixes #<n>`
  in the PR body and the `Fixes [#<n>](…/issues/<n>)` link in the CHANGELOG entry. `Fixes` closes
  the issue only when the PR merges into the repository's default branch: true while the base is
  `main`, not on a `v2`-style line, where the step says to close it by hand at release.
- `/branch-merged`: prints `gh issue comment <n> --body-file -` with a body naming the PR and
  "ships in <version>", for the operator to run.
- `test/unit/changelog.test.js`: every issue link in an entry has the `Fixes [#n](…/issues/n)` form.

## Seams

- A's two heading lists = C's two forms' field labels (a test per form).
- A's `--status` and E's CHANGELOG link: one pattern, in `lib/issue.js`, used by the changelog test.
- D's `filed:` lines, `--filed` and consolidation: one parser, in `lib/issue.js`.

## Non-goals

Posting, labelling, or commenting on the operator's behalf. A bot, GitHub Actions or triage
automation. Reading the site's config. Telemetry of any kind. Issues for anything but kiss-ssg.
Hostile input (the agreed threat model is an honest site agent).

## Done when

- `kiss-ssg issue` drafts, refuses each token kind and passes an honest `process.env` excerpt (tests,
  seen red), searches when `gh` is there and carries on when it is not, and never runs
  `gh issue create` (the fake `gh` records every call; the test asserts none is `create`).
- `--status` and `--filed` answer from a fixture CHANGELOG and fixture logs, and `issues/7` never
  matches `#78`.
- The forms exist and match the draft (a test per form).
- D and E's steps exist, held by skill-coverage rows, within the code-block allow-list.
- A clean-room agent in a fresh site, meeting a kiss limit, finds the instruction and drafts an
  issue without being told to.

## Amended 2026-11-08, after the critique

A fresh-context agent read the first draft against the code and found nine flaws, all taken:

1. Nobody had the issue URL (`gh` prints it in the operator's terminal): the operator chose `!`.
2. `last-build.json` is written only by a passing `aikb`, so it never shows the failing build:
   `--report` added, the record is labelled as the fallback, audit counts are derived.
3. The site read-back reads three logs and consolidation folds Feedback away: `--filed` scans every
   log and `site.md`, and consolidation carries `filed:` lines.
4. An older installed kiss has no `issue`: each skill step checks `--help` first.
5. The token rule refused `authorization: process.env.API_TOKEN`: values must look like secrets, and
   the title is scanned too.
6. The feature form lacked the version: a heading list per kind, each tested against its form.
7. The `issues/<n>` match was unspecified: one exact `Fixes` link, bounded, enforced by the
   changelog test.
8. The close step left an uncommitted change: it sits inside step 5, before its commit.
9. A comment at merge said "shipped" before publish: worded "ships in <version>", and `Fixes`
   closing only on the default branch is stated.

## Amended 2026-11-08, after the fifth code review (the built command)

- **One quoting form for every shell.** PowerShell also reads U+2018–U+201B as single quotes, so an
  agent's ’ ended the title early, and on Windows the `!` line may run in Git Bash, where `''` is no
  escape. Every quote-like character in the title becomes ʼ (U+02BC); the platform no longer
  changes the command.
- **`filed:` counts only a URL into this repository.** Another project's issue URL and a bare number
  ("Bugs filed: 2") were read as kiss-ssg issues. `--status` still takes `#n` or `n`, given
  explicitly.
- **`--anonymous` leaves the failing views out**, since their paths can name a client.
- **Nothing throws out of the command**: a missing `--out` folder or a `--report` that is not a
  report is exit 2 with a sentence; a broken site `package.json` costs only the name.
