/**
 * @typedef {'asset'|'generated'|'page'} OutputKind
 * @typedef {{owner: string, kind: OutputKind}} OutputClaim
 * @typedef {{file: string, producers: OutputClaim[], winner: OutputClaim|null, refused: string[]}} OutputCollision
 */
export class OutputRegistry {
    /** @param {{warn: (message: string) => void}} logger */
    constructor(logger: {
        warn: (message: string) => void;
    });
    logger: {
        warn: (message: string) => void;
    };
    /** @type {Map<string, OutputClaim>} */
    files: Map<string, OutputClaim>;
    /** @type {Map<string, OutputCollision>} */
    producers: Map<string, OutputCollision>;
    /** @type {Set<string>} */
    warned: Set<string>;
    /** @param {string} file */
    key(file: string): string;
    /**
     * @param {string} file
     * @param {OutputClaim|undefined} previous
     * @param {string} owner
     * @param {OutputKind} [kind]
     */
    collision(file: string, previous: OutputClaim | undefined, owner: string, kind?: OutputKind): void;
    /** @param {string} file @param {string} owner */
    canWriteAsset(file: string, owner: string): boolean;
    /** @param {string} file @param {string} owner @param {OutputKind} [kind] */
    claim(file: string, owner: string, kind?: OutputKind): void;
    /** @param {string} file @param {string} owner */
    owns(file: string, owner: string): boolean;
    /** @param {string} file @returns {string|null} */
    owner(file: string): string | null;
    /** @param {string} file @returns {OutputKind|null} */
    kind(file: string): OutputKind | null;
    /** Asset producers still registered for a released file.
     * @param {string} file
     * @returns {string[]}
     */
    assetOwners(file: string): string[];
    /** @param {string} owner @returns {boolean} */
    hasProducer(owner: string): boolean;
    /** @param {string} from @param {string} to */
    relocate(from: string, to: string): void;
    /** @param {string} file @param {string} owner */
    release(file: string, owner: string): void;
    /** Retire page producers, keeping their last-written bytes for the sweep. */
    beginPages(): void;
    /** Reconcile attempted asset outputs, including writes refused by another owner.
     * @param {string} owner
     * @param {Set<string>} current absolute output paths still produced by this copy
     */
    retain(owner: string, current: Set<string>): void;
    /** Drop live claims after discard; preserve build observations for its report.
     * @param {string} directory
     */
    clearUnder(directory: string): void;
    /** @returns {OutputCollision[]} detached collisions between active producers */
    snapshot(): OutputCollision[];
}
export type OutputKind = "asset" | "generated" | "page";
export type OutputClaim = {
    owner: string;
    kind: OutputKind;
};
export type OutputCollision = {
    file: string;
    producers: OutputClaim[];
    winner: OutputClaim | null;
    refused: string[];
};
