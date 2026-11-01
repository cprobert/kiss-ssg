# Structured data (schema.org JSON-LD): what Google and Bing support and reward, as of November 2026

Research date: 2026-11-01. Primary sources: Google Search Central docs, the documentation changelog, and Search Central blog posts, fetched on that date. Note on method: Google's changelog page was summarised by a fetch tool, so the one-line summaries are paraphrases of the changelog entries. The dates come from that page.

## 1. Which rich result types are in Google's Search Gallery today, and which were removed in 2023–2026?

### Takeaway

On 2026-10-16 the Search Gallery listed 25 features. Since August 2023 Google has removed, in order: HowTo (Sep 2023), sitelinks search box (Nov 2024), six types from the June 2025 simplification (Course Info, ClaimReview, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing), practice problem (deprecated Nov 2025, docs removed Jan 2026) and FAQ (deprecated May 2026, docs removed June 2026). Book Actions was announced for retirement in June 2025 and then kept. None of these removals makes the markup invalid or harmful. Google only stopped showing the rich result.

### Cited findings

**In the Search Gallery today** (page last updated 2026-10-16): Article, Breadcrumb, Carousel, Course list, Dataset, Discussion forum, Education Q&A, Employer aggregate rating, Event, Image metadata, Job posting, Local business, Math solver, Movie, Organization, Product, Profile page, Q&A, Recipe, Review snippet, Software app, Speakable, Subscription and paywalled content, Vacation rental, Video. Source: [Google Search Gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery).

