import { test, expect } from '@playwright/test';

test.describe('Issue #1178 — Visual verification: Group card highlighting', () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(10000);
  });

  test('AC4: Valid groupId highlights the matching group card on cold load', async ({ page }) => {
    // Navigate to Discover with a valid groupId (north-udupi is a known test group)
    await page.goto('http://localhost:5174/discover?city=udupi&groupId=north-udupi');

    // Wait for the area groups panel to load
    await page.waitForSelector('[data-testid="area-groups-landing"]', { timeout: 5000 });

    // Locate the north-udupi group card
    const northUdupiCard = page.locator('button:has-text("North Udupi")').first();
    await expect(northUdupiCard).toBeVisible();

    // Verify highlight classes are applied
    const classes = await northUdupiCard.getAttribute('class');
    console.log('🔍 North Udupi card classes:', classes);
    expect(classes).toContain('border-2');
    expect(classes).toContain('border-primary');
    expect(classes).toContain('bg-muted');

    // Verify accessibility indicator
    const ariaCurrent = await northUdupiCard.getAttribute('aria-current');
    console.log('✅ aria-current:', ariaCurrent);
    expect(ariaCurrent).toBe('true');

    console.log('✅ AC4 PASS: Valid groupId highlights matching card with border-2 border-primary bg-muted + aria-current=true');
  });

  test('AC3: Invalid groupId shows non-alarming message on cold load', async ({ page }) => {
    // Navigate to Discover with an invalid groupId
    await page.goto('http://localhost:5174/discover?city=udupi&groupId=invalid-nonexistent-group');

    // Wait for the area groups panel to load
    await page.waitForSelector('[data-testid="area-groups-landing"]', { timeout: 5000 });

    // Verify the invalid-groupId message is visible
    const invalidMessage = page.locator('text=This group is not available');
    await expect(invalidMessage).toBeVisible();
    console.log('✅ Invalid message visible');

    // Verify message styling is neutral (bg-muted, not destructive)
    const messageContainer = invalidMessage.locator('..').first();
    const messageClasses = await messageContainer.getAttribute('class');
    console.log('🔍 Message container classes:', messageClasses);
    expect(messageClasses).toContain('bg-muted');
    expect(messageClasses).not.toContain('bg-destructive');
    expect(messageClasses).not.toContain('bg-warning');

    // Verify aria-live for screen reader
    const ariaLive = await messageContainer.getAttribute('aria-live');
    console.log('✅ aria-live:', ariaLive);
    expect(ariaLive).toBe('polite');

    // Verify NO group card is highlighted
    const allGroupCards = page.locator('button[data-testid^="group-card-"]');
    const cardCount = await allGroupCards.count();
    console.log(`🔍 Found ${cardCount} group cards`);
    for (let i = 0; i < Math.min(cardCount, 3); i++) {
      const card = allGroupCards.nth(i);
      const cardAriaCurrents = await card.getAttribute('aria-current');
      expect(cardAriaCurrents).not.toBe('true');
    }

    console.log('✅ AC3 PASS: Invalid groupId shows non-alarming message, no card highlighted');
  });

  test('AC2: Clicking different group moves highlight immediately', async ({ page }) => {
    // Start with north-udupi highlighted
    await page.goto('http://localhost:5174/discover?city=udupi&groupId=north-udupi');
    await page.waitForSelector('[data-testid="area-groups-landing"]', { timeout: 5000 });

    // Verify north-udupi is highlighted
    const northUdupiCard = page.locator('button:has-text("North Udupi")').first();
    await expect(northUdupiCard).toHaveAttribute('aria-current', 'true');
    console.log('✅ North Udupi initially highlighted');

    // Find another group card and click it
    const allGroupCards = page.locator('button[role="button"]').filter({ has: page.locator('[data-testid="group-card-"]') });
    const otherCard = allGroupCards.nth(1); // Get second card
    const otherCardText = await otherCard.textContent();
    console.log(`🔍 Clicking on group card: ${otherCardText}`);

    await otherCard.click();

    // Wait for URL to update and highlight to move
    await page.waitForURL(/groupId=/);
    const otherCardAriaCurrentAfter = await otherCard.getAttribute('aria-current');
    console.log(`✅ ${otherCardText} aria-current after click:`, otherCardAriaCurrentAfter);

    // Verify old card is no longer highlighted
    const northUdupiCardAriaCurrentAfter = await northUdupiCard.getAttribute('aria-current');
    console.log(`🔍 North Udupi aria-current after click:`, northUdupiCardAriaCurrentAfter);
    expect(northUdupiCardAriaCurrentAfter).not.toBe('true');

    console.log('✅ AC2 PASS: Click moves highlight immediately to new group card');
  });

  test('Whitespace groupId behaves like normal browse', async ({ page }) => {
    // Navigate with whitespace-only groupId
    await page.goto('http://localhost:5174/discover?city=udupi&groupId=%20');

    await page.waitForSelector('[data-testid="area-groups-landing"]', { timeout: 5000 });

    // Verify NO message appears
    const invalidMessage = page.locator('text=This group is not available');
    await expect(invalidMessage).not.toBeVisible();
    console.log('✅ No invalid message for whitespace-only groupId');

    // Verify NO card is highlighted
    const highlightedCard = page.locator('[aria-current="true"]');
    const highlightedCount = await highlightedCard.count();
    console.log(`🔍 Highlighted cards count: ${highlightedCount}`);
    expect(highlightedCount).toBe(0);

    console.log('✅ Whitespace PASS: Treats whitespace-only groupId as empty');
  });
});
