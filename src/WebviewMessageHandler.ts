/**
 * @module WebviewMessageHandler
 * This module defines the `WebviewMessageHandler` class, which is responsible for processing
 * messages received from the webview UI (e.g., filter changes, button clicks) and invoking
 * corresponding actions in the extension. It also defines the types for messages and actions.
 */
import * as vscode from 'vscode';
import { FilterManager } from './FilterManager';

/**
 * Defines the actions that the WebviewMessageHandler can invoke
 * on its parent (typically the UnrealLogViewerProvider).
 */
export interface WebviewActions {
    /** Sends the current set of filtered logs to the webview. */
    sendFilteredLogs: () => void;
    /** Handles the clear action initiated from the webview. */
    handleWebviewClear: () => void;
    /** Toggles the pause state of the log viewer. */
    togglePauseState: () => void;
}

/**
 * Represents the different types of messages that can be received from the webview.
 */
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

/**
 * Handles messages received from the webview UI.
 *
 * This class acts as an intermediary between the webview and the main extension logic (e.g., UnrealLogViewerProvider).
 * It processes commands sent from the webview, such as applying filters, requesting logs, or toggling pause state,
 * and invokes the appropriate actions defined in the `WebviewActions` interface.
 */
export class WebviewMessageHandler {
    /**
     * Creates an instance of WebviewMessageHandler.
     * @param filterManager An instance of FilterManager to handle filter updates.
     * @param actions An object implementing WebviewActions to perform actions based on webview messages.
     */
    constructor(
        private filterManager: FilterManager,
        private actions: WebviewActions
    ) {}

    /**
     * Handles an incoming message from the webview.
     * @param message The message object sent from the webview.
     */
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
