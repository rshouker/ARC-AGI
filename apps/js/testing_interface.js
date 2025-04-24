// Internal state.
var CURRENT_INPUT_GRID = new Grid(3, 3);
var CURRENT_OUTPUT_GRID = new Grid(3, 3);
var TEST_PAIRS = new Array();
var CURRENT_TEST_PAIR_INDEX = 0;
var COPY_PASTE_DATA = new Array();

// Global variables for Undo/Redo
var changeHistory = []; // Initialize history array
var historyIndex = -1; // Initialize history pointer

// Cosmetic.
var EDITION_GRID_HEIGHT = 500;
var EDITION_GRID_WIDTH = 500;

// Function to update the enabled/disabled state of Undo/Redo buttons
function updateUndoRedoButtons() {
    if (typeof changeHistory === 'undefined' || changeHistory === null) {
        // Handle cases where history might not be initialized yet
        $('#undo_button').prop('disabled', true);
        $('#redo_button').prop('disabled', true);
        return;
    }
    // Enable/disable Undo button
    $('#undo_button').prop('disabled', historyIndex < 0);

    // Enable/disable Redo button
    $('#redo_button').prop('disabled', historyIndex >= changeHistory.length - 1);
}

function resetTask() {
    // Reset grids and UI elements first
    CURRENT_INPUT_GRID = new Grid(3, 3);
    TEST_PAIRS = new Array();
    CURRENT_TEST_PAIR_INDEX = 0;
    $('#task_preview').html('');
    resetOutputGrid(); // This might record a change, which we clear next.

    // Clear history AFTER resetting the grid state
    changeHistory = []; // Initialize history
    historyIndex = -1; // Reset history pointer

    updateUndoRedoButtons(); // Update button states on reset
}

function refreshEditionGrid(jqGrid, dataGrid) {
    fillJqGridWithData(jqGrid, dataGrid);
    setUpEditionGridListeners(jqGrid);
    fitCellsToContainer(jqGrid, dataGrid.height, dataGrid.width, EDITION_GRID_HEIGHT, EDITION_GRID_HEIGHT);
    initializeSelectable();
    // Reapply dynamic text color after undo/redo or refresh
    changeSymbolVisibility();
}

function syncFromEditionGridToDataGrid() {
    copyJqGridToDataGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);
}

function syncFromDataGridToEditionGrid() {
    refreshEditionGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);
}

function getSelectedSymbol() {
    selected = $('#symbol_picker .selected-symbol-preview')[0];
    return $(selected).attr('symbol');
}

function setUpEditionGridListeners(jqGrid) {
    jqGrid.find('.cell').click(function(event) {
        cell = $(event.target);
        symbol = getSelectedSymbol();

        mode = $('input[name=tool_switching]:checked').val();
        if (mode == 'floodfill') {
            // If floodfill: fill all connected cells.
            // --- History Recording Integration ---
            const x = parseInt(cell.attr('x'));
            const y = parseInt(cell.attr('y'));
            const newSymbol = parseInt(symbol);
            const targetSymbol = CURRENT_OUTPUT_GRID.grid[x][y]; // Symbol to replace

            // Only proceed if the target symbol is different from the new symbol
            if (targetSymbol !== newSymbol) {
                // 1. Store previous state (deep copy)
                const previousGridData = JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID.grid));

                // 2. Apply the change (directly modifies CURRENT_OUTPUT_GRID.grid)
                // floodfillFromLocation expects (grid, row_i, col_j, new_symbol)
                floodfillFromLocation(CURRENT_OUTPUT_GRID.grid, x, y, newSymbol); // Corrected parameters to x, y

                // 3. Determine changes for undo/redo maps
                const undoMap = {};
                const redoMap = {};
                for (let r = 0; r < CURRENT_OUTPUT_GRID.height; r++) {
                    for (let c = 0; c < CURRENT_OUTPUT_GRID.width; c++) {
                        if (previousGridData[r][c] !== CURRENT_OUTPUT_GRID.grid[r][c]) {
                            const coordKey = `[${r},${c}]`; // Using [row,col] standard
                            undoMap[coordKey] = previousGridData[r][c];
                            redoMap[coordKey] = CURRENT_OUTPUT_GRID.grid[r][c];
                        }
                    }
                }

                // 4. Record the change if any cells were actually modified
                if (Object.keys(undoMap).length > 0) {
                     recordChange({ 
                        type: 'edit', // Reusing 'edit' type for floodfill
                        undoData: { coordValueMap: undoMap }, 
                        redoData: { coordValueMap: redoMap } 
                    });
                }
               
                // 5. Update the visual grid AFTER recording the change
                syncFromDataGridToEditionGrid(); 
            }
            // --- End History Recording ---
        }
        else if (mode == 'edit') {
            // Else: fill just this cell.
            // --- History Recording Integration ---
            const x = parseInt(cell.attr('x'));
            const y = parseInt(cell.attr('y'));
            const newSymbol = parseInt(symbol); // Ensure symbol is integer
            const previousSymbol = CURRENT_OUTPUT_GRID.grid[x][y];

            // Only record if the symbol actually changed
            if (previousSymbol !== newSymbol) {
                // 1. Store previous state (already have previousSymbol)
                const undoData = { coordValueMap: { [`[${x},${y}]`] : previousSymbol } };

                // 2. Apply the change
                setCellSymbol(cell, newSymbol);
                CURRENT_OUTPUT_GRID.grid[x][y] = newSymbol; // Update data grid
                
                // 3. Store new state for redo
                const redoData = { coordValueMap: { [`[${x},${y}]`] : newSymbol } };

                // 4. Record the change
                recordChange({ type: 'edit', undoData, redoData });
            }
            // --- End History Recording ---
        }
    });
}

