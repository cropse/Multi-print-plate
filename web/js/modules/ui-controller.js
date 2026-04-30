const DEFAULT_DROP_ZONE_SELECTOR = '.drop-zone';
const DEFAULT_STATUS_BAR_SELECTOR = '.status-bar';
const DEFAULT_FILE_PICKER_SELECTOR = '[data-file-picker]';
const DEFAULT_FILE_INPUT_SELECTOR = '[data-file-input]';
const DEFAULT_EXPORT_BUTTON_SELECTOR = '[data-export-button]';
const ACCEPTED_FILE_EXTENSIONS = ['.gcode.3mf', '.3mf'];
const DEFAULT_MULTIPLIER = 2;
const MIN_MULTIPLIER = 1;
const MAX_MULTIPLIER = 100;

let fileSelectedCallback = null;
let statusBarSnapshot = null;
let activeLoadingMessage = '';
let plateSelectionCallback = null;
const plateCardEntries = [];
let plateGridContainer = null;
let exportButtonController = null;
let exportButtonClickHandler = null;
let exportButtonDefaultLabel = '';
let exportSelectionState = false;

function clampMultiplier(value) {
  const parsedValue = Number.parseInt(value, 10);

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_MULTIPLIER;
  }

  return Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, parsedValue));
}

function validateMultiplierInput(value) {
  const normalizedValue = typeof value === 'string' ? value.trim() : `${value ?? ''}`.trim();

  if (!/^\d+$/.test(normalizedValue)) {
    return {
      valid: false,
      value: DEFAULT_MULTIPLIER,
      wasClamped: false,
      message: 'Multiplier must be an integer from 1 to 100.',
    };
  }

  const parsedValue = Number.parseInt(normalizedValue, 10);
  const clampedValue = clampMultiplier(parsedValue);

  if (parsedValue !== clampedValue) {
    return {
      valid: true,
      value: clampedValue,
      wasClamped: true,
      message: `Multiplier adjusted to ${clampedValue}. Allowed range is 1-100.`,
    };
  }

  return {
    valid: true,
    value: clampedValue,
    wasClamped: false,
    message: '',
  };
}

function getPlateName(plate) {
  if (typeof plate?.name === 'string' && plate.name.trim()) {
    return plate.name.trim();
  }

  return `Plate ${plate?.id ?? 'Unknown'}`;
}

function getPlateMetaLabel(plate) {
  const plateId = plate?.id ?? 'Unknown';
  const filename = typeof plate?.gcode === 'string' && plate.gcode.trim() ? plate.gcode.trim() : null;

  return filename ? `Plate ${plateId} • ${filename}` : `Plate ${plateId}`;
}

function emitPlateSelectionChange() {
  if (typeof plateSelectionCallback === 'function') {
    plateSelectionCallback(getPlateSelections());
  }
}

function createPlateThumbnail(plate) {
	const thumbnailWrapper = document.createElement('div');
	thumbnailWrapper.className = 'plate-card__thumbnail mb-3 flex h-36 w-full items-center justify-center rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 text-center text-sm font-medium text-slate-400 overflow-hidden';

	if (typeof plate?.thumbnail === 'string' && plate.thumbnail.trim()) {
		const image = document.createElement('img');
		image.src = plate.thumbnail;
		image.alt = `${getPlateName(plate)} thumbnail`;
		image.className = 'h-full w-full object-cover transition-transform duration-200 hover:scale-105';
		thumbnailWrapper.append(image);
		return thumbnailWrapper;
	}

	const placeholder = document.createElement('div');
	placeholder.className = 'flex flex-col items-center gap-2 text-slate-400';
	placeholder.innerHTML = `
		<svg class="h-8 w-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
		</svg>
		<span class="text-xs">No preview</span>
	`;
	thumbnailWrapper.append(placeholder);
	return thumbnailWrapper;
}

