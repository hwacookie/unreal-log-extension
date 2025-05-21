import * as vscode from 'vscode';
import * as net from 'net';
import { UnrealLogEntry } from './logTypes';
import { UnrealLogViewerProvider } from './UnrealLogViewerProvider';

let server: net.Server | undefined;
let outputChannel: vscode.OutputChannel | undefined;
const activeConnections = new Set<net.Socket>(); // Changed to const and added <net.Socket>
let isServerRestarting = false; // Removed type annotation
let unrealLogViewerProviderInstance: UnrealLogViewerProvider | undefined;
let logTextContentProvider: UnrealLogTextDocumentContentProvider | undefined; // Added
const LOG_TEXT_URI = vscode.Uri.parse('unreal-log-text:current-logs.log'); // Added

class UnrealLogTextDocumentContentProvider implements vscode.TextDocumentContentProvider { // Added 
	static readonly scheme = 'unreal-log-text';
	private _onDidChangeEmitter = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChangeEmitter.event;

	provideTextDocumentContent(uri: vscode.Uri): string {
		if (uri.toString() === LOG_TEXT_URI.toString() && unrealLogViewerProviderInstance) {
			const rawLogs = unrealLogViewerProviderInstance.getRawLogs();
			const filteredLogs = rawLogs.filter(log => unrealLogViewerProviderInstance!._passesFilters(log)); // Apply filters first

			const config = vscode.workspace.getConfiguration('unrealLogViewer');
			const copilotLogLimit = config.get<number>('copilotLogExportLimit', 1000);
			
			const startIndex = Math.max(0, filteredLogs.length - copilotLogLimit);
			const logsToExport = filteredLogs.slice(startIndex);
			
			// Format logs: one entry per line: "ISO_DATE LEVEL CATEGORY MESSAGE"
			return logsToExport.map(log => `${log.date} [${log.level}] [${log.category}] ${log.message}`).join('\n');
		}
		return '';
	}

	refresh(uri: vscode.Uri) {
		this._onDidChangeEmitter.fire(uri);
	}
}

