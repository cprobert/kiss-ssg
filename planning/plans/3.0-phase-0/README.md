# Phase 0 work orders

The briefs for Phase 0 of [the roadmap to 3.0](../2026-11-10-roadmap-to-3.0.md). Written by Fable
on 2026-11-10 for a less capable model to implement. The operator chose this split the same day:
work orders written in the review session, each one implemented in its own fresh session.

## How to run one

1. Start a fresh session on `main` with the model the table names.
2. Give it one instruction: "Read `planning/plans/3.0-phase-0/<file>` and carry it out. Start
   with `/branch-open`, using the work order as the intent."
3. The implementer follows `CLAUDE.md § Working practice`. It stops at every **Stop and ask**
   condition instead of deciding.
4. When the steps pass, the implementer commits and pushes, and stops. The operator runs
   `/branch-close` when ready. Releases are operator-paced.
5. Fable reviews the diff against the work order before the pull request merges.
6. Delete the work order in the branch that completes it. The session log is the record.

If Sonnet fails a work order twice, the work order is at fault first: Fable rewrites it, and only
then does the task move to Opus.

## Reading the assumptions

Each assumption is marked **measured** (Fable ran the command or read the cited line on
2026-11-10, at commit `0ab9c7e`) or **inferred** (reasoned, not checked). Line numbers drift.
Re-check every assumption against `lib/` before relying on it; if one is false, stop and ask.

## Order

Mechanisms first, so that everything after runs under them. Within a group the order is free
unless a dependency is named.

| #   | Work order                                                         | Model  | Depends on | Needs the operator                    |
| --- | ------------------------------------------------------------------ | ------ | ---------- | ------------------------------------- |
| 01  | [Scope field and scope check](01-scope-check.md)                   | Sonnet |            |                                       |
| 02  | [Red-first record](02-red-first-record.md)                         | Sonnet |            |                                       |
| 03  | [Staging sweep spares live builds](03-staging-sweep.md)            | Sonnet |            |                                       |
| 04  | [Fetch redirects with custom headers](04-fetch-redirects.md)       | Sonnet |            |                                       |
| 05  | [Alias patterns](05-alias-patterns.md)                             | Sonnet |            |                                       |
| 06  | [Sitemap escaping and the watch log line](06-small-hardening.md)   | Sonnet |            |                                       |
| 07  | [Hashed JavaScript imports: build the case](07-js-hash-imports.md) | Sonnet |            | Decides what happens after the report |
| 08  | [Packed-tarball test](08-packed-tarball-test.md)                   | Sonnet |            |                                       |
| 09  | [Scale test](09-scale-test.md)                                     | Sonnet |            |                                       |
| 10  | [Pin actions and restrict the CI token](10-ci-pins.md)             | Sonnet |            |                                       |
| 11  | [Publish from CI with provenance](11-ci-publish.md)                | Sonnet | 10         | npm trusted publishing, before start  |
| 12  | [Budgets report](12-budgets-report.md)                             | Sonnet |            |                                       |
| 13  | [Stop committing the built docs](13-docs-output.md)                | Sonnet |            | Yes or no, before start               |
| 14  | [Doc defects the clean rooms found](14-doc-defects.md)             | Sonnet |            |                                       |
| 15  | [Recipes in CONTRIBUTING.md](15-contributing-recipes.md)           | Sonnet | 01, 02     |                                       |
| 16  | [Cut CLAUDE.md to rules](16-claude-md-rules.md)                    | Opus   | 15         | Reads the result                      |
| 17  | [Close-out](17-close-out.md)                                       | Sonnet | all others | Runs the fleet baseline               |

## Rules that apply to every work order

- No file outside **Paths in scope** changes. If the work needs one, stop and ask.
- `llms.txt` has 4 characters of headroom under its 16,000-character cap (measured). No work
  order here adds to it. If a test demands an `llms.txt` line, stop and ask.
- A new test is seen to fail before the fix is written. Until work order 02 lands, paste the
  failing output into the session log by hand.
- The version bump and the `CHANGELOG.md` entry belong to `/branch-close`, not to the implementer.
- Do not run a `--dev` server. Do not run two builds into one folder.
