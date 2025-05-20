# Unreal Log Viewer - Technical Documentation

## 1. Overview

The "Unreal Log Viewer" is a Visual Studio Code extension designed to receive, display, and filter log messages streamed from an Unreal Engine application over a TCP network connection. It provides a dedicated webview panel within VS Code for real-time log monitoring and analysis, aiding in the debugging and development process for Unreal Engine projects.

## 2. Core Architecture

The extension is primarily built around a few key components:

*   **`UnrealLogViewerProvider` (`src/unrealLogViewer.ts`):**
    *   Implements `vscode.WebviewViewProvider`.
    *   Manages the lifecycle and content of the webview panel where logs are displayed.
    *   Maintains an in-memory store of received log messages (`this.logs`).
    *   Handles incoming log data from the TCP server, processes it, and applies filters.
    *   Facilitates communication between the VS Code extension host and the webview (e.g., sending logs, filter updates, configuration changes).
    *   Persists filter settings (`levelFilter`, `categoryFilter`, `messageFilter`) using `context.workspaceState`.
    *   Provides methods for clearing logs, updating webview appearance (font, colors, gridlines), and managing log flow (pause/resume).

*   **Webview Panel (HTML/CSS/JavaScript):**
    *   Dynamically generated HTML content via the `_getInitialWebviewHtml` method in `UnrealLogViewerProvider`.
    *   Renders logs in a sortable, filterable table.
    *   Includes UI elements for filter inputs (level, category, message), clear button, pause button, and potentially other controls.
    *   Communicates with the extension host using `vscode.postMessage()` (from webview to extension) and `window.addEventListener('message', ...)` (from extension to webview).
    *   Handles user interactions within the webview (e.g., applying filters, sorting).
    *   The visual styling aims to integrate with VS Code themes.

*   **TCP Log Server (`createAndListenServer` in `src/unrealLogViewer.ts`):**
    *   A Node.js `net.Server` instance.
    *   Listens on a configurable TCP port (default: 9876) for incoming connections.
    *   Expects log data in JSON format, with each JSON object representing a single log entry and terminated by a newline.
    *   Parses incoming data, validates the JSON structure, and passes valid log objects to the `UnrealLogViewerProvider` for processing and display.
    *   Handles server errors and client disconnections.

*   **`UnrealLogTextDocumentContentProvider` (`src/unrealLogViewer.ts`):**
    *   Implements `vscode.TextDocumentContentProvider`.
    *   Provides the content for a virtual text document (scheme: `unreal-log-copilot`).
    *   Used by the "Show Logs as Text for Copilot" command to expose a configurable number of recent logs as plain text, making them accessible to tools like GitHub Copilot for context.

*   **Extension Activation (`activate` in `src/unrealLogViewer.ts`):**
    *   The main entry point for the extension.
    *   Registers the `UnrealLogViewerProvider` for the custom view (`unrealLogViewerView`).
    *   Registers all commands contributed by the extension.
    *   Initializes and starts the TCP log server based on the configured port.
    *   Sets up listeners for configuration changes to dynamically update the server port and webview appearance.

## 3. Key Features & Implementation Details

*   **Log Reception:**
    *   TCP server listens for newline-terminated JSON strings.
    *   Expected JSON structure: `{ "date": "ISO_string", "level": "string", "category": "string", "message": "string" }`.
    *   Robust parsing with error handling for malformed JSON.

*   **Log Storage & Management:**
    *   Logs are stored in an array (`this.logs`) within `UnrealLogViewerProvider`.
    *   A configurable maximum number of log messages (`unrealLogViewer.maxLogMessages`) is enforced. When exceeded, the oldest 10% of messages are pruned.

*   **Log Display:**
    *   Webview uses a dynamic HTML table.
    *   Timestamps can be displayed as absolute or relative (to last clear time), controlled by `unrealLogViewer.useRelativeTimestamps`.
    *   Customizable font size (`unrealLogViewer.logTableFontSize`) and font family (`unrealLogViewer.logTableFontFamily`).
    *   Optional log level color-coding (`unrealLogViewer.useLogLevelColors`) and grid lines (`unrealLogViewer.showGridLines`).

