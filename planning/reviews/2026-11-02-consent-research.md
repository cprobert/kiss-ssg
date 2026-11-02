# Consent management: research pass (2026-11-02)

**What this is.** The research behind `planning/sessions/2026-11-02-consent-manager.md`. A sub-agent gathered it on 2026-11-02, loading every source that day. Its fetch tool summarises pages, so quoted wording should be checked against the page before it goes into a skill. **Re-checked at source by the main session:** the four Google claims in §3 (the CMP requirement, UK traffic, records, August 2026), against the policy help page [15]. Everything else is the sub-agent's reading of the sources listed.

Labels: [L] law · [R] regulator guidance · [V] vendor requirement · [D] library or spec docs · [2] secondary. Numbers refer to the source list.

## 1. UK: PECR Schedule A1 and the ICO

- **New in 2026.** Schedule A1 was inserted into PECR on **5 Feb 2026** (DUAA s.142, S.I. 2026/82). [L][1]
  - **Para 5 (statistics):** solely "to collect information for statistical purposes about how the service is used", to improve it.
  - **Para 6 (appearance):** "to adapt to the preferences of the subscriber or user", or "enable an enhancement of the appearance or functionality".
  - **Conditions for both:** "clear and comprehensive information" and "a simple means of objecting, free of charge".
- **The ICO's storage and access technologies guidance** became final on **29 Apr 2026**; the draft was published 20 Dec 2024. [R][2]
- **The statistics exception in practice.** [R][3]
  - Aggregate figures only: no tracking of individuals, no advertising.
  - **The objection:** no format is prescribed. The ICO says you "could" use your consent mechanism with "a toggle that is on by default", and that you "must not solely rely on browser settings".
  - **Third-party analytics can qualify** only if:
    - the provider acts as your processor, not as a joint controller;
    - it uses the data only to improve your service, and does not combine it with other data;
    - you name it to users.
  - Any other use ("linking activity to ad clicks") needs consent.
  - **GA4 is not named.** Whether it could qualify is the sub-agent's inference, and commentators disagree. [2][4]
- **The appearance exception.** Examples: responsive layout, a remembered language, self-hosted fonts, the operating system's theme. Choosing content from inferred interests is excluded. A third-party font service that collects IP addresses needs disclosure and an opt-out. [R][3]
- **Storing the choice itself.** Persistent consent-preference cookies may be strictly necessary (the ICO gives "90 days" as an example), with prominent information. Alternatively, interacting with the banner can be consent to the cookie that remembers the choice. Either way, the choice may be used for nothing else. [R][3]
- **Banner design.** [R][5]
  - **Buttons:** "equally prominent options to 'accept all' or 'reject all'" on the first layer, or three equal options (accept, reject, customise). It must be "as easy to refuse consent as it is to accept".
  - **Defaults:** toggles "turned off by default". "By continuing to use our website, you consent" counts as pre-enabling.
  - **Navigating past the banner** is not consent.
  - **Granularity:** choices by purpose; no consent through terms and conditions.
- **Remembering and asking again.** [R][5]
  - **No legal limit.** The ICO says you "should not repeatedly ask", and should ask again after a refusal only "after a reasonable amount of time".
  - **"We recommend that six months is a suitable timeframe to request fresh consent."** You must ask again when the purposes change.
  - **Withdrawal:** "at any time" and "with the same ease". Technologies already set must be removable.
- **Records.** [R][5] "You must be able to demonstrate that someone has provided consent"; "the exact method… is for you to decide". Protect the records. If you rely on a preference cookie's expiry, document that decision.
- **Timing.** Consent comes **before** any storage or access that is not exempt, and nothing is pre-enabled. Audit third parties. [R][6]
- **Pixels and scripts.** Regulation 6 applies "whenever the use of scripts and tags accesses or stores information". These ICO pages say nothing about "cookieless" pings or Consent Mode. [R][7]
- **Enforcement** (ICO update, 4 Dec 2025). [R][8]
  - **Results:** 979 of the top 1,000 UK sites now compliant; 17 preliminary enforcement notices; no fines.
  - **What it tested:** advertising cookies set before a choice; whether rejecting is as easy as accepting; cookies set after a refusal.
  - **Effect:** consent-manager vendors serving about 80% of the top 500 sites changed their defaults.
  - DUAA raised PECR fines to £17.5m or 4% of turnover. [2][4] No 2026 ICO fine on banners was found.

