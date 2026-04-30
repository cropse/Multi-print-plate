#!/usr/bin/env python3
#
# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "pillow",
# ]
# ///
#!/usr/bin/env python3
"""
GCode 3MF Content Multiplier

A GUI application for merging and duplicating gcode files from 3MF projects.
Allows users to select multiple plates, set duplication counts, and merge them
into a single clean project file.
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
import threading
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from PIL import Image, ImageTk


@dataclass
class PlateData:
    """Represents a single plate's data and UI state."""

    path: Path
    png_path: Optional[Path]
    plate_number: Optional[int]
    plate_name: str
    selected: tk.BooleanVar
    multiplier: tk.StringVar
    image_widget: Optional[ttk.Label] = None


@dataclass
class SelectedPlate:
    """Represents a selected plate for processing."""

    path: Path
    multiplier: int
    plate_name: str


class ModelSettingsParser:
    """Handles parsing of model_settings.config XML files."""

    @staticmethod
    def parse_plate_names(config_path: Path) -> Dict[int, str]:
        """Parse plate names from model_settings.config XML file."""
        plate_names: Dict[int, str] = {}

        if not config_path.exists():
            print("model_settings.config not found")
            return plate_names

        try:
            tree = ET.parse(config_path)
            root = tree.getroot()

            for plate_elem in root.findall("plate"):
                plate_id: Optional[int] = None
                plate_name: Optional[str] = None

                for metadata in plate_elem.findall("metadata"):
                    key = metadata.get("key")
                    value = metadata.get("value")

                    if key == "plater_id":
                        try:
                            plate_id = int(value) if value else None
                        except (ValueError, TypeError):
                            continue
                    elif key == "plater_name":
                        plate_name = value

                if plate_id is not None and plate_name:
                    plate_names[plate_id] = plate_name
                    print(f"Found plate {plate_id}: {plate_name}")

            print(f"Loaded {len(plate_names)} plate names: {plate_names}")

        except Exception as e:
            print(f"Error parsing model_settings.config: {e}")

        return plate_names

    @staticmethod
    def create_single_plate_config(config_path: Path) -> None:
        """Create a new model_settings.config with only plate 1."""
        try:
            root = ET.Element("config")
            plate_elem = ET.SubElement(root, "plate")

            metadata_items = [
                ("plater_id", "1"),
                ("plater_name", "Merged"),
                ("locked", "false"),
                ("gcode_file", "Metadata/plate_1.gcode"),
                ("thumbnail_file", "Metadata/plate_1.png"),
                ("thumbnail_no_light_file", "Metadata/plate_no_light_1.png"),
                ("top_file", "Metadata/top_1.png"),
                ("pick_file", "Metadata/pick_1.png"),
                ("pattern_bbox_file", "Metadata/plate_1.json"),
            ]

            for key, value in metadata_items:
                metadata = ET.SubElement(plate_elem, "metadata")
                metadata.set("key", key)
                metadata.set("value", value)

            tree = ET.ElementTree(root)
            ET.indent(tree, space="  ", level=0)
            tree.write(config_path, encoding="UTF-8", xml_declaration=True)

        except Exception as e:
            print(f"Warning: Could not update model_settings.config: {e}")


class GCodeProcessor:
    """Handles gcode file processing and merging."""

    @staticmethod
    def extract_plate_number(filename: str) -> Optional[int]:
        """Extract plate number from filename (e.g., plate_1.gcode -> 1)."""
        match = re.search(r"plate_(\d+)\.gcode", filename.lower())
        return int(match.group(1)) if match else None

    @staticmethod
    def merge_gcode_files(selected_plates: List[SelectedPlate]) -> str:
        """Merge multiple gcode files with proper comments and multi-merge-delete handling."""
        merged_content = ""
        is_first_duplicate = True

        for i, plate in enumerate(selected_plates):
            with open(plate.path, "r", encoding="utf-8") as f:
                original_content = f.read()

            if i > 0:
                merged_content += "\n"

            for duplicate_num in range(1, plate.multiplier + 1):
                merged_content += f"; Merged GCode: {plate.plate_name} ({duplicate_num}/{plate.multiplier})\n"

                processed_content = GCodeProcessor._process_content_lines(
                    original_content, is_first_duplicate
                )
                merged_content += processed_content

                is_first_duplicate = False

                if not (
                    i == len(selected_plates) - 1 and duplicate_num == plate.multiplier
                ):
                    merged_content += "\n"

        return merged_content

    @staticmethod
    def _process_content_lines(content: str, keep_multi_merge_delete: bool) -> str:
        """Process gcode content lines, handling multi-merge-delete directives."""
        lines = content.splitlines()
        processed_lines = []

        for line in lines:
            if "multi-merge-delete" in line:
                if keep_multi_merge_delete:
                    processed_lines.append(line)
            else:
                processed_lines.append(line)

        processed_content = "\n".join(processed_lines)
        return processed_content + "\n" if processed_content else ""


