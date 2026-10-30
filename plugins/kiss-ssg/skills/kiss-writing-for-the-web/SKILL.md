---
name: kiss-writing-for-the-web
description: Write, review or rewrite the words on a kiss-ssg site — page copy, headings, link and button text, form labels, hints and error messages, empty states, the 404 page, product and service descriptions, titles and meta descriptions, and notification or email text — to evidence-based web-writing practice (NN/g, GOV.UK, Baymard, WCAG, Google Search Central). Use when asked to "write the copy", "improve the wording", "make this page clearer", "is this copy any good", "rewrite this page", "write the error messages", "what should this button say", "make it more scannable", "it sounds like AI wrote it", or when copy in a model, view or Markdown page needs writing or checking. kiss-site-new, kiss-page-add and kiss-site-import call it to write a site's words, and kiss-site-review calls it to review them; for a whole launch review, use kiss-site-review. Not for chat replies, code documentation or the site's README.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

# Writing for the web

Web text is part of the interface. People arrive with a task, scan for words that match it, and read properly only once the page proves it is relevant. Write so that a reader can tell, without reading the surrounding prose:

- **where they are,**
- **what matters,**
- **what they can do,**
- **what happens next.**

That four-part test is the core of this skill. Everything below supports it. The evidence behind each rule is in [references/sources.md](references/sources.md).

## Never invent a fact

This rule comes before every other, in build mode and in review mode. **Never invent a fact about the business**: a figure, a price, a date, a testimonial, a client's name or logo, an award, an accreditation, a phone number, an address, an opening time, an eligibility rule. Where the owner has not given it:

- leave that section out, or put a clearly marked placeholder in its place (`[Price to be confirmed]`, `[Item name]`);
- **keep every placeholder visible on the page**, so a launch with one still in it is obvious to whoever looks;
- list every placeholder for the owner when you hand the work over.

A menu, a price list or a team with no items given gets empty, marked slots, never example items: a believable loaf at a believable price is an invented fact the day the site goes live with it. A section whose items become their own pages (news, a blog) gets no placeholder item at all; `kiss-site-new` says why, and how it builds empty instead.

A design skill or a template that asks for "realistic" or "organic" sample data, or tells you to "come up with copy and placeholder content", is the trap. On a real business's site an invented number is a false claim, and it looks finished enough that nobody checks it. A business name read off the domain is a guess: use it, and say in the hand-over that it needs confirming. A sum the owner did not state (a total of two yearly fees, a weekday worked out from a date) is a new fact too: leave it out or mark it.

## Before you write

1. **Find the reader's task.** What question does the reader bring? What must they do after reading? If you can't say this in one sentence, ask, or state your assumption.
2. **Check for a house style.** A style guide, a `BRAND.md`, a writing rule in `CLAUDE.md` or `AGENTS.md`, the site's `AIKB/site.md`, or a terminology list overrides this skill where they conflict. If the owner gives a sample of their voice, match its sentence length, word choice and tone. Use the site's spelling (UK English when there is no signal).
3. **Identify the content type,** then read its section of [references/content-types.md](references/content-types.md): an editorial or information page, a product or service page, a dashboard, a form, an error or empty state, a notification or email.
4. **Decide what the reader must know now,** with the decision flow below, before you think about length.

## Decision flow: what goes on the page

Ask "must the reader know this now?" before "how short can this be?".

1. Needed to act correctly or safely, legally required, or essential to a group of readers (an accessibility route, a safety warning, an eligibility exception) → keep it visible and persistent, never only in a tooltip or a placeholder, however few readers need it.
2. Not needed now, but some readers will want it → progressive disclosure: a clearly labelled `<details>`, a link, or help beside the field.
3. No reader need you can name → remove it. If you can't tell, ask rather than cut.
4. It names navigation → a descriptive destination ("Prices and call-out times"), not "Learn more".
5. It names an action → a short, verb-led command that says what happens ("Book a visit", "Continue to payment").
6. It asks for input → a visible label, plus format help only where people need it. If changing the form or a default would prevent an error, prefer that to writing the error.
7. It is a state → empty: say why, give the next step. Success: confirm the outcome briefly. Failure: say what happened and how to recover.

## Core principles

**Clarity before brevity.** Concision lowers effort, but a word limit must never cost meaning. Length follows the reader's need. There is no ideal page length, for readers or for Google.

**Front-load.** Put the answer, the conclusion or the deciding fact first, in the page, each paragraph, each heading, each link and each sentence. The first 15–20 words of a page should tell the reader they are in the right place. Put the distinguishing word first in a label or link.

**Make it scannable.** One idea per paragraph, usually 2–5 sentences. A heading for each distinct reader question, written as what the section answers ("What you need", "After you book"), never "More details" or "Important information". Lists for real lists, kept as lists.

