# AI search visibility for a small static site (GEO / AEO), state as of November 2026

Research date: 2026-11-01. Evidence grades used throughout: **[DOC]** = the platform documents it; **[MEASURED]** = an empirical study (with who ran it; most are SEO-vendor studies and correlational); **[SPEC]** = speculation / vendor marketing / anecdote.

## 1. Google's own guidance: AI Overviews and AI Mode

### Takeaway

Google says plainly that no special optimisation, no special schema and no "AI text files" are needed: a page must be indexed and snippet-eligible, the normal snippet controls apply, and Google-Extended does not affect AI features in Search. **[DOC]**

### Cited Findings

- "There are no additional requirements to appear in AI Overviews or AI Mode, nor other special optimizations necessary." Eligibility: "a page must be indexed and eligible to be shown in Google Search with a snippet"; "There are no additional technical requirements"; inclusion is not guaranteed. Page last updated 2025-12-10. **[DOC]** — [Google Search Central, AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- The same page says you do not need to create "machine readable files, AI text files, or markup to appear in these features" (it does not name llms.txt, but this sentence covers it), and that there is "no special schema.org structured data that you need to add"; it recommends structured data match the visible text. **[DOC]** — [same](https://developers.google.com/search/docs/appearance/ai-features)
- Selection: AI Overviews / AI Mode may use "query fan-out" ("issuing multiple related searches across subtopics and data sources"), which lets them show "a wider and more diverse set of helpful links" than classic results. AI Overviews show only when judged additive. **[DOC]** — [same](https://developers.google.com/search/docs/appearance/ai-features)
- Controls: Googlebot robots.txt rules govern crawling for Search; `nosnippet`, `data-nosnippet`, `max-snippet` and `noindex` limit what is shown in AI features. Recrawl to see a change can take "several days to several months". **[DOC]** — [same](https://developers.google.com/search/docs/appearance/ai-features)
- Measurement: AI-feature traffic is counted in Search Console's Performance report under the "Web" search type (not broken out). Google claims AI-Overview clicks are "higher quality" (users spend more time) — a Google claim with no published data. **[DOC claim, unverified]** — [same](https://developers.google.com/search/docs/appearance/ai-features)
- Google-Extended is a robots.txt product token, not a crawler ("Crawling is done with existing Google user agent strings"). It governs use of content for training future Gemini models and for grounding in Gemini Apps, the Vertex AI Gemini API and Grounding with Google Search on Vertex AI. It "does not impact a site's inclusion in Google Search" and is not a ranking signal. Page last updated 2026-10-30, and says Google plans to support the IETF **AIPREF** training-preference signal in early 2027. **[DOC]** — [Google common crawlers](https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers)
- Corollary (also stated in press coverage): Googlebot crawls for Search _including_ AI Overviews and AI Mode, so there is no way to stay in Google Search but out of AI Overviews except the snippet controls. — [TechCrunch, 2026-07-01](https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/)

### Inferences

- For Google, "GEO" for a small site reduces to ordinary SEO: be crawlable, indexable, snippet-eligible, with structured data that matches visible text. A site-building skill should not add any Google-specific "AI" step.
- `nosnippet`/`max-snippet` are the only levers to _reduce_ AI-feature use, and they also reduce classic snippets; small sites should not use them unless they mean it.
- Blocking Google-Extended costs nothing in Search visibility (by Google's statement); whether to block it is a values choice, not an SEO one.

### Gaps

- Google publishes no data on how AI Overview/AI Mode sources are ranked beyond "fan-out"; no Google statement isolates AI-feature clicks in Search Console.

## 2. AI crawlers and robots.txt in 2026

### Takeaway

Most vendors now split **training** crawlers from **search/index** crawlers and **user-triggered fetchers**; blocking the training token does not (by their documentation) remove you from their search answers, but blocking the search bot does. User-triggered fetchers (ChatGPT-User, Perplexity-User) may not honour robots.txt. **[DOC]**

### Cited Findings

- **OpenAI** **[DOC]** — [OpenAI, Overview of OpenAI crawlers](https://developers.openai.com/api/docs/bots) (no date on page):
  - `OAI-SearchBot`: "used to surface websites in search results in ChatGPT's search features". Opted-out sites may still appear as navigational links. Changes take ~24 hours.
  - `GPTBot`: "Disallowing GPTBot indicates a site's content should not be used in training generative AI foundation models."
  - `ChatGPT-User`: user-initiated visits (ChatGPT, Custom GPTs, GPT Actions); "not used for crawling the web in an automatic fashion"; "Because these actions are initiated by a user, robots.txt rules may not apply."
  - `OAI-AdsBot`: only visits pages submitted as ads.
- **Anthropic** (help article as of 2026-04-07) **[DOC]** — [Anthropic support: Does Anthropic crawl data from the web](https://support.claude.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler):
  - `ClaudeBot`: training; blocking "signals that the site's future materials should be excluded" from training.
  - `Claude-SearchBot`: indexing for search; blocking "prevents our system from indexing your content for search optimization" and may reduce visibility in Claude's search results.
  - `Claude-User`: user-directed retrieval; "Disabling Claude-User on your site prevents our system from retrieving your content in response to a user query." (Unlike OpenAI, Anthropic presents this as respected.) Rules are per subdomain.
- **Perplexity**: `PerplexityBot` surfaces and links sites in Perplexity search and, per Perplexity, is not used to train foundation models; `Perplexity-User` fetches on a user's request and is reported (secondary sources) to generally not honour robots.txt. **[DOC + secondary]** — [Perplexity crawlers docs](https://docs.perplexity.ai/docs/resources/perplexity-crawlers.md)
- Cloudflare (Aug 2025) reported Perplexity using undeclared "stealth" crawlers that rotated user agents/ASNs to reach sites that blocked PerplexityBot and Perplexity-User; it de-listed Perplexity as a verified bot. Perplexity disputed this. OpenAI's agent was reported to respect the blocks in the same test. **[MEASURED by Cloudflare, an interested party; disputed]** — [Cloudflare blog](https://blog.cloudflare.com/perplexity-is-using-stealth-undeclared-crawlers-to-evade-website-no-crawl-directives/); [Search Engine Land](https://searchengineland.com/cloudflare-vs-perplexity-ai-crawling-460016)
- **Apple**: `Applebot-Extended` is a robots.txt token (not a crawler) that opts content out of training Apple's foundation models (Apple Intelligence); per Apple, pages disallowing it can still appear in Apple search results and it is not a ranking factor. Blocking `Applebot` itself removes the site from Siri/Spotlight search. **[DOC, seen via snippet + secondary]** — [Apple, About Applebot](https://support.apple.com/en-ae/119829); [relevantaudience](https://www.relevantaudience.com/geo/apple-applebot-extended-blocking-does-not-affect-search-ranking/)
- **Cloudflare defaults**: on 2025-07-01 Cloudflare made AI-crawler blocking the default for new customers and launched Pay Per Crawl (private beta) — [MIT Technology Review](https://www.technologyreview.com/2025/07/01/1119498/cloudflare-will-now-by-default-block-ai-bots-from-crawling-its-clients-websites/); [Search Engine Land](https://searchengineland.com/cloudflare-to-block-ai-crawlers-by-default-with-new-pay-per-crawl-initiative-457708). On 2026-07-01 it announced that from **2026-09-15** its defaults block "mixed-use" crawlers (search combined with agent/training use) on pages that host ads, for new customers, new sites of existing customers and **all existing free customers**; Pay Per Crawl becomes "Pay Per Use"; Cloudflare says >50% of AI crawl traffic re-fetches unchanged pages. **[DOC via TechCrunch]** — [TechCrunch, 2026-07-01](https://techcrunch.com/2026/07/01/cloudflares-new-policy-pushes-ai-companies-to-pay-for-publishers-content/)
- Cloudflare's Content Signals robots.txt extension (e.g. `Content-Signal: search=yes, ai-train=no`) expresses a preference, not enforcement. **[secondary]** — [pravinkumar.co](https://www.pravinkumar.co/blog/cloudflare-content-signals-policy-ai-crawlers-2026)
- One secondary analysis warns that Cloudflare's training-block setting can, depending on configuration, also catch Googlebot/Applebot/Bingbot. **[SPEC / unverified against Cloudflare docs]** — [seo-kreativ.de](https://www.seo-kreativ.de/en/blog/cloudflare-ki-crawler-googlebot/)

### Inferences

- The robots.txt written by a static site generator controls only what it says; a site behind Cloudflare (or another CDN/WAF with bot management) can be blocking AI search bots at the edge regardless of robots.txt. A skill should tell the author to check the CDN's bot settings, not just robots.txt.
- A sensible default that is consistent with every vendor's documentation: allow search/index bots (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot); treat training tokens (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) as the author's choice. Blocking a search bot is what costs visibility.
- `Disallow: /` for `*` removes the site from AI search as well as classic search.

### Gaps

- I did not fetch Microsoft's/Bing's documentation in this pass: Copilot is understood to ground on the Bing index (so Bingbot access governs it), and Bing honours `nocache`/`noarchive` for limiting use in Copilot, but I have no 2026 primary source here — verify on Bing Webmaster Guidelines before stating it.
- CCBot (Common Crawl) documentation not fetched; widely known as a non-search crawler whose corpus feeds many training sets — unverified in this pass.
- Cloudflare's own 2026 announcement post was not fetched; scope details come from TechCrunch and conflict slightly with blog write-ups (some say only newly onboarded domains).

## 3. llms.txt and Markdown copies of pages

### Takeaway

llms.txt is a proposal, not a standard. Adoption grew to ~10% of domains, but no major AI platform has documented that its production search/answer systems read it, server logs show AI crawlers almost never request it, and the one large correlational study finds no citation benefit. Google explicitly says no "AI text files" are needed. No evidence was found that it — or `.md` copies — harms anything. **[MEASURED + DOC]**

### Cited Findings

- Google: "you do not need to create machine readable files, AI text files, or markup to appear in these features." **[DOC]** — [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features)
- John Mueller (Google) compared llms.txt to the keywords meta tag: it is the site owner's claim about what the site is about, which a crawler can check by reading the site; redundant if the crawler already has the content. Informal (Reddit), not policy. — [Search Engine Journal](https://www.searchenginejournal.com/google-says-llms-txt-comparable-to-keywords-meta-tag/544804/)
- Gary Illyes reportedly said (July 2025) Google does not support llms.txt and has no plans to. **[secondary only]** — [richdevtools](https://richdevtools.com/articles/web/llms-txt-evidence-2026)
- SE Ranking, ~300,000 domains (May 2026): 10.13% have llms.txt (from 0.4% April 2025); none of the top 1,000 domains by traffic; **no correlation** between llms.txt and AI citations, and removing the variable improved their model. **[MEASURED, vendor, correlational]** — [SE Ranking](https://seranking.com/blog/llms-txt/); [Search Engine Journal](https://www.searchenginejournal.com/llms-txt-shows-no-clear-effect-on-ai-citations-based-on-300k-domains/561542/)
- SISTRIX, 96,418 pages: "no measurable effect on AI citations". **[MEASURED, vendor; via secondary]** — [bediscoverable.ai](https://bediscoverable.ai/resources/geo-tactics-ai-citations-study)
- Server logs: reported Ahrefs analysis (~137k domains) found 97% of llms.txt files got zero AI-crawler requests in May 2026 (**not verified at Ahrefs' own page**); another 90-day analysis of >500M AI bot visits found 408 llms.txt requests; another 84 of 62,100. **[MEASURED, secondary]** — [richdevtools](https://richdevtools.com/articles/web/llms-txt-evidence-2026)
- As of mid-2026, no statement from OpenAI, Google, Anthropic, Meta, Perplexity or Mistral that production systems read llms.txt (Perplexity has reportedly said it fetches it to help prioritise pages — undocumented). Anthropic publishes llms.txt for its own docs, which is not a statement about its crawlers. A contrary vendor claim (GPTBot fetching llms.txt on ~60% of implementing sites) is internally inconsistent and unsupported. — [richdevtools](https://richdevtools.com/articles/web/llms-txt-evidence-2026); [project llms.txt (sells llms.txt tooling)](https://projectllmstxt.com/blog/llms-txt-adoption-2026)
- Where llms.txt **does** demonstrably get used: coding agents and documentation MCP servers (Cursor, Cline, Continue etc.) that are pointed at a docs site's llms.txt — reported, not measured. **[secondary]** — [richdevtools](https://richdevtools.com/articles/web/llms-txt-evidence-2026)
- Markdown `.md` copies: **no study or platform statement found** either way — none on AI search crawlers requesting them, none on harm (duplicate-content or `.md` URLs appearing in search). — [richdevtools](https://richdevtools.com/articles/web/llms-txt-evidence-2026) (explicitly has no data on them)

### Inferences

- For AI _search_ visibility, llms.txt and `.md` copies are unsupported tactics: zero evidence of benefit, Google says unnecessary. A skill must not claim they improve citations.
- Neither has evidence of harm, and both are cheap for a generator. Their honest justification is the _agent_ use case (an agent or coding tool told to read the site), not search. Keeping them on by default is defensible on that basis only if it is described that way.
- Theoretical risks worth a guard (inferred, no evidence of occurrence): `.md` copies being indexed as thin duplicates in classic search (mitigable with an `X-Robots-Tag: noindex` header or by not linking them from HTML); llms.txt or `.md` drifting out of sync with the HTML (a generator that derives both from the same build avoids this).

### Gaps

- No primary Ahrefs page for the 97%-zero-requests figure was retrieved.
- No data at all on `.md` page copies being fetched by any AI bot in 2026.

## 4. What correlates with being cited (all correlational unless stated)

### Takeaway

The best-supported correlate of AI Overview citation is ranking organically, but the overlap with Google's top 10 has fallen sharply (Ahrefs 76% in 2025 → 38% in 2026; other vendors 17–54%), and ChatGPT's citations overlap Google's rankings far less than Perplexity's. The only experimental evidence (Princeton GEO) is a lab benchmark, not a live engine. **[MEASURED, vendor, correlational]**

### Cited Findings

- **GEO paper** (Aggarwal et al., Princeton et al., KDD 2024; arXiv 2311.09735): on their GEO-bench with a simulated generative engine, rewriting a source to add citations, quotations and statistics raised its "visibility" by up to ~40%; keyword stuffing did not help. **Experimental, but on a research engine and 2023-era models, not on Google/ChatGPT production.** A critique recalculates gains at ~27–41% depending on metric. — [arXiv](https://arxiv.org/pdf/2311.09735); [Blck Alpaca critique](https://blckalpaca.at/en/knowledge-base/seo-geo/geo-generative-engine-optimization/the-princeton-geo-study-methodology-results-and-critique)
- Ahrefs: July 2025 study (1.9M citations) found 76.1% of AI Overview–cited pages rank in the top 10; updated 2026 study (863k keywords) found only 38%. **[vendor]** — [Ahrefs](https://ahrefs.com/blog/search-rankings-ai-citations); [Search Engine Journal](https://www.searchenginejournal.com/google-ai-overview-citations-from-top-ranking-pages-drop-sharply/568637/)
- seoClarity: 32% top-10 overlap, but 94% of AIOs share at least one URL with the top 20. **[vendor]** — [seoClarity](https://www.seoclarity.net/research/aio-rankings-overlap)
- BrightEdge reportedly 17% (Feb 2026) vs 54% (Oct 2025); RankRabbit 41.2% of 2.2M citations. **[vendor, secondary]** — [omnibound summary](https://www.omnibound.ai/blog/google-ai-overviews-statistics); [RankRabbit](https://rankrabbit.ai/blog/42-percent-ai-overview-citations-top-10-2-2-million-study)
- Semrush: ChatGPT has the weakest overlap with Google's top 10; Perplexity the strongest (>91% domain, 82% URL overlap). **[vendor]** — [Semrush](https://semrush.com/blog/ai-mode-comparison-study)
- Methods differ (top-10 vs top-20, citations vs URLs, keyword sets), so the numbers are not comparable; direction (falling overlap, consistent with query fan-out) is the robust part.

### Inferences

- For a small site, the evidence-backed actions are the ordinary ones: be indexable, rank for specific long-tail questions, write clear self-contained answers with concrete facts and sourced figures (consistent with the GEO paper and with fan-out retrieving sub-topic passages). Brand-mention and "authority" correlates found in vendor studies are not actionable by a generator.
- Falling top-10 overlap means pages ranking 11–30 for sub-queries can be cited — mildly good news for small sites, but correlational.

### Gaps

- Brand-mention correlation studies (Ahrefs "brand mentions vs AI visibility") not retrieved in this pass.
- No rigorous ChatGPT-specific citation-source study found.

## 5. Traffic effects

### Takeaway

Every independent and vendor study finds fewer clicks when an AI Overview appears — roughly a third to over a half fewer on the top result — and very few clicks on the cited sources themselves. Being cited beats not being cited, but is not a substitute for the click. **[MEASURED]**

### Cited Findings

- **Pew Research Center** (900+ US adults' browsing, March 2025; published July 2025): users clicked a traditional result on 8% of visits with an AI summary vs 15% without; clicked a link inside the summary on 1% of visits. Google disputed the method and says it has "not observed significant drops in aggregate web traffic". **[MEASURED, independent]** — [Search Engine Journal](https://www.searchenginejournal.com/pew-research-confirms-google-ai-overviews-is-eroding-web-ecosystem/551825/); [The Register](https://www.theregister.com/software/2025/07/22/google-ai-overviews-are-killing-the-web-pew-study/857001)
- **Ahrefs**: position-1 CTR 34.5% lower with an AIO (April 2025, 300k keywords); December 2025 update ~58% lower. **[vendor]** — [Ahrefs](https://ahrefs.com/blog/ai-overviews-reduce-clicks/); [Ahrefs update](https://ahrefs.com/blog/ai-overviews-reduce-clicks-update)
- **Seer Interactive**: Nov 2025 — organic CTR on AIO queries down 61% (1.76% → 0.61%, 3,119 queries, 42 orgs); April 2026 update (53 brands, 5.47M queries) — 1.31% in Dec 2025 recovering to 2.36% by Feb 2026; cited brands get more clicks than uncited (figure reported as ~2x or +120%, unconfirmed). **[vendor, via secondary]** — [presenc.ai comparison](https://presenc.ai/research/ai-overviews-ctr-impact-2026)
- Advanced Web Ranking reported 52% lower position-1 CTR (July 2026 data). **[vendor, secondary]** — [same](https://presenc.ai/research/ai-overviews-ctr-impact-2026)

### Inferences

- For small businesses: informational queries ("how do I…") lose the most clicks; transactional/local/brand queries matter more. A site should make its brand, location, contact and offer unmistakable, because a mention in an answer only converts if the reader then searches for or recognises the business.
- Search Console cannot separate AIO traffic, so a small site cannot measure its own exposure directly.

### Gaps

- Seer's primary pages not fetched; no study isolates small-business sites specifically.

## 6. JavaScript rendering

### Takeaway

As of the only systematic study (Vercel/MERJ, December 2024), no major AI crawler executed JavaScript; only Googlebot (and so Google's AI features) renders. Server-rendered/static HTML is therefore the safe default. **[MEASURED, vendor-run, dated]**

### Cited Findings

- Vercel/MERJ (published 2024-12-17): GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Meta, Bytespider and PerplexityBot did not render JS; GPTBot (~11.5% of requests) and ClaudeBot (~23.8%) downloaded JS files without executing them; Googlebot renders via headless Chrome. Over a month GPTBot made ~569M and ClaudeBot ~370M requests on Vercel's network vs Googlebot's ~4.5B. — [Vercel, The rise of the AI crawler](https://vercel.com/blog/the-rise-of-the-ai-crawler); figures via [TripleDart](https://www.tripledart.com/research/why-your-site-is-invisible-to-chatgpt-and-claude)
- Anecdote (Sept 2026) suggesting OpenAI crawlers may now run JS — unverified. **[SPEC]** — [Indie Hackers](https://www.indiehackers.com/post/traffic-from-chatgpt-jumped-is-it-because-its-crawlers-now-run-javascript-5dea2e48d0)

### Inferences

- A static site generator writing complete HTML already satisfies this; the risk is content injected client-side (JS-rendered nav, tabs, accordions filled by fetch, JSON-driven sections). A skill should keep all content in the served HTML.

### Gaps

- No 2025–2026 replication of the Vercel/MERJ study found; no vendor documents whether its fetchers render JS.

## 7. Structured data / schema and AI search

### Takeaway

Google documents that no special schema is needed for AI features and that structured data must match visible text; no platform documents that schema increases AI citation. Statements by Microsoft staff that schema helps their LLMs exist in secondary coverage but were not verified here. **[DOC for Google; otherwise no evidence]**

### Cited Findings

- Google: "no special schema.org structured data that you need to add"; keep structured data consistent with visible text. **[DOC]** — [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features)
- SE Ranking's llms.txt model controlled for schema among other factors, i.e. schema was treated as a candidate correlate; the write-up does not establish a causal effect. **[vendor]** — [richdevtools summary](https://richdevtools.com/articles/web/llms-txt-evidence-2026)

### Inferences

- Schema remains justified for classic rich results and entity clarity (Organization, LocalBusiness, Article dates); adopt it for those documented reasons, not as a GEO tactic.

### Gaps

- Bing/Microsoft (Fabrice Canel, reportedly SMX Munich, March 2025) is said to have stated that schema markup helps Bing's LLMs understand content; my search did not surface a primary source, so it is unverified.
- No OpenAI, Anthropic or Perplexity documentation on structured data use was found.

## Summary for a site-building skill (evidence-backed only)

1. Static, complete, server-delivered HTML (documented Google eligibility + measured non-rendering by AI crawlers).
2. Indexable and snippet-eligible: no stray `noindex`/`nosnippet`; robots.txt that allows search bots; tell authors to check CDN bot settings (Cloudflare defaults changed 2025-07-01 and 2026-09-15).
3. Separate training opt-outs (GPTBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot) from search bots (Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot, PerplexityBot, Applebot) — documented by each vendor.
4. Ordinary SEO and clear, specific, fact-bearing writing (correlational vendor studies + one lab experiment).
5. Structured data that matches visible text, for its classic uses.
6. llms.txt and `.md` copies: no evidence they help AI search, no evidence they harm; justify only as agent conveniences and never market them as GEO.
