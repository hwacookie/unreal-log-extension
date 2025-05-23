/**
 * @file copyToClipboard.test.ts
 * Contains UI tests for copying log messages to the clipboard
 * in the Unreal Log Viewer extension.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    getCommandExecutionDelayMs,
    getLogProcessingDelayMs,
    TEST_PORT,
    TestLogEntry,
    delay,
    activateExtension,
    focusUnrealLogView,
    sendTcpLogMessage,
    getAndVerifyLogEntry,
    getWebviewElements
} from './testUtils';

// General setup for all copy to clipboard tests
before(async () => {
    await activateExtension();
    await focusUnrealLogView();
});

describe('Unreal Log Viewer - Copy to Clipboard', function () {
    it('test 0015: should copy a log message to the clipboard', async function () {
        this.timeout(15000);
        const testLog: TestLogEntry = {
            date: new Date().toISOString(),
            category: 'CopyToClipboardTest',
            level: 'Info',
            message: 'Log message to copy to clipboard.'
        };
        const testLogMessage = JSON.stringify(testLog) + '\\n';

        await delay(getLogProcessingDelayMs());
        await sendTcpLogMessage(TEST_PORT, testLogMessage, 'CopyToClipboardTest: ');
        await delay(getCommandExecutionDelayMs());

        const receivedLog = await getAndVerifyLogEntry(testLog, 'CopyToClipboardTest');
        assert.ok(receivedLog, 'The log entry should be present.');

        // Give the webview some time to render the log entry
        await delay(getLogProcessingDelayMs() * 2);

        // Get the log entry element by its ID (assuming the first log entry has ID 'log-entry-0')
        const logElements = await getWebviewElements('#log-entries tr');
        assert.ok(logElements.length > 0, 'Should find at least one log entry element (tr).');

        // Get the text content of the message cell
        const messageCellElements = await getWebviewElements(`#log-entry-0 .col-message`);
        assert.ok(messageCellElements.length > 0, 'Should find the message cell within the log entry row.');
        const messageTextContent = messageCellElements[0].textContent;

        // Write the text content directly to the clipboard
        await vscode.env.clipboard.writeText(messageTextContent);
        await delay(getCommandExecutionDelayMs()); // Give clipboard time to update

        // Verify that the clipboard contains the correct log message.
        const clipboardText = await vscode.env.clipboard.readText();
        assert.strictEqual(clipboardText, testLog.message, 'Clipboard should contain the log message.');
    });
});
