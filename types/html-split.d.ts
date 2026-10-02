/**
 * @typedef {Object} HtmlNode
 * @property {'element'|'text'|'comment'|'doctype'} type
 * @property {string} [tag] lower-cased tag name — what every decision keys on
 * @property {string} [name] the tag name AS WRITTEN, present only when it differs
 * from `tag`. Case matters inside `<svg>`: `<linearGradient>` is not
 * `<lineargradient>`
 * @property {string} [open] the opening tag exactly as the source wrote it,
 * `<` to `>` — empty for an element a stray close tag implied
 * @property {string} [close] the closing tag exactly as written, or empty when
 * the source wrote none: a void element, a self-closed one inside `<svg>`, or
 * one closed by its parent or by the end of the document
 * @property {Record<string, string>} [attribs] the attributes, as the parser
 * read them — names lower-cased, values undecoded. Read with `attr()`; never
 * printed, because `open` is
 * @property {HtmlNode[]} [children]
 * @property {string} [text] text, comment or doctype source, exactly as written
 * @property {boolean} [raw] set on text inside a raw-text element, where it is
 * not markup and whitespace is never a gap
 */
/**
 * @typedef {Object} HtmlRegion
 * @property {'chrome'|'section'} kind where the region belongs — the layout, or the page
 * @property {string} tag
 * @property {string} name the proposed partial name
 * @property {HtmlNode} node
 */
/**
 * Parses an HTML document or fragment into a node tree.
 *
 * THE TOKENIZER IS htmlparser2's, AND THE TREE IS MADE OF SOURCE SLICES. Until
 * 2026-10-02 this was a hand-rolled scanner, and roughly half of what five
 * review rounds found was that scanner's reading of HTML differing from a
 * browser's: a `<` before a non-letter, `/>` on an HTML element, an apostrophe
 * in an unquoted value, attributes read by a regex that matched text inside
 * another attribute's quotes. htmlparser2 is a maintained tokenizer that
 * reads those the way the HTML spec does, and — unlike parse5 — never adds an
 * `<html>`, `<body>` or `<tbody>` the page did not write, which is what a
 * conversion that gives back what it was given needs. Recorded in
 * `AIKB/upstream.md`.
 *
 * Two choices make the tree lossless whatever the tokenizer decides:
 *
 *   1. Every tag is kept as the exact source text that spelled it (`open`,
 *      `close`), and printed from there. Quoting, attribute order, case, a
 *      trailing `/`, a malformed close tag — all of it is the source's own
 *      bytes, never re-serialised.
 *   2. Any source the tokenizer reports no event for is kept as text. It does
 *      drop malformed input silently — `</ x>`, a trailing unfinished `<b` —
 *      so every gap between two events is filled from the source. Each byte of
 *      the document belongs to exactly one node, by construction.
 *
 * What the tokenizer still decides is the STRUCTURE: which element a node
 * sits in. It closes a `<p>` at the next `<div>` and an `<li>` at the next
 * `<li>`, as a browser does; such an element simply has no `close`.
 *
 * @param {string} src
 * @returns {HtmlNode[]}
 */
export function parseHtml(src: string): HtmlNode[];
/**
 * The value of one attribute on a node, as the parser read it — so a
 * `class='site-header'` written INSIDE another attribute's quoted value is
 * text, not an attribute. The regex this replaced matched it, and classed a
 * hero as page furniture (Codex review, 2026-10-02).
 *
 * @param {HtmlNode} node
 * @param {string} name
 * @returns {string} empty when absent
 */
export function attr(node: HtmlNode, name: string): string;
/**
 * Renders nodes back to HTML.
 *
 * THE PRINTER NEVER ADDS WHITESPACE. A line break and indent are written only
 * where the source already had whitespace between two nodes; where it had
 * none, the nodes stay touching on one line. Collapsible whitespace renders
 * the same however much of it there is, so swapping one run of it for a
 * newline and an indent cannot change the page — but putting whitespace
 * where there was none can, for any element CSS makes inline-level, and the
 * markup cannot say which those are. Every earlier rule here tried to say:
 * "re-indent unless the children are inline", with a list of inline elements
 * that each review round found incomplete (`<svg>`, `<input>`, SVG `<text>`,
 * an inline-block `<li>` nobody had flagged yet). The operator chose
 * construction over the list (2026-10-01).
 *
 * Text is emitted exactly as written, and so is everything inside an element
 * whose whitespace renders (`keepsWhitespace`) — there even a gap is content.
 *
 * What it costs: a minified source stays dense. Its structure is still cut
 * into a layout, partials and a page view; inside a partial, a formatter is
 * the caller's deliberate, separate step.
 *
 * @param {HtmlNode[]} nodes
 * @param {number} [depth]
 * @param {{ escapeExpressions?: boolean }} [options] `escapeExpressions`
 * defaults to **true**: `{{` is rewritten as `\{{` everywhere it is emitted —
 * text, attributes, comments and raw text alike, because Handlebars compiles
 * the whole file. Pass `false` only for a document you wrote and intend to
 * carry template syntax.
 * @returns {string} the first line indented to `depth`
 */