function createPlateCard(plate, index) {
	const card = document.createElement('div');
	card.className = 'plate-card bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition-shadow duration-200 focus-within:ring-2 focus-within:ring-blue-200 focus-within:border-blue-400';
	card.dataset.plateIndex = String(index);
	card.dataset.plateId = String(plate?.id ?? index);
	card.setAttribute('role', 'group');
	card.setAttribute('aria-label', `Plate ${plate?.id ?? '?'}: ${getPlateName(plate)}`);
	card.setAttribute('tabindex', '0');

	// Thumbnail at top
	card.append(createPlateThumbnail(plate));

	// Header with badge, title, checkbox
	const header = document.createElement('div');
	header.className = 'flex items-start justify-between mt-3 gap-2';

	const titleSection = document.createElement('div');
	titleSection.className = 'flex-1 min-w-0';

	const badge = document.createElement('span');
	badge.className = 'inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 mb-1';
	badge.textContent = `Plate ${plate?.id ?? '?'}`;

	const title = document.createElement('h3');
	title.className = 'font-semibold text-slate-900 truncate text-sm';
	title.textContent = getPlateName(plate);

	titleSection.append(badge, title);
	header.append(titleSection);

	// Checkbox for selection
	const checkbox = document.createElement('input');
	checkbox.type = 'checkbox';
	checkbox.checked = plate?.selected !== false;
	checkbox.className = 'h-4 w-4 rounded border-slate-300 text-blue-500 focus:ring-blue-200 cursor-pointer mt-1';
	checkbox.setAttribute('aria-label', `Select ${getPlateName(plate)}`);

	header.append(checkbox);
	card.append(header);

	// Meta info
	const meta = document.createElement('p');
	meta.className = 'text-xs text-slate-400 mt-1 truncate';
	meta.textContent = getPlateMetaLabel(plate);
	card.append(meta);

	// Controls section
	const controls = document.createElement('div');
	controls.className = 'plate-card__controls flex items-center justify-between mt-3 pt-3 border-t border-slate-100';

	const multiplierSection = document.createElement('div');
	multiplierSection.className = 'flex items-center gap-2';

	const multiplierLabel = document.createElement('span');
	multiplierLabel.className = 'text-xs text-slate-500 font-medium';
	multiplierLabel.textContent = 'Copies:';

	const multiplierInput = document.createElement('input');
	multiplierInput.type = 'number';
	multiplierInput.value = String(clampMultiplier(plate?.multiplier ?? DEFAULT_MULTIPLIER));
	multiplierInput.min = String(MIN_MULTIPLIER);
	multiplierInput.max = String(MAX_MULTIPLIER);
	multiplierInput.step = '1';
	multiplierInput.inputMode = 'numeric';
	multiplierInput.className = 'w-16 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-900 text-center focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 transition-colors';
	multiplierInput.setAttribute('aria-label', `${getPlateName(plate)} multiplier`);
	multiplierInput.dataset.lastValidValue = multiplierInput.value;

	multiplierSection.append(multiplierLabel, multiplierInput);
	controls.append(multiplierSection);

	// Quick multiplier buttons
	const quickButtons = document.createElement('div');
	quickButtons.className = 'flex gap-1';

	[1, 2, 4, 8].forEach((val) => {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.className = `quick-mult-btn px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
			val === Number(multiplierInput.value)
				? 'bg-blue-50 border-blue-200 text-blue-700'
				: 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
		}`;
		btn.textContent = `×${val}`;
		btn.addEventListener('click', () => {
			multiplierInput.value = String(val);
			multiplierInput.dataset.lastValidValue = String(val);
			quickButtons.querySelectorAll('.quick-mult-btn').forEach((b) => {
				b.className = 'quick-mult-btn px-2 py-1 text-xs font-medium rounded-md border transition-colors bg-white border-slate-200 text-slate-600 hover:bg-slate-50';
			});
			btn.className = 'quick-mult-btn px-2 py-1 text-xs font-medium rounded-md border transition-colors bg-blue-50 border-blue-200 text-blue-700';
			emitPlateSelectionChange();
		});
		quickButtons.append(btn);
	});

	controls.append(quickButtons);
	card.append(controls);

	const commitMultiplierValue = () => {
		const fallbackValue = clampMultiplier(multiplierInput.dataset.lastValidValue ?? DEFAULT_MULTIPLIER);
		const validation = validateMultiplierInput(multiplierInput.value);

		if (!validation.valid) {
			multiplierInput.value = String(fallbackValue);
			showError(validation.message);
			emitPlateSelectionChange();
			return;
		}

		multiplierInput.value = String(validation.value);
		multiplierInput.dataset.lastValidValue = multiplierInput.value;

		if (validation.wasClamped) {
			showError(validation.message);
		} else {
			clearError();
		}

		emitPlateSelectionChange();
	};

	checkbox.addEventListener('change', emitPlateSelectionChange);
	multiplierInput.addEventListener('change', commitMultiplierValue);
	multiplierInput.addEventListener('blur', commitMultiplierValue);

	return {
		card,
		checkbox,
		multiplierInput,
		plate: {
			id: plate?.id,
			name: getPlateName(plate),
		},
	};
}

