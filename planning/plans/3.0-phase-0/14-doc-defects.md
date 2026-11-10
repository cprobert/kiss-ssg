# 14. Doc defects the clean rooms found

**Model:** Sonnet. **Impact surface:** docs.

## Objective

Correct the specific documentation errors two clean-room agents and the review ran into, each
verified against the engine before it is written.

## Paths in scope

- `GUIDE.md` (§ Helpers, § .pages())
- `plugins/kiss-ssg/skills/kiss-site-new/SKILL.md`
- `AIKB/kiss.md` (Public interface, Depends on)
- `AIKB/handlebars-helpers.md` (the opening roster)
- `test/unit/skill-coverage.test.js` (only if a correction needs a row)
- `package.json` (`description` and `keywords` only)

Out of scope: `llms.txt`, `README.md`, every other skill, `lib/`.

## The defects

Each was measured on 2026-11-09 or 11-10. Re-check each before changing it.

| #   | Where                                | Defect                                                                                                                                           |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `GUIDE.md § Helpers`                 | `isActive` examples use a literal `href="/about"`, which `llms.txt` forbids. The working pattern is in `examples/11-blog/src/layouts/layout.hbs` |
| 2   | `GUIDE.md § .pages()`                | Opens with a `.page()` example and has no `.pages()` call fanning out from one JSON file holding an array                                        |
| 3   | `GUIDE.md § .pages()`                | That a record's own `slug` is ignored without a controller is easy to miss; a clean-room build got `bakes/bakes-bake-1/`                         |
| 4   | `kiss-site-new`, step 4              | Says the examples README "lists twelve runnable sites". There are fourteen                                                                       |
| 5   | `kiss-site-new`, step 5              | Cites a habit "read a page with its layout" as being in `llms.txt § Building a site well`. It is not there                                       |
| 6   | `AIKB/kiss.md`, Public interface     | No entry for `.robots()`                                                                                                                         |
| 7   | `AIKB/kiss.md`, Depends on           | Omits `./cache-headers.js` and `./images.js`, both imported by `lib/kiss.js`                                                                     |
| 8   | `AIKB/handlebars-helpers.md`, line 5 | The roster omits `image` and `embed`                                                                                                             |
| 9   | `package.json`                       | `keywords` are `jekyll`, `gatsby`, `hugo`, `gridsome`; `description` is "Simple Static Website Generator"                                        |

## Assumptions

- A doc's code example is a claim, and `CLAUDE.md` requires every snippet written or changed to
  be run against the engine. Measured (the Rules section).
- Defect 3's behaviour was reported by a subagent and not re-derived by Fable. Inferred. Build
  the case in step 1 before writing a word about it.

## Steps

1. For defects 1, 2 and 3, build a small site in a temp folder that exercises the snippet you
   intend to write, and run it.
   verify: the session log holds each snippet and the output that shows it works.
2. Make the nine corrections, one commit per file.
   verify: after each, `npx vitest run test/aikb.test.js test/unit/skill-coverage.test.js`.
3. For defect 9, propose the new `description` and `keywords` in the session log and wait: the
   wording is the operator's.
4. Fix the class, not the case, for 6 and 7 only: compare every method in `AIKB/kiss.md`'s
   Public interface with the public methods of the class, and every import with Depends on.
   verify: list any further gaps in the session log and fix them.
5. verify: `node docs` exits 0, then `npm run gates`.

## Stop and ask

- A defect is no longer true.
- A correction to `GUIDE.md` adds a `##` or `###` heading (the docs site needs a page for it).
- Defect 9, always, for the wording.

## Fast feedback

```sh
npx vitest run test/aikb.test.js test/unit/skill-coverage.test.js
```
