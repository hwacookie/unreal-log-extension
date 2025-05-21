import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';
import { LogStore, PruneInfo } from './LogStore';
import { FilterManager, Filters as LogFilters } from './FilterManager'; // Renamed imported Filters to LogFilters for usage
import { PauseManager, FormattedDisplayLogEntry } from './PauseManager';
import { WebviewMessageHandler, WebviewMessage, WebviewActions } from './WebviewMessageHandler';
import { DateFormatter } from './DateFormatter';
import { WebviewAppearanceManager } from './WebviewAppearanceManager';
import { WebviewViewUpdater, WebviewLog } from './WebviewViewUpdater';

export class UnrealLogViewerProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'unrealLogViewerView3';
    private logStore: LogStore;
    private filterManager: FilterManager;
    private pauseManager: PauseManager;
    private webviewMessageHandler: WebviewMessageHandler;
    private dateFormatter: DateFormatter;
    private webviewAppearanceManager: WebviewAppearanceManager;
    private webviewViewUpdater: WebviewViewUpdater;
    private lastClearTime: Date = new Date();
    private _webviewView: vscode.WebviewView | undefined;

    /**
     * Optional callback to be invoked when logs are cleared (for Copilot/text view refresh).
     */
    public onLogsCleared?: () => void = () => { };

    /**
     * Optional callback to be invoked when filters change (for Copilot/text view refresh).
     */
    public onFiltersChanged?: () => void = () => { };

    public readonly onLogCountsChanged = new vscode.EventEmitter<{ displayed: number; total: number }>();

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

    public get paused(): boolean {
        return this.pauseManager.isPaused;
    }

    public getRawLogs(): UnrealLogEntry[] {
        return this.logStore.getLogs();
    }

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

    public requestLogRefresh(): void {
        this._sendFilteredLogsToWebview();
    }

    public updateWebviewFontSize(fontSize: string): void {
        this.webviewAppearanceManager.updateFontSize(fontSize);
    }

    public updateWebviewColorMode(useColors: boolean): void {
        this.webviewAppearanceManager.updateColorMode(useColors);
    }

    public updateWebviewGridLinesVisibility(showGridLines: boolean): void {
        this.webviewAppearanceManager.updateGridLinesVisibility(showGridLines);
    }

    public updateWebviewFontFamily(fontFamily: string): void {
        this.webviewAppearanceManager.updateFontFamily(fontFamily);
    }

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

    public togglePauseStateForTest(): void {
        this.togglePauseState();
    }

    public getPauseStateForTest(): boolean {
        return this.paused;
    }

    public passesFilters(log: UnrealLogEntry): boolean {
        return this.filterManager.passesFilters(log);
    }

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

    private handleWebviewClear(): void {
        this.clearLogs();
    }

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

    public getTotalLogCount(): number {
        return this.logStore.getLogCount();
    }

    public getDisplayedLogCount(): number {
        return this.logStore.getLogs().filter(log => this.filterManager.passesFilters(log)).length;
    }

    public toggleFilterBarVisibility(): void {
        if (this._webviewView) {
            this._webviewView.webview.postMessage({ command: 'toggleFilterBar' });
        }
    }
}
