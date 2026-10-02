import { test, expect } from '@playwright/test';

test.describe('Issue 2759: Consent banner clickable at narrow desktop', () => {
  // Clear consent before tests
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
    await context.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
  });

  const widths = [821, 900, 1000, 1023, 1024];

  for (const width of widths) {
    test(`Decline button is clickable at ${width}px`, async ({ page }) => {
      // 800 height is fine
      await page.setViewportSize({ width, height: 800 });

      // Navigate to an Area-selected state where map chrome is visible
      await page.goto('/discover?city=udupi&journey=area-first&node=udupi/manipal');

      // Wait for Decline button
      const declineBtn = page.getByRole('button', { name: 'Decline' });
      await declineBtn.waitFor({ state: 'visible' });

      // Check element from point at center of Decline button
      const box = await declineBtn.boundingBox();
      expect(box).not.toBeNull();
      
      const centerX = box!.x + box!.width / 2;
      const centerY = box!.y + box!.height / 2;

      // Ensure the button itself or its child is the element from point
      const topElementInfo = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el ? { tag: el.tagName, className: el.className, text: el.textContent?.trim().slice(0, 30) } : null;
      }, { x: centerX, y: centerY });
      
      console.log(`[${width}px] Top element:`, topElementInfo);

      // Perform a real click and expect the banner to be dismissed
      await declineBtn.click();
      await expect(declineBtn).toBeHidden();
    });
  }
});
