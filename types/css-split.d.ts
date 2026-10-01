/**
 * Parses stylesheet source into a node tree. Pure, and recursive through
 * blocks, so a rule inside `@media` is a `rule` node like any other.
 *
 * @param {string} src
 * @returns {CssNode[]}
 */
export function parseStylesheet(src: string): CssNode[];
/**
 * Renders nodes back to readable stylesheet source.
 *
 * A selector list is broken one-per-line because minified CSS routinely puts
 * eight selectors on one line, and a reviewer reading a diff needs to see which
 * one changed.
 *
 * @param {CssNode[]} nodes
 * @param {number} [depth] indentation level
 * @returns {string} newline-terminated when non-empty
 */
export function formatNodes(nodes: CssNode[], depth?: number): string;
/**
 * The class names a selector list mentions, in source order.
 *
 * @param {string} selector
 * @returns {string[]} without the leading dot
 */
export function classNames(selector: string): string[];
/**
 * The section a selector belongs to, or `null`.
 *
 * A selector matches a section when any class it mentions equals the section
 * name or begins with it followed by `-` — `.hero`, `.hero-copy` and
 * `.hero-photo` all belong to `hero`, which is how a hand-written stylesheet
 * for a componentised page is actually named.
 *
 * @param {string} selector
 * @param {string[]} sections
 * @returns {string|null}
 */
export function sectionFor(selector: string, sections: string[]): string | null;
/**
 * Cuts the node list into contiguous, named segments.
 *
 * Order is never changed: segment _n_ holds nodes that appeared before every
 * node in segment _n+1_. A section whose rules appear in two separate places
 * yields two segments with the same base name, which `splitStylesheet`
 * disambiguates — that is a true report of how the stylesheet is written, not a
 * defect to paper over by merging them and moving the cascade.
 *
 * @param {CssNode[]} nodes
 * @param {string[]} [sections]
 * @param {number} [minNodes] runs smaller than this are folded into the
 * neighbouring segment; merging ADJACENT segments is the only reshaping that
 * cannot move the cascade, which is why this is the one knob offered
 * @returns {CssSegment[]}
 */
export function segmentNodes(nodes: CssNode[], sections?: string[], minNodes?: number): CssSegment[];
/**
 * Splits a stylesheet into a Sass entry plus one partial per segment.
 *
 * The entry is nothing but `@use` lines, in cut order. kiss compiles every
 * non-underscore `.scss` under `folders.assets` and skips partials
 * (`lib/assets.js`), so the output drops into `src/assets/css/` and builds with
 * no config change.
 *
 * @param {string} css the stylesheet source
 * @param {Object} [options]
 * @param {string[]} [options.sections] section names from the HTML decomposition
 * @param {string} [options.entryName] the entry's basename, default `site`
 * @param {string} [options.banner] a comment placed at the top of the entry
 * @param {number} [options.minNodes] smallest run that earns its own file,
 * default 3 — see `segmentNodes`
 * @returns {CssSplitResult}
 */
export function splitStylesheet(css: string, options?: {
    sections?: string[];
    entryName?: string;
    banner?: string;
    minNodes?: number;
}): CssSplitResult;
/**
 * One top-level item in a stylesheet.
 *
 * `decl` only ever appears inside a block. `at` carries `children: null` for
 * the block-less forms (`@import`, `@charset`), which is what distinguishes
 * `@import url(x);` from `@media print {}`.
 */
export type CssNode = {
    type: "rule" | "at" | "decl" | "comment";
    /**
     * a rule's selector list, or an at-rule's `@name params`
     */
    prelude?: string;
    /**
     * block contents, or `null` for a block-less at-rule
     */
    children?: CssNode[] | null;
    /**
     * a declaration's property
     */
    prop?: string;
    /**
     * a declaration's value
     */
    value?: string;
    /**
     * a comment's full text, delimiters included
     */
    text?: string;
};
export type CssSegment = {
    /**
     * the partial's name, without the leading underscore
     */
    name: string;
    /**
     * the contiguous run this segment covers
     */
    nodes: CssNode[];
};
export type CssSplitResult = {
    /**
     * the stylesheet that `@use`s the rest
     */
    entry: {
        name: string;
        content: string;
    };
    /**
     * one per segment, `_name.scss`
     */
    partials: {
        name: string;
        content: string;
    }[];
    stats: {
        nodes: number;
        segments: number;
        longestLine: number;
        bytesIn: number;
        bytesOut: number;
    };
};
