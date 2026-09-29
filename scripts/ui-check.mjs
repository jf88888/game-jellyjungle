import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);

// mode switch to Classic and back
await page.click('#pill-classic');
await page.waitForTimeout(400);
const m1 = await page.evaluate(() => ({ mode: window.__JJ.registry.mode, label: document.querySelector('#mode-label')?.textContent }));
console.log('after classic click:', JSON.stringify(m1));
await page.screenshot({ path: '/tmp/jj-shots/06-classic-mode.png' });
await page.click('#pill-tripo');
await page.waitForTimeout(400);
const m2 = await page.evaluate(() => ({ mode: window.__JJ.registry.mode }));
console.log('after tripo click:', JSON.stringify(m2));

// help dialog
await page.click('#btn-help');
await page.waitForTimeout(300);
const h1 = await page.evaluate(() => !document.querySelector('#dialog-help')?.classList.contains('hidden'));
console.log('help dialog visible:', h1);
await page.screenshot({ path: '/tmp/jj-shots/07-help.png' });
await page.click('#dialog-help [data-close]');
await page.waitForTimeout(200);

// start + pause
await page.click('#btn-start');
await page.waitForTimeout(1400);
await page.keyboard.press('KeyP');
await page.waitForTimeout(300);
const p = await page.evaluate(() => window.__JJ.state());
console.log('paused state:', p);
await page.screenshot({ path: '/tmp/jj-shots/08-paused.png' });

// touch controls visibility on mobile viewport
const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await mob.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await mob.waitForTimeout(2200);
await mob.screenshot({ path: '/tmp/jj-shots/05-title-mobile.png' });
await mob.click('#btn-start');
await mob.waitForTimeout(1600);
const touchVis = await mob.evaluate(() => {
  const t = document.querySelector('#touch-controls');
  return { hidden: t.classList.contains('hidden'), display: getComputedStyle(t).display };
});
console.log('mobile touch controls:', JSON.stringify(touchVis));
await mob.screenshot({ path: '/tmp/jj-shots/09-play-mobile.png' });

if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
