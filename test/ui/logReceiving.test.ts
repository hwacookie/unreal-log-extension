import * as assert from 'assert';
import * as vscode from 'vscode';
import * as net from 'net';

// Define and export delay constants
export const SETUP_COMPLETION_DELAY_MS = 100;
export const COMMAND_EXECUTION_DELAY_MS = 100;
export const LOG_PROCESSING_DELAY_MS = 200;
export const PAUSE_STATE_CHECK_DELAY_MS = 50;
export const RESUME_LOG_DISPLAY_DELAY_MS = 300;

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
  await delay(SETUP_COMPLETION_DELAY_MS); // Use constant
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
    const displayedLogs = await getDisplayedLogMessages();
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

// General setup for all log receiving tests
before(async () => {
  await activateExtension();
  await focusUnrealLogView();
});

describe('Unreal Log Viewer - Basic Log Reception', function () {
  const tcpPort = 9876; // Default port

  it('test 0001: should receive and display a simple log message via TCP', async function () {
    this.timeout(15000);
    const testLog: TestLogEntry = {
      date: new Date().toISOString(), // Use current time for simplicity in this basic test
      category: 'BasicTest',
      level: 'Info',
      message: 'Basic TCP log reception test.'
    };
    const testLogMessage = JSON.stringify(testLog) + '\n';

    await delay(LOG_PROCESSING_DELAY_MS); // Use constant
    await sendTcpLogMessage(tcpPort, testLogMessage, 'Basic Reception Test: ');
    await delay(COMMAND_EXECUTION_DELAY_MS); // Use constant

    const receivedLog = await getAndVerifyLogEntry(testLog, 'Basic Reception Test');
    assert.ok(receivedLog, 'The basic test log entry should be present.');
  });
});

// Define an interface for the structure returned by config.inspect()
interface ConfigurationInspect<T> {
  key: string;
  defaultValue?: T;
  globalValue?: T;
  workspaceValue?: T;
  workspaceFolderValue?: T;
  defaultLanguageValue?: T;
  globalLanguageValue?: T;
  workspaceLanguageValue?: T;
  workspaceFolderLanguageValue?: T;
  languageIds?: string[];
}

// Store original inspection results to aid in restoration
let originalUseRelativeInspection: ConfigurationInspect<boolean> | undefined;
let originalTimestampFormatInspection: ConfigurationInspect<string> | undefined;
// Store original effective values as a fallback or for simpler restoration logic
let originalRelativeSettingForTimestampTests: boolean | undefined;
let originalTimestampFormatForTimestampTests: string | undefined;

