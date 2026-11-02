# Cookiebot on diploma-msc.com: clean-profile baseline (2026-11-02)

**What this is.** A measurement of what Cookiebot lets through on www.diploma-msc.com, taken as the baseline the kiss consent manager must match or beat (`planning/sessions/2026-11-02-consent-manager.md`).

**How it was taken.** A scratch Playwright script drove `playwright-core`'s Chromium at 1366×900, `en-GB`, `Europe/London`, a new empty context per run. Each run looked at the homepage:

- after 10 s idle with no interaction;
- after scrolling to the bottom and waiting 4 s;
- for two runs, after clicking **Deny** or **Allow all** and waiting 8 s, and after a reload.

At each point it recorded every cookie in the context, the `localStorage`, `sessionStorage` and IndexedDB of every frame, and every request host. Raw output stayed in the session scratchpad (`cookiebot/results.json`, screenshots). The script is not committed. Whether the measurement becomes a `scripts/` tool is a contract decision.

**Side effects.** The runs added two consent records (one decline, one accept) to Learna's Cookiebot log, and the Accept run fired one round of analytics and ad hits.

## Before any choice

- **No cookies.** GTM and every tag behind it stay blocked: Consent Mode defaults to denied, and Cookiebot holds them.
- **Requests:** Cookiebot (`consent.cookiebot.com`, `consentcdn.cookiebot.com`), Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) and `learna.imgix.net`. Google Fonts is a third-party request before any choice; the legal skill fixes it by self-hosting.
- **`sessionStorage`:** `superchat-notice-collapsed`, written by the site's own launcher. Minor; arguably within the appearance and functionality exception.

## After scrolling, still no choice: the finding

The lazy-loaded background Vimeo video (`player.vimeo.com/video/909977755?autoplay=1&loop=1&autopause=0&muted=1`) writes storage **before any choice, and it is all still there after Deny**:

- **cookies:** `vuid` (`.vimeo.com`, about 13 months), `player`, `cf_clearance`, `__cf_bm`, `__cf_ob`;
- **`localStorage` in the Vimeo frame:** `PLAYER_PICOX_SAMPLING_SEED`, `sync_active`, `LOCAL_STORAGE_ID_VIMEO_PLAYER`, `LOCAL_STORAGE_ID_PICOX_ID`;
- **IndexedDB in the Vimeo frame:** `orionV3`, `picox`.

Cookiebot's auto-blocking does not catch it. This is storage before consent (a P1 under `kiss-legal-and-privacy`), and it is one of the three things the ICO's 2025 sweep tested: cookies set after a refusal.

## Deny

- **No tracking.** The banner sends `GET consent.cookiebot.com/logconsent.ashx?action=decline&…&usercountry=GB` and sets `CookieConsent` on `www.diploma-msc.com`, expiring in 12 months.
- **The cookie's format** (read in the operator's own Chrome): `{stamp:'<id>',necessary:true,preferences:…,statistics:…,marketing:…,method:'explicit',ver:1,utc:<ms>,region:'gb'}`.

## Allow all

37 request hosts, by owner:

- **Google:** `www.googletagmanager.com`, `region1.analytics.google.com`, `googleads.g.doubleclick.net`, `ad.doubleclick.net`, `stats.g.doubleclick.net`, `www.googleadservices.com`, `www.google.com`, `www.google.co.uk`;
- **Microsoft:** `bat.bing.com`, `c.bing.com`, `www.clarity.ms`, `scripts.clarity.ms`, `c.clarity.ms`;
- **Meta:** `connect.facebook.net`;
- **Reddit:** `www.redditstatic.com`, `alb.reddit.com`;
- **ActiveCampaign:** `diffuser-cdn.app-us1.com`, `prism.app-us1.com`, `trackcmp.net`;
- **OpenAI:** `bzr.openai.com`, `bzrcdn.openai.com`;
- **Superchat:** `widget.superchat.de`, `api.superchat.de`, `file-cdn.superchat.de`;
- plus the hosts already loading before the choice.

**First-party cookies set:** `_ga`, `_ga_14ZPVBDBGM`, `_gcl_au`, `_uetsid`, `_uetvid`, `_rdt_uuid`, `_fbp`, `_clck`, `_clsk`, `__obref`, `prism_66869042`.

**`localStorage`:** `_uetvid`, `_uetsid` (and their `_exp`), `_gcl_ls`, `lastExternalReferrer`, `lastExternalReferrerTime`.

Almost all of this arrives through GTM, so on this site **Consent Mode is the gate**. Only Superchat, Vimeo and the fonts are outside GTM.

## The banner

- **Structure:** `role="region"`, not modal.
- **First layer:** "Allow all" (a filled pink button), "Deny" (an outline button), category toggles off by default (Necessary on and locked), "Show details", and a ✕ whose behaviour was not tested.
- **Weighting:** the two buttons are not visually equal, which is at risk under the ICO's "equally prominent" wording and the EDPB taskforce's "deceptive button colours".
- **Withdrawal:** the site's privacy and cookie pages point to "the cookie settings icon" and "the cookie consent center". Neither page has its own link or button to reopen the choice (`legal/privacy.hbs:82`, `legal/cookie.hbs:71`, read from the templates).

## What the kiss gate must do on this site

- **Before a choice and after Reject:** nothing from Vimeo, Superchat, GTM or the tags behind it. Self-hosted fonts.
- **After Accept:** the same tag hosts as above.
- **Superchat and the GeoIP cookies:** the site's own code that reads `Cookiebot.consent[...]` and listens for `CookiebotOn*` events (`superchat-launcher.hbs`, `course.js`) moves to the kiss client API.
