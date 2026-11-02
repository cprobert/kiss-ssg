# The review protocol

How every kiss review reports what it finds: `kiss-site-review`, and each domain skill's review mode when it runs on its own. One protocol means the findings of several reviews merge into one table, and an operator reads every review the same way.

## Look for the decision first

**First, look for the decision.** Before calling anything a finding, check whether the site records it as a choice:

- a `BRAND.md`, or design notes in the `README.md`, the site's `AIKB/` or a planning folder;
- a comment in the stylesheet or the template;
- an `audit.ignore` entry.

A dark band, a system font, an unusual colour role or a modest heading size that the site explains is a decision. One it does not explain is not automatically a finding: only a review's own checks are. Name the record and leave it, or ask the operator. Never "fix" a recorded decision as if it were a mistake. Every check in every review can be overruled this way.

**A record whose own reason a measurement now contradicts** goes in the report, marked **ask**, naming the record. Two examples: a ring recorded as "clears 3:1 against the header" after the header changed colour, or a line length recorded "for readability" that measures 90 characters. The record is still the operator's to change, so propose; never apply it as a fix.

## Report first, then fix what the operator picks

**Report first.** Before editing anything, put every finding in one table. Give each finding its measurement: a contrast ratio, a grep result, a height in pixels, a quoted sentence.

| Priority | Where | What | Measured | Why it matters | Proposed fix |
| -------- | ----- | ---- | -------- | -------------- | ------------ |

- **P0:** a visitor is blocked. Content is invisible or unreachable, there is a keyboard trap, or a form cannot be sent.
- **P1:** it fails a WCAG 2.2 AA criterion or a legal duty, or it is broken on a common device. For example: overflow at 320px with the site's real content, focus hidden under a bar, `viewport-zoom-lock`, a skip link with no target, or a form that collects personal details with no line about them. The legal duties include a privacy notice missing an item the law lists, storage before consent, a pre-ticked marketing box, and no business address; [`kiss-legal-and-privacy`](../kiss-legal-and-privacy/SKILL.md) says how each is measured.
- **P2:** a visible flaw that reads as unfinished. For example a word alone on a line, a hover stuck after a tap, a weight that does not render, overflow that only an injected long string causes, `href-hash`, or the audit's page checks, except `privacy-link-missing`, `checkbox-prechecked` and `placeholder-left`, which are P1.
- **P3:** polish.

**One row per cause, not per instance.** "`transition: all` in 7 rules of `site.scss`" is one row with the count in it, because it is one fix. Sort by priority.

Then ask the operator which to fix. Fix those, and **re-run `npx kiss-ssg check` after each fix**. A layout edit changes every page, and the next run says whether it cleared the finding or made new ones.

## Accepted risks

A finding the owner decides to live with (no published email address, an embed with no facade) is recorded where the site keeps its decisions, so the next review reads it as a decision and leaves it, as § Look for the decision first says. One entry per risk:

```markdown
### Accepted risk: <the finding, in one line>

- **Decided:** <date>, by <who>
- **Finding:** <what the review found, and its measurement>
- **Why it is accepted:** <the owner's reason, in their words; "no reason given" if none>
- **What would reopen it:** <the change that makes this a finding again>
```

Keep it with the site's other recorded decisions: a note under its `AIKB/notes/` (the knowledge base's place for why), its planning folder, or the design notes in its `README.md`. An `audit.ignore` entry for the same check carries a comment pointing at it.