class FileManager:
    """Handles file operations for the 3MF project."""

    @staticmethod
    def extract_3mf_archive(file_path: str) -> str:
        """Extract 3MF file to a temporary directory."""
        temp_dir = tempfile.mkdtemp()

        try:
            with zipfile.ZipFile(file_path, "r") as zip_ref:
                zip_ref.extractall(temp_dir)
            return temp_dir
        except zipfile.BadZipFile:
            shutil.rmtree(temp_dir)
            raise ValueError(f"{file_path} is not a valid zip file")

    @staticmethod
    def find_gcode_files(metadata_path: Path) -> List[Path]:
        """Find all .gcode files in the Metadata folder."""
        if not metadata_path.exists():
            raise FileNotFoundError("Metadata folder not found in the archive")

        return list(metadata_path.glob("*.gcode"))

    @staticmethod
    def cleanup_other_plates(metadata_path: Path) -> None:
        """Remove all plate files except plate_1."""
        files_to_keep = {"plate_1.gcode", "plate_1.png", "model_settings.config"}

        for file_path in metadata_path.iterdir():
            if file_path.is_file() and file_path.name not in files_to_keep:
                if (
                    file_path.name.startswith("plate_")
                    or file_path.name.startswith("top_")
                    or file_path.name.startswith("pick_")
                    or file_path.name.startswith("plate_no_light_")
                ):
                    file_path.unlink()
                    print(f"Removed: {file_path.name}")

    @staticmethod
    def create_3mf_archive(temp_dir: str, output_path: str) -> None:
        """Create a new 3MF archive from the temporary directory."""
        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zip_ref:
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    relative_path = os.path.relpath(file_path, temp_dir)
                    zip_ref.write(file_path, relative_path)


class FilenameGenerator:
    """Generates appropriate filenames for exported projects."""

    @staticmethod
    def generate_default_name(selected_plates: List[SelectedPlate]) -> str:
        """Generate filename in format: plate_name1xN-plate_name2xM.gcode.3mf"""
        if not selected_plates:
            return "merged_project.gcode.3mf"

        plate_descriptions = []
        for plate in selected_plates:
            clean_name = re.sub(r"[^\w\-_\.]", "_", plate.plate_name)
            plate_descriptions.append(f"{clean_name}x{plate.multiplier}")

        plates_string = "-".join(plate_descriptions)
        filename = f"{plates_string}.gcode.3mf"

        # Fallback for very long filenames
        if len(filename) > 100:
            filename = "merged_project.gcode.3mf"

        return filename


