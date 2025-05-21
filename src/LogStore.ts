import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';

export interface PruneInfo {
    pruned: boolean;
    prunedCount: number;
    maxLogs: number;
}

export class LogStore {
    private logs: UnrealLogEntry[] = [];
    private maxLogMessages: number;

    constructor() {
        this.maxLogMessages = this._getMaxLogMessagesFromConfig();
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('unrealLogViewer.maxLogMessages')) {
                this.maxLogMessages = this._getMaxLogMessagesFromConfig();
                // Future enhancement: Could potentially trigger a prune here if the new max is smaller
            }
        });
    }

    private _getMaxLogMessagesFromConfig(): number {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        const maxLogsSetting = config.get<number>('maxLogMessages', 10000);
        const minAllowedLogs = 100;
        return Math.max(maxLogsSetting, minAllowedLogs);
    }

    public getLogs(): UnrealLogEntry[] {
        return [...this.logs]; // Return a copy
    }

    public getLogCount(): number {
        return this.logs.length;
    }

    public addLog(log: UnrealLogEntry): PruneInfo {
        let pruned = false;
        let prunedCount = 0;

        if (this.logs.length + 1 > this.maxLogMessages) {
            const numToPrune = Math.max(1, Math.floor(this.maxLogMessages * 0.1));
            const actualPruned = this.logs.splice(0, numToPrune);
            prunedCount = actualPruned.length;
            pruned = prunedCount > 0;
        }

        this.logs.push(log);

        return {
            pruned,
            prunedCount,
            maxLogs: this.maxLogMessages
        };
    }

    public clearLogs(): void {
        this.logs = [];
    }
}
