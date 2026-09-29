import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

const brand = await page.evaluate(() => {
  const a = document.querySelector('.brand-name');
  return { text: a.textContent, href: a.href };
});
console.log('brand link:', JSON.stringify(brand));

await page.click('#btn-prompt');
await page.waitForTimeout(400);
const p = await page.evaluate(() => {
  const body = document.querySelector('#prompt-body');
  const links = [...body.querySelectorAll('a')].map(a => a.href);
  const credit = [...body.querySelectorAll('p')].find(x => x.textContent.includes('Credit'));
  return { totalLinks: links.length, creditText: credit ? credit.textContent : null, creditHref: credit ? credit.querySelector('a').href : null };
});
console.log('prompt:', JSON.stringify(p));
// scroll to bottom of popup to capture the credit line
await page.evaluate(() => { const b = document.querySelector('#prompt-body'); b.scrollTop = b.scrollHeight; });
await page.waitForTimeout(200);
await page.screenshot({ path: '/tmp/jj-shots/14-prompt-credit.png' });

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
