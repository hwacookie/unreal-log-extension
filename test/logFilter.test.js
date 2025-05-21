"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const logFilter_1 = require("../src/logFilter");
describe('Log Filter', () => {
    const log = {
        date: '2025-05-20T12:00:00.000Z',
        level: 'WARNING',
        category: 'LogTemp',
        message: 'Something happened',
    };
    it('should pass with empty filters', () => {
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: '',
        }), true);
    });
    it('should filter by level', () => {
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: 'WARNING',
            categoryFilter: '',
            messageFilter: '',
        }), true);
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: 'ERROR',
            categoryFilter: '',
            messageFilter: '',
        }), false);
    });
    it('should filter by category', () => {
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: 'LogTemp',
            messageFilter: '',
        }), true);
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: 'LogOther',
            messageFilter: '',
        }), false);
    });
    it('should filter by message', () => {
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: 'Something',
        }), true);
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: 'Nothing',
        }), false);
    });
    it('should support exclusion filters', () => {
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '!WARNING',
            categoryFilter: '',
            messageFilter: '',
        }), false);
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: '!LogTemp',
            messageFilter: '',
        }), false);
        assert.strictEqual((0, logFilter_1.passesLogFilters)(log, {
            levelFilter: '',
            categoryFilter: '',
            messageFilter: '!Something',
        }), false);
    });
});
//# sourceMappingURL=logFilter.test.js.map