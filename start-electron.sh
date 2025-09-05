#!/bin/bash
# Start Electron with virtual display for Replit environment
export DISPLAY=:99
Xvfb :99 -screen 0 1280x800x24 &
sleep 2
electron . --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --disable-background-timer-throttling