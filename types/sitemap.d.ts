export function buildSitemapEntries(stack: any, { siteUrl, buildDir, now }: {
    siteUrl: any;
    buildDir: any;
    now?: string;
}): any;
export function renderSitemapXml(urls: any): string;
export function writeSitemap(stack: any, { config, logger, overwrite }: {
    config: any;
    logger: any;
    overwrite?: boolean;
}): Promise<{
    status: string;
    urls: any;
}>;
