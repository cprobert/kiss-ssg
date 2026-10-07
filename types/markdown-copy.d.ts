/**
 * The Markdown copy's path for a page's output path: the trailing `.html` (or
 * `.htm`) swapped for `.md`. Anything else is not an HTML page and has no copy.
 *
 * @param {string} htmlPath a page's output path, build-relative or absolute
 * @returns {string|null}
 */
export function markdownCopyPath(htmlPath: string): string | null;
/**
 * Converts a written page to Markdown: the element `selector` matches (the
 * page's `<main>` by default), or `<body>` when nothing matches or the match
 * converts to nothing, with navigation, scripts and styles removed. Every href
 * is kept as the page wrote it.
 *
 * @param {string} html the page's bytes, as written
 * @param {{ selector?: string }} [options]
 * @returns {Promise<string>} the Markdown, ending in exactly one newline
 * @throws naming `config.markdownCopies.selector` when it is not valid CSS
 */
export function toMarkdown(html: string, { selector }?: {
    selector?: string;
}): Promise<string>;
