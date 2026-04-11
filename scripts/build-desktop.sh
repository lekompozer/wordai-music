#!/usr/bin/env bash
# build-desktop.sh — Production build for WordAI Music
# Reads credentials from .env.local and runs `npx tauri build`
# Output: src-tauri/target/release/bundle/

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🎵 Building WordAI Music desktop app..."

# Load credentials from .env.local
if [ -f "$ROOT_DIR/.env.local" ]; then
    set -a
    source "$ROOT_DIR/.env.local"
    set +a
    echo "✅ Loaded .env.local"
fi

# Validate required credentials
if [ -z "$GOOGLE_OAUTH_CLIENT_ID" ]; then
    echo "❌ GOOGLE_OAUTH_CLIENT_ID not set in .env.local"
    exit 1
fi
if [ -z "$GOOGLE_CLIENT_SECRET" ]; then
    echo "❌ GOOGLE_CLIENT_SECRET not set in .env.local"
    exit 1
fi

# Build Next.js static export first
echo "📦 Building Next.js static export..."
cd "$ROOT_DIR"
npm run build

echo "🦀 Building Tauri desktop app..."
npx tauri build

# Print artifact paths
echo ""
echo "✅ Build complete! Artifacts:"
find "$ROOT_DIR/src-tauri/target/release/bundle" -name "*.dmg" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.exe" -o -name "*.msi" 2>/dev/null | sort
