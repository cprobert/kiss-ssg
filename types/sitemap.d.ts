export function buildSitemapEntries(stack: any, { siteUrl, buildDir, now, trailingSlash }: {
    siteUrl: any;
    buildDir: any;
    now?: string;
    trailingSlash?: boolean;
}): any;
export function renderSitemapXml(urls: any): string;
export function writeSitemap(stack: any, { config, logger, outputs, overwrite }: {
    config: any;
    logger: any;
    outputs?: any;
    overwrite?: boolean;
}): Promise<{
    status: string;
    urls: any;
}>;
