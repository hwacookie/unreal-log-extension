import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';
import { passesLogFilters } from './logFilter';

/**
 * Represents the filter criteria for log entries.
 */
export interface Filters {
    levelFilter: string;
    categoryFilter: string;
    messageFilter: string;
}

/**
 * Manages log filtering logic and state for the Unreal Log Viewer.
 *
 * This class is responsible for:
 * - Storing the current filter values (level, category, message) in VS Code's workspace state for persistence.
 * - Providing methods to update these filter values.
 * - Offering a way to clear all active filters.
 * - Determining if a given log entry passes the current filter criteria.
 * - Notifying subscribers (via `onFilterChange`) when filter values are modified.
 *
 * The log level filtering uses a predefined order (`LOG_LEVEL_ORDER`) to allow filtering
 * by a minimum log level (e.g., showing "Warning" and above).
 */
export class FilterManager {
    /**
     * Defines the hierarchical order of log levels.
     * Used to determine if a log entry passes a minimum level filter.
     */
    public static readonly LOG_LEVEL_ORDER = ["VERYVERBOSE", "VERBOSE", "LOG", "DISPLAY", "WARNING", "ERROR", "FATAL"];
    private static readonly LEVEL_FILTER_KEY = 'levelFilter';
    private static readonly CATEGORY_FILTER_KEY = 'categoryFilter';
    private static readonly MESSAGE_FILTER_KEY = 'messageFilter';

    private levelFilter: string;
    private categoryFilter: string;
    private messageFilter: string;

    /**
     * Callback function that is triggered when filter values change.
     */
    public onFilterChange?: () => void;

    /**
     * Creates an instance of FilterManager.
     * Initializes filter values from the workspace state or defaults to empty strings.
     * @param context The VS Code extension context, used for accessing workspace state.
     */
    constructor(private readonly context: vscode.ExtensionContext) {
        this.levelFilter = this.context.workspaceState.get<string>(FilterManager.LEVEL_FILTER_KEY, '');
        this.categoryFilter = this.context.workspaceState.get<string>(FilterManager.CATEGORY_FILTER_KEY, '');
        this.messageFilter = this.context.workspaceState.get<string>(FilterManager.MESSAGE_FILTER_KEY, '');
    }

    /**
     * Retrieves the current filter values.
     * @returns An object containing the current level, category, and message filters.
     */
    public getFilters(): Filters {
        return {
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter,
        };
    }

    /**
     * Updates the filter values with the provided new filters.
     * Only updates filters that are present in the `newFilters` object.
     * Triggers the `onFilterChange` callback if any filter value actually changes.
     * @param newFilters An object containing partial or complete new filter values.
     */
    public updateFilters(newFilters: Partial<Filters>): void {
        let changed = false;
        if (newFilters.levelFilter !== undefined && this.levelFilter !== newFilters.levelFilter.trim()) {
            this.levelFilter = newFilters.levelFilter.trim();
            this.context.workspaceState.update(FilterManager.LEVEL_FILTER_KEY, this.levelFilter);
            changed = true;
        }
        if (newFilters.categoryFilter !== undefined && this.categoryFilter !== newFilters.categoryFilter.trim()) {
            this.categoryFilter = newFilters.categoryFilter.trim();
            this.context.workspaceState.update(FilterManager.CATEGORY_FILTER_KEY, this.categoryFilter);
            changed = true;
        }
        if (newFilters.messageFilter !== undefined && this.messageFilter !== newFilters.messageFilter.trim()) {
            this.messageFilter = newFilters.messageFilter.trim();
            this.context.workspaceState.update(FilterManager.MESSAGE_FILTER_KEY, this.messageFilter);
            changed = true;
        }
        if (changed && this.onFilterChange) {
            this.onFilterChange();
        }
    }

    /**
     * Clears all filter values, resetting them to empty strings.
     * Updates the workspace state and triggers the `onFilterChange` callback if filters were changed.
     */
    public clearFilters(): void {
        let changed = false;
        if (this.levelFilter !== '' || this.categoryFilter !== '' || this.messageFilter !== '') {
            changed = true;
        }
        this.levelFilter = '';
        this.categoryFilter = '';
        this.messageFilter = '';
        this.context.workspaceState.update(FilterManager.LEVEL_FILTER_KEY, undefined);
        this.context.workspaceState.update(FilterManager.CATEGORY_FILTER_KEY, undefined);
        this.context.workspaceState.update(FilterManager.MESSAGE_FILTER_KEY, undefined);
        if (changed && this.onFilterChange) {
            this.onFilterChange();
        }
    }

    /**
     * Checks if a given log entry passes the current filter criteria.
     * @param log The log entry to check.
     * @returns True if the log entry passes all active filters, false otherwise.
     */
    public passesFilters(log: UnrealLogEntry): boolean {
        return passesLogFilters(log, {
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter,
            logLevelOrder: FilterManager.LOG_LEVEL_ORDER
        });
    }
}
