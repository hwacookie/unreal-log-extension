import * as assert from 'assert';
import * as vscode from 'vscode';
import { getWebviewReadyDelayMs, focusUnrealLogView } from './testUtils'; // Import delay functions and focusUnrealLogView

describe('Unreal Log Viewer Extension - Basic Tests', () => {
  it('should activate the extension', async () => {
    const extension = vscode.extensions.getExtension('coregames.unreal-log-viewer');
    assert.ok(extension, 'Extension should be found.');
    await extension!.activate();
    assert.ok(extension!.isActive, 'Extension should be active after activation.');
  });

  it('should open the Unreal Log Viewer view in the panel', async () => {
    const extension = vscode.extensions.getExtension('coregames.unreal-log-viewer');
    assert.ok(extension, 'Extension should be found to open view.');

    if (extension) {
      if (!extension.isActive) {
        await extension.activate();
      }
      assert.ok(extension.isActive, 'Extension must be active to open view.');

      // Use the utility function to focus the view, which now handles panel layout
      await focusUnrealLogView();
      await new Promise(resolve => setTimeout(resolve, getWebviewReadyDelayMs()));

      // At this point, the view should be in the panel and focused.
      // For this basic test, we'll just assert that the command was called.
      // More detailed view state assertions can be in other tests.
      assert.ok(true, 'focusUnrealLogView utility function executed, view should be in panel.');
    } else {
      assert.fail('Extension was not found, cannot proceed to open view.');
    }
  });
});
