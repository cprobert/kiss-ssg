# Roadmap

Work the operator has agreed is worth doing but has not scheduled. Each entry
links the document that holds its design; nothing here is in progress until it
has a `/branch-open` session log. Remove an entry when its branch closes, and
link the session log from its spec.

Nothing is waiting outside the road to 3.0, below.

## The road to 3.0

[plans/2026-11-10-roadmap-to-3.0.md](plans/2026-11-10-roadmap-to-3.0.md) sequences the work from
here to 3.0: partial transforms first, then a feature freeze while the core is given an extension
contract and the instruction system is cut down. Agreed in outline by the operator on 2026-11-10,
with every decision it asked for now taken. Phase 0 shipped as 2.15.0. Phase 1's partial
transforms closed as 2.16.0 on 2026-11-14 (its spec links the session log); next in Phase 1 is
markdown-it in place of remarkable (2.17), then the freeze.

## Considered and declined

- **Alternative view engines** (Liquid, Nunjucks, EJS behind an adapter),
  2026-10-24. Feasible, but every helper, doc snippet and skill instruction
  would multiply per engine. The reasoning is in the partial-transforms spec's
  Background.
- **H5P in kiss**, 2026-10-25. A site that wants an H5P package builds it
  itself; kiss packages pages as IMS CP and SCORM 1.2.
- **SCORM 2004**, 2026-10-25, until Moodle supports it. Revisit then.