export function serializeNodes(nodes: HtmlNode[], depth?: number, options?: {
    escapeExpressions?: boolean;
}): string;
/**
 * Every `{{…}}` the source document carries, as short excerpts. Reported on
 * the split so a caller cannot escape them without being told they were there
 * — an Alpine page and a hostile one look identical at this layer, and only
 * the author knows which they have.
 *
 * @param {HtmlNode[]} nodes
 * @returns {string[]}
 */
export function findExpressions(nodes: HtmlNode[]): string[];
/**
 * Finds a descendant element by tag, breadth-first.
 *
 * @param {HtmlNode[]} nodes
 * @param {string} tag
 * @returns {HtmlNode|null}
 */
export function findTag(nodes: HtmlNode[], tag: string): HtmlNode | null;
/**
 * A kebab-case partial name for a region: its `id`, else its first class, else
 * its tag. The proposal is what a caller renames rather than what it must
 * accept — `nameRegions` is exported so a skill can read the suggestions,
 * correct the ones that read like markup rather than meaning, and hand them
 * back through `splitDocument`'s `names`.
 *
 * @param {HtmlNode} node
 * @returns {string}
 */
export function suggestName(node: HtmlNode): string;
/**
 * Whether a region is page furniture (goes in the layout) or content (goes in
 * the page view).
 *
 * @param {HtmlNode} node
 * @returns {'chrome'|'section'}
 */
export function regionKind(node: HtmlNode): "chrome" | "section";
/**
 * The body's top-level regions, in order.
 *
 * `<main>` is unwrapped rather than kept as one region: a page that wraps its
 * content in `<main>` has exactly one region otherwise, which is the whole
 * point of the cut defeated. The layout emits `<main>` around the content block
 * instead, which is where it belongs on every page rather than on this one.
 *
 * @param {HtmlNode[]} nodes a parsed document
 * @returns {{ regions: HtmlRegion[], wrappedInMain: boolean, container:
 * HtmlNode[], main: HtmlNode|undefined, body: HtmlNode|null }} `container` is
 * the stream the body's children stand in (see `bodyNodesOf`) and `main` is
 * the single `<main>` that was unwrapped, if there was exactly one. Both are
 * returned rather than recomputed by the caller: `splitDocument` has to walk
 * the same stream and unwrap the same element, and deriving them twice is how
 * a `<script>` inside `<main>` came to be deleted.
 */
export function findRegions(nodes: HtmlNode[]): {
    regions: HtmlRegion[];
    wrappedInMain: boolean;
    container: HtmlNode[];
    main: HtmlNode | undefined;
    body: HtmlNode | null;
};
/**
 * The nodes that stand for the body's children.
 *
 * `<body>` is optional in HTML and `parseHtml` does not imply one, so a
 * document can put its content straight inside `<html>` — or, as a fragment,
 * at the top level. Reaching for `findTag(nodes, 'body')` and falling back to
 * the document root broke both: with no `<body>`, the root's only element is
 * `<html>` itself, so the whole document became a single region and the
 * layout wrapped a second copy of it (doctype included) inside a synthesised
 * `<body>`. Falling through `<html>` instead is what a browser does.
 *
 * @param {HtmlNode[]} nodes a parsed document
 * @returns {HtmlNode[]}
 */
export function bodyNodesOf(nodes: HtmlNode[]): HtmlNode[];
/**
 * Applies caller-supplied names over the proposals, and makes the result
 * unique — two `<section class="band">` elements would otherwise overwrite one
 * partial with the other.
 *
 * @param {HtmlRegion[]} regions
 * @param {(string|null)[]|Record<number, string>} [names] by index; `null` or a
 * missing entry keeps the proposal
 * @returns {HtmlRegion[]}
 */
