import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Unreal Log Viewer Extension - Basic Tests', () => {
  it('should activate the extension', async () => {
    const extension = vscode.extensions.getExtension('coregames.unreal-log-viewer');
    assert.ok(extension, 'Extension should be found.');
    // Add a non-null assertion here since assert.ok already checks for undefined
    await extension!.activate(); 
    assert.ok(extension!.isActive, 'Extension should be active after activation.');
  });

  it('should open the Unreal Log Viewer view', async () => {
    const extension = vscode.extensions.getExtension('coregames.unreal-log-viewer');
    assert.ok(extension, 'Extension should be found to open view.'); // Ensure extension is found

    // Check if extension is defined before accessing isActive or calling activate
    if (extension) {
      if (!extension.isActive) {
        await extension.activate();
      }
      assert.ok(extension.isActive, 'Extension must be active to open view.');

      try {
        await vscode.commands.executeCommand('unrealLogViewerView3.focus');
        assert.ok(true, 'Attempted to focus the Unreal Log Viewer view.');
      } catch (error) {
        assert.fail(`Focusing the view failed: ${error}`);
      }
    } else {
      // This case should ideally not be reached if the first assert.ok(extension, ...) passes
      // but it satisfies the compiler's concern about extension being potentially undefined.
      assert.fail('Extension was not found, cannot proceed to open view.');
    }
  });
});
