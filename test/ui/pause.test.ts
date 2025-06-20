/**
 * @fileoverview UI tests for the pause functionality of the Unreal Log Viewer.
 * These tests verify that pausing and resuming log display works as expected.
 */

import * as vscode from 'vscode';
import * as assert from 'assert';
import {
    activateExtension,
    clearLogs,
    getDisplayedLogMessages,
    sendTcpLogMessage,
    focusUnrealLogView,
    delay,
    getLogProcessingDelayMs, // Updated
    getCommandExecutionDelayMs, // Updated
    getSetupCompletionDelayMs, // Updated
    TEST_PORT
} from './testUtils';

/**
 * Test suite for the pause functionality of the Unreal Log Viewer.
 */
describe('Pause Functionality Tests', () => {
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
        await delay(getSetupCompletionDelayMs()); // Updated
    });

    after(async () => {
        const config = vscode.workspace.getConfiguration('unrealLogViewer');
        await config.update('useRelativeTimestamps', originalUseRelativeTimestamps, vscode.ConfigurationTarget.Global);
        await config.update('timestampFormat', originalTimestampFormat, vscode.ConfigurationTarget.Global);
        await delay(getCommandExecutionDelayMs()); // Updated
    });

    beforeEach(async () => {
        await focusUnrealLogView();
        await clearLogs();
        await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { levelFilter: '', categoryFilter: '', messageFilter: '' });
        const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        if (isPaused) {
            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        }
        await delay(getSetupCompletionDelayMs()); // Updated
    });

    afterEach(async () => {
        await focusUnrealLogView();
        const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        if (isPaused) {
            await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        }
        await clearLogs();
        await vscode.commands.executeCommand('unrealLogViewer.setFiltersForTest', { levelFilter: '', categoryFilter: '', messageFilter: '' });
        await delay(getCommandExecutionDelayMs()); // Updated
    });

    /**
     * Test case 0009: Verifies that new logs are not displayed when the log view is paused.
     * It sends an initial log, pauses the view, sends another log, and checks that only the initial log is visible.
     */
    it('test 0009: should not display new logs when paused', async () => {
        const initialLog = { date: new Date().toISOString(), level: 'Log', category: 'PauseTest.0009', message: 'Initial log before pause 0009' };
        await sendTcpLogMessage(TEST_PORT, JSON.stringify(initialLog));
        await delay(getLogProcessingDelayMs()); // Updated

        let displayedLogs = await getDisplayedLogMessages();
        assert.strictEqual(displayedLogs.length, 1, 'Test 0009: Initial log should be displayed');

        await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        await delay(getCommandExecutionDelayMs()); // Updated
        const isPaused: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        assert.strictEqual(isPaused, true, 'Test 0009: Should be paused');

        const pausedLog = { date: new Date().toISOString(), level: 'Warning', category: 'PauseTest.0009', message: 'Log sent while paused 0009' };
        await sendTcpLogMessage(TEST_PORT, JSON.stringify(pausedLog));
        await delay(getLogProcessingDelayMs()); // Updated

        displayedLogs = await getDisplayedLogMessages();
        assert.strictEqual(displayedLogs.length, 1, 'Test 0009: No new logs should be displayed when paused. Count should be 1.');
        assert.strictEqual(displayedLogs[0].message, initialLog.message, 'Test 0009: The initially displayed log should still be the one visible');
    });

    /**
     * Test case 0010: Verifies that logs queued while paused are displayed when the log view is resumed.
     * It pauses the view, sends multiple logs, resumes the view, and checks that all queued logs are visible.
     */
    it('test 0010: should display queued logs when resumed', async () => {
        await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        await delay(getCommandExecutionDelayMs()); // Updated
        const isPausedStateBeforeSending: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        assert.strictEqual(isPausedStateBeforeSending, true, 'Test 0010: Should be paused initially');

        const logWhilePaused1 = { date: new Date().toISOString(), level: 'Log', category: 'ResumeTest.0010', message: 'Queued log 1 0010' };
        const logWhilePaused2 = { date: new Date().toISOString(), level: 'Error', category: 'ResumeTest.0010', message: 'Queued log 2 0010' };

        await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWhilePaused1));
        await sendTcpLogMessage(TEST_PORT, JSON.stringify(logWhilePaused2));
        await delay(getLogProcessingDelayMs()); // Updated

        let displayedLogs = await getDisplayedLogMessages();
        assert.strictEqual(displayedLogs.length, 0, 'Test 0010: No logs should be displayed while paused and before any initial logs in this test context');

        await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest'); // Resume
        await delay(getLogProcessingDelayMs()); // Updated

        displayedLogs = await getDisplayedLogMessages();
        assert.strictEqual(displayedLogs.length, 2, 'Test 0010: Queued logs should be displayed after resume');
        assert.ok(displayedLogs.find(log => log.message === logWhilePaused1.message), 'Test 0010: Queued log 1 not found after resume');
        assert.ok(displayedLogs.find(log => log.message === logWhilePaused2.message), 'Test 0010: Queued log 2 not found after resume');
    });

    /**
     * Test case 0011: Verifies that the pause state is correctly reported via a command.
     * It toggles the pause state multiple times and checks if the reported state is accurate.
     */
    it('test 0011: should correctly report pause state via command', async () => {
        const initialPauseState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        assert.strictEqual(initialPauseState, false, 'Test 0011: Initial pause state should be false');

        await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        await delay(getCommandExecutionDelayMs()); // Updated
        const pausedState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        assert.strictEqual(pausedState, true, 'Test 0011: Pause state should be true after toggling once');

        await vscode.commands.executeCommand('unrealLogViewer.togglePauseForTest');
        await delay(getCommandExecutionDelayMs()); // Updated
        const unpausedState: boolean | undefined = await vscode.commands.executeCommand('unrealLogViewer.getPauseStateForTest');
        assert.strictEqual(unpausedState, false, 'Test 0011: Pause state should be false after toggling again');
    });
});
