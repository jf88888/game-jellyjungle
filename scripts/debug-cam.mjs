import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('#btn-start');
for (const t of [300, 600, 900, 1200, 1600]) {
  await page.waitForTimeout(t === 300 ? 300 : t - [300,600,900,1200][Math.ceil(t/300)-2]);
  const s = await page.evaluate(() => ({
    cam: [...window.__JJ.camera.position.toArray()],
    player: [...window.__JJ.game.pos.toArray()],
    grounded: window.__JJ.game.onGround,
  }));
  console.log(`t=${t}:`, JSON.stringify(s));
}
await browser.close();
