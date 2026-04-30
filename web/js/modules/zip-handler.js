function normalizeError(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallbackMessage;
}

async function extract3MF(file) {
  try {
    const zip = await JSZip.loadAsync(file);
    return { success: true, zip };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error, 'Failed to extract 3MF archive.'),
    };
  }
}

async function create3MF(files) {
  try {
    const zip = new JSZip();

    for (const [path, content] of Object.entries(files ?? {})) {
      zip.file(path, content);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    return { success: true, blob };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error, 'Failed to create 3MF archive.'),
    };
  }
}

function isBinaryContent(fileEntry) {
  const binaryExtensions = ['.model', '.png', '.jpg', '.jpeg', '.gif', '.bin'];
  return binaryExtensions.some((extension) => fileEntry.name.toLowerCase().endsWith(extension));
}

async function getFile(zip, path) {
  try {
    const fileEntry = zip?.file(path);

    if (!fileEntry) {
      return {
        success: false,
        error: `File not found: ${path}`,
      };
    }

    const content = await fileEntry.async(isBinaryContent(fileEntry) ? 'uint8array' : 'string');
    return { success: true, content };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error, `Failed to read file: ${path}`),
    };
  }
}

async function listFiles(zip, folder) {
  try {
    const targetFolder = zip?.folder(folder);

    if (!targetFolder) {
      return { success: true, files: [] };
    }

    const prefix = folder.endsWith('/') ? folder : `${folder}/`;
    const files = [];

    targetFolder.forEach((relativePath, fileEntry) => {
      if (!fileEntry.dir) {
        files.push(relativePath.startsWith(prefix) ? relativePath.slice(prefix.length) : relativePath);
      }
    });

    return { success: true, files };
  } catch (error) {
    return {
      success: false,
      error: normalizeError(error, `Failed to list files in folder: ${folder}`),
    };
  }
}

async function listAllFiles(zip) {
	const allFiles = [];
	
	zip.forEach((relativePath, fileEntry) => {
		if (!fileEntry.dir) {
			allFiles.push(relativePath);
		}
	});
	
	return { success: true, files: allFiles };
}

export { extract3MF, create3MF, getFile, listFiles, listAllFiles };
