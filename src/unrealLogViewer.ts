import * as vscode from 'vscode';
import * as net from 'net';
import * as fs from 'fs'; // Added for reading HTML file

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
			const logs = unrealLogViewerProviderInstance.getRawLogs();
			const config = vscode.workspace.getConfiguration('unrealLogViewer');
			const copilotLogLimit = config.get<number>('copilotLogExportLimit', 1000);
			const startIndex = Math.max(0, logs.length - copilotLogLimit);
			const logsToExport = logs.slice(startIndex);
			// Format logs: one entry per line: "ISO_DATE LEVEL CATEGORY MESSAGE"
			return logsToExport.map(log => `${log.date} [${log.level}] [${log.category}] ${log.message}`).join('\n');
		}
		return '';
	}

	refresh(uri: vscode.Uri) {
		this._onDidChangeEmitter.fire(uri);
	}
}

class UnrealLogViewerProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = 'unrealLogViewerView2';
	private static readonly LOG_LEVEL_ORDER = ["VERYVERBOSE", "VERBOSE", "LOG", "DISPLAY", "WARNING", "ERROR", "FATAL"]; // New
	private static readonly LEVEL_FILTER_KEY = 'levelFilter';
	private static readonly CATEGORY_FILTER_KEY = 'categoryFilter';
	private static readonly MESSAGE_FILTER_KEY = 'messageFilter'; // New
	private _view?: vscode.WebviewView;
	private logs: { date: string; level: string; category: string; message: string }[] = [];
	private levelFilter: string;
	private categoryFilter: string;
	private messageFilter: string; // New
	private lastClearTime: Date = new Date(); // For relative timestamps

	constructor(private readonly context: vscode.ExtensionContext) {
		// Load persisted filters on initialization
		this.levelFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.LEVEL_FILTER_KEY, '');
		this.categoryFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, '');
		this.messageFilter = this.context.workspaceState.get<string>(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, ''); // New
	}

	public getRawLogs(): { date: string; level: string; category: string; message: string }[] { // Added
		return this.logs;
	}

	public resolveWebviewView(
		view: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		console.log('UNREAL LOG VIEWER: resolveWebviewView called for', UnrealLogViewerProvider.viewType);
		this._view = view;
		view.webview.options = {
			enableScripts: true,
			localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
		};

		view.webview.html = this._getInitialWebviewHtml(view.webview); // Pass webview object

		// Send initially loaded/persisted filters to the webview
		view.webview.postMessage({
			command: 'updateFilterInputs',
			levelFilter: this.levelFilter,
			categoryFilter: this.categoryFilter,
			messageFilter: this.messageFilter // New
		});

		// Send initial font size
		const initialFontSize = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontSize', 'var(--vscode-font-size)');
		view.webview.postMessage({ command: 'updateFontSize', fontSize: initialFontSize });

		// Send initial color mode
		const initialUseColors = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('useLogLevelColors', true);
		view.webview.postMessage({ command: 'updateColorMode', useColors: initialUseColors });

		// Send initial grid lines visibility
		const initialShowGridLines = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('showGridLines', false);
		view.webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines: initialShowGridLines });

		// Send initial font family
		const initialFontFamily = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontFamily', 'var(--vscode-font-family)');
		view.webview.postMessage({ command: 'updateFontFamily', fontFamily: initialFontFamily });

		view.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'applyFilters':
						this.levelFilter = message.levelFilter?.trim() || '';
						this.categoryFilter = message.categoryFilter?.trim() || '';
						this.messageFilter = message.messageFilter?.trim() || ''; // New
						// Save filters to workspace state
						this.context.workspaceState.update(UnrealLogViewerProvider.LEVEL_FILTER_KEY, this.levelFilter);
						this.context.workspaceState.update(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, this.categoryFilter);
						this.context.workspaceState.update(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, this.messageFilter); // New
						this._sendFilteredLogsToWebview();
						return;
					case 'getInitialLogs': // Webview requests initial logs after loading
						this._sendFilteredLogsToWebview();
						return;
					case 'webviewClearButtonPressed': // Renamed from clearDisplayedLogs
						this.handleWebviewClear(); // Call new handler
						return;
				}
			},
			undefined,
			this.context.subscriptions
		);
		this._updateCountsInWebview(); // Send initial counts
	}

	public requestLogRefresh(): void {
		this._sendFilteredLogsToWebview();
	}

	public updateWebviewFontSize(fontSize: string): void {
		if (this._view) {
			this._view.webview.postMessage({ command: 'updateFontSize', fontSize });
		}
	}

	public updateWebviewColorMode(useColors: boolean): void {
		if (this._view) {
			this._view.webview.postMessage({ command: 'updateColorMode', useColors });
		}
	}

	public updateWebviewGridLinesVisibility(showGridLines: boolean): void {
		if (this._view) {
			this._view.webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines });
		}
	}

	public updateWebviewFontFamily(fontFamily: string): void { // New method
		if (this._view) {
			this._view.webview.postMessage({ command: 'updateFontFamily', fontFamily });
		}
	}

	private _formatDate(originalDateString: string): string {
		const config = vscode.workspace.getConfiguration('unrealLogViewer');
		const useRelative = config.get<boolean>('useRelativeTimestamps', false);
		const logDate = new Date(originalDateString);

		if (useRelative) {
			let diffMs = logDate.getTime() - this.lastClearTime.getTime();
			diffMs = Math.max(0, diffMs); // Ensure the difference is not negative

			const milliseconds = (diffMs % 1000).toString().padStart(3, '0');
			const totalSeconds = Math.floor(diffMs / 1000);
			const seconds = (totalSeconds % 60).toString().padStart(2, '0');
			const totalMinutes = Math.floor(totalSeconds / 60);
			const minutes = (totalMinutes % 60).toString().padStart(2, '0');
			const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');

			return `+${hours}:${minutes}:${seconds}.${milliseconds}`;
		} else {
			// Return in a more readable default format if not relative, e.g., HH:MM:SS.ms
			const h = logDate.getHours().toString().padStart(2, '0');
			const m = logDate.getMinutes().toString().padStart(2, '0');
			const s = logDate.getSeconds().toString().padStart(2, '0');
			const ms = logDate.getMilliseconds().toString().padStart(3, '0');
			return `${h}:${m}:${s}.${ms}`;
		}
	}

	private _passesFilters(log: { date: string; level: string; category: string; message: string }): boolean {
		let passesLevelFilter = true;
		const currentLevelFilter = this.levelFilter.trim();

		if (currentLevelFilter) {
			const logLev = (typeof log.level === 'string' ? log.level.trim() : '').toUpperCase(); // Modified line
			const filterTerms = currentLevelFilter.split(',').map(term => term.trim()).filter(term => term !== '');

			const exclusiveLevels = filterTerms
				.filter(term => term.startsWith('!'))
				.map(term => term.substring(1).toUpperCase())
				.filter(term => term !== '');

			const inclusiveLevels = filterTerms
				.filter(term => !term.startsWith('!'))
				.map(term => term.toUpperCase())
				.filter(term => term !== '');

			// Check exclusions first
			if (exclusiveLevels.length > 0) {
				for (const excLevel of exclusiveLevels) {
					// Exact match for exclusion, as levels are discrete
					if (logLev === excLevel) {
						passesLevelFilter = false;
						break;
					}
				}
			}

			// If not excluded and inclusive filters exist, it must match at least one
			if (passesLevelFilter && inclusiveLevels.length > 0) {
				let matchesInclusive = false;
				for (const incLevel of inclusiveLevels) {
					if (incLevel.startsWith('>')) {
						const targetLevelName = incLevel.substring(1);
						const targetLevelIndex = UnrealLogViewerProvider.LOG_LEVEL_ORDER.indexOf(targetLevelName);
						const logLevelIndex = UnrealLogViewerProvider.LOG_LEVEL_ORDER.indexOf(logLev);
						if (targetLevelIndex !== -1 && logLevelIndex !== -1 && logLevelIndex >= targetLevelIndex) {
							matchesInclusive = true;
							break;
						}
					} else {
						// Exact match for inclusion if not using '>', as levels are discrete
						if (logLev === incLevel) {
							matchesInclusive = true;
							break;
						}
					}
				}
				passesLevelFilter = matchesInclusive;
			} else if (passesLevelFilter && inclusiveLevels.length === 0 && exclusiveLevels.length > 0) {
				// Only exclusions were specified, and we didn't match any, so it passes.
				passesLevelFilter = true;
			} else if (inclusiveLevels.length === 0 && exclusiveLevels.length === 0) {
				// Filter was present but contained only commas or invalid terms
				passesLevelFilter = true; // Or false, depending on desired behavior for empty/invalid filters
			}

		}

		let passesCategoryFilter = true;
		const currentCategoryFilter = this.categoryFilter.trim();
		if (currentCategoryFilter) {
			const logCategoryUpper = log.category.toUpperCase();
			const filterTerms = currentCategoryFilter.split(',').map(term => term.trim()).filter(term => term !== '');

			const exclusiveCategories = filterTerms
				.filter(term => term.startsWith('!'))
				.map(term => term.substring(1).toUpperCase())
				.filter(term => term !== ''); // Ensure no empty strings after '!'

			const inclusiveCategories = filterTerms
				.filter(term => !term.startsWith('!'))
				.map(term => term.toUpperCase())
				.filter(term => term !== ''); // Ensure no empty strings

			// Check exclusions first
			if (exclusiveCategories.length > 0) {
				for (const excCat of exclusiveCategories) {
					if (logCategoryUpper.includes(excCat)) {
						passesCategoryFilter = false;
						break;
					}
				}
			}

			// If not excluded and inclusive filters exist, it must match at least one
			if (passesCategoryFilter && inclusiveCategories.length > 0) {
				let matchesInclusive = false;
				for (const incCat of inclusiveCategories) {
					if (logCategoryUpper.includes(incCat)) {
						matchesInclusive = true;
						break;
					}
				}
				passesCategoryFilter = matchesInclusive;
			}
			// If inclusiveCategories is empty and it wasn't excluded, it passes.
			// If both are empty (e.g. filter was just ","), it passes.
		}

		let passesMessageFilter = true; // New
		const currentMessageFilter = this.messageFilter.trim(); // New
		if (currentMessageFilter) { // New
			const logMessageUpper = log.message.toUpperCase(); // New
			const filterTerms = currentMessageFilter.split(',').map(term => term.trim()).filter(term => term !== ''); // New

			const exclusiveMessages = filterTerms // New
				.filter(term => term.startsWith('!')) // New
				.map(term => term.substring(1).toUpperCase()) // New
				.filter(term => term !== ''); // New

			const inclusiveMessages = filterTerms // New
				.filter(term => !term.startsWith('!')) // New
				.map(term => term.toUpperCase()) // New
				.filter(term => term !== ''); // New

			// Check exclusions first for messages // New
			if (exclusiveMessages.length > 0) { // New
				for (const excMsg of exclusiveMessages) { // New
					if (logMessageUpper.includes(excMsg)) { // New
						passesMessageFilter = false; // New
						break; // New
					}
				}
			}

			// If not excluded and inclusive filters exist, it must match at least one for messages // New
			if (passesMessageFilter && inclusiveMessages.length > 0) { // New
				let matchesInclusive = false; // New
				for (const incMsg of inclusiveMessages) { // New
					if (logMessageUpper.includes(incMsg)) { // New
						matchesInclusive = true; // New
						break; // New
					}
				}
				passesMessageFilter = matchesInclusive; // New
			}
		}

		return passesLevelFilter && passesCategoryFilter && passesMessageFilter; // Updated
	}

	public addLog(log: { date: string; level: string; category: string; message: string }) {
		const config = vscode.workspace.getConfiguration('unrealLogViewer');
		const maxLogsSetting = config.get<number>('maxLogMessages', 10000);
		const minAllowedLogs = 100; // As per package.json minimum
		const effectiveMaxLogs = Math.max(maxLogsSetting, minAllowedLogs);

		let pruned = false;
		let prunedCount = 0;

		// Pruning logic BEFORE adding the new log to the main list IF NECESSARY
		// This is a slight shift: decide if pruning is needed based on current count + 1
		if (this.logs.length + 1 > effectiveMaxLogs) {
			const numToPrune = Math.max(1, Math.floor(effectiveMaxLogs * 0.1));
			// Ensure we don't try to prune more than available, though splice handles this gracefully.
			const actualPruned = this.logs.splice(0, numToPrune);
			prunedCount = actualPruned.length;
			pruned = prunedCount > 0;
		}

		this.logs.push(log); // Add the new incoming log
		if (logTextContentProvider) { logTextContentProvider.refresh(LOG_TEXT_URI); } // Added

		if (pruned && this._view) {
			// Send command to webview to remove rows from the top
			this._view.webview.postMessage({ command: 'removeOldestLogs', count: prunedCount });

			// Add the internal "pruned" message to the log array AFTER actual pruning and new log addition
			const pruneLogEntry = {
				date: new Date().toISOString(),
				level: 'WARNING',
				category: 'LogViewerInternal',
				message: `Pruned ${prunedCount} oldest log message(s) to maintain max limit of ${effectiveMaxLogs}.`
			};
			this.logs.push(pruneLogEntry);
			if (logTextContentProvider) { logTextContentProvider.refresh(LOG_TEXT_URI); } // Added

			// Now, send the prune message to the webview if it passes filters
			// Note: _passesFilters uses this.levelFilter and this.categoryFilter which are current
			if (this._passesFilters(pruneLogEntry)) {
				this._view.webview.postMessage({ 
					command: 'addLogEntry', 
					logEntry: { ...pruneLogEntry, date: this._formatDate(pruneLogEntry.date) }
				});
			}
		}

		if (this._view) {
			// Send the new incoming log (that triggered this addLog call)
			if (this._passesFilters(log)) {
				this._view.webview.postMessage({ 
					command: 'addLogEntry', 
					logEntry: { ...log, date: this._formatDate(log.date) } 
				});
			}
			this._updateCountsInWebview(); // Update counts after all modifications
		} else {
			// If view is not visible, and pruning happened, we still need to add the prune message to the logs array
			if (pruned) {
				const pruneLogEntry = {
					date: new Date().toISOString(),
					level: 'WARNING',
					category: 'LogViewerInternal',
					message: `Pruned ${prunedCount} oldest log message(s) to maintain max limit of ${effectiveMaxLogs}.`
				};
				this.logs.push(pruneLogEntry);
				if (logTextContentProvider) { logTextContentProvider.refresh(LOG_TEXT_URI); } // Added
			}
		}
	}

	public clearLogs() {
		this.logs = [];
		if (logTextContentProvider) { logTextContentProvider.refresh(LOG_TEXT_URI); } // Added
		this.levelFilter = '';
		this.categoryFilter = '';
		this.messageFilter = ''; // New
		this.lastClearTime = new Date(); // Reset timestamp baseline

		// Clear persisted filters
		this.context.workspaceState.update(UnrealLogViewerProvider.LEVEL_FILTER_KEY, undefined);
		this.context.workspaceState.update(UnrealLogViewerProvider.CATEGORY_FILTER_KEY, undefined);
		this.context.workspaceState.update(UnrealLogViewerProvider.MESSAGE_FILTER_KEY, undefined); // New

		if (this._view) {
			this._view.webview.postMessage({ command: 'setLogs', logs: [] });
			this._view.webview.postMessage({ command: 'updateFilterInputs', levelFilter: '', categoryFilter: '', messageFilter: '' }); // New
			this._updateCountsInWebview(); // Update counts
		}
	}

	private handleWebviewClear(): void {
		this.logs = []; // Clear all stored logs
		if (logTextContentProvider) { logTextContentProvider.refresh(LOG_TEXT_URI); } // Added
		this.lastClearTime = new Date(); // Reset timestamp baseline for relative timestamps

		if (this._view) {
			// Tell webview to clear its display
			this._view.webview.postMessage({ command: 'setLogs', logs: [] });
			
			// Update counts: shown and total will now both be 0 because this.logs is empty
			this._updateCountsInWebview();
		}
		// Filters (UI and persisted) are NOT cleared here.
	}

	private _sendFilteredLogsToWebview() {
		if (!this._view) { return; }

		// Filter logs based on original data, then map and format dates for display
		const filteredAndFormattedLogs = this.logs
			.filter(log => this._passesFilters(log)) // Use original log for filtering
			.map(log => ({ // Format date for display
				...log,
				date: this._formatDate(log.date)
			}));

		this._view.webview.postMessage({ command: 'setLogs', logs: filteredAndFormattedLogs });
		this._updateCountsInWebview();
	}

	private _updateCountsInWebview() {
		if (!this._view) { return; }
		const total = this.logs.length;
		const shown = this.logs.filter(log => this._passesFilters(log)).length;
		this._view.webview.postMessage({ command: 'updateCounts', shown, total });
	}

	private _getInitialWebviewHtml(_webview: vscode.Webview): string { // Renamed webview to _webview
		const webviewHtmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'src', 'webviewContent.html');
		const htmlContent = fs.readFileSync(webviewHtmlPath.fsPath, 'utf8'); // Changed let to const

		// Note: If you need to inject dynamic values like nonces for Content Security Policy
		// or webview URIs for local resources, you would do it here.
		// For example:
		//
		// 1. Generate a nonce:
		// const nonce = getNonce(); // You'd need to define getNonce()
		//
		// 2. Replace placeholders in your HTML:
		// htmlContent = htmlContent.replace(new RegExp('{{nonce}}', 'g'), nonce);
		// htmlContent = htmlContent.replace(new RegExp('{{cspSource}}', 'g'), _webview.cspSource);
		//
		// 3. For local resources (e.g., scripts/styles in a 'media' folder):
		// const scriptUri = _webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'main.js'));
		// const styleUri = _webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'styles.css'));
		// htmlContent = htmlContent.replace(new RegExp('{{scriptUri}}', 'g'), scriptUri.toString());
		// htmlContent = htmlContent.replace(new RegExp('{{styleUri}}', 'g'), styleUri.toString());
		//
		// Your webviewContent.html would then need corresponding placeholders like:
		// <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-{{nonce}}'; style-src {{cspSource}} {{styleUri}};">
		// <script nonce="{{nonce}}" src="{{scriptUri}}"></script>
		// <link rel="stylesheet" type="text/css" href="{{styleUri}}">

		return htmlContent;
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
				let index;
				while ((index = buffer.indexOf('\n')) !== -1) {
					const line = buffer.slice(0, index).trim();
					buffer = buffer.slice(index + 1);
					if (line) {
						try {
							const log = JSON.parse(line);
							if (unrealLogViewerProviderInstance) {
								unrealLogViewerProviderInstance.addLog(log);
							} else {
								console.error("UNREAL LOG VIEWER: Provider instance not available to add log.");
								outputChannel?.appendLine("Error: Log provider not available.");
							}
						} catch (e) {
							const errorMessage = e instanceof Error ? e.message : String(e);
							outputChannel?.appendLine(`Invalid JSON: ${line} (Error: ${errorMessage})`);
						}
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
			// This sequence ensures the container is visible, then focuses the specific view.
			vscode.commands.executeCommand('workbench.view.extension.unrealLogViewerContainer').then(() => {
				vscode.commands.executeCommand(`workbench.view.${UnrealLogViewerProvider.viewType}`).then(() => {
					console.log(`Focus command for ${UnrealLogViewerProvider.viewType} executed.`);
				}, (err) => { // Added error handling for inner .then
					console.error(`Error focusing view ${UnrealLogViewerProvider.viewType}:`, err);
					vscode.window.showErrorMessage(`Failed to focus Unreal Log Viewer: ${UnrealLogViewerProvider.viewType}`);
				}); // Added closing for inner .then
			}, (containerErr) => { // Added error handling for outer .then
				console.error('Error opening Unreal Log Viewer container:', containerErr);
				vscode.window.showErrorMessage('Failed to open Unreal Log Viewer container.');
			}); // Added closing for outer .then
		}) // Added closing for registerCommand callback
	); // Added closing for context.subscriptions.push

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
		if (event.affectsConfiguration('unrealLogViewer.serverPort')) {
			vscode.window.showInformationMessage('Unreal Log Viewer: Server port setting changed. Run "Unreal Log Viewer: Apply Server Port Change" to apply.');
		}
		if (event.affectsConfiguration('unrealLogViewer.useRelativeTimestamps')) {
			// If the timestamp format setting changes, re-send logs to update display
			provider.requestLogRefresh(); // Changed to use a public method on provider
		}
		if (event.affectsConfiguration('unrealLogViewer.logTableFontSize')) {
			const newFontSize = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontSize', 'var(--vscode-font-size)');
			provider.updateWebviewFontSize(newFontSize);
		}
		if (event.affectsConfiguration('unrealLogViewer.useLogLevelColors')) {
			const useColors = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('useLogLevelColors', true);
			provider.updateWebviewColorMode(useColors);
		}
		if (event.affectsConfiguration('unrealLogViewer.showGridLines')) {
			const showGridLines = vscode.workspace.getConfiguration('unrealLogViewer').get<boolean>('showGridLines', false);
			provider.updateWebviewGridLinesVisibility(showGridLines);
		}
		if (event.affectsConfiguration('unrealLogViewer.logTableFontFamily')) { // New configuration change handler
			const newFontFamily = vscode.workspace.getConfiguration('unrealLogViewer').get<string>('logTableFontFamily', 'var(--vscode-font-family)');
			provider.updateWebviewFontFamily(newFontFamily);
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
