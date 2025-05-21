
export class DateFormatter {
    private useRelativeTimestamps: boolean;
    private timestampFormat: string; // Currently not used by the logic, but stored for future use if needed.
    private lastClearTime: Date;

    constructor(useRelativeTimestamps: boolean, timestampFormat: string, lastClearTime: Date) {
        this.useRelativeTimestamps = useRelativeTimestamps;
        this.timestampFormat = timestampFormat; // Store for potential future use
        this.lastClearTime = lastClearTime;
    }

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

    public updateFormattingOptions(useRelativeTimestamps: boolean, timestampFormat: string): void {
        this.useRelativeTimestamps = useRelativeTimestamps;
        this.timestampFormat = timestampFormat;
    }

    public updateLastClearTime(lastClearTime: Date): void {
        this.lastClearTime = lastClearTime;
    }
}