function renderPlates(plates, container = plateGridContainer) {
  if (!(container instanceof Element)) {
    throw new Error('renderPlates requires a valid container element.');
  }

  plateGridContainer = container;
  plateCardEntries.length = 0;

  const grid = document.createElement('div');
  grid.className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

  for (const [index, plate] of (Array.isArray(plates) ? plates : []).entries()) {
    const plateEntry = createPlateCard(plate, index);
    plateCardEntries.push(plateEntry);
    grid.append(plateEntry.card);
  }

  container.replaceChildren(grid);

  // Initialize keyboard navigation
  initPlateCardKeyboardNavigation(container);

  return plateCardEntries.map((plateEntry) => plateEntry.card);
}

function initPlateCardKeyboardNavigation(container) {
  const cards = container.querySelectorAll('.plate-card');
  if (cards.length === 0) return;

  cards.forEach((card, index) => {
    card.addEventListener('keydown', (e) => {
      let targetIndex = -1;

      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowRight':
          e.preventDefault();
          targetIndex = (index + 1) % cards.length;
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          e.preventDefault();
          targetIndex = (index - 1 + cards.length) % cards.length;
          break;
        case 'Home':
          e.preventDefault();
          targetIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          targetIndex = cards.length - 1;
          break;
        case ' ': {
          e.preventDefault();
          // Toggle checkbox in current card
          const checkbox = card.querySelector('input[type="checkbox"]');
          if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
          }
          return;
        }
        case 'Enter': {
          e.preventDefault();
          // Focus multiplier input in current card
          const multiplierInput = card.querySelector('input[type="number"]');
          if (multiplierInput) {
            multiplierInput.focus();
            multiplierInput.select();
          }
          return;
        }
      }

      if (targetIndex >= 0) {
        cards[targetIndex].focus();
      }
    });
  });
}

function getPlateSelections() {
  return plateCardEntries.map((plateEntry) => {
    const validation = validateMultiplierInput(plateEntry.multiplierInput.value);
    const multiplier = validation.valid
      ? validation.value
      : clampMultiplier(plateEntry.multiplierInput.dataset.lastValidValue ?? DEFAULT_MULTIPLIER);

    return {
      id: plateEntry.plate.id,
      name: plateEntry.plate.name,
      multiplier,
      selected: plateEntry.checkbox.checked,
    };
  });
}

function onSelectionChange(callback) {
  plateSelectionCallback = typeof callback === 'function' ? callback : null;
  return plateSelectionCallback;
}


function resolveElement(target, fallbackSelector) {
  if (target instanceof Element) {
    return target;
  }

  if (typeof target === 'string' && target.trim()) {
    return document.querySelector(target);
  }

  return document.querySelector(fallbackSelector);
}

function getStatusBar(statusBar) {
  return resolveElement(statusBar, DEFAULT_STATUS_BAR_SELECTOR);
}

function rememberStatusBarSnapshot(element) {
  if (!element || statusBarSnapshot) {
    return;
  }

  statusBarSnapshot = {
    textContent: element.textContent,
    ariaLive: element.getAttribute('aria-live'),
    role: element.getAttribute('role'),
  };
}

