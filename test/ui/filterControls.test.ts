import * as assert from 'assert';
import * as vscode from 'vscode'; // Added import for vscode
import {
    delay,
    activateExtension,
    focusUnrealLogView,
    getWebviewElements,
    getWebviewReadyDelayMs,
    getCommandExecutionDelayMs,
} from './testUtils';

before(async () => {
    await activateExtension();
    await focusUnrealLogView();
    await delay(getWebviewReadyDelayMs()); // Ensure webview is ready
});

describe('Unreal Log Viewer - Filter Controls UI Tests', function () {
    it('test 0004: should toggle filter visibility when "Toggle Filter Bar" command is executed', async function () {
        this.timeout(20000); // Increased timeout for UI operations

        await focusUnrealLogView(); // Ensure the view is focused
        await delay(getWebviewReadyDelayMs());

        // 1. Get initial state of the filter container
        let filterControlsElements = await getWebviewElements('#filter-controls');
        assert.ok(filterControlsElements.length > 0, 'Filter controls div should exist.');
        let filterControlsDiv = filterControlsElements[0];
        const initialIsHidden = filterControlsDiv.attributes.class?.includes('hidden') ?? false;
        console.log('Initial filter controls hidden state:', initialIsHidden);

        // 2. Execute the command to toggle filter bar visibility
        console.log('Executing command unrealLogViewer.toggleFilterBarVisibility...');
        await vscode.commands.executeCommand('unrealLogViewer.toggleFilterBarVisibility');
        await delay(getCommandExecutionDelayMs() + 200); // Allow UI to update (added a bit more delay for message passing)

        // 3. Get new state of the filter container
        filterControlsElements = await getWebviewElements('#filter-controls');
        assert.ok(filterControlsElements.length > 0, 'Filter controls div should still exist.');
        filterControlsDiv = filterControlsElements[0];
        const isHiddenAfterFirstToggle = filterControlsDiv.attributes.class?.includes('hidden') ?? false;
        console.log('Filter controls hidden state after first toggle:', isHiddenAfterFirstToggle);

        // Assert that the hidden state has changed
        assert.notStrictEqual(isHiddenAfterFirstToggle, initialIsHidden,
            `Filter controls hidden state should change after first toggle. Initial: ${initialIsHidden}, After toggle: ${isHiddenAfterFirstToggle}`);

        // 4. Execute the command again to toggle back
        console.log('Executing command unrealLogViewer.toggleFilterBarVisibility again...');
        await vscode.commands.executeCommand('unrealLogViewer.toggleFilterBarVisibility');
        await delay(getCommandExecutionDelayMs() + 200); // Allow UI to update

        // 5. Get final state of the filter container
        filterControlsElements = await getWebviewElements('#filter-controls');
        assert.ok(filterControlsElements.length > 0, 'Filter controls div should still exist after second toggle.');
        filterControlsDiv = filterControlsElements[0];
        const isHiddenAfterSecondToggle = filterControlsDiv.attributes.class?.includes('hidden') ?? false;
        console.log('Filter controls hidden state after second toggle:', isHiddenAfterSecondToggle);

        // Assert that the hidden state has reverted to the initial state
        assert.strictEqual(isHiddenAfterSecondToggle, initialIsHidden,
            `Filter controls hidden state should revert to initial after second toggle. Initial: ${initialIsHidden}, After second toggle: ${isHiddenAfterSecondToggle}`);
    });
});
