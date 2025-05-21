/**
 * @fileoverview Utility functions for UI tests of the Unreal Log Viewer extension.
 * This file provides helper functions for common test operations such as activating the extension,
 * sending log messages, interacting with the webview, and managing test delays.
 */

import * as vscode from 'vscode';
import * as assert from 'assert';
import * as net from 'net';

/**
 * Global scalar used to adjust delay times for testing purposes.
 * It can be set to a different value to speed up or slow down the tests.
 * The default value is 0.001, which means the delays will be 1/1000th of their original values.
 * This is useful for slowing down tests to observe behavior or for speeding them up to reduce test time.
 */
let globalDelayScalar = 0.001;

/**
 * Sets the global delay scalar.
 * @param newScalar The new scalar value. Must be a positive number.
 */
export function setGlobalDelayScalar(newScalar: number): void {
  if (newScalar > 0) {
    globalDelayScalar = newScalar;
  } else {
    console.warn('Attempted to set globalDelayScalar to a non-positive value. Scalar remains unchanged.');
  }
}

/** @returns The delay in milliseconds for setup completion, adjusted by `globalDelayScalar`. */
export function getSetupCompletionDelayMs(): number { return 100 * globalDelayScalar; }
/** @returns The delay in milliseconds for command execution, adjusted by `globalDelayScalar`. */
export function getCommandExecutionDelayMs(): number { return 100 * globalDelayScalar; }
/** @returns The delay in milliseconds for log processing, adjusted by `globalDelayScalar`. */
export function getLogProcessingDelayMs(): number { return 400 * globalDelayScalar; }
/** @returns The delay in milliseconds for checking pause state, adjusted by `globalDelayScalar`. */
export function getPauseStateCheckDelayMs(): number { return 50 * globalDelayScalar; }
/** @returns The delay in milliseconds for resuming log display, adjusted by `globalDelayScalar`. */
export function getResumeLogDisplayDelayMs(): number { return 300 * globalDelayScalar; }
/** @returns The delay in milliseconds for the webview to be ready, adjusted by `globalDelayScalar`. */
export function getWebviewReadyDelayMs(): number { return 500 * globalDelayScalar; }

/** The port number used for sending test TCP log messages. */
export const TEST_PORT = 9876;

/**
 * Defines the structure of a log entry as expected by the test utilities
 * when returned from the extension's commands.
 */
export interface TestLogEntry {
  /** The ISO date string of the log entry. */
  date: string;
  /** The severity level of the log entry (e.g., 'Log', 'Warning', 'Error'). */
  level: string;
  /** The category of the log entry (e.g., 'LogTemp', 'LogBlueprint'). */
  category: string;
  /** The actual message content of the log entry. */
  message: string;
  /** Optional source information for the log entry. */
  source?: string;
}

/**
 * Introduces a delay for a specified number of milliseconds.
 * @param ms The duration of the delay in milliseconds.
 * @returns A promise that resolves after the delay.
 */
export async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Activates the Unreal Log Viewer extension.
 * Asserts that the extension is found and becomes active.
 */
export async function activateExtension() {
  const extensionId = 'coregames.unreal-log-viewer';
  const extension = vscode.extensions.getExtension(extensionId);
  assert.ok(extension, `Extension ${extensionId} should be found.`);
  await extension!.activate();
  assert.ok(extension!.isActive, 'Extension should be active.');
}

/**
 * Focuses the Unreal Log Viewer view.
 * Ensures the view is opened (typically in the panel) and ready.
 */
export async function focusUnrealLogView() {
  console.log('Attempting to focus the Unreal Log Viewer view...');

  // Focus/Open the Unreal Log Viewer view.
  // This should now open it in the panel by default as per package.json.
  await vscode.commands.executeCommand('unrealLogViewerView3.focus');
  console.log('Unreal Log Viewer focus command executed.');
  // Use getWebviewReadyDelayMs as it might be opening for the first time and needs to load content.
  await delay(getWebviewReadyDelayMs());
  console.log('Unreal Log Viewer should now be focused in the panel.');
}

