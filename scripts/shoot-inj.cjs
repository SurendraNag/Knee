const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const shots = JSON.parse(process.argv[2]);
  for (const s of shots) {
    const page = await browser.newPage({ viewport: s.vp || { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('pageerror:', e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 400)); });
    await page.goto('http://localhost:4173/?' + (s.q || ''));
    await page.waitForFunction(() => window.__ready, null, { timeout: 60000 });
    await page.evaluate(s.js);
    await page.waitForTimeout(s.wait || 1800);
    await page.screenshot({ path: 'shots/' + s.name + '.png' });
    console.log(s.name);
    await page.close();
  }
  await browser.close();
})();
