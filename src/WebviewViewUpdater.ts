import * as vscode from 'vscode';

/**
 * Represents a log entry formatted for display in the webview.
 */
export interface WebviewLog {
    date: string; // Formatted date string
    level: string;
    category: string;
    message: string;
    source?: string;
}

export class WebviewViewUpdater {
    private _webview?: vscode.Webview;

    public setWebview(webview: vscode.Webview): void {
        this._webview = webview;
    }

    public updateFilterInputs(levelFilter: string | undefined, categoryFilter: string | undefined, messageFilter: string | undefined): void {
        if (!this._webview) { return; }
        this._webview.postMessage({
            command: 'updateFilterInputs',
            levelFilter: levelFilter,
            categoryFilter: categoryFilter,
            messageFilter: messageFilter
        });
    }

    public updatePauseButton(isPaused: boolean): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'updatePauseButton', isPaused });
    }

    public removeOldestLogs(count: number): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'removeOldestLogs', count });
    }

    public addLogEntry(logEntry: WebviewLog): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'addLogEntry', logEntry });
    }

    public setLogs(logs: WebviewLog[]): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'setLogs', logs });
    }

    public updateLogCounts(shown: number, total: number): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'updateCounts', shown, total });
    }
}
