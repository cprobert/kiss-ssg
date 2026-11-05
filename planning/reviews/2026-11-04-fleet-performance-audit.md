# Fleet performance audit — three live kiss sites (2026-11-04)

The operator asked for this in place of a synthetic slow site: "audit the existing kiss sites using our new found performance powers (choose 3)". It runs the branch's three new tools against real sites:

- the audit's six new checks;
- `kiss-ssg speed`, Lighthouse on the live URLs;
- the live cache and compression headers.

**What it tests and what it does not.** It shows what the tools find on real sites, and whether those findings are true. It is not the with/without test of `kiss-performance` that CLAUDE.md asks of a domain skill: no agent changed any site, so it says nothing about whether the skill makes a site faster.

## Method

- **Sites.** Three, on three hosts, chosen for likely failures rather than for being good. A site already built well shows nothing, as `kiss-seo`'s measurements on good sites showed.
  - k9-solutions: Netlify, kiss 2.7.0, 10 pages.
  - diploma-msc: Firebase, kiss 2.6.2, 683 pages.
  - swan-love: GitHub Pages, kiss 2.5.0, 11 pages.
- **Audit.** The branch engine (2.11.3 at `705210b`) ran a staged `kiss-ssg check`. Each site's `node_modules/kiss-ssg` was swapped for a junction to the working tree, and the registry copy was restored afterwards. The script was `scratchpad/fleet-check.mjs`. `git status` was clean on every site before and after, and nothing was published. All three built on the new engine (exit 0).
- **Speed.** `kiss-ssg speed <live URL> --page / --page <inner> --runs 3`, with Lighthouse 13.6.0 installed only in a scratch folder. The defaults applied: mobile, simulated throttling, and a fresh Chrome per run. The sites ran one after another, never in parallel. These are lab numbers from one machine over this connection, a cold cache each time, and never the field verdict.
- **Headers.** From the measurement earlier the same day (`planning/research/2026-11-04-static-site-performance.md` § Measured).

## Results

### Lighthouse, live (median of 3; score spread in brackets)

| Site         | Page                 | Score      | LCP       | CLS   | TBT    | FCP   | Bytes    | Requests |
| ------------ | -------------------- | ---------- | --------- | ----- | ------ | ----- | -------- | -------- |
| k9-solutions | `/`                  | 98 (96–99) | 2.2 s     | 0.000 | 0 ms   | 1.0 s | 240 KiB  | 7        |
| k9-solutions | `/puppy-training`    | 95 (93–95) | 2.7 s     | 0.000 | 98 ms  | 1.1 s | 313 KiB  | 7        |
| diploma-msc  | `/`                  | 91 (91–92) | 3.2 s     | 0.001 | 27 ms  | 2.0 s | 476 KiB  | 30       |
| diploma-msc  | `/qualification/msc` | 91 (85–91) | 3.2 s     | 0.000 | 108 ms | 1.9 s | 539 KiB  | 40       |
| swan-love    | `/`                  | 81 (53–82) | **4.7 s** | 0.091 | 0 ms   | 1.1 s | 3128 KiB | 77       |
| swan-love    | `/about.html`        | 100        | 1.1 s     | 0.000 | 0 ms   | 1.1 s | 787 KiB  | 25       |

Against the field targets, which these lab numbers only point towards:

- **LCP:** swan-love's home page is over the poor line (4 s). diploma-msc's pages and k9-solutions' service page are between good (2.5 s) and poor.
- **CLS:** swan-love's home page is just under the 0.1 line.
- **The swan-love home page's score spread of 53–82** is the noise `--against`'s rule exists for: one run would have been misleading.

### The audit's speed checks

| Site         | Finding                                                                                                                                                           |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| k9-solutions | none of the six fires                                                                                                                                             |
| diploma-msc  | `script-blocking` on all 683 pages, every one the same script: `https://consent.cookiebot.com/uc.js` in the head                                                  |
| diploma-msc  | `img-dimensions-missing`: 5,059 images on 511 pages. Most are SVG logos and icons repeated in the layout: the USW logo 768×, the UoB logo 441×, `/img/x.svg` 320× |
| diploma-msc  | `img-first-lazy` on 8 course pages: the category thumbnail or hero is lazy                                                                                        |
| swan-love    | `script-blocking` on all 11 pages: `/js/jquery-1.10.2.min.js`                                                                                                     |
| swan-love    | `img-dimensions-missing`: 37 images on 5 pages, including the home page's hero `/images/swan-love.jpg` (503 KB)                                                   |