function resizeOutputGrid() {
    // Get new size from input
    let size = $('#output_grid_size').val();
    size = parseSizeTuple(size);
    const newHeight = size[0];
    const newWidth = size[1];

    // --- History Recording Start ---
    // Capture state *before* resize for undo
    const undoData = {
        previousHeight: CURRENT_OUTPUT_GRID.height,
        previousWidth: CURRENT_OUTPUT_GRID.width,
        // Deep copy of the grid data before resizing
        previousGridData: JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID.grid))
    };
    // --- History Recording End ---

    // Perform the resize
    const jqGrid = $('#output_grid .edition_grid');
    // The old syncFromEditionGridToDataGrid() is removed as we use the captured state.
    // Initialize the new Grid object, potentially copying old data
    CURRENT_OUTPUT_GRID = new Grid(newHeight, newWidth, undoData.previousGridData);
    refreshEditionGrid(jqGrid, CURRENT_OUTPUT_GRID);

    // --- History Recording Start ---
    // Capture state *after* resize for redo
    const redoData = {
        newHeight: newHeight, // or CURRENT_OUTPUT_GRID.height
        newWidth: newWidth   // or CURRENT_OUTPUT_GRID.width
    };

    // Record the change
    recordChange({ type: 'resize', undoData, redoData });
    // --- History Recording End ---
}

function resetOutputGrid() {
    // --- History Recording Start ---
    // 1. Capture previous state (deep copy)
    const undoData = { previousGrid: JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID)) };
    // --- History Recording End ---

    // --- Original Reset Logic ---
    syncFromEditionGridToDataGrid(); // Ensure data is sync'd before getting previous state? (Maybe remove if undoData is sufficient)
    CURRENT_OUTPUT_GRID = new Grid(3, 3); // Reset to 3x3
    syncFromDataGridToEditionGrid(); // Update the visual grid
    $('#output_grid_size').val('3x3'); // Update size display
    // --- End Original Reset Logic ---
    
    // --- History Recording Start ---
    // 2. Capture new state (deep copy)
    const redoData = { newGrid: JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID)) };

    // 3. Record the change
    recordChange({ type: 'reset', undoData, redoData });
    // --- History Recording End ---
}

function copyFromInput() {
    // --- History Recording Start ---
    // 1. Capture previous state (deep copy)
    const undoData = { previousGrid: JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID)) };
    // --- History Recording End ---

    // --- Original Copy Logic ---
    syncFromEditionGridToDataGrid(); // Ensure CURRENT_OUTPUT_GRID is up-to-date before overwriting
    CURRENT_OUTPUT_GRID = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
    syncFromDataGridToEditionGrid();
    $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
    // --- End Original Copy Logic ---

    // --- History Recording Start ---
    // 2. Capture new state (deep copy)
    const redoData = { newGrid: JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID)) };

    // 3. Record the change
    recordChange({ type: 'copyInput', undoData, redoData });
    // --- History Recording End ---
}

