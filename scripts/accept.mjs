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

// ---- 1. Triple jump: press space 3x in air, verify 3rd jump works & meter drains
await page.evaluate(() => window.__JJ.teleport(0));
await page.waitForTimeout(200);
for (let i = 0; i < 3; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(450); }
const t1 = await page.evaluate(() => ({ jumps: window.__JJ.game.jumpsLeft, air: !window.__JJ.game.onGround, y: window.__JJ.game.pos.y }));
check('triple jump (3 charges used)', t1.jumps === 0 && t1.air && t1.y > 2, JSON.stringify(t1));

// ---- 2. Spring: teleport onto spring island mushroom, land on cap → vel spikes to ~16
await page.evaluate(() => window.__JJ.teleport(2)); // island idx 2 = spring
await page.waitForTimeout(150);
const s0 = await page.evaluate(() => ({ y: window.__JJ.game.pos.y }));
// nudge onto mushroom centre (island centre) — teleport already at centre; wait for landing then check spring
await page.waitForTimeout(400);
const s1 = await page.evaluate(() => {
  const g = window.__JJ.game;
  return { y: g.pos.y, vy: g.vel.y };
});
check('spring launch (vy≈16)', Math.abs(s1.vy - 16) < 2.5 || s1.y > s0.y + 4, JSON.stringify({ ...s1, from: s0 }));

// ---- 3. Spinner knockback: teleport onto spinner island, walk into bar
await page.evaluate(() => { window.__JJ.teleport(3); const g = window.__JJ.game; g.pos.x += 2.2; }); // stand off-centre near bar
await page.waitForTimeout(150);
const kb0 = await page.evaluate(() => ({ x: window.__JJ.game.pos.x, z: window.__JJ.game.pos.z }));
await page.keyboard.down('KeyA'); // walk toward centre where bar sweeps
await page.waitForTimeout(700);
await page.keyboard.up('KeyA');
const kb1 = await page.evaluate(() => ({ x: window.__JJ.game.pos.x, z: window.__JJ.game.pos.z, vy: window.__JJ.game.vel.y }));
const moved = Math.hypot(kb1.x - kb0.x, kb1.z - kb0.z);
check('spinner knockback (displaced >1.5u or airborne)', moved > 1.5 || kb1.vy > 1, JSON.stringify({ kb0, kb1, moved: +moved.toFixed(2) }));

// ---- 4. Crumble: teleport to crumble island, stand still → platform hides
await page.evaluate(() => window.__JJ.teleport(9));
await page.waitForTimeout(3500); // arming + fade time
const c1 = await page.evaluate(() => ({ y: window.__JJ.game.pos.y, grounded: window.__JJ.game.onGround }));
check('crumble drops player (fell through)', !c1.grounded && c1.y < 5.8 - 0.6, JSON.stringify(c1));

// ---- 5. Checkpoint respawn: after crumble fall, should respawn at last checkpoint (idx 8)
await page.waitForTimeout(2500);
const cp = await page.evaluate(() => { const g = window.__JJ.game; return { x: +g.pos.x.toFixed(1), z: +g.pos.z.toFixed(1), y: +g.pos.y.toFixed(1) }; });
check('respawn at checkpoint 2 (island 9 @ x7,z-82)', Math.abs(cp.x - 7) < 1.5 && Math.abs(cp.z + 82) < 1.5, JSON.stringify(cp));

// ---- 6. Crystals: teleport to island with crystals and walk across → count rises
const cry0 = await page.evaluate(() => window.__JJ.game.crystalCount);
await page.evaluate(() => { window.__JJ.teleport(4); });
await page.waitForTimeout(150);
await page.keyboard.down('KeyW');
await page.waitForTimeout(1200);
await page.keyboard.up('KeyW');
const cry1 = await page.evaluate(() => window.__JJ.game.crystalCount);
check('crystals collectible', cry1 > cry0, `${cry0} → ${cry1}`);

// ---- 7. Finish: teleport to finish island centre (portal) → finished state + dialog
await page.evaluate(() => { window.__JJ.teleport(12); const g = window.__JJ.game; g.pos.set(0, 10.05, -127); });
await page.waitForTimeout(900);
const fin = await page.evaluate(() => ({ state: window.__JJ.state(), dialogVisible: !document.querySelector('#dialog-finish')?.classList.contains('hidden') }));
check('finish triggers win dialog', fin.dialogVisible || fin.state === 'finished', JSON.stringify(fin));

// ---- 8. Pause: press P → paused state
if (fin.state !== 'finished') {
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(150);
  const p = await page.evaluate(() => window.__JJ.state());
  check('pause with P', p === 'paused', `state=${p}`);
  await page.keyboard.press('KeyP');
}

console.log(results.join('\n'));
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
