#!/usr/bin/env bash
# dev.sh — Start WordAI Music in Tauri development mode
# Usage: npm run dev:desktop (or bash scripts/dev.sh)
# This script sources .env.local and exports all vars so Rust inherits them.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Source .env.local
if [ -f "$ROOT_DIR/.env.local" ]; then
    set -a
    source "$ROOT_DIR/.env.local"
    set +a
    echo "✅ Loaded .env.local"
else
    echo "⚠️  .env.local not found — Google OAuth will not work"
fi

# In dev mode, OAuth redirects back to localhost:3001
export DESKTOP_FRONTEND_URL="http://localhost:3001"

echo "🎵 Starting WordAI Music dev server..."
cd "$ROOT_DIR"
npx tauri dev
