param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

# Default values
$Port = 9875
$DelayMilliseconds = 1000
$RandomDelay = $false
$HostName = 'localhost'
$source = $null

# Help text
$helpText = @"
Unreal Log Viewer Test Log Generator

USAGE:
    .\generate_unreal_logs.ps1 [--host <host>] [--port <port>] [--delay <ms>] [--random] [--source <source>] [--help]

OPTIONS:
    --host <host>      Hostname or IP to connect to (default: localhost)
    --port <port>      TCP port to connect to (default: 9875)
    --delay <ms>       Delay in milliseconds between log messages (default: 1000)
    --random           Use a random delay between 10ms and the specified delay (default: off)
    --source <source>  Source identifier to include in the log (optional)
    --help             Show this help message and exit

EXAMPLES:
    .\generate_unreal_logs.ps1
    .\generate_unreal_logs.ps1 --host 127.0.0.1 --port 9876 --delay 500 --random --source "TestSource"
    .\generate_unreal_logs.ps1 --help
"@

# Parse --help and named args
if ($Args -contains '--help') {
    Write-Host $helpText
    exit 0
}

for ($i = 0; $i -lt $Args.Count; $i++) {
    switch ($Args[$i]) {
        '--host' {
            if ($i + 1 -lt $Args.Count) {
                $HostName = $Args[$i + 1]
                $i++
            }
        }
        '--port' {
            if ($i + 1 -lt $Args.Count) {
                $Port = [int]$Args[$i + 1]
                $i++
            }
        }
        '--delay' {
            if ($i + 1 -lt $Args.Count) {
                $DelayMilliseconds = [int]$Args[$i + 1]
                $i++
            }
        }
        '--random' {
            $RandomDelay = $true
        }
        '--source' {
            if ($i + 1 -lt $Args.Count) {
                $source = $Args[$i + 1]
                $i++
            }
        }
    }
}

# Log levels to choose from
$logLevels = @("FATAL", "ERROR", "WARNING", "DISPLAY", "LOG", "VERBOSE", "VERYVERBOSE")

# Log categories to choose from
$categories = @("Application", "Network", "Database", "Security", "UserAction", "SystemEvent", "Gameplay")

# Sample message components
$actions = @("Initializing", "Processing", "Completing", "Failing", "Verifying", "Updating", "Querying", "Connecting to")
$subjects = @("user login", "data record", "network packet", "configuration file", "shader compilation", "AI behavior tree", "physics simulation")
$outcomes = @("successfully", "with errors", "after timeout", "as expected", "with warnings", "due to external input")

$tcpClient = $null
$stream = $null
$writer = $null

function Connect-ToServer {
    param(
        [string]$TargetHost,
        [int]$Port
    )
    try {
        Write-Host "Attempting to connect to $TargetHost`:$Port..."
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($TargetHost, $Port)
        if ($client.Connected) {
            Write-Host "Connected to $TargetHost`:$Port."
            return $client
        }
    } catch {
        Write-Warning "Failed to connect to $TargetHost`:$Port : $($_.Exception.Message)"
        return $null
    }
    return $null
}

# Main loop
while ($true) {
    if (-not $tcpClient -or -not $tcpClient.Connected) {
        # Clean up old resources if any
        if ($writer) { $writer.Close(); $writer = $null }
        if ($stream) { $stream.Close(); $stream = $null }
        if ($tcpClient) { $tcpClient.Close(); $tcpClient = $null }

        $tcpClient = Connect-ToServer -TargetHost $HostName -Port $Port
        if ($tcpClient -and $tcpClient.Connected) {
            $stream = $tcpClient.GetStream()
            $writer = New-Object System.IO.StreamWriter($stream, [System.Text.Encoding]::UTF8)
        } else {
            Write-Warning "Connection failed. Retrying in 5 seconds..."
            Start-Sleep -Seconds 5
            continue # Skip to next iteration of the main loop to retry connection
        }
    }

    # Get current timestamp in ISO 8601 format
    $timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss.fff"
    
    # Select random elements
    $level = $logLevels | Get-Random
    $category = $categories | Get-Random
    $messageAction = $actions | Get-Random
    $messageSubject = $subjects | Get-Random
    $messageOutcome = $outcomes | Get-Random
    
    $messageText = "$messageAction $messageSubject $messageOutcome."

    # Chance to make the message longer
    if ((Get-Random -Minimum 1 -Maximum 100) -le 30) { # 30% chance for a longer message
        $additionalAction = $actions | Get-Random
        $additionalSubject = $subjects | Get-Random
        $additionalOutcome = $outcomes | Get-Random
        $additionalPhrase = "Furthermore, $additionalAction $additionalSubject $additionalOutcome."
        $messageText += " $additionalPhrase"

        # Even longer sometimes? (e.g., 10% of the 30% = 3% overall)
        if ((Get-Random -Minimum 1 -Maximum 100) -le 10) {
            $extraAction = $actions | Get-Random
            $extraSubject = $subjects | Get-Random
            $extraOutcome = $outcomes | Get-Random
            $extraPhrase = "This often leads to $extraAction $extraSubject $extraOutcome."
            $messageText += " $extraPhrase"
        }
    }

    # Create a PowerShell custom object for the log entry
    if ($source) {
        $logEntry = [PSCustomObject]@{
            date     = $timestamp
            level    = $level
            category = $category
            message  = $messageText
            source   = $source
        }
    } else {
        $logEntry = [PSCustomObject]@{
            date     = $timestamp
            level    = $level
            category = $category
            message  = $messageText
        }
    }

    # Convert the object to a compact JSON string
    $jsonOutput = $logEntry | ConvertTo-Json -Compress

    # Send the JSON string over TCP
    if ($writer) {
        try {
            $writer.WriteLine($jsonOutput)
            $writer.Flush()
            Write-Host "Sent: $jsonOutput"
        } catch {
            Write-Warning "Error sending data: $($_.Exception.Message). Attempting to reconnect."
            # Mark for reconnection by nullifying client
            if ($writer) { $writer.Close(); $writer = $null }
            if ($stream) { $stream.Close(); $stream = $null }
            if ($tcpClient) { $tcpClient.Close(); $tcpClient = $null }
            # No sleep here, the outer loop will handle retry delay if connection fails next
        }
    } else {
        Write-Warning "Writer not available. Attempting to reconnect."
        # Ensure we attempt to reconnect in the next iteration
        if ($tcpClient) { $tcpClient.Close(); $tcpClient = $null }
    }

    $sleepMs = $DelayMilliseconds
    if ($RandomDelay -and $DelayMilliseconds -gt 10) {
        $sleepMs = Get-Random -Minimum 10 -Maximum ($DelayMilliseconds + 1)
    }
    if ($sleepMs -gt 0) {
        Start-Sleep -Milliseconds $sleepMs
    }
} # <-- Added closing brace for while ($true) loop

# Cleanup (though the script runs indefinitely, good practice for other contexts)
if ($writer) { $writer.Close() }
if ($stream) { $stream.Close() }
if ($tcpClient) { $tcpClient.Close() }
