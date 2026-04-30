# GCode 3MF Content Multiplier (Web)

A client-side web application for merging and duplicating GCode plates from .gcode.3mf files. Deployed on GitHub Pages.

## Features

- **Drag & Drop Upload**: Simply drag your .gcode.3mf file onto the drop zone
- **Plate Preview**: See thumbnails and names for each plate
- **Flexible Selection**: Choose which plates to include in the output
- **Custom Multipliers**: Set how many times each plate should be duplicated (1-100)
- **Client-Side Only**: No server upload, your files stay private
- **Modern UI**: Clean, responsive interface with Tailwind CSS

## How to Use

1. **Upload**: Drag and drop a `.gcode.3mf` file onto the drop zone, or click "Browse Files"
2. **Review**: The app displays all plates found in the file with thumbnails
3. **Configure**:
   - Check or uncheck plates to include in the output
   - Set the multiplier for each plate, how many times to duplicate
4. **Export**: Click "Merge and Export" to download the merged file

## File Format

The app expects `.gcode.3mf` files with:
- `Metadata/plate_N.gcode`, GCode for each plate
- `Metadata/plate_N.png`, thumbnail images, optional
- `Metadata/model_settings.config`, XML with plate names

## Browser Compatibility

Works in all modern browsers:
- Chrome 90+
- Firefox 90+
- Edge 90+
- Safari 15+

## Development

### Prerequisites
- Node.js 18+, for testing only
- No build tools required, uses CDN for Tailwind and JSZip

### Local Development
```bash
# Serve the web folder locally
npx serve web

# Or open directly in browser
open web/index.html
```

### Testing
```bash
cd web
npm install
npm test
```

## Deployment

The app is automatically deployed to GitHub Pages via GitHub Actions:
- Push to `main` branch triggers deployment
- The `web/` folder is deployed directly, no build step

## Technical Details

- **JSZip**: Used for reading and creating .3mf (ZIP) files
- **DOMParser**: Native XML parsing for plate names
- **Tailwind CSS**: Styling via CDN
- **Vitest**: Unit testing framework

## License

See main project repository for license information.