export function activate(context: vscode.ExtensionContext) {
	console.log('UNREAL LOG VIEWER: activate called');

	if (!outputChannel) { // Ensure outputChannel is initialized early
		outputChannel = vscode.window.createOutputChannel('Unreal Log Viewer');
	}

	const provider = new UnrealLogViewerProvider(context);
	unrealLogViewerProviderInstance = provider; // Assign to module-level variable

	logTextContentProvider = new UnrealLogTextDocumentContentProvider(); // Added
	// Set up Copilot/text view refresh on logs cleared
	provider.onLogsCleared = () => {
		if (logTextContentProvider) {
			logTextContentProvider.refresh(LOG_TEXT_URI);
		}
	};
	context.subscriptions.push( // Added
		vscode.workspace.registerTextDocumentContentProvider(UnrealLogTextDocumentContentProvider.scheme, logTextContentProvider)
	);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(UnrealLogViewerProvider.viewType, provider)
	);
	console.log('Unreal Log Viewer Webview Provider registered.');
	
	function createAndListenServer(port: number) {
		if (isServerRestarting) {
			vscode.window.showWarningMessage('Server restart is already in progress. Please wait.');
			outputChannel?.appendLine('Attempted to change server port while a restart was already in progress.');
			return;
		}
		isServerRestarting = true; // Set the flag

		if (server) {
			const currentPortInfo = server.address();
			const currentPort = currentPortInfo && typeof currentPortInfo === 'object' ? currentPortInfo.port : 'unknown';
			outputChannel?.appendLine(`Shutting down server on port ${currentPort} to switch to port ${port}.`);

			// Destroy all active connections
			if (activeConnections.size > 0) {
				outputChannel?.appendLine(`Closing ${activeConnections.size} active connection(s).`);
				for (const socket of activeConnections) {
					socket.destroy(); // Forcefully close client connections
				}
				activeConnections.clear(); // Sockets will emit 'close', but clear immediately for safety
			} else {
				outputChannel?.appendLine('No active connections to close.');
			}

			const serverToClose = server; // Capture the current server instance to close it.
			// server = undefined; // Don't nullify global server yet, wait for close.

			serverToClose.close((err?: Error) => {
				if (err) {
					console.error('UNREAL LOG VIEWER: Error closing previous server:', err);
					outputChannel?.appendLine(`Error closing previous server: ${err.message}`);
				} else {
					console.log('UNREAL LOG VIEWER: Previous server closed successfully.');
					outputChannel?.appendLine('Previous server closed successfully.');
				}

				// Ensure the global 'server' variable doesn't point to the old instance.
				if (server === serverToClose) {
					server = undefined;
				}
				startNewServer(port); // This will attempt to start the new server and reset isServerRestarting.
			});
		} else {
			outputChannel?.appendLine('No existing server found. Starting new server on port ' + port);
			startNewServer(port); // This will attempt to start and reset isServerRestarting.
		}
	}

	function startNewServer(port: number) {
		// Note: isServerRestarting is true when this function is called.
		// It must be reset to false once the server is listening or fails to listen.

		const newServerInstance = net.createServer(socket => {
			outputChannel?.appendLine(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
			activeConnections.add(socket);
			socket.on('close', () => {
				outputChannel?.appendLine(`Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
				activeConnections.delete(socket);
			});
			socket.on('error', (socketErr) => {
				outputChannel?.appendLine(`Socket error from ${socket.remoteAddress}:${socket.remotePort}: ${socketErr.message}`);
				activeConnections.delete(socket); // Ensure removal on error too
			});

			let buffer = '';
			socket.on('data', data => {
				buffer += data.toString();
				let startIdx = buffer.indexOf('{');
				while (startIdx !== -1) {
					let braceCount = 0;
					let inString = false;
					let escape = false;
					let endIdx = -1;
					for (let i = startIdx; i < buffer.length; i++) {
						const char = buffer[i];
						if (inString) {
							if (escape) {
								escape = false;
							} else if (char === '\\') {
								escape = true;
							} else if (char === '"') {
								inString = false;
							}
						} else {
							if (char === '"') {
								inString = true;
							} else if (char === '{') {
								braceCount++;
							} else if (char === '}') {
								braceCount--;
								if (braceCount === 0) {
									endIdx = i;
									break;
								}
							}
						}
					}
					if (endIdx !== -1) {
						const jsonStr = buffer.slice(startIdx, endIdx + 1);
						buffer = buffer.slice(endIdx + 1);
						try {
							const log: UnrealLogEntry = JSON.parse(jsonStr); // Updated type
							// Always collect logs, but only update the view if not paused
							if (unrealLogViewerProviderInstance) {
								unrealLogViewerProviderInstance.addLog(log);
								if (!unrealLogViewerProviderInstance.paused && logTextContentProvider) {
									logTextContentProvider.refresh(LOG_TEXT_URI);
								}
							}
						} catch (e) {
							const errorMessage = e instanceof Error ? e.message : String(e);
							outputChannel?.appendLine(`Invalid JSON: ${jsonStr} (Error: ${errorMessage})`);
						}
						startIdx = buffer.indexOf('{');
					} else {
						// Wait for more data
						break;
					}
				}
			});
		});

		newServerInstance.on('error', (serverErr: Error & { code?: string }) => {
			outputChannel?.appendLine(`Server error on port ${port}: ${serverErr.message}`);
			vscode.window.showErrorMessage(`Unreal Log Viewer server error on port ${port}: ${serverErr.message}`);
			if (serverErr.code === 'EADDRINUSE') {
				vscode.window.showErrorMessage(`Port ${port} is already in use. Please choose a different port.`);
			}
			// If this new server failed to start, the global 'server' should be undefined
			// (it was set to undefined in createAndListenServer's close callback, or was already undefined).
			if (server === newServerInstance) { // Should not happen if assignment is only on listen
				server = undefined;
			}
			isServerRestarting = false; // Reset flag on failure
		});

		newServerInstance.listen(port, () => {
			outputChannel?.appendLine(`Unreal Log Viewer server listening on port ${port}`);
			console.log(`UNREAL LOG VIEWER: Server listening on port ${port}`);
			server = newServerInstance; // Assign to global server variable *only on successful listen*
			isServerRestarting = false; // Reset flag on success
		});
	}

	const initialConfig = vscode.workspace.getConfiguration('unrealLogViewer');
	const initialPort = initialConfig.get<number>('serverPort', 9876);
	createAndListenServer(initialPort);

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.clear', () => {
		provider.clearLogs();
		outputChannel?.appendLine('Logs cleared.');
	}));

	context.subscriptions.push(
		vscode.commands.registerCommand('unrealLogViewer.create', () => {
			console.log('Unreal Log Viewer: create command invoked.');
			// This sequence ensures the container is visible.
			vscode.commands.executeCommand('workbench.view.extension.unrealLogViewerContainer').then(() => {
				vscode.commands.executeCommand('unrealLogViewerView3.focus');
				console.log('Unreal Log Viewer container shown.');
			}, (containerErr) => { // Added error handling for outer .then
				console.error('Error opening Unreal Log Viewer container:', containerErr);
				vscode.window.showErrorMessage('Failed to open Unreal Log Viewer container.');
			}); // Added closing for outer .then
		}) // Added closing for registerCommand callback
	); // Added closing for context.subscriptions.push

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (unrealLogViewerProviderInstance) { // Ensure provider instance exists
			if (event.affectsConfiguration('unrealLogViewer.serverPort')) {
				vscode.window.showInformationMessage('Unreal Log Viewer: Server port setting changed. Run "Unreal Log Viewer: Apply Server Port Change" to apply.');
			}
			if (event.affectsConfiguration('unrealLogViewer.useRelativeTimestamps')) {
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.useRelativeTimestamps');
			}
			if (event.affectsConfiguration('unrealLogViewer.timestampFormat')) { // Added for completeness, though _formatDate might not use it directly for absolute yet
				unrealLogViewerProviderInstance.handleConfigurationChange('unrealLogViewer.timestampFormat');
			}
			if (event.affectsConfiguration('unrealLogViewer.logTableFontSize')) {
				const newFontSize = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontSize', 'var(--vscode-font-size)');
				unrealLogViewerProviderInstance.updateWebviewFontSize(newFontSize);
			}
			if (event.affectsConfiguration('unrealLogViewer.useLogLevelColors')) {
				const useColors = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('useLogLevelColors', true);
				unrealLogViewerProviderInstance.updateWebviewColorMode(useColors);
			}
			if (event.affectsConfiguration('unrealLogViewer.showGridLines')) {
				const showGridLines = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('showGridLines', false);
				unrealLogViewerProviderInstance.updateWebviewGridLinesVisibility(showGridLines);
			}
			if (event.affectsConfiguration('unrealLogViewer.logTableFontFamily')) {
				const newFontFamily = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontFamily', 'var(--vscode-font-family)');
				unrealLogViewerProviderInstance.updateWebviewFontFamily(newFontFamily);
			}
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.showLogsAsText', () => { // Added
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
		createAndListenServer(newPort);
		vscode.window.showInformationMessage(`Unreal Log Viewer: Server is now attempting to listen on port ${newPort}.`);
	}));

	// The 'unrealLogViewer.refreshConfigForTest' command is being removed.
	// context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.refreshConfigForTest', () => {
	// 	// This command is now a no-op as the provider reads config directly.
	// 	// Kept for now to avoid breaking tests that might still call it, though they should be updated.
	// 	console.log('unrealLogViewer.refreshConfigForTest called, but is now a no-op.');
	// }));

	// Command for tests to retrieve displayed logs
	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.getDisplayedLogMessagesForTest', () => {
		if (unrealLogViewerProviderInstance) {
			return unrealLogViewerProviderInstance.getDisplayedLogEntriesForTest();
		}
		return []; // Return empty if provider is not available
	}));

	// Commands for testing filters and pause state
	context.subscriptions.push(vscode.commands.registerCommand('unrealLogViewer.setFiltersForTest', (filters: { level?: string; category?: string; message?: string }) => {
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
		return false; // Default to not paused if provider isn't available
	}));
}

export function deactivate() {
	console.log('UNREAL LOG VIEWER: deactivate called');
	outputChannel?.appendLine('Unreal Log Viewer extension deactivating...');
	isServerRestarting = true; // Prevent new server starts during deactivation, as a precaution

	if (server) {
		const currentPortInfo = server.address();
		const currentPort = currentPortInfo && typeof currentPortInfo === 'object' ? currentPortInfo.port : 'unknown';
		outputChannel?.appendLine(`Closing server on port ${currentPort}.`);
		
		if (activeConnections.size > 0) {
			outputChannel?.appendLine(`Destroying ${activeConnections.size} active connection(s).`);
			for (const socket of activeConnections) {
				socket.destroy();
			}
			activeConnections.clear();
		}

		server.close(() => {
			console.log('UNREAL LOG VIEWER: Server closed on deactivation.');
			outputChannel?.appendLine('Server closed on deactivation.');
		});
		server = undefined;
	} else {
		outputChannel?.appendLine('No active server to close.');
	}

	if (outputChannel) {
		// outputChannel.dispose(); // Consider if this is needed or handled by VS Code
	}
	unrealLogViewerProviderInstance = undefined;
	activeConnections.clear(); // Ensure set is empty
	logTextContentProvider = undefined; // Added
	isServerRestarting = false; // Reset flag
	console.log('UNREAL LOG VIEWER: Deactivation complete.');
}
