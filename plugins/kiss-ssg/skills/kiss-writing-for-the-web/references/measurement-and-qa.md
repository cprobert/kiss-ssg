# Content standards, QA and measurement

Read this when someone asks about team content standards, automated checks, component specs, testing or metrics.

## Bring content design in early

Content design starts at the state-model and component-design stage, not at final QA. You can't write good error copy until you know the failure modes. Empty-state copy needs the states separated (new account, filtered to zero, loading, no permission, service unavailable). Button copy depends on the exact state change the button causes.

## Component content specification

For each reusable component, record:

- purpose and audience
- source of truth for its text
- maximum visual space, where relevant
- allowed terms (from the terminology list)
- examples of good and bad copy
- accessibility notes
- localisation notes
- every state and its copy

For engineers: hold copy as explicit state-dependent content, not scattered string literals. Test accessibility relationships (label, hint, error, live status announcement) as part of component tests. Set the document language and keep a logical DOM and reading order.

## Automated QA: finds risks, does not judge quality

A content pipeline can flag:

- sentences over 25 words
- reading grade above the agreed target
- repeated vague link or button text ("Learn more", "Click here", "Submit")
- abbreviations used without definition
- inputs with a placeholder but no label
- duplicate button names on one screen
- missing field labels
- headings out of order, or text styled as a heading without being one
- banned jargon from the terminology list

Readability formulas only approximate difficulty. Treat every flag as a prompt for a human editor, not an automatic failure.

## Team standards that the evidence supports

**Readability:** grade 6–8 for broad consumer content; grade 10–12 as the upper band for expert material; average sentence length well below 25 words; editorial review of every sentence over 25 words; no fixed page word count.

**Components:** commands usually 1–4 words; labels as short as clarity allows; hints usually one sentence; errors usually one sentence that includes the fix; tooltips one or two short sentences and never essential; notification bodies limited to what the immediate decision needs. NN/g directly supports the 2–4 word command range and short tooltips and notifications; the other limits are guardrails.

The strongest organisation-wide standard is not a long list of banned words or character counts. It is a content system: shared terms, task-based templates, reusable microcopy patterns, semantic components, measurable quality gates and continuous user testing.

## Success metrics by content type

| Content type        | Measure                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| Informational pages | answer-finding success, time to answer, comprehension                   |
| Forms               | completion, abandonment, field-level validation errors, repeated errors |
| Dashboards          | task completion time, command discoverability, action error rate        |
| Product pages       | comparison success, purchase confidence, avoidable returns              |
| Notifications       | downstream action rate, opt-outs, notifications turned off              |

Read metrics alongside observed usability tests. A high click-through rate alone can reward a misleading call to action: NN/g documented this with ambiguous "Get started" buttons. Log link and button text in analytics so wording variants can be compared on task success.

## The evidence base

The sources are listed in [sources.md](sources.md).

**Three tiers of numbers.** When you quote a number, say which tier it is:

1. **Research-backed constraints** — e.g. NN/g's 2–4 word command labels; Google's "fewer than 26 words" documentation guideline.
2. **Strong organisational standards** — e.g. GOV.UK's 25-word sentence review threshold.
3. **Operating guardrails** — no credible source gives a universal cut-off; use measurement and usability testing, and don't treat the number as a law.
