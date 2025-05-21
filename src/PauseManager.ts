import { UnrealLogEntry } from './logTypes';

// Represents a log entry that has been formatted for display, particularly the date.
export type FormattedDisplayLogEntry = Pick<UnrealLogEntry, 'level' | 'category' | 'message' | 'source'> & { date: string };

export class PauseManager {
    private _isPaused = false;
    private _displayedLogsOnPause: FormattedDisplayLogEntry[] = [];
    private _lastShownCountWhenPaused?: number;

    public get isPaused(): boolean {
        return this._isPaused;
    }

    public getDisplayedLogs(): FormattedDisplayLogEntry[] {
        // Only return stored logs if actually paused, otherwise it's an empty array.
        return this._isPaused ? this._displayedLogsOnPause : [];
    }

    public getLastShownCount(): number | undefined {
        return this._isPaused ? this._lastShownCountWhenPaused : undefined;
    }

    /**
     * Toggles the pause state.
     * If transitioning to paused, it captures the currently displayed logs using the provided callback.
     * If transitioning to resumed, it clears any stored paused-state logs.
     * @param captureDisplayedLogsCallback A function that returns the current set of formatted logs to be stored if pausing.
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
     * If paused, updates the count of logs that were shown.
     * This is useful if, for example, logs are cleared while the view is paused.
     * @param count The new count of shown logs.
     */
    public updateLastShownCountIfPaused(count: number): void {
        if (this._isPaused) {
            this._lastShownCountWhenPaused = count;
        }
    }
    
    /**
     * Resets the pause manager's stored state for when the webview content itself is cleared.
     * If paused, this means the "last shown count" should be zero, and stored logs are cleared.
     */
    public resetForWebviewClear(): void {
        if (this._isPaused) {
            this._lastShownCountWhenPaused = 0;
            this._displayedLogsOnPause = []; // Clear stored logs as the webview is now empty
        }
    }
}
