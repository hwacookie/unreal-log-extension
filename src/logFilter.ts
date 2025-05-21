/**
 * @module logFilter
 * This module provides functionality for filtering Unreal Engine log entries based on various criteria.
 * It includes an interface for filter options and a function to check if a log entry passes the filters.
 */
import { UnrealLogEntry } from './logTypes';

/**
 * Defines the options for filtering log entries.
 */
export interface LogFilterOptions {
    /** The log level to filter by (e.g., "Error", "Warning,Error", ">Log", "!Verbose"). */
    levelFilter: string;
    /** The category string to filter by (e.g., "MyCategory", "!OtherCategory"). Supports comma-separated values and exclusion with '!'. */
    categoryFilter: string;
    /** The message content to filter by. Supports comma-separated values and exclusion with '!'. */
    messageFilter: string;
    /** Optional array defining the hierarchical order of log levels. Defaults to a standard Unreal Engine order. */
    logLevelOrder?: string[];
}

/**
 * Checks if a given log entry passes the specified filter criteria.
 *
 * This function evaluates the log entry against level, category, and message filters.
 * - Level filtering supports exact matches, comma-separated lists, minimum levels (e.g., ">Warning"),
 *   and exclusions (e.g., "!Verbose").
 * - Category and Message filtering support case-insensitive substring matches, comma-separated lists
 *   for OR conditions, and exclusion prefixes ('!') for AND NOT conditions.
 *
 * @param log The `UnrealLogEntry` to check.
 * @param options The `LogFilterOptions` containing the filter criteria.
 * @returns `true` if the log entry passes all active filters, `false` otherwise.
 */
export function passesLogFilters(
    log: UnrealLogEntry,
    options: LogFilterOptions
): boolean {
    const LOG_LEVEL_ORDER = options.logLevelOrder || [
        'VERYVERBOSE', 'VERBOSE', 'LOG', 'DISPLAY', 'WARNING', 'ERROR', 'FATAL'
    ];
    let passesLevelFilter = true;
    const currentLevelFilter = options.levelFilter.trim();
    if (currentLevelFilter) {
        const logLev = (typeof log.level === 'string' ? log.level.trim() : '').toUpperCase();
        const filterTerms = currentLevelFilter.split(',').map(term => term.trim()).filter(term => term !== '');
        const exclusiveLevels = filterTerms.filter(term => term.startsWith('!')).map(term => term.substring(1).toUpperCase()).filter(term => term !== '');
        const inclusiveLevels = filterTerms.filter(term => !term.startsWith('!')).map(term => term.toUpperCase()).filter(term => term !== '');
        if (exclusiveLevels.length > 0) {
            for (const excLevel of exclusiveLevels) {
                if (logLev === excLevel) {
                    passesLevelFilter = false;
                    break;
                }
            }
        }
        if (passesLevelFilter && inclusiveLevels.length > 0) {
            let matchesInclusive = false;
            for (const incLevel of inclusiveLevels) {
                if (incLevel.startsWith('>')) {
                    const targetLevelName = incLevel.substring(1);
                    const targetLevelIndex = LOG_LEVEL_ORDER.indexOf(targetLevelName);
                    const logLevelIndex = LOG_LEVEL_ORDER.indexOf(logLev);
                    if (targetLevelIndex !== -1 && logLevelIndex !== -1 && logLevelIndex >= targetLevelIndex) {
                        matchesInclusive = true;
                        break;
                    }
                } else {
                    if (logLev === incLevel) {
                        matchesInclusive = true;
                        break;
                    }
                }
            }
            passesLevelFilter = matchesInclusive;
        } else if (passesLevelFilter && inclusiveLevels.length === 0 && exclusiveLevels.length > 0) {
            passesLevelFilter = true;
        } else if (inclusiveLevels.length === 0 && exclusiveLevels.length === 0) {
            passesLevelFilter = true;
        }
    }
    let passesCategoryFilter = true;
    const currentCategoryFilter = options.categoryFilter.trim();
    if (currentCategoryFilter) {
        const logCategoryUpper = log.category.toUpperCase();
        const filterTerms = currentCategoryFilter.split(',').map(term => term.trim()).filter(term => term !== '');
        const exclusiveCategories = filterTerms.filter(term => term.startsWith('!')).map(term => term.substring(1).toUpperCase()).filter(term => term !== '');
        const inclusiveCategories = filterTerms.filter(term => !term.startsWith('!')).map(term => term.toUpperCase()).filter(term => term !== '');
        if (exclusiveCategories.length > 0) {
            for (const excCat of exclusiveCategories) {
                if (logCategoryUpper.includes(excCat)) {
                    passesCategoryFilter = false;
                    break;
                }
            }
        }
        if (passesCategoryFilter && inclusiveCategories.length > 0) {
            let matchesInclusive = false;
            for (const incCat of inclusiveCategories) {
                if (logCategoryUpper.includes(incCat)) {
                    matchesInclusive = true;
                    break;
                }
            }
            passesCategoryFilter = matchesInclusive;
        }
    }
    let passesMessageFilter = true;
    const currentMessageFilter = options.messageFilter.trim();
    if (currentMessageFilter) {
        const logMessageUpper = log.message.toUpperCase();
        const filterTerms = currentMessageFilter.split(',').map(term => term.trim()).filter(term => term !== '');
        const exclusiveMessages = filterTerms.filter(term => term.startsWith('!')).map(term => term.substring(1).toUpperCase()).filter(term => term !== '');
        const inclusiveMessages = filterTerms.filter(term => !term.startsWith('!')).map(term => term.toUpperCase()).filter(term => term !== '');
        if (exclusiveMessages.length > 0) {
            for (const excMsg of exclusiveMessages) {
                if (logMessageUpper.includes(excMsg)) {
                    passesMessageFilter = false;
                    break;
                }
            }
        }
        if (passesMessageFilter && inclusiveMessages.length > 0) {
            let matchesInclusive = false;
            for (const incMsg of inclusiveMessages) {
                if (logMessageUpper.includes(incMsg)) {
                    matchesInclusive = true;
                    break;
                }
            }
            passesMessageFilter = matchesInclusive;
        }
    }
    return passesLevelFilter && passesCategoryFilter && passesMessageFilter;
}
