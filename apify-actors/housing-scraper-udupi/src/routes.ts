import { createPlaywrightRouter } from '@crawlee/playwright';

export const router = createPlaywrightRouter();

const CARD_SELECTOR = 'div.T_cardV1Style';
const RESALE_HREF_PATTERN = '/buy/resale/page/';

interface RawJsonLdItem {
    '@type'?: string | string[];
    url?: string;
    name?: string;
    address?: string;
    containedInPlace?: {
        name?: string;
        containedInPlace?: {
            name?: string;
            containedInPlace?: { name?: string };
        };
    };
    photo?: string;
    geo?: { latitude?: string; longitude?: string; address?: string };
}

interface CardRaw {
    href: string;
    text: string;
}

function extractListingId(url: string): string | null {
    // e.g. /in/buy/resale/page/20653972-residential-plot-in-tenkanidyoor-for-rs-2500000
    const m = url.match(/\/resale\/page\/(\d+)-/);
    return m ? m[1] : null;
}

function parseCardText(text: string) {
    const priceMatch = text.match(/₹\s*([\d,.]+)\s*(Cr|L)\b/);
    const avgPriceMatch = text.match(/Avg\.?\s*price:\s*₹\s*([\d,.]+)\s*(k)?\/sq\.ft/i);
    const areaMatch = text.match(/(?<!\/)\b([\d,]{3,7})\s*sq\.ft\b/);
    const areaTypeMatch = text.match(/(Builtup area|Plot area|Super Built-up area|Built-up area|Carpet area)/i);
    const facingMatch = text.match(/\b(North[- ]?East|North[- ]?West|South[- ]?East|South[- ]?West|North|South|East|West)\s+Facing\b/i);
    const possessionMatch = text.match(/Ready to move|Under Construction|(\d{1,2}(?:st|nd|rd|th)\s+\w+,?\s*\d{4})/);
    const distanceMatch = text.match(/([\d.]+)\s*km away/);
    const bhkMatch = text.match(/\b(\d+)\s*BHK\b/i);

    // title = first line after the badge (Resale/New Booking/Ready to move) up to price
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const titleLine = lines.find((l) => / in /i.test(l) && !/^Nearby|^Highlights/i.test(l)) ?? null;
    let propertyTypeRaw: string | null = null;
    let localityRaw: string | null = null;
    if (titleLine) {
        const [beforeIn, afterIn] = titleLine.split(/ in /i);
        propertyTypeRaw = beforeIn.replace(/^\d+\s*BHK\s*/i, '').trim();
        localityRaw = afterIn ? afterIn.trim() : null;
    }

    return {
        title: titleLine,
        propertyTypeRaw,
        localityRaw,
        bedrooms: bhkMatch ? Number(bhkMatch[1]) : null,
        priceValue: priceMatch ? Number(priceMatch[1].replace(/,/g, '')) : null,
        priceUnit: priceMatch ? priceMatch[2] : null,
        avgPricePerSqft: avgPriceMatch ? Number(avgPriceMatch[1].replace(/,/g, '')) * (avgPriceMatch[2] ? 1000 : 1) : null,
        areaValue: areaMatch ? Number(areaMatch[1].replace(/,/g, '')) : null,
        areaUnit: areaMatch ? 'sqft' : null,
        areaType: areaTypeMatch ? areaTypeMatch[1] : null,
        facing: facingMatch ? facingMatch[1] : null,
        possessionStatus: possessionMatch ? possessionMatch[0] : null,
        distanceKm: distanceMatch ? Number(distanceMatch[1]) : null,
    };
}