## 2. EU

- **EDPB Cookie Banner Taskforce (18 Jan 2023).** [R][9] Flagged:
  - no reject option on the first layer;
  - pre-ticked boxes;
  - deceptive link design, and deceptive button colours or contrast;
  - "legitimate interest" claims;
  - essential cookies wrongly classified;
  - the design of the icon used to withdraw.
- **EDPB Guidelines 2/2023 on Art 5(3).** Final version 2.0, dated 7 Oct 2024. [2][10][11] They cover URL tracking, pixel tracking and IP-only tracking. The PDF's text could not be extracted, so they are not quoted here.
- **CNIL.** [R][12][13]
  - Accepting and refusing must be equally simple, and withdrawing as easy as consenting.
  - **The choice:** keep it for 6 months (good practice, assessed case by case), and do not ask again during the same visit.
  - **Proof of consent:** a timestamped hash or escrow of the consent code, timestamped screenshots of each version, audits, or timestamped records of the consent manager's configuration.

## 3. Google Consent Mode v2 and Google's policy

- **EU User Consent Policy.** Applies to visitors in the EEA, the UK and Switzerland. [V][14][15]
  - Get legally valid consent for cookies where it is required, and for ad personalisation.
  - Name each party involved, and say how to revoke consent.
  - **Keep records:** at minimum "the text and choices presented to users" and "a record of the date and time of the user's affirmative consent". _(Re-checked at source.)_
- **Certified CMPs.** _(Re-checked at source.)_
  - **Publishers** serving personalised ads through AdSense, Ad Manager or AdMob "are required to adopt a Google-certified CMP" integrated with IAB TCF. [V][15][16]
  - **Advertisers:** "Google does not require advertisers to use a CMP from the Partner Program."
  - **UK traffic:** "we do not have an expectation for advertisers to send a verified consent signal to Google for UK or Swiss traffic."
  - **So:** a home-built gate is viable for Ads conversion tracking and GA4, and not for a site that shows AdSense or Ad Manager ads.
- **New in 2026.** "Beginning in August 2026, Google will begin launching its IP-based ads measurement", and advertisers must show a "prominent link" to Google's page on how it processes data. _(Re-checked at source.)_ [V][15]
- **Mechanics.** [D][17]
  - **Four v2 types:** `ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`.
  - **The default** goes on every page, before the GTM snippet or any config call: `gtag('consent','default',…)`. "The order of the code here is vital."
  - **`wait_for_update`** is in milliseconds, for banners that load asynchronously.
  - **`region`** takes ISO 3166-2 codes; the most specific match wins.
  - **Updates:** call `update` on every change, revocation included, and not during page unload. Inside GTM templates, use `updateConsentState`.
  - **Storage:** the site keeps the choice itself, in a first-party cookie or `localStorage`.
  - **Optional settings:** `url_passthrough`, `ads_data_redaction`.
- **Basic and advanced.** [V][18]
  - **Basic:** tags are blocked until a choice, and nothing is sent on decline.
  - **Advanced:** tags load with consent denied and send "cookieless pings" (timestamp, user agent, referrer, whether there was an ad-click ID, consent state, a random number per page). Google uses them for modelling.
- **Regulators on advanced mode.** No primary regulator or data-protection authority statement was found. Read with the ICO and EDPB wording on scripts and pixels, pings before consent are a legal risk, not a settled position. [2][19]

## 4. Open-source consent managers

