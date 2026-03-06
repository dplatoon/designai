#!/bin/bash

# DesignAI.dev Diagnostic Script
# This script checks the local environment and project structure.

echo "🔍 Running DesignAI Diagnostics..."

# 1. Check for required files
echo -n "Checking for wrangler.jsonc... "
if [ -f "wrangler.jsonc" ]; then
    echo "✅"
else
    echo "❌ NOT FOUND"
fi

echo -n "Checking for package.json... "
if [ -f "package.json" ]; then
    echo "✅"
else
    echo "❌ NOT FOUND"
fi

echo -n "Checking for .prod.vars... "
if [ -f ".prod.vars" ]; then
    echo "✅"
else
    echo "❌ NOT FOUND (Optional but recommended for deployment)"
fi

# 2. Check for build artifacts
echo -n "Checking for dist directory... "
if [ -d "dist" ]; then
    echo "✅"
    echo -n "  Checking for dist/client/index.html... "
    if [ -f "dist/client/index.html" ]; then
        echo "✅"
    else
        echo "❌ NOT FOUND"
    fi
else
    echo "❌ NOT FOUND (Run 'bun run build' first)"
fi

# 3. Check wrangler configuration
echo -n "Checking wrangler.jsonc assets configuration... "
ASSETS_DIR=$(grep -oP '"directory":\s*"\K[^"]+' wrangler.jsonc)
if [ "$ASSETS_DIR" == "dist/client" ]; then
    echo "✅ (Points to $ASSETS_DIR)"
else
    echo "⚠️  Currently points to '$ASSETS_DIR'. Should likely be 'dist/client'."
fi

# 4. Check for node_modules
echo -n "Checking for node_modules... "
if [ -d "node_modules" ]; then
    echo "✅"
else
    echo "❌ NOT FOUND (Run 'bun install')"
fi

# 5. Check for Bun
echo -n "Checking for bun... "
if command -v bun &> /dev/null; then
    bun --version | xargs echo -n "✅ Version: "
    echo ""
else
    echo "❌ NOT FOUND"
fi

echo "-----------------------------------"
echo "Common Fixes:"
echo "1. If site is blank: Ensure 'assets.directory' in wrangler.jsonc is 'dist/client'"
echo "2. If build fails: Run 'bun install' then 'bun run build'"
echo "3. If deployment fails: Check CLOUDFLARE_API_TOKEN in .prod.vars"
echo "-----------------------------------"
echo "Diagnostic Complete."
