# The kiss-ssg skills on four real sites — 2026-10-31

The shipped skills were tried on four of the operator's sites (a1k9training, pro-plumbing,
k9-solutions, swan-love) by fresh headless agents that were given an ordinary owner's request and
never told the skills existed. The question was the one `CLAUDE.md` now asks of a domain skill:
does it change the site an agent produces? Session log:
`planning/sessions/2026-10-31-skills-on-fleet-sites.md`.

## Verdict

<!-- filled when all four sites are in -->

## How the arms ran

Each arm is one `claude -p` session (`claude-opus-5-5`, Claude Code 2.1.316) in its own copy of the
site under the session scratchpad. The copy keeps the site's `.git`, so what an arm changed is a
diff. Its remotes are removed, and its `.claude/settings.local.json` is replaced by a deny-list
(push, commit, `gh`, deploy CLIs). This tree's `npm pack` tarball is installed into the copy with
`--no-save --no-package-lock`, and the plugin is loaded from this tree with `--plugin-dir` under
`--setting-sources local`, `--strict-mcp-config` and `--no-chrome`. The real site folders are only
read; each was `git status`-clean before and after.

What that setting changes from a real session, so the results are read with it:

- the marketplace copy of the plugin does not load, and nor do the site's own `.claude/skills`;
- three managed `cc-plugin-*` plugins load in every arm;
- the lockfile still names the site's old kiss-ssg, which one review reported as a finding.

Five arms per site, run one after another so no two compete for a dev port:

| Arm         | Prompt, as the owner would put it                                 | Measures              |
| ----------- | ----------------------------------------------------------------- | --------------------- |
| review      | Is the site ready to go live? Report first, change nothing.       | review pass, trigger  |
| seo-with    | Hardly anyone finds us on Google; improve that.                   | trigger, with/without |
| seo-without | The same, with `kiss-seo` removed from the plugin.                | with/without          |
| page        | Add a page for a new service or event, with the facts given.      | trigger               |
| a11y        | A customer says the site is hard to use with a keyboard; sort it. | trigger               |

Skill use is counted from the stream-json transcripts: a `Skill` tool call, or a `Read` of a
skill file. It is measured, not inferred from the agent's account.

## a1k9training (20 pages, Tailwind, engine 2.7.0 → 2.8.4)

