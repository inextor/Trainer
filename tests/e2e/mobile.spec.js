const { test, expect } = require('@playwright/test');

test.describe('Mobile viewport', () => {
  test('form is usable on phone and time inputs stay on one row', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/Trainer/webapp/');
    await page.waitForLoadState('networkidle');
    const h = await page.locator('#raceHours').boundingBox();
    const m = await page.locator('#raceMinutes').boundingBox();
    const s = await page.locator('#raceSeconds').boundingBox();
    expect(Math.abs(h.y - m.y)).toBeLessThan(5);
    expect(Math.abs(m.y - s.y)).toBeLessThan(5);
    // no horizontal overflow
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientW = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollW).toBeLessThanOrEqual(clientW + 2);
    // units toggle still tappable
    await page.locator('label:has(input[name="units"][value="miles"])').click();
    await expect(page.locator('#mileageLabel')).toContainText('Current Weekly Mileage');
  });

  test('distance units first, mileage second, label is responsive', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/Trainer/webapp/');
    const order = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('.config-panel .form-group label')).map(l => l.textContent.trim());
      return groups.join('|');
    });
    // Distance Units should appear before Current Weekly Distance
    expect(order.indexOf('Distance Units')).toBeLessThan(order.indexOf('Current Weekly Distance'));
  });
});
