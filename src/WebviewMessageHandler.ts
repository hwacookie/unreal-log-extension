import * as vscode from 'vscode';
import { FilterManager } from './FilterManager';

export interface WebviewActions {
    sendFilteredLogs: () => void;
    handleWebviewClear: () => void;
    togglePauseState: () => void;
    // For applyFilters, the WebviewMessageHandler will call filterManager.updateFilters directly
    // and then call sendFilteredLogs.
}

export type WebviewMessage = {
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
};

export class WebviewMessageHandler {
    constructor(
        private filterManager: FilterManager,
        private actions: WebviewActions
    ) {}

    public handleMessage(message: WebviewMessage): void {
        switch (message.command) {
            case 'applyFilters':
                this.filterManager.updateFilters({
                    levelFilter: message.levelFilter,
                    categoryFilter: message.categoryFilter,
                    messageFilter: message.messageFilter
                });
                this.actions.sendFilteredLogs();
                return;
            case 'getInitialLogs':
                this.actions.sendFilteredLogs();
                return;
            case 'webviewClearButtonPressed':
                this.actions.handleWebviewClear();
                return;
            case 'copilotViewRequested':
                vscode.commands.executeCommand('unrealLogViewer.showLogsAsText');
                return;
            case 'togglePause':
                this.actions.togglePauseState();
                return;
        }
    }
}
