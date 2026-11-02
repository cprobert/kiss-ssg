---
name: kiss-legal-and-privacy
description: Build and review the legal side of a kiss-ssg site — privacy notice, storage before consent, the form's line, opt-outs, business details, reviews, image rights — from dated UK and EU law. Use for "privacy", "cookies", "consent", "GDPR", "privacy notice", "terms", "company details", "legal", "copyright", "licence". Not legal advice; never drafts terms.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Legal and privacy

A site's legal pages are claims about what the business does with people's details. They are only as true as the inventory behind them and the owner's habits after launch. This skill is method; the law is in one reference per jurisdiction, each fact dated and sourced.

**This is not legal advice.** It finds what a small site usually gets wrong and drafts what the law lists. Consumer contracts (deposits, cancellation, refunds), terms and conditions, liability, and anything the owner is worried about go to an adviser: flag them, never draft them.

## The method

1. **Ask the jurisdiction first**, and where the owner is based, unless the site's `AIKB/` or its pages already say. Open the matching reference: [references/uk.md](references/uk.md) or [references/eu.md](references/eu.md). For anywhere else there is no reference yet: say so, flag it, and advise a local adviser.

2. **Take an inventory before drafting anything**: every place personal data enters or leaves the site.
   - **From the build.** `npx kiss-ssg check <site-script>` prints the report. Its `thirdParty` key lists each page's third-party origins and what loads them (`script`, `iframe`, `img`, `form-action`, `stylesheet`, `preload`, `preconnect`). Its audit has three checks of this skill's: `privacy-link-missing` (a form that asks for an email or phone number and does not link the privacy page), `checkbox-prechecked` (a ticked box whose label offers marketing) and `placeholder-left` (a `<mark>` or `[to confirm` shipping). Then read the templates for forms (each field, and the backend: `data-netlify`, an `action` URL), `mailto:` and `tel:` links, and analytics. The host is a processor too: it keeps logs.
   - **An empty `thirdParty` proves nothing.** It reads static markup only. An iframe a script injects (a click-to-load facade, a chat widget) and a stylesheet's CSS `@import` are invisible to it. Read the scripts and the CSS as well.
   - **Asked of the owner:** the email provider; who else sees enquiries, **including the site's own developer and administrator**; payments; messaging groups; paper records; photos of people; any intent to send marketing; and **whether any field asks about health or another special category** (the reference lists them): if one does, it goes to an adviser before the notice is written.

3. **Measure storage in a real browser, never from the templates.** Look at cookies, `localStorage` and IndexedDB on every page template before any interaction, and again after one click. How to get the site in front of a browser is the [browser pass](../kiss-site-review/browser-pass.md); without a browser, say the storage check did not run. On a1k9training (2026-11-02), a `youtube-nocookie.com` embed wrote `yt-icons-last-purged` and `ytidb::LAST_RESULT_ENTRY_KEY` to `localStorage` as soon as it loaded, on a page that said no cookie banner was needed. A "privacy-enhanced" embed is not storage-free. The fix is a click-to-load facade (`kiss-front-end`).

4. **Write the notice from the law's checklist, checked against the inventory.** The reference lists what a notice must contain. Every item gets a sentence, or a reason it does not apply. **Delete every statement the inventory does not support.** Adapting another organisation's policy is the normal case, and its claims are the hazard: analytics the site does not run, location data, accounts, a consent centre. Say only what actually happens, including in the owner's tools (archiving a WhatsApp group does not remove its members).

5. **Mark every fact the owner has not given** as `<mark>[to confirm: …]</mark>`, in the page, visible. Nothing ships while one remains: the audit's `placeholder-left` reports it. Never write a legal fact the owner did not give, however likely it looks ("nobody else sees enquiries" was false: the site's administrator could).

6. **Keep the form's line as true as the page.** The line beside a form says who receives the details, what they are used for, and that the visitor can ask for them to be deleted, and links the privacy page. When the page changes, the line changes in the same edit: "only to reply to you" became false the day the owner reserved the right to send offers. A marketing opt-out on the form is an **unticked** box.

7. **Sort every finding into one of four lanes:**
   - **page wording:** you fix it;
   - **owner habit:** it goes in the handout (step 9);
   - **owner decision:** the owner accepts the risk, recorded (step 8);
   - **adviser:** flagged, never drafted.

8. **Record each accepted risk** in the format the [review protocol](../kiss-site-review/review-protocol.md) gives, so the next review reads it as a decision, not an oversight. Where the risk is a legal duty left unmet, the record names the duty plainly; whether a workaround meets it is an adviser's question, not yours. On a1k9training two were accepted: no published email address, and no click-to-load embeds.

9. **Produce the owner handout**, one page, from [references/owner-handout.md](references/owner-handout.md). The site's promises depend on habits nobody can see from the build.

10. **Verify a vendor's claim at its source** (a data processing agreement, a transfer certification), and record the URL and the date beside the claim. **Never link a deep URL you have not loaded.** A regulator's site may refuse an automated fetch (ico.org.uk returned 403 on 2026-11-02 in one session and loaded in another); where it does, link the home page or say what to search for.

## Build mode

`kiss-site-new` and `kiss-page-add` call this when a site gets a form, an embed, analytics or any third-party script. A site with a form ships with, from day one:

- a privacy page, written by steps 2–6 with every unconfirmed fact marked, at the id `privacy` (or named in `config.audit.privacyPage`), linked from the footer (`kiss-information-architecture`) and from every form that asks for an email or phone number;
- the line beside each form (step 6), with `{{link "privacy"}}`;
- no third-party embed that stores anything before a click: a facade instead;
- the owner handout and the list of `[to confirm` marks, at the hand-over.

## Review mode

Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority, its measurement and its lane, one row per cause. A recorded accepted risk is not a finding. Read the audit and `thirdParty` first, then the browser (step 3), then the notice against the reference's checklist item by item: report each item as present (quote it), missing, untrue against the inventory, or not applicable. Then the who-we-are details, any reviews or ratings, and the rights in every image, font and text the site did not make (the reference says what each needs).

These are **P1** (a legal duty): a notice missing a checklist item, storage before consent, a consent banner where refusing is harder than accepting, a pre-ticked marketing box, no geographic address or email address for the business, a form with no line, a special-category question with no adviser's answer, a price that leaves out a compulsory fee, and a `[to confirm` mark on a page about to ship.
