/**
 * @param {string|null|undefined} entry
 * @returns {string|null} the entry script's file, or null when there is none
 */
export function resolveEntry(entry: string | null | undefined): string | null;
export function createWatcher({ config, entry, rebuildSite, onChange, assetsChanged, helpersChanged, logger, }: {
    config: any;
    entry?: string;
    rebuildSite: any;
    onChange: any;
    assetsChanged: any;
    helpersChanged: any;
    logger: any;
}): {
    ready: Promise<any[]>;
    close: () => Promise<void>;
};