- **orestbida/cookieconsent v3** (v3.2.1, MIT). [D][20–24]
  - **Gating:** scripts use `type="text/plain"` with `data-category`, plus optional `data-service`, `data-type` (the real type, such as `module`) and `data-src`. A `!` prefix runs a script when consent is refused, for clean-up.
  - **Storage:** a cookie `cc_cookie`, 182 days, `SameSite=Lax`, `Secure` on HTTPS, holding categories, services, `revision`, `consentId`, `consentTimestamp`, `lastConsentTimestamp`, data and language. Changing `revision` invalidates the stored choice.
  - **Withdrawal:** `autoClearCookies`, with an `autoClear` list per category (by name or regex, path, domain) and an optional page reload.
  - **API:** `acceptedCategory`, `acceptedService`, `validConsent`, `getUserPreferences`, `eraseCookies`, `loadScript`, `showPreferences`.
  - **Events:** `cc:onFirstConsent`, `cc:onConsent`, `cc:onChange` (reporting which categories and services changed).
  - **Consent Mode:** a recipe sets everything to denied before `run()`, then updates on first consent, consent and change.
  - **Iframes:** a separate MIT project, iframemanager. `<div data-service data-id>` shows a notice with "load" and "load all" buttons, and keeps a cookie per service.
  - **Documented pitfall:** "a `<script>` tag can be enabled and disabled at most once".
- **Klaro** (BSD-3; about 57 kB minified and gzipped, styles and translations included). [D][25–28]
  - **Gating:** `type="text/plain"` with `data-type`, `data-name` and `data-src`; the same for images, links and pixels.
  - **Storage:** a cookie `klaro`. Its sample config says 365 days while the comment says 120.
  - **Withdrawal:** a list of cookies per service. Third-party-domain cookies cannot be deleted, and a wrong path or domain silently fails to delete.
  - **GTM:** gate the GTM snippet itself; `onInit` sets defaults to denied; on accept or decline, call the gtag `update` and push a `klaro-<service>-accepted` event to the data layer.
- **Silktide Consent Manager v2.0** (MIT). [D][29]
  - **No attribute gating:** scripts are injected from config with `onAccept`/`onReject` callbacks.
  - **Withdrawal:** reloads the page to remove the scripts.
  - **Storage:** `localStorage`.
  - **Consent Mode:** built in, plus a data-layer event.