function recordChange(changeObject) {
    // Handle branching: If we undid something and then made a new change,
    // discard the 'future' history that was undone.
    if (historyIndex < changeHistory.length - 1) {
        changeHistory = changeHistory.slice(0, historyIndex + 1);
    }

    // Add the new change
    changeHistory.push(changeObject);

    // Update the pointer to the latest state
    historyIndex++;

    updateUndoRedoButtons(); // Update button states
}

function undo() {
    // 1. Check Availability
    if (historyIndex < 0) {
        return; // Nothing to undo
    }

    // 2. Get Change
    const changeObject = changeHistory[historyIndex];

    // 3. Apply Undo (Specific logic based on type needed here)
    switch (changeObject.type) {
        case 'edit':
        case 'paste': // Paste undo is similar to edit undo
            if (changeObject.undoData && changeObject.undoData.coordValueMap) {
                for (const coordStr in changeObject.undoData.coordValueMap) {
                    const coords = JSON.parse(coordStr); // Assumes coordStr is '[x,y]' format
                    const x = coords[0];
                    const y = coords[1];
                    const previousSymbol = changeObject.undoData.coordValueMap[coordStr];
                    // Update the data grid directly
                    if (CURRENT_OUTPUT_GRID.grid[x] !== undefined && CURRENT_OUTPUT_GRID.grid[x][y] !== undefined) { 
                        CURRENT_OUTPUT_GRID.grid[x][y] = previousSymbol;
                    }
                }
                // console.log('After undo applied (edit/paste):', 'Change Object:', JSON.stringify(changeObject), 'Current Grid State:', JSON.stringify(CURRENT_OUTPUT_GRID.grid));
            }
            break;
        case 'resize':
            // Restore previous dimensions and grid data if available
            if (changeObject.undoData) {
                CURRENT_OUTPUT_GRID.height = changeObject.undoData.previousHeight;
                CURRENT_OUTPUT_GRID.width = changeObject.undoData.previousWidth;
                // Restore grid data if it was saved
                if (changeObject.undoData.previousGridData) {
                    CURRENT_OUTPUT_GRID.grid = changeObject.undoData.previousGridData;
                } else {
                    // If old grid data wasn't saved, we might need to re-initialize or leave as is.
                    // For now, resizing dimensions is the core part.
                    // CURRENT_OUTPUT_GRID.grid = Array(CURRENT_OUTPUT_GRID.height).fill(0).map(() => Array(CURRENT_OUTPUT_GRID.width).fill(0));
                }
                // Update the size display input field
                $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
            }
            break;
        case 'reset':
        case 'copyInput':
            // Restore the entire grid state from the saved previous grid object
            if (changeObject.undoData && changeObject.undoData.previousGrid) {
                const previousGrid = changeObject.undoData.previousGrid;
                // Important: Ensure deep copy if previousGrid is complex or nested
                // Assuming previousGrid has height, width, and grid properties
                CURRENT_OUTPUT_GRID.height = previousGrid.height;
                CURRENT_OUTPUT_GRID.width = previousGrid.width;
                // Deep copy the grid array
                CURRENT_OUTPUT_GRID.grid = JSON.parse(JSON.stringify(previousGrid.grid)); 
                
                // Update the size display input field
                $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
            }
            break;
        // Add other cases as needed
        default:
            console.error('Unknown change type for undo:', changeObject.type);
            // Don't proceed with pointer/button updates if we didn't handle the type
            return; 
    }
    
    // 4. Refresh UI (Only after applying the undo logic)
    refreshEditionGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);

    // 5. Update Pointer
    historyIndex--;

    updateUndoRedoButtons(); // Update button states after undo
}

