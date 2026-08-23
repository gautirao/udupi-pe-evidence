/**
 * housing-scraper-udupi
 *
 * Scrapes real housing.com "buy" (sale) search-result pages for a set of
 * locality/city start URLs, extracting individual resale listings (not
 * multi-unit builder projects) with genuine coordinates read from the
 * page's own JSON-LD structured data.
 */

import { PlaywrightCrawler } from '@crawlee/playwright';
import { Actor } from 'apify';
import { setTimeout as sleep } from 'node:timers/promises';

import { router } from './routes.js';

interface Input {
    startUrls: { url: string }[];
    maxPagesPerStartUrl?: number;
    maxRequestsPerCrawl?: number;
    minRequestDelaySecs?: number;
    maxRequestDelaySecs?: number;
}

await Actor.init();

const {
    startUrls = [],
    maxPagesPerStartUrl = 5,
    maxRequestsPerCrawl = 60,
    minRequestDelaySecs = 3,
    maxRequestDelaySecs = 7,
} = (await Actor.getInput<Input>()) ?? ({} as Input);

if (!startUrls.length) {
    throw new Error('No startUrls provided. Supply at least one housing.com /in/buy/... search-result URL.');
}

const proxyConfiguration = await Actor.createProxyConfiguration({
    groups: ['RESIDENTIAL'],
});

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxRequestsPerCrawl,
    maxConcurrency: 2,
    requestHandlerTimeoutSecs: 90,
    navigationTimeoutSecs: 60,
    requestHandler: router,
    launchContext: {
        launchOptions: {
            args: ['--disable-gpu'],
        },
    },
    preNavigationHooks: [
        async () => {
            const delayMs = (minRequestDelaySecs + Math.random() * Math.max(0, maxRequestDelaySecs - minRequestDelaySecs)) * 1000;
            await sleep(delayMs);
        },
    ],
});

Actor.on('aborting', async () => {
    await sleep(1000);
    await Actor.exit();
});

const initialRequests = startUrls.map(({ url }) => ({
    url,
    userData: { pageNum: 1, maxPagesPerStartUrl, baseUrl: url },
}));

await crawler.run(initialRequests);

await Actor.exit();
