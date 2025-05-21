// p:/prj/unreal-log-extension/test/ui/vscode-mock.js
// A very basic mock for the 'vscode' module to allow tests to be discovered
// by test explorers that run in a plain Node.js environment.
// This will not provide any real VS Code functionality.
const vscode = {
    Uri: {
        parse: (str) => ({ fsPath: str, scheme: 'file', toString: () => str }),
        file: (str) => ({ fsPath: str, scheme: 'file', toString: () => str }),
    },
    commands: {
        executeCommand: () => Promise.resolve(),
    },
    window: {
        showInformationMessage: () => Promise.resolve(),
        showErrorMessage: () => Promise.resolve(),
        createWebviewPanel: () => ({
            webview: {
                html: '',
                onDidReceiveMessage: () => ({ dispose: () => {} }),
                asWebviewUri: (uri) => uri,
                cspSource: 'vscode-resource:'
            },
            onDidDispose: () => ({ dispose: () => {} }),
            reveal: () => {},
            dispose: () => {}
        }),
        registerWebviewViewProvider: () => ({ dispose: () => {} }),
        activeTextEditor: undefined,
        visibleTextEditors: [],
        onDidChangeActiveTextEditor: () => ({ dispose: () => {} }),
        onDidChangeVisibleTextEditors: () => ({ dispose: () => {} }),
        showQuickPick: () => Promise.resolve(),
        showInputBox: () => Promise.resolve(),
    },
    workspace: {
        getConfiguration: (section) => ({
            get: (key, defaultValue) => {
                // Provide some defaults for common configurations your tests might access
                if (section === 'unrealLogViewer') {
                    if (key === 'serverPort') return 9876;
                    if (key === 'useRelativeTimestamps') return false;
                    if (key === 'timestampFormat') return 'HH:mm:ss.SSS';
                }
                return defaultValue;
            },
            update: () => Promise.resolve(),
            inspect: (key) => ({
                key,
                defaultValue: undefined,
                globalValue: undefined,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
                globalLanguageValue: undefined,
                workspaceLanguageValue: undefined,
                workspaceFolderLanguageValue: undefined,

            })
        }),
        onDidChangeConfiguration: () => ({ dispose: () => {} }),
        workspaceFolders: [],
        getWorkspaceFolder: () => undefined,
        fs: {
            readFile: () => Promise.resolve(new Uint8Array()),
            writeFile: () => Promise.resolve(),
            stat: () => Promise.resolve({type: 0, ctime:0, mtime:0, size:0}),
            readDirectory: () => Promise.resolve([]),
            createDirectory: () => Promise.resolve(),
            delete: () => Promise.resolve(),
            copy: () => Promise.resolve(),
            rename: () => Promise.resolve(),
        },
        applyEdit: () => Promise.resolve(true),
        openTextDocument: (options) => Promise.resolve({ getText: () => ''}),
        onDidOpenTextDocument: () => ({ dispose: () => {} }),
        onDidCloseTextDocument: () => ({ dispose: () => {} }),
        onDidChangeTextDocument: () => ({ dispose: () => {} }),
        onDidSaveTextDocument: () => ({ dispose: () => {} }),
        onWillSaveTextDocument: () => ({ dispose: () => {} }),
    },
    extensions: {
        getExtension: (extensionId) => undefined,
        all: [],
        onDidChange: () => ({ dispose: () => {} }),
    },
    ProgressLocation: {
        Notification: 15,
        SourceControl: 1,
        Window: 10,
    },
    ViewColumn: {
        Active: -1,
        Beside: -2,
        One: 1,
        Two: 2,
        Three: 3,
        Four: 4,
        Five: 5,
        Six: 6,
        Seven: 7,
        Eight: 8,
        Nine: 9
    },
    StatusBarAlignment: {
        Left: 1,
        Right: 2
    },
    ThemeColor: (id) => id,
    ThemeIcon: (id) => ({ id }),
    // Add other commonly used vscode APIs here as needed, with minimal mock implementations
};

// Make it available for require('vscode')
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(request) {
    if (request === 'vscode') {
        return vscode;
    }
    // Fallback for other modules, including those that might be in node_modules
    return originalRequire.apply(this, arguments);
};

module.exports = vscode;
