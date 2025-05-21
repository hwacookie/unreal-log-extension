/**
 * @module WebviewAppearanceManager
 * This module defines the `WebviewAppearanceManager` class, which is responsible for managing
 * the visual appearance of the Unreal Log Viewer webview. This includes loading the initial HTML,
 * applying settings from the VS Code configuration (like font size, colors, grid lines, font family),
 * and updating these settings when they change.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Manages the appearance of the webview, including its initial HTML content and dynamic styling updates.
 * It interacts with VS Code's configuration to fetch user preferences for appearance settings
 * and applies them to the webview via messages.
 */
export class WebviewAppearanceManager {
    /** The VS Code webview instance this manager controls. */
    private _webview?: vscode.Webview;
    /** The URI of the extension, used for accessing local resources. */
    private readonly extensionUri: vscode.Uri;

    /**
     * Constructs a `WebviewAppearanceManager`.
     * @param context The extension context, used to get the extension's URI.
     */
    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.extensionUri = this.context.extensionUri;
    }

    /**
     * Sets the webview instance that this manager will control.
     * This should be called once the webview has been created.
     * @param webview The `vscode.Webview` instance.
     */
    public setWebview(webview: vscode.Webview): void {
        this._webview = webview;
    }

    /**
     * Retrieves the initial HTML content for the webview.
     * Reads the content from `resources/webviewContent.html`.
     * @returns The HTML string for the webview.
     * @throws Error if the webview has not been set via `setWebview`.
     */
    public getInitialWebviewHtml(): string {
        if (!this._webview) {
            throw new Error("Webview not set in WebviewAppearanceManager");
        }
        const webviewHtmlPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'webviewContent.html');
        const htmlContent = fs.readFileSync(webviewHtmlPath.fsPath, 'utf8');
        return htmlContent;
    }

    /**
     * Applies initial appearance settings to the webview based on the current VS Code configuration.
     * This includes font size, color mode, grid line visibility, and font family.
     */
    public applyInitialSettings(): void {
        if (!this._webview) { return; }

        const config = vscode.workspace.getConfiguration('unrealLogViewer');

        const initialFontSize = config.get<string>('logTableFontSize', 'var(--vscode-font-size)');
        this._webview.postMessage({ command: 'updateFontSize', fontSize: initialFontSize });

        const initialUseColors = config.get<boolean>('useLogLevelColors', true);
        this._webview.postMessage({ command: 'updateColorMode', useColors: initialUseColors });

        const initialShowGridLines = config.get<boolean>('showGridLines', false);
        this._webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines: initialShowGridLines });

        const initialFontFamily = config.get<string>('logTableFontFamily', 'var(--vscode-font-family)');
        this._webview.postMessage({ command: 'updateFontFamily', fontFamily: initialFontFamily });
    }

    /**
     * Sends a message to the webview to update its font size.
     * @param fontSize The new font size string (e.g., '12px', 'var(--vscode-font-size)').
     */
    public updateFontSize(fontSize: string): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateFontSize', fontSize });
        }
    }

    /**
     * Sends a message to the webview to update its color mode (use log level colors or monochrome).
     * @param useColors `true` to enable log level colors, `false` for monochrome.
     */
    public updateColorMode(useColors: boolean): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateColorMode', useColors });
        }
    }

    /**
     * Sends a message to the webview to update the visibility of grid lines in the log table.
     * @param showGridLines `true` to show grid lines, `false` to hide them.
     */
    public updateGridLinesVisibility(showGridLines: boolean): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines });
        }
    }

    /**
     * Sends a message to the webview to update its font family.
     * @param fontFamily The new font family string (e.g., 'Consolas', 'var(--vscode-font-family)').
     */
    public updateFontFamily(fontFamily: string): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateFontFamily', fontFamily });
        }
    }
}
