import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';

/**
 * Information about a pruning operation performed on the log store.
 */
export interface PruneInfo {
    /** Indicates whether any logs were pruned. */
    pruned: boolean;
    /** The number of logs that were pruned. */
    prunedCount: number;
    /** The maximum number of logs allowed in the store at the time of pruning. */
    maxLogs: number;
}

/**
 * Manages the storage of Unreal Engine log entries.
 *
 * This class is responsible for:
 * - Storing log entries in an in-memory array.
 * - Enforcing a maximum number of log messages, pruning the oldest entries when the limit is exceeded.
 * - Reading the maximum log message count from VS Code configuration and updating it on change.
 * - Providing methods to add logs, retrieve all logs, get the current log count, and clear all logs.
 */
export class LogStore {
    private logs: UnrealLogEntry[] = [];
    private maxLogMessages: number;

    /**
     * Creates an instance of LogStore.
     * Initializes `maxLogMessages` from configuration and sets up a listener for configuration changes.
     */
    constructor() {
        this.maxLogMessages = this._getMaxLogMessagesFromConfig();
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('unrealLogViewer.maxLogMessages')) {
                this.maxLogMessages = this._getMaxLogMessagesFromConfig();
                // Future enhancement: Could potentially trigger a prune here if the new max is smaller
            }
        });
    }

    /**
     * Retrieves the maximum number of log messages from the extension's configuration.
     * Ensures the value is at least `minAllowedLogs` (currently 100).
     * @returns The configured maximum number of log messages.
     */
    private _getMaxLogMessagesFromConfig(): number {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        const maxLogsSetting = config.get<number>('maxLogMessages', 10000);
        const minAllowedLogs = 100;
        return Math.max(maxLogsSetting, minAllowedLogs);
    }

    /**
     * Retrieves a copy of all stored log entries.
     * @returns A new array containing all log entries.
     */
    public getLogs(): UnrealLogEntry[] {
        return [...this.logs]; // Return a copy
    }

    /**
     * Gets the current number of log entries stored.
     * @returns The total count of stored logs.
     */
    public getLogCount(): number {
        return this.logs.length;
    }

    /**
     * Adds a new log entry to the store.
     * If adding the new log exceeds `maxLogMessages`, it prunes the oldest entries
     * (approximately 10% of `maxLogMessages`) before adding the new one.
     * @param log The UnrealLogEntry to add.
     * @returns A PruneInfo object detailing if pruning occurred and how many logs were removed.
     */
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

    /**
     * Clears all log entries from the store.
     */
    public clearLogs(): void {
        this.logs = [];
    }
}
