# Google's 2026 position on content quality (small sites, AI-drafted pages)

Research date: 2026-11-01. Labels: **[DOC]** = Google Search Central documentation or Google blog (policy); **[STAFF]** = statement by a Google employee, often reported second-hand; **[OBS]** = industry observation or commentary, not confirmed by Google.

## 1. Helpful content: folding into core ranking (March 2024) and what the "Creating helpful content" page says now

### Takeaway

There is no separate "helpful content system" any more. From the March 2024 core update, its work moved into the core ranking systems as many signals. The people-first guidance page is still the main statement of what Google wants. It was last updated 2026-10-05 and now has an explicit Who/How/Why section that covers AI disclosure and fabricated authors.

### Cited Findings

- [DOC] The March 2024 core update and the new spam policies were announced on 2024-03-05. Google said it had "enhanced our core ranking systems to show more helpful results" using multiple signals rather than one system, aiming at "showing less content that feels like it was made to attract clicks." — [Google Search Central blog, Mar 2024](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)
- [DOC] The March 2024 core update ran from 2024-03-05 to 2024-04-19. — [Google Search Status Dashboard](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)
- [STAFF] Elizabeth Tucker (Google, Director of Product for Search) forecast a 40% reduction in "low-quality, unoriginal content" in results. After rollout Google reported 45%, which Tucker attributed to "real measurements after rollout." — [Search Engine Land, SMX Advanced takeaways](https://searchengineland.com/seo-takeaways-google-elizabeth-tucker-smx-advanced-443070); [Search Engine Land, rollout complete](https://searchengineland.com/google-march-2024-core-update-rollout-is-now-complete-438713)
- [OBS] Industry coverage describes the standalone Helpful Content system as "folded into" core ranking. — [Search Engine Land](https://searchengineland.com/google-march-2024-core-update-rollout-is-now-complete-438713). Note: the Search Central blog post's own wording is "enhanced our core ranking systems" and multiple signals. The phrase "folded into core" comes from Google's announcement elsewhere and from press coverage, not from that post's text as retrieved.
- [DOC] "Creating helpful, reliable, people-first content" was last updated 2026-10-05 UTC. — [Google Search Central](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] Self-assessment, **content and quality**: does the content give original information, reporting, research or analysis; does it go beyond the obvious; is the main heading descriptive rather than sensational; is it worth bookmarking or recommending; does it look carefully produced; is it mass-produced across many creators or sites. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] Self-assessment, **expertise**: clear sourcing, evidence of expertise, background about the author or the site, recognition as an authority, and no easily verified factual errors. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] **People-first** signs: an audience that would value the content if it came to the site directly; first-hand expertise; a clear site purpose; readers leave having learned enough to reach their goal. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] **Search-engine-first warning signs**: content made mainly to attract search visits; producing on many topics in the hope some rank; "extensive automation"; mainly summarising others' work; changing page dates without substantive updates; writing to a target word count. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] Raters assess main content on effort, originality, talent or skill, and accuracy. "Attribution or giving credit to other sources doesn't replace the need for original effort." — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] **Who**: "Is it self-evident to your visitors who authored your content?" Use bylines where readers expect them. "We strongly encourage adding accurate authorship information." The page warns against fabricated creator identities (AI-generated headshots, invented names, false credentials) and treats them as deception and a sign of a low-quality page. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] **How**: disclose automation or AI involvement where a reader might reasonably wonder how the content was made, and say what automation did and why it helped. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] **Why**: "perhaps the most important question." The "why" should be "that you're creating content primarily to help people." Content made mainly to attract search visits "isn't aligned with what our systems seek to reward." Using automation to manipulate rankings breaks the scaled content policy. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] SEO is acceptable when it is applied to people-first content. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

### Inferences

- For an AI-drafted small-business site, the Who/How/Why section is the operative test. Use a real, named owner or trainer with accurate credentials. Never use an invented "author persona" or an AI headshot. Optionally add a short note on how the content was produced (for example, "drafted with an AI assistant, reviewed and edited by [name]").
- "Changing dates without substantive updates" means an agent should not bump `dateModified` or the visible date for cosmetic regenerations.

### Gaps

