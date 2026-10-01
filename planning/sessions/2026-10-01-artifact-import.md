---
branch: feat/artifact-import
base: main
status: open
opened: 2026-10-01
---

# Session — 2026-10-01: Importing a Claude artifact into a kiss site

## Intent (captured at /branch-open)

**Objective:** Give someone who already has a working single-file HTML page — a Claude
artifact, an exported page, something an agent designed in a chat window — a supported
path into a structured kiss site, so that the thing they already approved becomes
maintainable, scalable and handoverable without being rewritten.

### Why this branch exists

The site address was sent to a colleague and it did not set him up. The diagnosis
that followed is the brief: **nothing in the package serves him.**

- `kiss-site-new` builds "from a **description** of what it should contain" — he has
  the artifact, not a description.
- `kiss-site-migrate` covers kiss v1 → v2 only.
- `kiss-page-add` needs a site that already builds.

And the single-file page — his exact starting point — appears three times in shipped
guidance purely as the failure state to avoid (`kiss-site-new/SKILL.md:96`,
`kiss-site-review/SKILL.md:94`, `README.md:33`) and zero times as an input to convert.

So the website was not failing to explain kiss. It was correctly reflecting a package
with no door for him. Tooling first, because the site cannot honestly promise what the
package does not do.

**Success criteria:**

- [ ] A real single-file HTML artifact, run through the skill, produces a site whose
      `npx kiss-ssg check` reports 0 failed pages and 0 broken links.
- [ ] The converted site renders equivalently to the input — the operator opens both
      and says so. Taken mid-branch at a `/branch-pulse`, not at the close.
- [ ] The conversion produces the structure kiss's conventions name, never one file:
      a `layout.hbs`, at least one partial, one view per page, styles in the Sass
      folder, repeated content lifted into a JSON model.
- [ ] A runnable example ships it (`examples/12-…`), carries the source artifact beside
      the converted site so the before/after is readable, runs from `npm run eg12`, and
      is covered by `test/integration/examples.test.js`.
- [ ] The new `lib/` module has an `AIKB/` doc, a row in the `CLAUDE.md` table, a
      `test/unit/` sibling, and regenerated `types/` — all in the same commit.
- [ ] **Clean-room:** a fresh sub-agent, given only what ships (the packed tarball and
      the docs a user would read) and one artifact HTML file in an empty folder,
      reaches a passing `kiss-ssg check` — and reports every place it had to guess.
- [ ] `llms.txt`, `README.md` and `GUIDE.md` cover the new public surface, with a row
      in `test/unit/skill-coverage.test.js`.

**Non-goals / out of scope:**

- **The docs-site "Start here" track.** The whole reason this branch is tooling-first;
  the site work is a deliberate sibling branch, opened after this one closes.
- **React / JSX artifacts.** First cut targets HTML with inline or `<style>` CSS. If
  the decomposition dead-ends on a React artifact, that is a finding, not a task.
- **Deploy setup** — Netlify/Firebase configuration, domains, hosting walkthroughs.
- **Rewriting `kiss-site-new` or `kiss-site-review`** beyond the minimum needed to
  point at the new skill instead of only warning against single-file pages.
- **Publishing.** No `npm publish` on this branch.

**Impact surface:** public API — a new `lib/` module plus a skill and an example.
The `exports` map has one entry (`.` → `lib/kiss.js`), so a helper a skill can actually
reach must be an export or a `bin/` subcommand; either is observable by a consuming
site. That obliges `llms.txt` + `README.md` + `types/`, and makes the proposed bump a
**minor** (2.7.0), not a patch. Recorded here because `/branch-close` Step 4a reads
this field.

**Expected shape:** between — the example and the skill's structure are plannable; the
decomposition rules themselves (what becomes a partial, what becomes a model, when to
stop) are emergent and get fixed by running real input through them. Neither party has
converted an artifact yet, and pretending otherwise would be the planned-shape lie.

**Delegation convention:** main session builds — the skill, the `lib/` module, the
example. Sub-agents **verify only**: the clean-room run and one adversarial read.
**Agents never commit**; the operator's diff review is the checkpoint, and a sub-agent
that commits removes it.

**Contract:** none — one workstream.

### Inherited feedback this branch carries

Read back across all 26 logs at open, cross-checked against
`.claude/skills/memory-consolidate/retired.md`. The bench-baseline contradiction
(09-10, 09-12, 09-16) is **resolved** — `CLAUDE.md:111-113` defers to the skill and
`.claude/skills/bench/SKILL.md:25` states the rule — so it is not carried.

| Lesson                                                         | Recurred                                                  | Carried as                                                |
| -------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| Claude **invokes** `/branch-pulse` — never a hand-written line | 09-26, 09-30, _after_ its 09-05/06/07 retirement          | Every slice boundary is a real `/branch-pulse` invocation |
| The operator eyeball taken **mid-branch**, not deferred        | 09-30, _after two_ retirements (09-09 close, 09-16 pulse) | Written into the criteria above as a pulse-time check     |
| Open the branch **before** the work                            | 09-15, 09-30                                              | Satisfied: nothing has been built                         |

`/memory-consolidate` was **recommended and not run** at this open. Trigger: the pulse
and the eyeball have each recurred after retirement, which `retired.md`'s own preamble
calls evidence the destination was wrong. The most recent consolidation (`285edeb`)
retired "commands on their own line" and "check nothing is serving a folder"; neither
is the pulse or the eyeball, both of which appear in 2026-09-30's Feedback. It is a
separate beat and its `CLAUDE.md` edits do not belong in this branch's diff.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
