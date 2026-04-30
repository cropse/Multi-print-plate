import {
	extractPlateNumber,
	generateFilename as generateFilenameFromPlates,
	mergeGCodeFiles,
} from "./modules/gcode-merger.js";
import {
	clearError,
	getPlateSelections,
	hideExportProgress,
	hideFileInfo,
	hideLoading,
	hideLoadingOverlay,
	hidePlateSummary,
	initDropZone,
	initExportButton,
	initFilePicker,
	initInstructionsToggle,
	onFileSelected,
	onSelectionChange,
	renderPlates,
	resetDropZone,
	showError,
	showExportProgress,
	showLoading,
	showLoadingOverlay,
	showSuccess,
	triggerDownload,
	updateDropZone,
	updateExportButtonState,
	updateFileInfo,
	updatePlateSummary,
} from "./modules/ui-controller.js";
import { parsePlateNames } from "./modules/xml-parser.js";
import {
	create3MF,
	extract3MF,
	getFile,
	listAllFiles,
	listFiles,
} from "./modules/zip-handler.js";

const STATUS_BAR_SELECTOR = ".status-bar";
const DROP_ZONE_SELECTOR = ".drop-zone";
const FILE_PICKER_SELECTOR = "[data-file-picker]";
const FILE_INPUT_SELECTOR = "[data-file-input]";
const EXPORT_BUTTON_SELECTOR = "[data-export-button]";
const PLATES_GRID_SELECTOR = ".plates-grid";
const METADATA_FOLDER = "Metadata/";
const MODEL_SETTINGS_PATH = "Metadata/model_settings.config";
const OUTPUT_GCODE_PATH = "Metadata/plate_1.gcode";

window.currentPlates = [];
window.currentZip = null;
window.currentThumbnailUrls = [];

function getStatusBar() {
	return document.querySelector(STATUS_BAR_SELECTOR);
}

function getDropZone() {
	return document.querySelector(DROP_ZONE_SELECTOR);
}

function getPlatesGrid() {
	return document.querySelector(PLATES_GRID_SELECTOR);
}

function getExportButton() {
	return document.querySelector(EXPORT_BUTTON_SELECTOR);
}

function cleanupThumbnailUrls() {
	for (const url of window.currentThumbnailUrls) {
		URL.revokeObjectURL(url);
	}

	window.currentThumbnailUrls = [];
}