function redo() {
    // 1. Check Availability
    if (historyIndex >= changeHistory.length - 1) {
        return; // Nothing to redo
    }

    // 2. Increment Pointer
    historyIndex++;

    // 3. Get Change
    const changeObject = changeHistory[historyIndex];

    // 4. Apply Forward (Specific logic based on type needed here)
    switch (changeObject.type) {
        case 'edit':
        case 'paste': // Paste redo is similar to edit redo
            if (changeObject.redoData && changeObject.redoData.coordValueMap) {
                for (const coordStr in changeObject.redoData.coordValueMap) {
                    const coords = JSON.parse(coordStr);
                    const newSymbol = changeObject.redoData.coordValueMap[coordStr];
                    const x = coords[0]; // row index
                    const y = coords[1]; // column index
                    // Update the data grid directly, ensuring coordinates are within bounds
                    if (x >= 0 && x < CURRENT_OUTPUT_GRID.height && y >= 0 && y < CURRENT_OUTPUT_GRID.width) { // Correct bounds check: row < height, col < width
                        CURRENT_OUTPUT_GRID.grid[x][y] = newSymbol; // Correct assignment: grid[row][col]
                    }
                }
                // console.log('After redo applied (edit/paste):', 'Change Object:', JSON.stringify(changeObject), 'Current Grid State:', JSON.stringify(CURRENT_OUTPUT_GRID.grid));
            }
            break;
        case 'resize':
            // Re-apply resize using redoData dimensions
            if (changeObject.redoData) {
                CURRENT_OUTPUT_GRID.height = changeObject.redoData.newHeight;
                CURRENT_OUTPUT_GRID.width = changeObject.redoData.newWidth;
                // Grid data is implicitly handled by refresh or was potentially stored in undoData
                // Re-initialize grid? The original resize logic might be needed.
                // For now, just setting dimensions and relying on refresh.
                 CURRENT_OUTPUT_GRID.grid = resizeGrid(CURRENT_OUTPUT_GRID.grid, CURRENT_OUTPUT_GRID.height, CURRENT_OUTPUT_GRID.width);
                $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
            }
            break;
        case 'copyInput':
            if (changeObject.redoData && changeObject.redoData.newGrid) { // Check for 'newGrid'
                // Restore the entire grid state from after the copy
                CURRENT_OUTPUT_GRID = JSON.parse(JSON.stringify(changeObject.redoData.newGrid)); // Use 'newGrid'
            }
            break;
        case 'reset':
            // Restore the grid state from the saved new grid object in redoData
            if (changeObject.redoData && changeObject.redoData.newGrid) {
                const newGrid = changeObject.redoData.newGrid;
                CURRENT_OUTPUT_GRID.height = newGrid.height;
                CURRENT_OUTPUT_GRID.width = newGrid.width;
                CURRENT_OUTPUT_GRID.grid = JSON.parse(JSON.stringify(newGrid.grid)); 
                $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
            }
            break;
        default:
            console.error('Unknown change type for redo:', changeObject.type);
            // Revert pointer increment if we didn't handle the type
            historyIndex--; 
            return;
    }

    // 5. Refresh UI (Only after applying the redo logic)
    refreshEditionGrid($('#output_grid .edition_grid'), CURRENT_OUTPUT_GRID);

    updateUndoRedoButtons(); // Update button states after redo
}

// Function to fill a pair preview slot (input/output) in the task demonstration area
function fillPairPreview(pairId, inputGrid, outputGrid) {
    var pairSlot = $('#pair_preview_' + pairId);
    if (!pairSlot.length) {
        // Create HTML for pair if it doesn't exist.
        pairSlot = $('<div id="pair_preview_' + pairId + '" class="pair_preview" index="' + pairId + '"></div>');
        pairSlot.appendTo('#task_preview');
    }
    var jqInputGrid = pairSlot.find('.input_preview');
    if (!jqInputGrid.length) {
        jqInputGrid = $('<div class="input_preview"></div>');
        jqInputGrid.appendTo(pairSlot);
    }
    var jqOutputGrid = pairSlot.find('.output_preview');
    if (!jqOutputGrid.length) {
        jqOutputGrid = $('<div class="output_preview"></div>');
        jqOutputGrid.appendTo(pairSlot);
    }

    // Fill the grid elements with data and fit them
    fillJqGridWithData(jqInputGrid, inputGrid);
    fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 200, 200);
    fillJqGridWithData(jqOutputGrid, outputGrid);
    fitCellsToContainer(jqOutputGrid, outputGrid.height, outputGrid.width, 200, 200);
}

