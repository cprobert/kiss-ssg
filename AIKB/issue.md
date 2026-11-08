# issue.js

## Responsibility

`kiss-ssg issue`: a client site drafts an issue for kiss-ssg, and later asks whether the kiss-ssg it has installed shipped the fix. It never posts, labels or comments: it writes the draft outside the site, prints the `gh issue create` command for the operator, and reads. The contract is `planning/plans/2026-11-08-feedback-loop.md`.

## Public interface

- `issueRepo(root?)` — `owner/name` from this package's own `bugs.url`, never the site's.
- `BUG_HEADINGS`, `FEATURE_HEADINGS` — a draft's `###` headings, in order. `.github/ISSUE_TEMPLATE/bug.yml` and `feature.yml` are held to them by `test/unit/changelog.test.js`.
- `findTokens(text)` — `[{ line, kind }]` for every token-shaped value, never the value.
- `issueNumber(ref, repo)` — a number from a URL into `repo`'s issues, `#n` or `n` (what `--status` takes); `null` otherwise, including another repository's URL.
- `fixesLink(repo)` — the one CHANGELOG form of a shipped issue, `Fixes [#n](https://github.com/<repo>/issues/n)`, as a global RegExp (both numbers captured). `test/unit/changelog.test.js` holds every issue link in `CHANGELOG.md` to it.
- `shippedIn(changelog, n, repo)` — the version whose entry carries that link with `n` twice, or `null`.
- `parseFiled(text, repo)` — the `filed: <URL>` lines a site's logs or `AIKB/site.md` carry that name an issue in `repo`. Another project's URL, or a bare number ("Bugs filed: 2"), is not one (fifth review, 2026-11-08: both were read as kiss-ssg issues).
- `buildSummary(reports, source)` — a draft's "The build": per report `ok`, mode, page and failure counts, up to ten failed views, and the audit's check ids each with a count derived from `findings[]`.
- `draftIssue({ kind, notes, facts, anonymous })` — the draft's Markdown.
- `createCommand({ repo, title, file })` — `! gh issue create …`, one single-quoted form for bash and PowerShell alike: every quote-like character (`'` and U+2018–U+201B, which PowerShell also reads as a quote) becomes ʼ (U+02BC). On Windows the `!` line may run in Git Bash or PowerShell, which escape a quote differently, and an agent's ’ ended a PowerShell string early (fifth review). The title on GitHub shows ʼ where it had an apostrophe.
- `parseIssueArgs(argv)`, `runIssue(argv, { cwd, gh, platform, tmpdir, repo, write })` — the whole command, `{ out, err, code }`; `bin/kiss-ssg.js` only prints it. `runGh(args, cwd)` is the default `gh`. `ISSUE_HELP` is the help text.

## Depends on

`lib/check.js` (`readReportsFile`, for `--report` and the record), `lib/sessions.js` (`SESSIONS`, `readSessions`, for `--filed`); `node:fs`, `node:os`, `node:path`, `node:child_process` (`gh`, spawned with no shell).

## Depended on by

`bin/kiss-ssg.js` (`kiss-ssg issue`); the `kiss-memory` skills `kiss-branch-close` (drafts) and `kiss-branch-open` (`--filed`); `test/unit/changelog.test.js` (`fixesLink`, the heading lists).

## Non-obvious behavior

- **It never posts.** The operator's decision (2026-11-08): the repository is public and a site agent acting alone should not publish there. The command is printed with a leading `! ` so that, run inside a Claude Code session, `gh`'s output (the new issue's URL) lands in the conversation for the agent to record as `filed: <URL>`. The unit test's injected `gh` and the integration test's fake `gh` (POSIX) record every call, and both assert none is `create`; each was seen red with a `create` call added.
- **`gh` is spawned with no shell**, so the title is one argument whatever it holds. On Windows only a real `gh.exe` answers that way, which is why the fake-`gh` integration case is POSIX-only; the no-`gh` case runs everywhere. `gh` missing or signed out is said ("could not search for duplicates") and the draft goes ahead.
- **The token rule passes an honest config excerpt.** A value after `token`, `secret`, `password`, `apikey` or `authorization` counts only when it is 20 or more characters of letters and digits both, with no dot or space, so `process.env.API_TOKEN`, `'Bearer ' + token` and `API_TOKEN_FOR_THE_STAGING_SERVER` pass (the critique found the first draft refused exactly the `fetch.headers` excerpt a bug report would carry). The title is scanned too. A refusal writes nothing and names the line and kind, never the value.
- **The build is described from `--report` first.** `AIKB/last-build.json` is written only by a passing `kiss-ssg aikb`, so it can never show the failure being reported; it is the fallback and labelled "the last recorded passing build". The config is never read (that would run the build script).
- **`--status` needs no network for its answer**: it reads the installed `node_modules/kiss-ssg/CHANGELOG.md` (else this package's) for the `Fixes` link. `gh`, when signed in, only adds the issue's state. A bare mention, or a link whose text and URL numbers differ, is not a shipment.
- **`--filed` reads every log**, not the three a read-back reads, and `AIKB/site.md`, because a fix usually ships several sessions after it was filed, and consolidation moves Feedback into `site.md`.
- **The site URL** comes from the report's `thirdParty.siteUrl`, which is `null` when `siteUrl` is unset or local, or the build failed; then it is left out. `--anonymous` leaves the name and URL out, and the failing views too (their paths can name a client), keeping the counts.
- **Nothing throws out of `runIssue`.** A site `package.json` that is not JSON costs the draft its name (the folder's is used); an `--out` folder that is not there, or a `--report` that is not a report, is exit 2 with a sentence. The bin has no try/catch, so an escape would print a stack and exit 1, which means "refused" (fifth review).