function ensureAppShell() {
	const main = document.querySelector("main");
	const dropZone = getDropZone();
	const statusBar = getStatusBar();

	if (!main || !dropZone || !statusBar) {
		throw new Error(
			"Application markup is incomplete. Required containers were not found.",
		);
	}

	// Find or create the actions row
	let actionsRow = document.getElementById("app-actions") || document.querySelector("[data-app-actions]");

	if (!actionsRow) {
		actionsRow = document.createElement("div");
		actionsRow.id = "app-actions";
		actionsRow.className =
			"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between";
		actionsRow.setAttribute("data-app-actions", "true");
		
		// Insert after the upload section
		const uploadSection = dropZone.closest("section");
		if (uploadSection) {
			uploadSection.insertAdjacentElement("afterend", actionsRow);
		} else {
			main.prepend(actionsRow);
		}
	}

	// Create file picker button if not exists
	let filePicker = document.querySelector(FILE_PICKER_SELECTOR);

	if (!filePicker) {
		filePicker = document.createElement("button");
		filePicker.type = "button";
		filePicker.className = "btn btn--secondary";
		filePicker.setAttribute("data-file-picker", "true");
		filePicker.innerHTML = `<svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>Browse Files`;
		actionsRow.append(filePicker);
	}

	// Create hidden file input if not exists
	let fileInput = document.querySelector(FILE_INPUT_SELECTOR);

	if (!fileInput) {
		fileInput = document.createElement("input");
		fileInput.type = "file";
		fileInput.hidden = true;
		fileInput.setAttribute("data-file-input", "true");
		actionsRow.append(fileInput);
	}

	// Create export button if not exists
	let exportButton = getExportButton();

	if (!exportButton) {
		exportButton = document.createElement("button");
		exportButton.type = "button";
		exportButton.className = "btn btn--disabled ml-auto";
		exportButton.disabled = true;
		exportButton.setAttribute("data-export-button", "true");
		exportButton.innerHTML = `<svg class="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>Merge and Export`;
		actionsRow.append(exportButton);
	}

	// Create filename preview if not exists
	let filenamePreview = document.getElementById("filename-preview");
	if (!filenamePreview) {
		filenamePreview = document.createElement("span");
		filenamePreview.id = "filename-preview";
		filenamePreview.className = "text-xs text-slate-400 font-mono hidden";
		filenamePreview.setAttribute("data-filename-preview", "true");
		exportButton.parentElement.append(filenamePreview);
	}

	// Ensure plates grid exists
	let platesGrid = getPlatesGrid();

	if (!platesGrid) {
		platesGrid = document.createElement("div");
		platesGrid.className = "plates-grid";
		
		const platesSection = document.createElement("section");
		platesSection.className =
			"rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";
		platesSection.innerHTML = `
      <div class="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-semibold text-slate-900">Detected Plates</h2>
          <p class="text-sm text-slate-500">Select plates and adjust multipliers before exporting.</p>
        </div>
        <div class="flex gap-2" id="plate-actions"></div>
      </div>
    `;
		platesSection.append(platesGrid);
		
		const statusBar = getStatusBar();
		const statusBarSection = statusBar?.closest("section, div");
		if (statusBarSection) {
			statusBarSection.insertAdjacentElement("beforebegin", platesSection);
		} else {
			main.append(platesSection);
		}
	}

	// Add select all / deselect all / reset all buttons
	const plateActions = document.getElementById("plate-actions");
	if (plateActions && !plateActions.children.length) {
		const selectAllBtn = document.createElement("button");
		selectAllBtn.type = "button";
		selectAllBtn.className = "text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors";
		selectAllBtn.textContent = "Select All";
		selectAllBtn.addEventListener("click", () => {
			const checkboxes = platesGrid?.querySelectorAll('input[type="checkbox"]');
			checkboxes?.forEach((cb) => { cb.checked = true; cb.dispatchEvent(new Event("change")); });
		});

		const deselectAllBtn = document.createElement("button");
		deselectAllBtn.type = "button";
		deselectAllBtn.className = "text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 px-3 py-1.5 rounded-lg transition-colors";
		deselectAllBtn.textContent = "Deselect All";
		deselectAllBtn.addEventListener("click", () => {
			const checkboxes = platesGrid?.querySelectorAll('input[type="checkbox"]');
			checkboxes?.forEach((cb) => { cb.checked = false; cb.dispatchEvent(new Event("change")); });
		});

		const resetAllBtn = document.createElement("button");
		resetAllBtn.type = "button";
		resetAllBtn.className = "text-xs font-medium text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors";
		resetAllBtn.textContent = "Reset Multipliers";
		resetAllBtn.addEventListener("click", () => {
			const inputs = platesGrid?.querySelectorAll('input[type="number"]');
			inputs?.forEach((input) => {
				input.value = "1";
				input.dataset.lastValidValue = "1";
				// Update quick buttons
				const card = input.closest('.plate-card');
				card?.querySelectorAll('.quick-mult-btn').forEach((b, i) => {
					const val = [1, 2, 4, 8][i];
					b.className = `quick-mult-btn px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
						val === 1
							? 'bg-blue-50 border-blue-200 text-blue-700'
							: 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
					}`;
				});
			});
			// Trigger selection change to update summary
			const firstInput = platesGrid?.querySelector('input[type="number"]');
			firstInput?.dispatchEvent(new Event("change"));
		});

		// Sort dropdown
		const sortWrapper = document.createElement("div");
		sortWrapper.className = "flex items-center gap-1 ml-auto";

		const sortLabel = document.createElement("span");
		sortLabel.className = "text-xs text-slate-400";
		sortLabel.textContent = "Sort:";

		const sortSelect = document.createElement("select");
		sortSelect.className = "text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100";
		sortSelect.innerHTML = `
			<option value="id">Plate ID</option>
			<option value="name">Name</option>
			<option value="multiplier">Copies</option>
		`;
		sortSelect.addEventListener("change", () => {
			sortPlates(sortSelect.value);
		});

		sortWrapper.append(sortLabel, sortSelect);
		plateActions.append(selectAllBtn, deselectAllBtn, resetAllBtn, sortWrapper);
	}

	return { dropZone, filePicker, fileInput, exportButton, platesGrid };
}

