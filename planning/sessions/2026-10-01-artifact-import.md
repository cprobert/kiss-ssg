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

- **2026-10-01 — the input is AI-generated single-page HTML, not "a Claude artifact".**
  The real precedent (`Probert-Family/k9-solutions`, `cb0b5b2`) states in its own commit
  message that it rebuilt "the ChatGPT-generated single-page site". The Objective above
  says Claude artifact; read it as any agent-written single-page HTML. Widens who the
  skill serves and costs nothing — the decomposition does not care which model wrote
  the file. The branch name `feat/artifact-import` stands.

- **2026-10-01 — the stylesheet is in scope, by operator decision at the first pulse.**
  Measured on the precedent: the import decomposed the markup into 15 partials and a
  213-line model, and carried the CSS across untouched — 14,120 bytes in 20 lines,
  longest line 1,803 characters, average 705. Its own first line says "carried over
  from the original single-file site". Two later polish branches touched the file and
  neither split it; at HEAD it is still 5 lines over 1,000 characters. The site
  therefore uses no Sass at all, despite kiss shipping first-class Sass support.

  Asked at the pulse whether that meets the "handoverable to a web developer without a
  rewrite" bar, the operator answered **no — make it a criterion**. A new success
  criterion is therefore added:

  - [ ] The conversion breaks the stylesheet into readable, structured Sass under
        `folders.assets`, partitioned to match the section partials — not carried across
        as one blob. No line in the output exceeds a reviewable length.

  This expands the remit from "decompose the markup" to "decompose the page", which is
  what the objective's handover promise actually requires. Recorded here rather than
  split off, per the one-open-branch rule.

- **2026-10-01 — the model is the skill's to produce, not the engine's.** Criterion 3
  asks the conversion to lift repeated content into a JSON model. Building the two
  splitters made the boundary concrete: `lib/html-split.js` cuts the document into a
  layout, partials and a page view, and stops there. `hero: { kicker, heading, intro }`
  is semantic naming — a module guessing at it would emit field names no human would
  have chosen, and no test could tell a good guess from a bad one. Put to the operator
  at the second pulse with three options; the answer was **the skill does it, the lib
  does not**.

  So the division across this branch is now explicit, and it is the same one in both
  halves: the engine does what is provable and the skill does what is judged.

  | Mechanical, in `lib/`, unit-tested     | Judged, in the skill, reviewed by a person |
  | -------------------------------------- | ------------------------------------------ |
  | Parse, cut, re-indent, round-trip      | What a region means and is called          |
  | Segment a stylesheet, keep the cascade | Which words become model fields            |
  | Report inline assets worth lifting     | Where they go, and rewriting the tags      |

  Criterion 3 is therefore met by the engine only as far as _structure_; its model
  clause is carried by the skill slice and is not a `lib/` obligation. Recorded so the
  close scores it against what was actually agreed rather than against the original
  wording.

## Pulse log

- **2026-10-01** — research slice; 0 of 7 criteria met, nothing built (branch carries
  the intent file alone, 120 insertions). No checks run: no `lib/`, `test/` or example
  changed, so a test run would have been theatre. The slice replaced the planned
  hand-conversion of a fixture with the real precedent — `Probert-Family/k9-solutions`,
  attached read-only and cloned, where `cb0b5b2` converted one single-page site into 37
  files. **Measured** there: the CSS was carried across unsplit (20 lines, 14,120 bytes,
  longest 1,803 chars) and is still so at HEAD after two polish branches; the source
  artefact was never committed, so that conversion cannot be diffed or re-run.
  **Inferred** from the output (which has had two polish passes since import, so this is
  the refined shape rather than day-one): one `<section>` → one partial under
  `partials/sections/`, chrome → `partials/site/`, inline SVG → `partials/icons/`; the
  page view becomes a list of partial calls each handed a model slice; the model's
  top-level keys mirror the partial names; facts stated more than once move to
  `config/site.js`; a repeated page shape becomes `.pages()` + a model folder + a
  controller. **Eyeball: looked** — operator opened `site.css` at `cb0b5b2` and judged it
  does not meet the handover bar, directing that CSS decomposition become a success
  criterion. Both amendments above recorded. Decision: **record amendment, continue.**

