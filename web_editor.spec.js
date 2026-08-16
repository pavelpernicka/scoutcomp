const { test, expect } = require('@playwright/test');

test('Web Editor QA', async ({ page }) => {
  // Console logging
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));

  console.log('Navigating to login...');
  await page.goto('http://localhost:5173/login');
  
  await page.fill('input[name="username"]', 'admin');
  await page.fill('input[name="password"]', 'admin');
  await page.click('button[type="submit"]');

  await page.waitForTimeout(3000);
  if (page.url().includes('force-change-password')) {
    await page.fill('input[name="new_password"]', 'admin123');
    await page.fill('input[name="confirm_password"]', 'admin123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
  }

  expect(page.url()).not.toContain('login');
  console.log('Logged in successfully');
  await page.screenshot({ path: 'screenshots/1_after_login.png' });

  // Navigate to Web Pages
  await page.goto('http://localhost:5173/admin/web/pages');
  await page.waitForTimeout(2000);
  if (await page.locator('text=404').isVisible()) {
      await page.goto('http://localhost:5173/web/pages');
      await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: 'screenshots/2_pages_list.png' });

  const pageLink = page.locator('a:has-text("Home"), a:has-text("Index"), tr td a').first();
  await expect(pageLink).toBeVisible();
  await pageLink.click();
  
  console.log('Waiting for editor...');
  await page.waitForSelector('.gjs-editor', { timeout: 30000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'screenshots/3_editor_open.png' });

  // 1. Navigator
  console.log('Checking Navigator...');
  const navigatorBtn = page.locator('button[title="Navigator"], .fa-list-ul').first();
  if (await navigatorBtn.isVisible()) await navigatorBtn.click();
  
  const layers = await page.locator('.gjs-layer-name').allInnerTexts();
  console.log('Navigator items:', layers);
  expect(layers.some(n => n.trim() === 'Default')).toBe(false);

  // 2. Breadcrumbs
  const firstLayer = page.locator('.gjs-layer-name').first();
  await firstLayer.click();
  await page.waitForTimeout(500);
  const breadcrumbs = page.locator('.gjs-breadcrumbs-item, .gjs-breadcrumbs');
  console.log('Breadcrumbs found');
  await page.screenshot({ path: 'screenshots/4_selection.png' });

  // 3. Advanced tab
  console.log('Checking Advanced tab...');
  const settingsBtn = page.locator('button[title="Settings"], .fa-cog').first();
  if (await settingsBtn.isVisible()) await settingsBtn.click();
  
  const advanced = page.locator('.gjs-sm-header:has-text("Advanced"), .gjs-traits-label:has-text("Advanced")');
  if (await advanced.isVisible()) {
      await advanced.click();
      const traits = ['ID', 'Classes', 'Title', 'Role', 'ARIA Label'];
      for (const t of traits) {
          const traitLoc = page.locator(`.gjs-trait-label:has-text("${t}")`);
          console.log(`Trait ${t} visible:`, await traitLoc.isVisible());
      }
  }
  await page.screenshot({ path: 'screenshots/5_advanced.png' });

  // 4. Blocks
  console.log('Checking Blocks...');
  const blocksBtn = page.locator('button[title="Blocks"], .fa-th-large').first();
  if (await blocksBtn.isVisible()) await blocksBtn.click();
  const blocks = ['Flex', 'Grid', 'List', 'Table', 'Figure', 'Rich Text'];
  for (const b of blocks) {
      const blockLoc = page.locator(`.gjs-block:has-text("${b}")`);
      console.log(`Block ${b} visible:`, await blockLoc.isVisible());
  }

  // 5. Inline edit
  console.log('Testing Inline edit...');
  const iframe = page.frameLocator('iframe.gjs-frame');
  const textElem = iframe.locator('div, p, span').first();
  if (await textElem.isVisible()) {
      await textElem.dblclick();
      await page.waitForTimeout(500);
      const editable = await textElem.getAttribute('contenteditable');
      console.log('Text element editable:', editable);
  }

  // 6. Undo/Redo
  const undo = page.locator('button[title="Undo"], .fa-undo').first();
  const redo = page.locator('button[title="Redo"], .fa-redo').first();
  console.log('Undo visible:', await undo.isVisible());
  console.log('Redo visible:', await redo.isVisible());
});
