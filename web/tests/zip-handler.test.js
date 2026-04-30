import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { describe, expect, test } from 'vitest';

import { extract3MF, getFile, listFiles } from '../js/modules/zip-handler.js';

globalThis.JSZip = JSZip;

const sample3mfPath = fileURLToPath(new URL('./fixtures/sample.gcode.3mf', import.meta.url));

describe('zip-handler', () => {
  test('extract3MF loads a valid 3MF archive', async () => {
    const fixture = await readFile(sample3mfPath);

    const result = await extract3MF(fixture);

    expect(result.success).toBe(true);
    expect(result.zip).toBeInstanceOf(JSZip);
  });

  test('extract3MF rejects invalid archive data', async () => {
    const result = await extract3MF(Uint8Array.from([1, 2, 3, 4]));

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/zip|archive|format|corrupt/i);
  });

  test('listFiles returns files from the requested folder', async () => {
    const fixture = await readFile(sample3mfPath);
    const extracted = await extract3MF(fixture);

    expect(extracted.success).toBe(true);

    const result = await listFiles(extracted.zip, 'Metadata');

    expect(result).toEqual({
      success: true,
      files: expect.arrayContaining(['plate_1.gcode', 'plate_1.png', 'plate_2.gcode', 'model_settings.config']),
    });
    expect(result.files).toHaveLength(4);
  });

  test('getFile returns the requested file content', async () => {
    const fixture = await readFile(sample3mfPath);
    const extracted = await extract3MF(fixture);

    expect(extracted.success).toBe(true);

    const result = await getFile(extracted.zip, 'Metadata/model_settings.config');

    expect(result.success).toBe(true);
    expect(result.content).toContain('<config>');
    expect(result.content).toContain('Plate 1');
  });
});
