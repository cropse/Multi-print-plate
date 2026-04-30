function parsePlateNames(xmlString) {
  const plateNames = new Map();

  if (!xmlString) {
    return plateNames;
  }

  try {
    const parser = new DOMParser();
    const document = parser.parseFromString(xmlString, 'application/xml');

    if (document.querySelector('parsererror')) {
      return plateNames;
    }

    const plateElements = document.querySelectorAll('plate');

    for (const plateElement of plateElements) {
      const metadataElements = plateElement.querySelectorAll('metadata');
      let plateId;
      let plateName;

      for (const metadataElement of metadataElements) {
        const key = metadataElement.getAttribute('key');
        const value = metadataElement.getAttribute('value');

        if (key === 'plater_id') {
          plateId = Number(value);
        }

        if (key === 'plater_name') {
          plateName = value;
        }
      }

      if (!Number.isFinite(plateId) || !plateName) {
        continue;
      }

      plateNames.set(plateId, plateName);
    }
  } catch {
    return new Map();
  }

  return plateNames;
}

export { parsePlateNames };
