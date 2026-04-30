import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFile = path.resolve(__dirname, '..', 'Staghorn plate plug connector All mini.gcode.3mf');

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture console
  const consoleMessages = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      console.error(`BROWSER ERROR:`, text);
    } else {
      console.log(`BROWSER [${msg.type()}]:`, text);
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    console.error('BROWSER PAGE ERROR:', error.message);
  });

  // Capture network errors
  page.on('requestfailed', request => {
    console.error('NETWORK FAILED:', request.url(), request.failure().errorText);
  });

  try {
    console.log('Navigating to http://localhost:5173');
    await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded', timeout: 10000 });
    console.log('Page loaded');
    
    await page.screenshot({ path: 'test_initial.png', fullPage: true });

    await page.waitForSelector('.drop-zone', { timeout: 10000 });
    console.log('Drop zone found');

    const fileInput = page.locator('[data-file-input]');
    console.log('File exists:', testFile);

    // Check file input state
    const inputVisible = await fileInput.isVisible();
    const inputDisabled = await fileInput.isDisabled();
    console.log('File input visible:', inputVisible, 'disabled:', inputDisabled);

    await fileInput.setInputFiles(testFile);
    console.log('File set, waiting...');

    // Wait for processing
    await new Promise(r => setTimeout(r, 5000));

    // Check state
    const plateCount = await page.locator('.plate-card').count();
    const errorCount = await page.locator('.status-bar--error').count();
    console.log('Plates:', plateCount, 'Errors:', errorCount);

    // Get page content to debug
    const bodyHtml = await page.content();
    console.log('Body length:', bodyHtml.length);

    // Take screenshot regardless
    await page.screenshot({ path: 'test_after_upload.png', fullPage: true });
    console.log('Screenshot saved');

    if (plateCount === 0 && errorCount === 0) {
      console.error('FAILED: No plates rendered, no errors shown');

      // Check overlay state
      const overlayClasses = await page.locator('#loading-overlay').getAttribute('class');
      console.log('Overlay classes:', overlayClasses);

      // Check status bar
      const statusBarText = await page.locator('.status-bar').first().textContent().catch(() => 'none');
      console.log('Status bar:', statusBarText);

      // Check for JS errors
      const jsErrors = consoleMessages.filter(m => m.type === 'error' && !m.text.includes('ERR_FILE_NOT_FOUND'));
      if (jsErrors.length > 0) {
        console.error('JavaScript errors:', jsErrors.map(e => e.text));
      }
    }

    console.log('Plates found:', plateCount);

    if (plateCount > 0) {
      console.log('SUCCESS: Plates rendered');

      // Click checkboxes on first 2 plate cards
      const cards = page.locator('.plate-card');
      await cards.nth(0).locator('input[type="checkbox"]').click();
      await cards.nth(1).locator('input[type="checkbox"]').click();

      const exportBtn = page.locator('[data-export-button]');
      console.log('Export enabled:', await exportBtn.isEnabled());
      console.log('Export text:', await exportBtn.textContent());

      // Check plate summary
      const summaryText = await page.locator('#plate-summary-bar').textContent().catch(() => 'none');
      console.log('Plate summary:', summaryText);
    }

    await page.screenshot({ path: 'test_result.png', fullPage: true });

  } catch (error) {
    console.error('TEST FAILED:', error.message);
    await page.screenshot({ path: 'test_error.png', fullPage: true });
  } finally {
    await new Promise(resolve => setTimeout(resolve, 2000));
    await browser.close();
  }
})();
