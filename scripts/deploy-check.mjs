import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('https://jelly-jungle.hungry-path.workers.dev/', { waitUntil: 'load' });
// poll up to 20s for the debug hook
for (let i = 0; i < 40; i++) {
  const ok = await page.evaluate(() => !!window.__JJ);
  if (ok) break;
  await page.waitForTimeout(500);
}
const st = await page.evaluate(() => ({ booted: !!window.__JJ, state: window.__JJ?.state(), calls: window.__JJ ? (typeof window.__JJ.stats === "function" ? window.__JJ.stats().calls : window.__JJ.stats.calls) : undefined }));
console.log('deployed game:', JSON.stringify(st), 'errors:', errors.length ? errors : 'none');
await page.screenshot({ path: '/tmp/jj-shots/15-deployed.png' });
await browser.close();
