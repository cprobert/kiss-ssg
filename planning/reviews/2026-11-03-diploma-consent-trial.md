# diploma-msc on the kiss consent manager: trial (2026-11-03)

**What this is.** Slice 7 of `planning/sessions/2026-11-02-consent-manager.md`: diploma-msc.com migrated from Cookiebot to `config.consent` on this branch's engine. The migration ran in a throwaway git worktree, so nothing in diploma-msc was committed or deployed. It was built in production mode and measured in a clean Chromium profile against the Cookiebot baseline (`planning/reviews/2026-11-02-cookiebot-baseline.md`).

**Setup:**

- A detached worktree of diploma-msc `85cfd5f6` beside the repository.
- The gitignored Orchard data (1,085 model files, fetched 2026-11-02) and `.env` copied in from the operator's checkout, verified file-for-file. Nothing was fetched.
- `npm ci --ignore-scripts`, so the global installs in the site's `preinstall` and `postinstall` hooks did not run.
- `node_modules/kiss-ssg` junctioned to this branch.
- Built with `node generate production` and `npx grunt --force`. `--force` skipped `cwebp`, whose binary arrives in an install script; it only converts images to WebP.

## The migration

Nine files changed, 96 lines added and 69 removed. The diff is kept in the session scratchpad (`trial/migration.diff`).

- **`layout.hbs`:**
  - `<meta charset>` moves to the top, then `{{consentHead}}`;
  - out: the Cookiebot script, its hand-written Consent Mode default, the Cookiebot branding CSS, and the `<noscript>` GTM iframe;
  - in: the GTM snippet becomes `{{consentScript "gtm" id=gtmId}}`, and `{{consentBanner}}` goes first in `<body>`.
- **The footer** gains `{{consentSettings}}`.
- **`generate.js`** gains `consent.services`:
  - `gtm`, declaring the container's own first-party cookies and storage from the baseline, which the preset's `_ga`, `_ga_*` and `_gcl_au` join;
  - `superchat` (marketing);
  - `geoip` (preferences, its two cookies);
  - `vimeo`;
  - `recaptcha` (necessary).

  It also sets `ui.policy: 'legal/cookie'`.

- **Site code:**
  - `superchat-launcher.hbs` and `course.js` move from `Cookiebot.consent` and the `CookiebotOn*` events to `kissConsent.has()` and `kissConsent.on('ready' | 'change')`;
  - the home page's scripted Vimeo background waits on `kissConsent.when('vimeo', …)`;
  - the two hard-coded Vimeo iframes (`jccp.hbs`, `student-story.hbs`) become `{{consentEmbed "vimeo"}}`;
  - the cookie page gets `{{consentTable}}` and `{{consentSettings}}`.

`kiss-ssg check` passed: 686 pages, 0 failed.

## What the measurement found

Home page, 1366×900, a new context per scenario. Every request off `www.diploma-msc.com` was recorded and aborted, except the container scripts (`/gtm.js`, `/gtag/js`) in the Accept run.

|                                                        | Cookiebot (baseline)                                                                                         | kiss                                                                                                                                                          |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Before a choice (10 s idle)**                        | No cookies. Google Fonts.                                                                                    | No cookies, no storage. Google Fonts and the site's own image CDN (`learna.imgix.net`).                                                                       |
| **After scrolling, no choice**                         | **The Vimeo player loaded**: `vuid`, `player`, `cf_clearance`, `__cf_bm`, Vimeo `localStorage` and IndexedDB | Nothing gated loaded. No Vimeo.                                                                                                                               |
| **Reject (Deny)**                                      | The Vimeo storage stayed                                                                                     | Only `kiss_consent`, then nothing gated after a reload                                                                                                        |
| **Accept**                                             | GTM and about 37 tag hosts                                                                                   | GTM and the same tag families: Google Ads, Analytics and DoubleClick; Bing UET; Clarity; Meta; Reddit; ActiveCampaign; OpenAI; Vimeo. Google hits `gcs=G111`  |
| **Withdraw** (accept, then untick everything and save) | (not measured)                                                                                               | The page reloads. After scrolling, only the site's own CDN is requested; only `kiss_consent` remains; the choice reads `preferences: false, marketing: false` |

The two criteria the trial exists for:

- **Nothing before a choice, and nothing after Reject: met.** That includes the Vimeo storage Cookiebot missed. Google Fonts and the site's own image CDN are not gated and never were.
- **After Accept, the same tag hosts as Cookiebot: met.** This was not true on the first run; see below.

## An engine defect the trial found, fixed on the branch

The first Accept run measured `gcs=G110`: ad storage granted, analytics storage denied.

- **Why:** diploma-msc's only Google tag is `gtm`, under marketing, and it offers no statistics category. `analytics_storage`, mapped to statistics, could therefore never be granted, and GA4 would have run cookieless for every visitor who accepted everything.
- **The fix:** `resolveConsent` now hands the Consent Mode types of a category the site does not offer to the category holding its Google tags (`c3e8321`, seen red first).
- **After the fix:** the trial measured `G111`.

A unit test alone would not have found this. It needed the real container and a site whose categories differ from the fixture's.

## What the audit says about diploma-msc now

These are findings for the site, outside this branch:

- **`consent-ungated`: third parties no service gates.**
  - `widget.trustpilot.com` (145 pages);
  - `player.vimeo.com` (108 pages, from embeds this trial did not migrate);
  - `learna.imgix.net` as a script or frame (43 pages);
  - YouTube (3);
  - `calendar.google.com` (2);
  - Unibuddy (2).

  Cookiebot's auto-blocking was relied on for some of these, and missed at least the Vimeo one. Each needs a service: an embed, a `necessary` declaration, or a decision.

- **`consent-settings-missing`:** 37 landing pages hide the footer, so no settings control appears there.
- **`consent-records-missing`: gtm.** With Google Ads in the container, Google's policy expects consent records, so the site needs an `endpoint`.
- **Content on the cookie page itself:**
  - it says unclassified cookies "can be placed without your consent", which only strictly necessary storage may be;
  - at 390 px, three of its long browser-help URLs overflow the page by 50 px. The consent table's own region scrolls, as designed.
- **Before any choice**, Google Fonts is a third-party request. The legal skill's fix is to self-host.

## Not measured

- **Pages other than the home page,** apart from the build-wide audit.
- **Superchat's own opt-in.** A click on its launcher loads the widget without a cookie choice, by the site's design. It was migrated, not measured.
- **Statistics only:** diploma-msc offers no statistics category, so there is nothing to tick.