**Plain, factual language.** Familiar words, active voice, short sentences. Replace adjectives with facts the reader can check ("Battery lasts up to 18 hours of video playback", not "outstanding all-day battery life"). Cut marketese and generated-sounding filler ("world-class", "seamless", "Let's dive in", "It's not just X, it's Y"); [references/ai-and-marketing-tells.md](references/ai-and-marketing-tells.md) lists what to look for. Keep a necessary technical, medical or legal term and explain it; never change one only to lower a reading score.

**Accessible words.** A link makes sense out of context ("Download the price list (PDF)", never "Click here"). An error is said in text, not colour alone. A control has a name a screen reader can say.

**Search follows the reader.** Use the words people search with, naturally, in the title, the main heading, the link text and the alt text. One main purpose per page. No keyword stuffing, no padding to a word count.

**One term for one thing,** across the whole site.

## Number guide, and how strong each number is

Numbers are review triggers, not laws. Say which tier a number belongs to when you cite it.

| Item                            | Guide                                     | Strength                                    |
| ------------------------------- | ----------------------------------------- | ------------------------------------------- |
| Reading level, general audience | US grade 6–8                              | Research-backed (NN/g)                      |
| Reading level, expert audience  | up to grade 10–12                         | Research-backed (NN/g)                      |
| Sentence length                 | review anything over 25 words             | Organisational standard (GOV.UK)            |
| Paragraph                       | no more than about 5 sentences            | Organisational standard (GOV.UK)            |
| Button or command label         | 2–4 words, verb first                     | Research-backed (NN/g)                      |
| Link text                       | as long as it needs to stand alone        | Research-backed (NN/g)                      |
| Error message                   | usually one sentence: the problem and fix | Operating guardrail                         |
| Tooltip                         | 1–2 short sentences, never essential      | NN/g-backed brevity; the length a guardrail |
| Push notification               | about 50–240 characters visible           | Research-backed (NN/g)                      |
| Page length                     | none                                      | Google and Content Design London            |

## Microcopy essentials

- **Buttons say what happens:** "Send message", not "Submit"; "Delete post", not "OK".
- **Errors say the problem and the fix, at the field:** "Enter a date after 12 October 2026", not "Invalid input". Keep what the visitor typed.
- **Confirmations are brief:** "Message sent", not "Your message has been sent successfully".
- **Empty states explain and offer a route:** "No posts tagged "events" yet. See all posts." A count is singular at one ("1 post").
- **Placeholders never carry instructions.** A placeholder is an example of the answer, never the label.
- **The 404 page helps someone who is lost:** it says the page is not here, and offers the way home and the main sections.

More pairs are in [references/microcopy-patterns.md](references/microcopy-patterns.md). **The out-of-context test:** hide the body copy and read each button, link, heading, label and error alone. If one becomes ambiguous, rewrite it.

## Where the words live in a kiss site

Read `node_modules/kiss-ssg/llms.txt` for the shape of a site. Then:

- **Page copy** is in the page's view (`src/pages/`), in a Markdown page, or in its model (a `.json` file in `src/models/`, or an object passed to `.page()`). Find where the site keeps a page's words before you write, and write them there. Content that repeats (a list of services, a team, a price list) is data: one model and one partial, never copies (`node_modules/kiss-ssg/llms.txt` § Building a site well; `node_modules/kiss-ssg/GUIDE.md` § .page()).
- **Text on every page** (navigation labels, the footer, the skip link) is in a partial or the layout (`src/partials/`, `src/layouts/`). One edit there changes every page.
- **A fact that appears twice** (a phone number in the markup and in the JSON-LD) lives once, in the `config/` seam that `llms.txt` § The build script describes. Change it there, never in one copy.
- **`title` and `description` are page options** set on `.page()`, not model fields. With no `title`, a page gets its slug, title-cased: a home page ships as `<title>Index</title>` and nothing catches it. Write a real one for every page (`node_modules/kiss-ssg/GUIDE.md` § Converting an existing page).
- **A link's words are yours; its address is kiss's.** Write the link text, and let `{{link "id"}}` write the `href`.
- **Keep the machinery intact.** When you rewrite a model, a view or a Markdown page, keep every Handlebars expression (`{{title}}`, `{{link "about"}}`, `{{#each}}` blocks), every model key, every `id` and every `name` exactly as they are. Change only the words a visitor reads.
- **Agents read the words too.** With `.llms()` in the build, each page gets a Markdown copy of its `<main>` beside the HTML, and `llms.txt` links it. Demo copy and placeholders land there as well.

## Build mode: writing a site's words

`kiss-site-new`, `kiss-page-add` and `kiss-site-import` call this mode. Run it whenever you write or change the words on a page.

