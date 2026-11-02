@echo off
rem Builds release\KhataDesk-Setup-1.0.0.exe. Run this on Windows 10 or 11.
rem Needs: Node.js 20+, Python 3.11+ and Inno Setup 6 (https://jrsoftware.org/isdl.php).
setlocal
cd /d "%~dp0"

echo === 1/3 Building the interface
cd frontend
call npm install || goto :fail
call npm run build || goto :fail
cd ..

echo === 2/3 Bundling Python and the server
cd backend
if not exist .venv python -m venv .venv || goto :fail
call .venv\Scripts\activate || goto :fail
pip install -r requirements.txt -r requirements-build.txt || goto :fail
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
pyinstaller --noconfirm KhataDesk.spec || goto :fail
cd ..

echo === 3/3 Creating the installer
set ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" set ISCC=%ProgramFiles%\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" set ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe
if not exist "%ISCC%" (echo Inno Setup 6 was not found. Install it, then run this again. & goto :fail)
"%ISCC%" packaging\KhataDesk.iss || goto :fail

echo.
echo Done. Your installer is in the release folder.
exit /b 0
:fail
echo.
echo Build failed. Read the message above.
exit /b 1
