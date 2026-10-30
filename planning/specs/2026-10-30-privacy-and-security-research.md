# Privacy and security on small static sites: the research behind `kiss-privacy-and-security`

**Date:** 2026-10-30. **Session:** `planning/sessions/2026-10-30-branch-merged-and-privacy.md`. **How it was made:** a deep-research workflow searched five angles, fetched 24 sources, extracted 110 claims, and put 25 of them to three adversarial verifiers each (a claim survives unless two of three refute it). All 25 survived; they merge into the 10 findings below. The first run's verification failed on the organisation's spend limit and was resumed from cache, so the searches and fetches are the same; only the verification ran again.

**Use it this way:** a rule in the skill must trace to a finding here, with its source. Where this report has no finding, the skill states no rule; it says the area is not yet researched.

## What it covers, and what it does not

**Covered well — UK law (PECR and UK GDPR), almost all from primary ICO pages.**

**Not covered — the security half.** Only one security claim survived. Nothing was verified on: third-party embeds and their privacy cost, self-hosting fonts, Subresource Integrity; Strict-Transport-Security, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, the details of CSP, or how each host sets headers (Netlify and Cloudflare Pages `_headers`, Firebase `firebase.json`, Vercel `vercel.json`, GitHub Pages none); honeypots, rate limiting, CAPTCHA and its privacy cost; mixed content, leaked secrets and source maps, supply-chain risk in the build, `security.txt`, `rel="noopener"`. The research says plainly: **do not read the absence of claims as an absence of guidance.** Those parts need a second pass, from MDN, web.dev, OWASP and the hosts' own documentation.

## Findings

Confidence and vote are the workflow's. Quotes are from the sources.

### 1. What PECR regulation 6 covers — high, 3-0

Regulation 6 covers any technology that stores information on, or reads it from, a user's device: cookies, tracking pixels, scripts, tags, web storage (`localStorage`) and device fingerprinting, **whether or not the information is personal data**. The ICO's 2025 guidance named more technologies but did not widen the law. For a static site, a third-party embed that sets or reads storage (a map, a video player, a form widget, analytics) falls under it.

- ICO, September 2025: "The rules apply to any technology that stores or accesses information on someone's device." — <https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/09/fact-vs-fiction-ico-debunks-myths-on-storage-and-access-technologies/>
- ICO report to DSIT, 5 May 2026: regulation 6 covers "cookies, scripts, tags and web storage ... whether or not the information is personal data." — <https://ico.org.uk/media2/yefdqvk4/20260505-report-for-dsit-on-changes-to-regulation-6-pecr-for-online-advertising.pdf>

### 2. Consent, where no exception applies — high, 3-0

Consent comes **before** the technology is set, and needs a positive action: silence, inactivity, continued browsing and "by continuing you agree" banners are not consent. **Refusing must be as easy as accepting**, and every non-exempt option is off by default; pre-enabled "legitimate interests" toggles are the ICO's example of bad practice.

- "If none of the exceptions apply ... you must obtain prior consent ... Silence or inactivity doesn't qualify." — <https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/>

### 3. The five exceptions — high, 3-0

Consent is not needed in five narrow circumstances: (1) the sole purpose of transmitting a communication; (2) strictly necessary for a service the user requests; (3) statistical purposes (analytics); (4) appearance, adapting the service to the user's preferences; (5) emergency assistance. The Data (Use and Access) Act 2025 added 3 to 5; they came into force in early 2026, and the ICO calls the statistical exception "current".

- "You can store or access information in five circumstances without ... consent ... exceptions are narrow in scope." — <https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/>
- **Not confirmed:** the commencement date (5 February 2026, Commencement No. 6) comes from law-firm sources, not legislation.gov.uk.

### 4. Analytics without consent: every condition — high, 3-0 (one merged claim 2-1)

Only when **all** hold: the sole purpose is aggregate statistics on how the service is used, to improve it; the site gives clear and comprehensive information and a simple, free way to object, and stops when someone objects; a third-party provider is a **processor, not a joint controller**, and does not link the data with other data it holds; nobody uses it to monitor or track individual visitors, or for advertising.

- "The statistical purposes exception does not allow you to monitor or track individual visitors." "Your third party provider must be a processor, not a joint controller." — the two ICO guidance pages above.

### 5. "Strictly necessary" did not change — high, 3-0

Storage or access must be essential to provide the service the user asks for, judged **from the user's point of view**, not the business's. The DUAA gives examples: authentication, security, preventing technical faults. Advertising and commercial convenience never qualify; cross-site or cross-device tracking always needs consent. On a static site, a cookie that stores the consent choice itself fits.

- "'Strictly necessary' means storage or access must be essential to provide the service." "There are no advertising purposes that meet the strictly necessary exception." — the ICO September 2025 page and the exceptions page above.

### 6. A form must inform at the time it collects — high, 3-0

Under UK GDPR Article 13, a site that collects personal data directly from people, as a contact or enquiry form does, must give them privacy information **at the time it collects it**. The only general exception is information the person already has.

- "You must provide privacy information to individuals at the time you collect their personal data from them." — <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/>

### 7. What that information must include — high, 3-0 (one merged claim 2-1)

