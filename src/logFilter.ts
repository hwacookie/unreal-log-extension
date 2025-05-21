import { UnrealLogEntry } from './logTypes';

export interface LogFilterOptions {
    levelFilter: string;
    categoryFilter: string;
    messageFilter: string;
    logLevelOrder?: string[];
}

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