function setStatusMessage(message, { isError = false, statusBar, isHtml = false } = {}) {
  const statusElement = getStatusBar(statusBar);

  if (!statusElement) {
    return;
  }

  rememberStatusBarSnapshot(statusElement);
  statusElement.classList.toggle('status-bar--error', isError);
  statusElement.classList.toggle('status-bar--success', !isError && message.includes('success'));
  statusElement.setAttribute('role', 'status');
  statusElement.setAttribute('aria-live', isError ? 'assertive' : 'polite');

  if (isHtml) {
    statusElement.innerHTML = message;
  } else {
    statusElement.textContent = message;
  }
}

function resetStatusBar(statusBar) {
  const statusElement = getStatusBar(statusBar);

  if (!statusElement) {
    return;
  }

  // Don't reset if showing success state
  if (statusElement.classList.contains('status-bar--success')) {
    return;
  }

  statusElement.classList.remove('status-bar--error');

  if (statusBarSnapshot) {
    statusElement.textContent = statusBarSnapshot.textContent;

    if (statusBarSnapshot.role) {
      statusElement.setAttribute('role', statusBarSnapshot.role);
    } else {
      statusElement.removeAttribute('role');
    }

    if (statusBarSnapshot.ariaLive) {
      statusElement.setAttribute('aria-live', statusBarSnapshot.ariaLive);
    } else {
      statusElement.removeAttribute('aria-live');
    }

    return;
  }

  statusElement.textContent = '';
  statusElement.removeAttribute('role');
  statusElement.removeAttribute('aria-live');
}

function isValidFile(file) {
  if (!(file instanceof File)) {
    return false;
  }

  const normalizedName = file.name.toLowerCase();
  return ACCEPTED_FILE_EXTENSIONS.some((extension) => normalizedName.endsWith(extension));
}

function getValidationMessage(file) {
  const fileName = file?.name ? `"${file.name}"` : 'The selected file';
  return `${fileName} is not a supported 3MF file. Upload a .3mf or .gcode.3mf file.`;
}

function dispatchSelectedFile(file, options = {}) {
  if (!isValidFile(file)) {
    showError(getValidationMessage(file), { statusBar: options.statusBar });
    return false;
  }

  clearError({ statusBar: options.statusBar });

  if (typeof options.onFileSelected === 'function') {
    options.onFileSelected(file);
  }

  if (typeof fileSelectedCallback === 'function') {
    fileSelectedCallback(file);
  }

  return true;
}

function preventBrowserDefaults(event) {
  event.preventDefault();
  event.stopPropagation();
}

function createHiddenFileInput({ inputSelector, accept, parent } = {}) {
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.hidden = true;
  fileInput.tabIndex = -1;
  fileInput.accept = accept;

  if (typeof inputSelector === 'string' && inputSelector.startsWith('.')) {
    fileInput.className = inputSelector.slice(1);
  }

  if (typeof inputSelector === 'string' && inputSelector.startsWith('#')) {
    fileInput.id = inputSelector.slice(1);
  }

  fileInput.setAttribute('data-file-input', 'true');
  (parent ?? document.body).appendChild(fileInput);
  return fileInput;
}