function loadJSONTask(train, test) {
    resetTask();
    $('#modal_bg').hide();
    $('#error_display').hide();
    $('#info_display').hide();

    for (var i = 0; i < train.length; i++) {
        pair = train[i];
        values = pair['input'];
        input_grid = convertSerializedGridToGridObject(values)
        values = pair['output'];
        output_grid = convertSerializedGridToGridObject(values)
        fillPairPreview(i, input_grid, output_grid);
    }
    for (var i=0; i < test.length; i++) {
        pair = test[i];
        TEST_PAIRS.push(pair);
    }
    values = TEST_PAIRS[0]['input'];
    CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values)
    fillTestInput(CURRENT_INPUT_GRID);
    CURRENT_TEST_PAIR_INDEX = 0;
    $('#current_test_input_id_display').html('1');
    $('#total_test_input_count_display').html(test.length);
    updateUndoRedoButtons(); // Update buttons after task load
}

function display_task_name(task_name, task_index, number_of_tasks) {
    big_space = '&nbsp;'.repeat(4); 
    document.getElementById('task_name').innerHTML = (
        'Task name:' + big_space + task_name + big_space + (
            task_index===null ? '' :
            ( String(task_index) + ' out of ' + String(number_of_tasks) )
        )
    );
}

function loadTaskFromFile(e) {
    var file = e.target.files[0];
    if (!file) {
        errorMsg('No file selected');
        return;
    }
    var reader = new FileReader();
    reader.onload = function(e) {
        var contents = e.target.result;

        try {
            contents = JSON.parse(contents);
            train = contents['train'];
            test = contents['test'];
        } catch (e) {
            errorMsg('Bad file format');
            return;
        }
        loadJSONTask(train, test);

        $('#load_task_file_input')[0].value = "";
        display_task_name(file.name, null, null);
    };
    reader.readAsText(file);
}

function randomTask() {
    var subset = "training";
    $.getJSON("https://api.github.com/repos/fchollet/ARC/contents/data/" + subset, function(tasks) {
        var task_index = Math.floor(Math.random() * tasks.length)
        var task = tasks[task_index];
        $.getJSON(task["download_url"], function(json) {
            try {
                train = json['train'];
                test = json['test'];
            } catch (e) {
                errorMsg('Bad file format');
                return;
            }
            loadJSONTask(train, test);
            //$('#load_task_file_input')[0].value = "";
            infoMsg("Loaded task training/" + task["name"]);
            display_task_name(task['name'], task_index, tasks.length);
        })
        .error(function(){
          errorMsg('Error loading task');
        });
    })
    .error(function(){
      errorMsg('Error loading task list');
    });
}

function nextTestInput() {
    if (TEST_PAIRS.length <= CURRENT_TEST_PAIR_INDEX + 1) {
        errorMsg('No next test input. Pick another file?')
        return
    }
    CURRENT_TEST_PAIR_INDEX += 1;
    values = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]['input'];
    CURRENT_INPUT_GRID = convertSerializedGridToGridObject(values)
    fillTestInput(CURRENT_INPUT_GRID);
    $('#current_test_input_id_display').html(CURRENT_TEST_PAIR_INDEX + 1);
    $('#total_test_input_count_display').html(test.length);
}

function submitSolution() {
    syncFromEditionGridToDataGrid();
    reference_output = TEST_PAIRS[CURRENT_TEST_PAIR_INDEX]['output'];
    submitted_output = CURRENT_OUTPUT_GRID.grid;
    if (reference_output.length != submitted_output.length) {
        errorMsg('Wrong solution.');
        return
    }
    for (var i = 0; i < reference_output.length; i++){
        ref_row = reference_output[i];
        for (var j = 0; j < ref_row.length; j++){
            if (ref_row[j] != submitted_output[i][j]) {
                errorMsg('Wrong solution.');
                return
            }
        }

    }
    infoMsg('Correct solution!');
}

function fillTestInput(inputGrid) {
    jqInputGrid = $('#evaluation_input');
    fillJqGridWithData(jqInputGrid, inputGrid);
    fitCellsToContainer(jqInputGrid, inputGrid.height, inputGrid.width, 400, 400);
}

function copyToOutput() {
    syncFromEditionGridToDataGrid();
    CURRENT_OUTPUT_GRID = convertSerializedGridToGridObject(CURRENT_INPUT_GRID.grid);
    syncFromDataGridToEditionGrid();
    $('#output_grid_size').val(CURRENT_OUTPUT_GRID.height + 'x' + CURRENT_OUTPUT_GRID.width);
}

