import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.click('#btn-start');
await page.waitForTimeout(1200);
const s1 = await page.evaluate(() => ({ state: window.__JJ.state(), grounded: window.__JJ.game.onGround, y: window.__JJ.game.pos.y }));
console.log('before space:', JSON.stringify(s1));
// raw keydown via dispatch to see if listener fires
await page.evaluate(() => {
  window.__dbg = [];
  window.addEventListener('keydown', (e) => window.__dbg.push(e.code + ':repeat=' + e.repeat), true);
});
await page.keyboard.press('Space');
await page.waitForTimeout(50);
const dbg = await page.evaluate(() => ({ raw: window.__dbg, queued: window.__JJ.input._jumpQueued }));
console.log('after press:', JSON.stringify(dbg));
await page.waitForTimeout(300);
const s2 = await page.evaluate(() => ({ y: window.__JJ.game.pos.y, jumps: window.__JJ.game.jumpsLeft, air: !window.__JJ.game.onGround }));
console.log('350ms later:', JSON.stringify(s2));
await browser.close();
