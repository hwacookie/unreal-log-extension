import * as vscode from 'vscode';
import * as assert from 'assert';
import { activateExtension, clearLogs, getDisplayedLogMessages, sendTcpLogMessage, focusUnrealLogView, delay, TestLogEntry, LOG_PROCESSING_DELAY_MS, COMMAND_EXECUTION_DELAY_MS, SETUP_COMPLETION_DELAY_MS } from './logReceiving.test';

const TEST_PORT = 9876;

describe('UI Filtering and Pause Tests', () => { // Changed from suite to describe
    let originalUseRelativeTimestamps: boolean | undefined;
    let originalTimestampFormat: string | undefined;

    before(async () => { // Changed from suiteSetup to before
        await activateExtension();
        await focusUnrealLogView();
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        originalUseRelativeTimestamps = config.get('useRelativeTimestamps');
        originalTimestampFormat = config.get('timestampFormat');
        await config.update('useRelativeTimestamps', false, vscode.ConfigurationTarget.Global);
        await config.update('timestampFormat', 'HH:mm:ss.SSS', vscode.ConfigurationTarget.Global);
        await delay(SETUP_COMPLETION_DELAY_MS);
    });

    after(async () => { // Changed from suiteTeardown to after
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        await config.update('useRelativeTimestamps', originalUseRelativeTimestamps, vscode.ConfigurationTarget.Global);
        await config.update('timestampFormat', originalTimestampFormat, vscode.ConfigurationTarget.Global);
        await delay(COMMAND_EXECUTION_DELAY_MS);
    });

    beforeEach(async () => {
        await focusUnrealLogView();
        await clearLogs();
        await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: '', category: '', message: '' });
        const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        if (isPaused) {
            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        }
        await delay(SETUP_COMPLETION_DELAY_MS);
    });

    afterEach(async () => {
        await focusUnrealLogView();
        const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        if (isPaused) {
            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        }
        await clearLogs();
        await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: '', category: '', message: '' });
        await delay(COMMAND_EXECUTION_DELAY_MS);
    });

    describe('Filtering Tests', () => {
        it('test 0004: should filter by log level (Error)', async () => {
            const logError: TestLogEntry = { date: new Date().toISOString(), level: 'Error', category: 'TestCat.0004', message: 'Error message 0004' };
            const logWarning: TestLogEntry = { date: new Date().toISOString(), level: 'Warning', category: 'TestCat.0004', message: 'Warning message 0004' };
            const logInfo: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'TestCat.0004', message: 'Info message 0004' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logError));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWarning));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logInfo));
            await delay(LOG_PROCESSING_DELAY_MS);

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: 'Error' });
            await delay(COMMAND_EXECUTION_DELAY_MS);

            let displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0004: Should display only 1 log after filtering by Error level');
            assert.strictEqual(displayedLogs[0].message, logError.message, 'Test 0004: Displayed log message mismatch');
            assert.strictEqual(displayedLogs[0].level, 'Error', 'Test 0004: Displayed log level mismatch');

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: '' });
            await delay(COMMAND_EXECUTION_DELAY_MS);
            displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 3, 'Test 0004: Should display all 3 logs after clearing level filter');
        });

        it('test 0005: should filter by category', async () => {
            const logCatA: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'CategoryA.0005', message: 'Message for CategoryA 0005' };
            const logCatB: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'CategoryB.0005', message: 'Message for CategoryB 0005' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logCatA));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logCatB));
            await delay(LOG_PROCESSING_DELAY_MS);

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { category: 'CategoryA.0005' });
            await delay(COMMAND_EXECUTION_DELAY_MS);

            const displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0005: Should display only 1 log after filtering by CategoryA.0005');
            assert.strictEqual(displayedLogs[0].category, 'CategoryA.0005', 'Test 0005: Displayed log category mismatch');
        });

        it('test 0006: should filter by message content', async () => {
            const logMsg1: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'MessageTest.0006', message: 'This is a unique message content 0006' };
            const logMsg2: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'MessageTest.0006', message: 'Another message 0006' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logMsg1));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logMsg2));
            await delay(LOG_PROCESSING_DELAY_MS);

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { message: 'unique message content' });
            await delay(COMMAND_EXECUTION_DELAY_MS);

            const displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0006: Should display only 1 log after filtering by message content');
            assert.strictEqual(displayedLogs[0].message, logMsg1.message, 'Test 0006: Displayed log message mismatch');
        });

        it('test 0007: should filter by multiple criteria (level and category)', async () => {
            const logErrorCatA: TestLogEntry = { date: new Date().toISOString(), level: 'Error', category: 'FilterCatA.0007', message: 'Error in FilterCatA 0007' };
            const logWarnCatA: TestLogEntry = { date: new Date().toISOString(), level: 'Warning', category: 'FilterCatA.0007', message: 'Warning in FilterCatA 0007' };
            const logErrorCatB: TestLogEntry = { date: new Date().toISOString(), level: 'Error', category: 'FilterCatB.0007', message: 'Error in FilterCatB 0007' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logErrorCatA));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWarnCatA));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logErrorCatB));
            await delay(LOG_PROCESSING_DELAY_MS);

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: 'Error', category: 'FilterCatA.0007' });
            await delay(COMMAND_EXECUTION_DELAY_MS);

            const displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0007: Should display only 1 log after filtering by Error level and FilterCatA.0007');
            assert.strictEqual(displayedLogs[0].message, logErrorCatA.message, 'Test 0007: Displayed log message mismatch');
        });

        it('test 0008: should clear all filters', async () => {
            const log1: TestLogEntry = { date: new Date().toISOString(), level: 'Error', category: 'ClearTest.0008', message: 'First message for clear test 0008' };
            const log2: TestLogEntry = { date: new Date().toISOString(), level: 'Log', category: 'ClearTest.0008', message: 'Second message for clear test 0008' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(log1));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(log2));
            await delay(LOG_PROCESSING_DELAY_MS);

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: 'Error' });
            await delay(COMMAND_EXECUTION_DELAY_MS);
            let displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0008: Should show 1 log after initial filter');

            await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { level: '', category: '', message: '' });
            await delay(COMMAND_EXECUTION_DELAY_MS);
            displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 2, 'Test 0008: Should show all 2 logs after clearing filters');
        });
    });

    describe('Pause Functionality Tests', () => {
        it('test 0009: should not display new logs when paused', async () => {
            const initialLog = { date: new Date().toISOString(), level: 'Log', category: 'PauseTest.0009', message: 'Initial log before pause 0009' };
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(initialLog));
            await delay(LOG_PROCESSING_DELAY_MS);

            let displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0009: Initial log should be displayed');

            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
            await delay(COMMAND_EXECUTION_DELAY_MS);
            const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
            assert.strictEqual(isPaused, true, 'Test 0009: Should be paused');

            const pausedLog = { date: new Date().toISOString(), level: 'Warning', category: 'PauseTest.0009', message: 'Log sent while paused 0009' };
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(pausedLog));
            await delay(LOG_PROCESSING_DELAY_MS);

            displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 1, 'Test 0009: No new logs should be displayed when paused. Count should be 1.');
            assert.strictEqual(displayedLogs[0].message, initialLog.message, 'Test 0009: The initially displayed log should still be the one visible');
        });

        it('test 0010: should display queued logs when resumed', async () => {
            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
            await delay(COMMAND_EXECUTION_DELAY_MS);
            const isPausedStateBeforeSending: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
            assert.strictEqual(isPausedStateBeforeSending, true, 'Test 0010: Should be paused initially');

            const logWhilePaused1 = { date: new Date().toISOString(), level: 'Log', category: 'ResumeTest.0010', message: 'Queued log 1 0010' };
            const logWhilePaused2 = { date: new Date().toISOString(), level: 'Error', category: 'ResumeTest.0010', message: 'Queued log 2 0010' };

            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWhilePaused1));
            await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWhilePaused2));
            await delay(LOG_PROCESSING_DELAY_MS);

            let displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 0, 'Test 0010: No logs should be displayed while paused and before any initial logs in this test context');

            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
            await delay(LOG_PROCESSING_DELAY_MS);

            displayedLogs = await getDisplayedLogMessages();
            assert.strictEqual(displayedLogs.length, 2, 'Test 0010: Queued logs should be displayed after resume');
            assert.ok(displayedLogs.find(log => log.message === logWhilePaused1.message), 'Test 0010: Queued log 1 not found after resume');
            assert.ok(displayedLogs.find(log => log.message === logWhilePaused2.message), 'Test 0010: Queued log 2 not found after resume');
        });

        it('test 0011: should correctly report pause state via command', async () => {
            const initialPauseState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
            assert.strictEqual(initialPauseState, false, 'Test 0011: Initial pause state should be false');

            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
            await delay(COMMAND_EXECUTION_DELAY_MS);
            const pausedState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
            assert.strictEqual(pausedState, true, 'Test 0011: Pause state should be true after toggling once');

            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
            await delay(COMMAND_EXECUTION_DELAY_MS);
            const resumedState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
            assert.strictEqual(resumedState, false, 'Test 0011: Pause state should be false after toggling twice');
        });
    });
});
