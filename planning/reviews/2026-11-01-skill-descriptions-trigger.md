# Skill descriptions to 400 characters: the routing check

Measured on `chore/skill-descriptions` after `4d02934`, which cut every kiss-ssg and kiss-memory skill description to at most 400 characters (the two plugins' skill listing on a site: about 2,970 → 1,751 est. tokens).

**Method.** One headless `claude -p` session (Opus 5.5) per prompt, in a sterilised scratchpad copy of a fleet site (a1k9training `385434a`, pro-plumbing `49c4fca`, k9-solutions `669a74c`), with `--setting-sources local`, no MCP, no Chrome, and one plugin directory: `main`'s kiss-ssg skills ("old") or this branch's ("new"). Routing only: `--permission-mode plan` (nothing can be edited), `--max-turns 6`, `--max-budget-usd 1`; a run's exit code 1 is the turn cap, by design. The measure is the first kiss skill the agent invoked. **One run per prompt: a signal, not a verdict.**

| Prompt                                                                 | Sites                  | Expected                        | Old         | New |
| ---------------------------------------------------------------------- | ---------------------- | ------------------------------- | ----------- | --- |
| "Is it ready to go live as it is?" (the 2026-10-31 review task)        | a1k9, pro-plumbing, k9 | `kiss-site-review`              | 3/3 (10-31) | 3/3 |
| "Hardly anyone finds us when they search Google…" (10-31 SEO task)     | a1k9, pro-plumbing, k9 | `kiss-seo`                      | 3/3 (10-31) | 3/3 |
| Add a page for a new course or service (10-31 page task)               | a1k9, pro-plumbing, k9 | `kiss-page-add`                 | 3/3 (10-31) | 3/3 |
| "Hard to use with just a keyboard" (10-31 keyboard task)               | a1k9, pro-plumbing, k9 | `kiss-accessibility`            | 3/3 (10-31) | 3/3 |
| "Can't find things… sort out how the pages are organised and the menu" | k9                     | `kiss-information-architecture` | yes         | yes |
| "Our services page reads badly. Can you rewrite it…"                   | k9                     | `kiss-writing-for-the-web`      | yes         | yes |
| "Looks a bit dated and generic. Can you make it look better?"          | k9                     | `kiss-design`                   | yes         | yes |
| "Pages jump around while they load… gallery is slow"                   | k9                     | `kiss-front-end`                | yes         | yes |
| "Works for someone using a screen reader?"                             | k9                     | `kiss-accessibility`            | yes         | yes |
| "Why doesn't ChatGPT ever mention us…?"                                | k9                     | `kiss-seo`                      | yes         | yes |

The old column for the four 10-31 tasks is that branch's full-arm result (`2026-10-31-skills-on-fleet-sites.md`), not a re-run; the near-miss prompts ran against both descriptions here. **Routing held: 12 of 12 on the 10-31 tasks, and 6 of 6 near-misses with both the old and the new descriptions.** Cost $6.81 for 24 runs.

**What this does not show.** Every prompt names its domain plainly; a prompt that sits between two skills (a nav label's wording: information architecture or writing?) was not tried, and neither was a site with many other skills installed, which is where a shorter listing should matter most. The kiss-memory skills were not loaded, so their routing is unmeasured.
