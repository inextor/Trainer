const { test, expect } = require('@playwright/test');

function futureDate(weeks = 12) {
  const d = new Date();
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

test('day detail dialog shows structured breakdown', async ({ page }) => {
  await page.goto('/Trainer/webapp/');
  await page.waitForLoadState('networkidle');
  await page.selectOption('#event', 'marathon');
  await page.fill('#raceDate', futureDate(12));
  await page.click('button:has-text("Generate Training Plan")');
  await expect(page.locator('#calendarPanel')).toBeVisible();
  const cell = page.locator('.day-cell:not(.empty)').first();
  await cell.click();
  const dialog = page.locator('#dayDialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#dayDialogContent')).toContainText(/Easy|Tempo|Marathon|Interval/);
  await expect(page.locator('#dayDialogContent .day-steps')).toBeVisible();
  await page.locator('#closeDayDialog').click();
  await expect(dialog).toBeHidden();
});
