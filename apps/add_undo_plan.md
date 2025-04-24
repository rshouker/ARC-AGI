# Revised Plan to Add Undo Functionality (Delta-Based)

This document outlines the steps required to implement Undo/Redo functionality using a delta-based approach (storing changes rather than full grid snapshots).

The [ ] will be filled with x when the task is completed.

1. [x] **Define History Storage (in `js/testing_interface.js`)**
    * [x]  Add new global variables:
        * [x]  `changeHistory`: An array to hold *change objects* describing modifications to `CURRENT_OUTPUT_GRID`.
        * [x]  `historyIndex`: An integer pointer indicating the current position within `changeHistory`. Points to the *last applied change* that resulted in the current state.
    * [x]  Initialize `changeHistory` as an empty array `[]`.
    * [x]  Initialize `historyIndex` to -1 (representing the initial state before any recorded changes).

2. [x]  **Define Change Object Structure**
    * [x]  Each object in `changeHistory` will represent one atomic user action and must contain enough information to both undo and redo that action.
    * [x]  Structure:
        ```javascript
        {
            type: 'edit', // Type of action: 'edit', 'resize', 'reset', 'copyInput', 'paste'
            undoData: { /* Data needed to reverse the change */ },
            redoData: { /* Data needed to re-apply the change */ }
        }
        ```
    * [x]  **Specific Data Structures:**
        * [x]  **For `type: 'edit'` (single cell edit, flood fill, select-tool edit):**
            * [x]  `undoData`: `{ coordValueMap: { '[x,y]': previousSymbol, ... } }` (Map of coordinates to their symbol *before* the change)
            * [x]  `redoData`: `{ coordValueMap: { '[x,y]': newSymbol, ... } }` (Map of coordinates to their symbol *after* the change)
        * [x]  **For `type: 'resize'`:**
            * [x]  `undoData`: `{ previousHeight: H, previousWidth: W, previousGridData: Array<Array<number>> }` (Store old dimensions and *optionally* the full grid data before resize and copy from input if content is truncated)
            * [x]  `redoData`: `{ newHeight: H, newWidth: W }` (Store new dimensions)
        * [x]  **For `type: 'reset'`, `type: 'copyInput'`:**
            * [x]  `undoData`: `{ previousGrid: GridObject }` (Store the *entire* Grid object state before the reset/copy)
            * [x]  `redoData`: `{ newGrid: GridObject }` (Store the *entire* Grid object state after the reset/copy)
        * [x]  **For `type: 'paste'`:**
            * [x]  `undoData`: `{ coordValueMap: { '[x,y]': previousSymbol, ... } }` (Map of coordinates overwritten by paste to their symbol *before* the paste)
            *   `redoData`: `{ coordValueMap: { '[x,y]': pastedSymbol, ... } }` (Map of coordinates affected by paste to the symbol *after* the paste)
        *   **For `type: 'copyInput'`:**
            *   `undoData`: `{ previousGrid: GridObject }` (Store the *entire* Grid object state before the copy)
            *   `redoData`: `{ newGrid: GridObject }` (Store the *entire* Grid object state after the copy)

