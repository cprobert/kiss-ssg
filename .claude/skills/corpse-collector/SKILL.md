---
name: corpse-collector
description: Audits the repo for dead references — documented methods that no longer exist on Kiss, config keys the docs promise that lib/config.js doesn't define, file paths cited in docs that aren't on disk, `npm run` scripts with no matching package.json entry, stale slash-command names, and remote branches already merged. Produces a prioritised checklist. Does not auto-fix — findings require developer judgment. Run after major renames, before a release, or whenever the repo has had a burst of architectural change.
---

# Corpse Collector

## When to use

After a session involving significant renames (modules, methods, config keys, skills), before cutting a release, or as a periodic hygiene check. Not every PR — `test/aikb.test.js` already covers the highest-risk failure mode (a `lib/` module whose doc went missing), and `/docs-sweep` covers this branch's diff. This skill catches the longer tail, repo-wide: prose that still promises something the code stopped providing.

That tail matters more here than in most repos, because `llms.txt` and `AIKB/` **ship inside the published npm package**. A stale method name in `llms.txt` is not a doc bug someone will notice next time they read the source — it is a wrong answer handed to an agent working inside `node_modules/kiss-ssg/` with no source to check it against.

Findings require human judgment — some are genuine corpses; others are intentional historical context. Review the report before acting.

---

## On invocation

Before running any checks, output exactly:

```
Bring out your dead!
Bring out your dead!
```

Then proceed.

---

## Execution

The skill is split in two: a script **gathers** candidate findings deterministically, and you **judge** them. Gathering is mechanical and easy to get subtly wrong by hand, so it lives in code; judging needs a model.

### Step 1 — Gather

Run the scanner from the repo root. It performs all seven checks and prints a candidate-findings report:

```bash
node .claude/skills/corpse-collector/scripts/scan.mjs
```

**Run it as a black box — do not hand-roll the greps.** The script encodes its exclusions in the file walk rather than in a downstream text filter: it skips `docs/` (build output — `docs.js` empties it every run) and `planning/` (specs, plans and session logs are intentionally historical — they record what was true when written), plus vendored skill bundles (any skill folder with a `LICENSE.txt`, which are full of generic examples that refer to nothing in this repo). A trailing `| grep -v planning/` would silently stop working the moment a check was switched to `grep -o`, which drops the filename the filter reads. Re-deriving the commands reintroduces that whole class of bug; running the script cannot.

What each check gathers:

- **Check 1 — missing paths:** repo paths cited in `CLAUDE.md`, `README.md`, `llms.txt`, `AIKB/*.md` or a skill that don't exist on disk. _(The highest-value check — a wrong path is almost always a real corpse.)_
- **Check 2 — skill names:** a skill folder with no `SKILL.md`, or whose `name:` frontmatter doesn't match its folder name.
- **Check 3 — slash commands:** `` `/x` `` references in `CLAUDE.md`, `README.md` or `.claude/` that resolve to no skill folder and no known built-in.
- **Check 4 — public API drift:** `kiss.foo()` call sites and `llms.txt`'s `` - `.foo(…)` `` API bullets naming a method that `lib/kiss.js` does not define.
- **Check 5 — npm scripts:** `npm run x` in the docs with no `x` in `package.json`'s `scripts`.
- **Check 6 — config keys:** `config.foo` / `config.folders.foo` in the docs with no matching key in `lib/config.js`'s `DEFAULT_CONFIG` / `DEFAULT_FOLDERS`.
- **Check 7 — remote branches:** remote branches fully merged into the base (deletable). Integration branches are never flagged.

### Step 2 — Judge

The scanner gathers; it does not decide. A genuine corpse is a live reference that **claims something still exists when it doesn't**. In a healthy repo most candidates are the opposite — _intentional_ context: a doc noting that `lib/kiss.js` deliberately has no `test/unit/kiss.test.js`, a "v1 did X, v2 does Y" migration note, a staleness-pattern example. Those are not corpses (see **What NOT to flag**). Classify each candidate into the report below; for real corpses, propose the fix but do not apply it — this skill is advisory.

---

## Report format

Produce a prioritised report. Priority 1 findings should be fixed immediately; priority 3 findings are informational.

```
## Corpse Collector Report — {date}

### Priority 1 — Published surfaces promising something that doesn't exist
(llms.txt, README.md, AIKB/ — these ship in the npm package or are the front door;
a wrong answer here reaches consumers and agents, not just maintainers)
- [ ] {file}:{line} — {finding} — {recommended action}

### Priority 2 — Internal docs referencing stale names
(CLAUDE.md, skills — these mislead the next developer but don't reach consumers)
- [ ] {file}:{line} — {finding} — {recommended action}

### Priority 3 — Source comments, dead folders, stale branches
(Low-risk hygiene; fix when convenient)
- [ ] {file}:{line} — {finding} — {recommended action}

### Intentionally historical (do not fix)
- {file}:{line} — {reason for excluding}

### Clean
- {check}: no findings
```

---

## What NOT to flag

- **`planning/`** — specs, plans and session logs are intentionally historical; they record what was true at the time. The scanner already excludes them at the source (it skips the directory during its walk). Don't reintroduce them by re-running a check by hand.
- **`docs/`** — build output, regenerated by `node docs` from `src/`. Also excluded at the walk.
- **Deliberate absence notes** — `AIKB/testing.md` says `lib/kiss.js` has no `test/unit/kiss.test.js` (it's covered by `test/integration/`). Check 1 flags that path as missing on disk, and it is _supposed_ to be missing. Same class: "v1 did X", "replaced by Y", "this was removed in v2".
- **Migration sections** — `llms.txt` § Migrating from v1 and `README.md`'s v1→v2 notes name old APIs on purpose.
- **Git commit messages and `git log` output** — historical record, never edited.
- **Generic examples inside vendored skills** — the scanner skips these, but if one surfaces, it's an example, not a corpse.

---

## Relationship to other gates

| Gate                | Scope                                          | Automated?                         |
| ------------------- | ---------------------------------------------- | ---------------------------------- |
| `test/aikb.test.js` | `lib/` ↔ `AIKB/` ↔ the `CLAUDE.md` table       | Yes — every `npm test`             |
| `/docs-sweep`       | Stale documentation for **this branch's diff** | No — invoked by `/branch-close`    |
| `/corpse-collector` | Dead references across the **whole repo**      | No — invoked, developer discretion |

The test catches the fire. `/docs-sweep` sweeps before every PR. `/corpse-collector` is the deep clean.