function initDropZone(options = {}) {
  const {
    dropZone = DEFAULT_DROP_ZONE_SELECTOR,
    statusBar = DEFAULT_STATUS_BAR_SELECTOR,
    activeClass = 'drop-zone--active',
    onFileSelected,
  } = options;

  const dropZoneElement = resolveElement(dropZone, DEFAULT_DROP_ZONE_SELECTOR);

  if (!dropZoneElement) {
    return null;
  }

  let dragDepth = 0;

  // Global handlers to prevent browser from opening dropped files
  const handleDocumentDragOver = (event) => {
    event.preventDefault();
  };

  const handleDocumentDrop = (event) => {
    event.preventDefault();
  };

  // Attach global handlers
  document.addEventListener('dragover', handleDocumentDragOver);
  document.addEventListener('drop', handleDocumentDrop);

  const handleDragEnter = (event) => {
    preventBrowserDefaults(event);
    dragDepth += 1;
    dropZoneElement.classList.add(activeClass);
  };

  const handleDragOver = (event) => {
    preventBrowserDefaults(event);
    dropZoneElement.classList.add(activeClass);
  };

  const handleDragLeave = (event) => {
    preventBrowserDefaults(event);
    dragDepth = Math.max(0, dragDepth - 1);

    if (dragDepth === 0) {
      dropZoneElement.classList.remove(activeClass);
    }
  };

  const handleDrop = (event) => {
    preventBrowserDefaults(event);
    dragDepth = 0;
    dropZoneElement.classList.remove(activeClass);

    const files = Array.from(event.dataTransfer?.files ?? []);

    if (files.length === 0) {
      showError('No file was dropped. Upload a single .3mf or .gcode.3mf file.', { statusBar });
      return;
    }

    if (files.length > 1) {
      showError('Please upload one file at a time.', { statusBar });
      return;
    }

    dispatchSelectedFile(files[0], { onFileSelected, statusBar });
  };

  dropZoneElement.addEventListener('dragenter', handleDragEnter);
  dropZoneElement.addEventListener('dragover', handleDragOver);
  dropZoneElement.addEventListener('dragleave', handleDragLeave);
  dropZoneElement.addEventListener('drop', handleDrop);

  return {
    element: dropZoneElement,
    destroy() {
      dropZoneElement.classList.remove(activeClass);
      dropZoneElement.removeEventListener('dragenter', handleDragEnter);
      dropZoneElement.removeEventListener('dragover', handleDragOver);
      dropZoneElement.removeEventListener('dragleave', handleDragLeave);
      dropZoneElement.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragover', handleDocumentDragOver);
      document.removeEventListener('drop', handleDocumentDrop);
    },
  };
}

function initFilePicker(options = {}) {
  const {
    button = DEFAULT_FILE_PICKER_SELECTOR,
    input = DEFAULT_FILE_INPUT_SELECTOR,
    statusBar = DEFAULT_STATUS_BAR_SELECTOR,
    accept = ACCEPTED_FILE_EXTENSIONS.join(','),
    onFileSelected,
  } = options;

  const buttonElement = resolveElement(button, DEFAULT_FILE_PICKER_SELECTOR);

  if (!buttonElement) {
    return null;
  }

  const inputElement =
    resolveElement(input, DEFAULT_FILE_INPUT_SELECTOR) ??
    createHiddenFileInput({
      inputSelector: typeof input === 'string' ? input : DEFAULT_FILE_INPUT_SELECTOR,
      accept,
      parent: buttonElement.parentElement ?? document.body,
    });

  inputElement.accept = accept;
  inputElement.multiple = false;

  const handleButtonClick = () => {
    clearError({ statusBar });
    inputElement.click();
  };

  const handleInputChange = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    dispatchSelectedFile(file, { onFileSelected, statusBar });
    event.target.value = '';
  };

  buttonElement.addEventListener('click', handleButtonClick);
  inputElement.addEventListener('change', handleInputChange);

  return {
    button: buttonElement,
    input: inputElement,
    destroy() {
      buttonElement.removeEventListener('click', handleButtonClick);
      inputElement.removeEventListener('change', handleInputChange);
    },
  };
}

function onFileSelected(callback) {
  fileSelectedCallback = typeof callback === 'function' ? callback : null;
  return fileSelectedCallback;
}

function showError(message, options = {}) {
  activeLoadingMessage = '';
  setStatusMessage(message, { ...options, isError: true });
}

function clearError(options = {}) {
  if (activeLoadingMessage) {
    setStatusMessage(activeLoadingMessage, { ...options, isError: false });
    return;
  }

  resetStatusBar(options.statusBar);
}

function showLoading(message = 'Loading…', options = {}) {
  activeLoadingMessage = message;
  setStatusMessage(message, { ...options, isError: false });
}

function hideLoading(options = {}) {
  activeLoadingMessage = '';
  resetStatusBar(options.statusBar);
}