*   **Filtering:**
    *   **Level Filter:** Filters by log verbosity (e.g., "Error", "Warning", "Log"). Supports comma-separated values and exclusion (e.g., `!Verbose`).
    *   **Category Filter:** Filters by Unreal Engine log category (e.g., "LogBlueprint", "LogNet"). Supports comma-separated values, wildcards (`*`), and exclusion (`!`).
    *   **Message Filter:** Filters by content within the log message itself. Supports comma-separated values and exclusion (`!`). Case-insensitive.
    *   Filters are applied in `UnrealLogViewerProvider._passesFilters()` before logs are sent to the webview.
    *   Filter input values are persisted in workspace state.

*   **Commands (`package.json` -> `contributes.commands`):**
    *   `unrealLogViewer.create`: Ensures the log viewer panel is visible.
    *   `unrealLogViewer.clear`: Clears all logs from the view and resets relative timestamps.
    *   `unrealLogViewer.applyServerPortChange`: Restarts the TCP server with the port defined in settings.
    *   `unrealLogViewer.showLogsAsText`: Opens recent logs in a virtual text document.

*   **Configuration (`package.json` -> `contributes.configuration`):**
    *   `unrealLogViewer.serverPort`: TCP port for the log server.
    *   `unrealLogViewer.useRelativeTimestamps`: Toggle for relative/absolute timestamps.
    *   `unrealLogViewer.logTableFontSize`: Font size for log entries.
    *   `unrealLogViewer.logTableFontFamily`: Font family for log entries.
    *   `unrealLogViewer.useLogLevelColors`: Toggle for log level colorization.
    *   `unrealLogViewer.maxLogMessages`: Maximum logs to retain.
    *   `unrealLogViewer.showGridLines`: Toggle for table grid lines.
    *   `unrealLogViewer.copilotLogExportLimit`: Number of logs for the "Show Logs as Text" feature.

## 4. Manifest File (`package.json`)

*   **`name`**: `unreal-log-viewer` (unique identifier).
*   **`displayName`**: `Unreal Log-Viewer` (user-facing name).
*   **`version`**: `0.0.1` (current version).
*   **`publisher`**: `coregames` (Marketplace publisher ID).
*   **`repository`**: Specifies the Git repository URL.
*   **`engines.vscode`**: `^1.85.0` (minimum VS Code version compatibility).
*   **`main`**: `./out/unrealLogViewer.js` (entry point for the compiled extension).
*   **`categories`**: `["Other"]`.
*   **`keywords`**: Helps discoverability in the Marketplace.
*   **`contributes`**: Defines extension points:
    *   `commands`: User-invokable actions.
    *   `configuration`: User-configurable settings.
    *   `viewsContainers` & `views`: Defines the custom activity bar icon and the webview panel itself (`unrealLogViewerView`).
*   **`scripts`**:
    *   `vscode:prepublish`: `npm run compile` (runs before packaging).
    *   `compile`: `tsc -p ./` (compiles TypeScript).
    *   `watch`: `tsc -watch -p ./` (compiles TypeScript in watch mode).
    *   `lint`: `eslint` (runs the linter).
*   **`devDependencies`**: Lists development-time dependencies (e.g., `@types/vscode`, `typescript`, `eslint`).
*   **`dependencies`**: (Currently problematic with `unreal-log-viewer: "file:"` entry, ideally should be empty or list true runtime npm dependencies if any were used directly in the extension runtime and not bundled).

## 5. Build and Packaging

*   **Compilation:** TypeScript (`.ts` files in `src/`) is compiled to JavaScript (`.js` files in `out/`) using the `tsc` command, configured by `tsconfig.json`.
*   **Packaging:** The `vsce package` command is used to create a `.vsix` file (the installable extension package).
    *   This command typically runs the `vscode:prepublish` script.
    *   A `.vscodeignore` file is crucial to exclude unnecessary files (e.g., `node_modules`, `src`, build artifacts) from the `.vsix` package to keep its size minimal and prevent issues. The current attempt to package failed with an `EISDIR` error, likely due to the self-referencing `dependencies` entry and the inclusion of `node_modules`.

## 6. Recent Development Summary & State

