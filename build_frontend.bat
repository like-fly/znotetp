@echo off
setlocal

set "BASE_DIR=%~dp0"
for %%I in ("%BASE_DIR%.") do set "BASE_DIR=%%~fI"

set "PUBLIC_DIR=%BASE_DIR%\public"
set "DIST_DIR=%BASE_DIR%\dist"
set "FRONTEND_DIR=%BASE_DIR%\frontend"

where bun >nul 2>nul
if errorlevel 1 (
    echo [ERROR] bun was not found in PATH.
    exit /b 1
)

if exist "%PUBLIC_DIR%" rmdir /s /q "%PUBLIC_DIR%"
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%"

mkdir "%PUBLIC_DIR%\static\assets" || exit /b 1
mkdir "%PUBLIC_DIR%\static\images" || exit /b 1
mkdir "%PUBLIC_DIR%\static\vditor" || exit /b 1

pushd "%FRONTEND_DIR%" || exit /b 1
call bun run build
if errorlevel 1 (
    popd
    exit /b 1
)
popd

robocopy "%FRONTEND_DIR%\dist\static\assets" "%PUBLIC_DIR%\static\assets" /e >nul
if errorlevel 8 exit /b 1

robocopy "%FRONTEND_DIR%\public\static\images" "%PUBLIC_DIR%\static\images" /e >nul
if errorlevel 8 exit /b 1

robocopy "%FRONTEND_DIR%\public\static\vditor" "%PUBLIC_DIR%\static\vditor" /e >nul
if errorlevel 8 exit /b 1

pushd "%BASE_DIR%" || exit /b 1
call bun run output
if errorlevel 1 (
    popd
    exit /b 1
)
popd

echo [OK] Build completed.
exit /b 0