1. State the reader's task and audience in one line.
2. Read the content type's section of [references/content-types.md](references/content-types.md).
3. Draft the words where the site keeps them (§ Where the words live), front-loaded and chunked, with the patterns above. Give every page a real `title` and `description`.
4. Put a visible placeholder wherever a fact is missing (§ Never invent a fact).
5. Check the draft against the review checklist below, including the AI and marketing tells, and fix what fails.
6. Hand over with the list of placeholders the owner must fill.

**When you convert an existing page** (`kiss-site-import`), lift its words into models **as they are**: keep every fact, invent none, and do not improve the wording unless the owner asks. A conversion that also rewrites cannot be checked against its original.

## Review mode: checking a site's words

`kiss-site-review` calls this mode; it also runs on its own ("check the copy on this site"). Report to the [review protocol](../kiss-site-review/review-protocol.md): every finding before anything is edited, with its priority and its evidence (a quoted sentence is the measurement for copy), one row per cause. A choice the site records (a house style, a brand voice) is not a finding.

Read the build's `audit` findings first (`npx kiss-ssg check <site-script> --summary`): `title-missing`, `title-duplicate`, `description-missing`, `description-duplicate` and `img-alt-missing` are about words. The fix in the layout is `kiss-site-review`'s; what the title, description or alt text should say is this skill's.

Rate copy findings on the protocol's scale like this:

- **P0:** the copy promises something the page cannot do, so the visitor is stuck: a form that sends nothing.
- **P1:** a legal duty or a false claim: a form that collects personal details with no line about them, or an invented fact.
- **P2:** copy that misleads or reads as unfinished: a fact the site states two ways, a step with no way to take it ("book ahead" with no way to book), placeholder and demo copy, vague headings and links, one thing called by several names.
- **P3:** polish: wording, rhythm, Title Case.

Then read every page template's built page, and one page's Markdown copy if the build calls `.llms()` (without it there are none), for:

- **Placeholder, demo and scaffold copy**: lorem ipsum, "Example", "TODO", "fictional", a "how this works" panel, a build badge, a sentence addressed to the developer rather than the visitor. It is the plainest sign of a site that is not finished, and it lands in the Markdown copies too. A site that says it is an example or a demo has recorded that as a decision: ask before calling it a finding.
- **Invented facts**: a figure, price, testimonial or claim the owner never gave. Ask where each one came from.
- **A form that collects personal details** (a name, a phone number, an email, a photo) **says what happens to them**: who receives the details and that the visitor can ask for them to be deleted, in the site's own voice. Draft the line and mark every claim for the owner to confirm; do not publish a promise they have not made.
- **The 404 page and empty states**: do they help, in words (above)?
- **The review checklist** below, page by page.

**When you rewrite,** check the result against the original before you hand it back. Every fact, figure, date, price and condition in the original must still be there, unless you cut it on purpose and say so. Nothing new may appear that the original or the owner didn't give you. A fact that is plainly out of date (dates in the past, last year's prices) must not stay live: replace it with a visible placeholder and say so. The full check is at the end of [references/ai-and-marketing-tells.md](references/ai-and-marketing-tells.md).

## Review checklist

- [ ] Can the reader tell where they are, what matters, what to do and what happens next?
- [ ] Is the answer or the most important fact first?
- [ ] Do headings describe what each section answers?
- [ ] Are sentences mostly under 25 words, and paragraphs 5 sentences or fewer?
- [ ] Is the language plain and factual, with no unsupported adjectives or marketese?
- [ ] Is it free of AI tells: stock words ("seamless", "robust", "delve"), run-ups ("Here's what you need to know"), "not X but Y" contrasts, decorative bold or Title Case headings?
- [ ] Is the reading level right for the audience?
- [ ] Do buttons name the action, and links the destination, out of context?
- [ ] Do errors name the item, the problem and the fix? Do empty states say why and give a next step?
- [ ] Is anything essential hidden in a tooltip or a placeholder?
- [ ] Is one term used for one thing throughout?
- [ ] Does every page have its own `title` and `description`?
- [ ] Is every fact one the owner gave, and is every gap a visible placeholder?
- [ ] After a rewrite: are all the original facts still there, with nothing invented and every Handlebars expression intact?

## Reference files

- [references/content-types.md](references/content-types.md): guidance per content type — editorial pages, product pages, dashboards, forms, errors and empty states, notifications and email, mobile.
- [references/microcopy-patterns.md](references/microcopy-patterns.md): prefer/avoid pairs for common interface text.
- [references/ai-and-marketing-tells.md](references/ai-and-marketing-tells.md): sales language, stock AI words and other generated-sounding patterns, with fixes, and the fact check after a rewrite. Read it when you review or rewrite copy.
- [references/measurement-and-qa.md](references/measurement-and-qa.md): content standards for a team, automated checks and how to measure success.
- [references/sources.md](references/sources.md): the evidence behind the rules, and the licence of the adapted material.
