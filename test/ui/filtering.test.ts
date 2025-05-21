import * as vscode from 'vscode';
import * as assert from 'assert';
import { 
    activateExtension, 
    clearLogs, 
    getDisplayedLogMessages, 
    sendTcpLogMessage, 
    focusUnrealLogView, 
    delay, 
    TestLogEntry, 
    LOG_PROCESSING_DELAY_MS, 
    COMMAND_EXECUTION_DELAY_MS, 
    SETUP_COMPLETION_DELAY_MS, 
    TEST_PORT 
} from './testUtils';

describe('UI Filtering Tests', () => {
    let originalUseRelativeTimestamps: boolean | undefined;
    let originalTimestampFormat: string | undefined;

    before(async () => {
        await activateExtension();
        await focusUnrealLogView();
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        originalUseRelativeTimestamps = config.get('useRelativeTimestamps');
        originalTimestampFormat = config.get('timestampFormat');
        await config.update('useRelativeTimestamps', false, vscode.ConfigurationTarget.Global);
        await config.update('timestampFormat', 'HH:mm:ss.SSS', vscode.ConfigurationTarget.Global);
        await delay(SETUP_COMPLETION_DELAY_MS);
    });

    after(async () => {
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
