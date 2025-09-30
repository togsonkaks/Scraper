#!/bin/bash
# Start Electron with virtual display for Replit environment
export ELECTRON_DISABLE_SANDBOX=1

# Set up GSettings schema paths for Electron/GTK (required for file dialogs)
export XDG_DATA_DIRS="/nix/store/6x7s7vfydrik42pk4599sm1jcqxmi1qp-gtk+3-3.24.49/share:/nix/store/x0x7k51kfxnd6v0cyxln73pqzq2lmcl8-gsettings-desktop-schemas-48.0/share:${XDG_DATA_DIRS}"

# Use xvfb-run to automatically manage virtual display
xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" \
  npx electron . --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-software-rasterizer --disable-background-timer-throttling