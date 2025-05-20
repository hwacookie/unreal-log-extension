# Unreal Log Viewer — User Guide

This guide explains how to use the Unreal Log Viewer extension in Visual Studio Code to monitor and filter Unreal Engine logs in real time.

## Opening the Log Viewer

- Click the **Unreal Log Viewer** icon in the Activity Bar.
- Or run the command **Unreal Log Viewer: Create** from the Command Palette (`Ctrl+Shift+P`).

## Viewing Logs

Once your Unreal Engine project is sending logs to the configured TCP port, new log messages will appear in the viewer automatically.

## Filtering Logs

You can filter logs using the input fields at the top of the log viewer panel:

- **Level Filter**: Show only logs of certain levels (e.g., `Error`, `Warning`, `Log`).
  - Example: `Error,Warning` (shows only errors and warnings)
  - Exclude: `!Verbose` (hides verbose logs)
  - Hierarchy: `>Warning` (shows Warning, Error, and Fatal)
- **Category Filter**: Show logs from specific Unreal categories (e.g., `LogBlueprint`, `LogNet`).
  - Example: `LogBlueprint,LogNet`
  - Exclude: `!LogTemp`
  - Wildcard: `Log*` (matches all categories starting with `Log`)
- **Message Filter**: Show logs containing certain keywords.
  - Example: `Blueprint,Error`
  - Exclude: `!Tick`
  - Case-insensitive and supports multiple keywords

You can combine filters. Filters are applied as you type.

## Clearing Logs

- Click the **Clear** button in the viewer to clear displayed logs.
- Or run **Unreal Log Viewer: Clear** from the Command Palette to clear all logs and reset filters.

## Using with GitHub Copilot

You can open a plain text view of recent logs to provide context for GitHub Copilot:

- Run **Unreal Log Viewer: Show Logs as Text for Copilot** from the Command Palette.
- This opens a new tab with recent logs as plain text, which Copilot can use for better suggestions.
- The number of logs shown is controlled by the `unrealLogViewer.copilotLogExportLimit` setting.

## More Help

For advanced details, see the full technical documentation in `docs/TechnicalDocumentation.md`.
