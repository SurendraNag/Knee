const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const shots = JSON.parse(process.argv[2]);
  for (const s of shots) {
    const page = await browser.newPage({ viewport: s.vp || { width: 1280, height: 800 }, deviceScaleFactor: s.dpr || 1 });
    page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()); });
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    await page.goto('http://localhost:4173/?' + (s.q || ''));
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.waitForTimeout(s.wait || 1500);
    await page.screenshot({ path: 'shots/' + s.name + '.png' });
    console.log(s.name, await page.evaluate(() => JSON.stringify(window.__ready)));
    await page.close();
  }
  await browser.close();
})();