- I did not retrieve the exact Google Keyword blog sentence announcing that helpful content became part of core ranking. Industry reports attribute it to Google's 2024-03-05 announcement.

## 2. E-E-A-T and the Search Quality Rater Guidelines (2024–2025 changes)

### Takeaway

E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness, with trust the most important) is a rater framework, not a ranking factor. Rater scores do not change rankings directly. In January 2025 the rater guidelines added a definition of generative AI and sections on scaled content abuse and filler. Pages whose main content is almost entirely AI-generated or auto-generated with little added value are to be rated Lowest. A September 2025 revision followed.

### Cited Findings

- [DOC] "Of these aspects, trust is most important." "While E-E-A-T itself isn't a specific ranking factor," a mix of factors that identify strong E-E-A-T is useful. For YMYL topics (health, finance, safety, societal welfare), "our systems give even more weight to content that aligns with strong E-E-A-T." — [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] "Search raters have no control over how pages rank." "Rater data is not used directly in our ranking algorithms." — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] The SEO Starter Guide answers "Is E-E-A-T a ranking factor?" with "No, it's not." (Last updated 2025-12-10.) — [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [DOC] Google's generative AI guidance points to rater guideline sections 4.6.5 and 4.6.6 on scaled and low-value content. It adds that the guidelines "are not a guide to ranking first in Google." — [Using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [OBS, reporting on the document] The January 2025 rater guidelines update added a definition of generative AI and guidance on spam, low-quality content, scaled content abuse and filler content. If "all or nearly all" of the main content is auto- or AI-generated with little or no added value, raters should give Lowest. — [Search Engine Land](https://searchengineland.com/google-quality-raters-content-ai-generated-lowest-quality-454161)
- [OBS, reporting on the document] Low vs Lowest: Low applies when some main content is reused with at least minimal curation; Lowest applies when almost all of it is copied or paraphrased with no effort or added value. The guidelines also say generative AI use alone does not determine the effort or Page Quality rating. — [Search Engine Land](https://searchengineland.com/google-quality-raters-content-ai-generated-454161); [ppc.land](https://ppc.land/google-updates-quality-rater-guidelines-with-ai-content-evaluation-criteria/)
- [OBS] A September 2025 rater guidelines update stated that scaled, low-value content should get Lowest whether humans or AI made it. It also added YMYL clarifications and AI Overview rating examples. — [Semrush](https://www.semrush.com/blog/google-expands-rules-on-low-value-content)

### Inferences

- For a trainer or small business, the practical E-E-A-T work is showing **experience** and **trust**: who runs the business, their real qualifications and track record, how to contact them, and accurate claims. A training site that touches health, safety, finance or legal compliance is closer to YMYL and gets more weight.
- "Filler" is a rater concept for padding that pushes the useful part down the page. AI drafts tend to produce it ("In today's fast-paced world…"), so an agent should cut it.

### Gaps

- I did not retrieve the current rater guidelines PDF or its change log directly, so the exact wording of sections 4.6.5, 4.6.6 and the filler section, and the current version date, come from secondary reporting. Check the PDF at https://guidelines.raterhub.com/searchqualityevaluatorguidelines.pdf before quoting.
- I found no information about a 2026 rater guidelines revision.

## 3. Spam policies from March 2024 onward, and Google's statements on AI content

### Takeaway

AI-generated content is allowed when it is accurate and helpful. It becomes spam (scaled content abuse) when many pages are produced mainly to manipulate rankings without adding value, whether a human or an AI made them. Three policies were added on 2024-03-05: scaled content abuse, site reputation abuse (in force 2024-05-05, tightened 2024-11-19) and expired domain abuse. Doorway, hidden-text and keyword-stuffing rules still apply. The spam policies page was last updated 2026-08-28.

### Cited Findings

- [DOC] Announced 2024-03-05: expired domain abuse, scaled content abuse and site reputation abuse. Site reputation abuse "will take effect starting May 5, 2024." "Use of automation, including generative AI, is spam if the primary purpose is manipulating ranking." Scaled content is covered "no matter whether content is produced through automation, human efforts" or both. — [Search Central blog, Mar 2024](https://developers.google.com/search/blog/2024/03/core-update-spam-policies)
- [DOC] **Scaled content abuse**: "many pages are generated for the primary purpose of manipulating search rankings." One example is "Using generative AI tools or other similar tools to generate many pages without adding value for users." Others: scraping feeds, stitching content together without adding value, spreading pages across sites, and pages that make little sense to readers but contain keywords. — [Spam policies, updated 2026-08-28](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] **Site reputation abuse**: third-party content published on a host "mainly because of that host's already-established ranking signals." Not violations: UGC and forums, syndicated news, press release sites, and properly marked affiliate links. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC/OBS] On 2024-11-19 Google clarified that the policy applies "whether or not there is first-party involvement or oversight," closing a white-label and licensing loophole. Enforcement is by manual action. FAQs followed on 2024-12-06. — [Google blog, Nov 2024](https://developers.google.com/search/blog/2024/11/site-reputation-abuse); [Search Engine Land](https://searchengineland.com/google-site-reputation-abuse-policy-now-includes-first-party-involvement-or-oversight-of-content-448432)
- [DOC] **Expired domain abuse**: buying an expired domain and repurposing it "primarily to manipulate search rankings" with low-value content. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] **Doorway abuse**: pages created "to rank for specific, similar search queries." Examples include regional or city pages that funnel users to one destination, and near-duplicate pages. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] **Hidden text**: text in the background colour, behind images, positioned off-screen with CSS, or at zero font size or opacity. Not violations: accordions, tabs, sliders, tooltips and screen-reader-only text. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] **Keyword stuffing**: lists of phone numbers, blocks of city or region names, and unnatural repetition. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] **Scraping** includes "lightly modifying" copied text, for example by swapping synonyms. **Thin affiliation** means affiliate pages that copy merchant text. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] "Using generative AI content" (last updated 2026-10-01) says AI "can be particularly useful when researching a topic, and to add structure to original content." Content must still meet Search Essentials and the spam policies. "Generative models don't retrieve facts, but predict a likely sequence of words." "It is critical to manually factcheck and review all AI-generated content for accuracy." That review covers titles, meta descriptions, structured data and alt text. Google recommends disclosing how content was made where readers would expect it. For ecommerce, AI images need IPTC `DigitalSourceType` `TrainedAlgorithmicMedia`. — [Using generative AI content](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content)
- [DOC] Spam updates on the Status Dashboard: March 2024 (03-05 to 03-19), June 2024 (06-20 to 06-27), December 2024 (12-19 to 12-26), August 2025 (2025-08-26 to 09-21), March 2026 (2026-03-24, about 19.5 hours), June 2026 (06-24 to 06-26), August 2026 (08-18 to 08-20), September 2026 (2026-09-24 to 10-07). — [Google Search Status Dashboard](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)

