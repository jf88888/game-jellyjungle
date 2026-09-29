import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// brand text
const brand = await page.evaluate(() => document.querySelector('.brand-text strong').textContent + ' / ' + document.querySelector('.brand-text small').textContent);
console.log('brand:', brand);
await page.screenshot({ path: '/tmp/jj-shots/10-title-rebrand.png' });

// open prompt popup
await page.click('#btn-prompt');
await page.waitForTimeout(400);
const p = await page.evaluate(() => {
  const d = document.querySelector('#dialog-prompt');
  const body = document.querySelector('#prompt-body');
  return { visible: !d.classList.contains('hidden'), hasH: !!body.querySelector('h3'), tableRows: body.querySelectorAll('table tr').length, links: body.querySelectorAll('a').length, codes: body.querySelectorAll('code').length };
});
console.log('prompt popup:', JSON.stringify(p));
await page.screenshot({ path: '/tmp/jj-shots/11-prompt-popup.png' });

// close via X
await page.click('#btn-prompt-close');
await page.waitForTimeout(200);
const closed = await page.evaluate(() => document.querySelector('#dialog-prompt').classList.contains('hidden'));
console.log('closed:', closed);

// mobile: footer + prompt on phone
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mob.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await mob.waitForTimeout(2200);
await mob.screenshot({ path: '/tmp/jj-shots/12-title-mobile-rebrand.png' });
await mob.click('#btn-prompt');
await mob.waitForTimeout(400);
const mp = await mob.evaluate(() => !document.querySelector('#dialog-prompt').classList.contains('hidden'));
console.log('mobile prompt visible:', mp);
await mob.screenshot({ path: '/tmp/jj-shots/13-prompt-mobile.png' });

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
