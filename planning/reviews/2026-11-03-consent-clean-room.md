# Consent clean room (2026-11-03)

**What this is.** Slice 8 of `planning/sessions/2026-11-02-consent-manager.md`: what an agent does with consent given only what ships.

**Setup:**

- **Starting point:** an empty site repo holding a bare `package.json`, set up by `scripts/arms.mjs setup`.
- **Engine:** this branch, packed (`kiss-ssg-2.10.0.tgz`).
- **Plugin:** the plugin at `cec6c76`.
- **The run:** headless `claude -p` with the harness's allow-list and a $4 cap.
- **The brief** named no kiss feature: a Leeds physiotherapy clinic, three pages, a YouTube video on the home page, Google Tag Manager for Analytics and Ads (`GTM-K1RK5TL`), and "a proper cookie banner, as the law requires in the UK", with no paid third-party tool. No questions allowed; list the guesses.

**Run:** $1.84, 310 s, 42 turns, no commit attempts, no permission denials. It invoked `kiss-site-new` and then `kiss-legal-and-privacy`.

## What it built

- **Pages:** home, treatments and contact, plus the cookie, privacy and 404 pages a launch needs. Every unknown fact is marked `[to confirm: …]` on the page, and there is a `HANDOVER.md` for the owner.
- **Consent:** the built-in consent manager, found from the skills alone.
  - `config.consent` declares `gtm` and `youtube`.
  - The layout follows the guide: `{{consentHead}}`, `{{consentBanner}}`, and `{{consentSettings}}` in the footer.
  - The video is `{{consentEmbed}}`, and the cookie page carries `{{consentTable}}`.
- **The marketing category's wording:** it renamed the category "Measuring and advertising" and wrote its description. That is what the guide asks of a site whose analytics ride on marketing (the Consent Mode rule kept at the third pulse).
- **What it reasoned on its own:**
  - kept `gtm` under marketing, for the reason the guide gives (a container can run tags Consent Mode does not govern);
  - judged that Google Analytics is not within the UK statistics exception;
  - left `consent-records-missing` open, because it knew of no server to store records.

## Verified by the main session, not taken from the agent's report

- **`npx kiss-ssg check router.js` in the copy:**
  - exit 0, 6 pages, 0 failed, on the packed engine (stderr names `node_modules/kiss-ssg`, not a link);
  - findings: `og-image-missing`, `placeholder-left` (the marked facts) and `consent-records-missing` (no endpoint), all declared in the agent's own report;
  - `consent: version 3477a66d870e, banner 0c70ff13bd4e, 2 services`.
- **`scripts/consent-measure.mjs`** on its build, with `www.kirkstallphysio.co.uk` mapped locally and every third-party request recorded and aborted:
  - **Before a choice:** no third-party request, no cookie, no storage, across 10 s idle and a scroll.
  - **Reject:** only `kiss_consent`, and nothing on reload.
  - **Accept:** GTM and the YouTube embed.
  - **Withdraw:** the reload requested nothing gated.
  - `nothingBeforeChoice: true`, `nothingAfterReject: true`.

## Its guesses, and what they say about the docs

It listed 17 guesses. None was about how to use the consent manager: the config, the helpers and the client needed no guess. The consent-related ones were judgements the docs leave to the site, and it made each the way the guide argues:

- the category name and wording;
- `gtm` under marketing;
- GA4 not within the statistics exception;
- no endpoint without a server.

The rest were the business's own facts (address, hours, treatments, prices, the domain, the host) and tooling limits:

- headless Chrome would not go narrower than 500 px, so it measured overflow in iframes;
- it did not press Tab in a real browser;
- it did not run `kiss-ssg aikb`, and its handover says to run it before each deploy that changes the banner.

**One thing to note, not a defect:** the transcript summary counts 0 `SKILL.md` reads, because both skills arrived through the Skill tool rather than by reading the file.
