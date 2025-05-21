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

/**
 * Manages updates to the webview view.
 * This class is responsible for posting messages to the webview to trigger UI changes,
 * such as adding log entries, updating filter inputs, or changing the pause state.
 */
export class WebviewViewUpdater {
    private _webview?: vscode.Webview;

    /**
     * Sets the webview instance to be used for posting messages.
     * @param webview The vscode.Webview instance.
     */
    public setWebview(webview: vscode.Webview): void {
        this._webview = webview;
    }

    /**
     * Sends a message to the webview to update the displayed filter input values.
     * @param levelFilter The current level filter string.
     * @param categoryFilter The current category filter string.
     * @param messageFilter The current message content filter string.
     */
    public updateFilterInputs(levelFilter: string | undefined, categoryFilter: string | undefined, messageFilter: string | undefined): void {
        if (!this._webview) { return; }
        this._webview.postMessage({
            command: 'updateFilterInputs',
            levelFilter: levelFilter,
            categoryFilter: categoryFilter,
            messageFilter: messageFilter
        });
    }

    /**
     * Sends a message to the webview to update the visual state of the pause button.
     * @param isPaused True if the log view is currently paused, false otherwise.
     */
    public updatePauseButton(isPaused: boolean): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'updatePauseButton', isPaused });
    }

    /**
     * Sends a message to the webview to remove a specified number of oldest log entries.
     * @param count The number of log entries to remove from the top of the display.
     */
    public removeOldestLogs(count: number): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'removeOldestLogs', count });
    }

    /**
     * Sends a message to the webview to add a new log entry to the display.
     * @param logEntry The WebviewLog object to add.
     */
    public addLogEntry(logEntry: WebviewLog): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'addLogEntry', logEntry });
    }

    /**
     * Sends a message to the webview to replace all currently displayed logs with a new set.
     * @param logs An array of WebviewLog objects to display.
     */
    public setLogs(logs: WebviewLog[]): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'setLogs', logs });
    }

    /**
     * Sends a message to the webview to update the displayed log counts (shown/total).
     * @param shown The number of log entries currently shown (after filtering).
     * @param total The total number of log entries stored.
     */
    public updateLogCounts(shown: number, total: number): void {
        if (!this._webview) { return; }
        this._webview.postMessage({ command: 'updateCounts', shown, total });
    }
}
