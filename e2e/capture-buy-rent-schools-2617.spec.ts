import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = path.resolve(__dirname, '../docs/audit/evidence/discover-reskin-continuation');
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

test('Capture Buy/Rent toggle parity and Explore marker school count evidence', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://127.0.0.1:5190/discover?city=udupi');
  
  // Wait for application to render
  await page.waitForTimeout(4000);

  // 1. Buy selected evidence
  const buyBtn = page.getByRole('button', { name: 'Buy' }).first();
  if (await buyBtn.isVisible()) {
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'buy_selected.png') });

    // 2. Click Rent and capture Rent selected evidence
    const rentBtn = page.getByRole('button', { name: 'Rent' }).first();
    await rentBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'rent_selected.png') });

    // 3. Switch back to Buy and wait for map markers to render
    await buyBtn.click();
    await page.waitForTimeout(2000);
  }

  // Capture full page screenshot
  await page.screenshot({ path: path.join(EVIDENCE_DIR, 'explore_marker_school_counts.png'), fullPage: true });
});
