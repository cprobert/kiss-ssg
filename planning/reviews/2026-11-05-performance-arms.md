# `kiss-performance`: the 2026-11-05 arms

Measured on `feat/review-groups-and-performance` with `scripts/arms.mjs`, at the operator's request after a skill-creator review of the branch's skills. **One run per arm: a signal, not a verdict.**

## The bench

**swan-love at `c23a268`.** It is the one fleet site with a real speed problem in `2026-11-04-fleet-performance-audit.md`: the home page's LCP was 4.7 s, CLS 0.091, and it downloaded 3,128 KiB in Lighthouse. Its problems:

- a 504 KB, 3,800 px hero with no size;
- an autoplaying SoundCloud iframe;
- the Facebook SDK;
- jQuery 1.10 blocking every page;
- all of Bootstrap 3's CSS on every page;
- GitHub Pages hosting.

The answer key, `test/fixtures/performance-answer-key.json`, has 13 items. It was written from the site's source before either arm ran.

## How the arms ran

|             |                                                                                                                                                                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session     | One headless `claude -p` per arm: `claude-opus-5-5`, Claude Code 2.1.318, `--max-budget-usd 6`                                                                                                                                              |
| Engine      | This branch packed (`kiss-ssg-2.11.3.tgz`, the same sha512 in both `arm.json`), so both arms had `{{image}}`, `{{embed "soundcloud"}}`, `assets.purge`, the audit checks and `speed`                                                        |
| Plugin      | `main` at `137e36c` ("without", no `kiss-performance`) or this branch at `a519699` ("with"). **The variable is the branch's plugin diff, not the one skill alone**                                                                          |
| Permissions | `acceptEdits`, an allow-list, a deny list for commit, push, remote, gh, publish and deploy; no bypass flag                                                                                                                                  |
| Brief       | "This site feels slow, especially the home page on a phone. Make it faster: fix what you can, then tell me what you changed, how you know it helped, and what only I can decide. You cannot ask me questions now; list what you would ask." |

| Arm          | Cost  | Time    | Turns | Skill used         | Files changed |
| ------------ | ----- | ------- | ----- | ------------------ | ------------- |
| swan-without | $0.97 | 235 s   | 29    | `kiss-front-end`   | 7, home only  |
| swan-with    | $2.12 | 1,072 s | 64    | `kiss-performance` | 12, all pages |

The total was **$3.09**. Neither arm tried to commit. The with arm had one read-only `grep` denied by the harness (a quoting pattern in the command), which cost it nothing.

Lighthouse was not installed in either copy. Both arms measured with a headless Chromium harness of their own: 3 loads per page, phone emulation and a throttled network. The with arm said it did not install Lighthouse because the skill says to ask first, and it listed that as a question for the owner.

## Their own measurements (lab, each arm's own harness, home page)

|       | Without                 | With                          |
| ----- | ----------------------- | ----------------------------- |
| LCP   | 5.2 s → 1.7 s           | 5.2 s → 0.97 s                |
| FCP   | 2.5 s → 1.7 s           | 2.46 s → 0.97 s               |
| Bytes | 854 → 268 KB (own site) | 939 → 203 KB, 0 other origins |

## `npx kiss-ssg check router.js` on each result (run by the main session)

Both exit 0 with 11 pages and 0 failed. The audit lines that differ:

| Finding           | Without      | With |
| ----------------- | ------------ | ---- |
| `script-blocking` | **10 pages** | gone |
| `consent-missing` | **1 page**   | gone |
| `host-unset`      | **reported** | gone |

Both still show `img-not-responsive` and `img-dimensions-missing` on 4 pages: neither arm converted the photos beyond the home page.

## Marking

**The marker was a fresh agent, marking blind.** Each packet held the run's final message, the check output and the source diff, with skill names redacted (a scan found none left). X was the arm without the skill and Y the arm with it; the marker was not told which was which. The same limits as 2026-11-02 apply: the marker is the same model family as the agents it marked, and redaction cannot hide a skill's style.

