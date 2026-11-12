---
branch: ccr-1e9fa453-d8wyeg
base: main
status: closed
opened: 2026-11-09
consolidated: 2026-11-12
---

# Session Reflection — 2026-11-10: Architecture review, a roadmap to 3.0, and seventeen work orders

_A Claude Code session is supervised collaboration: Claude generates, the human directs and judges. The session's quality is set by how actively the human supervised it. This reflection reads that supervision, as CPD for both._

**This branch was not opened with `/branch-open`.** There is no captured intent, no success criteria and no pulse log. The intent below is reconstructed from the conversation, so the Verdict is a self-report.

**What we shipped:** documents only, no engine code, no version bump (2.14.0 stays; the operator's choice).

- `planning/reviews/2026-11-09-architecture-review.md` (`cd0dbb5`, `491fe98`)
- `planning/plans/2026-11-10-roadmap-to-3.0.md` (`9a8a184`, `a31d68f`, `e14e5d5`)
- `CLAUDE.md § Working practice`, nine lines (`e14e5d5`)
- `planning/plans/3.0-phase-0/`, seventeen work orders and an index (`5ffac28`, `3e7e46f`)

## Reflect — what the session was

Emergent, in four turns of kind, each started by the operator: a question about how to prompt for a review; the review; a roadmap; then work orders for its first phase. The first turn is the one that set the quality of the rest. The operator did not ask for a review; he asked what a review request was missing. That produced a prompt with an evidence standard (every finding measured or inferred, with `file:line`), two clean-room tests, and a separate list for things the reviewer was unsure of. Everything that followed was held to that standard, including by Claude against itself.

The shape served the work until the third turn. A review is read-only and needs no branch discipline. A roadmap that edits `CLAUDE.md` and writes seventeen briefs is work, and `CLAUDE.md` says the moment to ask "`/branch-open` now?" is when a conversation turns from assessing to editing. Claude did not ask. The harness had already put the session on a branch, which made the question easy to skip, and the cost shows here: a close with no criteria to check against.

## Evaluate — how the human supervised the AI

**Problem framing was the standout, and it was the operator's.** Asking "what am I missing, what would a CTO ask?" before asking for the work is the strongest framing move in these logs. When Claude put seven questions before the roadmap, the operator answered all seven in one message, shortly and decisively ("fleet only", "as much as needed", "as long as it takes"), and added the one fact Claude did not have: that less capable models would implement. That fact reshaped the roadmap more than any finding did. It is where the work orders, the model table and the "weakest implementer" principle come from.

One framing gap: the review prompt's decision line was pasted with its placeholder still in it. Claude said so and answered against all three example decisions. That was the right response, but it meant the review's verdict was spread across three audiences when the operator's real answer, given a day later, was "fleet only".

**Pushback and steering was real once, and it was right.** Claude proposed the Karpathy practices as a skill with four sentences mirrored in `CLAUDE.md`. The operator said a skill has to be invoked and so can be ignored, and that it should be in `CLAUDE.md`. That is this repository's own finding (2026-10-31: named skills went unread), and Claude had cited it in the same roadmap while proposing the thing it argues against. The operator's version is what shipped.

Elsewhere the operator accepted Claude's recommendation each time: all seven brainstorm ideas, the compatibility position, the `@kiss-ssg/memory` package, the model assignments, the budget targets ("I have no opinion on this"), how to run Phase 0, no version bump. Agreement is not passivity, but about ten acceptances to one overrule (counted from the conversation, not from a log) is a ratio worth seeing written down. On the budget targets Claude recorded the absence of an opinion as exactly that and marked its own figures provisional, which is the honest form.

**Verification and ownership is where the session is weakest, on both sides.** The operator has not read the review, the roadmap or any work order. Asked at this close, the answer was "Not now", recorded as unanswered. About 2,000 lines of findings and plans therefore rest on Claude's word and on four subagents from the same model family.

Claude's own verification was better than that sentence suggests, and worse than its confident register did. Better: it ran the gates twice, built five examples, benchmarked three sizes, reproduced the staging-sweep defect with a live process, and re-read the four security findings it relied on. Worse: three claims went into the committed review as measured and were wrong.

- "Six files share 86 private fields." The command printed two numbers and Claude attached the wrong one to the sentence. The satellites reach 115 private members; 86 is what the class declares.
- "The shell-edit hook gave a false positive." It did not. Claude's command redirected an `echo` into a file, which is the rule. Claude reported its own violation as the repository's defect.
- "`node docs` is not reproducible", relayed from a subagent as "worth checking". Ten minutes showed the build is fine and the committed `docs/` is a stale 2.13.3 build.

All three were caught by Claude, a day later, only because writing work orders forced each assumption to be re-derived. No reader caught them. Had the session stopped at the roadmap, a budget in it would still say 86. The lesson is specific: a number is measured only when the command that produced it is on the same screen as the sentence, with nothing else printed between.

**Iteration discipline:** none in the ritual's sense. No pulse was offered or run across two days and seven commits. `CLAUDE.md` says Claude offers one each working session; it did not.

**Harness leverage was good and two-sided.** The operator asked "DIY or delegate to save tokens?", which is a question about the harness, and got a straight answer: delegation saves money, not tokens, and this long session was the wrong place to implement. Claude used fresh subagents for the clean rooms, a different agent for security and for tests, `AskUserQuestion` for the three decisions with materially different outcomes, and declined to open a pull request until `/branch-close` was typed.

One judgement call to name: the operator wrote "I agree to the edits" and Claude took that as authority to edit `CLAUDE.md` there and then, saying so and offering to revert. The reading was reasonable and was disclosed. It was still an always-loaded instruction file changed on an ambiguous sentence, and a one-line question would have cost less than the paragraph explaining the reading.

**Where the operator intended to supervise versus where he did.** He supervised the direction closely and the content not at all. Every decision about what to build was his or was put to him. No sentence of what was built has been read by him. For a review whose first rule is "a doc is a claim, not evidence", that is the open loop.

**Competency level: Active supervisor on framing and steering, Assisted operator on verification.** Named as one level, it is **Active supervisor**, on the evidence of the first message, the seven answers and the skill correction, with the plain caveat that the level's "reviews diffs, runs checks" half did not happen in this session and is owed in the pull request.

## Feedback — recommendations for next session

- **Operator — read one work order before running any.** Start with `planning/plans/3.0-phase-0/03-staging-sweep.md`. It is one page. If its assumptions and steps are not what you would hand a junior, the other sixteen have the same flaw and it is cheaper to learn that now than from a failed Sonnet session.
- **Operator — fill the decision line.** The review's verdict was written three ways because the placeholder was left in. "Fleet only", said at the start, would have made it one.
- **Claude — a number goes beside the command that made it.** One command, one number, one sentence. The "86" error came from a compound command that printed several counts and a sentence written from memory of which was which.
- **Claude — a refusal from a hook is checked against the rule before it is called a false positive.** Read the rule's text, then the command, then decide. The review accused the repository of a defect that was Claude's own.
- **Claude — a subagent's "worth checking" is checked or labelled unchecked, never left as an implication.** The docs claim sat in a committed review for a day as an insinuation.
- **Claude — ask "`/branch-open` now?" when the work turns from assessing to editing**, even when the harness has already made a branch. The rule exists; the pre-made branch is exactly the case it names (2026-10-26 was the same miss).
- **Claude — offer a pulse each working session.** Two days, seven commits, none offered.
- **Claude — an ambiguous "I agree" about an instruction file is a one-line question**, not a reading to disclose afterwards.
- **Both — the next review of this kind gets one reader from another model family before it is acted on.** The roadmap now requires that at each phase exit; this review, which the roadmap is built on, did not have it.
- **Process — the work orders are the experiment.** Whether a less capable model can land work order 03 from its brief is the first real evidence for or against the roadmap's premise. Record what Sonnet had to guess.

## Verdict — did we achieve the objective?

The reconstructed brief, in the operator's words across four messages: a deep review of the codebase with evidence; a roadmap to 3.0 that improves kiss instead of adding features, drawing on the review and on Eleventy, Hugo and Astro; development practice encapsulated in the repo for less capable implementers; and Phase 0 prepared for delegation.

**Met, as documents. Unverified, as claims.**

- The review exists, every finding cites a line and says measured or inferred, both clean rooms ran, and a "not checked" list is in it. One defect was reproduced, not just read.
- The roadmap sequences six engine phases and an agent track, records sixteen decisions with their dates, and names a model for each piece of work.
- The four practices are in `CLAUDE.md`, where the operator wanted them.
- Seventeen work orders are written, each with scope, checked assumptions, verify commands and stop conditions.
- `npm run gates` passes on the final state (exit 0, 2026-11-10).

What is concretely better: the staging-sweep defect, open in `TODO.md` since 2026-09-21, is reproduced and has a one-page brief; the project has a written answer to "what is 3.0"; and the next implementer has four practices and a brief instead of 60 KB of history.

What remains open:

- The operator eyeball: unanswered — proceeding on the ritual's defaults.
- No independent review of any of it. The Codex step was skipped because no code changed, which is the right call for a code reviewer and leaves the content unreviewed.
- Comparisons with Eleventy, Astro and Hugo are from Claude's memory throughout and are marked so.
- Work orders 11 and 13 wait on the operator; 17 needs the fleet, which no agent can reach.
- Whether the roadmap's central bet holds, that a boundary inside the orchestrator must come before any extraction, has been reasoned and not tested.