### Inferences

- The highest-risk pattern for an AI agent on a small site is **one near-identical page per town or service area** ("Plumber in X", "First aid training in Y"). That is both doorway abuse and scaled content abuse. A location page is defensible only if it carries genuinely local, distinct content: real jobs done there, a real venue, local regulation, or real testimonials from there.
- A 5–100 page site cannot "scale" in the sense of thousands of pages. The risk is the _pattern_: templated pages with swapped keywords, paraphrased competitor content, or summaries with no first-hand input.
- Site reputation abuse and expired domain abuse rarely apply to a small owner-run site, except when someone buys an expired domain to "inherit" authority, or hosts paid third-party content.
- Fact-checking duties cover the metadata an agent generates (titles, descriptions, JSON-LD, alt text), not only the body copy.

### Gaps

- I did not re-fetch Google's February 2023 post "Google Search's guidance about AI-generated content" (https://developers.google.com/search/blog/2023/02/google-search-and-ai-content). Its principle, rewarding quality "however it is produced," is consistent with the current docs above but was not re-verified here.

## 4. Core updates 2024–2026 and small sites

### Takeaway

There were eight core updates from 2024 to late 2026: March, August, November and December 2024; March, June and December 2025; and March and May 2026. Google said the August 2024 update aimed to surface more "small or independent sites that are creating useful, original content." For the 2025–2026 updates Google gave only its standard guidance, and the independent analyses of small-site effects are thin and observational.

