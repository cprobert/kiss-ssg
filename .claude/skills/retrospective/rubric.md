# The supervision rubric

The shared vocabulary `/retrospective` scores a session against, and that `/branch-pulse` speaks in mid-branch. It lives here — beside the skill that applies it — rather than in the repo, so the skill and its rubric travel together and the reference never depends on where the skill folder sits.

A reflection's **Evaluate** section reads _how actively the human supervised the AI_. The session's quality is set less by the model than by the human's supervision — framing the problem, asking the AI to explain rather than accepting code blindly, correcting it rather than absorbing the first answer, verifying before accepting, and being able to explain afterwards what changed. The defining divide is **active supervisor vs passive delegator**.

This rubric is **shared language, not jargon** — defined here once and used bare in the reflections. Two parts: the seven behavioural dimensions a session is read against, and the four competency levels it lands on.

## The seven behavioural dimensions

| Dimension | The question the reflection answers | Active-supervisor signal | Passive-delegator signal |
| --- | --- | --- | --- |
| **Problem framing** | Did the human scope before asking for code? | Plan, constraints, and acceptance criteria stated upfront for non-trivial work | "Build this" with no context; ambiguity left for Claude to guess |
| **Learning engagement** | Did the human ask the AI to explain, or accept code blindly? | Conceptual questions, "explain this", "why not X?" — code used as a way into understanding | Code accepted without understanding it; no explanation sought |
| **Pushback & steering** | Did the human correct Claude, or absorb the first answer? | Drift corrected early, alternatives requested, weak moves challenged | First plausible answer accepted; no redirection |
| **Verification & ownership** | Was the output verified before it was accepted as done? | Tests run; the diff reviewed; the generated site actually looked at, not just the summary trusted | Marked done on Claude's say-so; the summary trusted over the diff |
| **Iteration discipline** | Was a long agent run punctuated by verification, or run one-shot to a large unverified output? | Work sliced into verifiable steps; mid-run checkpoints (a `/branch-pulse`, a test, an eyeball) catch drift before it compounds; a troubled run is corrected, not abandoned | One long unverified generation; "looks done" accepted without any mid-course check; the partial-but-unverified gap left wide open |
| **Architecture sense-making** | Could the human explain what changed and why, afterwards? | Explanations sought for non-obvious choices; could brief someone else on the change | Could not explain the change if asked |
| **Harness leverage** | Did the session reach for Claude Code's force-multipliers where they'd have helped — plan mode, skills / slash commands, sub-agents, MCP servers? | Plan mode for ambiguous or multi-file work; sub-agents for parallel exploration or fresh-context review; the right skill or MCP tool reached for instead of guessing | Heavyweight, ambiguous work driven linearly in one context; sub-agents, plan mode, or a fitting skill / MCP left on the table where they'd clearly have paid off |

## The four competency levels

The Evaluate section lands on one of these, named, with evidence from the session.

| Level | Working style |
| --- | --- |
| **Passive delegator** | The agent as a code vending machine — vague prompts, weak verification, can't explain the result afterwards. |
| **Assisted operator** | Productive on bounded tasks — some context given, some corrections made, but inconsistent on learning and review. |
| **Active supervisor** | Treats the agent as a fast but fallible collaborator — plans non-trivial work, asks clarifying and conceptual questions, reviews diffs, runs checks, learns the architecture. |
| **Agentic engineering lead** | Designs a reproducible human–AI workflow — plans, context files, independent review passes, durable guidance, and improves the system after repeated failures. |

A session rarely sits cleanly in one level, and the dimensions seldom score alike — strong framing can sit beside weak verification. The reflection's job is to read the evidence dimension by dimension, then name the level honestly. The most useful thing these logs teach is where the human _intended_ to supervise versus where they actually did — the checkpoint meant to be held but waved through. The `## Pulse log` makes those mid-branch checkpoints visible: its cadence is direct evidence for **Verification & ownership**.

## Why these dimensions

This rubric is grounded in current best-practice research on agentic coding: the comprehension finding that **active integrators** (who verify and write more) understand more than **passive delegators** (who consume more AI output); the skill-formation study showing AI helps learning only when used to build understanding, not to bypass it; DORA's framing of AI as an **amplifier** of existing habits rather than a substitute for them; and the convergent operational guidance from Anthropic and OpenAI to plan before non-trivial work, verify before accepting, and correct drift early.

Anthropic's analysis of ~400,000 Claude Code sessions sharpens the **Iteration discipline** dimension in particular. The amplifier is **domain expertise, not raw coding speed**: experts run _longer_ action chains (~12 actions per prompt vs ~5) yet succeed more often, because they frame precisely, catch edge cases mid-run, and do not abandon troubled sessions. And the sobering gap — roughly **91% of sessions partly worked, but only ~28–33% were verified to actually work** — is closed not by a single closing check but by that mid-loop verification cadence. So a session that one-shots a large change with no intermediate verification is exhibiting the exact antipattern the data warns against, and the reflection should name it and feed it back — coaching toward checkpointed iteration (the `/branch-pulse` Steer beat) is the point of scoring this dimension at all.