- **2026-10-01 (second)** — both splitters built. Criteria **5 and 8 met**:
  `lib/css-split.js` and `lib/html-split.js` each carry an `AIKB/` doc, a `CLAUDE.md`
  row, a `test/unit/` sibling and regenerated types (`/test-coverage-check` advisory:
  both added modules covered, nothing uncovered); the stylesheet comes out as 19
  partials with a longest line of 82 characters against the input's 1,803. Criteria
  **2, 3 and 7 partial**, **1, 4 and 6 not yet**. Evidence: 238 tests green across
  `aikb`, `css-split` and `html-split`; full suite 1,939 passed / 4 skipped; all five
  gates pass. End-to-end against the **live** `k9solutions.uk` page (21,213 bytes,
  longest line 17,405) — 28 files out, both round trips exact, and the cut found the
  same eleven regions the hand conversion chose.

  Three defects were found by the round trip rather than by design, and no gate would
  have caught any of them: whitespace between inline `<em>` elements was being eaten,
  `<path/>` was being normalised to `<path></path>`, and the live page's two
  `<script src>` tags were dropped outright. The third exposed an inconsistency worth
  naming — the module was removing inline assets while claiming to reproduce the
  document, which it cannot do both of; assets are now reported, not removed.

  **Eyeball: deferred** — operator away from a laptop; written to `to-verify.md` § 4
  with the four files named, and a note that `examples/12-…` supersedes it as the
  artefact once that slice lands, since that one builds. Decision: **record amendment,
  continue** — next slice is the `kiss-site-import` skill, which now has a settled
  contract to encode.

- **2026-10-01 (third)** — the `kiss-site-import` skill and
  `examples/12-from-a-single-file` both landed. Criteria **1, 3, 4, 5 and 8 met**,
  **2 met mechanically**, **7 partial**, **6 not yet**. Evidence: the example builds
  through the published CLI from its own folder —
  `ok ./public (check) — 2 pages, 0 failed, 5 assets`, 10 links none broken, audit
  **none**; full suite 1,954 passed / 4 skipped; all five gates green. Criterion 7's
  remainder is **`GUIDE.md`**, which also needs a page in `src/models/guide.json` or
  `node docs` fails — so it travels with the docs work rather than ahead of it.

  The skill's six coverage rows and two `CONTRADICTIONS` bans were all seen red
  before being accepted, by writing both wrong sentences into the skill and watching
  three tests fail. The example's own test was weak when first written — it passed,
  but `compare.mjs` only exited non-zero on structure, so a conversion that mangled a
  paragraph would have looked clean. Fixed by giving the tool a declared `ACCEPTED`
  list, after which a one-word change to the model turns the test red; verified both
  ways.

  **Four repo-level gaps surfaced by building the example**, each fixed rather than
  worked around: `findTag` was not exported (a caller verifying a conversion needs
  one element out of a parsed document); eslint ignored `public/**` at the root only,
  so an example's build output was linted as Node and failed on `document`;
  `.converted/` had neither a `!` entry in `files` nor a `FORBIDDEN_PACKED` pattern,
  which is the exact shape that once shipped 75 files; and prettier wants to rewrite
  `.9fr` to `0.9fr` in the splitter's output, where the splitter is right to copy
  declarations verbatim — both it and the artifact are now prettierignored with the
  reason recorded.

  **Eyeball: deferred (second time)** — operator still away from a laptop.
  `to-verify.md` § 4 rewritten: it no longer names four attached files with no way to
  regenerate them, but a single `npm run eg12` and the two paths to open side by
  side, with the element/text comparison explicitly marked as already automated so
  the look is spent only on what a person can judge. Decision: **continue** — the
  clean-room run (criterion 6) is the last substantive slice.

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
