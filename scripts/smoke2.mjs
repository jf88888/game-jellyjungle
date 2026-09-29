// Smoke test: load, console errors, title + gameplay screenshots.
import { chromium } from 'playwright';

const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const URL = process.env.JJ_URL || 'http://localhost:5199/';
const OUT = process.env.JJ_OUT || '/tmp/jj-shots';

import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500); // let scene settle + fonts load
const hasJJ = await page.evaluate(() => !!window.__JJ);
console.log('game booted:', hasJJ);
if (hasJJ) {
  const s = await page.evaluate(() => ({
    state: window.__JJ.state(),
    stats: window.__JJ.stats,
    mode: window.__JJ.registry.mode,
    report: window.__JJ.registry.report(),
  }));
  console.log('state:', JSON.stringify(s));
}
await page.screenshot({ path: `${OUT}/01-title-desktop.png` });

// Start the run
await page.click('#btn-start');
await page.waitForTimeout(1600); // camera fly-in
await page.screenshot({ path: `${OUT}/02-play-desktop.png` });

// Hold W for a moment to move forward, then screenshot
await page.keyboard.down('KeyW');
await page.waitForTimeout(900);
await page.keyboard.up('KeyW');
await page.screenshot({ path: `${OUT}/03-move-desktop.png` });

// Jump test
const j1 = await page.evaluate(() => window.__JJ.game.jumpsLeft);
await page.keyboard.press('Space');
await page.waitForTimeout(120);
const mid = await page.evaluate(() => ({ y: window.__JJ.game.pos.y, jumps: window.__JJ.game.jumpsLeft, air: !window.__JJ.game.onGround }));
console.log('after jump press:', JSON.stringify({ j1, ...mid }));
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/04-jump-desktop.png` });

// Mobile viewport title
const mpage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
mpage.on('console', (m) => { if (m.type() === 'error') errors.push('MOBILE: ' + m.text()); });
mpage.on('pageerror', (e) => errors.push('MOBILE PAGEERROR: ' + e.message));
await mpage.goto(URL, { waitUntil: 'networkidle' });
await mpage.waitForTimeout(2500);
await mpage.screenshot({ path: `${OUT}/05-title-mobile.png` });
await mpage.close();

console.log('CONSOLE ERRORS:', errors.length ? errors : 'none');
await browser.close();
