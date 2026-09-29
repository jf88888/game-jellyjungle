import { chromium } from 'playwright';
const EXE = '/home/jimmyfoh/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath: EXE, args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const info = await page.evaluate(() => {
  const anchors = window.__JJ.anchors;
  return {
    treeCount: anchors.filter(a => a.slot === 'tree').length,
    firstTreePos: (() => { const t = anchors.find(a => a.slot === 'tree'); return t ? [...t.obj.position.toArray()] : null; })(),
    sceneChildren: window.__JJ.scene.children.length,
  };
});
console.log(JSON.stringify(info));
await browser.close();