**Build:** `ok`, 20 pages, 0 failed, 564 links clean. The audit's only finding is `href-hash` on
every page (the footer's "Back to top"). Five course pages differ from the site's last record:
their "next course starts" dates are worked out at build time from `anchorSunday`, so they move
with the calendar. A 2.7.0 build and a 2.8.4 build of the same day are identical for those pages.

**Trigger:** 4 of 4 tasks invoked the right top-level skill unprompted (`kiss-site-review`,
`kiss-seo`, `kiss-page-add`, `kiss-accessibility`).

**Domain skills from inside a task skill:** none, in both task arms that named them. The review
arm opened `review-protocol.md` and `browser-pass.md`, which are Markdown links, and none of the
six domain skills, which were only named. The page arm opened none of its five.

**The review, before and after the fix:**

|                      | First run (skills named) | Re-run (skills linked, `a5c6484`) |
| -------------------- | ------------------------ | --------------------------------- |
| Domain skills opened | 0 of 6                   | 6 of 6, one sub-agent each        |
| Cost, time           | $1.33, 4 min             | $8.33, 12 min                     |
| Rows                 | 13                       | 7 P1, 17 P2, 7 P3                 |
| WCAG failures found  | 0                        | 3 (2.4.11, 1.4.11, 1.4.1)         |

The three the first run missed, each verified in the source: focus hidden under the sticky header
when tabbing back (9 of 10 page types at phone width), form field borders at 1.58:1 (`#d7cdb9` on
white), and the current menu page marked by colour alone (1.28:1, no `aria-current`). The re-run
also found the thanks page promising a reply "usually within a day or two" where the owner's
policies say "a few days", and a linked Google Doc that contradicts the site (the link is
verified; the doc's content was not fetched). Both runs found the missing privacy line on the
enquiry form. The re-run respected three recorded decisions and marked each as the owner's call.
The operator read the re-run report: "it holds up". The operator kept the cost.

**`kiss-seo` with and without:** no measurable difference. Both arms put the town in titles and
headings, made the course name the one `<h1>`, moved the structured data off the slogans, and
advised on the Google Business Profile, which the skill does not mention. The arm without the
skill also gave the business's structured data its address and coordinates. Every new fact in
both was checked against the course models and `business.js`; none was invented. One brief, one
run each: a signal, not a verdict.

**The page:** `kiss-page-add` was followed exactly. The £120 stayed off the page because the
site's policy file says no prices; missing facts became visible placeholders. Re-run after the
link fix, it still opened none of the domain skills, and the page lost nothing measurable: its
own title and description, one `<h1>` that names the course. `kiss-page-add` is left as it is.

**Keyboard:** the strongest single arm. With `kiss-accessibility` loaded it measured, in a
browser, the obscured focus and a 22-key-press menu (dropdowns opening on focus), and fixed both
along with Escape and `aria-current`.

**Changed in this repo because of it:**

- `a5c6484`: every task skill links the `SKILL.md` of each domain skill it hands work to, and a
  test fails when one names a domain skill without the link (red on HEAD for four skills).
- `7816771`: `kiss-site-migrate`'s 2.7.5 note says a site's own `llms.txt` readers change
  answer. The site's SEO check passes on 2.7.0 and fails with 36 errors on 2.8.4.

**Recorded, not changed:** a placeholder such as `[First start date to confirm]` passes the build
check. Catching it would be an audit check in `lib/audit.js`, which is out of this branch's scope.

## pro-plumbing (7 pages, engine 2.7.0 → 2.8.4, run after `a5c6484`)

**The site moved during the run.** The real site was fast-forwarded at 19:00:14 (its reflog: a
pull from `56931df` to `49c4fca`, the 21 October craft-review fixes). The review arm's copy and
the ground-truth copy were taken before it, from `56931df`. Every other pro-plumbing arm was
copied after it, from `49c4fca`. Each result below is read against its own commit. The harness
now records each copy's source commit.

**Build:** `ok`, 7 pages, 0 failed, and an empty audit with nothing ignored or skipped.

**Trigger:** 4 of 4 again. The review opened all six domain skills ($6.83, 12 min).

**The review (on `56931df`):** every claim checked held for that commit. The focus ring
`#E85C25` on the slate-700 header is 2.78:1, against 3:1. `BRAND.md` says it passes, but that
figure predates the header's change to slate on 18 September, which the stylesheet records. The
review marked both that and the 2.75:1 header borders **ask**, naming the record, as the review
protocol says. A forward Tab to "Your name" on `/contact/` at 375×667 leaves the field 100% under
the 71px call bar, measured in installed Chrome and seen in a screenshot. The thanks page tells a
visitor to ring about "water coming through a ceiling" while the FAQ says Greg does no
emergencies. The lockfile row is the harness artefact again. The call-bar and header-ring
findings were already fixed on `49c4fca` (`scroll-padding-bottom`, `.site-header
:focus-visible`), so on the site as it now stands they are not findings.

**`kiss-seo` with and without:** the same result as a1k9training. Both found the dead Google
Business Profile link that `business.js` notes and called it the biggest fix. Both listed the
villages as separate served places and linked the Maps listing. The one difference is the
skill's own build-mode rule: only the arm with it rewrote the titles into searchers' words
("Bathroom fitter and plumber in Aberdare"). The arm without it added an `OfferCatalog` instead.

**The page:** `kiss-page-add` again, and again no domain skill opened. The arm made a sound
structural call: a small-jobs entry and an FAQ answer rather than a page, since the site keeps to
a few pages. It checked the copy against `VOICE.md` and raised the electrics question rather than
guessing. Two slips, both in the words, the area `kiss-writing-for-the-web` covers: a
garden-path sentence ("for a new one where the old one was usually takes me about two hours"),
and a `_source` crediting the facts to "Greg, via Courtenay", a go-between the request never
named.

**Keyboard (on `49c4fca`):** the arm loaded `kiss-accessibility`, walked every page in both
directions at 375×667 and 1280×800 in Chrome, and found nothing hidden under the header or the
call bar, which is right for that commit. It fixed one real flaw: the phone menu's focus ring
was drawn outside full-width rows, so only two thin lines showed. It also suggested asking
whether the customer uses Safari, where Tab skips links by default.

**A correction, recorded so it is not repeated.** This session first read the keyboard arm's
all-clear as false, by measuring the `56931df` build against an arm that had `49c4fca`. On that
reading it committed a guard to `kiss-accessibility` (`f455b30`), and the operator, shown a true
screenshot of the old commit, agreed the field was hidden. The reflog showed the pull; the guard
was reverted (`3b695a4`). Nothing in the skills was wrong here. The lesson is the harness's:
record each copy's commit, and never compare two copies of a site without checking they match.

## k9-solutions (10 pages, engine 2.7.0 → 2.8.4, after `f455b30`, before the page-add edits)

**Build:** `ok`, 10 pages, 0 failed, 209 links clean. The audit flags `canonical-missing` on the
404 and thanks pages, which are out of search on purpose.

**Trigger:** 4 of 4. The review opened all six domain skills ($4.29, 6 min).

**The review:** the four claims checked all held. There is no skip link and `<main>` has no `id`.
The form fields set `outline:none` and keep only a 20%-opacity glow. The lockfile pins 2.6.2
against `package.json`'s `^2.7.0`; this one is the site's own defect, not the harness's. A
review's quote marks were added by the later polish commit `c472fff` and are absent at import
(`cb0b5b2`), which the review flagged as a possible misleading review. It also listed every fact
with no record of the owner giving it.

**`kiss-seo` with and without:** the two arms wrote the same new home title word for word ("Dog
Trainer in Merthyr Tydfil & Aberdare | K9 Solutions"), and made the same heading and structured
data changes. The arm with the skill wrote the tighter description, front-loaded as the skill
asks. The arm without it put the name, town and phone in every footer.

**The page:** a faithful replica of the site's own pattern: one new record in
`src/models/training/`, picked up by every list. The price was a visible placeholder. But the
template has slots the owner's facts did not fill, and the arm filled them with plausible promises
nobody gave: "You come away with a plan to follow", "Clear steps for leaving and coming back that
everyone at home can follow", and what each call is for. That is the invented-facts case
`kiss-writing-for-the-web` exists for, and the skill was not opened. A third sample behind the
operator's decision to make the writing check firm; the arm is re-run against the new wording.

**Keyboard:** found and fixed the missing skip link, the absent focus style and colour-only
current page, all three of which the review also reported. The header is not sticky, so there was
no bar to hide focus.
