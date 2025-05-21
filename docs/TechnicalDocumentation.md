# Unreal Log Viewer - Technical Documentation

## 1. Overview

The "Unreal Log Viewer" is a Visual Studio Code extension designed to receive, display, and filter log messages streamed from an Unreal Engine application over a TCP network connection. It provides a dedicated webview panel within VS Code for real-time log monitoring and analysis, aiding in the debugging and development process for Unreal Engine projects.

## 2. Core Architecture

The extension is primarily built around a few key components:

* **`UnrealLogViewerProvider` (`src/unrealLogViewer.ts`)**:
    * Implements `vscode.WebviewViewProvider`.
    * Manages the lifecycle and content of the webview panel where logs are displayed.
    * Maintains an in-memory store of received log messages (`this.logs`).
    * Handles incoming log data from the TCP server, processes it, and applies filters.
    * Facilitates communication between the VS Code extension host and the webview (e.g., sending logs, filter updates, configuration changes).
    * Persists filter settings (`levelFilter`, `categoryFilter`, `messageFilter`) using `context.workspaceState`.
    * Provides methods for clearing logs, updating webview appearance (font, colors, gridlines, font family), and managing log flow (pause/resume).

* **Webview Panel (HTML/CSS/JavaScript):**
    * Dynamically generated HTML content via the `_getInitialWebviewHtml` method in `UnrealLogViewerProvider`.
    * Renders logs in a sortable, filterable table.
    * Includes UI elements for filter inputs (level, category, message), clear button, pause button, Copilot view button, and other controls.
    * Communicates with the extension host using `vscode.postMessage()` (from webview to extension) and `window.addEventListener('message', ...)` (from extension to webview).
    * Handles user interactions within the webview (e.g., applying filters, sorting).
    * The visual styling aims to integrate with VS Code themes.

* **TCP Log Server (`createAndListenServer` in `src/unrealLogViewer.ts`):**
    * A Node.js `net.Server` instance.
    * Listens on a configurable TCP port (default: 9876) for incoming connections.
    * Expects log data in JSON format, with each JSON object representing a single log entry (robust parsing, not reliant on newlines).
    * Parses incoming data, validates the JSON structure, and passes valid log objects to the `UnrealLogViewerProvider` for processing and display.
    * Handles server errors and client disconnections.

* **`UnrealLogTextDocumentContentProvider` (`src/unrealLogViewer.ts`):**
    * Implements `vscode.TextDocumentContentProvider`.
    * Provides the content for a virtual text document (scheme: `unreal-log-copilot`).
    * Used by the "Show Logs as Text for Copilot" command to expose a configurable number of recent logs as plain text, making them accessible to tools like GitHub Copilot for context.

* **Extension Activation (`activate` in `src/unrealLogViewer.ts`):**
    * The main entry point for the extension.
    * Registers the `UnrealLogViewerProvider` for the custom view (`unrealLogViewerView3`).
    * Registers all commands contributed by the extension.
    * Initializes and starts the TCP log server based on the configured port.
    * Sets up listeners for configuration changes to dynamically update the server port and webview appearance.

## 3. Key Features & Implementation Details

* **Log Reception:**
    * TCP server listens for JSON log objects (robust to missing newlines).
    * Expected JSON structure: `{ "date": "ISO_string", "level": "string", "category": "string", "message": "string", "source"?: "SRC" }`.
    * Robust parsing with error handling for malformed JSON.

* **Log Storage & Management:**
    * Logs are stored in an array (`this.logs`) within `UnrealLogViewerProvider`.
    * A configurable maximum number of log messages (`unrealLogViewer.maxLogMessages`) is enforced. When exceeded, the oldest 10% of messages are pruned.

* **Log Display:**
    * Webview uses a dynamic HTML table.
    * Timestamps can be displayed as absolute or relative (to last clear time), controlled by `unrealLogViewer.useRelativeTimestamps`.
    * Customizable font size (`unrealLogViewer.logTableFontSize`) and font family (`unrealLogViewer.logTableFontFamily`).
    * Optional log level color-coding (`unrealLogViewer.useLogLevelColors`) and grid lines (`unrealLogViewer.showGridLines`).
    * Dynamic SRC column: Only shown if any log has a `source`/`src` field; always at most 3 characters wide.

* **Filtering:**
    * **Level Filter:** Filters by log verbosity (e.g., "Error", "Warning", "Log"). Supports comma-separated values and exclusion (e.g., `!Verbose`).
    * **Category Filter:** Filters by Unreal Engine log category (e.g., "LogBlueprint", "LogNet"). Supports comma-separated values, wildcards (`*`), and exclusion (`!`).
    * **Message Filter:** Filters by content within the log message itself. Supports comma-separated values and exclusion (`!`). Case-insensitive.
    * Filters are applied in `UnrealLogViewerProvider._passesFilters()` before logs are sent to the webview.
    * Filter input values are persisted in workspace state.

