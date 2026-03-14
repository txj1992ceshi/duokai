#!/bin/bash
echo "Starting Fingerprint Browser Dashboard..."

# Navigate to the dashboard directory
cd "$(dirname "$0")/fingerprint-dashboard"

# Start the dev server in the background
npm run dev &
SERVER_PID=$!

sleep 3 # Wait for the server to start

# Automatically open the dashboard in "App Mode" (No browser UI, feels like a desktop app)
if [ -d "/Applications/Google Chrome.app" ]; then
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app=http://localhost:3000 --window-size=1280,800
else
    open http://localhost:3000
fi

echo "Dashboard running at http://localhost:3000"
echo "Press Ctrl+C to stop"

# Wait for process to exit
wait $SERVER_PID