No site hashes its assets (0 of 17, 0 of 210 and 0 of 92), so `host-unset` had nothing to report: no hashed file, and no aliases.

### Delivery

| Site         | HTML                              | Assets                                                                    | Encoding |
| ------------ | --------------------------------- | ------------------------------------------------------------------------- | -------- |
| k9-solutions | `max-age=0, must-revalidate`      | the same: every stylesheet, script and image is re-checked on every visit | br       |
| diploma-msc  | `max-age=3600` (Firebase default) | images a year, not hashed                                                 | br, h3   |
| swan-love    | `max-age=600`                     | `max-age=600`, not configurable                                           | gzip     |

## What each site would do next, in kiss-performance's terms

**swan-love: the one with a real speed problem.**

1. **The SoundCloud player** is a bare iframe on the home page with `auto_play=true`. It loads, and plays, with the page. The page's six images total about 620 KB. The player alone, measured on its own afterwards in a clean Chromium profile with `auto_play=false`, fetched **2,632 KB** of response bodies on load, from six SoundCloud origins, and stored nothing while logged out. Those are decoded bodies, where Lighthouse counts bytes on the wire, but they make the player most of the page. Make it click to load: `{{embed "soundcloud" id="317030874" title="…"}}`, added on this branch (below).
2. **The hero `/images/swan-love.jpg`** (503 KB, no `width`/`height`): give it its size, `fetchpriority="high"`, and a WebP or AVIF of a sensible width. It is the likely LCP element and the likely source of the 0.091 CLS. Both are inferred: `speed` records the time, not the element.
3. **jQuery 1.10 in the head, blocking:** `defer`, or remove it if nothing needs it.
4. Turning on hashing would buy nothing here: GitHub Pages sends `max-age=600` on everything.

**diploma-msc.**

1. **Cookiebot's `uc.js` blocks every page's first paint.** Cookiebot asks to be loaded synchronously, first, so the finding is true, and its fix is not `defer`. The fix is the site's consent decision: kiss's own consent manager loads no third-party script before a choice. That decision is `kiss-legal-and-privacy`'s and the owner's, not a speed fix to make alone.
2. **Google Fonts, 12 Roboto styles** from a third-party origin: self-host the two or three weights the design uses.
3. **The 8 lazy first images** on course pages: drop `loading="lazy"` from the hero or thumbnail.
4. **The SVG logos without sizes**: one edit per logo in the layout clears thousands of findings.
5. **Unhashed images cached for a year** on Firebase: a replaced logo stays stale for returning visitors. Hash the CSS and JS, and give images a day.

**k9-solutions: fast, with delivery to improve.**

1. Turn on `assets: { hash: true }` and set `host: 'netlify'`. Hashed assets would then be cached for a year, instead of re-checked on every visit as now.
2. `/puppy-training`'s Speed Index of 4.0 s against the home page's 2.2 s is worth one look in the browser, but it is within what one page's content explains.

## What the audit taught about the tools

- **The checks found true problems at the scale they exist**, and k9's clean result agrees with its 95–98 scores. No false finding was seen on kiss's own markup.
- **`script-blocking` needs a second line in the skill:** when the blocking script is a consent manager that must load first (Cookiebot), the fix is the consent decision, not `defer`. → add it to `kiss-performance` and the review's fix row.
- **`img-dimensions-missing` counts per image per page**, so a logo repeated in the layout reads as 768 findings. The summary already groups by page, and the fix is one layout edit. → say so in the fix row ("a layout image counts once per page: fix it in the layout").
- **`{{embed}}` had no `soundcloud` preset**, and the worst page in the fleet is that embed. → The operator chose to add it on this branch. It is the classic 166 px player for a track `{id}`, never autoplaying, with `src=` for a playlist. It has no provider link, because a track id does not lead to the track's page: SoundCloud answers `/tracks/<id>` with a redirect to its charts. Its origins are the six measured, and `consent-missing` now knows `w.soundcloud.com`.
- **The audit cannot see an LCP of 2.7 s on a page it finds clean.** k9's service page is near the line with nothing to report. That is why the skill measures with `speed` before and after, and does not stop at the audit.
- **`speed` worked on live URLs through three CDNs** and exited 0 each time. Every page loaded.
