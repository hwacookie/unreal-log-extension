import { UnrealLogEntry } from './logTypes';

/**
 * Represents a log entry that has been formatted for display in the webview,
 * particularly ensuring the `date` field is a string.
 */
export type FormattedDisplayLogEntry = Pick<UnrealLogEntry, 'level' | 'category' | 'message' | 'source'> & { date: string };

/**
 * Manages the pause state of the log viewer.
 *
 * This class is responsible for:
 * - Tracking whether the log display is paused.
 * - Storing the logs that were visible at the moment of pausing (if a callback is provided to capture them).
 * - Storing the count of logs that were visible when paused.
 * - Providing methods to toggle the pause state, retrieve stored logs/counts, and reset state for webview clears.
 */
export class PauseManager {
    private _isPaused = false;
    private _displayedLogsOnPause: FormattedDisplayLogEntry[] = [];
    private _lastShownCountWhenPaused?: number;

    /**
     * Gets the current pause state.
     * @returns True if the log viewer is currently paused, false otherwise.
     */
    public get isPaused(): boolean {
        return this._isPaused;
    }

    /**
     * Gets the logs that were displayed when the viewer was paused.
     * If the viewer is not currently paused, returns an empty array.
     * @returns An array of `FormattedDisplayLogEntry` objects, or an empty array.
     */
    public getDisplayedLogs(): FormattedDisplayLogEntry[] {
        // Only return stored logs if actually paused, otherwise it's an empty array.
        return this._isPaused ? this._displayedLogsOnPause : [];
    }

    /**
     * Gets the count of logs that were shown when the viewer was last paused.
     * @returns The count of logs, or undefined if not paused or no count was stored.
     */
    public getLastShownCount(): number | undefined {
        return this._isPaused ? this._lastShownCountWhenPaused : undefined;
    }

    /**
     * Toggles the pause state.
     *
     * If transitioning from unpaused to paused, and `captureDisplayedLogsCallback` is provided,
     * this callback is invoked to get the current set of formatted logs, which are then stored.
     * The count of these stored logs is also recorded.
     *
     * If transitioning from paused to unpaused, any stored logs and the count are cleared.
     *
     * @param captureDisplayedLogsCallback An optional function that returns the current set of
     *                                     formatted logs to be stored if the state is changing to paused.
     */
    public toggleState(
        captureDisplayedLogsCallback?: () => FormattedDisplayLogEntry[]
    ): void {
        this._isPaused = !this._isPaused;
        if (this._isPaused) {
            if (captureDisplayedLogsCallback) {
                this._displayedLogsOnPause = captureDisplayedLogsCallback();
                this._lastShownCountWhenPaused = this._displayedLogsOnPause.length;
            } else {
                // Fallback, though ideally captureDisplayedLogsCallback is always provided when pausing.
                this._displayedLogsOnPause = [];
                this._lastShownCountWhenPaused = 0;
            }
        } else {
            this._displayedLogsOnPause = [];
            this._lastShownCountWhenPaused = undefined;
        }
    }

    /**
     * If the viewer is currently paused, this method updates the stored count of logs
     * that were last considered "shown". This is useful if an action (like clearing logs)
     * occurs while paused, and the reference count needs to be adjusted.
     * @param count The new count of shown logs.
     */
    public updateLastShownCountIfPaused(count: number): void {
        if (this._isPaused) {
            this._lastShownCountWhenPaused = count;
        }
    }
    
    /**
     * Resets the PauseManager's stored state, typically when the webview content itself is cleared.
     * If the viewer is paused, this action clears any stored logs and sets the `lastShownCountWhenPaused` to 0,
     * reflecting that the (now cleared) webview shows no logs.
     */
    public resetForWebviewClear(): void {
        if (this._isPaused) {
            this._lastShownCountWhenPaused = 0;
            this._displayedLogsOnPause = []; // Clear stored logs as the webview is now empty
        }
    }
}
