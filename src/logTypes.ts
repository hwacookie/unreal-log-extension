/**
 * @module logTypes
 * This module defines the core data structures for representing log entries within the Unreal Log Viewer extension.
 */

/**
 * Represents a single log entry from Unreal Engine.
 */
export interface UnrealLogEntry {
    /** The timestamp of the log entry, typically in ISO 8601 format. */
    date: string;
    /** The severity level of the log entry (e.g., "Log", "Warning", "Error"). */
    level: string;
    /** The category of the log entry (e.g., "LogTemp", "LogBlueprintUserMessages"). */
    category: string;
    /** The main content of the log message. */
    message: string;
    /** 
     * Optional. The source of the log entry, which might include file and line number information.
     * This is typically the long form of the log source.
     */
    source?: string; // Use only the long form, keep it optional
}
