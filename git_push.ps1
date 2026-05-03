# Electonet GitHub Publisher

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Electonet GitHub Publisher" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path ".git")) {
    Write-Host "[1/4] Creating Git repository..." -ForegroundColor Yellow
    git init
    Write-Host "      Done." -ForegroundColor Green
} else {
    Write-Host "[1/4] Git repository found." -ForegroundColor Green
}

Write-Host "[2/4] Adding files..." -ForegroundColor Yellow
git add .
Write-Host "      Done." -ForegroundColor Green

Write-Host "[3/4] Committing..." -ForegroundColor Yellow
git commit -m "Electonet v3.5 - Dashboard + README + Screenshots"
Write-Host "      Done." -ForegroundColor Green

Write-Host ""
Write-Host "[4/4] Push to GitHub" -ForegroundColor Yellow
$repoUrl = Read-Host "Paste GitHub repo URL"

if ($repoUrl) {
    $remoteCheck = git remote
    if ($remoteCheck -match "origin") {
        git remote set-url origin $repoUrl
    } else {
        git remote add origin $repoUrl
    }

    Write-Host "      Pushing... (enter username & token when asked)" -ForegroundColor Yellow
    git branch -M main
    git push -u origin main

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  SUCCESS! Project is live on GitHub!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "FAILED. Use Personal Access Token, not password." -ForegroundColor Red
    }
} else {
    Write-Host "No URL. Files committed locally only." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close"
