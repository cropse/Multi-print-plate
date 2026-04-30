import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testFile = path.resolve(__dirname, '..', 'Staghorn plate plug connector All mini.gcode.3mf');

// Import the modules
const { extract3MF } = await import('./js/modules/zip-handler.js');
const { parsePlateNames } = await import('./js/modules/xml-parser.js');
const { mergeGCodeFiles, generateFilename } = await import('./js/modules/gcode-merger.js');

console.log('Testing core logic...\n');

// Test 1: Extract 3MF
console.log('Test 1: Extract 3MF');
const fileBuffer = await readFile(testFile);
const extracted = await extract3MF({ name: 'test.gcode.3mf', arrayBuffer: () => Promise.resolve(fileBuffer.buffer) });

if (!extracted.success) {
  console.error('FAILED: Extract failed -', extracted.error);
  process.exit(1);
}
console.log('PASSED: Extract succeeded, zip:', typeof extracted.zip);

// Test 2: Parse plate names
console.log('\nTest 2: Parse plate names');
const plateNames = await parsePlateNames(extracted.zip);
console.log('Plates found:', plateNames.length);
if (plateNames.length === 0) {
  console.error('FAILED: No plates found');
  process.exit(1);
}
console.log('PASSED: Found', plateNames.length, 'plates');
console.log('First plate:', plateNames[0]);

// Test 3: List metadata files
console.log('\nTest 3: List metadata files');
const { listFiles } = await import('./js/modules/zip-handler.js');
const files = await listFiles(extracted.zip, 'Metadata/');
console.log('Metadata files:', files);

// Test 4: Read a plate gcode
console.log('\nTest 4: Read plate gcode');
const { getFile } = await import('./js/modules/zip-handler.js');
const gcode = await getFile(extracted.zip, 'Metadata/plate_1.gcode');
console.log('Plate 1 gcode length:', gcode?.length || 0);
if (!gcode || gcode.length === 0) {
  console.error('FAILED: Could not read plate gcode');
  process.exit(1);
}
console.log('PASSED: Read plate gcode');

// Test 5: Merge gcode
console.log('\nTest 5: Merge gcode');
const merged = mergeGCodeFiles([gcode, gcode, gcode]);
console.log('Merged gcode length:', merged.length);
console.log('PASSED: Merge succeeded');

// Test 6: Generate filename
console.log('\nTest 6: Generate filename');
const filename = generateFilename('test.gcode.3mf', 3);
console.log('Generated filename:', filename);
console.log('PASSED: Filename generated');

console.log('\n=== ALL TESTS PASSED ===');
