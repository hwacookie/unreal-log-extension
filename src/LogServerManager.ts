import * as vscode from 'vscode';
import * as net from 'net';
import { UnrealLogEntry } from './logTypes';

export type AddLogFunction = (log: UnrealLogEntry) => void;
export type RefreshTextLogFunction = () => void;

export class LogServerManager {
    private server: net.Server | undefined;
    private activeConnections = new Set<net.Socket>();
    private isServerRestarting = false;
    private outputChannel: vscode.OutputChannel;
    private addLogCallback: AddLogFunction;
    private refreshTextLogCallback: RefreshTextLogFunction;
    private currentPort: number | undefined;

    constructor(
        outputChannel: vscode.OutputChannel,
        addLogCallback: AddLogFunction,
        refreshTextLogCallback: RefreshTextLogFunction
    ) {
        this.outputChannel = outputChannel;
        this.addLogCallback = addLogCallback;
        this.refreshTextLogCallback = refreshTextLogCallback;
    }

    public getCurrentPort(): number | undefined {
        return this.currentPort;
    }

    public start(port: number): void {
        if (this.isServerRestarting) {
            vscode.window.showWarningMessage('Server start/restart is already in progress. Please wait.');
            this.outputChannel.appendLine('Attempted to start server while a start/restart was already in progress.');
            return;
        }
        if (this.server && this.currentPort === port) {
            vscode.window.showInformationMessage(`Server is already running on port ${port}.`);
            this.outputChannel.appendLine(`Attempted to start server on port ${port}, but it's already running on this port.`);
            return;
        }

        this.isServerRestarting = true;

        if (this.server) {
            this.outputChannel.appendLine(`Shutting down server on port ${this.currentPort} to switch to port ${port}.`);
            this.stopInternal(() => {
                this.startNewServerInstance(port);
            });
        } else {
            this.outputChannel.appendLine('No existing server found. Starting new server on port ' + port);
            this.startNewServerInstance(port);
        }
    }

    private startNewServerInstance(port: number): void {
        const newServerInstance = net.createServer(socket => {
            this.outputChannel.appendLine(`Client connected: ${socket.remoteAddress}:${socket.remotePort}`);
            this.activeConnections.add(socket);
            socket.on('close', () => {
                this.outputChannel.appendLine(`Client disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
                this.activeConnections.delete(socket);
            });
            socket.on('error', (socketErr) => {
                this.outputChannel.appendLine(`Socket error from ${socket.remoteAddress}:${socket.remotePort}: ${socketErr.message}`);
                this.activeConnections.delete(socket);
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
                            const log: UnrealLogEntry = JSON.parse(jsonStr);
                            this.addLogCallback(log);
                            this.refreshTextLogCallback(); // Refresh text log on new data
                        } catch (e) {
                            const errorMessage = e instanceof Error ? e.message : String(e);
                            this.outputChannel.appendLine(`Invalid JSON: ${jsonStr} (Error: ${errorMessage})`);
                        }
                        startIdx = buffer.indexOf('{');
                    } else {
                        break;
                    }
                }
            });
        });

        newServerInstance.on('error', (serverErr: Error & { code?: string }) => {
            this.outputChannel.appendLine(`Server error on port ${port}: ${serverErr.message}`);
            vscode.window.showErrorMessage(`Unreal Log Viewer server error on port ${port}: ${serverErr.message}`);
            if (serverErr.code === 'EADDRINUSE') {
                vscode.window.showErrorMessage(`Port ${port} is already in use. Please choose a different port.`);
            }
            if (this.server === newServerInstance) {
                this.server = undefined;
                this.currentPort = undefined;
            }
            this.isServerRestarting = false;
        });

        newServerInstance.listen(port, () => {
            this.outputChannel.appendLine(`Unreal Log Viewer server listening on port ${port}`);
            console.log(`UNREAL LOG VIEWER: Server listening on port ${port}`);
            this.server = newServerInstance;
            this.currentPort = port;
            this.isServerRestarting = false;
        });
    }

    public stop(callback?: () => void): void {
        this.outputChannel.appendLine('Stop command received for LogServerManager.');
        this.isServerRestarting = true; // Prevent other operations during stop
        this.stopInternal(() => {
            this.isServerRestarting = false;
            if (callback) {
                callback();
            }
        });
    }

    private stopInternal(callback: () => void): void {
        if (this.server) {
            const portToClose = this.currentPort;
            this.outputChannel.appendLine(`Shutting down server on port ${portToClose}.`);

            if (this.activeConnections.size > 0) {
                this.outputChannel.appendLine(`Closing ${this.activeConnections.size} active connection(s).`);
                for (const socket of this.activeConnections) {
                    socket.destroy();
                }
                this.activeConnections.clear();
            } else {
                this.outputChannel.appendLine('No active connections to close.');
            }

            const serverToClose = this.server;
            this.server = undefined;
            this.currentPort = undefined;

            serverToClose.close((err?: Error) => {
                if (err) {
                    console.error('UNREAL LOG VIEWER: Error closing server:', err);
                    this.outputChannel.appendLine(`Error closing server on port ${portToClose}: ${err.message}`);
                } else {
                    console.log('UNREAL LOG VIEWER: Server closed successfully.');
                    this.outputChannel.appendLine(`Server on port ${portToClose} closed successfully.`);
                }
                callback();
            });
        } else {
            this.outputChannel.appendLine('No active server to stop.');
            callback();
        }
    }

    public restart(newPort: number): void {
        this.outputChannel.appendLine(`Restart command received. Attempting to switch to port ${newPort}.`);
        this.start(newPort); // start method already handles stopping the old server if necessary
    }
}
