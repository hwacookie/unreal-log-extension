/**
 * @module UnrealLogViewerProvider
 * This module defines the `UnrealLogViewerProvider` class, which is responsible for managing the state
 * and behavior of the Unreal Log Viewer webview. It implements `vscode.WebviewViewProvider`.
 */
import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';
import { LogStore, PruneInfo } from './LogStore';
import { FilterManager, Filters as LogFilters } from './FilterManager'; // Renamed imported Filters to LogFilters for usage
import { PauseManager, FormattedDisplayLogEntry } from './PauseManager';
import { WebviewMessageHandler, WebviewMessage, WebviewActions } from './WebviewMessageHandler';
import { DateFormatter } from './DateFormatter';
import { WebviewAppearanceManager } from './WebviewAppearanceManager';
import { WebviewViewUpdater, WebviewLog } from './WebviewViewUpdater';
import { WebviewElement } from '../test/ui/testUtils'; // Added import

/**
 * Provides the Unreal Log Viewer webview, managing its content, state, and interactions.
 * This class handles log storage, filtering, pausing, date formatting, appearance updates,
 * and communication with the webview content.
 */
export class UnrealLogViewerProvider implements vscode.WebviewViewProvider {
    /**
     * The unique type of this webview view.
     */
    public static readonly viewType = 'unrealLogViewerView3';
    /** Manages the storage of log entries. */
    private logStore: LogStore;
    /** Manages log filtering logic and state. */
    private filterManager: FilterManager;
    /** Manages the pause state of the log view. */
    private pauseManager: PauseManager;
    /** Handles messages received from the webview. */
    private webviewMessageHandler: WebviewMessageHandler;
    /** Formats dates and timestamps for display. */
    private dateFormatter: DateFormatter;
    /** Manages the visual appearance of the webview (fonts, colors, etc.). */
    private webviewAppearanceManager: WebviewAppearanceManager;
    /** Updates the webview's content (logs, counts, button states). */
    private webviewViewUpdater: WebviewViewUpdater;
    /** Timestamp of the last time logs were cleared. */
    private lastClearTime: Date = new Date();
    /** The underlying VS Code webview view instance. */
    private _webviewView: vscode.WebviewView | undefined;

    /**
     * Optional callback to be invoked when logs are cleared (for Copilot/text view refresh).
     */
    public onLogsCleared?: () => void = () => { };

    /**
     * Optional callback to be invoked when filters change (for Copilot/text view refresh).
     */
    public onFiltersChanged?: () => void = () => { };

    /**
     * Event emitter for when the displayed or total log counts change.
     */
    public readonly onLogCountsChanged = new vscode.EventEmitter<{ displayed: number; total: number }>();

