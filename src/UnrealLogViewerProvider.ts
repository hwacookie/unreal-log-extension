import * as vscode from 'vscode';
import * as fs from 'fs';
import { UnrealLogEntry } from './logTypes';
import { passesLogFilters } from './logFilter';

export class UnrealLogViewerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'unrealLogViewerView3';
    private static readonly LOG_LEVEL_ORDER = ["VERYVERBOSE", "VERBOSE", "LOG", "DISPLAY", "WARNING", "ERROR", "FATAL"];
    private static readonly LEVEL_FILTER_KEY = 'levelFilter';
    private static readonly CATEGORY_FILTER_KEY = 'categoryFilter';
    private static readonly MESSAGE_FILTER_KEY = 'messageFilter';
    private _view?: vscode.WebviewView;
    private logs: UnrealLogEntry[] = [];
    private levelFilter: string;
    private categoryFilter: string;
    private messageFilter: string;
    private lastClearTime: Date = new Date();
    private isPaused = false;
    private _lastShownCountWhenPaused?: number;
    private displayedLogsOnPause: Pick<UnrealLogEntry, 'date' | 'level' | 'category' | 'message' | 'source'>[] = [];

    // Cached configuration values
    private _useRelativeTimestamps: boolean;
    private _timestampFormat: string; // Although not fully used by _formatDate for absolute, it's good practice to cache it

    /**
     * Optional callback to be invoked when logs are cleared (for Copilot/text view refresh).
     */
    public onLogsCleared?: () => void;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.levelFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.LEVEL_FILTER_KEY, '');
        this.categoryFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, '');
        this.messageFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, '');
        
        // Initialize with defaults, then load actual config
        this._useRelativeTimestamps = false; 
        this._timestampFormat = 'HH:mm:ss.SSS';
        this._loadConfiguration();
    }

    private _loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        this._useRelativeTimestamps = config.get<boolean>('useRelativeTimestamps', false);
        this._timestampFormat = config.get<string>('timestampFormat', 'HH:mm:ss.SSS');
        console.log(`UNREAL LOG VIEWER Provider: Loaded config - useRelative: ${this._useRelativeTimestamps}, format: ${this._timestampFormat}`);
    }

    /**
     * Handles configuration changes relevant to the provider.
     * @param affectedSettingKey The key of the configuration setting that changed.
     */
    public handleConfigurationChange(affectedSettingKey: string): void {
        console.log(`UNREAL LOG VIEWER Provider: handleConfigurationChange called for ${affectedSettingKey}`);
        this._loadConfiguration(); // Reload all relevant configurations

        // Check if the changed setting requires a log refresh
        if (affectedSettingKey === 'unrealLogViewer.useRelativeTimestamps' || affectedSettingKey === 'unrealLogViewer.timestampFormat') {
            if (!this.isPaused) { // Only refresh if not paused, otherwise changes apply on resume
                this.requestLogRefresh();
            }
        }
        // Other settings might directly update webview without full log refresh (e.g., font size, handled in unrealLogViewer.ts)
    }

    public get paused(): boolean {
        return this.isPaused;
    }

    public getRawLogs(): UnrealLogEntry[] {
        return this.logs;
    }

    public resolveWebviewView(
        view: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        console.log('UNREAL LOG VIEWER: resolveWebviewView called for', UnrealLogViewerProvider.viewType);
        this._view = view;
        view.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
        };

        view.webview.html = this._getInitialWebviewHtml(view.webview);

        view.webview.postMessage({
            command: 'updateFilterInputs',
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter
        });

        const initialFontSize = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontSize', 'var(--vscode-font-size)');
        view.webview.postMessage({ command: 'updateFontSize', fontSize: initialFontSize });

        const initialUseColors = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('useLogLevelColors', true);
        view.webview.postMessage({ command: 'updateColorMode', useColors: initialUseColors });

        const initialShowGridLines = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('showGridLines', false);
        view.webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines: initialShowGridLines });

        const initialFontFamily = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontFamily', 'var(--vscode-font-family)');
        view.webview.postMessage({ command: 'updateFontFamily', fontFamily: initialFontFamily });

        view.webview.postMessage({ command: 'updatePauseButton', isPaused: this.isPaused });

        view.webview.onDidReceiveMessage(
            message => this._handleWebviewMessage(message),
            undefined,
            this.context.subscriptions
        );
        this._updateCountsInWebview();
    }

    private _handleWebviewMessage(message: {
        command: 'applyFilters';
        levelFilter?: string;
        categoryFilter?: string;
        messageFilter?: string;
    } | {
        command: 'getInitialLogs';
    } | {
        command: 'webviewClearButtonPressed';
    } | {
        command: 'copilotViewRequested';
    } | {
        command: 'togglePause';
    }) {
        switch (message.command) {
            case 'applyFilters':
                this.levelFilter = message.levelFilter?.trim() || '';
                this.categoryFilter = message.categoryFilter?.trim() || '';
                this.messageFilter = message.messageFilter?.trim() || '';
                this.context.workspaceState.update(UnrealLogViewerProvider.LEVEL_FILTER_KEY, this.levelFilter);
                this.context.workspaceState.update(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, this.categoryFilter);
                this.context.workspaceState.update(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, this.messageFilter);
                this._sendFilteredLogsToWebview();
                return;
            case 'getInitialLogs':
                this._sendFilteredLogsToWebview();
                return;
            case 'webviewClearButtonPressed':
                this.handleWebviewClear();
                return;
            case 'copilotViewRequested':
                vscode.commands.executeCommand('unrealLogViewer.showLogsAsText');
                return;
            case 'togglePause':
                this.togglePauseState();
                return;
        }
    }

    public requestLogRefresh(): void {
        this._sendFilteredLogsToWebview();
    }

    public updateWebviewFontSize(fontSize: string): void {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateFontSize', fontSize });
        }
    }

    public updateWebviewColorMode(useColors: boolean): void {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateColorMode', useColors });
        }
    }

    public updateWebviewGridLinesVisibility(showGridLines: boolean): void {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines });
        }
    }

    public updateWebviewFontFamily(fontFamily: string): void {
        if (this._view) {
            this._view.webview.postMessage({ command: 'updateFontFamily', fontFamily });
        }
    }

    /**
     * Retrieves the currently filtered and formatted log entries, primarily for testing purposes.
     * This method mimics the data that would be sent to the webview.
     * @returns An array of log entries as they would be displayed (after filtering and formatting).
     */
    public getDisplayedLogEntriesForTest(): Pick<UnrealLogEntry, 'date' | 'level' | 'category' | 'message' | 'source'>[] {
        if (this.isPaused) {
            return this.displayedLogsOnPause;
        }
        return this.logs
            .filter(log => this._passesFilters(log))
            .map(log => ({
                date: this._formatDate(log.date),
                level: log.level,
                category: log.category,
                message: log.message,
                source: log.source || undefined
            }));
    }

    /**
     * Sets the filters programmatically for testing.
     * @param filters An object containing level, category, and/or message filters.
     */
    public setFiltersForTest(filters: { level?: string; category?: string; message?: string }): void {
        this.levelFilter = filters.level?.trim() ?? this.levelFilter;
        this.categoryFilter = filters.category?.trim() ?? this.categoryFilter;
        this.messageFilter = filters.message?.trim() ?? this.messageFilter;

        this.context.workspaceState.update(UnrealLogViewerProvider.LEVEL_FILTER_KEY, this.levelFilter);
        this.context.workspaceState.update(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, this.categoryFilter);
        this.context.workspaceState.update(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, this.messageFilter);

        if (this._view) {
            this._view.webview.postMessage({
                command: 'updateFilterInputs',
                levelFilter: this.levelFilter,
                categoryFilter: this.categoryFilter,
                messageFilter: this.messageFilter
            });
        }
        this._sendFilteredLogsToWebview();
    }

    /**
     * Toggles the pause state programmatically for testing.
     */
    public togglePauseStateForTest(): void {
        this.togglePauseState();
    }

    /**
     * Gets the current pause state for testing.
     * @returns True if paused, false otherwise.
     */
    public getPauseStateForTest(): boolean {
        return this.isPaused;
    }

    private _formatDate(originalDateString: string): string {
        // Remove trailing 'Z' if it exists to handle UTC ISO strings more flexibly
        const dateStringToParse = originalDateString.endsWith('Z') 
            ? originalDateString.slice(0, -1) 
            : originalDateString;

        const logDate = new Date(dateStringToParse);

        if (this._useRelativeTimestamps) { // Use cached property
            let diffMs = logDate.getTime() - this.lastClearTime.getTime();
            diffMs = Math.max(0, diffMs); // Ensure no negative diffs if system time changed or logs are from the future

            const milliseconds = (diffMs % 1000).toString().padStart(3, '0');
            const totalSeconds = Math.floor(diffMs / 1000);
            const seconds = (totalSeconds % 60).toString().padStart(2, '0');
            const totalMinutes = Math.floor(totalSeconds / 60);
            const minutes = (totalMinutes % 60).toString().padStart(2, '0');
            const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');

            return `+${hours}:${minutes}:${seconds}.${milliseconds}`;
        } else {
            const h = logDate.getHours().toString().padStart(2, '0');
            const m = logDate.getMinutes().toString().padStart(2, '0');
            const s = logDate.getSeconds().toString().padStart(2, '0');
            const ms = logDate.getMilliseconds().toString().padStart(3, '0');
            return `${h}:${m}:${s}.${ms}`;
        }
    }

    public _passesFilters(log: UnrealLogEntry): boolean {
        return passesLogFilters(log, {
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter,
            logLevelOrder: UnrealLogViewerProvider.LOG_LEVEL_ORDER
        });
    }

    public addLog(log: UnrealLogEntry) {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        const maxLogsSetting = config.get<number>('maxLogMessages', 10000);
        const minAllowedLogs = 100;
        const effectiveMaxLogs = Math.max(maxLogsSetting, minAllowedLogs);

        let pruned = false;
        let prunedCount = 0;

        if (this.logs.length + 1 > effectiveMaxLogs) {
            const numToPrune = Math.max(1, Math.floor(effectiveMaxLogs * 0.1));
            const actualPruned = this.logs.splice(0, numToPrune);
            prunedCount = actualPruned.length;
            pruned = prunedCount > 0;
        }

        this.logs.push(log);

        if (!this.isPaused && this._view) {
            if (pruned) {
                const pruneLogEntry: UnrealLogEntry = {
                    date: new Date().toISOString(),
                    level: 'WARNING',
                    category: 'LogViewerInternal',
                    message: `Pruned ${prunedCount} oldest log message(s) to maintain max limit of ${effectiveMaxLogs}.`
                };
                this.logs.push(pruneLogEntry);
                this._view.webview.postMessage({ command: 'removeOldestLogs', count: prunedCount });
                if (this._passesFilters(pruneLogEntry)) {
                    this._view.webview.postMessage({
                        command: 'addLogEntry',
                        logEntry: { ...pruneLogEntry, source: pruneLogEntry.source || undefined, date: this._formatDate(pruneLogEntry.date) }
                    });
                }
            }
            if (this._passesFilters(log)) {
                this._view.webview.postMessage({
                    command: 'addLogEntry',
                    logEntry: { ...log, source: log.source || undefined, date: this._formatDate(log.date) }
                });
            }
            this._updateCountsInWebview();
        } else if (this._view) {
            this._updateCountsInWebview();
        }
    }

    public clearLogs() {
        this.logs = [];
        this.levelFilter = '';
        this.categoryFilter = '';
        this.messageFilter = '';
        this.lastClearTime = new Date();
        this.context.workspaceState.update(UnrealLogViewerProvider.LEVEL_FILTER_KEY, undefined);
        this.context.workspaceState.update(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, undefined);
        this.context.workspaceState.update(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, undefined);
        if (this._view) {
            this._view.webview.postMessage({ command: 'setLogs', logs: [] });
            this._view.webview.postMessage({ command: 'updateFilterInputs', levelFilter: '', categoryFilter: '', messageFilter: '' });
            this._updateCountsInWebview();
        }
    }

    private handleWebviewClear(): void {
        this.logs = [];
        this.lastClearTime = new Date();
        this._lastShownCountWhenPaused = 0;
        if (this._view) {
            this._view.webview.postMessage({ command: 'setLogs', logs: [] });
            this._updateCountsInWebview();
        }
        if (this.onLogsCleared) {
            this.onLogsCleared();
        }
    }

    private _sendFilteredLogsToWebview() {
        if (!this._view) { return; }
        const filteredAndFormattedLogs = this.logs
            .filter(log => this._passesFilters(log))
            .map(log => ({
                ...log,
                source: log.source || undefined,
                date: this._formatDate(log.date)
            }));
        this._view.webview.postMessage({ command: 'setLogs', logs: filteredAndFormattedLogs });
        this._updateCountsInWebview();
    }

    private togglePauseState(): void {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
            this.displayedLogsOnPause = this.logs
                .filter(log => this._passesFilters(log))
                .map(log => ({
                    date: this._formatDate(log.date),
                    level: log.level,
                    category: log.category,
                    message: log.message,
                    source: log.source || undefined
                }));
            this._lastShownCountWhenPaused = this.displayedLogsOnPause.length;
        } else {
            this.displayedLogsOnPause = [];
            this._lastShownCountWhenPaused = undefined;
        }
        if (this._view) {
            this._view.webview.postMessage({ command: 'updatePauseButton', isPaused: this.isPaused });
        }
        if (!this.isPaused) {
            this._sendFilteredLogsToWebview();
        } else if (this._view) {
            this._updateCountsInWebview();
        }
    }

    private _updateCountsInWebview() {
        if (!this._view) { return; }
        const total = this.logs.length;
        let shown: number;
        if (this.isPaused) {
            if (this._lastShownCountWhenPaused === undefined) {
                this._lastShownCountWhenPaused = this.logs.filter(log => this._passesFilters(log)).length;
            }
            shown = this._lastShownCountWhenPaused;
        } else {
            shown = this.logs.filter(log => this._passesFilters(log)).length;
            this._lastShownCountWhenPaused = undefined;
        }
        this._view.webview.postMessage({ command: 'updateCounts', shown, total });
    }

    private _getInitialWebviewHtml(_webview: vscode.Webview): string {
        const webviewHtmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webviewContent.html');
        const htmlContent = fs.readFileSync(webviewHtmlPath.fsPath, 'utf8');
        return htmlContent;
    }
}
