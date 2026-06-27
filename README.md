# GCode 3MF Multiplier

A client-side web app for merging and duplicating GCode plates from `.gcode.3mf` files.

## Features

- **Merge Multiple Plates**: Combine multiple plates into a single plate
- **Duplicate Plates**: Set how many times each plate should be printed
- **Multi-Print Support**: Automatically handles plate swap commands for continuous printing
- **Client-Side Only**: No server upload, your files stay private

## Web App

Deployed on GitHub Pages: **[https://cropse.github.io/Multi-print-plate/](https://cropse.github.io/Multi-print-plate/)**

### Usage

1. **Upload**: Drag and drop a `.gcode.3mf` file onto the drop zone
2. **Configure**: Select plates and set duplicate counts
3. **Export**: Click "Merge and Export" to download the merged file

### Local Development

```bash
cd web
npm install
npm run dev
```

### Testing

```bash
cd web
npm test
```

## How It Works

1. **Prepare your project**: In your slicer, add a swap plate G-code command at the end of each plate's print
2. **Render all plates**: In the slicer's Preview tab, click "All Plate Stats" to slice and render every plate
3. **Load & merge**: Open the `.gcode.3mf` file, select plates, set duplicate counts, and export

## File Format

The tool expects `.gcode.3mf` files with:
- `Metadata/plate_N.gcode` - GCode for each plate
- `Metadata/plate_N.png` - Thumbnail images (optional)
- `Metadata/model_settings.config` - XML with plate names

## License

MIT License