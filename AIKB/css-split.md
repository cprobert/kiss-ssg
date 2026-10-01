# css-split.js

## Responsibility

Splits one stylesheet into a Sass entry plus one partial per section, without changing what it compiles to. Pure — no fs, no config, no logger, no knowledge of `Kiss`. The caller decides where the files go.

This is the **mechanical half** of converting a single-file site into a kiss one. The judgement half — what a section _is_, and what it is called — stays with the agent doing the conversion, which is why `sections` is an input rather than something this module infers. That split is the whole architectural claim of the module: parsing, segmenting, pretty-printing and proving the cascade did not move are things a person should never have to do by hand; naming the hero section is not.

**Why it exists, measured.** The one real precedent for this conversion — `Probert-Family/k9-solutions`, commit `cb0b5b2`, "Import K9 Solutions site into kiss-ssg" — turned one ChatGPT-generated page into 37 files: fifteen partials, a 213-line model, a config module. It carried the stylesheet across untouched: **14,120 bytes on 20 lines, longest line 1,803 characters, average 705**. Its own first line said so — `/* carried over from the original single-file site */`. Two later polish branches touched that file and neither split it; at HEAD it is still five lines over 1,000 characters, and the site uses no Sass at all despite kiss shipping first-class support for it. The markup half of "handoverable to a web developer without a rewrite" was kept. The styles half was not.

## Public interface

- `parseStylesheet(src)` → `CssNode[]`. Recursive, so a rule inside `@media` is a `rule` node like any other. Also re-exported from `lib/kiss.js`.
- `formatNodes(nodes, depth)` → readable source, newline-terminated. A selector list goes one-per-line.
- `classNames(selector)` → the class names a selector mentions, in source order, without the dot.
- `sectionFor(selector, sections)` → the section a selector belongs to, or `null`. Longest section name wins.
- `segmentNodes(nodes, sections, minNodes)` → `CssSegment[]`, contiguous and in order.
- `splitStylesheet(css, { sections, entryName, banner, minNodes })` → `{ entry, partials, stats }`. Also re-exported from `lib/kiss.js`.
- The `CssNode`, `CssSegment` and `CssSplitResult` typedefs.

## Depends on

Nothing. No imports at all — not even `node:` builtins.

## Depended on by

`lib/kiss.js`, for the re-export only. Nothing in the build pipeline calls it; it is a tool a conversion reaches for, not a step a build runs.

## Non-obvious behavior

- **A segment is a CONTIGUOUS RUN, and that is the module's load-bearing decision.** CSS is cascade-ordered, so `.btn` defined before `.hero .btn` is not the same stylesheet as the reverse. Grouping by selector _across_ the file — collecting every `.hero` rule into `_hero.scss` wherever it appeared — reads better and silently changes what the page looks like. Here, segment _n_ holds only nodes that appeared before every node in segment _n+1_, the entry `@use`s them in cut order, and sass emits a module's CSS where it is first loaded. Concatenation therefore reproduces the original node order exactly, which is what makes losslessness provable rather than hoped for.

- **Merging same-named runs is the one change to never make**, and it is the first thing anyone reading the output asks for. It was tried on this branch and watched fail three tests, `preserves cascade order when a section recurs after another` among them. A section whose rules appear in two places yields `_hero.scss` and `_hero-2.scss`: a true report of how the stylesheet is written, not a defect to paper over. **A suffix never takes a name a section already has.** With sections `hero`, `other`, `hero`, `hero-2`, a per-base counter gave the repeat `hero-2` and then the real `hero-2` the same name — one file overwritten on disk and a duplicate `@use` Sass refuses (Codex review, 2026-10-01). Every section's own name is reserved first, so the repeat becomes `_hero-3.scss`. The entry's name is taken too: `site.scss` beside `_site.scss` makes `@use 'site'` ambiguous and Sass refuses it, so a section called `site` is written as `_site-2.scss` (Codex, the next round).

- **The partials are SCSS, so every `#{` is written as `#{"#"}{`.** SCSS interpolates `#{…}` inside quoted strings, custom properties, `url()` and comments, where CSS treats it as text: `content:"#{1+1}"` compiled to `content:"2"` (Codex review, 2026-10-01). `#{"#"}{` is an interpolation evaluating to `#` followed by a literal `{`, and was measured on dart-sass compiling back to exactly `#{` in all of those positions. `#\{` works in a string and is a parse error in a custom property; compiling the partials as plain CSS is no way out either, since dart-sass refuses `#{` in CSS syntax. **The tests compile the original as plain CSS** (`syntax: 'css'`), never as SCSS, because compiling both sides as SCSS reads the Sass syntax the same wrong way on both and hid exactly this.

