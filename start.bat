@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
title Video Sunucu (CTRL+C ile kapat)

cd /d "%~dp0"

echo.
echo ================================
echo   Video Sunucu başlatılıyor
echo ================================
echo.

if not exist "node_modules" (
    echo Bağımlılıklar yükleniyor...
    call npm install
    echo.
)

echo IP adresi bulunuyor...
echo.

set IP=

for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr "IPv4"') do (
    if not defined IP (
        set IP=%%A
    )
)

set IP=!IP: =!

set QR_URL=http://!IP!:3333

echo ================================
echo   Telefonda gir:
echo   http://!IP!:3333
echo ================================
echo.
echo QR KOD (telefonla okut):
echo.

where node >nul 2>&1
if %ERRORLEVEL% equ 0 (
    node -e "require('qrcode-terminal').generate('%QR_URL%', { small: true });"
) else (
    echo Node.js bulunamadı - QR atlandı. Yukarıdaki adresi kullanın.
)

echo.
echo ================================
echo   Sunucu çalışıyor...
echo   Kapatmak için CTRL + C
echo ================================
echo.

node server.js

echo.
echo ================================
echo   Sunucu durduruldu
echo   Pencereyi kapatmak için bir tuşa basın
echo ================================
pause