### Cited Findings

- [DOC] Core update dates (start to end, US/Pacific): March 2024 (03-05 to 04-19); August 2024 (08-15 to 09-03); November 2024 (11-11 to 12-04); December 2024 (12-12 to 12-18); March 2025 (03-13 to 03-26); June 2025 (06-30 to 07-16); December 2025 (2025-12-11 to 12-29); March 2026 (2026-03-27 to 04-08); May 2026 (2026-05-21 to 06-01). Also a February 2026 Discover update (02-05 to 02-26). — [Google Search Status Dashboard](https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history)
- [DOC] The August 2024 core update "takes into account the feedback we've heard from some creators and others over the past few months." Google aimed to connect people with sites "including small or independent sites that are creating useful, original content," called this an area it would keep working on in future updates, and said the update would better recognise improvements sites had made. — [Search Central blog, Aug 2024](https://developers.google.com/search/blog/2024/08/august-2024-core-update)
- [OBS] Google issued no update-specific guidance for May 2026 and described it as a regular update to surface relevant, satisfying content "from all types of sites." Commentators say sites built on repetitive, high-volume publishing were most exposed, and that publishing more thin content after a drop makes things worse. — [Search Engine Journal](https://www.searchenginejournal.com/google-begins-rolling-out-may-2026-core-update/575589/); [whito.co.uk](https://whito.co.uk/news/google-just-finished-another-core-update-most-small-businesses-are-panicking-for-the-wrong-reasons/)
- [OBS] Aleyda Solis's analysis of the May 2026 update is titled "Intent, Market Fit and Source Type Drove the Biggest Visibility Shifts." The page returned HTTP 403, so its findings are not verified here. — [aleydasolis.com](https://www.aleydasolis.com/en/ai-search/google-may-2026-core-update-analysis-intent-market-fit-and-source-type-drove-the-biggest-visibility-shifts)

### Inferences

- Core updates reassess the whole site rather than penalising it. Google's standing advice after a drop is to improve content against the self-assessment questions, not to chase technical fixes. The update cadence (two to four a year) means recovery is assessed at the next update.

### Gaps

- I found **no rigorous independent study of small business or small trainer sites** for the 2025–2026 core updates. The well-known 2023–2024 independent-publisher complaints (such as HouseFresh) and the October 2024 Web Creator Summit were not retrieved in this session.
- I did not retrieve Danny Sullivan (Search Liaison) statements on small sites in 2024–2025, so none are quoted here.

## 5. Practical signals: author and owner information, about and contact pages, first-hand experience, photos, dates, doorways, thin pages, stuffing, hidden text

### Takeaway

Google's documents reward visible, accurate information about who is behind the site and how its content was made, plus original first-hand material. They penalise fabricated identities, date manipulation, doorway town pages, stuffing and hidden text.

### Cited Findings

- [DOC] Accurate authorship and bylines are strongly encouraged. Fabricated identities (AI headshots, invented names, false credentials) are a low-quality signal. — [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] Expertise questions ask for "background about the author or the site," clear sourcing and evidence of expertise, and first-hand expertise as a people-first signal. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] Changing dates without substantive updates is a search-engine-first warning sign. — [same](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] For AI experiences, support text with high-quality images and video, and keep the Business Profile and Merchant Center information up to date. — [Search Central blog, 2025-05-21](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search)
- [DOC] Doorway (city pages), keyword stuffing (blocks of city names) and hidden text (CSS off-screen, zero opacity) are defined above, with accordions and tabs explicitly allowed. — [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies)
- [DOC] A duplicate content "penalty" does not exist ("It's inefficient, but it's not something that will cause a manual action"). Copying others' content is a separate problem. — [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

### Inferences

- Minimum kit for a small AI-drafted site: an About page naming the real owner or trainer with real credentials and photo; a Contact page with a physical or service area, phone and email, consistent with the Google Business Profile; original photos of the person, venue and work, not stock or AI images presented as real; testimonials or case examples only if genuine; and visible dates only where they mean something.
- AI images presented as real photos of the business conflict with the "fabricated identity" warning, and on ecommerce pages they need disclosure metadata.

### Gaps

- Google's docs do not separately require "About" or "Contact" pages. That expectation comes from the rater guidelines' "who is responsible" and "customer service" checks (reported, not retrieved here).

## 6. Search intent and keyword research for small sites, given AI Overviews

### Takeaway

Google says no special optimisation is needed for AI Overviews or AI Mode: no llms.txt-style files, no special schema. The advice is "unique, non-commodity content," a good page experience, and indexability. Because AI features "fan out" queries into subtopics, specific, first-hand answers to concrete questions have the best chance of being cited. Google advises measuring conversions rather than raw clicks.

### Cited Findings

- [DOC] "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." "You don't need to create new machine readable files, AI text files, or markup." No special schema.org markup is needed. A page must be indexed and eligible for a snippet. (Last updated 2025-12-10.) — [AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [DOC] AI Overviews and AI Mode may use "query fan-out," "issuing multiple related searches across subtopics and data sources." — [same](https://developers.google.com/search/docs/appearance/ai-features)
- [DOC] Google's advice (John Mueller, 2025-05-21): focus on "unique, non-commodity content"; good page experience; no blocking of Googlebot, HTTP 200 and indexable content; structured data that matches visible content; rich images and video; current Business Profile. Clicks from AI Overview pages are reported to be "higher quality," so measure conversions, not just click volume. Restrictive snippet controls (`nosnippet`, `max-snippet`) limit appearance in AI features. — [Search Central blog](https://developers.google.com/search/blog/2025/05/succeeding-in-ai-search)
- [DOC] "Think about the words that a user might search for." Include natural variations (the example is "charcuterie" vs "cheese board"), but don't worry about anticipating every variation, because language-matching systems relate pages to queries without exact matches. — [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

### Inferences

- For a small site, the realistic opportunities are local and transactional intent (where the click is the purpose: book, call, enrol), specific long-tail questions the owner can answer from experience (prices, what to expect, prerequisites, accreditation), and branded queries. Generic informational "what is X" queries are the ones most absorbed by AI Overviews.
- Keyword research should establish the _vocabulary customers use_ and the _questions they ask_, and the agent should write to those in natural language, not hit target terms.
- Per Google, an `llms.txt` file is not needed for Google's AI features (other engines may differ; not covered here).

### Gaps

- I found no Google-published data on zero-click rates. Industry click-through studies on AI Overviews were not retrieved in this session.

## 7. Word count, keyword density, exact-match keywords in titles and headings

### Takeaway

Google says plainly that word count and content length do not matter for ranking. Keyword density is not something to focus on, and stuffing is spam. Keywords in the domain or URL "have hardly any effect." Heading order and heading count don't matter. Titles should be unique, clear, concise and accurate, which is not the same as exact-match.

### Cited Findings

- [DOC] "Are you writing to a particular word count because you've heard or read that Google has a preferred word count? (No, we don't.)" — [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [DOC] "The length of the content alone doesn't matter for ranking purposes." Google "doesn't use the keywords meta tag." Keywords in the domain or URL path "alone have hardly any effect." Heading order doesn't matter ("it doesn't matter if you're using them out of order"), and there is no ideal number of headings. — [SEO Starter Guide, updated 2025-12-10](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [DOC] "A good title is unique to the page, clear and concise, and accurately describes the contents of the page." Headings help users navigate long content. — [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [DOC] The main heading should be descriptive and not sensational (self-assessment question). — [Creating helpful content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [STAFF, second-hand] John Mueller has said word count is not a ranking factor (2018–2019, Reddit and Twitter) and, in 2021, answered "no" when asked whether keyword density matters: "Keyword density, in general, is something I wouldn't focus on. Make sure your content is written in a natural way." Wording is from secondary reports; I did not verify the original posts. — [Search Engine Journal](https://www.searchenginejournal.com/word-count-not-a-quality-factor/397288/); [Search Engine Roundtable](https://www.seroundtable.com/google-word-count-for-seo-google-rankings-35607.html)

### Inferences

- An agent should size each page to the intent (a booking page can be short; a course page needs enough to decide on) and never pad toward a target. Titles and H1s should name the thing plainly, in the customer's words, without repeating keywords.

### Gaps

- None material. Google's position here is documented directly.
