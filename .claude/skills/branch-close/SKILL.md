---
name: branch-close
description: End-of-branch ritual. Checks branch safety and freshness, then /secrets-scan, /docs-sweep, /corpse-collector, the version bump, /test-coverage-check --gate, the gates (`npm run gates`), an optional Codex review, /retrospective, then pushes and opens the PR. Run this instead of manually pushing — it is the single command that replaces the manual sequence.
---

# Close Branch

## When to use

Run `/branch-close` when you are ready to open a pull request. This replaces manually running the gates, docs-sweep, retrospective, and `gh pr create`. It is the standard end-of-branch ritual.

> **Sub-agent / fork hard stop.** This skill MUST only be invoked by the human operator typing `/branch-close`, or by Claude Code's main session acting on an explicit human instruction to close. It MUST NOT be invoked autonomously by any sub-agent, fork, or agent running a plan step. If you are a fork or sub-agent — STOP here. Return your findings to the main session and surface them to the user. The human decides when the branch closes, not the plan.

`/branch-close` is the **Verify & close** beat — the summative end of the three-beat dev loop (**Frame** `/branch-open` → **Steer** `/branch-pulse` → **Verify & close**, here). The split is deliberate: the pulse is *formative* (`npm test`, run often mid-branch); the close is *summative* (the full `npm run gates` battery). If the branch was pulsed, its `## Pulse log` already holds evidence against the success criteria, so the verification here reads that trail rather than starting cold. A branch that reaches close having never been pulsed is doing all its verification in one batch at the boundary — exactly the drift the pulse exists to prevent.

Do not run if:
- You are on the base branch — check first (`node scripts/base-branch.mjs`), stop if true
- There are no commits since the base — nothing to PR
- A PR is already open for this branch — use `/docs-sweep` + `/retrospective` alone to update it

---

## On invocation

Before running any steps, output exactly:

```
"Goodbye, I'm gonna miss you. You had such a good potential. But then again, all good things must come to an end." — Q
```

Then proceed.

---

## Handling findings mid-ritual

The ritual is designed to surface issues before they reach the PR. Pausing to discuss, brainstorm, or resolve a finding is the ritual *working* — not a failure. The steps are not a conveyor belt; they are checkpoints.

**Two types of findings, two responses:**

| Finding type | Examples | What to do |
|---|---|---|
| **Hard blocker** | A gate fails; the test coverage gate fires (uncovered logic, no exemption) | Stop. Fix. Commit. Rerun `/branch-close` from the top. |
| **Soft finding requiring judgment** | Codex flags a potential bug; corpse-collector surfaces a real dead reference; docs-sweep reveals something complex; the secrets scan hits a suspicious string | Pause. Discuss with the operator. Resolve. Then apply the resume rule below. |

**Resume rule — simple and safe:**

- **You made new commits to resolve the finding** → rerun `/branch-close` from Step 1. A new commit must be scanned for secrets (Step 2), may have documentation implications (Step 3), may add logic that needs tests (Step 5), and must pass the gates (Step 6). The early steps are cheap and idempotent; the cost of rerunning is low.
- **You resolved by decision only** (false positive confirmed, historical breadcrumb accepted, "proceed anyway" agreed) → continue from the next step. No new code means no new risk.

**If a finding reveals significant scope drift** — something genuinely outside the original remit that warrants real design work — pause the ritual, record a dated **Amendment** in the branch's intent artefact (`planning/sessions/<date>-<slug>.md`), and decide with the operator whether to absorb the work on this branch or defer it. Do not silently expand scope and proceed.

---

## Execution instructions

### Step ordering rationale

The sequence follows two principles: **cheapest and most critical checks run first** (an early exit saves the most downstream work), and **fixes precede the gate that validates them** (so a single gate pass covers everything).

