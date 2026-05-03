# Electonet Project Zipping Script
# This script creates a clean zip file for sharing, excluding sensitive data and node_modules.

$projectName = "electonet-clean-v3.5.zip"
$sourceDir = Get-Location
$tempDir = New-Item -ItemType Directory -Path "$env:TEMP\electonet_build" -Force

Write-Host "🚀 Preparing clean build for Electonet..." -ForegroundColor Cyan

# Copy files excluding sensitive ones
Copy-Item -Path "$sourceDir\*" -Destination $tempDir -Recurse -Exclude "node_modules", ".credentials.json", "operations.log", ".git", ".gemini", "*.zip", "*.log", "zip_project.ps1" -Force

# Create the zip
if (Test-Path $projectName) { Remove-Item $projectName }
Compress-Archive -Path "$tempDir\*" -DestinationPath "$sourceDir\$projectName"

# Cleanup
Remove-Item $tempDir -Recurse -Force

Write-Host "✅ Done! Your clean project is ready: $projectName" -ForegroundColor Green
Write-Host "📦 You can now send this file to your server or share it." -ForegroundColor Yellow
