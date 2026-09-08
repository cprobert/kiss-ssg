export class DependencyGraph {
    /** @type {Map<string, Set<string>>} partial name → page keys @private */
    private _dependents;
    /** @type {Map<string, Set<string>>} page key → partial names @private */
    private _uses;
    /**
     * @param {string} page the page's key — its `buildTo`
     * @param {string} partial the partial's registered name
     */
    record(page: string, partial: string): void;
    /** @param {string} page */
    clearPage(page: string): void;
    clear(): void;
    /**
     * @param {string} partial
     * @returns {string[] | null} sorted page keys, or `null` if never recorded
     */
    dependentsOf(partial: string): string[] | null;
    /**
     * @param {string} page
     * @returns {string[]} sorted partial names
     */
    usesOf(page: string): string[];
    /** @returns {number} how many partials are known */
    get size(): number;
    /** @returns {Record<string, string[]>} `{ [partial]: pages }`, both sorted */
    toJSON(): Record<string, string[]>;
}