- **Secrets scan (Step 2)** is the cheapest possible check and the hardest possible stop. If a real credential is in the diff, nothing else matters.
- **Docs sweep (Step 3), version bump (Step 4a) and test coverage (Step 5)** all happen *before* the gates so that documentation fixes, the bumped manifest, and any newly written tests are validated in the same gate pass — not in a second run.
- **Gates (Step 6)** validate the complete final state: code, docs, tests, and the bumped version in one authoritative pass.
- **Codex review (Step 7)** runs after the gates so expensive semantic review time is never spent on code a cheap gate would have rejected.
- **Retrospective (Step 8)** runs last among the checks — there is no value in reflecting on a branch that does not pass.

---

### Step 1 — Confirm branch state

```bash
BASE=$(node scripts/base-branch.mjs)
git branch --show-current
git log "$BASE..HEAD" --oneline
git status
```

`scripts/base-branch.mjs` resolves the integration branch this work merges back into — `main`, or the major line currently in development (`v2` today). Every step below that says "the base" means whatever it printed.

If on the base branch: stop, tell the user. If there are uncommitted changes: tell the user and ask whether to commit first before continuing.

Then check whether the branch is behind the base:

```bash
git fetch origin 2>/dev/null; git rev-list --count "HEAD..$BASE"
```

- If `git fetch` fails (offline or no network): note "could not reach origin — skipping freshness check" and continue. Never block on this.
- If the count is 0: silent pass.
- If the count is > 0: warn — "This branch is N commit(s) behind `$BASE`." Recommend merging (or rebasing onto) the base before continuing, so the rest of the ritual runs against an up-to-date base. This is the operator's call — never auto-merge.

### Step 2 — Secrets Scan

Invoke `/secrets-scan`. This scans the committed diff for key-shaped strings (always runs — cheap regex) and offers to invoke `/security-review` if the branch touches the modules that read the network or write outside the build directory (judgment call — the operator decides).

Runs here — before any other work — because a committed secret is the highest-severity stop condition. Discovering one after docs-sweep, coverage, and the gates would waste all of that work.

### Step 3 — Run /docs-sweep

Invoke `/docs-sweep`. This sweeps all commits on the branch for stale documentation — `AIKB/` module notes, the `CLAUDE.md` lookup table, `llms.txt`, `README.md` — and commits any fixes it makes. It runs **before** the gates so that anything it edits is validated by them, not pushed unchecked.

### Step 4 — Consider /corpse-collector (judgment call)

If the branch involved significant renames, module additions/removals, or public API changes, invoke `/corpse-collector` after docs-sweep. Skip for routine bug fixes. When in doubt, err toward running it — it is read-only and the cost is low.

Reason for running **after** docs-sweep: docs-sweep handles the targeted obligation-trigger updates (the things you knew to change); corpse-collector then catches the residual stale references the systematic pass missed. Any real corpse it surfaces that needs a fix is then caught by the gates below.

### Step 4a — Version bump

kiss-ssg is a **published npm package**, so semver here is a promise to consumers, not internal bookkeeping. The public API is: the methods on `Kiss` (`lib/kiss.js`), the `config` shape (`lib/config.js`), the built-in Handlebars helpers, the `utils` named export, `package.json`'s `files` whitelist, and `engines.node`. Anything a consuming site can observe.

Read the branch's **Impact surface** from its intent artefact (captured at `/branch-open`) — it was recorded to answer exactly this question. Then:

| Bump | When |
|---|---|
| **patch** (x.y.**z**) | Engine internals with the API unchanged, bug fixes, dependency updates, tooling and docs. The default for most branches. |
| **minor** (x.**y**.0) | A backwards-compatible addition to the public API — a new method, a new config option, a new built-in helper, a new file in the published tarball. |
| **major** (**x**.0.0) | A breaking change — a removed or renamed method, a changed default, a raised `engines.node` floor, a dropped export. |

**While the version carries a prerelease tag** (`2.0.0-alpha.0` today), the line is not yet published as stable and the bump is `npm version prerelease --preid alpha` regardless of surface — unless the operator is deliberately cutting the release, which is their call to make explicitly, never yours to infer.

