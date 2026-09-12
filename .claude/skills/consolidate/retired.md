# Retired feedback

Lessons that stopped being feedback. Each row was a recommendation in two or more
`planning/sessions/` logs before `/consolidate` promoted it out of the reflections and into
somewhere that acts on it — a bullet in `CLAUDE.md` (§ Rules for a code or repo convention,
§ Git workflow for a rule about how a branch is run) when the lesson binds Claude, or a step (or
a stop) in `/branch-open`, `/branch-pulse` or `/branch-close` when it binds the operator. The row
is what tells `/branch-open`'s read-back to stop surfacing the lesson as inherited feedback: a
lesson in this table is a rule now, not an outstanding item. It is added only by `/consolidate`,
alongside the edit that retired it, and nothing is ever removed from it — a lesson that starts
recurring again is evidence the destination was wrong, and the row is the record of where it was
sent the first time.

**Edit made** says what the retirement actually cost: `new rule` for a bullet or step that did
not exist, `sharpened` where it was already there in weaker form, and `none — destination
existed` where the repo already asked for this and the row is the whole output. That last value
is a normal result, not a wasted one: retiring a lesson whose destination exists is what stops
the ritual growing a second step that asks for the same thing.

| Lesson                                                                                                                                            | Recurred in                                    | Retired to                                                                                                                                                        | Edit made                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Look at one built artefact yourself before accepting the branch — a page, a generated JSON, a count — rather than accepting Claude's report of it | 2026-09-05, 2026-09-06, 2026-09-08, 2026-09-09 | `/branch-close` Step 5a — Operator eyeball                                                                                                                        | none — destination existed (added the re-measured-perf-claim bullet to its menu) |
| Pulse the branch: at least once per working session, offered by Claude rather than remembered by the operator                                     | 2026-09-05, 2026-09-06, 2026-09-07             | `CLAUDE.md` § Git workflow, the `/branch-pulse` bullet (Claude's half) + `/branch-open` Step 6, which now names when the first pulse is due (the operator's half) | sharpened                                                                        |
| A doc or a plan is a claim about the code, not evidence of it — check `lib/` before repeating it                                                  | 2026-09-06, 2026-09-07, 2026-09-08             | `CLAUDE.md` § Rules                                                                                                                                               | new rule                                                                         |
| A regression test is only evidence once it has been seen to fail against the unfixed code                                                         | 2026-09-05, 2026-09-06                         | `CLAUDE.md` § Rules                                                                                                                                               | new rule                                                                         |
| Say it at the point of decision, not in the reflection — an unanswered question, a risk, an unexpected ratio                                      | 2026-09-05, 2026-09-06, 2026-09-07             | `CLAUDE.md` § Rules                                                                                                                                               | new rule                                                                         |
