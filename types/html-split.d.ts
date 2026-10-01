/**
 * Parses an HTML document or fragment into a node tree.
 *
 * Deliberately not a conforming parser: it does not imply omitted tags, fix
 * mis-nesting or build a `<tbody>` nobody wrote. The input this exists for is
 * machine-written — a Claude or ChatGPT artifact, an exported page — which is
 * well-formed and explicitly closed. A stray close tag is dropped rather than
 * restructuring the tree around it, so malformed input degrades into a flatter
 * cut rather than a wrong one.
 *
 * @param {string} src
 * @returns {HtmlNode[]}
 */
export function parseHtml(src: string): HtmlNode[];
/**
 * The value of one attribute on a node, read from the raw attribute text.
 *
 * @param {HtmlNode} node
 * @param {string} name
 * @returns {string} empty when absent
 */
export function attr(node: HtmlNode, name: string): string;
/**
 * Renders nodes back to HTML.
 *
 * Re-indents only where it cannot change rendering: an element whose children
 * are all elements or comments. With any significant text among them the
 * children are emitted verbatim on one line, because collapsing or inserting
 * whitespace around inline content changes what the page looks like. That is
 * why the output of a conversion is structured at the block level and untouched
 * inside a paragraph — which is also how a person would have done it.
 *
 * @param {HtmlNode[]} nodes
 * @param {number} [depth]
 * @param {{ escapeExpressions?: boolean }} [options] `escapeExpressions`
 * defaults to **true**: `{{` is rewritten as `\{{` everywhere it is emitted —
 * text, attributes, comments and raw text alike, because Handlebars compiles
 * the whole file. Pass `false` only for a document you wrote and intend to
 * carry template syntax.
 * @returns {string}
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
 * @returns {{ regions: HtmlRegion[], wrappedInMain: boolean }}
 */
export function findRegions(nodes: HtmlNode[]): {
    regions: HtmlRegion[];
    wrappedInMain: boolean;
};
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
 * @property {{ styles: string[], scripts: { src: string, content: string }[] }} assets
 * @property {HtmlRegion[]} regions the named regions, for a caller that wants to report them
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
     * lower-cased tag name
     */
    tag?: string;
    /**
     * the opening tag's attribute text, exactly as written
     */
    attrs?: string;
    children?: HtmlNode[];
    /**
     * text, comment or doctype content
     */
    text?: string;
    /**
     * set on the single text child of a raw-text element
     */
    raw?: boolean;
    /**
     * written as `<tag/>` and not a void element —
     * the SVG spelling, which has to survive serialisation
     */
    selfClosed?: boolean;
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
    /**
     * the class names on the region's root element, which
     * are what `splitStylesheet`'s `sections` matches on — see `findRegions`
     */
    classes: string[];
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
    assets: {
        styles: string[];
        scripts: {
            src: string;
            content: string;
        }[];
    };
    /**
     * the named regions, for a caller that wants to report them
     */
    regions: HtmlRegion[];
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
