# Test info

- Name: should open the Unreal Log Viewer webview
- Location: P:\prj\unreal-log-extension\test\ui\unrealLogViewerWebview.test.ts:30:5

# Error details

```
Error: electron.launch: 
╔══════════════════════════════════════════════════════════════════════════════════════════════════════════╗
║ Electron executablePath not found!                                                                       ║
║ Please install it using `npm install -D electron` or set the executablePath to your Electron executable. ║
╚══════════════════════════════════════════════════════════════════════════════════════════════════════════╝
    at P:\prj\unreal-log-extension\test\ui\unrealLogViewerWebview.test.ts:14:17
```

# Test source

```ts
   1 | // Playwright UI test for Unreal Log Viewer VS Code extension
   2 | import * as path from 'path';
   3 | import { _electron as electron, ElectronApplication, Page } from 'playwright';
   4 | import { test, expect } from '@playwright/test';
   5 |
   6 | // Workspace root (adjusted for Windows path)
   7 | const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
   8 |
   9 | let electronApp: ElectronApplication;
  10 | let page: Page;
  11 |
  12 | test.beforeAll(async () => {
  13 |   // Launch VS Code with the extension loaded
> 14 |   electronApp = await electron.launch({
     |                 ^ Error: electron.launch: 
  15 |     args: [
  16 |       WORKSPACE_ROOT, // workspace root
  17 |       '--disable-extensions',
  18 |       `--extensionDevelopmentPath=${WORKSPACE_ROOT}`,
  19 |     ],
  20 |   });
  21 |
  22 |   // Wait for the main window
  23 |   page = await electronApp.firstWindow();
  24 | }, 60000);
  25 |
  26 | test.afterAll(async () => {
  27 |   await electronApp.close();
  28 | });
  29 |
  30 | test('should open the Unreal Log Viewer webview', async () => {
  31 |   // Open the command palette and run the "Unreal Log Viewer: Create" command
  32 |   await page.keyboard.press('Control+Shift+P');
  33 |   await page.keyboard.type('Unreal Log Viewer: Create');
  34 |   await page.keyboard.press('Enter');
  35 |
  36 |   // Wait for the webview to appear (iframe with class 'webview')
  37 |   await page.waitForSelector('iframe.webview', { timeout: 15000 });
  38 |
  39 |   // Optionally, check for a known element in your webview (e.g., Pause button)
  40 |   // const frames = page.frames();
  41 |   // const webviewFrame = frames.find(f => f.url().includes('webview'));
  42 |   // if (webviewFrame) {
  43 |   //   const pauseButton = await webviewFrame.waitForSelector('#pauseButton', { timeout: 5000 });
  44 |   //   expect(await pauseButton.isVisible()).toBe(true);
  45 |   // }
  46 | });
```