- **Pitfalls from the HTML specification and MDN.** [D][30–32]
  - A script inserted by script is forced async, so external scripts run out of order unless `async=false` is set.
  - `document.write` from an async or deferred script is ignored, and after the page has loaded it clears the document.
  - Activating a `text/plain` script in practice means cloning or re-inserting it. Once it has run, it never runs again (the sub-agent's inference from the specification).
  - Scripts that GTM injects are outside any attribute gate; only Consent Mode or GTM triggers control them.

## 5. Accessibility

- **The GOV.UK cookie banner.** [R][33]
  - **Placement:** straight after `<body>`, before the skip link.
  - **Markup:** `role="region"` with `aria-label="Cookies on [service]"`, never sticky or fixed. An h2, two equal buttons ("Accept" and "Reject"), and a "View cookies" link.
  - **After a choice:** a confirmation message (`role="alert"`, `tabindex="-1"`) takes focus, with a "Hide cookie message" button.
  - **Storage and display:** the preference cookie lasts 1 year, and the banner shows on every page until a choice is made. A server-rendered form works without JavaScript.
- **WCAG 2.2 SC 2.4.11 (AA).** [34]
  - A sticky banner fails "if it entirely obscures a component receiving focus".
  - It can pass by being modal, by scroll padding, or by closing when it loses focus.
  - Non-modal sticky banners are at risk; "A properly constructed modal dialog will always pass."
  - A banner placed by the author, rather than opened by the user, gets no exception.

## Decisions this research supports

1. **The first layer:**
   - Accept and Reject are equal buttons, with a link to the preferences;
   - toggles are off;
   - closing the banner, or navigating past it, means no consent;
   - Reject stops everything Accept would start.
2. **The choice cookie** is used for nothing else, and is disclosed. It lasts **6 months** (ICO, CNIL and orestbida agree). The site writes that decision down.
3. **A config version** that is newer than the stored choice means the visitor is asked again.
4. **Records:**
   - Google requires advertisers to keep the text shown and the date and time;
   - CNIL accepts timestamped hashes of each banner version;
   - the build records those hashes, and the optional `endpoint` sends each choice to the site's own log;
   - an Ads site with no endpoint gets a warning.
5. **The statistics exception** is opt-in per category. The audit warns on third-party origins in it. GA4 stays consent-required by default, and Google Ads is never exempt.
6. **Consent Mode:**
   - an inline `default` (denied, `wait_for_update`) goes before anything Google loads;
   - `update` runs on load from the stored choice, and on every change;
   - the categories map to all four v2 types;
   - basic mode is the default, gating the GTM snippet; advanced is opt-in, with a warning.
7. **No certified CMP** is needed for Ads conversion tracking or GA4. The build refuses, or warns on, AdSense or Ad Manager tags.
8. **August 2026:** sites using Google ads tags need the "prominent link". The privacy-page guidance includes it.
9. **Activation:**
   - clone each gated script with `async=false`, in document order, at most once per page;
   - on withdrawal, delete the declared first-party cookies and reload;
   - a `document.write` in a gated script is a build error.
10. **Iframes:** a click-to-load placeholder per service, with "load once" or "always allow"; the second writes into the same consent cookie.
11. **Events:** `has()` and change events, which also fire on a page load when a choice is already stored.
12. **Accessibility:** a non-fixed `role="region"` banner first in `<body>`; focus moves to a confirmation after a choice; a settings link on every page.

## Sources (all loaded 2026-11-02)

1. https://www.legislation.gov.uk/uksi/2003/2426/schedule/A1
2. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/
3. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-the-exceptions/
4. Secondary: https://www.zwillgen.com/eu-uk/ico-cookie-crackdown-2-icos-new-storage-access-technologies-guidance/ and https://www.cookieyes.com/blog/uk-cookie-guidance-ico-pecr/ (search snippets only)
5. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-manage-consent-in-practice/
6. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/how-do-we-comply-with-the-pecr-rules/
7. https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-the-use-of-storage-and-access-technologies/what-are-storage-and-access-technologies/
8. https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2025/12/ico-action-secures-increased-cookie-compliance/
9. https://www.edpb.europa.eu/our-work-tools/our-documents/other/report-work-undertaken-cookie-banner-taskforce_en
10. https://edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf (loaded; text not extracted)
11. Secondary: https://hunton.com/privacy-and-information-security-law/edpb-adopts-guidelines-on-scope-of-eprivacy-directive
12. https://cnil.fr/fr/cnil-direct/question/cookies-si-jai-refuse-ses-cookies-un-site-web-peut-il-me-redemander-de-les
13. https://www.cnil.fr/fr/cookies-et-autres-traceurs/regles/cookies/que-dit-la-loi
14. https://www.google.com/about/company/user-consent-policy/
15. https://www.google.com/intl/en_uk/about/company/user-consent-policy-help/ (re-checked by the main session)
16. https://support.google.com/adsense/answer/13554116 (search snippet only)
17. https://developers.google.com/tag-platform/security/guides/consent
18. https://support.google.com/google-ads/answer/10000067
19. Secondary, search snippets only: https://anelitics.com/blog/google-consent-mode-v2-gdpr/ and https://privacycomply.io/google-consent-mode-v2.html
20. https://cookieconsent.orestbida.com/advanced/manage-scripts.html
21. https://cookieconsent.orestbida.com/reference/configuration-reference.html
22. https://cookieconsent.orestbida.com/reference/api-reference.html and https://cookieconsent.orestbida.com/advanced/callbacks-events.html
23. https://cookieconsent.orestbida.com/advanced/google-consent-mode.html and https://github.com/orestbida/cookieconsent
24. https://github.com/orestbida/iframemanager
25. https://klaro.org/docs/getting-started
26. https://github.com/klaro-org/klaro-js
27. https://raw.githubusercontent.com/klaro-org/klaro-js/master/dist/config.js
28. https://klaro.org/docs/tutorials/google_tag_manager
29. https://github.com/silktide/consent-manager
30. https://html.spec.whatwg.org/multipage/scripting.html
31. https://developer.mozilla.org/en-US/docs/Web/API/Document/write
32. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script
33. https://design-system.service.gov.uk/components/cookie-banner/
34. https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html

## Not found

- **Advanced mode:** any regulator ruling on Consent Mode's advanced-mode pings.
- **Enforcement:** any ICO cookie fine in 2026.
- **The EDPB guidelines:** their Art 5(3) conclusions, quoted.
- **The libraries' bug trackers:** evidence on async scripts or `document.write`. The pitfalls above come from the HTML specification and MDN.
