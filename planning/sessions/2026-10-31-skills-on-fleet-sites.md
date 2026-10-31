---
branch: chore/skills-on-fleet-sites
base: main
status: open
opened: 2026-10-31
---

# Session — 2026-10-31: Testing the kiss-ssg skills on the real fleet sites

## Intent (captured at /branch-open)

**Objective:** Test the shipped kiss-ssg skills on real sites under `C:\Code\kiss\`, so the domain skills are judged by the sites they produce rather than by reading them, and fix in this repo what the sites show to be wrong or missing.

**Success criteria:**

- [ ] Each in-scope site (a1k9training, pro-plumbing, k9-solutions, swan-love) is wired to this working tree's engine and plugin, builds with `kiss-ssg check`, and its git tree is clean again afterwards (`git status` with exit code shown, and `safe.directory` where the memory says plain status lies).
- [ ] **Review pass:** `kiss-site-review` has run on each in-scope site, and each finding is graded true, false or unclear, with the site defects it missed listed beside it.
- [ ] **Trigger test:** a fresh agent, given an ordinary task on a site and not told the skills exist, is observed to invoke (or not invoke) the relevant skill. The count of runs and invocations is recorded per skill, measured from the transcripts, not inferred.
- [ ] **With-and-without:** at least one domain skill is measured by building the same brief on a site with the skill and without it, and the two results are compared on the page, not on the agent's account of it. `kiss-seo` is the first candidate, as the least evidenced of the domain skills.
- [ ] Every skill change made on the branch traces to a recorded finding, and the failing run that prompted it is re-run against the changed skill and seen to change.
- [ ] A findings report under `planning/reviews/` records, per site and per skill, what was run, what it found, and what was changed or deliberately left.
- [ ] The operator has read at least one changed skill end to end before close.

**Non-goals / out of scope:** Fixing the sites themselves; their defects are recorded in the report, never committed to their repos. Engine (`lib/`) changes; a finding that needs one is recorded for a later branch. Upgrading the sites' declared kiss-ssg version. metacarpus (no CMS data, builds zero pages), medulla (1.x, its router writes `.env`) and the three sites with no `package.json`. `kiss-page-add`, `kiss-site-migrate` and `kiss-build-check` as tasks in their own right, except where the trigger or with/without runs reach them.

**Impact surface:** tooling & docs — the skills under `plugins/kiss-ssg/skills/` and a report in `planning/`. Patch bump at most.

**Expected shape:** emergent — the findings decide which skills change.

**Delegation convention:** This session briefs, compares the results and edits the skills. Fresh sub-agents run the trigger and with/without tests, because a session that has discussed the skills cannot test whether an agent finds them. Agents never commit, never change a site's tracked files, and never run repo-scoped commands (`/branch-*`, `/code-review`) in a site folder. Each brief gives Windows paths with forward slashes, quoted.

### Inherited feedback carried into this branch

- Pulse at every slice boundary and after each amendment, not once (five logs, 2026-09-21 to 2026-10-30). Each site is a slice.
- Run repo-scoped commands from the repo they change; this branch works inside site folders and edits kiss-ssg (2026-10-30).
- Read a changed skill end to end before close (2026-10-30, twice).
- Zero invocations in three runs is a finding about skills in general (2026-10-13); its trial harness is reusable.
- `/memory-consolidate` is recommended after this branch: the pulse lesson has recurred in five logs past its retirement.

### Amendments

<!-- Where adjacent scope drift is absorbed: if the remit legitimately expands
     mid-branch, append a dated note here and stay on the branch — a new branch is
     the operator's call, never spawned on initiative. Good drift gets recorded;
     it is not silent scope creep. -->

- **2026-10-31 — wiring: a packed copy in a site copy, not a junction in the site.** The operator chose "branch skills and engine via a junction". A junction lets a test agent with write access edit this repo through `node_modules/kiss-ssg`, so each arm runs instead in a robocopy of the site under the session scratchpad, with this tree's `npm pack` tarball installed into it (`--no-save --no-package-lock`), its remotes removed and its `settings.local.json` (which pre-approves commit, push and `gh pr` on a1k9training) replaced by a deny-list. Same engine and skills, and the real site folders are only read. The plugin loads by `--plugin-dir` from this tree under `--setting-sources local`, so the marketplace copy does not load. Measured by a smoke arm: 12 kiss skills visible, `git push` denied. Side effect, recorded rather than fixed: the sites' own `.claude/skills` do not load under these settings either, and three managed `cc-plugin-*` plugins load in every arm.

- **2026-10-31 — adding replicates; improving is the review's.** The operator, mid-branch: "when adding we should look to make perfect replicas. I think improvements should come as part of a review process". `kiss-page-add` now makes a new page or record a faithful replica of the most similar existing one (structure, markup, headings, voice), flaws included. A flaw it notices goes in the hand-over for `kiss-site-review`. Domain skills settle only what the original does not, and the original wins where they disagree. The firmer writing rule is scoped to the sentences added, in the replicated page's voice.
- **2026-10-31 — swan-love dropped.** The operator: "You can skip swan love". Its arms were stopped mid-run. Its build check (`ok`, 11 pages, five orphans and six audit checks firing) and any arms that completed before the stop are kept as data but not graded. The success criteria's four sites become three.

## Pulse log

<!-- Appended by /branch-pulse, one dated line per mid-branch checkpoint:
     criteria status + evidence + the continue/adjust/amend/close decision.
     Append-only — the Intent above stays immutable; criteria are ticked only at close. -->

- **2026-10-31** — slice 1 of 4 (a1k9training). Wiring: met for a1k9 (check `ok`, 20 pages; real tree `git status` exit 0, empty). Review pass: both runs graded, with three re-run claims verified in source (border `#d7cdb9` = 1.58:1, "a day or two" against the policies file's "a few days", the vet-doc link), the doc's content unverified (external), and the lockfile row a harness artefact (`--no-save` install). Trigger, from transcripts: 4/4 tasks invoked the right top-level skill; domain skills opened from inside a task skill, review 0→6 after the link fix, page 0→0 with no measured loss. With/without `kiss-seo`: no measurable difference on one brief, one run each; both arms' facts match the models. Fix `a5c6484` traced and re-run; its test red on HEAD (4 skills), green after. My own error, corrected by an arm: I put the five changed course pages down to site edits; they are build-time course dates (`anchorSunday`). **Eyeball: looked** — the operator opened `runs/a1k9-review-r2.report.md`: "it holds up". **Offer:** the review's cost rising from $1.33/4 min to $8.33/12 min with the six skills loaded — operator: keep. Decision: continue, pro-plumbing next.
- **2026-10-31** — slice 2 of 4 (pro-plumbing). Wiring: check `ok`, 7 pages; real tree `git status` exit 0, empty. Review: 6/6 domain skills opened ($6.83, 12 min); every claim checked held (ring `#E85C25` on slate-700 = 2.78:1, the 18 Sept header change recorded in the stylesheet, the thanks page's "water through a ceiling" against the FAQ's no-emergencies). Trigger: 8/8 across two sites. `kiss-seo` with/without: no clear benefit again; only the with arm rewrote titles into searchers' words. Keyboard arm with `kiss-accessibility` gave a false all-clear: measured in installed Chrome at 375×667, forward Tab to "Your name" leaves it 100% under the call bar; fix `f455b30` (screenshot before passing check 5), re-run queued. Migrate note `7816771`: the site's SEO check passes on 2.7.0, 36 failures on 2.8.4. **Eyeball: looked** — the operator opened the focused-field screenshot: "yes it's hidden". **Offer:** leaving `kiss-page-add` unchanged despite two wording slips with no domain skill opened — operator: **overturn, make it firmer**, reason: "Words are the product". Decision: adjust — make `kiss-page-add` require `kiss-writing-for-the-web` before visible words, re-run a page arm against it; continue to k9-solutions.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->