State the proposed bump type and the reason, then confirm with the operator before proceeding. Then run:

```bash
npm version patch|minor|major|prerelease --preid alpha --no-git-tag-version
```

`--no-git-tag-version` edits `package.json` and `package-lock.json` without creating a git tag — the PR merge is the version event, and publishing is a separate deliberate act.

User-visible changes also get an entry in `CHANGELOG.md` at the repo root, written for someone building a site with kiss-ssg, not for someone maintaining it. Create the file if it does not exist yet (newest version first, `## <version> — <date>` headings). Write it alongside the bump, then commit both:

```bash
git add package.json package-lock.json CHANGELOG.md
git commit -m "chore: bump version to $(node -p "require('./package.json').version")"
```

The bumped version is validated by the gates in Step 6 — the `pack` gate in particular, which proves `llms.txt` and `AIKB/` still ship in the tarball.

### Step 5 — Test Coverage

Invoke `/test-coverage-check --gate`. This detects modules added on this branch that lack a matching `test/unit/` test and checks for inline `// @test-exempt: <reason>` justifications. In `--gate` mode it is a **hard blocker**: if uncovered logic files remain without an exemption marker, stop — write the missing tests and re-run `/branch-close`, or add `// @test-exempt: <reason>` near the top of each file, then re-run `/branch-close`. Branches with no new modules pass trivially.

Runs **before** the gates so that any tests written in response to this check are validated by the gate pass that follows — not in a separate re-run.

Use `/test-coverage-check` (no flag) mid-branch for advisory suggestions on what tests to write.

### Step 6 — Run the gates

```bash
npm run gates
```

