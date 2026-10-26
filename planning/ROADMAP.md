# Roadmap

Work the operator has agreed is worth doing but has not scheduled. Each entry
links the document that holds its design; nothing here is in progress until it
has a `/branch-open` session log. Remove an entry when its branch closes, and
link the session log from its spec.

| Added      | Item                                                                                                                                                                           | Impact surface                    | Spec                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------- |
| 2026-10-24 | **Partial transforms.** Partials processed through a table keyed by extension; `.md` renders after Handlebars, which fixes `{{link "x"}}` failing to parse in a `.md` partial. | Public API (minor + upgrade note) | [specs/2026-10-24-partial-transforms-design.md](specs/2026-10-24-partial-transforms-design.md) |

## Considered and declined

- **Alternative view engines** (Liquid, Nunjucks, EJS behind an adapter),
  2026-10-24. Feasible, but every helper, doc snippet and skill instruction
  would multiply per engine. The reasoning is in the partial-transforms spec's
  Background.
- **H5P in kiss**, 2026-10-25. A site that wants an H5P package builds it
  itself; kiss packages pages as IMS CP and SCORM 1.2.
- **SCORM 2004**, 2026-10-25, until Moodle supports it. Revisit then.
