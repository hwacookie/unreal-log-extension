import * as vscode from 'vscode';
import * as assert from 'assert';
import * as net from 'net';

// Define and export delay constants
export const SETUP_COMPLETION_DELAY_MS = 100;
export const COMMAND_EXECUTION_DELAY_MS = 100;
export const LOG_PROCESSING_DELAY_MS = 200;
export const PAUSE_STATE_CHECK_DELAY_MS = 50;
export const RESUME_LOG_DISPLAY_DELAY_MS = 300;
export const TEST_PORT = 9876;

// Define a type for the expected log entry structure returned by the command
export interface TestLogEntry {
  date: string;
  level: string;
  category: string;
  message: string;
  source?: string;
}

// Helper function to introduce a delay
export async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to activate the extension
export async function activateExtension() {
  const extensionId = 'coregames.unreal-log-viewer';
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Extension ${extensionId} should be found.`);
  await extension!.activate();
  assert.ok(extension!.isActive, 'Extension should be active.');
}

// Helper function to focus the Unreal Log Viewer
export async function focusUnrealLogView() {
  console.log('Attempting to focus the Unreal Log Viewer view...');
  await vscode.commands.executeCommand('unrealLogViewerView3.focus');
  console.log('Focus command executed.');
  await delay(SETUP_COMPLETION_DELAY_MS); // Use constant from this file
}

// Helper function to clear logs via command
export async function clearLogs() {
  await vscode.commands.executeCommand('unrealLogViewer.clear');
}

// Helper function to get displayed log messages via command
export async function getDisplayedLogMessages(): Promise<TestLogEntry[]> {
  return await vscode.commands.executeCommand<TestLogEntry[]>('unrealLogViewer.getDisplayedLogMessagesForTest');
}

// Helper function to send a TCP log message
export async function sendTcpLogMessage(port: number, message: string, logPrefix = ''): Promise<void> {
  console.log(`${logPrefix}Sending TCP message to localhost:${port}...`);
  try {
    const client = new net.Socket();
    await new Promise<void>((resolve, reject) => {
      client.connect(port, '127.0.0.1', () => {
        console.log(`${logPrefix}TCP connected, sending message.`);
        client.write(message);
        client.end();
        resolve();
      });
      client.on('error', (err) => {
        console.error(`${logPrefix}TCP connection error:`, err);
        reject(err);
      });
    });
    console.log(`${logPrefix}TCP message sent.`);
  } catch (error) {
    assert.fail(`${logPrefix}Failed to send TCP message: ${error}`);
  }
}

// Helper function to retrieve logs and find a specific entry
export async function getAndVerifyLogEntry(expectedLog: TestLogEntry, testDescription: string): Promise<TestLogEntry | undefined> {
  console.log(`Attempting to retrieve displayed logs via command (${testDescription})...`);
  try {
    const displayedLogs = await getDisplayedLogMessages(); // Uses helper from this file
    assert.ok(displayedLogs, `Should retrieve displayed logs array (${testDescription}).`);
    console.log(`Retrieved logs for ${testDescription}:`, JSON.stringify(displayedLogs, null, 2));
    
    const receivedLog = displayedLogs.find(
      log =>
        log.level === expectedLog.level &&
        log.category === expectedLog.category &&
        log.message === expectedLog.message
    );
    return receivedLog; // Can be undefined if not found
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    assert.fail(`Could not retrieve or verify log message in viewer (${testDescription}). Error: ${errorMessage}`);
    throw e; // Should not be reached due to assert.fail, but satisfies type checker
  }
}