class GCodeMultiplierGUI:
    """Main GUI application for GCode 3MF Content Multiplier."""

    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("GCode 3MF Content Multiplier")
        self.root.geometry("1200x800")
        self.root.configure(bg="#f0f0f0")

        # State variables
        self.project_path = tk.StringVar()
        self.temp_dir: Optional[str] = None
        self.gcode_data: Dict[str, PlateData] = {}
        self.plate_names: Dict[int, str] = {}
        self.status_var = tk.StringVar(value="Ready - Please select a .gcode.3mf file")

        self._setup_ui()
        self._setup_styles()

    def _setup_styles(self) -> None:
        """Configure GUI styles."""
        style = ttk.Style()
        style.theme_use("clam")

        style.configure(
            "Accent.TButton",
            background="#0078d4",
            foreground="white",
            font=("Arial", 10, "bold"),
        )

    def _setup_ui(self) -> None:
        """Set up the user interface."""
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))

        self._configure_grid_weights(main_frame)
        self._create_title(main_frame)
        self._create_instructions(main_frame)
        self._create_file_selection(main_frame)
        self._create_files_display(main_frame)
        self._create_export_button(main_frame)
        self._create_status_bar(main_frame)

    def _configure_grid_weights(self, frame: ttk.Frame) -> None:
        """Configure grid weights for responsive layout."""
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)
        frame.rowconfigure(3, weight=1)

    def _create_title(self, parent: ttk.Frame) -> None:
        """Create the application title."""
        title_label = ttk.Label(
            parent, text="GCode 3MF Content Multiplier", font=("Arial", 16, "bold")
        )
        title_label.grid(row=0, column=0, pady=(0, 10))

    def _create_instructions(self, parent: ttk.Frame) -> None:
        """Create the how-to-use instructions section."""
        instructions_frame = ttk.LabelFrame(parent, text="How to Use", padding="10")
        instructions_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        instructions_frame.columnconfigure(0, weight=1)

        steps = [
            ("Step 1 — Prepare your project:",
             "In your slicer, create a project with a swap plate G-code command at the end of each plate's print.\n"
             "This allows the printer to switch plates automatically between copies."),
            ("Step 2 — Render all plates:",
             "In the slicer's Preview tab, click \"All Plate Stats\" (or equivalent) to slice and render every plate.\n"
             "Each plate must have its G-code generated before exporting the .gcode.3mf file."),
            ("Step 3 — Load & merge:",
             "Browse for your .gcode.3mf file, select the plates to include, set duplicate counts, then click \"Merge and Export Project\"."),
        ]

        for i, (heading, body) in enumerate(steps):
            ttk.Label(
                instructions_frame,
                text=heading,
                font=("Arial", 9, "bold"),
                foreground="#0066cc",
            ).grid(row=i * 2, column=0, sticky=tk.W, pady=(4 if i else 0, 0))

            ttk.Label(
                instructions_frame,
                text=body,
                font=("Arial", 9),
                foreground="#444444",
                wraplength=900,
                justify=tk.LEFT,
            ).grid(row=i * 2 + 1, column=0, sticky=tk.W, padx=(12, 0), pady=(0, 4))

    def _create_file_selection(self, parent: ttk.Frame) -> None:
        """Create the file selection section."""
        file_frame = ttk.LabelFrame(parent, text="Project Selection", padding="10")
        file_frame.grid(row=2, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        file_frame.columnconfigure(1, weight=1)

        ttk.Label(file_frame, text="Project Path:").grid(
            row=0, column=0, sticky=tk.W, padx=(0, 10)
        )

        path_entry = ttk.Entry(
            file_frame, textvariable=self.project_path, state="readonly"
        )
        path_entry.grid(row=0, column=1, sticky=(tk.W, tk.E), padx=(0, 10))

        browse_btn = ttk.Button(file_frame, text="Browse", command=self._browse_file)
        browse_btn.grid(row=0, column=2, sticky=tk.W)

    def _create_files_display(self, parent: ttk.Frame) -> None:
        """Create the scrollable files display section."""
        files_frame = ttk.LabelFrame(parent, text="GCode Files", padding="10")
        files_frame.grid(row=3, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 10))
        files_frame.columnconfigure(0, weight=1)
        files_frame.rowconfigure(0, weight=1)

        # Create scrollable canvas
        self.canvas = tk.Canvas(files_frame, bg="white")
        self.scrollbar = ttk.Scrollbar(
            files_frame, orient="vertical", command=self.canvas.yview
        )
        self.scrollable_frame = ttk.Frame(self.canvas)

        self._setup_scrolling()

        self.canvas.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        self.scrollbar.grid(row=0, column=1, sticky=(tk.N, tk.S))

    def _setup_scrolling(self) -> None:
        """Configure mouse wheel scrolling for the canvas."""
        self.scrollable_frame.bind(
            "<Configure>",
            lambda e: self.canvas.configure(scrollregion=self.canvas.bbox("all")),
        )

        self.canvas.create_window((0, 0), window=self.scrollable_frame, anchor="nw")
        self.canvas.configure(yscrollcommand=self.scrollbar.set)

        def on_mousewheel(event: tk.Event) -> None:
            self.canvas.yview_scroll(int(-1 * (event.delta / 120)), "units")

        def bind_mousewheel(event: tk.Event) -> None:
            self.canvas.bind_all("<MouseWheel>", on_mousewheel)

        def unbind_mousewheel(event: tk.Event) -> None:
            self.canvas.unbind_all("<MouseWheel>")

        self.canvas.bind("<Enter>", bind_mousewheel)
        self.canvas.bind("<Leave>", unbind_mousewheel)

    def _create_export_button(self, parent: ttk.Frame) -> None:
        """Create the export button."""
        export_btn = ttk.Button(
            parent,
            text="Merge and Export Project",
            command=self._export_project,
            style="Accent.TButton",
        )
        export_btn.grid(row=4, column=0, pady=(10, 0))

    def _create_status_bar(self, parent: ttk.Frame) -> None:
        """Create the status bar."""
        status_label = ttk.Label(
            parent, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W
        )
        status_label.grid(row=5, column=0, sticky=(tk.W, tk.E), pady=(10, 0))

    def _browse_file(self) -> None:
        """Handle file browser dialog."""
        file_path = filedialog.askopenfilename(
            title="Select GCode 3MF File",
            filetypes=[("GCode 3MF files", "*.gcode.3mf"), ("All files", "*.*")],
        )

        if file_path:
            self.project_path.set(file_path)
            self._load_project()

    def _load_project(self) -> None:
        """Load and extract the 3MF project file."""
        self.status_var.set("Loading project...")
        self.root.update()

        self._cleanup_temp_dir()

        try:
            self.temp_dir = FileManager.extract_3mf_archive(self.project_path.get())
            self._load_plate_names()
            self._find_and_display_gcode_files()

        except Exception as e:
            messagebox.showerror("Error", f"Failed to load project: {str(e)}")
            self.status_var.set("Error loading project")

    def _cleanup_temp_dir(self) -> None:
        """Clean up any existing temporary directory."""
        if self.temp_dir and os.path.exists(self.temp_dir):
            shutil.rmtree(self.temp_dir)

    def _load_plate_names(self) -> None:
        """Load plate names from the model settings configuration."""
        if not self.temp_dir:
            return

        config_path = Path(self.temp_dir) / "Metadata" / "model_settings.config"
        self.plate_names = ModelSettingsParser.parse_plate_names(config_path)

    def _find_and_display_gcode_files(self) -> None:
        """Find gcode files and set up their display data."""
        if not self.temp_dir:
            return

        metadata_path = Path(self.temp_dir) / "Metadata"

        try:
            gcode_files = FileManager.find_gcode_files(metadata_path)
            self._create_gcode_data(gcode_files)
            self._display_gcode_files()

        except FileNotFoundError as e:
            messagebox.showerror("Error", str(e))

    def _create_gcode_data(self, gcode_files: List[Path]) -> None:
        """Create PlateData objects for each gcode file."""
        self.gcode_data = {}

        for gcode_file in gcode_files:
            plate_number = GCodeProcessor.extract_plate_number(gcode_file.name)

            plate_name = (
                self.plate_names.get(plate_number, f"Plate {plate_number}")
                if plate_number
                else "Unknown Plate"
            )

            png_file = gcode_file.with_suffix(".png")

            self.gcode_data[gcode_file.name] = PlateData(
                path=gcode_file,
                png_path=png_file if png_file.exists() else None,
                plate_number=plate_number,
                plate_name=plate_name,
                selected=tk.BooleanVar(),
                multiplier=tk.StringVar(value="2"),
            )

            print(
                f"Found gcode file: {gcode_file.name} -> Plate {plate_number}: {plate_name}"
            )

    def _display_gcode_files(self) -> None:
        """Display gcode files in a grid layout."""
        self._clear_display()

        if not self.gcode_data:
            self._show_no_files_message()
            return

        self.status_var.set(f"Found {len(self.gcode_data)} gcode files")

        self._create_file_grid()

    def _clear_display(self) -> None:
        """Clear existing display widgets."""
        for widget in self.scrollable_frame.winfo_children():
            widget.destroy()

    def _show_no_files_message(self) -> None:
        """Show message when no gcode files are found."""
        ttk.Label(
            self.scrollable_frame,
            text="No .gcode files found in Metadata folder",
            font=("Arial", 12),
        ).pack(pady=20)
        self.status_var.set("No gcode files found")

    def _create_file_grid(self) -> None:
        """Create the grid layout for file cards."""
        cols = 3

        # Configure grid weights
        for i in range(cols):
            self.scrollable_frame.columnconfigure(i, weight=1, uniform="column")

        row, col = 0, 0
        for filename, data in self.gcode_data.items():
            self._create_file_card(data, filename, row, col)

            col += 1
            if col >= cols:
                col = 0
                row += 1

    def _create_file_card(
        self, data: PlateData, filename: str, row: int, col: int
    ) -> None:
        """Create a single file card widget."""
        file_frame = ttk.Frame(self.scrollable_frame, relief=tk.RIDGE, padding="10")
        file_frame.grid(
            row=row, column=col, sticky=(tk.W, tk.E, tk.N, tk.S), padx=5, pady=5
        )
        file_frame.columnconfigure(0, weight=1)

        self._add_image_preview(file_frame, data)
        self._add_file_info(file_frame, data, filename)
        self._add_controls(file_frame, data)

    def _add_image_preview(self, parent: ttk.Frame, data: PlateData) -> None:
        """Add image preview to the file card."""
        if data.png_path:
            try:
                img = Image.open(data.png_path)
                img.thumbnail((200, 200), Image.Resampling.LANCZOS)
                photo = ImageTk.PhotoImage(img)

                img_label = ttk.Label(parent, image=photo)
                img_label.image = photo  # Keep reference
                img_label.grid(row=0, column=0, pady=(0, 10))
                data.image_widget = img_label

            except Exception:
                ttk.Label(parent, text="Preview not available", foreground="gray").grid(
                    row=0, column=0, pady=(0, 10)
                )
        else:
            ttk.Label(parent, text="No preview image", foreground="gray").grid(
                row=0, column=0, pady=(0, 10)
            )

    def _add_file_info(self, parent: ttk.Frame, data: PlateData, filename: str) -> None:
        """Add file information section to the card."""
        info_frame = ttk.Frame(parent)
        info_frame.grid(row=1, column=0, sticky=(tk.W, tk.E), pady=(0, 10))
        info_frame.columnconfigure(0, weight=1)

        # Plate name (prominent)
        plate_label = ttk.Label(
            info_frame,
            text=data.plate_name,
            font=("Arial", 12, "bold"),
            foreground="#0066cc",
        )
        plate_label.grid(row=0, column=0, sticky=tk.W)

        # Debug info (smaller)
        debug_text = f"Plate {data.plate_number} - {filename}"
        filename_label = ttk.Label(
            info_frame, text=debug_text, font=("Arial", 9), foreground="gray"
        )
        filename_label.grid(row=1, column=0, sticky=tk.W)

    def _add_controls(self, parent: ttk.Frame, data: PlateData) -> None:
        """Add control widgets to the file card."""
        controls_frame = ttk.Frame(parent)
        controls_frame.grid(row=2, column=0, sticky=(tk.W, tk.E))
        controls_frame.columnconfigure(0, weight=1)

        # Checkbox
        checkbox = ttk.Checkbutton(
            controls_frame, text="Include in merge", variable=data.selected
        )
        checkbox.grid(row=0, column=0, sticky=tk.W, pady=(0, 5))

        # Multiplier controls
        multiplier_frame = ttk.Frame(controls_frame)
        multiplier_frame.grid(row=1, column=0, sticky=tk.W)

        ttk.Label(multiplier_frame, text="Duplicate:").grid(
            row=0, column=0, sticky=tk.W
        )

        multiplier_spinbox = ttk.Spinbox(
            multiplier_frame, from_=1, to=100, width=8, textvariable=data.multiplier
        )
        multiplier_spinbox.grid(row=0, column=1, padx=(5, 0), sticky=tk.W)

        ttk.Label(multiplier_frame, text="times").grid(
            row=0, column=2, padx=(5, 0), sticky=tk.W
        )

    def _get_selected_plates(self) -> List[SelectedPlate]:
        """Get list of selected plates for processing."""
        selected = []

        for data in self.gcode_data.values():
            if data.selected.get():
                try:
                    multiplier = int(data.multiplier.get())
                    if multiplier < 1:
                        raise ValueError("Multiplier must be at least 1")

                    selected.append(
                        SelectedPlate(
                            path=data.path,
                            multiplier=multiplier,
                            plate_name=data.plate_name,
                        )
                    )
                except ValueError as e:
                    raise ValueError(
                        f"Invalid multiplier for {data.path.name}: {str(e)}"
                    )

        return selected

    def _export_project(self) -> None:
        """Handle project export."""
        if not self.temp_dir:
            messagebox.showerror("Error", "No project loaded")
            return

        try:
            selected_plates = self._get_selected_plates()

            if not selected_plates:
                messagebox.showwarning("Warning", "No files selected for merging")
                return

            output_path = self._get_output_path(selected_plates)
            if not output_path:
                return

            # Process in background thread
            threading.Thread(
                target=self._process_and_export,
                args=(selected_plates, output_path),
                daemon=True,
            ).start()

        except ValueError as e:
            messagebox.showerror("Error", str(e))

    def _get_output_path(self, selected_plates: List[SelectedPlate]) -> Optional[str]:
        """Get output path from user."""
        default_filename = FilenameGenerator.generate_default_name(selected_plates)

        return filedialog.asksaveasfilename(
            title="Save Merged Project As",
            initialfile=default_filename,
            defaultextension=".gcode.3mf",
            filetypes=[("GCode 3MF files", "*.gcode.3mf"), ("All files", "*.*")],
        )

    def _process_and_export(
        self, selected_plates: List[SelectedPlate], output_path: str
    ) -> None:
        """Process selected plates and export the merged project."""
        if not self.temp_dir:
            return

        try:
            self._update_status("Merging files...")

            # Merge gcode content
            merged_content = GCodeProcessor.merge_gcode_files(selected_plates)

            # Write merged file
            self._write_merged_file(merged_content)

            # Clean up other plates
            self._cleanup_project_files()

            # Create final archive
            self._create_final_archive(output_path)

            self._load_project()
            self._show_success_message(selected_plates, output_path)

        except Exception as e:
            self.status_var.set("Export failed")
            messagebox.showerror("Error", f"Failed to export project: {str(e)}")

    def _update_status(self, message: str) -> None:
        """Update status bar message."""
        self.status_var.set(message)
        self.root.update()

    def _write_merged_file(self, content: str) -> None:
        """Write the merged content to plate_1.gcode."""
        if not self.temp_dir:
            return

        self._update_status("Writing merged file...")

        metadata_path = Path(self.temp_dir) / "Metadata"
        plate_1_path = metadata_path / "plate_1.gcode"

        with open(plate_1_path, "w", encoding="utf-8") as f:
            f.write(content)

    def _cleanup_project_files(self) -> None:
        """Clean up unnecessary project files."""
        if not self.temp_dir:
            return

        self._update_status("Cleaning up other plates...")

        metadata_path = Path(self.temp_dir) / "Metadata"
        FileManager.cleanup_other_plates(metadata_path)

        # Update model settings
        config_path = metadata_path / "model_settings.config"
        ModelSettingsParser.create_single_plate_config(config_path)

    def _create_final_archive(self, output_path: str) -> None:
        """Create the final 3MF archive."""
        if not self.temp_dir:
            return

        self._update_status("Creating archive...")
        FileManager.create_3mf_archive(self.temp_dir, output_path)
        self.status_var.set("Export completed successfully!")

    def _show_success_message(
        self, selected_plates: List[SelectedPlate], output_path: str
    ) -> None:
        """Show success dialog with export details."""
        selected_info = []
        total_copies = 0

        for plate in selected_plates:
            selected_info.append(f"• {plate.plate_name} (×{plate.multiplier})")
            total_copies += plate.multiplier

        details = "\n".join(selected_info)

        messagebox.showinfo(
            "Success",
            f"Successfully merged {len(selected_plates)} plates into one!\n\n"
            f"Merged plates:\n{details}\n\n"
            f"Total copies: {total_copies}\n\n"
            f"Result: All content merged into plate_1.gcode\n"
            f"Saved to: {output_path}",
        )

    def __del__(self) -> None:
        """Cleanup on destruction."""
        self._cleanup_temp_dir()


def main() -> None:
    """Main application entry point."""
    root = tk.Tk()
    app = GCodeMultiplierGUI(root)

    def on_closing() -> None:
        """Handle application closing."""
        app._cleanup_temp_dir()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_closing)
    root.mainloop()


if __name__ == "__main__":
    main()