- **A custom property's value may hold braces.** `--x: { a: b }` and `--x: #{1+1}` are legal CSS; when the scanner is at `--name:` it counts `{ }` as part of the value. Without that, `--x:#{1+1}` was parsed as a rule.

- **A backslash escapes the next character outside a string as well as inside one.** `.foo\{bar` is the class `foo{bar`; both scanners read the `\{` as a block opening and the split compiled to a different selector (Codex review, 2026-10-01). `skipString` always skipped escapes; `scanToStructural` and `findBlockEnd` now do too.

- **Coalescing short runs is the one reshaping that _is_ safe**, because it merges segments that are already adjacent. `minNodes` (default 3) folds a run below that size into its predecessor; a short _leading_ run has no predecessor, so it takes the name of what follows instead of leaving a one-rule `_base.scss` at the top. This exists because of a measurement, not a hunch: the first run against the real precedent offered element-level names (`kicker`, `stars`, `field`) as if they were sections and got **51 partials** back, several holding one rule — a different way of being unreadable. With page-level names and `minNodes: 3` the same input gives **19 partials, longest line 82 characters**, compiling byte-identically.

- **Strings and comments are skipped atomically, because both can contain a brace.** `content: "}"` and `/* } */` are the two inputs that break every naive brace counter, and the second is everywhere in minified CSS. Paren depth is tracked alongside, because `url(` is the one place CSS allows an unquoted value carrying a `;` or a `:` — a data URI for an inline SVG carries both.

- **A declaration splits on its FIRST colon.** `background: url(a:b)` and `grid-template-areas: "a:b"` both carry a later one.

- **A custom property's value is kept raw, and printed with no space after the colon.** CSS preserves a custom property's value as a token stream and sass does not normalise the whitespace inside one the way it does a real declaration's. Trimming it and re-printing `--ink: #111` for a source of `--ink:#111` therefore _survives compilation_ and makes the output differ from the input by a byte. This was caught by the losslessness test on its first run, and fixing it rather than loosening the assertion is what lets that test compare bytes instead of something fuzzier.

- **A top-level `@media` touching more than one section is _named_ `responsive`, whole.** Distributing its rules into the section partials would read better — a developer editing `.hero` would see its breakpoints — and would reorder the cascade, because those rules currently come last. A block touching exactly one section joins that section, where it is both safe and useful.

  **It does not always reach a `_responsive.scss` file, and this doc said it did.** Naming happens before coalescing, so a media block that is one node — which is the usual shape, one `@media` at the foot of a stylesheet — is shorter than the default `minNodes: 3` and is folded into whatever partial precedes it. A clean-room run measured exactly that: the page's single breakpoint block landed at the bottom of `_footer-bar.scss`, where a developer editing the footer finds the whole site's breakpoints. Pass `minNodes: 1` to keep it separate. The two documented behaviours interact, the fold wins, and the previous wording promised the file unconditionally.

- **`sections` matches CSS class names, not the names you gave the regions.** This is the module's sharpest edge in use, because the two are the same word often enough to hide the difference. `splitDocument` tells you to rename `top` to `hero`; this takes whatever the selectors actually say, which on a real page is as likely to be `.lede`. Handed the semantic names instead, it matches nothing, every rule falls into one run and the output is a single `_base.scss` — with no error, because "no section matched" is indistinguishable from "one section, correctly". `splitDocument`'s regions carry a `classes` array for exactly this: `sections: regions.flatMap((r) => r.classes)`.

- **Block-less at-rules (`@import`, `@charset`) are forced to `base`**, which is cut first, because they must stay at the top of the output and a partial `@use`d fifth is not the top.

- **A selector list is cut only at its top-level commas.** A comma inside a string, `( )` or `[ ]` separates nothing. A bare `.split(',')` put a newline inside `a[title="x, y"]` — an unescaped newline in a CSS string is a bad-string token, so the rule failed to compile or was dropped — and re-spaced `:is(.a, .b)`, against a module whose claim is that it compiles byte-identically. `splitSelectorList` tracks quotes, escapes and bracket depth, and trims only at the cut.

- **A comment-only run is attached to the segment before it, not given a file.** A banner comment introduces what follows, but it is cut as its own run by the name change it precedes; the fold puts it back.

- **The output is bigger than the input, and that is the point.** 14,120 bytes in became 17,898 out on the precedent. Pretty-printing costs ~27%; the file that ships is the _compiled_ `site.css`, which is byte-identical.

## Checked against upstream

The alternative considered and rejected is a CSS parser dependency (postcss). `AIKB/upstream.md` records it: the grammar that matters here is small, the module's value is partly that whoever inherits the site can audit it, and adding a parser to a package whose pitch is "nothing to learn before the first page" would buy correctness on CSS nobody in this corpus writes at the cost of a dependency on every install.
