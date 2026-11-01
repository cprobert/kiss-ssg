# Technical SEO for small static sites (state as of November 2026)

Method note: Google pages were read through WebFetch (a summarising fetch), on 2026-11-01. The "Last updated" dates are the dates those pages displayed when fetched. Quotes are as the fetch returned them. The 2025–2026 entries from Google's documentation changelog came from the same fetch. Only the first ~100k of its 180k characters was read, so the pre-2024 part of the changelog was not read. Staff statements are marked as statements, not documentation.

## 1. Title links: how Google picks and rewrites them, length, brand

### Takeaway

Google builds the title link automatically from several sources: `<title>`, the main visible heading, `og:title` (added Aug 2024), and others. It sets **no character or pixel limit**. It truncates "to fit the device width". "60 characters" is folk wisdom. Rewrites come from half-empty, outdated, inaccurate or boilerplate titles, or from having no clear main heading.

### Cited Findings

- Google's sources for the title link: the `<title>` element, the main visual title, heading elements, `og:title`, other large or prominent text, anchor text, and `WebSite` structured data. Google says it uses "a number of different sources to automatically determine the title link." A change can take days to weeks to show, because Google has to recrawl the page. Page last updated **2025-12-10**. — [Google: Influencing title links](https://developers.google.com/search/docs/appearance/title-link)
- **Length:** the page sets no character limit. "The title link is truncated in Google Search results as needed, typically to fit the device width." Titles should be descriptive and concise, without verbose or repeated text. — [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- **Causes of rewrites,** as the doc names them:
  - Half-empty titles, such as "| Site Name".
  - Obsolete titles, such as last year's date on a recurring page.
  - Inaccurate titles that don't match the content.
  - Micro-boilerplate: near-identical titles across a site.
  - No clear main title. When several headings look equally prominent, Google "may use the first heading as the text for the title link". The doc advises making the main title the most prominent element, such as the first `<h1>`.
  - Source: [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- **Brand:** give the home page title extra descriptive information. On other pages, "consider including just your site name at the beginning or end of each <title> element", with a delimiter such as a hyphen, colon or pipe. — [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- **CHANGE (2024-08-26):** `og:title` was added as a documented title-link source. — [Google Search Central documentation updates](https://developers.google.com/search/updates)
- **Empirical rewrite rates** (industry measurements, not Google):
  - Ahrefs measured Google rewriting title tags about 33.4% of the time, and reported rewrites as 33% more likely than in 2021. Only search-summary access; the study date was not verified.
  - A Q1 2025 study attributed to John McAlpin claims 76.04% of titles are overwritten, up from Zyppy's 61.6% in 2022. Cited secondhand; methodology unverified.
  - Sources: [Ahrefs title tags study](https://ahrefs.com/blog/title-tags-study); [blckalpaca summary of 2025 study](https://blckalpaca.at/en/knowledge-base/seo-geo/on-page-seo/title-tags-2026-google-rewrites-76-how-to-prevent-it)

### Inferences

- For a static site generator the practical rules are these:
  - Give every page a unique `<title>` drawn from its own heading.
  - Put the brand in one consistent position.
  - Avoid "| Brand" when the leading part is empty.
  - Keep `<title>`, the `<h1>` and `og:title` consistent, since Google cross-checks them.
  - Keep a single visually dominant main heading.
- A character-count check is a heuristic for avoiding truncation. It is not a Google rule. A build tool can warn about it but should not call it an error.

### Gaps

- Google publishes no pixel width. The commonly quoted ~580–600px desktop width comes from SEO tools; no primary source was found.
- Rewrite-rate studies disagree widely (33% to 76%). No study from 2026 was found.

## 2. Meta descriptions and snippet controls

### Takeaway

Snippets come "primarily" from page content. Google uses the meta description when it describes the page better than the content does. There is **no length limit** and snippets are truncated to device width. Google wants unique descriptions per page. The controls are `nosnippet`, `max-snippet:[n]` and `data-nosnippet`. `nosnippet` now also keeps content out of AI Overviews and AI Mode as a direct input.

### Cited Findings

- "Google primarily uses the content on the page to automatically determine the appropriate snippet." Google may use the meta description when it "describes the page better than other parts of the content." Snippets vary by query. Page last updated **2026-04-20**. — [Google: Control your snippets](https://developers.google.com/search/docs/appearance/snippet)
- **Length:** no set limit; the snippet is truncated as needed to fit the device width. Keyword-list descriptions are not useful. — [Google: snippets](https://developers.google.com/search/docs/appearance/snippet)
- **Uniqueness:** "Identical or similar descriptions on every page of a site aren't helpful." Use site-level descriptions for the home page and aggregation pages, and page-level descriptions elsewhere. Programmatic generation is fine if the output is readable and varied. — [Google: snippets](https://developers.google.com/search/docs/appearance/snippet)
- **Controls:**
  - `max-snippet:0` acts like `nosnippet`, and `-1` removes the limit.
  - `data-nosnippet` works on `span`, `div` and `section` elements.
  - `max-image-preview` takes `none`, `standard` or `large`.
  - `nosnippet` "will also prevent the content from being used as a direct input for AI Overviews and AI Mode."
  - Page last updated **2026-03-24**.
  - Source: [Google: robots meta tag spec](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- **CHANGES:**
  - 2024-01-05: clarified that page content is the primary snippet source.
  - 2025-03-05: AI Mode added to the robots meta tag docs.
  - 2026-04-20: new section on increasing the chance of "read more" deep links in snippets.
  - 2026-10-21: the content-control page was expanded to cover the robots meta tag, `data-nosnippet`, X-Robots-Tag and "the generative AI control".
  - Source: [Google documentation updates](https://developers.google.com/search/updates)
- **Empirical:** Ahrefs (2020 data, possibly stale) found Google rewrote hard-coded meta descriptions about 62.78% of the time across 20,000 keywords. The rate was slightly higher for long-tail queries. 25.02% of top-ranking pages had no meta description. — [Ahrefs meta description study](https://ahrefs.com/blog/meta-description-study/)

### Inferences

- Writing a unique, accurate description is still worth doing. It is used often enough, and it is also what social cards and the site's own `llms.txt` style summaries draw on. A missing description is not an error. A duplicated one across pages is the thing to flag.
- 150–160 characters is folk wisdom. Google states no number.

### Gaps

- No current (2024–2026) measurement of meta description rewrite rates was found. The 63% figure dates from 2020.
- What exactly the "generative AI control" added on 2026-10-21 is was not read in detail.

## 3. Canonicalisation

### Takeaway

Google ranks its canonical signals as redirects (strong), then `rel=canonical` (strong), then sitemap inclusion (weak). All of them are preferences, not directives. Use absolute URLs and link internally to the canonical. Never use robots.txt or `noindex` to canonicalise. Pick one trailing-slash form and stick to it: `/a` and `/a/` are different URLs, though the bare host with or without a slash is the same.

### Cited Findings

- Signal order: redirects are "A strong signal that the target of the redirect should become canonical". `rel="canonical"` comes next. Sitemaps are "A weak signal". Combining methods "will increase the chance of your preferred canonical URL appearing in search results." Page last updated **2026-07-10**. — [Google: Consolidate duplicate URLs](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- Google "prefers HTTPS pages over equivalent HTTP pages as canonical" unless something is wrong, such as an invalid certificate or HTTPS-to-HTTP redirects. For hostname variants, pick one and redirect the others to it. — [Google: consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- Don't canonicalise with robots.txt: "Google may still index URLs that are disallowed in robots.txt without their content." Don't use `noindex` to choose a canonical within a site; it "will completely block the page from Search". — [Google: consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- Use absolute URLs in `rel=canonical`, since relative paths "can cause problems in the long run". Link internally to the canonical. Google may still choose a different canonical by content similarity. — [Google: consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- Sitemaps should list the preferred canonical URL only, and use absolute URLs. — [Google: Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- **CHANGES:**
  - 2024-02-15: `rel=canonical` annotations with certain attributes are not used for canonicalisation.
  - 2025-12-17: canonicalisation best practices added for JavaScript sites.
  - 2026-07-10: clarified how long it takes Google to re-evaluate after canonical changes.
  - Source: [Google documentation updates](https://developers.google.com/search/updates)
- **Trailing slash** (staff statements, older than 2024, possibly stale): Mueller has said a trailing slash makes no difference after a hostname but does make a difference within a path, which can create duplicates. A secondhand 2019 report has him advising sites to be consistent and "try not to use both formats". — [SISTRIX: trailing slashes](https://www.sistrix.com/ask-sistrix/technical-seo/site-structure/what-are-trailing-slashes); [SE Roundtable: number of slashes doesn't matter (2018)](https://seroundtable.com/google-url-slashes-25779.html)
- The current consolidate-duplicates page itself does **not** address trailing slashes or cross-domain canonicals (as fetched). — [Google: consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

### Inferences

- For a static generator on Netlify or Firebase, these should all agree on one URL form: the canonical tag, sitemap `<loc>`, internal links, redirect targets, and what the host actually serves (slash or no slash, `.html` or extension-less). The host's behaviour, such as Netlify's pretty URLs or Firebase's `trailingSlash`/`cleanUrls`, decides which form returns 200 without a redirect.
- A canonical that points at a URL which redirects sends conflicting signals. Redirects outrank canonicals in Google's own ordering.

### Gaps

- Google's 2017 "To slash or not to slash" blog post returned 404 at both URL forms tried, so the first-party statement on trailing slashes was not re-read.
- The current first-party guidance on cross-domain canonicals was not located in this pass.

## 4. robots.txt, meta robots and X-Robots-Tag

### Takeaway

robots.txt controls **crawling**, not indexing. A disallowed URL can still be indexed and shown without a description. To keep a page out of search, use `noindex` (or a password). The page must stay crawlable, or Google never sees the `noindex`. Use X-Robots-Tag for PDFs and other non-HTML files. robots.txt is not security.

### Cited Findings

- robots.txt "tells search engine crawlers which URLs the crawler can access on your site". It exists to manage crawler traffic, not to keep pages out of results. A blocked page's "URL can still appear in search results" without a description. To keep a page out of search, use "password protection or noindex". Page last updated **2025-12-10**. — [Google: robots.txt intro](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- If robots.txt blocks a URL, its indexing rules (`noindex`) are ignored, so such URLs must remain crawlable. — [Google: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- X-Robots-Tag is the mechanism "to block indexing of non-HTML resources, such as PDF files, video files, or image files." Google also respects a robots meta tag in the body, not only in the head. — [Google: robots meta tag](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag)
- **CHANGES:**
  - 2024-10-02: `noarchive` moved to historical reference.
  - 2024-10-07: robots.txt fields not listed in the docs are unsupported. This means `crawl-delay` and similar fields are not supported by Google.
  - 2024-12-18: robots.txt error handling consolidated.
  - 2025-11-20: crawling docs, including the robots.txt spec, moved to a new crawling-infrastructure site (developers.google.com/crawling).
  - 2025-12-15: `noindex` in JavaScript-driven pages can behave unpredictably.
  - 2026-03-24: documented that robots meta tags outside `<head>` are processed (existing behaviour, newly documented).
  - Source: [Google documentation updates](https://developers.google.com/search/updates)
- Bing confirmed in July 2025 that `changefreq` and `priority` are ignored (see section 5). For robots.txt, Bing guidance was not readable in this pass.

### Inferences

- The most common small-site mistakes:
  - A staging `Disallow: /` that ships to production. It removes the site from crawling silently.
  - `Disallow` on a page that also carries `noindex`, which defeats the `noindex`.
  - Using robots.txt to "hide" private pages.
- A build that emits `robots.txt` should flag `Disallow: /`.

### Gaps

- Bing Webmaster Guidelines page content could not be fetched (it rendered only a title).

## 5. XML sitemaps, lastmod and IndexNow

### Takeaway

Google uses `lastmod` only when it is "consistently and verifiably" accurate. It **ignores `priority` and `changefreq`**, and so does Bing. The limits are 50,000 URLs or 50 MB uncompressed per file. Reference the sitemap with a `Sitemap:` line in robots.txt. Bing (July 2025) calls `lastmod` a key recrawl signal for AI-era search and recommends IndexNow alongside sitemaps. Google is **not** an IndexNow participant.

### Cited Findings

- `lastmod`: Google uses it only if "consistently and verifiably" accurate. It should reflect the last significant update, not trivial changes like a copyright year. "Google ignores `<priority>` and `<changefreq>` values." Limits are "50MB (uncompressed) or 50,000 URLs". URLs must be "fully-qualified, absolute URLs". Submit via Search Console, the API, a robots.txt `Sitemap:` line, or WebSub. Page last updated **2026-07-08**. — [Google: Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- The sitemap page as fetched lists no "ping" endpoint among the submission methods. (Inferred to be consistent with the ping endpoint's earlier deprecation; that deprecation itself was not re-sourced in this pass.) — [Google: Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- **Bing (July 2025, blog):** "The lastmod field in your sitemap remains a key signal, helping Bing prioritize URLs for recrawling and reindexing, or skip them entirely if the content hasn't changed". Bing recommends IndexNow for URL-level change notification alongside sitemaps. — [Bing Webmaster Blog, July 2025](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search)
- **Bing on lastmod and other tags** (trade press reporting of the same Bing guidance): don't set `lastmod` to the sitemap generation time unless the page changed. `changefreq` and `priority` are ignored. — [Search Engine Journal](https://beta.searchenginejournal.com/bing-recommends-lastmod-tags-for-ai-search-indexing/552642/); [Search Engine World](https://www.searchengineworld.com/bing-says-sitemaps-are-now-critical-in-the-ai-search-era)
- An older data point (2023, possibly stale): Bing's Fabrice Canel said 18% of sitemaps have wrongly set `lastmod`, typically the sitemap generation time. — [Search Engine Journal (2023 PubCon)](https://www.searchenginejournal.com/bings-ai-algorithm-insights-from-fabrice-canals-pubcon-keynote/481157/)
- **IndexNow participants:**
  - Endpoints listed: Amazon, Bing, Naver, Seznam.cz, Yandex, Yep, plus `api.indexnow.org`.
  - A submission to one endpoint "will be shared across all IndexNow-enabled search engines".
  - The key is 8–128 characters (letters, numbers, hyphens), in a `<key>.txt` file, ideally at the site root.
  - "Submitting a URL does not guarantee immediate indexing."
  - Google is not listed.
  - Source: [IndexNow FAQ](https://www.indexnow.org/faq)
- Google said in 2021 that it would _test_ IndexNow for sustainability. No adoption has been announced. A third-party guide says Google does not support it. — [Search Engine Land (2021, possibly stale)](https://searchengineland.com/google-is-testing-the-indexnow-protocol-for-sustainability-375932); [Nuxt SEO guide (undated)](https://nuxtseo.com/learn-seo/nuxt/launch-and-listen/indexnow)
- Image sitemaps may list `<image:loc>` URLs on other domains, such as a CDN. — [Google: Image SEO](https://developers.google.com/search/docs/appearance/google-images)
- **CHANGE (Bing, 2025):** Bing has increased its emphasis on `lastmod` and sitemaps for AI-powered search (July 2025). — [Bing Webmaster Blog](https://blogs.bing.com/webmaster/July-2025/Keeping-Content-Discoverable-with-Sitemaps-in-AI-Powered-Search)

### Inferences

- A static site generator should emit `lastmod` only from a real content-change date: a frontmatter date, or the source file's git commit date. Build time stamped on every page is exactly the inaccuracy both engines discount. Omitting `priority` and `changefreq` loses nothing.
- At 5–100 pages, size limits are irrelevant. One sitemap file plus a `Sitemap:` line in robots.txt is enough.
- IndexNow is optional and is a Bing-ecosystem benefit only. It needs a key file and a post-deploy ping, so it suits a deploy hook rather than the build.

### Gaps

- No primary Google statement on when the sitemap ping endpoint was retired was re-read here. Google's own announcement was not fetched.
- No confirmation of whether Google's IndexNow test formally ended.

## 6. Core Web Vitals in 2026

### Takeaway

The three metrics are **LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1** at the 75th percentile of page loads, measured separately for mobile and desktop. INP replaced FID in March 2024. Google says Core Web Vitals "are used by our ranking systems", but there is no single page-experience signal and relevance still wins. No 2025–2026 change to the metrics or thresholds was found.

### Cited Findings

- Good thresholds: LCP 2.5 s or less, INP 200 ms or less, CLS 0.1 or less. Measure the 75th percentile, segmented by mobile and desktop. A page passes if all three pass. Stable metrics won't change more than once a year, and changes are announced. web.dev page last updated **2024-10-31**. — [web.dev: Web Vitals](https://web.dev/articles/vitals)
- The "needs improvement / poor" boundaries (LCP 4 s, INP 500 ms, CLS 0.25) appear only in graphics on that page. The text fetch did not capture them, so treat these values as from prior knowledge and not verified here. — [web.dev: Web Vitals](https://web.dev/articles/vitals)
- **CHANGE (2024-03-12):** Google's docs updated so that INP replaced FID as a Core Web Vital. — [Google documentation updates](https://developers.google.com/search/updates)
- "Core Web Vitals are used by our ranking systems." Other page-experience aspects "don't directly help your website rank higher". "There is no single signal." "Google Search always seeks to show the most relevant content, even if the page experience is sub-par." Ranking is mostly page-level, though "we do have some site-wide assessments". The self-assessment asks about HTTPS, intrusive interstitials and mobile display. Page last updated **2026-09-22**. — [Google: Understanding page experience](https://developers.google.com/search/docs/appearance/page-experience)

### Inferences

- A lean static site with no heavy JavaScript typically passes CWV easily. The usual remaining risks:
  - An unsized hero image or late web-font swap, which hurts CLS.
  - A large unoptimised hero image, which hurts LCP.
  - Third-party embeds, which hurt INP.
- CWV is a tie-breaker-scale factor. It is not worth trading content quality for.
- Small sites often have too little traffic for CrUX field data, so Search Console's CWV report may show "not enough data". Lab tools (Lighthouse) are then the only measure.

### Gaps

- No 2025–2026 announcement of new or changed Core Web Vitals was found. The single search on this returned nothing relevant, which does not prove none happened.
- The CrUX minimum-traffic eligibility threshold was not sourced.

## 7. Mobile-first, HTTPS, status codes, redirects, images, links, URLs, headings, hreflang

### Takeaway

Mobile-first indexing is complete. Sites inaccessible on mobile stopped being indexed after 5 July 2024. HTTPS is preferred as canonical. Google treats 301 and 308 as equivalent, and 302/307 as temporary. It follows up to 10 redirect hops. Indexed URLs that return 4xx are dropped. Soft 404s are flagged in Search Console. Google says the number of h1s doesn't matter and neither does heading order. Keywords in URLs have "hardly any effect". Images must be in `<img src>`; CSS images aren't indexed.

### Cited Findings

- **Mobile-first:**
  - Google declared mobile-first indexing complete in October 2023, while continuing to reduce legacy desktop crawling. — [Google Search Central blog, Oct 2023](https://developers.google.com/search/blog/2023/10/mobile-first-is-here?hl=en)
  - Remaining sites moved to the smartphone crawler after 5 July 2024. Sites inaccessible on mobile would no longer be indexed. — [Search Engine Land](https://searchengineland.com/google-says-mobile-first-indexing-is-complete-after-almost-7-years-434011)
  - **CHANGE (2024-11-01):** sites with separate mobile pages must include all links on mobile. — [Google documentation updates](https://developers.google.com/search/updates)
- **HTTPS:** preferred as canonical over HTTP. Search Console has an HTTPS report. — [Google: consolidate duplicates](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls); [Google: page experience](https://developers.google.com/search/docs/appearance/page-experience)
- **Redirects:**
  - Permanent: 301, 308, instant meta refresh, JavaScript `location`. Temporary: 302, 303, 307, delayed meta refresh.
  - Permanent redirects signal that the target should become canonical; temporary ones don't.
  - Server-side redirects are preferred, meta refresh is the fallback, and JavaScript is the last resort.
  - Page last updated **2026-04-14**.
  - Source: [Google: Redirects and Google Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
- **Status codes:**
  - 301 is "Equivalent to `308`" for Google, though the two are semantically different, so use the right one for other clients.
  - "By default, Google's crawlers follow up to 10 redirect hops."
  - Indexed URLs returning 4xx "are removed from the index". Newly found 404s "aren't processed" and get crawled less over time.
  - 5xx and 429 slow crawling down.
  - A soft 404 is a success-status page showing "an empty page or an error message".
  - Page last updated **2026-02-04**.
  - Source: [Google crawling docs: HTTP status codes](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- **CHANGE (2025-12-18):** pages with non-200 status codes may not be sent to rendering. — [Google documentation updates](https://developers.google.com/search/updates)
- **Headings:**
  - The SEO Starter Guide says "it doesn't matter if you're using them out of order" and "there's also no magical, ideal amount of headings". It says nothing on the number of h1s. Page last updated **2025-12-10**. — [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
  - Staff statement (2019, possibly stale), Mueller: "Our systems don't have a problem when it comes to multiple H1 headings on a page." — [Search Engine Land](https://searchengineland.com/multiple-h1s-wont-get-in-the-way-of-your-seo-google-says-322909)
  - The title-link doc still advises making the main title the most prominent element, such as the first `<h1>`. — [Google: title links](https://developers.google.com/search/docs/appearance/title-link)
- **URLs:** "the keywords in the name of the domain (or URL path) alone have hardly any effect beyond appearing in breadcrumbs." Use words that are useful to users. IDs alone are less helpful. — [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- **URL CHANGES:**
  - 2024-07-05: fragment URL guidance clarified.
  - 2024-10-23: URL parameter best practices added.
  - 2025-06-18: URL structure doc reorganised.
  - 2026-10-23: hyphen vs underscore word separation clarified (hyphens have long been Google's recommendation; the exact new wording was not read).
  - Source: [Google documentation updates](https://developers.google.com/search/updates)
- **Other starter-guide myths and facts:**
  - "Google Search doesn't use the keywords meta tag."
  - Content length alone doesn't matter.
  - Duplicate content is "not a violation of our spam policies" and won't cause a manual action.
  - E-E-A-T is not a ranking factor.
  - The TLD matters only for country targeting.
  - Source: [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- **Links and anchor text:** "With appropriate anchor text, users and search engines can easily understand what your linked pages contain". **CHANGE (2024-01-10):** link best-practice docs were revised toward descriptive anchors. — [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide); [Google documentation updates](https://developers.google.com/search/updates)
- **Images:**
  - Use short, descriptive filenames, not `image1.jpg`.
  - Alt text should be useful and information-rich, without keyword stuffing.
  - Supported formats: BMP, GIF, JPEG, PNG, WebP, SVG, AVIF.
  - For `<picture>` and `srcset`, always include an `img` with a fallback `src`.
  - "Google doesn't index CSS images."
  - Page last updated **2026-03-02**.
  - Source: [Google: Image SEO best practices](https://developers.google.com/search/docs/appearance/google-images)
- **Image CHANGES:**
  - 2024-04-16: images are extracted only from `img src`.
  - 2025-05-12: reference image URLs consistently.
  - 2026-03-02: best practices added for specifying a preferred image via metadata for Search and Discover.
  - Source: [Google documentation updates](https://developers.google.com/search/updates)
- **Favicons (CHANGE, 2024-10-24):** 1:1 aspect ratio, minimum 8×8 px, 48×48 px recommended. **2026-08-28:** supported favicon formats listed explicitly. — [Google documentation updates](https://developers.google.com/search/updates)
- **Structured data deprecations relevant to course/training sites:**
  - **CHANGE (2025-09-09):** docs removed for Course Info, Learning Video and others.
  - 2025-11-05: Practice Problem and Dataset phased out; practice problem docs removed 2026-01-06.
  - **CHANGE (2026-05-08 / 06-15):** the FAQ rich result was deprecated, then its docs removed.
  - Source: [Google documentation updates](https://developers.google.com/search/updates)

### Inferences

- On Netlify or Firebase, configure redirects as host-level 301s (or 308s). Avoid meta-refresh pages. Keep chains to one hop.
- Serve a real 404 status for missing pages. A custom 404 page on Netlify (`404.html`) returns 404; on Firebase, `404.html` is served with 404 status. A static "page not found" served with 200 is a soft 404.
- One h1 per page is good practice for accessibility and for title-link clarity. It is not a Google ranking rule.
- Course and training sites should not count on Course-type rich results. Those structured data types were retired in 2025.
- hreflang applies only to multilingual sites. It was not researched further; the one item found was the 2025-06-11 removal of robots.txt advice for auto-translated pages.

### Gaps

- No primary Google statement on how long to keep redirects; the "at least a year" guidance was not on the redirects page as fetched.
- hreflang guidance was not researched (out of scope for most targets).
- Lazy-loading guidance (a separate Google page) was not read.

## 8. Search Console signals to check at launch

### Takeaway

From the docs read, the relevant Search Console surfaces for a new small site are:

- sitemap submission;
- the Page indexing report (including soft 404s and "crawled/discovered – not indexed");
- the HTTPS report;
- the Core Web Vitals report;
- URL Inspection for the canonical Google chose;
- Performance, which since mid-2025 includes AI Overviews and AI Mode data.

### Cited Findings

- Search Console is a sitemap submission route, alongside the API, robots.txt and WebSub. — [Google: Build a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- The HTTPS report shows pages not served over HTTPS. — [Google: page experience](https://developers.google.com/search/docs/appearance/page-experience)
- Soft 404s are flagged by Search Console. — [Google: HTTP status codes](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)
- **CHANGES:**
  - 2024-08-15: AI Overviews are counted in the Performance report.
  - 2025-06-16: AI Mode data counts toward Performance totals.
  - 2025-02-06: guidance on using Search Console with Google Analytics.
  - 2026-06-17: Change of Address covers www and non-www subdomain variants.
  - 2026-10-26: guidance on monitoring abuse in Search Console.
  - Source: [Google documentation updates](https://developers.google.com/search/updates)

### Inferences

- Launch checklist:
  1. Verify a Domain property, so all protocol and www variants are covered.
  2. Submit the sitemap.
  3. URL-inspect the home page and one deep page, and confirm the user-declared canonical matches Google's.
  4. Watch Page indexing over the first weeks for soft 404s, "Alternate page with proper canonical", and "Duplicate without user-selected canonical". These usually reveal slash or extension inconsistencies.
  5. Check the HTTPS report.
- Also verify the site in Bing Webmaster Tools. It can import from Search Console. That is the route to Bing, and through IndexNow-sharing and Bing's index, to the AI assistants that draw on Bing.

### Gaps

- No dedicated Google "launch checklist" document was fetched. The checklist above is an inference from the individual docs.
- The Search Console report names were not re-verified against current Search Console help pages in this pass.
- The last part of the Google updates changelog (pre-2024 entries) was not read.
