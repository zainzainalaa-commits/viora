@echo off
setlocal
title Viora - Local Preview
cd /d "%~dp0"

rem Vite prints box-drawing and arrow characters. Without UTF-8 the console
rem shows them as mojibake, which makes a healthy startup look broken.
chcp 65001 >nul 2>&1

set "PORT=1420"
set "URL=http://localhost:%PORT%/"
set "TV_URL=http://localhost:%PORT%/?formFactor=tv"

cls
echo ============================================================
echo    Viora  -  Local Preview
echo ============================================================
echo.

rem ---------------------------------------------------------- Node
where node >nul 2>&1
if errorlevel 1 (
  echo  [X]  Node.js was not found on this PC.
  echo       Install the LTS build from https://nodejs.org
  echo       then double-click this file again.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_V=%%v"
echo  [OK] Node.js %NODE_V%

rem ---------------------------------------------------------- pnpm
rem This project is locked with pnpm-lock.yaml. Installing with npm instead
rem resolves different versions and has already broken the build once, so the
rem package manager is not interchangeable here.
where pnpm >nul 2>&1
if errorlevel 1 (
  echo  [..] pnpm not found - enabling it through Corepack, which ships with Node...
  call corepack enable pnpm >nul 2>&1
  where pnpm >nul 2>&1
  if errorlevel 1 (
    echo  [X]  pnpm could not be enabled automatically.
    echo       Open a terminal once and run:   npm install -g pnpm
    echo       After that this file will work on its own.
    echo.
    pause
    exit /b 1
  )
)
for /f "delims=" %%v in ('pnpm --version 2^>nul') do set "PNPM_V=%%v"
echo  [OK] pnpm %PNPM_V%
echo.

rem ---------------------------------------------------------- already running?
rem Vite is configured with strictPort, so a second server on 1420 does not pick
rem another port - it exits with an error. If something is already serving, the
rem right move is to show it rather than fail.
call :is_port_open
if not errorlevel 1 (
  echo  [OK] A dev server is already running on port %PORT%.
  echo       Opening the browser against it instead of starting a second one.
  echo.
  start "" "%URL%"
  echo ------------------------------------------------------------
  echo    Desktop view :  %URL%
  echo    TV view      :  %TV_URL%
  echo.
  echo    This window did not start the server, so closing it
  echo    will not stop anything.
  echo ------------------------------------------------------------
  echo.
  pause
  exit /b 0
)

rem ---------------------------------------------------------- dependencies
if not exist "node_modules\" (
  echo  [..] First run - installing dependencies.
  echo       This takes a few minutes once, then never again.
  echo.
  call pnpm install
  if errorlevel 1 (
    echo.
    echo  [X]  Dependency install failed. The reason is in the output above.
    echo.
    pause
    exit /b 1
  )
  echo.
  echo  [OK] Dependencies installed.
) else (
  echo  [OK] Dependencies already present.
)
echo.

rem ---------------------------------------------------------- serve
echo  [..] Starting the dev server on port %PORT%...
echo       The browser opens by itself once the server answers.
echo.
echo ------------------------------------------------------------
echo    Desktop view :  %URL%
echo    TV view      :  %TV_URL%
echo.
echo    The TV link forces the D-pad build, so you can try the
echo    remote-control navigation with the arrow keys and Enter.
echo.
echo    Press Ctrl+C in this window to stop the server.
echo ------------------------------------------------------------
echo.

rem The waiter is a single PowerShell process rather than this script calling
rem itself. Re-invoking a .bat through start needs quotes inside quotes inside
rem quotes, and cmd's rules for unwrapping those are subtle enough that the
rem argument silently failed to arrive - the helper then fell through to the
rem main path and sat on a hidden prompt forever. One process, no nested
rem quoting, nothing to get wrong.
start "Viora browser" /min powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i = 0; $i -lt 180; $i++) { try { $c = New-Object Net.Sockets.TcpClient('localhost', %PORT%); $c.Close(); Start-Process '%URL%'; break } catch { Start-Sleep -Seconds 1 } }"

call pnpm dev
set "DEV_EXIT=%errorlevel%"

echo.
echo ------------------------------------------------------------
if "%DEV_EXIT%"=="0" (
  echo    The dev server has stopped.
) else (
  echo    The dev server exited with an error - see the output above.
  echo.
  echo    If it says the port is already in use, another copy is
  echo    still running. Close its window, or reboot if you cannot
  echo    find it, then double-click this file again.
)
echo ------------------------------------------------------------
echo.
pause
exit /b %DEV_EXIT%


rem ============================================================
rem  Returns 0 when something is listening on %PORT%.
rem
rem  The host name is passed to the constructor rather than an address to the
rem  Connect method, and that detail is the whole point: Vite binds "localhost",
rem  which on a current Windows box means IPv6 [::1] and nothing at all on
rem  127.0.0.1. A parameterless TcpClient only speaks IPv4, so it reports the
rem  port free while a server is plainly running, and the script then starts a
rem  second one that dies on "port already in use". Handing the name to the
rem  constructor lets it try every address the name resolves to - the same thing
rem  the browser does.
rem
rem  A real connect is used rather than Test-NetConnection, which spends seconds
rem  per call and would make the wait loop crawl.
rem ============================================================
:is_port_open
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $c = New-Object Net.Sockets.TcpClient('localhost', %PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%