export function nameRegions(regions: HtmlRegion[], names?: (string | null)[] | Record<number, string>): HtmlRegion[];
/**
 * @typedef {Object} HtmlSplitResult
 * @property {{ name: string, content: string }} layout
 * @property {{ name: string, content: string }} page
 * @property {{ name: string, content: string }[]} partials paths relative to `folders.partials`
 * @property {{ styles: string[], scripts: { attrs: string, type: string, content: string }[] }} assets
 * inline `<style>` text, and every src-less `<script>` with its raw attribute
 * text and its lower-cased `type` (`''` for a classic script) — `module`,
 * `application/ld+json` and `importmap` are not lifted the same way
 * @property {HtmlRegion[]} regions the named regions, for a caller that wants to report them
 * @property {string[]} warnings things the conversion could not do losslessly
 * and did anyway, each a whole sentence. Empty for every ordinary document;
 * non-empty means read it before shipping
 * @property {string[]} expressions every `{{…}}` the SOURCE document carried, as
 * excerpts — see `findExpressions`. Non-empty means the input contains template
 * syntax, which is either another framework's interpolation or an injection;
 * only the author can tell which, so it is reported rather than judged
 * @property {{ regions: number, chrome: number, sections: number }} stats
 */
/**
 * Splits a single-file document into a kiss layout, page view and partials.
 *
 * @param {string} html
 * @param {Object} [options]
 * @param {(string|null)[]} [options.names] per-region names overriding the proposals
 * @param {string} [options.layoutName] default `layout`
 * @param {string} [options.pageName] default `index`
 * @param {boolean} [options.escapeExpressions] default `true` — see
 * `serializeNodes`. Leave it on unless you wrote the document yourself and mean
 * its `{{…}}` to be compiled by kiss.
 * @returns {HtmlSplitResult}
 */
export function splitDocument(html: string, options?: {
    names?: (string | null)[];
    layoutName?: string;
    pageName?: string;
    escapeExpressions?: boolean;
}): HtmlSplitResult;
export type HtmlNode = {
    type: "element" | "text" | "comment" | "doctype";
    /**
     * lower-cased tag name — what every decision keys on
     */
    tag?: string;
    /**
     * the tag name AS WRITTEN, present only when it differs
     * from `tag`. Case matters inside `<svg>`: `<linearGradient>` is not
     * `<lineargradient>`
     */
    name?: string;
    /**
     * the opening tag exactly as the source wrote it,
     * `<` to `>` — empty for an element a stray close tag implied
     */
    open?: string;
    /**
     * the closing tag exactly as written, or empty when
     * the source wrote none: a void element, a self-closed one inside `<svg>`, or
     * one closed by its parent or by the end of the document
     */
    close?: string;
    /**
     * the attributes, as the parser
     * read them — names lower-cased, values undecoded. Read with `attr()`; never
     * printed, because `open` is
     */
    attribs?: Record<string, string>;
    children?: HtmlNode[];
    /**
     * text, comment or doctype source, exactly as written
     */
    text?: string;
    /**
     * set on text inside a raw-text element, where it is
     * not markup and whitespace is never a gap
     */
    raw?: boolean;
};
export type HtmlRegion = {
    /**
     * where the region belongs — the layout, or the page
     */
    kind: "chrome" | "section";
    tag: string;
    /**
     * the proposed partial name
     */
    name: string;
    node: HtmlNode;
};
export type HtmlSplitResult = {
    layout: {
        name: string;
        content: string;
    };
    page: {
        name: string;
        content: string;
    };
    /**
     * paths relative to `folders.partials`
     */
    partials: {
        name: string;
        content: string;
    }[];
    /**
     * inline `<style>` text, and every src-less `<script>` with its raw attribute
     * text and its lower-cased `type` (`''` for a classic script) — `module`,
     * `application/ld+json` and `importmap` are not lifted the same way
     */
    assets: {
        styles: string[];
        scripts: {
            attrs: string;
            type: string;
            content: string;
        }[];
    };
    /**
     * the named regions, for a caller that wants to report them
     */
    regions: HtmlRegion[];
    /**
     * things the conversion could not do losslessly
     * and did anyway, each a whole sentence. Empty for every ordinary document;
     * non-empty means read it before shipping
     */
    warnings: string[];
    /**
     * every `{{…}}` the SOURCE document carried, as
     * excerpts — see `findExpressions`. Non-empty means the input contains template
     * syntax, which is either another framework's interpolation or an injection;
     * only the author can tell which, so it is reported rather than judged
     */
    expressions: string[];
    stats: {
        regions: number;
        chrome: number;
        sections: number;
    };
};
