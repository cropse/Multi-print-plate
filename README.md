# GCode 3MF Content Multiplier

A tool for merging and duplicating GCode plates from `.gcode.3mf` files. Available as both a Python desktop application and a web app.

## Features

- **Merge Multiple Plates**: Combine multiple plates into a single plate
- **Duplicate Plates**: Set how many times each plate should be printed
- **Multi-Print Support**: Automatically handles plate swap commands for continuous printing
- **Client-Side Web App**: No server upload, your files stay private

## Web App

The web app is deployed on GitHub Pages: **[https://your-username.github.io/multiple_print/](https://your-username.github.io/multiple_print/)**

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

## Python Desktop App

A Tkinter-based desktop application for local use.

### Requirements

- Python 3.13+
- Pillow

### Installation

```bash
pip install pillow
```

### Usage

```bash
python Multiply_print.py
```

Or run as a self-contained script:

```bash
uv run Multiply_print.py
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