| Item                                               | Without       | With          |
| -------------------------------------------------- | ------------- | ------------- |
| 01 SoundCloud click-to-load (`{{embed}}`)          | partial       | **hit**       |
| 02 hero through `{{image}}`, `eager=true`          | hit           | hit           |
| 03 other photos through `{{image}}`                | partial       | partial       |
| 04 commit `.kiss-cache/images`                     | hit           | hit           |
| 05 jQuery not blocking, dependants still run       | partial       | **hit**       |
| 06 purge Bootstrap with a safelist                 | missed        | partial       |
| 07 carousel and navbar checked after               | partial       | partial       |
| 08 before and after, called a lab result           | partial       | **hit**       |
| 09 GitHub Pages decision recorded (`host`)         | missed        | **hit**       |
| 10 oversized originals; `--write` put to the owner | missed        | **hit**       |
| 11 unused files shipped (`.psd`, unused Bootstrap) | missed        | missed        |
| 12 audio cue and the player put to the owner       | **hit**       | partial       |
| 13 no harm                                         | hit           | hit           |
| **Totals (hit / partial / missed)**                | **4 / 5 / 4** | **8 / 4 / 1** |

**The skill changed the outcome.** Both arms did the hero the same way, because `{{image}}` and its audit check are in the engine both had. The arm with the skill went further:

- the whole site, not just the home page;
- SoundCloud and Facebook made click-to-load, which also cleared `consent-missing`;
- jQuery deferred on every page, with its inline users rewritten;
- Bootstrap purged, 100 KB → 30 KB on every page;
- `host` recorded;
- the `--write` sweep put to the owner;
- its numbers called a lab result.

**The arm without the skill made two errors the marker found.**

- Its `sizes="(min-width: 768px) 40vw, 100vw"` does not match Bootstrap 3's `col-md-5`, which only becomes a column at 992 px. Between 768 and 991 px it sends the image at the wrong width.
- Its SoundCloud "fix" was `loading="lazy"` on an iframe near the top of the page. The player still loads and autoplays on nearly every visit, while the message said it waits.

**The marker's two risks for the arm with the skill were measured, and both are unfounded:**

1. **"Inline jQuery may run before the deferred jQuery."** A scan of all 11 built pages found that every inline script using `$` waits for `DOMContentLoaded`. Deferred scripts run before that event.
2. **"The purge safelist leaves out the carousel's `next`, `prev`, `left` and `right`."** The purged `bootstrap.min.css` keeps `.carousel-inner>.next`, `.prev`, `.next.left` and `.prev.right`. kiss's purge reads the build's scripts, and `bootstrap.min.js` names those classes. The carousel also has one slide. The arm still never opened the carousel after the purge, which the skill asks for.

**What counts against the skill arm:**

- It took 4.5 times as long and cost 2.2 times as much.
- It deleted the first-visit audio script without asking, where the arm without the skill put it to the owner. That was a judgement call: the page has no `<audio>`, so the code did nothing but set a cookie.

**Item 11 is a weak item, and the key is wrong to count it.** Unused `.psd` and CSS files in the build cost deploy size, not page load, because no page asks for them. Neither arm touched them, and the skill should not send an agent after them in a speed brief.

## What it changes in the skill

None of the measured shortfalls traces to missing or wrong text in `kiss-performance`:

- **Item 07:** the skill already says to open every interactive component after purging; the arm opened the menu and the contact form and skipped the carousel.
- **Item 03:** the brief said "the home page", and the arm said it stopped there.

So no edit is made from this run.

## What this harness cannot say

- **One run per arm.**
- **Lighthouse did not run.** Each arm measured with its own Chromium harness, so the two arms' numbers are not comparable to each other.
- **The without arm had the engine's new checks and helpers,** which is why its hero work matched the with arm's. The comparison measures the skills on top of the engine.
- **The bench has no web fonts.** The font recipes (`references/fonts.md`) were not exercised. A site on Google Fonts (diploma-msc) would be the bench for them, but it needs CMS data that is not on disk.
