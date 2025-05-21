/**
 * Formats date strings for display in the Unreal Log Viewer.
 * Can format dates as absolute timestamps or relative to a specified "clear time".
 */
export class DateFormatter {
    private useRelativeTimestamps: boolean;
    private timestampFormat: string; // Currently not used by the logic, but stored for future use if needed.
    private lastClearTime: Date;

    /**
     * Creates an instance of DateFormatter.
     * @param useRelativeTimestamps Whether to format timestamps relative to the lastClearTime.
     * @param timestampFormat The desired format string for absolute timestamps (e.g., 'HH:mm:ss.SSS').
     *                        Note: Currently, absolute formatting is fixed to 'HH:mm:ss.SSS'.
     * @param lastClearTime The reference date for relative timestamp calculations.
     *                      This is typically the time when logs were last cleared.
     */
    constructor(useRelativeTimestamps: boolean, timestampFormat: string, lastClearTime: Date) {
        this.useRelativeTimestamps = useRelativeTimestamps;
        this.timestampFormat = timestampFormat; // Store for potential future use
        this.lastClearTime = lastClearTime;
    }

    /**
     * Formats the given date string according to the current settings.
     * 
     * If `useRelativeTimestamps` is true, it formats the date relative to `lastClearTime`
     * in the format `+HH:MM:SS.mmm`.
     * 
     * If `useRelativeTimestamps` is false, it formats the date as an absolute timestamp
     * in `HH:mm:ss.SSS` format. (Note: Ignores `this.timestampFormat` for now).
     * 
     * The input `originalDateString` is expected to be an ISO 8601 string.
     * If it ends with 'Z', the 'Z' is stripped before parsing to ensure it's treated
     * as local time, consistent with how Unreal Engine logs timestamps.
     * 
     * @param originalDateString The ISO date string to format.
     * @returns The formatted date string.
     */
    public formatDate(originalDateString: string): string {
        const dateStringToParse = originalDateString.endsWith('Z') 
            ? originalDateString.slice(0, -1) 
            : originalDateString;

        const logDate = new Date(dateStringToParse);

        if (this.useRelativeTimestamps) {
            let diffMs = logDate.getTime() - this.lastClearTime.getTime();
            diffMs = Math.max(0, diffMs); // Ensure no negative relative times

            const milliseconds = (diffMs % 1000).toString().padStart(3, '0');
            const totalSeconds = Math.floor(diffMs / 1000);
            const seconds = (totalSeconds % 60).toString().padStart(2, '0');
            const totalMinutes = Math.floor(totalSeconds / 60);
            const minutes = (totalMinutes % 60).toString().padStart(2, '0');
            const hours = Math.floor(totalMinutes / 60).toString().padStart(2, '0');

            return `+${hours}:${minutes}:${seconds}.${milliseconds}`;
        } else {
            // Note: This part currently ignores this.timestampFormat and uses a fixed HH:mm:ss.SSS
            // If dynamic formatting based on this.timestampFormat is needed, this logic would need to be expanded.
            const h = logDate.getHours().toString().padStart(2, '0');
            const m = logDate.getMinutes().toString().padStart(2, '0');
            const s = logDate.getSeconds().toString().padStart(2, '0');
            const ms = logDate.getMilliseconds().toString().padStart(3, '0');
            return `${h}:${m}:${s}.${ms}`;
        }
    }

    /**
     * Updates the formatting options used by the DateFormatter.
     * @param useRelativeTimestamps Whether to use relative timestamps.
     * @param timestampFormat The format string for absolute timestamps.
     *                        Note: Currently, absolute formatting is fixed to 'HH:mm:ss.SSS'.
     */
    public updateFormattingOptions(useRelativeTimestamps: boolean, timestampFormat: string): void {
        this.useRelativeTimestamps = useRelativeTimestamps;
        this.timestampFormat = timestampFormat;
    }

    /**
     * Updates the last clear time, which is used as the baseline for relative timestamps.
     * @param lastClearTime The new Date object representing the last clear time.
     */
    public updateLastClearTime(lastClearTime: Date): void {
        this.lastClearTime = lastClearTime;
    }
}
