import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: '/tmp/jj-shots/dbg-title.png' });   // extra shot 1
await page.click('#btn-start');
await page.waitForTimeout(1600);
await page.screenshot({ path: '/tmp/jj-shots/dbg-play.png' });    // extra shot 2
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
await page.screenshot({ path: '/tmp/jj-shots/dbg-move.png' });    // extra shot 3
const s1 = await page.evaluate(() => ({ y: window.__JJ.game.pos.y, grounded: window.__JJ.game.onGround }));
console.log('before space:', JSON.stringify(s1));
await page.keyboard.press('Space');
await page.waitForTimeout(150);
const s2 = await page.evaluate(() => ({ y: window.__JJ.game.pos.y, jumps: window.__JJ.game.jumpsLeft, air: !window.__JJ.game.onGround }));
console.log('after space:', JSON.stringify(s2));
await browser.close();
