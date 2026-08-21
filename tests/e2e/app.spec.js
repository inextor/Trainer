const { test, expect } = require('@playwright/test');

function futureDate(weeksFromNow = 12) {
  const d = new Date();
  d.setDate(d.getDate() + weeksFromNow * 7);
  return d.toISOString().slice(0, 10);
}

test.describe('Training Calendar', () => {

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

  test('loads with header and form', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Training Calendar');
    await expect(page.locator('#trainingForm')).toBeVisible();
    await expect(page.locator('#event')).toBeVisible();
    await expect(page.locator('#raceDate')).toBeVisible();
  });

  test('defaults to km and correct mileage label', async ({ page }) => {
    await expect(page.locator('input[name="units"][value="km"]')).toBeChecked();
    await expect(page.locator('#mileageLabel')).toContainText('Current Weekly Distance');
    await expect(page.locator('#mileageHint')).toContainText('km per week');
    await expect(page.locator('#currentMileage')).toHaveValue('32');
  });

  test('toggling units updates mileage label/hint', async ({ page }) => {
    await page.locator('label:has(input[name="units"][value="miles"])').click();
    await expect(page.locator('#mileageLabel')).toContainText('Current Weekly Mileage');
    await expect(page.locator('#mileageHint')).toContainText('miles per week');
    await page.locator('label:has(input[name="units"][value="km"])').click();
    await expect(page.locator('#mileageLabel')).toContainText('Current Weekly Distance');
    await expect(page.locator('#mileageHint')).toContainText('km per week');
  });

  test('VDOT tabs switch correctly (regression)', async ({ page }) => {
    await expect(page.locator('#raceTimeMethod')).toBeVisible();
    await expect(page.locator('#raceDistance')).toBeVisible();
    await expect(page.locator('#raceHours')).toBeVisible();
    await expect(page.locator('#raceMinutes')).toBeVisible();
    await expect(page.locator('#raceSeconds')).toBeVisible();
    await page.getByRole('button', { name: 'Manual VDOT' }).click();
    await expect(page.locator('#manualMethod')).toBeVisible();
    await expect(page.locator('#vdotSlider')).toBeVisible();
    await page.getByRole('button', { name: 'From Race Time' }).click();
    await expect(page.locator('#raceTimeMethod')).toBeVisible();
    await expect(page.locator('#raceDistance')).toBeVisible();
    await expect(page.locator('.time-field').first()).toBeVisible();
  });

  test('time inputs stay on one row (h:mm:ss)', async ({ page }) => {
    const h = await page.locator('#raceHours').boundingBox();
    const m = await page.locator('#raceMinutes').boundingBox();
    const s = await page.locator('#raceSeconds').boundingBox();
    expect(Math.abs(h.y - m.y)).toBeLessThan(5);
    expect(Math.abs(m.y - s.y)).toBeLessThan(5);
  });

  test('alert when Calculate with empty time', async ({ page }) => {
    page.once('dialog', async d => { expect(d.message()).toContain('Please enter a race time'); await d.accept(); });
    await page.fill('#raceMinutes', '');
    await page.click('#calculateVdot');
  });

  test('calculate VDOT from race time', async ({ page }) => {
    await page.selectOption('#raceDistance', '10k');
    await page.fill('#raceHours', '0');
    await page.fill('#raceMinutes', '40');
    await page.fill('#raceSeconds', '0');
    await page.click('#calculateVdot');
    await expect(page.locator('#vdotResult')).toBeVisible();
    await expect(page.locator('#vdotResult')).toContainText(/Calculated VDOT:/);
    const txt = await page.locator('#vdotValue').textContent();
    const v = parseInt(txt, 10);
    expect(v).toBeGreaterThanOrEqual(30);
    expect(v).toBeLessThanOrEqual(85);
  });

  test('generate validation requires event and date', async ({ page }) => {
    await page.selectOption('#event', '');
    page.once('dialog', async d => { expect(d.message()).toContain('Please fill in all required fields'); await d.accept(); });
    await page.click('button:has-text("Generate Training Plan")');
  });

  test('generate plan shows calendar and allows navigation', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', futureDate(12));
    await page.locator('label:has(input[name="units"][value="km"])').click();
    await page.fill('#currentMileage', '50');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await expect(page.locator('#weekIndicator')).toContainText(/Week 1 of/);
    await expect(page.locator('#calendarGrid')).toBeVisible();
    const first = await page.locator('#weekIndicator').textContent();
    await page.click('#nextWeek');
    const second = await page.locator('#weekIndicator').textContent();
    expect(first).not.toEqual(second);
    await page.click('#prevWeek');
    await expect(page.locator('#weekIndicator')).toContainText(first);
  });

  test('unit output: km vs miles', async ({ page }) => {
    const date = futureDate(8);
    await page.selectOption('#event', '5k');
    await page.fill('#raceDate', date);
    await page.locator('label:has(input[name="units"][value="km"])').click();
    await page.fill('#currentMileage', '50');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#weekDetails')).toContainText(/km/);

    await page.goto('/Trainer/webapp/');
    await page.selectOption('#event', '5k');
    await page.fill('#raceDate', date);
    await page.locator('label:has(input[name="units"][value="miles"])').click();
    await page.fill('#currentMileage', '32');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#weekDetails')).toContainText(/mi/);
  });

  test('IndexedDB persistence survives reload', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', futureDate(10));
    await page.fill('#currentMileage', '60');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    const indicator = await page.locator('#weekIndicator').textContent();
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await expect(page.locator('#weekIndicator')).toContainText(indicator.split('(')[0].trim());
    await page.goto('/Trainer/webapp/');
    await expect(page.locator('#event')).toHaveValue('marathon');
  });

  test('completion checkbox persists after reload', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', futureDate(8));
    await page.fill('#currentMileage', '40');
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await page.waitForSelector('.done-chk input', { timeout: 5000 });
    const cb = page.locator('.done-chk input').first();
    await expect(cb).toBeVisible();
    await cb.check();
    await page.waitForTimeout(800);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await expect(page.locator('.done-chk input:checked')).toHaveCount(1);
  });

  test('clear saved plan hides calendar', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', futureDate(8));
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page.locator('#calendarPanel')).toBeVisible();
    await page.goto('/Trainer/webapp/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#resetPlan')).toBeVisible();
    const dialogPromise = page.waitForEvent('dialog');
    await page.click('#resetPlan');
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Saved plan cleared');
    await dialog.accept();
    await page.goto('/Trainer/webapp/calendar.html');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#noPlan')).toBeVisible();
  });

  test('marathon 2Q vs novice selection via mileage', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.locator('label:has(input[name="daysPerWeek"][value="5"])').click();
    await page.locator('label:has(input[name="units"][value="miles"])').click();
    await page.fill('#currentMileage', '30');
    await page.fill('#raceDate', futureDate(12));
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    let foundNovice = false;
    for (let i=0;i<15;i++) {
      const txt = await page.locator('#weekDetails').textContent();
      if (txt.includes('During week 10')) { foundNovice = true; break; }
      await page.click('#nextWeek');
    }
    expect(foundNovice).toBeTruthy();
    await page.goto('/Trainer/webapp/');
    await page.selectOption('#event', 'marathon');
    await page.locator('label:has(input[name="daysPerWeek"][value="6"])').click();
    await page.fill('#currentMileage', '80');
    await page.fill('#raceDate', futureDate(12));
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    let found = false;
    for (let i=0;i<12;i++) {
      const note = await page.locator('#weekDetails').textContent();
      if (note.includes('2Q')) { found=true; break; }
      await page.click('#nextWeek');
    }
    expect(found).toBeTruthy();
  });

  test('navigation between config and calendar via links', async ({ page }) => {
    await page.selectOption('#event', 'marathon');
    await page.fill('#raceDate', futureDate(8));
    await page.click('button:has-text("Generate Training Plan")');
    await page.waitForURL('**/calendar.html');
    await expect(page).toHaveURL(/calendar\.html/);
    await page.locator('header nav a:has-text("Configuration")').click();
    await expect(page).toHaveURL(/index\.html|webapp\/$/);
    await expect(page.locator('#trainingForm')).toBeVisible();
  });
});
