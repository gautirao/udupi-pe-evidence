import { chromium } from '@playwright/test';
import * as path from 'path';

const outputDir = path.resolve('/Users/gouthamrao/.gemini/antigravity-cli/brain/79902388-ee0e-4b42-b444-63c8aa0bf55a');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1672, height: 941 }
  });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  
  // Go to Discover landing page
  const response = await page.goto('http://localhost:5190/discover', { waitUntil: 'domcontentloaded' });
  console.log('Status code:', response?.status());
  
  await page.waitForTimeout(5000);
  console.log('Current URL:', page.url());
  
  await page.screenshot({ path: path.join(outputDir, 'baseline-desktop.png'), fullPage: true });
  console.log('Saved baseline-desktop.png');

  await browser.close();
})();