describe('Unreal Log Viewer - Timestamp Formatting Tests', function () {
  const tcpPort = 9876; // Default port
  const baseLogEntry: Omit<TestLogEntry, 'date'> = {
    category: 'TimestampTest',
    level: 'Warning',
    message: 'Timestamp formatting test log.'
  };

  before(async () => {
    const config = vscode.workspace.getConfiguration('unrealLogViewer');
    const settingKey = 'useRelativeTimestamps';
    const formatKey = 'timestampFormat';

    // 1. Inspect and store original values
    originalUseRelativeInspection = config.inspect<boolean>(settingKey);
    originalTimestampFormatInspection = config.inspect<string>(formatKey);
    console.log(`Timestamp Suite - BEFORE - Initial inspection of ${settingKey}:`, JSON.stringify(originalUseRelativeInspection, null, 2));
    console.log(`Timestamp Suite - BEFORE - Initial inspection of ${formatKey}:`, JSON.stringify(originalTimestampFormatInspection, null, 2));

    // Store effective values
    originalRelativeSettingForTimestampTests = config.get<boolean>(settingKey);
    originalTimestampFormatForTimestampTests = config.get<string>(formatKey);

    console.log(`Timestamp Suite - BEFORE - Saved initial settings. Effective ${settingKey}: ${originalRelativeSettingForTimestampTests}, Effective ${formatKey}: ${originalTimestampFormatForTimestampTests}`);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('unrealLogViewer');
    const settingKey = 'useRelativeTimestamps';
    const formatKey = 'timestampFormat';
    console.log(`Timestamp Suite - AFTER - Restoring original settings...`);

    // Restore to original effective values, and attempt to clear workspace overrides specifically.
    // This is a simplified restoration. A more complex one would use the full inspection details.
    await config.update(settingKey, originalRelativeSettingForTimestampTests, vscode.ConfigurationTarget.Global);
    await config.update(settingKey, undefined, vscode.ConfigurationTarget.Workspace); // Clear potential workspace override

    await config.update(formatKey, originalTimestampFormatForTimestampTests, vscode.ConfigurationTarget.Global);
    await config.update(formatKey, undefined, vscode.ConfigurationTarget.Workspace); // Clear potential workspace override

    await delay(COMMAND_EXECUTION_DELAY_MS * 5); // Ensure settings are restored
    console.log(`Timestamp Suite - AFTER - Settings restored. Effective ${settingKey}: ${config.get(settingKey)}, Effective ${formatKey}: ${config.get(formatKey)}`);
    const finalInspection = config.inspect<boolean>(settingKey);
    console.log(`Timestamp Suite - AFTER - Final inspection of ${settingKey} after restore:`, JSON.stringify(finalInspection, null, 2));
  });

  beforeEach(async () => {
    // Each test will now be responsible for setting its config and then clearing logs.
    console.log("Timestamp Suite - beforeEach: (No longer clearing logs here)");
    // Ensure any config changes from a previous test in this suite are processed before the next one starts.
    await delay(SETUP_COMPLETION_DELAY_MS); 
  });
  
  it('test 0002: should display absolute timestamp correctly (HH:mm:ss.SSS)', async function () {
    this.timeout(20000);
    let config = vscode.workspace.getConfiguration('unrealLogViewer'); // Initial fetch
    const settingKey = 'useRelativeTimestamps';
    const formatKey = 'timestampFormat';

    console.log(`Test 0002 - START - Initial effective value of ${settingKey}: ${config.get<boolean>(settingKey)}`);
    let currentInspection = config.inspect<boolean>(settingKey);
    console.log(`Test 0002 - START - Initial inspection of ${settingKey}:`, JSON.stringify(currentInspection, null, 2));

    // Attempt to set to false for this test
    console.log(`Test 0002 - Attempting to set ${settingKey} to false and ${formatKey} to HH:mm:ss.SSS`);
    await config.update(settingKey, false, vscode.ConfigurationTarget.Global); 
    await config.update(formatKey, 'HH:mm:ss.SSS', vscode.ConfigurationTarget.Global);
    
    await delay(1000); // Increased delay for settings to propagate

    config = vscode.workspace.getConfiguration('unrealLogViewer'); // Re-fetch config
    const currentEffectiveValue = config.get<boolean>(settingKey);
    currentInspection = config.inspect<boolean>(settingKey);
    console.log(`Test 0002 - After update attempts - Effective value of ${settingKey}: ${currentEffectiveValue}`);
    console.log(`Test 0002 - After update attempts - Inspection of ${settingKey}:`, JSON.stringify(currentInspection, null, 2));
    
    assert.strictEqual(currentEffectiveValue, false, 
      `Test 0002: Configuration '${settingKey}' should be false. Effective: ${currentEffectiveValue}. Inspection: ${JSON.stringify(currentInspection)}`);

    // Clear logs AFTER settings are applied and verified for this test
    await clearLogs(); 
    await delay(LOG_PROCESSING_DELAY_MS); 

    const currentIsoTimestamp = new Date().toISOString(); 
    const testLog: TestLogEntry = { ...baseLogEntry, date: currentIsoTimestamp }; 
    const testLogMessage = JSON.stringify(testLog) + '\n';

    await sendTcpLogMessage(tcpPort, testLogMessage, 'Absolute Timestamp Test: ');
    await delay(LOG_PROCESSING_DELAY_MS * 2); 

    const receivedLog = await getAndVerifyLogEntry(testLog, 'Absolute Timestamp Test');
    assert.ok(receivedLog, 'Log entry for absolute timestamp test should be present.');

    // Simulate the provider's behavior for expected time calculation:
    // 1. The provider receives an ISO string (e.g., "2025-05-21T00:05:19.462Z")
    // 2. It strips the 'Z' -> "2025-05-21T00:05:19.462"
    // 3. It parses this Z-stripped string with `new Date()`, which interprets it as local time.
    const timestampWithoutZ = currentIsoTimestamp.endsWith('Z') 
        ? currentIsoTimestamp.slice(0, -1) 
        : currentIsoTimestamp;
    const dateAsParsedByProvider = new Date(timestampWithoutZ);

    const h = dateAsParsedByProvider.getHours().toString().padStart(2, '0');
    const m = dateAsParsedByProvider.getMinutes().toString().padStart(2, '0');
    const s = dateAsParsedByProvider.getSeconds().toString().padStart(2, '0');
    const ms = dateAsParsedByProvider.getMilliseconds().toString().padStart(3, '0');
    const expectedTime = `${h}:${m}:${s}.${ms}`;
    
    assert.strictEqual(receivedLog!.date, expectedTime, 
      `Absolute timestamp should match provider's parsing logic. Expected: "${expectedTime}", Actual: "${receivedLog!.date}". ` +
      `Input ISO: ${currentIsoTimestamp}. Effective '${settingKey}' was: ${currentEffectiveValue}. Timestamp sent to provider: ${timestampWithoutZ}`);
  });

  it('test 0003: should display relative timestamp correctly (+HH:MM:SS.mmm)', async function () {
    this.timeout(15000);
    let config = vscode.workspace.getConfiguration('unrealLogViewer'); // Initial fetch
    const settingKey = 'useRelativeTimestamps';

    console.log(`Test 0003 - START - Initial effective value of ${settingKey}: ${config.get<boolean>(settingKey)}`);
    let currentInspection = config.inspect<boolean>(settingKey);
    console.log(`Test 0003 - START - Initial inspection of ${settingKey}:`, JSON.stringify(currentInspection, null, 2));

    // Attempt to set to true for this test
    console.log(`Test 0003 - Attempting to set ${settingKey} to true...`);
    await config.update(settingKey, true, vscode.ConfigurationTarget.Global);
    
    await delay(1000); // Increased delay for settings to propagate

    config = vscode.workspace.getConfiguration('unrealLogViewer'); // Re-fetch config
    const currentEffectiveValue = config.get<boolean>(settingKey);
    currentInspection = config.inspect<boolean>(settingKey);
    console.log(`Test 0003 - After update attempts - Effective value of ${settingKey}: ${currentEffectiveValue}`);
    console.log(`Test 0003 - After update attempts - Inspection of ${settingKey}:`, JSON.stringify(currentInspection, null, 2));

    assert.strictEqual(currentEffectiveValue, true, 
      `Test 0003: Configuration '${settingKey}' should be true. Effective: ${currentEffectiveValue}. Inspection: ${JSON.stringify(currentInspection)}`);

    // Clear logs AFTER settings are applied and verified
    await clearLogs(); 
    await delay(LOG_PROCESSING_DELAY_MS);
    
    const currentIsoTimestamp = new Date().toISOString();
    const testLog: TestLogEntry = { ...baseLogEntry, date: currentIsoTimestamp, category: 'RelativeTimestampTest' }; 
    const testLogMessage = JSON.stringify(testLog) + '\n';
    
    await sendTcpLogMessage(tcpPort, testLogMessage, 'Relative Timestamp Test: ');
    await delay(LOG_PROCESSING_DELAY_MS * 2); // Increased delay for processing

    const receivedLog = await getAndVerifyLogEntry(testLog, 'Relative Timestamp Test');
    assert.ok(receivedLog, 'Log entry for relative timestamp test should be present.');

    assert.match(receivedLog!.date, /^\+\d{2}:\d{2}:\d{2}\.\d{3}$/, 
        `The timestamp "${receivedLog!.date}" should be relative. Effective '${settingKey}' was: ${currentEffectiveValue}. ` +
        `Input ISO: ${currentIsoTimestamp}.`);
    console.log(`Relative timestamp received: ${receivedLog!.date}`);
  });
});