function showSuccess(message, options = {}) {
  activeLoadingMessage = '';
  const statusElement = getStatusBar(options.statusBar);

  if (!statusElement) {
    return;
  }

  statusElement.classList.remove('status-bar--error');
  statusElement.classList.add('status-bar--success');
  statusElement.innerHTML = `<div class="flex items-center gap-2"><div class="h-2 w-2 rounded-full bg-emerald-500"></div><span>${message}</span></div>`;
}

function updateFileInfo(filename, plateCount) {
  const bar = document.getElementById('file-info-bar');
  const nameDisplay = document.getElementById('file-name-display');
  const metaDisplay = document.getElementById('file-meta-display');

  if (!bar || !nameDisplay || !metaDisplay) {
    return;
  }

  nameDisplay.textContent = filename;
  metaDisplay.textContent = `${plateCount} plate${plateCount !== 1 ? 's' : ''} detected`;
  bar.classList.remove('hidden');
}

function hideFileInfo() {
  const bar = document.getElementById('file-info-bar');
  if (bar) {
    bar.classList.add('hidden');
  }
}

function updatePlateSummary(detected, selections) {
  const bar = document.getElementById('plate-summary-bar');
  const detectedEl = document.getElementById('summary-detected');
  const selectedEl = document.getElementById('summary-selected');
  const totalEl = document.getElementById('summary-total');

  if (!bar || !detectedEl || !selectedEl || !totalEl) {
    return;
  }

  const selected = selections.filter(s => s.selected);
  const totalCopies = selected.reduce((sum, s) => sum + s.multiplier, 0);

  detectedEl.textContent = detected;
  selectedEl.textContent = selected.length;
  totalEl.textContent = totalCopies;
  bar.classList.remove('hidden');

  // Update plate count badge
  const badge = document.getElementById('plates-count-badge');
  if (badge) {
    badge.textContent = detected;
    badge.classList.remove('hidden');
  }
}

function hidePlateSummary() {
  const bar = document.getElementById('plate-summary-bar');
  if (bar) {
    bar.classList.add('hidden');
  }

  const badge = document.getElementById('plates-count-badge');
  if (badge) {
    badge.classList.add('hidden');
  }
}

function updateDropZone(filename) {
  const dropZone = document.querySelector('.drop-zone');
  if (!dropZone) {
    return;
  }

  dropZone.innerHTML = `
    <div class="flex flex-col items-center justify-center py-6">
      <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 mb-3">
        <svg class="h-7 w-7 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p class="text-sm font-semibold text-slate-700">${filename}</p>
      <p class="mt-1 text-xs text-slate-400">Drop another file to replace</p>
    </div>
  `;
}

function resetDropZone() {
  const dropZone = document.querySelector('.drop-zone');
  if (!dropZone) {
    return;
  }

  dropZone.innerHTML = `
    <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 mb-4">
      <svg class="h-8 w-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    </div>
    <p class="text-lg font-semibold text-slate-800">Drop your <span class="font-mono text-blue-600">.gcode.3mf</span> file here</p>
    <p class="mt-2 text-sm text-slate-500">or use the button below to browse</p>
  `;
}

function initInstructionsToggle() {
  const toggle = document.querySelector('.instructions-toggle');
  const chevron = document.querySelector('.instructions-chevron');
  const content = document.querySelector('.instructions-content');

  if (!toggle || !chevron || !content) {
    return;
  }

  toggle.addEventListener('click', () => {
    const isCollapsed = content.classList.toggle('is-collapsed');
    chevron.classList.toggle('is-collapsed', isCollapsed);
    toggle.setAttribute('aria-expanded', String(!isCollapsed));
  });
}

function initReloadFileButton(onReload) {
  const btn = document.getElementById('reload-file-btn');
  if (!btn) {
    return;
  }

  btn.addEventListener('click', () => {
    if (typeof onReload === 'function') {
      onReload();
    }
  });
}

function resolveExportButton(buttonOrSelector = DEFAULT_EXPORT_BUTTON_SELECTOR) {
  return resolveElement(buttonOrSelector, DEFAULT_EXPORT_BUTTON_SELECTOR);
}

