#!/bin/bash


# Get PIDs of ideafast processes
lst=$(ps aux | grep ideafast |grep -v "grep" | grep -v "$$" | awk '{print $2}')

# Iterate over PIDs and send SIGTERM signal
for pid in $lst; do
    echo "Stopping ideafast process with PID: $pid"
    kill -6 "$pid" |true
    sleep 1
done

echo "ideafast processes have been sent the SIGTERM signal"

exit