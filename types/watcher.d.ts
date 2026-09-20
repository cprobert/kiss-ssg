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
export function isInside(dir: any): (p: any) => boolean;