`scripts/gates.mjs` runs four gates — **test** (`vitest run`, which includes `test/aikb.test.js`'s docs-sync check), **lint** (`eslint .`), **format** (`prettier --check` on the files this branch changed), and **pack** (`npm pack --dry-run`, proving `lib/`, `llms.txt` and `AIKB/` are all still in the published tarball) — printing a compact pass/fail line per gate with the salient tail on failure, and exiting non-zero if any fail.

kiss-ssg has **no CI and no pre-commit hook**, so this is not a parity check against a pipeline — it is the only thing standing between the branch and a broken published package. Treat a red gate as a hard stop: fix, commit, and re-run `/branch-close` (docs-sweep is idempotent and corpse-collector is read-only, so re-running the earlier steps is cheap). Do not run the retrospective or push until green.

### Step 7 — Codex review (judgment call)

If the branch carries **substantive engine changes**, run an independent Codex review of the diff before reflecting — skip it for docs-only or trivial branches, where a code review is a multi-minute round trip that finds nothing (the same judgment call as `/corpse-collector`). Skip it too — noting why in the close — if the Codex plugin isn't installed or authenticated in this environment: it needs per-user OpenAI auth that committed config can't supply, so not every operator will have it, and a missing reviewer must never block the ritual.

```bash
node "$(ls -d ~/.claude/plugins/cache/openai-codex/codex/*/scripts/codex-companion.mjs | tail -1)" \
  review --wait --base "$BASE" --scope branch
```

Call the companion script directly — **not** `Skill({ skill: "codex:codex-cli-runtime" })`. That skill declares itself for use only inside the `codex:codex-rescue` subagent and explicitly forbids `review` through that path (it is a `task`-only forwarder), so invoking it here loads a contract that refuses the request. The other slash command, `/codex:review`, has `disable-model-invocation` set and can only be triggered by the operator typing it. The companion script is therefore the one model-invocable route, and the glob keeps it working across plugin version bumps rather than pinning a path like `1.0.2/`.

Pass `--wait` so the review runs **synchronously** and the close blocks until the findings are back. The async `--background` pattern is for fire-and-forget work — it doesn't fit a linear ritual where this step gates the next. The review is **read-only**: it reports, it never edits.

It runs **after** the gates on purpose. Codex is the _semantic_ complement to the gates' _mechanical_ checks — it reads the diff for logic and design issues that test/lint/format/pack structurally can't see — so reviewing **known-green** code means an expensive review is never spent on code a cheap gate would have rejected.

Surface the findings and triage them **with the operator**: Codex output ranges from real bugs to nits and false positives, so this is a human call, not an auto-fail. **Fix-now** (commit the fix, then re-run the gates and this step) or **proceed** — the operator decides; a finding neither silently blocks nor silently passes.

### Step 8 — Run /retrospective

Invoke `/retrospective`. This writes the supervised-collaboration reflection to `planning/sessions/` and commits it (filling the branch's intent artefact if `/branch-open` created one). It runs **after** the gates deliberately — there's no point reflecting on a branch that doesn't pass. Scope that drifted during the branch and was recorded as **Amendments** in the intent artefact is legitimate emergent work — the reflection weighs it as good drift vs scope creep, not as a failure to match the original remit verbatim.

### Step 9 — Push and open PR

Push all commits (including any added by docs-sweep and the retrospective):

```bash
git push -u origin HEAD
```

Then open the PR **against the base branch** — while `v2` is the line of development, a PR opened against `main` would propose the entire v2 rewrite as its diff. **If this branch has an intent artefact** (from `/branch-open` — the `planning/sessions/` file whose `branch:` frontmatter matches), seed the Summary from its **Objective** and the Test plan from its **Success criteria**, so the reviewer reads the original intent beside the diff. Otherwise write them from the diff.

The PR body is the same in every case:

```markdown
## Summary
<1-3 bullet points — seed from the intent's Objective if present>

## What's deferred
<if nothing, omit this section>

## Test plan
- [ ] `npm run gates` passes (test, lint, format, pack)
- [ ] <the intent's Success criteria, if captured, each as a checkbox>
```

**How you open it depends on the surface.** `/branch-open` explicitly supports being run on the mobile / web harness, so the close must not assume a desktop CLI. Check what's available and take the first that applies:

1. **`gh` CLI present** (`command -v gh`) — the normal desktop path:

   ```bash
   gh pr create --base "${BASE#origin/}" --title "<concise title, under 70 chars>" --body "$(cat <<'EOF'
   <the body above>
   EOF
   )"
   ```

2. **No `gh`, but GitHub MCP tools are available** — the mobile / web harness case. Create the PR with the MCP `create_pull_request` tool, passing the same title and body, with this branch as head and the base branch as base. Do not try to shell out to `gh` first to "check" — its absence is the signal, and a failed command in the transcript is noise.

3. **Neither** — do not fail silently and do not leave the operator guessing. The push in this step has already succeeded, so the work is safe. Print the exact title and the complete body as a copy-paste block, plus the compare URL (`https://github.com/cprobert/kiss-ssg/compare/<base>...<branch>?expand=1`), and tell the operator the PR is the one remaining manual step.

### Step 10 — Report

Return the PR URL to the user. One line confirming: gates passed, docs swept, retrospective committed, PR open.

---

## Relationship to other gates

| Gate | Automated? | When |
|---|---|---|
| `/secrets-scan` | Invoked by `/branch-close` | Secrets Scan step |
| `/docs-sweep` | Invoked by `/branch-close` | Docs Sweep step |
| `/corpse-collector` | Invoked by `/branch-close` (judgment call) | Corpse Collector step |
| `/test-coverage-check --gate` | Invoked by `/branch-close` | Test Coverage step |
| `npm run gates` (`scripts/gates.mjs`) | Run by `/branch-close` | Gates step |
| `codex-companion.mjs review --wait` | Run by `/branch-close` (judgment call) | Codex Review step |
| `/retrospective` | Invoked by `/branch-close` | Retrospective step |

There is no CI workflow and no pre-commit hook in this repo — every one of these runs because this ritual runs it. Pushing without `/branch-close` skips all of them.
