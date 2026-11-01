export function buildSitemapEntries(stack: any, { siteUrl, buildDir, trailingSlash, logger }: {
    siteUrl: any;
    buildDir: any;
    trailingSlash?: boolean;
    logger?: any;
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
