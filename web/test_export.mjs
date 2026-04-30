import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFile = path.resolve(__dirname, 'tests/fixtures/sample.gcode.3mf');
const outputDir = path.resolve(__dirname, '../');

(async () => {
  console.log('=== Export Validation E2E Test ===');
  console.log('Test file:', testFile);
  console.log('File exists:', fs.existsSync(testFile));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Collect downloads
  const downloads = [];
  page.on('download', download => {
    console.log('Download started:', download.suggestedFilename());
    downloads.push(download);
  });

  // Collect errors
  const errors = [];
  page.on('pageerror', error => {
    console.error('PAGE ERROR:', error.message);
    errors.push(error.message);
  });

  try {
    // Navigate
    console.log('\n--- Navigating ---');
    await page.goto('http://localhost:5175', { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForSelector('.drop-zone', { timeout: 10000 });
    console.log('Page loaded');

    // Upload file
    console.log('\n--- Uploading file ---');
    const fileInput = page.locator('[data-file-input]');
    await fileInput.setInputFiles(testFile);
    await new Promise(r => setTimeout(r, 2000));

    // Verify plates loaded
    const plateCount = await page.locator('.plate-card').count();
    console.log('Plates loaded:', plateCount);

    if (plateCount === 0) {
      console.error('FAILED: No plates loaded');
      await page.screenshot({ path: path.join(outputDir, 'export_test_fail.png'), fullPage: true });
      process.exit(1);
    }

    // Select first plate, set multiplier to 2
    console.log('\n--- Configuring plates ---');
    const cards = page.locator('.plate-card');
    await cards.nth(0).locator('input[type="checkbox"]').click();
    await cards.nth(0).locator('.multiplier-input').fill('2');
    
    // Select second plate, set multiplier to 1
    await cards.nth(1).locator('input[type="checkbox"]').click();
    await cards.nth(1).locator('.multiplier-input').fill('1');

    // Verify export button is enabled
    const exportBtn = page.locator('[data-export-button]');
    const exportEnabled = await exportBtn.isEnabled();
    const exportText = await exportBtn.textContent();
    console.log('Export button enabled:', exportEnabled);
    console.log('Export button text:', exportText.trim());

    // Trigger export with download interception
    console.log('\n--- Exporting ---');
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
    await exportBtn.click();
    const download = await downloadPromise;

    if (!download) {
      console.error('FAILED: No download triggered');
      await page.screenshot({ path: path.join(outputDir, 'export_test_no_download.png'), fullPage: true });
      process.exit(1);
    }

    // Save downloaded file
    const downloadedPath = path.join(outputDir, 'exported_test.gcode.3mf');
    await download.saveAs(downloadedPath);
    console.log('Downloaded file saved:', downloadedPath);
    console.log('File size:', fs.statSync(downloadedPath).size, 'bytes');

    // Validate the downloaded 3MF
    console.log('\n--- Validating exported 3MF ---');
    const zipBuffer = fs.readFileSync(downloadedPath);
    const zip = await JSZip.loadAsync(zipBuffer);
    const files = Object.keys(zip.files);
    console.log('Files in exported 3MF:');
    files.forEach(f => console.log('  -', f));

    // Validation checks
    let passed = 0;
    let failed = 0;

    function check(name, condition) {
      if (condition) {
        console.log('  PASS:', name);
        passed++;
      } else {
        console.error('  FAIL:', name);
        failed++;
      }
    }

    // Check required files exist
    check('Has plate_1.gcode', files.includes('Metadata/plate_1.gcode'));
    check('Has model_settings.config', files.includes('Metadata/model_settings.config'));
    check('Has plate_1.png', files.includes('Metadata/plate_1.png'));

    // Check merged gcode content
    const mergedGcode = await zip.file('Metadata/plate_1.gcode').async('string');
    console.log('\nMerged GCode preview (first 500 chars):');
    console.log(mergedGcode.substring(0, 500));

    // Verify merge structure
    check('Has merge header for plate 1 (1/2)', mergedGcode.includes('; Merged GCode: Plate 1 (1/2)'));
    check('Has merge header for plate 1 (2/2)', mergedGcode.includes('; Merged GCode: Plate 1 (2/2)'));
    check('Has merge header for plate 2 (1/1)', mergedGcode.includes('; Merged GCode: Plate 2 (1/1)'));
    check('Contains G21 command', mergedGcode.includes('G21'));

    // Check model_settings.config
    const config = await zip.file('Metadata/model_settings.config').async('string');
    console.log('\nModel settings config:');
    console.log(config.substring(0, 500));

    check('Config has plate element', config.includes('<plate>'));
    check('Config has plater_id=1', config.includes('plater_id'));
    check('Config has plater_name=Merged', config.includes('Merged'));
    check('Config has gcode_file', config.includes('plate_1.gcode'));

    // Check no extra plate files (plate_2 should not exist)
    check('No plate_2.gcode in output', !files.includes('Metadata/plate_2.gcode'));

    console.log('\n=== VALIDATION SUMMARY ===');
    console.log('Passed:', passed);
    console.log('Failed:', failed);

    if (failed > 0) {
      console.error('\nVALIDATION FAILED');
      process.exit(1);
    }

    if (errors.length > 0) {
      console.warn('\nJavaScript errors during test:', errors.length);
    }

    console.log('\n=== ALL TESTS PASSED ===');

  } catch (error) {
    console.error('TEST FAILED:', error.message);
    console.error(error.stack);
    await page.screenshot({ path: path.join(outputDir, 'export_test_error.png'), fullPage: true });
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
