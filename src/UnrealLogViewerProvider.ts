import * as vscode from 'vscode';
import * as fs from 'fs';
import { UnrealLogEntry } from './logTypes';

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

    /**
     * Optional callback to be invoked when logs are cleared (for Copilot/text view refresh).
     */
    public onLogsCleared?: () => void;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.levelFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.LEVEL_FILTER_KEY, '');
        this.categoryFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, '');
        this.messageFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, '');
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
            message => {
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
            },
            undefined,
            this.context.subscriptions
        );
        this._updateCountsInWebview();
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

    private _formatDate(originalDateString: string): string {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        const useRelative = config.get<boolean>('useRelativeTimestamps', false);
        const logDate = new Date(originalDateString);

        if (useRelative) {
            let diffMs = logDate.getTime() - this.lastClearTime.getTime();
            diffMs = Math.max(0, diffMs);

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
        let passesLevelFilter = true;
        const currentLevelFilter = this.levelFilter.trim();

        if (currentLevelFilter) {
            const logLev = (typeof log.level === 'string' ? log.level.trim() : '').toUpperCase();
            const filterTerms = currentLevelFilter.split(',').map(term => term.trim()).filter(term => term !== '');

            const exclusiveLevels = filterTerms
                .filter(term => term.startsWith('!'))
                .map(term => term.substring(1).toUpperCase())
                .filter(term => term !== '');

            const inclusiveLevels = filterTerms
                .filter(term => !term.startsWith('!'))
                .map(term => term.toUpperCase())
                .filter(term => term !== '');

            if (exclusiveLevels.length > 0) {
                for (const excLevel of exclusiveLevels) {
                    if (logLev === excLevel) {
                        passesLevelFilter = false;
                        break;
                    }
                }
            }

            if (passesLevelFilter && inclusiveLevels.length > 0) {
                let matchesInclusive = false;
                for (const incLevel of inclusiveLevels) {
                    if (incLevel.startsWith('>')) {
                        const targetLevelName = incLevel.substring(1);
                        const targetLevelIndex = UnrealLogViewerProvider.LOG_LEVEL_ORDER.indexOf(targetLevelName);
                        const logLevelIndex = UnrealLogViewerProvider.LOG_LEVEL_ORDER.indexOf(logLev);
                        if (targetLevelIndex !== -1 && logLevelIndex !== -1 && logLevelIndex >= targetLevelIndex) {
                            matchesInclusive = true;
                            break;
                        }
                    } else {
                        if (logLev === incLevel) {
                            matchesInclusive = true;
                            break;
                        }
                    }
                }
                passesLevelFilter = matchesInclusive;
            } else if (passesLevelFilter && inclusiveLevels.length === 0 && exclusiveLevels.length > 0) {
                passesLevelFilter = true;
            } else if (inclusiveLevels.length === 0 && exclusiveLevels.length === 0) {
                passesLevelFilter = true;
            }
        }

        let passesCategoryFilter = true;
        const currentCategoryFilter = this.categoryFilter.trim();
        if (currentCategoryFilter) {
            const logCategoryUpper = log.category.toUpperCase();
            const filterTerms = currentCategoryFilter.split(',').map(term => term.trim()).filter(term => term !== '');

            const exclusiveCategories = filterTerms
                .filter(term => term.startsWith('!'))
                .map(term => term.substring(1).toUpperCase())
                .filter(term => term !== '');

            const inclusiveCategories = filterTerms
                .filter(term => !term.startsWith('!'))
                .map(term => term.toUpperCase())
                .filter(term => term !== '');

            if (exclusiveCategories.length > 0) {
                for (const excCat of exclusiveCategories) {
                    if (logCategoryUpper.includes(excCat)) {
                        passesCategoryFilter = false;
                        break;
                    }
                }
            }

            if (passesCategoryFilter && inclusiveCategories.length > 0) {
                let matchesInclusive = false;
                for (const incCat of inclusiveCategories) {
                    if (logCategoryUpper.includes(incCat)) {
                        matchesInclusive = true;
                        break;
                    }
                }
                passesCategoryFilter = matchesInclusive;
            }
        }

        let passesMessageFilter = true;
        const currentMessageFilter = this.messageFilter.trim();
        if (currentMessageFilter) {
            const logMessageUpper = log.message.toUpperCase();
            const filterTerms = currentMessageFilter.split(',').map(term => term.trim()).filter(term => term !== '');

            const exclusiveMessages = filterTerms
                .filter(term => term.startsWith('!'))
                .map(term => term.substring(1).toUpperCase())
                .filter(term => term !== '');

            const inclusiveMessages = filterTerms
                .filter(term => !term.startsWith('!'))
                .map(term => term.toUpperCase())
                .filter(term => term !== '');

            if (exclusiveMessages.length > 0) {
                for (const excMsg of exclusiveMessages) {
                    if (logMessageUpper.includes(excMsg)) {
                        passesMessageFilter = false;
                        break;
                    }
                }
            }

            if (passesMessageFilter && inclusiveMessages.length > 0) {
                let matchesInclusive = false;
                for (const incMsg of inclusiveMessages) {
                    if (logMessageUpper.includes(incMsg)) {
                        matchesInclusive = true;
                        break;
                    }
                }
                passesMessageFilter = matchesInclusive;
            }
        }

        return passesLevelFilter && passesCategoryFilter && passesMessageFilter;
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

        // Only update the webview if not paused
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
            // If paused, still update the counter
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
        this._lastShownCountWhenPaused = 0; // Reset shown count cache when clearing
        if (this._view) {
            this._view.webview.postMessage({ command: 'setLogs', logs: [] });
            this._updateCountsInWebview();
        }
        // Call the callback for Copilot/text view refresh if set
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
            // Cache the shown count BEFORE updating the view
            this._lastShownCountWhenPaused = this.logs.filter(log => this._passesFilters(log)).length;
        } else {
            this._lastShownCountWhenPaused = undefined;
        }
        if (this._view) {
            this._view.webview.postMessage({ command: 'updatePauseButton', isPaused: this.isPaused });
        }
        if (!this.isPaused) {
            this._sendFilteredLogsToWebview();
        } else if (this._view) {
            // When pausing, update the counter immediately to avoid off-by-one
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
