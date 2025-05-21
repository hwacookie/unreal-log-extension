import * as vscode from 'vscode';
import { UnrealLogViewerProvider } from './UnrealLogViewerProvider';

/**
 * URI for the virtual document that displays the current logs as plain text.
 */
export const LOG_TEXT_URI = vscode.Uri.parse('unreal-log-text:current-logs.log');

/**
 * Provides content for a virtual text document that displays Unreal Engine logs.
 *
 * This class implements `vscode.TextDocumentContentProvider` to serve the content
 * of the `LOG_TEXT_URI`. It retrieves logs from an `UnrealLogViewerProvider` instance,
 * applies current filters, limits the number of logs based on the 'copilotLogExportLimit' setting,
 * and formats them as plain text.
 *
 * It also provides a mechanism to refresh the content of the virtual document via the `onDidChange` event.
 */
export class UnrealLogTextDocumentContentProvider implements vscode.TextDocumentContentProvider {
    /** The scheme used for the virtual document URI (e.g., "unreal-log-text"). */
    static readonly scheme = 'unreal-log-text';
    private _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    /** Event that fires when the content of the virtual document should be refreshed. */
    readonly onDidChange = this._onDidChangeEmitter.event;

    /**
     * Creates an instance of UnrealLogTextDocumentContentProvider.
     * @param unrealLogViewerProvider An optional initial instance of UnrealLogViewerProvider to source logs from.
     */
    constructor(private unrealLogViewerProvider: UnrealLogViewerProvider | undefined) {}

    /**
     * Updates the UnrealLogViewerProvider instance used to fetch logs.
     * This is useful if the provider instance is created or changed after this content provider is instantiated.
     * @param provider The new UnrealLogViewerProvider instance.
     */
    public updateProviderInstance(provider: UnrealLogViewerProvider) {
        this.unrealLogViewerProvider = provider;
    }

    /**
     * Provides the text content for the virtual log document.
     * Retrieves logs from the `unrealLogViewerProvider`, filters them, limits them according to
     * the `copilotLogExportLimit` setting, and formats them as plain text.
     * @param uri The URI of the document to provide content for. Expected to be `LOG_TEXT_URI`.
     * @returns A string containing the formatted log messages, or an empty string if conditions are not met.
     */
    provideTextDocumentContent(uri: vscode.Uri): string {
        if (uri.toString() === LOG_TEXT_URI.toString() && this.unrealLogViewerProvider) {
            const rawLogs = this.unrealLogViewerProvider.getRawLogs();
            const filteredLogs = rawLogs.filter(log => this.unrealLogViewerProvider!.passesFilters(log));

            const config = vscode.workspace.getConfiguration('unrealLogViewer');
            const copilotLogLimit = config.get<number>('copilotLogExportLimit', 1000);

            const startIndex = Math.max(0, filteredLogs.length - copilotLogLimit);
            const logsToExport = filteredLogs.slice(startIndex);

            return logsToExport.map(log => `${log.date} [${log.level}] [${log.category}] ${log.message}`).join('\n');
        }
        return '';
    }

    /**
     * Triggers a refresh of the virtual log document by firing the `onDidChange` event.
     */
    refresh() {
        this._onDidChangeEmitter.fire(LOG_TEXT_URI);
    }
}
