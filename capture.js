import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  
  const pageMock = await context.newPage();
  await pageMock.goto('http://localhost:8000/ui_kits/new_discover/experience.html');
  await pageMock.waitForTimeout(2000); // Wait for mock to settle
  await pageMock.screenshot({ path: 'screenshot_mock.png' });
  
  const pageProd = await context.newPage();
  await pageProd.goto('http://localhost:5174/discover?city=bangalore&node=c%3As%3Ain-ka-bengaluru-hebbagodi-in-ka-bengaluru-jigani&lat=12.80005&lon=77.65949&zoom=13');
  await pageProd.waitForTimeout(2000); // Wait for prod to settle (tiles and react query)
  await pageProd.screenshot({ path: 'screenshot_prod.png' });

  await browser.close();
})();