function sortPlates(sortBy) {
	if (!window.currentPlates?.length) return;

	const platesGrid = getPlatesGrid();
	if (!platesGrid) return;

	// Get current selections before re-rendering
	const currentSelections = getPlateSelections();
	const selectionMap = new Map(currentSelections.map(s => [s.id, s]));

	// Sort plates
	const sortedPlates = [...window.currentPlates].sort((a, b) => {
		switch (sortBy) {
			case "name": {
				return (a.name || "").localeCompare(b.name || "");
			}
			case "multiplier": {
				const multA = selectionMap.get(a.id)?.multiplier ?? 1;
				const multB = selectionMap.get(b.id)?.multiplier ?? 1;
				return multB - multA;
			}
			default: {
				return (a.id ?? 0) - (b.id ?? 0);
			}
		}
	});

	// Update current plates reference
	window.currentPlates = sortedPlates;

	// Re-render plates
	renderPlates(sortedPlates, platesGrid);

	// Restore selections
	const newSelections = getPlateSelections();
	newSelections.forEach(newSel => {
		const original = selectionMap.get(newSel.id);
		if (original) {
			const card = platesGrid.querySelector(`[data-plate-id="${newSel.id}"]`);
			if (card) {
				const checkbox = card.querySelector('input[type="checkbox"]');
				const multiplierInput = card.querySelector('input[type="number"]');
				if (checkbox) {
					checkbox.checked = original.selected;
				}
				if (multiplierInput) {
					multiplierInput.value = String(original.multiplier);
					multiplierInput.dataset.lastValidValue = String(original.multiplier);
				}
			}
		}
	});

	// Trigger update
	handleSelectionChange();
}

function resetPlateState() {
	cleanupThumbnailUrls();
	window.currentPlates = [];
	window.currentZip = null;

	const platesGrid = getPlatesGrid();
	if (platesGrid) {
		const emptyState = document.createElement("div");
		emptyState.className =
			"rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500";
		emptyState.textContent =
			"Upload a .3mf or .gcode.3mf file to load plate previews.";
		platesGrid.replaceChildren(emptyState);
	}

	updateExportButtonState(false, { button: getExportButton() });
	resetDropZone();
	hideFileInfo();
	hidePlateSummary();

	// Hide filename preview
	const preview = document.getElementById("filename-preview");
	if (preview) {
		preview.classList.add("hidden");
	}
}

async function readZipFile(zip, path) {
	const result = await getFile(zip, path);

	if (!result?.success) {
		throw new Error(result?.error || `Failed to read file: ${path}`);
	}

	return result.content;
}

async function readZipListing(zip, folder) {
	const result = await listFiles(zip, folder);

	if (!result?.success) {
		throw new Error(
			result?.error || `Failed to list files in folder: ${folder}`,
		);
	}

	return result.files;
}

function normalizeMetadataPath(path) {
	if (typeof path !== "string" || !path.trim()) {
		return "";
	}

	return path.startsWith(METADATA_FOLDER) ? path : `${METADATA_FOLDER}${path}`;
}

async function loadPlateNames(zip) {
	try {
		const xmlData = await readZipFile(zip, MODEL_SETTINGS_PATH);
		return parsePlateNames(xmlData);
	} catch {
		return new Map();
	}
}

function buildPlateRecord({
	plateId,
	plateNames,
	gcodePath,
	gcodeContent,
	thumbnail,
}) {
	return {
		id: plateId,
		name: plateNames.get(plateId) || `Plate ${plateId}`,
		gcode: gcodePath,
		content: gcodeContent,
		thumbnail,
	};
}

async function createPlateList(zip, files, plateNames) {
	const gcodeFiles = files
		.filter((file) => file.toLowerCase().endsWith(".gcode"))
		.map(normalizeMetadataPath);

	if (gcodeFiles.length === 0) {
		throw new Error("No GCode files were found in the uploaded 3MF archive.");
	}

	const normalizedFiles = new Set(files.map(normalizeMetadataPath));
	const plates = [];

	for (const gcodePath of gcodeFiles) {
		const plateId = extractPlateNumber(gcodePath);

		if (!Number.isFinite(plateId)) {
			continue;
		}

		const gcodeContent = await readZipFile(zip, gcodePath);

		let thumbnail = null;
		const thumbnailPath = gcodePath.replace(/\.gcode$/i, ".png");

		if (normalizedFiles.has(thumbnailPath)) {
			const thumbnailBytes = await readZipFile(zip, thumbnailPath);
			thumbnail = URL.createObjectURL(
				new Blob([thumbnailBytes], { type: "image/png" }),
			);
			window.currentThumbnailUrls.push(thumbnail);
		}

		plates.push(
			buildPlateRecord({
				plateId,
				plateNames,
				gcodePath,
				gcodeContent,
				thumbnail,
			}),
		);
	}

	plates.sort((left, right) => left.id - right.id);

	if (plates.length === 0) {
		throw new Error(
			"No valid plate GCode files could be parsed from the uploaded archive.",
		);
	}

	return plates;
}