* **Commands (`package.json` -> `contributes.commands`):**
    * `unrealLogViewer.create`: Ensures the log viewer panel is visible.
    * `unrealLogViewer.clear`: Clears all logs from the view and resets relative timestamps.
    * `unrealLogViewer.applyServerPortChange`: Restarts the TCP server with the port defined in settings.
    * `unrealLogViewer.showLogsAsText`: Opens recent logs in a virtual text document for Copilot.

* **Configuration (`package.json` -> `contributes.configuration`):**
    * `unrealLogViewer.serverPort`: TCP port for the log server.
    * `unrealLogViewer.useRelativeTimestamps`: Toggle for relative/absolute timestamps.
    * `unrealLogViewer.logTableFontSize`: Font size for log entries.
    * `unrealLogViewer.logTableFontFamily`: Font family for log entries.
    * `unrealLogViewer.useLogLevelColors`: Toggle for log level colorization.
    * `unrealLogViewer.maxLogMessages`: Maximum logs to retain.
    * `unrealLogViewer.showGridLines`: Toggle for table grid lines.
    * `unrealLogViewer.copilotLogExportLimit`: Number of logs for the "Show Logs as Text" feature.

## 4. Manifest File (`package.json`)

- **name**: `unreal-log-viewer`
- **displayName**: `Unreal Log-Viewer 3`
- **version**: `1.0.0`
- **publisher**: `coregames`
- **private**: `false`
- **license**: `GPL-3.0-only`
- **repository**: `https://github.com/hwacookie/unreal-log-extension`
- **engines.vscode**: `^1.73.0`
- **main**: `./out/unrealLogViewer.js`
- **categories**: `["Other"]`
- **activationEvents**: `onView:unrealLogViewerView3`, `onCommand:unrealLogViewer.create`, `onCommand:unrealLogViewer.clear`, `onCommand:unrealLogViewer.applyServerPortChange`, `onCommand:unrealLogViewer.showLogsAsText`
- **contributes**:
    - **commands**: All commands listed above.
    - **configuration**: All settings listed above.
    - **viewsContainers** & **views**: Defines the custom activity bar icon and the webview panel itself (`unrealLogViewerView3`).
- **scripts**:
    - `vscode:prepublish`: `npm run compile`
    - `compile`: `tsc -p ./`
    - `watch`: `tsc -watch -p ./`
    - `lint`: `eslint`
- **devDependencies**: `@eslint/js`, `@stylistic/eslint-plugin`, `@types/node`, `@types/vscode`, `eslint`, `typescript`, `typescript-eslint`
- **dependencies**: (Currently contains the problematic `unreal-log-viewer: "file:"` entry, which causes packaging errors and should be removed for production.)

## 5. Build and Packaging

* **Compilation:** TypeScript (`.ts` files in `src/`) is compiled to JavaScript (`.js` files in `out/`) using the `tsc` command, configured by `tsconfig.json`.
* **Packaging:** The `vsce package` command is used to create a `.vsix` file (the installable extension package).
    * This command typically runs the `vscode:prepublish` script.
    * A `.vscodeignore` file is crucial to exclude unnecessary files (e.g., `node_modules`, `src`, build artifacts) from the `.vsix` package to keep its size minimal and prevent issues. The current attempt to package fails with an `EISDIR` error, likely due to the self-referencing `dependencies` entry and the inclusion of `node_modules`.

## 6. Recent Development Summary & State

* **Renaming:** The extension was renamed from "Unreal Log-Viewer 2" to "Unreal Log-Viewer 3". This involved updating:
    * `UnrealLogViewerProvider.viewType` from `unrealLogViewerView2` to `unrealLogViewerView3`.
    * References in `activate()` and command registration.
    * `package.json`: `name`, `displayName`, and view IDs in `contributes.views`, `activationEvents`, and related fields.
* **`package.json` Refinements:**
    * Improved `description`.
    * Updated `repository` URL.
    * Updated `engines.vscode` to `^1.73.0`.
    * Explicit `activationEvents` array is present.
    * The persistent and problematic `dependencies: { "unreal-log-viewer": "file:" }` entry remains and is still causing `vsce package` errors.
    * Updated `devDependencies` to include new ESLint and TypeScript-related packages, `mocha`, `mochawesome`, `@types/mocha`, `@vscode/test-electron`, `ts-node`.
    * Updated `license` to `GPL-3.0-only` and set `private` to `false`.

* **Packaging Issues:**
    * The `vsce package` command still fails with an `EISDIR` error due to the self-referential `dependencies` entry.
    * A `.vscodeignore` file is still recommended to exclude `node_modules` and other non-essential files from the package.

* **Runtime Issue Identified:** The log viewer webview closes when focus is switched away from it. This is likely due to the webview context not being retained. Setting `webview.options.retainContextWhenHidden = true;` in `resolveWebviewView` is the primary recommended fix.

