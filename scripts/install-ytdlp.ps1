# Script: install-ytdlp.ps1
# Description: Downloads yt-dlp.exe and ffmpeg.exe for Windows
# Usage: .\scripts\install-ytdlp.ps1

$ErrorActionPreference = "Stop"

$binDir = Join-Path $PSScriptRoot "..\bin"
if (-not (Test-Path $binDir)) {
    New-Item -ItemType Directory -Path $binDir -Force | Out-Null
}

$ytdlpUrl = "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
$ytdlpPath = Join-Path $binDir "yt-dlp.exe"

Write-Host "Pobieranie yt-dlp..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $ytdlpUrl -OutFile $ytdlpPath -UseBasicParsing
    Write-Host "yt-dlp pobrany pomyslnie: $ytdlpPath" -ForegroundColor Green
} catch {
    Write-Host "Blad pobierania yt-dlp: $_" -ForegroundColor Red
    exit 1
}

$ffmpegUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$ffmpegZip = Join-Path $env:TEMP "ffmpeg.zip"

Write-Host "Pobieranie FFmpeg..." -ForegroundColor Cyan
try {
    Invoke-WebRequest -Uri $ffmpegUrl -OutFile $ffmpegZip -UseBasicParsing
    Write-Host "FFmpeg pobrany, rozpakowywanie..." -ForegroundColor Cyan

    $tempExtract = Join-Path $env:TEMP "ffmpeg_extract"
    if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }

    Expand-Archive -Path $ffmpegZip -DestinationPath $tempExtract -Force

    $ffmpegExe = Get-ChildItem -Path $tempExtract -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    if ($ffmpegExe) {
        Copy-Item $ffmpegExe.FullName -Destination (Join-Path $binDir "ffmpeg.exe") -Force
        Write-Host "FFmpeg zainstalowany pomyslnie" -ForegroundColor Green
    } else {
        Write-Host "Nie znaleziono ffmpeg.exe w archiwum" -ForegroundColor Red
    }

    Remove-Item -Recurse -Force $tempExtract -ErrorAction SilentlyContinue
    Remove-Item -Force $ffmpegZip -ErrorAction SilentlyContinue
} catch {
    Write-Host "Blad pobierania FFmpeg: $_" -ForegroundColor Red
    Write-Host "Możesz rcznie pobrac FFmpeg z: https://ffmpeg.org/download.html" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Instalacja zakonczona!" -ForegroundColor Green
Write-Host "Pliki znajduja sie w: $binDir"
