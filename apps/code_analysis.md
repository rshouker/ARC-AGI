# Code Analysis

## Overview
This document outlines the general architecture and data flow of the ARC testing interface, including the key files, data structures, and user interaction flow.

**Dependencies:** The interface relies on **jQuery** for DOM manipulation and event handling, and **jQuery UI** for the selectable grid functionality.

## File Structure

- `testing_interface.html`: Main HTML template defining the UI layout (modal, preview, evaluation, controls, grids, symbol picker). Imports jQuery, jQuery UI, and custom CSS/JS.
- `css/common.css`: Base styling for grids (cells, rows) and messaging elements.
- `css/testing_interface.css`: Specific styling for the interface layout, preview grids, editor controls, modal, and symbol picker.
- `js/common.js`: Utility functions and `Grid` class for handling grid data and rendering (parse, resize, flood fill, messaging).
- `js/testing_interface.js`: Core application logic: task loading, preview generation, grid synchronization, event binding, user input handling, and solution submission.
- `img/`: Placeholder for task-related images.

## Data Structures

### Grid Class (common.js)
- Fields:
  - `height`, `width`: Dimensions
  - `grid`: 2D array of symbols (integers)
- Methods/utilities:
  - Constructor: initialize grid with given values or zeros
  - Flood fill: `floodfillFromLocation(grid, i, j, symbol)` replaces connected cells
  - Serialization helpers: parse, convert, copy between DOM and model

### Global State (testing_interface.js)
- `CURRENT_INPUT_GRID`, `CURRENT_OUTPUT_GRID`: `Grid` instances for input and output
- `TEST_PAIRS`: Array of training pairs (input/output) for preview
- `CURRENT_TEST_PAIR_INDEX`: Index in test set for evaluation
- `COPY_PASTE_DATA`: Array of copied cell tuples `[x, y, symbol]`
- UI constants: grid dimensions and `MAX_CELL_SIZE`

## Key Grid Interaction Functions

These functions, primarily in `js/testing_interface.js` unless noted, handle the synchronization and manipulation between the `Grid` data objects and the visual grid elements in the UI (represented by jQuery objects, often referred to as `jqGrid`).

- **`refreshEditionGrid(jqGrid, dataGrid)`:** Re-renders the specified jQuery grid element (`jqGrid`) based on the data in the `dataGrid` (`Grid` object). Clears the old grid, adds new cells based on `dataGrid` data, sets up event listeners (`setUpEditionGridListeners`), and adjusts cell sizes (`fitCellsToContainer`).
- **`fillJqGridWithData(jqGrid, dataGrid)`:** Core rendering logic called by `refreshEditionGrid`. Populates a `jqGrid` element with cell divs based on the `dataGrid`'s `grid` array, setting appropriate symbols and classes.
- **`syncFromEditionGridToDataGrid()`:** Updates the `CURRENT_OUTPUT_GRID` data object by reading the current symbol values from the main interactive output UI grid (`#output_grid .edition_grid`). Uses `copyJqGridToDataGrid`.
- **`copyJqGridToDataGrid(jqGrid, dataGrid)`:** Helper function to read the `symbol` attribute from each cell DOM element in `jqGrid` and update the corresponding `[i][j]` entry in the `dataGrid.grid` array.
- **`syncFromDataGridToEditionGrid()`:** Updates the main interactive output UI grid to visually match the current state of the `CURRENT_OUTPUT_GRID` data object. Uses `refreshEditionGrid`.
- **`setCellSymbol(cell, symbol, ...)`:** Modifies a single cell's appearance (CSS class) and data attribute (`symbol`) in the UI. Determines and applies an optimal text color (white or black) based on the cell background brightness, adjusts font size to ensure the symbol number fits, and handles different modes (preview vs. edition) and potential tool logic (like toggling symbol 0 in edit mode).
- **`setUpEditionGridListeners(jqGrid)`:** Attaches event listeners (primarily `click` for drawing/flood fill, potentially `mousedown`, `mouseover`, `mouseup` for drag actions) to the cells within an editable grid (`jqGrid`).
- **`fitCellsToContainer(jqGrid, height, width)`:** Adjusts the CSS `grid-template-columns` and `grid-template-rows` properties for the `jqGrid` container to ensure the grid cells are displayed correctly according to the specified `height` and `width`.
- **Undo/Redo Functionality:**
  - **`recordChange(changeObject)`:** Logs each modification (edit, flood fill, paste, reset, resize) into a `changeHistory` array with `undoData` and `redoData` and updates `historyIndex`.
  - **`undo()`:** Reverts the most recent change using its `undoData`, decrements `historyIndex`, and refreshes the grid UI.
  - **`redo()`:** Reapplies a reverted change using its `redoData`, increments `historyIndex`, and refreshes the grid UI.
  - **`updateUndoRedoButtons()`:** Enables or disables the Undo and Redo buttons based on `historyIndex` and `changeHistory.length`.
  - *Keyboard shortcuts:* `Ctrl+Z` / `Cmd+Z` for Undo, `Ctrl+Y` (or `Ctrl+Shift+Z` on Mac) for Redo.
  - *Symbol selection shortcuts:* Press number keys `0-9` to pick symbols directly from the keyboard.
- **`resizeOutputGrid(height, width)`:** Resizes the `CURRENT_OUTPUT_GRID` data object by creating a new `Grid` instance and then updates the UI grid by calling `syncFromDataGridToEditionGrid`.
- **`resetOutputGrid()`:** Resets the `CURRENT_OUTPUT_GRID` data object (typically cloning the corresponding test input grid) and updates the UI grid via `syncFromDataGridToEditionGrid`.
- **`Grid` Class (`js/common.js`):** The fundamental data structure holding the grid dimensions and the 2D array of symbols. Includes methods for initialization and potentially helper functions.
- **`create_grid(values)` (`js/common.js`):** Utility function likely used to create a `Grid` object from a raw 2D array (`values`).

## Application Flow

1. **Initialization**
   - On `$(document).ready`, bind event handlers:
     - Symbol picker clicks, tool switching, file input, keyboard shortcuts (C/V and number keys `0-9` for symbol selection), and grid listeners.
   - Build initial 3×3 grids for input and output.

2. **Task Loading**
   - `loadTaskFromFile(e)` or `randomTask()` fetches JSON task (train/test pairs).
   - `loadJSONTask(train, test)` resets state, hides modal, populates `TEST_PAIRS`.
   - Preview each training pair with `fillPairPreview`, rendering small grids.

3. **User Interaction**
   - **Demonstration View**: Browse input/output examples.
   - **Evaluation View**:
     - Navigate test inputs (`nextTestInput`), display using `fillTestInput`.
     - Resize output grid (`resizeOutputGrid`) via `parseSizeTuple`.
     - Copy input contents (`copyFromInput`).
     - Edit output grid cells:
       - **Edit**: Click to set symbol
       - **Floodfill**: Fill connected region
       - **Select**: Highlight cells for copy/paste or bulk editing via symbol picker
     - Paste copied cells at target location with keyboard shortcuts.

4. **Submission**
   - `submitSolution()` serializes `CURRENT_OUTPUT_GRID`, *simulates* a check by comparing its dimensions to the expected output dimensions for the current test pair. It does **not** send an AJAX request. Success/failure is reported using browser `alert()` boxes and `infoMsg`/`errorMsg`.

## Messaging & Feedback
- `infoMsg(msg)` and `errorMsg(msg)` display temporary notifications.

## Notes & TODOs
- Limit grid size to ≤30×30.
- Improve error handling on network failures.
- Add support for custom color palettes or symbol sets.