* **Testing Infrastructure:**
    * **Mocha** and **Mochawesome** have been installed for test execution and reporting.
    * **UI Tests** (`test/ui/*.test.ts`): These tests use `@vscode/test-electron` to run in a VS Code extension host environment. They cover UI interactions and behavior requiring a live VS Code instance.
    * **Unit Tests** (`test/logFilter.test.ts`): Plain TypeScript/JavaScript unit tests that do not require a full VS Code environment.
    * **Test Scripts (`package.json`):**
        * `test:ui`: Runs UI tests using `ts-node test/ui/runVSCodeTests.ts` (which configures Mochawesome reporting).
        * `test:ui:full`: Compiles the project and then runs `test:ui`.
        * `test:unit`: Runs plain unit tests using Mocha directly (`mocha out/test/logFilter.test.js`).
        * `test`: A top-level script to compile and run both unit and UI tests.
    * **VS Code Test Explorer Setup:**
        * The "Mocha Test Explorer" extension (`hbenl.vscode-mocha-test-adapter`) is recommended.
        * Configuration in `.vscode/settings.json` is set to discover and run only plain unit tests (`out/test/logFilter.test.js`) to avoid conflicts with UI tests that require a different runner and the `vscode` module mock.
        * A `test/ui/vscode-mock.js` file was created to help with UI test discovery if the glob pattern were to include them, but it's currently not used by the Test Explorer configuration to ensure plain unit tests run reliably.

## 7. Next Steps / Outstanding Issues

1. **Resolve `package.json` "dependencies" Issue:** Identify and stop the process that automatically re-adds `unreal-log-viewer: "file:"` to `dependencies`. This is critical for successful packaging.
2. **Implement `.vscodeignore`:** Create and populate `.vscodeignore` to ensure a clean and minimal `.vsix` package.
3. **Fix Webview Closing Issue:** Implement `retainContextWhenHidden: true` for the webview to prevent it from closing when hidden.
4. **Successful Packaging:** Once the above are resolved, `vsce package` should produce a valid `.vsix` file.
5. **Testing:** Thoroughly test the packaged extension.

## 8. Testing Guide

This section outlines how to set up the testing environment and run the different types of tests included in this project.

### 8.1. Prerequisites

Before running tests, ensure you have Node.js and npm installed. Then, install the project dependencies:

```bash
npm install
```

This will install all necessary development dependencies, including Mocha, Mochawesome, TypeScript, and the VS Code test utilities.

### 8.2. Compiling the Project

Most tests run against the compiled JavaScript output. Ensure the project is compiled:

```bash
npm run compile
```

Alternatively, you can run `npm run watch` in a separate terminal to automatically recompile on file changes.

### 8.3. Running Tests

There are two main types of tests: plain unit tests and UI tests.

#### 8.3.1. Plain Unit Tests

These tests verify individual functions and modules that do not require a full VS Code environment. They are located in `test/` (e.g., `test/logFilter.test.ts`).

**Using npm:**

To run all plain unit tests:

```bash
npm run test:unit
```

This command executes `mocha out/test/logFilter.test.js`.

**Using VS Code Test Explorer:**

1.  Install the "Mocha Test Explorer" extension (ID: `hbenl.vscode-mocha-test-adapter`) from the VS Code Marketplace.
2.  Open the Test view in the VS Code sidebar.
3.  The plain unit tests (e.g., from `logFilter.test.js`) should be discovered automatically.
4.  You can run individual tests, suites, or all discovered plain unit tests using the play icons in the Test Explorer.
    *Note: The current configuration in `.vscode/settings.json` is specifically set up to only discover these plain unit tests for reliable execution in the Test Explorer.*

#### 8.3.2. UI Tests

These tests interact with the VS Code UI and require a special test environment provided by `@vscode/test-electron`. They are located in `test/ui/`.

**Using npm:**

To run all UI tests (this includes compilation):

```bash
npm run test:ui:full
```

This command will:
1.  Compile the project (`npm run compile`).
2.  Launch a new VS Code instance with the extension loaded.
3.  Run the UI tests defined in `test/ui/**/*.test.ts`.
4.  Generate test reports using Mochawesome in the `test-results/mochawesome` directory.

To run UI tests without recompiling (if you've already compiled):

```bash
npm run test:ui
```

*Note: UI tests cannot be reliably run directly from the VS Code Test Explorer due to their dependency on a full VS Code environment and specific APIs that are not available in the standard Node.js environment used by the Test Explorer for test discovery/execution.*

#### 8.3.3. Running All Tests

To run a comprehensive test suite that includes compilation, plain unit tests, and UI tests:

```bash
npm run test
```

This script will execute `npm run compile`, then `npm run test:unit`, and finally `npm run test:ui`.

### 8.4. Test Reporting

UI tests automatically generate HTML and JSON reports using **Mochawesome**. These reports can be found in:
`test-results/mochawesome/`

Open the `report.html` file in a web browser to view a detailed report of the UI test run.