3. [x] **Implement History Management Functions (in `js/testing_interface.js`)**
    * [x] **`recordChange(changeObject)` function:**
        * [x] Accepts a fully formed `changeObject` (prepared by the function triggering the change).
        * [x] **Handle Branching:** If `historyIndex` is less than `changeHistory.length - 1` (meaning an undo occurred, and now a new change is made), truncate `changeHistory` by removing all elements after the current `historyIndex`.
        * [x] **Add Change:** Push the `changeObject` onto the `changeHistory` array.
        * [x] **Update Pointer:** Increment `historyIndex`.
        * [x] **Update Buttons:** Call `updateUndoRedoButtons()`.
    * [x] **`undo()` function:**
        * [x] **Check Availability:** Return if `historyIndex < 0`.
        * [x] **Get Change:** Get the `changeObject` at `changeHistory[historyIndex]`.
        * [x] **Apply Inverse:** Apply the *inverse* action based on `changeObject.type` and `changeObject.undoData`.
            * [x] Iterate `undoData.coordValueMap` and set cell symbols.
            * [x] Restore `undoData.previousGrid`.
            * [x] Resize grid using `undoData.previousHeight/Width` and restore `previousGridData` if available.
        * [x] **Decrement Pointer:** Decrement `historyIndex`.
        * [x] **Update UI:** Call `refreshEditionGrid(...)`.
        * [x] **Update Buttons:** Call `updateUndoRedoButtons()`.
    * [x] **`redo()` function:**
        * [x] **Check Availability:** Return if `historyIndex >= changeHistory.length - 1`.
        * [x] **Increment Pointer:** Increment `historyIndex`.
        * [x] **Get Change:** Get the `changeObject` at `changeHistory[historyIndex]`.
        * [x] **Apply Forward:** Apply the *forward* action based on `changeObject.type` and `changeObject.redoData`.
            * [x] Iterate `redoData.coordValueMap` and set cell symbols.
            * [x] Restore `redoData.newGrid`.
            * [x] Resize grid using `redoData.newHeight/Width`.
        * [x] **Update UI:** Call `refreshEditionGrid(...)`.
        * [x] **Update Buttons:** Call `updateUndoRedoButtons()`.
    * [x] **`updateUndoRedoButtons()` function:**
        * [x] Get references to the Undo and Redo button elements.
        * [x] Enable Undo if `historyIndex >= 0`.
        * [x] Enable Redo if `historyIndex < changeHistory.length - 1`.
        * [x] Disable otherwise (using jQuery's `prop('disabled', true/false)`).
    * [x] **`clearHistory()` function:**
        * [x] Called during `resetTask()` and potentially at the start of `loadJSONTask()`.
        * [x] Reset `changeHistory = []`.
        * [x] Reset `historyIndex = -1`.
        * [x] **Update Buttons:** Call `updateUndoRedoButtons()`.

4. [x] **Integrate History Recording into Existing Functions (in `js/testing_interface.js`)**
    * [x] **Modify `resizeOutputGrid(height, width)` and its sub-steps:**
        * [x] **Before:** Store `undoData = { previousHeight, previousWidth, previousGridData (optional deep copy) }`.
        * [x] **After:** Store `redoData = { newHeight, newWidth }`.
        * [x] Call `recordChange({ type: 'resize', undoData, redoData })`.
    * [x] **Modify Single Cell Edit Logic (e.g., in `fillCell` or `setUpEditionGridListeners`):**
        * [x] **Before:** Determine the cell being changed (`x`, `y`). Get `previousSymbol = CURRENT_OUTPUT_GRID.grid[y][x]`.
        * [x] **After:** Get `newSymbol = ...` (the symbol being set).
        * [x] Call `recordChange({ type: 'edit', undoData: { coordValueMap: { '[x,y]': previousSymbol } }, redoData: { coordValueMap: { '[x,y]': newSymbol } } })`.
    * [x] **Modify Flood Fill Logic (likely involving `floodfillFromLocation`):**
        * [x] **Before:** Get `previousSymbolMap = { '[x1,y1]': oldSymbol1, ... }` for all affected cells.
        * [x] **After:** Get `newSymbolMap = { '[x1,y1]': newSymbol, ... }` for all affected cells.
        * [x] Call `recordChange({ type: 'edit', undoData: { coordValueMap: previousSymbolMap }, redoData: { coordValueMap: newSymbolMap } })`. // Reuse 'edit' type
    * [x] **Modify `copyFromInput()`:**
        * [x] **Before:** Store `undoData = { previousGrid: deepCopy(CURRENT_OUTPUT_GRID) }`.
        * [x] **After:** Store `redoData = { newGrid: deepCopy(CURRENT_OUTPUT_GRID_AFTER_COPY) }`. // Get grid state *after* copy completes
        * [x] Call `recordChange({ type: 'copyInput', undoData, redoData })`.
    * [x] **Modify `resetOutputGrid()`:**
        * [x] **Before:** Store `undoData = { previousGrid: deepCopy(CURRENT_OUTPUT_GRID) }`.
        * [x] **After:** Store `redoData = { newGrid: deepCopy(CURRENT_OUTPUT_GRID_AFTER_RESET) }`. // Get grid state *after* reset completes (empty grid)
        * [x] Call `recordChange({ type: 'reset', undoData, redoData })`.
    * [x] **Modify Paste Logic (likely within keydown handler for Ctrl+V/Cmd+V):**
        * [x] Locate the exact code block handling paste.
        * [x] **Before:** Capture `undoData = { previousGrid: deepCopy(CURRENT_OUTPUT_GRID) }`.
        * [x] **After:** Sync grid, capture `redoData = { newGrid: deepCopy(CURRENT_OUTPUT_GRID) }`.
        * [x] Call `recordChange({ type: 'paste', undoData, redoData })`.

5. [x] **Add UI Elements (in `testing_interface.html`)**
    * [x] Add Undo button (e.g., `<button id="undo_button">Undo</button>`).
    * [x] Add Redo button (e.g., `<button id="redo_button">Redo</button>`).
    * [x] Initially disable both buttons.

6. [x] **Implement Event Handlers (in `js/testing_interface.js`)**
    * [x] **Button Clicks:** (No explicit handlers needed if `onclick` attributes are set in HTML, but ensure `undo()` and `redo()` functions exist).
    * [x] **Keyboard Shortcuts (`$('body').keydown(...)` or similar):**
        * [x] Detect platform (`navigator.platform.toUpperCase().indexOf('MAC') >= 0` for Mac).
        * [x] Check for appropriate modifier keys (`event.metaKey` or `event.ctrlKey`).
        * [x] Handle Undo: Cmd+Z / Ctrl+Z (`keyCode === 90`).
        * [x] Handle Redo: Cmd+Shift+Z / Ctrl+Shift+Z (`keyCode === 90` + `shiftKey`) OR Ctrl+Y (`keyCode === 89`, non-Mac only).
        * [x] Prevent default browser actions (`event.preventDefault()`).

7. [x] **Manage Button States (in `js/testing_interface.js`)**
    * [x] Create `updateUndoRedoButtons()` function:
        * [x] Disable `#undo_button` if `historyIndex < 0`.
        * [x] Enable `#undo_button` otherwise.
        * [x] Disable `#redo_button` if `historyIndex >= changeHistory.length - 1`.
        * [x] Enable `#redo_button` otherwise.
    * [x] Call this function on page load (via `resetTask` and `loadJSONTask`), and at the end of `recordChange`, `undo`, `redo`, and `resetTask`.

8. [x] **Testing**
    * [x] Test Undo/Redo for each action type: resize, single cell edit, flood fill, copy input, reset, paste.
    * [x] Test edge cases: undoing/redoing multiple times, undoing/redoing after reaching the beginning/end of history.
    * [x] Test button states are correctly updated.
    * [x] Test keyboard shortcuts on different platforms (if possible). I only tried on Windows.

**Notes:**
*   Deep copies (`JSON.parse(JSON.stringify(...))`) are used for simplicity. For performance with very large grids, consider more optimized state diffing.
*   Assumes `setCellSymbol` modifies the visual grid directly. Ensure `syncFromEditionGridToDataGrid` is called appropriately if `CURRENT_OUTPUT_GRID` is modified separately.
*   Ensure `changeHistory` and `historyIndex` are correctly initialized (e.g., in `resetTask` or similar).