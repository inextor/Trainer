const { test, expect } = require('@playwright/test');

function futureDate(weeksFromNow = 10) {
  const d = new Date();
  d.setDate(d.getDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
}

test.describe('Plan Export / Import', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/Trainer/webapp/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(async () => {
      try { localStorage.clear(); sessionStorage.clear(); } catch(e) {}
      try {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name === 'training_calendar') indexedDB.deleteDatabase(db.name);
        }
      } catch(e) {}
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('export button exists on config page', async ({ page }) => {
    await expect(page.locator('#exportPlan')).toBeVisible();
    await expect(page.locator('#importPlan')).toBeVisible();
  });

  test('export with no plan reports message', async ({ page }) => {
    await page.click('#exportPlan');
    await expect(page.locator('#planIoStatus')).toContainText('No saved plan');
  });

  test('export then import round-trips the plan', async ({ page }) => {
    // Create a plan
    const raceDate = futureDate(10);
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', raceDate);
    await page.locator('label:has(input[name="units"][value="km"])').click();
    await page.fill('#currentMileage', '50');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    const indicator = await page.locator('#weekIndicator').textContent();

    // Export from calendar page
    const downloadPromise = page.waitForEvent('download');
    await page.click('#exportPlan');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/training-plan-.*\.json$/);

    // Clear the plan
    await page.goto('/Trainer/webapp/');
    await page.waitForLoadState('networkidle');
    const dialogPromise = page.waitForEvent('dialog');
    await page.click('#resetPlan');
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Saved plan cleared');
    await dialog.accept();
    await page.goto('/Trainer/webapp/calendar.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#noPlan')).toBeVisible();

    // Import the downloaded file back
    const path = await download.path();
    await page.goto('/Trainer/webapp/');
    await page.waitForLoadState('networkidle');
    await page.setInputFiles('#importFile', path);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#event')).toHaveValue('marathon');
    await expect(page.locator('#raceDate')).toHaveValue(raceDate);

    // Verify calendar restored
    await page.goto('/Trainer/webapp/calendar.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await expect(page.locator('#weekIndicator')).toContainText(indicator.split('(')[0].trim());
  });
});