*   **Renaming:** The extension was renamed from "Unreal Log-Viewer 2" to "Unreal Log-Viewer". This involved updating:
    *   `UnrealLogViewerProvider.viewType` from `unrealLogViewerView2` to `unrealLogViewerView`.
    *   References in `activate()` and command registration.
    *   `package.json`: `name`, `displayName`, and view IDs in `contributes.views` and `activationEvents`.
*   **`package.json` Refinements:**
    *   Improved `description`.
    *   Added `keywords` for better discoverability.
    *   Updated `engines.vscode` to `^1.85.0`.
    *   Removed the explicit `activationEvents` array as VS Code can infer these.
    *   Attempted to remove a persistent and problematic `dependencies: { "unreal-log-viewer": "file:" }` entry. This entry is likely causing the `vsce package` `EISDIR` error and is being re-added by an unknown automated process (suspected to be a lingering `watch` task or similar).
*   **Packaging Issues:**
    *   The `vsce package` command failed with an `EISDIR` error. This is strongly suspected to be caused by the self-referential `dependencies` entry.
    *   A `.vscodeignore` file was recommended to exclude `node_modules` and other non-essential files from the package.
*   **Runtime Issue Identified:** The log viewer webview closes when focus is switched away from it. This is likely due to the webview context not being retained. Setting `webview.options.retainContextWhenHidden = true;` in `resolveWebviewView` is the primary recommended fix.

## 7. Next Steps / Outstanding Issues