router.addDefaultHandler(async ({ request, page, log: reqLog, pushData, crawler }) => {
    const { pageNum = 1, maxPagesPerStartUrl = 5, baseUrl } = request.userData as {
        pageNum?: number;
        maxPagesPerStartUrl?: number;
        baseUrl?: string;
    };

    reqLog.info(`Fetching SRP page ${pageNum}`, { url: request.loadedUrl });

    try {
        await page.waitForSelector(CARD_SELECTOR, { timeout: 15000 });
    } catch {
        reqLog.warning('No listing cards found on page (zero results or blocked)', { url: request.loadedUrl });
        const bodyText = await page.innerText('body').catch(() => '');
        reqLog.warning('DEBUG page title + first 300 chars of body', {
            title: await page.title().catch(() => ''),
            snippet: bodyText.slice(0, 300),
        });
        if (/request blocked|security alert|suspicious activity/i.test(bodyText)) {
            reqLog.error('Page appears WAF-blocked, aborting this start URL', { url: request.loadedUrl });
        }
        return;
    }

    // Extract JSON-LD blob (index 0 script) which contains real resale listing geo/address data.
    const jsonLdItems: RawJsonLdItem[] = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        for (const s of scripts) {
            try {
                const parsed = JSON.parse(s.textContent ?? '');
                if (Array.isArray(parsed) && parsed.length > 1) return parsed;
            } catch {
                // ignore malformed JSON-LD blocks
            }
        }
        return [];
    });

    const jsonLdById = new Map<string, RawJsonLdItem>();
    for (const item of jsonLdItems) {
        if (!item.url) continue;
        const id = extractListingId(item.url);
        if (id) jsonLdById.set(id, item);
    }

    // Extract resale listing cards (individual real listings, excludes multi-unit builder "projects").
    const cards: CardRaw[] = await page.evaluate(
        ({ sel, hrefPattern }: { sel: string; hrefPattern: string }) => {
            const nodes = Array.from(document.querySelectorAll(sel));
            const out: { href: string; text: string }[] = [];
            for (const node of nodes) {
                const a = node.querySelector(`a[href*="${hrefPattern}"]`);
                if (!a) continue;
                out.push({ href: a.getAttribute('href') ?? '', text: (node as HTMLElement).innerText });
            }
            return out;
        },
        { sel: CARD_SELECTOR, hrefPattern: RESALE_HREF_PATTERN },
    );

    reqLog.info(`Found ${cards.length} resale listing cards on page`);

    let pushedCount = 0;
    for (const card of cards) {
        const listingId = extractListingId(card.href);
        if (!listingId) continue;
        const parsed = parseCardText(card.text);
        const ld = jsonLdById.get(listingId);

        await pushData({
            source: 'housing.com',
            housingListingId: listingId,
            listingUrl: `https://housing.com${card.href.startsWith('/') ? card.href : `/${card.href}`}`,
            searchStartUrl: baseUrl ?? request.loadedUrl,
            title: parsed.title,
            propertyTypeRaw: parsed.propertyTypeRaw,
            bedrooms: parsed.bedrooms,
            priceValue: parsed.priceValue,
            priceUnit: parsed.priceUnit,
            avgPricePerSqft: parsed.avgPricePerSqft,
            areaValue: parsed.areaValue,
            areaUnit: parsed.areaUnit,
            areaType: parsed.areaType,
            facing: parsed.facing,
            possessionStatus: parsed.possessionStatus,
            distanceKm: parsed.distanceKm,
            localityRaw: parsed.localityRaw,
            listing_purpose: 'sale',
            geo: ld?.geo
                ? { latitude: ld.geo.latitude ?? null, longitude: ld.geo.longitude ?? null, address: ld.geo.address ?? null }
                : null,
            containedInPlace: ld?.containedInPlace ?? null,
            photo: ld?.photo ?? null,
            jsonLdName: ld?.name ?? null,
            jsonLdAddress: ld?.address ?? null,
            scrapedAt: new Date().toISOString(),
        });
        pushedCount += 1;
    }

    reqLog.info(`Pushed ${pushedCount} listings from page ${pageNum}`);

    if (pushedCount === 0) {
        reqLog.info('No resale listings extracted on this page; not paginating further', { url: request.loadedUrl });
        return;
    }

    if (pageNum < maxPagesPerStartUrl) {
        const nextUrl = new URL(baseUrl ?? request.loadedUrl);
        nextUrl.searchParams.set('page', String(pageNum + 1));
        await crawler.addRequests([
            {
                url: nextUrl.toString(),
                userData: { pageNum: pageNum + 1, maxPagesPerStartUrl, baseUrl: baseUrl ?? request.loadedUrl },
            },
        ]);
    }
});
