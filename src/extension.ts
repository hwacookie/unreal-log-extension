import * as vscode from 'vscode';
import { UnrealLogEntry } from './logTypes';
import { UnrealLogViewerProvider } from './UnrealLogViewerProvider';
import { LogServerManager } from './LogServerManager';
import { UnrealLogTextDocumentContentProvider, LOG_TEXT_URI } from './LogTextContentProvider';

let outputChannel: vscode.OutputChannel | undefined;
let unrealLogViewerProviderInstance: UnrealLogViewerProvider | undefined;
let logTextContentProviderInstance: UnrealLogTextDocumentContentProvider | undefined;
let logServerManager: LogServerManager | undefined;
let logCountStatusItem: vscode.StatusBarItem; // Added for log counts

export function activate(context: vscode.ExtensionContext) {
	console.log('UNREAL LOG VIEWER: activate called');

	if (!outputChannel) {
		outputChannel = vscode.window.createOutputChannel('Unreal Log Viewer');
	}

	const provider = new UnrealLogViewerProvider(context);
	unrealLogViewerProviderInstance = provider;

	// Initialize and register the text document content provider
	logTextContentProviderInstance = new UnrealLogTextDocumentContentProvider(unrealLogViewerProviderInstance);
	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(UnrealLogTextDocumentContentProvider.scheme, logTextContentProviderInstance)
	);

	// Initialize Status Bar Items
	logCountStatusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	context.subscriptions.push(logCountStatusItem);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(UnrealLogViewerProvider.viewType, provider)
	);
	console.log('Unreal Log Viewer Webview Provider registered.');

	const addLogCallback = (log: UnrealLogEntry) => {
		if (unrealLogViewerProviderInstance) {
			unrealLogViewerProviderInstance.addLog(log);
			if (!unrealLogViewerProviderInstance.paused && logTextContentProviderInstance) {
				logTextContentProviderInstance.refresh();
			}
		}
	};

	const refreshTextLogFunction = () => {
		if (logTextContentProviderInstance && unrealLogViewerProviderInstance && !unrealLogViewerProviderInstance.paused) {
			logTextContentProviderInstance.refresh();
		}
	};

	// Ensure the provider's onLogsCleared callback correctly refreshes the text document
	provider.onLogsCleared = () => {
		if (logTextContentProviderInstance) {
			logTextContentProviderInstance.refresh();
		}
	};

	// Ensure the provider's onFiltersChanged callback correctly refreshes the text document
	provider.onFiltersChanged = () => {
		if (logTextContentProviderInstance) {
			logTextContentProviderInstance.refresh();
		}
	};

	// Listen for log count changes to update the status bar
	provider.onLogCountsChanged.event((counts: { displayed: number; total: number }) => { // Corrected: Subscribed to .event
		if (counts.total > 0) {
			logCountStatusItem.text = `Logs: ${counts.displayed} / ${counts.total}`;
			logCountStatusItem.show();
		} else {
			logCountStatusItem.hide(); // Hide if no logs
		}
	});

	logServerManager = new LogServerManager(outputChannel, addLogCallback, refreshTextLogFunction);

	const initialConfig = vscode.workspace.getConfiguration('unrealLogViewer');
	const initialPort = initialConfig.get<number>('serverPort', 9876);
	logServerManager.start(initialPort);

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.clear', () => {
		provider.clearLogs();
		outputChannel?.appendLine('Logs cleared.');
		logCountStatusItem.text = 'Logs: 0 / Total: 0'; // Update count status on clear
	}));

	context.subscriptions.push(
		vscode.commands.registerCommand('unrealLogViewer.create', () => {
			console.log('Unreal Log Viewer: create command invoked.');
			// Directly focus the view. VS Code will handle making its panel container visible.
			vscode.commands.executeCommand('unrealLogViewerView3.focus').then(() => {
				console.log('Unreal Log Viewer view focused (should be in panel).');
			}, (err) => {
				console.error('Error focusing Unreal Log Viewer view (unrealLogViewerView3.focus):', err);
				vscode.window.showErrorMessage('Failed to focus Unreal Log Viewer (unrealLogViewerView3).');
			});
		})
	);

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (unrealLogViewerProviderInstance) {
			if (event.affectsConfiguration('unrealLogViewer.serverPort')) {
				vscode.window.showInformationMessage('Unreal Log Viewer: Server port setting changed. Run "Unreal Log Viewer: Apply Server Port Change" to apply.');
			}
			// Handle timestamp and date format changes
			if (event.affectsConfiguration('unrealLogViewer.useRelativeTimestamps')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.useRelativeTimestamps');
			}
			if (event.affectsConfiguration('unrealLogViewer.timestampFormat')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.timestampFormat');
			}
			// Handle webview appearance changes by calling the provider's central handler
			if (event.affectsConfiguration('unrealLogViewer.logTableFontSize')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.logTableFontSize');
			}
			if (event.affectsConfiguration('unrealLogViewer.useLogLevelColors')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.useLogLevelColors');
			}
			if (event.affectsConfiguration('unrealLogViewer.showGridLines')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.showGridLines');
			}
			if (event.affectsConfiguration('unrealLogViewer.logTableFontFamily')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.logTableFontFamily');
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.showLogsAsText', () => {
		vscode.workspace.openTextDocument(LOG_TEXT_URI).then(doc => {
			vscode.window.showTextDocument(doc, { preview: false });
		}, err => {
			vscode.window.showErrorMessage(`Failed to open text logs: ${err}`);
			outputChannel?.appendLine(`Error opening text log document: ${err}`);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.applyServerPortChange', () => {
		const config = vscode.workspace.getConfiguration('unrealLogViewer');
		const newPort = config.get<number>('serverPort', 9876);
		outputChannel?.appendLine(`Command executed. Applying new port: ${newPort}`);
		logServerManager?.restart(newPort);
		vscode.window.showInformationMessage(`Unreal Log Viewer: Server is now attempting to listen on port ${newPort}.`);
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.getDisplayedLogMessagesForTest', () => {
		if (unrealLogViewerProviderInstance) {
			return unrealLogViewerProviderInstance.getDisplayedLogEntriesForTest();
		}
		return [];
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.setFiltersForTest', (filters: { levelFilter?: string; categoryFilter?: string; messageFilter?: string }) => { // Corrected parameter names to match Filters interface
		if (unrealLogViewerProviderInstance) {
			unrealLogViewerProviderInstance.setFiltersForTest(filters);
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.togglePauseForTest', () => {
		if (unrealLogViewerProviderInstance) {
			unrealLogViewerProviderInstance.togglePauseStateForTest();
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.getPauseStateForTest', () => {
		if (unrealLogViewerProviderInstance) {
			return unrealLogViewerProviderInstance.getPauseStateForTest();
		}
		return false;
	}));

	// Register commands for title bar actions
	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.titleBarClear', () => {
		if (unrealLogViewerProviderInstance) {
			unrealLogViewerProviderInstance.clearLogs();
			outputChannel?.appendLine('Logs cleared via title bar button.');
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.titleBarCopilotView', () => {
		vscode.workspace.openTextDocument(LOG_TEXT_URI).then(doc => {
			vscode.window.showTextDocument(doc, { preview: false });
		}, err => {
			vscode.window.showErrorMessage(`Failed to open text logs: ${err}`);
			outputChannel?.appendLine(`Error opening text log document via title bar: ${err}`);
		});
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.titleBarPauseLogs', () => {
		if (unrealLogViewerProviderInstance && !unrealLogViewerProviderInstance.paused) {
			unrealLogViewerProviderInstance.togglePauseState();
			vscode.commands.executeCommand('setContext', 'unrealLogViewerIsPaused', true);
			outputChannel?.appendLine('Logs paused via title bar button.');

			// Update log count status when pausing, as displayed count might change
			const total = provider.getTotalLogCount();
			const displayed = provider.getDisplayedLogCount();
			if (total > 0 || displayed > 0) { // Show if either is > 0
				logCountStatusItem.text = `Displayed: ${displayed} / Total: ${total}`;
				logCountStatusItem.show();
			} else {
				logCountStatusItem.hide();
			}

			// Show temporary notification
			vscode.window.withProgress({
				location: vscode.ProgressLocation.Notification,
				title: "Log Tailing Paused",
				cancellable: false
			}, (progress) => {
				progress.report({ message: "Press the Play button to resume." });
				return new Promise(resolve => {
					setTimeout(() => {
						resolve(undefined);
					}, 4000); // Notification disappears after 4 seconds
				});
			});
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.titleBarResumeLogs', () => {
		if (unrealLogViewerProviderInstance && unrealLogViewerProviderInstance.paused) {
			unrealLogViewerProviderInstance.togglePauseState();
			vscode.commands.executeCommand('setContext', 'unrealLogViewerIsPaused', false);
			outputChannel?.appendLine('Logs resumed via title bar button.');

			// Refresh the text log view if it was paused
			if (logTextContentProviderInstance) {
				logTextContentProviderInstance.refresh();
			}
			// Update log count status when resuming
			const total = provider.getTotalLogCount();
			const displayed = provider.getDisplayedLogCount();
			if (total > 0 || displayed > 0) { // Show if either is > 0
				logCountStatusItem.text = `Displayed: ${displayed} / Total: ${total}`;
				logCountStatusItem.show();
			} else {
				logCountStatusItem.hide();
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.toggleFilterBarVisibility', () => {
		if (unrealLogViewerProviderInstance) {
			unrealLogViewerProviderInstance.toggleFilterBarVisibility();
		}
	}));

	// Set initial context for the pause button icon and status bar item
	if (unrealLogViewerProviderInstance) {
		const initialPauseState = unrealLogViewerProviderInstance.paused;
		vscode.commands.executeCommand('setContext', 'unrealLogViewerIsPaused', initialPauseState);
	}

	// Register commands for test automation
	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.getWebviewElementsBySelectorForTest', async (selector: string) => {
		if (unrealLogViewerProviderInstance) {
			return await unrealLogViewerProviderInstance.getWebviewElementsBySelector(selector);
		}
		outputChannel?.appendLine('Warning: getWebviewElementsBySelectorForTest called but provider not available.');
		return []; // Or throw an error if preferred
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.clickWebviewElementForTest', async (elementId: string) => {
		if (unrealLogViewerProviderInstance) {
			return await unrealLogViewerProviderInstance.clickWebviewElement(elementId);
		}
		outputChannel?.appendLine('Warning: clickWebviewElementForTest called but provider not available.');
		return false; // Or throw an error if preferred
	}));
}

export function deactivate() {
	console.log('UNREAL LOG VIEWER: deactivate called');
	outputChannel?.appendLine('Unreal Log Viewer extension deactivating...');

	if (logServerManager) {
		logServerManager.stop(() => {
			console.log('UNREAL LOG VIEWER: LogServerManager stopped on deactivation.');
			outputChannel?.appendLine('LogServerManager stopped on deactivation.');
		});
		logServerManager = undefined;
	}

	if (outputChannel) {
		outputChannel.dispose();
	}
	unrealLogViewerProviderInstance = undefined;
	logTextContentProviderInstance = undefined;
	if (logCountStatusItem) {
		logCountStatusItem.dispose();
	}
	console.log('UNREAL LOG VIEWER: Deactivation complete.');
}
