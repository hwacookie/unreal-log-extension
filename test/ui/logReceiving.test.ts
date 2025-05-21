/**
 * @file logReceiving.test.ts
 * Contains UI tests for log reception and timestamp formatting in the Unreal Log Viewer extension.
 * It verifies that logs sent via TCP are correctly received and displayed, and that timestamps
 * are formatted according to the extension's settings (absolute vs. relative).
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import { 
    getSetupCompletionDelayMs, // Updated
    getCommandExecutionDelayMs, // Updated
    getLogProcessingDelayMs, // Updated
    TEST_PORT,
    TestLogEntry,
    delay, 
    activateExtension, 
    focusUnrealLogView, 
    clearLogs, 
    sendTcpLogMessage, 
    getAndVerifyLogEntry
} from './testUtils';

// General setup for all log receiving tests
before(async () => {
  await activateExtension();
  await focusUnrealLogView();
});

/**
 * Test suite for basic log reception functionality.
 */
describe('Unreal Log Viewer - Basic Log Reception', function () {
  /**
   * Test case to verify that a simple log message sent via TCP is received and displayed.
   */
  it('test 0001: should receive and display a simple log message via TCP', async function () {
    this.timeout(15000);
    const testLog: TestLogEntry = {
      date: new Date().toISOString(), // Use current time for simplicity in this basic test
      category: 'BasicTest',
      level: 'Info',
      message: 'Basic TCP log reception test.'
    };
    const testLogMessage = JSON.stringify(testLog) + '\n';

    await delay(getLogProcessingDelayMs()); // Updated
    await sendTcpLogMessage(TEST_PORT, testLogMessage, 'Basic Reception Test: '); // Use TEST_PORT
    await delay(getCommandExecutionDelayMs()); // Updated

    const receivedLog = await getAndVerifyLogEntry(testLog, 'Basic Reception Test');
    assert.ok(receivedLog, 'The basic test log entry should be present.');
  });
});

/**
 * Interface for the structure returned by `vscode.workspace.getConfiguration().inspect()`.
 * This helps in strongly typing the inspection results for configuration values.
 */
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

/** Stores the original inspection result for the 'useRelativeTimestamps' setting. */
let originalUseRelativeInspection: ConfigurationInspect<boolean> | undefined;
/** Stores the original inspection result for the 'timestampFormat' setting. */
let originalTimestampFormatInspection: ConfigurationInspect<string> | undefined;
/** Stores the original effective value for 'useRelativeTimestamps' before tests modify it. */
let originalRelativeSettingForTimestampTests: boolean | undefined;
/** Stores the original effective value for 'timestampFormat' before tests modify it. */
let originalTimestampFormatForTimestampTests: string | undefined;

/**
 * Test suite for timestamp formatting functionality.
 * This suite includes tests for both absolute and relative timestamp display,
 * ensuring that the formatting respects the extension's configuration settings.
 * It uses `before` and `after` hooks to save and restore original timestamp settings,
 * and `beforeEach` to prepare for each test.
 */
describe('Unreal Log Viewer - Timestamp Formatting Tests', function () {
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

    await delay(getCommandExecutionDelayMs() * 5); // Updated
    console.log(`Timestamp Suite - AFTER - Settings restored. Effective ${settingKey}: ${config.get(settingKey)}, Effective ${formatKey}: ${config.get(formatKey)}`);
    const finalInspection = config.inspect<boolean>(settingKey);
    console.log(`Timestamp Suite - AFTER - Final inspection of ${settingKey} after restore:`, JSON.stringify(finalInspection, null, 2));
  });

  beforeEach(async () => {
    // Each test will now be responsible for setting its config and then clearing logs.
    console.log("Timestamp Suite - beforeEach: (No longer clearing logs here)");
    // Ensure any config changes from a previous test in this suite are processed before the next one starts.
    await delay(getSetupCompletionDelayMs()); // Updated
  });
  
  /**
   * Test case to verify that absolute timestamps are displayed correctly in HH:mm:ss.SSS format.
   * It sets the relevant configuration, sends a log, and checks if the displayed timestamp matches the expected format.
   */
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
    await delay(getLogProcessingDelayMs()); // Updated

    const currentIsoTimestamp = new Date().toISOString(); 
    const testLog: TestLogEntry = { ...baseLogEntry, date: currentIsoTimestamp }; 
    const testLogMessage = JSON.stringify(testLog) + '\n';

    await sendTcpLogMessage(TEST_PORT, testLogMessage, 'Absolute Timestamp Test: '); // Use TEST_PORT
    await delay(getLogProcessingDelayMs() * 2); // Updated

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

  /**
   * Test case to verify that relative timestamps are displayed correctly in +HH:MM:SS.mmm format.
   * It sets the relevant configuration, sends a log, and checks if the displayed timestamp matches the expected relative format.
   */
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
    await delay(getLogProcessingDelayMs()); // Updated
    
    const currentIsoTimestamp = new Date().toISOString();
    const testLog: TestLogEntry = { ...baseLogEntry, date: currentIsoTimestamp, category: 'RelativeTimestampTest' }; 
    const testLogMessage = JSON.stringify(testLog) + '\n';
    
    await sendTcpLogMessage(TEST_PORT, testLogMessage, 'Relative Timestamp Test: '); // Use TEST_PORT
    await delay(getLogProcessingDelayMs() * 2); // Updated

    const receivedLog = await getAndVerifyLogEntry(testLog, 'Relative Timestamp Test');
    assert.ok(receivedLog, 'Log entry for relative timestamp test should be present.');

    assert.match(receivedLog!.date, /^\+\d{2}:\d{2}:\d{2}\.\d{3}$/, 
        `The timestamp "${receivedLog!.date}" should be relative. Effective '${settingKey}' was: ${currentEffectiveValue}. ` +
        `Input ISO: ${currentIsoTimestamp}.`);
    console.log(`Relative timestamp received: ${receivedLog!.date}`);
  });
});