async function handleFileUpload(file) {
	clearError();
	showLoading("Processing file...");
	resetPlateState();

	try {
		const extracted = await extract3MF(file);
		if (!extracted?.success) {
			throw new Error(extracted?.error || "Failed to extract 3MF archive.");
		}

		const plateNames = await loadPlateNames(extracted.zip);
		const files = await readZipListing(extracted.zip, METADATA_FOLDER);
		const plates = await createPlateList(extracted.zip, files, plateNames);

		window.currentPlates = plates;
		window.currentZip = extracted.zip;

		renderPlates(plates, getPlatesGrid());
		handleSelectionChange();

		// Update UI with file info
		updateDropZone(file.name);
		updateFileInfo(file.name, plates.length);
		updatePlateSummary(plates.length, getPlateSelections());
		showSuccess(`Loaded ${plates.length} plate${plates.length !== 1 ? 's' : ''} from ${file.name}`);
	} catch (error) {
		resetPlateState();
		resetDropZone();
		hideFileInfo();
		hidePlateSummary();
		showError(
			error instanceof Error
				? error.message
				: "Failed to process the uploaded file.",
		);
	} finally {
		hideLoading();
	}
}

function handleSelectionChange() {
	const selections = getPlateSelections();
	const selected = selections.filter((s) => s.selected);
	const hasSelection = selected.length > 0;
	const totalCopies = selected.reduce((sum, s) => sum + s.multiplier, 0);
	updateExportButtonState(hasSelection, { button: getExportButton(), totalCopies });

	if (window.currentPlates?.length) {
		updatePlateSummary(window.currentPlates.length, selections);
	}

	// Update filename preview
	updateFilenamePreview(selections);
}

function updateFilenamePreview(selections) {
	const preview = document.getElementById("filename-preview");
	if (!preview) return;

	const selected = selections.filter(s => s.selected);
	if (selected.length === 0) {
		preview.classList.add("hidden");
		return;
	}

	// Build preview filename
	const plates = selected.map(s => {
		const plate = window.currentPlates.find(p => p.id === s.id);
		return { name: plate?.name || `Plate ${s.id}`, multiplier: s.multiplier };
	});
	const filename = generateFilenameFromPlates(plates);

	preview.textContent = `→ ${filename}`;
	preview.classList.remove("hidden");
}

async function copyAllOriginalFiles(zip, outputFiles) {
	// List ALL files in the zip
	const allResult = await listAllFiles(zip);
	if (!allResult?.success) return;

	for (const file of allResult.files) {
		// Skip Metadata/ folder files - we handle those separately
		if (file.startsWith("Metadata/") || file.startsWith("Metadata\\")) {
			continue;
		}

		const content = await readZipFile(zip, file);
		outputFiles[file] = content;
	}
}

async function copyMetadataPngFiles(zip, outputFiles) {
	const originalFiles = await readZipListing(zip, METADATA_FOLDER);
	const keepFiles = new Set([
		"plate_1.png",
		"plate_no_light_1.png",
		"top_1.png",
		"pick_1.png",
		"plate_1.json",
	]);

	for (const file of originalFiles) {
		const basename = file.toLowerCase();

		// Keep plate_1 PNGs and plate_1.json
		if (keepFiles.has(basename)) {
			const normalizedPath = normalizeMetadataPath(file);
			outputFiles[normalizedPath] = await readZipFile(zip, normalizedPath);
		}
	}
}

function buildMergeInput(selections) {
	return selections.map((selection) => {
		const plate = window.currentPlates.find(
			(entry) => entry.id === selection.id,
		);

		if (!plate) {
			throw new Error(
				`Plate ${selection.id} is no longer available for export.`,
			);
		}

		return {
			id: selection.id,
			name: selection.name,
			content: plate.content,
			multiplier: selection.multiplier,
		};
	});
}

