#!/usr/bin/env bash
# tauri-dev.sh — Called by Tauri as beforeDevCommand
# Starts Next.js dev server on port 3001

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Kill anything on port 3001
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

# Remove Next.js dev lock if present
rm -f "$ROOT_DIR/.next/dev/lock"

# Start Next.js in background
echo "🟡 Starting Next.js on port 3001..."
npm run dev:port3001 &
NEXT_PID=$!

# Cleanup on exit
trap "echo '🛑 Stopping Next.js...'; kill $NEXT_PID 2>/dev/null || true" SIGTERM SIGINT EXIT

# Wait for Next.js to be ready
echo "⏳ Waiting for http://localhost:3001..."
for i in $(seq 1 30); do
    if curl -s http://localhost:3001 > /dev/null 2>&1; then
        echo "✅ Next.js ready!"
        break
    fi
    sleep 1
done

wait $NEXT_PID
