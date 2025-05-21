import * as assert from 'assert';
import { passesLogFilters } from '../src/logFilter';
import { UnrealLogEntry } from '../src/logTypes';

describe('Log Filter', () => {
    const log: UnrealLogEntry = {
        date: '2025-05-20T12:00:00.000Z',
        level: 'WARNING',
        category: 'LogTemp',
        message: 'Something happened',
    };

    it('should pass with empty filters', () => {
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: '',
        }), true);
    });

    it('should filter by level', () => {
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: 'WARNING',
            categoryFilter: '',
            messageFilter: '',
        }), true);
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: 'ERROR',
            categoryFilter: '',
            messageFilter: '',
        }), false);
    });

    it('should filter by category', () => {
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: 'LogTemp',
            messageFilter: '',
        }), true);
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: 'LogOther',
            messageFilter: '',
        }), false);
    });

    it('should filter by message', () => {
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: 'Something',
        }), true);
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: 'Nothing',
        }), false);
    });

    it('should support exclusion filters', () => {
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '!WARNING',
            categoryFilter: '',
            messageFilter: '',
        }), false);
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: '!LogTemp',
            messageFilter: '',
        }), false);
        assert.strictEqual(passesLogFilters(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: '!Something',
        }), false);
    });
});
