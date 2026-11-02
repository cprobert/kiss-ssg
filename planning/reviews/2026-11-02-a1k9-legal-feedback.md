# Feedback for kiss: legal and privacy knowledge

From a session on a kiss 2.9.0 site (`probert-family/a1k9training`, a sole trader's dog-training site in Wales), on 2 November 2026. The evidence is in that repository:

- `planning/reviews/2026-11-02-launch-review.md`: the `kiss-site-review` run.
- `planning/reviews/2026-11-02-privacy-compliance-check.md`: a separate legal compliance check.
- `src/pages/privacy.hbs`: the privacy page that came out of the work.
- `planning/handouts/gaynor-privacy-checklist.html`: a one-page checklist of habits for the owner.

## What happened

**There is no legal skill in kiss.** The legal knowledge in 2.9.0 is a few scattered lines:

- `kiss-writing-for-the-web/SKILL.md:131,139`: "a form that collects personal details says what happens to them".
- `kiss-site-review/review-protocol.md`: P1 includes "a legal duty".
- `kiss-information-architecture/SKILL.md:77`: privacy belongs in the footer.
- `kiss-seo/SKILL.md:33`: no fake or filtered review stars.

**`kiss-site-review` found one legal issue:** the enquiry form had no line about personal details, rated P1. That finding was right, and it started the work.

**A separate compliance check then found 17 more.** Nine were on the site; the rest were owner habits that the site's promises depend on:

| What it found                                                                                                                | Who has to fix it      | Could kiss have seen it?                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| The notice never said whether giving details is optional (Art. 13(2)(e))                                                     | Page wording           | Yes: an Art. 13 checklist                                                                                      |
| Transfer safeguards weren't named or linked (Art. 13(1)(f))                                                                  | Page wording           | Yes                                                                                                            |
| The legitimate interest behind marketing wasn't named                                                                        | Page wording           | Yes                                                                                                            |
| YouTube's privacy-enhanced embed wrote to `localStorage` on load, before consent (PECR reg. 6)                               | Site                   | **Only by measuring in a browser.** The templates looked clean, and the page claimed "no cookie banner needed" |
| No email or geographic address on the site (E-Commerce Regs 2002, reg. 6; a contact form alone is not enough, CJEU C-298/07) | Site or owner decision | Yes                                                                                                            |
| Marketing "soft opt-in" (PECR reg. 22) needs a refusal at collection: an unticked opt-out box on the form                    | Site and owner habit   | Yes, once the owner said "we may send offers"                                                                  |
| No written contract with the processor **who is the site's own developer and administrator** (Art. 28)                       | Owner                  | Yes. This is true of most kiss sites                                                                           |
| ICO fee, breach plan, two-step sign-in, retention habits, photo-consent records, WhatsApp groups exposing members' numbers   | Owner                  | Only by asking. They belong in a handout, not on a page                                                        |
| Deposits and cancellation rights (Consumer Contracts Regs 2013)                                                              | Adviser                | Flag it, don't draft it                                                                                        |

## The recommendation: a `kiss-privacy` domain skill (or `kiss-legal`)

Make it the seventh domain skill:

- `kiss-site-review` runs its review mode.
- `kiss-site-new` uses it when a site first gets a form, an embed or analytics.
- `kiss-page-add` uses it whenever a page adds a form field, an embed or a third-party script.

It should **ask the jurisdiction first** and keep its law in per-jurisdiction reference files. Start with `uk.md`, then `eu.md`; US states can come later. The skill body is method; the law sits in the references, each fact dated and sourced.

### 1. Take an inventory before drafting anything

List every place personal data enters or leaves. Most of it can be read from the build:

- **Forms:** every field name and the form backend (`data-netlify`, `action` URLs).
- **Contact links:** `mailto:` and `tel:`.
- **Third-party origins:** iframes, scripts, stylesheets and fonts. Google Fonts from Google's CDN sends visitors' IP addresses to Google.
- **Analytics tags.**
- **Hosting logs:** the host as a processor.
- **The rest, asked of the owner:** email provider, who else can see enquiries, payments, messaging groups, paper records, photos, and any intent to market.

**Measure storage in a real browser.** Check cookies, `localStorage` and IndexedDB on every page **before any interaction**, then after a click. Never infer storage from the templates. The site's own measurement found `youtube-nocookie.com` writing `yt-icons-last-purged` and `ytidb::LAST_RESULT_ENTRY_KEY` as soon as the embed loaded.

### 2. A privacy notice checklist built from the law, not from a template

The owner brought another organisation's policy to adapt. That is the normal case, and the source policy was full of things that weren't true here (Google Analytics, location data, account settings, a consent centre). The method has to be: **check every statement against the inventory, and delete anything that isn't true.**

For the UK, the Article 13 checklist covers:

- the controller's identity and contact details;
- purposes, with a lawful basis for each;
- legitimate interests, named;
- recipients;
- transfers, the safeguards, and where to get a copy;
- retention;
- rights, including withdrawing consent;
- the right to complain to the ICO;
- **whether giving details is required, and what happens if not** (the item the draft here missed);
- automated decision-making.

**Verify vendor claims at the source, and record the URL and the date.** Here, Netlify's DPA (it applies to self-serve accounts, with the UK Extension to the Data Privacy Framework and the IDTA as fallback) and Google's DPF certification were both checked before the page named the "UK–US data bridge".

### 3. Rules of method that would have saved rework

- **Never write a legal fact the owner hasn't given.** Wrap each one in `<mark>`, as "to confirm", and don't merge while a mark remains. The draft here had a claim that "nobody else sees enquiries" taken out before anyone read it. The developer, as the site's administrator, could.
- **Keep the line on the form as true as the page.** "Only to reply to you" became false the moment marketing was reserved.
- **Know how the owner's tools really behave.** Archiving a WhatsApp group hides the chat on the owner's phone; it doesn't remove members. The notice must claim only what actually happens.
- **Sort each finding into one of four lanes:** page wording (the agent fixes it), owner habit (goes in the handout), owner decision (recorded as an accepted risk), adviser (flagged, not drafted).
- **Record accepted risks** the way the review protocol records design decisions, so the next review reads them as decisions, not oversights. Two were accepted here: no published email address, and no click-to-load embeds.
- **The promises need habits behind them.** Produce a one-page checklist for the owner as part of the skill's output: the ICO fee, the opt-out list, photo consent, deletion reminders, what to do in a breach.
- **Some regulators block automated fetches** (ico.org.uk returns 403). Never link a deep URL you haven't loaded. Give a phone number, or tell the reader what to search for.
- **Not legal advice.** Say so once, and route consumer-contract and liability questions to an adviser.

### 4. Changes to existing kiss files

- **`review-protocol.md`:** give P1 legal examples. A privacy notice missing an Art. 13 item; storage before consent; a pre-ticked marketing box; no business address. Add the "accepted risk" record format.
- **`kiss-front-end`:** a click-to-load facade pattern for video and maps, as the fix for storage before consent. Note in it that the privacy-enhanced YouTube player is not storage-free.
- **`kiss-writing-for-the-web:139`:** keep the form line and point to the new skill for the notice itself.
- **`kiss-seo:33`:** move the fake-reviews rule (DMCC Act 2024) into the new skill's UK reference, and leave a pointer behind.
- **`kiss-site-new`:** a site with a form ships with a privacy page, a footer link and the form line from day one, with every claim marked to confirm.

### 5. Ideas for the engine (optional; kiss's audit is the natural home)

- **`report().thirdParty`:** the distinct third-party origins per page (iframes, scripts, styles, fonts). A fact for the privacy skill, not a finding.
- **Audit `privacy-link-missing`:** a page with a `<form>` that collects an email or phone number, but no link to a page the site marks as its privacy page.
- **Audit `placeholder-left`:** a `<mark>` or "to confirm" in the built HTML. It is the same family as `debug-dump`, and is what stops an unfinished legal page shipping.
- **Audit `checkbox-prechecked`:** a pre-ticked checkbox whose label mentions offers, news, marketing or newsletters.

## Sources for the UK reference file

Date-stamp each one and re-check them in each release:

- **UK GDPR:** Arts 6, 7, 13, 14, 28, 30, 32, 33.
- **Data Protection Act 2018.**
- **Data (Use and Access) Act 2025:** the complaints duty and the cookie exemptions. **Verify the commencement dates before writing them as current.**
- **PECR:** regs 6 and 22, with the ICO's soft opt-in guidance.
- **Data Protection (Charges and Information) Regulations 2018:** the ICO fee.
- **Electronic Commerce (EC Directive) Regulations 2002, reg. 6**, and CJEU C-298/07.
- **Consumer Contracts Regulations 2013** (flag only).
- **DMCC Act 2024:** fake reviews.
- **Retention benchmarks:** HMRC record-keeping (5 years after the 31 January deadline); the Limitation Act 1980 (6 years for contract claims, 3 for personal injury, which runs from 18 for a child).
