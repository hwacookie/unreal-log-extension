import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';
import { passesLogFilters } from './logFilter';

export interface Filters {
    levelFilter: string;
    categoryFilter: string;
    messageFilter: string;
}

export class FilterManager {
    public static readonly LOG_LEVEL_ORDER = ["VERYVERBOSE", "VERBOSE", "LOG", "DISPLAY", "WARNING", "ERROR", "FATAL"];
    private static readonly LEVEL_FILTER_KEY = 'levelFilter';
    private static readonly CATEGORY_FILTER_KEY = 'categoryFilter';
    private static readonly MESSAGE_FILTER_KEY = 'messageFilter';

    private levelFilter: string;
    private categoryFilter: string;
    private messageFilter: string;

    public onFilterChange?: () => void;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.levelFilter = this.context.workspaceState.get<string>(FilterManager.LEVEL_FILTER_KEY, '');
        this.categoryFilter = this.context.workspaceState.get<string>(FilterManager.CATEGORY_FILTER_KEY, '');
        this.messageFilter = this.context.workspaceState.get<string>(FilterManager.MESSAGE_FILTER_KEY, '');
    }

    public getFilters(): Filters {
        return {
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter,
        };
    }

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

    public passesFilters(log: UnrealLogEntry): boolean {
        return passesLogFilters(log, {
            levelFilter: this.levelFilter,
            categoryFilter: this.categoryFilter,
            messageFilter: this.messageFilter,
            logLevelOrder: FilterManager.LOG_LEVEL_ORDER
        });
    }
}