    /**
     * Constructs an instance of `UnrealLogViewerProvider`.
     * @param context The extension context provided by VS Code.
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        this.logStore = new LogStore();
        this.filterManager = new FilterManager(this.context); // Corrected: Pass context to FilterManager constructor
        this.filterManager.onFilterChange = () => { // Wire up the FilterManager's change event
            this.onFiltersChanged?.();
            this._sendFilteredLogsToWebview(); // Also ensure webview updates on filter change
            this._updateCountsInWebview();
        };
        this.pauseManager = new PauseManager();
        this.webviewAppearanceManager = new WebviewAppearanceManager(this.context);
        this.webviewViewUpdater = new WebviewViewUpdater();

        const initialConfig = vscode.workspace.getConfiguration('unrealLogViewer');
        const initialUseRelative = initialConfig.get<boolean>('useRelativeTimestamps', false);
        const initialTimestampFormat = initialConfig.get<string>('timestampFormat', 'HH:mm:ss.SSS');
        this.dateFormatter = new DateFormatter(initialUseRelative, initialTimestampFormat, this.lastClearTime);
        console.log(`UNREAL LOG VIEWER Provider: Initial DateFormatter - useRelative: ${initialUseRelative}, format: ${initialTimestampFormat}`);

        const webviewActions: WebviewActions = {
            sendFilteredLogs: () => this._sendFilteredLogsToWebview(),
            handleWebviewClear: () => this.handleWebviewClear(),
            togglePauseState: () => this.togglePauseState()
        };
        this.webviewMessageHandler = new WebviewMessageHandler(this.filterManager, webviewActions);
    }

    /**
     * Loads configuration settings related to date and timestamp formatting.
     * @private
     */
    private _loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        const useRelative = config.get<boolean>('useRelativeTimestamps', false);
        const format = config.get<string>('timestampFormat', 'HH:mm:ss.SSS');
        this.dateFormatter.updateFormattingOptions(useRelative, format);
        console.log(`UNREAL LOG VIEWER Provider: Loaded config via _loadConfiguration - useRelative: ${useRelative}, format: ${format}`);
    }

    /**
     * Handles configuration changes relevant to the provider.
     * @param affectedSettingKey The key of the configuration setting that changed.
     */
    public handleConfigurationChange(affectedSettingKey: string): void {
        console.log(`UNREAL LOG VIEWER Provider: handleConfigurationChange called for ${affectedSettingKey}`);
        const config = vscode.workspace.getConfiguration('unrealLogViewer');

        if (affectedSettingKey === 'unrealLogViewer.useRelativeTimestamps' || affectedSettingKey === 'unrealLogViewer.timestampFormat') {
            this._loadConfiguration(); // This updates dateFormatter
            if (!this.pauseManager.isPaused) {
                this.requestLogRefresh(); // Refresh logs if timestamp format changed
            }
        } else if (affectedSettingKey === 'unrealLogViewer.logTableFontSize') {
            const newFontSize = config.get<string>('logTableFontSize', 'var(--vscode-font-size)');
            this.webviewAppearanceManager.updateFontSize(newFontSize);
        } else if (affectedSettingKey === 'unrealLogViewer.useLogLevelColors') {
            const useColors = config.get<boolean>('useLogLevelColors', true);
            this.webviewAppearanceManager.updateColorMode(useColors);
        } else if (affectedSettingKey === 'unrealLogViewer.showGridLines') {
            const showGridLines = config.get<boolean>('showGridLines', false);
            this.webviewAppearanceManager.updateGridLinesVisibility(showGridLines);
        } else if (affectedSettingKey === 'unrealLogViewer.logTableFontFamily') {
            const newFontFamily = config.get<string>('logTableFontFamily', 'var(--vscode-font-family)');
            this.webviewAppearanceManager.updateFontFamily(newFontFamily);
        }
    }

    /**
     * Gets the current pause state of the log viewer.
     * @returns `true` if paused, `false` otherwise.
     */
    public get paused(): boolean {
        return this.pauseManager.isPaused;
    }

    /**
     * Retrieves all raw (unformatted, unfiltered) log entries currently stored.
     * @returns An array of `UnrealLogEntry` objects.
     */
    public getRawLogs(): UnrealLogEntry[] {
        return this.logStore.getLogs();
    }

    /**
     * Resolves and initializes the webview view.
     * This method is called by VS Code when the view needs to be displayed.
     * @param view The `vscode.WebviewView` to be resolved.
     * @param _context The `vscode.WebviewViewResolveContext` for the view.
     * @param _token A `vscode.CancellationToken` for the resolution.
     */
    public resolveWebviewView(
        view: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        console.log('UNREAL LOG VIEWER: resolveWebviewView called for', UnrealLogViewerProvider.viewType);
        this._webviewView = view;
        this.webviewAppearanceManager.setWebview(view.webview);
        this.webviewViewUpdater.setWebview(view.webview);

        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };

        view.webview.html = this.webviewAppearanceManager.getInitialWebviewHtml();

        const currentFilters = this.filterManager.getFilters();
        this.webviewViewUpdater.updateFilterInputs(currentFilters.levelFilter, currentFilters.categoryFilter, currentFilters.messageFilter);

        this.webviewAppearanceManager.applyInitialSettings();

        this.webviewViewUpdater.updatePauseButton(this.pauseManager.isPaused);

        view.webview.onDidReceiveMessage(
            (message: WebviewMessage) => this.webviewMessageHandler.handleMessage(message),
            undefined,
            this.context.subscriptions
        );
        this._updateCountsInWebview();
        this._updateWebviewView();
    }

    /**
     * Requests a refresh of the log entries displayed in the webview.
     * This typically involves re-filtering and re-formatting the logs.
     */
    public requestLogRefresh(): void {
        this._sendFilteredLogsToWebview();
    }

    /**
     * Updates the font size used in the webview's log table.
     * @param fontSize The new font size string (e.g., '12px', 'var(--vscode-font-size)').
     */
    public updateWebviewFontSize(fontSize: string): void {
        this.webviewAppearanceManager.updateFontSize(fontSize);
    }

    /**
     * Toggles the use of log level-specific colors in the webview.
     * @param useColors `true` to use colors, `false` for monochrome.
     */
    public updateWebviewColorMode(useColors: boolean): void {
        this.webviewAppearanceManager.updateColorMode(useColors);
    }

    /**
     * Toggles the visibility of grid lines in the webview's log table.
     * @param showGridLines `true` to show grid lines, `false` to hide them.
     */
    public updateWebviewGridLinesVisibility(showGridLines: boolean): void {
        this.webviewAppearanceManager.updateGridLinesVisibility(showGridLines);
    }

    /**
     * Updates the font family used in the webview's log table.
     * @param fontFamily The new font family string (e.g., 'Consolas', 'var(--vscode-font-family)').
     */
    public updateWebviewFontFamily(fontFamily: string): void {
        this.webviewAppearanceManager.updateFontFamily(fontFamily);
    }

    /**
     * Retrieves the log entries currently displayed in the webview, formatted for display.
     * This is primarily used for testing purposes.
     * @returns An array of `FormattedDisplayLogEntry` objects.
     */
    public getDisplayedLogEntriesForTest(): FormattedDisplayLogEntry[] {
        if (this.pauseManager.isPaused) {
            return this.pauseManager.getDisplayedLogs();
        }
        return this.logStore.getLogs()
            .filter(log => this.filterManager.passesFilters(log))
            .map(log => ({
                date: this.dateFormatter.formatDate(log.date),
                level: log.level,
                category: log.category,
                message: log.message,
                source: log.source || undefined
            }));
    }

    /**
     * Sets the log filters for testing purposes.
     * @param filters A partial `LogFilters` object containing the filters to apply.
     */
    public setFiltersForTest(filters: Partial<LogFilters>): void { // Used LogFilters alias
        this.filterManager.updateFilters({
            levelFilter: filters.levelFilter, // Corrected: was filters.level
            categoryFilter: filters.categoryFilter, // Corrected: was filters.category
            messageFilter: filters.messageFilter // Corrected: was filters.message
        });

        const currentFilters = this.filterManager.getFilters();
        this.webviewViewUpdater.updateFilterInputs(currentFilters.levelFilter, currentFilters.categoryFilter, currentFilters.messageFilter);
        this._updateWebviewView();
        if (this.onFiltersChanged) {
            this.onFiltersChanged();
        }
    }

    /**
     * Toggles the pause state of the log viewer for testing purposes.
     */
    public togglePauseStateForTest(): void {
        this.togglePauseState();
    }

    /**
     * Gets the current pause state for testing purposes.
     * @returns `true` if paused, `false` otherwise.
     */
    public getPauseStateForTest(): boolean {
        return this.paused;
    }

    /**
     * Checks if a given log entry passes the current filter criteria.
     * @param log The `UnrealLogEntry` to check.
     * @returns `true` if the log passes filters, `false` otherwise.
     */
    public passesFilters(log: UnrealLogEntry): boolean {
        return this.filterManager.passesFilters(log);
    }

    /**
     * Adds a new log entry to the viewer.
     * The log is processed, potentially pruned if limits are exceeded, and displayed if it passes filters and the view is not paused.
     * @param log The `UnrealLogEntry` to add.
     */
    public addLog(log: UnrealLogEntry) {
        const pruneInfo: PruneInfo = this.logStore.addLog(log);

        if (!this.pauseManager.isPaused) {
            if (pruneInfo.pruned) {
                const pruneLogEntry: UnrealLogEntry = {
                    date: new Date().toISOString(),
                    level: 'WARNING',
                    category: 'LogViewerInternal',
                    message: `Pruned ${pruneInfo.prunedCount} oldest log message(s) to maintain max limit of ${pruneInfo.maxLogs}.`
                };
                this.logStore.addLog(pruneLogEntry);
                this.webviewViewUpdater.removeOldestLogs(pruneInfo.prunedCount);
                if (this.filterManager.passesFilters(pruneLogEntry)) {
                    const formattedPruneLog: WebviewLog = {
                        ...pruneLogEntry,
                        source: pruneLogEntry.source || undefined,
                        date: this.dateFormatter.formatDate(pruneLogEntry.date)
                    };
                    this.webviewViewUpdater.addLogEntry(formattedPruneLog);
                }
            }
            // Send the new log entry to the webview if it passes filters
            if (this.filterManager.passesFilters(log)) {
                const formattedLog: WebviewLog = {
                    ...log,
                    source: log.source || undefined,
                    date: this.dateFormatter.formatDate(log.date)
                };
                this.webviewViewUpdater.addLogEntry(formattedLog);
            }
            this._updateCountsInWebview();
        } else {
            this._updateCountsInWebview();
        }
    }

    /**
     * Clears all logs from the store and webview, resets filters, and updates related UI elements.
     */
    public clearLogs() {
        this.logStore.clearLogs();
        this.filterManager.clearFilters();
        this.lastClearTime = new Date();
        this.dateFormatter.updateLastClearTime(this.lastClearTime);
        this.pauseManager.resetForWebviewClear();
        this.webviewViewUpdater.setLogs([]);
        const currentFilters = this.filterManager.getFilters();
        this.webviewViewUpdater.updateFilterInputs(currentFilters.levelFilter, currentFilters.categoryFilter, currentFilters.messageFilter);
        this._updateCountsInWebview();
        this._updateWebviewView();

        if (this.onLogsCleared) {
            this.onLogsCleared();
        }
    }

    /**
     * Handles a request from the webview to clear logs.
     * @private
     */
    private handleWebviewClear(): void {
        this.clearLogs();
    }

    /**
     * Sends the currently filtered and formatted logs to the webview for display.
     * @private
     */
    private _sendFilteredLogsToWebview() {
        const filteredAndFormattedLogs: WebviewLog[] = this.logStore.getLogs()
            .filter(log => this.filterManager.passesFilters(log))
            .map(log => ({
                ...log,
                source: log.source || undefined,
                date: this.dateFormatter.formatDate(log.date)
            }));
        this.webviewViewUpdater.setLogs(filteredAndFormattedLogs);
        this._updateCountsInWebview();
    }

    /**
     * Toggles the pause state of the log viewer.
     * When unpausing, it refreshes the displayed logs.
     */
    public togglePauseState(): void {
        const wasPaused = this.pauseManager.isPaused;
        this.pauseManager.toggleState(() => {
            return this.logStore.getLogs()
                .filter(log => this.filterManager.passesFilters(log))
                .map(log => ({
                    date: this.dateFormatter.formatDate(log.date),
                    level: log.level,
                    category: log.category,
                    message: log.message,
                    source: log.source || undefined
                }));
        });

        this.webviewViewUpdater.updatePauseButton(this.pauseManager.isPaused);

        if (wasPaused && !this.pauseManager.isPaused) {
            this._sendFilteredLogsToWebview();
        } else {
            this._updateCountsInWebview();
        }
    }

    /**
     * Updates the log counts (displayed and total) in the webview and fires the `onLogCountsChanged` event.
     * @private
     */
    private _updateCountsInWebview() {
        const total = this.logStore.getLogCount();
        let shown: number;
        if (this.pauseManager.isPaused) {
            shown = this.pauseManager.getLastShownCount() ?? this.logStore.getLogs().filter(log => this.filterManager.passesFilters(log)).length;
        } else {
            shown = this.logStore.getLogs().filter(log => this.filterManager.passesFilters(log)).length;
        }
        this.webviewViewUpdater.updateLogCounts(shown, total);
        this.onLogCountsChanged.fire({ displayed: shown, total: total });
    }

    /**
     * Sends a message to the webview to update its entire log display, including logs, total count, and pause state.
     * This is a more comprehensive update than `_sendFilteredLogsToWebview`.
     * @private
     */
    private _updateWebviewView(): void {
        if (!this._webviewView) {
            return;
        }
        const allLogs = this.logStore.getLogs();
        const filteredLogs = allLogs.filter(log => this.filterManager.passesFilters(log));

        this._webviewView.webview.postMessage({
            type: 'updateLogs',
            logs: filteredLogs,
            totalLogs: allLogs.length,
            isPaused: this.pauseManager.isPaused
        });
    }

    /**
     * Gets the total number of raw log entries stored.
     * @returns The total log count.
     */
    public getTotalLogCount(): number {
        return this.logStore.getLogCount();
    }

    /**
     * Gets the number of log entries currently displayed (i.e., passing filters).
     * @returns The displayed log count.
     */
    public getDisplayedLogCount(): number {
        return this.logStore.getLogs().filter(log => this.filterManager.passesFilters(log)).length;
    }

    /**
     * Toggles the visibility of the filter bar in the webview.
     */
    public toggleFilterBarVisibility(): void {
        if (this._webviewView) {
            this._webviewView.webview.postMessage({ command: 'toggleFilterBar' });
        }
    }

    /**
     * Retrieves elements from the webview matching a given CSS selector.
     * This method is asynchronous and used for testing purposes.
     * @param selector The CSS selector to query elements.
     * @returns A promise that resolves to an array of `WebviewElement` objects, or rejects if the webview is unavailable or a timeout occurs.
     */
    public async getWebviewElementsBySelector(selector: string): Promise<WebviewElement[]> { // Return type as WebviewElement[]
        if (!this._webviewView) {
            return Promise.reject("Webview is not available.");
        }
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this._webviewView.webview.postMessage({ command: 'getElements', selector: selector, requestId: requestId });

        return new Promise((resolve, reject) => {
            const disposable = this._webviewView!.webview.onDidReceiveMessage(message => {
                if (message.command === 'response:getElements' && message.requestId === requestId) {
                    disposable.dispose();
                    resolve(message.elements);
                }
            });
            // Timeout to prevent tests from hanging indefinitely
            setTimeout(() => {
                disposable.dispose();
                reject(new Error(`Timeout waiting for response from webview for getElements with selector: ${selector}`));
            }, 5000); // 5-second timeout
        });
    }

    /**
     * Simulates a click on an element within the webview, identified by its ID.
     * This method is asynchronous and used for testing purposes.
     * @param elementId The ID of the element to click.
     * @returns A promise that resolves to `true` if the click was acknowledged, `false` otherwise, or rejects if the webview is unavailable or a timeout occurs.
     */
    public async clickWebviewElement(elementId: string): Promise<boolean> {
        if (!this._webviewView) {
            return Promise.reject("Webview is not available.");
        }
        const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this._webviewView.webview.postMessage({ command: 'clickElement', elementId: elementId, requestId: requestId });

        return new Promise((resolve, reject) => {
            const disposable = this._webviewView!.webview.onDidReceiveMessage(message => {
                if (message.command === 'response:clickElement' && message.requestId === requestId) {
                    disposable.dispose();
                    resolve(message.success);
                }
            });
            // Timeout
            setTimeout(() => {
                disposable.dispose();
                reject(new Error(`Timeout waiting for response from webview for clickElement with ID: ${elementId}`));
            }, 5000); // 5-second timeout
        });
    }
}
