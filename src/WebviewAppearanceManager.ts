import * as vscode from 'vscode';
import * as fs from 'fs';

export class WebviewAppearanceManager {
    private _webview?: vscode.Webview;
    private readonly extensionUri: vscode.Uri;

    constructor(
        private readonly context: vscode.ExtensionContext
    ) {
        this.extensionUri = this.context.extensionUri;
    }

    public setWebview(webview: vscode.Webview): void {
        this._webview = webview;
    }

    public getInitialWebviewHtml(): string {
        if (!this._webview) {
            throw new Error("Webview not set in WebviewAppearanceManager");
        }
        const webviewHtmlPath = vscode.Uri.joinPath(this.extensionUri, 'resources', 'webviewContent.html');
        const htmlContent = fs.readFileSync(webviewHtmlPath.fsPath, 'utf8');
        return htmlContent;
    }

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

    public updateFontSize(fontSize: string): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateFontSize', fontSize });
        }
    }

    public updateColorMode(useColors: boolean): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateColorMode', useColors });
        }
    }

    public updateGridLinesVisibility(showGridLines: boolean): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateGridLinesVisibility', showGridLines });
        }
    }

    public updateFontFamily(fontFamily: string): void {
        if (this._webview) {
            this._webview.postMessage({ command: 'updateFontFamily', fontFamily });
        }
    }
}