1.  **Resolve `package.json` "dependencies" Issue:** Identify and stop the process that automatically re-adds `unreal-log-viewer: "file:"` to `dependencies`. This is critical for successful packaging.
2.  **Implement `.vscodeignore`:** Create and populate `.vscodeignore` to ensure a clean and minimal `.vsix` package.
3.  **Fix Webview Closing Issue:** Implement `retainContextWhenHidden: true` for the webview to prevent it from closing when hidden.
4.  **Successful Packaging:** Once the above are resolved, `vsce package` should produce a valid `.vsix` file.
5.  **Testing:** Thoroughly test the packaged extension.
```# Unreal Log Viewer - Technical Documentation

## 1. Overview

The "Unreal Log Viewer" is a Visual Studio Code extension designed to receive, display, and filter log messages streamed from an Unreal Engine application over a TCP network connection. It provides a dedicated webview panel within VS Code for real-time log monitoring and analysis, aiding in the debugging and development process for Unreal Engine projects.

## 2. Core Architecture

The extension is primarily built around a few key components:

*   **`UnrealLogViewerProvider` (`src/unrealLogViewer.ts`):**
    *   Implements `vscode.WebviewViewProvider`.
    *   Manages the lifecycle and content of the webview panel where logs are displayed.
    *   Maintains an in-memory store of received log messages (`this.logs`).
    *   Handles incoming log data from the TCP server, processes it, and applies filters.
    *   Facilitates communication between the VS Code extension host and the webview (e.g., sending logs, filter updates, configuration changes).
    *   Persists filter settings (`levelFilter`, `categoryFilter`, `messageFilter`) using `context.workspaceState`.
    *   Provides methods for clearing logs, updating webview appearance (font, colors, gridlines), and managing log flow (pause/resume).

*   **Webview Panel (HTML/CSS/JavaScript):**
    *   Dynamically generated HTML content via the `_getInitialWebviewHtml` method in `UnrealLogViewerProvider`.
    *   Renders logs in a sortable, filterable table.
    *   Includes UI elements for filter inputs (level, category, message), clear button, pause button, and potentially other controls.
    *   Communicates with the extension host using `vscode.postMessage()` (from webview to extension) and `window.addEventListener('message', ...)` (from extension to webview).
    *   Handles user interactions within the webview (e.g., applying filters, sorting).
    *   The visual styling aims to integrate with VS Code themes.

*   **TCP Log Server (`createAndListenServer` in `src/unrealLogViewer.ts`):**
    *   A Node.js `net.Server` instance.
    *   Listens on a configurable TCP port (default: 9876) for incoming connections.
    *   Expects log data in JSON format, with each JSON object representing a single log entry and terminated by a newline.
    *   Parses incoming data, validates the JSON structure, and passes valid log objects to the `UnrealLogViewerProvider` for processing and display.
    *   Handles server errors and client disconnections.

*   **`UnrealLogTextDocumentContentProvider` (`src/unrealLogViewer.ts`):**
    *   Implements `vscode.TextDocumentContentProvider`.
    *   Provides the content for a virtual text document (scheme: `unreal-log-copilot`).
    *   Used by the "Show Logs as Text for Copilot" command to expose a configurable number of recent logs as plain text, making them accessible to tools like GitHub Copilot for context.

*   **Extension Activation (`activate` in `src/unrealLogViewer.ts`):**
    *   The main entry point for the extension.
    *   Registers the `UnrealLogViewerProvider` for the custom view (`unrealLogViewerView`).
    *   Registers all commands contributed by the extension.
    *   Initializes and starts the TCP log server based on the configured port.
    *   Sets up listeners for configuration changes to dynamically update the server port and webview appearance.

## 3. Key Features & Implementation Details

*   **Log Reception:**
    *   TCP server listens for newline-terminated JSON strings.
    *   Expected JSON structure: `{ "date": "ISO_string", "level": "string", "category": "string", "message": "string" }`.
    *   Robust parsing with error handling for malformed JSON.

*   **Log Storage & Management:**
    *   Logs are stored in an array (`this.logs`) within `UnrealLogViewerProvider`.
    *   A configurable maximum number of log messages (`unrealLogViewer.maxLogMessages`) is enforced. When exceeded, the oldest 10% of messages are pruned.

*   **Log Display:**
    *   Webview uses a dynamic HTML table.
    *   Timestamps can be displayed as absolute or relative (to last clear time), controlled by `unrealLogViewer.useRelativeTimestamps`.
    *   Customizable font size (`unrealLogViewer.logTableFontSize`) and font family (`unrealLogViewer.logTableFontFamily`).
    *   Optional log level color-coding (`unrealLogViewer.useLogLevelColors`) and grid lines (`unrealLogViewer.showGridLines`).

*   **Filtering:**
    *   **Level Filter:** Filters by log verbosity (e.g., "Error", "Warning", "Log"). Supports comma-separated values and exclusion (e.g., `!Verbose`).
    *   **Category Filter:** Filters by Unreal Engine log category (e.g., "LogBlueprint", "LogNet"). Supports comma-separated values, wildcards (`*`), and exclusion (`!`).
    *   **Message Filter:** Filters by content within the log message itself. Supports comma-separated values and exclusion (`!`). Case-insensitive.
    *   Filters are applied in `UnrealLogViewerProvider._passesFilters()` before logs are sent to the webview.
    *   Filter input values are persisted in workspace state.

*   **Commands (`package.json` -> `contributes.commands`):**
    *   `unrealLogViewer.create`: Ensures the log viewer panel is visible.
    *   `unrealLogViewer.clear`: Clears all logs from the view and resets relative timestamps.
    *   `unrealLogViewer.applyServerPortChange`: Restarts the TCP server with the port defined in settings.
    *   `unrealLogViewer.showLogsAsText`: Opens recent logs in a virtual text document.

*   **Configuration (`package.json` -> `contributes.configuration`):**
    *   `unrealLogViewer.serverPort`: TCP port for the log server.
    *   `unrealLogViewer.useRelativeTimestamps`: Toggle for relative/absolute timestamps.
    *   `unrealLogViewer.logTableFontSize`: Font size for log entries.
    *   `unrealLogViewer.logTableFontFamily`: Font family for log entries.
    *   `unrealLogViewer.useLogLevelColors`: Toggle for log level colorization.
    *   `unrealLogViewer.maxLogMessages`: Maximum logs to retain.
    *   `unrealLogViewer.showGridLines`: Toggle for table grid lines.
    *   `unrealLogViewer.copilotLogExportLimit`: Number of logs for the "Show Logs as Text" feature.

## 4. Manifest File (`package.json`)

*   **`name`**: `unreal-log-viewer` (unique identifier).
*   **`displayName`**: `Unreal Log-Viewer` (user-facing name).
*   **`version`**: `0.0.1` (current version).
*   **`publisher`**: `coregames` (Marketplace publisher ID).
*   **`repository`**: Specifies the Git repository URL.
*   **`engines.vscode`**: `^1.85.0` (minimum VS Code version compatibility).
*   **`main`**: `./out/unrealLogViewer.js` (entry point for the compiled extension).
*   **`categories`**: `["Other"]`.
*   **`keywords`**: Helps discoverability in the Marketplace.
*   **`contributes`**: Defines extension points:
    *   `commands`: User-invokable actions.
    *   `configuration`: User-configurable settings.
    *   `viewsContainers` & `views`: Defines the custom activity bar icon and the webview panel itself (`unrealLogViewerView`).
*   **`scripts`**:
    *   `vscode:prepublish`: `npm run compile` (runs before packaging).
    *   `compile`: `tsc -p ./` (compiles TypeScript).
    *   `watch`: `tsc -watch -p ./` (compiles TypeScript in watch mode).
    *   `lint`: `eslint` (runs the linter).
*   **`devDependencies`**: Lists development-time dependencies (e.g., `@types/vscode`, `typescript`, `eslint`).
*   **`dependencies`**: (Currently problematic with `unreal-log-viewer: "file:"` entry, ideally should be empty or list true runtime npm dependencies if any were used directly in the extension runtime and not bundled).

## 5. Build and Packaging

*   **Compilation:** TypeScript (`.ts` files in `src/`) is compiled to JavaScript (`.js` files in `out/`) using the `tsc` command, configured by `tsconfig.json`.
*   **Packaging:** The `vsce package` command is used to create a `.vsix` file (the installable extension package).
    *   This command typically runs the `vscode:prepublish` script.
    *   A `.vscodeignore` file is crucial to exclude unnecessary files (e.g., `node_modules`, `src`, build artifacts) from the `.vsix` package to keep its size minimal and prevent issues. The current attempt to package failed with an `EISDIR` error, likely due to the self-referencing `dependencies` entry and the inclusion of `node_modules`.

## 6. Recent Development Summary & State

*   **Renaming:** The extension was renamed from "Unreal Log-Viewer 2" to "Unreal Log-Viewer". This involved updating:
    *   `UnrealLogViewerProvider.viewType` from `unrealLogViewerView2` to `unrealLogViewerView`.
    *   References in `activate()` and command registration.
    *   `package.json`: `name`, `displayName`, and view IDs in `contributes.views` and `activationEvents`.
*   **`package.json` Refinements:**
    *   Improved `description`.
    *   Added `keywords` for better discoverability.
    *   Updated `engines.vscode` to `^1.85.0`.
    *   Removed the explicit `activationEvents` array as VS Code can infer these.
    *   Attempted to remove a persistent and problematic `dependencies: { "unreal-log-viewer": "file:" }` entry. This entry is likely causing the `vsce package` `EISDIR` error and is being re-added by an unknown automated process (suspected to be a lingering `watch` task or similar).
*   **Packaging Issues:**
    *   The `vsce package` command failed with an `EISDIR` error. This is strongly suspected to be caused by the self-referential `dependencies` entry.
    *   A `.vscodeignore` file was recommended to exclude `node_modules` and other non-essential files from the package.
*   **Runtime Issue Identified:** The log viewer webview closes when focus is switched away from it. This is likely due to the webview context not being retained. Setting `webview.options.retainContextWhenHidden = true;` in `resolveWebviewView` is the primary recommended fix.

## 7. Next Steps / Outstanding Issues

1.  **Resolve `package.json` "dependencies" Issue:** Identify and stop the process that automatically re-adds `unreal-log-viewer: "file:"` to `dependencies`. This is critical for successful packaging.
2.  **Implement `.vscodeignore`:** Create and populate `.vscodeignore` to ensure a clean and minimal `.vsix` package.
3.  **Fix Webview Closing Issue:** Implement `retainContextWhenHidden: true` for the webview to prevent it from closing when hidden.
4.  **Successful Packaging:** Once the above are resolved, `vsce package` should produce a valid `.vsix` file.
5.  **Testing:** Thoroughly test the packaged extension.