/**
 * Clears all logs from the Unreal Log Viewer via a command.
 */
export async function clearLogs() {
  await vscode.commands.executeCommand('unrealLogViewer.clear');
}

/**
 * Retrieves the currently displayed log messages from the Unreal Log Viewer.
 * @returns A promise that resolves to an array of `TestLogEntry` objects.
 */
export async function getDisplayedLogMessages(): Promise<TestLogEntry[]> {
  return await vscode.commands.executeCommand<TestLogEntry[]>('unrealLogViewer.getDisplayedLogMessagesForTest');
}

/**
 * Sends a log message via TCP to the specified port.
 * @param port The port number to send the message to.
 * @param message The log message string (typically a JSON stringified `UnrealLogEntry`).
 * @param logPrefix An optional prefix for console logging within this function.
 * @returns A promise that resolves when the message has been sent.
 */
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

/**
 * Retrieves all displayed logs and verifies if a specific log entry is present.
 * @param expectedLog The `TestLogEntry` object to search for.
 * @param testDescription A description of the test or context for logging purposes.
 * @returns A promise that resolves to the found `TestLogEntry` or `undefined` if not found.
 * @throws If logs cannot be retrieved or if an assertion fails.
 */
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

/**
 * Interface describing the structure of an HTML element retrieved from the webview.
 */
export interface WebviewElement {
  /** The ID attribute of the element. */
  id: string;
  /** The tag name of the element (e.g., 'div', 'button'). */
  tag: string;
  /** A record of the element's HTML attributes. */
  attributes: Record<string, string>;
  /** A record of the element's computed CSS styles. */
  style: Record<string, string>;
  /** The inner HTML content of the element. */
  innerHTML: string;
  /** The text content of the element. */
  textContent: string;
}

/**
 * Retrieves elements from the webview that match a given CSS selector.
 * @param selector The CSS selector to query elements with.
 * @param logPrefix An optional prefix for console logging within this function.
 * @returns A promise that resolves to an array of `WebviewElement` objects.
 * @throws If elements cannot be retrieved or if an assertion fails.
 */
export async function getWebviewElements(selector: string, logPrefix = ''): Promise<WebviewElement[]> {
  console.log(`${logPrefix}Getting elements from webview with selector: ${selector}`);
  try {
    const elements = await vscode.commands.executeCommand<WebviewElement[]>('unrealLogViewer.getWebviewElementsBySelectorForTest', selector);
    assert.ok(elements, `${logPrefix}Should retrieve elements array from webview.`);
    console.log(`${logPrefix}Retrieved elements:`, JSON.stringify(elements, null, 2));
    return elements;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    assert.fail(`${logPrefix}Could not retrieve elements from webview. Selector: "${selector}". Error: ${errorMessage}`);
    throw error; // Satisfy type checker
  }
}

/**
 * Simulates a click on an element within the webview, identified by its ID.
 * @param elementId The ID of the element to click.
 * @param logPrefix An optional prefix for console logging within this function.
 * @returns A promise that resolves to `true` if the click command was successfully executed, `false` otherwise.
 * @throws If the click command fails or if an assertion fails.
 */
export async function clickWebviewButton(elementId: string, logPrefix = ''): Promise<boolean> {
  console.log(`${logPrefix}Attempting to click webview element with ID: ${elementId}`);
  try {
    const success = await vscode.commands.executeCommand<boolean>('unrealLogViewer.clickWebviewElementForTest', elementId);
    assert.ok(success, `${logPrefix}Command to click element ${elementId} should return true.`);
    console.log(`${logPrefix}Successfully clicked webview element with ID: ${elementId}`);
    return success;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    assert.fail(`${logPrefix}Could not click webview element with ID: "${elementId}". Error: ${errorMessage}`);
    throw error; // Satisfy type checker
  }
}