The organisation's name and contact details; the purposes; the lawful basis (and the legitimate interests, if it relies on that basis); the retention period or how it is set; the recipients, **which include a form service such as Formspree or Wufoo** (a processor is a recipient, Article 4(9)); any transfer to a third country (relevant to US-based form services); and people's rights. **A layered approach is acceptable:** a short notice at the form that links to the full privacy notice.

- The ICO's checklist: <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/the-right-to-be-informed/checklists/>; for small organisations: <https://ico.org.uk/for-organisations/advice-for-small-organisations/privacy-notices-and-cookies/are-you-transparent-about-how-you-use-peoples-data/>
- The 2-1 dissent was only about wording that put every item in the notice at the form itself; the layered approach answers it.

### 8. Seven lawful bases now — high, 3-0

The DUAA 2025 added "recognised legitimate interest" (Article 6(1)(ea)), for pre-approved purposes listed in Annex 1, so there are seven. A privacy notice names the basis it relies on. A small business's contact form usually relies on legitimate interests, or on steps taken at the person's request before a contract; the new basis covers only the listed purposes.

- <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/a-guide-to-lawful-basis/>

### 9. Data minimisation — high, 3-0

A form collects only the minimum personal data its purpose needs. "You must not collect personal data on the off-chance that it might be useful in the future." Applying that to "just in case" optional fields is the researcher's inference, not the ICO's words.

- <https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/>

### 10. Clickjacking — medium, 3-0, one source

OWASP recommends the CSP `frame-ancestors` directive, and gives `X-Frame-Options: DENY` as the value that blocks all framing. A site that is never framed can send `frame-ancestors 'none'` and `X-Frame-Options: DENY`. Calling the second a "fallback" is an inference; the page does not use the word. **The only security claim that survived.**

- <https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html>

## Caveats

- Several ICO pages carry an "under review" banner because of the DUAA, and may change. The storage-and-access pages reflect the new exceptions but do not name the Act or show a date.
- The ICO's May 2026 report to DSIT discusses possible further exceptions for advertising, so the advertising rules may change again.
- One cited ICO news page (August 2024, a privacy-notice generator) now returns 404; the claims that relied on it rest on the live guidance.

## Open questions, for the second pass

- Which analytics tools (Plausible, Fathom, Cloudflare Web Analytics, self-hosted Matomo, GA4 with particular settings) meet finding 4's conditions, and what objection mechanism does the ICO accept on a static site?
- How does each static host set a baseline of HSTS, CSP, X-Content-Type-Options, Referrer-Policy and Permissions-Policy, and what values do OWASP and MDN recommend now?
- Do privacy-friendly spam defences (honeypots, time-based checks, Cloudflare Turnstile, hCaptcha) fall within a PECR exception, or does a CAPTCHA that reads device data need consent?
- What must a UK site say and do (adequacy, the UK-US data bridge, an IDTA) when a form sends data to a US-based processor?

## Second pass, 2026-10-30: the security half (partial)

A second deep-research run on the security half only. **9 claims verified (8 by 3-0, 1 by 2-0), none refuted.** About 15 more, on how each host sets headers (Netlify, Cloudflare Pages, Firebase, Vercel), Subresource Integrity, click-to-load embeds and meta-CSP limits, were extracted but **not verified**: their verifiers, and the synthesis, failed on the organisation's spend limit. Resume run `wf_1fea7226-ca6` from its script to verify them; until then, no rule rests on them.

All from OWASP's HTTP Headers Cheat Sheet (<https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet>), MDN's CSP guide (<https://developer.mozilla.org/en-US/docs/Web/Security/Practical_implementation_guides/CSP>) or web.dev (<https://web.dev/articles/strict-csp>):

- **X-XSS-Protection:** do not set it, or set it to `0`; a CSP that disables inline JavaScript does the job instead (OWASP, 3-0).
- **HSTS:** OWASP's value is `max-age=63072000; includeSubDomains; preload`, and it says to check the preload requirements before asking for preload (OWASP, 3-0).
- **X-Content-Type-Options: nosniff** and **Referrer-Policy: strict-origin-when-cross-origin**, set explicitly rather than relying on browser defaults (OWASP, 3-0).
- **Framing and isolation:** CSP `frame-ancestors` obsoletes X-Frame-Options in supporting browsers, and OWASP still recommends `X-Frame-Options: DENY`; **Cross-Origin-Opener-Policy: same-origin**; **Permissions-Policy** turning off every feature the site does not use, e.g. `geolocation=(), camera=(), microphone=()` (OWASP, 3-0).
- **Hashes, not nonces, for a static site:** "use nonces if you can dynamically generate content or hashes if you need to serve static content" (MDN, 3-0); web.dev agrees, "use a hash-based CSP for HTML pages served statically" (2-0).
- **A strict CSP is preferred** over an allowlist, which often admits unsafe domains; but an allowlist CSP, or even `default-src https:`, is better than none (MDN, 3-0).
- **Roll out with Content-Security-Policy-Report-Only first**, and send both `report-to` and the deprecated `report-uri`, since `report-to` is not yet supported everywhere (MDN, 3-0).
- **Where the header cannot be set** (GitHub Pages), MDN accepts `<meta http-equiv="Content-Security-Policy" content="…">` as the **first** `<meta>` in `<head>`. Which directives a meta CSP cannot carry was not verified (MDN, 3-0).
