// UnrealLogEntry type extracted from unrealLogViewer.ts
export interface UnrealLogEntry {
    date: string;
    level: string;
    category: string;
    message: string;
    source?: string; // Use only the long form, keep it optional
}
