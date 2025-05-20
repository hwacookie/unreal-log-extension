param(
    [int]$DelayMilliseconds = 1000 # Optional delay in milliseconds, defaults to 0 (no delay)
)

# Log levels to choose from
$logLevels = @("FATAL", "ERROR", "WARNING", "DISPLAY", "LOG", "VERBOSE", "VERYVERBOSE")

# Log categories to choose from
$categories = @("Application", "Network", "Database", "Security", "UserAction", "SystemEvent", "Gameplay")

# Sample message components
$actions = @("Initializing", "Processing", "Completing", "Failing", "Verifying", "Updating", "Querying", "Connecting to")
$subjects = @("user login", "data record", "network packet", "configuration file", "shader compilation", "AI behavior tree", "physics simulation")
$outcomes = @("successfully", "with errors", "after timeout", "as expected", "with warnings", "due to external input")

# TCP Server Details
$serverHost = "localhost"
$serverPort = 9875 # Default port for the Unreal Log Viewer

$tcpClient = $null
$stream = $null
$writer = $null

function Connect-ToServer {
    param(
        [string]$TargetHost, # Renamed from $Host to $TargetHost
        [int]$Port
    )
    try {
        Write-Host "Attempting to connect to $TargetHost`:$Port..."
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect($TargetHost, $Port) # Use $TargetHost here
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

        $tcpClient = Connect-ToServer -TargetHost $serverHost -Port $serverPort
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
    $logEntry = [PSCustomObject]@{
        date     = $timestamp
        level    = $level
        category = $category
        message  = $messageText
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

    if ($DelayMilliseconds -gt 0) {
        Start-Sleep -Milliseconds $DelayMilliseconds
    }
}

# Cleanup (though the script runs indefinitely, good practice for other contexts)
if ($writer) { $writer.Close() }
if ($stream) { $stream.Close() }
if ($tcpClient) { $tcpClient.Close() }
