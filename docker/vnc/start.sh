#!/bin/bash
RESOLUTION="${RESOLUTION:-1280x720}"
WIDTH=$(echo $RESOLUTION | cut -dx -f1)
HEIGHT=$(echo $RESOLUTION | cut -dx -f2)

# Start virtual display
Xvfb :99 -screen 0 ${RESOLUTION}x24 -ac &
sleep 1

# Start VNC server (no password, shared mode)
x11vnc -display :99 -forever -shared -nopw -rfbport 5900 -geometry ${RESOLUTION} &
sleep 1

# Start noVNC (browser-based VNC client)
websockify --web /usr/share/novnc 6080 localhost:5900 &
sleep 1

# Find playwright chromium binary
CHROMIUM=$(find /root/.cache/ms-playwright -name "chrome" -type f 2>/dev/null | head -1)
if [ -z "$CHROMIUM" ]; then
  CHROMIUM=$(find /root/.cache/ms-playwright -name "headless_shell" -type f 2>/dev/null | head -1)
fi

if [ -z "$CHROMIUM" ]; then
  echo "ERROR: No chromium binary found"
  exit 1
fi

echo "Using browser: $CHROMIUM"
echo "Resolution: ${RESOLUTION}"

# Open Chromium maximized to fill the virtual display
"$CHROMIUM" \
    --no-sandbox \
    --disable-gpu \
    --no-first-run \
    --disable-sync \
    --disable-translate \
    --disable-infobars \
    --disable-features=InfiniteSessionRestore \
    --start-maximized \
    --window-size=${WIDTH},${HEIGHT} \
    --window-position=0,0 \
    "${TARGET_URL:-http://127.0.0.1:5173}" &

echo "VNC ready: http://localhost:6080"
echo "Target: ${TARGET_URL:-http://127.0.0.1:5173}"

# Keep container alive
wait
