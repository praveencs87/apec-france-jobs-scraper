import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = (await Actor.getInput()) || {};
const { startUrls = [], maxItems = 100, proxyConfig } = input;

const proxyConfiguration = await Actor.createProxyConfiguration(proxyConfig);

let itemCount = 0;

const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 5,
    sessionPoolOptions: {
        blockedStatusCodes: [401, 429],
    },
    browserPoolOptions: {
        useFingerprints: true,
    },
    launchContext: {
        launchOptions: {
            args: ['--disable-blink-features=AutomationControlled'],
        },
    },
    requestHandler: async ({ request, page, log }) => {
        log.info(`Processing ${request.url}...`);

        try { await page.waitForSelector('.card-offer, .offre-emploi, .container-result', { timeout: 10000 }); } catch (e) {
            log.warning('Could not find job cards within timeout.');
        }

        const items = await page.$$eval('.card-offer, .offre-emploi, .container-result', (cards) => {
            return cards.map(card => {
                const titleEl = card.querySelector('.title, h2, h3, a');
                const linkEl = card.querySelector('a');
                
                const title = titleEl ? titleEl.innerText.trim() : card.innerText.split('\n')[0].trim();
                const url = linkEl ? linkEl.href : location.href;
                
                const companyEl = card.querySelector('.company, .entreprise, h4');
                const company = companyEl ? companyEl.innerText.trim() : null;
                
                const locationEl = card.querySelector('.location, .lieu, .place');
                const jobLocation = locationEl ? locationEl.innerText.trim() : null;

                const salaryEl = card.querySelector('.salary, .salaire');
                const salary = salaryEl ? salaryEl.innerText.trim() : null;
                
                return {
                    url,
                    title,
                    company,
                    location: jobLocation,
                    salary
                };
            }).filter(c => c.title.length > 0);
        });

        const toPush = [];
        for (const c of items) {
            if (itemCount >= maxItems) break;
            toPush.push(c);
            itemCount++;
        }

        if (toPush.length > 0) {
            await Actor.pushData(toPush);
            log.info(`Pushed ${toPush.length} items to dataset.`);
        }
    },
    failedRequestHandler: ({ request, log }) => {
        log.error(`Request ${request.url} failed too many times.`);
    },
});

const initialRequests = [];

if (startUrls && startUrls.length > 0) {
    for (const req of startUrls) {
        initialRequests.push(typeof req === 'string' ? req : req.url);
    }
} else {
    log.warning('No startUrls provided. Using default.');
    initialRequests.push('https://www.apec.fr/candidat/recherche-emploi.html/emploi');
}

if (initialRequests.length > 0) {
    await crawler.run(initialRequests);
}

await Actor.exit();
