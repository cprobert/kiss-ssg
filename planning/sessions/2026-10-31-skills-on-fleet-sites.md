---
branch: chore/skills-on-fleet-sites
base: main
status: closed
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
- **2026-10-31 — correction to the line above.** The keyboard arm's all-clear was **not** false. The real pro-plumbing was fast-forwarded at 19:00:14 (reflog: pull `56931df` → `49c4fca`, the 21 October craft-review fixes, which add `scroll-padding-bottom` and a header `:focus-visible` ring). The review arm's copy and my ground-truth copy came from `56931df`; both keyboard arms came from `49c4fca`. Each agent was right about its own source. I compared two commits as one site, committed a guard on that false premise (`f455b30`), and showed the operator a true screenshot of the old commit, which they agreed showed a hidden field. Reverted in `3b695a4`; the harness now records each copy's source commit. The operator's eyeball answer stands as an answer about the old commit, not about the arm.
- **2026-10-31** — slice 3 of 3 (k9-solutions; swan-love dropped by amendment). All criteria met but the close's own: three sites `ok`, all four real trees `git status` exit 0 and empty; reviews 6/6 on every site, every spot-checked claim held for its commit (no skip link, `outline:none` with a 20% glow, the lockfile's 2.6.2 against `^2.7.0`, quote marks added by `c472fff`); trigger 12/12 from transcripts; `kiss-seo` with/without no measurable difference on three sites (k9: the same title word for word). Page re-runs after `2732d93`/`dea7270`: both opened `kiss-writing-for-the-web` (0/3 before), the pro-plumbing sentence is clean and an electrics contradiction flagged; k9 still titles a step "A plan for being alone", recorded. Skill tests 614/614. Report committed (`fcc06fc`). **Eyeball: looked** — the operator read `kiss-page-add` end to end: "it says it". **Offer:** leaving `kiss-seo` unchanged as a research question for its own branch — operator: keep, next branch. Decision: ready to close when the operator asks for `/branch-close`.

---

<!-- /branch-close → /session-reflect fills the Reflection below and flips status: closed -->

# Session Reflection — 2026-10-31: The kiss-ssg skills on real sites

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**What we shipped:** fifteen commits on `chore/skills-on-fleet-sites`. The ones that change what an agent does: `a5c6484` (task skills link the domain skills they hand work to, with a test seen red on HEAD), `2732d93` and `dea7270` (`kiss-page-add` opens the writing skill and replicates the nearest page), `7816771` (the migrate note on `llms.txt` readers). Also `f455b30` and its revert `3b695a4`, the report `planning/reviews/2026-10-31-skills-on-fleet-sites.md`, the docs sweep `aeec01b`, and 2.8.5 (`377f13a`). Gates green; no `lib/` or `bin/` change.

## Reflect — what the session was

Framed well and emergent, as declared. The operator set the goal in one line ("Testing skills on real sites") and three structured answers settled the shape: review, trigger and with/without tests; four buildable sites; fixes in this repo plus a report. Nothing past that was planned, and nothing needed to be: the first site's results decided every later change. The shape served the work. One slice per site gave the pulses a natural boundary, and the two operator rulings that changed the skills (firmer writing check; replicas, not improvements) arrived at those boundaries.

The method was the session's real product. Headless `claude -p` arms in sterilised copies of each site, with this tree's tarball and `--plugin-dir`, and the transcripts read for `Skill` calls and file reads, turned "is this skill used?" into a count rather than an impression. That count found the headline: agents opened every linked support file and none of the merely named domain skills.

## Evaluate — how the human supervised the AI

**Pushback & steering** was where the operator's supervision changed the outcome. Twice the operator chose against Claude's recommendation. First, to make `kiss-page-add` firmer when Claude proposed watching two more sites; the reason was given in a sentence when asked ("Words are the product") and recorded verbatim. Second, unprompted, a design principle Claude had not proposed at all: "when adding we should look to make perfect replicas. I think improvements should come as part of a review process". That rule reframed the page skill's whole step 2, and the re-runs showed it working (the pro-plumbing re-run listed improvements for review and changed none). Scope was steered the same way: "You can skip swan love" dropped a site mid-run. The operator also accepted a sixfold cost rise for reviews with the evidence in front of them, and asked the question that framed the end of the branch: commit to the sites now, or wait for the publish and reproduce?

**Verification & ownership** is the mixed dimension, and the mix is Claude's. The operator looked three times, at the moments the pulses asked: the re-run review ("it holds up"), a screenshot, and `kiss-page-add` read end to end ("it says it"). The screenshot is the lesson. Claude measured the pro-plumbing build in a ground-truth copy, found the call bar hiding "Your name", called the keyboard arm's all-clear false, committed a skill guard (`f455b30`), and showed the operator the screenshot, who agreed. All of that was true of commit `56931df`. The arm had `49c4fca`: the operator had pulled the real site at 19:00:14, between the two copies, and that pull fixed the very defect. Claude found it by chasing why two builds of "the same" page differed, read the reflog, reverted the guard with its reason, corrected the report and the session log, and made the harness record each copy's commit. Caught inside the branch, but only after a commit and an operator confirmation rested on it. The operator's look was honest; what it was shown was mislabelled.

