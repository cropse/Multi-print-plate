import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { parsePlateNames } from '../js/modules/xml-parser.js';

class FakeMetadataElement {
  constructor(attributes) {
    this.attributes = attributes;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }
}

class FakePlateElement {
  constructor(metadata) {
    this.metadata = metadata;
  }

  querySelectorAll(selector) {
    return selector === 'metadata' ? this.metadata : [];
  }
}

class FakeDocument {
  constructor(xmlString) {
    this.xmlString = xmlString;
    this.isMalformed = !xmlString.includes('</config>');
    this.plates = this.isMalformed ? [] : this.parsePlates(xmlString);
  }

  parsePlates(xmlString) {
    const plateMatches = [...xmlString.matchAll(/<plate>([\s\S]*?)<\/plate>/g)];

    return plateMatches.map(([, plateContent]) => {
      const metadata = [...plateContent.matchAll(/<metadata\s+key="([^"]+)"\s+value="([^"]*)"\s*\/>/g)].map(
        ([, key, value]) => new FakeMetadataElement({ key, value }),
      );

      return new FakePlateElement(metadata);
    });
  }

  querySelector(selector) {
    if (selector === 'parsererror' && this.isMalformed) {
      return { nodeName: 'parsererror' };
    }

    return null;
  }

  querySelectorAll(selector) {
    return selector === 'plate' ? this.plates : [];
  }
}

class FakeDOMParser {
  parseFromString(xmlString) {
    return new FakeDocument(xmlString);
  }
}

const originalDOMParser = globalThis.DOMParser;

beforeEach(() => {
  globalThis.DOMParser = FakeDOMParser;
});

afterEach(() => {
  if (originalDOMParser) {
    globalThis.DOMParser = originalDOMParser;
    return;
  }

  delete globalThis.DOMParser;
});

describe('xml-parser', () => {
  test('parsePlateNames maps valid plate ids to names', () => {
    const xml = `<?xml version="1.0"?>
      <config>
        <plate>
          <metadata key="plater_id" value="1"/>
          <metadata key="plater_name" value="Test Plate One"/>
        </plate>
        <plate>
          <metadata key="plater_id" value="2"/>
          <metadata key="plater_name" value="Test Plate Two"/>
        </plate>
      </config>`;

    const result = parsePlateNames(xml);

    expect(result).toBeInstanceOf(Map);
    expect(Array.from(result.entries())).toEqual([
      [1, 'Test Plate One'],
      [2, 'Test Plate Two'],
    ]);
  });

  test('parsePlateNames returns an empty map for null input', () => {
    expect(parsePlateNames(null)).toEqual(new Map());
  });

  test('parsePlateNames returns an empty map for malformed xml', () => {
    const result = parsePlateNames('<config><plate>');

    expect(result).toEqual(new Map());
  });

  test('parsePlateNames skips plates without names', () => {
    const xml = `<?xml version="1.0"?>
      <config>
        <plate>
          <metadata key="plater_id" value="1"/>
          <metadata key="plater_name" value="Named Plate"/>
        </plate>
        <plate>
          <metadata key="plater_id" value="2"/>
        </plate>
      </config>`;

    const result = parsePlateNames(xml);

    expect(Array.from(result.entries())).toEqual([[1, 'Named Plate']]);
  });
});
