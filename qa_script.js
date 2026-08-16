const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER_ERROR:', err.message));

  try {
    console.log('Navigating to login page...');
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });

    console.log('Attempting login...');
    await page.waitForSelector('input[name="username"]');
    await page.fill('input[name="username"]', 'admin');
    await page.fill('input[name="password"]', 'admin');
    await page.click('button[type="submit"]');

    await page.waitForTimeout(3000);
    if (page.url().includes('force-change-password')) {
      console.log('Password change required.');
      await page.fill('input[name="new_password"]', 'admin123');
      await page.fill('input[name="confirm_password"]', 'admin123');
      await page.click('button[type="submit"]');
      await page.waitForTimeout(3000);
    }

    console.log('Current URL after login:', page.url());
    await page.screenshot({ path: 'after_login.png' });

    if (page.url().includes('login')) {
        console.log('Login failed.');
        return;
    }

    console.log('Navigating to Web Pages...');
    // The user mentioned "admin Web Pages". Based on AGENTS.md, modules are registered in backend/app/modules/registration.py
    // and CMS lives in backend/app/web/. Frontend routes for web module are likely under /admin/web or similar.
    await page.goto('http://localhost:5173/admin/web/pages', { waitUntil: 'networkidle' });
    await page.screenshot({ path: 'web_pages_list.png' });

    const pageLink = await page.locator('a:has-text("Home"), a:has-text("Index"), a[href*="/editor/"]').first();
    if (await pageLink.isVisible()) {
      console.log('Opening page editor...');
      await pageLink.click();
      await page.waitForSelector('.gjs-editor', { timeout: 30000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'editor_open.png' });

      // 1. Navigator without 'Default'
      console.log('Checking Navigator...');
      const navigatorBtn = page.locator('button[title="Navigator"], .fa-list-ul');
      if (await navigatorBtn.isVisible()) await navigatorBtn.click();
      
      const layers = await page.locator('.gjs-layer-name').allInnerTexts();
      console.log('Navigator items:', layers);
      const hasDefault = layers.some(n => n.trim() === 'Default');
      console.log('Has anonymous "Default" items:', hasDefault);

      // 2. Selection and breadcrumbs
      const firstLayer = page.locator('.gjs-layer-name').first();
      if (await firstLayer.isVisible()) {
          await firstLayer.click();
          await page.waitForTimeout(500);
          const breadcrumbs = page.locator('.gjs-breadcrumbs-item, .gjs-breadcrumbs');
          console.log('Breadcrumbs count:', await breadcrumbs.count());
      }

      // 3. Advanced tab
      console.log('Checking Advanced tab...');
      const settingsBtn = page.locator('button[title="Settings"], .fa-cog');
      if (await settingsBtn.isVisible()) await settingsBtn.click();
      
      const advanced = page.locator('.gjs-sm-header:has-text("Advanced"), .gjs-traits-label:has-text("Advanced")');
      if (await advanced.isVisible()) {
          await advanced.click();
          const traits = ['ID', 'Classes', 'Title', 'Role', 'ARIA Label'];
          for (const t of traits) {
              console.log(`Trait ${t} visible:`, await page.locator(`.gjs-trait-label:has-text("${t}")`).isVisible());
          }
      }

      // 4. Blocks
      console.log('Checking Blocks...');
      const blocksBtn = page.locator('button[title="Blocks"], .fa-th-large');
      if (await blocksBtn.isVisible()) await blocksBtn.click();
      const blocks = ['Flex', 'Grid', 'List', 'Table', 'Figure', 'Rich Text'];
      for (const b of blocks) {
          console.log(`Block ${b} visible:`, await page.locator(`.gjs-block:has-text("${b}")`).isVisible());
      }

      // 5. Inline edit
      console.log('Testing Inline edit...');
      const iframe = page.frameLocator('iframe.gjs-frame');
      const textElem = iframe.locator('div, p, span').first();
      if (await textElem.isVisible()) {
          await textElem.dblclick();
          await page.waitForTimeout(500);
          console.log('Text editable:', await textElem.getAttribute('contenteditable'));
      }

      // 6. Undo/Redo
      console.log('Undo/Redo visible:', await page.locator('button[title="Undo"]').isVisible(), await page.locator('button[title="Redo"]').isVisible());

    } else {
      console.log('Page link not found.');
    }
  } catch (err) {
    console.error('QA Script Error:', err);
  } finally {
    await browser.close();
  }
})();
