function extractPlateNumber(filename) {
  if (typeof filename !== 'string') {
    return null;
  }

  const match = filename.toLowerCase().match(/plate_(\d+)\.gcode/);
  return match ? Number.parseInt(match[1], 10) : null;
}

function removeMultiMergeDeleteLines(content) {
  if (typeof content !== 'string' || !content) {
    return '';
  }

  return content
    .split(/\r?\n/)
    .filter((line) => !line.includes('multi-merge-delete'))
    .join('\n');
}

function normalizePlateContent(content, keepMultiMergeDelete) {
  if (typeof content !== 'string' || !content) {
    return '';
  }

  const normalizedContent = keepMultiMergeDelete ? content : removeMultiMergeDeleteLines(content);
  return normalizedContent.endsWith('\n') ? normalizedContent : `${normalizedContent}\n`;
}

function sanitizeFilenamePart(name) {
  if (typeof name !== 'string') {
    return 'plate';
  }

  const sanitized = name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_-]+/g, '-');

  return sanitized || 'plate';
}

function mergeGCodeFiles(plates) {
  if (!Array.isArray(plates) || plates.length === 0) {
    return '';
  }

  const mergedSections = [];
  let isFirstDuplicate = true;
  let isFirstPlate = true;

  for (const plate of plates) {
    const name = typeof plate?.name === 'string' && plate.name.trim() ? plate.name.trim() : 'Plate';
    const content = typeof plate?.content === 'string' ? plate.content : '';
    const multiplier = Number.isInteger(plate?.multiplier) && plate.multiplier > 0 ? plate.multiplier : 0;

    // Add newline separator between plates (not between duplicates of same plate)
    if (!isFirstPlate) {
      mergedSections.push('');
    }
    isFirstPlate = false;

    for (let duplicateIndex = 1; duplicateIndex <= multiplier; duplicateIndex += 1) {
      const processedContent = normalizePlateContent(content, isFirstDuplicate);
      mergedSections.push(`; Merged GCode: ${name} (${duplicateIndex}/${multiplier})\n${processedContent}`);
      isFirstDuplicate = false;
    }
  }

  return mergedSections.join('\n');
}

function generateFilename(plates) {
  if (!Array.isArray(plates) || plates.length === 0) {
    return 'merged_project.gcode.3mf';
  }

  const parts = plates
    .map((plate) => {
      const multiplier = Number.isInteger(plate?.multiplier) && plate.multiplier > 0 ? plate.multiplier : 0;

      if (multiplier === 0) {
        return null;
      }

      return `${sanitizeFilenamePart(plate?.name)}x${multiplier}`;
    })
    .filter(Boolean);

  if (parts.length === 0) {
    return 'merged_project.gcode.3mf';
  }

  const filename = `${parts.join('-')}.gcode.3mf`;
  return filename.length > 120 ? 'merged_project.gcode.3mf' : filename;
}

export { extractPlateNumber, mergeGCodeFiles, generateFilename };
