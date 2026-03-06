# DesignAI.dev Diagnostic PowerShell Script
# This script checks the local environment and project structure.

Write-Host "🔍 Running DesignAI Diagnostics..." -ForegroundColor Cyan

# 1. Check for required files
Write-Host -NoNewline "Checking for wrangler.jsonc... "
if (Test-Path "wrangler.jsonc") {
    Write-Host "✅" -ForegroundColor Green
}
else {
    Write-Host "❌ NOT FOUND" -ForegroundColor Red
}

Write-Host -NoNewline "Checking for package.json... "
if (Test-Path "package.json") {
    Write-Host "✅" -ForegroundColor Green
}
else {
    Write-Host "❌ NOT FOUND" -ForegroundColor Red
}

Write-Host -NoNewline "Checking for .prod.vars... "
if (Test-Path ".prod.vars") {
    Write-Host "✅" -ForegroundColor Green
}
else {
    Write-Host "❌ NOT FOUND (Optional but recommended for deployment)" -ForegroundColor Yellow
}

# 2. Check for build artifacts
Write-Host -NoNewline "Checking for dist directory... "
if (Test-Path "dist") {
    Write-Host "✅" -ForegroundColor Green
    Write-Host -NoNewline "  Checking for dist/client/index.html... "
    if (Test-Path "dist/client/index.html") {
        Write-Host "✅" -ForegroundColor Green
    }
    else {
        Write-Host "❌ NOT FOUND" -ForegroundColor Red
    }
}
else {
    Write-Host "❌ NOT FOUND (Run 'bun run build' first)" -ForegroundColor Red
}

# 3. Check wrangler configuration
Write-Host -NoNewline "Checking wrangler.jsonc assets configuration... "
$content = [System.IO.File]::ReadAllText("wrangler.jsonc")
if ($content -match '"directory":\s*"([^"]+)"') {
    $assetsDir = $Matches[1]
    if ($assetsDir -eq "dist/client") {
        Write-Host "✅ (Points to $assetsDir)" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Currently points to '$assetsDir'. Should likely be 'dist/client'." -ForegroundColor Yellow
    }
}
else {
    Write-Host "❌ Could not find assets directory configuration" -ForegroundColor Red
}

# 4. Check for node_modules
Write-Host -NoNewline "Checking for node_modules... "
if (Test-Path "node_modules") {
    Write-Host "✅" -ForegroundColor Green
}
else {
    Write-Host "❌ NOT FOUND (Run 'bun install')" -ForegroundColor Red
}

# 5. Check for Bun
Write-Host -NoNewline "Checking for bun... "
try {
    $bunVersion = (& bun --version)
    Write-Host "✅ Version: $bunVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ NOT FOUND" -ForegroundColor Red
}

Write-Host "-----------------------------------" -ForegroundColor Blue
Write-Host "Common Fixes:"
Write-Host "1. If site is blank: Ensure 'assets.directory' in wrangler.jsonc is 'dist/client'"
Write-Host "2. If build fails: Run 'bun install' then 'bun run build'"
Write-Host "3. If deployment fails: Check CLOUDFLARE_API_TOKEN in .prod.vars"
Write-Host "-----------------------------------" -ForegroundColor Blue
Write-Host "Diagnostic Complete." -ForegroundColor Cyan
