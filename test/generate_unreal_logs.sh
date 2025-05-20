#!/usr/bin/env bash
# Unreal Log Viewer Test Log Generator (Bash)
# Usage: ./generate_unreal_logs.sh [--host <host>] [--port <port>] [--delay <ms>] [--random] [--source <source>] [--help]

PORT=9875
DELAY=1000
RANDOM_DELAY=0
HOST="localhost"
SOURCE=""

show_help() {
cat << EOF
Unreal Log Viewer Test Log Generator

USAGE:
    ./generate_unreal_logs.sh [--host <host>] [--port <port>] [--delay <ms>] [--random] [--source <source>] [--help]

OPTIONS:
    --host <host>      Hostname or IP to connect to (default: localhost)
    --port <port>      TCP port to connect to (default: 9875)
    --delay <ms>       Delay in milliseconds between log messages (default: 1000)
    --random           Use a random delay between 10ms and the specified delay (default: off)
    --source <source>  Source identifier to include in the log messages (default: none)
    --help             Show this help message and exit

EXAMPLES:
    ./generate_unreal_logs.sh
    ./generate_unreal_logs.sh --host 127.0.0.1 --port 9876 --delay 500 --random --source "TestSource"
    ./generate_unreal_logs.sh --help
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)
            HOST="$2"; shift 2;;
        --port)
            PORT="$2"; shift 2;;
        --delay)
            DELAY="$2"; shift 2;;
        --random)
            RANDOM_DELAY=1; shift;;
        --source)
            SOURCE="$2"; shift 2;;
        --help)
            show_help; exit 0;;
        *)
            echo "Unknown option: $1"; show_help; exit 1;;
    esac
done

log_levels=("FATAL" "ERROR" "WARNING" "DISPLAY" "LOG" "VERBOSE" "VERYVERBOSE")
categories=("Application" "Network" "Database" "Security" "UserAction" "SystemEvent" "Gameplay")
actions=("Initializing" "Processing" "Completing" "Failing" "Verifying" "Updating" "Querying" "Connecting to")
subjects=("user login" "data record" "network packet" "configuration file" "shader compilation" "AI behavior tree" "physics simulation")
outcomes=("successfully" "with errors" "after timeout" "as expected" "with warnings" "due to external input")

# Function to generate a random log message as JSON
make_log() {
    local timestamp level category action subject outcome msg log_json
    timestamp=$(date -u +"%Y-%m-%dT%H:%M:%S.%3N")
    level=${log_levels[$RANDOM % ${#log_levels[@]}]}
    category=${categories[$RANDOM % ${#categories[@]}]}
    action=${actions[$RANDOM % ${#actions[@]}]}
    subject=${subjects[$RANDOM % ${#subjects[@]}]}
    outcome=${outcomes[$RANDOM % ${#outcomes[@]}]}
    msg="$action $subject $outcome."
    # 30% chance for a longer message
    if (( RANDOM % 100 < 30 )); then
        add_action=${actions[$RANDOM % ${#actions[@]}]}
        add_subject=${subjects[$RANDOM % ${#subjects[@]}]}
        add_outcome=${outcomes[$RANDOM % ${#outcomes[@]}]}
        msg+=" Furthermore, $add_action $add_subject $add_outcome."
        # 10% of 30% chance for even longer
        if (( RANDOM % 100 < 10 )); then
            extra_action=${actions[$RANDOM % ${#actions[@]}]}
            extra_subject=${subjects[$RANDOM % ${#subjects[@]}]}
            extra_outcome=${outcomes[$RANDOM % ${#outcomes[@]}]}
            msg+=" This often leads to $extra_action $extra_subject $extra_outcome."
        fi
    fi
    # Build JSON log
    if [[ -n "$SOURCE" ]]; then
        log_json=$(printf '{"date":"%s","level":"%s","category":"%s","message":"%s","source":"%s"}\n' "$timestamp" "$level" "$category" "$msg" "$SOURCE")
    else
        log_json=$(printf '{"date":"%s","level":"%s","category":"%s","message":"%s"}\n' "$timestamp" "$level" "$category" "$msg")
    fi
    echo "$log_json"
}

# Main loop
while true; do
    # Try to connect
    exec 3<>/dev/tcp/$HOST/$PORT
    if [[ $? -ne 0 ]]; then
        echo "Connection failed. Retrying in 5 seconds..." >&2
        sleep 5
        continue
    fi
    echo "Connected to $HOST:$PORT" >&2
    while true; do
        log_entry=$(make_log)
        if ! echo "$log_entry" >&3; then
            echo "Connection lost. Reconnecting..." >&2
            exec 3>&- # Close FD 3
            break
        fi
        echo "$log_entry"
        # Determine delay
        sleep_ms=$DELAY
        if [[ $RANDOM_DELAY -eq 1 && $DELAY -gt 10 ]]; then
            sleep_ms=$(( RANDOM % (DELAY - 10 + 1) + 10 ))
        fi
        sleep_sec=$(awk "BEGIN {print $sleep_ms/1000}")
        sleep $sleep_sec
    done
    exec 3>&- # Ensure FD 3 is closed before next connect
    sleep 1
done