- Dataset is still in the gallery, but on 2025-11-05 Google clarified that Dataset markup is used only by Dataset Search, not by Google Search results. Source: [Search Central documentation changelog](https://developers.google.com/search/updates).

**Status table: what was removed or restricted, and when**

| Type                                                                                              | Status                                                                                                                                                                                                                         | Date(s)                 | Source                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FAQ (FAQPage)                                                                                     | Restricted to "well-known, authoritative government and health websites"                                                                                                                                                       | Announced 2023-08-08    | [Google blog, Changes to HowTo and FAQ rich results](https://developers.google.com/search/blog/2023/08/howto-faq-changes)                                                                                                                                                                 |
| FAQ (FAQPage)                                                                                     | Deprecated for all sites. Deprecation notice added 2026-05-08, documentation removed 2026-06-15                                                                                                                                | 2026-05-08 / 2026-06-15 | [Changelog](https://developers.google.com/search/updates)                                                                                                                                                                                                                                 |
| FAQ (FAQPage)                                                                                     | Secondary reports: the rich result stopped showing on 2026-05-07, the Search Console report, filter and Rich Results Test support were removed in June 2026, and API support in August 2026                                    | —                       | [TechWyse](https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026); [jsonld.com](https://jsonld.com/google-faq-rich-results-deprecated/) (not verified against Google's own wording, because the doc page has been removed)                                      |
| HowTo                                                                                             | Removed from mobile on 2023-08-08, then from desktop "as of September 13" 2023. Documentation removed 2023-09-14                                                                                                               | 2023-08-08 / 2023-09-13 | [Google blog](https://developers.google.com/search/blog/2023/08/howto-faq-changes); [Changelog](https://developers.google.com/search/updates)                                                                                                                                             |
| Sitelinks search box (WebSite + SearchAction)                                                     | Announced 2024-10-21, dropped from results 2024-11-21. Documentation removed and `nositelinkssearchbox` archived 2024-11-29                                                                                                    | 2024-11-21              | [Google blog, Farewell, Sitelinks Search Box](https://developers.google.cn/search/blog/2024/10/sitelinks-search-box?hl=en); [Changelog](https://developers.google.com/search/updates); effective date per [PPC Land](https://ppc.land/google-to-remove-sitelinks-search-box/)             |
| Course Info, ClaimReview, Estimated Salary, Learning Video, Special Announcement, Vehicle Listing | Phased out. Announced 2025-06-12 (Henry Hsu, Google). Removed from Search Console reports, the Rich Results Test and the search appearance filters from 2025-09-09. Search Console API support continued through December 2025 | 2025-06-12 / 2025-09-09 | [Google blog, Simplifying the search results page](https://developers.google.com/search/blog/2025/06/simplifying-search-results)                                                                                                                                                          |
| Same set, minus ClaimReview                                                                       | Documentation pages removed for Course Info, Estimated Salary, Learning Video, Special Announcement and Vehicle Listing                                                                                                        | 2025-09-09              | [Changelog](https://developers.google.com/search/updates)                                                                                                                                                                                                                                 |
| Special Announcement                                                                              | A deprecation notice already existed before the June batch                                                                                                                                                                     | 2025-04-23              | [Changelog](https://developers.google.com/search/updates)                                                                                                                                                                                                                                 |
| Book Actions                                                                                      | Included in the June 2025 retirement list, then the deprecation banner was removed on 2025-11-05. It still appears as eligible for review snippets ("Book")                                                                    | 2025-06-12 / 2025-11-05 | [Changelog](https://developers.google.com/search/updates); [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet)                                                                                                                      |
| Practice problem                                                                                  | Deprecation notice 2025-11-05, documentation removed 2026-01-06                                                                                                                                                                | 2025-11-05 / 2026-01-06 | [Changelog](https://developers.google.com/search/updates)                                                                                                                                                                                                                                 |
| Second simplification round (general)                                                             | John Mueller, 2025-11-05: Google is "beginning to phase these lesser-used features out", and "Starting in January 2026, we'll remove support for the structured data types in Search Console and its API."                     | 2025-11-05              | [Google blog, Here's an update on our efforts to simplify the search results page](https://developers.google.com/search/blog/2025/11/update-on-our-efforts)                                                                                                                               |
| Job training (EducationalOccupationalProgram / WorkBasedProgram)                                  | Rich result paused and then dropped in 2022. Google said it "wasn't useful for the ecosystem at scale."                                                                                                                        | ~2022-06                | [Search Engine Land](https://searchengineland.com/google-drops-support-for-job-training-structured-data-385503) (page returned 403 when fetched, so this rests on the search snippet); [SEJ](https://www.searchenginejournal.com/google-clarifies-pause-of-job-training-in-search/393265) |
| Guided recipes, home activities, video carousel (limited access)                                  | Documentation removed on 2024-03-06, 2024-06-04 and 2024-04-17 respectively                                                                                                                                                    | 2024                    | [Changelog](https://developers.google.com/search/updates)                                                                                                                                                                                                                                 |

**What Google says removal means for existing markup**

- HowTo/FAQ, 2023: there is no need to remove the markup proactively, because unused structured data does not cause problems for Search. The change "should not be considered a ranking change." Source: [Google blog 2023-08-08](https://developers.google.com/search/blog/2023/08/howto-faq-changes).
- Sitelinks search box: "Unsupported structured data like this won't cause issues in Search, and won't trigger errors in Search Console reports." Source: [Google blog 2024-10-21](https://developers.google.cn/search/blog/2024/10/sitelinks-search-box?hl=en).
- June 2025 batch: "This update won't affect how pages are ranked." Also: "The use of these structured data types outside of Google Search (and dependent features) is not affected." Source: [Google blog 2025-06-12](https://developers.google.com/search/blog/2025/06/simplifying-search-results).
- FAQPage is still a valid schema.org type, and sites with genuine on-page Q&A are not required to remove the markup. Source: [jsonld.com](https://jsonld.com/google-faq-rich-results-deprecated/) (secondary).

**Other 2023–2026 additions and changes relevant to a small site** (from the [changelog](https://developers.google.com/search/updates))

- 2023-11-15: Course info documentation added. It was removed again in 2025.
- 2023-11-27: Profile page and Discussion forum documentation added.
- 2023-11-29: new Organization documentation, which absorbed the Logo documentation.
- 2023-12-13: Organization `telephone` and `email` may be set at the organization level, not only through `contactPoint`.
- 2024-08-26: clarification of how Organization markup is used in Search, including which properties affect the logo.
- 2025-01-15: review snippets should accept only ratings and reviews that carry a comment and an author name.
- 2025-01-22: breadcrumb availability changed to desktop only.
- 2025-11-12: clarified nesting rules for reviews and aggregate ratings.
- 2026-03-02: preferred-image guidance (schema.org `image` and `og:image`) for image thumbnails.
- 2026-07-24: review snippet guideline against fake and undisclosed incentivized reviews.
- 2026-09-24: `creator` property added to VideoObject.

### Inferences

- The direction since 2023 is clear. Google keeps rich results for commercial and vertical data (Product, merchant listings, Event, Job posting, Recipe, Local business, Video) and drops informational result types whose answers it now gives itself (FAQ, HowTo, practice problems).
- "Removed from Google" means no rich result, no Search Console report and no Rich Results Test validation for that type. It does not mean the schema.org type is invalid. The Schema Markup Validator still validates it, and other consumers such as Bing and LLM crawlers can still read it.

### Gaps

- I could not read Google's own FAQ deprecation notice: the doc page was removed on 2026-06-15. The 2026-05-07 display end date and the August 2026 API date come from secondary sources only.
- ClaimReview was in the June 2025 phase-out, but its documentation was not in the 2025-09-09 removal list. I did not confirm whether a ClaimReview doc page survives (for example, for Fact Check Explorer).
- The November 2025 Mueller post names no features. The per-feature detail comes from the changelog.
- I did not check whether the changelog has entries after 2026-09-24.

## 2. Course: the status of Course list and Course info, and what a training provider still gains

### Takeaway

The Course info rich result (a single course's details) was retired in 2025: announced 2025-06-12, documentation and tooling removed 2025-09-09. The **Course list** carousel is still a supported rich result (doc updated 2026-09-08), available in English in every region, and it needs at least three courses marked up with ItemList and Carousel markup. Courses are also eligible for review snippets. EducationalOccupationalProgram has had no Google rich result since job training was dropped in 2022.

### Cited findings

- Course list uses `Course`, usually inside an `ItemList`, to show a provider's courses in a list. Required `Course` properties are `name` and `description` (display limit 60 characters). `ItemList` needs `itemListElement`, `ListItem.position` and a unique `ListItem.url`. `provider` (an Organization) is recommended. Source: [Google Course list doc](https://developers.google.com/search/docs/appearance/structured-data/course), last updated 2026-09-08.
- Technical requirement: mark up at least three courses, on separate detail pages or on one all-in-one page, with Carousel markup on a summary or all-in-one page. Source: [Course list doc](https://developers.google.com/search/docs/appearance/structured-data/course).
- Content restriction: `Course` is only for educational courses "with an explicit learning outcome, instructors, and enrolled students". Course names must not contain promotional phrases, prices or discounts. A general event or a single short video does not qualify. Violations can lead to a manual action, after which the page's structured data is ignored. Source: [Course list doc](https://developers.google.com/search/docs/appearance/structured-data/course).
- Availability: English, every region where Google Search is available. Source: [Course list doc](https://developers.google.com/search/docs/appearance/structured-data/course).
- Course info (2023-11-15 to 2025): retired. Announced 2025-06-12, and its documentation was removed 2025-09-09. Source: [Google blog](https://developers.google.com/search/blog/2025/06/simplifying-search-results); [Changelog](https://developers.google.com/search/updates).
- "Course list" is listed among the types eligible for review snippets. Source: [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).
- EducationalOccupationalProgram / WorkBasedProgram belonged to the job training experience, which Google suspended in 2022. Source: [SEJ](https://www.searchenginejournal.com/google-clarifies-pause-of-job-training-in-search/393265); [Search Engine Land](https://searchengineland.com/google-drops-support-for-job-training-structured-data-385503).

### Inferences

- A training provider with three or more courses can still earn the Course list carousel in English results. That is the one education-specific rich result left to it. Per-course details such as price, schedule, mode and duration (formerly `hasCourseInstance` and `offers` for Course info) no longer produce a rich result in Google. They are still valid schema.org and cost little if the content is visible on the page.
- A provider with a single course, or with "courses" that are really one-off events, does not qualify for Course list. Use Event markup for dated sessions only when they genuinely are events.
- For EducationalOccupationalProgram, the only value left is entity description for other consumers. Google shows nothing for it. Do not spend effort on it for Google.

### Gaps

- I found no data on how often the Course list carousel actually appears in 2026, or on its click-through effect.
- I did not verify whether Bing shows any course-specific feature.

## 3. LocalBusiness and Organization: current guidance and the link to Google Business Profile

### Takeaway

Organization markup (docs rewritten 2023-11-29, updated 2026-09-08) has **no required properties**. It belongs on the home page or the About page, and it influences the logo and the knowledge panel. LocalBusiness requires `name` and `address` and feeds local knowledge panels and carousels. Neither doc mentions Google Business Profile. For a physical small business, GBP is still the primary source for Maps and the local pack, and markup supplements it.

### Cited findings

- Organization: helps Google understand an organisation's administrative details and tell it apart from others. Some properties affect visible elements such as the logo and the knowledge panel. Place it on the home page or a single "About" page; it does not need to be on every page. There are no required properties. Recommended properties: `address`, `alternateName`, `contactPoint`, `description`, `email`, `foundingDate`, `hasMerchantReturnPolicy`, `hasMemberProgram`, `hasShippingService`, `iso6523Code`, `legalName`, `logo`, `name`, `numberOfEmployees`, `sameAs`, `taxID`, `telephone`, `url`, `vatID`. Source: [Google Organization doc](https://developers.google.com/search/docs/appearance/structured-data/organization), last updated 2026-09-08.
- Logo: at least 112x112px, crawlable, a supported format, and it should look right on a white background. Source: [Organization doc](https://developers.google.com/search/docs/appearance/structured-data/organization).
- `sameAs`: links to other pages about the organisation, such as social or review profiles. Several are allowed. `address`: a PostalAddress, which may repeat for several locations, with a two-letter ISO country code. Telephone numbers should include the country and area codes. Use the most specific Organization or LocalBusiness subtype. Source: [Organization doc](https://developers.google.com/search/docs/appearance/structured-data/organization).
- Timeline: Logo documentation merged into the new Organization documentation on 2023-11-29. Organization-level `telephone`/`email` clarified 2023-12-13. How Organization markup is used, including which properties affect the logo, clarified 2024-08-26. Organization-level return policies added 2024-06-11. Source: [Changelog](https://developers.google.com/search/updates).
- LocalBusiness: powers local business information in Search and Maps, including business knowledge panels and carousels for business types. Required: `address` and `name`. Recommended: `aggregateRating`, `department`, `geo`, `menu`, `openingHoursSpecification`, `priceRange`, `review`, `servesCuisine`, `telephone`, `url`. The restaurant carousel is limited to a small set of providers. Source: [Google LocalBusiness doc](https://developers.google.com/search/docs/appearance/structured-data/local-business), last updated 2026-09-08.
- Opening hours: only standard English schema.org enumeration values are supported (clarified 2023-08-15). Source: [Changelog](https://developers.google.com/search/updates).
- Google Business Profile: neither the Organization doc nor the LocalBusiness doc mentions it. Source: [Organization doc](https://developers.google.com/search/docs/appearance/structured-data/organization); [LocalBusiness doc](https://developers.google.com/search/docs/appearance/structured-data/local-business).

### Inferences

- A small business or training provider should add one Organization node, or the most specific LocalBusiness subtype if it has a physical premises customers visit, on the home page. Give it `name`, `url`, `logo`, `sameAs` (social profiles, GBP or Maps URL, LinkedIn), `address`, `telephone` and `email`. Keep the name, address and phone exactly consistent with GBP and the visible footer.
- Do not expect the markup to replace GBP for local-pack visibility. Google documents no link between the two.

### Gaps

- I found no primary Google statement on how LocalBusiness markup and GBP data are reconciled when they conflict.
- I did not check whether `EducationalOrganization` gets any special treatment. Google documents none.

## 4. Review snippets and AggregateRating: the self-serving restriction

### Takeaway

Still in force (introduced September 2019, still in the doc updated 2026-09-08). A LocalBusiness or Organization that controls reviews about itself is ineligible for star review snippets. Reviews and ratings on LocalBusiness are recommended only for sites that review **other** businesses. A course provider marking up reviews of its own courses is a different case: Course list is an eligible type, and it is not one of the two types the self-serving rule names. It still has to follow the 2025–2026 guidelines on genuine, attributed, non-incentivised reviews.

### Cited findings

- "If the entity that's being reviewed controls the reviews about itself, their pages that use `LocalBusiness`" [or Organization] are ineligible for star review snippets. "Ratings must be sourced directly from users." Source: [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet), last updated 2026-09-08.
- Eligible types: Book, Course list, Event, Local business, Movie, Product, Recipe, Software App, plus CreativeWorkSeason, CreativeWorkSeries, Episode, Game, MediaObject, MusicPlaylist, MusicRecording and Organization. The self-serving restriction applies to LocalBusiness and Organization. Source: [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).
- LocalBusiness `review`/`aggregateRating`: "only recommended for sites that capture reviews about other local businesses" (clarified 2023-08-02). Source: [LocalBusiness doc](https://developers.google.com/search/docs/appearance/structured-data/local-business); [Changelog](https://developers.google.com/search/updates).
- 2025-01-15: accept only ratings and reviews that carry a comment and an author name. 2026-07-24: "Don't include fake or undisclosed incentivized reviews on your page or in your structured data markup". This covers reviews written in exchange for money, discounts, vouchers or free products without disclosure. Source: [Changelog](https://developers.google.com/search/updates); [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).
- Nesting (clarified 2025-11-12): when a review is nested through the `review` property, omit `itemReviewed`, but still give the reviewed item's `name`. Source: [Review snippet doc](https://developers.google.com/search/docs/appearance/structured-data/review-snippet).

### Inferences

- For a small business: do not put AggregateRating on the home page's Organization or LocalBusiness node built from testimonials you host or curate. It will not earn stars and it risks a manual action. Testimonials can stay as visible content.
- For a course page, AggregateRating on a `Course` inside a valid Course list setup is not ruled out by the self-serving rule as written. Whether Google shows stars for reviews a provider collects itself is not documented. Treat it as uncertain and keep it honest: real reviews, visible on the page, with author and comment.

### Gaps

- I could not fetch the original 2019 Google blog post announcing the self-serving rule, so the 2019 date rests on general knowledge and the rule's continued presence in the current doc.
- Google does not explicitly say whether a training provider's own course reviews count as "self-serving".

## 5. Breadcrumb, WebSite/sitelinks search box, site name, Event, Product, VideoObject, Article, ProfilePage, Person

### Takeaway

Breadcrumb rich results are **desktop only** since 2025-01-22. The sitelinks search box ended 2024-11-21, but WebSite markup for **site names** is still supported. Article, Event, Product, Video, Profile page, Discussion forum and Q&A are all still in the gallery. Person has no stand-alone rich result: it is used inside ProfilePage, as an Article author, and so on.

### Cited findings

- Breadcrumb: "This feature is available on desktop in all regions and languages where Google Search is available". Mobile is not mentioned. It needs a `BreadcrumbList` with at least two `ListItem`s, and if the last item omits `item`, Google uses the page URL. Source: [Breadcrumb doc](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb), last updated 2026-09-08. The change to desktop-only availability is dated 2025-01-22: [Changelog](https://developers.google.com/search/updates).
- Sitelinks search box: announced 2024-10-21 and removed from results on 2024-11-21 because usage had dropped. Regular sitelinks are unaffected. WebSite markup for site names is still supported: "make sure that you nest the site name properties in the same node." Source: [Google blog](https://developers.google.cn/search/blog/2024/10/sitelinks-search-box?hl=en); [PPC Land](https://ppc.land/google-to-remove-sitelinks-search-box/).
- Article (timezone reminder 2023-10-17), Video (timezone 2023-11-01, `ineligibleRegion` 2024-09-10, `creator` 2026-09-24), Event (online event properties removed and eligible/ineligible event examples added 2025-06-05), Product (split into product snippet and merchant listing 2024-05-01, variants 2024-02-20, many merchant properties 2024–2026), Profile page and Discussion forum (added 2023-11-27, updated 2024-06-04, 2024-08-23 and 2026-03-24). Source: [Changelog](https://developers.google.com/search/updates). All are listed in the [Search Gallery](https://developers.google.com/search/docs/appearance/structured-data/search-gallery) as of 2026-10-16.

### Inferences

- For a small static site, BreadcrumbList is still worth adding. It is cheap, it shows on desktop, and it describes the hierarchy for any consumer. Do not expect it to change mobile result display.
- Remove `SearchAction` from WebSite markup if you like, since it no longer does anything in Google, but there is no harm in leaving it. Keep `WebSite` with `name` and `alternateName` on the home page for site names.
- Event markup suits dated workshops and open days that are genuine events. Do not mark up a self-paced course as an Event.
- ProfilePage and Person suit tutor or instructor bio pages. Article suits blog posts. Product suits training sold as a product only if it is genuinely a product offer; Course list is the better fit for courses.

### Gaps

- I did not fetch the site names, Event, Product, Video, Article or ProfilePage doc pages individually, so their current required properties are not recorded here. Their gallery status and changelog dates are.
- I did not verify that the site names doc's own last-updated date or wording is unchanged since 2024.

## 6. Does structured data affect ranking? Does it help AI Overviews, AI Mode, ChatGPT and Bing Copilot?

### Takeaway

Google does not treat structured data as a web ranking factor. Its own documents say rich result removals and structured data manual actions do not affect ranking. Google states explicitly that **no special schema.org markup is needed** for AI Overviews or AI Mode, only that structured data should match visible text. Microsoft's Fabrice Canel said publicly (SMX Munich, March 2025) that Bing uses schema markup to help its LLMs, including Copilot, understand content. I found no equivalent primary statement from OpenAI or ChatGPT.

### Cited findings

- Google AI features: "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." "You don't need to create new machine readable files, AI text files, or markup to appear in these features." "There's also no special schema.org structured data that you need to add." Google recommends "Making sure your structured data matches the visible text on the page". Source: [Google, AI features and your website](https://developers.google.com/search/docs/appearance/ai-features), last updated 2025-12-10.
- Manual actions for structured data remove rich result eligibility, but "it doesn't affect how the page ranks in Google web search." "Google does not guarantee that your structured data will show up in search results." Source: [Google general structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), last updated 2026-07-10.
- The removals were each described as not ranking changes: the 2023 FAQ/HowTo change ("should not be considered a ranking change") and the 2025 batch ("won't affect how pages are ranked"). Sources: [Google blog 2023](https://developers.google.com/search/blog/2023/08/howto-faq-changes); [Google blog 2025](https://developers.google.com/search/blog/2025/06/simplifying-search-results).
- Google's stated purpose for structured data is appearance: "Adding structured data can enable search results that are more engaging to users." The intro page says nothing about ranking. Source: [Intro to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data), last updated 2025-12-10.
- Bing: Fabrice Canel (Microsoft) confirmed at SMX Munich (March 2025) that schema markup helps Microsoft's LLMs (Bing/Copilot) understand content. He also recommended IndexNow for freshness. Source: [Search Engine Land, Microsoft Bing/Copilot use schema for its LLMs](https://searchengineland.com/microsoft-bing-copilot-use-schema-for-its-llms-453455). Secondary reports only; I found no Microsoft-published transcript.
- ChatGPT and Perplexity: no public confirmation that they use schema markup. Source: [DerivateX](https://derivatex.agency/blog/schema-markup-llm-seo/) (vendor blog, low weight).

### Inferences

- For a small site, structured data is an eligibility and comprehension tool, not a ranking lever. Its value comes from the remaining rich results (Course list, breadcrumbs on desktop, review stars where eligible, Event, Product), from entity clarity (Organization, logo, sameAs), and, per Bing, from LLM understanding in Copilot.
- Claims from vendors that "schema gets you cited in AI Overviews" contradict Google's own statement. Treat them as marketing.

### Gaps

- I found no measured, independent study of structured data's effect on AI Overview or ChatGPT citation rates that I would trust.
- I found no Bing Webmaster Guidelines text from 2025–2026 on schema for Copilot; the claim rests on conference remarks reported by Search Engine Land.

## 7. Validation tools and markup that is not visible on the page

### Takeaway

Use Google's Rich Results Test for Google-eligible types, and the Schema Markup Validator (validator.schema.org) for general schema.org validity, including types Google no longer supports. Markup must describe visible content. Hidden or misrepresentative markup is a manual-action risk, which costs rich results but not rankings.

### Cited findings

- Google recommends JSON-LD "if your site's setup allows it". Microdata and RDFa are acceptable. "The Rich Results Test is an easy and useful tool for validating your structured data." Accurate, complete recommended properties matter more than filling every property with poor data. Source: [Intro to structured data](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data).
- Retired types are removed from the Rich Results Test: the sitelinks search box in 2024, the June 2025 batch from 2025-09-09, and FAQ in June 2026 (FAQ per secondary sources). So the Rich Results Test is not a general validity checker. Sources: [Google blog 2024](https://developers.google.cn/search/blog/2024/10/sitelinks-search-box?hl=en); [Google blog 2025](https://developers.google.com/search/blog/2025/06/simplifying-search-results); [TechWyse](https://www.techwyse.com/news/ai-search/google-faq-rich-results-deprecated-2026).
- "Don't mark up content that is not visible to readers of the page." "Your structured data must be a true representation of the page content." Hidden referenced content is a reason a page may not get rich results. Source: [General structured data guidelines](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), last updated 2026-07-10.

### Inferences

- A sensible check for a static site generator is to run every page's JSON-LD through the Schema Markup Validator for syntax and type validity, and the Rich Results Test for the types Google rewards. Also check that each marked-up value (name, price, rating, address) appears in the page's visible text.
- **For a small business or course site, add:** Organization or the most specific LocalBusiness subtype (home page or About page: name, url, logo, sameAs, address, telephone), WebSite (name and alternateName, for the site name), BreadcrumbList, Course with ItemList for Course list (three or more real courses), Event for genuine dated sessions, Article for blog posts, ProfilePage/Person for tutor bios, VideoObject for hosted video.
- **Do not add, or do not expect anything from:** FAQPage (no rich result since May 2026), HowTo (since September 2023), SearchAction for the sitelinks search box (since November 2024), Course info details as a rich result lever (since 2025), EducationalOccupationalProgram for Google (no feature since 2022), self-serving AggregateRating on your own Organization or LocalBusiness, and any markup of content not visible on the page. Existing markup of the retired types is harmless and can stay if it is truthful.

### Gaps

- The Schema Markup Validator is not mentioned on the Google intro page as fetched, and I did not fetch validator.schema.org itself to confirm its current status.
- I did not review schema.org release notes, so I cannot say whether any type relevant here changed status in schema.org itself in 2025–2026. None of the Google removals above made a schema.org type invalid.
