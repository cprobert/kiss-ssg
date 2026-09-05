---
name: docs-sweep
description: Pre-PR documentation sweep. Scans all commits since the base branch, maps them to the documentation surfaces they endanger (AIKB module notes, the CLAUDE.md lookup table, llms.txt, README.md), updates what is stale, and reports what changed. Use before every pull request to ensure documentation joins all the dots across the full commit set.
---

# Docs Sweep

## When to use

Run `/docs-sweep` before opening a PR. `test/aikb.test.js` enforces the hard contracts at test time — every `lib/` module has an `AIKB/` doc, every doc is listed in `CLAUDE.md`, no doc is orphaned, no doc drops a template heading — but it cannot tell whether the _prose inside_ those docs is still true. The full shape of a change, and the connections between commits, only becomes clear at the PR boundary. This skill does the holistic sweep the test cannot.

---

## On invocation

Before scoping the branch, output exactly:

```
Read all about it!
Read all about it!
```

Then proceed.

---

## What it does

1. **Scopes + categorises** — `.claude/skills/docs-sweep/scripts/scope.mjs` diffs the branch against its base and maps each changed file to the documentation surfaces it endangers, printing which docs to review.
2. **Reads candidate docs** — opens each triggered doc and reads it against what actually changed.
3. **Updates** — makes surgical edits to stale surfaces.
4. **Verifies** — prettier-checks the edited Markdown (not the suite — see Step 4 for why).
5. **Reports** — what was updated, what was left alone and why, and anything needing human judgement.

The split: the script **gathers** (which docs are at risk — mechanical), you **judge** (is each one actually stale — not mechanical).

---

## Execution instructions

### Step 1 — Scope (run the scanner)

```bash
node .claude/skills/docs-sweep/scripts/scope.mjs
```

**Run it as a black box — don't hand-walk a trigger table.** The script resolves the base branch, diffs against it, maps every changed file to its documentation obligations, and prints the docs to review — plus `ACTION:` lines for the triggers that are a command rather than a doc. The trigger map lives in the script as the single source of truth, so it can't drift from a copy kept here. Files that trigger nothing are listed as informational.

### Step 2 — Read and compare

For each triggered doc, read it and compare against the actual diff. Ask: "Does this doc correctly describe the current state of the code?" If not, what specifically is wrong?

Common staleness patterns in this repo:

- An `AIKB/` doc's **Public interface** section listing a function signature that changed, or a **Depends on** / **Depended on by** list that a new import made wrong.
- An `AIKB/` doc's **Non-obvious behavior** section describing a workaround that the change removed — the highest-value section and the easiest to leave stale.
- `llms.txt` promising a method, option or default that no longer exists. This one matters most: `llms.txt` ships **inside the npm package**, so an agent reading it from `node_modules/kiss-ssg/` has no source to fall back on.
- `README.md` and `llms.txt` disagreeing with each other — they duplicate the API by design, which means they drift by default.
- Count references ("6 runnable examples", "two classes", "four gates") that are now wrong.
- `CLAUDE.md`'s **Pipeline in one paragraph** describing a build order the change reshuffled.

### Step 3 — Update

Make surgical edits. Touch only what the change warrants; don't rewrite surrounding content. Each edit should be traceable to a specific commit in the diff.

Update order (so you don't read docs you are about to change):

1. `AIKB/*.md` — the per-module detail
2. `llms.txt` — the shipped consumer cheat-sheet
3. `README.md` — the front door
4. `CLAUDE.md` — the lookup table, the one-paragraph pipeline, the rules

### Step 4 — Verify

docs-sweep edits Markdown and `llms.txt`, so the heavy gates don't apply. Prettier-check the files you actually edited:

```bash
npx prettier --check <files you edited>
```

Do **not** run `npm test` here. Within `/branch-close`, `npm run gates` runs right after this step as the final validation. The one exception worth a fast local check: if you added or removed a `lib/` module or an `AIKB/` doc, run the sync test now so a missing table row is caught before you commit rather than at the gate:

```bash
npx vitest run test/aikb.test.js
```

### Step 5 — Report

Produce a concise summary in this format:

```
## Docs-sweep report — [branch name]

### Commits in scope
[list from scope.mjs]

### Documentation updated
- [file]: [what changed and why]

### Checked and confirmed current
- [file]: [why no change was needed]

### Requires human judgement
- [item]: [what the ambiguity is — don't guess, surface it]
```

---

## What to leave for human judgement

Do not guess at these — surface them explicitly in the report:

- **A public API change that isn't obviously intentional.** If the diff changed a method signature, a config default, or `engines.node`, say so plainly and let the operator confirm it is deliberate — it decides the semver bump at `/branch-close` Step 4a.
- **Rewriting an `AIKB/` doc's Non-obvious behavior section.** These record hard-won findings (v1 bugs, race conditions, Windows path quirks). Note that a claim looks stale, but do not delete a warning you cannot prove is obsolete.
- **New `AIKB/` docs for a new module.** Propose the five-heading skeleton, but the Non-obvious behavior section has to come from whoever wrote the module.
- **Anything under `planning/`.** Specs and plans are historical: they record what was decided at the time. Never "correct" one to match the code.

---

## Relationship to other gates

| Gate                                  | What it catches                                                                                                                  | When it runs                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `test/aikb.test.js`                   | Hard failure: a `lib/` module with no doc, an orphaned doc, a doc missing from the `CLAUDE.md` table, a dropped template heading | Every `npm test`                                   |
| `npm run gates` (`scripts/gates.mjs`) | test, lint, format, pack                                                                                                         | Gates step of `/branch-close`, after docs-sweep    |
| `/docs-sweep`                         | Holistic doc staleness across the full branch — the prose the test can't read                                                    | Docs Sweep step of `/branch-close`                 |
| `/corpse-collector`                   | Dead references across the whole repo, not just this branch's diff                                                               | Judgment call in `/branch-close`, after docs-sweep |

`npm run gates` owns correctness; docs-sweep owns doc accuracy. They run back-to-back in `/branch-close` (docs-sweep, then gates as the final pass), which is exactly why docs-sweep must not re-run the suite — the gates do it, over the post-sweep state.