Smaller instances of the same habit: Claude attributed a1k9training's five changed course pages to site edits before checking (an arm corrected it: build-time dates), wrote "about 20" rows before counting (17), and put the `kiss-page-add` evidence as "credited a fact to a person who had not said it" when the request had named Greg. Each was corrected before it shipped, and each was an inference written as a finding.

**Iteration discipline** held: three pulses, one per slice, each with an eyeball and an explicit offer, the first time in recent logs that the pulse-per-slice lesson was kept for a whole branch. **Harness leverage** was high on Claude's side (the arm harness, Monitor, SendUserFile when the operator could not see a path) and the operator used the right tool too: `SendUserFile` exists because "I can't see what you're referring to" was said once and answered.

**Intended versus actual supervision:** the operator intended to judge the keyboard finding and did, but judged a claim Claude had framed. Claude's momentum (measure, conclude, commit, show) carried a false comparison past the checkpoint; the checkpoint itself was real.

**Competency level: Active supervisor**, with the scope and design calls of an agentic engineering lead. The operator framed, steered against recommendations with reasons, set a design rule the skills now carry, and looked at artefacts mid-branch. It falls short of the top level on one point only: the verification it did rested on Claude's framing, and the one framing that was wrong went through.

## Feedback — recommendations for next session

- **Claude — before comparing two copies of anything, check they are the same commit.** The pro-plumbing error cost a commit, a revert and an operator confirmation. The harness now writes `source HEAD` into each copy; the habit is to read it before calling two results a contradiction.
- **Claude — name an inference as one at the moment of writing.** Three times this branch a guess went into prose as a finding (the course pages, "about 20", the `_source` sentence). The rule exists (`CLAUDE.md` § Rules: measured or inferred); the fix is to apply it to every sentence about a site, not only to claims about the engine.
- **Operator — say when you change a site Claude is testing.** A one-line "I just pulled pro-plumbing" would have saved the false finding. While a branch tests real sites, their working trees are part of the experiment.
- **Operator — keep giving the reason in one sentence when you overrule.** "Words are the product" took one question and is now the stated basis of a skill rule. Keep doing it.
- **Process — promote the arm harness to `scripts/`.** This is the third skill trial (2026-10-13, 10-21, 10-31) to rebuild `make-copy`, `run-arm` and `summarise-arm` in a scratchpad. The 10-13 log asked for promotion on the third trial. It is a new branch, not this one.
- **Process — run the post-publish reproduction as planned.** One session per site after 2.8.5 publishes, running `kiss-site-review` as shipped from the marketplace. It is the run this harness could not be, and the report lists what to carry in.
- **Both — give `kiss-seo` its own research-led branch.** Three sites, no measurable difference with or without it. The open question is what it knows that the model does not; start from evidence, as the writing skill did.

## Verdict — did we achieve the objective?

**Brief:** test the shipped skills on real sites so the domain skills are judged by the sites they produce, and fix what the sites show. **Met**, on three sites rather than four: swan-love was dropped by the operator, a recorded amendment, not a shortfall.

- [x] Each in-scope site wired to this tree's engine and plugin, builds with `kiss-ssg check`, and its real tree clean afterwards. Three sites `ok`; all four real trees `git status` exit 0 and empty at the close.
- [x] Review pass graded on each site. Every spot-checked claim held for its commit; one harness artefact (the lockfile, two sites) and one stale commit (pro-plumbing) named.
- [x] Trigger test counted from transcripts: 12 of 12 tasks invoked the right top-level skill; domain skills from task skills, 0 before the link fix and 6 of 6 reviews after.
- [x] With-and-without measured: `kiss-seo` on three sites, no measurable difference.
- [x] Every skill change traces to a finding and was re-run: the link fix (review 0→6), `kiss-page-add` (writing skill 0/3→2/2), the migrate note (measured on 2.7.0 and 2.8.4). The one change that did not survive its evidence was reverted.
- [x] Findings report at `planning/reviews/2026-10-31-skills-on-fleet-sites.md`, with a verdict and the site follow-ups.
- [x] The operator read a changed skill end to end: `kiss-page-add`, "it says it".

**What is concretely better:** a launch review now runs every domain review and found three WCAG failures the old one missed; a page added by an agent copies the site instead of reshaping it and checks its own words; a test stops a task skill naming a domain skill without linking it. **Open:** `kiss-seo`'s value; a replicated template still pulls in an unconfirmed promise (k9-solutions); a placeholder passes the build check (engine); no independent review of this branch, which changed no `lib/` code; and the per-site reviews after the publish.
