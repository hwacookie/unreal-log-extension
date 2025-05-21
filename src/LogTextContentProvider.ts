import * as vscode from 'vscode';
import { UnrealLogViewerProvider } from './UnrealLogViewerProvider';

export const LOG_TEXT_URI = vscode.Uri.parse('unreal-log-text:current-logs.log');

export class UnrealLogTextDocumentContentProvider implements vscode.TextDocumentContentProvider {
    static readonly scheme = 'unreal-log-text';
    private _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChangeEmitter.event;

    constructor(private unrealLogViewerProvider: UnrealLogViewerProvider | undefined) {}

    public updateProviderInstance(provider: UnrealLogViewerProvider) {
        this.unrealLogViewerProvider = provider;
    }

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

    refresh() {
        this._onDidChangeEmitter.fire(LOG_TEXT_URI);
    }
}
