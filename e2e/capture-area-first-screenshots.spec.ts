import { test } from '@playwright/test';

test.describe('@capture Area-first journey visual verification', () => {
  test('should capture area-first entry with no groupId', async ({ page }) => {
    await page.goto('http://localhost:5174/discover?city=udupi&journey=area-first');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/area-first-entry-no-groupid.png', fullPage: true });
    console.log('✓ Screenshot: area-first entry (no groupId)');
  });

  test('should capture area-first with groupId', async ({ page }) => {
    await page.goto('http://localhost:5174/discover?city=udupi&journey=area-first&groupId=coastal-belt');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/area-first-with-groupid.png', fullPage: true });
    console.log('✓ Screenshot: area-first with groupId=coastal-belt');
  });

  test('should capture school-first for comparison', async ({ page }) => {
    await page.goto('http://localhost:5174/discover?city=udupi&journey=school-first');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/school-first-entry.png', fullPage: true });
    console.log('✓ Screenshot: school-first entry');
  });

  test('should capture default discover (no journey param)', async ({ page }) => {
    await page.goto('http://localhost:5174/discover?city=udupi');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: 'screenshots/default-discover.png', fullPage: true });
    console.log('✓ Screenshot: default discover (no journey param)');
  });

  test('should check console for errors during area-first navigation', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('http://localhost:5174/discover?city=udupi&journey=area-first');
    await page.waitForLoadState('networkidle');

    if (errors.length > 0) {
      console.log('❌ Console errors detected:');
      errors.forEach((e) => console.log(`  - ${e}`));
    } else {
      console.log('✓ No console errors');
    }
  });
});
