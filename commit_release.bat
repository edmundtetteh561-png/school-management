@echo off
REM commit_release.bat — initialize git, commit all changes, tag release, create ZIP
cd /d "%~dp0"
echo Checking for git...
ngit --version >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo Git is not installed or not on PATH. Install Git and re-run this script.
  pause
  exit /b 1
)
if not exist .git (
  echo Initializing git repository...
  git init || (echo git init failed & exit /b 1)
)
git add -A
ngit commit -m "Release: admin edit/delete, teacher edit/delete for attendance & grades, inline edit, UI polish" || echo Nothing to commit or commit failed
ngit tag -a v1.0.0 -m "Release v1.0.0" || echo Tag exists or failed
necho Creating release ZIP (excluding data and node_modules)...
powershell -NoProfile -Command "Get-ChildItem -Path . -Exclude data,node_modules | Compress-Archive -DestinationPath ..\school-management-release.zip -Force" || echo ZIP creation failed
necho Done. Release: ..\school-management-release.zip
pause
