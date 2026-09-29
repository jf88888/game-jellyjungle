import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.click('#btn-start');
await page.waitForTimeout(1300);

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
const poll = async (fn, ms, step = 80) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const r = await page.evaluate(fn);
    if (r) return r;
    await page.waitForTimeout(step);
  }
  return null;
};

// ---- Spring: drop from above onto the mushroom cap → vy spikes to ~16
await page.evaluate(() => {
  const g = window.__JJ.game;
  g.pos.set(-4, 2.0 + 1.34 + 1.5, -19); g.vel.set(0, 0, 0); g.onGround = false;
});
const sp = await poll(() => { const g = window.__JJ.game; return g.vel.y > 12 ? { vy: +g.vel.y.toFixed(1), y: +g.pos.y.toFixed(1) } : null; }, 2500);
check('spring launch (vy≈16)', !!sp && sp.vy >= 13, JSON.stringify(sp));

// ---- Spinner: stand still inside sweep radius, wait for the bar to sweep through
await page.evaluate(() => { const g = window.__JJ.game; g.pos.set(4, 3.25, -29); g.vel.set(0, 0, 0); g.onGround = true; });
const kb = await poll(() => { const g = window.__JJ.game; return (!g.onGround && g.vel.y > 1.5) ? { vy: +g.vel.y.toFixed(1), x: +g.pos.x.toFixed(1) } : null; }, 8000);
check('spinner knockback (airborne after sweep)', !!kb, JSON.stringify(kb));

// ---- Crumble: real landing on crumble island → arms → hides → falls through
await page.evaluate(() => { const g = window.__JJ.game; g.pos.set(4, 7.1 + 2.5, -92); g.vel.set(0, 0, 0); g.onGround = false; });
const cr = await poll(() => { const g = window.__JJ.game; return (!g.onGround && g.pos.y < 6.4) ? { y: +g.pos.y.toFixed(1), vy: +g.vel.y.toFixed(1) } : null; }, 7000);
check('crumble drops player', !!cr, JSON.stringify(cr));

// ---- Checkpoint respawn: land on checkpoint idx8 (activates), then fall → respawn there
await page.evaluate(() => { const g = window.__JJ.game; g.pos.set(7, 6.5 + 2.5, -82); g.vel.set(0, 0, 0); g.onGround = false; });
await page.waitForTimeout(1200); // land → activates checkpoint 8
const cpAct = await page.evaluate(() => window.__JJ.game.checkpoint);
// now drop far below the kill plane
await page.evaluate(() => { const g = window.__JJ.game; g.pos.set(7, 6.5 - 16, -82); g.vel.set(0, 0, 0); });
const cp = await poll(() => { const g = window.__JJ.game; return (g.onGround && g.groundIndex === 8) ? { x: +g.pos.x.toFixed(1), z: +g.pos.z.toFixed(1), y: +g.pos.y.toFixed(1) } : null; }, 4000);
check('respawn at checkpoint (island 9 @ 7,-82)', cpAct === 8 && !!cp, `checkpoint=${cpAct} respawn=${JSON.stringify(cp)}`);

console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
