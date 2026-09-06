export function createWatcher({ config, entry, rebuildSite, onChange, assetsChanged, logger, }: {
    config: any;
    entry?: any;
    rebuildSite: any;
    onChange: any;
    assetsChanged: any;
    logger: any;
}): {
    ready: Promise<any[]>;
    close: () => Promise<void>;
};
export function isInside(dir: any): (p: any) => boolean;