function createModelSettingsConfig() {
	// Create a clean single-plate model_settings.config
	return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <plate>
    <metadata key="plater_id" value="1" />
    <metadata key="plater_name" value="Merged" />
    <metadata key="locked" value="false" />
    <metadata key="gcode_file" value="Metadata/plate_1.gcode" />
    <metadata key="thumbnail_file" value="Metadata/plate_1.png" />
    <metadata key="thumbnail_no_light_file" value="Metadata/plate_no_light_1.png" />
    <metadata key="top_file" value="Metadata/top_1.png" />
    <metadata key="pick_file" value="Metadata/pick_1.png" />
    <metadata key="pattern_bbox_file" value="Metadata/plate_1.json" />
  </plate>
</config>`;
}

async function handleExport() {
	const selections = getPlateSelections().filter(
		(selection) => selection.selected,
	);

	if (selections.length === 0) {
		showError("Select at least one plate before exporting.");
		updateExportButtonState(false, { button: getExportButton() });
		return;
	}

	if (!window.currentZip) {
		showError("Upload a 3MF file before exporting.");
		return;
	}

	const totalCopies = selections.reduce((sum, s) => sum + s.multiplier, 0);

	// Confirmation prompt for large exports
	if (totalCopies > 20) {
		const confirmed = confirm(
			`You are about to export ${totalCopies} copies from ${selections.length} plate(s).\n\n` +
			`This may take a moment and produce a large file. Continue?`
		);
		if (!confirmed) {
			return;
		}
	}

	// Show loading overlay to prevent double-click
	showLoadingOverlay(`Merging ${totalCopies} plate${totalCopies > 1 ? 's' : ''}…`);
	showExportProgress("Generating merged file...", {
		button: getExportButton(),
	});

	try {
		const platesToMerge = buildMergeInput(selections);
		const mergedGCode = mergeGCodeFiles(platesToMerge);

		if (!mergedGCode) {
			throw new Error("Merged GCode output was empty. Please check your plate selections.");
		}

		const filename = generateFilenameFromPlates(platesToMerge);
		const outputFiles = {};

		// 1. Copy ALL non-Metadata files from original (3D model, relationships, etc.)
		await copyAllOriginalFiles(window.currentZip, outputFiles);

		// 2. Write the merged gcode as plate_1.gcode
		outputFiles[OUTPUT_GCODE_PATH] = mergedGCode;

		// 3. Copy only plate_1 PNG files from Metadata
		await copyMetadataPngFiles(window.currentZip, outputFiles);

		// 4. Create clean single-plate model_settings.config
		outputFiles[MODEL_SETTINGS_PATH] = createModelSettingsConfig();

		const result = await create3MF(outputFiles);
		if (!result?.success) {
			throw new Error(result?.error || "Failed to create output 3MF archive. The file may be corrupted.");
		}

		triggerDownload(result.blob, filename);

		// Restore button state
		hideExportProgress({
			button: getExportButton(),
			hasSelection: selections.length > 0,
			preserveStatus: true,
		});

		// Show success message
		const statusBar = getStatusBar();
		if (statusBar) {
			statusBar.className = "status-bar rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 shadow-sm status-bar--success";
			statusBar.innerHTML = `<div class="flex items-center gap-2"><div class="h-2 w-2 rounded-full bg-emerald-500"></div><span>Export complete &mdash; ${filename} (${totalCopies} cop${totalCopies === 1 ? 'y' : 'ies'}) downloaded successfully</span></div>`;
		}
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : "Failed to export merged 3MF file. Please try again.";
		showError(errorMessage);
		hideExportProgress({
			button: getExportButton(),
			hasSelection: true,
		});
	} finally {
		// Always hide loading overlay
		hideLoadingOverlay();
		// Always hide loading state on error
		hideLoading();
	}
}

async function init() {
	ensureAppShell();

	initDropZone({
		dropZone: DROP_ZONE_SELECTOR,
	});

	initFilePicker({
		button: FILE_PICKER_SELECTOR,
		input: FILE_INPUT_SELECTOR,
	});

	initExportButton({
		button: EXPORT_BUTTON_SELECTOR,
		onExport: handleExport,
		hasSelection: false,
	});

	onFileSelected(handleFileUpload);
	onSelectionChange(handleSelectionChange);
	updateExportButtonState(false, { button: getExportButton() });

	// Initialize instructions toggle
	initInstructionsToggle();

	// Keyboard shortcut: Ctrl+Enter or Cmd+Enter to export
	document.addEventListener('keydown', (e) => {
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			e.preventDefault();
			const exportBtn = getExportButton();
			if (exportBtn && !exportBtn.disabled) {
				exportBtn.click();
			}
		}
	});
}

document.addEventListener("DOMContentLoaded", () => {
	init().catch((error) => {
		showError(
			error instanceof Error
				? error.message
				: "Application failed to initialize.",
		);
	});
});