function updateExportButtonState(hasSelection, options = {}) {
  const button = options.button ?? exportButtonController;
  if (!button) {
    return;
  }

  if (options.forceDisabled === true) {
    button.classList.remove('btn--active', 'btn--disabled');
    button.disabled = true;
    return;
  }

  if (hasSelection) {
    button.classList.remove('btn--disabled');
    button.classList.add('btn--active');
    button.disabled = false;

    // Update label with total copies count
    const totalCopies = options.totalCopies;
    if (totalCopies > 0) {
      const iconSvg = `<svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;
      button.innerHTML = `${iconSvg}Merge and Export (${totalCopies} cop${totalCopies === 1 ? 'y' : 'ies'})`;
    }
  } else {
    button.classList.remove('btn--active');
    button.classList.add('btn--disabled');
    button.disabled = true;
    const iconSvg = `<svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>`;
    button.innerHTML = `${iconSvg}Merge and Export`;
    button.dataset.defaultLabel = button.innerHTML;
  }
}

function initExportButton(options = {}) {
  const {
    button = DEFAULT_EXPORT_BUTTON_SELECTOR,
    onExport,
    hasSelection = false,
  } = options;

  const buttonElement = resolveExportButton(button);

  if (!buttonElement) {
    return null;
  }

  if (exportButtonController && exportButtonClickHandler) {
    exportButtonController.removeEventListener('click', exportButtonClickHandler);
  }

  exportButtonController = buttonElement;
  exportButtonDefaultLabel = buttonElement.innerHTML || 'Merge and Export';
  buttonElement.dataset.defaultLabel = exportButtonDefaultLabel;

  exportButtonClickHandler = async (event) => {
    event.preventDefault();

    if (buttonElement.disabled || typeof onExport !== 'function') {
      return;
    }

    await onExport(event);
  };

  buttonElement.addEventListener('click', exportButtonClickHandler);
  updateExportButtonState(hasSelection, { button: buttonElement });
  return buttonElement;
}

function triggerDownload(blob, filename) {
  if (!(blob instanceof Blob)) {
    throw new TypeError('triggerDownload requires a Blob instance.');
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = typeof filename === 'string' && filename.trim() ? filename.trim() : 'merged_project.gcode.3mf';
  anchor.style.display = 'none';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function showExportProgress(message = 'Preparing export…', options = {}) {
  const button = resolveExportButton(options.button ?? exportButtonController);
  activeLoadingMessage = message;
  setStatusMessage(message, { statusBar: options.statusBar });

  if (button) {
    button.innerHTML = `<svg class="h-4 w-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Exporting…`;
    updateExportButtonState(true, { button, forceDisabled: true });
  }
}

function hideExportProgress(options = {}) {
  const button = resolveExportButton(options.button ?? exportButtonController);
  activeLoadingMessage = '';

  if (button) {
    button.innerHTML = button.dataset.defaultLabel || exportButtonDefaultLabel || 'Merge and Export';
    updateExportButtonState(options.hasSelection ?? exportSelectionState, { button });
  }

  if (options.preserveStatus === true) {
    return;
  }

  resetStatusBar(options.statusBar);
}

function showLoadingOverlay(message = 'Merging files…') {
  const overlay = document.getElementById('loading-overlay');
  const msgEl = document.getElementById('loading-message');
  if (overlay) {
    if (msgEl) msgEl.textContent = message;
    overlay.classList.add('active');
  }
}

function hideLoadingOverlay() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
}

export {
  initDropZone,
  initFilePicker,
  renderPlates,
  getPlateSelections,
  onSelectionChange,
  onFileSelected,
  showError,
  clearError,
  showLoading,
  hideLoading,
  showSuccess,
  updateFileInfo,
  hideFileInfo,
  updatePlateSummary,
  hidePlateSummary,
  updateDropZone,
  resetDropZone,
  initInstructionsToggle,
  initReloadFileButton,
  initExportButton,
  updateExportButtonState,
  triggerDownload,
  showExportProgress,
  hideExportProgress,
  validateMultiplierInput,
  showLoadingOverlay,
  hideLoadingOverlay,
  initPlateCardKeyboardNavigation,
};
