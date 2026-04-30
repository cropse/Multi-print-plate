import { describe, expect, test } from 'vitest';

import { extractPlateNumber, generateFilename, mergeGCodeFiles } from '../js/modules/gcode-merger.js';

describe('gcode-merger', () => {
  test('extractPlateNumber returns the plate number from a simple filename', () => {
    expect(extractPlateNumber('plate_1.gcode')).toBe(1);
  });

  test('extractPlateNumber returns the plate number from a nested path', () => {
    expect(extractPlateNumber('Metadata/plate_12.gcode')).toBe(12);
  });

  test('extractPlateNumber returns null for non-plate files', () => {
    expect(extractPlateNumber('other.gcode')).toBeNull();
  });

  test('mergeGCodeFiles duplicates a single plate and adds headers', () => {
    const merged = mergeGCodeFiles([
      {
        name: 'Plate One',
        content: 'G1 X1 Y1',
        multiplier: 2,
      },
    ]);

    expect(merged).toContain('; Merged GCode: Plate One (1/2)\nG1 X1 Y1\n');
    expect(merged).toContain('; Merged GCode: Plate One (2/2)\nG1 X1 Y1\n');
  });

  test('mergeGCodeFiles keeps multi-merge-delete lines only in the first duplicate', () => {
    const merged = mergeGCodeFiles([
      {
        name: 'Plate One',
        content: '; intro\n; multi-merge-delete remove-me\nG1 X1 Y1',
        multiplier: 2,
      },
    ]);

    expect(merged).toContain('; Merged GCode: Plate One (1/2)\n; intro\n; multi-merge-delete remove-me\nG1 X1 Y1\n');
    expect(merged).toContain('; Merged GCode: Plate One (2/2)\n; intro\nG1 X1 Y1\n');
    expect(merged.match(/multi-merge-delete/g)).toHaveLength(1);
  });

  test('mergeGCodeFiles keeps multi-merge-delete only in the very first duplicate across all plates', () => {
    const merged = mergeGCodeFiles([
      {
        name: 'Plate One',
        content: '; intro\n; multi-merge-delete swap-plate\nG1 X1 Y1',
        multiplier: 2,
      },
      {
        name: 'Plate Two',
        content: '; plate2\n; multi-merge-delete swap-plate\nG2 X2 Y2',
        multiplier: 1,
      },
    ]);

    // First duplicate of plate 1 keeps multi-merge-delete
    expect(merged).toContain('; Merged GCode: Plate One (1/2)\n; intro\n; multi-merge-delete swap-plate\nG1 X1 Y1\n');
    // Second duplicate of plate 1 removes multi-merge-delete
    expect(merged).toContain('; Merged GCode: Plate One (2/2)\n; intro\nG1 X1 Y1\n');
    // First duplicate of plate 2 ALSO removes multi-merge-delete (global flag, not per-plate)
    expect(merged).toContain('; Merged GCode: Plate Two (1/1)\n; plate2\nG2 X2 Y2\n');
    // Exactly one multi-merge-delete line in entire output
    expect(merged.match(/multi-merge-delete/g)).toHaveLength(1);
  });

  test('generateFilename builds a sanitized merged filename', () => {
    const filename = generateFilename([
      { name: 'Test Plate One', multiplier: 2 },
      { name: 'Plate #2', multiplier: 1 },
    ]);

    expect(filename).toBe('Test-Plate-Onex2-Plate-2x1.gcode.3mf');
  });
});