function initializeSelectable() {
    try {
        $('.selectable_grid').selectable('destroy');
    }
    catch (e) {
    }
    toolMode = $('input[name=tool_switching]:checked').val();
    if (toolMode == 'select') {
        infoMsg('Select some cells and click on a color to fill in, or press C to copy');
        $('.selectable_grid').selectable(
            {
                autoRefresh: false,
                filter: '> .row > .cell',
                start: function(event, ui) {
                    $('.ui-selected').each(function(i, e) {
                        $(e).removeClass('ui-selected');
                    });
                }
            }
        );
    }
}

// Initial event binding.

$(document).ready(function () {
    resetTask(); // Reset history and update buttons on load

    // Set text color for symbol previews based on background
    $('#symbol_picker .symbol_preview').each(function() {
        const $preview = $(this);
        const bgColor = $preview.css('background-color');
        const textColor = calculateTextColor(bgColor);
        $preview.css('color', textColor);
        // Add some basic styling for the number
        $preview.css({
            'display': 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            'font-weight': 'bold',
            'font-size': '0.8em'
        });
    });

    $('#symbol_picker').find('.symbol_preview').click(function(event) {
        symbol_preview = $(event.target);
        $('#symbol_picker').find('.symbol_preview').each(function(i, preview) {
            $(preview).removeClass('selected-symbol-preview');
        })
        symbol_preview.addClass('selected-symbol-preview');

        toolMode = $('input[name=tool_switching]:checked').val();
        if (toolMode == 'select') {
            $('.edition_grid').find('.ui-selected').each(function(i, cell) {
                symbol = getSelectedSymbol();
                setCellSymbol($(cell), symbol);
            });
        }
    });

    $('.edition_grid').each(function(i, jqGrid) {
        setUpEditionGridListeners($(jqGrid));
    });

    $('.load_task').on('change', function(event) {
        loadTaskFromFile(event);
    });

    $('.load_task').on('click', function(event) {
      event.target.value = "";
    });

    $('input[type=radio][name=tool_switching]').change(function() {
        initializeSelectable();
    });
    
    $('input[type=text][name=size]').on('keydown', function(event) {
        if (event.keyCode == 13) {
            resizeOutputGrid();
        }
    });

    $('body').keydown(function(event) {
        // --- Undo/Redo --- 
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const undoKeyPressed = (isMac ? event.metaKey : event.ctrlKey) && !event.shiftKey && event.keyCode === 90; // Cmd+Z or Ctrl+Z
        const redoKeyPressed = (isMac ? event.metaKey : event.ctrlKey) && event.shiftKey && event.keyCode === 90; // Cmd+Shift+Z or Ctrl+Shift+Z
        const redoYKeyPressed = !isMac && event.ctrlKey && !event.shiftKey && event.keyCode === 89; // Ctrl+Y (Windows/Linux)

        if (undoKeyPressed) {
            undo();
            event.preventDefault();
            return;
        }
        if (redoKeyPressed || redoYKeyPressed) {
            redo();
            event.preventDefault();
            return;
        }
        // --- End Undo/Redo ---
        
        // --- Copy/Paste --- 
        // Handle C for copy (No Ctrl/Meta)
        if (!event.ctrlKey && !event.metaKey && event.which == 67) {
            // Press C
            selected = $('.edition_grid').find('.ui-selected'); // Target the edition grid specifically
            if (selected.length == 0) {
                return;
            }

            COPY_PASTE_DATA = [];
            for (var i = 0; i < selected.length; i ++) {
                x = parseInt($(selected[i]).attr('x'));
                y = parseInt($(selected[i]).attr('y'));
                symbol = parseInt($(selected[i]).attr('symbol'));
                COPY_PASTE_DATA.push([x, y, symbol]);
            }
            infoMsg('Cells copied! Select a target cell and press V to paste at location.');
            return;
        }
        // Handle V for paste (No Ctrl/Meta)
        if (!event.ctrlKey && !event.metaKey && event.which == 86) {
            // Press V
            if (COPY_PASTE_DATA.length == 0) {
                errorMsg('No data to paste.');
                return;
            }
            selected = $('.edition_grid').find('.ui-selected');
            if (selected.length == 0) {
                errorMsg('Select a target cell on the output grid.');
                return;
            }

            jqGrid = $(selected.parent().parent()[0]);

            if (selected.length == 1) {
                // --- Refactored Paste History Recording ---
                // 1. Capture grid state BEFORE paste
                const gridBeforePaste = JSON.parse(JSON.stringify(CURRENT_OUTPUT_GRID.grid));

                // 2. Apply paste (Update visual AND data grid)
                targetx = parseInt(selected.attr('x'));
                targety = parseInt(selected.attr('y'));

                xs = new Array();
                ys = new Array();
                symbols = new Array();

                for (var i = 0; i < COPY_PASTE_DATA.length; i ++) {
                    xs.push(COPY_PASTE_DATA[i][0]);
                    ys.push(COPY_PASTE_DATA[i][1]);
                    symbols.push(COPY_PASTE_DATA[i][2]);
                }
                minx = Math.min(...xs);
                miny = Math.min(...ys);

                for (var i = 0; i < xs.length; i++) {
                    x = xs[i];
                    y = ys[i];
                    symbol = symbols[i];
                    newx = x - minx + targetx;
                    newy = y - miny + targety;
                    res = jqGrid.find('[x="' + newx + '"][y="' + newy + '"] ');
                    if (res.length == 1) {
                        cell = $(res[0]);
                        setCellSymbol(cell, symbol); // Update visual cell
                        // Also update data grid directly
                        if (newx >= 0 && newx < CURRENT_OUTPUT_GRID.height && newy >= 0 && newy < CURRENT_OUTPUT_GRID.width) {
                             CURRENT_OUTPUT_GRID.grid[newx][newy] = symbol; // Update data grid
                        }
                    }
                }

                // 3. Determine changes for undo/redo maps by comparing before/after states
                const undoMap = {};
                const redoMap = {};
                for (let r = 0; r < CURRENT_OUTPUT_GRID.height; r++) {
                    for (let c = 0; c < CURRENT_OUTPUT_GRID.width; c++) {
                        // Check if the cell exists in the grid before paste (might be undefined if grid resized)
                        const previousSymbol = (gridBeforePaste[r] !== undefined && gridBeforePaste[r][c] !== undefined) ? gridBeforePaste[r][c] : 0; // Default to 0 if undefined
                        const currentSymbol = (CURRENT_OUTPUT_GRID.grid[r] !== undefined && CURRENT_OUTPUT_GRID.grid[r][c] !== undefined) ? CURRENT_OUTPUT_GRID.grid[r][c] : 0;
                        
                        if (previousSymbol !== currentSymbol) {
                            const coordKey = `[${r},${c}]`; // [row, col]
                            undoMap[coordKey] = previousSymbol;
                            redoMap[coordKey] = currentSymbol;
                        }
                    }
                }

                // 4. Record the change using coordValueMap if changes occurred
                if (Object.keys(undoMap).length > 0) {
                    recordChange({ 
                        type: 'paste', 
                        undoData: { coordValueMap: undoMap }, 
                        redoData: { coordValueMap: redoMap } 
                    });
                }
                // --- End Refactored Paste History Recording ---
            } else {
                errorMsg('Can only paste at a specific location; only select *one* cell as paste destination.');
            }
            return;
        }
        // --- End Copy/Paste --- 

        // --- Symbol Selection --- 
        // Handle number keys 0-9 for symbol selection (No modifiers)
        if (event.which >= 48 && event.which <= 57 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { // Key codes for 0-9
            // Check if focus is NOT in an input/textarea to avoid overriding typing
            if ($('input:focus, textarea:focus').length === 0) { 
                const symbolNumber = event.which - 48;
                const symbolPreview = $(`#symbol_picker .symbol_preview[symbol='${symbolNumber}']`);
                if (symbolPreview.length) {
                    symbolPreview.click(); // Simulate click to select the symbol
                    event.preventDefault(); // Prevent default number input behavior
                }
            }
        }
        // --- End Symbol Selection --- 
    });

    $('input[type=text][name=size]').on('keydown', function(event) {
        if (event.keyCode == 13) {
            resizeOutputGrid();
        }
    });
});
